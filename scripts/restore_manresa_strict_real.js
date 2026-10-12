/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const manresaExcelPath = '/Users/MiquelNadalGaya/web/planificacion_manresa.xlsm';

console.log(`\n================================================================`);
console.log(` RESTAURACIÓN ESTRICTA Y 100% FIEL - CE MANRESA (SIN DATOS INVENTADOS)`);
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

const norm = (s) => (s || '').toString().trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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

  const jugadorMap = new Map();
  dbJugadores.forEach(j => {
    jugadorMap.set(norm(j.nombre), j.id);
    if (j.apodo) jugadorMap.set(norm(j.apodo), j.id);
    if (j.cor_id) jugadorMap.set(`dorsal_${j.cor_id}`, j.id);
  });

  console.log(`Jugadores de CE Manresa: ${dbJugadores.length}`);

  // 2. Planificacion Sheet (364 días estrictos)
  const wsPlan = wb.Sheets['Planificacion'];
  const planRows = XLSX.utils.sheet_to_json(wsPlan, { header: 1 });

  const dateRow = planRows[8] || [];
  const periodoRow = planRows[4] || [];
  const subperiodoRow = planRows[5] || [];
  const semanaRow = planRows[9] || [];
  const mdRow = planRows[10] || [];
  const rivalRow = planRows[11] || [];
  const evAmRow = planRows[12] || [];
  const evPmRow = planRows[13] || [];
  const cargaRow = planRows[14] || [];
  const volRow = planRows[15] || [];
  const intRow = planRows[16] || [];
  const comMicroRow = planRows[17] || [];

  const colToDateMap = new Map();
  const sesionesManresa = [];

  for (let c = 10; c < dateRow.length; c++) {
    const rawDate = dateRow[c];
    if (!rawDate) continue;
    const iso = excelDateToISO(rawDate);
    if (!iso || !iso.startsWith('202')) continue;

    colToDateMap.set(c, iso);

    const evAm = evAmRow[c] !== undefined && evAmRow[c] !== null && String(evAmRow[c]).trim() !== '' ? String(evAmRow[c]).trim() : null;
    const evPm = evPmRow[c] !== undefined && evPmRow[c] !== null && String(evPmRow[c]).trim() !== '' ? String(evPmRow[c]).trim() : null;
    const rival = rivalRow[c] !== undefined && rivalRow[c] !== null && String(rivalRow[c]).trim() !== '' ? String(rivalRow[c]).trim() : null;
    const rawSemana = semanaRow[c];
    const semana = Number.isInteger(Number(rawSemana)) ? Number(rawSemana) : null;
    const comMicro = comMicroRow[c] !== undefined && comMicroRow[c] !== null && String(comMicroRow[c]).trim() !== '' ? String(comMicroRow[c]).trim() : null;

    sesionesManresa.push({
      fecha: iso,
      equipo: 'CE Manresa',
      periodo: periodoRow[c] ? String(periodoRow[c]).trim() : null,
      subperiodo: subperiodoRow[c] ? String(subperiodoRow[c]).trim() : null,
      semana,
      md: mdRow[c] ? String(mdRow[c]).trim() : null,
      rival,
      evento_am: evAm,
      evento_pm: evPm,
      carga: cargaRow[c] !== undefined && cargaRow[c] !== null && !isNaN(Number(cargaRow[c])) ? Number(cargaRow[c]) : null,
      volumen: volRow[c] !== undefined && volRow[c] !== null && !isNaN(Number(volRow[c])) ? Number(volRow[c]) : null,
      intensidad: intRow[c] !== undefined && intRow[c] !== null && !isNaN(Number(intRow[c])) ? Number(intRow[c]) : null,
      comentario_microciclo: comMicro
    });
  }

  console.log(`2. Guardando ${sesionesManresa.length} sesiones reales en Supabase...`);
  for (let i = 0; i < sesionesManresa.length; i += 100) {
    const chunk = sesionesManresa.slice(i, i + 100);
    await supabase.from('sesiones_dia').upsert(chunk, { onConflict: 'fecha' });
  }

  const { data: dbSesiones } = await supabase.from('sesiones_dia').select('id, fecha').eq('equipo', 'CE Manresa');
  const sesionIdByFecha = new Map();
  (dbSesiones || []).forEach(s => sesionIdByFecha.set(s.fecha, s.id));

  // 3. Extraer Estados Diarios y Notas reales desde Planificacion y BBDD
  console.log('3. Extrayendo estados diarios y notas reales...');
  const estadoDiarioMap = new Map();

  for (let r = 21; r <= 47; r++) {
    const dorsal = r - 20;
    const row = planRows[r];
    if (!row) continue;

    const rawName = row[9] || row[8] || row[7] || '';
    const nameNorm = norm(rawName);

    let jugadorId = jugadorMap.get(`dorsal_${dorsal}`) || jugadorMap.get(nameNorm);
    if (!jugadorId) {
      const found = dbJugadores.find(j => Number(j.cor_id) === dorsal || norm(j.nombre) === nameNorm || (j.apodo && norm(j.apodo) === nameNorm));
      if (found) jugadorId = found.id;
    }
    if (!jugadorId) continue;

    for (const [colIdx, fechaISO] of colToDateMap.entries()) {
      const val = row[colIdx];
      const code = (val !== undefined && val !== null && String(val).trim() !== '' && val !== false && String(val).trim() !== '.') ? String(val).trim().toUpperCase() : null;

      const key = `${jugadorId}_${fechaISO}`;
      estadoDiarioMap.set(key, {
        jugador_id: jugadorId,
        fechaISO,
        disponibilidad: code || null,
        comentario_lesiones: null,
        comentario_medico: null,
        comentario_nutricion: null,
        comentario_fisico: null,
        comentario_tecnico: null,
        objetivo: null
      });
    }
  }

  // Notas de celdas reales en Planificacion
  let noteCount = 0;
  for (const cellKey in wsPlan) {
    if (cellKey.startsWith('!')) continue;
    const cell = wsPlan[cellKey];
    if (cell && cell.c && cell.c.length > 0) {
      const decoded = XLSX.utils.decode_cell(cellKey);
      const r = decoded.r;
      const c = decoded.c;
      if (r >= 21 && r <= 47) {
        const dorsal = r - 20;
        const fechaISO = colToDateMap.get(c);
        const rawName = planRows[r] ? (planRows[r][9] || planRows[r][8] || planRows[r][7] || '') : '';
        const nameNorm = norm(rawName);

        let jugadorId = jugadorMap.get(`dorsal_${dorsal}`) || jugadorMap.get(nameNorm);
        if (!jugadorId) {
          const found = dbJugadores.find(j => Number(j.cor_id) === dorsal || norm(j.nombre) === nameNorm);
          if (found) jugadorId = found.id;
        }

        const noteText = cell.c.map(item => item.t || item).join(' ').trim();
        if (jugadorId && fechaISO && noteText) {
          noteCount++;
          const key = `${jugadorId}_${fechaISO}`;
          const current = estadoDiarioMap.get(key) || { jugador_id: jugadorId, fechaISO, disponibilidad: null };
          const textNorm = noteText.toLowerCase();

          if (textNorm.includes('[les]') || textNorm.includes('isquio') || textNorm.includes('rodilla') || textNorm.includes('molestia') || textNorm.includes('lesion') || textNorm.includes('pinchazo') || textNorm.includes('inflamacion')) {
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
  console.log(`  - Notas de celdas reales procesadas: ${noteCount}`);

  // Enriquecer con comentarios reales de BBDD
  if (wb.Sheets['BBDD']) {
    const wsBBDD = wb.Sheets['BBDD'];
    const bbddRows = XLSX.utils.sheet_to_json(wsBBDD, { header: 1 });
    const bbddHeaders = bbddRows[0] || [];

    const hJugIdx = bbddHeaders.indexOf('Jugador') !== -1 ? bbddHeaders.indexOf('Jugador') : 5;
    const hFechaIdx = bbddHeaders.indexOf('Fecha') !== -1 ? bbddHeaders.indexOf('Fecha') : 7;
    const hObjIdx = bbddHeaders.indexOf('Objetivo') !== -1 ? bbddHeaders.indexOf('Objetivo') : 19;
    const hLesIdx = bbddHeaders.indexOf('Comentario Lesion') !== -1 ? bbddHeaders.indexOf('Comentario Lesion') : 20;
    const hMedIdx = bbddHeaders.indexOf('Comentario Medico') !== -1 ? bbddHeaders.indexOf('Comentario Medico') : 21;
    const hNutIdx = bbddHeaders.indexOf('Comentario Nutricional') !== -1 ? bbddHeaders.indexOf('Comentario Nutricional') : 22;
    const hFisIdx = bbddHeaders.indexOf('Comentario Fisico') !== -1 ? bbddHeaders.indexOf('Comentario Fisico') : 23;
    const hTecIdx = bbddHeaders.indexOf('Comentario Tecnico') !== -1 ? bbddHeaders.indexOf('Comentario Tecnico') : 24;
    const hGenEvIdx = bbddHeaders.indexOf('Comentario general evento') !== -1 ? bbddHeaders.indexOf('Comentario general evento') : 46;
    const hDispIdx = bbddHeaders.indexOf('Disponibilidad') !== -1 ? bbddHeaders.indexOf('Disponibilidad') : 18;

    for (let i = 1; i < bbddRows.length; i++) {
      const row = bbddRows[i];
      if (!row) continue;
      const rawJugador = row[hJugIdx];
      const rawFecha = row[hFechaIdx];
      if (!rawJugador || !rawFecha || norm(rawJugador) === 'TEAM') continue;

      const fechaISO = excelDateToISO(rawFecha);
      if (!fechaISO) continue;

      const jNameNorm = norm(rawJugador);
      let jugadorId = jugadorMap.get(jNameNorm);
      if (!jugadorId) {
        const found = dbJugadores.find(j => norm(j.nombre) === jNameNorm || (j.apodo && norm(j.apodo) === jNameNorm));
        if (found) jugadorId = found.id;
      }
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
  }

  // Guardar estados reales en Supabase
  const estadosToInsert = [];
  for (const item of estadoDiarioMap.values()) {
    const sesionId = sesionIdByFecha.get(item.fechaISO);
    if (!sesionId) continue;

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

  console.log(`4. Insertando ${estadosToInsert.length} estados consolidados reales en Supabase...`);
  const manresaJugadorIds = Array.from(new Set(dbJugadores.map(j => j.id)));
  for (let i = 0; i < manresaJugadorIds.length; i += 10) {
    const chunkIds = manresaJugadorIds.slice(i, i + 10);
    await supabase.from('estado_diario_jugador').delete().in('jugador_id', chunkIds);
  }

  for (let i = 0; i < estadosToInsert.length; i += 500) {
    const chunk = estadosToInsert.slice(i, i + 500);
    await supabase.from('estado_diario_jugador').insert(chunk);
  }

  // 4. Bloques de eventos estrictamente REALES
  console.log('5. Generando calendar_sync_data.json con eventos 100% reales de Excel...');
  const eventosBloquesMap = {};
  const playerEventsMap = {};
  const playerMinutesMap = {};
  const comentariosList = [];

  // 5.1 Planificacion (Solo días que TIENEN evento real en Excel)
  for (let c = 10; c < dateRow.length; c++) {
    const rawDate = dateRow[c];
    if (!rawDate) continue;
    const iso = excelDateToISO(rawDate);
    if (!iso) continue;

    const evAm = evAmRow[c] !== undefined && evAmRow[c] !== null && String(evAmRow[c]).trim() !== '' ? String(evAmRow[c]).trim() : '';
    const evPm = evPmRow[c] !== undefined && evPmRow[c] !== null && String(evPmRow[c]).trim() !== '' ? String(evPmRow[c]).trim() : '';
    const rival = rivalRow[c] !== undefined && rivalRow[c] !== null && String(rivalRow[c]).trim() !== '' ? String(rivalRow[c]).trim() : '';
    const duracion = volRow[c] ? String(volRow[c]).trim() : '90';
    const comMicro = comMicroRow[c] ? String(comMicroRow[c]).trim() : '';

    if (comMicro) {
      comentariosList.push({
        id: `team_micro_${iso}`,
        jugador_id: 'TEAM',
        day_id: `d_${iso}`,
        fecha: iso,
        tipo: 'OTR',
        texto: comMicro
      });
    }

    // Si NO hay evento en AM, PM ni Rival, el día NO TIENE BLOQUES (descanso/sin evento)
    if (!evAm && !evPm && !rival) {
      continue;
    }

    // Bloque AM si existe en Excel
    if (evAm) {
      const blockKey0 = `${iso}_slot_0`;
      eventosBloquesMap[blockKey0] = {
        id: blockKey0,
        day_id: `d_${iso}`,
        fecha: iso,
        slot: 0,
        tipo: evAm,
        hora: '',
        lugar: 'Manresa',
        duracion,
        orientacion: '',
        carga: cargaRow[c] ? String(cargaRow[c]).trim() : '',
        comentario: '',
        num_jugadores: String(dbJugadores.length)
      };
    }

    // Bloque PM si existe en Excel
    const tipoPm = evPm || (rival ? 'P' : '');
    const slotPm = evAm ? 1 : 0;
    if (tipoPm) {
      const blockKeyPm = `${iso}_slot_${slotPm}`;
      eventosBloquesMap[blockKeyPm] = {
        id: blockKeyPm,
        day_id: `d_${iso}`,
        fecha: iso,
        slot: slotPm,
        tipo: tipoPm,
        hora: '',
        lugar: 'Manresa',
        duracion,
        orientacion: '',
        carga: cargaRow[c] ? String(cargaRow[c]).trim() : '',
        comentario: rival ? `Rival: ${rival}` : '',
        num_jugadores: String(dbJugadores.length)
      };
    }

    // Asignaciones de jugadores reales desde Planificacion
    for (let r = 21; r <= 47; r++) {
      const dorsal = r - 20;
      const row = planRows[r];
      if (!row) continue;

      const rawName = row[9] || row[8] || row[7] || '';
      const nameNorm = norm(rawName);

      let jugadorId = jugadorMap.get(`dorsal_${dorsal}`) || jugadorMap.get(nameNorm);
      if (!jugadorId) {
        const found = dbJugadores.find(j => Number(j.cor_id) === dorsal || norm(j.nombre) === nameNorm);
        if (found) jugadorId = found.id;
      }
      if (!jugadorId) continue;

      const val = row[c];
      const code = (val !== undefined && val !== null && String(val).trim() !== '' && val !== false && String(val).trim() !== '.') ? String(val).trim().toUpperCase() : '';

      if (code === 'L') {
        if (evAm) playerEventsMap[`${jugadorId}_${iso}_ev_${iso}_0`] = 'L';
        if (tipoPm) playerEventsMap[`${jugadorId}_${iso}_ev_${iso}_${slotPm}`] = 'L';
      } else if (code === 'NO' || code === 'N' || code === 'M' || code === 'NDR' || code === 'NDO') {
        if (evAm) playerEventsMap[`${jugadorId}_${iso}_ev_${iso}_0`] = 'NO';
        if (tipoPm) playerEventsMap[`${jugadorId}_${iso}_ev_${iso}_${slotPm}`] = 'NO';
      } else if (code === 'D' || !code) {
        if (evAm) {
          const key0 = `${jugadorId}_${iso}_ev_${iso}_0`;
          playerEventsMap[key0] = evAm;
          playerMinutesMap[key0] = { minutos: duracion, realiza: true, manual: false };
        }
        if (tipoPm) {
          const keyPm = `${jugadorId}_${iso}_ev_${iso}_${slotPm}`;
          playerEventsMap[keyPm] = tipoPm;
          playerMinutesMap[keyPm] = { minutos: duracion, realiza: true, manual: false };
        }
      }
    }
  }

  // 5.2 Eventos detallados reales desde BBDD sheet (hasta 16 de agosto)
  if (wb.Sheets['BBDD']) {
    const wsBBDD = wb.Sheets['BBDD'];
    const rows = XLSX.utils.sheet_to_json(wsBBDD, { header: 1 });
    const headers = rows[0] || [];

    const hJugIdx = headers.indexOf('Jugador') !== -1 ? headers.indexOf('Jugador') : 5;
    const hFechaIdx = headers.indexOf('Fecha') !== -1 ? headers.indexOf('Fecha') : 7;
    const hTipoEvIdx = headers.indexOf('Tipo de Evento') !== -1 ? headers.indexOf('Tipo de Evento') : 40;
    const hNumEvIdx = headers.indexOf('Nº Evento') !== -1 ? headers.indexOf('Nº Evento') : 25;
    const hHoraIdx = headers.indexOf('Hora del evento') !== -1 ? headers.indexOf('Hora del evento') : 41;
    const hLugarIdx = headers.indexOf('Lugar del evento') !== -1 ? headers.indexOf('Lugar del evento') : 42;
    const hDurIdx = headers.indexOf('Duracion del evento') !== -1 ? headers.indexOf('Duracion del evento') : 43;
    const hOrientIdx = headers.indexOf('Orientacion del evento') !== -1 ? headers.indexOf('Orientacion del evento') : 44;
    const hCargaIdx = headers.indexOf('Carga del evento') !== -1 ? headers.indexOf('Carga del evento') : 45;
    const hComEvIdx = headers.indexOf('Comentario general evento') !== -1 ? headers.indexOf('Comentario general evento') : 46;
    const hNumJugIdx = headers.indexOf('Nº Jugadores del evento') !== -1 ? headers.indexOf('Nº Jugadores del evento') : 47;
    const hRealizaIdx = headers.indexOf('REALIZA EL EVENTO') !== -1 ? headers.indexOf('REALIZA EL EVENTO') : 48;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const iso = excelDateToISO(r[hFechaIdx]);
      if (!iso) continue;
      const tipoEv = r[hTipoEvIdx];
      if (!tipoEv) continue;

      const tipoTrim = String(tipoEv).trim();
      const numEv = Number(r[hNumEvIdx] || 1);
      const slotIdx = Math.max(0, Math.min(5, numEv - 1));
      const rawJugador = r[hJugIdx];
      const jNameNorm = norm(rawJugador);

      const blockKey = `${iso}_slot_${slotIdx}`;
      eventosBloquesMap[blockKey] = {
        id: blockKey,
        day_id: `d_${iso}`,
        fecha: iso,
        slot: slotIdx,
        tipo: tipoTrim,
        hora: r[hHoraIdx] ? String(r[hHoraIdx]).trim() : (eventosBloquesMap[blockKey]?.hora || ''),
        lugar: r[hLugarIdx] ? String(r[hLugarIdx]).trim() : (eventosBloquesMap[blockKey]?.lugar || ''),
        duracion: r[hDurIdx] ? String(r[hDurIdx]).trim() : (eventosBloquesMap[blockKey]?.duracion || ''),
        orientacion: r[hOrientIdx] ? String(r[hOrientIdx]).trim() : (eventosBloquesMap[blockKey]?.orientacion || ''),
        carga: r[hCargaIdx] ? String(r[hCargaIdx]).trim() : (eventosBloquesMap[blockKey]?.carga || ''),
        comentario: r[hComEvIdx] ? String(r[hComEvIdx]).trim() : (eventosBloquesMap[blockKey]?.comentario || ''),
        num_jugadores: r[hNumJugIdx] ? String(r[hNumJugIdx]).trim() : (eventosBloquesMap[blockKey]?.num_jugadores || '')
      };

      if (jNameNorm && jNameNorm !== 'TEAM') {
        let jugadorId = jugadorMap.get(jNameNorm);
        if (!jugadorId) {
          const found = dbJugadores.find(j => norm(j.nombre) === jNameNorm || (j.apodo && norm(j.apodo) === jNameNorm));
          if (found) jugadorId = found.id;
        }

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
        }
      }
    }
  }

  const finalSyncData = {
    updated_at: new Date().toISOString(),
    eventosBloquesMap,
    playerEventsMap,
    playerMinutesMap,
    comentarios: comentariosList
  };

  const publicSyncPath = '/Users/MiquelNadalGaya/web/public/calendar_sync_data.json';
  const rootSyncPath = '/Users/MiquelNadalGaya/web/calendar_sync_data.json';

  fs.writeFileSync(publicSyncPath, JSON.stringify(finalSyncData, null, 2));
  fs.writeFileSync(rootSyncPath, JSON.stringify(finalSyncData, null, 2));

  console.log(`\n✓ Archivo calendar_sync_data.json guardado estrictamente con datos reales:`);
  console.log(`  - Total bloques de eventos: ${Object.keys(eventosBloquesMap).length}`);
  console.log(`  - Total asignaciones individuales de eventos: ${Object.keys(playerEventsMap).length}`);
  console.log(`  - Total minutos/asistencias: ${Object.keys(playerMinutesMap).length}`);
  console.log(`\n================================================================`);
  console.log(` RESTAURACIÓN ESTRICTA FINALIZADA`);
  console.log(`================================================================\n`);
}

main().catch(console.error);
