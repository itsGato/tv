import { useEffect, useRef, useState } from 'react'
import { playStream } from '../lib/player.js'
import { normalizeRemoteKey } from '../lib/remote.js'

/**
 * Reproductor inmersivo a pantalla completa.
 * - hls.js / dash.js según extensión del stream
 * - selector de calidad (niveles del manifiesto) + streams alternativos
 * - controles auto-ocultables, navegación por mando (Back, Play/Pause, +/- canal)
 */
export default function Player({ channel, initialStream, config, onClose, onProgress }) {
  const videoRef = useRef(null)
  const ctrlRef = useRef(null)
  const hideTimer = useRef(null)
  const [stream, setStream] = useState(initialStream)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(() => Number(localStorage.getItem('tdt:vol') ?? 1))
  const [showControls, setShowControls] = useState(true)
  const [qualityOpen, setQualityOpen] = useState(false)
  const [levels, setLevels] = useState([])
  const [currentLevel, setCurrentLevel] = useState(-1)

  // ---- carga del stream (lazy playback: nada suena hasta abrir un canal) ----
  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return
    setLoading(true)
    setError('')
    setLevels([])
    setCurrentLevel(-1)

    ctrlRef.current?.destroy()
    ctrlRef.current = playStream(video, stream.url, {
      corsProxy: config.corsProxy,
      onQualityLevels: (lv, cur) => {
        setLevels(lv || [])
        if (cur !== undefined) setCurrentLevel(cur)
      },
      onError: (msg) => { setError(msg); setLoading(false); onProgress?.(0) },
      onBufferProgress: (pct) => onProgress?.(pct),
    })

    video.volume = volume
    video.muted = muted

    const onPlay = () => { setPlaying(true); setLoading(false); setError('') }
    const onPause = () => setPlaying(false)
    const onWaiting = () => setLoading(true)
    const onPlaying = () => { setLoading(false); onProgress?.(0) }
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', onPlaying)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('playing', onPlaying)
      ctrlRef.current?.destroy()
      ctrlRef.current = null
      onProgress?.(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream?.url, config.corsProxy])

  // ---- auto-ocultar controles ----
  const poke = () => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowControls(false), 4500)
  }
  useEffect(() => { poke(); return () => clearTimeout(hideTimer.current) }, [])

  // ---- teclado / mando remoto ----
  useEffect(() => {
    const onKey = (e) => {
      const k = normalizeRemoteKey(e)
      if (k === 'Back') { e.preventDefault(); onClose(); return }
      if (k === 'Enter' && document.activeElement === document.body) { togglePlay(); return }
      if (k === 'Play') { togglePlay(); return }
      if (k === '+' || k === 'ChannelUp') { switchRelative(1); return }
      if (k === '-' || k === '_' || k === 'ChannelDown') { switchRelative(-1); return }
      if (k === 'm' || k === 'Mute') { setMuted((m) => !m); return }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) poke()
      if (e.key === 'q' || e.key === 'Q') setQualityOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, onClose])

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume
      videoRef.current.muted = muted
      localStorage.setItem('tdt:vol', String(volume))
    }
  }, [volume, muted])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
    poke()
  }

  const switchRelative = (dir) => {
    const list = channel.streams
    const idx = list.findIndex((s) => s.streamId === stream.streamId)
    const next = list[(idx + dir + list.length) % list.length]
    if (next) setStream(next)
  }

  const pickLevel = (i) => {
    setCurrentLevel(i)
    ctrlRef.current?.setLevel(i)
    setQualityOpen(false)
  }

  const levelName = (lv, i) => {
    if (lv.height || lv.resolutionHeight) return `${lv.height || lv.resolutionHeight}p · ${Math.round((lv.bitrate || 0) / 1000)} kbps`
    if (lv.bitrate) return `${Math.round(lv.bitrate / 1000)} kbps`
    return `Nivel ${i + 1}`
  }

  return (
    <div className="player-overlay" onPointerMove={poke} onClick={poke} data-spatial="" role="dialog" aria-label={`Reproduciendo ${channel.name}`}>
      <video ref={videoRef} playsInline autoPlay />

      {loading && !error && <div className="spinner" aria-label="Cargando stream" />}

      {error && (
        <div className="player-error glass">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ No se pudo reproducir</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 12 }}>{error}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn small" onClick={() => setStream({ ...stream })}>Reintentar</button>
            {channel.streams.length > 1 && (
              <button className="btn small" onClick={() => switchRelative(1)}>Probar otro stream</button>
            )}
            <button className="btn small danger" onClick={onClose}>Volver a la parrilla</button>
          </div>
        </div>
      )}

      <div className="player-top">
        <button className="btn small" onClick={onClose} aria-label="Volver (Escape)">← Volver</button>
        <div>
          <div className="title">{channel.displayBase}</div>
          <div className="sub">
            {stream.label} · motor {ctrlRef.current?.engine || '—'} · {channel.categories.join(', ')}
          </div>
        </div>
      </div>

      <div className={`player-controls ${showControls ? '' : 'hidden'}`} data-spatial="">
        <button className="pbtn big" onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Reproducir'}>
          {playing ? '❚❚' : '▶'}
        </button>

        <div className="volume">
          <button className="pbtn" onClick={() => setMuted((m) => !m)} aria-label="Silencio">
            {muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
          </button>
          <input
            type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
            onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false) }}
            aria-label="Volumen"
          />
        </div>

        {/* Streams alternativos del mismo canal (calidades distintas) */}
        {channel.streams.length > 1 && (
          <div className="stream-switch" role="group" aria-label="Streams alternativos">
            {channel.streams.slice(0, 6).map((s) => (
              <button
                key={s.streamId}
                className={`stream-pill ${s.streamId === stream.streamId ? 'on' : ''}`}
                onClick={() => setStream(s)}
                title={s.label}
              >
                {{ sd: 'SD', hd: 'HD', fhd: 'FHD', qhd: '2K', uhd: 'UHD' }[s.resolution]}
              </button>
            ))}
          </div>
        )}

        {/* Selector de calidad ABR del manifiesto */}
        <div className="quality-menu">
          <button className="btn small" onClick={() => setQualityOpen((o) => !o)} aria-expanded={qualityOpen}>
            ⚙ Calidad {currentLevel >= 0 && levels[currentLevel] ? `· ${levelName(levels[currentLevel], currentLevel)}` : '· Auto'}
          </button>
          {qualityOpen && (
            <div className="quality-pop glass" data-spatial="">
              <button className={currentLevel === -1 ? 'on' : ''} onClick={() => pickLevel(-1)}>Auto (ABR)</button>
              {levels.map((lv, i) => (
                <button key={i} className={currentLevel === i ? 'on' : ''} onClick={() => pickLevel(i)}>
                  {levelName(lv, i)}
                </button>
              ))}
              {!levels.length && <button disabled style={{ opacity: 0.5 }}>Sin niveles múltiples</button>}
            </div>
          )}
        </div>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)' }}>
          Esc/⌫ volver · ± cambiar stream · M silencio · Q calidad
        </span>
      </div>
    </div>
  )
}
