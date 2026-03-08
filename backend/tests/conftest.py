"""Shared test fixtures for Recall AI backend tests."""

import os
import sys
import json
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient

# Ensure backend/ is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


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
    monkeypatch.setenv("AZURE_OPENAI_KEY", "test-openai-key")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:8081")


@pytest.fixture
def mock_cosmos_container():
    """Mock Cosmos DB container with query support."""
    container = MagicMock()
    container.query_items.return_value = iter([])
    container.upsert_item.return_value = {}
    container.read_item.return_value = {}
    container.patch_item.return_value = {}
    return container


@pytest.fixture
def mock_training_container():
    """Mock training container."""
    container = MagicMock()
    container.query_items.return_value = iter([])
    container.upsert_item.return_value = {}
    return container


@pytest.fixture
def mock_blob_container():
    """Mock Azure Blob Storage container."""
    container = MagicMock()
    blob_client = MagicMock()
    blob_client.upload_blob.return_value = None
    container.get_blob_client.return_value = blob_client
    container.get_container_properties.return_value = {}
    return container
