const API_BASE_URL = "http://localhost:3001";
const FOCUS_URL = `${API_BASE_URL}/focus`;
const CHAT_URL = `${API_BASE_URL}/chat`;
const DAILY_FOCUS_GOAL_MINUTES = 150;

let focusLogs = [];
let filteredRange = "all";
let chatMessages = [];
let activeSession = null;
let timerInterval = null;

const elements = {
  navTabs: document.querySelectorAll(".nav-tab"),
  views: document.querySelectorAll(".view"),
  jumpTabs: document.querySelectorAll("[data-jump-tab]"),
  openSessionButtons: document.querySelectorAll("[data-open-session], #openSessionModal"),
  sessionModal: document.getElementById("sessionModal"),
  focusForm: document.getElementById("focusForm"),
  closeSessionModal: document.getElementById("closeSessionModal"),
  taskNameInput: document.getElementById("taskName"),
  customDurationInput: document.getElementById("customDuration"),
  durationOptions: document.querySelectorAll("input[name='durationOption']"),
  timerDisplay: document.getElementById("timerDisplay"),
  timerCard: document.querySelector(".timer-card"),
  timerProgressBar: document.getElementById("timerProgressBar"),
  startButton: document.getElementById("startButton"),
  pauseButton: document.getElementById("pauseButton"),
  stopButton: document.getElementById("stopButton"),
  sessionStatus: document.getElementById("sessionStatus"),
  formStatus: document.getElementById("formStatus"),
  activeTaskTitle: document.getElementById("activeTaskTitle"),
  targetBadge: document.getElementById("targetBadge"),
  totalSessions: document.getElementById("totalSessions"),
  totalMinutes: document.getElementById("totalMinutes"),
  streakDays: document.getElementById("streakDays"),
  goalPercent: document.getElementById("goalPercent"),
  focusMiniGraph: document.getElementById("focusMiniGraph"),
  sessionList: document.getElementById("sessionList"),
  refreshLogsButton: document.getElementById("refreshLogsButton"),
  filterTabs: document.querySelectorAll(".filter-tab"),
  promptChips: document.querySelectorAll(".prompt-chip"),
  chatHistory: document.getElementById("chatHistory"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  sendButton: document.getElementById("sendButton"),
  chatStatus: document.getElementById("chatStatus"),
};

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

function formatMinutes(minutes) {
  return `${minutes} ${Number(minutes) === 1 ? "min" : "min"}`;
}

function formatFocusTime(minutes) {
  if (minutes >= 60) {
    const hours = minutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
  }

  return formatMinutes(minutes);
}

function isToday(value) {
  const date = new Date(value);
  const now = new Date();

  return date.toDateString() === now.toDateString();
}

function isThisWeek(value) {
  const date = new Date(value);
  const now = new Date();
  const startOfWeek = new Date(now);

  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  return date >= startOfWeek && date <= now;
}

function getDateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getStreakDays(logs) {
  const activeDays = new Set(logs.map(log => getDateKey(log.startedAt)));
  const cursor = new Date();
  let streak = 0;

  cursor.setHours(0, 0, 0, 0);

  while (activeDays.has(getDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function animateCounter(element, targetValue, formatter) {
  if (!element) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const startValue = Number(element.dataset.value || 0);
  const duration = 700;
  const startTime = performance.now();

  element.dataset.value = String(targetValue);

  if (reduceMotion) {
    element.textContent = formatter(targetValue);
    return;
  }

  function tick(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.round(startValue + (targetValue - startValue) * eased);

    element.textContent = formatter(currentValue);

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

function renderMiniGraph(logs) {
  if (!elements.focusMiniGraph) return;

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));

    return {
      key: getDateKey(date),
      minutes: 0,
    };
  });

  logs.forEach(log => {
    const day = days.find(item => item.key === getDateKey(log.startedAt));

    if (day) {
      day.minutes += Number(log.durationMinutes || 0);
    }
  });

  const maxMinutes = Math.max(1, ...days.map(day => day.minutes));
  elements.focusMiniGraph.innerHTML = "";

  days.forEach(day => {
    const bar = document.createElement("span");
    const height = Math.max(7, Math.round((day.minutes / maxMinutes) * 44));

    bar.style.height = `${height}px`;
    bar.title = `${day.minutes} min`;
    elements.focusMiniGraph.appendChild(bar);
  });
}

function initMouseTrailer() {
  const supportsFinePointer = window.matchMedia("(pointer: fine)").matches;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!supportsFinePointer || reduceMotion) {
    return;
  }

  const trailer = document.createElement("div");
  const tailDots = Array.from({ length: 7 }, (_, index) => {
    const dot = document.createElement("div");
    const scale = 1 - index * 0.08;
    const opacity = Math.max(0.06, 0.22 - index * 0.024);

    dot.className = "mouse-tail-dot";
    dot.setAttribute("aria-hidden", "true");
    dot.style.setProperty("--tail-opacity", opacity.toFixed(3));
    dot.dataset.scale = scale.toFixed(2);
    return dot;
  });
  const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const current = { ...target };
  const tail = tailDots.map(() => ({ ...target }));

  trailer.className = "mouse-trailer";
  trailer.setAttribute("aria-hidden", "true");
  document.body.appendChild(trailer);
  tailDots.forEach(dot => document.body.appendChild(dot));

  window.addEventListener("pointermove", event => {
    target.x = event.clientX;
    target.y = event.clientY;
    trailer.classList.add("is-visible");
    tailDots.forEach(dot => dot.classList.add("is-visible"));
  });

  window.addEventListener("pointerleave", () => {
    trailer.classList.remove("is-visible");
    tailDots.forEach(dot => dot.classList.remove("is-visible"));
  });

  function animateTrailer() {
    current.x += (target.x - current.x) * 0.12;
    current.y += (target.y - current.y) * 0.12;
    trailer.style.transform = `translate3d(${current.x - 90}px, ${current.y - 90}px, 0)`;

    tail.forEach((point, index) => {
      const anchor = index === 0 ? current : tail[index - 1];
      const dot = tailDots[index];
      const scale = dot.dataset.scale;

      point.x += (anchor.x - point.x) * (0.2 - index * 0.014);
      point.y += (anchor.y - point.y) * (0.2 - index * 0.014);
      dot.style.transform = `translate3d(${point.x - 16}px, ${point.y - 16}px, 0) scale(${scale})`;
    });

    requestAnimationFrame(animateTrailer);
  }

  animateTrailer();
}

function switchTab(tabName) {
  elements.views.forEach(view => {
    view.classList.toggle("active", view.dataset.view === tabName);
  });

  elements.navTabs.forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });
}

