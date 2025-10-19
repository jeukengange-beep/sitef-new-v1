import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { PostgrestError } from '@supabase/supabase-js';
import { getSupabaseClient } from '../db/connection';

type ProjectRow = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

const supabase = getSupabaseClient();

const parseId = (value: string) => {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HTTPException(400, { message: 'Invalid project id' });
  }
  return id;
};

const requireName = (input: unknown) => {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new HTTPException(400, { message: 'Name is required' });
  }
  return input.trim();
};

const handleSupabaseError = (error: PostgrestError) => {
  throw new HTTPException(500, { message: `Supabase error: ${error.message}` });
};

export const projectsRoute = new Hono();

projectsRoute.get('/', async (c) => {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, created_at, updated_at')
    .order('id', { ascending: true });

  if (error) {
    handleSupabaseError(error);
  }

  return c.json(data ?? []);
});

projectsRoute.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch (error) {
    throw new HTTPException(400, { message: 'Invalid JSON payload' });
  }

  const name = requireName((body as Record<string, unknown>).name);

  const { data, error } = await supabase
    .from('projects')
    .insert({ name })
    .select('id, name, created_at, updated_at')
    .single();

  if (error) {
    handleSupabaseError(error);
  }

  if (!data) {
    throw new HTTPException(500, { message: 'Failed to load created project' });
  }

  const project = data as ProjectRow;

  return c.json(project, 201);
});

projectsRoute.patch('/:id', async (c) => {
  const id = parseId(c.req.param('id'));

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch (error) {
    throw new HTTPException(400, { message: 'Invalid JSON payload' });
  }

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = requireName(body.name);
    updates.name = name;
  }

  if (Object.keys(updates).length === 0) {
    throw new HTTPException(400, { message: 'Nothing to update' });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select('id, name, created_at, updated_at')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new HTTPException(404, { message: 'Project not found' });
    }

    handleSupabaseError(error);
  }

  if (!data) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  const project = data as ProjectRow;

  return c.json(project);
});

projectsRoute.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'));

  const { data, error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    handleSupabaseError(error);
  }

  if (!data) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  return c.body(null, 204);
});
