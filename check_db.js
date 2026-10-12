import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function check() {
  const { data, error } = await supabase.from('sesiones_dia').select('fecha, comentario_fisico, comentario_tecnico').not('comentario_fisico', 'is', null);
  console.log("Fisico:", data, error);
  const { data: d2 } = await supabase.from('sesiones_dia').select('fecha, comentario_fisico, comentario_tecnico').not('comentario_tecnico', 'is', null);
  console.log("Tecnico:", d2);
}
check();
