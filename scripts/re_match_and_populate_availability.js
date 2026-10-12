/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const filePath = process.argv[2] || "/Users/MiquelNadalGaya/Desktop/MAIK/Planificació AE PRAT 25-26.xlsm";

console.log(`\n================================================================`);
console.log(` Re-matching Exacto de Nombres, Apodos y Disponibilidad AE Prat`);
console.log(` Archivo: ${filePath}`);
console.log(`================================================================\n`);

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan credenciales Supabase en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function excelDateToISO(v) {
  if (!v) return null;
  if (typeof v === 'number' && v > 40000) {
    const p = XLSX.SSF.parse_date_code(v);
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }
  return String(v).trim();
}

const norm = (s) => (s || '').toString().trim().toUpperCase();

// Tabla de mapeo exacto de los 27 jugadores (Dorsal 1 a 27)
const DORSAL_PLAYERS_MAP = {
  1:  { nombre: 'DANI GUISERIS',     apodo: 'GUISERIS' },
  2:  { nombre: 'GUILLEM COVES',     apodo: 'WILLY' },
  3:  { nombre: 'DAVID ADÁN',        apodo: 'DAVID' },
  4:  { nombre: 'RUBÉN GÓMEZ',       apodo: 'RUBEN' },
  5:  { nombre: 'POL ALDABO',        apodo: 'POL' },
  6:  { nombre: 'CARLOS GARCÍA',     apodo: 'CARLOS G' },
  7:  { nombre: 'JORDI BUYREU',      apodo: 'BUYREU' },
  8:  { nombre: 'DAVID HIDALGO',     apodo: 'HIDALGO' },
  9:  { nombre: 'MARC MUÑOZ',        apodo: 'MARC M' },
  10: { nombre: 'ROGER PEÑA',        apodo: 'PEÑA' },
  11: { nombre: 'ALEX SÁNCHEZ',      apodo: 'SANCHEZ' },
  12: { nombre: 'GUSTAVO REINKE',    apodo: 'GUS' },
  13: { nombre: 'ABEL CORTINA',      apodo: 'ABEL' },
  14: { nombre: 'NICO CUEVAS',       apodo: 'NICO' },
  15: { nombre: 'ADRI TORO',         apodo: 'TORO' },
  16: { nombre: 'XAVI PLUVINS',      apodo: 'PLUVINS' },
  17: { nombre: 'MARTIN VALERIEV',   apodo: 'VALERIEV' },
  18: { nombre: 'MARC FONT',         apodo: 'FONT' },
  19: { nombre: 'DANI BONAVENTURA',  apodo: 'BONA' },
  20: { nombre: 'XAVI VICTOR',       apodo: 'XAVI V' },
  21: { nombre: 'ALEX PLAZA',        apodo: 'PLAZA' },
  22: { nombre: 'MARTIN LAMELAS',    apodo: 'LAMELAS' },
  23: { nombre: 'MARC PADILLA',      apodo: 'PADILLA' },
  24: { nombre: 'RICKI VIDAL',       apodo: 'RIKI' },
  25: { nombre: 'ADRI RIVAS',        apodo: 'RIVAS' },
  26: { nombre: 'ALEJANDRO ARCHS',   apodo: 'ARCHS' },
  27: { nombre: 'PABLO UFANO',       apodo: 'UFANO' },
};

