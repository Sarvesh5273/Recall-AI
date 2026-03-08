"""Tests for authentication flow."""

import pytest
import time
from unittest.mock import patch, MagicMock
from jose import jwt


class TestOTPFlow:
    """OTP send and verify flow."""

    def test_send_otp_valid_phone(self):
        with patch("database.CosmosClient"), \
             patch("database.CosmosDBConnector._initialize"), \
             patch("auth.twilio_client") as mock_twilio:
            mock_twilio.messages.create.return_value = MagicMock(sid="SM123")

            from main import app
            from fastapi.testclient import TestClient
            client = TestClient(app)

            response = client.post("/auth/send-otp", json={"phone": "+919876543210"})
            assert response.status_code == 200
            assert response.json()["status"] == "success"

    def test_send_otp_invalid_phone(self):
        with patch("database.CosmosClient"), \
             patch("database.CosmosDBConnector._initialize"):

            from main import app
            from fastapi.testclient import TestClient
            client = TestClient(app)

            response = client.post("/auth/send-otp", json={"phone": "123"})
            assert response.status_code == 400


class TestJWT:
    """JWT token creation and validation."""

    def test_valid_token_decodes(self):
        import os
        secret = os.getenv("JWT_SECRET", "test-secret")
        token = jwt.encode(
            {"shop_id": "shop_123", "phone": "+919876543210", "exp": time.time() + 3600},
            secret,
            algorithm="HS256",
        )
        decoded = jwt.decode(token, secret, algorithms=["HS256"])
        assert decoded["shop_id"] == "shop_123"

    def test_expired_token_rejected(self):
        import os
        secret = os.getenv("JWT_SECRET", "test-secret")
        token = jwt.encode(
            {"shop_id": "shop_123", "phone": "+919876543210", "exp": time.time() - 100},
            secret,
            algorithm="HS256",
        )
        with pytest.raises(Exception):
            jwt.decode(token, secret, algorithms=["HS256"])
