"""
Helper functions for flask api
"""

import os
from datetime import datetime
import jwt
from flask import request, jsonify


SECRET_KEY = os.getenv("JWT_SECRET_KEY", "supersecurejwtkey")

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

def get_user_email():
    """Gets user email from request"""
    decoded = authenticate_request()
    if not decoded:
        return ""
    user_email = decoded["user"]["email"]
    return user_email

def get_user_credentials():
    """Gets user Google credentials from request"""
    decoded = authenticate_request()
    if not decoded:
        return None
    return decoded.get("credentials")

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