import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ClockWidget from './components/ClockWidget.jsx'
import ChannelCard from './components/ChannelCard.jsx'
import Player from './components/Player.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import { buildChannels, pickStream, sortAlphabetically } from './lib/iptv.js'
import { preloadStream } from './lib/player.js'
import { FEATURED_CATEGORIES, RES_LABEL, autoResolution } from './lib/constants.js'
import {
  loadConfig, saveConfig, loadFavorites, saveFavorites,
  loadOrder, saveOrder, remove as removeStorage, DEFAULT_CONFIG,
} from './lib/storage.js'
import { installSpatialNav } from './lib/spatial.js'
import { normalizeRemoteKey, digitFromEvent } from './lib/remote.js'

// ---------------------------------------------------------------------------
export default function App() {
  const [config, setConfig] = useState(loadConfig)
  const [channels, setChannels] = useState([])
  const [loadState, setLoadState] = useState({ pct: 0, label: 'Iniciando…', error: '' })
  const [progress, setProgress] = useState(null) // null => oculta; 0..100 número; -1 indeterminado
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [onlyFav, setOnlyFav] = useState(false)
  const [favorites, setFavorites] = useState(loadFavorites)
  const [order, setOrder] = useState(loadOrder)          // array de ids | null (orden por defecto)
  const [reorderMode, setReorderMode] = useState(false)
  const [playing, setPlaying] = useState(null)           // { channel, stream }
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [preloadingIds, setPreloadingIds] = useState(() => new Set())
  const [numeric, setNumeric] = useState('')             // entrada numérica modo reorganizar
  const numericTimer = useRef(null)
  const gridRef = useRef(null)
  const dragId = useRef(null)

  // ---------- barra de progreso global ----------
  const barPct = progress != null ? Math.max(2, Math.min(100, progress)) : 0
  useEffect(() => {
    if (progress == null) return
    const id = setTimeout(() => setProgress(null), 550)
    return () => clearTimeout(id)
  }, [progress])

  // ---------- carga de datos iptv-org ----------
  useEffect(() => {
    let alive = true
    buildChannels({
      onProgress: (label, pct) => {
        if (!alive) return
        setLoadState((s) => ({ ...s, label, pct }))
        setProgress(pct)
      },
    })
      .then((list) => { if (alive) { setChannels(list); setLoadState((s) => ({ ...s, pct: 100 })) } })
      .catch((err) => {
        if (!alive) return
        setLoadState({ pct: 0, label: 'Error de red', error: String(err?.message || err) })
      })
    return () => { alive = false }
  }, [])

  // ---------- navegación espacial TV ----------
  useEffect(() => {
    const uninstall = installSpatialNav(() => {
      const roots = []
      if (gridRef.current) roots.push(gridRef.current)
      document.querySelectorAll('[data-spatial]').forEach((r) => roots.includes(r) || roots.push(r))
      return roots
    })
    return uninstall
  }, [])

  // ---------- persistencia config/favoritos/orden ----------
  useEffect(() => { saveConfig(config) }, [config])
  useEffect(() => { saveFavorites(favorites) }, [favorites])
  useEffect(() => { if (order) saveOrder(order) }, [order])

  // resolución preferida automática según pantalla del dispositivo
  useEffect(() => {
    if (config.autoDetectRes && !config.preferredResolution) {
      const guess = autoResolution(Math.round(window.screen.width * (window.devicePixelRatio || 1)))
      // no se persiste: se usa en tiempo real dentro de pickStream vía autoDetectRes
      void guess
    }
  }, [config])

  // ---------- orden efectivo + filtros ----------
  const orderedAll = useMemo(() => {
    if (!order) return channels
    const byId = new Map(channels.map((c) => [c.id, c]))
    const known = order.map((id) => byId.get(id)).filter(Boolean)
    const rest = channels.filter((c) => !order.includes(c.id))
    return [...known, ...rest]
  }, [channels, order])

  const visibleChannels = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orderedAll.filter((c) => {
      if (config.performanceMode && (c.maxResolution === 'uhd' || c.maxResolution === 'qhd')) {
        // En modo rendimiento solo si tiene alternativa <= FHD
        if (!c.streams.some((s) => ['fhd', 'hd', 'sd'].includes(s.resolution))) return false
      }
      if (!c.streams.some((s) => (config.performanceMode ? ['fhd', 'hd', 'sd'] : config.resolutions).includes(s.resolution))) return false
      if (onlyFav && !favorites.includes(c.id)) return false
      if (category !== 'all' && !c.categories.map((x) => x.toLowerCase()).includes(category)) return false
      if (q && !(c.name.toLowerCase().includes(q) || c.displayBase.toLowerCase().includes(q))) return false
      return true
    })
  }, [orderedAll, query, category, onlyFav, favorites, config])

  const favoriteFirst = useMemo(() => {
    if (!onlyFav) return visibleChannels
    return [...visibleChannels].sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)))
  }, [visibleChannels, onlyFav, favorites])

  const categoriesPresent = useMemo(() => {
    const set = new Map()
    for (const c of orderedAll) for (const cat of c.categories) set.set(cat.toLowerCase(), cat)
    const featured = FEATURED_CATEGORIES.filter((f) => set.has(f))
    const others = [...set.keys()].filter((k) => !FEATURED_CATEGORIES.includes(k)).sort()
    return [...featured, ...others].map((k) => [k, set.get(k)])
  }, [orderedAll])

  // ---------- abrir canal (lazy playback) ----------
  const openChannel = useCallback((channel) => {
    const stream = pickStream(channel, config, window.screen.width)
    if (!stream) return
    setPlaying({ channel, stream })
  }, [config])

  // ---------- favoritos + precarga silenciosa ----------
  const toggleFavorite = useCallback((id) => {
    setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))
  }, [])

  useEffect(() => {
    if (!config.preloadFavorites || config.performanceMode || !channels.length) return
    const cleanup = []
    const targets = favorites
      .map((id) => channels.find((c) => c.id === id))
      .filter(Boolean)
      .slice(0, config.preloadLimit)

    setPreloadingIds(new Set(targets.map((c) => c.id)))
    for (const ch of targets) {
      const st = pickStream(ch, config, window.screen.width)
      if (!st) continue
      const stop = preloadStream(st.url, config.corsProxy)
      cleanup.push(stop)
    }
    const t = setTimeout(() => setPreloadingIds(new Set()), 14000)
    return () => { clearTimeout(t); cleanup.forEach((fn) => fn()) }
  }, [favorites, config.preloadFavorites, config.preloadLimit, config.performanceMode, config.corsProxy, channels, config])

  // ---------- reordenar: drag & drop ----------
  const applyMove = useCallback((fromId, toIndex) => {
    setOrder((prev) => {
      const base = prev || orderedAll.map((c) => c.id)
      const arr = [...base]
      let idx = arr.indexOf(fromId)
      if (idx === -1) { // canal aún no presente en el array guardado
        arr.push(...orderedAll.map((c) => c.id).filter((id) => !arr.includes(id)))
        idx = arr.indexOf(fromId)
      }
      arr.splice(idx, 1)
      arr.splice(Math.max(0, Math.min(arr.length, toIndex)), 0, fromId)
      return arr
    })
  }, [orderedAll])

  const handleDrop = useCallback((targetId) => {
    if (!dragId.current || dragId.current === targetId) return
    const ids = order || orderedAll.map((c) => c.id)
    const to = ids.indexOf(targetId)
    applyMove(dragId.current, to === -1 ? orderedAll.findIndex((c) => c.id === targetId) : to)
    dragId.current = null
  }, [order, orderedAll, applyMove])

  // ---------- reordenar: entrada numérica (teclado/mando) ----------
  useEffect(() => {
    if (!reorderMode) return
    const onKey = (e) => {
      const k = normalizeRemoteKey(e)
      if (k === 'Back') { setReorderMode(false); setNumeric(''); return }
      const d = digitFromEvent(e)
      if (d != null) {
        e.preventDefault()
        setNumeric((n) => (n.length >= 3 ? d : n + d))
        clearTimeout(numericTimer.current)
        numericTimer.current = setTimeout(() => setNumeric(''), 2600)
        return
      }
      if (e.key === 'Enter' || k === 'Enter') {
        const active = document.activeElement
        const card = active?.closest?.('[data-card]')
        if (card && numeric) {
          e.preventDefault()
          const idx = Array.from(gridRef.current.children).indexOf(card)
          const ch = favoriteFirst[idx]?.id ?? orderedAll[idx]?.id
          const target = Math.min(Number(numeric), orderedAll.length) - 1
          if (ch && target >= 0) {
            applyMove(ch, target)
            setNumeric('')
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(numericTimer.current) }
  }, [reorderMode, numeric, favoriteFirst, orderedAll, applyMove])

  // atajos globales fuera del modo reorganizar
  useEffect(() => {
    const onKey = (e) => {
      if (playing || settingsOpen) return
      if (e.target.tagName === 'INPUT') return
      const k = normalizeRemoteKey(e)
      if (k === 'Back' && reorderMode) setReorderMode(false)
      if (e.key === '?' ) setSettingsOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playing, settingsOpen, reorderMode])

  // ---------- acciones de configuración sobre el orden ----------
  const doSortAlpha = () => setOrder(sortAlphabetically(channels).map((c) => c.id))
  const doSortDefault = () => { setOrder(null); removeStorage('order') }
  const doResetOrder = () => { setOrder(null); removeStorage('order') }
  const doClearFavorites = () => setFavorites([])

  const totalStreams = useMemo(() => channels.reduce((n, c) => n + c.streams.length, 0), [channels])

  return (
    <div className={`app-shell ${config.performanceMode ? 'perf-mode' : ''}`}>
      {/* Barra de progreso superior */}
      <div className={`topbar-progress ${progress === -1 ? 'indeterminate' : ''}`} aria-hidden={progress == null}>
        <div className="bar" style={{ width: `${barPct}%`, opacity: progress == null ? 0 : 1 }} />
      </div>

      {/* Cabecera */}
      <header className="glass header">
        <ClockWidget />
        <div className="brand">
          <h1>TDT España</h1>
          <span>{channels.length ? `${channels.length} canales · ${totalStreams} streams` : 'iptv-org'}</span>
        </div>
        <div className="header-actions" data-spatial="">
          <button
            className={`btn ${onlyFav ? 'active' : ''}`}
            onClick={() => setOnlyFav((v) => !v)}
            aria-pressed={onlyFav}
            title="Ver solo favoritos"
          >
            ★ Favoritos{favorites.length ? ` (${favorites.length})` : ''}
          </button>
          <button
            className={`btn ${reorderMode ? 'active' : ''}`}
            onClick={() => setReorderMode((v) => !v)}
            aria-pressed={reorderMode}
            title="Modo reorganización (arrastrar o teclear número + Enter)"
          >
            ⠿ Reorganizar canales
          </button>
          <button className="btn" onClick={() => setSettingsOpen(true)}>⚙ Ajustes</button>
        </div>
      </header>

      {/* Toolbar búsqueda/categorías */}
      <div className="glass toolbar">
        <div className="search">
          <span aria-hidden>🔍</span>
          <input
            placeholder="Buscar canal…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar canal"
          />
          {query && <button className="btn small" onClick={() => setQuery('')} tabIndex={-1}>✕</button>}
        </div>
        <div className="chips" data-spatial="" role="tablist" aria-label="Categorías">
          <button className={`chip ${category === 'all' ? 'on' : ''}`} onClick={() => setCategory('all')} role="tab" aria-selected={category === 'all'}>
            Todos
          </button>
          {categoriesPresent.map(([key, label]) => (
            <button
              key={key}
              className={`chip ${category === key ? 'on' : ''}`}
              onClick={() => setCategory(key)}
              role="tab"
              aria-selected={category === key}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Estado de carga / error */}
      {!channels.length && (
        <div className="empty">
          {loadState.error ? (
            <>
              <div style={{ marginBottom: 12 }}>⚠️ No se pudieron descargar los datos de iptv-org.<br />
                <span style={{ fontSize: 13 }}>{loadState.error}</span>
              </div>
              <button className="btn primary" onClick={() => window.location.reload()} data-card="">Reintentar</button>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
              <div className="spinner" style={{ position: 'static', transform: 'none' }} />
              <div>{loadState.label} <span style={{ opacity: 0.6 }}>{Math.round(loadState.pct)}%</span></div>
            </div>
          )}
        </div>
      )}

      {/* Parrilla de canales */}
      {!!channels.length && (
        <main
          ref={gridRef}
          className="grid"
          data-spatial=""
          aria-label="Parrilla de canales"
          style={reorderMode ? { perspective: '1200px' } : undefined}
        >
          {favoriteFirst.map((c, i) => (
            <ChannelCard
              key={c.id}
              channel={c}
              position={i}
              favorite={favorites.includes(c.id)}
              preloading={preloadingIds.has(c.id)}
              performanceMode={config.performanceMode}
              reorderMode={reorderMode}
              onOpen={openChannel}
              onToggleFavorite={toggleFavorite}
              onDragStart={(id) => { dragId.current = id }}
              onDrop={handleDrop}
            />
          ))}
          {!favoriteFirst.length && (
            <div className="empty" style={{ gridColumn: '1/-1' }}>
              Ningún canal coincide con el filtro actual.
              <div style={{ marginTop: 10 }}>
                <span className="badge">{RES_LABEL[config.resolutions[0]] || '—'}</span>{' '}
                Prueba a ampliar resoluciones en Ajustes.
              </div>
            </div>
          )}
        </main>
      )}

      {/* Pista de entrada numérica en modo reorganización */}
      {reorderMode && (
        <div className="numeric-hint" role="status">
          <span>Modo edición:</span>
          <b>{numeric || '·'}</b>
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>
            arrastra tarjetas o enfoca una y teclea posición + Enter · Esc salir
          </span>
        </div>
      )}

      <footer className="footer-note">
        Datos públicos de{' '}
        <a href="https://github.com/iptv-org" target="_blank" rel="noreferrer">iptv-org</a>
        {' '}· esta app no aloja ni emite contenido · uso personal
      </footer>

      {/* Reproductor inmersivo (montado solo al abrir un canal) */}
      {playing && (
        <Player
          channel={playing.channel}
          initialStream={playing.stream}
          config={config}
          onClose={() => setPlaying(null)}
          onProgress={(pct) => setProgress(pct > 0 ? pct : null)}
        />
      )}

      {/* Modal de configuración */}
      {settingsOpen && (
        <SettingsModal
          config={config}
          onChange={setConfig}
          onClose={() => setSettingsOpen(false)}
          onSortAlpha={doSortAlpha}
          onSortDefault={doSortDefault}
          onResetOrder={doResetOrder}
          onClearFavorites={doClearFavorites}
          favoritesCount={favorites.length}
        />
      )}
    </div>
  )
}
