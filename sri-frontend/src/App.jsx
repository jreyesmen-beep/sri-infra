import { useState, useEffect } from 'react'
import { isAuthenticated, logout } from './services/auth'
import Login     from './components/Login'
import Dashboard from './components/Dashboard'

export default function App() {
  // ✅ Verificar autenticación de forma síncrona en el estado inicial
  // Evita el parpadeo y carga siempre Login primero si no hay sesión
  const [autenticado,  setAutenticado]  = useState(false)
  const [verificando,  setVerificando]  = useState(true)

  useEffect(() => {
    const hayToken = isAuthenticated()

    if (hayToken) {
      // Verificar que el token no esté expirado
      try {
        const token    = localStorage.getItem('sri_token')
        const payload  = JSON.parse(atob(token.split('.')[1]))
        const ahora    = Math.floor(Date.now() / 1000)

        if (payload.exp && payload.exp < ahora) {
          // Token expirado — limpiar y mostrar login
          logout()
          setAutenticado(false)
        } else {
          setAutenticado(true)
        }
      } catch {
        // Token inválido — limpiar
        logout()
        setAutenticado(false)
      }
    } else {
      setAutenticado(false)
    }

    setVerificando(false)
  }, [])

  // Mientras verifica mostrar pantalla en blanco
  if (verificando) {
    return (
      <div style={{
        minHeight:      '100vh',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     'linear-gradient(135deg, #005C3D 0%, #00875A 60%, #00A36C 100%)'
      }}>
        <div style={{
          background:   'rgba(255,255,255,0.1)',
          borderRadius: '12px',
          padding:      '2rem',
          textAlign:    'center',
          color:        '#fff'
        }}>
          <img
            src   = "/logo_tefus.png"
            alt   = "TEFUS"
            style = {{ width: '120px', marginBottom: '1rem' }}
          />
          <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.8 }}>
            Cargando...
          </p>
        </div>
      </div>
    )
  }

  return autenticado
    ? <Dashboard onLogout={() => setAutenticado(false)} />
    : <Login     onLogin={() => setAutenticado(true)}   />
}