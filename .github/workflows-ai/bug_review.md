# Bug Review Workflow

> **Trigger**: When a bug is reported — user-facing issue, data inconsistency, crash, or unexpected behavior.
> **Goal**: Quickly diagnose the root cause, fix it safely, verify the fix doesn't break anything, and prevent recurrence.

---

## Phase 1: Triage & Diagnosis

**Agents**: `cto` → `qa_engineer` → specialist agent(s)

### Step 1 — Bug Classification (`cto`)

**Input**: Bug report (description, reproduction steps, affected user/screen).

**Tasks**:
- Classify severity:
  - **P0 Critical**: Data loss, inventory corruption, auth bypass, crash on startup
  - **P1 High**: Feature broken, scan processing fails, sync stuck
  - **P2 Medium**: UI glitch, incorrect display, slow performance
  - **P3 Low**: Cosmetic, typo, minor UX issue
- Classify domain:
  - **AI Pipeline**: OCR, GPT extraction, matching, training signals
  - **Backend API**: Endpoint errors, Cosmos DB, auth, rate limiting
  - **Mobile App**: UI, navigation, WatermelonDB, offline sync
  - **Infrastructure**: Deployment, connectivity, Azure services
  - **Security**: Auth bypass, data leak, injection
- Assign investigating agents based on domain
- Determine if this needs a hotfix (P0/P1) or can wait for next release

**Output**:
```
## Bug Triage
- Severity: [P0/P1/P2/P3]
- Domain: [AI Pipeline / Backend / Mobile / Infra / Security]
- Assigned agents: [list]
- Hotfix needed: [yes/no]
- Affected users: [all / specific plan / specific device]
- Affected flow: [scan / inbox / inventory / auth / settings]
```

### Step 2 — Reproduction & Root Cause (`qa_engineer`)

**Input**: Bug triage from Step 1.

**Tasks**:
- Define exact reproduction steps
- Identify the triggering condition (specific input, timing, network state, device)
- Check if this is a regression (did it work before?)
- Narrow down to the specific file(s) and line(s) involved
- Document the expected vs. actual behavior

**Output**:
```
## Root Cause Analysis
- Reproduction steps: [numbered list]
- Triggering condition: [what specifically causes it]
- Regression: [yes/no — when did it start?]
- Root cause: [specific code path / logic error / race condition / etc.]
- Affected files: [list with line numbers]
- Expected behavior: [what should happen]
- Actual behavior: [what actually happens]
```

### Step 3 — Specialist Diagnosis (domain-specific agent)

**Based on the domain from Step 1, ONE of these agents runs:**

#### If AI Pipeline → `ai_engineer`
**Tasks**:
- Check if OCR is returning garbage (Sarvam issue)
- Check if GPT prompt is producing wrong output (prompt issue)
- Check if matching cascade is skipping tiers (logic issue)
- Check if training signals have bad data (data quality issue)
- Check confidence thresholds and unit normalization

**Output**:
```
## AI Diagnosis
- Pipeline stage failing: [OCR / Extraction / Matching / Training]
- Root cause: [prompt issue / threshold / data quality / API change]
- Sample input → actual output → expected output
- Fix approach: [prompt change / threshold adjust / data cleanup]
```

#### If Backend API → `backend_engineer`
**Tasks**:
- Trace the request through the endpoint code
- Check Cosmos DB query correctness (parameterized? partition key used?)
- Check Pydantic validation (is bad input getting through?)
- Check auth and rate limiting logic
- Check error handling (are exceptions caught properly?)

**Output**:
```
## Backend Diagnosis
- Endpoint affected: [method + path]
- Request that triggers bug: [sample request]
- Code path: [file:line → file:line → failure point]
- Root cause: [query bug / validation gap / missing error handling / race condition]
- Fix approach: [specific code change]
```

#### If Mobile App → `mobile_engineer`
**Tasks**:
- Check navigation flow (is the user reaching the wrong screen?)
- Check WatermelonDB queries (wrong data displayed?)
- Check SyncWorker behavior (sync stuck? queue corrupted?)
- Check offline/online state handling (wrong network assumption?)
- Check AsyncStorage state (stale token? wrong PIN state?)

**Output**:
```
## Mobile Diagnosis
- Screen affected: [screen name]
- Component/file: [file path]
- State at time of bug: [auth state, network state, DB state]
- Root cause: [state management / query / sync / navigation / UI]
- Fix approach: [specific code change]
```

#### If Security → `security_engineer`
**Tasks**:
- Assess exploitability (can this be used maliciously?)
- Check if data was exposed (cross-tenant leak? token exposure?)
- Determine blast radius (how many users affected?)
- Check if this is already being exploited (logs analysis)

**Output**:
```
## Security Diagnosis
- Vulnerability type: [auth bypass / data leak / injection / CORS / etc.]
- Exploitability: [trivial / requires knowledge / theoretical]
- Data exposed: [what data, how many users]
- Currently exploited: [yes/no/unknown]
- Fix urgency: [immediate hotfix / next release / backlog]
```

#### If Infrastructure → `reliability_engineer`
**Tasks**:
- Check if an external service is degraded (Sarvam, Azure, Twilio)
- Check if Cosmos DB is throttling (429 errors)
- Check if the server process restarted (in-memory state lost)
- Check timeout configurations
- Check network path between mobile → backend → Azure services

