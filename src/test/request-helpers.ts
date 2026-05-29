import { expect } from "vitest";

const BASE_URL = "http://localhost:3100";

/** Build a GET request with optional query params */
export function buildGet(
  path: string,
  query?: Record<string, string>,
): Request {
  const url = new URL(path, BASE_URL);
  if (query) {
    Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new Request(url);
}

/** Build a POST/PUT/PATCH/DELETE request with JSON body */
export function buildJson(
  method: string,
  path: string,
  body?: unknown,
): Request {
  return new Request(new URL(path, BASE_URL), {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers:
      body !== undefined ? { "Content-Type": "application/json" } : undefined,
  });
}

/** Build Next.js dynamic route params */
export function buildParams<T extends Record<string, string>>(
  params: T,
): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}

/** Parse JSON response with status assertion */
export async function parseResponse<T = unknown>(
  response: Response,
  expectedStatus = 200,
): Promise<T> {
  expect(response.status).toBe(expectedStatus);
  return response.json() as Promise<T>;
}
