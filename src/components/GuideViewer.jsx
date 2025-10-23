import React from 'react'
import { useParams, Link } from 'react-router-dom'
import guides from '../data/guides'
import caratula from '../assets/caratula.png'

// Helpers locales para parsear actividades, rúbrica y autoevaluación
function parseActividades(text) {
  if (!text) return []
  return text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(block => {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const obj = {}
    for (const ln of lines) {
      const m = ln.match(/^(Título|Titulo|Tema|Descripción|Descripcion|Formato de entrega|Formato|Fecha de entrega|Fecha|Fuente bibliográfica|Fuente)\s*:\s*(.+)$/i)
      if (m) {
        // normalize label (remove diacritics) and map to canonical keys
        const rawLabel = m[1].toLowerCase()
        const label = rawLabel.normalize('NFD').replaceAll(/\p{Diacritic}/gu, '')
        let key = 'extra'
        if (label.startsWith('titu')) key = 'titulo'
        else if (label.startsWith('tema')) key = 'tema'
        else if (label.startsWith('descripcion')) key = 'descripcion'
        else if (label.startsWith('formato')) key = 'formato'
        else if (label.startsWith('fecha')) key = 'fecha'
        else if (label.startsWith('fuente')) key = 'fuente'
        obj[key] = m[2]
      } else {
        obj.descripcion = obj.descripcion ? obj.descripcion + ' ' + ln : ln
      }
    }
    return obj
  })
}

function parseRubricaTable(text) {
  if (!text) return []
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const tableLines = lines.filter(l => l.includes('|'))
  const rows = []
  for (const l of tableLines) {
    const parts = l.split('|').map(p => p.trim()).filter(p => p !== '')
    if (parts.length >= 4) rows.push({ criterion: parts[0], muyBien: parts[1], bien: parts[2], enProgreso: parts[3] })
  }
  if (rows.length >= 1) return rows.slice(0,4)

  // Fallback: soportar formato en bloques donde cada criterio tiene líneas etiquetadas
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (!lines.length) continue
    const title = lines[0]
    let muy = ''
    let bien = ''
    let enp = ''
    for (const ln of lines.slice(1)) {
      const m = ln.match(/^(Muy bien|Muybien|Bien|En progreso|Enprogreso)\s*[:\-–]?\s*(.+)$/i)
      if (m) {
        const label = m[1].toLowerCase().replace(/\s+/g, '')
        const val = m[2].trim()
        if (label.startsWith('muy')) muy = val
        else if (label.startsWith('bien')) bien = val
        else if (label.startsWith('en')) enp = val
      }
    }
    // si encontramos al menos una descripción, lo consideramos un criterio válido
    if (muy || bien || enp) rows.push({ criterion: title, muyBien: muy, bien: bien, enProgreso: enp })
    if (rows.length >= 4) break
  }
  return rows.slice(0,4)
}

function parseAuto(text) {
  if (!text) return []
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
  const questions = []
  const optRe = /([A-Z])\)\s*([^\n]+)/g
  for (const block of blocks) {
    // split by first line
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  let qtext = lines[0] || ''
  // Remove leading numbering like '1.' or '1)' that may already be present in the model output
  qtext = qtext.replace(/^\s*\d+\s*[.)]\s*/,'')
    const rest = lines.slice(1).join('\n')
    const opts = []
    let m
    while ((m = optRe.exec(rest)) !== null) {
      // Strip any in-line marker like (correcto) but do NOT record which is correct.
      opts.push({ label: m[1], text: m[2].replace(/\(correcto\)/i, '').trim() })
    }
    if (opts.length) questions.push({ question: qtext, options: opts })
  }
  return questions
}

function extractUrl(line) {
  const m = line && line.match(/(https?:\/\/[^\s]+)/i)
  return m ? m[1] : null
}

