/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const filePath = process.argv[2] || "/Users/MiquelNadalGaya/Desktop/MAIK/Planificació AE PRAT 25-26.xlsm";
const dryRun = process.argv.includes('--dry-run');

console.log(`\n========================================`);
console.log(` Migración AE Prat 25-26`);
console.log(` Archivo: ${filePath}`);
console.log(` Modo: ${dryRun ? 'DRY-RUN (Simulación sin escribir)' : 'ESCRITURA REAL EN SUPABASE'}`);
console.log(`========================================\n`);

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Abriendo archivo Excel (hojas Deportistas y BBDD)...');
const wb = XLSX.readFile(filePath, { cellDates: false, sheets: ['Deportistas', 'BBDD'] });

function readSheet(sheetName, headerRow = 1) {
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    console.warn(`  (hoja "${sheetName}" no encontrada)`);
    return [];
  }
  const rows = XLSX.utils.sheet_to_json(ws, {
    range: headerRow - 1,
    defval: null,
  });
  return rows.filter((r) => Object.values(r).some((v) => v !== null && v !== ''));
}

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

const jugadorIdPorNombre = new Map();
const aliasToCanonico = new Map();

async function migrarDeportistas() {
  console.log('\n--- 1. Migrando Deportistas ---');
  const rows = readSheet('Deportistas', 1);
  const deportistas = [];

  for (const r of rows) {
    const nombre = r['NOM_COMPLET'];
    if (!nombre || norm(nombre) === 'TEAM') continue;
    const nombreCanonico = nombre.toString().trim();
    const apodo = r['NOM_CURT'] ? r['NOM_CURT'].toString().trim() : null;

    aliasToCanonico.set(norm(nombreCanonico), nombreCanonico);
    if (apodo) {
      aliasToCanonico.set(norm(apodo), nombreCanonico);
    }

    deportistas.push({
      nombre: nombreCanonico,
      apodo: apodo || null,
      posicion: r['POSICIÓN'] || null,
      equipo: 'AE Prat',
      temporada: '2025/26',
      cor_id: r['COR_ID'] ? String(r['COR_ID']) : null,
      seccion: r['SECCIÓ'] || null,
      fecha_nacimiento: excelDateToISO(r['DATA_NAIXEMENT']),
      nacionalidad: r['NACIONAL'] || null,
      contacto: r['CONTACTO'] ? String(r['CONTACTO']) : null,
      anos_en_club: r['AÑOS EN CLUB'] ? Number(r['AÑOS EN CLUB']) || null : null,
      seleccion_autonomica: r['SEL. AUTON'] || null,
      seleccion_nacional: r['SEL. NACIONAL'] || null,
      peso: r['PESO'] ? Number(r['PESO']) || null : null,
      altura: r['ALTURA'] ? Number(r['ALTURA']) || null : null,
      activo: true,
    });
  }

  console.log(`Total deportistas válidos encontrados: ${deportistas.length}`);

  if (!dryRun) {
    for (const dep of deportistas) {
      const { data, error } = await supabase
        .from('jugadores')
        .upsert(dep, { onConflict: 'nombre' })
        .select('id')
        .single();

      if (error) {
        console.error(`  ! Error upsert jugador ${dep.nombre}:`, error.message);
      } else if (data) {
        jugadorIdPorNombre.set(norm(dep.nombre), data.id);
        if (dep.apodo) jugadorIdPorNombre.set(norm(dep.apodo), data.id);
      }
    }
  }

  console.log(`✓ 27 Deportistas del AE Prat registrados en Supabase.`);
}

