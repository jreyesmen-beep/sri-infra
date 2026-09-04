import { useState } from 'react'
import { getToken } from '../services/auth'

const API_URL = import.meta.env.VITE_API_URL

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
  const [clave,         setClave]         = useState('')
  const [factura,       setFactura]       = useState(null)
  const [cargando,      setCargando]      = useState(false)
  const [descargando,   setDescargando]   = useState(false)
  const [error,         setError]         = useState('')
  const [errorDescarga, setErrorDescarga] = useState('')

  async function handleConsultar(e) {
    e.preventDefault()
    setCargando(true)
    setError('')
    setFactura(null)
    setErrorDescarga('')

    try {
      const res = await fetch(`${API_URL}/facturas/${clave}`, {
        headers: { "Authorization": `Bearer ${getToken()}` }
      })
      const data = await res.json()
      setFactura(data)
    } catch (err) {
      setError('Error al consultar el comprobante: ' + err.message)
    } finally {
      setCargando(false)
    }
  }

  async function descargarRIDE() {
    setDescargando(true)
    setErrorDescarga('')
    try {
      const res = await fetch(`${API_URL}/facturas/${clave}/ride`, {
        headers: { "Authorization": `Bearer ${getToken()}` }
      })

      const texto = await res.text()

      if (!res.ok) {
        const data = JSON.parse(texto)
        throw new Error(data.mensaje || `Error ${res.status}`)
      }

      const data      = JSON.parse(texto)
      const pdfBase64 = data.pdf_base64

      if (!pdfBase64) throw new Error("No se recibió el PDF")

      const bytes = atob(pdfBase64)
      const arr   = new Uint8Array(bytes.length)
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)

      const blob = new Blob([arr], { type: "application/pdf" })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `factura-${clave}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

    } catch (err) {
      setErrorDescarga('Error al descargar: ' + err.message)
    } finally {
      setDescargando(false)
    }
  }

  const info = factura ? (ESTADOS[factura.estado] || ESTADOS.ERROR_INTERNO) : null

  return (
    <div className="fade-in">
      <h2 style={styles.titulo}>Consultar Comprobante</h2>
      <p  style={styles.subtitulo}>
        Ingresa la clave de acceso para consultar el estado
      </p>

      <div style={styles.card}>

        {/* Formulario */}
        <form onSubmit={handleConsultar} style={styles.form}>
          <input
            value       = {clave}
            onChange    = {e => setClave(e.target.value.trim())}
            placeholder = "Clave de acceso (49 dígitos)"
            maxLength   = {49}
            required
            style       = {styles.input}
          />
          <button
            type     = "submit"
            style    = {styles.btnConsultar}
            disabled = {cargando || clave.length !== 49}
          >
            {cargando ? 'Consultando...' : 'Consultar'}
          </button>
        </form>

        {/* Contador de dígitos */}
        {clave.length > 0 && clave.length !== 49 && (
          <p style={styles.contador}>
            {clave.length}/49 dígitos
          </p>
        )}

        {/* Error de consulta */}
        {error && (
          <div style={styles.errorBox}>{error}</div>
        )}

        {/* Resultado */}
        {factura && info && (
          <div
            style     = {{ ...styles.resultado, background: info.color }}
            className = "fade-in"
          >
            {/* Badge estado */}
            <div style={styles.badgeRow}>
              <span style={{ fontSize: '1.5rem' }}>{info.icono}</span>
              <span style={{ ...styles.estadoLabel, color: info.texto }}>
                {info.label}
              </span>
            </div>

            {/* Número de autorización */}
            {factura.numero_autorizacion && (
              <div style={styles.dato}>
                <span style={styles.datoLabel}>Número de autorización</span>
                <span style={styles.datoValor}>
                  {factura.numero_autorizacion}
                </span>
              </div>
            )}

            {/* Fecha de autorización */}
            {factura.fecha_autorizacion && (
              <div style={styles.dato}>
                <span style={styles.datoLabel}>Fecha de autorización</span>
                <span style={styles.datoValor}>
                  {factura.fecha_autorizacion}
                </span>
              </div>
            )}

            {/* Mensaje */}
            {factura.mensaje && (
              <div style={styles.dato}>
                <span style={styles.datoLabel}>Detalle</span>
                <span style={{ ...styles.datoValor, color: info.texto }}>
                  {factura.mensaje}
                </span>
              </div>
            )}

            {/* Botón RIDE — solo si está autorizado */}
            {factura.estado === 'AUTORIZADO' && (
              <div style={{ marginTop: '1rem' }}>
                <button
                  onClick  = {descargarRIDE}
                  disabled = {descargando}
                  style    = {{
                    ...styles.btnRIDE,
                    opacity: descargando ? 0.7 : 1
                  }}
                >
                  {descargando ? '⏳ Generando PDF...' : '⬇ Descargar RIDE (PDF)'}
                </button>
                {errorDescarga && (
                  <div style={{ ...styles.errorBox, marginTop: '0.5rem' }}>
                    {errorDescarga}
                  </div>
                )}
              </div>
            )}

            {/* Aviso SRI no disponible */}
            {factura.estado === 'SRI_NO_DISPONIBLE' && (
              <div style={styles.aviso}>
                <p>El SRI no estaba disponible. Tu comprobante se reintentará automáticamente.</p>
                <button
                  onClick = {handleConsultar}
                  style   = {styles.btnReintentar}
                >
                  Verificar de nuevo
                </button>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  titulo:      { fontSize: '1.75rem', marginBottom: '0.25rem' },
  subtitulo:   { color: '#64748B', fontSize: '0.875rem', marginBottom: '2rem' },
  card:        { background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  form:        { display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' },
  input:       { flex: 1, padding: '0.75rem 1rem', border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '0.875rem', fontFamily: "'DM Mono', monospace", outline: 'none', color: '#0F1923' },
  btnConsultar:{ background: '#00875A', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.75rem 1.25rem', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap' },
  contador:    { color: '#94A3B8', fontSize: '0.75rem', marginBottom: '0.5rem' },
  errorBox:    { background: '#FFF5F5', color: '#E53E3E', padding: '0.75rem', borderRadius: '8px', fontSize: '0.875rem' },
  resultado:   { borderRadius: '10px', padding: '1.25rem', marginTop: '1rem' },
  badgeRow:    { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' },
  estadoLabel: { fontWeight: 700, fontSize: '1rem' },
  dato:        { display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.75rem' },
  datoLabel:   { fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600, color: '#64748B' },
  datoValor:   { fontFamily: "'DM Mono', monospace", fontSize: '0.8rem', color: '#0F1923', wordBreak: 'break-all' },
  btnRIDE:     { background: '#00875A', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.75rem 1.5rem', fontWeight: 600, fontSize: '0.9rem', width: '100%', cursor: 'pointer' },
  btnReintentar:{ background: 'transparent', border: '1.5px solid #E2E8F0', borderRadius: '6px', padding: '0.5rem 1rem', color: '#64748B', fontSize: '0.875rem', cursor: 'pointer', marginTop: '0.75rem' },
  aviso:       { display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', marginTop: '0.75rem' },
}