function makeSearchUrlForRef(ref) {
  if (!ref) return 'https://www.google.com'
  const cleaned = ref.replaceAll(/["'()]/g, '')
  const q = encodeURIComponent(cleaned)
  return `https://www.google.com/search?q=${q}`
}

function renderDatosViewer(datosText, guide) {
  const metaEntries = []
  // For the Viewer we intentionally DO NOT show 'Número de guía' ni 'Asignatura' here.
  if (guide?.unidad) metaEntries.push({ label: 'Unidad de estudio', value: guide.unidad })
  if (guide?.temas && Array.isArray(guide.temas) && guide.temas.length) metaEntries.push({ label: 'Temas', value: guide.temas.join('; ') })

  const lines = (datosText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const parsed = lines.map((ln) => {
    const m = ln.match(/^([^:]+)\s*:\s*(.+)$/)
    if (m) return { label: m[1].trim(), value: m[2].trim() }
    return { label: null, value: ln }
  })
  const metaLabels = new Set(metaEntries.map(e => e.label.toLowerCase()))
  // Exclude explicit labels that should not be displayed in the DATOS box for the Viewer
  const excludeLabels = new Set(['número de guía', 'numero de guia', 'asignatura'])
  const parsedFiltered = parsed.filter(p => {
    if (!p.label) return true
    const lbl = p.label.toLowerCase()
    if (metaLabels.has(lbl)) return false
    if (excludeLabels.has(lbl)) return false
    return true
  })

  if (metaEntries.length === 0 && parsedFiltered.length === 0) return <div className="text-gray-500">Aún no hay información de datos.</div>

  return (
    <div className="space-y-2 text-left">
      {metaEntries.map((p, i) => (
        <div key={'meta-' + i} className="bg-white border rounded-md p-3 shadow-sm text-left">
          <div className="text-sm text-gray-600"><span className="font-semibold text-sky-700">{p.label}:</span> <span className="text-slate-800">{p.value}</span></div>
        </div>
      ))}
      {parsedFiltered.map((p, i) => (
        <div key={'d-' + i} className="bg-white border rounded-md p-3 shadow-sm text-left">
          {p.label ? (
            <div className="text-sm text-gray-600"><span className="font-semibold text-sky-700">{p.label}:</span> <span className="text-slate-800">{p.value}</span></div>
          ) : (
            <div className="text-slate-800">{p.value}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// Extrae 'Número de guía' desde el bloque `datos` si existe.
function parseNumeroGuia(datosText) {
  if (!datosText) return null
  // Buscar líneas como 'Número de guía: 2' o 'Numero de Guia: 2' (variantes)
  const lines = datosText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  for (const ln of lines) {
    const m = ln.match(/^\s*(?:Número|Numero)\s*(?:de\s*)?(?:gu[ií]a|Guia)\s*[:\-–]?\s*(.+)$/i)
    if (m) {
      return m[1].trim()
    }
    // También soportar 'Número de guia: 2' en forma 'Numero de guia: 2'
    const m2 = ln.match(/^\s*(?:numero|nro|número)\s*(?:de\s*)?(?:guia|guía)\s*[:\-–]?\s*(.+)$/i)
    if (m2) return m2[1].trim()
  }
  return null
}

export default function GuideViewer() {
  const { id } = useParams()
  const guide = Array.isArray(guides) ? guides.find(g => g.id === id) : guides[id]
  console.log('GuideViewer: loaded guide for id=', id, guide)

  if (!guide) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <h2 className="text-xl font-semibold">Guía no encontrada</h2>
        <p className="mt-2">No se encontró una guía con id <span className="font-mono">{id}</span>.</p>
        <p className="mt-4"><Link to="/" className="text-sky-700 underline">Volver</Link></p>
      </div>
    )
  }

  const actividades = parseActividades(guide.actividades)
  const rubrica = parseRubricaTable(guide.rubrica)
  const auto = parseAuto(guide.autoevaluacion)

  // Build a viewer title: prefer `guide.guideNumber` (persisted field), then 'Número de guía' from guide.datos, then guide.id or route id
  const numeroDesdeDatos = parseNumeroGuia(guide?.datos)
  const guideNumber = guide?.guideNumber || numeroDesdeDatos || guide?.id || id
  const asignaturaName = guide?.asignatura || guide?.titulo
  const viewerTitle = (guideNumber && asignaturaName) ? `Guía de Estudio Nro. ${guideNumber} de ${asignaturaName}` : (guide?.titulo || 'Guía de Estudio')

  function handlePrintGuide() {
    try {
      // marcar el contenedor como imprimible
      const container = document.getElementById('guide-print-container')
      if (!container) {
        window.print()
        return
      }
      container.classList.add('printable')
      // small timeout to ensure styles apply
      setTimeout(() => {
        window.print()
        // cleanup
        container.classList.remove('printable')
      }, 100)
    } catch (err) {
      console.warn('print failed', err)
      window.print()
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4" id="guide-print-container">

      {/* Modern cover card */}
      <div className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 rounded-xl overflow-hidden shadow-2xl ring-1 ring-slate-100">
          <div className="sm:col-span-2 p-6 flex flex-col justify-center bg-gradient-to-r from-cyan-400 via-cyan-300 to-transparent">
            <div className="text-amber-800 text-sm uppercase tracking-wide">Guía</div>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900">{viewerTitle}</div>
            <div className="mt-3 text-sm text-slate-800">{asignaturaName || ''}</div>
          </div>
          <div className="sm:col-span-1 bg-slate-900 flex items-center justify-center">
            <img src={guide.imageUrl || caratula} alt={guide.titulo || 'Carátula'} className="w-full h-48 sm:h-64 object-contain" />
          </div>
        </div>
      </div>

  <section className="rounded-lg border p-4 bg-gradient-to-br from-white to-slate-50 shadow-sm mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-semibold text-lg text-left text-sky-700">DATOS</h3>
            <p className="text-sm text-gray-500 mt-1">Información general y metadatos</p>
          </div>
        </div>
        <div className="mt-4">{renderDatosViewer(guide.datos, guide)}</div>
      </section>

  <section className="rounded-lg border p-4 bg-gradient-to-br from-white to-violet-50 shadow-sm mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-semibold text-lg text-left text-violet-700">DESARROLLO</h3>
            <p className="text-sm text-gray-500 mt-1">Estructura del desarrollo de la unidad</p>
          </div>
        </div>
        <div className="mt-4 bg-slate-50 border rounded-md p-4 text-gray-800 whitespace-pre-wrap text-left">{guide.desarrollo}</div>
      </section>

  <section className="border rounded p-4 bg-gradient-to-br from-white to-emerald-50 mb-4">
        <div className="flex justify-between items-start">
          <h3 className="font-semibold text-lg text-left text-slate-800 border-b pb-1">ACTIVIDADES</h3>
        </div>
        <div className="mt-3 text-gray-800 text-left">
          {actividades.length === 0 ? (<div className="text-gray-600">No hay actividades.</div>) : (
            <div className="space-y-4">
              {actividades.map((a, idx) => (
                <div key={'act-' + idx} className="p-4 border rounded-lg bg-white shadow-sm">
                  <div>
                    <h4 className="font-semibold text-lg text-sky-700">Actividad {idx + 1}</h4>
                    <div className="mt-2 text-gray-700">{a.descripcion || a.titulo || a.tema || ''}</div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {a.formato && (<div><span className="font-semibold text-violet-700">Formato: </span><span className="text-slate-800">{a.formato}</span></div>)}
                      {a.fecha && (<div><span className="font-semibold text-red-600">Fecha: </span><span className="text-slate-800">{a.fecha}</span></div>)}
                      {a.fuente && (() => {
                        const url = extractUrl(a.fuente)
                        const display = url ? a.fuente.replace(url, '').trim() : a.fuente
                        return (
                          <div className="sm:col-span-2">
                            <span className="font-semibold text-amber-700">Fuente: </span>
                            <div className="text-slate-800">
                              <div>{display}</div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

  <section className="border rounded p-4 bg-gradient-to-br from-white to-rose-50 mb-4">
        <div className="flex justify-between items-start">
          <h3 className="font-semibold text-lg text-left text-slate-800 border-b pb-1">RÚBRICA</h3>
        </div>
        <div className="mt-3 text-gray-800 text-left">
          {rubrica.length === 0 ? (
            <div className="text-gray-600">No hay rúbrica.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="text-left px-4 py-2 border">Criterio</th>
                    <th className="text-left px-4 py-2 border">Muy bien<br/><span className="text-sm text-gray-500">2.5 pts</span></th>
                    <th className="text-left px-4 py-2 border">Bien<br/><span className="text-sm text-gray-500">1.75 pts</span></th>
                    <th className="text-left px-4 py-2 border">En progreso<br/><span className="text-sm text-gray-500">1 pt</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rubrica.map((r, i) => (
                    <tr key={'rub-' + i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-4 py-3 align-top border font-semibold text-slate-800">{r.criterion}</td>
                      <td className="px-4 py-3 align-top border text-gray-700 whitespace-pre-wrap">{r.muyBien}</td>
                      <td className="px-4 py-3 align-top border text-gray-700 whitespace-pre-wrap">{r.bien}</td>
                      <td className="px-4 py-3 align-top border text-gray-700 whitespace-pre-wrap">{r.enProgreso}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

  <section className="border rounded p-4 bg-gradient-to-br from-white to-amber-50 mb-4">
        <div className="flex justify-between items-start">
          <h3 className="font-semibold text-lg text-left text-slate-800 border-b pb-1">AUTOEVALUACIÓN</h3>
        </div>
        <div className="mt-3 text-gray-800 text-left">
          {auto.length === 0 ? (<div className="text-gray-600">No hay preguntas.</div>) : (
            <div className="space-y-4">
              {auto.map((q, idx) => (
                <div key={'aq-' + idx} className="p-3 border rounded bg-white">
                  <div className="font-semibold text-slate-800">{idx + 1}. {q.question}</div>
                    <ul className="mt-2 space-y-1">
                    {q.options.map(o => (
                      <li key={o.label} className="p-2 rounded">
                        <span className="font-semibold mr-2">{o.label})</span>
                        <span className="text-slate-800">{o.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border p-4 bg-gradient-to-br from-white to-amber-50 shadow-sm mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-semibold text-lg text-left text-amber-700">BIBLIOGRAFÍA</h3>
            <p className="text-sm text-gray-500 mt-1">Fuentes y referencias</p>
          </div>
        </div>
        <div className="mt-4 bg-white border rounded-md p-4 text-gray-800 text-left">
          {guide.bibliografia ? (
            <ol className="list-decimal pl-5 space-y-2">
              {Array.isArray(guide.bibliografia) ? (
                guide.bibliografia.map((item, i) => {
                  const text = item?.text || ''
                  const href = item?.link || (text ? makeSearchUrlForRef(text) : '')
                  return (
                    <li key={'bib-' + i}>
                      <a href={href || '#'} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">{text || href}</a>
                    </li>
                  )
                })
              ) : (
                guide.bibliografia.split(/\r?\n/).map((ln, i) => {
                  const display = ln.replace(/https?:\/\/[^\s]+/i, '').trim()
                  const href = makeSearchUrlForRef(display)
                  return (<li key={'bib-' + i}><a href={href} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">{display || href}</a></li>)
                })
              )}
            </ol>
          ) : (<div className="text-gray-600">No hay bibliografía.</div>)}
        </div>
      </section>

      <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <Link to="/" className="inline-flex items-center justify-center px-4 py-2 bg-white border rounded shadow text-sky-700 hover:bg-slate-50 transition-colors">Volver</Link>
        <button
          onClick={handlePrintGuide}
          aria-label="Descargar guía en PDF"
          className="inline-flex items-center justify-center px-4 py-2 bg-sky-700 text-white rounded shadow hover:bg-sky-800 transition-colors duration-150 ml-auto sm:ml-0"
        >
          Descargar PDF
        </button>
      </div>
    </div>
  )
}
