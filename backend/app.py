"""
app.py

Flask backend for handling Google OAuth, database updates
"""

import os
import secrets
from datetime import datetime, timezone, timedelta
import jwt
import firebase_admin
from flask import Flask, redirect, url_for, session, request, jsonify
from flask_cors import CORS
from google.oauth2 import id_token
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from dotenv import load_dotenv
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from event import Event
from helpers import get_user_email, get_id


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
            "https://www.googleapis.com/auth/calendar",
            "openid"
        ],
    )


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
    event = Event.request_to_event(db)
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
    old_event = Event.get(event_id, db)
    updated_event = Event.request_to_event(db)
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

    event = Event.get(event_id, db)
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

    event = Event.get(event_id, db)
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

    event = Event.get(event_id, db)
    if not event:
        return jsonify({"error": "Event not found"}), 404

    event.event_id = event_id
    event.rsvp_remove(user_email)
    return jsonify({"message": "RSVP removed successfully"}), 200


@app.route("/rsvps/<event_id>", methods=["GET"])
def get_event_rsvps(event_id):
    """Endpoint for retrieving rsvp list of an existing event"""

    event = Event.get(event_id, db)
    if not event:
        return jsonify({"error": "Event not found"}), 404

    event.event_id = event_id
    rsvps = event.get_rsvps()
    return jsonify(rsvps), 200

@app.route("/filter_events/<option>", methods=["GET"])
def filter_events(option):
    """Endpoint for filtering displayed events by category"""
    try:
        print("FILTER OPTION:", option)
        state = {"events":[]}
        events = (
            db.collection("events")
            .where(filter=FieldFilter("status", "==", "active"))
            .stream())
        for event in events:
            if is_expired(event):  # Skip expired events
                continue
            event_obj = event.to_dict()
            if event_obj.get("category") == option:
                event_obj["eventId"] = event.id
                state["events"].append(event_obj)
        return jsonify({"status": 200, "state": state})
    except Exception as e:
        print(e)
        return jsonify({"status": 500, "error": str(e)}), 500

@app.route("/filter_times/<time>", methods=["GET"])
def filter_times(time):
    """Endpoint for filtering displayed events by times"""
    try:
        print("FILTER OPTION:", time)
        dt_object = datetime.strptime(time, "%Y-%m-%dT%H:%M")
        current_time = int(dt_object.timestamp())
        state = {"events":[]}
        events = (
            db.collection("events")
            .where(filter=FieldFilter("status", "==", "active"))
            .stream())
        for event in events:
            if is_expired(event):  # Skip expired events
                continue
            event_obj = event.to_dict()
            start_time_obj = event_obj.get("startTime")
            end_time_obj = event_obj.get("endTime")
            start_time = int(start_time_obj.timestamp())
            end_time = int(end_time_obj.timestamp())
            if start_time < current_time < end_time:
                event_obj["eventId"] = event.id
                state["events"].append(event_obj)
        return jsonify({"status": 200, "state": state})
    except Exception as e:
        print(e)
        return jsonify({"status": 500, "error": str(e)}), 500

def is_expired(event):
    """Checks if an event is expired and updates Firestore if necessary."""
    event_obj = event.to_dict()
    current_time = int(datetime.now().timestamp())
    end_time_obj = event_obj.get("endTime")
    if not end_time_obj:
        return False 
    end_time = int(end_time_obj.timestamp())
    if end_time < current_time:
        event_ref = db.collection("events").document(event.id)
        event_ref.update({"status": "expired"})  # Update Firestore
        print(f"Event {event.id} marked as expired.")
        return True  # Return True to indicate event is expired
    return False  # Event is still active

@app.route("/state")
def get_state():
    """Endpoint to retrieve map state from Firestore."""
    try:
        state = {"events": []}
        events = (
            db.collection("events")
            .where(filter=FieldFilter("status", "==", "active"))
            .stream())
        for event in events:
            if is_expired(event):  # check if event recenlt expired
                continue
            event_obj = event.to_dict()
            event_obj["eventId"] = event.id
            state["events"].append(event_obj)
        return jsonify({"status": 200, "state": state})
    except Exception as e:
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
