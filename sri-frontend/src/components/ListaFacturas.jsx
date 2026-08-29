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

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.mensaje || `Error ${response.status}`)
      }

      // El Lambda devuelve base64 en el body
      const data      = await response.json()
      const pdfBase64 = data.pdf_base64 || data.body || data
      const bytes     = atob(pdfBase64)
      const arr       = new Uint8Array(bytes.length)
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
      setErrorDescarga(err.message)
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

        {/* Formulario búsqueda */}
        <form onSubmit={handleConsultar} style={styles.form}>
          <input
            value       = {clave}
            onChange    = {e => setClave(e.target.value)}
            placeholder = "Clave de acceso (49 dígitos)"
            maxLength   = {49}
            required
            style       = {styles.input}
          />
          <button
            type     = "submit"
            style    = {styles.btnConsultar}
            disabled = {estado === 'loading'}
          >
            {estado === 'loading' ? 'Consultando...' : 'Consultar'}
          </button>
        </form>

        {/* Error de consulta */}
        {error && (
          <p style={styles.error}>{error}</p>
        )}

        {/* Resultado */}
        {factura && estado === 'ok' && info && (
          <div
            style     = {{ ...styles.resultado, background: info.color }}
            className = "fade-in"
          >
            {/* Badge de estado */}
            <div style={styles.badgeRow}>
              <span style={{ fontSize: '1.5rem' }}>{info.icono}</span>
              <span style={{ ...styles.estadoLabel, color: info.texto }}>
                {info.label}
              </span>
            </div>

            {/* Datos de autorización */}
            {factura.numero_autorizacion && (
              <div style={styles.dato}>
                <span style={styles.datoLabel}>Número de autorización</span>
                <span style={styles.datoValor}>{factura.numero_autorizacion}</span>
              </div>
            )}

            {factura.fecha_autorizacion && (
              <div style={styles.dato}>
                <span style={styles.datoLabel}>Fecha de autorización</span>
                <span style={styles.datoValor}>{factura.fecha_autorizacion}</span>
              </div>
            )}

            {/* Mensaje adicional */}
            {factura.mensaje && (
              <div style={styles.dato}>
                <span style={styles.datoLabel}>Detalle</span>
                <span style={{ ...styles.datoValor, color: info.texto }}>
                  {factura.mensaje}
                </span>
              </div>
            )}

            {/* Botón descargar RIDE — solo si está autorizado */}
            {factura.estado === 'AUTORIZADO' && (
              <div style={{ marginTop: '1rem' }}>
                <button
                  onClick  = {descargarRIDE}
                  style    = {{
                    ...styles.btnRIDE,
                    opacity: descargando ? 0.7 : 1
                  }}
                  disabled = {descargando}
                >
                  {descargando ? '⏳ Generando PDF...' : '⬇ Descargar RIDE (PDF)'}
                </button>

                {errorDescarga && (
                  <p style={{ ...styles.error, marginTop: '0.5rem' }}>
                    {errorDescarga}
                  </p>
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