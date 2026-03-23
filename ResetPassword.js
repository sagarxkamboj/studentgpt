document.getElementById("send-otp").onclick = async function () {
  const API_BASE =
    ["localhost", "127.0.0.1", ""].includes(window.location.hostname) ||
    window.location.protocol === "file:"
      ? "http://localhost:4000"
      : "https://studentgpt-4zbc.onrender.com";
  const email = document.getElementById("email").value;
  if (!email) return setMsg("Enter your registered email.");
  setMsg("Sending OTP...");
  try {
    const res = await fetch(`${API_BASE}/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const text = await res.text();
    setMsg(text);
  } catch (err) {
    setMsg("Error sending OTP.");
  }
};

document.getElementById("reset-form").onsubmit = async function (e) {
  const API_BASE =
    ["localhost", "127.0.0.1", ""].includes(window.location.hostname) ||
    window.location.protocol === "file:"
      ? "http://localhost:4000"
      : "https://studentgpt-4zbc.onrender.com";
  e.preventDefault();
  const email = document.getElementById("email").value;
  const otp = document.getElementById("otp").value.trim();
  const newPassword = document.getElementById("newPassword").value;
  if (!email || !otp || !newPassword) return setMsg("Fill all fields.");
  setMsg("Resetting...");
  try {
    const res = await fetch(`${API_BASE}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp, newPassword }),
    });
    const text = await res.text();
    setMsg(text);
  } catch {
    setMsg("Error resetting password.");
  }
};

function setMsg(msg) {
  document.getElementById("msg").innerText = msg;
}


