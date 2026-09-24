export type CurrentUser = { id: string; email: string; roles: string[] }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

let antiforgeryToken: string | null = null

async function getAntiforgeryToken(): Promise<string> {
  const response = await fetch('/api/account/antiforgery', { credentials: 'include' })
  if (!response.ok) throw new ApiError(response.status, 'Could not establish request protection.')
  const body = await response.json() as { token: string }
  return body.token
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const changesState = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (changesState) {
    antiforgeryToken ??= await getAntiforgeryToken()
    headers.set('X-XSRF-TOKEN', antiforgeryToken)
  }
  const response = await fetch(path, { ...init, headers, credentials: 'include' })
  // Tokens are identity-bound; fetch a fresh one after every state change (especially login/logout).
  if (changesState) antiforgeryToken = null
  if (response.status === 204) return undefined as T
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { title?: string; error?: string } | null
    throw new ApiError(response.status, problem?.title ?? problem?.error ?? `Request failed (${response.status}).`)
  }
  return response.json() as Promise<T>
}
