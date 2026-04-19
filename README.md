# 🎓 StudentGPT

**StudentGPT** is a student-focused AI chatbot platform built with a modern web frontend and a Node.js backend. It supports multi-model selection for AI responses and includes user authentication, OTP verification, chat history, and email notifications.

---

## 🚀 Project Overview

StudentGPT provides:

* AI-powered chat assistance for students
* Flexible model selection: `gemini`, `qwen`, and `deepseek`
* Real-time streaming responses from the backend
* User signup/login with email OTP verification
* Conversation persistence in MongoDB
* Admin/interface pages for profile, login, signup, reset password, and chat

---

## 🧩 Architecture

### Frontend

* `index.html` — landing / homepage
* `chat.html` — chat interface
* `login.js`, `signup.js`, `ResetPassword.js`, `profile.js`, `chatbot.js`, `admin.js` — app behavior and auth flows

### Backend

* `studentgpt-backend/server.js` — Express server, auth, chat API, email/OTP handling
* `studentgpt-backend/package.json` — backend dependencies

### Database

* MongoDB for users, OTP codes, and conversation histories

---

## 🔧 Tech Stack

* Frontend: HTML, CSS, JavaScript
* Backend: Node.js, Express
* Database: MongoDB / Mongoose
* Authentication: JWT, bcrypt
* Email: SMTP / Resend / Brevo / Gmail
* AI: Google Gemini + external LLMs via REST

---

## 🧠 Multi-Model AI Selection

The backend supports three AI providers:

### `gemini`

* Uses `@google/generative-ai`
* Default model: `gemini-2.5-flash`
* Streaming handled through `generateContentStream`

### `qwen`

* Uses an external REST API
* Supported model fallback list:
  * `qwen/qwen3.5-122b-a10b`
  * `qwen/qwen2.5-7b-instruct`
  * `qwen/qwq-32b`
* Can use `QWEN_API_URL` if provided

### `deepseek`

* Uses an external REST API
* Supported model fallback list:
  * `deepseek-ai/deepseek-v3.1`
  * `deepseek-ai/deepseek-v3.2`
  * `deepseek-ai/deepseek-v3.1-terminus`
* Can use `DEEPSEEK_API_URL` if provided

### Selection behavior

* Backend endpoint: `POST /chatbot-api-endpoint`
* Request body: `{ message, model, stream, conversationId }`
* If `model` is omitted, defaults to `gemini`
* The server stores provider name in conversation history

---

## 📦 Backend Environment Variables

Create a `.env` file inside `studentgpt-backend/` with:

```
PORT=4000
MONGO_URI=<your-mongo-connection-string>
JWT_SECRET=<your-jwt-secret>
GEMINI_API_KEY=<your-gemini-api-key>
QWEN_API_KEY=<your-qwen-api-key>
DEEPSEEK_API_KEY=<your-deepseek-api-key>
QWEN_API_URL=<optional-qwen-api-url>
DEEPSEEK_API_URL=<optional-deepseek-api-url>
SMTP_HOST=<smtp-host>
SMTP_PORT=<smtp-port>
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-pass>
SMTP_SECURE=true
MAIL_FROM=<from-email>
MAIL_FROM_NAME=StudentGPT
CONTACT_TO=<contact-recipient-email>
ALLOW_OTP_IN_RESPONSE=false
```

> If email provider keys are missing, the app still supports OTP fallback mode when `ALLOW_OTP_IN_RESPONSE=true`.

---

## 🚀 Run Locally

### 1. Install backend dependencies

```bash
cd "e:\VSCODE\HTML PROJECT\Chatbot\studentgpt-backend"
npm install
```

### 2. Start backend server

```bash
npm start
```

### 3. Open frontend

Open the HTML pages directly in your browser or use a local server such as Live Server in VS Code.

---

## 📡 API Endpoints

### Authentication

* `POST /send-otp` — request signup OTP
* `POST /verify-otp` — verify signup OTP
* `POST /signup` — create user account
* `POST /login` — authenticate user
* `POST /forgot-password` — request password reset OTP
* `POST /reset-password` — reset password

### Chat

* `POST /chatbot-api-endpoint`
  * `message` — user prompt
  * `model` — `gemini`, `qwen`, or `deepseek`
  * `stream` — `true`/`false`
  * `conversationId` — existing conversation to continue

### User and conversation management

* `POST /api/clear-chat` — delete user conversation history

### Contact

* `POST /api/contact` — send contact form message to configured email

---

## ✅ Key Features

* Multi-model selection with provider fallback
* Streamed response delivery for fast UX
* Secure password hashing and JWT auth
* Email OTP verification and optional email provider support
* Conversation history saved in MongoDB
* Flexible CORS configuration for local and production domains

---

## 📄 Deployment Notes

* Deploy backend to Render, Heroku, Vercel Serverless, or any Node hosting
* Ensure `MONGO_URI` and API keys are set in production environment
* Set correct allowed origins in `server.js` for your frontend domain

---

## 🌟 Author

**Sagar**

---

## 📜 License

MIT License
