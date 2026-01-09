import { Hono } from "hono";
import { html, raw } from "hono/html";
import type { Env } from "../types";

export const dashboardRouter = new Hono<{ Bindings: Env }>();

const styles = () => raw`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    background: #0a0a0b;
    color: #e4e4e7;
    min-height: 100vh;
  }

  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #27272a;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 600;
    color: #fafafa;
  }

  h1 span {
    color: #f97316;
  }

  .api-key-form {
    display: flex;
    gap: 0.5rem;
  }

  input[type="password"],
  input[type="text"] {
    padding: 0.5rem 0.75rem;
    border: 1px solid #3f3f46;
    border-radius: 0.375rem;
    background: #18181b;
    color: #e4e4e7;
    font-size: 0.875rem;
    width: 280px;
  }

  input:focus {
    outline: none;
    border-color: #f97316;
  }

  button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    background: #f97316;
    color: #0a0a0b;
    font-weight: 500;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  button:hover {
    background: #ea580c;
  }

  button:disabled {
    background: #52525b;
    cursor: not-allowed;
  }

  button.secondary {
    background: #27272a;
    color: #e4e4e7;
  }

  button.secondary:hover {
    background: #3f3f46;
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid #27272a;
  }

  .tab {
    padding: 0.75rem 1rem;
    border: none;
    background: none;
    color: #a1a1aa;
    font-size: 0.875rem;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }

  .tab:hover {
    color: #e4e4e7;
  }

  .tab.active {
    color: #f97316;
    border-bottom-color: #f97316;
  }

  .panel {
    display: none;
  }

  .panel.active {
    display: block;
  }

  .card {
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 0.5rem;
    padding: 1.5rem;
    margin-bottom: 1rem;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .card-title {
    font-size: 1rem;
    font-weight: 500;
    color: #fafafa;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .stat-card {
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 0.5rem;
    padding: 1rem;
  }

  .stat-label {
    font-size: 0.75rem;
    color: #71717a;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.25rem;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 600;
    color: #fafafa;
  }

  .stat-value.cost {
    color: #22c55e;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid #27272a;
  }

  th {
    font-size: 0.75rem;
    font-weight: 500;
    color: #71717a;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  td {
    font-size: 0.875rem;
  }

  tr:hover {
    background: #1f1f23;
  }

  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .status-pending {
    background: #422006;
    color: #fbbf24;
  }

  .status-running {
    background: #172554;
    color: #60a5fa;
  }

  .status-completed {
    background: #14532d;
    color: #4ade80;
  }

  .status-failed {
    background: #450a0a;
    color: #f87171;
  }

  .status-cancelled {
    background: #27272a;
    color: #a1a1aa;
  }

  .truncate {
    max-width: 250px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mono {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.8125rem;
  }

  .empty-state {
    text-align: center;
    padding: 3rem;
    color: #71717a;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: #71717a;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid #3f3f46;
    border-top-color: #f97316;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-right: 0.5rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-message {
    background: #450a0a;
    border: 1px solid #7f1d1d;
    color: #fca5a5;
    padding: 1rem;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }

  .task-actions {
    display: flex;
    gap: 0.25rem;
  }

  .task-actions button {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 0.5rem;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    overflow: auto;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid #27272a;
  }

  .modal-body {
    padding: 1rem;
  }

  .modal-close {
    background: none;
    border: none;
    color: #71717a;
    cursor: pointer;
    font-size: 1.25rem;
  }

  .log-viewer {
    background: #0a0a0b;
    border: 1px solid #27272a;
    border-radius: 0.375rem;
    padding: 1rem;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.8125rem;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 400px;
    overflow: auto;
  }

  .refresh-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .hidden {
    display: none !important;
  }

  .date-filter {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .date-filter label {
    font-size: 0.875rem;
    color: #a1a1aa;
  }

  input[type="date"] {
    padding: 0.375rem 0.5rem;
    border: 1px solid #3f3f46;
    border-radius: 0.375rem;
    background: #18181b;
    color: #e4e4e7;
    font-size: 0.875rem;
  }

  .usage-chart {
    height: 200px;
    display: flex;
    align-items: flex-end;
    gap: 4px;
    padding: 1rem 0;
  }

  .bar {
    flex: 1;
    background: #f97316;
    border-radius: 2px 2px 0 0;
    min-height: 4px;
    position: relative;
  }

  .bar:hover {
    background: #ea580c;
  }

  .bar-tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: #27272a;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    white-space: nowrap;
    display: none;
  }

  .bar:hover .bar-tooltip {
    display: block;
  }
`;

