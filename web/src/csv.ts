import type { ImportAliasInput } from '@alterius/shared'

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const input = text.replace(/^\uFEFF/, '')
  for (let index = 0; index < input.length; index++) {
    const char = input[index]
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"'
        index++
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"' && field === '') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') field += char
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((item) => item.some((value) => value.trim()))
}

function findColumn(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) => candidates.includes(header))
}

function parseActive(value: string): 'active' | 'inactive' {
  return /^(false|0|no|inactive|disabled)$/i.test(value.trim())
    ? 'inactive'
    : 'active'
}

export function prepareAddyImport(text: string): ImportAliasInput[] {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('CSVにデータ行がありません')
  const headers = rows[0].map((value) =>
    value.trim().toLowerCase().replace(/[ _-]/g, ''),
  )
  const addressIndex = findColumn(headers, [
    'email',
    'alias',
    'address',
    'emailaddress',
    'aliasemail',
  ])
  const localIndex = findColumn(headers, ['localpart', 'username'])
  const descriptionIndex = findColumn(headers, [
    'description',
    'service',
    'servicename',
    'name',
  ])
  const activeIndex = findColumn(headers, [
    'active',
    'isactive',
    'status',
    'enabled',
  ])
  if (addressIndex < 0 && localIndex < 0) {
    throw new Error(
      'メールアドレス列を見つけられません（email / alias / address）',
    )
  }

  return rows.slice(1).flatMap((row) => {
    const address = (row[addressIndex] || '').trim().toLowerCase()
    const localPart = (
      localIndex >= 0 ? row[localIndex] : address.split('@')[0] || ''
    )
      .trim()
      .toLowerCase()
    if (!localPart) return []
    const description =
      descriptionIndex >= 0 ? (row[descriptionIndex] || '').trim() : ''
    return [
      {
        localPart,
        serviceName: description || localPart,
        note: description
          ? 'Addy.ioから移行'
          : 'Addy.ioから移行（サービス名未設定）',
        status:
          activeIndex >= 0 ? parseActive(row[activeIndex] || '') : 'active',
      },
    ]
  })
}
