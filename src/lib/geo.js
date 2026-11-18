// ============================================================
// Ubicación y clima: geolocalización → fallback por IP → Open-Meteo
// ============================================================

const CITY_CACHE_KEY = 'tdt:city'
const CITY_TTL = 24 * 3600 * 1000

export async function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(to)
  }
}

// Invierte coordenadas con Nominatim (sin API key). Best-effort.
async function reverseGeocode(lat, lon) {
  try {
    const r = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=es`,
      7000,
    )
    const j = await r.json()
    const a = j.address || {}
    const city = a.city || a.town || a.village || a.municipality || a.county || a.state
    const country = a.country || ''
    if (city) return { city, country, lat, lon }
  } catch { /* silencioso */ }
  return null
}

async function geoFromIP() {
  // ipapi.co → ipwho.is como segundo fallback
  try {
    const r = await fetchWithTimeout('https://ipapi.co/json/', 7000)
    const j = await r.json()
    if (j && j.city) return { city: j.city, country: j.country_name || '', lat: j.latitude, lon: j.longitude }
  } catch { /* sigue el fallback */ }
  try {
    const r = await fetchWithTimeout('https://ipwho.is/', 7000)
    const j = await r.json()
    if (j && j.success !== false && j.city) return { city: j.city, country: j.country || '', lat: j.latitude, lon: j.longitude }
  } catch { /* sin ubicación */ }
  return null
}

function browserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    let done = false
    const finish = (v) => { if (!done) { done = true; resolve(v) } }
    setTimeout(() => finish(null), 6000)
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => finish(null),
      { timeout: 5000, maximumAge: 600000 },
    )
  })
}

export async function resolveCity() {
  // Caché de ciudad para no repetir permisos/peticiones en cada arranque
  try {
    const cached = JSON.parse(localStorage.getItem(CITY_CACHE_KEY) || 'null')
    if (cached && Date.now() - cached.ts < CITY_TTL) return cached.data
  } catch { /* noop */ }

  let data = null
  const geo = await browserLocation()
  if (geo) {
    data = await reverseGeocode(geo.lat, geo.lon)
    if (!data) data = { city: 'Tu ubicación', country: '', lat: geo.lat, lon: geo.lon }
  }
  if (!data) data = await geoFromIP()
  if (!data) data = { city: 'España', country: 'España', lat: 40.4168, lon: -3.7038 } // default Madrid

  try { localStorage.setItem(CITY_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })) } catch { /* noop */ }
  return data
}

// WMO weather code → icono + descripción mínima
export function weatherMeta(code) {
  if (code == null) return { icon: '❔', text: '—' }
  if (code === 0) return { icon: '☀️', text: 'Despejado' }
  if (code <= 2) return { icon: '🌤️', text: 'Poco nublado' }
  if (code === 3) return { icon: '☁️', text: 'Nublado' }
  if (code <= 48) return { icon: '🌫️', text: 'Niebla' }
  if (code <= 57) return { icon: '🌦️', text: 'Llovizna' }
  if (code <= 67) return { icon: '🌧️', text: 'Lluvia' }
  if (code <= 77) return { icon: '🌨️', text: 'Nieve' }
  if (code <= 82) return { icon: '🌧️', text: 'Chubascos' }
  if (code <= 86) return { icon: '🌨️', text: 'Chubascos nevada' }
  if (code <= 99) return { icon: '⛈️', text: 'Tormenta' }
  return { icon: '🌡️', text: '—' }
}

export async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`
  const r = await fetchWithTimeout(url, 8000)
  const j = await r.json()
  const cur = j.current || {}
  return {
    temp: Math.round(cur.temperature_2m ?? 0),
    code: cur.weather_code,
    ...weatherMeta(cur.weather_code),
  }
}
