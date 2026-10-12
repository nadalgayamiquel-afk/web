require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
async function test() {
  const { data, error } = await supabase.from("sesiones_dia_bloques").select("*").order("created_at", { ascending: false }).limit(20);
  console.log("Error:", error);
  console.log("Blocks:", data);
}
test();
