import React, { useEffect, useState, useRef, useMemo } from 'react'
import generateGuide from '../services/groqService'
import normalizeGuide from '../services/normalizeGuide'

const LS_KEY = 'guideForm_v1'

function copyPlain(text) {
  if (!text) return
  try {
    navigator.clipboard.writeText(text)
  } catch (err) {
    console.warn('clipboard write failed', err)
  }
}

function hashCode(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.codePointAt(i)
    h = Math.trunc(h)
  }
  return Math.abs(h)
}

function isHeaderLine(ln) {
  const m = ln.match(/^Criterios?\s*[:-]?\s*(.+)$/i)
  if (!m) return null
  const title = m[1].trim()
  if (/evaluac/i.test(title) || title.length < 3) return null
  return title
}

// parseNivelLn removed (replaced by block-based parse with regex)

function parseRubricaTable(text) {
  const txt = text.trim()
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const tableLines = lines.filter(l => l.includes('|') && !/^\s*\|?\s*-{3,}/.test(l))
  let bodyLines = tableLines
  if (tableLines.length > 0 && /criteri|muy bien|bien|en progreso/i.test(tableLines[0])) {
    bodyLines = tableLines.slice(1)
  }
  const items = []
  for (const l of bodyLines) {
    const parts = l.split('|').map(p => p.trim()).filter((p, i) => !(i === 0 && p === ''))
    if (parts.length === 0) continue
    const criterion = parts[0] || 'Criterio'
    const col1 = parts[1] || ''
    const col2 = parts[2] || ''
    const col3 = parts[3] || ''
    items.push({ criterion, muyBien: col1, bien: col2, enProgreso: col3 })
  }
  const mapped = items.slice(0, 4)
  while (mapped.length < 4) mapped.push({ criterion: `Criterio ${mapped.length + 1}`, muyBien: '-', bien: '-', enProgreso: '-' })
  return mapped
}

function parseRubricaBlocks(text) {
  const txt = text.trim()
  const blocks = txt.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
  const items = []
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    // título: preferir línea que parezca cabecera, si no la primera línea
    const titleLine = lines.find(l => isHeaderLine(l)) || lines[0] || 'Criterio'
    const title = isHeaderLine(titleLine) || titleLine
    // buscar todas las ocurrencias de 'Nivel N: texto' en el bloque
    const niveles = {}
  const nivelRe = /Nivel\s*(\d+)\s*[: -]?\s*(.+)/gi
    let m
    while ((m = nivelRe.exec(block)) !== null) {
      const n = Number(m[1])
      const txtN = m[2].trim()
      niveles[n] = niveles[n] ? niveles[n] + ' ' + txtN : txtN
    }
    // También soportar líneas etiquetadas: 'Muy bien: ...', 'Bien: ...', 'En progreso: ...'
    for (const ln of lines) {
      const mm = ln.match(/^(Muy bien|Muybien|Bien|En progreso|Enprogreso)\s*[:\-–]?\s*(.+)$/i)
      if (mm) {
        const label = mm[1].toLowerCase().replace(/\s+/g, '')
        const val = mm[2].trim()
        if (label.startsWith('muy')) niveles[3] = niveles[3] ? niveles[3] + ' ' + val : val
        else if (label.startsWith('bien')) niveles[2] = niveles[2] ? niveles[2] + ' ' + val : val
        else if (label.startsWith('en')) niveles[1] = niveles[1] ? niveles[1] + ' ' + val : val
      }
    }
    items.push({ criterion: title, niveles })
  }
  const mapped = items.slice(0, 4).map(it => ({
    criterion: it.criterion,
    muyBien: it.niveles[3] || '',
    bien: it.niveles[2] || '',
    enProgreso: it.niveles[1] || ''
  }))
  while (mapped.length < 4) mapped.push({ criterion: `Criterio ${mapped.length + 1}`, muyBien: '-', bien: '-', enProgreso: '-' })
  return mapped
}

function parseRubrica(text) {
  if (!text || !text.trim()) {
    return [
      { criterion: 'Criterio 1', muyBien: '-', bien: '-', enProgreso: '-' },
      { criterion: 'Criterio 2', muyBien: '-', bien: '-', enProgreso: '-' },
      { criterion: 'Criterio 3', muyBien: '-', bien: '-', enProgreso: '-' },
      { criterion: 'Criterio 4', muyBien: '-', bien: '-', enProgreso: '-' },
    ]
  }
  const txt = text.trim()
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const hasTable = lines.some(l => l.includes('|'))
  if (hasTable) return parseRubricaTable(text)
  return parseRubricaBlocks(text)
}

// Parse sencillo y robusto de la sección AUTOEVALUACIÓN: retorna array de {question, options[]}
function splitIntoBlocks(text) {
  return text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
}

function extractNumberedBodies(block) {
  const re = /(\d+)\.\s*([\s\S]*?)(?=(?:\n\s*\d+\.|$))/g
  const found = []
  let m
  while ((m = re.exec(block)) !== null) found.push(m[2].trim())
  return found
}

function parseQuestionFromBody(body) {
  const singleLine = !/\n/.test(body)
  let questionText = ''
  let optionsText = ''
  if (singleLine && /[A-Z]\)/.test(body)) {
    const idx = body.search(/\b[A-Z]\)/)
    questionText = idx > 0 ? body.slice(0, idx).trim() : ''
    optionsText = idx > 0 ? body.slice(idx) : ''
  } else {
    const lines = body.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    questionText = lines[0] || ''
    optionsText = lines.slice(1).join('\n')
  }
  const optRe = /([A-Z])\)\s*([\s\S]*?)(?=(?:\n\s*[A-Z]\)|$))/gim
  const options = []
  let om
  while ((om = optRe.exec(optionsText)) !== null) {
    options.push({ label: om[1].toUpperCase(), text: om[2].trim(), correct: false })
  }
  return { question: questionText, options }
}

