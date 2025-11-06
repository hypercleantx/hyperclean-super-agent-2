# HyperClean Super-Agent 2

Production-ready OpenAI Realtime + Twilio Media Streams voice agent, bilingual (EN/ES), with µ-law ↔ PCM bridge.

## Features
- **Bilingual Support:** Automatically switches between English and Spanish
- **Multiple Personas:** Sales (Alloy voice) and Service (Verse voice) agents
- **Real-time Audio:** Seamless PCM16 ↔ µ-law conversion for Twilio compatibility
- **Production Ready:** Health checks, graceful shutdown, comprehensive error handling

## Deploy to Render.com

### 1. Prerequisites
- GitHub account
- Render.com account
- OpenAI API key with Realtime API access
- Twilio account with Media Streams enabled

### 2. Deployment Steps

**A. Push to GitHub:**
```bash
git init
git add .
git commit -m "Initial commit - HyperClean Super-Agent"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/hyperclean-super-agent-2.git
git push -u origin main
```

**B. Create Render Service:**
1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name:** hyperclean-super-agent
   - **Region:** Oregon (or closest to your users)
   - **Branch:** main
   - **Build Command:** `npm install --production`
   - **Start Command:** `npm start`
   - **Plan:** Starter (or higher)

**C. Add Environment Variables:**

Go to Environment tab and add:

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `production` | Required |
| `LOG_LEVEL` | `info` | Optional |
| `OPENAI_API_KEY` | `YOUR_KEY_HERE` | **Required** - Get from OpenAI dashboard |
| `OPENAI_MODEL_REALTIME` | `gpt-4o-realtime-preview` | Required |
| `STREAM_SHARED_SECRET` | `YOUR_32_CHAR_SECRET` | **Required** - Generate strong secret |
| `BOOKING_LINK_URL` | `https://www.hypercleantx.com/#services` | Required |

**⚠️ CRITICAL:** Do NOT set `PORT` - Render provides this automatically.

**D. Deploy:**
1. Click "Create Web Service"
2. Wait for build to complete (~2-3 minutes)
3. Verify deployment: Visit `https://YOUR_SERVICE.onrender.com/health`
   - Should return: `{"ok":true,"version":"3.1.1"}`

### 3. Configure Twilio

**A. Get Your Render URL:**
- Copy from Render dashboard (e.g., `https://hyperclean-super-agent.onrender.com`)

**B. Update Twilio Phone Numbers:**

For each phone number, configure Media Streams:

**Sales Line (Alloy voice):**
```
wss://YOUR_RENDER_URL.onrender.com/stream-sales?token=YOUR_STREAM_SHARED_SECRET
```

**Service Line (Verse voice):**
```
wss://YOUR_RENDER_URL.onrender.com/stream-service?token=YOUR_STREAM_SHARED_SECRET
```

**Default:**
```
wss://YOUR_RENDER_URL.onrender.com/stream?token=YOUR_STREAM_SHARED_SECRET
```

### 4. Testing

**Health Check:**
```bash
curl https://YOUR_RENDER_URL.onrender.com/health
```
Expected: `{"ok":true,"version":"3.1.1"}`

**Root Endpoint:**
```bash
curl https://YOUR_RENDER_URL.onrender.com/
```
Returns service info and available endpoints

**Test Call:**
1. Call your Twilio number
2. Speak naturally - agent responds in real-time
3. Try Spanish to test language switching

## Troubleshooting

### Deploy Fails
- Verify all environment variables are set correctly
- Ensure `OPENAI_API_KEY` is valid and has Realtime API access
- Check build logs in Render dashboard
- Clear build cache and retry

### WebSocket Connection Issues
- Verify `STREAM_SHARED_SECRET` matches between Render and Twilio
- Ensure URL includes `?token=YOUR_SECRET`
- Check Twilio Media Streams configuration

### Audio Quality Issues
- Verify 8kHz µ-law is configured in Twilio
- Check OpenAI API status
- Review connection logs

## Architecture

```
Caller → Twilio Phone → Twilio Media Streams (8kHz µ-law)
         ↓
[Render WebSocket Server]
  - Authenticate token
  - Convert µ-law → PCM16
         ↓
[OpenAI Realtime API]
  - Process speech
  - Generate response
  - Return PCM16 audio
         ↓
[Render WebSocket Server]
  - Convert PCM16 → µ-law
         ↓
Twilio Media Streams → Caller
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | Auto | `10000` | **DO NOT SET** - Render provides automatically |
| `NODE_ENV` | Yes | - | Set to `production` |
| `LOG_LEVEL` | No | `info` | Logging verbosity |
| `OPENAI_API_KEY` | Yes | - | OpenAI API key with Realtime access |
| `OPENAI_MODEL_REALTIME` | Yes | `gpt-4o-realtime-preview` | OpenAI Realtime model |
| `STREAM_SHARED_SECRET` | Yes | - | 32+ character secret for WebSocket auth |
| `BOOKING_LINK_URL` | Yes | - | URL for booking/scheduling |

## Support

For issues or questions:
- Check Render deploy logs
- Review Twilio debugger console
- Verify all environment variables
- Ensure OpenAI API key has Realtime API access

## License

Private - HyperClean TX
