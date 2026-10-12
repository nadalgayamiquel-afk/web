#!/usr/bin/env node
/**
 * Backup completo de todas las tablas de Supabase antes de la reestructuración v3.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env.local') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Faltan variables de entorno SUPABASE_URL o SUPABASE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TABLES = [
  'jugadores', 'sesiones_dia', 'sesiones_dia_bloques', 'estado_diario_jugador',
  'eventos_jugador', 'lesiones', 'gps_datos', 'ejercicios_campo', 'ejercicios_gimnasio',
  'fuerza_sesiones', 'rutinas', 'planes_jugador_dia', 'tareas_campo_jugador',
  'tests_fuerza', 'tests_jugador_evento', 'tipos_evento', 'grupos_jugadores',
  'grupo_jugador', 'dbtests',
];

async function backupAll() {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const backup = { timestamp: new Date().toISOString(), tables: {} };

  console.log('📦 Iniciando backup de Supabase...\n');

  for (const table of TABLES) {
    try {
      const { data, error } = await supabase.from(table).select('*');
      if (error) {
        console.log(`  ⚠️  ${table}: ${error.message}`);
        backup.tables[table] = { error: error.message, rows: [] };
      } else {
        const count = data ? data.length : 0;
        console.log(`  ✅ ${table}: ${count} registros`);
        backup.tables[table] = { count, rows: data || [] };
      }
    } catch (err) {
      console.log(`  ❌ ${table}: ${err.message}`);
      backup.tables[table] = { error: err.message, rows: [] };
    }
  }

  const filename = `backup_pre_v3_${timestamp}.json`;
  const filepath = path.join(__dirname, filename);
  fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));

  const sizeMB = (Buffer.byteLength(JSON.stringify(backup)) / (1024 * 1024)).toFixed(2);
  console.log(`\n💾 Backup guardado: ${filepath} (${sizeMB} MB)`);
  console.log('✅ Backup completado con éxito');
}

backupAll().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
