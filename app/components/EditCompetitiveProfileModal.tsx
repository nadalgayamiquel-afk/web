"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  computeCompetitiveProfiles,
  getAllTeamMatches,
  formatProfileMatchDate,
  AnalyzedMatch,
  CompetitiveProfilePlayer,
  CustomMatchConfig,
} from "@/app/lib/competitiveProfile";
import { calculateGpsMetricValue } from "@/app/lib/gpsVariables";

interface EditCompetitiveProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  jugador: any;
  currentProfile?: CompetitiveProfilePlayer | null;
  gpsRecords: any[];
  allJugadores: any[];
  derivedVariables?: any[];
  currentCustomDates?: Array<string | CustomMatchConfig>;
  planificacionDays?: any[];
  onSave: (selectedMatches: CustomMatchConfig[]) => void;
  onResetAuto: () => void;
}

export default function EditCompetitiveProfileModal({
  isOpen,
  onClose,
  jugador,
  currentProfile,
  gpsRecords,
  allJugadores,
  derivedVariables = [],
  currentCustomDates,
  planificacionDays = [],
  onSave,
  onResetAuto,
}: EditCompetitiveProfileModalProps) {
  if (!isOpen || !jugador) return null;

  // Descubrir todos los partidos del equipo
  const allTeamMatches = useMemo(() => {
    return getAllTeamMatches(gpsRecords);
  }, [gpsRecords]);

  // Lista de partidos disponibles para este jugador
  const availableMatches: AnalyzedMatch[] = useMemo(() => {
    return currentProfile?.allAvailableMatches || [];
  }, [currentProfile]);

  // Configuración inicial de partidos seleccionados (fecha -> "entero" | "parte")
  const initialMatchesMap = useMemo(() => {
    const map: Record<string, "entero" | "parte"> = {};
    if (Array.isArray(currentCustomDates)) {
      currentCustomDates.forEach((item: any) => {
        if (typeof item === "string") {
          const match = availableMatches.find((m) => m.fecha === item);
          map[item] = match && match.minutos < 75 ? "parte" : "entero";
        } else if (item && item.fecha) {
          map[item.fecha] = item.modo || "entero";
        }
      });
      return map;
    }
    // Si no tiene selección manual previa, inicializar con los que actualmente usa
    if (currentProfile?.usedMatchesList && currentProfile.usedMatchesList.length > 0) {
      currentProfile.usedMatchesList.forEach((m: any) => {
        if (m.fecha) {
          map[m.fecha] = m.modo || (m.isFull ? "entero" : "parte");
        }
      });
      return map;
    }
    // Si no, sugerir los partidos >= 75 min como entero
    availableMatches.forEach((m) => {
      if (m.minutos >= 75) {
        map[m.fecha] = "entero";
      }
    });
    return map;
  }, [currentCustomDates, currentProfile, availableMatches]);

  const [selectedMatches, setSelectedMatches] = useState<Record<string, "entero" | "parte">>(initialMatchesMap);
  const [extraMatchDate, setExtraMatchDate] = useState<string>("");

  useEffect(() => {
    setSelectedMatches(initialMatchesMap);
  }, [jugador?.id, initialMatchesMap]);

  const isCustomMode = Array.isArray(currentCustomDates);

  // Toggle de un partido (añadir o quitar)
  const handleToggleMatch = (dateStr: string) => {
    setSelectedMatches((prev) => {
      const next = { ...prev };
      if (dateStr in next) {
        delete next[dateStr];
      } else {
        const match = availableMatches.find((m) => m.fecha === dateStr);
        next[dateStr] = match && match.minutos < 75 ? "parte" : "entero";
      }
      return next;
    });
  };

  // Cambiar el modo de cálculo de un partido (Entero 90' vs Parte 45' x2)
  const handleSetMatchMode = (dateStr: string, mode: "entero" | "parte") => {
    setSelectedMatches((prev) => ({
      ...prev,
      [dateStr]: mode,
    }));
  };

  // Añadir una fecha de partido de la lista general del equipo
  const handleAddExtraDate = () => {
    if (!extraMatchDate) return;
    if (!(extraMatchDate in selectedMatches)) {
      setSelectedMatches((prev) => ({ ...prev, [extraMatchDate]: "entero" }));
    }
    setExtraMatchDate("");
  };

  const selectedMatchesArray: CustomMatchConfig[] = useMemo(() => {
    return Object.entries(selectedMatches).map(([fecha, modo]) => ({ fecha, modo }));
  }, [selectedMatches]);

  // Recálculo en tiempo real de la vista previa con las opciones seleccionadas
  const previewProfile = useMemo(() => {
    const previewProfilesMap = computeCompetitiveProfiles({
      gpsRecords,
      jugadores: allJugadores && allJugadores.length > 0 ? allJugadores : [jugador],
      derivedVariables,
      customPlayerMatches: {
        [jugador.id]: selectedMatchesArray,
      },
      planificacionDays,
    });
    return previewProfilesMap.get(jugador.id);
  }, [gpsRecords, allJugadores, jugador, derivedVariables, selectedMatchesArray, planificacionDays]);

  // Extraer métricas clave para un partido específico
  const getMatchMetricsSummary = (m: AnalyzedMatch) => {
    const raw = m.rawRecord?.metricas || m.rawRecord || (m.parts?.[0]?.rawTask) || {};
    const dt = Math.round(m.dist || calculateGpsMetricValue(raw, "Distance(m)", derivedVariables) || 0);
    const hsr = Math.round(
      calculateGpsMetricValue(raw, "Distance +21 (m)", derivedVariables) ||
      calculateGpsMetricValue(raw, "HSR Abs (m)", derivedVariables) ||
      0
    );
    const vmax = calculateGpsMetricValue(raw, "MAX Speed(km/h)", derivedVariables) || 0;
    const accDec = Math.round(calculateGpsMetricValue(raw, "Acc+Dec", derivedVariables) || 0);
    const pl = Math.round(calculateGpsMetricValue(raw, "Player Load", derivedVariables) || 0);

    return { dt, hsr, vmax: vmax > 0 ? vmax.toFixed(1) : "—", accDec, pl };
  };

  // Fechas del equipo disponibles que no están todavía en availableMatches ni seleccionadas
  const remainingTeamDates = allTeamMatches.filter(
    (tm) => !availableMatches.some((am) => am.fecha === tm.fecha) && !(tm.fecha in selectedMatches)
  );

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100000,
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "14px",
          width: "100%",
          maxWidth: "720px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
          overflow: "hidden",
          border: "1px solid #e2e8f0",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#f8fafc",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "#0284c7",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: "14px",
              }}
            >
              #{jugador.dorsal || "—"}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
                  Editar Perfil Competitivo — {jugador.apodo || jugador.nombre}
                </h3>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 800,
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background: isCustomMode ? "#fef3c7" : "#e0f2fe",
                    color: isCustomMode ? "#92400e" : "#0369a1",
                    border: isCustomMode ? "1px solid #fde68a" : "1px solid #bae6fd",
                  }}
                >
                  {isCustomMode ? "Selección Manual Activa" : "Modo Automático"}
                </span>
              </div>
              <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#64748b", fontWeight: 500 }}>
                Posición: <strong>{jugador.posicion || "JUG"}</strong> • Añade o excluye partidos para recalcular los benchmarks oficiales.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "18px",
              cursor: "pointer",
              color: "#94a3b8",
              padding: "4px 8px",
              borderRadius: "6px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Cuerpo del Modal (Scrollable) */}
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Banner explicativo */}
          <div
            style={{
              padding: "10px 12px",
              background: "#f0f9ff",
              borderLeft: "4px solid #0284c7",
              borderRadius: "6px",
              fontSize: "11.5px",
              color: "#0369a1",
              lineHeight: "1.45",
            }}
          >
            <strong>Personalización del cálculo:</strong> Selecciona qué partidos computar y elige para cada uno si cuenta como <strong>Partido Entero (90')</strong> (valor real directo del partido) o como <strong>Parte (~45' x2)</strong> (media parte proyectada a 90' x2). Con 2 o más partidos se aplica la fórmula oficial <code>(Máxima + Promedio de los restantes) / 2</code>.
          </div>

          {/* Lista de partidos del jugador */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Partidos disputados por el jugador ({availableMatches.length})
              </span>
              <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                {selectedMatchesArray.length} seleccionados
              </span>
            </div>

            {availableMatches.length === 0 ? (
              <div
                style={{
                  padding: "24px",
                  textAlign: "center",
                  background: "#f8fafc",
                  borderRadius: "8px",
                  border: "1px dashed #cbd5e1",
                  color: "#64748b",
                  fontSize: "12px",
                }}
              >
                No se han detectado partidos automáticos en los registros GPS de este jugador.
                <br />
                Puedes añadir un partido de la lista general del equipo a continuación.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {availableMatches.map((m) => {
                  const isChecked = m.fecha in selectedMatches;
                  const currentMode = selectedMatches[m.fecha] || (m.minutos >= 75 ? "entero" : "parte");
                  const isFull = currentMode === "entero";
                  const metrics = getMatchMetricsSummary(m);
                  const rival = m.rival || planificacionDays?.find((d: any) => d.fecha === m.fecha)?.rival;

                  return (
                    <div
                      key={m.fecha}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: isChecked
                          ? isFull
                            ? "1.5px solid #0284c7"
                            : "1.5px solid #d97706"
                          : "1px solid #e2e8f0",
                        background: isChecked
                          ? isFull
                            ? "#f0f9ff"
                            : "#fffbeb"
                          : "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {/* Izquierda: Checkbox + Fecha + Rival + Minutos Totales + Desglose */}
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleMatch(m.fecha)}
                          style={{
                            width: "18px",
                            height: "18px",
                            cursor: "pointer",
                            accentColor: isFull ? "#0284c7" : "#d97706",
                          }}
                        />
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            <strong style={{ fontSize: "13px", color: "#0f172a" }}>
                              📅 {formatProfileMatchDate(m.fecha)}
                            </strong>
                            {rival && (
                              <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#0284c7" }}>
                                vs {rival}
                              </span>
                            )}
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 800,
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: isChecked ? (isFull ? "#dbeafe" : "#fef3c7") : "#f1f5f9",
                                color: isChecked ? (isFull ? "#1d4ed8" : "#b45309") : "#64748b",
                              }}
                            >
                              ⏱️ {m.minutos} min totales
                            </span>
                            {isChecked ? (
                              <span
                                style={{
                                  fontSize: "9.5px",
                                  fontWeight: 800,
                                  padding: "1px 6px",
                                  borderRadius: "3px",
                                  background: isFull ? "#dcfce7" : "#fef3c7",
                                  color: isFull ? "#15803d" : "#92400e",
                                  border: isFull ? "1px solid #86efac" : "1px solid #fde68a",
                                }}
                              >
                                ✓ {isFull ? "ENTERO (90')" : "PARTE (~45' x2)"}
                              </span>
                            ) : (
                              <span style={{ fontSize: "10px", fontWeight: 600, color: "#94a3b8" }}>
                                No contando
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "3px" }}>
                            Tareas: {m.parts && m.parts.length > 0
                              ? m.parts.map((p) => `${p.nombre} (${p.minutos}')`).join(" + ")
                              : "Partido completo"}
                          </div>
                        </div>
                      </div>

                      {/* Centro: Selector Elegir si cuenta como Parte o como Partido Entero */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                        <span style={{ fontSize: "8.5px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
                          Contar como:
                        </span>
                        <div style={{ display: "inline-flex", borderRadius: "6px", overflow: "hidden", border: "1px solid #cbd5e1" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetMatchMode(m.fecha, "entero");
                            }}
                            style={{
                              padding: "4px 8px",
                              fontSize: "10px",
                              fontWeight: 700,
                              border: "none",
                              cursor: "pointer",
                              background: isChecked && isFull ? "#0284c7" : "#f8fafc",
                              color: isChecked && isFull ? "#ffffff" : "#475569",
                              transition: "all 0.15s ease",
                            }}
                            title="Contar esta participación como partido entero de 90' directo"
                          >
                            ⚽ Entero (90')
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetMatchMode(m.fecha, "parte");
                            }}
                            style={{
                              padding: "4px 8px",
                              fontSize: "10px",
                              fontWeight: 700,
                              border: "none",
                              borderLeft: "1px solid #cbd5e1",
                              cursor: "pointer",
                              background: isChecked && !isFull ? "#d97706" : "#f8fafc",
                              color: isChecked && !isFull ? "#ffffff" : "#475569",
                              transition: "all 0.15s ease",
                            }}
                            title="Contar esta participación como parte (~45' proyectada a 90' x2)"
                          >
                            ⏱️ Parte (x2)
                          </button>
                        </div>
                      </div>

                      {/* Derecha: Botón Quitar / Añadir + Métricas */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleMatch(m.fecha);
                          }}
                          style={{
                            padding: "3px 8px",
                            borderRadius: "5px",
                            border: isChecked ? "1px solid #f87171" : "1px solid #86efac",
                            background: isChecked ? "#fee2e2" : "#f0fdf4",
                            color: isChecked ? "#dc2626" : "#16a34a",
                            fontSize: "10.5px",
                            fontWeight: 700,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isChecked ? "✕ Quitar" : "+ Añadir"}
                        </button>

                        {/* Derecha: Métricas clave en chips */}
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10.5px", color: "#334155" }}>
                          <div style={{ textAlign: "right" }}>
                            <span style={{ color: "#64748b", fontSize: "8.5px", display: "block" }}>Distancia</span>
                            <strong>{metrics.dt.toLocaleString()} m</strong>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <span style={{ color: "#64748b", fontSize: "8.5px", display: "block" }}>Vmax</span>
                            <strong>{metrics.vmax} k/h</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sección opcional: Añadir otro partido del equipo */}
          {remainingTeamDates.length > 0 && (
            <div style={{ padding: "10px 12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "6px" }}>
                ➕ Añadir otro partido del equipo disputado por el club:
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <select
                  value={extraMatchDate}
                  onChange={(e) => setExtraMatchDate(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "11.5px",
                    background: "#ffffff",
                    color: "#0f172a",
                  }}
                >
                  <option value="">-- Seleccionar partido del equipo --</option>
                  {remainingTeamDates.map((tm) => (
                    <option key={tm.fecha} value={tm.fecha}>
                      {tm.label} ({tm.count} jugadores con GPS)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!extraMatchDate}
                  onClick={handleAddExtraDate}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "none",
                    background: extraMatchDate ? "#0284c7" : "#cbd5e1",
                    color: "#ffffff",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    cursor: extraMatchDate ? "pointer" : "not-allowed",
                  }}
                >
                  Añadir
                </button>
              </div>
            </div>
          )}

          {/* Vista previa en tiempo real del perfil resultante */}
          <div
            style={{
              padding: "12px 14px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <strong style={{ fontSize: "12px", color: "#166534" }}>
                📊 Vista previa del Perfil Competitivo resultante ({selectedMatchesArray.length} partidos):
              </strong>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 800,
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: previewProfile?.isReal ? "#dcfce7" : "#fef3c7",
                  color: previewProfile?.isReal ? "#15803d" : "#b45309",
                }}
              >
                {previewProfile?.badgeText || "Calculando..."}
              </span>
            </div>

            {/* Grid de variables clave resultantes */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px", textAlign: "center" }}>
              <div style={{ background: "#ffffff", padding: "6px", borderRadius: "6px", border: "1px solid #dcfce7" }}>
                <span style={{ fontSize: "9px", color: "#64748b", fontWeight: 700, display: "block" }}>DT (m)</span>
                <strong style={{ fontSize: "12px", color: "#0f172a" }}>
                  {typeof previewProfile?.dist === "number" ? Math.round(previewProfile.dist).toLocaleString() : "—"}
                </strong>
              </div>
              <div style={{ background: "#ffffff", padding: "6px", borderRadius: "6px", border: "1px solid #dcfce7" }}>
                <span style={{ fontSize: "9px", color: "#64748b", fontWeight: 700, display: "block" }}>HSR (+21)</span>
                <strong style={{ fontSize: "12px", color: "#0f172a" }}>
                  {typeof previewProfile?.hsr === "number" ? Math.round(previewProfile.hsr).toLocaleString() : "—"}
                </strong>
              </div>
              <div style={{ background: "#ffffff", padding: "6px", borderRadius: "6px", border: "1px solid #dcfce7" }}>
                <span style={{ fontSize: "9px", color: "#64748b", fontWeight: 700, display: "block" }}>Vmax (km/h)</span>
                <strong style={{ fontSize: "12px", color: "#0f172a" }}>
                  {typeof previewProfile?.maxSpeed === "number" ? previewProfile.maxSpeed.toFixed(1) : "—"}
                </strong>
              </div>
              <div style={{ background: "#ffffff", padding: "6px", borderRadius: "6px", border: "1px solid #dcfce7" }}>
                <span style={{ fontSize: "9px", color: "#64748b", fontWeight: 700, display: "block" }}>Acc-Dec</span>
                <strong style={{ fontSize: "12px", color: "#0f172a" }}>
                  {typeof previewProfile?.accDec === "number" ? Math.round(previewProfile.accDec) : "—"}
                </strong>
              </div>
              <div style={{ background: "#ffffff", padding: "6px", borderRadius: "6px", border: "1px solid #dcfce7" }}>
                <span style={{ fontSize: "9px", color: "#64748b", fontWeight: 700, display: "block" }}>Player Load</span>
                <strong style={{ fontSize: "12px", color: "#0f172a" }}>
                  {typeof previewProfile?.load === "number" ? Math.round(previewProfile.load) : "—"}
                </strong>
              </div>
              <div style={{ background: "#ffffff", padding: "6px", borderRadius: "6px", border: "1px solid #dcfce7" }}>
                <span style={{ fontSize: "9px", color: "#64748b", fontWeight: 700, display: "block" }}>m/min</span>
                <strong style={{ fontSize: "12px", color: "#0f172a" }}>
                  {typeof previewProfile?.mMin === "number" ? previewProfile.mMin.toFixed(1) : "—"}
                </strong>
              </div>
            </div>

            <p style={{ margin: "8px 0 0", fontSize: "10.5px", color: "#166534", lineHeight: 1.35 }}>
              {previewProfile?.detailText ? previewProfile.detailText.split("\n")[0] : ""}
            </p>
          </div>
        </div>

        {/* Pie del Modal con Acciones */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#f8fafc",
          }}
        >
          <button
            type="button"
            onClick={() => {
              onResetAuto();
              onClose();
            }}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#475569",
              fontSize: "11.5px",
              fontWeight: 700,
              cursor: "pointer",
            }}
            title="Borrar selección personalizada y volver a detección automática"
          >
            🔄 Restablecer a automático
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#64748b",
                fontSize: "11.5px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(selectedMatchesArray);
                onClose();
              }}
              style={{
                padding: "6px 16px",
                borderRadius: "6px",
                border: "none",
                background: "#0284c7",
                color: "#ffffff",
                fontSize: "11.5px",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(2, 132, 199, 0.3)",
              }}
            >
              💾 Guardar perfil
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

