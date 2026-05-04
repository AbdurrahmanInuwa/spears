# SPAERS — Smart Panic Alert & Emergency Response System

Two-folder monorepo:

- `frontend/` — Next.js 14 (App Router, JavaScript) + Tailwind CSS
- `backend/` — Node.js + Express skeleton

## Quick start

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
# → http://localhost:5000
```

### Frontend

```bash
cd frontend
cp .env.local.example .env.local
# add your Google Maps API key inside .env.local
npm install
npm run dev
# → http://localhost:3000
```

## Pages

- `/` — Home: header (SPAERS logo + About / Integration links), centered Google Map, four corner info cards (Status & Location, Safety Status, Nearby Help with modal, Quick Action / SOS button), Sign In CTA, footer.
- `/about` — Heading + intro on the left, rotating decorative figure on the right with a mission box overlay.
- `/integration` — Two-column layout: "A Physical Lifeline" copy on the left, hardware image placeholder on the right.
