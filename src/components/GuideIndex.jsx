import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function GuideIndex() {
  const [id, setId] = useState('')
  const navigate = useNavigate()

  function handleSubmit(e) {
    e.preventDefault()
    const clean = id.trim()
    if (!clean) return
    // navigate to /{id}
    navigate(`/${encodeURIComponent(clean)}`)
  }

  return (
    <div className="max-w-md sm:max-w-2xl mx-auto bg-white p-4 sm:p-6 rounded shadow">
  <h2 className="text-2xl sm:text-3xl font-semibold mb-3">Acceder a una guía por ID</h2>
  <p className="mb-4 text-base text-gray-600">Introduce el identificador de la guía y pulsa "Ir" para ver la guía.</p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          aria-label="ID de la guía"
          value={id}
          onChange={e => setId(e.target.value)}
          className="flex-1 border rounded px-3 py-2 w-full"
          placeholder="Ingresa ID de guía (ej. 1761271270866)"
        />
        <button className="bg-sky-600 text-white px-4 py-2 rounded w-full sm:w-auto" type="submit">Ir</button>
      </form>

      <hr className="my-6" />
      {/* <div className="text-sm text-gray-700">
        <p>Puedes también crear una nueva guía y descargarla desde el generador:</p>
        <p className="mt-2"><a className="text-sky-700 hover:underline" href="/generador">Ir al Generador</a></p>
      </div> */}
    </div>
  )
}
