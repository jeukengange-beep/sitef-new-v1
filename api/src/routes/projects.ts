import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { supabase } from '../db/connection.js';

const r = new Hono();

// GET /projects
r.get('/', async (c) => {
  const { data, error } = await supabase.from('projects').select('*').order('id', { ascending: false });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

// POST /projects {name}
r.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = String(body?.name || '').trim();
  if (!name) throw new HTTPException(400, { message: 'name required' });
  const { data, error } = await supabase.from('projects').insert([{ name }]).select().single();
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data, 201);
});

// PATCH /projects/:id {name?}
r.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const name = body?.name ? String(body.name).trim() : undefined;
  if (!id || !name) throw new HTTPException(400, { message: 'invalid payload' });
  const { data, error } = await supabase.from('projects').update({ name }).eq('id', id).select().single();
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

// DELETE /projects/:id
r.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!id) throw new HTTPException(400, { message: 'invalid id' });
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw new HTTPException(500, { message: error.message });
  return c.body(null, 204);
});

export default r;
