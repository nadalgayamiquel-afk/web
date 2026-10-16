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
  const [weekA, setWeekA] = useState<string>(() => {
    if (currentWeekStart && availableWeeks.some((w) => w.start === currentWeekStart)) return currentWeekStart;
    return availableWeeks.length > 0 ? availableWeeks[0].start : "";
  });
  const [taskA, setTaskA] = useState<string>("__TOTAL__");

  // Elemento B
  const [jugadorIdB, setJugadorIdB] = useState<string>(() => initialPlayerId);
  const [dateB, setDateB] = useState<string>(() => {
    if (availableDates.length > 1) return availableDates[1];
    return availableDates.length > 0 ? availableDates[0] : "";
  });
  const [weekB, setWeekB] = useState<string>(() => {
    if (availableWeeks.length > 1) return availableWeeks[1].start;
    return availableWeeks.length > 0 ? availableWeeks[0].start : "";
  });
  const [taskB, setTaskB] = useState<string>("__TOTAL__");

  // ── 2. SELECCIÓN DE MÉTRICAS A COMPARAR ──
  const [selectedMetricKeys, setSelectedMetricKeys] = useState<string[]>(() => {
    const initial = favoriteKeys.filter((k) => allVariables.some((v) => v.key === k));
    return initial.length > 0 ? initial : DEFAULT_FAVORITE_GPS_VARIABLES.slice(0, 8);
  });

  // Modalidad de visualización de gráficos ("cards" = tarjetas individuales con escala propia, "relative" = gráfico de barras % de variación, "radar" = perfil radial)
  const [chartViewMode, setChartViewMode] = useState<"cards" | "relative" | "radar">("cards");

  // ── 3. DETECCIÓN DINÁMICA DE TAREAS PARA CADA FECHA ──
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

  // Si cambia la fecha y la tarea seleccionada ya no existe, reajustar a "__TOTAL__"
  useEffect(() => {
    if (taskA !== "__TOTAL__" && !tasksAvailableA.includes(taskA)) {
      setTaskA("__TOTAL__");
    }
  }, [dateA, tasksAvailableA]);

  useEffect(() => {
    if (taskB !== "__TOTAL__" && !tasksAvailableB.includes(taskB)) {
      setTaskB("__TOTAL__");
    }
  }, [dateB, tasksAvailableB]);

  // ── 4. RESOLUCIÓN DE MATCH DAY Y JUGADORES ──
  const resolveMatchDay = (fecha: string): string => {
    if (!fecha) return "MD";
    try {
      if (planificacionDays && planificacionDays.length > 0) {
        const planItem = planificacionDays.find((d: any) => d && (d.fecha === fecha || d.id === fecha));
        if (planItem?.md && typeof planItem.md === "string" && planItem.md.trim()) {
          const clean = planItem.md.trim();
          return /^[-+]?\d+\s*MD$/i.test(clean) ? `MD${clean.replace(/MD/i, "").trim()}` : clean;
        }
      }
      if (typeof window !== "undefined") {
        const planKeys = ["planificacion_days_v5", "planificacion_days_v4", "planificacion_days_v2", "planificacion_days_v1"];
        for (const k of planKeys) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const days = JSON.parse(raw);
            const list = Array.isArray(days) ? days : Object.values(days);
            const found = list.find((d: any) => d && (d.fecha === fecha || d.id === fecha));
            if (found?.md && typeof found.md === "string" && found.md.trim()) {
              const clean = found.md.trim();
              return /^[-+]?\d+\s*MD$/i.test(clean) ? `MD${clean.replace(/MD/i, "").trim()}` : clean;
            }
          }
        }
      }
    } catch {}
    const rec = teamGpsRecords.find((r) => r.fecha === fecha && r.match_day && r.match_day.trim());
    if (rec?.match_day) return rec.match_day.trim();
    return "MD";
  };

  const getPlayerInfo = (id: string): JugadorRef => {
    if (id === "TEAM") {
      return {
        id: "TEAM",
        nombre: "Media del Equipo",
        apodo: "Media Equipo",
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

  const weekInfoA = useMemo(() => getWeekInfo(weekA), [weekA, availableWeeks]);
  const weekInfoB = useMemo(() => getWeekInfo(weekB), [weekB, availableWeeks]);

  // ── 5. CÁLCULO DE MÉTRICAS (CON SOPORTE DE TAREAS Y MICROCICLOS) ──
  const calculateEntityMetrics = (
    playerId: string,
    targetKey: string,
    targetTask: string
  ): Record<string, number> => {
    const isTeam = playerId === "TEAM";
    const result: Record<string, number> = {};

    if (mode === "sesion") {
      const fecha = targetKey;
      if (!fecha) return result;

      if (isTeam) {
        const sessionRecs = teamGpsRecords.filter((r) => r.fecha === fecha);
        if (sessionRecs.length === 0) return result;

        allVariables.forEach((v) => {
          const values: number[] = [];
          sessionRecs.forEach((r) => {
            if (targetTask && targetTask !== "__TOTAL__") {
              const t = (r.metricas?.tareas || []).find(
                (x: any) => (x.nombre || x.task || x.tarea || "").trim() === targetTask
              );
              if (t) {
                const val = calculateGpsMetricValue(t, v.key, derivedVariables);
                if (val > 0) values.push(val);
              }
            } else {
              const val = calculateGpsMetricValue(r.metricas, v.key, derivedVariables);
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

        let targetObj: any = r.metricas;
        if (targetTask && targetTask !== "__TOTAL__") {
          const t = (r.metricas?.tareas || []).find(
            (x: any) => (x.nombre || x.task || x.tarea || "").trim() === targetTask
          );
          targetObj = t || null;
        }

        allVariables.forEach((v) => {
          result[v.key] = targetObj ? calculateGpsMetricValue(targetObj, v.key, derivedVariables) : 0;
        });
      }
    } else {
      // MODO MICROCICLO
      const weekDates = getWeekInfo(targetKey).dates;
      if (weekDates.length === 0) return result;

      if (isTeam) {
        const weekRecords = teamGpsRecords.filter((r) => weekDates.includes(r.fecha));
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
        const playerRecs = teamGpsRecords.filter((r) => r.jugador_id === playerId && weekDates.includes(r.fecha));
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
    () => calculateEntityMetrics(jugadorIdA, mode === "sesion" ? dateA : weekA, taskA),
    [jugadorIdA, dateA, weekA, taskA, mode, teamGpsRecords, allVariables, derivedVariables]
  );

  const metricsB = useMemo(
    () => calculateEntityMetrics(jugadorIdB, mode === "sesion" ? dateB : weekB, taskB),
    [jugadorIdB, dateB, weekB, taskB, mode, teamGpsRecords, allVariables, derivedVariables]
  );

  // ── 6. LISTA DE MÉTRICAS FILTRADAS / SELECCIONADAS ──
  const activeVariables = useMemo(() => {
    return allVariables.filter((v) => selectedMetricKeys.includes(v.key));
  }, [allVariables, selectedMetricKeys]);

  const toggleMetric = (key: string) => {
    setSelectedMetricKeys((prev) => {
      if (prev.includes(key)) {
        if (prev.length <= 1) return prev; // Mantener al menos 1
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  };

  // Presets de selección de métricas
  const handleSelectPresetMetrics = (type: "favs" | "volumen" | "velocidad" | "aceleracion" | "all") => {
    if (type === "favs") {
      const favs = favoriteKeys.filter((k) => allVariables.some((v) => v.key === k));
      setSelectedMetricKeys(favs.length > 0 ? favs : DEFAULT_FAVORITE_GPS_VARIABLES);
    } else if (type === "volumen") {
      const keys = allVariables.filter((v) => v.categoria === "Volumen y Distancia" || v.categoria === "Tiempo").map((v) => v.key);
      setSelectedMetricKeys(keys.length > 0 ? keys : selectedMetricKeys);
    } else if (type === "velocidad") {
      const keys = allVariables.filter((v) => v.categoria === "Velocidad e Intensidad").map((v) => v.key);
      setSelectedMetricKeys(keys.length > 0 ? keys : selectedMetricKeys);
    } else if (type === "aceleracion") {
      const keys = allVariables.filter((v) => v.categoria === "Aceleraciones y Desaceleraciones").map((v) => v.key);
      setSelectedMetricKeys(keys.length > 0 ? keys : selectedMetricKeys);
    } else if (type === "all") {
      setSelectedMetricKeys(allVariables.map((v) => v.key));
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

      const tempT = taskA;
      setTaskA(taskB);
      setTaskB(tempT);
    } else {
      const tempW = weekA;
      setWeekA(weekB);
      setWeekB(tempW);
    }
  };

  // Nombres cortos para etiquetas y leyendas
  const shortNameA = playerA.apodo || playerA.nombre.split(" ")[0] || "A";
  const shortNameB = playerB.apodo || playerB.nombre.split(" ")[0] || "B";

  const subLabelA = useMemo(() => {
    if (mode === "sesion") {
      const taskStr = taskA && taskA !== "__TOTAL__" ? ` · [${taskA}]` : "";
      return `${formatDateDisplay(dateA)} (${resolveMatchDay(dateA)})${taskStr}`;
    }
    return weekInfoA.label;
  }, [mode, dateA, taskA, weekInfoA]);

  const subLabelB = useMemo(() => {
    if (mode === "sesion") {
      const taskStr = taskB && taskB !== "__TOTAL__" ? ` · [${taskB}]` : "";
      return `${formatDateDisplay(dateB)} (${resolveMatchDay(dateB)})${taskStr}`;
    }
    return weekInfoB.label;
  }, [mode, dateB, taskB, weekInfoB]);

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
                else setWeekB(weekA);
              }}
              style={{
                padding: "3px 8px",
                borderRadius: "5px",
                border: (mode === "sesion" ? dateA === dateB : weekA === weekB) ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
                background: (mode === "sesion" ? dateA === dateB : weekA === weekB) ? "#eff6ff" : "#f8fafc",
                color: (mode === "sesion" ? dateA === dateB : weekA === weekB) ? "#1e3a8a" : "#475569",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Misma Fecha/Semana
            </button>
            {mode === "sesion" && (
              <button
                type="button"
                onClick={() => setTaskB(taskA)}
                style={{
                  padding: "3px 8px",
                  borderRadius: "5px",
                  border: taskA === taskB ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
                  background: taskA === taskB ? "#eff6ff" : "#f8fafc",
                  color: taskA === taskB ? "#1e3a8a" : "#475569",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Misma Tarea
              </button>
            )}
            <button
              type="button"
              onClick={() => setJugadorIdB("TEAM")}
              style={{
                padding: "3px 8px",
                borderRadius: "5px",
                border: jugadorIdB === "TEAM" ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
                background: jugadorIdB === "TEAM" ? "#eff6ff" : "#f8fafc",
                color: jugadorIdB === "TEAM" ? "#1e3a8a" : "#475569",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              vs Media Equipo
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
              <option value="TEAM">👥 Media del Equipo</option>
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
              <select
                value={weekA}
                onChange={(e) => setWeekA(e.target.value)}
                style={{
                  flex: "1 1 150px",
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
                {availableWeeks.map((w) => (
                  <option key={w.start} value={w.start}>
                    {w.label}
                  </option>
                ))}
              </select>
            )}

            {/* Tarea A (solo sesión) */}
            {mode === "sesion" && (
              <select
                value={taskA}
                onChange={(e) => setTaskA(e.target.value)}
                style={{
                  flex: "1 1 140px",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  border: "1px solid #93c5fd",
                  background: "#eff6ff",
                  fontSize: "11.5px",
                  fontWeight: 800,
                  color: "#1e3a8a",
                  outline: "none",
                }}
                title="Tarea de entrenamiento A"
              >
                <option value="__TOTAL__">🎯 Toda la Sesión (Total)</option>
                {tasksAvailableA.map((tName) => (
                  <option key={tName} value={tName}>
                    ⚡ Tarea: {tName}
                  </option>
                ))}
              </select>
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
              <option value="TEAM">👥 Media del Equipo</option>
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
              <select
                value={weekB}
                onChange={(e) => setWeekB(e.target.value)}
                style={{
                  flex: "1 1 150px",
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
                {availableWeeks.map((w) => (
                  <option key={w.start} value={w.start}>
                    {w.label}
                  </option>
                ))}
              </select>
            )}

            {/* Tarea B (solo sesión) */}
            {mode === "sesion" && (
              <select
                value={taskB}
                onChange={(e) => setTaskB(e.target.value)}
                style={{
                  flex: "1 1 140px",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  border: "1px solid #fdba74",
                  background: "#fff7ed",
                  fontSize: "11.5px",
                  fontWeight: 800,
                  color: "#c2410c",
                  outline: "none",
                }}
                title="Tarea de entrenamiento B"
              >
                <option value="__TOTAL__">🎯 Toda la Sesión (Total)</option>
                {tasksAvailableB.map((tName) => (
                  <option key={tName} value={tName}>
                    ⚡ Tarea: {tName}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* ── SELECTOR DE MÉTRICAS GPS INTERACTIVO (CHIPS) (NO-PRINT) ── */}
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
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
              🎯 Métricas seleccionadas ({selectedMetricKeys.length}/{allVariables.length}):
            </span>
          </div>

          {/* Botones de selección rápida por categorías */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => handleSelectPresetMetrics("favs")}
              style={{ padding: "3px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
            >
              ⭐ Favoritas ({favoriteKeys.length})
            </button>
            <button
              type="button"
              onClick={() => handleSelectPresetMetrics("volumen")}
              style={{ padding: "3px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
            >
              🏃 Volumen
            </button>
            <button
              type="button"
              onClick={() => handleSelectPresetMetrics("velocidad")}
              style={{ padding: "3px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
            >
              ⚡ Velocidad
            </button>
            <button
              type="button"
              onClick={() => handleSelectPresetMetrics("aceleracion")}
              style={{ padding: "3px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
            >
              💥 Acc/Dec
            </button>
            <button
              type="button"
              onClick={() => handleSelectPresetMetrics("all")}
              style={{ padding: "3px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
            >
              ✅ Todas
            </button>
          </div>
        </div>

        {/* Chips de variables */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "120px", overflowY: "auto", padding: "2px" }}>
          {allVariables.map((v) => {
            const isSelected = selectedMetricKeys.includes(v.key);
            const isFav = favoriteKeys.includes(v.key);
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => toggleMetric(v.key)}
                style={{
                  padding: "4px 10px",
                  borderRadius: "16px",
                  fontSize: "11px",
                  fontWeight: isSelected ? 800 : 600,
                  border: isSelected ? "1.5px solid #1e3a8a" : "1px solid #cbd5e1",
                  background: isSelected ? "#1e3a8a" : "#ffffff",
                  color: isSelected ? "#ffffff" : "#475569",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  transition: "all 0.15s ease",
                }}
              >
                {isFav && <span style={{ color: isSelected ? "#fef08a" : "#eab308" }}>⭐</span>}
                <span>{v.label}</span>
                <span style={{ opacity: 0.75, fontSize: "10px" }}>({v.unit})</span>
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
                {playerA.id === "TEAM" ? "Media del Equipo" : (playerA.apodo || playerA.nombre)}
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
                {playerB.id === "TEAM" ? "Media del Equipo" : (playerB.apodo || playerB.nombre)}
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
                        {playerA.id === "TEAM" ? "Media Equipo" : (playerA.apodo || playerA.nombre)}
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
                        {playerB.id === "TEAM" ? "Media Equipo" : (playerB.apodo || playerB.nombre)}
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

        {/* MODO 3: GRÁFICO RADAR */}
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
            <div style={{ textAlign: "center", marginBottom: "8px" }}>
              <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
                🕸️ Perfil Físico Comparado (Escala Normalizada 0-100)
              </h4>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                Huella física superpuesta: Azul ({shortNameA}) vs Naranja ({shortNameB})
              </span>
            </div>

            <div style={{ width: "100%", height: 360, maxWidth: "560px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#cbd5e1" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fontWeight: 800, fill: "#0f172a" }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Radar name={shortNameA} dataKey="A" stroke="#1e3a8a" fill="#1e3a8a" fillOpacity={0.4} strokeWidth={2} />
                  <Radar name={shortNameB} dataKey="B" stroke="#ea580c" fill="#ea580c" fillOpacity={0.4} strokeWidth={2} />
                  <Legend wrapperStyle={{ fontSize: "11px", fontWeight: 800 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", fontSize: "11px" }}
                    formatter={(val: any, name: any, item: any) => [
                      `${item.payload[`raw${name === shortNameA ? "A" : "B"}`]} ${item.payload.unit} (${val}%)`,
                      name,
                    ]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

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
