import os
import asyncio
import httpx
import json
import uuid
import time
import logging
import base64
import threading
import subprocess
from collections import defaultdict
from datetime import datetime, timezone

import sentry_sdk
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query, Depends, Path, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import AzureOpenAI
from dotenv import load_dotenv
from azure.storage.blob import BlobServiceClient
from azure.cosmos import exceptions as cosmos_exceptions
from pydantic import BaseModel
from database import db
from auth import router as auth_router, get_current_shop
from payments import router as payments_router
from circuit_breaker import sarvam_circuit, openai_circuit
from job_queue import (
    is_queue_available, get_job_queue, get_job_status, get_job_result,
    store_job_status, store_job_owner, get_job_owner, process_ledger_job
)

# ── SENTRY (Error Tracking) ─────────────────────────────────────────────────
SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=0.2,
        environment=os.getenv("ENV", "development"),
    )

logger = logging.getLogger(__name__)

# ── RATE LIMITER ─────────────────────────────────────────────────────────────
_rate_store: dict = defaultdict(lambda: {"window_start": 0.0, "count": 0})
_rate_lock = threading.Lock()

RATE_LIMITS = {
    "process-ledger":     {"requests": 5,  "window": 60},
    "sync-mapped-item":   {"requests": 30, "window": 60},
    "create-custom-item": {"requests": 20, "window": 60},
    "adjust-inventory":   {"requests": 30, "window": 60},
    "default":            {"requests": 60, "window": 60},
}

PLAN_MONTHLY_LIMITS = {"free": 60, "basic": 300, "pro": None}

def check_rate_limit(shop_id: str, endpoint: str):
    limit = RATE_LIMITS.get(endpoint, RATE_LIMITS["default"])
    key = f"{shop_id}:{endpoint}"
    now = time.time()
    with _rate_lock:
        entry = _rate_store[key]
        if now - entry["window_start"] > limit["window"]:
            entry["window_start"] = now
            entry["count"] = 0
        entry["count"] += 1
        count = entry["count"]
    if count > limit["requests"]:
        retry = int(limit["window"] - (time.time() - _rate_store[key]["window_start"]))
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded. Max {limit['requests']} req/min. Retry in {retry}s.")
# ─────────────────────────────────────────────────────────────────────────────

# 1. Environment Initialization
load_dotenv() 

AZURE_STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
CONTAINER_NAME = "kirana-ledgers"

SARVAM_API_URL = "https://api.sarvam.ai/vision"
SARVAM_HEADERS = {"api-subscription-key": os.getenv("SARVAM_API_KEY")}

azure_ai_client = AzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    timeout=45.0,
)

blob_service_client = None
blob_container_client = None

def get_blob_container_client():
    """Lazy initialization of blob clients. Raises HTTPException(503) if unavailable."""
    global blob_service_client, blob_container_client
    if blob_container_client is not None:
        return blob_container_client
    try:
        if not AZURE_STORAGE_CONNECTION_STRING:
            raise ValueError("AZURE_STORAGE_CONNECTION_STRING not configured")
        blob_service_client = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
        blob_container_client = blob_service_client.get_container_client(CONTAINER_NAME)
        return blob_container_client
    except Exception as e:
        logger.error(f"Blob storage initialization failed: {e}")
        raise HTTPException(status_code=503, detail="Blob storage unavailable")

app = FastAPI(title="Recall AI Enterprise Engine", version="5.0.0")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:8081,http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-Admin-Key"],
)

# Register auth routes
app.include_router(auth_router)
app.include_router(payments_router)

# ── HEALTH CHECK ─────────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    checks = {}
    healthy = True

    # Cosmos DB
    try:
        container = db.get_container()
        list(container.query_items(query="SELECT VALUE 1", enable_cross_partition_query=True, max_item_count=1))
        checks["cosmos_db"] = "ok"
    except Exception as e:
        checks["cosmos_db"] = f"error: {type(e).__name__}"
        healthy = False

    # Master catalog loaded
    checks["master_catalog"] = "ok" if _catalog_list and len(_catalog_list) > 0 else "error: not loaded"
    if checks["master_catalog"] != "ok":
        healthy = False

    # Azure Blob Storage
    try:
        get_blob_container_client().get_container_properties()
        checks["blob_storage"] = "ok"
    except HTTPException:
        checks["blob_storage"] = "error: not configured"
        healthy = False
    except Exception as e:
        checks["blob_storage"] = f"error: {type(e).__name__}"
        healthy = False

    # Redis Job Queue (optional — doesn't affect health status)
    checks["job_queue"] = "ok" if is_queue_available() else "disabled"

    return JSONResponse(
        status_code=200 if healthy else 503,
        content={
            "status": "healthy" if healthy else "degraded",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "checks": checks,
            "circuits": {
                "sarvam_ocr": sarvam_circuit.status(),
                "azure_openai": openai_circuit.status(),
            },
        },
    )
# ─────────────────────────────────────────────────────────────────────────────

# Load master catalog from file — edit master_catalog.json to add new items, never touch this file
_catalog_path = os.path.join(os.path.dirname(__file__), "master_catalog.json")
with open(_catalog_path, "r", encoding="utf-8") as f:
    _catalog_list = json.load(f)