function openSessionModal() {
  elements.formStatus.textContent = "";

  if (typeof elements.sessionModal.showModal === "function") {
    elements.sessionModal.showModal();
  } else {
    elements.sessionModal.setAttribute("open", "");
  }

  setTimeout(() => elements.taskNameInput.focus(), 0);
}

function closeSessionModal() {
  elements.sessionModal.close();
}

function getSelectedDuration() {
  const selected = document.querySelector("input[name='durationOption']:checked")?.value || "25";

  if (selected === "custom") {
    return Number(elements.customDurationInput.value);
  }

  return Number(selected);
}

function updateCustomDurationState() {
  const isCustom = document.querySelector("input[name='durationOption']:checked")?.value === "custom";
  elements.customDurationInput.disabled = !isCustom;

  if (isCustom) {
    elements.customDurationInput.focus();
  }
}

function getElapsedSeconds() {
  if (!activeSession) return 0;

  const currentRun = activeSession.isPaused ? 0 : Date.now() - activeSession.startedAtMs;
  return Math.floor((activeSession.elapsedBeforePauseMs + currentRun) / 1000);
}

function updateTimer() {
  if (!activeSession) {
    elements.timerDisplay.textContent = "00:00";
    elements.timerProgressBar.style.width = "0%";
    return;
  }

  const elapsedSeconds = getElapsedSeconds();
  const targetSeconds = activeSession.targetMinutes * 60;
  const progress = Math.min(100, (elapsedSeconds / targetSeconds) * 100);

  elements.timerDisplay.textContent = formatTimer(elapsedSeconds);
  elements.timerProgressBar.style.width = `${progress}%`;

  if (elapsedSeconds >= targetSeconds) {
    elements.targetBadge.textContent = "Target reached";
  }
}

function startFocusSession(event) {
  event.preventDefault();

  const taskName = elements.taskNameInput.value.trim();
  const targetMinutes = getSelectedDuration();

  if (!taskName) {
    elements.formStatus.textContent = "Add a task name before starting.";
    elements.taskNameInput.focus();
    return;
  }

  if (!Number.isFinite(targetMinutes) || targetMinutes < 5) {
    elements.formStatus.textContent = "Choose a duration of at least 5 minutes.";
    elements.customDurationInput.focus();
    return;
  }

  activeSession = {
    taskName,
    targetMinutes,
    startedAt: new Date().toISOString(),
    startedAtMs: Date.now(),
    elapsedBeforePauseMs: 0,
    isPaused: false,
  };

  elements.activeTaskTitle.textContent = taskName;
  elements.targetBadge.textContent = `${targetMinutes} min target`;
  elements.pauseButton.disabled = false;
  elements.pauseButton.textContent = "Pause";
  elements.stopButton.disabled = false;
  elements.timerCard.classList.add("is-running");
  elements.sessionStatus.textContent = `Focusing on "${taskName}".`;
  elements.focusForm.reset();
  elements.customDurationInput.disabled = true;
  closeSessionModal();
  switchTab("dashboard");

  updateTimer();
  clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 1000);
}

