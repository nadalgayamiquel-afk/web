"use client";

import React, { useState, useMemo, useEffect } from "react";
import { resolvePlanificacionMD, isMatchDaySession } from "@/app/lib/planificacionMd";
import {
  detectMicrocycleType,
  saveMicrocycleTypeOverride,
  getMicrocycleType,
  saveStoredMicrocycles,
  MICROCICLE_TYPE_CONFIG,
  MicrocycleType,
  normalizeMDColumn,
  getMicrocycleForDate,
  extractMicrocyclesFromGpsData,
  getStoredMicrocycles,
  getDeletedMicrocycleIds,
  addDeletedMicrocycleId,
  resetDeletedMicrocycles,
} from "../lib/microciclos";
import { computeCompetitiveProfiles, isMatchHalfTask, isFirstHalfTask, isSecondHalfTask, isRateOrPeak } from "../lib/competitiveProfile";
import {
  useFavoriteGpsVariables,
  calculateGpsMetricValue,
  DEFAULT_FAVORITE_GPS_VARIABLES,
  ALL_GPS_VARIABLES,
  getStoredDerivedVariables,
  GpsVariableDef,
} from "../lib/gpsVariables";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
  ReferenceLine,
  Cell,
  LabelList,
} from "recharts";

export interface CargaExternaSectionProps {
  planificacionDays?: any[];
  gpsRecords: any[];
  jugadores: any[];
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  isGpsUploading: boolean;
  handleGpsCsvUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSyncDownloadsGps: () => void;
  handleUpdateGps?: () => void;
  gpsUploadStatus: { message: string; isError: boolean } | null;
  loadDbGpsRecords?: () => Promise<void>;
  renderDisponibilidadBadge?: (player: any) => React.ReactNode;
}

export type ExternaSubTab = "velocidad" | "acwr" | "perfil_competitivo" | "ratios_semanales" | "evolutivo" | "sesiones_bbdd";

export interface CustomMicrocycleDef {
  id: string;
  nombre?: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  tipo?: Exclude<MicrocycleType, "todos">;
}

export interface WeeklyRatioTargets {
  dist?: number;
  hsr?: number;
  sprint?: number;
  accDec?: number;
  load?: number;
  [key: string]: number | undefined;
}

export const DEFAULT_TEAM_RATIO_TARGETS: WeeklyRatioTargets = {
  dist: 2.5,
  hsr: 1.8,
  sprint: 1.2,
  accDec: 2.2,
  load: 2.5,
};

export function getDefaultRatioTargetForKey(key: string): number {
  const k = key.toLowerCase();
  if (k === "distance(m)" || k.includes("distancia total")) return 2.5;
  if (k.includes("28")) return 1.0;
  if (k.includes("sprint") || k.includes("+ 24") || k.includes("+24") || k.includes("24 km/h")) return 1.2;
  if (k.includes("hsr") || k.includes("21 - 24") || k.includes("distance +21")) return 1.8;
  if (k.includes("19,8") || k.includes("19.8") || k.includes("17 - 19") || k.includes("16 - 17") || k.includes("15 - 16")) return 1.8;
  if (k.includes("acc") || k.includes("dec")) return 2.2;
  if (k.includes("load") || k.includes("stress")) return 2.5;
  if (k.includes("/ min") || k.includes("/min")) return 1.0;
  return 2.0;
}

function getTargetCompliance(actualRatio: number, targetRatio: number) {
  if (!targetRatio || targetRatio <= 0) {
    return {
      pctOfTarget: 100,
      status: "optimal",
      bg: "#ffffff",
      border: "#cbd5e1",
      color: "#0f172a",
      badgeColor: "#475569",
      label: "-",
    };
  }
  const pct = Math.round((actualRatio / targetRatio) * 100);

  if (pct >= 95 && pct <= 130) {
    return {
      pctOfTarget: pct,
      status: "optimal",
      bg: "#dcfce7",
      border: "#86efac",
      color: "#15803d",
      badgeColor: "#166534",
      label: "🟢 " + pct + "% Obj",
    };
  }
  if (pct > 130) {
    return {
      pctOfTarget: pct,
      status: "overload",
      bg: "#f3e8ff",
      border: "#d8b4fe",
      color: "#7e22ce",
      badgeColor: "#6b21a8",
      label: "⚡ " + pct + "% Obj",
    };
  }
  if (pct >= 75) {
    return {
      pctOfTarget: pct,
      status: "warning",
      bg: "#fef3c7",
      border: "#fde047",
      color: "#b45309",
      badgeColor: "#92400e",
      label: "🟡 " + pct + "% Obj",
    };
  }
  return {
    pctOfTarget: pct,
    status: "danger",
    bg: "#fee2e2",
    border: "#fca5a5",
    color: "#b91c1c",
    badgeColor: "#991b1b",
    label: "🔴 " + pct + "% Obj",
  };
}

export const DEFAULT_CUSTOM_MICROCICLOS: CustomMicrocycleDef[] = [
  {
    id: "mc-2026-10-26_2026-11-01",
    nombre: "Microciclo 26 oct al 1 nov",
    start: "2026-10-26",
    end: "2026-11-01",
    tipo: "doble_partido",
  },
  {
    id: "mc-19-25-oct",
    nombre: "Microciclo 19 al 25 Octubre",
    start: "2026-10-19",
    end: "2026-10-25",
    tipo: "media",
  },
  {
    id: "mc-14-18-oct",
    nombre: "Microciclo 14 al 18 Octubre",
    start: "2026-10-14",
    end: "2026-10-18",
  },
  {
    id: "mc-07-13-oct",
    nombre: "Microciclo 7 al 13 Octubre",
    start: "2026-10-07",
    end: "2026-10-13",
  },
  {
    id: "mc-28sep-04oct",
    nombre: "Microciclo 28 Sep al 04 Octubre",
    start: "2026-09-28",
    end: "2026-10-04",
    tipo: "sin_categorizar",
  },
];


export function getVariableDisplayName(key: string, vDef?: GpsVariableDef): { short: string; full: string } {
  const label = vDef?.label || "";
  const short = vDef?.shortLabel || "";
  const kLower = (key || "").toLowerCase();
  const lLower = label.toLowerCase();
  const sLower = short.toLowerCase();

  // 1. Distancia Total (DT) -> Siempre primera columna
  if (kLower === "distance(m)" || lLower.includes("distancia total") || sLower === "dt") {
    return { short: "DT", full: "Distancia Total (m)" };
  }

  // 2. Variables derivadas de HSR personalizadas del usuario (exactamente como en sus favoritas)
  if (lLower.includes("hsr 17") || kLower.includes("hsr 17") || kLower.includes("hsr_17")) {
    return { short: "HSR 17", full: "HSR 17 km/h (m)" };
  }
  if (lLower.includes("hsr 16") || kLower.includes("hsr 16") || kLower.includes("hsr_16")) {
    return { short: "HSR 16", full: "HSR 16 km/h (m)" };
  }
  if (lLower.includes("hsr 15") || kLower.includes("hsr 15") || kLower.includes("hsr_15")) {
    return { short: "HSR 15", full: "HSR 15 km/h (m)" };
  }
  if (lLower.includes("19,8") || lLower.includes("19.8") || kLower.includes("19,8") || kLower.includes("19.8")) {
    return { short: "Dist. 19,8", full: "Distancia 19,8 Km/h (m)" };
  }

  // 3. Métricas de Sprint a Máxima Velocidad (+28 km/h)
  if (kLower.includes("28") || lLower.includes("28")) {
    if (kLower.includes("num") || kLower.includes("count") || lLower.includes("acciones") || lLower.includes("nº") || lLower.includes("no")) {
      return { short: "Nº Sprints 28", full: "Nº Acciones Sprint (+28 km/h) (nº)" };
    }
    return { short: "Sprint 28", full: "Distancia a Máxima Velocidad (+28 km/h) (m)" };
  }

  // 4. Distancia Sprint (+24 km/h)
  if (
    kLower.includes("+ 24") ||
    kLower.includes("+24") ||
    lLower.includes("+24") ||
    lLower.includes("+ 24") ||
    kLower.includes("sprint (m)") ||
    (lLower.includes("sprint") && !lLower.includes("nº") && !lLower.includes("count"))
  ) {
    return { short: "Sprint 24", full: "Distancia Sprint (+24 km/h) (m)" };
  }

  // 4. Aceleraciones + Desaceleraciones (+3 m/s²)
  if (
    key === "Acc+Dec" ||
    lLower.includes("aceleraciones + desaceleraciones") ||
    (lLower.includes("aceleraciones") && lLower.includes("desaceleraciones"))
  ) {
    return { short: "Acc-Dec", full: "Aceleraciones + Desaceleraciones (+3 m/s²)" };
  }

  // 5. Player Load
  if (kLower.includes("player load") || lLower.includes("player load")) {
    return { short: "Player Load", full: "Player Load (au)" };
  }

  // 6. Distancia por Minuto (m/min)
  if (kLower.includes("distancia / min") || kLower.includes("distancia/min") || lLower.includes("distancia por minuto") || kLower === "m/min") {
    return { short: "m/min", full: "Distancia por Minuto (m/min)" };
  }

  // 7. Nº de Sprints (+24 km/h)
  if (kLower.includes("sprints count") || lLower.includes("nº de sprints") || lLower.includes("sprints count")) {
    return { short: "Nº Sprints", full: "Nº de Sprints (+24 km/h) (nº)" };
  }

  // 8. Nº Aceleraciones (+3 m/s²)
  if (kLower.includes("accs count") || (lLower.includes("aceleraciones") && !lLower.includes("desaceleraciones"))) {
    return { short: "Accs", full: "Nº Aceleraciones (+3 m/s²) (nº)" };
  }

  // 9. Nº Desaceleraciones (+3 m/s²)
  if (kLower.includes("decs count") || lLower.includes("desaceleraciones")) {
    return { short: "Decs", full: "Nº Desaceleraciones (+3 m/s²) (nº)" };
  }

  // 10. Velocidad Máxima (km/h)
  if (kLower.includes("max speed") || lLower.includes("velocidad máxima") || lLower.includes("velocidad maxima")) {
    return { short: "Vmax", full: "Velocidad Máxima (km/h)" };
  }

  // 11. Distancia +21 (m) / HSR estándar
  if (kLower === "distance +21 (m)" || kLower.includes("distancia (+21") || lLower.includes("distancia (+21")) {
    return { short: "HSR (+21)", full: "Distancia (+21 km/h) (m)" };
  }

  // 12. Duración
  if (kLower.includes("duration") || lLower.includes("duración") || lLower.includes("duracion")) {
    return { short: "Duración", full: "Duración Total de la Sesión (min)" };
  }

  const cleanLabel = (label || short || key || "").replace(/derived_\d+/g, "").trim();
  if (cleanLabel) {
    return { short: short || cleanLabel, full: label || cleanLabel };
  }

  return { short: key, full: key };
}

function getCompactMetricHeader(key: string, rawLabel?: string): string {
  let l = (rawLabel || "").trim();
  let k = (key || "").trim();

  // Si la clave es un id técnico (ej. derived_...), recuperar su etiqueta real
  if ((!l || l.toLowerCase().startsWith("derived_")) && k.toLowerCase().startsWith("derived_")) {
    try {
      const derivedList = getStoredDerivedVariables();
      const found = derivedList.find((d) => d.id === k);
      if (found) {
        l = found.shortLabel || found.label || "";
      }
    } catch (e) {}
  }

  const kLower = k.toLowerCase();
  const lLower = l.toLowerCase();

  // 1. Distancia Total -> DT
  if (kLower === "distance(m)" || lLower.includes("distancia total") || (kLower.includes("distance") && !kLower.includes("+") && !kLower.includes("/"))) {
    return "DT";
  }

  // Zonas de velocidad específicas
  if (kLower.includes("15 - 16") || lLower.includes("15 - 16") || lLower.includes("15-16") || lLower.includes("z1")) return "Z1 (15-16)";
  if (kLower.includes("16 - 17") || lLower.includes("16 - 17") || lLower.includes("16-17") || lLower.includes("z2")) return "Z2 (16-17)";
  if (kLower.includes("17 - 19") || lLower.includes("17 - 19") || lLower.includes("17-20") || lLower.includes("z3")) return "Z3 (17-20)";
  if (kLower.includes("19,8 - 21") || kLower.includes("19.8 - 21") || lLower.includes("19,8 - 21") || lLower.includes("19.8 - 21") || lLower.includes("z4")) return "Z4 (20-21)";
  if (kLower.includes("21 - 24") || lLower.includes("21 - 24") || lLower.includes("z5")) return "Z5 (21-24)";
  if (kLower.includes("+ 24") || kLower.includes("+24") || lLower.includes("+ 24") || lLower.includes("+24") || lLower.includes("z6")) return "Z6 (+24)";
  if (kLower.includes("+ 28") || kLower.includes("+28") || lLower.includes("+ 28") || lLower.includes("+28")) return "Max (+28)";

  // Distancia 19,8 Km/h -> HSR estándar
  if (kLower.includes("19,8") || kLower.includes("19.8") || lLower.includes("19,8") || lLower.includes("19.8")) {
    return "HSR (19.8)";
  }

  // 2. Distancia +21 / HSR Abs
  if (
    kLower === "distance +21 (m)" ||
    kLower === "hsr abs (m)" ||
    lLower.includes("distancia (+21") ||
    lLower.includes("+21") ||
    kLower === "hsr"
  ) {
    return "+21 km/h";
  }

  // 3. Aceleraciones y Desaceleraciones -> Acc-Dec
  if (
    key === "Acc+Dec" ||
    lLower.includes("aceleraciones + desaceleraciones") ||
    (lLower.includes("aceleraciones") && lLower.includes("desaceleraciones"))
  ) {
    return "Acc-Dec";
  }

  if (kLower.includes("accs count") || lLower.includes("aceleraciones")) return "Accs";
  if (kLower.includes("decs count") || lLower.includes("desaceleraciones")) return "Decs";

  // 4. Distancia / Min -> m/min
  if (kLower.includes("distancia / min") || kLower.includes("distancia/min") || lLower.includes("distancia por minuto")) {
    return "m/min";
  }

  // 5. MAX Speed -> Vmax
  if (kLower.includes("max speed") || lLower.includes("velocidad máxima") || lLower.includes("velocidad maxima")) {
    return "Vmax";
  }

  // 6. Sprints Count -> Sprints
  if (kLower.includes("sprints count") || lLower.includes("sprints") || kLower.includes("sprint (m)")) {
    return "Sprint";
  }

  if (kLower.includes("player load") || lLower.includes("player load")) {
    return "Player Load";
  }

  // NUNCA devolver texto técnico "derived_"
  if (l && !l.toLowerCase().startsWith("derived_")) {
    return l;
  }

  if (k.toLowerCase().startsWith("derived_") || k === "HSR_Personalizada") {
    try {
      const derivedList = getStoredDerivedVariables();
      const found = derivedList.find((d) => d.id === k);
      if (found && found.shortLabel) return found.shortLabel;
      if (found && found.label && !found.label.toLowerCase().startsWith("derived_")) return found.label;
    } catch (e) {}
    return "HSR Pers.";
  }

  return rawLabel || key;
}

export function isCustomHsrKey(key: string): boolean {
  if (!key) return false;
  const kLower = key.toLowerCase();
  return (
    kLower === "hsri" ||
    kLower === "hsr_personalizada" ||
    kLower.includes("hsr indiv")
  );
}

function isRecordSimulado(record: any): boolean {
  if (!record) return false;
  if (record.es_simulado === true) return true;
  if (String(record.tipo_registro || "").toUpperCase() === "SIMULADO") return true;
  if (String(record.origen_dato || "").toUpperCase() === "SIMULADO") return true;
  if (!record.metricas) return false;
  return Boolean(
    record.metricas.es_simulado ||
    String(record.metricas.tipo_registro || "").toUpperCase() === "SIMULADO" ||
    String(record.metricas.origen_dato || "").toUpperCase() === "SIMULADO" ||
    (record.metricas.colC && String(record.metricas.colC).toUpperCase().includes("SIMULA")) ||
    (record.metricas["REAL / SIMULADO"] && String(record.metricas["REAL / SIMULADO"]).toUpperCase().includes("SIMULA"))
  );
}

function normalizeMdType(rawMd?: string, tipoSesion?: string): string {
  const t = String(tipoSesion || "").trim().toUpperCase();
  const m = String(rawMd || "").trim().toUpperCase();

  if (t === "PARTIDO" || m === "MD" || m === "PARTIDO") return "MD";
  if (!m || m === "OFF" || m === "DESCANSO" || m === "LIBRE") return "OFF";

  const minusMatch = m.match(/(?:MD\s*-\s*(\d+)|-\s*(\d+)\s*MD)/i);
  if (minusMatch) {
    const num = minusMatch[1] || minusMatch[2];
    return `MD-${num}`;
  }

  const plusMatch = m.match(/(?:MD\s*\+\s*(\d+)|\+\s*(\d+)\s*MD)/i);
  if (plusMatch) {
    const num = plusMatch[1] || plusMatch[2];
    return `MD+${num}`;
  }

  if (m.includes("MD")) return m;
  return m || "ENT";
}

export const ACWR_METRIC_CONFIG: Record<
  string,
  { label: string; unit: string; color: string; short: string; desc: string }
> = {
  distancia: { label: "Distancia Total", unit: "m", color: "#0284c7", short: "Distancia", desc: "Volumen total de metros recorridos" },
  player_load: { label: "Player Load", unit: "PL", color: "#16a34a", short: "Player Load", desc: "Carga neuromuscular tridimensional del acelerómetro" },
  hsr: { label: "HSR (>18 km/h)", unit: "m", color: "#ea580c", short: "HSR", desc: "Metros a alta velocidad de carrera" },
  sprint: { label: "Sprint (>24 km/h)", unit: "m", color: "#dc2626", short: "Sprint", desc: "Metros a máxima intensidad de sprint" },
  acc_dec: { label: "Acc + Dec Totales", unit: "cnt", color: "#9333ea", short: "Acc+Dec", desc: "Suma de aceleraciones y desaceleraciones intensas" },
  accs: { label: "Aceleraciones (>3 m/s²)", unit: "cnt", color: "#2563eb", short: "Acc >3m/s²", desc: "Acciones de aceleración alta intensidad" },
  decs: { label: "Desaceleraciones (>3 m/s²)", unit: "cnt", color: "#d97706", short: "Dec >3m/s²", desc: "Acciones de frenado y deceleración excéntrica" },
  hmld: { label: "HMLD (Carga Metabólica)", unit: "m", color: "#059669", short: "HMLD", desc: "Distancia de alta potencia metabólica (>25.5 W/kg)" },
};

function getGpsMetricValue(r: any, metricKey: string): number {
  if (!r) return 0;
  const m = r.metricas || {};
  switch (metricKey) {
    case "distancia":
      return Number(m["Distance(m)"] ?? m["Distancia Total (m)"] ?? m.distancia_total ?? r.distancia_total ?? 0);
    case "player_load":
      return Number(m["Player Load"] ?? m.player_load ?? r.player_load ?? 0);
    case "hsr":
      return Number(m["HSR Abs (m)"] ?? m.hsr ?? m.distancia_z4 ?? r.distancia_z4 ?? 0);
    case "sprint":
      return Number(m["+ 24 km/h (Distancia)"] ?? m["Sprint (m)"] ?? m.sprint_m ?? (m.num_sprints ? m.num_sprints * 15 : 0));
    case "acc_dec":
      return (
        Number(m["Accs Count"] ?? m["Acc + 3 m/s2 (Num)"] ?? m.aceleraciones ?? r.aceleraciones ?? 0) +
        Number(m["Decs Count"] ?? m["Dec + 3 m/s2 (Num)"] ?? m.desaceleraciones ?? r.desaceleraciones ?? 0)
      );
    case "accs":
      return Number(m["Accs Count"] ?? m["Acc + 3 m/s2 (Num)"] ?? m.aceleraciones ?? r.aceleraciones ?? 0);
    case "decs":
      return Number(m["Decs Count"] ?? m["Dec + 3 m/s2 (Num)"] ?? m.desaceleraciones ?? r.desaceleraciones ?? 0);
    case "hmld":
      return Number(m["HMLD"] ?? m.hmld ?? 0);
    default:
      return Number(m[metricKey] ?? 0);
  }
}

function CustomAcwrTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  const currentCfg = ACWR_METRIC_CONFIG[data.metricKey] || ACWR_METRIC_CONFIG.distancia;

  let badgeBg = "#dcfce7";
  let badgeColor = "#15803d";
  let badgeLabel = "🟢 Sweet Spot (0.8 - 1.3)";
  if (data.zone === "subentrenamiento") {
    badgeBg = "#fef3c7";
    badgeColor = "#b45309";
    badgeLabel = "🟡 Subentrenamiento (< 0.8)";
  } else if (data.zone === "precaucion") {
    badgeBg = "#ffedd5";
    badgeColor = "#c2410c";
    badgeLabel = "🟠 Precaución (1.3 - 1.5)";
  } else if (data.zone === "peligro") {
    badgeBg = "#fee2e2";
    badgeColor = "#b91c1c";
    badgeLabel = "🔴 Peligro Spike (> 1.5)";
  }

  const isMatch = Boolean(data.isMatch);
  const isOff = !data.hasSession;

  return (
    <div
      style={{
        background: "#0f172a",
        color: "#f8fafc",
        padding: "12px 16px",
        borderRadius: "10px",
        fontSize: "12px",
        boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
        border: isMatch ? "1.5px solid #ef4444" : "1px solid #334155",
        minWidth: "260px",
      }}
    >
      {/* Cabecera del Tooltip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", borderBottom: "1px solid #334155", paddingBottom: "6px" }}>
        <span style={{ fontWeight: 900, color: "#f1f5f9", fontSize: "12.5px" }}>{data.fecha}</span>
        {isMatch ? (
          <span style={{ fontSize: "10px", background: "#ef4444", color: "#ffffff", padding: "2px 7px", borderRadius: "4px", fontWeight: 900, letterSpacing: "0.5px" }}>
            ⚽ MATCH DAY
          </span>
        ) : isOff ? (
          <span style={{ fontSize: "10px", background: "#475569", color: "#e2e8f0", padding: "2px 7px", borderRadius: "4px", fontWeight: 800 }}>
            🏖️ DÍA LIBRE (OFF)
          </span>
        ) : (
          <span style={{ fontSize: "10px", background: "#0284c7", color: "#ffffff", padding: "2px 7px", borderRadius: "4px", fontWeight: 800 }}>
            🏋️ {data.normMd || data.md || "ENTRENO"}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {/* Volumen del día */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#94a3b8" }}>Volumen del Día:</span>
          <strong style={{ color: isOff ? "#64748b" : "#38bdf8", fontSize: "13.5px" }}>
            {Number(data.volumen).toLocaleString()} {currentCfg.unit}
          </strong>
        </div>

        {/* Comparativa por tipo MD */}
        {data.hasSession && data.normMd !== "OFF" && (
          <div style={{ marginTop: "4px", background: "#1e293b", padding: "6px 8px", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "3px" }}>
            <span style={{ color: "#38bdf8", fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase" }}>
              📊 Comparativa Tipo {data.normMd}:
            </span>
            
            {/* vs Anterior del mismo MD */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#94a3b8", fontSize: "11px" }}>vs Ant. {data.normMd}:</span>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <strong style={{
                  fontSize: "12px",
                  color: data.diffVsPrevSameMd === null ? "#94a3b8" :
                         data.diffVsPrevSameMd > 30 ? "#f87171" :
                         data.diffVsPrevSameMd > 0 ? "#4ade80" : "#60a5fa"
                }}>
                  {data.labelVsPrevSameMd}
                </strong>
                {data.prevSameMdDate && (
                  <span style={{ fontSize: "9.5px", color: "#64748b" }}>
                    ({data.prevSameMdDate.split("-").slice(1).join("/")})
                  </span>
                )}
              </div>
            </div>

            {/* vs 5 Últimos del mismo MD */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#94a3b8", fontSize: "11px" }}>vs 5 Últimos {data.normMd}:</span>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <strong style={{
                  fontSize: "12px",
                  color: data.diffVsLast5SameMd === null ? "#94a3b8" :
                         data.diffVsLast5SameMd > 30 ? "#f87171" :
                         data.diffVsLast5SameMd > 0 ? "#facc15" : "#cbd5e1"
                }}>
                  {data.labelVsLast5SameMd}
                </strong>
                {data.last5Avg !== null && (
                  <span style={{ fontSize: "9.5px", color: "#64748b" }}>
                    (μ: {Number(data.last5Avg).toLocaleString()})
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Carga Aguda y Crónica */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#94a3b8" }}>Carga Aguda (7d):</span>
          <strong style={{ color: "#ffffff" }}>
            {Number(data.aguda7d).toLocaleString()} {currentCfg.unit}
          </strong>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#94a3b8" }}>Crónica Semanal (28d):</span>
          <strong style={{ color: "#cbd5e1" }}>
            {Number(data.cronicaSemanal).toLocaleString()} {currentCfg.unit}
          </strong>
        </div>

        {/* Ratio ACWR */}
        <div style={{ marginTop: "4px", paddingTop: "5px", borderTop: "1px dashed #334155", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#94a3b8", fontWeight: 700 }}>Ratio ACWR:</span>
          <strong style={{ color: "#facc15", fontSize: "15px" }}>{Number(data.acwr).toFixed(2)}</strong>
        </div>

        {/* Badge Zona de Riesgo */}
        <div style={{ marginTop: "3px", padding: "3px 6px", borderRadius: "4px", background: badgeBg, color: badgeColor, fontSize: "10.5px", fontWeight: 800, textAlign: "center" }}>
          {badgeLabel}
        </div>

        {data.jugadoresCount !== undefined && data.hasSession && (
          <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px", textAlign: "right" }}>
            👥 {data.jugadoresCount} jugadores activos
          </div>
        )}
      </div>
    </div>
  );
}

const CustomXAxisTick = ({ x, y, payload }: any) => {
  const parts = String(payload.value || "").split("\n");
  const dateStr = parts[0] || "";
  const mdStr = parts[1] || "";
  const prevMdStr = parts[2] || "—";
  const last5Str = parts[3] || "—";
  const isMatch = mdStr.toUpperCase() === "MD";
  const isOff = mdStr.toUpperCase() === "OFF";

  return (
    <g transform={`translate(${x},${y})`}>
      {/* Línea 1: Fecha (DD/MM) */}
      <text x={0} y={0} dy={12} textAnchor="middle" fill="#334155" fontSize={11} fontWeight={800}>
        {dateStr}
      </text>

      {/* Línea 2: Tipo de MD */}
      <text
        x={0}
        y={0}
        dy={25}
        textAnchor="middle"
        fill={isMatch ? "#dc2626" : isOff ? "#94a3b8" : "#0284c7"}
        fontSize={10.5}
        fontWeight={900}
      >
        {isMatch ? "⚽ MD" : mdStr}
      </text>

      {/* Línea 3: % vs Anterior mismo tipo MD */}
      {!isOff && prevMdStr !== "—" ? (
        <text
          x={0}
          y={0}
          dy={38}
          textAnchor="middle"
          fill={prevMdStr === "1º (Base)" ? "#64748b" : prevMdStr.startsWith("+") ? "#15803d" : "#2563eb"}
          fontSize={9.5}
          fontWeight={800}
        >
          {prevMdStr}
        </text>
      ) : null}

      {/* Línea 4: % vs 5 últimos mismo tipo MD */}
      {!isOff && last5Str !== "—" && last5Str !== "1º (Base)" ? (
        <text
          x={0}
          y={0}
          dy={50}
          textAnchor="middle"
          fill={last5Str.startsWith("+") ? "#b45309" : "#475569"}
          fontSize={9}
          fontWeight={700}
        >
          5u: {last5Str}
        </text>
      ) : null}
    </g>
  );
};


// ── COMPONENTE DE EJE X CON FECHA Y MATCH DAY (MD) ──
const CustomEvolutivoXAxisTick = ({ x, y, payload }: any) => {
  if (!payload || !payload.value) return null;
  const str = String(payload.value);
  const parts = str.split("\n");
  const dateStr = parts[0] || "";
  const mdStr = parts[1] || "";

  const isMatch = mdStr.toUpperCase() === "MD";
  const isOff = mdStr.toUpperCase() === "OFF";
  const isPlus = mdStr.includes("+");

  let mdColor = "#0284c7"; // Azul estándar para MD-X
  if (isMatch) mdColor = "#dc2626"; // Rojo partido
  else if (isOff) mdColor = "#94a3b8"; // Gris descanso
  else if (isPlus) mdColor = "#16a34a"; // Verde recuperación MD+X

  return (
    <g transform={`translate(${x},${y})`}>
      {/* Línea 1: Fecha (DD/MM) */}
      <text
        x={0}
        y={0}
        dy={11}
        textAnchor="middle"
        fill="#334155"
        fontSize={11}
        fontWeight={700}
      >
        {dateStr}
      </text>

      {/* Línea 2: Tipo de MD (MD-4, MD-3, ⚽ MD, etc.) */}
      {mdStr ? (
        <text
          x={0}
          y={0}
          dy={24}
          textAnchor="middle"
          fill={mdColor}
          fontSize={10.5}
          fontWeight={900}
        >
          {isMatch ? "⚽ MD" : mdStr}
        </text>
      ) : null}
    </g>
  );
};

export default function CargaExternaSection({
  planificacionDays,
  gpsRecords,
  jugadores,
  selectedDate,
  setSelectedDate,
  isGpsUploading,
  handleGpsCsvUpload,
  handleSyncDownloadsGps,
  handleUpdateGps,
  gpsUploadStatus,
  renderDisponibilidadBadge,
}: CargaExternaSectionProps) {
  // ── SUB-PESTAÑA ACTIVA ──
  const [subTab, setSubTab] = useState<ExternaSubTab>("velocidad");
  const [ratiosInnerTab, setRatiosInnerTab] = useState<"ratios" | "perfil_competitivo">("ratios");

  // ── 1. ESTADOS PARA MONITOR DE VELOCIDAD & VMAX ──
  const [vmaxThresholdPct, setVmaxThresholdPct] = useState<number>(90); // 90%, 85%, 95%, 100%
  const [vmaxSortBy, setVmaxSortBy] = useState<"dias_desc" | "vmax_desc" | "nombre">("dias_desc");
  const [vmaxFilterPos, setVmaxFilterPos] = useState<string>("TODOS");
  const [vmaxSearch, setVmaxSearch] = useState<string>("");


  // ── ESTADOS PARA MONITOR ACWR & GRÁFICO DE VOLUMEN DÍA A DÍA ──
  const [acwrViewMode, setAcwrViewMode] = useState<"equipo" | "individual">("equipo");
  const [acwrSelectedPlayerId, setAcwrSelectedPlayerId] = useState<string>("");
  const [acwrVolumeMetric, setAcwrVolumeMetric] = useState<string>("distancia");
  const [acwrTimeRange, setAcwrTimeRange] = useState<number>(28); // 14, 28, 60, 0
  const [acwrShowTable, setAcwrShowTable] = useState<boolean>(false);
  const [acwrMetric, setAcwrMetric] = useState<"player_load" | "distancia" | "hsr" | "sprint" | "acc_dec">("distancia");
  const [acwrFilterPos, setAcwrFilterPos] = useState<string>("TODOS");
  const [acwrSortBy, setAcwrSortBy] = useState<"riesgo_first" | "acwr_desc" | "acwr_asc" | "nombre">("riesgo_first");
  const [acwrSearch, setAcwrSearch] = useState<string>("");

  // ── ESTADOS PARA TABLAS PLEGABLES INDIVIDUALES POR JUGADOR ──
  const [expandedPlayerIds, setExpandedPlayerIds] = useState<Record<string, boolean>>({});
  const [playerTableFilterDays, setPlayerTableFilterDays] = useState<"all" | "active">("all");
  const [playerTableOrder, setPlayerTableOrder] = useState<"desc" | "asc">("asc");
  const [openTablePrevMd, setOpenTablePrevMd] = useState<boolean>(true);
  const [openTableLast5Md, setOpenTableLast5Md] = useState<boolean>(true);

  // ── 2. ESTADOS PARA PERFIL COMPETITIVO (CON VARIABLES FAVORITAS DISCRETAS) ──
  const { favoriteKeys, favoriteVariables, derivedVariables, allVariables } = useFavoriteGpsVariables();

  const getGpsVariableDef = (key: string): GpsVariableDef | undefined => {
    if (!key) return undefined;
    const fromAll = allVariables.find((v) => v.key === key);
    if (fromAll) return fromAll;
    const fromDerived = derivedVariables.find((d) => d.id === key);
    if (fromDerived) {
      return {
        key: fromDerived.id,
        label: fromDerived.label,
        shortLabel: fromDerived.shortLabel || fromDerived.label,
        unit: fromDerived.unit,
        categoria: "Variables Derivadas",
        esDerivada: true,
        operacion: fromDerived.operacion,
      };
    }
    const fromFav = favoriteVariables.find((v) => v.key === key);
    if (fromFav) return fromFav;
    return ALL_GPS_VARIABLES.find((v) => v.key === key);
  };
  const [profileSearch, setProfileSearch] = useState<string>("");
  const [profileFilterPos, setProfileFilterPos] = useState<string>("TODOS");
  const [profileFilterCategory, setProfileFilterCategory] = useState<string>("TODOS");
  const [showColumnPicker, setShowColumnPicker] = useState<boolean>(false);
  const [customOverrides, setCustomOverrides] = useState<Record<string, any>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_competitive_profile_overrides");
        if (stored) return JSON.parse(stored);
      } catch (e) {}
    }
    return {};
  });

  // Lista de métricas favoritas activas (excluyendo Duration(min))
  const availableFavVariables = useMemo(() => {
    const list = favoriteVariables.filter((v) => v.key !== "Duration(min)");
    if (list.length > 0) return list;
    return ALL_GPS_VARIABLES.filter((v) => DEFAULT_FAVORITE_GPS_VARIABLES.includes(v.key) && v.key !== "Duration(min)");
  }, [favoriteVariables]);

  const [selectedProfileKeys, setSelectedProfileKeys] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_profile_selected_fav_keys");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    // 4-5 variables favoritas estándar y discretas
    return ["Distance(m)", "Distancia / Min", "Distance +21 (m)", "Acc+Dec", "Player Load"];
  });

  const handleToggleColumn = (key: string) => {
    setSelectedProfileKeys((prev) => {
      let next: string[];
      if (prev.includes(key)) {
        if (prev.length <= 1) return prev; // Mantener al menos 1 columna
        next = prev.filter((k) => k !== key);
      } else {
        next = [...prev, key];
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("gps_profile_selected_fav_keys", JSON.stringify(next));
      }
      return next;
    });
  };

  const handleSetPresetColumns = (keys: string[]) => {
    setSelectedProfileKeys(keys);
    if (typeof window !== "undefined") {
      localStorage.setItem("gps_profile_selected_fav_keys", JSON.stringify(keys));
    }
  };

  const [showHsriColumn, setShowHsriColumn] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_profile_show_hsri");
        if (stored !== null) return stored === "true";
      } catch {}
    }
    return false; // Por defecto desactivado (OFF)
  });

  const displayedProfileKeys = useMemo(() => {
    // Variables estándar seleccionadas por el usuario (la HSR normal 19,8 es una variable fija como las demás)
    const cleanKeys = selectedProfileKeys.filter(
      (k) => k !== "HSR_Personalizada" && k !== "derived_undefined" && k !== "derived_1791992159697" && !isCustomHsrKey(k)
    );

    // Ordenar para que DT esté siempre primero
    return [...cleanKeys].sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const aIsDT = a === "Distance(m)" || aLower.includes("distancia total") || aLower === "dt";
      const bIsDT = b === "Distance(m)" || bLower.includes("distancia total") || bLower === "dt";
      if (aIsDT) return -1;
      if (bIsDT) return 1;
      return 0;
    });
  }, [selectedProfileKeys]);

  const [showHeatmapColors, setShowHeatmapColors] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_profile_show_heatmap");
        if (stored !== null) return stored === "true";
      } catch {}
    }
    return true; // Por defecto activo para ver visualmente la demanda
  });

  const [columnPickerSearch, setColumnPickerSearch] = useState<string>("");
  const [columnPickerTab, setColumnPickerTab] = useState<"favoritas" | "todas">("favoritas");

  const pickerVariablesList = useMemo(() => {
    const base = columnPickerTab === "favoritas" ? availableFavVariables : allVariables;
    if (!columnPickerSearch.trim()) return base;
    const q = columnPickerSearch.toLowerCase().trim();
    return base.filter(
      (v) =>
        v.label?.toLowerCase().includes(q) ||
        v.shortLabel?.toLowerCase().includes(q) ||
        v.key?.toLowerCase().includes(q) ||
        v.categoria?.toLowerCase().includes(q) ||
        v.unit?.toLowerCase().includes(q)
    );
  }, [columnPickerTab, availableFavVariables, allVariables, columnPickerSearch]);

  const [ratioFormat, setRatioFormat] = useState<"real" | "multiplier" | "remaining">(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_ratio_format");
        if (stored === "real" || stored === "multiplier" || stored === "remaining") return stored;
        if (stored === "percentage") return "remaining";
      } catch (e) {}
    }
    return "real";
  });

  const handleSetRatioFormat = (val: "real" | "multiplier" | "remaining") => {
    setRatioFormat(val);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("gps_ratio_format", val);
      } catch (e) {}
    }
  };

  // Variables seleccionadas por el usuario para la pestaña de Ratios Semanales
  const [selectedRatioKeys, setSelectedRatioKeys] = useState<string[]>(() => {
    const defaultList = ["Distance(m)", "Distance +21 (m)", "+ 24 km/h (Distancia)", "Acc+Dec", "Player Load"];
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_ratio_selected_variables");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Reemplazar clave obsoleta 'Sprint (m)' y purgar claves derivadas inexistentes
            const cleaned = parsed
              .filter((k) => k !== "derived_1791992159697" && k !== "derived_undefined")
              .map((k) => (k === "Sprint (m)" ? "+ 24 km/h (Distancia)" : k));
            return Array.from(new Set(["Distance(m)", ...cleaned]));
          }
        }
      } catch (e) {}
    }
    return defaultList;
  });

  // Limpieza defensiva en localStorage para purgar variables derivadas huérfanas en el navegador del usuario
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_ratio_selected_variables");
        if (stored && (stored.includes("derived_1791992159697") || stored.includes("derived_undefined"))) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter((k) => k !== "derived_1791992159697" && k !== "derived_undefined");
            localStorage.setItem("gps_ratio_selected_variables", JSON.stringify(cleaned));
            setSelectedRatioKeys((prev) => prev.filter((k) => k !== "derived_1791992159697" && k !== "derived_undefined"));
          }
        }
      } catch (e) {}
    }
  }, []);

  // DT (Distance(m)) SIEMPRE es la primera columna fija del panel
  const activeRatioKeys = useMemo(() => {
    const validDerivedIds = new Set(derivedVariables.map((d) => d.id));
    const others = selectedRatioKeys.filter((k) => {
      if (k === "Distance(m)") return false;
      if (k === "derived_1791992159697" || k === "derived_undefined") return false;
      if (k.startsWith("derived_") && !validDerivedIds.has(k)) return false;
      return true;
    });
    return ["Distance(m)", ...others];
  }, [selectedRatioKeys, derivedVariables]);

  const [showRatioColumnPicker, setShowRatioColumnPicker] = useState<boolean>(false);
  const [ratioPickerScope, setRatioPickerScope] = useState<"favoritas" | "todas">("favoritas");

  // ── ESTADOS PARA OCULTAR / MOSTRAR JUGADORES EN RATIOS SEMANALES ──
  const [hiddenPlayerIds, setHiddenPlayerIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("gps_ratio_hidden_players");
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });
  const [showPlayerFilterPicker, setShowPlayerFilterPicker] = useState<boolean>(false);
  const [playerSearchFilter, setPlayerSearchFilter] = useState<string>("");

  const handleTogglePlayerVisibility = (playerId: string) => {
    setHiddenPlayerIds((prev) => {
      const next = prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId];
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("gps_ratio_hidden_players", JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
  };

  const handleHidePlayer = (playerId: string) => {
    setHiddenPlayerIds((prev) => {
      if (prev.includes(playerId)) return prev;
      const next = [...prev, playerId];
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("gps_ratio_hidden_players", JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
  };

  const handleShowAllPlayers = () => {
    setHiddenPlayerIds([]);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("gps_ratio_hidden_players");
      } catch (e) {}
    }
  };

  const handleHidePlayersWithoutSessions = () => {
    const withoutSessions = weeklyRatiosData
      .filter((row) => row.sessionsCount === 0)
      .map((row) => row.jugador.id);
    setHiddenPlayerIds((prev) => {
      const next = Array.from(new Set([...prev, ...withoutSessions]));
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("gps_ratio_hidden_players", JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
  };

  const handleHideGoalkeepers = () => {
    const goalkeepers = jugadores
      .filter((j) => (j.posicion || "").toUpperCase().includes("POR"))
      .map((j) => j.id);
    setHiddenPlayerIds((prev) => {
      const next = Array.from(new Set([...prev, ...goalkeepers]));
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("gps_ratio_hidden_players", JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
  };

  const handleToggleRatioColumn = (key: string) => {
    if (key === "Distance(m)") return; // DT siempre es fija y obligatoria
    setSelectedRatioKeys((prev) => {
      let next: string[];
      if (prev.includes(key)) {
        next = prev.filter((k) => k !== key);
      } else {
        next = [...prev, key];
      }
      // Asegurar que Distance(m) esté al principio
      next = ["Distance(m)", ...next.filter((k) => k !== "Distance(m)")];
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("gps_ratio_selected_variables", JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
  };

  const handleSetPresetRatioColumns = (keys: string[]) => {
    // DT siempre es la primera columna
    const withDt = ["Distance(m)", ...keys.filter((k) => k !== "Distance(m)")];
    setSelectedRatioKeys(withDt);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("gps_ratio_selected_variables", JSON.stringify(withDt));
      } catch (e) {}
    }
  };

  const formatRatioCellDisplay = (metricData: any) => {
    if (!metricData) return "-";
    if (ratioFormat === "real") {
      const valStr = metricData.weekVal.toLocaleString("es-ES");
      const unitStr = metricData.unit ? " " + metricData.unit : "";
      return valStr + unitStr;
    }
    if (ratioFormat === "multiplier") {
      return metricData.actualRatio.toFixed(2) + "x";
    }
    // Formato "restante" respecto al objetivo exigido
    const targetVal = metricData.benchmark * metricData.targetRatio;
    const remainingVal = targetVal - metricData.weekVal;
    if (remainingVal <= 0) {
      return "0" + (metricData.unit ? " " + metricData.unit : "");
    }
    const valRounded = metricData.unit === "m/min" || metricData.unit === "km/h" ? Number(remainingVal.toFixed(1)) : Math.round(remainingVal);
    const unitStr = metricData.unit ? " " + metricData.unit : "";
    return valRounded.toLocaleString("es-ES") + unitStr;
  };

  const [showSemaforo, setShowSemaforo] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_ratio_show_semaforo");
        if (stored !== null) return stored === "true";
      } catch (e) {}
    }
    return true;
  });

  const handleToggleSemaforo = () => {
    const next = !showSemaforo;
    setShowSemaforo(next);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("gps_ratio_show_semaforo", String(next));
      } catch (e) {}
    }
  };

  const [teamRatioTargets, setTeamRatioTargets] = useState<Record<string, number>>(() => {
    const defaults: Record<string, number> = {
      "Distance(m)": 2.5,
      "Distance +21 (m)": 1.8,
      "Sprint (m)": 1.2,
      "Acc+Dec": 2.2,
      "Player Load": 2.5,
      dist: 2.5,
      hsr: 1.8,
      sprint: 1.2,
      accDec: 2.2,
      load: 2.5,
    };
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_team_ratio_targets_map");
        if (stored) return { ...defaults, ...JSON.parse(stored) };
        const legacy = localStorage.getItem("gps_team_ratio_targets");
        if (legacy) {
          const p = JSON.parse(legacy);
          return {
            ...defaults,
            "Distance(m)": p.dist ?? 2.5,
            "Distance +21 (m)": p.hsr ?? 1.8,
            "Sprint (m)": p.sprint ?? 1.2,
            "Acc+Dec": p.accDec ?? 2.2,
            "Player Load": p.load ?? 2.5,
            dist: p.dist ?? 2.5,
            hsr: p.hsr ?? 1.8,
            sprint: p.sprint ?? 1.2,
            accDec: p.accDec ?? 2.2,
            load: p.load ?? 2.5,
          };
        }
      } catch (e) {}
    }
    return defaults;
  });

  const [playerCustomTargets, setPlayerCustomTargets] = useState<Record<string, Record<string, number>>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_player_custom_targets_map");
        if (stored) return JSON.parse(stored);
        const legacy = localStorage.getItem("gps_player_custom_targets");
        if (legacy) {
          const parsed = JSON.parse(legacy);
          const migrated: Record<string, Record<string, number>> = {};
          Object.entries(parsed).forEach(([pId, vals]: [string, any]) => {
            migrated[pId] = {};
            if (vals.dist !== undefined) migrated[pId]["Distance(m)"] = vals.dist;
            if (vals.hsr !== undefined) migrated[pId]["Distance +21 (m)"] = vals.hsr;
            if (vals.sprint !== undefined) migrated[pId]["Sprint (m)"] = vals.sprint;
            if (vals.accDec !== undefined) migrated[pId]["Acc+Dec"] = vals.accDec;
            if (vals.load !== undefined) migrated[pId]["Player Load"] = vals.load;
          });
          return migrated;
        }
      } catch (e) {}
    }
    return {};
  });

  const [selectedPlayerForTarget, setSelectedPlayerForTarget] = useState<any | null>(null);
  const [showAllIndividualTargetsModal, setShowAllIndividualTargetsModal] = useState<boolean>(false);

  const handleUpdateTeamTarget = (metricKey: string, val: number) => {
    if (isNaN(val) || val <= 0) return;
    const updated = { ...teamRatioTargets, [metricKey]: val };
    setTeamRatioTargets(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("gps_team_ratio_targets_map", JSON.stringify(updated));
    }
  };

  const handleUpdatePlayerTarget = (playerId: string, metricKey: string, val: number) => {
    if (isNaN(val) || val <= 0) return;
    const current = playerCustomTargets[playerId] || {};
    const updated = {
      ...playerCustomTargets,
      [playerId]: { ...current, [metricKey]: val },
    };
    setPlayerCustomTargets(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("gps_player_custom_targets_map", JSON.stringify(updated));
    }
  };

  const handleResetPlayerTarget = (playerId: string) => {
    const updated = { ...playerCustomTargets };
    delete updated[playerId];
    setPlayerCustomTargets(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("gps_player_custom_targets_map", JSON.stringify(updated));
    }
  };
  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number>(0);
  const [ratioDataSource, setRatioDataSource] = useState<"reales" | "todos">(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_ratio_data_source");
        if (stored === "reales" || stored === "todos") return stored;
      } catch (e) {}
    }
    return "reales";
  });

  const handleSetRatioDataSource = (val: "reales" | "todos") => {
    setRatioDataSource(val);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("gps_ratio_data_source", val);
      } catch (e) {}
    }
  };

  // ── MICROCICLOS PERSONALIZADOS POR EL USUARIO ──
  const [customMicrocycles, setCustomMicrocycles] = useState<CustomMicrocycleDef[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_custom_microcycles");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {
        console.error("Error al cargar microciclos guardados:", e);
      }
    }
    return DEFAULT_CUSTOM_MICROCICLOS;
  });

  const [showMicroModal, setShowMicroModal] = useState<boolean>(false);
  const [editingMicroId, setEditingMicroId] = useState<string | null>(null);
  const [microFormName, setMicroFormName] = useState<string>("");
  const [microFormStart, setMicroFormStart] = useState<string>("");
  const [microFormEnd, setMicroFormEnd] = useState<string>("");
  const [microFormError, setMicroFormError] = useState<string>("");
  const [microFormTipo, setMicroFormTipo] = useState<Exclude<MicrocycleType, "todos">>("media");

  const saveCustomMicrocycles = (newMcs: CustomMicrocycleDef[]) => {
    setCustomMicrocycles(newMcs);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("gps_custom_microcycles", JSON.stringify(newMcs));
      } catch (e) {
        console.error("Error guardando microciclos:", e);
      }
    }
  };

  const handleUpdateWeekType = (weekId: string, newTipo: Exclude<MicrocycleType, "todos">) => {
    if (!weekId) return;
    saveMicrocycleTypeOverride(weekId, newTipo);

    setCustomMicrocycles((prev) => {
      const exists = prev.some((m) => m.id === weekId);
      let updated: CustomMicrocycleDef[];
      if (exists) {
        updated = prev.map((m) => (m.id === weekId ? { ...m, tipo: newTipo } : m));
      } else {
        const foundAvail = availableWeeks.find((w) => w.microId === weekId);
        if (foundAvail) {
          const newEntry: CustomMicrocycleDef = {
            id: foundAvail.microId,
            nombre: foundAvail.nombre,
            start: foundAvail.start,
            end: foundAvail.end,
            tipo: newTipo,
          };
          updated = [newEntry, ...prev];
        } else {
          updated = prev;
        }
      }
      saveCustomMicrocycles(updated);
      return updated;
    });
  };

  const handleSaveMicrocycleForm = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setMicroFormError("");
    if (!microFormStart || !microFormEnd) {
      setMicroFormError("Por favor selecciona las fechas de inicio y fin.");
      return;
    }
    if (microFormStart > microFormEnd) {
      setMicroFormError("La fecha de inicio no puede ser posterior a la fecha de fin.");
      return;
    }

    const sParts = microFormStart.split("-");
    const eParts = microFormEnd.split("-");
    const autoLabel = "Microciclo " + sParts[2] + "/" + sParts[1] + " al " + eParts[2] + "/" + eParts[1];
    const nombre = microFormName.trim() || autoLabel;

    if (editingMicroId) {
      saveMicrocycleTypeOverride(editingMicroId, microFormTipo);
      const exists = customMicrocycles.some((m) => m.id === editingMicroId);
      let updated: CustomMicrocycleDef[];
      if (exists) {
        updated = customMicrocycles.map((mc) =>
          mc.id === editingMicroId ? { ...mc, nombre, start: microFormStart, end: microFormEnd, tipo: microFormTipo } : mc
        );
      } else {
        const newMc: CustomMicrocycleDef = {
          id: editingMicroId,
          nombre,
          start: microFormStart,
          end: microFormEnd,
          tipo: microFormTipo,
        };
        updated = [newMc, ...customMicrocycles];
      }
      saveCustomMicrocycles(updated);
      setEditingMicroId(null);
    } else {
      const newMc: CustomMicrocycleDef = {
        id: "mc_" + Date.now(),
        nombre,
        start: microFormStart,
        end: microFormEnd,
        tipo: microFormTipo,
      };
      saveMicrocycleTypeOverride(newMc.id, microFormTipo);
      saveCustomMicrocycles([newMc, ...customMicrocycles]);
    }

    setMicroFormName("");
    setMicroFormStart("");
    setMicroFormEnd("");
  };

  const handleEditMicrocycle = (mc: CustomMicrocycleDef) => {
    setEditingMicroId(mc.id);
    setMicroFormName(mc.nombre || "");
    setMicroFormStart(mc.start);
    setMicroFormEnd(mc.end);
    setMicroFormTipo((mc.tipo || getMicrocycleType(mc)) as Exclude<MicrocycleType, "todos">);
    setMicroFormError("");
  };

  const handleDeleteMicrocycle = (id: string) => {
    if (availableWeeks.length <= 1) {
      alert("Debe haber al menos un microciclo configurado.");
      return;
    }
    // Registrar en eliminados para que extractMicrocyclesFromGpsData no lo regenere
    addDeletedMicrocycleId(id);

    const updated = customMicrocycles.filter((m) => m.id !== id);
    saveCustomMicrocycles(updated);
    if (editingMicroId === id) {
      setEditingMicroId(null);
      setMicroFormName("");
      setMicroFormStart("");
      setMicroFormEnd("");
    }
    setSelectedWeekIdx(0);
  };

  const handleResetMicrocycles = () => {
    resetDeletedMicrocycles();
    saveCustomMicrocycles(DEFAULT_CUSTOM_MICROCICLOS);
    setEditingMicroId(null);
    setMicroFormName("");
    setMicroFormStart("");
    setMicroFormEnd("");
    setSelectedWeekIdx(0);
  };

  // ── FECHA DE REFERENCIA ACTUAL (la fecha más reciente con GPS o la seleccionada) ──
  const latestGpsDate = useMemo(() => {
    if (gpsRecords.length === 0) return selectedDate || new Date().toISOString().split("T")[0];
    const sorted = [...gpsRecords].map((r) => r.fecha).filter(Boolean).sort().reverse();
    return sorted[0] || selectedDate;
  }, [gpsRecords, selectedDate]);

  // Lista de fechas únicas ordenadas (respetando si se filtran solo reales o todos)
  const allUniqueDates = useMemo(() => {
    const set = new Set<string>();
    gpsRecords.forEach((r) => {
      if (r.fecha) {
        if (ratioDataSource === "reales" && isRecordSimulado(r)) return;
        set.add(r.fecha);
      }
    });
    return Array.from(set).sort().reverse();
  }, [gpsRecords, ratioDataSource]);

  // Todas las fechas con registros GPS (reales o simulados)
  const allSessionDates = useMemo(() => {
    const set = new Set<string>();
    (gpsRecords || []).forEach((r) => {
      if (r.fecha) set.add(r.fecha);
    });
    return Array.from(set).sort().reverse();
  }, [gpsRecords]);

  // Semanas / Microciclos determinados por la configuración del usuario combinados con detección automática
  const availableWeeks = useMemo(() => {
    const deletedIds = getDeletedMicrocycleIds();
    const extracted = extractMicrocyclesFromGpsData(gpsRecords, customMicrocycles);
    const mergedMap = new Map<string, CustomMicrocycleDef>();

    extracted.forEach((mc) => {
      if (!deletedIds.includes(mc.id)) mergedMap.set(mc.id, mc);
    });
    (customMicrocycles || []).forEach((mc) => {
      if (!deletedIds.includes(mc.id)) {
        if (mergedMap.has(mc.id)) {
          mergedMap.set(mc.id, { ...mergedMap.get(mc.id)!, ...mc });
        } else {
          mergedMap.set(mc.id, mc);
        }
      }
    });

    const list = Array.from(mergedMap.values());
    if (list.length === 0) {
      const today = new Date();
      return [{ id: 0, microId: "default", nombre: "Semana Actual", label: "Semana Actual", start: today.toISOString().split("T")[0], end: today.toISOString().split("T")[0], tipo: "media" as Exclude<MicrocycleType, "todos">, dates: [] as string[] }];
    }

    const sorted = [...list].sort((a, b) => b.start.localeCompare(a.start));

    return sorted.map((mc, idx) => {
      const matchingDates = allSessionDates.filter((d) => d >= mc.start && d <= mc.end).sort();
      const sParts = mc.start.split("-");
      const eParts = mc.end.split("-");
      const sLabel = sParts[2] + "/" + sParts[1];
      const eLabel = eParts[2] + "/" + eParts[1];
      const sesLabel = matchingDates.length === 1 ? "1 sesión" : matchingDates.length + " sesiones";
      const cleanLabel = mc.nombre
        ? (mc.nombre.includes(sLabel) || mc.nombre.includes(sParts[2]) ? mc.nombre + " · " + sesLabel : mc.nombre + " (" + sLabel + " - " + eLabel + ") · " + sesLabel)
        : "Microciclo (" + sLabel + " - " + eLabel + ") · " + sesLabel;

      return {
        id: idx,
        microId: mc.id,
        nombre: mc.nombre || ("Microciclo (" + sLabel + " - " + eLabel + ")"),
        label: cleanLabel,
        start: mc.start,
        end: mc.end,
        tipo: getMicrocycleType(mc),
        dates: matchingDates,
      };
    });
  }, [customMicrocycles, gpsRecords, allSessionDates]);

  // Selección inteligente del microciclo activo (por fecha actual o el primero con datos)
  useEffect(() => {
    if (availableWeeks.length === 0) return;
    const todayStr = new Date().toISOString().split("T")[0];
    const matchTodayIdx = availableWeeks.findIndex((w) => w.start <= todayStr && w.end >= todayStr);
    if (matchTodayIdx !== -1) {
      setSelectedWeekIdx(matchTodayIdx);
    } else {
      const firstWithData = availableWeeks.findIndex((w) => w.dates.length > 0);
      if (firstWithData !== -1) setSelectedWeekIdx(firstWithData);
    }
  }, [availableWeeks.length]);

  // ── PALETA DE COLORES PARA GRÁFICO EVOLUTIVO ──
  const EVOLUTIVO_PALETTE = [
    { stroke: "#0284c7", fill: "#38bdf8", bg: "#f0f9ff", border: "#bae6fd", text: "#0369a1", darkText: "#075985" }, // Azul
    { stroke: "#16a34a", fill: "#4ade80", bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d", darkText: "#166534" }, // Verde
    { stroke: "#ea580c", fill: "#fb923c", bg: "#fff7ed", border: "#fed7aa", text: "#c2410c", darkText: "#9a3412" }, // Naranja
    { stroke: "#9333ea", fill: "#c084fc", bg: "#faf5ff", border: "#e9d5ff", text: "#7e22ce", darkText: "#6b21a8" }, // Púrpura
  ];

  // ── ESTADOS PARA GRÁFICO EVOLUTIVO EN CONSULTAS CLAVE ──
  const [evolutivoTarget, setEvolutivoTarget] = useState<"equipo" | "jugador">("equipo");
  const [evolutivoPlayerId, setEvolutivoPlayerId] = useState<string>("");
  const [evolutivoTimeGrouping, setEvolutivoTimeGrouping] = useState<"sesion" | "microciclo">("sesion");
  const [evolutivoTimeRange, setEvolutivoTimeRange] = useState<"30" | "60" | "todo">("30");
  const [evolutivoChartType, setEvolutivoChartType] = useState<"line" | "bar">("line");
  const [evolutivoTeamAgg, setEvolutivoTeamAgg] = useState<"media" | "total">("media");
  const [evolutivoDataSource, setEvolutivoDataSource] = useState<"reales" | "todos">(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_evolutivo_data_source");
        if (stored === "reales" || stored === "todos") return stored;
      } catch (e) {}
    }
    return "reales";
  });

  const handleSetEvolutivoDataSource = (val: "reales" | "todos") => {
    setEvolutivoDataSource(val);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("gps_evolutivo_data_source", val);
      } catch (e) {}
    }
  };
  const [showMatchRefLine, setShowMatchRefLine] = useState<boolean>(true);
  const [evolutivoVariables, setEvolutivoVariables] = useState<string[]>([
    "Distance(m)",
    "+ 24 km/h (Distancia)",
  ]);
  const [showEvolutivoVarPicker, setShowEvolutivoVarPicker] = useState<boolean>(false);
  const [evolutivoVarSearch, setEvolutivoVarSearch] = useState<string>("");
  // ── ESTADOS PARA FUENTE DE DATOS EN ACWR ──
  const [acwrDataSource, setAcwrDataSource] = useState<"reales" | "todos">(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_acwr_data_source");
        if (stored === "reales" || stored === "todos") return stored;
      } catch (e) {}
    }
    return "reales";
  });

  const handleSetAcwrDataSource = (val: "reales" | "todos") => {
    setAcwrDataSource(val);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("gps_acwr_data_source", val);
      } catch (e) {}
    }
  };

  // ── ESTADOS PARA PLANIFICACIÓN DE RATIOS POR SESIÓN Y EVALUACIÓN PROGRESIVA ──
  const [ratioEvaluationMode, setRatioEvaluationMode] = useState<"progresivo" | "total" | "sesion">(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_ratio_eval_mode");
        if (stored === "progresivo" || stored === "total" || stored === "sesion") return stored;
      } catch (e) {}
    }
    return "progresivo";
  });

  const handleSetRatioEvaluationMode = (val: "progresivo" | "total" | "sesion") => {
    setRatioEvaluationMode(val);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("gps_ratio_eval_mode", val);
      } catch (e) {}
    }
  };

  const [selectedRatioSessionDate, setSelectedRatioSessionDate] = useState<string>("");
  const [showSessionPlanningModal, setShowSessionPlanningModal] = useState<boolean>(false);
  const [sessionRatioPlanMap, setSessionRatioPlanMap] = useState<Record<string, Record<string, number>>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_session_ratio_targets_map");
        if (stored) return JSON.parse(stored);
      } catch (e) {}
    }
    return {};
  });

  const handleSaveSessionRatioPlan = (newPlan: Record<string, Record<string, number>>) => {
    setSessionRatioPlanMap(newPlan);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("gps_session_ratio_targets_map", JSON.stringify(newPlan));
      } catch (e) {}
    }
  };



  const [evolutivoTableOrder, setEvolutivoTableOrder] = useState<"desc" | "asc">("desc");
  const [evolutivoTableFilter, setEvolutivoTableFilter] = useState<"todos" | "partidos" | "entrenos">("todos");
  const [evolutivoTableShowPct, setEvolutivoTableShowPct] = useState<boolean>(true);

  useEffect(() => {
    if (!evolutivoPlayerId && jugadores && jugadores.length > 0) {
      setEvolutivoPlayerId(jugadores[0].id);
    }
  }, [jugadores, evolutivoPlayerId]);

  const handleToggleEvolutivoVar = (varKey: string) => {
    setEvolutivoVariables((prev) => {
      if (prev.includes(varKey)) {
        if (prev.length <= 1) return prev; // Mantener al menos 1 métrica
        return prev.filter((k) => k !== varKey);
      }
      if (prev.length >= 3) {
        // Rotar para no sobrecargar el gráfico (máx 3)
        return [...prev.slice(1), varKey];
      }
      return [...prev, varKey];
    });
  };

  // Helper para resolver el Match Day (MD) exacto de una fecha
  // Si solo hay un jugador que tiene MD en un día, solo sale MD cuando se consulte su perfil individual (targetPlayerId)
  const getSessionMd = (dateStr: string, recordsOnDate: any[] = [], targetPlayerId?: string): string => {
    // 1. Si se consulta el perfil individual de un jugador y ESE jugador tiene registro de partido en esta fecha
    if (targetPlayerId && recordsOnDate.length > 0) {
      const pRec = recordsOnDate.find((r) => r.jugador_id === targetPlayerId);
      if (pRec) {
        const explicit = pRec.match_day || pRec.metricas?.match_day || pRec.md || pRec.metricas?.md;
        const isMatch = String(explicit || "").toUpperCase() === "MD" ||
          String(pRec.tipo_sesion || "").toUpperCase() === "PARTIDO" ||
          String(pRec.sesion_nombre || "").toUpperCase().includes("PARTIDO");
        if (isMatch) return "MD";
        if (explicit) return normalizeMdType(explicit);
      }
    }

    // 2. Consultar la planificación oficial
    const fromPlan = resolvePlanificacionMD(dateStr, planificacionDays, gpsRecords, targetPlayerId);
    if (fromPlan) return normalizeMdType(fromPlan);

    // 3. Revisar registros del día
    const matchPlayers = new Set(
      recordsOnDate
        .filter((r) =>
          String(r.match_day || r.md || "").toUpperCase() === "MD" ||
          String(r.tipo_sesion || "").toUpperCase() === "PARTIDO" ||
          String(r.sesion_nombre || "").toUpperCase().includes("PARTIDO")
        )
        .map((r) => r.jugador_id)
        .filter(Boolean)
    );

    // REGLA: Si solo 1 jugador tiene MD en el día, solo es MD para él, no altera la visión de equipo
    if (matchPlayers.size === 1) {
      if (targetPlayerId && matchPlayers.has(targetPlayerId)) {
        return "MD";
      }
      // Para la visión de equipo, ignorar el MD del jugador solitario y tomar el MD del resto de registros
      const teamRecords = recordsOnDate.filter((r) => !matchPlayers.has(r.jugador_id));
      for (const r of teamRecords) {
        const explicit = r.match_day || r.metricas?.match_day || r.md || r.metricas?.md;
        if (explicit && String(explicit).toUpperCase() !== "MD") return normalizeMdType(explicit);
        const matchInName = String(r.sesion_nombre || r.tipo || "").match(/(?:MD\s*-\s*(\d+)|MD\s*\+\s*(\d+)|-\s*(\d+)\s*MD|\+\s*(\d+)\s*MD)/i);
        if (matchInName) return normalizeMdType(matchInName[0]);
      }
    } else if (matchPlayers.size > 1) {
      return "MD";
    } else {
      for (const r of recordsOnDate) {
        const explicit = r.match_day || r.metricas?.match_day || r.md || r.metricas?.md;
        if (explicit) return normalizeMdType(explicit);
        if (String(r.tipo_sesion || "").toUpperCase() === "PARTIDO" || String(r.sesion_nombre || "").toUpperCase().includes("PARTIDO")) {
          return "MD";
        }
        const matchInName = String(r.sesion_nombre || r.tipo || "").match(/(?:MD\s*-\s*(\d+)|MD\s*\+\s*(\d+)|-\s*(\d+)\s*MD|\+\s*(\d+)\s*MD)/i);
        if (matchInName) return normalizeMdType(matchInName[0]);
      }
    }

    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("cargas_manual_md_v1");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed[dateStr]) return normalizeMdType(parsed[dateStr]);
        }
        const rawPlanif = localStorage.getItem("planificacion_sesiones_v1") || localStorage.getItem("planificacion_calendario_v1");
        if (rawPlanif) {
          const list = JSON.parse(rawPlanif);
          const found = list.find((s: any) => s && (s.fecha === dateStr || s.id === dateStr));
          if (found?.md) return normalizeMdType(found.md);
        }
      } catch {}
    }

    // Partidos para la visión de equipo: solo si > 1 jugador jugó o si la planificación oficial lo marca
    const matchPlayerCounts = new Map<string, Set<string>>();
    gpsRecords.forEach((r) => {
      if (
        r.fecha &&
        (r.match_day === "MD" ||
          r.md === "MD" ||
          String(r.tipo_sesion || "").toUpperCase() === "PARTIDO" ||
          String(r.sesion_nombre || "").toUpperCase().includes("PARTIDO"))
      ) {
        const pId = r.jugador_id || r.id || "p";
        if (!matchPlayerCounts.has(r.fecha)) matchPlayerCounts.set(r.fecha, new Set());
        matchPlayerCounts.get(r.fecha)!.add(pId);
      }
    });

    const matchDates: string[] = [];
    matchPlayerCounts.forEach((pSet, dt) => {
      if (pSet.size > 1) {
        matchDates.push(dt);
      }
    });
    // Añadir partidos de planificacion oficial
    const planMatches = (planificacionDays || []).filter(isMatchDaySession).map((d: any) => d.fecha).filter(Boolean);
    planMatches.forEach((dt: string) => {
      if (!matchDates.includes(dt)) matchDates.push(dt);
    });
    matchDates.sort();

    if (matchDates.includes(dateStr)) return "MD";

    if (matchDates.length > 0) {
      const tTime = new Date(dateStr + "T12:00:00").getTime();
      const upcoming = matchDates.filter((m) => m > dateStr).sort();
      if (upcoming.length > 0) {
        const nextMatch = upcoming[0];
        const nTime = new Date(nextMatch + "T12:00:00").getTime();
        const diffDays = Math.round((nTime - tTime) / (1000 * 60 * 60 * 24));
        if (diffDays <= 6) return `MD-${diffDays}`;
      }
      const past = matchDates.filter((m) => m < dateStr).sort().reverse();
      if (past.length > 0) {
        const prevMatch = past[0];
        const pTime = new Date(prevMatch + "T12:00:00").getTime();
        const diffDays = Math.round((tTime - pTime) / (1000 * 60 * 60 * 24));
        if (diffDays <= 2) return `MD+${diffDays}`;
      }
    }

    try {
      const d = new Date(dateStr + "T12:00:00");
      const mdMap: Record<number, string> = { 0: "MD", 1: "MD+1", 2: "MD-4", 3: "MD-3", 4: "MD-2", 5: "MD-1", 6: "MD" };
      return mdMap[d.getDay()] || "ENT";
    } catch {
      return "ENT";
    }
  };

  // Helper para extraer datos de partido oficial: SOLO 1ª parte y 2ª parte de jugadores que juegan las dos
  const getPlayerMatchDayValue = (
    record: any,
    varKey: string
  ): { playedBothHalves: boolean; value: number } => {
    if (!record) return { playedBothHalves: false, value: 0 };
    const tareas = record.metricas?.tareas || record.tareas;

    if (Array.isArray(tareas) && tareas.length > 0) {
      let part1: any = null;
      let part2: any = null;

      tareas.forEach((t: any) => {
        const tName = String(t.nombre || t.name || t.tarea || "").trim().toUpperCase();
        if (isFirstHalfTask(tName)) part1 = t;
        if (isSecondHalfTask(tName)) part2 = t;
      });

      // REGLA ESTRICTA: Solo jugadores que juegan ambas partes (1ª y 2ª parte)
      if (!part1 || !part2) {
        return { playedBothHalves: false, value: 0 };
      }

      const isPeak = isRateOrPeak(varKey);

      if (isPeak) {
        const v1 = calculateGpsMetricValue(part1, varKey, derivedVariables);
        const v2 = calculateGpsMetricValue(part2, varKey, derivedVariables);
        if (varKey.toLowerCase().includes("min") || varKey.toLowerCase().includes("/min")) {
          const d1 = calculateGpsMetricValue(part1, "Distance(m)", derivedVariables);
          const d2 = calculateGpsMetricValue(part2, "Distance(m)", derivedVariables);
          const t1 = Number(part1.Tiempo || part1.duracion_min || part1.Duration || 45);
          const t2 = Number(part2.Tiempo || part2.duracion_min || part2.Duration || 45);
          const totalMin = t1 + t2;
          return { playedBothHalves: true, value: totalMin > 0 ? Math.round(((d1 + d2) / totalMin) * 10) / 10 : 0 };
        }
        return { playedBothHalves: true, value: Math.max(v1, v2) };
      } else {
        const v1 = calculateGpsMetricValue(part1, varKey, derivedVariables);
        const v2 = calculateGpsMetricValue(part2, varKey, derivedVariables);
        return { playedBothHalves: true, value: v1 + v2 };
      }
    }

    const dur = Number(record.duracion || record.metricas?.["Duration(min)"] || record.minutos_totales || record.minutos || 0);
    if (dur >= 80) {
      const val = calculateGpsMetricValue(record.metricas || record, varKey, derivedVariables);
      return { playedBothHalves: true, value: val };
    }

    return { playedBothHalves: false, value: 0 };
  };

  // Helper para obtener el valor de referencia de 1 partido entero (100% Match Demands)
  const getMatchBenchmark = (varKey: string): number | null => {
    if (!varKey) return null;
    if (evolutivoTarget === "jugador") {
      const pId = evolutivoPlayerId || jugadores[0]?.id;
      const prof = competitiveProfiles.get(pId);
      if (!prof) return null;
      const v = prof.values?.[varKey];
      if (typeof v === "number" && v > 0) return Math.round(v * 10) / 10;
      return null;
    } else {
      const vals: number[] = [];
      jugadores.forEach((j) => {
        const prof = competitiveProfiles.get(j.id);
        if (!prof) return;
        const v = prof.values?.[varKey];
        if (typeof v === "number" && v > 0) vals.push(v);
      });
      if (vals.length === 0) return null;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (evolutivoTeamAgg === "total") {
        return Math.round(avg * (jugadores.length || 1));
      }
      return Math.round(avg * 10) / 10;
    }
  };

  // Pipeline de datos evolutivos según sujeto, variables, agrupación temporal y fuente de datos
  const evolutivoChartData = useMemo(() => {
    const validRecords = gpsRecords.filter((r) => {
      if (!r.fecha) return false;
      if (evolutivoDataSource === "reales" && isRecordSimulado(r)) return false;
      return true;
    });
    if (validRecords.length === 0) return [];

    const allDates = Array.from(new Set(validRecords.map((r) => r.fecha))).sort();
    if (allDates.length === 0) return [];

    let filteredDates = allDates;
    if (evolutivoTimeRange === "30" && allDates.length > 0) {
      const maxDate = new Date(allDates[allDates.length - 1]);
      const cutoff = new Date(maxDate);
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = cutoff.toISOString().split("T")[0];
      filteredDates = allDates.filter((d) => d >= cutoffStr);
      if (filteredDates.length < 5 && allDates.length >= 5) {
        filteredDates = allDates.slice(-10);
      }
    } else if (evolutivoTimeRange === "60" && allDates.length > 0) {
      const maxDate = new Date(allDates[allDates.length - 1]);
      const cutoff = new Date(maxDate);
      cutoff.setDate(cutoff.getDate() - 60);
      const cutoffStr = cutoff.toISOString().split("T")[0];
      filteredDates = allDates.filter((d) => d >= cutoffStr);
      if (filteredDates.length < 10 && allDates.length >= 10) {
        filteredDates = allDates.slice(-20);
      }
    }

    if (evolutivoTimeGrouping === "sesion") {
      const dataPoints: any[] = [];

      filteredDates.forEach((dateStr) => {
        const recordsOnDate = validRecords.filter((r) => r.fecha === dateStr);
        if (recordsOnDate.length === 0) return;

        // Aislamiento: si solo 1 jugador tiene partido, no altera la visión de equipo
        let isMatch = false;
        let sessionMd = "MD";
        const dParts = dateStr.split("-");
        const sLabel = dParts.length === 3 ? `${dParts[2]}/${dParts[1]}` : dateStr;

        if (evolutivoTarget === "jugador") {
          const pRec = recordsOnDate.find((r) => r.jugador_id === evolutivoPlayerId);
          const pIsMatch = pRec && (
            pRec.match_day === "MD" ||
            pRec.md === "MD" ||
            String(pRec.tipo_sesion || "").toUpperCase().includes("PARTIDO") ||
            String(pRec.sesion_nombre || "").toUpperCase().includes("PARTIDO")
          );
          isMatch = Boolean(pIsMatch);
          sessionMd = isMatch ? "MD" : getSessionMd(dateStr, recordsOnDate, evolutivoPlayerId);
        } else {
          const matchPlayers = new Set(
            recordsOnDate
              .filter((r) =>
                r.match_day === "MD" ||
                r.md === "MD" ||
                String(r.tipo_sesion || "").toUpperCase().includes("PARTIDO") ||
                String(r.sesion_nombre || "").toUpperCase().includes("PARTIDO")
              )
              .map((r) => r.jugador_id)
              .filter(Boolean)
          );
          const planMatch = (planificacionDays || []).some((d: any) => (d.fecha === dateStr || d.id === dateStr) && isMatchDaySession(d));
          isMatch = planMatch || matchPlayers.size > 1;
          sessionMd = isMatch ? "MD" : getSessionMd(dateStr, recordsOnDate);
        }

        if (isMatch) {
          // FILTRO ESTRICTO: En partido en evolutivo, solo coge las variables de 1ª parte y 2ª parte (en los jugadores que juegan las dos)
          if (evolutivoTarget === "jugador") {
            const pRec = recordsOnDate.find((r) => r.jugador_id === evolutivoPlayerId);
            if (!pRec) return;

            const res = getPlayerMatchDayValue(pRec, evolutivoVariables[0]);
            if (!res.playedBothHalves) return; // Si no jugó ambas partes completas, no se computa como partido entero

            const point: any = {
              date: dateStr,
              dateLabel: sLabel,
              md: "MD",
              isMatch: true,
              xAxisLabel: `${sLabel}\nMD`,
              label: `${sLabel} (⚽ MD)`,
              fullDate: dateStr,
              fullLabel: `${dateStr} · ⚽ Partido (1ª y 2ª parte)`,
              sessionName: (pRec.sesion_nombre || "Partido Oficial") + " (1ª y 2ª parte)",
              participantes: 1,
            };

            evolutivoVariables.forEach((varKey) => {
              const rVal = getPlayerMatchDayValue(pRec, varKey);
              point[varKey] = Math.round(rVal.value * 10) / 10;
            });

            dataPoints.push(point);
          } else {
            // Equipo: promediar o sumar solo a los jugadores que jugaron AMBAS partes
            const qualifiedPlayers: any[] = [];
            recordsOnDate.forEach((r) => {
              const check = getPlayerMatchDayValue(r, "Distance(m)");
              if (check.playedBothHalves) {
                qualifiedPlayers.push(r);
              }
            });

            if (qualifiedPlayers.length === 0) return;

            const point: any = {
              date: dateStr,
              dateLabel: sLabel,
              md: "MD",
              isMatch: true,
              xAxisLabel: `${sLabel}\nMD`,
              label: `${sLabel} (⚽ MD)`,
              fullDate: dateStr,
              fullLabel: `${dateStr} · ⚽ Partido (1ª y 2ª parte)`,
              sessionName: (recordsOnDate[0]?.sesion_nombre || "Partido Oficial") + ` (${qualifiedPlayers.length} jug. 1ª y 2ª parte)`,
              participantes: qualifiedPlayers.length,
            };

            evolutivoVariables.forEach((varKey) => {
              const vals = qualifiedPlayers.map((r) => getPlayerMatchDayValue(r, varKey).value);
              const sum = vals.reduce((a, b) => a + b, 0);
              if (evolutivoTeamAgg === "media") {
                point[varKey] = Math.round((sum / qualifiedPlayers.length) * 10) / 10;
              } else {
                point[varKey] = Math.round(sum * 10) / 10;
              }
            });

            dataPoints.push(point);
          }
        } else {
          // Sesión regular de entrenamiento
          const targetRecords = evolutivoTarget === "jugador"
            ? recordsOnDate.filter((r) => r.jugador_id === evolutivoPlayerId)
            : recordsOnDate;

          if (evolutivoTarget === "jugador" && targetRecords.length === 0) return;

          const point: any = {
            date: dateStr,
            dateLabel: sLabel,
            md: sessionMd,
            isMatch: false,
            xAxisLabel: `${sLabel}\n${sessionMd}`,
            label: `${sLabel} (${sessionMd})`,
            fullDate: dateStr,
            fullLabel: `${dateStr} · ${sessionMd}`,
            sessionName: targetRecords[0]?.sesion_nombre || targetRecords[0]?.tipo || targetRecords[0]?.md || "Sesión",
            participantes: new Set(recordsOnDate.map((r) => r.jugador_id)).size,
          };

          evolutivoVariables.forEach((varKey) => {
            if (evolutivoTarget === "jugador") {
              const val = targetRecords.reduce((acc, r) => acc + calculateGpsMetricValue(r.metricas || r, varKey, derivedVariables), 0);
              point[varKey] = Math.round(val * 10) / 10;
            } else {
              const uniquePIds = new Set(targetRecords.map((r) => r.jugador_id));
              const count = uniquePIds.size || 1;
              const sum = targetRecords.reduce((acc, r) => acc + calculateGpsMetricValue(r.metricas || r, varKey, derivedVariables), 0);
              if (evolutivoTeamAgg === "media") {
                point[varKey] = Math.round((sum / count) * 10) / 10;
              } else {
                point[varKey] = Math.round(sum * 10) / 10;
              }
            }
          });

          dataPoints.push(point);
        }
      });

      return dataPoints;
    } else {
      // Agrupación por microciclo
      const weeksToUse = [...availableWeeks].sort((a, b) => a.start.localeCompare(b.start));
      const dataPoints: any[] = [];

      weeksToUse.forEach((w) => {
        const weekRecords = validRecords.filter((r) => r.fecha >= w.start && r.fecha <= w.end);
        if (weekRecords.length === 0) return;

        const targetRecords = evolutivoTarget === "jugador"
          ? weekRecords.filter((r) => r.jugador_id === evolutivoPlayerId)
          : weekRecords;

        if (evolutivoTarget === "jugador" && targetRecords.length === 0) return;

        const sParts = w.start.split("-");
        const eParts = w.end.split("-");
        const sLabel = sParts.length === 3 ? `${sParts[2]}/${sParts[1]}` : w.start;
        const eLabel = eParts.length === 3 ? `${eParts[2]}/${eParts[1]}` : w.end;

        const countSessions = new Set(weekRecords.map((r) => r.fecha)).size;
        const microLabel = w.nombre ? (w.nombre.length > 18 ? w.nombre.slice(0, 16) + "…" : w.nombre) : `${sLabel} - ${eLabel}`;
        const point: any = {
          date: w.start,
          label: microLabel,
          xAxisLabel: `${sLabel} - ${eLabel}\n${countSessions} ses.`,
          fullLabel: w.nombre ? `${w.nombre} (${sLabel} - ${eLabel})` : `Microciclo (${sLabel} - ${eLabel})`,
          sessionsCount: countSessions,
          participantes: new Set(weekRecords.map((r) => r.jugador_id)).size,
        };

        evolutivoVariables.forEach((varKey) => {
          if (evolutivoTarget === "jugador") {
            let totalVal = 0;
            // Desglosar por día dentro de la semana para aplicar la regla de 1ª y 2ª parte en partidos
            const datesInWeek = Array.from(new Set(targetRecords.map((r) => r.fecha)));
            datesInWeek.forEach((dStr) => {
              const recsDay = targetRecords.filter((r) => r.fecha === dStr);
              const isMatch = recsDay.some(
                (r) =>
                  r.match_day === "MD" ||
                  r.md === "MD" ||
                  String(r.tipo_sesion || "").toUpperCase().includes("PARTIDO") ||
                  String(r.sesion_nombre || "").toUpperCase().includes("PARTIDO")
              );
              if (isMatch) {
                const res = getPlayerMatchDayValue(recsDay[0], varKey);
                if (res.playedBothHalves) totalVal += res.value;
              } else {
                totalVal += recsDay.reduce((acc, r) => acc + calculateGpsMetricValue(r.metricas || r, varKey, derivedVariables), 0);
              }
            });
            point[varKey] = Math.round(totalVal * 10) / 10;
          } else {
            // Equipo por microciclo
            const datesInWeek = Array.from(new Set(weekRecords.map((r) => r.fecha)));
            let weekSum = 0;
            let activePlayerCounts: number[] = [];

            datesInWeek.forEach((dStr) => {
              const recsDay = weekRecords.filter((r) => r.fecha === dStr);
              const matchPlayers = new Set(
                recsDay
                  .filter((r) =>
                    r.match_day === "MD" ||
                    r.md === "MD" ||
                    String(r.tipo_sesion || "").toUpperCase().includes("PARTIDO") ||
                    String(r.sesion_nombre || "").toUpperCase().includes("PARTIDO")
                  )
                  .map((r) => r.jugador_id)
                  .filter(Boolean)
              );
              const planMatch = (planificacionDays || []).some((d: any) => (d.fecha === dStr || d.id === dStr) && isMatchDaySession(d));
              const isMatch = planMatch || matchPlayers.size > 1;
              if (isMatch) {
                const qualified = recsDay.filter((r) => getPlayerMatchDayValue(r, "Distance(m)").playedBothHalves);
                if (qualified.length > 0) {
                  const dayVals = qualified.map((r) => getPlayerMatchDayValue(r, varKey).value);
                  const daySum = dayVals.reduce((a, b) => a + b, 0);
                  weekSum += daySum;
                  activePlayerCounts.push(qualified.length);
                }
              } else {
                const daySum = recsDay.reduce((acc, r) => acc + calculateGpsMetricValue(r.metricas || r, varKey, derivedVariables), 0);
                weekSum += daySum;
                activePlayerCounts.push(new Set(recsDay.map((r) => r.jugador_id)).size || 1);
              }
            });

            const avgPlayers = activePlayerCounts.length > 0
              ? activePlayerCounts.reduce((a, b) => a + b, 0) / activePlayerCounts.length
              : 1;

            if (evolutivoTeamAgg === "media") {
              point[varKey] = Math.round((weekSum / avgPlayers) * 10) / 10;
            } else {
              point[varKey] = Math.round(weekSum * 10) / 10;
            }
          }
        });

        dataPoints.push(point);
      });

      return dataPoints;
    }
  }, [
    gpsRecords,
    evolutivoDataSource,
    evolutivoTarget,
    evolutivoPlayerId,
    evolutivoTimeGrouping,
    evolutivoTimeRange,
    evolutivoTeamAgg,
    evolutivoVariables,
    availableWeeks,
    derivedVariables,
  ]);


  // ── MÉTODOS DE CÁLCULO DE VELOCIDAD POR JUGADOR ──
  const speedRecordsByPlayer = useMemo(() => {
    const map = new Map<string, Array<{ fecha: string; speed: number; md?: string; tipo?: string }>>();
    gpsRecords.forEach((r) => {
      // FILTRO ESTRICTO: Las velocidades máximas DEBEN venir exclusivamente de datos REALES
      if (isRecordSimulado(r)) return;
      const pId = r.jugador_id;
      if (!pId) return;
      const spd = Number(
        r.metricas?.["MAX Speed(km/h)"] ??
        r.metricas?.max_speed ??
        r.metricas?.["Vel Max"] ??
        r.max_speed ??
        0
      );
      if (spd > 0) {
        if (!map.has(pId)) map.set(pId, []);
        map.get(pId)!.push({
          fecha: r.fecha,
          speed: spd,
          md: r.match_day || r.metricas?.match_day,
          tipo: r.tipo_sesion || r.metricas?.tipo_sesion || (r.match_day === "MD" ? "PARTIDO" : "ENTRENAMIENTO"),
        });
      }
    });

    map.forEach((arr) => {
      arr.sort((a, b) => b.fecha.localeCompare(a.fecha));
    });
    return map;
  }, [gpsRecords]);

  // Análisis de Vmax y exposición al umbral para cada jugador
  const vmaxAnalysis = useMemo(() => {
    const refDateObj = new Date(latestGpsDate + "T00:00:00");

    return jugadores.map((j) => {
      const recs = speedRecordsByPlayer.get(j.id) || [];
      const historicalMax = recs.length > 0 ? Math.max(...recs.map((x) => x.speed)) : 0;
      const thresholdVal = Math.round((historicalMax * (vmaxThresholdPct / 100)) * 100) / 100;

      // Buscar el registro más reciente que superó o igualó el umbral
      const hitRecord = recs.find((x) => x.speed >= thresholdVal);
      let daysSinceHit: number | null = null;
      if (hitRecord) {
        const hitDateObj = new Date(hitRecord.fecha + "T00:00:00");
        const diffMs = refDateObj.getTime() - hitDateObj.getTime();
        daysSinceHit = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }

      // Último registro absoluto (de la sesión más reciente)
      const lastSessionRecord = recs[0] || null;
      const lastSessionSpeed = lastSessionRecord ? lastSessionRecord.speed : 0;
      const lastSessionPct = historicalMax > 0 ? Math.round((lastSessionSpeed / historicalMax) * 100) : 0;

      // Nivel de alerta
      let status: "optimo" | "alerta" | "riesgo" | "sin_datos" = "sin_datos";
      if (daysSinceHit !== null) {
        if (daysSinceHit <= 4) status = "optimo";
        else if (daysSinceHit <= 7) status = "alerta";
        else status = "riesgo";
      }

      return {
        jugador: j,
        historicalMax,
        thresholdVal,
        hitRecord,
        daysSinceHit,
        status,
        lastSessionRecord,
        lastSessionSpeed,
        lastSessionPct,
        totalSessionsWithGps: recs.length,
      };
    });
  }, [jugadores, speedRecordsByPlayer, latestGpsDate, vmaxThresholdPct]);

  // Filtrado y ordenación de la lista de velocidad
  const filteredVmaxList = useMemo(() => {
    let list = vmaxAnalysis.filter((item) => {
      const name = (item.jugador.apodo || item.jugador.nombre || "").toLowerCase();
      const pos = (item.jugador.posicion || "").toUpperCase();
      if (vmaxSearch && !name.includes(vmaxSearch.toLowerCase())) return false;
      if (vmaxFilterPos !== "TODOS") {
        if (vmaxFilterPos === "DEF" && !pos.includes("DEF") && !pos.includes("LAT") && !pos.includes("CEN")) return false;
        if (vmaxFilterPos === "MED" && !pos.includes("MED") && !pos.includes("PIV") && !pos.includes("INT")) return false;
        if (vmaxFilterPos === "DEL" && !pos.includes("DEL") && !pos.includes("EXT") && !pos.includes("PUN")) return false;
        if (vmaxFilterPos === "POR" && !pos.includes("POR")) return false;
      }
      return true;
    });

    if (vmaxSortBy === "dias_desc") {
      list.sort((a, b) => {
        if (a.daysSinceHit === null && b.daysSinceHit === null) return 0;
        if (a.daysSinceHit === null) return 1;
        if (b.daysSinceHit === null) return -1;
        return b.daysSinceHit - a.daysSinceHit;
      });
    } else if (vmaxSortBy === "vmax_desc") {
      list.sort((a, b) => b.historicalMax - a.historicalMax);
    } else if (vmaxSortBy === "nombre") {
      list.sort((a, b) => (a.jugador.apodo || a.jugador.nombre).localeCompare(b.jugador.apodo || b.jugador.nombre));
    }

    return list;
  }, [vmaxAnalysis, vmaxSearch, vmaxFilterPos, vmaxSortBy]);

  // Contadores de alerta de Vmax
  const vmaxStats = useMemo(() => {
    const optimo = vmaxAnalysis.filter((x) => x.status === "optimo").length;
    const alerta = vmaxAnalysis.filter((x) => x.status === "alerta").length;
    const riesgo = vmaxAnalysis.filter((x) => x.status === "riesgo").length;
    const sinDatos = vmaxAnalysis.filter((x) => x.status === "sin_datos").length;

    const maxTeamSpeed = vmaxAnalysis.length > 0 ? Math.max(...vmaxAnalysis.map((x) => x.historicalMax)) : 0;
    const fastestPlayer = vmaxAnalysis.find((x) => x.historicalMax === maxTeamSpeed);

    return { optimo, alerta, riesgo, sinDatos, maxTeamSpeed, fastestPlayer };
  }, [vmaxAnalysis]);


  // ── CÁLCULO DE ACWR (ACUTE:CHRONIC WORKLOAD RATIO) POR JUGADOR ──
  const acwrAnalysis = useMemo(() => {
    const refDateObj = new Date((selectedDate || latestGpsDate) + "T23:59:59");
    const acuteStart = new Date(refDateObj);
    acuteStart.setDate(acuteStart.getDate() - 7);

    const chronicStart = new Date(refDateObj);
    chronicStart.setDate(chronicStart.getDate() - 28);

    const realChronicRecords = gpsRecords.filter((r) => {
      if (acwrDataSource === "reales" && isRecordSimulado(r)) return false;
      if (!r.fecha) return false;
      const rDate = new Date(r.fecha + "T12:00:00");
      return rDate >= chronicStart && rDate <= refDateObj;
    });

    const distinctDates = Array.from(new Set(realChronicRecords.map((r) => r.fecha)));
    const totalDaysSpan = distinctDates.length > 0 ? Math.max(7, Math.min(28, distinctDates.length)) : 28;

    return jugadores.map((j) => {
      const playerRecords = realChronicRecords.filter((r) => r.jugador_id === j.id);

      let acuteLoad = 0;
      let acuteSessions = 0;
      let chronicTotal = 0;
      let chronicSessions = 0;

      playerRecords.forEach((r) => {
        const rDate = new Date(r.fecha + "T12:00:00");
        let val = 0;
        if (acwrMetric === "player_load") {
          val = Number(r.metricas?.["Player Load"] || r.player_load || 0);
        } else if (acwrMetric === "distancia") {
          val = Number(r.metricas?.["Distance(m)"] || r.distancia_total || 0);
        } else if (acwrMetric === "hsr") {
          val = Number(r.metricas?.["HSR Abs (m)"] || r.metricas?.hsr || r.distancia_z4 || 0);
        } else if (acwrMetric === "sprint") {
          val = Number(r.metricas?.["Sprint (m)"] || r.metricas?.sprint_m || (r.num_sprints ? r.num_sprints * 15 : 0));
        } else if (acwrMetric === "acc_dec") {
          val = Number(r.metricas?.["Accs Count"] || r.aceleraciones || 0) + Number(r.metricas?.["Decs Count"] || r.desaceleraciones || 0);
        }

        chronicTotal += val;
        chronicSessions++;

        if (rDate >= acuteStart && rDate <= refDateObj) {
          acuteLoad += val;
          acuteSessions++;
        }
      });

      const chronicWeekly = totalDaysSpan >= 28
        ? (chronicTotal / 4)
        : (chronicTotal / totalDaysSpan) * 7;

      const acwr = chronicWeekly > 0 ? Math.round((acuteLoad / chronicWeekly) * 100) / 100 : 0;

      let zone: "subentrenamiento" | "sweet_spot" | "precaucion" | "peligro" | "sin_datos" = "sin_datos";
      if (chronicWeekly > 0 || acuteLoad > 0) {
        if (acwr < 0.80) zone = "subentrenamiento";
        else if (acwr <= 1.30) zone = "sweet_spot";
        else if (acwr <= 1.50) zone = "precaucion";
        else zone = "peligro";
      }

      return {
        jugador: j,
        acuteLoad: Math.round(acuteLoad),
        acuteSessions,
        chronicWeekly: Math.round(chronicWeekly),
        chronicSessions,
        acwr,
        zone,
      };
    });
  }, [gpsRecords, jugadores, selectedDate, latestGpsDate, acwrMetric, acwrDataSource]);

  const filteredAcwrList = useMemo(() => {
    let list = acwrAnalysis.filter((item) => {
      const name = (item.jugador.apodo || item.jugador.nombre || "").toLowerCase();
      const pos = (item.jugador.posicion || "").toUpperCase();
      if (acwrSearch && !name.includes(acwrSearch.toLowerCase())) return false;
      if (acwrFilterPos !== "TODOS") {
        if (acwrFilterPos === "DEF" && !pos.includes("DEF") && !pos.includes("LAT") && !pos.includes("CEN")) return false;
        if (acwrFilterPos === "MED" && !pos.includes("MED") && !pos.includes("PIV") && !pos.includes("INT")) return false;
        if (acwrFilterPos === "DEL" && !pos.includes("DEL") && !pos.includes("EXT") && !pos.includes("PUN")) return false;
        if (acwrFilterPos === "POR" && !pos.includes("POR")) return false;
      }
      return true;
    });

    if (acwrSortBy === "riesgo_first") {
      const priority: Record<string, number> = { peligro: 1, precaucion: 2, subentrenamiento: 3, sweet_spot: 4, sin_datos: 5 };
      list.sort((a, b) => (priority[a.zone] || 9) - (priority[b.zone] || 9));
    } else if (acwrSortBy === "acwr_desc") {
      list.sort((a, b) => b.acwr - a.acwr);
    } else if (acwrSortBy === "acwr_asc") {
      list.sort((a, b) => a.acwr - b.acwr);
    } else if (acwrSortBy === "nombre") {
      list.sort((a, b) => (a.jugador.apodo || a.jugador.nombre).localeCompare(b.jugador.apodo || b.jugador.nombre));
    }

    return list;
  }, [acwrAnalysis, acwrSearch, acwrFilterPos, acwrSortBy]);

  const acwrStats = useMemo(() => {
    const sweetSpot = acwrAnalysis.filter((x) => x.zone === "sweet_spot").length;
    const sub = acwrAnalysis.filter((x) => x.zone === "subentrenamiento").length;
    const precaucion = acwrAnalysis.filter((x) => x.zone === "precaucion").length;
    const peligro = acwrAnalysis.filter((x) => x.zone === "peligro").length;
    return { sweetSpot, sub, precaucion, peligro };
  }, [acwrAnalysis]);

  // Jugador actualmente seleccionado para la vista individual
  const currentSelectedPlayer = useMemo(() => {
    const pId = acwrSelectedPlayerId || jugadores[0]?.id;
    return jugadores.find((j) => j.id === pId) || jugadores[0] || null;
  }, [acwrSelectedPlayerId, jugadores]);

  // Cálculo de la línea temporal día a día de Volumen y ACWR dinámico
  const acwrTimelineData = useMemo(() => {
    const targetGps = gpsRecords.filter((r) => (acwrDataSource === "reales" ? !isRecordSimulado(r) : true));
    if (targetGps.length === 0) return [];

    // Fechas únicas activas
    const distinctActiveDates = Array.from(new Set(targetGps.map((r) => r.fecha).filter(Boolean))).sort();
    if (distinctActiveDates.length === 0) return [];

    const minDateObj = new Date(distinctActiveDates[0] + "T12:00:00");
    const maxDateObj = new Date(distinctActiveDates[distinctActiveDates.length - 1] + "T12:00:00");

    // CALENDARIO CONTINUO: No saltarse días vacíos (días de descanso / OFF)
    const allCalendarDates: string[] = [];
    const cur = new Date(minDateObj);
    while (cur <= maxDateObj) {
      allCalendarDates.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }

    // Mapa de volumen y metadatos por fecha
    const dailyMap = new Map<string, { volumen: number; count: number; rawMd: string; normMd: string; isMatch: boolean; hasSession: boolean }>();

    allCalendarDates.forEach((dStr) => {
      const dayRecords = targetGps.filter((r) => r.fecha === dStr);
      const hasSession = dayRecords.length > 0;

      let vol = 0;
      let rawMd = "OFF";
      let isMatch = false;

      if (hasSession) {
        if (acwrViewMode === "individual") {
          const targetId = acwrSelectedPlayerId || jugadores[0]?.id;
          const pRecord = dayRecords.find((r) => r.jugador_id === targetId);
          vol = pRecord ? Math.round(getGpsMetricValue(pRecord, acwrVolumeMetric)) : 0;
          const pIsMatch = pRecord ? (
            String(pRecord.match_day || pRecord.md || "").toUpperCase() === "MD" ||
            pRecord.tipo_sesion === "PARTIDO" ||
            String(pRecord.sesion_nombre || "").toUpperCase().includes("PARTIDO")
          ) : false;
          isMatch = Boolean(pIsMatch);
          rawMd = pRecord ? (pRecord.match_day || pRecord.md || (pIsMatch ? "MD" : getSessionMd(dStr, dayRecords, targetId))) : "OFF";
        } else {
          // Equipo: si solo 1 jugador jugó partido, no altera la visión de equipo
          const teamSum = dayRecords.reduce((acc, r) => acc + getGpsMetricValue(r, acwrVolumeMetric), 0);
          vol = Math.round(teamSum / dayRecords.length);

          const matchPlayers = new Set(
            dayRecords
              .filter((r) =>
                String(r.match_day || r.md || "").toUpperCase() === "MD" ||
                r.tipo_sesion === "PARTIDO" ||
                String(r.sesion_nombre || "").toUpperCase().includes("PARTIDO")
              )
              .map((r) => r.jugador_id)
              .filter(Boolean)
          );
          const planMatch = (planificacionDays || []).some((d: any) => (d.fecha === dStr || d.id === dStr) && isMatchDaySession(d));
          isMatch = planMatch || matchPlayers.size > 1;
          rawMd = isMatch ? "MD" : getSessionMd(dStr, dayRecords);
        }
      }

      const normMd = hasSession ? normalizeMdType(rawMd, isMatch ? "PARTIDO" : undefined) : "OFF";
      dailyMap.set(dStr, { volumen: vol, count: dayRecords.length, rawMd, normMd, isMatch, hasSession });
    });

    // Historial por tipo MD para calcular variación vs anterior y vs 5 últimos
    const mdHistoryMap = new Map<string, Array<{ fecha: string; volumen: number }>>();

    const fullList = allCalendarDates.map((dStr) => {
      const info = dailyMap.get(dStr)!;

      let diffVsPrevSameMd: number | null = null;
      let labelVsPrevSameMd = "—";
      let prevSameMdDate: string | null = null;
      let prevSameMdVol: number | null = null;

      let diffVsLast5SameMd: number | null = null;
      let labelVsLast5SameMd = "—";
      let last5Avg: number | null = null;
      let last5Count = 0;

      if (info.hasSession && info.volumen > 0 && info.normMd !== "OFF") {
        const history = mdHistoryMap.get(info.normMd) || [];
        if (history.length > 0) {
          // 1. Vs anterior del mismo tipo MD
          const prevEntry = history[history.length - 1];
          prevSameMdDate = prevEntry.fecha;
          prevSameMdVol = prevEntry.volumen;
          if (prevEntry.volumen > 0) {
            diffVsPrevSameMd = Math.round(((info.volumen - prevEntry.volumen) / prevEntry.volumen) * 1000) / 10;
            labelVsPrevSameMd = (diffVsPrevSameMd >= 0 ? "+" : "") + diffVsPrevSameMd.toFixed(1) + "%";
          }

          // 2. Vs últimos 5 del mismo tipo MD
          const last5 = history.slice(-5);
          last5Count = last5.length;
          const sum5 = last5.reduce((acc, e) => acc + e.volumen, 0);
          last5Avg = Math.round(sum5 / last5Count);
          if (last5Avg > 0) {
            diffVsLast5SameMd = Math.round(((info.volumen - last5Avg) / last5Avg) * 1000) / 10;
            labelVsLast5SameMd = (diffVsLast5SameMd >= 0 ? "+" : "") + diffVsLast5SameMd.toFixed(1) + "%";
          }
        } else {
          labelVsPrevSameMd = "1º (Base)";
          labelVsLast5SameMd = "1º (Base)";
        }

        // Agregar al historial de este tipo MD
        if (!mdHistoryMap.has(info.normMd)) mdHistoryMap.set(info.normMd, []);
        mdHistoryMap.get(info.normMd)!.push({ fecha: dStr, volumen: info.volumen });
      }

      // Carga Aguda (7d) y Crónica (28d) sobre el calendario completo
      const dObj = new Date(dStr + "T12:00:00");
      const acuteStart = new Date(dObj.getTime() - 6 * 24 * 3600 * 1000);
      const chronicStart = new Date(dObj.getTime() - 27 * 24 * 3600 * 1000);

      let acuteSum = 0;
      let chronicSum = 0;

      for (const [otherDStr, entry] of dailyMap.entries()) {
        const otherObj = new Date(otherDStr + "T12:00:00");
        if (otherObj >= chronicStart && otherObj <= dObj) {
          chronicSum += entry.volumen;
        }
        if (otherObj >= acuteStart && otherObj <= dObj) {
          acuteSum += entry.volumen;
        }
      }

      const daysSpan = Math.max(7, Math.min(28, Math.round((dObj.getTime() - minDateObj.getTime()) / (24 * 3600 * 1000)) + 1));
      const chronicWeekly = daysSpan >= 28 ? Math.round(chronicSum / 4) : Math.round((chronicSum / daysSpan) * 7);
      const acwr = chronicWeekly > 0 ? Math.round((acuteSum / chronicWeekly) * 100) / 100 : 0;

      let zone: "subentrenamiento" | "sweet_spot" | "precaucion" | "peligro" = "sweet_spot";
      if (acwr < 0.8) zone = "subentrenamiento";
      else if (acwr <= 1.3) zone = "sweet_spot";
      else if (acwr <= 1.5) zone = "precaucion";
      else zone = "peligro";

      const parts = dStr.split("-");
      const dateLabel = `${parts[2]}/${parts[1]}`;
      const fullLabel = `${dateLabel}\n${info.normMd}\n${labelVsPrevSameMd}\n${labelVsLast5SameMd}`;

      return {
        fecha: dStr,
        dateLabel,
        fullLabel,
        md: info.normMd,
        normMd: info.normMd,
        isMatch: info.isMatch,
        hasSession: info.hasSession,
        volumen: info.volumen,
        diffVsPrevSameMd,
        labelVsPrevSameMd,
        prevSameMdDate,
        prevSameMdVol,
        diffVsLast5SameMd,
        labelVsLast5SameMd,
        last5Avg,
        last5Count,
        aguda7d: acuteSum,
        cronicaSemanal: chronicWeekly,
        acwr,
        zone,
        jugadoresCount: info.count,
        metricKey: acwrVolumeMetric,
      };
    });

    if (acwrTimeRange > 0 && fullList.length > 0) {
      const lastDate = new Date(fullList[fullList.length - 1].fecha + "T12:00:00");
      const cutoff = new Date(lastDate.getTime() - acwrTimeRange * 24 * 3600 * 1000);
      return fullList.filter((p) => new Date(p.fecha + "T12:00:00") >= cutoff);
    }

    return fullList;
  }, [gpsRecords, acwrViewMode, acwrSelectedPlayerId, acwrVolumeMetric, acwrTimeRange, jugadores, acwrDataSource, planificacionDays]);

  const currentTimelinePoint = useMemo(() => {
    if (acwrTimelineData.length === 0) return null;
    return acwrTimelineData[acwrTimelineData.length - 1];
  }, [acwrTimelineData]);

  // ── CALENDARIO BASE Y MEDIAS DE EQUIPO PARA TABLAS PLEGABLES POR JUGADOR ──
  const { playerCalendarDates, playerTeamDailyMap } = useMemo(() => {
    const targetGps = gpsRecords.filter((r) => (acwrDataSource === "reales" ? !isRecordSimulado(r) : true));
    if (targetGps.length === 0) return { playerCalendarDates: [] as string[], playerTeamDailyMap: new Map<string, any>() };

    const distinctActiveDates = Array.from(new Set(targetGps.map((r) => r.fecha).filter(Boolean))).sort();
    if (distinctActiveDates.length === 0) return { playerCalendarDates: [] as string[], playerTeamDailyMap: new Map<string, any>() };

    const minDateObj = new Date(distinctActiveDates[0] + "T12:00:00");
    const maxDateObj = new Date(distinctActiveDates[distinctActiveDates.length - 1] + "T12:00:00");

    const dates: string[] = [];
    const cur = new Date(minDateObj);
    while (cur <= maxDateObj) {
      dates.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }

    const tMap = new Map<string, { teamAvg: number; count: number; rawMd: string; normMd: string; isMatch: boolean; hasSession: boolean }>();
    dates.forEach((dStr) => {
      const dayRecords = targetGps.filter((r) => r.fecha === dStr);
      const hasSession = dayRecords.length > 0;
      let teamAvg = 0;
      let rawMd = "OFF";
      let isMatch = false;

      if (hasSession) {
        const teamSum = dayRecords.reduce((acc, r) => acc + getGpsMetricValue(r, acwrVolumeMetric), 0);
        teamAvg = Math.round(teamSum / dayRecords.length);

        const matchPlayers = new Set(
          dayRecords
            .filter((r) =>
              String(r.match_day || r.md || "").toUpperCase() === "MD" ||
              r.tipo_sesion === "PARTIDO" ||
              String(r.sesion_nombre || "").toUpperCase().includes("PARTIDO")
            )
            .map((r) => r.jugador_id)
            .filter(Boolean)
        );
        const planMatch = (planificacionDays || []).some((d: any) => (d.fecha === dStr || d.id === dStr) && isMatchDaySession(d));
        isMatch = planMatch || matchPlayers.size > 1;
        rawMd = isMatch ? "MD" : getSessionMd(dStr, dayRecords);
      }

      const normMd = hasSession ? normalizeMdType(rawMd, isMatch ? "PARTIDO" : undefined) : "OFF";
      tMap.set(dStr, { teamAvg, count: dayRecords.length, rawMd, normMd, isMatch, hasSession });
    });

    return { playerCalendarDates: dates, playerTeamDailyMap: tMap };
  }, [gpsRecords, acwrVolumeMetric, acwrDataSource, planificacionDays]);

  const togglePlayerAccordion = (id: string) => {
    setExpandedPlayerIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAllPlayerAccordions = () => {
    const next: Record<string, boolean> = {};
    filteredAcwrList.forEach((item) => {
      const pid = item.jugador?.id;
      if (pid) next[pid] = true;
    });
    setExpandedPlayerIds(next);
  };

  const collapseAllPlayerAccordions = () => {
    setExpandedPlayerIds({});
  };

  const getPlayerDetailedTimeline = (playerId: string) => {
    const targetGps = gpsRecords.filter((r) => (acwrDataSource === "reales" ? !isRecordSimulado(r) : true));
    if (playerCalendarDates.length === 0) return [];

    const minDateObj = new Date(playerCalendarDates[0] + "T12:00:00");

    const pDailyMap = new Map<string, { vol: number; hasSession: boolean; normMd: string; isMatch: boolean; record?: any }>();
    playerCalendarDates.forEach((dStr) => {
      const dayRecords = targetGps.filter((r) => r.fecha === dStr);
      const pRecord = dayRecords.find((r) => r.jugador_id === playerId);
      const teamInfo = playerTeamDailyMap.get(dStr);
      const hasSession = Boolean(pRecord);
      const vol = pRecord ? Math.round(getGpsMetricValue(pRecord, acwrVolumeMetric)) : 0;
      
      const pIsMatch = pRecord ? (
        String(pRecord.match_day || pRecord.md || "").toUpperCase() === "MD" ||
        pRecord.tipo_sesion === "PARTIDO" ||
        String(pRecord.sesion_nombre || "").toUpperCase().includes("PARTIDO")
      ) : false;
      const isMatch = Boolean(pIsMatch);
      const rawMd = pRecord?.match_day || pRecord?.md || (pIsMatch ? "MD" : (teamInfo?.rawMd || "OFF"));
      const normMd = hasSession ? normalizeMdType(rawMd, isMatch ? "PARTIDO" : undefined) : "OFF";
      pDailyMap.set(dStr, { vol, hasSession, normMd, isMatch, record: pRecord });
    });

    const mdHistoryMap = new Map<string, Array<{ fecha: string; volumen: number }>>();

    const timeline = playerCalendarDates.map((dStr) => {
      const pInfo = pDailyMap.get(dStr)!;
      const teamInfo = playerTeamDailyMap.get(dStr);

      let diffVsPrevSameMd: number | null = null;
      let labelVsPrevSameMd = "—";
      let diffVsLast5SameMd: number | null = null;
      let labelVsLast5SameMd = "—";

      if (pInfo.hasSession && pInfo.vol > 0 && pInfo.normMd !== "OFF") {
        const hist = mdHistoryMap.get(pInfo.normMd) || [];
        if (hist.length > 0) {
          const prev = hist[hist.length - 1];
          if (prev.volumen > 0) {
            diffVsPrevSameMd = Math.round(((pInfo.vol - prev.volumen) / prev.volumen) * 1000) / 10;
            labelVsPrevSameMd = (diffVsPrevSameMd >= 0 ? "+" : "") + diffVsPrevSameMd.toFixed(1) + "%";
          }
          const last5 = hist.slice(-5);
          const sum5 = last5.reduce((acc, e) => acc + e.volumen, 0);
          const avg5 = Math.round(sum5 / last5.length);
          if (avg5 > 0) {
            diffVsLast5SameMd = Math.round(((pInfo.vol - avg5) / avg5) * 1000) / 10;
            labelVsLast5SameMd = (diffVsLast5SameMd >= 0 ? "+" : "") + diffVsLast5SameMd.toFixed(1) + "%";
          }
        } else {
          labelVsPrevSameMd = "1º (Base)";
          labelVsLast5SameMd = "1º (Base)";
        }

        if (!mdHistoryMap.has(pInfo.normMd)) mdHistoryMap.set(pInfo.normMd, []);
        mdHistoryMap.get(pInfo.normMd)!.push({ fecha: dStr, volumen: pInfo.vol });
      }

      const dObj = new Date(dStr + "T12:00:00");
      const acuteStart = new Date(dObj.getTime() - 6 * 24 * 3600 * 1000);
      const chronicStart = new Date(dObj.getTime() - 27 * 24 * 3600 * 1000);

      let acuteSum = 0;
      let chronicSum = 0;
      for (const [otherD, otherInfo] of pDailyMap.entries()) {
        const otherObj = new Date(otherD + "T12:00:00");
        if (otherObj >= chronicStart && otherObj <= dObj) chronicSum += otherInfo.vol;
        if (otherObj >= acuteStart && otherObj <= dObj) acuteSum += otherInfo.vol;
      }

      const daysSpan = Math.max(7, Math.min(28, Math.round((dObj.getTime() - minDateObj.getTime()) / (24 * 3600 * 1000)) + 1));
      const chronicWeekly = daysSpan >= 28 ? Math.round(chronicSum / 4) : Math.round((chronicSum / daysSpan) * 7);
      const acwr = chronicWeekly > 0 ? Math.round((acuteSum / chronicWeekly) * 100) / 100 : 0;

      let zone: "subentrenamiento" | "sweet_spot" | "precaucion" | "peligro" = "sweet_spot";
      if (acwr < 0.8) zone = "subentrenamiento";
      else if (acwr <= 1.3) zone = "sweet_spot";
      else if (acwr <= 1.5) zone = "precaucion";
      else zone = "peligro";

      const teamAvg = teamInfo?.teamAvg || 0;
      let diffVsTeam: number | null = null;
      let labelVsTeam = "—";
      if (pInfo.hasSession && pInfo.vol > 0 && teamAvg > 0) {
        diffVsTeam = Math.round(((pInfo.vol - teamAvg) / teamAvg) * 1000) / 10;
        labelVsTeam = (diffVsTeam >= 0 ? "+" : "") + diffVsTeam.toFixed(1) + "%";
      }

      const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
      const dayName = dayNames[dObj.getDay()] || "";
      const p = dStr.split("-");
      const formattedDate = dayName + " " + p[2] + "/" + p[1];

      return {
        fecha: dStr,
        formattedDate,
        normMd: pInfo.normMd,
        isMatch: pInfo.isMatch,
        hasSession: pInfo.hasSession,
        volumen: pInfo.vol,
        teamAvg,
        labelVsTeam,
        diffVsTeam,
        labelVsPrevSameMd,
        diffVsPrevSameMd,
        labelVsLast5SameMd,
        diffVsLast5SameMd,
        acuteSum,
        chronicWeekly,
        acwr,
        zone,
      };
    });

    let filtered = timeline;
    if (playerTableFilterDays === "active") {
      filtered = filtered.filter((r) => r.hasSession && r.volumen > 0 && r.normMd !== "OFF");
    }

    if (playerTableOrder === "desc") {
      return [...filtered].reverse();
    }
    return filtered;
  };

  // ── 4. CÁLCULO DE PERFIL COMPETITIVO (BENCHMARK 100% MATCH METODOLÓGICO) ──
  // Utiliza el motor centralizado de app/lib/competitiveProfile.ts sincronizado con fichas individuales de deportistas
  const competitiveProfiles = useMemo(() => {
    return computeCompetitiveProfiles({
      gpsRecords,
      jugadores,
      customOverrides,
      availableFavVariables,
      derivedVariables,
    });
  }, [gpsRecords, jugadores, customOverrides, availableFavVariables, derivedVariables]);

  const filteredProfileJugadores = useMemo(() => {
    return jugadores.filter((j) => {
      if (profileSearch) {
        const name = (j.apodo || j.nombre || "").toLowerCase();
        const dorsalStr = String(j.dorsal || "");
        if (!name.includes(profileSearch.toLowerCase()) && !dorsalStr.includes(profileSearch)) return false;
      }
      if (profileFilterPos !== "TODOS") {
        const pos = (j.posicion || "").toUpperCase();
        if (profileFilterPos === "DEF" && !pos.includes("DEF") && !pos.includes("LAT") && !pos.includes("CEN")) return false;
        if (profileFilterPos === "MED" && !pos.includes("MED") && !pos.includes("PIV") && !pos.includes("INT")) return false;
        if (profileFilterPos === "DEL" && !pos.includes("DEL") && !pos.includes("EXT") && !pos.includes("PUN")) return false;
        if (profileFilterPos === "POR" && !pos.includes("POR")) return false;
      }
      if (profileFilterCategory !== "TODOS") {
        const p = competitiveProfiles.get(j.id);
        if (!p) return false;
        if (profileFilterCategory === "REALS" && !p.isReal) return false;
        if (profileFilterCategory === "ESTIMADOS" && p.category !== "estimado_45") return false;
        if (profileFilterCategory === "COPIADOS" && p.category !== "copiado_posicion") return false;
      }
      return true;
    });
  }, [jugadores, profileSearch, profileFilterPos, profileFilterCategory, competitiveProfiles]);

  const columnMinMaxMap = useMemo(() => {
    const map: Record<string, { min: number; max: number }> = {};
    displayedProfileKeys.forEach((k) => {
      const vals: number[] = [];
      filteredProfileJugadores.forEach((j) => {
        const p = competitiveProfiles.get(j.id);
        const val = p?.values ? (p.values as Record<string, any>)[k] : undefined;
        if (typeof val === "number" && !isNaN(val) && val > 0) {
          vals.push(val);
        }
      });
      if (vals.length > 0) {
        map[k] = { min: Math.min(...vals), max: Math.max(...vals) };
      } else {
        map[k] = { min: 0, max: 0 };
      }
    });

    if (showHsriColumn) {
      const hsriVals: number[] = [];
      filteredProfileJugadores.forEach((j) => {
        const p = competitiveProfiles.get(j.id);
        if (typeof window !== "undefined") {
          try {
            const assignedKey = localStorage.getItem(`player_hsri_var_${j.id}`);
            if (assignedKey && p?.values) {
              const val = p.values[assignedKey];
              if (typeof val === "number" && !isNaN(val) && val > 0) {
                hsriVals.push(val);
              }
            }
          } catch {}
        }
      });
      if (hsriVals.length > 0) {
        map["HSRI"] = { min: Math.min(...hsriVals), max: Math.max(...hsriVals) };
      } else {
        map["HSRI"] = { min: 0, max: 0 };
      }
    }

    return map;
  }, [displayedProfileKeys, filteredProfileJugadores, competitiveProfiles, showHsriColumn]);

  const getDemandBgColor = (val: number | undefined | null, key: string): string => {
    if (!showHeatmapColors || val === undefined || val === null || typeof val !== "number" || isNaN(val) || val <= 0) {
      return "transparent";
    }
    const range = columnMinMaxMap[key];
    if (!range || range.max <= range.min) return "transparent";

    const pct = Math.max(0, Math.min(1, (val - range.min) / (range.max - range.min)));
    // Escala deportiva suave y profesional de demanda relativa (Top 20% verde intenso, degradado hasta azul claro)
    if (pct >= 0.8) return "rgba(34, 197, 94, 0.28)";  // Verde vivo (demanda muy alta)
    if (pct >= 0.6) return "rgba(74, 222, 128, 0.18)"; // Verde claro (demanda alta)
    if (pct >= 0.4) return "rgba(250, 204, 21, 0.18)";  // Ámbar/dorado (demanda media)
    if (pct >= 0.2) return "rgba(147, 197, 253, 0.18)"; // Celeste (demanda moderada)
    return "rgba(224, 231, 255, 0.24)";                 // Índigo tenue (demanda baja)
  };

  // ── 5. CÁLCULO DE RATIOS SEMANALES (% MATCH DEMANDS) Y PLANIFICACIÓN POR SESIÓN ──
  const activeWeek = availableWeeks[selectedWeekIdx] || availableWeeks[0];

  // Aplica los ratios objetivos de sesión calculados empíricamente a partir de las medias reales del microciclo seleccionado
  const handleApplyEmpiricalMicrocycleRatios = (targetType: Exclude<MicrocycleType, "todos">) => {
    const dates = activeWeek?.dates || [];
    if (dates.length === 0) return;

    const mcs = extractMicrocyclesFromGpsData(gpsRecords, getStoredMicrocycles());

    const matchingRecords = (gpsRecords || []).filter((r) => {
      const isSim = Boolean(
        r.es_simulado ||
        r.metricas?.es_simulado ||
        String(r.tipo_registro || r.metricas?.tipo_registro || "").toUpperCase() === "SIMULADO" ||
        (r.metricas?.colC && String(r.metricas?.colC).toUpperCase().includes("SIMULA"))
      );
      if (isSim) return false;

      const mc = getMicrocycleForDate(r.fecha, mcs);
      if (!mc) return true;
      return (mc.tipo || "media") === targetType;
    });

    const matchRecords = matchingRecords.filter((r) => {
      const norm = normalizeMDColumn(r.match_day, r.tipo_sesion);
      return norm === "MD";
    });

    const matchBenchmarkMap: Record<string, number> = {};
    activeRatioKeys.forEach((k) => {
      const matchVals = matchRecords
        .map((r) => calculateGpsMetricValue(r.metricas || r, k, derivedVariables))
        .filter((v) => typeof v === "number" && !isNaN(v) && v > 0);
      if (matchVals.length > 0) {
        matchBenchmarkMap[k] = matchVals.reduce((a, b) => a + b, 0) / matchVals.length;
      } else {
        const compVals = Array.from(competitiveProfiles.values()).map((p) => p.values?.[k]).filter((v): v is number => typeof v === "number" && v > 0);
        matchBenchmarkMap[k] = compVals.length > 0 ? compVals.reduce((a, b) => a + b, 0) / compVals.length : 1;
      }
    });

    const newMap = { ...sessionRatioPlanMap };

    dates.forEach((dStr) => {
      const sMd = getSessionMd(dStr, gpsRecords.filter((r) => r.fecha === dStr));
      const normCol = normalizeMDColumn(sMd);
      newMap[dStr] = {};

      activeRatioKeys.forEach((k) => {
        const mdRecs = matchingRecords.filter((r) => normalizeMDColumn(r.match_day, r.tipo_sesion) === normCol);
        const vals = mdRecs
          .map((r) => calculateGpsMetricValue(r.metricas || r, k, derivedVariables))
          .filter((v) => typeof v === "number" && !isNaN(v) && v > 0);

        const bench = matchBenchmarkMap[k] || 1;

        if (vals.length > 0 && bench > 0) {
          const avgSession = vals.reduce((a, b) => a + b, 0) / vals.length;
          const ratio = avgSession / bench;
          newMap[dStr][k] = Math.max(0.05, Math.min(1.5, Math.round(ratio * 100) / 100));
        } else {
          const base = teamRatioTargets[k] ?? getDefaultRatioTargetForKey(k);
          newMap[dStr][k] = getSessionRatioTarget(dStr, sMd, k, base, dates.length);
        }
      });
    });

    handleSaveSessionRatioPlan(newMap);
  };

  // Helper para resolver el ratio objetivo planificado de una sesión o MD
  const getSessionRatioTarget = (
    dateStr: string,
    sessionMd: string,
    metricKey: string,
    weeklyTarget: number,
    totalDatesCount: number = 4
  ): number => {
    // 1. Target personalizado por fecha exacta
    if (sessionRatioPlanMap[dateStr]?.[metricKey] !== undefined) {
      return Number(sessionRatioPlanMap[dateStr][metricKey]);
    }
    // 2. Target personalizado por tipo MD
    const normMd = normalizeMdType(sessionMd);
    if (sessionRatioPlanMap[normMd]?.[metricKey] !== undefined) {
      return Number(sessionRatioPlanMap[normMd][metricKey]);
    }
    // 3. Ponderación estándar de microciclo según el tipo de MD
    const mdWeights: Record<string, number> = {
      "MD-4": 0.28,
      "-4 MD": 0.28,
      "MD-3": 0.38,
      "-3 MD": 0.38,
      "MD-2": 0.22,
      "-2 MD": 0.22,
      "MD-1": 0.12,
      "-1 MD": 0.12,
      "MD+1": 0.15,
      "+1 MD": 0.15,
      "MD": 1.0,
    };
    const weight = mdWeights[normMd] || (1 / Math.max(1, totalDatesCount));
    return Number((weeklyTarget * weight).toFixed(2));
  };

  // Cantidad de registros simulados en el microciclo activo
  const activeWeekSimulatedCount = useMemo(() => {
    if (!activeWeek || !activeWeek.dates || activeWeek.dates.length === 0) return 0;
    return (gpsRecords || []).filter((r: any) => (activeWeek.dates as string[]).includes(r.fecha) && isRecordSimulado(r)).length;
  }, [activeWeek, gpsRecords]);

  const weeklyRatiosData = useMemo(() => {
    if (!activeWeek || activeWeek.dates.length === 0) return [];

    // Fechas que se van a evaluar según el modo
    const effectiveSessionDate = (ratioEvaluationMode === "sesion" && selectedRatioSessionDate)
      ? selectedRatioSessionDate
      : (activeWeek.dates[activeWeek.dates.length - 1] || activeWeek.dates[0]);

    const targetDates = ratioEvaluationMode === "sesion"
      ? [effectiveSessionDate]
      : activeWeek.dates;

    const weekRecords = gpsRecords.filter((r) => {
      if (!targetDates.includes(r.fecha)) return false;
      if (ratioDataSource === "reales" && isRecordSimulado(r)) return false;
      return true;
    });

    const byPlayer = new Map<string, any[]>();
    weekRecords.forEach((r) => {
      if (!r.jugador_id) return;
      if (!byPlayer.has(r.jugador_id)) byPlayer.set(r.jugador_id, []);
      byPlayer.get(r.jugador_id)!.push(r);
    });

    return jugadores.map((j) => {
      const pRecs = byPlayer.get(j.id) || [];
      const pProfile = competitiveProfiles.get(j.id);

      let realSessionsCount = 0, simSessionsCount = 0;
      let weekMaxSpeed = 0;

      pRecs.forEach((r) => {
        if (isRecordSimulado(r)) simSessionsCount++;
        else realSessionsCount++;
        const spd = Number(r.metricas?.["MAX Speed(km/h)"] || r.max_speed || 0);
        if (spd > weekMaxSpeed) weekMaxSpeed = spd;
      });

      const sessionsCount = pRecs.length;
      const vAnalysis = vmaxAnalysis.find((x) => x.jugador.id === j.id);
      const histMax = vAnalysis ? vAnalysis.historicalMax : 30;
      const vmaxPct = histMax > 0 ? Math.round((weekMaxSpeed / histMax) * 100) : 0;

      const metrics: Record<string, {
        key: string;
        weekVal: number;
        benchmark: number;
        actualRatio: number;
        targetRatio: number;
        comp: ReturnType<typeof getTargetCompliance>;
        unit: string;
        label: string;
        shortTitle: string;
      }> = {};

      activeRatioKeys.forEach((key) => {
        const vDef = getGpsVariableDef(key);
        const nameObj = getVariableDisplayName(key, vDef);
        const isPeak = vDef?.esPicoMaximo || key.includes("MAX") || key.includes("Max");
        let weekVal = 0;

        pRecs.forEach((r) => {
          const val = calculateGpsMetricValue(r.metricas || r, key, derivedVariables);
          if (isPeak) {
            weekVal = Math.max(weekVal, val);
          } else {
            weekVal += val;
          }
        });

        // Benchmark de 1 partido del Perfil Competitivo
        let benchmark = 0;
        if (pProfile?.values && pProfile.values[key] !== undefined && pProfile.values[key] !== null) {
          benchmark = Number(pProfile.values[key]);
        }
        
        if (!benchmark || benchmark <= 0) {
          if (key === "Distance(m)") benchmark = pProfile?.dist || 10000;
          else if (key === "Distance +21 (m)" || key.includes("21") || key.toLowerCase().includes("hsr")) benchmark = pProfile?.hsr || 700;
          else if (key === "+28 km/h (Distancia)" || key.includes("28")) benchmark = pProfile?.values?.["+28 km/h (Distancia)"] || 20;
          else if (key === "+ 24 km/h (Distancia)" || (key.toLowerCase().includes("sprint") && !key.includes("28"))) benchmark = pProfile?.sprint || pProfile?.values?.["+ 24 km/h (Distancia)"] || 200;
          else if (key === "Sprints Count" || key.toLowerCase().includes("num_sprints")) benchmark = pProfile?.values?.["Sprints Count"] || 12;
          else if (key === "+28 km/h (Num)") benchmark = pProfile?.values?.["+28 km/h (Num)"] || 2;
          else if (key === "Acc+Dec") benchmark = pProfile?.accDec || 70;
          else if (key === "Player Load") benchmark = pProfile?.load || 800;
          else if (key === "Distancia / Min") benchmark = pProfile?.mMin || 110;
        }

        if (!benchmark || benchmark <= 0) benchmark = 1;

        const actualRatio = weekVal / benchmark;
        const baseWeeklyTarget = playerCustomTargets[j.id]?.[key] ?? (teamRatioTargets[key] ?? getDefaultRatioTargetForKey(key));
        
        // CÁLCULO DEL TARGET SEGÚN EL MODO DE EVALUACIÓN
        let targetRatio = baseWeeklyTarget;
        if (ratioEvaluationMode === "sesion") {
          // Objetivo específico de la sesión seleccionada
          const sMd = getSessionMd(effectiveSessionDate, gpsRecords.filter((r) => r.fecha === effectiveSessionDate));
          targetRatio = getSessionRatioTarget(effectiveSessionDate, sMd, key, baseWeeklyTarget, activeWeek.dates.length);
        } else if (ratioEvaluationMode === "progresivo") {
          // Objetivo progresivo acumulado: suma de los targets de las sesiones completadas a la fecha
          let cumulativeTarget = 0;
          activeWeek.dates.forEach((dStr) => {
            const sMd = getSessionMd(dStr, gpsRecords.filter((r) => r.fecha === dStr));
            cumulativeTarget += getSessionRatioTarget(dStr, sMd, key, baseWeeklyTarget, activeWeek.dates.length);
          });
          targetRatio = Number(cumulativeTarget.toFixed(2));
          if (targetRatio <= 0) targetRatio = baseWeeklyTarget;
        }

        const comp = getTargetCompliance(actualRatio, targetRatio);

        metrics[key] = {
          key,
          weekVal: isPeak || vDef?.unit === "m/min" || vDef?.unit === "km/h" ? Number(weekVal.toFixed(1)) : Math.round(weekVal),
          benchmark: Math.round(benchmark),
          actualRatio,
          targetRatio,
          comp,
          unit: vDef?.unit || (key === "Acc+Dec" ? "" : "m"),
          label: nameObj.full,
          shortTitle: nameObj.short,
        };
      });

      return {
        jugador: j,
        sessionsCount,
        realSessionsCount,
        simSessionsCount,
        weekMaxSpeed,
        vmaxPct,
        metrics,
      };
    });
  }, [
    activeWeek,
    gpsRecords,
    jugadores,
    competitiveProfiles,
    vmaxAnalysis,
    ratioDataSource,
    activeRatioKeys,
    teamRatioTargets,
    playerCustomTargets,
    derivedVariables,
    ratioEvaluationMode,
    selectedRatioSessionDate,
    sessionRatioPlanMap
  ]);

  const displayedWeeklyRatiosData = useMemo(() => {
    return weeklyRatiosData.filter((row) => !hiddenPlayerIds.includes(row.jugador.id));
  }, [weeklyRatiosData, hiddenPlayerIds]);

  const formatRatioVal = (ratio: number) => {
    if (ratioFormat === "multiplier") {
      return ratio.toFixed(2) + "x";
    }
    return ratio.toFixed(2) + "x (" + Math.round(ratio * 100) + "%)";
  };

  const getRatioBadgeStyle = (ratio: number, type: "dist" | "hsr" | "sprint" | "load") => {
    if (type === "sprint") {
      if (ratio < 0.75) return { bg: "#fee2e2", color: "#b91c1c", label: "⚠️ Subestímulo" };
      if (ratio <= 1.6) return { bg: "#dcfce7", color: "#15803d", label: "🟢 Óptimo" };
      return { bg: "#fef3c7", color: "#b45309", label: "⚡ Pico Alto" };
    }
    if (ratio < 1.0) return { bg: "#fee2e2", color: "#b91c1c", label: "Bajo" };
    if (ratio > 3.0) return { bg: "#ffedd5", color: "#c2410c", label: "Sobrecarga" };
    return { bg: "#eff6ff", color: "#1e40af", label: "Normal" };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* ── BARRA DE SUB-PESTAÑAS REPLANTEADA DE CARGA EXTERNA ── */}
      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "#ffffff",
          padding: "6px",
          borderRadius: "10px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => setSubTab("velocidad")}
          style={{
            flex: "1 1 180px",
            padding: "8px 14px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            background: subTab === "velocidad" ? "#1e3a8a" : "transparent",
            color: subTab === "velocidad" ? "#ffffff" : "#475569",
            border: "none",
            boxShadow: subTab === "velocidad" ? "0 2px 6px rgba(30,58,138,0.25)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>🚀</span> Velocidad & Vmax
        </button>

        <button
          type="button"
          onClick={() => setSubTab("acwr")}
          style={{
            flex: "1 1 180px",
            padding: "8px 14px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            background: subTab === "acwr" ? "#16a34a" : "transparent",
            color: subTab === "acwr" ? "#ffffff" : "#475569",
            border: "none",
            boxShadow: subTab === "acwr" ? "0 2px 6px rgba(22,163,74,0.25)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>⚖️</span> ACWR & Volumen Día a Día
        </button>


        <button
          type="button"
          onClick={() => setSubTab("ratios_semanales")}
          style={{
            flex: "1 1 180px",
            padding: "8px 14px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            background: (subTab === "ratios_semanales" || subTab === "perfil_competitivo") ? "#0284c7" : "transparent",
            color: (subTab === "ratios_semanales" || subTab === "perfil_competitivo") ? "#ffffff" : "#475569",
            border: "none",
            boxShadow: (subTab === "ratios_semanales" || subTab === "perfil_competitivo") ? "0 2px 6px rgba(2,132,199,0.25)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>📈</span> Ratios Semanales vs Partido
        </button>

        <button
          type="button"
          onClick={() => setSubTab("evolutivo")}
          style={{
            flex: "1 1 140px",
            padding: "8px 14px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            background: subTab === "evolutivo" ? "#9333ea" : "transparent",
            color: subTab === "evolutivo" ? "#ffffff" : "#475569",
            border: "none",
            boxShadow: subTab === "evolutivo" ? "0 2px 6px rgba(147,51,234,0.25)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>📈</span> Evolutivo
        </button>

        <button
          type="button"
          onClick={() => setSubTab("sesiones_bbdd")}
          style={{
            flex: "1 1 140px",
            padding: "8px 14px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            background: subTab === "sesiones_bbdd" ? "#334155" : "transparent",
            color: subTab === "sesiones_bbdd" ? "#ffffff" : "#64748b",
            border: "none",
            boxShadow: subTab === "sesiones_bbdd" ? "0 2px 6px rgba(51,65,85,0.25)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>📁</span> Sesiones & BBDD
        </button>
      </div>

      {/* ── SUB-PESTAÑA 1: VELOCIDAD & VMAX (90%) ── */}
      {subTab === "velocidad" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #cbd5e1", borderLeft: "4px solid #16a34a", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#16a34a", textTransform: "uppercase" }}>🟢 En Rango Óptimo (≤ 4 días)</span>
              <strong style={{ fontSize: "24px", fontWeight: 900, color: "#0f172a" }}>
                {vmaxStats.optimo} <small style={{ fontSize: "12px", color: "#64748b" }}>jugadores</small>
              </strong>
              <span style={{ fontSize: "11px", color: "#64748b" }}>Exposición neuromuscular reciente a ≥ {vmaxThresholdPct}% Vmax</span>
            </div>

            <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #cbd5e1", borderLeft: "4px solid #f59e0b", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#d97706", textTransform: "uppercase" }}>🟡 En Alerta (5 - 7 días)</span>
              <strong style={{ fontSize: "24px", fontWeight: 900, color: "#b45309" }}>
                {vmaxStats.alerta} <small style={{ fontSize: "12px", color: "#64748b" }}>jugadores</small>
              </strong>
              <span style={{ fontSize: "11px", color: "#64748b" }}>Requieren estímulo de velocidad antes de competir</span>
            </div>

            <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #cbd5e1", borderLeft: "4px solid #ef4444", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#dc2626", textTransform: "uppercase" }}>🔴 En Riesgo (&gt; 7 días)</span>
              <strong style={{ fontSize: "24px", fontWeight: 900, color: "#b91c1c" }}>
                {vmaxStats.riesgo} <small style={{ fontSize: "12px", color: "#64748b" }}>jugadores</small>
              </strong>
              <span style={{ fontSize: "11px", color: "#64748b" }}>Sin sprint a ≥ {vmaxThresholdPct}% Vmax en más de 1 semana</span>
            </div>

            <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #cbd5e1", borderLeft: "4px solid #1e3a8a", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", textTransform: "uppercase" }}>⚡ Vmax Máxima Equipo</span>
              <strong style={{ fontSize: "24px", fontWeight: 900, color: "#1e3a8a" }}>
                {vmaxStats.maxTeamSpeed.toFixed(1)} <small style={{ fontSize: "12px", color: "#64748b" }}>km/h</small>
              </strong>
              <span style={{ fontSize: "11px", color: "#475569", fontWeight: 700 }}>
                {vmaxStats.fastestPlayer ? (vmaxStats.fastestPlayer.jugador.apodo || vmaxStats.fastestPlayer.jugador.nombre) : "-"}
              </span>
            </div>
          </div>

          {/* BARRA DE HERRAMIENTAS Y FILTROS */}
          <div
            style={{
              background: "#ffffff",
              padding: "12px 16px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a" }}>
                🎯 Umbral de Velocidad:
              </span>
              {[85, 90, 95, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setVmaxThresholdPct(pct)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: vmaxThresholdPct === pct ? "1.5px solid #1e3a8a" : "1px solid #cbd5e1",
                    background: vmaxThresholdPct === pct ? "#eff6ff" : "#f8fafc",
                    color: vmaxThresholdPct === pct ? "#1e3a8a" : "#475569",
                    fontWeight: vmaxThresholdPct === pct ? 800 : 600,
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  {pct}% Vmax
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <select
                value={vmaxFilterPos}
                onChange={(e) => setVmaxFilterPos(e.target.value)}
                style={{
                  padding: "5px 8px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                <option value="TODOS">Todas las Posiciones</option>
                <option value="DEF">Defensas</option>
                <option value="MED">Centrocampistas</option>
                <option value="DEL">Delanteros</option>
                <option value="POR">Porteros</option>
              </select>

              <select
                value={vmaxSortBy}
                onChange={(e) => setVmaxSortBy(e.target.value as any)}
                style={{
                  padding: "5px 8px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                <option value="dias_desc">Ordenar: Días sin tocar (Mayor a menor)</option>
                <option value="vmax_desc">Ordenar: Vmax Histórica (Más rápido)</option>
                <option value="nombre">Ordenar: Nombre</option>
              </select>

              <input
                type="text"
                placeholder="Buscar jugador..."
                value={vmaxSearch}
                onChange={(e) => setVmaxSearch(e.target.value)}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "12px",
                  outline: "none",
                  width: "140px",
                }}
              />
            </div>
          </div>

          {/* TABLA PRINCIPAL DE VELOCIDAD & DIAS AL 90% */}
          <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #cbd5e1", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
                  Monitor de Exposición Neuromuscular (≥ {vmaxThresholdPct}% Vmax)
                </span>
                <span style={{ fontSize: "10.5px", fontWeight: 800, background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0", padding: "2px 8px", borderRadius: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span>🛡️</span> Datos 100% Reales (Simulados Excluidos)
                </span>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", background: "#e2e8f0", padding: "2px 8px", borderRadius: "12px" }}>
                  {filteredVmaxList.length} jugadores
                </span>
              </div>
              <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                Fecha ref: {latestGpsDate}
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", color: "#0f172a" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", textAlign: "left", color: "#475569", fontSize: "11px", textTransform: "uppercase" }}>
                    <th style={{ padding: "10px 12px" }}>Jugador</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Vmax Histórica</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Umbral ({vmaxThresholdPct}%)</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Último Sprint ≥ {vmaxThresholdPct}%</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Días sin tocar el {vmaxThresholdPct}%</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Estado / Alerta</th>
                    <th style={{ padding: "10px 12px", textAlign: "left" }}>Última Sesión Registrada</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVmaxList.map((item, idx) => {
                    const j = item.jugador;
                    const days = item.daysSinceHit;
                    const hit = item.hitRecord;

                    let badgeColor = "#64748b";
                    let badgeBg = "#f1f5f9";
                    let badgeText = "Sin Registro";
                    if (item.status === "optimo") {
                      badgeColor = "#15803d";
                      badgeBg = "#dcfce7";
                      badgeText = "🟢 Óptimo (Reciente)";
                    } else if (item.status === "alerta") {
                      badgeColor = "#b45309";
                      badgeBg = "#fef3c7";
                      badgeText = "🟡 Alerta (5 - 7 días)";
                    } else if (item.status === "riesgo") {
                      badgeColor = "#b91c1c";
                      badgeBg = "#fee2e2";
                      badgeText = "🔴 Riesgo (> 7 días)";
                    }

                    return (
                      <tr
                        key={j.id || idx}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          background: item.status === "riesgo" ? "rgba(254, 226, 226, 0.25)" : idx % 2 === 0 ? "#ffffff" : "#fcfcfd",
                        }}
                      >
                        {/* Jugador */}
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {renderDisponibilidadBadge && renderDisponibilidadBadge(j)}
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span style={{ fontWeight: 800, color: "#0f172a" }}>
                                {j.dorsal ? "#" + j.dorsal + " " : ""}{j.apodo || j.nombre}
                              </span>
                              <span style={{ fontSize: "10.5px", color: "#64748b" }}>
                                {j.posicion || "Jugador"}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Vmax Histórica */}
                        <td style={{ padding: "10px 10px", textAlign: "right" }}>
                          <strong style={{ fontSize: "13.5px", color: "#1e3a8a" }}>
                            {item.historicalMax > 0 ? item.historicalMax.toFixed(2) : "-"}
                          </strong>
                          <span style={{ fontSize: "10.5px", color: "#64748b", marginLeft: "3px" }}>km/h</span>
                        </td>

                        {/* Umbral 90% */}
                        <td style={{ padding: "10px 10px", textAlign: "right" }}>
                          <span style={{ fontWeight: 800, color: "#0f172a" }}>
                            {item.thresholdVal > 0 ? item.thresholdVal.toFixed(2) : "-"}
                          </span>
                          <span style={{ fontSize: "10.5px", color: "#64748b", marginLeft: "3px" }}>km/h</span>
                        </td>

                        {/* Último Sprint >= 90% */}
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          {hit ? (
                            <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
                              <span style={{ fontWeight: 800, color: "#0f172a" }}>
                                {hit.speed.toFixed(2)} km/h
                              </span>
                              <span style={{ fontSize: "10.5px", color: "#64748b" }}>
                                {hit.fecha} {hit.md ? "(" + hit.md + ")" : ""}
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>No alcanzado</span>
                          )}
                        </td>

                        {/* Días sin tocar */}
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          {days !== null ? (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              <span
                                style={{
                                  padding: "3px 9px",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  fontWeight: 900,
                                  background: days <= 4 ? "#dcfce7" : days <= 7 ? "#fef3c7" : "#fee2e2",
                                  color: days <= 4 ? "#15803d" : days <= 7 ? "#b45309" : "#b91c1c",
                                }}
                              >
                                {days === 0 ? "Hoy" : days === 1 ? "Hace 1 día" : "Hace " + days + " días"}
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>-</span>
                          )}
                        </td>

                        {/* Estado / Alerta */}
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: 800,
                              background: badgeBg,
                              color: badgeColor,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {badgeText}
                          </span>
                        </td>

                        {/* Última Sesión Registrada */}
                        <td style={{ padding: "10px 12px" }}>
                          {item.lastSessionRecord ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "120px" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px" }}>
                                <span style={{ fontWeight: 700, color: "#334155" }}>
                                  {item.lastSessionSpeed.toFixed(1)} km/h
                                </span>
                                <span style={{ fontWeight: 800, color: item.lastSessionPct >= vmaxThresholdPct ? "#15803d" : "#64748b" }}>
                                  {item.lastSessionPct}% Vmax
                                </span>
                              </div>
                              <div style={{ width: "100%", height: "5px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                                <div
                                  style={{
                                    width: Math.min(100, item.lastSessionPct) + "%",
                                    height: "100%",
                                    background: item.lastSessionPct >= vmaxThresholdPct ? "#16a34a" : item.lastSessionPct >= 80 ? "#f59e0b" : "#94a3b8",
                                  }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>Sin registros</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* LEYENDA DEL SEMÁFORO DE OBJETIVOS */}
            <div
              style={{
                padding: "10px 16px",
                borderTop: "1px solid #e2e8f0",
                background: "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
                fontSize: "11px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800, color: "#475569" }}>Leyenda Semáforo vs Ratios Exigidos:</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: "4px", fontWeight: 800 }}>
                  🟢 Cumplido (95% - 130% del objetivo)
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#fef3c7", color: "#b45309", padding: "2px 8px", borderRadius: "4px", fontWeight: 800 }}>
                  🟡 Parcial / En progreso (75% - 94%)
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#fee2e2", color: "#b91c1c", padding: "2px 8px", borderRadius: "4px", fontWeight: 800 }}>
                  🔴 No cumplido / Déficit (&lt;75%)
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#f3e8ff", color: "#7e22ce", padding: "2px 8px", borderRadius: "4px", fontWeight: 800 }}>
                  ⚡ Sobrecarga (&gt;130%)
                </span>
              </div>
              <div style={{ color: "#64748b", fontStyle: "italic" }}>
                * El semáforo compara el ratio alcanzado con el ratio exigido al equipo (o individualizado).
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── SUB-PESTAÑA ACWR (AGUDA : CRÓNICA DE GABBETT) ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {subTab === "acwr" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* ── BANNER 1: KPI CARDS RESUMEN DE CARGA & ACWR ACTUAL ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "12px" }}>
            {/* KPI 1: Volumen Última Sesión */}
            <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #cbd5e1", borderLeft: "4px solid #0284c7", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#0284c7", textTransform: "uppercase" }}>
                  📅 Última Sesión ({currentTimelinePoint?.md || currentTimelinePoint?.dateLabel || "—"})
                </span>
                <span style={{ fontSize: "10.5px", background: "#e0f2fe", color: "#0369a1", padding: "1px 6px", borderRadius: "4px", fontWeight: 800 }}>
                  {acwrViewMode === "equipo" ? "Media Equipo" : (currentSelectedPlayer?.apodo || currentSelectedPlayer?.nombre?.split(" ")[0] || "Individual")}
                </span>
              </div>
              <strong style={{ fontSize: "26px", fontWeight: 900, color: "#0f172a" }}>
                {currentTimelinePoint ? currentTimelinePoint.volumen.toLocaleString() : "—"}{" "}
                <small style={{ fontSize: "13px", color: "#64748b", fontWeight: 700 }}>{ACWR_METRIC_CONFIG[acwrVolumeMetric]?.unit}</small>
              </strong>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                {ACWR_METRIC_CONFIG[acwrVolumeMetric]?.label}: {currentTimelinePoint?.fecha || "Sin datos"}
              </span>
            </div>

            {/* KPI 2: Carga Aguda (7 días) */}
            <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #cbd5e1", borderLeft: "4px solid #0284c7", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#0369a1", textTransform: "uppercase" }}>
                ⚡ Carga Aguda (Últimos 7 días)
              </span>
              <strong style={{ fontSize: "26px", fontWeight: 900, color: "#0f172a" }}>
                {currentTimelinePoint ? currentTimelinePoint.aguda7d.toLocaleString() : "—"}{" "}
                <small style={{ fontSize: "13px", color: "#64748b", fontWeight: 700 }}>{ACWR_METRIC_CONFIG[acwrVolumeMetric]?.unit}</small>
              </strong>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                Fatiga aguda acumulada en la última semana
              </span>
            </div>

            {/* KPI 3: Carga Crónica Semanal (28 días) */}
            <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #cbd5e1", borderLeft: "4px solid #64748b", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>
                🛡️ Carga Crónica (Media Semanal 28d)
              </span>
              <strong style={{ fontSize: "26px", fontWeight: 900, color: "#0f172a" }}>
                {currentTimelinePoint ? currentTimelinePoint.cronicaSemanal.toLocaleString() : "—"}{" "}
                <small style={{ fontSize: "13px", color: "#64748b", fontWeight: 700 }}>{ACWR_METRIC_CONFIG[acwrVolumeMetric]?.unit}</small>
              </strong>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                Nivel de acondicionamiento y tolerancia
              </span>
            </div>

            {/* KPI 4: Ratio ACWR Actual */}
            <div style={{
              background: "#ffffff",
              padding: "14px 18px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              borderLeft: `4px solid ${
                !currentTimelinePoint ? "#cbd5e1" :
                currentTimelinePoint.zone === "sweet_spot" ? "#16a34a" :
                currentTimelinePoint.zone === "subentrenamiento" ? "#f59e0b" :
                currentTimelinePoint.zone === "precaucion" ? "#ea580c" : "#dc2626"
              }`,
              display: "flex",
              flexDirection: "column",
              gap: "4px"
            }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>
                ⚖️ Ratio ACWR Actual
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                <strong style={{ fontSize: "28px", fontWeight: 900, color: "#0f172a" }}>
                  {currentTimelinePoint ? currentTimelinePoint.acwr.toFixed(2) : "—"}
                </strong>
                {currentTimelinePoint && (
                  <span style={{
                    fontSize: "11px",
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background:
                      currentTimelinePoint.zone === "sweet_spot" ? "#dcfce7" :
                      currentTimelinePoint.zone === "subentrenamiento" ? "#fef3c7" :
                      currentTimelinePoint.zone === "precaucion" ? "#ffedd5" : "#fee2e2",
                    color:
                      currentTimelinePoint.zone === "sweet_spot" ? "#15803d" :
                      currentTimelinePoint.zone === "subentrenamiento" ? "#b45309" :
                      currentTimelinePoint.zone === "precaucion" ? "#c2410c" : "#b91c1c",
                  }}>
                    {currentTimelinePoint.zone === "sweet_spot" ? "🟢 Sweet Spot" :
                     currentTimelinePoint.zone === "subentrenamiento" ? "🟡 Subentrenamiento" :
                     currentTimelinePoint.zone === "precaucion" ? "🟠 Precaución" : "🔴 Peligro Spike"}
                  </span>
                )}
              </div>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                Objetivo Gabbett: Mantener entre 0.80 y 1.30
              </span>
            </div>
          </div>

          {/* ── BARRA DE CONTROLES: EQUIPO VS INDIVIDUAL & SELECTOR DE VARIABLE DE VOLUMEN ── */}
          <div
            style={{
              background: "#ffffff",
              padding: "14px 18px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {/* FILA 1: MODO EQUIPO VS INDIVIDUAL Y SELECTOR DE JUGADOR */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", borderBottom: "1px solid #f1f5f9", paddingBottom: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#0f172a" }}>
                  🎯 Modo de Vista:
                </span>
                
                {/* Switch de Botones Equipo / Individual */}
                <div style={{ display: "inline-flex", background: "#f1f5f9", padding: "3px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                  <button
                    type="button"
                    onClick={() => setAcwrViewMode("equipo")}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      border: "none",
                      fontSize: "12.5px",
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      background: acwrViewMode === "equipo" ? "#1e3a8a" : "transparent",
                      color: acwrViewMode === "equipo" ? "#ffffff" : "#475569",
                      boxShadow: acwrViewMode === "equipo" ? "0 2px 4px rgba(30,58,138,0.2)" : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span>👥</span> Versión Equipo (Promedio)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAcwrViewMode("individual");
                      if (!acwrSelectedPlayerId && jugadores.length > 0) {
                        setAcwrSelectedPlayerId(jugadores[0].id);
                      }
                    }}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      border: "none",
                      fontSize: "12.5px",
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      background: acwrViewMode === "individual" ? "#1e3a8a" : "transparent",
                      color: acwrViewMode === "individual" ? "#ffffff" : "#475569",
                      boxShadow: acwrViewMode === "individual" ? "0 2px 4px rgba(30,58,138,0.2)" : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span>👤</span> Versión Individual (Por Jugador)
                  </button>
                </div>

                {/* Si está en modo individual, mostrar selector de jugador */}
                {acwrViewMode === "individual" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>Jugador:</span>
                    <select
                      value={acwrSelectedPlayerId || (jugadores[0]?.id ?? "")}
                      onChange={(e) => setAcwrSelectedPlayerId(e.target.value)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "1.5px solid #2563eb",
                        background: "#eff6ff",
                        color: "#1e3a8a",
                        fontWeight: 800,
                        fontSize: "12.5px",
                        cursor: "pointer",
                        outline: "none",
                      }}
                    >
                      {jugadores.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.dorsal ? `#${j.dorsal} ` : ""}{j.apodo || j.nombre} ({j.posicion || "JUG"})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Selector Datos ACWR: Solo Reales vs Todos (Reales + Simulados) */}
              <div style={{ display: "inline-flex", alignItems: "center", background: "#f1f5f9", padding: "2px", borderRadius: "6px", gap: "2px" }}>
                <button
                  type="button"
                  onClick={() => handleSetAcwrDataSource("reales")}
                  style={{
                    padding: "4px 9px",
                    borderRadius: "4px",
                    border: "none",
                    background: acwrDataSource === "reales" ? "#ffffff" : "transparent",
                    color: acwrDataSource === "reales" ? "#0f172a" : "#64748b",
                    fontWeight: acwrDataSource === "reales" ? 700 : 500,
                    fontSize: "11.5px",
                    cursor: "pointer",
                    boxShadow: acwrDataSource === "reales" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                  title="Usar exclusivamente datos reales de GPS en ACWR (excluye registros simulados)"
                >
                  {acwrDataSource === "reales" && (
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#16a34a" }} />
                  )}
                  Solo Reales
                </button>
                <button
                  type="button"
                  onClick={() => handleSetAcwrDataSource("todos")}
                  style={{
                    padding: "4px 9px",
                    borderRadius: "4px",
                    border: "none",
                    background: acwrDataSource === "todos" ? "#ffffff" : "transparent",
                    color: acwrDataSource === "todos" ? "#0f172a" : "#64748b",
                    fontWeight: acwrDataSource === "todos" ? 700 : 500,
                    fontSize: "11.5px",
                    cursor: "pointer",
                    boxShadow: acwrDataSource === "todos" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                  title="Incluir todos los datos registrados en ACWR (reales y simulados)"
                >
                  {acwrDataSource === "todos" && (
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#0284c7" }} />
                  )}
                  Todos los Datos
                </button>
              </div>

              <div style={{ width: "1px", height: "16px", background: "#e2e8f0" }} />

              {/* Rango de tiempo para el gráfico */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#64748b" }}>Historial:</span>
                {[
                  { days: 14, label: "14 días" },
                  { days: 28, label: "28 días (4 sem)" },
                  { days: 60, label: "60 días" },
                  { days: 0, label: "Todo" },
                ].map((rng) => (
                  <button
                    key={rng.days}
                    type="button"
                    onClick={() => setAcwrTimeRange(rng.days)}
                    style={{
                      padding: "4px 9px",
                      borderRadius: "6px",
                      border: acwrTimeRange === rng.days ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
                      background: acwrTimeRange === rng.days ? "#dbeafe" : "#ffffff",
                      color: acwrTimeRange === rng.days ? "#1e3a8a" : "#64748b",
                      fontSize: "11.5px",
                      fontWeight: acwrTimeRange === rng.days ? 800 : 600,
                      cursor: "pointer",
                    }}
                  >
                    {rng.label}
                  </button>
                ))}
              </div>
            </div>

            {/* FILA 2: SELECTOR DE VARIABLE DE VOLUMEN (CHIPS INTERACTIVOS) */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: "4px" }}>
                <span>📊</span> Variable de Volumen:
              </span>
              {Object.entries(ACWR_METRIC_CONFIG).map(([k, cfg]) => {
                const isSelected = acwrVolumeMetric === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setAcwrVolumeMetric(k)}
                    title={cfg.desc}
                    style={{
                      padding: "5px 12px",
                      borderRadius: "8px",
                      border: isSelected ? `1.5px solid ${cfg.color}` : "1px solid #cbd5e1",
                      background: isSelected ? `${cfg.color}15` : "#f8fafc",
                      color: isSelected ? cfg.color : "#475569",
                      fontWeight: isSelected ? 800 : 600,
                      fontSize: "12px",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      boxShadow: isSelected ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: cfg.color }} />
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── CONTENEDOR PRINCIPAL: GRÁFICO DE VOLUMEN DÍA A DÍA CON RECHARTS ── */}
          <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #cbd5e1", padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
            {/* Cabecera del Gráfico */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 900, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>📈</span>
                  Evolución de Volumen Día a Día & ACWR —{" "}
                  <span style={{ color: "#0284c7" }}>
                    {acwrViewMode === "equipo" ? "Media del Equipo" : `#${currentSelectedPlayer?.dorsal || ""} ${currentSelectedPlayer?.apodo || currentSelectedPlayer?.nombre || "Jugador"}`}
                  </span>
                </h3>
                <span style={{ fontSize: "11.5px", color: "#64748b" }}>
                  Barras: Volumen diario ({ACWR_METRIC_CONFIG[acwrVolumeMetric]?.label}) · Líneas: Aguda (7d) y Crónica (28d) · Eje Derecho: Ratio ACWR con franja Sweet Spot
                </span>
              </div>

              {/* Badges de Referencia */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "11px", fontWeight: 800, background: "#dcfce7", color: "#15803d", padding: "3px 8px", borderRadius: "6px", border: "1px solid #bbf7d0" }}>
                  🟢 Sweet Spot: 0.80 - 1.30
                </span>
                <span style={{ fontSize: "11px", fontWeight: 800, background: "#fee2e2", color: "#b91c1c", padding: "3px 8px", borderRadius: "6px", border: "1px solid #fca5a5" }}>
                  🔴 Alerta Spike: &gt; 1.50
                </span>
              </div>
            </div>

            {/* GRÁFICO RECHARTS COMPOSED */}
            {acwrTimelineData.length === 0 ? (
              <div style={{ padding: "60px 20px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                No hay registros GPS reales en el rango temporal seleccionado.
              </div>
            ) : (
              <div style={{ width: "100%", height: 390 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={acwrTimelineData} margin={{ top: 15, right: 30, bottom: 25, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    
                    <XAxis
                      dataKey="fullLabel"
                      tick={<CustomXAxisTick />}
                      tickLine={false}
                      axisLine={{ stroke: "#cbd5e1" }}
                      height={58}
                    />
                    
                    {/* Eje Y1 (Izquierdo): Volumen Diario y Cargas */}
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11, fill: "#475569" }}
                      tickLine={false}
                      axisLine={{ stroke: "#cbd5e1" }}
                      tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
                    />

                    {/* Eje Y2 (Derecho): Ratio ACWR */}
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 2.0]}
                      ticks={[0, 0.5, 0.8, 1.0, 1.3, 1.5, 2.0]}
                      tick={{ fontSize: 10, fill: "#16a34a", fontWeight: 800 }}
                      tickLine={false}
                      axisLine={{ stroke: "#bbf7d0" }}
                      tickFormatter={(v) => Number(v).toFixed(1)}
                    />

                    <Tooltip content={<CustomAcwrTooltip />} />
                    
                    <Legend
                      wrapperStyle={{ fontSize: "11.5px", paddingTop: "12px", fontWeight: 700 }}
                    />

                    {/* Banda Sweet Spot (0.8 - 1.3) */}
                    <ReferenceArea
                      yAxisId="right"
                      y1={0.8}
                      y2={1.3}
                      fill="#22c55e"
                      fillOpacity={0.12}
                      stroke="#16a34a"
                      strokeOpacity={0.35}
                      strokeDasharray="4 4"
                    />

                    {/* Línea de Alerta Spike (> 1.5) */}
                    <ReferenceLine
                      yAxisId="right"
                      y={1.5}
                      stroke="#ef4444"
                      strokeDasharray="3 3"
                      strokeWidth={1.5}
                      label={{ value: "Alerta Spike (1.5)", fill: "#dc2626", fontSize: 10, position: "insideTopRight" }}
                    />

                    {/* BARRAS: Volumen Diario */}
                    <Bar
                      yAxisId="left"
                      dataKey="volumen"
                      name={`Volumen Día (${ACWR_METRIC_CONFIG[acwrVolumeMetric]?.unit})`}
                      fill={ACWR_METRIC_CONFIG[acwrVolumeMetric]?.color}
                      radius={[5, 5, 0, 0]}
                      maxBarSize={44}
                    >
                      {acwrTimelineData.map((entry, index) => {
                        const isMatch = Boolean(entry.isMatch);
                        const isOff = !entry.hasSession;
                        let barColor = ACWR_METRIC_CONFIG[acwrVolumeMetric]?.color || "#0284c7";

                        if (isMatch) {
                          barColor = "#dc2626"; // Crimson Red para Match Day
                        } else if (entry.md === "MD-1") {
                          barColor = "#38bdf8"; // Sky Blue para activación prepartido
                        } else if (entry.md === "MD+1" || entry.md === "MD+2") {
                          barColor = "#10b981"; // Emerald Green para recuperación
                        } else if (isOff) {
                          barColor = "#cbd5e1";
                        }

                        return (
                          <Cell
                            key={`cell-${index}`}
                            fill={barColor}
                            fillOpacity={isOff ? 0.2 : 0.88}
                          />
                        );
                      })}
                    </Bar>

                    {/* LÍNEA: Carga Aguda (7d) */}
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="aguda7d"
                      name="Carga Aguda (7d)"
                      stroke="#0284c7"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#0284c7" }}
                    />

                    {/* LÍNEA: Carga Crónica (Sem. 28d) */}
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="cronicaSemanal"
                      name="Carga Crónica (Sem. 28d)"
                      stroke="#64748b"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />

                    {/* LÍNEA: Ratio ACWR */}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="acwr"
                      name="Ratio ACWR"
                      stroke="#eab308"
                      strokeWidth={3}
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        if (!cx || !cy) return null;
                        let dotColor = "#16a34a";
                        if (payload.acwr < 0.8) dotColor = "#f59e0b";
                        else if (payload.acwr > 1.5) dotColor = "#ef4444";
                        else if (payload.acwr > 1.3) dotColor = "#ea580c";
                        return (
                          <circle
                            key={payload.fecha}
                            cx={cx}
                            cy={cy}
                            r={4.5}
                            fill={dotColor}
                            stroke="#ffffff"
                            strokeWidth={2}
                          />
                        );
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── FRANJA DE VARIACIÓN PORCENTUAL DEBAJO DEL GRÁFICO (vs Anterior Tipo MD & vs 5 Últimos Tipo MD) ── */}
            {acwrTimelineData.length > 0 && (
              <div
                style={{
                  marginTop: "16px",
                  paddingTop: "14px",
                  borderTop: "1px solid #e2e8f0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#0f172a" }}>
                      📊 Porcentajes de Cambio por Tipo de Sesión (MD):
                    </span>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>
                      Comparativa metodológica frente a sesiones del mismo tipo ({ACWR_METRIC_CONFIG[acwrVolumeMetric]?.label})
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "10.5px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#15803d", fontWeight: 700 }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e" }} />
                      Incremento Moderado (&le;20%)
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#b91c1c", fontWeight: 700 }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444" }} />
                      Pico / Spike (&gt;30%)
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#2563eb", fontWeight: 700 }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3b82f6" }} />
                      Descarga (&lt;0%)
                    </span>
                  </div>
                </div>

                {/* Tabla Horizontal Alineada con cada Día */}
                <div style={{ overflowX: "auto", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", textAlign: "center" }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9", borderBottom: "1.5px solid #cbd5e1" }}>
                        <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 800, color: "#334155", minWidth: "160px", background: "#e2e8f0" }}>
                          Métrica / Fecha
                        </th>
                        {acwrTimelineData.map((d) => (
                          <th key={d.fecha} style={{ padding: "8px 6px", fontWeight: 800, color: d.isMatch ? "#b91c1c" : !d.hasSession ? "#94a3b8" : "#0f172a", minWidth: "72px" }}>
                            <div>{d.dateLabel}</div>
                            <div style={{ fontSize: "10px", color: d.isMatch ? "#dc2626" : !d.hasSession ? "#94a3b8" : "#0284c7" }}>
                              {d.isMatch ? "⚽ MD" : d.md}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Fila 1: Volumen */}
                      <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
                        <td style={{ padding: "7px 10px", textAlign: "left", fontWeight: 700, color: "#475569", background: "#f8fafc" }}>
                          Volumen ({ACWR_METRIC_CONFIG[acwrVolumeMetric]?.unit})
                        </td>
                        {acwrTimelineData.map((d) => (
                          <td key={d.fecha} style={{ padding: "7px 6px", fontWeight: 800, color: !d.hasSession ? "#cbd5e1" : "#0f172a" }}>
                            {d.hasSession ? Number(d.volumen).toLocaleString() : "0 (OFF)"}
                          </td>
                        ))}
                      </tr>

                      {/* Fila 2: Δ% vs Anterior Mismo Tipo MD */}
                      <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
                        <td style={{ padding: "7px 10px", textAlign: "left", fontWeight: 800, color: "#0369a1", background: "#f8fafc" }}>
                          Δ% vs Ant. Mismo MD
                        </td>
                        {acwrTimelineData.map((d) => {
                          if (!d.hasSession || d.labelVsPrevSameMd === "—") {
                            return (
                              <td key={d.fecha} style={{ padding: "7px 6px", color: "#cbd5e1" }}>
                                —
                              </td>
                            );
                          }
                          const isBase = d.labelVsPrevSameMd === "1º (Base)";
                          const isSpike = d.diffVsPrevSameMd !== null && d.diffVsPrevSameMd > 30;
                          const isPos = d.diffVsPrevSameMd !== null && d.diffVsPrevSameMd > 0;
                          return (
                            <td key={d.fecha} style={{ padding: "7px 6px" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 5px",
                                  borderRadius: "4px",
                                  fontSize: "10px",
                                  fontWeight: 800,
                                  background: isBase ? "#f1f5f9" : isSpike ? "#fee2e2" : isPos ? "#dcfce7" : "#eff6ff",
                                  color: isBase ? "#64748b" : isSpike ? "#b91c1c" : isPos ? "#15803d" : "#2563eb",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {d.labelVsPrevSameMd}
                              </span>
                            </td>
                          );
                        })}
                      </tr>

                      {/* Fila 3: Δ% vs 5 Últimos Mismo Tipo MD */}
                      <tr style={{ background: "#ffffff" }}>
                        <td style={{ padding: "7px 10px", textAlign: "left", fontWeight: 800, color: "#b45309", background: "#f8fafc" }}>
                          Δ% vs 5 Últimos MD
                        </td>
                        {acwrTimelineData.map((d) => {
                          if (!d.hasSession || d.labelVsLast5SameMd === "—") {
                            return (
                              <td key={d.fecha} style={{ padding: "7px 6px", color: "#cbd5e1" }}>
                                —
                              </td>
                            );
                          }
                          const isBase = d.labelVsLast5SameMd === "1º (Base)";
                          const isSpike = d.diffVsLast5SameMd !== null && d.diffVsLast5SameMd > 30;
                          const isPos = d.diffVsLast5SameMd !== null && d.diffVsLast5SameMd > 0;
                          return (
                            <td key={d.fecha} style={{ padding: "7px 6px" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 5px",
                                  borderRadius: "4px",
                                  fontSize: "10px",
                                  fontWeight: 800,
                                  background: isBase ? "#f1f5f9" : isSpike ? "#fef3c7" : isPos ? "#fef9c3" : "#f1f5f9",
                                  color: isBase ? "#64748b" : isSpike ? "#b45309" : isPos ? "#854d0e" : "#475569",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {d.labelVsLast5SameMd}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ── BOTÓN Y TABLA DESPLEGABLE: MONITOR DETALLADO DE JUGADORES ── */}
          <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #cbd5e1", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
            <div
              style={{
                padding: "12px 18px",
                background: "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                userSelect: "none",
              }}
              onClick={() => setAcwrShowTable(!acwrShowTable)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a" }}>
                  {acwrShowTable ? "▼" : "▶"} Monitor de Jugadores ({filteredAcwrList.length})
                </span>
                <span style={{ fontSize: "11px", color: "#64748b" }}>
                  Desglose individual de carga aguda (7d), crónica (28d) y estado ACWR
                </span>
              </div>
              <span style={{ fontSize: "12px", color: "#2563eb", fontWeight: 800 }}>
                {acwrShowTable ? "Ocultar tabla" : "Ver tabla completa"}
              </span>
            </div>

            {acwrShowTable && (
              <div style={{ padding: "14px 18px", borderTop: "1px solid #e2e8f0" }}>
                {/* Filtros de la tabla */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <select
                      value={acwrFilterPos}
                      onChange={(e) => setAcwrFilterPos(e.target.value)}
                      style={{ padding: "5px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 700 }}
                    >
                      <option value="TODOS">Todas las Posiciones</option>
                      <option value="DEF">Defensas</option>
                      <option value="MED">Centrocampistas</option>
                      <option value="DEL">Delanteros</option>
                      <option value="POR">Porteros</option>
                    </select>

                    <select
                      value={acwrSortBy}
                      onChange={(e) => setAcwrSortBy(e.target.value as any)}
                      style={{ padding: "5px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 700 }}
                    >
                      <option value="riesgo_first">Ordenar: Riesgo primero (Peligro arriba)</option>
                      <option value="acwr_desc">Ordenar: ACWR Mayor a menor</option>
                      <option value="acwr_asc">Ordenar: ACWR Menor a mayor</option>
                      <option value="nombre">Ordenar: Nombre</option>
                    </select>
                  </div>

                  <input
                    type="text"
                    placeholder="Buscar jugador..."
                    value={acwrSearch}
                    onChange={(e) => setAcwrSearch(e.target.value)}
                    style={{ padding: "5px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", outline: "none", width: "150px" }}
                  />
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", color: "#0f172a" }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", textAlign: "left", color: "#475569", fontSize: "11px", textTransform: "uppercase" }}>
                        <th style={{ padding: "8px 12px" }}>Jugador</th>
                        <th style={{ padding: "8px 10px", textAlign: "right" }}>Carga Aguda (7d)</th>
                        <th style={{ padding: "8px 10px", textAlign: "right" }}>Carga Crónica (Sem. 28d)</th>
                        <th style={{ padding: "8px 12px", textAlign: "center" }}>Ratio ACWR</th>
                        <th style={{ padding: "8px 12px", textAlign: "center" }}>Estado / Zona</th>
                        <th style={{ padding: "8px 12px", textAlign: "left" }}>Acción Directa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAcwrList.map((item) => {
                        const j = item.jugador;
                        const r = item.acwr;

                        let badgeColor = "#64748b";
                        let badgeBg = "#f1f5f9";
                        let badgeText = "Sin datos";
                        if (item.zone === "sweet_spot") {
                          badgeColor = "#15803d";
                          badgeBg = "#dcfce7";
                          badgeText = "🟢 Sweet Spot (0.8 - 1.3)";
                        } else if (item.zone === "subentrenamiento") {
                          badgeColor = "#b45309";
                          badgeBg = "#fef3c7";
                          badgeText = "🟡 Subentrenamiento (< 0.8)";
                        } else if (item.zone === "precaucion") {
                          badgeColor = "#c2410c";
                          badgeBg = "#ffedd5";
                          badgeText = "🟠 Precaución (1.3 - 1.5)";
                        } else if (item.zone === "peligro") {
                          badgeColor = "#b91c1c";
                          badgeBg = "#fee2e2";
                          badgeText = "🔴 Peligro Spike (> 1.5)";
                        }

                        return (
                          <tr key={j.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                            <td style={{ padding: "8px 12px", fontWeight: 800 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                {j.dorsal && <span style={{ color: "#64748b", fontSize: "11px" }}>#{j.dorsal}</span>}
                                <span>{j.apodo || j.nombre}</span>
                                {j.posicion && <span style={{ color: "#94a3b8", fontSize: "10.5px" }}>({j.posicion})</span>}
                              </div>
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>
                              {item.acuteLoad.toLocaleString()}
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "right", color: "#64748b" }}>
                              {item.chronicWeekly.toLocaleString()}
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 900, fontSize: "13.5px" }}>
                              {r.toFixed(2)}
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "center" }}>
                              <span style={{ padding: "3px 8px", borderRadius: "12px", background: badgeBg, color: badgeColor, fontSize: "11px", fontWeight: 800, whiteSpace: "nowrap" }}>
                                {badgeText}
                              </span>
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setAcwrViewMode("individual");
                                  setAcwrSelectedPlayerId(j.id);
                                  window.scrollTo({ top: 300, behavior: "smooth" });
                                }}
                                style={{
                                  padding: "3px 8px",
                                  borderRadius: "4px",
                                  border: "1px solid #cbd5e1",
                                  background: "#f8fafc",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  color: "#1e3a8a",
                                }}
                              >
                                📊 Ver en Gráfico
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── SECCIÓN PLEGABLE: TABLAS SEPARADAS DE COMPARATIVA MATCHDAY ── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Barra de Controles Común */}
            <div
              style={{
                background: "#ffffff",
                padding: "12px 18px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", fontWeight: 800, color: "#1e3a8a", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>📊</span> Tablas Comparativas MatchDay ({filteredAcwrList.length} jugadores):
                </span>

                {/* Filtro: Días completos vs Solo activos */}
                <div style={{ display: "flex", alignItems: "center", background: "#f1f5f9", padding: "2px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                  <button
                    type="button"
                    onClick={() => setPlayerTableFilterDays("all")}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "4px",
                      border: "none",
                      fontSize: "11.5px",
                      fontWeight: playerTableFilterDays === "all" ? 800 : 600,
                      background: playerTableFilterDays === "all" ? "#1e3a8a" : "transparent",
                      color: playerTableFilterDays === "all" ? "#ffffff" : "#475569",
                      cursor: "pointer",
                    }}
                    title="Muestra todos los días del calendario continuo (con descansos OFF)"
                  >
                    Días completos (con OFF)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayerTableFilterDays("active")}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "4px",
                      border: "none",
                      fontSize: "11.5px",
                      fontWeight: playerTableFilterDays === "active" ? 800 : 600,
                      background: playerTableFilterDays === "active" ? "#1e3a8a" : "transparent",
                      color: playerTableFilterDays === "active" ? "#ffffff" : "#475569",
                      cursor: "pointer",
                    }}
                    title="Muestra únicamente días con sesión de entrenamiento o partido"
                  >
                    Solo sesiones activas
                  </button>
                </div>

                {/* Selector de orden: De derecha a izquierda vs De izquierda a derecha */}
                <button
                  type="button"
                  onClick={() => setPlayerTableOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1.5px solid #2563eb",
                    background: "#eff6ff",
                    fontSize: "11.5px",
                    fontWeight: 800,
                    cursor: "pointer",
                    color: "#1e3a8a",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  title="Cambia el orden de lectura de los días"
                >
                  <span>{playerTableOrder === "asc" ? "⬅️ Orden: De derecha a izquierda (Hoy a la dcha)" : "➡️ Orden: De izquierda a derecha (Hoy a la izq)"}</span>
                </button>
              </div>

              {/* Botones plegar / desplegar ambas */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setOpenTablePrevMd(true);
                    setOpenTableLast5Md(true);
                  }}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    cursor: "pointer",
                    color: "#334155",
                  }}
                >
                  📂 Desplegar ambas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenTablePrevMd(false);
                    setOpenTableLast5Md(false);
                  }}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    cursor: "pointer",
                    color: "#334155",
                  }}
                >
                  📁 Plegar ambas
                </button>
              </div>
            </div>

            {(() => {
              // Determinar la fecha actual / fecha de referencia
              const currentRefDate = latestGpsDate || selectedDate || "";

              // Preparar días del calendario para las columnas
              let activeDates = [...playerCalendarDates];
              if (playerTableFilterDays === "active") {
                activeDates = activeDates.filter((dStr) => {
                  const info = playerTeamDailyMap.get(dStr);
                  return info?.hasSession && info?.normMd !== "OFF";
                });
              }
              if (playerTableOrder === "desc") {
                activeDates.reverse();
              }

              // Preparar datos precalculados de cada jugador
              const playerMatrix = filteredAcwrList.map((item) => {
                const j = item.jugador;
                const timeline = getPlayerDetailedTimeline(j.id);
                const timelineMap = new Map<string, any>();
                timeline.forEach((r) => timelineMap.set(r.fecha, r));
                return {
                  jugador: j,
                  zone: item.zone,
                  acwr: item.acwr,
                  timelineMap,
                };
              });

              // Helper para micro badge de porcentaje de cambio (más pequeño para dar protagonismo al valor)
              const renderMicroBadge = (label: string, diff: number | null, isOff: boolean) => {
                if (isOff || label === "—" || !label) {
                  return <span style={{ color: "#cbd5e1", fontSize: "9.5px", lineHeight: 1 }}>—</span>;
                }
                if (label === "1º (Base)") {
                  return (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "1px 4px",
                        borderRadius: "2px",
                        background: "#f1f5f9",
                        color: "#64748b",
                        fontSize: "9px",
                        fontWeight: 800,
                        lineHeight: 1.1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Base
                    </span>
                  );
                }
                const isPos = diff !== null && diff >= 0;
                const isHighJump = diff !== null && diff > 20;
                const isLargeDrop = diff !== null && diff < -20;

                let bg = "#f0fdf4";
                let color = "#15803d";
                if (isHighJump) {
                  bg = "#fee2e2";
                  color = "#b91c1c";
                } else if (isLargeDrop) {
                  bg = "#ffedd5";
                  color = "#c2410c";
                } else if (!isPos) {
                  bg = "#eff6ff";
                  color = "#2563eb";
                }

                return (
                  <span
                    style={{
                      display: "inline-block",
                      padding: "1px 4px",
                      borderRadius: "2px",
                      background: bg,
                      color: color,
                      fontSize: "9.5px",
                      fontWeight: 800,
                      lineHeight: 1.1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </span>
                );
              };

              return (
                <>
                  {/* ════════════════════════════════════════════════════════════ */}
                  {/* ── TABLA 1: VS ANTERIOR MISMO MATCH DAY (MÁS GRANDE & SIN SCROLL) ── */}
                  {/* ════════════════════════════════════════════════════════════ */}
                  <div
                    style={{
                      background: "#ffffff",
                      borderRadius: "10px",
                      border: "1px solid #cbd5e1",
                      overflow: "hidden",
                      boxShadow: "0 2px 5px rgba(0,0,0,0.04)",
                    }}
                  >
                    {/* Cabecera Plegable Tabla 1 */}
                    <div
                      onClick={() => setOpenTablePrevMd((prev) => !prev)}
                      style={{
                        padding: "13px 18px",
                        background: "linear-gradient(to right, #eff6ff, #ffffff)",
                        borderBottom: openTablePrevMd ? "1px solid #bfdbfe" : "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "22px",
                            height: "22px",
                            borderRadius: "5px",
                            background: "#1e3a8a",
                            color: "#ffffff",
                            fontSize: "11px",
                            fontWeight: 900,
                          }}
                        >
                          {openTablePrevMd ? "▼" : "▶"}
                        </span>
                        <div>
                          <strong style={{ fontSize: "14px", color: "#1e3a8a", fontWeight: 800 }}>
                            🔄 1. Valor del Día & % Variación vs Anterior Sesión del Mismo MatchDay
                          </strong>
                          <span style={{ marginLeft: "10px", fontSize: "11.5px", color: "#64748b" }}>
                            Valor en {ACWR_METRIC_CONFIG[acwrVolumeMetric]?.unit} (grande) y % Δ respecto a la sesión previa del mismo MD (pequeño)
                          </span>
                        </div>
                      </div>
                      <span style={{ fontSize: "12px", color: "#2563eb", fontWeight: 700 }}>
                        {openTablePrevMd ? "Plegar tabla ▲" : "Desplegar tabla ▼"}
                      </span>
                    </div>

                    {/* Contenido Tabla 1 SIN SCROLL PROPIO (EXPANDIDA NATURALMENTE) */}
                    {openTablePrevMd && (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "12px", color: "#0f172a" }}>
                          <thead style={{ position: "sticky", top: 0, zIndex: 15 }}>
                            <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
                              {/* Columna fija Jugador (más amplia y legible) */}
                              <th
                                style={{
                                  padding: "9px 12px",
                                  textAlign: "left",
                                  fontSize: "11px",
                                  fontWeight: 900,
                                  textTransform: "uppercase",
                                  color: "#334155",
                                  background: "#f1f5f9",
                                  position: "sticky",
                                  left: 0,
                                  zIndex: 20,
                                  minWidth: "175px",
                                  maxWidth: "195px",
                                  borderRight: "2px solid #cbd5e1",
                                  boxShadow: "2px 0 4px rgba(0,0,0,0.03)",
                                }}
                              >
                                Jugador
                              </th>

                              {/* Columnas de Días */}
                              {activeDates.map((dStr) => {
                                const tInfo = playerTeamDailyMap.get(dStr);
                                const dObj = new Date(dStr + "T12:00:00");
                                const dayNames = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];
                                const dayName = dayNames[dObj.getDay()] || "";
                                const p = dStr.split("-");
                                const dateFormatted = dayName + " " + p[2] + "/" + p[1];
                                const isMatch = Boolean(tInfo?.isMatch);
                                const isOff = !tInfo?.hasSession || tInfo?.normMd === "OFF";
                                const isCurrentDay = dStr === currentRefDate;

                                let badgeBg = "#e0f2fe";
                                let badgeColor = "#0369a1";
                                let badgeText = tInfo?.normMd || "ENT";

                                if (isMatch) {
                                  badgeBg = "#dc2626";
                                  badgeColor = "#ffffff";
                                  badgeText = "⚽ MD";
                                } else if (tInfo?.normMd === "MD-1") {
                                  badgeBg = "#38bdf8";
                                  badgeColor = "#0c4a6e";
                                } else if (tInfo?.normMd === "MD+1" || tInfo?.normMd === "MD+2") {
                                  badgeBg = "#10b981";
                                  badgeColor = "#ffffff";
                                } else if (isOff) {
                                  badgeBg = "#e2e8f0";
                                  badgeColor = "#64748b";
                                  badgeText = "OFF";
                                }

                                return (
                                  <th
                                    key={dStr}
                                    style={{
                                      padding: "7px 8px",
                                      textAlign: "center",
                                      background: isCurrentDay ? "#dbeafe" : isMatch ? "#fee2e2" : "#f1f5f9",
                                      borderLeft: isCurrentDay ? "2px solid #2563eb" : undefined,
                                      borderRight: isCurrentDay ? "2px solid #2563eb" : "1px solid #e2e8f0",
                                      borderBottom: isCurrentDay ? "3px solid #2563eb" : "2px solid #cbd5e1",
                                      minWidth: isCurrentDay ? "84px" : "74px",
                                    }}
                                  >
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                      {/* BADGE DESTACADO DÍA ACTUAL */}
                                      {isCurrentDay && (
                                        <span
                                          style={{
                                            padding: "1px 5px",
                                            borderRadius: "3px",
                                            background: "#2563eb",
                                            color: "#ffffff",
                                            fontSize: "8.5px",
                                            fontWeight: 900,
                                            letterSpacing: "0.4px",
                                            textTransform: "uppercase",
                                            boxShadow: "0 1px 2px rgba(37,99,235,0.3)",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          📍 ACTUAL
                                        </span>
                                      )}

                                      <span
                                        style={{
                                          padding: "1px 6px",
                                          borderRadius: "3px",
                                          background: badgeBg,
                                          color: badgeColor,
                                          fontSize: "10px",
                                          fontWeight: 900,
                                        }}
                                      >
                                        {badgeText}
                                      </span>
                                      <span
                                        style={{
                                          fontSize: "10.5px",
                                          fontWeight: isCurrentDay ? 900 : 700,
                                          color: isCurrentDay ? "#1e3a8a" : isOff ? "#94a3b8" : "#475569",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {dateFormatted}
                                      </span>
                                    </div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>

                          <tbody>
                            {playerMatrix.map((item, idx) => {
                              const j = item.jugador;
                              const rowBg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";

                              return (
                                <tr key={j.id} style={{ background: rowBg, borderBottom: "1px solid #e2e8f0" }}>
                                  {/* Columna fija Jugador */}
                                  <td
                                    style={{
                                      padding: "8px 12px",
                                      background: rowBg,
                                      position: "sticky",
                                      left: 0,
                                      zIndex: 10,
                                      borderRight: "2px solid #cbd5e1",
                                      boxShadow: "2px 0 4px rgba(0,0,0,0.03)",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                                        <span
                                          style={{
                                            padding: "2px 6px",
                                            borderRadius: "4px",
                                            background: "#1e3a8a",
                                            color: "#ffffff",
                                            fontSize: "11px",
                                            fontWeight: 900,
                                          }}
                                        >
                                          #{j.dorsal || "—"}
                                        </span>
                                        <div style={{ display: "flex", flexDirection: "column" }}>
                                          <strong style={{ fontSize: "12.5px", color: "#0f172a", textOverflow: "ellipsis", overflow: "hidden" }}>
                                            {j.apodo || j.nombre}
                                          </strong>
                                          <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700 }}>
                                            {j.posicion || "JUG"}
                                          </span>
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAcwrViewMode("individual");
                                          setAcwrSelectedPlayerId(j.id);
                                          window.scrollTo({ top: 300, behavior: "smooth" });
                                        }}
                                        style={{
                                          padding: "3px 6px",
                                          borderRadius: "4px",
                                          border: "1px solid #cbd5e1",
                                          background: "#ffffff",
                                          fontSize: "11px",
                                          cursor: "pointer",
                                          color: "#1e3a8a",
                                        }}
                                        title="Ver en gráfico"
                                      >
                                        📊
                                      </button>
                                    </div>
                                  </td>

                                  {/* Celdas Tabla 1: VALOR DEL DÍA GRANDE + MICRO BADGE % */}
                                  {activeDates.map((dStr) => {
                                    const r = item.timelineMap.get(dStr);
                                    const isOff = !r?.hasSession || r?.normMd === "OFF";
                                    const isCurrentDay = dStr === currentRefDate;

                                    return (
                                      <td
                                        key={dStr}
                                        style={{
                                          padding: "7px 6px",
                                          textAlign: "center",
                                          borderLeft: isCurrentDay ? "2px solid #3b82f6" : undefined,
                                          borderRight: isCurrentDay ? "2px solid #3b82f6" : "1px solid #f1f5f9",
                                          background: isCurrentDay
                                            ? (r?.isMatch ? "#fee2e2" : "#eff6ff")
                                            : (r?.isMatch ? "#fff5f5" : isOff ? "#fafbfc" : "transparent"),
                                        }}
                                      >
                                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                          {/* Valor del día del jugador (algo más grande) */}
                                          <strong style={{ fontSize: "12.5px", fontWeight: 900, color: isOff ? "#94a3b8" : "#0f172a", lineHeight: 1.1 }}>
                                            {r && r.volumen > 0 ? r.volumen.toLocaleString() : "0"}
                                          </strong>

                                          {/* Porcentaje de cambio (disminuido de tamaño) */}
                                          {renderMicroBadge(r?.labelVsPrevSameMd || "—", r?.diffVsPrevSameMd ?? null, isOff)}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* ════════════════════════════════════════════════════════════ */}
                  {/* ── TABLA 2: VS 5 ÚLTIMOS MISMOS MATCH DAYS (MÁS GRANDE & SIN SCROLL) ── */}
                  {/* ════════════════════════════════════════════════════════════ */}
                  <div
                    style={{
                      background: "#ffffff",
                      borderRadius: "10px",
                      border: "1px solid #cbd5e1",
                      overflow: "hidden",
                      boxShadow: "0 2px 5px rgba(0,0,0,0.04)",
                    }}
                  >
                    {/* Cabecera Plegable Tabla 2 */}
                    <div
                      onClick={() => setOpenTableLast5Md((prev) => !prev)}
                      style={{
                        padding: "13px 18px",
                        background: "linear-gradient(to right, #faf5ff, #ffffff)",
                        borderBottom: openTableLast5Md ? "1px solid #e9d5ff" : "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "22px",
                            height: "22px",
                            borderRadius: "5px",
                            background: "#6b21a8",
                            color: "#ffffff",
                            fontSize: "11px",
                            fontWeight: 900,
                          }}
                        >
                          {openTableLast5Md ? "▼" : "▶"}
                        </span>
                        <div>
                          <strong style={{ fontSize: "14px", color: "#6b21a8", fontWeight: 800 }}>
                            📈 2. Valor del Día & % Variación vs Media de los 5 Últimos Mismos MatchDays
                          </strong>
                          <span style={{ marginLeft: "10px", fontSize: "11.5px", color: "#64748b" }}>
                            Valor en {ACWR_METRIC_CONFIG[acwrVolumeMetric]?.unit} (grande) y % Δ respecto a la media de 5 MD previos (pequeño)
                          </span>
                        </div>
                      </div>
                      <span style={{ fontSize: "12px", color: "#7e22ce", fontWeight: 700 }}>
                        {openTableLast5Md ? "Plegar tabla ▲" : "Desplegar tabla ▼"}
                      </span>
                    </div>

                    {/* Contenido Tabla 2 SIN SCROLL PROPIO (EXPANDIDA NATURALMENTE) */}
                    {openTableLast5Md && (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "12px", color: "#0f172a" }}>
                          <thead style={{ position: "sticky", top: 0, zIndex: 15 }}>
                            <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
                              {/* Columna fija Jugador (más amplia y legible) */}
                              <th
                                style={{
                                  padding: "9px 12px",
                                  textAlign: "left",
                                  fontSize: "11px",
                                  fontWeight: 900,
                                  textTransform: "uppercase",
                                  color: "#334155",
                                  background: "#f1f5f9",
                                  position: "sticky",
                                  left: 0,
                                  zIndex: 20,
                                  minWidth: "175px",
                                  maxWidth: "195px",
                                  borderRight: "2px solid #cbd5e1",
                                  boxShadow: "2px 0 4px rgba(0,0,0,0.03)",
                                }}
                              >
                                Jugador
                              </th>

                              {/* Columnas de Días */}
                              {activeDates.map((dStr) => {
                                const tInfo = playerTeamDailyMap.get(dStr);
                                const dObj = new Date(dStr + "T12:00:00");
                                const dayNames = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];
                                const dayName = dayNames[dObj.getDay()] || "";
                                const p = dStr.split("-");
                                const dateFormatted = dayName + " " + p[2] + "/" + p[1];
                                const isMatch = Boolean(tInfo?.isMatch);
                                const isOff = !tInfo?.hasSession || tInfo?.normMd === "OFF";
                                const isCurrentDay = dStr === currentRefDate;

                                let badgeBg = "#e0f2fe";
                                let badgeColor = "#0369a1";
                                let badgeText = tInfo?.normMd || "ENT";

                                if (isMatch) {
                                  badgeBg = "#dc2626";
                                  badgeColor = "#ffffff";
                                  badgeText = "⚽ MD";
                                } else if (tInfo?.normMd === "MD-1") {
                                  badgeBg = "#38bdf8";
                                  badgeColor = "#0c4a6e";
                                } else if (tInfo?.normMd === "MD+1" || tInfo?.normMd === "MD+2") {
                                  badgeBg = "#10b981";
                                  badgeColor = "#ffffff";
                                } else if (isOff) {
                                  badgeBg = "#e2e8f0";
                                  badgeColor = "#64748b";
                                  badgeText = "OFF";
                                }

                                return (
                                  <th
                                    key={dStr}
                                    style={{
                                      padding: "7px 8px",
                                      textAlign: "center",
                                      background: isCurrentDay ? "#dbeafe" : isMatch ? "#fee2e2" : "#f1f5f9",
                                      borderLeft: isCurrentDay ? "2px solid #2563eb" : undefined,
                                      borderRight: isCurrentDay ? "2px solid #2563eb" : "1px solid #e2e8f0",
                                      borderBottom: isCurrentDay ? "3px solid #2563eb" : "2px solid #cbd5e1",
                                      minWidth: isCurrentDay ? "84px" : "74px",
                                    }}
                                  >
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                      {/* BADGE DESTACADO DÍA ACTUAL */}
                                      {isCurrentDay && (
                                        <span
                                          style={{
                                            padding: "1px 5px",
                                            borderRadius: "3px",
                                            background: "#2563eb",
                                            color: "#ffffff",
                                            fontSize: "8.5px",
                                            fontWeight: 900,
                                            letterSpacing: "0.4px",
                                            textTransform: "uppercase",
                                            boxShadow: "0 1px 2px rgba(37,99,235,0.3)",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          📍 ACTUAL
                                        </span>
                                      )}

                                      <span
                                        style={{
                                          padding: "1px 6px",
                                          borderRadius: "3px",
                                          background: badgeBg,
                                          color: badgeColor,
                                          fontSize: "10px",
                                          fontWeight: 900,
                                        }}
                                      >
                                        {badgeText}
                                      </span>
                                      <span
                                        style={{
                                          fontSize: "10.5px",
                                          fontWeight: isCurrentDay ? 900 : 700,
                                          color: isCurrentDay ? "#1e3a8a" : isOff ? "#94a3b8" : "#475569",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {dateFormatted}
                                      </span>
                                    </div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>

                          <tbody>
                            {playerMatrix.map((item, idx) => {
                              const j = item.jugador;
                              const rowBg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";

                              return (
                                <tr key={j.id} style={{ background: rowBg, borderBottom: "1px solid #e2e8f0" }}>
                                  {/* Columna fija Jugador */}
                                  <td
                                    style={{
                                      padding: "8px 12px",
                                      background: rowBg,
                                      position: "sticky",
                                      left: 0,
                                      zIndex: 10,
                                      borderRight: "2px solid #cbd5e1",
                                      boxShadow: "2px 0 4px rgba(0,0,0,0.03)",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                                        <span
                                          style={{
                                            padding: "2px 6px",
                                            borderRadius: "4px",
                                            background: "#1e3a8a",
                                            color: "#ffffff",
                                            fontSize: "11px",
                                            fontWeight: 900,
                                          }}
                                        >
                                          #{j.dorsal || "—"}
                                        </span>
                                        <div style={{ display: "flex", flexDirection: "column" }}>
                                          <strong style={{ fontSize: "12.5px", color: "#0f172a", textOverflow: "ellipsis", overflow: "hidden" }}>
                                            {j.apodo || j.nombre}
                                          </strong>
                                          <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700 }}>
                                            {j.posicion || "JUG"}
                                          </span>
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAcwrViewMode("individual");
                                          setAcwrSelectedPlayerId(j.id);
                                          window.scrollTo({ top: 300, behavior: "smooth" });
                                        }}
                                        style={{
                                          padding: "3px 6px",
                                          borderRadius: "4px",
                                          border: "1px solid #cbd5e1",
                                          background: "#ffffff",
                                          fontSize: "11px",
                                          cursor: "pointer",
                                          color: "#1e3a8a",
                                        }}
                                        title="Ver en gráfico"
                                      >
                                        📊
                                      </button>
                                    </div>
                                  </td>

                                  {/* Celdas Tabla 2: VALOR DEL DÍA GRANDE + MICRO BADGE % */}
                                  {activeDates.map((dStr) => {
                                    const r = item.timelineMap.get(dStr);
                                    const isOff = !r?.hasSession || r?.normMd === "OFF";
                                    const isCurrentDay = dStr === currentRefDate;

                                    return (
                                      <td
                                        key={dStr}
                                        style={{
                                          padding: "7px 6px",
                                          textAlign: "center",
                                          borderLeft: isCurrentDay ? "2px solid #3b82f6" : undefined,
                                          borderRight: isCurrentDay ? "2px solid #3b82f6" : "1px solid #f1f5f9",
                                          background: isCurrentDay
                                            ? (r?.isMatch ? "#fee2e2" : "#eff6ff")
                                            : (r?.isMatch ? "#fff5f5" : isOff ? "#fafbfc" : "transparent"),
                                        }}
                                      >
                                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                          {/* Valor del día del jugador (algo más grande) */}
                                          <strong style={{ fontSize: "12.5px", fontWeight: 900, color: isOff ? "#94a3b8" : "#0f172a", lineHeight: 1.1 }}>
                                            {r && r.volumen > 0 ? r.volumen.toLocaleString() : "0"}
                                          </strong>

                                          {/* Porcentaje de cambio (disminuido de tamaño) */}
                                          {renderMicroBadge(r?.labelVsLast5SameMd || "—", r?.diffVsLast5SameMd ?? null, isOff)}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}


      {/* ── SUB-PESTAÑA UNIFICADA: RATIOS SEMANALES Y PERFIL COMPETITIVO ── */}
      {(subTab === "ratios_semanales" || subTab === "perfil_competitivo") && (() => {
        const activeInner = subTab === "perfil_competitivo" ? "perfil_competitivo" : ratiosInnerTab;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* BARRA DE PESTAÑITAS DENTRO DE RATIOS SEMANALES */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#ffffff",
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setSubTab("ratios_semanales");
                    setRatiosInnerTab("ratios");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 16px",
                    borderRadius: "7px",
                    border: "none",
                    background: activeInner === "ratios" ? "#0284c7" : "#f1f5f9",
                    color: activeInner === "ratios" ? "#ffffff" : "#475569",
                    fontSize: "12.5px",
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: activeInner === "ratios" ? "0 2px 6px rgba(2,132,199,0.3)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>📈</span> Ratios Semanales vs Partido (% Match)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSubTab("ratios_semanales");
                    setRatiosInnerTab("perfil_competitivo");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 16px",
                    borderRadius: "7px",
                    border: "none",
                    background: activeInner === "perfil_competitivo" ? "#ea580c" : "#f1f5f9",
                    color: activeInner === "perfil_competitivo" ? "#ffffff" : "#475569",
                    fontSize: "12.5px",
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: activeInner === "perfil_competitivo" ? "0 2px 6px rgba(234,88,12,0.3)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>🏆</span> Perfil Competitivo (Partido 100%)
                </button>
              </div>

              <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                {activeInner === "ratios"
                  ? "Cálculo de volumen semanal respecto al partido de referencia"
                  : "Demandas competitivas individuales oficiales (100% Match) por jugador"}
              </div>
            </div>

            {/* CONTENIDO DE LA PESTAÑITA ACTIVA */}
            {activeInner === "perfil_competitivo" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* BARRA SUPERIOR DISCRETA */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "8px",
              padding: "10px 14px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            {/* Título discreto */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <strong style={{ fontSize: "13.5px", color: "#0f172a" }}>
                Perfil Competitivo (100% Match)
              </strong>
              <span
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "2px 5px",
                  borderRadius: "4px",
                }}
              >
                1ª y 2ª parte
              </span>
            </div>

            {/* Selector de columnas favoritas y Filtros */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              {/* Buscador compacto */}
              <div style={{ position: "relative", minWidth: "160px" }}>
                <input
                  type="text"
                  placeholder="Buscar jugador..."
                  value={profileSearch}
                  onChange={(e) => setProfileSearch(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "4px 8px 4px 22px",
                    borderRadius: "5px",
                    border: "1px solid #cbd5e1",
                    fontSize: "11px",
                    outline: "none",
                    background: "#ffffff",
                  }}
                />
                <span style={{ position: "absolute", left: "6px", top: "4px", fontSize: "10px", color: "#94a3b8" }}>🔍</span>
              </div>

              {/* Filtro Posición */}
              <select
                value={profileFilterPos}
                onChange={(e) => setProfileFilterPos(e.target.value)}
                style={{
                  padding: "4px 6px",
                  borderRadius: "5px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#334155",
                  cursor: "pointer",
                }}
              >
                <option value="TODOS">Pos: Todas</option>
                <option value="DEF">Defensas</option>
                <option value="MED">Centrocampistas</option>
                <option value="DEL">Delanteros</option>
                <option value="POR">Porteros</option>
              </select>

              {/* Filtro Fiabilidad */}
              <select
                value={profileFilterCategory}
                onChange={(e) => setProfileFilterCategory(e.target.value)}
                style={{
                  padding: "4px 6px",
                  borderRadius: "5px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#334155",
                  cursor: "pointer",
                }}
              >
                <option value="TODOS">Método: Todos</option>
                <option value="REALS">90' Oficiales</option>
                <option value="ESTIMADOS">Estimados (*)</option>
                <option value="COPIADOS">Copiados (**)</option>
              </select>

              {/* Botón Toggle Colores / Mapa de Calor */}
              <button
                type="button"
                onClick={() => {
                  setShowHeatmapColors((prev) => {
                    const next = !prev;
                    if (typeof window !== "undefined") {
                      try {
                        localStorage.setItem("gps_profile_show_heatmap", String(next));
                      } catch {}
                    }
                    return next;
                  });
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "4px 9px",
                  borderRadius: "5px",
                  border: showHeatmapColors ? "1px solid #0284c7" : "1px solid #cbd5e1",
                  background: showHeatmapColors ? "#e0f2fe" : "#ffffff",
                  color: showHeatmapColors ? "#0369a1" : "#64748b",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                title={showHeatmapColors ? "Quitar colores de fondo de demanda" : "Mostrar colores de fondo de demanda"}
              >
                <span style={{ fontSize: "11px" }}>{showHeatmapColors ? "🎨" : "⚪"}</span>
                <span>Colores: {showHeatmapColors ? "ON" : "OFF"}</span>
              </button>

              {/* Botón Toggle HSRI (HSR Individualizada) */}
              <button
                type="button"
                onClick={() => {
                  setShowHsriColumn((prev) => {
                    const next = !prev;
                    if (typeof window !== "undefined") {
                      try {
                        localStorage.setItem("gps_profile_show_hsri", String(next));
                      } catch {}
                    }
                    return next;
                  });
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "4px 9px",
                  borderRadius: "5px",
                  border: showHsriColumn ? "1px solid #16a34a" : "1px solid #cbd5e1",
                  background: showHsriColumn ? "#f0fdf4" : "#ffffff",
                  color: showHsriColumn ? "#15803d" : "#475569",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                title={showHsriColumn ? "Ocultar columna HSRI (Individualizada)" : "Mostrar columna HSRI (Individualizada por jugador)"}
              >
                <span style={{ fontSize: "11px" }}>{showHsriColumn ? "⚡" : "⚪"}</span>
                <span>HSRI: {showHsriColumn ? "ON" : "OFF"}</span>
              </button>

              {/* Botón Discreto para Variables */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setShowColumnPicker((prev) => !prev)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 8px",
                    borderRadius: "5px",
                    border: showColumnPicker ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
                    background: showColumnPicker ? "#f1f5f9" : "#ffffff",
                    color: "#1e3a8a",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  title="Configurar columnas visibles"
                >
                  <span>⭐ Variables ({selectedProfileKeys.length})</span>
                  <span style={{ fontSize: "8px" }}>{showColumnPicker ? "▲" : "▼"}</span>
                </button>

                {showColumnPicker && (
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 4px)",
                      zIndex: 50,
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
                      padding: "12px",
                      width: "360px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                      <strong style={{ fontSize: "12px", color: "#0f172a" }}>Variables del Perfil</strong>
                      <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700 }}>
                        {selectedProfileKeys.length} seleccionadas
                      </span>
                    </div>

                    {/* Buscador de variable */}
                    <div style={{ position: "relative" }}>
                      <input
                        type="text"
                        placeholder="Buscar por nombre o unidad (ej. m, km/h, hsr)..."
                        value={columnPickerSearch}
                        onChange={(e) => setColumnPickerSearch(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "5px 8px 5px 24px",
                          borderRadius: "5px",
                          border: "1px solid #cbd5e1",
                          fontSize: "11px",
                          outline: "none",
                          background: "#f8fafc",
                          boxSizing: "border-box",
                        }}
                      />
                      <span style={{ position: "absolute", left: "7px", top: "5px", fontSize: "10px", color: "#94a3b8" }}>🔍</span>
                      {columnPickerSearch && (
                        <button
                          type="button"
                          onClick={() => setColumnPickerSearch("")}
                          style={{ position: "absolute", right: "6px", top: "4px", background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#94a3b8" }}
                        >✕</button>
                      )}
                    </div>

                    {/* Selector de origen: Favoritas vs Todas de Ajustes */}
                    <div style={{ display: "flex", gap: "4px", background: "#f1f5f9", padding: "2px", borderRadius: "6px" }}>
                      <button
                        type="button"
                        onClick={() => setColumnPickerTab("favoritas")}
                        style={{
                          flex: 1,
                          padding: "3px 6px",
                          borderRadius: "4px",
                          border: "none",
                          background: columnPickerTab === "favoritas" ? "#ffffff" : "transparent",
                          color: columnPickerTab === "favoritas" ? "#1e3a8a" : "#64748b",
                          fontWeight: 700,
                          fontSize: "10.5px",
                          cursor: "pointer",
                          boxShadow: columnPickerTab === "favoritas" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                        }}
                      >
                        ⭐ Favoritas ({availableFavVariables.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setColumnPickerTab("todas")}
                        style={{
                          flex: 1,
                          padding: "3px 6px",
                          borderRadius: "4px",
                          border: "none",
                          background: columnPickerTab === "todas" ? "#ffffff" : "transparent",
                          color: columnPickerTab === "todas" ? "#1e3a8a" : "#64748b",
                          fontWeight: 700,
                          fontSize: "10.5px",
                          cursor: "pointer",
                          boxShadow: columnPickerTab === "todas" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                        }}
                      >
                        📋 Todas de Ajustes ({allVariables.length})
                      </button>
                    </div>

                    {/* Presets rápidos */}
                    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                      <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>Presets:</span>
                      <button
                        type="button"
                        onClick={() => handleSetPresetColumns(["Distance(m)", "Distancia / Min", "Distance +21 (m)", "Acc+Dec", "Player Load"])}
                        style={{ padding: "2px 6px", borderRadius: "3px", border: "1px solid #e2e8f0", background: "#ffffff", fontSize: "10px", color: "#334155", cursor: "pointer", fontWeight: 700 }}
                      >
                        Top 5
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetPresetColumns(availableFavVariables.map((v) => v.key))}
                        style={{ padding: "2px 6px", borderRadius: "3px", border: "1px solid #e2e8f0", background: "#ffffff", fontSize: "10px", color: "#334155", cursor: "pointer", fontWeight: 700 }}
                      >
                        Todas Favs
                      </button>
                    </div>

                    {/* Lista con nomenclatura idéntica a Ajustes */}
                    <div style={{ maxHeight: "220px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px", border: "1px solid #f1f5f9", borderRadius: "5px", padding: "4px" }}>
                      {pickerVariablesList.length === 0 ? (
                        <div style={{ padding: "12px", textAlign: "center", color: "#94a3b8", fontSize: "11px" }}>
                          No se encontraron variables con "{columnPickerSearch}"
                        </div>
                      ) : (
                        pickerVariablesList.map((v) => {
                          const isChecked = selectedProfileKeys.includes(v.key);
                          return (
                            <label
                              key={v.key}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "8px",
                                padding: "4px 6px",
                                borderRadius: "4px",
                                background: isChecked ? "#eff6ff" : "transparent",
                                cursor: "pointer",
                                transition: "background-color 0.1s ease",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0, flex: 1 }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleColumn(v.key)}
                                  style={{ cursor: "pointer", flexShrink: 0 }}
                                />
                                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  <span style={{ fontSize: "11px", fontWeight: isChecked ? 800 : 600, color: isChecked ? "#1e40af" : "#0f172a" }}>
                                    {v.label}
                                  </span>
                                  {v.categoria && (
                                    <span style={{ fontSize: "9px", color: "#94a3b8", marginLeft: "4px" }}>
                                      • {v.categoria}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {v.unit && (
                                <span
                                  style={{
                                    fontSize: "9.5px",
                                    fontWeight: 700,
                                    padding: "1px 5px",
                                    borderRadius: "3px",
                                    background: isChecked ? "#dbeafe" : "#f1f5f9",
                                    color: isChecked ? "#1e40af" : "#475569",
                                    flexShrink: 0,
                                  }}
                                >
                                  {v.unit}
                                </span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>

                    <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                        Misma nomenclatura que Ajustes
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowColumnPicker(false)}
                        style={{ padding: "3px 8px", borderRadius: "4px", background: "#0f172a", color: "#ffffff", fontSize: "10.5px", fontWeight: 700, border: "none", cursor: "pointer" }}
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TABLA DE PERFILES COMPETITIVOS DISCRETA Y ELEGANTE */}
          <div style={{ background: "#ffffff", borderRadius: "8px", border: "1px solid #cbd5e1", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", color: "#0f172a" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1.5px solid #cbd5e1", textAlign: "left", color: "#475569", fontSize: "10.5px", textTransform: "uppercase" }}>
                    <th style={{ padding: "8px 10px", minWidth: "140px" }}>Jugador</th>
                    <th style={{ padding: "8px 2px", textAlign: "center", width: "38px", minWidth: "38px", fontSize: "9px", letterSpacing: "0.2px" }}>
                      MÉT.
                    </th>
                    <th style={{ padding: "8px 2px", textAlign: "center", width: "44px", minWidth: "44px", fontSize: "9px" }}>
                      PART.
                    </th>
                    {displayedProfileKeys.map((key) => {
                      const v = availableFavVariables.find((item) => item.key === key);
                      const label = getCompactMetricHeader(key, v ? v.label : key);
                      return (
                        <th
                          key={key}
                          style={{
                            padding: "8px 10px",
                            textAlign: "right",
                            color: "#334155",
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                            minWidth: "75px",
                          }}
                        >
                          {label}
                        </th>
                      );
                    })}
                    {showHsriColumn && (
                      <th
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          color: "#166534",
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                          minWidth: "75px",
                          background: "#f0fdf4",
                        }}
                        title="High Speed Running Individualizada por jugador"
                      >
                        ⚡ HSRI
                      </th>
                    )}
                    <th style={{ padding: "8px 8px", textAlign: "center", width: "40px", minWidth: "40px" }}>Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProfileJugadores.map((j, idx) => {
                    const p = competitiveProfiles.get(j.id) || {
                      values: {} as Record<string, any>,
                      category: "copiado_posicion" as const,
                      isReal: false,
                      shortBadgeText: "Pos.**",
                      badgeText: "Posición **",
                      detailText: "Sin partidos",
                      asterisk: "**",
                      matchesCount: 0,
                      fullMatchesCount: 0,
                      dist: 0,
                    };

                    let badgeBg = "#f1f5f9";
                    let badgeColor = "#334155";
                    if (p.category === "estimado_45") {
                      badgeBg = "#fefce8";
                      badgeColor = "#854d0e";
                    } else if (p.category === "copiado_posicion") {
                      badgeBg = "#fff7ed";
                      badgeColor = "#9a3412";
                    } else if (p.category === "sin_perfil") {
                      badgeBg = "#f8fafc";
                      badgeColor = "#94a3b8";
                    }

                    return (
                      <tr key={j.id || idx} style={{ borderBottom: "1px solid #f1f5f9", background: idx % 2 === 0 ? "#ffffff" : "#fbfcfd" }}>
                        {/* Jugador */}
                        <td style={{ padding: "7px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {renderDisponibilidadBadge && renderDisponibilidadBadge(j)}
                            <span
                              style={{
                                padding: "1px 4px",
                                borderRadius: "3px",
                                background: "#1e3a8a",
                                color: "#ffffff",
                                fontSize: "10px",
                                fontWeight: 900,
                              }}
                            >
                              #{j.dorsal || "—"}
                            </span>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <strong style={{ fontSize: "11.5px", color: "#0f172a" }}>
                                {j.apodo || j.nombre}
                              </strong>
                              <span style={{ fontSize: "9px", color: "#64748b", fontWeight: 600 }}>
                                {j.posicion || "JUG"}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Método (Ultra discreto y compacto) */}
                        <td style={{ padding: "4px 2px", textAlign: "center", width: "38px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "1px 3px",
                              borderRadius: "3px",
                              background: badgeBg,
                              color: badgeColor,
                              fontSize: "8.5px",
                              fontWeight: 800,
                              whiteSpace: "nowrap",
                            }}
                            title={p.detailText}
                          >
                            {p.shortBadgeText || "—"}
                          </span>
                        </td>

                        {/* Partidos (Ultra discreto y compacto) */}
                        <td style={{ padding: "4px 2px", textAlign: "center", width: "44px", fontSize: "10px", color: "#334155" }}>
                          <span
                            style={{ fontWeight: 800, fontSize: "11px", color: "#0f172a" }}
                            title={`${p.matchesCount || 0} partidos (${p.fullMatchesCount || 0} de 90' completos)`}
                          >
                            {p.matchesCount || 0}
                          </span>
                          {p.fullMatchesCount ? (
                            <span style={{ fontSize: "8.5px", color: "#94a3b8", marginLeft: "1.5px" }}>
                              ({p.fullMatchesCount})
                            </span>
                          ) : null}
                        </td>

                        {/* Columnas dinámicas según favoritas elegidas */}
                        {displayedProfileKeys.map((key) => {
                          const val = p.values ? (p.values as Record<string, any>)[key] : undefined;

                          const isEstimated = p.category === "estimado_45";
                          const isCopied = p.category === "copiado_posicion";
                          const suffix = isEstimated ? "*" : isCopied ? "**" : "";

                          return (
                            <td
                              key={key}
                              style={{
                                padding: "6px 8px",
                                textAlign: "right",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                                fontSize: "11px",
                                color: "#0f172a",
                                backgroundColor: getDemandBgColor(typeof val === "number" ? val : undefined, key),
                                transition: "background-color 0.15s ease",
                              }}
                            >
                              <span>
                                {val !== undefined && val !== null
                                  ? typeof val === "number"
                                    ? val % 1 !== 0
                                      ? val.toFixed(1)
                                      : val.toLocaleString()
                                    : val
                                  : "—"}
                              </span>
                              {suffix && (
                                <span
                                  style={{
                                    marginLeft: "2px",
                                    fontWeight: 800,
                                    color: isEstimated ? "#b45309" : "#c2410c",
                                    fontSize: "10px",
                                  }}
                                  title={isEstimated ? "Estimado 45' x 2 (No real *)" : "Copiado de posición (No real **)"}
                                >
                                  {suffix}
                                </span>
                              )}
                            </td>
                          );
                        })}

                        {/* Columna HSR Individualizada (HSRI) - Si está activa */}
                        {showHsriColumn && (() => {
                          let hsriVal: number | undefined = undefined;
                          if (typeof window !== "undefined") {
                            try {
                              const assignedKey = localStorage.getItem(`player_hsri_var_${j.id}`);
                              if (assignedKey && p.values?.[assignedKey] !== undefined && p.values[assignedKey] !== null) {
                                hsriVal = p.values[assignedKey];
                              }
                            } catch {}
                          }

                          const isEstimated = p.category === "estimado_45";
                          const isCopied = p.category === "copiado_posicion";
                          const suffix = isEstimated ? "*" : isCopied ? "**" : "";

                          return (
                            <td
                              key="hsri-col"
                              style={{
                                padding: "6px 8px",
                                textAlign: "right",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                                fontSize: "11px",
                                color: "#166534",
                                backgroundColor: getDemandBgColor(hsriVal, "HSRI"),
                                transition: "background-color 0.15s ease",
                              }}
                              title="HSR Individualizada calculada con el umbral asignado al jugador"
                            >
                              <span>
                                {hsriVal !== undefined && hsriVal !== null
                                  ? typeof hsriVal === "number"
                                    ? hsriVal % 1 !== 0
                                      ? hsriVal.toFixed(1)
                                      : hsriVal.toLocaleString()
                                    : hsriVal
                                  : "—"}
                              </span>
                              {suffix && (
                                <span
                                  style={{
                                    marginLeft: "2px",
                                    fontWeight: 800,
                                    color: isEstimated ? "#b45309" : "#c2410c",
                                    fontSize: "10px",
                                  }}
                                  title={isEstimated ? "Estimado 45' x 2 (No real *)" : "Copiado de posición (No real **)"}
                                >
                                  {suffix}
                                </span>
                              )}
                            </td>
                          );
                        })()}

                        {/* Acciones */}
                        <td style={{ padding: "6px 6px", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => {
                              const currentDist = p.dist;
                              const input = window.prompt(`Editar DT para ${j.apodo || j.nombre} (m):`, String(currentDist));
                              if (input && !isNaN(Number(input))) {
                                const newDist = Number(input);
                                const updated = { ...customOverrides, [j.id]: { ...(customOverrides[j.id] || {}), "Distance(m)": newDist, dist: newDist } };
                                setCustomOverrides(updated);
                                if (typeof window !== "undefined") {
                                  localStorage.setItem("gps_competitive_profile_overrides", JSON.stringify(updated));
                                }
                              }
                            }}
                            style={{
                              padding: "1px 4px",
                              borderRadius: "3px",
                              border: "1px solid #cbd5e1",
                              background: "#f8fafc",
                              fontSize: "10px",
                              fontWeight: 600,
                              cursor: "pointer",
                              color: "#475569",
                            }}
                            title="Ajuste manual"
                          >
                            ✏️
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* LEYENDA DISCRETA DE ASTERISCOS Y MAPA DE CALOR */}
          <div
            style={{
              fontSize: "10.5px",
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "8px",
              padding: "4px 2px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span>
                <strong>90':</strong> Partido oficial 90' completo ((Máx+Prom)/2 si varios).
              </span>
              <span>
                <strong style={{ color: "#854d0e" }}>45'*:</strong> Parte oficial de 45' proyectada a 90' (No real).
              </span>
              <span>
                <strong style={{ color: "#9a3412" }}>Pos.**:</strong> &lt;45', promedio de misma posición (No real).
              </span>
              <span>
                <strong style={{ color: "#94a3b8" }}>S/P:</strong> Sin perfil competitivo (porteros sin partidos GPS).
              </span>
              {showHeatmapColors && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginLeft: "6px", background: "#f8fafc", padding: "2px 6px", borderRadius: "4px", border: "1px solid #e2e8f0" }}>
                  <strong style={{ color: "#0f172a" }}>Demanda:</strong>
                  <span style={{ background: "rgba(224, 231, 255, 0.7)", padding: "0 4px", borderRadius: "2px", fontSize: "9px" }}>Baja</span>
                  <span style={{ background: "rgba(147, 197, 253, 0.5)", padding: "0 4px", borderRadius: "2px", fontSize: "9px" }}>Mod</span>
                  <span style={{ background: "rgba(250, 204, 21, 0.45)", padding: "0 4px", borderRadius: "2px", fontSize: "9px" }}>Media</span>
                  <span style={{ background: "rgba(74, 222, 128, 0.45)", padding: "0 4px", borderRadius: "2px", fontSize: "9px" }}>Alta</span>
                  <span style={{ background: "rgba(34, 197, 94, 0.55)", padding: "0 4px", borderRadius: "2px", fontSize: "9px", fontWeight: 800 }}>Muy Alta</span>
                </span>
              )}
            </div>
            <div style={{ fontStyle: "italic", color: "#94a3b8", fontSize: "10px" }}>
              Filtrado exclusivo: 1ª parte y 2ª parte de partido oficial
            </div>
          </div>
        </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* ── BARRA UNIFICADA DE CONTROL DE RATIOS SEMANALES ── */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              position: "relative",
            }}
          >
            {/* FILA 1: Controles de navegación y visualización */}
            <div
              style={{
                padding: "9px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              {/* Izquierda: Microciclo + Botón configurar */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
                  Microciclo:
                </span>
                <select
                  value={selectedWeekIdx}
                  onChange={(e) => setSelectedWeekIdx(Number(e.target.value))}
                  style={{
                    padding: "5px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#0f172a",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  {availableWeeks.map((w, idx) => (
                    <option key={w.start + idx} value={idx}>
                      {w.label}
                    </option>
                  ))}
                </select>

                {/* Selector directo del tipo de la semana activa */}
                {activeWeek && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>Tipo:</span>
                    <select
                      value={activeWeek.tipo || "media"}
                      onChange={(e) => handleUpdateWeekType(activeWeek.microId, e.target.value as any)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "6px",
                        border: `1.5px solid ${MICROCICLE_TYPE_CONFIG[activeWeek.tipo || "media"]?.color || "#cbd5e1"}`,
                        background: MICROCICLE_TYPE_CONFIG[activeWeek.tipo || "media"]?.bg || "#ffffff",
                        color: MICROCICLE_TYPE_CONFIG[activeWeek.tipo || "media"]?.color || "#0f172a",
                        fontSize: "11.5px",
                        fontWeight: 800,
                        cursor: "pointer",
                        outline: "none",
                      }}
                      title="Cambiar el tipo asignado a esta semana concreta"
                    >
                      <option value="corto">⚡ Semana Corta (6d entre MD)</option>
                      <option value="media">📅 Semana Media (7d entre MD)</option>
                      <option value="largo">⏳ Semana Larga (8d entre MD)</option>
                      <option value="doble_partido">⚽⚽ Doble Partido</option>
                      <option value="sin_categorizar">⚪ Sin categorizar</option>
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditingMicroId(null);
                    setMicroFormName("");
                    setMicroFormStart("");
                    setMicroFormEnd("");
                    setMicroFormError("");
                    setShowMicroModal(true);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 9px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    background: "#ffffff",
                    fontSize: "11.5px",
                    fontWeight: 600,
                    color: "#475569",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  title="Marcar o editar microciclos personalizados"
                >
                  Configurar fechas
                </button>

                {/* Botón para Planificar Ratios por Sesión */}
                <button
                  type="button"
                  onClick={() => setShowSessionPlanningModal(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1px solid #0284c7",
                    background: "#f0f9ff",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    color: "#0369a1",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    boxShadow: "0 1px 2px rgba(2,132,199,0.08)",
                  }}
                  title="Planifica los ratios exigidos para cada sesión individual del microciclo"
                >
                  <span>🎯 Planificar por Sesión</span>
                </button>
              </div>

              {/* Derecha: Segmented Datos, Segmented Mostrar, Semáforo, Variables y Jugadores */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                {/* Segmented Modo de Evaluación: Progresivo vs Total vs Por Sesión */}
                <div style={{ display: "inline-flex", alignItems: "center", background: "#f1f5f9", padding: "2px", borderRadius: "6px", gap: "2px" }}>
                  <button
                    type="button"
                    onClick={() => handleSetRatioEvaluationMode("progresivo")}
                    style={{
                      padding: "4px 9px",
                      borderRadius: "4px",
                      border: "none",
                      background: ratioEvaluationMode === "progresivo" ? "#ffffff" : "transparent",
                      color: ratioEvaluationMode === "progresivo" ? "#0f172a" : "#64748b",
                      fontWeight: ratioEvaluationMode === "progresivo" ? 700 : 500,
                      fontSize: "11.5px",
                      cursor: "pointer",
                      boxShadow: ratioEvaluationMode === "progresivo" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                    title="Evalúa el cumplimiento acumulado según las sesiones realizadas a la fecha (evita falsas alarmas rojas al inicio del microciclo)"
                  >
                    <span>📅</span> Progresivo (A la fecha)
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetRatioEvaluationMode("total")}
                    style={{
                      padding: "4px 9px",
                      borderRadius: "4px",
                      border: "none",
                      background: ratioEvaluationMode === "total" ? "#ffffff" : "transparent",
                      color: ratioEvaluationMode === "total" ? "#0f172a" : "#64748b",
                      fontWeight: ratioEvaluationMode === "total" ? 700 : 500,
                      fontSize: "11.5px",
                      cursor: "pointer",
                      boxShadow: ratioEvaluationMode === "total" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                    title="Evalúa el cumplimiento total contra el 100% del objetivo del microciclo completo"
                  >
                    <span>🏁</span> Total Microciclo
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetRatioEvaluationMode("sesion")}
                    style={{
                      padding: "4px 9px",
                      borderRadius: "4px",
                      border: "none",
                      background: ratioEvaluationMode === "sesion" ? "#ffffff" : "transparent",
                      color: ratioEvaluationMode === "sesion" ? "#0f172a" : "#64748b",
                      fontWeight: ratioEvaluationMode === "sesion" ? 700 : 500,
                      fontSize: "11.5px",
                      cursor: "pointer",
                      boxShadow: ratioEvaluationMode === "sesion" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                    title="Evalúa el rendimiento de una sesión concreta del microciclo contra su objetivo de sesión"
                  >
                    <span>📍</span> Por Sesión
                  </button>
                </div>

                {/* Si está en modo Por Sesión, mostrar selector de sesión */}
                {ratioEvaluationMode === "sesion" && (
                  <select
                    value={selectedRatioSessionDate || (activeWeek?.dates[activeWeek.dates.length - 1] || "")}
                    onChange={(e) => setSelectedRatioSessionDate(e.target.value)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "6px",
                      border: "1.5px solid #0284c7",
                      background: "#f0f9ff",
                      color: "#0369a1",
                      fontWeight: 800,
                      fontSize: "11.5px",
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    {(activeWeek?.dates || []).map((dt) => {
                      const sMd = getSessionMd(dt, gpsRecords.filter((r) => r.fecha === dt));
                      const parts = dt.split("-");
                      const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dt;
                      return (
                        (() => {
                        const dayRecs = (gpsRecords || []).filter((r) => r.fecha === dt);
                        const simCount = dayRecs.filter((r) => isRecordSimulado(r)).length;
                        const realCount = dayRecs.length - simCount;
                        const simTag = simCount > 0 ? ` (${realCount} reales, ${simCount} simulados)` : "";
                        return (
                          <option key={dt} value={dt}>
                            {label} · {sMd}{simTag}
                          </option>
                        );
                      })()
                      );
                    })}
                  </select>
                )}

                <div style={{ width: "1px", height: "16px", background: "#e2e8f0" }} />

                {/* Segmented Datos */}
                <div style={{ display: "inline-flex", alignItems: "center", background: "#f1f5f9", padding: "2px", borderRadius: "6px", gap: "2px" }}>
                  <button
                    type="button"
                    onClick={() => handleSetRatioDataSource("reales")}
                    style={{
                      padding: "4px 9px",
                      borderRadius: "4px",
                      border: "none",
                      background: ratioDataSource === "reales" ? "#ffffff" : "transparent",
                      color: ratioDataSource === "reales" ? "#0f172a" : "#64748b",
                      fontWeight: ratioDataSource === "reales" ? 700 : 500,
                      fontSize: "11.5px",
                      cursor: "pointer",
                      boxShadow: ratioDataSource === "reales" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                    title="Usar exclusivamente datos reales de GPS"
                  >
                    {ratioDataSource === "reales" && (
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#16a34a" }} />
                    )}
                    Solo Reales
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetRatioDataSource("todos")}
                    style={{
                      padding: "4px 9px",
                      borderRadius: "4px",
                      border: "none",
                      background: ratioDataSource === "todos" ? "#ffffff" : "transparent",
                      color: ratioDataSource === "todos" ? "#0f172a" : "#64748b",
                      fontWeight: ratioDataSource === "todos" ? 700 : 500,
                      fontSize: "11.5px",
                      cursor: "pointer",
                      boxShadow: ratioDataSource === "todos" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                    title="Incluir todos los datos registrados"
                  >
                    {ratioDataSource === "todos" && (
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#0284c7" }} />
                    )}
                    Todos los Datos
                  </button>
                </div>

                <div style={{ width: "1px", height: "16px", background: "#e2e8f0" }} />

                {/* Segmented Formato / Mostrar */}
                <div style={{ display: "inline-flex", alignItems: "center", background: "#f1f5f9", padding: "2px", borderRadius: "6px", gap: "2px" }}>
                  <button
                    type="button"
                    onClick={() => handleSetRatioFormat("real")}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      border: "none",
                      background: ratioFormat === "real" ? "#ffffff" : "transparent",
                      color: ratioFormat === "real" ? "#0f172a" : "#64748b",
                      fontWeight: ratioFormat === "real" ? 700 : 500,
                      fontSize: "11.5px",
                      cursor: "pointer",
                      boxShadow: ratioFormat === "real" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    }}
                    title="Mostrar el valor real acumulado en metros o conteos"
                  >
                    Valor Real
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetRatioFormat("multiplier")}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      border: "none",
                      background: ratioFormat === "multiplier" ? "#ffffff" : "transparent",
                      color: ratioFormat === "multiplier" ? "#0f172a" : "#64748b",
                      fontWeight: ratioFormat === "multiplier" ? 700 : 500,
                      fontSize: "11.5px",
                      cursor: "pointer",
                      boxShadow: ratioFormat === "multiplier" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    }}
                    title="Mostrar el multiplicador de partido (ej. 2.1x)"
                  >
                    Multiplicador
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetRatioFormat("remaining")}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      border: "none",
                      background: ratioFormat === "remaining" ? "#ffffff" : "transparent",
                      color: ratioFormat === "remaining" ? "#0f172a" : "#64748b",
                      fontWeight: ratioFormat === "remaining" ? 700 : 500,
                      fontSize: "11.5px",
                      cursor: "pointer",
                      boxShadow: ratioFormat === "remaining" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    }}
                    title="Mostrar valor restante para alcanzar el objetivo"
                  >
                    Restante
                  </button>
                </div>

                <div style={{ width: "1px", height: "16px", background: "#e2e8f0" }} />

                {/* Semáforo Toggle */}
                <button
                  type="button"
                  onClick={handleToggleSemaforo}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "4px 9px",
                    borderRadius: "6px",
                    border: showSemaforo ? "1px solid #bbf7d0" : "1px solid #e2e8f0",
                    background: showSemaforo ? "#f0fdf4" : "#ffffff",
                    color: showSemaforo ? "#15803d" : "#64748b",
                    fontSize: "11.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  title="Activa o desactiva el coloreado en semáforo"
                >
                  <span>Semáforo</span>
                  <span
                    style={{
                      fontSize: "9.5px",
                      fontWeight: 800,
                      padding: "1px 5px",
                      borderRadius: "4px",
                      background: showSemaforo ? "#dcfce7" : "#f1f5f9",
                      color: showSemaforo ? "#166534" : "#94a3b8",
                    }}
                  >
                    {showSemaforo ? "ON" : "OFF"}
                  </span>
                </button>

                {/* Botón Selector de Variables */}
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => setShowRatioColumnPicker((prev) => !prev)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 9px",
                      borderRadius: "6px",
                      border: showRatioColumnPicker ? "1px solid #0284c7" : "1px solid #e2e8f0",
                      background: showRatioColumnPicker ? "#f0f9ff" : "#ffffff",
                      color: showRatioColumnPicker ? "#0369a1" : "#334155",
                      fontSize: "11.5px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                    title="Elige qué variables GPS ver en las columnas"
                  >
                    <span>Variables</span>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 800,
                        background: "#f1f5f9",
                        color: "#334155",
                        padding: "1px 5px",
                        borderRadius: "4px",
                      }}
                    >
                      {selectedRatioKeys.length}
                    </span>
                    <span style={{ fontSize: "8px", color: "#64748b" }}>
                      {showRatioColumnPicker ? "▲" : "▼"}
                    </span>
                  </button>

                  {showRatioColumnPicker && (
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "calc(100% + 6px)",
                        zIndex: 90,
                        background: "#ffffff",
                        border: "1px solid #cbd5e1",
                        borderRadius: "10px",
                        boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
                        padding: "12px",
                        width: "320px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      {/* Encabezado */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                        <strong style={{ fontSize: "12px", color: "#0f172a" }}>
                          {ratioPickerScope === "favoritas" ? "Variables Favoritas" : "Catálogo Completo GPS"}
                        </strong>
                        <span style={{ fontSize: "10px", color: "#0369a1", fontWeight: 800, background: "#e0f2fe", padding: "1px 6px", borderRadius: "4px" }}>
                          {selectedRatioKeys.length} activas
                        </span>
                      </div>

                      {/* Selector de ámbito: Favoritas vs Catálogo */}
                      <div style={{ display: "flex", gap: "3px", background: "#f1f5f9", padding: "3px", borderRadius: "6px" }}>
                        <button
                          type="button"
                          onClick={() => setRatioPickerScope("favoritas")}
                          style={{
                            flex: 1,
                            padding: "5px 6px",
                            borderRadius: "5px",
                            border: "none",
                            background: ratioPickerScope === "favoritas" ? "#ffffff" : "transparent",
                            color: ratioPickerScope === "favoritas" ? "#0369a1" : "#64748b",
                            fontWeight: ratioPickerScope === "favoritas" ? 800 : 600,
                            fontSize: "11px",
                            cursor: "pointer",
                            boxShadow: ratioPickerScope === "favoritas" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                          }}
                        >
                          Mis Favoritas ({availableFavVariables.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setRatioPickerScope("todas")}
                          style={{
                            flex: 1,
                            padding: "5px 6px",
                            borderRadius: "5px",
                            border: "none",
                            background: ratioPickerScope === "todas" ? "#ffffff" : "transparent",
                            color: ratioPickerScope === "todas" ? "#0369a1" : "#64748b",
                            fontWeight: ratioPickerScope === "todas" ? 800 : 600,
                            fontSize: "11px",
                            cursor: "pointer",
                            boxShadow: ratioPickerScope === "todas" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                          }}
                        >
                          Todas ({ALL_GPS_VARIABLES.length - 1})
                        </button>
                      </div>

                      {/* Presets rápidos */}
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => handleSetPresetRatioColumns(availableFavVariables.map((v) => v.key))}
                          style={{ padding: "3px 7px", borderRadius: "4px", border: "1px solid #bfdbfe", background: "#eff6ff", fontSize: "10.5px", color: "#1e40af", cursor: "pointer", fontWeight: 800 }}
                          title="Seleccionar todas tus variables favoritas"
                        >
                          Todas las favoritas
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetPresetRatioColumns(["Distance(m)", "+ 24 km/h (Distancia)", "Player Load", "Max Speed (km/h)"])}
                          style={{ padding: "3px 6px", borderRadius: "4px", border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: "10.5px", color: "#334155", cursor: "pointer", fontWeight: 700 }}
                        >
                          Top 4
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetPresetRatioColumns(["Distance(m)", "19.8 - 24 km/h (Distancia)", "Accelerations + Decelerations", "+ 24 km/h (Distancia)"])}
                          style={{ padding: "3px 6px", borderRadius: "4px", border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: "10.5px", color: "#334155", cursor: "pointer", fontWeight: 700 }}
                        >
                          Clásicas
                        </button>
                        {ratioPickerScope === "todas" && (
                          <button
                            type="button"
                            onClick={() => handleSetPresetRatioColumns(["15 - 16 km/h (Distancia)", "16 - 17 km/h (Distancia)", "17 - 19,8 km/h (Distancia)", "21 - 24 km/h (Distancia)", "+ 24 km/h (Distancia)"])}
                            style={{ padding: "3px 6px", borderRadius: "4px", border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: "10.5px", color: "#334155", cursor: "pointer", fontWeight: 700 }}
                          >
                            Zonas Vel.
                          </button>
                        )}
                      </div>

                      {/* Lista scrolleable con las variables */}
                      <div style={{ maxHeight: "250px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "3px" }}>
                        {(ratioPickerScope === "favoritas" ? availableFavVariables : ALL_GPS_VARIABLES.filter((v) => v.key !== "Duration(min)")).map((v) => {
                          const isChecked = selectedRatioKeys.includes(v.key);
                          return (
                            <label
                              key={v.key}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                padding: "4px 6px",
                                borderRadius: "4px",
                                background: isChecked ? "#f0f9ff" : "transparent",
                                cursor: "pointer",
                                fontSize: "11px",
                              }}
                            >
                              {(() => {
                                const isDt = v.key === "Distance(m)";
                                const checked = isDt ? true : isChecked;
                                const nameObj = getVariableDisplayName(v.key, v);
                                return (
                                  <>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={isDt}
                                      onChange={() => !isDt && handleToggleRatioColumn(v.key)}
                                      style={{ cursor: isDt ? "not-allowed" : "pointer", accentColor: "#0284c7" }}
                                    />
                                    <span style={{ fontWeight: checked ? 800 : 500, color: checked ? "#0369a1" : "#334155", flex: 1, display: "inline-flex", alignItems: "center", gap: "5px" }}>
                                      {v.esDerivada && (
                                        <span style={{ fontSize: "11px", color: "#059669", fontWeight: 900 }} title="Variable Personalizada">➕</span>
                                      )}
                                      <span>{nameObj.full} {isDt ? "(Fija)" : ""}</span>
                                    </span>
                                    <span style={{ fontSize: "9.5px", color: isDt ? "#1d4ed8" : "#64748b", fontWeight: 700, fontFamily: "monospace" }}>
                                      [{nameObj.short}]
                                    </span>
                                  </>
                                );
                              })()}
                            </label>
                          );
                        })}
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
                        <span style={{ fontSize: "10px", color: "#64748b" }}>
                          {ratioPickerScope === "favoritas" ? "Variables favoritas" : "Todas las variables"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowRatioColumnPicker(false)}
                          style={{
                            padding: "4px 12px",
                            borderRadius: "5px",
                            background: "#0f172a",
                            color: "#ffffff",
                            fontSize: "11px",
                            fontWeight: 800,
                            cursor: "pointer",
                            border: "none",
                          }}
                        >
                          Listo
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Botón Selector / Ocultador de Jugadores */}
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => setShowPlayerFilterPicker((prev) => !prev)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 9px",
                      borderRadius: "6px",
                      border: hiddenPlayerIds.length > 0 ? "1px solid #fed7aa" : showPlayerFilterPicker ? "1px solid #0284c7" : "1px solid #e2e8f0",
                      background: hiddenPlayerIds.length > 0 ? "#fffbeb" : showPlayerFilterPicker ? "#f0f9ff" : "#ffffff",
                      color: hiddenPlayerIds.length > 0 ? "#9a3412" : "#334155",
                      fontSize: "11.5px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                    title="Oculta o muestra jugadores en la tabla de ratios semanales"
                  >
                    <span>Jugadores</span>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 800,
                        background: hiddenPlayerIds.length > 0 ? "#fef3c7" : "#f1f5f9",
                        color: hiddenPlayerIds.length > 0 ? "#b45309" : "#334155",
                        padding: "1px 5px",
                        borderRadius: "4px",
                      }}
                    >
                      {displayedWeeklyRatiosData.length}/{weeklyRatiosData.length}
                    </span>
                    {hiddenPlayerIds.length > 0 && (
                      <span style={{ fontSize: "10px", color: "#b45309", fontWeight: 700 }}>
                        ({hiddenPlayerIds.length} ocultos)
                      </span>
                    )}
                    <span style={{ fontSize: "8px", color: "#64748b" }}>
                      {showPlayerFilterPicker ? "▲" : "▼"}
                    </span>
                  </button>

                  {showPlayerFilterPicker && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        right: 0,
                        zIndex: 90,
                        background: "#ffffff",
                        border: "1px solid #cbd5e1",
                        borderRadius: "10px",
                        boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
                        padding: "12px",
                        width: "330px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      {/* Encabezado */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                        <strong style={{ fontSize: "12px", color: "#0f172a" }}>
                          Visibilidad de Jugadores
                        </strong>
                        <span style={{ fontSize: "10.5px", color: hiddenPlayerIds.length > 0 ? "#b45309" : "#16a34a", fontWeight: 800, background: hiddenPlayerIds.length > 0 ? "#fef3c7" : "#dcfce7", padding: "1px 6px", borderRadius: "4px" }}>
                          {displayedWeeklyRatiosData.length} visibles
                        </span>
                      </div>

                      {/* Buscador de jugadores */}
                      <input
                        type="text"
                        placeholder="Buscar por nombre, apodo o dorsal..."
                        value={playerSearchFilter}
                        onChange={(e) => setPlayerSearchFilter(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "11.5px",
                          outline: "none",
                        }}
                      />

                      {/* Presets rápidos */}
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={handleShowAllPlayers}
                          style={{ padding: "3px 7px", borderRadius: "4px", border: "1px solid #bfdbfe", background: "#eff6ff", fontSize: "10.5px", color: "#1e40af", cursor: "pointer", fontWeight: 800 }}
                        >
                          Mostrar Todos
                        </button>
                        <button
                          type="button"
                          onClick={handleHidePlayersWithoutSessions}
                          style={{ padding: "3px 7px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: "10.5px", color: "#475569", cursor: "pointer", fontWeight: 700 }}
                          title="Ocultar jugadores que tienen 0 sesiones en este microciclo"
                        >
                          Sin sesiones
                        </button>
                        <button
                          type="button"
                          onClick={handleHideGoalkeepers}
                          style={{ padding: "3px 7px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: "10.5px", color: "#475569", cursor: "pointer", fontWeight: 700 }}
                          title="Ocultar porteros de la tabla de ratios"
                        >
                          Porteros
                        </button>
                      </div>

                      {/* Lista de jugadores con checkbox */}
                      <div style={{ maxHeight: "260px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "3px" }}>
                        {jugadores
                          .filter((j) => {
                            if (!playerSearchFilter) return true;
                            const q = playerSearchFilter.toLowerCase();
                            const name = (j.apodo || j.nombre || "").toLowerCase();
                            const dorsal = String(j.dorsal || "");
                            const pos = (j.posicion || "").toLowerCase();
                            return name.includes(q) || dorsal.includes(q) || pos.includes(q);
                          })
                          .map((j) => {
                            const isHidden = hiddenPlayerIds.includes(j.id);
                            const rowData = weeklyRatiosData.find((r) => r.jugador.id === j.id);
                            const sessCount = rowData?.sessionsCount ?? 0;

                            return (
                              <label
                                key={j.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "5px 8px",
                                  borderRadius: "6px",
                                  background: isHidden ? "#f8fafc" : "#f0fdf4",
                                  border: isHidden ? "1px solid #e2e8f0" : "1px solid #bbf7d0",
                                  cursor: "pointer",
                                  fontSize: "11.5px",
                                  opacity: isHidden ? 0.6 : 1,
                                  transition: "all 0.1s ease",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                                  <input
                                    type="checkbox"
                                    checked={!isHidden}
                                    onChange={() => handleTogglePlayerVisibility(j.id)}
                                    style={{ cursor: "pointer", accentColor: "#16a34a" }}
                                  />
                                  <span style={{ fontWeight: !isHidden ? 800 : 500, color: !isHidden ? "#166534" : "#64748b" }}>
                                    {j.dorsal ? "#" + j.dorsal + " " : ""}{j.apodo || j.nombre}
                                  </span>
                                  <span style={{ fontSize: "9.5px", color: "#94a3b8" }}>
                                    {j.posicion || "Jugador"}
                                  </span>
                                </div>
                                <span style={{ fontSize: "10px", fontWeight: 700, color: sessCount > 0 ? "#0369a1" : "#94a3b8" }}>
                                  {sessCount} {sessCount === 1 ? "sesión" : "sesiones"}
                                </span>
                              </label>
                            );
                          })}
                      </div>

                      {/* Pie del modal */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #f1f5f9", paddingTop: "8px" }}>
                        {hiddenPlayerIds.length > 0 && (
                          <button
                            type="button"
                            onClick={handleShowAllPlayers}
                            style={{ border: "none", background: "none", color: "#dc2626", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}
                          >
                            Restablecer todos ({weeklyRatiosData.length})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowPlayerFilterPicker(false)}
                          style={{
                            marginLeft: "auto",
                            padding: "4px 10px",
                            background: "#0f172a",
                            color: "#ffffff",
                            borderRadius: "6px",
                            border: "none",
                            fontSize: "11px",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Listo
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* FILA 2: Ratios Exigidos Ribbon (Integrado elegantemente en la base de la tarjeta) */}
            <div
              style={{
                borderTop: "1px solid #f1f5f9",
                background: "#f8fafc",
                padding: "7px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
                borderBottomLeftRadius: "9px",
                borderBottomRightRadius: "9px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#64748b" }}>
                  Ratios Exigidos:
                </span>

                {activeRatioKeys.map((key) => {
                  const vDef = getGpsVariableDef(key);
                  const nameObj = getVariableDisplayName(key, vDef);
                  const currentVal = teamRatioTargets[key] ?? getDefaultRatioTargetForKey(key);
                  const isDt = key === "Distance(m)";

                  return (
                    <div
                      key={key}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        background: "#ffffff",
                        border: isDt ? "1px solid #bfdbfe" : "1px solid #e2e8f0",
                        borderRadius: "5px",
                        padding: "2px 5px 2px 7px",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                        gap: "4px",
                      }}
                      title={"Objetivo de ratio semanal para " + nameObj.full}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: isDt ? "#1d4ed8" : "#334155",
                        }}
                      >
                        {nameObj.short}
                      </span>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="10"
                        value={currentVal}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val > 0) handleUpdateTeamTarget(key, val);
                        }}
                        style={{
                          width: "42px",
                          padding: "2px 0",
                          borderRadius: "3px",
                          border: "none",
                          background: "#f1f5f9",
                          fontSize: "11.5px",
                          fontWeight: 800,
                          color: isDt ? "#1e40af" : "#0f172a",
                          textAlign: "center",
                          outline: "none",
                        }}
                      />
                      <span style={{ fontSize: "10.5px", color: "#94a3b8", fontWeight: 600 }}>x</span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {hiddenPlayerIds.length > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11.5px" }}>
                    <span style={{ color: "#9a3412", background: "#fef3c7", padding: "1px 7px", borderRadius: "10px", fontWeight: 700, fontSize: "10.5px" }}>
                      {hiddenPlayerIds.length} {hiddenPlayerIds.length === 1 ? "oculto" : "ocultos"}
                    </span>
                    <button
                      type="button"
                      onClick={handleShowAllPlayers}
                      style={{
                        border: "none",
                        background: "none",
                        color: "#0284c7",
                        fontSize: "11.5px",
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: 0,
                        textDecoration: "underline",
                      }}
                    >
                      Mostrar todos
                    </button>
                    <span style={{ color: "#cbd5e1" }}>·</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowAllIndividualTargetsModal(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "3px 9px",
                    borderRadius: "5px",
                    border: "1px solid #e2e8f0",
                    background: "#ffffff",
                    fontSize: "11.5px",
                    fontWeight: 600,
                    color: "#475569",
                    cursor: "pointer",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                  }}
                  title="Ajustar ratios individuales específicos por jugador"
                >
                  Ajustes individuales ({Object.keys(playerCustomTargets).length})
                </button>
              </div>
            </div>
          </div>

          <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.02)", overflow: "hidden" }}>
            <div style={{ padding: "9px 14px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#0f172a" }}>
                  {ratioEvaluationMode === "sesion"
                    ? "Ratios de Carga por Sesión vs 1 Partido Entero"
                    : ratioEvaluationMode === "progresivo"
                    ? "Ratios Progresivos a la Fecha (Planificación por Sesión) vs 1 Partido"
                    : "Ratios de Carga del Microciclo Completo vs 1 Partido"}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "6px",
                    background: ratioDataSource === "reales" ? "#f0fdf4" : "#f0f9ff",
                    color: ratioDataSource === "reales" ? "#166534" : "#0369a1",
                    border: ratioDataSource === "reales" ? "1px solid #bbf7d0" : "1px solid #bae6fd",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: ratioDataSource === "reales" ? "#16a34a" : "#0284c7" }} />
                  {ratioDataSource === "reales" ? "Solo Datos Reales" : "Todos los Datos"}
                </span>
              </div>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                {ratioFormat === "remaining"
                  ? "Línea 1: Valor restante · Línea 2: % Cumplido del objetivo"
                  : ratioFormat === "multiplier"
                  ? "Línea 1: Multiplicador · Línea 2: % Cumplido del objetivo"
                  : "Línea 1: Valor real · Línea 2: % Cumplido del objetivo"}
              </span>
            </div>

            {ratioDataSource === "reales" && activeWeekSimulatedCount > 0 && (
              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  marginBottom: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  color: "#1e40af",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "18px" }}>💡</span>
                  <span>
                    <strong>Entrenamientos simulados detectados:</strong> Este microciclo contiene <strong>{activeWeekSimulatedCount} registros simulados</strong> (p. ej. Miércoles 28/10 post-partido). Actualmente estás en modo <strong>"Solo Datos Reales"</strong>, por lo que no se muestran ni suman a sus totales.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSetRatioDataSource("todos")}
                  style={{
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "5px 12px",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    boxShadow: "0 1px 3px rgba(37,99,235,0.3)",
                  }}
                >
                  <span>🧪</span> Mostrar Datos Simulados
                </button>
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", color: "#0f172a" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", textAlign: "left", color: "#475569", fontSize: "11px", textTransform: "uppercase" }}>
                    <th style={{ padding: "10px 12px" }}>Jugador</th>
                    <th style={{ padding: "10px 6px", textAlign: "center" }}>Sesiones</th>
                    {activeRatioKeys.map((key) => {
                      const vDef = getGpsVariableDef(key);
                      const nameObj = getVariableDisplayName(key, vDef);
                      const targetVal = teamRatioTargets[key] ?? getDefaultRatioTargetForKey(key);
                      const isDt = key === "Distance(m)";
                      return (
                        <th
                          key={key}
                          style={{
                            padding: "10px 10px",
                            textAlign: "center",
                            background: isDt ? "#e0f2fe" : undefined,
                            borderLeft: isDt ? "2px solid #0284c7" : undefined,
                            borderRight: isDt ? "2px solid #0284c7" : undefined,
                          }}
                          title={nameObj.full}
                        >
                          <div style={{ fontWeight: 900, color: isDt ? "#0369a1" : "#1e293b" }}>{nameObj.short}</div>
                          <div style={{ fontSize: "10px", fontWeight: 800, color: isDt ? "#0284c7" : "#0284c7", textTransform: "none" }}>
                            Obj: {targetVal}x
                          </div>
                        </th>
                      );
                    })}
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>
                      <div>Vmax Semana</div>
                      <div style={{ fontSize: "9.5px", fontWeight: 800, color: "#64748b", textTransform: "none" }}>
                        % Top Histórico
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayedWeeklyRatiosData.length === 0 ? (
                    <tr>
                      <td colSpan={activeRatioKeys.length + 3} style={{ padding: "36px 20px", textAlign: "center", color: "#64748b" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "24px" }}>📅</span>
                          <span style={{ fontWeight: 700, fontSize: "14px", color: "#334155" }}>
                            {hiddenPlayerIds.length > 0 ? "Todos los jugadores de la plantilla están actualmente ocultos" : "No hay sesiones de GPS registradas en este microciclo"}
                          </span>
                          <span style={{ fontSize: "12px", color: "#64748b" }}>
                            Rango: {activeWeek?.start} al {activeWeek?.end}. Puedes importar sesiones o cambiar de microciclo arriba.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayedWeeklyRatiosData.map((row, idx) => {
                      const j = row.jugador;
                      const pCustom = playerCustomTargets[j.id];
                      const hasCustom = Boolean(pCustom && Object.keys(pCustom).length > 0);

                      return (
                        <tr key={j.id || idx} style={{ borderBottom: "1px solid #f1f5f9", background: idx % 2 === 0 ? "#ffffff" : "#fcfcfd" }}>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                {renderDisponibilidadBadge && renderDisponibilidadBadge(j)}
                                <div style={{ display: "flex", flexDirection: "column" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span style={{ fontWeight: 800, color: "#0f172a" }}>
                                      {j.dorsal ? "#" + j.dorsal + " " : ""}{j.apodo || j.nombre}
                                    </span>
                                    {hasCustom && (
                                      <span
                                        style={{
                                          fontSize: "9px",
                                          fontWeight: 800,
                                          padding: "1px 5px",
                                          borderRadius: "4px",
                                          background: "#fef3c7",
                                          color: "#92400e",
                                          border: "1px solid #fde047",
                                        }}
                                        title="Este jugador tiene objetivos de ratios individuales personalizados"
                                      >
                                        🎯 Indiv
                                      </span>
                                    )}
                                  </div>
                                  <span style={{ fontSize: "10px", color: "#64748b" }}>
                                    {j.posicion || "Jugador"}
                                  </span>
                                </div>
                              </div>

                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedPlayerForTarget(j)}
                                  style={{
                                    padding: "3px 6px",
                                    borderRadius: "4px",
                                    border: hasCustom ? "1px solid #d97706" : "1px solid #cbd5e1",
                                    background: hasCustom ? "#fef3c7" : "#ffffff",
                                    fontSize: "11px",
                                    cursor: "pointer",
                                    color: hasCustom ? "#b45309" : "#64748b",
                                  }}
                                  title={"Modificar ratios exigidos para " + (j.apodo || j.nombre)}
                                >
                                  🎯
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleHidePlayer(j.id)}
                                  style={{
                                    padding: "3px 6px",
                                    borderRadius: "4px",
                                    border: "1px solid #cbd5e1",
                                    background: "#ffffff",
                                    fontSize: "11px",
                                    cursor: "pointer",
                                    color: "#94a3b8",
                                    transition: "all 0.15s ease",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color = "#dc2626";
                                    e.currentTarget.style.borderColor = "#fca5a5";
                                    e.currentTarget.style.background = "#fef2f2";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.color = "#94a3b8";
                                    e.currentTarget.style.borderColor = "#cbd5e1";
                                    e.currentTarget.style.background = "#ffffff";
                                  }}
                                  title={"Ocultar a " + (j.apodo || j.nombre) + " de la tabla"}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          </td>

                          <td style={{ padding: "10px 6px", textAlign: "center", fontWeight: 800 }}>
                            <div>{row.sessionsCount}</div>
                            {ratioDataSource === "todos" && row.simSessionsCount > 0 && (
                              <div style={{ fontSize: "9.5px", color: "#b45309", fontWeight: 700 }} title={row.realSessionsCount + " reales + " + row.simSessionsCount + " simuladas"}>
                                {row.realSessionsCount}r + {row.simSessionsCount}s
                              </div>
                            )}
                          </td>

                          {activeRatioKeys.map((key) => {
                            const m = row.metrics[key];
                            if (!m) return <td key={key} style={{ padding: "8px 10px", textAlign: "center" }}>-</td>;

                            return (
                              <td
                                key={key}
                                style={{
                                  padding: "8px 10px",
                                  textAlign: "center",
                                  background: showSemaforo ? m.comp.bg : "transparent",
                                  borderLeft: showSemaforo ? ("3px solid " + m.comp.border) : "none",
                                  transition: "all 0.15s ease",
                                }}
                                title={m.label + ": " + m.weekVal.toLocaleString("es-ES") + " " + m.unit + " | Ref. 1 Partido: " + m.benchmark.toLocaleString("es-ES") + " " + m.unit + " | Ratio: " + m.actualRatio.toFixed(2) + "x | Exigido: " + m.targetRatio + "x (" + m.comp.pctOfTarget + "% cumplido)"}
                              >
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                  <span style={{ fontSize: "13px", fontWeight: 900, color: showSemaforo ? m.comp.color : "#0f172a" }}>
                                    {formatRatioCellDisplay(m)}
                                  </span>
                                  {showSemaforo && (
                                    <span
                                      style={{
                                        fontSize: "10px",
                                        fontWeight: 800,
                                        color: m.comp.badgeColor,
                                        background: "rgba(255, 255, 255, 0.75)",
                                        padding: "1px 6px",
                                        borderRadius: "4px",
                                        border: "1px solid " + m.comp.border,
                                      }}
                                    >
                                      {m.comp.pctOfTarget}%
                                    </span>
                                  )}
                                </div>
                              </td>
                            );
                          })}

                          {/* Vmax */}
                          <td style={{ padding: "10px 12px", textAlign: "center" }}>
                            <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                              <span style={{ fontWeight: 800, color: row.vmaxPct >= 90 ? "#15803d" : "#64748b" }}>
                                {row.weekMaxSpeed > 0 ? row.weekMaxSpeed.toFixed(1) + " km/h" : "-"}
                              </span>
                              {row.weekMaxSpeed > 0 && (
                                <span style={{ fontSize: "10px", fontWeight: 800, color: row.vmaxPct >= 90 ? "#15803d" : "#b45309" }}>
                                  {row.vmaxPct}% Vmax
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* LEYENDA DEL SEMÁFORO DE OBJETIVOS */}
            <div
              style={{
                padding: "10px 16px",
                borderTop: "1px solid #e2e8f0",
                background: "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
                fontSize: "11px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800, color: "#475569" }}>Leyenda Semáforo:</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: "4px", fontWeight: 800 }}>
                  🟢 Cumplido (95% - 130%)
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#fef3c7", color: "#b45309", padding: "2px 8px", borderRadius: "4px", fontWeight: 800 }}>
                  🟡 Parcial (75% - 94%)
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#fee2e2", color: "#b91c1c", padding: "2px 8px", borderRadius: "4px", fontWeight: 800 }}>
                  🔴 Déficit (&lt;75%)
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#f3e8ff", color: "#7e22ce", padding: "2px 8px", borderRadius: "4px", fontWeight: 800 }}>
                  ⚡ Sobrecarga (&gt;130%)
                </span>
              </div>
              <div style={{ color: "#64748b", fontStyle: "italic" }}>
                * Pasa el ratón sobre cualquier celda para ver los metros acumulados exactos.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
})()}
{/* ── SUB-PESTAÑA 4: CONSULTAS & PREGUNTAS CLAVE ── */}
      {subTab === "evolutivo" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* ── HERRAMIENTA PRINCIPAL: GRÁFICO EVOLUTIVO DE RENDIMIENTO ── */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
              display: "flex",
              flexDirection: "column",
              overflow: "visible",
            }}
          >
            {/* ENCABEZADO Y CONTROLES DEL GRÁFICO EVOLUTIVO */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#0f172a" }}>
                    Evolutivo de Rendimiento
                  </h4>
                  <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#64748b" }}>
                    Visualiza la tendencia temporal de cualquier métrica física para el equipo o un jugador.
                  </p>
                </div>

                {/* FILTROS PRINCIPALES DE VISUALIZACIÓN */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  {/* Selector Datos: Solo Reales vs Todos (Reales + Simulados) */}
                  <div style={{ display: "inline-flex", alignItems: "center", background: "#f1f5f9", padding: "2px", borderRadius: "6px", gap: "2px" }}>
                    <button
                      type="button"
                      onClick={() => handleSetEvolutivoDataSource("reales")}
                      style={{
                        padding: "4px 9px",
                        borderRadius: "4px",
                        border: "none",
                        background: evolutivoDataSource === "reales" ? "#ffffff" : "transparent",
                        color: evolutivoDataSource === "reales" ? "#0f172a" : "#64748b",
                        fontWeight: evolutivoDataSource === "reales" ? 700 : 500,
                        fontSize: "11.5px",
                        cursor: "pointer",
                        boxShadow: evolutivoDataSource === "reales" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                      title="Usar exclusivamente datos reales de GPS (excluye registros simulados)"
                    >
                      {evolutivoDataSource === "reales" && (
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#16a34a" }} />
                      )}
                      Solo Reales
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetEvolutivoDataSource("todos")}
                      style={{
                        padding: "4px 9px",
                        borderRadius: "4px",
                        border: "none",
                        background: evolutivoDataSource === "todos" ? "#ffffff" : "transparent",
                        color: evolutivoDataSource === "todos" ? "#0f172a" : "#64748b",
                        fontWeight: evolutivoDataSource === "todos" ? 700 : 500,
                        fontSize: "11.5px",
                        cursor: "pointer",
                        boxShadow: evolutivoDataSource === "todos" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                      title="Incluir todos los datos registrados (reales y simulados)"
                    >
                      {evolutivoDataSource === "todos" && (
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#0284c7" }} />
                      )}
                      Todos los Datos
                    </button>
                  </div>

                  <div style={{ width: "1px", height: "16px", background: "#e2e8f0" }} />

                  {/* Selector Sujeto: Equipo vs Jugador */}
                  <div style={{ display: "inline-flex", alignItems: "center", background: "#f1f5f9", padding: "2px", borderRadius: "6px", gap: "2px" }}>
                    <button
                      type="button"
                      onClick={() => setEvolutivoTarget("equipo")}
                      style={{
                        padding: "4px 9px",
                        borderRadius: "4px",
                        border: "none",
                        background: evolutivoTarget === "equipo" ? "#ffffff" : "transparent",
                        color: evolutivoTarget === "equipo" ? "#0f172a" : "#64748b",
                        fontWeight: evolutivoTarget === "equipo" ? 700 : 500,
                        fontSize: "11.5px",
                        cursor: "pointer",
                        boxShadow: evolutivoTarget === "equipo" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      }}
                    >
                      Equipo
                    </button>
                    <button
                      type="button"
                      onClick={() => setEvolutivoTarget("jugador")}
                      style={{
                        padding: "4px 9px",
                        borderRadius: "4px",
                        border: "none",
                        background: evolutivoTarget === "jugador" ? "#ffffff" : "transparent",
                        color: evolutivoTarget === "jugador" ? "#0f172a" : "#64748b",
                        fontWeight: evolutivoTarget === "jugador" ? 700 : 500,
                        fontSize: "11.5px",
                        cursor: "pointer",
                        boxShadow: evolutivoTarget === "jugador" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      }}
                    >
                      Jugador
                    </button>
                  </div>

                  {/* Si es Jugador: Selector de Jugador */}
                  {evolutivoTarget === "jugador" ? (
                    <select
                      value={evolutivoPlayerId}
                      onChange={(e) => setEvolutivoPlayerId(e.target.value)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        background: "#ffffff",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#0f172a",
                        outline: "none",
                        cursor: "pointer",
                        maxWidth: "200px",
                      }}
                    >
                      {jugadores.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.dorsal ? `#${j.dorsal} ` : ""}{j.apodo || j.nombre} ({j.posicion || "Jugador"})
                        </option>
                      ))}
                    </select>
                  ) : (
                    /* Si es Equipo: Media vs Total */
                    <div style={{ display: "inline-flex", alignItems: "center", background: "#f1f5f9", padding: "2px", borderRadius: "6px", gap: "2px" }}>
                      <button
                        type="button"
                        onClick={() => setEvolutivoTeamAgg("media")}
                        style={{
                          padding: "3px 8px",
                          borderRadius: "4px",
                          border: "none",
                          background: evolutivoTeamAgg === "media" ? "#ffffff" : "transparent",
                          color: evolutivoTeamAgg === "media" ? "#0f172a" : "#64748b",
                          fontWeight: evolutivoTeamAgg === "media" ? 700 : 500,
                          fontSize: "11px",
                          cursor: "pointer",
                          boxShadow: evolutivoTeamAgg === "media" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                        }}
                        title="Media por jugador participante en cada sesión"
                      >
                        Media / Jugador
                      </button>
                      <button
                        type="button"
                        onClick={() => setEvolutivoTeamAgg("total")}
                        style={{
                          padding: "3px 8px",
                          borderRadius: "4px",
                          border: "none",
                          background: evolutivoTeamAgg === "total" ? "#ffffff" : "transparent",
                          color: evolutivoTeamAgg === "total" ? "#0f172a" : "#64748b",
                          fontWeight: evolutivoTeamAgg === "total" ? 700 : 500,
                          fontSize: "11px",
                          cursor: "pointer",
                          boxShadow: evolutivoTeamAgg === "total" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                        }}
                        title="Suma total acumulada de todo el equipo"
                      >
                        Total Equipo
                      </button>
                    </div>
                  )}

                  <div style={{ width: "1px", height: "16px", background: "#e2e8f0" }} />

                  {/* Agrupación temporal: Por Sesión vs Por Microciclo */}
                  <div style={{ display: "inline-flex", alignItems: "center", background: "#f1f5f9", padding: "2px", borderRadius: "6px", gap: "2px" }}>
                    <button
                      type="button"
                      onClick={() => setEvolutivoTimeGrouping("sesion")}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        border: "none",
                        background: evolutivoTimeGrouping === "sesion" ? "#ffffff" : "transparent",
                        color: evolutivoTimeGrouping === "sesion" ? "#0f172a" : "#64748b",
                        fontWeight: evolutivoTimeGrouping === "sesion" ? 700 : 500,
                        fontSize: "11.5px",
                        cursor: "pointer",
                        boxShadow: evolutivoTimeGrouping === "sesion" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      }}
                    >
                      Por Sesión
                    </button>
                    <button
                      type="button"
                      onClick={() => setEvolutivoTimeGrouping("microciclo")}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        border: "none",
                        background: evolutivoTimeGrouping === "microciclo" ? "#ffffff" : "transparent",
                        color: evolutivoTimeGrouping === "microciclo" ? "#0f172a" : "#64748b",
                        fontWeight: evolutivoTimeGrouping === "microciclo" ? 700 : 500,
                        fontSize: "11.5px",
                        cursor: "pointer",
                        boxShadow: evolutivoTimeGrouping === "microciclo" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      }}
                    >
                      Por Microciclo
                    </button>
                  </div>

                  {/* Rango temporal */}
                  <div style={{ display: "inline-flex", alignItems: "center", background: "#f1f5f9", padding: "2px", borderRadius: "6px", gap: "2px" }}>
                    <button
                      type="button"
                      onClick={() => setEvolutivoTimeRange("30")}
                      style={{
                        padding: "4px 7px",
                        borderRadius: "4px",
                        border: "none",
                        background: evolutivoTimeRange === "30" ? "#ffffff" : "transparent",
                        color: evolutivoTimeRange === "30" ? "#0f172a" : "#64748b",
                        fontWeight: evolutivoTimeRange === "30" ? 700 : 500,
                        fontSize: "11px",
                        cursor: "pointer",
                        boxShadow: evolutivoTimeRange === "30" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      }}
                    >
                      30d
                    </button>
                    <button
                      type="button"
                      onClick={() => setEvolutivoTimeRange("60")}
                      style={{
                        padding: "4px 7px",
                        borderRadius: "4px",
                        border: "none",
                        background: evolutivoTimeRange === "60" ? "#ffffff" : "transparent",
                        color: evolutivoTimeRange === "60" ? "#0f172a" : "#64748b",
                        fontWeight: evolutivoTimeRange === "60" ? 700 : 500,
                        fontSize: "11px",
                        cursor: "pointer",
                        boxShadow: evolutivoTimeRange === "60" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      }}
                    >
                      60d
                    </button>
                    <button
                      type="button"
                      onClick={() => setEvolutivoTimeRange("todo")}
                      style={{
                        padding: "4px 7px",
                        borderRadius: "4px",
                        border: "none",
                        background: evolutivoTimeRange === "todo" ? "#ffffff" : "transparent",
                        color: evolutivoTimeRange === "todo" ? "#0f172a" : "#64748b",
                        fontWeight: evolutivoTimeRange === "todo" ? 700 : 500,
                        fontSize: "11px",
                        cursor: "pointer",
                        boxShadow: evolutivoTimeRange === "todo" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      }}
                    >
                      Todo
                    </button>
                  </div>

                  {/* Tipo de gráfico: Líneas vs Barras */}
                  <div style={{ display: "inline-flex", alignItems: "center", background: "#f1f5f9", padding: "2px", borderRadius: "6px", gap: "2px" }}>
                    <button
                      type="button"
                      onClick={() => setEvolutivoChartType("line")}
                      style={{
                        padding: "4px 7px",
                        borderRadius: "4px",
                        border: "none",
                        background: evolutivoChartType === "line" ? "#ffffff" : "transparent",
                        color: evolutivoChartType === "line" ? "#0f172a" : "#64748b",
                        fontWeight: evolutivoChartType === "line" ? 700 : 500,
                        fontSize: "11px",
                        cursor: "pointer",
                        boxShadow: evolutivoChartType === "line" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      }}
                      title="Gráfico de líneas continuas"
                    >
                      Líneas
                    </button>
                    <button
                      type="button"
                      onClick={() => setEvolutivoChartType("bar")}
                      style={{
                        padding: "4px 7px",
                        borderRadius: "4px",
                        border: "none",
                        background: evolutivoChartType === "bar" ? "#ffffff" : "transparent",
                        color: evolutivoChartType === "bar" ? "#0f172a" : "#64748b",
                        fontWeight: evolutivoChartType === "bar" ? 700 : 500,
                        fontSize: "11px",
                        cursor: "pointer",
                        boxShadow: evolutivoChartType === "bar" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      }}
                      title="Gráfico combinado de barras y líneas"
                    >
                      Barras
                    </button>
                  </div>

                  <div style={{ width: "1px", height: "16px", background: "#e2e8f0" }} />

                  {/* Toggle para Línea discontinua de 100% Partido */}
                  <button
                    type="button"
                    onClick={() => setShowMatchRefLine((prev) => !prev)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "4px 9px",
                      borderRadius: "6px",
                      border: showMatchRefLine ? "1px solid #fecaca" : "1px solid #e2e8f0",
                      background: showMatchRefLine ? "#fef2f2" : "#ffffff",
                      color: showMatchRefLine ? "#b91c1c" : "#64748b",
                      fontSize: "11.5px",
                      fontWeight: showMatchRefLine ? 700 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    title="Muestra u oculta la línea discontinua de referencia de 1 partido entero (100% demanda de competición)"
                  >
                    <span>⚽</span>
                    <span>Ref. Partido (100%)</span>
                    <span
                      style={{
                        fontSize: "9.5px",
                        fontWeight: 800,
                        padding: "1px 5px",
                        borderRadius: "4px",
                        background: showMatchRefLine ? "#fee2e2" : "#f1f5f9",
                        color: showMatchRefLine ? "#991b1b" : "#94a3b8",
                      }}
                    >
                      {showMatchRefLine ? "ON" : "OFF"}
                    </span>
                  </button>
                </div>
              </div>

              {/* BARRA DE SELECCIÓN DE VARIABLES (CHIPS ACTIVOS Y SELECTOR) */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", paddingTop: "4px" }}>
                <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#64748b" }}>
                  Variables a graficar:
                </span>

                {/* Chips de métricas frecuentes */}
                {[
                  { key: "Distance(m)", label: "Dist. Total" },
                  { key: "+ 24 km/h (Distancia)", label: "Sprint >24" },
                  { key: "+ 28 km/h (Distancia)", label: "Sprint >28" },
                  { key: "19.8 - 24 km/h (Distancia)", label: "HSR" },
                  { key: "Accelerations + Decelerations", label: "Acc + Dec" },
                  { key: "Player Load", label: "Player Load" },
                  { key: "MAX Speed(km/h)", label: "Vel. Máx" },
                ].map((m) => {
                  const isSelected = evolutivoVariables.includes(m.key);
                  const selIdx = evolutivoVariables.indexOf(m.key);
                  const pal = selIdx !== -1 ? EVOLUTIVO_PALETTE[selIdx % EVOLUTIVO_PALETTE.length] : null;

                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => handleToggleEvolutivoVar(m.key)}
                      style={{
                        padding: "3px 8px",
                        borderRadius: "5px",
                        border: isSelected && pal ? `1px solid ${pal.border}` : "1px solid #e2e8f0",
                        background: isSelected && pal ? pal.bg : "#ffffff",
                        color: isSelected && pal ? pal.darkText : "#475569",
                        fontSize: "11.5px",
                        fontWeight: isSelected ? 700 : 500,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        transition: "all 0.1s ease",
                      }}
                    >
                      {isSelected && pal && (
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: pal.stroke }} />
                      )}
                      <span>{m.label}</span>
                      {isSelected && (
                        <span style={{ fontSize: "9.5px", fontWeight: 800, color: pal?.stroke }}>
                          [{selIdx + 1}]
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Dropdown para añadir más variables del catálogo */}
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => setShowEvolutivoVarPicker((prev) => !prev)}
                    style={{
                      padding: "3px 9px",
                      borderRadius: "5px",
                      border: "1px solid #cbd5e1",
                      background: showEvolutivoVarPicker ? "#f1f5f9" : "#ffffff",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#334155",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span>+ Más variables</span>
                    <span style={{ fontSize: "8px" }}>{showEvolutivoVarPicker ? "▲" : "▼"}</span>
                  </button>

                  {showEvolutivoVarPicker && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        left: 0,
                        zIndex: 95,
                        background: "#ffffff",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
                        padding: "10px",
                        width: "280px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <input
                        type="text"
                        placeholder="Buscar variable..."
                        value={evolutivoVarSearch}
                        onChange={(e) => setEvolutivoVarSearch(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "5px 8px",
                          borderRadius: "5px",
                          border: "1px solid #cbd5e1",
                          fontSize: "11px",
                          outline: "none",
                        }}
                      />

                      <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}>
                        {ALL_GPS_VARIABLES
                          .filter((v) => {
                            if (!evolutivoVarSearch) return true;
                            return v.label.toLowerCase().includes(evolutivoVarSearch.toLowerCase()) || v.key.toLowerCase().includes(evolutivoVarSearch.toLowerCase());
                          })
                          .map((v) => {
                            const isSelected = evolutivoVariables.includes(v.key);
                            const nameObj = getVariableDisplayName(v.key, v);
                            return (
                              <button
                                key={v.key}
                                type="button"
                                onClick={() => {
                                  handleToggleEvolutivoVar(v.key);
                                }}
                                style={{
                                  padding: "4px 6px",
                                  borderRadius: "4px",
                                  border: "none",
                                  background: isSelected ? "#e0f2fe" : "transparent",
                                  color: isSelected ? "#0369a1" : "#334155",
                                  fontSize: "11px",
                                  textAlign: "left",
                                  cursor: "pointer",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <span style={{ fontWeight: isSelected ? 700 : 500 }}>{nameObj.full}</span>
                                <span style={{ fontSize: "10px", color: "#64748b" }}>{isSelected ? "✓" : "+"}</span>
                              </button>
                            );
                          })}
                      </div>

                      <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "6px", display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => setShowEvolutivoVarPicker(false)}
                          style={{
                            padding: "3px 8px",
                            borderRadius: "4px",
                            background: "#0f172a",
                            color: "#ffffff",
                            fontSize: "10.5px",
                            fontWeight: 700,
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CONTENEDOR DEL GRÁFICO RECHARTS */}
            <div style={{ padding: "16px 16px 8px 16px" }}>
              {evolutivoChartData.length === 0 ? (
                <div style={{ padding: "60px 20px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                  No se encontraron datos registrados para los filtros seleccionados.
                </div>
              ) : (
                <div style={{ width: "100%", height: 350 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={evolutivoChartData} margin={{ top: 15, right: evolutivoVariables.length > 1 ? 25 : 10, bottom: 25, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />

                      <XAxis
                        dataKey="xAxisLabel"
                        tick={<CustomEvolutivoXAxisTick />}
                        tickLine={false}
                        axisLine={{ stroke: "#e2e8f0" }}
                        height={46}
                      />

                      {/* Eje Y Izquierdo (Variable 1) */}
                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 11, fill: EVOLUTIVO_PALETTE[0].stroke }}
                        tickLine={false}
                        axisLine={{ stroke: "#e2e8f0" }}
                        tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))}
                      />

                      {/* Eje Y Derecho (Variable 2 si hay más de 1) */}
                      {evolutivoVariables.length > 1 && (
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{ fontSize: 11, fill: EVOLUTIVO_PALETTE[1].stroke }}
                          tickLine={false}
                          axisLine={{ stroke: "#e2e8f0" }}
                          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))}
                        />
                      )}

                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload || !payload.length) return null;
                          const dataPoint = payload[0]?.payload;
                          return (
                            <div
                              style={{
                                background: "#ffffff",
                                border: "1px solid #e2e8f0",
                                borderRadius: "8px",
                                padding: "10px 14px",
                                boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                                fontSize: "12px",
                                minWidth: "210px",
                              }}
                            >
                              <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: "5px", marginBottom: "6px" }}>
                                <strong style={{ color: "#0f172a", fontSize: "12px" }}>
                                  {dataPoint.fullLabel || dataPoint.fullDate || label}
                                </strong>
                                {dataPoint.sessionName && (
                                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                                    {dataPoint.sessionName} {dataPoint.participantes ? `· ${dataPoint.participantes} jug.` : ""}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                {payload.map((entry, idx) => {
                                  const vDef = getGpsVariableDef(entry.dataKey as string);
                                  const nameObj = getVariableDisplayName(entry.dataKey as string, vDef);
                                  const unit = vDef?.unit || "";
                                  const matchBench = getMatchBenchmark(entry.dataKey as string);
                                  const matchPct = matchBench && matchBench > 0
                                    ? Math.round((Number(entry.value) / matchBench) * 100)
                                    : null;

                                  return (
                                    <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: entry.color }} />
                                          <span style={{ color: "#475569", fontWeight: 600 }}>{nameObj.short}:</span>
                                        </div>
                                        <strong style={{ color: "#0f172a", fontFamily: "monospace" }}>
                                          {Number(entry.value).toLocaleString("es-ES")} {unit}
                                        </strong>
                                      </div>
                                      {matchPct !== null && (
                                        <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "10px", color: matchPct >= 100 ? "#dc2626" : matchPct >= 70 ? "#b45309" : "#64748b" }}>
                                          <span>{matchPct}% de 1 partido ({matchBench?.toLocaleString("es-ES")} {unit})</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }}
                      />

                      {/* LÍNEAS HORIZONTALES DISCONTINUAS CON VALORES DE 100% PARTIDO */}
                      {showMatchRefLine && (() => {
                        const primKey = evolutivoVariables[0];
                        const primBench = primKey ? getMatchBenchmark(primKey) : null;
                        const primDef = primKey ? getGpsVariableDef(primKey) : undefined;
                        const primUnit = primDef?.unit || "";

                        const secKey = evolutivoVariables.length > 1 ? evolutivoVariables[1] : null;
                        const secBench = secKey ? getMatchBenchmark(secKey) : null;
                        const secDef = secKey ? getGpsVariableDef(secKey) : undefined;
                        const secUnit = secDef?.unit || "";

                        return (
                          <>
                            {primBench !== null && (
                              <ReferenceLine
                                yAxisId="left"
                                y={primBench}
                                stroke="#ef4444"
                                strokeDasharray="5 5"
                                strokeWidth={1.8}
                                strokeOpacity={0.85}
                                label={{
                                  value: `100% Partido (${primBench.toLocaleString("es-ES")} ${primUnit})`,
                                  position: "top",
                                  fill: "#dc2626",
                                  fontSize: 10.5,
                                  fontWeight: 800,
                                }}
                              />
                            )}
                            {secBench !== null && evolutivoVariables.length > 1 && (
                              <ReferenceLine
                                yAxisId="right"
                                y={secBench}
                                stroke={EVOLUTIVO_PALETTE[1].stroke}
                                strokeDasharray="4 4"
                                strokeWidth={1.6}
                                strokeOpacity={0.8}
                                label={{
                                  value: `100% Part: ${secBench.toLocaleString("es-ES")} ${secUnit}`,
                                  position: "insideTopRight",
                                  fill: EVOLUTIVO_PALETTE[1].darkText,
                                  fontSize: 10,
                                  fontWeight: 800,
                                }}
                              />
                            )}
                          </>
                        );
                      })()}

                      <Legend
                        wrapperStyle={{ fontSize: "11.5px", paddingTop: "8px", fontWeight: 700 }}
                        formatter={(val) => {
                          const vDef = getGpsVariableDef(val);
                          const nameObj = getVariableDisplayName(val, vDef);
                          return nameObj.full;
                        }}
                      />

                      {/* Series según tipo de gráfico */}
                      {evolutivoVariables.map((varKey, idx) => {
                        const pal = EVOLUTIVO_PALETTE[idx % EVOLUTIVO_PALETTE.length];
                        const axisId = idx === 0 ? "left" : "right";

                        if (evolutivoChartType === "bar" && idx === 0) {
                          return (
                            <Bar
                              key={varKey}
                              yAxisId={axisId}
                              dataKey={varKey}
                              fill={pal.fill}
                              radius={[4, 4, 0, 0]}
                              opacity={0.85}
                            />
                          );
                        }

                        return (
                          <Line
                            key={varKey}
                            yAxisId={axisId}
                            type="monotone"
                            dataKey={varKey}
                            stroke={pal.stroke}
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: pal.stroke }}
                            activeDot={{ r: 6 }}
                            connectNulls={true}
                          />
                        );
                      })}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* TARJETAS RESUMEN DE KPIS BAJO EL GRÁFICO */}
            <div style={{ padding: "10px 16px 14px 16px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", borderBottomLeftRadius: "9px", borderBottomRightRadius: "9px" }}>
              {evolutivoVariables.map((varKey, idx) => {
                const pal = EVOLUTIVO_PALETTE[idx % EVOLUTIVO_PALETTE.length];
                const vDef = getGpsVariableDef(varKey);
                const nameObj = getVariableDisplayName(varKey, vDef);
                const unit = vDef?.unit || "";

                const vals = evolutivoChartData.map((d) => d[varKey]).filter((v) => typeof v === "number" && !isNaN(v));
                const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
                const max = vals.length > 0 ? Math.max(...vals) : 0;
                const last = vals.length > 0 ? vals[vals.length - 1] : 0;

                return (
                  <div
                    key={varKey}
                    style={{
                      background: "#ffffff",
                      borderRadius: "7px",
                      border: `1px solid ${pal.border}`,
                      padding: "8px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "11px", fontWeight: 800, color: pal.darkText }}>
                        {nameObj.full}
                      </span>
                      <span style={{ fontSize: "9px", fontWeight: 800, background: pal.bg, color: pal.stroke, padding: "1px 5px", borderRadius: "4px" }}>
                        Eje {idx === 0 ? "Izq" : "Der"}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: "2px" }}>
                      <div>
                        <span style={{ fontSize: "10px", color: "#64748b" }}>Media: </span>
                        <strong style={{ fontSize: "13px", color: "#0f172a" }}>
                          {avg.toLocaleString("es-ES")}
                        </strong>
                        <span style={{ fontSize: "10px", color: "#64748b", marginLeft: "2px" }}>{unit}</span>
                      </div>
                      <div style={{ fontSize: "10.5px", color: "#475569" }}>
                        <span>Pico: </span>
                        <strong>{max.toLocaleString("es-ES")}</strong>
                      </div>
                    </div>

                    {/* Referencia de 1 partido en tarjeta KPI */}
                    {(() => {
                      const matchRef = getMatchBenchmark(varKey);
                      if (!matchRef) return null;
                      return (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px dashed #e2e8f0", paddingTop: "4px", marginTop: "2px", fontSize: "10px" }}>
                          <span style={{ color: "#64748b" }}>⚽ 100% Partido:</span>
                          <strong style={{ color: "#dc2626" }}>
                            {matchRef.toLocaleString("es-ES")} {unit}
                          </strong>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── TABLA EVOLUTIVA DETALLADA Y CLARA ── */}
          {(() => {
            // Filtrado de la tabla según filtro activo (todos, partidos, entrenos)
            const allItems = evolutivoTableOrder === "desc" ? [...evolutivoChartData].reverse() : [...evolutivoChartData];
            const filteredItems = allItems.filter((row) => {
              const isMatch = row.isMatch === true || row.md === "MD" || String(row.sessionName || "").toUpperCase().includes("PARTIDO");
              if (evolutivoTableFilter === "partidos") return isMatch;
              if (evolutivoTableFilter === "entrenos") return !isMatch;
              return true;
            });

            const totalMatches = allItems.filter((r) => r.isMatch === true || r.md === "MD" || String(r.sessionName || "").toUpperCase().includes("PARTIDO")).length;
            const totalTrainings = allItems.length - totalMatches;

            // Separación para promedios en footer
            const matchRows = allItems.filter((r) => r.isMatch === true || r.md === "MD" || String(r.sessionName || "").toUpperCase().includes("PARTIDO"));
            const trainingRows = allItems.filter((r) => !(r.isMatch === true || r.md === "MD" || String(r.sessionName || "").toUpperCase().includes("PARTIDO")));

            const formatRowDate = (dateStr: string) => {
              if (!dateStr) return "";
              try {
                const parts = dateStr.split("-");
                if (parts.length === 3) {
                  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
                  const dayName = days[d.getDay()] || "";
                  return `${dayName} ${parts[2]}/${parts[1]}`;
                }
              } catch {}
              return dateStr;
            };

            return (
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px -2px rgba(15, 23, 42, 0.05)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* BARRA SUPERIOR EJECUTIVA DE LA TABLA */}
                <div
                  style={{
                    padding: "12px 18px",
                    borderBottom: "1px solid #f1f5f9",
                    background: "#f8fafc",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "12px",
                  }}
                >
                  {/* Título y Sujeto */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.01em" }}>
                        📋 Registro Evolutivo Detallado
                      </span>
                      <span
                        style={{
                          fontSize: "10.5px",
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: "5px",
                          background: "#e0f2fe",
                          color: "#0369a1",
                          border: "1px solid #bae6fd",
                        }}
                      >
                        {evolutivoTimeGrouping === "sesion" ? "Día a Día" : "Microciclos"}
                      </span>
                    </div>

                    <span style={{ color: "#cbd5e1" }}>·</span>

                    {/* Badge Sujeto */}
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "2px 9px",
                        borderRadius: "6px",
                        background: "#ffffff",
                        color: "#1e293b",
                        border: "1px solid #cbd5e1",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                      }}
                    >
                      {evolutivoTarget === "equipo"
                        ? (evolutivoTeamAgg === "media" ? "👥 Media / Jugador" : "👥 Total Acumulado")
                        : (() => {
                            const pl = jugadores.find((x) => x.id === evolutivoPlayerId) || jugadores[0];
                            return pl ? `👤 ${pl.dorsal ? '#' + pl.dorsal + ' ' : ''}${pl.apodo || pl.nombre}` : '👤 Jugador';
                          })()
                      }
                    </span>

                    {/* Badge Fuente de datos */}
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "6px",
                        background: evolutivoDataSource === "reales" ? "#f0fdf4" : "#f0f9ff",
                        color: evolutivoDataSource === "reales" ? "#15803d" : "#0284c7",
                        border: evolutivoDataSource === "reales" ? "1px solid #bbf7d0" : "1px solid #bae6fd",
                      }}
                    >
                      {evolutivoDataSource === "reales" ? "🟢 Solo Reales" : "🌐 Reales + Simulados"}
                    </span>
                  </div>

                  {/* CONTROLES Y FILTROS DE TABLA */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    {/* Filtro Tipo: Todas / Partidos / Entrenos */}
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        background: "#e2e8f0",
                        padding: "2px",
                        borderRadius: "7px",
                        gap: "2px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setEvolutivoTableFilter("todos")}
                        style={{
                          padding: "3px 9px",
                          borderRadius: "5px",
                          border: "none",
                          background: evolutivoTableFilter === "todos" ? "#ffffff" : "transparent",
                          color: evolutivoTableFilter === "todos" ? "#0f172a" : "#64748b",
                          fontWeight: evolutivoTableFilter === "todos" ? 700 : 500,
                          fontSize: "11px",
                          cursor: "pointer",
                          boxShadow: evolutivoTableFilter === "todos" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                        }}
                      >
                        Todas ({allItems.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setEvolutivoTableFilter("partidos")}
                        style={{
                          padding: "3px 9px",
                          borderRadius: "5px",
                          border: "none",
                          background: evolutivoTableFilter === "partidos" ? "#ffffff" : "transparent",
                          color: evolutivoTableFilter === "partidos" ? "#b91c1c" : "#64748b",
                          fontWeight: evolutivoTableFilter === "partidos" ? 800 : 500,
                          fontSize: "11px",
                          cursor: "pointer",
                          boxShadow: evolutivoTableFilter === "partidos" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <span>⚽ Partidos</span>
                        <span style={{ fontSize: "10px", opacity: 0.8 }}>({totalMatches})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEvolutivoTableFilter("entrenos")}
                        style={{
                          padding: "3px 9px",
                          borderRadius: "5px",
                          border: "none",
                          background: evolutivoTableFilter === "entrenos" ? "#ffffff" : "transparent",
                          color: evolutivoTableFilter === "entrenos" ? "#0369a1" : "#64748b",
                          fontWeight: evolutivoTableFilter === "entrenos" ? 800 : 500,
                          fontSize: "11px",
                          cursor: "pointer",
                          boxShadow: evolutivoTableFilter === "entrenos" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <span>🏃 Entrenos</span>
                        <span style={{ fontSize: "10px", opacity: 0.8 }}>({totalTrainings})</span>
                      </button>
                    </div>

                    {/* Toggle % Demanda de Partido */}
                    <button
                      type="button"
                      onClick={() => setEvolutivoTableShowPct(!evolutivoTableShowPct)}
                      style={{
                        padding: "4px 9px",
                        borderRadius: "6px",
                        border: evolutivoTableShowPct ? "1px solid #c7d2fe" : "1px solid #e2e8f0",
                        background: evolutivoTableShowPct ? "#eef2ff" : "#ffffff",
                        color: evolutivoTableShowPct ? "#4338ca" : "#64748b",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                      title="Activar o desactivar el % de demanda de partido (100% MD)"
                    >
                      <span style={{ fontSize: "10px" }}>📊</span>
                      <span>% Ref: {evolutivoTableShowPct ? "ON" : "OFF"}</span>
                    </button>

                    {/* Orden: Recientes vs Cronológico */}
                    <div style={{ display: "inline-flex", alignItems: "center", background: "#e2e8f0", padding: "2px", borderRadius: "6px", gap: "2px" }}>
                      <button
                        type="button"
                        onClick={() => setEvolutivoTableOrder("desc")}
                        title="Sesiones más recientes arriba"
                        style={{
                          padding: "3px 7px",
                          borderRadius: "4px",
                          border: "none",
                          background: evolutivoTableOrder === "desc" ? "#ffffff" : "transparent",
                          color: evolutivoTableOrder === "desc" ? "#0f172a" : "#64748b",
                          fontWeight: evolutivoTableOrder === "desc" ? 700 : 500,
                          fontSize: "11px",
                          cursor: "pointer",
                        }}
                      >
                        Recientes ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => setEvolutivoTableOrder("asc")}
                        title="Orden cronológico antiguo a nuevo"
                        style={{
                          padding: "3px 7px",
                          borderRadius: "4px",
                          border: "none",
                          background: evolutivoTableOrder === "asc" ? "#ffffff" : "transparent",
                          color: evolutivoTableOrder === "asc" ? "#0f172a" : "#64748b",
                          fontWeight: evolutivoTableOrder === "asc" ? 700 : 500,
                          fontSize: "11px",
                          cursor: "pointer",
                        }}
                      >
                        Cronológico ↑
                      </button>
                    </div>
                  </div>
                </div>

                {/* TABLA PRINCIPAL CON DISEÑO SLEEK */}
                <div style={{ overflowX: "auto", maxHeight: "480px", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "12px", color: "#0f172a" }}>
                    <thead>
                      <tr
                        style={{
                          background: "#f8fafc",
                          color: "#475569",
                          fontSize: "11px",
                          position: "sticky",
                          top: 0,
                          zIndex: 10,
                          boxShadow: "0 1px 0 #e2e8f0",
                        }}
                      >
                        {/* Fecha & Sesión */}
                        <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 800, minWidth: "180px", background: "#f8fafc" }}>
                          Fecha & Sesión
                        </th>

                        {/* Match Day / Periodo */}
                        <th style={{ padding: "10px 10px", textAlign: "center", fontWeight: 800, minWidth: "95px", background: "#f8fafc" }}>
                          {evolutivoTimeGrouping === "sesion" ? "Match Day" : "Sesiones"}
                        </th>

                        {/* Jugadores participantes (si equipo) */}
                        {evolutivoTarget === "equipo" && (
                          <th style={{ padding: "10px 10px", textAlign: "center", fontWeight: 800, minWidth: "85px", background: "#f8fafc" }}>
                            Muestra
                          </th>
                        )}

                        {/* Columnas métricas dinámicas */}
                        {evolutivoVariables.map((varKey, idx) => {
                          const vDef = getGpsVariableDef(varKey);
                          const nameObj = getVariableDisplayName(varKey, vDef);
                          const pal = EVOLUTIVO_PALETTE[idx % EVOLUTIVO_PALETTE.length];
                          const unit = vDef?.unit || "";

                          return (
                            <th
                              key={varKey}
                              style={{
                                padding: "10px 14px",
                                textAlign: "right",
                                fontWeight: 800,
                                minWidth: "140px",
                                background: "#f8fafc",
                                borderLeft: "1px solid #f1f5f9",
                              }}
                            >
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                  <span
                                    style={{
                                      width: "8px",
                                      height: "8px",
                                      borderRadius: "50%",
                                      background: pal.stroke,
                                      display: "inline-block",
                                      boxShadow: `0 0 0 2px ${pal.stroke}33`,
                                    }}
                                  />
                                  <span style={{ color: "#0f172a", fontSize: "11.5px", fontWeight: 800 }}>
                                    {nameObj.full}
                                  </span>
                                </div>
                                {unit && (
                                  <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600, padding: "0 2px" }}>
                                    [{unit}]
                                  </span>
                                )}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>

                    <tbody>
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3 + evolutivoVariables.length}
                            style={{ padding: "36px", textAlign: "center", color: "#94a3b8", fontSize: "12.5px" }}
                          >
                            No hay registros que coincidan con el filtro seleccionado.
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((row, rIdx) => {
                          const isMatch = row.isMatch === true || row.md === "MD" || String(row.sessionName || "").toUpperCase().includes("PARTIDO");

                          return (
                            <tr
                              key={row.date + rIdx}
                              style={{
                                borderBottom: "1px solid #f1f5f9",
                                background: isMatch ? "#fffafa" : rIdx % 2 === 0 ? "#ffffff" : "#fbfcfe",
                                transition: "background 0.1s ease",
                              }}
                            >
                              {/* Fecha & Sesión */}
                              <td
                                style={{
                                  padding: "9px 16px",
                                  borderLeft: isMatch ? "4px solid #ef4444" : "4px solid transparent",
                                }}
                              >
                                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span style={{ fontWeight: 800, color: isMatch ? "#991b1b" : "#0f172a", fontSize: "12.5px" }}>
                                      {formatRowDate(row.fullDate || row.date)}
                                    </span>
                                    <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 500 }}>
                                      ({row.fullDate || row.date})
                                    </span>
                                  </div>
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      color: isMatch ? "#dc2626" : "#64748b",
                                      fontWeight: isMatch ? 700 : 500,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      maxWidth: "240px",
                                    }}
                                    title={row.sessionName || row.label || "Sesión"}
                                  >
                                    {row.sessionName || row.label || "Sesión"}
                                  </span>
                                </div>
                              </td>

                              {/* MD Badge */}
                              <td style={{ padding: "9px 10px", textAlign: "center" }}>
                                {evolutivoTimeGrouping === "sesion" ? (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                      padding: "3px 8px",
                                      borderRadius: "5px",
                                      fontSize: "11px",
                                      fontWeight: 800,
                                      background: isMatch ? "#fee2e2" : row.md?.includes("+") ? "#dcfce7" : "#e0f2fe",
                                      color: isMatch ? "#b91c1c" : row.md?.includes("+") ? "#15803d" : "#0369a1",
                                      border: isMatch ? "1px solid #fecaca" : row.md?.includes("+") ? "1px solid #bbf7d0" : "1px solid #bae6fd",
                                    }}
                                  >
                                    {isMatch ? "⚽ MD" : row.md || "ENT"}
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "2px 7px",
                                      borderRadius: "4px",
                                      background: "#f1f5f9",
                                      color: "#0f172a",
                                      fontWeight: 700,
                                      fontSize: "11px",
                                    }}
                                  >
                                    {row.sessionsCount || 0} ses.
                                  </span>
                                )}
                              </td>

                              {/* Jugadores participantes (si equipo) */}
                              {evolutivoTarget === "equipo" && (
                                <td style={{ padding: "9px 10px", textAlign: "center" }}>
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: isMatch ? 800 : 600,
                                      color: isMatch ? "#b91c1c" : "#475569",
                                      background: isMatch ? "#fee2e2" : "#f1f5f9",
                                      padding: "2px 7px",
                                      borderRadius: "4px",
                                    }}
                                    title={isMatch ? "Jugadores que completaron 1ª y 2ª parte" : "Jugadores registrados en la sesión"}
                                  >
                                    {row.participantes ? `${row.participantes} jug.` : "—"}
                                  </span>
                                </td>
                              )}

                              {/* Celdas de Métricas */}
                              {evolutivoVariables.map((varKey) => {
                                const val = row[varKey];
                                const matchRef = getMatchBenchmark(varKey);
                                const pct = typeof val === "number" && matchRef && matchRef > 0
                                  ? Math.round((val / matchRef) * 100)
                                  : null;

                                return (
                                  <td
                                    key={varKey}
                                    style={{
                                      padding: "9px 14px",
                                      textAlign: "right",
                                      borderLeft: "1px solid #f1f5f9",
                                    }}
                                  >
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
                                      {/* Valor principal grande y nítido */}
                                      <span
                                        style={{
                                          fontWeight: 800,
                                          color: isMatch ? "#0f172a" : "#1e293b",
                                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                                          fontSize: "13px",
                                          letterSpacing: "-0.01em",
                                        }}
                                      >
                                        {typeof val === "number" ? val.toLocaleString("es-ES") : "—"}
                                      </span>

                                      {/* Micro Barra y Tag de % Demanda de Partido */}
                                      {evolutivoTableShowPct && pct !== null && (
                                        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "1px" }}>
                                          {/* Micro-bar visual */}
                                          <div
                                            style={{
                                              width: "36px",
                                              height: "4px",
                                              borderRadius: "2px",
                                              background: "#e2e8f0",
                                              overflow: "hidden",
                                            }}
                                            title={`${pct}% de la demanda de partido`}
                                          >
                                            <div
                                              style={{
                                                width: `${Math.min(pct, 100)}%`,
                                                height: "100%",
                                                borderRadius: "2px",
                                                background: pct >= 100 ? "#ef4444" : pct >= 75 ? "#f97316" : "#3b82f6",
                                              }}
                                            />
                                          </div>

                                          {/* Pill Porcentaje */}
                                          <span
                                            style={{
                                              fontSize: "10px",
                                              fontWeight: 800,
                                              padding: "1px 5px",
                                              borderRadius: "3px",
                                              background: pct >= 100 ? "#fee2e2" : pct >= 75 ? "#ffedd5" : "#f1f5f9",
                                              color: pct >= 100 ? "#b91c1c" : pct >= 75 ? "#c2410c" : "#475569",
                                              minWidth: "32px",
                                              textAlign: "center",
                                            }}
                                          >
                                            {pct}%
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      )}
                    </tbody>

                    {/* FOOTER EJECUTIVO CON BENCHMARKING SEPARADO (ENTRENOS vs PARTIDOS) */}
                    <tfoot>
                      {/* FILA 1: PROMEDIO DE ENTRENAMIENTOS (MD-4 a MD-1) */}
                      <tr style={{ background: "#f8fafc", borderTop: "2px solid #cbd5e1", fontSize: "11.5px" }}>
                        <td style={{ padding: "9px 16px", fontWeight: 800, color: "#0f172a" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>🏃</span>
                            <span>PROMEDIO ENTRENAMIENTOS</span>
                            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>({trainingRows.length} ses.)</span>
                          </div>
                        </td>
                        <td style={{ padding: "9px 10px", textAlign: "center", color: "#64748b", fontWeight: 700 }}>ENT</td>
                        {evolutivoTarget === "equipo" && (
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#64748b" }}>—</td>
                        )}
                        {evolutivoVariables.map((varKey) => {
                          const vals = trainingRows.map((d) => d[varKey]).filter((v) => typeof v === "number" && !isNaN(v));
                          const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
                          const matchRef = getMatchBenchmark(varKey);
                          const pct = matchRef && matchRef > 0 ? Math.round((avg / matchRef) * 100) : null;

                          return (
                            <td key={varKey} style={{ padding: "9px 14px", textAlign: "right", borderLeft: "1px solid #e2e8f0" }}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "1px" }}>
                                <span style={{ color: "#0f172a", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: "12.5px", fontWeight: 800 }}>
                                  {avg.toLocaleString("es-ES")}
                                </span>
                                {evolutivoTableShowPct && pct !== null && (
                                  <span style={{ fontSize: "10px", color: "#0369a1", fontWeight: 700 }}>
                                    {pct}% partido
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>

                      {/* FILA 2: PROMEDIO DE PARTIDOS OFICIALES (90' / 1ª y 2ª parte) */}
                      <tr style={{ background: "#fff5f5", borderTop: "1px solid #fee2e2", fontSize: "11.5px" }}>
                        <td style={{ padding: "9px 16px", fontWeight: 800, color: "#991b1b" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>⚽</span>
                            <span>PROMEDIO PARTIDOS</span>
                            <span style={{ fontSize: "10px", color: "#dc2626", fontWeight: 600 }}>({matchRows.length} part. 1ª+2ª)</span>
                          </div>
                        </td>
                        <td style={{ padding: "9px 10px", textAlign: "center", color: "#dc2626", fontWeight: 800 }}>MD</td>
                        {evolutivoTarget === "equipo" && (
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#dc2626" }}>—</td>
                        )}
                        {evolutivoVariables.map((varKey) => {
                          const vals = matchRows.map((d) => d[varKey]).filter((v) => typeof v === "number" && !isNaN(v));
                          const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
                          const matchRef = getMatchBenchmark(varKey);
                          const pct = matchRef && matchRef > 0 ? Math.round((avg / matchRef) * 100) : null;

                          return (
                            <td key={varKey} style={{ padding: "9px 14px", textAlign: "right", borderLeft: "1px solid #fecaca" }}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "1px" }}>
                                <span style={{ color: "#991b1b", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: "12.5px", fontWeight: 900 }}>
                                  {avg.toLocaleString("es-ES")}
                                </span>
                                {evolutivoTableShowPct && pct !== null && (
                                  <span style={{ fontSize: "10px", color: "#b91c1c", fontWeight: 800 }}>
                                    {pct}% demanda
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>

                      {/* FILA 3: 100% DEMANDA DE COMPETICIÓN (BENCHMARK) */}
                      <tr style={{ background: "#fef2f2", borderTop: "1px solid #fecaca", fontSize: "11.5px" }}>
                        <td style={{ padding: "9px 16px", fontWeight: 800, color: "#7f1d1d" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>🎯</span>
                            <span>100% DEMANDA PARTIDO (REF)</span>
                          </div>
                        </td>
                        <td style={{ padding: "9px 10px", textAlign: "center", color: "#991b1b", fontWeight: 800 }}>100%</td>
                        {evolutivoTarget === "equipo" && (
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#991b1b" }}>—</td>
                        )}
                        {evolutivoVariables.map((varKey) => {
                          const matchRef = getMatchBenchmark(varKey);

                          return (
                            <td key={varKey} style={{ padding: "9px 14px", textAlign: "right", borderLeft: "1px solid #fecaca", color: "#7f1d1d" }}>
                              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: "12.5px", fontWeight: 900 }}>
                                {matchRef !== null ? matchRef.toLocaleString("es-ES") : "—"}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      
{/* ── SUB-PESTAÑA 5: SESIONES & BBDD ── */}
      {subTab === "sesiones_bbdd" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              background: "#ffffff",
              padding: "16px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#0f172a" }}>
                📁 Gestión de Archivos GPS & Sincronización
              </h4>
              <span style={{ fontSize: "11.5px", color: "#64748b" }}>
                Sincroniza directamente desde la carpeta Downloads o carga archivos CSV / Excel puntuales.
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={handleUpdateGps || handleSyncDownloadsGps}
                disabled={isGpsUploading}
                style={{
                  background: isGpsUploading ? "#94a3b8" : "#ea580c",
                  color: "#ffffff",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 800,
                  border: "none",
                  cursor: isGpsUploading ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 1px 4px rgba(234,88,12,0.25)",
                }}
              >
                <span>{isGpsUploading ? "⏳" : "🔄"}</span>
                <span>{isGpsUploading ? "Actualizando GPS..." : "Actualizar GPS (Downloads y BBDD)"}</span>
              </button>

              <label
                style={{
                  background: isGpsUploading ? "#94a3b8" : "#0284c7",
                  color: "#ffffff",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: isGpsUploading ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>📁</span>
                <span>Seleccionar CSV</span>
                <input
                  type="file"
                  multiple
                  accept=".csv, .tsv, .xlsx, .xls"
                  onChange={handleGpsCsvUpload}
                  disabled={isGpsUploading}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </div>

          {gpsUploadStatus && (
            <div
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                background: gpsUploadStatus.isError ? "#fee2e2" : "#dcfce7",
                color: gpsUploadStatus.isError ? "#b91c1c" : "#15803d",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              {gpsUploadStatus.message}
            </div>
          )}

          <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #cbd5e1", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a" }}>
                  📅 Registros de Sesión
                </span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                />
              </div>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                {gpsRecords.filter((r) => r.fecha === selectedDate).length} registros en esta fecha
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", color: "#0f172a" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", textAlign: "left", color: "#475569" }}>
                    <th style={{ padding: "8px 10px" }}>Jugador</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>Distancia (m)</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>HSR (m)</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>Top Speed (km/h)</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>Player Load (AU)</th>
                    <th style={{ padding: "8px 10px", textAlign: "center" }}>Sprints</th>
                    <th style={{ padding: "8px 10px", textAlign: "center" }}>Tipo Sesión</th>
                  </tr>
                </thead>
                <tbody>
                  {jugadores.map((j, idx) => {
                    const rec = gpsRecords.find((r) => r.jugador_id === j.id && r.fecha === selectedDate);
                    const dist = rec ? Math.round(Number(rec.distancia_total) || 0) : 0;
                    const hsr = rec ? Math.round(Number(rec.distancia_z4) || 0) : 0;
                    const topSpd = rec ? Number(rec.max_speed) || 0 : 0;
                    const load = rec ? Math.round(Number(rec.player_load) || 0) : 0;
                    const sprints = rec ? Math.round(Number(rec.num_sprints) || 0) : 0;
                    const tipoSesion = rec ? rec.tipo_sesion || "Entrenamiento" : "-";

                    return (
                      <tr key={j.id || idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {renderDisponibilidadBadge && renderDisponibilidadBadge(j)}
                            <span style={{ fontWeight: 700 }}>{(j.apodo || j.nombre || "").toUpperCase()}</span>
                          </div>
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 800 }}>{dist > 0 ? dist.toLocaleString("es-ES") : "-"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "#ea580c", fontWeight: 700 }}>{hsr > 0 ? hsr.toLocaleString("es-ES") : "-"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "#9333ea", fontWeight: 800 }}>{topSpd > 0 ? topSpd.toFixed(1) : "-"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "#0284c7", fontWeight: 700 }}>{load > 0 ? load.toLocaleString("es-ES") : "-"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 800 }}>{sprints > 0 ? sprints : "-"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center", fontSize: "11px" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                            <span style={{ color: "#64748b" }}>{tipoSesion}</span>
                            {rec && (
                              <span style={{ fontSize: "9.5px", fontWeight: 800, padding: "1px 5px", borderRadius: "4px", background: isRecordSimulado(rec) ? "#fef3c7" : "#dcfce7", color: isRecordSimulado(rec) ? "#b45309" : "#15803d" }}>
                                {isRecordSimulado(rec) ? "SIMULADO" : "REAL"}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: GESTIÓN DE MICROCICLOS PERSONALIZADOS ── */}
      {/* Modal de Personalización de Ratios Individuales para un Jugador */}
      {selectedPlayerForTarget && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
          onClick={() => setSelectedPlayerForTarget(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "520px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #e2e8f0",
                background: "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#0f172a" }}>
                  🎯 Ratios Exigidos: {selectedPlayerForTarget.dorsal ? "#" + selectedPlayerForTarget.dorsal + " " : ""}{selectedPlayerForTarget.apodo || selectedPlayerForTarget.nombre}
                </h3>
                <p style={{ margin: "2px 0 0 0", fontSize: "11.5px", color: "#64748b" }}>
                  Personaliza los multiplicadores de partido exigidos para este jugador en el microciclo activo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlayerForTarget(null)}
                style={{ background: "none", border: "none", fontSize: "18px", color: "#64748b", cursor: "pointer", fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "16px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#475569" }}>
                Variables activas en el panel ({selectedRatioKeys.length}):
              </div>

              {activeRatioKeys.map((key) => {
                const vDef = getGpsVariableDef(key);
                const nameObj = getVariableDisplayName(key, vDef);
                const teamTarget = teamRatioTargets[key] ?? getDefaultRatioTargetForKey(key);
                const playerVal = playerCustomTargets[selectedPlayerForTarget.id]?.[key];
                const hasCustom = playerVal !== undefined;
                const isDt = key === "Distance(m)";

                return (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: hasCustom ? "1.5px solid #f59e0b" : isDt ? "1.5px solid #93c5fd" : "1px solid #e2e8f0",
                      background: hasCustom ? "#fffbeb" : isDt ? "#f0f9ff" : "#ffffff",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <strong style={{ fontSize: "13px", color: "#0f172a" }}>
                          {nameObj.full}
                        </strong>
                        {isDt && (
                          <span style={{ fontSize: "9.5px", background: "#dbeafe", color: "#1d4ed8", padding: "1px 5px", borderRadius: "4px", fontWeight: 800 }}>
                            Columna 1 Fija
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>
                        Objetivo de equipo: <strong>{teamTarget}x</strong>
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="10"
                        placeholder={String(teamTarget)}
                        value={hasCustom ? playerVal : ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val > 0) {
                            handleUpdatePlayerTarget(selectedPlayerForTarget.id, key, val);
                          }
                        }}
                        style={{
                          width: "70px",
                          padding: "5px 8px",
                          borderRadius: "6px",
                          border: hasCustom ? "1.5px solid #d97706" : "1px solid #cbd5e1",
                          fontWeight: 800,
                          fontSize: "13px",
                          textAlign: "center",
                          color: hasCustom ? "#b45309" : "#0f172a",
                          background: "#ffffff",
                        }}
                      />
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>x</span>

                      {hasCustom && (
                        <button
                          type="button"
                          onClick={() => {
                            const current = { ...(playerCustomTargets[selectedPlayerForTarget.id] || {}) };
                            delete current[key];
                            const next = { ...playerCustomTargets, [selectedPlayerForTarget.id]: current };
                            setPlayerCustomTargets(next);
                            if (typeof window !== "undefined") {
                              localStorage.setItem("gps_player_custom_targets_map", JSON.stringify(next));
                            }
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#dc2626",
                            fontSize: "14px",
                            cursor: "pointer",
                            padding: "2px",
                          }}
                          title="Restablecer al objetivo general de equipo"
                        >
                          🔄
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                padding: "12px 20px",
                borderTop: "1px solid #e2e8f0",
                background: "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <button
                type="button"
                onClick={() => handleResetPlayerTarget(selectedPlayerForTarget.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#64748b",
                  fontSize: "11.5px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                🔄 Restablecer todos a equipo
              </button>

              <button
                type="button"
                onClick={() => setSelectedPlayerForTarget(null)}
                style={{
                  padding: "6px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#0f172a",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal General de Jugadores con Objetivos Individuales */}
      {showAllIndividualTargetsModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
          onClick={() => setShowAllIndividualTargetsModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "600px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #e2e8f0",
                background: "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#0f172a" }}>
                  ⚙️ Gestión de Objetivos Individuales de Ratios
                </h3>
                <p style={{ margin: "2px 0 0 0", fontSize: "11.5px", color: "#64748b" }}>
                  Selecciona cualquier jugador para asignarle ratios personalizados diferentes a los del equipo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAllIndividualTargetsModal(false)}
                style={{ background: "none", border: "none", fontSize: "18px", color: "#64748b", cursor: "pointer", fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "16px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {jugadores.map((j) => {
                const pCustom = playerCustomTargets[j.id];
                const hasCustom = Boolean(pCustom && Object.keys(pCustom).length > 0);
                const countCustom = hasCustom ? Object.keys(pCustom).length : 0;

                return (
                  <div
                    key={j.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: hasCustom ? "1.5px solid #f59e0b" : "1px solid #e2e8f0",
                      background: hasCustom ? "#fffbeb" : "#ffffff",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: 800, color: "#0f172a", fontSize: "13px" }}>
                        {j.dorsal ? "#" + j.dorsal + " " : ""}{j.apodo || j.nombre}
                      </span>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>
                        ({j.posicion || "Jugador"})
                      </span>
                      {hasCustom && (
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 800,
                            padding: "1px 6px",
                            borderRadius: "4px",
                            background: "#fef3c7",
                            color: "#92400e",
                            border: "1px solid #fde047",
                          }}
                        >
                          {countCustom} custom
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {hasCustom && (
                        <button
                          type="button"
                          onClick={() => handleResetPlayerTarget(j.id)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: "5px",
                            border: "1px solid #fca5a5",
                            background: "#fef2f2",
                            color: "#b91c1c",
                            fontSize: "11px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Restablecer
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPlayerForTarget(j);
                          setShowAllIndividualTargetsModal(false);
                        }}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "5px",
                          border: "1px solid #0284c7",
                          background: "#0284c7",
                          color: "#ffffff",
                          fontSize: "11px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Editar Ratios
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                padding: "12px 20px",
                borderTop: "1px solid #e2e8f0",
                background: "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => setShowAllIndividualTargetsModal(false)}
                style={{
                  padding: "6px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#0f172a",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: PLANIFICACIÓN DE RATIOS POR SESIÓN ── */}
      {showSessionPlanningModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSessionPlanningModal(false);
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              maxWidth: "780px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              border: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Cabecera del modal */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #f1f5f9",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "linear-gradient(to right, #f8fafc, #f1f5f9)",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🎯</span> Planificar Ratios por Sesión
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    Microciclo: <strong>{activeWeek?.label || "Semana Actual"}</strong>
                  </span>
                  {(() => {
                    const dates = activeWeek?.dates || [];
                    const matchDates = dates.filter((d) => isMatchDaySession((planificacionDays || []).find((p: any) => p.fecha === d)));
                    const mcType = detectMicrocycleType(dates[0] || "", dates[dates.length - 1] || "", matchDates);
                    const cfg = MICROCICLE_TYPE_CONFIG[mcType];
                    return (
                      <span
                        style={{
                          fontSize: "10.5px",
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: "4px",
                          background: cfg.bg,
                          color: cfg.color,
                          border: `1px solid ${cfg.border}`,
                        }}
                      >
                        {cfg.icon} {cfg.label}
                      </span>
                    );
                  })()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSessionPlanningModal(false)}
                style={{
                  background: "#e2e8f0",
                  border: "none",
                  borderRadius: "50%",
                  width: "28px",
                  height: "28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "#475569",
                  fontWeight: 700,
                }}
              >
                ✕
              </button>
            </div>

            {/* Cuerpo del modal */}
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "10px", padding: "12px 14px", fontSize: "12px", color: "#0369a1", lineHeight: 1.5 }}>
                💡 <strong>¿Cómo funciona?</strong> Al planificar los ratios por sesión, la vista <em>"📅 Progresivo (A la fecha)"</em> calcula el objetivo acumulado hasta la última sesión registrada, evitando que las tablas se vean rojas durante el transcurso de la semana antes de finalizar el microciclo.
              </div>

              {/* Acciones Rápidas */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                  Sesiones del Microciclo ({activeWeek?.dates?.length || 0}):
                </span>
                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                  {/* Botones para Cargar Medias Empíricas de Microciclos */}
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "#f8fafc", padding: "2px 6px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                    <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#475569" }}>Cargar Medias:</span>
                    {(["corto", "media", "largo", "doble_partido"] as const).map((t) => {
                      const cfg = MICROCICLE_TYPE_CONFIG[t];
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => handleApplyEmpiricalMicrocycleRatios(t)}
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            border: `1px solid ${cfg.border}`,
                            background: cfg.bg,
                            color: cfg.color,
                            fontSize: "10.5px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                          title={`Carga los ratios calculados a partir de las medias reales de ${cfg.label}`}
                        >
                          {cfg.icon} {cfg.shortLabel}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const newMap = { ...sessionRatioPlanMap };
                      const dates = activeWeek?.dates || [];
                      dates.forEach((dStr) => {
                        const sMd = getSessionMd(dStr, gpsRecords.filter((r) => r.fecha === dStr));
                        newMap[dStr] = {};
                        activeRatioKeys.forEach((k) => {
                          const base = teamRatioTargets[k] ?? getDefaultRatioTargetForKey(k);
                          newMap[dStr][k] = getSessionRatioTarget(dStr, sMd, k, base, dates.length);
                        });
                      });
                      handleSaveSessionRatioPlan(newMap);
                    }}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: "1px solid #0284c7",
                      background: "#eff6ff",
                      color: "#0369a1",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                    title="Distribuye el objetivo semanal según las sesiones y su tipo de MD"
                  >
                    ⚡ Auto-distribuir semanal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newMap = { ...sessionRatioPlanMap };
                      (activeWeek?.dates || []).forEach((dStr) => {
                        delete newMap[dStr];
                      });
                      handleSaveSessionRatioPlan(newMap);
                    }}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      color: "#64748b",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Restablecer
                  </button>
                </div>
              </div>

              {/* Tabla de configuración por sesión */}
              <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#475569" }}>
                      <th style={{ padding: "8px 12px" }}>Sesión / Fecha</th>
                      <th style={{ padding: "8px 8px", textAlign: "center" }}>Tipo MD</th>
                      {activeRatioKeys.map((k) => {
                        const vDef = getGpsVariableDef(k);
                        const nameObj = getVariableDisplayName(k, vDef);
                        const teamT = teamRatioTargets[k] ?? getDefaultRatioTargetForKey(k);
                        return (
                          <th key={k} style={{ padding: "8px 8px", textAlign: "center" }}>
                            <div style={{ fontWeight: 800 }}>{nameObj.short}</div>
                            <div style={{ fontSize: "9.5px", color: "#0284c7" }}>Semanal: {teamT}x</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {(activeWeek?.dates || []).length === 0 ? (
                      <tr>
                        <td colSpan={activeRatioKeys.length + 2} style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>
                          No hay sesiones registradas en este microciclo. Puedes configurar fechas o importar sesiones arriba.
                        </td>
                      </tr>
                    ) : (
                      (activeWeek?.dates || []).map((dStr, idx) => {
                        const sMd = getSessionMd(dStr, gpsRecords.filter((r) => r.fecha === dStr));
                        const parts = dStr.split("-");
                        const dateLabel = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dStr;
                        return (
                          <tr key={dStr} style={{ borderBottom: "1px solid #f1f5f9", background: idx % 2 === 0 ? "#ffffff" : "#fcfcfd" }}>
                            <td style={{ padding: "8px 12px", fontWeight: 700, color: "#0f172a" }}>
                              {dateLabel} <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 400 }}>({dStr})</span>
                            </td>
                            <td style={{ padding: "8px 8px", textAlign: "center" }}>
                              <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "2px 6px", borderRadius: "4px", background: sMd.includes("MD") ? "#dbeafe" : "#f1f5f9", color: sMd.includes("MD") ? "#1e40af" : "#475569" }}>
                                {sMd}
                              </span>
                            </td>
                            {activeRatioKeys.map((k) => {
                              const baseWeekly = teamRatioTargets[k] ?? getDefaultRatioTargetForKey(k);
                              const currentVal = sessionRatioPlanMap[dStr]?.[k] ?? getSessionRatioTarget(dStr, sMd, k, baseWeekly, activeWeek.dates.length);
                              return (
                                <td key={k} style={{ padding: "6px 8px", textAlign: "center" }}>
                                  <input
                                    type="number"
                                    step="0.05"
                                    min="0"
                                    max="5"
                                    value={currentVal}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      const newMap = { ...sessionRatioPlanMap };
                                      if (!newMap[dStr]) newMap[dStr] = {};
                                      newMap[dStr][k] = val;
                                      handleSaveSessionRatioPlan(newMap);
                                    }}
                                    style={{
                                      width: "65px",
                                      textAlign: "center",
                                      padding: "4px 6px",
                                      borderRadius: "5px",
                                      border: "1px solid #cbd5e1",
                                      fontSize: "12px",
                                      fontWeight: 800,
                                      color: "#0f172a",
                                    }}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {activeWeek?.dates?.length > 0 && (
                    <tfoot>
                      <tr style={{ background: "#f8fafc", borderTop: "2px solid #cbd5e1", fontWeight: 800 }}>
                        <td colSpan={2} style={{ padding: "10px 12px", color: "#0f172a" }}>
                          Suma Planificada del Microciclo:
                        </td>
                        {activeRatioKeys.map((k) => {
                          const baseWeekly = teamRatioTargets[k] ?? getDefaultRatioTargetForKey(k);
                          let sum = 0;
                          activeWeek.dates.forEach((dStr) => {
                            const sMd = getSessionMd(dStr, gpsRecords.filter((r) => r.fecha === dStr));
                            sum += sessionRatioPlanMap[dStr]?.[k] ?? getSessionRatioTarget(dStr, sMd, k, baseWeekly, activeWeek.dates.length);
                          });
                          const diff = Math.round((sum - baseWeekly) * 100) / 100;
                          return (
                            <td key={k} style={{ padding: "10px 8px", textAlign: "center" }}>
                              <div style={{ color: Math.abs(diff) <= 0.1 ? "#16a34a" : "#0284c7" }}>
                                {sum.toFixed(2)}x
                              </div>
                              <div style={{ fontSize: "9px", color: Math.abs(diff) <= 0.1 ? "#16a34a" : "#b45309" }}>
                                {diff === 0 ? "✓ Exacto" : (diff > 0 ? `+${diff.toFixed(2)}x` : `${diff.toFixed(2)}x`)} vs Obj
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Pie del modal */}
            <div
              style={{
                padding: "12px 20px",
                borderTop: "1px solid #e2e8f0",
                background: "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => setShowSessionPlanningModal(false)}
                style={{
                  padding: "6px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#0f172a",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Guardar y Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showMicroModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowMicroModal(false);
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              maxWidth: "640px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              border: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Cabecera */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #f1f5f9",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "linear-gradient(to right, #f8fafc, #f1f5f9)",
                borderTopLeftRadius: "16px",
                borderTopRightRadius: "16px",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>
                    ⚙️ Marcar Microciclos de Carga
                  </h3>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 800,
                      background: "#e0f2fe",
                      color: "#0369a1",
                      padding: "2px 8px",
                      borderRadius: "999px",
                    }}
                  >
                    Personalizado
                  </span>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b" }}>
                  Define los rangos exactos de cada microciclo para agrupar las sesiones en los Ratios Semanales.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMicroModal(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "18px",
                  cursor: "pointer",
                  color: "#64748b",
                  padding: "6px",
                  borderRadius: "6px",
                }}
              >
                ✕
              </button>
            </div>

            {/* Formulario Añadir / Editar */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
              <div style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", marginBottom: "12px" }}>
                {editingMicroId ? "✏️ Editar Microciclo" : "➕ Marcar Nuevo Microciclo"}
              </div>

              {microFormError && (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#dc2626",
                    fontSize: "12px",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    marginBottom: "12px",
                    fontWeight: 600,
                  }}
                >
                  ⚠️ {microFormError}
                </div>
              )}

              <form onSubmit={handleSaveMicrocycleForm}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                      Nombre del Microciclo (Opcional):
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Microciclo 7 al 13 Oct (vs Huesca)"
                      value={microFormName}
                      onChange={(e) => setMicroFormName(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "12.5px",
                        background: "#ffffff",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                      Fecha Inicio:
                    </label>
                    <input
                      type="date"
                      value={microFormStart}
                      onChange={(e) => setMicroFormStart(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "12.5px",
                        background: "#ffffff",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                      Fecha Fin:
                    </label>
                    <input
                      type="date"
                      value={microFormEnd}
                      onChange={(e) => setMicroFormEnd(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "12.5px",
                        background: "#ffffff",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                      Tipo de Microciclo:
                    </label>
                    <select
                      value={microFormTipo}
                      onChange={(e) => setMicroFormTipo(e.target.value as any)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "12.5px",
                        background: "#ffffff",
                        outline: "none",
                        fontWeight: 700,
                        color: "#0f172a",
                        boxSizing: "border-box",
                      }}
                    >
                      <option value="corto">⚡ Semana Corta (6 días entre MD)</option>
                      <option value="media">📅 Semana Media (7 días entre MD)</option>
                      <option value="largo">⏳ Semana Larga (8 días entre MD)</option>
                      <option value="doble_partido">⚽⚽ Doble Partido</option>
                      <option value="sin_categorizar">⚪ Sin categorizar (No definida / Inicial)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end" }}>
                  {editingMicroId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMicroId(null);
                        setMicroFormName("");
                        setMicroFormStart("");
                        setMicroFormEnd("");
                        setMicroFormError("");
                      }}
                      style={{
                        padding: "7px 14px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        background: "#ffffff",
                        color: "#64748b",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Cancelar Edición
                    </button>
                  )}
                  <button
                    type="submit"
                    style={{
                      padding: "7px 16px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#0284c7",
                      color: "#ffffff",
                      fontSize: "12px",
                      fontWeight: 800,
                      cursor: "pointer",
                      boxShadow: "0 2px 4px rgba(2, 132, 199, 0.2)",
                    }}
                  >
                    {editingMicroId ? "💾 Guardar Cambios" : "➕ Añadir Microciclo"}
                  </button>
                </div>
              </form>
            </div>

            {/* Lista de Microciclos configurados */}
            <div style={{ padding: "20px 24px", flex: 1, overflowY: "auto" }}>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
                Microciclos Activos ({customMicrocycles.length})
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {availableWeeks.map((w) => {
                  const hasData = w.dates.length > 0;
                  return (
                    <div
                      key={w.microId || w.id}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "10px",
                        border: "1px solid #e2e8f0",
                        background: editingMicroId === w.microId ? "#f0f9ff" : "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a" }}>
                          {w.nombre}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              fontFamily: "monospace",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              background: "#f1f5f9",
                              color: "#475569",
                              fontWeight: 700,
                            }}
                          >
                            📅 {w.start} ➔ {w.end}
                          </span>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 800,
                              padding: "2px 8px",
                              borderRadius: "6px",
                              background: hasData ? "#dcfce7" : "#fef3c7",
                              color: hasData ? "#15803d" : "#b45309",
                            }}
                          >
                            {hasData ? (w.dates.length + " sesiones con GPS") : "Sin datos GPS aún"}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <select
                          value={w.tipo || "media"}
                          onChange={(e) => handleUpdateWeekType(w.microId, e.target.value as any)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: "6px",
                            border: `1px solid ${MICROCICLE_TYPE_CONFIG[w.tipo || "media"]?.color || "#cbd5e1"}`,
                            background: MICROCICLE_TYPE_CONFIG[w.tipo || "media"]?.bg || "#ffffff",
                            color: MICROCICLE_TYPE_CONFIG[w.tipo || "media"]?.color || "#0f172a",
                            fontSize: "11px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                          title="Cambiar el tipo asignado a esta semana"
                        >
                          <option value="corto">⚡ Corto</option>
                          <option value="media">📅 Media</option>
                          <option value="largo">⏳ Largo</option>
                          <option value="doble_partido">⚽⚽ Doble Partido</option>
                          <option value="sin_categorizar">⚪ Sin tipo</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const found = availableWeeks.find((m) => m.microId === w.microId);
                            if (found) handleEditMicrocycle({
                              id: found.microId,
                              nombre: found.nombre,
                              start: found.start,
                              end: found.end,
                              tipo: (found as any).tipo || "media",
                            });
                          }}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            background: "#ffffff",
                            fontSize: "11.5px",
                            fontWeight: 700,
                            color: "#0369a1",
                            cursor: "pointer",
                          }}
                        >
                          ✏️ Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMicrocycle(w.microId || "")}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "6px",
                            border: "1px solid #fee2e2",
                            background: "#fff1f2",
                            fontSize: "11.5px",
                            fontWeight: 700,
                            color: "#e11d48",
                            cursor: "pointer",
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid #f1f5f9",
                background: "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottomLeftRadius: "16px",
                borderBottomRightRadius: "16px",
              }}
            >
              <button
                type="button"
                onClick={handleResetMicrocycles}
                style={{
                  padding: "7px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontSize: "11.5px",
                  fontWeight: 700,
                  color: "#64748b",
                  cursor: "pointer",
                }}
                title="Restablece los microciclos predeterminados de Octubre"
              >
                🔄 Restablecer Predeterminados (7-13, 14-18, 19-25 Oct)
              </button>

              <button
                type="button"
                onClick={() => setShowMicroModal(false)}
                style={{
                  padding: "7px 18px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#0f172a",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
