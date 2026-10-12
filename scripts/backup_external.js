#!/usr/bin/env node
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env.local") });
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Error: Faltan variables de Supabase en .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TABLES = [
  "jugadores",
  "sesiones_dia",
  "sesiones_dia_bloques",
  "estado_diario_jugador",
  "minutos_jugador_evento",
  "gps_datos",
  "lesiones",
  "fuerza_sesiones",
  "ejercicios_gimnasio",
  "ejercicios_campo",
  "rutinas",
  "comentarios",
  "configuracion_club",
  "tipos_evento"
];

function findExternalVolume() {
  try {
    const volumes = fs.readdirSync("/Volumes");
    const external = volumes.filter(v => v !== "Macintosh HD" && v !== "Recovery" && !v.startsWith("."));
    if (external.length > 0) {
      return path.join("/Volumes", external[0]);
    }
  } catch (e) {}
  return null;
}

async function fetchAllRows(tableName) {
  let allRows = [];
  let from = 0;
  const step = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .range(from, from + step - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allRows = allRows.concat(data);
      if (data.length < step) {
        hasMore = false;
      } else {
        from += step;
      }
    }
  }

  return allRows;
}

async function runBackup() {
  const now = new Date();
  const dateStr = now.toISOString().replace(/T/, "_").replace(/\..+/, "").replace(/:/g, "-");
  const externalVol = findExternalVolume();
  let targetDir = "";

  if (externalVol) {
    targetDir = path.join(externalVol, "Backups_TopPlay_Europa");
    console.log("💾 Memoria externa detectada:", externalVol);
  } else {
    targetDir = path.resolve(__dirname, "..", "backups");
    console.log("ℹ️  Guardando en carpeta de respaldos del proyecto:", targetDir);
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log("📦 Extrayendo tablas completas de Supabase...");
  const backupData = {
    timestamp: now.toISOString(),
    origen: supabaseUrl,
    tables: {}
  };

  for (const table of TABLES) {
    try {
      const rows = await fetchAllRows(table);
      const count = rows.length;
      console.log(`  ✅ ${table}: ${count} filas`);
      backupData.tables[table] = { count, rows };
    } catch (err) {
      // Ignorar amigablemente tablas opcionales que aún no existan
      if (err.message && err.message.includes("does not exist") || err.message.includes("schema cache")) {
        console.log(`  ℹ️  ${table}: tabla no existe en la BD actual (omitida)`);
      } else {
        console.log(`  ⚠️  ${table}: ${err.message}`);
      }
      backupData.tables[table] = { count: 0, rows: [] };
    }
  }

  const filename = `backup_${dateStr}.json`;
  const filePath = path.join(targetDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), "utf8");
  
  // Guardar siempre copia de referencia directa en backups/ultimo_backup.json
  const rootBackupsDir = path.resolve(__dirname, "..", "backups");
  if (!fs.existsSync(rootBackupsDir)) {
    fs.mkdirSync(rootBackupsDir, { recursive: true });
  }
  fs.writeFileSync(path.join(rootBackupsDir, "ultimo_backup.json"), JSON.stringify(backupData, null, 2), "utf8");

  const sizeMB = (Buffer.byteLength(JSON.stringify(backupData)) / (1024 * 1024)).toFixed(2);
  console.log(`\n🎉 Backup completado con éxito: ${filePath} (${sizeMB} MB)`);
  return { backupData, filePath, sizeMB };
}

if (require.main === module) {
  runBackup().catch(err => {
    console.error("Error fatal durante el backup:", err);
    process.exit(1);
  });
}

module.exports = { runBackup, TABLES };