function togglePauseSession() {
  if (!activeSession) return;

  if (activeSession.isPaused) {
    activeSession.startedAtMs = Date.now();
    activeSession.isPaused = false;
    elements.pauseButton.textContent = "Pause";
    elements.timerCard.classList.add("is-running");
    elements.sessionStatus.textContent = `Focusing on "${activeSession.taskName}".`;
    timerInterval = setInterval(updateTimer, 1000);
  } else {
    activeSession.elapsedBeforePauseMs += Date.now() - activeSession.startedAtMs;
    activeSession.isPaused = true;
    elements.pauseButton.textContent = "Resume";
    elements.timerCard.classList.remove("is-running");
    elements.sessionStatus.textContent = "Session paused.";
    clearInterval(timerInterval);
    timerInterval = null;
  }

  updateTimer();
}

async function stopFocusSession() {
  if (!activeSession) return;

  clearInterval(timerInterval);
  timerInterval = null;

  const endedAt = new Date().toISOString();
  const elapsedMinutes = Math.max(1, Math.round(getElapsedSeconds() / 60));
  const sessionToSave = { ...activeSession };

  elements.pauseButton.disabled = true;
  elements.stopButton.disabled = true;
  elements.sessionStatus.textContent = "Saving focus session...";

  try {
    await requestJson(FOCUS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskName: sessionToSave.taskName,
        durationMinutes: elapsedMinutes,
        startedAt: sessionToSave.startedAt,
        endedAt,
      }),
    });

    activeSession = null;
    elements.activeTaskTitle.textContent = "Ready when you are";
    elements.targetBadge.textContent = "No target";
    elements.timerCard.classList.remove("is-running");
    elements.sessionStatus.textContent = "Session saved.";
    updateTimer();
    await loadFocusLogs();
  } catch (error) {
    elements.pauseButton.disabled = false;
    elements.stopButton.disabled = false;
    elements.sessionStatus.textContent = `${error.message} Make sure the backend is running on http://localhost:3001.`;
  }
}

function setSessionListMessage(message) {
  elements.sessionList.innerHTML = "";
  const emptyState = document.createElement("p");
  emptyState.className = "empty-state";
  emptyState.textContent = message;
  elements.sessionList.appendChild(emptyState);
}

function getFilteredLogs() {
  if (filteredRange === "today") {
    return focusLogs.filter(log => isToday(log.startedAt));
  }

  if (filteredRange === "week") {
    return focusLogs.filter(log => isThisWeek(log.startedAt));
  }

  return focusLogs;
}

function renderFocusLogs() {
  const visibleLogs = getFilteredLogs();

  if (!visibleLogs.length) {
    const label = filteredRange === "all" ? "No sessions yet. Start your first focus block." : "No sessions found for this filter.";
    setSessionListMessage(label);
    return;
  }

  elements.sessionList.innerHTML = "";

  visibleLogs.forEach(log => {
    const item = document.createElement("article");
    const details = document.createElement("div");
    const title = document.createElement("strong");
    const date = document.createElement("span");
    const duration = document.createElement("span");
    const badge = document.createElement("span");

    item.className = "session-item";
    title.textContent = log.taskName;
    date.textContent = formatDateTime(log.startedAt);
    duration.textContent = formatMinutes(log.durationMinutes);
    badge.className = "soft-pill";
    badge.textContent = isToday(log.startedAt) ? "Today" : "Saved";

    details.append(title, date);
    item.append(details, duration, badge);
    elements.sessionList.appendChild(item);
  });
}

