# ── Recall AI — Async Job Queue ──────────────────────────────────────────────
# Uses Upstash Redis + RQ for background processing
# Processes OCR + GPT matching asynchronously to reduce latency

import os
import json
import uuid
import time
import logging
import base64
import requests
from datetime import datetime, timezone
from azure.cosmos import exceptions as cosmos_exceptions
from redis import Redis
from rq import Queue

logger = logging.getLogger(__name__)

# ── Redis Connection ─────────────────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL")
_redis_conn = None
_job_queue = None

def get_redis_connection():
    """Lazy init Redis connection. Returns None if REDIS_URL not configured."""
    global _redis_conn
    if _redis_conn is not None:
        return _redis_conn
    if not REDIS_URL:
        logger.warning("REDIS_URL not configured — job queue disabled")
        return None
    try:
        _redis_conn = Redis.from_url(REDIS_URL, decode_responses=False)
        _redis_conn.ping()
        logger.info("Redis connection established")
        return _redis_conn
    except Exception as e:
        logger.error(f"Redis connection failed: {e}")
        return None

def get_job_queue():
    """Get RQ queue instance."""
    global _job_queue
    if _job_queue is not None:
        return _job_queue
    conn = get_redis_connection()
    if conn is None:
        return None
    _job_queue = Queue("recall-ledger", connection=conn, default_timeout=120)
    return _job_queue

def is_queue_available() -> bool:
    """Check if job queue is available."""
    return get_job_queue() is not None

# ── Job Status Storage ───────────────────────────────────────────────────────
# Store job results in Redis with TTL (results expire after 1 hour)
JOB_RESULT_TTL = 3600  # 1 hour

def store_job_result(job_id: str, result: dict):
    """Store job result in Redis."""
    conn = get_redis_connection()
    if conn:
        conn.setex(f"job_result:{job_id}", JOB_RESULT_TTL, json.dumps(result))

def get_job_result(job_id: str):
    """Get job result from Redis."""
    conn = get_redis_connection()
    if conn:
        data = conn.get(f"job_result:{job_id}")
        if data:
            return json.loads(data)
    return None

def store_job_status(job_id: str, status: str, progress: str = None):
    """Store job status update."""
    conn = get_redis_connection()
    if conn:
        data = {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}
        if progress:
            data["progress"] = progress
        conn.setex(f"job_status:{job_id}", JOB_RESULT_TTL, json.dumps(data))

def get_job_status(job_id: str):
    """Get job status from Redis."""
    conn = get_redis_connection()
    if conn:
        data = conn.get(f"job_status:{job_id}")
        if data:
            return json.loads(data)
    return None

def store_job_owner(job_id: str, shop_id: str):
    """Store owning shop_id for job authorization checks."""
    conn = get_redis_connection()
    if conn:
        conn.setex(f"job_owner:{job_id}", JOB_RESULT_TTL, shop_id)

def get_job_owner(job_id: str):
    """Get owning shop_id for a job."""
    conn = get_redis_connection()
    if conn:
        data = conn.get(f"job_owner:{job_id}")
        if data:
            if isinstance(data, bytes):
                return data.decode("utf-8")
            return data
    return None


# ── Background Job Function ──────────────────────────────────────────────────
# This runs in the RQ worker process, not in the FastAPI server

