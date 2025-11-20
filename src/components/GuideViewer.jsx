import React, { useState, useEffect } from 'react'
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
          <div className="text-sm sm:text-base text-gray-600"><span className="font-semibold text-sky-700">{p.label}:</span> <span className="text-slate-800 text-sm sm:text-base">{p.value}</span></div>
        </div>
      ))}
      {parsedFiltered.map((p, i) => (
        <div key={'d-' + i} className="bg-white border rounded-md p-3 shadow-sm text-left">
          {p.label ? (
            <div className="text-sm sm:text-base text-gray-600"><span className="font-semibold text-sky-700">{p.label}:</span> <span className="text-slate-800 text-sm sm:text-base">{p.value}</span></div>
          ) : (
            <div className="text-slate-800 text-sm sm:text-base">{p.value}</div>
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

  // Mobile-only paginator state must be declared unconditionally (before early returns)
  const [page, setPage] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const sectionLabels = ['DATOS', 'DESARROLLO', 'ACTIVIDADES', 'RÚBRICA', 'AUTOEVALUACIÓN', 'BIBLIOGRAFÍA']
  const lastPage = sectionLabels.length - 1
  function prevPage() { setPage(p => Math.max(0, p - 1)) }
  function nextPage() { setPage(p => Math.min(lastPage, p + 1)) }

  // Detect small screens (match Tailwind's `sm` breakpoint at 640px)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const handle = (e) => setIsMobile(e.matches)
    // set initial
    setIsMobile(mq.matches)
    // listen for changes
    if (mq.addEventListener) mq.addEventListener('change', handle)
    else mq.addListener(handle)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handle)
      else mq.removeListener(handle)
    }
  }, [])

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

  // Choose image source: on mobile always use local `caratula`, on desktop prefer guide.imageUrl
  const imageSrc = isMobile ? caratula : (guide?.imageUrl || caratula)

  

  // Build a viewer title: prefer `guide.guideNumber` (persisted field), then 'Número de guía' from guide.datos, then guide.id or route id
  const numeroDesdeDatos = parseNumeroGuia(guide?.datos)
  const guideNumber = guide?.guideNumber || numeroDesdeDatos || guide?.id || id
  const asignaturaName = guide?.asignatura || guide?.titulo

  function handlePrintGuide() {
    (async () => {
      try {
        const container = document.getElementById('guide-print-container')
        // if no container, fallback to direct print
        if (!container) {
          try { globalThis.print() } catch (e) { console.warn('print not available', e) }
          return
        }

        // add class to enable print styles if any
        container.classList.add('printable')

        // wait for images inside the container to decode (important on mobile where images may be lazy)
        const imgs = Array.from(container.querySelectorAll('img'))
        await Promise.all(imgs.map(img => {
          // If image complete and naturalWidth>0, consider decoded
          if (img.complete && img.naturalWidth !== 0) return Promise.resolve()
          // use decode() when available
          if (img.decode) return img.decode().catch(() => Promise.resolve())
          // otherwise wait for load/error
          return new Promise(res => { img.addEventListener('load', res); img.addEventListener('error', res) })
        }))

        // give browser a moment to reflow with the images
        await new Promise(r => setTimeout(r, 350))

        try {
          globalThis.print()
          // allow enough time for print to capture content
          setTimeout(() => container.classList.remove('printable'), 400)
        } catch (err) {
          console.warn('print() failed, trying fallback window print', err)
          // fallback: open a new window with the content and trigger print there
          try {
            const w = window.open('', '_blank')
            if (w) {
              // clone the container to preserve markup
              const clone = container.cloneNode(true)
              // basic minimal document
              w.document.open()
              w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Guía</title>')
              // attempt to copy current page stylesheets
              Array.from(document.querySelectorAll('link[rel=stylesheet], style')).forEach(node => {
                w.document.write(node.outerHTML)
              })
              w.document.write('</head><body>')
              w.document.write(clone.outerHTML)
              w.document.write('</body></html>')
              w.document.close()
              // wait a bit then trigger print
              setTimeout(() => { try { w.print(); w.close() } catch (e) { console.warn('fallback print failed', e) } }, 700)
            }
          } catch (e2) {
            console.warn('fallback window print failed', e2)
          } finally {
            container.classList.remove('printable')
          }
        }
      } catch (err) {
        console.warn('print failed', err)
        try { globalThis.print() } catch (e) { console.warn('final print failed', e) }
      }
    })()
  }

  return (
    <div className="max-w-3xl mx-auto p-1 sm:p-4" id="guide-print-container">

      {/* Modern cover card */}
      <div className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 rounded-xl overflow-hidden shadow-2xl ring-1 ring-slate-100">
          <div className="sm:col-span-1 bg-slate-900 flex items-center justify-center overflow-hidden">
            <img src={imageSrc} alt={guide.titulo || 'Carátula'} className="w-full h-auto sm:h-64 object-contain" />
          </div>
          <div className="sm:col-span-2 p-4 sm:p-6 flex flex-col justify-center bg-gradient-to-r from-cyan-400 via-cyan-300 to-transparent">
            <div className="mt-2 text-lg sm:text-4xl font-extrabold text-slate-900">Guía didáctica para el aprendizaje del estudiante</div>
            <div className='mt-2 text-lg sm:text-3xl font-extrabold text-indigo-500'>Nro. {guideNumber}</div>
            <div className="mt-1 text-sm sm:text-base text-slate-800"><span className='text-gray-500'>Asignatura: </span>{asignaturaName}</div>
            <div className="mt-1 text-xs sm:mt-2 text-gray-500">Elaborado por: <span className="font-semibold text-slate-800">Ing. Mario Ibarra</span></div>
          </div>
          
        </div>
          {/* Mobile paginator: floating, centered and compact */}
          <div className="sm:hidden fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
            <div className="bg-white/95 backdrop-blur-sm rounded-full shadow-lg px-2 py-1 flex items-center gap-3">
              <button
                type="button"
                onClick={prevPage}
                disabled={page === 0}
                aria-label="Anterior"
                className={page === 0 ? 'w-8 h-8 flex items-center justify-center rounded-full bg-white border text-gray-400 disabled:cursor-not-allowed' : 'w-8 h-8 flex items-center justify-center rounded-full bg-sky-700 text-white shadow-md hover:bg-sky-800'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M15.78 5.22a.75.75 0 0 0-1.06 0L8.47 11.47a.75.75 0 0 0 0 1.06l6.25 6.25a.75.75 0 0 0 1.06-1.06L9.06 12l6.72-6.72a.75.75 0 0 0 0-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              <div className="flex flex-col items-center px-2">
                <div className="bg-slate-100 px-2 py-0.5 rounded-full text-xs font-semibold">{sectionLabels[page]}</div>
                <div className="text-xxs text-gray-500 mt-0.5">{page + 1} / {sectionLabels.length}</div>
              </div>

              <button
                type="button"
                onClick={nextPage}
                disabled={page === lastPage}
                aria-label="Siguiente"
                className={page === lastPage ? 'w-8 h-8 flex items-center justify-center rounded-full bg-white border text-gray-400 disabled:cursor-not-allowed' : 'w-8 h-8 flex items-center justify-center rounded-full bg-sky-700 text-white shadow-md hover:bg-sky-800'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M8.22 18.78a.75.75 0 0 0 1.06 0L15.53 12.53a.75.75 0 0 0 0-1.06L9.28 5.22a.75.75 0 1 0-1.06 1.06L14.94 12l-6.78 6.72a.75.75 0 0 0 0 1.06z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
      </div>

  <section className={`${page === 0 ? 'block' : 'hidden'} sm:block rounded-lg border p-1 sm:p-4 bg-gradient-to-br from-white to-slate-50 shadow-sm mb-2 sm:mb-4`}>
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-semibold text-base sm:text-3xl text-left text-sky-700">DATOS</h3>
            
          </div>
  </div>
        <div className="mt-3">{renderDatosViewer(guide.datos, guide)}</div>
      </section>

  <section className={`${page === 1 ? 'block' : 'hidden'} sm:block rounded-lg border p-1 sm:p-4 bg-gradient-to-br from-white to-violet-50 shadow-sm mb-2 sm:mb-4`}>
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-semibold text-base sm:text-3xl text-left text-violet-700">DESARROLLO</h3>
            
          </div>
          </div>
          <div className="mt-3 bg-slate-50 border rounded-md p-1 sm:p-4 text-sm sm:text-base text-gray-800 whitespace-pre-wrap text-left">{guide.desarrollo}</div>
      </section>

  <section className={`${page === 2 ? 'block' : 'hidden'} sm:block border rounded p-1 sm:p-4 bg-gradient-to-br from-white to-emerald-50 mb-2 sm:mb-4`}>
        <div className="flex justify-between items-start">
            <h3 className="font-semibold text-base sm:text-3xl text-left text-slate-800 border-b pb-1">ACTIVIDADES</h3>
        </div>
  <div className="mt-3 text-xs sm:text-base text-gray-800 text-left">
          {actividades.length === 0 ? (<div className="text-gray-600">No hay actividades.</div>) : (
            <div className="space-y-4">
              {actividades.map((a, idx) => (
                <div key={'act-' + idx} className="p-2 sm:p-4 border rounded-lg bg-white shadow-sm">
                  <div>
                    <h4 className="font-semibold text-base sm:text-xl text-sky-700">Actividad {idx + 1}</h4>
                    <div className="mt-2 text-gray-700 text-sm sm:text-base">{a.descripcion || a.titulo || a.tema || ''}</div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {a.formato && (<div><span className="font-semibold text-violet-700 text-sm sm:text-base">Formato: </span><span className="text-slate-800 text-sm sm:text-base">{a.formato}</span></div>)}
                      {a.fecha && (<div><span className="font-semibold text-red-600 text-sm sm:text-base">Fecha: </span><span className="text-slate-800 text-sm sm:text-base">{a.fecha}</span></div>)}
                      {a.fuente && (() => {
                        const url = extractUrl(a.fuente)
                        const display = url ? a.fuente.replace(url, '').trim() : a.fuente
                        return (
                          <div className="sm:col-span-2">
                            <span className="font-semibold text-amber-700 text-sm sm:text-base">Fuente: </span>
                            <div className="text-slate-800 text-sm sm:text-base">
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

  <section className={`${page === 3 ? 'block' : 'hidden'} sm:block border rounded p-1 sm:p-4 bg-gradient-to-br from-white to-rose-50 mb-2 sm:mb-4`}>
        <div className="flex justify-between items-start">
          <h3 className="font-semibold text-base sm:text-3xl text-left text-slate-800 border-b pb-1">RÚBRICA</h3>
  </div>
        <div className="mt-3 text-gray-800 text-left">
          {rubrica.length === 0 ? (
            <div className="text-gray-600">No hay rúbrica.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="text-left px-2 sm:px-4 py-1 sm:py-2 border text-sm sm:text-base">Criterio</th>
                    <th className="text-left px-2 sm:px-4 py-1 sm:py-2 border text-sm sm:text-base">Muy bien<br/><span className="text-xs sm:text-sm text-gray-500">2.5 pts</span></th>
                    <th className="text-left px-2 sm:px-4 py-1 sm:py-2 border text-sm sm:text-base">Bien<br/><span className="text-xs sm:text-sm text-gray-500">1.75 pts</span></th>
                    <th className="text-left px-2 sm:px-4 py-1 sm:py-2 border text-sm sm:text-base">En progreso<br/><span className="text-xs sm:text-sm text-gray-500">1 pt</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rubrica.map((r, i) => (
                    <tr key={'rub-' + i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-2 sm:px-4 py-2 align-top border font-semibold text-slate-800 text-sm sm:text-base">{r.criterion}</td>
                        <td className="px-2 sm:px-4 py-2 align-top border text-gray-700 whitespace-pre-wrap text-sm sm:text-base">{r.muyBien}</td>
                        <td className="px-2 sm:px-4 py-2 align-top border text-gray-700 whitespace-pre-wrap text-sm sm:text-base">{r.bien}</td>
                        <td className="px-2 sm:px-4 py-2 align-top border text-gray-700 whitespace-pre-wrap text-sm sm:text-base">{r.enProgreso}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

  <section className={`${page === 4 ? 'block' : 'hidden'} sm:block border rounded p-1 sm:p-4 bg-gradient-to-br from-white to-amber-50 mb-2 sm:mb-4`}>
        <div className="flex justify-between items-start">
          <h3 className="font-semibold text-base sm:text-3xl text-left text-slate-800 border-b pb-1">AUTOEVALUACIÓN</h3>
  </div>
        <div className="mt-3 text-gray-800 text-left">
          {auto.length === 0 ? (<div className="text-gray-600">No hay preguntas.</div>) : (
            <div className="space-y-4">
              {auto.map((q, idx) => (
                <div key={'aq-' + idx} className="p-3 border rounded bg-white">
                  <div className="font-semibold text-slate-800 text-base sm:text-lg">{idx + 1}. {q.question}</div>
                    <ul className="mt-2 space-y-1">
                    {q.options.map(o => (
                      <li key={o.label} className="p-2 rounded">
                        <span className="font-semibold mr-2 text-sm sm:text-sm">{o.label})</span>
                        <span className="text-slate-800 text-sm sm:text-base">{o.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

  <section className={`${page === 5 ? 'block' : 'hidden'} sm:block rounded-lg border p-2 sm:p-4 bg-gradient-to-br from-white to-amber-50 shadow-sm mb-2 sm:mb-4`}>
          <div className="flex justify-between items-start">
          <div>
            <h3 className="font-semibold text-base sm:text-3xl text-left text-amber-700">BIBLIOGRAFÍA</h3>
            
          </div>
  </div>
  <div className="mt-4 bg-white border rounded-md p-2 sm:p-4 text-gray-800 text-left">
          {guide.bibliografia ? (
            <ol className="list-decimal pl-5 space-y-2">
              {Array.isArray(guide.bibliografia) ? (
                guide.bibliografia.map((item, i) => {
                  const text = item?.text || ''
                  const href = item?.link || (text ? makeSearchUrlForRef(text) : '')
                  return (
                    <li key={'bib-' + i}>
                      <a href={href || '#'} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline text-sm sm:text-base">{text || href}</a>
                    </li>
                  )
                })
              ) : (
                guide.bibliografia.split(/\r?\n/).map((ln, i) => {
                  const display = ln.replace(/https?:\/\/[^\s]+/i, '').trim()
                  const href = makeSearchUrlForRef(display)
                  return (<li key={'bib-' + i}><a href={href} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline text-sm sm:text-base">{display || href}</a></li>)
                })
              )}
            </ol>
          ) : (<div className="text-gray-600">No hay bibliografía.</div>)}
        </div>
      </section>

      <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <Link to="/" className="hidden sm:inline-flex items-center justify-center px-4 py-2 bg-white border rounded shadow text-sky-700 hover:bg-slate-50 transition-colors">Volver</Link>
        <button
          onClick={handlePrintGuide}
          aria-label="Descargar guía en PDF"
          className="hidden sm:inline-flex items-center justify-center px-4 py-2 bg-sky-700 text-white rounded shadow hover:bg-sky-800 transition-colors duration-150 ml-auto sm:ml-0"
        >
          Descargar PDF
        </button>
      </div>

      {/* Mobile-only download button (top-right) */}
      {/* <button
        onClick={handlePrintGuide}
        aria-label="Descargar guía en PDF (móvil)"
        className="sm:hidden fixed top-4 right-4 z-50 w-10 h-10 rounded-full bg-sky-700 text-white flex items-center justify-center shadow-lg"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M12 3v10.5l3.5-3.5 1.06 1.06L12 17.62l-4.56-4.56L8.5 10.5 12 14.03V3h0z" />
          <path d="M5 19a2 2 0 002 2h10a2 2 0 002-2v-1H5v1z" />
        </svg>
      </button> */}
      
      {/* Mobile-only floating back button (top-left) */}
      <Link
        to="/"
        aria-label="Volver"
        className="sm:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-full bg-white text-sky-700 flex items-center justify-center shadow-lg border"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M15.78 19.78a.75.75 0 0 1-1.06 0L8.47 13.53a.75.75 0 0 1 0-1.06l6.25-6.25a.75.75 0 1 1 1.06 1.06L9.06 12l6.72 6.72a.75.75 0 0 1 0 1.06z" clipRule="evenodd" />
        </svg>
      </Link>
      
      {/* Footer removed: attribution now shown in the header for all devices */}
    </div>
  )
}
