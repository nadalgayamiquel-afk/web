/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const pratPath = "/Users/MiquelNadalGaya/Desktop/MAIK/Planificació AE PRAT 25-26.xlsm";
const manresaPath = "/Users/MiquelNadalGaya/web/planificacion_manresa.xlsm";

console.log(`\n================================================================`);
console.log(` Limpiando eventos E, PAL, PV, PL, V, PAV de Eventos 1 a 6`);
console.log(` y recargando eventos específicos limpios`);
console.log(`================================================================\n`);

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan credenciales Supabase en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const EXCLUDED_SPECIFIC_CODES = new Set(['E', 'PAL', 'PV', 'PL', 'V', 'PAV']);

function excelDateToISO(v) {
  if (!v) return null;
  if (typeof v === 'number' && v > 40000) {
    const p = XLSX.SSF.parse_date_code(v);
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }
  return String(v).trim();
}

const norm = (s) => (s || '').toString().trim().toUpperCase();

async function run() {
  // 1. Obtener jugadores de la BD
  const { data: dbJugadores, error: errJug } = await supabase
    .from('jugadores')
    .select('id, nombre, apodo, cor_id, equipo');

  if (errJug || !dbJugadores) {
    console.error('Error obteniendo jugadores:', errJug);
    process.exit(1);
  }

  const jugadorByNombre = new Map();
  dbJugadores.forEach(j => {
    jugadorByNombre.set(norm(j.nombre), j.id);
    if (j.apodo) jugadorByNombre.set(norm(j.apodo), j.id);
  });

  const eventosBloquesMap = {};
  const playerEventsMap = {};
  const playerMinutesMap = {};

  // Función para procesar un Excel (hoja BBDD)
  function processExcel(filePath, label) {
    if (!fs.existsSync(filePath)) {
      console.log(`Archivo ${filePath} no encontrado, omitiendo.`);
      return;
    }
    console.log(`Procesando ${label}: ${filePath}...`);
    const wb = XLSX.readFile(filePath, { cellDates: false, sheets: ['BBDD'] });
    const wsBBDD = wb.Sheets['BBDD'];
    if (!wsBBDD) return;

    const rows = XLSX.utils.sheet_to_json(wsBBDD, { header: 1 });
    const headers = rows[0] || [];

    const hJugIdx = headers.indexOf('Jugador');
    const hFechaIdx = headers.indexOf('Fecha');
    const hTipoEvIdx = headers.indexOf('Tipo de Evento');
    const hNumEvIdx = headers.indexOf('Nº Evento') !== -1 ? headers.indexOf('Nº Evento') : headers.indexOf('Nº EVENTO');
    const hHoraIdx = headers.indexOf('Hora del evento');
    const hLugarIdx = headers.indexOf('Lugar del evento');
    const hDurIdx = headers.indexOf('Duracion del evento');
    const hOrientIdx = headers.indexOf('Orientacion del evento') !== -1 ? headers.indexOf('Orientacion del evento') : headers.indexOf('Orientación del evento');
    const hCargaIdx = headers.indexOf('Carga del evento');
    const hComEvIdx = headers.indexOf('Comentario general evento') !== -1 ? headers.indexOf('Comentario general evento') : headers.indexOf('Comentario General Evento');
    const hNumJugIdx = headers.indexOf('Nº Jugadores Evento') !== -1 ? headers.indexOf('Nº Jugadores Evento') : headers.indexOf('Nº Jugadores evento');
    const hRealizaIdx = headers.indexOf('Realiza Evento') !== -1 ? headers.indexOf('Realiza Evento') : headers.indexOf('Realiza evento');

    let countBlocks = 0;
    let countPlayerEvs = 0;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const iso = excelDateToISO(r[hFechaIdx]);
      if (!iso) continue;
      const tipoEv = r[hTipoEvIdx];
      if (!tipoEv) continue;

      const tipoTrim = String(tipoEv).trim();
      const tipoUpper = tipoTrim.toUpperCase();

      // FILTRAR EVENTOS EXCLUIDOS: E, PAL, PV, PL, V, PAV
      if (EXCLUDED_SPECIFIC_CODES.has(tipoUpper)) {
        continue;
      }

      const numEv = Number(r[hNumEvIdx] || 1);
      const slotIdx = Math.max(0, Math.min(5, numEv - 1));
      const rawJugador = r[hJugIdx];
      const jNameNorm = norm(rawJugador);

      const blockKey = `${iso}_slot_${slotIdx}`;
      if (!eventosBloquesMap[blockKey]) {
        eventosBloquesMap[blockKey] = {
          id: blockKey,
          day_id: `d_${iso}`,
          fecha: iso,
          slot: slotIdx,
          tipo: tipoTrim,
          hora: r[hHoraIdx] ? String(r[hHoraIdx]).trim() : '',
          lugar: r[hLugarIdx] ? String(r[hLugarIdx]).trim() : '',
          duracion: r[hDurIdx] ? String(r[hDurIdx]).trim() : '',
          orientacion: r[hOrientIdx] ? String(r[hOrientIdx]).trim() : '',
          carga: r[hCargaIdx] ? String(r[hCargaIdx]).trim() : '',
          comentario: r[hComEvIdx] ? String(r[hComEvIdx]).trim() : '',
          num_jugadores: r[hNumJugIdx] ? String(r[hNumJugIdx]).trim() : ''
        };
        countBlocks++;
      }

      if (jNameNorm && jNameNorm !== 'TEAM') {
        const jugadorId = jugadorByNombre.get(jNameNorm);
        if (jugadorId) {
          const realiza = norm(r[hRealizaIdx]);
          const duracion = r[hDurIdx] ? String(r[hDurIdx]).trim() : '';

          const playerKey = `${jugadorId}_${iso}_ev_${iso}_${slotIdx}`;
          playerEventsMap[playerKey] = realiza === 'NO' ? 'NO' : tipoTrim;

          if (duracion) {
            playerMinutesMap[playerKey] = {
              minutos: duracion,
              realiza: realiza !== 'NO',
              manual: false
            };
          }
          countPlayerEvs++;
        }
      }
    }

    console.log(`  -> ${countBlocks} bloques específicos y ${countPlayerEvs} asignaciones procesadas en ${label}.`);
  }

  // Procesar ambos archivos
  processExcel(pratPath, 'AE Prat');
  processExcel(manresaPath, 'CE Manresa');

  // Guardar archivo public/calendar_sync_data.json
  const syncDataPath = '/Users/MiquelNadalGaya/web/public/calendar_sync_data.json';
  const finalData = {
    eventosBloquesMap,
    playerEventsMap,
    playerMinutesMap
  };

  fs.writeFileSync(syncDataPath, JSON.stringify(finalData, null, 2));

  console.log(`\n✓ Archivo public/calendar_sync_data.json guardado.`);
  console.log(`  - Total bloques de eventos específicos (Evento 1..6): ${Object.keys(eventosBloquesMap).length}`);
  console.log(`  - Total asignaciones individuales: ${Object.keys(playerEventsMap).length}`);
  console.log(`  - Filtro aplicado: Se han excluido E, PAL, PV, PL, V, PAV de los bloques específicos.`);
}

run().catch(console.error);
