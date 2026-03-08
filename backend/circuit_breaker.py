"""
Circuit Breaker pattern for external API calls (Sarvam OCR, Azure OpenAI).

States:
  CLOSED  → Requests flow normally. Failures are counted.
  OPEN    → Requests fail immediately (fast-fail). Checked after reset_timeout.
  HALF_OPEN → One test request is allowed through. Success → CLOSED, Failure → OPEN.
"""

import time
import logging
from enum import Enum
from threading import Lock

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    def __init__(self, name: str, failure_threshold: int = 3, reset_timeout: int = 60):
        self.name = name
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout  # seconds before OPEN → HALF_OPEN
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time = 0.0
        self._lock = Lock()

    @property
    def state(self) -> CircuitState:
        with self._lock:
            if self._state == CircuitState.OPEN:
                if time.time() - self._last_failure_time >= self.reset_timeout:
                    self._state = CircuitState.HALF_OPEN
                    logger.info(f"Circuit '{self.name}' → HALF_OPEN (testing)")
            return self._state

    def record_success(self):
        with self._lock:
            self._failure_count = 0
            if self._state != CircuitState.CLOSED:
                logger.info(f"Circuit '{self.name}' → CLOSED (recovered)")
            self._state = CircuitState.CLOSED

    def record_failure(self):
        with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.time()
            if self._failure_count >= self.failure_threshold:
                self._state = CircuitState.OPEN
                logger.warning(
                    f"Circuit '{self.name}' → OPEN after {self._failure_count} failures. "
                    f"Fast-failing for {self.reset_timeout}s."
                )

    def is_available(self) -> bool:
        return self.state != CircuitState.OPEN

    def status(self) -> dict:
        return {
            "state": self.state.value,
            "failure_count": self._failure_count,
        }


# Shared circuit breakers for external services
sarvam_circuit = CircuitBreaker("sarvam_ocr", failure_threshold=3, reset_timeout=60)
openai_circuit = CircuitBreaker("azure_openai", failure_threshold=3, reset_timeout=60)
