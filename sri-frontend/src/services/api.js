import { getToken } from './auth'

const BASE_URL = import.meta.env.VITE_API_URL

async function request(method, path, body = null) {
  const headers = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${getToken()}`
  }

  const config = { method, headers }
  if (body) config.body = JSON.stringify(body)

  const res = await fetch(`${BASE_URL}${path}`, config)

  // ✅ 404 en configuración no es error — devolver null
  if (res.status === 404 && path === '/configuracion') {
    return null
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ mensaje: 'Error desconocido' }))
    throw new Error(error.mensaje || `Error ${res.status}`)
  }

  return res.json()
}

// Emitir nueva factura
export const emitirFactura = (datos)        => request('POST', '/facturas', datos)

// Consultar estado de un comprobante
export const consultarFactura = (claveAcceso) => request('GET', `/facturas/${claveAcceso}`)

// Opcion de Configuracion de RUC
export const obtenerConfiguracion = ()      => request('GET', '/configuracion')
export const guardarConfiguracion = (datos) => request('PUT', '/configuracion', datos)