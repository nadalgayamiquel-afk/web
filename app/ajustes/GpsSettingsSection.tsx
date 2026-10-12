"use client";

import React, { useState, useMemo } from "react";
import {
  BASE_GPS_VARIABLES,
  GpsVariableDef,
  GpsDerivedVariable,
  useFavoriteGpsVariables,
  DEFAULT_FAVORITE_GPS_VARIABLES,
} from "@/app/lib/gpsVariables";

export default function GpsSettingsSection() {
  const {
    favoriteKeys,
    favoriteVariables,
    derivedVariables,
    allVariables,
    updateFavorites,
    toggleFavorite,
    addDerivedVariable,
    deleteDerivedVariable,
    resetToDefaults,
  } = useFavoriteGpsVariables();

  const [activeSubTab, setActiveSubTab] = useState<"favoritas" | "derivadas">("favoritas");

  // Estados para favoritas
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todas");
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Estados para crear variable derivada (2, 3 o más variables)
  const [derLabel, setDerLabel] = useState("");
  const [derShortLabel, setDerShortLabel] = useState("");
  const [derUnit, setDerUnit] = useState("nº");
  const [derVariables, setDerVariables] = useState<string[]>([
    "Accs Count",
    "Decs Count",
    "Sprints Count", // 3 variables de inicio
  ]);
  const [derOp, setDerOp] = useState<"suma" | "resta" | "ratio">("suma");
  const [derDesc, setDerDesc] = useState("");

  const triggerFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3200);
  };

  const categories = useMemo(() => {
    const cats = Array.from(new Set(allVariables.map((v) => v.categoria)));
    return ["Todas", ...cats];
  }, [allVariables]);

  const filteredVariables = useMemo(() => {
    return allVariables.filter((v) => {
      const matchCat = selectedCategory === "Todas" || v.categoria === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        v.label.toLowerCase().includes(q) ||
        v.key.toLowerCase().includes(q) ||
        (v.shortLabel && v.shortLabel.toLowerCase().includes(q)) ||
        (v.descripcion && v.descripcion.toLowerCase().includes(q)) ||
        v.unit.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [allVariables, selectedCategory, searchQuery]);

  const handleSelectAllVisible = () => {
    const keysToAdd = filteredVariables.map((v) => v.key);
    const set = new Set([...favoriteKeys, ...keysToAdd]);
    updateFavorites(Array.from(set));
    triggerFeedback("Variables visibles añadidas a favoritas");
  };

  const handleDeselectAllVisible = () => {
    const keysToRemove = new Set(filteredVariables.map((v) => v.key));
    const remaining = favoriteKeys.filter((k) => !keysToRemove.has(k));
    updateFavorites(remaining.length > 0 ? remaining : [DEFAULT_FAVORITE_GPS_VARIABLES[0]]);
    triggerFeedback("Variables visibles desmarcadas");
  };

  // Manejo de la lista dinámica de variables a sumar
  const handleAddVariableSlot = () => {
    if (derVariables.length >= 6) {
      alert("Puedes sumar hasta un máximo de 6 variables");
      return;
    }
    const defaultNext = BASE_GPS_VARIABLES[derVariables.length % BASE_GPS_VARIABLES.length].key;
    setDerVariables([...derVariables, defaultNext]);
  };

  const handleRemoveVariableSlot = (index: number) => {
    if (derVariables.length <= 2) {
      alert("Debes mantener al menos 2 variables para realizar una suma o cálculo");
      return;
    }
    setDerVariables(derVariables.filter((_, i) => i !== index));
  };

  const handleChangeVariableSlot = (index: number, newKey: string) => {
    const next = [...derVariables];
    next[index] = newKey;
    setDerVariables(next);
  };

  const handleCreateDerived = (e: React.FormEvent) => {
    e.preventDefault();
    if (!derLabel.trim()) {
      alert("Por favor indica un nombre para la variable derivada");
      return;
    }

    const cleanVars = derVariables.filter((k) => Boolean(k && k.trim()));
    if (cleanVars.length < 2) {
      alert("Por favor selecciona al menos 2 variables");
      return;
    }

    const varLabels = cleanVars
      .map((k) => {
        const found = allVariables.find((v) => v.key === k);
        return found ? found.label : k;
      })
      .join(derOp === "suma" ? " + " : derOp === "resta" ? " - " : " / ");

    const created = addDerivedVariable({
      label: derLabel.trim(),
      shortLabel: derShortLabel.trim() || derLabel.trim(),
      unit: derUnit.trim() || "m",
      operacion: derOp,
      variables: cleanVars,
      varA: cleanVars[0],
      varB: cleanVars[1],
      descripcion: derDesc.trim() || `Cálculo: ${varLabels}`,
    });

    triggerFeedback(`Variable derivada "${created.label}" (${cleanVars.length} variables) creada y guardada en tus favoritas`);

    // Reset formulario
    setDerLabel("");
    setDerShortLabel("");
    setDerDesc("");
  };

  const handleCreatePreset = (preset: {
    label: string;
    shortLabel: string;
    unit: string;
    operacion: "suma" | "resta" | "ratio";
    variables: string[];
    desc: string;
  }) => {
    const created = addDerivedVariable({
      label: preset.label,
      shortLabel: preset.shortLabel,
      unit: preset.unit,
      operacion: preset.operacion,
      variables: preset.variables,
      varA: preset.variables[0],
      varB: preset.variables[1],
      descripcion: preset.desc,
    });
    triggerFeedback(`Variable derivada "${created.label}" añadida a favoritas`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* HEADER DE LA SECCIÓN */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          padding: "22px 24px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "24px" }}>🛰️</span>
              <h2 style={{ fontSize: "18px", fontWeight: 900, color: "#1e3a8a", margin: 0 }}>
                Configuración GPS: Variables Favoritas y Derivadas (Suma de 2, 3 o más variables)
              </h2>
            </div>
            <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#64748b", maxWidth: "800px", lineHeight: "1.5" }}>
              Selecciona tus métricas favoritas para filtrarlas en los informes sin perderte entre las más de 50 disponibles,
              y crea variables derivadas sumando 2, 3 o más métricas de la base de datos (ej. Z4 + Z5 + Z6, o Aceleraciones + Desaceleraciones + Sprints).
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "20px",
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                color: "#1e3a8a",
                fontSize: "12px",
                fontWeight: 800,
              }}
            >
              ⭐ {favoriteKeys.length} Favoritas
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "20px",
                background: "#f8fafc",
                border: "1px solid #cbd5e1",
                color: "#475569",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              ➕ {derivedVariables.length} Derivadas
            </span>
          </div>
        </div>

        {/* FEEDBACK TOAST */}
        {feedbackMsg && (
          <div
            style={{
              marginTop: "14px",
              padding: "10px 16px",
              borderRadius: "8px",
              background: "#dcfce7",
              border: "1px solid #86efac",
              color: "#15803d",
              fontSize: "13px",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>✓</span> {feedbackMsg}
          </div>
        )}

        {/* PESTAÑAS INTERNAS DE LA SECCIÓN GPS */}
        <div style={{ display: "flex", gap: "10px", marginTop: "18px", borderTop: "1px solid #e2e8f0", paddingTop: "14px" }}>
          <button
            type="button"
            onClick={() => setActiveSubTab("favoritas")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 800,
              border: activeSubTab === "favoritas" ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
              background: activeSubTab === "favoritas" ? "#1e3a8a" : "#f8fafc",
              color: activeSubTab === "favoritas" ? "#ffffff" : "#475569",
              cursor: "pointer",
            }}
          >
            ⭐ Mis Variables Favoritas ({favoriteKeys.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("derivadas")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 800,
              border: activeSubTab === "derivadas" ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
              background: activeSubTab === "derivadas" ? "#1e3a8a" : "#f8fafc",
              color: activeSubTab === "derivadas" ? "#ffffff" : "#475569",
              cursor: "pointer",
            }}
          >
            ➕ Variables Derivadas / Suma de 2 o 3 variables ({derivedVariables.length})
          </button>
        </div>
      </div>

      {/* CONTENIDO 1: VARIABLES FAVORITAS */}
      {activeSubTab === "favoritas" && (
        <>
          {/* BARRA SUPERIOR DE FAVORITAS ACTIVAS */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "18px 24px",
              border: "1px solid #cbd5e1",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
              <span style={{ fontSize: "12.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: "#1e3a8a" }}>
                ⭐ Variables Favoritas activas para tus Informes ({favoriteVariables.length}):
              </span>
              <button
                type="button"
                onClick={() => {
                  resetToDefaults();
                  triggerFeedback("Restablecidas las 8 variables recomendadas");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#2563eb",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: 0,
                }}
              >
                Restablecer las 8 recomendadas
              </button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {favoriteVariables.map((v) => (
                <span
                  key={v.key}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "5px 12px",
                    borderRadius: "20px",
                    background: v.esDerivada ? "#059669" : "#1e3a8a",
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 700,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                  }}
                >
                  {v.esDerivada && <span title="Variable derivada calculada">➕</span>}
                  <span>{v.label}</span>
                  <span style={{ opacity: 0.8, fontSize: "10.5px" }}>({v.unit})</span>
                  <button
                    type="button"
                    onClick={() => {
                      toggleFavorite(v.key);
                      triggerFeedback(`Quitada ${v.label} de favoritas`);
                    }}
                    title="Quitar de favoritas"
                    style={{
                      background: "rgba(255,255,255,0.25)",
                      border: "none",
                      borderRadius: "50%",
                      width: "16px",
                      height: "16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#ffffff",
                      fontSize: "10px",
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* BUSCADOR Y CATEGORÍAS */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "16px 20px",
              border: "1px solid #cbd5e1",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: "220px", position: "relative" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: "#94a3b8" }}>
                  🔍
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar variable por nombre, unidad o código..."
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 34px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  style={{
                    padding: "7px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    color: "#1e293b",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  + Marcar visibles
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllVisible}
                  style={{
                    padding: "7px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    color: "#64748b",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  - Desmarcar visibles
                </button>
              </div>
            </div>

            {/* Categorías */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {categories.map((cat) => {
                const isActive = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "16px",
                      fontSize: "11.5px",
                      fontWeight: isActive ? 800 : 600,
                      border: isActive ? "1px solid #1e3a8a" : "1px solid #e2e8f0",
                      background: isActive ? "#1e3a8a" : "#f8fafc",
                      color: isActive ? "#ffffff" : "#475569",
                      cursor: "pointer",
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* GRID DE VARIABLES */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
              gap: "12px",
            }}
          >
            {filteredVariables.map((v) => {
              const isFav = favoriteKeys.includes(v.key);
              return (
                <div
                  key={v.key}
                  onClick={() => {
                    toggleFavorite(v.key);
                    triggerFeedback(isFav ? `Quitada ${v.label}` : `Añadida ${v.label} a favoritas`);
                  }}
                  style={{
                    borderRadius: "10px",
                    border: isFav ? "2px solid #2563eb" : "1px solid #cbd5e1",
                    background: isFav ? "#eff6ff" : "#ffffff",
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="checkbox"
                        checked={isFav}
                        readOnly
                        style={{
                          width: "18px",
                          height: "18px",
                          cursor: "pointer",
                          accentColor: "#1e3a8a",
                        }}
                      />
                      <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 800, color: isFav ? "#1e3a8a" : "#1e293b" }}>
                        {v.label}
                      </h4>
                    </div>

                    <span
                      style={{
                        padding: "2px 7px",
                        borderRadius: "5px",
                        fontSize: "11px",
                        fontWeight: 800,
                        background: isFav ? "#dbeafe" : "#f1f5f9",
                        color: isFav ? "#1e40af" : "#475569",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {v.unit}
                    </span>
                  </div>

                  {v.descripcion && (
                    <p style={{ margin: 0, fontSize: "11.5px", color: "#64748b", lineHeight: "1.4" }}>
                      {v.descripcion}
                    </p>
                  )}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: "4px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", fontFamily: "monospace" }}>
                      {v.key}
                    </span>

                    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                      {v.esDerivada && (
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "9.5px",
                            fontWeight: 800,
                            background: "#d1fae5",
                            color: "#065f46",
                          }}
                        >
                          ➕ Derivada
                        </span>
                      )}
                      {v.esPicoMaximo && (
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "9.5px",
                            fontWeight: 800,
                            background: "#fef3c7",
                            color: "#92400e",
                          }}
                          title="Valor pico que no se suma entre tareas"
                        >
                          ⚡ Pico Máx
                        </span>
                      )}
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: 700,
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          color: "#64748b",
                        }}
                      >
                        {v.categoria}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* CONTENIDO 2: VARIABLES DERIVADAS / CALCULADAS (Soporta 2, 3 o más variables) */}
      {activeSubTab === "derivadas" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* PLANTILLAS RÁPIDAS DE 1 CLIC (INCLUYENDO DE 3 VARIABLES) */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "18px 22px",
              border: "1px solid #cbd5e1",
            }}
          >
            <h3 style={{ fontSize: "14px", fontWeight: 900, color: "#1e3a8a", margin: "0 0 10px 0" }}>
              ⚡ Plantillas Sugeridas de Variables Derivadas (Haz clic para añadir a favoritas):
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button
                type="button"
                onClick={() =>
                  handleCreatePreset({
                    label: "Alta Intensidad Total (Z4 + Z5 + Z6)",
                    shortLabel: "Z4+Z5+Z6",
                    unit: "m",
                    operacion: "suma",
                    variables: [
                      "19,8 - 21 km/h (Distancia)",
                      "21 - 24 km/h (Distancia)",
                      "+ 24 km/h (Distancia)",
                    ],
                    desc: "Suma de 3 variables: Metros en Z4 (19,8-21), Z5 (21-24) y Sprint (+24 km/h)",
                  })
                }
                style={{
                  padding: "7px 12px",
                  borderRadius: "8px",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  color: "#1e3a8a",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                + Alta Intensidad Total (3 variables: Z4 + Z5 + Z6)
              </button>

              <button
                type="button"
                onClick={() =>
                  handleCreatePreset({
                    label: "Acc + Dec + Sprints (Total Acciones Explosivas)",
                    shortLabel: "Acc+Dec+Sp",
                    unit: "nº",
                    operacion: "suma",
                    variables: ["Accs Count", "Decs Count", "Sprints Count"],
                    desc: "Suma de 3 variables: Aceleraciones + Desaceleraciones + Sprints realizados",
                  })
                }
                style={{
                  padding: "7px 12px",
                  borderRadius: "8px",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  color: "#1e3a8a",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                + Acc + Dec + Sprints (3 variables explosivas)
              </button>

              <button
                type="button"
                onClick={() =>
                  handleCreatePreset({
                    label: "Acc + Dec (+3 m/s²)",
                    shortLabel: "Acc+Dec >3",
                    unit: "nº",
                    operacion: "suma",
                    variables: ["Accs Count", "Decs Count"],
                    desc: "Suma de 2 variables: Aceleraciones + Desaceleraciones > 3 m/s²",
                  })
                }
                style={{
                  padding: "7px 12px",
                  borderRadius: "8px",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  color: "#1e3a8a",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                + Acc + Dec (+3 m/s²)
              </button>

              <button
                type="button"
                onClick={() =>
                  handleCreatePreset({
                    label: "Distancia Z5 + Z6 (>21 km/h)",
                    shortLabel: "Z5+Z6",
                    unit: "m",
                    operacion: "suma",
                    variables: ["21 - 24 km/h (Distancia)", "+ 24 km/h (Distancia)"],
                    desc: "Suma de 2 variables: Metros en Z5 (21-24 km/h) + Sprint Z6 (+24 km/h)",
                  })
                }
                style={{
                  padding: "7px 12px",
                  borderRadius: "8px",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  color: "#1e3a8a",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                + Distancia Z5 + Z6 (&gt;21 km/h)
              </button>
            </div>
          </div>

          {/* FORMULARIO DINÁMICO DE CREACIÓN (SUMA DE 2, 3 O MÁS VARIABLES) */}
          <form
            onSubmit={handleCreateDerived}
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px 24px",
              border: "1px solid #cbd5e1",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 900, color: "#1e3a8a", margin: 0 }}>
                🛠️ Crear Variable Derivada (Sumar 2, 3 o más variables)
              </h3>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#0284c7" }}>
                Actualmente sumando: {derVariables.length} variables
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                  Nombre de la Variable
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Z4 + Z5 + Z6 (Alta Velocidad Total)"
                  value={derLabel}
                  onChange={(e) => setDerLabel(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                  Nombre Corto (para tablas / gráficos)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Z4+Z5+Z6"
                  value={derShortLabel}
                  onChange={(e) => setDerShortLabel(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                  Unidad de Medida
                </label>
                <select
                  value={derUnit}
                  onChange={(e) => setDerUnit(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                  }}
                >
                  <option value="m">m (metros)</option>
                  <option value="nº">nº (recuento)</option>
                  <option value="km/h">km/h</option>
                  <option value="m/min">m/min</option>
                  <option value="min">min (minutos)</option>
                  <option value="s">s (segundos)</option>
                  <option value="au">au (unidades arbitrarias)</option>
                  <option value="%">% (porcentaje)</option>
                </select>
              </div>
            </div>

            {/* LISTA INTERACTIVA DE VARIABLES A SUMAR */}
            <div
              style={{
                background: "#f8fafc",
                padding: "16px",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#1e3a8a" }}>
                  Variables a combinar con suma (+) :
                </span>
                <button
                  type="button"
                  onClick={handleAddVariableSlot}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    color: "#1e40af",
                    fontSize: "11.5px",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  ➕ Añadir otra variable (+ Variable {derVariables.length + 1})
                </button>
              </div>

              {derVariables.map((vKey, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    alignItems: "center",
                    gap: "10px",
                    background: "#ffffff",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                  }}
                >
                  <span
                    style={{
                      width: "85px",
                      fontSize: "12px",
                      fontWeight: 800,
                      color: "#1e3a8a",
                    }}
                  >
                    {idx === 0 ? "Variable 1:" : idx === 1 ? "➕ Variable 2:" : idx === 2 ? "➕ Variable 3:" : `➕ Variable ${idx + 1}:`}
                  </span>

                  <select
                    value={vKey}
                    onChange={(e) => handleChangeVariableSlot(idx, e.target.value)}
                    style={{
                      width: "100%",
                      padding: "7px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12.5px",
                      fontWeight: 600,
                    }}
                  >
                    {BASE_GPS_VARIABLES.map((v) => (
                      <option key={v.key} value={v.key}>
                        {v.label} ({v.unit}) — [{v.categoria}]
                      </option>
                    ))}
                  </select>

                  {derVariables.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveVariableSlot(idx)}
                      title="Eliminar esta variable de la suma"
                      style={{
                        padding: "4px 8px",
                        borderRadius: "6px",
                        background: "#fee2e2",
                        border: "1px solid #fecaca",
                        color: "#b91c1c",
                        fontSize: "11px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                Descripción o Notas (opcional)
              </label>
              <input
                type="text"
                placeholder="Explicación de qué suma esta variable..."
                value={derDesc}
                onChange={(e) => setDerDesc(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "6px" }}>
              <button
                type="submit"
                style={{
                  padding: "10px 22px",
                  borderRadius: "8px",
                  background: "#1e3a8a",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 900,
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 2px 6px rgba(30, 58, 138, 0.25)",
                }}
              >
                <span>➕</span> Crear Suma de {derVariables.length} Variables y Guardar
              </button>
            </div>
          </form>

          {/* LISTA DE VARIABLES DERIVADAS CREADAS */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px 24px",
              border: "1px solid #cbd5e1",
            }}
          >
            <h3 style={{ fontSize: "15px", fontWeight: 900, color: "#1e3a8a", margin: "0 0 14px 0" }}>
              📋 Tus Variables Derivadas Creadas ({derivedVariables.length})
            </h3>

            {derivedVariables.length === 0 ? (
              <p style={{ fontSize: "13px", color: "#64748b", margin: 0, fontStyle: "italic" }}>
                Aún no has creado ninguna variable derivada. Puedes usar las plantillas de arriba o el formulario para sumar 2, 3 o más variables.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {derivedVariables.map((d) => {
                  const isFav = favoriteKeys.includes(d.id);
                  const varKeys = d.variables && Array.isArray(d.variables) && d.variables.length > 0
                    ? d.variables
                    : [d.varA, d.varB, d.varC].filter(Boolean) as string[];

                  const varLabels = varKeys
                    .map((k) => {
                      const found = BASE_GPS_VARIABLES.find((v) => v.key === k);
                      return found ? found.label : k;
                    })
                    .join(" + ");

                  return (
                    <div
                      key={d.id}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "12px",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "14px", fontWeight: 900, color: "#0f172a" }}>{d.label}</span>
                          <span style={{ padding: "2px 6px", borderRadius: "4px", background: "#dbeafe", color: "#1e40af", fontSize: "11px", fontWeight: 800 }}>
                            {d.unit}
                          </span>
                          <span style={{ padding: "2px 6px", borderRadius: "4px", background: "#e0e7ff", color: "#3730a3", fontSize: "10.5px", fontWeight: 700 }}>
                            {varKeys.length} variables sumadas
                          </span>
                        </div>
                        <span style={{ fontSize: "12px", color: "#475569", fontWeight: 600 }}>
                          Fórmula: <strong>{varLabels}</strong>
                        </span>
                        {d.descripcion && (
                          <span style={{ fontSize: "11.5px", color: "#64748b" }}>{d.descripcion}</span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <button
                          type="button"
                          onClick={() => {
                            toggleFavorite(d.id);
                            triggerFeedback(isFav ? `Quitada de favoritas` : `Añadida a favoritas`);
                          }}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "6px",
                            border: isFav ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
                            background: isFav ? "#1e3a8a" : "#ffffff",
                            color: isFav ? "#ffffff" : "#475569",
                            fontSize: "12px",
                            fontWeight: 800,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          {isFav ? "⭐ En Favoritas" : "☆ Marcar Favorita"}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`¿Eliminar la variable derivada "${d.label}"?`)) {
                              deleteDerivedVariable(d.id);
                              triggerFeedback("Variable derivada eliminada");
                            }
                          }}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "6px",
                            border: "1px solid #fecaca",
                            background: "#fee2e2",
                            color: "#dc2626",
                            fontSize: "12px",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                          title="Eliminar variable derivada"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
