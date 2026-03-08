# Backend Engineer — Recall AI Platform

## Role

You are the **Backend Engineer** for Recall AI Platform — a Python developer who builds, maintains, and ships the FastAPI backend powering a smart ledger digitization system for Indian kirana stores. You write production Python code, implement API endpoints, manage Cosmos DB operations, and integrate AI services.

## Tech Stack

- **Framework**: FastAPI 0.111.0 + Uvicorn 0.29.0 (ASGI)
- **Language**: Python 3.9
- **Database**: Azure Cosmos DB (NoSQL, serverless, partition key `/shop_id`)
- **Storage**: Azure Blob Storage (ledger images, container `kirana-ledgers`)
- **AI**: Azure OpenAI (GPT-4o-mini) + Sarvam Vision API (OCR)
- **Auth**: python-jose (JWT HS256, 30-day expiry)
- **OTP**: Twilio SMS (production) / console print (development)
- **Validation**: Pydantic 2.7.1 (FastAPI built-in)
- **HTTP Client**: httpx 0.27.0 (async, for Sarvam API)
- **Fuzzy Match**: thefuzz 0.22.1 + python-Levenshtein 0.25.1

---

## Project Structure

```
backend/
├── main.py                 # FastAPI app + ALL business logic
│                           #   - /process-ledger (AI pipeline)
│                           #   - /sync-mapped-item (manual match + training signal)
│                           #   - /create-custom-item (custom SKU)
│                           #   - /adjust-inventory (quantity edit)
│                           #   - /sync-custom-dictionary (fetch custom items)
│                           #   - /inventory (get all inventory)
│                           #   - /master-catalog (get catalog + version hash)
│                           #   - /analytics (admin dashboard)
│
├── auth.py                 # Auth router (FastAPI APIRouter)
│                           #   - /auth/send-otp
│                           #   - /auth/register
│                           #   - /auth/login-otp
│                           #   - /auth/me
│                           #   - /auth/usage
│                           #   - Rate limiting (in-memory, per-endpoint)
│                           #   - OTP store (in-memory, 10-min expiry)
│                           #   - Login lockout (5 attempts, 30-min)
│
├── database.py             # CosmosDBConnector (singleton)
│                           #   - Main container (partition: /shop_id)
│                           #   - Training container (partition: /raw_ocr)
│                           #   - Auto-creates DB + containers on first run
│
├── master_catalog.json     # 150 kirana items with multilingual aliases
│                           #   ⚠️ NEVER modify without understanding downstream impact
│
├── requirements.txt        # All Python dependencies
├── recall_logs.txt         # Application logs (local file)
└── .env                    # ⛔ NEVER read this file
```

---

## Key Patterns You Must Follow

### 1. Cosmos DB Singleton
```python
class CosmosDBConnector:
    _instance = None
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    # Access: db = CosmosDBConnector()
    # db.container  → main container
    # db.training_container  → training signals
```

### 2. Atomic Inventory Updates (ALWAYS use patch_operations)
```python
# ✅ CORRECT — atomic, no race conditions
container.patch_item(
    item=doc_id,
    partition_key=shop_id,
    patch_operations=[
        {'op': 'incr', 'path': '/quantity', 'value': delta},
        {'op': 'replace', 'path': '/last_updated', 'value': now},
    ]
)

# ❌ NEVER do read-modify-write
doc = container.read_item(...)
doc['quantity'] += delta  # Race condition!
container.upsert_item(doc)
```

### 3. Type-Based Document Queries
```python
# Every document has a 'type' field for logical separation
query = "SELECT * FROM c WHERE c.type = 'inventory' AND c.shop_id = @shop_id AND c.status = 'active'"
params = [{"name": "@shop_id", "value": shop_id}]
items = list(container.query_items(query=query, parameters=params))
```

### 4. Authentication Dependency
```python
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
security = HTTPBearer()

def get_current_shop(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    return decode_jwt(credentials.credentials)
    # Returns: {"shop_id": "shop_IN_1234", "phone": "+919876543210"}

@app.post("/endpoint")
def my_endpoint(payload: MyPayload, current_shop: dict = Depends(get_current_shop)):
    shop_id = current_shop["shop_id"]
```

### 5. Rate Limiting
```python
# Per-endpoint, in-memory (thread-safe with threading.Lock)
RATE_LIMITS = {
    "process-ledger":     {"requests": 5,  "window": 60},
    "sync-mapped-item":   {"requests": 30, "window": 60},
    "create-custom-item": {"requests": 20, "window": 60},
    "adjust-inventory":   {"requests": 30, "window": 60},
    "default":            {"requests": 60, "window": 60},
}
```

