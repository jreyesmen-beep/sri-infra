// src/hooks/useRIDE.js
import { useState } from 'react'
import { getToken } from '../services/auth'

const API_URL = import.meta.env.VITE_API_URL

export function useRIDE() {
  const [descargando,   setDescargando]   = useState(false)
  const [error,         setError]         = useState('')

  async function _obtenerPDF(claveAcceso) {
    if (!claveAcceso) {
      throw new Error('No hay clave de acceso disponible. Espera a que el SRI autorice.')
    }

    const res = await fetch(
      `${API_URL}/facturas/${claveAcceso}/ride`,
      { headers: { "Authorization": `Bearer ${getToken()}` } }
    )

    const texto = await res.text()

    if (!res.ok) {
      try {
        const data = JSON.parse(texto)
        throw new Error(data.mensaje || `Error ${res.status}`)
      } catch {
        throw new Error(`Error ${res.status}`)
      }
    }

    const data      = JSON.parse(texto)
    const pdfBase64 = data.pdf_base64
    if (!pdfBase64) throw new Error("No se recibió el PDF del servidor")

    // Convertir base64 a bytes
    const bytes = atob(pdfBase64)
    const arr   = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)

    return new Blob([arr], { type: "application/pdf" })
  }

  async function descargar(claveAcceso) {
    setDescargando(true)
    setError('')
    try {
      const blob = await _obtenerPDF(claveAcceso)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `factura-${claveAcceso}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError('Error al descargar: ' + err.message)
    } finally {
      setDescargando(false)
    }
  }

  async function imprimir(claveAcceso) {
    setDescargando(true)
    setError('')
    try {
      const blob = await _obtenerPDF(claveAcceso)
      const url  = URL.createObjectURL(blob)

      // ✅ Crear iframe oculto para imprimir sin abrir ventana nueva
      // Evita el problema de ventanas emergentes bloqueadas
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = url
      document.body.appendChild(iframe)

      iframe.onload = () => {
        try {
          iframe.contentWindow.focus()
          iframe.contentWindow.print()
        } catch {
          // Fallback: abrir en ventana nueva si el iframe falla
          const ventana = window.open(url)
          if (ventana) {
            ventana.onload = () => {
              ventana.focus()
              ventana.print()
            }
          }
        }

        // Limpiar después de imprimir
        setTimeout(() => {
          document.body.removeChild(iframe)
          URL.revokeObjectURL(url)
        }, 5000)
      }

    } catch (err) {
      setError('Error al imprimir: ' + err.message)
    } finally {
      setDescargando(false)
    }
  }

  function limpiarError() {
    setError('')
  }

  return {
    descargando,
    error,
    descargar,
    imprimir,
    limpiarError,
  }
}