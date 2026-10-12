/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const filePath = process.argv[2] || "/Users/MiquelNadalGaya/Desktop/MAIK/Planificació AE PRAT 25-26.xlsm";

console.log(`\n================================================================`);
console.log(` Importación Completa (Eventos + Comentarios + Disponibilidades)`);
console.log(` AE Prat 25-26 | Archivo: ${filePath}`);
console.log(`================================================================\n`);

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan credenciales Supabase en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Abriendo archivo Excel (Planificacion, BBDD, Deportistas)...');
const wb = XLSX.readFile(filePath, { cellDates: false, sheets: ['Deportistas', 'Planificacion', 'BBDD'] });

function excelDateToISO(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  return null;
}

const norm = (s) => (s || '').toString().trim().toUpperCase();

async function run() {
  // 1. Obtener jugadores de AE Prat
  const { data: dbJugadores, error: errJug } = await supabase
    .from('jugadores')
    .select('id, nombre, apodo, cor_id, equipo')
    .eq('equipo', 'AE Prat');

  if (errJug || !dbJugadores) {
    console.error('Error obteniendo jugadores:', errJug);
    process.exit(1);
  }

  const jugadorByDorsal = new Map();
  const jugadorByNombre = new Map();

  dbJugadores.forEach(j => {
    if (j.cor_id) jugadorByDorsal.set(Number(j.cor_id), j.id);
    jugadorByNombre.set(norm(j.nombre), j.id);
    if (j.apodo) jugadorByNombre.set(norm(j.apodo), j.id);
  });

  // 2. Extraer cuadrante de Planificación (364 días) con evento unificado en evento_am
  console.log('\n--- 1. Extrayendo sesiones y unificando Evento Principal ---');
  const wsPlan = wb.Sheets['Planificacion'];
  const planRows = XLSX.utils.sheet_to_json(wsPlan, { header: 1 });

  const dateRow = planRows[8];
  const periodoRow = planRows[4];
  const subperiodoRow = planRows[5];
  const mdRow = planRows[10];
  const rivalRow = planRows[11];
  const evAmRow = planRows[12];
  const evPmRow = planRows[13];
  const cargaRow = planRows[14];
  const volRow = planRows[15];
  const intRow = planRows[16];
  const comMicroRow = planRows[17];

  const colToDateMap = new Map();
  const sesionesMap = new Map();

  for (let c = 10; c < dateRow.length; c++) {
    const rawDate = dateRow[c];
    if (!rawDate) continue;
    const iso = excelDateToISO(rawDate);
    if (!iso) continue;

    colToDateMap.set(c, iso);

    const periodo = periodoRow ? (periodoRow[c] || null) : null;
    const subperiodo = subperiodoRow ? (subperiodoRow[c] || null) : null;
    const md = mdRow ? (mdRow[c] || null) : null;
    const rival = rivalRow ? (rivalRow[c] || null) : null;
    const evAm = evAmRow ? (evAmRow[c] || null) : null;
    const evPm = evPmRow ? (evPmRow[c] || null) : null;
    const carga = cargaRow ? (Number(cargaRow[c]) || null) : null;
    const volumen = volRow ? (Number(volRow[c]) || null) : null;
    const intensidad = intRow ? (Number(intRow[c]) || null) : null;
    const comMicro = comMicroRow ? (comMicroRow[c] || null) : null;

    // REGLA: Unificar evento AM y PM en evento_am (que es el evento principal en la web)
    const mainEvent = (evAm ? String(evAm).trim() : null) || (evPm ? String(evPm).trim() : null) || (rival ? "P" : null);

    sesionesMap.set(iso, {
      fecha: iso,
      equipo: 'AE Prat',
      periodo: periodo ? String(periodo).trim() : null,
      subperiodo: subperiodo ? String(subperiodo).trim() : null,
      md: md ? String(md).trim() : null,
      rival: rival ? String(rival).trim() : null,
      evento_am: mainEvent,
      evento_pm: evPm ? String(evPm).trim() : null,
      carga,
      volumen,
      intensidad,
      comentario_microciclo: comMicro ? String(comMicro).trim() : null,
    });
  }

  console.log(`Guardando ${sesionesMap.size} sesiones de calendario con eventos unificados...`);
  const sesionesArray = Array.from(sesionesMap.values());
  const sesionIdPorFecha = new Map();

  for (let i = 0; i < sesionesArray.length; i += 100) {
    const chunk = sesionesArray.slice(i, i + 100);
    const { data, error } = await supabase
      .from('sesiones_dia')
      .upsert(chunk, { onConflict: 'fecha' })
      .select('id, fecha');

    if (error) {
      console.error('Error insertando sesiones:', error.message);
    } else if (data) {
      data.forEach(s => sesionIdPorFecha.set(s.fecha, s.id));
    }
  }

  // 3. Extraer disponibilidades y comentarios de celdas de Planificación
  console.log('\n--- 2. Extrayendo disponibilidades y notas de celdas ---');
  const estadoDiarioMap = new Map();

  for (let r = 21; r <= 47; r++) {
    const dorsal = r - 20;
    const row = planRows[r];
    if (!row) continue;

    const rowName = norm(row[9] || row[8] || row[7] || "");
    const jugadorId = jugadorByDorsal.get(dorsal) || jugadorByNombre.get(rowName);

    if (!jugadorId) continue;

    for (const [colIdx, fechaISO] of colToDateMap.entries()) {
      const val = row[colIdx];
      const code = (val !== undefined && val !== null && val !== "" && val !== false) ? String(val).trim().toUpperCase() : null;
      
      const key = `${jugadorId}_${fechaISO}`;
      estadoDiarioMap.set(key, {
        jugador_id: jugadorId,
        fechaISO,
        disponibilidad: code,
        comentario_lesiones: null,
        comentario_medico: null,
        comentario_fisico: null,
        comentario_tecnico: null,
        comentario_wellness: null,
        objetivo: null,
      });
    }
  }

  // Extraer las 189 notas de celdas de Planificación
  let cellNotesCount = 0;
  for (const cellKey in wsPlan) {
    if (cellKey.startsWith("!")) continue;
    const cell = wsPlan[cellKey];
    if (cell && cell.c && cell.c.length > 0) {
      const decoded = XLSX.utils.decode_cell(cellKey);
      const r = decoded.r;
      const c = decoded.c;
      if (r >= 21 && r <= 47) {
        const dorsal = r - 20;
        const jugadorId = jugadorByDorsal.get(dorsal);
        const fechaISO = colToDateMap.get(c);
        const noteText = cell.c.map(item => item.t || item).join(" ").trim();

        if (jugadorId && fechaISO && noteText) {
          cellNotesCount++;
          const key = `${jugadorId}_${fechaISO}`;
          const current = estadoDiarioMap.get(key) || { jugador_id: jugadorId, fechaISO, disponibilidad: null };

          const textNorm = noteText.toLowerCase();
          if (textNorm.includes("[les]") || textNorm.includes("isquio") || textNorm.includes("rodilla") || textNorm.includes("molestia") || textNorm.includes("lesion") || textNorm.includes("pinchazo") || textNorm.includes("inflamacion")) {
            current.comentario_lesiones = current.comentario_lesiones ? `${current.comentario_lesiones}\n${noteText}` : noteText;
          } else if (textNorm.includes("gimnasio") || textNorm.includes("cargado") || textNorm.includes("fatiga") || textNorm.includes("fisic")) {
            current.comentario_fisico = current.comentario_fisico ? `${current.comentario_fisico}\n${noteText}` : noteText;
          } else {
            current.comentario_medico = current.comentario_medico ? `${current.comentario_medico}\n${noteText}` : noteText;
          }

          estadoDiarioMap.set(key, current);
        }
      }
    }
  }
  console.log(`Notas de celdas de jugadores vinculadas: ${cellNotesCount}`);

  // 4. Enriquecer con comentarios de BBDD
  console.log('\n--- 3. Enriqueciendo con comentarios de la hoja BBDD ---');
  const wsBBDD = wb.Sheets['BBDD'];
  const bbddRows = XLSX.utils.sheet_to_json(wsBBDD, { header: 1 });
  const bbddHeaders = bbddRows[0] || [];
  
  const hJugIdx = bbddHeaders.indexOf('Jugador');
  const hFechaIdx = bbddHeaders.indexOf('Fecha');
  const hObjIdx = bbddHeaders.indexOf('Objetivo');
  const hLesIdx = bbddHeaders.indexOf('Comentario Lesion');
  const hMedIdx = bbddHeaders.indexOf('Comentario Medico');
  const hNutIdx = bbddHeaders.indexOf('Comentario Nutricional');
  const hFisIdx = bbddHeaders.indexOf('Comentario Fisico');
  const hTecIdx = bbddHeaders.indexOf('Comentario Tecnico');
  const hGenEvIdx = bbddHeaders.indexOf('Comentario general evento');
  const hDispIdx = bbddHeaders.indexOf('Disponibilidad');

  for (let i = 1; i < bbddRows.length; i++) {
    const row = bbddRows[i];
    if (!row) continue;
    const rawJugador = row[hJugIdx];
    const rawFecha = row[hFechaIdx];
    if (!rawJugador || !rawFecha || norm(rawJugador) === 'TEAM') continue;

    const fechaISO = excelDateToISO(rawFecha);
    if (!fechaISO) continue;

    const jNameNorm = norm(rawJugador);
    const jugadorId = jugadorByNombre.get(jNameNorm);
    if (!jugadorId) continue;

    const key = `${jugadorId}_${fechaISO}`;
    const prev = estadoDiarioMap.get(key) || { jugador_id: jugadorId, fechaISO, disponibilidad: null };

    if (row[hDispIdx] && !prev.disponibilidad) prev.disponibilidad = String(row[hDispIdx]).trim().toUpperCase();
    if (row[hObjIdx]) prev.objetivo = prev.objetivo ? `${prev.objetivo}\n${row[hObjIdx]}` : String(row[hObjIdx]).trim();
    if (row[hLesIdx]) prev.comentario_lesiones = prev.comentario_lesiones ? `${prev.comentario_lesiones}\n${row[hLesIdx]}` : String(row[hLesIdx]).trim();
    if (row[hMedIdx]) prev.comentario_medico = prev.comentario_medico ? `${prev.comentario_medico}\n${row[hMedIdx]}` : String(row[hMedIdx]).trim();
    if (row[hGenEvIdx]) prev.comentario_medico = prev.comentario_medico ? `${prev.comentario_medico}\n${row[hGenEvIdx]}` : String(row[hGenEvIdx]).trim();
    if (row[hNutIdx]) prev.comentario_nutricion = String(row[hNutIdx]).trim();
    if (row[hFisIdx]) prev.comentario_fisico = prev.comentario_fisico ? `${prev.comentario_fisico}\n${row[hFisIdx]}` : String(row[hFisIdx]).trim();
    if (row[hTecIdx]) prev.comentario_tecnico = prev.comentario_tecnico ? `${prev.comentario_tecnico}\n${row[hTecIdx]}` : String(row[hTecIdx]).trim();

    estadoDiarioMap.set(key, prev);
  }

  // 5. Insertar en estado_diario_jugador
  const estadosToInsert = [];
  for (const item of estadoDiarioMap.values()) {
    const sesionId = sesionIdPorFecha.get(item.fechaISO);
    if (!sesionId) continue;

    // Solo insertar si tiene disponibilidad o comentarios
    const hasData = item.disponibilidad || item.objetivo || item.comentario_lesiones || item.comentario_medico || item.comentario_fisico || item.comentario_tecnico || item.comentario_nutricion;
    if (!hasData) continue;

    estadosToInsert.push({
      jugador_id: item.jugador_id,
      sesion_dia_id: sesionId,
      disponibilidad: item.disponibilidad || null,
      objetivo: item.objetivo || null,
      comentario_lesiones: item.comentario_lesiones || null,
      comentario_medico: item.comentario_medico || null,
      comentario_nutricion: item.comentario_nutricion || null,
      comentario_fisico: item.comentario_fisico || null,
      comentario_tecnico: item.comentario_tecnico || null,
    });
  }

  const pratJugadorIds = Array.from(new Set(dbJugadores.map(j => j.id)));
  console.log('Limpiando estados previos para reinserción...');
  for (let i = 0; i < pratJugadorIds.length; i += 10) {
    const chunkIds = pratJugadorIds.slice(i, i + 10);
    await supabase.from('estado_diario_jugador').delete().in('jugador_id', chunkIds);
  }

  console.log(`Insertando ${estadosToInsert.length} estados consolidados con comentarios...`);
  for (let i = 0; i < estadosToInsert.length; i += 500) {
    const chunk = estadosToInsert.slice(i, i + 500);
    const { error } = await supabase.from('estado_diario_jugador').insert(chunk);
    if (error) console.error(`Error lote ${i}:`, error.message);
  }

  console.log(`\n================================================================`);
  console.log(`✓ Importación completa finalizada.`);
  console.log(`  - 364 sesiones_dia con eventos unificados`);
  console.log(`  - ${estadosToInsert.length} registros de estado diario y comentarios`);
  console.log(`================================================================\n`);
}

run().catch(console.error);
