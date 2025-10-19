import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getDatabase } from '../db/connection';

type ProjectRow = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

const db = getDatabase();

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

export const projectsRoute = new Hono();

projectsRoute.get('/', (c) => {
  const rows = db.prepare('SELECT id, name, created_at, updated_at FROM projects ORDER BY id ASC').all() as ProjectRow[];
  return c.json(rows);
});

projectsRoute.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch (error) {
    throw new HTTPException(400, { message: 'Invalid JSON payload' });
  }

  const name = requireName((body as Record<string, unknown>).name);
  const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
  const project = db
    .prepare('SELECT id, name, created_at, updated_at FROM projects WHERE id = ?')
    .get(result.lastInsertRowid as number) as ProjectRow | undefined;

  if (!project) {
    throw new HTTPException(500, { message: 'Failed to load created project' });
  }

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

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    const name = requireName(body.name);
    updates.push('name = ?');
    values.push(name);
  }

  if (updates.length === 0) {
    throw new HTTPException(400, { message: 'Nothing to update' });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const result = db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  if (result.changes === 0) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  const project = db
    .prepare('SELECT id, name, created_at, updated_at FROM projects WHERE id = ?')
    .get(id) as ProjectRow | undefined;

  if (!project) {
    throw new HTTPException(500, { message: 'Failed to load updated project' });
  }

  return c.json(project);
});

projectsRoute.delete('/:id', (c) => {
  const id = parseId(c.req.param('id'));
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);

  if (result.changes === 0) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  return c.body(null, 204);
});
