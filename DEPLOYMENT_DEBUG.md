# Deployment Debugging Guide

## Issues Fixed So Far ✅
1. ✅ Updated DeepSeek model from `deepseek-ai/deepseek-v3.1` to `deepseek-ai/deepseek-v3`
2. ✅ Improved error logging in `/chatbot-api-endpoint` endpoint
3. ✅ Added detailed error messages in Qwen and DeepSeek provider functions

---

## Remaining Issues to Check 🔍

### 1. **Render Environment Variables**
Your production backend is deployed on `https://studentgpt-4zbc.onrender.com`

**Action Required:** 
- Go to Render Dashboard → Settings → Environment Variables
- Verify these variables are set:
  ```
  MONGO_URI=mongodb+srv://sagarxkamboj:...
  GEMINI_API_KEY=AIzaSy...
  QWEN_API_KEY=nvapi-...
  DEEPSEEK_API_KEY=nvapi-...
  JWT_SECRET=021dff88...
  PORT=4000 (or leave empty for auto-assign)
  NODE_ENV=production
  ```

> ⚠️ **SECURITY WARNING**: Your `.env` file in GitHub is publicly visible! The API keys are exposed:
- Remove all API keys from repository
- Add `.env` to `.gitignore`
- Regenerate all API keys:
  - GEMINI_API_KEY
  - QWEN_API_KEY / DEEPSEEK_API_KEY
  - JWT_SECRET

---

### 2. **Test Each Model Separately**
Curl commands to test models in production:

```bash
# 1. Test Gemini Model
curl -X POST https://studentgpt-4zbc.onrender.com/chatbot-api-endpoint \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"message":"Hi","provider":"gemini"}'

# 2. Test Qwen Model  
curl -X POST https://studentgpt-4zbc.onrender.com/chatbot-api-endpoint \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"message":"Hi","provider":"qwen"}'

# 3. Test DeepSeek Model
curl -X POST https://studentgpt-4zbc.onrender.com/chatbot-api-endpoint \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"message":"Hi","provider":"deepseek"}'
```

---

### 3. **Check Render Logs**
In Render Dashboard:
1. Go to your backend service
2. Click "Logs" 
3. Look for errors with "Provider" or "API Error"
4. Common errors will now show detailed messages like:
   - `Qwen API Error (401): Invalid API key`
   - `DeepSeek API Error (403): Rate limit exceeded`
   - `DEEPSEEK_API_KEY is missing from environment variables`

---

### 4. **NVIDIA API Key Issues**
Both Qwen & DeepSeek use NVIDIA's API via `https://integrate.api.nvidia.com/`

**Check:**
- [ ] API keys are valid and not expired
- [ ] No IP restrictions blocking Render's servers
- [ ] Rate limits not exceeded (NVIDIA has limits per API key)
- [ ] Request format matches NVIDIA's current API spec

**Solution:**
If errors continue, try using individual API endpoints:
```javascript
// Instead of shared NVIDIA endpoint, use:
const QWEN_API_URL = "https://api.qwen.com/v1/chat/completions"; // if available
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"; // if available
```

---

### 5. **MongoDB Connection**
Your MongoDB URI: `mongodb+srv://sagarxkamboj:...`

**Check:**
- [ ] Database is accessible from Render servers (not geographically blocked)
- [ ] IP whitelist on MongoDB includes Render's IPs or set to `0.0.0.0/0`
- [ ] Connection string is correct in Render env vars

**Test:**
```bash
# Add this endpoint temporarily to server.js
app.get("/test-db", async (req, res) => {
  try {
    const users = await User.countDocuments();
    res.json({ ok: true, userCount: users });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
```

Then test: `https://studentgpt-4zbc.onrender.com/test-db`

---

### 6. **CORS Configuration**
Check [server.js line 15-19] - Your allowed origins:
```javascript
const allowedOrigins = new Set([
  // ... existing URLs ...
  process.env.FRONTEND_URL, // ← Make sure this is set!
]);
```

**Action:**
- Set `FRONTEND_URL` in Render env vars to wherever frontend is hosted
- Example: `FRONTEND_URL=https://student-gpt.onrender.com`

---

### 7. **Node.js Version**
Older Node versions don't have `fetch` global.

**Check in Render:**
1. Settings → Build & Deploy
2. Node Version should be ≥ 18.0.0
3. If older, update and redeploy

---

## Quick Fix Checklist ✓

- [ ] Set all environment variables in Render dashboard
- [ ] Regenerate exposed API keys (SECURITY!)
- [ ] Test each model via curl commands above
- [ ] Check Render logs for errors
- [ ] Verify NVIDIA API keys work
- [ ] Verify MongoDB whitelists Render IPs
- [ ] Set FRONTEND_URL env variable
- [ ] Ensure Node.js ≥ 18.0.0

---

## If Models Still Fail

The new error messages will tell you exactly what's wrong. Check Render logs and report:
- Which model fails (Gemini, Qwen, or DeepSeek)
- Exact error message from logs
- HTTP status code (401, 403, 500, etc.)

Then fix the specific provider.

---

## Frontend Error Handling
Users will now see more helpful messages:
- `"AI provider error"` (production)
- `"Qwen API Error (401): Invalid API key"` (detailed in dev mode)

This helps identify which model is broken.

---

## Need Extra Help?
1. Check browser console (F12) for network errors
2. Check Render logs for backend errors
3. Test endpoints with Postman/curl
4. Verify API credentials are correct
5. Check NVIDIA's API documentation for latest model names
