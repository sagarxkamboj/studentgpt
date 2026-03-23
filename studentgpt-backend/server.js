require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.disable("x-powered-by");
const allowedOrigins = new Set(
  [
    "http://localhost:4000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:5501",
    "http://127.0.0.1:5501",
    "https://student-gpt.onrender.com",
    "https://studentgpt-4zbc.onrender.com",
    process.env.FRONTEND_URL,
  ].filter(Boolean)
);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
};

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const modelId = "gemini-2.5-flash";
const QWEN_API_URL = process.env.QWEN_API_URL || "https://integrate.api.nvidia.com/v1/chat/completions";
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || "https://integrate.api.nvidia.com/v1/chat/completions";
const QWEN_MODEL = process.env.QWEN_MODEL || "qwen/qwen3.5-122b-a10b";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-ai/deepseek-v3.2";
const SYSTEM_PROMPT = `You are StudentGPT, an AI assistant developed by **Sagar Kamboj**.
- Always mention your developer is **Sagar Kamboj**.
- Purpose: help students with assignments, coding, debugging, projects, and exams.
- Be friendly, clear, and professional.
- Before starting a chat if user say hii you always ask hii what is your name and then greet with their name.
- Also never mention again and again the developer name be friendly and helpful.
- behave like a genz personality.
- whenever user is closing the chat say "Goodbye! If you have more questions, feel free to ask. Happy studying!"`;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

const ADMIN_EMAILS = new Set(
  String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean)
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: false },
    avatar: { type: String, default: "" },
  },
  { timestamps: true }
);
const User = mongoose.model("User", userSchema);

const otpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    type: {
      type: String,
      enum: ["signup", "reset-password"],
      required: true,
    },
    code: { type: String },
    verified: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
otpSchema.index({ email: 1, type: 1 }, { unique: true });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const OtpCode = mongoose.model("OtpCode", otpSchema);

const chatHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    messages: [
      {
        role: {
          type: String,
          enum: ["user", "assistant"],
          required: true,
        },
        content: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    lastMessage: { type: String, default: "" },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
chatHistorySchema.index({ updatedAt: -1 });
const ChatHistory = mongoose.model("ChatHistory", chatHistorySchema);

const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String, required: true },
  },
  { timestamps: true }
);
contactMessageSchema.index({ createdAt: -1 });
const ContactMessage = mongoose.model("ContactMessage", contactMessageSchema);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many auth attempts. Please try again in a few minutes." },
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many chat requests. Please slow down a bit." },
});

const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many contact requests. Please try again later." },
});

