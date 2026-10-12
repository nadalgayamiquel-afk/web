const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data } = await supabase.from('estado_diario_jugador').select('jugador_id, tipo_de_evento').eq('fecha', '2026-09-06');
  console.log(data.filter(d => ['44a17d58-563b-41a5-811f-58ee1365866d', 'e218da66-f670-4e19-8812-a5d9ba301de2', 'c10999d2-2293-4191-bdeb-2ea4c72aa63a', 'd0444862-4bb1-4d9e-81d6-2eae200a036c'].includes(d.jugador_id)));
}
check();
