// ============================================================
// Persistencia en localStorage: configuración, favoritos, orden
// ============================================================

const PREFIX = 'tdt:'

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* almacenamiento lleno o bloqueado (modo privado) */
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* noop */
  }
}

export const DEFAULT_CONFIG = {
  performanceMode: false,        // maestro: apaga precarga, animaciones y canales UHD/2K
  resolutions: ['uhd', 'qhd', 'fhd', 'hd', 'sd'], // resoluciones visibles
  autoDetectRes: true,           // prioridad de calidad según pantalla del dispositivo
  preferredResolution: null,     // null => auto; si no, fuerza una resolución preferida
  preloadFavorites: true,        // precarga silenciosa de manifiestos favoritos
  preloadLimit: 3,               // 1..5 streams precargados simultáneamente
  corsProxy: '',                 // URL opcional de proxy CORS (ej. https://corsproxy.io/?url=)
  showBlocked: false,            // mostrar canales en la blocklist oficial (informativo)
}

export function loadConfig() {
  const cfg = { ...DEFAULT_CONFIG, ...load('config', {}) }
  // En modo rendimiento se fuerzan las restricciones dependientes
  if (cfg.performanceMode) {
    cfg.resolutions = cfg.resolutions.filter((r) => r !== 'uhd' && r !== 'qhd')
    if (!cfg.resolutions.length) cfg.resolutions = ['fhd', 'hd', 'sd']
  }
  return cfg
}

export const saveConfig = (cfg) => save('config', cfg)

export function loadFavorites() {
  const favs = load('favorites', [])
  return Array.isArray(favs) ? favs : []
}

export const saveFavorites = (f) => save('favorites', f)

export function loadOrder() {
  const o = load('order', null)
  return Array.isArray(o) ? o : null
}

export const saveOrder = (o) => save('order', o)

export async function clearIptvCache() {
  // Borra entradas de caché del service worker relacionadas con iptv-org
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(
      keys.map(async (k) => {
        const cache = await caches.open(k)
        const reqs = await cache.keys()
        await Promise.all(
          reqs
            .filter((r) => /iptv-org|ipapi|ipwho|open-meteo/i.test(r.url))
            .map((r) => cache.delete(r)),
        )
      }),
    )
  }
}
