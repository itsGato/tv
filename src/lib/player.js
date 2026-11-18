// ============================================================
// Motor de reproducción: hls.js para .m3u8 (fallback nativo en
// Safari/iOS) y dash.js para .mpd. API unificada attach/detach.
// ============================================================

import Hls from 'hls.js'
import dashjs from 'dashjs'

export function isHlsUrl(url) { return /\.m3u8(\?|$)/i.test(url) }
export function isDashUrl(url) { return /\.mpd(\?|$)/i.test(url) }

const canPlayHlsNatively = () =>
  typeof window !== 'undefined' &&
  !!window.MediaSource &&
  MediaSource.isTypeSupported('application/vnd.apple.mpegurl')

export function applyProxy(url, proxy) {
  if (!proxy) return url
  try {
    if (/\?url=$|%\{url\}|={url}/.test(proxy)) {
      return proxy.replace(/%\{url\}|={url}/, encodeURIComponent(url)).replace(/\?url=$/, `?url=${encodeURIComponent(url)}`)
    }
    if (proxy.includes('=')) return proxy + encodeURIComponent(url)
    return proxy + (proxy.endsWith('/') ? '' : '/') + url
  } catch {
    return url
  }
}

/**
 * Reproduce `url` en `video`. Devuelve un objeto controller con destroy().
 */
export function playStream(video, url, { corsProxy, onQualityLevels, onError, onBufferProgress }) {
  let hls = null
  let dash = null
  let destroyed = false

  const finalUrl = applyProxy(url, corsProxy)

  const cleanupListeners = []
  const track = (el, ev, fn) => { el.addEventListener(ev, fn); cleanupListeners.push([el, ev, fn]) }

  // Progreso de buffering basado en el buffered range cercano al playback
  const reportBuffer = () => {
    if (destroyed || !onBufferProgress) return
    try {
      const b = video.buffered
      if (b.length) onBufferProgress(Math.min(100, Math.round((b.end(b.length - 1) - video.currentTime) / 10 * 100)))
      else onBufferProgress(0)
    } catch { /* noop */ }
  }
  track(video, 'progress', reportBuffer)

  const fail = (message) => { if (!destroyed && onError) onError(message) }

  if (isDashUrl(finalUrl)) {
    dash = dashjs.MediaPlayer().create()
    dash.initialize(video, finalUrl, true)
    dash.updateSettings({
      streaming: {
        buffer: { fastSwitchEnabled: true },
        abr: { autoAdjustAbrRatio: true },
      },
    })
    dash.on(dashjs.Events.ERROR, (e) => fail(`DASH: ${e.error?.message || 'error de manifiesto'}`))
    dash.on(dashjs.Events.MANIFEST_PARSED, () => {
      if (onQualityLevels) onQualityLevels(dash.getBitrateInfoListFor('video') || [])
    })
  } else if (Hls.isSupported() && !canPlayHlsNatively()) {
    hls = new Hls({
      lowLatencyMode: true,
      backBufferLength: 30,
      maxBufferLength: 20,
      enableWorker: true,
      liveSyncDurationCount: 3,
    })
    hls.attachMedia(video)
    hls.loadSource(finalUrl)
    hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
      if (onQualityLevels) onQualityLevels(data.levels || [])
      video.play().catch(() => {})
    })
    hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
      if (onQualityLevels) onQualityLevels(hls.levels || [], data.level)
    })
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        try { hls.startLoad() } catch { fail('Error de red irrecuperable') }
        setTimeout(() => fail('No se pudo recuperar el stream (red)'), 4000)
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        try { hls.recoverMediaError() } catch { fail('Error de decodificación') }
      } else {
        fail('Stream no disponible en el navegador')
      }
    })
  } else {
    // HLS nativo (Safari, iOS) o fuente directa
    video.src = finalUrl
    video.play().catch(() => {})
    track(video, 'error', () => fail('El navegador no puede reproducir este formato'))
  }

  return {
    get engine() { return hls ? 'hls.js' : dash ? 'dash.js' : 'nativo' },
    get levels() { return hls ? (hls.levels || []) : dash ? (dash.getBitrateInfoListFor?.('video') || []) : [] },
    get currentLevel() { return hls ? hls.currentLevel : -1 },
    setLevel(i) {
      if (hls) hls.currentLevel = i
      else if (dash) {
        try {
          if (i < 0) dash.updateABR(true)
          else dash.switchQuality(0, i)
        } catch { /* noop */ }
      }
    },
    destroy() {
      destroyed = true
      cleanupListeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn))
      if (hls) { try { hls.destroy() } catch { /* noop */ } hls = null }
      if (dash) { try { dash.reset(); dash.destroy() } catch { /* noop */ } dash = null }
      try { video.removeAttribute('src'); video.load() } catch { /* noop */ }
    },
  }
}

/**
 * Precarga silenciosa: descarga manifiesto + primer fragmento sin
 * mostrar ni reproducir audio. Devuelve una función de limpieza.
 */
export function preloadStream(url, corsProxy) {
  const finalUrl = applyProxy(url, corsProxy)
  if (!Hls.isSupported() || isDashUrl(finalUrl)) return () => {}

  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  video.volume = 0
  video.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px'

  const hls = new Hls({
    lowLatencyMode: false,
    enableWorker: false,
    maxBufferLength: 4,
    liveSyncDurationCount: 1,
    autoStartLoad: true,
  })
  hls.attachMedia(video)
  hls.loadSource(finalUrl)
  let stopTimer = null
  hls.on(Hls.Events.FRAG_BUFFERED, () => {
    // Una vez bufferizado el primer fragmento, detener la descarga
    clearTimeout(stopTimer)
    stopTimer = setTimeout(shutdown, 300)
  })
  hls.on(Hls.Events.ERROR, () => { shutdown() })
  // Salvaguarda: máximo 12s de precarga por stream
  stopTimer = setTimeout(shutdown, 12000)

  let dead = false
  function shutdown() {
    if (dead) return
    dead = true
    try { hls.stopLoad() } catch { /* noop */ }
    try { hls.destroy() } catch { /* noop */ }
    video.pause()
    video.removeAttribute('src')
    if (video.parentNode) video.parentNode.removeChild(video)
  }
  return shutdown
}
