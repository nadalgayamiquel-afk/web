"use client";

import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
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
  gpsRecords: any[];
  jugadores: any[];
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  isGpsUploading: boolean;
  handleGpsCsvUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSyncDownloadsGps: () => void;
  gpsUploadStatus: { message: string; isError: boolean } | null;
  loadDbGpsRecords?: () => Promise<void>;
  renderDisponibilidadBadge?: (player: any) => React.ReactNode;
}

export type ExternaSubTab = "velocidad" | "acwr" | "perfil_competitivo" | "ratios_semanales" | "preguntas_clave" | "sesiones_bbdd";

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

export const PROFILE_AVAILABLE_METRICS: Record<
  string,
  { key: string; label: string; unit: string; color: string; desc: string; isRate?: boolean }
> = {
  dist: { key: "dist", label: "Distancia Total", unit: "m", color: "#0284c7", desc: "Metros totales recorridos" },
  mMin: { key: "mMin", label: "Intensidad", unit: "m/min", color: "#0891b2", desc: "Metros recorridos por minuto de juego", isRate: true },
  hsr: { key: "hsr", label: "HSR (>21 km/h)", unit: "m", color: "#ea580c", desc: "Metros a alta velocidad de carrera" },
  sprint: { key: "sprint", label: "Sprint (>24 km/h)", unit: "m", color: "#dc2626", desc: "Metros a máxima intensidad de sprint" },
  accDec: { key: "accDec", label: "Acc + Dec (>3 m/s²)", unit: "cnt", color: "#9333ea", desc: "Suma de aceleraciones y deceleraciones de alta intensidad" },
  accs: { key: "accs", label: "Aceleraciones (>3 m/s²)", unit: "cnt", color: "#2563eb", desc: "Acciones de aceleración explosiva" },
  decs: { key: "decs", label: "Desaceleraciones (>3 m/s²)", unit: "cnt", color: "#d97706", desc: "Acciones de frenado excéntrico" },
  load: { key: "load", label: "Player Load", unit: "AU", color: "#16a34a", desc: "Carga neuromuscular tridimensional" },
  hmld: { key: "hmld", label: "HMLD (Metabólica)", unit: "m", color: "#059669", desc: "Distancia de alta potencia metabólica (>25.5 W/kg)" },
  sprintsCount: { key: "sprintsCount", label: "Nº Sprints", unit: "cnt", color: "#e11d48", desc: "Cantidad de acciones de sprint (>24 km/h)" },
  maxSpeed: { key: "maxSpeed", label: "Vmax", unit: "km/h", color: "#b91c1c", desc: "Pico máximo de velocidad", isRate: true },
};

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

