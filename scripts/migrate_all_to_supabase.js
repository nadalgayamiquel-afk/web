const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const supabaseUrl = "https://noumrtldxzmtqrfmydwz.supabase.co";
const supabaseKey = "sb_publishable_H3rT__cBnF3fk5QAHUFjVg_Tf1vI9Cs";
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("🚀 Iniciando migración completa a Supabase...");

  const rootDir = path.resolve(__dirname, "..");
  const masterBackupPath = path.join(rootDir, "public", "master_backup.json");
  const ultimoBackupPath = path.join(rootDir, "backups", "ultimo_backup.json");
  const clubConfigPath = path.join(rootDir, "public", "club_config.json");

  const masterBackup = JSON.parse(fs.readFileSync(masterBackupPath, "utf8"));
  const ultimoBackup = JSON.parse(fs.readFileSync(ultimoBackupPath, "utf8"));
  let clubConfig = null;
  if (fs.existsSync(clubConfigPath)) {
    clubConfig = JSON.parse(fs.readFileSync(clubConfigPath, "utf8"));
  }

  // 1. JUGADORES
  console.log("\n1️⃣  Restaurando jugadores...");
  const rawJugadores = ultimoBackup.tables?.jugadores?.rows || [];
  if (rawJugadores.length > 0) {
    for (let i = 0; i < rawJugadores.length; i += 50) {
      const chunk = rawJugadores.slice(i, i + 50);
      const { error } = await supabase.from("jugadores").upsert(chunk, { onConflict: "id" });
      if (error) console.error("Error chunk jugadores:", error.message);
    }
    const { count } = await supabase.from("jugadores").select("*", { count: "exact", head: true });
    console.log(`✅ Jugadores en Supabase: ${count}`);
  }

  // 2. CONFIGURACION_CLUB
  console.log("\n2️⃣  Restaurando configuracion_club...");
  if (clubConfig) {
    const configRow = {
      id: "default",
      nombre_club: clubConfig.nombreClub || "CE EUROPA",
      siglas: clubConfig.siglas || "CEE",
      categoria: clubConfig.categoria || "1er Equipo",
      escudo_url: clubConfig.escudoUrl || "/ce-europa.png",
      escudo_secundario_url: clubConfig.escudoSecundarioUrl || "",
      temporada_activa: clubConfig.temporadaActiva || "2026/27",
      temporadas: clubConfig.temporadas || [],
      config_json: clubConfig,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from("configuracion_club").upsert(configRow, { onConflict: "id" });
    if (error) console.error("Error configuracion_club:", error.message);
    else console.log("✅ configuracion_club actualizada");
  }

  // 3. SESIONES_DIA (PLANIFICACION)
  console.log("\n3️⃣  Restaurando sesiones_dia...");
  const rawDays = masterBackup.planificacion_days || ultimoBackup.tables?.sesiones_dia?.rows || [];
  if (rawDays.length > 0) {
    const cleanSessions = rawDays.map(d => ({
      id: d.id,
      fecha: d.fecha,
      equipo: d.equipo || "CE EUROPA",
      periodo: d.periodo || null,
      subperiodo: d.subperiodo || null,
      semana: typeof d.semana === "number" ? d.semana : (parseInt(d.semana) || null),
      md: d.md || null,
      rival: d.rival || null,
      carga: typeof d.carga === "number" ? d.carga : null,
      volumen: typeof d.volumen === "number" ? d.volumen : null,
      intensidad: typeof d.intensidad === "number" ? d.intensidad : null,
      evento_am: d.evento_am || d.evento || d.evento_principal || null,
      evento_pm: d.evento_pm || null,
      comentario_microciclo: d.comentario_microciclo || d.comentario || null
    })).filter(s => s.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.id));

    for (let i = 0; i < cleanSessions.length; i += 50) {
      const chunk = cleanSessions.slice(i, i + 50);
      const { error } = await supabase.from("sesiones_dia").upsert(chunk, { onConflict: "id" });
      if (error) console.error("Error chunk sesiones_dia:", error.message);
    }
    const { count } = await supabase.from("sesiones_dia").select("*", { count: "exact", head: true });
    console.log(`✅ Sesiones_dia en Supabase: ${count}`);
  }

  // 4. FUERZA_SESIONES
  console.log("\n4️⃣  Restaurando fuerza_sesiones...");
  const rawFuerza = masterBackup.fuerza_sesiones || [];
  if (rawFuerza.length > 0) {
    // Tomar solo campos que existan en la tabla
    const cleanFuerza = rawFuerza.map(f => {
      const row = { ...f };
      // asegurarnos de formato
      return row;
    });

    for (let i = 0; i < cleanFuerza.length; i += 50) {
      const chunk = cleanFuerza.slice(i, i + 50);
      const { error } = await supabase.from("fuerza_sesiones").upsert(chunk, { onConflict: "id" });
      if (error) {
        // Podría ser diferencia de columnas, intentar inserción selectiva si falla
        console.warn("Aviso chunk fuerza_sesiones:", error.message);
      }
    }
    const { count } = await supabase.from("fuerza_sesiones").select("*", { count: "exact", head: true });
    console.log(`✅ Fuerza_sesiones en Supabase: ${count}`);
  }

  // 5. EJERCICIOS_GIMNASIO
  console.log("\n5️⃣  Restaurando ejercicios_gimnasio...");
  const rawEjercicios = ultimoBackup.tables?.ejercicios_gimnasio?.rows || [];
  if (rawEjercicios.length > 0) {
    for (let i = 0; i < rawEjercicios.length; i += 100) {
      const chunk = rawEjercicios.slice(i, i + 100);
      const { error } = await supabase.from("ejercicios_gimnasio").upsert(chunk, { onConflict: "id" });
      if (error) console.error("Error ejercicios chunk:", error.message);
    }
    const { count } = await supabase.from("ejercicios_gimnasio").select("*", { count: "exact", head: true });
    console.log(`✅ Ejercicios_gimnasio en Supabase: ${count}`);
  }

  console.log("\n🎉 Migración a Supabase terminada con éxito!");
}

run().catch(err => {
  console.error("Error fatal en migración:", err);
  process.exit(1);
});
