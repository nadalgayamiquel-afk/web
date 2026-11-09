"use client";

import { pruneStaleFutureLocalStorage } from "@/app/lib/cleanStorage";
import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { fetchLiveWellnessSheet, getPlayerCommentsBBDD, getActiveJugadores, getAllJugadoresIncludingArchived, getEstadoDiarioConFechas, getOptimizadorSessionNumber, getSesionesDiaRange, saveFullPlanificacionBBDD, updateFullBBDDRow, getDisponibilidadPlanificacionData, updateEstadoDiarioJugador, savePlayerCommentBBDD } from "@/app/actions";
import { getDisponibilidadInfo, getSemaforoCategoria } from "@/app/lib/disponibilidad";
import { getLiveClientSessionNumber } from "@/app/lib/sessionCounter";
import HistorialLesionesView from "./HistorialLesionesView";
import { useClubConfig } from "@/app/lib/useClubConfig";
import { findMatchingJugador as findMatchingJugadorLib, extractPlayerNameFromRow, isRowMatchingDate } from "@/app/lib/playerMatching";

const teamsBySeason = {
  "2026/27": ["CE Europa"],
  "2025/26": ["AE Prat"],
};

const standaloneScreens = [
  ["▦", "Índice", "/indice"], ["🏃", "Deportistas", "/deportistas"],
  ["📅", "Planificación", "/calendario"], ["📋", "Disponibilidad", "/disponibilidad"],
  ["⚡", "Cargas", "/cargas"], ["🗓️", "Calendario", "/eventos"],
  ["⚽", "Campo", "/campo"], ["🏋️", "Gimnasio", "/gimnasio"], ["🏆", "Partidos", "/partidos"],
  ["📊", "Testing", "/testing"],
] as const;

const reports = [
  { name: "Report Sesión", href: "/informes/gps-diario" },
  { name: "Report Microciclo", href: "/informes/microciclo" },
  { name: "Report Mesociclo", href: "/informes/mesociclo" },
  { name: "Report Anual", href: "/informes/anual" },
  { name: "Report Partidos", href: "/informes/partidos" },
  { name: "Multas", href: "/informes/multas" },
];
const databaseScreens = ["BBDD", "BBDD_GPS", "BBDD_LESIONES", "BBDD_TESTS", "BBDD_FUERZA", "BBDD_CAMPO", "BBDD_EJERCICIOS", "BBDD_EJERCICIOS_CAMPO", "BBDD_RUTINAS", "BBDD_GRUPOS"];

const DEFAULT_EXCEL_URL = "https://docs.google.com/spreadsheets/d/1JQXKfCrGCxom-N-RM-6nbDqQ0asnL_le0Z4EOwFc5Ds/edit?gid=432486581#gid=432486581";

function normalizeNameStr(name: string): string {
  return (name || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function matchPlayerName(sheetNameRaw: string, player: { nombre?: string; apodo?: string }): boolean {
  if (!sheetNameRaw || !player) return false;
  const sNorm = normalizeNameStr(sheetNameRaw);
  const pNombre = normalizeNameStr(player.nombre || "");
  const pApodo = normalizeNameStr(player.apodo || "");

  if (!sNorm) return false;

  // Regla explícita Nico Olmedo <-> Nicolas Olmedo
  if (sNorm.includes("olmedo") && (pNombre.includes("olmedo") || pApodo.includes("olmedo"))) {
    return true;
  }

  // Regla explícita Alex Iglesias <-> Igle
  if ((sNorm.includes("iglesia") || sNorm.includes("igle")) && (pNombre.includes("iglesia") || pNombre.includes("igle") || pApodo.includes("iglesia") || pApodo.includes("igle"))) {
    return true;
  }

  // Regla de equivalencia explícita Puli <-> Pulido
  if ((sNorm.includes("puli") || sNorm.includes("pulido")) && (pNombre.includes("puli") || pNombre.includes("pulido") || pApodo.includes("puli") || pApodo.includes("pulido"))) {
    return true;
  }

  if (pNombre && pNombre.includes(sNorm)) return true;
  if (pApodo && pApodo.includes(sNorm)) return true;

  const sTokens = sNorm.split(/\s+/).filter(t => t.length > 2);
  const pTokens = pNombre.split(/\s+/).filter(t => t.length > 2);
  const pApodoTokens = pApodo.split(/\s+/).filter(t => t.length > 2);

  if (sTokens.length === 0) return false;

  const matchedTokens = sTokens.filter((t) => pTokens.includes(t) || pApodoTokens.includes(t));

  const allDbTokensMatched = pTokens.length > 0 && pTokens.every(t => sTokens.includes(t));
  if (allDbTokensMatched) return true;

  const allWrittenTokensMatched = sTokens.length > 0 && sTokens.every(t => pTokens.includes(t) || pApodoTokens.includes(t));
  if (allWrittenTokensMatched) return true;

  if (matchedTokens.length >= 2) return true;
  if (sTokens.length === 1 && matchedTokens.length === 1) return true;

  return false;
}

function normalizeDateStr(dateRaw: any): string {
  if (!dateRaw) return "";
  const str = String(dateRaw).trim();

  // Caso YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }

  // Extraer la parte de la fecha ignorando la hora ("11/08/2026 09:30:00" -> "11/08/2026")
  const firstSpace = str.split(" ")[0];
  const parts = firstSpace.split(/[\/\-\.]/);
  if (parts.length >= 3) {
    let p1 = parseInt(parts[0], 10);
    let p2 = parseInt(parts[1], 10);
    let p3 = parseInt(parts[2], 10);

    if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
      if (p3 < 100) p3 += 2000;
      if (p3 > 2000) {
        const dd = String(p1).padStart(2, "0");
        const mm = String(p2).padStart(2, "0");
        return `${p3}-${mm}-${dd}`;
      } else if (p1 > 2000) {
        const mm = String(p2).padStart(2, "0");
        const dd = String(p3).padStart(2, "0");
        return `${p1}-${mm}-${dd}`;
      }
    }
  }
  return "";
}

function getWellnessCommentForPlayer(record: any): string {
  if (!record) return "";

  const keys = Object.keys(record);

  const isValidComment = (val: string) => {
    if (!val) return false;
    const v = val.trim();
    if (!v) return false;
    if (/^\d+$/.test(v) || v === "—" || v === "-" || v === "null" || v === "undefined" || v === "N/A" || v.toLowerCase() === "ninguno" || v.toLowerCase() === "nada") {
      return false;
    }
    return true;
  };

  // 1. Probar únicamente la Columna H (_colH / Columna 8 / índice 7)
  if (record["_colH"] !== undefined && record["_colH"] !== null) {
    const text = String(record["_colH"]).trim();
    if (isValidComment(text)) return text;
  }
  
  if (keys.length > 7 && record[keys[7]] !== undefined && record[keys[7]] !== null) {
    const key7 = keys[7];
    // Asegurar que la clave 7 no pertenezca a la Columna G (_colG, doms, dolor)
    if (!key7.endsWith("_colG") && !key7.endsWith("_col6") && !key7.toLowerCase().includes("doms") && !key7.toLowerCase().includes("dolor")) {
      const text = String(record[key7]).trim();
      if (isValidComment(text)) return text;
    }
  }

  // 2. Si aún no tenemos texto válido, buscar por cabecera explícita
  const commentKeys = keys.filter((k) => {
    const kNorm = k.toLowerCase();
    if (kNorm.includes("doms") || kNorm.includes("dolor") || kNorm.includes("zona") || k.endsWith("_colG") || k.endsWith("_col6")) {
      return false;
    }
    return !k.startsWith("_col") && (kNorm.includes("comentario") || kNorm.includes("observacion") || kNorm.includes("notas"));
  });

  for (const k of commentKeys) {
    if (record[k] !== undefined && record[k] !== null) {
      const text = String(record[k]).trim();
      if (isValidComment(text)) return text;
    }
  }

  return "";
}

// Extraer fecha ISO primero de la Columna A y si no es válida, de la Columna B
function extractRecordDateISO(r: any): string {
  if (!r) return "";
  const keys = Object.keys(r);

  // Probar Columna A (_colA, _col0, Marca temporal, Timestamp, Fecha, keys[0])
  const rawA = r["_colA"] || r["_col0"] || r["Marca temporal"] || r["Timestamp"] || r["Fecha"] || r[keys[0]] || "";
  let iso = normalizeDateStr(rawA);
  if (iso) return iso;

  // Probar Columna B (_colB, _col1, keys[1]) si la Columna A no contenía fecha
  const rawB = r["_colB"] || r["_col1"] || r[keys[1]] || "";
  iso = normalizeDateStr(rawB);
  if (iso) return iso;

  return "";
}

// Extraer nombre del jugador evitando campos de fecha
function extractRecordPlayerName(r: any): string {
  if (!r) return "";
  const keys = Object.keys(r);

  const explicit = r["_colC"] || r["_colB"] || r["Jugador"] || r["Jugadora"] || r["Nombre"] || r["Nombre y Apellidos"] || r["Apellidos y Nombre"];
  if (explicit && typeof explicit === "string" && !/^\d{1,4}[\/\-\.]\d{1,4}/.test(explicit.trim())) {
    return explicit;
  }

  for (let i = 0; i < Math.min(keys.length, 4); i++) {
    const val = r[keys[i]];
    if (typeof val === "string" && val.trim().length > 1 && !normalizeDateStr(val)) {
      return val;
    }
  }

  return "";
}

// Algoritmo de coincidencia inteligente de deportistas
function findMatchingJugador(rawName: string, jugadores: any[], preferred?: any[]) {
  return findMatchingJugadorLib(rawName, jugadores, preferred);
}

// Obtener nombre corto o apodo del deportista para la tarjeta en el campo táctico
function getShortPlayerName(player: { nombre: string; apodo?: string | null }) {
  if (player?.apodo && String(player.apodo).trim()) {
    return String(player.apodo).trim().toUpperCase();
  }
  if (!player?.nombre) return "—";
  const parts = String(player.nombre).trim().split(/\s+/);
  return (parts[0] || player.nombre).toUpperCase();
}

function getShortPlayerName_OLD(player: { nombre: string; apodo?: string | null }) {
  if (player?.apodo && String(player.apodo).trim()) {
    return String(player.apodo).trim();
  }
  if (!player?.nombre) return "—";
  const parts = String(player.nombre).trim().split(/\s+/);
  return parts[0] || player.nombre;
}

// Calcular disponibilidad de un jugador relacionando su estado en Calendario y semáforo:
// "verde" = Disponible (D), "amarillo" = Con Cuidado (P, NDR), "rojo" = No Disponible (L, NDO, NDL...), "gris" = Sin asignación / sin color
function getPlayerStatus(
  record: any,
  playerId?: string,
  statusOverrides?: Record<string, "verde" | "amarillo" | "rojo" | "gris">,
  calendarioStatus?: string,
  selectedDate?: string
) {
  // 1. Override manual explícito en Disponibilidad (máxima prioridad)
  if (playerId && statusOverrides) {
    const keyDate = selectedDate ? `${playerId}_${selectedDate}` : "";
    const custom = (keyDate && statusOverrides[keyDate]) || statusOverrides[playerId];
    if (custom) {
      if (custom === "gris") {
        return { status: "gris", label: "Sin color", bg: "#f1f5f9", border: "#cbd5e1", color: "#64748b", code: "" };
      } else if (custom === "rojo") {
        return { status: "rojo", label: "No Disponible (NDL)", bg: "#fee2e2", border: "#ef4444", color: "#b91c1c", code: "NDL" };
      } else if (custom === "amarillo") {
        return { status: "amarillo", label: "Con Cuidado (P)", bg: "#fef3c7", border: "#f59e0b", color: "#b45309", code: "P" };
      } else if (custom === "verde") {
        return { status: "verde", label: "Disponible (D)", bg: "#dcfce7", border: "#22c55e", color: "#15803d", code: "D" };
      }
    }
  }

  // 2. Si hay un código de disponibilidad definido en el Calendario para este jugador en la fecha seleccionada:
  if (calendarioStatus && calendarioStatus.trim()) {
    const rawCode = calendarioStatus.trim().toUpperCase();
    const normalizedCode = rawCode === "L" ? "NDL" : rawCode;
    const cat = getSemaforoCategoria(normalizedCode);
    const info = getDisponibilidadInfo(normalizedCode);
    const codLabel = info ? info.nombre : normalizedCode;

    if (info) {
      const labelPrefix = cat === "amarillo" ? "Con Cuidado" : cat === "rojo" ? "No Disponible" : "Disponible";
      const code = info.codigo;

      let bg = "#ffffff";
      let border = info.color;
      let textColor = info.textColor;

      if (code === 'D') { bg = "#dcfce7"; border = "#22c55e"; textColor = "#15803d"; }
      else if (code === 'P') { bg = "#fef3c7"; border = "#f59e0b"; textColor = "#b45309"; }
      else if (code === 'NDL' || code === 'NDR' || code === 'NDO' || code === 'L') { bg = "#fee2e2"; border = "#ef4444"; textColor = "#b91c1c"; }
      else if (code === 'DCS') { bg = "#e0f2fe"; border = "#38bdf8"; textColor = "#0369a1"; } // Blue
      else if (code === 'DS') { bg = "#f3e8ff"; border = "#c084fc"; textColor = "#7e22ce"; } // Purple
      else if (code === 'DCI') { bg = "#dcfce7"; border = "#4ade80"; textColor = "#14532d"; } // Light green

      return { status: cat, label: `${labelPrefix} (${codLabel})`, bg, border, color: textColor, code: normalizedCode };
    }

    if (cat === "verde") {
      return { status: "verde", label: `Disponible (${codLabel})`, bg: "#dcfce7", border: "#22c55e", color: "#15803d", code: normalizedCode };
    } else if (cat === "amarillo") {
      return { status: "amarillo", label: `Con Cuidado (${codLabel})`, bg: "#fef3c7", border: "#f59e0b", color: "#b45309", code: normalizedCode };
    } else if (cat === "rojo") {
      return { status: "rojo", label: `No Disponible (${codLabel})`, bg: "#fee2e2", border: "#ef4444", color: "#b91c1c", code: normalizedCode };
    }
  }

  // 3. Fallback basado en cuestionario / datos
  if (record) {
    const keys = Object.keys(record);
    const fatigaStr = record["Fatiga"] || record["Nivel de fatiga"] || record[keys[4]] || "2";
    const domsStr = record["Dolor Muscular"] || record["Molestias musculares"] || record[keys[5]] || "1";

    const fatiga = parseInt(String(fatigaStr).replace(/[^0-9]/g, ""), 10) || 2;
    const doms = parseInt(String(domsStr).replace(/[^0-9]/g, ""), 10) || 1;

    if (fatiga >= 7 || doms >= 7) {
      return { status: "rojo", label: "No Disponible (NDL)", bg: "#fee2e2", border: "#ef4444", color: "#b91c1c", code: "NDL" };
    } else if (fatiga >= 4 || doms >= 4) {
      return { status: "amarillo", label: "Con Cuidado", bg: "#fef3c7", border: "#f59e0b", color: "#b45309", code: "P" };
    } else {
      return { status: "verde", label: "Disponible", bg: "#dcfce7", border: "#22c55e", color: "#15803d", code: "D" };
    }
  }

  // 4. Si no hay datos ni estado asignado en Planificación/Calendario ni en el formulario -> Mostrar en GRIS (Sin color)
  return { status: "gris", label: "— Sin datos —", bg: "#f1f5f9", border: "#cbd5e1", color: "#64748b", code: "" };
}

// Mapeo táctico de posiciones en el campo

const getPitchPositions = (system: string): Record<string, { top: string; left: string }> => {
  // Sistema 3-6-1 con cuadrado interior (por defecto)
  const p361: Record<string, { top: string; left: string }> = {
    PORTERO: { top: "88%", left: "50%" },
    CENTRAL_IZQ: { top: "75%", left: "26%" },
    CENTRAL_CEN: { top: "76%", left: "50%" },
    CENTRAL_DER: { top: "75%", left: "74%" },
    LATERAL_IZQ: { top: "50%", left: "12%" }, // Carril Izquierdo
    LATERAL_DER: { top: "50%", left: "88%" }, // Carril Derecho
    PIVOTE_IZQ: { top: "59%", left: "37%" },  // Base Izq del Cuadrado
    PIVOTE_DER: { top: "59%", left: "63%" },  // Base Der del Cuadrado
    PIVOTE: { top: "59%", left: "50%" },
    INTERIOR_IZQ: { top: "37%", left: "37%" }, // Cúspide Izq del Cuadrado
    INTERIOR_DER: { top: "37%", left: "63%" }, // Cúspide Der del Cuadrado
    EXTREMO_IZQ: { top: "37%", left: "37%" },
    EXTREMO_DER: { top: "37%", left: "63%" },
    DELANTERO: { top: "17%", left: "50%" },
  };

  if (system === "3-6-1") {
    return p361;
  }

  const base: Record<string, { top: string; left: string }> = {
    PORTERO: { top: "86%", left: "50%" },
    LATERAL_IZQ: { top: "68%", left: "16%" },
    CENTRAL_IZQ: { top: "72%", left: "37%" },
    CENTRAL_CEN: { top: "72%", left: "50%" },
    CENTRAL_DER: { top: "72%", left: "63%" },
    LATERAL_DER: { top: "68%", left: "84%" },
    PIVOTE: { top: "50%", left: "50%" },
    PIVOTE_IZQ: { top: "50%", left: "42%" },
    PIVOTE_DER: { top: "50%", left: "58%" },
    INTERIOR_IZQ: { top: "42%", left: "32%" },
    INTERIOR_DER: { top: "42%", left: "68%" },
    EXTREMO_IZQ: { top: "22%", left: "18%" },
    EXTREMO_DER: { top: "22%", left: "82%" },
    DELANTERO: { top: "16%", left: "50%" },
  };

  if (system === "4-4-2") {
    return { ...base, PIVOTE: { top: "50%", left: "40%" }, PIVOTE_IZQ: { top: "50%", left: "40%" }, PIVOTE_DER: { top: "50%", left: "60%" }, INTERIOR_IZQ: { top: "50%", left: "40%" }, INTERIOR_DER: { top: "50%", left: "60%" }, EXTREMO_IZQ: { top: "42%", left: "16%" }, EXTREMO_DER: { top: "42%", left: "84%" } };
  }
  if (system === "4-2-3-1") {
    return { ...base, PIVOTE: { top: "54%", left: "38%" }, PIVOTE_IZQ: { top: "54%", left: "38%" }, PIVOTE_DER: { top: "54%", left: "62%" }, INTERIOR_IZQ: { top: "36%", left: "50%" }, INTERIOR_DER: { top: "54%", left: "62%" }, EXTREMO_IZQ: { top: "30%", left: "20%" }, EXTREMO_DER: { top: "30%", left: "80%" } };
  }
  if (system === "5-3-2") {
    return { ...base, LATERAL_IZQ: { top: "62%", left: "14%" }, LATERAL_DER: { top: "62%", left: "86%" }, CENTRAL_IZQ: { top: "72%", left: "28%" }, CENTRAL_DER: { top: "72%", left: "72%" }, PIVOTE: { top: "74%", left: "50%" }, PIVOTE_IZQ: { top: "74%", left: "42%" }, PIVOTE_DER: { top: "74%", left: "58%" }, INTERIOR_IZQ: { top: "44%", left: "35%" }, INTERIOR_DER: { top: "44%", left: "65%" }, EXTREMO_IZQ: { top: "44%", left: "35%" }, EXTREMO_DER: { top: "44%", left: "65%" } };
  }
  
  return base; // 4-3-3
};

const pitchPositions = getPitchPositions("3-6-1");


// Resolver la posición táctica en el campo basándose estrictamente en el perfil del deportista (j.posicion)
function resolvePitchPosition(j: any): string {
  if (j && j.nombre && j.nombre.toUpperCase().includes("ANGEL")) return "LATERAL_DER";
  const posicionRaw = j?.posicion;
  if (!posicionRaw) return "DELANTERO";
  const pos = posicionRaw.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  if (pos.includes("PORT") || pos.includes("GK") || pos.includes("GUARD")) return "PORTERO";
  
  if (pos.includes("LAT") || pos.includes("CARRIL")) {
    if (pos.includes("IZQ") || pos.includes("LEFT") || pos.includes("ZURD")) return "LATERAL_IZQ";
    if (pos.includes("DER") || pos.includes("RIGHT") || pos.includes("DIESTR")) return "LATERAL_DER";
    return "__LATERAL";
  }

  if (pos.includes("CENTRAL")) {
    if (pos.includes("IZQ") || pos.includes("LEFT") || pos.includes("ZURD")) return "CENTRAL_IZQ";
    if (pos.includes("DER") || pos.includes("RIGHT") || pos.includes("DIESTR")) return "CENTRAL_DER";
    return "CENTRAL_CEN"; // En defensa de 3, el central sin lateralidad va al eje (ej: Àlex Cano)
  }

  if (pos.includes("PIV") || pos.includes("MEDIOCENTRO") || pos.includes("MEDIO CENTRO")) {
    if (pos.includes("IZQ") || pos.includes("LEFT") || pos.includes("ZURD")) return "PIVOTE_IZQ";
    if (pos.includes("DER") || pos.includes("RIGHT") || pos.includes("DIESTR")) return "PIVOTE_DER";
    return "__PIVOTE"; // Se reparte en el doble pivote base del cuadrado
  }

  if (pos.includes("INT") || pos.includes("MEDIAPUNTA") || pos.includes("MEDIA PUNTA") || pos.includes("ENGANCHE")) {
    if (pos.includes("IZQ") || pos.includes("LEFT") || pos.includes("ZURD")) return "INTERIOR_IZQ";
    if (pos.includes("DER") || pos.includes("RIGHT") || pos.includes("DIESTR")) return "INTERIOR_DER";
    return "__INTERIOR";
  }

  if (pos.includes("EXT") || pos.includes("WING") || pos.includes("BANDA")) {
    if (pos.includes("IZQ") || pos.includes("LEFT") || pos.includes("ZURD")) return "INTERIOR_IZQ";
    if (pos.includes("DER") || pos.includes("RIGHT") || pos.includes("DIESTR")) return "INTERIOR_DER";
    return "__INTERIOR";
  }

  if (pos.includes("DEL") || pos.includes("PUNTA") || pos.includes("STRIKER") || pos.includes("ATAC")) return "DELANTERO";

  const exactKey = pos.replace(/\s+/g, "_");
  if (getPitchPositions("3-6-1")[exactKey]) return exactKey;

  return "DELANTERO";
}

function isGoalkeeper(j: any): boolean {
  if (!j || !j.posicion) return false;
  const pos = j.posicion.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return pos.includes("PORT") || pos.includes("GK") || pos.includes("GUARD") || pos === "PO" || pos === "POR";
}

function getPositionCategoryName(posRaw?: string | null): string {
  if (!posRaw) return "Otros";
  const pos = posRaw.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (pos.includes("PORT") || pos.includes("GK") || pos.includes("GUARD") || pos === "PO" || pos === "POR") return "Porteros";
  if (pos.includes("CENTRAL")) return "Centrales";
  if (pos.includes("LAT") || pos.includes("CARRIL")) return "Carrileros";
  if (pos.includes("PIV") || pos.includes("MEDIO")) return "Pivotes";
  if (pos.includes("INT") || pos.includes("MEDIAPUNTA")) return "Interiores";
  if (pos.includes("EXT") || pos.includes("WING") || pos.includes("BANDA")) return "Extremos";
  if (pos.includes("DEL") || pos.includes("PUNTA") || pos.includes("STRIKER") || pos.includes("ATAC")) return "Delanteros";
  return "Otros";
}


// Helper to safely set localStorage without crashing the app on QuotaExceededError
const safeSetItem = (key: string, value: string) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch (e: any) {
    console.warn(`Aviso (espacio insuficiente en caché para ${key}):`, e.message);
  }
};

