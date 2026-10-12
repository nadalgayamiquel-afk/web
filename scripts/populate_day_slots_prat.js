/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const filePath = process.argv[2] || "/Users/MiquelNadalGaya/Desktop/MAIK/Planificació AE PRAT 25-26.xlsm";

console.log(`\n================================================================`);
console.log(` Asignando Evento 1, 2, 3, 4, 5, 6 en Sesiones de AE Prat 25-26`);
console.log(` Archivo: ${filePath}`);
console.log(`================================================================\n`);

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan credenciales Supabase en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Leyendo hoja BBDD del archivo Excel...');
const wb = XLSX.readFile(filePath, { cellDates: false, sheets: ['BBDD'] });
const wsBBDD = wb.Sheets['BBDD'];
const rows = XLSX.utils.sheet_to_json(wsBBDD, { header: 1 });
const headers = rows[0] || [];

const hFechaIdx = headers.indexOf('Fecha');
const hTipoEvIdx = headers.indexOf('Tipo de Evento');
const hNumEvIdx = headers.indexOf('Nº Evento') !== -1 ? headers.indexOf('Nº Evento') : headers.indexOf('Nº EVENTO');

function excelDateToISO(v) {
  if (!v) return null;
  if (typeof v === 'number' && v > 40000) {
    const p = XLSX.SSF.parse_date_code(v);
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }
  return String(v).trim();
}

const daySlots = new Map();

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r) continue;
  const iso = excelDateToISO(r[hFechaIdx]);
  if (!iso) continue;
  const tipoEv = r[hTipoEvIdx];
  if (!tipoEv) continue;

  const numEv = Number(r[hNumEvIdx] || 1);
  if (numEv >= 1 && numEv <= 6) {
    if (!daySlots.has(iso)) {
      daySlots.set(iso, { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set() });
    }
    daySlots.get(iso)[numEv].add(String(tipoEv).trim());
  }
}

console.log(`Días con eventos de bloques (1-6) detectados: ${daySlots.size}`);

async function run() {
  const { data: dbSesiones, error } = await supabase
    .from('sesiones_dia')
    .select('id, fecha, rival, evento_am, evento_pm')
    .eq('equipo', 'AE Prat');

  if (error || !dbSesiones) {
    console.error('Error obteniendo sesiones:', error);
    process.exit(1);
  }

  console.log(`Actualizando ${dbSesiones.length} sesiones con sus eventos 1 a 6...`);

  const updates = [];
  for (const s of dbSesiones) {
    const slots = daySlots.get(s.fecha);
    const ev1 = slots && slots[1].size > 0 ? Array.from(slots[1]).join(', ') : null;
    const ev2 = slots && slots[2].size > 0 ? Array.from(slots[2]).join(', ') : null;
    const ev3 = slots && slots[3].size > 0 ? Array.from(slots[3]).join(', ') : null;
    const ev4 = slots && slots[4].size > 0 ? Array.from(slots[4]).join(', ') : null;
    const ev5 = slots && slots[5].size > 0 ? Array.from(slots[5]).join(', ') : null;
    const ev6 = slots && slots[6].size > 0 ? Array.from(slots[6]).join(', ') : null;

    // Unificar evento principal
    const mainEvent = s.evento_am || s.evento_pm || ev1 || (s.rival ? 'P' : null);

    updates.push({
      id: s.id,
      fecha: s.fecha,
      equipo: 'AE Prat',
      evento_am: mainEvent,
      evento_1: ev1,
      evento_2: ev2,
      evento_3: ev3,
      evento_4: ev4,
      evento_5: ev5,
      evento_6: ev6,
    });
  }

  for (let i = 0; i < updates.length; i += 100) {
    const chunk = updates.slice(i, i + 100);
    const { error: errUpsert } = await supabase
      .from('sesiones_dia')
      .upsert(chunk, { onConflict: 'id' });

    if (errUpsert) console.error(`Error actualizando lote ${i}:`, errUpsert.message);
  }

  console.log(`\n✓ Eventos 1, 2, 3, 4, 5, 6 asignados correctamente en las sesiones de Supabase.\n`);
}

run().catch(console.error);
