require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function wipe() {
  const tables = [
    'estado_diario_jugador',
    'eventos_jugador',
    'sesiones_dia',
    'sesiones_dia_bloques',
    'gps_datos',
    'planes_jugador_dia',
    'tareas_campo_jugador',
    'fuerza_sesiones',
    'lesiones',
    'tests_fuerza',
    'jugadores'
  ];

  console.log("Starting DB wipe...");
  for (const table of tables) {
    console.log(`Wiping ${table}...`);
    const { error } = await supabase.from(table).delete().neq('id', 'this_does_not_exist_ever_123');
    if (error) {
      console.error(`Error wiping ${table}:`, error);
    } else {
      console.log(`Wiped ${table} successfully`);
    }
  }
  console.log("Done wiping DB!");
}

wipe();
