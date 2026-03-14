<div align="center">
  <h1>Recall AI</h1>
  <p>Inventory management for India's kirana stores — powered by Indic AI.</p>

  <br />

  ![Tests](https://img.shields.io/badge/tests-passing-brightgreen)
  ![Platform](https://img.shields.io/badge/platform-Android-green)
  ![License](https://img.shields.io/badge/license-Proprietary-red)
</div>

<br />

Recall AI lets a kirana store owner photograph their handwritten stock ledger — in Hindi, Gujarati, or Marathi — and get live digital inventory in seconds. No typing. No barcode scanner. No internet required.

## Features

- Read handwritten ledgers in Hindi, Gujarati, and Marathi
- Works fully offline — syncs automatically when connected
- Self-improving — accuracy increases with every scan
- Built for Android — designed for entry-level devices

## Stack

- **Mobile** — React Native + WatermelonDB
- **Backend** — FastAPI on Azure App Service
- **AI** — Sarvam Vision (Indic OCR) + GPT-4o mini via Azure AI Foundry
- **Database** — Azure Cosmos DB serverless
- **Queue** — Upstash Redis + RQ

## Getting Started

**Prerequisites**

- Python 3.9+, Node.js 18+
- Azure account (Cosmos DB + Blob Storage + Azure AI Foundry)
- [Sarvam AI](https://dashboard.sarvam.ai) API key
- [Upstash Redis](https://upstash.com) (free tier)
- Twilio account

**Setup**

```bash
git clone https://github.com/Sarvesh5273/Recall-AI.git
cd Recall-AI-Platform/backend

python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Fill in all required values

pytest -v
uvicorn main:app --reload
```

**Run the job worker** (separate terminal)

```bash
source venv/bin/activate && source .env
rq worker --with-scheduler --url "$REDIS_URL"
```

**Run with Docker**

```bash
docker-compose up --build
```

## Project Structure

```
Recall-AI-Platform/
├── backend/          # FastAPI — API, OCR pipeline, job queue
├── RecallMobile/     # React Native — offline-first mobile app
├── admin-portal/     # Internal ops dashboard
└── docker-compose.yml
```

## License

Proprietary. © 2026 Recall AI. All rights reserved.