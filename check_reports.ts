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
     const { data: cols } = await supabase.from('reportes').select('*').limit(1);
     console.log('reportes:', cols);
  }
}
run();
