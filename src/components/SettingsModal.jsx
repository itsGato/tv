import { useState } from 'react'
import { DEFAULT_CONFIG, clearIptvCache } from '../lib/storage.js'

const RES_OPTIONS = [
  ['uhd', 'UHD / 4K'],
  ['qhd', '2K / QHD'],
  ['fhd', 'FHD 1080p'],
  ['hd', 'HD 720p'],
  ['sd', 'SD'],
]

/**
 * Panel de configuración completo con persistencia en localStorage.
 */
export default function SettingsModal({ config, onChange, onClose, onSortAlpha, onSortDefault, onResetOrder, onClearFavorites, favoritesCount }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const set = (patch) => onChange({ ...config, ...patch })

  const toggleRes = (r) => {
    const has = config.resolutions.includes(r)
    let list = has ? config.resolutions.filter((x) => x !== r) : [...config.resolutions, r]
    if (!list.length) list = ['sd'] // siempre al menos una resolución visible
    set({ resolutions: list })
  }

  const confirmFactory = () => {
    if (window.confirm('¿Restablecer TODA la configuración de fábrica? Se conservan favoritos y orden.')) {
      onChange({ ...DEFAULT_CONFIG })
      setMsg('Configuración restablecida de fábrica.')
    }
  }

  const doClearCache = async () => {
    setBusy(true)
    try {
      await clearIptvCache()
      setMsg('Caché de iptv-org vaciada. Recargando…')
      setTimeout(() => window.location.reload(), 600)
    } catch {
      setMsg('No se pudo limpiar la caché (SW no disponible).')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Configuración" data-spatial="">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>⚙ Configuración</h2>
        <div className="desc">Se guarda automáticamente en este dispositivo.</div>

        <fieldset className="fieldset">
          <legend>Rendimiento</legend>
          <div className="row">
            <div>
              <div className="label">Modo Rendimiento</div>
              <div className="hint">Desactiva precarga y animaciones 3D/blur y oculta canales UHD, 4K y 2K. Ideal para Smart TVs antiguas.</div>
            </div>
            <Switch checked={config.performanceMode} onChange={(v) => set({ performanceMode: v })} />
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Resoluciones</legend>
          <div className="check-group" style={{ marginBottom: 12 }}>
            {RES_OPTIONS.map(([r, label]) => (
              <label className="check-pill" key={r}>
                <input
                  type="checkbox"
                  checked={config.resolutions.includes(r)}
                  disabled={config.performanceMode && (r === 'uhd' || r === 'qhd')}
                  onChange={() => toggleRes(r)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="row">
            <div>
              <div className="label">Detección automática según dispositivo</div>
              <div className="hint">Prioriza la mejor calidad que admite tu pantalla ({window.screen.width}×{window.screen.height}px).</div>
            </div>
            <Switch checked={config.autoDetectRes} onChange={(v) => set({ autoDetectRes: v })} />
          </div>
          <div className="row">
            <div className="label">Calidad preferida</div>
            <select
              className="text-input" style={{ width: 200 }}
              value={config.preferredResolution || 'auto'}
              onChange={(e) => set({ preferredResolution: e.target.value === 'auto' ? null : e.target.value })}
            >
              <option value="auto">Automática (mejor disponible)</option>
              {RES_OPTIONS.map(([r, label]) => <option key={r} value={r}>{label}</option>)}
            </select>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Precarga de favoritos</legend>
          <div className="row">
            <div>
              <div className="label">Precarga en segundo plano</div>
              <div className="hint">Descarga manifiesto + primer fragmento de los favoritos para cambio de canal instantáneo.</div>
            </div>
            <Switch
              checked={config.preloadFavorites && !config.performanceMode}
              disabled={config.performanceMode}
              onChange={(v) => set({ preloadFavorites: v })}
            />
          </div>
          <div className="row">
            <div className="label">Máximo de canales precargados</div>
            <select
              className="text-input" style={{ width: 120 }}
              value={config.preloadLimit}
              onChange={(e) => set({ preloadLimit: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Orden y listas</legend>
          <div className="actions-grid">
            <button className="btn" onClick={onSortAlpha}>A-Z · Ordenar alfabéticamente</button>
            <button className="btn" onClick={onSortDefault}>↺ Orden original TDT España</button>
            <button
              className="btn danger"
              onClick={() => window.confirm('¿Restablecer el orden personalizado de canales?') && onResetOrder()}
            >
              Restablecer orden personalizado
            </button>
            <button
              className="btn danger"
              onClick={() => window.confirm(`¿Borrar los ${favoritesCount} favoritos?`) && onClearFavorites()}
            >
              ★ Borrar favoritos ({favoritesCount})
            </button>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Diagnóstico y red</legend>
          <div className="row" style={{ display: 'block' }}>
            <div className="label" style={{ marginBottom: 6 }}>Proxy CORS opcional</div>
            <div className="hint" style={{ marginBottom: 8 }}>
              Si algún canal bloquea peticiones desde el navegador, indica un proxy. Usa {'{url}'} o termina en <code>?url=</code> para inyección codificada.
            </div>
            <input
              className="text-input"
              placeholder="https://mi-proxy.example/?url="
              value={config.corsProxy}
              onChange={(e) => set({ corsProxy: e.target.value.trim() })}
            />
          </div>
          <div className="actions-grid" style={{ marginTop: 12 }}>
            <button className="btn" onClick={doClearCache} disabled={busy}>
              {busy ? 'Limpiando…' : '🧹 Forzar recarga / limpiar caché iptv-org'}
            </button>
            <button className="btn danger" onClick={confirmFactory}>♻ Restablecer configuración de fábrica</button>
          </div>
          {msg && <div className="hint" style={{ marginTop: 10, color: 'var(--accent)' }}>{msg}</div>}
        </fieldset>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

function Switch({ checked, onChange, disabled }) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label="Interruptor"
      />
      <span className="track" />
      <span className="thumb" />
    </label>
  )
}
