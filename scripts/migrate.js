/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Script de migración: Excel (BBDD_*) -> Supabase
 *
 * INSTALAR PRIMERO:
 *   npm install xlsx @supabase/supabase-js dotenv
 *
 * CONFIGURAR .env.local (o exporta las variables en tu terminal):
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...   (la "service role key", no la anon key,
 *                                     porque este script se salta las políticas
 *                                     de seguridad para poder insertar en bloque)
 *
 * EJECUTAR:
 *   node scripts/migrate.js "/ruta/a/Planificacio__AE_PRAT_25-26.xlsm"
 *   node scripts/migrate.js "/ruta/a/Planificacio__Manresa.xlsm"
 *
 * Ejecuta el script UNA VEZ POR CADA ARCHIVO EXCEL que quieras migrar.
 */

require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Uso: node scripts/migrate.js <ruta-al-archivo.xlsm>');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Conserva el serial de Excel para evitar que la zona horaria desplace el día visible.
const wb = XLSX.readFile(filePath, { cellDates: false });

// ---------- helpers ----------

// Lee una hoja como lista de objetos, usando la fila `headerRow` (1-indexado)
// como cabecera. Descarta filas totalmente vacías.
function readSheet(sheetName, headerRow = 1) {
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    console.warn(`  (hoja "${sheetName}" no encontrada, se omite)`);
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
    const parsed = new Date(v);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  return null;
}

function excelTimeToISO(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const totalSeconds = Math.round((v % 1) * 24 * 60 * 60);
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  if (v instanceof Date) return v.toISOString().slice(11, 19);
  const text = String(v).trim();
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(text) ? (text.length === 5 ? `${text}:00` : text) : null;
}

// jugadores: nombre normalizado -> id. Se rellena en cargarJugadores()
// y se completa sobre la marcha si aparece un nombre nuevo.
const jugadorIdPorNombre = new Map();
const nombreCanonicoPorAlias = new Map();
const norm = (s) => (s || '').toString().trim().toUpperCase();

async function getOrCreateJugador(nombre) {
  if (!nombre || norm(nombre) === 'TEAM') return null;
  const nombreCanonico = nombreCanonicoPorAlias.get(norm(nombre)) || nombre.toString().trim();
  const key = norm(nombreCanonico);
  if (jugadorIdPorNombre.has(key)) return jugadorIdPorNombre.get(key);

  const { data, error } = await supabase
    .from('jugadores')
    .upsert({ nombre: nombreCanonico }, { onConflict: 'nombre' })
    .select('id')
    .single();

  if (error) {
    console.warn(`  ! no se pudo crear/obtener jugador "${nombre}":`, error.message);
    return null;
  }
  jugadorIdPorNombre.set(key, data.id);
  return data.id;
}

const sesionDiaIdPorFecha = new Map();
async function getOrCreateSesionDia(fields) {
  const fechaISO = excelDateToISO(fields.fecha);
  if (!fechaISO) return null;
  if (sesionDiaIdPorFecha.has(fechaISO)) return sesionDiaIdPorFecha.get(fechaISO);

  const { data, error } = await supabase
    .from('sesiones_dia')
    .upsert({ ...fields, fecha: fechaISO }, { onConflict: 'fecha' })
    .select('id')
    .single();

  if (error) {
    console.warn(`  ! no se pudo crear sesion_dia ${fechaISO}:`, error.message);
    return null;
  }
  sesionDiaIdPorFecha.set(fechaISO, data.id);
  return data.id;
}

async function insertBatch(table, rows, label) {
  if (!rows.length) return;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) console.warn(`  ! error insertando en ${table} (${label}):`, error.message);
  }
  console.log(`  -> ${rows.length} filas en "${table}" (${label})`);
}

// ---------- 1. DEPORTISTAS -> jugadores ----------

