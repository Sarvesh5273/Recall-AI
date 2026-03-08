# Feature Review Workflow

> **Trigger**: When planning or implementing a new feature for Recall AI.
> **Goal**: Ensure the feature is well-scoped, correctly implemented, secure, cost-viable, and tested — before it ships.

---

## Phase 1: Scoping & Design

**Agents**: `product_manager` → `cto` → `tech_architect`

### Step 1 — Product Scoping (`product_manager`)

**Input**: Feature description from the founder.

**Tasks**:
- Define the user story from the kirana owner's perspective
- Identify which user flow this feature affects (scan, inbox, inventory, settings, auth)
- Determine if this impacts free/basic/pro tiers differently
- Specify acceptance criteria (what "done" looks like for the user)
- Flag i18n requirements (does this need Hindi/Marathi/Gujarati text?)
- Estimate user impact (how many users benefit, how often)

**Output**:
```
## Feature Scope
- User story: As a [kirana owner], I want [X] so that [Y]
- Affected screens: [list]
- Affected endpoints: [list]
- Plan tier impact: [free/basic/pro]
- i18n needed: [yes/no, which strings]
- Acceptance criteria: [numbered list]
- Priority: [P0/P1/P2]
```

### Step 2 — Technical Decision (`cto`)

**Input**: Product scope from Step 1.

**Tasks**:
- Determine which agents need to be involved in implementation
- Identify cross-cutting concerns (does this touch both mobile + backend?)
- Flag any technical debt that should be addressed alongside this feature
- Make build-vs-skip decision (is this worth building now?)
- Identify dependencies (does this need infra work first?)

**Output**:
```
## CTO Decision
- Build decision: [GO / DEFER / MODIFY]
- Agents assigned: [list with responsibilities]
- Dependencies: [what must exist before this can start]
- Technical debt to address: [if any]
- Trade-offs accepted: [what we're choosing not to do]
```

### Step 3 — Architecture Design (`tech_architect`)

**Input**: CTO decision from Step 2.

**Tasks**:
- Design API contracts (new/modified endpoints, request/response schemas)
- Design data model changes (new Cosmos DB document types or fields)
- Design mobile data flow (new WatermelonDB tables, context changes, navigation)
- Identify integration points with existing code
- Specify offline behavior (how does this work without internet?)

**Output**:
```
## Architecture Design
- API changes: [endpoint specs]
- Data model changes: [Cosmos DB document schema]
- Mobile changes: [WatermelonDB schema, navigation, context]
- Offline behavior: [how it works offline]
- Integration points: [what existing code is touched]
```

---

## Phase 2: Risk Assessment

**Agents**: `security_engineer` + `cost_optimizer` + `reliability_engineer` (run in parallel)

### Step 4a — Security Review (`security_engineer`)

**Input**: Architecture design from Step 3.

**Tasks**:
- Review new endpoints for auth requirements (does it need `Depends(get_current_shop)`?)
- Check for data exposure risks (does this leak shop data across tenants?)
- Evaluate input validation (are new Pydantic models sufficient?)
- Check rate limiting needs (does this new endpoint need its own limit?)
- Flag any new third-party data flows

**Output**:
```
## Security Review
- Auth requirements: [what needs protection]
- Data exposure risks: [any cross-tenant leaks]
- Input validation: [Pydantic model review]
- Rate limiting: [recommended limits]
- Third-party data: [any new external data flows]
- Verdict: [PASS / PASS WITH CONDITIONS / BLOCK]
```

### Step 4b — Cost Impact (`cost_optimizer`)

**Input**: Architecture design from Step 3.

**Tasks**:
- Estimate per-request cost of new endpoint (Cosmos RU, AI calls, storage)
- Calculate monthly cost at current scale and 10x scale
- Check if this changes unit economics for any plan tier
- Identify if training signals or caching can reduce cost over time

**Output**:
```
## Cost Impact
- Per-request cost: ₹[X]
- Monthly cost at current scale: ₹[X]
- Monthly cost at 10x scale: ₹[X]
- Plan tier impact: [does this break free tier economics?]
- Cost reduction path: [how cost decreases over time]
- Verdict: [VIABLE / NEEDS OPTIMIZATION / TOO EXPENSIVE]
```

### Step 4c — Reliability Review (`reliability_engineer`)

**Input**: Architecture design from Step 3.

