/**
 * Live API client — used when NEXT_PUBLIC_API_URL is set. Talks to the NestJS
 * backend (apps/api): POST /generate-film, GET /projects/:id/estimate, and the
 * Socket.IO realtime gateway. When the API URL is empty the Studio uses the
 * built-in demo simulator instead.
 */
import { API_URL } from "./system";

function authHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (token) h["authorization"] = `Bearer ${token}`;
  return h;
}

export async function createProject(
  body: { title: string; prompt: string; targetSeconds: number; aspectRatio?: string; modelId?: string },
  token?: string,
) {
  const res = await fetch(`${API_URL}/v1/projects`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createProject ${res.status}`);
  return res.json();
}

export async function getEstimate(projectId: string, token?: string) {
  const res = await fetch(`${API_URL}/v1/projects/${projectId}/estimate`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`estimate ${res.status}`);
  return res.json() as Promise<{ estimatedMs: number; creditsMs: number; affordable: boolean }>;
}

export async function generateFilm(projectId: string, token?: string) {
  const res = await fetch(`${API_URL}/v1/generate-film`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) throw new Error(`generate-film ${res.status}`);
  return res.json();
}
