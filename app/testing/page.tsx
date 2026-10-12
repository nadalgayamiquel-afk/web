"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { getActiveJugadores, updatePesosBatch, getTestingDatasets, saveTestingDataset, deleteTestingDataset } from "@/app/actions";
import { useReportClubInfo } from "@/app/lib/useReportClubInfo";

/* ─── Types ─── */
type Jugador = {
  id: string;
  nombre: string;
  apodo: string | null;
  posicion: string | null;
  dorsal?: string | number | null;
  activo?: boolean | null;
  foto_url?: string | null;
  equipo?: string | null;
};

// Estructura A: Jugadores × Fechas (un valor por celda)
// Estructura B: Jugadores × Métricas (múltiples columnas de métricas, una sola fecha/sesión)
// Estructura C: Jugadores × Fechas (múltiples valores separados por coma en cada celda)
// Estructura D: Tabular Base de Datos (Fecha, Jugador, Tricipital, Suprailiaco, Subescapular, Abdominal, Cuadriceps, Gemelo, Suma...)
type FileStructure = "A" | "B" | "C" | "D";

type TestType = {
  id: string;
  name: string;
  structure: FileStructure;
  unit: string;        // Unidad de medida (kg, mm, s, cm, etc.)
  icon: string;
  color: string;
  builtIn: boolean;    // No se puede eliminar
};

type TabularRowItem = {
  fecha: string;
  jugador: string;
  metrics: Record<string, number | null>;
  suma: number | null;
};

export type DateGroup = {
  id: string;
  name: string;             // Nombre personalizado del grupo/medición (ej: "Medición 1", "Test Pretemporada")
  dates: string[];          // Fechas que componen esta medición
  strategy?: "latest" | "average" | "max" | "min"; // Resolución en caso de que un jugador tenga datos en varios días
};

type TestDataSet = {
  id: string;
  name: string;             // Nombre personalizado del dataset (ej: "Pliegues 6 Cutáneos")
  testTypeId: string;       // Referencia al TestType
  structure: FileStructure;
  // Para estructura A y C: dates = fechas, players.values = valores
  // Para estructura B: dates = nombres de métricas, players.values = valores de cada métrica
  // Para estructura D: dates = fechas únicas, players.values = suma de pliegues por fecha
  dates: string[];
  players: {
    name: string;
    values: (number | null)[];
    metricsByDate?: Record<string, Record<string, number | null>>;
  }[];
  metricsList?: string[];   // Para estructura D: ["Suma", "Tricipital", "Suprailiaco", "Subescapular", "Abdominal", "Cuadriceps", "Gemelo"]
  tabularRows?: TabularRowItem[];
  sessionDate?: string;     // Para estructura B: fecha de la sesión de test
  dateGroups?: DateGroup[]; // Agrupaciones de fechas multidía de un mismo test
  createdAt: string;
};

/* ─── Default Test Types ─── */
const DEFAULT_TEST_TYPES: TestType[] = [
  { id: "peso", name: "Peso", structure: "A", unit: "kg", icon: "⚖️", color: "#6366f1", builtIn: true },
  { id: "pliegues", name: "Pliegues (6 Cutáneos)", structure: "D", unit: "mm", icon: "📐", color: "#f59e0b", builtIn: true },
  { id: "pliegues_simple", name: "Pliegues (Suma Simple)", structure: "A", unit: "mm", icon: "📏", color: "#ea580c", builtIn: true },
  { id: "sprint", name: "Sprint", structure: "B", unit: "s", icon: "🏃", color: "#ef4444", builtIn: true },
];

/* ─── Nav ─── */
const standaloneScreens = [
  ["▦", "Índice", "/indice"], ["🏃", "Deportistas", "/deportistas"],
  ["📅", "Planificación", "/calendario"], ["📋", "Disponibilidad", "/disponibilidad"],
  ["⚡", "Cargas", "/cargas"], ["🗓️", "Calendario", "/eventos"],
  ["⚽", "Campo", "/campo"], ["🏋️", "Gimnasio", "/gimnasio"], ["🏆", "Partidos", "/partidos"],
  ["📊", "Testing", "/testing"],
] as const;

/* ─── Colors ─── */
const CHART_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#14b8a6", "#84cc16",
  "#a855f7", "#3b82f6", "#e11d48", "#22c55e", "#eab308",
  "#0ea5e9", "#d946ef", "#f43f5e", "#64748b", "#0d9488",
  "#7c3aed", "#dc2626", "#059669", "#ca8a04", "#2563eb",
];

/* ─── Helpers ─── */
function parseExcelDate(raw: string): string {
  if (!raw) return "";
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}`;
  const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m2) return `20${m2[3]}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  const num = Number(s);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const d = new Date((num - 25569) * 86400 * 1000);
    return d.toISOString().split("T")[0];
  }
  return s;
}

function formatDateShort(iso: string): string {
  if (!iso) return "";
  if (iso.toLowerCase().startsWith("medici") || iso.toLowerCase().startsWith("m")) return iso;
  try {
    const d = new Date(iso + "T12:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }).replace(".", "");
  } catch {
    return iso;
  }
}

function formatPlieguesMedicionLabel(val: string, idx: number): string {
  if (!val) return `Medición ${idx + 1}`;
  const trimmed = val.trim();
  if (trimmed.includes("(") && trimmed.includes(")")) return trimmed;

  // Si ya es "Medición 1" o "1" o mes 8 -> Medición 1 (Agosto)
  if (/^medici[oó]n\s*1$/i.test(trimmed) || trimmed === "1") {
    return "Medición 1 (Agosto)";
  }
  if (/^medici[oó]n\s*(\d+)$/i.test(trimmed)) {
    const num = trimmed.match(/^medici[oó]n\s*(\d+)$/i)?.[1] || `${idx + 1}`;
    if (num === "1") return "Medición 1 (Agosto)";
    return `Medición ${num}`;
  }

  // Si es formato fecha YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    try {
      const d = new Date(trimmed + "T12:00:00");
      const month = d.toLocaleDateString("es-ES", { month: "long" });
      const capMonth = month.charAt(0).toUpperCase() + month.slice(1);
      return `Medición ${idx + 1} (${capMonth})`;
    } catch {
      return `Medición ${idx + 1}`;
    }
  }

  return trimmed;
}

function getStorageKey(name: string) {
  return `testing_dataset_${name}`;
}

/* ─── Structure Description Component ─── */
function StructurePreview({ structure }: { structure: FileStructure }) {
  if (structure === "A") {
    return (
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#1e3a8a", marginBottom: 4 }}>Estructura A: Jugadores × Fechas</div>
        <table style={{ borderCollapse: "collapse", fontSize: 9, background: "#fff", borderRadius: 4, overflow: "hidden", border: "1px solid #e2e8f0" }}>
          <thead>
            <tr style={{ background: "#1e3a8a", color: "#fff" }}>
              <th style={{ padding: "3px 8px" }}></th>
              <th style={{ padding: "3px 8px" }}>01/09</th>
              <th style={{ padding: "3px 8px" }}>15/09</th>
              <th style={{ padding: "3px 8px" }}>01/10</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={{ padding: "2px 8px", fontWeight: 700 }}>Jugador 1</td><td style={{ padding: "2px 8px", textAlign: "center" }}>75.2</td><td style={{ padding: "2px 8px", textAlign: "center" }}>74.8</td><td style={{ padding: "2px 8px", textAlign: "center" }}>75.0</td></tr>
            <tr style={{ background: "#f8fafc" }}><td style={{ padding: "2px 8px", fontWeight: 700 }}>Jugador 2</td><td style={{ padding: "2px 8px", textAlign: "center" }}>82.1</td><td style={{ padding: "2px 8px", textAlign: "center" }}>81.5</td><td style={{ padding: "2px 8px", textAlign: "center" }}>82.3</td></tr>
          </tbody>
        </table>
        <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 3 }}>Fila 1 = Fechas · Columna 1 = Jugadores · Celdas = Un valor</div>
      </div>
    );
  }
  if (structure === "B") {
    return (
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#1e3a8a", marginBottom: 4 }}>Estructura B: Jugadores × Métricas</div>
        <table style={{ borderCollapse: "collapse", fontSize: 9, background: "#fff", borderRadius: 4, overflow: "hidden", border: "1px solid #e2e8f0" }}>
          <thead>
            <tr style={{ background: "#1e3a8a", color: "#fff" }}>
              <th style={{ padding: "3px 8px" }}></th>
              <th style={{ padding: "3px 8px" }}>10m</th>
              <th style={{ padding: "3px 8px" }}>20m</th>
              <th style={{ padding: "3px 8px" }}>30m</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={{ padding: "2px 8px", fontWeight: 700 }}>Jugador 1</td><td style={{ padding: "2px 8px", textAlign: "center" }}>1.82</td><td style={{ padding: "2px 8px", textAlign: "center" }}>3.15</td><td style={{ padding: "2px 8px", textAlign: "center" }}>4.42</td></tr>
            <tr style={{ background: "#f8fafc" }}><td style={{ padding: "2px 8px", fontWeight: 700 }}>Jugador 2</td><td style={{ padding: "2px 8px", textAlign: "center" }}>1.76</td><td style={{ padding: "2px 8px", textAlign: "center" }}>3.08</td><td style={{ padding: "2px 8px", textAlign: "center" }}>4.31</td></tr>
          </tbody>
        </table>
        <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 3 }}>Fila 1 = Nombres de métricas · Columna 1 = Jugadores · Celdas = Valor por métrica</div>
      </div>
    );
  }
  if (structure === "C") {
    return (
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#1e3a8a", marginBottom: 4 }}>Estructura C: Jugadores × Fechas (multi-valor)</div>
        <table style={{ borderCollapse: "collapse", fontSize: 9, background: "#fff", borderRadius: 4, overflow: "hidden", border: "1px solid #e2e8f0" }}>
          <thead>
            <tr style={{ background: "#1e3a8a", color: "#fff" }}>
              <th style={{ padding: "3px 8px" }}></th>
              <th style={{ padding: "3px 8px" }}>01/09</th>
              <th style={{ padding: "3px 8px" }}>15/09</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={{ padding: "2px 8px", fontWeight: 700 }}>Jugador 1</td><td style={{ padding: "2px 8px", textAlign: "center" }}>8.2, 6.1, 7.5</td><td style={{ padding: "2px 8px", textAlign: "center" }}>7.8, 5.9, 7.0</td></tr>
            <tr style={{ background: "#f8fafc" }}><td style={{ padding: "2px 8px", fontWeight: 700 }}>Jugador 2</td><td style={{ padding: "2px 8px", textAlign: "center" }}>9.0, 7.2, 8.1</td><td style={{ padding: "2px 8px", textAlign: "center" }}>8.5, 6.8, 7.6</td></tr>
          </tbody>
        </table>
        <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 3 }}>Fila 1 = Fechas · Columna 1 = Jugadores · Celdas = Valores separados por coma (se usa el promedio)</div>
      </div>
    );
  }

  // Estructura D: Tabular (Fecha, Jugador, 6 Pliegues, Suma)
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#1e3a8a", marginBottom: 4 }}>
        Estructura D: Tabular (Fecha, Jugador, Tricipital, Suprailiaco, Subescapular, Abdominal, Cuadriceps, Gemelo, Suma)
      </div>
      <table style={{ borderCollapse: "collapse", fontSize: 8.5, background: "#fff", borderRadius: 4, overflow: "hidden", border: "1px solid #e2e8f0", width: "100%" }}>
        <thead>
          <tr style={{ background: "#1e3a8a", color: "#fff" }}>
            <th style={{ padding: "2px 5px" }}>Fecha</th>
            <th style={{ padding: "2px 5px" }}>Jugador</th>
            <th style={{ padding: "2px 4px" }}>Tric.</th>
            <th style={{ padding: "2px 4px" }}>Supra.</th>
            <th style={{ padding: "2px 4px" }}>Subesc.</th>
            <th style={{ padding: "2px 4px" }}>Abdom.</th>
            <th style={{ padding: "2px 4px" }}>Cuadr.</th>
            <th style={{ padding: "2px 4px" }}>Gem.</th>
            <th style={{ padding: "2px 5px", background: "#0f172a" }}>Suma</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: "2px 5px" }}>01/08/2026</td>
            <td style={{ padding: "2px 5px", fontWeight: 700 }}>Jugador 1</td>
            <td style={{ padding: "2px 4px", textAlign: "center" }}>8.5</td>
            <td style={{ padding: "2px 4px", textAlign: "center" }}>10.2</td>
            <td style={{ padding: "2px 4px", textAlign: "center" }}>9.1</td>
            <td style={{ padding: "2px 4px", textAlign: "center" }}>12.4</td>
            <td style={{ padding: "2px 4px", textAlign: "center" }}>11.0</td>
            <td style={{ padding: "2px 4px", textAlign: "center" }}>7.8</td>
            <td style={{ padding: "2px 5px", textAlign: "center", fontWeight: 800, color: "#1e3a8a" }}>69.0</td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 3 }}>
        Formato tabla / base de datos con Fecha, Jugador y columnas de métricas de pliegues
      </div>
    </div>
  );
}

