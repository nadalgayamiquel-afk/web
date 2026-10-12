require("dotenv").config({ path: "/Users/MiquelNadalGaya/web/.env.local" });
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const fs = require("fs");
const crypto = require("crypto");

function normalizeName(str) {
  return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
}

async function main() {
  console.log("=== STARTING EUROPA OCTOBER RESTORATION ===");

  // 1. Fetch CE Europa players
  const { data: europaPlayers, error: pErr } = await supabase
    .from("jugadores")
    .select("*")
    .ilike("equipo", "%Europa%");
  if (pErr || !europaPlayers || europaPlayers.length === 0) {
    console.error("Error fetching Europa players:", pErr);
    return;
  }
  console.log(`Fetched ${europaPlayers.length} CE Europa players.`);

  // 2. Fetch all October sesiones_dia
  const { data: octDays, error: dErr } = await supabase
    .from("sesiones_dia")
    .select("*")
    .gte("fecha", "2026-10-01")
    .lte("fecha", "2026-10-31")
    .order("fecha");
  if (dErr || !octDays) {
    console.error("Error fetching October sessions:", dErr);
    return;
  }
  console.log(`Fetched ${octDays.length} October sessions from Supabase.`);

  const dateToSession = new Map();
  octDays.forEach(s => dateToSession.set(s.fecha, s));

  // 3. Update sesiones_dia metadata for October
  console.log("Updating sesiones_dia for October matches, microcycles, and MDs...");
  const dayUpdates = [
    // MCR 11
    { fecha: "2026-10-01", md: "-3 MD", rival: null, evento: "Op", evento_principal: "Op", comentario_microciclo: "MCR 11 - Rayo Majadahonda" },
    { fecha: "2026-10-02", md: "-2 MD", rival: null, evento: "Op", evento_principal: "Op", comentario_microciclo: "MCR 11 - Rayo Majadahonda" },
    { fecha: "2026-10-03", md: "-1 MD", rival: null, evento: "Op", evento_principal: "Op", comentario_microciclo: "MCR 11 - Rayo Majadahonda" },
    { fecha: "2026-10-04", md: "MD", rival: "Rayo Majadahonda", evento: "Pa", evento_principal: "Pa", competicion: "1RFEF", comentario_microciclo: "MCR 11 - Rayo Majadahonda" },
    // MCR 12
    { fecha: "2026-10-05", md: "+1 MD", rival: null, evento: "Descans", evento_principal: "Descans", comentario_microciclo: "MCR 12 - SD Huesca" },
    { fecha: "2026-10-06", md: "-5 MD", rival: null, evento: "Op", evento_principal: "Op", comentario_microciclo: "MCR 12 - SD Huesca" },
    { fecha: "2026-10-07", md: "-4 MD", rival: null, evento: "Op", evento_principal: "Op", comentario_microciclo: "MCR 12 - SD Huesca" },
    { fecha: "2026-10-08", md: "-3 MD", rival: null, evento: "Op", evento_principal: "Op", comentario_microciclo: "MCR 12 - SD Huesca" },
    { fecha: "2026-10-09", md: "-2 MD", rival: null, evento: "Op", evento_principal: "Op", comentario_microciclo: "MCR 12 - SD Huesca" },
    { fecha: "2026-10-10", md: "-1 MD", rival: null, evento: "Op", evento_principal: "Op", comentario_microciclo: "MCR 12 - SD Huesca" },
    { fecha: "2026-10-11", md: "MD", rival: "SD Huesca", evento: "Pa", evento_principal: "Pa", competicion: "1RFEF", comentario_microciclo: "MCR 12 - SD Huesca" },
    // MCR 14
    { fecha: "2026-10-12", md: "+1 MD", rival: null, evento: "Descans", evento_principal: "Descans", comentario_microciclo: "MCR 14 - FC Cartagena" },
    { fecha: "2026-10-13", md: "-3 MD", rival: null, evento: "Op", evento_principal: "Op", comentario_microciclo: "MCR 14 - FC Cartagena" },
    { fecha: "2026-10-14", md: "-2 MD", rival: null, evento: "Op", evento_principal: "Op", comentario_microciclo: "MCR 14 - FC Cartagena" },
    { fecha: "2026-10-15", md: "-1 MD", rival: null, evento: "Op", evento_principal: "Op", comentario_microciclo: "MCR 14 - FC Cartagena" },
    { fecha: "2026-10-16", md: "MD", rival: "FC Cartagena", evento: "Pa", evento_principal: "Pa", competicion: "1RFEF", comentario_microciclo: "MCR 14 - FC Cartagena" },
    { fecha: "2026-10-17", md: "+1 MD", rival: null, evento: "Rec", evento_principal: "Rec", comentario_microciclo: "MCR 14 - FC Cartagena" },
    { fecha: "2026-10-18", md: "+2 MD", rival: null, evento: "Descans", evento_principal: "Descans", comentario_microciclo: "MCR 14 - FC Cartagena" },
    // MCR 15
    { fecha: "2026-10-19", md: "+3 MD", rival: null, evento: "Descans", evento_principal: "Descans", comentario_microciclo: "MCR 15 - Real Zaragoza" },
    { fecha: "2026-10-20", md: "-5 MD", rival: null, evento: "Op", evento_principal: "Op", comentario_microciclo: "MCR 15 - Real Zaragoza" },
    { fecha: "2026-10-21", md: "-4 MD", rival: null, evento: "Op", evento_principal: "Op", comentario_microciclo: "MCR 15 - Real Zaragoza" },
    { fecha: "2026-10-22", md: "-3 MD", rival: null, evento: "Op", evento_principal: "Op", comentario_microciclo: "MCR 15 - Real Zaragoza" },
    { fecha: "2026-10-23", md: "-2 MD", rival: null, evento: "Op", evento_principal: "Op", comentario_microciclo: "MCR 15 - Real Zaragoza" },
    { fecha: "2026-10-24", md: "-1 MD", rival: null, evento: "Op", evento_principal: "Op", comentario_microciclo: "MCR 15 - Real Zaragoza" },
    { fecha: "2026-10-25", md: "MD", rival: "Real Zaragoza", evento: "Pa", evento_principal: "Pa", competicion: "1RFEF", comentario_microciclo: "MCR 15 - Real Zaragoza" },
    { fecha: "2026-10-26", md: "+1 MD", rival: null, evento: "Descans", evento_principal: "Descans", comentario_microciclo: "MCR 15 - Real Zaragoza" },
  ];

  for (const du of dayUpdates) {
    const s = dateToSession.get(du.fecha);
    if (s) {
      await supabase.from("sesiones_dia").update({
        md: du.md,
        rival: du.rival,
        evento: du.evento,
        evento_principal: du.evento_principal,
        competicion: du.competicion || "1RFEF",
        comentario_microciclo: du.comentario_microciclo,
        equipo: "CE Europa",
        temporada: "2026/27"
      }).eq("id", s.id);
    }
  }

  // 4. Define all October event blocks with COMPLETE characteristics
  const blocksData = [
    // 2026-10-01 (Thu)
    { fecha: "2026-10-01", slot: 0, tipo: "Gim", hora: "10:00", lugar: "GIMNASIO", duracion: "60", orientacion: "FUERZA", carga: "6", comentario: "CONVOCATORIA 10:00 - GYM GRUPAL" },
    { fecha: "2026-10-01", slot: 1, tipo: "Op", hora: "11:00", lugar: "CAMP CAN DRAGÓ", duracion: "75", orientacion: "ENTRENAMENT", carga: "7", comentario: "ENTRENAMENT CAMP CAN DRAGÓ" },
    // 2026-10-02 (Fri)
    { fecha: "2026-10-02", slot: 0, tipo: "VD", hora: "10:15", lugar: "SALA VIDEO", duracion: "30", orientacion: "VIDEO ABP", carga: "2", comentario: "CONVOCATORIA 09:45 - VIDEO ABP" },
    { fecha: "2026-10-02", slot: 1, tipo: "Op", hora: "11:00", lugar: "NOU SARDENYA", duracion: "60", orientacion: "PREPARTIDO", carga: "6", comentario: "ENTRENAMENT NOU SARDENYA" },
    // 2026-10-03 (Sat)
    { fecha: "2026-10-03", slot: 0, tipo: "Vi", hora: "10:15", lugar: "SALA VIDEO", duracion: "30", orientacion: "VIDEO RIVAL", carga: "2", comentario: "CONVOCATORIA 09:45 - VIDEO RIVAL" },
    { fecha: "2026-10-03", slot: 1, tipo: "Op", hora: "11:00", lugar: "NOU SARDENYA", duracion: "60", orientacion: "PREPARTIDO", carga: "5", comentario: "ENTRENAMENT NOU SARDENYA" },
    // 2026-10-04 (Sun - Match vs Rayo Majadahonda)
    { fecha: "2026-10-04", slot: 0, tipo: "Pa", hora: "16:00", lugar: "CAN DRAGÓ", duracion: "90", orientacion: "Jornada 6", carga: "9", comentario: "CONVOCATORIA CAN DRAGÓ 14:15H - PARTIT CE EUROPA vs Rayo Majadahonda", competicion: "1RFEF" },
    // 2026-10-05 (Mon - Descans)
    { fecha: "2026-10-05", slot: 0, tipo: "Descans", hora: "", lugar: "CASA", duracion: "0", orientacion: "DESCANS", carga: "0", comentario: "DESCANS / OFF" },
    // 2026-10-06 (Tue)
    { fecha: "2026-10-06", slot: 0, tipo: "Gim", hora: "10:00", lugar: "GIMNASIO", duracion: "60", orientacion: "FUERZA", carga: "6", comentario: "CONVOCATORIA 09:15 - GYM GRUPAL" },
    { fecha: "2026-10-06", slot: 1, tipo: "Op", hora: "11:00", lugar: "NOU SARDENYA", duracion: "75", orientacion: "ENTRENAMENT", carga: "7", comentario: "ENTRENAMENT NOU SARDENYA" },
    // 2026-10-07 (Wed)
    { fecha: "2026-10-07", slot: 0, tipo: "Gim", hora: "10:00", lugar: "GIMNASIO", duracion: "60", orientacion: "FUERZA", carga: "6", comentario: "CONVOCATORIA 09:15 - GYM GRUPAL" },
    { fecha: "2026-10-07", slot: 1, tipo: "Op", hora: "11:00", lugar: "NOU SARDENYA", duracion: "75", orientacion: "ENTRENAMENT", carga: "7", comentario: "ENTRENAMENT NOU SARDENYA" },
    // 2026-10-08 (Thu)
    { fecha: "2026-10-08", slot: 0, tipo: "Gim", hora: "10:00", lugar: "GIMNASIO", duracion: "60", orientacion: "FUERZA", carga: "6", comentario: "CONVOCATORIA 10:00 - GYM GRUPAL" },
    { fecha: "2026-10-08", slot: 1, tipo: "Op", hora: "11:00", lugar: "CAMP CAN DRAGÓ", duracion: "75", orientacion: "ENTRENAMENT", carga: "7", comentario: "ENTRENAMENT CAMP CAN DRAGÓ" },
    // 2026-10-09 (Fri)
    { fecha: "2026-10-09", slot: 0, tipo: "VD", hora: "10:15", lugar: "SALA VIDEO", duracion: "30", orientacion: "VIDEO ABP", carga: "2", comentario: "CONVOCATORIA 09:45 - VIDEO ABP" },
    { fecha: "2026-10-09", slot: 1, tipo: "Op", hora: "11:00", lugar: "NOU SARDENYA", duracion: "60", orientacion: "PREPARTIDO", carga: "6", comentario: "ENTRENAMENT NOU SARDENYA" },
    // 2026-10-10 (Sat)
    { fecha: "2026-10-10", slot: 0, tipo: "Vi", hora: "10:15", lugar: "SALA VIDEO", duracion: "30", orientacion: "VIDEO RIVAL", carga: "2", comentario: "CONVOCATORIA 09:45 - VIDEO RIVAL" },
    { fecha: "2026-10-10", slot: 1, tipo: "Op", hora: "11:00", lugar: "NOU SARDENYA", duracion: "60", orientacion: "PREPARTIDO", carga: "5", comentario: "ENTRENAMENT NOU SARDENYA" },
    { fecha: "2026-10-10", slot: 2, tipo: "Vi", hora: "16:30", lugar: "BUS", duracion: "150", orientacion: "DESPLAÇAMENT", carga: "1", comentario: "SORTIDA AMB BUS 16:30h directes a Huesca / Hotel Barbastro" },
    // 2026-10-11 (Sun - Match vs SD Huesca)
    { fecha: "2026-10-11", slot: 0, tipo: "Pa", hora: "14:15", lugar: "EL ALCORAZ", duracion: "90", orientacion: "Jornada 7", carga: "9", comentario: "Activación 09:30h · Salida Bus 12:00h · PARTIT SD Huesca vs CE Europa 14:15h", competicion: "1RFEF" },
    // 2026-10-12 (Mon - Descans)
    { fecha: "2026-10-12", slot: 0, tipo: "Descans", hora: "", lugar: "CASA", duracion: "0", orientacion: "DESCANS", carga: "0", comentario: "DESCANS / OFF" },
    // 2026-10-13 (Tue)
    { fecha: "2026-10-13", slot: 0, tipo: "Co", hora: "10:00", lugar: "GIMNASIO", duracion: "45", orientacion: "COADYUVANTE", carga: "5", comentario: "Coadyuvante Gimnasio" },
    { fecha: "2026-10-13", slot: 1, tipo: "Op", hora: "11:00", lugar: "NOU SARDENYA", duracion: "75", orientacion: "ENTRENAMENT", carga: "7", comentario: "ENTRENAMENT NOU SARDENYA" },
    { fecha: "2026-10-13", slot: 2, tipo: "Red", hora: "12:15", lugar: "NOU SARDENYA", duracion: "30", orientacion: "REDUCIDO", carga: "6", comentario: "Espacio Reducido" },
    // 2026-10-14 (Wed)
    { fecha: "2026-10-14", slot: 0, tipo: "VD", hora: "10:15", lugar: "SALA VIDEO", duracion: "30", orientacion: "VIDEO ABP", carga: "2", comentario: "Video ABP" },
    { fecha: "2026-10-14", slot: 1, tipo: "Op", hora: "11:00", lugar: "CAMP CAN DRAGÓ", duracion: "75", orientacion: "ENTRENAMENT", carga: "7", comentario: "ENTRENAMENT CAMP CAN DRAGÓ" },
    { fecha: "2026-10-14", slot: 2, tipo: "Red", hora: "12:15", lugar: "CAMP CAN DRAGÓ", duracion: "30", orientacion: "REDUCIDO", carga: "6", comentario: "Espacio Reducido" },
    // 2026-10-15 (Thu)
    { fecha: "2026-10-15", slot: 0, tipo: "VD", hora: "10:15", lugar: "SALA VIDEO", duracion: "30", orientacion: "VIDEO RIVAL", carga: "2", comentario: "Video Rival" },
    { fecha: "2026-10-15", slot: 1, tipo: "Op", hora: "11:00", lugar: "NOU SARDENYA", duracion: "60", orientacion: "PREPARTIDO", carga: "5", comentario: "ENTRENAMENT NOU SARDENYA" },
    { fecha: "2026-10-15", slot: 2, tipo: "Red", hora: "12:00", lugar: "NOU SARDENYA", duracion: "30", orientacion: "REDUCIDO", carga: "5", comentario: "Espacio Reducido" },
    // 2026-10-16 (Fri - Match vs Cartagena)
    { fecha: "2026-10-16", slot: 0, tipo: "Vi", hora: "07:15", lugar: "Aeropuerto Barcelona", duracion: "120", orientacion: "VIAJE", carga: "1", comentario: "Salida Aeropuerto Barcelona 07:15h - Viatge Cartagena" },
    { fecha: "2026-10-16", slot: 1, tipo: "Pa", hora: "19:00", lugar: "CARTAGONOVA", duracion: "90", orientacion: "Jornada 8", carga: "9", comentario: "PARTIT FC Cartagena vs CE EUROPA 19:00h", competicion: "1RFEF" },
    { fecha: "2026-10-16", slot: 2, tipo: "Oop", hora: "21:00", lugar: "CARTAGONOVA", duracion: "30", orientacion: "POST-PARTIDO", carga: "2", comentario: "Recuperación post-partido" },
    { fecha: "2026-10-16", slot: 3, tipo: "Vi", hora: "22:00", lugar: "VUELO / BUS", duracion: "120", orientacion: "REGRESO", carga: "1", comentario: "Regreso a Barcelona" },
    // 2026-10-17 (Sat)
    { fecha: "2026-10-17", slot: 0, tipo: "Rec", hora: "11:00", lugar: "NOU SARDENYA", duracion: "45", orientacion: "RECUPERACION", carga: "3", comentario: "Regenerativo y recuperación" },
    // 2026-10-18 (Sun)
    { fecha: "2026-10-18", slot: 0, tipo: "Descans", hora: "", lugar: "CASA", duracion: "0", orientacion: "DESCANS", carga: "0", comentario: "DESCANS / OFF" },
    // 2026-10-19 (Mon)
    { fecha: "2026-10-19", slot: 0, tipo: "Descans", hora: "", lugar: "CASA", duracion: "0", orientacion: "DESCANS", carga: "0", comentario: "DESCANS / OFF" },
    // 2026-10-20 (Tue)
    { fecha: "2026-10-20", slot: 0, tipo: "Gim", hora: "10:00", lugar: "GIMNASIO", duracion: "60", orientacion: "FUERZA", carga: "6", comentario: "CONVOCATORIA 09:15 - GYM GRUPAL" },
    { fecha: "2026-10-20", slot: 1, tipo: "Op", hora: "11:00", lugar: "NOU SARDENYA", duracion: "75", orientacion: "ENTRENAMENT", carga: "7", comentario: "ENTRENAMENT NOU SARDENYA" },
    // 2026-10-21 (Wed)
    { fecha: "2026-10-21", slot: 0, tipo: "Gim", hora: "10:00", lugar: "GIMNASIO", duracion: "60", orientacion: "FUERZA", carga: "6", comentario: "CONVOCATORIA 09:15 - GYM GRUPAL" },
    { fecha: "2026-10-21", slot: 1, tipo: "Op", hora: "11:00", lugar: "NOU SARDENYA", duracion: "75", orientacion: "ENTRENAMENT", carga: "7", comentario: "ENTRENAMENT NOU SARDENYA" },
    // 2026-10-22 (Thu)
    { fecha: "2026-10-22", slot: 0, tipo: "Gim", hora: "10:00", lugar: "GIMNASIO", duracion: "60", orientacion: "FUERZA", carga: "6", comentario: "CONVOCATORIA 10:00 - GYM GRUPAL" },
    { fecha: "2026-10-22", slot: 1, tipo: "Op", hora: "11:00", lugar: "CAMP CAN DRAGÓ", duracion: "75", orientacion: "ENTRENAMENT", carga: "7", comentario: "ENTRENAMENT CAMP CAN DRAGÓ" },
    // 2026-10-23 (Fri)
    { fecha: "2026-10-23", slot: 0, tipo: "VD", hora: "10:15", lugar: "SALA VIDEO", duracion: "30", orientacion: "VIDEO ABP", carga: "2", comentario: "CONVOCATORIA 09:45 - VIDEO ABP" },
    { fecha: "2026-10-23", slot: 1, tipo: "Op", hora: "11:00", lugar: "NOU SARDENYA", duracion: "60", orientacion: "PREPARTIDO", carga: "6", comentario: "ENTRENAMENT NOU SARDENYA" },
    // 2026-10-24 (Sat)
    { fecha: "2026-10-24", slot: 0, tipo: "Vi", hora: "10:15", lugar: "SALA VIDEO", duracion: "30", orientacion: "VIDEO RIVAL", carga: "2", comentario: "CONVOCATORIA 09:45 - VIDEO RIVAL" },
    { fecha: "2026-10-24", slot: 1, tipo: "Op", hora: "11:00", lugar: "NOU SARDENYA", duracion: "60", orientacion: "PREPARTIDO", carga: "5", comentario: "ENTRENAMENT NOU SARDENYA" },
    // 2026-10-25 (Sun - Match vs Real Zaragoza)
    { fecha: "2026-10-25", slot: 0, tipo: "Pa", hora: "19:00", lugar: "NOU SARDENYA", duracion: "90", orientacion: "Jornada 9", carga: "9", comentario: "PARTIT CE EUROPA vs Real Zaragoza 19:00h", competicion: "1RFEF" },
    // 2026-10-26 (Mon)
    { fecha: "2026-10-26", slot: 0, tipo: "Descans", hora: "", lugar: "CASA", duracion: "0", orientacion: "DESCANS", carga: "0", comentario: "DESCANS / OFF" },
  ];

  // 5. Clean out existing October blocks in sesiones_dia_bloques
  const octDayIds = octDays.map(d => d.id);
  console.log(`Clearing existing October blocks for ${octDayIds.length} days...`);
  await supabase.from("sesiones_dia_bloques").delete().in("day_id", octDayIds);

  // 6. Insert new complete blocks with IDs and day_id
  const dbBlocksToInsert = [];
  const eventosBloquesMap = {};

  for (const b of blocksData) {
    const s = dateToSession.get(b.fecha);
    if (!s) continue;
    const blockId = crypto.randomUUID();
    const blockRow = {
      id: blockId,
      day_id: s.id,
      slot: b.slot,
      tipo: b.tipo,
      hora: b.hora,
      lugar: b.lugar,
      duracion: b.duracion,
      orientacion: b.orientacion,
      carga: b.carga,
      comentario: b.comentario,
      num_jugadores: "22",
      competicion: b.competicion || "1RFEF"
    };
    dbBlocksToInsert.push(blockRow);

    // Save to eventosBloquesMap with all lookup keys
    const fullBlock = { ...blockRow, fecha: b.fecha };
    eventosBloquesMap[`${s.id}_slot_${b.slot}`] = fullBlock;
    eventosBloquesMap[`${b.fecha}_slot_${b.slot}`] = fullBlock;
    eventosBloquesMap[`day_${b.fecha}_slot_${b.slot}`] = fullBlock;
  }

  console.log(`Inserting ${dbBlocksToInsert.length} complete event blocks to Supabase...`);
  const { error: insBErr } = await supabase.from("sesiones_dia_bloques").insert(dbBlocksToInsert);
  if (insBErr) {
    console.error("Error inserting sesiones_dia_bloques:", insBErr);
  } else {
    console.log("Successfully inserted sesiones_dia_bloques!");
  }

  // 7. Parse genuine wellness data from wellness_live.csv
  const wellnessCsv = fs.readFileSync("/Users/MiquelNadalGaya/web/wellness_live.csv", "utf8");
  const wellnessLines = wellnessCsv.trim().split("\n").slice(1);
  const wellnessByDateAndPlayer = new Map(); // `${date}_${playerId}` -> { status, comentario, dolor, cansado }

  wellnessLines.forEach(l => {
    const parts = l.split(",");
    const rawDate = parts[1]?.trim();
    const rawName = parts[2]?.trim();
    const sueno = parseInt(parts[3]?.trim() || "0", 10);
    const dormido = parseInt(parts[4]?.trim() || "0", 10);
    const cansado = parseInt(parts[5]?.trim() || "0", 10);
    const dolor = parseInt(parts[6]?.trim() || "0", 10);
    const comentario = parts.slice(7).join(",").trim();

    let isoDate = "";
    if (rawDate) {
      const dp = rawDate.split("/");
      if (dp.length === 3) isoDate = `${dp[2]}-${dp[1].padStart(2, "0")}-${dp[0].padStart(2, "0")}`;
    }
    if (!isoDate) return;

    const norm = normalizeName(rawName);
    const match = europaPlayers.find(p => {
      const pNorm = normalizeName(p.nombre);
      const aNorm = normalizeName(p.apodo);
      if (pNorm === norm || aNorm === norm) return true;
      if (norm.length > 3 && pNorm.includes(norm)) return true;
      if (norm === "tito" && (pNorm.includes("exposito") || aNorm.includes("adri"))) return true;
      if (norm === "lucas" && pNorm.includes("madrigal")) return true;
      if (norm === "khalid" && pNorm.includes("noureddine")) return true;
      return false;
    });

    if (match) {
      let status = "D";
      if (dolor >= 7 || cansado >= 7 || (comentario && comentario.toLowerCase().includes("tobillo"))) {
        status = "NDL";
      } else if (dolor >= 4 || cansado >= 4 || dormido >= 5 || (comentario && comentario.length > 0)) {
        status = "P";
      }
      wellnessByDateAndPlayer.set(`${isoDate}_${match.id}`, { status, comentario, dolor, cansado });
    }
  });
  console.log(`Parsed ${wellnessByDateAndPlayer.size} wellness entries for CE Europa players.`);

  // 8. Clean up estado_diario_jugador:
  // User explicitly instructed: "borra los datos de bbdd que no sean de octubre"
  // And "quiero que recuperes la bbdd con CE EUROPA"
  console.log("Cleaning estado_diario_jugador (removing non-Europa & non-October)...");
  
  // First, remove non-Europa players
  const euIds = europaPlayers.map(p => p.id);
  // Delete all rows in estado_diario_jugador that do not belong to Europa players
  await supabase.from("estado_diario_jugador").delete().not("jugador_id", "in", `(${euIds.join(",")})`);

  // Next, delete all rows for Europa outside October
  const nonOctSessionIds = (await supabase.from("sesiones_dia").select("id").or("fecha.lt.2026-10-01,fecha.gt.2026-10-31")).data?.map(s => s.id) || [];
  if (nonOctSessionIds.length > 0) {
    for (let i = 0; i < nonOctSessionIds.length; i += 200) {
      const chunk = nonOctSessionIds.slice(i, i + 200);
      await supabase.from("estado_diario_jugador").delete().in("sesion_dia_id", chunk);
    }
  }

  // 9. Insert/Upsert accurate October disponibilidades
  const disponibilidadMap = {};
  const playerCommentsList = [];
  const estadosToUpsert = [];

  // Active training/match days in October
  const activeDays = [
    "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
    "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09",
    "2026-10-10", "2026-10-11", "2026-10-13", "2026-10-14",
    "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-20",
    "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24",
    "2026-10-25"
  ];

  for (const dateStr of activeDays) {
    const s = dateToSession.get(dateStr);
    if (!s) continue;

    for (const player of europaPlayers) {
      let status = "D";
      let comentario = "";

      // Check wellness survey first
      const wKey = `${dateStr}_${player.id}`;
      if (wellnessByDateAndPlayer.has(wKey)) {
        const w = wellnessByDateAndPlayer.get(wKey);
        status = w.status;
        comentario = w.comentario || "";
      } else {
        // Specific injury tracking for Europa:
        // Lucas Madrigal injured ankle from 2026-10-08 onwards
        if (player.nombre.includes("Madrigal") && dateStr >= "2026-10-08") {
          status = "NDL";
          comentario = "Lesión en el tobillo";
        }
        // Youssef Zayzoun muscle pain from 2026-10-08 onwards
        if (player.nombre.includes("Zayzoun") && dateStr >= "2026-10-08") {
          status = "NDL";
          comentario = "Molestias musculares";
        }
      }

      const rowId = crypto.randomUUID();
      estadosToUpsert.push({
        jugador_id: player.id,
        sesion_dia_id: s.id,
        disponibilidad: status,
        comentario_fisico: comentario || null, comentario_lesiones: status === "NDL" ? comentario : null,
        evento_asignado: status === "D" ? (s.evento_principal || "Op") : null
      });

      // Populate disponibilidadMap keys
      disponibilidadMap[`${player.id}_${s.id}`] = status;
      disponibilidadMap[`${player.id}_${dateStr}`] = status;
      disponibilidadMap[`${player.id}_day_${dateStr}`] = status;

      if (comentario) {
        playerCommentsList.push({
          id: `com_${player.id}_${dateStr}`,
          jugador_id: player.id,
          day_id: s.id,
          fecha: dateStr,
          tipo: "WELL",
          texto: comentario
        });
      }
    }
  }

  console.log(`Upserting ${estadosToUpsert.length} clean October estados to Supabase...`);
  // Clear existing October rows before inserting clean ones
  await supabase.from("estado_diario_jugador").delete().in("sesion_dia_id", octDayIds);

  for (let i = 0; i < estadosToUpsert.length; i += 200) {
    const chunk = estadosToUpsert.slice(i, i + 200);
    const { error: insErr } = await supabase.from("estado_diario_jugador").insert(chunk);
    if (insErr) console.error("Error inserting chunk into estado_diario_jugador:", insErr);
  }
  console.log("Successfully inserted clean October estado_diario_jugador!");

  // 10. Update public/calendar_sync_data.json and public/debug_save.json
  const syncPayload = {
    updated_at: new Date().toISOString(),
    eventosBloquesMap,
    disponibilidadMap,
    playerEventsMap: {},
    playerMinutesMap: {},
    comentarios: playerCommentsList,
    estadosMap: disponibilidadMap
  };

  fs.writeFileSync("/Users/MiquelNadalGaya/web/public/calendar_sync_data.json", JSON.stringify(syncPayload, null, 2));
  fs.writeFileSync("/Users/MiquelNadalGaya/web/public/debug_save.json", JSON.stringify({
    playerEventsMap: {},
    eventosBloquesMap
  }, null, 2));
  console.log("Successfully wrote public/calendar_sync_data.json and debug_save.json!");

  console.log("=== RESTORATION COMPLETE ===");
}

main().catch(console.error);
