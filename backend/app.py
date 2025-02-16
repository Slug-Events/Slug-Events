"""
app.py

Flask backend for handling Google OAuth, database updates
"""

import os
import secrets
from datetime import datetime
import jwt
import firebase_admin
from flask import Flask, redirect, url_for, session, request, jsonify
from flask_cors import CORS
from google.oauth2 import id_token
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from dotenv import load_dotenv
from firebase_admin import credentials, firestore

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "supersecretkey")
CORS(app, supports_credentials=True, origins=["http://localhost:3000"])

app.config["GOOGLE_CLIENT_ID"] = os.getenv("GOOGLE_CLIENT_ID", "your-client-id")
app.config["GOOGLE_CLIENT_SECRET"] = os.getenv("GOOGLE_CLIENT_SECRET", "your-client-secret")
app.config["GOOGLE_REDIRECT_URI"] = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8080/authorize")
app.config.update(
    SESSION_COOKIE_SAMESITE="None",
    SESSION_COOKIE_SECURE=True,
)

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "supersecurejwtkey")

# Initialize Firebase Admin SDK
cred = credentials.Certificate(os.path.join(os.path.dirname(os.path.abspath(__file__)), "slug-events-firebase-key.json"))
firebase_admin.initialize_app(cred)
db = firestore.client()

class Event:
    """Class for event object"""
    def __init__(self, title: str, description: str, startTime, endTime, location, category: str, address="", capacity=None, age_limit=None, ownerEmail=None, id=None) -> None:
        self.id = id
        self.title = title
        self.description = description
        self.startTime = startTime
        self.endTime = endTime
        self.address = address
        self.location = location
        self.category = category
        self.capacity = capacity
        self.age_limit = age_limit
        self.ownerEmail = ownerEmail
        self.createdAt = datetime.now()
        self.status = "active"

    def to_dict(self):
        """Returns event information in dictionary"""
        return {
            "title": self.title,
            "description": self.description,
            "startTime": self.startTime,
            "endTime": self.endTime,
            "address": self.address,
            "location": self.location,
            "category": self.category,
            "capacity": self.capacity,
            "age_limit": self.age_limit,
            "ownerEmail": self.ownerEmail,
            "createdAt": self.createdAt,
            "status": self.status
        }

    def create(self):
        """Creates event in database"""
        event_ref = db.collection("events").document()
        self.id = event_ref.id
        event_ref.set(self.to_dict())
        return event_ref

    @classmethod
    def get(cls, event_id):
        """Creates event object from existing event in database"""
        doc_ref = db.collection("events").document(event_id)
        doc = doc_ref.get()
        if doc.exists:
            data = doc.to_dict()
            event = Event(
                title=data["title"],
                description=data["description"],
                startTime=data["startTime"],
                endTime=data["endTime"],
                address=data.get("address"),
                location=data["location"],
                category=data["category"],
                capacity=data.get("capacity"),
                age_limit=data.get("age_limit"),
                id=event_id,
                ownerEmail=data["ownerEmail"]
            )
            return event
        return None

    def update(self):
        """Updates existing event in database"""
        if not self.id:
            raise ValueError("Event ID required for update")
        db.collection("events").document(self.id).set(self.to_dict(), merge=True)

    def delete(self):
        """Deletes existing event in database"""
        try:
            event_ref = db.collection("events").document(self.id)
            event_ref.delete()
            return jsonify({"message": "Event deleted successfully"}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    def rsvp_add(self, user_email: str):
        """Adds a user to rsvp list in existing event"""
        rsvp_ref = db.collection("events").document(self.id).collection("rsvps").document(user_email)
        rsvp_ref.set({
            "email": user_email,
            "timestamp": datetime.now(),
            "status": "confirmed"
        })

    def rsvp_remove(self, user_email: str):
        """Removes a user from the rsvp list in existing event"""
        rsvp_ref = db.collection("events").document(self.id).collection("rsvps").document(user_email)
        rsvp_ref.delete()

    def get_rsvps(self):
        """Gets list of users in rsvp list of an existing event"""
        return [doc.id for doc in db.collection("events").document(self.id).collection("rsvps").stream()]

def get_google_flow():
    """Gets google login flow using env variables"""
    return Flow.from_client_config(
        {
            "web": {
                "client_id": app.config["GOOGLE_CLIENT_ID"],
                "client_secret": app.config["GOOGLE_CLIENT_SECRET"],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [app.config["GOOGLE_REDIRECT_URI"]],
            }
        },
        scopes=[
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "openid",
        ],
    )

def decode_jwt_token(token):
    """Decodes authorization cookie"""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except Exception:
        return None

def authenticate_request():
    """Authenticates cookie from user"""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ")[1]
    return decode_jwt_token(token)

def validate_event_data(event_data):
    """Validates event data coming from frontend"""
    required_fields = ["title", "description", "startTime", "endTime", "location"]
    missing_fields = [field for field in required_fields if field not in event_data]
    if missing_fields:
        return jsonify({"error": f'Missing required fields: {", ".join(missing_fields)}'}), 400

    try:
        start_time = datetime.fromisoformat(event_data["startTime"])
        end_time = datetime.fromisoformat(event_data["endTime"])
        if end_time <= start_time:
            return jsonify({"error": "End time must be after start time"}), 400
    except ValueError as e:
        return jsonify({"error": f"Invalid date format: {str(e)}"}), 400

    try:
        assert "location" in event_data
        assert "latitude" in event_data["location"]
        assert "longitude" in event_data["location"]
    except (KeyError, TypeError):
        return jsonify({"error": "Invalid location format"}), 400

    return None

os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

@app.route("/login")
def login():
    """login endpoint"""
    next_url = request.args.get("next", "/")
    session["next"] = next_url
    session["nonce"] = secrets.token_urlsafe(16)

    flow = get_google_flow()
    flow.redirect_uri = app.config["GOOGLE_REDIRECT_URI"]

    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        state=session["nonce"],
    )
    session["state"] = state
    return redirect(authorization_url)

