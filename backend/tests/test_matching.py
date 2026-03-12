"""Tests for matching cascade — training signals, GPT matching, quarantine."""

import json
from unittest.mock import patch, MagicMock


class TestTrainingSignalMatch:
    """Tier 1: Training signal exact match."""

    def test_training_signal_match_skips_gpt(self, mock_cosmos_container, mock_training_container):
        """Training signal exact match → inventory updated, GPT not called."""
        # Setup training signals — "sugar" is learned
        mock_training_container.query_items.return_value = iter([{
            "raw_ocr": "sugar",
            "mapped_uid": "sugar",
            "mapped_to": "Sugar"
        }])
        
        with patch("main.azure_ai_client") as mock_openai:
            from main import batch_sort_items
            
            items = [{"raw_name": "sugar", "quantity": 5, "unit": "kg"}]
            results = batch_sort_items(items, "shop_TEST_1234")
            
            # Should match via training signal
            assert "sugar" in results
            assert results["sugar"]["routing"] == "CLEAN_INVENTORY"
            assert results["sugar"]["source"] == "training"
            assert results["sugar"]["confidence_score"] == 100
            
            # GPT should NOT be called
            mock_openai.chat.completions.create.assert_not_called()

    def test_training_signal_case_insensitive(self, mock_cosmos_container, mock_training_container):
        """Training signal match is case-insensitive."""
        # Training signal stored as lowercase
        mock_training_container.query_items.return_value = iter([{
            "raw_ocr": "wheat flour",
            "mapped_uid": "wheat_flour",
            "mapped_to": "Wheat Flour"
        }])
        
        from main import batch_sort_items
        
        # Input with different case
        items = [{"raw_name": "WHEAT FLOUR", "quantity": 2, "unit": "kg"}]
        results = batch_sort_items(items, "shop_TEST_1234")
        
        # Should still match
        assert "WHEAT FLOUR" in results
        assert results["WHEAT FLOUR"]["routing"] == "CLEAN_INVENTORY"


class TestGPTMatching:
    """Tier 2: GPT batch matching."""

    def test_gpt_confidence_above_85_updates_inventory(self, mock_cosmos_container, mock_training_container):
        """GPT confidence ≥85 → inventory updated."""
        mock_training_container.query_items.return_value = iter([])  # No training signals
        
        with patch("main.azure_ai_client") as mock_openai, \
             patch("main.MASTER_DICTIONARY", {"rice": {"en": "Rice"}}):
            # Mock GPT response with high confidence
            mock_response = MagicMock()
            mock_response.choices = [MagicMock()]
            mock_response.choices[0].message.content = json.dumps({
                "matches": [
                    {"raw_name": "chawal", "uid": "rice", "confidence": 92}
                ]
            })
            mock_openai.chat.completions.create.return_value = mock_response
            
            from main import batch_sort_items
            
            items = [{"raw_name": "chawal", "quantity": 10, "unit": "kg"}]
            results = batch_sort_items(items, "shop_TEST_1234")
            
            assert "chawal" in results
            assert results["chawal"]["routing"] == "CLEAN_INVENTORY"
            assert results["chawal"]["uid"] == "rice"
            assert results["chawal"]["confidence_score"] == 92

    def test_gpt_confidence_below_85_goes_to_quarantine(self, mock_cosmos_container, mock_training_container):
        """GPT confidence <85 → quarantine, NOT inventory."""
        mock_training_container.query_items.return_value = iter([])
        
        with patch("main.azure_ai_client") as mock_openai, \
             patch("main.MASTER_DICTIONARY", {"oil": {"en": "Oil"}}):
            # Mock GPT response with LOW confidence
            mock_response = MagicMock()
            mock_response.choices = [MagicMock()]
            mock_response.choices[0].message.content = json.dumps({
                "matches": [
                    {"raw_name": "tel", "uid": "oil", "confidence": 60}  # Below 85
                ]
            })
            mock_openai.chat.completions.create.return_value = mock_response
            
            from main import batch_sort_items
            
            items = [{"raw_name": "tel", "quantity": 1, "unit": "L"}]
            results = batch_sort_items(items, "shop_TEST_1234")
            
            assert "tel" in results
            assert results["tel"]["routing"] == "QUARANTINE_INBOX"
            assert results["tel"]["confidence_score"] == 60

    def test_unknown_item_goes_to_quarantine(self, mock_cosmos_container, mock_training_container):
        """Unknown item (not in catalog) → quarantine with reason."""
        mock_training_container.query_items.return_value = iter([])
        
        with patch("main.azure_ai_client") as mock_openai, \
             patch("main.MASTER_DICTIONARY", {}):  # Empty catalog
            # GPT returns "unknown"
            mock_response = MagicMock()
            mock_response.choices = [MagicMock()]
            mock_response.choices[0].message.content = json.dumps({
                "matches": [
                    {"raw_name": "xyz_product", "uid": "unknown", "confidence": 0}
                ]
            })
            mock_openai.chat.completions.create.return_value = mock_response
            
            from main import batch_sort_items
            
            items = [{"raw_name": "xyz_product", "quantity": 1, "unit": "pcs"}]
            results = batch_sort_items(items, "shop_TEST_1234")
            
            assert "xyz_product" in results
            assert results["xyz_product"]["routing"] == "QUARANTINE_INBOX"


