from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from jose import JWTError, jwt
import uuid
import random
import os
import logging
from database import db

router = APIRouter()
security = HTTPBearer()
logger = logging.getLogger(__name__)

# ── CONFIG ───────────────────────────────────────────────────────────────────
_env = os.getenv("ENV", "development")
JWT_SECRET = os.getenv("JWT_SECRET", "recall-ai-dev-secret-CHANGE-IN-PRODUCTION")
if _env == "production" and JWT_SECRET == "recall-ai-dev-secret-CHANGE-IN-PRODUCTION":
    raise RuntimeError("FATAL: JWT_SECRET must be set in production. Do not use the default.")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 30  # Stay logged in for 30 days

OTP_EXPIRE_MINUTES = 10
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 30

# ── IN-MEMORY STORES (replace with Redis in production) ──────────────────────
_otp_store: dict = {}       # phone → {"otp": "123456", "expires_at": timestamp}
_login_attempts: dict = {}  # phone → {"attempts": 0, "locked_until": timestamp}

# ── MODELS ───────────────────────────────────────────────────────────────────
class SendOTPPayload(BaseModel):
    phone: str

class VerifyOTPPayload(BaseModel):
    phone: str
    otp: str

class RegisterPayload(BaseModel):
    phone: str
    otp: str
    shop_name: str

class LoginOTPPayload(BaseModel):
    phone: str
    otp: str

# ── HELPERS ──────────────────────────────────────────────────────────────────
def normalize_phone(phone: str) -> str:
    """Normalize to +91XXXXXXXXXX format"""
    phone = phone.strip().replace(" ", "").replace("-", "")
    if not phone.startswith("+"):
        if phone.startswith("91") and len(phone) == 12:
            phone = "+" + phone
        elif len(phone) == 10:
            phone = "+91" + phone
    return phone

def mask_phone(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) >= 4:
        return f"****{digits[-4:]}"
    return "****"

def create_jwt(shop_id: str, phone: str) -> str:
    payload = {
        "shop_id": shop_id,
        "phone": phone,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS),
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def check_rate_limit(phone: str):
    """Block after 5 failed attempts for 30 minutes"""
    now = datetime.now(timezone.utc).timestamp()
    record = _login_attempts.get(phone, {"attempts": 0, "locked_until": 0})

    if record["locked_until"] > now:
        remaining = int((record["locked_until"] - now) / 60)
        raise HTTPException(
            status_code=429,
            detail=f"Too many attempts. Try again in {remaining} minutes."
        )

def record_failed_attempt(phone: str):
    now = datetime.now(timezone.utc).timestamp()
    record = _login_attempts.get(phone, {"attempts": 0, "locked_until": 0})
    record["attempts"] += 1

    if record["attempts"] >= MAX_LOGIN_ATTEMPTS:
        record["locked_until"] = now + (LOCKOUT_MINUTES * 60)
        record["attempts"] = 0
        _login_attempts[phone] = record
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Account locked for {LOCKOUT_MINUTES} minutes."
        )
    _login_attempts[phone] = record

def clear_attempts(phone: str):
    _login_attempts.pop(phone, None)

