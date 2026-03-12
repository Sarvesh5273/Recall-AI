"""Shared test fixtures for Recall AI backend tests.

IMPORTANT: This file patches CosmosClient BEFORE database.py imports it,
preventing real API calls during tests.
"""

import os
import sys

# Set JWT_SECRET BEFORE any imports of main or auth, so they pick up the test secret
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-unit-tests")

import json
import pytest
from unittest.mock import MagicMock, patch

# Ensure backend/ is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── EARLY PATCHING: Mock CosmosClient before database.py loads ────────────────
# The database.py singleton initializes at import time, so we must patch FIRST

def _create_mock_cosmos_client():
    """Create a fully mocked CosmosClient that returns mock containers."""
    mock_client = MagicMock()
    mock_database = MagicMock()
    mock_container = MagicMock()
    mock_training = MagicMock()
    
    # Default behaviors
    mock_container.query_items.return_value = iter([])
    mock_container.create_item.return_value = {}
    mock_container.upsert_item.return_value = {}
    mock_container.read_item.return_value = {}
    mock_container.patch_item.return_value = {}
    
    mock_training.query_items.return_value = iter([])
    mock_training.create_item.return_value = {}
    mock_training.upsert_item.return_value = {}
    
    # Wire up the chain
    mock_client.create_database_if_not_exists.return_value = mock_database
    mock_database.create_container_if_not_exists.side_effect = [mock_container, mock_training]
    
    return mock_client, mock_container, mock_training


# Create global mocks that will be used by all tests
_MOCK_CLIENT, _MOCK_CONTAINER, _MOCK_TRAINING = _create_mock_cosmos_client()

# Patch CosmosClient class BEFORE any module imports it
_cosmos_patcher = patch('azure.cosmos.CosmosClient', return_value=_MOCK_CLIENT)
_cosmos_patcher.start()


@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    """Set required environment variables for all tests."""
    monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
    monkeypatch.setenv("COSMOS_DB_ENDPOINT", "https://test.documents.azure.com")
    monkeypatch.setenv("COSMOS_DB_KEY", "dGVzdC1rZXk=")
    monkeypatch.setenv("COSMOS_DB_DATABASE_NAME", "test-db")
    monkeypatch.setenv("COSMOS_DB_CONTAINER_NAME", "test-container")
    monkeypatch.setenv("AZURE_STORAGE_CONNECTION_STRING", "DefaultEndpointsProtocol=https;AccountName=test")
    monkeypatch.setenv("AZURE_STORAGE_CONTAINER_NAME", "test-images")
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "ACtest")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "test-token")
    monkeypatch.setenv("TWILIO_PHONE_NUMBER", "+15555555555")
    monkeypatch.setenv("SARVAM_API_KEY", "test-sarvam-key")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://test.openai.azure.com")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:8081")
    monkeypatch.setenv("ENV", "development")


@pytest.fixture(autouse=True)
def reset_mocks():
    """Reset mock state between tests."""
    _MOCK_CONTAINER.reset_mock()
    _MOCK_TRAINING.reset_mock()
    _MOCK_CONTAINER.query_items.return_value = iter([])
    _MOCK_TRAINING.query_items.return_value = iter([])
    yield


@pytest.fixture
def mock_cosmos_container():
    """Access to the global mock Cosmos DB container."""
    return _MOCK_CONTAINER


@pytest.fixture
def mock_training_container():
    """Access to the global mock training container."""
    return _MOCK_TRAINING


@pytest.fixture
def mock_blob_container():
    """Mock Azure Blob Storage container."""
    container = MagicMock()
    blob_client = MagicMock()
    blob_client.upload_blob.return_value = None
    container.get_blob_client.return_value = blob_client
    container.get_container_properties.return_value = {}
    return container


@pytest.fixture
def mock_azure_openai():
    """Mock Azure OpenAI client."""
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps({"matches": []})
    mock_client.chat.completions.create.return_value = mock_response
    return mock_client


@pytest.fixture
def mock_sarvam_response():
    """Mock Sarvam OCR response."""
    return MagicMock(
        status_code=200,
        json=lambda: {"message": "Sugar 5kg\nRice 10kg"}
    )


@pytest.fixture
def test_shop():
    """Test shop data."""
    return {
        "shop_id": "shop_TEST_1234",
        "phone": "+919876543210",
        "shop_name": "Test Kirana Store",
        "plan": "free"
    }


@pytest.fixture
def auth_token(test_shop):
    """Generate valid JWT token for test shop."""
    import time
    from jose import jwt
    return jwt.encode(
        {
            "shop_id": test_shop["shop_id"],
            "phone": test_shop["phone"],
            "exp": time.time() + 3600
        },
        "test-secret-key-for-unit-tests",
        algorithm="HS256"
    )


@pytest.fixture
def auth_headers(auth_token):
    """Authorization headers with Bearer token."""
    return {"Authorization": f"Bearer {auth_token}"}
