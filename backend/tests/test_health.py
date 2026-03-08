"""Tests for /health endpoint."""

import pytest
from unittest.mock import patch, MagicMock


class TestHealthEndpoint:
    """Health check should report status of all dependencies."""

    def test_health_returns_200_when_all_ok(self, mock_cosmos_container, mock_blob_container):
        with patch("database.CosmosClient"), \
             patch("database.CosmosDBConnector._initialize"), \
             patch("main.db") as mock_db, \
             patch("main.blob_container_client", mock_blob_container), \
             patch("main._catalog_list", [{"uid": "sugar_001", "name": "Sugar"}]):
            mock_db.get_container.return_value = mock_cosmos_container
            mock_cosmos_container.query_items.return_value = iter([1])

            from main import app
            from fastapi.testclient import TestClient
            client = TestClient(app)

            response = client.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            assert data["checks"]["cosmos_db"] == "ok"
            assert data["checks"]["blob_storage"] == "ok"
            assert data["checks"]["master_catalog"] == "ok"
            assert "circuits" in data

    def test_health_returns_503_when_cosmos_down(self, mock_blob_container):
        with patch("database.CosmosClient"), \
             patch("database.CosmosDBConnector._initialize"), \
             patch("main.db") as mock_db, \
             patch("main.blob_container_client", mock_blob_container), \
             patch("main._catalog_list", [{"uid": "sugar_001"}]):
            mock_db.get_container.side_effect = Exception("Connection refused")

            from main import app
            from fastapi.testclient import TestClient
            client = TestClient(app)

            response = client.get("/health")
            assert response.status_code == 503
            assert response.json()["status"] == "degraded"
