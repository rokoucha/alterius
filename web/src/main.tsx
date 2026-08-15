import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

const favicon = document.createElement('link')
favicon.rel = 'icon'
favicon.href = new URL(
  '../../extension/icons/icon-128.png',
  import.meta.url,
).href
document.head.append(favicon)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
