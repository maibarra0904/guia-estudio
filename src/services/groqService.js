// Servicio Groq para 29-guia-estudio
export async function generateGuide(payload, groqApiKey) {
  // payload: { subject, unit, topics: [], startWeek }
  if (groqApiKey) {
    localStorage.setItem('groqApiKey', groqApiKey);
  }
  const apiKey = localStorage.getItem('groqApiKey') || '';
  if (!apiKey) throw new Error('No se ha registrado la API Key de Groq.');

  const { subject, unit, topics = [], startWeek, guideNumber } = payload;
  const topicsList = topics.map((t, i) => `${i+1}. ${t}`).join('\n');

  // (replaced by the more specific prompt below)

  // Prompt actualizado para pedir subapartados específicos en --DATOS--
  const prompt = `Genera una guía de estudio dividida en secciones claramente delimitadas por etiquetas de texto plano (NO JSON, NO Markdown obligatorio). Usa los delimitadores exactamente así (en mayúsculas entre dos guiones cada uno) y responde solo con esas secciones y su texto plano:
--DATOS--
--DESARROLLO--
--ACTIVIDADES--
--RUBRICA--
--AUTOEVALUACION--
--BIBLIOGRAFIA--

La sección --DATOS-- debe contener exactamente las cinco sublíneas (si hay información disponible):
Número de guía: <identificador de la guía>  
Asignatura: <nombre de la asignatura>  
Importancia de la asignatura: <breve texto explicando por qué esta asignatura es relevante>  
Objetivos de aprendizaje de la unidad: <lista corta de 3-5 objetivos separados por punto y coma>  
Resultado de aprendizaje de la unidad: <una frase clara que describa lo que el estudiante debe poder hacer>

Datos de entrada:
Asignatura: ${subject}
Unidad de estudio: ${unit}
Número de guía (si aplica): ${guideNumber || ''}
Temas (máximo 4):
${topicsList}
Semana de inicio para las actividades: ${startWeek}

Instrucciones (texto plano):
- En --DESARROLLO-- escribe un párrafo extendido que describa la unidad (un solo párrafo sin saltos de línea).
- En --ACTIVIDADES-- genera una actividad por cada tema. Para cada actividad la descripción de la tarea, formato de entrega, fecha de entrega (por ejemplo: Semana 1, Semana 2, ...) y una fuente bibliográfica en formato APA (preferentemente en español cuando exista). Entrega la información en texto plano, separando actividades con líneas en blanco.
- En --RUBRICA-- entrega EXACTAMENTE 4 criterios. Para cada criterio proporciona tres niveles con estos títulos exactos: "Muy bien", "Bien", "En progreso". No añadas valores numéricos ni puntuaciones dentro de las descripciones de nivel.
- En --AUTOEVALUACION-- entrega 10 preguntas de opción múltiple en texto plano; cada pregunta debe incluir claramente las opciones A), B), C) y D). Marca la opción correcta INLINE añadiendo la etiqueta "(correcto)" inmediatamente después del texto de la opción correcta.
- En --BIBLIOGRAFIA-- lista las referencias en formato APA en texto plano, una referencia por línea y añade una URL editorial o de búsqueda al final de cada línea si aplica.
- En --BIBLIOGRAFIA-- lista las referencias en formato APA en texto plano, una referencia por línea. Es OBLIGATORIO que cada línea siga exactamente esta estructura:
  <Referencia APA> | <URL>   (por ejemplo: Pérez, J. (2020). Título. Editorial. | https://editorial.example/obra)
  Si no existe una URL directa, escribe: <Referencia APA> | NO_LINK
  No uses más de un carácter "|" por línea. Evita agregar texto adicional fuera de la estructura indicada. Si la fuente debe buscarse, incluye NO_LINK y el cliente generará un enlace de búsqueda.

Responde únicamente con las secciones delimitadas y su contenido en texto plano; no añadas explicaciones, encabezados extra ni JSON.`;

  const body = {
    model: 'openai/gpt-oss-20b',
    messages: [
      { role: 'system', content: 'Eres un asistente que genera guías de estudio para docentes. Responde solo con las secciones pedidas en texto plano, sin JSON ni explicaciones.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 4000,
    temperature: 0.2
  };

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) {
    let errMsg = 'Error en la API de Groq';
    if (data?.error) errMsg = JSON.stringify(data.error);
    throw new Error(errMsg);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No se recibió contenido de la API');
  // Log the raw content for debugging (developer console)
  try { console.debug('[groqService] content:', content) } catch (e) {console.log(e);}

  // Extraer secciones delimitadas de forma robusta.
  const sectionNames = ['DATOS','DESARROLLO','ACTIVIDADES','RUBRICA','AUTOEVALUACION','BIBLIOGRAFIA'];
  const sections = {}
  // Inicializar con vacíos
  for (const n of sectionNames) sections[n.toLowerCase()] = ''

  // Buscar todas las líneas que parezcan delimitadores: -- ANY TEXT --
  // Usamos una regex multilínea para capturar la etiqueta y su posición.
  const delimRe = /^--\s*([^-]+?)\s*--\s*$/gim
  const matches = []
  let m
  while ((m = delimRe.exec(content)) !== null) {
    matches.push({ rawLabel: m[1], idx: m.index, end: delimRe.lastIndex })
  }

  if (matches.length === 0) {
    // Fallback: intentar extraer por los nombres exactos (por compatibilidad)
    for (const name of sectionNames) {
      const rx = new RegExp(`--\\s*${name}\\s*--\\s*([\\s\\S]*?)(?=--|$)`, 'i')
      const mm = content.match(rx)
      sections[name.toLowerCase()] = mm ? mm[1].trim() : ''
    }
    return sections
  }

  // Normalizar función: quitar diacríticos y espacios, pasar a mayúsculas
  const normalizeLabel = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/\s+/g, '')
  const normTargets = sectionNames.map(n => ({ name: n, norm: normalizeLabel(n) }))

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]
    const start = cur.end
    const end = i + 1 < matches.length ? matches[i + 1].idx : content.length
    const raw = cur.rawLabel.trim()
    const norm = normalizeLabel(raw)
    // intentar mapear la etiqueta encontrada a una de las secciones esperadas
    let mapped = null
    for (const t of normTargets) {
      if (norm.includes(t.norm) || t.norm.includes(norm)) {
        mapped = t.name.toLowerCase()
        break
      }
    }
    if (mapped) {
      sections[mapped] = content.slice(start, end).trim()
    }
  }

  // Además, parsear la sección de bibliografía en un array estructurado
  // Cada línea esperada: "<Referencia APA> | <URL>" o "<Referencia APA> | NO_LINK"
  const bibRaw = sections['bibliografia'] || ''
  const bibLines = bibRaw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const urlRe = /(https?:\/\/[^\s]+)/i
  const bibliografia_items = bibLines.map(line => {
    let text = line
    let link = null

    // Preferir el separador '|' si existe
    if (line.includes('|')) {
      const parts = line.split('|')
      // unir todo menos el último por si la referencia contiene '|' accidentalmente
      text = parts.slice(0, -1).join('|').trim()
      const maybeLink = parts[parts.length - 1].trim()
      if (maybeLink && maybeLink.toUpperCase() !== 'NO_LINK') {
        link = maybeLink
      }
    } else {
      // intentar extraer URL inline si no usan '|'
      const m2 = line.match(urlRe)
      if (m2) {
        link = m2[1]
        text = line.replace(m2[0], '').trim()
      }
    }

    // Si no hay link explícito, crear un enlace de búsqueda para facilitar la apertura desde el viewer
    if (!link) {
      const q = encodeURIComponent(text || '')
      link = `https://www.google.com/search?q=${q}`
    }

    return { text: text || line, link }
  })

  // Añadir la estructura parseada al objeto devuelto para que GuideForm/GuideViewer la consuman
  sections['bibliografia_items'] = bibliografia_items

  return sections
}

export default generateGuide;
