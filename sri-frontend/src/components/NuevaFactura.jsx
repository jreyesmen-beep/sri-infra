import { useState, useEffect, useRef } from 'react'  // ← agregar useRef
import { emitirFactura, obtenerConfiguracion } from '../services/api'
import { getToken }                            from '../services/auth'  // ← debe estar
import { useRIDE }                             from '../hooks/useRIDE'  // ← nuevo
import { formatearFechaEcuador }               from '../utils/fecha'

const API_URL = import.meta.env.VITE_API_URL

// Estados posibles del SRI
const ESTADOS_SRI = {
  EN_PROCESO:        { color: '#EFF6FF', texto: '#1D4ED8', icono: '⏳', label: 'Procesando...'          },
  AUTORIZADO:        { color: '#E3F5EE', texto: '#005C3D', icono: '✓',  label: 'Autorizado por el SRI'  },
  YA_AUTORIZADO:     { color: '#F0FDF4', texto: '#166534', icono: '✓',  label: 'Comprobante ya autorizado'    }, // ← nuevo
  SRI_NO_DISPONIBLE: { color: '#FFF7ED', texto: '#C2410C', icono: '⚠️', label: 'SRI no disponible'      },
  SRI_RECHAZO:       { color: '#FFF5F5', texto: '#E53E3E', icono: '✕',  label: 'Rechazado por el SRI'   },
  NO_AUTORIZADO:     { color: '#FFF5F5', texto: '#E53E3E', icono: '✕',  label: 'No autorizado'           },
  ERROR_INTERNO:     { color: '#FFF5F5', texto: '#E53E3E', icono: '✕',  label: 'Error interno'           },
  NO_ENCONTRADO:     { color: '#F8FAFC', texto: '#64748B', icono: '○',  label: 'Buscando...'             },
}

const ITEM_VACIO = {
  codigo: '', descripcion: '', cantidad: 1,
  precio_unitario: 0, descuento: 0
}

