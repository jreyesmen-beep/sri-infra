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

const styles = {
  titulo:      { fontSize: '1.75rem', marginBottom: '0.25rem' },
  subtitulo:   { color: '#64748B', fontSize: '0.875rem', marginBottom: '2rem' },
  card:        { background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  form:        { display: 'flex', gap: '0.75rem', marginBottom: '1rem' },
  input:       { flex: 1, padding: '0.75rem 1rem', border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '0.875rem', fontFamily: "'DM Mono', monospace", outline: 'none', color: '#0F1923' },
  btnConsultar:{ background: '#00875A', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.75rem 1.25rem', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' },
  error:       { background: '#FFF5F5', color: '#E53E3E', padding: '0.75rem', borderRadius: '8px', fontSize: '0.875rem', margin: '0' },
  resultado:   { borderTop: '1px solid #E2E8F0', paddingTop: '1.25rem', marginTop: '0.5rem', borderRadius: '10px', padding: '1.25rem' },
  badgeRow:    { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' },
  estadoLabel: { fontWeight: 700, fontSize: '1rem' },
  dato:        { display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.75rem' },
  datoLabel:   { fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600, color: '#64748B' },
  datoValor:   { fontFamily: "'DM Mono', monospace", fontSize: '0.8rem', color: '#0F1923', wordBreak: 'break-all' },
  btnRIDE:     { background: '#00875A', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.75rem 1.5rem', fontWeight: 600, fontSize: '0.9rem', width: '100%', cursor: 'pointer' },
  btnReintentar:{ background: 'transparent', border: '1.5px solid #E2E8F0', borderRadius: '6px', padding: '0.5rem 1rem', color: '#64748B', fontSize: '0.875rem', cursor: 'pointer', marginTop: '0.75rem' },
  aviso:       { display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', marginTop: '0.75rem' },
}