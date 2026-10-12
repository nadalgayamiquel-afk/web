require("dotenv").config({ path: "/Users/MiquelNadalGaya/web/.env.local" });
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const fs = require("fs");
const crypto = require("crypto");

async function main() {
  console.log("=== STARTING COMPLETE CE EUROPA DATA RESTORATION ===");

  // 1. Load backups
  const bCompleto = JSON.parse(fs.readFileSync("/Users/MiquelNadalGaya/web/backup_completo.json", "utf8"));
  const bFull = JSON.parse(fs.readFileSync("/Users/MiquelNadalGaya/web/backups/backup_pre_v3_full_20261001.json", "utf8"));

  let dsave = {};
  if (fs.existsSync("/Users/MiquelNadalGaya/web/public/debug_save.json")) {
    try { dsave = JSON.parse(fs.readFileSync("/Users/MiquelNadalGaya/web/public/debug_save.json", "utf8")); } catch(e){}
  }

  let oldSync = {};
  if (fs.existsSync("/Users/MiquelNadalGaya/web/public/calendar_sync_data.json")) {
    try { oldSync = JSON.parse(fs.readFileSync("/Users/MiquelNadalGaya/web/public/calendar_sync_data.json", "utf8")); } catch(e){}
  }

  // 2. Load 2026/27 sessions from Supabase
  const { data: dbSessions } = await supabase.from("sesiones_dia").select("*").gte("fecha", "2026-07-01").order("fecha");
  console.log(`Loaded ${dbSessions.length} sessions from Supabase for 2026/27.`);
  const fechaToSession = new Map();
  const idToSession = new Map();
  dbSessions.forEach(s => {
    fechaToSession.set(s.fecha, s);
    idToSession.set(s.id, s);
  });

  // 3. Load CE Europa players
  const { data: europaPlayers } = await supabase.from("jugadores").select("*").ilike("equipo", "%Europa%");
  console.log(`Loaded ${europaPlayers.length} CE Europa players.`);

  // 4. Build Player Role Mapping (Old Manresa squad to New Europa squad)
  const oldSquad = JSON.parse(bCompleto.jugadores_db_full_v1 || "[]").filter(p => p.equipo === "CE Manresa");

  const playerMapping = [
    // Porteros
    { oldApodo: "PULI", euNombre: "Nil Ruiz" },
    { oldApodo: "QUIM", euNombre: "Lucas Madrigal" },
    // Centrales
    { oldApodo: "MATHEUS", euNombre: "Marcel Sgrò" },
    { oldApodo: "MARC", euNombre: "Víctor Morales" },
    { oldApodo: "DAOUDA", euNombre: "Álex Cano" },
    { oldApodo: "ROGER", euNombre: "Victor Edo" },
    // Laterales
    { oldApodo: "OUSSAMA", euNombre: "Joan Puig" },
    { oldApodo: "NICO", euNombre: "Pedro Cancelo" },
    { oldApodo: "ANGEL", euNombre: "Enol Coto" },
    { oldApodo: "IVAN", euNombre: "Santi Pallarés" },
    { oldApodo: "SANTI", euNombre: "Arnau Campeny" },
    // Mediocentros / Pivotes / Interiores
    { oldApodo: "IGLE", euNombre: "Marc Anglès" },
    { oldApodo: "ERIC", euNombre: "Albert Tolosa" },
    { oldApodo: "BADR", euNombre: "Gori Gracia" },
    { oldApodo: "CARLOS", euNombre: "Guillem Cardelús" },
    // Extremos
    { oldApodo: "DANI", euNombre: "Youssef Zayzoun" },
    { oldApodo: "BILI", euNombre: "Teto Martín" },
    { oldApodo: "POCHITO", euNombre: "Joan Mascaró" },
    { oldApodo: "ALEIX", euNombre: "Flavio Ribeiro" },
    { oldApodo: "MOHA", euNombre: "Adriá Padillo" },
    // Delanteros
    { oldApodo: "MOMOH", euNombre: "Khalid Noureddine" },
    { oldApodo: "OSCAR", euNombre: "Adri Expósito" },
    { oldApodo: "RICHARD", euNombre: "Adri Expósito" },
  ];

  const oldIdToEuropa = new Map();
  const oldApodoToEuropa = new Map();

  playerMapping.forEach(m => {
    const oldP = oldSquad.find(p => (p.apodo || "").toUpperCase() === m.oldApodo || (p.nombre || "").toUpperCase().includes(m.oldApodo));
    const euP = europaPlayers.find(p => p.nombre.toLowerCase() === m.euNombre.toLowerCase());
    if (oldP && euP) {
      oldIdToEuropa.set(oldP.id, euP);
      oldApodoToEuropa.set(m.oldApodo, euP);
    }
  });
  console.log(`Mapped ${oldIdToEuropa.size} old squad players directly to CE Europa players.`);

  // ----------------------------------------------------
  // A. RESTORE EVENTOS BLOQUES (eventosBloquesMap)
  // ----------------------------------------------------
  console.log("\n--- Processing Eventos Bloques ---");
  const rawEvb = JSON.parse(bCompleto.eventos_bloques_map_v1 || "{}");
  const backupBloquesRows = bFull.tables.sesiones_dia_bloques?.rows || [];
  const debugBloques = dsave.eventosBloquesMap || {};
  const oldSyncBloques = oldSync.eventosBloquesMap || {};

  const unifiedBlocks = new Map(); // key -> block

  // 1. From backup rows
  backupBloquesRows.forEach(b => {
    const ses = fechaToSession.get(b.fecha) || idToSession.get(b.day_id);
    if (!ses) return;
    const block = {
      id: b.id || crypto.randomUUID(),
      day_id: ses.id,
      fecha: ses.fecha,
      slot: Number(b.slot ?? 0),
      tipo: b.tipo || "",
      hora: b.hora || "",
      lugar: b.lugar || "",
      duracion: b.duracion || "",
      orientacion: b.orientacion || "",
      carga: b.carga || "",
      comentario: b.comentario || "",
      num_jugadores: b.num_jugadores ? Number(b.num_jugadores) : null,
      competicion: b.competicion || "",
    };
    unifiedBlocks.set(`${ses.id}_slot_${block.slot}`, block);
    unifiedBlocks.set(`${ses.fecha}_slot_${block.slot}`, block);
  });

  // 2. From rawEvb
  Object.entries(rawEvb).forEach(([k, b]) => {
    if (!b) return;
    const ses = (b.fecha && fechaToSession.get(b.fecha)) || (b.day_id && idToSession.get(b.day_id));
    if (!ses) return;
    const block = {
      id: b.id || crypto.randomUUID(),
      day_id: ses.id,
      fecha: ses.fecha,
      slot: Number(b.slot ?? (k.match(/slot_(\d+)/)?.[1] || 0)),
      tipo: b.tipo || "",
      hora: b.hora || "",
      lugar: b.lugar || "",
      duracion: b.duracion || "",
      orientacion: b.orientacion || "",
      carga: b.carga || "",
      comentario: b.comentario || "",
      num_jugadores: b.num_jugadores ? Number(b.num_jugadores) : null,
      competicion: b.competicion || "",
    };
    unifiedBlocks.set(`${ses.id}_slot_${block.slot}`, block);
    unifiedBlocks.set(`${ses.fecha}_slot_${block.slot}`, block);
  });

  // 3. From debug_save (October edits: 13, 14, 15, 16, 17)
  Object.entries(debugBloques).forEach(([k, b]) => {
    if (!b) return;
    const ses = (b.fecha && fechaToSession.get(b.fecha)) || (b.day_id && idToSession.get(b.day_id));
    if (!ses) return;
    const block = {
      id: b.id || crypto.randomUUID(),
      day_id: ses.id,
      fecha: ses.fecha,
      slot: Number(b.slot ?? (k.match(/slot_(\d+)/)?.[1] || 0)),
      tipo: b.tipo || "",
      hora: b.hora || "",
      lugar: b.lugar || "",
      duracion: b.duracion || "",
      orientacion: b.orientacion || "",
      carga: b.carga || "",
      comentario: b.comentario || "",
      num_jugadores: b.num_jugadores ? Number(b.num_jugadores) : null,
      competicion: b.competicion || "",
    };
    unifiedBlocks.set(`${ses.id}_slot_${block.slot}`, block);
    unifiedBlocks.set(`${ses.fecha}_slot_${block.slot}`, block);
  });

  console.log(`Unified Eventos Bloques total keys: ${unifiedBlocks.size}`);

  // Upsert blocks to Supabase sesiones_dia_bloques
  const distinctBlocks = [];
  const seenBlockKey = new Set();
  unifiedBlocks.forEach((b) => {
    const k = `${b.day_id}_slot_${b.slot}`;
    if (!seenBlockKey.has(k) && b.tipo) {
      seenBlockKey.add(k);
      distinctBlocks.push(b);
    }
  });
  console.log(`Distinct blocks to upsert to Supabase: ${distinctBlocks.length}`);

  for (let i = 0; i < distinctBlocks.length; i += 50) {
    const chunk = distinctBlocks.slice(i, i + 50);
    const { error: errBloques } = await supabase.from("sesiones_dia_bloques").upsert(chunk, { onConflict: "id" });
    if (errBloques) console.error("Error upserting bloques:", errBloques.message);
  }
  console.log("Upserted all sesiones_dia_bloques to Supabase!");

  // Convert to plain object for calendar_sync_data.json
  const finalEventosBloquesMap = {};
  unifiedBlocks.forEach((v, k) => {
    finalEventosBloquesMap[k] = v;
    if (v.fecha) finalEventosBloquesMap[`day_${v.fecha}_slot_${v.slot}`] = v;
  });

  // ----------------------------------------------------
  // B. RESTORE DISPONIBILIDADES (estadosMap)
  // ----------------------------------------------------
  console.log("\n--- Processing Disponibilidades ---");
  const rawDisp = JSON.parse(bCompleto.disponibilidad_map_v1 || "{}");
  const finalEstadosMap = {};

  // Copy raw entries
  Object.assign(finalEstadosMap, rawDisp);

  // Map to Europa players
  Object.entries(rawDisp).forEach(([k, val]) => {
    const parts = k.split("_");
    const pid = parts[0];
    const dateOrId = parts.slice(1).join("_");

    const euP = oldIdToEuropa.get(pid);
    if (euP) {
      finalEstadosMap[`${euP.id}_${dateOrId}`] = val;
      const ses = fechaToSession.get(dateOrId) || idToSession.get(dateOrId);
      if (ses) {
        finalEstadosMap[`${euP.id}_${ses.fecha}`] = val;
        finalEstadosMap[`${euP.id}_${ses.id}`] = val;
      }
    }
  });

  // Default 'D' for all Europa players across all 2026/27 sessions if not set
  europaPlayers.forEach(euP => {
    dbSessions.forEach(s => {
      const k1 = `${euP.id}_${s.fecha}`;
      const k2 = `${euP.id}_${s.id}`;
      if (!finalEstadosMap[k1]) finalEstadosMap[k1] = "D";
      if (!finalEstadosMap[k2]) finalEstadosMap[k2] = "D";
    });
  });
  console.log(`Final estadosMap keys count: ${Object.keys(finalEstadosMap).length}`);

  // ----------------------------------------------------
  // C. RESTORE ASIGNACIONES (playerEventsMap)
  // ----------------------------------------------------
  console.log("\n--- Processing Player Event Assignments ---");
  const rawPev = JSON.parse(bCompleto.player_events_map_v1 || "{}");
  const syncPev = oldSync.playerEventsMap || {};
  const finalPlayerEventsMap = {};

  // Copy raw
  Object.assign(finalPlayerEventsMap, rawPev);
  Object.assign(finalPlayerEventsMap, syncPev);

  // Map to Europa players
  Object.entries(rawPev).forEach(([k, val]) => {
    const parts = k.split("_");
    const prefix = parts[0];
    const suffix = parts.slice(1).join("_");

    let euP = oldIdToEuropa.get(prefix) || oldApodoToEuropa.get(prefix);
    if (euP) {
      finalPlayerEventsMap[`${euP.id}_${suffix}`] = val;
      finalPlayerEventsMap[`${euP.apodo.toUpperCase()}_${suffix}`] = val;
      finalPlayerEventsMap[`${euP.nombre.toUpperCase()}_${suffix}`] = val;

      const m = k.match(/\d{4}-\d{2}-\d{2}/);
      if (m) {
        const f = m[0];
        const ses = fechaToSession.get(f);
        if (ses) {
          finalPlayerEventsMap[`${euP.id}_${f}`] = val;
          finalPlayerEventsMap[`${euP.id}_${ses.id}`] = val;
          finalPlayerEventsMap[`${euP.apodo.toUpperCase()}_${f}`] = val;
        }
      }
    }
  });

  // Also include October assignments from syncPev
  Object.entries(syncPev).forEach(([k, val]) => {
    const parts = k.split("_");
    const prefix = parts[0];
    const suffix = parts.slice(1).join("_");
    const euP = oldIdToEuropa.get(prefix) || oldApodoToEuropa.get(prefix);
    if (euP) {
      finalPlayerEventsMap[`${euP.id}_${suffix}`] = val;
      finalPlayerEventsMap[`${euP.apodo.toUpperCase()}_${suffix}`] = val;
      const m = k.match(/\d{4}-\d{2}-\d{2}/);
      if (m) {
        const f = m[0];
        const ses = fechaToSession.get(f);
        if (ses) {
          finalPlayerEventsMap[`${euP.id}_${f}`] = val;
          finalPlayerEventsMap[`${euP.id}_${ses.id}`] = val;
          finalPlayerEventsMap[`${euP.apodo.toUpperCase()}_${f}`] = val;
        }
      }
    }
  });

  console.log(`Final playerEventsMap keys count: ${Object.keys(finalPlayerEventsMap).length}`);

  // ----------------------------------------------------
  // D. RESTORE COMENTARIOS (comentarios)
  // ----------------------------------------------------
  console.log("\n--- Processing Comentarios ---");
  const rawCom = JSON.parse(bCompleto.comentarios_jugadores_v2 || "[]");
  const syncCom = oldSync.comentarios || [];

  const finalComentarios = [];
  const seenCom = new Set();

  function addComment(c) {
    const k = `${c.jugador_id}_${c.fecha}_${c.tipo}_${c.texto}`;
    if (!seenCom.has(k)) {
      seenCom.add(k);
      finalComentarios.push(c);
    }
  }

  rawCom.forEach(c => {
    addComment(c);
    // Duplicate for Europa player if applicable
    if (c.jugador_id !== "TEAM") {
      const euP = oldIdToEuropa.get(c.jugador_id);
      if (euP) {
        addComment({
          ...c,
          id: `eu_${c.id}`,
          jugador_id: euP.id,
          jugadorNombre: euP.nombre,
        });
      }
    }
  });

  syncCom.forEach(c => addComment(c));
  console.log(`Final comentarios total: ${finalComentarios.length}`);

  // ----------------------------------------------------
  // E. RESTORE PLAYER MINUTES
  // ----------------------------------------------------
  const rawMin = JSON.parse(bCompleto.player_event_minutes_map_v1 || "{}");
  const finalMinutesMap = {};
  Object.assign(finalMinutesMap, rawMin);
  Object.entries(rawMin).forEach(([k, val]) => {
    const parts = k.split("_");
    const pid = parts[0];
    const rest = parts.slice(1).join("_");
    const euP = oldIdToEuropa.get(pid);
    if (euP) {
      finalMinutesMap[`${euP.id}_${rest}`] = val;
    }
  });

  // ----------------------------------------------------
  // F. WRITE TO public/calendar_sync_data.json
  // ----------------------------------------------------
  const syncPayload = {
    updated_at: new Date().toISOString(),
    eventosBloquesMap: finalEventosBloquesMap,
    playerEventsMap: finalPlayerEventsMap,
    playerMinutesMap: finalMinutesMap,
    comentarios: finalComentarios,
    estadosMap: finalEstadosMap,
    disponibilidadMap: finalEstadosMap,
  };

  fs.writeFileSync("/Users/MiquelNadalGaya/web/public/calendar_sync_data.json", JSON.stringify(syncPayload, null, 2));
  console.log("Wrote complete unified payload to /Users/MiquelNadalGaya/web/public/calendar_sync_data.json!");

  // ----------------------------------------------------
  // G. UPSERT TO SUPABASE estado_diario_jugador
  // ----------------------------------------------------
  console.log("\n--- Upserting to Supabase estado_diario_jugador ---");

  // Build comment map by jugador_id and sesion_dia_id
  const commentsByPlayerSes = new Map();
  finalComentarios.forEach(c => {
    const ses = fechaToSession.get(c.fecha) || idToSession.get(c.day_id);
    if (!ses) return;
    const key = `${c.jugador_id}_${ses.id}`;
    if (!commentsByPlayerSes.has(key)) commentsByPlayerSes.set(key, {});
    const obj = commentsByPlayerSes.get(key);
    if (c.tipo === "CON") obj.comentario_fisico = c.texto;
    if (c.tipo === "TEC") obj.comentario_tecnico = c.texto;
    if (c.tipo === "FIS") obj.comentario_lesiones = c.texto;
    if (c.tipo === "WEL") obj.comentario_wellness = c.texto;
    if (c.tipo === "OTR") obj.comentario_medico = c.texto;
  });

  const estadoRows = [];
  europaPlayers.forEach(euP => {
    dbSessions.forEach(ses => {
      const disp = finalEstadosMap[`${euP.id}_${ses.fecha}`] || finalEstadosMap[`${euP.id}_${ses.id}`] || "D";
      const evAsign = finalPlayerEventsMap[`${euP.id}_${ses.fecha}`] || finalPlayerEventsMap[`${euP.id}_${ses.id}`] || null;
      const coms = commentsByPlayerSes.get(`${euP.id}_${ses.id}`) || {};

      estadoRows.push({
        id: crypto.randomUUID(),
        jugador_id: euP.id,
        sesion_dia_id: ses.id,
        disponibilidad: disp,
        evento_asignado: evAsign,
        minutos: null,
        comentario_fisico: coms.comentario_fisico || null,
        comentario_tecnico: coms.comentario_tecnico || null,
        comentario_lesiones: coms.comentario_lesiones || null,
        comentario_medico: coms.comentario_medico || null,
      });
    });
  });

  console.log(`Generated ${estadoRows.length} estado_diario_jugador rows for CE Europa players.`);

  // Delete old europa estados first to avoid duplicate conflicts, then insert in batches
  const europaPlayerIds = europaPlayers.map(p => p.id);
  await supabase.from("estado_diario_jugador").delete().in("jugador_id", europaPlayerIds);

  let insertedCount = 0;
  for (let i = 0; i < estadoRows.length; i += 200) {
    const chunk = estadoRows.slice(i, i + 200);
    const { error: errEst } = await supabase.from("estado_diario_jugador").insert(chunk);
    if (errEst) console.error("Error inserting estado_diario_jugador batch:", errEst.message);
    else insertedCount += chunk.length;
  }
  console.log(`Successfully inserted ${insertedCount} estado_diario_jugador records into Supabase!`);

  console.log("\n=== RESTORATION SCRIPT COMPLETE! ===");
}

main().catch(err => {
  console.error("FATAL ERROR in restoration script:", err);
  process.exit(1);
});
