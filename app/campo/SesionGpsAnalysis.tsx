"use client";

import React, { useState, useMemo } from "react";
import { CampoSesionFicha } from "./campo-types";

interface SesionGpsAnalysisProps {
  sesion?: CampoSesionFicha | null;
  fecha: string;
  allGpsRows: any[];
  allJugadores: any[];
}

export default function SesionGpsAnalysis({
  sesion,
  fecha,
  allGpsRows,
  allJugadores,
}: SesionGpsAnalysisProps) {
  const [selectedMetric, setSelectedMetric] = useState<"distancia" | "hsr" | "sprint" | "player_load">("distancia");

  // Filtrar registros GPS para la fecha seleccionada
  const dayGpsRows = useMemo(() => {
    return allGpsRows.filter((r) => {
      const f = r.fecha || r.date;
      return f === fecha;
    });
  }, [allGpsRows, fecha]);

  // Cruzar datos de jugadores con sus métricas GPS de este día
  const playersData = useMemo(() => {
    return dayGpsRows.map((row) => {
      const jId = String(row.jugador_id || row.player_id || "");
      const jObj = allJugadores.find((j) => String(j.id) === jId || j.cor_id === jId);

      const dist = Number(row.distancia_total || row.distancia || row.total_distance || 0);
      const mins = Number(row.tiempo_total_min || row.minutos || row.duration || 60);
      const mMin = mins > 0 ? Math.round(dist / mins) : 0;
      const hsr = Number(row.distancia_alta_velocidad || row.hsr || row.distancia_21 || 0);
      const sprint = Number(row.distancia_sprint || row.sprint || row.distancia_24 || 0);
      const acc = Number(row.aceleraciones || row.acc_altas || 0);
      const dec = Number(row.desaceleraciones || row.dec_altas || 0);
      const pl = Number(row.player_load || row.carga_total || row.pl || 0);
      const rpe = Number(row.rpe || 0);

      return {
        id: jId,
        nombre: jObj?.nombre || jObj?.apodo || row.nombre_jugador || `Jugador #${jId}`,
        apodo: jObj?.apodo,
        dorsal: jObj?.dorsal ?? jObj?.cor_id ?? "-",
        posicion: jObj?.posicion || "Jugador",
        foto: jObj?.foto_url || jObj?.foto || "",
        minutos: mins,
        distancia: Math.round(dist),
        mMin,
        hsr: Math.round(hsr),
        sprint: Math.round(sprint),
        acc,
        dec,
        playerLoad: Math.round(pl * 10) / 10,
        rpe,
      };
    }).sort((a, b) => b.distancia - a.distancia);
  }, [dayGpsRows, allJugadores]);

  // Medias del equipo para esta sesión
  const squadAverages = useMemo(() => {
    if (playersData.length === 0) {
      return { dist: 0, mMin: 0, hsr: 0, sprint: 0, acc: 0, pl: 0, count: 0 };
    }
    const count = playersData.length;
    const sumDist = playersData.reduce((acc, p) => acc + p.distancia, 0);
    const sumHsr = playersData.reduce((acc, p) => acc + p.hsr, 0);
    const sumSprint = playersData.reduce((acc, p) => acc + p.sprint, 0);
    const sumAcc = playersData.reduce((acc, p) => acc + p.acc, 0);
    const sumPl = playersData.reduce((acc, p) => acc + p.playerLoad, 0);

    return {
      dist: Math.round(sumDist / count),
      mMin: Math.round(playersData.reduce((acc, p) => acc + p.mMin, 0) / count),
      hsr: Math.round(sumHsr / count),
      sprint: Math.round(sumSprint / count),
      acc: Math.round(sumAcc / count),
      pl: Math.round((sumPl / count) * 10) / 10,
      count,
    };
  }, [playersData]);

  // Comparativa Planificado (Ficha de Sesión) vs Real (Datos GPS)
  const plannedDist = sesion?.metricasEstimadas.distanciaTotalM || 0;
  const plannedHsr = sesion?.metricasEstimadas.hsrTotalM || 0;
  const plannedSprint = sesion?.metricasEstimadas.sprintTotalM || 0;
  const plannedPl = sesion?.metricasEstimadas.playerLoadTotal || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* SECCIÓN 1: COMPARATIVA PLANIFICADO VS REAL DE LA SESIÓN */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          padding: "18px 20px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h3 style={{ fontSize: "15px", fontWeight: 900, color: "#0f172a", margin: 0 }}>
              📊 Comparativa Planificado vs GPS Real ({fecha})
            </h3>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
              {squadAverages.count > 0
                ? `${squadAverages.count} jugadores monitorizados con GPS en esta sesión.`
                : "No se han detectado registros GPS subidos para esta fecha."}
            </p>
          </div>

          {sesion && (
            <div style={{ background: "#e0f2fe", color: "#0369a1", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 800 }}>
              Ficha Vinculada: {sesion.microcicloMd} ({sesion.objetivoPrincipal})
            </div>
          )}
        </div>

        {/* TARJETAS COMPARATIVAS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "12px" }}>
          {/* DISTANCIA */}
          <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
              Distancia Media
            </div>
            <div style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a", marginTop: "2px" }}>
              {squadAverages.dist.toLocaleString()} <span style={{ fontSize: "12px", color: "#64748b" }}>m</span>
            </div>
            {plannedDist > 0 && (
              <div style={{ fontSize: "11px", color: squadAverages.dist >= plannedDist ? "#16a34a" : "#d97706", fontWeight: 700, marginTop: "4px" }}>
                Planificado: {plannedDist.toLocaleString()}m ({Math.round((squadAverages.dist / plannedDist) * 100)}%)
              </div>
            )}
          </div>

          {/* HSR */}
          <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
              HSR Medio (&gt;21 km/h)
            </div>
            <div style={{ fontSize: "22px", fontWeight: 900, color: "#d97706", marginTop: "2px" }}>
              {squadAverages.hsr.toLocaleString()} <span style={{ fontSize: "12px", color: "#64748b" }}>m</span>
            </div>
            {plannedHsr > 0 && (
              <div style={{ fontSize: "11px", color: squadAverages.hsr >= plannedHsr ? "#16a34a" : "#d97706", fontWeight: 700, marginTop: "4px" }}>
                Planificado: {plannedHsr}m ({Math.round((squadAverages.hsr / plannedHsr) * 100)}%)
              </div>
            )}
          </div>

          {/* SPRINT */}
          <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
              Sprint Medio (&gt;24 km/h)
            </div>
            <div style={{ fontSize: "22px", fontWeight: 900, color: "#dc2626", marginTop: "2px" }}>
              {squadAverages.sprint.toLocaleString()} <span style={{ fontSize: "12px", color: "#64748b" }}>m</span>
            </div>
            {plannedSprint > 0 && (
              <div style={{ fontSize: "11px", color: squadAverages.sprint >= plannedSprint ? "#16a34a" : "#d97706", fontWeight: 700, marginTop: "4px" }}>
                Planificado: {plannedSprint}m ({Math.round((squadAverages.sprint / plannedSprint) * 100)}%)
              </div>
            )}
          </div>

          {/* PLAYER LOAD */}
          <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
              Player Load Medio
            </div>
            <div style={{ fontSize: "22px", fontWeight: 900, color: "#9333ea", marginTop: "2px" }}>
              {squadAverages.pl} <span style={{ fontSize: "12px", color: "#64748b" }}>PL</span>
            </div>
            {plannedPl > 0 && (
              <div style={{ fontSize: "11px", color: squadAverages.pl >= plannedPl ? "#16a34a" : "#d97706", fontWeight: 700, marginTop: "4px" }}>
                Planificado: {plannedPl} PL ({Math.round((squadAverages.pl / plannedPl) * 100)}%)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECCIÓN 2: TABLA DE RENDIMIENTO INDIVIDUAL DE JUGADORES */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4 style={{ fontSize: "13.5px", fontWeight: 900, color: "#0f172a", margin: 0, textTransform: "uppercase" }}>
            👥 Rendimiento Individual de Jugadores en Campo ({playersData.length})
          </h4>
          <div style={{ fontSize: "11px", color: "#64748b" }}>
            Ordenado por Distancia Total
          </div>
        </div>

        {playersData.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            <span style={{ fontSize: "28px" }}>📡</span>
            <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "6px" }}>Sin datos GPS en esta fecha</div>
            <div style={{ fontSize: "11.5px", marginTop: "2px" }}>
              Sube el archivo de GPS de esta sesión en la sección de Informes o Base de Datos.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1.5px solid #e2e8f0", color: "#475569", fontWeight: 800, fontSize: "11px", textTransform: "uppercase" }}>
                  <th style={{ padding: "10px 14px" }}>Dorsal & Jugador</th>
                  <th style={{ padding: "10px 10px", textAlign: "center" }}>Min</th>
                  <th style={{ padding: "10px 10px", textAlign: "right" }}>Dist Total</th>
                  <th style={{ padding: "10px 10px", textAlign: "right" }}>m/min</th>
                  <th style={{ padding: "10px 10px", textAlign: "right", color: "#d97706" }}>HSR (&gt;21)</th>
                  <th style={{ padding: "10px 10px", textAlign: "right", color: "#dc2626" }}>Sprint (&gt;24)</th>
                  <th style={{ padding: "10px 10px", textAlign: "right", color: "#16a34a" }}>Acc (&gt;3)</th>
                  <th style={{ padding: "10px 10px", textAlign: "right" }}>Dec</th>
                  <th style={{ padding: "10px 10px", textAlign: "right", color: "#9333ea" }}>PL</th>
                  <th style={{ padding: "10px 14px", textAlign: "center" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {playersData.map((p, idx) => {
                  const isDificit = plannedDist > 0 && p.distancia < plannedDist * 0.75;
                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        background: idx % 2 === 0 ? "#ffffff" : "#fbfcfe",
                      }}
                    >
                      <td style={{ padding: "8px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 900, color: "#64748b", width: "18px" }}>
                            {p.dorsal}
                          </span>
                          <span style={{ fontWeight: 800, color: "#0f172a" }}>
                            {p.nombre}
                          </span>
                          <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                            ({p.posicion})
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700 }}>
                        {p.minutos}&apos;
                      </td>

                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 900, color: "#0284c7" }}>
                        {p.distancia.toLocaleString()} m
                      </td>

                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>
                        {p.mMin}
                      </td>

                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 800, color: "#d97706" }}>
                        {p.hsr} m
                      </td>

                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 800, color: "#dc2626" }}>
                        {p.sprint} m
                      </td>

                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "#16a34a" }}>
                        {p.acc}
                      </td>

                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "#64748b" }}>
                        {p.dec}
                      </td>

                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 800, color: "#9333ea" }}>
                        {p.playerLoad}
                      </td>

                      <td style={{ padding: "8px 14px", textAlign: "center" }}>
                        {isDificit ? (
                          <span style={{ fontSize: "10px", fontWeight: 800, background: "#fef3c7", color: "#b45309", padding: "2px 6px", borderRadius: "4px" }}>
                            Déficit Carga
                          </span>
                        ) : (
                          <span style={{ fontSize: "10px", fontWeight: 800, background: "#dcfce7", color: "#15803d", padding: "2px 6px", borderRadius: "4px" }}>
                            Completada
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
