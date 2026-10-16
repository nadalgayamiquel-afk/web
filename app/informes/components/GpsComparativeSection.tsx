"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  ComposedChart,
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
  // ── 1. ESTADOS DE SELECCIÓN A Y B ──
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

  // Elemento B
  const [jugadorIdB, setJugadorIdB] = useState<string>(() => {
    // Por defecto el mismo jugador para comparar sesiones/microciclos distintos,
    // o el segundo jugador si hay varios disponibles
    return initialPlayerId;
  });
  const [dateB, setDateB] = useState<string>(() => {
    // Si hay más de una fecha disponible, seleccionar la segunda para comparar directamente
    if (availableDates.length > 1) return availableDates[1];
    return availableDates.length > 0 ? availableDates[0] : "";
  });
  const [weekB, setWeekB] = useState<string>(() => {
    if (availableWeeks.length > 1) return availableWeeks[1].start;
    return availableWeeks.length > 0 ? availableWeeks[0].start : "";
  });

  // Filtros de visualización
  const [filterOnlyFavs, setFilterOnlyFavs] = useState<boolean>(true);
  const [selectedDayMetric, setSelectedDayMetric] = useState<string>("Distance(m)");

  // ── 2. HELPERS DE RESOLUCIÓN DE MATCH DAY Y JUGADOR ──
  const resolveMatchDay = (fecha: string): string => {
    if (!fecha) return "MD";
    try {
      const planItem = planificacionDays.find((d: any) => d && (d.fecha === fecha || d.id === fecha));
      if (planItem?.md && typeof planItem.md === "string" && planItem.md.trim()) {
        const clean = planItem.md.trim();
        return /^[-+]?\d+\s*MD$/i.test(clean) ? `MD${clean.replace(/MD/i, "").trim()}` : clean;
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
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
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

  // ── 3. CÁLCULO DE MÉTRICAS (SESIÓN O MICROCICLO) ──
  const calculateEntityMetrics = (playerId: string, targetKey: string): Record<string, number> => {
    const isTeam = playerId === "TEAM";
    const result: Record<string, number> = {};

    if (mode === "sesion") {
      const fecha = targetKey;
      if (!fecha) return result;

      if (isTeam) {
        // Promedio de todos los jugadores presentes en la sesión
        const sessionRecords = teamGpsRecords.filter((r) => r.fecha === fecha);
        if (sessionRecords.length === 0) return result;

        allVariables.forEach((v) => {
          if (v.esPicoMaximo) {
            const vals = sessionRecords.map((r) => calculateGpsMetricValue(r.metricas, v.key, derivedVariables));
            result[v.key] = vals.length > 0 ? Math.max(...vals, 0) : 0;
          } else {
            let sum = 0;
            let count = 0;
            sessionRecords.forEach((r) => {
              const val = calculateGpsMetricValue(r.metricas, v.key, derivedVariables);
              if (val > 0) {
                sum += val;
                count++;
              }
            });
            result[v.key] = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;
          }
        });
      } else {
        // Registro del jugador en esa fecha
        const rec = teamGpsRecords.find((r) => r.jugador_id === playerId && r.fecha === fecha);
        allVariables.forEach((v) => {
          result[v.key] = rec ? calculateGpsMetricValue(rec.metricas, v.key, derivedVariables) : 0;
        });
      }
    } else {
      // MODO MICROCICLO (Acumulado semanal)
      const weekDates = getWeekInfo(targetKey).dates;
      if (weekDates.length === 0) return result;

      if (isTeam) {
        // Promedio semanal del equipo por jugador
        const weekRecords = teamGpsRecords.filter((r) => weekDates.includes(r.fecha));
        const uniquePlayers = Array.from(new Set(weekRecords.map((r) => r.jugador_id)));
        if (uniquePlayers.length === 0) return result;

        allVariables.forEach((v) => {
          if (v.esPicoMaximo) {
            const vals = weekRecords.map((r) => calculateGpsMetricValue(r.metricas, v.key, derivedVariables));
            result[v.key] = vals.length > 0 ? Math.max(...vals, 0) : 0;
          } else {
            // Acumular por cada jugador individual y promediar
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
        // Acumulado del jugador en la semana
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
    () => calculateEntityMetrics(jugadorIdA, mode === "sesion" ? dateA : weekA),
    [jugadorIdA, dateA, weekA, mode, teamGpsRecords, allVariables, derivedVariables]
  );

  const metricsB = useMemo(
    () => calculateEntityMetrics(jugadorIdB, mode === "sesion" ? dateB : weekB),
    [jugadorIdB, dateB, weekB, mode, teamGpsRecords, allVariables, derivedVariables]
  );

  // ── 4. VARIABLES A MOSTRAR (FAVORITAS O TODAS) ──
  const displayVariables = useMemo(() => {
    let list = allVariables;
    if (filterOnlyFavs) {
      list = allVariables.filter((v) => favoriteKeys.includes(v.key) || v.esDerivada);
      if (list.length === 0) {
        list = allVariables.filter((v) => DEFAULT_FAVORITE_GPS_VARIABLES.includes(v.key));
      }
    }
    return list;
  }, [allVariables, filterOnlyFavs, favoriteKeys]);

  // ── 5. INTERCAMBIAR A Y B ──
  const handleSwap = () => {
    const tempP = jugadorIdA;
    setJugadorIdA(jugadorIdB);
    setJugadorIdB(tempP);

    if (mode === "sesion") {
      const tempD = dateA;
      setDateA(dateB);
      setDateB(tempD);
    } else {
      const tempW = weekA;
      setWeekA(weekB);
      setWeekB(tempW);
    }
  };

  // Nombres y etiquetas cortas para encabezados y leyendas
  const labelA = useMemo(() => {
    const pName = playerA.apodo || playerA.nombre.split(" ")[0] || "A";
    const sub = mode === "sesion" ? `${formatDateDisplay(dateA)} (${resolveMatchDay(dateA)})` : weekInfoA.label;
    return `${pName} [${sub}]`;
  }, [playerA, dateA, weekA, mode, weekInfoA]);

  const labelB = useMemo(() => {
    const pName = playerB.apodo || playerB.nombre.split(" ")[0] || "B";
    const sub = mode === "sesion" ? `${formatDateDisplay(dateB)} (${resolveMatchDay(dateB)})` : weekInfoB.label;
    return `${pName} [${sub}]`;
  }, [playerB, dateB, weekB, mode, weekInfoB]);

  const shortNameA = playerA.apodo || playerA.nombre.split(" ")[0] || "A";
  const shortNameB = playerB.apodo || playerB.nombre.split(" ")[0] || "B";

  // ── 6. DATASET PARA EL GRÁFICO COMPARATIVO PRINCIPAL ──
  const chartData = useMemo(() => {
    return displayVariables.map((v) => {
      const valA = metricsA[v.key] ?? 0;
      const valB = metricsB[v.key] ?? 0;
      return {
        key: v.key,
        name: v.shortLabel || v.label,
        unit: v.unit,
        [shortNameA]: valA,
        [shortNameB]: valB,
      };
    });
  }, [displayVariables, metricsA, metricsB, shortNameA, shortNameB]);

  // ── 7. DATASET PARA EVOLUCIÓN DÍA A DÍA EN MICROCICLO ──
  const dayProgressionData = useMemo(() => {
    if (mode !== "microciclo") return [];
    const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const datesA = weekInfoA.dates;
    const datesB = weekInfoB.dates;

    return dayNames.map((dayName, idx) => {
      const dayDateA = datesA[idx] || "";
      const dayDateB = datesB[idx] || "";

      let valA = 0;
      let valB = 0;

      if (dayDateA) {
        if (jugadorIdA === "TEAM") {
          const recs = teamGpsRecords.filter((r) => r.fecha === dayDateA);
          if (recs.length > 0) {
            valA = Math.round(recs.reduce((acc, r) => acc + calculateGpsMetricValue(r.metricas, selectedDayMetric, derivedVariables), 0) / recs.length);
          }
        } else {
          const rec = teamGpsRecords.find((r) => r.jugador_id === jugadorIdA && r.fecha === dayDateA);
          if (rec) valA = calculateGpsMetricValue(rec.metricas, selectedDayMetric, derivedVariables);
        }
      }

      if (dayDateB) {
        if (jugadorIdB === "TEAM") {
          const recs = teamGpsRecords.filter((r) => r.fecha === dayDateB);
          if (recs.length > 0) {
            valB = Math.round(recs.reduce((acc, r) => acc + calculateGpsMetricValue(r.metricas, selectedDayMetric, derivedVariables), 0) / recs.length);
          }
        } else {
          const rec = teamGpsRecords.find((r) => r.jugador_id === jugadorIdB && r.fecha === dayDateB);
          if (rec) valB = calculateGpsMetricValue(rec.metricas, selectedDayMetric, derivedVariables);
        }
      }

      return {
        day: dayName,
        dateA: dayDateA ? formatDateDisplay(dayDateA) : "",
        dateB: dayDateB ? formatDateDisplay(dayDateB) : "",
        [shortNameA]: valA,
        [shortNameB]: valB,
      };
    });
  }, [mode, weekInfoA, weekInfoB, jugadorIdA, jugadorIdB, teamGpsRecords, selectedDayMetric, derivedVariables, shortNameA, shortNameB]);

  // ── 8. KPIs PRINCIPALES ──
  const TOP_KPIS = [
    { key: "Distance(m)", label: "Distancia Total", unit: "m" },
    { key: "Distance +21 (m)", label: "Distancia +21 km/h", unit: "m" },
    { key: "MAX Speed(km/h)", label: "Velocidad Máx.", unit: "km/h" },
    { key: "Sprints Count", label: "Sprints (+24 km/h)", unit: "nº" },
    { key: "Player Load", label: "Player Load", unit: "" },
    { key: "Acc+Dec", label: "Acc + Dec (+3 m/s²)", unit: "nº" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* ── CABECERA ESTÁNDAR DEL INFORME (IMPRIMIBLE) ── */}
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
              MODO COMPARATIVO
            </span>
          </div>
          <h2 style={{ fontSize: "21px", fontWeight: 900, color: "#0f172a", margin: "4px 0 0 0", textTransform: "uppercase", letterSpacing: "0.02em" }}>
            {mode === "sesion" ? "INFORME COMPARATIVO GPS - SESIÓN" : "INFORME COMPARATIVO GPS - MICROCICLO"}
          </h2>
          <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#475569" }}>
            {mode === "sesion" ? "Análisis cruzado entre 2 sesiones de entrenamiento / partidos" : "Análisis cruzado entre 2 microciclos semanales"}
          </span>
        </div>

        {/* Derecha: Botón de Exportar a PDF (no-print) y Fechas */}
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
            Fecha de impresión: {new Date().toLocaleDateString("es-ES")}
          </span>
        </div>
      </div>

      {/* ── PANEL DE CONTROL INTERACTIVO DE SELECTORES (NO-PRINT) ── */}
      <div
        className="no-print"
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          padding: "16px 20px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        {/* Presets rápidos */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", borderBottom: "1px solid #f1f5f9", paddingBottom: "10px" }}>
          <span style={{ fontSize: "12px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            ⚡ Accesos Rápidos de Comparación:
          </span>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setJugadorIdB(jugadorIdA)}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: jugadorIdA === jugadorIdB ? "#eff6ff" : "#f8fafc",
                color: jugadorIdA === jugadorIdB ? "#1e40af" : "#475569",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              🔄 Mismo Jugador
            </button>
            <button
              type="button"
              onClick={() => {
                if (mode === "sesion") setDateB(dateA);
                else setWeekB(weekA);
              }}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: (mode === "sesion" ? dateA === dateB : weekA === weekB) ? "#eff6ff" : "#f8fafc",
                color: (mode === "sesion" ? dateA === dateB : weekA === weekB) ? "#1e40af" : "#475569",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              📅 Misma {mode === "sesion" ? "Sesión" : "Semana"}
            </button>
            <button
              type="button"
              onClick={() => setJugadorIdB("TEAM")}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: jugadorIdB === "TEAM" ? "#eff6ff" : "#f8fafc",
                color: jugadorIdB === "TEAM" ? "#1e40af" : "#475569",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              👥 vs Media del Equipo
            </button>
          </div>
        </div>

        {/* Bloque Selectores A vs B */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "16px", alignItems: "center" }}>
          {/* LADO A (AZUL) */}
          <div
            style={{
              background: "#f0fdf4",
              borderRadius: "10px",
              padding: "12px 14px",
              border: "2px solid #1e3a8a",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "11px", fontWeight: 900, color: "#1e3a8a", textTransform: "uppercase" }}>
                🟦 ELEMENTO A (Referencia)
              </span>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", background: "#dbeafe", padding: "1px 6px", borderRadius: "4px" }}>
                Color Azul
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {/* Selector Jugador A */}
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "3px" }}>
                  Jugador A:
                </label>
                <select
                  value={jugadorIdA}
                  onChange={(e) => setJugadorIdA(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: "6px",
                    border: "1px solid #94a3b8",
                    fontSize: "12px",
                    fontWeight: 700,
                    background: "#ffffff",
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
              </div>

              {/* Selector Fecha/Semana A */}
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "3px" }}>
                  {mode === "sesion" ? "Sesión / Fecha A:" : "Microciclo / Semana A:"}
                </label>
                {mode === "sesion" ? (
                  <select
                    value={dateA}
                    onChange={(e) => setDateA(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #94a3b8",
                      fontSize: "12px",
                      fontWeight: 700,
                      background: "#ffffff",
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
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #94a3b8",
                      fontSize: "12px",
                      fontWeight: 700,
                      background: "#ffffff",
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
              </div>
            </div>
          </div>

          {/* BOTÓN INTERCAMBIAR ⇄ */}
          <button
            type="button"
            onClick={handleSwap}
            title="Intercambiar A ⇄ B"
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "50%",
              background: "#ffffff",
              border: "2px solid #cbd5e1",
              boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
              fontWeight: 900,
              color: "#334155",
              cursor: "pointer",
              transition: "transform 0.15s ease",
            }}
          >
            ⇄
          </button>

          {/* LADO B (NARANJA) */}
          <div
            style={{
              background: "#fff7ed",
              borderRadius: "10px",
              padding: "12px 14px",
              border: "2px solid #ea580c",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "11px", fontWeight: 900, color: "#ea580c", textTransform: "uppercase" }}>
                🟧 ELEMENTO B (Comparación)
              </span>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#ea580c", background: "#ffedd5", padding: "1px 6px", borderRadius: "4px" }}>
                Color Naranja
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {/* Selector Jugador B */}
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "3px" }}>
                  Jugador B:
                </label>
                <select
                  value={jugadorIdB}
                  onChange={(e) => setJugadorIdB(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: "6px",
                    border: "1px solid #fdba74",
                    fontSize: "12px",
                    fontWeight: 700,
                    background: "#ffffff",
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
              </div>

              {/* Selector Fecha/Semana B */}
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "3px" }}>
                  {mode === "sesion" ? "Sesión / Fecha B:" : "Microciclo / Semana B:"}
                </label>
                {mode === "sesion" ? (
                  <select
                    value={dateB}
                    onChange={(e) => setDateB(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #fdba74",
                      fontSize: "12px",
                      fontWeight: 700,
                      background: "#ffffff",
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
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #fdba74",
                      fontSize: "12px",
                      fontWeight: 700,
                      background: "#ffffff",
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
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── BANNER VISUAL DE COMPARACIÓN (APARECE EN PANTALLA Y EN PDF) ── */}
      <div
        style={{
          background: "linear-gradient(90deg, #eff6ff 0%, #ffffff 50%, #fff7ed 100%)",
          borderRadius: "10px",
          padding: "14px 20px",
          border: "1px solid #cbd5e1",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "14px",
        }}
      >
        {/* Lado A Info */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {playerA.foto_url ? (
            <img
              src={playerA.foto_url}
              alt={playerA.nombre}
              style={{ width: "44px", height: "44px", borderRadius: "50%", objectFit: "cover", border: "2px solid #1e3a8a" }}
            />
          ) : (
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                background: "#1e3a8a",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: "16px",
              }}
            >
              {playerA.id === "TEAM" ? "👥" : (playerA.dorsal || (playerA.apodo || playerA.nombre)[0])}
            </div>
          )}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "14px", fontWeight: 900, color: "#1e3a8a" }}>
                {playerA.id === "TEAM" ? "Media del Equipo" : (playerA.apodo || playerA.nombre)}
              </span>
              {playerA.posicion && playerA.id !== "TEAM" && (
                <span style={{ fontSize: "10px", background: "#dbeafe", color: "#1e40af", padding: "1px 6px", borderRadius: "4px", fontWeight: 800 }}>
                  {playerA.posicion}
                </span>
              )}
            </div>
            <div style={{ fontSize: "12px", color: "#475569", fontWeight: 700 }}>
              {mode === "sesion" ? (
                <>
                  <span>{formatDateDisplay(dateA)}</span> · <strong style={{ color: "#1e3a8a" }}>{resolveMatchDay(dateA)}</strong>
                </>
              ) : (
                <>
                  <span>{weekInfoA.label}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* VS Badge */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
          <span
            style={{
              padding: "4px 14px",
              borderRadius: "20px",
              background: "#0f172a",
              color: "#ffffff",
              fontSize: "12px",
              fontWeight: 900,
              letterSpacing: "0.08em",
            }}
          >
            V S
          </span>
          <span style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 700 }}>
            {jugadorIdA === jugadorIdB ? "Mismo jugador" : "Diferentes jugadores"}
          </span>
        </div>

        {/* Lado B Info */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexDirection: "row-reverse", textAlign: "right" }}>
          {playerB.foto_url ? (
            <img
              src={playerB.foto_url}
              alt={playerB.nombre}
              style={{ width: "44px", height: "44px", borderRadius: "50%", objectFit: "cover", border: "2px solid #ea580c" }}
            />
          ) : (
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                background: "#ea580c",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: "16px",
              }}
            >
              {playerB.id === "TEAM" ? "👥" : (playerB.dorsal || (playerB.apodo || playerB.nombre)[0])}
            </div>
          )}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "flex-end" }}>
              {playerB.posicion && playerB.id !== "TEAM" && (
                <span style={{ fontSize: "10px", background: "#ffedd5", color: "#c2410c", padding: "1px 6px", borderRadius: "4px", fontWeight: 800 }}>
                  {playerB.posicion}
                </span>
              )}
              <span style={{ fontSize: "14px", fontWeight: 900, color: "#ea580c" }}>
                {playerB.id === "TEAM" ? "Media del Equipo" : (playerB.apodo || playerB.nombre)}
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "#475569", fontWeight: 700 }}>
              {mode === "sesion" ? (
                <>
                  <span>{formatDateDisplay(dateB)}</span> · <strong style={{ color: "#ea580c" }}>{resolveMatchDay(dateB)}</strong>
                </>
              ) : (
                <>
                  <span>{weekInfoB.label}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── TOP KPI CARDS RESUMEN ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "10px",
        }}
      >
        {TOP_KPIS.map((kpi) => {
          const valA = metricsA[kpi.key] ?? 0;
          const valB = metricsB[kpi.key] ?? 0;
          const diff = Math.round((valB - valA) * 100) / 100;
          const pct = valA > 0 ? Math.round(((valB - valA) / valA) * 1000) / 10 : (valB > 0 ? 100 : 0);
          const isUp = diff > 0;
          const isDown = diff < 0;

          return (
            <div
              key={kpi.key}
              style={{
                background: "#ffffff",
                borderRadius: "8px",
                padding: "10px 12px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569" }}>
                  {kpi.label}
                </span>
                <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 700 }}>
                  {kpi.unit}
                </span>
              </div>

              {/* Valores A vs B */}
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: "2px" }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "9px", color: "#1e3a8a", fontWeight: 800 }}>{shortNameA}</span>
                  <span style={{ fontSize: "15px", fontWeight: 900, color: "#1e3a8a" }}>
                    {valA.toLocaleString("es-ES")}
                  </span>
                </div>

                <span style={{ fontSize: "11px", color: "#cbd5e1", fontWeight: 800 }}>vs</span>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span style={{ fontSize: "9px", color: "#ea580c", fontWeight: 800 }}>{shortNameB}</span>
                  <span style={{ fontSize: "15px", fontWeight: 900, color: "#ea580c" }}>
                    {valB.toLocaleString("es-ES")}
                  </span>
                </div>
              </div>

              {/* Badge de variación */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: "4px",
                  borderTop: "1px dashed #f1f5f9",
                  marginTop: "2px",
                }}
              >
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700 }}>
                  Dif: {diff > 0 ? `+${diff.toLocaleString("es-ES")}` : diff.toLocaleString("es-ES")}
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 900,
                    padding: "1px 6px",
                    borderRadius: "4px",
                    background: isUp ? "#dcfce7" : isDown ? "#fee2e2" : "#f1f5f9",
                    color: isUp ? "#15803d" : isDown ? "#b91c1c" : "#64748b",
                  }}
                >
                  {isUp ? "▲ " : isDown ? "▼ " : "= "}
                  {isUp ? `+${pct}%` : `${pct}%`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── COMPARATIVA DE GRÁFICOS ── */}
      <div style={{ display: "grid", gridTemplateColumns: mode === "microciclo" ? "1.2fr 0.8fr" : "1fr", gap: "14px" }}>
        {/* GRÁFICO 1: BARRAS AGRUPADAS DE VARIABLES */}
        <div
          style={{
            background: "#ffffff",
            padding: "16px 18px",
            borderRadius: "10px",
            border: "1px solid #cbd5e1",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
            <h3 style={{ margin: 0, fontSize: "13px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
              📊 Comparativa de Métricas GPS ({chartData.length} Variables)
            </h3>

            {/* Leyenda en cabecera */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "11px", fontWeight: 800 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#1e3a8a", display: "inline-block" }} />
                <span style={{ color: "#1e3a8a" }}>{labelA}</span>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#ea580c", display: "inline-block" }} />
                <span style={{ color: "#ea580c" }}>{labelB}</span>
              </div>
            </div>
          </div>

          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 22, right: 15, left: -10, bottom: 45 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  dataKey="name"
                  stroke="#000000"
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  tick={{ fontSize: 10, fontWeight: 800, fill: "#0f172a" }}
                />
                <YAxis stroke="#000000" tick={{ fontSize: 9.5, fontWeight: 700 }} />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "11px" }}
                  formatter={(value: any, name: any, item: any) => [
                    `${typeof value === "number" ? value.toLocaleString("es-ES") : value} ${item.payload.unit || ""}`,
                    name,
                  ]}
                />
                <Bar dataKey={shortNameA} name={labelA} fill="#1e3a8a" radius={[4, 4, 0, 0]} barSize={22}>
                  <LabelList
                    dataKey={shortNameA}
                    position="top"
                    style={{ fontSize: "9px", fontWeight: 800, fill: "#1e3a8a" }}
                    formatter={(val: any) => (typeof val === "number" && val > 0 ? (val >= 100 ? Math.round(val).toLocaleString("es-ES") : val.toLocaleString("es-ES")) : "")}
                  />
                </Bar>
                <Bar dataKey={shortNameB} name={labelB} fill="#ea580c" radius={[4, 4, 0, 0]} barSize={22}>
                  <LabelList
                    dataKey={shortNameB}
                    position="top"
                    style={{ fontSize: "9px", fontWeight: 800, fill: "#ea580c" }}
                    formatter={(val: any) => (typeof val === "number" && val > 0 ? (val >= 100 ? Math.round(val).toLocaleString("es-ES") : val.toLocaleString("es-ES")) : "")}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* GRÁFICO 2: EVOLUCIÓN DÍA A DÍA (SOLO MICROCICLO) */}
        {mode === "microciclo" && (
          <div
            style={{
              background: "#ffffff",
              padding: "16px 18px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <h3 style={{ margin: 0, fontSize: "12.5px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
                📈 Evolución Día a Día
              </h3>
              <select
                value={selectedDayMetric}
                onChange={(e) => setSelectedDayMetric(e.target.value)}
                style={{
                  fontSize: "11px",
                  padding: "3px 6px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  fontWeight: 700,
                  outline: "none",
                }}
              >
                {displayVariables.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.label} {v.unit ? `(${v.unit})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dayProgressionData} margin={{ top: 22, right: 10, left: -15, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="day" stroke="#000000" tick={{ fontSize: 10, fontWeight: 800 }} />
                  <YAxis stroke="#000000" tick={{ fontSize: 9.5, fontWeight: 700 }} />
                  <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "11px" }} />
                  <Bar dataKey={shortNameA} name={labelA} fill="#1e3a8a" radius={[3, 3, 0, 0]} barSize={16}>
                    <LabelList dataKey={shortNameA} position="top" style={{ fontSize: "8.5px", fontWeight: 800, fill: "#1e3a8a" }} formatter={(val: any) => typeof val === "number" && val > 0 ? (val >= 100 ? Math.round(val) : val) : ""} />
                  </Bar>
                  <Bar dataKey={shortNameB} name={labelB} fill="#ea580c" radius={[3, 3, 0, 0]} barSize={16}>
                    <LabelList dataKey={shortNameB} position="top" style={{ fontSize: "8.5px", fontWeight: 800, fill: "#ea580c" }} formatter={(val: any) => typeof val === "number" && val > 0 ? (val >= 100 ? Math.round(val) : val) : ""} />
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* ── TABLA COMPARATIVA DETALLADA ── */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "10px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}
      >
        {/* Cabecera de la tabla con filtro */}
        <div
          style={{
            padding: "12px 18px",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "15px" }}>📋</span>
            <h3 style={{ margin: 0, fontSize: "13.5px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
              Tabla Comparativa Detallada de Métricas GPS
            </h3>
            <span style={{ fontSize: "11px", fontWeight: 800, background: "#e2e8f0", color: "#334155", padding: "1px 8px", borderRadius: "10px" }}>
              {displayVariables.length} métricas
            </span>
          </div>

          {/* Botones de filtro de variables */}
          <div className="no-print" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#64748b" }}>Mostrar:</span>
            <button
              type="button"
              onClick={() => setFilterOnlyFavs(true)}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: filterOnlyFavs ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
                background: filterOnlyFavs ? "#1e3a8a" : "#ffffff",
                color: filterOnlyFavs ? "#ffffff" : "#475569",
                fontSize: "11px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              ⭐ Solo Favoritas ({favoriteKeys.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterOnlyFavs(false)}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: !filterOnlyFavs ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
                background: !filterOnlyFavs ? "#1e3a8a" : "#ffffff",
                color: !filterOnlyFavs ? "#ffffff" : "#475569",
                fontSize: "11px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              📋 Todas ({allVariables.length})
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#0f172a", color: "#ffffff", borderBottom: "1px solid #334155" }}>
                <th style={{ padding: "10px 14px", fontWeight: 800, width: "28%" }}>Métrica GPS</th>
                <th style={{ padding: "10px 14px", fontWeight: 800, width: "10%", textAlign: "center" }}>Unidad</th>
                <th style={{ padding: "10px 14px", fontWeight: 900, width: "16%", textAlign: "right", background: "#1e3a8a" }}>
                  {labelA}
                </th>
                <th style={{ padding: "10px 14px", fontWeight: 900, width: "16%", textAlign: "right", background: "#ea580c" }}>
                  {labelB}
                </th>
                <th style={{ padding: "10px 14px", fontWeight: 800, width: "14%", textAlign: "right" }}>Dif. (B - A)</th>
                <th style={{ padding: "10px 14px", fontWeight: 800, width: "16%", textAlign: "center" }}>Variación / Ratio</th>
              </tr>
            </thead>
            <tbody>
              {displayVariables.map((v, idx) => {
                const valA = metricsA[v.key] ?? 0;
                const valB = metricsB[v.key] ?? 0;
                const diff = Math.round((valB - valA) * 100) / 100;
                const pct = valA > 0 ? Math.round(((valB - valA) / valA) * 1000) / 10 : (valB > 0 ? 100 : 0);
                const isFav = favoriteKeys.includes(v.key);
                const isUp = diff > 0;
                const isDown = diff < 0;

                // Barra proporcional horizontal A vs B
                const maxVal = Math.max(valA, valB, 0.0001);
                const widthPctA = Math.round((valA / maxVal) * 100);
                const widthPctB = Math.round((valB / maxVal) * 100);

                return (
                  <tr
                    key={v.key}
                    style={{
                      background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    {/* Nombre métrica */}
                    <td style={{ padding: "9px 14px", fontWeight: 700, color: "#0f172a" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {isFav && <span title="Variable Favorita" style={{ color: "#eab308", fontSize: "11px" }}>⭐</span>}
                        {v.esDerivada && <span title="Variable Derivada Calculada" style={{ color: "#059669", fontSize: "11px" }}>➕</span>}
                        <span>{v.label}</span>
                      </div>
                    </td>

                    {/* Unidad */}
                    <td style={{ padding: "9px 14px", textAlign: "center", color: "#64748b", fontWeight: 600 }}>
                      <span style={{ background: "#f1f5f9", padding: "1px 6px", borderRadius: "4px", fontSize: "11px" }}>
                        {v.unit || "-"}
                      </span>
                    </td>

                    {/* Valor A */}
                    <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 900, color: "#1e3a8a", background: idx % 2 === 0 ? "rgba(30, 58, 138, 0.04)" : "rgba(30, 58, 138, 0.07)" }}>
                      {valA.toLocaleString("es-ES")}
                    </td>

                    {/* Valor B */}
                    <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 900, color: "#ea580c", background: idx % 2 === 0 ? "rgba(234, 88, 12, 0.04)" : "rgba(234, 88, 12, 0.07)" }}>
                      {valB.toLocaleString("es-ES")}
                    </td>

                    {/* Diferencia B - A */}
                    <td
                      style={{
                        padding: "9px 14px",
                        textAlign: "right",
                        fontWeight: 800,
                        color: isUp ? "#15803d" : isDown ? "#b91c1c" : "#64748b",
                      }}
                    >
                      {diff > 0 ? `+${diff.toLocaleString("es-ES")}` : diff.toLocaleString("es-ES")}
                    </td>

                    {/* Variación % y Barra visual */}
                    <td style={{ padding: "9px 14px", textAlign: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px", alignItems: "center" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 900,
                            padding: "1px 8px",
                            borderRadius: "10px",
                            background: isUp ? "#dcfce7" : isDown ? "#fee2e2" : "#f1f5f9",
                            color: isUp ? "#15803d" : isDown ? "#b91c1c" : "#64748b",
                          }}
                        >
                          {isUp ? "▲ " : isDown ? "▼ " : "= "}
                          {isUp ? `+${pct}%` : `${pct}%`}
                        </span>

                        {/* Barra dual proporcional */}
                        <div style={{ display: "flex", width: "90px", height: "5px", background: "#f1f5f9", borderRadius: "3px", overflow: "hidden", gap: "1px" }}>
                          <div style={{ width: `${widthPctA}%`, background: "#1e3a8a", transition: "width 0.3s ease" }} title={`${shortNameA}: ${valA}`} />
                          <div style={{ width: `${widthPctB}%`, background: "#ea580c", transition: "width 0.3s ease" }} title={`${shortNameB}: ${valB}`} />
                        </div>
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
  );
}
