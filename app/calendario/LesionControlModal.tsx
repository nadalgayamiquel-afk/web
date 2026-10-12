"use client";

import React, { useState } from "react";

export type LesionFormData = {
  id?: string;
  jugador_id: string;
  jugador_nombre: string;
  jugador_apodo?: string;
  posicion?: string;
  cor_id?: string | number;
  seccion: string;
  equipo: string;
  fecha_nacimiento?: string;
  fecha: string;
  sesion_dia_id?: string;
  tipo_disponibilidad: "NDL" | "NDR" | "L";
  contexto: string;
  contacto: string;
  region_corporal: string;
  recurrencia: string;
  tejido: string;
  resultado: string;
  gravedad: string;
  dias_baja: number;
  comentario: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: LesionFormData) => void;
  initialData: {
    jugador: {
      id: string;
      nombre: string;
      apodo?: string | null;
      posicion?: string | null;
      dorsal?: string | number | null;
      cor_id?: string | null;
      fecha_nacimiento?: string | null;
      foto_url?: string | null;
    };
    sesionDia: {
      id: string;
      fecha: string;
      evento_am?: string | null;
      md?: string | null;
      rival?: string | null;
    };
    codigo: "NDL" | "NDR" | "L";
    ultimoDiaDisponible?: string;
  };
};

export const CONTEXTOS_OPTIONS = [
  "Entrenamiento Optimizador",
  "Competición",
  "Entrenamiento Coadyuvante",
  "Entrenamiento Fuerza",
  "Individual",
  "Otro",
];

export const CONTACTO_OPTIONS = ["Sin contacto", "Con contacto"];

export const REGIONES_OPTIONS = [
  "Muslo (cuádriceps)",
  "Isquiotibiales",
  "Aductor / Ingle",
  "Pierna inferior / Tendón de Aquiles",
  "Tobillo",
  "Rodilla",
  "Pie",
  "Cadera / Pelvis",
  "Espalda / Lumbar",
  "Hombro",
  "Brazos / Mano",
  "Cabeza / Cuello",
  "Otro",
];

export const RECURRENCIA_OPTIONS = ["Nueva", "Recurrente"];

export const TEJIDO_OPTIONS = [
  "Músculo",
  "Tendón",
  "Ligamento",
  "Óseo / Estructura / Estrés / Contusión",
  "Articular / Menisco",
  "Neural",
  "Otro",
];

export const RESULTADO_OPTIONS = ["Sin baja", "Con baja"];

export const GRAVEDAD_OPTIONS = [
  "Sin baja (0)",
  "Leve (1 a 7)",
  "Moderada (8 a 28)",
  "Grave (>28)",
];

