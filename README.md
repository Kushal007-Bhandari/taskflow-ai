# TaskFlow AI — Advanced Todo App

### BCA Project II (CAPJ356) — Tribhuvan University

> An AI-powered productivity tracker with smart task prioritization and Groq-powered AI summaries, built with HTML/CSS/JS + Neon PostgreSQL + Vercel.

---

## 🚀 Setup Guide

### Step 1 — Clone / Download the project

```bash
git clone https://github.com/Kushal007-Bhandari/taskflow-ai.git
cd taskflow-ai
npm install
```

### Step 2 — Create Neon Database

1. Go to [neon.tech](https://neon.tech) → Create free account
2. Create a new **Project** → name it `taskflow`
3. Copy your **Connection String** (looks like `postgresql://user:pass@ep-xxx.neon.tech/neondb`)
4. In Neon Console → **SQL Editor** → paste and run `sql/schema.sql`

### Step 3 — Get a Groq API Key

1. Go to [console.groq.com](https://console.groq.com) → Create free account
2. Navigate to **API Keys** → **Create API Key**
3. Copy the key (starts with `gsk_...`)

### Step 4 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → Create free account
2. **Add New Project** → **Import Git Repository** (connect your GitHub repo)
3. In Vercel **Project Settings** → **Environment Variables** → Add:

```
DATABASE_URL  =  your-neon-connection-string
GROQ_API_KEY  =  your-groq-api-key
```

4. Deploy!

### Step 5 — Done! 🎉

Your app will be live at `https://your-project.vercel.app`

For local development:

```bash
npx vercel dev
```

---

## 🛠️ Tech Stack

| Layer      | Technology                    | Purpose                        |
|------------|-------------------------------|--------------------------------|
| Frontend   | HTML5 + CSS3 + Vanilla JS     | User interface                 |
| Database   | Neon PostgreSQL 16            | Cloud database                 |
| Backend    | Vercel Serverless Functions   | Node.js 20 API layer           |
| AI         | Groq Cloud API (Llama 3.3 70B)| AI summaries & chat assistant  |
| Charts     | Chart.js 4.4.0                | Analytics visualization        |
| Auth       | Custom JWT-less sessions      | User authentication            |
| Hosting    | Vercel                        | Continuous deployment          |

---

## 📁 Project Structure

```
taskflow-ai/
├── index.html              # Login / Register
├── dashboard.html          # Main task dashboard (Smart Focus here)
├── analytics.html          # Charts & insights
├── summary.html            # AI summary & chat
├── css/
│   └── style.css           # All styles (light + dark theme)
├── js/
│   ├── config.js           # App configuration & API endpoint helpers
│   ├── auth.js             # Client-side authentication logic
│   ├── api.js              # API wrapper (TodoAPI object)
│   ├── ui.js               # Shared UI utilities (Toast, Modal, Theme)
│   ├── ai.js               # AI context builder + fallback logic
│   └── icons.js            # SVG icon library
├── api/
│   ├── auth.js             # Register, login, verify, logout
│   ├── todos.js            # Todo CRUD operations
│   ├── categories.js       # Category management
│   ├── stats.js            # Analytics & stats queries
│   └── ai-summary.js       # Groq AI proxy (summary + chat)
├── sql/
│   └── schema.sql          # PostgreSQL schema (run once in Neon)
├── vercel.json             # Vercel configuration
├── package.json
└── README.md
```

---

## ✨ Features

### Core
- ✅ Create, read, update, delete todos
- 🔴🟡🟢 Priority levels (High / Medium / Low)
- 📁 Custom categories with colors and icons
- 📅 Due dates with overdue detection
- 🔍 Search and filter (status, priority, category)
- 👤 User authentication (register / login)

### Advanced
- ⚡ **Smart Focus** — scoring algorithm that ranks tasks by priority, overdue days, and age
- 🤖 **AI Productivity Summary** — Groq Llama 3.3 70B generates a personalized summary of your progress
- 💬 **AI Chat Assistant** — conversational interface to ask about your tasks and productivity
- 📊 **Analytics dashboard** with Chart.js
  - Daily activity chart (completions + created)
  - Priority distribution (doughnut chart)
  - Category breakdown (bar chart)
  - Best days of week (radar chart)
- 📈 Monthly history table with completion rates
- 🌙 Dark / Light theme toggle

---

## ⚡ Smart Focus Algorithm

Each pending task is scored by three factors:

```
score = (priority_weight × 3) + (overdue_days × 2) + min(age_days × 0.5, 5)

Priority weights:  high = 3,  medium = 2,  low = 1
Overdue bonus:     +2 points for each day past due date
Age bonus:         +0.5 points per day since creation, capped at 5
```

Example: High priority task, 3 days overdue, created 8 days ago → 9 + 6 + 4 = **19 pts**

Implemented client-side in `dashboard.html` (`scoreTask()` function).

---

## 🔒 Security Notes

- Passwords are hashed with bcryptjs (cost factor 12)
- Session tokens are cryptographically random (32 bytes → 64 hex characters)
- Sessions expire after 30 days
- All API endpoints validate the session token before responding
- `DATABASE_URL` and `GROQ_API_KEY` are stored as Vercel environment variables (never in browser)
- All database queries are parameterized via the Neon template-literal driver (SQL injection safe)

---

## 📖 References

- Neon Documentation: <https://neon.tech/docs>
- Vercel Serverless Functions: <https://vercel.com/docs/functions>
- Groq API Documentation: <https://console.groq.com/docs>
- Chart.js: <https://www.chartjs.org/docs>
- bcryptjs: <https://github.com/dcodeIO/bcrypt.js>

---

*Built for CAPJ356 Project II · Tribhuvan University · BCA Program*
*Kushal Bhandari (Roll No. 09) · Pradeep Thapa (Roll No. 16)*
*Supervisor: Mr. Pratik Joshi · Submission: April 2026*
