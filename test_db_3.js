const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('minutos_jugador_evento').select('*').eq('fecha', '2026-09-20');
  if (error) {
    console.error("Error querying db:", error);
  } else {
    console.log("Records for 2026-09-20:", data ? data.length : 0);
    if (data && data.length > 0) {
      console.log("Sample:", data[0]);
    }
  }
}
check();
