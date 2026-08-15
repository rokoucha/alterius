import type { Alias } from './lib.js'
import {
  addressOf,
  api,
  browserApi,
  errorMessage,
  getSettings,
  mustQuery,
} from './lib.js'

const list = mustQuery<HTMLElement>('#list')
const search = mustQuery<HTMLInputElement>('#search')
const createForm = mustQuery<HTMLFormElement>('#create-form')
const showCreate = mustQuery<HTMLButtonElement>('#show-create')
const toast = mustQuery<HTMLParagraphElement>('#toast')
const editDialog = mustQuery<HTMLDialogElement>('#edit-dialog')
const editForm = mustQuery<HTMLFormElement>('#edit-form')
const editAddress = mustQuery<HTMLParagraphElement>('#edit-address')
let requestNumber = 0
let searchTimer: number | undefined
let toastTimer: number | undefined
let editingAlias: Alias | null = null

function formInput(form: HTMLFormElement, name: string): HTMLInputElement {
  return form.elements.namedItem(name) as HTMLInputElement
}

async function currentTabDomain(): Promise<string> {
  try {
    const [tab] = await browserApi.tabs.query({
      active: true,
      currentWindow: true,
    })
    if (!tab?.url) return ''
    const url = new URL(tab.url)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.hostname
      : ''
  } catch {
    return ''
  }
}

function showToast(message: string, isError = false): void {
  toast.textContent = message
  toast.classList.toggle('error', isError)
  toast.hidden = false
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.hidden = true), 1800)
}

function relativeAge(value: string): string {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86400000),
  )
  if (days === 0) return '今日'
  if (days < 30) return `${days}日`
  if (days < 365) return `${Math.floor(days / 30)}か月`
  return `${Math.floor(days / 365)}年`
}

function render(aliases: Alias[]): void {
  list.replaceChildren()
  if (!aliases.length) {
    const empty = document.createElement('p')
    empty.className = 'state'
    empty.textContent = '一致するエイリアスはありません'
    list.append(empty)
    return
  }
  for (const alias of aliases) {
    const card = document.createElement('article')
    card.className = 'alias'
    const age = document.createElement('time')
    age.dateTime = alias.created_at
    age.textContent = relativeAge(alias.created_at)
    const details = document.createElement('button')
    details.className = 'details'
    details.type = 'button'
    const address = addressOf(alias)
    const strong = document.createElement('strong')
    strong.textContent = address
    const small = document.createElement('small')
    small.textContent = alias.note
      ? `${alias.service_name} · ${alias.note}`
      : alias.service_name
    details.append(strong, small)
    details.addEventListener('click', () => copy(address))
    const editButton = document.createElement('button')
    editButton.className = 'edit-button'
    editButton.type = 'button'
    editButton.textContent = '編集'
    editButton.addEventListener('click', () => openEditor(alias))
    card.append(age, details, editButton)
    list.append(card)
  }
}

function openEditor(alias: Alias): void {
  editingAlias = alias
  editAddress.textContent = addressOf(alias)
  formInput(editForm, 'serviceName').value = alias.service_name
  formInput(editForm, 'note').value = alias.note || ''
  editDialog.showModal()
  formInput(editForm, 'serviceName').focus()
}

function closeEditor(): void {
  editingAlias = null
  editForm.reset()
  editDialog.close()
}

async function copy(address: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(address)
    showToast('コピーしました')
  } catch {
    showToast('コピーできませんでした', true)
  }
}

async function loadAliases(): Promise<void> {
  const currentRequest = ++requestNumber
  list.innerHTML = '<p class="state">読み込み中…</p>'
  try {
    const params = new URLSearchParams({
      q: search.value.trim(),
      includeInactive: 'false',
    })
    const { aliases } = await api<{ aliases: Alias[] }>(
      `/api/aliases?${params}`,
    )
    if (currentRequest === requestNumber) render(aliases)
  } catch (error) {
    if (currentRequest !== requestNumber) return
    list.innerHTML = ''
    const state = document.createElement('p')
    state.className = 'state error-text'
    state.textContent = errorMessage(error)
    list.append(state)
  }
}

search.addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadAliases, 180)
})
showCreate.addEventListener('click', async () => {
  createForm.hidden = !createForm.hidden
  if (createForm.hidden) return
  const serviceInput = formInput(createForm, 'serviceName')
  if (!serviceInput.value) serviceInput.value = await currentTabDomain()
  serviceInput.focus()
})
mustQuery<HTMLButtonElement>('#cancel-create').addEventListener('click', () => {
  createForm.hidden = true
  createForm.reset()
})
createForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const submit = mustQuery<HTMLButtonElement>('#create-form [type="submit"]')
  submit.disabled = true
  try {
    const data = new FormData(createForm)
    const { alias } = await api<{ alias: Alias }>('/api/aliases', {
      method: 'POST',
      body: JSON.stringify({
        serviceName: data.get('serviceName'),
        note: data.get('note'),
      }),
    })
    await copy(addressOf(alias))
    createForm.reset()
    createForm.hidden = true
    await loadAliases()
  } catch (error) {
    showToast(errorMessage(error), true)
  } finally {
    submit.disabled = false
  }
})
mustQuery<HTMLButtonElement>('#open-settings').addEventListener('click', () =>
  browserApi.runtime.openOptionsPage(),
)

mustQuery<HTMLButtonElement>('#close-edit').addEventListener(
  'click',
  closeEditor,
)
mustQuery<HTMLButtonElement>('#cancel-edit').addEventListener(
  'click',
  closeEditor,
)
editDialog.addEventListener('cancel', (event) => {
  event.preventDefault()
  closeEditor()
})
editForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!editingAlias) return
  const submit = mustQuery<HTMLButtonElement>('#edit-form [type="submit"]')
  submit.disabled = true
  try {
    const data = new FormData(editForm)
    await api(`/api/aliases/${editingAlias.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        serviceName: data.get('serviceName'),
        note: data.get('note'),
      }),
    })
    closeEditor()
    showToast('保存しました')
    await loadAliases()
  } catch (error) {
    showToast(errorMessage(error), true)
  } finally {
    submit.disabled = false
  }
})

const { apiBaseUrl } = await getSettings()
if (!apiBaseUrl) browserApi.runtime.openOptionsPage()
loadAliases()
