"use client";

import React from "react";
import {
  CampoDiagramaData,
  CampoPitchType,
  CampoPitchTheme,
  CampoElementoGrafico,
  CampoFreeDrawPath,
} from "./campo-types";

interface PitchGraphicViewProps {
  diagrama?: CampoDiagramaData;
  pitchTypeOverride?: CampoPitchType;
  themeOverride?: CampoPitchTheme;
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
  className?: string;
  readOnly?: boolean;
  selectedId?: string | null;
  onElementClick?: (el: CampoElementoGrafico) => void;
  showLabels?: boolean;
}

export default function PitchGraphicView({
  diagrama,
  pitchTypeOverride,
  themeOverride,
  width = "100%",
  height = "100%",
  style,
  selectedId,
  onElementClick,
  showLabels = true,
}: PitchGraphicViewProps) {
  const pitchType: CampoPitchType = pitchTypeOverride || diagrama?.pitchType || "medio_campo";
  const theme: CampoPitchTheme = themeOverride || diagrama?.pitchTheme || "real_turf";
  const elementos = diagrama?.elementos || [];
  const trazos = diagrama?.trazosLibres || [];
  const imageUrl = diagrama?.imageUrl;

  // Si hay imagen subida y está en modo imagen, mostrar la imagen
  if (imageUrl && (diagrama?.graphicMode === "uploaded_image" || !diagrama?.graphicMode)) {
    return (
      <div
        style={{
          width,
          height,
          position: "relative",
          background: "#0f172a",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...style,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Diseño Táctico del Ejercicio"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
          }}
        />
        {/* Si tiene trazos u elementos dibujados encima, superponer SVG */}
        {(elementos.length > 0 || trazos.length > 0) && (
          <svg
            viewBox="0 0 100 100"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            {elementos.map((el) => renderElement(el, selectedId, onElementClick, showLabels))}
          </svg>
        )}
      </div>
    );
  }

  // Configuración de colores según el tema del campo
  const isDark = theme === "dark_board";
  const isWhiteboard = theme === "whiteboard";
  const isZones = theme === "tactical_zones";

  const lineColor = isDark
    ? "rgba(255, 255, 255, 0.75)"
    : isWhiteboard
    ? "#1e3a8a"
    : "#ffffff";
  const lineOpacity = isDark ? 0.7 : isWhiteboard ? 0.9 : 0.85;

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        userSelect: "none",
        ...style,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      >
        <defs>
          {/* 1. PATRÓN DE CÉSPED RAYADO PROFESIONAL (ESTILO ESTADIO) */}
          <pattern id="turf_stripes_h" width="100" height="12.5" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="100" height="6.25" fill="#1b7337" />
            <rect x="0" y="6.25" width="100" height="6.25" fill="#16622e" />
          </pattern>

          {/* 2. PATRÓN RED DE PORTERÍA */}
          <pattern id="goal_net" width="1.8" height="1.8" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="1.8" height="1.8" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.25" />
          </pattern>

          {/* 3. PATRÓN TÉCNICO BLUEPRINT */}
          <pattern id="blueprint_grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="10" height="10" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="0.5" />
          </pattern>

          {/* 4. PATRÓN DARK GRID */}
          <pattern id="dark_analyst_grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="10" height="10" fill="#0b1320" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
          </pattern>

          {/* GRADIENTES PARA VOLUMEN Y SOMBRAS */}
          <radialGradient id="vignette" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="80%" stopColor="#000000" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
          </radialGradient>

          {/* GRADIENTE PARA CONOS */}
          <linearGradient id="cone_grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="50%" stopColor="#ea580c" />
            <stop offset="100%" stopColor="#9a3412" />
          </linearGradient>

          {/* SOMBRA SUAVE DE FICHAS */}
          <filter id="token_shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0.8" stdDeviation="0.8" floodColor="#000000" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* ── FONDO SEGÚN TEMA ── */}
        {isWhiteboard ? (
          <rect width="100" height="100" fill="url(#blueprint_grid)" />
        ) : isDark ? (
          <rect width="100" height="100" fill="url(#dark_analyst_grid)" />
        ) : (
          <>
            <rect width="100" height="100" fill="url(#turf_stripes_h)" />
            <rect width="100" height="100" fill="url(#vignette)" style={{ mixBlendMode: "multiply" }} />
          </>
        )}

        {/* ── ZONAS DE JUEGO DE POSICIÓN (SI ESTÁ ACTIVO) ── */}
        {(isZones || theme === "tactical_zones") && (
          <g stroke="rgba(255, 255, 255, 0.25)" strokeDasharray="1.5 1.5" strokeWidth="0.6" fill="none">
            {/* 5 Carriles Verticales */}
            <line x1="20" y1="3" x2="20" y2="97" />
            <line x1="38" y1="3" x2="38" y2="97" />
            <line x1="62" y1="3" x2="62" y2="97" />
            <line x1="80" y1="3" x2="80" y2="97" />
            {/* Tercios Horizontales */}
            <line x1="3" y1="35" x2="97" y2="35" />
            <line x1="3" y1="65" x2="97" y2="65" />
            {/* Sombreado sutil de medios espacios (half-spaces) */}
            <rect x="20" y="3" width="18" height="94" fill="rgba(250, 204, 21, 0.05)" />
            <rect x="62" y="3" width="18" height="94" fill="rgba(250, 204, 21, 0.05)" />
          </g>
        )}

        {/* ── LÍNEAS REGLAMENTARIAS DEL TERRENO DE JUEGO ── */}
        {renderPitchMarkings(pitchType, lineColor, lineOpacity)}

        {/* ── TRAZOS LIBRES REALIZADOS ── */}
        {trazos.map((tr) => {
          if (!tr.points || tr.points.length < 2) return null;
          const pathStr = tr.points.reduce((acc, p, idx) => `${acc} ${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`, "");
          return (
            <path
              key={tr.id}
              d={pathStr}
              fill="none"
              stroke={tr.color}
              strokeWidth={tr.width * 0.3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {/* ── ELEMENTOS TÁCTICOS ── */}
        {elementos.map((el) => renderElement(el, selectedId, onElementClick, showLabels))}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDERIZADO DE LÍNEAS SEGÚN EL TIPO DE CAMPO
// ─────────────────────────────────────────────────────────────────────────────
function renderPitchMarkings(type: CampoPitchType, strokeColor: string, opacity: number) {
  const commonProps = {
    stroke: strokeColor,
    strokeWidth: 2,
    strokeOpacity: opacity,
    fill: "none",
  };

  if (type === "completo_horizontal") {
    return (
      <g {...commonProps}>
        {/* Banda perimetral */}
        <rect x="3" y="3" width="94" height="94" rx="1.5" />
        {/* Línea divisoria */}
        <line x1="50" y1="3" x2="50" y2="97" />
        {/* Círculo central */}
        <circle cx="50" cy="50" r="12" />
        <circle cx="50" cy="50" r="0.9" fill={strokeColor} />
        {/* Área Grande Izquierda */}
        <rect x="3" y="24" width="16" height="52" />
        <rect x="3" y="36" width="6" height="28" />
        <circle cx="13" cy="50" r="0.9" fill={strokeColor} />
        <path d="M 19 40 A 10 10 0 0 1 19 60" />
        {/* Área Grande Derecha */}
        <rect x="81" y="24" width="16" height="52" />
        <rect x="91" y="36" width="6" height="28" />
        <circle cx="87" cy="50" r="0.9" fill={strokeColor} />
        <path d="M 81 40 A 10 10 0 0 0 81 60" />
        {/* Porterías exteriores */}
        <rect x="0.5" y="42" width="2.5" height="16" strokeDasharray="1.5 1.5" />
        <rect x="97" y="42" width="2.5" height="16" strokeDasharray="1.5 1.5" />
      </g>
    );
  }

  if (type === "completo_vertical") {
    return (
      <g {...commonProps}>
        <rect x="3" y="3" width="94" height="94" rx="1.5" />
        <line x1="3" y1="50" x2="97" y2="50" />
        <circle cx="50" cy="50" r="12" />
        <circle cx="50" cy="50" r="0.9" fill={strokeColor} />
        {/* Área arriba */}
        <rect x="24" y="3" width="52" height="16" />
        <rect x="36" y="3" width="28" height="6" />
        <circle cx="50" cy="13" r="0.9" fill={strokeColor} />
        <path d="M 40 19 A 10 10 0 0 0 60 19" />
        {/* Área abajo */}
        <rect x="24" y="81" width="52" height="16" />
        <rect x="36" y="91" width="28" height="6" />
        <circle cx="50" cy="87" r="0.9" fill={strokeColor} />
        <path d="M 40 81 A 10 10 0 0 1 60 81" />
      </g>
    );
  }

  if (type === "medio_campo") {
    return (
      <g {...commonProps}>
        <rect x="3" y="3" width="94" height="94" rx="1.5" />
        {/* Línea divisoria en la parte inferior */}
        <line x1="3" y1="95" x2="97" y2="95" strokeWidth="2.5" />
        <path d="M 36 95 A 14 14 0 0 1 64 95" />
        {/* Área de penalti */}
        <rect x="22" y="3" width="56" height="34" />
        <rect x="35" y="3" width="30" height="12" />
        <circle cx="50" cy="24" r="1" fill={strokeColor} />
        <path d="M 38 37 A 12 12 0 0 0 62 37" />
        {/* Portería */}
        <rect x="40" y="0.8" width="20" height="2.2" strokeDasharray="1.5 1.5" />
      </g>
    );
  }

  if (type === "area_penalti") {
    return (
      <g {...commonProps}>
        <rect x="3" y="3" width="94" height="94" rx="1.5" />
        <rect x="12" y="3" width="76" height="62" strokeWidth="2.5" />
        <rect x="30" y="3" width="40" height="20" />
        <circle cx="50" cy="40" r="1.3" fill={strokeColor} />
        <path d="M 34 65 A 16 16 0 0 0 66 65" />
        <rect x="38" y="0.8" width="24" height="2.2" strokeDasharray="1.5 1.5" />
      </g>
    );
  }

  // Reducido / Rondo
  return (
    <g {...commonProps}>
      <rect x="4" y="4" width="92" height="92" strokeDasharray="4 4" rx="2" />
      <line x1="50" y1="4" x2="50" y2="96" strokeDasharray="2.5 2.5" strokeOpacity="0.4" />
      <line x1="4" y1="50" x2="96" y2="50" strokeDasharray="2.5 2.5" strokeOpacity="0.4" />
      <circle cx="50" cy="50" r="20" strokeOpacity="0.35" strokeDasharray="3 3" />
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDERIZADO DE ELEMENTOS TÁCTICOS REALISTAS
// ─────────────────────────────────────────────────────────────────────────────
function renderElement(
  el: CampoElementoGrafico,
  selectedId?: string | null,
  onClick?: (el: CampoElementoGrafico) => void,
  showLabels = true
) {
  const isSelected = selectedId === el.id;

  // JUGADORES Y PORTEROS
  if (el.tipo === "jugador_a" || el.tipo === "jugador_b" || el.tipo === "comodin" || el.tipo === "portero") {
    const isGK = el.tipo === "portero";
    const radius = 2.7;
    const rot = el.rotation || 0;

    return (
      <g
        key={el.id}
        transform={`translate(${el.x}, ${el.y}) rotate(${rot})`}
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick(el);
          }
        }}
        style={{ cursor: onClick ? "pointer" : "default" }}
      >
        {/* Sombra de la ficha en el suelo */}
        <ellipse cx="0" cy="0.8" rx={radius + 0.3} ry={radius - 0.5} fill="rgba(0,0,0,0.4)" />

        {/* Anillo de selección si está seleccionado */}
        {isSelected && (
          <circle cx="0" cy="0" r={radius + 1.2} fill="none" stroke="#facc15" strokeWidth="0.9" strokeDasharray="1.8 1.8" />
        )}

        {/* Flecha indicadora de orientación (cono de visión) */}
        <polygon points="0,-3.8 -1.2,-2.6 1.2,-2.6" fill={el.color || "#ef4444"} stroke="#ffffff" strokeWidth="0.3" />

        {/* Cuerpo / Camiseta del Jugador */}
        <circle
          cx="0"
          cy="0"
          r={radius}
          fill={el.color || "#ef4444"}
          stroke="#ffffff"
          strokeWidth="0.6"
        />

        {/* Detalle de cuello de camiseta para aspecto profesional */}
        <path d={`M -1 -${radius - 0.2} Q 0 -1.2 1 -${radius - 0.2}`} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.4" />

        {/* Dorsal o letra */}
        {showLabels && (
          <text
            x="0"
            y="0.9"
            fontSize="2.4"
            fontWeight="900"
            fill="#ffffff"
            textAnchor="middle"
            style={{ userSelect: "none", fontFamily: "sans-serif" }}
          >
            {isGK ? "P" : el.label || "1"}
          </text>
        )}
      </g>
    );
  }

  // BALÓN DE FÚTBOL REALISTA
  if (el.tipo === "balon") {
    return (
      <g
        key={el.id}
        transform={`translate(${el.x}, ${el.y})`}
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick(el);
          }
        }}
        style={{ cursor: onClick ? "pointer" : "default" }}
      >
        <ellipse cx="0" cy="0.6" rx="1.8" ry="1.0" fill="rgba(0,0,0,0.35)" />
        {isSelected && <circle cx="0" cy="0" r="2.8" fill="none" stroke="#facc15" strokeWidth="0.7" strokeDasharray="1 1" />}
        <circle cx="0" cy="0" r="1.8" fill="#ffffff" stroke="#1e293b" strokeWidth="0.4" />
        {/* Pentágono central negro de balón oficial */}
        <polygon points="0,-0.7 0.7,-0.2 0.4,0.6 -0.4,0.6 -0.7,-0.2" fill="#0f172a" />
        <line x1="0" y1="-0.7" x2="0" y2="-1.8" stroke="#1e293b" strokeWidth="0.3" />
        <line x1="0.7" y1="-0.2" x2="1.7" y2="-0.5" stroke="#1e293b" strokeWidth="0.3" />
        <line x1="0.4" y1="0.6" x2="1.2" y2="1.4" stroke="#1e293b" strokeWidth="0.3" />
        <line x1="-0.4" y1="0.6" x2="-1.2" y2="1.4" stroke="#1e293b" strokeWidth="0.3" />
        <line x1="-0.7" y1="-0.2" x2="-1.7" y2="-0.5" stroke="#1e293b" strokeWidth="0.3" />
      </g>
    );
  }

  // CONO 3D CON RELIEVE Y SOMBRA
  if (el.tipo === "cono") {
    return (
      <g
        key={el.id}
        transform={`translate(${el.x}, ${el.y})`}
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick(el);
          }
        }}
        style={{ cursor: onClick ? "pointer" : "default" }}
      >
        <ellipse cx="0" cy="1.2" rx="1.8" ry="0.8" fill="rgba(0,0,0,0.35)" />
        {isSelected && <circle cx="0" cy="0" r="2.4" fill="none" stroke="#facc15" strokeWidth="0.6" />}
        {/* Base cuadrada del cono */}
        <polygon points="-1.5,1.2 1.5,1.2 1.1,0.7 -1.1,0.7" fill="#c2410c" />
        {/* Cuerpo cónico */}
        <polygon points="0,-2.2 1.2,0.9 -1.2,0.9" fill="url(#cone_grad)" stroke="#ffffff" strokeWidth="0.25" />
        {/* Franja blanca reflectante */}
        <polygon points="-0.6,-0.4 0.6,-0.4 0.8,0.2 -0.8,0.2" fill="#ffffff" />
      </g>
    );
  }

  // SETA / CHINO DELIMITADOR
  if (el.tipo === "seta") {
    return (
      <g
        key={el.id}
        transform={`translate(${el.x}, ${el.y})`}
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick(el);
          }
        }}
        style={{ cursor: onClick ? "pointer" : "default" }}
      >
        <ellipse cx="0" cy="0.4" rx="1.6" ry="0.8" fill="rgba(0,0,0,0.3)" />
        {isSelected && <circle cx="0" cy="0" r="2.2" fill="none" stroke="#facc15" strokeWidth="0.5" />}
        {/* Cúpula de la seta */}
        <path d="M -1.5 0.3 Q 0 -1.4 1.5 0.3 Z" fill={el.color || "#eab308"} stroke="#ffffff" strokeWidth="0.25" />
        <circle cx="0" cy="-0.3" r="0.3" fill="#ffffff" />
      </g>
    );
  }

  // PORTERÍA REGLAMENTARIA CON RED REALISTA
  if (el.tipo === "porteria" || el.tipo === "mini_porteria") {
    const isMini = el.tipo === "mini_porteria";
    const w = el.width || (isMini ? 8 : 16);
    const h = el.height || (isMini ? 4 : 6);
    const rot = el.rotation || 0;

    return (
      <g
        key={el.id}
        transform={`translate(${el.x}, ${el.y}) rotate(${rot})`}
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick(el);
          }
        }}
        style={{ cursor: onClick ? "pointer" : "default" }}
      >
        {isSelected && (
          <rect x={-w / 2 - 1.2} y={-h / 2 - 1.2} width={w + 2.4} height={h + 2.4} fill="none" stroke="#facc15" strokeWidth="0.8" strokeDasharray="1.5 1.5" rx="0.5" />
        )}
        {/* Fondo de red con textura de malla */}
        <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="url(#goal_net)" stroke="rgba(255,255,255,0.6)" strokeWidth="0.4" />
        {/* Postes principales blancos gruesos */}
        <line x1={-w / 2} y1={h / 2} x2={w / 2} y2={h / 2} stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
        <line x1={-w / 2} y1={-h / 2} x2={-w / 2} y2={h / 2} stroke="#ffffff" strokeWidth="1" />
        <line x1={w / 2} y1={-h / 2} x2={w / 2} y2={h / 2} stroke="#ffffff" strokeWidth="1" />
        {/* Tirantes traseros */}
        <line x1={-w / 2} y1={-h / 2} x2={w / 2} y2={-h / 2} stroke="#e2e8f0" strokeWidth="0.7" />
      </g>
    );
  }

  // SILUETA / MUÑECO DE BARRERA
  if (el.tipo === "silueta") {
    return (
      <g
        key={el.id}
        transform={`translate(${el.x}, ${el.y})`}
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick(el);
          }
        }}
        style={{ cursor: onClick ? "pointer" : "default" }}
      >
        <ellipse cx="0" cy="1.6" rx="1.6" ry="0.7" fill="rgba(0,0,0,0.3)" />
        {isSelected && <circle cx="0" cy="0" r="3" fill="none" stroke="#facc15" strokeWidth="0.6" />}
        {/* Cabeza */}
        <circle cx="0" cy="-1.8" r="0.9" fill="#e2e8f0" stroke="#334155" strokeWidth="0.3" />
        {/* Hombros y tronco de barrera */}
        <path d="M -1.4 -0.6 L 1.4 -0.6 L 1.0 1.6 L -1.0 1.6 Z" fill="#94a3b8" stroke="#334155" strokeWidth="0.3" />
        <line x1="-1.4" y1="-0.6" x2="1.4" y2="-0.6" stroke="#475569" strokeWidth="0.4" />
      </g>
    );
  }

  // ZONA TÁCTICA
  if (el.tipo === "zona") {
    const w = el.width || 24;
    const h = el.height || 18;
    return (
      <g
        key={el.id}
        transform={`translate(${el.x}, ${el.y})`}
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick(el);
          }
        }}
        style={{ cursor: onClick ? "pointer" : "default" }}
      >
        <rect
          x="0"
          y="0"
          width={w}
          height={h}
          fill={el.color || "rgba(255, 255, 255, 0.15)"}
          stroke={isSelected ? "#facc15" : "rgba(255, 255, 255, 0.6)"}
          strokeWidth={isSelected ? "1" : "0.7"}
          strokeDasharray="2 2"
          rx="1"
        />
        {el.label && (
          <text x={w / 2} y={h / 2 + 1} fontSize="2.2" fontWeight="800" fill="#ffffff" textAnchor="middle" opacity="0.85">
            {el.label}
          </text>
        )}
      </g>
    );
  }

  // TEXTO / NOTA TÁCTICA
  if (el.tipo === "texto") {
    return (
      <g
        key={el.id}
        transform={`translate(${el.x}, ${el.y})`}
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick(el);
          }
        }}
        style={{ cursor: onClick ? "pointer" : "default" }}
      >
        {isSelected && <rect x="-1" y="-3" width="26" height="5" fill="none" stroke="#facc15" strokeWidth="0.6" rx="1" />}
        <rect x="0" y="-2.4" width="24" height="4" fill="rgba(15, 23, 42, 0.85)" rx="0.8" />
        <text x="12" y="0.2" fill="#f8fafc" fontSize="2.1" fontWeight="800" textAnchor="middle">
          {el.label || "Nota"}
        </text>
      </g>
    );
  }

  // FLECHAS TÁCTICAS (PASE, CARRERA, CONDUCCIÓN)
  if (el.tipo.startsWith("flecha")) {
    const endX = el.endX !== undefined ? el.endX : el.x + 14;
    const endY = el.endY !== undefined ? el.endY : el.y;
    const isPase = el.tipo === "flecha_pase";
    const isConduc = el.tipo === "flecha_conduc";

    const angle = Math.atan2(endY - el.y, endX - el.x);
    const headLen = 2.4;
    const x1 = endX - headLen * Math.cos(angle - Math.PI / 6);
    const y1 = endY - headLen * Math.sin(angle - Math.PI / 6);
    const x2 = endX - headLen * Math.cos(angle + Math.PI / 6);
    const y2 = endY - headLen * Math.sin(angle + Math.PI / 6);

    const fColor = isPase ? "#facc15" : isConduc ? "#38bdf8" : "#ffffff";

    return (
      <g
        key={el.id}
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick(el);
          }
        }}
        style={{ cursor: onClick ? "pointer" : "default" }}
      >
        {isSelected && (
          <line x1={el.x} y1={el.y} x2={endX} y2={endY} stroke="#facc15" strokeWidth="3" strokeOpacity="0.4" />
        )}
        <line
          x1={el.x}
          y1={el.y}
          x2={endX}
          y2={endY}
          stroke={el.color || fColor}
          strokeWidth={isConduc ? "1.4" : "1.0"}
          strokeDasharray={isPase ? "1.8 1.4" : isConduc ? "2.5 1.2" : undefined}
        />
        <polygon points={`${endX},${endY} ${x1},${y1} ${x2},${y2}`} fill={el.color || fColor} />
      </g>
    );
  }

  return null;
}
