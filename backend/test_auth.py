"""Tests for JWT token creation and validation."""

import os
import time
import pytest
from jose import jwt


class TestJWT:
    """JWT token creation and validation."""

    def test_valid_token_decodes(self):
        secret = os.getenv("JWT_SECRET", "test-secret")
        token = jwt.encode(
            {"shop_id": "shop_123", "phone": "+919876543210", "exp": time.time() + 3600},
            secret,
            algorithm="HS256",
        )
        decoded = jwt.decode(token, secret, algorithms=["HS256"])
        assert decoded["shop_id"] == "shop_123"
        assert decoded["phone"] == "+919876543210"

    def test_expired_token_rejected(self):
        secret = os.getenv("JWT_SECRET", "test-secret")
        token = jwt.encode(
            {"shop_id": "shop_123", "phone": "+919876543210", "exp": time.time() - 100},
            secret,
            algorithm="HS256",
        )
        with pytest.raises(Exception):
            jwt.decode(token, secret, algorithms=["HS256"])

    def test_invalid_secret_rejected(self):
        token = jwt.encode(
            {"shop_id": "shop_123", "exp": time.time() + 3600},
            "correct-secret",
            algorithm="HS256",
        )
        with pytest.raises(Exception):
            jwt.decode(token, "wrong-secret", algorithms=["HS256"])


class TestJWTSecretFailsafe:
    """JWT secret must not use default in production."""

    def test_production_rejects_default_secret(self, monkeypatch):
        monkeypatch.setenv("ENV", "production")
        monkeypatch.setenv("JWT_SECRET", "recall-ai-dev-secret-CHANGE-IN-PRODUCTION")
        with pytest.raises(RuntimeError, match="JWT_SECRET must be set in production"):
            # Re-import to trigger the check
            import importlib
            import auth
            importlib.reload(auth)

    def test_dev_allows_default_secret(self, monkeypatch):
        monkeypatch.setenv("ENV", "development")
        monkeypatch.setenv("JWT_SECRET", "recall-ai-dev-secret-CHANGE-IN-PRODUCTION")
        import importlib
        import auth
        # Should NOT raise
        importlib.reload(auth)
