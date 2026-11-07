"use client";

import React, { useEffect, useState, useRef, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getActiveJugadores, getGpsDatosReport, getOptimizadorSessionNumber } from "@/app/actions";
import { comparePlayersByTacticalPosition } from "@/app/lib/posiciones";
import { ReportNav } from "@/app/informes/ReportNav";
import { useReportClubInfo } from "@/app/lib/useReportClubInfo";
import {
  useFavoriteGpsVariables,
  calculateGpsMetricValue,
  getStoredDerivedVariables,
  GpsVariableDef,
  ALL_GPS_VARIABLES,
} from "@/app/lib/gpsVariables";
import {
  extractMicrocyclesFromGpsData,
  getStoredMicrocycles,
  getDeletedMicrocycleIds,
  getMicrocycleType,
  MICROCICLE_TYPE_CONFIG,
  CustomMicrocycleDef,
  MicrocycleType,
} from "@/app/lib/microciclos";
import { DEFAULT_CUSTOM_MICROCICLOS } from "@/app/cargas/CargaExternaSection";
import GpsComparativeSection from "../components/GpsComparativeSection";
import {
  ComposedChart,
  Bar,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";

type Jugador = {
  id: string;
  nombre: string;
  apodo: string | null;
  posicion: string | null;
  foto_url: string | null;
  fecha_nacimiento: string | null;
  activo: boolean | null;
  cor_id?: string | null;
  dorsal?: number | string | null;
};

type GpsRecord = {
  id: string;
  jugador_id: string;
  fecha: string;
  tipo_sesion: string | null;
  match_day: string | null;
  metricas: Record<string, any> | null;
};

function formatDateDDMM(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return dateStr;
}

function calculateAge(fechaNacimiento: string | null): string {
  if (!fechaNacimiento) return "";
  const birthDate = new Date(fechaNacimiento);
  if (isNaN(birthDate.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return `${age} años`;
}

function isRecordSimulado(record: any): boolean {
  if (!record || !record.metricas) return false;
  return Boolean(
    record.metricas.es_simulado ||
    record.metricas.tipo_registro === "SIMULADO" ||
    (record.metricas.colC && String(record.metricas.colC).toUpperCase().includes("SIMULA"))
  );
}

function getMetricValue(metricas: any, key: string, derivedList?: any[]): number {
  if (!metricas || typeof metricas !== "object") return 0;
  const derived = derivedList || (typeof window !== "undefined" ? getStoredDerivedVariables() : []);
  return calculateGpsMetricValue(metricas, key, derived);
}

function getJugadorDisplayName(j: Jugador): string {
  const nombre = j.nombre || "Jugador";
  if (j.apodo && j.apodo.trim() && j.apodo.toLowerCase() !== nombre.toLowerCase()) {
    return `${j.apodo.trim()} (${nombre.trim().split(" ")[0]})`;
  }
  return nombre;
}

// Abreviaturas solicitadas: M (medio), L (largo), C (corto), DP (doble partido)
function getMicrocycleAbbr(tipo?: string): string {
  if (!tipo) return "";
  const t = tipo.toLowerCase().trim();
  if (t === "media" || t === "medio" || t.includes("med")) return "M";
  if (t === "largo" || t.includes("larg")) return "L";
  if (t === "corto" || t.includes("cort")) return "C";
  if (t === "doble_partido" || t.includes("doble")) return "DP";
  return "";
}

// Nombres cortos y limpios para la tabla (sin exceso de texto)
function getCleanMetricLabel(vDef: GpsVariableDef): string {
  const key = vDef.key;
  if (key === "Distance(m)" || key === "Distancia Total (m)") return "Distancia Total";
  if (key === "Distancia / Min") return "Distancia / Min";
  if (key.includes("19,8 - 21") || key.includes("19.8 - 21")) return "Dist. 19.8-21";
  if (key.includes("Distance +21") || key.includes("+21")) return "Distancia >21";
  if (key.includes("+24") || key.includes("24 km/h")) return "Distancia >24";
  if (key.includes("MAX Speed") || key.includes("Velocidad Máxima")) return "Velocidad Máx.";
  if (key === "HSR Abs (m)" || key === "HSR") return "HSR (>19.8)";
  if (key === "Player Load") return "Player Load";
  if (key.includes("Sprints")) return "Sprints";
  if (key.includes("Aceleraciones")) return "Aceleraciones";
  if (key.includes("Desaceleraciones")) return "Desaceleraciones";
  return vDef.shortLabel || vDef.label.replace(/^Distancia Z\d+:\s*/i, "");
}

// Componente Buscador de Jugador Desplegable
function SearchableJugadorSelect({
  jugadores,
  selectedJugadorId,
  onSelectJugador,
}: {
  jugadores: Jugador[];
  selectedJugadorId: string;
  onSelectJugador: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedJugador = jugadores.find((j) => j.id === selectedJugadorId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredJugadores = jugadores.filter(
    (j) =>
      j.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (j.apodo && j.apodo.toLowerCase().includes(search.toLowerCase())) ||
      (j.posicion && j.posicion.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div ref={dropdownRef} style={{ position: "relative", minWidth: "300px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "#ffffff",
          border: isOpen ? "2px solid #1e3a8a" : "1px solid #cbd5e1",
          borderRadius: "8px",
          padding: "4px 10px",
          cursor: "pointer",
          boxShadow: isOpen ? "0 0 0 3px rgba(30, 58, 138, 0.1)" : "0 1px 3px rgba(0,0,0,0.05)",
          transition: "all 0.15s ease",
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ fontSize: "13px", marginRight: "6px", color: "#64748b" }}>👤</span>
        <input
          type="text"
          placeholder="Escribe o selecciona deportista activo..."
          value={
            isOpen
              ? search
              : selectedJugador
              ? `${getJugadorDisplayName(selectedJugador)} · ${selectedJugador.posicion || "Sin pos."}`
              : ""
          }
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true);
          }}
          style={{
            border: "none",
            outline: "none",
            width: "100%",
            fontSize: "12px",
            fontWeight: 700,
            color: "#0f172a",
            background: "transparent",
            cursor: "pointer",
          }}
        />
        <span style={{ fontSize: "10px", color: "#64748b", marginLeft: "6px" }}>▼</span>
      </div>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
            zIndex: 1000,
            maxHeight: "260px",
            overflowY: "auto",
          }}
        >
          {filteredJugadores.length === 0 ? (
            <div style={{ padding: "8px 12px", fontSize: "11.5px", color: "#64748b" }}>
              No se encontraron deportistas
            </div>
          ) : (
            filteredJugadores.map((j) => (
              <div
                key={j.id}
                style={{
                  padding: "6px 12px",
                  fontSize: "11.5px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: j.id === selectedJugadorId ? "#eff6ff" : "transparent",
                  color: j.id === selectedJugadorId ? "#1e3a8a" : "#0f172a",
                  fontWeight: j.id === selectedJugadorId ? 800 : 500,
                  borderBottom: "1px solid #f1f5f9",
                }}
                onClick={() => {
                  onSelectJugador(j.id);
                  setIsOpen(false);
                  setSearch("");
                }}
                onMouseEnter={(e) => {
                  if (j.id !== selectedJugadorId) e.currentTarget.style.background = "#f8fafc";
                }}
                onMouseLeave={(e) => {
                  if (j.id !== selectedJugadorId) e.currentTarget.style.background = "transparent";
                }}
              >
                <span>{getJugadorDisplayName(j)}</span>
                <span style={{ fontSize: "10.5px", color: "#64748b" }}>{j.posicion || "Sin pos."}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Componente Selector Múltiple de Microciclos (Checkbox por Microciclo)
function MicrocycleMultiSelect({
  microcycles,
  selectedIds,
  onChange,
}: {
  microcycles: any[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const effectiveSelectedIds = selectedIds.length === 0 ? microcycles.map((m) => m.id) : selectedIds;
  const allSelected = microcycles.length > 0 && effectiveSelectedIds.length === microcycles.length;

  const handleToggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(microcycles.map((m) => m.id));
    }
  };

  const handleToggleOne = (id: string) => {
    if (effectiveSelectedIds.includes(id)) {
      if (effectiveSelectedIds.length <= 1) return; // al menos 1
      onChange(effectiveSelectedIds.filter((item) => item !== id));
    } else {
      onChange([...effectiveSelectedIds, id]);
    }
  };

  const labelText = allSelected
    ? `Todos los microciclos (Hasta hoy · ${microcycles.length} mic.)`
    : `${effectiveSelectedIds.length} de ${microcycles.length} microciclos seleccionados`;

  return (
    <div ref={dropdownRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: "4px 10px",
          borderRadius: "6px",
          border: "1px solid #cbd5e1",
          fontSize: "12px",
          fontWeight: 700,
          background: "#ffffff",
          color: "#0f172a",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          cursor: "pointer",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <span>{labelText}</span>
        <span style={{ fontSize: "10px", color: "#64748b" }}>{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 1000,
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
            minWidth: "320px",
            maxHeight: "360px",
            overflowY: "auto",
            padding: "4px 0",
          }}
        >
          {/* Cabecera con selector Todos y links rápidos */}
          <div
            style={{
              padding: "7px 12px",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#f8fafc",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 800, color: "#1e3a8a" }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleToggleAll}
                style={{ cursor: "pointer", accentColor: "#1e3a8a" }}
              />
              <span>Todos los microciclos</span>
            </label>
            <div style={{ display: "flex", gap: "6px", fontSize: "11px" }}>
              <button
                type="button"
                onClick={() => onChange(microcycles.map((m) => m.id))}
                style={{ fontWeight: 700, color: "#1e3a8a", background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Todos
              </button>
              <span style={{ color: "#cbd5e1" }}>·</span>
              <button
                type="button"
                onClick={() => onChange(microcycles.slice(0, 1).map((m) => m.id))}
                style={{ fontWeight: 700, color: "#64748b", background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Solo 1
              </button>
            </div>
          </div>

          {/* Lista de microciclos */}
          {microcycles.map((mc, idx) => {
            const isChecked = effectiveSelectedIds.includes(mc.id);
            const s = formatDateDDMM(mc.start);
            const e = formatDateDDMM(mc.end);
            return (
              <label
                key={mc.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "7px 12px",
                  cursor: "pointer",
                  fontSize: "12px",
                  borderBottom: "1px solid #f1f5f9",
                  background: isChecked ? "#f0f7ff" : "transparent",
                  userSelect: "none",
                }}
                onMouseEnter={(e) => {
                  if (!isChecked) e.currentTarget.style.background = "#f8fafc";
                }}
                onMouseLeave={(e) => {
                  if (!isChecked) e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleOne(mc.id)}
                    style={{ cursor: "pointer", accentColor: "#1e3a8a" }}
                  />
                  <span style={{ fontWeight: isChecked ? 700 : 500, color: "#0f172a" }}>
                    {mc.nombre ? mc.nombre.split(" al ")[0] : `Microciclo ${idx + 1}`} ({s} - {e})
                  </span>
                </div>
                {mc.abbr && (
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 800,
                      padding: "1px 5px",
                      borderRadius: "4px",
                      background: isChecked ? "#1e3a8a" : "#e2e8f0",
                      color: isChecked ? "#ffffff" : "#475569",
                    }}
                  >
                    [{mc.abbr}]
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function InformeMesocicloPage() {
  return (
    <Suspense fallback={<div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Cargando informe de mesociclo...</div>}>
      <InformeMesocicloContent />
    </Suspense>
  );
}

function InformeMesocicloContent() {
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const searchParams = useSearchParams();
  const initialJugadorId = searchParams.get("jugador") || "";

  const { activeTeam, clubShield } = useReportClubInfo();
  const { favoriteKeys, allVariables } = useFavoriteGpsVariables();

  // Estados principales de datos
  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [selectedJugadorId, setSelectedJugadorId] = useState<string>(initialJugadorId);
  const [playerGpsRecords, setPlayerGpsRecords] = useState<GpsRecord[]>([]);
  const [teamGpsRecords, setTeamGpsRecords] = useState<GpsRecord[]>([]);
  const [optimizadorSessionNum, setOptimizadorSessionNum] = useState<number>(47);
  const [loading, setLoading] = useState<boolean>(true);

  // Niveles de Navegación
  const [mainTab, setMainTab] = useState<"gps" | "general" | "completo">("gps");
  const [subView, setSubView] = useState<"jugador" | "comparativa" | "equipo">("jugador");
  const [weekMode, setWeekMode] = useState<"martes-lunes" | "miercoles-martes" | "lunes-domingo">("martes-lunes");
  const [gpsFilter, setGpsFilter] = useState<"TODO" | "REAL">("TODO");
  const [ocultarSinDatos, setOcultarSinDatos] = useState<boolean>(true);

  // =========================================================
  // PERSISTENCIA COMPLETA DE VARIABLES DE GRÁFICOS Y TABLA
  // Las variables que el usuario deje puestas se quedan guardadas
  // =========================================================
  const [chart1LeftMetric, setChart1LeftMetric] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mesocycle_chart_vars_v2");
        if (saved) {
          const p = JSON.parse(saved);
          if (p.chart1LeftMetric) return p.chart1LeftMetric;
        }
      } catch {}
    }
    return "Distance(m)";
  });

  const [chart1RightMetric, setChart1RightMetric] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mesocycle_chart_vars_v2");
        if (saved) {
          const p = JSON.parse(saved);
          if (p.chart1RightMetric) return p.chart1RightMetric;
        }
      } catch {}
    }
    return "19,8 - 21 km/h (Distancia)";
  });

  const [chart2LeftMetric, setChart2LeftMetric] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mesocycle_chart_vars_v2");
        if (saved) {
          const p = JSON.parse(saved);
          if (p.chart2LeftMetric) return p.chart2LeftMetric;
        }
      } catch {}
    }
    return "Distance +21 (m)";
  });

  const [chart2RightMetric, setChart2RightMetric] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mesocycle_chart_vars_v2");
        if (saved) {
          const p = JSON.parse(saved);
          if (p.chart2RightMetric) return p.chart2RightMetric;
        }
      } catch {}
    }
    return "Player Load";
  });

  const persistChartVars = (key: string, val: string) => {
    if (typeof window !== "undefined") {
      try {
        let current: Record<string, string> = {
          chart1LeftMetric,
          chart1RightMetric,
          chart2LeftMetric,
          chart2RightMetric,
        };
        const saved = localStorage.getItem("mesocycle_chart_vars_v2");
        if (saved) {
          try {
            current = { ...current, ...JSON.parse(saved) };
          } catch {}
        }
        current[key] = val;
        localStorage.setItem("mesocycle_chart_vars_v2", JSON.stringify(current));
      } catch {}
    }
  };

  const handleChart1LeftMetricChange = (val: string) => {
    setChart1LeftMetric(val);
    persistChartVars("chart1LeftMetric", val);
  };
  const handleChart1RightMetricChange = (val: string) => {
    setChart1RightMetric(val);
    persistChartVars("chart1RightMetric", val);
  };
  const handleChart2LeftMetricChange = (val: string) => {
    setChart2LeftMetric(val);
    persistChartVars("chart2LeftMetric", val);
  };
  const handleChart2RightMetricChange = (val: string) => {
    setChart2RightMetric(val);
    persistChartVars("chart2RightMetric", val);
  };

  // Variables seleccionadas para la tabla (Persistidas)
  const [selectedTableMetricKeys, setSelectedTableMetricKeys] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mesocycle_table_selected_metrics_v2");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return [
      "Distance(m)",
      "19,8 - 21 km/h (Distancia)",
      "Distance +21 (m)",
      "Player Load",
      "MAX Speed(km/h)",
      "HSR Abs (m)",
    ];
  });
  const [showVariableModal, setShowVariableModal] = useState<boolean>(false);
  const [varModalSearch, setVarModalSearch] = useState<string>("");

  const updateSelectedTableMetrics = (keys: string[]) => {
    setSelectedTableMetricKeys(keys);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("mesocycle_table_selected_metrics_v2", JSON.stringify(keys));
      } catch {}
    }
  };

  const handleToggleMetric = (key: string) => {
    if (selectedTableMetricKeys.includes(key)) {
      if (selectedTableMetricKeys.length === 1) return;
      updateSelectedTableMetrics(selectedTableMetricKeys.filter((k) => k !== key));
    } else {
      updateSelectedTableMetrics([...selectedTableMetricKeys, key]);
    }
  };

  const handleRemoveMetricFromTable = (key: string) => {
    if (selectedTableMetricKeys.length <= 1) return;
    updateSelectedTableMetrics(selectedTableMetricKeys.filter((k) => k !== key));
  };

  // Comentarios persistidos
  const [mesocycleGeneralComment, setMesocycleGeneralComment] = useState<string>("");
  const [playerObservations, setPlayerObservations] = useState<Record<string, string>>({});
  const [chart1Comment, setChart1Comment] = useState<string>("");
  const [chart2Comment, setChart2Comment] = useState<string>("");

  // Modos de visualización
  const [chart1SortMode, setChart1SortMode] = useState<"cronologico" | "valor">("cronologico");
  const [chart2SortMode, setChart2SortMode] = useState<"cronologico" | "valor">("cronologico");
  const [chart1Type, setChart1Type] = useState<"barras" | "lineas">(() => {
    if (typeof window !== "undefined") {
      const s = localStorage.getItem("mesocycle_chart1_type");
      if (s === "barras" || s === "lineas") return s;
    }
    return "barras";
  });
  const [chart2Type, setChart2Type] = useState<"barras" | "lineas">(() => {
    if (typeof window !== "undefined") {
      const s = localStorage.getItem("mesocycle_chart2_type");
      if (s === "barras" || s === "lineas") return s;
    }
    return "barras";
  });

  const handleSetChart1Type = (t: "barras" | "lineas") => {
    setChart1Type(t);
    if (typeof window !== "undefined") localStorage.setItem("mesocycle_chart1_type", t);
  };
  const handleSetChart2Type = (t: "barras" | "lineas") => {
    setChart2Type(t);
    if (typeof window !== "undefined") localStorage.setItem("mesocycle_chart2_type", t);
  };

  // Filtro de Microciclos
  const [selectedMicroIds, setSelectedMicroIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mesocycle_selected_micros_v2");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {}
    }
    return [];
  });

  const handleUpdateSelectedMicroIds = (ids: string[]) => {
    setSelectedMicroIds(ids);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("mesocycle_selected_micros_v2", JSON.stringify(ids));
      } catch {}
    }
  };

  // 1. Cargar Jugadores y Sesión Base
  useEffect(() => {
    async function init() {
      try {
        const [jugs, optNum] = await Promise.all([
          getActiveJugadores(),
          getOptimizadorSessionNumber(new Date().toISOString().split("T")[0]),
        ]);
        const sorted = (jugs || []).sort(comparePlayersByTacticalPosition);
        setJugadores(sorted);
        if (optNum) setOptimizadorSessionNum(optNum);
      } catch (e) {
        console.error("Error al cargar jugadores:", e);
      }
    }
    init();
  }, []);

  // 2. Cargar Datos GPS
  useEffect(() => {
    setLoading(true);
    getGpsDatosReport(selectedJugadorId || (jugadores[0]?.id ?? ""))
      .then((res) => {
        setPlayerGpsRecords(res.playerGps || []);
        setTeamGpsRecords(res.teamGps || []);
      })
      .catch((err) => console.error("Error al cargar GPS:", err))
      .finally(() => setLoading(false));
  }, [selectedJugadorId, jugadores]);

  // Cargar comentarios
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const cGen = localStorage.getItem("mesocycle_general_comment");
        if (cGen) setMesocycleGeneralComment(cGen);
        const cObs = localStorage.getItem("mesocycle_player_observations");
        if (cObs) setPlayerObservations(JSON.parse(cObs));
        const c1 = localStorage.getItem("mesocycle_chart1_comment");
        if (c1) setChart1Comment(c1);
        const c2 = localStorage.getItem("mesocycle_chart2_comment");
        if (c2) setChart2Comment(c2);
      } catch {}
    }
  }, []);

  const handleGeneralCommentChange = (v: string) => {
    setMesocycleGeneralComment(v);
    if (typeof window !== "undefined") localStorage.setItem("mesocycle_general_comment", v);
  };

  const handlePlayerObservationChange = (pId: string, v: string) => {
    const updated = { ...playerObservations, [pId]: v };
    setPlayerObservations(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("mesocycle_player_observations", JSON.stringify(updated));
    }
  };

  const handleChart1CommentChange = (v: string) => {
    setChart1Comment(v);
    if (typeof window !== "undefined") localStorage.setItem("mesocycle_chart1_comment", v);
  };
  const handleChart2CommentChange = (v: string) => {
    setChart2Comment(v);
    if (typeof window !== "undefined") localStorage.setItem("mesocycle_chart2_comment", v);
  };

  // 3. Extracción de Microciclos Marcados en Carga Externa hasta el día de hoy
  const allMicrocycles = useMemo(() => {
    let custom: CustomMicrocycleDef[] = DEFAULT_CUSTOM_MICROCICLOS;
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_custom_microcycles");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            custom = parsed;
          }
        }
      } catch {}
    }

    const deletedIds = getDeletedMicrocycleIds();
    const extracted = extractMicrocyclesFromGpsData(teamGpsRecords, custom);

    const baseList: CustomMicrocycleDef[] = [...custom.filter(c => !deletedIds.includes(c.id))];

    extracted.forEach((ext) => {
      if (deletedIds.includes(ext.id)) return;
      const overlaps = baseList.some(
        (c) =>
          (ext.start >= c.start && ext.start <= c.end) ||
          (ext.end >= c.start && ext.end <= c.end) ||
          (c.start >= ext.start && c.end <= ext.end)
      );
      if (!overlaps) {
        baseList.push(ext);
      }
    });

    baseList.sort((a, b) => a.start.localeCompare(b.start));

    return baseList.map((mc, idx) => {
      const s = formatDateDDMM(mc.start);
      const e = formatDateDDMM(mc.end);
      const tipo = getMicrocycleType(mc);
      const abbr = getMicrocycleAbbr(tipo);
      return {
        ...mc,
        tipo,
        abbr,
        shortLabel: `${s} - ${e}`,
        displayTitle: mc.nombre ? `${mc.nombre} (${s} - ${e})` : `Microciclo ${idx + 1} (${s} - ${e})`,
      };
    });
  }, [teamGpsRecords]);

  // Microciclos activos a mostrar
  const activeMicrocycles = useMemo(() => {
    if (selectedMicroIds.length === 0) return allMicrocycles;
    const filtered = allMicrocycles.filter((m) => selectedMicroIds.includes(m.id));
    return filtered.length > 0 ? filtered : allMicrocycles;
  }, [allMicrocycles, selectedMicroIds]);

  // Jugadores que tienen datos GPS en el periodo
  const jugadoresConDatos = useMemo(() => {
    const idsWithData = new Set<string>();
    (teamGpsRecords || []).forEach((r) => {
      if (r.jugador_id) {
        if (gpsFilter === "REAL" && isRecordSimulado(r)) return;
        idsWithData.add(r.jugador_id);
      }
    });
    return jugadores.filter((j) => idsWithData.has(j.id));
  }, [jugadores, teamGpsRecords, gpsFilter]);

  // Filtrado de jugadores según opción "Ocultar sin datos"
  const jugadoresDisponibles = useMemo(() => {
    if (ocultarSinDatos) {
      return jugadoresConDatos.length > 0 ? jugadoresConDatos : jugadores;
    }
    return jugadores;
  }, [ocultarSinDatos, jugadoresConDatos, jugadores]);

  // Asegurar selección inicial en jugador con datos válidos
  useEffect(() => {
    if (jugadoresDisponibles.length > 0) {
      const exists = jugadoresDisponibles.some((j) => j.id === selectedJugadorId);
      if (!exists) {
        setSelectedJugadorId(jugadoresDisponibles[0].id);
      }
    }
  }, [jugadoresDisponibles, selectedJugadorId]);

  const jugador = useMemo(() => {
    return jugadores.find((j) => j.id === selectedJugadorId) || jugadoresDisponibles[0] || null;
  }, [jugadores, selectedJugadorId, jugadoresDisponibles]);

  // Diccionario de definiciones de variables
  const getVariableDef = (key: string): GpsVariableDef => {
    return (
      allVariables.find((v) => v.key === key) || {
        key,
        label: key,
        categoria: "Carga y Metabólica",
        unit: "",
      }
    );
  };

  const m1Left = getVariableDef(chart1LeftMetric);
  const m1Right = getVariableDef(chart1RightMetric);
  const m2Left = getVariableDef(chart2LeftMetric);
  const m2Right = getVariableDef(chart2RightMetric);

  const renderGpsMetricOptions = (currentVal: string) => {
    return allVariables.map((v) => (
      <option key={v.key} value={v.key}>
        {getCleanMetricLabel(v)} {v.unit ? `(${v.unit})` : ""}
      </option>
    ));
  };

  // Helper para calcular valores de jugador en un microciclo
  const getPlayerValInMicrocycle = (playerId: string, mc: CustomMicrocycleDef, metricKey: string): number => {
    const isPeak =
      metricKey.toLowerCase().includes("speed") ||
      metricKey.toLowerCase().includes("velocidad") ||
      metricKey.toLowerCase().includes("max") ||
      metricKey.toLowerCase().includes("pico");

    const records = (teamGpsRecords || []).filter((r) => {
      if (r.jugador_id !== playerId) return false;
      if (r.fecha < mc.start || r.fecha > mc.end) return false;
      if (gpsFilter === "REAL" && isRecordSimulado(r)) return false;
      return true;
    });

    if (records.length === 0) return 0;

    let accum = 0;
    let maxVal = 0;

    records.forEach((r) => {
      const val = getMetricValue(r.metricas, metricKey);
      accum += val;
      if (val > maxVal) maxVal = val;
    });

    const finalVal = isPeak ? maxVal : accum;
    return Math.round(finalVal * 10) / 10;
  };

  // Helper para calcular la media de equipo en un microciclo
  const getTeamAvgInMicrocycle = (mc: CustomMicrocycleDef, metricKey: string): number => {
    const isPeak =
      metricKey.toLowerCase().includes("speed") ||
      metricKey.toLowerCase().includes("velocidad") ||
      metricKey.toLowerCase().includes("max") ||
      metricKey.toLowerCase().includes("pico");

    const records = (teamGpsRecords || []).filter((r) => {
      if (r.fecha < mc.start || r.fecha > mc.end) return false;
      if (gpsFilter === "REAL" && isRecordSimulado(r)) return false;
      return true;
    });

    if (records.length === 0) return 0;

    const playerAggs = new Map<string, { sum: number; max: number }>();
    records.forEach((r) => {
      const pId = r.jugador_id;
      if (!pId) return;
      const val = getMetricValue(r.metricas, metricKey);
      if (!playerAggs.has(pId)) playerAggs.set(pId, { sum: 0, max: 0 });
      const curr = playerAggs.get(pId)!;
      curr.sum += val;
      if (val > curr.max) curr.max = val;
    });

    if (playerAggs.size === 0) return 0;

    let grandTotal = 0;
    playerAggs.forEach((agg) => {
      grandTotal += isPeak ? agg.max : agg.sum;
    });

    const avg = grandTotal / playerAggs.size;
    return Math.round(avg * 10) / 10;
  };

  // Datos para Gráfico 1 (Barras o Líneas con abreviaturas M, L, C, DP)
  const chart1Data = useMemo(() => {
    const isPlayer = subView === "jugador" && Boolean(jugador);
    const data = activeMicrocycles.map((mc) => {
      const s = formatDateDDMM(mc.start);
      const e = formatDateDDMM(mc.end);
      const tipo = getMicrocycleType(mc);
      const abbr = getMicrocycleAbbr(tipo);
      const name = abbr ? `${s}-${e} (${abbr})` : `${s}-${e}`;

      const valY1 = isPlayer
        ? getPlayerValInMicrocycle(jugador!.id, mc, chart1LeftMetric)
        : getTeamAvgInMicrocycle(mc, chart1LeftMetric);
      const valY2 = isPlayer
        ? getPlayerValInMicrocycle(jugador!.id, mc, chart1RightMetric)
        : getTeamAvgInMicrocycle(mc, chart1RightMetric);

      const teamY1 = getTeamAvgInMicrocycle(mc, chart1LeftMetric);
      const teamY2 = getTeamAvgInMicrocycle(mc, chart1RightMetric);

      return {
        id: mc.id,
        name,
        dateLabel: `${s} - ${e}`,
        abbr,
        tipo,
        fullName: mc.nombre ? (abbr ? `${mc.nombre} (${abbr})` : mc.nombre) : name,
        Y1: valY1,
        Y2: valY2,
        Y1_team: teamY1,
        Y2_team: teamY2,
        microcycle: mc,
      };
    });

    if (chart1SortMode === "valor") {
      return [...data].sort((a, b) => b.Y1 - a.Y1);
    }
    return data;
  }, [
    activeMicrocycles,
    subView,
    jugador,
    chart1LeftMetric,
    chart1RightMetric,
    chart1SortMode,
    teamGpsRecords,
    gpsFilter,
  ]);

  // Datos para Gráfico 2 (Barras o Líneas con abreviaturas M, L, C, DP)
  const chart2Data = useMemo(() => {
    const isPlayer = subView === "jugador" && Boolean(jugador);
    const data = activeMicrocycles.map((mc) => {
      const s = formatDateDDMM(mc.start);
      const e = formatDateDDMM(mc.end);
      const tipo = getMicrocycleType(mc);
      const abbr = getMicrocycleAbbr(tipo);
      const name = abbr ? `${s}-${e} (${abbr})` : `${s}-${e}`;

      const valY1 = isPlayer
        ? getPlayerValInMicrocycle(jugador!.id, mc, chart2LeftMetric)
        : getTeamAvgInMicrocycle(mc, chart2LeftMetric);
      const valY2 = isPlayer
        ? getPlayerValInMicrocycle(jugador!.id, mc, chart2RightMetric)
        : getTeamAvgInMicrocycle(mc, chart2RightMetric);

      const teamY1 = getTeamAvgInMicrocycle(mc, chart2LeftMetric);
      const teamY2 = getTeamAvgInMicrocycle(mc, chart2RightMetric);

      return {
        id: mc.id,
        name,
        dateLabel: `${s} - ${e}`,
        abbr,
        tipo,
        fullName: mc.nombre ? (abbr ? `${mc.nombre} (${abbr})` : mc.nombre) : name,
        Y1: valY1,
        Y2: valY2,
        Y1_team: teamY1,
        Y2_team: teamY2,
        microcycle: mc,
      };
    });

    if (chart2SortMode === "valor") {
      return [...data].sort((a, b) => b.Y1 - a.Y1);
    }
    return data;
  }, [
    activeMicrocycles,
    subView,
    jugador,
    chart2LeftMetric,
    chart2RightMetric,
    chart2SortMode,
    teamGpsRecords,
    gpsFilter,
  ]);

  // Variables activas de la tabla
  const activeTableVariablesList = useMemo(() => {
    return selectedTableMetricKeys.map((k) => getVariableDef(k));
  }, [selectedTableMetricKeys, allVariables]);

  const periodLabel = useMemo(() => {
    if (activeMicrocycles.length === 0) return "Sin datos";
    const first = activeMicrocycles[0];
    const last = activeMicrocycles[activeMicrocycles.length - 1];
    return `${formatDateDDMM(first.start)} - ${formatDateDDMM(last.end)}`;
  }, [activeMicrocycles]);

  if (!mounted) {
    return (
      <div style={{ background: "#f8fafc", minHeight: "100vh", padding: "40px", textAlign: "center", color: "#64748b" }}>
        Cargando informe de mesociclo...
      </div>
    );
  }

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", padding: "16px" }}>
      {/* =========================================================
          NIVEL 0: BARRA SUPERIOR EXACTA A LA CAPTURA
          ← Menú | INFORMES · GPS MESOCICLO | ReportNav | Exportar PDF
          ========================================================= */}
      <div
        className="no-print"
        style={{
          maxWidth: "1050px",
          margin: "0 auto 12px auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Link
            href="/"
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#334155",
              background: "#e2e8f0",
              padding: "4px 10px",
              borderRadius: "6px",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            ← Menú
          </Link>
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "#64748b" }}>
            INFORMES · GPS MESOCICLO
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <ReportNav />
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              background: "#1e3a8a",
              color: "#ffffff",
              borderRadius: "8px",
              border: "none",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(30, 58, 138, 0.25)",
              transition: "all 0.15s ease",
            }}
          >
            <span>📄</span> Exportar PDF
          </button>
        </div>
      </div>

      {/* =========================================================
          NIVEL 1: PESTAÑAS PRINCIPALES (⚡ GPS | 📋 GENERAL | 📦 COMPLETO)
          ========================================================= */}
      <div
        className="no-print"
        style={{
          maxWidth: "1050px",
          margin: "0 auto 10px auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
        }}
      >
        {[
          { id: "gps", label: "⚡ GPS", color: "#1e3a8a" },
          { id: "general", label: "📋 GENERAL", color: "#475569" },
          { id: "completo", label: "📦 COMPLETO", color: "#0f172a" },
        ].map((tab) => {
          const isActive = mainTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMainTab(tab.id as any)}
              style={{
                padding: "8px 20px",
                borderRadius: "10px",
                fontSize: "13px",
                fontWeight: 900,
                letterSpacing: "0.04em",
                cursor: "pointer",
                border: isActive ? `2px solid ${tab.color}` : "1px solid #cbd5e1",
                background: isActive ? tab.color : "#ffffff",
                color: isActive ? "#ffffff" : "#475569",
                boxShadow: isActive ? "0 3px 8px rgba(0,0,0,0.12)" : "0 1px 3px rgba(0,0,0,0.04)",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* =========================================================
          NIVEL 2: SUB-VISTAS (👤 Jugador | 📊 Comparativa | 👥 Equipo)
          ========================================================= */}
      <div
        className="no-print"
        style={{
          maxWidth: "1050px",
          margin: "0 auto 12px auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          background: "#f8fafc",
          padding: "5px",
          borderRadius: "10px",
          border: "1px solid #e2e8f0",
        }}
      >
        <button
          type="button"
          onClick={() => setSubView("jugador")}
          style={{
            flex: 1,
            padding: "7px 14px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            border: "none",
            background: subView === "jugador" ? "#1e3a8a" : "transparent",
            color: subView === "jugador" ? "#ffffff" : "#64748b",
            boxShadow: subView === "jugador" ? "0 2px 4px rgba(30,58,138,0.2)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>👤</span> Jugador
        </button>
        <button
          type="button"
          onClick={() => setSubView("comparativa")}
          style={{
            flex: 1,
            padding: "7px 14px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            border: "none",
            background: subView === "comparativa" ? "#1e3a8a" : "transparent",
            color: subView === "comparativa" ? "#ffffff" : "#64748b",
            boxShadow: subView === "comparativa" ? "0 2px 4px rgba(30,58,138,0.2)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>📊</span> Comparativa
        </button>
        <button
          type="button"
          onClick={() => setSubView("equipo")}
          style={{
            flex: 1,
            padding: "7px 14px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            border: "none",
            background: subView === "equipo" ? "#1e3a8a" : "transparent",
            color: subView === "equipo" ? "#ffffff" : "#64748b",
            boxShadow: subView === "equipo" ? "0 2px 4px rgba(30,58,138,0.2)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>👥</span> Equipo
        </button>
      </div>

      {/* =========================================================
          CONTENEDOR DE FILTROS SUPERIOR (Deportista Activo + Toolbar)
          ========================================================= */}
      <div
        className="no-print"
        style={{
          maxWidth: "1050px",
          margin: "0 auto 12px auto",
          background: "#ffffff",
          padding: "10px 14px",
          borderRadius: "10px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {/* Fila 1: Selector de Deportista Activo con Buscador Integrado */}
        {subView !== "equipo" && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <label style={{ fontSize: "12.5px", fontWeight: 700, color: "#1e3a8a" }}>
              Deportista activo ({jugadoresDisponibles.length}):
            </label>
            <SearchableJugadorSelect
              jugadores={jugadoresDisponibles}
              selectedJugadorId={selectedJugadorId}
              onSelectJugador={(id) => setSelectedJugadorId(id)}
            />
          </div>
        )}

        {/* Fila 2: Controles de Semana, Temporada, Datos y Microciclos */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#1e3a8a" }}>Temporada:</label>
              <div
                style={{
                  padding: "3px 8px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "12px",
                  fontWeight: 700,
                  background: "#ffffff",
                  color: "#0f172a",
                }}
              >
                2026/27 · {activeTeam || "CE EUROPA"}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#1e3a8a" }}>Datos:</label>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  background: "#f1f5f9",
                  borderRadius: "6px",
                  padding: "2px",
                  border: "1px solid #cbd5e1",
                }}
              >
                <button
                  type="button"
                  onClick={() => setGpsFilter("REAL")}
                  style={{
                    fontSize: "11px",
                    fontWeight: gpsFilter === "REAL" ? 800 : 600,
                    padding: "2px 8px",
                    borderRadius: "4px",
                    border: "none",
                    background: gpsFilter === "REAL" ? "#ffffff" : "transparent",
                    color: gpsFilter === "REAL" ? "#0f172a" : "#64748b",
                    boxShadow: gpsFilter === "REAL" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                    cursor: "pointer",
                  }}
                >
                  Solo REAL
                </button>
                <button
                  type="button"
                  onClick={() => setGpsFilter("TODO")}
                  style={{
                    fontSize: "11px",
                    fontWeight: gpsFilter === "TODO" ? 800 : 600,
                    padding: "2px 8px",
                    borderRadius: "4px",
                    border: "none",
                    background: gpsFilter === "TODO" ? "#ffffff" : "transparent",
                    color: gpsFilter === "TODO" ? "#0f172a" : "#64748b",
                    boxShadow: gpsFilter === "TODO" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                    cursor: "pointer",
                  }}
                >
                  TODO
                </button>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "3px 9px",
                  borderRadius: "6px",
                  border: ocultarSinDatos ? "1px solid #93c5fd" : "1px solid #cbd5e1",
                  background: ocultarSinDatos ? "#eff6ff" : "#ffffff",
                  cursor: "pointer",
                  fontSize: "11.5px",
                  fontWeight: 700,
                  color: ocultarSinDatos ? "#1e40af" : "#475569",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={ocultarSinDatos}
                  onChange={(e) => setOcultarSinDatos(e.target.checked)}
                  style={{ cursor: "pointer", accentColor: "#1e3a8a" }}
                />
                <span>Ocultar sin datos</span>
                <span style={{ fontSize: "10.5px", color: ocultarSinDatos ? "#2563eb" : "#94a3b8", fontWeight: 800 }}>
                  ({jugadoresConDatos.length} con datos)
                </span>
              </label>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "#1e3a8a" }}>
              Mesociclo (Microciclos):
            </label>
            <MicrocycleMultiSelect
              microcycles={allMicrocycles}
              selectedIds={selectedMicroIds}
              onChange={handleUpdateSelectedMicroIds}
            />
          </div>
        </div>
      </div>

      {/* VISTA COMPARATIVA */}
      {subView === "comparativa" && (
        <div style={{ maxWidth: "1050px", margin: "0 auto" }}>
          <GpsComparativeSection
            mode="microciclo"
            clubName={activeTeam}
            clubShield={clubShield}
            jugadores={jugadoresDisponibles}
            initialJugadorId={selectedJugadorId}
            teamGpsRecords={teamGpsRecords}
            availableWeeks={activeMicrocycles.map((m, idx) => {
              const dSet = new Set(teamGpsRecords.filter(r => r.fecha >= m.start && r.fecha <= m.end).map(r => r.fecha));
              return {
                start: m.start,
                end: m.end,
                label: m.nombre || m.shortLabel,
                weekNum: idx + 1,
                dates: Array.from(dSet).sort(),
              };
            })}
            currentWeekStart={activeMicrocycles[0]?.start || ""}
            favoriteKeys={favoriteKeys}
          />
        </div>
      )}

      {/* =========================================================
          HOJA PRINCIPAL DEL INFORME (EQUIPO O JUGADOR INDIVIDUAL)
          ========================================================= */}
      {subView !== "comparativa" && (
        <div
          className="gps-report-sheet"
          style={{
            maxWidth: "1050px",
            margin: "0 auto",
            background: "#ffffff",
            padding: "20px 24px",
            borderRadius: "12px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
            border: "1px solid #e2e8f0",
          }}
        >
          {/* CABECERA DE LA TARJETA */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              borderBottom: "2px solid #0f172a",
              paddingBottom: "10px",
              marginBottom: "12px",
            }}
          >
            {/* Izquierda: Escudo y Nombre del Club */}
            <div style={{ justifySelf: "start", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <img
                src={clubShield || "/escudo_europa.png"}
                alt="Escudo"
                style={{
                  width: "44px",
                  height: "50px",
                  objectFit: "contain",
                  background: "#ffffff",
                  borderRadius: "6px",
                  padding: "2px",
                }}
              />
              <span style={{ fontSize: "11px", fontWeight: 900, color: "#0f172a", letterSpacing: "0.02em", textTransform: "uppercase", marginTop: "2px" }}>
                {activeTeam || "CE EUROPA"}
              </span>
            </div>

            {/* Centro: Título + Número de Informe Editable con Subrayado */}
            <div style={{ justifySelf: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
              <h2
                style={{
                  fontSize: "16px",
                  fontWeight: 900,
                  color: "#0f172a",
                  margin: 0,
                  textTransform: "uppercase",
                  whiteSpace: "normal",
                  textAlign: "center",
                }}
              >
                {subView === "jugador" ? "INFORME GPS MESOCICLO INDIVIDUAL" : "INFORME GPS MESOCICLO"}
              </h2>
              <span className="print-only" style={{ fontSize: "18px", fontWeight: 900, color: "#1e3a8a" }}>
                {optimizadorSessionNum}
              </span>
              <input
                type="text"
                value={optimizadorSessionNum}
                onChange={(e) => setOptimizadorSessionNum(Number(e.target.value) || 0)}
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
                title="Número de informe (editable)"
              />
            </div>

            {/* Arriba a la derecha: Rango de Microciclo y Periodo */}
            <div style={{ justifySelf: "end", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.2px" }}>
                    Microciclo:
                  </span>
                  <input
                    type="text"
                    value={periodLabel}
                    readOnly
                    className="clean-header-input no-print"
                    style={{
                      fontSize: "11.5px",
                      fontWeight: 800,
                      padding: "2px 6px",
                      borderRadius: "4px",
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      color: "#0f172a",
                      outline: "none",
                      width: "135px",
                      textAlign: "center",
                    }}
                  />
                  <span className="print-only" style={{ fontSize: "11px", fontWeight: 800 }}>{periodLabel}</span>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.2px" }}>
                    Semana:
                  </span>
                  <input
                    type="text"
                    value={`${activeMicrocycles.length} mic.`}
                    readOnly
                    className="clean-header-input no-print"
                    style={{
                      fontSize: "11.5px",
                      fontWeight: 800,
                      padding: "2px 4px",
                      borderRadius: "4px",
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      color: "#1e3a8a",
                      outline: "none",
                      width: "56px",
                      textAlign: "center",
                    }}
                  />
                  <span className="print-only" style={{ fontSize: "11px", fontWeight: 800 }}>{`${activeMicrocycles.length} mic.`}</span>
                </div>
              </div>
            </div>
          </div>

          {/* =========================================================
              FICHA PROFESIONAL DEL JUGADOR CON FOTO (FORMATO PRO)
              Exacto a la captura aportada por el usuario
              ========================================================= */}
          {subView === "jugador" && jugador && (
            <section className="gps-header-card" style={{ marginBottom: "12px", padding: "14px 20px" }}>
              <div className="gps-profile-block">
                <div className="gps-profile-photo">
                  {jugador.foto_url ? (
                    <img src={jugador.foto_url || undefined} alt={jugador.nombre} />
                  ) : (
                    <span>{jugador.nombre.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div className="gps-profile-info">
                  <h1 style={{ fontSize: "21px", fontWeight: 900, color: "#0f172a", margin: "0 0 4px 0", textTransform: "uppercase" }}>
                    {getJugadorDisplayName(jugador)}
                  </h1>
                  <p style={{ margin: 0, fontSize: "12px", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                    {jugador.posicion || "Sin posición"}{calculateAge(jugador.fecha_nacimiento) ? ` · ${calculateAge(jugador.fecha_nacimiento)}` : ""}
                  </p>
                </div>
              </div>

              <div className="gps-controls-block" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                  <img
                    src={clubShield || "/escudo_europa.png"}
                    alt={activeTeam}
                    style={{ width: "24px", height: "24px", objectFit: "contain", background: "#ffffff", borderRadius: "4px", padding: "1px" }}
                  />
                  <span style={{ fontSize: "12px", fontWeight: 900, color: "#1e3a8a", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    {activeTeam || "CE EUROPA"}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* BLOQUE DE OBSERVACIONES / COMENTARIO CON BORDE AZUL */}
          <div style={{ marginTop: "10px", marginBottom: "14px" }}>
            <textarea
              value={subView === "jugador" && jugador ? (playerObservations[jugador.id] || "") : mesocycleGeneralComment}
              onChange={(e) => {
                if (subView === "jugador" && jugador) {
                  handlePlayerObservationChange(jugador.id, e.target.value);
                } else {
                  handleGeneralCommentChange(e.target.value);
                }
              }}
              placeholder={subView === "jugador" ? "Escribe aquí observaciones sobre la sesión del jugador..." : "Comentario general de la sesión / mesociclo..."}
              rows={2}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "none",
                borderLeft: "3px solid #1e3a8a",
                fontSize: "12.5px",
                fontFamily: "inherit",
                color: "#0f172a",
                outline: "none",
                resize: "vertical",
                background: "rgba(241, 245, 249, 0.7)",
                transition: "all 0.15s ease",
              }}
            />
          </div>

          {/* =========================================================
              BARRA DE VARIABLES DE GRÁFICOS (PERSISTIDAS)
              Exacta al diseño de la captura
              ========================================================= */}
          <div
            className="no-print"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "14px",
              flexWrap: "wrap",
              background: "#f8fafc",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: 900, color: "#1e3a8a", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
              VARIABLES GRÁFICOS:
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#0284c7" }} />
              <select
                value={chart1LeftMetric}
                onChange={(e) => handleChart1LeftMetricChange(e.target.value)}
                style={{
                  fontSize: "11.5px",
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#0f172a",
                  cursor: "pointer",
                  outline: "none",
                  minWidth: "150px",
                }}
              >
                {renderGpsMetricOptions(chart1LeftMetric)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#dc2626" }} />
              <select
                value={chart1RightMetric}
                onChange={(e) => handleChart1RightMetricChange(e.target.value)}
                style={{
                  fontSize: "11.5px",
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#0f172a",
                  cursor: "pointer",
                  outline: "none",
                  minWidth: "150px",
                }}
              >
                {renderGpsMetricOptions(chart1RightMetric)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#0284c7" }} />
              <select
                value={chart2LeftMetric}
                onChange={(e) => handleChart2LeftMetricChange(e.target.value)}
                style={{
                  fontSize: "11.5px",
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#0f172a",
                  cursor: "pointer",
                  outline: "none",
                  minWidth: "150px",
                }}
              >
                {renderGpsMetricOptions(chart2LeftMetric)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#dc2626" }} />
              <select
                value={chart2RightMetric}
                onChange={(e) => handleChart2RightMetricChange(e.target.value)}
                style={{
                  fontSize: "11.5px",
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#0f172a",
                  cursor: "pointer",
                  outline: "none",
                  minWidth: "150px",
                }}
              >
                {renderGpsMetricOptions(chart2RightMetric)}
              </select>
            </div>
          </div>

          {/* =========================================================
              GRÁFICO 1 (BARRAS O LÍNEAS)
              ========================================================= */}
          <div
            style={{
              background: "#ffffff",
              padding: "10px 12px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              marginBottom: "12px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
            }}
          >
            {/* Controles de Gráfico 1 */}
            <div
              className="no-print"
              style={{
                marginBottom: "8px",
                background: "#f8fafc",
                padding: "6px 10px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                display: "flex",
                flexDirection: "column",
                gap: "5px",
              }}
            >
              {/* Línea 1 (Arriba): Título + Barras/Líneas + Ordenar + Selectores Y e Y2 */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <h3 style={{ fontSize: "12.5px", fontWeight: 800, color: "#0f172a", margin: 0, textTransform: "uppercase" }}>
                    📊 Gráfico 1
                  </h3>

                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      background: "#f1f5f9",
                      borderRadius: "6px",
                      padding: "2px",
                      border: "1px solid #cbd5e1",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleSetChart1Type("barras")}
                      style={{
                        fontSize: "10.5px",
                        fontWeight: chart1Type === "barras" ? 800 : 600,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        border: "none",
                        background: chart1Type === "barras" ? "#ffffff" : "transparent",
                        color: chart1Type === "barras" ? "#0f172a" : "#64748b",
                        boxShadow: chart1Type === "barras" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                        cursor: "pointer",
                      }}
                    >
                      📊 Barras
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetChart1Type("lineas")}
                      style={{
                        fontSize: "10.5px",
                        fontWeight: chart1Type === "lineas" ? 800 : 600,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        border: "none",
                        background: chart1Type === "lineas" ? "#ffffff" : "transparent",
                        color: chart1Type === "lineas" ? "#0f172a" : "#64748b",
                        boxShadow: chart1Type === "lineas" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                        cursor: "pointer",
                      }}
                    >
                      📈 Líneas
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Ordenar:</span>
                    <select
                      value={chart1SortMode}
                      onChange={(e) => setChart1SortMode(e.target.value as any)}
                      style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 600, background: "#ffffff", color: "#0f172a" }}
                    >
                      <option value="cronologico">Orden cronológico</option>
                      <option value="valor">Por Valor Mayor (↓)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#0284c7" }} />
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#0284c7" }}>Y:</span>
                    <select
                      value={chart1LeftMetric}
                      onChange={(e) => handleChart1LeftMetricChange(e.target.value)}
                      style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 600, background: "#ffffff", maxWidth: "160px" }}
                    >
                      {renderGpsMetricOptions(chart1LeftMetric)}
                    </select>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#dc2626" }} />
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#dc2626" }}>Y2:</span>
                    <select
                      value={chart1RightMetric}
                      onChange={(e) => handleChart1RightMetricChange(e.target.value)}
                      style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 600, background: "#ffffff", maxWidth: "160px" }}
                    >
                      {renderGpsMetricOptions(chart1RightMetric)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Línea 2 (Abajo): Mini Leyendas y referencias, compacta y discreta */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px", paddingTop: "2px", borderTop: "1px dashed #e2e8f0" }}>
                <div
                  style={{
                    fontSize: "10px",
                    color: "#64748b",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span style={{ fontWeight: 800, color: "#1e3a8a" }}>ℹ️ Tipos:</span>
                  <span><strong>M</strong>: Medio</span> · <span><strong>L</strong>: Largo</span> · <span><strong>C</strong>: Corto</span> · <span><strong>DP</strong>: Doble Partido</span>
                </div>

                {chart1Type === "lineas" && subView === "jugador" && (
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#64748b",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <span><strong style={{ color: "#0f172a" }}>━</strong> Jugador</span>
                    <span>·</span>
                    <span><strong style={{ color: "#64748b" }}>╌╌</strong> Media Eq. (discontinua)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Render Recharts ComposedChart Gráfico 1 */}
            <div className="team-chart-screen-plot" style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                {chart1Type === "lineas" ? (
                  <ComposedChart data={chart1Data} margin={{ top: 18, right: 0, left: 0, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="name"
                      stroke="#0f172a"
                      interval={0}
                      tick={{ fontSize: 9.5, fontWeight: 700, fill: "#0f172a" }}
                      angle={-25}
                      textAnchor="end"
                    />
                    <YAxis yAxisId="left" orientation="left" stroke="#0284c7" tick={{ fontSize: 8.5, fontWeight: 600, fill: "#0284c7" }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#dc2626" tick={{ fontSize: 8.5, fontWeight: 600, fill: "#dc2626" }} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const pY1 = payload.find((p) => p.dataKey === "Y1");
                        const pY2 = payload.find((p) => p.dataKey === "Y2");
                        const pY1Team = payload.find((p) => p.dataKey === "Y1_team");
                        const pY2Team = payload.find((p) => p.dataKey === "Y2_team");
                        const fullItem = chart1Data.find((d) => d.name === label);
                        const tipoLabel = fullItem?.tipo ? (MICROCICLE_TYPE_CONFIG[fullItem.tipo as keyof typeof MICROCICLE_TYPE_CONFIG]?.label || fullItem.tipo) : "";
                        return (
                          <div
                            style={{
                              background: "#ffffff",
                              padding: "8px 12px",
                              border: "1px solid #cbd5e1",
                              borderRadius: "8px",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                              fontSize: "11px",
                            }}
                          >
                            <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: "4px" }}>
                              {fullItem?.fullName || label}
                              {tipoLabel && (
                                <span style={{ marginLeft: "6px", fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                                  [{tipoLabel}]
                                </span>
                              )}
                            </div>
                            <div style={{ color: "#0284c7", fontWeight: 700 }}>
                              {m1Left.label} : {pY1?.value ?? 0}
                              {subView === "jugador" && pY1Team?.value !== undefined && (
                                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 500, marginLeft: "6px" }}>
                                  (Media Eq: {pY1Team.value})
                                </span>
                              )}
                            </div>
                            <div style={{ color: "#dc2626", fontWeight: 700 }}>
                              {m1Right.label} : {pY2?.value ?? 0}
                              {subView === "jugador" && pY2Team?.value !== undefined && (
                                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 500, marginLeft: "6px" }}>
                                  (Media Eq: {pY2Team.value})
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }}
                    />
                    {/* Media Equipo Variable 1 (Y1) - Más fina y sombreada del color de la variable */}
                    {subView === "jugador" && (
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="Y1_team"
                        name={`Media Eq. (${m1Left.label})`}
                        stroke="#0284c7"
                        strokeWidth={1.4}
                        strokeOpacity={0.45}
                        strokeDasharray="4 3"
                        dot={{ fill: "#0284c7", opacity: 0.4, r: 2.5 }}
                        activeDot={{ r: 4, opacity: 0.6 }}
                      />
                    )}
                    {/* Línea Jugador Variable 1 (Y1) - Continua y destacada */}
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="Y1"
                      name={m1Left.label}
                      stroke="#0284c7"
                      strokeWidth={2.8}
                      dot={{ fill: "#0284c7", r: 4.5 }}
                      activeDot={{ r: 6.5 }}
                    >
                      <LabelList
                        dataKey="Y1"
                        position="top"
                        style={{ fontSize: "8px", fontWeight: 700, fill: "#0284c7" }}
                        formatter={(val: any) => (typeof val === "number" ? (val > 100 ? Math.round(val) : val) : val)}
                      />
                    </Line>

                    {/* Media Equipo Variable 2 (Y2) - Más fina y sombreada del color de la variable */}
                    {subView === "jugador" && (
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="Y2_team"
                        name={`Media Eq. (${m1Right.label})`}
                        stroke="#dc2626"
                        strokeWidth={1.4}
                        strokeOpacity={0.45}
                        strokeDasharray="4 3"
                        dot={{ fill: "#dc2626", opacity: 0.4, r: 2.5 }}
                        activeDot={{ r: 4, opacity: 0.6 }}
                      />
                    )}
                    {/* Línea Jugador Variable 2 (Y2) - Continua y destacada (ambas continuas) */}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="Y2"
                      name={m1Right.label}
                      stroke="#dc2626"
                      strokeWidth={2.8}
                      dot={{ fill: "#dc2626", r: 4.5 }}
                      activeDot={{ r: 6.5 }}
                    >
                      <LabelList
                        dataKey="Y2"
                        position="bottom"
                        style={{ fontSize: "8.5px", fontWeight: 700, fill: "#dc2626" }}
                        formatter={(val: any) => (typeof val === "number" ? (val > 100 ? Math.round(val) : val) : val)}
                      />
                    </Line>
                  </ComposedChart>
                ) : (
                  <ComposedChart data={chart1Data} margin={{ top: 18, right: 0, left: 0, bottom: 25 }} barCategoryGap="2%">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="name"
                      stroke="#0f172a"
                      interval={0}
                      tick={{ fontSize: 9.5, fontWeight: 700, fill: "#0f172a" }}
                      angle={-25}
                      textAnchor="end"
                    />
                    <YAxis yAxisId="left" orientation="left" stroke="#0284c7" tick={{ fontSize: 8.5, fontWeight: 600, fill: "#0284c7" }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#dc2626" tick={{ fontSize: 8.5, fontWeight: 600, fill: "#dc2626" }} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const pY1 = payload.find((p) => p.dataKey === "Y1");
                        const pY2 = payload.find((p) => p.dataKey === "Y2");
                        const fullItem = chart1Data.find((d) => d.name === label);
                        const tipoLabel = fullItem?.tipo ? (MICROCICLE_TYPE_CONFIG[fullItem.tipo as keyof typeof MICROCICLE_TYPE_CONFIG]?.label || fullItem.tipo) : "";
                        return (
                          <div
                            style={{
                              background: "#ffffff",
                              padding: "8px 12px",
                              border: "1px solid #cbd5e1",
                              borderRadius: "8px",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                              fontSize: "11px",
                            }}
                          >
                            <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: "4px" }}>
                              {fullItem?.fullName || label}
                              {tipoLabel && (
                                <span style={{ marginLeft: "6px", fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                                  [{tipoLabel}]
                                </span>
                              )}
                            </div>
                            <div style={{ color: "#0284c7", fontWeight: 700 }}>
                              {m1Left.label} : {pY1?.value ?? 0}
                            </div>
                            <div style={{ color: "#dc2626", fontWeight: 700 }}>
                              {m1Right.label} : {pY2?.value ?? 0}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar yAxisId="left" dataKey="Y1" name={m1Left.label} fill="#0284c7" radius={[3, 3, 0, 0]} barSize={40}>
                      <LabelList
                        dataKey="Y1"
                        position="insideBottom"
                        dy={-4}
                        style={{ fontSize: "8px", fontWeight: 700, fill: "#ffffff" }}
                        formatter={(val: any) => (typeof val === "number" ? (val > 100 ? Math.round(val) : val) : val)}
                      />
                    </Bar>
                    <Scatter yAxisId="right" dataKey="Y2" name={m1Right.label} fill="#dc2626" shape="circle">
                      <LabelList
                        dataKey="Y2"
                        position="top"
                        style={{ fontSize: "8.5px", fontWeight: 700, fill: "#dc2626" }}
                        formatter={(val: any) => (typeof val === "number" ? (val > 100 ? Math.round(val) : val) : val)}
                      />
                    </Scatter>
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Campo Limpio de Comentario debajo del Gráfico 1 */}
            <div style={{ marginTop: "4px" }}>
              <textarea
                value={chart1Comment}
                onChange={(e) => handleChart1CommentChange(e.target.value)}
                placeholder="Añadir comentario explicativo para el Gráfico 1..."
                rows={1}
                style={{
                  width: "100%",
                  padding: "4px 8px",
                  border: "none",
                  borderLeft: "3px solid #0284c7",
                  background: "#f8fafc",
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "#0f172a",
                  outline: "none",
                  resize: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>

          {/* =========================================================
              GRÁFICO 2 (BARRAS O LÍNEAS)
              ========================================================= */}
          <div
            style={{
              background: "#ffffff",
              padding: "10px 12px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              marginBottom: "16px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
            }}
          >
            {/* Controles de Gráfico 2 */}
            <div
              className="no-print"
              style={{
                marginBottom: "8px",
                background: "#f8fafc",
                padding: "6px 10px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                display: "flex",
                flexDirection: "column",
                gap: "5px",
              }}
            >
              {/* Línea 1 (Arriba): Título + Barras/Líneas + Ordenar + Selectores Y e Y2 */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <h3 style={{ fontSize: "12.5px", fontWeight: 800, color: "#0f172a", margin: 0, textTransform: "uppercase" }}>
                    📊 Gráfico 2
                  </h3>

                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      background: "#f1f5f9",
                      borderRadius: "6px",
                      padding: "2px",
                      border: "1px solid #cbd5e1",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleSetChart2Type("barras")}
                      style={{
                        fontSize: "10.5px",
                        fontWeight: chart2Type === "barras" ? 800 : 600,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        border: "none",
                        background: chart2Type === "barras" ? "#ffffff" : "transparent",
                        color: chart2Type === "barras" ? "#0f172a" : "#64748b",
                        boxShadow: chart2Type === "barras" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                        cursor: "pointer",
                      }}
                    >
                      📊 Barras
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetChart2Type("lineas")}
                      style={{
                        fontSize: "10.5px",
                        fontWeight: chart2Type === "lineas" ? 800 : 600,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        border: "none",
                        background: chart2Type === "lineas" ? "#ffffff" : "transparent",
                        color: chart2Type === "lineas" ? "#0f172a" : "#64748b",
                        boxShadow: chart2Type === "lineas" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                        cursor: "pointer",
                      }}
                    >
                      📈 Líneas
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Ordenar:</span>
                    <select
                      value={chart2SortMode}
                      onChange={(e) => setChart2SortMode(e.target.value as any)}
                      style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 600, background: "#ffffff", color: "#0f172a" }}
                    >
                      <option value="cronologico">Orden cronológico</option>
                      <option value="valor">Por Valor Mayor (↓)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#0284c7" }} />
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#0284c7" }}>Y:</span>
                    <select
                      value={chart2LeftMetric}
                      onChange={(e) => handleChart2LeftMetricChange(e.target.value)}
                      style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 600, background: "#ffffff", maxWidth: "160px" }}
                    >
                      {renderGpsMetricOptions(chart2LeftMetric)}
                    </select>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#dc2626" }} />
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#dc2626" }}>Y2:</span>
                    <select
                      value={chart2RightMetric}
                      onChange={(e) => handleChart2RightMetricChange(e.target.value)}
                      style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 600, background: "#ffffff", maxWidth: "160px" }}
                    >
                      {renderGpsMetricOptions(chart2RightMetric)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Línea 2 (Abajo): Mini Leyendas y referencias, compacta y discreta */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px", paddingTop: "2px", borderTop: "1px dashed #e2e8f0" }}>
                <div
                  style={{
                    fontSize: "10px",
                    color: "#64748b",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span style={{ fontWeight: 800, color: "#1e3a8a" }}>ℹ️ Tipos:</span>
                  <span><strong>M</strong>: Medio</span> · <span><strong>L</strong>: Largo</span> · <span><strong>C</strong>: Corto</span> · <span><strong>DP</strong>: Doble Partido</span>
                </div>

                {chart2Type === "lineas" && subView === "jugador" && (
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#64748b",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <span><strong style={{ color: "#0f172a" }}>━</strong> Jugador</span>
                    <span>·</span>
                    <span><strong style={{ color: "#64748b" }}>╌╌</strong> Media Eq. (discontinua)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Render Recharts ComposedChart Gráfico 2 */}
            <div className="team-chart-screen-plot" style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                {chart2Type === "lineas" ? (
                  <ComposedChart data={chart2Data} margin={{ top: 18, right: 0, left: 0, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="name"
                      stroke="#0f172a"
                      interval={0}
                      tick={{ fontSize: 9.5, fontWeight: 700, fill: "#0f172a" }}
                      angle={-25}
                      textAnchor="end"
                    />
                    <YAxis yAxisId="left" orientation="left" stroke="#0284c7" tick={{ fontSize: 8.5, fontWeight: 600, fill: "#0284c7" }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#dc2626" tick={{ fontSize: 8.5, fontWeight: 600, fill: "#dc2626" }} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const pY1 = payload.find((p) => p.dataKey === "Y1");
                        const pY2 = payload.find((p) => p.dataKey === "Y2");
                        const pY1Team = payload.find((p) => p.dataKey === "Y1_team");
                        const pY2Team = payload.find((p) => p.dataKey === "Y2_team");
                        const fullItem = chart2Data.find((d) => d.name === label);
                        const tipoLabel = fullItem?.tipo ? (MICROCICLE_TYPE_CONFIG[fullItem.tipo as keyof typeof MICROCICLE_TYPE_CONFIG]?.label || fullItem.tipo) : "";
                        return (
                          <div
                            style={{
                              background: "#ffffff",
                              padding: "8px 12px",
                              border: "1px solid #cbd5e1",
                              borderRadius: "8px",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                              fontSize: "11px",
                            }}
                          >
                            <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: "4px" }}>
                              {fullItem?.fullName || label}
                              {tipoLabel && (
                                <span style={{ marginLeft: "6px", fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                                  [{tipoLabel}]
                                </span>
                              )}
                            </div>
                            <div style={{ color: "#0284c7", fontWeight: 700 }}>
                              {m2Left.label} : {pY1?.value ?? 0}
                              {subView === "jugador" && pY1Team?.value !== undefined && (
                                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 500, marginLeft: "6px" }}>
                                  (Media Eq: {pY1Team.value})
                                </span>
                              )}
                            </div>
                            <div style={{ color: "#dc2626", fontWeight: 700 }}>
                              {m2Right.label} : {pY2?.value ?? 0}
                              {subView === "jugador" && pY2Team?.value !== undefined && (
                                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 500, marginLeft: "6px" }}>
                                  (Media Eq: {pY2Team.value})
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }}
                    />
                    {/* Media Equipo Variable 1 (Y1) - Más fina y sombreada del color de la variable */}
                    {subView === "jugador" && (
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="Y1_team"
                        name={`Media Eq. (${m2Left.label})`}
                        stroke="#0284c7"
                        strokeWidth={1.4}
                        strokeOpacity={0.45}
                        strokeDasharray="4 3"
                        dot={{ fill: "#0284c7", opacity: 0.4, r: 2.5 }}
                        activeDot={{ r: 4, opacity: 0.6 }}
                      />
                    )}
                    {/* Línea Jugador Variable 1 (Y1) - Continua y destacada */}
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="Y1"
                      name={m2Left.label}
                      stroke="#0284c7"
                      strokeWidth={2.8}
                      dot={{ fill: "#0284c7", r: 4.5 }}
                      activeDot={{ r: 6.5 }}
                    >
                      <LabelList
                        dataKey="Y1"
                        position="top"
                        style={{ fontSize: "8px", fontWeight: 700, fill: "#0284c7" }}
                        formatter={(val: any) => (typeof val === "number" ? (val > 100 ? Math.round(val) : val) : val)}
                      />
                    </Line>

                    {/* Media Equipo Variable 2 (Y2) - Más fina y sombreada del color de la variable */}
                    {subView === "jugador" && (
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="Y2_team"
                        name={`Media Eq. (${m2Right.label})`}
                        stroke="#dc2626"
                        strokeWidth={1.4}
                        strokeOpacity={0.45}
                        strokeDasharray="4 3"
                        dot={{ fill: "#dc2626", opacity: 0.4, r: 2.5 }}
                        activeDot={{ r: 4, opacity: 0.6 }}
                      />
                    )}
                    {/* Línea Jugador Variable 2 (Y2) - Continua y destacada (ambas continuas) */}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="Y2"
                      name={m2Right.label}
                      stroke="#dc2626"
                      strokeWidth={2.8}
                      dot={{ fill: "#dc2626", r: 4.5 }}
                      activeDot={{ r: 6.5 }}
                    >
                      <LabelList
                        dataKey="Y2"
                        position="bottom"
                        style={{ fontSize: "8.5px", fontWeight: 700, fill: "#dc2626" }}
                        formatter={(val: any) => (typeof val === "number" ? (val > 100 ? Math.round(val) : val) : val)}
                      />
                    </Line>
                  </ComposedChart>
                ) : (
                  <ComposedChart data={chart2Data} margin={{ top: 18, right: 0, left: 0, bottom: 25 }} barCategoryGap="2%">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="name"
                      stroke="#0f172a"
                      interval={0}
                      tick={{ fontSize: 9.5, fontWeight: 700, fill: "#0f172a" }}
                      angle={-25}
                      textAnchor="end"
                    />
                    <YAxis yAxisId="left" orientation="left" stroke="#0284c7" tick={{ fontSize: 8.5, fontWeight: 600, fill: "#0284c7" }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#dc2626" tick={{ fontSize: 8.5, fontWeight: 600, fill: "#dc2626" }} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const pY1 = payload.find((p) => p.dataKey === "Y1");
                        const pY2 = payload.find((p) => p.dataKey === "Y2");
                        const fullItem = chart2Data.find((d) => d.name === label);
                        const tipoLabel = fullItem?.tipo ? (MICROCICLE_TYPE_CONFIG[fullItem.tipo as keyof typeof MICROCICLE_TYPE_CONFIG]?.label || fullItem.tipo) : "";
                        return (
                          <div
                            style={{
                              background: "#ffffff",
                              padding: "8px 12px",
                              border: "1px solid #cbd5e1",
                              borderRadius: "8px",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                              fontSize: "11px",
                            }}
                          >
                            <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: "4px" }}>
                              {fullItem?.fullName || label}
                              {tipoLabel && (
                                <span style={{ marginLeft: "6px", fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                                  [{tipoLabel}]
                                </span>
                              )}
                            </div>
                            <div style={{ color: "#0284c7", fontWeight: 700 }}>
                              {m2Left.label} : {pY1?.value ?? 0}
                            </div>
                            <div style={{ color: "#dc2626", fontWeight: 700 }}>
                              {m2Right.label} : {pY2?.value ?? 0}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar yAxisId="left" dataKey="Y1" name={m2Left.label} fill="#0284c7" radius={[3, 3, 0, 0]} barSize={40}>
                      <LabelList
                        dataKey="Y1"
                        position="insideBottom"
                        dy={-4}
                        style={{ fontSize: "8px", fontWeight: 700, fill: "#ffffff" }}
                        formatter={(val: any) => (typeof val === "number" ? (val > 100 ? Math.round(val) : val) : val)}
                      />
                    </Bar>
                    <Scatter yAxisId="right" dataKey="Y2" name={m2Right.label} fill="#dc2626" shape="circle">
                      <LabelList
                        dataKey="Y2"
                        position="top"
                        style={{ fontSize: "8.5px", fontWeight: 700, fill: "#dc2626" }}
                        formatter={(val: any) => (typeof val === "number" ? (val > 100 ? Math.round(val) : val) : val)}
                      />
                    </Scatter>
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Campo Limpio de Comentario debajo del Gráfico 2 */}
            <div style={{ marginTop: "4px" }}>
              <textarea
                value={chart2Comment}
                onChange={(e) => handleChart2CommentChange(e.target.value)}
                placeholder="Añadir comentario explicativo para el Gráfico 2..."
                rows={1}
                style={{
                  width: "100%",
                  padding: "4px 8px",
                  border: "none",
                  borderLeft: "3px solid #0284c7",
                  background: "#f8fafc",
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "#0f172a",
                  outline: "none",
                  resize: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>

          {/* =========================================================
              TABLA MATRICIAL LIMPIA, CONCISA Y TRANSPUESTA
              ========================================================= */}
          <div
            style={{
              background: "#ffffff",
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
            }}
          >
            {/* Cabecera de la Tabla */}
            <div
              className="no-print"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "10px",
                flexWrap: "wrap",
                gap: "8px",
                background: "#f8fafc",
                padding: "6px 10px",
                borderRadius: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ fontSize: "12.5px", fontWeight: 800, color: "#0f172a", margin: 0, textTransform: "uppercase" }}>
                  📋 Resumen por Microciclos
                </h3>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", background: "#e2e8f0", padding: "1px 6px", borderRadius: "10px" }}>
                  {activeTableVariablesList.length} variables
                </span>
              </div>

              {/* Botones de Selección de Variables */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => setShowVariableModal(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1px solid #0284c7",
                    background: "#eff6ff",
                    color: "#0284c7",
                    fontSize: "11.5px",
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: "0 1px 2px rgba(2,132,199,0.1)",
                  }}
                  title="Elegir qué variables mostrar en la tabla"
                >
                  <span>⚙️ Elegir variables</span>
                  <span style={{ background: "#0284c7", color: "#ffffff", fontSize: "10px", padding: "0 5px", borderRadius: "10px" }}>
                    {selectedTableMetricKeys.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const favs = Array.from(new Set([chart1LeftMetric, chart1RightMetric, chart2LeftMetric, chart2RightMetric, ...favoriteKeys]));
                    updateSelectedTableMetrics(favs);
                  }}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "4px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    fontSize: "10.5px",
                    fontWeight: 700,
                    color: "#475569",
                    cursor: "pointer",
                  }}
                  title="Cargar las 4 de los gráficos + favoritas"
                >
                  ⭐ Favoritas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateSelectedTableMetrics([chart1LeftMetric, chart1RightMetric, chart2LeftMetric, chart2RightMetric]);
                  }}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "4px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    fontSize: "10.5px",
                    fontWeight: 700,
                    color: "#475569",
                    cursor: "pointer",
                  }}
                  title="Mostrar únicamente las 4 de los gráficos"
                >
                  📊 4 Gráficos
                </button>
              </div>
            </div>

            {/* Render de la Tabla Matricial Limpia y Concisa */}
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  fontSize: "11px",
                }}
              >
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    <th
                      style={{
                        position: "sticky",
                        left: 0,
                        background: "#f1f5f9",
                        zIndex: 2,
                        padding: "8px 10px",
                        textAlign: "left",
                        fontWeight: 800,
                        color: "#0f172a",
                        borderBottom: "2px solid #cbd5e1",
                        minWidth: "155px",
                      }}
                    >
                      Métrica
                    </th>

                    {/* Columnas Concisas de Microciclos */}
                    {activeMicrocycles.map((mc) => {
                      const tipo = getMicrocycleType(mc);
                      const abbr = getMicrocycleAbbr(tipo);
                      const cfg = MICROCICLE_TYPE_CONFIG[tipo as keyof typeof MICROCICLE_TYPE_CONFIG] || MICROCICLE_TYPE_CONFIG.sin_categorizar;
                      const sessionDates = Array.from(new Set(teamGpsRecords.filter(r => r.fecha >= mc.start && r.fecha <= mc.end).map(r => r.fecha)));
                      return (
                        <th
                          key={mc.id}
                          style={{
                            padding: "6px 8px",
                            textAlign: "center",
                            fontWeight: 800,
                            color: "#0f172a",
                            borderBottom: "2px solid #cbd5e1",
                            minWidth: "95px",
                          }}
                        >
                          <div style={{ fontSize: "11px", fontWeight: 800, color: "#0f172a" }}>
                            {mc.shortLabel}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", marginTop: "3px" }}>
                            {abbr ? (
                              <span
                                style={{
                                  fontSize: "9px",
                                  fontWeight: 900,
                                  background: cfg?.bg || "#e2e8f0",
                                  color: cfg?.color || "#0f172a",
                                  padding: "1px 5px",
                                  borderRadius: "3px",
                                  border: "1px solid rgba(0,0,0,0.08)",
                                }}
                                title={cfg?.label || abbr}
                              >
                                {abbr}
                              </span>
                            ) : null}
                            <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600 }}>
                              {sessionDates.length} ses.
                            </span>
                          </div>
                        </th>
                      );
                    })}

                    <th
                      style={{
                        padding: "6px 8px",
                        textAlign: "center",
                        fontWeight: 900,
                        color: "#1e3a8a",
                        background: "#e0f2fe",
                        borderBottom: "2px solid #93c5fd",
                        minWidth: "80px",
                      }}
                    >
                      Total
                    </th>

                    <th
                      style={{
                        padding: "6px 8px",
                        textAlign: "center",
                        fontWeight: 900,
                        color: "#0f172a",
                        background: "#f1f5f9",
                        borderBottom: "2px solid #cbd5e1",
                        minWidth: "80px",
                      }}
                    >
                      Media
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {activeTableVariablesList.map((vDef, rIdx) => {
                    const isPlayer = subView === "jugador" && Boolean(jugador);
                    const isPeak =
                      vDef.key.toLowerCase().includes("speed") ||
                      vDef.key.toLowerCase().includes("velocidad") ||
                      vDef.key.toLowerCase().includes("max") ||
                      vDef.key.toLowerCase().includes("pico");

                    const rowVals = activeMicrocycles.map((mc) => {
                      return isPlayer
                        ? getPlayerValInMicrocycle(jugador!.id, mc, vDef.key)
                        : getTeamAvgInMicrocycle(mc, vDef.key);
                    });

                    const maxRowVal = Math.max(...rowVals, 0.0001);
                    const totalVal = isPeak
                      ? Math.max(...rowVals, 0)
                      : rowVals.reduce((a, b) => a + b, 0);
                    const avgVal = rowVals.length > 0 ? totalVal / rowVals.length : 0;
                    const cleanLabel = getCleanMetricLabel(vDef);

                    return (
                      <tr
                        key={vDef.key}
                        style={{
                          background: rIdx % 2 === 0 ? "#ffffff" : "#f8fafc",
                          borderBottom: "1px solid #e2e8f0",
                        }}
                      >
                        <td
                          style={{
                            position: "sticky",
                            left: 0,
                            background: rIdx % 2 === 0 ? "#ffffff" : "#f8fafc",
                            zIndex: 1,
                            padding: "5px 8px",
                            fontWeight: 700,
                            color: "#0f172a",
                            borderBottom: "1px solid #e2e8f0",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              {favoriteKeys.includes(vDef.key) && (
                                <span style={{ color: "#eab308", fontSize: "10px" }}>★</span>
                              )}
                              <span>{cleanLabel}</span>
                              {vDef.unit && (
                                <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 500 }}>
                                  ({vDef.unit})
                                </span>
                              )}
                            </div>
                            {selectedTableMetricKeys.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMetricFromTable(vDef.key)}
                                title="Quitar de la tabla"
                                className="no-print"
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color: "#94a3b8",
                                  fontSize: "11px",
                                  cursor: "pointer",
                                  padding: "0 2px",
                                  lineHeight: 1,
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = "#dc2626")}
                                onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </td>

                        {rowVals.map((val, cIdx) => {
                          const ratio = Math.min(val / maxRowVal, 1);
                          const bgAlpha = ratio > 0 ? (0.05 + ratio * 0.22).toFixed(2) : "0";
                          const cellBg = ratio > 0 ? `rgba(2, 132, 199, ${bgAlpha})` : "transparent";

                          return (
                            <td
                              key={activeMicrocycles[cIdx].id}
                              style={{
                                padding: "5px 6px",
                                textAlign: "center",
                                fontWeight: val > 0 ? 700 : 500,
                                color: val > 0 ? "#0f172a" : "#94a3b8",
                                background: cellBg,
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              {val > 100 ? Math.round(val) : val}
                            </td>
                          );
                        })}

                        <td
                          style={{
                            padding: "5px 6px",
                            textAlign: "center",
                            fontWeight: 900,
                            color: "#1e3a8a",
                            background: "#f0f9ff",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          {totalVal > 100 ? Math.round(totalVal) : Math.round(totalVal * 10) / 10}
                        </td>

                        <td
                          style={{
                            padding: "5px 6px",
                            textAlign: "center",
                            fontWeight: 700,
                            color: "#0f172a",
                            background: "#f8fafc",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          {avgVal > 100 ? Math.round(avgVal) : Math.round(avgVal * 10) / 10}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Añadir más variables */}
            <div className="no-print" style={{ marginTop: "8px", display: "flex", justifyContent: "flex-start" }}>
              <button
                type="button"
                onClick={() => setShowVariableModal(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#0284c7",
                  background: "transparent",
                  border: "1px dashed #93c5fd",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                <span>+ Modificar variables de la tabla...</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL INTERACTIVO PARA ELEGIR VARIABLES DE LA TABLA
          ========================================================= */}
      {showVariableModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "16px",
          }}
          onClick={() => setShowVariableModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "600px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              border: "1px solid #cbd5e1",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#f8fafc",
              }}
            >
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                  ⚙️ Elegir Variables para la Tabla
                </h3>
                <p style={{ fontSize: "11px", color: "#64748b", margin: "2px 0 0 0" }}>
                  Marca las variables que deseas ver como filas en la tabla ({selectedTableMetricKeys.length} seleccionadas)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowVariableModal(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "18px",
                  fontWeight: 800,
                  color: "#64748b",
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: "4px",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "10px 16px", borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
              <input
                type="text"
                value={varModalSearch}
                onChange={(e) => setVarModalSearch(e.target.value)}
                placeholder="🔍 Buscar variable..."
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "12px",
                  outline: "none",
                  marginBottom: "8px",
                }}
              />
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => {
                    const favs = Array.from(new Set([chart1LeftMetric, chart1RightMetric, chart2LeftMetric, chart2RightMetric, ...favoriteKeys]));
                    updateSelectedTableMetrics(favs);
                  }}
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "4px",
                    border: "1px solid #cbd5e1",
                    background: "#f1f5f9",
                    cursor: "pointer",
                  }}
                >
                  ⭐ Cargar Favoritas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateSelectedTableMetrics([chart1LeftMetric, chart1RightMetric, chart2LeftMetric, chart2RightMetric]);
                  }}
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "4px",
                    border: "1px solid #cbd5e1",
                    background: "#f1f5f9",
                    cursor: "pointer",
                  }}
                >
                  📊 Solo 4 Gráficos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateSelectedTableMetrics(allVariables.map((v) => v.key));
                  }}
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "4px",
                    border: "1px solid #cbd5e1",
                    background: "#f1f5f9",
                    cursor: "pointer",
                  }}
                >
                  Marcar Todas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateSelectedTableMetrics([chart1LeftMetric]);
                  }}
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "4px",
                    border: "1px solid #cbd5e1",
                    background: "#f1f5f9",
                    cursor: "pointer",
                  }}
                >
                  Desmarcar
                </button>
              </div>
            </div>

            <div style={{ padding: "12px 16px", overflowY: "auto", flex: 1 }}>
              {(() => {
                const filtered = allVariables.filter(
                  (v) =>
                    v.label.toLowerCase().includes(varModalSearch.toLowerCase()) ||
                    getCleanMetricLabel(v).toLowerCase().includes(varModalSearch.toLowerCase()) ||
                    (v.categoria && v.categoria.toLowerCase().includes(varModalSearch.toLowerCase()))
                );

                const grouped = new Map<string, GpsVariableDef[]>();
                filtered.forEach((v) => {
                  const cat = v.categoria || "Otras";
                  if (!grouped.has(cat)) grouped.set(cat, []);
                  grouped.get(cat)!.push(v);
                });

                if (filtered.length === 0) {
                  return (
                    <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px", fontSize: "12px" }}>
                      No se encontraron variables con "${varModalSearch}"
                    </div>
                  );
                }

                return Array.from(grouped.entries()).map(([cat, vars]) => (
                  <div key={cat} style={{ marginBottom: "12px" }}>
                    <div
                      style={{
                        fontSize: "10.5px",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        color: "#64748b",
                        letterSpacing: "0.5px",
                        marginBottom: "4px",
                        borderBottom: "1px solid #f1f5f9",
                        paddingBottom: "2px",
                      }}
                    >
                      {cat}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                      {vars.map((v) => {
                        const isChecked = selectedTableMetricKeys.includes(v.key);
                        return (
                          <label
                            key={v.key}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              background: isChecked ? "#eff6ff" : "#f8fafc",
                              border: isChecked ? "1px solid #93c5fd" : "1px solid #e2e8f0",
                              cursor: "pointer",
                              fontSize: "11px",
                              userSelect: "none",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleMetric(v.key)}
                              style={{ accentColor: "#0284c7", cursor: "pointer" }}
                            />
                            <span style={{ fontWeight: isChecked ? 700 : 500, color: isChecked ? "#1e40af" : "#0f172a", flex: 1 }}>
                              {favoriteKeys.includes(v.key) && <span style={{ color: "#eab308" }}>★ </span>}
                              {getCleanMetricLabel(v)}
                            </span>
                            {v.unit && (
                              <span style={{ fontSize: "9.5px", color: "#64748b" }}>
                                {v.unit}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>

            <div
              style={{
                padding: "10px 16px",
                borderTop: "1px solid #e2e8f0",
                background: "#f8fafc",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>
                {selectedTableMetricKeys.length} seleccionadas
              </span>
              <button
                type="button"
                onClick={() => setShowVariableModal(false)}
                style={{
                  padding: "6px 16px",
                  borderRadius: "6px",
                  background: "#0284c7",
                  color: "#ffffff",
                  fontWeight: 800,
                  fontSize: "12px",
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(2,132,199,0.2)",
                }}
              >
                Aplicar a la Tabla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ESTILOS DE IMPRESIÓN Y EXPORTACIÓN PDF */}
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          body, html {
            background: #ffffff !important;
          }
          .gps-report-sheet {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
