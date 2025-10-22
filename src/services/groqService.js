// Servicio Groq para 29-guia-estudio
export async function generateGuide(payload, groqApiKey) {
  // payload: { subject, unit, topics: [], startWeek }
  if (groqApiKey) {
    localStorage.setItem('groqApiKey', groqApiKey);
  }
  const apiKey = localStorage.getItem('groqApiKey') || '';
  if (!apiKey) throw new Error('No se ha registrado la API Key de Groq.');

  const { subject, unit, topics = [], startWeek } = payload;
  const topicsList = topics.map((t, i) => `${i+1}. ${t}`).join('\n');

  // (replaced by the more specific prompt below)

  // Reforzar instrucciones sobre la rúbrica: exactamente 4 criterios y 3 niveles fijos.
  const prompt = `Genera una guía de estudio dividida en secciones claramente delimitadas por etiquetas de texto plano (NO JSON, NO Markdown obligatorio). Usa los delimitadores exactamente así (en mayúsculas entre dos guiones cada uno) y responde solo con esas secciones y su texto plano:
--DATOS--
--DESARROLLO--
--ACTIVIDADES--
--RUBRICA--
--AUTOEVALUACION--
--BIBLIOGRAFIA--

Datos de entrada:
Asignatura: ${subject}
Unidad de estudio: ${unit}
Temas (máximo 4):
${topicsList}
Semana de inicio para las actividades: ${startWeek}

Instrucciones (texto plano):
- En --DESARROLLO-- escribe un párrafo extendido que describa la unidad (un solo párrafo sin saltos de línea).
- En --ACTIVIDADES-- genera una actividad por cada tema. Para cada actividad la descripción de la tarea, formato de entrega, fecha de entrega (por ejemplo: Semana 1, Semana 2, ...) y una fuente bibliográfica en formato APA (preferentemente en español cuando exista). Entrega la información en texto plano, separando actividades con líneas en blanco.
- En --RUBRICA-- entrega EXACTAMENTE 4 criterios. Para cada criterio proporciona tres niveles con estos títulos exactos: "Muy bien", "Bien", "En progreso". No añadas valores numéricos ni puntuaciones dentro de las descripciones de nivel (por ejemplo, NO escribas "(4 puntos)" ni "2.5 pts" dentro de las descripciones). Las puntuaciones numéricas ya están definidas en el formato de tabla del front-end; no las repitas en el texto. Puedes entregar la rúbrica como una tabla simple usando barras verticales (|) o como bloques etiquetados, pero asegúrate de que haya 4 criterios (pero no incluyas uno relacionado a trabajo en equipo porque la actividad es individual) y 3 niveles por criterio.
- En --AUTOEVALUACION-- entrega 10 preguntas de opción múltiple en texto plano; para cada pregunta incluye opciones A-D y especifica la respuesta correcta entre paréntesis al final (ej.: "(C) correcto").
- En --BIBLIOGRAFIA-- lista las referencias en formato APA en texto plano.

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

  // Extraer secciones delimitadas
  const sections = {};
  const sectionNames = ['DATOS','DESARROLLO','ACTIVIDADES','RUBRICA','AUTOEVALUACION','BIBLIOGRAFIA'];
    for (const name of sectionNames) {
      // Usar patrón con clases de caracteres como cadena literal para evitar escapes innecesarios en el linter
      const lookahead = `--(?:${sectionNames.join('|')})--|$`;
      const pattern = `--${name}--\\s*([\\s\\S]*?)(?=${lookahead})`;
      const rx = new RegExp(pattern, 'i');
      const m = content.match(rx);
      sections[name.toLowerCase()] = m ? m[1].trim() : '';
    }

  return sections;
}

export default generateGuide;
