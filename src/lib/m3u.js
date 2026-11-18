// ============================================================
// Parser de listas M3U de iptv-org
// Formato: #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="...",Nombre
// ============================================================

export function parseM3U(text) {
  const lines = String(text || '').split(/\r?\n/)
  const streams = []
  let pending = null

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    if (line.startsWith('#EXTINF')) {
      const commaIdx = line.indexOf(',')
      const attrsPart = commaIdx >= 0 ? line.slice(0, commaIdx) : line
      const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : ''
      const attrs = {}
      const re = /([\w-]+)="([^"]*)"/g
      let m
      while ((m = re.exec(attrsPart))) attrs[m[1].toLowerCase()] = m[2]
      pending = {
        id: `${attrs['tvg-id'] || name || 'ch'}|$|${streams.length}`, // id único provisional
        tvgId: attrs['tvg-id'] || '',
        tvgName: attrs['tvg-name'] || '',
        logo: attrs['tvg-logo'] || '',
        group: attrs['group-title'] || '',
        name: name || attrs['tvg-name'] || attrs['tvg-id'] || 'Canal',
      }
      continue
    }

    if (line.startsWith('#')) continue // otras directivas (#EXTVLCOPT, etc.)

    // Línea de URL
    if (pending) {
      streams.push({ ...pending, url: line })
      pending = null
    } else if (/^https?:\/\//i.test(line)) {
      streams.push({
        id: `anon|$|${streams.length}`,
        tvgId: '',
        tvgName: '',
        logo: '',
        group: '',
        name: decodeURIComponent(line.split('/').pop().split('?')[0]) || 'Stream',
        url: line,
      })
    }
  }
  return streams
}
