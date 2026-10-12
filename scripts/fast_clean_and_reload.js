/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const pratPath = "/Users/MiquelNadalGaya/Desktop/MAIK/Planificació AE PRAT 25-26.xlsm";

console.log(`\n================================================================`);
console.log(` Filtrando E, PAL, PV, PL, V, PAV de Eventos 1 a 6`);
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
  const { data: dbJugadores } = await supabase
    .from('jugadores')
    .select('id, nombre, apodo, cor_id, equipo');

  const jugadorByNombre = new Map();
  (dbJugadores || []).forEach(j => {
    jugadorByNombre.set(norm(j.nombre), j.id);
    if (j.apodo) jugadorByNombre.set(norm(j.apodo), j.id);
  });

  const syncDataPath = '/Users/MiquelNadalGaya/web/public/calendar_sync_data.json';
  let existingData = { eventosBloquesMap: {}, playerEventsMap: {}, playerMinutesMap: {} };
  if (fs.existsSync(syncDataPath)) {
    try {
      existingData = JSON.parse(fs.readFileSync(syncDataPath, 'utf8'));
    } catch (e) {}
  }

  // Filtrar existentes para eliminar cualquier entrada con los códigos excluidos
  const cleanBloques = {};
  for (const [key, block] of Object.entries(existingData.eventosBloquesMap || {})) {
    const tipoUpper = (block.tipo || '').trim().toUpperCase();
    if (!EXCLUDED_SPECIFIC_CODES.has(tipoUpper)) {
      cleanBloques[key] = block;
    }
  }

  const cleanPlayerEvents = {};
  for (const [key, val] of Object.entries(existingData.playerEventsMap || {})) {
    const valUpper = String(val).trim().toUpperCase();
    if (!EXCLUDED_SPECIFIC_CODES.has(valUpper)) {
      cleanPlayerEvents[key] = val;
    }
  }

  const cleanPlayerMinutes = { ...(existingData.playerMinutesMap || {}) };

  // Re-procesar AE Prat asegurando que no entren los excluidos
  console.log(`Leyendo BBDD de AE Prat: ${pratPath}...`);
  const wb = XLSX.readFile(pratPath, { cellDates: false, sheets: ['BBDD'] });
  const wsBBDD = wb.Sheets['BBDD'];
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

  let addedBlocks = 0;
  let addedPlayerEvs = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const iso = excelDateToISO(r[hFechaIdx]);
    if (!iso) continue;
    const tipoEv = r[hTipoEvIdx];
    if (!tipoEv) continue;

    const tipoTrim = String(tipoEv).trim();
    const tipoUpper = tipoTrim.toUpperCase();

    // FILTRO ESTRICTO: Excluir macro eventos
    if (EXCLUDED_SPECIFIC_CODES.has(tipoUpper)) {
      continue;
    }

    const numEv = Number(r[hNumEvIdx] || 1);
    const slotIdx = Math.max(0, Math.min(5, numEv - 1));
    const rawJugador = r[hJugIdx];
    const jNameNorm = norm(rawJugador);

    const blockKey = `${iso}_slot_${slotIdx}`;
    if (!cleanBloques[blockKey]) {
      cleanBloques[blockKey] = {
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
      addedBlocks++;
    }

    if (jNameNorm && jNameNorm !== 'TEAM') {
      const jugadorId = jugadorByNombre.get(jNameNorm);
      if (jugadorId) {
        const realiza = norm(r[hRealizaIdx]);
        const duracion = r[hDurIdx] ? String(r[hDurIdx]).trim() : '';

        const playerKey = `${jugadorId}_${iso}_ev_${iso}_${slotIdx}`;
        cleanPlayerEvents[playerKey] = realiza === 'NO' ? 'NO' : tipoTrim;

        if (duracion) {
          cleanPlayerMinutes[playerKey] = {
            minutos: duracion,
            realiza: realiza !== 'NO',
            manual: false
          };
        }
        addedPlayerEvs++;
      }
    }
  }

  const finalData = {
    eventosBloquesMap: cleanBloques,
    playerEventsMap: cleanPlayerEvents,
    playerMinutesMap: cleanPlayerMinutes
  };

  fs.writeFileSync(syncDataPath, JSON.stringify(finalData, null, 2));

  console.log(`\n✓ Archivo public/calendar_sync_data.json actualizado.`);
  console.log(`  - Bloques de eventos específicos totales: ${Object.keys(cleanBloques).length}`);
  console.log(`  - Asignaciones individuales totales: ${Object.keys(cleanPlayerEvents).length}`);
  console.log(`  - Eventos E, PAL, PV, PL, V, PAV completamente eliminados de los eventos específicos.`);
}

run().catch(console.error);
