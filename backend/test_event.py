"""Pytest tests for basic Event class functionality"""
from unittest.mock import MagicMock
import pytest
from event import Event

def test_event_to_dict(sample_event):
    """Ensure that the Event object is correctly converted to a dictionary."""
    event_dict = sample_event.to_dict()
    expected_dict = {
        "title": sample_event.title,
        "description": sample_event.description,
        "startTime": sample_event.start_time,
        "endTime": sample_event.end_time,
        "address": sample_event.address,
        "location": sample_event.location,
        "category": sample_event.category,
        "capacity": sample_event.capacity,
        "age_limit": sample_event.age_limit,
        "image": sample_event.image,
        "ownerEmail": sample_event.owner_email,
        "createdAt": sample_event.created_at,
        "status": sample_event.status,
    }
    assert event_dict == expected_dict

def test_event_creation(sample_event, mock_db):
    """Ensure that an event is successfully added to the database and assigned an ID."""
    event_ref = MagicMock()
    events_collection = mock_db.collection("events")
    events_collection.document.return_value = event_ref
    sample_event.create()
    event_ref.set.assert_called_once()
    assert sample_event.event_id is not None

def test_event_update(sample_event, mock_db):
    """Ensure that updating an event modifies the database entry correctly."""
    event_ref = mock_db.collection("events").document("event123")
    sample_event.update("event123")
    event_ref.set.assert_called_once()

@pytest.mark.usefixtures("app_context")
def test_event_deletion(sample_event, mock_db):
    """Ensure that deleting an event removes it from the database and returns the correct response."""
    event_ref = mock_db.collection("events").document("event123")
    sample_event.event_id = "event123"
    response, status_code = sample_event.delete()
    event_ref.delete.assert_called_once()
    assert status_code == 200
    assert response.json == {"message": "Event deleted successfully"}

def test_rsvp_addition(sample_event, mock_db):
    """Ensure that adding an RSVP correctly updates the database and RSVP is stored."""
    sample_event.event_id = "event123"
    rsvp_collection = (
        mock_db.collection("events").document("event123").collection("rsvps")
    )
    rsvp_ref = rsvp_collection.document("user@example.com")
    sample_event.rsvp_add("user@example.com")
    rsvp_ref.set.assert_called_once()
    assert rsvp_ref.set.call_args[0][0]["email"] == "user@example.com"
    assert rsvp_ref.set.call_args[0][0]["status"] == "confirmed"

def test_rsvp_removal(sample_event, mock_db):
    """Ensure that removing an RSVP correctly updates the database."""
    sample_event.event_id = "event123"
    rsvp_collection = (
        mock_db.collection("events").document("event123").collection("rsvps")
    )
    rsvp_ref = rsvp_collection.document("user@example.com")
    sample_event.rsvp_remove("user@example.com")
    rsvp_ref.delete.assert_called_once()

def test_get_rsvps_list(sample_event, mock_db):
    """Ensure that retrieving RSVPs returns the correct list of user emails."""
    sample_event.event_id = "event123"
    rsvp_collection = (
        mock_db.collection("events").document("event123").collection("rsvps")
    )
    mock_snapshot = [
        MagicMock(id="user1@example.com"),
        MagicMock(id="user2@example.com"),
    ]
    rsvp_collection.stream.return_value = mock_snapshot
    rsvps = sample_event.get_rsvps()
    assert rsvps == ["user1@example.com", "user2@example.com"]

def test_invalid_data_types(mock_db):
    """Ensure that Event handles incorrect data types properly."""
    with pytest.raises(TypeError):
        Event(
            title=123,  # Invalid type (should be string)
            description=["Invalid", "Description"],  # Invalid type (should be string)
            start_time="2025-03-09T12:00:00",  # Invalid type (should be datetime)
            end_time=1612137600,  # Invalid type (should be datetime)
            location="Invalid Location",  # Invalid type (should be dict)
            category=None,  # Invalid type (should be string)
            owner_email=456,  # Invalid type (should be string)
            db=mock_db,
        )
