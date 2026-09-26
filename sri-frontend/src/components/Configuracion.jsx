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

  // Agregar estados en Configuracion.jsx
  const [logoPreview,   setLogoPreview]   = useState(null)
  const [subiendoLogo,  setSubiendoLogo]  = useState(false)
  const [mensajeLogo,   setMensajeLogo]   = useState('')

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

  // Función para subir el logo
  async function handleLogoChange(e) {
    const archivo = e.target.files[0]
    if (!archivo) return

    // Validar tipo y tamaño
    if (!archivo.type.startsWith('image/')) {
      setMensajeLogo('Solo se permiten imágenes (PNG, JPG)')
      return
    }
    if (archivo.size > 500 * 1024) {
      setMensajeLogo('El logo no debe superar 500KB')
      return
    }

    setSubiendoLogo(true)
    setMensajeLogo('')

    try {
      // Convertir a base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(archivo)
      })

      // Mostrar preview
      setLogoPreview(base64)

      // Guardar en la configuración
      const configActual = await obtenerConfiguracion() || {}
      await guardarConfiguracion({
        ...configActual,
        ...form,
        logo_base64: base64,
        logo_nombre: archivo.name,
      })

      setMensajeLogo('✅ Logo guardado correctamente')
    } catch (err) {
      setMensajeLogo('Error al subir el logo: ' + err.message)
    } finally {
      setSubiendoLogo(false)
    }
  }

