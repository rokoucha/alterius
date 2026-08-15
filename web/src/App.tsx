import type { Alias, ImportAliasInput } from '@alterius/shared'
import { aliasAddress } from '@alterius/shared'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { aliasesApi } from './api'
import { prepareAddyImport } from './csv'

const ALIAS_DOMAIN = '8c7042.org'
const logoUrl = new URL('../../extension/icons/icon-128.png', import.meta.url)
  .href

function initialTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : '予期しないエラーが発生しました'
}

async function copyAlias(alias: Alias): Promise<string> {
  const address = aliasAddress(alias)
  await navigator.clipboard.writeText(address)
  return address
}

interface AliasCardProps {
  alias: Alias
  onEdit: (alias: Alias) => void
  onDelete: (alias: Alias) => Promise<void>
}

function AliasCard({ alias, onEdit, onDelete }: AliasCardProps) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await copyAlias(alias)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      window.alert('クリップボードにコピーできませんでした')
    }
  }

  return (
    <article className="alias-card">
      <div className="avatar" aria-hidden="true">
        {alias.service_name.slice(0, 1).toUpperCase()}
      </div>
      <div className="alias-main">
        <strong className="service">{alias.service_name}</strong>
        <button className="address" type="button" onClick={copy}>
          {aliasAddress(alias)}
        </button>
        <small className="note">
          {alias.note || new Date(alias.created_at).toLocaleDateString('ja-JP')}
        </small>
      </div>
      <div className="card-actions">
        <button type="button" onClick={copy}>
          {copied ? 'コピー済み' : 'コピー'}
        </button>
        <button type="button" onClick={() => onEdit(alias)}>
          編集
        </button>
        <button
          className="danger"
          type="button"
          onClick={() => void onDelete(alias)}
        >
          削除
        </button>
      </div>
    </article>
  )
}

interface EditDialogProps {
  alias: Alias | null
  onClose: () => void
  onSave: (id: string, serviceName: string, note: string) => Promise<void>
}