function markCorrect(options, textBody) {
  const mark = textBody.match(/\(([A-Z])\)\s*correcto/i)
  if (mark) {
    const lab = mark[1].toUpperCase()
    for (const o of options) if (o.label === lab) o.correct = true
    return
  }
  for (const o of options) if (/\bcorrecto\b/i.test(o.text)) o.correct = true
}

function parseAutoevaluacion(text) {
  if (!text || !text.trim()) return []
  const blocks = splitIntoBlocks(text)
  const questions = []
  for (const block of blocks) {
    const bodies = extractNumberedBodies(block)
    if (bodies.length) {
      for (const b of bodies) {
        const pq = parseQuestionFromBody(b)
        markCorrect(pq.options, b)
        // eliminar opciones residuales que solo contienen la palabra 'correcto' (p. ej. líneas como "C) correcto")
        pq.options = pq.options.filter(o => !/^\s*correcto\s*$/i.test(o.text))
        questions.push(pq)
      }
    } else {
      const pq = parseQuestionFromBody(block)
      markCorrect(pq.options, block)
      pq.options = pq.options.filter(o => !/^\s*correcto\s*$/i.test(o.text))
      questions.push(pq)
    }
  }
  return questions
}
  // nota: makeSearchUrlForRef se define en GuideViewer y no es necesario aquí

// Sanitizar texto de rúbrica: eliminar paréntesis con puntuaciones como '(4 puntos)', '(2.5 pts)', etc.
function sanitizeRubricaText(text) {
  if (!text) return text
  // eliminar cualquier paréntesis que contenga números o las palabras 'pts'/'puntos'
  return text.replaceAll(/\([^)]*(?:\d|pts?|puntos?)[^)]*\)/ig, '')
}

// parseAutoevaluacion moved inside component to access state

// renderAutoevaluacion will be defined inside the component to access state

