"use client";

import React, { useState, useMemo } from "react";
import {
  computeCompetitiveProfiles,
  getAllTeamMatches,
  formatProfileMatchDate,
  AnalyzedMatch,
  CompetitiveProfilePlayer,
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
  currentCustomDates?: string[];
  onSave: (selectedDates: string[]) => void;
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

  // Fechas seleccionadas inicialmente
  const initialDates = useMemo(() => {
    if (Array.isArray(currentCustomDates)) {
      return [...currentCustomDates];
    }
    // Si no tiene selección manual, partir de los partidos que actualmente están en usedMatchesList
    if (currentProfile?.usedMatchesList && currentProfile.usedMatchesList.length > 0) {
      return currentProfile.usedMatchesList.map((m) => m.fecha).filter(Boolean);
    }
    // Si no, tomar los partidos completos automáticos
    return availableMatches.filter((m) => m.minutos >= 70).map((m) => m.fecha);
  }, [currentCustomDates, currentProfile, availableMatches]);

  const [selectedDates, setSelectedDates] = useState<string[]>(initialDates);
  const [extraMatchDate, setExtraMatchDate] = useState<string>("");

  const isCustomMode = Array.isArray(currentCustomDates);

  // Toggle de un partido (añadir o quitar)
  const handleToggleDate = (dateStr: string) => {
    setSelectedDates((prev) => {
      if (prev.includes(dateStr)) {
        return prev.filter((d) => d !== dateStr);
      } else {
        return [...prev, dateStr];
      }
    });
  };

  // Añadir una fecha de partido de la lista general del equipo
  const handleAddExtraDate = () => {
    if (!extraMatchDate) return;
    if (!selectedDates.includes(extraMatchDate)) {
      setSelectedDates((prev) => [...prev, extraMatchDate]);
    }
    setExtraMatchDate("");
  };

  // Recálculo en tiempo real de la vista previa con las fechas seleccionadas
  const previewProfile = useMemo(() => {
    const previewProfilesMap = computeCompetitiveProfiles({
      gpsRecords,
      jugadores: allJugadores && allJugadores.length > 0 ? allJugadores : [jugador],
      derivedVariables,
      customPlayerMatches: {
        [jugador.id]: selectedDates,
      },
    });
    return previewProfilesMap.get(jugador.id);
  }, [gpsRecords, allJugadores, jugador, derivedVariables, selectedDates]);

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

  // Fechas del equipo disponibles que no están todavía en availableMatches
  const remainingTeamDates = allTeamMatches.filter(
    (tm) => !availableMatches.some((am) => am.fecha === tm.fecha) && !selectedDates.includes(tm.fecha)
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
        zIndex: 9999,
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
              lineHeight: 1.45,
            }}
          >
            <strong>Fórmula oficial del club:</strong> Con <strong>2 o más partidos</strong> seleccionados, se aplica la fórmula <code>(Máxima + Promedio de los restantes) / 2</code>. Con <strong>1 partido</strong>, se toma el valor directo 100% real. Marca las casillas de los partidos que quieres computar.
          </div>

          {/* Lista de partidos del jugador */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Partidos disputados por el jugador ({availableMatches.length})
              </span>
              <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                {selectedDates.length} seleccionados
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
                  const isChecked = selectedDates.includes(m.fecha);
                  const isFull = m.minutos >= 70;
                  const metrics = getMatchMetricsSummary(m);

                  return (
                    <div
                      key={m.fecha}
                      onClick={() => handleToggleDate(m.fecha)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: isChecked ? "1.5px solid #0284c7" : "1px solid #e2e8f0",
                        background: isChecked ? "#f0f9ff" : "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {/* Izquierda: Checkbox + Fecha + Tareas */}
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleDate(m.fecha)}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: "16px",
                            height: "16px",
                            cursor: "pointer",
                            accentColor: "#0284c7",
                          }}
                        />
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <strong style={{ fontSize: "13px", color: "#0f172a" }}>
                              {formatProfileMatchDate(m.fecha)}
                            </strong>
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: 800,
                                padding: "1px 6px",
                                borderRadius: "4px",
                                background: isFull ? "#dcfce7" : m.minutos >= 40 ? "#fef3c7" : "#f1f5f9",
                                color: isFull ? "#15803d" : m.minutos >= 40 ? "#b45309" : "#475569",
                              }}
                            >
                              {m.minutos} min {isFull ? "(Completo)" : "(Parte)"}
                            </span>
                          </div>
                          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                            {m.parts && m.parts.length > 0
                              ? m.parts.map((p) => `${p.nombre} (${p.minutos}')`).join(" • ")
                              : "Partido completo"}
                          </div>
                        </div>
                      </div>

                      {/* Derecha: Métricas clave en chips */}
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11px", color: "#334155" }}>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ color: "#64748b", fontSize: "9.5px", display: "block" }}>Distancia</span>
                          <strong>{metrics.dt.toLocaleString()} m</strong>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ color: "#64748b", fontSize: "9.5px", display: "block" }}>HSR</span>
                          <strong>{metrics.hsr} m</strong>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ color: "#64748b", fontSize: "9.5px", display: "block" }}>Vmax</span>
                          <strong>{metrics.vmax} km/h</strong>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ color: "#64748b", fontSize: "9.5px", display: "block" }}>Acc-Dec</span>
                          <strong>{metrics.accDec}</strong>
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
                📊 Vista previa del Perfil Competitivo resultante ({selectedDates.length} partidos):
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
                onSave(selectedDates);
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

