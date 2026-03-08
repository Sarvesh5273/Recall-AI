from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import httpx
import json
import uuid
import time
import logging
import sentry_sdk
from datetime import datetime, timezone
from openai import AzureOpenAI
from dotenv import load_dotenv
from azure.storage.blob import BlobServiceClient
from pydantic import BaseModel
from database import db
from auth import router as auth_router, get_current_shop
from payments import router as payments_router
from circuit_breaker import sarvam_circuit, openai_circuit

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
from collections import defaultdict
import threading

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
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
)

blob_service_client = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
blob_container_client = blob_service_client.get_container_client(CONTAINER_NAME)

app = FastAPI(title="Recall AI Enterprise Engine", version="5.0.0")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:8081").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
        blob_container_client.get_container_properties()
        checks["blob_storage"] = "ok"
    except Exception as e:
        checks["blob_storage"] = f"error: {type(e).__name__}"
        healthy = False

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
def sort_extracted_item(raw_ai_text: str, shop_id: str = None):
    if not raw_ai_text: return {"routing": "QUARANTINE_INBOX", "raw_text": "Unknown", "confidence_score": 0}

    normalized = raw_ai_text.strip().lower()

    # ── STEP 1: Training signals — exact lookup ───────────────────────────────
    # If owner already mapped this OCR text before → use instantly, no AI needed
    if shop_id:
        try:
            results = list(db.get_training_container().query_items(
                query="""
                    SELECT c.mapped_uid, c.mapped_to FROM c
                    WHERE c.type = 'training_signal'
                      AND c.shop_id = @shop_id
                      AND LOWER(c.raw_ocr) = @raw_ocr
                """,
                parameters=[
                    {"name": "@shop_id", "value": shop_id},
                    {"name": "@raw_ocr",  "value": normalized}
                ],
                enable_cross_partition_query=True
            ))
            if results:
                hit = results[0]
                logger.info(f"Training hit: '{raw_ai_text}' → '{hit['mapped_to']}' (learned from owner)")
                return {
                    "routing": "CLEAN_INVENTORY",
                    "uid": hit["mapped_uid"],
                    "standard_name": raw_ai_text.strip(),
                    "confidence_score": 100,
                    "source": "training"
                }
        except Exception as e:
            logger.warning(f"Training signal lookup failed (non-critical): {e}")
    # ─────────────────────────────────────────────────────────────────────────

    # ── STEP 2: GPT-4o mini — multilingual semantic match ────────────────────
    # Fuzzy matching fails for multilingual text (e.g. "khand" → wrong item).
    # GPT understands Gujarati/Hindi/Marathi natively — far more accurate.
    # Only fires when training signal misses → cost is ~₹0.008 per uncertain item.
    try:
        catalog_list = [{"uid": uid, "name": data["en"], "aliases": data.get("aliases", [])} for uid, data in MASTER_DICTIONARY.items()]
        catalog_str = json.dumps(catalog_list, ensure_ascii=False)

        gpt_match = azure_ai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": """You are a multilingual product matcher for Indian kirana stores.
Given a raw OCR product name (may be in English, Gujarati, Hindi, or Marathi) and a catalog,
return ONLY a JSON object with:
- "uid": the matching catalog uid, or "unknown" if no confident match
- "confidence": a number 0-100