export default function LesionControlModal({ isOpen, onClose, onSave, initialData }: Props) {
  if (!isOpen) return null;

  const { jugador, sesionDia, codigo, ultimoDiaDisponible } = initialData;

  const [fecha, setFecha] = useState(
    ultimoDiaDisponible || sesionDia.fecha || new Date().toISOString().split("T")[0]
  );
  const [contexto, setContexto] = useState(
    sesionDia.evento_am?.toUpperCase().includes("PA") ? "Competición" : "Entrenamiento Optimizador"
  );
  const [contacto, setContacto] = useState("Sin contacto");
  const [regionCorporal, setRegionCorporal] = useState("Muslo (cuádriceps)");
  const [recurrencia, setRecurrencia] = useState("Nueva");
  const [tejido, setTejido] = useState("Músculo");
  const [resultado, setResultado] = useState("Con baja");
  const [gravedad, setGravedad] = useState("Leve (1 a 7)");
  const [diasBaja, setDiasBaja] = useState<number>(3);
  const [comentario, setComentario] = useState("");

  const handleDiasChange = (val: number) => {
    setDiasBaja(val);
    if (val === 0) {
      setGravedad("Sin baja (0)");
      setResultado("Sin baja");
    } else if (val <= 7) {
      setGravedad("Leve (1 a 7)");
      setResultado("Con baja");
    } else if (val <= 28) {
      setGravedad("Moderada (8 a 28)");
      setResultado("Con baja");
    } else {
      setGravedad("Grave (>28)");
      setResultado("Con baja");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: `${jugador.id}_${fecha}_${Date.now()}`,
      jugador_id: jugador.id,
      jugador_nombre: jugador.nombre,
      jugador_apodo: jugador.apodo || "",
      posicion: jugador.posicion || "",
      cor_id: jugador.cor_id || jugador.dorsal || "",
      seccion: "CE MANRESA",
      equipo: "1er EQUIPO",
      fecha_nacimiento: jugador.fecha_nacimiento || "",
      fecha,
      sesion_dia_id: sesionDia.id,
      tipo_disponibilidad: codigo,
      contexto,
      contacto,
      region_corporal: regionCorporal,
      recurrencia,
      tejido,
      resultado,
      gravedad,
      dias_baja: Number(diasBaja) || 0,
      comentario: comentario.trim(),
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
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
          borderRadius: "14px",
          width: "100%",
          maxWidth: "760px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid #cbd5e1",
          padding: "24px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del modal */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "20px" }}>🚨</span>
              <h3 style={{ fontSize: "17px", fontWeight: 900, color: "#0f172a", margin: 0 }}>
                Control de Incidencia Lesional ({codigo})
              </h3>
            </div>
            <p style={{ fontSize: "12.5px", color: "#64748b", margin: "4px 0 0 0" }}>
              Se ha detectado una transición de <strong>Disponible (D)</strong> a <strong>{codigo}</strong> para <strong>{jugador.nombre} {jugador.apodo ? `(${jugador.apodo})` : ""}</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#f1f5f9",
              border: "none",
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "14px",
              fontWeight: 800,
              color: "#64748b",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Ficha Resumen Deportista */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: "10px",
            background: "#f8fafc",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            marginBottom: "16px",
            fontSize: "12px"
          }}>
            <div>
              <span style={{ color: "#64748b", fontSize: "10.5px", fontWeight: 700, display: "block" }}>DEPORTISTA</span>
              <strong style={{ color: "#0f172a" }}>{jugador.nombre}</strong>
            </div>
            <div>
              <span style={{ color: "#64748b", fontSize: "10.5px", fontWeight: 700, display: "block" }}>POSICIÓN</span>
              <strong style={{ color: "#0f172a" }}>{jugador.posicion || "—"}</strong>
            </div>
          </div>

          {/* Pregunta explícita sobre la fecha de la lesión con predeterminado del último día disponible */}
          <div style={{
            background: "#eff6ff",
            border: "1.5px solid #93c5fd",
            padding: "12px 14px",
            borderRadius: "8px",
            marginBottom: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "6px"
          }}>
            <label style={{ fontSize: "12px", fontWeight: 900, color: "#1e3a8a", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>📅</span> ¿Qué día ocurrió la lesión o molestia? *
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <input
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1.5px solid #2563eb",
                  fontSize: "13px",
                  fontWeight: 800,
                  color: "#0f172a",
                  background: "#ffffff",
                  outline: "none",
                  width: "180px",
                }}
              />
              {ultimoDiaDisponible && (
                <span style={{ fontSize: "11.5px", color: "#1d4ed8", fontWeight: 700 }}>
                  💡 Sugerido por defecto: Último día disponible ({ultimoDiaDisponible})
                </span>
              )}
            </div>
          </div>

          {/* Clasificación de la Lesión */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px", marginBottom: "16px" }}>
            {/* Contexto */}
            <div>
              <label style={{ display: "block", fontSize: "11.5px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                Contexto
              </label>
              <select
                value={contexto}
                onChange={(e) => setContexto(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", color: "#0f172a", background: "#ffffff" }}
              >
                {CONTEXTOS_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Contacto */}
            <div>
              <label style={{ display: "block", fontSize: "11.5px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                Contacto
              </label>
              <select
                value={contacto}
                onChange={(e) => setContacto(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", color: "#0f172a", background: "#ffffff" }}
              >
                {CONTACTO_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Región Corporal */}
            <div>
              <label style={{ display: "block", fontSize: "11.5px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                Región Corporal
              </label>
              <select
                value={regionCorporal}
                onChange={(e) => setRegionCorporal(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", color: "#0f172a", background: "#ffffff" }}
              >
                {REGIONES_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Recurrencia */}
            <div>
              <label style={{ display: "block", fontSize: "11.5px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                Recurrencia
              </label>
              <select
                value={recurrencia}
                onChange={(e) => setRecurrencia(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", color: "#0f172a", background: "#ffffff" }}
              >
                {RECURRENCIA_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Tejido */}
            <div>
              <label style={{ display: "block", fontSize: "11.5px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                Tejido Afectado
              </label>
              <select
                value={tejido}
                onChange={(e) => setTejido(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", color: "#0f172a", background: "#ffffff" }}
              >
                {TEJIDO_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Resultado */}
            <div>
              <label style={{ display: "block", fontSize: "11.5px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                Resultado
              </label>
              <select
                value={resultado}
                onChange={(e) => setResultado(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", color: "#0f172a", background: "#ffffff" }}
              >
                {RESULTADO_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Días de Baja */}
            <div>
              <label style={{ display: "block", fontSize: "11.5px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                Días Estimados de Baja
              </label>
              <input
                type="number"
                min={0}
                value={diasBaja}
                onChange={(e) => handleDiasChange(Number(e.target.value) || 0)}
                style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", color: "#0f172a", background: "#ffffff" }}
              />
            </div>

            {/* Gravedad */}
            <div>
              <label style={{ display: "block", fontSize: "11.5px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                Gravedad
              </label>
              <select
                value={gravedad}
                onChange={(e) => setGravedad(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", color: "#0f172a", background: "#ffffff" }}
              >
                {GRAVEDAD_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Comentario / Observaciones Clínicas */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
              💬 Comentario / Observaciones de Fisioterapia & Readaptación
            </label>
            <textarea
              rows={3}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Añade detalles diagnósticos, molestias referidas, tratamiento inicial o pautas de readaptación…"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "12px",
                fontFamily: "inherit",
                color: "#0f172a",
                background: "#ffffff",
                outline: "none",
                resize: "vertical",
              }}
            />
          </div>

          {/* Botones de acción */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid #e2e8f0", paddingTop: "14px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#475569",
                fontSize: "12.5px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Omitir / Solo cambiar estado
            </button>

            <button
              type="submit"
              style={{
                padding: "8px 20px",
                borderRadius: "6px",
                border: "none",
                background: "#1e3a8a",
                color: "#ffffff",
                fontSize: "12.5px",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 2px 4px rgba(30, 58, 138, 0.25)",
              }}
            >
              ✓ Guardar y Clasificar Lesión
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
