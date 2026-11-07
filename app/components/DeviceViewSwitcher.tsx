"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";

export type DeviceMode = "auto" | "mobile" | "tablet" | "desktop";
export type ZoomLevel = "85" | "100" | "115";

export const STORAGE_KEY_MODE = "app_device_view_mode";
export const STORAGE_KEY_ZOOM = "app_device_zoom_level";
export const STORAGE_KEY_HIDDEN = "app_device_switcher_hidden";

export function resolveEffectiveDeviceMode(pref: DeviceMode): "mobile" | "tablet" | "desktop" {
  if (pref !== "auto") return pref;
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth || document.documentElement.clientWidth || screen.width;
  if (w < 768) return "mobile";
  if (w <= 1024) return "tablet";
  return "desktop";
}

export function applyDeviceMode(pref: DeviceMode, zoom: ZoomLevel = "100") {
  if (typeof document === "undefined") return;
  const resolved = resolveEffectiveDeviceMode(pref);

  document.documentElement.setAttribute("data-device-mode", resolved);
  document.documentElement.setAttribute("data-user-mode-preference", pref);

  const zoomFactor = parseInt(zoom, 10) / 100;
  document.documentElement.style.setProperty("--app-user-zoom", String(zoomFactor));

  // Notificar a toda la aplicación
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("device_view_mode_changed", {
        detail: { mode: pref, resolved, zoom },
      })
    );
  }
}

