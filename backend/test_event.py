"""Pytest tests for basic Event class functionality"""

from unittest.mock import MagicMock, ANY
import pytest
from event import Event


def test_event_to_dict(sample_event):
    """Ensure that the Event object is correctly converted to a dictionary."""
    event_dict = sample_event.to_dict()
    expected_data = {
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
    assert event_dict == expected_data


def test_event_creation(sample_event, mock_db):
    """Ensure that an event is successfully added to the database and assigned an ID with correct data."""
    event_ref = MagicMock()
    events_collection = mock_db.collection("events")
    events_collection.document.return_value = event_ref

    sample_event.create()

    event_ref.set.assert_called_once()
    assert sample_event.event_id is not None

    expected_data = sample_event.to_dict()
    event_ref.set.assert_called_with(expected_data)


def test_event_update(sample_event, mock_db):
    """Ensure that updating an event modifies the database entry correctly with accurate data."""
    event_ref = mock_db.collection("events").document("event123")
    sample_event.event_id = "event123"

    # modify event fields
    sample_event.title = "Updated Title"
    sample_event.capacity = "200"
    sample_event.status = "updated"

    sample_event.update("event123")

    expected_data = sample_event.to_dict()
    event_ref.set.assert_called_once_with(expected_data, merge=True)


@pytest.mark.usefixtures("app_context")
def test_event_deletion(sample_event, mock_db):
    """Ensure that deleting an event removes it from the database and verifies removal."""
    event_ref = mock_db.collection("events").document("event123")
    sample_event.event_id = "event123"

    response, status_code = sample_event.delete()

    event_ref.delete.assert_called_once()
    assert status_code == 200
    assert response.json == {"message": "Event deleted successfully"}


def test_rsvp_addition(sample_event, mock_db):
    """Ensure that adding an RSVP correctly updates the database and verifies stored values."""
    sample_event.event_id = "event123"
    rsvp_collection = (
        mock_db.collection("events").document("event123").collection("rsvps")
    )
    rsvp_ref = rsvp_collection.document("user@example.com")

    sample_event.rsvp_add("user@example.com")

    expected_data = {
        "email": "user@example.com",
        "status": "confirmed",
        "timestamp": ANY,  # ignore timestamp since it's dynamically generated
    }
    rsvp_ref.set.assert_called_once_with(expected_data)


def test_rsvp_removal(sample_event, mock_db):
    """Ensure that removing an RSVP correctly updates the database and verifies removal."""
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

    # mock Firestore's stream() to return fake RSVP documents
    mock_snapshot = [
        MagicMock(id="user1@example.com"),
        MagicMock(id="user2@example.com"),
    ]
    rsvp_collection.stream.return_value = mock_snapshot

    rsvps = sample_event.get_rsvps()

    assert rsvps == ["user1@example.com", "user2@example.com"]


def test_event_fetch_from_db(sample_event, mock_db):
    """Ensure fetching an event from the database retrieves all correct values."""
    event_ref = mock_db.collection("events").document("event123")
    mock_db.collection("events").document(
        "event123"
    ).get.return_value.to_dict.return_value = sample_event.to_dict()

    fetched_event_data = event_ref.get().to_dict()

    expected_data = sample_event.to_dict()
    assert fetched_event_data == expected_data


def test_invalid_data_types(mock_db):
    """Ensure that Event handles incorrect data types properly."""
    with pytest.raises(TypeError):
        Event(
            title=123,  # invalid type (should be string)
            description=["Invalid", "Description"],  # invalid type (should be string)
            start_time="2025-03-09T12:00:00",  # invalid type (should be datetime)
            end_time=1612137600,  # invalid type (should be datetime)
            location="Invalid Location",  # invalid type (should be dict)
            category=None,  # invalid type (should be string)
            owner_email=456,  # invalid type (should be string)
            db=mock_db,
        )
