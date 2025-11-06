# Deployment Guide

## Pre-Deployment Checklist

- [ ] OpenAI API key with Realtime API access
- [ ] Twilio account with Media Streams enabled
- [ ] GitHub repository created
- [ ] Render.com account created

## Step-by-Step Deployment

### 1. Prepare Repository

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Initial deployment"

# Add remote
git remote add origin https://github.com/YOUR_USERNAME/hyperclean-super-agent-2.git

# Push
git push -u origin main
```

### 2. Create Render Service

1. Log into https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub account
4. Select `hyperclean-super-agent-2` repository
5. Configure service:
   - **Name:** hyperclean-super-agent
   - **Region:** Oregon (or closest to users)
   - **Branch:** main
   - **Build Command:** `npm install --production`
   - **Start Command:** `npm start`
   - **Plan:** Starter

### 3. Configure Environment Variables

Add these in Render Dashboard → Environment:

```
NODE_ENV=production
LOG_LEVEL=info
OPENAI_API_KEY=YOUR_OPENAI_KEY_HERE
OPENAI_MODEL_REALTIME=gpt-4o-realtime-preview
STREAM_SHARED_SECRET=YOUR_32_CHAR_SECRET_HERE
BOOKING_LINK_URL=https://www.hypercleantx.com/#services
```

**Generate strong secret:**
```bash
openssl rand -base64 32
```

### 4. Deploy

Click "Create Web Service" and wait for deployment (~2-3 minutes).

### 5. Verify Deployment

```bash
# Health check
curl https://YOUR_SERVICE.onrender.com/health
```

Expected response:
```json
{"ok":true,"version":"3.1.1"}
```

### 6. Configure Twilio

1. Log into Twilio Console
2. Go to Phone Numbers → Manage → Active Numbers
3. Select your phone number
4. Scroll to Voice Configuration
5. Add Media Stream:

**Sales Line:**
```
wss://YOUR_SERVICE.onrender.com/stream-sales?token=YOUR_SECRET
```

**Service Line:**
```
wss://YOUR_SERVICE.onrender.com/stream-service?token=YOUR_SECRET
```

### 7. Test

Call your Twilio number and verify:
- Connection established
- Voice responds naturally
- Can handle both English and Spanish
- Audio quality is clear

## Troubleshooting

### Build Fails

**Check logs:**
```
In Render dashboard, go to Logs tab
```

**Common issues:**
- Missing environment variables
- Invalid OpenAI API key
- Node version mismatch

**Solutions:**
1. Verify all environment variables are set
2. Test OpenAI API key separately
3. Clear build cache and redeploy

### Runtime Errors

**Check logs in Render dashboard**

**Common issues:**
- OPENAI_API_KEY not set or invalid
- STREAM_SHARED_SECRET mismatch with Twilio
- Port binding issues

**Solutions:**
1. Verify environment variables
2. Ensure PORT is NOT manually set
3. Check OpenAI API status

### WebSocket Connection Fails

**Check:**
- Twilio debugger console
- Render logs
- Token parameter in URL

**Verify:**
- URL format: `wss://domain/stream?token=SECRET`
- Token matches STREAM_SHARED_SECRET
- WebSocket upgrade succeeds

## Monitoring

### Health Checks

Render automatically monitors `/health` endpoint.

### Logs

View real-time logs in Render dashboard.

### Metrics

Monitor in Render dashboard:
- Response times
- Memory usage
- CPU usage
- Request volume

## Scaling

### Vertical Scaling

Upgrade Render plan for more resources.

### Horizontal Scaling

For high volume:
1. Deploy multiple instances
2. Use load balancer
3. Consider Redis for session management

## Maintenance

### Updates

```bash
git pull origin main
# Make changes
git add .
git commit -m "Update description"
git push origin main
# Auto-deploys if enabled
```

### Rollback

In Render dashboard:
1. Go to Events tab
2. Find previous successful deploy
3. Click "Rollback"

### Environment Variable Changes

1. Update in Render dashboard → Environment
2. Trigger manual deploy