/* ─── Player Comparison Bar Chart (for Structure A single date or comparison) ─── */
function PlayerComparisonBarChart({
  players,
  unit = "kg",
  title,
}: {
  players: { name: string; value: number | null; color?: string }[];
  unit?: string;
  title?: string;
}) {
  const validPlayers = players.filter((p) => p.value !== null) as {
    name: string;
    value: number;
    color?: string;
  }[];

  if (validPlayers.length === 0) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8" }}>
        No hay datos numéricos de deportistas para mostrar.
      </div>
    );
  }

  const values = validPlayers.map((p) => p.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  const W = Math.max(800, validPlayers.length * 36 + 100);
  const H = 310;
  const PAD_L = 55;
  const PAD_R = 30;
  const PAD_T = 35;
  const PAD_B = 85;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const yMin = Math.max(0, Math.floor(min * 0.85));
  const yMax = Math.ceil(max * 1.08);

  const toY = (v: number) => PAD_T + chartH - ((v - yMin) / (yMax - yMin || 1)) * chartH;
  const slotW = chartW / validPlayers.length;
  const barW = Math.min(Math.max(slotW * 0.65, 14), 30);

  const yTicks: number[] = [];
  for (let i = 0; i <= 5; i++) yTicks.push(yMin + (yMax - yMin) * (i / 5));

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      {title && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: "13px", fontWeight: 800, color: "#1e293b" }}>{title}</h3>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: 4, border: "1px solid #bfdbfe" }}>
            Promedio equipo: <strong>{avg.toFixed(1)} {unit}</strong>
          </span>
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: "100%",
          minWidth: W > 800 ? W : "100%",
          maxWidth: W,
          height: "auto",
          background: "#fafbfc",
          borderRadius: 8,
          border: "1px solid #e2e8f0",
        }}
      >
        {/* Y Grid lines and values */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={toY(t)} y2={toY(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={PAD_L - 8} y={toY(t) + 4} textAnchor="end" fontSize={10} fill="#94a3b8" fontWeight={600}>
              {t.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Average reference line */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={toY(avg)}
          y2={toY(avg)}
          stroke="#2563eb"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <text
          x={W - PAD_R}
          y={toY(avg) - 4}
          textAnchor="end"
          fontSize={9}
          fontWeight={800}
          fill="#2563eb"
        >
          Media ({avg.toFixed(1)})
        </text>

        {/* Bars and labels for each player */}
        {validPlayers.map((p, idx) => {
          const cx = PAD_L + idx * slotW + slotW / 2;
          const bx = cx - barW / 2;
          const by = toY(p.value);
          const bh = toY(yMin) - by;
          const color = p.color || CHART_COLORS[idx % CHART_COLORS.length];

          return (
            <g key={idx}>
              {/* Bar */}
              <rect
                x={bx}
                y={by}
                width={barW}
                height={Math.max(bh, 2)}
                fill={color}
                rx={3}
                opacity={0.85}
              >
                <title>{p.name}: {p.value.toFixed(1)} {unit}</title>
              </rect>

              {/* Exact Value on top of bar */}
              <text
                x={cx}
                y={by - 4}
                textAnchor="middle"
                fontSize={9.5}
                fontWeight={800}
                fill="#0f172a"
              >
                {p.value.toFixed(1)}
              </text>

              {/* Player Name */}
              <text
                x={cx}
                y={H - 55}
                textAnchor="end"
                fontSize={9.5}
                fontWeight={700}
                fill="#334155"
                transform={`rotate(-45, ${cx}, ${H - 55})`}
              >
                {p.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Calcula el % de masa grasa a partir de la Suma de 6 Pliegues Cutáneos en mm
 * (Tríceps, Subescapular, Suprailíaco, Abdominal, Cuádriceps, Gemelo)
 * Ecuación de Yuhasz modificado / Carter para jóvenes deportistas y futbolistas.
 * Fórmula: % Grasa = (∑6 Pliegues × 0.097) + 3.64
 */
export function calculateGrasaPct6Pliegues(suma6mm: number | null | undefined): number | null {
  if (suma6mm === null || suma6mm === undefined || isNaN(suma6mm) || suma6mm <= 0) return null;
  const fat = (suma6mm * 0.097) + 3.64;
  return Number(Math.max(3.0, Math.min(45.0, fat)).toFixed(1));
}

export function getFatCategoryLabel(fatPct: number | null): { label: string; color: string } {
  if (fatPct === null) return { label: "—", color: "#64748b" };
  if (fatPct < 9.0) return { label: "Magro / Alto Rendimiento", color: "#0284c7" };
  if (fatPct <= 13.0) return { label: "Óptimo Competitivo", color: "#16a34a" };
  if (fatPct <= 16.5) return { label: "Aceptable / Moderado", color: "#d97706" };
  return { label: "Elevado / En Seguimiento", color: "#dc2626" };
}

/* ─── Testing Evolution / Date-Based Chart (X = Fechas, Y = Valores) ─── */
function TestingEvolutionChart({
  datasets,
  dates,
  unit = "kg",
  height = 370,
  title,
  xLabelsAreDates = true,
}: {
  datasets: { name: string; values: (number | null)[]; color: string }[];
  dates: string[];
  unit?: string;
  height?: number;
  title?: string;
  xLabelsAreDates?: boolean;
}) {
  const [highlightedPlayer, setHighlightedPlayer] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    name: string;
    value: number;
    date: string;
    color: string;
  } | null>(null);

  const W = 860;
  const H = height;
  const PAD_L = 65;
  const PAD_R = 40;
  const PAD_T = 40;
  const PAD_B = 55;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  let allVals: number[] = [];
  datasets.forEach((d) =>
    d.values.forEach((v) => {
      if (v !== null && !isNaN(v)) allVals.push(v);
    })
  );
  if (allVals.length === 0) allVals = [60, 90];
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const range = rawMax - rawMin || 10;
  const yMin = Math.max(0, Math.floor(rawMin - range * 0.12));
  const yMax = Math.ceil(rawMax + range * 0.12);

  const isSingleDate = dates.length <= 1;
  const xStep = dates.length > 1 ? chartW / (dates.length - 1) : chartW / 2;
  const toX = (i: number) => (dates.length > 1 ? PAD_L + i * xStep : PAD_L + chartW / 2);
  const toY = (v: number) => PAD_T + chartH - ((v - yMin) / (yMax - yMin || 1)) * chartH;

  const yTicks: number[] = [];
  for (let i = 0; i <= 6; i++) yTicks.push(yMin + (yMax - yMin) * (i / 6));

  const avgVal = allVals.length > 0 ? allVals.reduce((a, b) => a + b, 0) / allVals.length : null;

  return (
    <div style={{ width: "100%", position: "relative" }}>
      {/* Cabecera del Gráfico */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: "8px" }}>
        <div>
          {title && <h3 style={{ margin: 0, fontSize: "13.5px", fontWeight: 900, color: "#0f172a" }}>{title}</h3>}
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
            Eje X: <strong>Fecha</strong> · Eje Y: <strong>Valor ({unit})</strong>
          </div>
        </div>
        {avgVal !== null && (
          <div style={{ fontSize: "11.5px", fontWeight: 800, color: "#1e3a8a", background: "#eff6ff", border: "1px solid #bfdbfe", padding: "3px 10px", borderRadius: "6px" }}>
            Promedio equipo: <strong>{avgVal.toFixed(1)} {unit}</strong>
          </div>
        )}
      </div>

      <div style={{ position: "relative", overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{
            width: "100%",
            maxWidth: W,
            height: "auto",
            background: "#fafbfc",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
          }}
          onMouseLeave={() => setHoveredPoint(null)}
        >
          {/* Título Eje Y */}
          <text
            x={PAD_L - 10}
            y={PAD_T - 12}
            textAnchor="end"
            fontSize={10}
            fontWeight={800}
            fill="#475569"
          >
            {unit ? `(${unit})` : "Valor"}
          </text>

          {/* Líneas de cuadrícula Y y etiquetas de valores */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={PAD_L} x2={W - PAD_R} y1={toY(t)} y2={toY(t)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={PAD_L - 8} y={toY(t) + 4} textAnchor="end" fontSize={10} fontWeight={700} fill="#64748b">
                {t.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Línea media de referencia */}
          {avgVal !== null && (
            <g>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={toY(avgVal)}
                y2={toY(avgVal)}
                stroke="#2563eb"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                opacity={0.7}
              />
              <text
                x={W - PAD_R - 4}
                y={toY(avgVal) - 4}
                textAnchor="end"
                fontSize={9}
                fontWeight={800}
                fill="#2563eb"
              >
                Media: {avgVal.toFixed(1)}
              </text>
            </g>
          )}

          {/* Eje X y Fechas */}
          {dates.map((d, i) => {
            const xPos = toX(i);
            return (
              <g key={i}>
                <line x1={xPos} x2={xPos} y1={PAD_T} y2={PAD_T + chartH} stroke="#cbd5e1" strokeWidth={1} strokeDasharray={isSingleDate ? "none" : "2 2"} />
                <circle cx={xPos} cy={PAD_T + chartH} r={3} fill="#0f172a" />
                <text
                  x={xPos}
                  y={H - 18}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight={800}
                  fill="#0f172a"
                >
                  {xLabelsAreDates ? formatDateShort(d) : d}
                </text>
              </g>
            );
          })}

          {/* Líneas y Puntos de Jugadores */}
          {datasets.map((ds, di) => {
            const isHighlighted = highlightedPlayer === null || highlightedPlayer === ds.name;
            const isSingleHighlighted = highlightedPlayer === ds.name;

            const points = ds.values
              .map((v, i) => (v !== null && !isNaN(v) ? { x: toX(i), y: toY(v), v, dateIdx: i } : null))
              .filter(Boolean) as { x: number; y: number; v: number; dateIdx: number }[];

            if (points.length === 0) return null;

            const pathD =
              points.length >= 2
                ? points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
                : "";

            return (
              <g
                key={di}
                style={{
                  opacity: isHighlighted ? 1 : 0.2,
                  transition: "opacity 0.2s ease",
                  cursor: "pointer",
                }}
                onMouseEnter={() => setHighlightedPlayer(ds.name)}
                onMouseLeave={() => setHighlightedPlayer(null)}
              >
                {/* Línea temporal conectando fechas si hay >= 2 fechas */}
                {pathD && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke={ds.color}
                    strokeWidth={isSingleHighlighted ? 3 : 1.75}
                    opacity={isSingleHighlighted ? 1 : 0.75}
                  />
                )}

                {/* Puntos de medición */}
                {points.map((p, pi) => {
                  const dateStr = dates[p.dateIdx] ? (xLabelsAreDates ? formatDateShort(dates[p.dateIdx]) : dates[p.dateIdx]) : "";
                  const isHovered = hoveredPoint?.name === ds.name && hoveredPoint?.date === dateStr;

                  return (
                    <g
                      key={pi}
                      onMouseEnter={(e) => {
                        e.stopPropagation();
                        setHighlightedPlayer(ds.name);
                        setHoveredPoint({
                          x: p.x,
                          y: p.y,
                          name: ds.name,
                          value: p.v,
                          date: dateStr,
                          color: ds.color,
                        });
                      }}
                      onMouseLeave={() => {
                        setHoveredPoint(null);
                      }}
                    >
                      {/* Círculo invisible de mayor tamaño para facilitar el hover con el ratón */}
                      <circle cx={p.x} cy={p.y} r={12} fill="transparent" />

                      {/* Círculo visible del punto */}
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={isHovered || isSingleHighlighted ? 6 : 4}
                        fill={ds.color}
                        stroke="#ffffff"
                        strokeWidth={1.5}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Tooltip flotante dentro de SVG cuando se pasa el ratón sobre un punto */}
          {hoveredPoint && (
            <g
              transform={`translate(${hoveredPoint.x}, ${Math.max(PAD_T + 10, hoveredPoint.y - 12)})`}
              style={{ pointerEvents: "none" }}
            >
              {/* Sombra / Fondo del Tooltip */}
              <rect
                x={-90}
                y={-32}
                width={180}
                height={28}
                rx={6}
                fill="#0f172a"
                opacity={0.95}
                filter="drop-shadow(0 4px 6px rgba(0,0,0,0.2))"
              />
              {/* Punto de color en tooltip */}
              <circle cx={-76} cy={-18} r={4.5} fill={hoveredPoint.color} />
              {/* Texto Nombre: Valor */}
              <text
                x={-64}
                y={-14}
                fill="#ffffff"
                fontSize={10.5}
                fontWeight={800}
              >
                {hoveredPoint.name}: <tspan fill="#67e8f9">{hoveredPoint.value.toFixed(1)} {unit}</tspan>
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Leyenda interactiva de Deportistas */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: 6 }}>
          Leyenda de deportistas (pasa el ratón sobre un punto o nombre para resaltarlo):
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px", maxHeight: "120px", overflowY: "auto", padding: "4px" }}>
          {datasets.map((ds, i) => {
            const hasData = ds.values.some((v) => v !== null && !isNaN(v));
            if (!hasData) return null;
            const isSelected = highlightedPlayer === ds.name;

            return (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHighlightedPlayer(ds.name)}
                onMouseLeave={() => setHighlightedPlayer(null)}
                onClick={() => setHighlightedPlayer(isSelected ? null : ds.name)}
                style={{
                  fontSize: 10.5,
                  fontWeight: isSelected ? 800 : 600,
                  color: isSelected ? "#ffffff" : "#334155",
                  background: isSelected ? ds.color : "#f1f5f9",
                  border: `1px solid ${isSelected ? ds.color : "#cbd5e1"}`,
                  borderRadius: "5px",
                  padding: "3px 8px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "all 0.15s ease",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: isSelected ? "#ffffff" : ds.color,
                  }}
                ></span>
                {ds.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Gráfico Doble Eje (Eje Y: Peso [kg] vs Eje Y2: Pliegues [mm] — Eje X: Fechas) ─── */
function DualAxisPesoPlieguesChart({
  playerName,
  dates,
  pesoValues,
  plieguesValues,
  title,
  height = 370,
}: {
  playerName: string;
  dates: string[];
  pesoValues: (number | null)[];
  plieguesValues: (number | null)[];
  title?: string;
  height?: number;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const W = 880;
  const H = height;
  const PAD_L = 65;
  const PAD_R = 65;
  const PAD_T = 45;
  const PAD_B = 55;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  // Escala Eje Y1: Peso (kg)
  const validPesos = pesoValues.filter((v): v is number => v !== null && !isNaN(v));
  const rawMinPeso = validPesos.length > 0 ? Math.min(...validPesos) : 60;
  const rawMaxPeso = validPesos.length > 0 ? Math.max(...validPesos) : 85;
  const rangePeso = rawMaxPeso - rawMinPeso || 6;
  const yMinPeso = Math.max(0, Math.floor(rawMinPeso - rangePeso * 0.15));
  const yMaxPeso = Math.ceil(rawMaxPeso + rangePeso * 0.15);

  // Escala Eje Y2: Pliegues Suma 6 (mm)
  const validPliegues = plieguesValues.filter((v): v is number => v !== null && !isNaN(v));
  const rawMinPliegues = validPliegues.length > 0 ? Math.min(...validPliegues) : 35;
  const rawMaxPliegues = validPliegues.length > 0 ? Math.max(...validPliegues) : 80;
  const rangePliegues = rawMaxPliegues - rawMinPliegues || 10;
  const yMinPliegues = Math.max(0, Math.floor(rawMinPliegues - rangePliegues * 0.15));
  const yMaxPliegues = Math.ceil(rawMaxPliegues + rangePliegues * 0.15);

  const isSingleDate = dates.length <= 1;
  const xStep = dates.length > 1 ? chartW / (dates.length - 1) : chartW / 2;
  const toX = (i: number) => (dates.length > 1 ? PAD_L + i * xStep : PAD_L + chartW / 2);

  const toYPeso = (v: number) => PAD_T + chartH - ((v - yMinPeso) / (yMaxPeso - yMinPeso || 1)) * chartH;
  const toYPliegues = (v: number) => PAD_T + chartH - ((v - yMinPliegues) / (yMaxPliegues - yMinPliegues || 1)) * chartH;

  const yTicksPeso: number[] = [];
  const yTicksPliegues: number[] = [];
  for (let i = 0; i <= 5; i++) {
    yTicksPeso.push(yMinPeso + (yMaxPeso - yMinPeso) * (i / 5));
    yTicksPliegues.push(yMinPliegues + (yMaxPliegues - yMinPliegues) * (i / 5));
  }

  // Puntos y caminos
  const pesoPoints = pesoValues
    .map((v, i) => (v !== null && !isNaN(v) ? { x: toX(i), y: toYPeso(v), v, idx: i } : null))
    .filter(Boolean) as { x: number; y: number; v: number; idx: number }[];

  const plieguesPoints = plieguesValues
    .map((v, i) => (v !== null && !isNaN(v) ? { x: toX(i), y: toYPliegues(v), v, idx: i } : null))
    .filter(Boolean) as { x: number; y: number; v: number; idx: number }[];

  const pathPeso =
    pesoPoints.length >= 2 ? pesoPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") : "";
  const pathPliegues =
    plieguesPoints.length >= 2
      ? plieguesPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
      : "";

  const latestPeso = validPesos[validPesos.length - 1] ?? null;
  const latestPliegues = validPliegues[validPliegues.length - 1] ?? null;

  return (
    <div style={{ width: "100%", position: "relative" }}>
      {/* Cabecera del Gráfico Doble Eje */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 900, color: "#0f172a" }}>
            {title || `Evolución Doble Eje: Peso (kg) & Pliegues (mm) — ${playerName}`}
          </h3>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>
            Eje X: <strong>Fechas</strong> · Eje Y1 (Izq): <strong style={{ color: "#2563eb" }}>Peso (kg)</strong> · Eje Y2 (Dcha): <strong style={{ color: "#d97706" }}>∑ 6 Pliegues (mm)</strong>
          </div>
        </div>

        {/* Leyenda interactiva */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "#eff6ff",
              border: "1.5px solid #bfdbfe",
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "11.5px",
              fontWeight: 800,
              color: "#1e3a8a",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#2563eb", display: "inline-block" }} />
            Peso Corporal ({latestPeso !== null ? `${latestPeso.toFixed(1)} kg` : "kg"})
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "#fffbeb",
              border: "1.5px solid #fde68a",
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "11.5px",
              fontWeight: 800,
              color: "#b45309",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#d97706", display: "inline-block" }} />
            ∑ Suma 6 Pliegues ({latestPliegues !== null ? `${latestPliegues.toFixed(1)} mm` : "mm"})
          </div>
        </div>
      </div>

      <div style={{ position: "relative", overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{
            width: "100%",
            maxWidth: W,
            height: "auto",
            background: "#ffffff",
            borderRadius: 12,
            border: "1.5px solid #e2e8f0",
          }}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          {/* TÍTULOS DE EJES */}
          {/* Eje Izquierdo: Peso */}
          <text x={PAD_L - 8} y={PAD_T - 14} textAnchor="end" fontSize={10.5} fontWeight={900} fill="#2563eb">
            ⚖️ Peso (kg)
          </text>
          {/* Eje Derecho: Pliegues */}
          <text x={W - PAD_R + 8} y={PAD_T - 14} textAnchor="start" fontSize={10.5} fontWeight={900} fill="#d97706">
            📐 Pliegues (mm)
          </text>

          {/* Líneas horizontales de cuadrícula */}
          {yTicksPeso.map((tp, i) => {
            const yPos = toYPeso(tp);
            const tPliegues = yTicksPliegues[i];
            return (
              <g key={i}>
                <line x1={PAD_L} x2={W - PAD_R} y1={yPos} y2={yPos} stroke="#f1f5f9" strokeWidth={1} />
                {/* Etiqueta Eje Izquierdo (Peso) */}
                <text x={PAD_L - 8} y={yPos + 3.5} textAnchor="end" fontSize={10} fontWeight={800} fill="#2563eb">
                  {tp.toFixed(1)}
                </text>
                {/* Etiqueta Eje Derecho (Pliegues) */}
                <text x={W - PAD_R + 8} y={yPos + 3.5} textAnchor="start" fontSize={10} fontWeight={800} fill="#d97706">
                  {tPliegues.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Eje X y Líneas verticales por fecha */}
          {dates.map((d, i) => {
            const xPos = toX(i);
            const isHovered = hoveredIdx === i;
            return (
              <g key={i}>
                <line
                  x1={xPos}
                  x2={xPos}
                  y1={PAD_T}
                  y2={PAD_T + chartH}
                  stroke={isHovered ? "#94a3b8" : "#f1f5f9"}
                  strokeWidth={isHovered ? 1.5 : 1}
                  strokeDasharray={isSingleDate ? "none" : "3 3"}
                />
                {/* Zona invisible amplia para capturar hover de la fecha */}
                <rect
                  x={xPos - xStep / 2}
                  y={PAD_T}
                  width={xStep}
                  height={chartH + PAD_B}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredIdx(i)}
                />
                <circle cx={xPos} cy={PAD_T + chartH} r={3} fill={isHovered ? "#1e3a8a" : "#64748b"} />
                <text
                  x={xPos}
                  y={H - 18}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight={isHovered ? 900 : 700}
                  fill={isHovered ? "#0f172a" : "#475569"}
                >
                  {formatDateShort(d)}
                </text>
              </g>
            );
          })}

          {/* LÍNEA Y PUNTOS: PESO (AZUL) */}
          {pathPeso && (
            <path
              d={pathPeso}
              fill="none"
              stroke="#2563eb"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.95}
            />
          )}
          {pesoPoints.map((p) => {
            const isHovered = hoveredIdx === p.idx;
            return (
              <g key={`peso-${p.idx}`} onMouseEnter={() => setHoveredIdx(p.idx)}>
                <circle cx={p.x} cy={p.y} r={isHovered ? 7 : 4.5} fill="#2563eb" stroke="#ffffff" strokeWidth={2} />
                {/* Valor numérico visible sobre el punto */}
                <text
                  x={p.x}
                  y={p.y - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={900}
                  fill="#1d4ed8"
                  stroke="#ffffff"
                  strokeWidth={3}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  {p.v.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* LÍNEA Y PUNTOS: PLIEGUES (ÁMBAR/NARANJA) */}
          {pathPliegues && (
            <path
              d={pathPliegues}
              fill="none"
              stroke="#d97706"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.95}
            />
          )}
          {plieguesPoints.map((p) => {
            const isHovered = hoveredIdx === p.idx;
            return (
              <g key={`pliegues-${p.idx}`} onMouseEnter={() => setHoveredIdx(p.idx)}>
                <circle cx={p.x} cy={p.y} r={isHovered ? 7 : 4.5} fill="#d97706" stroke="#ffffff" strokeWidth={2} />
                {/* Valor numérico visible sobre el punto */}
                <text
                  x={p.x}
                  y={p.y - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={900}
                  fill="#b45309"
                  stroke="#ffffff"
                  strokeWidth={3}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  {p.v.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* TOOLTIP FLOTANTE INTERACTIVO */}
          {hoveredIdx !== null && dates[hoveredIdx] && (
            (() => {
              const xPos = toX(hoveredIdx);
              const pVal = pesoValues[hoveredIdx];
              const plVal = plieguesValues[hoveredIdx];
              const dateLabel = formatDateShort(dates[hoveredIdx]);
              const tooltipW = 190;
              const tooltipH = 68;
              const tooltipX = Math.max(PAD_L, Math.min(W - PAD_R - tooltipW, xPos - tooltipW / 2));
              const tooltipY = PAD_T + 10;

              return (
                <g transform={`translate(${tooltipX}, ${tooltipY})`} style={{ pointerEvents: "none" }}>
                  <rect
                    width={tooltipW}
                    height={tooltipH}
                    rx={8}
                    fill="#0f172a"
                    opacity={0.96}
                    filter="drop-shadow(0 6px 12px rgba(0,0,0,0.25))"
                  />
                  <text x={10} y={18} fontSize={11} fontWeight={900} fill="#f8fafc">
                    📅 {dateLabel} ({dates[hoveredIdx]})
                  </text>
                  <circle cx={14} cy={35} r={4} fill="#3b82f6" />
                  <text x={24} y={38} fontSize={10.5} fontWeight={800} fill="#93c5fd">
                    Peso: <tspan fill="#ffffff" fontWeight={900}>{pVal !== null && pVal !== undefined ? `${pVal.toFixed(1)} kg` : "—"}</tspan>
                  </text>
                  <circle cx={14} cy={53} r={4} fill="#f59e0b" />
                  <text x={24} y={56} fontSize={10.5} fontWeight={800} fill="#fde68a">
                    ∑ 6 Pliegues: <tspan fill="#ffffff" fontWeight={900}>{plVal !== null && plVal !== undefined ? `${plVal.toFixed(1)} mm` : "—"}</tspan>
                  </text>
                </g>
              );
            })()
          )}
        </svg>
      </div>
    </div>
  );
}

/* ─── Bar Chart (for Structure B) ─── */
function BarChart({ datasets, metrics, title }: {
  datasets: { name: string; values: (number | null)[]; color: string }[];
  metrics: string[];
  title?: string;
}) {
  const W = 800;
  const H = 300;
  const PAD_L = 55;
  const PAD_R = 20;
  const PAD_T = 30;
  const PAD_B = 50;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  let allVals: number[] = [];
  datasets.forEach(d => d.values.forEach(v => { if (v !== null) allVals.push(v); }));
  if (allVals.length === 0) allVals = [0, 10];
  const yMax = Math.max(...allVals) * 1.15;
  const yMin = 0;

  const toY = (v: number) => PAD_T + chartH - ((v - yMin) / (yMax - yMin)) * chartH;
  const groupW = chartW / metrics.length;
  const barW = Math.min(groupW / (datasets.length + 1), 30);

  const yTicks: number[] = [];
  for (let i = 0; i <= 5; i++) yTicks.push(yMin + (yMax - yMin) * (i / 5));

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      {title && <h3 style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: 800, color: "#1e293b" }}>{title}</h3>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, height: "auto", background: "#fafbfc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={toY(t)} y2={toY(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={PAD_L - 6} y={toY(t) + 4} textAnchor="end" fontSize={10} fill="#94a3b8">{t.toFixed(1)}</text>
          </g>
        ))}
        {metrics.map((m, mi) => {
          const groupX = PAD_L + mi * groupW + groupW / 2;
          return (
            <g key={mi}>
              <text x={groupX} y={H - 10} textAnchor="middle" fontSize={9} fill="#64748b">{m}</text>
              {datasets.map((ds, di) => {
                const v = ds.values[mi];
                if (v === null) return null;
                const bx = groupX - (datasets.length * barW) / 2 + di * barW;
                const by = toY(v);
                const bh = toY(0) - by;
                return (
                  <g key={di}>
                    <rect x={bx} y={by} width={barW - 2} height={Math.max(bh, 1)} fill={ds.color} rx={2} opacity={0.8}>
                      <title>{ds.name}: {v.toFixed(2)}</title>
                    </rect>
                    <text x={bx + (barW - 2) / 2} y={by - 3} textAnchor="middle" fontSize={7} fill={ds.color} fontWeight={700}>{v.toFixed(2)}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 8 }}>
        {datasets.map((ds, i) => (
          <span key={i} style={{ fontSize: 10, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: ds.color }}></span>
            {ds.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Stats Card ─── */
function StatCard({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1px solid #e2e8f0", minWidth: 130, flex: "1 1 130px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>
        {value}{unit && <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  );
}

/* ─── Data Table ─── */
function DataTable({ dataset, isMetrics }: { dataset: TestDataSet; isMetrics?: boolean }) {
  const [selectedMetric, setSelectedMetric] = useState<string>("Suma");
  const [viewMode, setViewMode] = useState<"matrix" | "full_table" | "comparison">("matrix");

  const isTabularPliegues = dataset.structure === "D" && dataset.metricsList && dataset.metricsList.length > 0;
  const metricsList = dataset.metricsList || [];

  // Filter out date columns where no player has data
  const activeCols = dataset.dates
    .map((d, i) => ({ date: d, idx: i }))
    .filter(({ idx, date }) => {
      if (isTabularPliegues && selectedMetric !== "Suma") {
        return dataset.players.some((p) => p.metricsByDate?.[date]?.[selectedMetric] !== undefined && p.metricsByDate?.[date]?.[selectedMetric] !== null);
      }
      return dataset.players.some((p) => p.values[idx] !== null);
    });

  // Estado para el Comparador de Mediciones
  const [compBaseDate, setCompBaseDate] = useState<string>(dataset.dates[0] || "");
  const [compTargetDate, setCompTargetDate] = useState<string>(dataset.dates[dataset.dates.length - 1] || dataset.dates[0] || "");
  const [compSearch, setCompSearch] = useState<string>("");
  const [compSort, setCompSort] = useState<"diff_asc" | "diff_desc" | "name" | "val_target">("diff_asc");
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

  useEffect(() => {
    if (dataset.dates.length > 0) {
      if (!compBaseDate || !dataset.dates.includes(compBaseDate)) setCompBaseDate(dataset.dates[0]);
      if (!compTargetDate || !dataset.dates.includes(compTargetDate)) setCompTargetDate(dataset.dates[dataset.dates.length - 1] || dataset.dates[0]);
    }
  }, [dataset.dates]);

  if (!dataset.players.length || !dataset.dates.length) return null;
  if (activeCols.length === 0 && !isTabularPliegues) return null;

  // Cálculo de datos para el comparador de mediciones
  const comparisonList = dataset.players.map((p) => {
    const vBase = p.metricsByDate?.[compBaseDate]?.["Suma"] ?? (dataset.dates.indexOf(compBaseDate) >= 0 ? p.values[dataset.dates.indexOf(compBaseDate)] : null);
    const vTarget = p.metricsByDate?.[compTargetDate]?.["Suma"] ?? (dataset.dates.indexOf(compTargetDate) >= 0 ? p.values[dataset.dates.indexOf(compTargetDate)] : null);
    const diff = vBase !== null && vTarget !== null ? Number((vTarget - vBase).toFixed(1)) : null;
    const pct = diff !== null && vBase && vBase > 0 ? Number(((diff / vBase) * 100).toFixed(1)) : null;

    const skinfoldDiffs: Record<string, { base: number | null; target: number | null; diff: number | null }> = {};
    metricsList.filter((m) => m !== "Suma").forEach((m) => {
      const b = p.metricsByDate?.[compBaseDate]?.[m] ?? null;
      const t = p.metricsByDate?.[compTargetDate]?.[m] ?? null;
      const d = b !== null && t !== null ? Number((t - b).toFixed(1)) : null;
      skinfoldDiffs[m] = { base: b, target: t, diff: d };
    });

    return { name: p.name, vBase, vTarget, diff, pct, skinfoldDiffs };
  });

  const filteredComparisons = comparisonList
    .filter((c) => c.name.toLowerCase().includes(compSearch.toLowerCase().trim()))
    .sort((a, b) => {
      if (compSort === "diff_asc") {
        if (a.diff === null) return 1;
        if (b.diff === null) return -1;
        return a.diff - b.diff;
      }
      if (compSort === "diff_desc") {
        if (a.diff === null) return 1;
        if (b.diff === null) return -1;
        return b.diff - a.diff;
      }
      if (compSort === "val_target") {
        if (a.vTarget === null) return 1;
        if (b.vTarget === null) return -1;
        return a.vTarget - b.vTarget;
      }
      return a.name.localeCompare(b.name);
    });

  const validPairs = comparisonList.filter((c) => c.vBase !== null && c.vTarget !== null);
  const teamAvgBase = validPairs.length > 0 ? validPairs.reduce((acc, c) => acc + c.vBase!, 0) / validPairs.length : null;
  const teamAvgTarget = validPairs.length > 0 ? validPairs.reduce((acc, c) => acc + c.vTarget!, 0) / validPairs.length : null;
  const teamDiff = teamAvgBase !== null && teamAvgTarget !== null ? Number((teamAvgTarget - teamAvgBase).toFixed(1)) : null;
  const teamPct = teamDiff !== null && teamAvgBase ? Number(((teamDiff / teamAvgBase) * 100).toFixed(1)) : null;
  const improvedPlayers = validPairs.filter((c) => c.diff! < 0);
  const worsenedPlayers = validPairs.filter((c) => c.diff! > 0);
  const bestImprovement = [...improvedPlayers].sort((a, b) => a.diff! - b.diff!)[0];

  return (
    <div>
      {/* Selector de Pliegues / Métricas para Estructura D */}
      {isTabularPliegues && (
        <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", marginRight: "4px" }}>Vistas:</span>
          {metricsList.map((m) => {
            const isSel = selectedMetric === m && viewMode === "matrix";
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setSelectedMetric(m);
                  setViewMode("matrix");
                }}
                style={{
                  fontSize: "11px",
                  fontWeight: isSel ? 800 : 600,
                  color: isSel ? "#ffffff" : "#1e3a8a",
                  background: isSel ? "#1e3a8a" : "#eff6ff",
                  border: isSel ? "none" : "1px solid #bfdbfe",
                  padding: "5px 10px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {m === "Suma" ? "🌟 Suma 6 Pliegues" : m}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setViewMode("full_table")}
            style={{
              fontSize: "11px",
              fontWeight: viewMode === "full_table" ? 800 : 600,
              color: viewMode === "full_table" ? "#ffffff" : "#047857",
              background: viewMode === "full_table" ? "#059669" : "#ecfdf5",
              border: viewMode === "full_table" ? "none" : "1px solid #a7f3d0",
              padding: "5px 12px",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            📑 Vista Tabla Completa
          </button>
          <button
            type="button"
            onClick={() => setViewMode("comparison")}
            style={{
              fontSize: "11.5px",
              fontWeight: viewMode === "comparison" ? 800 : 700,
              color: viewMode === "comparison" ? "#ffffff" : "#6b21a8",
              background: viewMode === "comparison" ? "#7c3aed" : "#faf5ff",
              border: viewMode === "comparison" ? "none" : "1.5px solid #d8b4fe",
              padding: "5px 14px",
              borderRadius: "6px",
              cursor: "pointer",
              marginLeft: "auto",
              boxShadow: viewMode === "comparison" ? "0 2px 8px rgba(124,58,237,0.3)" : "none",
            }}
          >
            ⚖️ Comparador de Mediciones
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* VISTA COMPARADOR VISUAL ENTRE MEDICIONES                   */}
      {/* ══════════════════════════════════════════════════════════ */}
      {isTabularPliegues && viewMode === "comparison" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Barra de configuración del comparador */}
          <div style={{ background: "#f8fafc", padding: "14px 18px", borderRadius: 10, border: "1px solid #cbd5e1", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 800, color: "#475569", display: "block", marginBottom: 2 }}>📍 Medición Base (Inicial)</label>
                <select
                  value={compBaseDate}
                  onChange={(e) => setCompBaseDate(e.target.value)}
                  style={{ fontSize: 11.5, fontWeight: 700, padding: "6px 10px", borderRadius: 6, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a" }}
                >
                  {dataset.dates.map((d, i) => (
                    <option key={d} value={d}>
                      {formatPlieguesMedicionLabel(d, i)}
                    </option>
                  ))}
                </select>
              </div>

              <span style={{ fontSize: 16, fontWeight: 900, color: "#94a3b8", marginTop: 14 }}>➔</span>

              <div>
                <label style={{ fontSize: 10.5, fontWeight: 800, color: "#6b21a8", display: "block", marginBottom: 2 }}>🎯 Medición Comparada</label>
                <select
                  value={compTargetDate}
                  onChange={(e) => setCompTargetDate(e.target.value)}
                  style={{ fontSize: 11.5, fontWeight: 700, padding: "6px 10px", borderRadius: 6, border: "1.5px solid #a855f7", background: "#faf5ff", color: "#6b21a8" }}
                >
                  {dataset.dates.map((d, i) => (
                    <option key={d} value={d}>
                      {formatPlieguesMedicionLabel(d, i)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                value={compSearch}
                onChange={(e) => setCompSearch(e.target.value)}
                placeholder="🔍 Buscar deportista..."
                style={{ fontSize: 11.5, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", width: 170 }}
              />
              <select
                value={compSort}
                onChange={(e) => setCompSort(e.target.value as any)}
                style={{ fontSize: 11.5, fontWeight: 700, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", color: "#334155" }}
              >
                <option value="diff_asc">Mayor Reducción (- mm)</option>
                <option value="diff_desc">Mayor Aumento (+ mm)</option>
                <option value="val_target">Suma Actual (Menor a Mayor)</option>
                <option value="name">Alfabético</option>
              </select>
            </div>
          </div>

          {/* Tarjetas KPI de Resumen del Equipo */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Media Equipo Base</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#1e293b", marginTop: 2 }}>{teamAvgBase !== null ? `${teamAvgBase.toFixed(1)} mm` : "—"}</div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>{formatPlieguesMedicionLabel(compBaseDate, dataset.dates.indexOf(compBaseDate))}</div>
            </div>

            <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Media Equipo Actual</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#1e293b", marginTop: 2 }}>{teamAvgTarget !== null ? `${teamAvgTarget.toFixed(1)} mm` : "—"}</div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>{formatPlieguesMedicionLabel(compTargetDate, dataset.dates.indexOf(compTargetDate))}</div>
            </div>

            <div style={{ background: teamDiff !== null && teamDiff < 0 ? "#f0fdf4" : teamDiff !== null && teamDiff > 0 ? "#fef2f2" : "#ffffff", padding: "12px 14px", borderRadius: 10, border: `1px solid ${teamDiff !== null && teamDiff < 0 ? "#bbf7d0" : teamDiff !== null && teamDiff > 0 ? "#fecaca" : "#e2e8f0"}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: teamDiff !== null && teamDiff < 0 ? "#166534" : teamDiff !== null && teamDiff > 0 ? "#991b1b" : "#64748b", textTransform: "uppercase" }}>Variación Global</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: teamDiff !== null && teamDiff < 0 ? "#15803d" : teamDiff !== null && teamDiff > 0 ? "#dc2626" : "#0f172a", marginTop: 2 }}>
                {teamDiff !== null ? `${teamDiff > 0 ? "+" : ""}${teamDiff.toFixed(1)} mm (${teamPct !== null ? `${teamPct > 0 ? "+" : ""}${teamPct.toFixed(1)}%` : ""})` : "—"}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: teamDiff !== null && teamDiff < 0 ? "#16a34a" : "#dc2626" }}>
                {improvedPlayers.length} mejoran • {worsenedPlayers.length} aumentan
              </div>
            </div>

            <div style={{ background: "#faf5ff", padding: "12px 14px", borderRadius: 10, border: "1px solid #e9d5ff" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#6b21a8", textTransform: "uppercase" }}>Mayor Reducción</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#581c87", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {bestImprovement ? `${bestImprovement.name} (${bestImprovement.diff} mm)` : "—"}
              </div>
              <div style={{ fontSize: 10, color: "#7e22ce" }}>Progreso destacado del grupo</div>
            </div>
          </div>

          {/* Tabla Comparativa Detallada */}
          <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #cbd5e1" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead>
                <tr style={{ background: "#0f172a", color: "#fff" }}>
                  <th style={{ padding: "8px 10px", textAlign: "center", width: 40 }}>#</th>
                  <th style={{ padding: "8px 14px", textAlign: "left", minWidth: 160 }}>Deportista</th>
                  <th style={{ padding: "8px 10px", textAlign: "center", width: 110 }}>{formatPlieguesMedicionLabel(compBaseDate, dataset.dates.indexOf(compBaseDate))}</th>
                  <th style={{ padding: "8px 10px", textAlign: "center", width: 110 }}>{formatPlieguesMedicionLabel(compTargetDate, dataset.dates.indexOf(compTargetDate))}</th>
                  <th style={{ padding: "8px 12px", textAlign: "center", width: 110 }}>Diferencia (Δ)</th>
                  <th style={{ padding: "8px 10px", textAlign: "center", width: 90 }}>Cambio %</th>
                  <th style={{ padding: "8px 14px", textAlign: "left", minWidth: 180 }}>Evolución Visual</th>
                  <th style={{ padding: "8px 8px", textAlign: "center", width: 80 }}>Desglose</th>
                </tr>
              </thead>
              <tbody>
                {filteredComparisons.map((c, ci) => {
                  const isExp = expandedPlayer === c.name;
                  const isGood = c.diff !== null && c.diff < 0;
                  const isBad = c.diff !== null && c.diff > 0;

                  return (
                    <React.Fragment key={c.name}>
                      <tr style={{ background: ci % 2 === 0 ? "#ffffff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "6px 8px", textAlign: "center", color: "#94a3b8", fontWeight: 700 }}>{ci + 1}</td>
                        <td style={{ padding: "6px 14px", fontWeight: 800, color: "#0f172a" }}>{c.name}</td>
                        <td style={{ padding: "6px 10px", textAlign: "center", color: "#475569", fontWeight: 600 }}>{c.vBase !== null ? `${c.vBase.toFixed(1)} mm` : "—"}</td>
                        <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 800, color: "#1e3a8a" }}>{c.vTarget !== null ? `${c.vTarget.toFixed(1)} mm` : "—"}</td>
                        <td style={{ padding: "6px 12px", textAlign: "center" }}>
                          {c.diff !== null ? (
                            <span style={{ fontSize: 11, fontWeight: 900, padding: "3px 8px", borderRadius: 4, background: isGood ? "#dcfce7" : isBad ? "#fee2e2" : "#f1f5f9", color: isGood ? "#15803d" : isBad ? "#b91c1c" : "#475569" }}>
                              {c.diff > 0 ? `+${c.diff.toFixed(1)}` : c.diff.toFixed(1)} mm
                            </span>
                          ) : (
                            <span style={{ color: "#cbd5e1" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 800, color: isGood ? "#16a34a" : isBad ? "#dc2626" : "#64748b" }}>
                          {c.pct !== null ? `${c.pct > 0 ? "+" : ""}${c.pct.toFixed(1)}%` : "—"}
                        </td>
                        <td style={{ padding: "6px 14px" }}>
                          {c.diff !== null && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ flex: 1, background: "#e2e8f0", height: 7, borderRadius: 4, overflow: "hidden", position: "relative" }}>
                                <div
                                  style={{
                                    height: "100%",
                                    width: `${Math.min(100, Math.abs(c.pct || 0) * 4)}%`,
                                    background: isGood ? "#16a34a" : "#dc2626",
                                    borderRadius: 4,
                                    marginLeft: isGood ? 0 : "auto",
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: 10, fontWeight: 700, color: isGood ? "#16a34a" : "#dc2626" }}>
                                {isGood ? "📉 Reducción" : isBad ? "📈 Aumento" : "—"}
                              </span>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => setExpandedPlayer(isExp ? null : c.name)}
                            style={{ fontSize: 10.5, fontWeight: 700, color: "#6366f1", background: "#eef2ff", border: "1px solid #c7d2fe", padding: "3px 8px", borderRadius: 4, cursor: "pointer" }}
                          >
                            {isExp ? "Ocultar ▲" : "Ver 6 ▼"}
                          </button>
                        </td>
                      </tr>

                      {/* Desglose desplegable de los 6 pliegues individuales */}
                      {isExp && (
                        <tr style={{ background: "#f8fafc", borderBottom: "1.5px solid #cbd5e1" }}>
                          <td colSpan={8} style={{ padding: "10px 18px" }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: "#1e3a8a", marginBottom: 6 }}>
                              📐 Desglose individual de los 6 pliegues para {c.name}:
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                              {metricsList.filter((m) => m !== "Suma").map((m) => {
                                const info = c.skinfoldDiffs[m];
                                const pGood = info && info.diff !== null && info.diff < 0;
                                const pBad = info && info.diff !== null && info.diff > 0;
                                return (
                                  <div key={m} style={{ background: "#ffffff", padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569" }}>{m}</div>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                                      <span style={{ fontSize: 11, fontWeight: 800, color: "#0f172a" }}>
                                        {info?.target !== null ? `${info?.target} mm` : "—"}
                                      </span>
                                      {info?.diff !== null && (
                                        <span style={{ fontSize: 10, fontWeight: 800, color: pGood ? "#15803d" : pBad ? "#b91c1c" : "#64748b" }}>
                                          {info.diff > 0 ? `+${info.diff}` : info.diff} mm
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* VISTA TABLA COMPLETA CON TODAS LAS COLUMNAS               */}
      {/* ══════════════════════════════════════════════════════════ */}
      {isTabularPliegues && viewMode === "full_table" && dataset.tabularRows && (
        <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: "#0f172a", color: "#fff" }}>
                <th style={{ padding: "8px 10px", textAlign: "center" }}>Medición</th>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>Jugador</th>
                {metricsList.filter((m) => m !== "Suma").map((m) => (
                  <th key={m} style={{ padding: "8px 8px", textAlign: "center" }}>{m} (mm)</th>
                ))}
                <th style={{ padding: "8px 10px", textAlign: "center", background: "#1e3a8a", fontWeight: 900 }}>Suma (mm)</th>
              </tr>
            </thead>
            <tbody>
              {dataset.tabularRows.map((row, rIdx) => (
                <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 800, color: "#1e3a8a", background: "#f1f5f9" }}>
                    {formatPlieguesMedicionLabel(row.fecha, rIdx)}
                  </td>
                  <td style={{ padding: "6px 12px", fontWeight: 800, color: "#0f172a" }}>{row.jugador}</td>
                  {metricsList.filter((m) => m !== "Suma").map((m) => {
                    const val = row.metrics?.[m];
                    return (
                      <td key={m} style={{ padding: "6px 8px", textAlign: "center", color: val !== null && val !== undefined ? "#334155" : "#cbd5e1" }}>
                        {val !== null && val !== undefined ? Number(val).toFixed(1) : "—"}
                      </td>
                    );
                  })}
                  <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 900, color: "#1e3a8a", background: "#eff6ff" }}>
                    {row.suma !== null && row.suma !== undefined ? Number(row.suma).toFixed(1) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* VISTA MATRIZ POR FECHAS (ESTÁNDAR O POR PLIEGUE)          */}
      {/* ══════════════════════════════════════════════════════════ */}
      {(!isTabularPliegues || viewMode === "matrix") && (
        <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: "#1e3a8a", color: "#fff" }}>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 800, fontSize: 11, position: "sticky", left: 0, background: "#1e3a8a", zIndex: 2 }}>Jugador</th>
                {activeCols.map(({ date, idx }) => (
                  <th key={idx} style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>
                    {isTabularPliegues
                      ? formatPlieguesMedicionLabel(date, idx)
                      : isMetrics ? date : formatDateShort(date)}
                  </th>
                ))}
                <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 800, fontSize: 10, background: "#0f172a" }}>Promedio</th>
                {!isMetrics && <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 800, fontSize: 10, background: "#0f172a" }}>Δ Último</th>}
              </tr>
            </thead>
            <tbody>
              {dataset.players.map((p, pi) => {
                const vals = activeCols.map(({ idx, date }) => {
                  if (isTabularPliegues && selectedMetric !== "Suma") {
                    return p.metricsByDate?.[date]?.[selectedMetric] ?? null;
                  }
                  return p.values[idx];
                }).filter((v): v is number => v !== null);

                const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
                const lastTwo = vals.slice(-2);
                const delta = lastTwo.length === 2 ? lastTwo[1] - lastTwo[0] : null;
                return (
                  <tr key={pi} style={{ background: pi % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "6px 12px", fontWeight: 700, color: "#0f172a", position: "sticky", left: 0, background: pi % 2 === 0 ? "#fff" : "#f8fafc", zIndex: 1, whiteSpace: "nowrap" }}>{p.name}</td>
                    {activeCols.map(({ idx, date }) => {
                      let v: number | null = p.values[idx];
                      if (isTabularPliegues && selectedMetric !== "Suma") {
                        v = p.metricsByDate?.[date]?.[selectedMetric] ?? null;
                      }
                      return (
                        <td key={idx} style={{ padding: "6px 10px", textAlign: "center", color: v !== null ? "#334155" : "#cbd5e1" }}>
                          {v !== null ? v.toFixed(1) : "—"}
                        </td>
                      );
                    })}
                    <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 800, color: "#1e3a8a" }}>{avg !== null ? avg.toFixed(1) : "—"}</td>
                    {!isMetrics && (
                      <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 800, color: delta === null ? "#94a3b8" : delta > 0 ? "#dc2626" : delta < 0 ? "#16a34a" : "#64748b" }}>
                        {delta !== null ? (delta > 0 ? "+" : "") + delta.toFixed(1) : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr style={{ background: "#f1f5f9", borderTop: "2px solid #1e3a8a" }}>
                <td style={{ padding: "8px 12px", fontWeight: 900, color: "#0f172a", position: "sticky", left: 0, background: "#f1f5f9", zIndex: 1 }}>PROMEDIO EQUIPO</td>
                {activeCols.map(({ idx, date }) => {
                  const vals = dataset.players.map((p) => {
                    if (isTabularPliegues && selectedMetric !== "Suma") {
                      return p.metricsByDate?.[date]?.[selectedMetric] ?? null;
                    }
                    return p.values[idx];
                  }).filter((v): v is number => v !== null);
                  const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
                  return <td key={idx} style={{ padding: "6px 10px", textAlign: "center", fontWeight: 800, color: "#1e3a8a" }}>{avg !== null ? avg.toFixed(1) : "—"}</td>;
                })}
                <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 900, color: "#0f172a" }}>
                  {(() => {
                    const a = dataset.players.flatMap((p) =>
                      activeCols.map(({ idx, date }) => {
                        if (isTabularPliegues && selectedMetric !== "Suma") {
                          return p.metricsByDate?.[date]?.[selectedMetric] ?? null;
                        }
                        return p.values[idx];
                      })
                    ).filter((v): v is number => v !== null);
                    return a.length > 0 ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : "—";
                  })()}
                </td>
                {!isMetrics && <td></td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Resolver Dataset con Grupos de Fechas para Gráficos y Reportes ─── */
function resolveDatasetForReporting(dataset: TestDataSet): TestDataSet {
  if (!dataset.dateGroups || dataset.dateGroups.length === 0) return dataset;

  const groups = dataset.dateGroups;
  const originalDates = dataset.dates;

  // Build resolved dates list preserving order of first appearance
  const resolvedDates: string[] = [];
  const handledGroups = new Set<string>();

  originalDates.forEach((d) => {
    const grp = groups.find((g) => g.dates?.includes(d));
    if (grp) {
      if (!handledGroups.has(grp.id)) {
        handledGroups.add(grp.id);
        resolvedDates.push(grp.name);
      }
    } else {
      resolvedDates.push(d);
    }
  });

  const resolvedPlayers = dataset.players.map((p) => {
    const resolvedValues: (number | null)[] = [];
    const handledPlayerGroups = new Set<string>();

    originalDates.forEach((d, di) => {
      const grp = groups.find((g) => g.dates?.includes(d));
      if (grp) {
        if (!handledPlayerGroups.has(grp.id)) {
          handledPlayerGroups.add(grp.id);
          const grpIndices = grp.dates
            .map((gd) => originalDates.indexOf(gd))
            .filter((i) => i >= 0);
          const vals = grpIndices
            .map((i) => p.values[i])
            .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));

          if (vals.length === 0) {
            resolvedValues.push(null);
          } else if (vals.length === 1) {
            resolvedValues.push(vals[0]);
          } else {
            const strategy = grp.strategy || "latest";
            if (strategy === "average") {
              resolvedValues.push(Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)));
            } else if (strategy === "max") {
              resolvedValues.push(Math.max(...vals));
            } else if (strategy === "min") {
              resolvedValues.push(Math.min(...vals));
            } else {
              resolvedValues.push(vals[vals.length - 1]); // latest
            }
          }
        }
      } else {
        resolvedValues.push(p.values[di]);
      }
    });

    return { ...p, values: resolvedValues };
  });

  return {
    ...dataset,
    dates: resolvedDates,
    players: resolvedPlayers,
  };
}

/* ─── Modal para Agrupar / Fusionar Fechas de un mismo Test ─── */
function GroupDatesModal({
  isOpen,
  onClose,
  dates,
  players,
  isTabularPliegues,
  tabularRows,
  existingGroups = [],
  onMergePermanent,
  onSaveGroup,
  onDeleteGroup,
}: {
  isOpen: boolean;
  onClose: () => void;
  dates: string[];
  players: { name: string; values: (number | null)[] }[];
  isTabularPliegues: boolean;
  tabularRows?: TabularRowItem[];
  existingGroups?: DateGroup[];
  onMergePermanent: (selectedDates: string[], groupName: string, strategy: "latest" | "average" | "max" | "min") => void;
  onSaveGroup: (group: DateGroup) => void;
  onDeleteGroup: (groupId: string) => void;
}) {
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [groupName, setGroupName] = useState<string>("");
  const [strategy, setStrategy] = useState<"latest" | "average" | "max" | "min">("latest");

  useEffect(() => {
    if (isOpen) {
      setSelectedDates([]);
      setGroupName("");
      setStrategy("latest");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Compute player counts per date
  const dateCounts: Record<string, number> = {};
  if (isTabularPliegues && tabularRows) {
    dates.forEach((d) => {
      const pSet = new Set(
        tabularRows.filter((r) => (r.fecha === d || formatPlieguesMedicionLabel(r.fecha, 0) === d) && r.suma !== null).map((r) => r.jugador)
      );
      dateCounts[d] = pSet.size;
    });
  } else {
    dates.forEach((d, di) => {
      dateCounts[d] = players.filter((p) => p.values[di] !== null && p.values[di] !== undefined).length;
    });
  }

  const toggleDate = (d: string) => {
    setSelectedDates((prev) => {
      const next = prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d];
      if (next.length >= 2 && !groupName) {
        setGroupName(`Medición (${next.map((x) => formatDateShort(x) || x).join(", ")})`);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedDates([...dates]);
    if (!groupName) {
      setGroupName(`Medición General (${dates.length} días)`);
    }
  };

  const deselectAll = () => {
    setSelectedDates([]);
  };

  const handlePermanentMerge = () => {
    if (selectedDates.length < 2) {
      alert("Por favor, selecciona al menos 2 fechas para agrupar.");
      return;
    }
    const finalName = groupName.trim() || `Medición (${selectedDates.map(d => formatDateShort(d) || d).join(", ")})`;
    onMergePermanent(selectedDates, finalName, strategy);
    onClose();
  };

  const handleCreateVirtualGroup = () => {
    if (selectedDates.length < 2) {
      alert("Por favor, selecciona al menos 2 fechas para agrupar.");
      return;
    }
    const finalName = groupName.trim() || `Medición (${selectedDates.map(d => formatDateShort(d) || d).join(", ")})`;
    const newGroup: DateGroup = {
      id: `grp_${Date.now()}`,
      name: finalName,
      dates: selectedDates,
      strategy,
    };
    onSaveGroup(newGroup);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(5px)",
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 16,
          border: "1px solid #cbd5e1",
          boxShadow: "0 25px 45px -10px rgba(0, 0, 0, 0.35)",
          maxWidth: 620,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "24px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 22 }}>🔗</span>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#0f172a" }}>
                Agrupar Mediciones Multidía de un Mismo Test
              </h2>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
              Une las mediciones realizadas a lo largo de varios días en una sola medición unificada para el equipo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#f1f5f9",
              border: "none",
              borderRadius: "50%",
              width: 28,
              height: 28,
              cursor: "pointer",
              fontSize: 14,
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Tip Informativo */}
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 11.5, color: "#1e3a8a", lineHeight: 1.45 }}>
          💡 <strong>¿Cuándo usarlo?</strong> Si evaluaste a los defensas el lunes, mediocentros el martes y delanteros el miércoles para el mismo test, selecciona esos 3 días para unificarlos en una sola medición (ej. <em>"Medición 1"</em>) y que todos los deportistas salgan juntos en el ranking y gráficos.
        </div>

        {/* Grupos Existentes si hay */}
        {existingGroups.length > 0 && (
          <div style={{ marginBottom: 16, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", padding: "12px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#334155", marginBottom: 8, textTransform: "uppercase" }}>
              📋 Grupos Virtuales Activos ({existingGroups.length}):
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {existingGroups.map((g) => (
                <div
                  key={g.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: 6,
                    padding: "6px 10px",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 12, color: "#1e3a8a" }}>{g.name}</strong>
                    <span style={{ fontSize: 10.5, color: "#64748b", marginLeft: 8 }}>
                      ({g.dates.map((d) => formatDateShort(d) || d).join(", ")})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteGroup(g.id)}
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: "#dc2626",
                      background: "#fee2e2",
                      border: "none",
                      padding: "3px 8px",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    Desagrupar ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Paso 1: Selección de fechas */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>
              1. Selecciona las fechas a agrupar ({selectedDates.length} seleccionadas):
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={selectAll}
                style={{ fontSize: 10.5, fontWeight: 700, color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Marcar todas
              </button>
              <button
                type="button"
                onClick={deselectAll}
                style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Desmarcar
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8, maxHeight: 180, overflowY: "auto", padding: 4, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
            {dates.map((d) => {
              const isSelected = selectedDates.includes(d);
              const count = dateCounts[d] ?? 0;
              const formatted = formatDateShort(d);

              return (
                <div
                  key={d}
                  onClick={() => toggleDate(d)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: isSelected ? "#eff6ff" : "#ffffff",
                    border: `1.5px solid ${isSelected ? "#3b82f6" : "#e2e8f0"}`,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    style={{ cursor: "pointer", width: 15, height: 15, accentColor: "#2563eb" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: isSelected ? "#1e3a8a" : "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {formatted || d}
                    </div>
                    <div style={{ fontSize: 9.5, color: count > 0 ? "#16a34a" : "#94a3b8", fontWeight: 700 }}>
                      👥 {count} deportistas
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Paso 2: Nombre de la Medición Unificada */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", display: "block", marginBottom: 6 }}>
            2. Nombre para la medición unificada:
          </label>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Ej: Medición 1 (Agosto), Test Pretemporada..."
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 12.5,
              fontWeight: 700,
              borderRadius: 8,
              border: "1.5px solid #cbd5e1",
              background: "#ffffff",
              color: "#0f172a",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {/* Sugerencias Rápidas */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <span style={{ fontSize: 10.5, color: "#64748b", fontWeight: 700, alignSelf: "center" }}>Sugerencias:</span>
            {["Medición 1", "Medición 2", "Medición 3", "Test Pretemporada", "Test Noviembre", "Test Inicio"].map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => setGroupName(sug)}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#3b82f6",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: 12,
                  padding: "2px 8px",
                  cursor: "pointer",
                }}
              >
                {sug}
              </button>
            ))}
          </div>
        </div>

        {/* Paso 3: Resolución de duplicados */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", display: "block", marginBottom: 6 }}>
            3. Si un deportista tiene datos en varios de los días seleccionados:
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { id: "latest", label: "🔹 Último valor", desc: "El más reciente (Recomendado)" },
              { id: "average", label: "🔹 Promedio", desc: "Media de los días evaluados" },
              { id: "max", label: "🔹 Mejor marca (Máx)", desc: "El valor más alto" },
              { id: "min", label: "🔹 Mejor marca (Mín)", desc: "El valor más bajo (para tiempos)" },
            ].map((opt) => (
              <div
                key={opt.id}
                onClick={() => setStrategy(opt.id as any)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: strategy === opt.id ? "#f0fdf4" : "#ffffff",
                  border: `1.5px solid ${strategy === opt.id ? "#22c55e" : "#e2e8f0"}`,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 800, color: strategy === opt.id ? "#15803d" : "#334155" }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 9.5, color: "#64748b" }}>{opt.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Botones de Acción */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #f1f5f9", paddingTop: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#64748b",
              background: "#f1f5f9",
              border: "none",
              padding: "8px 16px",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCreateVirtualGroup}
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "#1e3a8a",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              padding: "8px 16px",
              borderRadius: 8,
              cursor: "pointer",
            }}
            title="Mantiene las columnas originales y las agrupa para reportes y gráficos"
          >
            🏷️ Guardar como Grupo
          </button>
          <button
            type="button"
            onClick={handlePermanentMerge}
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "#ffffff",
              background: "linear-gradient(135deg, #1e3a8a, #3b82f6)",
              border: "none",
              padding: "8px 18px",
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(30,58,138,0.3)",
            }}
            title="Consolida las columnas seleccionadas en una sola dentro de la tabla"
          >
            🔗 Fusionar en 1 Columna
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Editable Table Component for Cocina ─── */
function EditableDataTable({
  dataset,
  testType,
  jugadores,
  onSave,
  onDelete,
}: {
  dataset: TestDataSet;
  testType?: TestType;
  jugadores: Jugador[];
  onSave: (updated: TestDataSet, oldName?: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(dataset.name);
  const [dates, setDates] = useState<string[]>(dataset.dates);
  const [players, setPlayers] = useState<{ name: string; values: (number | null)[] }[]>(dataset.players);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [selectedPlayerToAdd, setSelectedPlayerToAdd] = useState("");
  const [customPlayerToAdd, setCustomPlayerToAdd] = useState("");
  const [dateGroups, setDateGroups] = useState<DateGroup[]>(dataset.dateGroups || []);
  const [showGroupModal, setShowGroupModal] = useState<boolean>(false);

  // Estado para Estructura D (Tabular de 6 Pliegues)
  const isTabularPliegues = dataset.structure === "D";
  const metricsList = dataset.metricsList && dataset.metricsList.length > 0
    ? dataset.metricsList
    : ["Suma", "Tricipital", "Suprailíaco", "Subescapular", "Abdominal", "Cuádriceps", "Gemelo"];
  const skinfoldFields = metricsList.filter((m) => m !== "Suma");

  const [tabularRows, setTabularRows] = useState<TabularRowItem[]>(() => {
    if (dataset.tabularRows && dataset.tabularRows.length > 0) return dataset.tabularRows;
    // Fallback: construir tabularRows desde players y dates
    const built: TabularRowItem[] = [];
    dataset.players.forEach((p) => {
      dataset.dates.forEach((d, di) => {
        const val = p.values[di];
        if (val !== null && val !== undefined) {
          const metrics = p.metricsByDate?.[d] || {};
          built.push({
            fecha: d,
            jugador: p.name,
            metrics,
            suma: val,
          });
        }
      });
    });
    return built;
  });

  // Estado de vista de Cocina (Toma de Campo vs Hoja de Cálculo)
  const [cocinaMode, setCocinaMode] = useState<"field" | "table">("field");
  const [fieldMedicion, setFieldMedicion] = useState<string>("Medición 1 (Agosto)");
  const [fieldSearch, setFieldSearch] = useState<string>("");
  const [isCreatingNewMedicion, setIsCreatingNewMedicion] = useState<boolean>(false);
  const [newMedicionName, setNewMedicionName] = useState<string>("");

  // Estado para inserción manual rápida
  const [newTabFecha, setNewTabFecha] = useState<string>("Medición 1 (Agosto)");
  const [newTabJugador, setNewTabJugador] = useState<string>("");
  const [newTabCustomJugador, setNewTabCustomJugador] = useState<string>("");
  const [newTabMetrics, setNewTabMetrics] = useState<Record<string, string>>({
    Tricipital: "",
    Suprailíaco: "",
    Subescapular: "",
    Abdominal: "",
    Cuádriceps: "",
    Gemelo: "",
  });

  // Lista de mediciones existentes
  const availableMediciones = Array.from(
    new Set([
      "Medición 1 (Agosto)",
      ...dates.map((d, i) => formatPlieguesMedicionLabel(d, i)),
      ...tabularRows.map((r, i) => formatPlieguesMedicionLabel(r.fecha, i)),
    ])
  );

  // Helper para obtener o actualizar los pliegues de un jugador en la medición activa de campo
  const getFieldRowForPlayer = (playerName: string) => {
    return tabularRows.find(
      (r) =>
        r.jugador.toLowerCase() === playerName.toLowerCase() &&
        formatPlieguesMedicionLabel(r.fecha, 0).toLowerCase() === fieldMedicion.toLowerCase()
    );
  };

  const handleFieldSkinfoldChange = (playerName: string, metricName: string, valStr: string) => {
    const trimmed = valStr.trim().replace(",", ".");
    const num = trimmed === "" ? null : parseFloat(trimmed);
    const finalVal = num !== null && isNaN(num) ? null : num;

    setTabularRows((prev) => {
      const copy = [...prev];
      const existingIdx = copy.findIndex(
        (r) =>
          r.jugador.toLowerCase() === playerName.toLowerCase() &&
          formatPlieguesMedicionLabel(r.fecha, 0).toLowerCase() === fieldMedicion.toLowerCase()
      );

      if (existingIdx >= 0) {
        const row = { ...copy[existingIdx], metrics: { ...copy[existingIdx].metrics, [metricName]: finalVal } };
        let sum = 0;
        let hasAny = false;
        skinfoldFields.forEach((m) => {
          const v = m === metricName ? finalVal : row.metrics[m];
          if (v !== null && v !== undefined) {
            sum += v;
            hasAny = true;
          }
        });
        row.suma = hasAny ? Number(sum.toFixed(1)) : null;
        row.metrics["Suma"] = row.suma;
        copy[existingIdx] = row;
      } else {
        const rowMetrics: Record<string, number | null> = { [metricName]: finalVal };
        const newRow: TabularRowItem = {
          fecha: fieldMedicion,
          jugador: playerName,
          metrics: rowMetrics,
          suma: finalVal,
        };
        copy.push(newRow);
      }
      return copy;
    });
    setHasChanges(true);
  };

  const activePlayersList = jugadores.length > 0
    ? jugadores
    : Array.from(new Set(tabularRows.map((r) => r.jugador))).map((name, i) => ({ id: `p_${i}`, nombre: name, posicion: "Jugador", dorsal: i + 1 } as any));

  const filteredFieldPlayers = activePlayersList.filter((j: Jugador) =>
    j.nombre.toLowerCase().includes(fieldSearch.toLowerCase().trim())
  );

  const completedFieldCount = activePlayersList.filter((j: Jugador) => {
    const row = getFieldRowForPlayer(j.nombre);
    if (!row) return false;
    const filledCount = skinfoldFields.filter((m) => row.metrics[m] !== null && row.metrics[m] !== undefined).length;
    return filledCount === skinfoldFields.length;
  }).length;

  useEffect(() => {
    setName(dataset.name);
    setDates(dataset.dates);
    setPlayers(dataset.players);
    setDateGroups(dataset.dateGroups || []);
    if (dataset.tabularRows) {
      setTabularRows(dataset.tabularRows);
    }
    setHasChanges(false);
    setSaveMsg("");
  }, [dataset]);

  // Manejador de Fusión Permanente de Fechas
  const handleMergePermanent = (selectedDates: string[], gName: string, strategy: "latest" | "average" | "max" | "min") => {
    if (isTabularPliegues) {
      const selectedSet = new Set(selectedDates);
      setTabularRows((prev) => {
        const otherRows = prev.filter((r) => !selectedSet.has(r.fecha) && !selectedSet.has(formatPlieguesMedicionLabel(r.fecha, 0)));
        const targetRows = prev.filter((r) => selectedSet.has(r.fecha) || selectedSet.has(formatPlieguesMedicionLabel(r.fecha, 0)));

        const byPlayer = new Map<string, TabularRowItem[]>();
        targetRows.forEach((r) => {
          const list = byPlayer.get(r.jugador) || [];
          list.push(r);
          byPlayer.set(r.jugador, list);
        });

        const consolidatedRows: TabularRowItem[] = [];
        byPlayer.forEach((pRows, pName) => {
          if (pRows.length === 1) {
            consolidatedRows.push({ ...pRows[0], fecha: gName });
          } else {
            const mergedMetrics: Record<string, number | null> = {};
            let sum = 0;
            let hasAny = false;

            skinfoldFields.forEach((m) => {
              const vals = pRows.map((r) => r.metrics[m]).filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
              if (vals.length === 0) {
                mergedMetrics[m] = null;
              } else if (vals.length === 1) {
                mergedMetrics[m] = vals[0];
                sum += vals[0];
                hasAny = true;
              } else {
                let val = vals[vals.length - 1];
                if (strategy === "average") val = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
                else if (strategy === "max") val = Math.max(...vals);
                else if (strategy === "min") val = Math.min(...vals);
                mergedMetrics[m] = val;
                sum += val;
                hasAny = true;
              }
            });

            const finalSuma = hasAny ? Number(sum.toFixed(1)) : null;
            mergedMetrics["Suma"] = finalSuma;

            consolidatedRows.push({
              fecha: gName,
              jugador: pName,
              metrics: mergedMetrics,
              suma: finalSuma,
            });
          }
        });

        return [...otherRows, ...consolidatedRows];
      });

      // Update dates list for tabular
      setDates((prev) => {
        const remaining = prev.filter((d) => !selectedSet.has(d));
        return [gName, ...remaining];
      });
      setHasChanges(true);
      setSaveMsg(`✓ Pliegues de ${selectedDates.length} fechas fusionados en "${gName}"`);
      setTimeout(() => setSaveMsg(""), 3500);
    } else {
      const indices = selectedDates.map((d) => dates.indexOf(d)).filter((i) => i >= 0).sort((a, b) => a - b);
      if (indices.length < 2) return;

      const firstIdx = indices[0];
      const newDates: string[] = [];
      dates.forEach((d, di) => {
        if (di === firstIdx) {
          newDates.push(gName);
        } else if (!indices.includes(di)) {
          newDates.push(d);
        }
      });

      const newPlayers = players.map((p) => {
        const vals = indices.map((i) => p.values[i]).filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
        let mergedVal: number | null = null;
        if (vals.length === 1) {
          mergedVal = vals[0];
        } else if (vals.length > 1) {
          if (strategy === "latest") {
            for (let k = indices.length - 1; k >= 0; k--) {
              const v = p.values[indices[k]];
              if (v !== null && v !== undefined && !isNaN(v)) {
                mergedVal = v;
                break;
              }
            }
          } else if (strategy === "average") {
            mergedVal = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
          } else if (strategy === "max") {
            mergedVal = Math.max(...vals);
          } else if (strategy === "min") {
            mergedVal = Math.min(...vals);
          }
        }

        const nextValues: (number | null)[] = [];
        dates.forEach((_, di) => {
          if (di === firstIdx) {
            nextValues.push(mergedVal);
          } else if (!indices.includes(di)) {
            nextValues.push(p.values[di]);
          }
        });
        return { ...p, values: nextValues };
      });

      setDates(newDates);
      setPlayers(newPlayers);
      // Remove merged dates from any existing dateGroups
      setDateGroups((prev) =>
        prev
          .map((g) => ({
            ...g,
            dates: g.dates.filter((d) => !selectedDates.includes(d)),
          }))
          .filter((g) => g.dates.length >= 2)
      );
      setHasChanges(true);
      setSaveMsg(`✓ ${selectedDates.length} fechas fusionadas en "${gName}"`);
      setTimeout(() => setSaveMsg(""), 3500);
    }
  };

  // Manejador de Guardar Grupo Virtual
  const handleSaveDateGroup = (group: DateGroup) => {
    setDateGroups((prev) => {
      const filtered = prev.filter((g) => g.id !== group.id && !g.dates.some((d) => group.dates.includes(d)));
      return [...filtered, group];
    });
    setHasChanges(true);
    setSaveMsg(`✓ Grupo "${group.name}" configurado`);
    setTimeout(() => setSaveMsg(""), 3500);
  };

  const handleDeleteDateGroup = (groupId: string) => {
    setDateGroups((prev) => prev.filter((g) => g.id !== groupId));
    setHasChanges(true);
    setSaveMsg("✓ Grupo eliminado");
    setTimeout(() => setSaveMsg(""), 3500);
  };

  // Manejo de edición en Estructura D (Pliegues Tabulares)
  const handleTabularMetricChange = (rIdx: number, metricName: string, valStr: string) => {
    const trimmed = valStr.trim().replace(",", ".");
    const num = trimmed === "" ? null : parseFloat(trimmed);
    const finalVal = num !== null && isNaN(num) ? null : num;

    setTabularRows((prev) => {
      const copy = [...prev];
      const row = { ...copy[rIdx], metrics: { ...copy[rIdx].metrics, [metricName]: finalVal } };

      // Autocalcular suma si es un pliegue
      if (metricName !== "Suma") {
        let sum = 0;
        let hasAny = false;
        skinfoldFields.forEach((m) => {
          const v = m === metricName ? finalVal : row.metrics[m];
          if (v !== null && v !== undefined) {
            sum += v;
            hasAny = true;
          }
        });
        row.suma = hasAny ? Number(sum.toFixed(1)) : null;
        row.metrics["Suma"] = row.suma;
      } else {
        row.suma = finalVal;
      }

      copy[rIdx] = row;
      return copy;
    });
    setHasChanges(true);
  };

  const handleTabularFechaChange = (rIdx: number, newFecha: string) => {
    setTabularRows((prev) => {
      const copy = [...prev];
      copy[rIdx] = { ...copy[rIdx], fecha: newFecha };
      return copy;
    });
    setHasChanges(true);
  };

  const handleTabularJugadorChange = (rIdx: number, newJugador: string) => {
    setTabularRows((prev) => {
      const copy = [...prev];
      copy[rIdx] = { ...copy[rIdx], jugador: newJugador };
      return copy;
    });
    setHasChanges(true);
  };

  const handleDeleteTabularRow = (rIdx: number) => {
    const r = tabularRows[rIdx];
    if (!window.confirm(`¿Eliminar la medición de ${r.jugador} (${r.fecha})?`)) return;
    setTabularRows((prev) => prev.filter((_, i) => i !== rIdx));
    setHasChanges(true);
  };

  const handleAddTabularRow = () => {
    const jName = (newTabJugador || newTabCustomJugador).trim();
    if (!jName) {
      alert("Por favor, selecciona o escribe el nombre del deportista.");
      return;
    }
    if (!newTabFecha) {
      alert("Por favor, selecciona una fecha para la medición.");
      return;
    }

    const rowMetrics: Record<string, number | null> = {};
    let sum = 0;
    let hasAny = false;
    skinfoldFields.forEach((m) => {
      const raw = newTabMetrics[m];
      if (raw && raw.trim() !== "") {
        const n = parseFloat(raw.trim().replace(",", "."));
        if (!isNaN(n)) {
          rowMetrics[m] = n;
          sum += n;
          hasAny = true;
        } else {
          rowMetrics[m] = null;
        }
      } else {
        rowMetrics[m] = null;
      }
    });

    const finalSuma = hasAny ? Number(sum.toFixed(1)) : null;
    rowMetrics["Suma"] = finalSuma;

    const newRowItem: TabularRowItem = {
      fecha: newTabFecha,
      jugador: jName,
      metrics: rowMetrics,
      suma: finalSuma,
    };

    setTabularRows((prev) => [...prev, newRowItem]);
    setNewTabJugador("");
    setNewTabCustomJugador("");
    setNewTabMetrics({
      Tricipital: "",
      Suprailíaco: "",
      Subescapular: "",
      Abdominal: "",
      Cuádriceps: "",
      Gemelo: "",
    });
    setHasChanges(true);
  };

  // Manejo de edición para Estructuras A / B / C
  const handleCellChange = (playerIdx: number, dateIdx: number, valStr: string) => {
    const trimmed = valStr.trim().replace(",", ".");
    const num = trimmed === "" ? null : parseFloat(trimmed);
    const finalVal = num !== null && isNaN(num) ? null : num;

    setPlayers((prev) => {
      const copy = prev.map((p, pi) => {
        if (pi !== playerIdx) return p;
        const nextVals = [...p.values];
        nextVals[dateIdx] = finalVal;
        return { ...p, values: nextVals };
      });
      return copy;
    });
    setHasChanges(true);
  };

  const handlePlayerNameChange = (playerIdx: number, newName: string) => {
    setPlayers((prev) => {
      const copy = [...prev];
      copy[playerIdx] = { ...copy[playerIdx], name: newName };
      return copy;
    });
    setHasChanges(true);
  };

  const handleDateChange = (dateIdx: number, newDate: string) => {
    setDates((prev) => {
      const copy = [...prev];
      copy[dateIdx] = newDate;
      return copy;
    });
    setHasChanges(true);
  };

  const handleAddColumn = () => {
    const today = new Date().toISOString().split("T")[0];
    const newColName = dataset.structure === "B" ? `Métrica ${dates.length + 1}` : today;
    setDates((prev) => [...prev, newColName]);
    setPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        values: [...p.values, null],
      }))
    );
    setHasChanges(true);
  };

  const handleDeleteColumn = (dateIdx: number) => {
    if (dates.length <= 1) {
      alert("El dataset debe tener al menos una columna de medición.");
      return;
    }
    if (!window.confirm(`¿Eliminar la columna "${dates[dateIdx]}"?`)) return;
    setDates((prev) => prev.filter((_, i) => i !== dateIdx));
    setPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        values: p.values.filter((_, i) => i !== dateIdx),
      }))
    );
    setHasChanges(true);
  };

  const handleAddPlayer = () => {
    const pName = (selectedPlayerToAdd || customPlayerToAdd).trim();
    if (!pName) return;
    if (players.some((p) => p.name.toLowerCase() === pName.toLowerCase())) {
      alert("Este deportista ya existe en la tabla.");
      return;
    }
    const newRow = {
      name: pName,
      values: dates.map(() => null),
    };
    setPlayers((prev) => [...prev, newRow]);
    setSelectedPlayerToAdd("");
    setCustomPlayerToAdd("");
    setHasChanges(true);
  };

  const handleDeletePlayer = (playerIdx: number) => {
    const p = players[playerIdx];
    if (!window.confirm(`¿Eliminar a "${p.name}" de este dataset?`)) return;
    setPlayers((prev) => prev.filter((_, i) => i !== playerIdx));
    setHasChanges(true);
  };

  const handleSave = () => {
    if (isTabularPliegues) {
      // Reconstruir fechas y jugadores para Estructura D
      const datesSet = new Set<string>();
      const playerMap = new Map<string, {
        name: string;
        dateVals: Record<string, number | null>;
        metricsByDate: Record<string, Record<string, number | null>>;
      }>();

      tabularRows.forEach((r) => {
        if (!r.fecha || !r.jugador) return;
        datesSet.add(r.fecha);
        let pObj = playerMap.get(r.jugador);
        if (!pObj) {
          pObj = { name: r.jugador, dateVals: {}, metricsByDate: {} };
          playerMap.set(r.jugador, pObj);
        }
        pObj.dateVals[r.fecha] = r.suma;
        pObj.metricsByDate[r.fecha] = r.metrics;
      });

      const sortedDates = Array.from(datesSet).sort();
      const updatedPlayers = Array.from(playerMap.values()).map((p) => ({
        name: p.name,
        values: sortedDates.map((d) => p.dateVals[d] ?? null),
        metricsByDate: p.metricsByDate,
      }));

      const updated: TestDataSet = {
        ...dataset,
        name: name.trim() || dataset.name,
        structure: "D",
        dates: sortedDates,
        players: updatedPlayers,
        metricsList,
        tabularRows,
        dateGroups,
      };

      onSave(updated, dataset.name);
    } else {
      const updated: TestDataSet = {
        ...dataset,
        name: name.trim() || dataset.name,
        dates,
        players,
        dateGroups,
      };
      onSave(updated, dataset.name);
    }

    setHasChanges(false);
    setSaveMsg("✓ ¡Cambios guardados con éxito!");
    setTimeout(() => setSaveMsg(""), 3500);
  };

  return (
    <div style={{ background: "#ffffff", borderRadius: 12, border: "1px solid #cbd5e1", padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
      {/* Barra de cabecera con acciones principales */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10, borderBottom: "1px solid #f1f5f9", paddingBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 18 }}>{testType?.icon || "✏️"}</span>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setHasChanges(true); }}
              placeholder="Nombre del dataset..."
              style={{
                fontSize: 15,
                fontWeight: 900,
                color: "#0f172a",
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
                width: 220,
              }}
            />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: testType?.color || "#1e3a8a", padding: "3px 8px", borderRadius: 4 }}>
            {testType?.name || "Test"} ({testType?.unit || "u"})
          </span>
          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>
            {isTabularPliegues
              ? `${tabularRows.length} mediciones registradas • ${skinfoldFields.length} pliegues + Suma`
              : `${players.length} deportistas • ${dates.length} ${dataset.structure === "B" ? "métricas" : "fechas"}`}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {hasChanges && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#d97706", background: "#fef3c7", padding: "3px 8px", borderRadius: 4 }}>
              ● Cambios sin guardar
            </span>
          )}
          {saveMsg && (
            <span style={{ fontSize: 11, fontWeight: 800, color: "#15803d", background: "#dcfce7", padding: "3px 8px", borderRadius: 4 }}>
              {saveMsg}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowGroupModal(true)}
            style={{
              fontSize: 11.5,
              fontWeight: 800,
              color: "#4338ca",
              background: "#e0e7ff",
              border: "1px solid #c7d2fe",
              padding: "6px 12px",
              borderRadius: 6,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
            title="Agrupar mediciones tomadas en diferentes días en una sola medición unificada"
          >
            <span>🔗</span> Agrupar / Fusionar Fechas {dateGroups.length > 0 ? `(${dateGroups.length})` : ""}
          </button>
          {!isTabularPliegues && (
            <button
              type="button"
              onClick={handleAddColumn}
              style={{
                fontSize: 11.5,
                fontWeight: 800,
                color: "#1e3a8a",
                background: "#eff6ff",
                border: "1px solid #93c5fd",
                padding: "6px 12px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              + Añadir Fecha/Métrica
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            style={{
              fontSize: 12,
              fontWeight: 900,
              color: "#ffffff",
              background: hasChanges ? "#15803d" : "#1e3a8a",
              border: "none",
              padding: "7px 18px",
              borderRadius: 6,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            }}
          >
            💾 Guardar Cambios
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* VISTA ESPECÍFICA DE EDICIÓN PARA ESTRUCTURA D (PLIEGUES)   */}
      {/* ══════════════════════════════════════════════════════════ */}
      {isTabularPliegues ? (
        <div>
          {/* Selector de modo en Cocina */}
          <div style={{ display: "flex", gap: "8px", marginBottom: 14 }}>
            <button
              type="button"
              onClick={() => setCocinaMode("field")}
              style={{
                fontSize: "12px",
                fontWeight: cocinaMode === "field" ? 900 : 700,
                color: cocinaMode === "field" ? "#ffffff" : "#1e3a8a",
                background: cocinaMode === "field" ? "#1e3a8a" : "#eff6ff",
                border: cocinaMode === "field" ? "none" : "1px solid #93c5fd",
                padding: "7px 16px",
                borderRadius: "8px",
                cursor: "pointer",
                boxShadow: cocinaMode === "field" ? "0 2px 6px rgba(30,58,138,0.25)" : "none",
              }}
            >
              ⚡ Modo Toma de Campo (Registro Fluido por Jugador)
            </button>
            <button
              type="button"
              onClick={() => setCocinaMode("table")}
              style={{
                fontSize: "12px",
                fontWeight: cocinaMode === "table" ? 900 : 700,
                color: cocinaMode === "table" ? "#ffffff" : "#475569",
                background: cocinaMode === "table" ? "#334155" : "#f1f5f9",
                border: cocinaMode === "table" ? "none" : "1px solid #cbd5e1",
                padding: "7px 16px",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              📋 Vista Hoja de Cálculo
            </button>
          </div>

          {/* ─── VISTA 1: MODO TOMA DE CAMPO ─── */}
          {cocinaMode === "field" && (
            <div>
              {/* Header de Toma de Campo */}
              <div style={{ background: "#f8fafc", padding: "14px 18px", borderRadius: 10, border: "1px solid #cbd5e1", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#1e3a8a" }}>📍 Medición a registrar:</span>
                  {!isCreatingNewMedicion ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <select
                        value={fieldMedicion}
                        onChange={(e) => setFieldMedicion(e.target.value)}
                        style={{ fontSize: 12, fontWeight: 800, padding: "6px 12px", borderRadius: 6, border: "1.5px solid #3b82f6", background: "#eff6ff", color: "#1e3a8a" }}
                      >
                        {availableMediciones.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => { setIsCreatingNewMedicion(true); setNewMedicionName(`Medición ${availableMediciones.length + 1}`); }}
                        style={{ fontSize: 11, fontWeight: 800, color: "#166534", background: "#dcfce7", border: "1px solid #86efac", padding: "6px 10px", borderRadius: 6, cursor: "pointer" }}
                      >
                        + Nueva Medición
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="text"
                        value={newMedicionName}
                        onChange={(e) => setNewMedicionName(e.target.value)}
                        placeholder="Ej: Medición 2 (Noviembre)"
                        style={{ fontSize: 12, fontWeight: 800, padding: "6px 10px", borderRadius: 6, border: "1.5px solid #16a34a", background: "#fff", width: 190 }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newMedicionName.trim()) {
                            setFieldMedicion(newMedicionName.trim());
                            setIsCreatingNewMedicion(false);
                          }
                        }}
                        style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: "#16a34a", border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer" }}
                      >
                        Establecer
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCreatingNewMedicion(false)}
                        style={{ fontSize: 11, fontWeight: 700, color: "#64748b", background: "#f1f5f9", border: "none", padding: "6px 10px", borderRadius: 6, cursor: "pointer" }}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>
                      Progreso: {completedFieldCount} / {activePlayersList.length} medidos
                    </span>
                    <div style={{ width: 90, height: 7, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${activePlayersList.length > 0 ? (completedFieldCount / activePlayersList.length) * 100 : 0}%`,
                          background: completedFieldCount === activePlayersList.length ? "#16a34a" : "#2563eb",
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  </div>

                  <input
                    type="text"
                    value={fieldSearch}
                    onChange={(e) => setFieldSearch(e.target.value)}
                    placeholder="🔍 Filtrar deportista..."
                    style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", width: 160 }}
                  />
                </div>
              </div>

              {/* Tarjetas ergonómicas de toma de campo por jugador */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filteredFieldPlayers.map((j: Jugador) => {
                  const row = getFieldRowForPlayer(j.nombre);
                  const isFilled = row && skinfoldFields.every((m) => row.metrics[m] !== null && row.metrics[m] !== undefined);
                  const isPartial = row && skinfoldFields.some((m) => row.metrics[m] !== null && row.metrics[m] !== undefined) && !isFilled;

                  return (
                    <div
                      key={j.id || j.nombre}
                      style={{
                        background: isFilled ? "#f0fdf4" : isPartial ? "#fefce8" : "#ffffff",
                        borderRadius: 10,
                        border: `1.5px solid ${isFilled ? "#86efac" : isPartial ? "#fde047" : "#e2e8f0"}`,
                        padding: "12px 16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 12,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.02)",
                      }}
                    >
                      {/* Info Deportista */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 180 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: "50%",
                            background: "#1e3a8a",
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 900,
                            fontSize: 12,
                          }}
                        >
                          {j.dorsal ? j.dorsal : j.nombre.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>{(j.apodo || j.nombre || "").toUpperCase()}</div>
                          <div style={{ fontSize: 10.5, color: "#64748b", fontWeight: 600 }}>{j.posicion || "Deportista"}</div>
                        </div>
                      </div>

                      {/* 6 Casillas de Pliegues */}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {skinfoldFields.map((m) => {
                          const val = row?.metrics?.[m];
                          return (
                            <div key={m} style={{ textAlign: "center", width: 68 }}>
                              <label style={{ fontSize: 9.5, fontWeight: 800, color: "#475569", display: "block", marginBottom: 2 }}>
                                {m.slice(0, 4).toUpperCase()}
                              </label>
                              <input
                                type="number"
                                step="0.1"
                                placeholder="—"
                                value={val !== null && val !== undefined ? val : ""}
                                onChange={(e) => handleFieldSkinfoldChange(j.nombre, m, e.target.value)}
                                style={{
                                  width: "100%",
                                  fontSize: 12,
                                  fontWeight: 800,
                                  textAlign: "center",
                                  padding: "5px 2px",
                                  borderRadius: 6,
                                  border: `1.5px solid ${val !== null && val !== undefined ? "#3b82f6" : "#cbd5e1"}`,
                                  background: val !== null && val !== undefined ? "#eff6ff" : "#ffffff",
                                  color: "#0f172a",
                                  boxSizing: "border-box",
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* Suma Σ y Estado */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 130, justifyContent: "flex-end" }}>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: 9.5, fontWeight: 800, color: "#64748b", display: "block" }}>SUMA Σ</span>
                          <span style={{ fontSize: 16, fontWeight: 900, color: "#1e3a8a" }}>
                            {row?.suma !== null && row?.suma !== undefined ? `${Number(row.suma).toFixed(1)} mm` : "—"}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            padding: "4px 8px",
                            borderRadius: 6,
                            background: isFilled ? "#dcfce7" : isPartial ? "#fef3c7" : "#f1f5f9",
                            color: isFilled ? "#15803d" : isPartial ? "#b45309" : "#64748b",
                          }}
                        >
                          {isFilled ? "✅ Listo" : isPartial ? "🟡 Parcial" : "⏳ Pendiente"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── VISTA 2: MODO HOJA DE CÁLCULO TRADICIONAL ─── */}
          {cocinaMode === "table" && (
            <div>
              {/* Tabla de edición con todos los 6 pliegues */}
              <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #cbd5e1", maxHeight: "550px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: "#0f172a", color: "#fff" }}>
                      <th style={{ padding: "8px 8px", textAlign: "center", width: "40px", position: "sticky", top: 0, background: "#0f172a", zIndex: 3 }}>#</th>
                      <th style={{ padding: "8px 10px", textAlign: "center", width: "125px", position: "sticky", top: 0, background: "#0f172a", zIndex: 3 }}>Medición</th>
                      <th style={{ padding: "8px 12px", textAlign: "left", minWidth: 160, position: "sticky", top: 0, background: "#0f172a", zIndex: 3 }}>Deportista</th>
                      {skinfoldFields.map((m) => (
                        <th key={m} style={{ padding: "8px 6px", textAlign: "center", width: "85px", position: "sticky", top: 0, background: "#1e293b", zIndex: 3 }}>
                          {m} (mm)
                        </th>
                      ))}
                      <th style={{ padding: "8px 10px", textAlign: "center", width: "95px", position: "sticky", top: 0, background: "#1e3a8a", zIndex: 3, fontWeight: 900 }}>
                        Suma (mm)
                      </th>
                      <th style={{ padding: "8px 8px", textAlign: "center", width: "50px", position: "sticky", top: 0, background: "#0f172a", zIndex: 3 }}>
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabularRows.map((row, rIdx) => (
                      <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? "#ffffff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "4px 8px", textAlign: "center", color: "#94a3b8", fontWeight: 700 }}>
                          {rIdx + 1}
                        </td>
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>
                          <input
                            type="text"
                            value={row.fecha}
                            onChange={(e) => handleTabularFechaChange(rIdx, e.target.value)}
                            placeholder={`Medición ${rIdx + 1}`}
                            style={{ width: "115px", padding: "3px 4px", fontSize: "11px", fontWeight: 800, borderRadius: 4, border: "1px solid #cbd5e1", textAlign: "center", color: "#1e3a8a" }}
                          />
                        </td>
                        <td style={{ padding: "4px 8px" }}>
                          <input
                            type="text"
                            value={row.jugador}
                            onChange={(e) => handleTabularJugadorChange(rIdx, e.target.value)}
                            style={{ width: "100%", padding: "3px 6px", fontSize: "11.5px", fontWeight: 800, color: "#0f172a", borderRadius: 4, border: "1px solid #cbd5e1", background: "#fff" }}
                          />
                        </td>
                        {skinfoldFields.map((m) => {
                          const val = row.metrics?.[m];
                          return (
                            <td key={m} style={{ padding: "4px 4px", textAlign: "center" }}>
                              <input
                                type="number"
                                step="0.1"
                                placeholder="—"
                                value={val !== null && val !== undefined ? val : ""}
                                onChange={(e) => handleTabularMetricChange(rIdx, m, e.target.value)}
                                style={{
                                  width: "70px",
                                  padding: "3px 4px",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  textAlign: "center",
                                  color: val !== null ? "#0f172a" : "#94a3b8",
                                  borderRadius: 4,
                                  border: "1px solid #cbd5e1",
                                  background: val !== null ? "#ffffff" : "#f8fafc",
                                }}
                              />
                            </td>
                          );
                        })}
                        <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 900, color: "#1e3a8a", background: "#eff6ff" }}>
                          {row.suma !== null && row.suma !== undefined ? Number(row.suma).toFixed(1) : "—"}
                        </td>
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteTabularRow(rIdx)}
                            title={`Eliminar medición de ${row.jugador}`}
                            style={{ background: "#fee2e2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 4, padding: "2px 6px", cursor: "pointer", fontSize: "11px" }}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════ */
        /* VISTA ESTÁNDAR DE EDICIÓN PARA ESTRUCTURAS A / B / C       */
        /* ══════════════════════════════════════════════════════════ */
        <div>
          {/* Controles para añadir deportistas a la tabla */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, background: "#f8fafc", padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>+ Añadir Fila:</span>
            <select
              value={selectedPlayerToAdd}
              onChange={(e) => { setSelectedPlayerToAdd(e.target.value); setCustomPlayerToAdd(""); }}
              style={{ fontSize: 11.5, padding: "4px 8px", borderRadius: 5, border: "1px solid #cbd5e1", background: "#fff", maxWidth: 180 }}
            >
              <option value="">Seleccionar de plantilla...</option>
              {jugadores
                .filter((j) => !players.some((p) => p.name.toLowerCase() === j.nombre.toLowerCase()))
                .map((j) => (
                  <option key={j.id} value={(j.apodo || j.nombre || "").toUpperCase()}>
                    {(j.apodo || j.nombre || "").toUpperCase()}
                  </option>
                ))}
            </select>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>o escribir:</span>
            <input
              type="text"
              value={customPlayerToAdd}
              onChange={(e) => { setCustomPlayerToAdd(e.target.value); setSelectedPlayerToAdd(""); }}
              placeholder="Nombre nuevo deportista..."
              style={{ fontSize: 11.5, padding: "4px 8px", borderRadius: 5, border: "1px solid #cbd5e1", background: "#fff", width: 160 }}
            />
            <button
              type="button"
              onClick={handleAddPlayer}
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#fff",
                background: "#4f46e5",
                border: "none",
                padding: "5px 12px",
                borderRadius: 5,
                cursor: "pointer",
              }}
            >
              + Añadir a tabla
            </button>
          </div>

          {/* Tabla de edición interactiva estilo hoja de cálculo */}
          <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #cbd5e1", maxHeight: "550px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead>
                <tr style={{ background: "#0f172a", color: "#fff" }}>
                  <th style={{ padding: "8px 10px", textAlign: "center", width: "40px", position: "sticky", top: 0, left: 0, background: "#0f172a", zIndex: 4 }}>
                    #
                  </th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 800, minWidth: 170, position: "sticky", top: 0, left: "40px", background: "#0f172a", zIndex: 4 }}>
                    Deportista
                  </th>
                  {dates.map((d, di) => (
                    <th key={di} style={{ padding: "6px 8px", textAlign: "center", minWidth: 100, position: "sticky", top: 0, background: "#1e293b", zIndex: 3 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <input
                          type={dataset.structure === "B" ? "text" : "date"}
                          value={d}
                          onChange={(e) => handleDateChange(di, e.target.value)}
                          style={{
                            background: "#334155",
                            color: "#ffffff",
                            border: "1px solid #475569",
                            borderRadius: 4,
                            padding: "2px 4px",
                            fontSize: "10.5px",
                            fontWeight: 700,
                            textAlign: "center",
                            width: dataset.structure === "B" ? "90px" : "110px",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleDeleteColumn(di)}
                          title="Eliminar esta fecha/columna"
                          style={{
                            background: "none",
                            border: "none",
                            color: "#f87171",
                            cursor: "pointer",
                            fontSize: "11px",
                            padding: 0,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </th>
                  ))}
                  <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 800, width: 80, position: "sticky", top: 0, background: "#0f172a", zIndex: 3 }}>
                    Promedio
                  </th>
                  <th style={{ padding: "8px 10px", textAlign: "center", width: 45, position: "sticky", top: 0, background: "#0f172a", zIndex: 3 }}>
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, pi) => {
                  const numVals = p.values.filter((v): v is number => v !== null && v !== undefined);
                  const rowAvg = numVals.length > 0 ? numVals.reduce((a, b) => a + b, 0) / numVals.length : null;

                  return (
                    <tr key={pi} style={{ background: pi % 2 === 0 ? "#ffffff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "4px 8px", textAlign: "center", color: "#94a3b8", fontWeight: 700, position: "sticky", left: 0, background: pi % 2 === 0 ? "#ffffff" : "#f8fafc", zIndex: 2 }}>
                        {pi + 1}
                      </td>
                      <td style={{ padding: "4px 8px", position: "sticky", left: "40px", background: pi % 2 === 0 ? "#ffffff" : "#f8fafc", zIndex: 2 }}>
                        <input
                          type="text"
                          value={p.name}
                          onChange={(e) => handlePlayerNameChange(pi, e.target.value)}
                          style={{
                            width: "100%",
                            padding: "3px 6px",
                            fontSize: "11.5px",
                            fontWeight: 700,
                            color: "#0f172a",
                            borderRadius: 4,
                            border: "1px solid #cbd5e1",
                            background: "#fff",
                          }}
                        />
                      </td>
                      {dates.map((_, di) => {
                        const val = p.values[di];
                        return (
                          <td key={di} style={{ padding: "4px 6px", textAlign: "center" }}>
                            <input
                              type="number"
                              step="0.1"
                              value={val !== null && val !== undefined ? val : ""}
                              onChange={(e) => handleCellChange(pi, di, e.target.value)}
                              placeholder="—"
                              style={{
                                width: "75px",
                                padding: "3px 4px",
                                fontSize: "11.5px",
                                fontWeight: 700,
                                textAlign: "center",
                                color: val !== null ? "#0f172a" : "#94a3b8",
                                borderRadius: 4,
                                border: "1px solid #cbd5e1",
                                background: val !== null ? "#ffffff" : "#f1f5f9",
                              }}
                            />
                          </td>
                        );
                      })}
                      <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 800, color: "#1e3a8a" }}>
                        {rowAvg !== null ? rowAvg.toFixed(1) : "—"}
                      </td>
                      <td style={{ padding: "4px 6px", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => handleDeletePlayer(pi)}
                          title={`Eliminar ${p.name}`}
                          style={{
                            background: "#fee2e2",
                            border: "1px solid #fecaca",
                            color: "#dc2626",
                            borderRadius: 4,
                            padding: "2px 6px",
                            cursor: "pointer",
                            fontSize: "11px",
                          }}
                        >
                          🗑️
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

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 11, color: "#64748b" }}>
          💡 Puedes modificar cualquier celda o pliegue directamente. Al cambiar un valor, la Suma se recalcula al instante. Recuerda pulsar <strong>Guardar Cambios</strong> al terminar.
        </span>
        <button
          type="button"
          onClick={handleSave}
          style={{
            fontSize: 12,
            fontWeight: 900,
            color: "#ffffff",
            background: hasChanges ? "#15803d" : "#1e3a8a",
            border: "none",
            padding: "6px 16px",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          💾 Guardar Cambios
        </button>
      </div>
      {/* Modal de Agrupación de Fechas */}
      <GroupDatesModal
        isOpen={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        dates={dates}
        players={players}
        isTabularPliegues={isTabularPliegues}
        tabularRows={tabularRows}
        existingGroups={dateGroups}
        onMergePermanent={handleMergePermanent}
        onSaveGroup={handleSaveDateGroup}
        onDeleteGroup={handleDeleteDateGroup}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/* ─── Main Page ─── */
/* ═══════════════════════════════════════════════════ */
export default function TestingPage() {
  const { clubName: activeTeam, clubShield, activeTemporada, setSeasonAndTeam, availableTemporadas } = useReportClubInfo();
  const [activeTab, setActiveTab] = useState<"datos" | "cocina" | "reports">("datos");
  const [reportSubTab, setReportSubTab] = useState<"equipo" | "individual">("equipo");
  const [selectedReportPlayer, setSelectedReportPlayer] = useState<string>("");
  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [datasets, setDatasets] = useState<TestDataSet[]>([]);
  const [activeDataset, setActiveDataset] = useState<string>("");
  const [activeDataset2, setActiveDataset2] = useState<string>("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [pesoSyncMsg, setPesoSyncMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);
  const pesoSyncedRef = useRef(false);

  // Test types (predefined + custom)
  const [testTypes, setTestTypes] = useState<TestType[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("testing_types_v1");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return DEFAULT_TEST_TYPES;
  });

  const [isLoadingDB, setIsLoadingDB] = useState(true);

  // Import dialog state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedTestTypeId, setSelectedTestTypeId] = useState<string>("");
  const [datasetLabel, setDatasetLabel] = useState<string>("");
  const [sessionDate, setSessionDate] = useState<string>("");
  const [headerRowNumber, setHeaderRowNumber] = useState<number>(2);
  const [showNewTypeForm, setShowNewTypeForm] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeStructure, setNewTypeStructure] = useState<FileStructure>("A");
  const [newTypeUnit, setNewTypeUnit] = useState("kg");

  // Load saved datasets from DB
  useEffect(() => {
    async function fetchDatasets() {
      setIsLoadingDB(true);
      try {
        const data = await getTestingDatasets();
        setDatasets(data);
        if (data.length > 0) {
          setActiveDataset(data[0].id);
          if (data.length > 1) setActiveDataset2(data[1].id);
        }
      } catch (err) {
        console.error("Error fetching datasets:", err);
      } finally {
        setIsLoadingDB(false);
      }
    }
    fetchDatasets();
    getActiveJugadores().then(j => setJugadores(j || [])).catch(() => {});
  }, []);

  // Persist test types
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("testing_types_v1", JSON.stringify(testTypes));
    }
  }, [testTypes]);

  // Add custom test type
  const addCustomType = useCallback(() => {
    const name = newTypeName.trim();
    if (!name) return;
    const id = `custom_${Date.now()}`;
    const newType: TestType = {
      id, name, structure: newTypeStructure, unit: newTypeUnit.trim() || "",
      icon: "🔬", color: CHART_COLORS[testTypes.length % CHART_COLORS.length],
      builtIn: false,
    };
    setTestTypes(prev => [...prev, newType]);
    setSelectedTestTypeId(id);
    setShowNewTypeForm(false);
    setNewTypeName("");
    setNewTypeUnit("kg");
    setNewTypeStructure("A");
  }, [newTypeName, newTypeStructure, newTypeUnit, testTypes.length]);

  // Delete custom test type
  const deleteTestType = useCallback((typeId: string) => {
    setTestTypes(prev => prev.filter(t => t.id !== typeId));
  }, []);

  // Helper: check if a player name from the file matches an active jugador
  const isActivePlayer = useCallback((playerName: string): boolean => {
    if (jugadores.length === 0) return true; // If no jugadores loaded, allow all
    const normalise = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const norm = normalise(playerName);
    return jugadores.some(j =>
      normalise(j.nombre) === norm ||
      (j.apodo && normalise(j.apodo) === norm)
    );
  }, [jugadores]);

  // Process rows helper
  const processRows = useCallback((rows: any[][], name: string, structure: FileStructure, testTypeId: string, sessDate?: string, customHeaderRow?: number) => {
    if (rows.length < 2) throw new Error("El archivo debe tener al menos 2 filas (cabecera + datos)");

    // Detección o asignación de la fila de cabecera indicada por el usuario
    let headerRowIdx = customHeaderRow !== undefined && customHeaderRow >= 1 ? customHeaderRow - 1 : 0;
    if (customHeaderRow === undefined) {
      for (let r = 0; r < Math.min(rows.length, 10); r++) {
        const rCells = (rows[r] || []).map((c: any) => String(c ?? "").toLowerCase().trim());
        const hasFecha = rCells.some((c: string) => c === "fecha" || c === "date" || c.startsWith("fech"));
        const hasJugador = rCells.some((c: string) => c === "jugador" || c === "player" || c === "nombre" || c === "deportista" || c === "atleta");
        const hasPliegues = rCells.some((c: string) => c.includes("tricip") || c.includes("pliegue") || c.includes("supra") || c.includes("subesc") || c.includes("abdom") || c.includes("abfom") || c.includes("cuadr") || c.includes("gemel"));
        const hasDates = rCells.filter((c: string) => parseExcelDate(c) !== "").length >= 2;

        if ((hasFecha && hasJugador) || (hasFecha && hasPliegues) || (hasJugador && hasPliegues) || hasDates) {
          headerRowIdx = r;
          break;
        }
      }
    }

    if (!rows[headerRowIdx]) throw new Error(`No se encontró la fila ${headerRowIdx + 1} en el archivo`);

    const headerCells = rows[headerRowIdx].map((c: any) => {
      if (c instanceof Date) return c.toISOString().split("T")[0];
      if (typeof c === "number" && c > 40000 && c < 60000) {
        return new Date((c - 25569) * 86400 * 1000).toISOString().split("T")[0];
      }
      return String(c ?? "").trim();
    });

    const headerLower = headerCells.map((h: string) => h.toLowerCase().trim());
    const hasFechaCol = headerLower.some((h: string) => h === "fecha" || h === "date" || h.startsWith("fech"));
    const hasJugadorCol = headerLower.some((h: string) => h === "jugador" || h === "player" || h === "nombre" || h === "deportista" || h === "atleta");
    const isTabular = structure === "D" || (hasFechaCol && hasJugadorCol);

    if (isTabular) {
      // Structure D: Tabular (Fecha, Jugador, Tricipital, Suprailiaco, Subescapular, Abdominal, Cuadriceps, Gemelo, Suma...)
      const fechaColIdx = headerLower.findIndex((h: string) => h === "fecha" || h === "date" || h.startsWith("fech"));
      const jugadorColIdx = headerLower.findIndex((h: string) => h === "jugador" || h === "player" || h === "nombre" || h === "deportista" || h === "atleta");

      const metricColIndices: { idx: number; name: string }[] = [];
      headerCells.forEach((cellName: string, idx: number) => {
        if (idx !== fechaColIdx && idx !== jugadorColIdx && cellName.trim() !== "") {
          let normName = cellName.trim();
          const l = normName.toLowerCase();
          if (l.includes("tricip")) normName = "Tricipital";
          else if (l.includes("supra")) normName = "Suprailíaco";
          else if (l.includes("subesc")) normName = "Subescapular";
          else if (l.includes("abfom") || l.includes("abdom")) normName = "Abdominal";
          else if (l.includes("cuadr")) normName = "Cuádriceps";
          else if (l.includes("gemel")) normName = "Gemelo";
          else if (l.includes("sum")) normName = "Suma";
          metricColIndices.push({ idx, name: normName });
        }
      });

      const metricsList = ["Suma", ...metricColIndices.filter((m) => m.name !== "Suma").map((m) => m.name)];

      const tabularRows: TabularRowItem[] = [];
      const datesSet = new Set<string>();
      const playerMap = new Map<string, {
        name: string;
        dateVals: Record<string, number | null>;
        metricsByDate: Record<string, Record<string, number | null>>;
      }>();
      let skippedCount = 0;

      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const rawFecha = row[fechaColIdx];
        let isoDate = "";
        if (rawFecha instanceof Date) isoDate = rawFecha.toISOString().split("T")[0];
        else if (typeof rawFecha === "number") {
          if (rawFecha > 40000 && rawFecha < 60000) {
            isoDate = new Date((rawFecha - 25569) * 86400 * 1000).toISOString().split("T")[0];
          } else {
            isoDate = `Medición ${rawFecha}`;
          }
        } else {
          const strF = String(rawFecha ?? "").trim();
          if (/^\d+$/.test(strF) && Number(strF) < 1000) {
            isoDate = `Medición ${strF}`;
          } else if (/^m\s*(\d+)$/i.test(strF)) {
            const numM = strF.match(/^m\s*(\d+)$/i);
            isoDate = `Medición ${numM ? numM[1] : strF}`;
          } else if (/^medici[oó]n\s*(\d+)$/i.test(strF)) {
            const numM = strF.match(/^medici[oó]n\s*(\d+)$/i);
            isoDate = `Medición ${numM ? numM[1] : strF}`;
          } else {
            isoDate = parseExcelDate(strF) || strF;
          }
        }

        const playerName = String(row[jugadorColIdx] ?? "").trim();
        if (!playerName || !isoDate) continue;

        if (!isActivePlayer(playerName)) {
          skippedCount++;
          continue;
        }

        datesSet.add(isoDate);

        const rowMetrics: Record<string, number | null> = {};
        let directSuma: number | null = null;
        let sumOfSkinfolds = 0;
        let hasAnySkinfold = false;

        metricColIndices.forEach(({ idx, name }) => {
          const raw = row[idx];
          let num: number | null = null;
          if (raw !== null && raw !== undefined && raw !== "") {
            num = typeof raw === "number" ? raw : parseFloat(String(raw).replace(",", "."));
            if (isNaN(num)) num = null;
          }
          rowMetrics[name] = num;
          if (name === "Suma" && num !== null) {
            directSuma = num;
          } else if (name !== "Suma" && num !== null) {
            sumOfSkinfolds += num;
            hasAnySkinfold = true;
          }
        });

        const finalSuma = directSuma !== null ? directSuma : (hasAnySkinfold ? Number(sumOfSkinfolds.toFixed(1)) : null);
        rowMetrics["Suma"] = finalSuma;

        tabularRows.push({
          fecha: isoDate,
          jugador: playerName,
          metrics: rowMetrics,
          suma: finalSuma,
        });

        let pObj = playerMap.get(playerName);
        if (!pObj) {
          pObj = { name: playerName, dateVals: {}, metricsByDate: {} };
          playerMap.set(playerName, pObj);
        }
        pObj.dateVals[isoDate] = finalSuma;
        pObj.metricsByDate[isoDate] = rowMetrics;
      }

      if (playerMap.size === 0) throw new Error("No se encontraron registros válidos de jugadores activos en el archivo");

      const sortedDates = Array.from(datesSet).sort();
      const allPlayers = Array.from(playerMap.values()).map((p) => ({
        name: p.name,
        values: sortedDates.map((d) => p.dateVals[d] ?? null),
        metricsByDate: p.metricsByDate,
      }));

      const newDs: TestDataSet = {
        id: `ds_${Date.now()}`,
        name,
        testTypeId: testTypeId || "pliegues",
        structure: "D",
        dates: sortedDates,
        players: allPlayers,
        metricsList,
        tabularRows,
        createdAt: new Date().toISOString(),
      };

      saveTestingDataset(newDs).catch(err => console.error("Error saving dataset:", err));
      setDatasets((prev) => {
        const existingIdx = prev.findIndex((d) => d.name === name);
        let next: TestDataSet[];
        if (existingIdx >= 0) { next = [...prev]; next[existingIdx] = newDs; }
        else { next = [...prev, newDs]; }
        return next;
      });
      setActiveDataset(newDs.id);
      const skippedMsg = skippedCount > 0 ? ` (${skippedCount} archivados excluidos)` : "";
      setImportSuccess(`✅ "${name}" importado: ${allPlayers.length} jugadores × ${sortedDates.length} fechas (${metricsList.length} métricas) · Cabecera: Fila ${headerRowIdx + 1}${skippedMsg}`);
      return;
    }

    let dates: string[];
    if (structure === "B") {
      // For B: headers are metric names, not dates
      dates = headerCells.slice(1).filter(Boolean);
    } else {
      dates = headerCells.slice(1).map(parseExcelDate).filter(Boolean);
    }
    if (dates.length === 0) throw new Error(structure === "B" ? "No se encontraron métricas en la fila de cabecera" : "No se encontraron fechas en la fila de cabecera");

    const allPlayers: TestDataSet["players"] = [];
    let skippedCount = 0;
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const playerName = String(row[0] ?? "").trim();
      if (!playerName) continue;

      // Skip archived (non-active) players
      if (!isActivePlayer(playerName)) {
        skippedCount++;
        continue;
      }

      if (structure === "C") {
        // Multi-value: each cell may have comma-separated values → average them
        const values = dates.map((_, di) => {
          const raw = row[di + 1];
          if (raw === null || raw === undefined || raw === "") return null;
          const str = String(raw).replace(/;/g, ",");
          const nums = str.split(",").map(s => parseFloat(s.trim().replace(",", "."))).filter(n => !isNaN(n));
          return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
        });
        allPlayers.push({ name: playerName, values });
      } else {
        const values = dates.map((_, di) => {
          const raw = row[di + 1];
          if (raw === null || raw === undefined || raw === "") return null;
          const num = typeof raw === "number" ? raw : parseFloat(String(raw).replace(",", "."));
          return isNaN(num) ? null : num;
        });
        allPlayers.push({ name: playerName, values });
      }
    }

    if (allPlayers.length === 0) throw new Error("No se encontraron jugadores activos en el archivo");

    const newDs: TestDataSet = {
      id: `ds_${Date.now()}`,
      name,
      testTypeId,
      structure,
      dates,
      players: allPlayers,
      sessionDate: sessDate || undefined,
      createdAt: new Date().toISOString(),
    };

    saveTestingDataset(newDs).catch(err => console.error("Error saving dataset:", err));
    setDatasets(prev => {
      const existingIdx = prev.findIndex(d => d.name === name);
      let next: TestDataSet[];
      if (existingIdx >= 0) { next = [...prev]; next[existingIdx] = newDs; }
      else { next = [...prev, newDs]; }
      return next;
    });
    setActiveDataset(newDs.id);
    const skippedMsg = skippedCount > 0 ? ` (${skippedCount} archivados excluidos)` : "";
    setImportSuccess(`✅ "${name}" importado: ${allPlayers.length} jugadores × ${dates.length} ${structure === "B" ? "métricas" : "mediciones"} · Cabecera: Fila ${headerRowIdx + 1}${skippedMsg}`);

    // Auto-sync peso to player profiles when importing a peso-type dataset
    if (testTypeId === "peso") {
      const pesoEntries: { playerName: string; peso: number }[] = [];
      for (const p of allPlayers) {
        // Find the last non-null value for this player
        for (let i = p.values.length - 1; i >= 0; i--) {
          if (p.values[i] !== null) {
            pesoEntries.push({ playerName: p.name, peso: p.values[i]! });
            break;
          }
        }
      }
      if (pesoEntries.length > 0) {
        updatePesosBatch(pesoEntries)
          .then(result => {
            setImportSuccess(prev =>
              (prev || "") + `\n⚖️ Pesos actualizados en ficha: ${result.updated} jugadores`
              + (result.errors.length > 0 ? ` (${result.errors.length} sin coincidencia)` : "")
            );
          })
          .catch(() => {});
      }
    }
  }, [isActivePlayer]);

  // Process file
  const processFile = useCallback((file: File, name: string, structure: FileStructure, testTypeId: string, sessDate?: string, customHeaderRow?: number) => {
    setImportError(null);
    setImportSuccess(null);
    const isExcel = /\.xlsx?$/i.test(file.name);

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array", cellDates: true });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: true, defval: null });
          processRows(rows, name, structure, testTypeId, sessDate, customHeaderRow);
        } catch (err: any) {
          setImportError(`❌ Error leyendo Excel: ${err.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          if (!text) throw new Error("Archivo vacío");
          const firstLine = text.split(/\r?\n/)[0];
          const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";
          const lines = text.split(/\r?\n/).filter(l => l.trim());
          const rows: any[][] = lines.map(l => l.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, "")));
          processRows(rows, name, structure, testTypeId, sessDate, customHeaderRow);
        } catch (err: any) {
          setImportError(`❌ Error: ${err.message}`);
        }
      };
      reader.readAsText(file);
    }
  }, [processRows]);

  // Handle file selection → open import dialog
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    pendingFileRef.current = file;
    const suggestedName = file.name.replace(/\.(csv|tsv|txt|xlsx?)$/i, "").replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    setDatasetLabel(suggestedName);
    setSelectedTestTypeId(testTypes[0]?.id || "");
    setSessionDate(new Date().toISOString().split("T")[0]);
    setHeaderRowNumber(2);
    setShowImportDialog(true);
  }, [testTypes]);

  const confirmImport = useCallback(() => {
    const file = pendingFileRef.current;
    const name = datasetLabel.trim();
    const tt = testTypes.find(t => t.id === selectedTestTypeId);
    if (!file || !name || !tt) return;
    processFile(file, name, tt.structure, tt.id, tt.structure === "B" ? sessionDate : undefined, headerRowNumber);
    setShowImportDialog(false);
    setDatasetLabel("");
    pendingFileRef.current = null;
  }, [datasetLabel, selectedTestTypeId, sessionDate, headerRowNumber, testTypes, processFile]);

  const cancelImport = useCallback(() => {
    setShowImportDialog(false);
    pendingFileRef.current = null;
  }, []);

  // Delete dataset
  const handleDelete = useCallback((dsId: string) => {
    deleteTestingDataset(dsId).catch(err => console.error("Error deleting dataset:", err));
    setDatasets(prev => {
      const next = prev.filter(d => d.id !== dsId);
      if (activeDataset === dsId && next.length > 0) setActiveDataset(next[0].id);
      else if (next.length === 0) setActiveDataset("");
      return next;
    });
  }, [activeDataset]);

  // Helper: check if a dataset is a peso-type dataset
  const isPesoDataset = useCallback((ds: TestDataSet) => {
    return ds.testTypeId === "peso" || ds.name.toLowerCase().includes("peso");
  }, []);

  // Update dataset (edit all data from Cocina)
  const handleUpdateDataset = useCallback((updatedDs: TestDataSet) => {
    saveTestingDataset(updatedDs).catch(err => console.error("Error saving dataset:", err));
    setDatasets(prev => {
      const next = prev.map(d => (d.id === updatedDs.id ? updatedDs : d));
      return next;
    });

    if (isPesoDataset(updatedDs)) {
      const pesoEntries: { playerName: string; peso: number }[] = [];
      for (const p of updatedDs.players) {
        for (let i = p.values.length - 1; i >= 0; i--) {
          if (p.values[i] !== null && p.values[i] !== undefined) {
            pesoEntries.push({ playerName: p.name, peso: p.values[i]! });
            break;
          }
        }
      }
      if (pesoEntries.length > 0) {
        updatePesosBatch(pesoEntries).catch(() => {});
      }
    }
  }, [isPesoDataset]);

  const rawActiveDs = datasets.find(d => d.id === activeDataset);
  const activeDs = rawActiveDs ? resolveDatasetForReporting(rawActiveDs) : undefined;
  const activeTestType = activeDs ? testTypes.find(t => t.id === activeDs.testTypeId) : null;

  const rawActiveDs2 = datasets.find(d => d.id === activeDataset2);
  const activeDs2 = rawActiveDs2 ? resolveDatasetForReporting(rawActiveDs2) : undefined;
  const activeTestType2 = activeDs2 ? testTypes.find(t => t.id === activeDs2.testTypeId) : null;

  const selectedType = testTypes.find(t => t.id === selectedTestTypeId);

  // Helper: sync peso values from a dataset to player profiles
  const syncPesosFromDataset = useCallback(async (ds: TestDataSet) => {
    console.log('[syncPesos] Called for dataset:', ds.name, 'testTypeId:', ds.testTypeId, 'players:', ds.players.length);
    const pesoEntries: { playerName: string; peso: number }[] = [];
    for (const p of ds.players) {
      for (let i = p.values.length - 1; i >= 0; i--) {
        if (p.values[i] !== null) {
          pesoEntries.push({ playerName: p.name, peso: p.values[i]! });
          break;
        }
      }
    }
    console.log('[syncPesos] pesoEntries:', pesoEntries.length, pesoEntries.map(e => `${e.playerName}=${e.peso}`));
    if (pesoEntries.length === 0) return;
    try {
      const result = await updatePesosBatch(pesoEntries);
      console.log('[syncPesos] Result:', result);
      setPesoSyncMsg(
        `⚖️ Pesos actualizados en ficha: ${result.updated} jugadores`
        + (result.errors.length > 0 ? ` (${result.errors.length} sin coincidencia)` : "")
      );
    } catch (err) {
      console.error('[syncPesos] Error:', err);
      setPesoSyncMsg("❌ Error al sincronizar pesos");
    }
  }, []);

  // Auto-sync peso datasets on first load
  useEffect(() => {
    console.log('[autoSync] datasets:', datasets.length, 'pesoSynced:', pesoSyncedRef.current);
    if (pesoSyncedRef.current || datasets.length === 0) return;
    const pesoDs = datasets.filter(isPesoDataset);
    console.log('[autoSync] pesoDs found:', pesoDs.length, pesoDs.map(d => `${d.name} (testTypeId=${d.testTypeId})`));
    if (pesoDs.length > 0) {
      pesoSyncedRef.current = true;
      const latest = pesoDs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      console.log('[autoSync] Syncing latest:', latest.name);
      syncPesosFromDataset(latest);
    } else {
      console.log('[autoSync] All datasets testTypeIds:', datasets.map(d => `${d.name}: testTypeId=${d.testTypeId}`));
    }
  }, [datasets, syncPesosFromDataset, isPesoDataset]);

  // Stats
  const stats = activeDs ? (() => {
    const allVals = activeDs.players.flatMap(p => p.values).filter((v): v is number => v !== null);
    const avg = allVals.length > 0 ? allVals.reduce((a, b) => a + b, 0) / allVals.length : 0;
    const max = allVals.length > 0 ? Math.max(...allVals) : 0;
    const min = allVals.length > 0 ? Math.min(...allVals) : 0;
    const lastVals = activeDs.players.map(p => p.values[p.values.length - 1]).filter((v): v is number => v !== null);
    const lastAvg = lastVals.length > 0 ? lastVals.reduce((a, b) => a + b, 0) / lastVals.length : 0;
    return { avg, max, min, lastAvg, count: activeDs.players.length, dates: activeDs.dates.length };
  })() : null;

  const stats2 = activeDs2 ? (() => {
    const allVals = activeDs2.players.flatMap(p => p.values).filter((v): v is number => v !== null);
    const avg = allVals.length > 0 ? allVals.reduce((a, b) => a + b, 0) / allVals.length : 0;
    const max = allVals.length > 0 ? Math.max(...allVals) : 0;
    const min = allVals.length > 0 ? Math.min(...allVals) : 0;
    const lastVals = activeDs2.players.map(p => p.values[p.values.length - 1]).filter((v): v is number => v !== null);
    const lastAvg = lastVals.length > 0 ? lastVals.reduce((a, b) => a + b, 0) / lastVals.length : 0;
    return { avg, max, min, lastAvg, count: activeDs2.players.length, dates: activeDs2.dates.length };
  })() : null;

  return (
    <main style={{ padding: "12px 20px", maxWidth: 1300, margin: "0 auto", fontFamily: "var(--font-sans, system-ui, sans-serif)", background: "#f8fafc", minHeight: "100vh" }}>
      {/* File Input siempre disponible en el DOM */}
      <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" style={{ display: "none" }} onChange={handleFileSelect} />

      {/* Header */}
      <header className="no-print" style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ fontSize: 12, fontWeight: 800, color: "#1e3a8a", background: "#e2e8f0", padding: "4px 10px", borderRadius: 6, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>← Menú</Link>
          <span style={{ color: "#cbd5e1", fontSize: 14 }}>|</span>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 900, color: "#0f172a" }}>📊 Testing</h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Selector de Temporada y Club */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#ffffff", padding: "4px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
            <img
              src={clubShield}
              alt={activeTeam}
              style={{ width: "24px", height: "24px", objectFit: "contain", borderRadius: "4px" }}
            />
            <span style={{ fontSize: "12px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
              {activeTeam}
            </span>
            <select
              value={`${activeTemporada}::${activeTeam}`}
              onChange={(e) => {
                const [tVal, teamVal] = e.target.value.split("::");
                setSeasonAndTeam(tVal, teamVal);
              }}
              style={{
                padding: "3px 8px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "11.5px",
                fontWeight: 700,
                background: "#f8fafc",
                color: "#1e3a8a",
                cursor: "pointer",
              }}
            >
              {availableTemporadas.map((t) => (
                <option key={`${t.temporada}_${t.equipo}`} value={`${t.temporada}::${t.equipo}`}>
                  {t.temporada} · {t.equipo}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "#fff",
              background: "linear-gradient(135deg, #1e3a8a, #3b82f6)",
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 2px 6px rgba(30,58,138,0.25)",
            }}
          >
            📁 Importar CSV / Excel (.xlsx)
          </button>
        </div>
      </header>

      {/* MODAL GLOBAL DE IMPORTACIÓN (DISPONIBLE DESDE CUALQUIER PESTAÑA) */}
      {showImportDialog && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={cancelImport}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              border: "1px solid #cbd5e1",
              boxShadow: "0 20px 30px -5px rgba(0, 0, 0, 0.3)",
              width: "560px",
              maxWidth: "95vw",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ background: "#0f172a", color: "#ffffff", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>📊</span>
                <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 900 }}>Configurar importación de Test</h3>
              </div>
              <button type="button" onClick={cancelImport} style={{ background: "transparent", border: "none", color: "#cbd5e1", fontSize: "16px", fontWeight: 900, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 220px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a" }}>Tipo de test</label>
                    <button
                      type="button"
                      onClick={() => setShowNewTypeForm((prev) => !prev)}
                      style={{ background: "none", border: "none", color: "#6366f1", fontSize: "10.5px", fontWeight: 800, cursor: "pointer", textDecoration: "underline" }}
                    >
                      {showNewTypeForm ? "Cancelar nuevo" : "+ Crear nuevo test"}
                    </button>
                  </div>
                  <select
                    value={selectedTestTypeId}
                    onChange={(e) => setSelectedTestTypeId(e.target.value)}
                    style={{ fontSize: "12.5px", fontWeight: 700, padding: "8px 10px", borderRadius: "8px", border: "1px solid #93c5fd", outline: "none", width: "100%", background: "#eff6ff", color: "#1e3a8a" }}
                  >
                    {testTypes.map((tt) => (
                      <option key={tt.id} value={tt.id}>
                        {tt.icon} {tt.name} ({tt.unit} · Estructura {tt.structure})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: "1 1 220px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>Nombre del dataset / test</label>
                  <input
                    value={datasetLabel}
                    onChange={(e) => setDatasetLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") confirmImport(); }}
                    placeholder="Ej: CMJ Pretemporada, Salto..."
                    style={{ fontSize: "12.5px", fontWeight: 700, padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", width: "100%", boxSizing: "border-box" }}
                    autoFocus
                  />
                </div>
              </div>

              {/* Formulario desplegable para crear nuevo tipo de test dentro del modal */}
              {showNewTypeForm && (
                <div style={{ padding: "12px 14px", background: "#faf5ff", borderRadius: "8px", border: "1px solid #d8b4fe", display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 120px" }}>
                    <label style={{ fontSize: "10px", fontWeight: 700, color: "#6b21a8", display: "block", marginBottom: "2px" }}>Nombre</label>
                    <input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="Ej: CMJ, VO2, Salto..." style={{ width: "100%", fontSize: "11.5px", padding: "6px 8px", borderRadius: "6px", border: "1px solid #d8b4fe", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: "1 1 140px" }}>
                    <label style={{ fontSize: "10px", fontWeight: 700, color: "#6b21a8", display: "block", marginBottom: "2px" }}>Estructura</label>
                    <select value={newTypeStructure} onChange={(e) => setNewTypeStructure(e.target.value as FileStructure)} style={{ width: "100%", fontSize: "11.5px", padding: "6px 8px", borderRadius: "6px", border: "1px solid #d8b4fe" }}>
                      <option value="D">D — Tabular (Fecha, Jugador, 6 Pliegues, Suma)</option>
                      <option value="A">A — Jugadores × Fechas</option>
                      <option value="B">B — Jugadores × Métricas</option>
                      <option value="C">C — Jugadores × Fechas (multi-valor)</option>
                    </select>
                  </div>
                  <div style={{ width: "70px" }}>
                    <label style={{ fontSize: "10px", fontWeight: 700, color: "#6b21a8", display: "block", marginBottom: "2px" }}>Unidad</label>
                    <input value={newTypeUnit} onChange={(e) => setNewTypeUnit(e.target.value)} placeholder="cm, s, kg..." style={{ width: "100%", fontSize: "11.5px", padding: "6px 8px", borderRadius: "6px", border: "1px solid #d8b4fe", boxSizing: "border-box" }} />
                  </div>
                  <button type="button" onClick={addCustomType} style={{ fontSize: "11.5px", fontWeight: 800, color: "#fff", background: "#7c3aed", padding: "7px 14px", borderRadius: "6px", border: "none", cursor: "pointer" }}>Crear</button>
                </div>
              )}

              {/* Fila de cabecera y parámetros adicionales */}
              <div style={{ display: "grid", gridTemplateColumns: selectedType?.structure === "B" ? "1fr 1fr" : "1fr", gap: "12px", alignItems: "center" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                    📍 Fila donde está la cabecera en el Excel
                  </label>
                  <select
                    value={headerRowNumber}
                    onChange={(e) => setHeaderRowNumber(Number(e.target.value))}
                    style={{ fontSize: "12px", fontWeight: 700, padding: "8px 12px", borderRadius: "8px", border: "1.5px solid #86efac", outline: "none", width: "100%", background: "#f0fdf4", color: "#166534" }}
                  >
                    <option value={2}>Fila 2 (Cabecera en fila 2, datos desde fila 3)</option>
                    <option value={1}>Fila 1 (Cabecera en fila 1, datos desde fila 2)</option>
                    <option value={3}>Fila 3</option>
                    <option value={4}>Fila 4</option>
                    <option value={5}>Fila 5</option>
                  </select>
                </div>

                {selectedType?.structure === "B" && (
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>Fecha de la sesión del test</label>
                    <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} style={{ fontSize: "12px", padding: "7px 10px", borderRadius: "8px", border: "1px solid #93c5fd", outline: "none", width: "100%" }} />
                  </div>
                )}
              </div>

              {/* Preview de la estructura seleccionada */}
              {selectedType && (
                <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <StructurePreview structure={selectedType.structure} />
                </div>
              )}

              {importError && (
                <div style={{ fontSize: "12px", color: "#dc2626", fontWeight: 700, padding: "8px 12px", background: "#fef2f2", borderRadius: "8px", border: "1px solid #fecaca" }}>
                  {importError}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "6px" }}>
                <button type="button" onClick={cancelImport} style={{ fontSize: "12.5px", fontWeight: 700, color: "#64748b", background: "#f1f5f9", padding: "9px 18px", borderRadius: "8px", border: "1px solid #cbd5e1", cursor: "pointer" }}>Cancelar</button>
                <button type="button" onClick={confirmImport} style={{ fontSize: "12.5px", fontWeight: 800, color: "#fff", background: "#2563eb", padding: "9px 22px", borderRadius: "8px", border: "none", cursor: "pointer", boxShadow: "0 2px 6px rgba(37,99,235,0.3)" }}>Confirmar e Importar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BARRA DE CAPAS / PESTAÑAS PRINCIPALES (ANCHO COMPLETO: DATOS, COCINA, REPORTS) */}
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
          onClick={() => setActiveTab("datos")}
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
            background: activeTab === "datos" ? "#1e3a8a" : "transparent",
            color: activeTab === "datos" ? "#ffffff" : "#475569",
            boxShadow: activeTab === "datos" ? "0 2px 6px rgba(30,58,138,0.3)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          Datos
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("cocina")}
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
            background: activeTab === "cocina" ? "#1e3a8a" : "transparent",
            color: activeTab === "cocina" ? "#ffffff" : "#475569",
            boxShadow: activeTab === "cocina" ? "0 2px 6px rgba(30,58,138,0.3)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          Cocina
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reports")}
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
            background: activeTab === "reports" ? "#1e3a8a" : "transparent",
            color: activeTab === "reports" ? "#ffffff" : "#475569",
            boxShadow: activeTab === "reports" ? "0 2px 6px rgba(30,58,138,0.3)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          Reports
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* CAPA 1: DATOS (Tablas y Valores por Jugador)          */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeTab === "datos" && (
        <div>
          {/* Dataset Selector Tabs - Agrupados por TestType (Categoría/Carpeta) */}
          {datasets.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b" }}>Selecciona un Test para ver sus datos:</span>
              
              <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 24 }}>
                {testTypes.filter(tt => datasets.some(ds => ds.testTypeId === tt.id)).map(tt => {
                  const ttDatasets = datasets.filter(ds => ds.testTypeId === tt.id);
                  return (
                    <div key={tt.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: tt.color, display: "flex", alignItems: "center", gap: 4 }}>
                        <span>{tt.icon}</span> {tt.name.toUpperCase()}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {ttDatasets.map(ds => {
                          const isSelected = activeDataset === ds.id;
                          return (
                            <button
                              key={ds.id}
                              onClick={() => setActiveDataset(ds.id)}
                              style={{
                                fontSize: 12,
                                fontWeight: isSelected ? 900 : 600,
                                color: isSelected ? "#fff" : "#334155",
                                background: isSelected ? `linear-gradient(135deg, ${tt.color}, ${tt.color}bb)` : "#ffffff",
                                padding: "7px 16px",
                                borderRadius: 8,
                                border: isSelected ? "none" : "1px solid #cbd5e1",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                                boxShadow: isSelected ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
                              }}
                            >
                              {ds.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeDs && stats ? (
            <>
              {/* Stats Row */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                <StatCard label="Jugadores" value={String(stats.count)} color={activeTestType?.color || "#6366f1"} />
                <StatCard label={activeDs.structure === "B" ? "Métricas" : "Mediciones"} value={String(stats.dates)} color="#8b5cf6" />
                <StatCard label="Promedio global" value={stats.avg.toFixed(1)} unit={activeTestType?.unit} color="#1e3a8a" />
                <StatCard label={activeDs.structure === "B" ? "Promedio equipo" : "Última medición"} value={stats.lastAvg.toFixed(1)} unit={activeTestType?.unit} color="#0ea5e9" />
                <StatCard label="Mín." value={stats.min.toFixed(1)} unit={activeTestType?.unit} color="#16a34a" />
                <StatCard label="Máx." value={stats.max.toFixed(1)} unit={activeTestType?.unit} color="#dc2626" />
              </div>

              {/* Sincronización de peso a fichas de deportistas */}
              {isPesoDataset(activeDs) && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <button onClick={() => syncPesosFromDataset(activeDs)} style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, boxShadow: "0 2px 6px rgba(99,102,241,0.25)" }}>
                    ⚖️ Sincronizar pesos a fichas de deportistas
                  </button>
                  {pesoSyncMsg && <span style={{ fontSize: 11, fontWeight: 700, color: pesoSyncMsg.startsWith("❌") ? "#dc2626" : "#16a34a" }}>{pesoSyncMsg}</span>}
                </div>
              )}

              {/* Data Table */}
              <section style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "20px 24px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#1e293b" }}>
                    📋 Registro de Datos — {activeDs.name}
                    {activeTestType?.unit && <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginLeft: 6 }}>({activeTestType.unit})</span>}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab("reports")}
                    style={{ fontSize: 11, fontWeight: 700, color: "#1e3a8a", background: "#eff6ff", padding: "4px 10px", borderRadius: 6, border: "1px solid #bfdbfe", cursor: "pointer" }}
                  >
                    Ver Gráficos y Report ➔
                  </button>
                </div>
                <DataTable dataset={activeDs} isMetrics={activeDs.structure === "B"} />
              </section>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "60px 20px", background: "#fff", borderRadius: 16, border: "2px dashed #cbd5e1", color: "#94a3b8" }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>📊</div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#64748b", margin: "0 0 8px" }}>No hay datasets de testing disponibles</p>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>Dirígete a la pestaña Cocina para importar un archivo de peso, pliegues, sprints u otra valoración.</p>
              <button
                type="button"
                onClick={() => setActiveTab("cocina")}
                style={{ background: "#1e3a8a", color: "#fff", border: "none", padding: "8px 20px", borderRadius: 8, fontSize: "12px", fontWeight: 800, cursor: "pointer" }}
              >
                🍳 Ir a Cocina / Importar
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* CAPA 2: COCINA (Editor de Datos en Vivo e Ingesta)   */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeTab === "cocina" && (
        <div>
          {/* Dataset Selector Tabs for Editing */}
          {datasets.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginRight: 4 }}>Dataset para editar:</span>
              {datasets.map(ds => {
                const tt = testTypes.find(t => t.id === ds.testTypeId);
                const isSelected = activeDataset === ds.id;
                return (
                  <div key={ds.id} style={{ display: "flex", alignItems: "center" }}>
                    <button
                      onClick={() => setActiveDataset(ds.id)}
                      style={{
                        fontSize: 12,
                        fontWeight: isSelected ? 900 : 600,
                        color: isSelected ? "#fff" : "#334155",
                        background: isSelected ? `linear-gradient(135deg, ${tt?.color || "#1e3a8a"}, ${tt?.color || "#3b82f6"}bb)` : "#ffffff",
                        padding: "7px 14px",
                        borderRadius: "8px 0 0 8px",
                        border: isSelected ? "none" : "1px solid #cbd5e1",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        boxShadow: isSelected ? "0 2px 8px rgba(30,58,138,0.25)" : "none",
                      }}
                    >
                      {tt?.icon || "📊"} {ds.name}
                    </button>
                    <button
                      onClick={() => handleDelete(ds.id)}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#ef4444",
                        background: "#fff",
                        padding: "7px 8px",
                        borderRadius: "0 8px 8px 0",
                        border: "1px solid #cbd5e1",
                        borderLeft: "none",
                        cursor: "pointer",
                      }}
                      title="Eliminar dataset"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Editor en Vivo de Datos para el Dataset Seleccionado */}
          {rawActiveDs ? (
            <section style={{ marginBottom: 20 }}>
              <EditableDataTable
                dataset={rawActiveDs}
                testType={activeTestType || undefined}
                jugadores={jugadores}
                onSave={handleUpdateDataset}
                onDelete={handleDelete}
              />
            </section>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 20px", background: "#fff", borderRadius: 12, border: "2px dashed #cbd5e1", color: "#94a3b8", marginBottom: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🍳</div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#64748b", margin: "0 0 4px" }}>No hay ningún dataset seleccionado para editar</p>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>Importa un archivo CSV o Excel a continuación o selecciona un dataset existente.</p>
            </div>
          )}

          {/* Import Section & Configuración */}
          <section style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "20px 24px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: "#0f172a" }}>📁 Importar nuevo archivo CSV / Excel (.xlsx)</h2>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b" }}>Carga nuevos archivos de peso, pliegues, sprints, CMJ o cualquier valoración física.</p>
              </div>
              <button onClick={() => fileInputRef.current?.click()} style={{ fontSize: 12, fontWeight: 800, color: "#fff", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", padding: "9px 22px", borderRadius: 8, border: "none", cursor: "pointer", boxShadow: "0 2px 8px rgba(99,102,241,0.3)", transition: "all 0.2s" }}
                onMouseOver={e => (e.currentTarget.style.transform = "translateY(-1px)")} onMouseOut={e => (e.currentTarget.style.transform = "translateY(0)")}>
                + Importar CSV / Excel
              </button>
            </div>

            {/* Test Types chips */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Tipos de test disponibles:</span>
              {testTypes.map(tt => (
                <div key={tt.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff", background: tt.color, padding: "4px 10px", borderRadius: tt.builtIn ? 12 : "12px 0 0 12px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {tt.icon} {tt.name} <span style={{ fontSize: 9, opacity: 0.8 }}>({tt.structure} - {tt.unit})</span>
                  </span>
                  {!tt.builtIn && (
                    <button onClick={() => deleteTestType(tt.id)} style={{ fontSize: 9, color: "#fff", background: tt.color, padding: "4px 7px", borderRadius: "0 12px 12px 0", border: "none", cursor: "pointer", opacity: 0.85 }} title="Eliminar tipo">✕</button>
                  )}
                </div>
              ))}
              <button onClick={() => setShowNewTypeForm(!showNewTypeForm)} style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", background: "#ede9fe", padding: "4px 12px", borderRadius: 12, border: "1px dashed #a78bfa", cursor: "pointer" }}>
                + Nuevo tipo de test
              </button>
            </div>

            {/* New type form */}
            {showNewTypeForm && (
              <div style={{ padding: "14px 18px", background: "#faf5ff", borderRadius: 10, border: "1px solid #e9d5ff", marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#6b21a8", display: "block", marginBottom: 3 }}>Nombre</label>
                  <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="Ej: CMJ, VO2..." style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 6, border: "1px solid #d8b4fe", outline: "none", width: 130 }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#6b21a8", display: "block", marginBottom: 3 }}>Estructura</label>
                  <select value={newTypeStructure} onChange={e => setNewTypeStructure(e.target.value as FileStructure)} style={{ fontSize: 11.5, padding: "5px 8px", borderRadius: 6, border: "1px solid #d8b4fe", outline: "none" }}>
                    <option value="D">D — Tabular (Fecha, Jugador, 6 Pliegues, Suma)</option>
                    <option value="A">A — Jugadores × Fechas</option>
                    <option value="B">B — Jugadores × Métricas</option>
                    <option value="C">C — Jugadores × Fechas (multi-valor)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#6b21a8", display: "block", marginBottom: 3 }}>Unidad</label>
                  <input value={newTypeUnit} onChange={e => setNewTypeUnit(e.target.value)} placeholder="kg, s, cm..." style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 6, border: "1px solid #d8b4fe", outline: "none", width: 70 }} />
                </div>
                <button onClick={addCustomType} style={{ fontSize: 11.5, fontWeight: 800, color: "#fff", background: "#7c3aed", padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer" }}>Crear tipo</button>
                <button onClick={() => setShowNewTypeForm(false)} style={{ fontSize: 11.5, fontWeight: 600, color: "#64748b", background: "#e2e8f0", padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer" }}>Cancelar</button>
              </div>
            )}

            {importError && <div style={{ marginTop: 10, fontSize: 12, color: "#dc2626", fontWeight: 700, padding: "8px 12px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>{importError}</div>}
            {importSuccess && <div style={{ marginTop: 10, fontSize: 12, color: "#16a34a", fontWeight: 700, padding: "8px 12px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0" }}>{importSuccess}</div>}
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* CAPA 3: REPORTS (Equipo e Individual — DUAL TEST)     */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeTab === "reports" && (
        <div>
          {/* Sub-selector de vista: Equipo | Individual */}
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
              onClick={() => setReportSubTab("equipo")}
              style={{
                flex: 1,
                padding: "8px 18px",
                borderRadius: "8px",
                border: "none",
                fontSize: "13px",
                fontWeight: 800,
                cursor: "pointer",
                textAlign: "center",
                background: reportSubTab === "equipo" ? "#1e3a8a" : "transparent",
                color: reportSubTab === "equipo" ? "#ffffff" : "#475569",
                boxShadow: reportSubTab === "equipo" ? "0 2px 6px rgba(30,58,138,0.25)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              👥 Report de Equipo
            </button>
            <button
              type="button"
              onClick={() => setReportSubTab("individual")}
              style={{
                flex: 1,
                padding: "8px 18px",
                borderRadius: "8px",
                border: "none",
                fontSize: "13px",
                fontWeight: 800,
                cursor: "pointer",
                textAlign: "center",
                background: reportSubTab === "individual" ? "#1e3a8a" : "transparent",
                color: reportSubTab === "individual" ? "#ffffff" : "#475569",
                boxShadow: reportSubTab === "individual" ? "0 2px 6px rgba(30,58,138,0.25)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              👤 Report Individual (Por Deportista)
            </button>
          </div>

          {/* BARRA DE SELECCIÓN DE AMBOS TESTS (DUAL TEST SELECTOR) */}
          {datasets.length > 0 && (
            <div
              className="no-print"
              style={{
                background: "#ffffff",
                padding: "14px 18px",
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                marginBottom: 18,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              {/* TEST 1 (PRINCIPAL) */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, fontWeight: 900, color: "#1e3a8a", textTransform: "uppercase" }}>
                  📊 Test 1 (Principal):
                </span>
                <select
                  value={activeDataset}
                  onChange={(e) => setActiveDataset(e.target.value)}
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1.5px solid #3b82f6",
                    background: "#eff6ff",
                    color: "#1e3a8a",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  {datasets.map((ds) => {
                    const tt = testTypes.find((t) => t.id === ds.testTypeId);
                    return (
                      <option key={ds.id} value={ds.id}>
                        {tt?.icon || "📊"} {ds.name} ({tt?.unit || "u"})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* BOTÓN INTERCAMBIAR TESTS */}
              {datasets.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const temp = activeDataset;
                    setActiveDataset(activeDataset2 || datasets[0].id);
                    setActiveDataset2(temp);
                  }}
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#475569",
                    background: "#f1f5f9",
                    border: "1px solid #cbd5e1",
                    padding: "5px 12px",
                    borderRadius: 8,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                  title="Intercambiar Test 1 y Test 2"
                >
                  ⇄ Intercambiar
                </button>
              )}

              {/* TEST 2 (COMPARATIVO / SIMULTÁNEO) */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, fontWeight: 900, color: "#7c3aed", textTransform: "uppercase" }}>
                  📈 Test 2 (Simultáneo / Comparativo):
                </span>
                <select
                  value={activeDataset2}
                  onChange={(e) => setActiveDataset2(e.target.value)}
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1.5px solid #8b5cf6",
                    background: "#faf5ff",
                    color: "#6b21a8",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="">— Ninguno (Ver solo Test 1) —</option>
                  {datasets.map((ds) => {
                    const tt = testTypes.find((t) => t.id === ds.testTypeId);
                    return (
                      <option key={ds.id} value={ds.id}>
                        {tt?.icon || "📊"} {ds.name} ({tt?.unit || "u"})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          )}

          {activeDs && stats ? (
            <>
              {/* ══════════════════════════════════════════════ */}
              {/* VISTA 1: REPORT DE EQUIPO                      */}
              {/* ══════════════════════════════════════════════ */}
              {reportSubTab === "equipo" && (
                <div>
                  {/* CABECERA ESTÁNDAR EQUIPO */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "#ffffff",
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      padding: "14px 20px",
                      marginBottom: 16,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <img
                        src={clubShield}
                        alt={activeTeam}
                        style={{ width: "36px", height: "42px", objectFit: "contain" }}
                      />
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
                          {activeTeam}
                        </div>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>
                          Report General del Equipo · Testing
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: "right", fontSize: "11.5px", color: "#475569" }}>
                      <div><span style={{ fontWeight: 800, color: "#0f172a" }}>Temporada:</span> {activeTemporada}</div>
                      <div><span style={{ fontWeight: 800, color: "#0f172a" }}>Fecha:</span> {new Date().toLocaleDateString("es-ES")}</div>
                    </div>
                  </div>

                  {/* ─── 1. GRÁFICOS DEL EQUIPO (PRIMERO) ─── */}
                  <div style={{ marginBottom: 20 }}>
                    {activeDs2 && stats2 ? (
                      /* AMBOS GRÁFICOS (UNO ENCIMA DE OTRO) */
                      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                        {/* GRÁFICO TEST 1 */}
                        <section style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #bfdbfe", padding: "18px 20px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <span style={{ fontSize: 11, fontWeight: 900, color: "#1e3a8a", background: "#eff6ff", border: "1px solid #bfdbfe", padding: "3px 8px", borderRadius: 6 }}>
                              TEST 1: {activeDs.name}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>
                              Media: <strong>{stats.lastAvg.toFixed(1)} {activeTestType?.unit}</strong>
                            </span>
                          </div>
                          {activeDs.structure === "B" ? (
                            <BarChart
                              title={`${activeDs.name} — Comparativa por métrica`}
                              metrics={activeDs.dates}
                              datasets={activeDs.players.map((p, i) => ({ name: p.name, values: p.values, color: CHART_COLORS[i % CHART_COLORS.length] }))}
                            />
                          ) : (() => {
                            const activeDateIndices = activeDs.dates.map((_, i) => i).filter(i => activeDs.players.some(p => p.values[i] !== null));
                            const filteredDates = activeDateIndices.map(i => activeDs.dates[i]);
                            const filteredDatasets = activeDs.players.map((p, pi) => ({
                              name: p.name,
                              values: activeDateIndices.map(i => p.values[i]),
                              color: CHART_COLORS[pi % CHART_COLORS.length],
                            }));
                            return (
                              <TestingEvolutionChart
                                title={`${activeDs.name} — Evolución del equipo`}
                                dates={filteredDates}
                                datasets={filteredDatasets}
                                unit={activeTestType?.unit || "u"}
                                height={340}
                              />
                            );
                          })()}
                        </section>

                        {/* GRÁFICO TEST 2 */}
                        <section style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #ddd6fe", padding: "18px 20px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <span style={{ fontSize: 11, fontWeight: 900, color: "#6b21a8", background: "#faf5ff", border: "1px solid #ddd6fe", padding: "3px 8px", borderRadius: 6 }}>
                              TEST 2: {activeDs2.name}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>
                              Media: <strong>{stats2.lastAvg.toFixed(1)} {activeTestType2?.unit}</strong>
                            </span>
                          </div>
                          {activeDs2.structure === "B" ? (
                            <BarChart
                              title={`${activeDs2.name} — Comparativa por métrica`}
                              metrics={activeDs2.dates}
                              datasets={activeDs2.players.map((p, i) => ({ name: p.name, values: p.values, color: CHART_COLORS[(i + 4) % CHART_COLORS.length] }))}
                            />
                          ) : (() => {
                            const activeDateIndices2 = activeDs2.dates.map((_, i) => i).filter(i => activeDs2.players.some(p => p.values[i] !== null));
                            const filteredDates2 = activeDateIndices2.map(i => activeDs2.dates[i]);
                            const filteredDatasets2 = activeDs2.players.map((p, pi) => ({
                              name: p.name,
                              values: activeDateIndices2.map(i => p.values[i]),
                              color: CHART_COLORS[(pi + 4) % CHART_COLORS.length],
                            }));
                            return (
                              <TestingEvolutionChart
                                title={`${activeDs2.name} — Evolución del equipo`}
                                dates={filteredDates2}
                                datasets={filteredDatasets2}
                                unit={activeTestType2?.unit || "u"}
                                height={340}
                              />
                            );
                          })()}
                        </section>
                      </div>
                    ) : (
                      /* UN SOLO GRÁFICO DE ANCHO COMPLETO */
                      <section style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
                        {activeDs.structure === "B" ? (
                          <BarChart
                            title={`${activeDs.name} — Comparativa por métrica`}
                            metrics={activeDs.dates}
                            datasets={activeDs.players.map((p, i) => ({ name: p.name, values: p.values, color: CHART_COLORS[i % CHART_COLORS.length] }))}
                          />
                        ) : (() => {
                          const activeDateIndices = activeDs.dates.map((_, i) => i).filter(i => activeDs.players.some(p => p.values[i] !== null));
                          const filteredDates = activeDateIndices.map(i => activeDs.dates[i]);
                          const filteredDatasets = activeDs.players.map((p, pi) => ({
                            name: p.name,
                            values: activeDateIndices.map(i => p.values[i]),
                            color: CHART_COLORS[pi % CHART_COLORS.length],
                          }));
                          return (
                            <TestingEvolutionChart
                              title={`${activeDs.name} — Evolución y mediciones del equipo`}
                              dates={filteredDates}
                              datasets={filteredDatasets}
                              unit={activeTestType?.unit || "kg"}
                            />
                          );
                        })()}
                      </section>
                    )}
                  </div>

                  {/* ─── 2. TABLAS DE DATOS DEL EQUIPO (DESPUÉS DEL GRÁFICO) ─── */}
                  {activeDs2 && stats2 ? (
                    /* TABLA COMPARATIVA COMBINADA DE AMBOS TESTS */
                    <section style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "20px 24px", marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "#0f172a" }}>
                          📋 Tabla Comparativa del Equipo — Ambos Tests Simultáneos
                        </h3>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>
                          {activeDs.name} ({activeTestType?.unit || "u"}) & {activeDs2.name} ({activeTestType2?.unit || "u"})
                        </span>
                      </div>

                      {(() => {
                        const lastDateIdx1 = activeDs.dates.length - 1;
                        const lastDateIdx2 = activeDs2.dates.length - 1;

                        // Unificar lista de todos los jugadores
                        const playerNamesSet = new Set([
                          ...activeDs.players.map(p => p.name),
                          ...activeDs2.players.map(p => p.name),
                        ]);

                        const combinedRoster = Array.from(playerNamesSet).map(name => {
                          const p1 = activeDs.players.find(p => p.name.toLowerCase() === name.toLowerCase());
                          const p2 = activeDs2.players.find(p => p.name.toLowerCase() === name.toLowerCase());

                          const v1 = p1 ? p1.values[lastDateIdx1] : null;
                          const prev1 = p1 && lastDateIdx1 > 0 ? p1.values[lastDateIdx1 - 1] : null;
                          const delta1 = v1 !== null && v1 !== undefined && prev1 !== null && prev1 !== undefined ? v1 - prev1 : null;

                          const v2 = p2 ? p2.values[lastDateIdx2] : null;
                          const prev2 = p2 && lastDateIdx2 > 0 ? p2.values[lastDateIdx2 - 1] : null;
                          const delta2 = v2 !== null && v2 !== undefined && prev2 !== null && prev2 !== undefined ? v2 - prev2 : null;

                          return { name, v1, delta1, v2, delta2 };
                        }).sort((a, b) => (b.v1 ?? -999) - (a.v1 ?? -999));

                        return (
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                              <thead>
                                <tr style={{ background: "#0f172a", color: "#fff" }}>
                                  <th style={{ padding: "9px 10px", textAlign: "center", width: 40 }}>#</th>
                                  <th style={{ padding: "9px 12px", textAlign: "left" }}>Deportista</th>
                                  <th style={{ padding: "9px 10px", textAlign: "center", background: "#1e3a8a" }}>
                                    {activeDs.name} ({activeTestType?.unit || "u"})
                                  </th>
                                  <th style={{ padding: "9px 10px", textAlign: "center", background: "#1e3a8a" }}>Δ vs Ant. (1)</th>
                                  <th style={{ padding: "9px 10px", textAlign: "center", background: "#581c87" }}>
                                    {activeDs2.name} ({activeTestType2?.unit || "u"})
                                  </th>
                                  <th style={{ padding: "9px 10px", textAlign: "center", background: "#581c87" }}>Δ vs Ant. (2)</th>
                                  <th style={{ padding: "9px 10px", textAlign: "center", width: 90 }}>Acción</th>
                                </tr>
                              </thead>
                              <tbody>
                                {combinedRoster.map((row, idx) => (
                                  <tr key={row.name} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                                    <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 800, color: idx < 3 ? "#d97706" : "#64748b" }}>
                                      {idx + 1}
                                    </td>
                                    <td style={{ padding: "7px 12px", fontWeight: 800, color: "#0f172a" }}>{row.name}</td>
                                    <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 800, color: row.v1 !== null ? "#1e3a8a" : "#94a3b8" }}>
                                      {row.v1 !== null && row.v1 !== undefined ? `${row.v1.toFixed(1)} ${activeTestType?.unit || undefined}` : "—"}
                                    </td>
                                    <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 700, color: row.delta1 === null ? "#94a3b8" : row.delta1 > 0 ? "#dc2626" : row.delta1 < 0 ? "#16a34a" : "#64748b" }}>
                                      {row.delta1 !== null ? (row.delta1 > 0 ? "+" : "") + row.delta1.toFixed(1) : "—"}
                                    </td>
                                    <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 800, color: row.v2 !== null ? "#7c3aed" : "#94a3b8" }}>
                                      {row.v2 !== null && row.v2 !== undefined ? `${row.v2.toFixed(1)} ${activeTestType2?.unit || undefined}` : "—"}
                                    </td>
                                    <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 700, color: row.delta2 === null ? "#94a3b8" : row.delta2 > 0 ? "#dc2626" : row.delta2 < 0 ? "#16a34a" : "#64748b" }}>
                                      {row.delta2 !== null ? (row.delta2 > 0 ? "+" : "") + row.delta2.toFixed(1) : "—"}
                                    </td>
                                    <td style={{ padding: "7px 10px", textAlign: "center" }}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedReportPlayer(row.name);
                                          setReportSubTab("individual");
                                        }}
                                        style={{
                                          fontSize: 10.5,
                                          fontWeight: 800,
                                          color: "#1e3a8a",
                                          background: "#eff6ff",
                                          border: "1px solid #bfdbfe",
                                          padding: "3px 8px",
                                          borderRadius: 4,
                                          cursor: "pointer",
                                        }}
                                      >
                                        Ver Ambos ➔
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </section>
                  ) : (
                    /* TABLA DE RANKING DE UN SOLO TEST */
                    <section style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "20px 24px", marginBottom: 16 }}>
                      <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
                        🏆 Ranking y Comparativa del Equipo — {activeDs.name}
                      </h3>
                      {(() => {
                        const lastDateIdx = activeDs.dates.length - 1;
                        const validPlayers = activeDs.players
                          .map((p) => {
                            const lastVal = p.values[lastDateIdx];
                            const prevVal = p.values[lastDateIdx - 1];
                            const delta = lastVal !== null && lastVal !== undefined && prevVal !== null && prevVal !== undefined ? lastVal - prevVal : null;
                            const diffMedia = lastVal !== null && lastVal !== undefined ? lastVal - stats.lastAvg : null;
                            return { ...p, lastVal, delta, diffMedia };
                          })
                          .filter((p) => p.lastVal !== null && p.lastVal !== undefined)
                          .sort((a, b) => (b.lastVal ?? 0) - (a.lastVal ?? 0));

                        return (
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                              <thead>
                                <tr style={{ background: "#1e3a8a", color: "#fff" }}>
                                  <th style={{ padding: "8px 10px", textAlign: "center", width: 40 }}>#</th>
                                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Deportista</th>
                                  <th style={{ padding: "8px 10px", textAlign: "center" }}>Último Valor ({activeTestType?.unit || "u"})</th>
                                  <th style={{ padding: "8px 10px", textAlign: "center" }}>Δ vs Anterior</th>
                                  <th style={{ padding: "8px 10px", textAlign: "center" }}>vs Media Equipo ({stats.lastAvg.toFixed(1)})</th>
                                  <th style={{ padding: "8px 10px", textAlign: "center", width: 90 }}>Acción</th>
                                </tr>
                              </thead>
                              <tbody>
                                {validPlayers.map((p, idx) => (
                                  <tr key={p.name} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                                    <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 800, color: idx < 3 ? "#d97706" : "#64748b" }}>{idx + 1}</td>
                                    <td style={{ padding: "6px 12px", fontWeight: 700, color: "#0f172a" }}>{p.name}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 800, color: "#1e3a8a" }}>
                                      {p.lastVal?.toFixed(1)} {activeTestType?.unit}
                                    </td>
                                    <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, color: p.delta === null ? "#94a3b8" : p.delta > 0 ? "#dc2626" : p.delta < 0 ? "#16a34a" : "#64748b" }}>
                                      {p.delta !== null ? (p.delta > 0 ? "+" : "") + p.delta.toFixed(1) : "—"}
                                    </td>
                                    <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, color: (p.diffMedia ?? 0) > 0 ? "#1e3a8a" : "#0284c7" }}>
                                      {p.diffMedia !== null ? (p.diffMedia > 0 ? "+" : "") + p.diffMedia.toFixed(1) : "—"}
                                    </td>
                                    <td style={{ padding: "6px 10px", textAlign: "center" }}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedReportPlayer(p.name);
                                          setReportSubTab("individual");
                                        }}
                                        style={{
                                          fontSize: 10.5,
                                          fontWeight: 800,
                                          color: "#1e3a8a",
                                          background: "#eff6ff",
                                          border: "1px solid #bfdbfe",
                                          padding: "3px 8px",
                                          borderRadius: 4,
                                          cursor: "pointer",
                                        }}
                                      >
                                        Ver Ficha ➔
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </section>
                  )}
                </div>
              )}

              {/* ══════════════════════════════════════════════ */}
              {/* VISTA 2: REPORT INDIVIDUAL (POR DEPORTISTA)    */}
              {/* ══════════════════════════════════════════════ */}
              {reportSubTab === "individual" && (() => {
                const currentPlayerName = selectedReportPlayer || activeDs.players[0]?.name || "";
                
                // Buscar datos del jugador (foto, posición) en la base de datos de deportistas
                let matchingPlayer: Jugador | null = null;
                const normCurrent = currentPlayerName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
                
                if (normCurrent) {
                  // Reglas explícitas
                  if (normCurrent.includes("puli") || normCurrent.includes("pulido")) {
                    matchingPlayer = jugadores.find((j) => {
                      const n = (j.nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                      const a = (j.apodo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                      return n.includes("puli") || n.includes("pulido") || a.includes("puli") || a.includes("pulido");
                    }) || null;
                  } else if (normCurrent.includes("badr")) {
                    matchingPlayer = jugadores.find((j) => {
                      const n = (j.nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                      const a = (j.apodo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                      return n.includes("badr") || a.includes("badr");
                    }) || null;
                  }

                  if (!matchingPlayer) {
                    // 1. Coincidencia exacta
                    matchingPlayer = jugadores.find((j) => {
                      const n = (j.nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
                      const a = (j.apodo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
                      return n === normCurrent || (a && a === normCurrent);
                    }) || null;
                  }

                  if (!matchingPlayer) {
                    // 2. Coincidencia estricta por palabras de al menos 3 letras
                    const inputWords = normCurrent.split(/\s+/).filter((w) => w.length >= 3);
                    if (inputWords.length > 0) {
                      matchingPlayer = jugadores.find((j) => {
                        const n = (j.nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
                        const a = (j.apodo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
                        const playerWords = `${n} ${a}`.split(/\s+/).filter((w) => w.length >= 3);
                        
                        let matchCount = 0;
                        for (const w of inputWords) {
                          if (playerWords.some((pw) => pw === w || pw.includes(w) || w.includes(pw))) matchCount++;
                        }
                        return matchCount >= inputWords.length;
                      }) || null;
                    }
                  }
                }
                const playerPhoto = matchingPlayer?.foto_url || null;
                const playerPosition = matchingPlayer?.posicion || null;

                // Lista completa unificada de deportistas para el selector
                const allPlayersList = Array.from(new Set([
                  ...datasets.flatMap(d => d.players.map(p => p.name)),
                  ...activeDs.players.map(p => p.name),
                  ...(activeDs2?.players.map(p => p.name) || []),
                ])).sort((a, b) => a.localeCompare(b));

                // 1. Identificar Datasets de Peso y Pliegues
                const pesoDs = (activeDs?.testTypeId === "peso" || activeDs?.name.toLowerCase().includes("peso") || activeDs?.name.toLowerCase().includes("weight"))
                  ? activeDs
                  : (activeDs2?.testTypeId === "peso" || activeDs2?.name.toLowerCase().includes("peso") || activeDs2?.name.toLowerCase().includes("weight"))
                  ? activeDs2
                  : datasets.find(d => d.testTypeId === "peso" || d.name.toLowerCase().includes("peso") || d.name.toLowerCase().includes("weight"));

                const plieguesDs = (activeDs?.structure === "D" || activeDs?.testTypeId === "pliegues" || activeDs?.name.toLowerCase().includes("pliegue"))
                  ? activeDs
                  : (activeDs2?.structure === "D" || activeDs2?.testTypeId === "pliegues" || activeDs2?.name.toLowerCase().includes("pliegue"))
                  ? activeDs2
                  : datasets.find(d => d.structure === "D" || d.testTypeId === "pliegues" || d.name.toLowerCase().includes("pliegue"));

                const pPeso = pesoDs?.players.find(p => p.name.toLowerCase().trim() === currentPlayerName.toLowerCase().trim());
                const pPliegues = plieguesDs?.players.find(p => p.name.toLowerCase().trim() === currentPlayerName.toLowerCase().trim());

                // 2. Definición de los 6 pliegues estándar ISAK
                const standard6Skinfolds = ["Tricipital", "Subescapular", "Suprailíaco", "Abdominal", "Cuádriceps", "Gemelo"];
                
                // Helper para buscar un pliegue por coincidencias flexibles (acentos, alias)
                const getSkinfoldVal = (metrics?: Record<string, number | null> | null, targetFold?: string): number | null => {
                  if (!metrics || !targetFold) return null;
                  const tf = targetFold.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                  
                  for (const [k, v] of Object.entries(metrics)) {
                    if (v === null || v === undefined || isNaN(v)) continue;
                    const lk = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    
                    if (tf.includes("tricip") && (lk.includes("tricip") || lk.includes("tricep"))) return v;
                    if (tf.includes("subesc") && lk.includes("subesc")) return v;
                    if ((tf.includes("supra") || tf.includes("iliac")) && (lk.includes("supra") || lk.includes("iliocrest") || lk.includes("iliac") || lk.includes("crest"))) return v;
                    if (tf.includes("abdom") && (lk.includes("abdom") || lk.includes("abfom"))) return v;
                    if (tf.includes("cuadr") && (lk.includes("cuadr") || lk.includes("muslo") || lk.includes("anterior"))) return v;
                    if (tf.includes("gemel") && (lk.includes("gemel") || lk.includes("pantorr") || lk.includes("medial"))) return v;
                    if (tf.includes("sum") && (lk.includes("sum") || lk.includes("total") || lk === "6")) return v;
                  }
                  return null;
                };

                // Obtener el año base de referencia de las fechas registradas
                const baseYear = (() => {
                  const allDatesList = [
                    ...(pesoDs?.dates || []),
                    ...(plieguesDs?.dates || []),
                    ...(plieguesDs?.tabularRows?.map(r => r.fecha) || []),
                  ];
                  for (const d of allDatesList) {
                    const ym = d?.match(/\b(20\d{2})\b/);
                    if (ym) return parseInt(ym[1], 10);
                  }
                  return 2026;
                })();

                // Helper para ordenar fechas cronológicamente de forma precisa
                const parseDateForSort = (dStr: string): number => {
                  if (!dStr) return 0;
                  const t = dStr.trim().toLowerCase();
                  
                  // Formato YYYY-MM-DD
                  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
                    const ts = new Date(t + "T12:00:00").getTime();
                    if (!isNaN(ts)) return ts;
                  }
                  // Formato DD/MM/YYYY o DD-MM-YYYY
                  const parts = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
                  if (parts) {
                    const day = parseInt(parts[1], 10);
                    const month = parseInt(parts[2], 10) - 1;
                    let year = parseInt(parts[3], 10);
                    if (year < 100) year += 2000;
                    const ts = new Date(year, month, day, 12).getTime();
                    if (!isNaN(ts)) return ts;
                  }
                  
                  // Caso específico: Agosto / Medición 1 (agosto) -> Situar siempre el 25 de agosto
                  if (t.includes("agost") || t.includes("medición 1") || t.includes("medicion 1")) {
                    const dayMatch = t.match(/\b(\d{1,2})\b/);
                    const day = (dayMatch && parseInt(dayMatch[1], 10) > 1 && parseInt(dayMatch[1], 10) <= 31) ? parseInt(dayMatch[1], 10) : 25;
                    return new Date(baseYear, 7, day, 12).getTime();
                  }

                  // Otros nombres de meses
                  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
                  for (let m = 0; m < months.length; m++) {
                    if (t.includes(months[m])) {
                      const numMatch = t.match(/\b(\d{1,2})\b/);
                      const day = numMatch ? Math.min(31, parseInt(numMatch[0], 10)) : (m === 7 ? 25 : 15);
                      const y = m < 6 ? baseYear + 1 : baseYear;
                      return new Date(y, m, day, 12).getTime();
                    }
                  }
                  
                  const numMatch = t.match(/\d+/);
                  if (numMatch) return parseInt(numMatch[0], 10);
                  return 0;
                };

                // Helper para etiqueta en la tabla de mediciones
                const getTableDateDisplay = (raw: string): string => {
                  if (!raw) return "";
                  const t = raw.trim().toLowerCase();
                  if (t.includes("agost") || t === "medición 1" || t === "medicion 1") {
                    return "Medición Agosto";
                  }
                  return formatDateShort(raw) || raw;
                };

                // Helper para etiqueta en el eje X del gráfico (sitúa en 25 ago)
                const getChartDateDisplay = (raw: string): string => {
                  if (!raw) return "";
                  const t = raw.trim().toLowerCase();
                  if (t.includes("agost") || t === "medición 1" || t === "medicion 1") {
                    return "25 ago";
                  }
                  return formatDateShort(raw) || raw;
                };

                // 3. Unificar todas las fechas individuales de pesajes y pliegues
                const uniqueDatesSet = new Set<string>();
                if (pesoDs) pesoDs.dates.forEach(d => { if (d) uniqueDatesSet.add(d); });
                if (plieguesDs) {
                  plieguesDs.dates.forEach(d => { if (d) uniqueDatesSet.add(d); });
                  if (plieguesDs.tabularRows) {
                    plieguesDs.tabularRows.forEach(r => { if (r.fecha) uniqueDatesSet.add(r.fecha); });
                  }
                }
                if (pPliegues?.metricsByDate) {
                  Object.keys(pPliegues.metricsByDate).forEach(d => { if (d) uniqueDatesSet.add(d); });
                }

                // Ordenar cronológicamente por fecha exacta
                const sortedAllDates = Array.from(uniqueDatesSet).sort((a, b) => {
                  return parseDateForSort(a) - parseDateForSort(b);
                });

                // Construcción de filas por fecha individual
                const dateRows = sortedAllDates.map((d) => {
                  // A) Peso en la fecha d
                  let pesoVal: number | null = null;
                  if (pesoDs && pPeso) {
                    let pIdx = pesoDs.dates.indexOf(d);
                    if (pIdx !== -1 && pPeso.values[pIdx] !== null && pPeso.values[pIdx] !== undefined) {
                      pesoVal = pPeso.values[pIdx];
                    } else {
                      const matchDate = pesoDs.dates.find(
                        pd => pd.toLowerCase().trim() === d.toLowerCase().trim() || formatDateShort(pd) === formatDateShort(d)
                      );
                      if (matchDate) {
                        const idx = pesoDs.dates.indexOf(matchDate);
                        if (idx !== -1 && pPeso.values[idx] !== null && pPeso.values[idx] !== undefined) {
                          pesoVal = pPeso.values[idx];
                        }
                      }
                    }
                  }

                  // B) Pliegues en la fecha d
                  const metricValues: Record<string, number | null> = {};
                  let sumaVal: number | null = null;

                  if (plieguesDs && pPliegues) {
                    // Buscar en tabularRows
                    if (plieguesDs.tabularRows) {
                      const matchRow = plieguesDs.tabularRows.find(
                        r => (r.fecha === d || r.fecha.toLowerCase().trim() === d.toLowerCase().trim()) &&
                             r.jugador.toLowerCase().trim() === currentPlayerName.toLowerCase().trim()
                      );
                      if (matchRow?.metrics) {
                        standard6Skinfolds.forEach(sf => {
                          const val = getSkinfoldVal(matchRow.metrics, sf);
                          if (val !== null) metricValues[sf] = val;
                        });
                        const dSuma = getSkinfoldVal(matchRow.metrics, "Suma") ?? matchRow.suma ?? null;
                        if (dSuma !== null) sumaVal = dSuma;
                      }
                    }

                    // Buscar en metricsByDate
                    if (pPliegues.metricsByDate) {
                      const dateMetrics = pPliegues.metricsByDate[d];
                      if (dateMetrics) {
                        standard6Skinfolds.forEach(sf => {
                          const val = getSkinfoldVal(dateMetrics, sf);
                          if (val !== null && metricValues[sf] === undefined) metricValues[sf] = val;
                        });
                        const dSuma = getSkinfoldVal(dateMetrics, "Suma");
                        if (dSuma !== null && sumaVal === null) sumaVal = dSuma;
                      }
                    }

                    // Buscar en plieguesDs.dates
                    const plIdx = plieguesDs.dates.indexOf(d);
                    if (plIdx !== -1 && pPliegues.values[plIdx] !== null && pPliegues.values[plIdx] !== undefined && sumaVal === null) {
                      sumaVal = pPliegues.values[plIdx];
                    }

                    // Calcular Suma si se tienen los 6 pliegues
                    if (sumaVal === null) {
                      const validFolds = standard6Skinfolds
                        .map(sf => metricValues[sf])
                        .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
                      if (validFolds.length >= 6) {
                        sumaVal = Number(validFolds.reduce((a, b) => a + b, 0).toFixed(1));
                      }
                    }
                  }

                  return {
                    rawDate: d,
                    dateLabel: getTableDateDisplay(d),
                    chartDateLabel: getChartDateDisplay(d),
                    pesoVal,
                    metricValues,
                    sumaVal,
                  };
                }).filter(r => r.pesoVal !== null || r.sumaVal !== null || Object.values(r.metricValues).some(v => v !== null));

                // Cálculo de deltas respecto al pesaje/pliegue anterior
                let prevPeso: number | null = null;
                let prevSuma: number | null = null;
                const processedAnthroRows = dateRows.map((r) => {
                  let deltaPeso: number | null = null;
                  if (r.pesoVal !== null) {
                    if (prevPeso !== null) {
                      deltaPeso = Number((r.pesoVal - prevPeso).toFixed(1));
                    }
                    prevPeso = r.pesoVal;
                  }

                  let deltaSuma: number | null = null;
                  if (r.sumaVal !== null) {
                    if (prevSuma !== null) {
                      deltaSuma = Number((r.sumaVal - prevSuma).toFixed(1));
                    }
                    prevSuma = r.sumaVal;
                  }

                  return {
                    ...r,
                    deltaPeso,
                    deltaSuma,
                  };
                });

                // Resúmenes estadísticos generales
                const validPesos = processedAnthroRows.map(r => r.pesoVal).filter((v): v is number => v !== null);
                const initialPeso = validPesos[0] ?? null;
                const latestPeso = validPesos[validPesos.length - 1] ?? null;
                const deltaPesoTotal = latestPeso !== null && initialPeso !== null ? Number((latestPeso - initialPeso).toFixed(1)) : null;

                const validSumas = processedAnthroRows.map(r => r.sumaVal).filter((v): v is number => v !== null);
                const initialSuma = validSumas[0] ?? null;
                const latestSuma = validSumas[validSumas.length - 1] ?? null;
                const deltaSumaTotal = latestSuma !== null && initialSuma !== null ? Number((latestSuma - initialSuma).toFixed(1)) : null;

                // Arrays para el gráfico doble eje
                const chartDates = processedAnthroRows.map(r => r.chartDateLabel);
                const chartPesos = processedAnthroRows.map(r => r.pesoVal);
                const chartPliegues = processedAnthroRows.map(r => r.sumaVal);

                // Tests adicionales si el dataset activo no es antropometría
                const isNonAnthroTest1 = activeDs && activeDs !== pesoDs && activeDs !== plieguesDs;
                const p1Other = isNonAnthroTest1 ? activeDs.players.find(p => p.name.toLowerCase().trim() === currentPlayerName.toLowerCase().trim()) : null;

                const handlePrintPDF = () => {
                  if (typeof window !== "undefined") {
                    window.print();
                  }
                };

                return (
                  <div>
                    {/* ESTILOS DE IMPRESIÓN PROFESIONAL PARA PDF */}
                    <style>{`
                      @media print {
                        @page {
                          size: A4 portrait;
                          margin: 10mm 12mm 10mm 12mm;
                        }
                        body {
                          background: #ffffff !important;
                          color: #000000 !important;
                          -webkit-print-color-adjust: exact !important;
                          print-color-adjust: exact !important;
                        }
                        .no-print, header, nav, footer, .sidebar {
                          display: none !important;
                        }
                        .report-print-container {
                          width: 100% !important;
                          max-width: 100% !important;
                          margin: 0 !important;
                          padding: 0 !important;
                          box-shadow: none !important;
                          border: none !important;
                          background: #ffffff !important;
                        }
                        .report-avoid-break {
                          break-inside: avoid !important;
                          page-break-inside: avoid !important;
                        }
                      }
                    `}</style>

                    {/* BARRA DE ACCIÓN Y SELECTOR (NO-PRINT) */}
                    <div
                      className="no-print"
                      style={{
                        background: "#ffffff",
                        padding: "12px 18px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                        marginBottom: 16,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 900, color: "#1e293b" }}>👤 Deportista:</span>
                        <select
                          value={currentPlayerName}
                          onChange={(e) => setSelectedReportPlayer(e.target.value)}
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            padding: "6px 14px",
                            borderRadius: 6,
                            border: "1.5px solid #cbd5e1",
                            background: "#f8fafc",
                            color: "#0f172a",
                            outline: "none",
                            cursor: "pointer",
                            minWidth: 220,
                          }}
                        >
                          {allPlayersList.map(name => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button
                          type="button"
                          onClick={handlePrintPDF}
                          style={{
                            background: "#0f172a",
                            color: "#ffffff",
                            border: "none",
                            padding: "8px 18px",
                            borderRadius: 6,
                            fontSize: "12px",
                            fontWeight: 800,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                          }}
                        >
                          📄 Exportar a PDF
                        </button>
                      </div>
                    </div>

                    {/* ══════════════════════════════════════════════════════════ */}
                    {/* CONTENEDOR PRINCIPAL DEL INFORME (ESTILO OFICIAL Y LIMPIO) */}
                    {/* ══════════════════════════════════════════════════════════ */}
                    <div
                      className="report-print-container"
                      style={{
                        background: "#ffffff",
                        borderRadius: 12,
                        border: "1px solid #e2e8f0",
                        padding: "24px 28px",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                      }}
                    >
                      {/* CABECERA ESTÁNDAR DEL CLUB (ESCUDO + TÍTULOS + METADATOS) */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "180px 1fr 180px",
                          alignItems: "center",
                          borderBottom: "2px solid #0f172a",
                          paddingBottom: "14px",
                          marginBottom: "16px",
                          gap: "12px",
                        }}
                      >
                        {/* Escudo a la Izquierda */}
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <img
                            src={clubShield}
                            alt={activeTeam}
                            style={{ width: "44px", height: "52px", objectFit: "contain" }}
                          />
                          <div>
                            <div style={{ fontSize: "12px", fontWeight: 900, color: "#0f172a", lineHeight: 1.1, textTransform: "uppercase" }}>
                              {activeTeam}
                            </div>
                            <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b" }}>
                              Preparació Física
                            </div>
                          </div>
                        </div>

                        {/* Título Central y Perfil del Jugador */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px" }}>
                          {playerPhoto && (
                            <img
                              src={playerPhoto || undefined}
                              alt={currentPlayerName}
                              style={{
                                width: "64px",
                                height: "76px",
                                borderRadius: "8px",
                                objectFit: "cover",
                                border: "1.5px solid #cbd5e1",
                                flexShrink: 0,
                                boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                                background: "#f1f5f9",
                              }}
                            />
                          )}
                          <div style={{ textAlign: playerPhoto ? "left" : "center" }}>
                            <div style={{ fontSize: "10px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>
                              Informe de Preparación Física
                            </div>
                            <h1 style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#0f172a", letterSpacing: "-0.01em", textTransform: "uppercase" }}>
                              VALORACIÓN INDIVIDUAL
                            </h1>
                            <div style={{ fontSize: "16px", fontWeight: 900, color: "#1e3a8a", marginTop: "4px", letterSpacing: "0.02em" }}>
                              {currentPlayerName.toUpperCase()}
                            </div>
                          </div>
                        </div>

                        {/* Metadatos a la Derecha */}
                        <div style={{ textAlign: "right", fontSize: "11px", color: "#475569" }}>
                          <div><span style={{ fontWeight: 800, color: "#0f172a" }}>Fecha:</span> {new Date().toLocaleDateString("es-ES")}</div>
                          <div><span style={{ fontWeight: 800, color: "#0f172a" }}>Temporada:</span> {activeTemporada}</div>
                          <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>{processedAnthroRows.length} sesiones registradas</div>
                        </div>
                      </div>

                      {/* FRANJA RESUMEN EJECUTIVA (SIN RECUADROS RECARGADOS) */}
                      <div
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: 8,
                          padding: "10px 16px",
                          marginBottom: 18,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 12,
                          fontSize: 12,
                        }}
                      >
                        {/* Resumen Peso */}
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <span style={{ fontWeight: 800, color: "#1e3a8a" }}>⚖️ PESO CORPORAL:</span>
                          <span>Último: <strong>{latestPeso != null && typeof latestPeso === "number" ? `${latestPeso.toFixed(1)} kg` : "—"}</strong></span>
                          <span style={{ color: "#64748b" }}>Inicial: {initialPeso != null && typeof initialPeso === "number" ? `${initialPeso.toFixed(1)} kg` : "—"}</span>
                          {deltaPesoTotal != null && typeof deltaPesoTotal === "number" && (
                            <span style={{ fontWeight: 800, color: deltaPesoTotal <= 0 ? "#15803d" : "#b91c1c" }}>
                              Δ Total: {deltaPesoTotal > 0 ? `+${deltaPesoTotal.toFixed(1)}` : `${deltaPesoTotal.toFixed(1)}`} kg
                            </span>
                          )}
                        </div>

                        {/* Divisor */}
                        <div style={{ width: 1, height: 16, background: "#cbd5e1" }} />

                        {/* Resumen Pliegues */}
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <span style={{ fontWeight: 800, color: "#92400e" }}>📐 ∑ 6 PLIEGUES:</span>
                          <span>Última: <strong>{latestSuma != null && typeof latestSuma === "number" ? `${latestSuma.toFixed(1)} mm` : "—"}</strong></span>
                          <span style={{ color: "#64748b" }}>Inicial: {initialSuma != null && typeof initialSuma === "number" ? `${initialSuma.toFixed(1)} mm` : "—"}</span>
                          {deltaSumaTotal != null && typeof deltaSumaTotal === "number" && (
                            <span style={{ fontWeight: 800, color: deltaSumaTotal <= 0 ? "#15803d" : "#b91c1c" }}>
                              Δ Total: {deltaSumaTotal > 0 ? `+${deltaSumaTotal.toFixed(1)}` : `${deltaSumaTotal.toFixed(1)}`} mm
                            </span>
                          )}
                        </div>
                      </div>

                      {/* ─── 1. GRÁFICO DOBLE EJE (PESO & PLIEGUES) ─── */}
                      <div className="report-avoid-break" style={{ marginBottom: 20 }}>
                        {chartDates.length > 0 ? (
                          <DualAxisPesoPlieguesChart
                            playerName={currentPlayerName}
                            dates={chartDates}
                            pesoValues={chartPesos}
                            plieguesValues={chartPliegues}
                            title={`Evolución Temporal: Peso (kg) & Pliegues (mm)`}
                            height={340}
                          />
                        ) : (
                          <div style={{ textAlign: "center", padding: "28px 20px", color: "#64748b", fontSize: "12px" }}>
                            No hay mediciones registradas de Peso o Pliegues para {currentPlayerName}.
                          </div>
                        )}
                      </div>

                      {/* ─── 2. TABLA CRONOLÓGICA DE MEDICIONES (DESGLOSE 6 PLIEGUES + SUMA) ─── */}
                      <div className="report-avoid-break">
                        <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <h3 style={{ margin: 0, fontSize: "12.5px", fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.2px" }}>
                            Registro Cronológico de Mediciones Antropométricas
                          </h3>
                          <span style={{ fontSize: "11px", color: "#64748b" }}>Valores en milímetros (mm) y kilogramos (kg)</span>
                        </div>

                        {processedAnthroRows.length > 0 ? (
                          <div style={{ overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: 6 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                              <thead>
                                <tr style={{ background: "#0f172a", color: "#ffffff" }}>
                                  <th style={{ padding: "8px 10px", textAlign: "left", minWidth: 105, fontWeight: 800 }}>Fecha / Sesión</th>
                                  <th style={{ padding: "8px 8px", textAlign: "center", background: "#1e3a8a", minWidth: 65, fontWeight: 900 }}>
                                    Peso (kg)
                                  </th>
                                  <th style={{ padding: "8px 6px", textAlign: "center", background: "#1e3a8a", minWidth: 55, fontWeight: 800 }}>
                                    Δ Peso
                                  </th>
                                  {standard6Skinfolds.map(sf => (
                                    <th key={sf} style={{ padding: "8px 6px", textAlign: "center", background: "#1e293b", minWidth: 62, fontWeight: 700 }}>
                                      {sf}
                                    </th>
                                  ))}
                                  <th style={{ padding: "8px 10px", textAlign: "center", background: "#b45309", minWidth: 80, fontWeight: 900 }}>
                                    ∑ Suma 6
                                  </th>
                                  <th style={{ padding: "8px 6px", textAlign: "center", background: "#b45309", minWidth: 55, fontWeight: 800 }}>
                                    Δ Suma
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {processedAnthroRows.map((row, idx) => {
                                  const isRedPeso = row.deltaPeso !== null && row.deltaPeso < 0;
                                  const isIncPeso = row.deltaPeso !== null && row.deltaPeso > 0;

                                  const isRedSuma = row.deltaSuma !== null && row.deltaSuma < 0;
                                  const isIncSuma = row.deltaSuma !== null && row.deltaSuma > 0;

                                  return (
                                    <tr
                                      key={`${row.rawDate}_${idx}`}
                                      style={{
                                        background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
                                        borderBottom: "1px solid #e2e8f0",
                                      }}
                                    >
                                      {/* Sesión */}
                                      <td style={{ padding: "7px 10px", fontWeight: 800, color: "#0f172a" }}>
                                        {row.dateLabel}
                                      </td>

                                      {/* Peso */}
                                      <td style={{ padding: "7px 8px", textAlign: "center", fontWeight: 900, color: "#1e3a8a", background: idx % 2 === 0 ? "#eff6ff" : "#dbeafe" }}>
                                        {row.pesoVal != null && typeof row.pesoVal === "number" ? `${row.pesoVal.toFixed(1)}` : "—"}
                                      </td>
                                      <td style={{ padding: "7px 6px", textAlign: "center", fontWeight: 800, color: row.deltaPeso == null ? "#94a3b8" : isRedPeso ? "#15803d" : isIncPeso ? "#b91c1c" : "#64748b" }}>
                                        {row.deltaPeso != null && typeof row.deltaPeso === "number" ? (row.deltaPeso > 0 ? `+${row.deltaPeso.toFixed(1)}` : `${row.deltaPeso.toFixed(1)}`) : "—"}
                                      </td>

                                      {/* 6 Pliegues Individuales */}
                                      {standard6Skinfolds.map(sf => {
                                        const val = row.metricValues[sf];
                                        return (
                                          <td key={sf} style={{ padding: "7px 6px", textAlign: "center" }}>
                                            <span style={{ fontWeight: 700, color: val != null && typeof val === "number" ? "#0f172a" : "#94a3b8" }}>
                                              {val != null && typeof val === "number" && !isNaN(val) ? val.toFixed(1) : "—"}
                                            </span>
                                          </td>
                                        );
                                      })}

                                      {/* Suma 6 Pliegues */}
                                      <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 900, color: "#92400e", background: idx % 2 === 0 ? "#fffbeb" : "#fef3c7" }}>
                                        {row.sumaVal != null && typeof row.sumaVal === "number" ? `${row.sumaVal.toFixed(1)}` : "—"}
                                      </td>
                                      <td style={{ padding: "7px 6px", textAlign: "center", fontWeight: 800, color: row.deltaSuma == null ? "#94a3b8" : isRedSuma ? "#15803d" : isIncSuma ? "#b91c1c" : "#64748b" }}>
                                        {row.deltaSuma != null && typeof row.deltaSuma === "number" ? (row.deltaSuma > 0 ? `+${row.deltaSuma.toFixed(1)}` : `${row.deltaSuma.toFixed(1)}`) : "—"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p style={{ color: "#64748b", margin: 0, textAlign: "center", padding: "16px 0", fontSize: "12px" }}>
                            No hay datos detallados para mostrar en la tabla.
                          </p>
                        )}
                      </div>

                      {/* ─── 3. SECCIÓN ADICIONAL PARA OTROS TESTS SI APLICA ─── */}
                      {isNonAnthroTest1 && p1Other && (
                        <div className="report-avoid-break" style={{ marginTop: 20 }}>
                          <h3 style={{ margin: "0 0 8px", fontSize: "12px", fontWeight: 800, color: "#0f172a", textTransform: "uppercase" }}>
                            Historial Adicional: {activeDs.name} — {p1Other.name}
                          </h3>
                          <div style={{ overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: 6 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                              <thead>
                                <tr style={{ background: "#1e3a8a", color: "#fff" }}>
                                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Fecha</th>
                                  <th style={{ padding: "6px 8px", textAlign: "center" }}>Valor ({activeTestType?.unit || undefined})</th>
                                  <th style={{ padding: "6px 8px", textAlign: "center" }}>Δ Anterior</th>
                                  <th style={{ padding: "6px 8px", textAlign: "center" }}>Media Equipo</th>
                                </tr>
                              </thead>
                              <tbody>
                                {activeDs.dates.map((d, di) => {
                                  const val = p1Other.values[di];
                                  const prevVal = di > 0 ? p1Other.values[di - 1] : null;
                                  const delta = val !== null && val !== undefined && prevVal !== null && prevVal !== undefined ? val - prevVal : null;
                                  const dayVals = activeDs.players.map(p => p.values[di]).filter((v): v is number => v !== null && v !== undefined);
                                  const dayAvg = dayVals.length > 0 ? dayVals.reduce((a, b) => a + b, 0) / dayVals.length : null;

                                  return (
                                    <tr key={d} style={{ background: di % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                                      <td style={{ padding: "5px 8px", fontWeight: 700, color: "#0f172a" }}>{activeDs.structure === "B" ? d : formatDateShort(d)}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "center", fontWeight: 800, color: val !== null ? "#1e3a8a" : "#cbd5e1" }}>
                                        {val !== null && val !== undefined ? `${val.toFixed(1)}` : "—"}
                                      </td>
                                      <td style={{ padding: "5px 8px", textAlign: "center", fontWeight: 700, color: delta === null ? "#94a3b8" : delta > 0 ? "#dc2626" : delta < 0 ? "#16a34a" : "#64748b" }}>
                                        {delta !== null ? (delta > 0 ? "+" : "") + delta.toFixed(1) : "—"}
                                      </td>
                                      <td style={{ padding: "5px 8px", textAlign: "center", color: "#64748b" }}>
                                        {dayAvg !== null ? dayAvg.toFixed(1) : "—"}
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
                  </div>
                );
              })()}
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "60px 20px", background: "#fff", borderRadius: 16, border: "2px dashed #cbd5e1", color: "#94a3b8" }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>📈</div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#64748b", margin: "0 0 8px" }}>No hay datos para generar el Report</p>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>Importa datasets en la pestaña Cocina para visualizar la evolución y gráficos.</p>
              <button
                type="button"
                onClick={() => setActiveTab("cocina")}
                style={{ background: "#1e3a8a", color: "#fff", border: "none", padding: "8px 20px", borderRadius: 8, fontSize: "12px", fontWeight: 800, cursor: "pointer" }}
              >
                🍳 Ir a Cocina / Importar
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}