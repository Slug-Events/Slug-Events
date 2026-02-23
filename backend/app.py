"""
app.py

Flask backend for handling Google OAuth, database updates, and calendar integration
"""

import os
import secrets
import hashlib
import threading
from datetime import datetime
from time import sleep
import jwt
from dotenv import load_dotenv
from dateutil import parser as date_parser

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
from event_scraper import scrape_upcoming_events, ScraperError
from firebase_db import get_db
from helpers import get_user_email, get_user_credentials, get_id

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
PORT = os.getenv("PORT", "8080")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

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

db = get_db()
SCRAPED_SOURCE = os.getenv("SCRAPED_SOURCE_NAME", "external_upcoming_events")
SCRAPED_OWNER_EMAIL = "system@slug-events.local"
SCRAPED_DEFAULT_COORDS = {"latitude": 36.9741, "longitude": -122.0308}
AUTO_SYNC_ENABLED = os.getenv("AUTO_SYNC_ENABLED", "1") == "1"
AUTO_SYNC_INTERVAL_SECONDS = int(os.getenv("AUTO_SYNC_INTERVAL_SECONDS", "3600"))
_auto_sync_thread = None
_auto_sync_lock = threading.Lock()

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


if FRONTEND_URL[:4] != "https" and BACKEND_URL[:4] != "https":
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

def _is_expired_event_obj(event_obj):
    """Returns True if event endTime is in the past."""
    current_time = int(datetime.now().timestamp())
    end_time_obj = event_obj.get("endTime")
    if not end_time_obj:
        return False
    end_time = int(end_time_obj.timestamp())
    return end_time < current_time

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

def _parse_scraped_datetime(value):
    """Parse datetime from scraped text/ISO value."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return date_parser.isoparse(value)
    except (ValueError, TypeError):
        return None

def _scraped_doc_id(event_payload):
    """Create a stable doc id so scraping updates existing docs instead of duplicating."""
    unique_parts = [
        event_payload.get("url") or "",
        event_payload.get("title") or "",
        event_payload.get("startTime") or "",
    ]
    unique_string = "|".join(unique_parts)
    hashed = hashlib.sha1(unique_string.encode("utf-8")).hexdigest()[:24]
    return f"scraped_{hashed}"

def _scraped_event_to_firestore(raw_event):
    """Map scraped event payload into the project's Firestore event schema."""
    title = (raw_event.get("title") or "").strip()
    if not title:
        return None

    start_time = _parse_scraped_datetime(raw_event.get("startTime"))
    if not start_time:
        return None

    end_time = _parse_scraped_datetime(raw_event.get("endTime")) or start_time
    if end_time < start_time:
        end_time = start_time

    location = raw_event.get("location") or {}
    latitude = location.get("latitude")
    longitude = location.get("longitude")

    try:
        latitude = float(latitude) if latitude is not None else None
        longitude = float(longitude) if longitude is not None else None
    except (TypeError, ValueError):
        latitude = None
        longitude = None

    if latitude is None or longitude is None:
        latitude = SCRAPED_DEFAULT_COORDS["latitude"]
        longitude = SCRAPED_DEFAULT_COORDS["longitude"]

    address = (
        location.get("address")
        or location.get("name")
        or "Santa Cruz, CA"
    )
    description = raw_event.get("description") or "Scraped from external source"

    return {
        "title": title,
        "description": description,
        "startTime": start_time,
        "endTime": end_time,
        "address": address,
        "location": {"latitude": latitude, "longitude": longitude},
        "category": "community",
        "capacity": None,
        "age_limit": None,
        "image": raw_event.get("image"),
        "ownerEmail": SCRAPED_OWNER_EMAIL,
        "createdAt": datetime.utcnow(),
        "status": "active",
        "source": "scraped",
        "sourceName": SCRAPED_SOURCE,
        "sourceUrl": raw_event.get("url"),
    }

def _is_restricted_category(category):
    """Returns True when the category is reserved for scraped events only."""
    return str(category or "").strip().lower() == "community"

def sync_scraped_events_to_firestore():
    """Scrape source events and upsert them into Firestore."""
    scraped_data = scrape_upcoming_events()
    raw_events = scraped_data.get("events", [])
    synced_ids = set()

    for raw_event in raw_events:
        event_payload = _scraped_event_to_firestore(raw_event)
        if not event_payload:
            continue
        event_id = _scraped_doc_id(raw_event)
        db.collection("events").document(event_id).set(event_payload, merge=True)
        synced_ids.add(event_id)

    existing_scraped = (
        db.collection("events")
        .where(filter=FieldFilter("sourceName", "==", SCRAPED_SOURCE))
        .stream()
    )
    for event_doc in existing_scraped:
        if event_doc.id not in synced_ids:
            db.collection("events").document(event_doc.id).set(
                {"status": "expired"},
                merge=True
            )

    return len(synced_ids)

def _auto_sync_loop():
    """Background loop that syncs scraped events on a fixed interval."""
    while True:
        try:
            synced = sync_scraped_events_to_firestore()
            print(f"Auto sync complete. Synced {synced} scraped events.")
        except ScraperError as sync_error:
            print(f"Auto sync scraper error: {sync_error}")
        except Exception as sync_error:
            print(f"Auto sync unexpected error: {sync_error}")
        sleep(AUTO_SYNC_INTERVAL_SECONDS)

def _start_auto_sync_thread():
    """Starts the auto-sync worker once per process."""
    global _auto_sync_thread
    if not AUTO_SYNC_ENABLED:
        return

    if app.debug and os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        return

    with _auto_sync_lock:
        if _auto_sync_thread and _auto_sync_thread.is_alive():
            return
        _auto_sync_thread = threading.Thread(
            target=_auto_sync_loop,
            daemon=True,
            name="scraped-events-auto-sync",
        )
        _auto_sync_thread.start()

@app.before_request
def ensure_auto_sync_started():
    """Ensure auto-sync worker is running before serving requests."""
    _start_auto_sync_thread()

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
    """Endpoint to retrieve map state from Firestore."""
    try:
        state = {"events": []}
        events = (
            db.collection("events")
            .where(filter=FieldFilter("status", "==", "active"))
            .stream())
        for event in events:
            event_obj = event.to_dict()
            if _is_expired_event_obj(event_obj):
                continue
            event_obj["eventId"] = event.id
            state["events"].append(event_obj)
        return jsonify({"status": 200, "state": state})
    except Exception as e:
        return jsonify({"status": 500, "error": str(e)}), 500

@app.route("/create_event", methods=["POST"])
def create_event():
    """Endpoint for creating an event"""
    event = Event.request_to_event(db)
    assert isinstance(event, Event)
    if _is_restricted_category(event.category):
        return jsonify({"error": "Community category is reserved for scraped events"}), 403

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
    if _is_restricted_category(updated_event.category):
        return jsonify({"error": "Community category is reserved for scraped events"}), 403

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
        normalized_option = (option or "").strip().lower()
        state = {"events":[]}
        events = (
            db.collection("events")
            .where(filter=FieldFilter("status", "==", "active"))
            .stream())
        for event in events:
            event_obj = event.to_dict()
            if _is_expired_event_obj(event_obj):
                continue
            event_category = str(event_obj.get("category", "")).strip().lower()
            if event_category == normalized_option:
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
            event_obj = event.to_dict()
            if _is_expired_event_obj(event_obj):
                continue
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
    app.run(debug=True, host="localhost", port=8080)
