type ApiErrorBody = {
  code?: unknown
  message?: unknown
  details?: unknown
}

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function responseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) return undefined

  try {
    return await response.json()
  } catch {
    return undefined
  }
}

export async function apiGet<T>(path: string, query?: URLSearchParams): Promise<T> {
  const url = new URL(path, window.location.origin)
  if (query) url.search = query.toString()

  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    })
  } catch (error) {
    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      error instanceof Error ? error.message : '无法连接 dnsmgr-helper',
    )
  }

  const body = await responseBody(response)
  if (!response.ok) {
    const error = body && typeof body === 'object' ? body as ApiErrorBody : undefined
    throw new ApiClientError(
      response.status,
      typeof error?.code === 'string' ? error.code : `HTTP_${response.status}`,
      typeof error?.message === 'string' ? error.message : `请求失败（HTTP ${response.status}）`,
      error?.details,
    )
  }

  if (!body || typeof body !== 'object') {
    throw new ApiClientError(502, 'INVALID_RESPONSE', '兼容层返回了无法识别的数据')
  }

  return body as T
}

export function loginPathFromError(error: unknown): string | undefined {
  if (!(error instanceof ApiClientError) || error.status !== 401) return undefined
  if (!error.details || typeof error.details !== 'object') return '/cas/login'
  const loginPath = (error.details as Record<string, unknown>).loginPath
  return typeof loginPath === 'string' && loginPath.startsWith('/') ? loginPath : '/cas/login'
}
