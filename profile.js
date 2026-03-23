document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "Login.html";
    return;
  }

  const API_BASE =
    ["localhost", "127.0.0.1", ""].includes(window.location.hostname) ||
    window.location.protocol === "file:"
      ? "http://localhost:4000"
      : "https://studentgpt-4zbc.onrender.com";
  const PROFILE_API = `${API_BASE}/me`;

  const statusEl = document.getElementById("status");
  const profileForm = document.getElementById("profileForm");
  const passwordForm = document.getElementById("passwordForm");
  const logoutBtn = document.getElementById("logoutBtn");
  const nameInput = document.getElementById("profileName");
  const emailInput = document.getElementById("profileEmail");
  const phoneInput = document.getElementById("profilePhone");
  const avatarInput = document.getElementById("profileAvatar");
  const avatarPreview = document.getElementById("avatarPreview");
  const currentPasswordInput = document.getElementById("currentPassword");
  const newPasswordInput = document.getElementById("newPassword");

  let avatarData = "";

  function setStatus(message) {
    statusEl.textContent = message;
  }

  async function requestProfile(options = {}) {
    const res = await fetch(PROFILE_API, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.message || `Request failed (${res.status})`);
    }
    return data;
  }

  async function loadProfile() {
    setStatus("Loading profile...");
    try {
      const data = await requestProfile();
      const user = data.user || {};
      nameInput.value = user.name || "";
      emailInput.value = user.email || "";
      phoneInput.value = user.phone || "";
      avatarData = user.avatar || "";
      if (avatarPreview) {
        avatarPreview.src = avatarData || "Actual.png";
      }
      localStorage.setItem("userName", user.name || "");
      localStorage.setItem("userEmail", user.email || "");
      localStorage.setItem("isAdmin", String(Boolean(user.isAdmin)));
      localStorage.setItem("user", JSON.stringify(user));
      setStatus("Profile loaded.");
    } catch (err) {
      console.error("Load profile error:", err);
      setStatus(`Failed to load profile: ${err.message || "Unknown error"}`);
    }
  }

  profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Saving profile...");
    try {
      const data = await requestProfile({
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: nameInput.value.trim(),
          phone: phoneInput.value.trim(),
          avatar: avatarData,
        }),
      });
      const user = data.user || {};
      localStorage.setItem("userName", user.name || "");
      localStorage.setItem("userEmail", user.email || "");
      localStorage.setItem("isAdmin", String(Boolean(user.isAdmin)));
      localStorage.setItem("user", JSON.stringify(user));
      setStatus("Profile updated successfully.");
    } catch (err) {
      console.error("Profile update error:", err);
      setStatus(`Profile update failed: ${err.message || "Unknown error"}`);
    }
  });

  passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Updating password...");
    try {
      await requestProfile({
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: nameInput.value.trim(),
          phone: phoneInput.value.trim(),
          avatar: avatarData,
          currentPassword: currentPasswordInput.value,
          newPassword: newPasswordInput.value,
        }),
      });
      currentPasswordInput.value = "";
      newPasswordInput.value = "";
      setStatus("Password updated successfully.");
    } catch (err) {
      console.error("Password update error:", err);
      setStatus(`Password update failed: ${err.message || "Unknown error"}`);
    }
  });

  avatarInput?.addEventListener("change", () => {
    const file = avatarInput.files && avatarInput.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setStatus("Please choose an image under 1 MB.");
      avatarInput.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      avatarData = String(reader.result || "");
      if (avatarPreview) avatarPreview.src = avatarData || "Actual.png";
      setStatus("Profile image selected. Save profile to upload it.");
    };
    reader.readAsDataURL(file);
  });

  logoutBtn?.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userName");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("user");
    localStorage.removeItem("isAdmin");
    window.location.href = "Login.html";
  });

  loadProfile();
});

