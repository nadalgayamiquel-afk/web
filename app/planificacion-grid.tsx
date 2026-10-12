/**
 * Componente: PlanificacionGrid
 * Ruta: app/planificacion-grid.tsx
 *
 * Rejilla de planificación de disponibilidad simple (Semáforo Verde/Amarillo/Rojo)
 * DÍAS en columnas (horizontal), JUGADORES en filas (vertical).
 *
 * Mapeo de disponibilidad:
 * - Verde -> 'D' (se guarda 'D' directamente)
 * - Amarillo -> Mini-selector de 2 opciones: 'P', 'NDR'
 * - Rojo -> Mini-selector de 5 opciones: 'NDO', 'NDL', 'DCI', 'DCS', 'DS'
 * ('L' no aparece en ningún mini-selector)
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { updateEstadoDiarioJugador, fetchLiveWellnessSheet } from "@/app/actions";
import {
  getSemaforoEstilos,
  OPCIONES_AMARILLO,
  OPCIONES_ROJO,
  DISPONIBILIDADES,
} from "@/app/lib/disponibilidad";

type Day = {
  id: string;
  fecha: string;
  periodo: string | null;
  subperiodo: string | null;
  semana: number | null;
  md: string | null;
  rival: string | null;
  evento_am: string | null;
  evento_pm: string | null;
  carga?: string | null;
  volumen?: string | null;
  intensidad?: string | null;
};

type Player = { id: string; nombre: string; apodo: string | null };

type State = {
  jugador_id: string;
  sesion_dia_id: string;
  disponibilidad: string | null;
  objetivo: string | null;
};

type Props = { days: Day[]; players: Player[]; states: State[]; bbddRows?: any[] };

function fechaCorta(fechaISO: string): string {
  const d = new Date(fechaISO + "T00:00:00");
  const dias = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dias[d.getDay()]} ${dd}/${mm}`;
}

function normalizeDateStr(dateStr: string): string {
  if (!dateStr) return "";
  const clean = dateStr.trim().split(" ")[0].split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const partsSlash = clean.split("/");
  if (partsSlash.length === 3) {
    const d = partsSlash[0].padStart(2, "0");
    const m = partsSlash[1].padStart(2, "0");
    const y = partsSlash[2].length === 2 ? `20${partsSlash[2]}` : partsSlash[2];
    return `${y}-${m}-${d}`;
  }
  const partsDash = clean.split("-");
  if (partsDash.length === 3 && partsDash[0].length <= 2) {
    const d = partsDash[0].padStart(2, "0");
    const m = partsDash[1].padStart(2, "0");
    const y = partsDash[2].length === 2 ? `20${partsDash[2]}` : partsDash[2];
    return `${y}-${m}-${d}`;
  }
  return clean;
}

function normalizeNameStr(name: string): string {
  return name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function matchPlayerName(sheetNameRaw: string, player: { nombre?: string | null; apodo?: string | null }): boolean {
  const sNorm = normalizeNameStr(sheetNameRaw);
  const pNombre = normalizeNameStr(player.nombre || "");
  const pApodo = normalizeNameStr(player.apodo || "");
  if (!sNorm) return false;
  if ((sNorm.includes("puli") || sNorm.includes("pulido")) && (pNombre.includes("puli") || pNombre.includes("pulido") || pApodo.includes("puli") || pApodo.includes("pulido"))) {
    return true;
  }
  if (pNombre && (pNombre.includes(sNorm) || sNorm.includes(pNombre))) return true;
  if (pApodo && (pApodo.includes(sNorm) || sNorm.includes(pApodo))) return true;
  return false;
}

function extractRecordDateISO(rec: Record<string, any>): string {
  if (!rec) return "";
  if (rec.created_at && typeof rec.created_at === "string") {
    return normalizeDateStr(rec.created_at);
  }
  const keys = Object.keys(rec);
  for (const k of keys) {
    if (k.toLowerCase().includes("fecha") || k.toLowerCase().includes("date")) {
      const v = rec[k];
      if (v) return normalizeDateStr(String(v));
    }
  }
  return "";
}

function extractCommentFromWellnessRecord(rec: Record<string, any>): string {
  if (!rec) return "";
  const keys = Object.keys(rec);
  let rawText = "";

  const titleKey = keys.find((k) => {
    const kNorm = k.toLowerCase().trim();
    return (
      kNorm.includes("wellness") ||
      kNorm.includes("comentario") ||
      kNorm === "comentarios" ||
      kNorm === "observaciones" ||
      kNorm === "notas"
    );
  });

  if (titleKey && rec[titleKey] !== undefined && rec[titleKey] !== null) {
    rawText = String(rec[titleKey]).trim();
  }

  if (!rawText) {
    if (rec["_colH"] !== undefined && rec["_colH"] !== null) {
      rawText = String(rec["_colH"]).trim();
    } else if (rec["_col7"] !== undefined && rec["_col7"] !== null) {
      rawText = String(rec["_col7"]).trim();
    } else if (keys.length > 7 && rec[keys[7]] !== undefined && rec[keys[7]] !== null) {
      rawText = String(rec[keys[7]]).trim();
    }
  }

  if (!rawText && rec.payload && typeof rec.payload === "object") {
    rawText = String(
      rec.payload["Comentario Wellness"] ||
        rec.payload["comentario_wellness"] ||
        rec.payload["Comentarios Wellness"] ||
        rec.payload["Comentarios"] ||
        rec.payload["comentario"] ||
        rec.payload["Observaciones"] ||
        ""
    ).trim();
  }
  if (!rawText) return "";
  if (/^\d+$/.test(rawText)) return "";
  const lower = rawText.toLowerCase();
  if (
    lower === "—" ||
    lower === "-" ||
    lower === "null" ||
    lower === "undefined" ||
    lower === "n/a" ||
    lower === "ninguno" ||
    lower === "ninguna" ||
    lower === "no" ||
    lower === "sin molestias" ||
    lower === "ninguna molestia" ||
    lower === "ok"
  ) {
    return "";
  }
  return rawText;
}

function extractRecordPlayerName(rec: Record<string, any>): string {
  if (!rec) return "";
  const keys = Object.keys(rec);
  const explicit = rec["_colC"] || rec["_col2"] || (keys.length > 2 ? rec[keys[2]] : null) || rec["jugadora_nombre"] || rec["Jugadora"] || rec["Jugador"] || rec["_colB"] || rec["Nombre"] || rec["Nombre y Apellidos"] || rec["Apellidos y Nombre"];
  if (explicit && typeof explicit === "string" && !/^\d{1,4}[\/\-\.]\d{1,4}/.test(explicit.trim())) {
    return explicit.trim();
  }
  for (let i = 0; i < Math.min(keys.length, 4); i++) {
    const val = rec[keys[i]];
    if (typeof val === "string" && val.trim().length > 1 && !normalizeDateStr(val)) {
      return val.trim();
    }
  }
  return "";
}

function getStrictWellnessComment(rec: Record<string, any>): string {
  return extractCommentFromWellnessRecord(rec);
}

export function PlanificacionGrid({ days, players, states, bbddRows = [] }: Props) {
  // Construir mapa de eventos específicos desde BBDD por jugador y fecha
  const playerBBDDEventsMap = useRef<Record<string, Array<{ tipo: string; hora: string; realiza: string; disp: string; num_evento?: number; duracion?: string; lugar?: string }>>>({});

  useEffect(() => {
    const map: Record<string, Array<{ tipo: string; hora: string; realiza: string; disp: string; num_evento: number; duracion: string; lugar: string }>> = {};
    if (bbddRows && bbddRows.length > 0) {
      bbddRows.forEach((r) => {
        const jug = (r.jugador || "").toUpperCase().trim();
        const f = r.fecha || "";
        const tipo = r.tipo_de_evento || "";
        if (jug && f && tipo) {
          const key = `${jug}_${f}`;
          if (!map[key]) map[key] = [];
          map[key].push({
            tipo: tipo,
            hora: r.hora_evento || "",
            realiza: r.realiza_evento || "",
            disp: r.disponibilidad || "D",
            num_evento: Number(r.num_evento) || 1,
            duracion: r.duracion_evento || "",
            lugar: r.lugar_evento || "",
          });
        }
      });

      // Ordenar estrictamente por Nº de Evento (1, 2, 3...)
      Object.keys(map).forEach((k) => {
        map[k].sort((a, b) => a.num_evento - b.num_evento);
      });
    }
    playerBBDDEventsMap.current = map;
  }, [bbddRows]);

  // Estado local para actualizaciones en tiempo real: "jugadorId_sesionDiaId" -> disponibilidad
  const [localMap, setLocalMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};

    // 1. Cargar desde la BBDD (prop states)
    const dayFechaMap = new Map<string, string>();
    days.forEach((d) => dayFechaMap.set(d.id, d.fecha));

    states.forEach((s) => {
      if (s.disponibilidad) {
        map[`${s.jugador_id}_${s.sesion_dia_id}`] = s.disponibilidad;
        const f = dayFechaMap.get(s.sesion_dia_id);
        if (f) map[`${s.jugador_id}_${f}`] = s.disponibilidad;
      }
    });

    // 2. Cargar datos locales respaldados en localStorage (garantiza persistencia inmediata en el cliente)
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("planificacion_disponibilidad_map");
        if (saved) {
          const parsed = JSON.parse(saved);
          Object.assign(map, parsed);
        }
      } catch (e) {
        console.error("Error leyendo disponibilidad de localStorage:", e);
      }
    }
    return map;
  });

  // Sincronizar states entrantes preservando adiciones de cliente
  useEffect(() => {
    setLocalMap((prev) => {
      const next = { ...prev };
      states.forEach((s) => {
        const key = `${s.jugador_id}_${s.sesion_dia_id}`;
        if (s.disponibilidad && next[key] === undefined) {
          next[key] = s.disponibilidad;
        }
      });
      return next;
    });
  }, [states]);

  // Estado para comentarios de Wellness: "jugadorId_fechaISO" -> comentario
  const [wellnessMap, setWellnessMap] = useState<Record<string, string>>({});
  const [isRefreshingWellness, setIsRefreshingWellness] = useState<boolean>(false);

  const loadWellness = async () => {
    setIsRefreshingWellness(true);
    try {
      const urlToUse = typeof window !== "undefined"
        ? localStorage.getItem("wellness_sheet_url_v2") || ""
        : "https://docs.google.com/spreadsheets/d/1ACZbF7rNgx4kx3ACbpT7JhBN4mJrnWt3n_jZqpU75gw/edit?gid=321515819#gid=321515819";

      let allRecords: any[] = [];
      try {
        const res = await fetchLiveWellnessSheet(urlToUse);
        if (res.success && Array.isArray(res.data)) {
          allRecords = [...res.data];
        }
      } catch (e) {}

      try {
        const apiRes = await fetch("/api/wellness/webhook");
        if (apiRes.ok) {
          const apiJson = await apiRes.json();
          if (apiJson?.success && Array.isArray(apiJson.data)) {
            allRecords = [...allRecords, ...apiJson.data];
          }
        }
      } catch (e) {}

      const newMap: Record<string, string> = {};
      allRecords.forEach((rec) => {
        const fechaISO = extractRecordDateISO(rec);
        const nombreRaw = extractRecordPlayerName(rec);
        const comentarioTexto = getStrictWellnessComment(rec);
        if (!comentarioTexto || !fechaISO || !nombreRaw) return;

        const matchingPlayer = players.find((p) => matchPlayerName(nombreRaw, p));
        if (matchingPlayer) {
          newMap[`${matchingPlayer.id}_${fechaISO}`] = comentarioTexto;
        }
      });

      setWellnessMap(newMap);
    } catch (err) {
      console.error("Error cargando comentarios wellness:", err);
    } finally {
      setIsRefreshingWellness(false);
    }
  };

  useEffect(() => {
    // Cargar comentarios wellness diferidos tras la renderización inicial del componente
    const timer = setTimeout(() => {
      loadWellness();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Estado para la celda seleccionada (para abrir el mini-selector de semáforo)
  const [activeCell, setActiveCell] = useState<{ jugadorId: string; sesionDiaId: string; playerName: string; dateStr: string; fechaISO: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"principal" | "amarillo" | "rojo">("principal");

  // Filtro de jugadores (Búsqueda por texto y Ocultar/Mostrar específicos)
  const [busqueda, setBusqueda] = useState("");
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("planificacion_hidden_players");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return new Set(parsed);
        }
      } catch (e) {
        console.error("Error cargando jugadores ocultos de localStorage:", e);
      }
    }
    return new Set();
  });
  const [showVisibilityMenu, setShowVisibilityMenu] = useState(false);
  const [filterMenuText, setFilterMenuText] = useState("");

  // Guardar hiddenIds en localStorage cuando cambie
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("planificacion_hidden_players", JSON.stringify(Array.from(hiddenIds)));
      } catch (e) {
        console.error("Error guardando jugadores ocultos en localStorage:", e);
      }
    }
  }, [hiddenIds]);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowVisibilityMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleHideJugador = (id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const showAllJugadores = () => setHiddenIds(new Set());
  const hideAllJugadores = () => setHiddenIds(new Set(players.map((p) => p.id)));

  const visiblePlayers = players
    .filter((p) => !hiddenIds.has(p.id))
    .filter((p) => {
      if (!busqueda.trim()) return true;
      const q = busqueda.trim().toLowerCase();
      return p.nombre.toLowerCase().includes(q) || (p.apodo || "").toLowerCase().includes(q);
    });

  const playersMenuFiltered = players.filter((p) => {
    if (!filterMenuText.trim()) return true;
    const q = filterMenuText.trim().toLowerCase();
    return p.nombre.toLowerCase().includes(q) || (p.apodo || "").toLowerCase().includes(q);
  });

  const handleSelectCode = async (jugadorId: string, sesionDiaId: string, code: string | null) => {
    const key = `${jugadorId}_${sesionDiaId}`;
    const newCode = code || "";
    
    setLocalMap((prev) => {
      const nextMap = { ...prev, [key]: newCode };
      if (activeCell?.fechaISO) {
        nextMap[`${jugadorId}_${activeCell.fechaISO}`] = newCode;
      }
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("planificacion_disponibilidad_map", JSON.stringify(nextMap));
          // Sincronizar también con el mapa de disponibilidad del informe/campo
          localStorage.setItem("disponibilidad_map_v1", JSON.stringify(nextMap));
        } catch (e) {
          console.error("Error guardando disponibilidad en localStorage:", e);
        }
      }
      return nextMap;
    });

    setActiveCell(null);
    setActiveTab("principal");

    // Guardar en la BBDD en segundo plano (optimistic update instantáneo)
    updateEstadoDiarioJugador(jugadorId, sesionDiaId, code).catch((err) => {
      console.error("Error al actualizar disponibilidad en Supabase:", err);
    });
  };

  const hiddenCount = hiddenIds.size;

  return (
    <div className="planning-grid-wrapper" style={{ position: "relative" }}>
      {/* BARRA DE HERRAMIENTAS Y FILTROS DE JUGADORES */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "12px",
          background: "#ffffff",
          padding: "10px 14px",
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* BOTÓN DE ACTUALIZACIÓN DE WELLNESS */}
          <button
            type="button"
            onClick={loadWellness}
            disabled={isRefreshingWellness}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid #0284c7",
              background: isRefreshingWellness ? "#e0f2fe" : "#f0f9ff",
              color: "#0369a1",
              fontSize: "11.5px",
              fontWeight: 800,
              cursor: isRefreshingWellness ? "wait" : "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
              transition: "all 0.15s ease",
            }}
            title="Actualizar datos y comentarios de Wellness desde Google Sheets y Webhook"
          >
            <span style={{ display: "inline-block", transform: isRefreshingWellness ? "rotate(180deg)" : "none", transition: "transform 0.5s ease" }}>
              🔄
            </span>
            <span>{isRefreshingWellness ? "Actualizando..." : "Actualizar Wellness"}</span>
          </button>

          {/* BÚSQUEDA RÁPIDA DE JUGADOR */}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: "8px", color: "#64748b", fontSize: "11px" }}>🔍</span>
            <input
              type="text"
              placeholder="Filtrar por nombre..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "6px 24px 6px 26px",
                fontSize: "11.5px",
                fontWeight: 700,
                outline: "none",
                width: "170px",
                color: "#0f172a",
                background: "#f8fafc",
              }}
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda("")}
                style={{
                  position: "absolute",
                  right: "6px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "#64748b",
                  fontSize: "11px",
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* MENÚ DESPLEGABLE DE JUGADORES (SELECCIONAR / DESELECCIONAR) */}
          <div ref={dropdownRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowVisibilityMenu((prev) => !prev)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "6px",
                border: hiddenCount > 0 ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                background: hiddenCount > 0 ? "#f0f9ff" : "#ffffff",
                color: hiddenCount > 0 ? "#0284c7" : "#334155",
                fontSize: "11.5px",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
              }}
            >
              <span>Jugadores {hiddenCount > 0 ? `(${players.length - hiddenCount}/${players.length})` : `(${players.length})`}</span>
              <span style={{ fontSize: "9px", opacity: 0.7 }}>{showVisibilityMenu ? "▲" : "▼"}</span>
            </button>

            {showVisibilityMenu && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "calc(100% + 6px)",
                  zIndex: 100,
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  boxShadow: "0 10px 25px -5px rgba(0,0,0,0.12)",
                  padding: "14px",
                  width: "270px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                  <strong style={{ fontSize: "11.5px", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Jugadores a mostrar
                  </strong>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>
                    {players.length - hiddenCount} / {players.length} seleccionados
                  </span>
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    type="button"
                    onClick={showAllJugadores}
                    style={{ flex: 1, padding: "5px 8px", fontSize: "10.5px", fontWeight: 700, borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#1e3a8a", cursor: "pointer" }}
                  >
                    Seleccionar todos
                  </button>
                  <button
                    type="button"
                    onClick={hideAllJugadores}
                    style={{ flex: 1, padding: "5px 8px", fontSize: "10.5px", fontWeight: 700, borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#dc2626", cursor: "pointer" }}
                  >
                    Deseleccionar todos
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Buscar en la lista..."
                  value={filterMenuText}
                  onChange={(e) => setFilterMenuText(e.target.value)}
                  style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: "5px", padding: "6px 8px", fontSize: "11px", outline: "none", boxSizing: "border-box" }}
                />

                <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {playersMenuFiltered.map((p) => {
                    const isVisible = !hiddenIds.has(p.id);
                    return (
                      <label
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "5px 8px",
                          borderRadius: "5px",
                          background: isVisible ? "#f8fafc" : "#fff1f2",
                          cursor: "pointer",
                          fontSize: "11.5px",
                          fontWeight: isVisible ? 700 : 500,
                          color: isVisible ? "#0f172a" : "#94a3b8",
                          textDecoration: isVisible ? "none" : "line-through",
                          userSelect: "none",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={() => toggleHideJugador(p.id)}
                          style={{ accentColor: "#0284c7", cursor: "pointer" }}
                        />
                        {(p.apodo || p.nombre || "").toUpperCase()}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#64748b" }}>
          {visiblePlayers.length} de {players.length} jugadores en rejilla
        </div>
      </div>

      {/* TABLA PRINCIPAL DE PLANIFICACIÓN */}
      <table className="planning-grid" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th className="planning-grid-corner" style={{ position: "sticky", left: 0, zIndex: 10, background: "#f1f5f9", padding: "8px 12px", textAlign: "left", fontWeight: 800 }}>
              Jugador
            </th>
            {days.map((d) => (
              <th key={d.id} className="planning-grid-day-header" style={{ padding: "6px 10px", textAlign: "center", borderRight: "1px solid #cbd5e1", minWidth: "100px" }}>
                <div className="day-fecha" style={{ fontWeight: 800, fontSize: "12px" }}>{fechaCorta(d.fecha)}</div>
                <div className="day-contexto" style={{ fontSize: "11px", color: "#64748b" }}>
                  {[d.periodo, d.subperiodo].filter(Boolean).join(" · ")}
                </div>
                {(d.md || d.rival) && (
                  <div className="day-md" style={{ fontSize: "11px", fontWeight: 800, color: "#0284c7" }}>
                    {[d.md, d.rival].filter(Boolean).join(" · ")}
                  </div>
                )}
                {(d.carga || d.volumen || d.intensidad) && (
                  <div className="day-metrics" style={{ display: "flex", justifyContent: "center", gap: "4px", marginTop: "4px", flexWrap: "wrap" }}>
                    {d.carga && (
                      <span style={{ fontSize: "9.5px", fontWeight: 800, background: "#eff6ff", color: "#1d4ed8", padding: "1px 4px", borderRadius: "3px", border: "1px solid #bfdbfe" }} title="Carga">
                        ⚡ {d.carga}
                      </span>
                    )}
                    {d.volumen && (
                      <span style={{ fontSize: "9.5px", fontWeight: 800, background: "#f0fdf4", color: "#15803d", padding: "1px 4px", borderRadius: "3px", border: "1px solid #bbf7d0" }} title="Volumen">
                        📊 {d.volumen}
                      </span>
                    )}
                    {d.intensidad && (
                      <span style={{ fontSize: "9.5px", fontWeight: 800, background: "#fff7ed", color: "#c2410c", padding: "1px 4px", borderRadius: "3px", border: "1px solid #fed7aa" }} title="Intensidad">
                        🔥 {d.intensidad}
                      </span>
                    )}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visiblePlayers.length === 0 ? (
            <tr>
              <td colSpan={days.length + 1} style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                No hay jugadores visibles según el filtro seleccionado.
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={showAllJugadores}
                    style={{ marginLeft: "8px", background: "none", border: "none", color: "#0284c7", fontWeight: 800, cursor: "pointer", textDecoration: "underline" }}
                  >
                    Mostrar todos los jugadores
                  </button>
                )}
              </td>
            </tr>
          ) : (
            visiblePlayers.map((p) => (
              <tr key={p.id}>
                <th className="planning-grid-player-name" style={{ position: "sticky", left: 0, zIndex: 5, background: "#ffffff", padding: "8px 12px", textAlign: "left", fontWeight: 800, borderRight: "2px solid #cbd5e1" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                    <span>{(p.apodo || p.nombre || "").toUpperCase()}</span>
                    <button
                      type="button"
                      onClick={() => toggleHideJugador(p.id)}
                      title="Ocultar esta fila"
                      style={{ border: "none", background: "transparent", color: "#cbd5e1", cursor: "pointer", fontSize: "10px" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#dc2626")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}
                    >
                      ✕
                    </button>
                  </div>
                </th>
                {days.map((d) => {
                  const key = `${p.id}_${d.id}`;
                  const code = localMap[key] || null;
                  const estilos = getSemaforoEstilos(code);
                  const welComment = wellnessMap[`${p.id}_${d.fecha}`];

                  const pNameUpper = (p.apodo || p.nombre || "").toUpperCase().trim();
                  const pNameShort = pNameUpper.split(" ")[0];
                  const bbddEvents = playerBBDDEventsMap.current[`${pNameUpper}_${d.fecha}`] || playerBBDDEventsMap.current[`${pNameShort}_${d.fecha}`] || [];

                  return (
                    <td
                      key={d.id}
                      onClick={() => {
                        setActiveCell({ jugadorId: p.id, sesionDiaId: d.id, playerName: p.apodo || p.nombre, dateStr: fechaCorta(d.fecha), fechaISO: d.fecha });
                        setActiveTab("principal");
                      }}
                      style={{
                        padding: "6px 8px",
                        textAlign: "center",
                        borderRight: "1px solid #e2e8f0",
                        borderBottom: "1px solid #e2e8f0",
                        background: estilos.bg,
                        color: estilos.color,
                        fontWeight: 800,
                        cursor: "pointer",
                        transition: "transform 0.1s ease",
                      }}
                      title={welComment ? `💬 Wellness: "${welComment}" | Clic para editar (${estilos.label})` : `Clic para editar (${estilos.label})`}
                    >
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 900 }}>
                            {code ? code : "—"}
                          </span>
                          {welComment && (
                            <span
                              style={{
                                fontSize: "9px",
                                lineHeight: 1,
                                background: "#059669",
                                color: "#ffffff",
                                borderRadius: "3px",
                                padding: "1px 3px",
                                fontWeight: 800,
                                boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                              }}
                              title={`💬 Wellness: "${welComment}"`}
                            >
                              💬
                            </span>
                          )}
                        </div>

                        {bbddEvents.length > 0 && (
                          <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", justifyContent: "center", marginTop: "2px" }}>
                            {bbddEvents.map((ev, evIdx) => (
                              <span
                                key={evIdx}
                                style={{
                                  fontSize: "9px",
                                  fontWeight: 800,
                                  padding: "1px 4px",
                                  borderRadius: "3px",
                                  background: ev.tipo === "Op" || ev.tipo === "OP" ? "#0284c7" : ev.tipo === "Co" || ev.tipo === "CO" ? "#4f46e5" : ev.tipo === "Red" || ev.tipo === "RED" ? "#dc2626" : ev.tipo === "Vd" || ev.tipo === "VD" ? "#7c3aed" : ev.tipo === "PaAm" || ev.tipo === "PAAM" ? "#d97706" : "#475569",
                                  color: "#ffffff",
                                  boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                                }}
                                title={`Evento #${ev.num_evento}: ${ev.tipo}${ev.hora ? ` (${ev.hora})` : ""}${ev.duracion ? ` · ${ev.duracion} min` : ""}${ev.lugar ? ` · ${ev.lugar}` : ""}`}
                              >
                                {ev.tipo}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* MINI-SELECTOR EN DIÁLOGOS POPUP */}
      {activeCell && (() => {
        const activeWelComment = wellnessMap[`${activeCell.jugadorId}_${activeCell.fechaISO}`];

        return (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15, 23, 42, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
            }}
            onClick={() => setActiveCell(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#ffffff",
                padding: "20px",
                borderRadius: "14px",
                width: "360px",
                boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
                border: "1px solid #cbd5e1",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 900, color: "#0f172a" }}>
                    Asignar Disponibilidad
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                    {activeCell.playerName} · {activeCell.dateStr}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCell(null)}
                  style={{ background: "none", border: "none", fontSize: "16px", cursor: "pointer", color: "#64748b" }}
                >
                  ✕
                </button>
              </div>

              {activeWelComment && (
                <div style={{ background: "#ecfdf5", border: "1px solid #6ee7b7", color: "#065f46", padding: "10px 12px", borderRadius: "8px", fontSize: "12px", marginBottom: "12px" }}>
                  <div style={{ fontWeight: 800, fontSize: "11px", textTransform: "uppercase", marginBottom: "3px", display: "flex", alignItems: "center", gap: "4px" }}>
                    <span>💬</span> Comentario Wellness
                  </div>
                  <div style={{ fontStyle: "italic", fontSize: "12px", lineHeight: "1.3" }}>
                    "{activeWelComment}"
                  </div>
                </div>
              )}

            {activeTab === "principal" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => handleSelectCode(activeCell.jugadorId, activeCell.sesionDiaId, "D")}
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    border: "2px solid #22c55e",
                    background: "#dcfce7",
                    color: "#15803d",
                    fontWeight: 800,
                    fontSize: "13px",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>🟢 VERDE — Disponible (D)</span>
                  <span style={{ fontSize: "11px", background: "#22c55e", color: "#ffffff", padding: "2px 6px", borderRadius: "4px" }}>Guardar D</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("amarillo")}
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    border: "2px solid #f59e0b",
                    background: "#fef3c7",
                    color: "#b45309",
                    fontWeight: 800,
                    fontSize: "13px",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>🟡 AMARILLO — Parcial / Readaptación</span>
                  <span>▶</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("rojo")}
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    border: "2px solid #ef4444",
                    background: "#fee2e2",
                    color: "#b91c1c",
                    fontWeight: 800,
                    fontSize: "13px",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>🔴 ROJO — No Disponible / Otras</span>
                  <span>▶</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectCode(activeCell.jugadorId, activeCell.sesionDiaId, null)}
                  style={{
                    marginTop: "4px",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px dashed #cbd5e1",
                    background: "#f8fafc",
                    color: "#64748b",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Limpiar / Celda vacía
                </button>
              </div>
            )}

            {activeTab === "amarillo" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setActiveTab("principal")}
                  style={{ background: "none", border: "none", color: "#0284c7", fontSize: "12px", fontWeight: 800, cursor: "pointer", textAlign: "left", marginBottom: "4px" }}
                >
                  ← Volver a semáforo general
                </button>

                {OPCIONES_AMARILLO.map((code) => {
                  const info = DISPONIBILIDADES[code];
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleSelectCode(activeCell.jugadorId, activeCell.sesionDiaId, code)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        background: info.color,
                        color: info.textColor,
                        fontWeight: 900,
                        fontSize: "12.5px",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      {code} — {info.nombre}
                    </button>
                  );
                })}
              </div>
            )}

            {activeTab === "rojo" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setActiveTab("principal")}
                  style={{ background: "none", border: "none", color: "#0284c7", fontSize: "12px", fontWeight: 800, cursor: "pointer", textAlign: "left", marginBottom: "4px" }}
                >
                  ← Volver a semáforo general
                </button>

                {OPCIONES_ROJO.map((code) => {
                  const info = DISPONIBILIDADES[code];
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleSelectCode(activeCell.jugadorId, activeCell.sesionDiaId, code)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        background: info.color,
                        color: info.textColor,
                        fontWeight: 900,
                        fontSize: "12.5px",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      {code} — {info.nombre}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        );
      })()}
    </div>
  );
}
