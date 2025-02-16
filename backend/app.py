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
from typing import Optional, Dict

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "supersecretkey")
CORS(app, supports_credentials=True, origins=["http://localhost:3000"])

app.config["GOOGLE_CLIENT_ID"] = os.getenv("GOOGLE_CLIENT_ID", "your-client-id")
app.config["GOOGLE_CLIENT_SECRET"] = os.getenv(
    "GOOGLE_CLIENT_SECRET", "your-client-secret"
)
app.config["GOOGLE_REDIRECT_URI"] = os.getenv(
    "GOOGLE_REDIRECT_URI", "http://localhost:8080/authorize"
)
app.config.update(
    SESSION_COOKIE_SAMESITE="None",
    SESSION_COOKIE_SECURE=True,
)

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "supersecurejwtkey")

# Initialize Firebase Admin SDK
cred = credentials.Certificate(
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "slug-events-firebase-key.json"
    )
)
firebase_admin.initialize_app(cred)
db = firestore.client()


class Event:
    """Class for event object"""

    def __init__(
        self,
        title: str,
        description: str,
        start_time: datetime,
        end_time: datetime,
        location: Dict[str,str],
        category: str,
        owner_email: str,
        address: str="",
        capacity: Optional[int] = None,
        age_limit: Optional[int] = None,
        event_id: Optional[str] = None,
    ) -> None:
        self.event_id = event_id
        self.title = title
        self.description = description
        self.start_time = start_time
        self.end_time = end_time
        self.address = address
        self.location = location
        self.category = category
        self.capacity = capacity
        self.age_limit = age_limit
        self.owner_email = owner_email
        self.created_at = datetime.now()
        self.status = "active"

    def to_dict(self):
        """Returns event information in dictionary"""
        return {
            "title": self.title,
            "description": self.description,
            "startTime": self.start_time,
            "endTime": self.end_time,
            "address": self.address,
            "location": self.location,
            "category": self.category,
            "capacity": self.capacity,
            "age_limit": self.age_limit,
            "ownerEmail": self.owner_email,
            "createdAt": self.created_at,
            "status": self.status,
        }
    def create(self):
        """Creates event in database"""
        event_ref = db.collection("events").document()
        self.event_id = event_ref.id
        event_ref.set(self.to_dict())
        return event_ref

    @classmethod
    def request_to_event(cls):
        """Creates event object from request"""
        event_data = request.get_json()
        validation_error = validate_event_data(event_data)
        if validation_error:
            return validation_error
        user_email = get_user_email()
        assert user_email
        
        event = Event(
            title=event_data["title"],
            description=event_data["description"],
            start_time=datetime.fromisoformat(event_data["startTime"]),
            end_time=datetime.fromisoformat(event_data["endTime"]),
            address=event_data.get("address"),
            location={
                "latitude": event_data["location"]["latitude"],
                "longitude": event_data["location"]["longitude"],
            },
            category=event_data.get("category"),
            capacity=event_data.get("capacity"),
            age_limit=event_data.get("age_limit"),
            owner_email=user_email
        )
        return event

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
                start_time=data["startTime"],
                end_time=data["endTime"],
                address=data.get("address"),
                location=data["location"],
                category=data["category"],
                capacity=data.get("capacity"),
                age_limit=data.get("age_limit"),
                event_id=event_id,
                owner_email=data["ownerEmail"],
            )
            return event
        return None

    def update(self, event_id):
        """Updates existing event in database"""
        db.collection("events").document(event_id).set(self.to_dict(), merge=True)

    def delete(self):
        """Deletes existing event in database"""
        try:
            event_ref = db.collection("events").document(self.event_id)
            event_ref.delete()
            return jsonify({"message": "Event deleted successfully"}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    def rsvp_add(self, user_email: str):
        """Adds a user to rsvp list in existing event"""
        rsvp_ref = (
            db.collection("events")
            .document(self.event_id)
            .collection("rsvps")
            .document(user_email)
        )
        rsvp_ref.set(
            {"email": user_email, "timestamp": datetime.now(), "status": "confirmed"}
        )

    def rsvp_remove(self, user_email: str):
        """Removes a user from the rsvp list in existing event"""
        rsvp_ref = (
            db.collection("events")
            .document(self.event_id)
            .collection("rsvps")
            .document(user_email)
        )
        rsvp_ref.delete()

    def get_rsvps(self):
        """Gets list of users in rsvp list of an existing event"""
        return [
            doc.id
            for doc in db.collection("events")
            .document(self.event_id)
            .collection("rsvps")
            .stream()
        ]


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

def get_user_email():
    """Gets user email from request"""
    decoded = authenticate_request()
    if not decoded:
        return ""
    user_email = decoded["user"]["email"]
    return user_email


def get_id():
    """gets event id from request"""
    event_data = request.get_json()
    validation_error = validate_event_data(event_data)
    if validation_error:
        return validation_error
    event_id = event_data.get("eventId")
    if not event_id:
        return jsonify({"error": "Missing event ID"}), 400
    return event_id

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
        return (
            jsonify({"error": f'Missing required fields: {", ".join(missing_fields)}'}),
            400,
        )

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
            auth_creds.id_token,
            Request(),
            app.config["GOOGLE_CLIENT_ID"],
            clock_skew_in_seconds=10,
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
    event = Event.request_to_event()
    assert isinstance(event, Event)

    event_ref = event.create()
    doc = event_ref.get()

    return (
        jsonify(
            {
                "message": "Event created successfully",
                "eventId": event_ref.id,
                "firestoreData": doc.to_dict(),
            }
        ),
        201,
    )


@app.route("/update_event", methods=["POST"])
def update_event():
    """Endpoint for updating an existing event"""
    event_id = get_id()
    old_event = Event.get(event_id)
    updated_event = Event.request_to_event()
    assert isinstance(updated_event, Event)

    if not old_event:
        return jsonify({"error": "Event not found"}), 404

    if old_event.owner_email != updated_event.owner_email:
        return jsonify({"error": "Unauthorized to update this event"}), 403

    updated_event.update(event_id)
    return jsonify({"message": "Event updated successfully"}), 200


@app.route("/delete_event/<event_id>", methods=["DELETE"])
def delete_event(event_id):
    """Endpoint for deleting an existing event"""
    user_email = get_user_email()
    if not user_email:
        return jsonify({"error": "Unauthorized"}), 401

    event = Event.get(event_id)
    if not event:
        return jsonify({"error": "Event not found"}), 404

    if event.owner_email != user_email:
        return jsonify({"error": "Unauthorized to delete this event"}), 403

    event.delete()
    return jsonify({"message": "Event deleted successfully"}), 200


@app.route("/rsvp/<event_id>", methods=["POST"])
def rsvp_event(event_id):
    """Endpoint for rsvping a user to an existing event"""
    user_email = get_user_email()
    if not user_email:
        return jsonify({"error": "Unauthorized"}), 401

    event = Event.get(event_id)
    if not event:
        return jsonify({"error": "Event not found"}), 404

    event.event_id = event_id
    event.rsvp_add(user_email)
    return jsonify({"message": "RSVP successful"}), 200


@app.route("/unrsvp/<event_id>", methods=["DELETE"])
def unrsvp_event(event_id):
    """Endpoint for removing user from rsvp list of an existing event"""
    user_email = get_user_email()
    if not user_email:
        return jsonify({"error": "Unauthorized"}), 401

    event = Event.get(event_id)
    if not event:
        return jsonify({"error": "Event not found"}), 404

    event.event_id = event_id
    event.rsvp_remove(user_email)
    return jsonify({"message": "RSVP removed successfully"}), 200


@app.route("/rsvps/<event_id>", methods=["GET"])
def get_event_rsvps(event_id):
    """Endpoint for retrieving rsvp list of an existing event"""

    event = Event.get(event_id)
    if not event:
        return jsonify({"error": "Event not found"}), 404

    event.event_id = event_id
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
