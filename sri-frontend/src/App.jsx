import { useState, useEffect } from 'react'
import { isAuthenticated } from './services/auth'
import Login       from './components/Login'
import Dashboard   from './components/Dashboard'

export default function App() {
  const [autenticado, setAutenticado] = useState(false)

  useEffect(() => {
    setAutenticado(isAuthenticated())
  }, [])

  return autenticado
    ? <Dashboard onLogout={() => setAutenticado(false)} />
    : <Login     onLogin={() => setAutenticado(true)}   />
}