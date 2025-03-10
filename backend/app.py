"""
app.py

Flask backend for handling Google OAuth, database updates, and calendar integration
"""

import os
import json
import secrets
from datetime import datetime
import jwt
from dotenv import load_dotenv

import firebase_admin
from firebase_admin import credentials, firestore
from flask import Flask, redirect, url_for, session, request, jsonify
from flask_cors import CORS
from google.auth.transport.requests import Request
from google.oauth2 import id_token
from google.oauth2.credentials import Credentials
from google.cloud.firestore import DELETE_FIELD
from google.cloud.firestore_v1.base_query import FieldFilter
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from event import Event
from helpers import get_user_email, get_user_credentials, get_id

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
PORT = os.getenv("PORT", "8080")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# getting relevant keys
app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "supersecretkey")
CORS(app, supports_credentials=True, origins=[FRONTEND_URL, f"{FRONTEND_URL}/map"])

app.config["GOOGLE_CLIENT_ID"] = os.getenv("GOOGLE_CLIENT_ID", "your-client-id")

app.config["GOOGLE_CLIENT_SECRET"] = os.getenv(
    "GOOGLE_CLIENT_SECRET", "your-client-secret"
)
app.config["GOOGLE_REDIRECT_URI"] = os.getenv(
    "GOOGLE_REDIRECT_URI", f"{BACKEND_URL}/authorize"
)

app.config.update(
    SESSION_COOKIE_SAMESITE="None",
    SESSION_COOKIE_SECURE=True,
)

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "supersecurejwtkey")
service_account_path = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "slug-events-firebase-key.json"
)

if os.path.exists(service_account_path):
    cred = credentials.Certificate(service_account_path)
    print("Using service account key file.")
else:
    firebase_key = os.getenv("FIREBASE_KEY")
    assert firebase_key
    cred = credentials.Certificate(json.loads(firebase_key))
    print("Using Google Cloud default credentials.")

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


# if FRONTEND_URL is localhost http connection
if FRONTEND_URL[:4] != "https":
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

def create_calendar_event(event, credentials_dict):
    """Creates Google Calendar event from RSVP"""
    calendar_credentials = Credentials(
        token=credentials_dict.get('token'),
        refresh_token=credentials_dict.get('refresh_token'),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=app.config["GOOGLE_CLIENT_ID"],
        client_secret=app.config["GOOGLE_CLIENT_SECRET"],
    )

    service = build('calendar', 'v3', credentials=calendar_credentials)

    event_body = {
        'summary': event.title,
        'description': event.description,
        'start': {
            'dateTime': event.start_time.isoformat(),
            'timeZone': 'UTC',
        },
        'end': {
            'dateTime': event.end_time.isoformat(),
            'timeZone': 'UTC',
        },
        'location': event.address,
        'reminders': {
            'useDefault': False,
            'overrides': [
                {'method': 'email', 'minutes': 24 * 60},
                {'method': 'popup', 'minutes': 60},
            ],
        },
    }

    try:
        calendar_event = service.events().insert(
            calendarId='primary',
            body=event_body
        ).execute()
        return calendar_event['id']
    except Exception as e:
        print(f"Error creating calendar event: {e}")
        return None

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
    # print(flow.credentials)
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

    # Store both user info and Google credentials in JWT token
    jwt_token = jwt.encode(
        {
            "user": {
                "name": id_info.get("name"),
                "email": id_info.get("email"),
                "picture": id_info.get("picture"),
            },
            "credentials": {
                "token": auth_creds.token,
                "refresh_token": auth_creds.refresh_token,
                "token_uri": auth_creds.token_uri,
                "client_id": auth_creds.client_id,
                "client_secret": auth_creds.client_secret,
            }
        },
        SECRET_KEY,
        algorithm="HS256",
    )

    next_url = session.pop("next", "/")
    return redirect(f"{next_url}?token={jwt_token}")

@app.route("/logout")
def logout():
    """Endpoint for clearing users authorization cookie"""
    session.clear()
    response = redirect(url_for("/index"))
    response.set_cookie("session", "", expires=0)
    return response

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
    """Endpoint for removing user from rsvp list without removing from calendar"""
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

@app.route("/add_to_calendar/<event_id>", methods=["POST"])
def add_to_calendar(event_id):
    """Endpoint for adding event to Google Calendar"""
    user_email = get_user_email()
    if not user_email:
        return jsonify({"error": "Unauthorized"}), 401

    event = Event.get(event_id, db)
    if not event:
        return jsonify({"error": "Event not found"}), 404

    user_creds = get_user_credentials()
    if not user_creds:
        return jsonify({"error": "Calendar authorization required"}), 401

    calendar_event_id = create_calendar_event(event, user_creds)
    if not calendar_event_id:
        return jsonify({"error": "Failed to create calendar event"}), 500

    safe_email = user_email.replace('@', '_at_').replace('.', '_dot_')

    event_ref = db.collection("events").document(event_id)
    event_ref.update({
        f"calendar_events.{safe_email}": calendar_event_id
    })

    return jsonify({
        "message": "Event added to calendar successfully",
        "calendarEventId": calendar_event_id
    }), 200

@app.route("/remove_from_calendar/<event_id>", methods=["DELETE"])
def remove_event_from_calendar(event_id):
    """Endpoint for removing an event from user's Google Calendar"""
    user_email = get_user_email()
    if not user_email:
        return jsonify({"error": "Unauthorized"}), 401

    event = Event.get(event_id, db)
    if not event:
        return jsonify({"error": "Event not found"}), 404

    user_creds = get_user_credentials()
    if not user_creds:
        return jsonify({"error": "Calendar authorization required"}), 401

    try:
        calendar_credentials = Credentials(
            token=user_creds.get('token'),
            refresh_token=user_creds.get('refresh_token'),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=app.config["GOOGLE_CLIENT_ID"],
            client_secret=app.config["GOOGLE_CLIENT_SECRET"],
        )

        service = build('calendar', 'v3', credentials=calendar_credentials)

        safe_email = user_email.replace('@', '_at_').replace('.', '_dot_')

        event_ref = db.collection("events").document(event_id)
        event_doc = event_ref.get()

        if not event_doc.exists:
            return jsonify({"error": "Event not found in database"}), 404

        calendar_events = event_doc.to_dict().get('calendar_events', {})
        calendar_event_id = calendar_events.get(safe_email)

        if not calendar_event_id:
            return jsonify({"error": "No calendar event found for this user"}), 404

        service.events().delete(
            calendarId='primary',
            eventId=calendar_event_id
        ).execute()

        event_ref.update({
            f"calendar_events.{safe_email}": DELETE_FIELD
        })

        return jsonify({"message": "Event removed from calendar successfully"}), 200

    except Exception as e:
        print(f"Error removing calendar event: {e}")
        return jsonify({"error": f"Failed to remove calendar event: {str(e)}"}), 500


if __name__ == "__main__":
    # app.run(debug=True, host="0.0.0.0", port=int(PORT))
    app.run(debug=True, host="localhost", port=8080)