def process_ledger_job(
    ledger_job_id: str,
    shop_id: str,
    scan_type: str,
    scan_id: str,  # Can be None but using str type for Python 3.9 compat
    image_bytes_b64: str,
    filename: str,
    content_type: str,
    plan: str,
    current_month: str,
    usage_doc_id: str,
    usage_exists: bool
):
    """
    Background job for ledger processing.
    Heavy lifting: Sarvam OCR → GPT extraction → batch matching → Cosmos writes.
    """
    # Import here to avoid circular imports and ensure fresh connections in worker
    from database import db
    from circuit_breaker import openai_circuit

    from openai import AzureOpenAI
    
    store_job_status(ledger_job_id, "processing", "Starting OCR...")
    container = None
    
    try:
        # Decode image bytes
        image_bytes = base64.b64decode(image_bytes_b64)
        
        azure_ai_client = AzureOpenAI(
            api_key=os.getenv("AZURE_OPENAI_API_KEY"),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview"),
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
            timeout=45.0,
        )
        
        container = db.get_container()
        
        # ── 1. GOOGLE VISION OCR ─────────────────────────────────────────────
        store_job_status(ledger_job_id, "processing", "Running OCR...")

        import base64 as b64lib
        t_ocr = time.time()
        GOOGLE_VISION_API_KEY = os.getenv("GOOGLE_VISION_API_KEY")
        vision_payload = {
            "requests": [{
                "image": {"content": b64lib.b64encode(image_bytes).decode("utf-8")},
                "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
                "imageContext": {"languageHints": ["hi", "mr", "gu", "en"]}
            }]
        }
        response = requests.post(
            f"https://vision.googleapis.com/v1/images:annotate?key={GOOGLE_VISION_API_KEY}",
            json=vision_payload,
            timeout=30.0
        )
        logger.info(f"[Job {ledger_job_id}] Google Vision OCR: {time.time()-t_ocr:.2f}s")

        if response.status_code != 200:
            logger.error(f"[Job {ledger_job_id}] Google Vision HTTP {response.status_code}: {response.text[:300]}")
            store_job_result(ledger_job_id, {"status": "error", "error": "OCR failed"})
            store_job_status(ledger_job_id, "failed")
            return

        raw_markdown = response.json().get("responses", [{}])[0].get("fullTextAnnotation", {}).get("text", "")
        if not raw_markdown:
            logger.warning(f"[Job {ledger_job_id}] Google Vision returned empty text")

    
        # ── 2. GPT EXTRACTION ────────────────────────────────────────────────
        store_job_status(ledger_job_id, "processing", "Extracting items...")
        
        if not openai_circuit.is_available():
            store_job_result(ledger_job_id, {"status": "error", "error": "OpenAI temporarily unavailable"})
            store_job_status(ledger_job_id, "failed")
            return
        
        t_gpt = time.time()
        gpt_response = azure_ai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": """You output only valid JSON containing an 'items' array.
