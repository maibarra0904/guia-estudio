// normalizeGuide.js
// Toma la salida cruda de groqService (secciones en texto o arrays) y la normaliza
// para que `GuideForm` siempre reciba las secciones en el formato esperado.

function makeSearchLink(text) {
  return `https://www.google.com/search?q=${encodeURIComponent(String(text || ''))}`
}

function parseBibliografia(rawBib) {
  // rawBib puede ser array de objetos {text,link} o string con líneas
  if (!rawBib) return []
  if (Array.isArray(rawBib)) {
    return rawBib.map((b) => {
      if (!b) return { text: '', link: makeSearchLink('') }
      const text = b.text || (typeof b === 'string' ? b : '')
      let link = b.link || ''
      if (!link) {
        // intentar extraer URL si está incorporada en text
        const m = String(text).match(/\|\s*(https?:\/\/[^\s]+)/i)
        if (m) link = m[1]
      }
      if (!link) link = makeSearchLink(text)
      return { text: (text || '').replace(/\|\s*(https?:\/\/[^\s]+)\s*$/i, '').trim(), link }
    })
  }
  // rawBib es string
  const lines = String(rawBib).split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  return lines.map((ln) => {
    // formato preferido: "<Referencia APA> | <URL>"
    if (ln.includes('|')) {
      const parts = ln.split('|')
      const text = parts.slice(0, -1).join('|').trim()
      const maybe = parts[parts.length - 1].trim()
      if (maybe && maybe.toUpperCase() !== 'NO_LINK') return { text, link: maybe }
      return { text, link: makeSearchLink(text) }
    }
    // intentar extraer URL dentro de la línea
    const m = ln.match(/(https?:\/\/[^\s]+)/i)
    if (m) {
      const link = m[1]
      const text = ln.replace(link, '').trim()
      return { text: text || ln, link }
    }
    return { text: ln, link: makeSearchLink(ln) }
  })
}

function ensureRubrica(text) {
  const t = (text || '').trim()
  if (!t) {
    return `| Criterio | Muy bien | Bien | En progreso |
| --- | --- | --- | --- |
| Exactitud | - | - | - |
| Presentación | - | - | - |
| Interpretación | - | - | - |
| Aplicación | - | - | - |`
  }
  return t
}

function ensureAutoevaluacion(text, topics = []) {
  const t = (text || '').trim()
  if (t) return t
  // generar 10 preguntas plantilla sencillas basadas en topics o unidad
  const q = []
  for (let i = 0; i < 10; i++) {
    const theme = topics[i] || topics[0] || 'Tema'
    q.push(`${i + 1}. Pregunta sobre ${theme} \nA) Opción A\nB) Opción B (correcto)\nC) Opción C\nD) Opción D`)
  }
  return q.join('\n\n')
}

function ensureDatos(rawDatos, payload = {}) {
  if (rawDatos && String(rawDatos).trim()) return String(rawDatos).trim()
  const lines = []
  if (payload.guideNumber) lines.push(`Número de guía: ${payload.guideNumber}`)
  if (payload.subject) lines.push(`Asignatura: ${payload.subject}`)
  if (payload.unit) lines.push(`Unidad de estudio: ${payload.unit}`)
  const temas = payload.topics && payload.topics.length ? payload.topics.join('; ') : ''
  if (temas) lines.push(`Temas: ${temas}`)
  return lines.join('\n')
}

export default function normalizeGuide(raw = {}, payload = {}) {
  // raw: resultado de generateGuide
  const out = {}
  out.datos = ensureDatos(raw.datos || raw.DATOS, payload)
  out.desarrollo = (raw.desarrollo || raw.DESARROLLO || '').trim()
  out.actividades = (raw.actividades || raw.ACTIVIDADES || '').trim()
  out.rubrica = ensureRubrica(raw.rubrica || raw.RUBRICA)
  out.autoevaluacion = ensureAutoevaluacion(raw.autoevaluacion || raw.AUTOEVALUACION, payload.topics || payload.topics || [])

  // Bibliografía estructurada: preferir bibliografia_items si viene del servicio
  let bibItems = []
  if (Array.isArray(raw.bibliografia_items) && raw.bibliografia_items.length) {
    bibItems = raw.bibliografia_items.map(b => ({ text: b.text || b.display || '', link: b.link || b.url || makeSearchLink(b.text || '') }))
  } else if (raw.bibliografia) {
    bibItems = parseBibliografia(raw.bibliografia)
  } else if (raw.BIBLIOGRAFIA) {
    bibItems = parseBibliografia(raw.BIBLIOGRAFIA)
  }

  // Si no hay bibliografía, intentar construir a partir de actividades (buscar líneas Fuente)
  if (!bibItems.length && out.actividades) {
    const bloques = out.actividades.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
    const fuentes = []
    for (const b of bloques) {
      const m = b.match(/^(?:Fuente bibliogr[aá]fica|Fuente)\s*[:\-–]?\s*(.+)$/im)
      if (m && m[1]) fuentes.push(m[1].trim())
    }
    if (fuentes.length) {
      bibItems = fuentes.map(f => ({ text: f.replace(/(https?:\/\/[^\s]+)/i, '').trim(), link: (f.match(/(https?:\/\/[^\s]+)/i) || [])[0] || makeSearchLink(f) }))
    }
  }

  // Si aún no hay bibliografía, generar entries basadas en unit/subject
  if (!bibItems.length) {
    const fallback = payload.topics && payload.topics.length ? payload.topics[0] : (payload.unit || payload.subject || 'Recurso general')
    bibItems = [{ text: `Recursos sobre ${fallback}`, link: makeSearchLink(fallback) }]
  }

  out.bibliografia_items = bibItems
  out.bibliografia = bibItems.map(b => `${b.text}${b.link ? ' | ' + b.link : ''}`).join('\n')

  return out
}
