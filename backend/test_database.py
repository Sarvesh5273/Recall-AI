"""Tests for Cosmos DB retry logic."""

import time
from unittest.mock import MagicMock, patch
from azure.cosmos import exceptions
from database import cosmos_retry


class TestCosmosRetry:
    """Cosmos DB retry decorator."""

    def test_succeeds_on_first_try(self):
        @cosmos_retry
        def my_operation():
            return "success"

        assert my_operation() == "success"

    def test_retries_on_429(self):
        call_count = 0

        @cosmos_retry
        def my_operation():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                error = exceptions.CosmosHttpResponseError(status_code=429, message="Throttled")
                error.headers = {"x-ms-retry-after-ms": "100"}
                raise error
            return "success"

        result = my_operation()
        assert result == "success"
        assert call_count == 3

    def test_raises_non_429_errors(self):
        @cosmos_retry
        def my_operation():
            raise exceptions.CosmosHttpResponseError(status_code=404, message="Not found")

        import pytest
        with pytest.raises(exceptions.CosmosHttpResponseError):
            my_operation()

    def test_raises_after_max_retries(self):
        @cosmos_retry
        def my_operation():
            error = exceptions.CosmosHttpResponseError(status_code=429, message="Throttled")
            error.headers = {"x-ms-retry-after-ms": "50"}
            raise error

        import pytest
        with pytest.raises(exceptions.CosmosHttpResponseError):
            my_operation()