# ── DEPENDENCY: Get current shop from JWT ─────────────────────────────────────
def get_current_shop(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Use as a dependency on any protected endpoint.
    Returns: {"shop_id": "shop_PUN_8472", "phone": "+919876543210"}
    """
    return decode_jwt(credentials.credentials)

# ── ROUTES ───────────────────────────────────────────────────────────────────

@router.post("/auth/send-otp")
def send_otp(payload: SendOTPPayload):
    """
    Step 1: Send OTP to phone number.
    In production: integrate MSG91 or Twilio.
    In development: OTP is always 123456 (printed to console).
    """
    phone = normalize_phone(payload.phone)

    if len(phone) < 10:
        raise HTTPException(status_code=400, detail="Invalid phone number")

    # Generate 6 digit OTP
    otp = str(random.randint(100000, 999999))
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)).timestamp()

    _otp_store[phone] = {"otp": otp, "expires_at": expires_at}

    env = os.getenv("ENV", "development")

    if env == "production":
        # ── TWILIO SMS ────────────────────────────────────────────────────────
        # Trial account: can only SMS to verified numbers (your own phone)
        # Upgrade to paid account to SMS any number
        try:
            from twilio.rest import Client as TwilioClient
            account_sid = os.getenv("TWILIO_ACCOUNT_SID")
            auth_token  = os.getenv("TWILIO_AUTH_TOKEN")
            from_number = os.getenv("TWILIO_PHONE_NUMBER")
            if not all([account_sid, auth_token, from_number]):
                raise ValueError("Twilio credentials not set in environment")
            client = TwilioClient(account_sid, auth_token)
            client.messages.create(
                body=f"Your Recall AI OTP is {otp}. Valid for {OTP_EXPIRE_MINUTES} minutes. Do not share.",
                from_=from_number,
                to=phone
            )
            logger.info("OTP sent via Twilio to %s", mask_phone(phone))
        except Exception as e:
            logger.error("Twilio SMS failed for %s: %s", mask_phone(phone), e, exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to send OTP. Try again.")
        # ─────────────────────────────────────────────────────────────────────
    else:
        # Dev mode — no SMS sent
        logger.info("OTP sent in development mode to %s", mask_phone(phone))

    return {
        "status": "success",
        "message": f"OTP sent to {phone}"
    }


@router.post("/auth/register")
def register(payload: RegisterPayload):
    """
    New user: verify OTP + shop name → create account + return JWT.
    PIN is local-only (stored on device in AsyncStorage, never sent here).
    """
    phone = normalize_phone(payload.phone)

    # 1. Validate OTP
    stored = _otp_store.get(phone)
    if not stored:
        raise HTTPException(status_code=400, detail="OTP not found. Request a new one.")

    now = datetime.now(timezone.utc).timestamp()
    if now > stored["expires_at"]:
        _otp_store.pop(phone, None)
        raise HTTPException(status_code=400, detail="OTP expired. Request a new one.")

    if stored["otp"] != payload.otp.strip():
        raise HTTPException(status_code=400, detail="Incorrect OTP.")

    # 2. Check phone not already registered
    container = db.get_container()
    existing_query = "SELECT c.id FROM c WHERE c.phone = @phone AND c.type = 'shop_account'"
    existing = list(container.query_items(
        query=existing_query,
        parameters=[{"name": "@phone", "value": phone}],
        enable_cross_partition_query=True
    ))
    if existing:
        raise HTTPException(status_code=409, detail="ALREADY_REGISTERED")

    # 3. Generate unique shop_id
    city_code = "IN"
    random_suffix = str(random.randint(1000, 9999))
    shop_id = f"shop_{city_code}_{random_suffix}"

    # 4. Create shop account in Cosmos — no PIN stored, ever
    account = {
        "id": str(uuid.uuid4()),
        "shop_id": shop_id,
        "phone": phone,
        "shop_name": payload.shop_name.strip(),
        "plan": "free",
        "type": "shop_account",
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    container.create_item(body=account)

    # 6. Clear OTP
    _otp_store.pop(phone, None)

    # 7. Return JWT
    token = create_jwt(shop_id, phone)
    logger.info("New shop registered: %s", shop_id)

    return {
        "status": "success",
        "message": "Shop registered successfully",
        "token": token,
        "shop_id": shop_id,
        "shop_name": payload.shop_name.strip()
    }


@router.post("/auth/login-otp")
def login_otp(payload: LoginOTPPayload):
    """
    Existing user login via OTP — no PIN involved.
    PIN lives on-device only (AsyncStorage). Backend never sees it.
    Returns 404 NOT_REGISTERED if phone has no account → VerifyOTPScreen
    routes to registration flow.
    """
    phone = normalize_phone(payload.phone)

    # 1. Validate OTP
    stored = _otp_store.get(phone)
    if not stored:
        raise HTTPException(status_code=400, detail="OTP not found. Request a new one.")

    now = datetime.now(timezone.utc).timestamp()
    if now > stored["expires_at"]:
        _otp_store.pop(phone, None)
        raise HTTPException(status_code=400, detail="OTP expired. Request a new one.")

    if stored["otp"] != payload.otp.strip():
        raise HTTPException(status_code=400, detail="Incorrect OTP.")


    # 2. Find account
    container = db.get_container()
    accounts = list(container.query_items(
        query="SELECT * FROM c WHERE c.phone = @phone AND c.type = 'shop_account' AND c.status = 'active'",
        parameters=[{"name": "@phone", "value": phone}],
        enable_cross_partition_query=True
    ))

    if not accounts:
        # OTP valid but not registered — DO NOT pop OTP, /auth/register still needs it
        raise HTTPException(status_code=404, detail="NOT_REGISTERED")

    account = accounts[0]
    _otp_store.pop(phone, None)

    token = create_jwt(account["shop_id"], phone)
    logger.info("OTP login successful for shop %s", account["shop_id"])

    return {
        "status": "success",
        "token": token,
        "shop_id": account["shop_id"],
        "shop_name": account["shop_name"]
    }


@router.get("/auth/me")
def get_me(current_shop: dict = Depends(get_current_shop)):
    """Verify token + return shop info. Used on app startup to validate stored JWT."""
    container = db.get_container()
    query = "SELECT c.shop_id, c.shop_name, c.phone, c.plan FROM c WHERE c.shop_id = @shop_id AND c.type = 'shop_account'"
    accounts = list(container.query_items(
        query=query,
        parameters=[{"name": "@shop_id", "value": current_shop["shop_id"]}],
        enable_cross_partition_query=True
    ))

    if not accounts:
        raise HTTPException(status_code=404, detail="Account not found.")

    return {
        "status": "success",
        "shop_id": accounts[0]["shop_id"],
        "shop_name": accounts[0]["shop_name"],
        "phone": accounts[0]["phone"],
        "plan": accounts[0].get("plan", "free")   # default "free" for older accounts
    }


@router.get("/auth/usage")
def get_usage(current_shop: dict = Depends(get_current_shop)):
    """Returns current month scan count + plan limits for HomeScreen."""
    try:
        shop_id = current_shop["shop_id"]
        plan = current_shop.get("plan", "free")
        container = db.get_container()

        from datetime import datetime, timezone
        current_month = datetime.now(timezone.utc).strftime("%Y-%m")
        usage_doc_id = f"usage_{shop_id}_{current_month}"

        usage_records = list(container.query_items(
            query="SELECT c.scans_this_month FROM c WHERE c.id = @id AND c.type = 'usage'",
            parameters=[{"name": "@id", "value": usage_doc_id}],
            enable_cross_partition_query=True
        ))

        scans_used = usage_records[0].get("scans_this_month", 0) if usage_records else 0
        plan_limits = {"free": 60, "basic": 300, "pro": None}
        scan_limit = plan_limits.get(plan, 60)

        return {
            "status": "success",
            "plan": plan,
            "scans_used": scans_used,
            "scan_limit": scan_limit
        }
    except Exception as e:
        logger.error("Usage fetch error for shop %s: %s", shop_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