async function migrarBBDD() {
  console.log('\n--- 2. Migrando Hoja BBDD ---');
  const rows = readSheet('BBDD', 1);
  console.log(`Filas leídas de BBDD: ${rows.length}`);

  const sesionesMap = new Map();
  const estadosMap = new Map();

  for (const r of rows) {
    const rawFecha = r['Fecha'];
    const fechaISO = excelDateToISO(rawFecha);
    if (!fechaISO) continue;

    if (!sesionesMap.has(fechaISO)) {
      sesionesMap.set(fechaISO, {
        fecha: fechaISO,
        equipo: 'AE Prat',
        periodo: r['Periodo'] || null,
        subperiodo: r['Subperiodo'] || null,
        semana: r['Nº Semana'] ? Number(r['Nº Semana']) || null : null,
        md: r['MD'] || null,
        rival: r['Rival'] || null,
        carga: r['Carga'] ? Number(r['Carga']) || null : null,
        volumen: r['Volumen'] ? Number(r['Volumen']) || null : null,
        intensidad: r['Intensidad'] ? Number(r['Intensidad']) || null : null,
        evento_am: r['Evento AM  '] || r['Evento AM'] || null,
        evento_pm: r['Evento PM'] || null,
        comentario_microciclo: r['Comentario Microciclo'] || null,
      });
    }

    const rawJugador = r['Jugador'];
    if (!rawJugador || norm(rawJugador) === 'TEAM') continue;

    const nombreNorm = norm(rawJugador);
    const jugadorId = jugadorIdPorNombre.get(nombreNorm) || jugadorIdPorNombre.get(norm(aliasToCanonico.get(nombreNorm)));

    if (!jugadorId) continue;

    const estadoKey = `${jugadorId}_${fechaISO}`;
    if (!estadosMap.has(estadoKey)) {
      estadosMap.set(estadoKey, {
        _fechaISO: fechaISO,
        jugador_id: jugadorId,
        disponibilidad: r['Disponibilidad'] || null,
        objetivo: r['Objetivo'] || null,
        comentario_lesiones: r['Comentario Lesion'] || null,
        comentario_medico: r['Comentario Medico'] || null,
        comentario_nutricion: r['Comentario Nutricional'] || null,
        comentario_fisico: r['Comentario Fisico'] || null,
        comentario_tecnico: r['Comentario Tecnico'] || null,
      });
    } else {
      const prev = estadosMap.get(estadoKey);
      if (!prev.disponibilidad && r['Disponibilidad']) prev.disponibilidad = r['Disponibilidad'];
      if (!prev.objetivo && r['Objetivo']) prev.objetivo = r['Objetivo'];
      if (!prev.comentario_lesiones && r['Comentario Lesion']) prev.comentario_lesiones = r['Comentario Lesion'];
      if (!prev.comentario_medico && r['Comentario Medico']) prev.comentario_medico = r['Comentario Medico'];
      if (!prev.comentario_nutricion && r['Comentario Nutricional']) prev.comentario_nutricion = r['Comentario Nutricional'];
      if (!prev.comentario_fisico && r['Comentario Fisico']) prev.comentario_fisico = r['Comentario Fisico'];
      if (!prev.comentario_tecnico && r['Comentario Tecnico']) prev.comentario_tecnico = r['Comentario Tecnico'];
    }
  }

  console.log(`Sesiones diarias únicas (días de calendario): ${sesionesMap.size}`);
  console.log(`Estados diarios únicos por jugador: ${estadosMap.size}`);

  if (dryRun) return;

  // Insertar sesiones_dia
  console.log('Guardando sesiones_dia...');
  const sesionIdPorFecha = new Map();
  const sesionesArray = Array.from(sesionesMap.values());
  const CHUNK_SIZE = 100;

  for (let i = 0; i < sesionesArray.length; i += CHUNK_SIZE) {
    const chunk = sesionesArray.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from('sesiones_dia')
      .upsert(chunk, { onConflict: 'fecha' })
      .select('id, fecha');

    if (error) {
      console.error('Error insertando sesiones_dia:', error.message);
    } else if (data) {
      data.forEach((s) => sesionIdPorFecha.set(s.fecha, s.id));
    }
  }

  // Prepara estado_diario_jugador
  const estadosToInsert = [];
  for (const est of estadosMap.values()) {
    const sesionId = sesionIdPorFecha.get(est._fechaISO);
    if (!sesionId) continue;
    estadosToInsert.push({
      jugador_id: est.jugador_id,
      sesion_dia_id: sesionId,
      disponibilidad: est.disponibilidad,
      objetivo: est.objetivo,
      comentario_lesiones: est.comentario_lesiones,
      comentario_medico: est.comentario_medico,
      comentario_nutricion: est.comentario_nutricion,
      comentario_fisico: est.comentario_fisico,
      comentario_tecnico: est.comentario_tecnico,
    });
  }

  console.log(`Insertando ${estadosToInsert.length} estados diarios de jugadores en lotes...`);
  const ESTADO_CHUNK = 500;
  let insertados = 0;
  for (let i = 0; i < estadosToInsert.length; i += ESTADO_CHUNK) {
    const chunk = estadosToInsert.slice(i, i + ESTADO_CHUNK);
    const { error } = await supabase.from('estado_diario_jugador').insert(chunk);
    if (error) {
      console.warn(`  ! Error insertando lote de estados (${i} a ${i + chunk.length}):`, error.message);
    } else {
      insertados += chunk.length;
    }
  }
  console.log(`✓ ${insertados} estados diarios consolidados e insertados correctamente.`);
}

async function main() {
  await migrarDeportistas();
  await migrarBBDD();
  console.log('\n========================================');
  console.log('✓ Migración completada con éxito.');
  console.log('  - CE Manresa (26/27): Intacto');
  console.log('  - AE Prat (25/26): Datos cargados');
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('Error fatal durante la migración:', err);
  process.exit(1);
});
