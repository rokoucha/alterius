import {
  api,
  browserApi,
  errorMessage,
  getSettings,
  mustQuery,
  saveSettings,
} from './lib.js'

const form = mustQuery<HTMLFormElement>('#settings-form')
const input = mustQuery<HTMLInputElement>('#api-url')
const message = mustQuery<HTMLParagraphElement>('#message')
input.value = (await getSettings()).apiBaseUrl

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const button = mustQuery<HTMLButtonElement>('#settings-form button')
  button.disabled = true
  message.className = ''
  try {
    await saveSettings(input.value)
    message.textContent =
      '保存しました。認証が必要な場合はログインしてください。'
  } catch (error) {
    message.className = 'error'
    message.textContent = errorMessage(error)
  } finally {
    button.disabled = false
  }
})

mustQuery<HTMLButtonElement>('#access-login').addEventListener(
  'click',
  async () => {
    try {
      const apiBaseUrl = await saveSettings(input.value)
      if (!apiBaseUrl) throw new Error('先にAPI URLを入力してください')
      await browserApi.tabs.create({ url: apiBaseUrl })
      message.className = ''
      message.textContent =
        '開いたタブでログイン後、この画面で接続を確認してください。'
    } catch (error) {
      message.className = 'error'
      message.textContent = errorMessage(error)
    }
  },
)

mustQuery<HTMLButtonElement>('#check-connection').addEventListener(
  'click',
  async () => {
    message.className = ''
    message.textContent = '接続を確認しています…'
    try {
      await saveSettings(input.value)
      await api('/api/aliases?q=&includeInactive=false')
      message.textContent = 'Alteriusに接続できました。'
    } catch (error) {
      message.className = 'error'
      message.textContent = errorMessage(error)
    }
  },
)
