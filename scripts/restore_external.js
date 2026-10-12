#!/usr/bin/env node
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env.local") });
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Error: Faltan variables de Supabase en .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function findBackupFile() {
  const arg = process.argv[2];
  if (arg && fs.existsSync(arg)) return arg;

  try {
    const volumes = fs.readdirSync("/Volumes");
    const external = volumes.filter(v => v !== "Macintosh HD" && v !== "Recovery" && !v.startsWith("."));
    if (external.length > 0) {
      const extFile = path.join("/Volumes", external[0], "Backups_TopPlay_Europa", "ultimo_backup.json");
      if (fs.existsSync(extFile)) return extFile;
    }
  } catch (e) {}

  const localFile = path.resolve(__dirname, "..", "backups", "ultimo_backup.json");
  if (fs.existsSync(localFile)) return localFile;
  return null;
}

async function runRestore() {
  const file = findBackupFile();
  if (!file) {
    console.error("❌ No se encontró ningún archivo de backup para restaurar.");
    process.exit(1);
  }

  console.log("📦 Restaurando desde:", file);
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  const tables = Object.keys(backup.tables || {});

  for (const t of tables) {
    const rows = backup.tables[t]?.rows || [];
    if (rows.length === 0) continue;
    console.log("Restaurando tabla: " + t + " (" + rows.length + " filas)...");
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const { error } = await supabase.from(t).upsert(chunk);
      if (error) console.error("  ⚠️ Error en chunk " + t + ":", error.message);
    }
    console.log("  ✅ Tabla " + t + " restaurada.");
  }
  console.log("\n🎉 Restauración completada con éxito.");
}

runRestore().catch(err => {
  console.error("Error fatal en restore:", err);
  process.exit(1);
});