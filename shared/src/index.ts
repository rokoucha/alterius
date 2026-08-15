export type AliasStatus = 'active' | 'inactive'

export interface Alias {
  id: string
  local_part: string
  domain: string
  service_name: string
  note: string
  status: AliasStatus
  created_at: string
  updated_at: string
}

export interface CreateAliasInput {
  serviceName: string
  note?: string
  domain?: string
}

export interface UpdateAliasInput {
  serviceName?: string
  note?: string
  status?: AliasStatus
}

export interface ImportAliasInput {
  localPart: string
  serviceName: string
  note: string
  status: AliasStatus
}

export interface ImportResult {
  imported: number
  duplicates: number
  invalid: Array<{ row: number; reason: string }>
}

export interface ApiError {
  error: string
}

export function aliasAddress(
  alias: Pick<Alias, 'local_part' | 'domain'>,
): string {
  return `${alias.local_part}@${alias.domain}`
}
