// ============================================================
// Núcleo de datos: carga de la API iptv-org + M3U España,
// deduplicación inteligente por canal base y selección de
// mejor resolución según preferencias/capacidades del dispositivo.
// ============================================================

import { API_FILES, M3U_ES, DEFAULT_TDT_ORDER } from './constants.js'
import { parseM3U } from './m3u.js'

const RES_RANK = { sd: 0, hd: 1, fhd: 2, qhd: 3, uhd: 4 }
export const RES_ORDER = ['uhd', 'qhd', 'fhd', 'hd', 'sd']

// ---------- utilidades de texto ----------
const ACCENTS = { a: 'áàâãäå', c: 'ç', e: 'éèêë', i: 'íìîï', n: 'ñ', o: 'óòôõö', u: 'úùûü' }

export function normalizeName(s) {
  let t = String(s || '').toLowerCase()
  for (const k in ACCENTS) for (const c of ACCENTS[k]) t = t.split(c).join(k)
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Quita sufijos de calidad/variante para obtener el "canal base"
const QUALITY_TOKENS = [
  'uhd ?4k', '4k ?uhd', 'uhd', '4k', '8k',
  'full ?hd ?1080 ?p?', 'fhd ?1080 ?p?', '1080 ?p?', 'full ?hd',
  'qhd', '2k', '1440 ?p?', 'hd ?720 ?p?', '720 ?p?', 'hd ?1080', 'hd',
  'sd ?480 ?p?', '480 ?p?', '576 ?p?', 'sd', 'se',
  'hevc', 'h ?265', 'h ?264', 'avc', 'dolby', '(eu)', '(es)', '(espa[ñn]a)', '(online)',
]

export function baseOf(name) {
  let t = normalizeName(name)
  // separadores habituales en nombres IPTV
  t = t.replace(/\s*[-|·•–]\s*(hd|sd|fhd|uhd|4k|2k|se)\b\s*$/gi, '')
  let changed = true
  while (changed) {
    changed = false
    for (const tok of QUALITY_TOKENS) {
      const re = new RegExp(`(^|\\s|\\(|\\)|-|\\|)(${tok})(\\s|$|\\(|\\)|-|\\|)`, 'i')
      if (re.test(t)) {
        t = t.replace(re, ' ')
        changed = true
      }
    }
  }
  t = t.trim().replace(/\s+/g, ' ').replace(/[-|·]+$/, '').trim()
  return t
}

// Detecta resolución desde nombre/url. Prioriza tokens con prefijo/sufijo claro.
export function detectResolution(name, url) {
  const hay = `${normalizeName(name)} ${normalizeName(url)}`
  const checks = [
    ['uhd', /\b(uhd|2160p|(?:^|[^a-z0-9])4k(?:$|[^a-z0-9]))\b/],
    ['qhd', /\b(qhd|1440p|(?:^|[^a-z0-9])2k(?:$|[^a-z0-9]))\b/],
    ['fhd', /\b(fhd|full ?hd|1080p?)\b/],
    ['hd', /\b(hd ?720|720p?|hd)\b/],
    ['sd', /\b(sd|480p?|576p?)\b/],
  ]
  for (const [res, re] of checks) if (re.test(hay)) return res
  return null
}

// Nombre limpio para mostrar (sin dobles espacios ni guiones sueltos al final)
export function cleanDisplayName(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-|·]\s*$/, '')
    .trim()
}