async function migrarDeportistas() {
  console.log('Migrando Deportistas...');
  const rows = readSheet('Deportistas', 1);
  for (const r of rows) {
    const nombre = r['NOM_COMPLET'];
    if (!nombre || norm(nombre) === 'TEAM') continue;
    const nombreCanonico = nombre.toString().trim();
    const apodo = r['NOM_CURT'] ? r['NOM_CURT'].toString().trim() : null;
    nombreCanonicoPorAlias.set(norm(nombreCanonico), nombreCanonico);
    if (apodo) nombreCanonicoPorAlias.set(norm(apodo), nombreCanonico);
    const { error } = await supabase.from('jugadores').upsert(
      {
        nombre: nombreCanonico,
        apodo,
        posicion: r['POSICIÓN'] || null,
        equipo: r['EQUIP'] || null,
        activo: true,
      },
      { onConflict: 'nombre' }
    );
    if (error) console.warn(`  ! ${nombre}:`, error.message);
  }
  console.log(`  -> ${rows.length} jugadoras procesadas`);
}

// ---------- 2. BBDD (tabla maestra) -> sesiones_dia / estado_diario / eventos / tests / planes ----------

async function migrarBBDD() {
  console.log('Migrando BBDD (tabla maestra)...');
  const rows = readSheet('BBDD', 1);

  const estadoRows = [];
  const eventoInserts = [];

  for (const r of rows) {
    const fecha = r['Fecha'];
    if (!fecha) continue;

    const sesionDiaId = await getOrCreateSesionDia({
      fecha,
      periodo: r['Periodo'] || null,
      subperiodo: r['Subperiodo'] || null,
      semana: r['Nº Semana'] || null,
      md: r['MD'] || null,
      rival: r['Rival'] || null,
      carga: r['Carga'] || null,
      volumen: r['Volumen'] || null,
      intensidad: r['Intensidad'] || null,
      evento_am: r['Evento AM  '] || r['Evento AM'] || null,
      evento_pm: r['Evento PM'] || null,
      comentario_microciclo: r['Comentario Microciclo'] || null,
    });
    if (!sesionDiaId) continue;

    const nombreJugador = r['Jugador'];
    if (!nombreJugador || nombreJugador === 'TEAM') continue; // fila a nivel de equipo, no de jugadora

    const jugadorId = await getOrCreateJugador(nombreJugador);
    if (!jugadorId) continue;

    estadoRows.push({
      jugador_id: jugadorId,
      sesion_dia_id: sesionDiaId,
      disponibilidad: r['Disponibilidad'] || null,
      objetivo: r['Objetivo'] || null,
      comentario_lesiones: r['Comentario Lesion'] || null,
      comentario_medico: r['Comentario Medico'] || null,
      comentario_nutricion: r['Comentario Nutricional'] || null,
      comentario_fisico: r['Comentario Fisico'] || null,
      comentario_tecnico: r['Comentario Tecnico'] || null,
    });

    // Evento (si esta fila describe uno) + sus tests + sus planes
    if (r['Tipo de Evento']) {
      const tests = [];
      for (let i = 1; i <= 14; i++) {
        if (r[`Test ${i}`]) tests.push(`Test ${i}`); // TODO: mapear al nombre real del test (definido en Indice)
      }
      const planes = [];
      for (let p = 1; p <= 10; p++) {
        if (r[`PLAN ${p}`]) {
          planes.push({
            numero_plan: p,
            nombre: r[`PLAN ${p}`],
            acciones: r[`ACCIONES PLAN ${p}`] || null,
            comentario: r[`COMENTARIOS PLAN ${p}`] || null,
            evaluacion: r[`EVALUACION PLAN ${p}`] || null,
          });
        }
      }
      eventoInserts.push({
        jugador_id: jugadorId,
        sesion_dia_id: sesionDiaId,
        tipo_evento_codigo: r['Tipo de Evento'],
        hora: excelTimeToISO(r['Hora del evento']),
        lugar: r['Lugar del evento'] || null,
        duracion: r['Duracion del evento'] || null,
        orientacion: r['Orientacion del evento'] || null,
        carga: r['Carga del evento'] || null,
        comentario: r['Comentario general evento'] || null,
        num_jugadores: r['Nº Jugadores del evento'] || null,
        _tests: tests,
        _planes: planes,
      });
    }
  }

  const estadosUnicos = Array.from(
    new Map(estadoRows.map((row) => [`${row.jugador_id}:${row.sesion_dia_id}`, row])).values()
  );
  for (let i = 0; i < estadosUnicos.length; i += 500) {
    const { error } = await supabase
      .from('estado_diario_jugador')
      .upsert(estadosUnicos.slice(i, i + 500), { onConflict: 'jugador_id,sesion_dia_id' });
    if (error) console.warn(`  ! error actualizando estados (BBDD):`, error.message);
  }
  console.log(`  -> ${estadosUnicos.length} estados procesados`);

  // Los eventos se insertan uno a uno porque necesitamos el id devuelto
  // para insertar sus tests y planes relacionados.
  let count = 0;
  for (const ev of eventoInserts) {
    const { _tests, _planes, ...eventoFields } = ev;
    const { data, error } = await supabase
      .from('eventos_jugador')
      .insert(eventoFields)
      .select('id')
      .single();
    if (error) {
      console.warn('  ! error insertando evento:', error.message);
      continue;
    }
    count++;
    if (_tests.length) {
      await supabase
        .from('tests_jugador_evento')
        .insert(_tests.map((t) => ({ evento_jugador_id: data.id, tipo_test: t })));
    }
    if (_planes.length) {
      await supabase.from('planes_jugador_dia').insert(
        _planes.map((p) => ({
          jugador_id: ev.jugador_id,
          sesion_dia_id: ev.sesion_dia_id,
          ...p,
        }))
      );
    }
  }
  console.log(`  -> ${count} eventos (+ tests y planes asociados)`);
}