MASTER_DICTIONARY = {item["uid"]: {"en": item["en"], "aliases": item["aliases"]} for item in _catalog_list}

# Pre-computed catalog string for batch GPT calls — avoids re-serializing on every request
_CATALOG_FOR_GPT = json.dumps(
    [{"uid": uid, "name": data["en"], "aliases": data.get("aliases", [])} for uid, data in MASTER_DICTIONARY.items()],
    ensure_ascii=False
)

CONFIDENCE_THRESHOLD = 85

def batch_sort_items(items: list, shop_id: str) -> dict:
    """
    Batch match items to master catalog.
    Returns dict keyed by raw_name with sort results.
    
    Flow:
    1. Tier 1: Training signal lookup (one query for all items)
    2. Tier 2: Batch GPT call for all Tier 1 misses (single API call)
    3. Items below confidence threshold → quarantine
    """
    if not items:
        return {}
    
    results = {}
    tier1_misses = []
    
    # ── TIER 1: Training signals — batch lookup ──────────────────────────────
    # Query all training signals for this shop, then match in-memory
    if shop_id:
        try:
            training_signals = list(db.get_training_container().query_items(
                query="""
                    SELECT c.raw_ocr, c.mapped_uid, c.mapped_to FROM c
                    WHERE c.type = 'training_signal' AND c.shop_id = @shop_id
                """,
                parameters=[{"name": "@shop_id", "value": shop_id}],
                enable_cross_partition_query=True
            ))
            # Build lookup dict: normalized raw_ocr → {uid, name}
            training_lookup = {sig["raw_ocr"].strip().lower(): {"uid": sig["mapped_uid"], "name": sig["mapped_to"]} for sig in training_signals}
        except Exception as e:
            logger.warning(f"Training signal batch lookup failed (non-critical): {e}")
            training_lookup = {}
    else:
        training_lookup = {}
    
    # Match each item against training signals
    for item in items:
        raw_name = str(item.get("raw_name", "")).strip()
        if not raw_name:
            results[raw_name] = {"routing": "QUARANTINE_INBOX", "raw_text": "Unknown", "confidence_score": 0}
            continue
        
        normalized = raw_name.lower()
        if normalized in training_lookup:
            hit = training_lookup[normalized]
            logger.info(f"Training hit: '{raw_name}' → '{hit['name']}' (learned from owner)")
            results[raw_name] = {
                "routing": "CLEAN_INVENTORY",
                "uid": hit["uid"],
                "standard_name": raw_name,
                "confidence_score": 100,
                "source": "training"
            }
        else:
            tier1_misses.append(raw_name)
    # ─────────────────────────────────────────────────────────────────────────
    
    # ── TIER 2: Batch GPT call for all misses ────────────────────────────────
    if tier1_misses:
        try:
            items_str = json.dumps(tier1_misses, ensure_ascii=False)
            
            gpt_response = azure_ai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": f"""You are a multilingual product matcher for Indian kirana stores.
Given a list of raw OCR product names (may be in English, Gujarati, Hindi, or Marathi) and a catalog,
return a JSON object with "matches": an array of objects, one per input item IN THE SAME ORDER.

Each object must have:
- "raw_name": the exact input string
- "uid": the matching catalog uid, or "unknown" if no confident match
- "confidence": a number 0-100

Rules:
- Match against both "name" AND "aliases" in the catalog
- Aliases include regional spellings: "khand","chini","ખાંડ","साखर" all match Sugar
- "दही" matches alias "दही" in Curd, "mithu" matches Salt, "ઘઉં" matches Wheat
- Only return a uid from this catalog — NEVER guess outside the list
- Only return a uid if confident (confidence >= {CONFIDENCE_THRESHOLD})
- If ambiguous or not in catalog → return uid: "unknown"
- Return ONLY the JSON object, nothing else