**Output**:
```
## Infrastructure Diagnosis
- Service affected: [Cosmos DB / Sarvam / Azure OpenAI / Twilio / Blob Storage]
- Failure type: [timeout / throttle / outage / misconfiguration]
- Duration: [when it started, is it ongoing?]
- Impact: [which endpoints/features affected]
- Fix approach: [retry config / circuit breaker / fallback / wait for recovery]
```

---

## Phase 2: Fix Implementation

**Agents**: Specialist agent (from Phase 1) + `reliability_engineer`

### Step 4 — Implement Fix (domain specialist)

**Input**: Root cause from Phase 1.

**Tasks**:
- Write the minimal, surgical fix (don't refactor unrelated code)
- Ensure the fix handles the edge case that triggered the bug
- Add defensive code to prevent similar issues (guard clauses, validation)
- Add logging at the failure point for future debugging
- If mobile fix: verify it works offline
- If backend fix: verify it's idempotent

**Output**:
```
## Fix Implementation
- Files changed: [list with description of changes]
- Lines of code changed: [count]
- Defensive additions: [guard clauses, validation, logging]
- Idempotent: [yes/no]
- Offline-safe: [yes/no — mobile only]
```

### Step 5 — Resilience Check (`reliability_engineer`)

**Input**: Fix from Step 4.

**Tasks**:
- Verify the fix doesn't introduce new failure modes
- Check if retry/timeout behavior is affected
- Verify sync behavior isn't disrupted (mobile)
- Confirm the fix degrades gracefully if the underlying cause recurs
- Check if a circuit breaker or retry budget should be added

**Output**:
```
## Resilience Check
- New failure modes introduced: [none / list]
- Retry behavior: [unchanged / modified]
- Sync impact: [none / details]
- Graceful degradation: [verified / needs work]
- Verdict: [RESILIENT / NEEDS HARDENING]
```

---

## Phase 3: Verification

**Agents**: `qa_engineer` → `security_engineer` (if security-related)

### Step 6 — Test the Fix (`qa_engineer`)

**Input**: Fix from Step 4 + original reproduction steps from Step 2.

**Tasks**:
- Verify the original bug is fixed (reproduction steps no longer trigger it)
- Write a regression test that catches this bug if it comes back
- Test adjacent functionality (did the fix break anything nearby?)
- Test edge cases related to the bug:
  - What if the input is empty?
  - What if network drops during the operation?
  - What if the user is on a different plan tier?
  - What if the text is in Hindi/Gujarati/Marathi?
- If P0/P1: Test on both Android and iOS

**Output**:
```
## Verification Results
- Original bug fixed: [yes/no]
- Regression test written: [yes — test name / no]
- Adjacent features tested: [list — all pass / failures]
- Edge cases tested: [list with results]
- Platform tested: [Android / iOS / both]
- Verdict: [FIX VERIFIED / STILL BROKEN / NEW ISSUES]
```

### Step 7 — Security Re-check (`security_engineer`) — *only if bug was security-related*

**Input**: Fix from Step 4 + Security diagnosis from Step 3.

**Tasks**:
- Verify the vulnerability is fully closed (not just partially patched)
- Check if similar vulnerabilities exist elsewhere in the codebase
- Verify no new attack surface was created by the fix
- Recommend if security audit of related code is needed

**Output**:
```
## Security Re-check
- Vulnerability closed: [yes / partially / no]
- Similar vulnerabilities found: [none / list]
- New attack surface: [none / list]
- Audit recommended: [yes — scope / no]
- Verdict: [SECURE / NEEDS MORE WORK]
```

---

## Phase 4: Ship & Prevent

**Agents**: `cto` → `data_analyst`

### Step 8 — Ship Decision (`cto`)

**Input**: All outputs from Phases 1-3.

**Tasks**:
- Confirm the fix is verified and resilient
- Decide: hotfix (deploy now) or batch (next release)
- Identify if any documentation needs updating
- Determine if users need to be notified

**Output**:
```
## Ship Decision
- Decision: [HOTFIX NOW / NEXT RELEASE / HOLD]
- Notification needed: [yes — channel / no]
- Documentation update: [yes — what / no]
- Post-mortem needed: [yes — for P0/P1 / no]
```

### Step 9 — Prevention & Monitoring (`data_analyst`)

**Input**: Root cause from Phase 1 + Fix from Phase 2.

**Tasks**:
- Define monitoring for this failure mode (what metric would catch it early?)
- Recommend alerting thresholds
- Check if existing analytics would have detected this sooner
- Suggest instrumentation additions to prevent blind spots

**Output**:
```
## Prevention Plan
- Monitoring: [metric to track, threshold for alert]
- Early detection: [how we'd catch this sooner next time]
- Instrumentation gaps: [events to add]
- Similar risks: [other areas that could have the same problem]
```

---

## Workflow Summary

```
Phase 1: Triage        cto → qa_engineer → specialist (ai/backend/mobile/security/reliability)
Phase 2: Fix           specialist → reliability_engineer
Phase 3: Verification  qa_engineer → security_engineer (if security bug)
Phase 4: Ship          cto → data_analyst
```

**Agent routing by domain**:
| Domain | Primary | Supporting |
|--------|---------|-----------|
| AI Pipeline | ai_engineer | backend_engineer, data_analyst |
| Backend API | backend_engineer | reliability_engineer, security_engineer |
| Mobile App | mobile_engineer | reliability_engineer, ui_designer |
| Security | security_engineer | backend_engineer, mobile_engineer |
| Infrastructure | reliability_engineer | devops_engineer, backend_engineer |

**P0/P1 fast path**: Skip to Step 4 (fix) immediately after Step 2 (root cause), run verification in parallel.
