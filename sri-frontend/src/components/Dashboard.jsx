import { useState } from 'react'
import { logout, getEmail } from '../services/auth'
import NuevaFactura  from './NuevaFactura'
import ListaFacturas from './ListaFacturas'

const TABS = [
  { id: 'nueva',  label: '+ Nueva Factura' },
  { id: 'lista',  label: 'Comprobantes'    },
]

export default function Dashboard({ onLogout }) {
  const [tab, setTab] = useState('nueva')

  function handleLogout() {
    logout()
    onLogout()
  }

  return (
    <div style={styles.contenedor}>

      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.logoSide}>
          <div style={styles.logoBox}>SRI</div>
          <span style={styles.logoTexto}>Facturación</span>
        </div>

        <nav style={styles.nav}>
          {TABS.map(t => (
            <button
              key     = {t.id}
              onClick = {() => setTab(t.id)}
              style   = {{
                ...styles.navItem,
                ...(tab === t.id ? styles.navActivo : {})
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div style={styles.userInfo}>
          <p style={styles.userEmail}>{getEmail()}</p>
          <button onClick={handleLogout} style={styles.btnLogout}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido principal */}
      <main style={styles.main}>
        <div className="fade-in" key={tab}>
          {tab === 'nueva' && <NuevaFactura />}
          {tab === 'lista' && <ListaFacturas />}
        </div>
      </main>

    </div>
  )
}

const styles = {
  contenedor: {
    display:   'flex',
    minHeight: '100vh',
  },
  sidebar: {
    width:         '240px',
    background:    '#0F1923',
    display:       'flex',
    flexDirection: 'column',
    padding:       '1.5rem',
    position:      'fixed',
    top:           0,
    left:          0,
    bottom:        0,
  },
  logoSide: {
    display:     'flex',
    alignItems:  'center',
    gap:         '0.75rem',
    marginBottom:'2rem',
  },
  logoBox: {
    background:   '#00875A',
    color:        '#fff',
    borderRadius: '8px',
    padding:      '0.4rem 0.6rem',
    fontFamily:   "'DM Mono', monospace",
    fontSize:     '0.85rem',
  },
  logoTexto: {
    color:      '#fff',
    fontWeight: '600',
    fontSize:   '1rem',
  },
  nav: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '0.5rem',
    flex:          1,
  },
  navItem: {
    padding:      '0.75rem 1rem',
    background:   'transparent',
    color:        '#94A3B8',
    border:       'none',
    borderRadius: '8px',
    textAlign:    'left',
    fontSize:     '0.9rem',
  },
  navActivo: {
    background: '#1E2D3D',
    color:      '#00875A',
    fontWeight: '600',
  },
  userInfo: {
    borderTop:  '1px solid #1E2D3D',
    paddingTop: '1rem',
  },
  userEmail: {
    color:        '#64748B',
    fontSize:     '0.75rem',
    marginBottom: '0.5rem',
    wordBreak:    'break-all',
  },
  btnLogout: {
    background:   'transparent',
    border:       '1px solid #2D3748',
    color:        '#64748B',
    borderRadius: '6px',
    padding:      '0.4rem 0.75rem',
    fontSize:     '0.8rem',
    width:        '100%',
  },
  main: {
    marginLeft: '240px',
    flex:       1,
    padding:    '2rem',
    maxWidth:   '960px',
  }
}