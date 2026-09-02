import { useState } from 'react'
import { consultarFactura } from '../services/api'
import { getToken } from '../services/auth'

const ESTADOS = {
  AUTORIZADO:        { color: '#E3F5EE', texto: '#005C3D', icono: '✓', label: 'Autorizado'           },
  EN_PROCESO:        { color: '#EFF6FF', texto: '#1D4ED8', icono: '⏳', label: 'En proceso'           },
  NO_ENCONTRADO:     { color: '#F8FAFC', texto: '#64748B', icono: '○', label: 'No encontrado'         },
  SRI_NO_DISPONIBLE: { color: '#FFF7ED', texto: '#C2410C', icono: '⚠️', label: 'SRI no disponible'   },
  SRI_RECHAZO:       { color: '#FFF5F5', texto: '#E53E3E', icono: '✕', label: 'Rechazado por el SRI' },
  ERROR_INTERNO:     { color: '#FFF5F5', texto: '#E53E3E', icono: '✕', label: 'Error interno'         },
  NO_AUTORIZADO:     { color: '#FFF5F5', texto: '#E53E3E', icono: '✕', label: 'No autorizado'         },
}

export default function ListaFacturas() {
  const [clave,        setClave]        = useState('')
  const [factura,      setFactura]      = useState(null)
  const [estado,       setEstado]       = useState('idle')
  const [error,        setError]        = useState('')        // ← aquí estaba faltando
  const [descargando,  setDescargando]  = useState(false)
  const [errorDescarga, setErrorDescarga] = useState('')

  async function handleConsultar(e) {
    e.preventDefault()
    setEstado('loading')
    setError('')
    setFactura(null)
    try {
      const data = await consultarFactura(clave)
      setFactura(data)
      setEstado('ok')
    } catch (err) {
      setError(err.message)
      setEstado('error')
    }
  }

async function descargarRIDE() {
  setDescargando(true)
  setErrorDescarga('')
  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/facturas/${clave}/ride`,
      { headers: { "Authorization": `Bearer ${getToken()}` } }
    )

    // Siempre leer como texto primero
    const texto = await response.text()

    if (!response.ok) {
      try {
        const data = JSON.parse(texto)
        throw new Error(data.mensaje || `Error ${response.status}`)
      } catch {
        throw new Error(`Error ${response.status}`)
      }
    }

    // ✅ Parsear el JSON que contiene el PDF en base64
    let data
    try {
      data = JSON.parse(texto)
    } catch {
      throw new Error("Respuesta inválida del servidor")
    }

    if (!data.pdf_base64) {
      throw new Error("No se recibió el PDF del servidor")
    }

    // Decodificar base64 → bytes → Blob
    const binaryStr = atob(data.pdf_base64)
    const bytes     = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: "application/pdf" })

    // Descargar el blob
    const url = URL.createObjectURL(blob)
    const a   = document.createElement("a")
    a.href     = url
    a.download = data.filename || `factura-${clave}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    //logger.info?.(`PDF descargado: ${blob.size} bytes`)


  } catch (err) {
    setErrorDescarga(`Error al descargar: ${err.message}`)
  } finally {
    setDescargando(false)
  }
}
}

const styles = {
  contenedor: {
    display:   'flex',
    minHeight: '100vh',
  },
  sidebar: {
    width:         '220px',
    background:    '#0F1923',
    display:       'flex',
    flexDirection: 'column',
    padding:       '1.5rem',
    position:      'fixed',
    top:           0,
    left:          0,
    bottom:        0,
  },
  logoSide: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   '2rem',
    paddingBottom:  '1rem',
    borderBottom:   '1px solid #1E2D3D',
  },
  nav: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '0.5rem',
    flex:          1,
  },
  navItem: {
    padding:      '0.75rem 1rem',
    background:   'transparent',
    color:        '#94A3B8',
    border:       'none',
    borderRadius: '8px',
    textAlign:    'left',
    fontSize:     '0.9rem',
    cursor:       'pointer',
    transition:   'all 0.2s',
  },
  navActivo: {
    background: '#1E2D3D',
    color:      '#3B82F6',
    fontWeight: '600',
  },
  userInfo: {
    borderTop:  '1px solid #1E2D3D',
    paddingTop: '1rem',
  },
  userEmail: {
    color:        '#64748B',
    fontSize:     '0.75rem',
    marginBottom: '0.5rem',
    wordBreak:    'break-all',
  },
  btnLogout: {
    background:   'transparent',
    border:       '1px solid #2D3748',
    color:        '#64748B',
    borderRadius: '6px',
    padding:      '0.4rem 0.75rem',
    fontSize:     '0.8rem',
    width:        '100%',
    cursor:       'pointer',
  },
  main: {
    marginLeft: '220px',
    flex:       1,
    padding:    '2rem',
    maxWidth:   '960px',
  }
}
