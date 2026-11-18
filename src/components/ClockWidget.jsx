import { useEffect, useState } from 'react'
import { resolveCity, fetchWeather } from '../lib/geo.js'

/**
 * Widget izquierdo: ubicación + hora en tiempo real (1s) + clima Open-Meteo.
 */
export default function ClockWidget() {
  const [now, setNow] = useState(() => new Date())
  const [place, setPlace] = useState(null)
  const [wx, setWx] = useState(null)

  // Reloj ticking cada segundo
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Ubicación → clima (refresca cada 20 min)
  useEffect(() => {
    let alive = true
    let timer = null
    resolveCity().then(async (p) => {
      if (!alive) return
      setPlace(p)
      try {
        const w = await fetchWeather(p.lat, p.lon)
        if (alive) setWx(w)
      } catch { /* clima opcional */ }
      timer = setInterval(async () => {
        try {
          const w = await fetchWeather(p.lat, p.lon)
          if (alive) setWx(w)
        } catch { /* noop */ }
      }, 20 * 60 * 1000)
    })
    return () => { alive = false; if (timer) clearInterval(timer) }
  }, [])

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')

  return (
    <div className="glass clock-widget" aria-label="Hora, ubicación y clima">
      <div className="time">{hh}:{mm}<span style={{ opacity: 0.5, fontSize: '0.6em' }}>:{ss}</span></div>
      <div className="meta">
        <div className="city">
          <span aria-hidden>📍</span>
          <span>{place ? place.city : 'Localizando…'}</span>
        </div>
        <div className="wx">
          {wx ? `${wx.icon} ${wx.temp}° · ${wx.text}` : 'Clima…'}
        </div>
      </div>
    </div>
  )
}