async function run() {
  // 1. Actualizar apodos y dorsales en Supabase para los 27 jugadores
  console.log('1. Verificando y actualizando jugadores en Supabase...');
  const { data: dbJugadores, error: errJug } = await supabase
    .from('jugadores')
    .select('id, nombre, apodo, cor_id, equipo')
    .eq('equipo', 'AE Prat');

  if (errJug || !dbJugadores) {
    console.error('Error obteniendo jugadores:', errJug);
    process.exit(1);
  }

  const jugadorIdByDorsal = new Map();

  for (const j of dbJugadores) {
    const dorsalNum = Number(j.cor_id);
    const meta = DORSAL_PLAYERS_MAP[dorsalNum];
    if (meta) {
      jugadorIdByDorsal.set(dorsalNum, j.id);
      // Asegurar que nombre y apodo son exactos
      if (j.apodo !== meta.apodo) {
        await supabase
          .from('jugadores')
          .update({ apodo: meta.apodo, nombre: meta.nombre })
          .eq('id', j.id);
        console.log(`  -> Actualizado dorsal ${dorsalNum}: "${meta.nombre}" (Apodo: "${meta.apodo}")`);
      }
    }
  }

  // 2. Obtener sesiones_dia de AE Prat por fecha
  const { data: sesiones } = await supabase
    .from('sesiones_dia')
    .select('id, fecha')
    .eq('equipo', 'AE Prat');

  const sesionIdPorFecha = new Map();
  (sesiones || []).forEach(s => sesionIdPorFecha.set(s.fecha, s.id));
  console.log(`Sesiones de AE Prat disponibles: ${sesionIdPorFecha.size}`);

  // 3. Extraer disponibilidades fila a fila de Planificacion
  console.log('\n2. Extrayendo cuadrante exacto de Planificacion (Filas 21 a 47)...');
  const wb = XLSX.readFile(filePath, { cellDates: false, sheets: ['Planificacion', 'BBDD'] });
  const wsPlan = wb.Sheets['Planificacion'];
  const planRows = XLSX.utils.sheet_to_json(wsPlan, { header: 1 });
  const dateRow = planRows[8];

  const colToDateMap = new Map();
  for (let c = 10; c < dateRow.length; c++) {
    const rawDate = dateRow[c];
    if (!rawDate) continue;
    const iso = excelDateToISO(rawDate);
    if (iso) colToDateMap.set(c, iso);
  }

  const estadoDiarioMap = new Map(); // key: `${jugadorId}_${fechaISO}`

  for (let r = 21; r <= 47; r++) {
    const dorsal = r - 20;
    const jugadorId = jugadorIdByDorsal.get(dorsal);
    const meta = DORSAL_PLAYERS_MAP[dorsal];

    if (!jugadorId) {
      console.warn(`  ! No se encontró jugadorId para dorsal ${dorsal}`);
      continue;
    }

    const row = planRows[r] || [];
    let countPlayer = 0;

    for (const [colIdx, fechaISO] of colToDateMap.entries()) {
      const val = row[colIdx];
      if (val === undefined || val === null || val === "" || val === false) continue;

      const code = String(val).trim().toUpperCase();
      const key = `${jugadorId}_${fechaISO}`;

      estadoDiarioMap.set(key, {
        jugador_id: jugadorId,
        fechaISO,
        disponibilidad: code,
        objetivo: null,
        comentario_lesiones: null,
        comentario_medico: null,
        comentario_nutricion: null,
        comentario_fisico: null,
        comentario_tecnico: null,
      });
      countPlayer++;
    }

    console.log(`  -> Fila ${r} | Dorsal ${String(dorsal).padStart(2, ' ')} | ${meta.nombre.padEnd(20, ' ')} (${meta.apodo.padEnd(10, ' ')}) : ${countPlayer} disponibilidades`);
  }

  // 4. Enriquecer con notas de celdas de Planificación
  for (const cellKey in wsPlan) {
    if (cellKey.startsWith('!')) continue;
    const cell = wsPlan[cellKey];
    if (cell && cell.c && cell.c.length > 0) {
      const decoded = XLSX.utils.decode_cell(cellKey);
      const r = decoded.r;
      const c = decoded.c;
      if (r >= 21 && r <= 47) {
        const dorsal = r - 20;
        const jugadorId = jugadorIdByDorsal.get(dorsal);
        const fechaISO = colToDateMap.get(c);
        const noteText = cell.c.map(item => item.t || item).join(' ').trim();

        if (jugadorId && fechaISO && noteText) {
          const key = `${jugadorId}_${fechaISO}`;
          const current = estadoDiarioMap.get(key) || { jugador_id: jugadorId, fechaISO, disponibilidad: null };

          const textNorm = noteText.toLowerCase();
          if (textNorm.includes('[les]') || textNorm.includes('isquio') || textNorm.includes('rodilla') || textNorm.includes('molestia') || textNorm.includes('lesion') || textNorm.includes('pinchazo')) {
            current.comentario_lesiones = current.comentario_lesiones ? `${current.comentario_lesiones}\n${noteText}` : noteText;
          } else if (textNorm.includes('gimnasio') || textNorm.includes('cargado') || textNorm.includes('fatiga') || textNorm.includes('fisic')) {
            current.comentario_fisico = current.comentario_fisico ? `${current.comentario_fisico}\n${noteText}` : noteText;
          } else {
            current.comentario_medico = current.comentario_medico ? `${current.comentario_medico}\n${noteText}` : noteText;
          }
          estadoDiarioMap.set(key, current);
        }
      }
    }
  }

  // 5. Enriquecer con comentarios de la hoja BBDD
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

  // Mapa nombre/apodo -> jugadorId
  const jugadorByAnyName = new Map();
  for (const [dorsal, meta] of Object.entries(DORSAL_PLAYERS_MAP)) {
    const jId = jugadorIdByDorsal.get(Number(dorsal));
    if (jId) {
      jugadorByAnyName.set(norm(meta.nombre), jId);
      jugadorByAnyName.set(norm(meta.apodo), jId);
    }
  }

  for (let i = 1; i < bbddRows.length; i++) {
    const row = bbddRows[i];
    if (!row) continue;
    const rawJugador = row[hJugIdx];
    const rawFecha = row[hFechaIdx];
    if (!rawJugador || !rawFecha || norm(rawJugador) === 'TEAM') continue;

    const fechaISO = excelDateToISO(rawFecha);
    if (!fechaISO) continue;

    const jugadorId = jugadorByAnyName.get(norm(rawJugador));
    if (!jugadorId) continue;

    const key = `${jugadorId}_${fechaISO}`;
    const prev = estadoDiarioMap.get(key) || { jugador_id: jugadorId, fechaISO, disponibilidad: null };

    if (row[hDispIdx] && !prev.disponibilidad) prev.disponibilidad = String(row[hDispIdx]).trim().toUpperCase();
    if (row[hObjIdx]) prev.objetivo = prev.objetivo ? `${prev.objetivo}\n${row[hObjIdx]}` : String(row[hObjIdx]).trim();
    if (row[hLesIdx]) prev.comentario_lesiones = prev.comentario_lesiones ? `${prev.comentario_lesiones}\n${row[hLesIdx]}` : String(row[hLesIdx]).trim();
    if (row[hMedIdx]) prev.comentario_medico = prev.comentario_medico ? `${prev.comentario_medico}\n${row[hMedIdx]}` : String(row[hMedIdx]).trim();
    if (row[hNutIdx]) prev.comentario_nutricion = String(row[hNutIdx]).trim();
    if (row[hFisIdx]) prev.comentario_fisico = prev.comentario_fisico ? `${prev.comentario_fisico}\n${row[hFisIdx]}` : String(row[hFisIdx]).trim();
    if (row[hTecIdx]) prev.comentario_tecnico = prev.comentario_tecnico ? `${prev.comentario_tecnico}\n${row[hTecIdx]}` : String(row[hTecIdx]).trim();

    estadoDiarioMap.set(key, prev);
  }

  // 6. Insertar en estado_diario_jugador en Supabase
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

  const allPratJugadorIds = Array.from(jugadorIdByDorsal.values());
  console.log(`\nLimpiando estados previos de AE Prat (${allPratJugadorIds.length} jugadores)...`);
  for (let i = 0; i < allPratJugadorIds.length; i += 10) {
    const chunkIds = allPratJugadorIds.slice(i, i + 10);
    await supabase.from('estado_diario_jugador').delete().in('jugador_id', chunkIds);
  }

  console.log(`Insertando ${estadosToInsert.length} estados diarios consolidados...`);
  for (let i = 0; i < estadosToInsert.length; i += 500) {
    const chunk = estadosToInsert.slice(i, i + 500);
    const { error } = await supabase.from('estado_diario_jugador').insert(chunk);
    if (error) console.error(`Error lote ${i}:`, error.message);
  }

  console.log(`\n================================================================`);
  console.log(`✓ Re-matching y carga completada con éxito.`);
  console.log(`  - Total estados diarios insertados: ${estadosToInsert.length}`);
  console.log(`================================================================\n`);
}

run().catch(console.error);
