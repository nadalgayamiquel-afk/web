/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

console.log(`\n================================================================`);
console.log(` RESTAURACIÓN INTEGRAL CE MANRESA - TODOS LOS DÍAS DE LA TEMPORADA`);
console.log(`================================================================\n`);

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Faltan credenciales Supabase en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const manresaExcelPath = '/Users/MiquelNadalGaya/web/planificacion_manresa.xlsm';
if (!fs.existsSync(manresaExcelPath)) {
  console.error(`Error: No se encuentra el archivo ${manresaExcelPath}`);
  process.exit(1);
}

const EXCLUDED_MACRO_CODES = new Set(['E', 'PAL', 'PV', 'PL', 'V', 'PAV', 'P', 'D']);

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

const norm = (s) => (s || '').toString().trim().toUpperCase();

function standardizeSpecificCode(rawCode) {
  if (!rawCode) return '';
  const c = String(rawCode).trim().toUpperCase();
  if (EXCLUDED_MACRO_CODES.has(c)) return '';
  if (c === 'CO') return 'Co';
  if (c === 'OP') return 'Op';
  if (c === 'VD' || c === 'VIDEO') return 'VD';
  if (c === 'RED' || c === 'READAPTACION') return 'Red';
  if (c === 'PAAM') return 'PaAm';
  if (c === 'PA') return 'Pa';
  if (c === 'VI' || c === 'VIAJE') return 'Vi';
  if (c === 'OT' || c === 'OTROS') return 'Ot';
  if (c === 'VA') return 'Va';
  if (c === 'OOP') return 'Oop';
  if (c === 'COP') return 'Cop';
  return String(rawCode).trim();
}

const KNOWN_MATCH_RESULTS = {
  '2026-07-29': '2-1', // Sabadell
  '2026-08-01': '0-0', // Reus
  '2026-08-05': '0-1', // Espanyol B
  '2026-08-08': '0-0', // Grama
  '2026-08-12': '2-0', // Vilanova
  '2026-08-16': '1-0', // Europa
  '2026-08-19': '2-1', // UESA
  '2026-08-22': '1-1', // At. Lleida
  '2026-08-29': '0-0', // Hospitalet
  '2026-09-06': '1-2', // Arnedo
};

function extractMatchResult(fechaISO, rivalStr) {
  if (KNOWN_MATCH_RESULTS[fechaISO]) return KNOWN_MATCH_RESULTS[fechaISO];
  if (!rivalStr) return '';
  const match = String(rivalStr).match(/\((\d+\s*[-:]\s*\d+)\)/);
  if (match && match[1]) {
    return match[1].replace(':', '-').trim();
  }
  return '';
}

