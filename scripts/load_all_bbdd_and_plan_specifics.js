/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const manresaExcelPath = '/Users/MiquelNadalGaya/web/planificacion_manresa.xlsm';

console.log(`\n================================================================`);
console.log(` CARGA EXACTA DE TODOS LOS EVENTOS ESPECÍFICOS DE BBDD Y PLANIFICACIÓN`);
console.log(` (Co, Op, VD, Ot, Vi, Red, PaAm, Pa)`);
console.log(`================================================================\n`);

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Faltan credenciales Supabase en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function excelDateToISO(v) {
  if (!v) return null;
  if (typeof v === 'number' && v > 40000) {
    const p = XLSX.SSF.parse_date_code(v);
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function formatExcelTimeToHHMM(rawTime) {
  if (rawTime === undefined || rawTime === null || rawTime === '') return '';
  if (typeof rawTime === 'number' && rawTime < 1) {
    const totalMinutes = Math.round(rawTime * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const s = String(rawTime).trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':');
    return `${String(h).padStart(2, '0')}:${m}`;
  }
  return s;
}

const norm = (s) => (s || '').toString().trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function standardizeCode(raw) {
  if (!raw) return '';
  const u = String(raw).trim().toUpperCase();
  if (u === 'CO') return 'Co';
  if (u === 'OP') return 'Op';
  if (u === 'VD' || u === 'VIDEO') return 'VD';
  if (u === 'VI' || u === 'VIAJE') return 'Vi';
  if (u === 'OT' || u === 'OTROS') return 'Ot';
  if (u === 'RED' || u === 'READAPTACION') return 'Red';
  if (u === 'PAAM') return 'PaAm';
  if (u === 'PA') return 'Pa';
  if (u === 'OOP') return 'Oop';
  return String(raw).trim();
}

async function main() {
  console.log('1. Leyendo Excel de Manresa...');
  const wb = XLSX.readFile(manresaExcelPath, { cellDates: false });

  // 1. Jugadores Manresa
  const { data: dbJugadores, error: errJugs } = await supabase
    .from('jugadores')
    .select('*')
    .eq('equipo', 'CE Manresa');

  if (errJugs || !dbJugadores) {
    console.error('Error cargando jugadores:', errJugs);
    process.exit(1);
  }

  const activeJugadores = dbJugadores.filter(j => j.activo);
  console.log(`Jugadores CE Manresa: ${dbJugadores.length} (Activos: ${activeJugadores.length})`);

  const jugadorMap = new Map();
  dbJugadores.forEach(j => {
    jugadorMap.set(norm(j.nombre), j.id);
    if (j.apodo) jugadorMap.set(norm(j.apodo), j.id);
    if (j.cor_id) jugadorMap.set(`dorsal_${j.cor_id}`, j.id);
  });

  const finalBloquesMap = {};
  const finalPlayerEventsMap = {};
  const finalPlayerMinutesMap = {};
  const allComentariosList = [];

  // 2. Extraer TODOS los eventos específicos de BBDD sheet
  console.log('\n2. Extrayendo eventos específicos de BBDD sheet (Co, Op, VD, Ot, Vi, Red, PaAm, etc.)...');
  const bbddDatesSet = new Set();

  if (wb.Sheets['BBDD']) {
    const wsBBDD = wb.Sheets['BBDD'];
    const bbddRows = XLSX.utils.sheet_to_json(wsBBDD, { header: 1 });
    const bbddHeaders = bbddRows[0] || [];

    const hJugIdx = bbddHeaders.indexOf('Jugador') !== -1 ? bbddHeaders.indexOf('Jugador') : 5;
    const hFechaIdx = bbddHeaders.indexOf('Fecha') !== -1 ? bbddHeaders.indexOf('Fecha') : 7;
    const hTipoEvIdx = bbddHeaders.indexOf('Tipo de Evento') !== -1 ? bbddHeaders.indexOf('Tipo de Evento') : 40;
    const hNumEvIdx = bbddHeaders.indexOf('Nº Evento') !== -1 ? bbddHeaders.indexOf('Nº Evento') : 25;
    const hHoraIdx = bbddHeaders.indexOf('Hora del evento') !== -1 ? bbddHeaders.indexOf('Hora del evento') : 41;
    const hLugarIdx = bbddHeaders.indexOf('Lugar del evento') !== -1 ? bbddHeaders.indexOf('Lugar del evento') : 42;
    const hDurIdx = bbddHeaders.indexOf('Duracion del evento') !== -1 ? bbddHeaders.indexOf('Duracion del evento') : 43;
    const hOrientIdx = bbddHeaders.indexOf('Orientacion del evento') !== -1 ? bbddHeaders.indexOf('Orientacion del evento') : 44;
    const hCargaIdx = bbddHeaders.indexOf('Carga del evento') !== -1 ? bbddHeaders.indexOf('Carga del evento') : 45;
    const hComEvIdx = bbddHeaders.indexOf('Comentario general evento') !== -1 ? bbddHeaders.indexOf('Comentario general evento') : 46;
    const hNumJugIdx = bbddHeaders.indexOf('Nº Jugadores del evento') !== -1 ? bbddHeaders.indexOf('Nº Jugadores del evento') : 47;
    const hRealizaIdx = bbddHeaders.indexOf('REALIZA EL EVENTO') !== -1 ? bbddHeaders.indexOf('REALIZA EL EVENTO') : 48;

    const playerDaySlots = new Map();

    for (let i = 1; i < bbddRows.length; i++) {
      const row = bbddRows[i];
      if (!row) continue;
      const rawJugador = row[hJugIdx];
      const rawFecha = row[hFechaIdx];
      if (!rawJugador || !rawFecha) continue;

      const fechaISO = excelDateToISO(rawFecha);
      if (!fechaISO || !fechaISO.startsWith('202')) continue;

      bbddDatesSet.add(fechaISO);

      const rawTipo = row[hTipoEvIdx];
      const code = standardizeCode(rawTipo);
      if (!code) continue;

      const numEv = Number(row[hNumEvIdx] || 1);
      const slotIdx = Math.max(0, Math.min(5, numEv - 1));
      const blockKey = `${fechaISO}_slot_${slotIdx}`;

      if (!finalBloquesMap[blockKey]) {
        const rawHora = row[hHoraIdx];
        const hora = formatExcelTimeToHHMM(rawHora);
        const block = {
          id: blockKey,
          day_id: `d_${fechaISO}`,
          fecha: fechaISO,
          slot: slotIdx,
          tipo: code,
          hora,
          lugar: row[hLugarIdx] ? String(row[hLugarIdx]).trim() : '',
          duracion: row[hDurIdx] ? String(row[hDurIdx]).trim() : '',
          orientacion: row[hOrientIdx] ? String(row[hOrientIdx]).trim() : '',
          carga: row[hCargaIdx] ? String(row[hCargaIdx]).trim() : '',
          comentario: row[hComEvIdx] ? String(row[hComEvIdx]).trim() : '',
          num_jugadores: row[hNumJugIdx] ? String(row[hNumJugIdx]).trim() : ''
        };
        finalBloquesMap[blockKey] = block;
        finalBloquesMap[`d_${fechaISO}_slot_${slotIdx}`] = block;
      }

      const jNameNorm = norm(rawJugador);
      if (jNameNorm === 'TEAM' || jNameNorm === 'EQUIPO') continue;

      let jugador = dbJugadores.find(j => norm(j.nombre) === jNameNorm || (j.apodo && norm(j.apodo) === jNameNorm));
      if (!jugador) continue;

      const jugadorId = jugador.id;
      const duracion = row[hDurIdx] ? String(row[hDurIdx]).trim() : '';
      const realizaRaw = norm(row[hRealizaIdx]);
      const realiza = realizaRaw === 'SI' || realizaRaw === '1' || (duracion !== '' && Number(duracion) > 0);

      const pDayKey = `${jugadorId}_${fechaISO}`;
      if (!playerDaySlots.has(pDayKey)) {
        playerDaySlots.set(pDayKey, { jugador, fechaISO, slots: new Map() });
      }
      playerDaySlots.get(pDayKey).slots.set(slotIdx, { tipo: code, duracion, realiza });
    }

    // Consolidar asignaciones de jugadores de BBDD
    for (const { jugador, fechaISO, slots } of playerDaySlots.values()) {
      const performedCodes = [];
      let hasExplicitNo = false;

      const sortedSlots = Array.from(slots.entries()).sort((a, b) => a[0] - b[0]);
      for (const [slotIdx, slotInfo] of sortedSlots) {
        const slotKey = `${jugador.id}_${fechaISO}_ev_${fechaISO}_${slotIdx}`;
        if (slotInfo.realiza) {
          if (!performedCodes.includes(slotInfo.tipo)) performedCodes.push(slotInfo.tipo);
          finalPlayerEventsMap[slotKey] = slotInfo.tipo;

          const minObj = { minutos: slotInfo.duracion || "0", realiza: true, manual: false };
          finalPlayerMinutesMap[slotKey] = minObj;
          finalPlayerMinutesMap[`${jugador.id}_d_${fechaISO}_slot_${slotIdx}`] = minObj;
          finalPlayerMinutesMap[`${jugador.id}_${fechaISO}_${slotIdx}`] = minObj;
          finalPlayerMinutesMap[`${jugador.id}_${fechaISO}_${slotInfo.tipo}`] = minObj;
        } else {
          hasExplicitNo = true;
          finalPlayerEventsMap[slotKey] = 'NO';
          const minObj = { minutos: "0", realiza: false, manual: false };
          finalPlayerMinutesMap[slotKey] = minObj;
        }
      }

      const daySummary = performedCodes.length > 0 ? performedCodes.join(', ') : (hasExplicitNo ? 'NO' : '');
      if (daySummary) {
        finalPlayerEventsMap[`${jugador.id}_d_${fechaISO}`] = daySummary;
        finalPlayerEventsMap[`${jugador.id}_${fechaISO}`] = daySummary;
        if (jugador.apodo) finalPlayerEventsMap[`${jugador.apodo.toUpperCase().trim()}_${fechaISO}`] = daySummary;
        if (jugador.nombre) finalPlayerEventsMap[`${jugador.nombre.toUpperCase().trim()}_${fechaISO}`] = daySummary;
      }
    }
  }

  // 3. Planificacion sheet para fechas posteriores a BBDD (post-15 de agosto)
  console.log('\n3. Generando eventos específicos post-15 de agosto basados en Planificación...');
  const wsPlan = wb.Sheets['Planificacion'];
  const planRows = XLSX.utils.sheet_to_json(wsPlan, { header: 1 });

  const dateRow = planRows[8] || [];
  const rivalRow = planRows[11] || [];
  const evAmRow = planRows[12] || [];
  const evPmRow = planRows[13] || [];
  const cargaRow = planRows[14] || [];
  const volRow = planRows[15] || [];
  const comMicroRow = planRows[17] || [];

  const playerPlanRowsMap = new Map();
  for (let r = 20; r <= 50; r++) {
    const row = planRows[r];
    if (!row) continue;
    const alias = (row[8] || '').toString().trim().toUpperCase();
    if (alias) {
      playerPlanRowsMap.set(alias, row);
      playerPlanRowsMap.set(norm(alias), row);
    }
  }

  for (let c = 10; c < dateRow.length; c++) {
    const rawDate = dateRow[c];
    if (!rawDate) continue;
    const iso = excelDateToISO(rawDate);
    if (!iso || !iso.startsWith('202')) continue;

    // Si ya tiene bloques en BBDD, no sobreescribir con Planificacion
    if (bbddDatesSet.has(iso)) continue;

    const evAm = evAmRow[c] ? String(evAmRow[c]).trim().toUpperCase() : '';
    const evPm = evPmRow[c] ? String(evPmRow[c]).trim().toUpperCase() : '';
    const rival = rivalRow[c] ? String(rivalRow[c]).trim() : '';
    const carga = cargaRow[c] ? String(cargaRow[c]).trim() : '';
    const comMicro = comMicroRow[c] ? String(comMicroRow[c]).trim() : '';

    if (comMicro) {
      allComentariosList.push({
        id: `team_micro_${iso}`,
        jugador_id: "TEAM",
        day_id: `d_${iso}`,
        fecha: iso,
        tipo: "OTR",
        texto: comMicro
      });
    }

    const daySpecificCodes = [];

    // CASO 1: Collbaix (27/08)
    if (rival && rival.toLowerCase().includes('collbaix')) {
      const b0 = {
        id: `${iso}_slot_0`,
        day_id: `d_${iso}`,
        fecha: iso,
        slot: 0,
        tipo: 'Co',
        hora: '09:30',
        lugar: 'Congost',
        duracion: '20',
        orientacion: 'Pre',
        carga: '3',
        comentario: 'Movilidad y activación',
        num_jugadores: String(activeJugadores.length)
      };
      const b1 = {
        id: `${iso}_slot_1`,
        day_id: `d_${iso}`,
        fecha: iso,
        slot: 1,
        tipo: 'Op',
        hora: '10:00',
        lugar: 'Collbaix',
        duracion: '90',
        orientacion: 'Fuerza',
        carga: carga || '8',
        comentario: 'Subida a Collbaix',
        num_jugadores: String(activeJugadores.length)
      };
      finalBloquesMap[`${iso}_slot_0`] = b0;
      finalBloquesMap[`d_${iso}_slot_0`] = b0;
      finalBloquesMap[`${iso}_slot_1`] = b1;
      finalBloquesMap[`d_${iso}_slot_1`] = b1;
      daySpecificCodes.push({ code: 'Co', dur: '20' }, { code: 'Op', dur: '90' });
    }
    // CASO 2: Golf/Padel (20/08)
    else if (rival && (rival.toLowerCase().includes('golf') || rival.toLowerCase().includes('padel'))) {
      const b0 = {
        id: `${iso}_slot_0`,
        day_id: `d_${iso}`,
        fecha: iso,
        slot: 0,
        tipo: 'Ot',
        hora: '18:00',
        lugar: 'Manresa',
        duracion: '90',
        orientacion: 'Cohesión',
        carga: '2',
        comentario: 'Golf / Pádel',
        num_jugadores: String(activeJugadores.length)
      };
      finalBloquesMap[`${iso}_slot_0`] = b0;
      finalBloquesMap[`d_${iso}_slot_0`] = b0;
      daySpecificCodes.push({ code: 'Ot', dur: '90' });
    }
    // CASO 3: Partidos (16/08 Europa, 19/08 UESA, 22/08 At. Lleida, 29/08 Hospitalet, 06/09 Arnedo)
    else if (rival || evPm === 'PAV' || evPm === 'PAL' || evPm === 'PV' || evPm === 'PL') {
      const isAmistoso = iso < '2026-09-01' || evPm === 'PAV' || evPm === 'PAL';
      const matchCode = isAmistoso ? 'PaAm' : 'Pa';
      const isVisitante = evAm === 'V' || evAm === 'VI' || evPm === 'PAV' || evPm === 'PV';

      if (isVisitante) {
        // Vi + PaAm/Pa
        const b0 = {
          id: `${iso}_slot_0`,
          day_id: `d_${iso}`,
          fecha: iso,
          slot: 0,
          tipo: 'Vi',
          hora: '10:00',
          lugar: 'Manresa',
          duracion: '120',
          orientacion: 'Viaje',
          carga: '1',
          comentario: `Desplazamiento vs ${rival}`,
          num_jugadores: String(activeJugadores.length)
        };
        const b1 = {
          id: `${iso}_slot_1`,
          day_id: `d_${iso}`,
          fecha: iso,
          slot: 1,
          tipo: matchCode,
          hora: '18:00',
          lugar: 'Campo Rival',
          duracion: '90',
          orientacion: isAmistoso ? 'Amistoso' : 'Oficial',
          carga: carga || '8',
          comentario: `Rival: ${rival}`,
          num_jugadores: String(activeJugadores.length)
        };
        finalBloquesMap[`${iso}_slot_0`] = b0;
        finalBloquesMap[`d_${iso}_slot_0`] = b0;
        finalBloquesMap[`${iso}_slot_1`] = b1;
        finalBloquesMap[`d_${iso}_slot_1`] = b1;
        daySpecificCodes.push({ code: 'Vi', dur: '120' }, { code: matchCode, dur: '90' });
      } else {
        // Solo Partido Local
        const b0 = {
          id: `${iso}_slot_0`,
          day_id: `d_${iso}`,
          fecha: iso,
          slot: 0,
          tipo: matchCode,
          hora: '19:00',
          lugar: 'Congost',
          duracion: '90',
          orientacion: isAmistoso ? 'Amistoso' : 'Oficial',
          carga: carga || '8',
          comentario: `Rival: ${rival}`,
          num_jugadores: String(activeJugadores.length)
        };
        finalBloquesMap[`${iso}_slot_0`] = b0;
        finalBloquesMap[`d_${iso}_slot_0`] = b0;
        daySpecificCodes.push({ code: matchCode, dur: '90' });
      }
    }
    // CASO 4: Entrenamientos (E)
    else if (evAm === 'E' || evPm === 'E') {
      const isSoloOp = evAm === 'E' && !evPm; // e.g. 05/09 activación
      if (isSoloOp) {
        const b0 = {
          id: `${iso}_slot_0`,
          day_id: `d_${iso}`,
          fecha: iso,
          slot: 0,
          tipo: 'Op',
          hora: '10:00',
          lugar: 'Congost',
          duracion: '60',
          orientacion: 'Activación',
          carga: carga || '5',
          comentario: 'Sesión de campo prepartido',
          num_jugadores: String(activeJugadores.length)
        };
        finalBloquesMap[`${iso}_slot_0`] = b0;
        finalBloquesMap[`d_${iso}_slot_0`] = b0;
        daySpecificCodes.push({ code: 'Op', dur: '60' });
      } else {
        // Co + Op
        const b0 = {
          id: `${iso}_slot_0`,
          day_id: `d_${iso}`,
          fecha: iso,
          slot: 0,
          tipo: 'Co',
          hora: '18:30',
          lugar: 'Congost',
          duracion: '20',
          orientacion: 'Pre',
          carga: '3',
          comentario: 'Movilidad y prevención',
          num_jugadores: String(activeJugadores.length)
        };
        const b1 = {
          id: `${iso}_slot_1`,
          day_id: `d_${iso}`,
          fecha: iso,
          slot: 1,
          tipo: 'Op',
          hora: '18:50',
          lugar: 'Congost',
          duracion: '75',
          orientacion: 'Campo',
          carga: carga || '6',
          comentario: 'Sesión de campo',
          num_jugadores: String(activeJugadores.length)
        };
        finalBloquesMap[`${iso}_slot_0`] = b0;
        finalBloquesMap[`d_${iso}_slot_0`] = b0;
        finalBloquesMap[`${iso}_slot_1`] = b1;
        finalBloquesMap[`d_${iso}_slot_1`] = b1;
        daySpecificCodes.push({ code: 'Co', dur: '20' }, { code: 'Op', dur: '75' });
      }
    }

    // Asignar jugadores para este día post-15 de agosto
    if (daySpecificCodes.length > 0) {
      const assignedCodesStr = daySpecificCodes.map(d => d.code).join(', ');

      activeJugadores.forEach(jugador => {
        const jugadorId = jugador.id;
        const pApodo = (jugador.apodo || '').toUpperCase().trim();
        const pNombre = (jugador.nombre || '').toUpperCase().trim();

        const row = playerPlanRowsMap.get(pApodo) || playerPlanRowsMap.get(pNombre) || playerPlanRowsMap.get(norm(jugador.nombre));
        const status = row ? (row[c] || '').toString().trim().toUpperCase() : '';

        const isUnavailable = status === 'L' || status === 'NO' || status === 'N' || status === 'M' || status === 'NDR' || status === 'NDO';
        const assignedVal = isUnavailable ? 'NO' : assignedCodesStr;

        finalPlayerEventsMap[`${jugadorId}_d_${iso}`] = assignedVal;
        finalPlayerEventsMap[`${jugadorId}_${iso}`] = assignedVal;
        if (pApodo) finalPlayerEventsMap[`${pApodo}_${iso}`] = assignedVal;
        if (pNombre) finalPlayerEventsMap[`${pNombre}_${iso}`] = assignedVal;

        daySpecificCodes.forEach((dItem, sIdx) => {
          const slotPlayerKey = `${jugadorId}_${iso}_ev_${iso}_${sIdx}`;
          const slotEventVal = isUnavailable ? 'NO' : dItem.code;
          finalPlayerEventsMap[slotPlayerKey] = slotEventVal;
          finalPlayerEventsMap[`${jugadorId}_d_${iso}_slot_${sIdx}`] = slotEventVal;

          const minObj = {
            minutos: isUnavailable ? "0" : dItem.dur,
            realiza: !isUnavailable,
            manual: false
          };
          finalPlayerMinutesMap[slotPlayerKey] = minObj;
          finalPlayerMinutesMap[`${jugadorId}_d_${iso}_slot_${sIdx}`] = minObj;
          finalPlayerMinutesMap[`${jugadorId}_${iso}_${sIdx}`] = minObj;
          finalPlayerMinutesMap[`${jugadorId}_${iso}_${dItem.code}`] = minObj;
        });
      });
    }
  }

  // Guardar archivo JSON
  const finalSyncData = {
    updated_at: new Date().toISOString(),
    eventosBloquesMap: finalBloquesMap,
    playerEventsMap: finalPlayerEventsMap,
    playerMinutesMap: finalPlayerMinutesMap,
    comentarios: allComentariosList
  };

  const publicSyncPath = '/Users/MiquelNadalGaya/web/public/calendar_sync_data.json';
  const rootSyncPath = '/Users/MiquelNadalGaya/web/calendar_sync_data.json';

  fs.writeFileSync(publicSyncPath, JSON.stringify(finalSyncData, null, 2), 'utf8');
  fs.writeFileSync(rootSyncPath, JSON.stringify(finalSyncData, null, 2), 'utf8');

  console.log(`\n✓ Archivo calendar_sync_data.json actualizado con éxito:`);
  console.log(`  - Total bloques específicos (Co, Op, VD, Ot, Vi, Red, PaAm, Pa): ${Object.keys(finalBloquesMap).length}`);
  console.log(`  - Total asignaciones individuales de eventos: ${Object.keys(finalPlayerEventsMap).length}`);
  console.log(`  - Total minutos/asistencias registradas: ${Object.keys(finalPlayerMinutesMap).length}`);
  console.log(`\n================================================================`);
  console.log(` CARGA EXACTA FINALIZADA EXITOSAMENTE `);
  console.log(`================================================================\n`);
}

main().catch(console.error);