Catalog: {_CATALOG_FOR_GPT}"""},
                    {"role": "user", "content": f"Products to match: {items_str}"}
                ],
                response_format={"type": "json_object"},
                temperature=0,
                max_tokens=50 * len(tier1_misses),  # ~50 tokens per item
                timeout=45.0,
            )
            
            gpt_result = json.loads(gpt_response.choices[0].message.content)
            matches = gpt_result.get("matches", [])
            
            logger.info(f"Batch GPT: {len(tier1_misses)} items matched in single call")
            
            # Process GPT results
            for match in matches:
                raw_name = match.get("raw_name", "")
                matched_uid = match.get("uid", "unknown")
                confidence = match.get("confidence", 0)
                
                logger.info(f"GPT match: '{raw_name}' → uid={matched_uid} confidence={confidence}")
                
                if matched_uid != "unknown" and matched_uid in MASTER_DICTIONARY and confidence >= CONFIDENCE_THRESHOLD:
                    results[raw_name] = {
                        "routing": "CLEAN_INVENTORY",
                        "uid": matched_uid,
                        "standard_name": raw_name,
                        "confidence_score": confidence,
                        "source": "gpt"
                    }
                else:
                    results[raw_name] = {"routing": "QUARANTINE_INBOX", "raw_text": raw_name, "confidence_score": confidence}
            
            # Handle any items not in GPT response (shouldn't happen, but be safe)
            for raw_name in tier1_misses:
                if raw_name not in results:
                    logger.warning(f"GPT missed item '{raw_name}' — sending to quarantine")
                    results[raw_name] = {"routing": "QUARANTINE_INBOX", "raw_text": raw_name, "confidence_score": 0}
                    
        except Exception as e:
            logger.warning(f"Batch GPT match failed (non-critical): {e}")
            # Fallback: all misses go to quarantine
            for raw_name in tier1_misses:
                if raw_name not in results:
                    results[raw_name] = {"routing": "QUARANTINE_INBOX", "raw_text": raw_name, "confidence_score": 0}
    # ─────────────────────────────────────────────────────────────────────────
    
    return results

def safe_float(value, default=1.0):
    try:
        return float(value)
    except (ValueError, TypeError):
        return default

async def run_blocking(func, *args, **kwargs):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: func(*args, **kwargs))

# 2. Main Processing Pipeline
@app.post("/process-ledger")
async def process_ledger(
    file: UploadFile = File(...), 
    scan_type: str = Form("IN"),
    scan_id: str = Form(None),
    current_shop: dict = Depends(get_current_shop)
):
    shop_id = current_shop["shop_id"]
    check_rate_limit(shop_id, "process-ledger")
    container = await run_blocking(db.get_container)
    scan_marker_created = False

    # --- 2. BUSINESS GATEKEEPER ---
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    usage_doc_id = f"usage_{shop_id}_{current_month}"
    usage_query = "SELECT c.scans_this_month FROM c WHERE c.id = @usage_id AND c.type = 'usage'"
    usage_records = await run_blocking(
        lambda: list(
            container.query_items(
                query=usage_query,
                parameters=[{"name": "@usage_id", "value": usage_doc_id}],
                enable_cross_partition_query=True,
            )
        )
    )
    current_scans = usage_records[0].get("scans_this_month", 0) if usage_records else 0

    plan = current_shop.get("plan", "free")
    monthly_limit = PLAN_MONTHLY_LIMITS.get(plan, 60)
    if monthly_limit is not None and current_scans >= monthly_limit:
        raise HTTPException(status_code=403, detail=f"MONTHLY_LIMIT_EXCEEDED:{plan.upper()}:{monthly_limit}")

    # --- 3. BACKEND IDEMPOTENCY GATEKEEPER (ATOMIC) ---
    if scan_id:
        try:
            await run_blocking(
                container.create_item,
                body={
                    "id": scan_id,
                    "shop_id": shop_id,
                    "type": "processed_scan",
                    "status": "processing",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "ttl": 172800,
                },
            )
            scan_marker_created = True
        except cosmos_exceptions.CosmosResourceExistsError:
            logger.info(f"Idempotency Triggered: Scan {scan_id} already processed. Returning 200 OK.")
            return {"status": "success", "message": "Already processed", "data": {"clean_inventory": [], "quarantined": []}}

    # --- 3. ARCHIVE ---
    image_bytes = await file.read()
    unique_filename = f"{shop_id}_{uuid.uuid4().hex}_{file.filename}"
    try:
        await run_blocking(
            lambda: get_blob_container_client().get_blob_client(unique_filename).upload_blob(
                image_bytes,
                overwrite=True,
            )
        )
    except HTTPException:
        logger.warning("Blob storage unavailable, skipping archive")
    except Exception as e:
        logger.warning(f"Blob warning: {e}")

    # --- 4. ASYNC JOB QUEUE (if available) ---
    # Enqueue heavy processing (OCR + GPT + matching) and return immediately
    # Mobile polls /job-status/{job_id} for results
    if await run_blocking(is_queue_available):
        job_id = str(uuid.uuid4())
        try:
            queue = await run_blocking(get_job_queue)
            await run_blocking(
                queue.enqueue,
                process_ledger_job,
                job_id=job_id,
                ledger_job_id=job_id,
                shop_id=shop_id,
                scan_type=scan_type,
                scan_id=scan_id,
                image_bytes_b64=base64.b64encode(image_bytes).decode('utf-8'),
                filename=file.filename,
                content_type=file.content_type,
                plan=plan,
                current_month=current_month,
                usage_doc_id=usage_doc_id,
                usage_exists=bool(usage_records),
                job_timeout=120,
            )
            await run_blocking(store_job_owner, job_id, shop_id)
            await run_blocking(store_job_status, job_id, "queued", "Waiting for worker...")

            # ── BURST WORKER — wake on demand, sleep when queue empty ────────
            # Spawns RQ worker in --burst mode: processes all jobs then exits.
            # Zero Redis commands when idle. Fire and forget — do not await.
            redis_url = os.getenv("REDIS_URL", "")
            if redis_url:
                subprocess.Popen(
                    ["rq", "worker", "--burst", "--url", redis_url, "recall-ledger"],
                    close_fds=True
                )
                logger.info(f"Burst worker triggered for job {job_id}")
            # ────────────────────────────────────────────────────────────────

            logger.info(f"Job {job_id} enqueued for shop {shop_id}")
            return {
                "status": "processing",
                "job_id": job_id,
                "message": "Scan queued for processing. Poll /job-status/{job_id} for results."
            }
        except Exception as e:
            logger.warning(f"Job queue failed, falling back to sync: {e}")
            # Fall through to synchronous processing

    # --- 5. SYNCHRONOUS FALLBACK (when Redis unavailable) ---
    # Same processing as background job, but inline
    # --- 4. AI PIPELINE ---
    try:
        if not sarvam_circuit.is_available():
            raise HTTPException(status_code=503, detail="Sarvam OCR temporarily unavailable (circuit open)")

        files = {"file": (file.filename, image_bytes, file.content_type)}
        async with httpx.AsyncClient() as client:
            t_sarvam = time.time()
            response = await client.post(SARVAM_API_URL, headers=SARVAM_HEADERS, files=files, data={"prompt_type": "default_ocr"}, timeout=45.0)
            logger.info(f"Sarvam OCR: {time.time()-t_sarvam:.2f}s")
        if response.status_code != 200:
            sarvam_circuit.record_failure()
            raise HTTPException(status_code=500, detail="Sarvam Failed")
        sarvam_circuit.record_success()
        
        raw_markdown = response.json().get("message", response.json().get("text", str(response.json())))
        
        if not openai_circuit.is_available():
            raise HTTPException(status_code=503, detail="OpenAI temporarily unavailable (circuit open)")

        t_gpt = time.time()
        gpt_response = await run_blocking(
            lambda: azure_ai_client.chat.completions.create(
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
                    {"role": "user", "content": f"Convert this OCR text to JSON array 'items': {raw_markdown}"}
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
                timeout=45.0,
            )
        )
        logger.info(f"GPT-4o-mini: {time.time()-t_gpt:.2f}s")
        openai_circuit.record_success()
        try:
            structured_items = json.loads(gpt_response.choices[0].message.content).get("items", [])
            if not isinstance(structured_items, list):
                structured_items = []
        except (json.JSONDecodeError, AttributeError) as parse_err:
            logger.warning(f"GPT parse error: {parse_err} — raw: {gpt_response.choices[0].message.content}")
            structured_items = []
        logger.info(f"Extracted {len(structured_items)} items: {structured_items}")
        
        custom_items_query = "SELECT c.uid, c.standard_name FROM c WHERE c.shop_id = @shop AND STARTSWITH(c.uid, 'custom_') AND c.status = 'active' AND c.type = 'inventory'"
        custom_items = await run_blocking(
            lambda: list(
                container.query_items(
                    query=custom_items_query,
                    parameters=[{"name": "@shop", "value": shop_id}],
                    enable_cross_partition_query=True,
                )
            )
        )

        inventory_query = (
            "SELECT c.id, c.shop_id, c.uid, c.standard_name, c.quantity, c.unit, c.status, c.type, c.last_updated "
            "FROM c WHERE c.shop_id = @shop AND c.status = 'active' AND c.type = 'inventory'"
        )
        inventory_docs = await run_blocking(
            lambda: list(
                container.query_items(
                    query=inventory_query,
                    parameters=[{"name": "@shop", "value": shop_id}],
                    enable_cross_partition_query=True,
                )
            )
        )
        inventory_by_uid = {doc["uid"]: doc for doc in inventory_docs if doc.get("uid")}
        pending_inventory_upserts = {}
        pending_quarantine_writes = []
        
        results = {"clean_inventory": [], "quarantined": []}
        # Track UIDs already processed in this scan batch
        # Prevents double-counting when same item appears twice on one ledger
        processed_in_batch: dict = {}  # uid → unit already seen this scan

        # ── BATCH MATCHING: Single GPT call for all items ────────────────────
        # Tier 1 (training signals) runs first, then Tier 2 (GPT) for misses
        # Cost: 50 items → 1 GPT call instead of 50 → ~70% cost reduction
        sort_results = await run_blocking(batch_sort_items, structured_items, shop_id)
        # ────────────────────────────────────────────────────────────────────

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
                # Custom items — exact match only (owner typed these names themselves)
                if custom_items:
                    for ci in custom_items:
                        if ci["standard_name"].strip().lower() == raw_name.strip().lower():
                            uid_to_update, standard_name_to_use = ci["uid"], ci["standard_name"]
                            break

            # --- IN-BATCH DEDUPLICATION ---
            # If same UID already processed in this scan with same unit → merge qty
            # If same UID but different unit → quarantine the duplicate
            if uid_to_update:
                if uid_to_update in processed_in_batch:
                    prev_unit = processed_in_batch[uid_to_update]
                    if prev_unit == unit.lower().strip():
                        # Same item, same unit — merge into previous entry, skip this one
                        logger.warning(f"Dedup: '{raw_name}' already processed this batch, merging qty")
                        # Update the already-queued qty by patching the Cosmos record again
                        # Just quarantine with a note — safer than double-patching
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
                            "quarantine_reason": "Duplicate in same ledger — verify manually",
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }
                        pending_quarantine_writes.append(quarantine_item)
                        results["quarantined"].append(quarantine_item)
                        continue
                    else:
                        # Same item, different unit — quarantine
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

            # --- 5. ATOMIC PATCHES (No more Race Conditions) ---
            if uid_to_update:
                existing_item = inventory_by_uid.get(uid_to_update)

                if existing_item:
                    # --- UNIT MISMATCH GUARD ---
                    # If item exists but unit is different (e.g. "ml" vs "units"),
                    # don't blindly add up — send to quarantine for human review
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
                    new_item = {"id": str(uuid.uuid4()), "shop_id": shop_id, "uid": uid_to_update, "standard_name": standard_name_to_use, "quantity": qty_math, "unit": unit, "status": "active", "type": "inventory", "last_updated": datetime.now(timezone.utc).isoformat()}
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
            await run_blocking(container.create_item, body=quarantine_item)

        for inventory_doc in pending_inventory_upserts.values():
            await run_blocking(container.upsert_item, body=inventory_doc)

        # --- 6. RECORD IDEMPOTENCY & USAGE ---
        if scan_id and scan_marker_created:
            await run_blocking(
                container.patch_item,
                item=scan_id,
                partition_key=shop_id,
                patch_operations=[
                    {"op": "replace", "path": "/status", "value": "completed"},
                    {"op": "add", "path": "/processed_at", "value": datetime.now(timezone.utc).isoformat()},
                ],
            )

        # Calculate metrics for this scan
        items_processed_count = len(structured_items)
        tier1_hits_count = sum(1 for r in sort_results.values() if r.get("source") == "training")
        quarantine_count = len(results["quarantined"])

        try:
            await run_blocking(
                container.create_item,
                body={
                    "id": usage_doc_id,
                    "shop_id": shop_id,
                    "month": current_month,
                    "scans_this_month": 1,
                    "items_processed_this_month": items_processed_count,
                    "tier1_hits_this_month": tier1_hits_count,
                    "quarantine_this_month": quarantine_count,
                    "status": "active",
                    "type": "usage",
                    "last_updated": datetime.now(timezone.utc).isoformat(),
                },
            )
        except cosmos_exceptions.CosmosResourceExistsError:
            await run_blocking(
                container.patch_item,
                item=usage_doc_id,
                partition_key=shop_id,
                patch_operations=[
                    {"op": "incr", "path": "/scans_this_month", "value": 1},
                    {"op": "incr", "path": "/items_processed_this_month", "value": items_processed_count},
                    {"op": "incr", "path": "/tier1_hits_this_month", "value": tier1_hits_count},
                    {"op": "incr", "path": "/quarantine_this_month", "value": quarantine_count},
                    {"op": "replace", "path": "/last_updated", "value": datetime.now(timezone.utc).isoformat()},
                ],
            )

        return {"status": "success", "shop_id": shop_id, "processed_summary": {"clean": len(results["clean_inventory"]), "inbox": len(results["quarantined"])}, "data": results}

    except HTTPException:
        if scan_id and scan_marker_created:
            try:
                await run_blocking(container.delete_item, item=scan_id, partition_key=shop_id)
            except Exception as cleanup_err:
                logger.warning(f"Failed to clear idempotency marker after HTTPException: {cleanup_err}")
        raise
    except Exception as e:
        if scan_id and scan_marker_created:
            try:
                await run_blocking(container.delete_item, item=scan_id, partition_key=shop_id)
            except Exception as cleanup_err:
                logger.warning(f"Failed to clear idempotency marker after failure: {cleanup_err}")
        logger.error(f"Pipeline error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# ── JOB STATUS ENDPOINT ──────────────────────────────────────────────────────
# Protected endpoint — only job owner can read status
# Mobile polls this after receiving job_id from /process-ledger

@app.get("/job-status/{job_id}")
def check_job_status(
    job_id: str = Path(..., description="Job ID returned from /process-ledger"),
    current_shop: dict = Depends(get_current_shop),
):
    """
    Poll for job completion status.
    Returns: status (queued/processing/completed/failed), progress, result (when completed)
    """
    owner_shop_id = get_job_owner(job_id)
    if not owner_shop_id:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    if owner_shop_id != current_shop["shop_id"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Check job status
    status_data = get_job_status(job_id)
    if not status_data:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    
    response = {
        "job_id": job_id,
        "status": status_data.get("status", "unknown"),
        "updated_at": status_data.get("updated_at")
    }
    
    if "progress" in status_data:
        response["progress"] = status_data["progress"]
    
    # If completed or failed, include the result
    if status_data.get("status") in ("completed", "failed"):
        result = get_job_result(job_id)
        if result:
            response["result"] = result
    
    return response

class MappedItemPayload(BaseModel): 
    shop_id: str
    uid: str
    standard_name: str
    quantity: float
    unit: str
    scan_type: str
    raw_text: str = ""  # what OCR originally read — used for training signal
    quarantine_id: str = ""  # ID of quarantine record to resolve when owner maps this item

@app.post("/sync-mapped-item")
def sync_mapped_item(payload: MappedItemPayload, current_shop: dict = Depends(get_current_shop)):
    check_rate_limit(payload.shop_id, "sync-mapped-item")
    if payload.shop_id != current_shop["shop_id"]:
        raise HTTPException(status_code=403, detail="Shop ID mismatch.")
    try:
        container = db.get_container()
        qty_math = payload.quantity if payload.scan_type == "IN" else -payload.quantity
        
        query = "SELECT c.id FROM c WHERE c.shop_id = @shop AND c.uid = @uid AND c.status = 'active' AND c.type = 'inventory'"
        existing_items = list(container.query_items(query=query, parameters=[{"name": "@shop", "value": payload.shop_id}, {"name": "@uid", "value": payload.uid}], enable_cross_partition_query=True))

        if existing_items:
            doc_id = existing_items[0]['id']
            container.patch_item(
                item=doc_id, partition_key=payload.shop_id,
                patch_operations=[
                    {'op': 'incr', 'path': '/quantity', 'value': qty_math},
                    {'op': 'replace', 'path': '/last_updated', 'value': datetime.now(timezone.utc).isoformat()}
                ]
            )
        else:
            new_item = {"id": str(uuid.uuid4()), "shop_id": payload.shop_id, "uid": payload.uid, "standard_name": payload.standard_name, "quantity": qty_math, "unit": payload.unit, "status": "active", "type": "inventory", "last_updated": datetime.now(timezone.utc).isoformat()}
            container.create_item(body=new_item)

        # ── TRAINING SIGNAL ──────────────────────────────────────────────────
        # Every manual mapping = one labeled OCR training example
        # raw_text is what OCR extracted, standard_name is what owner corrected it to
        # This data trains future matching models — never delete these records
        if payload.raw_text and payload.raw_text.strip() and payload.raw_text.strip().lower() != payload.standard_name.strip().lower():
            try:
                training_doc = {
                    "id": str(uuid.uuid4()),
                    "type": "training_signal",
                    "shop_id": payload.shop_id,
                    "raw_ocr": payload.raw_text.strip(),
                    "mapped_to": payload.standard_name.strip(),
                    "mapped_uid": payload.uid,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
                db.get_training_container().create_item(body=training_doc)
                logger.info(f"Training signal saved: '{payload.raw_text}' → '{payload.standard_name}'")
            except Exception as te:
                # Non-critical — inventory already saved, log and continue
                logger.warning(f"Training signal write failed (non-critical): {te}")
        # ────────────────────────────────────────────────────────────────────

        # ── CLOSE QUARANTINE RECORD ──────────────────────────────────────────
        # When owner resolves a quarantine item, mark it as resolved
        if payload.quarantine_id and payload.quarantine_id.strip():
            try:
                container.patch_item(
                    item=payload.quarantine_id,
                    partition_key=payload.shop_id,
                    patch_operations=[
                        {'op': 'replace', 'path': '/status', 'value': 'resolved'},
                        {'op': 'add', 'path': '/resolved_at', 'value': datetime.now(timezone.utc).isoformat()},
                        {'op': 'add', 'path': '/resolved_to_uid', 'value': payload.uid}
                    ]
                )
                logger.info(f"Quarantine record {payload.quarantine_id} resolved → {payload.uid}")
            except Exception as qe:
                # Non-critical — inventory already saved, log and continue
                logger.warning(f"Quarantine resolution failed (non-critical): {qe}")
        # ────────────────────────────────────────────────────────────────────

        return {"status": "success", "message": "Synced"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sync mapped item error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Sync failed.")

class CustomItemPayload(BaseModel):
    shop_id: str
    custom_name: str
    quantity: float
    unit: str
    scan_type: str

@app.post("/create-custom-item")
def create_custom_item(payload: CustomItemPayload, current_shop: dict = Depends(get_current_shop)):
    check_rate_limit(payload.shop_id, "create-custom-item")
    if payload.shop_id != current_shop["shop_id"]:
        raise HTTPException(status_code=403, detail="Shop ID mismatch.")
    try:
        container = db.get_container()

        # 1. Generate a stable custom UID based on name (so duplicates don't get created)
        safe_name = payload.custom_name.strip().lower().replace(" ", "_")
        custom_uid = f"custom_{safe_name}_{uuid.uuid4().hex[:6]}"

        qty_math = payload.quantity if payload.scan_type == "IN" else -payload.quantity

        # 2. Check if a custom item with this name already exists for this shop
        existing_query = "SELECT c.id, c.uid FROM c WHERE c.shop_id = @shop AND c.standard_name = @name AND STARTSWITH(c.uid, 'custom_') AND c.status = 'active' AND c.type = 'inventory'"
        existing = list(container.query_items(
            query=existing_query,
            parameters=[
                {"name": "@shop", "value": payload.shop_id},
                {"name": "@name", "value": payload.custom_name.strip()}
            ],
            enable_cross_partition_query=True
        ))

        if existing:
            # Item already exists — just patch quantity
            doc_id = existing[0]['id']
            custom_uid = existing[0]['uid']
            container.patch_item(
                item=doc_id,
                partition_key=payload.shop_id,
                patch_operations=[
                    {'op': 'incr', 'path': '/quantity', 'value': qty_math},
                    {'op': 'replace', 'path': '/last_updated', 'value': datetime.now(timezone.utc).isoformat()}
                ]
            )
            return {
                "status": "success",
                "message": "Patched existing custom item",
                "data": {"uid": custom_uid, "standard_name": payload.custom_name.strip()}
            }

        # 3. Create brand new custom item
        new_item = {
            "id": str(uuid.uuid4()),
            "shop_id": payload.shop_id,
            "uid": custom_uid,
            "standard_name": payload.custom_name.strip(),
            "quantity": qty_math,
            "unit": payload.unit,
            "status": "active",
            "type": "inventory",
            "last_updated": datetime.now(timezone.utc).isoformat()
        }
        container.create_item(body=new_item)

        return {
            "status": "success",
            "message": "Custom item created",
            "data": {"uid": custom_uid, "standard_name": payload.custom_name.strip()}
        }

    except Exception as e:
        logger.error(f"Custom item error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create custom item.")


class AdjustInventoryPayload(BaseModel):
    shop_id: str
    uid: str
    new_quantity: float

@app.post("/adjust-inventory")
def adjust_inventory(payload: AdjustInventoryPayload, current_shop: dict = Depends(get_current_shop)):
    check_rate_limit(payload.shop_id, "adjust-inventory")
    if payload.shop_id != current_shop["shop_id"]:
        raise HTTPException(status_code=403, detail="Shop ID mismatch.")
    try:
        container = db.get_container()

        query = "SELECT c.id FROM c WHERE c.shop_id = @shop AND c.uid = @uid AND c.status = 'active' AND c.type = 'inventory'"
        existing = list(container.query_items(
            query=query,
            parameters=[
                {"name": "@shop", "value": payload.shop_id},
                {"name": "@uid", "value": payload.uid}
            ],
            enable_cross_partition_query=True
        ))

        if not existing:
            raise HTTPException(status_code=404, detail="Item not found in inventory.")

        doc_id = existing[0]['id']
        container.patch_item(
            item=doc_id,
            partition_key=payload.shop_id,
            patch_operations=[
                {'op': 'replace', 'path': '/quantity', 'value': payload.new_quantity},
                {'op': 'replace', 'path': '/last_updated', 'value': datetime.now(timezone.utc).isoformat()}
            ]
        )
        return {"status": "success", "message": f"Quantity updated to {payload.new_quantity}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Adjust inventory error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to adjust inventory.")


@app.get("/sync-custom-dictionary")
def sync_custom_dictionary(current_shop: dict = Depends(get_current_shop)):
    check_rate_limit(current_shop["shop_id"], "default")
    shop_id = current_shop["shop_id"]
    try:
        container = db.get_container()
        query = "SELECT c.uid, c.standard_name FROM c WHERE c.shop_id = @shop AND STARTSWITH(c.uid, 'custom_') AND c.status = 'active' AND c.type = 'inventory'"
        items = list(container.query_items(
            query=query,
            parameters=[{"name": "@shop", "value": shop_id}],
            enable_cross_partition_query=True
        ))
        return {"status": "success", "data": items}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch custom dictionary.")


# Ensure /inventory and other endpoints use AND c.type = 'inventory'
@app.get("/inventory")
def get_inventory(current_shop: dict = Depends(get_current_shop)):
    try:
        shop_id = current_shop["shop_id"]
        container = db.get_container()
        query = "SELECT c.uid, c.standard_name, c.quantity, c.unit, c.last_updated FROM c WHERE c.shop_id = @shop AND c.status = 'active' AND c.type = 'inventory'"
        items = list(container.query_items(query=query, parameters=[{"name": "@shop", "value": shop_id}], enable_cross_partition_query=True))
        return {"status": "success", "total_items": len(items), "data": sorted(items, key=lambda x: x["standard_name"].lower())}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch.")

# ── ANALYTICS ENDPOINT ────────────────────────────────────────────────────────
# Thomas asked: "Can you see monthly active users on your app?"
# This endpoint powers the admin dashboard
@app.get("/master-catalog")
def get_master_catalog(current_shop: dict = Depends(get_current_shop)):
    """
    Returns the full master catalog + a version hash.
    Mobile checks version first — only re-syncs if catalog changed.
    Version is a hash of the catalog content, so it auto-updates when you edit master_catalog.json.
    """
    import hashlib
    catalog_version = hashlib.md5(json.dumps(_catalog_list, sort_keys=True).encode()).hexdigest()[:8]
    return {
        "status": "success",
        "version": catalog_version,
        "total": len(_catalog_list),
        "data": _catalog_list
    }

@app.get("/analytics")
def get_analytics(month: str = Query(None), current_shop: dict = Depends(get_current_shop)):
    try:
        container = db.get_container()
        current_month = month or datetime.now(timezone.utc).strftime("%Y-%m")

        # 1. Monthly Active Shops (unique shop_ids with scans this month)
        mau_query = "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'usage' AND c.month = @month"
        mau = list(container.query_items(query=mau_query, parameters=[{"name": "@month", "value": current_month}], enable_cross_partition_query=True))
        active_shops = mau[0] if mau else 0

        # 2. Total scans this month across all shops
        scans_query = "SELECT VALUE SUM(c.scans_this_month) FROM c WHERE c.type = 'usage' AND c.month = @month"
        scans = list(container.query_items(query=scans_query, parameters=[{"name": "@month", "value": current_month}], enable_cross_partition_query=True))
        total_scans = scans[0] if scans and scans[0] else 0

        # 3. Total items in vault across all shops
        items_query = "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'inventory' AND c.status = 'active'"
        items = list(container.query_items(query=items_query, enable_cross_partition_query=True))
        total_items = items[0] if items else 0

        # 4. Training signals collected (labeled OCR pairs)
        signals_query = "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'training_signal'"
        signals = list(container.query_items(query=signals_query, enable_cross_partition_query=True))
        total_signals = signals[0] if signals else 0

        # 5. Items currently in quarantine (needs review)
        quarantine_query = "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'quarantine' AND c.status = 'needs_review'"
        quarantine = list(container.query_items(query=quarantine_query, enable_cross_partition_query=True))
        quarantine_count = quarantine[0] if quarantine else 0

        # 6. Items processed this month (from usage docs)
        items_processed_query = "SELECT VALUE SUM(c.items_processed_this_month) FROM c WHERE c.type = 'usage' AND c.month = @month"
        items_processed = list(container.query_items(query=items_processed_query, parameters=[{"name": "@month", "value": current_month}], enable_cross_partition_query=True))
        total_items_processed = items_processed[0] if items_processed and items_processed[0] else 0

        # 7. Tier1 hits this month (training signal matches)
        tier1_query = "SELECT VALUE SUM(c.tier1_hits_this_month) FROM c WHERE c.type = 'usage' AND c.month = @month"
        tier1_hits = list(container.query_items(query=tier1_query, parameters=[{"name": "@month", "value": current_month}], enable_cross_partition_query=True))
        total_tier1_hits = tier1_hits[0] if tier1_hits and tier1_hits[0] else 0

        # 8. Quarantine items created this month
        quarantine_month_query = "SELECT VALUE SUM(c.quarantine_this_month) FROM c WHERE c.type = 'usage' AND c.month = @month"
        quarantine_month = list(container.query_items(query=quarantine_month_query, parameters=[{"name": "@month", "value": current_month}], enable_cross_partition_query=True))
        total_quarantine_this_month = quarantine_month[0] if quarantine_month and quarantine_month[0] else 0

        # Calculate rates (avoid division by zero)
        tier1_hit_rate = round(total_tier1_hits / total_items_processed, 4) if total_items_processed > 0 else 0.0
        avg_items_per_scan = round(total_items_processed / total_scans, 2) if total_scans > 0 else 0.0
        quarantine_rate = round(total_quarantine_this_month / total_items_processed, 4) if total_items_processed > 0 else 0.0

        return {
            "status": "success",
            "month": current_month,
            "data": {
                "monthly_active_shops": active_shops,
                "total_scans_this_month": total_scans,
                "total_items_in_vault": total_items,
                "training_signals_collected": total_signals,
                "items_in_quarantine": quarantine_count,
                "items_processed_this_month": total_items_processed,
                "tier1_hits_this_month": total_tier1_hits,
                "quarantine_this_month": total_quarantine_this_month,
                "tier1_hit_rate": tier1_hit_rate,
                "avg_items_per_scan": avg_items_per_scan,
                "quarantine_rate": quarantine_rate
            }
        }
    except Exception as e:
        logger.error(f"Analytics error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch analytics.")

def verify_admin_key(x_admin_key: str = Header(None, alias="X-Admin-Key")):
    expected = os.getenv("ADMIN_KEY")
    if not expected:
        raise HTTPException(status_code=503, detail="Admin API not configured")
    if x_admin_key != expected:
        raise HTTPException(status_code=403, detail="Forbidden")

@app.get("/admin/analytics")
def get_admin_analytics(
    month: str = Query(None),
    _: None = Depends(verify_admin_key),
):
    return get_analytics(month=month)

@app.get("/admin/stores")
def get_admin_stores(_: None = Depends(verify_admin_key)):
    try:
        container = db.get_container()
        query = "SELECT * FROM c WHERE c.type = 'shop_account'"
        stores = list(container.query_items(query=query, enable_cross_partition_query=True))
        return [
            {
                "shop_id": store.get("shop_id") or store.get("id"),
                "shop_name": store.get("shop_name"),
                "phone": store.get("phone"),
                "locality": store.get("locality"),
                "pincode": store.get("pincode"),
                "plan": store.get("plan"),
                "scans_this_month": store.get("scans_this_month", 0),
                "last_scan_date": store.get("last_scan_date"),
            }
            for store in stores
        ]
    except Exception as e:
        logger.error(f"Admin stores error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch admin stores.")

@app.get("/admin/quarantine-items")
def get_admin_quarantine_items(_: None = Depends(verify_admin_key)):
    try:
        container = db.get_container()
        query = (
            "SELECT c.raw_text, COUNT(1) as count "
            "FROM c WHERE c.type = 'quarantine' "
            "GROUP BY c.raw_text ORDER BY count DESC OFFSET 0 LIMIT 10"
        )
        items = list(container.query_items(query=query, enable_cross_partition_query=True))
        return [
            {
                "raw_text": item.get("raw_text"),
                "count": int(item.get("count") or 0),
            }
            for item in items
        ]
    except Exception as e:
        logger.error(f"Admin quarantine items error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch quarantine items.")
# ─────────────────────────────────────────────────────────────────────────────