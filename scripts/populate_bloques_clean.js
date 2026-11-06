const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const supabaseUrl = "https://noumrtldxzmtqrfmydwz.supabase.co";
const supabaseKey = "sb_publishable_H3rT__cBnF3fk5QAHUFjVg_Tf1vI9Cs";
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const rootDir = path.resolve(__dirname, "..");
  const masterBackup = JSON.parse(fs.readFileSync(path.join(rootDir, "public", "master_backup.json"), "utf8"));
  
  const { data: dbSessions } = await supabase.from("sesiones_dia").select("id, fecha");
  const dateToSessionId = new Map(dbSessions.map(s => [s.fecha, s.id]));

  const bloquesMap = masterBackup.eventos_bloques_map || {};
  const bloqueRows = [];
  
  for (const [k, b] of Object.entries(bloquesMap)) {
    if (!b) continue;
    const parts = k.split("_slot_");
    const dateStr = parts[0];
    const slotIdx = parseInt(parts[1]) || 1;
    const sId = dateToSessionId.get(dateStr);
    if (!sId) continue;

    bloqueRows.push({
      day_id: sId,
      fecha: dateStr,
      slot: slotIdx,
      tipo: b.tipo || b.tipoEvento || b.nombre || "ENTRENAMIENTO",
      hora: b.hora || null,
      lugar: b.lugar || null,
      duracion: b.duracion ? String(b.duracion) : null,
      orientacion: b.orientacion || null,
      carga: b.carga ? String(b.carga) : null,
      comentario: b.comentario || null,
      num_jugadores: b.num_jugadores ? String(b.num_jugadores) : null,
      competicion: b.competicion || null
    });
  }

  console.log(`Bloques a insertar/actualizar: ${bloqueRows.length}`);
  for (let i = 0; i < bloqueRows.length; i += 50) {
    const chunk = bloqueRows.slice(i, i + 50);
    const { error } = await supabase.from("sesiones_dia_bloques").upsert(chunk);
    if (error) console.error("Error bloque chunk:", error.message);
  }

  const { count } = await supabase.from("sesiones_dia_bloques").select("*", { count: "exact", head: true });
  console.log(`✅ Total sesiones_dia_bloques en Supabase: ${count}`);
}

run();