const script = () => raw`
  let apiKey = localStorage.getItem("helios_api_key") || "";
  const API_BASE = window.location.origin;

  if (apiKey) {
    document.getElementById("apiKeyInput").value = apiKey;
    connectWithKey();
  }

  function setApiKey() {
    apiKey = document.getElementById("apiKeyInput").value.trim();
    if (!apiKey) {
      showError("Please enter an API key");
      return;
    }
    localStorage.setItem("helios_api_key", apiKey);
    connectWithKey();
  }

  async function connectWithKey() {
    hideError();
    try {
      const res = await fetch(API_BASE + "/v1/usage/current", {
        headers: { Authorization: "Bearer " + apiKey },
      });

      if (res.status === 401) {
        showError("Invalid API key");
        return;
      }

      if (!res.ok) {
        showError("Failed to connect: " + res.statusText);
        return;
      }

      document.getElementById("mainContent").classList.remove("hidden");
      loadTasks();
      loadUsage();
    } catch (err) {
      showError("Failed to connect: " + err.message);
    }
  }

  function showError(msg) {
    const el = document.getElementById("errorMessage");
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function hideError() {
    document.getElementById("errorMessage").classList.add("hidden");
  }

  function switchTab(tab) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    document.querySelector('.tab[onclick*="' + tab + '"]').classList.add("active");
    document.getElementById(tab + "Panel").classList.add("active");
    if (tab === "usage") loadUsage();
  }

  async function loadTasks() {
    document.getElementById("tasksList").innerHTML =
      '<div class="empty-state">Enter a task ID below to view its details, or create tasks via the API.</div>' +
      '<div style="margin-top:1rem;display:flex;gap:0.5rem">' +
      '<input type="text" id="taskIdInput" placeholder="Enter task ID" style="flex:1" />' +
      '<button onclick="viewTaskById()">View Task</button>' +
      "</div>";

    try {
      const res = await fetch(API_BASE + "/v1/usage/current", {
        headers: { Authorization: "Bearer " + apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        document.getElementById("totalTasks").textContent = data.totals?.tasksCreated || 0;
        document.getElementById("runningTasks").textContent = "-";
        document.getElementById("completedTasks").textContent = data.totals?.tasksCompleted || 0;
        document.getElementById("failedTasks").textContent = data.totals?.tasksFailed || 0;
      }
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }

  async function refreshTasks() {
    document.getElementById("refreshSpinner").classList.remove("hidden");
    await loadTasks();
    document.getElementById("refreshSpinner").classList.add("hidden");
  }

  async function viewTaskById() {
    const taskId = document.getElementById("taskIdInput").value.trim();
    if (!taskId) return;
    await viewTask(taskId);
  }

  async function viewTask(taskId) {
    try {
      const res = await fetch(API_BASE + "/v1/tasks/" + taskId, {
        headers: { Authorization: "Bearer " + apiKey },
      });

      if (!res.ok) {
        showError("Task not found");
        return;
      }

      const task = await res.json();
      showTaskModal(task);
    } catch (err) {
      showError("Failed to load task: " + err.message);
    }
  }

  function showTaskModal(task) {
    document.getElementById("modalTitle").textContent = "Task: " + task.id.slice(0, 8) + "...";

    const statusClass = "status-" + task.status;
    let html =
      '<div style="margin-bottom:1rem">' +
      '<span class="status-badge ' + statusClass + '">' + task.status + "</span>" +
      "</div>" +
      '<div style="margin-bottom:1rem">' +
      '<div class="stat-label">Prompt</div>' +
      '<div style="background:#0a0a0b;padding:0.5rem;border-radius:0.25rem;margin-top:0.25rem">' +
      escapeHtml(task.prompt) +
      "</div>" +
      "</div>" +
      '<div style="margin-bottom:1rem">' +
      '<div class="stat-label">Repository</div>' +
      '<div class="mono">' + escapeHtml(task.repository?.url || "N/A") + "</div>" +
      "</div>" +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">' +
      "<div>" +
      '<div class="stat-label">Created</div>' +
      '<div class="mono">' + formatDate(task.createdAt) + "</div>" +
      "</div>" +
      "<div>" +
      '<div class="stat-label">Completed</div>' +
      '<div class="mono">' + (task.completedAt ? formatDate(task.completedAt) : "-") + "</div>" +
      "</div>" +
      "</div>";

    if (task.result) {
      html +=
        '<div style="margin-bottom:1rem">' +
        '<div class="stat-label">Result</div>' +
        '<div style="background:#0a0a0b;padding:0.5rem;border-radius:0.25rem;margin-top:0.25rem">' +
        escapeHtml(task.result.summary || "No summary") +
        "</div>" +
        "</div>";
    }

    if (task.error) {
      html +=
        '<div style="margin-bottom:1rem">' +
        '<div class="stat-label" style="color:#f87171">Error</div>' +
        '<div style="background:#450a0a;padding:0.5rem;border-radius:0.25rem;margin-top:0.25rem;color:#fca5a5">' +
        escapeHtml(task.error) +
        "</div>" +
        "</div>";
    }

    html +=
      '<div style="display:flex;gap:0.5rem">' +
      '<button class="secondary" onclick="viewLogs(\\'' + task.id + "\\')\">" +
      "View Logs</button>" +
      '<button class="secondary" onclick="viewDiff(\\'' + task.id + "\\')\">" +
      "View Diff</button>";

    if (task.status === "running" || task.status === "pending") {
      html += '<button onclick="cancelTask(\\'' + task.id + "\\')\">" + "Cancel</button>";
    }

    html += "</div>";

    document.getElementById("modalBody").innerHTML = html;
    document.getElementById("taskModal").classList.remove("hidden");
  }

  async function viewLogs(taskId) {
    try {
      const res = await fetch(API_BASE + "/v1/tasks/" + taskId + "/logs", {
        headers: { Authorization: "Bearer " + apiKey },
      });

      if (!res.ok) {
        alert("Logs not available");
        return;
      }

      const logs = await res.text();
      document.getElementById("modalTitle").textContent = "Logs: " + taskId.slice(0, 8) + "...";
      document.getElementById("modalBody").innerHTML =
        '<div class="log-viewer">' + escapeHtml(logs || "No logs available") + "</div>" +
        '<button style="margin-top:1rem" onclick="viewTask(\\'' + taskId + "\\')\">" +
        "Back to Task</button>";
    } catch (err) {
      alert("Failed to load logs: " + err.message);
    }
  }

  async function viewDiff(taskId) {
    try {
      const res = await fetch(API_BASE + "/v1/tasks/" + taskId + "/diff", {
        headers: { Authorization: "Bearer " + apiKey },
      });

      if (!res.ok) {
        alert("Diff not available");
        return;
      }

      const diff = await res.text();
      document.getElementById("modalTitle").textContent = "Diff: " + taskId.slice(0, 8) + "...";
      document.getElementById("modalBody").innerHTML =
        '<div class="log-viewer">' + escapeHtml(diff || "No changes") + "</div>" +
        '<button style="margin-top:1rem" onclick="viewTask(\\'' + taskId + "\\')\">" +
        "Back to Task</button>";
    } catch (err) {
      alert("Failed to load diff: " + err.message);
    }
  }

  async function cancelTask(taskId) {
    if (!confirm("Cancel this task?")) return;

    try {
      const res = await fetch(API_BASE + "/v1/tasks/" + taskId + "/cancel", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey },
      });

      if (res.ok) {
        alert("Task cancelled");
        closeTaskModal();
        refreshTasks();
      } else {
        const data = await res.json();
        alert("Failed to cancel: " + (data.error || res.statusText));
      }
    } catch (err) {
      alert("Failed to cancel: " + err.message);
    }
  }

  function closeTaskModal() {
    document.getElementById("taskModal").classList.add("hidden");
  }

  function closeModal(event) {
    if (event.target.classList.contains("modal-overlay")) {
      closeTaskModal();
    }
  }

  async function loadUsage() {
    const startInput = document.getElementById("usageStartDate");
    const endInput = document.getElementById("usageEndDate");

    if (!startInput.value) {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      startInput.value = start.toISOString().split("T")[0];
    }
    if (!endInput.value) {
      endInput.value = new Date().toISOString().split("T")[0];
    }

    try {
      const url = API_BASE + "/v1/usage?start=" + startInput.value + "&end=" + endInput.value;
      const res = await fetch(url, {
        headers: { Authorization: "Bearer " + apiKey },
      });

      if (!res.ok) {
        console.error("Failed to load usage");
        return;
      }

      const data = await res.json();

      document.getElementById("totalRequests").textContent = formatNumber(data.totals?.requests || 0);
      document.getElementById("inputTokens").textContent = formatNumber(data.totals?.inputTokens || 0);
      document.getElementById("outputTokens").textContent = formatNumber(data.totals?.outputTokens || 0);
      document.getElementById("estimatedCost").textContent = "$" + (data.totals?.estimatedCost || 0).toFixed(4);

      renderUsageChart(data.daily || []);
    } catch (err) {
      console.error("Failed to load usage:", err);
    }
  }

  function renderUsageChart(daily) {
    const container = document.getElementById("usageChart");

    if (!daily || daily.length === 0) {
      container.innerHTML = '<div class="empty-state">No usage data for this period</div>';
      return;
    }

    const maxTokens = Math.max(...daily.map((d) => (d.inputTokens || 0) + (d.outputTokens || 0)));

    container.innerHTML = daily
      .map((d) => {
        const total = (d.inputTokens || 0) + (d.outputTokens || 0);
        const height = maxTokens > 0 ? (total / maxTokens) * 100 : 0;
        const date = d.date || "Unknown";
        return (
          '<div class="bar" style="height:' +
          Math.max(height, 2) +
          '%">' +
          '<div class="bar-tooltip">' +
          date +
          ": " +
          formatNumber(total) +
          " tokens</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toString();
  }

  function formatDate(dateStr) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString();
  }

  function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
`;

