import { useState } from 'react'

export default function TerminosCondiciones({ onAceptar }) {
  const [leydo,     setLeydo]     = useState(false)
  const [scrollado, setScrollado] = useState(false)

  function handleScroll(e) {
    const el     = e.target
    const fondo  = el.scrollHeight - el.scrollTop - el.clientHeight
    if (fondo < 50) setScrollado(true)
  }

  function handleAceptar() {
    if (!scrollado) return
    localStorage.setItem('terminosAceptados', 'true')
    localStorage.setItem('terminosFecha',
      new Date().toISOString())
    onAceptar()
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>

        {/* Header */}
        <div style={styles.header}>
          <img
            src   = "/logo_tefus.png"
            alt   = "TEFUS"
            style = {{ height: '40px', objectFit: 'contain' }}
          />
          <div>
            <h2 style={styles.titulo}>Términos y Condiciones</h2>
            <p style={styles.subtitulo}>
              Sistema de Facturación Electrónica — TEFUS
            </p>
          </div>
        </div>

        {/* Aviso de lectura */}
        {!scrollado && (
          <div style={styles.avisoLeer}>
            📖 Por favor lee los términos hasta el final para continuar
          </div>
        )}

        {/* Contenido */}
        <div style={styles.contenido} onScroll={handleScroll}>

          <h3 style={styles.seccion}>1. Aceptación de los Términos</h3>
          <p style={styles.parrafo}>
            Al utilizar el Sistema de Facturación Electrónica de TEFUS
            (Technology Enhance For U Solutions), usted acepta cumplir
            con estos Términos y Condiciones. Si no está de acuerdo,
            no debe utilizar el sistema.
          </p>

          <h3 style={styles.seccion}>2. Descripción del Servicio</h3>
          <p style={styles.parrafo}>
            TEFUS provee una plataforma tecnológica para la emisión,
            firma digital y envío de comprobantes electrónicos al
            Servicio de Rentas Internas (SRI) del Ecuador, conforme
            a la normativa vigente.
          </p>

          <h3 style={styles.seccion}>3. Responsabilidades del Usuario</h3>
          <p style={styles.parrafo}>El usuario es responsable de:</p>
          <ul style={styles.lista}>
            <li>Mantener la confidencialidad de sus credenciales de acceso.</li>
            <li>Verificar la exactitud de los datos ingresados en cada comprobante.</li>
            <li>Cumplir con las obligaciones tributarias establecidas por el SRI.</li>
            <li>Custodiar el certificado digital (.p12) y su contraseña.</li>
            <li>Notificar de inmediato cualquier uso no autorizado de su cuenta.</li>
          </ul>

          <h3 style={styles.seccion}>4. Certificado Digital</h3>
          <p style={styles.parrafo}>
            El usuario declara ser el titular legítimo del certificado
            digital utilizado para la firma de comprobantes. TEFUS no
            se hace responsable por el uso indebido del certificado
            digital por parte del usuario o terceros.
          </p>

          <h3 style={styles.seccion}>5. Disponibilidad del Servicio</h3>
          <p style={styles.parrafo}>
            TEFUS procura mantener el servicio disponible las 24 horas.
            Sin embargo, la autorización final de los comprobantes depende
            exclusivamente de los servidores del SRI Ecuador, sobre los
            cuales TEFUS no tiene control. No nos hacemos responsables
            por interrupciones del servicio del SRI.
          </p>

          <h3 style={styles.seccion}>6. Protección de Datos</h3>
          <p style={styles.parrafo}>
            La información ingresada en el sistema es tratada conforme
            a la Ley Orgánica de Protección de Datos Personales del
            Ecuador. Los datos se almacenan de forma segura en
            infraestructura AWS y se utilizan exclusivamente para
            la emisión de comprobantes electrónicos.
          </p>

          <h3 style={styles.seccion}>7. Propiedad Intelectual</h3>
          <p style={styles.parrafo}>
            El sistema, su código fuente, diseño y funcionalidades son
            propiedad exclusiva de TEFUS. Queda prohibida su reproducción,
            distribución o modificación sin autorización expresa por escrito.
          </p>

          <h3 style={styles.seccion}>8. Limitación de Responsabilidad</h3>
          <p style={styles.parrafo}>
            TEFUS no será responsable por daños directos, indirectos o
            consecuentes derivados del uso o imposibilidad de uso del
            sistema, incluyendo pérdidas por errores en la información
            proporcionada por el usuario.
          </p>

          <h3 style={styles.seccion}>9. Modificaciones</h3>
          <p style={styles.parrafo}>
            TEFUS se reserva el derecho de modificar estos términos en
            cualquier momento. Los cambios serán notificados a través
            del sistema y requerirán nueva aceptación por parte del usuario.
          </p>

          <h3 style={styles.seccion}>10. Ley Aplicable</h3>
          <p style={styles.parrafo}>
            Estos términos se rigen por las leyes de la República del
            Ecuador. Cualquier controversia será resuelta ante los
            tribunales competentes de Ecuador.
          </p>

          <div style={styles.ultimaLinea}>
            <p style={styles.parrafo}>
              <strong>Fecha de vigencia:</strong> Septiembre 2026
            </p>
            <p style={styles.parrafo}>
              <strong>TEFUS — Technology Enhance For U Solutions</strong><br/>
              Ecuador
            </p>
          </div>

        </div>

        {/* Checkbox y botón */}
        <div style={styles.footer}>

          <label style={{
            ...styles.checkLabel,
            opacity: scrollado ? 1 : 0.4,
            cursor:  scrollado ? 'pointer' : 'not-allowed'
          }}>
            <input
              type     = "checkbox"
              checked  = {leydo}
              onChange = {e => scrollado && setLeydo(e.target.checked)}
              disabled = {!scrollado}
              style    = {styles.checkbox}
            />
            He leído y acepto los Términos y Condiciones
          </label>

          <button
            onClick  = {handleAceptar}
            disabled = {!leydo || !scrollado}
            style    = {{
              ...styles.btnAceptar,
              opacity: leydo && scrollado ? 1 : 0.5,
              cursor:  leydo && scrollado ? 'pointer' : 'not-allowed',
            }}
          >
            Aceptar y Continuar
          </button>

        </div>

      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position:       'fixed',
    inset:          0,
    background:     'rgba(0,0,0,0.7)',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    zIndex:         9999,
    padding:        '1rem',
  },
  modal: {
    background:    '#fff',
    borderRadius:  '16px',
    width:         '100%',
    maxWidth:      '680px',
    maxHeight:     '90vh',
    display:       'flex',
    flexDirection: 'column',
    overflow:      'hidden',
    boxShadow:     '0 20px 60px rgba(0,0,0,0.3)',
  },
  header: {
    display:      'flex',
    alignItems:   'center',
    gap:          '1rem',
    padding:      '1.5rem 1.75rem',
    borderBottom: '1px solid #E2E8F0',
    background:   '#F7F9FC',
  },
  titulo: {
    margin:   0,
    fontSize: '1.1rem',
    color:    '#0F1923',
  },
  subtitulo: {
    margin:   '0.2rem 0 0',
    fontSize: '0.8rem',
    color:    '#64748B',
  },
  avisoLeer: {
    background: '#FFF7ED',
    color:      '#C2410C',
    padding:    '0.625rem 1.75rem',
    fontSize:   '0.8rem',
    fontWeight: 500,
  },
  contenido: {
    flex:       1,
    overflowY:  'auto',
    padding:    '1.5rem 1.75rem',
  },
  seccion: {
    fontSize:     '0.9rem',
    color:        '#005C3D',
    marginTop:    '1.5rem',
    marginBottom: '0.5rem',
    fontFamily:   "'DM Sans', sans-serif",
  },
  parrafo: {
    fontSize:   '0.875rem',
    color:      '#2D3748',
    lineHeight: '1.7',
    margin:     '0 0 0.75rem',
  },
  lista: {
    paddingLeft: '1.25rem',
    margin:      '0.5rem 0 0.75rem',
    display:     'flex',
    flexDirection: 'column',
    gap:         '0.4rem',
  },
  ultimaLinea: {
    borderTop:   '1px solid #E2E8F0',
    marginTop:   '1.5rem',
    paddingTop:  '1rem',
  },
  footer: {
    padding:      '1.25rem 1.75rem',
    borderTop:    '1px solid #E2E8F0',
    background:   '#F7F9FC',
    display:      'flex',
    flexDirection:'column',
    gap:          '1rem',
  },
  checkLabel: {
    display:    'flex',
    alignItems: 'center',
    gap:        '0.75rem',
    fontSize:   '0.875rem',
    color:      '#2D3748',
    fontWeight: 500,
  },
  checkbox: {
    width:  '18px',
    height: '18px',
    cursor: 'inherit',
    accentColor: '#00875A',
  },
  btnAceptar: {
    background:   '#00875A',
    color:        '#fff',
    border:       'none',
    borderRadius: '8px',
    padding:      '0.875rem',
    fontSize:     '1rem',
    fontWeight:   600,
    width:        '100%',
  },
}