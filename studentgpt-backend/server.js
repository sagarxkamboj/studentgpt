require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const allowedOrigins = new Set([
  "http://localhost:4000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:5501",
  "http://localhost:5501",
  "https://student-gpt.onrender.com",
]);

app.use(
  cors({
    origin: function (origin, callback) {
      const localOrigins = ["http://localhost:4000", "http://localhost:5500", "http://127.0.0.1:5500", "http://localhost:5501", "http://127.0.0.1:5501"];
      if (!origin || localOrigins.includes(origin) || origin.includes("onrender.com")) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })
);
app.options(/.*/, cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// AI clients
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModelId = "gemini-2.5-flash";

// Mongoose models
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  password: { type: String, required: true },
});
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

const conversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, default: "New Conversation" },
  messages: [
    {
      role: { type: String, enum: ["user", "assistant", "system"], required: true },
      content: { type: String, required: true },
      provider: { type: String },
      timestamp: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });
const Conversation = mongoose.model("Conversation", conversationSchema);

// Password validation
function validatePassword(password) {
  const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  return pwdRegex.test(password);
}

const conversationHistories = {};

// SMTP transport is optional. API-based mail works even where SMTP ports are blocked.
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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
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

/* ---------------------
   OTP / Signup / Login
   --------------------- */
app.post("/send-otp", async (req, res) => {
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
    return res.status(500).send("Error sending OTP: " + err.message);
  }
});

app.post("/verify-otp", async (req, res) => {
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

app.post("/signup", async (req, res) => {
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

app.post("/login", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  if (!email || !password) return res.status(400).send("Missing credentials");

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).send("Invalid credentials");

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).send("Invalid credentials");

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    return res.json({ token, name: user.name, email: user.email });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).send("Server error");
  }
});

/*ping pong added for smooth backend monitoring*/
app.get("/ping", (req, res) => {
  console.log("Ping received, backend awake!");
  res.status(200).send("pong");
});

/* ---------------------
   Password Reset
   --------------------- */
app.post("/forgot-password", async (req, res) => {
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

app.post("/reset-password", async (req, res) => {
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

/* ---------------------
   Auth Middleware
   --------------------- */
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

/* ---------------------
   Chat History API
   --------------------- */
app.get("/api/chat-history", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const conversations = await Conversation.find({ userId }).sort({ updatedAt: -1 });
    return res.json({ conversations });
  } catch (err) {
    console.error("Fetch history error:", err);
    res.status(500).send("Error fetching history");
  }
});

app.delete("/api/conversation/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).send("Invalid conversation ID");
    }

    const deleted = await Conversation.findOneAndDelete({ _id: id, userId });

    if (!deleted) {
      return res.status(404).send("Conversation not found or not owned by you");
    }

    res.json({ ok: true, message: "Session deleted successfully" });
  } catch (err) {
    console.error("Delete session error:", err);
    res.status(500).send("Server error during deletion");
  }
});

app.post("/api/clear-chat", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    await Conversation.deleteMany({ userId });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Clear chat error:", err);
    res.status(500).send("Error clearing chat");
  }
});

/* ---------------------
   Chatbot API
   --------------------- */