// ---------- fetch con timeout ----------
async function fetchWithTimeout(url, ms = 15000) {
  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`)
    return r
  } finally {
    clearTimeout(to)
  }
}

// Carga JSON de la API con caché HTTP (los ficheros de iptv-org se actualizan a diario)
async function getJSON(url) {
  const r = await fetchWithTimeout(url)
  return r.json()
}

// ---------- agrupación principal ----------
export async function buildChannels({ onProgress }) {
  const step = (label, pct) => onProgress && onProgress(label, pct)

  step('Descargando lista M3U de España…', 8)
  const m3uText = await (await fetchWithTimeout(M3U_ES)).text()
  const streams = parseM3U(m3uText)

  step('Consultando API iptv-org (canales)…', 28)
  const [channelsApi, logosMap, blockedList, categoriesApi] = await Promise.all([
    getJSON(API_FILES.channels).catch(() => []),
    getJSON(API_FILES.logos).then((l) => {
      const map = {}
      for (const item of l) {
        if (!map[item.channel]) map[item.channel] = []
        map[item.channel].push(item.url)
      }
      return map
    }).catch(() => ({})),
    getJSON(API_FILES.blocked).catch(() => []),
    getJSON(API_FILES.categories).catch(() => []),
  ])

  step('Consultando feeds y subdivisiones…', 55)
  const [feeds, subdivisions] = await Promise.all([
    getJSON(API_FILES.feeds).catch(() => []),
    getJSON(API_FILES.subdivisions).catch(() => []),
  ])

  const chanById = new Map(channelsApi.map((c) => [c.id, c]))
  const feedById = new Map(feeds.map((f) => [f.feed_id, f]))
  const subByCode = new Map(subdivisions.map((s) => [s.code, s]))
  const catById = new Map(categoriesApi.map((c) => [c.id, c]))
  const blockedIds = new Set(blockedList.map((b) => b.channel))

  step('Deduplicando canales por resolución…', 75)

  // Agrupa streams por canal base
  const groups = new Map()
  for (const s of streams) {
    const ch = s.tvgId ? chanById.get(s.tvgId) : null
    const canonical = ch ? ch.name : s.name
    const key = s.tvgId || baseOf(canonical) || normalizeName(canonical)
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        channelId: s.tvgId || '',
        name: canonical,
        altNames: new Set(),
        logo: s.logo || (logosMap[s.tvgId]?.[0]) || '',
        extraLogos: logosMap[s.tvgId] || [],
        country: ch ? ch.country : 'ES',
        subdivision: ch && ch.subdivision ? subByCode.get(ch.subdivision)?.name : '',
        categories: ch ? ch.categories : [],
        isNSFW: ch ? !!ch.is_nsfw : false,
        streams: [],
      })
    }
    const g = groups.get(key)
    g.altNames.add(s.name)
    if (ch && !g.logo && logosMap[g.channelId]?.[0]) g.logo = logosMap[g.channelId][0]

    const feed = s.tvgId ? feedById.get(`${s.tvgId}/${baseOf(s.name)}`) : null
    g.streams.push({
      streamId: s.id,
      url: s.url,
      label: cleanDisplayName(s.name),
      resolution: detectResolution(s.name, s.url) || (feed && feed.is_hd ? 'hd' : 'sd'),
      qualityRank: RES_RANK[detectResolution(s.name, s.url) || (feed && feed.is_hd ? 'hd' : 'sd')] ?? 0,
      isHD: !!(feed && feed.is_hd),
      guideAvailable: !!(feed && feed.guides?.length),
    })
  }

  // Enriquece categorías legibles y marca bloqueados
  const result = []
  for (const g of groups.values()) {
    if (g.isNSFW) continue
    const cats = g.categories.length
      ? g.categories.map((c) => catById.get(c)?.name || c)
      : [g.group].filter(Boolean)
    result.push({
      id: g.key || g.name,
      channelId: g.channelId,
      name: cleanDisplayName(g.name),
      displayBase: cleanDisplayName(baseOf(g.name) || g.name),
      logo: g.logo,
      extraLogos: g.extraLogos,
      categories: cats.length ? cats : ['General'],
      region: g.subdivision || 'España',
      blocked: blockedIds.has(g.channelId),
      streams: g.streams.sort((a, b) => b.qualityRank - a.qualityRank),
      maxResolution: g.streams[0]?.resolution || 'sd',
      hasUhd: g.streams.some((s) => s.resolution === 'uhd'),
      hasFhd: g.streams.some((s) => s.resolution === 'fhd'),
    })
  }

  step('Ordenando parrilla…', 92)
  result.sort((a, b) => compareDefault(a, b))

  step('Listo', 100)
  return result
}

// Orden original TDT España: primero los del listado clásico, luego alfabético
const defaultIndex = new Map(DEFAULT_TDT_ORDER.map((id, i) => [id, i]))
function compareDefault(a, b) {
  const ia = defaultIndex.get(normalizeName(a.displayBase).replace(/\s/g, ''))
  const ib = defaultIndex.get(normalizeName(b.displayBase).replace(/\s/g, ''))
  if (ia != null && ib != null) return ia - ib
  if (ia != null) return -1
  if (ib != null) return 1
  return a.displayBase.localeCompare(b.displayBase, 'es')
}

// ---------- selección de stream óptimo ----------
export function pickStream(channel, cfg, screenW) {
  const allowed = cfg.performanceMode
    ? ['fhd', 'hd', 'sd']
    : cfg.resolutions.length
      ? cfg.resolutions
      : ['uhd', 'qhd', 'fhd', 'hd', 'sd']
  const visible = channel.streams.filter((s) => allowed.includes(s.resolution))
  if (!visible.length) return null // canal sin streams dentro del filtro activo

  const preferred =
    cfg.preferredResolution ||
    (cfg.autoDetectRes ? undefined : 'fhd')

  if (preferred && allowed.includes(preferred)) {
    // exacto > inmediatamente inferior > superior disponible
    const pr = RES_RANK[preferred]
    const sorted = [...visible].sort((a, b) => {
      const da = Math.abs(RES_RANK[a.resolution] - pr)
      const db = Math.abs(RES_RANK[b.resolution] - pr)
      if (da !== db) return da - db
      return RES_RANK[b.resolution] - RES_RANK[a.resolution]
    })
    return sorted[0]
  }
  return visible[0] // ya ordenado por calidad desc
}

export function sortAlphabetically(list) {
  return [...list].sort((a, b) => a.displayBase.localeCompare(b.displayBase, 'es'))
}

export function sortByDefaultOrder(list) {
  return [...list].sort(compareDefault)
}
