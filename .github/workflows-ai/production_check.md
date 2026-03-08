# Production Check Workflow

> **Trigger**: Before any deployment to production, or as a scheduled health audit.
> **Goal**: Verify the entire system is production-ready — secure, resilient, cost-efficient, observable, and performing correctly.

---

## Phase 1: Infrastructure & Security Audit

**Agents**: `devops_engineer` + `security_engineer` + `reliability_engineer` (run in parallel)

### Step 1a — Infrastructure Readiness (`devops_engineer`)

**Tasks**:
- Verify deployment configuration is correct
- Check if Dockerfile exists and builds successfully
- Verify environment variables are set (without reading `.env` values)
- Check if health check endpoint (`/health`) exists and responds
- Verify logging is structured (not just `print()` to file)
- Check if CI/CD pipeline exists and runs green
- Verify monitoring/alerting is configured
- Check Azure resource configuration (Cosmos DB throughput mode, Blob lifecycle policies)

**Checklist**:
```
## Infrastructure Readiness
- [ ] Backend starts without errors
- [ ] /health endpoint returns 200
- [ ] All required environment variables documented
- [ ] Dockerfile exists and builds
- [ ] CI/CD pipeline exists and passes
- [ ] Structured logging enabled (not print())
- [ ] Application Insights / Sentry configured
- [ ] Azure Cosmos DB throughput mode appropriate
- [ ] Azure Blob Storage lifecycle policy set
- [ ] SSL/TLS configured (HTTPS enforced)
- [ ] Server auto-restart configured (systemd/supervisor/container)

Status: [READY / NOT READY — list blockers]
```

### Step 1b — Security Audit (`security_engineer`)

**Tasks**:
- Verify CORS is locked to specific origins (NOT `*`)
- Verify all state-changing endpoints require authentication
- Check rate limiting is active on all endpoints
- Verify OTP store is NOT in-memory (should be Redis or equivalent)
- Check JWT secret strength and rotation plan
- Verify no secrets in source code or logs
- Check the `/analytics` endpoint has authentication
- Verify input validation on all endpoints (Pydantic models complete)
- Check mobile: certificate pinning, encrypted storage, jailbreak detection

**Checklist**:
```
## Security Audit
- [ ] CORS origins restricted (not wildcard *)
- [ ] All protected endpoints have auth (Depends(get_current_shop))
- [ ] Rate limiting active and persistent (not in-memory)
- [ ] OTP store is persistent (not in-memory)
- [ ] JWT secret is strong (≥256 bits) and not committed
- [ ] No secrets in logs or error messages
- [ ] /analytics endpoint requires auth
- [ ] All inputs validated via Pydantic
- [ ] Phone numbers normalized and validated (+91XXXXXXXXXX)
- [ ] Scan_type validated (only IN/OUT accepted)
- [ ] File upload size limited
- [ ] HTTPS enforced (redirect HTTP → HTTPS)
- [ ] Mobile: PIN encrypted in storage
- [ ] Mobile: API_BASE_URL uses HTTPS

Status: [PASS / FAIL — list critical findings]
```

### Step 1c — Reliability Audit (`reliability_engineer`)

**Tasks**:
- Verify circuit breakers exist for Sarvam OCR and Azure OpenAI
- Check timeout configuration for all external calls
- Verify retry logic with backoff for Cosmos DB 429 errors
- Check mobile SyncWorker is correctly handling all scan states
- Verify idempotency on `/process-ledger` (scan_id dedup working)
- Check graceful shutdown handling
- Verify health check reports dependency status
- Test behavior when each external service is unreachable

