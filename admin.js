document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const isAdmin = localStorage.getItem("isAdmin") === "true";
  if (!token) {
    window.location.href = "Login.html";
    return;
  }
  if (!isAdmin) {
    alert("Admin access required.");
    window.location.href = "chat.html";
    return;
  }

  const API_BASE =
    ["localhost", "127.0.0.1", ""].includes(window.location.hostname) ||
    window.location.protocol === "file:"
      ? "http://localhost:4000"
      : "https://studentgpt-4zbc.onrender.com";
  const DASHBOARD_API = `${API_BASE}/admin/summary`;

  const statusEl = document.getElementById("status");
  const refreshBtn = document.getElementById("refreshBtn");

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  function renderList(containerId, items, mapper) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!items.length) {
      container.innerHTML = '<div class="empty">No data available yet.</div>';
      return;
    }
    container.innerHTML = items.map(mapper).join("");
  }

  async function loadDashboard() {
    statusEl.textContent = "Loading dashboard...";
    try {
      const res = await fetch(DASHBOARD_API, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to load dashboard (${res.status})`);
      }

      const data = await res.json();
      const stats = data.stats || {};
      document.getElementById("totalUsers").textContent = stats.totalUsers ?? 0;
      document.getElementById("totalAdmins").textContent = stats.totalAdmins ?? 0;
      document.getElementById("totalChats").textContent = stats.totalChats ?? 0;
      document.getElementById("totalMessages").textContent = stats.totalMessages ?? 0;

      renderList("recentUsers", data.recentUsers || [], (user) => `
        <div class="item">
          <strong>${user.name || "Unnamed user"}</strong>
          <small>${user.email || "No email"}</small>
          <p>${user.isAdmin ? "Admin user" : "Standard user"} · Joined ${formatDate(user.createdAt)}</p>
        </div>
      `);

      renderList("recentChats", data.recentChats || [], (chat) => `
        <div class="item">
          <strong>${chat.userName || "Unknown user"}</strong>
          <small>${chat.userEmail || "No email"}</small>
          <p>${chat.messageCount || 0} messages · ${formatDate(chat.updatedAt)}</p>
          <p>${chat.lastMessage || "No preview available."}</p>
        </div>
      `);

      renderList("recentContacts", data.recentContacts || [], (contact) => `
        <div class="item">
          <strong>${contact.name || "Unknown sender"}</strong>
          <small>${contact.email || "No email"}</small>
          <p>${formatDate(contact.createdAt)}</p>
          <p>${contact.message || "No message content."}</p>
        </div>
      `);

      statusEl.textContent = "Dashboard updated successfully.";
    } catch (err) {
      console.error("Admin dashboard error:", err);
      statusEl.textContent = `Failed to load dashboard: ${err.message || "Unknown error"}`;
    }
  }

  refreshBtn?.addEventListener("click", loadDashboard);
  loadDashboard();
});
