import { useState, useEffect } from 'react'
import { emitirFactura, obtenerConfiguracion } from '../services/api'
import { getToken }                            from '../services/auth'  // ← debe estar
import { useRIDE }                             from '../hooks/useRIDE'  // ← nuevo

const API_URL = import.meta.env.VITE_API_URL

const ITEM_VACIO = {
  codigo: '', descripcion: '', cantidad: 1,
  precio_unitario: 0, descuento: 0
}

export default function NuevaFactura() {
  const [form, setForm] = useState({
    ruc:                 '',
    razon_social:        '',
    nombre_comercial:    '',
    establecimiento:     '001',
    punto_emision:       '001',
    secuencial:          '',
    dir_matriz:          '',
    tipo_id_comprador:   '05',
    razon_comprador:     'CONSUMIDOR FINAL',
    id_comprador:        '9999999999999',
    dir_establecimiento: '',
    email_comprador:     '',
  })

  const [items,          setItems]          = useState([{ ...ITEM_VACIO }])
  const [estado,         setEstado]         = useState('idle')
  const [resultado,      setResultado]      = useState(null)
  const [error,          setError]          = useState('')
  const [cargandoConfig, setCargandoConfig] = useState(true)
  //const [descargando,    setDescargando]    = useState(false)
  //const [errorPDF,       setErrorPDF]       = useState('')
  //const [errorDescarga,  setErrorDescarga] = useState('')

  // ✅ Reemplaza descargandoPDF, errorPDF, descargarRIDE, imprimirRIDE
  const ride = useRIDE()

  // ✅ Cargar configuración del emisor
  useEffect(() => {
    function cargar() {
      obtenerConfiguracion()
        .then(config => {
          if (!config) return

          // Calcular el siguiente secuencial desde el último guardado
          const ultimoSecuencial = config.secuencial_actual || '0'
          const siguiente        = _siguiente_secuencial(ultimoSecuencial)

          setForm(f => ({
            ...f,
            ruc:                 config.ruc                 || f.ruc,
            razon_social:        config.razon_social        || f.razon_social,
            nombre_comercial:    config.nombre_comercial    || f.nombre_comercial,
            establecimiento:     config.establecimiento     || f.establecimiento,
            punto_emision:       config.punto_emision       || f.punto_emision,
            dir_matriz:          config.dir_matriz          || f.dir_matriz,
            dir_establecimiento: config.dir_establecimiento || f.dir_establecimiento,
            secuencial:          siguiente,   // ← siguiente al último autorizado
          }))
        })
        .catch(err => {
          console.warn('Sin configuración guardada:', err.message)
        })
        .finally(() => {
          setCargandoConfig(false)
        })
    }
    cargar()
  }, [])

/*   async function descargarRIDE() {
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
  } */

/*   async function imprimirRIDE() {
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

      // Convertir base64 a blob
      const bytes = atob(pdfBase64)
      const arr   = new Uint8Array(bytes.length)
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
      const blob = new Blob([arr], { type: "application/pdf" })
      const url  = URL.createObjectURL(blob)

      // ✅ Abrir en ventana nueva e imprimir automáticamente
      const ventana = window.open(url)
      ventana.onload = () => {
        ventana.focus()
        ventana.print()
        // Limpiar el blob después de imprimir
        ventana.onafterprint = () => {
          URL.revokeObjectURL(url)
        }
      }

    } catch (err) {
      setErrorDescarga('Error al imprimir: ' + err.message)
    } finally {
      setDescargando(false)
    }
  }
 */

  // Calcular totales
  const subtotal = items.reduce(
    (acc, i) => acc + (i.cantidad * i.precio_unitario - i.descuento), 0
  )
  const iva   = subtotal * 0.15
  const total = subtotal + iva

  function actualizarItem(idx, campo, valor) {
    setItems(prev => prev.map((it, i) =>
      i === idx ? { ...it, [campo]: valor } : it
    ))
  }

  function agregarItem()    { setItems(prev => [...prev, { ...ITEM_VACIO }]) }
  function eliminarItem(idx){ setItems(prev => prev.filter((_, i) => i !== idx)) }

  async function handleSubmit(e) {
    e.preventDefault()
    setEstado('loading')
    setError('')

    const fecha    = new Date()
    const fechaStr = `${String(fecha.getDate()).padStart(2,'0')}/${String(fecha.getMonth()+1).padStart(2,'0')}/${fecha.getFullYear()}`

    const payload = {
      ...form,
      ambiente:            '1',
      fecha_emision:        fechaStr,
      clave_acceso:         generarClaveAcceso(form, fecha),
      email_comprador:      form.email_comprador || '',
      total_sin_impuestos:  subtotal,
      total_descuento:      items.reduce((a, i) => a + Number(i.descuento), 0),
      importe_total:        total,
      impuestos: [{
        codigo: '2', tarifa: '4',
        base: subtotal, valor: iva
      }],
      items: items.map(it => ({
        ...it,
        precio_total: it.cantidad * it.precio_unitario - it.descuento,
        impuestos: [{
          codigo: '2', tarifa: '4', porcentaje: '15',
          base:  it.cantidad * it.precio_unitario - it.descuento,
          valor: (it.cantidad * it.precio_unitario - it.descuento) * 0.15
        }]
      }))
    }

    try {
      const res = await emitirFactura(payload)
      setResultado(res)
      setEstado('ok')
    } catch (err) {
      setError(err.message)
      setEstado('error')
    }
  }

  // Pantalla de éxito
  if (estado === 'ok') {
    return (
      <div style={styles.exito} className="fade-in">
        {/* Ícono de éxito */}
        <div style={styles.exitoIcono}>✓</div>
        <h2 style={styles.exitoTitulo}>Comprobante en proceso</h2>
        <p  style={styles.exitoSub}>
          El comprobante fue enviado a la cola de procesamiento
        </p>

        {/* Datos del comprobante */}
        <div style={styles.claveBox}>
          <span style={styles.claveLabel}>Estado</span>
          <span style={styles.clave}>{resultado?.estado}</span>
          {resultado?.clave_acceso && (
            <>
              <span style={{ ...styles.claveLabel, marginTop: '0.5rem' }}>
                Clave de acceso
              </span>
              <span style={styles.clave}>{resultado.clave_acceso}</span>
            </>
          )}
        </div>

{/* Botones de acción */}
      <div style={styles.botonesExito}>

        {/* Descargar RIDE */}
        <button
          onClick  = {() => ride.descargar(resultado?.clave_acceso)}
          disabled = {ride.descargando}
          style    = {{
            ...styles.btnRIDE,
            opacity: ride.descargando ? 0.7 : 1
          }}
        >
          {ride.descargando ? '⏳ Generando PDF...' : '⬇ Descargar RIDE (PDF)'}
        </button>

        {/* Imprimir RIDE */}
        <button
          onClick  = {() => ride.imprimir(resultado?.clave_acceso)}
          disabled = {ride.descargando}
          style    = {{
            ...styles.btnImprimir,
            opacity: ride.descargando ? 0.7 : 1
          }}
        >
          🖨 Imprimir RIDE
        </button>

        {/* Nueva factura */}
        <button
          style   = {styles.btnNueva}
          onClick = {() => {
            setEstado('idle')
            setResultado(null)
            setError('')
            //setDescargando(false)
            //setErrorPDF('')        
            ride.limpiarError()    
            setItems([{ ...ITEM_VACIO }])
          }}
        >
          + Emitir otro comprobante
        </button>
      </div>
      
      {ride.error && (
        <div style={styles.errorPDF}>{ride.error}</div>
      )}

      {/* Aviso si el comprobante aún no está autorizado */}
      <p style={styles.avisoEspera}>
        💡 Si el PDF no está disponible aún, espera unos segundos
        y vuelve a intentarlo. El SRI puede tardar en autorizar.
      </p>
     </div>
    )
  }

  return (
    <div className="fade-in">
      <h2 style={styles.titulo}>Nueva Factura</h2>
      <p  style={styles.subtitulo}>Ambiente de certificación SRI Ecuador</p>

      {cargandoConfig && (
        <p style={styles.cargando}>Cargando datos del emisor...</p>
      )}

      <form onSubmit={handleSubmit}>

        {/* Datos del emisor */}
        <section style={styles.seccion}>
          <h3 style={styles.seccionTitulo}>Datos del Emisor</h3>
          <div style={styles.grilla}>
            {[
              { key: 'ruc',              label: 'RUC',              placeholder: '1791234567001' },
              { key: 'razon_social',     label: 'Razón Social',     placeholder: 'MI EMPRESA S.A.' },
              { key: 'nombre_comercial', label: 'Nombre Comercial', placeholder: 'MI EMPRESA' },
              { key: 'establecimiento',  label: 'Establecimiento',  placeholder: '001' },
              { key: 'punto_emision',    label: 'Punto de Emisión', placeholder: '001' },
              { key: 'secuencial',       label: 'Secuencial',       placeholder: '000000001' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} style={styles.campo}>
                <label style={styles.label}>{label}</label>
                <input
                  value       = {form[key]}
                  onChange    = {e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder = {placeholder}
                  required
                  style       = {styles.input}
                />
              </div>
            ))}
            <div style={{ ...styles.campo, gridColumn: '1 / -1' }}>
              <label style={styles.label}>Dirección Matriz</label>
              <input
                value       = {form.dir_matriz}
                onChange    = {e => setForm(f => ({ ...f, dir_matriz: e.target.value }))}
                placeholder = "Av. Amazonas N12-34, Quito"
                required
                style       = {styles.input}
              />
            </div>
          </div>
        </section>

        {/* Datos del comprador */}
        <section style={styles.seccion}>
          <h3 style={styles.seccionTitulo}>Datos del Comprador</h3>
          <div style={styles.grilla}>
            <div style={styles.campo}>
              <label style={styles.label}>Tipo Identificación</label>
              <select
                value    = {form.tipo_id_comprador}
                onChange = {e => setForm(f => ({ ...f, tipo_id_comprador: e.target.value }))}
                style    = {styles.input}
              >
                <option value="04">RUC</option>
                <option value="05">Cédula</option>
                <option value="06">Pasaporte</option>
                <option value="07">Consumidor Final</option>
              </select>
            </div>
            <div style={styles.campo}>
              <label style={styles.label}>Identificación</label>
              <input
                value       = {form.id_comprador}
                onChange    = {e => setForm(f => ({ ...f, id_comprador: e.target.value }))}
                placeholder = "9999999999999"
                required
                style       = {styles.input}
              />
            </div>
            <div style={{ ...styles.campo, gridColumn: '1 / -1' }}>
              <label style={styles.label}>Razón Social Comprador</label>
              <input
                value       = {form.razon_comprador}
                onChange    = {e => setForm(f => ({ ...f, razon_comprador: e.target.value }))}
                placeholder = "CONSUMIDOR FINAL"
                required
                style       = {styles.input}
              />
            </div>
            <div style={{ ...styles.campo, gridColumn: '1 / -1' }}>
              <label style={styles.label}>
                Email del Comprador
                <span style={styles.labelOpcional}> (opcional — para envío del RIDE)</span>
              </label>
              <input
                type        = "email"
                value       = {form.email_comprador || ''}
                onChange    = {e => setForm(f => ({ ...f, email_comprador: e.target.value }))}
                placeholder = "cliente@empresa.com"
                style       = {styles.input}
              />
            </div>
          </div>
        </section>

        {/* Items */}
        <section style={styles.seccion}>
          <h3 style={styles.seccionTitulo}>Detalle de Productos / Servicios</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.tabla}>
              <thead>
                <tr>
                  {['Código','Descripción','Cantidad','P. Unitario','Descuento','Subtotal',''].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const sub = item.cantidad * item.precio_unitario - item.descuento
                  return (
                    <tr key={idx}>
                      {[
                        { campo: 'codigo',          type: 'text',   ph: 'PROD001' },
                        { campo: 'descripcion',     type: 'text',   ph: 'Producto...' },
                        { campo: 'cantidad',        type: 'number', ph: '1' },
                        { campo: 'precio_unitario', type: 'number', ph: '0.00' },
                        { campo: 'descuento',       type: 'number', ph: '0.00' },
                      ].map(({ campo, type, ph }) => (
                        <td key={campo} style={styles.td}>
                          <input
                            type      = {type}
                            value     = {item[campo]}
                            onChange  = {e => actualizarItem(
                              idx, campo,
                              type === 'number' ? Number(e.target.value) : e.target.value
                            )}
                            placeholder = {ph}
                            min       = {type === 'number' ? 0 : undefined}
                            step      = {type === 'number' ? '0.01' : undefined}
                            style     = {styles.inputTabla}
                          />
                        </td>
                      ))}
                      <td style={styles.td}>
                        <span style={styles.subtotalItem}>${sub.toFixed(2)}</span>
                      </td>
                      <td style={styles.td}>
                        {items.length > 1 && (
                          <button
                            type    = "button"
                            onClick = {() => eliminarItem(idx)}
                            style   = {styles.btnEliminar}
                          >✕</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <button
            type    = "button"
            onClick = {agregarItem}
            style   = {styles.btnAgregar}
          >
            + Agregar item
          </button>

          {/* Totales */}
          <div style={styles.totales}>
            <div style={styles.totalFila}>
              <span>Subtotal (sin IVA)</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div style={styles.totalFila}>
              <span>IVA 15%</span>
              <span>${iva.toFixed(2)}</span>
            </div>
            <div style={{ ...styles.totalFila, ...styles.totalFinal }}>
              <span>TOTAL</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
        </section>

        {error && <p style={styles.error}>{error}</p>}

        <button
          type     = "submit"
          style    = {styles.btnEmitir}
          disabled = {estado === 'loading'}
        >
          {estado === 'loading' ? 'Procesando...' : 'Emitir Factura'}
        </button>

      </form>
    </div>
  )
}


// ✅ Función corregida: incrementa desde el último guardado
function _siguiente_secuencial(ultimoGuardado) {
  const num = parseInt(ultimoGuardado || '0', 10)
  return String(num + 1).padStart(9, '0')
}

function generarClaveAcceso(form, fecha) {
  const dd   = String(fecha.getDate()).padStart(2, '0')
  const mm   = String(fecha.getMonth() + 1).padStart(2, '0')
  const yyyy = fecha.getFullYear()
  const codigoBase = '12345678'
  const clave = `${dd}${mm}${yyyy}01${form.ruc}1${form.establecimiento}${form.punto_emision}${form.secuencial.padStart(9,'0')}${codigoBase}1`

  const factores = [2, 3, 4, 5, 6, 7]
  let total = 0
  for (let i = 0; i < clave.length; i++) {
    total += parseInt(clave[clave.length - 1 - i]) * factores[i % 6]
  }
  const residuo     = total % 11
  const verificador = residuo === 0 ? 0 : residuo === 1 ? 1 : 11 - residuo
  return clave + verificador
}

const styles = {
  titulo:       { fontSize: '1.75rem', marginBottom: '0.25rem' },
  subtitulo:    { color: '#64748B', fontSize: '0.875rem', marginBottom: '2rem' },
  cargando:     { color: '#64748B', fontSize: '0.875rem', marginBottom: '1rem', fontStyle: 'italic' },
  seccion:      { background: '#fff', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  seccionTitulo:{ fontSize: '1rem', color: '#005C3D', marginBottom: '1rem', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 },
  grilla:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' },
  campo:        { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  label:        { fontSize: '0.75rem', fontWeight: 600, color: '#2D3748', textTransform: 'uppercase', letterSpacing: '0.05em' },
  labelOpcional:{ fontWeight: 400, color: '#94A3B8', textTransform: 'none', letterSpacing: 0, fontSize: '0.7rem' },
  input:        { padding: '0.65rem 0.875rem', border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '0.9rem', color: '#0F1923', outline: 'none' },
  tabla:        { width: '100%', borderCollapse: 'collapse', marginBottom: '1rem', fontSize: '0.875rem' },
  th:           { padding: '0.5rem 0.75rem', background: '#F7F9FC', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' },
  td:           { padding: '0.375rem', borderBottom: '1px solid #F1F5F9' },
  inputTabla:   { padding: '0.5rem', border: '1px solid #E2E8F0', borderRadius: '6px', width: '100%', fontSize: '0.875rem', outline: 'none' },
  subtotalItem: { fontFamily: "'DM Mono', monospace", fontSize: '0.875rem', color: '#2D3748' },
  btnEliminar:  { background: '#FFF5F5', border: 'none', color: '#E53E3E', borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer' },
  btnAgregar:   { background: 'transparent', border: '1.5px dashed #CBD5E0', color: '#64748B', borderRadius: '8px', padding: '0.5rem 1rem', fontSize: '0.875rem', marginBottom: '1.5rem', cursor: 'pointer' },
  totales:      { background: '#F7F9FC', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '280px', marginLeft: 'auto' },
  totalFila:    { display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#64748B' },
  totalFinal:   { fontWeight: 700, fontSize: '1.1rem', color: '#0F1923', borderTop: '1.5px solid #E2E8F0', paddingTop: '0.5rem', marginTop: '0.25rem' },
  error:        { background: '#FFF5F5', color: '#E53E3E', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' },
  btnEmitir:    { background: '#00875A', color: '#fff', border: 'none', borderRadius: '10px', padding: '1rem 2rem', fontSize: '1rem', fontWeight: 600, width: '100%', cursor: 'pointer' },
  exito:        { textAlign: 'center', padding: '3rem', background: '#fff', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  exitoIcono:   { width: '64px', height: '64px', background: '#E3F5EE', color: '#00875A', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1.5rem' },
  exitoTitulo:  { fontSize: '1.5rem', marginBottom: '0.5rem' },
  exitoSub:     { color: '#64748B', marginBottom: '1.5rem' },
  claveBox:     { background: '#F7F9FC', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  claveLabel:   { fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 },
  clave:        { fontFamily: "'DM Mono', monospace", fontSize: '0.85rem', color: '#00875A', wordBreak: 'break-all' },
  btnNueva:     { background: '#00875A', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.75rem 1.5rem', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer' },
}