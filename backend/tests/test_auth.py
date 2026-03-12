"""Tests for authentication flow — OTP send, verify, register, login."""

import pytest
import time
from jose import jwt


class TestSendOTP:
    """OTP send flow."""

    def test_send_otp_valid_phone_stores_otp(self, mock_cosmos_container):
        """Send OTP to valid phone → OTP stored in memory."""
        # Clear OTP store before test
        import auth
        auth._otp_store.clear()
        
        from main import app
        from fastapi.testclient import TestClient
        client = TestClient(app)

        response = client.post("/auth/send-otp", json={"phone": "+919876543210"})
        
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        # Verify OTP was stored
        assert "+919876543210" in auth._otp_store
        assert "otp" in auth._otp_store["+919876543210"]
        assert len(auth._otp_store["+919876543210"]["otp"]) == 6

    def test_send_otp_normalizes_phone(self, mock_cosmos_container):
        """Phone without +91 prefix is normalized."""
        import auth
        auth._otp_store.clear()
        
        from main import app
        from fastapi.testclient import TestClient
        client = TestClient(app)

        response = client.post("/auth/send-otp", json={"phone": "9876543210"})
        
        assert response.status_code == 200
        assert "+919876543210" in auth._otp_store

    def test_send_otp_invalid_phone_rejected(self, mock_cosmos_container):
        """Invalid phone number returns 400."""
        from main import app
        from fastapi.testclient import TestClient
        client = TestClient(app)

        response = client.post("/auth/send-otp", json={"phone": "123"})
        
        assert response.status_code == 400


