"use client";

import React, { useState, useEffect } from "react";
import { CampoEjercicio } from "./campo-types";
import { getVideoEmbedInfo } from "./campo-video-utils";
import VideoPlayerModal from "./VideoPlayerModal";
import PitchGraphicView from "./PitchGraphicView";

interface EjercicioDetailModalProps {
  ejercicio: CampoEjercicio | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (ej: CampoEjercicio) => void;
  onDuplicate: (ej: CampoEjercicio) => void;
}

export default function EjercicioDetailModal({
  ejercicio,
  isOpen,
  onClose,
  onEdit,
  onDuplicate,
}: EjercicioDetailModalProps) {
  const [videoModalOpen, setVideoModalOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !videoModalOpen) onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, videoModalOpen]);

  if (!isOpen || !ejercicio) return null;

  const videoInfo = getVideoEmbedInfo(ejercicio.videoUrl);

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.75)",
          backdropFilter: "blur(6px)",
          zIndex: 9998,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
        }}
        onClick={onClose}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "960px",
            maxHeight: "92vh",
            background: "#ffffff",
            borderRadius: "16px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            border: "1px solid #e2e8f0",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* HEADER DEL MODAL */}
          <div
            style={{
              padding: "16px 24px",
              background: "#0f172a",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span
                  style={{
                    background: "#0284c7",
                    color: "#ffffff",
                    fontSize: "10px",
                    fontWeight: 900,
                    padding: "2px 8px",
                    borderRadius: "4px",
                    textTransform: "uppercase",
                  }}
                >
                  {ejercicio.categoria}
                </span>
                {ejercicio.faseJuego && (
                  <span
                    style={{
                      background: "#334155",
                      color: "#94a3b8",
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "4px",
                    }}
                  >
                    {ejercicio.faseJuego}
                  </span>
                )}
                {videoInfo && (
                  <span
                    style={{
                      background: "#ef4444",
                      color: "#ffffff",
                      fontSize: "10px",
                      fontWeight: 900,
                      padding: "2px 8px",
                      borderRadius: "4px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    ▶️ Vídeo disponible
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: "18px", fontWeight: 900, margin: 0, color: "#ffffff" }}>
                {ejercicio.nombre}
              </h2>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(ejercicio);
                }}
                style={{
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "7px 14px",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                ✏️ Editar
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDuplicate(ejercicio);
                }}
                style={{
                  background: "#334155",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "7px 12px",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                📋 Duplicar
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: "#1e293b",
                  color: "#cbd5e1",
                  border: "none",
                  borderRadius: "8px",
                  width: "32px",
                  height: "32px",
                  fontSize: "14px",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* CONTENIDO DEL MODAL SCROLLABLE */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "20px" }}>
              {/* COLUMNA IZQUIERDA: DIAGRAMA TÁCTICO & VÍDEO */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* PIZARRA TÁCTICA / IMAGEN */}
                <div
                  style={{
                    background: "#044320",
                    borderRadius: "12px",
                    overflow: "hidden",
                    border: "1px solid #166534",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    aspectRatio: "4 / 3",
                    position: "relative",
                  }}
                >
                  <PitchGraphicView diagrama={ejercicio.diagrama} height="100%" />

                  <div
                    style={{
                      position: "absolute",
                      bottom: "8px",
                      right: "8px",
                      background: "rgba(0,0,0,0.65)",
                      color: "#f8fafc",
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "4px",
                    }}
                  >
                    📐 {ejercicio.dimensiones.anchoM} x {ejercicio.dimensiones.largoM} m ({ejercicio.dimensiones.m2PorJugador} m²/j)
                  </div>
                </div>

                {/* BANNER / BOTÓN DE VÍDEO SI EXISTE */}
                {ejercicio.videoUrl ? (
                  <div
                    style={{
                      background: "#fef2f2",
                      border: "1.5px solid #fecaca",
                      borderRadius: "12px",
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "10px",
                          background: "#ef4444",
                          color: "#ffffff",
                          display: "grid",
                          placeItems: "center",
                          fontSize: "18px",
                        }}
                      >
                        ▶️
                      </div>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 800, color: "#991b1b" }}>
                          Vídeo Demostrativo Vinculado
                        </div>
                        <div style={{ fontSize: "11px", color: "#b91c1c" }}>
                          {videoInfo?.providerLabel || "Vídeo externo"}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setVideoModalOpen(true)}
                      style={{
                        background: "#dc2626",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "8px",
                        padding: "8px 16px",
                        fontSize: "12px",
                        fontWeight: 900,
                        cursor: "pointer",
                        boxShadow: "0 2px 4px rgba(220, 38, 38, 0.25)",
                      }}
                    >
                      Ver Vídeo ▶
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px dashed #cbd5e1",
                      borderRadius: "10px",
                      padding: "10px 14px",
                      fontSize: "11.5px",
                      color: "#64748b",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>Sin vídeo vinculado a esta tarea.</span>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onEdit(ejercicio);
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#0284c7",
                        fontSize: "11.5px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      + Añadir Vídeo
                    </button>
                  </div>
                )}
              </div>

              {/* COLUMNA DERECHA: CONSIGNAS, JUGADORES, ESTRUCTURA Y GPS */}
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* OBJETIVOS Y METODOLOGÍA */}
                <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                  <h4 style={{ fontSize: "11px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", margin: "0 0 6px 0" }}>
                    🎯 Objetivo Principal
                  </h4>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", margin: "0 0 10px 0" }}>
                    {ejercicio.consignas.objetivoPrincipal}
                  </p>

                  {ejercicio.consignas.objetivoSecundario && (
                    <>
                      <h4 style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", margin: "0 0 4px 0" }}>
                        📌 Objetivo Secundario
                      </h4>
                      <p style={{ fontSize: "12px", color: "#334155", margin: "0 0 10px 0" }}>
                        {ejercicio.consignas.objetivoSecundario}
                      </p>
                    </>
                  )}

                  {ejercicio.consignas.reglasProvocacion && (
                    <>
                      <h4 style={{ fontSize: "11px", fontWeight: 800, color: "#d97706", textTransform: "uppercase", margin: "0 0 4px 0" }}>
                        ⚡ Reglas de Provocación
                      </h4>
                      <p style={{ fontSize: "12px", color: "#451a03", background: "#fef3c7", padding: "8px 10px", borderRadius: "6px", margin: "0 0 10px 0" }}>
                        {ejercicio.consignas.reglasProvocacion}
                      </p>
                    </>
                  )}

                  {ejercicio.consignas.descripcion && (
                    <>
                      <h4 style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", margin: "0 0 4px 0" }}>
                        📝 Dinámica y Explicación
                      </h4>
                      <p style={{ fontSize: "12px", color: "#334155", margin: "0 0 10px 0", lineHeight: 1.4 }}>
                        {ejercicio.consignas.descripcion}
                      </p>
                    </>
                  )}

                  {ejercicio.consignas.materialNecesario && (
                    <div style={{ fontSize: "11px", color: "#64748b", borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
                      <strong>Material:</strong> {ejercicio.consignas.materialNecesario}
                    </div>
                  )}
                </div>

                {/* MÉTRICAS DE ESPACIO Y JUGADORES */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "8px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ background: "#f1f5f9", padding: "10px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "9px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Espacio</div>
                    <div style={{ fontSize: "13px", fontWeight: 900, color: "#0f172a", marginTop: "2px" }}>
                      {ejercicio.dimensiones.anchoM}x{ejercicio.dimensiones.largoM}m
                    </div>
                    <div style={{ fontSize: "10px", color: "#0284c7", fontWeight: 800 }}>
                      {ejercicio.dimensiones.m2PorJugador} m²/j
                    </div>
                  </div>

                  <div style={{ background: "#f1f5f9", padding: "10px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "9px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Jugadores</div>
                    <div style={{ fontSize: "13px", fontWeight: 900, color: "#0f172a", marginTop: "2px" }}>
                      {ejercicio.jugadores.total} pax
                    </div>
                    <div style={{ fontSize: "10px", color: "#475569", fontWeight: 700 }}>
                      {ejercicio.jugadores.atacantes}v{ejercicio.jugadores.defensores}
                      {ejercicio.jugadores.comodines > 0 ? ` +${ejercicio.jugadores.comodines}C` : ""}
                    </div>
                  </div>

                  <div style={{ background: "#f1f5f9", padding: "10px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "9px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Estructura</div>
                    <div style={{ fontSize: "13px", fontWeight: 900, color: "#0f172a", marginTop: "2px" }}>
                      ⏱️ {ejercicio.estructura.tiempoTotalMin} min
                    </div>
                    <div style={{ fontSize: "10px", color: "#16a34a", fontWeight: 800 }}>
                      {ejercicio.estructura.series}x{Math.round(ejercicio.estructura.tiempoTrabajoSeg / 60)}' (W:R {ejercicio.estructura.ratioWR})
                    </div>
                  </div>
                </div>

                {/* PERFIL GPS ESTIMADO */}
                <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#475569", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
                    <span>⚡ Perfil de Carga GPS Estimado</span>
                    <span style={{ fontSize: "10px", color: "#64748b" }}>Por minuto de juego</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", textAlign: "center" }}>
                    <div style={{ background: "#ffffff", padding: "8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "8.5px", color: "#64748b", fontWeight: 700 }}>DIST/MIN</div>
                      <div style={{ fontSize: "12px", fontWeight: 900, color: "#0284c7" }}>{ejercicio.perfilGps.mMin} m</div>
                    </div>
                    <div style={{ background: "#ffffff", padding: "8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "8.5px", color: "#64748b", fontWeight: 700 }}>HSR &gt;21</div>
                      <div style={{ fontSize: "12px", fontWeight: 900, color: "#d97706" }}>{ejercicio.perfilGps.hsrMin} m</div>
                    </div>
                    <div style={{ background: "#ffffff", padding: "8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "8.5px", color: "#64748b", fontWeight: 700 }}>ACC &gt;3</div>
                      <div style={{ fontSize: "12px", fontWeight: 900, color: "#16a34a" }}>{ejercicio.perfilGps.accMin} /m</div>
                    </div>
                    <div style={{ background: "#ffffff", padding: "8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "8.5px", color: "#64748b", fontWeight: 700 }}>PL/MIN</div>
                      <div style={{ fontSize: "12px", fontWeight: 900, color: "#7c3aed" }}>{ejercicio.perfilGps.playerLoadMin}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE VÍDEO COMPLETO */}
      <VideoPlayerModal
        isOpen={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        videoUrl={ejercicio.videoUrl}
        title={ejercicio.nombre}
        categoryLabel={ejercicio.categoria}
      />
    </>
  );
}
