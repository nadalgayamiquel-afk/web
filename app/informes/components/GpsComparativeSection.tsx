"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from "recharts";
import { getEffectiveRecord } from "@/app/lib/gpsTaskFilter";
import {
  ALL_GPS_VARIABLES,
  GpsVariableDef,
  GpsDerivedVariable,
  calculateGpsMetricValue,
  DEFAULT_FAVORITE_GPS_VARIABLES,
} from "@/app/lib/gpsVariables";

export interface JugadorRef {
  id: string;
  nombre: string;
  apodo: string | null;
  posicion: string | null;
  foto_url: string | null;
  cor_id?: string | null;
  dorsal?: number | string | null;
}

export interface GpsRecordRef {
  id: string;
  jugador_id: string;
  fecha: string;
  tipo_sesion?: string | null;
  match_day?: string | null;
  metricas?: Record<string, any> | null;
}

export interface WeekOptionRef {
  start: string;
  end: string;
  label: string;
  dates: string[];
}

interface GpsComparativeSectionProps {
  mode: "sesion" | "microciclo";
  clubName: string;
  clubShield: string;
  jugadores: JugadorRef[];
  initialJugadorId?: string;
  teamGpsRecords: GpsRecordRef[];
  // Modo Sesión
  availableDates?: string[];
  selectedDate?: string;
  // Modo Microciclo
  availableWeeks?: WeekOptionRef[];
  currentWeekStart?: string;
  // Metadata adicional
  planificacionDays?: any[];
  favoriteKeys: string[];
  derivedVariables?: GpsDerivedVariable[];
  allVariables?: GpsVariableDef[];
}


function getDatesInRange(startStr: string, endStr: string): string[] {
  if (!startStr || !endStr) return [];
  const [s, e] = startStr <= endStr ? [startStr, endStr] : [endStr, startStr];
  const list: string[] = [];
  let curr = new Date(s + "T12:00:00");
  const end = new Date(e + "T12:00:00");
  while (curr <= end) {
    list.push(curr.toISOString().split("T")[0]);
    curr.setDate(curr.getDate() + 1);
  }
  return list;
}


interface MiniCalendarModalProps {
  target: "A" | "B";
  initialStart: string;
  initialEnd: string;
  onApply: (start: string, end: string) => void;
  onClose: () => void;
  resolveDayInfo: (fecha: string) => { md: string; isMatch: boolean; rival?: string };
  teamGpsRecords: GpsRecordRef[];
  availableWeeks: WeekOptionRef[];
}

