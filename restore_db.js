require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function restore() {
  console.log("Reading calendar_sync_data.json...");
  const data = JSON.parse(fs.readFileSync("public/calendar_sync_data.json", "utf8"));
  const bloques = data.eventosBloquesMap;
  if (!bloques) {
    console.log("No bloques found in backup.");
    return;
  }

  console.log("Fetching all sesiones_dia...");
  const { data: sesiones, error: errSesiones } = await supabase.from("sesiones_dia").select("id, fecha");
  if (errSesiones) {
    console.log("Error fetching sesiones:", errSesiones);
    return;
  }
  
  const dateToId = {};
  sesiones.forEach(s => {
    if (s.fecha) dateToId[s.fecha] = s.id;
  });

  const upsertRows = [];
  const insertedDates = new Set();

  for (const key of Object.keys(bloques)) {
    const b = bloques[key];
    if (!b.tipo || !b.fecha) continue;
    
    let dayId = dateToId[b.fecha];
    
    // Si el día no existe en BBDD, tenemos que crearlo.
    if (!dayId && !insertedDates.has(b.fecha)) {
      console.log(`Creating missing day for ${b.fecha}...`);
      const { data: newDay, error: insErr } = await supabase.from("sesiones_dia").insert({ fecha: b.fecha }).select("id").single();
      if (!insErr && newDay) {
        dayId = newDay.id;
        dateToId[b.fecha] = dayId;
      }
      insertedDates.add(b.fecha);
    }
    
    if (dayId) {
      upsertRows.push({
        day_id: dayId,
        fecha: b.fecha,
        slot: b.slot,
        tipo: b.tipo,
        hora: b.hora,
        lugar: b.lugar,
        duracion: b.duracion,
        orientacion: b.orientacion,
        carga: b.carga,
        comentario: b.comentario,
        num_jugadores: b.num_jugadores,
        competicion: b.competicion
      });
    }
  }

  console.log(`Prepared ${upsertRows.length} blocks for upsert. Deduping...`);
  const uniqueBloques = [];
  const mapBloques = new Map();
  upsertRows.forEach(row => {
      mapBloques.set(`${row.day_id}_slot_${row.slot}`, row);
  });
  mapBloques.forEach(row => uniqueBloques.push(row));
  
  console.log(`Pushing ${uniqueBloques.length} blocks to BBDD...`);
  
  const chunk = 100;
  for (let i = 0; i < uniqueBloques.length; i += chunk) {
    const rows = uniqueBloques.slice(i, i + chunk);
    const { error: upsertErr } = await supabase.from("sesiones_dia_bloques").upsert(rows, { onConflict: "day_id,slot" });
    if (upsertErr) {
      console.log("Upsert error:", upsertErr);
    } else {
      console.log(`Upserted batch ${i / chunk + 1}`);
    }
  }

  console.log("Restore complete!");
}

restore();