**Checklist**:
```
## Reliability Audit
- [ ] Sarvam OCR: circuit breaker implemented
- [ ] Sarvam OCR: timeout ≤ 45s
- [ ] Azure OpenAI: circuit breaker implemented
- [ ] Azure OpenAI: timeout configured
- [ ] Twilio: fallback for SMS failure
- [ ] Cosmos DB: 429 retry with backoff
- [ ] Cosmos DB: all writes use atomic patch_operations
- [ ] Blob Storage: upload retry logic
- [ ] /process-ledger: idempotency via scan_id
- [ ] /health endpoint: checks all dependencies
- [ ] Mobile: SyncWorker zombie recovery working
- [ ] Mobile: exponential backoff on retry
- [ ] Mobile: max 5 retries then mark failed
- [ ] Mobile: queue depth limit (prevent unbounded growth)
- [ ] Mobile: offline queue survives app restart
- [ ] Graceful shutdown: in-flight requests complete

Status: [RESILIENT / DEGRADED — list gaps]
```

---

## Phase 2: AI Pipeline Validation

**Agents**: `ai_engineer` → `cost_optimizer`

### Step 2a — AI Accuracy Check (`ai_engineer`)

**Tasks**:
- Run a test set of known ledger images through the full pipeline
- Verify OCR quality (Sarvam returning readable text)
- Verify GPT extraction accuracy (correct items, quantities, units)
- Verify matching cascade works correctly:
  - Tier 1: Training signals match known OCR text
  - Tier 2: GPT semantic match with confidence ≥85
  - Tier 3: Low-confidence items go to quarantine (not inventory)
- Check unit normalization (kg, g, L, ml, pcs — no variants)
- Verify training signal creation on manual mapping
- Test with multilingual inputs (Hindi, Marathi, Gujarati)
- Check in-batch deduplication (same item twice on one page)

**Checklist**:
```
## AI Pipeline Validation
- [ ] Sarvam OCR: returns readable text for clear ledger images
- [ ] Sarvam OCR: handles poor lighting / blurry images gracefully
- [ ] GPT extraction: correctly parses items from OCR text
- [ ] GPT extraction: unit normalization working (only kg/g/L/ml/pcs)
- [ ] GPT extraction: handles empty/gibberish OCR gracefully
- [ ] Tier 1 matching: training signals looked up before GPT
- [ ] Tier 2 matching: confidence ≥85 auto-matches correctly
- [ ] Tier 2 matching: confidence <85 goes to quarantine (not inventory)
- [ ] Tier 3 quarantine: items stored with correct metadata
- [ ] Training signals: created on manual mapping via /sync-mapped-item
- [ ] Training signals: cross-shop (shop A's signal helps shop B)
- [ ] In-batch dedup: same item, same unit → quantities merged
- [ ] In-batch dedup: same item, different unit → quarantine
- [ ] Hindi/Marathi/Gujarati text: processed correctly
- [ ] Master catalog: loaded at startup, 150 items present

Status: [ACCURATE / DEGRADED — list issues]
```

### Step 2b — Cost Viability (`cost_optimizer`)

**Tasks**:
- Calculate current per-scan cost (OCR + GPT + Cosmos RU + Blob)
- Verify cost is under ₹1/scan at maturity (with training signals)
- Check Cosmos DB provisioning mode is optimal for current scale
- Verify Blob Storage lifecycle policy prevents unbounded cost growth
- Calculate break-even for each plan tier
- Check if GPT calls are batched where possible

**Checklist**:
```
## Cost Viability
- [ ] Per-scan cost calculated: ₹[X] (new user) / ₹[X] (mature user)
- [ ] Cost under ₹1/scan at maturity (with training signals)
- [ ] Cosmos DB: serverless mode appropriate for current load
- [ ] Blob Storage: lifecycle policy configured (cool after 30d, archive after 90d)
- [ ] GPT calls: batched where possible (extraction = 1 call, not N)
- [ ] Training signal Tier 1: reducing GPT calls over time
- [ ] Free tier (60 scans): cost ≤₹50/user/month
- [ ] Basic tier break-even: price > per-user cost
- [ ] Twilio: cost per OTP acceptable (<₹0.50)
- [ ] Azure budget alerts configured

Status: [VIABLE / AT RISK — list concerns]
```

---

## Phase 3: Application Quality

**Agents**: `qa_engineer` + `backend_engineer` + `mobile_engineer` (run in parallel)

### Step 3a — Test Coverage (`qa_engineer`)