function MiniCalendarModal({
  target,
  initialStart,
  initialEnd,
  onApply,
  onClose,
  resolveDayInfo,
  teamGpsRecords,
  availableWeeks,
}: MiniCalendarModalProps) {
  const initDate = initialStart ? new Date(initialStart + "T12:00:00") : new Date();
  const [viewYear, setViewYear] = useState<number>(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initDate.getMonth()); // 0-indexed

  const [tempStart, setTempStart] = useState<string>(initialStart);
  const [tempEnd, setTempEnd] = useState<string>(initialEnd);

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const weekDays = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  // Generar cuadrícula de 42 días (6 semanas)
  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Lunes = 0, Domingo = 6
    const totalDaysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

    const cells: {
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      dayInfo: { md: string; isMatch: boolean; rival?: string };
      hasGps: boolean;
    }[] = [];

    // Días del mes anterior
    for (let i = startOffset - 1; i >= 0; i--) {
      const dNum = prevMonthDays - i;
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const mm = String(prevM + 1).padStart(2, "0");
      const dd = String(dNum).padStart(2, "0");
      const dStr = `${prevY}-${mm}-${dd}`;
      cells.push({
        dateStr: dStr,
        dayNum: dNum,
        isCurrentMonth: false,
        dayInfo: resolveDayInfo(dStr),
        hasGps: teamGpsRecords.some((r) => r.fecha === dStr),
      });
    }

    // Días del mes actual
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const mm = String(viewMonth + 1).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      const dStr = `${viewYear}-${mm}-${dd}`;
      cells.push({
        dateStr: dStr,
        dayNum: d,
        isCurrentMonth: true,
        dayInfo: resolveDayInfo(dStr),
        hasGps: teamGpsRecords.some((r) => r.fecha === dStr),
      });
    }

    // Días del mes siguiente para completar múltiplos de 7
    const remaining = (7 - (cells.length % 7)) % 7;
    const paddingCount = cells.length + remaining < 35 ? remaining + 7 : remaining;
    for (let nextD = 1; nextD <= paddingCount; nextD++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const mm = String(nextM + 1).padStart(2, "0");
      const dd = String(nextD).padStart(2, "0");
      const dStr = `${nextY}-${mm}-${dd}`;
      cells.push({
        dateStr: dStr,
        dayNum: nextD,
        isCurrentMonth: false,
        dayInfo: resolveDayInfo(dStr),
        hasGps: teamGpsRecords.some((r) => r.fecha === dStr),
      });
    }

    return cells;
  }, [viewYear, viewMonth, teamGpsRecords, resolveDayInfo]);

  const handleCellClick = (dateStr: string) => {
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(dateStr);
      setTempEnd("");
    } else {
      if (dateStr < tempStart) {
        setTempStart(dateStr);
        setTempEnd("");
      } else {
        setTempEnd(dateStr);
      }
    }
  };

  const formatDateDisplayLocal = (dStr: string) => {
    if (!dStr) return "-";
    const parts = dStr.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dStr;
  };

  const isThemeA = target === "A";
  const primaryColor = isThemeA ? "#1e3a8a" : "#ea580c";
  const lightBgColor = isThemeA ? "#eff6ff" : "#fff7ed";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "520px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
          border: `2px solid ${primaryColor}`,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del modal */}
        <div
          style={{
            background: primaryColor,
            color: "#ffffff",
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px" }}>📅</span>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 900, textTransform: "uppercase" }}>
                Seleccionar Microciclo ${target} (Del día al día)
              </h3>
            </div>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>
              Marca el día de inicio y el día de fin del microciclo para compararlo
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              color: "#ffffff",
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              fontSize: "14px",
              fontWeight: 900,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Leyenda explicativa: MD en rojo, tipos en gris debajo */}
        <div
          style={{
            background: "#f8fafc",
            padding: "8px 16px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
            fontSize: "11px",
            fontWeight: 700,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span style={{ color: "#dc2626", fontWeight: 900, fontSize: "13px" }}>🔴 MD</span>
              <span style={{ color: "#475569" }}>(Día de Partido en Rojo)</span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span style={{ color: "#64748b", fontWeight: 800 }}>MD-X</span>
              <span style={{ color: "#475569" }}>(Tipo MD en gris debajo)</span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span style={{ color: "#16a34a" }}>●</span>
              <span style={{ color: "#475569" }}>GPS</span>
            </span>
          </div>
        </div>

        {/* Barra de navegación de mes */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 18px",
            background: "#ffffff",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <button
            type="button"
            onClick={handlePrevMonth}
            style={{
              padding: "5px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              color: "#334155",
              fontSize: "12px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            ◀ Mes Anterior
          </button>

          <span style={{ fontSize: "15px", fontWeight: 900, color: "#0f172a" }}>
            {monthNames[viewMonth]} {viewYear}
          </span>

          <button
            type="button"
            onClick={handleNextMonth}
            style={{
              padding: "5px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              color: "#334155",
              fontSize: "12px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Mes Siguiente ▶
          </button>
        </div>

        {/* Cuadrícula de calendario */}
        <div style={{ padding: "10px 16px" }}>
          {/* Cabecera días de la semana */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "4px",
              textAlign: "center",
              marginBottom: "6px",
            }}
          >
            {weekDays.map((wd) => (
              <span key={wd} style={{ fontSize: "11px", fontWeight: 900, color: "#64748b" }}>
                {wd}
              </span>
            ))}
          </div>

          {/* Días del mes */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "4px",
            }}
          >
            {calendarCells.map((cell) => {
              const isStart = tempStart === cell.dateStr;
              const isEnd = tempEnd === cell.dateStr;
              const inRange =
                tempStart && tempEnd && cell.dateStr >= tempStart && cell.dateStr <= tempEnd;

              const isMatch = cell.dayInfo.isMatch;

              // Estilos de celda
              let bg = cell.isCurrentMonth ? "#ffffff" : "#f8fafc";
              let border = "1px solid #e2e8f0";
              let textColor = cell.isCurrentMonth ? (isMatch ? "#dc2626" : "#0f172a") : "#94a3b8";

              if (inRange) {
                bg = lightBgColor;
                border = `1px solid ${primaryColor}`;
              }
              if (isStart || isEnd) {
                bg = primaryColor;
                textColor = "#ffffff";
              }

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => handleCellClick(cell.dateStr)}
                  style={{
                    height: "56px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "1px",
                    borderRadius: isStart || isEnd ? "8px" : "6px",
                    border,
                    background: bg,
                    color: textColor,
                    cursor: "pointer",
                    position: "relative",
                    transition: "all 0.1s ease",
                    padding: "2px",
                  }}
                  title={`${cell.dateStr}${cell.dayInfo.md ? ` · [${cell.dayInfo.md}]` : ""}${isMatch ? " (Día de Partido)" : ""}`}
                >
                  {/* Indicador de GPS */}
                  {cell.hasGps && (
                    <span
                      style={{
                        position: "absolute",
                        top: "3px",
                        right: "4px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: isStart || isEnd ? "#86efac" : "#16a34a",
                      }}
                      title="Tiene datos GPS"
                    />
                  )}

                  {/* Número de día: en ROJO si es MD */}
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: isMatch || isStart || isEnd ? 900 : 700,
                      color: isStart || isEnd ? "#ffffff" : isMatch ? "#dc2626" : cell.isCurrentMonth ? "#0f172a" : "#94a3b8",
                      lineHeight: 1,
                    }}
                  >
                    {cell.dayNum}
                  </span>

                  {/* Tipo de MD en GRIS debajo del número */}
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: 800,
                      color: isStart || isEnd ? "rgba(255,255,255,0.9)" : "#64748b",
                      lineHeight: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    {cell.dayInfo.md || (isMatch ? "MD" : "—")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Semanas predefinidas (Atajos rápidos) */}
        {availableWeeks.length > 0 && (
          <div style={{ padding: "0 16px 8px 16px" }}>
            <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
              ⚡ O seleccionar semana completa:
            </span>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px", maxHeight: "64px", overflowY: "auto" }}>
              {availableWeeks.map((w) => (
                <button
                  key={w.start}
                  type="button"
                  onClick={() => {
                    setTempStart(w.start);
                    setTempEnd(w.end);
                  }}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "4px",
                    border: tempStart === w.start && tempEnd === w.end ? `1.5px solid ${primaryColor}` : "1px solid #cbd5e1",
                    background: tempStart === w.start && tempEnd === w.end ? lightBgColor : "#f8fafc",
                    color: tempStart === w.start && tempEnd === w.end ? primaryColor : "#334155",
                    fontSize: "10.5px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer con resumen y botón de aplicar */}
        <div
          style={{
            background: "#f8fafc",
            padding: "12px 18px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>
              Rango seleccionado:
            </span>
            <span style={{ fontSize: "12.5px", fontWeight: 900, color: primaryColor }}>
              {tempStart && tempEnd
                ? `Del ${formatDateDisplayLocal(tempStart)} al ${formatDateDisplayLocal(tempEnd)}`
                : tempStart
                ? `Inicio: ${formatDateDisplayLocal(tempStart)} (elige día de fin)`
                : "Haz clic en un día para iniciar"}
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "7px 14px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#64748b",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!tempStart || !tempEnd}
              onClick={() => {
                if (tempStart && tempEnd) {
                  onApply(tempStart, tempEnd);
                  onClose();
                }
              }}
              style={{
                padding: "7px 16px",
                borderRadius: "6px",
                border: "none",
                background: !tempStart || !tempEnd ? "#cbd5e1" : primaryColor,
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 800,
                cursor: !tempStart || !tempEnd ? "not-allowed" : "pointer",
                boxShadow: tempStart && tempEnd ? "0 2px 6px rgba(0,0,0,0.15)" : "none",
              }}
            >
              ✓ Aplicar a Microciclo ${target}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


function getSingleTaskMetrics(
  playerId: string,
  fecha: string,
  taskName: string,
  teamGpsRecords: GpsRecordRef[],
  activeVariables: GpsVariableDef[],
  derivedVariables: GpsDerivedVariable[]
): Record<string, number> {
  const result: Record<string, number> = {};
  if (!fecha || !taskName) return result;

  const isTeam = playerId === "TEAM";

  if (isTeam) {
    const sessionRecs = teamGpsRecords.filter((r) => r.fecha === fecha);
    if (sessionRecs.length === 0) return result;

    activeVariables.forEach((v) => {
      const values: number[] = [];
      sessionRecs.forEach((r) => {
        const t = (r.metricas?.tareas || []).find(
          (x: any) =>
            (x.nombre || x.task || x.tarea || x.name || "").trim().toLowerCase() ===
            taskName.trim().toLowerCase()
        );
        if (t) {
          const val = calculateGpsMetricValue(t, v.key, derivedVariables);
          if (val > 0) values.push(val);
        }
      });

      if (v.esPicoMaximo) {
        result[v.key] = values.length > 0 ? Math.max(...values, 0) : 0;
      } else {
        const sum = values.reduce((a, b) => a + b, 0);
        result[v.key] = values.length > 0 ? Math.round((sum / values.length) * 100) / 100 : 0;
      }
    });
  } else {
    const r = teamGpsRecords.find((rec) => rec.jugador_id === playerId && rec.fecha === fecha);
    if (!r) return result;

    const t = (r.metricas?.tareas || []).find(
      (x: any) =>
        (x.nombre || x.task || x.tarea || x.name || "").trim().toLowerCase() ===
        taskName.trim().toLowerCase()
    );

    activeVariables.forEach((v) => {
      result[v.key] = t ? calculateGpsMetricValue(t, v.key, derivedVariables) : 0;
    });
  }

  return result;
}

interface TaskPairState {
  id: string;
  sourceA: "A" | "B";
  taskA: string;
  sourceB: "A" | "B";
  taskB: string;
  isExpanded: boolean;
}

export default function GpsComparativeSection({
  mode,
  clubName,
  clubShield,
  jugadores,
  initialJugadorId,
  teamGpsRecords,
  availableDates = [],
  selectedDate,
  availableWeeks = [],
  currentWeekStart,
  planificacionDays = [],
  favoriteKeys,
  derivedVariables = [],
  allVariables = ALL_GPS_VARIABLES,
}: GpsComparativeSectionProps) {
  // ── 1. ESTADOS DE SUJETOS Y SESIONES/MICROCICLOS ──
  const initialPlayerId = initialJugadorId || (jugadores.length > 0 ? jugadores[0].id : "");

  // Elemento A
  const [jugadorIdA, setJugadorIdA] = useState<string>(initialPlayerId);
  const [dateA, setDateA] = useState<string>(() => {
    if (selectedDate && availableDates.includes(selectedDate)) return selectedDate;
    return availableDates.length > 0 ? availableDates[0] : "";
  });
  const [microRangeA, setMicroRangeA] = useState<{ start: string; end: string }>(() => {
    if (currentWeekStart && availableWeeks.some((w) => w.start === currentWeekStart)) {
      const w = availableWeeks.find((w) => w.start === currentWeekStart)!;
      return { start: w.start, end: w.end };
    }
    if (availableWeeks.length > 0) return { start: availableWeeks[0].start, end: availableWeeks[0].end };
    const today = new Date().toISOString().split("T")[0];
    return { start: today, end: today };
  });

  // Elemento B
  const [jugadorIdB, setJugadorIdB] = useState<string>(() => (initialPlayerId === "TEAM" ? "TEAM" : initialPlayerId));
  const [dateB, setDateB] = useState<string>(() => {
    if (availableDates.length > 1) return availableDates[1];
    return availableDates.length > 0 ? availableDates[0] : "";
  });
  const [microRangeB, setMicroRangeB] = useState<{ start: string; end: string }>(() => {
    if (availableWeeks.length > 1) return { start: availableWeeks[1].start, end: availableWeeks[1].end };
    if (availableWeeks.length > 0) return { start: availableWeeks[0].start, end: availableWeeks[0].end };
    const today = new Date().toISOString().split("T")[0];
    return { start: today, end: today };
  });

  // Estado para la ventana emergente de Mini Calendario ("A" | "B" | null)
  const [calendarModalTarget, setCalendarModalTarget] = useState<"A" | "B" | null>(null);

  useEffect(() => {
    if (initialJugadorId) {
      setJugadorIdA(initialJugadorId);
      if (initialJugadorId === "TEAM") {
        setJugadorIdB("TEAM");
      }
    }
  }, [initialJugadorId]);

  // ── 2. SELECCIÓN DE MÉTRICAS A COMPARAR (EXCLUSIVAMENTE FAVORITAS) ──
  const favoriteVariables = useMemo(() => {
    const keys = favoriteKeys && favoriteKeys.length > 0 ? favoriteKeys : DEFAULT_FAVORITE_GPS_VARIABLES;
    const list = allVariables.filter((v) => keys.includes(v.key));
    return list.length > 0 ? list : allVariables.slice(0, 10);
  }, [allVariables, favoriteKeys]);

  const [selectedMetricKeys, setSelectedMetricKeys] = useState<string[]>(() => {
    const keys = favoriteKeys && favoriteKeys.length > 0 ? favoriteKeys : DEFAULT_FAVORITE_GPS_VARIABLES;
    const initial = keys.filter((k) => allVariables.some((v) => v.key === k));
    return initial.length > 0 ? initial : DEFAULT_FAVORITE_GPS_VARIABLES;
  });

  // Modalidad de visualización de gráficos ("radar" = perfil radial destacado por defecto, "cards" = tarjetas individuales, "relative" = % variación)
  const [chartViewMode, setChartViewMode] = useState<"cards" | "relative" | "radar">("radar");

  // ── 3. DETECCIÓN DINÁMICA DE TAREAS Y SELECCIÓN MULTI-TAREA PARA CADA FECHA ──
  const getTasksForDate = (dateStr: string): string[] => {
    if (!dateStr || mode !== "sesion") return [];
    const recs = teamGpsRecords.filter((r) => r.fecha === dateStr);
    const taskSet = new Set<string>();
    recs.forEach((r) => {
      if (r.metricas && Array.isArray(r.metricas.tareas)) {
        r.metricas.tareas.forEach((t: any) => {
          const name = (t.nombre || t.task || t.tarea || t.name || "").trim();
          if (name && name.toLowerCase() !== "total") {
            taskSet.add(name);
          }
        });
      }
    });
    return Array.from(taskSet);
  };

  const tasksAvailableA = useMemo(() => getTasksForDate(dateA), [dateA, teamGpsRecords, mode]);
  const tasksAvailableB = useMemo(() => getTasksForDate(dateB), [dateB, teamGpsRecords, mode]);

  // Selección individual de tareas activadas para Sesión A y Sesión B (todas activas por defecto)
  const [selectedTasksA, setSelectedTasksA] = useState<string[]>(() => tasksAvailableA);
  const [selectedTasksB, setSelectedTasksB] = useState<string[]>(() => tasksAvailableB);

  // Sincronizar tareas al cambiar la fecha seleccionada
  const prevDateARef = React.useRef(dateA);
  useEffect(() => {
    if (prevDateARef.current !== dateA) {
      prevDateARef.current = dateA;
      setSelectedTasksA(tasksAvailableA);
    }
  }, [dateA, tasksAvailableA]);

  const prevDateBRef = React.useRef(dateB);
  useEffect(() => {
    if (prevDateBRef.current !== dateB) {
      prevDateBRef.current = dateB;
      setSelectedTasksB(tasksAvailableB);
    }
  }, [dateB, tasksAvailableB]);

  const toggleTaskA = (taskName: string) => {
    setSelectedTasksA((prev) =>
      prev.includes(taskName) ? prev.filter((t) => t !== taskName) : [...prev, taskName]
    );
  };

  const toggleTaskB = (taskName: string) => {
    setSelectedTasksB((prev) =>
      prev.includes(taskName) ? prev.filter((t) => t !== taskName) : [...prev, taskName]
    );
  };

  // ── ESTADO DE COMPARATIVAS POR PARES DE TAREAS (HASTA 5 TAREAS) ──
  const [taskPairs, setTaskPairs] = useState<TaskPairState[]>(() => {
    const list: TaskPairState[] = [];
    const count = Math.min(5, Math.max(tasksAvailableA.length, tasksAvailableB.length, 1));
    for (let i = 0; i < count; i++) {
      list.push({
        id: `pair_${i + 1}`,
        sourceA: "A",
        taskA: tasksAvailableA[i] || tasksAvailableA[0] || "",
        sourceB: "B",
        taskB: tasksAvailableB[i] || tasksAvailableB[0] || tasksAvailableA[i] || "",
        isExpanded: i === 0,
      });
    }
    return list;
  });

  // Sincronizar pares si cambian las tareas disponibles de la fecha
  useEffect(() => {
    if (mode === "sesion") {
      setTaskPairs((prev) => {
        const count = Math.min(5, Math.max(tasksAvailableA.length, tasksAvailableB.length, prev.length || 1));
        const next: TaskPairState[] = [];
        for (let i = 0; i < count; i++) {
          const existing = prev[i];
          const taskA =
            existing && tasksAvailableA.includes(existing.taskA)
              ? existing.taskA
              : tasksAvailableA[i] || tasksAvailableA[0] || "";
          const taskB =
            existing && tasksAvailableB.includes(existing.taskB)
              ? existing.taskB
              : tasksAvailableB[i] || tasksAvailableB[0] || tasksAvailableA[i] || "";
          next.push({
            id: existing ? existing.id : `pair_${i + 1}`,
            sourceA: existing ? existing.sourceA : "A",
            taskA,
            sourceB: existing ? existing.sourceB : "B",
            taskB,
            isExpanded: existing ? existing.isExpanded : i === 0,
          });
        }
        return next;
      });
    }
  }, [dateA, dateB, tasksAvailableA, tasksAvailableB, mode]);

  const handleTogglePairExpanded = (index: number) => {
    setTaskPairs((prev) =>
      prev.map((p, idx) => (idx === index ? { ...p, isExpanded: !p.isExpanded } : p))
    );
  };

  const handleToggleAllPairs = () => {
    const anyExpanded = taskPairs.some((p) => p.isExpanded);
    setTaskPairs((prev) => prev.map((p) => ({ ...p, isExpanded: !anyExpanded })));
  };

  const handleAddPair = () => {
    if (taskPairs.length >= 5) return;
    const newIdx = taskPairs.length;
    const taskA = tasksAvailableA[newIdx] || tasksAvailableA[0] || "";
    const taskB = tasksAvailableB[newIdx] || tasksAvailableB[0] || "";
    setTaskPairs((prev) => [
      ...prev,
      {
        id: `pair_${Date.now()}_${newIdx}`,
        sourceA: "A",
        taskA,
        sourceB: "B",
        taskB,
        isExpanded: true,
      },
    ]);
  };

  const handleRemovePair = (index: number) => {
    if (taskPairs.length <= 1) return;
    setTaskPairs((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdatePair = (index: number, updates: Partial<TaskPairState>) => {
    setTaskPairs((prev) =>
      prev.map((p, idx) => (idx === index ? { ...p, ...updates } : p))
    );
  };

  const handleSwapPair = (index: number) => {
    setTaskPairs((prev) =>
      prev.map((p, idx) => {
        if (idx !== index) return p;
        return {
          ...p,
          sourceA: p.sourceB,
          taskA: p.taskB,
          sourceB: p.sourceA,
          taskB: p.taskA,
        };
      })
    );
  };

  // ── 4. RESOLUCIÓN DE MATCH DAY Y JUGADORES ──
  const resolveDayInfo = (fecha: string): { md: string; isMatch: boolean; rival?: string } => {
    if (!fecha) return { md: "", isMatch: false };
    let md = "";
    let isMatch = false;
    let rival = "";

    try {
      if (planificacionDays && planificacionDays.length > 0) {
        const planItem = planificacionDays.find((d: any) => d && (d.fecha === fecha || d.id === fecha));
        if (planItem) {
          if (planItem.md && typeof planItem.md === "string" && planItem.md.trim()) {
            const clean = planItem.md.trim();
            md = /^[-+]?\d+\s*MD$/i.test(clean) ? `MD${clean.replace(/MD/i, "").trim()}` : clean;
          }
          if (planItem.rival) rival = planItem.rival;
          if (
            planItem.evento === "PARTIDO" ||
            planItem.tipo === "PARTIDO" ||
            planItem.resultado_partido ||
            rival ||
            (planItem.md && planItem.md.trim().toUpperCase() === "MD")
          ) {
            isMatch = true;
          }
        }
      }
      if (!md && typeof window !== "undefined") {
        const planKeys = ["planificacion_days_v5", "planificacion_days_v4", "planificacion_days_v2", "planificacion_days_v1"];
        for (const k of planKeys) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const days = JSON.parse(raw);
            const list = Array.isArray(days) ? days : Object.values(days);
            const found = list.find((d: any) => d && (d.fecha === fecha || d.id === fecha));
            if (found) {
              if (found.md && typeof found.md === "string" && found.md.trim()) {
                const clean = found.md.trim();
                md = /^[-+]?\d+\s*MD$/i.test(clean) ? `MD${clean.replace(/MD/i, "").trim()}` : clean;
              }
              if (found.rival) rival = found.rival;
              if (
                found.evento === "PARTIDO" ||
                found.tipo === "PARTIDO" ||
                found.resultado_partido ||
                rival ||
                (found.md && found.md.trim().toUpperCase() === "MD")
              ) {
                isMatch = true;
              }
              if (md) break;
            }
          }
        }
      }
    } catch {}

    if (!md) {
      const rec = teamGpsRecords.find((r) => r.fecha === fecha && r.match_day && r.match_day.trim());
      if (rec?.match_day) md = rec.match_day.trim();
    }

    if (!isMatch && md) {
      const upper = md.toUpperCase();
      if (upper === "MD" || upper === "MD0" || upper === "MATCH DAY" || upper.startsWith("PARTIDO")) {
        isMatch = true;
      }
    }

    return { md, isMatch, rival };
  };

  const resolveMatchDay = (fecha: string): string => {
    return resolveDayInfo(fecha).md || "MD";
  };

  const getPlayerInfo = (id: string): JugadorRef => {
    if (id === "TEAM") {
      return {
        id: "TEAM",
        nombre: "TEAM (avg)",
        apodo: "TEAM (avg)",
        posicion: "Equipo",
        foto_url: null,
      };
    }
    const found = jugadores.find((j) => j.id === id);
    if (found) return found;
    return {
      id,
      nombre: id,
      apodo: id,
      posicion: null,
      foto_url: null,
    };
  };

  const playerA = useMemo(() => getPlayerInfo(jugadorIdA), [jugadorIdA, jugadores]);
  const playerB = useMemo(() => getPlayerInfo(jugadorIdB), [jugadorIdB, jugadores]);

  const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr) return "-";
    const parts = dateStr.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  const getWeekInfo = (startStr: string): WeekOptionRef => {
    const found = availableWeeks.find((w) => w.start === startStr);
    if (found) return found;
    return {
      start: startStr,
      end: startStr,
      label: `Semana ${formatDateDisplay(startStr)}`,
      dates: [startStr],
    };
  };

  // Fechas activas para A y B
  const datesA = useMemo(() => {
    if (mode === "sesion") return dateA ? [dateA] : [];
    return getDatesInRange(microRangeA.start, microRangeA.end);
  }, [mode, dateA, microRangeA]);

  const datesB = useMemo(() => {
    if (mode === "sesion") return dateB ? [dateB] : [];
    return getDatesInRange(microRangeB.start, microRangeB.end);
  }, [mode, dateB, microRangeB]);

  // ── 5. CÁLCULO DE MÉTRICAS (CON FILTRO DE TAREAS ACTIVADAS Y MICROCICLOS DEL DÍA AL DÍA) ──
  const calculateEntityMetrics = (
    playerId: string,
    targetDates: string[],
    activeTasks: string[],
    allTasksForDate: string[]
  ): Record<string, number> => {
    const isTeam = playerId === "TEAM";
    const result: Record<string, number> = {};

    if (mode === "sesion") {
      const fecha = targetDates[0];
      if (!fecha) return result;

      if (isTeam) {
        const sessionRecs = teamGpsRecords.filter((r) => r.fecha === fecha);
        if (sessionRecs.length === 0) return result;

        const filteredRecs = sessionRecs.map((r) =>
          getEffectiveRecord(r, activeTasks, allTasksForDate, derivedVariables)
        );

        allVariables.forEach((v) => {
          const values: number[] = [];
          filteredRecs.forEach((r) => {
            const val = calculateGpsMetricValue(r?.metricas, v.key, derivedVariables);
            if (val > 0) values.push(val);
          });

          if (v.esPicoMaximo) {
            result[v.key] = values.length > 0 ? Math.max(...values, 0) : 0;
          } else {
            const sum = values.reduce((a, b) => a + b, 0);
            result[v.key] = values.length > 0 ? Math.round((sum / values.length) * 100) / 100 : 0;
          }
        });
      } else {
        const r = teamGpsRecords.find((rec) => rec.jugador_id === playerId && rec.fecha === fecha);
        if (!r) return result;

        const filteredRecord = getEffectiveRecord(r, activeTasks, allTasksForDate, derivedVariables);

        allVariables.forEach((v) => {
          result[v.key] = filteredRecord
            ? calculateGpsMetricValue(filteredRecord.metricas, v.key, derivedVariables)
            : 0;
        });
      }
    } else {
      // MODO MICROCICLO: Del día al día
      if (!targetDates || targetDates.length === 0) return result;

      if (isTeam) {
        const weekRecords = teamGpsRecords.filter((r) => targetDates.includes(r.fecha));
        const uniquePlayers = Array.from(new Set(weekRecords.map((r) => r.jugador_id)));
        if (uniquePlayers.length === 0) return result;

        allVariables.forEach((v) => {
          if (v.esPicoMaximo) {
            const vals = weekRecords.map((r) => calculateGpsMetricValue(r.metricas, v.key, derivedVariables));
            result[v.key] = vals.length > 0 ? Math.max(...vals, 0) : 0;
          } else {
            let totalPlayerSums = 0;
            uniquePlayers.forEach((pId) => {
              const pRecs = weekRecords.filter((r) => r.jugador_id === pId);
              const pSum = pRecs.reduce((acc, r) => acc + calculateGpsMetricValue(r.metricas, v.key, derivedVariables), 0);
              totalPlayerSums += pSum;
            });
            result[v.key] = Math.round((totalPlayerSums / uniquePlayers.length) * 100) / 100;
          }
        });
      } else {
        const playerRecs = teamGpsRecords.filter((r) => r.jugador_id === playerId && targetDates.includes(r.fecha));
        allVariables.forEach((v) => {
          if (v.esPicoMaximo) {
            const vals = playerRecs.map((r) => calculateGpsMetricValue(r.metricas, v.key, derivedVariables));
            result[v.key] = vals.length > 0 ? Math.max(...vals, 0) : 0;
          } else {
            const sum = playerRecs.reduce((acc, r) => acc + calculateGpsMetricValue(r.metricas, v.key, derivedVariables), 0);
            result[v.key] = Math.round(sum * 100) / 100;
          }
        });
      }
    }

    return result;
  };

  const metricsA = useMemo(
    () => calculateEntityMetrics(jugadorIdA, datesA, selectedTasksA, tasksAvailableA),
    [jugadorIdA, datesA, selectedTasksA, tasksAvailableA, mode, teamGpsRecords, allVariables, derivedVariables]
  );

  const metricsB = useMemo(
    () => calculateEntityMetrics(jugadorIdB, datesB, selectedTasksB, tasksAvailableB),
    [jugadorIdB, datesB, selectedTasksB, tasksAvailableB, mode, teamGpsRecords, allVariables, derivedVariables]
  );

  // ── 6. LISTA DE MÉTRICAS FILTRADAS / SELECCIONADAS (SOLO FAVORITAS) ──
  const activeVariables = useMemo(() => {
    return favoriteVariables.filter((v) => selectedMetricKeys.includes(v.key));
  }, [favoriteVariables, selectedMetricKeys]);

  const toggleMetric = (key: string) => {
    setSelectedMetricKeys((prev) => {
      if (prev.includes(key)) {
        if (prev.length <= 1) return prev; // Mantener al menos 1
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  };

  const handleSelectAllFavorites = () => {
    setSelectedMetricKeys(favoriteVariables.map((v) => v.key));
  };

  const handleSelectNone = () => {
    if (favoriteVariables.length > 0) {
      setSelectedMetricKeys([favoriteVariables[0].key]);
    }
  };

  // ── 7. INTERCAMBIO RÁPIDO ⇄ ──
  const handleSwap = () => {
    const tempP = jugadorIdA;
    setJugadorIdA(jugadorIdB);
    setJugadorIdB(tempP);

    if (mode === "sesion") {
      const tempD = dateA;
      setDateA(dateB);
      setDateB(tempD);

      const tempTasks = selectedTasksA;
      setSelectedTasksA(selectedTasksB);
      setSelectedTasksB(tempTasks);
    } else {
      const tempR = microRangeA;
      setMicroRangeA(microRangeB);
      setMicroRangeB(tempR);
    }
  };

  // Nombres cortos para etiquetas y leyendas
  const shortNameA = playerA.apodo || playerA.nombre.split(" ")[0] || "A";
  const shortNameB = playerB.apodo || playerB.nombre.split(" ")[0] || "B";

  const subLabelA = useMemo(() => {
    if (mode === "sesion") {
      let taskStr = "";
      if (tasksAvailableA.length > 0) {
        if (selectedTasksA.length === tasksAvailableA.length) {
          taskStr = " · [Todas las tareas]";
        } else if (selectedTasksA.length === 0) {
          taskStr = " · [Sin tareas activas]";
        } else if (selectedTasksA.length === 1) {
          taskStr = ` · [${selectedTasksA[0]}]`;
        } else {
          taskStr = ` · [${selectedTasksA.length}/${tasksAvailableA.length} tareas]`;
        }
      }
      return `${formatDateDisplay(dateA)} (${resolveMatchDay(dateA)})${taskStr}`;
    }
    const mdStart = resolveMatchDay(microRangeA.start);
    const mdEnd = resolveMatchDay(microRangeA.end);
    const mdTag = mdStart || mdEnd ? ` (${mdStart} a ${mdEnd})` : "";
    return `Del ${formatDateDisplay(microRangeA.start)} al ${formatDateDisplay(microRangeA.end)}${mdTag}`;
  }, [mode, dateA, selectedTasksA, tasksAvailableA, microRangeA]);

  const subLabelB = useMemo(() => {
    if (mode === "sesion") {
      let taskStr = "";
      if (tasksAvailableB.length > 0) {
        if (selectedTasksB.length === tasksAvailableB.length) {
          taskStr = " · [Todas las tareas]";
        } else if (selectedTasksB.length === 0) {
          taskStr = " · [Sin tareas activas]";
        } else if (selectedTasksB.length === 1) {
          taskStr = ` · [${selectedTasksB[0]}]`;
        } else {
          taskStr = ` · [${selectedTasksB.length}/${tasksAvailableB.length} tareas]`;
        }
      }
      return `${formatDateDisplay(dateB)} (${resolveMatchDay(dateB)})${taskStr}`;
    }
    const mdStart = resolveMatchDay(microRangeB.start);
    const mdEnd = resolveMatchDay(microRangeB.end);
    const mdTag = mdStart || mdEnd ? ` (${mdStart} a ${mdEnd})` : "";
    return `Del ${formatDateDisplay(microRangeB.start)} al ${formatDateDisplay(microRangeB.end)}${mdTag}`;
  }, [mode, dateB, selectedTasksB, tasksAvailableB, microRangeB]);

  // ── 8. DATASETS PARA LOS GRÁFICOS ──
  // Radar data (normalizado a escala 0-100 para comparar perfiles)
  const radarData = useMemo(() => {
    return activeVariables.slice(0, 10).map((v) => {
      const valA = metricsA[v.key] ?? 0;
      const valB = metricsB[v.key] ?? 0;
      const maxVal = Math.max(valA, valB, 0.001);
      return {
        subject: v.shortLabel || v.label,
        A: Math.round((valA / maxVal) * 100),
        B: Math.round((valB / maxVal) * 100),
        fullMark: 100,
        rawA: valA,
        rawB: valB,
        unit: v.unit,
      };
    });
  }, [activeVariables, metricsA, metricsB]);

  // Relative difference chart data (% variación de B respecto a A)
  const relativeChartData = useMemo(() => {
    return activeVariables.map((v) => {
      const valA = metricsA[v.key] ?? 0;
      const valB = metricsB[v.key] ?? 0;
      const pct = valA > 0 ? Math.round(((valB - valA) / valA) * 1000) / 10 : (valB > 0 ? 100 : 0);
      return {
        name: v.shortLabel || v.label,
        variacion: pct,
        valA,
        valB,
        unit: v.unit,
      };
    });
  }, [activeVariables, metricsA, metricsB]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* ── CABECERA OFICIAL DEL INFORME (IMPRIMIBLE) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: "16px",
          alignItems: "center",
          borderBottom: "2px solid #0f172a",
          paddingBottom: "10px",
        }}
      >
        {/* Izquierda: Escudo y Club */}
        <div style={{ justifySelf: "start", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", minWidth: "75px" }}>
          <img
            src={clubShield || "/ce-europa.png"}
            alt={clubName}
            style={{ width: "46px", height: "54px", objectFit: "contain", background: "#ffffff", borderRadius: "6px", padding: "2px" }}
          />
          <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap" }}>
            {clubName}
          </span>
        </div>

        {/* Centro: Título Oficial */}
        <div style={{ justifySelf: "center", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 900, background: "#ea580c", color: "#ffffff", padding: "2px 8px", borderRadius: "12px", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              ANÁLISIS COMPARATIVO
            </span>
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: 900, color: "#0f172a", margin: "4px 0 0 0", textTransform: "uppercase", letterSpacing: "0.02em" }}>
            {mode === "sesion" ? "COMPARATIVA GPS DE SESIÓN Y TAREAS" : "COMPARATIVA GPS DE MICROCICLOS"}
          </h2>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#475569" }}>
            {mode === "sesion"
              ? "Comparación cruzada entre sesiones completas o tareas específicas de entrenamiento"
              : "Comparación semanal entre microciclos de temporada"}
          </span>
        </div>

        {/* Derecha: Botón Exportar PDF */}
        <div style={{ justifySelf: "end", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
          <button
            type="button"
            onClick={() => window.print()}
            className="no-print"
            style={{
              padding: "7px 14px",
              borderRadius: "8px",
              background: "#1e3a8a",
              color: "#ffffff",
              fontSize: "12px",
              fontWeight: 800,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 6px rgba(30, 58, 138, 0.25)",
            }}
          >
            <span>🖨️</span> Exportar a PDF / Imprimir
          </button>
          <span className="print-only" style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 700 }}>
            {new Date().toLocaleDateString("es-ES")}
          </span>
        </div>
      </div>

      {/* ── BARRA DE CONTROL HORIZONTAL INTEGRADA (SIN CAJONES) (NO-PRINT) ── */}
      <div
        className="no-print"
        style={{
          background: "#ffffff",
          borderRadius: "10px",
          padding: "14px 18px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {/* Barra superior de Presets rápidos */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              ⚡ Atajos Rápidos:
            </span>
            <button
              type="button"
              onClick={() => setJugadorIdB(jugadorIdA)}
              style={{
                padding: "3px 8px",
                borderRadius: "5px",
                border: jugadorIdA === jugadorIdB ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
                background: jugadorIdA === jugadorIdB ? "#eff6ff" : "#f8fafc",
                color: jugadorIdA === jugadorIdB ? "#1e3a8a" : "#475569",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Mismo Jugador
            </button>
            <button
              type="button"
              onClick={() => {
                if (mode === "sesion") setDateB(dateA);
                else setMicroRangeB({ ...microRangeA });
              }}
              style={{
                padding: "3px 8px",
                borderRadius: "5px",
                border: (mode === "sesion" ? dateA === dateB : (microRangeA.start === microRangeB.start && microRangeA.end === microRangeB.end)) ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
                background: (mode === "sesion" ? dateA === dateB : (microRangeA.start === microRangeB.start && microRangeA.end === microRangeB.end)) ? "#eff6ff" : "#f8fafc",
                color: (mode === "sesion" ? dateA === dateB : (microRangeA.start === microRangeB.start && microRangeA.end === microRangeB.end)) ? "#1e3a8a" : "#475569",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Misma Fecha/Rango
            </button>
            {mode === "sesion" && tasksAvailableA.length > 0 && tasksAvailableB.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const matching = tasksAvailableB.filter((t) => selectedTasksA.includes(t));
                  setSelectedTasksB(matching.length > 0 ? matching : [...tasksAvailableB]);
                }}
                style={{
                  padding: "3px 8px",
                  borderRadius: "5px",
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  color: "#475569",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
                title="Sincronizar tareas activadas de Sesión A a Sesión B"
              >
                Mismas Tareas
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setJugadorIdA("TEAM");
                setJugadorIdB("TEAM");
              }}
              style={{
                padding: "3px 9px",
                borderRadius: "5px",
                border: (jugadorIdA === "TEAM" && jugadorIdB === "TEAM") ? "1.5px solid #1e3a8a" : "1px solid #cbd5e1",
                background: (jugadorIdA === "TEAM" && jugadorIdB === "TEAM") ? "#dbeafe" : "#f8fafc",
                color: (jugadorIdA === "TEAM" && jugadorIdB === "TEAM") ? "#1e3a8a" : "#475569",
                fontSize: "11px",
                fontWeight: (jugadorIdA === "TEAM" && jugadorIdB === "TEAM") ? 800 : 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
              title="Comparar el equipo entero (TEAM avg) entre ambas sesiones o microciclos"
            >
              <span>👥</span> TEAM (avg) vs TEAM (avg)
            </button>
            <button
              type="button"
              onClick={() => {
                if (jugadorIdA === "TEAM" && jugadores.length > 0) {
                  setJugadorIdA(jugadores[0].id);
                }
                setJugadorIdB("TEAM");
              }}
              style={{
                padding: "3px 8px",
                borderRadius: "5px",
                border: (jugadorIdA !== "TEAM" && jugadorIdB === "TEAM") ? "1.5px solid #1e3a8a" : "1px solid #cbd5e1",
                background: (jugadorIdA !== "TEAM" && jugadorIdB === "TEAM") ? "#eff6ff" : "#f8fafc",
                color: (jugadorIdA !== "TEAM" && jugadorIdB === "TEAM") ? "#1e3a8a" : "#475569",
                fontSize: "11px",
                fontWeight: (jugadorIdA !== "TEAM" && jugadorIdB === "TEAM") ? 800 : 700,
                cursor: "pointer",
              }}
              title="Comparar el jugador seleccionado contra la media del equipo (TEAM avg)"
            >
              vs TEAM (avg)
            </button>
          </div>
        </div>

        {/* Fila compacta de selección A vs B */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: "12px",
            alignItems: "center",
            background: "#f8fafc",
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
          }}
        >
          {/* LADO A */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span
              style={{
                background: "#1e3a8a",
                color: "#ffffff",
                padding: "4px 8px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 900,
                letterSpacing: "0.03em",
                whiteSpace: "nowrap",
              }}
            >
              ● SUJETO A
            </span>

            {/* Jugador A */}
            <select
              value={jugadorIdA}
              onChange={(e) => setJugadorIdA(e.target.value)}
              style={{
                flex: "1 1 140px",
                padding: "6px 8px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                fontSize: "12px",
                fontWeight: 700,
                color: "#0f172a",
                outline: "none",
              }}
            >
              <option value="TEAM" style={{ fontWeight: 800, color: "#1e3a8a" }}>👥 TEAM (avg) · Media del Equipo</option>
              {jugadores.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.dorsal ? `#${j.dorsal} ` : ""}{j.apodo || j.nombre}
                </option>
              ))}
            </select>

            {/* Fecha o Semana A */}
            {mode === "sesion" ? (
              <select
                value={dateA}
                onChange={(e) => setDateA(e.target.value)}
                style={{
                  flex: "1 1 130px",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#0f172a",
                  outline: "none",
                }}
              >
                {availableDates.map((f) => (
                  <option key={f} value={f}>
                    {formatDateDisplay(f)} ({resolveMatchDay(f)})
                  </option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                onClick={() => setCalendarModalTarget("A")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1.5px solid #1e3a8a",
                  background: "#eff6ff",
                  color: "#1e3a8a",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
                title="Abrir mini calendario para marcar del día al día el Microciclo A"
              >
                <span>📅</span>
                <span>Del {formatDateDisplay(microRangeA.start)} al {formatDateDisplay(microRangeA.end)}</span>
                <span style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 700 }}>✏️ Modificar</span>
              </button>
            )}


          </div>

          {/* BOTÓN SWAP ⇄ */}
          <button
            type="button"
            onClick={handleSwap}
            title="Intercambiar Sujeto A ⇄ Sujeto B"
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "50%",
              background: "#ffffff",
              border: "1.5px solid #cbd5e1",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "15px",
              fontWeight: 900,
              color: "#334155",
              cursor: "pointer",
            }}
          >
            ⇄
          </button>

          {/* LADO B */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span
              style={{
                background: "#ea580c",
                color: "#ffffff",
                padding: "4px 8px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 900,
                letterSpacing: "0.03em",
                whiteSpace: "nowrap",
              }}
            >
              ● SUJETO B
            </span>

            {/* Jugador B */}
            <select
              value={jugadorIdB}
              onChange={(e) => setJugadorIdB(e.target.value)}
              style={{
                flex: "1 1 140px",
                padding: "6px 8px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                fontSize: "12px",
                fontWeight: 700,
                color: "#0f172a",
                outline: "none",
              }}
            >
              <option value="TEAM" style={{ fontWeight: 800, color: "#ea580c" }}>👥 TEAM (avg) · Media del Equipo</option>
              {jugadores.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.dorsal ? `#${j.dorsal} ` : ""}{j.apodo || j.nombre}
                </option>
              ))}
            </select>

            {/* Fecha o Semana B */}
            {mode === "sesion" ? (
              <select
                value={dateB}
                onChange={(e) => setDateB(e.target.value)}
                style={{
                  flex: "1 1 130px",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#0f172a",
                  outline: "none",
                }}
              >
                {availableDates.map((f) => (
                  <option key={f} value={f}>
                    {formatDateDisplay(f)} ({resolveMatchDay(f)})
                  </option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                onClick={() => setCalendarModalTarget("B")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1.5px solid #ea580c",
                  background: "#fff7ed",
                  color: "#c2410c",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
                title="Abrir mini calendario para marcar del día al día el Microciclo B"
              >
                <span>📅</span>
                <span>Del {formatDateDisplay(microRangeB.start)} al {formatDateDisplay(microRangeB.end)}</span>
                <span style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 700 }}>✏️ Modificar</span>
              </button>
            )}


          </div>
        </div>

        {/* ── ACTIVACIÓN INDIVIDUAL DE TAREAS PARA SESIÓN A Y SESIÓN B ── */}
        {mode === "sesion" && (tasksAvailableA.length > 0 || tasksAvailableB.length > 0) && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginTop: "2px",
              paddingTop: "10px",
              borderTop: "1px dashed #e2e8f0",
            }}
          >
            {/* Panel Tareas Sesión A */}
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #bfdbfe",
                borderRadius: "8px",
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 900,
                      background: "#1e3a8a",
                      color: "#ffffff",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      letterSpacing: "0.04em",
                    }}
                  >
                    TAREAS SESIÓN A
                  </span>
                  <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#1e3a8a" }}>
                    {tasksAvailableA.length > 0
                      ? `(${selectedTasksA.length}/${tasksAvailableA.length} activadas)`
                      : "(Sesión completa)"}
                  </span>
                </div>

                {tasksAvailableA.length > 0 && (
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedTasksA([...tasksAvailableA])}
                      disabled={selectedTasksA.length === tasksAvailableA.length}
                      style={{
                        fontSize: "10.5px",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        border: "1px solid #cbd5e1",
                        background: selectedTasksA.length === tasksAvailableA.length ? "#f1f5f9" : "#ffffff",
                        color: selectedTasksA.length === tasksAvailableA.length ? "#94a3b8" : "#1e3a8a",
                        cursor: selectedTasksA.length === tasksAvailableA.length ? "default" : "pointer",
                      }}
                      title="Activar todas las tareas de la Sesión A"
                    >
                      ✓ Todas
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTasksA([])}
                      disabled={selectedTasksA.length === 0}
                      style={{
                        fontSize: "10.5px",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        border: "1px solid #cbd5e1",
                        background: selectedTasksA.length === 0 ? "#f1f5f9" : "#ffffff",
                        color: selectedTasksA.length === 0 ? "#94a3b8" : "#dc2626",
                        cursor: selectedTasksA.length === 0 ? "default" : "pointer",
                      }}
                      title="Desactivar todas las tareas de la Sesión A"
                    >
                      ✕ Ninguna
                    </button>
                  </div>
                )}
              </div>

              {tasksAvailableA.length === 0 ? (
                <span style={{ fontSize: "11.5px", color: "#64748b", fontStyle: "italic" }}>
                  ℹ️ Sesión completa (sin desglose de tareas individuales)
                </span>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {tasksAvailableA.map((tName) => {
                    const isChecked = selectedTasksA.includes(tName);
                    return (
                      <button
                        key={tName}
                        type="button"
                        onClick={() => toggleTaskA(tName)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          border: isChecked ? "1.5px solid #1e3a8a" : "1px dashed #cbd5e1",
                          background: isChecked ? "#eff6ff" : "#ffffff",
                          color: isChecked ? "#1e3a8a" : "#94a3b8",
                          fontSize: "11px",
                          fontWeight: isChecked ? 800 : 600,
                          cursor: "pointer",
                          textDecoration: isChecked ? "none" : "line-through",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span>{isChecked ? "☑" : "☐"}</span>
                        <span>{tName}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Panel Tareas Sesión B */}
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #fed7aa",
                borderRadius: "8px",
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 900,
                      background: "#ea580c",
                      color: "#ffffff",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      letterSpacing: "0.04em",
                    }}
                  >
                    TAREAS SESIÓN B
                  </span>
                  <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#c2410c" }}>
                    {tasksAvailableB.length > 0
                      ? `(${selectedTasksB.length}/${tasksAvailableB.length} activadas)`
                      : "(Sesión completa)"}
                  </span>
                </div>

                {tasksAvailableB.length > 0 && (
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedTasksB([...tasksAvailableB])}
                      disabled={selectedTasksB.length === tasksAvailableB.length}
                      style={{
                        fontSize: "10.5px",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        border: "1px solid #cbd5e1",
                        background: selectedTasksB.length === tasksAvailableB.length ? "#f1f5f9" : "#ffffff",
                        color: selectedTasksB.length === tasksAvailableB.length ? "#94a3b8" : "#c2410c",
                        cursor: selectedTasksB.length === tasksAvailableB.length ? "default" : "pointer",
                      }}
                      title="Activar todas las tareas de la Sesión B"
                    >
                      ✓ Todas
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTasksB([])}
                      disabled={selectedTasksB.length === 0}
                      style={{
                        fontSize: "10.5px",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        border: "1px solid #cbd5e1",
                        background: selectedTasksB.length === 0 ? "#f1f5f9" : "#ffffff",
                        color: selectedTasksB.length === 0 ? "#94a3b8" : "#dc2626",
                        cursor: selectedTasksB.length === 0 ? "default" : "pointer",
                      }}
                      title="Desactivar todas las tareas de la Sesión B"
                    >
                      ✕ Ninguna
                    </button>
                  </div>
                )}
              </div>

              {tasksAvailableB.length === 0 ? (
                <span style={{ fontSize: "11.5px", color: "#64748b", fontStyle: "italic" }}>
                  ℹ️ Sesión completa (sin desglose de tareas individuales)
                </span>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {tasksAvailableB.map((tName) => {
                    const isChecked = selectedTasksB.includes(tName);
                    return (
                      <button
                        key={tName}
                        type="button"
                        onClick={() => toggleTaskB(tName)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          border: isChecked ? "1.5px solid #ea580c" : "1px dashed #cbd5e1",
                          background: isChecked ? "#fff7ed" : "#ffffff",
                          color: isChecked ? "#c2410c" : "#94a3b8",
                          fontSize: "11px",
                          fontWeight: isChecked ? 800 : 600,
                          cursor: "pointer",
                          textDecoration: isChecked ? "none" : "line-through",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span>{isChecked ? "☑" : "☐"}</span>
                        <span>{tName}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── SELECTOR DE MÉTRICAS GPS INTERACTIVO (SOLO FAVORITAS) (NO-PRINT) ── */}
      <div
        className="no-print"
        style={{
          background: "#ffffff",
          borderRadius: "10px",
          padding: "12px 16px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
              ⭐ Métricas Favoritas ({activeVariables.length}/{favoriteVariables.length}):
            </span>
          </div>

          {/* Botones de selección rápida */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleSelectAllFavorites}
              style={{
                padding: "3px 10px",
                borderRadius: "5px",
                border: "1px solid #1e3a8a",
                background: selectedMetricKeys.length === favoriteVariables.length ? "#1e3a8a" : "#eff6ff",
                color: selectedMetricKeys.length === favoriteVariables.length ? "#ffffff" : "#1e3a8a",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ✓ Seleccionar Todas
            </button>
            <button
              type="button"
              onClick={handleSelectNone}
              style={{
                padding: "3px 10px",
                borderRadius: "5px",
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
                color: "#64748b",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Deseleccionar
            </button>
          </div>
        </div>

        {/* Chips de variables (únicamente favoritas) */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "2px" }}>
          {favoriteVariables.map((v) => {
            const isSelected = selectedMetricKeys.includes(v.key);
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => toggleMetric(v.key)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "16px",
                  fontSize: "11.5px",
                  fontWeight: isSelected ? 800 : 600,
                  border: isSelected ? "1.5px solid #1e3a8a" : "1px solid #cbd5e1",
                  background: isSelected ? "#1e3a8a" : "#ffffff",
                  color: isSelected ? "#ffffff" : "#475569",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  transition: "all 0.15s ease",
                }}
              >
                <span style={{ color: isSelected ? "#fef08a" : "#eab308" }}>⭐</span>
                <span>{v.label}</span>
                <span style={{ opacity: isSelected ? 0.85 : 0.65, fontSize: "10.5px" }}>({v.unit})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── BANNER VISUAL COMPACTO DE COMPARACIÓN (PRINT & WEB) ── */}
      <div
        style={{
          background: "linear-gradient(90deg, rgba(30,58,138,0.06) 0%, rgba(248,250,252,1) 50%, rgba(234,88,12,0.06) 100%)",
          borderRadius: "8px",
          padding: "10px 16px",
          border: "1px solid #cbd5e1",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        {/* Sujeto A */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "#1e3a8a",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: "14px",
              boxShadow: "0 1px 3px rgba(30,58,138,0.3)",
            }}
          >
            {playerA.id === "TEAM" ? "👥" : (playerA.dorsal || (playerA.apodo || playerA.nombre)[0])}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "13.5px", fontWeight: 900, color: "#1e3a8a" }}>
                {playerA.id === "TEAM" ? "TEAM (avg)" : (playerA.apodo || playerA.nombre)}
              </span>
              <span style={{ fontSize: "10px", fontWeight: 800, background: "#dbeafe", color: "#1e40af", padding: "1px 5px", borderRadius: "4px" }}>
                SUJETO A
              </span>
            </div>
            <span style={{ fontSize: "11.5px", color: "#475569", fontWeight: 700 }}>
              {subLabelA}
            </span>
          </div>
        </div>

        {/* VS Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ padding: "3px 10px", borderRadius: "12px", background: "#0f172a", color: "#ffffff", fontSize: "11px", fontWeight: 900, letterSpacing: "0.08em" }}>
            VS
          </span>
        </div>

        {/* Sujeto B */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexDirection: "row-reverse", textAlign: "right" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "#ea580c",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: "14px",
              boxShadow: "0 1px 3px rgba(234,88,12,0.3)",
            }}
          >
            {playerB.id === "TEAM" ? "👥" : (playerB.dorsal || (playerB.apodo || playerB.nombre)[0])}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "flex-end" }}>
              <span style={{ fontSize: "10px", fontWeight: 800, background: "#ffedd5", color: "#c2410c", padding: "1px 5px", borderRadius: "4px" }}>
                SUJETO B
              </span>
              <span style={{ fontSize: "13.5px", fontWeight: 900, color: "#ea580c" }}>
                {playerB.id === "TEAM" ? "TEAM (avg)" : (playerB.apodo || playerB.nombre)}
              </span>
            </div>
            <span style={{ fontSize: "11.5px", color: "#475569", fontWeight: 700 }}>
              {subLabelB}
            </span>
          </div>
        </div>
      </div>

      {/* ── TABLA COMPARATIVA PRINCIPAL (VARIABLES EN X, JUGADORES EN Y, FILA DIFERENCIA Y FILA % DE CAMBIO) ── */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "10px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 16px",
            background: "#0f172a",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px" }}>📊</span>
            <h3 style={{ margin: 0, fontSize: "13px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Tabla Comparativa de Variables ({activeVariables.length} en Eje X)
            </h3>
          </div>
          <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700 }}>
            Variables en columnas · Sujetos, Diferencia y % de cambio en filas
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "center" }}>
            <thead>
              <tr style={{ background: "#f1f5f9", color: "#0f172a", borderBottom: "2px solid #cbd5e1" }}>
                {/* Columna fija: Sujeto / Configuración */}
                <th
                  style={{
                    padding: "10px 14px",
                    fontWeight: 900,
                    textAlign: "left",
                    minWidth: "210px",
                    position: "sticky",
                    left: 0,
                    background: "#f1f5f9",
                    zIndex: 2,
                    boxShadow: "2px 0 4px rgba(0,0,0,0.04)",
                  }}
                >
                  Sujeto / Configuración
                </th>

                {/* Columnas X: Cada variable seleccionada */}
                {activeVariables.map((v) => (
                  <th
                    key={v.key}
                    style={{
                      padding: "8px 12px",
                      fontWeight: 800,
                      minWidth: "110px",
                      borderLeft: "1px solid #e2e8f0",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px", alignItems: "center" }}>
                      <span style={{ fontSize: "11.5px", color: "#0f172a", lineHeight: 1.2 }}>
                        {v.shortLabel || v.label}
                      </span>
                      <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700 }}>
                        {v.unit ? `(${v.unit})` : "-"}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* FILA 1: SUJETO A */}
              <tr style={{ background: "#ffffff", borderBottom: "1px solid #e2e8f0" }}>
                <td
                  style={{
                    padding: "10px 14px",
                    textAlign: "left",
                    fontWeight: 800,
                    position: "sticky",
                    left: 0,
                    background: "#ffffff",
                    zIndex: 2,
                    boxShadow: "2px 0 4px rgba(0,0,0,0.04)",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#1e3a8a", flexShrink: 0 }} />
                      <span style={{ color: "#1e3a8a", fontSize: "13px", fontWeight: 900 }}>
                        {playerA.id === "TEAM" ? "TEAM (avg)" : (playerA.apodo || playerA.nombre)}
                      </span>
                    </div>
                    <span style={{ fontSize: "10.5px", color: "#64748b", paddingLeft: "14px" }}>
                      {subLabelA}
                    </span>
                  </div>
                </td>

                {activeVariables.map((v) => {
                  const val = metricsA[v.key] ?? 0;
                  return (
                    <td
                      key={v.key}
                      style={{
                        padding: "10px 12px",
                        fontWeight: 900,
                        color: "#1e3a8a",
                        borderLeft: "1px solid #f1f5f9",
                        fontSize: "13px",
                      }}
                    >
                      {val.toLocaleString("es-ES")}
                    </td>
                  );
                })}
              </tr>

              {/* FILA 2: SUJETO B */}
              <tr style={{ background: "#fffaf5", borderBottom: "2px solid #cbd5e1" }}>
                <td
                  style={{
                    padding: "10px 14px",
                    textAlign: "left",
                    fontWeight: 800,
                    position: "sticky",
                    left: 0,
                    background: "#fffaf5",
                    zIndex: 2,
                    boxShadow: "2px 0 4px rgba(0,0,0,0.04)",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ea580c", flexShrink: 0 }} />
                      <span style={{ color: "#ea580c", fontSize: "13px", fontWeight: 900 }}>
                        {playerB.id === "TEAM" ? "TEAM (avg)" : (playerB.apodo || playerB.nombre)}
                      </span>
                    </div>
                    <span style={{ fontSize: "10.5px", color: "#64748b", paddingLeft: "14px" }}>
                      {subLabelB}
                    </span>
                  </div>
                </td>

                {activeVariables.map((v) => {
                  const val = metricsB[v.key] ?? 0;
                  return (
                    <td
                      key={v.key}
                      style={{
                        padding: "10px 12px",
                        fontWeight: 900,
                        color: "#ea580c",
                        borderLeft: "1px solid #fed7aa",
                        fontSize: "13px",
                      }}
                    >
                      {val.toLocaleString("es-ES")}
                    </td>
                  );
                })}
              </tr>

              {/* FILA 3: DIFERENCIA ABSOLUTA (B - A) */}
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <td
                  style={{
                    padding: "8px 14px",
                    textAlign: "left",
                    fontWeight: 900,
                    color: "#334155",
                    position: "sticky",
                    left: 0,
                    background: "#f8fafc",
                    zIndex: 2,
                    boxShadow: "2px 0 4px rgba(0,0,0,0.04)",
                    fontSize: "11.5px",
                    textTransform: "uppercase",
                  }}
                >
                  Diferencia (B - A)
                </td>

                {activeVariables.map((v) => {
                  const valA = metricsA[v.key] ?? 0;
                  const valB = metricsB[v.key] ?? 0;
                  const diff = Math.round((valB - valA) * 100) / 100;
                  const isUp = diff > 0;
                  const isDown = diff < 0;

                  return (
                    <td
                      key={v.key}
                      style={{
                        padding: "8px 12px",
                        fontWeight: 800,
                        borderLeft: "1px solid #e2e8f0",
                        fontSize: "12px",
                        color: isUp ? "#15803d" : isDown ? "#b91c1c" : "#64748b",
                      }}
                    >
                      {diff > 0 ? `+${diff.toLocaleString("es-ES")}` : diff.toLocaleString("es-ES")}
                    </td>
                  );
                })}
              </tr>

              {/* FILA 4: PORCENTAJE DE CAMBIO % (B vs A) */}
              <tr style={{ background: "#f1f5f9" }}>
                <td
                  style={{
                    padding: "8px 14px",
                    textAlign: "left",
                    fontWeight: 900,
                    color: "#0f172a",
                    position: "sticky",
                    left: 0,
                    background: "#f1f5f9",
                    zIndex: 2,
                    boxShadow: "2px 0 4px rgba(0,0,0,0.04)",
                    fontSize: "11.5px",
                    textTransform: "uppercase",
                  }}
                >
                  % Porcentaje de Cambio
                </td>

                {activeVariables.map((v) => {
                  const valA = metricsA[v.key] ?? 0;
                  const valB = metricsB[v.key] ?? 0;
                  const diff = valB - valA;
                  const pct = valA > 0 ? Math.round(((valB - valA) / valA) * 1000) / 10 : (valB > 0 ? 100 : 0);
                  const isUp = diff > 0;
                  const isDown = diff < 0;

                  return (
                    <td
                      key={v.key}
                      style={{
                        padding: "8px 12px",
                        borderLeft: "1px solid #e2e8f0",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 900,
                          background: isUp ? "#dcfce7" : isDown ? "#fee2e2" : "#ffffff",
                          color: isUp ? "#15803d" : isDown ? "#b91c1c" : "#64748b",
                          border: isUp ? "1px solid #bbf7d0" : isDown ? "1px solid #fecaca" : "1px solid #cbd5e1",
                        }}
                      >
                        {isUp ? "▲ " : isDown ? "▼ " : "= "}
                        {isUp ? `+${pct}%` : `${pct}%`}
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── REPLANTEAMIENTO DE GRÁFICOS: VISUALIZACIÓN CLARA CON ESCALA ADECUADA ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Cabecera con selector de modo de gráfico */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
              📈 Gráficos Comparativos ({activeVariables.length} Variables)
            </h3>
            <span style={{ fontSize: "11.5px", color: "#64748b", fontWeight: 600 }}>
              {chartViewMode === "cards"
                ? "Cada variable cuenta con su propia escala adaptada para no distorsionar métricas de diferente magnitud"
                : chartViewMode === "relative"
                ? "Diferencia relativa porcentual (+% ganancia / -% descenso) de B respecto a A"
                : "Perfil radial de huella física comparada"}
            </span>
          </div>

          {/* Toggle de modo de visualización */}
          <div className="no-print" style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              onClick={() => setChartViewMode("cards")}
              style={{
                padding: "5px 12px",
                borderRadius: "6px",
                border: chartViewMode === "cards" ? "1.5px solid #1e3a8a" : "1px solid #cbd5e1",
                background: chartViewMode === "cards" ? "#1e3a8a" : "#ffffff",
                color: chartViewMode === "cards" ? "#ffffff" : "#475569",
                fontSize: "11px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              📊 Gráficos por Métrica (Escala Propia)
            </button>
            <button
              type="button"
              onClick={() => setChartViewMode("relative")}
              style={{
                padding: "5px 12px",
                borderRadius: "6px",
                border: chartViewMode === "relative" ? "1.5px solid #1e3a8a" : "1px solid #cbd5e1",
                background: chartViewMode === "relative" ? "#1e3a8a" : "#ffffff",
                color: chartViewMode === "relative" ? "#ffffff" : "#475569",
                fontSize: "11px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              📈 % Variación Relativa
            </button>
            <button
              type="button"
              onClick={() => setChartViewMode("radar")}
              style={{
                padding: "5px 12px",
                borderRadius: "6px",
                border: chartViewMode === "radar" ? "1.5px solid #1e3a8a" : "1px solid #cbd5e1",
                background: chartViewMode === "radar" ? "#1e3a8a" : "#ffffff",
                color: chartViewMode === "radar" ? "#ffffff" : "#475569",
                fontSize: "11px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              🕸️ Gráfico Radar
            </button>
          </div>
        </div>

        {/* MODO 1: GRID DE TARJETAS GRÁFICAS INDIVIDUALES POR VARIABLE (CADA UNA CON ESCALA PROPIA) */}
        {chartViewMode === "cards" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "12px",
            }}
          >
            {activeVariables.map((v) => {
              const valA = metricsA[v.key] ?? 0;
              const valB = metricsB[v.key] ?? 0;
              const diff = Math.round((valB - valA) * 100) / 100;
              const pct = valA > 0 ? Math.round(((valB - valA) / valA) * 1000) / 10 : (valB > 0 ? 100 : 0);
              const isUp = diff > 0;
              const isDown = diff < 0;

              const singleBarData = [
                {
                  name: shortNameA,
                  value: valA,
                  fill: "#1e3a8a",
                },
                {
                  name: shortNameB,
                  value: valB,
                  fill: "#ea580c",
                },
              ];

              return (
                <div
                  key={v.key}
                  style={{
                    background: "#ffffff",
                    borderRadius: "10px",
                    padding: "14px 16px",
                    border: "1px solid #cbd5e1",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {/* Título de la tarjeta */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "6px" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: "12.5px", fontWeight: 900, color: "#0f172a" }}>
                        {v.label}
                      </span>
                      <span style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 700 }}>
                        Unidad: {v.unit || "-"}
                      </span>
                    </div>

                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 900,
                        background: isUp ? "#dcfce7" : isDown ? "#fee2e2" : "#f1f5f9",
                        color: isUp ? "#15803d" : isDown ? "#b91c1c" : "#64748b",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isUp ? "▲ " : isDown ? "▼ " : "= "}
                      {isUp ? `+${pct}%` : `${pct}%`}
                    </span>
                  </div>

                  {/* Valores destacados */}
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", background: "#f8fafc", padding: "6px 10px", borderRadius: "6px" }}>
                    <div>
                      <span style={{ fontSize: "10px", color: "#1e3a8a", fontWeight: 800 }}>A: </span>
                      <span style={{ fontSize: "14px", fontWeight: 900, color: "#1e3a8a" }}>
                        {valA.toLocaleString("es-ES")}
                      </span>
                    </div>
                    <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700 }}>vs</span>
                    <div>
                      <span style={{ fontSize: "10px", color: "#ea580c", fontWeight: 800 }}>B: </span>
                      <span style={{ fontSize: "14px", fontWeight: 900, color: "#ea580c" }}>
                        {valB.toLocaleString("es-ES")}
                      </span>
                    </div>
                  </div>

                  {/* Mini Gráfico de barras dedicado con auto-scale */}
                  <div style={{ width: "100%", height: 130 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={singleBarData} margin={{ top: 16, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="name" stroke="#000000" tick={{ fontSize: 10, fontWeight: 800 }} />
                        <YAxis stroke="#000000" tick={{ fontSize: 9, fontWeight: 700 }} domain={[0, 'auto']} />
                        <Tooltip
                          contentStyle={{ borderRadius: "6px", fontSize: "11px" }}
                          formatter={(value: any) => [`${value.toLocaleString("es-ES")} ${v.unit || ""}`, "Valor"]}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={26}>
                          <LabelList
                            dataKey="value"
                            position="top"
                            style={{ fontSize: "9.5px", fontWeight: 800 }}
                            formatter={(val: any) => (typeof val === "number" && val > 0 ? val.toLocaleString("es-ES") : "")}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* MODO 2: GRÁFICO DE BARRAS DE % DE VARIACIÓN */}
        {chartViewMode === "relative" && (
          <div
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              padding: "16px 20px",
              border: "1px solid #cbd5e1",
              boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ marginBottom: "12px" }}>
              <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
                Ganancia o Descenso Porcentual de Sujeto B respecto a Sujeto A (% Relativo)
              </h4>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                Barras hacia la derecha indican mayor rendimiento/volumen en B; barras hacia la izquierda indican menor volumen en B
              </span>
            </div>

            <div style={{ width: "100%", height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={relativeChartData} layout="vertical" margin={{ top: 10, right: 30, left: 100, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" unit="%" domain={['dataMin - 10', 'dataMax + 10']} tick={{ fontSize: 10, fontWeight: 700 }} />
                  <YAxis type="category" dataKey="name" stroke="#000000" tick={{ fontSize: 11, fontWeight: 800 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", fontSize: "11px" }}
                    formatter={(val: any, name: any, item: any) => [
                      `${val > 0 ? `+${val}%` : `${val}%`} (A: ${item.payload.valA} vs B: ${item.payload.valB} ${item.payload.unit})`,
                      "% Variación",
                    ]}
                  />
                  <Bar dataKey="variacion" radius={[4, 4, 4, 4]}>
                    <LabelList
                      dataKey="variacion"
                      position="right"
                      style={{ fontSize: "10px", fontWeight: 900 }}
                      formatter={(v: any) => `${v > 0 ? `+${v}%` : `${v}%`}`}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* MODO 3: GRÁFICO RADAR (DESTACADO CON EL DÍA DE CADA UNO) */}
        {chartViewMode === "radar" && (
          <div
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              padding: "16px 20px",
              border: "1px solid #cbd5e1",
              boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: "14px", width: "100%" }}>
              <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
                🕸️ Perfil Físico Comparado (Huella Radar)
              </h4>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginTop: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12px", fontWeight: 800, color: "#1e3a8a", background: "#eff6ff", padding: "4px 12px", borderRadius: "6px", border: "1px solid #bfdbfe", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#1e3a8a" }} />
                  <span>Sujeto A: <strong>{playerA.id === "TEAM" ? "TEAM (avg)" : (playerA.apodo || playerA.nombre)}</strong> — {subLabelA}</span>
                </span>
                <span style={{ fontSize: "12px", fontWeight: 800, color: "#ea580c", background: "#fff7ed", padding: "4px 12px", borderRadius: "6px", border: "1px solid #fed7aa", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#ea580c" }} />
                  <span>Sujeto B: <strong>{playerB.id === "TEAM" ? "TEAM (avg)" : (playerB.apodo || playerB.nombre)}</strong> — {subLabelB}</span>
                </span>
              </div>
            </div>

            <div style={{ width: "100%", height: 420, maxWidth: "680px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#cbd5e1" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fontWeight: 800, fill: "#0f172a" }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Radar
                    name={`${shortNameA} (${subLabelA})`}
                    dataKey="A"
                    stroke="#1e3a8a"
                    fill="#1e3a8a"
                    fillOpacity={0.35}
                    strokeWidth={2.5}
                  />
                  <Radar
                    name={`${shortNameB} (${subLabelB})`}
                    dataKey="B"
                    stroke="#ea580c"
                    fill="#ea580c"
                    fillOpacity={0.35}
                    strokeWidth={2.5}
                  />
                  <Legend wrapperStyle={{ fontSize: "11.5px", fontWeight: 800, paddingTop: "12px" }} />
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0]?.payload;
                      if (!d) return null;
                      const diff = Math.round((d.rawB - d.rawA) * 100) / 100;
                      const pct = d.rawA > 0 ? Math.round(((d.rawB - d.rawA) / d.rawA) * 1000) / 10 : (d.rawB > 0 ? 100 : 0);
                      const isUp = diff > 0;
                      const isDown = diff < 0;

                      return (
                        <div
                          style={{
                            background: "#ffffff",
                            border: "1px solid #cbd5e1",
                            borderRadius: "8px",
                            padding: "10px 14px",
                            boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
                            fontSize: "12px",
                            minWidth: "240px",
                          }}
                        >
                          <div style={{ fontWeight: 900, color: "#0f172a", marginBottom: "6px", borderBottom: "1px solid #e2e8f0", paddingBottom: "4px" }}>
                            🎯 {d.subject} {d.unit ? `(${d.unit})` : ""}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#1e3a8a", fontWeight: 800, marginBottom: "4px", gap: "10px" }}>
                            <span>● {shortNameA} ({subLabelA}):</span>
                            <span style={{ fontSize: "13px", fontWeight: 900 }}>{d.rawA.toLocaleString("es-ES")} {d.unit}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#ea580c", fontWeight: 800, marginBottom: "6px", gap: "10px" }}>
                            <span>● {shortNameB} ({subLabelB}):</span>
                            <span style={{ fontSize: "13px", fontWeight: 900 }}>{d.rawB.toLocaleString("es-ES")} {d.unit}</span>
                          </div>
                          <div style={{ paddingTop: "5px", borderTop: "1px dashed #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px", fontWeight: 900, color: isUp ? "#15803d" : isDown ? "#b91c1c" : "#64748b" }}>
                            <span>Diferencia (B vs A):</span>
                            <span>{diff > 0 ? `+${diff.toLocaleString("es-ES")}` : diff.toLocaleString("es-ES")} ({pct > 0 ? `+${pct}%` : `${pct}%`})</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}      </div>

      {/* ── APARTADO COMPARATIVA DETALLADA DE TAREAS (HASTA 5 TAREAS) ── */}
      {mode === "sesion" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "15px" }}>⚡</span>
                <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
                  Comparativa de Tareas de Entrenamiento ({taskPairs.length}/5 Tareas)
                </h3>
              </div>
              <span style={{ fontSize: "11.5px", color: "#64748b", fontWeight: 600 }}>
                Compara tareas concretas par a par (Tarea 1 con Tarea 1 por defecto, o cruzada entre jugadores y sesiones)
              </span>
            </div>

            <div className="no-print" style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                onClick={handleToggleAllPairs}
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#334155",
                  fontSize: "11px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {taskPairs.some((p) => p.isExpanded) ? "🔼 Plegar Todas" : "🔽 Desplegar Todas"}
              </button>
              {taskPairs.length < 5 && (
                <button
                  type="button"
                  onClick={handleAddPair}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "6px",
                    border: "none",
                    background: "#1e3a8a",
                    color: "#ffffff",
                    fontSize: "11px",
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span>➕</span> Añadir Tarea ({taskPairs.length}/5)
                </button>
              )}
            </div>
          </div>

          {/* Lista de tarjetas plegables de pares de tareas */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {taskPairs.map((pair, idx) => {
              const isSourceA_forA = pair.sourceA === "A";
              const playerSideA = isSourceA_forA ? playerA : playerB;
              const dateSideA = isSourceA_forA ? dateA : dateB;
              const taskOptionsA = isSourceA_forA ? tasksAvailableA : tasksAvailableB;

              const isSourceB_forB = pair.sourceB === "B";
              const playerSideB = isSourceB_forB ? playerB : playerA;
              const dateSideB = isSourceB_forB ? dateB : dateA;
              const taskOptionsB = isSourceB_forB ? tasksAvailableB : tasksAvailableA;

              const tMetricsA = getSingleTaskMetrics(
                playerSideA.id,
                dateSideA,
                pair.taskA,
                teamGpsRecords,
                activeVariables,
                derivedVariables
              );

              const tMetricsB = getSingleTaskMetrics(
                playerSideB.id,
                dateSideB,
                pair.taskB,
                teamGpsRecords,
                activeVariables,
                derivedVariables
              );

              const distA = Math.round(tMetricsA["Distance(m)"] || tMetricsA["Distancia Total (m)"] || 0);
              const distB = Math.round(tMetricsB["Distance(m)"] || tMetricsB["Distancia Total (m)"] || 0);
              const diffDist = distB - distA;
              const durA = Math.round((tMetricsA["Duration(min)"] || tMetricsA["Tiempo"] || 0) * 10) / 10;
              const durB = Math.round((tMetricsB["Duration(min)"] || tMetricsB["Tiempo"] || 0) * 10) / 10;

              return (
                <div
                  key={pair.id}
                  style={{
                    background: "#ffffff",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
                    overflow: "hidden",
                    transition: "all 0.15s ease",
                  }}
                >
                  {/* Encabezado clicable de la tarjeta de tarea (plegar/desplegar) */}
                  <div
                    onClick={() => handleTogglePairExpanded(idx)}
                    style={{
                      background: pair.isExpanded ? "#f8fafc" : "#ffffff",
                      padding: "10px 16px",
                      borderBottom: pair.isExpanded ? "1px solid #e2e8f0" : "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      userSelect: "none",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span
                        style={{
                          background: "#0f172a",
                          color: "#ffffff",
                          fontSize: "10px",
                          fontWeight: 900,
                          padding: "2px 7px",
                          borderRadius: "4px",
                          letterSpacing: "0.04em",
                        }}
                      >
                        TAREA #{idx + 1}
                      </span>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 900, color: "#1e3a8a" }}>
                          {pair.taskA || "Sin Tarea"}
                        </span>
                        <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700 }}>
                          ({playerSideA.apodo || playerSideA.nombre})
                        </span>

                        <span style={{ fontSize: "11px", fontWeight: 900, color: "#94a3b8", margin: "0 2px" }}>
                          vs
                        </span>

                        <span style={{ fontSize: "13px", fontWeight: 900, color: "#ea580c" }}>
                          {pair.taskB || "Sin Tarea"}
                        </span>
                        <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700 }}>
                          ({playerSideB.apodo || playerSideB.nombre})
                        </span>
                      </div>
                    </div>

                    {/* Resumen rápido a la derecha + botón plegar */}
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11.5px" }}>
                        <span style={{ color: "#334155", fontWeight: 700 }}>
                          📏 Distancia: <strong>{distA}m</strong> vs <strong>{distB}m</strong>
                          <span style={{ marginLeft: "4px", color: diffDist > 0 ? "#15803d" : diffDist < 0 ? "#b91c1c" : "#64748b", fontWeight: 900 }}>
                            ({diffDist > 0 ? `+${diffDist}m` : `${diffDist}m`})
                          </span>
                        </span>

                        <span style={{ color: "#64748b", fontWeight: 600 }}>
                          ⏱️ {durA}m vs {durB}m
                        </span>
                      </div>

                      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {taskPairs.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemovePair(idx);
                            }}
                            title="Quitar esta comparativa de tarea"
                            style={{
                              background: "none",
                              border: "none",
                              color: "#94a3b8",
                              fontSize: "13px",
                              cursor: "pointer",
                              padding: "2px 6px",
                              borderRadius: "4px",
                            }}
                          >
                            ✕
                          </button>
                        )}
                        <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 800 }}>
                          {pair.isExpanded ? "▲ Plegar" : "▼ Desplegar"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Contenido desplegado: Selectores de tareas + Tabla comparativa */}
                  {pair.isExpanded && (
                    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                      {/* Fila de controles de configuración de este par */}
                      <div
                        className="no-print"
                        style={{
                          background: "#f8fafc",
                          borderRadius: "8px",
                          padding: "10px 14px",
                          border: "1px solid #e2e8f0",
                          display: "grid",
                          gridTemplateColumns: "1fr auto 1fr",
                          gap: "10px",
                          alignItems: "center",
                        }}
                      >
                        {/* Lado A */}
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={{ background: "#1e3a8a", color: "#fff", fontSize: "10px", fontWeight: 900, padding: "2px 6px", borderRadius: "4px" }}>
                            LADO A
                          </span>

                          <select
                            value={pair.sourceA}
                            onChange={(e) => {
                              const newSource = e.target.value as "A" | "B";
                              const newTasks = newSource === "A" ? tasksAvailableA : tasksAvailableB;
                              handleUpdatePair(idx, {
                                sourceA: newSource,
                                taskA: newTasks[0] || "",
                              });
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              background: "#ffffff",
                              fontSize: "11.5px",
                              fontWeight: 700,
                              color: "#1e3a8a",
                            }}
                          >
                            <option value="A">Sujeto A ({playerA.apodo || playerA.nombre} · {formatDateDisplay(dateA)})</option>
                            <option value="B">Sujeto B ({playerB.apodo || playerB.nombre} · {formatDateDisplay(dateB)})</option>
                          </select>

                          <select
                            value={pair.taskA}
                            onChange={(e) => handleUpdatePair(idx, { taskA: e.target.value })}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              border: "1px solid #93c5fd",
                              background: "#eff6ff",
                              fontSize: "11.5px",
                              fontWeight: 800,
                              color: "#1e3a8a",
                              flex: "1 1 120px",
                            }}
                          >
                            {taskOptionsA.length === 0 && <option value="">Sin tareas en esta sesión</option>}
                            {taskOptionsA.map((tName, tIdx) => (
                              <option key={tName} value={tName}>
                                Tarea #{tIdx + 1}: {tName}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Botón Swap ⇄ para este par */}
                        <button
                          type="button"
                          onClick={() => handleSwapPair(idx)}
                          title="Intercambiar Tarea A ⇄ Tarea B en esta comparativa"
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "50%",
                            background: "#ffffff",
                            border: "1px solid #cbd5e1",
                            fontSize: "13px",
                            fontWeight: 900,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          ⇄
                        </button>

                        {/* Lado B */}
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={{ background: "#ea580c", color: "#fff", fontSize: "10px", fontWeight: 900, padding: "2px 6px", borderRadius: "4px" }}>
                            LADO B
                          </span>

                          <select
                            value={pair.sourceB}
                            onChange={(e) => {
                              const newSource = e.target.value as "A" | "B";
                              const newTasks = newSource === "B" ? tasksAvailableB : tasksAvailableA;
                              handleUpdatePair(idx, {
                                sourceB: newSource,
                                taskB: newTasks[0] || "",
                              });
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              background: "#ffffff",
                              fontSize: "11.5px",
                              fontWeight: 700,
                              color: "#ea580c",
                            }}
                          >
                            <option value="B">Sujeto B ({playerB.apodo || playerB.nombre} · {formatDateDisplay(dateB)})</option>
                            <option value="A">Sujeto A ({playerA.apodo || playerA.nombre} · {formatDateDisplay(dateA)})</option>
                          </select>

                          <select
                            value={pair.taskB}
                            onChange={(e) => handleUpdatePair(idx, { taskB: e.target.value })}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              border: "1px solid #fed7aa",
                              background: "#fff7ed",
                              fontSize: "11.5px",
                              fontWeight: 800,
                              color: "#c2410c",
                              flex: "1 1 120px",
                            }}
                          >
                            {taskOptionsB.length === 0 && <option value="">Sin tareas en esta sesión</option>}
                            {taskOptionsB.map((tName, tIdx) => (
                              <option key={tName} value={tName}>
                                Tarea #{tIdx + 1}: {tName}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Tabla comparativa de la tarea */}
                      <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", textAlign: "center" }}>
                          <thead>
                            <tr style={{ background: "#f1f5f9", color: "#0f172a", borderBottom: "1.5px solid #cbd5e1" }}>
                              <th style={{ padding: "8px 12px", textAlign: "left", minWidth: "180px", fontWeight: 900 }}>
                                Tarea / Sujeto
                              </th>
                              {activeVariables.map((v) => (
                                <th key={v.key} style={{ padding: "6px 10px", minWidth: "90px", borderLeft: "1px solid #e2e8f0", fontWeight: 800 }}>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                                    <span style={{ fontSize: "11px" }}>{v.shortLabel || v.label}</span>
                                    <span style={{ fontSize: "9.5px", color: "#64748b" }}>({v.unit || "-"})</span>
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {/* Fila Tarea A */}
                            <tr style={{ background: "#ffffff", borderBottom: "1px solid #e2e8f0" }}>
                              <td style={{ padding: "8px 12px", textAlign: "left", fontWeight: 800, color: "#1e3a8a" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#1e3a8a" }} />
                                  <span>{pair.taskA || "Sin Tarea"} ({playerSideA.apodo || playerSideA.nombre})</span>
                                </div>
                              </td>
                              {activeVariables.map((v) => {
                                const val = tMetricsA[v.key] ?? 0;
                                return (
                                  <td key={v.key} style={{ padding: "8px 10px", fontWeight: 900, color: "#1e3a8a", borderLeft: "1px solid #f1f5f9" }}>
                                    {val.toLocaleString("es-ES")}
                                  </td>
                                );
                              })}
                            </tr>

                            {/* Fila Tarea B */}
                            <tr style={{ background: "#fffaf5", borderBottom: "1.5px solid #cbd5e1" }}>
                              <td style={{ padding: "8px 12px", textAlign: "left", fontWeight: 800, color: "#ea580c" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#ea580c" }} />
                                  <span>{pair.taskB || "Sin Tarea"} ({playerSideB.apodo || playerSideB.nombre})</span>
                                </div>
                              </td>
                              {activeVariables.map((v) => {
                                const val = tMetricsB[v.key] ?? 0;
                                return (
                                  <td key={v.key} style={{ padding: "8px 10px", fontWeight: 900, color: "#ea580c", borderLeft: "1px solid #fed7aa" }}>
                                    {val.toLocaleString("es-ES")}
                                  </td>
                                );
                              })}
                            </tr>

                            {/* Fila Diferencia (B - A) */}
                            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                              <td style={{ padding: "6px 12px", textAlign: "left", fontWeight: 900, color: "#334155", fontSize: "11px", textTransform: "uppercase" }}>
                                Diferencia (B - A)
                              </td>
                              {activeVariables.map((v) => {
                                const valA = tMetricsA[v.key] ?? 0;
                                const valB = tMetricsB[v.key] ?? 0;
                                const diff = Math.round((valB - valA) * 100) / 100;
                                const isUp = diff > 0;
                                const isDown = diff < 0;
                                return (
                                  <td
                                    key={v.key}
                                    style={{
                                      padding: "6px 10px",
                                      fontWeight: 800,
                                      borderLeft: "1px solid #e2e8f0",
                                      color: isUp ? "#15803d" : isDown ? "#b91c1c" : "#64748b",
                                    }}
                                  >
                                    {diff > 0 ? `+${diff.toLocaleString("es-ES")}` : diff.toLocaleString("es-ES")}
                                  </td>
                                );
                              })}
                            </tr>

                            {/* Fila % de Cambio */}
                            <tr style={{ background: "#f1f5f9" }}>
                              <td style={{ padding: "6px 12px", textAlign: "left", fontWeight: 900, color: "#0f172a", fontSize: "11px", textTransform: "uppercase" }}>
                                % Variación
                              </td>
                              {activeVariables.map((v) => {
                                const valA = tMetricsA[v.key] ?? 0;
                                const valB = tMetricsB[v.key] ?? 0;
                                const diff = valB - valA;
                                const pct = valA > 0 ? Math.round(((valB - valA) / valA) * 1000) / 10 : (valB > 0 ? 100 : 0);
                                const isUp = diff > 0;
                                const isDown = diff < 0;
                                return (
                                  <td key={v.key} style={{ padding: "6px 10px", borderLeft: "1px solid #e2e8f0" }}>
                                    <span
                                      style={{
                                        display: "inline-block",
                                        padding: "1px 5px",
                                        borderRadius: "4px",
                                        fontSize: "10.5px",
                                        fontWeight: 900,
                                        background: isUp ? "#dcfce7" : isDown ? "#fee2e2" : "#ffffff",
                                        color: isUp ? "#15803d" : isDown ? "#b91c1c" : "#64748b",
                                        border: isUp ? "1px solid #bbf7d0" : isDown ? "1px solid #fecaca" : "1px solid #cbd5e1",
                                      }}
                                    >
                                      {isUp ? "▲ " : isDown ? "▼ " : "= "}
                                      {isUp ? `+${pct}%` : `${pct}%`}
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
              );
            })}
          </div>
        </div>
      )}

      {/* ── VENTANA MODAL DEL MINI CALENDARIO (DEL DÍA AL DÍA) ── */}
      {calendarModalTarget !== null && (
        <MiniCalendarModal
          target={calendarModalTarget}
          initialStart={calendarModalTarget === "A" ? microRangeA.start : microRangeB.start}
          initialEnd={calendarModalTarget === "A" ? microRangeA.end : microRangeB.end}
          onApply={(start, end) => {
            if (calendarModalTarget === "A") {
              setMicroRangeA({ start, end });
            } else {
              setMicroRangeB({ start, end });
            }
          }}
          onClose={() => setCalendarModalTarget(null)}
          resolveDayInfo={resolveDayInfo}
          teamGpsRecords={teamGpsRecords}
          availableWeeks={availableWeeks}
        />
      )}

      <style jsx>{`
        @media print {
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
