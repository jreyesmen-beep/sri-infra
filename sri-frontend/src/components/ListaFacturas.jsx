import { useState }                            from 'react'
import { consultarFactura, consultarPorNumero } from '../services/api'
import { useRIDE }                              from '../hooks/useRIDE'
import { getToken }                             from '../services/auth'
import { formatearFechaEcuador }               from '../utils/fecha'

const TIPO_BUSQUEDA = {
  CLAVE:  'clave',
  NUMERO: 'numero',
}

export default function ListaFacturas() {
  const [tipoBusqueda, setTipoBusqueda] = useState(TIPO_BUSQUEDA.CLAVE)
  const [clave,        setClave]        = useState('')
  const [numero,       setNumero]       = useState('')
  const [factura,      setFactura]      = useState(null)
  const [cargando,     setCargando]     = useState(false)
  const [error,        setError]        = useState('')
  const ride = useRIDE()

  // Clave de acceso para el RIDE
  const claveAcceso = factura?.clave_acceso || clave

  async function handleConsultar(e) {
    e.preventDefault()
    setCargando(true)
    setError('')
    setFactura(null)
    ride.limpiarError()

    try {
      let data
      if (tipoBusqueda === TIPO_BUSQUEDA.CLAVE) {
        data = await consultarFactura(clave)
      } else {
        data = await consultarPorNumero(numero)
      }
      setFactura(data)
    } catch (err) {
      setError('Error al consultar: ' + err.message)
    } finally {
      setCargando(false)
    }
  }

  const info       = factura ? (ESTADOS[factura.estado] || ESTADOS.ERROR_INTERNO) : null
  const autorizado = factura?.estado === 'AUTORIZADO'

  return (
    <div className="fade-in">
      <h2 style={styles.titulo}>Consultar Comprobante</h2>
      <p  style={styles.subtitulo}>
        Busca por clave de acceso o número de comprobante
      </p>

      <div style={styles.card}>

        {/* ✅ Selector de tipo de búsqueda */}
        <div style={styles.tiposBusqueda}>
          <button
            onClick = {() => { setTipoBusqueda(TIPO_BUSQUEDA.CLAVE); setFactura(null); setError('') }}
            style   = {{
              ...styles.btnTipo,
              ...(tipoBusqueda === TIPO_BUSQUEDA.CLAVE ? styles.btnTipoActivo : {})
            }}
          >
            🔑 Clave de acceso
          </button>
          <button
            onClick = {() => { setTipoBusqueda(TIPO_BUSQUEDA.NUMERO); setFactura(null); setError('') }}
            style   = {{
              ...styles.btnTipo,
              ...(tipoBusqueda === TIPO_BUSQUEDA.NUMERO ? styles.btnTipoActivo : {})
            }}
          >
            🔢 Número de comprobante
          </button>
        </div>

        {/* Formulario de búsqueda */}
        <form onSubmit={handleConsultar} style={styles.form}>

          {tipoBusqueda === TIPO_BUSQUEDA.CLAVE ? (
            <input
              value       = {clave}
              onChange    = {e => setClave(e.target.value.trim())}
              placeholder = "Clave de acceso (49 dígitos)"
              maxLength   = {49}
              required
              style       = {styles.input}
            />
          ) : (
            <input
              value       = {numero}
              onChange    = {e => {
                // Auto formato: 001-002-000000095
                let val = e.target.value.replace(/[^0-9-]/g, '')
                setNumero(val)
              }}
              placeholder = "Ej: 001-002-000000095"
              maxLength   = {17}
              required
              style       = {styles.input}
            />
          )}

          <button
            type     = "submit"
            style    = {styles.btnConsultar}
            disabled = {
              cargando ||
              (tipoBusqueda === TIPO_BUSQUEDA.CLAVE   && clave.length  !== 49) ||
              (tipoBusqueda === TIPO_BUSQUEDA.NUMERO  && numero.length < 3)
            }
          >
            {cargando ? '⏳' : '🔍'} Buscar
          </button>
        </form>

        {/* Contador para clave */}
        {tipoBusqueda === TIPO_BUSQUEDA.CLAVE &&
         clave.length > 0 && clave.length !== 49 && (
          <p style={styles.contador}>{clave.length}/49 dígitos</p>
        )}

        {/* Ayuda para número */}
        {tipoBusqueda === TIPO_BUSQUEDA.NUMERO && (
          <p style={styles.ayuda}>
            Formato: establecimiento-puntoEmisión-secuencial
            (ej: 001-002-000000095)
          </p>
        )}

        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Resultado */}
        {factura && info && (
          <div
            style     = {{ ...styles.resultado, background: info.color }}
            className = "fade-in"
          >
            <div style={styles.badgeRow}>
              <span style={{ fontSize: '1.5rem' }}>{info.icono}</span>
              <span style={{ ...styles.estadoLabel, color: info.texto }}>
                {info.label}
              </span>
            </div>

            {/* Número de comprobante si viene */}
            {factura.numero_comprobante && (
              <div style={styles.dato}>
                <span style={styles.datoLabel}>Número de comprobante</span>
                <span style={styles.datoValor}>{factura.numero_comprobante}</span>
              </div>
            )}

            {/* Clave de acceso */}
            {factura.clave_acceso && (
              <div style={styles.dato}>
                <span style={styles.datoLabel}>Clave de acceso</span>
                <span style={styles.datoValor}>{factura.clave_acceso}</span>
              </div>
            )}

            {/* Número de autorización */}
            {factura.numero_autorizacion && (
              <div style={styles.dato}>
                <span style={styles.datoLabel}>Número de autorización</span>
                <span style={styles.datoValor}>{factura.numero_autorizacion}</span>
              </div>
            )}

            {/* Fecha de autorización */}
            {factura.fecha_autorizacion && (
              <div style={styles.dato}>
                <span style={styles.datoLabel}>Fecha de autorización</span>
                <span style={styles.datoValor}>
                  {formatearFechaEcuador(factura.fecha_autorizacion)}
                </span>
              </div>
            )}

            {/* Mensaje de error */}
            {factura.mensaje_error && (
              <div style={styles.dato}>
                <span style={{ ...styles.datoLabel, color: '#E53E3E' }}>
                  Motivo
                </span>
                <span style={{ ...styles.datoValor, color: '#E53E3E', fontSize: '0.75rem' }}>
                  {factura.mensaje_error}
                </span>
              </div>
            )}

            {/* Botones RIDE */}
            {autorizado && (
              <div style={styles.botonesRIDE}>
                <button
                  onClick  = {() => ride.descargar(claveAcceso)}
                  disabled = {ride.descargando}
                  style    = {{
                    ...styles.btnRIDE,
                    opacity: ride.descargando ? 0.7 : 1
                  }}
                >
                  {ride.descargando ? '⏳ Procesando...' : '⬇ Descargar RIDE (PDF)'}
                </button>
                <button
                  onClick  = {() => ride.imprimir(claveAcceso)}
                  disabled = {ride.descargando}
                  style    = {{
                    ...styles.btnImprimir,
                    opacity: ride.descargando ? 0.7 : 1
                  }}
                >
                  🖨 Imprimir RIDE
                </button>
                {ride.error && (
                  <div style={styles.errorBox}>{ride.error}</div>
                )}
              </div>
            )}

            {factura.estado === 'SRI_NO_DISPONIBLE' && (
              <div style={styles.aviso}>
                <p>El SRI no estaba disponible. El comprobante se reintentará automáticamente.</p>
                <button onClick={handleConsultar} style={styles.btnReintentar}>
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

const ESTADOS = {
  AUTORIZADO:        { color: '#E3F5EE', texto: '#005C3D', icono: '✓',  label: 'Autorizado'           },
  YA_AUTORIZADO:     { color: '#F0FDF4', texto: '#166534', icono: '✓',  label: 'Ya autorizado'        },
  EN_PROCESO:        { color: '#EFF6FF', texto: '#1D4ED8', icono: '⏳', label: 'En proceso'           },
  NO_ENCONTRADO:     { color: '#F8FAFC', texto: '#64748B', icono: '○',  label: 'No encontrado'        },
  SRI_NO_DISPONIBLE: { color: '#FFF7ED', texto: '#C2410C', icono: '⚠️', label: 'SRI no disponible'   },
  SRI_RECHAZO:       { color: '#FFF5F5', texto: '#E53E3E', icono: '✕',  label: 'Rechazado por el SRI'},
  ERROR_INTERNO:     { color: '#FFF5F5', texto: '#E53E3E', icono: '✕',  label: 'Error interno'       },
  NO_AUTORIZADO:     { color: '#FFF5F5', texto: '#E53E3E', icono: '✕',  label: 'No autorizado'       },
}

const styles = {
  titulo:       { fontSize: '1.75rem', marginBottom: '0.25rem' },
  subtitulo:    { color: '#64748B', fontSize: '0.875rem', marginBottom: '2rem' },
  card:         { background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  tiposBusqueda:{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' },
  btnTipo:      { padding: '0.5rem 1rem', border: '1.5px solid #E2E8F0', borderRadius: '8px', background: '#fff', color: '#64748B', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500 },
  btnTipoActivo:{ background: '#E3F5EE', borderColor: '#00875A', color: '#005C3D', fontWeight: 600 },
  form:         { display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' },
  input:        { flex: 1, padding: '0.75rem 1rem', border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '0.875rem', fontFamily: "'DM Mono', monospace", outline: 'none', color: '#0F1923' },
  btnConsultar: { background: '#00875A', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.75rem 1.25rem', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap' },
  contador:     { color: '#94A3B8', fontSize: '0.75rem', marginBottom: '0.5rem' },
  ayuda:        { color: '#94A3B8', fontSize: '0.75rem', marginBottom: '0.5rem', fontStyle: 'italic' },
  errorBox:     { background: '#FFF5F5', color: '#E53E3E', padding: '0.75rem', borderRadius: '8px', fontSize: '0.875rem' },
  resultado:    { borderRadius: '10px', padding: '1.25rem', marginTop: '1rem' },
  badgeRow:     { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' },
  estadoLabel:  { fontWeight: 700, fontSize: '1rem' },
  dato:         { display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.75rem' },
  datoLabel:    { fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600, color: '#64748B' },
  datoValor:    { fontFamily: "'DM Mono', monospace", fontSize: '0.8rem', color: '#0F1923', wordBreak: 'break-all' },
  botonesRIDE:  { display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' },
  btnRIDE:      { background: '#00875A', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.75rem', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' },
  btnImprimir:  { background: '#fff', color: '#00875A', border: '1.5px solid #00875A', borderRadius: '8px', padding: '0.75rem', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' },
  btnReintentar:{ background: 'transparent', border: '1.5px solid #E2E8F0', borderRadius: '6px', padding: '0.5rem 1rem', color: '#64748B', fontSize: '0.875rem', cursor: 'pointer', marginTop: '0.5rem' },
  aviso:        { fontSize: '0.875rem', marginTop: '0.75rem' },
}