import { useRef, useState } from 'react'

/**
 * Tarjeta de canal con:
 *  - efecto 3D tilt siguiendo el cursor (desactivado en modo rendimiento)
 *  - fallback elegante de logotipo
 *  - estrella de favorito
 *  - etiqueta de resolución
 *  - drag & drop y wiggle en modo reorganización
 */
export default function ChannelCard({
  channel,
  position,
  favorite,
  preloading,
  performanceMode,
  reorderMode,
  onOpen,
  onToggleFavorite,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const ref = useRef(null)
  const [imgError, setImgError] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const best = channel.streams[0]
  const resLabel = { sd: 'SD', hd: 'HD', fhd: 'FHD', qhd: '2K', uhd: 'UHD' }[best?.resolution || 'sd']

  // ---- tilt 3D ----
  const handleMove = (e) => {
    if (performanceMode || reorderMode || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    ref.current.style.transform =
      `perspective(750px) rotateY(${px * 9}deg) rotateX(${-py * 9}deg) translateY(-3px) scale(1.015)`
  }
  const resetTilt = () => {
    if (ref.current) ref.current.style.transform = ''
  }

  const initials = channel.displayBase
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')

  return (
    <div
      ref={ref}
      className={[
        'card',
        reorderMode ? 'wiggle' : '',
        dragOver ? 'drop-target' : '',
        preloading ? 'preloading' : '',
      ].filter(Boolean).join(' ')}
      role="button"
      tabIndex={0}
      data-card=""
      aria-label={`${channel.name}. ${resLabel}. Posición ${position + 1}`}
      draggable={reorderMode}
      onPointerMove={handleMove}
      onPointerLeave={resetTilt}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(channel.id) }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); onDragOver?.(channel.id) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop?.(channel.id) }}
      onDragEnd={() => { setDragOver(false); onDragEnd?.() }}
      onClick={() => !reorderMode && onOpen(channel)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !reorderMode) { e.preventDefault(); onOpen(channel) }
      }}
    >
      <button
        type="button"
        className={`star ${favorite ? 'on' : ''}`}
        aria-label={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        title="Favorito"
        tabIndex={-1}
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(channel.id) }}
      >
        {favorite ? '★' : '☆'}
      </button>

      <div className="tilt-inner">
        <div className="logo-box">
          {channel.logo && !imgError ? (
            <img
              className="logo"
              src={channel.logo}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="logo-fallback">{initials || 'TV'}</span>
          )}
        </div>
        <div className="name">{channel.displayBase}</div>
        <div className="sub">
          <span className={`badge ${best?.resolution || 'sd'}`}>{resLabel}</span>
          <span>{channel.categories[0] || 'General'}</span>
        </div>
        <span className="pos-tag">{position + 1}</span>
      </div>
    </div>
  )
}
