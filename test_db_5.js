const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('jugadores').select('id, nombre, apodo');
  if (error) console.error(error);
  else {
    const p = data.filter(d => d.nombre.toLowerCase().includes('oussama') || d.nombre.toLowerCase().includes('igle') || d.nombre.toLowerCase().includes('bilal') || d.nombre.toLowerCase().includes('roger') || (d.apodo && d.apodo.toLowerCase().includes('igle')));
    console.log(p);
  }
}
check();
