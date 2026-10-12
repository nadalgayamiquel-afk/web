const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('gps_datos').select('jugador_id, metricas').eq('fecha', '2026-09-06');
  if (error) console.error(error);
  else console.log("GPS Arnedo:", data);
}
check();
