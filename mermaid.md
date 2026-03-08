flowchart TD

%% ── USER ACTIONS ──────────────────────────────
U1([👤 Shop Owner])

U1 -->|"1 · First Launch"| AUTH
U1 -->|"2 · Scans paper ledger"| SCAN
U1 -->|"3 · Reviews unmatched items"| QUARANTINE
U1 -->|"4 · Checks stock"| INVENTORY

%% ── AUTH FLOW ─────────────────────────────────
subgraph AUTH["🔐 Login  —  Twilio + JWT"]
    direction LR
    a1[Send OTP\nTwilio SMS] --> a2[Verify OTP] --> a3[Issue JWT\n30-day token]
end

%% ── SCAN FLOW ─────────────────────────────────
subgraph SCAN["📸 Scan Ledger  —  FastAPI"]
    direction LR
    s1[Image uploaded\nto Blob Storage] --> s2[Sarvam Vision AI\nIndic OCR] --> s3[GPT-4o-mini\nStructure & Normalize] --> s4{Smart Matcher}
    s4 -->|"Confident match"| s5[✅ Auto-saved\nto Inventory]
    s4 -->|"No match"| s6[⚠️ Sent to\nQuarantine Inbox]
end

%% ── QUARANTINE FLOW ───────────────────────────
subgraph QUARANTINE["🧠 Quarantine Resolution  —  FastAPI"]
    direction LR
    q1[Owner picks\ncorrect item] --> q2[Inventory updated] --> q3[Saved as\nTraining Signal]
    q3 -.->|"Next scan auto-matches"| s4
end

%% ── INVENTORY FLOW ────────────────────────────
subgraph INVENTORY["📦 Inventory  —  React Native"]
    direction LR
    i1[(WatermelonDB\nOffline Cache)] -->|"Works offline"| i2[View / Adjust\nStock Counts]
end

%% ── AZURE DATA LAYER ──────────────────────────
subgraph AZURE["☁️ Azure  —  Data Layer"]
    direction LR
    db1[(Cosmos DB\nInventory)]
    db2[(Cosmos DB\nTraining Signals)]
    bl[(Blob Storage\nImages)]
end

%% ── DATA CONNECTIONS ──────────────────────────
a3 -->|"Token stored on device"| i1
s1 --> bl
s5 --> db1
q2 --> db1
q3 --> db2
db1 <-->|"Sync on connect"| i1