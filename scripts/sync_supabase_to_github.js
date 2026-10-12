#!/usr/bin/env node
const { runBackup } = require("./backup_external");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

async function syncToGitHub() {
  console.log("==================================================");
  console.log("🚀 Sincronizando datos de Supabase con GitHub...");
  console.log("==================================================");

  // 1. Extraer los datos más recientes de Supabase
  console.log("\n1️⃣  Extrayendo datos de Supabase...");
  const { filePath, sizeMB, backupData } = await runBackup();

  // 2. Guardar snapshot en carpeta supabase/backups/
  const supabaseBackupsDir = path.resolve(__dirname, "..", "supabase", "backups");
  if (!fs.existsSync(supabaseBackupsDir)) {
    fs.mkdirSync(supabaseBackupsDir, { recursive: true });
  }
  const snapshotPath = path.join(supabaseBackupsDir, "supabase_data_latest.json");
  fs.writeFileSync(snapshotPath, JSON.stringify(backupData, null, 2), "utf8");
  console.log(`✅ Snapshot guardado en: ${snapshotPath}`);

  // 3. Preparar commit en Git
  console.log("\n2️⃣  Añadiendo cambios al repositorio Git...");
  const gitEnv = {
    ...process.env,
    GIT_EXEC_PATH: "/Applications/GitHub Desktop.app/Contents/Resources/app/git/libexec/git-core",
    GIT_TEMPLATE_DIR: "/Applications/GitHub Desktop.app/Contents/Resources/app/git/share/git-core/templates",
    GIT_TERMINAL_PROMPT: "0",
    PATH: `/Users/MiquelNadalGaya/.gemini/antigravity-ide/bin:/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin:${process.env.PATH}`
  };

  try {
    // Añadir migraciones de Supabase y respaldos de datos
    execSync("git add supabase/ backups/ultimo_backup.json public/club_config.json", {
      cwd: path.resolve(__dirname, ".."),
      env: gitEnv,
      stdio: "inherit"
    });

    const nowStr = new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
    const commitMsg = `chore: sincronizar datos y esquema de Supabase [${nowStr}]`;

    // Comprobar si hay cambios para commitear
    const status = execSync("git status --porcelain supabase/ backups/ultimo_backup.json public/club_config.json", {
      cwd: path.resolve(__dirname, ".."),
      env: gitEnv,
      encoding: "utf8"
    });

    if (status.trim()) {
      execSync(`git commit -m "${commitMsg}"`, {
        cwd: path.resolve(__dirname, ".."),
        env: gitEnv,
        stdio: "inherit"
      });
      console.log(`✅ Cambios confirmados en Git: "${commitMsg}"`);
    } else {
      console.log("ℹ️  No hay cambios pendientes en los datos o esquemas respecto al último commit.");
    }

    // 4. Subir a GitHub
    console.log("\n3️⃣  Subiendo cambios a GitHub (git push origin main)...");
    try {
      execSync("git push origin main", {
        cwd: path.resolve(__dirname, ".."),
        env: gitEnv,
        stdio: "inherit"
      });
      console.log("\n🎉 ¡ÉXITO! La información de Supabase y el proyecto se han subido a GitHub correctamente.");
    } catch (pushErr) {
      console.log("\n⚠️  El commit local se ha creado correctamente, pero 'git push' requiere credenciales.");
      console.log("👉 Puedes abrir GitHub Desktop y hacer clic en 'Push origin', o configurar tu Personal Access Token (PAT) de GitHub.");
    }
  } catch (err) {
    console.error("❌ Error en el proceso de Git:", err.message);
  }
}

syncToGitHub().catch(err => {
  console.error("Error fatal:", err);
  process.exit(1);
});