// ---------- 3. BBDD_GPS -> gps_datos ----------

async function migrarGPS() {
  console.log('Migrando BBDD_GPS (esto puede tardar, hay muchas filas)...');
  const rows = readSheet('BBDD_GPS', 1);
  const CAMPOS_FIJOS = new Set([
    'Player', 'Nick Name', 'Team', 'Position', 'Sport', 'Date', 'Week Calendar',
    'Week Team', 'Week Match Day', 'Start hour', 'Final Hour', 'Num Session/day',
    'Session', 'Type Session', 'Group', 'Match Day', 'Num Total Session',
    'Selection', 'Repetition', 'Drills Duration',
  ]);

  const batch = [];
  for (const r of rows) {
    const nombreJugador = r['Nick Name'] || r['Player'];
    const fecha = excelDateToISO(r['Date']);
    if (!nombreJugador || !fecha) continue;
    const jugadorId = await getOrCreateJugador(nombreJugador);
    if (!jugadorId) continue;

    const metricas = {};
    for (const [k, v] of Object.entries(r)) {
      if (!CAMPOS_FIJOS.has(k) && v !== null && v !== '') metricas[k] = v;
    }

    batch.push({
      jugador_id: jugadorId,
      fecha,
      sesion_dia_id: sesionDiaIdPorFecha.get(fecha) || null,
      tipo_sesion: r['Type Session'] || null,
      match_day: r['Match Day'] || null,
      tarea: r['Selection'] || null,
      duracion: r['Drills Duration'] || null,
      metricas,
    });

    if (batch.length >= 500) {
      await insertBatch('gps_datos', batch.splice(0), 'BBDD_GPS');
    }
  }
  await insertBatch('gps_datos', batch, 'BBDD_GPS (resto)');
}

// ---------- 4. BBDD_LESIONES -> lesiones ----------

