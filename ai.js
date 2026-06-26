import "dotenv/config";
import express from "express";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3001;
const groqModel = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const maxPromptLength = 1000;
const rateLimitWindowMs = 60 * 1000;
const maxChatRequestsPerWindow = 20;
const dbFile = new URL("./db.json", import.meta.url);
const chatRateLimits = new Map();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

const groq = process.env.GROQ_API_KEY
  ? new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    })
  : null;

if (!groq) {
  console.warn("GROQ_API_KEY is missing. /chat will return local fallback advice until you add it to .env.");
}

// Small JSON-file store. This keeps the project simple while still persisting logs.
async function readDatabase() {
  if (!existsSync(dbFile)) {
    return { focusLogs: [] };
  }

  const file = await readFile(dbFile, "utf8");
  const data = JSON.parse(file || "{}");

  return {
    ...data,
    focusLogs: Array.isArray(data.focusLogs) ? data.focusLogs : [],
  };
}

async function writeDatabase(data) {
  await writeFile(dbFile, JSON.stringify(data, null, 2));
}

function buildFocusSummary(logs) {
  if (!logs.length) {
    return "No focus sessions have been logged yet.";
  }

  const recentLogs = logs
    .slice(-8)
    .map(log => `${log.taskName}: ${log.durationMinutes} minutes on ${new Date(log.startedAt).toLocaleString()}`)
    .join("\n");

  const totalMinutes = logs.reduce((sum, log) => sum + log.durationMinutes, 0);
  const averageMinutes = Math.round(totalMinutes / logs.length);

  return [
    `Total sessions: ${logs.length}`,
    `Total focus time: ${totalMinutes} minutes`,
    `Average session: ${averageMinutes} minutes`,
    "Recent sessions:",
    recentLogs,
  ].join("\n");
}

function buildFallbackReply(message, logs) {
  const lowerMessage = message.toLowerCase();
  const totalMinutes = logs.reduce((sum, log) => sum + Number(log.durationMinutes || 0), 0);
  const averageMinutes = logs.length ? Math.round(totalMinutes / logs.length) : 0;

  if (lowerMessage.includes("study plan") || lowerMessage.includes("plan")) {
    return [
      "I could not reach Groq right now, so here is a practical focus plan you can use:",
      "",
      "1. Pick one main study task and write the exact outcome.",
      "2. Do 25 minutes of focused work.",
      "3. Take a 5 minute break away from the screen.",
      "4. Repeat for 3 rounds.",
      "5. Spend the final 10 minutes reviewing what you finished and logging the session.",
    ].join("\n");
  }

  if (lowerMessage.includes("tip") || lowerMessage.includes("focused") || lowerMessage.includes("focus")) {
    return [
      "I could not reach Groq right now, but here are useful focus tips:",
      "",
      "1. Start with one clearly named task.",
      "2. Put your phone out of reach.",
      "3. Use a 25 minute timer.",
      "4. Keep a small distraction list instead of switching tasks.",
      "5. Stop and save your session so you can see your pattern later.",
    ].join("\n");
  }

  if (logs.length) {
    return `I could not reach Groq right now. From your saved sessions, you have logged ${logs.length} session(s), ${totalMinutes} total minute(s), and an average session length of ${averageMinutes} minute(s). Try making your next session one clear task for ${Math.max(15, averageMinutes || 25)} minutes.`;
  }

  return "I could not reach Groq right now. Try starting one 25 minute focus session with a specific task name, then ask me again for patterns after you have a few logs.";
}

function normalizeChatHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .slice(-8)
    .map(item => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: String(item.content || "").trim().slice(0, 1200),
    }))
    .filter(item => item.content);
}

function isRateLimited(ipAddress) {
  const now = Date.now();
  const key = ipAddress || "unknown";
  const current = chatRateLimits.get(key);

  if (!current || now - current.startedAt > rateLimitWindowMs) {
    chatRateLimits.set(key, { count: 1, startedAt: now });
    return false;
  }

  current.count += 1;
  return current.count > maxChatRequestsPerWindow;
}

app.get("/", (req, res) => {
  res.send("Focus Log AI backend is running. Use GET /focus, POST /focus, or POST /chat");
});

// Fetch saved focus sessions for the dashboard.
app.get("/focus", async (req, res) => {
  try {
    const db = await readDatabase();
    const focusLogs = [...db.focusLogs].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

    res.json({ focusLogs });
  } catch (error) {
    console.error("Read focus logs error:", error.message);
    res.status(500).json({ error: "Could not load focus logs." });
  }
});

// Save one completed focus session.
app.post("/focus", async (req, res) => {
  try {
    const { taskName, durationMinutes, startedAt, endedAt } = req.body;
    const cleanTaskName = String(taskName || "").trim();
    const cleanDuration = Number(durationMinutes);

    if (!cleanTaskName) {
      return res.status(400).json({ error: "Task name is required." });
    }

    if (!Number.isFinite(cleanDuration) || cleanDuration <= 0) {
      return res.status(400).json({ error: "Duration must be greater than 0 minutes." });
    }

    const db = await readDatabase();
    const focusLog = {
      id: randomUUID(),
      taskName: cleanTaskName,
      durationMinutes: Math.max(1, Math.round(cleanDuration)),
      startedAt: startedAt || new Date().toISOString(),
      endedAt: endedAt || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    db.focusLogs.push(focusLog);
    await writeDatabase(db);

    res.status(201).json({ focusLog });
  } catch (error) {
    console.error("Save focus log error:", error.message);
    res.status(500).json({ error: "Could not save focus log." });
  }
});

// Send the user's message and recent productivity context to Groq.
app.post("/chat", async (req, res) => {
  try {
    const { message, prompt, history } = req.body;
    const rawPrompt = message ?? prompt;

    if (rawPrompt === undefined || rawPrompt === null) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const cleanMessage = String(rawPrompt).trim();

    if (!cleanMessage) {
      return res.status(400).json({ error: "Prompt cannot be empty" });
    }

    if (cleanMessage.length > maxPromptLength) {
      return res.status(400).json({ error: "Prompt too long" });
    }

    if (isRateLimited(req.ip)) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }

    const db = await readDatabase();
    const focusSummary = buildFocusSummary(db.focusLogs);
    const chatHistory = normalizeChatHistory(history);

    if (!groq) {
      return res.status(503).json({ error: "AI service unavailable." });
    }

    const completion = await groq.chat.completions.create({
      model: groqModel,
      temperature: 0.6,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content: [
            "You are an encouraging productivity coach inside a Focus Log app.",
            "Give concise, actionable, user-friendly advice.",
            "When useful, refer to the user's focus log summary.",
            "Prefer practical next steps, study plans, focus techniques, and pattern insights.",
            `Focus log summary:\n${focusSummary}`,
          ].join("\n"),
        },
        ...chatHistory,
        { role: "user", content: cleanMessage },
      ],
    });

    res.json({
      reply: completion.choices[0]?.message?.content || "I could not generate a response this time.",
      source: "groq",
    });
  } catch (error) {
    console.error("Groq API error:", error.message);

    res.status(500).json({ error: "AI service unavailable." });
  }
});

app.listen(port, () => {
  console.log(`Focus Log backend running at http://localhost:${port}`);
});
