import { useState }        from 'react'
import { logout, getEmail } from '../services/auth'
import NuevaFactura         from './NuevaFactura'
import ListaFacturas        from './ListaFacturas'
import Configuracion        from './Configuracion'
import TerminosCondiciones  from './TerminosCondiciones'

const TABS = [
  { id: 'nueva',         icono: '＋', label: 'Nueva Factura'  },
  { id: 'lista',         icono: '📄', label: 'Comprobantes'   },
  { id: 'configuracion', icono: '⚙', label: 'Configuración'  },
]

export default function Dashboard({ onLogout }) {
  const [tab,             setTab]             = useState('nueva')
  const [keyNueva,        setKeyNueva]        = useState(0)
  const [mostrarTerminos, setMostrarTerminos] = useState(false)

  function handleTabChange(nuevoTab) {
    if (nuevoTab === 'nueva') setKeyNueva(k => k + 1)
    setTab(nuevoTab)
  }

  function handleLogout() {
    logout()
    onLogout()
  }

  return (
    <>
      {/* Modal Términos */}
      {mostrarTerminos && (
        <TerminosCondiciones
          onAceptar={() => setMostrarTerminos(false)}
        />
      )}

      <div style={styles.contenedor}>

        {/* Sidebar */}
        <aside style={styles.sidebar}>

          {/* ✅ Logo */}
          {/* <div style={styles.logoBox}>
            <img
              src   = "/logo_tefus.png"
              alt   = "TEFUS"
              style = {{
                width:     '150px',
                maxHeight: '80px',
                objectFit: 'contain',
              }}
            />
          </div> */}

          {/* Navegación */}
          <nav style={styles.nav}>
            {TABS.map(t => (
              <button
                key     = {t.id}
                onClick = {() => handleTabChange(t.id)}
                style   = {{
                  ...styles.navItem,
                  ...(tab === t.id ? styles.navActivo : {})
                }}
              >
                <span style={styles.navIcono}>{t.icono}</span>
                {t.label}
              </button>
            ))}
          </nav>

          {/* Espaciador */}
          <div style={{ flex: 1 }} />

          {/* ✅ Términos y Condiciones — visible y bien ubicado */}
          <button
            onClick = {() => setMostrarTerminos(true)}
            style   = {styles.btnTerminos}
          >
            📋 Términos y Condiciones
          </button>

          {/* Usuario */}
          <div style={styles.userInfo}>
            <div style={styles.userIcono}>
              {getEmail()?.[0]?.toUpperCase() || 'U'}
            </div>
            <div style={styles.userDatos}>
              <p style={styles.userEmail}>{getEmail()}</p>
              <button onClick={handleLogout} style={styles.btnLogout}>
                Cerrar sesión
              </button>
            </div>
          </div>

        </aside>

        {/* Contenido principal */}
        <main style={styles.main}>
          <div className="fade-in" key={tab}>
            {tab === 'nueva' && (
              <NuevaFactura key={keyNueva} />
            )}
            {tab === 'lista'         && <ListaFacturas />}
            {tab === 'configuracion' && <Configuracion />}
          </div>
        </main>

      </div>
    </>
  )
}

const styles = {
  contenedor: {
    display:   'flex',
    minHeight: '100vh',
  },
  sidebar: {
    width:         '230px',
    background:    '#0F1923',
    display:       'flex',
    flexDirection: 'column',
    padding:       '0',
    position:      'fixed',
    top:           0,
    left:          0,
    bottom:        0,
    zIndex:        100,
  },
  logoBox: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '1.5rem 1rem',
    borderBottom:    '1px solid #1E2D3D',
    background:      '#0A1520',
  },
  nav: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '0.25rem',
    padding:       '1rem 0.75rem',
  },
  navItem: {
    display:      'flex',
    alignItems:   'center',
    gap:          '0.625rem',
    padding:      '0.75rem 1rem',
    background:   'transparent',
    color:        '#94A3B8',
    border:       'none',
    borderRadius: '8px',
    textAlign:    'left',
    fontSize:     '0.9rem',
    cursor:       'pointer',
    transition:   'all 0.15s',
    width:        '100%',
  },
  navActivo: {
    background: '#1E2D3D',
    color:      '#34D399',
    fontWeight: '600',
  },
  navIcono: {
    fontSize:   '1rem',
    flexShrink: 0,
    width:      '20px',
    textAlign:  'center',
  },
  btnTerminos: {
    background:   'transparent',
    border:       '1px solid #1E3A5F',
    borderRadius: '8px',
    color:        '#64748B',
    fontSize:     '0.75rem',
    padding:      '0.6rem 1rem',
    margin:       '0 0.75rem 0.75rem',
    cursor:       'pointer',
    textAlign:    'left',
    transition:   'all 0.15s',
    display:      'flex',
    alignItems:   'center',
    gap:          '0.5rem',
  },
  userInfo: {
    display:      'flex',
    alignItems:   'center',
    gap:          '0.75rem',
    padding:      '1rem 0.75rem',
    borderTop:    '1px solid #1E2D3D',
    background:   '#0A1520',
  },
  userIcono: {
    width:          '34px',
    height:         '34px',
    borderRadius:   '50%',
    background:     '#1E3A5F',
    color:          '#34D399',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    fontWeight:     700,
    fontSize:       '0.875rem',
    flexShrink:     0,
  },
  userDatos: {
    flex:     1,
    minWidth: 0,
  },
  userEmail: {
    color:        '#64748B',
    fontSize:     '0.7rem',
    margin:       '0 0 0.3rem',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap',
  },
  btnLogout: {
    background:   'transparent',
    border:       'none',
    color:        '#E53E3E',
    fontSize:     '0.75rem',
    padding:      0,
    cursor:       'pointer',
    fontWeight:   500,
  },
  main: {
    marginLeft: '230px',
    flex:       1,
    padding:    '2rem',
    minHeight:  '100vh',
    background: '#F7F9FC',
  },
}