async function run() {
  console.log('1. Leyendo Excel de Planificación de Manresa...');
  const wb = XLSX.readFile(manresaExcelPath, { cellDates: false });

  // --------------------------------------------------------------------------
  // 1. JUGADORES Y ARCHIVADOS (EXCEL + SUPABASE)
  // --------------------------------------------------------------------------
  console.log('\n--- 1. Actualizando Jugadores y Deportistas Archivados ---');
  
  const archivedNames = new Set([
    'BIEL',
    'RAFA CATALAN',
    'MARC DE PEDRO',
    'SABA SAMUSHIA (ANTERIOR 1039)',
    'JANDRO SANCHEZ',
    'ALEJANDRO PEREIRA',
    'SABA SAMUSHIA'
  ]);

  const excelPlayersList = [];
  const playerNameToExcelMap = new Map();

  if (wb.Sheets['Deportistas']) {
    const depRows = XLSX.utils.sheet_to_json(wb.Sheets['Deportistas'], { header: 1 });
    const headers = depRows[0] || [];
    const hNomIdx = headers.findIndex(h => /NOM_COMPLET|NOMBRE/i.test(String(h)));
    const hApodoIdx = headers.findIndex(h => /NOM_CURT|APODO/i.test(String(h)));
    const hPosIdx = headers.findIndex(h => /POSIC/i.test(String(h)));
    const hDorsalIdx = headers.findIndex(h => /DORSAL|COR_ID/i.test(String(h)));

    for (let i = 1; i < depRows.length; i++) {
      const r = depRows[i];
      if (!r) continue;
      const nombre = r[hNomIdx];
      const apodo = r[hApodoIdx] ? String(r[hApodoIdx]).trim() : '';
      if ((!nombre && !apodo) || norm(nombre || apodo) === 'TEAM') continue;
      const nombreStr = nombre ? String(nombre).trim() : apodo;
      const posicion = r[hPosIdx] ? String(r[hPosIdx]).trim() : null;
      const dorsal = r[hDorsalIdx] ? String(r[hDorsalIdx]).trim() : null;

      const isArchived = archivedNames.has(norm(nombreStr)) || archivedNames.has(norm(apodo));
      const pObj = {
        id: `manresa_${norm(apodo || nombreStr).toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        nombre: nombreStr,
        apodo: apodo || undefined,
        posicion: posicion || undefined,
        cor_id: dorsal || undefined,
        equipo: 'CE Manresa',
        temporada: '2026/27',
        activo: !isArchived
      };
      excelPlayersList.push(pObj);
      playerNameToExcelMap.set(norm(nombreStr), pObj);
      if (apodo) playerNameToExcelMap.set(norm(apodo), pObj);
    }
  }

  // Also check Planificacion rows 21-50 for any missing players
  const wsPlanTemp = wb.Sheets['Planificacion'];
  if (wsPlanTemp) {
    const planRowsTemp = XLSX.utils.sheet_to_json(wsPlanTemp, { header: 1 });
    for (let r = 20; r <= 50; r++) {
      const row = planRowsTemp[r];
      if (!row) continue;
      const alias = row[8] ? String(row[8]).trim() : '';
      if (!alias || norm(alias) === 'TEAM' || norm(alias) === 'EXPOSICION') continue;
      if (!playerNameToExcelMap.has(norm(alias))) {
        const isArchived = archivedNames.has(norm(alias));
        const pObj = {
          id: `manresa_${norm(alias).toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          nombre: alias,
          apodo: alias,
          posicion: undefined,
          cor_id: undefined,
          equipo: 'CE Manresa',
          temporada: '2026/27',
          activo: !isArchived
        };
        excelPlayersList.push(pObj);
        playerNameToExcelMap.set(norm(alias), pObj);
      }
    }
  }

  let finalPlayersList = [...excelPlayersList];
  let isSupabaseOnline = false;

  try {
    const testPromise = supabase.from('jugadores').select('id').limit(1);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500));
    await Promise.race([testPromise, timeoutPromise]);
    isSupabaseOnline = true;
    console.log('✓ Conectado a Supabase correctamente.');
  } catch (e) {
    console.log('ℹ Supabase no accesible (modo local/offline), generando dataset completo localmente.');
  }

  if (isSupabaseOnline) {
    try {
      for (const p of excelPlayersList) {
        await supabase.from('jugadores').upsert({
          nombre: p.nombre,
          apodo: p.apodo,
          posicion: p.posicion,
          cor_id: p.cor_id,
          equipo: 'CE Manresa',
          temporada: '2026/27',
          activo: p.activo
        }, { onConflict: 'nombre' });
      }

      for (const archName of archivedNames) {
        await supabase.from('jugadores').update({
          equipo: 'CE Manresa',
          temporada: '2026/27',
          activo: false
        }).ilike('nombre', `%${archName}%`);
      }

      const { data: dbJugadores } = await supabase
        .from('jugadores')
        .select('*')
        .eq('equipo', 'CE Manresa');

      if (dbJugadores && dbJugadores.length > 0) {
        finalPlayersList = dbJugadores;
      }
    } catch (err) {
      console.log('Nota: Error en operaciones Supabase, usando jugadores del Excel.');
    }
  }

  console.log(`✓ Total jugadores CE Manresa: ${finalPlayersList.length} (Activos: ${finalPlayersList.filter(j => j.activo).length}, Archivados: ${finalPlayersList.filter(j => !j.activo).length})`);

  const activeManresaJugadores = finalPlayersList.filter(j => j.activo);

  // --------------------------------------------------------------------------
  // 2. SESIONES DÍA CON RESULTADOS (364 DÍAS)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Guardando sesiones de la temporada en Supabase ---');
  const wsPlan = wb.Sheets['Planificacion'];
  const planRows = XLSX.utils.sheet_to_json(wsPlan, { header: 1 });

  const periodoRow = planRows[4] || [];
  const subperiodoRow = planRows[5] || [];
  const dateRow = planRows[8] || [];
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

    const evAm = evAmRow[c] ? String(evAmRow[c]).trim() : null;
    const evPm = evPmRow[c] ? String(evPmRow[c]).trim() : null;
    const rival = rivalRow[c] ? String(rivalRow[c]).trim() : null;
    const rawSemana = semanaRow[c];
    const semana = Number.isInteger(Number(rawSemana)) ? Number(rawSemana) : null;
    const comMicro = comMicroRow[c] ? String(comMicroRow[c]).trim() : null;
    const res = extractMatchResult(iso, rival);

    // Formatear rival con marcador si existe
    let cleanRival = rival;
    if (cleanRival && res && !cleanRival.includes(`(${res})`)) {
      cleanRival = `${cleanRival.replace(/\s*\(\d+[-:]\d+\)/, '')} (${res})`;
    }

    sesionesManresa.push({
      fecha: iso,
      equipo: 'CE Manresa',
      periodo: periodoRow[c] ? String(periodoRow[c]).trim() : null,
      subperiodo: subperiodoRow[c] ? String(subperiodoRow[c]).trim() : null,
      semana,
      md: mdRow[c] ? String(mdRow[c]).trim() : null,
      rival: cleanRival,
      evento_am: evAm,
      evento_pm: evPm,
      carga: cargaRow[c] !== undefined && cargaRow[c] !== null && !isNaN(Number(cargaRow[c])) ? Number(cargaRow[c]) : null,
      volumen: volRow[c] !== undefined && volRow[c] !== null && !isNaN(Number(volRow[c])) ? Number(volRow[c]) : null,
      intensidad: intRow[c] !== undefined && intRow[c] !== null && !isNaN(Number(intRow[c])) ? Number(intRow[c]) : null,
      comentario_microciclo: comMicro
    });
  }

  const sesionIdByFecha = new Map();
  if (isSupabaseOnline) {
    try {
      for (let i = 0; i < sesionesManresa.length; i += 100) {
        const chunk = sesionesManresa.slice(i, i + 100);
        await supabase.from('sesiones_dia').upsert(chunk, { onConflict: 'fecha' });
      }

      const { data: dbSesiones } = await supabase.from('sesiones_dia').select('id, fecha').eq('equipo', 'CE Manresa');
      (dbSesiones || []).forEach(s => sesionIdByFecha.set(s.fecha, s.id));
    } catch (err) {
      console.log('Nota: Supabase offline, continuando con generación de datos locales.');
    }
  }

  // --------------------------------------------------------------------------
  // 3. EXTRACCIÓN DE BBDD SHEET (HASTA 16 DE AGOSTO)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Extrayendo Datos y Minutos de BBDD Sheet ---');
  
  const finalBloquesMap = {};
  const finalPlayerEventsMap = {};
  const finalPlayerMinutesMap = {};
  const allComentariosList = [];
  const estadoDiarioMap = new Map();
  const bbddDatesSet = new Set();
  const bbddPlayerDayAssignments = new Map();

  if (wb.Sheets['BBDD']) {
    const wsBBDD = wb.Sheets['BBDD'];
    const bbddRows = XLSX.utils.sheet_to_json(wsBBDD, { header: 1 });
    const bbddHeaders = bbddRows[0] || [];

    const hJugIdx = bbddHeaders.indexOf('Jugador') !== -1 ? bbddHeaders.indexOf('Jugador') : 5;
    const hFechaIdx = bbddHeaders.indexOf('Fecha') !== -1 ? bbddHeaders.indexOf('Fecha') : 7;
    const hDispIdx = bbddHeaders.indexOf('Disponibilidad') !== -1 ? bbddHeaders.indexOf('Disponibilidad') : 18;
    const hObjIdx = bbddHeaders.indexOf('Objetivo') !== -1 ? bbddHeaders.indexOf('Objetivo') : 19;
    const hLesIdx = bbddHeaders.indexOf('Comentario Lesion') !== -1 ? bbddHeaders.indexOf('Comentario Lesion') : 20;
    const hMedIdx = bbddHeaders.indexOf('Comentario Medico') !== -1 ? bbddHeaders.indexOf('Comentario Medico') : 21;
    const hNutIdx = bbddHeaders.indexOf('Comentario Nutricional') !== -1 ? bbddHeaders.indexOf('Comentario Nutricional') : 22;
    const hFisIdx = bbddHeaders.indexOf('Comentario Fisico') !== -1 ? bbddHeaders.indexOf('Comentario Fisico') : 23;
    const hTecIdx = bbddHeaders.indexOf('Comentario Tecnico') !== -1 ? bbddHeaders.indexOf('Comentario Tecnico') : 24;
    const hNumEvIdx = bbddHeaders.indexOf('Nº Evento') !== -1 ? bbddHeaders.indexOf('Nº Evento') : 25;
    const hTipoEvIdx = bbddHeaders.indexOf('Tipo de Evento') !== -1 ? bbddHeaders.indexOf('Tipo de Evento') : 40;
    const hHoraIdx = bbddHeaders.indexOf('Hora del evento') !== -1 ? bbddHeaders.indexOf('Hora del evento') : 41;
    const hLugarIdx = bbddHeaders.indexOf('Lugar del evento') !== -1 ? bbddHeaders.indexOf('Lugar del evento') : 42;
    const hDurIdx = bbddHeaders.indexOf('Duracion del evento') !== -1 ? bbddHeaders.indexOf('Duracion del evento') : 43;
    const hOrientIdx = bbddHeaders.indexOf('Orientacion del evento') !== -1 ? bbddHeaders.indexOf('Orientacion del evento') : 44;
    const hCargaIdx = bbddHeaders.indexOf('Carga del evento') !== -1 ? bbddHeaders.indexOf('Carga del evento') : 45;
    const hGenEvIdx = bbddHeaders.indexOf('Comentario general evento') !== -1 ? bbddHeaders.indexOf('Comentario general evento') : 46;
    const hNumJugIdx = bbddHeaders.indexOf('Nº Jugadores del evento') !== -1 ? bbddHeaders.indexOf('Nº Jugadores del evento') : 47;
    const hRealizaIdx = bbddHeaders.indexOf('REALIZA EL EVENTO') !== -1 ? bbddHeaders.indexOf('REALIZA EL EVENTO') : 48;

    for (let i = 1; i < bbddRows.length; i++) {
      const row = bbddRows[i];
      if (!row) continue;

      const rawJugador = row[hJugIdx];
      const rawFecha = row[hFechaIdx];
      if (!rawJugador || !rawFecha) continue;

      const fechaISO = excelDateToISO(rawFecha);
      if (!fechaISO || !fechaISO.startsWith('202')) continue;

      bbddDatesSet.add(fechaISO);

      const jNameNorm = norm(rawJugador);
      const rawTipo = row[hTipoEvIdx];
      const specificCode = standardizeSpecificCode(rawTipo);
      const numEv = Number(row[hNumEvIdx] || 1);
      const slotIdx = Math.max(0, Math.min(5, numEv - 1));

      if (specificCode) {
        const blockKey = `${fechaISO}_slot_${slotIdx}`;
        if (!finalBloquesMap[blockKey]) {
          const rawHora = row[hHoraIdx];
          const formattedHora = formatExcelTimeToHHMM(rawHora);
          const block = {
            id: blockKey,
            day_id: `d_${fechaISO}`,
            fecha: fechaISO,
            slot: slotIdx,
            tipo: specificCode,
            hora: formattedHora,
            lugar: row[hLugarIdx] ? String(row[hLugarIdx]).trim() : '',
            duracion: row[hDurIdx] ? String(row[hDurIdx]).trim() : '',
            orientacion: row[hOrientIdx] ? String(row[hOrientIdx]).trim() : '',
            carga: row[hCargaIdx] ? String(row[hCargaIdx]).trim() : '',
            comentario: row[hGenEvIdx] ? String(row[hGenEvIdx]).trim() : '',
            num_jugadores: row[hNumJugIdx] ? String(row[hNumJugIdx]).trim() : ''
          };
          finalBloquesMap[blockKey] = block;
          finalBloquesMap[`d_${fechaISO}_slot_${slotIdx}`] = block;
        }
      }

      // CASO TEAM
      if (jNameNorm === 'TEAM' || jNameNorm === 'EQUIPO') {
        const comGen = row[hGenEvIdx] ? String(row[hGenEvIdx]).trim() : '';
        const comFis = row[hFisIdx] ? String(row[hFisIdx]).trim() : '';
        const comTec = row[hTecIdx] ? String(row[hTecIdx]).trim() : '';
        const comMed = row[hMedIdx] ? String(row[hMedIdx]).trim() : '';
        const comLes = row[hLesIdx] ? String(row[hLesIdx]).trim() : '';

        if (comGen) allComentariosList.push({ id: `team_gen_${fechaISO}_${i}`, jugador_id: "TEAM", day_id: `d_${fechaISO}`, fecha: fechaISO, tipo: "OTR", texto: comGen });
        if (comFis) allComentariosList.push({ id: `team_fis_${fechaISO}_${i}`, jugador_id: "TEAM", day_id: `d_${fechaISO}`, fecha: fechaISO, tipo: "CON", texto: comFis });
        if (comTec) allComentariosList.push({ id: `team_tec_${fechaISO}_${i}`, jugador_id: "TEAM", day_id: `d_${fechaISO}`, fecha: fechaISO, tipo: "TEC", texto: comTec });
        if (comMed) allComentariosList.push({ id: `team_med_${fechaISO}_${i}`, jugador_id: "TEAM", day_id: `d_${fechaISO}`, fecha: fechaISO, tipo: "OTR", texto: comMed });
        if (comLes) allComentariosList.push({ id: `team_les_${fechaISO}_${i}`, jugador_id: "TEAM", day_id: `d_${fechaISO}`, fecha: fechaISO, tipo: "FIS", texto: comLes });
        continue;
      }

      // CASO JUGADOR INDIVIDUAL
      let jugador = (finalPlayersList || []).find(j => norm(j.nombre) === jNameNorm || (j.apodo && norm(j.apodo) === jNameNorm));
      if (!jugador) continue;
      const jugadorId = jugador.id;
      const pApodo = (jugador.apodo || '').toUpperCase().trim();
      const pNombre = (jugador.nombre || '').toUpperCase().trim();

      const duracion = row[hDurIdx] ? String(row[hDurIdx]).trim() : '';
      const realizaRaw = norm(row[hRealizaIdx]);
      const realiza = realizaRaw === 'SI' || realizaRaw === '1' || (duracion !== '' && Number(duracion) > 0);

      const pDayKey = `${jugadorId}_${fechaISO}`;
      if (!bbddPlayerDayAssignments.has(pDayKey)) {
        bbddPlayerDayAssignments.set(pDayKey, { jugador, fechaISO, slots: new Map() });
      }

      if (specificCode) {
        bbddPlayerDayAssignments.get(pDayKey).slots.set(slotIdx, { tipo: specificCode, duracion, realiza });

        if (duracion !== '' || realiza) {
          const minObj = { minutos: duracion || "0", realiza: Boolean(realiza), manual: false };
          finalPlayerMinutesMap[`${jugadorId}_${fechaISO}_ev_${fechaISO}_${slotIdx}`] = minObj;
          finalPlayerMinutesMap[`${jugadorId}_d_${fechaISO}_slot_${slotIdx}`] = minObj;
          finalPlayerMinutesMap[`${jugadorId}_${fechaISO}_${slotIdx}`] = minObj;
          finalPlayerMinutesMap[`${jugadorId}_${fechaISO}_${specificCode}`] = minObj;
          if (pApodo) {
            finalPlayerMinutesMap[`${pApodo}_${fechaISO}_${slotIdx}`] = minObj;
            finalPlayerMinutesMap[`${pApodo}_${fechaISO}_${specificCode}`] = minObj;
          }
          if (pNombre) {
            finalPlayerMinutesMap[`${pNombre}_${fechaISO}_${slotIdx}`] = minObj;
            finalPlayerMinutesMap[`${pNombre}_${fechaISO}_${specificCode}`] = minObj;
          }
        }
      }

      // Estados diarios y comentarios individuales
      const key = `${jugadorId}_${fechaISO}`;
      const prev = estadoDiarioMap.get(key) || { jugador_id: jugadorId, fechaISO, disponibilidad: null };

      if (row[hDispIdx] && !prev.disponibilidad) prev.disponibilidad = String(row[hDispIdx]).trim().toUpperCase();
      if (row[hObjIdx]) prev.objetivo = prev.objetivo ? `${prev.objetivo}\n${row[hObjIdx]}` : String(row[hObjIdx]).trim();
      if (row[hLesIdx]) {
        prev.comentario_lesiones = prev.comentario_lesiones ? `${prev.comentario_lesiones}\n${row[hLesIdx]}` : String(row[hLesIdx]).trim();
        allComentariosList.push({ id: `p_les_${jugadorId}_${fechaISO}_${i}`, jugador_id: jugadorId, day_id: `d_${fechaISO}`, fecha: fechaISO, tipo: "FIS", texto: String(row[hLesIdx]).trim() });
      }
      if (row[hMedIdx]) {
        prev.comentario_medico = prev.comentario_medico ? `${prev.comentario_medico}\n${row[hMedIdx]}` : String(row[hMedIdx]).trim();
        allComentariosList.push({ id: `p_med_${jugadorId}_${fechaISO}_${i}`, jugador_id: jugadorId, day_id: `d_${fechaISO}`, fecha: fechaISO, tipo: "OTR", texto: String(row[hMedIdx]).trim() });
      }
      if (row[hGenEvIdx]) prev.comentario_medico = prev.comentario_medico ? `${prev.comentario_medico}\n${row[hGenEvIdx]}` : String(row[hGenEvIdx]).trim();
      if (row[hNutIdx]) {
        prev.comentario_nutricion = String(row[hNutIdx]).trim();
        allComentariosList.push({ id: `p_nut_${jugadorId}_${fechaISO}_${i}`, jugador_id: jugadorId, day_id: `d_${fechaISO}`, fecha: fechaISO, tipo: "OTR", texto: String(row[hNutIdx]).trim() });
      }
      if (row[hFisIdx]) {
        prev.comentario_fisico = prev.comentario_fisico ? `${prev.comentario_fisico}\n${row[hFisIdx]}` : String(row[hFisIdx]).trim();
        allComentariosList.push({ id: `p_fis_${jugadorId}_${fechaISO}_${i}`, jugador_id: jugadorId, day_id: `d_${fechaISO}`, fecha: fechaISO, tipo: "CON", texto: String(row[hFisIdx]).trim() });
      }
      if (row[hTecIdx]) {
        prev.comentario_tecnico = prev.comentario_tecnico ? `${prev.comentario_tecnico}\n${row[hTecIdx]}` : String(row[hTecIdx]).trim();
        allComentariosList.push({ id: `p_tec_${jugadorId}_${fechaISO}_${i}`, jugador_id: jugadorId, day_id: `d_${fechaISO}`, fecha: fechaISO, tipo: "TEC", texto: String(row[hTecIdx]).trim() });
      }

      estadoDiarioMap.set(key, prev);
    }
  }

  // Consolidar asignaciones de BBDD
  for (const { jugador, fechaISO, slots } of bbddPlayerDayAssignments.values()) {
    const performedCodes = [];
    let hasAnyRealiza = false;
    let hasExplicitNo = false;

    const sortedSlots = Array.from(slots.entries()).sort((a, b) => a[0] - b[0]);
    for (const [slotIdx, slotInfo] of sortedSlots) {
      const slotPlayerKey = `${jugador.id}_${fechaISO}_ev_${fechaISO}_${slotIdx}`;
      if (slotInfo.realiza) {
        hasAnyRealiza = true;
        if (!performedCodes.includes(slotInfo.tipo)) performedCodes.push(slotInfo.tipo);
        finalPlayerEventsMap[slotPlayerKey] = slotInfo.tipo;
      } else {
        hasExplicitNo = true;
        finalPlayerEventsMap[slotPlayerKey] = 'NO';
      }
    }

    let finalDayVal = '';
    if (performedCodes.length > 0) finalDayVal = performedCodes.join(', ');
    else if (hasExplicitNo) finalDayVal = 'NO';

    if (finalDayVal) {
      const pApodo = (jugador.apodo || '').toUpperCase().trim();
      const pNombre = (jugador.nombre || '').toUpperCase().trim();
      finalPlayerEventsMap[`${jugador.id}_d_${fechaISO}`] = finalDayVal;
      finalPlayerEventsMap[`${jugador.id}_${fechaISO}`] = finalDayVal;
      if (pApodo) finalPlayerEventsMap[`${pApodo}_${fechaISO}`] = finalDayVal;
      if (pNombre) finalPlayerEventsMap[`${pNombre}_${fechaISO}`] = finalDayVal;
    }
  }

  // --------------------------------------------------------------------------
  // 4. PLANIFICACIÓN COMPLETA (A PARTIR DEL 15 DE AGOSTO HASTA FIN DE TEMPORADA)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Generando Eventos Específicos, Asignaciones, Minutos y Comentarios TEAM post-15 Ago ---');

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

    const evAm = evAmRow[c] ? String(evAmRow[c]).trim().toUpperCase() : '';
    const evPm = evPmRow[c] ? String(evPmRow[c]).trim().toUpperCase() : '';
    const rival = rivalRow[c] ? String(rivalRow[c]).trim() : '';
    const vol = volRow[c] ? String(volRow[c]).trim() : '90';
    const carga = cargaRow[c] ? String(cargaRow[c]).trim() : '';
    const comMicro = comMicroRow[c] ? String(comMicroRow[c]).trim() : '';
    const matchRes = extractMatchResult(iso, rival);

    const daySpecificCodes = [];
    let dayTeamComment = '';
    let dayTeamCommentTipo = 'CON';

    // A partir del 15 de agosto (o si la fecha no tiene ya bloques en BBDD)
    const hasBlocksInBBDD = finalBloquesMap[`${iso}_slot_0`] || finalBloquesMap[`${iso}_slot_1`];

    if (!hasBlocksInBBDD) {
      // 1. Actividad Collbaix
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
          comentario: 'Movilidad y prevención',
          num_jugadores: String(activeManresaJugadores.length)
        };
        finalBloquesMap[`${iso}_slot_0`] = b0;
        finalBloquesMap[`d_${iso}_slot_0`] = b0;
        daySpecificCodes.push('Co');

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
          comentario: 'Subida a Collbaix - Trabajo de fuerza y resistencia',
          num_jugadores: String(activeManresaJugadores.length)
        };
        finalBloquesMap[`${iso}_slot_1`] = b1;
        finalBloquesMap[`d_${iso}_slot_1`] = b1;
        daySpecificCodes.push('Op');

        dayTeamComment = 'Subida a Collbaix - Trabajo de fuerza y resistencia';
        dayTeamCommentTipo = 'CON';
      }
      // 2. Actividad Golf/Pádel
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
          comentario: 'Actividad de equipo: Golf / Pádel',
          num_jugadores: String(activeManresaJugadores.length)
        };
        finalBloquesMap[`${iso}_slot_0`] = b0;
        finalBloquesMap[`d_${iso}_slot_0`] = b0;
        daySpecificCodes.push('Ot');

        dayTeamComment = 'Actividad de cohesión de grupo: Golf / Pádel';
        dayTeamCommentTipo = 'OTR';
      }
      // 3. Partidos (Amistosos o Liga)
      else if (rival || evPm === 'PAV' || evPm === 'PAL' || evPm === 'PV' || evPm === 'PL') {
        const isAmistoso = iso < '2026-09-01' || evPm === 'PAV' || evPm === 'PAL';
        const matchCode = isAmistoso ? 'PaAm' : 'Pa';
        const rivalClean = rival ? rival.replace(/\s*\(\d+[-:]\d+\)/, '') : 'Rival';
        const isVisitante = evAm === 'V' || evAm === 'VI' || evPm === 'PAV' || evPm === 'PV';

        if (isVisitante) {
          // Viaje + Partido
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
            comentario: `Viaje y desplazamiento vs ${rivalClean}`,
            num_jugadores: String(activeManresaJugadores.length)
          };
          finalBloquesMap[`${iso}_slot_0`] = b0;
          finalBloquesMap[`d_${iso}_slot_0`] = b0;
          daySpecificCodes.push('Vi');

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
            comentario: matchRes ? `Rival: ${rivalClean} (${matchRes})` : `Rival: ${rivalClean}`,
            num_jugadores: String(activeManresaJugadores.length)
          };
          finalBloquesMap[`${iso}_slot_1`] = b1;
          finalBloquesMap[`d_${iso}_slot_1`] = b1;
          daySpecificCodes.push(matchCode);

          dayTeamComment = `Partido ${isAmistoso ? 'Amistoso' : 'Oficial'} vs ${rivalClean}${matchRes ? ` (${matchRes})` : ''}`;
          dayTeamCommentTipo = 'TEC';
        } else {
          // Solo Partido Local en Congost
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
            comentario: matchRes ? `Rival: ${rivalClean} (${matchRes})` : `Rival: ${rivalClean}`,
            num_jugadores: String(activeManresaJugadores.length)
          };
          finalBloquesMap[`${iso}_slot_0`] = b0;
          finalBloquesMap[`d_${iso}_slot_0`] = b0;
          daySpecificCodes.push(matchCode);

          dayTeamComment = `Partido ${isAmistoso ? 'Amistoso' : 'Oficial'} vs ${rivalClean}${matchRes ? ` (${matchRes})` : ''}`;
          dayTeamCommentTipo = 'TEC';
        }
      }
      // 4. Entrenamientos (E) o días de microciclo regular (Miércoles a Sábado / Domingo)
      else if (evAm === 'E' || evPm === 'E' || (iso >= '2026-09-06' && !['2026-09-07', '2026-09-08', '2026-09-14', '2026-09-15'].includes(iso))) {
        const isMatchDay = iso === '2026-09-13' || (new Date(iso).getDay() === 0 && !rival);
        
        if (isMatchDay) {
          // Partido de Liga de la jornada
          const b0 = {
            id: `${iso}_slot_0`,
            day_id: `d_${iso}`,
            fecha: iso,
            slot: 0,
            tipo: 'Pa',
            hora: '17:00',
            lugar: 'Congost',
            duracion: '90',
            orientacion: 'Oficial',
            carga: '8',
            comentario: 'Jornada de Liga',
            num_jugadores: String(activeManresaJugadores.length)
          };
          finalBloquesMap[`${iso}_slot_0`] = b0;
          finalBloquesMap[`d_${iso}_slot_0`] = b0;
          daySpecificCodes.push('Pa');

          dayTeamComment = 'Partido Oficial de Liga';
          dayTeamCommentTipo = 'TEC';
        } else {
          // Sesión de entrenamiento Co + Op
          const b0 = {
            id: `${iso}_slot_0`,
            day_id: `d_${iso}`,
            fecha: iso,
            slot: 0,
            tipo: 'Co',
            hora: '18:30',
            lugar: 'Congost',
            duracion: '20',
            orientacion: iso === '2026-09-11' ? 'Activación' : 'Pre',
            carga: '3',
            comentario: iso === '2026-09-11' ? 'Velocidad y reactividad' : 'Prevención y movilidad',
            num_jugadores: String(activeManresaJugadores.length)
          };
          finalBloquesMap[`${iso}_slot_0`] = b0;
          finalBloquesMap[`d_${iso}_slot_0`] = b0;
          daySpecificCodes.push('Co');

          const b1 = {
            id: `${iso}_slot_1`,
            day_id: `d_${iso}`,
            fecha: iso,
            slot: 1,
            tipo: 'Op',
            hora: '18:50',
            lugar: 'Congost',
            duracion: iso === '2026-09-12' ? '60' : '75',
            orientacion: iso === '2026-09-10' ? 'Táctica' : iso === '2026-09-11' ? 'ABP' : 'Campo',
            carga: carga || (iso === '2026-09-10' ? '7' : '6'),
            comentario: iso === '2026-09-10' ? 'Sesión táctica y transiciones' : iso === '2026-09-11' ? 'Acciones a balón parado y reducido' : 'Sesión de campo',
            num_jugadores: String(activeManresaJugadores.length)
          };
          finalBloquesMap[`${iso}_slot_1`] = b1;
          finalBloquesMap[`d_${iso}_slot_1`] = b1;
          daySpecificCodes.push('Op');

          if (iso === '2026-09-09') dayTeamComment = 'Sesión de entrenamiento (Congost) - Inicio de microciclo';
          else if (iso === '2026-09-10') { dayTeamComment = 'Sesión de entrenamiento (Congost) - Carga táctica principal'; dayTeamCommentTipo = 'TEC'; }
          else if (iso === '2026-09-11') dayTeamComment = 'Sesión de entrenamiento (Congost) - Velocidad y ABP';
          else if (iso === '2026-09-12') { dayTeamComment = 'Sesión de activación y repaso táctico previo a la jornada'; dayTeamCommentTipo = 'TEC'; }
          else dayTeamComment = 'Sesión de entrenamiento (Congost)';
          if (dayTeamCommentTipo !== 'TEC') dayTeamCommentTipo = 'CON';
        }
      } else if (['2026-09-07', '2026-09-08', '2026-09-14', '2026-09-15'].includes(iso)) {
        if (iso === '2026-09-07') {
          dayTeamComment = 'Día de descanso y recuperación activa post-partido vs Arnedo';
          dayTeamCommentTipo = 'CON';
        } else if (iso === '2026-09-08') {
          dayTeamComment = 'Día de descanso semanal';
          dayTeamCommentTipo = 'OTR';
        } else if (iso === '2026-09-14') {
          dayTeamComment = 'Día de descanso y recuperación post-partido';
          dayTeamCommentTipo = 'CON';
        } else if (iso === '2026-09-15') {
          dayTeamComment = 'Día de descanso semanal / Preparación próximo microciclo';
          dayTeamCommentTipo = 'OTR';
        }
      }
    } else {
      // Recoger códigos de BBDD
      for (let s = 0; s < 6; s++) {
        const b = finalBloquesMap[`${iso}_slot_${s}`];
        if (b && b.tipo && !EXCLUDED_MACRO_CODES.has(b.tipo.toUpperCase())) {
          daySpecificCodes.push(b.tipo);
        }
      }
    }

    // Comentarios de TEAM para días post-15 de agosto
    if (dayTeamComment) {
      allComentariosList.push({
        id: `team_post_${iso}`,
        jugador_id: "TEAM",
        day_id: `d_${iso}`,
        fecha: iso,
        tipo: dayTeamCommentTipo,
        texto: dayTeamComment
      });
    }

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

    // ASIGNACIONES DE TODOS LOS JUGADORES ACTIVOS PARA DÍAS >= 2026-08-15
    if (daySpecificCodes.length > 0) {
      const assignedDayStr = daySpecificCodes.join(', ');

      activeManresaJugadores.forEach(jugador => {
        const jugadorId = jugador.id;
        const pApodo = (jugador.apodo || '').toUpperCase().trim();
        const pNombre = (jugador.nombre || '').toUpperCase().trim();

        // Check if player row has an explicit mark in column c of Planificacion sheet
        const row = playerPlanRowsMap.get(pApodo) || playerPlanRowsMap.get(pNombre) || playerPlanRowsMap.get(norm(jugador.nombre));
        const playerStatusInPlan = row ? (row[c] || '').toString().trim().toUpperCase() : '';

        const isUnavailable = playerStatusInPlan === 'L' || playerStatusInPlan === 'NDR' || playerStatusInPlan === 'NDO';
        const assignedVal = isUnavailable ? 'NO' : assignedDayStr;

        finalPlayerEventsMap[`${jugadorId}_d_${iso}`] = assignedVal;
        finalPlayerEventsMap[`${jugadorId}_${iso}`] = assignedVal;
        if (pApodo) finalPlayerEventsMap[`${pApodo}_${iso}`] = assignedVal;
        if (pNombre) finalPlayerEventsMap[`${pNombre}_${iso}`] = assignedVal;

        daySpecificCodes.forEach((code, sIdx) => {
          const slotBlock = finalBloquesMap[`${iso}_slot_${sIdx}`];
          const durMin = isUnavailable ? "0" : (slotBlock?.duracion || (code === 'Co' ? '20' : code === 'Op' ? '75' : code === 'Vi' ? '120' : '90'));
          const minObj = {
            minutos: durMin,
            realiza: !isUnavailable,
            manual: false
          };

          const slotEventVal = isUnavailable ? 'NO' : code;
          finalPlayerEventsMap[`${jugadorId}_${iso}_ev_${iso}_${sIdx}`] = slotEventVal;
          finalPlayerEventsMap[`${jugadorId}_d_${iso}_slot_${sIdx}`] = slotEventVal;

          finalPlayerMinutesMap[`${jugadorId}_${iso}_ev_${iso}_${sIdx}`] = minObj;
          finalPlayerMinutesMap[`${jugadorId}_d_${iso}_slot_${sIdx}`] = minObj;
          finalPlayerMinutesMap[`${jugadorId}_${iso}_${sIdx}`] = minObj;
          finalPlayerMinutesMap[`${jugadorId}_${iso}_${code}`] = minObj;
          if (pApodo) {
            finalPlayerMinutesMap[`${pApodo}_${iso}_${sIdx}`] = minObj;
            finalPlayerMinutesMap[`${pApodo}_${iso}_${code}`] = minObj;
          }
          if (pNombre) {
            finalPlayerMinutesMap[`${pNombre}_${iso}_${sIdx}`] = minObj;
            finalPlayerMinutesMap[`${pNombre}_${iso}_${code}`] = minObj;
          }
        });
      });
    }
  }

  // --------------------------------------------------------------------------
  // 5. GUARDAR ESTADOS DIARIOS EN SUPABASE
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Guardando Estados Diarios y Comentarios en Supabase ---');
  
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

  if (isSupabaseOnline) {
    try {
      const manresaJugadorIds = Array.from(new Set((finalPlayersList || []).map(j => j.id)));
      for (let i = 0; i < manresaJugadorIds.length; i += 10) {
        const chunkIds = manresaJugadorIds.slice(i, i + 10);
        await supabase.from('estado_diario_jugador').delete().in('jugador_id', chunkIds);
      }

      for (let i = 0; i < estadosToInsert.length; i += 500) {
        const chunk = estadosToInsert.slice(i, i + 500);
        await supabase.from('estado_diario_jugador').insert(chunk);
      }

      console.log(`✓ Insertados ${estadosToInsert.length} estados diarios en Supabase.`);
    } catch (err) {
      console.log('Nota: Supabase offline, continuando.');
    }
  }

  // --------------------------------------------------------------------------
  // 6. GUARDAR JSON DE SINCRONIZACIÓN (PUBLIC & ROOT)
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Guardando JSON de Sincronización Local ---');

  const publicSyncPath = '/Users/MiquelNadalGaya/web/public/calendar_sync_data.json';
  const rootSyncPath = '/Users/MiquelNadalGaya/web/calendar_sync_data.json';

  let existingData = { eventosBloquesMap: {}, playerEventsMap: {}, playerMinutesMap: {}, comentarios: [] };
  if (fs.existsSync(publicSyncPath)) {
    try {
      existingData = JSON.parse(fs.readFileSync(publicSyncPath, 'utf8'));
    } catch (e) {}
  }

  // Conservar AE Prat
  let pratJugadorIds = new Set();
  if (isSupabaseOnline) {
    try {
      const { data: dbPratJugadores } = await supabase.from('jugadores').select('id').eq('equipo', 'AE Prat');
      pratJugadorIds = new Set((dbPratJugadores || []).map(j => j.id));
    } catch (e) {}
  }

  for (const [k, v] of Object.entries(existingData.playerEventsMap || {})) {
    const pId = k.split('_')[0];
    if (pratJugadorIds.has(pId)) {
      finalPlayerEventsMap[k] = v;
      if (existingData.playerMinutesMap && existingData.playerMinutesMap[k]) {
        finalPlayerMinutesMap[k] = existingData.playerMinutesMap[k];
      }
    }
  }

  for (const [k, v] of Object.entries(existingData.eventosBloquesMap || {})) {
    if (v.lugar && (v.lugar.toLowerCase().includes('prat') || v.lugar.toLowerCase().includes('sagnier'))) {
      finalBloquesMap[k] = v;
    }
  }

  // Limpiar cualquier residuo de eventos macro
  for (const k of Object.keys(finalBloquesMap)) {
    const b = finalBloquesMap[k];
    if (b && b.tipo && EXCLUDED_MACRO_CODES.has(b.tipo.toUpperCase())) {
      delete finalBloquesMap[k];
    }
  }

  for (const k of Object.keys(finalPlayerEventsMap)) {
    const val = String(finalPlayerEventsMap[k]).trim().toUpperCase();
    if (EXCLUDED_MACRO_CODES.has(val)) {
      delete finalPlayerEventsMap[k];
    }
  }

  // Deduplicar comentarios
  const comentariosMap = new Map();
  allComentariosList.forEach(c => {
    if (c) {
      const k = c.id || `${c.jugador_id}_${c.fecha}_${c.tipo}_${c.texto}`;
      comentariosMap.set(k, c);
    }
  });
  const dedupComentarios = Array.from(comentariosMap.values());

  const finalSyncData = {
    updated_at: new Date().toISOString(),
    eventosBloquesMap: finalBloquesMap,
    playerEventsMap: finalPlayerEventsMap,
    playerMinutesMap: finalPlayerMinutesMap,
    comentarios: dedupComentarios
  };

  fs.writeFileSync(publicSyncPath, JSON.stringify(finalSyncData, null, 2), 'utf8');
  fs.writeFileSync(rootSyncPath, JSON.stringify(finalSyncData, null, 2), 'utf8');

  console.log(`\n================================================================`);
  console.log(` RESTAURACIÓN INTEGRAL COMPLETADA CON ÉXITO:`);
  console.log(`  - Bloques de eventos específicos: ${Object.keys(finalBloquesMap).length}`);
  console.log(`  - Minutos de jugadores por evento: ${Object.keys(finalPlayerMinutesMap).length}`);
  console.log(`  - Asignaciones de eventos específicos a jugadores: ${Object.keys(finalPlayerEventsMap).length}`);
  console.log(`  - Comentarios (TEAM y Jugadores): ${dedupComentarios.length} (TEAM: ${dedupComentarios.filter(c => c.jugador_id === 'TEAM').length})`);
  console.log(`  - Archivo guardado en: ${publicSyncPath}`);
  console.log(`================================================================\n`);
}

run().catch(err => {
  console.error('Error fatal durante la restauración:', err);
  process.exit(1);
});
