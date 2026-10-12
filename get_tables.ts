import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function run() {
  const { data, error } = await supabase.rpc('get_tables');
  
  if (error) {
     // If no rpc, let's query raw REST (not easy). Let's just use REST via standard API on pg_meta if possible, or just check 'link' / 'url'
     const { data: q } = await supabase.from('links').select('*').limit(1);
     console.log('links:', q);
  }
}
run();
