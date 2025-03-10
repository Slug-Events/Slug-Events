"""
Class for Event object
"""

from datetime import datetime, timezone
from typing import Optional
from flask import request, jsonify
from helpers import get_user_email, validate_event_data

class Event:
    """Class for Event object"""

    def __init__(
        self,
        title: str,
        description: str,
        start_time: datetime,
        end_time: datetime,
        location: dict,
        category: str,
        owner_email: str,
        db,
        address: str = "",
        capacity: Optional[str] = None,
        age_limit: Optional[str] = None,
        image: Optional[str] = None,
        event_id: Optional[str] = None,
    ) -> None:
        # Added type validation inside event class
        event_data = {
            "title": title,
            "description": description,
            "startTime": start_time.isoformat() if isinstance(start_time, datetime) else start_time,
            "endTime": end_time.isoformat() if isinstance(end_time, datetime) else end_time,
            "location": location,
        }

        validation_error = validate_event_data(event_data)
        if validation_error:
            raise ValueError(validation_error[0].json)

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
        self.image = image
        self.owner_email = owner_email
        self.db = db
        self.created_at = datetime.now(timezone.utc)
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
            "image": self.image,
            "ownerEmail": self.owner_email,
            "createdAt": self.created_at,
            "status": self.status,
        }
    def create(self):
        """Creates event in database"""
        event_ref = self.db.collection("events").document()
        self.event_id = event_ref.id
        event_ref.set(self.to_dict())
        return event_ref

    @classmethod
    def request_to_event(cls, db):
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
            image=event_data.get("image"),
            owner_email=user_email,
            db = db
        )
        return event

    @classmethod
    def get(cls, event_id, db):
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
                image=data.get("image"),
                event_id=event_id,
                owner_email=data["ownerEmail"],
                db = db
            )
            return event
        return None

    def update(self, event_id):
        """Updates existing event in database"""
        self.db.collection("events").document(event_id).set(self.to_dict(), merge=True)

    def delete(self):
        """Deletes existing event in database"""
        try:
            event_ref = self.db.collection("events").document(self.event_id)
            event_ref.delete()
            return jsonify({"message": "Event deleted successfully"}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    def rsvp_add(self, user_email: str):
        """Adds a user to rsvp list in existing event"""
        rsvp_ref = (
            self.db.collection("events")
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
            self.db.collection("events")
            .document(self.event_id)
            .collection("rsvps")
            .document(user_email)
        )
        rsvp_ref.delete()

    def get_rsvps(self):
        """Gets list of users in rsvp list of an existing event"""
        return [
            doc.id
            for doc in self.db.collection("events")
            .document(self.event_id)
            .collection("rsvps")
            .stream()
        ]
