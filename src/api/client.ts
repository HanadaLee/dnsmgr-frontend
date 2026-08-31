type ApiErrorBody = {
  code?: unknown
  message?: unknown
  details?: unknown
}

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export type ApiQuery = URLSearchParams | Record<string, string | number | boolean | null | undefined>

function queryString(query?: ApiQuery): string {
  if (!query) return ''
  if (query instanceof URLSearchParams) return query.toString()
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  return params.toString()
}

async function responseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) return undefined
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: { query?: ApiQuery; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const url = new URL(path, window.location.origin)
  const search = queryString(options.query)
  if (search) url.search = search

  let response: Response
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      signal: options.signal,
      headers: {
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    })
  } catch (error) {
    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      error instanceof Error ? error.message : '无法连接服务',
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

  if (body === undefined) return undefined as T
  if (!body || typeof body !== 'object') {
    throw new ApiClientError(502, 'INVALID_RESPONSE', '服务返回了无法识别的数据')
  }
  return body as T
}

export function apiGet<T>(path: string, query?: ApiQuery): Promise<T> {
  return apiRequest<T>('GET', path, { query })
}

export async function apiGetAll<T>(
  path: string,
  query: Record<string, string | number | boolean | null | undefined> = {},
): Promise<T[]> {
  const rows: T[] = []
  let page = 1
  while (true) {
    const response = await apiGet<{
      code: 'OK'
      data: T[]
      meta: { page: number; pageSize: number; total: number }
    }>(path, { ...query, page, pageSize: 100 })
    rows.push(...response.data)
    if (rows.length >= response.meta.total || response.data.length === 0) return rows
    page += 1
    if (page > 10_000) {
      throw new ApiClientError(502, 'INVALID_PAGINATION', '服务返回了无法识别的分页数据')
    }
  }
}

export function apiPost<T>(path: string, body?: unknown, query?: ApiQuery): Promise<T> {
  return apiRequest<T>('POST', path, { body, query })
}

export function apiPut<T>(path: string, body?: unknown, query?: ApiQuery): Promise<T> {
  return apiRequest<T>('PUT', path, { body, query })
}

export function apiPatch<T>(path: string, body?: unknown, query?: ApiQuery): Promise<T> {
  return apiRequest<T>('PATCH', path, { body, query })
}

export function apiDelete<T>(path: string, body?: unknown, query?: ApiQuery): Promise<T> {
  return apiRequest<T>('DELETE', path, { body, query })
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return '操作失败，请稍后重试'

  const internalDetail = /\b(?:cas|dnsmgr-helper|helper-session|legacy(?:[- _]upstream)?|upstream)\b|原\s*dnsmgr|上游|兼容层/i
  const errorCode = error instanceof ApiClientError ? error.code : ''
  if (internalDetail.test(`${errorCode} ${error.message}`)) {
    return '服务暂时无法完成请求，请稍后重试或联系管理员'
  }

  if (error instanceof ApiClientError && error.status === 0) {
    return '无法连接服务，请检查网络后重试'
  }

  return error.message
}

export function loginPathFromError(error: unknown): string | undefined {
  if (!(error instanceof ApiClientError) || error.status !== 401) return undefined
  if (!error.details || typeof error.details !== 'object') return '/login'
  const loginPath = (error.details as Record<string, unknown>).loginPath
  return typeof loginPath === 'string' && loginPath.startsWith('/') ? loginPath : '/login'
}
