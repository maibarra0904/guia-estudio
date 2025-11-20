import React from 'react'
import { Link } from 'react-router-dom'
import guides from '../data/guides'
import caratula from '../assets/caratula.png'

export default function GuideList() {
  const items = Array.isArray(guides) ? guides : Object.values(guides || {})

  if (!items || items.length === 0) return (
    <div className="p-6">
      <h2 className="text-xl font-semibold">No hay guías disponibles</h2>
      <p className="text-gray-600 mt-2">Asegúrate de que `src/data/guides.js` exporta las guías.</p>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Listado de guías</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((g) => (
          <div key={g.id} className="border rounded-lg overflow-hidden shadow-sm bg-white">
            <Link to={`/${g.id}`} className="block hover:opacity-90">
              <div className="h-36 w-full bg-slate-100 flex items-center justify-center overflow-hidden">
                <img src={g.imageUrl || caratula} alt={g.titulo} className="object-contain h-full w-full" />
              </div>
              <div className="p-3">
                <div className="text-sm text-gray-500">{g.asignatura}</div>
                <div className="font-semibold text-lg mt-1">{g.titulo}</div>
                <div className="text-xs text-gray-500 mt-2">Guía: {g.guideNumber || g.id}</div>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
