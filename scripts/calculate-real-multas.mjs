import { createClient } from "@supabase/supabase-js";
import https from "https";
import http from "http";
import fs from "fs";

const supabaseUrl = "https://noumrtldxzmtqrfmydwz.supabase.co";
const supabaseKey = "sb_secret_auvqexI3sOGej22r57MSaA_Ko_YGSn-";
const supabase = createClient(supabaseUrl, supabaseKey);

function fetchUrl(targetUrl) {
  return new Promise((resolve, reject) => {
    const client = targetUrl.startsWith("https") ? https : http;
    client.get(targetUrl, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] !== undefined ? values[idx] : "";
      obj[`_col${idx}`] = values[idx] !== undefined ? values[idx] : "";
    });
    rows.push(obj);
  }
  return rows;
}

function normalizeDateStr(dateRaw) {
  if (!dateRaw) return "";
  const str = String(dateRaw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const firstSpace = str.split(" ")[0];
  const parts = firstSpace.split(/[\/\-\.]/);
  if (parts.length >= 3) {
    let p1 = parseInt(parts[0], 10);
    let p2 = parseInt(parts[1], 10);
    let p3 = parseInt(parts[2], 10);
    if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
      if (p3 < 100) p3 += 2000;
      if (p3 > 2000) {
        return `${p3}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
      } else if (p1 > 2000) {
        return `${p1}-${String(p2).padStart(2, "0")}-${String(p3).padStart(2, "0")}`;
      }
    }
  }
  return "";
}

function normalizeNameStr(name) {
  return (name || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function matchPlayer(rawName, players) {
  if (!rawName) return null;
  const sNorm = normalizeNameStr(rawName);
  if (!sNorm) return null;
  return players.find(p => {
    const pNombre = normalizeNameStr(p.nombre || "");
    const pApodo = normalizeNameStr(p.apodo || "");
    if (sNorm.includes("olmedo") && (pNombre.includes("olmedo") || pApodo.includes("olmedo"))) return true;
    if ((sNorm.includes("iglesia") || sNorm.includes("igle")) && (pNombre.includes("iglesia") || pNombre.includes("igle") || pApodo.includes("iglesia") || pApodo.includes("igle"))) return true;
    if ((sNorm.includes("puli") || sNorm.includes("pulido")) && (pNombre.includes("puli") || pNombre.includes("pulido") || pApodo.includes("puli") || pApodo.includes("pulido"))) return true;
    if (pNombre && (pNombre.includes(sNorm) || sNorm.includes(pNombre))) return true;
    if (pApodo && (pApodo.includes(sNorm) || sNorm.includes(pApodo))) return true;
    const sTokens = sNorm.split(/\s+/);
    const pTokens = pNombre.split(/\s+/);
    const pApodoTokens = pApodo.split(/\s+/);
    return sTokens.some(t => t.length > 2 && (pTokens.includes(t) || pApodoTokens.includes(t)));
  }) || null;
}

function extractSubmissionTime(r) {
  let str = (r["HORA"] || r["_col8"] || r["_colI"] || "").trim();
  if (!str) str = (r["Marca temporal"] || r["_col0"] || "").trim();
  if (!str) return { timeStr: "", isLate: false };
  const timeMatch = str.match(/(?:(\d{1,2})[:\.](\d{2})(?:[:\.](\d{2}))?\s*(am|pm)?)/i);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const m = parseInt(timeMatch[2], 10);
    const ampm = timeMatch[4] ? timeMatch[4].toLowerCase() : "";
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    const formatted = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}h`;
    const totalMins = h * 60 + m;
    return { timeStr: formatted, isLate: totalMins >= 750 };
  }
  return { timeStr: str, isLate: false };
}

async function run() {
  const { data: allJugadores } = await supabase.from("jugadores").select("id, nombre, apodo, cor_id, posicion, activo, equipo, temporada, foto_url").eq("activo", true).order("nombre");
  
  const manresaPlayers = allJugadores.filter(j => (j.equipo || "").includes("Manresa") || j.temporada === "2026/27" || !j.equipo);
  console.log("CE Manresa active players:", manresaPlayers.length);

  const { data: sesiones } = await supabase.from("sesiones_dia").select("*");
  console.log("Sesiones in DB:", sesiones?.length || 0);

  const csvRaw = await fetchUrl("https://docs.google.com/spreadsheets/d/1ACZbF7rNgx4kx3ACbpT7JhBN4mJrnWt3n_jZqpU75gw/export?format=csv&gid=321515819");
  const records = parseCSV(csvRaw);
  console.log("Total Sheet records:", records.length);

  const recordsByDate = {};
  records.forEach(r => {
    const rawDate = r["1. FECHA"] || r["_col1"] || r["Marca temporal"] || r["_col0"];
    const iso = normalizeDateStr(rawDate);
    if (!iso) return;
    if (!recordsByDate[iso]) recordsByDate[iso] = [];
    recordsByDate[iso].push(r);
  });

  const dates = Object.keys(recordsByDate).sort();

  const sessionDatesWithEvents = new Set();
  (sesiones || []).forEach(s => {
    const d = normalizeDateStr(s.fecha);
    const tipo = (s.evento_am || s.evento_principal || s.tipo_evento || s.tipo || "").trim().toUpperCase();
    if (d && tipo && tipo !== "D" && tipo !== "DESCANSO" && tipo !== "LIBRE") {
      sessionDatesWithEvents.add(d);
    }
  });

  // Unique training/session dates where team trained
  const allAnalysisDates = Array.from(new Set([...dates, ...Array.from(sessionDatesWithEvents)])).sort();
  const allFines = [];

  allAnalysisDates.forEach(dateStr => {
    const dayRecords = recordsByDate[dateStr] || [];
    const hasDbEvent = sessionDatesWithEvents.has(dateStr);
    
    // Day was active if DB marked an event or players submitted responses (>4 submissions)
    const isEventDay = hasDbEvent || dayRecords.length >= 4;

    if (!isEventDay) return;

    manresaPlayers.forEach(j => {
      const playerRecord = dayRecords.find(r => {
        const rawName = r["NOMBRE"] || r["_col2"];
        return matchPlayer(rawName, [j]);
      });

      if (!playerRecord) {
        allFines.push({
          id: `real_well_no_${j.id}_${dateStr}`,
          fecha: dateStr,
          jugador_id: j.id,
          jugador_nombre: j.nombre,
          jugador_apodo: j.apodo || undefined,
          jugador_dorsal: j.cor_id || undefined,
          jugador_foto: j.foto_url || undefined,
          equipo: j.equipo || "CE Manresa",
          categoria: "Preparación Física",
          concepto: "Wellness No Realizado",
          importe: 5,
          reincidencia: "1ª Falta",
          comentario: "",
          creado_por: "Detector Automático",
        });
      } else {
        const sub = extractSubmissionTime(playerRecord);
        if (sub.isLate) {
          allFines.push({
            id: `real_well_tarde_${j.id}_${dateStr}`,
            fecha: dateStr,
            jugador_id: j.id,
            jugador_nombre: j.nombre,
            jugador_apodo: j.apodo || undefined,
            jugador_dorsal: j.cor_id || undefined,
            jugador_foto: j.foto_url || undefined,
            equipo: j.equipo || "CE Manresa",
            categoria: "Preparación Física",
            concepto: "Cuestionario Wellness (>12:30h)",
            importe: 5,
            reincidencia: "1ª Falta",
            comentario: "",
            creado_por: "Detector Automático",
          });
        }
      }
    });
  });

  console.log("Total Fines calculated for CE Manresa:", allFines.length);
  
  const finesByPlayer = {};
  allFines.forEach(f => {
    if (!finesByPlayer[f.jugador_nombre]) {
      finesByPlayer[f.jugador_nombre] = { total: 0, noResp: 0, tarde: 0 };
    }
    finesByPlayer[f.jugador_nombre].total += f.importe;
    if (f.concepto.includes("No Realizado")) finesByPlayer[f.jugador_nombre].noResp++;
    else finesByPlayer[f.jugador_nombre].tarde++;
  });

  console.log("Ranking de Multas Reales por Deportista (€):");
  Object.entries(finesByPlayer)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([nombre, data], idx) => {
      console.log(`${idx + 1}. ${nombre}: ${data.total}€ (${data.noResp} no realizados, ${data.tarde} tardíos)`);
    });

  fs.writeFileSync("app/informes/multas/real-multas-data.json", JSON.stringify(allFines, null, 2));
  console.log("Saved real-multas-data.json with", allFines.length, "multas!");
}

run();
