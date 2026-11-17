"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  CampoPitchType,
  CampoElementType,
  CampoElementoGrafico,
  CampoFreeDrawPath,
  CampoDiagramaData,
} from "./campo-types";

interface TacticalPitchDesignerProps {
  initialData?: CampoDiagramaData;
  onChange?: (data: CampoDiagramaData) => void;
  readOnly?: boolean;
  height?: number | string;
}

const DEFAULT_DIAGRAM: CampoDiagramaData = {
  pitchType: "medio_campo",
  elementos: [],
  trazosLibres: [],
};

export default function TacticalPitchDesigner({
  initialData,
  onChange,
  readOnly = false,
  height = 540,
}: TacticalPitchDesignerProps) {
  const [pitchType, setPitchType] = useState<CampoPitchType>(
    initialData?.pitchType || "medio_campo"
  );
  const [elementos, setElementos] = useState<CampoElementoGrafico[]>(
    initialData?.elementos || []
  );
  const [trazosLibres, setTrazosLibres] = useState<CampoFreeDrawPath[]>(
    initialData?.trazosLibres || []
  );

  // Historial para Undo / Redo
  const [history, setHistory] = useState<Array<{ elementos: CampoElementoGrafico[]; trazos: CampoFreeDrawPath[] }>>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Elemento seleccionado
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Herramienta activa
  const [activeTool, setActiveTool] = useState<
    | "select"
    | "jugador_a"
    | "jugador_b"
    | "comodin"
    | "portero"
    | "balon"
    | "cono"
    | "seta"
    | "porteria"
    | "mini_porteria"
    | "silueta"
    | "flecha_pase"
    | "flecha_carrera"
    | "flecha_conduc"
    | "zona"
    | "texto"
    | "lapiz"
  >("select");

  // Ajustes de herramientas
  const [drawColor, setDrawColor] = useState<string>("#facc15"); // amarillo táctico
  const [drawWidth, setDrawWidth] = useState<number>(3);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentPath, setCurrentPath] = useState<Array<{ x: number; y: number }>>([]);

  // Flecha en creación interactiva (drag para inicio y fin)
  const [arrowDraft, setArrowDraft] = useState<{ startX: number; startY: number; curX: number; curY: number } | null>(null);

  // Dragging de elementos
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Guardar en historial
  const pushHistory = useCallback((newElems: CampoElementoGrafico[], newTrazos: CampoFreeDrawPath[]) => {
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      return [...sliced, { elementos: newElems, trazos: newTrazos }];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  // Notificar cambios y snapshot
  useEffect(() => {
    if (onChange) {
      onChange({
        pitchType,
        elementos,
        trazosLibres,
      });
    }
  }, [pitchType, elementos, trazosLibres, onChange]);

  // Deshacer
  const handleUndo = () => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      const snapshot = history[nextIdx];
      setElementos(snapshot.elementos);
      setTrazosLibres(snapshot.trazos);
      setHistoryIndex(nextIdx);
      setSelectedId(null);
    }
  };

  // Rehacer
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      const snapshot = history[nextIdx];
      setElementos(snapshot.elementos);
      setTrazosLibres(snapshot.trazos);
      setHistoryIndex(nextIdx);
      setSelectedId(null);
    }
  };

  // Convertir coordenadas del cliente a porcentaje (0-100)
  const getCoordsPct = (e: { clientX: number; clientY: number }) => {
    if (!svgRef.current) return { x: 50, y: 50 };
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  };

  // Añadir un nuevo elemento táctico en posición
  const handleAddElementAt = (tipo: CampoElementType, x: number, y: number, endX?: number, endY?: number) => {
    let defaultLabel = "";
    let defaultColor = "#ef4444";
    let width = 6;
    let height = 6;

    if (tipo === "jugador_a") {
      const countA = elementos.filter((el) => el.tipo === "jugador_a").length + 1;
      defaultLabel = String(countA);
      defaultColor = "#ef4444"; // Rojo
    } else if (tipo === "jugador_b") {
      const countB = elementos.filter((el) => el.tipo === "jugador_b").length + 1;
      defaultLabel = String(countB);
      defaultColor = "#3b82f6"; // Azul
    } else if (tipo === "comodin") {
      defaultLabel = "C";
      defaultColor = "#22c55e"; // Verde
    } else if (tipo === "portero") {
      defaultLabel = "P";
      defaultColor = "#0f172a"; // Negro
    } else if (tipo === "cono") {
      defaultColor = "#f97316";
    } else if (tipo === "seta") {
      defaultColor = "#eab308";
    } else if (tipo === "porteria") {
      width = 14;
      height = 5;
      defaultColor = "#ffffff";
    } else if (tipo === "mini_porteria") {
      width = 7;
      height = 4;
      defaultColor = "#ffffff";
    } else if (tipo === "zona") {
      width = 24;
      height = 18;
      defaultColor = "rgba(255, 255, 255, 0.15)";
    } else if (tipo === "texto") {
      defaultLabel = "Zona Presión";
      defaultColor = "#ffffff";
    } else if (tipo.startsWith("flecha")) {
      defaultColor = tipo === "flecha_pase" ? "#facc15" : tipo === "flecha_conduc" ? "#38bdf8" : "#ffffff";
    }

    const newEl: CampoElementoGrafico = {
      id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tipo,
      x,
      y,
      rotation: 0,
      label: defaultLabel,
      color: defaultColor,
      width,
      height,
      endX: endX !== undefined ? endX : x + 12,
      endY: endY !== undefined ? endY : y,
    };

    const nextElems = [...elementos, newEl];
    setElementos(nextElems);
    pushHistory(nextElems, trazosLibres);
    setSelectedId(newEl.id);
  };

  // Mousedown en el SVG
  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (readOnly) return;
    const { x, y } = getCoordsPct(e);

    // Herramienta Lápiz
    if (activeTool === "lapiz") {
      setIsDrawing(true);
      setCurrentPath([{ x, y }]);
      return;
    }

    // Herramientas de Flechas interactivas (Click y arrastre)
    if (activeTool === "flecha_pase" || activeTool === "flecha_carrera" || activeTool === "flecha_conduc") {
      setArrowDraft({ startX: x, startY: y, curX: x, curY: y });
      return;
    }

    // Herramienta de crear elemento directo al hacer clic
    if (activeTool !== "select") {
      handleAddElementAt(activeTool, x, y);
      setActiveTool("select"); // Volver a selección
      return;
    }

    // Clic en fondo vacío deselecciona
    setSelectedId(null);
  };

  // Mousemove en el SVG
  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (readOnly) return;
    const { x, y } = getCoordsPct(e);

    if (isDrawing) {
      setCurrentPath((prev) => [...prev, { x, y }]);
      return;
    }

    if (arrowDraft) {
      setArrowDraft((prev) => (prev ? { ...prev, curX: x, curY: y } : null));
      return;
    }

    if (draggingId) {
      setElementos((prev) =>
        prev.map((el) => {
          if (el.id !== draggingId) return el;
          const newX = Math.max(1, Math.min(99, x - dragOffset.x));
          const newY = Math.max(1, Math.min(99, y - dragOffset.y));
          
          // Si es flecha, desplaza también su endpoint manteniendo la longitud
          if (el.tipo.startsWith("flecha") && el.endX !== undefined && el.endY !== undefined) {
            const dx = el.endX - el.x;
            const dy = el.endY - el.y;
            return { ...el, x: newX, y: newY, endX: newX + dx, endY: newY + dy };
          }

          return { ...el, x: newX, y: newY };
        })
      );
    }
  };

  // Mouseup en el SVG
  const handleSvgMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (readOnly) return;

    if (isDrawing) {
      setIsDrawing(false);
      if (currentPath.length > 1) {
        const newTrazo: CampoFreeDrawPath = {
          id: `tr_${Date.now()}`,
          color: drawColor,
          width: drawWidth,
          points: currentPath,
        };
        const nextTrazos = [...trazosLibres, newTrazo];
        setTrazosLibres(nextTrazos);
        pushHistory(elementos, nextTrazos);
      }
      setCurrentPath([]);
      return;
    }

    if (arrowDraft) {
      const { startX, startY, curX, curY } = arrowDraft;
      const dist = Math.hypot(curX - startX, curY - startY);
      if (dist > 3) {
        handleAddElementAt(activeTool as CampoElementType, startX, startY, curX, curY);
      }
      setArrowDraft(null);
      setActiveTool("select");
      return;
    }

    if (draggingId) {
      setDraggingId(null);
      pushHistory(elementos, trazosLibres);
    }
  };

  // Iniciar arrastre de un elemento
  const handleElementMouseDown = (e: React.MouseEvent, el: CampoElementoGrafico) => {
    if (readOnly) return;
    e.stopPropagation();
    setSelectedId(el.id);

    if (activeTool === "select") {
      const { x, y } = getCoordsPct(e);
      setDraggingId(el.id);
      setDragOffset({ x: x - el.x, y: y - el.y });
    }
  };

  // Eliminar elemento seleccionado
  const handleDeleteSelected = () => {
    if (!selectedId) return;
    const nextElems = elementos.filter((el) => el.id !== selectedId);
    setElementos(nextElems);
    pushHistory(nextElems, trazosLibres);
    setSelectedId(null);
  };

  // Duplicar elemento seleccionado
  const handleDuplicateSelected = () => {
    const el = elementos.find((item) => item.id === selectedId);
    if (!el) return;
    const newEl: CampoElementoGrafico = {
      ...el,
      id: `el_${Date.now()}_dup`,
      x: Math.min(95, el.x + 4),
      y: Math.min(95, el.y + 4),
      endX: el.endX !== undefined ? Math.min(95, el.endX + 4) : undefined,
      endY: el.endY !== undefined ? Math.min(95, el.endY + 4) : undefined,
    };
    const nextElems = [...elementos, newEl];
    setElementos(nextElems);
    pushHistory(nextElems, trazosLibres);
    setSelectedId(newEl.id);
  };

  // Rotar elemento seleccionado
  const handleRotateSelected = (delta: number) => {
    setElementos((prev) =>
      prev.map((el) => {
        if (el.id !== selectedId) return el;
        const newRot = ((el.rotation || 0) + delta) % 360;
        return { ...el, rotation: newRot < 0 ? newRot + 360 : newRot };
      })
    );
  };

  // Actualizar etiqueta del elemento
  const handleUpdateLabel = (newLabel: string) => {
    setElementos((prev) =>
      prev.map((el) => (el.id === selectedId ? { ...el, label: newLabel } : el))
    );
  };

  // Limpiar pizarra completa
  const handleClearAll = () => {
    if (window.confirm("¿Seguro que deseas vaciar toda la pizarra táctica?")) {
      setElementos([]);
      setTrazosLibres([]);
      pushHistory([], []);
      setSelectedId(null);
    }
  };

  // Cargar plantilla táctica rápida
  const handleLoadPreset = (preset: "rondo_4v4_3" | "posesion_6v6_3" | "ssg_5v5") => {
    let presetElems: CampoElementoGrafico[] = [];
    let pType: CampoPitchType = "reducido";

    if (preset === "rondo_4v4_3") {
      pType = "reducido";
      presetElems = [
        // Zona del rondo
        { id: "z1", tipo: "zona", x: 20, y: 20, width: 60, height: 60, color: "rgba(255,255,255,0.12)" },
        // Comodines
        { id: "c1", tipo: "comodin", x: 50, y: 15, label: "C", color: "#22c55e" },
        { id: "c2", tipo: "comodin", x: 50, y: 85, label: "C", color: "#22c55e" },
        { id: "c3", tipo: "comodin", x: 50, y: 50, label: "C", color: "#22c55e" },
        // Equipo Posesión
        { id: "a1", tipo: "jugador_a", x: 15, y: 35, label: "4", color: "#ef4444" },
        { id: "a2", tipo: "jugador_a", x: 15, y: 65, label: "5", color: "#ef4444" },
        { id: "a3", tipo: "jugador_a", x: 85, y: 35, label: "8", color: "#ef4444" },
        { id: "a4", tipo: "jugador_a", x: 85, y: 65, label: "10", color: "#ef4444" },
        // Equipo Defensores (dentro)
        { id: "b1", tipo: "jugador_b", x: 38, y: 42, label: "6", color: "#3b82f6" },
        { id: "b2", tipo: "jugador_b", x: 42, y: 58, label: "7", color: "#3b82f6" },
        { id: "b3", tipo: "jugador_b", x: 58, y: 42, label: "9", color: "#3b82f6" },
        { id: "b4", tipo: "jugador_b", x: 62, y: 58, label: "11", color: "#3b82f6" },
        // Balón
        { id: "ball1", tipo: "balon", x: 48, y: 18 },
      ];
    } else if (preset === "posesion_6v6_3") {
      pType = "medio_campo";
      presetElems = [
        { id: "z1", tipo: "zona", x: 15, y: 15, width: 70, height: 70, color: "rgba(255,255,255,0.12)" },
        { id: "c1", tipo: "comodin", x: 50, y: 12, label: "C", color: "#22c55e" },
        { id: "c2", tipo: "comodin", x: 50, y: 88, label: "C", color: "#22c55e" },
        { id: "c3", tipo: "comodin", x: 50, y: 50, label: "C", color: "#22c55e" },
        { id: "a1", tipo: "jugador_a", x: 25, y: 30, label: "2", color: "#ef4444" },
        { id: "a2", tipo: "jugador_a", x: 25, y: 70, label: "3", color: "#ef4444" },
        { id: "a3", tipo: "jugador_a", x: 75, y: 30, label: "7", color: "#ef4444" },
        { id: "a4", tipo: "jugador_a", x: 75, y: 70, label: "11", color: "#ef4444" },
        { id: "a5", tipo: "jugador_a", x: 38, y: 50, label: "8", color: "#ef4444" },
        { id: "a6", tipo: "jugador_a", x: 62, y: 50, label: "10", color: "#ef4444" },
        { id: "b1", tipo: "jugador_b", x: 32, y: 38, label: "4", color: "#3b82f6" },
        { id: "b2", tipo: "jugador_b", x: 32, y: 62, label: "5", color: "#3b82f6" },
        { id: "b3", tipo: "jugador_b", x: 68, y: 38, label: "6", color: "#3b82f6" },
        { id: "b4", tipo: "jugador_b", x: 68, y: 62, label: "9", color: "#3b82f6" },
        { id: "b5", tipo: "jugador_b", x: 44, y: 46, label: "14", color: "#3b82f6" },
        { id: "b6", tipo: "jugador_b", x: 56, y: 54, label: "17", color: "#3b82f6" },
        { id: "ball1", tipo: "balon", x: 28, y: 32 },
      ];
    } else if (preset === "ssg_5v5") {
      pType = "area_penalti";
      presetElems = [
        { id: "gk1", tipo: "portero", x: 50, y: 6, label: "P", color: "#0f172a" },
        { id: "g1", tipo: "porteria", x: 40, y: 2, width: 20, height: 4 },
        { id: "mg1", tipo: "mini_porteria", x: 20, y: 92, width: 12, height: 4 },
        { id: "mg2", tipo: "mini_porteria", x: 68, y: 92, width: 12, height: 4 },
        { id: "a1", tipo: "jugador_a", x: 35, y: 40, label: "8", color: "#ef4444" },
        { id: "a2", tipo: "jugador_a", x: 65, y: 40, label: "10", color: "#ef4444" },
        { id: "a3", tipo: "jugador_a", x: 50, y: 58, label: "9", color: "#ef4444" },
        { id: "a4", tipo: "jugador_a", x: 20, y: 65, label: "7", color: "#ef4444" },
        { id: "a5", tipo: "jugador_a", x: 80, y: 65, label: "11", color: "#ef4444" },
        { id: "b1", tipo: "jugador_b", x: 40, y: 22, label: "4", color: "#3b82f6" },
        { id: "b2", tipo: "jugador_b", x: 60, y: 22, label: "5", color: "#3b82f6" },
        { id: "b3", tipo: "jugador_b", x: 25, y: 32, label: "2", color: "#3b82f6" },
        { id: "b4", tipo: "jugador_b", x: 75, y: 32, label: "3", color: "#3b82f6" },
        { id: "b5", tipo: "jugador_b", x: 50, y: 38, label: "6", color: "#3b82f6" },
        { id: "ball1", tipo: "balon", x: 38, y: 42 },
      ];
    }

    setPitchType(pType);
    setElementos(presetElems);
    setTrazosLibres([]);
    pushHistory(presetElems, []);
    setSelectedId(null);
  };

  // Renderizar las líneas del campo según el pitchType
  const renderPitchLines = () => {
    if (pitchType === "completo_horizontal") {
      return (
        <g stroke="#ffffff" strokeWidth="2.5" strokeOpacity="0.85" fill="none">
          {/* Banda perimetral */}
          <rect x="3" y="3" width="94" height="94" />
          {/* Línea divisoria */}
          <line x1="50" y1="3" x2="50" y2="97" />
          {/* Círculo central */}
          <circle cx="50" cy="50" r="12" />
          <circle cx="50" cy="50" r="0.8" fill="#ffffff" />
          {/* Área Grande Izquierda */}
          <rect x="3" y="24" width="16" height="52" />
          <rect x="3" y="36" width="6" height="28" />
          <circle cx="13" cy="50" r="0.8" fill="#ffffff" />
          <path d="M 19 40 A 10 10 0 0 1 19 60" />
          {/* Área Grande Derecha */}
          <rect x="81" y="24" width="16" height="52" />
          <rect x="91" y="36" width="6" height="28" />
          <circle cx="87" cy="50" r="0.8" fill="#ffffff" />
          <path d="M 81 40 A 10 10 0 0 0 81 60" />
          {/* Porterías */}
          <rect x="0.5" y="42" width="2.5" height="16" strokeDasharray="2 2" />
          <rect x="97" y="42" width="2.5" height="16" strokeDasharray="2 2" />
        </g>
      );
    }

    if (pitchType === "completo_vertical") {
      return (
        <g stroke="#ffffff" strokeWidth="2.5" strokeOpacity="0.85" fill="none">
          <rect x="3" y="3" width="94" height="94" />
          <line x1="3" y1="50" x2="97" y2="50" />
          <circle cx="50" cy="50" r="12" />
          <circle cx="50" cy="50" r="0.8" fill="#ffffff" />
          {/* Área arriba */}
          <rect x="24" y="3" width="52" height="16" />
          <rect x="36" y="3" width="28" height="6" />
          <circle cx="50" cy="13" r="0.8" fill="#ffffff" />
          <path d="M 40 19 A 10 10 0 0 0 60 19" />
          {/* Área abajo */}
          <rect x="24" y="81" width="52" height="16" />
          <rect x="36" y="91" width="28" height="6" />
          <circle cx="50" cy="87" r="0.8" fill="#ffffff" />
          <path d="M 40 81 A 10 10 0 0 1 60 81" />
        </g>
      );
    }

    if (pitchType === "medio_campo") {
      return (
        <g stroke="#ffffff" strokeWidth="2.5" strokeOpacity="0.85" fill="none">
          <rect x="3" y="3" width="94" height="94" />
          {/* Línea divisoria en la parte inferior */}
          <line x1="3" y1="95" x2="97" y2="95" strokeWidth="3.5" />
          <path d="M 36 95 A 14 14 0 0 1 64 95" />
          {/* Área de penalti */}
          <rect x="22" y="3" width="56" height="34" />
          <rect x="35" y="3" width="30" height="12" />
          <circle cx="50" cy="24" r="0.8" fill="#ffffff" />
          <path d="M 38 37 A 12 12 0 0 0 62 37" />
          {/* Portería */}
          <rect x="40" y="0.5" width="20" height="2.5" strokeDasharray="2 2" />
        </g>
      );
    }

    if (pitchType === "area_penalti") {
      return (
        <g stroke="#ffffff" strokeWidth="2.5" strokeOpacity="0.85" fill="none">
          <rect x="3" y="3" width="94" height="94" />
          <rect x="12" y="3" width="76" height="62" strokeWidth="3" />
          <rect x="30" y="3" width="40" height="20" />
          <circle cx="50" cy="40" r="1.2" fill="#ffffff" />
          <path d="M 34 65 A 16 16 0 0 0 66 65" />
          <rect x="38" y="0.5" width="24" height="2.5" strokeDasharray="2 2" />
        </g>
      );
    }

    // Reducido / Rondo
    return (
      <g stroke="#ffffff" strokeWidth="2" strokeOpacity="0.8" fill="none">
        <rect x="4" y="4" width="92" height="92" strokeDasharray="4 4" />
        <line x1="50" y1="4" x2="50" y2="96" strokeDasharray="3 3" strokeOpacity="0.4" />
        <line x1="4" y1="50" x2="96" y2="50" strokeDasharray="3 3" strokeOpacity="0.4" />
        <circle cx="50" cy="50" r="20" strokeOpacity="0.3" strokeDasharray="4 4" />
      </g>
    );
  };

  // Renderizar un elemento táctico
  const renderElement = (el: CampoElementoGrafico) => {
    const isSelected = selectedId === el.id;

    if (el.tipo === "jugador_a" || el.tipo === "jugador_b" || el.tipo === "comodin" || el.tipo === "portero") {
      const radius = 2.4;
      return (
        <g
          key={el.id}
          transform={`translate(${el.x}, ${el.y})`}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
          style={{ cursor: "move" }}
        >
          {isSelected && (
            <circle cx="0" cy="0" r={radius + 0.9} fill="none" stroke="#facc15" strokeWidth="0.8" strokeDasharray="1.5 1.5" />
          )}
          <circle
            cx="0"
            cy="0"
            r={radius}
            fill={el.color || "#ef4444"}
            stroke="#ffffff"
            strokeWidth="0.5"
            filter="drop-shadow(0px 1px 2px rgba(0,0,0,0.4))"
          />
          <text
            x="0"
            y="0.8"
            fontSize="2.1"
            fontWeight="900"
            fill="#ffffff"
            textAnchor="middle"
            style={{ userSelect: "none" }}
          >
            {el.label || "1"}
          </text>
        </g>
      );
    }

    if (el.tipo === "balon") {
      return (
        <g
          key={el.id}
          transform={`translate(${el.x}, ${el.y})`}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
          style={{ cursor: "move" }}
        >
          {isSelected && (
            <circle cx="0" cy="0" r="2.4" fill="none" stroke="#facc15" strokeWidth="0.6" strokeDasharray="1 1" />
          )}
          <circle cx="0" cy="0" r="1.6" fill="#ffffff" stroke="#000000" strokeWidth="0.4" />
          <circle cx="0" cy="0" r="0.6" fill="#000000" />
        </g>
      );
    }

    if (el.tipo === "cono") {
      return (
        <g
          key={el.id}
          transform={`translate(${el.x}, ${el.y})`}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
          style={{ cursor: "move" }}
        >
          {isSelected && <circle cx="0" cy="0" r="2" fill="none" stroke="#facc15" strokeWidth="0.5" />}
          <polygon points="0,-1.8 1.5,1.2 -1.5,1.2" fill={el.color || "#f97316"} stroke="#ffffff" strokeWidth="0.3" />
        </g>
      );
    }

    if (el.tipo === "seta") {
      return (
        <g
          key={el.id}
          transform={`translate(${el.x}, ${el.y})`}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
          style={{ cursor: "move" }}
        >
          {isSelected && <circle cx="0" cy="0" r="1.8" fill="none" stroke="#facc15" strokeWidth="0.5" />}
          <ellipse cx="0" cy="0" rx="1.4" ry="0.8" fill={el.color || "#eab308"} stroke="#ffffff" strokeWidth="0.3" />
        </g>
      );
    }

    if (el.tipo === "porteria" || el.tipo === "mini_porteria") {
      const w = el.width || (el.tipo === "porteria" ? 14 : 7);
      const h = el.height || (el.tipo === "porteria" ? 5 : 3.5);
      const rot = el.rotation || 0;
      return (
        <g
          key={el.id}
          transform={`translate(${el.x}, ${el.y}) rotate(${rot})`}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
          style={{ cursor: "move" }}
        >
          {isSelected && (
            <rect x={-w / 2 - 1} y={-h / 2 - 1} width={w + 2} height={h + 2} fill="none" stroke="#facc15" strokeWidth="0.6" strokeDasharray="1.5 1.5" />
          )}
          <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="rgba(255,255,255,0.25)" stroke="#ffffff" strokeWidth="0.9" />
          {/* Red */}
          <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke="#ffffff" strokeWidth="0.4" strokeDasharray="1 1" />
          <line x1={0} y1={-h / 2} x2={0} y2={h / 2} stroke="#ffffff" strokeWidth="0.4" strokeDasharray="1 1" />
        </g>
      );
    }

    if (el.tipo === "silueta") {
      return (
        <g
          key={el.id}
          transform={`translate(${el.x}, ${el.y})`}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
          style={{ cursor: "move" }}
        >
          {isSelected && <circle cx="0" cy="0" r="2.8" fill="none" stroke="#facc15" strokeWidth="0.5" />}
          <circle cx="0" cy="-1.4" r="0.9" fill="#e2e8f0" stroke="#475569" strokeWidth="0.3" />
          <path d="M -1.2 1.5 L -0.6 -0.5 L 0.6 -0.5 L 1.2 1.5 Z" fill="#94a3b8" stroke="#475569" strokeWidth="0.3" />
        </g>
      );
    }

    if (el.tipo === "zona") {
      const w = el.width || 24;
      const h = el.height || 18;
      return (
        <g
          key={el.id}
          transform={`translate(${el.x}, ${el.y})`}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
          style={{ cursor: "move" }}
        >
          <rect
            x="0"
            y="0"
            width={w}
            height={h}
            fill={el.color || "rgba(255, 255, 255, 0.15)"}
            stroke={isSelected ? "#facc15" : "#ffffff"}
            strokeWidth={isSelected ? "1" : "0.7"}
            strokeDasharray="2 2"
          />
        </g>
      );
    }

    if (el.tipo === "texto") {
      return (
        <g
          key={el.id}
          transform={`translate(${el.x}, ${el.y})`}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
          style={{ cursor: "move" }}
        >
          {isSelected && (
            <rect x="-1" y="-2.5" width="26" height="4" fill="none" stroke="#facc15" strokeWidth="0.5" />
          )}
          <rect x="0" y="-2" width="24" height="3" fill="rgba(15, 23, 42, 0.75)" rx="0.5" />
          <text x="12" y="-0.2" fill="#ffffff" fontSize="1.8" fontWeight="800" textAnchor="middle">
            {el.label || "Nota"}
          </text>
        </g>
      );
    }

    // Flechas tácticas (pase, carrera, conducción)
    if (el.tipo.startsWith("flecha")) {
      const endX = el.endX !== undefined ? el.endX : el.x + 15;
      const endY = el.endY !== undefined ? el.endY : el.y;
      const isPase = el.tipo === "flecha_pase";
      const isConduc = el.tipo === "flecha_conduc";

      // Cálculo del ángulo de la punta de la flecha
      const angle = Math.atan2(endY - el.y, endX - el.x);
      const headLen = 2.2;
      const x1 = endX - headLen * Math.cos(angle - Math.PI / 6);
      const y1 = endY - headLen * Math.sin(angle - Math.PI / 6);
      const x2 = endX - headLen * Math.cos(angle + Math.PI / 6);
      const y2 = endY - headLen * Math.sin(angle + Math.PI / 6);

      return (
        <g
          key={el.id}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
          style={{ cursor: "move" }}
        >
          {isSelected && (
            <line
              x1={el.x}
              y1={el.y}
              x2={endX}
              y2={endY}
              stroke="#facc15"
              strokeWidth="2.5"
              strokeOpacity="0.4"
            />
          )}
          <line
            x1={el.x}
            y1={el.y}
            x2={endX}
            y2={endY}
            stroke={el.color || "#ffffff"}
            strokeWidth={isConduc ? "1.2" : "0.9"}
            strokeDasharray={isPase ? "1.5 1.5" : isConduc ? "2 1" : undefined}
          />
          {/* Punta de flecha */}
          <polygon
            points={`${endX},${endY} ${x1},${y1} ${x2},${y2}`}
            fill={el.color || "#ffffff"}
          />
        </g>
      );
    }

    return null;
  };

  const selectedElement = elementos.find((el) => el.id === selectedId);

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: "column",
        background: "#0f172a",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid #334155",
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.5)",
      }}
    >
      {/* BARRA SUPERIOR DE HERRAMIENTAS */}
      {!readOnly && (
        <div
          style={{
            background: "#1e293b",
            borderBottom: "1px solid #334155",
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          {/* GRUPO 1: SELECTOR DE TIPO DE CAMPO */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>
              Campo:
            </span>
            <select
              value={pitchType}
              onChange={(e) => setPitchType(e.target.value as CampoPitchType)}
              style={{
                background: "#0f172a",
                color: "#ffffff",
                border: "1px solid #475569",
                borderRadius: "6px",
                padding: "4px 8px",
                fontSize: "11.5px",
                fontWeight: 700,
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="medio_campo">Medio Campo</option>
              <option value="completo_horizontal">Campo Completo (H)</option>
              <option value="completo_vertical">Campo Completo (V)</option>
              <option value="area_penalti">Área y Finalización</option>
              <option value="reducido">Espacio Reducido / Rondo</option>
            </select>
          </div>

          {/* GRUPO 2: PLANTILLAS RÁPIDAS */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>
              Plantilla:
            </span>
            <button
              type="button"
              onClick={() => handleLoadPreset("rondo_4v4_3")}
              style={{ background: "#334155", color: "#f8fafc", border: "none", borderRadius: "4px", padding: "3px 7px", fontSize: "10.5px", fontWeight: 800, cursor: "pointer" }}
            >
              Rondo 4v4+3
            </button>
            <button
              type="button"
              onClick={() => handleLoadPreset("posesion_6v6_3")}
              style={{ background: "#334155", color: "#f8fafc", border: "none", borderRadius: "4px", padding: "3px 7px", fontSize: "10.5px", fontWeight: 800, cursor: "pointer" }}
            >
              Posesión 6v6+3
            </button>
            <button
              type="button"
              onClick={() => handleLoadPreset("ssg_5v5")}
              style={{ background: "#334155", color: "#f8fafc", border: "none", borderRadius: "4px", padding: "3px 7px", fontSize: "10.5px", fontWeight: 800, cursor: "pointer" }}
            >
              SSG 5v5 + Port.
            </button>
          </div>

          {/* GRUPO 3: ACCIONES GENERALES */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              title="Deshacer (Ctrl+Z)"
              style={{
                background: historyIndex > 0 ? "#334155" : "#1e293b",
                color: historyIndex > 0 ? "#ffffff" : "#64748b",
                border: "1px solid #475569",
                borderRadius: "5px",
                padding: "3px 8px",
                fontSize: "11px",
                cursor: historyIndex > 0 ? "pointer" : "default",
              }}
            >
              ↩ Deshacer
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              title="Rehacer (Ctrl+Y)"
              style={{
                background: historyIndex < history.length - 1 ? "#334155" : "#1e293b",
                color: historyIndex < history.length - 1 ? "#ffffff" : "#64748b",
                border: "1px solid #475569",
                borderRadius: "5px",
                padding: "3px 8px",
                fontSize: "11px",
                cursor: historyIndex < history.length - 1 ? "pointer" : "default",
              }}
            >
              ↪ Rehacer
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              title="Vaciar todo el campo"
              style={{
                background: "#7f1d1d",
                color: "#ffffff",
                border: "none",
                borderRadius: "5px",
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              🗑️ Limpiar
            </button>
          </div>
        </div>
      )}

      {/* PALETA DE ELEMENTOS TÁCTICOS */}
      {!readOnly && (
        <div
          style={{
            background: "#090d16",
            borderBottom: "1px solid #334155",
            padding: "6px 12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            overflowX: "auto",
          }}
        >
          {/* SELECCIONADOR */}
          <button
            type="button"
            onClick={() => setActiveTool("select")}
            style={{
              background: activeTool === "select" ? "#2563eb" : "#1e293b",
              color: "#ffffff",
              border: `1.5px solid ${activeTool === "select" ? "#60a5fa" : "#334155"}`,
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>👆</span> Mover / Seleccionar
          </button>

          <div style={{ width: "1px", height: "18px", background: "#334155" }} />

          {/* JUGADORES */}
          {[
            { id: "jugador_a" as const, label: "Equipo A (Rojo)", icon: "🔴", color: "#ef4444" },
            { id: "jugador_b" as const, label: "Equipo B (Azul)", icon: "🔵", color: "#3b82f6" },
            { id: "comodin" as const, label: "Comodín", icon: "🟢", color: "#22c55e" },
            { id: "portero" as const, label: "Portero", icon: "🧤", color: "#0f172a" },
            { id: "balon" as const, label: "Balón", icon: "⚽", color: "#ffffff" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTool(item.id)}
              style={{
                background: activeTool === item.id ? item.color : "#1e293b",
                color: "#ffffff",
                border: `1.5px solid ${activeTool === item.id ? "#facc15" : "#334155"}`,
                borderRadius: "6px",
                padding: "4px 8px",
                fontSize: "10.5px",
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                whiteSpace: "nowrap",
              }}
            >
              <span>{item.icon}</span> {item.label}
            </button>
          ))}

          <div style={{ width: "1px", height: "18px", background: "#334155" }} />

          {/* MATERIAL */}
          {[
            { id: "cono" as const, label: "Cono", icon: "🛢️" },
            { id: "seta" as const, label: "Seta", icon: "🔸" },
            { id: "porteria" as const, label: "Portería", icon: "🥅" },
            { id: "mini_porteria" as const, label: "Mini-Port.", icon: "🥅" },
            { id: "silueta" as const, label: "Silueta", icon: "🛡️" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTool(item.id)}
              style={{
                background: activeTool === item.id ? "#2563eb" : "#1e293b",
                color: "#ffffff",
                border: `1.5px solid ${activeTool === item.id ? "#60a5fa" : "#334155"}`,
                borderRadius: "6px",
                padding: "4px 8px",
                fontSize: "10.5px",
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                whiteSpace: "nowrap",
              }}
            >
              <span>{item.icon}</span> {item.label}
            </button>
          ))}

          <div style={{ width: "1px", height: "18px", background: "#334155" }} />

          {/* FLECHAS Y TRAZOS */}
          {[
            { id: "flecha_pase" as const, label: "Pase (Discontinua)", icon: "➡️" },
            { id: "flecha_carrera" as const, label: "Carrera (Continua)", icon: "🏃" },
            { id: "flecha_conduc" as const, label: "Conducción (Ondulada)", icon: "🌀" },
            { id: "zona" as const, label: "Zona Cuadrícula", icon: "🔲" },
            { id: "lapiz" as const, label: "Lápiz Libre", icon: "✏️" },
            { id: "texto" as const, label: "Texto", icon: "🔤" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTool(item.id)}
              style={{
                background: activeTool === item.id ? "#0284c7" : "#1e293b",
                color: "#ffffff",
                border: `1.5px solid ${activeTool === item.id ? "#38bdf8" : "#334155"}`,
                borderRadius: "6px",
                padding: "4px 8px",
                fontSize: "10.5px",
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                whiteSpace: "nowrap",
              }}
            >
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
        </div>
      )}

      {/* ÁREA CENTRAL DEL LIENZO VERDE DE CÉSPED */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: typeof height === "number" ? `${height}px` : height,
          background: "radial-gradient(ellipse at center, #15803d 0%, #166534 60%, #14532d 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          userSelect: "none",
        }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          onMouseDown={handleSvgMouseDown}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          style={{
            width: "100%",
            height: "100%",
            touchAction: "none",
            cursor:
              activeTool === "lapiz"
                ? "crosshair"
                : activeTool.startsWith("flecha")
                ? "crosshair"
                : activeTool !== "select"
                ? "copy"
                : "default",
          }}
        >
          {/* 1. LÍNEAS VECTORIALES DEL CAMPO */}
          {renderPitchLines()}

          {/* 2. TRAZOS LIBRES REALIZADOS CON EL LÁPIZ */}
          {trazosLibres.map((tr) => {
            if (tr.points.length < 2) return null;
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

          {/* TRAZO ACTUAL EN DIBUJO */}
          {isDrawing && currentPath.length > 1 && (
            <path
              d={currentPath.reduce((acc, p, idx) => `${acc} ${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`, "")}
              fill="none"
              stroke={drawColor}
              strokeWidth={drawWidth * 0.3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* FLECHA PREVIEW EN CREACIÓN */}
          {arrowDraft && (
            <line
              x1={arrowDraft.startX}
              y1={arrowDraft.startY}
              x2={arrowDraft.curX}
              y2={arrowDraft.curY}
              stroke="#facc15"
              strokeWidth="1.2"
              strokeDasharray="2 2"
            />
          )}

          {/* 3. ELEMENTOS TÁCTICOS (JUGADORES, MATERIAL, FLECHAS) */}
          {elementos.map((el) => renderElement(el))}
        </svg>

        {/* CONTROLES FLOTANTES CUANDO HAY UN ELEMENTO SELECCIONADO */}
        {!readOnly && selectedElement && (
          <div
            style={{
              position: "absolute",
              bottom: "12px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(15, 23, 42, 0.92)",
              backdropFilter: "blur(6px)",
              border: "1px solid #475569",
              borderRadius: "10px",
              padding: "6px 12px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
              zIndex: 30,
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#facc15", textTransform: "uppercase" }}>
              {selectedElement.tipo.replace("_", " ")}
            </span>

            {/* EDICIÓN DE DORSAL O TEXTO */}
            {selectedElement.label !== undefined && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 700 }}>Texto/Dorsal:</span>
                <input
                  type="text"
                  value={selectedElement.label || ""}
                  onChange={(e) => handleUpdateLabel(e.target.value)}
                  style={{
                    background: "#0f172a",
                    border: "1px solid #475569",
                    borderRadius: "4px",
                    color: "#ffffff",
                    fontSize: "11px",
                    fontWeight: 800,
                    padding: "2px 6px",
                    width: "70px",
                    textAlign: "center",
                  }}
                />
              </div>
            )}

            {/* ROTAR */}
            <div style={{ display: "flex", gap: "2px" }}>
              <button
                type="button"
                onClick={() => handleRotateSelected(-45)}
                title="Girar a la izquierda"
                style={{ background: "#334155", color: "#ffffff", border: "none", borderRadius: "4px", padding: "3px 6px", fontSize: "10px", cursor: "pointer" }}
              >
                ↺ -45°
              </button>
              <button
                type="button"
                onClick={() => handleRotateSelected(45)}
                title="Girar a la derecha"
                style={{ background: "#334155", color: "#ffffff", border: "none", borderRadius: "4px", padding: "3px 6px", fontSize: "10px", cursor: "pointer" }}
              >
                ↻ +45°
              </button>
            </div>

            {/* DUPLICAR */}
            <button
              type="button"
              onClick={handleDuplicateSelected}
              title="Duplicar elemento"
              style={{ background: "#0284c7", color: "#ffffff", border: "none", borderRadius: "4px", padding: "3px 8px", fontSize: "10.5px", fontWeight: 800, cursor: "pointer" }}
            >
              📑 Duplicar
            </button>

            {/* ELIMINAR */}
            <button
              type="button"
              onClick={handleDeleteSelected}
              title="Borrar elemento"
              style={{ background: "#dc2626", color: "#ffffff", border: "none", borderRadius: "4px", padding: "3px 8px", fontSize: "10.5px", fontWeight: 800, cursor: "pointer" }}
            >
              🗑️ Borrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
