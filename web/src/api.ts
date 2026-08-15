import type {
  Alias,
  ApiError,
  CreateAliasInput,
  ImportAliasInput,
  ImportResult,
  UpdateAliasInput,
} from '@alterius/shared'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body
      ? { 'content-type': 'application/json', ...init.headers }
      : init?.headers,
  })
  const body = (await response.json()) as T | ApiError
  if (!response.ok) {
    const message =
      body !== null && typeof body === 'object' && 'error' in body
        ? String(body.error)
        : 'リクエストに失敗しました'
    throw new Error(message)
  }
  return body as T
}

export const aliasesApi = {
  list(query: string) {
    const params = new URLSearchParams({
      q: query,
      includeInactive: 'false',
    })
    return request<{ aliases: Alias[] }>(`/api/aliases?${params}`)
  },
  create(input: CreateAliasInput) {
    return request<{ alias: Alias }>('/api/aliases', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  update(id: string, input: UpdateAliasInput) {
    return request<{ alias: Alias }>(`/api/aliases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  delete(id: string) {
    return request<{ deleted: true }>(`/api/aliases/${id}`, {
      method: 'DELETE',
    })
  },
  import(input: ImportAliasInput[]) {
    return request<ImportResult>('/api/aliases/import', {
      method: 'POST',
      body: JSON.stringify({ aliases: input }),
    })
  },
}
