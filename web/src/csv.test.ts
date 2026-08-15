import { describe, expect, it } from 'vitest'
import { prepareAddyImport } from './csv'

describe('prepareAddyImport', () => {
  it('maps Addy email, description and active state', () => {
    const result = prepareAddyImport(`Email,Description,Active
random123@anonaddy.me,GitHub,true
old.alias@example.test,Old service,false`)

    expect(result).toEqual([
      {
        localPart: 'random123',
        serviceName: 'GitHub',
        note: 'Addy.ioから移行',
        status: 'active',
      },
      {
        localPart: 'old.alias',
        serviceName: 'Old service',
        note: 'Addy.ioから移行',
        status: 'inactive',
      },
    ])
  })

  it('supports quoted commas and escaped quotes', () => {
    const [result] = prepareAddyImport(
      'alias,description,status\nfoo@example.test,"Example, ""Inc.""",enabled',
    )

    expect(result.serviceName).toBe('Example, "Inc."')
    expect(result.status).toBe('active')
  })

  it('falls back to the local part when description is empty', () => {
    const [result] = prepareAddyImport(
      'address,description\nservice@example.test,',
    )

    expect(result).toMatchObject({
      localPart: 'service',
      serviceName: 'service',
      note: 'Addy.ioから移行（サービス名未設定）',
    })
  })

  it('rejects CSV without an address-like column', () => {
    expect(() => prepareAddyImport('description,active\nGitHub,true')).toThrow(
      'メールアドレス列を見つけられません',
    )
  })
})
