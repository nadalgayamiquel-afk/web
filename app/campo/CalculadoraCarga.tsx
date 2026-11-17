"use client";

import React, { useState, useMemo } from "react";
import {
  CampoEjercicio,
  TARGETS_MICROCICLO_MD,
  CampoSesionBloqueItem,
} from "./campo-types";

interface CalculadoraCargaProps {
  ejerciciosDB: CampoEjercicio[];
  onExportToSesion?: (items: CampoSesionBloqueItem[], md: string) => void;
}

export default function CalculadoraCarga({
  ejerciciosDB,
  onExportToSesion,
}: CalculadoraCargaProps) {
  const [selectedMd, setSelectedMd] = useState<string>("MD-4");
  const [filterQuery, setFilterQuery] = useState<string>("");
  const [filterCat, setFilterCat] = useState<string>("todas");

  // Lista de ejercicios seleccionados en la calculadora con sus minutos y series
  const [sessionDrills, setSessionDrills] = useState<
    Array<{
      id: string;
      ejercicioId: string;
      nombre: string;
      categoria: string;
      series: number;
      minutosTrabajo: number;
      pausaMin: number;
      mMin: number;
      hsrMin: number;
      sprintMin: number;
      accMin: number;
      playerLoadMin: number;
    }>
  >([]);

  // Añadir un ejercicio a la calculadora
  const handleAddDrill = (ej: CampoEjercicio) => {
    const trabajoMin = (ej.estructura.series * ej.estructura.tiempoTrabajoSeg) / 60;
    const pausaMin = ((ej.estructura.series - 1) * ej.estructura.tiempoDescansoSeg) / 60;

    const newItem = {
      id: `calc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ejercicioId: ej.id,
      nombre: ej.nombre,
      categoria: ej.categoria,
      series: ej.estructura.series,
      minutosTrabajo: Math.round(trabajoMin * 10) / 10,
      pausaMin: Math.round(pausaMin * 10) / 10,
      mMin: ej.perfilGps.mMin,
      hsrMin: ej.perfilGps.hsrMin,
      sprintMin: ej.perfilGps.sprintMin,
      accMin: ej.perfilGps.accMin,
      playerLoadMin: ej.perfilGps.playerLoadMin,
    };

    setSessionDrills((prev) => [...prev, newItem]);
  };

  // Modificar minutos de trabajo de un ítem
  const handleUpdateItemTime = (id: string, mins: number) => {
    setSessionDrills((prev) =>
      prev.map((item) => (item.id === id ? { ...item, minutosTrabajo: Math.max(1, mins) } : item))
    );
  };

  // Eliminar un ítem
  const handleRemoveItem = (id: string) => {
    setSessionDrills((prev) => prev.filter((item) => item.id !== id));
  };

  // Cálculos totales proyectados
  const totals = useMemo(() => {
    let duracionTrabajo = 0;
    let duracionTotal = 0;
    let distTotal = 0;
    let hsrTotal = 0;
    let sprintTotal = 0;
    let accTotal = 0;
    let plTotal = 0;

    sessionDrills.forEach((d) => {
      const w = d.minutosTrabajo;
      duracionTrabajo += w;
      duracionTotal += w + (d.pausaMin || 0);
      distTotal += d.mMin * w;
      hsrTotal += d.hsrMin * w;
      sprintTotal += d.sprintMin * w;
      accTotal += d.accMin * w;
      plTotal += d.playerLoadMin * w;
    });

    return {
      duracionTrabajo: Math.round(duracionTrabajo),
      duracionTotal: Math.round(duracionTotal),
      distTotal: Math.round(distTotal),
      hsrTotal: Math.round(hsrTotal),
      sprintTotal: Math.round(sprintTotal),
      accTotal: Math.round(accTotal),
      plTotal: Math.round(plTotal),
    };
  }, [sessionDrills]);

  const targetConfig = TARGETS_MICROCICLO_MD[selectedMd] || TARGETS_MICROCICLO_MD["MD-4"];

  // Evaluar estado respecto al target (Óptimo, Por debajo, Por encima)
  const getStatus = (val: number, range: [number, number]) => {
    const [min, max] = range;
    if (val < min) {
      const pct = Math.round((val / min) * 100);
      return { status: "low", label: `Déficit (${pct}%)`, color: "#d97706", bg: "#fef3c7" };
    }
    if (val > max) {
      const excess = Math.round(((val - max) / max) * 100);
      return { status: "high", label: `Exceso (+${excess}%)`, color: "#dc2626", bg: "#fee2e2" };
    }
    return { status: "optimal", label: "Óptimo", color: "#16a34a", bg: "#dcfce7" };
  };

  const distStatus = getStatus(totals.distTotal, targetConfig.distanciaRangoM);
  const hsrStatus = getStatus(totals.hsrTotal, targetConfig.hsrRangoM);
  const sprintStatus = getStatus(totals.sprintTotal, targetConfig.sprintRangoM);
  const plStatus = getStatus(totals.plTotal, targetConfig.playerLoadRango);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* SECCIÓN 1: SELECTOR DE DÍA DE MICROCICLO Y ENFOQUE */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          padding: "16px 20px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div>
            <h3 style={{ fontSize: "15px", fontWeight: 900, color: "#0f172a", margin: 0 }}>
              🧮 Calculadora Predictiva de Carga
            </h3>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
              Proyecta en tiempo real la demanda física acumulada según las tareas y el día de microciclo (MD).
            </p>
          </div>

          <div style={{ display: "flex", gap: "6px" }}>
            {Object.keys(TARGETS_MICROCICLO_MD).map((mdKey) => {
              const conf = TARGETS_MICROCICLO_MD[mdKey];
              const isSelected = selectedMd === mdKey;
              return (
                <button
                  key={mdKey}
                  type="button"
                  onClick={() => setSelectedMd(mdKey)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border: `1.5px solid ${isSelected ? conf.color : "#cbd5e1"}`,
                    background: isSelected ? conf.color : "#ffffff",
                    color: isSelected ? "#ffffff" : "#334155",
                    fontSize: "12px",
                    fontWeight: 900,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {mdKey}
                </button>
              );
            })}
          </div>
        </div>

        {/* TARJETA DEL OBJETIVO FISIOLÓGICO DEL DÍA SELECCIONADO */}
        <div
          style={{
            background: "#f8fafc",
            borderRadius: "8px",
            borderLeft: `4px solid ${targetConfig.color}`,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <span style={{ fontSize: "12px", fontWeight: 900, color: targetConfig.color }}>
              {targetConfig.label}
            </span>
            <div style={{ fontSize: "11.5px", color: "#475569", marginTop: "2px" }}>
              🎯 {targetConfig.enfoque}
            </div>
          </div>
          <div style={{ display: "flex", gap: "16px", fontSize: "11px", fontWeight: 800 }}>
            <span style={{ color: "#0284c7" }}>Dist: {targetConfig.distanciaRangoM[0]} - {targetConfig.distanciaRangoM[1]} m</span>
            <span style={{ color: "#d97706" }}>HSR: {targetConfig.hsrRangoM[0]} - {targetConfig.hsrRangoM[1]} m</span>
            <span style={{ color: "#dc2626" }}>Sprint: {targetConfig.sprintRangoM[0]} - {targetConfig.sprintRangoM[1]} m</span>
            <span style={{ color: "#9333ea" }}>PL: {targetConfig.playerLoadRango[0]} - {targetConfig.playerLoadRango[1]}</span>
          </div>
        </div>
      </div>

      {/* SECCIÓN 2: COMPARADOR VISUAL TARGET VS PROYECCIÓN ACTUAL */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "14px",
        }}
      >
        {/* DISTANCIA TOTAL */}
        <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Distancia Total</span>
            <span style={{ fontSize: "10.5px", fontWeight: 900, color: distStatus.color, background: distStatus.bg, padding: "2px 6px", borderRadius: "4px" }}>
              {distStatus.label}
            </span>
          </div>
          <div style={{ fontSize: "24px", fontWeight: 900, color: "#0f172a" }}>
            {totals.distTotal.toLocaleString()} <span style={{ fontSize: "13px", color: "#64748b" }}>m</span>
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
            Target: {targetConfig.distanciaRangoM[0]} - {targetConfig.distanciaRangoM[1]} m
          </div>
          {/* Barra de progreso */}
          <div style={{ width: "100%", height: "6px", background: "#f1f5f9", borderRadius: "3px", marginTop: "8px", overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.min(100, (totals.distTotal / targetConfig.distanciaRangoM[1]) * 100)}%`,
                height: "100%",
                background: distStatus.color,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* HSR */}
        <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>HSR (&gt;21 km/h)</span>
            <span style={{ fontSize: "10.5px", fontWeight: 900, color: hsrStatus.color, background: hsrStatus.bg, padding: "2px 6px", borderRadius: "4px" }}>
              {hsrStatus.label}
            </span>
          </div>
          <div style={{ fontSize: "24px", fontWeight: 900, color: "#0f172a" }}>
            {totals.hsrTotal.toLocaleString()} <span style={{ fontSize: "13px", color: "#64748b" }}>m</span>
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
            Target: {targetConfig.hsrRangoM[0]} - {targetConfig.hsrRangoM[1]} m
          </div>
          <div style={{ width: "100%", height: "6px", background: "#f1f5f9", borderRadius: "3px", marginTop: "8px", overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.min(100, (totals.hsrTotal / targetConfig.hsrRangoM[1]) * 100)}%`,
                height: "100%",
                background: hsrStatus.color,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* SPRINT */}
        <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Sprint (&gt;24 km/h)</span>
            <span style={{ fontSize: "10.5px", fontWeight: 900, color: sprintStatus.color, background: sprintStatus.bg, padding: "2px 6px", borderRadius: "4px" }}>
              {sprintStatus.label}
            </span>
          </div>
          <div style={{ fontSize: "24px", fontWeight: 900, color: "#0f172a" }}>
            {totals.sprintTotal.toLocaleString()} <span style={{ fontSize: "13px", color: "#64748b" }}>m</span>
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
            Target: {targetConfig.sprintRangoM[0]} - {targetConfig.sprintRangoM[1]} m
          </div>
          <div style={{ width: "100%", height: "6px", background: "#f1f5f9", borderRadius: "3px", marginTop: "8px", overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.min(100, targetConfig.sprintRangoM[1] > 0 ? (totals.sprintTotal / targetConfig.sprintRangoM[1]) * 100 : 0)}%`,
                height: "100%",
                background: sprintStatus.color,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* PLAYER LOAD */}
        <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Player Load</span>
            <span style={{ fontSize: "10.5px", fontWeight: 900, color: plStatus.color, background: plStatus.bg, padding: "2px 6px", borderRadius: "4px" }}>
              {plStatus.label}
            </span>
          </div>
          <div style={{ fontSize: "24px", fontWeight: 900, color: "#0f172a" }}>
            {totals.plTotal.toLocaleString()} <span style={{ fontSize: "13px", color: "#64748b" }}>PL</span>
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
            Target: {targetConfig.playerLoadRango[0]} - {targetConfig.playerLoadRango[1]}
          </div>
          <div style={{ width: "100%", height: "6px", background: "#f1f5f9", borderRadius: "3px", marginTop: "8px", overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.min(100, (totals.plTotal / targetConfig.playerLoadRango[1]) * 100)}%`,
                height: "100%",
                background: plStatus.color,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      </div>

      {/* SECCIÓN 3: COMPOSICIÓN DE LA SESIÓN & SELECTOR DE EJERCICIOS */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "16px" }}>
        {/* LADO IZQUIERDO: TAREAS SELECCIONADAS EN LA SESIÓN */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            padding: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h4 style={{ fontSize: "13px", fontWeight: 900, color: "#0f172a", margin: 0, textTransform: "uppercase" }}>
              📋 Tareas en la Sesión ({sessionDrills.length}) · {totals.duracionTrabajo} min netos
            </h4>
            {sessionDrills.length > 0 && (
              <button
                type="button"
                onClick={() => setSessionDrills([])}
                style={{ background: "none", border: "none", color: "#dc2626", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}
              >
                Limpiar lista
              </button>
            )}
          </div>

          {sessionDrills.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 16px", color: "#94a3b8", border: "2px dashed #e2e8f0", borderRadius: "8px" }}>
              <div style={{ fontSize: "28px", marginBottom: "6px" }}>⚽</div>
              <div style={{ fontSize: "13px", fontWeight: 700 }}>No hay ejercicios añadidos a la sesión</div>
              <div style={{ fontSize: "11.5px", marginTop: "2px" }}>
                Selecciona ejercicios de la biblioteca de la derecha para calcular la carga en vivo.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {sessionDrills.map((drill, idx) => (
                <div
                  key={drill.id}
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 900, color: "#64748b" }}>#{idx + 1}</span>
                      <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {drill.nombre}
                      </span>
                      <span style={{ fontSize: "9.5px", fontWeight: 800, color: "#0284c7", background: "#e0f2fe", padding: "1px 5px", borderRadius: "4px" }}>
                        {drill.categoria}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "10px", fontSize: "10.5px", color: "#64748b", marginTop: "3px" }}>
                      <span>Dist: {Math.round(drill.mMin * drill.minutosTrabajo)}m</span>
                      <span>HSR: {Math.round(drill.hsrMin * drill.minutosTrabajo)}m</span>
                      <span>Sprint: {Math.round(drill.sprintMin * drill.minutosTrabajo)}m</span>
                      <span>Acc: {Math.round(drill.accMin * drill.minutosTrabajo)}</span>
                    </div>
                  </div>

                  {/* AJUSTE DE TIEMPO DIRECTO */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={drill.minutosTrabajo}
                        onChange={(e) => handleUpdateItemTime(drill.id, Number(e.target.value))}
                        style={{ width: "45px", padding: "4px", borderRadius: "5px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 800, textAlign: "center" }}
                      />
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>min</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveItem(drill.id)}
                      style={{ background: "#fee2e2", border: "none", color: "#dc2626", borderRadius: "5px", width: "24px", height: "24px", cursor: "pointer", fontWeight: 900, fontSize: "12px" }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* LADO DERECHO: BIBLIOTECA PARA AÑADIR A LA CALCULADORA */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            padding: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            maxHeight: "600px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h4 style={{ fontSize: "13px", fontWeight: 900, color: "#0f172a", margin: 0, textTransform: "uppercase" }}>
                📚 Ejercicios Disponibles ({ejerciciosDB.length})
              </h4>
              <span style={{ fontSize: "10px", fontWeight: 800, color: "#16a34a", background: "#dcfce7", padding: "2px 6px", borderRadius: "999px" }}>
                📡 BBDD GPS
              </span>
            </div>
            <p style={{ fontSize: "11px", color: "#64748b", margin: "2px 0 8px" }}>
              Haz clic en ➕ para añadir a la sesión calculada.
            </p>

            {/* Input búsqueda */}
            <div style={{ position: "relative", marginBottom: "8px" }}>
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="🔍 Filtrar por nombre (ej. rondo, jdp, oleadas...)"
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "11px",
                  fontWeight: 600,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {filterQuery && (
                <button
                  type="button"
                  onClick={() => setFilterQuery("")}
                  style={{
                    position: "absolute",
                    right: "6px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    fontSize: "11px",
                    cursor: "pointer",
                    color: "#94a3b8",
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filtros rápidos de categoría */}
            <div style={{ display: "flex", gap: "4px", overflowX: "auto", paddingBottom: "4px" }}>
              {[
                { id: "todas", label: "Todas" },
                { id: "bbdd", label: "📡 BBDD Real" },
                { id: "RONDO", label: "Rondos" },
                { id: "POSESION", label: "JDP" },
                { id: "SSG_REDUCIDO", label: "Reducidos" },
                { id: "TRANSICION", label: "Oleadas" },
                { id: "CALENTAMIENTO", label: "Activación" },
                { id: "FINALIZACION", label: "Finalización" },
                { id: "ABP", label: "ABP" },
                { id: "FISICO_TECNICO", label: "Físico" },
              ].map((c) => {
                const isSel = filterCat === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setFilterCat(c.id)}
                    style={{
                      padding: "2px 6px",
                      borderRadius: "4px",
                      border: "none",
                      background: isSel ? "#0284c7" : "#f1f5f9",
                      color: isSel ? "#ffffff" : "#475569",
                      fontSize: "9.5px",
                      fontWeight: 800,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
            {ejerciciosDB
              .filter((ej) => {
                if (filterCat === "bbdd") {
                  if (!ej.id.startsWith("ej-bbdd-")) return false;
                } else if (filterCat !== "todas" && ej.categoria !== filterCat) {
                  return false;
                }
                if (filterQuery.trim()) {
                  const q = filterQuery.toLowerCase();
                  return (
                    ej.nombre.toLowerCase().includes(q) ||
                    (ej.subcategoria || "").toLowerCase().includes(q) ||
                    ej.categoria.toLowerCase().includes(q)
                  );
                }
                return true;
              })
              .map((ej) => {
                const isBbdd = ej.id.startsWith("ej-bbdd-");
                return (
                  <div
                    key={ej.id}
                    style={{
                      background: isBbdd ? "#f0fdf4" : "#f8fafc",
                      border: `1px solid ${isBbdd ? "#bbf7d0" : "#e2e8f0"}`,
                      borderRadius: "6px",
                      padding: "8px 10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "6px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {ej.nombre}
                        </span>
                        {isBbdd && (
                          <span style={{ fontSize: "8.5px", fontWeight: 900, color: "#166534", background: "#dcfce7", padding: "1px 4px", borderRadius: "3px" }}>
                            BBDD
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "9.5px", color: "#64748b", marginTop: "1px" }}>
                        {ej.categoria} · <strong>{ej.perfilGps.mMin} m/min</strong> · HSR: {ej.perfilGps.hsrMin} · Acc: {ej.perfilGps.accMin} · PL: {ej.perfilGps.playerLoadMin}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddDrill(ej)}
                      style={{
                        background: "#0284c7",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "5px",
                        padding: "5px 9px",
                        fontSize: "11px",
                        fontWeight: 800,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ➕ Añadir
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

