"""
app.py

Flask backend for handling Google OAuth, database updates
"""

import os
import secrets
import jwt
from flask import Flask, redirect, url_for, session, request
from flask_cors import CORS
from google.oauth2 import id_token
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow

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
    credentials = flow.credentials

    try:
        id_info = id_token.verify_oauth2_token(
            credentials.id_token, Request(), app.config["GOOGLE_CLIENT_ID"]
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


@app.route("/logout")
def logout():
    """
    Logout endpoint
    Clears sessions and resets users login cookie
    """
    session.clear()
    response = redirect(url_for("index"))
    response.set_cookie("session", "", expires=0)
    return response


if __name__ == "__main__":
    app.run(debug=True)
