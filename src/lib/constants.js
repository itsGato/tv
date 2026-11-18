// ============================================================
// Constantes de fuentes de datos públicas de iptv-org (España)
// ============================================================

export const IPTV_API = 'https://iptv-org.github.io/api'

// Todos los endpoints JSON documentados de la API de iptv-org
export const API_FILES = {
  channels: `${IPTV_API}/channels.json`,
  feeds: `${IPTV_API}/feeds.json`,
  logos: `${IPTV_API}/logos.json`,
  streams: `${IPTV_API}/streams.json`,
  blocked: `${IPTV_API}/blocked.json`,
  guides: `${IPTV_API}/guides.json`,
  categories: `${IPTV_API}/categories.json`,
  languages: `${IPTV_API}/languages.json`,
  countries: `${IPTV_API}/countries.json`,
  subdivisions: `${IPTV_API}/subdivisions.json`,
  cities: `${IPTV_API}/cities.json`,
  regions: `${IPTV_API}/regions.json`,
  timezones: `${IPTV_API}/timezones.json`,
}

// Lista M3U oficial de España (fuente primaria de streams)
export const M3U_ES = 'https://iptv-org.github.io/iptv/countries/es.m3u'

// EPG (guías) para canales españoles
export const EPG_ES = 'https://iptv-org.github.io/epg/guides/es.json'

// Orden "TDT España" clásico (RTVE, autonómicas, nacionales privadas).
// Los canales que no figuren se añaden al final en orden alfabético.
export const DEFAULT_TDT_ORDER = [
  'la1', 'la2', 'teledeporte', 'ntv', 'canal24h',
  'antena3', 'lasexta', 'cuatro', 'telecinco', 'fdf',
  'ten', 'dmax', 'dkiss', 'mega', 'atreseries', 'nova', 'numar',
  'tv3', 'el9', 'betevé', 'cmm', 'tvga', 'tpart', 'telemadrid', 'oda', '8madrid',
  'canalsur', 'tvg', 'mpb', 'ib3', 'la7clm',
  'bemad', 'paramountnetwork', 'dtl', 'energy', 'classicdp', 'realmtv',
  'mtvespana', 'nitro', 'golf', 'canalfamiliar', 'divinity', 'odisea', 'masqd',
  'somos', 'xplora', 'trece', '13tv',
]

// Categorías destacadas en el filtro horizontal
export const FEATURED_CATEGORIES = [
  'general', 'news', 'sports', 'kids', 'movies', 'music', 'documentary',
  'series', 'entertainment', 'regional', 'local',
]

export const RES_LABEL = { sd: 'SD', hd: 'HD', fhd: 'FHD', qhd: '2K', uhd: 'UHD/4K' }

// Preferencia de resolución según ancho físico aproximado de pantalla
export function autoResolution(screenWidth) {
  if (screenWidth >= 3840) return 'uhd'
  if (screenWidth >= 2560) return 'qhd'
  if (screenWidth >= 1920) return 'fhd'
  if (screenWidth >= 1280) return 'hd'
  return 'sd'
}
