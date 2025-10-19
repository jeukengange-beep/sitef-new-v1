import 'dotenv/config';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { serve } from '@hono/node-server';
import projects from './routes/projects.js';
import { supabase } from './db/connection.js';

const app = new Hono();

const ORIGIN = process.env.CORS_ORIGIN || '*';
app.use('*', async (c, next) => {
  c.res.headers.set('Access-Control-Allow-Origin', ORIGIN);
  c.res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  c.res.headers.append('Vary', 'Origin');

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  return next();
});

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  console.error(err);
  return c.json({ error: 'server_error' }, 500);
});

if (supabase) {
  console.log('DB=supabase');
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();

const readPromptFromBody = async (c: Context) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch (error) {
    throw new HTTPException(400, { message: 'Invalid JSON payload' });
  }

  const prompt = (body as Record<string, unknown>).prompt;

  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new HTTPException(400, { message: 'Prompt is required' });
  }

  return prompt.trim();
};

const enforceRateLimit = (c: Context) => {
  const identifier = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip') ?? c.req.header('x-real-ip') ?? c.req.header('x-client-ip') ?? c.req.header('x-appengine-user-ip') ?? c.req.header('x-forwarded-host') ?? c.req.header('x-forwarded-proto') ?? c.req.header('x-request-id') ?? c.req.header('x-api-key') ?? c.req.header('authorization') ?? c.req.header('host') ?? 'anonymous';
  const now = Date.now();
  const record = rateLimitBuckets.get(identifier);

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(identifier, { count: 1, windowStart: now });
    return;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    throw new HTTPException(429, { message: 'Too many requests' });
  }

  record.count += 1;
  rateLimitBuckets.set(identifier, record);
};

const extractTextFromResponse = (payload: Record<string, unknown>) => {
  const output = payload.output as unknown;
  if (!Array.isArray(output)) {
    return undefined;
  }

  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!part || typeof part !== 'object') {
        continue;
      }

      const text = (part as Record<string, unknown>).text;
      if (typeof text === 'string' && text.trim().length > 0) {
        return text.trim();
      }
    }
  }

  return undefined;
};

const extractTextFromGeminiResponse = (payload: Record<string, unknown>) => {
  const candidates = payload.candidates as unknown;
  if (!Array.isArray(candidates)) {
    return undefined;
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }

    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== 'object') {
      continue;
    }

    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) {
      continue;
    }

    for (const part of parts) {
      if (!part || typeof part !== 'object') {
        continue;
      }

      const text = (part as Record<string, unknown>).text;
      if (typeof text === 'string' && text.trim().length > 0) {
        return text.trim();
      }
    }
  }

  return undefined;
};

const normalisePexelsPhoto = (photo: Record<string, unknown>) => {
  const id = typeof photo.id === 'number' ? photo.id : undefined;
  const photographer = typeof photo.photographer === 'string' ? photo.photographer : undefined;
  const url = typeof photo.url === 'string' ? photo.url : undefined;
  const src = (photo.src ?? {}) as Record<string, unknown>;

  return {
    id,
    photographer,
    url,
    src: {
      original: typeof src.original === 'string' ? src.original : undefined,
      large: typeof src.large === 'string' ? src.large : undefined,
      medium: typeof src.medium === 'string' ? src.medium : undefined,
      small: typeof src.small === 'string' ? src.small : undefined,
    },
  };
};

app.get('/health', (c) => c.json({ ok: true }));

app.route('/projects', projects);

app.post('/ai/complete', async (c) => {
  enforceRateLimit(c);

  const prompt = await readPromptFromBody(c);

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new HTTPException(500, { message: 'OpenAI API key is not configured' });
  }

  let response: Response;
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

  let response: Response;
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

app.get('/search', async (c) => {
  const query = c.req.query('q')?.trim();

  if (!query) {
    throw new HTTPException(400, { message: 'Query parameter "q" is required' });
  }

  const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
  const apiKey = process.env.AZURE_SEARCH_API_KEY;
  const index = process.env.AZURE_SEARCH_INDEX;

  if (!endpoint || !apiKey || !index) {
    throw new HTTPException(500, {
      message: 'Azure Search configuration is incomplete',
    });
  }

  const baseEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
  const searchUrl = `${baseEndpoint}/indexes/${encodeURIComponent(index)}/docs/search?api-version=2023-11-01`;

  let response: Response;
  try {
    response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        search: query,
        top: 10,
      }),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    throw new HTTPException(502, { message: `Failed to reach Azure AI Search: ${reason}` });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new HTTPException(502, {
      message: `Azure AI Search error: ${errorText}`,
    });
  }

  const result = (await response.json()) as Record<string, unknown>;
  const hits = Array.isArray(result.value)
    ? result.value.map((item) => {
        if (!item || typeof item !== 'object') {
          return {};
        }
        const record = item as Record<string, unknown>;
        return {
          id: record['@search.document'] ?? record.id ?? record.key,
          score: record['@search.score'],
          ...record,
        };
      })
    : [];

  return c.json({ hits });
});

app.get('/media/pexels', async (c) => {
  const query = c.req.query('query')?.trim();
  if (!query) {
    throw new HTTPException(400, { message: 'Query parameter "query" is required' });
  }

  const page = Number.parseInt(c.req.query('page') ?? '1', 10);
  const perPage = Number.parseInt(c.req.query('per_page') ?? '10', 10);

  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new HTTPException(500, { message: 'Pexels API key is not configured' });
  }

  const searchUrl = new URL('https://api.pexels.com/v1/search');
  searchUrl.searchParams.set('query', query);
  searchUrl.searchParams.set('page', Number.isFinite(page) && page > 0 ? String(page) : '1');
  searchUrl.searchParams.set('per_page', Number.isFinite(perPage) && perPage > 0 ? String(perPage) : '10');

  let response: Response;
  try {
    response = await fetch(searchUrl, {
      headers: {
        Authorization: apiKey,
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    throw new HTTPException(502, { message: `Failed to reach Pexels API: ${reason}` });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new HTTPException(502, { message: `Pexels API error: ${errorText}` });
  }

  const result = (await response.json()) as Record<string, unknown>;
  const photos = Array.isArray(result.photos)
    ? result.photos.map((photo) => normalisePexelsPhoto((photo ?? {}) as Record<string, unknown>))
    : [];

  return c.json({
    photos,
    page: typeof result.page === 'number' ? result.page : page,
    per_page: typeof result.per_page === 'number' ? result.per_page : perPage,
    total_results: typeof result.total_results === 'number' ? result.total_results : photos.length,
  });
});

const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port }, () => {
  console.log(`API up on :${port}`);
});