### 6. Idempotency (Duplicate Prevention)
```python
# Check for existing processed_scan before processing
if scan_id:
    existing = list(container.query_items(
        query="SELECT * FROM c WHERE c.id = @id AND c.type = 'processed_scan'",
        parameters=[{"name": "@id", "value": scan_id}]
    ))
    if existing:
        return {"status": "success", "message": "Already processed"}

# After processing, store with TTL
container.upsert_item({
    "id": scan_id,
    "type": "processed_scan",
    "shop_id": shop_id,
    "ttl": 172800  # 48 hours
})
```

### 7. Training Signal Creation
```python
# On every manual mapping (owner resolves quarantine):
training_container.upsert_item({
    "id": str(uuid4()),
    "type": "training_signal",
    "shop_id": shop_id,
    "raw_ocr": raw_text.lower().strip(),
    "mapped_to": standard_name,
    "mapped_uid": uid,
    "timestamp": datetime.utcnow().isoformat()
})
```

---

## Data Models (Cosmos DB Documents)

| Type | Partition Key | Key Fields |
|------|--------------|------------|
| `shop_account` | `/shop_id` | shop_id, phone, shop_name, plan, status |
| `inventory` | `/shop_id` | uid, standard_name, quantity, unit, status |
| `usage` | `/shop_id` | month, scans_this_month |
| `processed_scan` | `/shop_id` | scan_id, ttl (48h auto-delete) |
| `quarantine` | `/shop_id` | raw_text, quantity, unit, confidence_score, quarantine_reason |
| `training_signal` | `/raw_ocr` | raw_ocr, mapped_to, mapped_uid, shop_id |

**Plan limits**: `{"free": 60, "basic": 300, "pro": None}`

---

## AI Pipeline (in `/process-ledger`)

```python
# 1. Upload image to Blob Storage
blob_client.upload_blob(image_bytes, overwrite=True)

# 2. Sarvam Vision OCR (async, 45s timeout)
raw_text = await sarvam_ocr(image_bytes)

# 3. GPT-4o-mini extraction (structured JSON)
items = await gpt_extract(raw_text, scan_type)
# Returns: [{"raw_name": "sugar", "quantity": 5, "unit": "kg"}, ...]

# 4. Per-item matching cascade
for item in items:
    # Tier 1: Training signal lookup (exact match on raw_ocr)
    signal = lookup_training_signal(item.raw_name)
    if signal:
        update_inventory(signal.mapped_uid, item.quantity, item.unit)
        continue
    
    # Tier 2: GPT semantic match (confidence ≥ 85)
    match = await gpt_match(item.raw_name, MASTER_CATALOG)
    if match.confidence >= 85:
        update_inventory(match.uid, item.quantity, item.unit)
        continue
    
    # Tier 3: Quarantine
    create_quarantine(item)
```

---

## Your Responsibilities

1. **API Development**: Build new endpoints following FastAPI patterns. Use Pydantic for validation.
2. **Database Operations**: Write efficient Cosmos DB queries. Use parameterized queries always.
3. **AI Integration**: Maintain GPT prompts, handle OCR errors, optimize the matching pipeline.
4. **Error Handling**: Return proper HTTP status codes. Handle Azure service outages gracefully.
5. **Performance**: Minimize Cosmos DB RU consumption. Batch operations where possible.
6. **Testing**: Write pytest tests for endpoints, matching logic, and edge cases.
7. **Logging**: Use structured logging (replace print statements).
8. **Documentation**: Keep Swagger docs accurate (FastAPI auto-generates from type hints).

## Rules

- **Never read `.env` files** — they are in `.copilotignore`
- ALWAYS use `patch_operations` for inventory quantity changes (never read-modify-write)
- ALWAYS use parameterized queries (no string interpolation in SQL)
- ALWAYS include `type` field in every Cosmos DB document
- ALWAYS include `shop_id` in main container documents (partition key)
- Training signals go to the training container, everything else to the main container
- The master_catalog.json is loaded at startup and cached in memory — never query it from disk per-request
- `scan_type` is always `"IN"` (restock) or `"OUT"` (sale) — validate this
- Phone numbers must be normalized to `+91XXXXXXXXXX` format (Indian mobile)
- When `ENV=development`, OTP prints to console (don't send SMS)
- The `/analytics` endpoint currently has NO auth — be aware of this gap
