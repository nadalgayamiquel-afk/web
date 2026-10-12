require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function purgePrat() {
  console.log("Fetching AE Prat days...");
  const { data: pratDays, error: errDays } = await supabase.from("sesiones_dia").select("id").eq("equipo", "AE Prat");
  
  if (errDays) {
    console.error("Error fetching Prat days:", errDays);
    return;
  }
  
  const dayIds = pratDays.map(d => d.id);
  console.log(`Found ${dayIds.length} AE Prat days.`);
  
  if (dayIds.length > 0) {
    console.log("Deleting blocks...");
    const chunkSize = 100;
    for (let i = 0; i < dayIds.length; i += chunkSize) {
      const chunk = dayIds.slice(i, i + chunkSize);
      await supabase.from("sesiones_dia_bloques").delete().in("day_id", chunk);
      await supabase.from("estado_diario_jugador").delete().in("sesion_dia_id", chunk);
      await supabase.from("sesiones_dia").delete().in("id", chunk);
      console.log(`Deleted chunk ${i / chunkSize + 1}`);
    }
  }
  
  console.log("Purge complete!");
}

purgePrat();
