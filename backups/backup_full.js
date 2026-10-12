require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env.local') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

async function fetchAll(table) {
  let allRows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + pageSize - 1);
    if (error) { console.log(`  ⚠️ ${table}: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
}

const TABLES = [
  'jugadores', 'sesiones_dia', 'sesiones_dia_bloques', 'estado_diario_jugador',
  'eventos_jugador', 'lesiones', 'gps_datos', 'ejercicios_gimnasio',
  'fuerza_sesiones', 'dbtests',
];

async function run() {
  const backup = { timestamp: new Date().toISOString(), tables: {} };
  console.log('📦 Backup completo (sin límite de 1000)...\n');
  for (const table of TABLES) {
    const rows = await fetchAll(table);
    console.log(`  ✅ ${table}: ${rows.length} registros`);
    backup.tables[table] = { count: rows.length, rows };
  }
  const fp = path.join(__dirname, 'backup_pre_v3_full_20261001.json');
  fs.writeFileSync(fp, JSON.stringify(backup, null, 2));
  const mb = (fs.statSync(fp).size / (1024*1024)).toFixed(2);
  console.log(`\n💾 Guardado: ${fp} (${mb} MB)`);
}
run();
