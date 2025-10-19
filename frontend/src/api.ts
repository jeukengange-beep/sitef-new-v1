export interface Project {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/api';

const buildUrl = (path: string) => {
  if (!path.startsWith('/')) {
    return `${baseUrl}/${path}`;
  }
  return `${baseUrl}${path}`;
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(buildUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      try {
        body = await response.text();
      } catch {
        body = null;
      }
    }
    throw new ApiError(`Request failed with status ${response.status}`, response.status, body);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
};

export const listProjects = () => request<Project[]>('/projects');

export const createProject = (name: string) =>
  request<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name })
  });

export const updateProject = (id: number, payload: Partial<Pick<Project, 'name'>>) =>
  request<Project>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const deleteProject = (id: number) =>
  request<void>(`/projects/${id}`, {
    method: 'DELETE'
  });