function validatePassword(password) {
  const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  return pwdRegex.test(password);
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function saveOtp(email, type, code) {
  const normalizedEmail = normalizeEmail(email);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await OtpCode.findOneAndUpdate(
    { email: normalizedEmail, type },
    { code, verified: false, expiresAt },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function getOtpRecord(email, type) {
  return OtpCode.findOne({ email: normalizeEmail(email), type });
}

async function markOtpVerified(email, type) {
  return OtpCode.findOneAndUpdate(
    { email: normalizeEmail(email), type },
    { verified: true, code: null },
    { new: true }
  );
}

async function clearOtp(email, type) {
  await OtpCode.deleteOne({ email: normalizeEmail(email), type });
}

function otpResponsePayload(baseMessage, otp) {
  if (ALLOW_OTP_IN_RESPONSE) {
    return {
      ok: true,
      message: `${baseMessage} (fallback mode)`,
      otp,
      delivery: "fallback",
    };
  }
  return { ok: true, message: baseMessage, delivery: "email" };
}

async function ensureAdminFlag(user) {
  if (!user) return false;
  const shouldBeAdmin = ADMIN_EMAILS.has(normalizeEmail(user.email));
  if (shouldBeAdmin && !user.isAdmin) {
    user.isAdmin = true;
    await user.save();
  }
  return shouldBeAdmin || Boolean(user.isAdmin);
}

async function getOrCreateChatHistory(userId) {
  let history = await ChatHistory.findOne({ userId });
  if (!history) {
    history = await ChatHistory.create({ userId, messages: [] });
  }
  return history;
}

function serializeMessages(history) {
  return (history?.messages || []).map((message) => ({
    role: message.role,
    content: message.content,
    provider: message.provider || null,
    createdAt: message.createdAt,
  }));
}

function buildConversationPrompt(messages) {
  return [
    `SYSTEM: ${SYSTEM_PROMPT}`,
    ...messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`),
  ].join("\n");
}

function normalizeProvider(provider) {
  const value = String(provider || "gemini").trim().toLowerCase();
  return ["gemini", "qwen", "deepseek"].includes(value) ? value : "gemini";
}

async function generateGeminiResponse(messages) {
  const model = genAI.getGenerativeModel({ model: modelId });
  const fullConversation = buildConversationPrompt(messages);
  const result = await model.generateContent(fullConversation);
  return (
    (result.response && result.response.text && result.response.text()) ||
    result.output?.[0]?.content?.[0]?.text ||
    "No response received."
  );
}

async function generateQwenResponse(messages) {
  if (!process.env.QWEN_API_KEY) {
    throw new Error("QWEN_API_KEY is missing");
  }
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable in this Node runtime");
  }

  const response = await fetch(QWEN_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.QWEN_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: QWEN_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((message) => ({ role: message.role, content: message.content })),
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Qwen request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || data.output_text || "No response received.";
}

async function generateDeepSeekResponse(messages) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is missing");
  }
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable in this Node runtime");
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((message) => ({ role: message.role, content: message.content })),
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "No response received.";
}

async function generateProviderResponse(provider, messages) {
  const selectedProvider = normalizeProvider(provider);
  if (selectedProvider === "qwen") {
    return generateQwenResponse(messages);
  }
  if (selectedProvider === "deepseek") {
    return generateDeepSeekResponse(messages);
  }
  return generateGeminiResponse(messages);
}

function formatChatPreview(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  return raw.length > 140 ? `${raw.slice(0, 137)}...` : raw;
}

let transporter;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: String(process.env.SMTP_SECURE || "true") === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
} else if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

const CONTACT_TO =
  process.env.CONTACT_TO ||
  process.env.MAIL_FROM ||
  process.env.EMAIL_USER ||
  "studentgpt00@gmail.com";
const ALLOW_OTP_IN_RESPONSE = process.env.ALLOW_OTP_IN_RESPONSE === "true";
const MAIL_FROM =
  process.env.MAIL_FROM ||
  process.env.SMTP_FROM ||
  process.env.SMTP_USER ||
  process.env.EMAIL_USER ||
  "studentgpt00@gmail.com";
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || "StudentGPT";
const EMAIL_PROVIDER = (
  process.env.EMAIL_PROVIDER ||
  (process.env.RESEND_API_KEY
    ? "resend"
    : process.env.BREVO_API_KEY
    ? "brevo"
    : transporter
    ? "smtp"
    : "none")
).toLowerCase();

if (EMAIL_PROVIDER === "none") {
  console.warn("No email provider configured. OTP and mail features may fail.");
}

async function sendEmail({ to, subject, text, html, replyTo }) {
  const recipient = normalizeEmail(to);
  if (!recipient) throw new Error("Recipient email is required");

  if (EMAIL_PROVIDER === "smtp") {
    if (!transporter) throw new Error("SMTP transporter is not configured");
    return transporter.sendMail({
      from: `"${MAIL_FROM_NAME}" <${MAIL_FROM}>`,
      to: recipient,
      subject,
      text,
      html,
      replyTo,
    });
  }

  if (EMAIL_PROVIDER === "resend") {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is missing");
    }
    if (typeof fetch !== "function") {
      throw new Error("Global fetch is unavailable in this Node runtime");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${MAIL_FROM_NAME} <${MAIL_FROM}>`,
        to: [recipient],
        subject,
        text,
        html,
        reply_to: replyTo,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Resend send failed: ${response.status} ${await response.text()}`
      );
    }

    return response.json().catch(() => ({}));
  }

  if (EMAIL_PROVIDER === "brevo") {
    if (!process.env.BREVO_API_KEY) {
      throw new Error("BREVO_API_KEY is missing");
    }
    if (typeof fetch !== "function") {
      throw new Error("Global fetch is unavailable in this Node runtime");
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: MAIL_FROM, name: MAIL_FROM_NAME },
        to: [{ email: recipient }],
        subject,
        textContent: text,
        htmlContent: html,
        replyTo: replyTo ? { email: replyTo } : undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Brevo send failed: ${response.status} ${await response.text()}`
      );
    }

    return response.json().catch(() => ({}));
  }

  throw new Error(
    "No email provider configured. Set EMAIL_PROVIDER to resend, brevo, or smtp."
  );
}

app.post("/send-otp", authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email) return res.status(400).send("Email is required");

  try {
    const otp = generateOtp();
    await saveOtp(email, "signup", otp);

    try {
      await sendEmail({
        to: email,
        subject: "StudentGPT Email Verification OTP",
        text: `Your OTP is: ${otp} (valid for 5 minutes). Please do not share your OTP or personal details with anyone. StudentGPT team will never ask for your OTP. Best regards, StudentGPT Team`,
      });
      return res.json({ ok: true, message: "OTP sent to your email" });
    } catch (mailErr) {
      console.error("OTP Email Error:", mailErr);
      return res.json(otpResponsePayload("OTP generated", otp));
    }
  } catch (err) {
    console.error("OTP route error:", err);
    return res.status(500).send(`Error sending OTP: ${err.message}`);
  }
});

