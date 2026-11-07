const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const envFile = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const env = {};
envFile.split("\n").forEach((line) => {
  const parts = line.split("=");
  if (parts.length >= 2) env[parts[0].trim()] = parts.slice(1).join("=").trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "https://noumrtldxzmtqrfmydwz.supabase.co";
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_H3rT__cBnF3fk5QAHUFjVg_Tf1vI9Cs";

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncPreferentePhotos() {
  console.log("🚀 Sincronizando fotos de La Preferente a Supabase y archivos locales...");

  const rootDir = path.resolve(__dirname, "..");
  const masterBackupPath = path.join(rootDir, "public", "master_backup.json");
  const masterDataPath = path.join(rootDir, "backups", "master_data_backup_complete.json");
  const localStorageRestorePath = path.join(rootDir, "public", "local_storage_restore.json");

  const masterBackup = JSON.parse(fs.readFileSync(masterBackupPath, "utf8"));
  const masterData = JSON.parse(fs.readFileSync(masterDataPath, "utf8"));

  // Explicit photo map for 100% precision
  const preferentePhotos = {
    // CE Europa
    "936bde19-df6b-4e2e-b7ea-c1f7259ea061": "https://www.lapreferente.com/imagenes/jugadores/20242025/434115.png?f=1743759989", // POL CARAMES
    "09c711ca-94ef-4e87-bb2b-eac760b560a5": "https://www.lapreferente.com/imagenes/jugadores/20262027/292316.png?f=1789535307", // JOAN MASCARÓ
    "5b2a3f2a-59d4-4acc-9edb-8fad83e23255": "https://www.lapreferente.com/imagenes/jugadores/20262027/132690.png?f=1789535266", // ÀLEX CANO
    "98b96ba6-452b-42d0-98a7-46494805f57d": "https://www.lapreferente.com/imagenes/jugadores/20262027/210346.png?f=1789535409", // ARNAU CAMPENY
    "7b9ea804-6620-4222-addc-bd92ed568738": "https://www.lapreferente.com/imagenes/jugadores/20262027/268371.png?f=1789535143", // ADRIÁ PADILLO
    "ab298ab8-69cc-4c04-a572-a795f1c9c29d": "https://www.lapreferente.com/imagenes/jugadores/20262027/198413.png?f=1789535111", // ADRI EXPÓSITO
    "99f7e626-3a56-4713-aa74-cf40457b7f42": "https://www.lapreferente.com/imagenes/jugadores/20262027/276340.png?f=1789535189", // GORI GRACIA
    "9658fd9f-9012-443f-a528-14368b8b6436": "https://www.lapreferente.com/imagenes/jugadores/20262027/281549.png?f=1789535130", // KHALID NOUREDDINE
    "e910d5be-c87a-4914-b77e-6a160a0a5c06": "https://www.lapreferente.com/imagenes/jugadores/20262027/199678.png?f=1789535254", // VÍCTOR MORALES
    "d93e2fef-726e-4dcf-95d8-e8625701acab": "https://www.lapreferente.com/imagenes/jugadores/20262027/289978.png?f=1789535115", // YOUSSEF ZAYZOUN
    "5f0c7be3-d906-4bb1-9788-82a94109287e": "https://www.lapreferente.com/imagenes/jugadores/20262027/270722.png?f=1789535359", // NIL RUIZ
    "761ccd3e-f070-401a-8c64-d8efe5a19601": "https://www.lapreferente.com/imagenes/jugadores/20262027/414250.png?f=1789535221", // ALBERT TOLOSA
    "98b0633a-766d-4e9f-a414-fe6caaff1216": "https://www.lapreferente.com/imagenes/jugadores/20262027/238338.png?f=1789535260", // ENOL COTO
    "c7e00847-0ee8-4179-9ce9-baeeab36b68f": "https://www.lapreferente.com/imagenes/jugadores/20262027/289868.png?f=1789535120", // FLAVIO RIBEIRO
    "d2f1ebac-066f-409c-a6d1-c0a45cdee954": "https://www.lapreferente.com/imagenes/jugadores/20262027/259601.png?f=1789535180", // MARC ANGLÈS
    "65361137-e803-4ee7-81e2-cffe149ad3ac": "https://www.lapreferente.com/imagenes/jugadores/20262027/283335.png?f=1789535421", // JOAN PUIG
    "2bdda3ea-4c14-44c4-9bba-197d22816d32": "https://www.lapreferente.com/imagenes/jugadores/20262027/226819.png?f=1789535291", // MARCEL SGRÒ
    "24c7dc44-6a31-4ecd-b2e3-7c13f0c8e67d": "https://www.lapreferente.com/imagenes/jugadores/20262027/311189.png?f=1789535091", // SANTI PALLARÉS
    "54d42bc5-1d21-4d00-afea-0a8929f962de": "https://www.lapreferente.com/imagenes/jugadores/20262027/302915.png?f=1789535383", // LUCAS MADRIGAL
    "f2370522-a458-40bc-b7af-788063bc1b81": "https://www.lapreferente.com/imagenes/jugadores/20262027/261161.png?f=1789535331", // VICTOR EDO
    "814b1a79-cfb7-4043-b2c6-44373911909e": "https://www.lapreferente.com/imagenes/jugadores/20262027/279977.png?f=1789535184", // GUILLEM CARDELÚS
    "0c98b71d-b2a5-40bb-92bc-412e88c68e9d": "https://www.lapreferente.com/imagenes/jugadores/20262027/704352.png?f=1789535339", // PEDRO CANCELO
    "de8c9709-f1a3-43b2-836e-e4b12faccfa9": "https://www.lapreferente.com/imagenes/jugadores/20252026/369541.png?f=1789535247", // TETO MARTÍN
    "22221b7a-3581-40f1-9d6f-dbc98a22a8c4": "https://www.lapreferente.com/imagenes/jugadores/20232024/312803.jpg", // JOEL CADENAS
    "09c8253e-6341-4afa-99c8-9e1fd4e6da9d": "https://www.lapreferente.com/imagenes/jugadores/20252026/294272.png?f=1762842377", // IBUKI NEMOTO

    // AE Prat & otros jugadores con foto en Preferente
    "e23f835e-7352-498a-a669-ba27e934d5ef": "https://www.lapreferente.com/imagenes/jugadores/20192020/244746-mini.png?f=1598015277", // MARC MUÑOZ
    "fdc28e4c-1fc6-4e29-bb8a-a7b14a3d1031": "https://www.lapreferente.com/imagenes/jugadores/20252026/311191.png?f=1772445010", // GUSTAVO REINKE
    "9e77f61d-4227-468c-849a-01f05f6e1e04": "https://www.lapreferente.com/imagenes/jugadores/20252026/301914.png?f=1752228313", // ADRI TORO
    "b4030330-aa2a-44c8-91fe-6af3968cef29": "https://www.lapreferente.com/imagenes/jugadores/20252026/425901.png?f=1752931779", // DANI BONAVENTURA
    "7906d851-3902-4c70-8acf-98c07e5b4250": "https://www.lapreferente.com/imagenes/jugadores/20252026/304522-mini.png?f=1752931768", // XAVI VICTOR
    "13ec2ec0-fc55-4daf-88c0-6f4f55aad20f": "https://www.lapreferente.com/imagenes/jugadores/20262027/314776-mini.png?f=1787221899", // DAVID ADÁN
    "cff9dd02-f39e-4a5d-8381-305e396b90fe": "https://www.lapreferente.com/imagenes/jugadores/20262027/210551.png?f=1793287930", // ADRI RIVAS
    "76a28b2d-cc52-44a1-908f-44d0f12e29f9": "https://www.lapreferente.com/imagenes/jugadores/20252026/383729-mini.png?f=1764614322" // ALEJANDRO ARCHS
  };

  // 1. Actualizar en Supabase
  console.log("\n1️⃣ Actualizando en Supabase (tabla jugadores)...");
  let updatedCount = 0;
  for (const [id, url] of Object.entries(preferentePhotos)) {
    const { error } = await supabase
      .from("jugadores")
      .update({ foto_url: url })
      .eq("id", id);
    if (error) {
      console.warn(`Error actualizando jugador ${id}:`, error.message);
    } else {
      updatedCount++;
    }
  }
  console.log(`✅ ${updatedCount} jugadores actualizados con foto en Supabase.`);

  // 2. Actualizar en master_backup.json y master_data_backup_complete.json
  console.log("\n2️⃣ Actualizando archivos de backup maestros...");
  [masterBackup, masterData].forEach((b) => {
    const rows = b.database_tables?.jugadores?.rows || [];
    rows.forEach((j) => {
      if (preferentePhotos[j.id]) {
        j.foto_url = preferentePhotos[j.id];
      }
    });
  });

  fs.writeFileSync(masterBackupPath, JSON.stringify(masterBackup, null, 2), "utf8");
  fs.writeFileSync(masterDataPath, JSON.stringify(masterData, null, 2), "utf8");
  console.log("✅ master_backup.json y master_data_backup_complete.json actualizados.");

  // 3. Actualizar local_storage_restore.json si existe
  if (fs.existsSync(localStorageRestorePath)) {
    console.log("\n3️⃣ Actualizando local_storage_restore.json...");
    try {
      const restoreData = JSON.parse(fs.readFileSync(localStorageRestorePath, "utf8"));
      if (restoreData.plantilla_jugadores) {
        const plantilla = JSON.parse(restoreData.plantilla_jugadores);
        plantilla.forEach((j) => {
          if (preferentePhotos[j.id]) {
            j.foto_url = preferentePhotos[j.id];
          }
        });
        restoreData.plantilla_jugadores = JSON.stringify(plantilla);
      }
      fs.writeFileSync(localStorageRestorePath, JSON.stringify(restoreData), "utf8");
      console.log("✅ local_storage_restore.json actualizado.");
    } catch (e) {
      console.warn("Aviso actualizando local_storage_restore:", e.message);
    }
  }

  console.log("\n✨ Sincronización de fotos finalizada con éxito.");
}

syncPreferentePhotos().catch(console.error);