@app.route("/authorize")
def authorize():
    """Google OAuth endpoint"""
    state = session.pop("state", None)
    if not state or state != request.args.get("state"):
        return "Invalid state parameter", 400

    nonce = session.pop("nonce", None)
    if not nonce:
        return "Session expired or nonce missing", 400

    flow = get_google_flow()
    flow.redirect_uri = app.config["GOOGLE_REDIRECT_URI"]

    flow.fetch_token(authorization_response=request.url)
    auth_creds = flow.credentials

    try:
        id_info = id_token.verify_oauth2_token(
            auth_creds.id_token, Request(), app.config["GOOGLE_CLIENT_ID"], clock_skew_in_seconds=10
        )
    except ValueError as e:
        return f"Failed to verify ID token: {str(e)}", 400

    session["user"] = {
        "name": id_info.get("name"),
        "email": id_info.get("email"),
        "picture": id_info.get("picture"),
    }
    jwt_token = jwt.encode(
        {
            "user": {
                "name": id_info.get("name"),
                "email": id_info.get("email"),
                "picture": id_info.get("picture"),
            },
        },
        SECRET_KEY,
        algorithm="HS256",
    )

    next_url = session.pop("next", "/")
    return redirect(f"{next_url}?token={jwt_token}")

@app.route("/create_event", methods=["POST"])
def create_event():
    """Endpoint for creating an event"""
    decoded = authenticate_request()
    if not decoded:
        return jsonify({"error": "Unauthorized"}), 401

    event_data = request.get_json()
    validation_error = validate_event_data(event_data)
    if validation_error:
        return validation_error

    user_email = decoded["user"]["email"]
    event = Event(
        title=event_data["title"],
        description=event_data["description"],
        startTime=datetime.fromisoformat(event_data["startTime"]),
        endTime=datetime.fromisoformat(event_data["endTime"]),
        address=event_data.get("address"),
        location={
            "latitude": event_data["location"]["latitude"],
            "longitude": event_data["location"]["longitude"],
        },
        category=event_data.get("category"),
        capacity=event_data.get("capacity"),
        age_limit=event_data.get("age_limit"),
        ownerEmail=user_email
    )

    event_ref = event.create()
    doc = event_ref.get()

    return jsonify({
        "message": "Event created successfully",
        "eventId": event_ref.id,
        "firestoreData": doc.to_dict()
    }), 201

