# HyperClean Super-Agent 2

Production-ready OpenAI Realtime + Twilio Media Streams voice agent, bilingual (EN/ES), with µ-law ↔ PCM bridge.

## Deploy (Render)
- Build: `npm ci --production`
- Start: `npm start`
- Health: `/health`
- WebSockets: `/stream-sales` (Alloy), `/stream-service` (Verse), default `/stream`

## Required Env (Render → Environment)
- `OPENAI_API_KEY`
- `STREAM_SHARED_SECRET`
- `OPENAI_MODEL_REALTIME=gpt-4o-realtime-preview`
- `BOOKING_LINK_URL=https://www.hypercleantx.com/#services`

> Do **not** set `PORT`; Render provides it.

## Twilio
Media stream to:
- Sales:   `wss://<render-url>/stream-sales?token=<STREAM_SHARED_SECRET>`
- Service: `wss://<render-url>/stream-service?token=<STREAM_SHARED_SECRET>`
Audio: 8 kHz µ-law.
