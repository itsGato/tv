// ============================================================
// Soporte de mandos a distancia Smart TV: Samsung Tizen, LG
// webOS, Android TV y códigos genéricos HID.
// ============================================================

export const TV_KEYS = {
  // Samsung Tizen
  '10009': 'Backspace',
  '4': 'Enter',
  // LG webOS
  '415': 'Backspace',
  '465': 'Info',
  // Genéricos Android TV / STB
  '193': 'Red',
  '194': 'Green',
  '195': 'Yellow',
  '196': 'Blue',
  '457': 'ChannelUp',
  '458': 'ChannelDown',
  '461': 'Guide',
}

/**
 * Normaliza un KeyboardEvent de mando a un nombre lógico de acción.
 */
export function normalizeRemoteKey(e) {
  const code = String(e.keyCode || e.which || '')
  if (TV_KEYS[code]) return TV_KEYS[code]
  switch (e.key) {
    case 'MediaPlayPause': return 'Play'
    case 'MediaPlay': return 'Play'
    case 'MediaPause': return 'Pause'
    case 'MediaStop': return 'Stop'
    case 'MediaTrackNext': return 'ChannelUp'
    case 'MediaTrackPrevious': return 'ChannelDown'
    case 'Backspace': return 'Back'
    case 'Escape': return 'Back'
    case 'GoBack': return 'Back'
    case 'BrowserBack': return 'Back'
    case 'Info': return 'Info'
    case 'i': return 'Info'
    default: return e.key
  }
}

const CHANNEL_MAP = {
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
  Numpad0: '0', Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4',
  Numpad5: '5', Numpad6: '6', Numpad7: '7', Numpad8: '8', Numpad9: '9',
}

export function digitFromEvent(e) {
  if (CHANNEL_MAP[e.code]) return CHANNEL_MAP[e.code]
  if (/^[0-9]$/.test(e.key)) return e.key
  return null
}