@app.route("/update_event", methods=["POST"])
def update_event():
    """Endpoint for updating an existing event"""
    decoded = authenticate_request()
    if not decoded:
        return jsonify({"error": "Unauthorized"}), 401

    event_data = request.get_json()
    event_id = event_data.get("eventId")
    if not event_id:
        return jsonify({"error": "Missing event ID"}), 400

    event = Event.get(event_id)
    if not event:
        return jsonify({"error": "Event not found"}), 404

    user_email = decoded["user"]["email"]
    if event.ownerEmail != user_email:
        return jsonify({"error": "Unauthorized to update this event"}), 403

    event.title = event_data.get("title", event.title)
    event.description = event_data.get("description", event.description)
    event.address = event_data.get("address", event.address)
    event.category = event_data.get("category", event.category)
    event.capacity = event_data.get("capacity", event.capacity)
    event.age_limit = event_data.get("age_limit", event.age_limit)

    if "startTime" in event_data:
        event.startTime = datetime.fromisoformat(event_data["startTime"])
    if "endTime" in event_data:
        event.endTime = datetime.fromisoformat(event_data["endTime"])
    if "location" in event_data:
        try:
            event.location = {
                "latitude": event_data["location"]["latitude"],
                "longitude": event_data["location"]["longitude"],
            }
        except (KeyError, TypeError):
            return jsonify({"error": "Invalid location format"}), 400

    event.id = event_id
    event.update()
    return jsonify({"message": "Event updated successfully"}), 200

@app.route("/delete_event/<event_id>", methods=["DELETE"])
def delete_event(event_id):
    """Endpoint for deleting an existing event"""
    decoded = authenticate_request()
    if not decoded:
        return jsonify({"error": "Unauthorized"}), 401

    event = Event.get(event_id)
    if not event:
        return jsonify({"error": "Event not found"}), 404

    user_email = decoded["user"]["email"]
    if event.ownerEmail != user_email:
        return jsonify({"error": "Unauthorized to delete this event"}), 403

    event.delete()
    return jsonify({"message": "Event deleted successfully"}), 200

@app.route("/rsvp/<event_id>", methods=["POST"])
def rsvp_event(event_id):
    """Endpoint for rsvping a user to an existing event"""
    decoded = authenticate_request()
    if not decoded:
        return jsonify({"error": "Unauthorized"}), 401

    event = Event.get(event_id)
    if not event:
        return jsonify({"error": "Event not found"}), 404

    user_email = decoded["user"]["email"]
    event.id = event_id
    event.rsvp_add(user_email)
    return jsonify({"message": "RSVP successful"}), 200

@app.route("/unrsvp/<event_id>", methods=["DELETE"])
def unrsvp_event(event_id):
    """Endpoint for removing user from rsvp list of an existing event"""
    decoded = authenticate_request()
    if not decoded:
        return jsonify({"error": "Unauthorized"}), 401

    event = Event.get(event_id)
    if not event:
        return jsonify({"error": "Event not found"}), 404

    user_email = decoded["user"]["email"]
    event.id = event_id
    event.rsvp_remove(user_email)
    return jsonify({"message": "RSVP removed successfully"}), 200

@app.route("/rsvps/<event_id>", methods=["GET"])
def get_event_rsvps(event_id):
    """Endpoint for retrieving rsvp list of an existing event"""
    decoded = authenticate_request()
    if not decoded:
        return jsonify({"error": "Unauthorized"}), 401

    event = Event.get(event_id)
    if not event:
        return jsonify({"error": "Event not found"}), 404

    event.id = event_id
    rsvps = event.get_rsvps()
    return jsonify(rsvps), 200

@app.route("/state")
def get_state():
    """Endpoint to retrieve map state from db"""
    try:
        state = {"events": []}
        events = db.collection("events").stream()
        for event in events:
            event_obj = event.to_dict()
            event_obj["eventId"] = event.id
            state["events"].append(event_obj)
        return jsonify({"status": 200, "state": state})

    except Exception as e:
        print(e)
        return jsonify({"status": 500, "error": str(e)}), 500

@app.route("/logout")
def logout():
    """Endpoint for clearing users authorization cookie"""
    session.clear()
    response = redirect(url_for("/index"))
    response.set_cookie("session", "", expires=0)
    return response

if __name__ == "__main__":
    app.run(debug=True, host="localhost", port=8080)