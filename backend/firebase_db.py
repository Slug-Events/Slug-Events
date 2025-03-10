"""Module for getting a firebase database"""
import os
import json
import firebase_admin
from firebase_admin import credentials, firestore

def get_db():
    """Retrieves firebase database from config set in env variables"""
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
    return db
