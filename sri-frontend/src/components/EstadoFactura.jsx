// src/components/EstadoFactura.jsx
import { useState } from 'react'
import { consultarFactura } from '../services/api'

const ESTADOS = {
  AUTORIZADO:        { color: '#E3F5EE', texto: '#005C3D', icono: '✓', label: 'Autorizado'           },
  EN_PROCESO:        { color: '#EFF6FF', texto: '#1D4ED8', icono: '⏳', label: 'En proceso'           },
  SRI_NO_DISPONIBLE: { color: '#FFF7ED', texto: '#C2410C', icono: '⚠️', label: 'SRI no disponible'   },
  SRI_RECHAZO:       { color: '#FFF5F5', texto: '#E53E3E', icono: '✕', label: 'Rechazado por el SRI' },
  ERROR_INTERNO:     { color: '#FFF5F5', texto: '#E53E3E', icono: '✕', label: 'Error interno'        },
  NO_AUTORIZADO:     { color: '#FFF5F5', texto: '#E53E3E', icono: '✕', label: 'No autorizado'        },
}

export default function EstadoFactura({ claveAcceso, onCerrar }) {
  const [estado,   setEstado]  = useState(null)
  const [loading,  setLoading] = useState(false)
  const [error,    setError]   = useState('')

  async function consultar() {
    setLoading(true)
    setError('')
    try {
      const data = await consultarFactura(claveAcceso)
      setEstado(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const info = estado ? (ESTADOS[estado.estado] || ESTADOS.ERROR_INTERNO) : null

  return (
    <div style={styles.overlay}>
      <div style={styles.modal} className="fade-in">

        <button onClick={onCerrar} style={styles.btnCerrar}>✕</button>

        <h3 style={styles.titulo}>Estado del Comprobante</h3>
        <p  style={styles.clave}>{claveAcceso}</p>

        {!estado && !loading && (
          <button onClick={consultar} style={styles.btnConsultar}>
            Consultar estado
          </button>
        )}

        {loading && (
          <div style={styles.loading}>
            <div style={styles.spinner} />
            <p>Consultando al SRI...</p>
          </div>
        )}

        {error && (
          <div style={styles.errorBox}>
            <p style={styles.errorTitulo}>⚠️ Error al consultar</p>
            <p style={styles.errorMensaje}>{error}</p>
            <button onClick={consultar} style={styles.btnReintentar}>
              Reintentar
            </button>
          </div>
        )}

        {estado && info && (
          <div style={{ ...styles.estadoBox, background: info.color }} className="fade-in">
            <span style={{ ...styles.estadoIcono, color: info.texto }}>
              {info.icono}
            </span>
            <span style={{ ...styles.estadoLabel, color: info.texto }}>
              {info.label}
            </span>

            {/* AUTORIZADO */}
            {estado.estado === 'AUTORIZADO' && (
              <>
                <div style={styles.dato}>
                  <span style={styles.datoLabel}>Número de autorización</span>
                  <span style={styles.datoValor}>{estado.numero_autorizacion}</span>
                </div>
                <div style={styles.dato}>
                  <span style={styles.datoLabel}>Fecha de autorización</span>
                  <span style={styles.datoValor}>{estado.fecha_autorizacion}</span>
                </div>
              </>
            )}

            {/* SRI NO DISPONIBLE */}
            {estado.estado === 'SRI_NO_DISPONIBLE' && (
              <div style={styles.aviso}>
                <p>El sistema del SRI Ecuador no está disponible en este momento.</p>
                <p>Tu comprobante fue guardado y <strong>se reintentará automáticamente</strong> cuando el SRI vuelva a estar en línea.</p>
                <p style={styles.avisoSub}>
                  Puedes consultar el estado más tarde con esta misma clave de acceso.
                </p>
                <button onClick={consultar} style={styles.btnReintentar}>
                  Verificar de nuevo
                </button>
              </div>
            )}

            {/* RECHAZADO */}
            {(estado.estado === 'SRI_RECHAZO' || estado.estado === 'NO_AUTORIZADO') && (
              <div style={styles.aviso}>
                <p>El SRI rechazó el comprobante. Revisa los datos e intenta nuevamente.</p>
                {estado.mensaje_error && (
                  <p style={styles.errorDetalle}>{estado.mensaje_error}</p>
                )}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:       { background: '#fff', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '480px', position: 'relative' },
  btnCerrar:   { position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', fontSize: '1.25rem', color: '#64748B', cursor: 'pointer' },
  titulo:      { fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' },
  clave:       { fontFamily: "'DM Mono', monospace", fontSize: '0.75rem', color: '#64748B', wordBreak: 'break-all', marginBottom: '1.5rem', background: '#F7F9FC', padding: '0.5rem', borderRadius: '6px' },
  btnConsultar:{ width: '100%', padding: '0.875rem', background: '#00875A', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '0.95rem' },
  loading:     { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1.5rem', color: '#64748B' },
  spinner:     { width: '32px', height: '32px', border: '3px solid #E2E8F0', borderTopColor: '#00875A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  errorBox:    { background: '#FFF5F5', borderRadius: '8px', padding: '1rem', textAlign: 'center' },
  errorTitulo: { fontWeight: 600, color: '#E53E3E', marginBottom: '0.5rem' },
  errorMensaje:{ color: '#64748B', fontSize: '0.875rem', marginBottom: '1rem' },
  btnReintentar:{ background: 'transparent', border: '1.5px solid #E2E8F0', borderRadius: '6px', padding: '0.5rem 1rem', color: '#64748B', fontSize: '0.875rem' },
  estadoBox:   { borderRadius: '10px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  estadoIcono: { fontSize: '1.5rem' },
  estadoLabel: { fontWeight: 700, fontSize: '1rem' },
  dato:        { display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  datoLabel:   { fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600, color: '#64748B' },
  datoValor:   { fontFamily: "'DM Mono', monospace", fontSize: '0.8rem', wordBreak: 'break-all' },
  aviso:       { display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' },
  avisoSub:    { color: '#64748B', fontSize: '0.8rem', marginTop: '0.25rem' },
  errorDetalle:{ fontFamily: "'DM Mono', monospace", fontSize: '0.75rem', background: 'rgba(0,0,0,0.05)', padding: '0.5rem', borderRadius: '4px' },
}