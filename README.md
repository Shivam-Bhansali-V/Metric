# Metric ⏱️

Metric is a premium, lightweight time tracking and task scheduling application designed for high productivity. It features instant cross-user task assignment notifications, live daily targets, and dynamic dashboard analytics.

---

## Features
- **Live Time Tracker**: Start, stop, and tag project tasks in real-time.
- **Task Scheduler**: Plan tasks, set reminders, and add detailed descriptions.
- **Cross-User Assignments**: Assign tasks directly to teammates by typing `@username`. They will instantly receive in-app notifications.
- **Interactive Analytics**: Visualize daily allocations and weekly summaries with dynamic charts.
- **Premium Aesthetics**: Seamless transitions between Light and Dark mode.
- **Google OAuth**: Fast and secure sign-in out-of-the-box.

---

## Technology Stack
- **Frontend**: React, TypeScript, Vite, Vanilla CSS.
- **Backend**: Node.js, Express, Prisma ORM.
- **Database**: Supabase PostgreSQL.

---

## Local Setup

### 1. Prerequisites
Ensure you have **Node.js** and **npm** installed.

### 2. Configure Database & Auth
Create a `.env` file in the `backend/` folder:
```env
DATABASE_URL="your-supabase-connection-string"
GOOGLE_CLIENT_ID="google-api-key-set-your"
PORT=5000
```

### 3. Initialize Database
In the `backend/` folder, run:
```bash
npx prisma db push
```

### 4. Run the Servers
Start both servers simultaneously in your terminal:

**Backend**:
```bash
cd backend
npm install
npm run dev
```

**Frontend**:
```bash
cd frontend
npm install
npm run dev
```

Open **`http://localhost:5173`** to use Metric!

---

## Credits & Collaboration
Metric was designed and built as a collaborative pair-programming project between **Shivam Madanlal Bhansali** and **Antigravity**, an agentic AI coding assistant designed by the Google DeepMind team. 