// Cargar logo al montar — actualiza cargarConfiguracion
async function cargarConfiguracion() {
  setEstado('loading')
  try {
    const datos = await obtenerConfiguracion()
    if (datos) {
      setForm(datos)
      if (datos.logo_base64) {
        setLogoPreview(datos.logo_base64)
      }
    }
    setEstado('idle')
  } catch {
    setEstado('idle')
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

        {/* Secuencial */}
        <section style={styles.seccion}>
          <h3 style={styles.seccionTitulo}>Secuencial</h3>
          <p style={styles.infoTexto}>
    El secuencial se actualiza automáticamente después de cada
    factura autorizada por el SRI.
          </p>
          <div style={styles.grilla}>
          <div style={styles.campo}>
              <label style={styles.label}>
                Último secuencial autorizado
              </label>
              <input
                type        = "number"
                value       = {form.secuencial_actual || '0'}
                onChange    = {e => setForm(f => ({
                  ...f,
                  secuencial_actual: e.target.value
                }))}
                min         = "0"
                style       = {styles.input}
              />
              <span style={styles.labelOpcional}>
                La próxima factura usará el número{' '}
                <strong>
                  {String(parseInt(form.secuencial_actual || '0') + 1).padStart(9, '0')}
                </strong>
              </span>
          </div>
          </div>
        </section>

        {/* Sección Logo */}
        <section style={styles.seccion}>
          <h3 style={styles.seccionTitulo}>Logo de la Empresa</h3>
          <p style={styles.infoTexto}>
            Se mostrará en el encabezado del RIDE (PDF de la factura).
            Formato PNG o JPG, máximo 500KB. Recomendado: fondo blanco, 300×100px.
          </p>

          <div style={styles.logoUploadBox}>

            {/* Preview del logo */}
            <div style={styles.logoPreviewBox}>
              {logoPreview ? (
                <img
                  src   = {logoPreview}
                  alt   = "Logo empresa"
                  style = {styles.logoPreviewImg}
                />
              ) : (
                <div style={styles.logoPlaceholder}>
                  <span style={{ fontSize: '2rem' }}>🏢</span>
                  <p style={{ color: '#94A3B8', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
                    Sin logo
                  </p>
                </div>
              )}
            </div>

            {/* Botones */}
            <div style={styles.logoAcciones}>
              <label style={styles.btnSeleccionarLogo}>
                {subiendoLogo ? '⏳ Subiendo...' : '📁 Seleccionar logo'}
                <input
                  type     = "file"
                  accept   = "image/png,image/jpeg,image/jpg"
                  onChange = {handleLogoChange}
                  disabled = {subiendoLogo}
                  style    = {{ display: 'none' }}
                />
              </label>

              {logoPreview && (
                <button
                  type    = "button"
                  onClick = {async () => {
                    const configActual = await obtenerConfiguracion() || {}
                    await guardarConfiguracion({
                      ...configActual,
                      ...form,
                      logo_base64: null,
                      logo_nombre: null,
                    })
                    setLogoPreview(null)
                    setMensajeLogo('Logo eliminado')
                  }}
                  style = {styles.btnEliminarLogo}
                >
                  🗑 Eliminar logo
                </button>
              )}
            </div>

          </div>

          {mensajeLogo && (
            <p style={{
              marginTop: '0.75rem',
              fontSize:  '0.85rem',
              color:     mensajeLogo.startsWith('✅') ? '#005C3D' : '#E53E3E',
            }}>
              {mensajeLogo}
            </p>
          )}
        </section>


        {/* Sección IVA */}
        <section style={styles.seccion}>
          <h3 style={styles.seccionTitulo}>Configuración de IVA</h3>
          <p style={styles.infoTexto}>
            Actualiza estos valores si el gobierno cambia el porcentaje de IVA.
            Se aplicarán automáticamente en todas las nuevas facturas.
          </p>

          <div style={styles.grilla}>

            <div style={styles.campo}>
              <label style={styles.label}>
                Porcentaje IVA (%)
                <span style={styles.requerido}> *</span>
              </label>
              <input
                type        = "number"
                value       = {form.iva_porcentaje || '15'}
                onChange    = {e => {
                  const pct   = e.target.value
                  const tarifa = (parseFloat(pct) / 100).toFixed(4)
                  setForm(f => ({
                    ...f,
                    iva_porcentaje: pct,
                    iva_tarifa:     tarifa,
                  }))
                }}
                min         = "0"
                max         = "100"
                step        = "1"
                required
                style       = {styles.input}
              />
            </div>

            <div style={styles.campo}>
              <label style={styles.label}>
                Código SRI (codigo)
                <span style={styles.requerido}> *</span>
              </label>
              <select
                value    = {form.iva_codigo || '2'}
                onChange = {e => setForm(f => ({ ...f, iva_codigo: e.target.value }))}
                style    = {styles.input}
              >
                <option value="2">2 — IVA</option>
                <option value="3">3 — ICE</option>
                <option value="5">5 — IRBPNR</option>
                <option value="6">6 — No objeto de IVA</option>
                <option value="7">7 — Exento de IVA</option>
              </select>
            </div>

            <div style={styles.campo}>
              <label style={styles.label}>
                Código Porcentaje SRI
                <span style={styles.requerido}> *</span>
              </label>
              <select
                value    = {form.iva_codigo_porcentaje || '4'}
                onChange = {e => setForm(f => ({
                  ...f, iva_codigo_porcentaje: e.target.value
                }))}
                style    = {styles.input}
              >
                <option value="0">0 — 0%</option>
                <option value="2">2 — 12% (histórico)</option>
                <option value="3">3 — 14% (histórico)</option>
                <option value="4">4 — 15% (vigente)</option>
                <option value="5">5 — 5%</option>
                <option value="6">6 — No objeto</option>
                <option value="7">7 — Exento</option>
                <option value="8">8 — 8%</option>
                <option value="10">10 — 13%</option>
              </select>
            </div>

            <div style={styles.campo}>
              <label style={styles.label}>Tarifa decimal (calculada)</label>
              <input
                type      = "text"
                value     = {form.iva_tarifa || '0.15'}
                readOnly
                style     = {{ ...styles.input, background: '#F7F9FC', color: '#64748B' }}
              />
            </div>

          </div>

          {/* Vista previa */}
          <div style={styles.previvaIVA}>
            <span style={styles.previaLabel}>Vista previa:</span>
            <span>
              Sobre $100.00 de subtotal →{' '}
              <strong>
                IVA ${(100 * parseFloat(form.iva_tarifa || '0.15')).toFixed(2)}
              </strong>
              {' '}= Total{' '}
              <strong>
                ${(100 + 100 * parseFloat(form.iva_tarifa || '0.15')).toFixed(2)}
              </strong>
            </span>
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

  previvaIVA: {
    background:   '#E3F5EE',
    borderRadius: '8px',
    padding:      '0.875rem 1rem',
    marginTop:    '1rem',
    fontSize:     '0.875rem',
    color:        '#005C3D',
    display:      'flex',
    gap:          '0.5rem',
    alignItems:   'center',
  },
  previaLabel: {
    fontWeight: 600,
    flexShrink: 0,
  },
  logoUploadBox: {
    display:   'flex',
    gap:       '1.5rem',
    alignItems:'flex-start',
    flexWrap:  'wrap',
  },
  logoPreviewBox: {
    width:        '200px',
    height:       '100px',
    border:       '2px dashed #E2E8F0',
    borderRadius: '8px',
    display:      'flex',
    alignItems:   'center',
    justifyContent:'center',
    background:   '#fff',
    overflow:     'hidden',
    flexShrink:   0,
    },
  logoPreviewImg: {
    maxWidth:  '190px',
    maxHeight: '90px',
    objectFit: 'contain',
  },
  logoPlaceholder: {
    textAlign: 'center',
  },
  logoAcciones: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '0.75rem',
  },
  btnSeleccionarLogo: {
    display:      'inline-block',
    background:   '#00875A',
    color:        '#fff',
    border:       'none',
    borderRadius: '8px',
    padding:      '0.75rem 1.25rem',
    fontSize:     '0.9rem',
    fontWeight:   600,
    cursor:       'pointer',
    textAlign:    'center',
  },
  btnEliminarLogo: {
    background:   'transparent',
    border:       '1.5px solid #FED7D7',
    borderRadius: '8px',
    color:        '#E53E3E',
    padding:      '0.6rem 1rem',
    fontSize:     '0.85rem',
    cursor:       'pointer',
    fontWeight:   500,
  },
}