import type { Alias, AliasStatus } from '@alterius/shared'

export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  ALIAS_DOMAIN: string
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }
const LOCAL_PART_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const MAX_GENERATION_ATTEMPTS = 8

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status)
}

function randomLocalPart(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(
    bytes,
    (byte) => LOCAL_PART_ALPHABET[byte % LOCAL_PART_ALPHABET.length],
  ).join('')
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, '')
}

function isValidDomain(value: string): boolean {
  return (
    value.length <= 253 &&
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      value,
    )
  )
}

function isValidLocalPart(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 64 &&
    !value.startsWith('.') &&
    !value.endsWith('.') &&
    !value.includes('..') &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(value)
  )
}

async function readBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

async function listAliases(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 100)
  const includeInactive = url.searchParams.get('includeInactive') === 'true'
  const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`
  const result = await env.DB.prepare(
    `
    SELECT * FROM aliases
    WHERE (?1 = 1 OR status = 'active')
      AND (?2 = '' OR service_name LIKE ?3 ESCAPE '\\' COLLATE NOCASE
        OR local_part LIKE ?3 ESCAPE '\\' COLLATE NOCASE
        OR note LIKE ?3 ESCAPE '\\' COLLATE NOCASE)
    ORDER BY created_at DESC
    LIMIT 500
  `,
  )
    .bind(includeInactive ? 1 : 0, query, pattern)
    .all<Alias>()
  return json({ aliases: result.results })
}

async function createAlias(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request)
  if (!body) return error('Invalid JSON body')

  const serviceName =
    typeof body.serviceName === 'string' ? body.serviceName.trim() : ''
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  const domain = normalizeDomain(
    typeof body.domain === 'string' && body.domain.trim()
      ? body.domain
      : (env.ALIAS_DOMAIN ?? ''),
  )

  if (!serviceName || serviceName.length > 120)
    return error('Service name must be between 1 and 120 characters')
  if (note.length > 1000) return error('Note must be 1000 characters or fewer')
  if (!isValidDomain(domain)) return error('A valid alias domain is required')

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const now = new Date().toISOString()
    const alias: Alias = {
      id: crypto.randomUUID(),
      local_part: randomLocalPart(),
      domain,
      service_name: serviceName,
      note,
      status: 'active',
      created_at: now,
      updated_at: now,
    }

    try {
      await env.DB.prepare(
        `
        INSERT INTO aliases (id, local_part, domain, service_name, note, status, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      `,
      )
        .bind(
          alias.id,
          alias.local_part,
          alias.domain,
          alias.service_name,
          alias.note,
          alias.status,
          alias.created_at,
          alias.updated_at,
        )
        .run()
      return json({ alias }, 201)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      if (!message.includes('UNIQUE constraint failed')) throw cause
    }
  }

  return error('Could not generate a unique alias. Please try again', 503)
}

async function importAliases(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request)
  if (!body || !Array.isArray(body.aliases))
    return error('Aliases must be an array')
  if (body.aliases.length === 0 || body.aliases.length > 200) {
    return error('Import between 1 and 200 aliases per request')
  }

  const domain = normalizeDomain(env.ALIAS_DOMAIN ?? '')
  if (!isValidDomain(domain)) return error('A valid alias domain is required')

  const valid: Array<{
    id: string
    localPart: string
    serviceName: string
    note: string
    status: AliasStatus
    createdAt: string
  }> = []
  const invalid: Array<{ row: number; reason: string }> = []
  const seen = new Set<string>()

  body.aliases.forEach((raw, index) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      invalid.push({ row: index + 1, reason: 'Invalid row' })
      return
    }
    const item = raw as Record<string, unknown>
    const localPart =
      typeof item.localPart === 'string'
        ? item.localPart.trim().toLowerCase()
        : ''
    const serviceName =
      typeof item.serviceName === 'string' ? item.serviceName.trim() : ''
    const note = typeof item.note === 'string' ? item.note.trim() : ''
    const status: AliasStatus =
      item.status === 'inactive' ? 'inactive' : 'active'

    if (!isValidLocalPart(localPart))
      invalid.push({ row: index + 1, reason: 'Invalid local part' })
    else if (!serviceName || serviceName.length > 120)
      invalid.push({ row: index + 1, reason: 'Invalid service name' })
    else if (note.length > 1000)
      invalid.push({ row: index + 1, reason: 'Note is too long' })
    else if (seen.has(localPart))
      invalid.push({ row: index + 1, reason: 'Duplicate in CSV' })
    else {
      seen.add(localPart)
      valid.push({
        id: crypto.randomUUID(),
        localPart,
        serviceName,
        note,
        status,
        createdAt: new Date().toISOString(),
      })
    }
  })

  const inserted = new Set<string>()
  const statements: D1PreparedStatement[] = []
  for (let offset = 0; offset < valid.length; offset += 10) {
    const chunk = valid.slice(offset, offset + 10)
    const placeholders = chunk
      .map((_, index) => {
        const start = index * 8 + 1
        return `(?${start}, ?${start + 1}, ?${start + 2}, ?${start + 3}, ?${start + 4}, ?${start + 5}, ?${start + 6}, ?${start + 7})`
      })
      .join(', ')
    const values = chunk.flatMap((item) => [
      item.id,
      item.localPart,
      domain,
      item.serviceName,
      item.note,
      item.status,
      item.createdAt,
      item.createdAt,
    ])
    statements.push(
      env.DB.prepare(
        `
      INSERT OR IGNORE INTO aliases
        (id, local_part, domain, service_name, note, status, created_at, updated_at)
      VALUES ${placeholders}
      RETURNING local_part
    `,
      ).bind(...values),
    )
  }

  if (statements.length) {
    const results = await env.DB.batch<{ local_part: string }>(statements)
    for (const result of results) {
      for (const row of result.results) inserted.add(row.local_part)
    }
  }

  return json({
    imported: inserted.size,
    duplicates: valid.length - inserted.size,
    invalid,
  })
}

async function updateAlias(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const body = await readBody(request)
  if (!body) return error('Invalid JSON body')

  const existing = await env.DB.prepare('SELECT * FROM aliases WHERE id = ?1')
    .bind(id)
    .first<Alias>()
  if (!existing) return error('Alias not found', 404)

  const serviceName =
    typeof body.serviceName === 'string'
      ? body.serviceName.trim()
      : existing.service_name
  const note = typeof body.note === 'string' ? body.note.trim() : existing.note
  const status =
    body.status === 'active' || body.status === 'inactive'
      ? body.status
      : existing.status
  if (!serviceName || serviceName.length > 120)
    return error('Service name must be between 1 and 120 characters')
  if (note.length > 1000) return error('Note must be 1000 characters or fewer')

  const updatedAt = new Date().toISOString()
  await env.DB.prepare(
    `
    UPDATE aliases SET service_name = ?1, note = ?2, status = ?3, updated_at = ?4 WHERE id = ?5
  `,
  )
    .bind(serviceName, note, status, updatedAt, id)
    .run()

  return json({
    alias: {
      ...existing,
      service_name: serviceName,
      note,
      status,
      updated_at: updatedAt,
    },
  })
}

async function deleteAlias(env: Env, id: string): Promise<Response> {
  const result = await env.DB.prepare('DELETE FROM aliases WHERE id = ?1')
    .bind(id)
    .run()
  if (!result.meta.changes) return error('Alias not found', 404)
  return json({ deleted: true })
}

async function routeApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname === '/api/aliases' && request.method === 'GET')
    return listAliases(request, env)
  if (url.pathname === '/api/aliases' && request.method === 'POST')
    return createAlias(request, env)
  if (url.pathname === '/api/aliases/import' && request.method === 'POST')
    return importAliases(request, env)

  const match = url.pathname.match(/^\/api\/aliases\/([0-9a-f-]+)$/i)
  if (match && request.method === 'PATCH')
    return updateAlias(request, env, match[1])
  if (match && request.method === 'DELETE') return deleteAlias(env, match[1])
  return error('Not found', 404)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url)
      if (url.pathname.startsWith('/api/')) return await routeApi(request, env)
      return env.ASSETS.fetch(request)
    } catch (cause) {
      console.error(cause)
      return error('Internal server error', 500)
    }
  },
} satisfies ExportedHandler<Env>