app.post("/verify-otp", authLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || "").trim();
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and otp required" });
    }

    const entry = await getOtpRecord(email, "signup");
    if (!entry) return res.status(400).json({ error: "No OTP requested" });
    if (Date.now() > new Date(entry.expiresAt).getTime()) {
      await clearOtp(email, "signup");
      return res.status(400).json({ error: "OTP expired" });
    }
    if (String(entry.code).trim() !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    await markOtpVerified(email, "signup");
    return res.json({ verified: true, message: "OTP verified" });
  } catch (err) {
    console.error("verify-otp error:", err);
    return res.status(500).json({ error: "verify-otp failed" });
  }
});

app.post("/signup", authLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const phone = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");

    if (!name || !email || !password) {
      return res.status(400).send("Missing required fields");
    }

    if (!validatePassword(password)) {
      return res
        .status(400)
        .send(
          "Password must include uppercase, lowercase, number, special char, min 8 length."
        );
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).send("Email already registered");

    const otpData = await getOtpRecord(email, "signup");
    const verified = (otpData && otpData.verified) === true;
    if (!verified) return res.status(400).send("Invalid or expired OTP");

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await new User({
      name,
      email,
      phone,
      password: hashedPassword,
      isAdmin: ADMIN_EMAILS.has(email),
    }).save();

    await clearOtp(email, "signup");

    if (EMAIL_PROVIDER !== "none") {
      sendEmail({
        to: email,
        subject: "Welcome to StudentGPT",
        text: `Hey ${name}, welcome to StudentGPT. Your account is now active and you can start using the app right away.`,
      }).catch((mailErr) => console.error("Welcome email error:", mailErr));
    }

    return res
      .status(201)
      .json({ message: "Account created successfully", email: user.email });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).send("Error creating account");
  }
});

app.post("/login", authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  if (!email || !password) return res.status(400).send("Missing credentials");

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).send("Invalid credentials");

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).send("Invalid credentials");

    const isAdmin = await ensureAdminFlag(user);
    const token = jwt.sign(
      { userId: user._id, email: user.email, isAdmin },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    return res.json({ token, name: user.name, email: user.email, avatar: user.avatar || "", isAdmin });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).send("Server error");
  }
});