const dashboardHtml = () => html`
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Helios Dashboard</title>
      <style>
        ${styles()}
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <h1><span>Helios</span> Dashboard</h1>
          <div class="api-key-form" id="apiKeyForm">
            <input
              type="password"
              id="apiKeyInput"
              placeholder="Enter your API key"
            />
            <button onclick="setApiKey()">Connect</button>
          </div>
        </header>

        <div id="errorMessage" class="error-message hidden"></div>

        <div id="mainContent" class="hidden">
          <div class="tabs">
            <button class="tab active" onclick="switchTab('tasks')">
              Tasks
            </button>
            <button class="tab" onclick="switchTab('usage')">Usage</button>
          </div>

          <div id="tasksPanel" class="panel active">
            <div class="stats-grid" id="taskStats">
              <div class="stat-card">
                <div class="stat-label">Total Tasks</div>
                <div class="stat-value" id="totalTasks">-</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Running</div>
                <div class="stat-value" id="runningTasks">-</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Completed</div>
                <div class="stat-value" id="completedTasks">-</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Failed</div>
                <div class="stat-value" id="failedTasks">-</div>
              </div>
            </div>

            <div class="card">
              <div class="card-header">
                <div class="card-title">Recent Tasks</div>
                <button class="secondary refresh-btn" onclick="refreshTasks()">
                  <span id="refreshSpinner" class="spinner hidden"></span>
                  Refresh
                </button>
              </div>
              <div id="tasksList">
                <div class="loading">
                  <div class="spinner"></div>
                  Loading tasks...
                </div>
              </div>
            </div>
          </div>

          <div id="usagePanel" class="panel">
            <div class="card">
              <div class="card-header">
                <div class="card-title">Usage Summary</div>
                <div class="date-filter">
                  <label>From:</label>
                  <input
                    type="date"
                    id="usageStartDate"
                    onchange="loadUsage()"
                  />
                  <label>To:</label>
                  <input type="date" id="usageEndDate" onchange="loadUsage()" />
                </div>
              </div>

              <div class="stats-grid">
                <div class="stat-card">
                  <div class="stat-label">Total Requests</div>
                  <div class="stat-value" id="totalRequests">-</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Input Tokens</div>
                  <div class="stat-value" id="inputTokens">-</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Output Tokens</div>
                  <div class="stat-value" id="outputTokens">-</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Estimated Cost</div>
                  <div class="stat-value cost" id="estimatedCost">-</div>
                </div>
              </div>

              <div class="card-title" style="margin: 1rem 0 0.5rem">
                Daily Usage
              </div>
              <div class="usage-chart" id="usageChart">
                <div class="empty-state">No usage data available</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        id="taskModal"
        class="modal-overlay hidden"
        onclick="closeModal(event)"
      >
        <div class="modal" onclick="event.stopPropagation()">
          <div class="modal-header">
            <span class="card-title" id="modalTitle">Task Details</span>
            <button class="modal-close" onclick="closeTaskModal()">
              &times;
            </button>
          </div>
          <div class="modal-body" id="modalBody"></div>
        </div>
      </div>

      <script>
        ${script()};
      </script>
    </body>
  </html>
`;

dashboardRouter.get("/", (c) => {
  return c.html(dashboardHtml());
});