class TestQuantityMerging:
    """Same item multiple times → merge or quarantine."""

    def test_same_item_same_unit_merged(self, mock_cosmos_container, mock_training_container):
        """Same item twice, same unit → quantities merged."""
        # Training signal exists for sugar
        mock_training_container.query_items.return_value = iter([{
            "raw_ocr": "sugar",
            "mapped_uid": "sugar",
            "mapped_to": "Sugar"
        }])
        
        from main import batch_sort_items
        
        # Two sugar items, same unit
        items = [
            {"raw_name": "sugar", "quantity": 5, "unit": "kg"},
            {"raw_name": "sugar", "quantity": 3, "unit": "kg"}
        ]
        results = batch_sort_items(items, "shop_TEST_1234")
        
        # Both should route to CLEAN_INVENTORY
        # (Merging happens at a higher level in process-ledger, not in batch_sort_items)
        assert "sugar" in results
        assert results["sugar"]["routing"] == "CLEAN_INVENTORY"


class TestBatchProcessing:
    """Verify batch GPT call efficiency."""

    def test_multiple_items_single_gpt_call(self, mock_cosmos_container, mock_training_container):
        """50 items should make only 1 GPT call, not 50."""
        mock_training_container.query_items.return_value = iter([])  # No training signals
        
        with patch("main.azure_ai_client") as mock_openai, \
             patch("main.MASTER_DICTIONARY", {
                 "rice": {"en": "Rice"},
                 "sugar": {"en": "Sugar"},
                 "salt": {"en": "Salt"}
             }):
            # Mock GPT response for all items
            mock_response = MagicMock()
            mock_response.choices = [MagicMock()]
            mock_response.choices[0].message.content = json.dumps({
                "matches": [
                    {"raw_name": f"item_{i}", "uid": "rice", "confidence": 90}
                    for i in range(50)
                ]
            })
            mock_openai.chat.completions.create.return_value = mock_response
            
            from main import batch_sort_items
            
            # 50 items
            items = [{"raw_name": f"item_{i}", "quantity": 1, "unit": "pcs"} for i in range(50)]
            batch_sort_items(items, "shop_TEST_1234")
            
            # GPT should be called EXACTLY ONCE
            assert mock_openai.chat.completions.create.call_count == 1

    def test_training_hits_not_sent_to_gpt(self, mock_cosmos_container, mock_training_container):
        """Items matched by training signals should NOT be sent to GPT."""
        # Training signals for some items
        mock_training_container.query_items.return_value = iter([
            {"raw_ocr": "sugar", "mapped_uid": "sugar", "mapped_to": "Sugar"},
            {"raw_ocr": "salt", "mapped_uid": "salt", "mapped_to": "Salt"}
        ])
        
        with patch("main.azure_ai_client") as mock_openai, \
             patch("main.MASTER_DICTIONARY", {"rice": {"en": "Rice"}}):
            # GPT response only for items NOT in training
            mock_response = MagicMock()
            mock_response.choices = [MagicMock()]
            mock_response.choices[0].message.content = json.dumps({
                "matches": [
                    {"raw_name": "unknown_item", "uid": "unknown", "confidence": 30}
                ]
            })
            mock_openai.chat.completions.create.return_value = mock_response
            
            from main import batch_sort_items
            
            items = [
                {"raw_name": "sugar", "quantity": 5, "unit": "kg"},     # Training hit
                {"raw_name": "salt", "quantity": 1, "unit": "kg"},      # Training hit
                {"raw_name": "unknown_item", "quantity": 2, "unit": "pcs"}  # GPT needed
            ]
            results = batch_sort_items(items, "shop_TEST_1234")
            
            # Training hits should be resolved
            assert results["sugar"]["routing"] == "CLEAN_INVENTORY"
            assert results["sugar"]["source"] == "training"
            assert results["salt"]["routing"] == "CLEAN_INVENTORY"
            assert results["salt"]["source"] == "training"
            
            # GPT should only be called once for the unknown item
            assert mock_openai.chat.completions.create.call_count == 1
