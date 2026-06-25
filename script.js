const API_BASE_URL = "http://localhost:3001";
const FOCUS_URL = `${API_BASE_URL}/focus`;
const CHAT_URL = `${API_BASE_URL}/chat`;

let focusLogs = [];
let chatMessages = [];
let activeSession = null;
let timerInterval = null;

// Cached elements keep the rest of the code easy to read.
const taskNameInput = document.getElementById("taskName");
const timerDisplay = document.getElementById("timerDisplay");
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const sessionStatus = document.getElementById("sessionStatus");
const focusLogsTable = document.getElementById("focusLogsTable");
const refreshLogsButton = document.getElementById("refreshLogsButton");

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();
    const preview = text.trim().slice(0, 80);

    throw new Error(
      `Backend returned ${response.status || "a non-JSON response"} instead of JSON. Restart the Focus Log backend on port 3001. Response starts with: ${preview}`
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "The backend request failed.");
  }

  return data;
}

function formatTimer(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function updateTimer() {
  if (!activeSession) {
    timerDisplay.textContent = "00:00";
    return;
  }

  const elapsedSeconds = Math.floor((Date.now() - activeSession.startedAtMs) / 1000);
  timerDisplay.textContent = formatTimer(elapsedSeconds);
}

function setFocusLogsMessage(message) {
  focusLogsTable.innerHTML = "";

  const row = document.createElement("tr");
  const cell = document.createElement("td");

  cell.colSpan = 3;
  cell.textContent = message;
  row.appendChild(cell);
  focusLogsTable.appendChild(row);
}

// Start timing locally. The session is saved only when the user stops it.
function startFocusSession() {
  const taskName = taskNameInput.value.trim();

  if (!taskName) {
    sessionStatus.textContent = "Add a task name before starting.";
    taskNameInput.focus();
    return;
  }

  activeSession = {
    taskName,
    startedAt: new Date().toISOString(),
    startedAtMs: Date.now(),
  };

  startButton.disabled = true;
  stopButton.disabled = false;
  taskNameInput.disabled = true;
  sessionStatus.textContent = `Focusing on "${taskName}".`;

  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

// Persist the completed session through the Express backend.
async function stopFocusSession() {
  if (!activeSession) return;

  clearInterval(timerInterval);
  timerInterval = null;

  const endedAt = new Date().toISOString();
  const elapsedMinutes = Math.max(1, Math.round((Date.now() - activeSession.startedAtMs) / 60000));

  stopButton.disabled = true;
  sessionStatus.textContent = "Saving focus session...";

  try {
    await requestJson(FOCUS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskName: activeSession.taskName,
        durationMinutes: elapsedMinutes,
        startedAt: activeSession.startedAt,
        endedAt,
      }),
    });

    activeSession = null;
    taskNameInput.value = "";
    taskNameInput.disabled = false;
    startButton.disabled = false;
    sessionStatus.textContent = "Session saved.";
    updateTimer();
    await loadFocusLogs();
  } catch (error) {
    stopButton.disabled = false;
    sessionStatus.textContent = `${error.message} Make sure the backend is running on http://localhost:3001.`;
  }
}

function renderFocusLogs() {
  if (!focusLogs.length) {
    setFocusLogsMessage("No sessions yet. Start your first focus block.");
    return;
  }

  focusLogsTable.innerHTML = "";

  focusLogs.forEach(log => {
    const row = document.createElement("tr");
    const taskCell = document.createElement("td");
    const durationCell = document.createElement("td");
    const dateCell = document.createElement("td");

    taskCell.textContent = log.taskName;
    durationCell.textContent = `${log.durationMinutes} min`;
    dateCell.textContent = formatDateTime(log.startedAt);

    row.append(taskCell, durationCell, dateCell);
    focusLogsTable.appendChild(row);
  });
}

// Simple pattern feedback helps users review productive and unproductive trends.
function updateStats() {
  const totalSessions = focusLogs.length;
  const totalMinutes = focusLogs.reduce((sum, log) => sum + Number(log.durationMinutes), 0);
  const averageMinutes = totalSessions ? Math.round(totalMinutes / totalSessions) : 0;
  const longestSession = focusLogs.reduce((best, log) => {
    return Number(log.durationMinutes) > Number(best?.durationMinutes || 0) ? log : best;
  }, null);

  document.getElementById("totalSessions").textContent = totalSessions;
  document.getElementById("totalMinutes").textContent = totalMinutes;
  document.getElementById("averageMinutes").textContent = averageMinutes;

  if (!totalSessions) {
    document.getElementById("patternSummary").textContent = "Log a session to reveal your productivity patterns.";
    return;
  }

  if (averageMinutes < 15) {
    document.getElementById("patternSummary").textContent = "Your sessions are short. Try a 20 minute block with one clear task.";
  } else if (averageMinutes > 60) {
    document.getElementById("patternSummary").textContent = "You sustain long sessions. Add planned breaks to protect your energy.";
  } else {
    document.getElementById("patternSummary").textContent = `Strong rhythm. Your longest recent session was "${longestSession.taskName}" for ${longestSession.durationMinutes} minutes.`;
  }
}

async function loadFocusLogs() {
  setFocusLogsMessage("Loading focus logs...");

  try {
    const data = await requestJson(FOCUS_URL);
    focusLogs = data.focusLogs || [];
    renderFocusLogs();
    updateStats();
  } catch (error) {
    setFocusLogsMessage(`${error.message} Start the backend on http://localhost:3001.`);
  }
}

function logout() {
  localStorage.removeItem("user");
  window.location.href = "login.html";
}

// Chat messages are rendered safely with textContent, never raw HTML.
function addChatMessage(sender, text) {
  const chatHistory = document.getElementById("chatHistory");
  const message = document.createElement("div");

  message.className = `chat-message ${sender}`;
  message.textContent = `${sender === "user" ? "You" : "AI"}: ${text}`;

  chatHistory.appendChild(message);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  return message;
}

function rememberChatMessage(role, content) {
  chatMessages.push({ role, content });
  chatMessages = chatMessages.slice(-10);
}

function setChatLoading(isLoading) {
  const sendButton = document.getElementById("sendButton");
  const chatStatus = document.getElementById("chatStatus");

  sendButton.disabled = isLoading;
  sendButton.textContent = isLoading ? "Sending..." : "Send";
  chatStatus.textContent = isLoading ? "Waiting for AI reply..." : "";
}

async function sendMessage() {
  const input = document.getElementById("chatInput");
  const userMessage = input.value.trim();

  if (!userMessage) {
    document.getElementById("chatStatus").textContent = "Please type a message first.";
    input.focus();
    return;
  }

  addChatMessage("user", userMessage);
  const recentHistory = chatMessages.slice(-8);
  rememberChatMessage("user", userMessage);
  input.value = "";
  setChatLoading(true);
  const typingMessage = addChatMessage("ai", "AI is typing...");

  try {
    const data = await requestJson(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMessage,
        history: recentHistory,
      }),
    });

    const reply = data.reply || "I did not receive a reply.";
    typingMessage.remove();
    addChatMessage("ai", reply);
    rememberChatMessage("assistant", reply);
  } catch (error) {
    typingMessage.remove();
    addChatMessage("ai", `Chat request failed: ${error.message}`);
  } finally {
    setChatLoading(false);
    input.focus();
  }
}

startButton.addEventListener("click", startFocusSession);
stopButton.addEventListener("click", stopFocusSession);
refreshLogsButton.addEventListener("click", loadFocusLogs);

document.getElementById("chatForm").addEventListener("submit", event => {
  event.preventDefault();
  sendMessage();
});

loadFocusLogs();
