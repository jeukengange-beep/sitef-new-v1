import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getDatabase } from './db/connection';
import { projectsRoute } from './routes/projects';

const app = new Hono();

const allowedOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const status = err.status ?? 500;
    const message = err.message ?? 'Request error';
    return c.json({ error: message }, status);
  }

  return c.json({ error: 'Internal Server Error' }, 500);
});

const corsMiddleware = async (c: Context, next: () => Promise<void>) => {
  const requestOrigin = c.req.header('Origin');
  if (!requestOrigin || requestOrigin === allowedOrigin) {
    c.res.headers.set('Access-Control-Allow-Origin', requestOrigin ?? allowedOrigin);
  }
  c.res.headers.append('Vary', 'Origin');
  c.res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type');

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  await next();
};

app.use('*', corsMiddleware);

app.get('/health', (c) => c.json({ ok: true }));

app.route('/projects', projectsRoute);

app.post('/ai/complete', async (c) => {
  const prompt = await readPromptFromBody(c);

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new HTTPException(500, { message: 'OpenAI API key is not configured' });
  }

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: prompt,
      }),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    throw new HTTPException(502, { message: `Failed to reach OpenAI API: ${reason}` });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new HTTPException(502, { message: `OpenAI API error: ${errorText}` });
  }

  const result = (await response.json()) as Record<string, unknown>;

  const text = extractTextFromResponse(result);

  if (!text) {
    throw new HTTPException(500, { message: 'Unable to parse response from OpenAI' });
  }

  return c.json({ text });
});

app.post('/ai/gemini', async (c) => {
  const prompt = await readPromptFromBody(c);

  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new HTTPException(500, { message: 'Google API key is not configured' });
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      }),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    throw new HTTPException(502, { message: `Failed to reach Google AI API: ${reason}` });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new HTTPException(502, { message: `Google AI API error: ${errorText}` });
  }

  const result = (await response.json()) as Record<string, unknown>;

  const text = extractTextFromGeminiResponse(result);

  if (!text) {
    throw new HTTPException(500, { message: 'Unable to parse response from Google AI API' });
  }

  return c.json({ text });
});

const extractTextFromResponse = (payload: Record<string, unknown>): string | undefined => {
  const output = payload.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = (item as { content?: unknown }).content;
      if (Array.isArray(content)) {
        for (const part of content) {
          const text = (part as { type?: string; text?: string }).text;
          if (typeof text === 'string' && text.trim()) {
            return text.trim();
          }
        }
      }
    }
  }

  const choices = payload.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      const message = (choice as { message?: { content?: string } }).message;
      const content = message?.content;
      if (typeof content === 'string' && content.trim()) {
        return content.trim();
      }
    }
  }

  return undefined;
};

const extractTextFromGeminiResponse = (payload: Record<string, unknown>): string | undefined => {
  const candidates = payload.candidates;
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      const content = (candidate as { content?: { parts?: Array<{ text?: string }> } }).content;
      const parts = content?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          const text = part?.text;
          if (typeof text === 'string' && text.trim()) {
            return text.trim();
          }
        }
      }
    }
  }

  const promptFeedback = payload.promptFeedback as { safetyRatings?: Array<{ blocked?: boolean }> } | undefined;
  if (promptFeedback?.safetyRatings && Array.isArray(promptFeedback.safetyRatings)) {
    const blocked = promptFeedback.safetyRatings.some((rating) => rating?.blocked === true);
    if (blocked) {
      return undefined;
    }
  }

  return undefined;
};

const readPromptFromBody = async (c: Context): Promise<string> => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: 'Invalid JSON body' });
  }

  const prompt = typeof (body as { prompt?: unknown }).prompt === 'string' ? (body as { prompt: string }).prompt.trim() : '';

  if (!prompt) {
    throw new HTTPException(400, { message: 'Prompt is required' });
  }

  return prompt;
};

const port = Number.parseInt(process.env.PORT ?? '8787', 10);

getDatabase();

serve({
  fetch: app.fetch,
  port,
});

console.log(`API listening on :${port}`);