async function migrarLesiones() {
  console.log('Migrando BBDD_LESIONES...');
  const rows = readSheet('BBDD_LESIONES', 44); // la cabecera real está en la fila 44
  const out = [];
  for (const r of rows) {
    const nombreJugador = r['Deportista'];
    const fechaInicio = excelDateToISO(r['Fecha']);
    if (!nombreJugador || !fechaInicio) continue;
    const jugadorId = await getOrCreateJugador(nombreJugador);
    if (!jugadorId) continue;

    const diasBaja = r['Días de baja'] || null;
    let fechaAlta = null;
    if (diasBaja) {
      const d = new Date(fechaInicio);
      d.setDate(d.getDate() + Number(diasBaja));
      fechaAlta = d.toISOString().slice(0, 10);
    }

    out.push({
      jugador_id: jugadorId,
      fecha_inicio: fechaInicio,
      fecha_alta: fechaAlta,
      tipo: r['Resultado'] || null,
      zona: r['Región corporal'] || null,
      gravedad: r['Gravedad'] || null,
    });
  }
  await insertBatch('lesiones', out, 'BBDD_LESIONES');
}

// ---------- 5. BBDD_TESTS -> tests_fuerza ----------

async function migrarTestsFuerza() {
  console.log('Migrando BBDD_TESTS...');
  const rows = readSheet('BBDD_TESTS', 1);
  const CAMPOS_FIJOS = new Set(['Registro', 'Tipo', 'Jugador', 'FechaHora', 'Fecha', 'Test', 'Pierna']);
  const out = [];
  for (const r of rows) {
    const nombreJugador = r['Jugador'];
    const fecha = excelDateToISO(r['Fecha']);
    if (!nombreJugador || !fecha) continue;
    const jugadorId = await getOrCreateJugador(nombreJugador);
    if (!jugadorId) continue;

    const metricas = {};
    for (const [k, v] of Object.entries(r)) {
      if (!CAMPOS_FIJOS.has(k) && v !== null && v !== '') metricas[k] = v;
    }
    out.push({
      jugador_id: jugadorId,
      fecha,
      tipo_test: r['Test'] || null,
      pierna: r['Pierna'] || null,
      metricas,
    });
  }
  await insertBatch('tests_fuerza', out, 'BBDD_TESTS');
}

// ---------- 6. BBDD_EJERCICIOS -> ejercicios_gimnasio (catálogo) ----------

const ejercicioIdPorNombre = new Map();
async function migrarEjerciciosGimnasio() {
  console.log('Migrando BBDD_EJERCICIOS...');
  const rows = readSheet('BBDD_EJERCICIOS', 1);
  for (const r of rows) {
    const nombre = r['NOMBRE DEL EJERCICIO'];
    if (!nombre) continue;
    const { data, error } = await supabase
      .from('ejercicios_gimnasio')
      .upsert(
        {
          nombre: nombre.toString().trim(),
          musculo: r['1 Músculo'] || null,
          postura: r['Postura'] || null,
          movimiento: r['Movimiento'] || null,
          plano: r['Plano'] || null,
        },
        { onConflict: 'nombre' }
      )
      .select('id')
      .single();
    if (!error) ejercicioIdPorNombre.set(norm(nombre), data.id);
  }
  console.log(`  -> ${rows.length} ejercicios de gimnasio`);
}

// ---------- 7. BBDD_FUERZA -> fuerza_sesiones ----------

async function migrarFuerzaSesiones() {
  console.log('Migrando BBDD_FUERZA...');
  const rows = readSheet('BBDD_FUERZA', 1);
  const out = [];
  for (const r of rows) {
    const nombreJugador = r['JUGADOR'];
    const fecha = excelDateToISO(r['FECHA']);
    if (!nombreJugador || !fecha) continue;
    const jugadorId = await getOrCreateJugador(nombreJugador);
    if (!jugadorId) continue;

    out.push({
      jugador_id: jugadorId,
      sesion_dia_id: sesionDiaIdPorFecha.get(fecha) || null,
      tipo_entreno: r['TIPO DE ENTRENO'] || null,
      ejercicio_id: ejercicioIdPorNombre.get(norm(r['Nombre del ejercicio'])) || null,
      contenido: r['CONTENIDO'] || null,
    });
  }
  await insertBatch('fuerza_sesiones', out, 'BBDD_FUERZA');
}

// ---------- 8. BBDD_CAMPO -> tareas_campo_jugador ----------

