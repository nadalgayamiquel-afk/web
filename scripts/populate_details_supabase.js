const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const supabaseUrl = "https://noumrtldxzmtqrfmydwz.supabase.co";
const supabaseKey = "sb_publishable_H3rT__cBnF3fk5QAHUFjVg_Tf1vI9Cs";
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("🚀 Sincronizando detalles, disponibilidades y comentarios a Supabase...");

  const rootDir = path.resolve(__dirname, "..");
  const masterBackup = JSON.parse(fs.readFileSync(path.join(rootDir, "public", "master_backup.json"), "utf8"));
  
  // 1. Obtener todas las sesiones_dia para mapear fecha -> id UUID
  const { data: dbSessions, error: sErr } = await supabase.from("sesiones_dia").select("id, fecha");
  if (sErr) throw sErr;
  console.log(`Sesiones encontradas en DB: ${dbSessions.length}`);
  const dateToSessionId = new Map(dbSessions.map(s => [s.fecha, s.id]));

  // 2. Obtener todos los jugadores para validar IDs existentes
  const { data: dbPlayers, error: pErr } = await supabase.from("jugadores").select("id, nombre");
  if (pErr) throw pErr;
  console.log(`Jugadores encontrados en DB: ${dbPlayers.length}`);
  const validPlayerIds = new Set(dbPlayers.map(p => p.id));

  // 3. Mapear disponibilidades (disponibilidad_map)
  const dispMap = masterBackup.disponibilidad_map || {};
  const playerEventsMap = masterBackup.player_events_map || {};
  const commentsList = masterBackup.comentarios_jugadores || [];

  console.log(`Total claves disponibilidad: ${Object.keys(dispMap).length}`);
  console.log(`Total asignaciones player_events: ${Object.keys(playerEventsMap).length}`);
  console.log(`Total comentarios: ${commentsList.length}`);

  // Construir mapa de estados por (jugador_id + sesion_dia_id)
  const estadoRowsMap = new Map();

  function getRowKey(jId, sId) {
    return `${jId}___${sId}`;
  }

  // A) Disponibilidades
  for (const [k, dispVal] of Object.entries(dispMap)) {
    const parts = k.split("_");
    const playerId = parts[0];
    const dateStr = parts.slice(1).join("-");
    const sId = dateToSessionId.get(dateStr);
    if (!validPlayerIds.has(playerId) || !sId) continue;

    const rk = getRowKey(playerId, sId);
    if (!estadoRowsMap.has(rk)) {
      estadoRowsMap.set(rk, {
        jugador_id: playerId,
        sesion_dia_id: sId,
        disponibilidad: dispVal || "D"
      });
    } else {
      estadoRowsMap.get(rk).disponibilidad = dispVal;
    }
  }

  // B) Asignaciones de evento
  for (const [k, evVal] of Object.entries(playerEventsMap)) {
    const parts = k.split("_");
    const playerId = parts[0];
    const dateStr = parts.slice(1).join("-");
    const sId = dateToSessionId.get(dateStr);
    if (!validPlayerIds.has(playerId) || !sId) continue;

    const rk = getRowKey(playerId, sId);
    if (!estadoRowsMap.has(rk)) {
      estadoRowsMap.set(rk, {
        jugador_id: playerId,
        sesion_dia_id: sId,
        disponibilidad: "D",
        evento_asignado: evVal
      });
    } else {
      estadoRowsMap.get(rk).evento_asignado = evVal;
    }
  }

  // C) Comentarios de jugadores
  const fieldMap = {
    WEL: "comentario_wellness",
    FIS: "comentario_lesiones",
    TEC: "comentario_tecnico",
    CON: "comentario_fisico",
    OTR: "comentario_medico",
    PSI: "comentario_psicologico",
    NUT: "comentario_nutricion",
  };

  for (const c of commentsList) {
    if (!c || !c.jugador_id || c.jugador_id === "TEAM") continue;
    const playerId = c.jugador_id;
    const sId = dateToSessionId.get(c.fecha);
    if (!validPlayerIds.has(playerId) || !sId) continue;

    const colName = fieldMap[c.tipo] || "comentario_lesiones";
    const rk = getRowKey(playerId, sId);
    if (!estadoRowsMap.has(rk)) {
      estadoRowsMap.set(rk, {
        jugador_id: playerId,
        sesion_dia_id: sId,
        disponibilidad: "D",
        [colName]: c.texto
      });
    } else {
      estadoRowsMap.get(rk)[colName] = c.texto;
    }
  }

  const allEstadoRows = Array.from(estadoRowsMap.values());
  console.log(`\n📦 Total filas de estado_diario_jugador preparadas: ${allEstadoRows.length}`);

  // Insertar/actualizar por lotes de 100
  let inserted = 0;
  for (let i = 0; i < allEstadoRows.length; i += 100) {
    const chunk = allEstadoRows.slice(i, i + 100);
    const { error } = await supabase.from("estado_diario_jugador").upsert(chunk, {
      onConflict: "jugador_id,sesion_dia_id"
    });
    if (error) {
      console.warn(`Error en lote ${i}:`, error.message);
    } else {
      inserted += chunk.length;
    }
  }

  const { count: finalCount } = await supabase.from("estado_diario_jugador").select("*", { count: "exact", head: true });
  console.log(`✅ Filas totales en estado_diario_jugador: ${finalCount} (enviadas con éxito: ${inserted})`);

  // 4. SESIONES_DIA_BLOQUES
  const bloquesMap = masterBackup.eventos_bloques_map || {};
  console.log(`\n📦 Procesando eventos_bloques_map (${Object.keys(bloquesMap).length} bloques)...`);
  const bloqueRows = [];
  for (const [k, b] of Object.entries(bloquesMap)) {
    if (!b) continue;
    const parts = k.split("_slot_");
    const dateStr = parts[0];
    const slotIdx = parts[1] || "0";
    const sId = dateToSessionId.get(dateStr);
    if (!sId) continue;

    bloqueRows.push({
      sesion_dia_id: sId,
      orden: parseInt(slotIdx) || 0,
      tipo_evento: b.tipoEvento || b.tipo || b.nombre || "ENTRENAMIENTO",
      nombre: b.nombre || b.tipoEvento || null,
      duracion_min: typeof b.duracion_min === "number" ? b.duracion_min : 60,
      descripcion: b.descripcion || null,
      contenido: b.contenido || null
    });
  }

  if (bloqueRows.length > 0) {
    for (let i = 0; i < bloqueRows.length; i += 50) {
      const chunk = bloqueRows.slice(i, i + 50);
      const { error } = await supabase.from("sesiones_dia_bloques").upsert(chunk);
      if (error) console.warn("Aviso bloques chunk:", error.message);
    }
    const { count: bCount } = await supabase.from("sesiones_dia_bloques").select("*", { count: "exact", head: true });
    console.log(`✅ Filas totales en sesiones_dia_bloques: ${bCount}`);
  }

  console.log("\n🎉 ¡Sincronización de detalles completada con éxito!");
}

run().catch(err => {
  console.error("Error fatal:", err);
  process.exit(1);
});
