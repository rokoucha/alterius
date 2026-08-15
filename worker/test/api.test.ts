import type { Alias } from '@alterius/shared'
import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

describe('aliases API', () => {
  it('creates an eight-character alias on the configured domain', async () => {
    const response = await exports.default.fetch(
      'https://example.test/api/aliases',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serviceName: 'GitHub', note: 'personal' }),
      },
    )
    const { alias } = await json<{ alias: Alias }>(response)

    expect(response.status).toBe(201)
    expect(alias.local_part).toMatch(/^[a-z0-9]{8}$/)
    expect(alias.domain).toBe('8c7042.org')
    expect(alias).toMatchObject({
      service_name: 'GitHub',
      note: 'personal',
      status: 'active',
    })
  })

  it('lists, searches and updates aliases', async () => {
    const created = await exports.default.fetch(
      'https://example.test/api/aliases',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serviceName: 'Example Service' }),
      },
    )
    const { alias } = await json<{ alias: Alias }>(created)

    const search = await exports.default.fetch(
      'https://example.test/api/aliases?q=example',
    )
    expect((await json<{ aliases: Alias[] }>(search)).aliases).toHaveLength(1)

    const updated = await exports.default.fetch(
      `https://example.test/api/aliases/${alias.id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serviceName: 'Renamed', status: 'inactive' }),
      },
    )
    expect((await json<{ alias: Alias }>(updated)).alias).toMatchObject({
      service_name: 'Renamed',
      status: 'inactive',
    })

    const activeOnly = await exports.default.fetch(
      'https://example.test/api/aliases',
    )
    expect((await json<{ aliases: Alias[] }>(activeOnly)).aliases).toHaveLength(
      0,
    )
  })

  it('validates create requests', async () => {
    const response = await exports.default.fetch(
      'https://example.test/api/aliases',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serviceName: '' }),
      },
    )

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({
      error: 'Service name must be between 1 and 120 characters',
    })
  })

  it('permanently deletes an alias', async () => {
    const created = await exports.default.fetch(
      'https://example.test/api/aliases',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serviceName: 'Delete me' }),
      },
    )
    const { alias } = await json<{ alias: Alias }>(created)

    const deleted = await exports.default.fetch(
      `https://example.test/api/aliases/${alias.id}`,
      { method: 'DELETE' },
    )
    expect(deleted.status).toBe(200)
    expect(await json(deleted)).toEqual({ deleted: true })

    const missing = await exports.default.fetch(
      `https://example.test/api/aliases/${alias.id}`,
      { method: 'DELETE' },
    )
    expect(missing.status).toBe(404)

    const aliases = await exports.default.fetch(
      'https://example.test/api/aliases?includeInactive=true',
    )
    expect((await json<{ aliases: Alias[] }>(aliases)).aliases).toHaveLength(0)
  })

  it('imports valid rows and reports invalid and duplicate rows', async () => {
    const payload = {
      aliases: [
        {
          localPart: 'first.alias',
          serviceName: 'First',
          note: '',
          status: 'active',
        },
        {
          localPart: 'bad@alias',
          serviceName: 'Bad',
          note: '',
          status: 'active',
        },
        {
          localPart: 'first.alias',
          serviceName: 'Duplicate',
          note: '',
          status: 'active',
        },
      ],
    }
    const first = await exports.default.fetch(
      'https://example.test/api/aliases/import',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      },
    )

    expect(await json(first)).toEqual({
      imported: 1,
      duplicates: 0,
      invalid: [
        { row: 2, reason: 'Invalid local part' },
        { row: 3, reason: 'Duplicate in CSV' },
      ],
    })

    const second = await exports.default.fetch(
      'https://example.test/api/aliases/import',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ aliases: payload.aliases.slice(0, 1) }),
      },
    )
    expect(await json(second)).toMatchObject({ imported: 0, duplicates: 1 })
  })
})