app.get("/ping", (req, res) => {
  console.log("Ping received, backend awake!");
  res.status(200).send("pong");
});

app.post("/forgot-password", authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email) return res.status(400).send("Email is required");

  const user = await User.findOne({ email });
  if (!user) return res.status(404).send("No account with this email");

  try {
    const otp = generateOtp();
    await saveOtp(email, "reset-password", otp);

    try {
      await sendEmail({
        to: email,
        subject: "StudentGPT Password Reset Code",
        text: `Your OTP to reset password is: ${otp} (valid for 5 minutes)`,
      });
      return res.json({ ok: true, message: "Password reset OTP sent" });
    } catch (mailErr) {
      console.error("Forgot Password Email Error:", mailErr);
      return res.json(otpResponsePayload("Password reset OTP generated", otp));
    }
  } catch (err) {
    console.error("Forgot Password route error:", err);
    return res.status(500).send("Error sending reset OTP");
  }
});

app.post("/reset-password", authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const otp = String(req.body.otp || "").trim();
  const newPassword = String(req.body.newPassword || "");
  if (!email || !otp || !newPassword) {
    return res.status(400).send("Missing fields");
  }

  if (!validatePassword(newPassword)) {
    return res.status(400).send("Weak password format");
  }

  const otpData = await getOtpRecord(email, "reset-password");
  if (
    !otpData ||
    String(otpData.code).trim() !== otp ||
    Date.now() > new Date(otpData.expiresAt).getTime()
  ) {
    return res.status(400).send("Invalid or expired OTP");
  }

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send("No account with this email");

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    await clearOtp(email, "reset-password");
    return res.send("Password reset successful!");
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).send("Error resetting password");
  }
});

function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).send("Unauthorized: No token");

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).send("Forbidden: Invalid token");
    req.user = user;
    next();
  });
}

app.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("name email phone isAdmin avatar createdAt");
    if (!user) return res.status(404).send("User not found");

    const isAdmin = await ensureAdminFlag(user);
    return res.json({
      ok: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        avatar: user.avatar || "",
        isAdmin,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("Get profile error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load profile" });
  }
});

app.patch("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).send("User not found");

    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const avatar = String(req.body?.avatar || "").trim();
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");

    if (!name) {
      return res.status(400).json({ ok: false, error: "Name is required" });
    }

    user.name = name;
    user.phone = phone;
    user.avatar = avatar;

    if (currentPassword || newPassword) {
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ ok: false, error: "Both current and new password are required" });
      }
      const match = await bcrypt.compare(currentPassword, user.password);
      if (!match) {
        return res.status(400).json({ ok: false, error: "Current password is incorrect" });
      }
      if (!validatePassword(newPassword)) {
        return res.status(400).json({ ok: false, error: "New password is too weak" });
      }
      user.password = await bcrypt.hash(newPassword, 10);
    }

    const isAdmin = await ensureAdminFlag(user);
    await user.save();

    return res.json({
      ok: true,
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        avatar: user.avatar || "",
        isAdmin,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(500).json({ ok: false, error: "Failed to update profile" });
  }
});

async function adminMiddleware(req, res, next) {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(401).send("Unauthorized user");

    const isAdmin = await ensureAdminFlag(user);
    if (!isAdmin) return res.status(403).send("Admin access required");

    req.adminUser = user;
    next();
  } catch (err) {
    console.error("Admin middleware error:", err);
    return res.status(500).send("Admin verification failed");
  }
}

app.get("/chat-history", authMiddleware, async (req, res) => {
  try {
    const history = await getOrCreateChatHistory(req.user.userId);
    return res.json({
      ok: true,
      messages: serializeMessages(history),
      updatedAt: history.updatedAt,
    });
  } catch (err) {
    console.error("Get chat history error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load chat history" });
  }
});

