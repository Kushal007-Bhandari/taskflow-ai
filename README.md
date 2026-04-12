# TaskFlow AI — Advanced Todo App
### BCA Project II (CAPJ356) — Tribhuvan University

> An AI-powered productivity tracker with on-device summarization, built with HTML/CSS/JS + Neon PostgreSQL + Netlify.

---

## 🚀 Setup Guide

### Step 1 — Clone / Download the project
```bash
git clone <your-repo>
cd todo-app
npm install
```

### Step 2 — Create Neon Database
1. Go to [neon.tech](https://neon.tech) → Create free account
2. Create a new **Project** → name it `taskflow`
3. Copy your **Connection String** (looks like `postgresql://user:pass@ep-xxx.neon.tech/neondb`)
4. In Neon Console → **SQL Editor** → paste and run `sql/schema.sql`

### Step 3 — Deploy to Netlify
1. Go to [netlify.com](https://netlify.com) → Create free account
2. **Add new site** → **Import from Git** (connect your GitHub repo)
   - OR drag and drop the project folder
3. In Netlify **Site Settings** → **Environment Variables** → Add:
   ```
   DATABASE_URL = your-neon-connection-string
   ```
4. Deploy!

### Step 4 — Done! 🎉
Your app will be live at `https://your-site.netlify.app`

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | HTML5 + CSS3 + Vanilla JS | User interface |
| Database | Neon PostgreSQL | Cloud database |
| Backend | Netlify Functions (Node.js) | Serverless API |
| AI | Transformers.js (Xenova) | On-device summarization |
| Charts | Chart.js | Analytics visualization |
| Auth | Custom JWT-less sessions | User authentication |
| Hosting | Netlify | Free deployment |

---

## 📁 Project Structure

```
todo-app/
├── index.html              # Login / Register
├── dashboard.html          # Main task dashboard
├── analytics.html          # Charts & insights
├── summary.html            # AI summary generator
├── css/
│   └── style.css           # All styles (dark theme)
├── js/
│   ├── config.js           # App configuration
│   ├── auth.js             # Authentication logic
│   ├── api.js              # API wrapper
│   ├── ui.js               # UI utilities, toast, modal
│   └── ai.js               # Transformers.js AI module
├── netlify/
│   └── functions/
│       ├── auth.js         # Register, login, verify
│       ├── todos.js        # Todo CRUD operations
│       ├── categories.js   # Category management
│       └── stats.js        # Analytics & stats
├── sql/
│   └── schema.sql          # PostgreSQL schema
├── package.json
├── netlify.toml
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
- 🤖 **On-device AI summarization** (no API cost, privacy-first)
- 📊 **Analytics dashboard** with Chart.js
  - Daily activity chart
  - Priority distribution (doughnut)
  - Category breakdown (bar chart)
  - Best days of week (radar chart)
- 📈 Monthly history table with completion rates
- 🎯 Productivity scoring

---

## 🔒 Security Notes
- Passwords are hashed with bcryptjs (12 rounds)
- Session tokens are cryptographically random (32 bytes)
- Sessions expire after 30 days
- All API endpoints validate session token before responding
- DATABASE_URL is stored as Netlify environment variable (never in browser)

---

## 📖 Report References
- Neon Documentation: https://neon.tech/docs
- Netlify Functions: https://docs.netlify.com/functions/overview
- Transformers.js: https://huggingface.co/docs/transformers.js
- Chart.js: https://www.chartjs.org/docs
- bcryptjs: https://github.com/dcodeIO/bcrypt.js

---

*Built for CAPJ356 Project II · Tribhuvan University · BCA Program*