**Tasks**:
- Run all existing tests (backend: pytest, mobile: jest)
- Report coverage percentage
- Identify critical paths with no tests
- Verify P0 test cases exist:
  - Auth flow (OTP → register → login → JWT validation)
  - Scan processing (image → OCR → extract → match → inventory)
  - Offline sync (queue → retry → success/failure)
  - Idempotency (duplicate scan_id)
  - Rate limiting (over-limit → 429)
  - Plan limits (over-quota → 403)

**Checklist**:
```
## Test Coverage
- [ ] Backend tests: [X] tests, [Y]% coverage
- [ ] Mobile tests: [X] tests, [Y]% coverage
- [ ] Auth flow tested: [yes/no]
- [ ] Scan pipeline tested: [yes/no]
- [ ] Offline sync tested: [yes/no]
- [ ] Idempotency tested: [yes/no]
- [ ] Rate limiting tested: [yes/no]
- [ ] Plan limits tested: [yes/no]
- [ ] Multilingual inputs tested: [yes/no]
- [ ] Error paths tested: [yes/no]

Status: [SUFFICIENT / INSUFFICIENT — critical gaps]
```

### Step 3b — Backend Health (`backend_engineer`)

**Tasks**:
- Verify all 13 endpoints respond correctly
- Check Cosmos DB connectivity and query performance
- Verify master catalog is loaded (150 items, correct hash)
- Check Azure Blob Storage connectivity
- Verify Azure OpenAI and Sarvam API connectivity
- Check that `ENV` variable is set to `production`
- Verify Twilio is configured for production SMS (not console print)

**Checklist**:
```
## Backend Health
- [ ] FastAPI starts without errors
- [ ] Swagger docs accessible at /docs
- [ ] All 13 endpoints respond (no 500s on valid input)
- [ ] Cosmos DB: read/write working
- [ ] Cosmos DB: training container accessible
- [ ] Blob Storage: upload/read working
- [ ] Azure OpenAI: API responds
- [ ] Sarvam Vision: API responds
- [ ] Twilio: SMS delivery working (test to verified number)
- [ ] Master catalog: 150 items loaded
- [ ] ENV=production (not development)
- [ ] CORS: origins restricted

Status: [HEALTHY / UNHEALTHY — list failures]
```

### Step 3c — Mobile Health (`mobile_engineer`)

**Tasks**:
- Verify app builds for Android (release mode)
- Verify app builds for iOS (release mode)
- Check WatermelonDB schema version matches latest migration
- Verify API_BASE_URL points to production backend
- Check all 11 screens render without crashes
- Verify SyncWorker processes outbox correctly
- Test camera capture + compression pipeline
- Verify i18n: all 4 languages render correctly

**Checklist**:
```
## Mobile Health
- [ ] Android release build succeeds
- [ ] iOS release build succeeds
- [ ] API_BASE_URL points to production
- [ ] WatermelonDB schema up to date
- [ ] All 11 screens render without crash
- [ ] Auth flow: OTP → PIN → Dashboard works
- [ ] Camera: capture + compress + queue works
- [ ] SyncWorker: processes pending scans
- [ ] Offline: scans queue correctly when offline
- [ ] Online: synced scans update inventory
- [ ] i18n: EN/HI/MR/GU all render correctly
- [ ] SyncBadge: shows correct pending count
- [ ] MatchModal: fuzzy search returns results

Status: [HEALTHY / UNHEALTHY — list failures]
```

---

## Phase 4: Business Readiness

**Agents**: `product_manager` + `data_analyst` + `growth_hacker` (run in parallel)

### Step 4a — Product Completeness (`product_manager`)

**Tasks**:
- Verify all shipped features work end-to-end
- Check onboarding flow is smooth (new user → first scan < 2 min)
- Verify plan limits display correctly on HomeScreen
- Check all 4 languages are complete (no missing translations)
- Verify "Download Khata" (Excel export) works
- Flag any UX issues that could cause user churn

