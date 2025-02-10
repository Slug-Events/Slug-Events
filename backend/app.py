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

load_dotenv("./.env")

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
cred = credentials.Certificate("./slug-events-firebase-key.json")
firebase_admin.initialize_app(cred)
db = firestore.client()
print(db)


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


os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"


@app.route("/login")
def login():
    """
    Login endpoint for users
    Redirects to Google OAuth
    """
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
    # print(f"Generated state: {state}, nonce: {session['nonce']}")
    return redirect(authorization_url)


@app.route("/authorize")
def authorize():
    """
    Callback endpoint for Google OAuth
    Authorizes user
    Returns:
        Cookie containing user info
    """
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
            auth_creds.id_token, Request(), app.config["GOOGLE_CLIENT_ID"]
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

# pylint: disable=too-many-return-statements, too-many-statements, broad-exception-caught
@app.route("/create_event", methods=["POST"])
def create_event():
    """
    Endpoint to create event in database using request from frontend
    """
    try:
        print("\n=== New Event Creation Request ===")
        print("Headers:", dict(request.headers))
        print("Raw JSON:", request.data.decode())

        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            print("Auth fail: Missing or invalid Authorization header")
            return jsonify({"error": "Unauthorized"}), 401

        token = auth_header.split(" ")[1]
        try:
            decoded = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            user_email = decoded["user"]["email"]
            print(f"Authenticated user: {user_email}")
        except Exception as e:
            print(f"Token validation failed: {str(e)}")
            return jsonify({"error": "Invalid token"}), 401
        try:
            event_data = request.get_json()
            print("Parsed JSON:", event_data)
        except Exception as e:
            print(f"JSON parse error: {str(e)}")
            return jsonify({"error": "Invalid JSON format"}), 400

        required_fields = ["title", "description", "startTime", "endTime", "location"]
        missing_fields = [field for field in required_fields if field not in event_data]
        if missing_fields:
            print(f"Missing fields: {missing_fields}")
            return (
                jsonify(
                    {"error": f'Missing required fields: {", ".join(missing_fields)}'}
                ),
                400,
            )

        try:
            start_time = datetime.fromisoformat(event_data["startTime"])
            end_time = datetime.fromisoformat(event_data["endTime"])
            print(f"Validated dates - Start: {start_time}, End: {end_time}")
            if end_time <= start_time:
                print("Invalid date range")
                return jsonify({"error": "End time must be after start time"}), 400
        except ValueError as e:
            print(f"Date validation error: {str(e)}")
            return jsonify({"error": f"Invalid date format: {str(e)}"}), 400

        try:
            geo_point = {
                "latitude": event_data["location"]["latitude"],
                "longitude": event_data["location"]["longitude"],
            }
            print(f"Validated location: {geo_point}")
        except (KeyError, TypeError) as e:
            print(f"Location validation error: {str(e)}")
            return jsonify({"error": "Invalid location format"}), 400

        try:
            event_ref = db.collection("events").document()
            event_data = {
                "title": event_data["title"],
                "description": event_data["description"],
                "startTime": start_time,
                "endTime": end_time,
                "address": event_data["address"],
                "location": geo_point,
                "category": event_data["category"],
                "capacity": event_data.get("capacity", None),
                "age_limit": event_data.get("age_limit", None),
                "ownerEmail": user_email,
                "createdAt": datetime.now(),
                "status": "active",
            }

            print(f"Attempting Firestore write to document {event_ref.id}")
            print("Document data:", event_data)

            event_ref.set(event_data)
            print(f"events collection{event_ref.get()}")

            doc = event_ref.get()
            if doc.exists:
                print("Firestore write confirmed")
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
            print("Firestore write failed silently")
            return jsonify({"error": "Document not created"}), 500

        except Exception as e:
            print(f"Firestore error: {str(e)}")
            return jsonify({"error": f"Database error: {str(e)}"}), 500

    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

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
        return jsonify({"status": 500, "error": str(e)}), 500

@app.route("/logout")
def logout():
    """
    Logout endpoint
    Clears sessions and resets users login cookie
    """
    session.clear()
    response = redirect(url_for("/index"))
    response.set_cookie("session", "", expires=0)
    return response


if __name__ == "__main__":
    app.run(debug=True)
