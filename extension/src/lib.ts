export interface Alias {
  id: string
  local_part: string
  domain: string
  service_name: string
  note: string
  created_at: string
}

interface BrowserApi {
  storage: {
    local: {
      get(defaults: Record<string, unknown>): Promise<Record<string, unknown>>
      set(values: Record<string, unknown>): Promise<void>
    }
  }
  runtime: { openOptionsPage(): Promise<void> }
  tabs: {
    create(options: { url: string }): Promise<unknown>
    query(options: {
      active: boolean
      currentWindow: boolean
    }): Promise<Array<{ url?: string }>>
  }
}

declare global {
  var browser: BrowserApi | undefined
  var chrome: BrowserApi | undefined
}

const detectedBrowserApi = globalThis.browser ?? globalThis.chrome
if (!detectedBrowserApi) throw new Error('WebExtension APIが利用できません')
export const browserApi: BrowserApi = detectedBrowserApi

export async function getSettings(): Promise<{ apiBaseUrl: string }> {
  const values = await browserApi.storage.local.get({ apiBaseUrl: '' })
  return { apiBaseUrl: String(values.apiBaseUrl || '').replace(/\/$/, '') }
}

export async function saveSettings(apiBaseUrl: string): Promise<string> {
  const normalized = apiBaseUrl.trim().replace(/\/$/, '')
  if (normalized && !/^https?:\/\//i.test(normalized))
    throw new Error('http:// または https:// から始まるURLを入力してください')
  await browserApi.storage.local.set({ apiBaseUrl: normalized })
  return normalized
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiBaseUrl } = await getSettings()
  if (!apiBaseUrl) throw new Error('先にAPI URLを設定してください')
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: init?.body
      ? { 'content-type': 'application/json', ...init.headers }
      : init?.headers,
  })
  if (
    !(response.headers.get('content-type') || '').includes('application/json')
  )
    throw new Error(
      'ログインが必要です。設定からログインページを開いてください',
    )
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!response.ok)
    throw new Error(body.error || `通信に失敗しました (${response.status})`)
  return body
}

export function addressOf(alias: Pick<Alias, 'local_part' | 'domain'>): string {
  return `${alias.local_part}@${alias.domain}`
}

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '予期しないエラーが発生しました'
}

export function mustQuery<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`${selector} が見つかりません`)
  return element
}