function EditDialog({ alias, onClose, onSave }: EditDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (alias && dialog && !dialog.open) dialog.showModal()
    if (!alias && dialog?.open) dialog.close()
  }, [alias])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!alias) return
    const data = new FormData(event.currentTarget)
    setSaving(true)
    try {
      await onSave(
        alias.id,
        String(data.get('serviceName') || ''),
        String(data.get('note') || ''),
      )
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} onCancel={onClose}>
      {alias && (
        <form onSubmit={(event) => void submit(event)}>
          <div className="dialog-head">
            <h2>エイリアスを編集</h2>
            <button
              className="icon-button"
              type="button"
              aria-label="閉じる"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <label>
            サービス名
            <input
              name="serviceName"
              required
              maxLength={120}
              defaultValue={alias.service_name}
            />
          </label>
          <label>
            メモ
            <textarea
              name="note"
              maxLength={1000}
              rows={4}
              defaultValue={alias.note}
            />
          </label>
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>
              キャンセル
            </button>
            <button className="primary" disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}

function CsvImporter({ onImported }: { onImported: () => Promise<void> }) {
  const [items, setItems] = useState<ImportAliasInput[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const selectFile = async (file?: File) => {
    setMessage('')
    setItems([])
    if (!file) return
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error('CSVは5MB以下にしてください')
      const parsed = prepareAddyImport(await file.text())
      if (!parsed.length) throw new Error('インポートできる行がありません')
      setItems(parsed)
    } catch (cause) {
      setMessage(errorMessage(cause))
    }
  }

  const runImport = async () => {
    if (!items.length) return
    setBusy(true)
    setMessage('インポートしています…')
    const total = { imported: 0, duplicates: 0, invalid: 0 }
    try {
      for (let offset = 0; offset < items.length; offset += 200) {
        const result = await aliasesApi.import(
          items.slice(offset, offset + 200),
        )
        total.imported += result.imported
        total.duplicates += result.duplicates
        total.invalid += result.invalid.length
      }
      setMessage(
        `${total.imported}件を追加、${total.duplicates}件の重複をスキップ、${total.invalid}件が不正でした。`,
      )
      setItems([])
      if (fileRef.current) fileRef.current.value = ''
      await onImported()
    } catch (cause) {
      setMessage(
        `途中で停止しました: ${errorMessage(cause)}。再実行しても重複はスキップされます。`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="importer" aria-labelledby="import-title">
      <div className="import-head">
        <div>
          <h2 id="import-title">Addy.ioから移行</h2>
          <p>
            CSVのメールアドレスからユーザー部を取り出し、{ALIAS_DOMAIN}
            へ一括登録します。
          </p>
        </div>
        <label className="file-button">
          CSVを選択
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void selectFile(event.target.files?.[0])}
          />
        </label>
      </div>
      {(items.length > 0 || message) && (
        <div className="import-preview">
          {items.length > 0 && (
            <>
              <div className="import-summary">
                <p>
                  {items.length}件を検出しました。先頭
                  {Math.min(8, items.length)}件を表示しています。
                </p>
                <button
                  className="primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void runImport()}
                >
                  {busy ? '処理中…' : 'インポート'}
                </button>
              </div>
              <div className="preview-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>移行後のアドレス</th>
                      <th>サービス</th>
                      <th>状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.slice(0, 8).map((item, index) => (
                      <tr key={`${item.localPart}-${index}`}>
                        <td>
                          {item.localPart}@{ALIAS_DOMAIN}
                        </td>
                        <td>{item.serviceName}</td>
                        <td>{item.status === 'active' ? '有効' : '無効'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="message" role="status" aria-live="polite">
            {message}
          </p>
        </div>
      )}
    </section>
  )
}

export function App() {
  const [aliases, setAliases] = useState<Alias[]>([])
  const [query, setQuery] = useState('')
  const [loadingMessage, setLoadingMessage] = useState('読み込み中…')
  const [createMessage, setCreateMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Alias | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme)

  const load = useCallback(async () => {
    try {
      const result = await aliasesApi.list(query)
      setAliases(result.aliases)
      setLoadingMessage(`${result.aliases.length}件`)
    } catch (cause) {
      setLoadingMessage(errorMessage(cause))
    }
  }, [query])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setCreating(true)
    setCreateMessage('生成しています…')
    try {
      const { alias } = await aliasesApi.create({
        serviceName: String(data.get('serviceName') || ''),
        note: String(data.get('note') || ''),
      })
      const address = await copyAlias(alias)
      setCreateMessage(`${address} をコピーしました`)
      form.reset()
      form.querySelector<HTMLInputElement>('[name=serviceName]')?.focus()
      await load()
    } catch (cause) {
      setCreateMessage(errorMessage(cause))
    } finally {
      setCreating(false)
    }
  }

  const deleteAlias = async (alias: Alias) => {
    const confirmed = window.confirm(
      `${aliasAddress(alias)} を削除しますか？\nこの操作は取り消せません。`,
    )
    if (!confirmed) return
    try {
      await aliasesApi.delete(alias.id)
      await load()
    } catch (cause) {
      window.alert(errorMessage(cause))
    }
  }

  const save = async (id: string, serviceName: string, note: string) => {
    await aliasesApi.update(id, { serviceName, note })
    await load()
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Alterius ホーム">
          <img src={logoUrl} alt="" width="40" height="40" />
          <span>
            <p className="eyebrow">EMAIL ALIAS MANAGER</p>
            <strong>Alterius</strong>
          </span>
        </a>
        <label className="header-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="サービス・アドレスを検索"
            aria-label="エイリアスを検索"
          />
        </label>
        <div className="header-actions">
          <button
            className="icon-button"
            type="button"
            aria-label={`${theme === 'dark' ? 'ライト' : 'ダーク'}モードに切り替える`}
            title={`${theme === 'dark' ? 'ライト' : 'ダーク'}モード`}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <a className="create-shortcut" href="#create-title">
            <span aria-hidden="true">＋</span>
            新規作成
          </a>
        </div>
      </header>

      <main className="shell" id="top">
        <section className="creator" aria-labelledby="create-title">
          <div>
            <h2 id="create-title">新しいエイリアス</h2>
            <p>
              サービス名を入力すると、ランダムな8文字のアドレスを発行します。
            </p>
          </div>
          <form onSubmit={(event) => void create(event)}>
            <label>
              サービス名
              <input
                name="serviceName"
                required
                maxLength={120}
                autoComplete="off"
                placeholder="例: GitHub"
              />
            </label>
            <label>
              メモ <span>任意</span>
              <input
                name="note"
                maxLength={1000}
                autoComplete="off"
                placeholder="用途や登録日など"
              />
            </label>
            <button className="primary" disabled={creating}>
              {creating ? '生成中…' : '生成してコピー'}
            </button>
          </form>
          <p className="message" role="status" aria-live="polite">
            {createMessage}
          </p>
        </section>

        <section className="records" aria-labelledby="records-title">
          <div className="records-head">
            <div>
              <h2 id="records-title">エイリアス</h2>
              <p>{loadingMessage}</p>
            </div>
          </div>
          {!aliases.length && (
            <div className="empty">エイリアスはまだありません。</div>
          )}
          <div className="alias-list">
            {aliases.map((alias) => (
              <AliasCard
                key={alias.id}
                alias={alias}
                onEdit={setEditing}
                onDelete={deleteAlias}
              />
            ))}
          </div>
        </section>

        <CsvImporter onImported={load} />
        <EditDialog
          alias={editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      </main>
    </>
  )
}
