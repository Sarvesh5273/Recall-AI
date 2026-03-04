from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
import os
import httpx
import json
import uuid
import time
from datetime import datetime, timezone
from openai import AzureOpenAI
from dotenv import load_dotenv
from azure.storage.blob import BlobServiceClient
from thefuzz import process
from pydantic import BaseModel
from database import db

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

app = FastAPI(title="Recall AI Enterprise Engine", version="4.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Load master catalog from file — edit master_catalog.json to add new items, never touch this file
_catalog_path = os.path.join(os.path.dirname(__file__), "master_catalog.json")
with open(_catalog_path, "r", encoding="utf-8") as f:
    _catalog_list = json.load(f)

MASTER_DICTIONARY = {item["uid"]: {"en": item["en"], "aliases": item["aliases"]} for item in _catalog_list}
ALL_ALIASES = [alias for item in MASTER_DICTIONARY.values() for alias in item["aliases"]]

def sort_extracted_item(raw_ai_text: str):
    if not raw_ai_text: return {"routing": "QUARANTINE_INBOX", "raw_text": "Unknown", "confidence_score": 0}
    best_match, score = process.extractOne(raw_ai_text.lower(), ALL_ALIASES)
    if score >= 85:
        for uid, data in MASTER_DICTIONARY.items():
            if best_match in data["aliases"]: return {"routing": "CLEAN_INVENTORY", "uid": uid, "standard_name": data["en"], "confidence_score": score}
    return {"routing": "QUARANTINE_INBOX", "raw_text": raw_ai_text, "confidence_score": score}

def safe_float(value, default=1.0):
    try: return float(value)
    except (ValueError, TypeError): return default

# 2. Main Processing Pipeline
@app.post("/process-ledger")
async def process_ledger(
    file: UploadFile = File(...), 
    shop_id: str = Form("shop_10065"), 
    scan_type: str = Form("IN"),
    scan_id: str = Form(None) # Added Idempotency Key
):
    container = db.get_container()
    
    # --- 1. BACKEND IDEMPOTENCY GATEKEEPER ---
    if scan_id:
        idem_query = "SELECT * FROM c WHERE c.id = @scan_id AND c.shop_id = @shop AND c.type = 'processed_scan'"
        existing_scans = list(container.query_items(query=idem_query, parameters=[{"name": "@scan_id", "value": scan_id}, {"name": "@shop", "value": shop_id}], enable_cross_partition_query=True))
        if existing_scans:
            print(f"Idempotency Triggered: Scan {scan_id} already processed. Returning 200 OK.")
            return {"status": "success", "message": "Already processed", "data": {"clean_inventory": [], "quarantined": []}}

    # --- 2. BUSINESS GATEKEEPER ---
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    usage_doc_id = f"usage_{shop_id}_{current_month}"
    usage_query = "SELECT c.scans_this_month FROM c WHERE c.id = @usage_id AND c.type = 'usage'"
    usage_records = list(container.query_items(query=usage_query, parameters=[{"name": "@usage_id", "value": usage_doc_id}], enable_cross_partition_query=True))
    current_scans = usage_records[0].get("scans_this_month", 0) if usage_records else 0

    if current_scans >= 50:
        raise HTTPException(status_code=403, detail="FREE_TIER_EXCEEDED")

    # --- 3. ARCHIVE ---
    image_bytes = await file.read()
    unique_filename = f"{shop_id}_{uuid.uuid4().hex}_{file.filename}"
    try:
        blob_container_client.get_blob_client(unique_filename).upload_blob(image_bytes, overwrite=True)
    except Exception as e: print(f"Blob Warning: {e}")

    # --- 4. AI PIPELINE ---
    try:
        files = {"file": (file.filename, image_bytes, file.content_type)}
        async with httpx.AsyncClient() as client:
            t_sarvam = time.time()
            response = await client.post(SARVAM_API_URL, headers=SARVAM_HEADERS, files=files, data={"prompt_type": "default_ocr"}, timeout=45.0)
            print(f"⏱ Sarvam OCR: {time.time()-t_sarvam:.2f}s")
        if response.status_code != 200: raise HTTPException(status_code=500, detail="Sarvam Failed")
        
        raw_markdown = response.json().get("message", response.json().get("text", str(response.json())))
        
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
        print(f"⏱ GPT-4o-mini: {time.time()-t_gpt:.2f}s")
        try:
            structured_items = json.loads(gpt_response.choices[0].message.content).get("items", [])
            if not isinstance(structured_items, list):
                structured_items = []
        except (json.JSONDecodeError, AttributeError) as parse_err:
            print(f"⚠️ GPT parse error: {parse_err} — raw: {gpt_response.choices[0].message.content}")
            structured_items = []
        print(f"📦 Extracted {len(structured_items)} items: {structured_items}")
        
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

            sort_result = sort_extracted_item(raw_name)
            uid_to_update, standard_name_to_use = None, None

            if sort_result["routing"] == "CLEAN_INVENTORY":
                uid_to_update, standard_name_to_use = sort_result["uid"], sort_result["standard_name"]
            else:
                if custom_items:
                    best_match, custom_score = process.extractOne(raw_name.lower(), [ci["standard_name"] for ci in custom_items])
                    if custom_score >= 85:
                        for ci in custom_items:
                            if ci["standard_name"] == best_match:
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
                        print(f"⚠️ Dedup: '{raw_name}' already processed this batch, merging qty")
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
            container.create_item(body={"id": scan_id, "shop_id": shop_id, "type": "processed_scan", "timestamp": datetime.now(timezone.utc).isoformat()})

        if usage_records:
            full_doc = list(container.query_items(query="SELECT * FROM c WHERE c.id = @usage_id AND c.type = 'usage'", parameters=[{"name": "@usage_id", "value": usage_doc_id}], enable_cross_partition_query=True))[0]
            full_doc["scans_this_month"] += 1
            container.upsert_item(body=full_doc)
        else:
            container.create_item(body={"id": usage_doc_id, "shop_id": shop_id, "month": current_month, "scans_this_month": 1, "status": "active", "type": "usage"})

        return {"status": "success", "shop_id": shop_id, "processed_summary": {"clean": len(results["clean_inventory"]), "inbox": len(results["quarantined"])}, "data": results}

    except HTTPException as e: raise e
    except Exception as e:
        print(f"Pipeline Error: {e}")
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
def sync_mapped_item(payload: MappedItemPayload):
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
                container.create_item(body={
                    "id": str(uuid.uuid4()),
                    "type": "training_signal",
                    "shop_id": payload.shop_id,
                    "raw_ocr": payload.raw_text.strip(),
                    "mapped_to": payload.standard_name.strip(),
                    "mapped_uid": payload.uid,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
                print(f"🧠 Training signal saved: '{payload.raw_text}' → '{payload.standard_name}'")
            except Exception as te:
                print(f"Training signal write failed (non-critical): {te}")
        # ────────────────────────────────────────────────────────────────────

        return {"status": "success", "message": "Synced"}

    except Exception as e:
        print(f"Sync mapped item error: {e}")
        raise HTTPException(status_code=500, detail="Sync failed.")

class CustomItemPayload(BaseModel): shop_id: str; custom_name: str; quantity: float; unit: str; scan_type: str

@app.post("/create-custom-item")
def create_custom_item(payload: CustomItemPayload):
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
        print(f"Custom Item Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create custom item.")


class AdjustInventoryPayload(BaseModel): shop_id: str; uid: str; new_quantity: float

@app.post("/adjust-inventory")
def adjust_inventory(payload: AdjustInventoryPayload):
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
        print(f"Adjust Inventory Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to adjust inventory.")


@app.get("/sync-custom-dictionary")
def sync_custom_dictionary(shop_id: str = Query("shop_10065")):
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
def get_inventory(shop_id: str = Query("shop_10065")):
    try:
        container = db.get_container()
        query = "SELECT c.uid, c.standard_name, c.quantity, c.unit, c.last_updated FROM c WHERE c.shop_id = @shop AND c.status = 'active' AND c.type = 'inventory'"
        items = list(container.query_items(query=query, parameters=[{"name": "@shop", "value": shop_id}], enable_cross_partition_query=True))
        return {"status": "success", "total_items": len(items), "data": sorted(items, key=lambda x: x["standard_name"].lower())}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch.")