app.post("/chatbot-api-endpoint", authMiddleware, async (req, res) => {
  try {
    const { message, model = "gemini", stream = true, conversationId } = req.body;
    if (!message) return res.status(400).send("Message is required");

    const userId = req.user.userId;

    // Fetch or Init History from MongoDB
    let conversation;
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
    }

    if (!conversation) {
      conversation = new Conversation({
        userId,
        title: message.substring(0, 30) + (message.length > 30 ? "..." : ""),
        messages: [
          {
            role: "system",
            content: `You are StudentGPT, an AI assistant developed by **Sagar Kamboj**.  
- Always mention your developer is **Sagar Kamboj**.  
- Purpose: help students with assignments, coding, debugging, projects, and exams.  
- Be friendly, clear, and professional.
- Before starting a chat if user say hii you always ask hii what is your name and then greet with their name.
- Also never mention again and again the developer name be friendly and helpful.
- behave like a genz personality.
- whenever user is closing the chat say "Goodbye! If you have more questions, feel free to ask. Happy studying!"`
          }
        ]
      });
    }

    conversation.messages.push({ role: "user", content: message });

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      // Send conversation ID immediately so frontend can bind the session
      res.write(`data: ${JSON.stringify({ conversationId: conversation._id })}\n\n`);
    }

    let fullResponse = "";
    const provider = model;

    if (model === "gemini") {
      const geminiModel = genAI.getGenerativeModel({ model: geminiModelId });
      const prompt = conversation.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");

      const result = await geminiModel.generateContentStream(prompt);
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullResponse += chunkText;
        if (stream) {
          res.write(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`);
        }
      }
    } else if (model === "qwen" || model === "deepseek") {
      const apiKey = model === "qwen" ? process.env.QWEN_API_KEY : process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error(`${model.toUpperCase()}_API_KEY is missing from environment variables.`);
      }

      const modelNames = model === "qwen"
        ? ["qwen/qwen3.6-35b-a3b-fp8", "qwen/qwen3-coder-next", "qwen/qwen3-next-80b-a3b-thinking", "qwen/qwen3-coder-480b-a35b-instruct"].filter(Boolean)
        : ["deepseek-ai/deepseek-v3.2", "deepseek-ai/deepseek-v3.1-terminus", "deepseek-ai/deepseek-r1", "deepseek-ai/deepseek-v3"].filter(Boolean);

      const apiUrls = [
        process.env[`${model.toUpperCase()}_API_URL`],
        `https://integrate.api.nvidia.com/v1/chat/completions`,
        model === "qwen" ? "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions" : "https://api.deepseek.com/v1/chat/completions",
        `https://ai.api.nvidia.com/v1/chat/completions`
      ].filter(Boolean);

      let response;
      let lastError;

      for (const url of apiUrls) {
        for (const mId of modelNames) {
          try {
            response = await fetch(url, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: mId,
                messages: conversation.messages.map(m => ({ role: m.role, content: m.content })),
                temperature: 0.7,
                max_tokens: 1024,
                stream: true,
              }),
            });
            if (response.ok) break;
            lastError = await response.text();
            console.warn(`${model} failed on ${url} with ${mId}: ${response.status} ${lastError}`);
          } catch (e) {
            lastError = e.message;
          }
        }
        if (response && response.ok) break;
      }

      if (!response || !response.ok) {
        let errorDetail = lastError;
        try {
          const errJson = JSON.parse(lastError);
          errorDetail = errJson.detail || errJson.message || (errJson.error && errJson.error.message) || lastError;
        } catch(e) {}
        throw new Error(`${model.toUpperCase()} API Error (${response ? response.status : 'Fetch Failed'}): ${errorDetail}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep partial line

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith("data: ")) continue;

          const dataStr = trimmedLine.slice(6);
          if (dataStr === "[DONE]") break;

          try {
            const data = JSON.parse(dataStr);
            const content = data.choices[0]?.delta?.content || "";
            if (content) {
              fullResponse += content;
              if (stream) {
                res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
              }
            }
          } catch (e) {
            // Silently handle parse errors for partial chunks
          }
        }
      }
    }

    conversation.messages.push({ role: "assistant", content: fullResponse, provider });
    await conversation.save();

    if (stream) {
      res.write(`data: [DONE]\n\n`);
      res.end();
    } else {
      res.json({ response: fullResponse, provider });
    }
  } catch (err) {
    console.error("Chat Error:", err);
    if (!res.headersSent) {
      res.status(500).send("Error generating response");
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

/* ---------------------
   History Management
   --------------------- */
// Clear all history for a user
app.delete("/api/chat-history", authMiddleware, async (req, res) => {
  try {
    await Conversation.deleteMany({ userId: req.user.userId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear history" });
  }
});

// Delete a specific conversation
app.delete("/api/conversation/:id", authMiddleware, async (req, res) => {
  try {
    const result = await Conversation.deleteOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

/* ---------------------
   Contact Form
   --------------------- */
app.post("/api/contact", async (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, error: "Missing fields" });
  }

  try {
    await sendEmail({
      to: CONTACT_TO,
      subject: `New contact form message from ${name}`,
      text: `You got a new message from your website contact form:\n\nName: ${name}\nEmail: ${email}\nMessage:\n${message}`,
      replyTo: normalizeEmail(email),
    });

    return res.json({ ok: true, message: "Message sent successfully" });
  } catch (err) {
    console.error("Contact send error:", err);
    return res.status(500).json({ ok: false, error: "Failed to send" });
  }
});

/* ---------------------
   Start Server
   --------------------- */
const PORT = process.env.PORT || 4000;
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    app.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("DB connection error:", err);
  });
