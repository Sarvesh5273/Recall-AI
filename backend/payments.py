"""
Razorpay payment integration — subscription management.

Plans:
  - free: 60 scans/month (default)
  - basic: 300 scans/month (₹99/month)
  - pro: unlimited scans/month (₹299/month)

TODO: Add Razorpay webhook handler for payment confirmation.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current_shop
from database import db
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])

PLANS = {
    "free": {"name": "Free", "scan_limit": 60, "price_inr": 0},
    "basic": {"name": "Basic", "scan_limit": 300, "price_inr": 99},
    "pro": {"name": "Pro", "scan_limit": -1, "price_inr": 299},  # -1 = unlimited
}


class SubscribeRequest(BaseModel):
    plan: str  # "basic" or "pro"


@router.get("/plans")
def get_plans():
    """List available subscription plans."""
    return {"status": "success", "plans": PLANS}


@router.get("/current")
def get_current_plan(current_shop: dict = Depends(get_current_shop)):
    """Get the current shop's active plan."""
    shop_id = current_shop["shop_id"]
    try:
        container = db.get_container()
        query = "SELECT c.plan FROM c WHERE c.id = @id AND c.type = 'shop_account'"
        results = list(container.query_items(
            query=query,
            parameters=[{"name": "@id", "value": shop_id}],
            enable_cross_partition_query=True,
        ))
        plan = results[0]["plan"] if results else "free"
        return {"status": "success", "plan": plan, "details": PLANS.get(plan, PLANS["free"])}
    except Exception as e:
        logger.error(f"Get plan error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch plan")


@router.post("/subscribe")
def subscribe(payload: SubscribeRequest, current_shop: dict = Depends(get_current_shop)):
    """
    Initiate a subscription change.

    TODO: Integrate Razorpay order creation here.
    For now, this just validates the plan and returns what would happen.
    """
    if payload.plan not in PLANS or payload.plan == "free":
        raise HTTPException(status_code=400, detail="Invalid plan. Choose 'basic' or 'pro'.")

    plan_details = PLANS[payload.plan]

    # TODO: Create Razorpay order
    # razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
    # order = razorpay_client.order.create({
    #     "amount": plan_details["price_inr"] * 100,  # paise
    #     "currency": "INR",
    #     "receipt": f"sub_{current_shop['shop_id']}_{payload.plan}",
    # })

    return {
        "status": "success",
        "message": f"Payment integration pending. Plan: {payload.plan}",
        "plan": payload.plan,
        "price_inr": plan_details["price_inr"],
        # "razorpay_order_id": order["id"],  # TODO: Uncomment when Razorpay is active
    }
