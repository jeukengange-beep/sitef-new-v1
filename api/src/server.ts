import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { getDatabase } from './db/connection';
import { projectsRoute } from './routes/projects';

const app = new Hono();

const allowedOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

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

const port = Number.parseInt(process.env.PORT ?? '8787', 10);

getDatabase();

serve({
  fetch: app.fetch,
  port,
});

console.log(`API listening on :${port}`);