export default function CargaExternaSection({
  gpsRecords,
  jugadores,
  selectedDate,
  setSelectedDate,
  isGpsUploading,
  handleGpsCsvUpload,
  handleSyncDownloadsGps,
  gpsUploadStatus,
  renderDisponibilidadBadge,
}: CargaExternaSectionProps) {
  // ── SUB-PESTAÑA ACTIVA ──
  const [subTab, setSubTab] = useState<ExternaSubTab>("velocidad");

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

  // ── 2. ESTADOS PARA PERFIL COMPETITIVO ──
  const [profileSearch, setProfileSearch] = useState<string>("");
  const [profileFilterPos, setProfileFilterPos] = useState<string>("TODOS");
  const [profileFilterCategory, setProfileFilterCategory] = useState<string>("TODOS");
  const [profileSelectedMetrics, setProfileSelectedMetrics] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_profile_selected_metrics");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return ["dist", "mMin", "hsr", "sprint", "accDec"];
  });

  const handleToggleProfileMetric = (key: string) => {
    setProfileSelectedMetrics((prev) => {
      let next: string[];
      if (prev.includes(key)) {
        if (prev.length <= 1) return prev; // Mantener al menos 1 métrica
        next = prev.filter((k) => k !== key);
      } else {
        next = [...prev, key];
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("gps_profile_selected_metrics", JSON.stringify(next));
      }
      return next;
    });
  };

  const handleSelectProfilePreset = (presetKeys: string[]) => {
    setProfileSelectedMetrics(presetKeys);
    if (typeof window !== "undefined") {
      localStorage.setItem("gps_profile_selected_metrics", JSON.stringify(presetKeys));
    }
  };
  const [profileNorm90, setProfileNorm90] = useState<boolean>(true); // normalizado a 90 min o media directa
  const [customOverrides, setCustomOverrides] = useState<Record<string, any>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_competitive_profile_overrides");
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return {};
  });

  // ── 3. ESTADOS PARA RATIOS SEMANALES ──
  const [ratioFormat, setRatioFormat] = useState<"multiplier" | "percentage">("multiplier");
  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number>(0);

  // ── FECHA DE REFERENCIA ACTUAL (la fecha más reciente con GPS o la seleccionada) ──
  const latestGpsDate = useMemo(() => {
    if (gpsRecords.length === 0) return selectedDate || new Date().toISOString().split("T")[0];
    const sorted = [...gpsRecords].map((r) => r.fecha).filter(Boolean).sort().reverse();
    return sorted[0] || selectedDate;
  }, [gpsRecords, selectedDate]);

  // Lista de fechas únicas ordenadas
  const allUniqueDates = useMemo(() => {
    const set = new Set<string>();
    gpsRecords.forEach((r) => {
      if (r.fecha) set.add(r.fecha);
    });
    return Array.from(set).sort().reverse();
  }, [gpsRecords]);

  // Semanas detectadas a partir de los registros GPS (de lunes a domingo)
  const availableWeeks = useMemo(() => {
    if (allUniqueDates.length === 0) {
      const today = new Date();
      return [{ id: 0, label: "Semana Actual", start: today.toISOString().split("T")[0], end: today.toISOString().split("T")[0], dates: [] }];
    }
    const weeksMap = new Map<string, { start: string; end: string; dates: string[] }>();
    allUniqueDates.forEach((dStr) => {
      const d = new Date(dStr + "T00:00:00");
      const day = d.getDay(); // 0 is Sunday
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const mon = new Date(d);
      mon.setDate(d.getDate() + diffToMonday);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      const monStr = mon.toISOString().split("T")[0];
      const sunStr = sun.toISOString().split("T")[0];
      const key = monStr + "_" + sunStr;
      if (!weeksMap.has(key)) {
        weeksMap.set(key, { start: monStr, end: sunStr, dates: [] });
      }
      weeksMap.get(key)!.dates.push(dStr);
    });

    return Array.from(weeksMap.entries()).map(([key, val], idx) => {
      const sParts = val.start.split("-");
      const eParts = val.end.split("-");
      const sLabel = sParts[2] + "/" + sParts[1];
      const eLabel = eParts[2] + "/" + eParts[1];
      return {
        id: idx,
        label: "Microciclo (" + sLabel + " - " + eLabel + ") · " + val.dates.length + " sesiones",
        start: val.start,
        end: val.end,
        dates: val.dates.sort(),
      };
    });
  }, [allUniqueDates]);

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
      if (isRecordSimulado(r)) return false;
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
  }, [gpsRecords, jugadores, selectedDate, latestGpsDate, acwrMetric]);

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
    const realGps = gpsRecords.filter((r) => !isRecordSimulado(r));
    if (realGps.length === 0) return [];

    // Fechas únicas activas
    const distinctActiveDates = Array.from(new Set(realGps.map((r) => r.fecha).filter(Boolean))).sort();
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
      const dayRecords = realGps.filter((r) => r.fecha === dStr);
      const hasSession = dayRecords.length > 0;

      let vol = 0;
      let rawMd = "OFF";
      let isMatch = false;

      if (hasSession) {
        rawMd = dayRecords[0]?.match_day || dayRecords[0]?.md || (dayRecords[0]?.tipo_sesion === "PARTIDO" ? "MD" : "ENT");
        isMatch = String(rawMd).toUpperCase() === "MD" || dayRecords[0]?.tipo_sesion === "PARTIDO";

        if (acwrViewMode === "equipo") {
          const teamSum = dayRecords.reduce((acc, r) => acc + getGpsMetricValue(r, acwrVolumeMetric), 0);
          vol = Math.round(teamSum / dayRecords.length);
        } else {
          const targetId = acwrSelectedPlayerId || jugadores[0]?.id;
          const pRecord = dayRecords.find((r) => r.jugador_id === targetId);
          vol = pRecord ? Math.round(getGpsMetricValue(pRecord, acwrVolumeMetric)) : 0;
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
  }, [gpsRecords, acwrViewMode, acwrSelectedPlayerId, acwrVolumeMetric, acwrTimeRange, jugadores]);

  const currentTimelinePoint = useMemo(() => {
    if (acwrTimelineData.length === 0) return null;
    return acwrTimelineData[acwrTimelineData.length - 1];
  }, [acwrTimelineData]);

  // ── CALENDARIO BASE Y MEDIAS DE EQUIPO PARA TABLAS PLEGABLES POR JUGADOR ──
  const { playerCalendarDates, playerTeamDailyMap } = useMemo(() => {
    const realGps = gpsRecords.filter((r) => !isRecordSimulado(r));
    if (realGps.length === 0) return { playerCalendarDates: [] as string[], playerTeamDailyMap: new Map<string, any>() };

    const distinctActiveDates = Array.from(new Set(realGps.map((r) => r.fecha).filter(Boolean))).sort();
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
      const dayRecords = realGps.filter((r) => r.fecha === dStr);
      const hasSession = dayRecords.length > 0;
      let teamAvg = 0;
      let rawMd = "OFF";
      let isMatch = false;

      if (hasSession) {
        rawMd = dayRecords[0]?.match_day || dayRecords[0]?.md || (dayRecords[0]?.tipo_sesion === "PARTIDO" ? "MD" : "ENT");
        isMatch = String(rawMd).toUpperCase() === "MD" || dayRecords[0]?.tipo_sesion === "PARTIDO";
        const teamSum = dayRecords.reduce((acc, r) => acc + getGpsMetricValue(r, acwrVolumeMetric), 0);
        teamAvg = Math.round(teamSum / dayRecords.length);
      }

      const normMd = hasSession ? normalizeMdType(rawMd, isMatch ? "PARTIDO" : undefined) : "OFF";
      tMap.set(dStr, { teamAvg, count: dayRecords.length, rawMd, normMd, isMatch, hasSession });
    });

    return { playerCalendarDates: dates, playerTeamDailyMap: tMap };
  }, [gpsRecords, acwrVolumeMetric]);

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
    const realGps = gpsRecords.filter((r) => !isRecordSimulado(r));
    if (playerCalendarDates.length === 0) return [];

    const minDateObj = new Date(playerCalendarDates[0] + "T12:00:00");

    const pDailyMap = new Map<string, { vol: number; hasSession: boolean; normMd: string; isMatch: boolean; record?: any }>();
    playerCalendarDates.forEach((dStr) => {
      const dayRecords = realGps.filter((r) => r.fecha === dStr);
      const pRecord = dayRecords.find((r) => r.jugador_id === playerId);
      const teamInfo = playerTeamDailyMap.get(dStr);
      const hasSession = Boolean(pRecord);
      const vol = pRecord ? Math.round(getGpsMetricValue(pRecord, acwrVolumeMetric)) : 0;
      const rawMd = pRecord?.match_day || pRecord?.md || teamInfo?.rawMd || "OFF";
      const isMatch = String(rawMd).toUpperCase() === "MD" || pRecord?.tipo_sesion === "PARTIDO";
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
  // Solo en tareas de primera y segunda parte (catalán o español):
  // 1. Varios partidos 90 min: (Máximo + Promedio) / 2
  // 2. 1 partido 90 min: ese único valor
  // 3. -90 min pero al menos 45 min en uno: ese valor de 45 min × 2 (marcado con *)
  // 4. <45 min: copiado de los jugadores de la misma posición (marcado con **)
  const competitiveProfiles = useMemo(() => {
    const isMatchHalfTask = (taskName?: string): boolean => {
      if (!taskName) return false;
      const n = String(taskName).trim().toUpperCase();
      if (n.includes("PREPARTIDO") || n.includes("CALENTAMIENTO") || n.includes("ACTIVACI")) return false;
      if (n.includes("PRIMERA PART") || n.includes("PRIMERA PARTE") || n.includes("1ª PART") || n.includes("1A PART")) return true;
      if (n.includes("SEGONA PART") || n.includes("SEGUNDA PARTE") || n.includes("2ª PART") || n.includes("2A PART")) return true;
      return false;
    };

    const realGps = gpsRecords.filter((r) => !isRecordSimulado(r));
    const playerMatchesMap = new Map<string, any[]>();

    realGps.forEach((r) => {
      if (!r.jugador_id) return;
      const isMatch =
        String(r.tipo_sesion || r.metricas?.tipo_sesion || "").toUpperCase().includes("PARTIDO") ||
        String(r.match_day || r.metricas?.match_day || "").toUpperCase() === "MD" ||
        r.es_partido === true;

      const tareas = r.metricas?.tareas;
      let matchParts: any[] = [];

      if (Array.isArray(tareas) && tareas.length > 0) {
        matchParts = tareas.filter((t: any) => isMatchHalfTask(t.nombre || t.name || t.tarea));
      }

      // Si no tiene array de tareas desglosadas pero es un partido registrado, usamos el registro global
      if (matchParts.length === 0 && isMatch) {
        const dur = Number(r.duracion || r.metricas?.["Duration(min)"] || r.minutos_totales || 90);
        const dist = Number(r.metricas?.["Distance(m)"] || r.metricas?.["Distancia Total (m)"] || r.distancia_total || 0);
        const hsr = Number(r.metricas?.["HSR Abs (m)"] || r.metricas?.hsr || r.distancia_z4 || 0);
        const sprint = Number(r.metricas?.["Sprint (m)"] || r.metricas?.["+ 24 km/h (Distancia)"] || r.metricas?.sprint_m || (r.num_sprints ? r.num_sprints * 15 : 0));
        const acc = Number(r.metricas?.["Accs Count"] || r.metricas?.["Acc + 3 m/s2 (Num)"] || r.aceleraciones || 0);
        const dec = Number(r.metricas?.["Decs Count"] || r.metricas?.["Dec + 3 m/s2 (Num)"] || r.desaceleraciones || 0);
        const load = Number(r.metricas?.["Player Load"] || r.player_load || 0);
        const hmld = Number(r.metricas?.HMLD || r.metricas?.hmld || 0);
        const sprintsCount = Number(r.metricas?.["Sprints Count"] || r.metricas?.["+24 km/h (Num)"] || r.num_sprints || 0);
        const maxSpd = Number(r.metricas?.["MAX Speed(km/h)"] || r.metricas?.["Vel Max"] || r.max_speed || 0);
        const mMin = dur > 0 ? Math.round((dist / dur) * 10) / 10 : 0;

        if (dist > 0) {
          if (!playerMatchesMap.has(r.jugador_id)) playerMatchesMap.set(r.jugador_id, []);
          playerMatchesMap.get(r.jugador_id)!.push({
            fecha: r.fecha,
            minutos: dur,
            dist,
            mMin,
            hsr,
            sprint,
            accDec: acc + dec,
            accs: acc,
            decs: dec,
            load,
            hmld,
            sprintsCount,
            maxSpeed: maxSpd,
            parts: [{ nombre: "Partido Completo", minutos: dur, dist, mMin, hsr, sprint, accDec: acc + dec, accs: acc, decs: dec, load, hmld, sprintsCount, maxSpeed: maxSpd }],
          });
        }
        return;
      }

      if (matchParts.length === 0) return;

      if (!playerMatchesMap.has(r.jugador_id)) playerMatchesMap.set(r.jugador_id, []);

      const totalMinutes = matchParts.reduce((acc, t) => acc + Number(t.Tiempo || t.duracion_min || t.Duration || 0), 0);
      const totalDist = matchParts.reduce((acc, t) => acc + Number(t["Distance(m)"] || t["Distancia Total (m)"] || t.distancia_total || 0), 0);
      const totalHsr = matchParts.reduce((acc, t) => acc + Number(t.hsr || t["HSR Abs (m)"] || t.distancia_z4 || 0), 0);
      const totalSprint = matchParts.reduce((acc, t) => acc + Number(t["+ 24 km/h (Distancia)"] || t["+28 km/h (Distancia)"] || t.distancia_z5 || t.sprint || 0), 0);
      const totalAcc = matchParts.reduce((acc, t) => acc + Number(t["Accs Count"] || t["Acc + 3 m/s2 (Num)"] || t.aceleraciones || 0), 0);
      const totalDec = matchParts.reduce((acc, t) => acc + Number(t["Decs Count"] || t["Dec + 3 m/s2 (Num)"] || t.desaceleraciones || 0), 0);
      const totalLoad = matchParts.reduce((acc, t) => acc + Number(t["Player Load"] || t.player_load || 0), 0);
      const totalHmld = matchParts.reduce((acc, t) => acc + Number(t.HMLD || t.hmld || 0), 0);
      const totalSprintsCount = matchParts.reduce((acc, t) => acc + Number(t["Sprints Count"] || t["+24 km/h (Num)"] || t.num_sprints || 0), 0);
      const maxSpeed = Math.max(...matchParts.map((t) => Number(t["MAX Speed(km/h)"] || t["Vel Max"] || t.max_speed || 0)));
      const mMin = totalMinutes > 0 ? Math.round((totalDist / totalMinutes) * 10) / 10 : 0;

      const parts = matchParts.map((t) => {
        const pMin = Number(t.Tiempo || t.duracion_min || t.Duration || 0);
        const pDist = Number(t["Distance(m)"] || t["Distancia Total (m)"] || t.distancia_total || 0);
        return {
          nombre: t.nombre || t.name || t.tarea || "Parte",
          minutos: pMin,
          dist: pDist,
          mMin: pMin > 0 ? Math.round((pDist / pMin) * 10) / 10 : 0,
          hsr: Number(t.hsr || t["HSR Abs (m)"] || t.distancia_z4 || 0),
          sprint: Number(t["+ 24 km/h (Distancia)"] || t["+28 km/h (Distancia)"] || t.distancia_z5 || t.sprint || 0),
          accDec: Number(t["Accs Count"] || t["Acc + 3 m/s2 (Num)"] || 0) + Number(t["Decs Count"] || t["Dec + 3 m/s2 (Num)"] || 0),
          accs: Number(t["Accs Count"] || t["Acc + 3 m/s2 (Num)"] || 0),
          decs: Number(t["Decs Count"] || t["Dec + 3 m/s2 (Num)"] || 0),
          load: Number(t["Player Load"] || t.player_load || 0),
          hmld: Number(t.HMLD || t.hmld || 0),
          sprintsCount: Number(t["Sprints Count"] || t["+24 km/h (Num)"] || t.num_sprints || 0),
          maxSpeed: Number(t["MAX Speed(km/h)"] || t["Vel Max"] || 0),
        };
      });

      playerMatchesMap.get(r.jugador_id)!.push({
        fecha: r.fecha,
        minutos: Math.round(totalMinutes * 10) / 10,
        dist: totalDist,
        mMin,
        hsr: totalHsr,
        sprint: totalSprint,
        accDec: totalAcc + totalDec,
        accs: totalAcc,
        decs: totalDec,
        load: totalLoad,
        hmld: totalHmld,
        sprintsCount: totalSprintsCount,
        maxSpeed: isFinite(maxSpeed) ? maxSpeed : 0,
        parts,
      });
    });

    const profiles = new Map<string, any>();
    const positionProfilesMap = new Map<string, any[]>();
    const metricsToCompute = ["dist", "mMin", "hsr", "sprint", "accDec", "accs", "decs", "load", "hmld", "sprintsCount"];

    // PASO 1: Calcular perfiles directos para jugadores con datos
    jugadores.forEach((j) => {
      const overrides = customOverrides[j.id] || {};
      const matches = playerMatchesMap.get(j.id) || [];
      const pos = (j.posicion || "JUG").toUpperCase();

      const fullMatches = matches.filter((m) => m.minutos >= 80);
      const halfMatches = matches.filter((m) => m.minutos >= 40 && m.minutos < 80);

      const p: any = {
        jugadorId: j.id,
        nombre: j.apodo || j.nombre,
        dorsal: j.dorsal,
        posicion: j.posicion,
        matchesCount: matches.length,
        fullMatchesCount: fullMatches.length,
        halfMatchesCount: halfMatches.length,
      };

      if (fullMatches.length > 1) {
        // CASO 1: Varios partidos de 90 min -> (Máximo + Promedio) / 2
        p.category = "real_varios";
        p.isReal = true;
        p.badgeText = "Varios 90' (Máx+Prom)/2";
        p.asterisk = "";
        p.detailText = `${fullMatches.length} partidos 90' (Fórmula Máx+Prom/2)`;

        metricsToCompute.forEach((k) => {
          const vals = fullMatches.map((m) => m[k] || 0);
          const maxVal = Math.max(...vals);
          const avgVal = vals.reduce((a, b) => a + b, 0) / vals.length;
          p[k] = overrides[k] ?? Math.round((maxVal + avgVal) / 2);
        });

        const spdVals = fullMatches.map((m) => m.maxSpeed || 0);
        const maxSpd = Math.max(...spdVals);
        const avgSpd = spdVals.reduce((a, b) => a + b, 0) / spdVals.length;
        p.maxSpeed = overrides.maxSpeed ?? Math.round(((maxSpd + avgSpd) / 2) * 10) / 10;
        p.minutesMatch = Math.round(fullMatches.reduce((a, b) => a + b.minutos, 0) / fullMatches.length);

        profiles.set(j.id, p);

        // Guardar para medias por posición
        if (!positionProfilesMap.has(pos)) positionProfilesMap.set(pos, []);
        positionProfilesMap.get(pos)!.push(p);
      } else if (fullMatches.length === 1) {
        // CASO 2: Solo 1 partido de 90 min -> coger ese valor como perfil
        p.category = "real_uno";
        p.isReal = true;
        p.badgeText = "1 Partido 90'";
        p.asterisk = "";
        p.detailText = `1 partido de 90' (${fullMatches[0].fecha})`;

        const m = fullMatches[0];
        metricsToCompute.forEach((k) => {
          p[k] = overrides[k] ?? Math.round(m[k] || 0);
        });
        p.maxSpeed = overrides.maxSpeed ?? Math.round((m.maxSpeed || 0) * 10) / 10;
        p.minutesMatch = m.minutos;

        profiles.set(j.id, p);

        if (!positionProfilesMap.has(pos)) positionProfilesMap.set(pos, []);
        positionProfilesMap.get(pos)!.push(p);
      } else if (halfMatches.length > 0) {
        // CASO 3: Menos de 90 min en todos pero al menos 45 min en uno -> valor 45 min x 2 (*)
        p.category = "estimado_45";
        p.isReal = false;
        p.badgeText = "Estimado 45' x 2 *";
        p.asterisk = "*";
        const bestHalf = [...halfMatches].sort((a, b) => (b.minutos || 0) - (a.minutos || 0))[0];
        p.detailText = `Estimado: ${bestHalf.minutos}' x 2 (No real *)`;

        metricsToCompute.forEach((k) => {
          const isRate = k === "mMin";
          const raw = bestHalf[k] || 0;
          p[k] = overrides[k] ?? (isRate ? Math.round(raw) : Math.round(raw * 2));
        });
        p.maxSpeed = overrides.maxSpeed ?? Math.round((bestHalf.maxSpeed || 0) * 10) / 10;
        p.minutesMatch = 90;

        profiles.set(j.id, p);
      } else {
        // CASO 4 PRE-MARCADO: <45 min -> se resolverá por posición en paso 2
        p.category = "copiado_posicion";
        p.isReal = false;
        p.badgeText = "Copiado Posición **";
        p.asterisk = "**";
        p.detailText = "Sin minutos suficientes (<45'). Copiado de compañeros de posición (No real **)";
        p.minutesMatch = 90;
        profiles.set(j.id, p);
      }
    });

    // PASO 2: Resolver jugadores <45 min copiando el perfil de su misma posición
    jugadores.forEach((j) => {
      const p = profiles.get(j.id);
      if (p && p.category === "copiado_posicion") {
        const overrides = customOverrides[j.id] || {};
        const pos = (j.posicion || "JUG").toUpperCase();

        let pool = positionProfilesMap.get(pos);
        if (!pool || pool.length === 0) {
          if (pos.includes("DEF") || pos.includes("LAT") || pos.includes("CEN")) {
            pool = Array.from(positionProfilesMap.entries()).filter(([k]) => k.includes("DEF") || k.includes("LAT") || k.includes("CEN")).flatMap(([, v]) => v);
          } else if (pos.includes("MED") || pos.includes("PIV") || pos.includes("INT")) {
            pool = Array.from(positionProfilesMap.entries()).filter(([k]) => k.includes("MED") || k.includes("PIV") || k.includes("INT")).flatMap(([, v]) => v);
          } else if (pos.includes("DEL") || pos.includes("EXT") || pos.includes("PUN")) {
            pool = Array.from(positionProfilesMap.entries()).filter(([k]) => k.includes("DEL") || k.includes("EXT") || k.includes("PUN")).flatMap(([, v]) => v);
          }
        }

        if (!pool || pool.length === 0) {
          pool = Array.from(positionProfilesMap.values()).flat();
        }

        if (pool && pool.length > 0) {
          metricsToCompute.forEach((k) => {
            const vals = pool!.map((x) => x[k] || 0);
            p[k] = overrides[k] ?? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
          });
          const spdVals = pool.map((x) => x.maxSpeed || 0);
          p.maxSpeed = overrides.maxSpeed ?? Math.round((spdVals.reduce((a, b) => a + b, 0) / spdVals.length) * 10) / 10;
        } else {
          // Fallback por defecto si no hay ningún partido registrado en el equipo
          p.dist = overrides.dist ?? 10200;
          p.mMin = overrides.mMin ?? 113;
          p.hsr = overrides.hsr ?? 650;
          p.sprint = overrides.sprint ?? 180;
          p.accDec = overrides.accDec ?? 85;
          p.accs = overrides.accs ?? 45;
          p.decs = overrides.decs ?? 40;
          p.load = overrides.load ?? 850;
          p.hmld = overrides.hmld ?? 820;
          p.sprintsCount = overrides.sprintsCount ?? 15;
          p.maxSpeed = overrides.maxSpeed ?? 28.5;
        }
      }
    });

    return profiles;
  }, [gpsRecords, jugadores, customOverrides]);

  // ── 5. CÁLCULO DE RATIOS SEMANALES (% MATCH DEMANDS) ──
  const activeWeek = availableWeeks[selectedWeekIdx] || availableWeeks[0];

  const weeklyRatiosData = useMemo(() => {
    if (!activeWeek || activeWeek.dates.length === 0) return [];

    const weekRecords = gpsRecords.filter((r) => activeWeek.dates.includes(r.fecha) && !isRecordSimulado(r));
    const byPlayer = new Map<string, any[]>();
    weekRecords.forEach((r) => {
      if (!r.jugador_id) return;
      if (!byPlayer.has(r.jugador_id)) byPlayer.set(r.jugador_id, []);
      byPlayer.get(r.jugador_id)!.push(r);
    });

    return jugadores.map((j) => {
      const pRecs = byPlayer.get(j.id) || [];
      const profile = competitiveProfiles.get(j.id) || {
        dist: 10000,
        hsr: 700,
        sprint: 200,
        accDec: 70,
        load: 800,
      };

      let weekDist = 0, weekHsr = 0, weekSprint = 0, weekAcc = 0, weekDec = 0, weekLoad = 0, weekMaxSpeed = 0;
      pRecs.forEach((r) => {
        weekDist += Number(r.metricas?.["Distance(m)"] || r.distancia_total || 0);
        weekHsr += Number(r.metricas?.["HSR Abs (m)"] || r.metricas?.hsr || r.distancia_z4 || 0);
        weekSprint += Number(r.metricas?.["Sprint (m)"] || r.metricas?.sprint_m || (r.num_sprints ? r.num_sprints * 15 : 0));
        weekAcc += Number(r.metricas?.["Accs Count"] || r.aceleraciones || 0);
        weekDec += Number(r.metricas?.["Decs Count"] || r.desaceleraciones || 0);
        weekLoad += Number(r.metricas?.["Player Load"] || r.player_load || 0);
        weekMaxSpeed = Math.max(weekMaxSpeed, Number(r.metricas?.["MAX Speed(km/h)"] || r.max_speed || 0));
      });

      const weekAccDec = weekAcc + weekDec;
      const sessionsCount = pRecs.length;

      const ratioDist = profile.dist > 0 ? weekDist / profile.dist : 0;
      const ratioHsr = profile.hsr > 0 ? weekHsr / profile.hsr : 0;
      const ratioSprint = profile.sprint > 0 ? weekSprint / profile.sprint : 0;
      const ratioAccDec = profile.accDec > 0 ? weekAccDec / profile.accDec : 0;
      const ratioLoad = profile.load > 0 ? weekLoad / profile.load : 0;

      const vAnalysis = vmaxAnalysis.find((x) => x.jugador.id === j.id);
      const histMax = vAnalysis ? vAnalysis.historicalMax : 30;
      const vmaxPct = histMax > 0 ? Math.round((weekMaxSpeed / histMax) * 100) : 0;

      return {
        jugador: j,
        sessionsCount,
        weekDist: Math.round(weekDist),
        weekHsr: Math.round(weekHsr),
        weekSprint: Math.round(weekSprint),
        weekAccDec,
        weekLoad: Math.round(weekLoad),
        weekMaxSpeed,
        vmaxPct,
        ratioDist,
        ratioHsr,
        ratioSprint,
        ratioAccDec,
        ratioLoad,
        profile,
      };
    });
  }, [activeWeek, gpsRecords, jugadores, competitiveProfiles, vmaxAnalysis]);

  const formatRatioVal = (ratio: number) => {
    if (ratioFormat === "multiplier") {
      return ratio.toFixed(2) + "x";
    }
    return Math.round(ratio * 100) + "%";
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
          <span>🚀</span> Velocidad & Vmax (90%)
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
          onClick={() => setSubTab("perfil_competitivo")}
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
            background: subTab === "perfil_competitivo" ? "#ea580c" : "transparent",
            color: subTab === "perfil_competitivo" ? "#ffffff" : "#475569",
            border: "none",
            boxShadow: subTab === "perfil_competitivo" ? "0 2px 6px rgba(234,88,12,0.25)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>🏆</span> Perfil Competitivo (Partido 100%)
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
            background: subTab === "ratios_semanales" ? "#0284c7" : "transparent",
            color: subTab === "ratios_semanales" ? "#ffffff" : "#475569",
            border: "none",
            boxShadow: subTab === "ratios_semanales" ? "0 2px 6px rgba(2,132,199,0.25)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>📈</span> Ratios Semanales vs Partido
        </button>

        <button
          type="button"
          onClick={() => setSubTab("preguntas_clave")}
          style={{
            flex: "1 1 160px",
            padding: "8px 14px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            background: subTab === "preguntas_clave" ? "#9333ea" : "transparent",
            color: subTab === "preguntas_clave" ? "#ffffff" : "#475569",
            border: "none",
            boxShadow: subTab === "preguntas_clave" ? "0 2px 6px rgba(147,51,234,0.25)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>❓</span> Consultas Clave
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


      {/* ── SUB-PESTAÑA 2: PERFIL COMPETITIVO (PARTIDO 100%) ── */}
      {subTab === "perfil_competitivo" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* BANNER METODOLÓGICO SUPERIOR */}
          <div
            style={{
              background: "linear-gradient(to right, #fff7ed, #ffffff)",
              borderRadius: "10px",
              padding: "16px 20px",
              border: "1px solid #fed7aa",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "18px" }}>🏆</span>
                  <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 900, color: "#c2410c" }}>
                    Perfil Competitivo Individual (Benchmark 100% Match)
                  </h4>
                  <span
                    style={{
                      background: "#ffedd5",
                      color: "#9a3412",
                      fontSize: "11px",
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: "6px",
                    }}
                  >
                    Exclusivo 1ª y 2ª Parte (Cat / Esp)
                  </span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#475569", lineHeight: 1.5, maxWidth: "880px" }}>
                  Cálculo científico del perfil de competición filtrando estrictamente las tareas oficiales de <strong>primera parte y segunda parte</strong> (eliminando calentamientos y activaciones).
                  Aplica la regla estricta: <strong>(Máximo + Promedio) / 2</strong> en jugadores con varios partidos de 90 min, valor directo en 1 partido de 90 min, <strong>proyección 45' × 2 (*)</strong> en jugadores con al menos 45 min, y <strong>copia de posición (**)</strong> en aquellos con &lt;45 min.
                </p>
              </div>

              {/* Botón de reset de overrides */}
              {Object.keys(customOverrides).length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("¿Restablecer todos los benchmarks ajustados manualmente y volver a la fórmula automática?")) {
                      setCustomOverrides({});
                      if (typeof window !== "undefined") {
                        localStorage.removeItem("gps_competitive_profile_overrides");
                      }
                    }
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid #f87171",
                    background: "#fef2f2",
                    color: "#dc2626",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ↺ Restablecer Ajustes Manuales ({Object.keys(customOverrides).length})
                </button>
              )}
            </div>
          </div>

          {/* PANEL DE CONTROL: BUSCADOR + FILTROS DE POSICIÓN Y ESTADO */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              padding: "14px 18px",
              border: "1px solid #cbd5e1",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            {/* Buscador */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1 1 240px", maxWidth: "340px" }}>
              <span style={{ fontSize: "14px", color: "#64748b" }}>🔍</span>
              <input
                type="text"
                placeholder="Buscar por jugador o dorsal..."
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "12px",
                  outline: "none",
                }}
              />
            </div>

            {/* Filtros Posición y Categoría */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              {/* Filtro Posición */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#64748b" }}>Posición:</span>
                <select
                  value={profileFilterPos}
                  onChange={(e) => setProfileFilterPos(e.target.value)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#0f172a",
                    cursor: "pointer",
                  }}
                >
                  <option value="TODOS">Todas las Posiciones</option>
                  <option value="DEF">Defensas (DEF/LAT/CEN)</option>
                  <option value="MED">Centrocampistas (MED/PIV/INT)</option>
                  <option value="DEL">Delanteros (DEL/EXT/PUN)</option>
                  <option value="POR">Porteros (POR)</option>
                </select>
              </div>

              {/* Filtro Fiabilidad Metodológica */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#64748b" }}>Método:</span>
                <select
                  value={profileFilterCategory}
                  onChange={(e) => setProfileFilterCategory(e.target.value)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#0f172a",
                    cursor: "pointer",
                  }}
                >
                  <option value="TODOS">Todos los perfiles</option>
                  <option value="REALS">🟢 100% Reales (Partidos 90')</option>
                  <option value="ESTIMADOS">🟡 Estimados 45' x 2 (*)</option>
                  <option value="COPIADOS">🟠 Copiados de Posición (**)</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── SELECTOR DINÁMICO DE VARIABLES A MOSTRAR ── */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              padding: "16px 20px",
              border: "1.5px solid #cbd5e1",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>⚙️</span>
                <div>
                  <strong style={{ fontSize: "13.5px", color: "#0f172a" }}>Elige las Variables de tu Perfil Competitivo:</strong>
                  <span style={{ fontSize: "11.5px", color: "#64748b", marginLeft: "8px" }}>
                    (Haz clic en cada métrica para activarla o desactivarla en la tabla • <strong>{profileSelectedMetrics.length} seleccionadas</strong>)
                  </span>
                </div>
              </div>

              {/* Botones Presets Rápidos */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>Presets:</span>
                <button
                  type="button"
                  onClick={() => handleSelectProfilePreset(["dist", "mMin", "hsr", "sprint", "accDec"])}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    color: "#0369a1",
                  }}
                >
                  ⭐ Top 5 Estándar
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectProfilePreset(["mMin", "hsr", "sprint", "accDec", "maxSpeed"])}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    color: "#ea580c",
                  }}
                >
                  ⚡ Alta Intensidad
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectProfilePreset(["load", "accs", "decs", "accDec", "sprintsCount"])}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    color: "#7e22ce",
                  }}
                >
                  🔋 Neuromuscular
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectProfilePreset(Object.keys(PROFILE_AVAILABLE_METRICS))}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    color: "#0f172a",
                  }}
                >
                  🌐 Ver Todas ({Object.keys(PROFILE_AVAILABLE_METRICS).length})
                </button>
              </div>
            </div>

            {/* Chips interactivos de variables */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {Object.entries(PROFILE_AVAILABLE_METRICS).map(([k, cfg]) => {
                const isSelected = profileSelectedMetrics.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleToggleProfileMetric(k)}
                    title={cfg.desc}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: isSelected ? `2px solid ${cfg.color}` : "1px solid #cbd5e1",
                      background: isSelected ? `${cfg.color}15` : "#ffffff",
                      color: isSelected ? cfg.color : "#64748b",
                      fontSize: "12px",
                      fontWeight: isSelected ? 800 : 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      boxShadow: isSelected ? "0 1px 4px rgba(0,0,0,0.05)" : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span
                      style={{
                        width: "14px",
                        height: "14px",
                        borderRadius: "4px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: isSelected ? `1.5px solid ${cfg.color}` : "1.5px solid #94a3b8",
                        background: isSelected ? cfg.color : "transparent",
                        color: "#ffffff",
                        fontSize: "10px",
                        fontWeight: 900,
                      }}
                    >
                      {isSelected ? "✓" : ""}
                    </span>
                    <span>{cfg.label}</span>
                    <span style={{ fontSize: "10px", opacity: 0.75 }}>({cfg.unit})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* TARJETAS RESUMEN DE LA PLANTILLA SEGÚN METODOLOGÍA */}
          {(() => {
            let countReales = 0;
            let countEstimados = 0;
            let countCopiados = 0;

            jugadores.forEach((j) => {
              const p = competitiveProfiles.get(j.id);
              if (!p) return;
              if (p.isReal) countReales++;
              else if (p.category === "estimado_45") countEstimados++;
              else countCopiados++;
            });

            return (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    background: "#f0fdf4",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    border: "1px solid #bbf7d0",
                  }}
                >
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#166534", textTransform: "uppercase" }}>
                    🟢 Perfiles 100% Reales
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "2px" }}>
                    <strong style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a" }}>{countReales}</strong>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>jugadores con 90 min</span>
                  </div>
                </div>

                <div
                  style={{
                    background: "#fefce8",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    border: "1px solid #fef08a",
                  }}
                >
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#854d0e", textTransform: "uppercase" }}>
                    🟡 Estimados 45' × 2 (*)
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "2px" }}>
                    <strong style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a" }}>{countEstimados}</strong>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>jugadores &ge;45 min *</span>
                  </div>
                </div>

                <div
                  style={{
                    background: "#fff7ed",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    border: "1px solid #fed7aa",
                  }}
                >
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#9a3412", textTransform: "uppercase" }}>
                    🟠 Copiados Posición (**)
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "2px" }}>
                    <strong style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a" }}>{countCopiados}</strong>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>jugadores &lt;45 min **</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* TABLA DE PERFILES COMPETITIVOS CON LAS VARIABLES SELECCIONADAS */}
          <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #cbd5e1", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", color: "#0f172a" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #cbd5e1", textAlign: "left", color: "#475569", fontSize: "11px", textTransform: "uppercase" }}>
                    <th style={{ padding: "10px 12px", minWidth: "160px" }}>Jugador</th>
                    <th style={{ padding: "10px 10px", textAlign: "center", minWidth: "140px" }}>Origen / Método</th>
                    <th style={{ padding: "10px 10px", textAlign: "center", minWidth: "110px" }}>Partidos Analizados</th>
                    {profileSelectedMetrics.map((metKey) => {
                      const cfg = PROFILE_AVAILABLE_METRICS[metKey];
                      if (!cfg) return null;
                      return (
                        <th
                          key={metKey}
                          style={{
                            padding: "10px 12px",
                            textAlign: "right",
                            color: cfg.color,
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                            minWidth: "100px",
                          }}
                        >
                          <div>{cfg.label}</div>
                          <div style={{ fontSize: "9.5px", fontWeight: 600, color: "#64748b" }}>({cfg.unit})</div>
                        </th>
                      );
                    })}
                    <th style={{ padding: "10px 12px", textAlign: "center", minWidth: "80px" }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {jugadores
                    .filter((j) => {
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
                    })
                    .map((j, idx) => {
                      const p = competitiveProfiles.get(j.id) || {
                        dist: 10200,
                        mMin: 113,
                        hsr: 650,
                        sprint: 180,
                        accDec: 85,
                        accs: 45,
                        decs: 40,
                        load: 850,
                        hmld: 820,
                        sprintsCount: 15,
                        maxSpeed: 28.5,
                        category: "copiado_posicion",
                        isReal: false,
                        badgeText: "Copiado Posición**",
                        asterisk: "**",
                        detailText: "Sin partidos (0')**",
                      };

                      let badgeBg = "#dcfce7";
                      let badgeColor = "#15803d";
                      if (p.category === "estimado_45") {
                        badgeBg = "#fef3c7";
                        badgeColor = "#b45309";
                      } else if (p.category === "copiado_posicion") {
                        badgeBg = "#ffedd5";
                        badgeColor = "#c2410c";
                      } else if (p.category === "real_uno") {
                        badgeBg = "#e0f2fe";
                        badgeColor = "#0369a1";
                      }

                      return (
                        <tr key={j.id || idx} style={{ borderBottom: "1px solid #f1f5f9", background: idx % 2 === 0 ? "#ffffff" : "#fbfcfd" }}>
                          {/* Jugador */}
                          <td style={{ padding: "9px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              {renderDisponibilidadBadge && renderDisponibilidadBadge(j)}
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
                                <strong style={{ fontSize: "12.5px", color: "#0f172a" }}>
                                  {j.apodo || j.nombre}
                                </strong>
                                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700 }}>
                                  {j.posicion || "JUG"}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Origen / Método */}
                          <td style={{ padding: "9px 10px", textAlign: "center" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "3px 8px",
                                borderRadius: "6px",
                                background: badgeBg,
                                color: badgeColor,
                                fontSize: "11px",
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                              }}
                              title={p.detailText}
                            >
                              {p.badgeText}
                            </span>
                          </td>

                          {/* Partidos Analizados */}
                          <td style={{ padding: "9px 10px", textAlign: "center", fontSize: "11.5px", color: "#475569" }}>
                            <div style={{ fontWeight: 700 }}>{p.matchesCount || 0} partidos</div>
                            <div style={{ fontSize: "10px", color: "#94a3b8" }}>
                              {p.fullMatchesCount || 0} de 90' {p.halfMatchesCount ? `| ${p.halfMatchesCount} de 45'` : ""}
                            </div>
                          </td>

                          {/* Columnas dinámicas según variables seleccionadas */}
                          {profileSelectedMetrics.map((metKey) => {
                            const cfg = PROFILE_AVAILABLE_METRICS[metKey];
                            if (!cfg) return null;
                            const val = p[metKey] !== undefined ? p[metKey] : 0;
                            const isEstimated = p.category === "estimado_45";
                            const isCopied = p.category === "copiado_posicion";
                            const suffix = isEstimated ? "*" : isCopied ? "**" : "";

                            return (
                              <td
                                key={metKey}
                                style={{
                                  padding: "9px 12px",
                                  textAlign: "right",
                                  fontWeight: 700,
                                  whiteSpace: "nowrap",
                                  fontSize: "12px",
                                }}
                              >
                                <span style={{ color: cfg.color }}>
                                  {typeof val === "number"
                                    ? val % 1 !== 0
                                      ? val.toFixed(1)
                                      : val.toLocaleString()
                                    : val}
                                </span>
                                {suffix && (
                                  <span
                                    style={{
                                      marginLeft: "3px",
                                      fontWeight: 900,
                                      color: isEstimated ? "#d97706" : "#c2410c",
                                      fontSize: "12.5px",
                                    }}
                                    title={isEstimated ? "Estimado 45x2* (No real)" : "Copiado de posición** (No real)"}
                                  >
                                    {suffix}
                                  </span>
                                )}
                              </td>
                            );
                          })}

                          {/* Acciones */}
                          <td style={{ padding: "9px 12px", textAlign: "center" }}>
                            <button
                              type="button"
                              onClick={() => {
                                const currentDist = p.dist;
                                const input = window.prompt(`Editar Distancia Competitiva para ${j.apodo || j.nombre} (m):`, String(currentDist));
                                if (input && !isNaN(Number(input))) {
                                  const newDist = Number(input);
                                  const updated = { ...customOverrides, [j.id]: { ...(customOverrides[j.id] || {}), dist: newDist } };
                                  setCustomOverrides(updated);
                                  if (typeof window !== "undefined") {
                                    localStorage.setItem("gps_competitive_profile_overrides", JSON.stringify(updated));
                                  }
                                }
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
                              title="Ajustar benchmark manualmente"
                            >
                              ✏️ Ajustar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* LEYENDA METODOLÓGICA DE ASTERISCOS Y REFERENCIAS */}
          <div
            style={{
              background: "#f8fafc",
              borderRadius: "8px",
              padding: "12px 16px",
              border: "1px solid #e2e8f0",
              fontSize: "11.5px",
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 800, color: "#334155", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>ℹ️</span> Leyenda de Constancia Metodológica (Fórmula Científica de Perfil Competitivo)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "8px", marginTop: "6px" }}>
              <div>
                <strong style={{ color: "#d97706" }}>* Asterisco Simple (*):</strong> Perfil <em>no real</em>. El jugador no disputó 90 min completos en ningún partido analizado, pero sí jugó al menos una parte de 45 min. El valor se calcula proyectando <code>45 min × 2</code>.
              </div>
              <div>
                <strong style={{ color: "#c2410c" }}>** Doble Asterisco (**):</strong> Perfil <em>no real</em>. El jugador no alcanza 45 min en ninguna parte oficial. Se le asigna el perfil promedio de los jugadores de su misma posición táctica (DEF, MED, DEL, POR).
              </div>
              <div>
                <strong style={{ color: "#15803d" }}>🟢 Perfiles 100% Reales:</strong> Calculados a partir de las tareas exclusivas de 1ª parte y 2ª parte de competición oficial. Si jugó varios partidos de 90 min, se toma la fórmula científica <code>(Máximo + Promedio) / 2</code>.
              </div>
            </div>
          </div>
        </div>
      )}



            {/* ── SUB-PESTAÑA 3: RATIOS SEMANALES VS PARTIDO (% MATCH) ── */}
      {subTab === "ratios_semanales" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#0f172a" }}>
                📆 Microciclo:
              </span>
              <select
                value={selectedWeekIdx}
                onChange={(e) => setSelectedWeekIdx(Number(e.target.value))}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1.5px solid #0284c7",
                  background: "#f0f9ff",
                  fontSize: "12.5px",
                  fontWeight: 800,
                  color: "#0369a1",
                  outline: "none",
                }}
              >
                {availableWeeks.map((w, idx) => (
                  <option key={w.start + idx} value={idx}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
                Formato de visualización:
              </span>
              <button
                type="button"
                onClick={() => setRatioFormat("multiplier")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: ratioFormat === "multiplier" ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                  background: ratioFormat === "multiplier" ? "#e0f2fe" : "#f8fafc",
                  color: ratioFormat === "multiplier" ? "#0369a1" : "#475569",
                  fontWeight: ratioFormat === "multiplier" ? 800 : 600,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Multiplicador (ej. 2.1x)
              </button>

              <button
                type="button"
                onClick={() => setRatioFormat("percentage")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: ratioFormat === "percentage" ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                  background: ratioFormat === "percentage" ? "#e0f2fe" : "#f8fafc",
                  color: ratioFormat === "percentage" ? "#0369a1" : "#475569",
                  fontWeight: ratioFormat === "percentage" ? 800 : 600,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Porcentaje (ej. 210%)
              </button>
            </div>
          </div>

          <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #cbd5e1", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12.5px", fontWeight: 900, color: "#0f172a" }}>
                Ratios de Carga Semanal vs 1 Partido Entero de Competición
              </span>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                Cálculo: (Carga Semanal Acumulada / Perfil de Partido)
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", color: "#0f172a" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", textAlign: "left", color: "#475569", fontSize: "11px", textTransform: "uppercase" }}>
                    <th style={{ padding: "10px 12px" }}>Jugador</th>
                    <th style={{ padding: "10px 6px", textAlign: "center" }}>Sesiones</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Distancia (m / Ratio)</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>HSR (m / Ratio)</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Sprint (m / Ratio)</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Acc + Dec (Ratio)</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Player Load (Ratio)</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Vmax Semana (% Top)</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyRatiosData.map((row, idx) => {
                    const j = row.jugador;
                    const sprintBadge = getRatioBadgeStyle(row.ratioSprint, "sprint");

                    return (
                      <tr key={j.id || idx} style={{ borderBottom: "1px solid #f1f5f9", background: idx % 2 === 0 ? "#ffffff" : "#fcfcfd" }}>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {renderDisponibilidadBadge && renderDisponibilidadBadge(j)}
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span style={{ fontWeight: 800, color: "#0f172a" }}>
                                {j.dorsal ? "#" + j.dorsal + " " : ""}{j.apodo || j.nombre}
                              </span>
                              <span style={{ fontSize: "10px", color: "#64748b" }}>
                                {j.posicion || "Jugador"}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: "10px 6px", textAlign: "center", fontWeight: 800 }}>
                          {row.sessionsCount}
                        </td>

                        <td style={{ padding: "10px 10px", textAlign: "right" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                            <span style={{ fontWeight: 800, color: "#0f172a" }}>
                              {row.weekDist.toLocaleString("es-ES")} m
                            </span>
                            <span style={{ fontSize: "11px", fontWeight: 900, color: "#1e40af" }}>
                              {formatRatioVal(row.ratioDist)}
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: "10px 10px", textAlign: "right" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                            <span style={{ fontWeight: 800, color: "#ea580c" }}>
                              {row.weekHsr.toLocaleString("es-ES")} m
                            </span>
                            <span style={{ fontSize: "11px", fontWeight: 900, color: "#c2410c" }}>
                              {formatRatioVal(row.ratioHsr)}
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: "10px 10px", textAlign: "right" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                            <span style={{ fontWeight: 800, color: "#dc2626" }}>
                              {row.weekSprint.toLocaleString("es-ES")} m
                            </span>
                            <span
                              style={{
                                fontSize: "10.5px",
                                fontWeight: 900,
                                padding: "1px 6px",
                                borderRadius: "4px",
                                background: sprintBadge.bg,
                                color: sprintBadge.color,
                              }}
                            >
                              {formatRatioVal(row.ratioSprint)} {row.ratioSprint < 0.75 ? "⚠️" : ""}
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: "10px 10px", textAlign: "right" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                            <span style={{ fontWeight: 800, color: "#9333ea" }}>
                              {row.weekAccDec}
                            </span>
                            <span style={{ fontSize: "11px", fontWeight: 900, color: "#7e22ce" }}>
                              {formatRatioVal(row.ratioAccDec)}
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: "10px 10px", textAlign: "right" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                            <span style={{ fontWeight: 800, color: "#16a34a" }}>
                              {row.weekLoad}
                            </span>
                            <span style={{ fontSize: "11px", fontWeight: 900, color: "#15803d" }}>
                              {formatRatioVal(row.ratioLoad)}
                            </span>
                          </div>
                        </td>

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
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── SUB-PESTAÑA 4: CONSULTAS & PREGUNTAS CLAVE ── */}
      {subTab === "preguntas_clave" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ background: "#ffffff", padding: "16px 20px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
              ❓ Centro de Consultas Clave de Rendimiento
            </h3>
            <p style={{ margin: "4px 0 16px 0", fontSize: "12.5px", color: "#64748b" }}>
              Acceso rápido a las preguntas más críticas de control de carga, prevención de lesiones y rendimiento deportivo.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
              <div
                onClick={() => setSubTab("velocidad")}
                style={{
                  background: "#f0fdf4",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  border: "1px solid #bbf7d0",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "16px" }}>🚀</span>
                  <span style={{ fontSize: "11px", fontWeight: 800, background: "#dcfce7", color: "#15803d", padding: "2px 6px", borderRadius: "4px" }}>
                    {vmaxStats.alerta + vmaxStats.riesgo} alertas
                  </span>
                </div>
                <strong style={{ fontSize: "13px", color: "#166534" }}>
                  ¿Cuánto hace que un jugador no llega al 90% de Vmax?
                </strong>
                <span style={{ fontSize: "11.5px", color: "#4b5563" }}>
                  Identifica jugadores sin estímulo neuromuscular en los últimos 5 a 8 días para programar sprints preventivos.
                </span>
              </div>

              <div
                onClick={() => {
                  setSubTab("ratios_semanales");
                  setRatioFormat("multiplier");
                }}
                style={{
                  background: "#eff6ff",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  border: "1px solid #bfdbfe",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "16px" }}>📈</span>
                  <span style={{ fontSize: "11px", fontWeight: 800, background: "#dbeafe", color: "#1e40af", padding: "2px 6px", borderRadius: "4px" }}>
                    Ratios vs Partido
                  </span>
                </div>
                <strong style={{ fontSize: "13px", color: "#1e3a8a" }}>
                  ¿Cuál es el ratio de carga semanal respecto a 1 partido entero?
                </strong>
                <span style={{ fontSize: "11.5px", color: "#4b5563" }}>
                  Mide los multiplicadores de volumen (distancia), HSR, sprint y aceleraciones para calibrar el microciclo.
                </span>
              </div>

              <div
                onClick={() => setSubTab("perfil_competitivo")}
                style={{
                  background: "#fff7ed",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  border: "1px solid #fed7aa",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "16px" }}>🏆</span>
                  <span style={{ fontSize: "11px", fontWeight: 800, background: "#ffedd5", color: "#c2410c", padding: "2px 6px", borderRadius: "4px" }}>
                    Match Profile
                  </span>
                </div>
                <strong style={{ fontSize: "13px", color: "#9a3412" }}>
                  ¿Cuál es el perfil competitivo (100%) de cada jugador?
                </strong>
                <span style={{ fontSize: "11.5px", color: "#4b5563" }}>
                  Calcula la huella de 90 minutos de partido en distancia, HSR, sprints y m/min.
                </span>
              </div>

              <div
                style={{
                  background: "#faf5ff",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  border: "1.5px dashed #d8b4fe",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "16px" }}>➕</span>
                  <span style={{ fontSize: "11px", fontWeight: 800, background: "#f3e8ff", color: "#7e22ce", padding: "2px 6px", borderRadius: "4px" }}>
                    Escalable
                  </span>
                </div>
                <strong style={{ fontSize: "13px", color: "#6b21a8" }}>
                  Nuevas preguntas por responder
                </strong>
                <span style={{ fontSize: "11.5px", color: "#6b7280" }}>
                  Aquí iremos integrando las siguientes preguntas analíticas que me vayas indicando.
                </span>
              </div>
            </div>
          </div>
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
                onClick={handleSyncDownloadsGps}
                disabled={isGpsUploading}
                style={{
                  background: isGpsUploading ? "#94a3b8" : "#1e3a8a",
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
                }}
              >
                <span>{isGpsUploading ? "⏳" : "🔄"}</span>
                <span>{isGpsUploading ? "Sincronizando..." : "Sincronizar Downloads"}</span>
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
    </div>
  );
}