export default function GuideForm() {
  const [asignatura, setAsignatura] = useState('')
  const [unidad, setUnidad] = useState('')
  const [guideNumber, setGuideNumber] = useState('')
  const [temas, setTemas] = useState(() => [{ id: `tema-0-${Date.now()}`, text: '' }])
  const [semanaInicio, setSemanaInicio] = useState('')
  const [groqKey, setGroqKey] = useState('')
  const [editingKey, setEditingKey] = useState(false)
  const groqKeyRef = useRef(null)

  // Secciones (almacenadas en estados individuales, como pediste)
  const [datosText, setDatosText] = useState('')
  const [desarrolloText, setDesarrolloText] = useState('')
  const [actividadesText, setActividadesText] = useState('')
  const [rubricaText, setRubricaText] = useState('')
  const [autoevaluacionText, setAutoevaluacionText] = useState('')
  const [bibliografiaText, setBibliografiaText] = useState('')
  const [bibliografiaItems, setBibliografiaItems] = useState([]) // [{ text, link }]
  const [imageUrl, setImageUrl] = useState('') // URL de la carátula
  const [editingImage, setEditingImage] = useState(false)
  const [showImageModal, setShowImageModal] = useState(false)
  

  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState(null)
  const [copiedMap, setCopiedMap] = useState({})
  const [lastSaved, setLastSaved] = useState(null)
  const [hydrated, setHydrated] = useState(false)
  // control de modo edición por sección
  const [editingSections, setEditingSections] = useState({
    datos: false,
    desarrollo: false,
    actividades: false,
    rubrica: false,
    autoevaluacion: false,
    bibliografia: false
  })

  function toggleEditing(section) {
    setEditingSections((prev) => {
      const next = { ...prev, [section]: !prev[section] }
      // if turning edit mode off, persist immediately
      if (!next[section]) {
        try {
          saveSnapshot({
            datos: section === 'datos' ? datosText : undefined,
            desarrollo: section === 'desarrollo' ? desarrolloText : undefined,
            actividades: section === 'actividades' ? actividadesText : undefined,
            rubrica: section === 'rubrica' ? rubricaText : undefined,
            autoevaluacion: section === 'autoevaluacion' ? autoevaluacionText : undefined,
            // persistir la estructura enriquecida si existe
            bibliografia: section === 'bibliografia' ? ((bibliografiaItems && bibliografiaItems.length) ? bibliografiaItems : bibliografiaText) : undefined,
          })
        } catch (err) {
          console.warn('save on toggle failed', err)
        }
      }
      return next
    })
  }

  // clave estable para dependencias basada en el contenido de temas (evita pasar el array/objetos directamente)
  const temasKey = useMemo(() => (temas && Array.isArray(temas) ? temas.map(t => String(t?.text || '')).join('|') : ''), [temas])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        console.log('guideForm loaded', parsed)
        setAsignatura(parsed.asignatura || '')
        setUnidad(parsed.unidad || '')
        setGuideNumber(parsed.guideNumber || parsed.guiaNumero || '')
        // soportar temas guardados como array de strings o array de objetos
        if (parsed.temas && parsed.temas.length) {
          if (typeof parsed.temas[0] === 'string') {
            setTemas(parsed.temas.map((t, i) => ({ id: `tema-${i}-${Date.now()}`, text: t })))
          } else {
            setTemas(parsed.temas)
          }
        }
    setSemanaInicio(parsed.semanaInicio || '')
    setImageUrl(parsed.imageUrl || '')
    // si no hay imagen, dejar el input visible; si existe, ocultarlo inicialmente
    setEditingImage(!parsed.imageUrl)
        // Restaurar secciones si existen en la carga previa
        setDatosText(parsed.datos || '')
        setDesarrolloText(parsed.desarrollo || '')
        setActividadesText(parsed.actividades || '')
  setRubricaText(sanitizeRubricaText(parsed.rubrica || ''))
        setAutoevaluacionText(parsed.autoevaluacion || '')
        // bibliografia puede venir como string (líneas) o como array de objetos {text, link}
        if (parsed.bibliografia) {
          if (Array.isArray(parsed.bibliografia)) {
            setBibliografiaItems(parsed.bibliografia)
            // también mantener string para compatibilidad con vistas antiguas
            setBibliografiaText((parsed.bibliografia || []).map(b => b.text || '').join('\n'))
          } else if (typeof parsed.bibliografia === 'string') {
            setBibliografiaText(parsed.bibliografia)
            // convertir líneas en items: extraer URL si existe en la línea
            const lines = parsed.bibliografia.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
            const items = lines.map((ln) => {
              const m = ln.match(/(https?:\/\/[^\s]+)/i)
              const url = m ? m[1] : null
              const display = url ? ln.replace(url, '').trim() : ln
              return { text: display, link: url || '' }
            })
            setBibliografiaItems(items)
          }
        } else {
          setBibliografiaText('')
        }
        if (parsed._savedAt) {
          setLastSaved(parsed._savedAt)
        }
      }
    } catch (err) {
      console.warn('ls read failed', err)
    }
    const k = localStorage.getItem('groqApiKey') || ''
    setGroqKey(k)
    setEditingKey(!k) // si no hay clave, mostrar editor; si hay, ocultarlo
    // indicar que la hidratación inicial terminó
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return // no escribir hasta haber cargado la snapshot inicial
    try {
      const payload = {
        asignatura,
        unidad,
        guideNumber,
        temas,
        semanaInicio,
        imageUrl,
        // secciones guardadas
        datos: datosText,
        desarrollo: desarrolloText,
        actividades: actividadesText,
        rubrica: rubricaText,
        autoevaluacion: autoevaluacionText,
        // preferir guardar la estructura enriquecida (items con link) cuando exista
        bibliografia: (bibliografiaItems && bibliografiaItems.length) ? bibliografiaItems : bibliografiaText,
        _savedAt: Date.now(),
      }
      localStorage.setItem(LS_KEY, JSON.stringify(payload))
      setLastSaved(payload._savedAt)
      console.debug('guideForm saved', payload)
    } catch (err) {
      console.warn('ls write failed', err)
    }
  }, [hydrated, asignatura, unidad, temas, temasKey, semanaInicio, datosText, desarrolloText, actividadesText, rubricaText, autoevaluacionText, bibliografiaText, bibliografiaItems, guideNumber, imageUrl])

  // Guarda inmediatamente un "snapshot" parcial o completo en localStorage.
  function saveSnapshot(partial = {}) {
    try {
      // Leer el estado actual y combinar con el parcial (partial prevalece)
      const current = {
        asignatura,
        unidad,
        guideNumber,
        temas,
        semanaInicio,
        imageUrl,
        datos: datosText,
        desarrollo: desarrolloText,
        actividades: actividadesText,
        rubrica: rubricaText,
        autoevaluacion: autoevaluacionText,
        bibliografia: (bibliografiaItems && bibliografiaItems.length) ? bibliografiaItems : bibliografiaText,
      }
      const merged = { ...current, ...partial, _savedAt: Date.now() }
      // include guideNumber if present
      if (current.guideNumber || partial.guideNumber) merged.guideNumber = partial.guideNumber || current.guideNumber
      localStorage.setItem(LS_KEY, JSON.stringify(merged))
      setLastSaved(merged._savedAt)
      console.debug('guideForm snapshot saved', merged)
    } catch (err) {
      console.warn('saveSnapshot failed', err)
    }
  }

  function updateTema(i, v) {
    setTemas((prev) => {
      const next = prev.map((t, idx) => (idx === i ? { ...t, text: v } : t))
      // persistir inmediatamente
      saveSnapshot({ temas: next })
      return next
    })
  }
  function addTema() {
    setTemas((p) => {
      const next = (p.length >= 4 ? p : [...p, { id: `tema-${Date.now()}`, text: '' }])
      saveSnapshot({ temas: next })
      return next
    })
  }
  function removeTema(i) {
    setTemas((p) => {
      const next = p.filter((_, idx) => idx !== i)
      saveSnapshot({ temas: next })
      return next
    })
  }
  function saveGroqKey() {
    const val = groqKeyRef.current ? groqKeyRef.current.value : ''
    try {
      localStorage.setItem('groqApiKey', val)
      setGroqKey(val)
      setEditingKey(false)
    } catch (err) {
      console.warn('save key failed', err)
    }
  }

  function deleteGroqKey() {
    try {
      localStorage.removeItem('groqApiKey')
      setGroqKey('')
      setEditingKey(true)
    } catch (err) {
      console.warn('delete key failed', err)
    }
  }

  function clearSections() {
    setDatosText('')
    setDesarrolloText('')
    setActividadesText('')
    setRubricaText('')
    setAutoevaluacionText('')
    setBibliografiaText('')
    setBibliografiaItems([])
  }

  function clearForm() {
    try {
      setAsignatura('')
      setUnidad('')
      setTemas([{ id: `tema-0-${Date.now()}`, text: '' }])
      setSemanaInicio('')
      clearSections()
      localStorage.removeItem(LS_KEY)
      setLastSaved(null)
    } catch (err) {
      console.warn('clear form failed', err)
    }
  }

  // Llamar a saveSnapshot también desde los onChange de inputs principales

  async function handleGenerate(e) {
    e?.preventDefault()
  setStatusMessage(null)
    setLoading(true)
    clearSections()
    try {
      const payload = {
        subject: asignatura,
        unit: unidad,
        guideNumber,
        topics: temas.map((t) => t.text).filter((x) => x && x.trim()),
        startWeek: semanaInicio,
      }
      const res = await generateGuide(payload)
        // Depurar/normalizar la salida de la API antes de usarla en el formulario
        const norm = normalizeGuide(res || {}, { subject: asignatura, unit: unidad, guideNumber, topics: temas.map((t) => t.text).filter(Boolean) })
        // norm contiene: datos, desarrollo, actividades, rubrica, autoevaluacion, bibliografia_items, bibliografia
        // Guardar directamente en estados individuales
        setDatosText(norm.datos || '')
        setDesarrolloText(norm.desarrollo || '')
        setActividadesText(norm.actividades || '')
        const sanitizedRubrica = sanitizeRubricaText(norm.rubrica || '')
      // Si la API no devuelve rúbrica, insertar una plantilla por defecto para que se muestre
      const finalRubrica = (sanitizedRubrica && sanitizedRubrica.trim()) ? sanitizedRubrica : `| Criterio | Muy bien | Bien | En progreso |\n| --- | --- | --- | --- |\n| Exactitud de los cálculos | - | - | - |\n| Presentación y claridad | - | - | - |\n| Interpretación geométrica | - | - | - |\n| Aplicación de técnicas de integración | - | - | - |`
      setRubricaText(finalRubrica)
      if (!sanitizedRubrica || !sanitizedRubrica.trim()) {
        setStatusMessage('Atención: la API no devolvió rúbrica; se ha insertado una plantilla por defecto.')
      }
      setAutoevaluacionText(norm.autoevaluacion || '')
      // convertir bibliografía devuelta por la API a items {text, link}
      // usar la bibliografía ya normalizada por normalizeGuide
      let bibliografiaForSave = null
      if (Array.isArray(norm.bibliografia_items) && norm.bibliografia_items.length) {
        setBibliografiaItems(norm.bibliografia_items)
        setBibliografiaText((norm.bibliografia_items || []).map(b => b.text || '').join('\n'))
        bibliografiaForSave = norm.bibliografia_items
      } else if (norm.bibliografia) {
        setBibliografiaText(norm.bibliografia)
        const lines = (norm.bibliografia || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        const items = lines.map((ln) => {
          const m = ln.match(/(https?:\/\/[^\s]+)/i)
          const url = m ? m[1] : ''
          const display = url ? ln.replace(url, '').trim() : ln
          return { text: display, link: url }
        })
        setBibliografiaItems(items)
        bibliografiaForSave = items
      } else {
        setBibliografiaText('')
        setBibliografiaItems([])
        bibliografiaForSave = ''
      }
      // Si la API no devolvió bibliografía, intentar extraer 'Fuente' desde actividades generadas
  if ((!bibliografiaForSave || (Array.isArray(bibliografiaForSave) && bibliografiaForSave.length === 0)) && actividadesText) {
        try {
          const fuentes = []
          const lines = actividadesText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
          for (const ln of lines) {
            const m = ln.match(/^(?:Fuente bibliográfica|Fuente)\s*[:\-–]?\s*(.+)$/i)
            if (m) {
              const val = m[1].trim()
              if (val && !fuentes.includes(val)) fuentes.push(val)
            }
          }
          if (fuentes.length) {
            const itemsFromFuentes = fuentes.map(f => {
              const um = f.match(/(https?:\/\/[^\s]+)/i)
              return { text: um ? f.replace(um[1], '').trim() : f, link: um ? um[1] : '' }
            })
            setBibliografiaItems(itemsFromFuentes)
            setBibliografiaText(itemsFromFuentes.map(i => i.text).join('\n'))
            // prefer to save these extracted items
            bibliografiaForSave = itemsFromFuentes
          }
        } catch (err) {
          console.warn('extraction of fuentes failed', err)
        }
      }
      // persistir inmediatamente las secciones generadas
      saveSnapshot({
        datos: res.datos || '',
        desarrollo: res.desarrollo || '',
        actividades: res.actividades || '',
        rubrica: sanitizedRubrica || '',
        autoevaluacion: res.autoevaluacion || '',
        bibliografia: bibliografiaForSave !== null ? bibliografiaForSave : ((bibliografiaItems && bibliografiaItems.length) ? bibliografiaItems : (res.bibliografia || '')),
        imageUrl: imageUrl || '',
        guideNumber: guideNumber || ''
      })
    } catch (err) {
      console.error(err)
      setStatusMessage(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  // copyPlain is defined at module scope
  function handleCopy(key, text) {
    if (!text) return
    try {
      copyPlain(text)
      setCopiedMap((m) => ({ ...m, [key]: true }))
      // limpiar aviso después de 2s
      setTimeout(() => setCopiedMap((m) => ({ ...m, [key]: false })), 2000)
    } catch (err) {
      console.warn('copy failed', err)
    }
  }

  function renderDatos() {
    // Build canonical meta entries from form state
    const metaEntries = []
    if (guideNumber && guideNumber.trim()) metaEntries.push({ label: 'Número de guía', value: guideNumber.trim() })
    if (asignatura && asignatura.trim()) metaEntries.push({ label: 'Asignatura', value: asignatura.trim() })
    if (unidad && unidad.trim()) metaEntries.push({ label: 'Unidad de estudio', value: unidad.trim() })
    const temasList = temas && Array.isArray(temas) ? temas.map(t => t.text).filter(Boolean) : []
    if (temasList.length) metaEntries.push({ label: 'Temas', value: temasList.join('; ') })

    // parse datosText into lines but avoid duplicating meta entries
    const lines = (datosText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const parsed = lines.map((ln) => {
      const m = ln.match(/^([^:]+)\s*:\s*(.+)$/)
      if (m) return { label: m[1].trim(), value: m[2].trim() }
      return { label: null, value: ln }
    })
    // filter parsed to exclude those that duplicate meta labels
    const metaLabels = new Set(metaEntries.map(e => e.label.toLowerCase()))
    const parsedFiltered = parsed.filter(p => !(p.label && metaLabels.has(p.label.toLowerCase())))

    // if no content at all, show placeholder
    if (metaEntries.length === 0 && parsedFiltered.length === 0) return <div className="text-gray-500">Aún no hay información de datos. Genera la guía para ver los detalles.</div>

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

  function renderActividades() {
    if (!actividadesText || !actividadesText.trim()) return <div className="text-gray-600">No hay actividades generadas.</div>
    // dividir por doble salto de línea en bloques
    const bloques = actividadesText.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
    // para cada bloque, extraer campos por líneas que empiecen con 'Título:', 'Tema:', etc.
    function parseActividad(block) {
      const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean)
      const obj = {}
      for (const ln of lines) {
        const m = ln.match(/^(Título|Titulo|Tema|Descripción|Descripcion|Formato de entrega|Formato|Fecha de entrega|Fecha|Fuente bibliográfica|Fuente)\s*:\s*(.+)$/i)
        if (m) {
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
    }

    return (
      <div className="space-y-4">
        {bloques.map((b, idx) => {
          const obj = parseActividad(b)
          const keyId = 'act-' + hashCode(b)
          return (
            <div key={keyId} className="p-4 border rounded-lg bg-white shadow-sm">
                  <div>
                    <h4 className="font-semibold text-lg text-sky-700">Actividad {idx + 1}</h4>
                    {obj.descripcion ? (
                      <div className="mt-2 text-gray-700">{obj.descripcion}</div>
                    ) : (
                      // si no hay descripcion, intentar usar título o tema como fallback
                      <div className="mt-2 text-gray-700">{obj.titulo || obj.tema || ''}</div>
                    )}
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {obj.formato && (
                        <div><span className="font-semibold text-violet-700">Formato: </span><span className="text-slate-800">{obj.formato}</span></div>
                      )}
                      {obj.fecha && (
                        <div><span className="font-semibold text-red-600">Fecha: </span><span className="text-slate-800">{obj.fecha}</span></div>
                      )}
                      {obj.fuente && (
                        <div className="sm:col-span-2"><span className="font-semibold text-amber-700">Fuente: </span><span className="text-slate-800">{obj.fuente}</span></div>
                      )}
                    </div>
                  </div>
            </div>
          )
        })}
      </div>
    )
  }



  function copyRubricaTable() {
    const parsed = parseRubrica(rubricaText)
    // construir tabla Markdown
    const header = ['Criterio', 'Muy bien (2.5)', 'Bien (1.75)', 'En progreso (1)']
    const rows = parsed.map(p => [p.criterion, p.muyBien || '-', p.bien || '-', p.enProgreso || '-'])
  const mdHeader = '| ' + header.join(' | ') + ' |\n' + '| ' + header.map(() => '---').join(' | ') + ' |'
  const mdRows = rows.map(r => '| ' + r.join(' | ') + ' |').join('\n')
  const out = mdHeader + (mdRows ? '\n' + mdRows : '')
    try {
      navigator.clipboard.writeText(out)
      setCopiedMap((m) => ({ ...m, rubrica: true }))
      setTimeout(() => setCopiedMap((m) => ({ ...m, rubrica: false })), 2000)
    } catch (err) {
      console.warn('copy rubrica failed', err)
    }
  }

  function renderRubrica() {
    const parsed = parseRubrica(rubricaText)
    console.log('parsed rubrica', parsed)
    if (!parsed.length) return <div className="text-gray-600">No hay rúbrica generada.</div>
    return (
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
            {parsed.map((p) => {
              const keyRow = 'rub-' + hashCode(p.criterion)
              const i = hashCode(p.criterion) % 2
              return (
                <tr key={keyRow} className={i === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="px-4 py-3 align-top border font-semibold text-slate-800">{p.criterion}</td>
                <td className="px-4 py-3 align-top border text-gray-700 whitespace-pre-wrap">{p.muyBien || '-'}</td>
                <td className="px-4 py-3 align-top border text-gray-700 whitespace-pre-wrap">{p.bien || '-'}</td>
                <td className="px-4 py-3 align-top border text-gray-700 whitespace-pre-wrap">{p.enProgreso || '-'}</td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // Autoevaluación renderizada abajo

  function renderAutoevaluacion() {
    const parsed = parseAutoevaluacion(autoevaluacionText)
    if (!parsed.length) return <div className="text-gray-600">No hay preguntas de autoevaluación.</div>
    return (
      <div className="space-y-4">
        {parsed.map((q, idx) => {
          const qKey = 'aq-' + hashCode(q.question + (q.options.map(o => o.label + o.text).join('|')))
          return (
            <div key={qKey} className="p-3 border rounded bg-white">
              <div className="font-semibold text-slate-800">{idx + 1}. {q.question}</div>
              <ul className="mt-2 space-y-1">
                {q.options.map((o) => (
                  <li key={qKey + '-' + o.label} className={`p-2 rounded ${o.correct ? 'bg-green-50 border-l-4 border-green-400' : ''}`}>
                    <span className="font-semibold mr-2">{o.label})</span>
                    <span className="text-slate-800">{o.text}{o.correct ? <span className="ml-3 text-sm font-medium text-green-700">✓ Correcta</span> : null}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    )
  }

  function renderBibliografia() {
    const hasItems = bibliografiaItems && bibliografiaItems.length
    const hasText = bibliografiaText && bibliografiaText.trim()
    if (!hasItems && !hasText) return <div className="text-gray-500">No hay bibliografía aún. Pide generar la guía para obtener fuentes sugeridas.</div>

    // Modo edición: permitir editar cada referencia (texto APA) y su enlace
    if (editingSections.bibliografia) {
      const items = hasItems ? bibliografiaItems : (bibliografiaText.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(ln => {
        const m = ln.match(/(https?:\/\/[^\s]+)/i)
        const url = m ? m[1] : ''
        const display = url ? ln.replace(url, '').trim() : ln
        return { text: display, link: url }
      }))
      return (
        <div className="space-y-3">
          {items.map((it, idx) => (
            <div key={'bib-edit-' + idx} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-center">
              <div className="sm:col-span-3">
                <label className="text-sm font-medium">Referencia</label>
                <input className="mt-1 block w-full border rounded p-2" value={it.text} onChange={(e) => {
                  const next = items.map((x, i) => i === idx ? { ...x, text: e.target.value } : x)
                  setBibliografiaItems(next)
                  setBibliografiaText(next.map(n => n.text).join('\n'))
                  saveSnapshot({ bibliografia: next })
                }} />
              </div>
              <div className="sm:col-span-3">
                <label className="text-sm font-medium">Enlace (opcional)</label>
                <input className="mt-1 block w-full border rounded p-2" value={it.link || ''} onChange={(e) => {
                  const next = items.map((x, i) => i === idx ? { ...x, link: e.target.value } : x)
                  setBibliografiaItems(next)
                  setBibliografiaText(next.map(n => n.text).join('\n'))
                  saveSnapshot({ bibliografia: next })
                }} placeholder="https://..." />
              </div>
              <div className="sm:col-span-6 flex gap-2 justify-end">
                <button type="button" className="px-3 py-1 bg-red-200 rounded" onClick={() => {
                  const next = items.filter((_, i) => i !== idx)
                  setBibliografiaItems(next)
                  setBibliografiaText(next.map(n => n.text).join('\n'))
                  saveSnapshot({ bibliografia: next })
                }}>Eliminar</button>
              </div>
            </div>
          ))}
          <div>
            <button type="button" className="px-3 py-1 bg-gray-100 rounded" onClick={() => {
              const next = [...items, { text: '', link: '' }]
              setBibliografiaItems(next)
              setBibliografiaText(next.map(n => n.text).join('\n'))
              saveSnapshot({ bibliografia: next })
              // ensure editing remains enabled
              setEditingSections((p) => ({ ...p, bibliografia: true }))
            }}>Añadir referencia</button>
          </div>
        </div>
      )
    }

    // Modo visual: mostrar solo la referencia en formato APA (texto). El enlace se usa solo internamente/para JSON.
    if (hasItems) {
      return (
        <ol className="list-decimal pl-5 space-y-2">
          {bibliografiaItems.map((it, idx) => (
            <li key={'bib-' + idx} className="text-slate-800">
              {it.link ? (
                <a href={it.link} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">{it.text}</a>
              ) : (
                it.text
              )}
            </li>
          ))}
        </ol>
      )
    }

    // Fallback: mostrar bibliografiaText como líneas
    const lines = bibliografiaText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    return (
      <ol className="list-decimal pl-5 space-y-2">
        {lines.map((ln, idx) => (<li key={'bib-' + idx} className="text-slate-800">{ln}</li>))}
      </ol>
    )
  }


  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-center mb-4">Guías de Estudio</h1>
      <form onSubmit={handleGenerate} className="space-y-4">
        <div className="border rounded p-3">
          <label htmlFor="groqKeyInput" className="block text-sm font-medium">Clave API Groq</label>
          {editingKey ? (
            <div className="mt-2 flex gap-2">
              <input id="groqKeyInput" ref={groqKeyRef} defaultValue={groqKey} className="border rounded p-2 flex-1" placeholder="Ingresa tu Groq API Key" />
              <button type="button" className="px-3 py-2 bg-green-600 text-white rounded" onClick={saveGroqKey}>Guardar</button>
              <button type="button" className="px-3 py-2 border rounded" onClick={() => { setEditingKey(false); if (groqKeyRef.current) groqKeyRef.current.value = groqKey }}>Cancelar</button>
            </div>
          ) : (
            <div className="mt-2 flex gap-2">
              <button type="button" className="px-3 py-2 bg-amber-500 text-white rounded" onClick={() => setEditingKey(true)}>Cambiar clave</button>
              <button type="button" className="text-sm text-red-600 underline" onClick={deleteGroqKey}>Eliminar</button>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="asignatura" className="block text-sm font-medium">Asignatura</label>
          <input id="asignatura" className="mt-1 block w-full border rounded p-2" value={asignatura} onChange={(e) => { setAsignatura(e.target.value); saveSnapshot({ asignatura: e.target.value }); }} />
        </div>

        <div>
          <label htmlFor="imageUrl" className="block text-sm font-medium">Carátula (imageUrl)</label>
          <div className="mt-2">
            {imageUrl && !editingImage ? (
              <div className="flex items-center gap-3">
                <button type="button" className="p-0 border rounded" onClick={() => setShowImageModal(true)}>
                  <img src={imageUrl} alt="preview" className="w-12 h-8 object-cover rounded border" onError={(e) => { e.target.style.display = 'none' }} />
                </button>
                <div className="flex gap-2">
                  <button type="button" className="px-3 py-1 bg-amber-500 text-white rounded" onClick={() => setEditingImage(true)}>Cambiar imagen</button>
                  <button type="button" className="px-3 py-1 bg-red-200 rounded" onClick={() => { setImageUrl(''); saveSnapshot({ imageUrl: '' }); setEditingImage(true) }}>Eliminar</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <input id="imageUrl" className="block w-full border rounded p-2" value={imageUrl} onChange={(e) => { setImageUrl(e.target.value); }} placeholder="https://.../cover.png" />
                <button type="button" className="px-3 py-1 bg-green-600 text-white rounded" onClick={() => { saveSnapshot({ imageUrl: imageUrl || '' }); setEditingImage(false) }}>Guardar</button>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">Pega una URL pública de imagen para usar como carátula. Se guardará en la guía y se mostrará en el visor.</p>
          </div>
          {showImageModal ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
              role="dialog"
              aria-modal="true"
              tabIndex={-1}
              onClick={() => setShowImageModal(false)}
              onKeyDown={(e) => { if (e.key === 'Escape') setShowImageModal(false) }}
            >
              <div className="bg-white p-4 rounded max-w-[90%] max-h-[90%] overflow-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-end"><button className="px-2 py-1" onClick={() => setShowImageModal(false)}>Cerrar</button></div>
                <img src={imageUrl} alt="Carátula completa" className="max-w-full max-h-[80vh] object-contain" />
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <label htmlFor="guideNumber" className="block text-sm font-medium">Número de guía</label>
          <input id="guideNumber" className="mt-1 block w-full border rounded p-2" value={guideNumber} onChange={(e) => { setGuideNumber(e.target.value); saveSnapshot({ guideNumber: e.target.value }); }} placeholder="Ej. guia-1234" />
        </div>

        <div>
          <label htmlFor="unidad" className="block text-sm font-medium">Unidad</label>
          <input id="unidad" className="mt-1 block w-full border rounded p-2" value={unidad} onChange={(e) => { setUnidad(e.target.value); saveSnapshot({ unidad: e.target.value }); }} />
        </div>

        <div>
          <label htmlFor={temas[0]?.id || 'tema-0'} className="block text-sm font-medium">Temas (hasta 4)</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {temas.map((t, i) => (
              <div key={t.id} className="flex gap-2">
                <input id={t.id} className="border rounded p-2 flex-1" value={t.text} onChange={(e) => updateTema(i, e.target.value)} placeholder={`Tema ${i + 1}`} />
                {temas.length > 1 && (
                  <button type="button" className="px-2 py-1 bg-red-200 rounded" onClick={() => removeTema(i)}>×</button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2">
            <button type="button" onClick={addTema} className="px-3 py-1 bg-gray-100 rounded" disabled={temas.length >= 4}>Añadir tema</button>
          </div>
        </div>

        <div>
          <label htmlFor="semanaInicio" className="block text-sm font-medium">Semana de inicio</label>
          <input id="semanaInicio" className="mt-1 block w-32 border rounded p-2" value={semanaInicio} onChange={(e) => { setSemanaInicio(e.target.value); saveSnapshot({ semanaInicio: e.target.value }); }} />
        </div>

        <div className="flex items-center gap-2">
          <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded">{loading ? 'Generando...' : 'Generar guía'}</button>
          <button type="button" onClick={() => {
            // descargar las secciones concatenadas
              const bibForTxt = (bibliografiaItems && bibliografiaItems.length) ? bibliografiaItems.map(b => (b.text || '') + (b.link ? ' ' + b.link : '')).join('\n') : bibliografiaText
              const content = `--DATOS--\n${datosText}\n\n--DESARROLLO--\n${desarrolloText}\n\n--ACTIVIDADES--\n${actividadesText}\n\n--RUBRICA--\n${rubricaText}\n\n--AUTOEVALUACION--\n${autoevaluacionText}\n\n--BIBLIOGRAFIA--\n${bibForTxt}`
            const blob = new Blob([content], { type: 'text/plain' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${asignatura || 'guia'}.txt`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
          }} className="px-3 py-2 bg-gray-200 rounded">Descargar .txt</button>
          <button type="button" onClick={() => {
            // construir objeto JSON con la estructura esperada por GuideViewer
            const guideId = `${Date.now()}`
            let titleStr = ''
            if (asignatura) {
              titleStr = asignatura
              if (unidad) titleStr += ' - ' + unidad
            } else {
              titleStr = unidad || guideId
            }
            const guideObj = {
              id: guideId,
              titulo: titleStr,
              asignatura: asignatura || '',
              guideNumber: guideNumber || '',
              imageUrl: imageUrl || '',
              unidad: unidad || '',
              temas: temas.map(t => t.text).filter(Boolean),
              datos: datosText || '',
              desarrollo: desarrolloText || '',
              actividades: actividadesText || '',
              rubrica: rubricaText || '',
              autoevaluacion: autoevaluacionText || '',
              bibliografia: (bibliografiaItems && bibliografiaItems.length) ? bibliografiaItems : (bibliografiaText || '')
            }
            const jsonStr = JSON.stringify(guideObj, null, 2)
            const blobJson = new Blob([jsonStr], { type: 'application/json' })
            const urlJson = URL.createObjectURL(blobJson)
            const aJson = document.createElement('a')
            aJson.href = urlJson
            aJson.download = `${guideId}.json`
            document.body.appendChild(aJson)
            aJson.click()
            aJson.remove()
            URL.revokeObjectURL(urlJson)
          }} className="px-3 py-2 bg-indigo-500 text-white rounded">Descargar JSON</button>
          <button type="button" onClick={clearForm} className="px-3 py-2 bg-red-600 text-white rounded">Limpiar formulario</button>
        </div>
      </form>
  {statusMessage && <div className="mt-4 text-red-600">{statusMessage}</div>}
  {lastSaved && (
    <div className="mt-2 text-sm text-gray-500">Guardado localmente: {new Date(lastSaved).toLocaleString()}</div>
  )}

  <div className="mt-6 space-y-6">
  <section className="rounded-lg border p-4 bg-gradient-to-br from-white to-cyan-50 shadow-sm ring-1 ring-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold text-lg text-left text-sky-700">DATOS</h3>
              <p className="text-sm text-gray-500 mt-1">Información general y metadatos de la guía</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className={`px-3 py-1 rounded text-sm transition ${copiedMap['datos'] ? 'bg-green-500 text-white' : 'bg-blue-50 text-blue-700 border'}`}
                onClick={() => handleCopy('datos', datosText)}
              >
                {copiedMap['datos'] ? 'Copiado' : 'Copiar texto'}
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded text-sm ${editingSections.datos ? 'bg-amber-500 text-white' : 'bg-white border text-slate-700'}`}
                onClick={() => toggleEditing('datos')}
              >
                {editingSections.datos ? 'Listo' : 'Editar'}
              </button>
            </div>
          </div>
          <div className="mt-4">
            {editingSections.datos ? (
              <textarea className="w-full min-h-[160px] border rounded p-2" value={datosText} onChange={(e) => { setDatosText(e.target.value); saveSnapshot({ datos: e.target.value }); }} />
            ) : (
              renderDatos()
            )}
          </div>
        </section>

  <section className="rounded-lg border p-4 bg-gradient-to-br from-white to-violet-50 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold text-lg text-left text-violet-700">DESARROLLO</h3>
              <p className="text-sm text-gray-500 mt-1">Estructura del desarrollo de la unidad y actividades de aprendizaje</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className={`px-3 py-1 rounded text-sm transition ${copiedMap['desarrollo'] ? 'bg-green-500 text-white' : 'bg-blue-50 text-blue-700 border'}`}
                onClick={() => handleCopy('desarrollo', desarrolloText)}
              >
                {copiedMap['desarrollo'] ? 'Copiado' : 'Copiar texto'}
              </button>
              <button type="button" className={`px-3 py-1 rounded text-sm ${editingSections.desarrollo ? 'bg-amber-500 text-white' : 'bg-white border text-slate-700'}`} onClick={() => toggleEditing('desarrollo')}>{editingSections.desarrollo ? 'Listo' : 'Editar'}</button>
            </div>
          </div>
          <div className="mt-4 bg-slate-50 border rounded-md p-4 text-gray-800 whitespace-pre-wrap text-left">
            {editingSections.desarrollo ? (<textarea className="w-full min-h-[160px] border rounded p-2" value={desarrolloText} onChange={(e) => { setDesarrolloText(e.target.value); saveSnapshot({ desarrollo: e.target.value }); }} />) : (desarrolloText || <span className="text-gray-500">El desarrollo aparecerá aquí después de generar la guía.</span>)}
          </div>
        </section>

  <section className="border rounded p-4 bg-gradient-to-br from-white to-emerald-50">
          <div className="flex justify-between items-start">
            <h3 className="font-semibold text-lg text-left text-slate-800 border-b pb-1">ACTIVIDADES</h3>
            <div className="flex items-center gap-2">
              <button className={`px-3 py-1 rounded text-sm transition ${copiedMap['actividades'] ? 'bg-green-500 text-white' : 'bg-blue-50 text-blue-700 border'}`} onClick={() => handleCopy('actividades', actividadesText)}>{copiedMap['actividades'] ? 'Copiado' : 'Copiar texto'}</button>
              <button type="button" className={`px-3 py-1 rounded text-sm ${editingSections.actividades ? 'bg-amber-500 text-white' : 'bg-white border text-slate-700'}`} onClick={() => toggleEditing('actividades')}>{editingSections.actividades ? 'Listo' : 'Editar'}</button>
            </div>
          </div>
          <div className="mt-3 text-gray-800 text-left">{editingSections.actividades ? (<textarea className="w-full min-h-[160px] border rounded p-2" value={actividadesText} onChange={(e) => { setActividadesText(e.target.value); saveSnapshot({ actividades: e.target.value }); }} />) : (renderActividades())}</div>
        </section>

  <section className="border rounded p-4 bg-gradient-to-br from-white to-rose-50">
          <div className="flex justify-between items-start">
            <h3 className="font-semibold text-lg text-left text-slate-800 border-b pb-1">RÚBRICA</h3>
            <div className="flex items-center gap-2">
              <button className={`px-3 py-1 rounded text-sm transition ${copiedMap['rubrica'] ? 'bg-green-500 text-white' : 'bg-blue-50 text-blue-700 border'}`} onClick={copyRubricaTable}>{copiedMap['rubrica'] ? 'Copiado' : 'Copiar tabla'}</button>
              <button type="button" className={`px-3 py-1 rounded text-sm ${editingSections.rubrica ? 'bg-amber-500 text-white' : 'bg-white border text-slate-700'}`} onClick={() => toggleEditing('rubrica')}>{editingSections.rubrica ? 'Listo' : 'Editar'}</button>
            </div>
          </div>
          <div className="mt-3 text-gray-800 text-left">{editingSections.rubrica ? (<textarea className="w-full min-h-[160px] border rounded p-2" value={rubricaText} onChange={(e) => { setRubricaText(e.target.value); saveSnapshot({ rubrica: e.target.value }); }} />) : (renderRubrica())}</div>
        </section>

  <section className="border rounded p-4 bg-gradient-to-br from-white to-amber-50">
          <div className="flex justify-between items-start">
            <h3 className="font-semibold text-lg text-left text-slate-800 border-b pb-1">AUTOEVALUACIÓN</h3>
            <div className="flex items-center gap-2">
              <button className={`px-3 py-1 rounded text-sm transition ${copiedMap['autoevaluacion'] ? 'bg-green-500 text-white' : 'bg-blue-50 text-blue-700 border'}`} onClick={() => handleCopy('autoevaluacion', autoevaluacionText)}>{copiedMap['autoevaluacion'] ? 'Copiado' : 'Copiar texto'}</button>
              <button type="button" className={`px-3 py-1 rounded text-sm ${editingSections.autoevaluacion ? 'bg-amber-500 text-white' : 'bg-white border text-slate-700'}`} onClick={() => toggleEditing('autoevaluacion')}>{editingSections.autoevaluacion ? 'Listo' : 'Editar'}</button>
            </div>
          </div>
          <div className="mt-3 text-gray-800 text-left">{editingSections.autoevaluacion ? (<textarea className="w-full min-h-[160px] border rounded p-2" value={autoevaluacionText} onChange={(e) => { setAutoevaluacionText(e.target.value); saveSnapshot({ autoevaluacion: e.target.value }); }} />) : (renderAutoevaluacion())}</div>
        </section>

        <section className="rounded-lg border p-4 bg-gradient-to-br from-white to-amber-50 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold text-lg text-left text-amber-700">BIBLIOGRAFÍA</h3>
              <p className="text-sm text-gray-500 mt-1">Fuentes y referencias recomendadas (preferir fuentes en español)</p>
            </div>
            <div className="flex items-center gap-2">
              <button className={`px-3 py-1 rounded text-sm transition ${copiedMap['bibliografia'] ? 'bg-green-500 text-white' : 'bg-blue-50 text-blue-700 border'}`} onClick={() => handleCopy('bibliografia', bibliografiaText)}>{copiedMap['bibliografia'] ? 'Copiado' : 'Copiar texto'}</button>
              <button type="button" className={`px-3 py-1 rounded text-sm ${editingSections.bibliografia ? 'bg-amber-500 text-white' : 'bg-white border text-slate-700'}`} onClick={() => toggleEditing('bibliografia')}>{editingSections.bibliografia ? 'Listo' : 'Editar'}</button>
            </div>
          </div>
      <div className="mt-4 bg-white border rounded-md p-4 text-gray-800 text-left">
        {renderBibliografia()}
              
          </div>
        </section>

      </div>
    </div>
  )
}