Rules:
- Match against both "name" AND "aliases" in the catalog
- Aliases include regional spellings: "khand","chini","ખાંડ","साखर" all match Sugar
- "दही" matches alias "दही" in Curd, "mithu" matches Salt, "ઘઉં" matches Wheat
- Only return a uid from this catalog — NEVER guess outside the list
- Only return a uid if confident (confidence >= 85)
- If ambiguous or not in catalog → return uid: "unknown"
- Return ONLY the JSON object, nothing else"""},
                {"role": "user", "content": f"Product: \"{raw_ai_text}\"\nCatalog: {catalog_str}"}
            ],
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=60
        )

        result = json.loads(gpt_match.choices[0].message.content)
        matched_uid = result.get("uid", "unknown")
        confidence = result.get("confidence", 0)

        logger.info(f"GPT match: '{raw_ai_text}' → uid={matched_uid} confidence={confidence}")

        if matched_uid != "unknown" and matched_uid in MASTER_DICTIONARY and confidence >= 85:
            return {
                "routing": "CLEAN_INVENTORY",
                "uid": matched_uid,
                "standard_name": raw_ai_text.strip(),  # keep original text — owner's language
                "confidence_score": confidence,
                "source": "gpt"
            }
    except Exception as e:
        logger.warning(f"GPT match failed (non-critical): {e}")
    # ─────────────────────────────────────────────────────────────────────────

    # ── STEP 3: QUARANTINE ────────────────────────────────────────────────────
    # GPT couldn't match → owner maps manually → becomes a training signal
    return {"routing": "QUARANTINE_INBOX", "raw_text": raw_ai_text, "confidence_score": 0}

def safe_float(value, default=1.0):
    try: return float(value)
    except (ValueError, TypeError): return default

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
    container = db.get_container()
    
    # --- 1. BACKEND IDEMPOTENCY GATEKEEPER ---
    if scan_id:
        idem_query = "SELECT * FROM c WHERE c.id = @scan_id AND c.shop_id = @shop AND c.type = 'processed_scan'"
        existing_scans = list(container.query_items(query=idem_query, parameters=[{"name": "@scan_id", "value": scan_id}, {"name": "@shop", "value": shop_id}], enable_cross_partition_query=True))
        if existing_scans:
            logger.info(f"Idempotency Triggered: Scan {scan_id} already processed. Returning 200 OK.")
            return {"status": "success", "message": "Already processed", "data": {"clean_inventory": [], "quarantined": []}}

    # --- 2. BUSINESS GATEKEEPER ---
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    usage_doc_id = f"usage_{shop_id}_{current_month}"
    usage_query = "SELECT c.scans_this_month FROM c WHERE c.id = @usage_id AND c.type = 'usage'"
    usage_records = list(container.query_items(query=usage_query, parameters=[{"name": "@usage_id", "value": usage_doc_id}], enable_cross_partition_query=True))
    current_scans = usage_records[0].get("scans_this_month", 0) if usage_records else 0

    plan = current_shop.get("plan", "free")
    monthly_limit = PLAN_MONTHLY_LIMITS.get(plan, 60)
    if monthly_limit is not None and current_scans >= monthly_limit:
        raise HTTPException(status_code=403, detail=f"MONTHLY_LIMIT_EXCEEDED:{plan.upper()}:{monthly_limit}")

    # --- 3. ARCHIVE ---
    image_bytes = await file.read()
    unique_filename = f"{shop_id}_{uuid.uuid4().hex}_{file.filename}"
    try:
        blob_container_client.get_blob_client(unique_filename).upload_blob(image_bytes, overwrite=True)
    except Exception as e: logger.warning(f"Blob warning: {e}")

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
                {"role": "user", "content": f"Convert this OCR text to JSON array 'items': {raw_markdown}"}
            ],
            response_format={"type": "json_object"}, temperature=0.1
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
        custom_items = list(container.query_items(query=custom_items_query, parameters=[{"name": "@shop", "value": shop_id}], enable_cross_partition_query=True))
        
        results = {"clean_inventory": [], "quarantined": []}
        # Track UIDs already processed in this scan batch
        # Prevents double-counting when same item appears twice on one ledger
        processed_in_batch: dict = {}  # uid → unit already seen this scan

        for item in structured_items:
            raw_name = str(item.get("raw_name", ""))
            qty = safe_float(item.get("quantity", 1.0))
            unit = str(item.get("unit", "unit"))
            qty_math = qty if scan_type == "IN" else -qty

            sort_result = sort_extracted_item(raw_name, shop_id)
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
                        results["quarantined"].append({
                            "id": str(uuid.uuid4()),
                            "shop_id": shop_id,
                            "raw_text": raw_name,
                            "quantity": qty,
                            "unit": unit,
                            "scan_type": scan_type,
                            "status": "needs_review",
                            "confidence_score": sort_result["confidence_score"] if sort_result else 0,
                            "quarantine_reason": f"Duplicate in same ledger — verify manually"
                        })
                        continue
                    else:
                        # Same item, different unit — quarantine
                        results["quarantined"].append({
                            "id": str(uuid.uuid4()),
                            "shop_id": shop_id,
                            "raw_text": raw_name,
                            "quantity": qty,
                            "unit": unit,
                            "scan_type": scan_type,
                            "status": "needs_review",
                            "confidence_score": sort_result["confidence_score"] if sort_result else 0,
                            "quarantine_reason": f"Unit mismatch in same ledger: '{prev_unit}' vs '{unit}'"
                        })
                        continue
                else:
                    processed_in_batch[uid_to_update] = unit.lower().strip()

            # --- 5. ATOMIC PATCHES (No more Race Conditions) ---
            if uid_to_update:
                query = "SELECT c.id, c.unit FROM c WHERE c.shop_id = @shop AND c.uid = @uid AND c.status = 'active' AND c.type = 'inventory'"
                existing_items = list(container.query_items(query=query, parameters=[{"name": "@shop", "value": shop_id}, {"name": "@uid", "value": uid_to_update}], enable_cross_partition_query=True))

                if existing_items:
                    # --- UNIT MISMATCH GUARD ---
                    # If item exists but unit is different (e.g. "ml" vs "units"),
                    # don't blindly add up — send to quarantine for human review
                    stored_unit = existing_items[0].get("unit", "").lower().strip()
                    incoming_unit = unit.lower().strip()
                    unit_mismatch = stored_unit and incoming_unit and stored_unit != incoming_unit

                    if unit_mismatch:
                        results["quarantined"].append({
                            "id": str(uuid.uuid4()),
                            "shop_id": shop_id,
                            "raw_text": raw_name,
                            "quantity": qty,
                            "unit": unit,
                            "scan_type": scan_type,
                            "status": "needs_review",
                            "confidence_score": sort_result["confidence_score"] if sort_result else 0,
                            "quarantine_reason": f"Unit mismatch: stored as '{stored_unit}', scanned as '{incoming_unit}'"
                        })
                        continue

                    doc_id = existing_items[0]['id']
                    container.patch_item(
                        item=doc_id,
                        partition_key=shop_id,
                        patch_operations=[
                            {'op': 'incr', 'path': '/quantity', 'value': qty_math},
                            {'op': 'replace', 'path': '/last_updated', 'value': datetime.now(timezone.utc).isoformat()}
                        ]
                    )
                    results["clean_inventory"].append({"uid": uid_to_update, "updated": True})
                else:
                    new_item = {"id": str(uuid.uuid4()), "shop_id": shop_id, "uid": uid_to_update, "standard_name": standard_name_to_use, "quantity": qty_math, "unit": unit, "status": "active", "type": "inventory", "last_updated": datetime.now(timezone.utc).isoformat()}
                    container.create_item(body=new_item)
                    results["clean_inventory"].append(new_item)
            else:
                results["quarantined"].append({"id": str(uuid.uuid4()), "shop_id": shop_id, "raw_text": raw_name, "quantity": qty, "unit": unit, "scan_type": scan_type, "status": "needs_review", "confidence_score": sort_result["confidence_score"] if sort_result else 0})

        # --- 6. RECORD IDEMPOTENCY & USAGE ---
        if scan_id:
            container.create_item(body={
                "id": scan_id,
                "shop_id": shop_id,
                "type": "processed_scan",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "ttl": 172800  # auto-delete after 48 hours — overrides container TTL
            })

        if usage_records:
            full_doc = list(container.query_items(query="SELECT * FROM c WHERE c.id = @usage_id AND c.type = 'usage'", parameters=[{"name": "@usage_id", "value": usage_doc_id}], enable_cross_partition_query=True))[0]
            full_doc["scans_this_month"] += 1
            container.upsert_item(body=full_doc)
        else:
            container.create_item(body={"id": usage_doc_id, "shop_id": shop_id, "month": current_month, "scans_this_month": 1, "status": "active", "type": "usage"})

        return {"status": "success", "shop_id": shop_id, "processed_summary": {"clean": len(results["clean_inventory"]), "inbox": len(results["quarantined"])}, "data": results}

    except HTTPException as e: raise e
    except Exception as e:
        logger.error(f"Pipeline error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

class MappedItemPayload(BaseModel): 
    shop_id: str
    uid: str
    standard_name: str
    quantity: float
    unit: str
    scan_type: str
    raw_text: str = ""  # what OCR originally read — used for training signal

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

        return {"status": "success", "message": "Synced"}

    except HTTPException as e: raise e
    except Exception as e:
        logger.error(f"Sync mapped item error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Sync failed.")

class CustomItemPayload(BaseModel): shop_id: str; custom_name: str; quantity: float; unit: str; scan_type: str

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


class AdjustInventoryPayload(BaseModel): shop_id: str; uid: str; new_quantity: float

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

    except HTTPException as e: raise e
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
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch custom dictionary.")


# Ensure /inventory and other endpoints use AND c.type = 'inventory'
@app.get("/inventory")
def get_inventory(shop_id: str = Query("shop_10065"), current_shop: dict = Depends(get_current_shop)):
    try:
        container = db.get_container()
        query = "SELECT c.uid, c.standard_name, c.quantity, c.unit, c.last_updated FROM c WHERE c.shop_id = @shop AND c.status = 'active' AND c.type = 'inventory'"
        items = list(container.query_items(query=query, parameters=[{"name": "@shop", "value": shop_id}], enable_cross_partition_query=True))
        return {"status": "success", "total_items": len(items), "data": sorted(items, key=lambda x: x["standard_name"].lower())}
    except Exception as e:
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

        return {
            "status": "success",
            "month": current_month,
            "data": {
                "monthly_active_shops": active_shops,
                "total_scans_this_month": total_scans,
                "total_items_in_vault": total_items,
                "training_signals_collected": total_signals,
                "items_in_quarantine": quarantine_count
            }
        }
    except Exception as e:
        logger.error(f"Analytics error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch analytics.")
# ─────────────────────────────────────────────────────────────────────────────