/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const manresaPath = '/Users/MiquelNadalGaya/web/planificacion_manresa.xlsm';
const pratPath = '/Users/MiquelNadalGaya/Desktop/MAIK/Planificació AE PRAT 25-26.xlsm';

console.log(`\n================================================================`);
console.log(` RECUPERACIÓN TOTAL DE DATOS: TODAS LAS SEMANAS, ASIGNACIONES,`);
console.log(` LESIONES, ESTADOS DIARIOS Y EVENTOS DE AMBOS EQUIPOS`);
console.log(`================================================================\n`);

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan credenciales de Supabase en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

const norm = (s) => (s || '').toString().trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

async function main() {
  console.log('--- 1. Cargar y sincronizar Jugadores en Supabase ---');
  
  let manresaWb = null;
  if (fs.existsSync(manresaPath)) {
    console.log(`Leyendo Excel Manresa: ${manresaPath}...`);
    manresaWb = XLSX.readFile(manresaPath, { cellDates: false });
  }

  let pratWb = null;
  if (fs.existsSync(pratPath)) {
    console.log(`Leyendo Excel Prat: ${pratPath}...`);
    pratWb = XLSX.readFile(pratPath, { cellDates: false });
  }

  // Sincronizar Deportistas Manresa
  if (manresaWb && manresaWb.Sheets['Deportistas']) {
    const depRows = XLSX.utils.sheet_to_json(manresaWb.Sheets['Deportistas'], { header: 1 });
    const headers = depRows[0] || [];
    const hNomIdx = headers.findIndex(h => /NOM_COMPLET|NOMBRE/i.test(String(h)));
    const hApodoIdx = headers.findIndex(h => /NOM_CURT|APODO/i.test(String(h)));
    const hPosIdx = headers.findIndex(h => /POSIC/i.test(String(h)));
    const hDorsalIdx = headers.findIndex(h => /DORSAL|COR_ID/i.test(String(h)));

    for (let i = 1; i < depRows.length; i++) {
      const r = depRows[i];
      if (!r) continue;
      const nombre = r[hNomIdx];
      if (!nombre || norm(nombre) === 'TEAM') continue;
      const apodo = r[hApodoIdx] ? String(r[hApodoIdx]).trim() : null;
      const posicion = r[hPosIdx] ? String(r[hPosIdx]).trim() : null;
      const dorsal = r[hDorsalIdx] ? String(r[hDorsalIdx]).trim() : null;

      await supabase.from('jugadores').upsert({
        nombre: String(nombre).trim(),
        apodo: apodo || undefined,
        posicion: posicion || undefined,
        cor_id: dorsal || undefined,
        equipo: 'CE Manresa',
        activo: true
      }, { onConflict: 'nombre' });
    }
  }

  // Sincronizar Deportistas Prat
  if (pratWb && pratWb.Sheets['Deportistas']) {
    const depRows = XLSX.utils.sheet_to_json(pratWb.Sheets['Deportistas'], { header: 1 });
    const headers = depRows[0] || [];
    const hNomIdx = headers.findIndex(h => /NOM_COMPLET|NOMBRE/i.test(String(h)));
    const hApodoIdx = headers.findIndex(h => /NOM_CURT|APODO/i.test(String(h)));
    const hPosIdx = headers.findIndex(h => /POSIC/i.test(String(h)));
    const hDorsalIdx = headers.findIndex(h => /DORSAL|COR_ID/i.test(String(h)));

    for (let i = 1; i < depRows.length; i++) {
      const r = depRows[i];
      if (!r) continue;
      const nombre = r[hNomIdx];
      if (!nombre || norm(nombre) === 'TEAM') continue;
      const apodo = r[hApodoIdx] ? String(r[hApodoIdx]).trim() : null;
      const posicion = r[hPosIdx] ? String(r[hPosIdx]).trim() : null;
      const dorsal = r[hDorsalIdx] ? String(r[hDorsalIdx]).trim() : null;

      await supabase.from('jugadores').upsert({
        nombre: String(nombre).trim(),
        apodo: apodo || undefined,
        posicion: posicion || undefined,
        cor_id: dorsal || undefined,
        equipo: 'AE Prat',
        activo: true
      }, { onConflict: 'nombre' });
    }
  }

  // Obtener todos los jugadores de Supabase
  const { data: allJugadores, error: errJugs } = await supabase.from('jugadores').select('*');
  if (errJugs) {
    console.error('Error obteniendo jugadores:', errJugs);
    process.exit(1);
  }
  console.log(`Jugadores registrados en base de datos: ${allJugadores.length}`);

  const jugadorMap = new Map();
  allJugadores.forEach(j => {
    jugadorMap.set(norm(j.nombre), j.id);
    if (j.apodo) jugadorMap.set(norm(j.apodo), j.id);
    if (j.equipo) {
      jugadorMap.set(`${norm(j.equipo)}_${norm(j.nombre)}`, j.id);
      if (j.apodo) jugadorMap.set(`${norm(j.equipo)}_${norm(j.apodo)}`, j.id);
      if (j.cor_id) jugadorMap.set(`${norm(j.equipo)}_dorsal_${j.cor_id}`, j.id);
    }
  });

  console.log('\n--- 2. Sincronizar TODAS las Sesiones de Día (`sesiones_dia`) ---');
  
  function extractSesiones(wb, equipo) {
    if (!wb || !wb.Sheets['Planificacion']) return [];
    const ws = wb.Sheets['Planificacion'];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const dateRow = rows[8] || [];
    const periodoRow = rows[4] || [];
    const subperiodoRow = rows[5] || [];
    const semanaRow = rows[9] || rows[6] || [];
    const mdRow = rows[10] || [];
    const rivalRow = rows[11] || [];
    const evAmRow = rows[12] || [];
    const evPmRow = rows[13] || [];
    const cargaRow = rows[14] || [];
    const volRow = rows[15] || [];
    const intRow = rows[16] || [];
    const comMicroRow = rows[17] || [];

    const sesiones = [];
    for (let c = 10; c < dateRow.length; c++) {
      const rawDate = dateRow[c];
      if (!rawDate) continue;
      const iso = excelDateToISO(rawDate);
      if (!iso) continue;

      const evAm = evAmRow[c] ? String(evAmRow[c]).trim() : null;
      const evPm = evPmRow[c] ? String(evPmRow[c]).trim() : null;
      const rival = rivalRow[c] ? String(rivalRow[c]).trim() : null;
      const mainEvent = evAm || evPm || (rival ? 'P' : null);

      const rawSemana = semanaRow[c];
      const parsedSemana = Number.isInteger(Number(rawSemana)) ? Number(rawSemana) : null;

      sesiones.push({
        fecha: iso,
        equipo,
        periodo: periodoRow[c] ? String(periodoRow[c]).trim() : null,
        subperiodo: subperiodoRow[c] ? String(subperiodoRow[c]).trim() : null,
        semana: parsedSemana,
        md: mdRow[c] ? String(mdRow[c]).trim() : null,
        rival: rival || null,
        evento_am: mainEvent,
        evento_pm: evPm || null,
        carga: cargaRow[c] !== undefined && cargaRow[c] !== null && !isNaN(Number(cargaRow[c])) ? Number(cargaRow[c]) : null,
        volumen: volRow[c] !== undefined && volRow[c] !== null && !isNaN(Number(volRow[c])) ? Number(volRow[c]) : null,
        intensidad: intRow[c] !== undefined && intRow[c] !== null && !isNaN(Number(intRow[c])) ? Number(intRow[c]) : null,
        comentario_microciclo: comMicroRow[c] ? String(comMicroRow[c]).trim() : null
      });
    }
    return sesiones;
  }

  const manresaSesiones = extractSesiones(manresaWb, 'CE Manresa');
  const pratSesiones = extractSesiones(pratWb, 'AE Prat');
  console.log(`Sesiones Manresa extraídas: ${manresaSesiones.length}`);
  console.log(`Sesiones Prat extraídas: ${pratSesiones.length}`);

  const allSesiones = [...manresaSesiones, ...pratSesiones];
  for (let i = 0; i < allSesiones.length; i += 100) {
    const chunk = allSesiones.slice(i, i + 100);
    const { error } = await supabase.from('sesiones_dia').upsert(chunk, { onConflict: 'fecha' });
    if (error) console.error(`Error upsert sesiones chunk ${i}:`, error.message);
  }

  // Mapear sesiones por fecha
  const { data: dbSesiones } = await supabase.from('sesiones_dia').select('id, fecha, equipo');
  const sesionIdByFecha = new Map();
  (dbSesiones || []).forEach(s => {
    sesionIdByFecha.set(s.fecha, s.id);
  });
  console.log(`Total sesiones registradas en Supabase: ${sesionIdByFecha.size}`);

  console.log('\n--- 3. Extraer Estados Diarios, Notas y Comentarios (`estado_diario_jugador`) ---');

  const estadoDiarioMap = new Map();

  function processPlanificacionGrid(wb, equipo) {
    if (!wb || !wb.Sheets['Planificacion']) return;
    const ws = wb.Sheets['Planificacion'];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const dateRow = rows[8] || [];
    const colToDateMap = new Map();

    for (let c = 10; c < dateRow.length; c++) {
      const iso = excelDateToISO(dateRow[c]);
      if (iso) colToDateMap.set(c, iso);
    }

    const jugadoresEquipo = allJugadores.filter(j => !j.equipo || j.equipo === equipo);

    for (let r = 21; r <= 47; r++) {
      const dorsal = r - 20;
      const row = rows[r];
      if (!row) continue;

      const rawName = row[9] || row[8] || row[7] || '';
      const nameNorm = norm(rawName);

      let jugadorId = jugadorMap.get(`${norm(equipo)}_dorsal_${dorsal}`) ||
                      jugadorMap.get(`${norm(equipo)}_${nameNorm}`) ||
                      jugadorMap.get(nameNorm);

      if (!jugadorId) {
        const found = jugadoresEquipo.find(j => Number(j.cor_id) === dorsal || norm(j.nombre) === nameNorm || (j.apodo && norm(j.apodo) === nameNorm));
        if (found) jugadorId = found.id;
      }

      if (!jugadorId) continue;

      for (const [colIdx, fechaISO] of colToDateMap.entries()) {
        const val = row[colIdx];
        const code = (val !== undefined && val !== null && val !== '' && val !== false) ? String(val).trim().toUpperCase() : null;

        const key = `${jugadorId}_${fechaISO}`;
        if (!estadoDiarioMap.has(key)) {
          estadoDiarioMap.set(key, {
            jugador_id: jugadorId,
            fechaISO,
            disponibilidad: code,
            comentario_lesiones: null,
            comentario_medico: null,
            comentario_nutricion: null,
            comentario_fisico: null,
            comentario_tecnico: null,
            objetivo: null
          });
        } else if (code) {
          estadoDiarioMap.get(key).disponibilidad = code;
        }
      }
    }

    // Extraer notas de celdas de Planificación
    let noteCount = 0;
    for (const cellKey in ws) {
      if (cellKey.startsWith('!')) continue;
      const cell = ws[cellKey];
      if (cell && cell.c && cell.c.length > 0) {
        const decoded = XLSX.utils.decode_cell(cellKey);
        const r = decoded.r;
        const c = decoded.c;
        if (r >= 21 && r <= 47) {
          const dorsal = r - 20;
          const fechaISO = colToDateMap.get(c);
          const rawName = rows[r] ? (rows[r][9] || rows[r][8] || rows[r][7] || '') : '';
          const nameNorm = norm(rawName);

          let jugadorId = jugadorMap.get(`${norm(equipo)}_dorsal_${dorsal}`) ||
                          jugadorMap.get(`${norm(equipo)}_${nameNorm}`) ||
                          jugadorMap.get(nameNorm);

          if (!jugadorId) {
            const found = jugadoresEquipo.find(j => Number(j.cor_id) === dorsal || norm(j.nombre) === nameNorm);
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
    console.log(`Notas de celdas procesadas en ${equipo}: ${noteCount}`);
  }

  function processBBDDSheet(wb, equipo) {
    if (!wb || !wb.Sheets['BBDD']) return;
    const ws = wb.Sheets['BBDD'];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const headers = rows[0] || [];

    const hJugIdx = headers.indexOf('Jugador');
    const hFechaIdx = headers.indexOf('Fecha');
    const hObjIdx = headers.indexOf('Objetivo');
    const hLesIdx = headers.indexOf('Comentario Lesion');
    const hMedIdx = headers.indexOf('Comentario Medico');
    const hNutIdx = headers.indexOf('Comentario Nutricional');
    const hFisIdx = headers.indexOf('Comentario Fisico');
    const hTecIdx = headers.indexOf('Comentario Tecnico');
    const hGenEvIdx = headers.indexOf('Comentario general evento') !== -1 ? headers.indexOf('Comentario general evento') : headers.indexOf('Comentario General Evento');
    const hDispIdx = headers.indexOf('Disponibilidad');

    const jugadoresEquipo = allJugadores.filter(j => !j.equipo || j.equipo === equipo);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const rawJugador = row[hJugIdx];
      const rawFecha = row[hFechaIdx];
      if (!rawJugador || !rawFecha || norm(rawJugador) === 'TEAM') continue;

      const fechaISO = excelDateToISO(rawFecha);
      if (!fechaISO) continue;

      const jNameNorm = norm(rawJugador);
      let jugadorId = jugadorMap.get(`${norm(equipo)}_${jNameNorm}`) || jugadorMap.get(jNameNorm);
      if (!jugadorId) {
        const found = jugadoresEquipo.find(j => norm(j.nombre) === jNameNorm || (j.apodo && norm(j.apodo) === jNameNorm));
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

  processPlanificacionGrid(manresaWb, 'CE Manresa');
  processPlanificacionGrid(pratWb, 'AE Prat');
  processBBDDSheet(manresaWb, 'CE Manresa');
  processBBDDSheet(pratWb, 'AE Prat');

  console.log(`Total registros estado diario extraídos: ${estadoDiarioMap.size}`);

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

  console.log(`Insertando ${estadosToInsert.length} estados consolidados en Supabase (limpiando previos)...`);
  const allJugadorIds = Array.from(new Set(allJugadores.map(j => j.id)));
  for (let i = 0; i < allJugadorIds.length; i += 10) {
    const chunkIds = allJugadorIds.slice(i, i + 10);
    await supabase.from('estado_diario_jugador').delete().in('jugador_id', chunkIds);
  }

  for (let i = 0; i < estadosToInsert.length; i += 500) {
    const chunk = estadosToInsert.slice(i, i + 500);
    const { error } = await supabase.from('estado_diario_jugador').insert(chunk);
    if (error) console.error(`Error lote ${i} estado_diario_jugador:`, error.message);
  }

  console.log('\n--- 4. Migrar Registro de Lesiones (`lesiones`) ---');
  
  function extractLesiones(wb, equipo) {
    if (!wb || !wb.Sheets['BBDD_LESIONES']) return [];
    const ws = wb.Sheets['BBDD_LESIONES'];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (rows.length < 44) return [];

    let headerRowIdx = 43;
    let headers = rows[headerRowIdx] || [];
    if (!headers.some(h => /deportista|jugador/i.test(String(h)))) {
      headerRowIdx = rows.findIndex(r => r && r.some(c => /deportista|jugador/i.test(String(c))));
      headers = rows[headerRowIdx] || [];
    }

    const hJugIdx = headers.findIndex(h => /deportista|jugador/i.test(String(h)));
    const hFechaIdx = headers.findIndex(h => /fecha/i.test(String(h)));
    const hResultadoIdx = headers.findIndex(h => /resultado|lesion|tipo/i.test(String(h)));
    const hZonaIdx = headers.findIndex(h => /region|zona|corporal/i.test(String(h)));
    const hGravedadIdx = headers.findIndex(h => /gravedad/i.test(String(h)));
    const hDiasBajaIdx = headers.findIndex(h => /dias de baja|dias_baja|baja/i.test(String(h)));

    const jugadoresEquipo = allJugadores.filter(j => !j.equipo || j.equipo === equipo);
    const lesionesList = [];

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const rawJug = r[hJugIdx];
      const rawFecha = r[hFechaIdx];
      if (!rawJug || !rawFecha) continue;

      const fechaInicio = excelDateToISO(rawFecha);
      if (!fechaInicio) continue;

      const jNameNorm = norm(rawJug);
      let jugadorId = jugadorMap.get(`${norm(equipo)}_${jNameNorm}`) || jugadorMap.get(jNameNorm);
      if (!jugadorId) {
        const found = jugadoresEquipo.find(j => norm(j.nombre) === jNameNorm || (j.apodo && norm(j.apodo) === jNameNorm));
        if (found) jugadorId = found.id;
      }
      if (!jugadorId) continue;

      const diasBaja = r[hDiasBajaIdx] ? Number(r[hDiasBajaIdx]) : null;
      let fechaAlta = null;
      if (diasBaja && diasBaja > 0) {
        const d = new Date(fechaInicio);
        d.setDate(d.getDate() + diasBaja);
        fechaAlta = d.toISOString().slice(0, 10);
      }

      lesionesList.push({
        jugador_id: jugadorId,
        fecha_inicio: fechaInicio,
        fecha_alta: fechaAlta,
        tipo: r[hResultadoIdx] ? String(r[hResultadoIdx]).trim() : null,
        zona: r[hZonaIdx] ? String(r[hZonaIdx]).trim() : null,
        gravedad: r[hGravedadIdx] ? String(r[hGravedadIdx]).trim() : null
      });
    }
    return lesionesList;
  }

  const manresaLesiones = extractLesiones(manresaWb, 'CE Manresa');
  const pratLesiones = extractLesiones(pratWb, 'AE Prat');
  const allLesiones = [...manresaLesiones, ...pratLesiones];

  console.log(`Lesiones extraídas: Manresa (${manresaLesiones.length}), Prat (${pratLesiones.length})`);
  if (allLesiones.length > 0) {
    for (let i = 0; i < allJugadorIds.length; i += 10) {
      const chunkIds = allJugadorIds.slice(i, i + 10);
      await supabase.from('lesiones').delete().in('jugador_id', chunkIds);
    }
    for (let i = 0; i < allLesiones.length; i += 500) {
      const chunk = allLesiones.slice(i, i + 500);
      const { error } = await supabase.from('lesiones').insert(chunk);
      if (error) console.error(`Error lote ${i} lesiones:`, error.message);
    }
    console.log(`✓ ${allLesiones.length} lesiones migradas a Supabase.`);
  }

  console.log('\n--- 5. Generar calendar_sync_data.json Completo (Sin Exclusiones) ---');

  const eventosBloquesMap = {};
  const playerEventsMap = {};
  const playerMinutesMap = {};

  // 5.1 Bloques principales desde Planificacion (Slot 0 para todos los días con evento)
  function processMainPlanificacionEvents(wb, equipo) {
    if (!wb || !wb.Sheets['Planificacion']) return;
    const ws = wb.Sheets['Planificacion'];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const dateRow = rows[8] || [];
    const evAmRow = rows[12] || [];
    const evPmRow = rows[13] || [];
    const rivalRow = rows[11] || [];
    const cargaRow = rows[14] || [];
    const volRow = rows[15] || [];

    const jugadoresEquipo = allJugadores.filter(j => !j.equipo || j.equipo === equipo);

    for (let c = 10; c < dateRow.length; c++) {
      const iso = excelDateToISO(dateRow[c]);
      if (!iso) continue;

      const evAm = evAmRow[c] ? String(evAmRow[c]).trim() : '';
      const evPm = evPmRow[c] ? String(evPmRow[c]).trim() : '';
      const rival = rivalRow[c] ? String(rivalRow[c]).trim() : '';
      const mainType = evAm || evPm || (rival ? 'P' : '');

      if (!mainType) continue;

      const blockKey = `${iso}_slot_0`;
      if (!eventosBloquesMap[blockKey]) {
        eventosBloquesMap[blockKey] = {
          id: blockKey,
          day_id: `d_${iso}`,
          fecha: iso,
          slot: 0,
          tipo: mainType,
          hora: '',
          lugar: '',
          duracion: volRow[c] ? String(volRow[c]).trim() : '',
          orientacion: '',
          carga: cargaRow[c] ? String(cargaRow[c]).trim() : '',
          comentario: rival ? `Rival: ${rival}` : '',
          num_jugadores: String(jugadoresEquipo.length)
        };
      }

      // Asignar a jugadores con estado en Planificacion
      for (let r = 21; r <= 47; r++) {
        const dorsal = r - 20;
        const row = rows[r];
        if (!row) continue;

        const rawName = row[9] || row[8] || row[7] || '';
        const nameNorm = norm(rawName);

        let jugadorId = jugadorMap.get(`${norm(equipo)}_dorsal_${dorsal}`) ||
                        jugadorMap.get(`${norm(equipo)}_${nameNorm}`) ||
                        jugadorMap.get(nameNorm);

        if (!jugadorId) {
          const found = jugadoresEquipo.find(j => Number(j.cor_id) === dorsal || norm(j.nombre) === nameNorm);
          if (found) jugadorId = found.id;
        }

        if (!jugadorId) continue;

        const val = row[c];
        const code = (val !== undefined && val !== null && val !== '' && val !== false) ? String(val).trim().toUpperCase() : '';

        const playerKey = `${jugadorId}_${iso}_ev_${iso}_0`;
        if (code === 'D' || code === mainType.toUpperCase()) {
          playerEventsMap[playerKey] = mainType;
          playerMinutesMap[playerKey] = {
            minutos: volRow[c] ? String(volRow[c]).trim() : '90',
            realiza: true,
            manual: false
          };
        } else if (code === 'NO' || code === 'L' || code === 'N' || code === 'M') {
          playerEventsMap[playerKey] = 'NO';
          playerMinutesMap[playerKey] = {
            minutos: '0',
            realiza: false,
            manual: false
          };
        }
      }
    }
  }

  processMainPlanificacionEvents(manresaWb, 'CE Manresa');
  processMainPlanificacionEvents(pratWb, 'AE Prat');

  // 5.2 Bloques detallados desde BBDD (Sobreescriben y completan slots 0 a 5)
  function processAllEventsFromBBDD(wb, equipo) {
    if (!wb || !wb.Sheets['BBDD']) return;
    const ws = wb.Sheets['BBDD'];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
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

    const jugadoresEquipo = allJugadores.filter(j => !j.equipo || j.equipo === equipo);
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
      countBlocks++;

      if (jNameNorm && jNameNorm !== 'TEAM') {
        let jugadorId = jugadorMap.get(`${norm(equipo)}_${jNameNorm}`) || jugadorMap.get(jNameNorm);
        if (!jugadorId) {
          const found = jugadoresEquipo.find(j => norm(j.nombre) === jNameNorm || (j.apodo && norm(j.apodo) === jNameNorm));
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
          countPlayerEvs++;
        }
      }
    }
    console.log(`  -> ${equipo}: ${countBlocks} bloques y ${countPlayerEvs} asignaciones procesadas desde BBDD.`);
  }

  processAllEventsFromBBDD(manresaWb, 'CE Manresa');
  processAllEventsFromBBDD(pratWb, 'AE Prat');

  const finalSyncData = {
    eventosBloquesMap,
    playerEventsMap,
    playerMinutesMap
  };

  const publicSyncPath = '/Users/MiquelNadalGaya/web/public/calendar_sync_data.json';
  const rootSyncPath = '/Users/MiquelNadalGaya/web/calendar_sync_data.json';

  fs.writeFileSync(publicSyncPath, JSON.stringify(finalSyncData, null, 2));
  fs.writeFileSync(rootSyncPath, JSON.stringify(finalSyncData, null, 2));

  console.log(`\n✓ Archivos de sincronización guardados con éxito:`);
  console.log(`  - ${publicSyncPath}`);
  console.log(`  - ${rootSyncPath}`);
  console.log(`  - Total bloques de eventos diarios: ${Object.keys(eventosBloquesMap).length}`);
  console.log(`  - Total asignaciones individuales de eventos: ${Object.keys(playerEventsMap).length}`);
  console.log(`  - Total minutos/asistencias registradas: ${Object.keys(playerMinutesMap).length}`);
  console.log(`\n================================================================`);
  console.log(` RECUPERACIÓN COMPLETA FINALIZADA CON ÉXITO `);
  console.log(`================================================================\n`);
}

main().catch(console.error);