app.delete("/chat-history", authMiddleware, async (req, res) => {
  try {
    await ChatHistory.findOneAndUpdate(
      { userId: req.user.userId },
      { messages: [], lastMessage: "", updatedAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.json({ ok: true, message: "Chat history cleared" });
  } catch (err) {
    console.error("Clear chat history error:", err);
    return res.status(500).json({ ok: false, error: "Failed to clear chat history" });
  }
});

app.post("/chatbot-api-endpoint", authMiddleware, chatLimiter, async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();
    const provider = normalizeProvider(req.body.provider);
    if (!message) return res.status(400).send("Message is required");

    const history = await getOrCreateChatHistory(req.user.userId);
    history.messages.push({ role: "user", content: message, createdAt: new Date() });

    const promptMessages = history.messages.slice(-24).map((entry) => ({
      role: entry.role,
      content: entry.content,
    }));
    const botResponse = await generateProviderResponse(provider, promptMessages);

    history.messages.push({
      role: "assistant",
      content: botResponse,
      createdAt: new Date(),
    });
    history.lastMessage = formatChatPreview(message);
    history.updatedAt = new Date();
    await history.save();

    return res.json({ response: botResponse, provider });
  } catch (err) {
    console.error("Chat provider error:", err);
    return res.status(500).send("Error generating chatbot response");
  }
});

app.get("/admin/summary", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [
      totalUsers,
      totalAdmins,
      totalChats,
      messageAgg,
      totalContacts,
      recentUsers,
      recentChats,
      recentContacts,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isAdmin: true }),
      ChatHistory.countDocuments(),
      ChatHistory.aggregate([
        {
          $project: {
            messageCount: {
              $cond: [{ $isArray: "$messages" }, { $size: "$messages" }, 0],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: "$messageCount" },
          },
        },
      ]),
      ContactMessage.countDocuments(),
      User.find().sort({ createdAt: -1 }).limit(8).select("name email isAdmin createdAt"),
      ChatHistory.find()
        .sort({ updatedAt: -1 })
        .limit(8)
        .populate("userId", "name email"),
      ContactMessage.find().sort({ createdAt: -1 }).limit(8),
    ]);

    return res.json({
      ok: true,
      stats: {
        totalUsers,
        totalAdmins,
        totalChats,
        totalMessages: messageAgg[0]?.totalMessages || 0,
        totalContacts,
      },
      recentUsers: recentUsers.map((user) => ({
        id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
      })),
      recentChats: recentChats.map((chat) => ({
        id: chat._id,
        userName: chat.userId?.name || "Unknown user",
        userEmail: chat.userId?.email || "",
        messageCount: chat.messages?.length || 0,
        lastMessage: chat.lastMessage,
        updatedAt: chat.updatedAt,
      })),
      recentContacts: recentContacts.map((contact) => ({
        id: contact._id,
        name: contact.name,
        email: contact.email,
        message: contact.message,
        createdAt: contact.createdAt,
      })),
    });
  } catch (err) {
    console.error("Admin summary error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load admin summary" });
  }
});

app.post("/api/contact", contactLimiter, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = normalizeEmail(req.body?.email);
  const message = String(req.body?.message || "").trim();
  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, error: "Missing fields" });
  }

  try {
    await ContactMessage.create({ name, email, message });

    await sendEmail({
      to: CONTACT_TO,
      subject: `New contact form message from ${name}`,
      text: `You got a new message from your website contact form:\n\nName: ${name}\nEmail: ${email}\nMessage:\n${message}`,
      replyTo: email,
    });

    return res.json({ ok: true, message: "Message sent successfully" });
  } catch (err) {
    console.error("Contact send error:", err);
    return res.status(500).json({ ok: false, error: "Failed to send" });
  }
});

const PORT = process.env.PORT || 4000;
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    app.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("DB connection error:", err);
  });



