function DisponibilidadContent() {
  const clubConfig = useClubConfig();

  useEffect(() => {
    if (clubConfig?.nombreClub) setTeam(clubConfig.nombreClub);
    if (clubConfig?.temporadaActiva) setSeasons([clubConfig.temporadaActiva as any]);
  }, [clubConfig]);

  const searchParams = useSearchParams();

  const [seasons, setSeasons] = useState<Array<keyof typeof teamsBySeason>>(["2026/27"]);
  const [team, setTeam] = useState<string>("CE Europa");
  const [pitchSystem, setPitchSystem] = useState<string>("3-6-1");

  useEffect(() => {
    try {
      const savedSeasons = localStorage.getItem("active_seasons");
      if (savedSeasons) {
        const parsed = JSON.parse(savedSeasons);
        if (Array.isArray(parsed) && parsed.length > 0) setSeasons(parsed);
      }
      const savedTeam = localStorage.getItem("active_team");
      if (savedTeam) setTeam(savedTeam);
      const savedPitch = localStorage.getItem("disponibilidad_pitch_system");
      if (savedPitch) setPitchSystem(savedPitch);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        safeSetItem("active_team", team);
      } catch {}
    }
  }, [team]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        safeSetItem("active_seasons", JSON.stringify(seasons));
      } catch {}
    }
  }, [seasons]);

  useEffect(() => {
    const handleStorageSync = () => {
      const savedTeam = localStorage.getItem("active_team");
      if (savedTeam && savedTeam !== team) {
        setTeam(savedTeam);
      }
      const savedSeasons = localStorage.getItem("active_seasons");
      if (savedSeasons) {
        try {
          const parsed = JSON.parse(savedSeasons);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSeasons(parsed);
          }
        } catch {}
      }
    };
    window.addEventListener("storage", handleStorageSync);
    window.addEventListener("focus", handleStorageSync);
    return () => {
      window.removeEventListener("storage", handleStorageSync);
      window.removeEventListener("focus", handleStorageSync);
    };
  }, [team]);
  const [openGroups, setOpenGroups] = useState({ screens: true, reports: false, database: false });

  // Número de sesión (para Informe previo sesión X)
  const [sessionNumber, setSessionNumber] = useState<string>("1");

  // Control manual de disponibilidad por jugador y jugadores eliminados/ocultos del campo
  const [statusOverrides, setStatusOverrides] = useState<Record<string, "verde" | "amarillo" | "rojo" | "gris">>({});
  const [hiddenPlayers, setHiddenPlayers] = useState<string[]>([]);
  const [activePlayerMenu, setActivePlayerMenu] = useState<string | null>(null);

  // Sesiones de planificación sincronizadas desde Supabase BBDD y localStorage
  const [sesionesPlanif, setSesionesPlanif] = useState<any[]>([]);

  // Mapa de Bloques de Eventos ("dayId_slot_0", etc.)
  const [eventosBloquesMap, setEventosBloquesMap] = useState<Record<string, any>>({});

  // Override manual de MD por fecha si el usuario lo edita en Disponibilidad
  const [manualMD, setManualMD] = useState<Record<string, string>>({});

  // Tareas de sesión por fecha (ACT, T1, T2, T3, T4)
  const [sessionTasks, setSessionTasks] = useState<Record<string, { act?: string; t1?: string; t2?: string; t3?: string; t4?: string }>>({});

  // Mapa de disponibilidad proveniente de Calendario / Planificación (por jugador y fecha / sesion_dia_id)
  const [calendarioDisponibilidadMap, setCalendarioDisponibilidadMap] = useState<Record<string, string>>({});

  // Mapa de Eventos Específicos de los jugadores ("playerId_dayId")
  const [playerEventsMap, setPlayerEventsMap] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const savedOverrides = localStorage.getItem("disponibilidad_status_overrides_v1");
      if (savedOverrides) setStatusOverrides(JSON.parse(savedOverrides));
      const savedMD = localStorage.getItem("disponibilidad_manual_md_v1");
      if (savedMD) setManualMD(JSON.parse(savedMD));
      const savedTasks = localStorage.getItem("disponibilidad_session_tasks_v1");
      if (savedTasks) setSessionTasks(JSON.parse(savedTasks));
    } catch {}
  }, []);

  // Re-leer mapa de disponibilidad, sesiones_dia reales y eventos de Supabase BBDD + localStorage
  useEffect(() => {
    async function loadMap() {
      let planifData: any = null;
      try {
        planifData = await getDisponibilidadPlanificacionData();
      } catch (e) {
        console.warn("Error cargando planificación desde BBDD:", e);
      }

      const dbSesiones = planifData?.sesionesDia || [];
      const dbBloques = planifData?.eventosBloquesMap || {};
      const dbDispMap = planifData?.disponibilidadMap || {};
      const dbPlayerEvents = planifData?.playerEventsMap || {};

      if (typeof window !== "undefined") {
        try {
          pruneStaleFutureLocalStorage();
          // 1. Calendario Disponibilidad (D, P, NDR, etc.)
          const saved1 = localStorage.getItem("disponibilidad_map_v1");
          const saved2 = localStorage.getItem("planificacion_disponibilidad_map");
          const m1 = saved1 ? JSON.parse(saved1) : {};
          const m2 = saved2 ? JSON.parse(saved2) : {};
          setCalendarioDisponibilidadMap({ ...m1, ...m2, ...dbDispMap });

          // 2. Asignación de Eventos por Jugador ("Op, Co, Pa", etc.)
          const rawEvents = localStorage.getItem("player_events_map_v1");
          const mEvents = rawEvents ? JSON.parse(rawEvents) : {};
          setPlayerEventsMap({ ...mEvents, ...dbPlayerEvents });

          // 3. Días de Planificación (v5 -> v4 -> v3 -> v2 -> v1 -> BBDD)
          const rawDays =
            localStorage.getItem("planificacion_days_v5") ||
            localStorage.getItem("planificacion_days_v4") ||
            localStorage.getItem("planificacion_days_v3") ||
            localStorage.getItem("planificacion_days_v2") ||
            localStorage.getItem("planificacion_days_v1");
          if (rawDays) {
            try {
              const parsed = JSON.parse(rawDays);
              setSesionesPlanif(parsed.length > 0 ? parsed : dbSesiones);
            } catch {
              setSesionesPlanif(dbSesiones);
            }
          } else {
            setSesionesPlanif(dbSesiones);
          }

          // 4. Bloques de Eventos (v5 -> v4 -> v3 -> v2 -> v1 -> BBDD)
          const rawBloques =
            localStorage.getItem("eventos_bloques_map_v5") ||
            localStorage.getItem("eventos_bloques_map_v4") ||
            localStorage.getItem("eventos_bloques_map_v3") ||
            localStorage.getItem("eventos_bloques_map_v2") ||
            localStorage.getItem("eventos_bloques_map_v1");
          const localBloques = rawBloques ? JSON.parse(rawBloques) : {};

          // Fusionar con datos de BBDD e indexar por fecha Y por day_id
          const combinedBloques: Record<string, any> = { ...localBloques, ...dbBloques };
          Object.keys(localBloques).forEach((k) => {
            const blk = localBloques[k];
            if (blk && blk.fecha && blk.slot !== undefined) {
              combinedBloques[`${blk.fecha}_slot_${blk.slot}`] = blk;
              combinedBloques[`day_${blk.fecha}_slot_${blk.slot}`] = blk;
            }
          });
          setEventosBloquesMap(combinedBloques);
        } catch (e) {
          setCalendarioDisponibilidadMap(dbDispMap);
          setPlayerEventsMap(dbPlayerEvents);
          setSesionesPlanif(dbSesiones);
          setEventosBloquesMap(dbBloques);
        }
      } else {
        setCalendarioDisponibilidadMap(dbDispMap);
        setPlayerEventsMap(dbPlayerEvents);
        setSesionesPlanif(dbSesiones);
        setEventosBloquesMap(dbBloques);
      }
    }
    loadMap();
    window.addEventListener("focus", loadMap);
    window.addEventListener("storage", loadMap);
    window.addEventListener("eventos_bloques_updated", loadMap);
    window.addEventListener("planificacion_saved", loadMap);
    return () => {
      window.removeEventListener("focus", loadMap);
      window.removeEventListener("storage", loadMap);
      window.removeEventListener("eventos_bloques_updated", loadMap);
      window.removeEventListener("planificacion_saved", loadMap);
    };
  }, []);

  // Actualizar el estado del jugador: si se vuelve a pulsar el mismo color (ej: verde sobre verde), se quita el color (pasa a gris)
  const handleSetPlayerStatus = (playerId: string, status: "verde" | "amarillo" | "rojo" | "gris") => {
    const record = recordsMap.get(playerId);
    const calStatus =
      playerEventsMap[`${playerId}_${selectedDate}`] ||
      calendarioDisponibilidadMap[`${playerId}_${selectedDate}`] ||
      calendarioDisponibilidadMap[`${playerId}_day_${selectedDate}`];
    const current = getPlayerStatus(record, playerId, statusOverrides, calStatus, selectedDate)?.status;

    // Si ya está en ese color o se pide "gris", quitar el color y dejar en gris
    const nextStatus: "verde" | "amarillo" | "rojo" | "gris" =
      current === status || status === "gris" ? "gris" : status;

    setStatusOverrides((prev) => {
      const next = {
        ...prev,
        [playerId]: nextStatus,
        [`${playerId}_${selectedDate}`]: nextStatus,
      };
      if (typeof window !== "undefined") {
        try {
          safeSetItem("disponibilidad_status_overrides_v1", JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });

    const codeMap: Record<"verde" | "amarillo" | "rojo" | "gris", string> = {
      verde: "D",
      amarillo: "P",
      rojo: "NDL",
      gris: "",
    };
    const code = codeMap[nextStatus];

    setPlayerEventsMap((prev) => {
      const next = {
        ...prev,
        [`${playerId}_${selectedDate}`]: code,
      };
      if (typeof window !== "undefined") {
        safeSetItem("player_events_map_v1", JSON.stringify(next));
      }
      return next;
    });

    setCalendarioDisponibilidadMap((prev) => {
      const next = {
        ...prev,
        [`${playerId}_${selectedDate}`]: code,
        [`${playerId}_day_${selectedDate}`]: code,
      };
      if (typeof window !== "undefined") {
        safeSetItem("disponibilidad_map_v1", JSON.stringify(next));
      }
      return next;
    });

    // Guardar DIRECTAMENTE en BBDD Supabase
    updateEstadoDiarioJugador(playerId, selectedDate, code || null).catch((err) => {
      console.error("Error al guardar estado en BBDD Supabase:", err);
    });
  };

  // Control de etiquetas R (Regenerativo) y C (Compensa) por jugador y fecha
  const [playerTags, setPlayerTags] = useState<Record<string, { r?: boolean; c?: boolean }>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem("disponibilidad_player_tags_v1");
      if (saved) setPlayerTags(JSON.parse(saved));
    } catch (e) {}
  }, []);

  const toggleTagR = (playerId: string) => {
    const key = `${playerId}_${selectedDate}`;
    setPlayerTags((prev) => {
      const curr = prev[key] || {};
      const next = { ...prev, [key]: { ...curr, r: !curr.r } };
      if (typeof window !== "undefined") {
        safeSetItem("disponibilidad_player_tags_v1", JSON.stringify(next));
      }
      return next;
    });
  };

  const toggleTagC = (playerId: string) => {
    const key = `${playerId}_${selectedDate}`;
    setPlayerTags((prev) => {
      const curr = prev[key] || {};
      const next = { ...prev, [key]: { ...curr, c: !curr.c } };
      if (typeof window !== "undefined") {
        safeSetItem("disponibilidad_player_tags_v1", JSON.stringify(next));
      }
      return next;
    });
  };

  // Capa activa: Disponibilidad vs Historial de Lesiones
  const [activeCapa, setActiveCapa] = useState<"disponibilidad" | "lesiones">("disponibilidad");

  // Selección de Fecha
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });

  const currentSesion = useMemo(() => sesionesPlanif.find((s) => s && (s.fecha === selectedDate || s.id === selectedDate)), [sesionesPlanif, selectedDate]);

  // Comentario general y por jugador del campo táctico
  const [pitchComment, setPitchComment] = useState<string>("");
  const [pitchExtraPlayers, setPitchExtraPlayers] = useState<string[]>([]);
  const [playerComments, setPlayerComments] = useState<Record<string, string>>({});

  // Cargar comentario de sesión táctico (TEAM) y comentarios de jugadores (TEC) para la fecha seleccionada
  useEffect(() => {
    if (typeof window === "undefined" || !selectedDate) return;
    try {
      // 1. Cargar comentario de sesión táctico TEAM (comentario_fisico)
      let loadedPitch = "";
      const rawMap = localStorage.getItem("disponibilidad_pitch_comments_v1");
      const mapObj = rawMap ? JSON.parse(rawMap) : {};

      if (mapObj[selectedDate] !== undefined) {
        loadedPitch = mapObj[selectedDate];
      } else {
        const dbSesion = sesionesPlanif.find((s) => s.fecha === selectedDate || s.id === selectedDate);
        if (dbSesion && (dbSesion.comentario_microciclo || dbSesion.comentario_fisico)) {
          loadedPitch = dbSesion.comentario_microciclo || dbSesion.comentario_fisico;
          loadedPitch = dbSesion.comentario_fisico;
        } else {
          const rawCom = localStorage.getItem("comentarios_jugadores_v2");
          const rawPlanif = localStorage.getItem("planificacion_comentarios_v1");
          const allCom = [
            ...(rawCom ? JSON.parse(rawCom) : []),
            ...(rawPlanif ? JSON.parse(rawPlanif) : []),
          ];
          const teamCom = allCom.find(
            (c) =>
              c &&
              c.jugador_id === "TEAM" &&
              (c.fecha === selectedDate || c.day_id === selectedDate) &&
              c.tipo === "CON"
          );
          loadedPitch = teamCom?.texto || "";
        }
      }
      setPitchComment(loadedPitch || "");

      // 2. Cargar comentarios individuales de jugadores para la fecha seleccionada
      const loadedPlayerComments: Record<string, string> = {};
      const rawPlayerCommentsMap = localStorage.getItem("disponibilidad_player_comments_v1");
      if (rawPlayerCommentsMap) {
        const pMap = JSON.parse(rawPlayerCommentsMap);
        Object.keys(pMap).forEach((k) => {
          if (k.endsWith(`_${selectedDate}`)) {
            const jId = k.replace(`_${selectedDate}`, "");
            if (pMap[k]) loadedPlayerComments[jId] = pMap[k];
          }
        });
      }

      // Fallback/Merge desde comentarios_jugadores_v2 y planificacion_comentarios_v1 (tipo TEC)
      const rawCom = localStorage.getItem("comentarios_jugadores_v2");
      const rawPlanif = localStorage.getItem("planificacion_comentarios_v1");
      const allCom = [
        ...(rawCom ? JSON.parse(rawCom) : []),
        ...(rawPlanif ? JSON.parse(rawPlanif) : []),
      ];
      allCom.forEach((c) => {
        if (
          c &&
          c.jugador_id &&
          c.jugador_id !== "TEAM" &&
          (c.fecha === selectedDate || c.day_id === selectedDate) &&
          c.tipo === "TEC" &&
          c.texto
        ) {
          if (!loadedPlayerComments[c.jugador_id]) {
            loadedPlayerComments[c.jugador_id] = c.texto;
          }
        }
      });

      setPlayerComments(loadedPlayerComments);
    } catch (e) {
      console.warn("Aviso al cargar comentarios (caché vacía o llena):", e);
      setPitchComment("");
      setPlayerComments({});
    }
  }, [selectedDate, sesionesPlanif]);

  // Cargar tareas de la sesión (sessionTasks) desde la base de datos (comentario_tecnico)
  useEffect(() => {
    if (!sesionesPlanif || sesionesPlanif.length === 0) return;
    setSessionTasks(prev => {
      let changed = false;
      const next = { ...prev };
      sesionesPlanif.forEach(s => {
        if (!s.fecha || !s.comentario_tecnico) return;
        if (!next[s.fecha]) {
          const txt = s.comentario_tecnico;
          const acts = { act: "", t1: "", t2: "", t3: "", t4: "" };
          
          const actMatch = txt.match(/ACT:(.*?)(?=\sT1:|\sT2:|\sT3:|\sT4:|\)$)/);
          const t1Match = txt.match(/T1:(.*?)(?=\sT2:|\sT3:|\sT4:|\)$)/);
          const t2Match = txt.match(/T2:(.*?)(?=\sT3:|\sT4:|\)$)/);
          const t3Match = txt.match(/T3:(.*?)(?=\sT4:|\)$)/);
          const t4Match = txt.match(/T4:(.*?)(?=\)$)/);
          
          if (actMatch) acts.act = actMatch[1].trim();
          if (t1Match) acts.t1 = t1Match[1].trim();
          if (t2Match) acts.t2 = t2Match[1].trim();
          if (t3Match) acts.t3 = t3Match[1].trim();
          if (t4Match) acts.t4 = t4Match[1].trim();

          if (acts.act || acts.t1 || acts.t2 || acts.t3 || acts.t4) {
            next[s.fecha] = acts;
            changed = true;
          }
        }
      });
      if (changed && typeof window !== "undefined") {
        try {
          localStorage.setItem("disponibilidad_session_tasks_v1", JSON.stringify(next));
        } catch (e) {}
      }
      return changed ? next : prev;
    });
  }, [sesionesPlanif]);

  // Guardar comentario individual de jugador sincronizado como tipo TEC (técnico/táctico para el evento optimizador)
  const handlePlayerCommentChange = (jugadorId: string, val: string) => {
    setPlayerComments((prev) => ({ ...prev, [jugadorId]: val }));
    if (typeof window === "undefined" || !selectedDate) return;
    try {
      // 1. Guardar en mapa local de comentarios de disponibilidad
      const rawMap = localStorage.getItem("disponibilidad_player_comments_v1");
      const mapObj = rawMap ? JSON.parse(rawMap) : {};
      const key = `${jugadorId}_${selectedDate}`;
      if (val.trim()) {
        mapObj[key] = val;
      } else {
        delete mapObj[key];
      }
      safeSetItem("disponibilidad_player_comments_v1", JSON.stringify(mapObj));

      // 2. Guardar en comentarios_jugadores_v2 (tipo TEC para evento optimizador)
      const rawCom = localStorage.getItem("comentarios_jugadores_v2");
      let comArr: any[] = rawCom ? JSON.parse(rawCom) : [];
      comArr = comArr.filter(
        (c) =>
          !(
            c &&
            c.jugador_id === jugadorId &&
            (c.fecha === selectedDate || c.day_id === selectedDate) &&
            c.tipo === "TEC"
          )
      );
      if (val.trim()) {
        comArr.push({
          jugador_id: jugadorId,
          fecha: selectedDate,
          day_id: selectedDate,
          tipo: "TEC",
          texto: val.trim(),
        });
      }
      safeSetItem("comentarios_jugadores_v2", JSON.stringify(comArr));

      // Guardar DIRECTAMENTE en BBDD Supabase
      savePlayerCommentBBDD({
        jugadorId,
        dayId: selectedDate,
        fecha: selectedDate,
        tipo: "TEC",
        texto: val,
      }).catch((err) => {
        console.error("Error al guardar comentario en Supabase:", err);
      });

      // 3. Guardar en planificacion_comentarios_v1
      const rawPlanif = localStorage.getItem("planificacion_comentarios_v1");
      let planifArr: any[] = rawPlanif ? JSON.parse(rawPlanif) : [];
      planifArr = planifArr.filter(
        (c) =>
          !(
            c &&
            c.jugador_id === jugadorId &&
            (c.fecha === selectedDate || c.day_id === selectedDate) &&
            c.tipo === "TEC"
          )
      );
      if (val.trim()) {
        planifArr.push({
          jugador_id: jugadorId,
          fecha: selectedDate,
          day_id: selectedDate,
          tipo: "TEC",
          texto: val.trim(),
        });
      }
      safeSetItem("planificacion_comentarios_v1", JSON.stringify(planifArr));

      // 4. Guardar directo a Supabase
      updateFullBBDDRow(`${jugadorId}_${selectedDate}`, "comentario_tecnico", val.trim()).catch(e => console.warn("Supabase save player comment failed:", e));
    } catch (e) {
      console.warn("Aviso al guardar comentario de jugador (espacio insuficiente en caché):", e);
    }
  };

  // Guardar comentario de sesión táctico para la fila TEAM en la BBDD (Técnico-Táctico: TEC)
  const handlePitchCommentChange = (val: string) => {
    setPitchComment(val);
    if (typeof window === "undefined" || !selectedDate) return;
    try {
      // 1. Guardar en mapa de comentarios de disponibilidad
      const rawMap = localStorage.getItem("disponibilidad_pitch_comments_v1");
      const mapObj = rawMap ? JSON.parse(rawMap) : {};
      mapObj[selectedDate] = val;
      safeSetItem("disponibilidad_pitch_comments_v1", JSON.stringify(mapObj));

      const pitchVal = (val || "").trim();

      // 2. Guardar en comentarios_jugadores_v2 (para fila TEAM del evento optimizador, tipo CON: Condicional)
      const rawCom = localStorage.getItem("comentarios_jugadores_v2");
      let comArr: any[] = rawCom ? JSON.parse(rawCom) : [];
      comArr = comArr.filter(
        (c) =>
          !(
            c &&
            c.jugador_id === "TEAM" &&
            (c.fecha === selectedDate || c.day_id === selectedDate) &&
            c.tipo === "CON"
          )
      );
      if (pitchVal) {
        comArr.push({
          jugador_id: "TEAM",
          fecha: selectedDate,
          day_id: selectedDate,
          tipo: "CON",
          texto: pitchVal,
        });
      }
      safeSetItem("comentarios_jugadores_v2", JSON.stringify(comArr));

      // 3. Guardar en planificacion_comentarios_v1
      const rawPlanif = localStorage.getItem("planificacion_comentarios_v1");
      let planifArr: any[] = rawPlanif ? JSON.parse(rawPlanif) : [];
      planifArr = planifArr.filter(
        (c) =>
          !(
            c &&
            c.jugador_id === "TEAM" &&
            (c.fecha === selectedDate || c.day_id === selectedDate) &&
            c.tipo === "CON"
          )
      );
      if (pitchVal) {
        planifArr.push({
          jugador_id: "TEAM",
          fecha: selectedDate,
          day_id: selectedDate,
          tipo: "CON",
          texto: pitchVal,
        });
      }
      safeSetItem("planificacion_comentarios_v1", JSON.stringify(planifArr));

      // 4. Guardar directo a Supabase en la celda de TEAM (comentario_fisico)
      updateFullBBDDRow(`TEAM_${selectedDate}`, "comentario_fisico", pitchVal).catch(e => console.warn("Supabase save pitch comment failed:", e));
    } catch (e) {
      console.warn("Aviso al guardar comentario de sesión (espacio insuficiente en caché):", e);
    }
  };

  // Plegar / expandir sección de disponibilidad
  const [showAvailability, setShowAvailability] = useState<boolean>(true);

  // Control para activar o desactivar imágenes de los deportistas
  const [showPlayerPhotos, setShowPlayerPhotos] = useState<boolean>(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("disponibilidad_show_photos");
      if (saved !== null) setShowPlayerPhotos(saved === "true");
    } catch (e) {}
  }, []);

  const togglePlayerPhotos = () => {
    setShowPlayerPhotos((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        safeSetItem("disponibilidad_show_photos", String(next));
      }
      return next;
    });
  };

  // Calcular automáticamente el número acumulado de sesión optimizadora según la fecha seleccionada y eventos de Planificación
  useEffect(() => {
    function calculateSessionNum() {
      if (!selectedDate) return;
      try {
        const num = getLiveClientSessionNumber(selectedDate, {
          daysList: sesionesPlanif,
          bloquesMap: eventosBloquesMap,
        });
        setSessionNumber(String(num));
      } catch (e) {
        console.warn("Aviso (espacio insuficiente en caché):", e);
      }
    }

    calculateSessionNum();

    // Reaccionar instantáneamente si el usuario modifica los eventos en Planificación o Calendario
    const handleEventsUpdate = () => {
      calculateSessionNum();
    };

    window.addEventListener("storage", handleEventsUpdate);
    window.addEventListener("eventos_bloques_updated", handleEventsUpdate);

    return () => {
      window.removeEventListener("storage", handleEventsUpdate);
      window.removeEventListener("eventos_bloques_updated", handleEventsUpdate);
    };
  }, [selectedDate, sesionesPlanif, eventosBloquesMap]);

  // Estado de sincronización en vivo
  const [excelUrl, setExcelUrl] = useState<string>(DEFAULT_EXCEL_URL);
  const [showConfigMenu, setShowConfigMenu] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSavingBBDD, setIsSavingBBDD] = useState<boolean>(false);
  const [saveBBDDStatusMsg, setSaveBBDDStatusMsg] = useState<string | null>(null);

  const handleSaveToBBDD = async () => {
    setIsSavingBBDD(true);
    setSaveBBDDStatusMsg(null);
    const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    try {
      const promises: Promise<any>[] = [];
      jugadoresDB.forEach((j: any) => {
        const code = calendarioDisponibilidadMap[j.id + "_" + selectedDate] || calendarioDisponibilidadMap[j.id + "_day_" + selectedDate] || null;
        if (code) {
          promises.push(updateEstadoDiarioJugador(j.id, selectedDate, code));
        }
        const comment = playerComments[j.id];
        if (comment && comment.trim()) {
          promises.push(savePlayerCommentBBDD({
            jugadorId: j.id,
            dayId: selectedDate,
            fecha: selectedDate,
            tipo: "TEC",
            texto: comment.trim(),
          }));
        }
      });

      if (pitchComment && pitchComment.trim()) {
        promises.push(updateFullBBDDRow("TEAM_" + selectedDate, "comentario_microciclo", pitchComment.trim()));
      }

      await Promise.all(promises);
      setSaveBBDDStatusMsg("✓ Guardado con éxito en BBDD Supabase (" + nowStr + ")");
      setTimeout(() => setSaveBBDDStatusMsg(null), 3500);
    } catch (err: any) {
      console.error("Error al guardar en BBDD Supabase:", err);
      setSaveBBDDStatusMsg("❌ Error al guardar en BBDD: " + err.message);
      setTimeout(() => setSaveBBDDStatusMsg(null), 4500);
    } finally {
      setIsSavingBBDD(false);
    }
  };
  const [syncStatus, setSyncStatus] = useState<{ message: string; isError: boolean; lastUpdated?: string } | null>(null);
  const [liveRecords, setLiveRecords] = useState<any[]>([]);
  const [jugadoresDB, setJugadoresDB] = useState<any[]>([]);
  const [archivadosDB, setArchivadosDB] = useState<any[]>([]);
  const [extraArchivedPlayerIds, setExtraArchivedPlayerIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("disponibilidad_extra_archived_v1");
      if (saved) setExtraArchivedPlayerIds(JSON.parse(saved));
    } catch {}
  }, []);

  const availableTeams = Array.from(new Set(seasons.flatMap((seasonOption) => teamsBySeason[seasonOption])));

  const handleSeasonToggle = (nextSeason: keyof typeof teamsBySeason) => {
    const nextSeasons = seasons.includes(nextSeason)
      ? seasons.filter((seasonOption) => seasonOption !== nextSeason)
      : seasons.length < 2
        ? [...seasons, nextSeason]
        : seasons;

    if (nextSeasons.length === 0) return;
    setSeasons(nextSeasons);
    const nextAvailableTeams = Array.from(new Set(nextSeasons.flatMap((seasonOption) => teamsBySeason[seasonOption])));
    if (!nextAvailableTeams.includes(team)) setTeam(nextAvailableTeams[0]);
  };

  const toggleGroup = (group: keyof typeof openGroups) => {
    setOpenGroups((current) => ({ ...current, [group]: !current[group] }));
  };

  // Navegación de días (Día Anterior / Día Posterior)
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setSelectedDate(`${yyyy}-${mm}-${dd}`);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setSelectedDate(`${yyyy}-${mm}-${dd}`);
  };

  // Cargar deportistas activos y archivados desde la BBDD Supabase
  useEffect(() => {
    async function loadJugadores() {
      try {
        const all = await getAllJugadoresIncludingArchived();
        const activos = all.filter((j: any) => j.activo !== false);
        const archivados = all.filter((j: any) => j.activo === false);
        setJugadoresDB(activos);
        setArchivadosDB(archivados);
      } catch (e) {
        console.error("Error al cargar deportistas:", e);
      }
    }
    loadJugadores();
  }, []);

  const isPlayerOfTeam = (j: any, teamName: string) => {
    if (!j) return false;
    const eq = (j.equipo || "").trim().toLowerCase();
    const temp = (j.temporada || "").trim().toLowerCase();
    if (teamName === "AE Prat" || teamName === "2025/26") {
      return eq.includes("prat") || temp.includes("25/26") || temp.includes("2025/26");
    }
    if (j.activo === false) return false;
    if (teamName === "CE Europa" || teamName === "2026/27") {
      return eq.includes("europa") || temp.includes("26/27") || temp.includes("2026/27");
    }
    return eq === teamName.trim().toLowerCase();
  };

  const activeAndExtraPlayers = useMemo(() => {
    const extraArchivadosList = archivadosDB.filter((j) => extraArchivedPlayerIds.includes(j.id));
    const activeTeamPlayers = jugadoresDB.filter((j) => isPlayerOfTeam(j, team));
    return [...activeTeamPlayers, ...extraArchivadosList];
  }, [jugadoresDB, archivadosDB, extraArchivedPlayerIds, team]);

  // Carga automática desde Webhook
  useEffect(() => {
    async function loadWebhookResponses() {
      try {
        const res = await fetch("/api/wellness/webhook");
        const json = await res.json();
        if (json.success && json.data && json.data.length > 0) {
          setLiveRecords(json.data);
          const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          setSyncStatus({
            message: `✓ Actualizado (${json.data.length} respuestas)`,
            isError: false,
            lastUpdated: now,
          });
        }
      } catch (e) {
        // Silencioso
      }
    }
    loadWebhookResponses();
    const interval = setInterval(loadWebhookResponses, 10000);
    return () => clearInterval(interval);
  }, []);

  // Botón directo: 🔄 Actualizar Base de Datos Wellness
  const handleUpdateDatabase = async () => {
    setIsSyncing(true);
    setSyncStatus({ message: "Sincronizando...", isError: false });

    try {
      if (excelUrl && excelUrl.trim()) {
        const sheetRes = await fetchLiveWellnessSheet(excelUrl);
        const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

        if (sheetRes.success && sheetRes.data && sheetRes.data.length > 0) {
          setLiveRecords(sheetRes.data);
          setSyncStatus({
            message: `✓ Actualizado a las ${now}`,
            isError: false,
            lastUpdated: now,
          });
          setIsSyncing(false);
          return;
        }
      }

      const res = await fetch("/api/wellness/webhook");
      const json = await res.json();
      const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      if (json.success && json.data && json.data.length > 0) {
        setLiveRecords(json.data);
        setSyncStatus({
          message: `✓ Actualizado a las ${now}`,
          isError: false,
          lastUpdated: now,
        });
      } else {
        setSyncStatus({
          message: `✓ Al día (${now})`,
          isError: false,
          lastUpdated: now,
        });
      }
    } catch (err: any) {
      setSyncStatus({ message: "Error de sincronización", isError: true });
    } finally {
      setIsSyncing(false);
    }
  };

  // Cargar archivo Excel de Microsoft Forms (.xlsx / .csv) al instante
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSyncing(true);
    setSyncStatus({ message: `Cargando "${file.name}"...`, isError: false });

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data && data.length > 0) {
          setLiveRecords(data);
          const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
          setSyncStatus({
            message: `✓ ${data.length} respuestas cargadas (${now})`,
            isError: false,
            lastUpdated: now,
          });
        } else {
          setSyncStatus({ message: "Archivo vacío", isError: true });
        }
      } catch (err: any) {
        setSyncStatus({ message: "Error al leer Excel", isError: true });
      } finally {
        setIsSyncing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Mapear respuestas con jugadores de la BBDD (Columna A/B para fecha, Columna H para Comentarios)
  const recordsMap = new Map();
  liveRecords.forEach((r) => {
    if (!isRowMatchingDate(r, selectedDate)) {
      return;
    }

    const rawName = extractPlayerNameFromRow(r) || extractRecordPlayerName(r);
    if (!rawName) return;

    const match = findMatchingJugadorLib(rawName, activeAndExtraPlayers, activeAndExtraPlayers);
    if (match) {
      recordsMap.set(match.id, r);
    } else if (rawName) {
      recordsMap.set(`raw-${rawName}`, r);
    }
  });

  return (
    <main className="app-shell">
      {/* Sidebar Integrada */}
      <aside className="sidebar no-print">
        
        
        <div className="brand-header" style={{ padding: "20px 0", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <img
            src={clubConfig?.escudoUrl || "/ce-europa.png"}
            alt={clubConfig?.nombreClub || "Club"}
            style={{ width: "64px", height: "72px", objectFit: "contain" }}
            onError={(e) => { (e.target as HTMLImageElement).src = "/ce-europa.png"; }}
          />
          <div style={{ marginTop: "12px", fontSize: "14px", fontWeight: "bold", color: "#f8fafc", textAlign: "center" }}>
            {clubConfig?.nombreClub || "CE Europa"}
          </div>
        </div>
        <nav className="main-nav" aria-label="Navegación principal">
          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.screens} onClick={() => toggleGroup("screens")}><span>PANTALLAS</span><b>{openGroups.screens ? "−" : "+"}</b></button>
          {openGroups.screens && (
            <div className="nav-group-list">
              <a className="nav-link" href="/"><span>▦</span> Índice</a>
              <a className="nav-link" href="/deportistas"><span>🏃</span> Deportistas</a>
              <a className="nav-link" href="/calendario"><span>📅</span> Planificación</a>
              <a className="nav-link active" href="/disponibilidad"><span>📋</span> Disponibilidad</a>
              <a className="nav-link" href="/cargas"><span>⚡</span> Cargas</a>

              {standaloneScreens.slice(5).map(([icon, label, href]) => (
                <a className="nav-link" href={href} key={label}><span>{icon}</span> {label}</a>
              ))}
            </div>
          )}
          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.reports} onClick={() => toggleGroup("reports")}><span>INFORMES</span><b>{openGroups.reports ? "−" : "+"}</b></button>
          {openGroups.reports && <div className="nav-group-list">{reports.map((item) => <a className="nav-link" href={item.href} key={item.name}><span>▤</span> {item.name}</a>)}</div>}
          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.database} onClick={() => toggleGroup("database")}><span>BASE DE DATOS</span><b>{openGroups.database ? "−" : "+"}</b></button>
          {openGroups.database && <div className="nav-group-list">{databaseScreens.map((label) => <a className="nav-link" href={`/base-datos/${label.toLowerCase()}`} key={label}><span>▥</span> {label}</a>)}</div>}
          <button className="nav-group-toggle" type="button" aria-expanded={(openGroups as any).settings} onClick={() => toggleGroup("settings" as any)}><span>AJUSTES</span><b>{(openGroups as any).settings ? "−" : "+"}</b></button>
          {(openGroups as any).settings && <div className="nav-group-list"><a className="nav-link" href="/ajustes"><span>⚙️</span> Configuración General</a></div>}
        </nav>
        <div className="sidebar-footer" suppressHydrationWarning><div className="sync-status"><span className="online-dot" /> Datos sincronizados <small>hace 4 min</small></div><div className="profile"><div className="avatar">MN</div><div><strong>Miquel Nadal</strong><small>Staff técnico</small></div><span>···</span></div></div>
      </aside>

      {/* Contenido Principal */}
      <section className="content" style={{ position: "relative" }}>
        <header className="topbar no-print" style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "20px" }}>Disponibilidad & Campo Táctico</h1>
          </div>

          {/* Arriba a la derecha: Controles principales idénticos a Cargas Wellness */}
          <div className="header-actions no-print" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {/* Navegación por fecha */}
            <div style={{ display: "flex", alignItems: "center", background: "#ffffff", padding: "4px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", gap: "8px" }}>
              <button onClick={handlePrevDay} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#475569", padding: "2px 6px" }}>◀</button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ border: "none", outline: "none", fontSize: "13px", fontWeight: 700, color: "#1e293b", background: "transparent" }}
              />
              <button onClick={handleNextDay} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#475569", padding: "2px 6px" }}>▶</button>
            </div>

            {/* BOTÓN PRINCIPAL: 🔄 Actualizar respuestas */}
            <button
              onClick={handleUpdateDatabase}
              disabled={isSyncing}
              style={{
                background: isSyncing ? "#94a3b8" : "#15803d",
                color: "#ffffff",
                border: "none",
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "12.5px",
                fontWeight: 700,
                cursor: isSyncing ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              }}
            >
              <span>{isSyncing ? "⏳" : "🔄"}</span>
              <span>{isSyncing ? "Actualizando..." : "Actualizar respuestas"}</span>
            </button>

            {/* BOTÓN: 💾 Guardar en BBDD */}
            <button
              onClick={handleSaveToBBDD}
              disabled={isSavingBBDD}
              style={{
                background: isSavingBBDD ? "#94a3b8" : "#2563eb",
                color: "#ffffff",
                border: "none",
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "12.5px",
                fontWeight: 700,
                cursor: isSavingBBDD ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                transition: "all 0.15s ease",
              }}
            >
              <span>{isSavingBBDD ? "⏳" : "💾"}</span>
              <span>{isSavingBBDD ? "Guardando en Supabase..." : "Guardar en BBDD"}</span>
            </button>

            {saveBBDDStatusMsg && (
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 800,
                  color: saveBBDDStatusMsg.startsWith("❌") ? "#dc2626" : "#16a34a",
                  background: saveBBDDStatusMsg.startsWith("❌") ? "#fef2f2" : "#f0fdf4",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "1px solid " + (saveBBDDStatusMsg.startsWith("❌") ? "#fecaca" : "#bbf7d0"),
                }}
              >
                {saveBBDDStatusMsg}
              </span>
            )}

            
            {/* SELECTOR DE SISTEMA */}
            <select
              value={pitchSystem}
              onChange={(e) => {
                setPitchSystem(e.target.value);
                try {
                  localStorage.setItem("disponibilidad_pitch_system", e.target.value);
                } catch (err) {}
              }}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f172a",
                fontSize: "12px",
                fontWeight: 800,
                cursor: "pointer",
                outline: "none",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <option value="3-6-1">Sist: 3-6-1 (Cuadrado)</option>
              <option value="4-3-3">Sist: 4-3-3</option>
              <option value="4-4-2">Sist: 4-4-2</option>
              <option value="4-2-3-1">Sist: 4-2-3-1</option>
              <option value="5-3-2">Sist: 5-3-2</option>
            </select>

            {/* BOTÓN TOGGLE: Activar / Desactivar Imágenes */}
            <button
              type="button"
              onClick={togglePlayerPhotos}
              title={showPlayerPhotos ? "Desactivar fotos de jugadores" : "Activar fotos de jugadores"}
              style={{
                background: showPlayerPhotos ? "#eff6ff" : "#ffffff",
                color: showPlayerPhotos ? "#1d4ed8" : "#475569",
                border: `1px solid ${showPlayerPhotos ? "#bfdbfe" : "#cbd5e1"}`,
                padding: "7px 11px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                transition: "all 0.15s ease",
              }}
            >
              <span>{showPlayerPhotos ? "🖼️ Fotos: ON" : "🖼️ Fotos: OFF"}</span>
            </button>

            {/* BOTÓN SENCILLO DE TRES PUNTOS (···) */}
            <button
              type="button"
              onClick={() => setShowConfigMenu(!showConfigMenu)}
              title="Cambiar enlace de Google Sheets"
              style={{
                padding: "6px 10px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: showConfigMenu ? "#e0f2fe" : "#ffffff",
                color: showConfigMenu ? "#0284c7" : "#475569",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 900,
                lineHeight: 1,
              }}
            >
              ···
            </button>
          </div>

          {/* DESPLEGABLE POPUP AL HACER CLIC EN TRES PUNTOS (···) */}
          {showConfigMenu && (
            <div
              style={{
                position: "absolute",
                top: "46px",
                right: "16px",
                width: "320px",
                background: "#ffffff",
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                zIndex: 100,
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a", marginBottom: "8px" }}>
                🌐 Enlace de Google Sheets / Base de Datos
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  URL de la hoja:
                </label>
                <input
                  type="url"
                  value={excelUrl}
                  onChange={(e) => {
                    setExcelUrl(e.target.value);
                    if (typeof window !== "undefined") {
                      safeSetItem("disponibilidad_sheet_url", e.target.value);
                    }
                  }}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  style={{ width: "100%", padding: "6px 8px", fontSize: "11.5px", borderRadius: "6px", border: "1px solid #cbd5e1", outline: "none" }}
                />
              </div>
            </div>
          )}
        </header>

        {/* Estado de sincronización (Oculto en PDF) */}
        {syncStatus && (
          <div className="no-print" style={{ marginBottom: "12px", fontSize: "12px", color: syncStatus.isError ? "#b91c1c" : "#15803d", fontWeight: 600 }}>
            {syncStatus.message}
          </div>
        )}

        {/* BARRA DE CAPAS / SUB-PESTAÑAS (ANCHO COMPLETO DE LA PÁGINA) */}
        <div
          className="no-print"
          style={{
            display: "flex",
            width: "100%",
            background: "#e2e8f0",
            padding: "4px",
            borderRadius: "10px",
            border: "1px solid #cbd5e1",
            marginBottom: "16px",
            gap: "6px",
            boxSizing: "border-box",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveCapa("disponibilidad")}
            style={{
              flex: 1,
              padding: "9px 20px",
              borderRadius: "8px",
              border: "none",
              fontSize: "13.5px",
              fontWeight: 800,
              cursor: "pointer",
              textAlign: "center",
              whiteSpace: "nowrap",
              background: activeCapa === "disponibilidad" ? "#1e3a8a" : "transparent",
              color: activeCapa === "disponibilidad" ? "#ffffff" : "#475569",
              boxShadow: activeCapa === "disponibilidad" ? "0 2px 6px rgba(30,58,138,0.3)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            Disponibilidad
          </button>
          <button
            type="button"
            onClick={() => setActiveCapa("lesiones")}
            style={{
              flex: 1,
              padding: "9px 20px",
              borderRadius: "8px",
              border: "none",
              fontSize: "13.5px",
              fontWeight: 800,
              cursor: "pointer",
              textAlign: "center",
              whiteSpace: "nowrap",
              background: activeCapa === "lesiones" ? "#1e3a8a" : "transparent",
              color: activeCapa === "lesiones" ? "#ffffff" : "#475569",
              boxShadow: activeCapa === "lesiones" ? "0 2px 6px rgba(30,58,138,0.3)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            Historial de Lesiones
          </button>
        </div>

        {activeCapa === "lesiones" ? (
          <HistorialLesionesView
            jugadores={activeAndExtraPlayers}
            calendarioDisponibilidadMap={calendarioDisponibilidadMap}
            statusOverrides={statusOverrides}
            showPlayerPhotos={showPlayerPhotos}
            activeTeam={team}
            activeSeasons={seasons}
          />
        ) : (
          /* SECCIÓN CAMPO TÁCTICO & DISPONIBILIDAD (CONTENEDOR IMPRESO EN EL PDF) */
          <div className="disponibilidad-report-card" style={{ background: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid #e2e6e3", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
          
          {/* 1. CABECERA DEL INFORME CON ESCUDO A LA IZQUIERDA Y TÍTULO "Informe previo sesión X" */}
          {(() => {
            const dateObj = new Date(selectedDate + "T12:00:00");
            const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
            const dayName = dayNames[dateObj.getDay()];
            const dd = String(dateObj.getDate()).padStart(2, "0");
            const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
            const autoDay = `${dayName} ${dd}/${mm}`;

            const mdMap: Record<number, string> = { 0: "MD+1", 1: "MD-5", 2: "MD-4", 3: "MD-3", 4: "MD-2", 5: "MD-1", 6: "MD" };
            // currentSesion ya definido a nivel de componente
            const realMD = currentSesion?.md ? String(currentSesion.md).trim() : "";
            const autoMD = manualMD[selectedDate] !== undefined 
              ? manualMD[selectedDate] 
              : (realMD || (mdMap[dateObj.getDay()] ?? "MD"));

            // Identificar bloques de sesión o eventos del día
            const dayBlocks: any[] = [];
            for (let s = 0; s < 6; s++) {
              const b =
                eventosBloquesMap[`${selectedDate}_slot_${s}`] ||
                (currentSesion?.id ? eventosBloquesMap[`${currentSesion.id}_slot_${s}`] : null) ||
                eventosBloquesMap[`day_${selectedDate}_slot_${s}`];
              if (b && (b.tipo || b.hora || b.lugar || b.comentario || b.orientacion)) {
                dayBlocks.push(b);
              }
            }

            // Si no hay bloques en eventosBloquesMap pero currentSesion tiene eventos definidos en planificación
            if (dayBlocks.length === 0 && currentSesion) {
              for (let s = 0; s < 6; s++) {
                const ev = currentSesion[`evento_${s + 1}`] || (s === 0 ? currentSesion.evento_am || currentSesion.evento_principal : (s === 1 ? currentSesion.evento_pm : null));
                if (ev && String(ev).trim()) {
                  dayBlocks.push({
                    slot: s,
                    tipo: String(ev).trim(),
                    hora: "",
                    lugar: "",
                    comentario: s === 0 && currentSesion.rival ? `vs ${currentSesion.rival}` : "",
                  });
                }
              }
            }

            const mainEv = (currentSesion?.evento_am || currentSesion?.evento_principal || currentSesion?.evento || "").trim();
            const secondEv = (currentSesion?.evento_pm || "").trim();
            const rival = (currentSesion?.rival || "").trim();
            const isMatch = rival || currentSesion?.md === "MD" || mainEv.toLowerCase().startsWith("pa") || mainEv === "PL" || mainEv === "PV" || mainEv === "PAL" || mainEv === "PAV";

            // Función para formatear el tipo de evento: nombres completos, Campo en vez de Optimizador, Gym en vez de Coadyuvante
            const formatReportEventoTipo = (tipoRaw: string): string => {
              if (!tipoRaw) return "";
              const t = tipoRaw.trim();
              const lower = t.toLowerCase();

              if (lower === "vd" || lower === "video") return "Video";
              if (lower === "op" || lower === "optimizador" || lower === "optimizadora") return "Campo";
              if (lower === "oop") return "Campo Opcional";
              if (lower === "co" || lower === "coadyuvante") return "Gym";
              if (lower === "cop") return "Gym Opcional";
              if (lower === "e" || lower === "entrenamiento") return "Campo";
              if (lower === "red" || lower === "readaptacion" || lower === "readaptación") return "Readaptación";
              if (lower === "pa" || lower === "partido") return "Partido";
              if (lower === "pal" || lower === "pl") return "Partido Local";
              if (lower === "pav" || lower === "pv") return "Partido Visitante";
              if (lower === "paam") return "Partido Amistoso";
              if (lower === "vi" || lower === "viaje") return "Viaje";
              if (lower === "va" || lower === "valoraciones") return "Valoraciones";
              if (lower === "d" || lower === "descanso") return "Descanso";
              if (lower === "char" || lower === "charla" || lower === "ch") return "Charla";

              return t
                .replace(/optimizador[a-z]*/gi, "Campo")
                .replace(/coadyuvante/gi, "Gym");
            };

            // Ordenar eventos del día cronológicamente por hora
            const sortedDayEvents = [...dayBlocks].sort((a, b) => {
              const hA = a.hora || "99:99";
              const hB = b.hora || "99:99";
              return hA.localeCompare(hB);
            });

            // Tareas de sesión para la fecha seleccionada (ACT, T1, T2, T3, T4 - Condicional / Preparación Física: CON)
            const currentTasks = sessionTasks[selectedDate] || {};
            const updateSessionTaskField = (field: "act" | "t1" | "t2" | "t3" | "t4", val: string) => {
              const currentForDate = sessionTasks[selectedDate] || {};
              const updatedDateTasks = {
                ...currentForDate,
                [field]: val,
              };
              const next = {
                ...sessionTasks,
                [selectedDate]: updatedDateTasks,
              };
              
              setSessionTasks(next);

              if (typeof window !== "undefined") {
                try {
                  safeSetItem("disponibilidad_session_tasks_v1", JSON.stringify(next));

                  // Formatear las tareas de la sesión como un mismo comentario: (ACT:... T1:... T2:...)
                  const parts: string[] = [];
                  if (updatedDateTasks.act?.trim()) parts.push(`ACT:${updatedDateTasks.act.trim()}`);
                  if (updatedDateTasks.t1?.trim()) parts.push(`T1:${updatedDateTasks.t1.trim()}`);
                  if (updatedDateTasks.t2?.trim()) parts.push(`T2:${updatedDateTasks.t2.trim()}`);
                  if (updatedDateTasks.t3?.trim()) parts.push(`T3:${updatedDateTasks.t3.trim()}`);
                  if (updatedDateTasks.t4?.trim()) parts.push(`T4:${updatedDateTasks.t4.trim()}`);
                  const tasksStr = parts.length > 0 ? `(${parts.join(" ")})` : "";

                  // Guardar sincronizado en comentarios_jugadores_v2 (TEAM, TEC: Tecnico Tactico)
                  const rawCom = localStorage.getItem("comentarios_jugadores_v2");
                  let comArr: any[] = rawCom ? JSON.parse(rawCom) : [];
                  comArr = comArr.filter(
                    (c) =>
                      !(
                        c &&
                        c.jugador_id === "TEAM" &&
                        (c.fecha === selectedDate || c.day_id === selectedDate) &&
                        c.tipo === "TEC"
                      )
                  );
                  if (tasksStr) {
                    comArr.push({
                      jugador_id: "TEAM",
                      fecha: selectedDate,
                      day_id: selectedDate,
                      tipo: "TEC",
                      texto: tasksStr,
                    });
                  }
                  safeSetItem("comentarios_jugadores_v2", JSON.stringify(comArr));

                  // Guardar sincronizado en planificacion_comentarios_v1 (TEAM, TEC: Tecnico Tactico)
                  const rawPlanif = localStorage.getItem("planificacion_comentarios_v1");
                  let planifArr: any[] = rawPlanif ? JSON.parse(rawPlanif) : [];
                  planifArr = planifArr.filter(
                    (c) =>
                      !(
                        c &&
                        c.jugador_id === "TEAM" &&
                        (c.fecha === selectedDate || c.day_id === selectedDate) &&
                        c.tipo === "TEC"
                      )
                  );
                  if (tasksStr) {
                    planifArr.push({
                      jugador_id: "TEAM",
                      fecha: selectedDate,
                      day_id: selectedDate,
                      tipo: "TEC",
                      texto: tasksStr,
                    });
                  }
                  safeSetItem("planificacion_comentarios_v1", JSON.stringify(planifArr));
                  
                  // Guardar directo a Supabase en la celda de TEAM (comentario_tecnico)
                  updateFullBBDDRow(`TEAM_${selectedDate}`, "comentario_tecnico", tasksStr).catch(e => console.warn("Supabase save session task failed:", e));
                } catch (e) {
                  console.warn("Aviso al guardar tarea de sesión (espacio insuficiente en caché):", e);
                }
              }
            };

            const allTaskDefs = [
              { key: "act" as const, label: "ACT" },
              { key: "t1" as const, label: "T1" },
              { key: "t2" as const, label: "T2" },
              { key: "t3" as const, label: "T3" },
              { key: "t4" as const, label: "T4" },
            ];
            const filledTasks = allTaskDefs.filter(({ key }) => (currentTasks[key] || "").trim() !== "");

            return (
              <div className="disponibilidad-header-block" style={{ marginBottom: "4px", borderBottom: "2px solid #0f172a", paddingBottom: "8px" }}>
                {/* 1. FILA CABECERA: Escudo y Club arriba a la izquierda / Título en el centro / Día y MD arriba a la derecha */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginBottom: "6px" }}>
                  {/* Arriba a la izquierda: Escudo y nombre del club */}
                  <div style={{ justifySelf: "start", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", minWidth: "75px" }}>
                    <img
                      src="/ce-europa.png"
                      alt="CE Europa"
                      style={{ width: "46px", height: "54px", objectFit: "contain", background: "#ffffff", borderRadius: "6px", padding: "2px" }}
                    />
                    <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap" }}>
                      {team}
                    </span>
                  </div>

                  {/* Centro: Título Informe previo sesión X */}
                  <div style={{ justifySelf: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    <h2 style={{ fontSize: "18px", fontWeight: 900, color: "#0f172a", margin: 0, textTransform: "uppercase", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
                      Informe previo sesión
                    </h2>
                    <span className="print-only" style={{ fontSize: "18px", fontWeight: 900, color: "#1e3a8a" }}>
                      {sessionNumber || 1}
                    </span>
                    <input
                      type="text"
                      value={sessionNumber}
                      onChange={(e) => setSessionNumber(e.target.value)}
                      className="clean-header-input no-print"
                      style={{
                        fontSize: "18px",
                        fontWeight: 900,
                        color: "#1e3a8a",
                        border: "none",
                        borderBottom: "2px solid #1e3a8a",
                        background: "transparent",
                        outline: "none",
                        width: "42px",
                        textAlign: "center",
                      }}
                      title="Número de sesión (editable)"
                    />
                  </div>

                  {/* Arriba a la derecha: Botón PDF y Día + MD pegados al margen derecho */}
                  <div style={{ justifySelf: "end", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px" }}>
                    <button
                      className="no-print"
                      onClick={() => {
                        const oldTitle = document.title;
                        document.title = `Informe previo sesión ${sessionNumber || 1}`;
                        window.print();
                        setTimeout(() => {
                          document.title = oldTitle;
                        }, 1000);
                      }}
                      style={{
                        background: "#0f172a",
                        color: "#ffffff",
                        border: "none",
                        padding: "4px 12px",
                        borderRadius: "6px",
                        fontSize: "11.5px",
                        fontWeight: 800,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        marginBottom: "2px",
                      }}
                    >
                      <span>📄</span> Exportar PDF
                    </button>

                    <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.2px" }}>Día:</span>
                        <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: "#0f172a" }}>
                          {autoDay}
                        </span>
                        <input
                          type="text"
                          defaultValue={autoDay}
                          key={autoDay}
                          className="clean-header-input no-print"
                          style={{ fontSize: "11.5px", fontWeight: 800, padding: "2px 4px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", outline: "none", width: "95px", textAlign: "center" }}
                        />
                      </div>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.2px" }}>MD:</span>
                        <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: autoMD === "MD" ? "#dc2626" : "#0f172a" }}>
                          {autoMD}
                        </span>
                        <input
                          type="text"
                          value={autoMD}
                          onChange={(e) => {
                            const val = e.target.value;
                            setManualMD((prev) => {
                              const next = { ...prev, [selectedDate]: val };
                              if (typeof window !== "undefined") {
                                try {
                                  safeSetItem("disponibilidad_manual_md_v1", JSON.stringify(next));
                                } catch {}
                              }
                              return next;
                            });
                          }}
                          className="clean-header-input no-print"
                          style={{ fontSize: "11.5px", fontWeight: 800, padding: "2px 4px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", color: autoMD === "MD" ? "#dc2626" : "#0f172a", outline: "none", width: "44px", textAlign: "center" }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. FILA HORIZONTAL DE EVENTOS DEL DÍA (EN 1 SOLA FILA / AJUSTADO) */}
                <div
                  className="disponibilidad-events-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "nowrap",
                    gap: "6px",
                    marginTop: "3px",
                    marginBottom: "5px",
                    padding: "3px 6px",
                    background: "#f8fafc",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    width: "100%",
                    boxSizing: "border-box",
                    overflow: "hidden",
                  }}
                >
                  <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.02em", flexShrink: 0 }}>
                    Eventos:
                  </span>
                  {sortedDayEvents.length > 0 ? (
                    sortedDayEvents.map((b, idx) => {
                      const formattedEvento = formatReportEventoTipo(b.tipo);
                      return (
                        <div
                          key={idx}
                          className="disponibilidad-event-item"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "10.5px",
                            color: "#334155",
                            letterSpacing: "0.1px",
                            whiteSpace: "nowrap",
                            lineHeight: 1.2,
                            background: "#ffffff",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            border: "1px solid #cbd5e1",
                            flexShrink: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={b.comentario || undefined}
                        >
                          {b.hora ? (
                            <span style={{ fontWeight: 800, color: "#0f172a", flexShrink: 0 }}>
                              {b.hora.endsWith("h") ? b.hora : `${b.hora}h`}
                            </span>
                          ) : null}
                          {formattedEvento ? (
                            <span style={{ fontWeight: 700, color: "#1e3a8a", flexShrink: 0 }}>
                              {formattedEvento}
                            </span>
                          ) : null}
                          {(() => {
                            const extra = b.orientacion ? (b.comentario ? `${b.orientacion} · ${b.comentario}` : b.orientacion) : (b.comentario || "");
                            if (!extra) return null;
                            return (
                              <span style={{ fontWeight: 600, color: "#475569", overflow: "hidden", textOverflow: "ellipsis" }}>
                                · {extra}
                              </span>
                            );
                          })()}
                        </div>
                      );
                    })
                  ) : isMatch ? (
                    <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#991b1b", whiteSpace: "nowrap" }}>
                      Partido {rival ? `vs ${rival}` : ""} ({mainEv || "Pa"})
                    </span>
                  ) : mainEv === "E" || mainEv === "Op" || secondEv === "Op" || secondEv === "E" ? (
                    <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#1e40af", whiteSpace: "nowrap" }}>
                      Campo ({formatReportEventoTipo(mainEv) || "Campo"}{secondEv ? ` · ${formatReportEventoTipo(secondEv)}` : ""})
                    </span>
                  ) : mainEv === "Co" || secondEv === "Co" ? (
                    <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#854d0e", whiteSpace: "nowrap" }}>
                      Gym ({formatReportEventoTipo(mainEv) || "Gym"})
                    </span>
                  ) : mainEv === "D" || (!mainEv && !secondEv) ? (
                    <span style={{ fontSize: "10.5px", fontWeight: 600, color: "#64748b", whiteSpace: "nowrap" }}>
                      Descanso
                    </span>
                  ) : (
                    <span style={{ fontSize: "10.5px", fontWeight: 600, color: "#94a3b8" }}>
                      Sin eventos programados
                    </span>
                  )}
                </div>

                {/* 3. FILA COMENTARIO DE LA SESIÓN EN TODA LA AMPLITUD (ENTRE EVENTOS Y TAREAS) */}
                <div className="disponibilidad-session-comment-container" style={{ width: "100%", marginTop: "3px", marginBottom: "3px" }}>
                  <textarea
                    className="no-print"
                    value={pitchComment}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (val.length === 1) {
                        val = val.toUpperCase();
                      } else if (val.length > 1 && val[0] !== val[0].toUpperCase()) {
                        val = val.charAt(0).toUpperCase() + val.slice(1);
                      }
                      handlePitchCommentChange(val);
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = `${target.scrollHeight}px`;
                    }}
                    onBlur={(e) => {
                      const rawPlanif = localStorage.getItem("planificacion_comentarios_v1");
                      const planifArr: any[] = rawPlanif ? JSON.parse(rawPlanif) : [];
                      saveFullPlanificacionBBDD([], planifArr, undefined, undefined, undefined).catch(err => {
                        console.error("Error auto-guardando comentario TEAM en BBDD", err);
                      });
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="Comentario de la sesión…"
                    rows={4}
                    style={{
                      width: "100%",
                      fontSize: "12px",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      color: "#0f172a",
                      resize: "vertical",
                      outline: "none",
                      fontFamily: "inherit",
                      lineHeight: 1.4,
                      boxSizing: "border-box",
                      minHeight: "75px",
                      whiteSpace: "pre-wrap",
                    }}
                  />
                  <div
                    className="print-only disponibilidad-session-comment-text"
                    style={{
                      width: "100%",
                      fontSize: "11px",
                      color: "#0f172a",
                      fontFamily: "inherit",
                      lineHeight: 1.35,
                      whiteSpace: "pre-wrap",
                      minHeight: "45px",
                      wordBreak: "break-word",
                      padding: "2px 0",
                    }}
                  >
                    {pitchComment || "—"}
                  </div>
                </div>

                {/* 4. FILA HORIZONTAL ÚNICA DE TAREAS (ACT, T1, T2, T3, T4) */}
                <div
                  className={`disponibilidad-tasks-row ${filledTasks.length === 0 ? "has-no-tasks" : ""}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexDirection: "row",
                    flexWrap: "nowrap",
                    gap: "8px",
                    marginTop: "2px",
                    marginBottom: "4px",
                    padding: "4px 8px",
                    background: "#f8fafc",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.02em", flexShrink: 0, whiteSpace: "nowrap" }}>
                    Tareas:
                  </span>
                  <div
                    className="disponibilidad-tasks-items-grid"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                      gap: "6px",
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {allTaskDefs.map(({ key, label }) => {
                      const val = currentTasks[key] || "";
                      return (
                        <div
                          key={key}
                          className={`task-field-item ${!val ? "task-empty-item" : "task-filled-item"}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            minWidth: 0,
                          }}
                        >
                          <span style={{ fontSize: "11px", fontWeight: 900, color: "#dc2626", whiteSpace: "nowrap", flexShrink: 0 }}>
                            {label}:
                          </span>
                          <input
                            type="text"
                            value={val}
                            onChange={(e) => updateSessionTaskField(key, e.target.value)}
                            onBlur={(e) => {
                              const rawPlanif = localStorage.getItem("planificacion_comentarios_v1");
                              const planifArr: any[] = rawPlanif ? JSON.parse(rawPlanif) : [];
                              saveFullPlanificacionBBDD([], planifArr, undefined, undefined, undefined).catch(err => {
                                console.error("Error auto-guardando Tareas TEAM en BBDD", err);
                              });
                            }}
                            placeholder="..."
                            className="clean-header-input"
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              padding: "2px 5px",
                              borderRadius: "4px",
                              border: "1px solid #cbd5e1",
                              background: "#ffffff",
                              color: "#0f172a",
                              outline: "none",
                              width: "100%",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 4. RESUMEN DE DISPONIBILIDAD PROFESIONAL Y ELEGANTE */}
          {(() => {
            const activePlayersList = activeAndExtraPlayers.filter((j) => !hiddenPlayers.includes(j.id));

            let disponJugadoresCount = 0;
            let disponPorterosCount = 0;
            let alertaCount = 0;
            let noDisponCount = 0;

            const disponiblesByPos: Record<string, any[]> = {};
            const regenPlayersByPos: Record<string, any[]> = {};
            const compensaPlayersByPos: Record<string, any[]> = {};

            let regenJugadoresCount = 0;
            let regenPorterosCount = 0;
            let compensaJugadoresCount = 0;
            let compensaPorterosCount = 0;

            activePlayersList.forEach((j) => {
              const record = recordsMap.get(j.id);
              const calStatus = calendarioDisponibilidadMap[`${j.id}_${selectedDate}`] || calendarioDisponibilidadMap[`${j.id}_day_${selectedDate}`] || playerEventsMap[`${j.id}_${selectedDate}`];
              const st = getPlayerStatus(record, j.id, statusOverrides, calStatus);
              const isGk = isGoalkeeper(j);
              const posGroup = getPositionCategoryName(j.posicion);
              const tags = playerTags[`${j.id}_${selectedDate}`] || {};

              if (st.status === "verde") {
                if (isGk) disponPorterosCount++;
                else disponJugadoresCount++;

                if (!disponiblesByPos[posGroup]) disponiblesByPos[posGroup] = [];
                disponiblesByPos[posGroup].push(j);
              } else if (st.status === "amarillo") {
                alertaCount++;
              } else if (st.status === "rojo") {
                noDisponCount++;
              }

              if (tags.r) {
                if (isGk) regenPorterosCount++;
                else regenJugadoresCount++;

                if (!regenPlayersByPos[posGroup]) regenPlayersByPos[posGroup] = [];
                regenPlayersByPos[posGroup].push(j);
              }

              if (tags.c) {
                if (isGk) compensaPorterosCount++;
                else compensaJugadoresCount++;

                if (!compensaPlayersByPos[posGroup]) compensaPlayersByPos[posGroup] = [];
                compensaPlayersByPos[posGroup].push(j);
              }
            });

            const posOrder = ["Porteros", "Centrales", "Carrileros", "Pivotes", "Interiores", "Extremos", "Delanteros", "Otros"];
            const hasRegen = regenJugadoresCount + regenPorterosCount > 0;
            const hasCompensa = compensaJugadoresCount + compensaPorterosCount > 0;

            return (
              <div className="disponibilidad-summary-section" style={{ marginBottom: "16px", padding: "4px 4px 10px 4px", fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
                {/* LÍNEA DE MÉTRICAS PRINCIPALES CON ALERTA EN TEXTO AMARILLO SIN RECUADRO Y FUENTE MÁS PEQUEÑA */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", paddingBottom: "8px", borderBottom: "1.5px solid #0f172a" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "12.5px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                      DISPONIBILIDAD:
                    </span>
                    <span style={{ fontSize: "13.5px", fontWeight: 900, color: "#166534" }}>
                      {disponJugadoresCount} + {disponPorterosCount}
                    </span>
                    {alertaCount > 0 && (
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 900,
                          color: "#d97706",
                        }}
                      >
                        y {alertaCount}* en alerta
                      </span>
                    )}
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>
                      ({disponJugadoresCount} Jugadores + {disponPorterosCount} Porteros disponibles)
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "11px", fontWeight: 800 }}>
                    <span style={{ color: "#d97706" }}>
                      🟡 {alertaCount} en alerta
                    </span>
                    <span style={{ color: "#b91c1c" }}>
                      🔴 {noDisponCount} no disponibles
                    </span>
                  </div>
                </div>

                {/* DESGLOSE CONTINUO Y LIMPIO DE JUGADORES POR POSICIÓN: SOLO SI NO HAY REGEN NI COMPENSA */}
                {!hasRegen && !hasCompensa && (
                  <div style={{ marginTop: "8px", fontSize: "11px", color: "#1e293b", lineHeight: 1.6 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
                      {posOrder.map((pos) => {
                        const list = disponiblesByPos[pos];
                        if (!list || list.length === 0) return null;
                        return (
                          <div key={pos} style={{ display: "inline-flex", alignItems: "baseline", gap: "4px" }}>
                            <span style={{ fontWeight: 800, color: "#1e3a8a" }}>
                              {list.length} {pos}:
                            </span>
                            <span style={{ fontWeight: 600, color: "#334155" }}>
                              {list.map((j) => getShortPlayerName(j)).join(", ")}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* BLOQUES REGENERATIVO (R) Y COMPENSA (C) LIMPIOS CON ACENTO LATERAL */}
                {(hasRegen || hasCompensa) && (
                  <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    {hasRegen && (
                      <div style={{ borderLeft: "3.5px solid #0284c7", paddingLeft: "10px", fontSize: "11.5px", color: "#0f172a" }}>
                        <span style={{ fontWeight: 900, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                          Regenerativo R ({regenJugadoresCount} + {regenPorterosCount}):
                        </span>{" "}
                        {posOrder.map((pos) => {
                          const list = regenPlayersByPos[pos];
                          if (!list || list.length === 0) return null;
                          return (
                            <span key={`r_${pos}`} style={{ fontWeight: 600, color: "#334155", marginRight: "12px" }}>
                              <strong style={{ color: "#0284c7", fontWeight: 700 }}>{pos}:</strong> {list.map((j) => getShortPlayerName(j)).join(", ")}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {hasCompensa && (
                      <div style={{ borderLeft: "3.5px solid #ea580c", paddingLeft: "10px", fontSize: "11.5px", color: "#0f172a" }}>
                        <span style={{ fontWeight: 900, color: "#c2410c", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                          Compensa C ({compensaJugadoresCount} + {compensaPorterosCount}):
                        </span>{" "}
                        {posOrder.map((pos) => {
                          const list = compensaPlayersByPos[pos];
                          if (!list || list.length === 0) return null;
                          return (
                            <span key={`c_${pos}`} style={{ fontWeight: 600, color: "#334155", marginRight: "12px" }}>
                              <strong style={{ color: "#ea580c", fontWeight: 700 }}>{pos}:</strong> {list.map((j) => getShortPlayerName(j)).join(", ")}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* CAMPO DE FÚTBOL REALISTA CON LÍNEAS VECTORIALES SVG */}
          <div
            className="disponibilidad-pitch-container"
            style={{
              position: "relative",
              width: "100%",
              height: "640px",
              background: "repeating-linear-gradient(0deg, #15803d 0px, #15803d 45px, #166534 45px, #166534 90px)",
              borderRadius: "16px",
              border: "8px solid #0f5127",
              boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
              overflow: "hidden",
            }}
          >
            {/* LÍNEAS VECTORIALES DEL CAMPO (CÓRNERS, ÁREAS, PUNTO PENALTI, PORTERÍAS) */}
            <svg
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
              viewBox="0 0 1000 1400"
              preserveAspectRatio="none"
            >
              <rect x="50" y="50" width="900" height="1300" fill="none" stroke="#ffffff" strokeWidth="4" strokeOpacity="0.85" />
              <line x1="50" y1="700" x2="950" y2="700" stroke="#ffffff" strokeWidth="4" strokeOpacity="0.85" />
              <circle cx="500" cy="700" r="140" fill="none" stroke="#ffffff" strokeWidth="4" strokeOpacity="0.85" />
              <circle cx="500" cy="700" r="7" fill="#ffffff" fillOpacity="0.85" />

              <path d="M 50 85 A 35 35 0 0 0 85 50" fill="none" stroke="#ffffff" strokeWidth="4" strokeOpacity="0.85" />
              <path d="M 915 50 A 35 35 0 0 0 950 85" fill="none" stroke="#ffffff" strokeWidth="4" strokeOpacity="0.85" />
              <path d="M 50 1315 A 35 35 0 0 0 85 1350" fill="none" stroke="#ffffff" strokeWidth="4" strokeOpacity="0.85" />
              <path d="M 915 1350 A 35 35 0 0 0 950 1315" fill="none" stroke="#ffffff" strokeWidth="4" strokeOpacity="0.85" />

              <rect x="250" y="50" width="500" height="220" fill="none" stroke="#ffffff" strokeWidth="4" strokeOpacity="0.85" />
              <rect x="360" y="50" width="280" height="80" fill="none" stroke="#ffffff" strokeWidth="4" strokeOpacity="0.85" />
              <circle cx="500" cy="190" r="6" fill="#ffffff" fillOpacity="0.85" />
              <path d="M 400 270 A 120 120 0 0 0 600 270" fill="none" stroke="#ffffff" strokeWidth="4" strokeOpacity="0.85" />
              <rect x="410" y="18" width="180" height="32" fill="rgba(255,255,255,0.15)" stroke="#ffffff" strokeWidth="3" strokeDasharray="4 4" />

              <rect x="250" y="1130" width="500" height="220" fill="none" stroke="#ffffff" strokeWidth="4" strokeOpacity="0.85" />
              <rect x="360" y="1270" width="280" height="80" fill="none" stroke="#ffffff" strokeWidth="4" strokeOpacity="0.85" />
              <circle cx="500" cy="1210" r="6" fill="#ffffff" fillOpacity="0.85" />
              <path d="M 400 1130 A 120 120 0 0 1 600 1130" fill="none" stroke="#ffffff" strokeWidth="4" strokeOpacity="0.85" />
              <rect x="410" y="1350" width="180" height="32" fill="rgba(255,255,255,0.15)" stroke="#ffffff" strokeWidth="3" strokeDasharray="4 4" />


            </svg>

            {/* TARJETAS DE JUGADORES EN EL CAMPO TÁCTICO */}
            {(() => {
              const firstPass = activeAndExtraPlayers.map((j, idx) => {
                const resolvedKey = resolvePitchPosition(j);
                return { j, idx, resolvedKey };
              });

              const splitMap: Record<string, [string, string]> = {
                "__CENTRAL": ["CENTRAL_IZQ", "CENTRAL_DER"],
                "__INTERIOR": ["INTERIOR_IZQ", "INTERIOR_DER"],
                "__EXTREMO": ["INTERIOR_IZQ", "INTERIOR_DER"],
                "__LATERAL": ["LATERAL_IZQ", "LATERAL_DER"],
                "__PIVOTE": ["PIVOTE_IZQ", "PIVOTE_DER"],
              };

              const catIndices: Record<string, number[]> = {};
              firstPass.forEach((p, i) => {
                if (p.resolvedKey.startsWith("__")) {
                  if (!catIndices[p.resolvedKey]) catIndices[p.resolvedKey] = [];
                  catIndices[p.resolvedKey].push(i);
                }
              });

              const withPos = [...firstPass];
              Object.entries(catIndices).forEach(([cat, indices]) => {
                const [left, right] = splitMap[cat];
                const half = Math.ceil(indices.length / 2);
                indices.forEach((playerIdx, pos) => {
                  withPos[playerIdx] = { ...withPos[playerIdx], resolvedKey: pos < half ? left : right };
                });
              });

              const groups: Record<string, typeof withPos> = {};
              withPos.forEach(item => {
                if (!groups[item.resolvedKey]) groups[item.resolvedKey] = [];
                groups[item.resolvedKey].push(item);
              });

              if (groups["PORTERO"]) {
                const goalkeeperOrder = ["PULIDO", "QUIM", "BARRERA"];
                groups["PORTERO"].sort((a, b) => {
                  const nameA = (a.j.nombre || "").toUpperCase();
                  const nameB = (b.j.nombre || "").toUpperCase();
                  const idxA = goalkeeperOrder.findIndex(n => nameA.includes(n));
                  const idxB = goalkeeperOrder.findIndex(n => nameB.includes(n));
                  return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
                });
              }

              const CARD_HEIGHT = 26;

              const visiblePlayers = withPos.filter(item => !hiddenPlayers.includes(item.j.id));

              return visiblePlayers.map(({ j, idx, resolvedKey }) => {
                const record = recordsMap.get(j.id);
                const assignedEventsStr =
                  playerEventsMap[`${j.id}_${selectedDate}`] ||
                  (currentSesion?.id ? playerEventsMap[`${j.id}_${currentSesion.id}`] : "") ||
                  playerEventsMap[`${j.id}_day_${selectedDate}`] || "";

                const calStatus =
                  calendarioDisponibilidadMap[`${j.id}_${selectedDate}`] ||
                  (currentSesion?.id ? calendarioDisponibilidadMap[`${j.id}_${currentSesion.id}`] : "") ||
                  calendarioDisponibilidadMap[`${j.id}_day_${selectedDate}`] ||
                  (assignedEventsStr ? assignedEventsStr : undefined);

                const st = getPlayerStatus(record, j.id, statusOverrides, calStatus, selectedDate);
                const currentPitchPositions = getPitchPositions(typeof pitchSystem !== "undefined" ? pitchSystem : "4-3-3");
                const posCoords = currentPitchPositions[resolvedKey] || currentPitchPositions["DELANTERO"] || { top: "50%", left: "50%" };
                const group = groups[resolvedKey].filter(item => !hiddenPlayers.includes(item.j.id));
                const posInGroup = group.findIndex(item => (item.j.id || item.idx) === (j.id || idx));
                const groupSize = group.length;

                const totalHeight = groupSize * CARD_HEIGHT;
                const offsetTopPx = posInGroup * CARD_HEIGHT - totalHeight / 2 + CARD_HEIGHT / 2;
                const isMenuOpen = activePlayerMenu === j.id;

                return (
                  <div
                    key={j.id || idx}
                    className="pitch-player-card"
                    style={{
                      position: "absolute",
                      top: `calc(${posCoords.top} + ${offsetTopPx}px)`,
                      left: posCoords.left,
                      transform: "translate(-50%, -50%)",
                      background: st.bg,
                      border: `2px solid ${st.border}`,
                      color: st.color,
                      padding: "2px 7px",
                      borderRadius: "12px",
                      boxShadow: "0 3px 8px rgba(0,0,0,0.3)",
                      zIndex: isMenuOpen ? 100 : 10,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      minWidth: "75px",
                      maxWidth: "155px",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActivePlayerMenu(isMenuOpen ? null : j.id);
                    }}
                  >
                    {(() => {
                      const tags = playerTags[`${j.id}_${selectedDate}`] || {};
                      const hasR = Boolean(tags.r);
                      const hasC = Boolean(tags.c);
                      const hasAny = hasR || hasC;

                      return (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", width: "100%" }}>
                          {showPlayerPhotos && (
                            j.foto_url ? (
                              <img
                                src={j.foto_url || undefined}
                                alt=""
                                style={{
                                  width: "16px",
                                  height: "16px",
                                  borderRadius: "50%",
                                  objectFit: "cover",
                                  objectPosition: "center 15%",
                                  flexShrink: 0,
                                }}
                              />
                            ) : (
                              <span style={{
                                width: "14px",
                                height: "14px",
                                borderRadius: "50%",
                                background: st.border,
                                color: "#ffffff",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "7px",
                                fontWeight: 900,
                                flexShrink: 0,
                              }}>
                                {(j.nombre || "J").slice(0, 1).toUpperCase()}
                              </span>
                            )
                          )}
                          <span style={{ fontSize: hasAny ? "8.5px" : "9.5px", fontWeight: 800, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1 }}>
                            {getShortPlayerName(j)}
                          </span>
                          {hasR && (
                            <span style={{ fontSize: "9px", fontWeight: 900, color: "#ffffff", background: "#0f172a", padding: "0 3px", borderRadius: "3px", lineHeight: 1.1, flexShrink: 0, boxShadow: "0 1px 2px rgba(0,0,0,0.3)" }} title="Regenerativo (R)">
                              R
                            </span>
                          )}
                          {hasC && (
                            <span style={{ fontSize: "9px", fontWeight: 900, color: "#ffffff", background: "#0f172a", padding: "0 3px", borderRadius: "3px", lineHeight: 1.1, flexShrink: 0, boxShadow: "0 1px 2px rgba(0,0,0,0.3)" }} title="Compensa (C)">
                              C
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    {/* MENÚ DE ACCIONES AL PASAR O HACER CLIC EN EL JUGADOR */}
                    {isMenuOpen && (
                      <div
                        className="no-print"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: "absolute",
                          bottom: "calc(100% + 6px)",
                          left: "50%",
                          transform: "translateX(-50%)",
                          background: "#0f172a",
                          color: "#ffffff",
                          padding: "8px 10px",
                          borderRadius: "10px",
                          boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                          fontSize: "11px",
                          whiteSpace: "nowrap",
                          zIndex: 100,
                          minWidth: "150px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #334155", paddingBottom: "4px" }}>
                          <span style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8" }}>DISPONIBILIDAD</span>
                          <button
                            type="button"
                            onClick={() => setActivePlayerMenu(null)}
                            style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "12px", padding: 0 }}
                          >✕</button>
                        </div>

                        {/* Botones de cambiar estado */}
                        <div style={{ display: "flex", gap: "4px", justifyContent: "center", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            title={st.status === "verde" ? "Quitar verde (dejar sin color)" : "Disponible (Verde)"}
                            onClick={() => handleSetPlayerStatus(j.id, "verde")}
                            style={{
                              background: st.status === "verde" ? "#15803d" : "#1e293b",
                              border: `1.5px solid ${st.status === "verde" ? "#4ade80" : "#22c55e"}`,
                              color: "#fff",
                              padding: "4px 6px",
                              borderRadius: "6px",
                              fontSize: "10px",
                              fontWeight: 800,
                              cursor: "pointer",
                              flex: "1 1 45%",
                            }}
                          >
                            🟢 {st.status === "verde" ? "Verde ✓" : "Verde"}
                          </button>
                          <button
                            type="button"
                            title={st.status === "amarillo" ? "Quitar amarillo (dejar sin color)" : "Con cuidado (Amarillo)"}
                            onClick={() => handleSetPlayerStatus(j.id, "amarillo")}
                            style={{
                              background: st.status === "amarillo" ? "#b45309" : "#1e293b",
                              border: `1.5px solid ${st.status === "amarillo" ? "#fde047" : "#f59e0b"}`,
                              color: "#fff",
                              padding: "4px 6px",
                              borderRadius: "6px",
                              fontSize: "10px",
                              fontWeight: 800,
                              cursor: "pointer",
                              flex: "1 1 45%",
                            }}
                          >
                            🟡 {st.status === "amarillo" ? "Amar. ✓" : "Amar."}
                          </button>
                          <button
                            type="button"
                            title={st.status === "rojo" ? "Quitar rojo (dejar sin color)" : "No disponible (Rojo)"}
                            onClick={() => handleSetPlayerStatus(j.id, "rojo")}
                            style={{
                              background: st.status === "rojo" ? "#b91c1c" : "#1e293b",
                              border: `1.5px solid ${st.status === "rojo" ? "#fca5a5" : "#ef4444"}`,
                              color: "#fff",
                              padding: "4px 6px",
                              borderRadius: "6px",
                              fontSize: "10px",
                              fontWeight: 800,
                              cursor: "pointer",
                              flex: "1 1 45%",
                            }}
                          >
                            🔴 {st.status === "rojo" ? "Rojo ✓" : "Rojo"}
                          </button>
                          <button
                            type="button"
                            title="Dejar sin color / sin asignación"
                            onClick={() => handleSetPlayerStatus(j.id, "gris")}
                            style={{
                              background: st.status === "gris" ? "#475569" : "#1e293b",
                              border: `1.5px solid ${st.status === "gris" ? "#94a3b8" : "#64748b"}`,
                              color: "#fff",
                              padding: "4px 6px",
                              borderRadius: "6px",
                              fontSize: "10px",
                              fontWeight: 800,
                              cursor: "pointer",
                              flex: "1 1 45%",
                            }}
                          >
                            ⚪ {st.status === "gris" ? "Sin color ✓" : "Sin color"}
                          </button>
                        </div>

                        {/* Asignación R (Regenerativo) y C (Compensa) */}
                        <div style={{ borderTop: "1px solid #334155", paddingTop: "5px", marginTop: "2px" }}>
                          <div style={{ fontSize: "9px", fontWeight: 800, color: "#94a3b8", marginBottom: "4px", textTransform: "uppercase" }}>TIPO SESIÓN (LUNES / POST-PARTIDO)</div>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button
                              type="button"
                              onClick={() => toggleTagR(j.id)}
                              style={{
                                flex: 1,
                                padding: "3px 6px",
                                borderRadius: "5px",
                                border: "1px solid #38bdf8",
                                background: playerTags[`${j.id}_${selectedDate}`]?.r ? "#0284c7" : "#1e293b",
                                color: "#ffffff",
                                fontSize: "10px",
                                fontWeight: 900,
                                cursor: "pointer",
                              }}
                            >
                              {playerTags[`${j.id}_${selectedDate}`]?.r ? "✓ R (Regen)" : "+ R (Regen)"}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleTagC(j.id)}
                              style={{
                                flex: 1,
                                padding: "3px 6px",
                                borderRadius: "5px",
                                border: "1px solid #f97316",
                                background: playerTags[`${j.id}_${selectedDate}`]?.c ? "#ea580c" : "#1e293b",
                                color: "#ffffff",
                                fontSize: "10px",
                                fontWeight: 900,
                                cursor: "pointer",
                              }}
                            >
                              {playerTags[`${j.id}_${selectedDate}`]?.c ? "✓ C (Compensa)" : "+ C (Compensa)"}
                            </button>
                          </div>
                        </div>

                        {/* Botón eliminar del campo */}
                        <button
                          type="button"
                          onClick={() => {
                            setHiddenPlayers((prev) => [...prev, j.id]);
                            setActivePlayerMenu(null);
                          }}
                          style={{
                            background: "#7f1d1d",
                            color: "#fca5a5",
                            border: "1px solid #ef4444",
                            borderRadius: "6px",
                            padding: "4px 8px",
                            fontSize: "10.5px",
                            fontWeight: 800,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px",
                            marginTop: "2px",
                          }}
                        >
                          <span>🗑️</span> Ocultar del campo
                        </button>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>

          {/* BARRA DE RESTAURAR JUGADORES OCULTADOS DEL CAMPO */}
          {hiddenPlayers.length > 0 && (
            <div className="no-print" style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", background: "#fff7ed", padding: "6px 12px", borderRadius: "8px", border: "1px solid #ffedd5" }}>
              <span style={{ fontSize: "11px", color: "#c2410c", fontWeight: 700 }}>
                ⚠️ {hiddenPlayers.length} jugador(es) ocultado(s) del campo táctico.
              </span>
              <button
                type="button"
                onClick={() => setHiddenPlayers([])}
                style={{ background: "#c2410c", color: "#ffffff", border: "none", padding: "3px 9px", borderRadius: "5px", fontSize: "10.5px", fontWeight: 800, cursor: "pointer" }}
              >
                Restablecer todos
              </button>
            </div>
          )}

          {/* TABLA DE COMENTARIOS POR JUGADOR */}
          {(() => {
            const archivadosDisponibles = archivadosDB.filter((j) => !extraArchivedPlayerIds.includes(j.id));
            const filledCommentsCount = activeAndExtraPlayers.filter((j) => ((playerComments[j.id] ?? "").trim().length > 0)).length;

            return (
              <div className={`disponibilidad-comments-container ${filledCommentsCount === 0 ? "has-no-comments" : ""}`} style={{ marginTop: "10px", background: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                {/* Cabecera con selector para añadir deportista archivado (oculto en PDF) */}
                <div className="disponibilidad-comments-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#1e293b" }}>📋 Comentarios de la Sesión (Técnico / Táctico)</span>
                  <div className="no-print" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700 }}>+ Añadir archivado:</span>
                    <select
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          setExtraArchivedPlayerIds((prev) => {
                            const next = prev.includes(val) ? prev : [...prev, val];
                            if (typeof window !== "undefined") {
                              try {
                                safeSetItem("disponibilidad_extra_archived_v1", JSON.stringify(next));
                              } catch {}
                            }
                            return next;
                          });
                          // Si estaba oculto del campo, desocultarlo para que aparezca en el campo táctico
                          setHiddenPlayers((prev) => prev.filter((id) => id !== val));
                          e.target.value = "";
                        }
                      }}
                      style={{
                        fontSize: "10.5px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "5px",
                        border: "1px solid #cbd5e1",
                        color: "#0f172a",
                        background: "#ffffff",
                        cursor: "pointer",
                      }}
                    >
                      <option value="" disabled>Selecciona deportista archivado…</option>
                      {archivadosDisponibles.map((j) => (
                        <option key={j.id} value={j.id}>
                          {(j.nombre || "").toUpperCase()} {j.apodo ? `(${(j.apodo || "").toUpperCase()})` : ""} {j.posicion ? `· ${j.posicion}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Cabecera de columnas para orden y claridad visual */}
                <div
                  className="no-print"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "#0f172a",
                    color: "#ffffff",
                    fontSize: "10.5px",
                    fontWeight: 800,
                    padding: "6px 0",
                    borderBottom: "1px solid #334155",
                  }}
                >
                  <div style={{ width: "165px", flexShrink: 0, paddingLeft: "10px" }}>Deportista</div>
                  <div style={{ width: "110px", flexShrink: 0, textAlign: "center" }}>Estado / Tags</div>
                  <div style={{ flex: 1, paddingLeft: "10px" }}>Comentario Técnico / Táctico (Sesión)</div>
                  <div style={{ width: "185px", flexShrink: 0, paddingLeft: "8px" }}>Wellness del Día</div>
                </div>

                {/* Filas por jugador */}
                <div>
                  {activeAndExtraPlayers.map((j, idx) => {
                    const record = recordsMap.get(j.id);
                    const assignedEventsStr =
                      playerEventsMap[`${j.id}_${selectedDate}`] ||
                      (currentSesion?.id ? playerEventsMap[`${j.id}_${currentSesion.id}`] : "") ||
                      playerEventsMap[`${j.id}_day_${selectedDate}`] || "";

                    const calStatus =
                      calendarioDisponibilidadMap[`${j.id}_${selectedDate}`] ||
                      (currentSesion?.id ? calendarioDisponibilidadMap[`${j.id}_${currentSesion.id}`] : "") ||
                      calendarioDisponibilidadMap[`${j.id}_day_${selectedDate}`] ||
                      (assignedEventsStr ? assignedEventsStr : undefined);

                    const st = getPlayerStatus(record, j.id, statusOverrides, calStatus, selectedDate);
                    const isExtra = pitchExtraPlayers.includes(j.id);
                    const isHiddenOnPitch = hiddenPlayers.includes(j.id);

                    const wellnessComment = getWellnessCommentForPlayer(record);

                    const editedVal = (playerComments[j.id] ?? "").trim();
                    // En el PDF solo se imprimen los comentarios explícitos escritos o volcados con el botón '+ Añadir'
                    const hasExplicitComment = editedVal.length > 0;

                    return (
                      <div
                        key={j.id || idx}
                        className={`player-comment-row ${!hasExplicitComment ? "has-no-comment" : ""}`}
                        style={{
                          display: "flex",
                          alignItems: "stretch",
                          borderBottom: "1px solid #f1f5f9",
                          minHeight: "34px",
                          opacity: isHiddenOnPitch ? 0.6 : 1,
                        }}
                      >
                        {/* Columna 1: Nombre y apellido del jugador */}
                        <div className="player-comment-col-player" style={{
                          width: "165px",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          padding: "3px 8px",
                          borderRight: "1px solid #f1f5f9",
                          overflow: "hidden",
                        }}>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: showPlayerPhotos ? "2px 6px 2px 3px" : "2px 7px",
                            borderRadius: showPlayerPhotos ? "12px" : "8px",
                            background: st.bg,
                            border: `1.5px solid ${st.border}`,
                            color: st.color,
                            fontSize: "10px",
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                            maxWidth: "100%",
                            boxSizing: "border-box",
                            textTransform: "uppercase",
                          }}>
                            {showPlayerPhotos && (
                              j.foto_url ? (
                                <img
                                  src={j.foto_url || undefined}
                                  alt=""
                                  style={{
                                    width: "15px",
                                    height: "15px",
                                    borderRadius: "50%",
                                    objectFit: "cover",
                                    objectPosition: "center 15%",
                                    flexShrink: 0,
                                  }}
                                />
                              ) : (
                                <span style={{
                                  width: "14px",
                                  height: "14px",
                                  borderRadius: "50%",
                                  background: st.border,
                                  color: "#ffffff",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "7.5px",
                                  fontWeight: 900,
                                  flexShrink: 0,
                                }}>
                                  {(j.nombre || "J").slice(0, 1).toUpperCase()}
                                </span>
                              )
                            )}
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "uppercase" }}>
                              {(j.nombre || "").toUpperCase()}
                            </span>
                          </span>

                          {assignedEventsStr ? (
                            <div
                              className="no-print player-comment-events-tags"
                              style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginTop: "2px" }}
                            >
                              {assignedEventsStr.split(",").map((token: string) => {
                                const t = token.trim();
                                if (!t) return null;
                                return (
                                  <span
                                    key={t}
                                    style={{
                                      fontSize: "8.5px",
                                      fontWeight: 800,
                                      padding: "1px 4px",
                                      borderRadius: "3px",
                                      background: "#eff6ff",
                                      color: "#1e3a8a",
                                      border: "1px solid #bfdbfe",
                                      lineHeight: 1.1,
                                      whiteSpace: "nowrap",
                                    }}
                                    title={`Evento asignado en planificación: ${t}`}
                                  >
                                    {t}
                                  </span>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>

                        {/* Columna 2: Botones compactos de estado, tags R/C y visibilidad (no-print, separada) */}
                        <div
                          className="no-print"
                          style={{
                            width: "110px",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "2px",
                            padding: "3px 4px",
                            borderRight: "1px solid #f1f5f9",
                          }}
                        >
                          <button
                            type="button"
                            title={st.status === "verde" ? "Quitar Verde (dejar sin color)" : "Cambiar a Verde (Disponible D)"}
                            onClick={() => handleSetPlayerStatus(j.id, "verde")}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "10.5px", padding: 0, opacity: st.status === "verde" ? 1 : 0.6 }}
                          >🟢</button>
                          <button
                            type="button"
                            title={st.status === "amarillo" ? "Quitar Amarillo (dejar sin color)" : "Cambiar a Amarillo (Con cuidado P)"}
                            onClick={() => handleSetPlayerStatus(j.id, "amarillo")}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "10.5px", padding: 0, opacity: st.status === "amarillo" ? 1 : 0.6 }}
                          >🟡</button>
                          <button
                            type="button"
                            title={st.status === "rojo" ? "Quitar Rojo (dejar sin color)" : "Cambiar a Rojo (No disponible L)"}
                            onClick={() => handleSetPlayerStatus(j.id, "rojo")}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "10.5px", padding: 0, opacity: st.status === "rojo" ? 1 : 0.6 }}
                          >🔴</button>
                          <button
                            type="button"
                            title="Quitar color (dejar sin asignar)"
                            onClick={() => handleSetPlayerStatus(j.id, "gris")}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "10.5px", padding: 0, opacity: st.status === "gris" ? 1 : 0.4 }}
                          >⚪</button>

                          {/* Botones toggle R (Regenerativo) y C (Compensa) */}
                          {(() => {
                            const tags = playerTags[`${j.id}_${selectedDate}`] || {};
                            const hasR = Boolean(tags.r);
                            const hasC = Boolean(tags.c);

                            return (
                              <>
                                <button
                                  type="button"
                                  title="Regenerativo (R)"
                                  onClick={() => toggleTagR(j.id)}
                                  style={{
                                    padding: "0 3px",
                                    borderRadius: "3px",
                                    border: "1px solid #0f172a",
                                    background: hasR ? "#0f172a" : "#f1f5f9",
                                    color: hasR ? "#ffffff" : "#475569",
                                    fontSize: "9px",
                                    fontWeight: 900,
                                    cursor: "pointer",
                                    lineHeight: 1.1,
                                    marginLeft: "1px",
                                  }}
                                >
                                  R
                                </button>
                                <button
                                  type="button"
                                  title="Compensa (C)"
                                  onClick={() => toggleTagC(j.id)}
                                  style={{
                                    padding: "0 3px",
                                    borderRadius: "3px",
                                    border: "1px solid #0f172a",
                                    background: hasC ? "#0f172a" : "#f1f5f9",
                                    color: hasC ? "#ffffff" : "#475569",
                                    fontSize: "9px",
                                    fontWeight: 900,
                                    cursor: "pointer",
                                    lineHeight: 1.1,
                                  }}
                                >
                                  C
                                </button>
                              </>
                            );
                          })()}

                          {/* Botón ocultar/mostrar del campo táctico */}
                          <button
                            type="button"
                            title={isHiddenOnPitch ? "Mostrar en el campo" : "Ocultar del campo"}
                            onClick={() => {
                              if (isHiddenOnPitch) {
                                setHiddenPlayers(prev => prev.filter(id => id !== j.id));
                              } else {
                                setHiddenPlayers(prev => [...prev, j.id]);
                              }
                            }}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "10.5px", color: isHiddenOnPitch ? "#ef4444" : "#94a3b8", padding: "0 1px" }}
                          >
                            {isHiddenOnPitch ? "👁️‍🗨️" : "👁️"}
                          </button>

                          {isExtra && (
                            <button
                              onClick={() => setPitchExtraPlayers(prev => prev.filter(id => id !== j.id))}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "10.5px", padding: "0", lineHeight: 1, flexShrink: 0 }}
                              title="Quitar"
                            >✕</button>
                          )}

                          {extraArchivedPlayerIds.includes(j.id) && (
                            <button
                              type="button"
                              onClick={() => {
                                setExtraArchivedPlayerIds((prev) => {
                                  const next = prev.filter((id) => id !== j.id);
                                  if (typeof window !== "undefined") {
                                    try {
                                      safeSetItem("disponibilidad_extra_archived_v1", JSON.stringify(next));
                                    } catch {}
                                  }
                                  return next;
                                });
                              }}
                              style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "3px", cursor: "pointer", color: "#b91c1c", fontSize: "8.5px", fontWeight: 800, padding: "1px 3px", lineHeight: 1.1, flexShrink: 0 }}
                              title="Quitar deportista archivado de la sesión"
                            >✕</button>
                          )}
                        </div>

                        {/* Columna 3: Comentario editable de la sesión (Técnico / Táctico) - Máximo Espacio */}
                        <div className="player-comment-col-text" style={{ flex: 1, minWidth: "200px", padding: "3px 8px", display: "flex", alignItems: "center" }}>
                          <input
                            type="text"
                            className="no-print"
                            value={playerComments[j.id] ?? ""}
                            placeholder="Escribir comentario técnico/táctico de la sesión…"
                            onChange={(e) => {
                              let val = e.target.value;
                              if (val.length === 1) {
                                val = val.toUpperCase();
                              } else if (val.length > 1 && val[0] !== val[0].toUpperCase()) {
                                val = val.charAt(0).toUpperCase() + val.slice(1);
                              }
                              handlePlayerCommentChange(j.id, val);
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                            onKeyUp={(e) => e.stopPropagation()}
                            onKeyPress={(e) => e.stopPropagation()}
                            style={{
                              width: "100%",
                              fontSize: "11px",
                              color: "#0f172a",
                              background: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              borderRadius: "6px",
                              padding: "4px 8px",
                              outline: "none",
                              fontFamily: "inherit",
                              transition: "all 0.15s ease",
                            }}
                          />
                          <div className="print-only" style={{ fontSize: "9.5px", color: "#0f172a", fontWeight: 600, whiteSpace: "pre-wrap", lineHeight: 1.2 }}>
                            {editedVal}
                          </div>
                        </div>

                        {/* Columna 4: Comentario Wellness del día con botón '+ Añadir' (Oculto en PDF) */}
                        <div
                          className="no-print"
                          style={{
                            width: "185px",
                            flexShrink: 0,
                            padding: "4px 6px",
                            borderLeft: "1px solid #f1f5f9",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "4px",
                            background: wellnessComment ? "#f8fafc" : "transparent",
                          }}
                        >
                          {wellnessComment ? (
                            <>
                              <span
                                title={`Comentario Wellness de ${j.nombre}: "${wellnessComment}"`}
                                style={{
                                  fontSize: "10px",
                                  color: "#475569",
                                  fontWeight: 600,
                                  fontStyle: "italic",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  maxWidth: "115px",
                                }}
                              >
                                💬 "{wellnessComment}"
                              </span>

                              <button
                                type="button"
                                className="no-print"
                                title="Añadir este comentario de Wellness al comentario del día"
                                onClick={() => {
                                  const current = playerComments[j.id] || "";
                                  let updated = "";
                                  if (!current.trim()) {
                                    updated = wellnessComment;
                                  } else if (current.includes(wellnessComment)) {
                                    return;
                                  } else {
                                    updated = `${current} | ${wellnessComment}`;
                                  }
                                  handlePlayerCommentChange(j.id, updated);
                                }}
                                style={{
                                  background: "#0284c7",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: "4px",
                                  padding: "2px 6px",
                                  fontSize: "9.5px",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                  whiteSpace: "nowrap",
                                  flexShrink: 0,
                                  boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                                }}
                              >
                                + Añadir
                              </button>
                            </>
                          ) : (
                            <span style={{ fontSize: "9.5px", color: "#cbd5e1", fontStyle: "italic" }}>
                              — Sin Wellness
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
        )}
      </section>

      {/* ESTILOS DE IMPRESIÓN PDF BALANCEADOS Y ELEGANTES */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm 8mm 6mm 8mm;
          }
          html, body,
          html[data-device-mode="desktop"],
          html[data-device-mode="tablet"],
          html[data-device-mode="mobile"] {
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }
          html .sidebar,
          html aside.sidebar,
          html[data-device-mode="desktop"] .sidebar,
          html[data-device-mode="tablet"] .sidebar,
          html[data-device-mode="mobile"] .sidebar,
          aside.sidebar,
          .sidebar,
          .main-nav,
          .sidebar-mobile-header,
          .mobile-bottom-nav,
          .device-view-switcher,
          .no-print {
            display: none !important;
            visibility: hidden !important;
            width: 0 !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            position: absolute !important;
            left: -9999px !important;
          }
          html .app-shell,
          html[data-device-mode="desktop"] .app-shell,
          html[data-device-mode="tablet"] .app-shell,
          html[data-device-mode="mobile"] .app-shell,
          .app-shell {
            display: block !important;
            grid-template-columns: 1fr !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          html section.content,
          html .content,
          html[data-device-mode="desktop"] .content,
          html[data-device-mode="tablet"] .content,
          html[data-device-mode="mobile"] .content,
          section.content,
          .content {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
          }
          .disponibilidad-report-card {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            padding: 8px 12px !important;
            box-shadow: none !important;
            border: 1px solid #cbd5e1 !important;
            box-sizing: border-box !important;
          }
          .disponibilidad-header-block {
            margin-bottom: 4px !important;
            padding-bottom: 6px !important;
            border-bottom: 2px solid #0f172a !important;
          }
          .disponibilidad-pitch-container {
            height: 500px !important;
            box-shadow: none !important;
            filter: none !important;
            border-width: 6px !important;
            border-radius: 12px !important;
            margin-bottom: 6px !important;
          }
          .pitch-player-card {
            box-shadow: none !important;
            filter: none !important;
            padding: 2px 6px !important;
            border-radius: 10px !important;
            min-width: 65px !important;
            max-width: 145px !important;
            border-width: 1.5px !important;
          }
          .pitch-player-card span {
            font-size: 9px !important;
          }
          .header-data-input,
          .clean-header-input {
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          .disponibilidad-events-row {
            display: flex !important;
            flex-wrap: nowrap !important;
            overflow: hidden !important;
            gap: 6px !important;
            padding: 3px 6px !important;
            margin-top: 2px !important;
            margin-bottom: 4px !important;
            font-size: 9.5px !important;
            background: #f8fafc !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: 6px !important;
          }
          .disponibilidad-event-item {
            font-size: 9px !important;
            padding: 1px 5px !important;
            gap: 3px !important;
            white-space: nowrap !important;
            flex-shrink: 1 !important;
          }
          .disponibilidad-session-comment-container {
            margin-top: 2px !important;
            margin-bottom: 4px !important;
          }
          .disponibilidad-session-comment-text {
            font-size: 10.5px !important;
            line-height: 1.35 !important;
            min-height: 28px !important;
            padding: 2px 0 !important;
          }
          .disponibilidad-tasks-row {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            width: 100% !important;
            gap: 8px !important;
            margin-top: 2px !important;
            margin-bottom: 4px !important;
            padding: 3px 6px !important;
            background: #f8fafc !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: 6px !important;
          }
          .disponibilidad-tasks-row.has-no-tasks {
            display: none !important;
          }
          .disponibilidad-tasks-items-grid {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            flex: 1 !important;
            gap: 8px !important;
          }
          .task-empty-item {
            display: none !important;
          }
          .task-filled-item {
            display: inline-flex !important;
            align-items: center !important;
            flex: 1 !important;
            gap: 4px !important;
            white-space: nowrap !important;
            min-width: 0 !important;
            font-size: 9.5px !important;
          }
          .task-filled-item input {
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
            padding: 0 !important;
            font-weight: 700 !important;
            font-size: 9.5px !important;
            color: #0f172a !important;
            width: auto !important;
          }
          .disponibilidad-summary-section {
            margin-bottom: 6px !important;
            padding: 2px 2px 6px 2px !important;
          }
          .disponibilidad-comments-container {
            margin-top: 6px !important;
            border-radius: 8px !important;
            border: 1px solid #cbd5e1 !important;
            page-break-inside: auto !important;
          }
          .disponibilidad-comments-container.has-no-comments {
            display: none !important;
          }
          .disponibilidad-comments-header {
            padding: 4px 8px !important;
            font-size: 10.5px !important;
            background: #f8fafc !important;
          }
          .player-comment-row {
            min-height: 26px !important;
            padding: 2px 6px !important;
            border-bottom: 1px solid #e2e8f0 !important;
            page-break-inside: avoid !important;
          }
          .player-comment-row.has-no-comment {
            display: none !important;
          }
          .player-comment-col-player {
            width: 145px !important;
            padding: 2px 6px !important;
          }
          .player-comment-col-player span {
            font-size: 9.5px !important;
            padding: 2px 6px !important;
          }
          .player-comment-events-tags {
            display: none !important;
          }
          .player-comment-col-text {
            padding: 2px 6px !important;
          }
          .player-comment-col-text .print-only {
            font-size: 10px !important;
            line-height: 1.3 !important;
          }
          .print-only {
            display: block !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </main>
  );
}

export default function DisponibilidadPage() {
  return (
    <Suspense fallback={<div style={{ padding: "24px", color: "#ffffff" }}>Cargando disponibilidad...</div>}>
      <DisponibilidadContent />
    </Suspense>
  );
}
