import React, { useMemo, useState, useEffect } from 'react'
import GUIDES from '../data/guides'

function buildIndex(guidesMap) {
  const idx = {}
  if (!guidesMap) return idx
  for (const k of Object.keys(guidesMap)) {
    const g = guidesMap[k]
    const asig = g.asignatura || 'Sin asignatura'
    const uni = g.unidad || g.titulo || 'Sin unidad'
    if (!idx[asig]) idx[asig] = {}
    // store the full guide object
    idx[asig][uni] = g
  }
  return idx
}

export default function GuideSelector({ onLoad }) {
  const index = useMemo(() => buildIndex(GUIDES), [])
  const asignaturas = useMemo(() => Object.keys(index), [index])
  const [asignatura, setAsignatura] = useState('')
  const [unidad, setUnidad] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!asignatura) setUnidad('')
  }, [asignatura])

  const unidades = useMemo(() => {
    if (!asignatura) return []
    return Object.keys(index[asignatura] || {})
  }, [index, asignatura])

  function handleLoad() {
    if (!asignatura || !unidad) return
    const guide = index[asignatura] && index[asignatura][unidad]
    if (!guide) return
    if (typeof onLoad === 'function') onLoad(guide)
    setOpen(false)
  }

  return (
    <>
      <div className="mb-2">
        <button type="button" className="px-3 py-2 bg-sky-700 text-white rounded" onClick={() => setOpen(true)}>Seleccionar guía ▸</button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-full bg-black/40" onClick={() => setOpen(false)} />
          <aside className="w-80 bg-white p-4 shadow-xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Seleccionar guía</h3>
              <button className="px-2 py-1" onClick={() => setOpen(false)}>Cerrar</button>
            </div>
            <div className="space-y-3">
              <div>
                <label htmlFor="gs-asignatura" className="block text-sm font-medium">Asignatura</label>
                <select id="gs-asignatura" className="mt-1 block w-full border rounded p-2" value={asignatura} onChange={(e) => setAsignatura(e.target.value)}>
                  <option value="">-- Seleccionar asignatura --</option>
                  {asignaturas.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="gs-unidad" className="block text-sm font-medium">Unidad</label>
                <select id="gs-unidad" className="mt-1 block w-full border rounded p-2" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
                  <option value="">-- Seleccionar unidad --</option>
                  {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="px-3 py-1 border rounded" onClick={() => setOpen(false)}>Cancelar</button>
                <button type="button" className="px-3 py-1 bg-sky-700 text-white rounded" onClick={handleLoad}>Cargar guía</button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