async function migrarCampo() {
  console.log('Migrando BBDD_CAMPO...');
  const rows = readSheet('BBDD_CAMPO', 1);
  const out = [];
  for (const r of rows) {
    const nombreJugador = r['JUGADOR'];
    const fecha = excelDateToISO(r['FECHA']);
    if (!nombreJugador) continue;
    const jugadorId = await getOrCreateJugador(nombreJugador);
    if (!jugadorId) continue;

    out.push({
      jugador_id: jugadorId,
      fecha,
      numero_evento: r['Nº EVENTO'] || null,
      tipo_evento: r['TIPO DE EVENTO'] || null,
      orientacion: r['ORIENTACIÓN'] || null,
      numero_tarea: r['NÚMERO DE TAREA'] || null,
      nombre_tarea: r['NOMBRE DE LA TAREA'] || null,
      series: r['NÚMERO SERIES'] || null,
      tiempo: r['TIEMPO'] || null,
      comentarios: r['COMENTARIOS'] || null,
      equipo: r['EQUIPO'] || null,
    });
  }
  await insertBatch('tareas_campo_jugador', out, 'BBDD_CAMPO');
}

// ---------- 9. BBDD_RUTINAS -> rutinas ----------

async function migrarRutinas() {
  console.log('Migrando BBDD_RUTINAS...');
  const rows = readSheet('BBDD_RUTINAS', 1);
  const porNombre = new Map();
  for (const r of rows) {
    const nombreRutina = r['Nombre de rutina'];
    if (!nombreRutina) continue;
    if (!porNombre.has(nombreRutina)) porNombre.set(nombreRutina, []);
    porNombre.get(nombreRutina).push({
      ejercicio: r['Nombre del ejercicio'] || null,
      series: r['Nº Series'] || null,
      rep: r['Rep'] || null,
      carga: r['Carga'] || null,
      vel: r['Vel'] || null,
    });
  }
  const out = [...porNombre.entries()].map(([nombre, contenido]) => ({ nombre, contenido }));
  await insertBatch('rutinas', out, 'BBDD_RUTINAS');
}

// ---------- 10. BBDD_GRUPOS -> grupos_jugadores + grupo_jugador ----------

async function migrarGrupos() {
  console.log('Migrando BBDD_GRUPOS...');
  const rows = readSheet('BBDD_GRUPOS', 1);
  const porGrupo = new Map();
  for (const r of rows) {
    const nombreGrupo = r['Nombre de grupo'];
    const nombreJugador = r['Nombre del Jugador'];
    if (!nombreGrupo || !nombreJugador) continue;
    if (!porGrupo.has(nombreGrupo)) porGrupo.set(nombreGrupo, []);
    porGrupo.get(nombreGrupo).push(nombreJugador);
  }
  for (const [nombreGrupo, jugadoresNombres] of porGrupo) {
    const { data: grupo, error } = await supabase
      .from('grupos_jugadores')
      .insert({ nombre: nombreGrupo })
      .select('id')
      .single();
    if (error) {
      console.warn(`  ! grupo "${nombreGrupo}":`, error.message);
      continue;
    }
    for (const nombreJugador of jugadoresNombres) {
      const jugadorId = await getOrCreateJugador(nombreJugador);
      if (!jugadorId) continue;
      await supabase.from('grupo_jugador').insert({ grupo_id: grupo.id, jugador_id: jugadorId });
    }
  }
  console.log(`  -> ${porGrupo.size} grupos`);
}

// ---------- orquestación ----------

async function main() {
  console.log(`\nMigrando archivo: ${filePath}\n`);

  await migrarDeportistas();
  await migrarBBDD();          // crea sesiones_dia, así que va antes que GPS/fuerza
  await migrarGPS();
  await migrarLesiones();
  await migrarTestsFuerza();
  await migrarEjerciciosGimnasio();
  await migrarFuerzaSesiones();
  await migrarCampo();
  await migrarRutinas();
  await migrarGrupos();

  console.log('\n Migración completada.\n');
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