export default function DeviceViewSwitcher() {
  const [prefMode, setPrefMode] = useState<DeviceMode>("auto");
  const [effectiveMode, setEffectiveMode] = useState<"mobile" | "tablet" | "desktop">("desktop");
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("100");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isHidden, setIsHidden] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Inicialización y escucha de eventos
  useEffect(() => {
    setIsMounted(true);
    const savedMode = (localStorage.getItem(STORAGE_KEY_MODE) as DeviceMode) || "auto";
    const savedZoom = (localStorage.getItem(STORAGE_KEY_ZOOM) as ZoomLevel) || "100";
    const savedHidden = localStorage.getItem(STORAGE_KEY_HIDDEN) === "true";

    setPrefMode(savedMode);
    setZoomLevel(savedZoom);
    setIsHidden(savedHidden);

    const resolved = resolveEffectiveDeviceMode(savedMode);
    setEffectiveMode(resolved);
    applyDeviceMode(savedMode, savedZoom);

    // Escuchar redimensionamiento cuando esté en modo auto
    const handleResize = () => {
      const currentPref = (localStorage.getItem(STORAGE_KEY_MODE) as DeviceMode) || "auto";
      if (currentPref === "auto") {
        const nextResolved = resolveEffectiveDeviceMode("auto");
        setEffectiveMode(nextResolved);
        applyDeviceMode("auto", (localStorage.getItem(STORAGE_KEY_ZOOM) as ZoomLevel) || "100");
      }
    };

    // Escuchar cambios desde otras pestañas o desde la página de Ajustes
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_MODE || e.key === STORAGE_KEY_ZOOM || e.key === STORAGE_KEY_HIDDEN) {
        const m = (localStorage.getItem(STORAGE_KEY_MODE) as DeviceMode) || "auto";
        const z = (localStorage.getItem(STORAGE_KEY_ZOOM) as ZoomLevel) || "100";
        const h = localStorage.getItem(STORAGE_KEY_HIDDEN) === "true";
        setPrefMode(m);
        setZoomLevel(z);
        setIsHidden(h);
        setEffectiveMode(resolveEffectiveDeviceMode(m));
        applyDeviceMode(m, z);
      }
    };

    const handleCustomChange = (e: any) => {
      if (e.detail) {
        if (e.detail.mode) setPrefMode(e.detail.mode);
        if (e.detail.resolved) setEffectiveMode(e.detail.resolved);
        if (e.detail.zoom) setZoomLevel(e.detail.zoom);
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("device_view_mode_changed", handleCustomChange);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("device_view_mode_changed", handleCustomChange);
    };
  }, []);

  const selectMode = useCallback(
    (newMode: DeviceMode) => {
      setPrefMode(newMode);
      localStorage.setItem(STORAGE_KEY_MODE, newMode);
      const resolved = resolveEffectiveDeviceMode(newMode);
      setEffectiveMode(resolved);
      applyDeviceMode(newMode, zoomLevel);
    },
    [zoomLevel]
  );

  const selectZoom = useCallback(
    (newZoom: ZoomLevel) => {
      setZoomLevel(newZoom);
      localStorage.setItem(STORAGE_KEY_ZOOM, newZoom);
      applyDeviceMode(prefMode, newZoom);
    },
    [prefMode]
  );

  if (!isMounted) return null;
  if (isHidden) return null;

  const modeIcons: Record<string, string> = {
    mobile: "📱",
    tablet: "📟",
    desktop: "💻",
    auto: "🔄",
  };

  const modeLabels: Record<string, string> = {
    mobile: "Móvil",
    tablet: "Tablet",
    desktop: "Ordenador",
    auto: `Auto (${effectiveMode === "mobile" ? "Móvil" : effectiveMode === "tablet" ? "Tablet" : "PC"})`,
  };

  return (
    <>
      {/* Botón flotante accesible en todas las pantallas */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          bottom: "16px",
          right: "16px",
          zIndex: 99999,
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title={`Vista actual: ${modeLabels[prefMode]}. Pulsa para cambiar entre Móvil, Tablet y Ordenador.`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            color: "#ffffff",
            padding: "8px 14px",
            borderRadius: "30px",
            border: "1px solid rgba(255,255,255,0.22)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 800,
            transition: "all 0.15s ease",
            outline: "none",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.04)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1.0)")}
        >
          <span style={{ fontSize: "15px" }}>{modeIcons[prefMode]}</span>
          <span style={{ letterSpacing: "0.02em" }}>{modeLabels[prefMode]}</span>
          <span style={{ opacity: 0.6, fontSize: "9px" }}>▼</span>
        </button>
      </div>

      {/* Modal / Selector de Dispositivo */}
      {isOpen && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100000,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
              maxWidth: "460px",
              width: "100%",
              maxHeight: "92vh",
              overflowY: "auto",
              padding: "22px 20px",
              position: "relative",
              border: "1px solid #e2e8f0",
              animation: "fadeInUp 0.18s ease-out",
            }}
          >
            {/* Cabecera del modal */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
              <div>
                <span
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 900,
                    color: "#1e3a8a",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  DISPOSITIVO & ADAPTACIÓN
                </span>
                <h3 style={{ margin: "2px 0 0 0", fontSize: "18px", fontWeight: 900, color: "#0f172a" }}>
                  Elegir Versión de Pantalla
                </h3>
                <p style={{ margin: "4px 0 0 0", fontSize: "11.5px", color: "#64748b", lineHeight: 1.35 }}>
                  Esta preferencia se guarda <strong>exclusivamente en este dispositivo</strong>. Tu móvil, tablet y PC pueden tener versiones distintas a la vez.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  borderRadius: "8px",
                  width: "32px",
                  height: "32px",
                  fontSize: "14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748b",
                  fontWeight: 800,
                }}
              >
                ✕
              </button>
            </div>

            {/* Opciones de Modos */}
            <div style={{ display: "flex", flexDirection: "column", gap: "9px", marginBottom: "18px" }}>
              {/* Opción 1: Móvil */}
              <button
                type="button"
                onClick={() => selectMode("mobile")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "11px 14px",
                  borderRadius: "12px",
                  border: prefMode === "mobile" ? "2px solid #2563eb" : "1px solid #cbd5e1",
                  background: prefMode === "mobile" ? "#eff6ff" : "#f8fafc",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
              >
                <span style={{ fontSize: "26px" }}>📱</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <strong style={{ fontSize: "14px", color: prefMode === "mobile" ? "#1e40af" : "#0f172a" }}>
                      Versión Móvil
                    </strong>
                    {prefMode === "mobile" && (
                      <span style={{ fontSize: "11px", fontWeight: 800, color: "#2563eb", background: "#dbeafe", padding: "2px 8px", borderRadius: "10px" }}>
                        Activo
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: "11px", color: "#64748b", display: "block", marginTop: "2px" }}>
                    Menú táctil deslizable, tarjetas en 1 columna, botones ampliados y scroll fluido en matrices.
                  </span>
                </div>
              </button>

              {/* Opción 2: Tablet */}
              <button
                type="button"
                onClick={() => selectMode("tablet")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "11px 14px",
                  borderRadius: "12px",
                  border: prefMode === "tablet" ? "2px solid #2563eb" : "1px solid #cbd5e1",
                  background: prefMode === "tablet" ? "#eff6ff" : "#f8fafc",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
              >
                <span style={{ fontSize: "26px" }}>📟</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <strong style={{ fontSize: "14px", color: prefMode === "tablet" ? "#1e40af" : "#0f172a" }}>
                      Versión Tablet (iPad)
                    </strong>
                    {prefMode === "tablet" && (
                      <span style={{ fontSize: "11px", fontWeight: 800, color: "#2563eb", background: "#dbeafe", padding: "2px 8px", borderRadius: "10px" }}>
                        Activo
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: "11px", color: "#64748b", display: "block", marginTop: "2px" }}>
                    Diseño equilibrado a 2 columnas, barra compacta, tablas proporcionales para dedos y Apple Pencil.
                  </span>
                </div>
              </button>

              {/* Opción 3: Ordenador */}
              <button
                type="button"
                onClick={() => selectMode("desktop")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "11px 14px",
                  borderRadius: "12px",
                  border: prefMode === "desktop" ? "2px solid #2563eb" : "1px solid #cbd5e1",
                  background: prefMode === "desktop" ? "#eff6ff" : "#f8fafc",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
              >
                <span style={{ fontSize: "26px" }}>💻</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <strong style={{ fontSize: "14px", color: prefMode === "desktop" ? "#1e40af" : "#0f172a" }}>
                      Versión Ordenador (Escritorio)
                    </strong>
                    {prefMode === "desktop" && (
                      <span style={{ fontSize: "11px", fontWeight: 800, color: "#2563eb", background: "#dbeafe", padding: "2px 8px", borderRadius: "10px" }}>
                        Activo
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: "11px", color: "#64748b", display: "block", marginTop: "2px" }}>
                    Vista completa de alta densidad. Barra lateral fija y tablas de planificación y gimnasio extendidas.
                  </span>
                </div>
              </button>

              {/* Opción 4: Automático */}
              <button
                type="button"
                onClick={() => selectMode("auto")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "11px 14px",
                  borderRadius: "12px",
                  border: prefMode === "auto" ? "2px solid #059669" : "1px solid #cbd5e1",
                  background: prefMode === "auto" ? "#ecfdf5" : "#f8fafc",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
              >
                <span style={{ fontSize: "26px" }}>🔄</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <strong style={{ fontSize: "14px", color: prefMode === "auto" ? "#047857" : "#0f172a" }}>
                      Modo Automático
                    </strong>
                    {prefMode === "auto" && (
                      <span style={{ fontSize: "11px", fontWeight: 800, color: "#059669", background: "#d1fae5", padding: "2px 8px", borderRadius: "10px" }}>
                        Activo ({modeLabels[effectiveMode]})
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: "11px", color: "#64748b", display: "block", marginTop: "2px" }}>
                    Detecta automáticamente el ancho de la pantalla y se adapta si rotas la tablet o el móvil.
                  </span>
                </div>
              </button>
            </div>

            {/* Selector de Zoom / Escala de tamaño */}
            <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "10px 12px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569" }}>
                  🔍 Tamaño de Contenido / Escala:
                </span>
                <span style={{ fontSize: "11px", fontWeight: 900, color: "#1e3a8a" }}>
                  {zoomLevel}%
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => selectZoom("85")}
                  style={{
                    padding: "6px 8px",
                    borderRadius: "6px",
                    border: zoomLevel === "85" ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
                    background: zoomLevel === "85" ? "#1e3a8a" : "#ffffff",
                    color: zoomLevel === "85" ? "#ffffff" : "#475569",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  85% Compacto
                </button>
                <button
                  type="button"
                  onClick={() => selectZoom("100")}
                  style={{
                    padding: "6px 8px",
                    borderRadius: "6px",
                    border: zoomLevel === "100" ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
                    background: zoomLevel === "100" ? "#1e3a8a" : "#ffffff",
                    color: zoomLevel === "100" ? "#ffffff" : "#475569",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  100% Normal
                </button>
                <button
                  type="button"
                  onClick={() => selectZoom("115")}
                  style={{
                    padding: "6px 8px",
                    borderRadius: "6px",
                    border: zoomLevel === "115" ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
                    background: zoomLevel === "115" ? "#1e3a8a" : "#ffffff",
                    color: zoomLevel === "115" ? "#ffffff" : "#475569",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  115% Grande
                </button>
              </div>
            </div>

            {/* Pie del modal con enlace a ajustes y botón cerrar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
              <Link
                href="/ajustes"
                onClick={() => setIsOpen(false)}
                style={{
                  fontSize: "11.5px",
                  fontWeight: 800,
                  color: "#1e3a8a",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                ⚙️ Ir a Ajustes Completos
              </Link>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  padding: "7px 18px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#0f172a",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

