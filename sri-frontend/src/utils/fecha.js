// src/utils/fecha.js

/**
 * Convierte una fecha ISO a hora Ecuador (UTC-5)
 * Formatos de entrada soportados:
 * - "2026-09-27T19:05:58Z"
 * - "2026-09-27T19:05:58-05:00"
 * - "2026-09-27T14:30:00.000Z"
 */
export function formatearFechaEcuador(fechaStr) {
  if (!fechaStr) return '—'

  try {
    const fecha = new Date(fechaStr)

    return fecha.toLocaleString('es-EC', {
      timeZone:     'America/Guayaquil',
      day:          '2-digit',
      month:        '2-digit',
      year:         'numeric',
      hour:         '2-digit',
      minute:       '2-digit',
      second:       '2-digit',
      hour12:       false,
    })
  } catch {
    return fechaStr
  }
}

export function formatearSoloFecha(fechaStr) {
  if (!fechaStr) return '—'

  try {
    const fecha = new Date(fechaStr)

    return fecha.toLocaleDateString('es-EC', {
      timeZone: 'America/Guayaquil',
      day:      '2-digit',
      month:    '2-digit',
      year:     'numeric',
    })
  } catch {
    return fechaStr
  }
}

export function formatearSoloHora(fechaStr) {
  if (!fechaStr) return '—'

  try {
    const fecha = new Date(fechaStr)

    return fecha.toLocaleTimeString('es-EC', {
      timeZone: 'America/Guayaquil',
      hour:     '2-digit',
      minute:   '2-digit',
      second:   '2-digit',
      hour12:   false,
    })
  } catch {
    return fechaStr
  }
}