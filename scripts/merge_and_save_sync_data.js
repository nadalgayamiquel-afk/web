/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const filePath = process.argv[2] || "/Users/MiquelNadalGaya/Desktop/MAIK/Planificació AE PRAT 25-26.xlsm";

console.log(`\n================================================================`);
console.log(` Generando bloques de Evento 1 a 6 y asignaciones de jugadores`);
console.log(` AE Prat 25-26 | Archivo: ${filePath}`);
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

  const jugadorByNombre = new Map();
  dbJugadores.forEach(j => {
    jugadorByNombre.set(norm(j.nombre), j.id);
    if (j.apodo) jugadorByNombre.set(norm(j.apodo), j.id);
  });

  // 2. Leer BBDD
  const wb = XLSX.readFile(filePath, { cellDates: false, sheets: ['BBDD'] });
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

  const syncDataPath = '/Users/MiquelNadalGaya/web/public/calendar_sync_data.json';
  let existingData = { eventosBloquesMap: {}, playerEventsMap: {}, playerMinutesMap: {} };
  if (fs.existsSync(syncDataPath)) {
    try {
      existingData = JSON.parse(fs.readFileSync(syncDataPath, 'utf8'));
    } catch (e) {}
  }

  const eventosBloquesMap = { ...(existingData.eventosBloquesMap || {}) };
  const playerEventsMap = { ...(existingData.playerEventsMap || {}) };
  const playerMinutesMap = { ...(existingData.playerMinutesMap || {}) };

  let totalBloquesPrat = 0;
  let totalPlayerEventsPrat = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const iso = excelDateToISO(r[hFechaIdx]);
    if (!iso) continue;
    const tipoEv = r[hTipoEvIdx];
    if (!tipoEv) continue;

    const numEv = Number(r[hNumEvIdx] || 1);
    const slotIdx = Math.max(0, Math.min(5, numEv - 1));
    const rawJugador = r[hJugIdx];
    const jNameNorm = norm(rawJugador);

    // 1. Guardar bloque de evento diario
    const blockKey = `${iso}_slot_${slotIdx}`;
    if (!eventosBloquesMap[blockKey]) {
      eventosBloquesMap[blockKey] = {
        id: blockKey,
        day_id: `d_${iso}`,
        fecha: iso,
        slot: slotIdx,
        tipo: String(tipoEv).trim(),
        hora: r[hHoraIdx] ? String(r[hHoraIdx]).trim() : '',
        lugar: r[hLugarIdx] ? String(r[hLugarIdx]).trim() : '',
        duracion: r[hDurIdx] ? String(r[hDurIdx]).trim() : '',
        orientacion: r[hOrientIdx] ? String(r[hOrientIdx]).trim() : '',
        carga: r[hCargaIdx] ? String(r[hCargaIdx]).trim() : '',
        comentario: r[hComEvIdx] ? String(r[hComEvIdx]).trim() : '',
        num_jugadores: r[hNumJugIdx] ? String(r[hNumJugIdx]).trim() : ''
      };
      totalBloquesPrat++;
    }

    // 2. Guardar asignación del jugador si no es 'TEAM'
    if (jNameNorm && jNameNorm !== 'TEAM') {
      const jugadorId = jugadorByNombre.get(jNameNorm);
      if (jugadorId) {
        const realiza = norm(r[hRealizaIdx]);
        const duracion = r[hDurIdx] ? String(r[hDurIdx]).trim() : '';

        const playerKey = `${jugadorId}_${iso}_ev_${iso}_${slotIdx}`;
        playerEventsMap[playerKey] = realiza === 'NO' ? 'NO' : String(tipoEv).trim();

        if (duracion) {
          playerMinutesMap[playerKey] = {
            minutos: duracion,
            realiza: realiza !== 'NO',
            manual: false
          };
        }

        totalPlayerEventsPrat++;
      }
    }
  }

  const finalData = {
    eventosBloquesMap,
    playerEventsMap,
    playerMinutesMap
  };

  fs.writeFileSync(syncDataPath, JSON.stringify(finalData, null, 2));

  console.log(`\n✓ Archivo public/calendar_sync_data.json actualizado.`);
  console.log(`  - Nuevos bloques de eventos diarios (AE Prat): ${totalBloquesPrat}`);
  console.log(`  - Total bloques de eventos en el sistema: ${Object.keys(eventosBloquesMap).length}`);
  console.log(`  - Total asignaciones individuales de eventos a jugadores: ${Object.keys(playerEventsMap).length}\n`);
}

run().catch(console.error);
