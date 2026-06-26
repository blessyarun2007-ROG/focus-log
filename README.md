## Tech Stack
- Frontend: HTML, CSS, JavaScript
- Backend: Express
- AI: Groq via an OpenAI-compatible chat completions client
- Storage: Local JSON file

## Authentication
- Simple login & signup using LocalStorage
- User must log in to access dashboard

## Local Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file:
   ```bash
   GROQ_API_KEY=your_groq_api_key_here
   GROQ_MODEL=llama-3.1-8b-instant
   ```
3. Start the backend:
   ```bash
   npm start
   ```
4. Open `index.html` in the browser, or run `run-all.bat` on Windows.

The frontend sends chat messages to `POST http://localhost:3001/chat`. The backend adds recent focus-log context, calls Groq, and returns a productivity coaching reply.

## Deployment
- Deploy the frontend and Express backend together, or point `API_BASE_URL` in `script.js` at your hosted backend.
# Focus Log

A productivity tracker with an AI assistant to help users stay focused and manage study/work sessions.

## 🚀 Live Demo

focus-log1-2lgjin3f9-blessyarun2007-5791s-projects.vercel.app
## ✨ Features

- Focus Timer
- Session History
- AI Assistant
- Productivity Dashboard
- Dark Modern UI

## 🛠️ Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Supabase
- OpenAI

## 📦 Installation

```bash
npm install
npm run dev
```
