import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket as WSClient } from 'ws';
import OpenAI from 'openai';
import * as mulaw from 'alawmulaw/mulaw';
// import * as alaw from 'alawmulaw/alaw'; // reserved for future A-Law support

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Initialize OpenAI with error handling
let openai;
try {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} catch (error) {
  console.error('❌ Failed to initialize OpenAI:', error.message);
  process.exit(1);
}

const PORT = process.env.PORT || 10000;
const SHARED = process.env.STREAM_SHARED_SECRET;
const MODEL = process.env.OPENAI_MODEL_REALTIME || 'gpt-4o-realtime-preview';
const BOOKING_URL = process.env.BOOKING_LINK_URL || 'https://www.hypercleantx.com/#services';

if (!SHARED) {
  console.error('❌ STREAM_SHARED_SECRET environment variable is required');
  process.exit(1);
}

// Enable JSON body parsing
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ ok: true, version: '3.1.1' });
});

// Root endpoint with service info
app.get('/', (req, res) => {
  res.json({
    service: 'HyperClean Super-Agent 2',
    version: '3.1.1',
    status: 'operational',
    endpoints: {
      health: '/health',
      streamDefault: '/stream',
      streamSales: '/stream-sales',
      streamService: '/stream-service'
    },
    documentation: 'See README.md for full documentation'
  });
});

// WebSocket upgrade handler
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  
  // Authenticate token
  if (token !== SHARED) {
    console.error('❌ Invalid token provided');
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // Route to appropriate handler
  const path = url.pathname;
  if (['/stream', '/stream-sales', '/stream-service'].includes(path)) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  }
});

// Persona configurations encapsulate the voice and instructions for each WebSocket
const PERSONAS = {
  '/stream': {
    voice: 'alloy',
    instructions: `You are a friendly, professional bilingual customer service representative for HyperClean TX, a residential and Airbnb cleaning service in Houston and Dallas. You automatically detect and respond in the caller's language (English or Spanish).

Key Information:
- Services: Standard cleaning, deep cleaning, move-in/move-out, Airbnb turnovers
- Coverage: Houston and Dallas metro areas
- Booking: Direct callers to ${BOOKING_URL}
- Response time: Same-day or next-day service available
- Quality guarantee: "We'll Make It Right" policy

Your Role:
- Answer questions about services, pricing, and availability
- Qualify leads and gather property details (size, cleaning type, frequency)
- Provide clear next steps for booking
- Handle objections professionally
- Switch seamlessly between English and Spanish

Communication Style:
- Warm, professional, and solution-oriented
- Ask clarifying questions to understand needs
- Be concise but thorough
- Always end with a clear call-to-action

If caller asks to book, provide the booking link and offer to help with any questions about the process.`
  },
  '/stream-sales': {
    voice: 'alloy',
    instructions: `You are an energetic, persuasive bilingual sales representative for HyperClean TX. You automatically detect and respond in the caller's language (English or Spanish).

Your Mission:
- Convert inquiries into bookings
- Highlight value propositions and competitive advantages
- Create urgency with same-day availability
- Overcome objections with confidence
- Close the sale by directing to ${BOOKING_URL}

Value Props to Emphasize:
- Professional, background-checked cleaners
- Flexible scheduling with same-day options
- Quality guarantee: "We'll Make It Right"
- Bilingual support
- Serving Houston and Dallas metros

Sales Techniques:
- Build rapport quickly
- Ask qualifying questions to understand pain points
- Position HyperClean as the solution
- Handle price objections by emphasizing quality and reliability
- Use assumptive close: "When would you like us to come?"

Always guide towards booking at ${BOOKING_URL}. Be enthusiastic but not pushy.`
  },
  '/stream-service': {
    voice: 'verse',
    instructions: `You are a calm, empathetic bilingual customer service specialist for HyperClean TX. You automatically detect and respond in the caller's language (English or Spanish).

Your Focus:
- Resolve service issues with care
- Address complaints professionally
- Coordinate rescheduling and special requests
- Ensure customer satisfaction
- Maintain HyperClean's reputation

Issue Resolution:
- Listen actively to understand the full situation
- Apologize sincerely when appropriate
- Offer solutions immediately
- Follow up with specific action items
- Escalate complex issues when needed

Quality Guarantee:
- "We'll Make It Right" - emphasize commitment
- Same-day resolution when possible
- No-cost re-cleans if standards not met
- Full satisfaction or money back

Communication Style:
- Patient, understanding, and solution-focused
- Avoid being defensive
- Take ownership of issues
- Provide clear timelines for resolution
- End calls with confirmation of next steps

For booking changes or new service requests, direct to ${BOOKING_URL}.`
  }
};