class TestRegister:
    """Registration flow with OTP verification."""

    def test_register_correct_otp_returns_jwt(self, mock_cosmos_container):
        """Correct OTP → account created, JWT returned."""
        mock_cosmos_container.query_items.return_value = iter([])  # No existing account
        
        import auth
        auth._otp_store.clear()
        # Pre-store OTP
        auth._otp_store["+919876543210"] = {
            "otp": "123456",
            "expires_at": time.time() + 600
        }
        
        from main import app
        from fastapi.testclient import TestClient
        client = TestClient(app)

        response = client.post("/auth/register", json={
            "phone": "+919876543210",
            "otp": "123456",
            "shop_name": "Test Kirana"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "token" in data
        assert "shop_id" in data
        # Verify JWT token is non-empty string
        assert len(data["token"]) > 20

    def test_register_wrong_otp_returns_400(self, mock_cosmos_container):
        """Wrong OTP → 400 error."""
        import auth
        auth._otp_store.clear()
        auth._otp_store["+919876543210"] = {
            "otp": "123456",
            "expires_at": time.time() + 600
        }
        
        from main import app
        from fastapi.testclient import TestClient
        client = TestClient(app)

        response = client.post("/auth/register", json={
            "phone": "+919876543210",
            "otp": "999999",  # Wrong OTP
            "shop_name": "Test Kirana"
        })
        
        assert response.status_code == 400
        assert "Incorrect OTP" in response.json()["detail"]

    def test_register_expired_otp_returns_400(self, mock_cosmos_container):
        """Expired OTP → 400 error."""
        import auth
        auth._otp_store.clear()
        auth._otp_store["+919876543210"] = {
            "otp": "123456",
            "expires_at": time.time() - 100  # Expired
        }
        
        from main import app
        from fastapi.testclient import TestClient
        client = TestClient(app)

        response = client.post("/auth/register", json={
            "phone": "+919876543210",
            "otp": "123456",
            "shop_name": "Test Kirana"
        })
        
        assert response.status_code == 400
        assert "expired" in response.json()["detail"].lower()

    def test_register_duplicate_phone_returns_409(self, mock_cosmos_container):
        """Phone already registered → 409 ALREADY_REGISTERED."""
        # Simulate existing account
        mock_cosmos_container.query_items.return_value = iter([{"id": "existing"}])
        
        import auth
        auth._otp_store.clear()
        auth._otp_store["+919876543210"] = {
            "otp": "123456",
            "expires_at": time.time() + 600
        }
        
        from main import app
        from fastapi.testclient import TestClient
        client = TestClient(app)

        response = client.post("/auth/register", json={
            "phone": "+919876543210",
            "otp": "123456",
            "shop_name": "Test Kirana"
        })
        
        assert response.status_code == 409
        assert "ALREADY_REGISTERED" in response.json()["detail"]


class TestLoginOTP:
    """Login flow with OTP verification."""

    def test_login_correct_otp_returns_jwt(self, mock_cosmos_container):
        """Correct OTP + existing account → JWT returned."""
        # Simulate existing account
        mock_cosmos_container.query_items.return_value = iter([{
            "shop_id": "shop_TEST_1234",
            "shop_name": "Test Kirana",
            "phone": "+919876543210"
        }])
        
        import auth
        auth._otp_store.clear()
        auth._otp_store["+919876543210"] = {
            "otp": "123456",
            "expires_at": time.time() + 600
        }
        
        from main import app
        from fastapi.testclient import TestClient
        client = TestClient(app)

        response = client.post("/auth/login-otp", json={
            "phone": "+919876543210",
            "otp": "123456"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "token" in data
        assert data["shop_id"] == "shop_TEST_1234"

    def test_login_wrong_otp_returns_400(self, mock_cosmos_container):
        """Wrong OTP → 400 error."""
        import auth
        auth._otp_store.clear()
        auth._otp_store["+919876543210"] = {
            "otp": "123456",
            "expires_at": time.time() + 600
        }
        
        from main import app
        from fastapi.testclient import TestClient
        client = TestClient(app)

        response = client.post("/auth/login-otp", json={
            "phone": "+919876543210",
            "otp": "999999"
        })
        
        assert response.status_code == 400

    def test_login_not_registered_returns_404(self, mock_cosmos_container):
        """Valid OTP but no account → 404 NOT_REGISTERED."""
        mock_cosmos_container.query_items.return_value = iter([])  # No account
        
        import auth
        auth._otp_store.clear()
        auth._otp_store["+919876543210"] = {
            "otp": "123456",
            "expires_at": time.time() + 600
        }
        
        from main import app
        from fastapi.testclient import TestClient
        client = TestClient(app)

        response = client.post("/auth/login-otp", json={
            "phone": "+919876543210",
            "otp": "123456"
        })
        
        assert response.status_code == 404
        assert "NOT_REGISTERED" in response.json()["detail"]


class TestRateLimiting:
    """Login attempt rate limiting and lockout."""

    @pytest.mark.xfail(reason="Rate limiting functions exist but not wired into login endpoint")
    def test_five_failed_attempts_triggers_lockout(self, mock_cosmos_container):
        """5 failed OTP attempts → account locked for 30 minutes."""
        import auth
        auth._otp_store.clear()
        auth._login_attempts.clear()
        
        from main import app
        from fastapi.testclient import TestClient
        client = TestClient(app)

        # Make 4 failed attempts (wrong OTP)
        for i in range(4):
            # Re-add OTP since it might get cleared
            auth._otp_store["+919876543210"] = {
                "otp": "123456",
                "expires_at": time.time() + 600
            }
            response = client.post("/auth/login-otp", json={
                "phone": "+919876543210",
                "otp": "wrong_otp"
            })
            # Each attempt should fail with 400 (wrong OTP)
            assert response.status_code == 400

        # 5th attempt should trigger lockout (429)
        auth._otp_store["+919876543210"] = {
            "otp": "123456",
            "expires_at": time.time() + 600
        }
        response = client.post("/auth/login-otp", json={
            "phone": "+919876543210",
            "otp": "wrong_otp_again"
        })
        assert response.status_code == 429
        assert "locked" in response.json().get("detail", "").lower()


class TestJWT:
    """JWT token creation and validation."""

    def test_valid_token_decodes(self):
        """Valid JWT decodes successfully."""
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
        """Expired JWT raises exception."""
        import os
        secret = os.getenv("JWT_SECRET", "test-secret")
        token = jwt.encode(
            {"shop_id": "shop_123", "phone": "+919876543210", "exp": time.time() - 100},
            secret,
            algorithm="HS256",
        )
        with pytest.raises(Exception):
            jwt.decode(token, secret, algorithms=["HS256"])
