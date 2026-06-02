import { useState } from 'react'
import { consultarFactura } from '../services/api'

export default function ListaFacturas() {
  const [clave,    setClave]    = useState('')
  const [factura,  setFactura]  = useState(null)
  const [estado,   setEstado]   = useState('idle')
  const [error,    setError]    = useState('')

  async function handleConsultar(e) {
    e.preventDefault()
    setEstado('loading')
    setError('')
    try {
      const data = await consultarFactura(clave)
      setFactura(data)
      setEstado('ok')
    } catch (err) {
      setError(err.message)
      setEstado('error')
    }
  }

  return (
    <div className="fade-in">
      <h2 style={styles.titulo}>Consultar Comprobante</h2>
      <p  style={styles.subtitulo}>Ingresa la clave de acceso para consultar el estado</p>

      <div style={styles.card}>
        <form onSubmit={handleConsultar} style={styles.form}>
          <input
            value       = {clave}
            onChange    = {e => setClave(e.target.value)}
            placeholder = "Ingresa la clave de acceso (49 dígitos)"
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

        {error && (
          <p style={styles.error}>{error}</p>
        )}

        {factura && estado === 'ok' && (
          <div style={styles.resultado} className="fade-in">
            <div style={{
              ...styles.badge,
              background: factura.estado === 'AUTORIZADO' ? '#E3F5EE' : '#FFF5F5',
              color:      factura.estado === 'AUTORIZADO' ? '#005C3D' : '#E53E3E',
            }}>
              {factura.estado}
            </div>
            {factura.numero_autorizacion && (
              <div style={styles.infoFila}>
                <span style={styles.infoLabel}>Número de autorización</span>
                <span style={styles.infoValor}>{factura.numero_autorizacion}</span>
              </div>
            )}
            {factura.fecha_autorizacion && (
              <div style={styles.infoFila}>
                <span style={styles.infoLabel}>Fecha de autorización</span>
                <span style={styles.infoValor}>{factura.fecha_autorizacion}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  titulo:    { fontSize: '1.75rem', marginBottom: '0.25rem' },
  subtitulo: { color: '#64748B', fontSize: '0.875rem', marginBottom: '2rem' },
  card:      { background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  form:      { display: 'flex', gap: '0.75rem', marginBottom: '1rem' },
  input:     { flex: 1, padding: '0.75rem 1rem', border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '0.875rem', fontFamily: "'DM Mono', monospace", outline: 'none', color: '#0F1923' },
  btnConsultar: { background: '#00875A', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.75rem 1.25rem', fontWeight: 600, fontSize: '0.9rem' },
  error:     { background: '#FFF5F5', color: '#E53E3E', padding: '0.75rem', borderRadius: '8px', fontSize: '0.875rem' },
  resultado: { borderTop: '1px solid #E2E8F0', paddingTop: '1.25rem', marginTop: '0.5rem' },
  badge:     { display: 'inline-block', padding: '0.375rem 0.875rem', borderRadius: '20px', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.05em', marginBottom: '1rem' },
  infoFila:  { display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.75rem' },
  infoLabel: { fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 },
  infoValor: { fontFamily: "'DM Mono', monospace", fontSize: '0.875rem', color: '#0F1923', wordBreak: 'break-all' },
}