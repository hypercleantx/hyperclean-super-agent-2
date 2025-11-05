import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket as WSClient } from 'ws';
import OpenAI from 'openai';
import { mulaw } from 'alawmulaw';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Initialize OpenAI with error handling
let openai;
try {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} catch (error) {
  console.error('Failed to initialize OpenAI:', error);
  process.exit(1);
}

const PORT = process.env.PORT || 10000;
const SHARED = process.env.STREAM_SHARED_SECRET || '';
const BOOK = process.env.BOOKING_LINK_URL || 'https://www.hypercleantx.com/#services';
const MODEL = process.env.OPENAI_MODEL_REALTIME || 'gpt-4o-realtime-preview';

// Health check endpoint
app.get('/health', (req, res) => res.json({ ok: true, version: '3.1.1' }));
app.get('/healthz', (req, res) => res.status(200).send('OK'));

function voiceProfile(pathname) {
  if (pathname.includes('sales')) return { voice: 'alloy', persona: 'sales' };
  if (pathname.includes('service')) return { voice: 'verse', persona: 'service' };
  return { voice: 'alloy', persona: 'default' };
}

server.on('upgrade', (req, socket, head) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    
    // Validate shared secret if configured
    if (SHARED && token !== SHARED) {
      console.warn('Invalid token attempted connection');
      socket.destroy();
      return;
    }
    
    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit('connection', ws, req, url);
    });
  } catch (error) {
    console.error('Upgrade error:', error);
    socket.destroy();
  }
});

wss.on('connection', async (twilioWS, req, url) => {
  console.log('New WebSocket connection established');
  const { voice, persona } = voiceProfile(url.pathname);
  let streamSid = null;
  let upstream = null;
  
  try {
    // Connect to OpenAI Realtime API
    upstream = new WSClient(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(MODEL)}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      }
    );

    upstream.on('open', () => {
      console.log('Connected to OpenAI Realtime API');
      upstream.send(JSON.stringify({
        type: 'session.update',
        session: {
          voice,
          instructions: systemPrompt(persona),
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'whisper-1'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            silence_duration_ms: 500,
            prefix_padding_ms: 300,
            create_response: true
          }
        }
      }));
    });

    upstream.on('message', data => {
      try {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'response.audio.delta' && msg.delta) {
          // Convert PCM16 to mu-law
          const pcm = Buffer.from(msg.delta, 'base64');
          const pcmArray = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
          const mulawArray = mulaw.encode(pcmArray);
          const mulawBuffer = Buffer.from(mulawArray);
          
          // Send to Twilio
          twilioWS.send(JSON.stringify({
            event: 'media',
            streamSid: streamSid,
            media: {
              payload: mulawBuffer.toString('base64')
            }
          }));
        } else if (msg.type === 'response.done') {
          // Send mark event to Twilio
          twilioWS.send(JSON.stringify({
            event: 'mark',
            streamSid: streamSid,
            mark: {
              name: `response_${Date.now()}`
            }
          }));
        }
      } catch (error) {
        console.error('Error processing OpenAI message:', error);
      }
    });

    upstream.on('error', (error) => {
      console.error('OpenAI WebSocket error:', error);
      closeBoth();
    });

    upstream.on('close', () => {
      console.log('OpenAI connection closed');
      closeBoth();
    });

  } catch (error) {
    console.error('Failed to establish OpenAI connection:', error);
    twilioWS.close();
    return;
  }

  twilioWS.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString());
      
      switch(msg.event) {
        case 'start':
          streamSid = msg.start?.streamSid;
          console.log('Stream started:', streamSid);
          break;
          
        case 'media':
          if (msg.media?.payload && upstream?.readyState === 1) {
            // Convert mu-law to PCM16
            const mulawBuffer = Buffer.from(msg.media.payload, 'base64');
            const mulawArray = new Uint8Array(mulawBuffer);
            const pcmArray = mulaw.decode(mulawArray);
            const pcmBuffer = Buffer.from(pcmArray.buffer);
            
            // Send to OpenAI
            upstream.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: pcmBuffer.toString('base64')
            }));
          }
          break;
          
        case 'stop':
          console.log('Stream stopped');
          if (upstream?.readyState === 1) {
            upstream.send(JSON.stringify({
              type: 'input_audio_buffer.commit'
            }));
          }
          closeBoth();
          break;
      }
    } catch (error) {
      console.error('Error processing Twilio message:', error);
    }
  });

  const closeBoth = () => {
    try { twilioWS.close(); } catch {}
    try { upstream?.close(); } catch {}
  };
  
  twilioWS.on('close', () => {
    console.log('Twilio connection closed');
    closeBoth();
  });
  
  twilioWS.on('error', (error) => {
    console.error('Twilio WebSocket error:', error);
    closeBoth();
  });
});

function systemPrompt(persona) {
  const base = [
    'You are Hyper Clean TX's bilingual voice concierge.',
    'Never mention being AI. Speak naturally, concisely, warmly, and human.',
    'Switch to Spanish if the caller speaks Spanish.',
    `For`booking or prices, guide to ${BOOK} or offer to text the link.``
    'Services: Residential ($139-$289), Airbnb turnovers ($75-$145), Move-in/out (custom).',
    'Coverage: Houston and Dallas metro areas.',
    'Do not disclose internal operations or contractor status.'
  ];
  
  if (persona === 'sales') {
    base.push('Be confident and persuasive. Win resident-portal or email-blast placement.');
    base.push('Emphasize reliability, quality, and resident satisfaction.');
  } else if (persona === 'service') {
    base.push('Be calm and service-focused. Help book efficiently.');
    base.push('If issues arise, empathize first, then offer solutions.');
  }
  
  return base.join(' ');
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'HyperClean Super-Agent',
    version: '3.1.1',
    status: 'online',
    endpoints: {
      health: '/health',
      websocket: '/stream?token=YOUR_SECRET'
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`✅ HyperClean Super-Agent v3.1.1 listening on port ${PORT}`);
  console.log(`📡 WebSocket endpoint: wss://YOUR_DOMAIN/stream?token=${SHARED ? '[CONFIGURED]' : '[NOT SET]'}`);
  console.log(`🤖 Using OpenAI model: ${MODEL}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing connections...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
