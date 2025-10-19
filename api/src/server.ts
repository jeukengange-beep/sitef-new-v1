import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getSupabaseClient } from './db/connection';
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

  let response: Awaited<ReturnType<typeof fetch>>;
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

  const payload = (await response.json()) as AzureSearchResponse;
  const hits = Array.isArray(payload.value) ? payload.value.map(normalizeAzureHit) : [];

  return c.json({ hits });
});

app.get('/media/pexels', async (c) => {
  const query = c.req.query('query')?.trim();

  if (!query) {
    throw new HTTPException(400, { message: 'Query parameter "query" is required' });
  }

  const page = parsePositiveInt(c.req.query('page'), 1);
  const perPage = parsePositiveInt(c.req.query('per_page'), 10);

  const apiKey = process.env.PEXELS_API_KEY;

  if (!apiKey) {
    throw new HTTPException(500, { message: 'Pexels API key is not configured' });
  }

  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(perPage));

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(url, {
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

  const payload = (await response.json()) as PexelsSearchResponse;

  return c.json(normalizePexelsResponse(payload, page, perPage));
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

type AzureSearchHit = Record<string, unknown> & {
  '@search.score'?: number;
  '@search.highlights'?: Record<string, unknown>;
  '@search.documentId'?: string;
};

type AzureSearchResponse = {
  value?: AzureSearchHit[];
};

type NormalizedHighlightRecord = Record<string, string[]>;

type NormalizedAzureHit = {
  id?: string;
  score?: number;
  highlights?: NormalizedHighlightRecord;
  document: Record<string, unknown>;
};

const normalizeAzureHit = (hit: AzureSearchHit): NormalizedAzureHit => {
  const {
    ['@search.score']: score,
    ['@search.highlights']: highlights,
    ['@search.documentId']: documentId,
    ...document
  } = hit;

  const normalizedHighlights = normalizeHighlights(highlights);

  const idCandidate =
    typeof document.id === 'string'
      ? (document.id as string)
      : typeof document.key === 'string'
      ? (document.key as string)
      : typeof documentId === 'string'
      ? documentId
      : undefined;

  return {
    id: idCandidate,
    score: typeof score === 'number' ? score : undefined,
    highlights: normalizedHighlights,
    document: document as Record<string, unknown>,
  };
};

const normalizeHighlights = (value: unknown): NormalizedHighlightRecord | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const result: NormalizedHighlightRecord = {};

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(raw)) {
      continue;
    }

    const strings = raw.filter((item): item is string => typeof item === 'string');
    if (strings.length > 0) {
      result[key] = strings;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

type PexelsPhotoSrc = {
  original?: string;
  large?: string;
  medium?: string;
  small?: string;
};

type PexelsPhoto = {
  id?: number;
  photographer?: string;
  url?: string;
  src?: PexelsPhotoSrc;
};

type PexelsSearchResponse = {
  photos?: PexelsPhoto[];
  page?: number;
  per_page?: number;
  total_results?: number;
};

type NormalizedPexelsPhoto = {
  id?: number;
  photographer?: string;
  url?: string;
  src: {
    original?: string;
    large?: string;
    medium?: string;
    small?: string;
  };
};

type NormalizedPexelsResponse = {
  photos: NormalizedPexelsPhoto[];
  page: number;
  per_page: number;
  total_results: number;
};

const normalizePexelsResponse = (
  payload: PexelsSearchResponse,
  fallbackPage: number,
  fallbackPerPage: number,
): NormalizedPexelsResponse => {
  const photos = Array.isArray(payload.photos)
    ? payload.photos.map(normalizePexelsPhoto).filter((photo): photo is NormalizedPexelsPhoto => Boolean(photo))
    : [];

  const page = typeof payload.page === 'number' && payload.page > 0 ? payload.page : fallbackPage;
  const perPage = typeof payload.per_page === 'number' && payload.per_page > 0 ? payload.per_page : fallbackPerPage;
  const totalResults = typeof payload.total_results === 'number' && payload.total_results >= 0 ? payload.total_results : photos.length;

  return {
    photos,
    page,
    per_page: perPage,
    total_results: totalResults,
  };
};

const normalizePexelsPhoto = (photo: PexelsPhoto): NormalizedPexelsPhoto | undefined => {
  if (!photo || typeof photo !== 'object') {
    return undefined;
  }

  const id = typeof photo.id === 'number' ? photo.id : undefined;
  const photographer = typeof photo.photographer === 'string' ? photo.photographer : undefined;
  const url = typeof photo.url === 'string' ? photo.url : undefined;
  const src = normalizePexelsPhotoSrc(photo.src);

  return {
    id,
    photographer,
    url,
    src,
  };
};

const normalizePexelsPhotoSrc = (src: PexelsPhotoSrc | undefined): NormalizedPexelsPhoto['src'] => {
  const result: NormalizedPexelsPhoto['src'] = {};

  if (src && typeof src === 'object') {
    if (typeof src.original === 'string') {
      result.original = src.original;
    }
    if (typeof src.large === 'string') {
      result.large = src.large;
    }
    if (typeof src.medium === 'string') {
      result.medium = src.medium;
    }
    if (typeof src.small === 'string') {
      result.small = src.small;
    }
  }

  return result;
};

const port = Number.parseInt(process.env.PORT ?? '8787', 10);

getSupabaseClient();

serve({
  fetch: app.fetch,
  port,
});

console.log(`API listening on :${port}`);