**Tasks**:
- Identify failure modes (what external calls can fail?)
- Review retry and timeout strategy for new code paths
- Check offline/sync implications (does this create new sync conflicts?)
- Ensure idempotency for any state-changing operations
- Verify graceful degradation (what happens when this feature's dependency is down?)

**Output**:
```
## Reliability Review
- Failure modes: [list with severity]
- Retry strategy: [timeouts, backoff, max retries]
- Offline impact: [sync conflicts, queue behavior]
- Idempotency: [is it safe to retry?]
- Degradation plan: [what happens when X is down]
- Verdict: [RESILIENT / NEEDS HARDENING / FRAGILE]
```

---

## Phase 3: Implementation

**Agents**: `backend_engineer` + `mobile_engineer` + `ui_designer` (sequenced by dependency)

### Step 5 — UI/UX Design (`ui_designer`)

**Input**: Product scope (Step 1) + Architecture design (Step 3).

**Tasks**:
- Design screen layout following existing design system
- Specify component patterns (cards, modals, buttons, lists)
- Define empty states, loading states, and error states
- Ensure touch targets ≥48px and text ≥14px
- Add i18n string specifications for all 4 languages
- Design offline state indicators if applicable

**Output**:
```
## UI Specification
- Screen layout: [description or wireframe]
- Components used: [existing patterns]
- States: [empty, loading, error, success]
- i18n strings: [key → EN/HI/MR/GU values]
- Accessibility: [labels, contrast, touch targets]
```

### Step 6 — Backend Implementation (`backend_engineer`)

**Input**: Architecture design (Step 3) + Security review (Step 4a).

**Tasks**:
- Implement new/modified FastAPI endpoints with Pydantic validation
- Write Cosmos DB queries with parameterized inputs
- Add rate limiting for new endpoints
- Ensure auth dependency on protected routes
- Add structured logging for new operations
- Handle errors with proper HTTP status codes

**Output**:
```
## Backend Changes
- Files modified: [list]
- New endpoints: [method, path, auth, rate limit]
- New Pydantic models: [list]
- Cosmos DB queries: [new queries added]
- Error handling: [status codes and messages]
```

### Step 7 — Mobile Implementation (`mobile_engineer`)

**Input**: Architecture design (Step 3) + UI spec (Step 5) + Backend changes (Step 6).

**Tasks**:
- Implement new screens/components following existing patterns
- Add WatermelonDB schema changes with migrations if needed
- Wire up API calls with Bearer token auth
- Implement offline behavior (queue, cache, or block)
- Add i18n translations to LanguageContext
- Update navigation tree if new screens added
- Add SyncWorker handling if new sync operations needed

**Output**:
```
## Mobile Changes
- Files modified/created: [list]
- New screens: [list with navigation path]
- WatermelonDB changes: [new tables, migrations]
- API calls: [new fetch calls]
- Offline behavior: [how it works offline]
- i18n: [strings added to all 4 languages]
```

---

## Phase 4: Verification

**Agents**: `qa_engineer` → `data_analyst`

### Step 8 — Test Plan & Execution (`qa_engineer`)

**Input**: All outputs from Phase 3.

**Tasks**:
- Write test cases for new backend endpoints (happy path + edge cases)
- Write test cases for mobile behavior (online + offline)
- Verify idempotency (same request twice = safe)
- Test multilingual inputs (Hindi, Gujarati, Marathi text)
- Verify rate limiting works on new endpoints
- Check auth is enforced (unauthenticated calls rejected)
- Test error states (what happens when API returns 500?)

**Output**:
```
## Test Results
- Backend tests: [X passed, Y failed]
- Mobile tests: [X passed, Y failed]
- Edge cases tested: [list]
- Multilingual tested: [yes/no]
- Offline tested: [yes/no]
- Verdict: [PASS / FAIL with details]
```

### Step 9 — Analytics Instrumentation (`data_analyst`)

**Input**: Product scope (Step 1) + Implementation details (Steps 6-7).

**Tasks**:
- Define analytics events for the new feature
- Specify success metrics (how we measure if this feature works)
- Identify what data should be tracked in Cosmos DB for future analysis
- Recommend dashboard additions

**Output**:
```
## Analytics Plan
- Events to track: [list with properties]
- Success metrics: [with targets]
- Dashboard updates: [what to add]
- Data retention: [any new data stored]
```

---

## Phase 5: Ship Decision

**Agent**: `cto`

### Step 10 — Final Review (`cto`)

**Input**: All outputs from Phases 1-4.

**Tasks**:
- Review all agent outputs for conflicts or gaps
- Confirm security, cost, and reliability verdicts are acceptable
- Verify test coverage is sufficient
- Make final GO/NO-GO decision

**Output**:
```
## Ship Decision
- Decision: [SHIP / HOLD / REWORK]
- Conditions: [any remaining items before ship]
- Risks accepted: [what we're shipping with]
- Follow-up items: [post-ship improvements]
```

---

## Workflow Summary

```
Phase 1: Scoping          product_manager → cto → tech_architect
Phase 2: Risk Assessment   security_engineer ∥ cost_optimizer ∥ reliability_engineer
Phase 3: Implementation    ui_designer → backend_engineer → mobile_engineer
Phase 4: Verification      qa_engineer → data_analyst
Phase 5: Ship Decision     cto
```

**Total agents involved**: 11 of 14
**Parallel steps**: Phase 2 (security + cost + reliability run simultaneously)
**Estimated phases**: 5 sequential phases, ~10 steps
