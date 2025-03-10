"""Global config for pytests to use. Defines mock db and a sample event class"""
from unittest.mock import MagicMock
from datetime import datetime
import pytest
from event import Event
from app import app

@pytest.fixture
def mock_db():
    """Creates a mock Firestore database instance."""
    return MagicMock()

@pytest.fixture
def sample_event(request):
    """Creates a sample Event object with test data."""
    mock_firebase_db = request.getfixturevalue("mock_db")
    return Event(
        title="Test Event",
        description="This is a test event.",
        start_time=datetime(2025, 3, 9, 12, 0),
        end_time=datetime(2025, 3, 9, 14, 0),
        location={"latitude": "37.7749", "longitude": "-122.4194"},
        category="Social",
        owner_email="test@example.com",
        db=mock_firebase_db,
        address="123 Test St",
        capacity="100",
        age_limit="18+",
        image="test.jpg",
    )

@pytest.fixture(scope="module")
def app_context():
    """Provides an application context required for database operations."""
    with app.app_context():
        yield
