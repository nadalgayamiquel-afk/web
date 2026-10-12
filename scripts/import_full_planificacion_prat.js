/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const filePath = process.argv[2] || "/Users/MiquelNadalGaya/Desktop/MAIK/Planificació AE PRAT 25-26.xlsm";

console.log(`\n======================================================`);
console.log(` Importación Completa de Planificación - AE Prat 25-26`);
console.log(` Archivo: ${filePath}`);
console.log(`======================================================\n`);

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Abriendo archivo Excel (hojas Deportistas, Planificacion y BBDD)...');
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
  // 1. Obtener y mapear deportistas de AE Prat
  console.log('1. Verificando deportistas de AE Prat...');
  const wsDep = wb.Sheets['Deportistas'];
  const depRows = XLSX.utils.sheet_to_json(wsDep, { header: 1 });
  
  // Mapa de dorsal/cor_id a jugador_id
  const jugadorByDorsal = new Map();
  const jugadorByNombre = new Map();

  const { data: dbJugadores, error: errJug } = await supabase
    .from('jugadores')
    .select('id, nombre, apodo, cor_id, equipo')
    .eq('equipo', 'AE Prat');

  if (errJug || !dbJugadores) {
    console.error('Error obteniendo jugadores:', errJug);
    process.exit(1);
  }

  console.log(`Jugadores de AE Prat en BD: ${dbJugadores.length}`);
  dbJugadores.forEach(j => {
    if (j.cor_id) jugadorByDorsal.set(Number(j.cor_id), j.id);
    
    jugadorByNombre.set(norm(j.nombre), j.id);
    if (j.apodo) jugadorByNombre.set(norm(j.apodo), j.id);
  });

  // 2. Extraer cuadrante de Planificación (364 días)
  console.log('\n2. Procesando cuadrante de la hoja "Planificacion"...');
  const wsPlan = wb.Sheets['Planificacion'];
  const planRows = XLSX.utils.sheet_to_json(wsPlan, { header: 1 });

  const dateRow = planRows[8]; // Fila 8: Fechas
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

    const mainEvent = evAm || evPm || (rival ? "P" : null);

    sesionesMap.set(iso, {
      fecha: iso,
      equipo: 'AE Prat',
      periodo: periodo ? String(periodo).trim() : null,
      subperiodo: subperiodo ? String(subperiodo).trim() : null,
      md: md ? String(md).trim() : null,
      rival: rival ? String(rival).trim() : null,
      evento_am: evAm ? String(evAm).trim() : null,
      evento_pm: evPm ? String(evPm).trim() : null,
      
      carga,
      volumen,
      intensidad,
      comentario_microciclo: comMicro ? String(comMicro).trim() : null,
    });
  }

  console.log(`Total días extraídos del cuadrante de Planificación: ${sesionesMap.size}`);

  // 3. Upsert sesiones_dia para AE Prat
  console.log('Guardando las 364 sesiones_dia en Supabase...');
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

  // 4. Extraer disponibilidades por jugador de la hoja Planificación (Filas 21 a 47)
  console.log('\n3. Procesando disponibilidades diarias por jugador desde Planificación...');
  const estadoDiarioMap = new Map(); // key: `${jugadorId}_${fechaISO}`

  // Mapeo directo fila -> dorsal (Fila 21 = dorsal 1, ..., Fila 47 = dorsal 27)
  for (let r = 21; r <= 47; r++) {
    const dorsal = r - 20;
    const row = planRows[r];
    if (!row) continue;

    const rowName = norm(row[9] || row[8] || row[7] || "");
    const jugadorId = jugadorByDorsal.get(dorsal) || jugadorByNombre.get(rowName);

    if (!jugadorId) {
      console.warn(`  ! No se encontró jugador para fila ${r} (dorsal ${dorsal}, nombre ${rowName})`);
      continue;
    }

    for (const [colIdx, fechaISO] of colToDateMap.entries()) {
      const val = row[colIdx];
      if (val === undefined || val === null || val === "" || val === false) continue;

      const code = String(val).trim().toUpperCase();
      const key = `${jugadorId}_${fechaISO}`;
      
      estadoDiarioMap.set(key, {
        jugador_id: jugadorId,
        fechaISO,
        disponibilidad: code,
      });
    }
  }

  console.log(`Disponibilidades extraídas del cuadrante: ${estadoDiarioMap.size}`);

  // 5. Enriquecer con comentarios de la hoja BBDD (médicos, lesiones, objetivos, etc.)
  console.log('\n4. Enriqueciendo con comentarios y objetivos de la hoja BBDD...');
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
    if (row[hObjIdx]) prev.objetivo = String(row[hObjIdx]).trim();
    if (row[hLesIdx]) prev.comentario_lesiones = String(row[hLesIdx]).trim();
    if (row[hMedIdx]) prev.comentario_medico = String(row[hMedIdx]).trim();
    if (row[hNutIdx]) prev.comentario_nutricion = String(row[hNutIdx]).trim();
    if (row[hFisIdx]) prev.comentario_fisico = String(row[hFisIdx]).trim();
    if (row[hTecIdx]) prev.comentario_tecnico = String(row[hTecIdx]).trim();

    estadoDiarioMap.set(key, prev);
  }

  console.log(`Total registros consolidados de estado_diario: ${estadoDiarioMap.size}`);

  // 6. Insertar estado_diario_jugador en Supabase
  const estadosToInsert = [];
  for (const item of estadoDiarioMap.values()) {
    const sesionId = sesionIdPorFecha.get(item.fechaISO);
    if (!sesionId) continue;
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

  // Eliminar estados antiguos de AE Prat antes de reinsertar completos para evitar duplicados
  const pratJugadorIds = Array.from(new Set(dbJugadores.map(j => j.id)));
  console.log('Limpiando estados diarios previos de AE Prat para reemplazo limpio...');
  for (let i = 0; i < pratJugadorIds.length; i += 10) {
    const chunkIds = pratJugadorIds.slice(i, i + 10);
    await supabase.from('estado_diario_jugador').delete().in('jugador_id', chunkIds);
  }

  console.log(`Insertando ${estadosToInsert.length} estados diarios completos en lotes de 500...`);
  for (let i = 0; i < estadosToInsert.length; i += 500) {
    const chunk = estadosToInsert.slice(i, i + 500);
    const { error } = await supabase.from('estado_diario_jugador').insert(chunk);
    if (error) console.error(`Error lote ${i}:`, error.message);
  }

  console.log(`\n✓ Planificación completa de AE Prat (364 días) importada con éxito.\n`);
}

run().catch(console.error);
