import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function run() {
  const { data: bloques, error: err1 } = await supabase.from("sesiones_dia_bloques").select("*").gte("day_id", "2026-09-17");
  console.log("Bloques err:", err1);
  console.log("Bloques:", bloques?.length);
  
  const { data: estados, error: err2 } = await supabase.from("estado_diario_jugador").select("jugador_id, fecha, disponibilidad").gte("fecha", "2026-09-17");
  console.log("Estados err:", err2);
  console.log("Estados count:", estados?.length);
}

run();
