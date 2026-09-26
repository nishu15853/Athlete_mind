# ⚡ AthleteMind

> **Next-Generation Clinical Biomechanics, Gamified Rehabilitation & AI Motion Intelligence**

AthleteMind merges **real-time computer vision**, **3D Euclidean kinematics**, **generative clinical intelligence (Gemini AI)**, and **gamified cyberpunk/combat mechanics** to transform physical therapy, injury prevention, and athletic movement training.

---

## 🚀 Key Features

### 1. 📐 True 3D Euclidean Kinematics Engine
- **Vector Dot Product Angle Computation**: Calculates real-time 3D joint angles using Euclidean vector mathematics across MediaPipe 33-landmark skeletal coordinate spaces.
- **Clinical Fault Guards**:
  - *Dynamic Knee Valgus Detection*: Flags medial knee collapse during squats before patellar shear stresses occur.
  - *Lumbar Hyperextension & Rib Flare*: Monitors core pelvic-rib alignment in overhead presses.
  - *Hip Hinge vs. Lumbar Flexion*: Ensures safe spinal posture during Romanian Deadlifts (RDL).
  - *Pelvic Drop & Trendelenburg Guard*: Tracks unilateral stability in single-leg balance holds.

### 2. 🎮 Cyberpunk HUD & Gamified Boss Combat
- **Deflection & Parry Windows**: Hit biomechanically precise depths to deflect incoming boss attacks and execute kinetic counter-strikes.
- **Dynamic Combo & Form Streaks**: Rewards consecutive clean repetitions with score multipliers; collapses streaks immediately upon form breakdown.
- **Procedural Web Audio Engine**: Zero-asset audio synthesis using the browser's Web Audio API for thunderous sub-bass drops, laser parries, and shockwaves.
- **Bio-Credits, Energy Cores & Ranks**: Progress from *Kinetic Stalker* to elite biomechanical tiers.

### 3. 🩺 Clinical S.O.A.P. & AI Coach
- **Automated S.O.A.P. Notes**: One-click generation of clinical reports (**Subjective, Objective, Assessment, Plan**) summarizing range of motion, symmetry, valgus counts, and adherence metrics.
- **Powered by Google Gemini**: Built-in Next.js API endpoints (`/api/generate-soap` and `/api/ai-coach`) provide intelligent clinical recommendations and real-time coaching feedback.

### 4. 📊 Comprehensive Operator Suite
- **Workout Arena**: Live camera feed with HUD overlays, rep targets, joint angles, and real-time voice cues.
- **Circuit Mode**: Multi-phase sequential training circuits (e.g., Squats ➔ Overhead Press ➔ Wall Push-ups).
- **Telemetry Dashboard**: High-frequency telemetry graphs displaying angular velocity, hold durations, and tension time.
- **Ghost Comparison View**: Side-by-side and ghost skeleton overlay comparing user form with the golden standard trajectory.
- **Camera Calibration & Test**: Ambient lighting validation, joint visibility confidence checks, and distance calibration.
- **Global Leaderboard**: Live rankings stored in a persistent SQLite telemetry backend.

---

## 🛠️ Architecture & Tech Stack

```
Athletemind-/
├── backend/                  # FastAPI Biomechanics Server
│   ├── main.py               # WebSocket telemetry, kinematics math, SQLite leaderboard
│   ├── requirements.txt      # FastAPI, Uvicorn, NumPy, WebSockets
│   ├── Dockerfile            # Container deployment configuration
│   └── test_*.py             # Unit & integration test suites
├── frontend/                 # Next.js 16 Web Application
│   ├── app/                  # App Router, Layouts & API routes
│   │   ├── page.tsx          # Main Arena & state orchestration
│   │   ├── api/ai-coach/     # Gemini conversational coach
│   │   └── api/generate-soap/# Clinical SOAP notes generator
│   ├── components/           # Modular HUD views, menus & modals
│   ├── lib/                  # 10 clinical exercise protocols & 3D vector math
│   └── public/               # Static assets & icons
├── render.yaml               # Backend Render deployment descriptor
└── vercel.json               # Frontend Vercel deployment descriptor
```

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | [Next.js 16](https://nextjs.org/) (Turbopack), [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS v4](https://tailwindcss.com/) |
| **Vision & Audio** | MediaPipe Pose (33 3D Landmarks), HTML5 Canvas, Web Audio API, Web Speech Synthesis |
| **Backend** | [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/), [NumPy](https://numpy.org/), [WebSockets](https://websockets.readthedocs.io/), SQLite3 |
| **Artificial Intelligence** | [Google Gemini API](https://ai.google.dev/) (Clinical notes & AI Coach) |

---

## 📋 Prerequisites

Ensure you have installed:
- **Node.js**: v18.0 or later (v20+ recommended)
- **Python**: v3.10 or later
- **Webcam**: Standard 720p or 1080p camera with adequate lighting

---

## ⚙️ Quick Start

### 1. Clone & Open Repository
```bash
git clone <repo-url>
cd Athletemind-
```

### 2. Start Backend Server
```bash
cd backend

# Create & activate a virtual environment (optional but recommended)
python -m venv env
# Windows:
.\env\Scripts\activate
# macOS/Linux:
source env/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run FastAPI with Uvicorn
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
* Backend API & WebSockets: `http://localhost:8000`
* Interactive API Documentation (Swagger): `http://localhost:8000/docs`

---

### 3. Start Frontend Application
In a new terminal window:
```bash
cd frontend

# Install Node dependencies
npm install

# Start Next.js development server
npm run dev
```
* Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## 🔑 Environment Variables

### Understanding `.gitignore:L9` (`ENV/`)
> [!NOTE]
> In `.gitignore`, the entries `env/`, `venv/`, and `ENV/` refer to **Python virtual environment folders** (directories where Python binaries and installed libraries live), **not** environment variable configuration files.

### Configuring Your `.env` File
To configure environment variables for the frontend:

1. In the `frontend/` directory, create a `.env.local` file (or copy from `frontend/.env.example`):
   ```bash
   cp frontend/.env.example frontend/.env.local
   ```
2. Configure the following variables as needed:

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000/ws/pose` | WebSocket URL pointing to the FastAPI biomechanics backend |
| `GEMINI_API_KEY` | *(Optional)* | Google Gemini API key for clinical SOAP generation & AI coach |
| `GOOGLE_API_KEY` | *(Optional)* | Alternative fallback variable for Gemini API key |

> **Tip**: If you do not provide a `GEMINI_API_KEY`, the application automatically falls back to built-in rule-based deterministic clinical notes and coaching algorithms.

---

## 🧪 Running Automated Tests

Run backend tests:
```bash
cd backend
python -m unittest test_3d_engine.py
python -m unittest test_circuit.py
python -m unittest test_engine.py
python -m unittest test_multi_exercises.py
```

Run frontend linting:
```bash
cd frontend
npm run lint
```

---

## 🚢 Deployment

- **Backend (Render / Docker)**: Pre-configured via [`render.yaml`](./render.yaml) targeting [`backend/Dockerfile`](./backend/Dockerfile).
- **Frontend (Vercel)**: Pre-configured via [`vercel.json`](./vercel.json) pointing to the Next.js `frontend` directory.

---

## 📄 License
Distributed under the MIT License.
