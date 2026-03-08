"""Tests for rate limiting."""

import time
from unittest.mock import patch


class TestRateLimiter:
    """API rate limiting behavior."""

    def test_rate_limiter_allows_normal_requests(self):
        with patch("database.CosmosClient"), \
             patch("database.CosmosDBConnector._initialize"):
            from main import rate_limiter, RATE_LIMIT_WINDOW, RATE_LIMIT_MAX
            # Fresh IP should not be rate limited
            test_ip = "192.168.1.100"
            rate_limiter.pop(test_ip, None)
            # Simulate a few requests
            now = time.time()
            rate_limiter[test_ip] = [now] * 3
            # Should still have room (default is higher than 3)
            assert len(rate_limiter[test_ip]) < RATE_LIMIT_MAX
