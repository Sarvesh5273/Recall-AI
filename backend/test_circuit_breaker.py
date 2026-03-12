"""Tests for circuit breaker pattern."""

from circuit_breaker import CircuitBreaker, CircuitState


class TestCircuitBreaker:
    """Circuit breaker state transitions."""

    def test_starts_closed(self):
        cb = CircuitBreaker("test", failure_threshold=3, reset_timeout=1)
        assert cb.state == CircuitState.CLOSED
        assert cb.is_available()

    def test_opens_after_threshold_failures(self):
        cb = CircuitBreaker("test", failure_threshold=3, reset_timeout=60)
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.CLOSED
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        assert not cb.is_available()

    def test_success_resets_failure_count(self):
        cb = CircuitBreaker("test", failure_threshold=3, reset_timeout=60)
        cb.record_failure()
        cb.record_failure()
        cb.record_success()
        cb.record_failure()
        assert cb.state == CircuitState.CLOSED

    def test_half_open_after_timeout(self):
        # With reset_timeout=0, circuit immediately becomes HALF_OPEN after opening
        cb = CircuitBreaker("test", failure_threshold=1, reset_timeout=0)
        cb.record_failure()
        # reset_timeout=0 means it's already past timeout, so state is HALF_OPEN
        assert cb.state == CircuitState.HALF_OPEN

    def test_status_returns_dict(self):
        cb = CircuitBreaker("test", failure_threshold=3, reset_timeout=60)
        status = cb.status()
        assert "state" in status
        assert "failure_count" in status
        assert status["state"] == "closed"
