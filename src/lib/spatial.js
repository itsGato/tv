// ============================================================
// Navegación espacial (mando/teclado) para Smart TV 10-foot UI.
// Se activa con data-spatial en los contenedores de elementos
// enfocables; el resto lo calcula la geometría de rects.
// ============================================================

const FOCUSABLE = 'button,[tabindex="0"],input,select,a[href],[data-card]'

export function spatialNavigate(root, fromEl, dir) {
  const all = Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.disabled && el.offsetParent !== null && el.getAttribute('aria-hidden') !== 'true',
  )
  if (!all.length) return false
  const start = fromEl && all.includes(fromEl) ? fromEl : document.activeElement
  if (!start || !all.includes(start)) { all[0].focus(); return true }

  const r1 = start.getBoundingClientRect()
  const cx1 = r1.left + r1.width / 2
  const cy1 = r1.top + r1.height / 2

  let best = null
  let bestScore = Infinity

  for (const el of all) {
    if (el === start) continue
    const r2 = el.getBoundingClientRect()
    const cx2 = r2.left + r2.width / 2
    const cy2 = r2.top + r2.height / 2
    const dx = cx2 - cx1
    const dy = cy2 - cy1

    let primary, secondary, aligned
    if (dir === 'ArrowRight') { primary = dx; secondary = Math.abs(dy); aligned = dx > 4 }
    else if (dir === 'ArrowLeft') { primary = -dx; secondary = Math.abs(dy); aligned = dx < -4 }
    else if (dir === 'ArrowDown') { primary = dy; secondary = Math.abs(dx); aligned = dy > 4 }
    else { primary = -dy; secondary = Math.abs(dx); aligned = dy < -4 }

    if (!aligned) continue
    // Penaliza desviaciones del eje transversal (mantén columnas coherentes)
    const score = primary + secondary * secondary / Math.max(80, r2.width)
    if (score < bestScore) { bestScore = score; best = el }
  }

  if (best) {
    best.focus({ preventScroll: false })
    const box = best.closest('.spatial-keep-scroll')
    void box
    return true
  }
  return false
}

let installed = false
export function installSpatialNav(getRoots) {
  if (installed) return () => {}
  installed = true

  const onKey = (e) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
    const t = e.target
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return

    // Determina el root espacial más cercano al elemento enfocado
    const active = document.activeElement
    let node = active
    let root = null
    while (node && node !== document.body) {
      if (node.dataset && node.dataset.spatial != null) { root = node; break }
      node = node.parentElement
    }
    if (!root) {
      const roots = getRoots()
      root = (active && active.closest('[data-spatial]')) || (roots.length ? roots[0] : null)
    }
    if (!root) return

    if (spatialNavigate(root, active, e.key)) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  document.addEventListener('keydown', onKey, true)
  return () => { installed = false; document.removeEventListener('keydown', onKey, true) }
}
