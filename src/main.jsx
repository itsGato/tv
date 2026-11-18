import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registro del Service Worker de la PWA (vite-plugin-pwa / virtual module).
// En producción el SW se auto-actualiza; en dev está deshabilitado.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const { registerSW } = await import('virtual:pwa-register')
      const updateSW = registerSW({
        onNeedRefresh() { updateSW(true) },
        onOfflineReady() { console.info('[PWA] lista para uso sin conexión') },
      })
    } catch {
      /* entorno sin soporte SW (Tizen antiguo): sin PWA, app funcional */
    }
  })
}
