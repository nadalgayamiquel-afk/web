"use client";

import React, { useEffect } from "react";
import { getVideoEmbedInfo } from "./campo-video-utils";

interface VideoPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl?: string | null;
  title: string;
  categoryLabel?: string;
}

export default function VideoPlayerModal({
  isOpen,
  onClose,
  videoUrl,
  title,
  categoryLabel,
}: VideoPlayerModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !videoUrl) return null;

  const info = getVideoEmbedInfo(videoUrl);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 15, 30, 0.85)",
        backdropFilter: "blur(8px)",
        zIndex: 10000,
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
          maxWidth: "920px",
          background: "#0f172a",
          borderRadius: "16px",
          border: "1px solid #334155",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.6)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* CABECERA DEL REPRODUCTOR */}
        <div
          style={{
            padding: "14px 20px",
            background: "#1e293b",
            borderBottom: "1px solid #334155",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
            <span
              style={{
                background: "linear-gradient(135deg, #ef4444, #dc2626)",
                color: "#ffffff",
                padding: "4px 8px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 900,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
              }}
            >
              ▶️ {info?.providerLabel || "Vídeo"}
            </span>
            <div style={{ minWidth: 0 }}>
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 800,
                  color: "#f8fafc",
                  margin: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {title}
              </h3>
              {categoryLabel && (
                <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600 }}>
                  {categoryLabel}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#93c5fd",
                fontSize: "12px",
                fontWeight: 700,
                textDecoration: "none",
                background: "rgba(59, 130, 246, 0.15)",
                padding: "6px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span>Abrir en navegador</span>
              <span>↗</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "#334155",
                color: "#f1f5f9",
                border: "none",
                borderRadius: "8px",
                width: "32px",
                height: "32px",
                display: "grid",
                placeItems: "center",
                fontSize: "14px",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ZONA DEL REPRODUCTOR (16:9) */}
        <div
          style={{
            position: "relative",
            width: "100%",
            paddingTop: "56.25%", // 16:9 Aspect Ratio
            background: "#020617",
          }}
        >
          {info?.isDirectVideo ? (
            <video
              src={info.embedUrl}
              controls
              autoPlay
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
          ) : info?.isEmbeddable ? (
            <iframe
              src={info.embedUrl}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                border: "none",
              }}
            />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
                textAlign: "center",
                color: "#cbd5e1",
              }}
            >
              <div style={{ fontSize: "42px", marginBottom: "12px" }}>🌐</div>
              <h4 style={{ fontSize: "16px", fontWeight: 800, margin: "0 0 6px 0", color: "#f8fafc" }}>
                Reproducción Externa
              </h4>
              <p style={{ fontSize: "13px", color: "#94a3b8", maxWidth: "460px", marginBottom: "16px" }}>
                Este enlace proviene de un origen que no permite incrustación directa en iframe. Puedes abrirlo directamente en tu navegador.
              </p>
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "#0284c7",
                  color: "#ffffff",
                  padding: "10px 20px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 800,
                  textDecoration: "none",
                }}
              >
                Abrir Vídeo en Pestaña Nueva ↗
              </a>
            </div>
          )}
        </div>

        {/* PIE CON URL */}
        <div
          style={{
            padding: "10px 20px",
            background: "#0f172a",
            borderTop: "1px solid #1e293b",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "11px",
            color: "#64748b",
          }}
        >
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
            Enlace: <span style={{ color: "#94a3b8" }}>{videoUrl}</span>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <span style={{ color: "#38bdf8" }}>ESC</span> para cerrar
          </div>
        </div>
      </div>
    </div>
  );
}