Each item must have: raw_name (string), quantity (number), unit (string).
Rules for unit normalization — always use these exact unit strings:
- Weight: use 'kg' for kilograms, 'g' for grams
- Volume: use 'L' for litres, 'ml' for millilitres  
- Count: use 'pcs' for pieces, packets, units, nos, numbers
- If unit is ambiguous or missing: use 'pcs'
Never use: 'units', 'packets', 'nos', 'numbers', 'packet' — convert them to 'pcs'.
Never use: 'litre', 'liter', 'ltr' — convert to 'L'.
Never use: 'kilogram', 'kilo' — convert to 'kg'.
If the same item appears multiple times with the same unit, sum the quantities and return it once."""},
                {"role": "user", "content": f"Convert this OCR text to JSON array 'items'. Note: items may be written as 'ItemName - quantity unit' with a dash separator. Treat the dash as a separator between item name and quantity, not as part of the name: {raw_markdown}"}
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            timeout=45.0,
        )
        logger.info(f"[Job {ledger_job_id}] GPT-4o-mini: {time.time()-t_gpt:.2f}s")
        openai_circuit.record_success()
        
        try:
            structured_items = json.loads(gpt_response.choices[0].message.content).get("items", [])
            if not isinstance(structured_items, list):
                structured_items = []
        except (json.JSONDecodeError, AttributeError) as parse_err:
            logger.warning(f"[Job {ledger_job_id}] GPT parse error: {parse_err}")
            structured_items = []
        
        logger.info(f"[Job {ledger_job_id}] Extracted {len(structured_items)} items")
        
        # ── 3. BATCH MATCHING ────────────────────────────────────────────────
        store_job_status(ledger_job_id, "processing", "Matching items...")
        
        # Import batch_sort_items and other helpers
        from main import batch_sort_items, safe_float
        
        custom_items_query = "SELECT c.uid, c.standard_name FROM c WHERE c.shop_id = @shop AND STARTSWITH(c.uid, 'custom_') AND c.status = 'active' AND c.type = 'inventory'"
        custom_items = list(container.query_items(query=custom_items_query, parameters=[{"name": "@shop", "value": shop_id}], enable_cross_partition_query=True))
        inventory_query = (
            "SELECT c.id, c.shop_id, c.uid, c.standard_name, c.quantity, c.unit, c.status, c.type, c.last_updated "
            "FROM c WHERE c.shop_id = @shop AND c.status = 'active' AND c.type = 'inventory'"
        )
        inventory_docs = list(
            container.query_items(
                query=inventory_query,
                parameters=[{"name": "@shop", "value": shop_id}],
                enable_cross_partition_query=True,
            )
        )
        inventory_by_uid = {doc["uid"]: doc for doc in inventory_docs if doc.get("uid")}
        pending_inventory_upserts = {}
        pending_quarantine_writes = []
        
        results = {"clean_inventory": [], "quarantined": []}
        processed_in_batch: dict = {}
        
        sort_results = batch_sort_items(structured_items, shop_id)
        
        # ── 4. PROCESS ITEMS ─────────────────────────────────────────────────
        store_job_status(ledger_job_id, "processing", "Updating inventory...")
        
        for item in structured_items:
            raw_name = str(item.get("raw_name", "")).strip()
            qty = safe_float(item.get("quantity", 1.0))
            unit = str(item.get("unit", "unit"))
            qty_math = qty if scan_type == "IN" else -qty
            
            sort_result = sort_results.get(raw_name, {"routing": "QUARANTINE_INBOX", "raw_text": raw_name, "confidence_score": 0})
            uid_to_update, standard_name_to_use = None, None
            
            if sort_result["routing"] == "CLEAN_INVENTORY":
                uid_to_update, standard_name_to_use = sort_result["uid"], sort_result["standard_name"]
            else:
                if custom_items:
                    for ci in custom_items:
                        if ci["standard_name"].strip().lower() == raw_name.strip().lower():
                            uid_to_update, standard_name_to_use = ci["uid"], ci["standard_name"]
                            break
            
            # In-batch deduplication
            if uid_to_update:
                if uid_to_update in processed_in_batch:
                    prev_unit = processed_in_batch[uid_to_update]
                    if prev_unit == unit.lower().strip():
                        # Same item, same unit — SUM quantities instead of quarantining
                        if uid_to_update in pending_inventory_upserts:
                            pending_inventory_upserts[uid_to_update]["quantity"] += qty_math
                        else:
                            existing_item = inventory_by_uid.get(uid_to_update)
                            if existing_item:
                                existing_item["quantity"] = safe_float(existing_item.get("quantity", 0), 0) + qty_math
                                existing_item["last_updated"] = datetime.now(timezone.utc).isoformat()
                                pending_inventory_upserts[uid_to_update] = existing_item
                        continue
                    else:
                        quarantine_item = {
                            "id": str(uuid.uuid4()),
                            "shop_id": shop_id,
                            "type": "quarantine",
                            "raw_text": raw_name,
                            "quantity": qty,
                            "unit": unit,
                            "scan_type": scan_type,
                            "status": "needs_review",
                            "confidence_score": sort_result["confidence_score"] if sort_result else 0,
                            "quarantine_reason": f"Unit mismatch in same ledger: '{prev_unit}' vs '{unit}'",
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }
                        pending_quarantine_writes.append(quarantine_item)
                        results["quarantined"].append(quarantine_item)
                        continue
                else:
                    processed_in_batch[uid_to_update] = unit.lower().strip()
                    
            # Update or create inventory
            if uid_to_update:
                existing_item = inventory_by_uid.get(uid_to_update)
                
                if existing_item:
                    stored_unit = existing_item.get("unit", "").lower().strip()
                    incoming_unit = unit.lower().strip()
                    unit_mismatch = stored_unit and incoming_unit and stored_unit != incoming_unit
                    
                    if unit_mismatch:
                        quarantine_item = {
                            "id": str(uuid.uuid4()),
                            "shop_id": shop_id,
                            "type": "quarantine",
                            "raw_text": raw_name,
                            "quantity": qty,
                            "unit": unit,
                            "scan_type": scan_type,
                            "status": "needs_review",
                            "confidence_score": sort_result["confidence_score"] if sort_result else 0,
                            "quarantine_reason": f"Unit mismatch: stored as '{stored_unit}', scanned as '{incoming_unit}'",
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }
                        pending_quarantine_writes.append(quarantine_item)
                        results["quarantined"].append(quarantine_item)
                        continue
                    
                    existing_item["quantity"] = safe_float(existing_item.get("quantity", 0), 0) + qty_math
                    existing_item["last_updated"] = datetime.now(timezone.utc).isoformat()
                    pending_inventory_upserts[uid_to_update] = existing_item
                    results["clean_inventory"].append({"uid": uid_to_update, "updated": True})
                else:
                    new_item = {
                        "id": str(uuid.uuid4()),
                        "shop_id": shop_id,
                        "uid": uid_to_update,
                        "standard_name": standard_name_to_use,
                        "quantity": qty_math,
                        "unit": unit,
                        "status": "active",
                        "type": "inventory",
                        "last_updated": datetime.now(timezone.utc).isoformat()
                    }
                    inventory_by_uid[uid_to_update] = new_item
                    pending_inventory_upserts[uid_to_update] = new_item
                    results["clean_inventory"].append(new_item)
            else:
                quarantine_item = {
                    "id": str(uuid.uuid4()),
                    "shop_id": shop_id,
                    "type": "quarantine",
                    "raw_text": raw_name,
                    "quantity": qty,
                    "unit": unit,
                    "scan_type": scan_type,
                    "status": "needs_review",
                    "confidence_score": sort_result["confidence_score"] if sort_result else 0,
                    "quarantine_reason": "Low confidence match",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
                pending_quarantine_writes.append(quarantine_item)
                results["quarantined"].append(quarantine_item)

        for quarantine_item in pending_quarantine_writes:
            container.create_item(body=quarantine_item)

        for inventory_doc in pending_inventory_upserts.values():
            container.upsert_item(body=inventory_doc)
        
        # ── 5. RECORD IDEMPOTENCY & USAGE ────────────────────────────────────
        if scan_id:
            try:
                container.patch_item(
                    item=scan_id,
                    partition_key=shop_id,
                    patch_operations=[
                        {"op": "replace", "path": "/status", "value": "completed"},
                        {"op": "add", "path": "/processed_at", "value": datetime.now(timezone.utc).isoformat()},
                    ],
                )
            except cosmos_exceptions.CosmosResourceNotFoundError:
                container.create_item(body={
                    "id": scan_id,
                    "shop_id": shop_id,
                    "type": "processed_scan",
                    "status": "completed",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "ttl": 172800,
                })

        try:
            container.create_item(body={
                "id": usage_doc_id,
                "shop_id": shop_id,
                "month": current_month,
                "scans_this_month": 1,
                "status": "active",
                "type": "usage",
            })
        except cosmos_exceptions.CosmosResourceExistsError:
            container.patch_item(
                item=usage_doc_id,
                partition_key=shop_id,
                patch_operations=[
                    {"op": "incr", "path": "/scans_this_month", "value": 1},
                ],
            )
        
        # ── 6. STORE RESULT ──────────────────────────────────────────────────
        final_result = {
            "status": "success",
            "shop_id": shop_id,
            "processed_summary": {
                "clean": len(results["clean_inventory"]),
                "inbox": len(results["quarantined"])
            },
            "data": results
        }
        store_job_result(ledger_job_id, final_result)
        store_job_status(ledger_job_id, "completed")
        logger.info(f"[Job {ledger_job_id}] Completed: {len(results['clean_inventory'])} clean, {len(results['quarantined'])} quarantined")
        
    except Exception as e:
        logger.error(f"[Job {ledger_job_id}] Failed: {e}", exc_info=True)
        if scan_id and container is not None:
            try:
                container.delete_item(item=scan_id, partition_key=shop_id)
            except Exception as cleanup_err:
                logger.warning(f"[Job {ledger_job_id}] Failed to clear idempotency marker: {cleanup_err}")
        store_job_result(ledger_job_id, {"status": "error", "error": str(e)})
        store_job_status(ledger_job_id, "failed")
