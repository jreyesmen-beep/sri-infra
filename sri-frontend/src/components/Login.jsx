import { useState } from 'react'
import { login, cambiarPasswordInicial } from '../services/auth'

export default function Login({ onLogin }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [newPass,  setNewPass]  = useState('')
  const [estado,   setEstado]   = useState('idle')  // idle | loading | newPassword | error
  const [error,    setError]    = useState('')
  const [userTemp, setUserTemp] = useState(null)

  async function handleLogin(e) {
    e.preventDefault()
    setEstado('loading')
    setError('')
    try {
      const result = await login(email, password)
      if (result?.newPasswordRequired) {
        setUserTemp(result.user)
        setEstado('newPassword')
      } else {
        onLogin()
      }
    } catch (err) {
      setError(err.message || 'Credenciales incorrectas')
      setEstado('error')
    }
  }

  async function handleNuevoPassword(e) {
    e.preventDefault()
    setEstado('loading')
    try {
      await cambiarPasswordInicial(userTemp, newPass)
      onLogin()
    } catch (err) {
      setError(err.message)
      setEstado('error')
    }
  }

  return (
    <div style={styles.fondo}>
      <div style={styles.tarjeta} className="fade-in">

        {/* Logo / Header */}
        <div style={styles.header}>
          <div style={styles.logo}>SRI</div>
          <h1 style={styles.titulo}>Facturación Electrónica</h1>
          <p style={styles.subtitulo}>Sistema de emisión de comprobantes</p>
        </div>

        {/* Formulario login */}
        {estado !== 'newPassword' && (
          <form onSubmit={handleLogin} style={styles.form}>
            <div style={styles.campo}>
              <label style={styles.label}>Correo electrónico</label>
              <input
                type        = "email"
                value       = {email}
                onChange    = {e => setEmail(e.target.value)}
                placeholder = "usuario@empresa.com"
                required
                style       = {styles.input}
              />
            </div>
            <div style={styles.campo}>
              <label style={styles.label}>Contraseña</label>
              <input
                type        = "password"
                value       = {password}
                onChange    = {e => setPassword(e.target.value)}
                placeholder = "••••••••"
                required
                style       = {styles.input}
              />
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <button
              type    = "submit"
              style   = {styles.boton}
              disabled= {estado === 'loading'}
            >
              {estado === 'loading' ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        )}

        {/* Formulario cambio de password inicial */}
        {estado === 'newPassword' && (
          <form onSubmit={handleNuevoPassword} style={styles.form}>
            <p style={styles.aviso}>
              Es tu primer ingreso. Por favor establece una nueva contraseña.
            </p>
            <div style={styles.campo}>
              <label style={styles.label}>Nueva contraseña</label>
              <input
                type        = "password"
                value       = {newPass}
                onChange    = {e => setNewPass(e.target.value)}
                placeholder = "Mínimo 8 caracteres"
                required
                style       = {styles.input}
              />
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" style={styles.boton}>
              Establecer contraseña
            </button>
          </form>
        )}

        <p style={styles.footer}>Ecuador — Ambiente de Certificación</p>
      </div>
    </div>
  )
}

const styles = {
  fondo: {
    minHeight:      '100vh',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    background:     'linear-gradient(135deg, #005C3D 0%, #00875A 60%, #00A36C 100%)',
    padding:        '1rem',
  },
  tarjeta: {
    background:   '#fff',
    borderRadius: '16px',
    padding:      '2.5rem',
    width:        '100%',
    maxWidth:     '420px',
    boxShadow:    '0 20px 60px rgba(0,0,0,0.2)',
  },
  header: {
    textAlign:    'center',
    marginBottom: '2rem',
  },
  logo: {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    width:          '56px',
    height:         '56px',
    background:     '#00875A',
    color:          '#fff',
    borderRadius:   '12px',
    fontFamily:     "'DM Mono', monospace",
    fontWeight:     '500',
    fontSize:       '1.1rem',
    marginBottom:   '1rem',
  },
  titulo: {
    fontSize:     '1.5rem',
    color:        '#0F1923',
    marginBottom: '0.25rem',
  },
  subtitulo: {
    color:    '#64748B',
    fontSize: '0.875rem',
  },
  form: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '1.25rem',
  },
  campo: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '0.375rem',
  },
  label: {
    fontSize:   '0.8rem',
    fontWeight: '600',
    color:      '#2D3748',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  input: {
    padding:      '0.75rem 1rem',
    border:       '1.5px solid #E2E8F0',
    borderRadius: '8px',
    fontSize:     '0.95rem',
    outline:      'none',
    transition:   'border-color 0.2s',
    color:        '#0F1923',
  },
  boton: {
    padding:      '0.875rem',
    background:   '#00875A',
    color:        '#fff',
    border:       'none',
    borderRadius: '8px',
    fontSize:     '1rem',
    fontWeight:   '600',
    marginTop:    '0.5rem',
  },
  error: {
    color:      '#E53E3E',
    fontSize:   '0.875rem',
    background: '#FFF5F5',
    padding:    '0.75rem',
    borderRadius: '8px',
  },
  aviso: {
    color:      '#005C3D',
    fontSize:   '0.875rem',
    background: '#E3F5EE',
    padding:    '0.75rem',
    borderRadius: '8px',
  },
  footer: {
    textAlign:  'center',
    color:      '#64748B',
    fontSize:   '0.75rem',
    marginTop:  '2rem',
  }
}