export default function NuevaFactura() {

  const [items,          setItems]          = useState([{ ...ITEM_VACIO }])
  const [estado,         setEstado]         = useState('idle')
  const [resultado,      setResultado]      = useState(null)
  const [error,          setError]          = useState([])  // ← array en lugar de string
  const [cargandoConfig, setCargandoConfig] = useState(true)
  // ✅ Reemplaza descargandoPDF, errorPDF, descargarRIDE, imprimirRIDE
  const ride = useRIDE()
  //Estados para control de Autorizacion
  const [estadoSRI,    setEstadoSRI]    = useState(null)
  const [pollingActivo, setPollingActivo] = useState(false)
  const [intentos,     setIntentos]     = useState(0)
  const intervaloRef = useRef(null)

  const [ivaTarifa,    setIvaTarifa]    = useState(0.15)
  const [ivaCodigo,    setIvaCodigo]    = useState('2')
  const [ivaCodigoPct, setIvaCodigoPct] = useState('4')
  const [ivaPorcentaje,setIvaPorcentaje]= useState('15')

  const [form, setForm] = useState({
    ruc:                 '',
    razon_social:        '',
    nombre_comercial:    '',
    establecimiento:     '001',
    punto_emision:       '002',
    secuencial:          '',
    dir_matriz:          '',
    tipo_id_comprador:   '07',
    razon_comprador:     'CONSUMIDOR FINAL',
    id_comprador:        '9999999999999',
    dir_establecimiento: '',
    dir_comprador:       '',               // ← nuevo
    email_comprador:     '',
    fecha_emision_input: _hoyInput(),      // ← nuevo: hoy por defecto
  })

  // ✅ Cargar configuración del emisor
  useEffect(() => {
    function cargar() {
      obtenerConfiguracion()
        .then(config => {
          if (!config) return

          // ✅ Guardar config de IVA en estado
          const ivaTarifa = parseFloat(config.iva_tarifa || '0.15')
          setIvaTarifa(ivaTarifa)
          setIvaCodigo(config.iva_codigo             || '2')
          setIvaCodigoPct(config.iva_codigo_porcentaje || '4')
          setIvaPorcentaje(config.iva_porcentaje       || '15')

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

// -----------------------------------------------
  // Polling: consultar estado cada 3 segundos
  // -----------------------------------------------
  useEffect(() => {
    if (!pollingActivo || !resultado?.clave_acceso) return

    const MAX_INTENTOS = 20   // 20 × 3s = 60 segundos máximo

    async function consultarEstado() {
      try {
        const res  = await fetch(
          `${API_URL}/facturas/${resultado.clave_acceso}`,
          { headers: { "Authorization": `Bearer ${getToken()}` } }
        )
        const data = await res.json()

        setEstadoSRI(data)
        setIntentos(i => i + 1)

        // Detener polling si ya hay respuesta definitiva
        const estadosFinales = [
          'AUTORIZADO', 'YA_AUTORIZADO', 'SRI_RECHAZO',
          'NO_AUTORIZADO', 'SRI_NO_DISPONIBLE', 'ERROR_INTERNO'
        ]
        if (estadosFinales.includes(data.estado)) {
          detenerPolling()
        }

      } catch (err) {
        console.warn('Error consultando estado:', err.message)
      }
    }

    // Primera consulta inmediata tras 3 segundos
    const timeout = setTimeout(() => {
      consultarEstado()
      // Luego cada 3 segundos
      intervaloRef.current = setInterval(consultarEstado, 3000)
    }, 3000)

    // ✅ Timeout máximo — mostrar mensaje si el SRI no responde
    const timeoutMax = setTimeout(() => {
      detenerPolling()
      setEstadoSRI(prev => prev || {
        clave_acceso: resultado.clave_acceso,
        estado:       'SRI_NO_DISPONIBLE',
        mensaje:      'El SRI tardó demasiado. Consulta el estado en "Comprobantes".'
      })
    }, MAX_INTENTOS * 3000)

    return () => {
      clearTimeout(timeout)
      clearTimeout(timeoutMax)
      if (intervaloRef.current) clearInterval(intervaloRef.current)
    }
  }, [pollingActivo, resultado?.clave_acceso])

  function detenerPolling() {
    setPollingActivo(false)
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current)
      intervaloRef.current = null
    }
  }

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

  function inputItemStyle(valor, tipo = 'text') {
    const vacio = tipo === 'number'
      ? (!valor && valor !== 0) || valor === ''
      : !String(valor || '').trim()

    return {
      ...styles.inputTabla,
      borderColor: vacio ? '#E53E3E' : '#E2E8F0',
      background:  vacio ? '#FFF5F5' : '#fff',
    }
  }

  function agregarItem()    { setItems(prev => [...prev, { ...ITEM_VACIO }]) }
  function eliminarItem(idx){ setItems(prev => prev.filter((_, i) => i !== idx)) }

  function validarFormulario() {
    const errores = []

    // Datos del emisor
    if (!form.ruc || form.ruc.length !== 13) {
      errores.push('El RUC debe tener 13 dígitos')
    }
    if (!form.razon_social?.trim()) {
      errores.push('La razón social es requerida')
    }
    if (!form.establecimiento || form.establecimiento.length !== 3) {
      errores.push('El establecimiento debe tener 3 dígitos')
    }
    if (!form.punto_emision || form.punto_emision.length !== 3) {
      errores.push('El punto de emisión debe tener 3 dígitos')
    }
    if (!form.secuencial || form.secuencial.length !== 9) {
      errores.push('El secuencial debe tener 9 dígitos')
    }
    if (!form.dir_matriz?.trim()) {
      errores.push('La dirección matriz es requerida')
    }

    // Datos del comprador
    if (!form.id_comprador?.trim()) {
      errores.push('La identificación del comprador es requerida')
    }
    if (!form.razon_comprador?.trim()) {
      errores.push('La razón social del comprador es requerida')
    }

    // Items
    if (items.length === 0) {
      errores.push('Debe agregar al menos un producto o servicio')
    }

    // ✅ Validar fecha
    if (!form.fecha_emision_input) {
      errores.push('La fecha de emisión es requerida')
    } else {
      const hoy        = new Date()
      hoy.setHours(0, 0, 0, 0)
      const fechaSelec = new Date(form.fecha_emision_input)
      if (fechaSelec > hoy) {
        errores.push('La fecha de emisión no puede ser futura')
      }
    }

    // ✅ Validar dirección si no es consumidor final
    if (form.tipo_id_comprador !== '07' &&
        form.id_comprador !== '9999999999999') {
      // Dirección opcional — no valida como requerida
      // pero si se ingresa debe tener al menos 5 caracteres
      if (form.dir_comprador &&
          form.dir_comprador.trim().length < 5) {
        errores.push('La dirección del comprador debe tener al menos 5 caracteres')
      }
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const num  = i + 1

      if (!item.codigo?.trim()) {
        errores.push(`Ítem ${num}: el código es requerido`)
      }
      if (!item.descripcion?.trim()) {
        errores.push(`Ítem ${num}: la descripción es requerida`)
      }
      if (!item.cantidad || item.cantidad <= 0) {
        errores.push(`Ítem ${num}: la cantidad debe ser mayor a 0`)
      }
      if (item.precio_unitario === undefined ||
          item.precio_unitario === null ||
          item.precio_unitario < 0) {
        errores.push(`Ítem ${num}: el precio unitario no puede ser negativo`)
      }
      if (item.precio_unitario === 0) {
        errores.push(`Ítem ${num}: el precio unitario debe ser mayor a 0`)
      }
    }

    // Total
    if (subtotal <= 0) {
      errores.push('El total de la factura debe ser mayor a $0.00')
    }

    return errores
  }

  function _hoyInput() {
    const hoy = new Date()
    return hoy.toISOString().split('T')[0]  // formato YYYY-MM-DD para input type=date
  }

  function _inputAFechaEcuador(fechaInput) {
    // Convierte YYYY-MM-DD → DD/MM/YYYY (formato SRI)
    if (!fechaInput) return ''
    const [yyyy, mm, dd] = fechaInput.split('-')
    return `${dd}/${mm}/${yyyy}`
  }

  async function handleSubmit(e) {
    e.preventDefault()

    // ✅ Validar antes de enviar
    const erroresValidacion = validarFormulario()
    if (erroresValidacion.length > 0) {
      setError(erroresValidacion)  // ← array de errores
      return
    }

    setEstado('loading')
    setError('')
    setEstadoSRI(null)
    setIntentos(0)

    // ✅ Usar fecha del formulario en lugar de la fecha actual
    const fechaInput = form.fecha_emision_input || _hoyInput()    
    //const fecha    = new Date()
    //const fechaStr = `${String(fecha.getDate()).padStart(2,'0')}/${String(fecha.getMonth()+1).padStart(2,'0')}/${fecha.getFullYear()}`
    const fechaStr   = _inputAFechaEcuador(fechaInput)

    // Para generar la clave de acceso usar la fecha seleccionada
    const [yyyy, mm, dd] = fechaInput.split('-')
    const fechaObj       = new Date(
      parseInt(yyyy),
      parseInt(mm) - 1,
      parseInt(dd)
    )
    // ✅ Esto sí es correcto — usa hora local, no UTC

    // Verificar que los valores son correctos
    //logger.info?.(`Fecha para clave: ${dd}/${mm}/${yyyy}`)

    //const claveAcceso = generarClaveAcceso(form, fecha)
    const claveAcceso = generarClaveAcceso(form, fechaObj)

    // Verificar en consola
    console.log('Fecha input:',   fechaInput)
    console.log('Fecha SRI:',     fechaStr)
    console.log('Clave acceso:',  claveAcceso)
    console.log('Longitud clave:', claveAcceso.length, '(debe ser 49)')

    // Cálculo dinámico con IVA de la configuración
    const subtotal = items.reduce(
      (acc, i) => acc + (i.cantidad * i.precio_unitario - i.descuento), 0
    )
    const iva   = subtotal * ivaTarifa   // ← dinámico
    const total = subtotal + iva

    // ✅ Verificar duplicado antes de enviar
    try {
      const estadoExistente = await verificarDuplicado(claveAcceso)
      if (estadoExistente &&
          estadoExistente.estado !== 'NO_ENCONTRADO' &&
          estadoExistente.estado !== 'EN_PROCESO') {
        setError([
          `El comprobante con secuencial ${form.secuencial} ya fue procesado.`,
          `Estado: ${estadoExistente.estado}`,
          'Por favor verifica el secuencial en la sección de Comprobantes.'
        ])
        setEstado('idle')
        return
      }
    } catch {
      // Si no se puede verificar, continuar con el envío
      console.warn('No se pudo verificar duplicado, continuando...')
    }

    const payload = {
      ...form,
      ambiente:            '1',
      fecha_emision:        fechaStr,
      clave_acceso:         claveAcceso, //generarClaveAcceso(form, fecha),
      email_comprador:      form.email_comprador || '',
      total_sin_impuestos:  subtotal,
      total_descuento:      items.reduce((a, i) => a + Number(i.descuento), 0),
      importe_total:        total,

      // En el payload usar los valores de la configuración
      impuestos: [{
        codigo:  ivaCodigo,       // ← dinámico
        tarifa:  ivaCodigoPct,    // ← dinámico
        base:    subtotal,
        valor:   iva
      }],      

      items: items.map(it => ({
        ...it,
        precio_total: it.cantidad * it.precio_unitario - it.descuento,
        impuestos: [{
          codigo:      ivaCodigo,       // ← dinámico
          tarifa:      ivaCodigoPct,    // ← dinámico
          porcentaje:  ivaPorcentaje,   // ← dinámico
          base:  it.cantidad * it.precio_unitario - it.descuento,
          valor: (it.cantidad * it.precio_unitario - it.descuento) * ivaTarifa
        }]
      }))
    }

    try {
      const res = await emitirFactura(payload)
      setResultado(res)
      setEstado('ok')
      // ✅ Iniciar polling para consultar autorización
      setPollingActivo(true)      
    } 
    catch (err) {
      setError(err.message)
      setEstado('error')
    }
  }

  // -----------------------------------------------
  // Pantalla de éxito con estado en tiempo real
  // -----------------------------------------------
  if (estado === 'ok') {

    const infoEstado = estadoSRI
      ? (ESTADOS_SRI[estadoSRI.estado] || ESTADOS_SRI.ERROR_INTERNO)
      : ESTADOS_SRI.EN_PROCESO

    const autorizado = ['AUTORIZADO', 'YA_AUTORIZADO']
                        .includes(estadoSRI?.estado)

    const rechazado  = ['SRI_RECHAZO', 'NO_AUTORIZADO',
                        'SRI_NO_DISPONIBLE', 'ERROR_INTERNO']
                       .includes(estadoSRI?.estado)

    const yaProcesado = estadoSRI?.estado === 'YA_AUTORIZADO'
    
    return (
      <div style={styles.exito} className="fade-in">

        {/* Errores de validación */}
        {Array.isArray(error) && error.length > 0 && (
          <div style={styles.erroresBox} className="fade-in">
            <p style={styles.erroresTitulo}>
              ⚠️ Por favor corrige los siguientes errores:
            </p>
            <ul style={styles.erroresList}>
              {error.map((err, i) => (
                <li key={i} style={styles.errorItem}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {typeof error === 'string' && error && (
          <div style={styles.erroresBox}>
            <p style={styles.erroresTitulo}>⚠️ {error}</p>
          </div>
        )}

        {/* Estado del SRI en tiempo real */}
        <div style={{
          ...styles.estadoBadge,
          background: infoEstado.color,
          color:      infoEstado.texto,
        }}>
          <span style={styles.estadoIcono}>{infoEstado.icono}</span>
          <div>
            <p style={styles.estadoLabel}>{infoEstado.label}</p>
            {pollingActivo && (
              <p style={styles.estadoSub}>
                Consultando al SRI... ({intentos} verificación{intentos !== 1 ? 'es' : ''})
              </p>
            )}
          </div>
        </div>

        {/* ✅ Aviso especial para comprobante ya procesado */}
        {yaProcesado && (
          <div style={styles.avisoYaProcesado}>
            <p style={styles.avisoYaTitulo}>
              ℹ️ Este comprobante ya había sido enviado anteriormente
            </p>
            <p style={styles.avisoYaTexto}>
              El sistema detectó que este número de factura ya fue
              autorizado por el SRI en un envío previo. No se realizó
              un nuevo envío para evitar duplicados. Los datos de
              autorización corresponden al envío original.
            </p>
            {estadoSRI?.fecha_procesamiento && (
              <p style={styles.avisoYaFecha}>
                Fecha del envío original:{' '}
                {new Date(estadoSRI.fecha_procesamiento)
                  .toLocaleString('es-EC')}
              </p>
            )}
          </div>
        )}

        
        {/* Datos del comprobante 
        // En la pantalla de éxito
        */}
        <div style={styles.claveBox}>
          <span style={styles.claveLabel}>Clave de acceso</span>
          <span style={styles.claveValor}>{resultado?.clave_acceso}</span>

          {/* Número de autorización — solo si está autorizado */}
          {autorizado && estadoSRI?.numero_autorizacion && (
            <>
              <span style={{ ...styles.claveLabel, marginTop: '0.75rem' }}>
                Número de autorización
              </span>
              <span style={{ ...styles.claveValor, color: '#005C3D' }}>
                {estadoSRI.numero_autorizacion}
              </span>
              <span style={{ ...styles.claveLabel, marginTop: '0.5rem' }}>
                Fecha de autorización
              </span>
              <span style={styles.claveValor}>
                {formatearFechaEcuador(estadoSRI.fecha_autorizacion)}
              </span>
            </>
          )}

          {/* Detalle del error si fue rechazado */}
          {rechazado && estadoSRI?.mensaje_error && (
            <>
              <span style={{ ...styles.claveLabel, marginTop: '0.75rem', color: '#E53E3E' }}>
                Motivo
              </span>
              <span style={{ ...styles.claveValor, color: '#E53E3E', fontSize: '0.75rem' }}>
                {estadoSRI.mensaje_error}
              </span>
            </>
          )}
        </div>

        {/* Botones — solo si está autorizado */}
        <div style={styles.botonesExito}>
          {autorizado && (
            <>
              <button
                onClick  = {() => ride.descargar(resultado?.clave_acceso)}
                disabled = {ride.descargando}
                style    = {{
                  ...styles.btnRIDE,
                  opacity: ride.descargando ? 0.7 : 1
                }}
              >
                {ride.descargando ? '⏳ Procesando...' : '⬇ Descargar RIDE (PDF)'}
              </button>

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
            </>
          )}

{/*           <button
            style   = {styles.btnNueva}
            onClick = {() => {
              detenerPolling()
              setEstado('idle')
              setResultado(null)
              setEstadoSRI(null)
              setError('')
              ride.limpiarError()
              setItems([{ ...ITEM_VACIO }])
            }}
          >
            + Emitir otro comprobante
          </button> */}
        </div>

        {ride.error && (
          <div style={styles.errorPDF}>{ride.error}</div>
        )}

        {/* Aviso si aún está procesando */}
        {pollingActivo && (
          <p style={styles.avisoEspera}>
            ⏳ Esperando respuesta del SRI Ecuador...
            El proceso puede tardar hasta 60 segundos.
          </p>
        )}

        {/* Aviso timeout */}
        {!pollingActivo && !autorizado && !rechazado && intentos > 0 && (
          <p style={styles.avisoEspera}>
            El SRI tardó más de lo esperado. Ve a{' '}
            <strong>Comprobantes</strong> y consulta con la clave de acceso.
          </p>
        )}

      {/* Botones de acción */}
      <div style={styles.botonesExito}>
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
                onChange = {e => setForm(f => ({
                  ...f,
                  tipo_id_comprador: e.target.value,
                  // Limpiar datos si cambia a consumidor final
                  razon_comprador: e.target.value === '07'
                    ? 'CONSUMIDOR FINAL' : f.razon_comprador,
                  id_comprador: e.target.value === '07'
                    ? '9999999999999' : '',
                  dir_comprador: e.target.value === '07'
                    ? '' : f.dir_comprador,
                }))}
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
                type        = "text"
                value       = {form.id_comprador}
                onChange    = {e => setForm(f => ({ ...f, id_comprador: e.target.value }))}
                placeholder = {form.tipo_id_comprador === '07'
                  ? '9999999999999' : 'Ingrese identificación'}
                required
                readOnly    = {form.tipo_id_comprador === '07'}
                style       = {{
                  ...styles.input,
                  background: form.tipo_id_comprador === '07' ? '#F7F9FC' : '#fff',
                  color:      form.tipo_id_comprador === '07' ? '#94A3B8' : '#0F1923',
                }}
              />
            </div>

            <div style={{ ...styles.campo, gridColumn: '1 / -1' }}>
              <label style={styles.label}>Razón Social / Nombres</label>
              <input
                type        = "text"
                value       = {form.razon_comprador}
                onChange    = {e => setForm(f => ({ ...f, razon_comprador: e.target.value }))}
                placeholder = "CONSUMIDOR FINAL"
                required
                readOnly    = {form.tipo_id_comprador === '07'}
                style       = {{
                  ...styles.input,
                  background: form.tipo_id_comprador === '07' ? '#F7F9FC' : '#fff',
                  color:      form.tipo_id_comprador === '07' ? '#94A3B8' : '#0F1923',
                }}
              />
            </div>

            {/* ✅ Dirección — solo si NO es consumidor final */}
            {form.tipo_id_comprador !== '07' && (
              <div style={{ ...styles.campo, gridColumn: '1 / -1' }}>
                <label style={styles.label}>
                  Dirección del Comprador
                  <span style={styles.labelOpcional}> (opcional)</span>
                </label>
                <input
                  type        = "text"
                  value       = {form.dir_comprador || ''}
                  onChange    = {e => setForm(f => ({ ...f, dir_comprador: e.target.value }))}
                  placeholder = "Av. Principal 123, Ciudad"
                  style       = {styles.input}
                />
              </div>
            )}

            {/* ✅ Fecha de emisión editable */}
            <div style={styles.campo}>
              <label style={styles.label}>
                Fecha de Emisión
                <span style={styles.requerido}> *</span>
              </label>
              <input
                type     = "date"
                value    = {form.fecha_emision_input || _hoyInput()}
                onChange = {e => setForm(f => ({
                  ...f,
                  fecha_emision_input: e.target.value
                }))}
                max      = {_hoyInput()}   // no permitir fechas futuras
                required
                style    = {styles.input}
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
                            style       = {inputItemStyle(item[campo], type)}  // ← nuevo
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

            {/* En el label de IVA del formulario mostrar el porcentaje real */}
            <div style={styles.totalFila}>
              <span>IVA {ivaPorcentaje}%</span>   {/* ← dinámico */}
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
          style    = {{
            ...styles.btnEmitir,
            opacity: estado === 'loading' ? 0.7 : 1,
            cursor:  estado === 'loading' ? 'not-allowed' : 'pointer',
          }}
          disabled = {estado === 'loading'}
        >
        {estado === 'loading'
          ? '⏳ Enviando al SRI...'
          : 'Emitir Factura'
        }
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
//Estados para validacion de Autorizacion
  estadoBadge: {
    display:      'flex',
    alignItems:   'center',
    gap:          '1rem',
    borderRadius: '12px',
    padding:      '1.25rem 1.5rem',
    marginBottom: '1.25rem',
    transition:   'all 0.3s',
  },
  estadoIcono: {
    fontSize:   '2rem',
    flexShrink: 0,
  },
  estadoLabel: {
    margin:     0,
    fontWeight: 700,
    fontSize:   '1rem',
  },
  estadoSub: {
    margin:    '0.25rem 0 0',
    fontSize:  '0.75rem',
    opacity:   0.8,
  },
  erroresBox: {
    background:   '#FFF5F5',
    border:       '1.5px solid #FED7D7',
    borderRadius: '10px',
    padding:      '1rem 1.25rem',
    marginBottom: '1rem',
  },
  erroresTitulo: {
    color:        '#C53030',
    fontWeight:   700,
    fontSize:     '0.9rem',
    marginBottom: '0.5rem',
  },
  erroresList: {
    margin:     0,
    paddingLeft:'1.25rem',
    display:    'flex',
    flexDirection: 'column',
    gap:        '0.3rem',
  },
  errorItem: {
    color:    '#C53030',
    fontSize: '0.85rem',
  },

  avisoYaProcesado: {
    background:   '#FFFBEB',
    border:       '1.5px solid #FDE68A',
    borderRadius: '10px',
    padding:      '1rem 1.25rem',
    marginBottom: '1rem',
    textAlign:    'left',
  },
  avisoYaTitulo: {
    color:        '#92400E',
    fontWeight:   700,
    fontSize:     '0.9rem',
    margin:       '0 0 0.5rem',
  },
  avisoYaTexto: {
    color:      '#78350F',
    fontSize:   '0.825rem',
    lineHeight: '1.6',
    margin:     '0 0 0.5rem',
  },
  avisoYaFecha: {
    color:      '#92400E',
    fontSize:   '0.75rem',
    margin:     0,
    fontWeight: 600,
  },  
}