/**
 * Generate a system prompt based on the requested WebSocket path. This helper
 * function encapsulates persona selection logic so that future additions or
 * changes can be centralised. Sales and service personas are distinguished
 * by their respective endpoint paths. If an unknown path is provided, the
 * default persona is returned.
 *
 * @param {string} path - The WebSocket pathname (e.g. '/stream-sales').
 * @returns {{voice: string, instructions: string}} The persona configuration.
 */
function systemPrompt(path) {
  return PERSONAS[path] || PERSONAS['/stream'];
}

// WebSocket connection handler
wss.on('connection', async (twilioWS, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  // Retrieve the persona using the systemPrompt helper. Defaults to '/stream' persona
  const persona = systemPrompt(path);
  
  console.log(`📞 New connection on ${path} with ${persona.voice} voice`);

  let streamSid = null;
  let upstream = null;

  try {
    // Establish OpenAI Realtime connection
    const upstreamURL = `wss://api.openai.com/v1/realtime?model=${MODEL}`;
    upstream = new WSClient(upstreamURL, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    // Wait for OpenAI connection
    await new Promise((resolve, reject) => {
      upstream.once('open', resolve);
      upstream.once('error', reject);
    });

    console.log('✅ OpenAI Realtime connection established');

    // Configure OpenAI session
    upstream.send(JSON.stringify({
      type: 'session.update',
      session: {
        turn_detection: { type: 'server_vad' },
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        voice: persona.voice,
        instructions: persona.instructions,
        modalities: ['text', 'audio'],
        temperature: 0.8
      }
    }));

    // Handle OpenAI messages
    upstream.on('message', data => {
      try {
        const event = JSON.parse(data.toString());
        
        if (event.type === 'response.audio.delta' && event.delta && twilioWS.readyState === 1) {
          // Convert PCM16 to mu-law
          const pcmBuffer = Buffer.from(event.delta, 'base64');
          const pcmArray = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);
          const mulawArray = mulaw.encode(pcmArray);
          const mulawBase64 = Buffer.from(mulawArray).toString('base64');
          
          // Send to Twilio
          twilioWS.send(JSON.stringify({
            event: 'media',
            streamSid,
            media: { payload: mulawBase64 }
          }));
        }
        
        if (event.type === 'response.done') {
          // Send mark when response complete
          twilioWS.send(JSON.stringify({
            event: 'mark',
            streamSid,
            mark: {
              name: `response_${Date.now()}`
            }
          }));
        }
      } catch (error) {
        console.error('❌ Error processing OpenAI message:', error);
      }
    });

    upstream.on('error', (error) => {
      console.error('❌ OpenAI WebSocket error:', error);
      closeBoth();
    });

    upstream.on('close', () => {
      console.log('🔌 OpenAI connection closed');
      closeBoth();
    });

  } catch (error) {
    console.error('❌ Failed to establish OpenAI connection:', error);
    twilioWS.close();
    return;
  }

  twilioWS.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString());
      
      switch(msg.event) {
        case 'start':
          streamSid = msg.start?.streamSid;
          console.log('📞 Stream started:', streamSid);
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
          console.log('🛑 Stream stopped');
          if (upstream?.readyState === 1) {
            upstream.send(JSON.stringify({
              type: 'input_audio_buffer.commit'
            }));
          }
          closeBoth();
          break;
      }
    } catch (error) {
      console.error('❌ Error processing Twilio message:', error);
    }
  });

  const closeBoth = () => {
    try { twilioWS.close(); } catch {}
    try { upstream?.close(); } catch {}
  };
  
  twilioWS.on('close', () => {
    console.log('🔌 Twilio connection closed');
    closeBoth();
  });
  
  twilioWS.on('error', (error) => {
    console.error('❌ Twilio WebSocket error:', error);
    closeBoth();
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`✅ HyperClean Super-Agent v3.1.1 listening on port ${PORT}`);
  console.log(`📡 WebSocket endpoint: wss://YOUR_DOMAIN/stream?token=${SHARED ? '[CONFIGURED]' : '[NOT SET]'}`);
  console.log(`🤖 Using OpenAI model: ${MODEL}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM received, closing connections...');
  server.close(() => {
    console.log('✅ Server closed gracefully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('⚠️  SIGINT received, closing connections...');
  server.close(() => {
    console.log('✅ Server closed gracefully');
    process.exit(0);
  });
});