**Output**:
```
## Product Readiness
- Core flow working: [scan → match → inventory]
- Onboarding: [smooth / friction points]
- i18n complete: [yes / missing keys]
- Feature gaps blocking launch: [list or none]
- UX concerns: [list or none]
Status: [LAUNCH READY / NOT READY — blockers]
```

### Step 4b — Analytics Readiness (`data_analyst`)

**Tasks**:
- Verify `/analytics` endpoint returns correct data
- Check if key metrics are trackable (MAU, scans, quarantine rate)
- Verify any client-side analytics are instrumented
- Confirm dashboards exist for post-launch monitoring

**Output**:
```
## Analytics Readiness
- Server analytics: [/analytics endpoint working]
- Client analytics: [instrumented / not instrumented]
- Key metrics trackable: [MAU, scans, quarantine rate — yes/no each]
- Dashboards ready: [yes / not yet]
Status: [OBSERVABLE / BLIND — gaps]
```

### Step 4c — Launch Readiness (`growth_hacker`)

**Tasks**:
- Verify Play Store listing is prepared (screenshots, description, keywords)
- Check if onboarding conversion funnel is measurable
- Verify referral mechanism exists (or flag as missing)
- Check if payment integration exists (or flag as missing)

**Output**:
```
## Launch Readiness
- Play Store listing: [ready / not ready]
- Onboarding funnel: [measurable / not measurable]
- Referral system: [exists / missing]
- Payment integration: [exists / missing]
- Launch blockers: [list]
Status: [LAUNCH READY / BLOCKERS EXIST]
```

---

## Phase 5: Final Verdict

**Agent**: `cto`

### Step 5 — Production Decision (`cto`)

**Input**: All checklists and statuses from Phases 1-4.

**Tasks**:
- Aggregate all phase statuses into a single decision
- Identify any CRITICAL blockers (hard no-go)
- Identify ACCEPTABLE risks (ship with known issues)
- Produce a go/no-go recommendation with conditions

**Output**:
```
## Production Verdict

### Overall: [GO / CONDITIONAL GO / NO-GO]

### Phase Results
| Phase | Area | Status | Blockers |
|-------|------|--------|----------|
| 1a | Infrastructure | [status] | [blockers] |
| 1b | Security | [status] | [blockers] |
| 1c | Reliability | [status] | [blockers] |
| 2a | AI Accuracy | [status] | [blockers] |
| 2b | Cost | [status] | [blockers] |
| 3a | Tests | [status] | [blockers] |
| 3b | Backend | [status] | [blockers] |
| 3c | Mobile | [status] | [blockers] |
| 4a | Product | [status] | [blockers] |
| 4b | Analytics | [status] | [blockers] |
| 4c | Launch | [status] | [blockers] |

### Critical Blockers (must fix before deploy)
[list or "None"]

### Accepted Risks (shipping with these known issues)
[list with justification]

### Post-Deploy Actions (do within 48 hours)
[list]

### Rollback Plan
- Backend: [how to rollback]
- Mobile: [how to rollback — app stores have delay]
- Database: [any migrations to reverse?]
```

---

## Workflow Summary

```
Phase 1: Infrastructure    devops_engineer ∥ security_engineer ∥ reliability_engineer
Phase 2: AI Pipeline       ai_engineer → cost_optimizer
Phase 3: App Quality       qa_engineer ∥ backend_engineer ∥ mobile_engineer
Phase 4: Business          product_manager ∥ data_analyst ∥ growth_hacker
Phase 5: Final Verdict     cto
```

**All 14 agents participate** in the production check.

**Parallel steps**: Phases 1, 3, and 4 run agents in parallel for speed.

**Blocking gates**:
- Phase 1 security `FAIL` → hard block (do not deploy)
- Phase 2a AI `DEGRADED` → CTO decides (may deploy with monitoring)
- Phase 3a tests `INSUFFICIENT` → soft block (CTO can override for hotfix)
- Phase 5 CTO `NO-GO` → full stop

**Recommended frequency**:
- **Pre-deploy**: Run full workflow before every production deployment
- **Weekly audit**: Run Phases 1 + 2 as a scheduled health check
- **Monthly review**: Run full workflow as a comprehensive system review
