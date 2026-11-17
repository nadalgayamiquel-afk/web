"use client";

import React, { useState, useMemo } from "react";
import {
  CampoSesionFicha,
  CampoSesionBloque,
  CampoEjercicio,
  CampoSesionBloqueItem,
  TARGETS_MICROCICLO_MD,
} from "./campo-types";
import TacticalPitchDesigner from "./TacticalPitchDesigner";

interface SesionFichaManagerProps {
  sesiones: CampoSesionFicha[];
  ejerciciosDB: CampoEjercicio[];
  onSaveSesion: (sesion: CampoSesionFicha) => void;
  onDeleteSesion: (id: string) => void;
}

export default function SesionFichaManager({
  sesiones,
  ejerciciosDB,
  onSaveSesion,
  onDeleteSesion,
}: SesionFichaManagerProps) {
  // Sesión actualmente en edición / vista
  const [activeSesionId, setActiveSesionId] = useState<string>(
    sesiones[0]?.id || ""
  );

  // Modal para seleccionar ejercicio de la biblioteca y añadirlo a un bloque
  const [modalTargetBloqueId, setModalTargetBloqueId] = useState<string | null>(null);

  // Sesión activa seleccionada
  const activeSesion = useMemo(() => {
    return sesiones.find((s) => s.id === activeSesionId) || sesiones[0] || null;
  }, [sesiones, activeSesionId]);

  // Crear una nueva sesión en blanco
  const handleCreateNewSesion = () => {
    const today = new Date().toISOString().split("T")[0];
    const newSesion: CampoSesionFicha = {
      id: `ses_${Date.now()}`,
      fecha: today,
      microcicloMd: "MD-4",
      horaInicio: "11:00",
      horaFin: "12:30",
      duracionEstimadaMin: 90,
      instalacion: "Nou Sardenya",
      objetivoPrincipal: "Evolución en fase de ataque y contragolpe",
      objetivoFisico: "Capacidad aeróbica en espacios amplios (LSG)",
      bloques: [
        {
          id: "b_calentamiento",
          nombre: "1. Calentamiento & Activación Técnica",
          orden: 1,
          items: [],
        },
        {
          id: "b_principal",
          nombre: "2. Parte Principal (Tareas Tácticas)",
          orden: 2,
          items: [],
        },
        {
          id: "b_final",
          nombre: "3. Partido / Situación Real & Vuelta a la Calma",
          orden: 3,
          items: [],
        },
      ],
      metricasEstimadas: {
        duracionTotalMin: 0,
        distanciaTotalM: 0,
        hsrTotalM: 0,
        sprintTotalM: 0,
        accTotal: 0,
        playerLoadTotal: 0,
      },
      observacionesTecnicas: "",
      estado: "planificada",
      creadaEn: new Date().toISOString(),
    };

    onSaveSesion(newSesion);
    setActiveSesionId(newSesion.id);
  };

  // Añadir un ejercicio a un bloque de la sesión
  const handleAddEjercicioToBloque = (bloqueId: string, ej: CampoEjercicio) => {
    if (!activeSesion) return;

    const trabajoMin = (ej.estructura.series * ej.estructura.tiempoTrabajoSeg) / 60;
    const pausaMin = ((ej.estructura.series - 1) * ej.estructura.tiempoDescansoSeg) / 60;
    const totalMin = Math.round((trabajoMin + pausaMin) * 10) / 10;

    const newItem: CampoSesionBloqueItem = {
      id: `item_${Date.now()}`,
      ejercicioId: ej.id,
      ejercicioSnapshot: ej,
      nombrePersonalizado: ej.nombre,
      series: ej.estructura.series,
      tiempoTrabajoMin: Math.round(trabajoMin * 10) / 10,
      pausaMin: Math.round(pausaMin * 10) / 10,
      tiempoTotalMin: totalMin,
      orden: 99,
    };

    const updatedBloques = activeSesion.bloques.map((b) => {
      if (b.id !== bloqueId) return b;
      return {
        ...b,
        items: [...b.items, newItem],
      };
    });

    // Recalcular métricas estimadas acumuladas
    let distTotal = 0;
    let hsrTotal = 0;
    let sprintTotal = 0;
    let accTotal = 0;
    let plTotal = 0;
    let durTotal = 0;

    updatedBloques.forEach((b) => {
      b.items.forEach((it) => {
        const snap = it.ejercicioSnapshot;
        durTotal += it.tiempoTotalMin;
        if (snap) {
          distTotal += snap.perfilGps.mMin * it.tiempoTrabajoMin;
          hsrTotal += snap.perfilGps.hsrMin * it.tiempoTrabajoMin;
          sprintTotal += snap.perfilGps.sprintMin * it.tiempoTrabajoMin;
          accTotal += snap.perfilGps.accMin * it.tiempoTrabajoMin;
          plTotal += snap.perfilGps.playerLoadMin * it.tiempoTrabajoMin;
        }
      });
    });

    const updatedSesion: CampoSesionFicha = {
      ...activeSesion,
      bloques: updatedBloques,
      duracionEstimadaMin: Math.round(durTotal),
      metricasEstimadas: {
        duracionTotalMin: Math.round(durTotal),
        distanciaTotalM: Math.round(distTotal),
        hsrTotalM: Math.round(hsrTotal),
        sprintTotalM: Math.round(sprintTotal),
        accTotal: Math.round(accTotal),
        playerLoadTotal: Math.round(plTotal),
      },
    };

    onSaveSesion(updatedSesion);
    setModalTargetBloqueId(null);
  };

  // Eliminar un ítem de un bloque
  const handleRemoveItemFromBloque = (bloqueId: string, itemId: string) => {
    if (!activeSesion) return;

    const updatedBloques = activeSesion.bloques.map((b) => {
      if (b.id !== bloqueId) return b;
      return {
        ...b,
        items: b.items.filter((it) => it.id !== itemId),
      };
    });

    onSaveSesion({ ...activeSesion, bloques: updatedBloques });
  };

  // Imprimir / Exportar a PDF
  const handlePrintSession = () => {
    window.print();
  };

  if (!activeSesion && sesiones.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 16px", background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
        <span style={{ fontSize: "36px" }}>📋</span>
        <h3 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", marginTop: "8px" }}>
          No hay fichas de sesión creadas
        </h3>
        <p style={{ fontSize: "12px", color: "#64748b", margin: "4px 0 16px" }}>
          Crea tu primera ficha de entrenamiento para planificar tareas, tiempos y objetivos.
        </p>
        <button
          type="button"
          onClick={handleCreateNewSesion}
          style={{ background: "#0284c7", color: "#ffffff", border: "none", borderRadius: "8px", padding: "8px 18px", fontSize: "12.5px", fontWeight: 900, cursor: "pointer" }}
        >
          ➕ Crear Primera Sesión
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* BARRA SUPERIOR: SELECTOR DE SESIÓN Y ACCIONES */}
      <div
        className="no-print"
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "12px", fontWeight: 800, color: "#475569" }}>Sesión:</span>
          <select
            value={activeSesion?.id || ""}
            onChange={(e) => setActiveSesionId(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              fontSize: "12.5px",
              fontWeight: 800,
              background: "#f8fafc",
              color: "#0f172a",
            }}
          >
            {sesiones.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fecha} · {s.microcicloMd} · {s.objetivoPrincipal}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleCreateNewSesion}
            style={{ background: "#0284c7", color: "#ffffff", border: "none", borderRadius: "6px", padding: "6px 12px", fontSize: "11.5px", fontWeight: 800, cursor: "pointer" }}
          >
            ➕ Nueva Sesión
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={handlePrintSession}
            style={{ background: "#1e293b", color: "#ffffff", border: "none", borderRadius: "6px", padding: "6px 14px", fontSize: "12px", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
          >
            🖨️ Imprimir / Exportar PDF
          </button>

          {activeSesion && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("¿Seguro que deseas eliminar esta ficha de sesión?")) {
                  onDeleteSesion(activeSesion.id);
                }
              }}
              style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: "6px", padding: "6px 10px", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {/* FICHA OFICIAL DE SESIÓN (ESTILO FORMULARIO PROFESIONAL PARA PDF Y PANTALLA) */}
      {activeSesion && (
        <div
          className="campo-ficha-sesion"
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #cbd5e1",
            padding: "24px",
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
          }}
        >
          {/* CABECERA OFICIAL TIPO CLUB */}
          <div
            style={{
              borderBottom: "2px solid #0284c7",
              paddingBottom: "14px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <img
                src="/ce-europa.png"
                alt="CE Europa"
                style={{ height: "42px", width: "42px", objectFit: "contain" }}
                onError={(e) => { (e.currentTarget as HTMLElement).style.display = "none"; }}
              />
              <div>
                <h2 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: 0, textTransform: "uppercase" }}>
                  FICHA TÉCNICA DE ENTRENAMIENTO
                </h2>
                <div style={{ fontSize: "11px", fontWeight: 800, color: "#0284c7", marginTop: "2px" }}>
                  CE EUROPA · 1RFEF · TEMPORADA 2026-27
                </div>
              </div>
            </div>

            {/* BADGES METADATA */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "12.5px", fontWeight: 900, color: "#0f172a" }}>
                  Fecha: {activeSesion.fecha}
                </div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>
                  {activeSesion.instalacion} · {activeSesion.horaInicio} - {activeSesion.horaFin}
                </div>
              </div>

              <div
                style={{
                  background: TARGETS_MICROCICLO_MD[activeSesion.microcicloMd]?.color || "#2563eb",
                  color: "#ffffff",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 900,
                  textAlign: "center",
                }}
              >
                {activeSesion.microcicloMd}
              </div>
            </div>
          </div>

          {/* CUADRO DE OBJETIVOS DE LA SESIÓN */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr",
              gap: "12px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "10px 14px",
              marginBottom: "18px",
            }}
          >
            <div>
              <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#0284c7", textTransform: "uppercase" }}>
                🎯 Objetivo Táctico Principal:
              </div>
              <input
                type="text"
                value={activeSesion.objetivoPrincipal}
                onChange={(e) => onSaveSesion({ ...activeSesion, objetivoPrincipal: e.target.value })}
                style={{ width: "100%", background: "transparent", border: "none", fontSize: "12.5px", fontWeight: 800, color: "#0f172a", outline: "none", marginTop: "2px" }}
              />
            </div>
            <div>
              <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#16a34a", textTransform: "uppercase" }}>
                ⚡ Enfoque Fisiológico / Carga:
              </div>
              <input
                type="text"
                value={activeSesion.objetivoFisico || ""}
                onChange={(e) => onSaveSesion({ ...activeSesion, objetivoFisico: e.target.value })}
                style={{ width: "100%", background: "transparent", border: "none", fontSize: "12px", fontWeight: 700, color: "#334155", outline: "none", marginTop: "2px" }}
              />
            </div>
          </div>

          {/* LISTA DE BLOQUES Y TAREAS */}
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {activeSesion.bloques.map((bloque) => (
              <div
                key={bloque.id}
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  overflow: "hidden",
                }}
              >
                {/* CABECERA DEL BLOQUE */}
                <div
                  style={{
                    background: "#f1f5f9",
                    padding: "8px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <span style={{ fontSize: "12.5px", fontWeight: 900, color: "#1e293b", textTransform: "uppercase" }}>
                    {bloque.nombre} ({bloque.items.reduce((acc, it) => acc + it.tiempoTotalMin, 0)} min)
                  </span>

                  <button
                    type="button"
                    className="no-print"
                    onClick={() => setModalTargetBloqueId(bloque.id)}
                    style={{
                      background: "#0284c7",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "5px",
                      padding: "4px 10px",
                      fontSize: "11px",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    ➕ Añadir Ejercicio
                  </button>
                </div>

                {/* TAREAS DEL BLOQUE */}
                <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "14px" }}>
                  {bloque.items.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "14px", color: "#94a3b8", fontSize: "11.5px", fontStyle: "italic" }}>
                      Sin tareas asignadas en este bloque.
                    </div>
                  ) : (
                    bloque.items.map((it, idx) => {
                      const ej = it.ejercicioSnapshot;
                      return (
                        <div
                          key={it.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "220px 1fr 200px",
                            gap: "14px",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            borderRadius: "8px",
                            padding: "10px",
                            alignItems: "center",
                          }}
                        >
                          {/* 1. PIZARRA TÁCTICA MINIATURA */}
                          <div style={{ borderRadius: "6px", overflow: "hidden", border: "1px solid #334155" }}>
                            {ej?.diagrama ? (
                              <TacticalPitchDesigner
                                initialData={ej.diagrama}
                                readOnly={true}
                                height={140}
                              />
                            ) : (
                              <div style={{ height: "140px", background: "#166534", display: "grid", placeItems: "center", color: "#ffffff", fontSize: "11px", fontWeight: 700 }}>
                                Sin diagrama
                              </div>
                            )}
                          </div>

                          {/* 2. DATOS METODOLÓGICOS Y TÁCTICOS */}
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontSize: "11px", fontWeight: 900, color: "#64748b" }}>#{idx + 1}</span>
                              <span style={{ fontSize: "13.5px", fontWeight: 900, color: "#0f172a" }}>
                                {it.nombrePersonalizado || ej?.nombre}
                              </span>
                              {ej?.categoria && (
                                <span style={{ fontSize: "9.5px", fontWeight: 800, color: "#0284c7", background: "#e0f2fe", padding: "2px 6px", borderRadius: "4px" }}>
                                  {ej.categoria}
                                </span>
                              )}
                            </div>

                            {ej?.consignas?.objetivoPrincipal && (
                              <div style={{ fontSize: "11.5px", color: "#334155", marginTop: "4px", fontWeight: 600 }}>
                                📌 <strong>Objetivo:</strong> {ej.consignas.objetivoPrincipal}
                              </div>
                            )}

                            {ej?.consignas?.reglasProvocacion && (
                              <div style={{ fontSize: "11px", color: "#475569", marginTop: "2px" }}>
                                ⚙️ <strong>Reglas:</strong> {ej.consignas.reglasProvocacion}
                              </div>
                            )}

                            {ej?.dimensiones && (
                              <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "4px" }}>
                                📐 Espacio: {ej.dimensiones.largoM}x{ej.dimensiones.anchoM}m ({ej.dimensiones.m2PorJugador} m²/j) · 👥 Jugadores: {ej.jugadores.total}
                              </div>
                            )}
                          </div>

                          {/* 3. PARÁMETROS TEMPORALES Y CARGA */}
                          <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: "4px" }}>
                            <div style={{ fontSize: "13px", fontWeight: 900, color: "#1e3a8a" }}>
                              {it.tiempoTrabajoMin} min netos
                            </div>
                            <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                              {it.series} series · Pausa: {it.pausaMin}m
                            </div>

                            {ej?.perfilGps && (
                              <div style={{ fontSize: "10px", color: "#475569", marginTop: "4px" }}>
                                Est: ~{Math.round(ej.perfilGps.mMin * it.tiempoTrabajoMin)}m · {Math.round(ej.perfilGps.hsrMin * it.tiempoTrabajoMin)}m HSR
                              </div>
                            )}

                            <button
                              type="button"
                              className="no-print"
                              onClick={() => handleRemoveItemFromBloque(bloque.id, it.id)}
                              style={{ alignSelf: "flex-end", marginTop: "6px", background: "none", border: "none", color: "#dc2626", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                            >
                              ✕ Quitar
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* PIE DE FICHA: RESUMEN TOTAL DE LA SESIÓN */}
          <div
            style={{
              marginTop: "20px",
              background: "#0f172a",
              color: "#ffffff",
              borderRadius: "10px",
              padding: "14px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>
                Total Tiempo de Sesión
              </div>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "#38bdf8" }}>
                {activeSesion.duracionEstimadaMin} min
              </div>
            </div>

            <div style={{ display: "flex", gap: "24px", textAlign: "center" }}>
              <div>
                <div style={{ fontSize: "10px", color: "#94a3b8" }}>Distancia Est.</div>
                <div style={{ fontSize: "15px", fontWeight: 900 }}>{activeSesion.metricasEstimadas.distanciaTotalM.toLocaleString()} m</div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#94a3b8" }}>HSR Est.</div>
                <div style={{ fontSize: "15px", fontWeight: 900, color: "#facc15" }}>{activeSesion.metricasEstimadas.hsrTotalM} m</div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#94a3b8" }}>Sprint Est.</div>
                <div style={{ fontSize: "15px", fontWeight: 900, color: "#f87171" }}>{activeSesion.metricasEstimadas.sprintTotalM} m</div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#94a3b8" }}>Player Load</div>
                <div style={{ fontSize: "15px", fontWeight: 900, color: "#c084fc" }}>{activeSesion.metricasEstimadas.playerLoadTotal}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA SELECCIONAR EJERCICIO Y AÑADIRLO AL BLOQUE */}
      {modalTargetBloqueId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.7)",
            backdropFilter: "blur(4px)",
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setModalTargetBloqueId(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              padding: "20px",
              width: "100%",
              maxWidth: "600px",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 900, color: "#0f172a", margin: 0 }}>
                Seleccionar Ejercicio de la Biblioteca
              </h3>
              <button
                type="button"
                onClick={() => setModalTargetBloqueId(null)}
                style={{ background: "none", border: "none", fontSize: "16px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {ejerciciosDB.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
                  No hay ejercicios en la biblioteca. Crea uno primero en la pestaña de Ejercicios.
                </div>
              ) : (
                ejerciciosDB.map((ej) => (
                  <div
                    key={ej.id}
                    onClick={() => handleAddEjercicioToBloque(modalTargetBloqueId, ej)}
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a" }}>
                        {ej.nombre}
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                        {ej.categoria} · {ej.dimensiones.largoM}x{ej.dimensiones.anchoM}m · {ej.jugadores.total} jugadores · {ej.estructura.tiempoTotalMin} min
                      </div>
                    </div>
                    <span style={{ fontSize: "18px", color: "#0284c7" }}>➕</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
