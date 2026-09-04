// src/components/Configuracion.jsx
import { useState, useEffect } from 'react'
import { obtenerConfiguracion, guardarConfiguracion } from '../services/api'

const CAMPOS = [
  { key: 'ruc',                label: 'RUC',                    placeholder: '1791234567001', required: true  },
  { key: 'razon_social',       label: 'Razón Social',           placeholder: 'MI EMPRESA S.A.', required: true  },
  { key: 'nombre_comercial',   label: 'Nombre Comercial',       placeholder: 'MI EMPRESA',    required: false },
  { key: 'establecimiento',    label: 'Establecimiento',        placeholder: '001',           required: true  },
  { key: 'punto_emision',      label: 'Punto de Emisión',       placeholder: '001',           required: true  },
  { key: 'dir_matriz',         label: 'Dirección Matriz',       placeholder: 'Av. Principal 123', required: true, full: true },
  { key: 'dir_establecimiento',label: 'Dirección Establecimiento', placeholder: 'Av. Principal 123', required: false, full: true },
  { key: 'telefono',           label: 'Teléfono',               placeholder: '0999999999',    required: false },
  { key: 'email',              label: 'Email Emisor',           placeholder: 'facturacion@empresa.com', required: false },
  { key: 'obligado_contabilidad', label: 'Obligado a Llevar Contabilidad', placeholder: 'SI / NO', required: false },
]

const FORM_VACIO = CAMPOS.reduce((acc, c) => ({ ...acc, [c.key]: '' }), {})

export default function Configuracion() {
  const [form,    setForm]    = useState(FORM_VACIO)
  const [estado,  setEstado]  = useState('idle')   // idle | loading | guardando | ok | error
  const [mensaje, setMensaje] = useState('')

  // Cargar configuración al montar
  useEffect(() => {
    cargarConfiguracion()
  }, [])

  async function cargarConfiguracion() {
    setEstado('loading')
    try {
      const datos = await obtenerConfiguracion()
      if (datos) setForm(datos)   // ← solo actualizar si hay datos
      setEstado('idle')
    } catch (err) {
    // 404 es normal en el primer uso — no mostrar error
    setEstado('idle')
    // No hacer nada más, el formulario quedará vacío para llenar
    }
  }

  async function handleGuardar(e) {
    e.preventDefault()
    setEstado('guardando')
    setMensaje('')
    try {
      await guardarConfiguracion(form)
      setEstado('ok')
      setMensaje('Configuración guardada correctamente')
      setTimeout(() => setEstado('idle'), 3000)
    } catch (err) {
      setEstado('error')
      setMensaje(err.message)
    }
  }

  return (
    <div className="fade-in">
      <h2 style={styles.titulo}>Configuración del Emisor</h2>
      <p  style={styles.subtitulo}>
        Registra los datos de tu empresa. Se cargarán automáticamente al emitir facturas.
      </p>

      {estado === 'loading' && (
        <div style={styles.cargando}>Cargando configuración...</div>
      )}

      <form onSubmit={handleGuardar}>
        <section style={styles.seccion}>
          <h3 style={styles.seccionTitulo}>Datos del Emisor</h3>
          <div style={styles.grilla}>
            {CAMPOS.map(({ key, label, placeholder, required, full }) => (
              <div
                key   = {key}
                style = {{ ...styles.campo, ...(full ? { gridColumn: '1 / -1' } : {}) }}
              >
                <label style={styles.label}>
                  {label}
                  {required && <span style={styles.requerido}> *</span>}
                </label>
                <input
                  type        = "text"
                  value       = {form[key] || ''}
                  onChange    = {e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder = {placeholder}
                  required    = {required}
                  style       = {styles.input}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Secuencial -->
        <section style={styles.seccion}>
          <h3 style={styles.seccionTitulo}>Secuencial</h3>
          <p style={styles.infoTexto}>
            El secuencial se incrementa automáticamente con cada factura emitida.
          </p>
          <div style={styles.grilla}>
            <div style={styles.campo}>
              <label style={styles.label}>
                Secuencial actual
              </label>
              <input
                type        = "number"
                value       = {form.secuencial_actual || '1'}
                onChange    = {e => setForm(f => ({
                  ...f, secuencial_actual: e.target.value
                }))}
                min         = "1"
                style       = {styles.input}
              />
            </div>
          </div>
        </section>

        {/* Mensajes */}
        {mensaje && (
          <div style={{
            ...styles.mensaje,
            background: estado === 'ok' ? '#E3F5EE' : '#FFF5F5',
            color:      estado === 'ok' ? '#005C3D' : '#E53E3E',
          }}>
            {estado === 'ok' ? '✓ ' : '⚠ '}{mensaje}
          </div>
        )}

        <button
          type     = "submit"
          style    = {{
            ...styles.btnGuardar,
            opacity: estado === 'guardando' ? 0.7 : 1
          }}
          disabled = {estado === 'guardando' || estado === 'loading'}
        >
          {estado === 'guardando' ? 'Guardando...' : 'Guardar Configuración'}
        </button>
      </form>
    </div>
  )
}

const styles = {
  titulo:       { fontSize: '1.75rem', marginBottom: '0.25rem' },
  subtitulo:    { color: '#64748B', fontSize: '0.875rem', marginBottom: '2rem' },
  cargando:     { color: '#64748B', padding: '1rem', textAlign: 'center' },
  seccion:      { background: '#fff', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  seccionTitulo:{ fontSize: '1rem', color: '#005C3D', marginBottom: '1rem', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 },
  grilla:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' },
  campo:        { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  label:        { fontSize: '0.75rem', fontWeight: 600, color: '#2D3748', textTransform: 'uppercase', letterSpacing: '0.05em' },
  requerido:    { color: '#E53E3E' },
  input:        { padding: '0.65rem 0.875rem', border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '0.9rem', color: '#0F1923', outline: 'none' },
  infoTexto:    { color: '#64748B', fontSize: '0.875rem', marginBottom: '1rem' },
  mensaje:      { padding: '0.875rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 500 },
  btnGuardar:   { background: '#00875A', color: '#fff', border: 'none', borderRadius: '10px', padding: '1rem 2rem', fontSize: '1rem', fontWeight: 600, width: '100%', cursor: 'pointer' },
}