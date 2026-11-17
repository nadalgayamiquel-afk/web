"use client";

import React, { useState } from "react";
import {
  CampoEjercicio,
  CampoCategoriaEjercicio,
  BENCHMARKS_CATEGORIA_DEFECTO,
  CampoDiagramaData,
} from "./campo-types";
import TacticalPitchDesigner from "./TacticalPitchDesigner";

interface EjercicioModalProps {
  ejercicio?: CampoEjercicio | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (ejercicio: CampoEjercicio) => void;
}

export default function EjercicioModal({
  ejercicio,
  isOpen,
  onClose,
  onSave,
}: EjercicioModalProps) {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<"pizarra" | "espacio" | "metodologia" | "gps">("pizarra");

  // Campos principales
  const [nombre, setNombre] = useState(ejercicio?.nombre || "");
  const [categoria, setCategoria] = useState<CampoCategoriaEjercicio>(ejercicio?.categoria || "POSESION");
  const [faseJuego, setFaseJuego] = useState<"ATAQUE" | "DEFENSA" | "TRANSICION_OF" | "TRANSICION_DEF" | "GLOBAL">(ejercicio?.faseJuego || "GLOBAL");

  // Dimensiones
  const [largoM, setLargoM] = useState<number>(ejercicio?.dimensiones.largoM || 40);
  const [anchoM, setAnchoM] = useState<number>(ejercicio?.dimensiones.anchoM || 30);

  // Jugadores
  const [atacantes, setAtacantes] = useState<number>(ejercicio?.jugadores.atacantes || 6);
  const [defensores, setDefensores] = useState<number>(ejercicio?.jugadores.defensores || 6);
  const [comodines, setComodines] = useState<number>(ejercicio?.jugadores.comodines || 2);
  const [porteros, setPorteros] = useState<number>(ejercicio?.jugadores.porteros || 0);

  // Estructura temporal
  const [series, setSeries] = useState<number>(ejercicio?.estructura.series || 3);
  const [repsPorSerie, setRepsPorSerie] = useState<number>(ejercicio?.estructura.repsPorSerie || 1);
  const [tiempoTrabajoSeg, setTiempoTrabajoSeg] = useState<number>(ejercicio?.estructura.tiempoTrabajoSeg || 240); // 4 min
  const [tiempoDescansoSeg, setTiempoDescansoSeg] = useState<number>(ejercicio?.estructura.tiempoDescansoSeg || 90); // 1.5 min
  const [pausaIncluida, setPausaIncluida] = useState<boolean>(ejercicio?.estructura.pausaIncluida || false);

  // Consignas
  const [objetivoPrincipal, setObjetivoPrincipal] = useState(ejercicio?.consignas.objetivoPrincipal || "Conservación y progresión del balón");
  const [objetivoSecundario, setObjetivoSecundario] = useState(ejercicio?.consignas.objetivoSecundario || "Presión tras pérdida");
  const [reglasProvocacion, setReglasProvocacion] = useState(ejercicio?.consignas.reglasProvocacion || "Máximo 2 toques, gol tras 6 pases seguidos");
  const [descripcion, setDescripcion] = useState(ejercicio?.consignas.descripcion || "");
  const [materialNecesario, setMaterialNecesario] = useState(ejercicio?.consignas.materialNecesario || "Conos, setas, petos de 2 colores, balones");
  const [notasEntrenador, setNotasEntrenador] = useState(ejercicio?.consignas.notasEntrenador || "");

  // Perfil GPS estimado
  const [perfilGps, setPerfilGps] = useState(
    ejercicio?.perfilGps || BENCHMARKS_CATEGORIA_DEFECTO[categoria] || BENCHMARKS_CATEGORIA_DEFECTO.POSESION
  );

  // Diagrama táctico
  const [diagrama, setDiagrama] = useState<CampoDiagramaData>(
    ejercicio?.diagrama || {
      pitchType: "medio_campo",
      elementos: [],
      trazosLibres: [],
    }
  );

  // Cálculos automáticos
  const totalJugadores = atacantes + defensores + comodines + porteros;
  const m2Totales = largoM * anchoM;
  const m2PorJugador = totalJugadores > 0 ? Math.round(m2Totales / totalJugadores) : m2Totales;

  const tiempoTotalTrabajoMin = (series * repsPorSerie * tiempoTrabajoSeg) / 60;
  const tiempoTotalPausaMin = pausaIncluida ? 0 : ((series * repsPorSerie - 1) * tiempoDescansoSeg) / 60;
  const tiempoTotalMin = Math.round((tiempoTotalTrabajoMin + tiempoTotalPausaMin) * 10) / 10;

  const ratioWR = pausaIncluida
    ? "Pausas incluidas"
    : tiempoDescansoSeg > 0
    ? `${(tiempoTrabajoSeg / tiempoDescansoSeg).toFixed(1)}:1`
    : "1:0";

  // Cargar perfil GPS según la categoría
  const handleApplyCategoryDefaults = () => {
    const defaults = BENCHMARKS_CATEGORIA_DEFECTO[categoria];
    if (defaults) {
      setPerfilGps({ ...defaults });
    }
  };

  const handleSave = () => {
    if (!nombre.trim()) {
      alert("Por favor, introduce un nombre para el ejercicio.");
      return;
    }

    const nuevoEjercicio: CampoEjercicio = {
      id: ejercicio?.id || `ej_${Date.now()}`,
      nombre: nombre.trim(),
      categoria,
      faseJuego,
      dimensiones: {
        largoM,
        anchoM,
        m2Totales,
        m2PorJugador,
      },
      jugadores: {
        atacantes,
        defensores,
        comodines,
        porteros,
        total: totalJugadores,
      },
      estructura: {
        series,
        repsPorSerie,
        tiempoTrabajoSeg,
        tiempoDescansoSeg: pausaIncluida ? 0 : tiempoDescansoSeg,
        tiempoTotalMin,
        ratioWR,
        pausaIncluida,
      },
      consignas: {
        objetivoPrincipal,
        objetivoSecundario,
        reglasProvocacion,
        descripcion,
        materialNecesario,
        notasEntrenador,
      },
      perfilGps,
      diagrama,
      creadoEn: ejercicio?.creadoEn || new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
    };

    onSave(nuevoEjercicio);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(6px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "1150px",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.4)",
          border: "1px solid #cbd5e1",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* CABECERA */}
        <div
          style={{
            padding: "14px 20px",
            background: "#0f172a",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #334155",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "22px" }}>⚽</span>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 900, margin: 0 }}>
                {ejercicio ? "Editar Ejercicio de Campo" : "Crear Nuevo Ejercicio de Campo"}
              </h2>
              <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>
                Diseñador táctico, parámetros de carga y objetivos metodológicos
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{ background: "#334155", color: "#ffffff", border: "none", borderRadius: "6px", padding: "6px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{ background: "#16a34a", color: "#ffffff", border: "none", borderRadius: "6px", padding: "6px 16px", fontSize: "12px", fontWeight: 900, cursor: "pointer", boxShadow: "0 2px 5px rgba(22,163,74,0.3)" }}
            >
              💾 Guardar Ejercicio
            </button>
          </div>
        </div>

        {/* NAVEGACIÓN DE PESTAÑAS */}
        <div
          style={{
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            padding: "0 16px",
            display: "flex",
            gap: "8px",
          }}
        >
          {[
            { id: "pizarra" as const, label: "🎨 Pizarra & Diseñador Táctico", icon: "📐" },
            { id: "espacio" as const, label: "📏 Espacio & Jugadores & Tiempo", icon: "⏱️" },
            { id: "metodologia" as const, label: "🎯 Objetivos & Consignas", icon: "📋" },
            { id: "gps" as const, label: "⚡ Perfil GPS Estimado", icon: "📊" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 14px",
                borderBottom: activeTab === tab.id ? "3px solid #0284c7" : "3px solid transparent",
                color: activeTab === tab.id ? "#0284c7" : "#64748b",
                fontWeight: activeTab === tab.id ? 900 : 700,
                fontSize: "12.5px",
                background: "transparent",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* CUERPO DEL MODAL (SCROLLABLE) */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {/* BARRA SUPERIOR GENERAL (NOMBRE Y CATEGORÍA) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr",
              gap: "12px",
              background: "#f1f5f9",
              padding: "12px",
              borderRadius: "10px",
              marginBottom: "16px",
              border: "1px solid #cbd5e1",
            }}
          >
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                Nombre del Ejercicio / Tarea *
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="ej. Rondo 4v4+3 con transición ofensiva"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1.5px solid #0284c7",
                  fontSize: "13px",
                  fontWeight: 800,
                  background: "#ffffff",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                Categoría Táctica
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CampoCategoriaEjercicio)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "12px",
                  fontWeight: 700,
                  background: "#ffffff",
                  boxSizing: "border-box",
                }}
              >
                <option value="RONDO">Rondo</option>
                <option value="POSESION">Posesión / Mantenimiento</option>
                <option value="SSG_REDUCIDO">Espacio Reducido (SSG)</option>
                <option value="LSG_AMPLIO">Espacio Amplio (LSG)</option>
                <option value="FINALIZACION">Finalizaciones</option>
                <option value="ABP">Acciones a Balón Parado (ABP)</option>
                <option value="TRANSICION">Transiciones Of / Def</option>
                <option value="FISICO_TECNICO">Físico - Técnico</option>
                <option value="CALENTAMIENTO">Calentamiento / Activación</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                Fase del Juego
              </label>
              <select
                value={faseJuego}
                onChange={(e) => setFaseJuego(e.target.value as any)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "12px",
                  fontWeight: 700,
                  background: "#ffffff",
                  boxSizing: "border-box",
                }}
              >
                <option value="GLOBAL">Global / Todo el Juego</option>
                <option value="ATAQUE">Fase Ofensiva</option>
                <option value="DEFENSA">Fase Defensiva</option>
                <option value="TRANSICION_OF">Transición Ataque-Defensa</option>
                <option value="TRANSICION_DEF">Transición Defensa-Ataque</option>
              </select>
            </div>
          </div>

          {/* CONTENIDO DE PESTAÑA 1: PIZARRA GRÁFICA */}
          {activeTab === "pizarra" && (
            <div>
              <TacticalPitchDesigner
                initialData={diagrama}
                onChange={(newDiagram) => setDiagrama(newDiagram)}
                height={500}
              />
            </div>
          )}

          {/* CONTENIDO DE PESTAÑA 2: ESPACIO, JUGADORES Y ESTRUCTURA TEMPORAL */}
          {activeTab === "espacio" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* BLOQUE DIMENSIONES */}
              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <h4 style={{ fontSize: "13px", fontWeight: 900, color: "#1e3a8a", margin: "0 0 12px 0", textTransform: "uppercase" }}>
                  📐 Dimensiones del Terreno de Juego
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Largo (metros):</label>
                    <input
                      type="number"
                      value={largoM}
                      onChange={(e) => setLargoM(Number(e.target.value))}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: 800 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Ancho (metros):</label>
                    <input
                      type="number"
                      value={anchoM}
                      onChange={(e) => setAnchoM(Number(e.target.value))}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: 800 }}
                    />
                  </div>
                  <div style={{ background: "#e0f2fe", padding: "8px", borderRadius: "8px", textAlign: "center" }}>
                    <div style={{ fontSize: "10px", fontWeight: 800, color: "#0369a1", textTransform: "uppercase" }}>Área Total</div>
                    <div style={{ fontSize: "16px", fontWeight: 900, color: "#0284c7" }}>{m2Totales} m²</div>
                  </div>
                  <div style={{ background: "#fef3c7", padding: "8px", borderRadius: "8px", textAlign: "center" }}>
                    <div style={{ fontSize: "10px", fontWeight: 800, color: "#92400e", textTransform: "uppercase" }}>Espacio Relativo</div>
                    <div style={{ fontSize: "16px", fontWeight: 900, color: "#b45309" }}>{m2PorJugador} m²/jugador</div>
                  </div>
                </div>
              </div>

              {/* BLOQUE JUGADORES */}
              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <h4 style={{ fontSize: "13px", fontWeight: 900, color: "#1e3a8a", margin: "0 0 12px 0", textTransform: "uppercase" }}>
                  👥 Distribución de Jugadores
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#dc2626" }}>🔴 Atacantes / Eq. A:</label>
                    <input
                      type="number"
                      value={atacantes}
                      onChange={(e) => setAtacantes(Number(e.target.value))}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: 800 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#2563eb" }}>🔵 Defensores / Eq. B:</label>
                    <input
                      type="number"
                      value={defensores}
                      onChange={(e) => setDefensores(Number(e.target.value))}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: 800 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#16a34a" }}>🟢 Comodines:</label>
                    <input
                      type="number"
                      value={comodines}
                      onChange={(e) => setComodines(Number(e.target.value))}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: 800 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#0f172a" }}>🧤 Porteros:</label>
                    <input
                      type="number"
                      value={porteros}
                      onChange={(e) => setPorteros(Number(e.target.value))}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: 800 }}
                    />
                  </div>
                  <div style={{ background: "#f1f5f9", padding: "8px", borderRadius: "8px", textAlign: "center" }}>
                    <div style={{ fontSize: "10px", fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>Total Jugadores</div>
                    <div style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a" }}>{totalJugadores}</div>
                  </div>
                </div>
              </div>

              {/* BLOQUE ESTRUCTURA TEMPORAL */}
              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <h4 style={{ fontSize: "13px", fontWeight: 900, color: "#1e3a8a", margin: "0 0 12px 0", textTransform: "uppercase" }}>
                  ⏱️ Estructura Temporal & Carga de Trabajo
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px", alignItems: "center" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Series:</label>
                    <input
                      type="number"
                      value={series}
                      onChange={(e) => setSeries(Number(e.target.value))}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: 800 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Trabajo (seg):</label>
                    <input
                      type="number"
                      step={15}
                      value={tiempoTrabajoSeg}
                      onChange={(e) => setTiempoTrabajoSeg(Number(e.target.value))}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: 800 }}
                    />
                    <span style={{ fontSize: "10px", color: "#64748b" }}>({Math.floor(tiempoTrabajoSeg / 60)}m {tiempoTrabajoSeg % 60}s)</span>
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Descanso (seg):</label>
                    <input
                      type="number"
                      step={15}
                      value={tiempoDescansoSeg}
                      onChange={(e) => setTiempoDescansoSeg(Number(e.target.value))}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: 800 }}
                    />
                    <span style={{ fontSize: "10px", color: "#64748b" }}>({Math.floor(tiempoDescansoSeg / 60)}m {tiempoDescansoSeg % 60}s)</span>
                  </div>
                  <div style={{ background: "#ecfdf5", padding: "8px", borderRadius: "8px", textAlign: "center" }}>
                    <div style={{ fontSize: "10px", fontWeight: 800, color: "#065f46", textTransform: "uppercase" }}>Ratio W:R</div>
                    <div style={{ fontSize: "16px", fontWeight: 900, color: "#059669" }}>{ratioWR}</div>
                  </div>
                  <div style={{ background: "#eff6ff", padding: "8px", borderRadius: "8px", textAlign: "center" }}>
                    <div style={{ fontSize: "10px", fontWeight: 800, color: "#1e40af", textTransform: "uppercase" }}>Tiempo Total</div>
                    <div style={{ fontSize: "16px", fontWeight: 900, color: "#2563eb" }}>{tiempoTotalMin} min</div>
                  </div>
                </div>

                <div style={{ marginTop: "10px", background: "#f8fafc", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    id="pausaIncluidaCheck"
                    checked={pausaIncluida}
                    onChange={(e) => setPausaIncluida(e.target.checked)}
                    style={{ cursor: "pointer", width: "16px", height: "16px" }}
                  />
                  <label htmlFor="pausaIncluidaCheck" style={{ fontSize: "11.5px", fontWeight: 800, color: "#1e293b", cursor: "pointer" }}>
                    ⏸️ Las pausas / descansos ya están incluidos en la duración de la tarea (habitual en mediciones GPS)
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* CONTENIDO DE PESTAÑA 3: OBJETIVOS Y METODOLOGÍA */}
          {activeTab === "metodologia" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#1e293b", marginBottom: "4px" }}>
                  Objetivo Principal del Ejercicio *
                </label>
                <input
                  type="text"
                  value={objetivoPrincipal}
                  onChange={(e) => setObjetivoPrincipal(e.target.value)}
                  placeholder="ej. Progresión en salida de balón atrayendo la presión rival"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: 700, fontSize: "12.5px", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#1e293b", marginBottom: "4px" }}>
                  Objetivo Secundario
                </label>
                <input
                  type="text"
                  value={objetivoSecundario}
                  onChange={(e) => setObjetivoSecundario(e.target.value)}
                  placeholder="ej. Presión tras pérdida y repliegue rápido"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: 700, fontSize: "12.5px", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#1e293b", marginBottom: "4px" }}>
                  Reglas de Provocación / Consignas
                </label>
                <textarea
                  rows={3}
                  value={reglasProvocacion}
                  onChange={(e) => setReglasProvocacion(e.target.value)}
                  placeholder="ej. Máximo 2 toques por jugador. Para puntuar, el balón debe pasar por ambos comodines..."
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 600, boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#1e293b", marginBottom: "4px" }}>
                  Descripción y Dinámica de la Tarea
                </label>
                <textarea
                  rows={4}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Describe cómo se inicia la tarea, las rotaciones, variantes y criterios de puntuación..."
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 600, boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#1e293b", marginBottom: "4px" }}>
                    Material Necesario
                  </label>
                  <input
                    type="text"
                    value={materialNecesario}
                    onChange={(e) => setMaterialNecesario(e.target.value)}
                    placeholder="ej. 8 petos verdes, 8 azules, 12 conos, 8 balones..."
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#1e293b", marginBottom: "4px" }}>
                    Notas del Entrenador / Feedback Clave
                  </label>
                  <input
                    type="text"
                    value={notasEntrenador}
                    onChange={(e) => setNotasEntrenador(e.target.value)}
                    placeholder="ej. Incidir en la orientación corporal del pivote"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", boxSizing: "border-box" }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* CONTENIDO DE PESTAÑA 4: PERFIL GPS ESTIMADO */}
          {activeTab === "gps" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: "12px 16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 900, color: "#1e293b" }}>
                    Intensidad Estimada por Minuto de Trabajo
                  </h4>
                  <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#64748b" }}>
                    Estos ratios permiten a la calculadora predecir la carga total de la sesión al planificarla.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleApplyCategoryDefaults}
                  style={{
                    background: "#0284c7",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 12px",
                    fontSize: "11.5px",
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>⚡</span> Cargar Benchmark de {categoria}
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                <div style={{ background: "#ffffff", border: "1.5px solid #cbd5e1", borderRadius: "10px", padding: "12px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#0284c7", display: "block", marginBottom: "4px" }}>
                    Distancia / Minuto (m/min)
                  </label>
                  <input
                    type="number"
                    step={1}
                    value={perfilGps.mMin}
                    onChange={(e) => setPerfilGps({ ...perfilGps, mMin: Number(e.target.value) })}
                    style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid #94a3b8", fontSize: "15px", fontWeight: 900, color: "#0f172a" }}
                  />
                  <span style={{ fontSize: "10.5px", color: "#64748b" }}>Media fútbol: 80 - 130 m/min</span>
                </div>

                <div style={{ background: "#ffffff", border: "1.5px solid #cbd5e1", borderRadius: "10px", padding: "12px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#d97706", display: "block", marginBottom: "4px" }}>
                    HSR / Minuto (&gt;21 km/h)
                  </label>
                  <input
                    type="number"
                    step={0.5}
                    value={perfilGps.hsrMin}
                    onChange={(e) => setPerfilGps({ ...perfilGps, hsrMin: Number(e.target.value) })}
                    style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid #94a3b8", fontSize: "15px", fontWeight: 900, color: "#0f172a" }}
                  />
                  <span style={{ fontSize: "10.5px", color: "#64748b" }}>Media fútbol: 2 - 15 m/min</span>
                </div>

                <div style={{ background: "#ffffff", border: "1.5px solid #cbd5e1", borderRadius: "10px", padding: "12px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#dc2626", display: "block", marginBottom: "4px" }}>
                    Sprint / Minuto (&gt;24 km/h)
                  </label>
                  <input
                    type="number"
                    step={0.2}
                    value={perfilGps.sprintMin}
                    onChange={(e) => setPerfilGps({ ...perfilGps, sprintMin: Number(e.target.value) })}
                    style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid #94a3b8", fontSize: "15px", fontWeight: 900, color: "#0f172a" }}
                  />
                  <span style={{ fontSize: "10.5px", color: "#64748b" }}>Media fútbol: 0.2 - 4 m/min</span>
                </div>

                <div style={{ background: "#ffffff", border: "1.5px solid #cbd5e1", borderRadius: "10px", padding: "12px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#16a34a", display: "block", marginBottom: "4px" }}>
                    Aceleraciones / Minuto (&gt;3 m/s²)
                  </label>
                  <input
                    type="number"
                    step={0.1}
                    value={perfilGps.accMin}
                    onChange={(e) => setPerfilGps({ ...perfilGps, accMin: Number(e.target.value) })}
                    style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid #94a3b8", fontSize: "15px", fontWeight: 900, color: "#0f172a" }}
                  />
                  <span style={{ fontSize: "10.5px", color: "#64748b" }}>Media fútbol: 0.8 - 2.8 acc/min</span>
                </div>

                <div style={{ background: "#ffffff", border: "1.5px solid #cbd5e1", borderRadius: "10px", padding: "12px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#9333ea", display: "block", marginBottom: "4px" }}>
                    Player Load / Minuto
                  </label>
                  <input
                    type="number"
                    step={0.5}
                    value={perfilGps.playerLoadMin}
                    onChange={(e) => setPerfilGps({ ...perfilGps, playerLoadMin: Number(e.target.value) })}
                    style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid #94a3b8", fontSize: "15px", fontWeight: 900, color: "#0f172a" }}
                  />
                  <span style={{ fontSize: "10.5px", color: "#64748b" }}>Media fútbol: 8 - 15 PL/min</span>
                </div>
              </div>

              {/* RESUMEN DE CARGA ACUMULADA DE ESTE EJERCICIO */}
              <div style={{ background: "#eff6ff", padding: "14px", borderRadius: "10px", border: "1px solid #bfdbfe" }}>
                <div style={{ fontSize: "12px", fontWeight: 900, color: "#1e40af", marginBottom: "6px" }}>
                  📊 Proyección de este ejercicio ({tiempoTotalTrabajoMin} min de trabajo neto):
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px", textAlign: "center" }}>
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b" }}>Distancia Total</div>
                    <div style={{ fontSize: "14px", fontWeight: 900, color: "#0284c7" }}>
                      {Math.round(perfilGps.mMin * tiempoTotalTrabajoMin)} m
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b" }}>HSR (&gt;21 km/h)</div>
                    <div style={{ fontSize: "14px", fontWeight: 900, color: "#d97706" }}>
                      {Math.round(perfilGps.hsrMin * tiempoTotalTrabajoMin)} m
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b" }}>Sprint (&gt;24 km/h)</div>
                    <div style={{ fontSize: "14px", fontWeight: 900, color: "#dc2626" }}>
                      {Math.round(perfilGps.sprintMin * tiempoTotalTrabajoMin)} m
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b" }}>Aceleraciones</div>
                    <div style={{ fontSize: "14px", fontWeight: 900, color: "#16a34a" }}>
                      {Math.round(perfilGps.accMin * tiempoTotalTrabajoMin)} acc
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b" }}>Player Load</div>
                    <div style={{ fontSize: "14px", fontWeight: 900, color: "#9333ea" }}>
                      {Math.round(perfilGps.playerLoadMin * tiempoTotalTrabajoMin)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