function updateStats() {
  const totalSessions = focusLogs.length;
  const totalMinutes = focusLogs.reduce((sum, log) => sum + Number(log.durationMinutes || 0), 0);
  const todayLogs = focusLogs.filter(log => isToday(log.startedAt));
  const todayMinutes = todayLogs.reduce((sum, log) => sum + Number(log.durationMinutes || 0), 0);
  const averageMinutes = totalSessions ? Math.round(totalMinutes / totalSessions) : 0;
  const streakDays = getStreakDays(focusLogs);
  const goalPercent = Math.min(100, Math.round((todayMinutes / DAILY_FOCUS_GOAL_MINUTES) * 100));
  const longestSession = focusLogs.reduce((best, log) => {
    return Number(log.durationMinutes) > Number(best?.durationMinutes || 0) ? log : best;
  }, null);

  animateCounter(elements.totalSessions, totalSessions, value => String(value));
  animateCounter(elements.totalMinutes, totalMinutes, formatFocusTime);
  animateCounter(elements.streakDays, streakDays, value => `${value} ${value === 1 ? "Day" : "Days"}`);
  animateCounter(elements.goalPercent, goalPercent, value => `${value}%`);
  renderMiniGraph(focusLogs);

  document.getElementById("todayMinutes").textContent = formatMinutes(todayMinutes);
  document.getElementById("todaySessions").textContent = `${todayLogs.length} ${todayLogs.length === 1 ? "session" : "sessions"} logged`;

  if (!totalSessions) {
    document.getElementById("patternSummary").textContent = "Log a session to reveal your productivity patterns.";
  } else if (averageMinutes < 15) {
    document.getElementById("patternSummary").textContent = "Your sessions are short. Try one clear 20 minute block before switching tasks.";
  } else if (averageMinutes > 60) {
    document.getElementById("patternSummary").textContent = "You sustain long sessions. Schedule real breaks so the rhythm stays healthy.";
  } else {
    document.getElementById("patternSummary").textContent = `Strong rhythm. Your longest recent session was "${longestSession.taskName}" for ${longestSession.durationMinutes} minutes.`;
  }
}

async function loadFocusLogs() {
  setSessionListMessage("Loading focus logs...");

  try {
    const data = await requestJson(FOCUS_URL);
    focusLogs = data.focusLogs || [];
    renderFocusLogs();
    updateStats();
  } catch (error) {
    setSessionListMessage(`${error.message} Start the backend on http://localhost:3001.`);
  }
}

function logout() {
  localStorage.removeItem("user");
  window.location.href = "login.html";
}

function addChatMessage(sender, text) {
  const message = document.createElement("div");
  const author = document.createElement("span");
  const content = document.createElement("p");

  message.className = `chat-message ${sender}`;
  author.className = "message-author";
  author.textContent = sender === "user" ? "You" : "AI";
  content.textContent = text;

  message.append(author, content);
  elements.chatHistory.appendChild(message);
  elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;

  return message;
}

function addTypingIndicator() {
  const message = document.createElement("div");
  const author = document.createElement("span");
  const dots = document.createElement("div");

  message.className = "chat-message ai";
  author.className = "message-author";
  author.textContent = "AI";
  dots.className = "typing-dots";
  dots.innerHTML = "<span></span><span></span><span></span>";

  message.append(author, dots);
  elements.chatHistory.appendChild(message);
  elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;

  return message;
}

function rememberChatMessage(role, content) {
  chatMessages.push({ role, content });
  chatMessages = chatMessages.slice(-10);
}

function setChatLoading(isLoading) {
  elements.sendButton.disabled = isLoading;
  elements.sendButton.textContent = isLoading ? "Sending" : "Send";
  elements.chatStatus.textContent = isLoading ? "AI is thinking..." : "";
}

async function sendMessage(messageOverride) {
  const userMessage = (messageOverride || elements.chatInput.value).trim();

  if (!userMessage) {
    elements.chatStatus.textContent = "Please type a message first.";
    elements.chatInput.focus();
    return;
  }

  addChatMessage("user", userMessage);
  const recentHistory = chatMessages.slice(-8);
  rememberChatMessage("user", userMessage);
  elements.chatInput.value = "";
  setChatLoading(true);
  const typingMessage = addTypingIndicator();

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
    elements.chatInput.focus();
  }
}

elements.navTabs.forEach(tab => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

elements.jumpTabs.forEach(button => {
  button.addEventListener("click", () => switchTab(button.dataset.jumpTab));
});

elements.openSessionButtons.forEach(button => {
  button.addEventListener("click", openSessionModal);
});

elements.closeSessionModal.addEventListener("click", closeSessionModal);
elements.focusForm.addEventListener("submit", startFocusSession);
elements.durationOptions.forEach(option => {
  option.addEventListener("change", updateCustomDurationState);
});

elements.pauseButton.addEventListener("click", togglePauseSession);
elements.stopButton.addEventListener("click", stopFocusSession);
elements.refreshLogsButton.addEventListener("click", loadFocusLogs);

elements.filterTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    filteredRange = tab.dataset.filter;
    elements.filterTabs.forEach(item => item.classList.toggle("active", item === tab));
    renderFocusLogs();
  });
});

elements.promptChips.forEach(chip => {
  chip.addEventListener("click", () => {
    switchTab("assistant");
    sendMessage(chip.textContent);
  });
});

elements.chatForm.addEventListener("submit", event => {
  event.preventDefault();
  sendMessage();
});

initMouseTrailer();
loadFocusLogs();
