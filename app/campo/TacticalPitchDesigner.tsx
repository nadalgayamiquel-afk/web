"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  CampoPitchType,
  CampoPitchTheme,
  CampoGraphicMode,
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

export default function TacticalPitchDesigner({
  initialData,
  onChange,
  readOnly = false,
  height = 540,
}: TacticalPitchDesignerProps) {
  // Modo de diseño gráfico: Pizarra Vectorial, Subir Imagen propia o Plantilla Rápida
  const [graphicMode, setGraphicMode] = useState<CampoGraphicMode>(
    initialData?.graphicMode || (initialData?.imageUrl ? "uploaded_image" : "tactical_pitch")
  );

  // Tema visual del campo
  const [pitchTheme, setPitchTheme] = useState<CampoPitchTheme>(
    initialData?.pitchTheme || "real_turf"
  );

  // Imagen subida por el usuario
  const [uploadedImage, setUploadedImage] = useState<string>(
    initialData?.imageUrl || ""
  );

  // Overlay sobre imagen
  const [drawOverImage, setDrawOverImage] = useState<boolean>(false);

  // Tipo de terreno de juego
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

  // Ajustes de dibujo
  const [drawColor, setDrawColor] = useState<string>("#facc15");
  const [drawWidth, setDrawWidth] = useState<number>(3);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentPath, setCurrentPath] = useState<Array<{ x: number; y: number }>>([]);

  // Flecha interactiva
  const [arrowDraft, setArrowDraft] = useState<{ startX: number; startY: number; curX: number; curY: number } | null>(null);

  // Dragging de elementos
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Guardar en historial
  const pushHistory = useCallback((newElems: CampoElementoGrafico[], newTrazos: CampoFreeDrawPath[]) => {
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      return [...sliced, { elementos: newElems, trazos: newTrazos }];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  // Notificar cambios al componente padre
  useEffect(() => {
    if (onChange) {
      onChange({
        graphicMode,
        pitchType,
        pitchTheme,
        imageUrl: uploadedImage || undefined,
        elementos,
        trazosLibres,
      });
    }
  }, [graphicMode, pitchType, pitchTheme, uploadedImage, elementos, trazosLibres, onChange]);

  // Manejo de subida de imagen
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Por favor, sube un archivo de imagen (PNG, JPG, SVG, WebP).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setUploadedImage(result);
        setGraphicMode("uploaded_image");
      }
    };
    reader.readAsDataURL(file);
  };

  // Drag and drop de archivos sobre el contenedor
  const handleDropImage = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setUploadedImage(result);
          setGraphicMode("uploaded_image");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Pegar imagen del portapapeles
  const handlePasteImage = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const reader = new FileReader();
          reader.onload = (event) => {
            const result = event.target?.result as string;
            if (result) {
              setUploadedImage(result);
              setGraphicMode("uploaded_image");
            }
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
      alert("No se encontró ninguna imagen en el portapapeles. Copia una captura primero.");
    } catch (err) {
      alert("Permiso de portapapeles denegado. Usa el botón 'Seleccionar Archivo'.");
    }
  };

  // Deshacer / Rehacer
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

  // Coordenadas a porcentaje 0-100
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
      defaultColor = "#ef4444";
    } else if (tipo === "jugador_b") {
      const countB = elementos.filter((el) => el.tipo === "jugador_b").length + 1;
      defaultLabel = String(countB);
      defaultColor = "#3b82f6";
    } else if (tipo === "comodin") {
      defaultLabel = "C";
      defaultColor = "#22c55e";
    } else if (tipo === "portero") {
      defaultLabel = "P";
      defaultColor = "#0f172a";
    } else if (tipo === "cono") {
      defaultColor = "#ea580c";
    } else if (tipo === "seta") {
      defaultColor = "#eab308";
    } else if (tipo === "porteria") {
      width = 16;
      height = 6;
      defaultColor = "#ffffff";
    } else if (tipo === "mini_porteria") {
      width = 8;
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
      endX: endX !== undefined ? endX : x + 14,
      endY: endY !== undefined ? endY : y,
    };

    const nextElems = [...elementos, newEl];
    setElementos(nextElems);
    pushHistory(nextElems, trazosLibres);
    setSelectedId(newEl.id);
  };

  // Cargar plantilla táctica rápida
  const handleApplyPreset = (presetKey: string) => {
    let pType: CampoPitchType = "medio_campo";
    let presetElems: CampoElementoGrafico[] = [];

    if (presetKey === "rondo_4v4_3") {
      pType = "reducido";
      presetElems = [
        { id: "z1", tipo: "zona", x: 20, y: 20, width: 60, height: 60, color: "rgba(255,255,255,0.12)", label: "20x20m" },
        { id: "a1", tipo: "jugador_a", x: 20, y: 50, label: "2", color: "#ef4444" },
        { id: "a2", tipo: "jugador_a", x: 50, y: 20, label: "5", color: "#ef4444" },
        { id: "a3", tipo: "jugador_a", x: 80, y: 50, label: "3", color: "#ef4444" },
        { id: "a4", tipo: "jugador_a", x: 50, y: 80, label: "4", color: "#ef4444" },
        { id: "b1", tipo: "jugador_b", x: 38, y: 38, label: "6", color: "#3b82f6" },
        { id: "b2", tipo: "jugador_b", x: 62, y: 38, label: "8", color: "#3b82f6" },
        { id: "b3", tipo: "jugador_b", x: 38, y: 62, label: "7", color: "#3b82f6" },
        { id: "b4", tipo: "jugador_b", x: 62, y: 62, label: "9", color: "#3b82f6" },
        { id: "c1", tipo: "comodin", x: 50, y: 50, label: "C", color: "#22c55e" },
        { id: "c2", tipo: "comodin", x: 20, y: 20, label: "C", color: "#22c55e" },
        { id: "c3", tipo: "comodin", x: 80, y: 80, label: "C", color: "#22c55e" },
        { id: "ball1", tipo: "balon", x: 47, y: 46 },
      ];
    } else if (presetKey === "posesion_6v6_2") {
      pType = "medio_campo";
      presetElems = [
        { id: "z1", tipo: "zona", x: 15, y: 15, width: 70, height: 70, color: "rgba(255,255,255,0.12)", label: "40x35m" },
        { id: "c1", tipo: "comodin", x: 50, y: 12, label: "C1", color: "#22c55e" },
        { id: "c2", tipo: "comodin", x: 50, y: 88, label: "C2", color: "#22c55e" },
        { id: "a1", tipo: "jugador_a", x: 25, y: 30, label: "2", color: "#ef4444" },
        { id: "a2", tipo: "jugador_a", x: 25, y: 70, label: "3", color: "#ef4444" },
        { id: "a3", tipo: "jugador_a", x: 75, y: 30, label: "7", color: "#ef4444" },
        { id: "a4", tipo: "jugador_a", x: 75, y: 70, label: "11", color: "#ef4444" },
        { id: "a5", tipo: "jugador_a", x: 42, y: 50, label: "8", color: "#ef4444" },
        { id: "a6", tipo: "jugador_a", x: 58, y: 50, label: "10", color: "#ef4444" },
        { id: "b1", tipo: "jugador_b", x: 34, y: 38, label: "4", color: "#3b82f6" },
        { id: "b2", tipo: "jugador_b", x: 34, y: 62, label: "5", color: "#3b82f6" },
        { id: "b3", tipo: "jugador_b", x: 66, y: 38, label: "6", color: "#3b82f6" },
        { id: "b4", tipo: "jugador_b", x: 66, y: 62, label: "9", color: "#3b82f6" },
        { id: "b5", tipo: "jugador_b", x: 46, y: 46, label: "14", color: "#3b82f6" },
        { id: "b6", tipo: "jugador_b", x: 54, y: 54, label: "17", color: "#3b82f6" },
        { id: "ball1", tipo: "balon", x: 30, y: 35 },
      ];
    } else if (presetKey === "ssg_5v5") {
      pType = "area_penalti";
      presetElems = [
        { id: "gk1", tipo: "portero", x: 50, y: 6, label: "P", color: "#0f172a" },
        { id: "g1", tipo: "porteria", x: 42, y: 1, width: 16, height: 5 },
        { id: "gk2", tipo: "portero", x: 50, y: 94, label: "P", color: "#0f172a" },
        { id: "g2", tipo: "porteria", x: 42, y: 94, width: 16, height: 5, rotation: 180 },
        { id: "a1", tipo: "jugador_a", x: 35, y: 40, label: "4", color: "#ef4444" },
        { id: "a2", tipo: "jugador_a", x: 65, y: 40, label: "5", color: "#ef4444" },
        { id: "a3", tipo: "jugador_a", x: 50, y: 55, label: "8", color: "#ef4444" },
        { id: "a4", tipo: "jugador_a", x: 25, y: 65, label: "7", color: "#ef4444" },
        { id: "a5", tipo: "jugador_a", x: 75, y: 65, label: "9", color: "#ef4444" },
        { id: "b1", tipo: "jugador_b", x: 38, y: 22, label: "2", color: "#3b82f6" },
        { id: "b2", tipo: "jugador_b", x: 62, y: 22, label: "3", color: "#3b82f6" },
        { id: "b3", tipo: "jugador_b", x: 28, y: 32, label: "6", color: "#3b82f6" },
        { id: "b4", tipo: "jugador_b", x: 72, y: 32, label: "10", color: "#3b82f6" },
        { id: "b5", tipo: "jugador_b", x: 50, y: 38, label: "11", color: "#3b82f6" },
        { id: "ball1", tipo: "balon", x: 40, y: 44 },
      ];
    } else if (presetKey === "finalizacion_3v2") {
      pType = "area_penalti";
      presetElems = [
        { id: "gk1", tipo: "portero", x: 50, y: 8, label: "P", color: "#0f172a" },
        { id: "g1", tipo: "porteria", x: 42, y: 2, width: 16, height: 5 },
        { id: "b1", tipo: "jugador_b", x: 40, y: 28, label: "4", color: "#3b82f6" },
        { id: "b2", tipo: "jugador_b", x: 60, y: 28, label: "5", color: "#3b82f6" },
        { id: "a1", tipo: "jugador_a", x: 28, y: 58, label: "7", color: "#ef4444" },
        { id: "a2", tipo: "jugador_a", x: 50, y: 64, label: "10", color: "#ef4444" },
        { id: "a3", tipo: "jugador_a", x: 72, y: 58, label: "11", color: "#ef4444" },
        { id: "f1", tipo: "flecha_pase", x: 50, y: 64, endX: 30, endY: 48, color: "#facc15" },
        { id: "f2", tipo: "flecha_carrera", x: 72, y: 58, endX: 52, endY: 34, color: "#ffffff" },
        { id: "ball1", tipo: "balon", x: 48, y: 66 },
      ];
    } else if (presetKey === "salida_balon") {
      pType = "medio_campo";
      presetElems = [
        { id: "gk1", tipo: "portero", x: 50, y: 8, label: "P", color: "#0f172a" },
        { id: "g1", tipo: "porteria", x: 42, y: 2, width: 16, height: 5 },
        { id: "a1", tipo: "jugador_a", x: 26, y: 24, label: "4", color: "#ef4444" },
        { id: "a2", tipo: "jugador_a", x: 74, y: 24, label: "5", color: "#ef4444" },
        { id: "a3", tipo: "jugador_a", x: 12, y: 46, label: "2", color: "#ef4444" },
        { id: "a4", tipo: "jugador_a", x: 88, y: 46, label: "3", color: "#ef4444" },
        { id: "a5", tipo: "jugador_a", x: 50, y: 38, label: "6", color: "#ef4444" },
        { id: "b1", tipo: "jugador_b", x: 38, y: 32, label: "9", color: "#3b82f6" },
        { id: "b2", tipo: "jugador_b", x: 62, y: 32, label: "7", color: "#3b82f6" },
        { id: "b3", tipo: "jugador_b", x: 50, y: 50, label: "10", color: "#3b82f6" },
        { id: "mg1", tipo: "mini_porteria", x: 20, y: 92, width: 10, height: 4 },
        { id: "mg2", tipo: "mini_porteria", x: 70, y: 92, width: 10, height: 4 },
        { id: "ball1", tipo: "balon", x: 48, y: 14 },
      ];
    }

    setPitchType(pType);
    setElementos(presetElems);
    setTrazosLibres([]);
    pushHistory(presetElems, []);
    setSelectedId(null);
    setGraphicMode("tactical_pitch");
  };

  // Eventos del SVG para crear elementos y dibujar
  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (readOnly) return;
    const { x, y } = getCoordsPct(e);

    if (activeTool === "lapiz") {
      setIsDrawing(true);
      setCurrentPath([{ x, y }]);
      return;
    }

    if (activeTool.startsWith("flecha")) {
      setArrowDraft({ startX: x, startY: y, curX: x, curY: y });
      return;
    }

    if (activeTool !== "select") {
      handleAddElementAt(activeTool, x, y);
      setActiveTool("select");
      return;
    }

    // Si hace clic en espacio vacío en modo select, deseleccionar
    setSelectedId(null);
  };

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

    // Dragging de elemento seleccionado
    if (draggingId) {
      const nextElems = elementos.map((el) => {
        if (el.id !== draggingId) return el;
        const newX = Math.max(2, Math.min(98, Number((x - dragOffset.x).toFixed(2))));
        const newY = Math.max(2, Math.min(98, Number((y - dragOffset.y).toFixed(2))));

        // Si es flecha, mantener longitud relativa
        if (el.tipo.startsWith("flecha") && el.endX !== undefined && el.endY !== undefined) {
          const deltaX = el.endX - el.x;
          const deltaY = el.endY - el.y;
          return {
            ...el,
            x: newX,
            y: newY,
            endX: Number((newX + deltaX).toFixed(2)),
            endY: Number((newY + deltaY).toFixed(2)),
          };
        }

        return { ...el, x: newX, y: newY };
      });
      setElementos(nextElems);
    }
  };

  const handleSvgMouseUp = () => {
    if (isDrawing) {
      setIsDrawing(false);
      if (currentPath.length > 1) {
        const newPath: CampoFreeDrawPath = {
          id: `path_${Date.now()}`,
          color: drawColor,
          width: drawWidth,
          points: currentPath,
        };
        const nextTrazos = [...trazosLibres, newPath];
        setTrazosLibres(nextTrazos);
        pushHistory(elementos, nextTrazos);
      }
      setCurrentPath([]);
      return;
    }

    if (arrowDraft) {
      const dist = Math.hypot(arrowDraft.curX - arrowDraft.startX, arrowDraft.curY - arrowDraft.startY);
      if (dist > 3) {
        handleAddElementAt(activeTool, arrowDraft.startX, arrowDraft.startY, arrowDraft.curX, arrowDraft.curY);
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

  // Click en elemento para iniciar arrastre
  const handleElementMouseDown = (e: React.MouseEvent, el: CampoElementoGrafico) => {
    e.stopPropagation();
    if (readOnly) return;
    setSelectedId(el.id);
    const { x, y } = getCoordsPct(e);
    setDraggingId(el.id);
    setDragOffset({ x: x - el.x, y: y - el.y });
  };

  // Controles de elemento seleccionado
  const handleRotateSelected = (deltaAngle: number) => {
    if (!selectedId) return;
    const nextElems = elementos.map((el) => {
      if (el.id !== selectedId) return el;
      const currentRot = el.rotation || 0;
      return { ...el, rotation: (currentRot + deltaAngle + 360) % 360 };
    });
    setElementos(nextElems);
    pushHistory(nextElems, trazosLibres);
  };

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    const nextElems = elementos.filter((el) => el.id !== selectedId);
    setElementos(nextElems);
    pushHistory(nextElems, trazosLibres);
    setSelectedId(null);
  };

  const handleDuplicateSelected = () => {
    if (!selectedId) return;
    const target = elementos.find((el) => el.id === selectedId);
    if (!target) return;
    const cloned: CampoElementoGrafico = {
      ...target,
      id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      x: Math.min(95, target.x + 4),
      y: Math.min(95, target.y + 4),
      endX: target.endX !== undefined ? target.endX + 4 : undefined,
      endY: target.endY !== undefined ? target.endY + 4 : undefined,
    };
    const nextElems = [...elementos, cloned];
    setElementos(nextElems);
    pushHistory(nextElems, trazosLibres);
    setSelectedId(cloned.id);
  };

  const handleUpdateLabel = (newLabel: string) => {
    if (!selectedId) return;
    const nextElems = elementos.map((el) => (el.id === selectedId ? { ...el, label: newLabel } : el));
    setElementos(nextElems);
  };

  const selectedElement = elementos.find((el) => el.id === selectedId);

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDropImage}
      style={{
        display: "flex",
        flexDirection: "column",
        background: "#0f172a",
        borderRadius: "14px",
        overflow: "hidden",
        border: "1px solid #334155",
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.5)",
      }}
    >
      {/* ── BARRA SUPERIOR: SELECTOR DE MODO DE DISEÑO ── */}
      {!readOnly && (
        <div
          style={{
            background: "#090d16",
            borderBottom: "1px solid #334155",
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          {/* BOTONES DE MODO DE DISEÑO */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", marginRight: "4px" }}>
              Modo Diseño:
            </span>
            <button
              type="button"
              onClick={() => setGraphicMode("tactical_pitch")}
              style={{
                background: graphicMode === "tactical_pitch" ? "#0284c7" : "#1e293b",
                color: "#ffffff",
                border: graphicMode === "tactical_pitch" ? "1.5px solid #38bdf8" : "1px solid #334155",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span>🎨</span> Pizarra Vectorial Pro
            </button>

            <button
              type="button"
              onClick={() => setGraphicMode("uploaded_image")}
              style={{
                background: graphicMode === "uploaded_image" ? "#0284c7" : "#1e293b",
                color: "#ffffff",
                border: graphicMode === "uploaded_image" ? "1.5px solid #38bdf8" : "1px solid #334155",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span>🖼️</span> Subir Imagen Propia {uploadedImage ? "✓" : ""}
            </button>

            <button
              type="button"
              onClick={() => setGraphicMode("template_quick")}
              style={{
                background: graphicMode === "template_quick" ? "#0284c7" : "#1e293b",
                color: "#ffffff",
                border: graphicMode === "template_quick" ? "1.5px solid #38bdf8" : "1px solid #334155",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span>⚡</span> Plantillas de 1-Clic
            </button>
          </div>

          {/* TEMAS VISUALES DE CAMPO (SI ESTÁ EN PIZARRA) */}
          {graphicMode === "tactical_pitch" && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#94a3b8" }}>
                Estilo Campo:
              </span>
              {[
                { id: "real_turf" as const, label: "🌿 Césped Rayado" },
                { id: "dark_board" as const, label: "🌑 Dark Analista" },
                { id: "whiteboard" as const, label: "📋 Blueprint" },
                { id: "tactical_zones" as const, label: "📐 5 Carriles" },
              ].map((th) => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => setPitchTheme(th.id)}
                  style={{
                    background: pitchTheme === th.id ? "#0284c7" : "#1e293b",
                    color: pitchTheme === th.id ? "#ffffff" : "#94a3b8",
                    border: pitchTheme === th.id ? "1.5px solid #38bdf8" : "1px solid #334155",
                    borderRadius: "4px",
                    padding: "3px 8px",
                    fontSize: "10px",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {th.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MODO 2: SUBIR IMAGEN PROPIA (TACTICALPAD, POWERPOINT, FOTO) ── */}
      {graphicMode === "uploaded_image" && (
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div
            style={{
              background: "#1e293b",
              borderRadius: "10px",
              padding: "16px",
              border: "1px solid #334155",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 900, color: "#f8fafc" }}>
                🖼️ Adjuntar Imagen o Diagrama Diseñado Externamente
              </h4>
              <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>
                Sube una captura de TacticalPad, PowerPoint, KlipDraw, PDF o una foto de tu pizarra de vestuario.
              </p>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>📂</span>
                <span>Seleccionar Archivo</span>
              </button>

              <button
                type="button"
                onClick={handlePasteImage}
                style={{
                  background: "#334155",
                  color: "#f8fafc",
                  border: "1px solid #475569",
                  borderRadius: "8px",
                  padding: "8px 14px",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
                title="Pegar imagen copiada en el portapapeles"
              >
                📋 Pegar Portapapeles
              </button>

              {uploadedImage && (
                <button
                  type="button"
                  onClick={() => setUploadedImage("")}
                  style={{
                    background: "#7f1d1d",
                    color: "#fca5a5",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 14px",
                    fontSize: "12px",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  🗑️ Quitar Imagen
                </button>
              )}
            </div>
          </div>

          {/* VISUALIZADOR DE LA IMAGEN O DROPZONE */}
          {uploadedImage ? (
            <div
              style={{
                position: "relative",
                width: "100%",
                height: typeof height === "number" ? `${height}px` : height,
                background: "#020617",
                borderRadius: "10px",
                overflow: "hidden",
                border: "1px solid #334155",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={uploadedImage}
                alt="Diagrama táctico cargado"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: "12px",
                  left: "12px",
                  background: "rgba(15, 23, 42, 0.8)",
                  backdropFilter: "blur(4px)",
                  color: "#e2e8f0",
                  fontSize: "11px",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontWeight: 700,
                }}
              >
                ✓ Imagen activa guardada con el ejercicio
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: "100%",
                height: "360px",
                border: "2px dashed #475569",
                borderRadius: "12px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                background: "#1e293b",
                textAlign: "center",
                padding: "20px",
              }}
            >
              <div style={{ fontSize: "44px", marginBottom: "12px" }}>📸</div>
              <h4 style={{ margin: "0 0 6px 0", fontSize: "16px", color: "#f8fafc", fontWeight: 800 }}>
                Arrastra tu imagen táctica aquí o haz clic para seleccionarla
              </h4>
              <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#94a3b8", maxWidth: "420px" }}>
                Formatos compatibles: PNG, JPG, JPEG, SVG y WebP. Guarda gráficos de TacticalPad, esquemas de presentaciones o fotos de pizarras.
              </p>
              <span
                style={{
                  background: "#0284c7",
                  color: "#ffffff",
                  padding: "8px 18px",
                  borderRadius: "8px",
                  fontSize: "12.5px",
                  fontWeight: 800,
                }}
              >
                Examinar Archivos
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── MODO 3: PLANTILLAS TÁCTICAS DE 1-CLIC ── */}
      {graphicMode === "template_quick" && (
        <div style={{ padding: "18px 20px" }}>
          <div style={{ marginBottom: "14px" }}>
            <h4 style={{ margin: "0 0 4px 0", fontSize: "15px", fontWeight: 900, color: "#f8fafc" }}>
              ⚡ Plantillas de Tareas Tácticas (1-Clic)
            </h4>
            <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>
              Selecciona una estructura clásica y cárgala directamente en la pizarra con un solo clic para no tener que colocar las piezas una a una.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "14px",
            }}
          >
            {[
              {
                id: "rondo_4v4_3",
                title: "🔄 Rondo 4v4 + 3 Comodines",
                category: "Rondo",
                desc: "4 exteriores, 4 interiores de presión, 3 comodines (2 fuera + 1 dentro).",
                space: "Espacio Reducido (20x20m)",
              },
              {
                id: "posesion_6v6_2",
                title: "🛡️ Juego de Posición 6v6 + 2 Comodines",
                category: "Posesión",
                desc: "Posesión estructurada en medio campo con comodines exteriores para cambio de frente.",
                space: "Medio Campo (40x35m)",
              },
              {
                id: "ssg_5v5",
                title: "⚡ Partido Reducido 5v5 + 2 Porteros",
                category: "SSG",
                desc: "Duelos intensos con porterías reglamentarias para trabajo de potencia aeróbica.",
                space: "Área de Penalti (40x30m)",
              },
              {
                id: "finalizacion_3v2",
                title: "🎯 Finalización 3v2 + Portero",
                category: "Finalización",
                desc: "Triangulación rápida en frontal del área y remate a portería.",
                space: "Área y Frontal",
              },
              {
                id: "salida_balon",
                title: "🚀 Salida de Balón 4+Portero vs 3",
                category: "Construcción",
                desc: "Inicio de juego ante bloque alto rival con progresión a mini-porterías.",
                space: "Zona 1 y 2",
              },
            ].map((p) => (
              <div
                key={p.id}
                onClick={() => handleApplyPreset(p.id)}
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "10px",
                  padding: "14px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  transition: "all 0.15s ease",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 800, color: "#38bdf8", background: "rgba(56,189,248,0.15)", padding: "2px 6px", borderRadius: "4px" }}>
                      {p.category}
                    </span>
                    <span style={{ fontSize: "10px", color: "#94a3b8" }}>{p.space}</span>
                  </div>
                  <h5 style={{ margin: "0 0 6px 0", fontSize: "13.5px", fontWeight: 900, color: "#f8fafc" }}>
                    {p.title}
                  </h5>
                  <p style={{ margin: 0, fontSize: "11.5px", color: "#94a3b8", lineHeight: 1.35 }}>
                    {p.desc}
                  </p>
                </div>

                <button
                  type="button"
                  style={{
                    marginTop: "12px",
                    background: "#0284c7",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 12px",
                    fontSize: "11px",
                    fontWeight: 800,
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  ⚡ Cargar Plantilla en Pizarra
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODO 1: PIZARRA TÁCTICA VECTORIAL INTERACTIVA ── */}
      {graphicMode === "tactical_pitch" && (
        <>
          {/* BARRA DE HERRAMIENTAS Y ACCIONES */}
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
              {/* TIPO DE CAMPO */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>
                  Dimensiones:
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

              {/* BOTONES DESHACER / REHACER / LIMPIAR */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={historyIndex <= 0}
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
                  onClick={() => {
                    if (window.confirm("¿Vaciar todo el campo?")) {
                      setElementos([]);
                      setTrazosLibres([]);
                      pushHistory([], []);
                      setSelectedId(null);
                    }
                  }}
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
              {/* SELECTOR */}
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
                <span>👆</span> Mover
              </button>

              <div style={{ width: "1px", height: "18px", background: "#334155" }} />

              {/* JUGADORES */}
              {[
                { id: "jugador_a" as const, label: "Equipo A", icon: "🔴", color: "#ef4444" },
                { id: "jugador_b" as const, label: "Equipo B", icon: "🔵", color: "#3b82f6" },
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
                { id: "cono" as const, label: "Cono 3D", icon: "🛢️" },
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

              {/* FLECHAS */}
              {[
                { id: "flecha_pase" as const, label: "Pase", icon: "➡️" },
                { id: "flecha_carrera" as const, label: "Carrera", icon: "🏃" },
                { id: "flecha_conduc" as const, label: "Conducción", icon: "🌀" },
                { id: "zona" as const, label: "Zona", icon: "🔲" },
                { id: "lapiz" as const, label: "Lápiz", icon: "✏️" },
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

          {/* ÁREA CENTRAL DEL LIENZO SVG */}
          <div
            style={{
              position: "relative",
              width: "100%",
              height: typeof height === "number" ? `${height}px` : height,
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
              <defs>
                <pattern id="designer_turf_h" width="100" height="12.5" patternUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="100" height="6.25" fill="#1b7337" />
                  <rect x="0" y="6.25" width="100" height="6.25" fill="#16622e" />
                </pattern>
                <pattern id="designer_goal_net" width="1.8" height="1.8" patternUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="1.8" height="1.8" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.25" />
                </pattern>
                <pattern id="designer_blueprint" width="10" height="10" patternUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="10" height="10" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="0.5" />
                </pattern>
                <pattern id="designer_dark_grid" width="10" height="10" patternUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="10" height="10" fill="#0b1320" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                </pattern>
                <linearGradient id="designer_cone_grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fb923c" />
                  <stop offset="50%" stopColor="#ea580c" />
                  <stop offset="100%" stopColor="#9a3412" />
                </linearGradient>
              </defs>

              {/* FONDO SEGÚN TEMA */}
              {pitchTheme === "whiteboard" ? (
                <rect width="100" height="100" fill="url(#designer_blueprint)" />
              ) : pitchTheme === "dark_board" ? (
                <rect width="100" height="100" fill="url(#designer_dark_grid)" />
              ) : (
                <rect width="100" height="100" fill="url(#designer_turf_h)" />
              )}

              {/* 5 CARRILES DE JUEGO DE POSICIÓN SI ESTÁ EN MODO ZONAS */}
              {pitchTheme === "tactical_zones" && (
                <g stroke="rgba(255, 255, 255, 0.25)" strokeDasharray="1.5 1.5" strokeWidth="0.6" fill="none">
                  <line x1="20" y1="3" x2="20" y2="97" />
                  <line x1="38" y1="3" x2="38" y2="97" />
                  <line x1="62" y1="3" x2="62" y2="97" />
                  <line x1="80" y1="3" x2="80" y2="97" />
                  <line x1="3" y1="35" x2="97" y2="35" />
                  <line x1="3" y1="65" x2="97" y2="65" />
                </g>
              )}

              {/* LÍNEAS REGLAMENTARIAS */}
              {renderMarkings(pitchType, pitchTheme === "whiteboard" ? "#1e3a8a" : "#ffffff")}

              {/* TRAZOS LIBRES */}
              {trazosLibres.map((tr) => {
                if (!tr.points || tr.points.length < 2) return null;
                const pathStr = tr.points.reduce((acc, p, idx) => `${acc} ${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`, "");
                return <path key={tr.id} d={pathStr} fill="none" stroke={tr.color} strokeWidth={tr.width * 0.3} strokeLinecap="round" strokeLinejoin="round" />;
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

              {/* FLECHA EN CREACIÓN */}
              {arrowDraft && (
                <line x1={arrowDraft.startX} y1={arrowDraft.startY} x2={arrowDraft.curX} y2={arrowDraft.curY} stroke="#facc15" strokeWidth="1.2" strokeDasharray="2 2" />
              )}

              {/* ELEMENTOS TÁCTICOS */}
              {elementos.map((el) => renderElementOnPitch(el, selectedId, handleElementMouseDown))}
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

                <div style={{ display: "flex", gap: "2px" }}>
                  <button
                    type="button"
                    onClick={() => handleRotateSelected(-45)}
                    style={{ background: "#334155", color: "#ffffff", border: "none", borderRadius: "4px", padding: "3px 6px", fontSize: "10px", cursor: "pointer" }}
                  >
                    ↺ -45°
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRotateSelected(45)}
                    style={{ background: "#334155", color: "#ffffff", border: "none", borderRadius: "4px", padding: "3px 6px", fontSize: "10px", cursor: "pointer" }}
                  >
                    ↻ +45°
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleDuplicateSelected}
                  style={{ background: "#0284c7", color: "#ffffff", border: "none", borderRadius: "4px", padding: "3px 8px", fontSize: "10.5px", fontWeight: 800, cursor: "pointer" }}
                >
                  📑 Duplicar
                </button>

                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  style={{ background: "#dc2626", color: "#ffffff", border: "none", borderRadius: "4px", padding: "3px 8px", fontSize: "10.5px", fontWeight: 800, cursor: "pointer" }}
                >
                  🗑️ Borrar
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE RENDERIZADO INTERNO
// ─────────────────────────────────────────────────────────────────────────────
function renderMarkings(type: CampoPitchType, strokeColor: string) {
  const common = { stroke: strokeColor, strokeWidth: 2, strokeOpacity: 0.85, fill: "none" };

  if (type === "completo_horizontal") {
    return (
      <g {...common}>
        <rect x="3" y="3" width="94" height="94" rx="1.5" />
        <line x1="50" y1="3" x2="50" y2="97" />
        <circle cx="50" cy="50" r="12" />
        <circle cx="50" cy="50" r="0.9" fill={strokeColor} />
        <rect x="3" y="24" width="16" height="52" />
        <rect x="3" y="36" width="6" height="28" />
        <circle cx="13" cy="50" r="0.9" fill={strokeColor} />
        <path d="M 19 40 A 10 10 0 0 1 19 60" />
        <rect x="81" y="24" width="16" height="52" />
        <rect x="91" y="36" width="6" height="28" />
        <circle cx="87" cy="50" r="0.9" fill={strokeColor} />
        <path d="M 81 40 A 10 10 0 0 0 81 60" />
      </g>
    );
  }

  if (type === "completo_vertical") {
    return (
      <g {...common}>
        <rect x="3" y="3" width="94" height="94" rx="1.5" />
        <line x1="3" y1="50" x2="97" y2="50" />
        <circle cx="50" cy="50" r="12" />
        <circle cx="50" cy="50" r="0.9" fill={strokeColor} />
        <rect x="24" y="3" width="52" height="16" />
        <rect x="36" y="3" width="28" height="6" />
        <circle cx="50" cy="13" r="0.9" fill={strokeColor} />
        <path d="M 40 19 A 10 10 0 0 0 60 19" />
        <rect x="24" y="81" width="52" height="16" />
        <rect x="36" y="91" width="28" height="6" />
      </g>
    );
  }

  if (type === "medio_campo") {
    return (
      <g {...common}>
        <rect x="3" y="3" width="94" height="94" rx="1.5" />
        <line x1="3" y1="95" x2="97" y2="95" strokeWidth="2.5" />
        <path d="M 36 95 A 14 14 0 0 1 64 95" />
        <rect x="22" y="3" width="56" height="34" />
        <rect x="35" y="3" width="30" height="12" />
        <circle cx="50" cy="24" r="1" fill={strokeColor} />
        <path d="M 38 37 A 12 12 0 0 0 62 37" />
      </g>
    );
  }

  if (type === "area_penalti") {
    return (
      <g {...common}>
        <rect x="3" y="3" width="94" height="94" rx="1.5" />
        <rect x="12" y="3" width="76" height="62" strokeWidth="2.5" />
        <rect x="30" y="3" width="40" height="20" />
        <circle cx="50" cy="40" r="1.3" fill={strokeColor} />
        <path d="M 34 65 A 16 16 0 0 0 66 65" />
      </g>
    );
  }

  // Reducido
  return (
    <g {...common}>
      <rect x="4" y="4" width="92" height="92" strokeDasharray="4 4" rx="2" />
      <line x1="50" y1="4" x2="50" y2="96" strokeDasharray="2.5 2.5" strokeOpacity="0.4" />
      <line x1="4" y1="50" x2="96" y2="50" strokeDasharray="2.5 2.5" strokeOpacity="0.4" />
      <circle cx="50" cy="50" r="20" strokeOpacity="0.35" strokeDasharray="3 3" />
    </g>
  );
}

function renderElementOnPitch(
  el: CampoElementoGrafico,
  selectedId: string | null,
  onMouseDown: (e: React.MouseEvent, el: CampoElementoGrafico) => void
) {
  const isSelected = selectedId === el.id;

  // JUGADORES Y PORTEROS
  if (el.tipo === "jugador_a" || el.tipo === "jugador_b" || el.tipo === "comodin" || el.tipo === "portero") {
    const radius = 2.7;
    const rot = el.rotation || 0;
    return (
      <g
        key={el.id}
        transform={`translate(${el.x}, ${el.y}) rotate(${rot})`}
        onMouseDown={(e) => onMouseDown(e, el)}
        style={{ cursor: "move" }}
      >
        <ellipse cx="0" cy="0.8" rx={radius + 0.3} ry={radius - 0.5} fill="rgba(0,0,0,0.4)" />
        {isSelected && (
          <circle cx="0" cy="0" r={radius + 1.2} fill="none" stroke="#facc15" strokeWidth="0.9" strokeDasharray="1.8 1.8" />
        )}
        <polygon points="0,-3.8 -1.2,-2.6 1.2,-2.6" fill={el.color || "#ef4444"} stroke="#ffffff" strokeWidth="0.3" />
        <circle cx="0" cy="0" r={radius} fill={el.color || "#ef4444"} stroke="#ffffff" strokeWidth="0.6" />
        <path d={`M -1 -${radius - 0.2} Q 0 -1.2 1 -${radius - 0.2}`} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.4" />
        <text x="0" y="0.9" fontSize="2.4" fontWeight="900" fill="#ffffff" textAnchor="middle" style={{ userSelect: "none" }}>
          {el.tipo === "portero" ? "P" : el.label || "1"}
        </text>
      </g>
    );
  }

  // BALÓN
  if (el.tipo === "balon") {
    return (
      <g key={el.id} transform={`translate(${el.x}, ${el.y})`} onMouseDown={(e) => onMouseDown(e, el)} style={{ cursor: "move" }}>
        <ellipse cx="0" cy="0.6" rx="1.8" ry="1.0" fill="rgba(0,0,0,0.35)" />
        {isSelected && <circle cx="0" cy="0" r="2.8" fill="none" stroke="#facc15" strokeWidth="0.7" strokeDasharray="1 1" />}
        <circle cx="0" cy="0" r="1.8" fill="#ffffff" stroke="#1e293b" strokeWidth="0.4" />
        <polygon points="0,-0.7 0.7,-0.2 0.4,0.6 -0.4,0.6 -0.7,-0.2" fill="#0f172a" />
      </g>
    );
  }

  // CONO
  if (el.tipo === "cono") {
    return (
      <g key={el.id} transform={`translate(${el.x}, ${el.y})`} onMouseDown={(e) => onMouseDown(e, el)} style={{ cursor: "move" }}>
        <ellipse cx="0" cy="1.2" rx="1.8" ry="0.8" fill="rgba(0,0,0,0.35)" />
        {isSelected && <circle cx="0" cy="0" r="2.4" fill="none" stroke="#facc15" strokeWidth="0.6" />}
        <polygon points="-1.5,1.2 1.5,1.2 1.1,0.7 -1.1,0.7" fill="#c2410c" />
        <polygon points="0,-2.2 1.2,0.9 -1.2,0.9" fill="url(#designer_cone_grad)" stroke="#ffffff" strokeWidth="0.25" />
      </g>
    );
  }

  // SETA
  if (el.tipo === "seta") {
    return (
      <g key={el.id} transform={`translate(${el.x}, ${el.y})`} onMouseDown={(e) => onMouseDown(e, el)} style={{ cursor: "move" }}>
        <ellipse cx="0" cy="0.4" rx="1.6" ry="0.8" fill="rgba(0,0,0,0.3)" />
        {isSelected && <circle cx="0" cy="0" r="2.2" fill="none" stroke="#facc15" strokeWidth="0.5" />}
        <path d="M -1.5 0.3 Q 0 -1.4 1.5 0.3 Z" fill={el.color || "#eab308"} stroke="#ffffff" strokeWidth="0.25" />
      </g>
    );
  }

  // PORTERÍAS
  if (el.tipo === "porteria" || el.tipo === "mini_porteria") {
    const isMini = el.tipo === "mini_porteria";
    const w = el.width || (isMini ? 8 : 16);
    const h = el.height || (isMini ? 4 : 6);
    const rot = el.rotation || 0;
    return (
      <g key={el.id} transform={`translate(${el.x}, ${el.y}) rotate(${rot})`} onMouseDown={(e) => onMouseDown(e, el)} style={{ cursor: "move" }}>
        {isSelected && <rect x={-w / 2 - 1.2} y={-h / 2 - 1.2} width={w + 2.4} height={h + 2.4} fill="none" stroke="#facc15" strokeWidth="0.8" strokeDasharray="1.5 1.5" rx="0.5" />}
        <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="url(#designer_goal_net)" stroke="rgba(255,255,255,0.6)" strokeWidth="0.4" />
        <line x1={-w / 2} y1={h / 2} x2={w / 2} y2={h / 2} stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
        <line x1={-w / 2} y1={-h / 2} x2={-w / 2} y2={h / 2} stroke="#ffffff" strokeWidth="1" />
        <line x1={w / 2} y1={-h / 2} x2={w / 2} y2={h / 2} stroke="#ffffff" strokeWidth="1" />
      </g>
    );
  }

  // SILUETA
  if (el.tipo === "silueta") {
    return (
      <g key={el.id} transform={`translate(${el.x}, ${el.y})`} onMouseDown={(e) => onMouseDown(e, el)} style={{ cursor: "move" }}>
        <ellipse cx="0" cy="1.6" rx="1.6" ry="0.7" fill="rgba(0,0,0,0.3)" />
        {isSelected && <circle cx="0" cy="0" r="3" fill="none" stroke="#facc15" strokeWidth="0.6" />}
        <circle cx="0" cy="-1.8" r="0.9" fill="#e2e8f0" stroke="#334155" strokeWidth="0.3" />
        <path d="M -1.4 -0.6 L 1.4 -0.6 L 1.0 1.6 L -1.0 1.6 Z" fill="#94a3b8" stroke="#334155" strokeWidth="0.3" />
      </g>
    );
  }

  // ZONA
  if (el.tipo === "zona") {
    const w = el.width || 24;
    const h = el.height || 18;
    return (
      <g key={el.id} transform={`translate(${el.x}, ${el.y})`} onMouseDown={(e) => onMouseDown(e, el)} style={{ cursor: "move" }}>
        <rect x="0" y="0" width={w} height={h} fill={el.color || "rgba(255, 255, 255, 0.15)"} stroke={isSelected ? "#facc15" : "rgba(255,255,255,0.6)"} strokeWidth={isSelected ? "1" : "0.7"} strokeDasharray="2 2" rx="1" />
        {el.label && <text x={w / 2} y={h / 2 + 1} fontSize="2.2" fontWeight="800" fill="#ffffff" textAnchor="middle">{el.label}</text>}
      </g>
    );
  }

  // TEXTO
  if (el.tipo === "texto") {
    return (
      <g key={el.id} transform={`translate(${el.x}, ${el.y})`} onMouseDown={(e) => onMouseDown(e, el)} style={{ cursor: "move" }}>
        {isSelected && <rect x="-1" y="-3" width="26" height="5" fill="none" stroke="#facc15" strokeWidth="0.6" rx="1" />}
        <rect x="0" y="-2.4" width="24" height="4" fill="rgba(15, 23, 42, 0.85)" rx="0.8" />
        <text x="12" y="0.2" fill="#f8fafc" fontSize="2.1" fontWeight="800" textAnchor="middle">{el.label || "Nota"}</text>
      </g>
    );
  }

  // FLECHAS
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
      <g key={el.id} onMouseDown={(e) => onMouseDown(e, el)} style={{ cursor: "move" }}>
        {isSelected && <line x1={el.x} y1={el.y} x2={endX} y2={endY} stroke="#facc15" strokeWidth="3" strokeOpacity="0.4" />}
        <line x1={el.x} y1={el.y} x2={endX} y2={endY} stroke={el.color || fColor} strokeWidth={isConduc ? "1.4" : "1.0"} strokeDasharray={isPase ? "1.8 1.4" : isConduc ? "2.5 1.2" : undefined} />
        <polygon points={`${endX},${endY} ${x1},${y1} ${x2},${y2}`} fill={el.color || fColor} />
      </g>
    );
  }

  return null;
}
