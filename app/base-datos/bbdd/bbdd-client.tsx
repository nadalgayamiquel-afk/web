"use client";

import { pruneStaleFutureLocalStorage } from "@/app/lib/cleanStorage";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { updateFullBBDDRow, deleteFullBBDDRow, deleteFullBBDDRowsBatch, addFullBBDDRow, clearFullBBDD, importFullBBDDBatch } from "@/app/actions";

type UniqueFilterItem = {
  val: string;
  display: string;
  count: number;
};

type ExcelRow = {
  id: string;
  sesion_dia_id: string;
  jugador_id: string;
  jugador: string;
  periodo: string | null;
  fecha: string;
  subperiodo: string | null;
  semana: number | null;
  md: string | null;
  rival: string | null;
  resultado?: string | null;
  evento_principal?: string | null;
  evento_am?: string | null;
  evento_pm?: string | null;
  carga: string | null;
  volumen: string | null;
  intensidad: string | null;
  comentario_microciclo: string | null;
  disponibilidad: string | null;
  tipo_de_evento?: string | null;
  hora_evento?: string | null;
  lugar_evento?: string | null;
  duracion_evento?: string | null;
  orientacion_evento?: string | null;
  carga_evento?: string | null;
  comentario_general_evento?: string | null;
  num_jugadores_evento?: number | null;
  realiza_evento?: string | null;
  titularidad?: string | null;
  objetivo: string | null;
  comentario_wellness?: string | null;
  comentario_fisioterapia?: string | null;
  comentario_lesion?: string | null;
  comentario_medico: string | null;
  comentario_nutricional: string | null;
  comentario_preparacion_fisica?: string | null;
  comentario_fisico?: string | null;
  comentario_tecnico_tactico?: string | null;
  comentario_tecnico?: string | null;
  num_evento: number | null;
};

type Player = { id: string; nombre: string; apodo: string | null; activo?: boolean };

type Props = {
  initialRows: ExcelRow[];
  players: Player[];
};

export function BBDDTableClient({ initialRows, players }: Props) {
  const [rows, setRows] = useState<ExcelRow[]>(() => (initialRows || []).filter((r) => r && r.fecha && r.fecha >= "2026-10-01"));
  const [busqueda, setBusqueda] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Zoom
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Selección múltiple arrastrando (Click & Drag / Shift + Click / Master Checkbox)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [isDraggingRows, setIsDraggingRows] = useState<boolean>(false);
  const [dragAnchorIndex, setDragAnchorIndex] = useState<number | null>(null);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [dragMode, setDragMode] = useState<"select" | "deselect">("select");

  // Listener global de mouseup para finalizar arrastre
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDraggingRows(false);
      setDragAnchorIndex(null);
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  // Filtros tipo Tabla Dinámica de Excel (selección de valores múltiples con checkboxes)
  const [excelFilterState, setExcelFilterState] = useState<Record<string, string[]>>({});
  const [openFilterCol, setOpenFilterCol] = useState<keyof ExcelRow | null>(null);
  const [tempFilterSelected, setTempFilterSelected] = useState<Set<string>>(new Set());
  const [filterSearchText, setFilterSearchText] = useState<string>("");

  // Obtener valores únicos y conteo para la columna activa
  const currentColumnUniqueValues: UniqueFilterItem[] = useMemo(() => {
    if (!openFilterCol) return [];
    const countsMap = new Map<string, number>();
    rows.forEach((r) => {
      const rawVal = (r as any)[openFilterCol];
      const strVal = rawVal === null || rawVal === undefined ? "" : String(rawVal).trim();
      countsMap.set(strVal, (countsMap.get(strVal) || 0) + 1);
    });

    const list = Array.from(countsMap.entries()).map(([val, count]) => ({
      val,
      display: val === "" ? "(En blanco)" : val,
      count,
    }));

    list.sort((a, b) => {
      if (a.val === "") return 1;
      if (b.val === "") return -1;
      return a.display.localeCompare(b.display, undefined, { numeric: true });
    });

    return list;
  }, [rows, openFilterCol]);

  // Abrir modal de filtro de una columna
  const handleOpenFilterModal = (col: keyof ExcelRow) => {
    setOpenFilterCol(col);
    setFilterSearchText("");

    // Calcular valores únicos
    const countsMap = new Map<string, number>();
    rows.forEach((r) => {
      const rawVal = (r as any)[col];
      const strVal = rawVal === null || rawVal === undefined ? "" : String(rawVal).trim();
      countsMap.set(strVal, (countsMap.get(strVal) || 0) + 1);
    });
    const allVals = Array.from(countsMap.keys());

    if (excelFilterState[col]) {
      setTempFilterSelected(new Set(excelFilterState[col]));
    } else {
      setTempFilterSelected(new Set(allVals));
    }
  };

  const handleToggleTempValue = (val: string) => {
    setTempFilterSelected((prev) => {
      const next = new Set(prev);
      if (next.has(val)) {
        next.delete(val);
      } else {
        next.add(val);
      }
      return next;
    });
  };

  const handleSelectAllTemp = () => {
    const allVals = currentColumnUniqueValues.map((u) => u.val);
    setTempFilterSelected(new Set(allVals));
  };

  const handleDeselectAllTemp = () => {
    setTempFilterSelected(new Set());
  };

  const handleApplyFilter = () => {
    if (!openFilterCol) return;
    const allVals = currentColumnUniqueValues.map((u) => u.val);
    if (tempFilterSelected.size === allVals.length) {
      // Si todos están seleccionados, no hay filtro activo en esta columna
      setExcelFilterState((prev) => {
        const next = { ...prev };
        delete next[openFilterCol];
        return next;
      });
    } else {
      setExcelFilterState((prev) => ({
        ...prev,
        [openFilterCol]: Array.from(tempFilterSelected),
      }));
    }
    setOpenFilterCol(null);
  };

  const handleClearSingleColumnFilter = (col: keyof ExcelRow) => {
    setExcelFilterState((prev) => {
      const next = { ...prev };
      delete next[col];
      return next;
    });
    if (openFilterCol === col) setOpenFilterCol(null);
  };

  const handleClearAllFilters = () => {
    setExcelFilterState({});
    setBusqueda("");
    setOpenFilterCol(null);
  };

  const activeFilterCount = Object.keys(excelFilterState).length;

  // Sincronizar dinámicamente con los eventos reales creados/asignados en /calendario y /eventos
  useEffect(() => {
    if (typeof window === "undefined") return;

    const buildLiveBBDD = async () => {
      try {
        pruneStaleFutureLocalStorage();
        const rawPlanifDays = localStorage.getItem("planificacion_days_v5") || localStorage.getItem("planificacion_days_v4") || localStorage.getItem("planificacion_days_v3") || localStorage.getItem("planificacion_days_v2") || localStorage.getItem("planificacion_days_v1");
        const rawDispMap = localStorage.getItem("planificacion_disponibilidad_map");
        const rawDispMapV1 = localStorage.getItem("disponibilidad_map_v1");
        const planifDaysArr: any[] = rawPlanifDays ? JSON.parse(rawPlanifDays) : [];
        const planifDispMap1: Record<string, string> = rawDispMap ? JSON.parse(rawDispMap) : {};
        const planifDispMap2: Record<string, string> = rawDispMapV1 ? JSON.parse(rawDispMapV1) : {};
        const planifDispMap = { ...planifDispMap2, ...planifDispMap1 };

        const planifDaysByFecha: Record<string, any> = {};
        planifDaysArr.forEach((d) => {
          if (d && d.fecha) planifDaysByFecha[d.fecha] = d;
        });

        const rawBloques = localStorage.getItem("eventos_bloques_map_v5") || localStorage.getItem("eventos_bloques_map_v4") || localStorage.getItem("eventos_bloques_map_v1");
        const rawPlayerEv = localStorage.getItem("player_events_map_v1") || localStorage.getItem("bbdd_player_assignments");
        const rawComentarios = localStorage.getItem("comentarios_jugadores_v2");
        const rawPlanifComentarios = localStorage.getItem("planificacion_comentarios_v1");
        const rawPitchComentarios = localStorage.getItem("disponibilidad_pitch_comments_v1");
        const rawTasks = localStorage.getItem("disponibilidad_session_tasks_v1");
        const rawWellnessComments = localStorage.getItem("cargas_wellness_general_comments_v1");
        const rawMinutes = localStorage.getItem("player_event_minutes_map_v1");

        const localBloques: Record<string, any> = rawBloques ? JSON.parse(rawBloques) : {};
        const localPlayerEv: Record<string, string> = rawPlayerEv ? JSON.parse(rawPlayerEv) : {};
        const comentariosArr: any[] = rawComentarios ? JSON.parse(rawComentarios) : [];
        const planifComentariosArr: any[] = rawPlanifComentarios ? JSON.parse(rawPlanifComentarios) : [];
        const pitchCommentsMap: Record<string, string> = rawPitchComentarios ? JSON.parse(rawPitchComentarios) : {};
        const sessionTasksMap: Record<string, any> = rawTasks ? JSON.parse(rawTasks) : {};
        const wellnessCommentsMap: Record<string, string> = rawWellnessComments ? JSON.parse(rawWellnessComments) : {};
        const minutesMap: Record<string, any> = rawMinutes ? JSON.parse(rawMinutes) : {};

        // No cargar bloques ni asignaciones inventadas >= 2026-10-05 (evita contaminación de 09:30, CONGOST, Manresa, etc.)
        const dateByUuid = new Map<string, string>();
        (planifDaysArr || []).forEach((d) => { if (d.id && d.fecha) dateByUuid.set(d.id, d.fecha); });
        (initialRows || []).forEach((r) => { if (r.sesion_dia_id && r.fecha) dateByUuid.set(r.sesion_dia_id, r.fecha); });

        const bloquesMap: Record<string, any> = {};
        Object.keys(localBloques).forEach((k) => {
          bloquesMap[k] = localBloques[k];
        });

        const playerEvMap: Record<string, string> = {};
        Object.keys(localPlayerEv).forEach((k) => {
          playerEvMap[k] = localPlayerEv[k];
        });

      // mapa de comentarios por jugador y día (combinando ambos almacenamientos)
      const comentariosMap: Record<string, Record<string, string>> = {};
      [...comentariosArr, ...planifComentariosArr].forEach((c) => {
        if (!c || (!c.jugador_id && !c.fecha)) return;
        const fClean = c.fecha || (c.day_id ? c.day_id.replace(/^d_/, "") : "");
        const key = `${c.jugador_id}_${fClean}`;
        if (!comentariosMap[key]) comentariosMap[key] = {};
        if (c.tipo === "WEL") comentariosMap[key].comentario_wellness = c.texto;
        if (c.tipo === "FIS") comentariosMap[key].comentario_fisioterapia = c.texto;
        if (c.tipo === "TEC") comentariosMap[key].comentario_tecnico_tactico = c.texto;
        if (c.tipo === "CON") comentariosMap[key].comentario_preparacion_fisica = c.texto;
        if (c.tipo === "OTR") comentariosMap[key].comentario_medico = c.texto;
      });

      // Añadir tareas de sesión (Técnico-Táctico: TEC) y comentarios de sesión (Condicional: CON) para TEAM
      const allTeamDates = Array.from(new Set([...Object.keys(pitchCommentsMap), ...Object.keys(sessionTasksMap), ...Object.keys(wellnessCommentsMap)]));
      allTeamDates.forEach((f) => {
        const key = `TEAM_${f}`;
        if (!comentariosMap[key]) comentariosMap[key] = {};

        const t = sessionTasksMap[f];
        const parts: string[] = [];
        if (t) {
          if (t.act?.trim()) parts.push(`ACT:${t.act.trim()}`);
          if (t.t1?.trim()) parts.push(`T1:${t.t1.trim()}`);
          if (t.t2?.trim()) parts.push(`T2:${t.t2.trim()}`);
          if (t.t3?.trim()) parts.push(`T3:${t.t3.trim()}`);
          if (t.t4?.trim()) parts.push(`T4:${t.t4.trim()}`);
        }
        const tasksStr = parts.length > 0 ? `(${parts.join(" ")})` : "";
        const pitchCom = (pitchCommentsMap[f] || "").trim();
        const wellnessCom = (wellnessCommentsMap[f] || "").trim();

        if (tasksStr) {
          comentariosMap[key].comentario_tecnico_tactico = tasksStr;
        }
        if (pitchCom) {
          comentariosMap[key].comentario_preparacion_fisica = pitchCom;
        }
        if (wellnessCom) {
          comentariosMap[key].comentario_fisioterapia = wellnessCom;
        }
      });

      // Recopilar únicamente fechas que tengan datos reales en la planificación (>= 2026-07-01)
      const fechasSet = new Set<string>();
      
      // 0. Fechas desde planificacion_days con datos
      planifDaysArr.forEach((d) => {
        if (d && d.fecha && d.fecha >= "2026-07-01") {
          const hasDayData = Boolean(
            (d.rival && d.rival.trim() !== "") ||
            (d.carga && String(d.carga).trim() !== "") ||
            (d.volumen && String(d.volumen).trim() !== "") ||
            (d.evento && d.evento.trim() !== "") ||
            (d.evento_1 && d.evento_1.trim() !== "") ||
            (d.evento_2 && d.evento_2.trim() !== "") ||
            (d.evento_3 && d.evento_3.trim() !== "") ||
            (d.evento_4 && d.evento_4.trim() !== "") ||
            (d.comentario_microciclo && d.comentario_microciclo.trim() !== "")
          );
          if (hasDayData) {
            fechasSet.add(d.fecha);
          }
        }
      });

      // 1. Fechas desde bloques de eventos
      Object.keys(bloquesMap).forEach((k) => {
        const b = bloquesMap[k];
        if (b && (b.tipo || b.hora || b.lugar || b.duracion || b.orientacion || b.carga || b.comentario)) {
          const f = b.fecha || b.day_id;
          if (f && /^\d{4}-\d{2}-\d{2}$/.test(f) && f >= "2026-07-01") fechasSet.add(f);
        }
        if (k.includes("_slot_")) {
          const datePart = k.split("_slot_")[0];
          if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && datePart >= "2026-07-01") fechasSet.add(datePart);
        }
      });

      // 2. Fechas desde playerEvMap
      Object.keys(playerEvMap).forEach((k) => {
        if (playerEvMap[k] && playerEvMap[k].trim() !== "") {
          const parts = k.split("_");
          const lastPart = parts[parts.length - 1];
          if (/^\d{4}-\d{2}-\d{2}$/.test(lastPart) && lastPart >= "2026-07-01") {
            fechasSet.add(lastPart);
          }
        }
      });

      // 3. Fechas desde comentarios
      comentariosArr.forEach((c) => {
        const f = c.day_id || c.fecha;
        if (f && /^\d{4}-\d{2}-\d{2}$/.test(f) && f >= "2026-07-01") {
          fechasSet.add(f);
        }
      });

      // 4. Fechas desde disponibilidad
      Object.keys(planifDispMap).forEach((k) => {
        if (planifDispMap[k] && planifDispMap[k].trim() !== "") {
          const parts = k.split("_");
          const lastPart = parts[parts.length - 1];
          if (/^\d{4}-\d{2}-\d{2}$/.test(lastPart) && lastPart >= "2026-07-01") {
            fechasSet.add(lastPart);
          }
        }
      });

      const localFechasList = Array.from(fechasSet);

      const newLiveRows: ExcelRow[] = [];

      localFechasList.sort().forEach((fechaStr) => {
          const planifDay = planifDaysByFecha[fechaStr] || {};

          // Obtener los bloques de eventos para este día (slot 0, 1, 2...)
          const daySlots: { slotIdx: number; block: any }[] = [];
          for (let sIdx = 0; sIdx < 6; sIdx++) {
            const keyDate1 = `${fechaStr}_slot_${sIdx}`;
            const keyDate2 = planifDay.id ? `${planifDay.id}_slot_${sIdx}` : "";
            const b = bloquesMap[keyDate1] || (keyDate2 ? bloquesMap[keyDate2] : null);
            if (b && (b.tipo || b.hora || b.lugar || b.duracion || b.orientacion || b.carga || b.comentario)) {
              daySlots.push({ slotIdx: sIdx, block: b });
            }
          }

          // Fallback a eventos de Planificación si no hay bloques creados en /eventos
          if (daySlots.length === 0) {
            const evTypes = [planifDay.evento_1 || planifDay.evento_am || planifDay.evento, planifDay.evento_2 || planifDay.evento_pm, planifDay.evento_3, planifDay.evento_4].filter(Boolean);
            if (evTypes.length > 0) {
              evTypes.forEach((t, i) => {
                daySlots.push({
                  slotIdx: i,
                  block: {
                    tipo: t,
                    hora: "",
                    lugar: "",
                    duracion: "",
                    orientacion: "",
                    carga: planifDay.carga ? String(planifDay.carga) : "",
                    comentario: planifDay.comentario_microciclo || "",
                  },
                });
              });
            }
          }

          // 1. Fila TEAM para cada evento del día
          daySlots.forEach(({ slotIdx, block }, idx) => {
            const evNum = idx + 1;
            const rowId = `TEAM_${fechaStr}_ev${evNum}`;
            const planifDay = planifDaysByFecha[fechaStr] || {};
            const evCode = (block.tipo || "").trim().toLowerCase();

            // Calcular número real de jugadores convocados a este evento
            let countAssigned = 0;
            if (Array.isArray(players)) {
              const activePlayers = players.filter((p) => p.activo !== false);
              activePlayers.forEach((p) => {
                const normP = (str?: string | null) => (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
                const pNormId = normP(p.id);
                const pNormNombre = normP(p.nombre);
                const pNormApodo = normP(p.apodo);

                let assignedCodesStr = "";
                Object.keys(playerEvMap).forEach((k) => {
                  const isMatchingDate = k.endsWith(`_${fechaStr}`) || (planifDay.id && k.endsWith(`_${planifDay.id}`));
                  if (isMatchingDate) {
                    const dateSuffix = k.endsWith(`_${fechaStr}`) ? `_${fechaStr}` : `_${planifDay.id}`;
                    const prefix = k.replace(dateSuffix, "");
                    const normPrefix = normP(prefix);
                    if (
                      normPrefix === pNormId ||
                      (pNormApodo && normPrefix === pNormApodo) ||
                      (pNormNombre && normPrefix === pNormNombre) ||
                      (pNormId && (pNormId.startsWith(normPrefix) || normPrefix.startsWith(pNormId))) ||
                      (pNormApodo && (pNormApodo.startsWith(normPrefix) || normPrefix.startsWith(pNormApodo))) ||
                      (pNormNombre && (pNormNombre.startsWith(normPrefix) || normPrefix.startsWith(pNormNombre)))
                    ) {
                      if (playerEvMap[k]) {
                        assignedCodesStr = assignedCodesStr ? `${assignedCodesStr}, ${playerEvMap[k]}` : playerEvMap[k];
                      }
                    }
                  }
                });

                const codesList = assignedCodesStr.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
                const tieneAsign = assignedCodesStr.trim() !== ""
                  ? (codesList.includes(evCode) || codesList.some((c) => c.startsWith(evCode) || evCode.startsWith(c)))
                  : true;

                if (tieneAsign) countAssigned++;
              });
            }

            const numJugadoresCalculado = block.num_jugadores ? Number(block.num_jugadores) : (countAssigned > 0 ? countAssigned : null);
            const exactHora = block.hora || "";

            const evPrincipal = (planifDay.evento_am || planifDay.evento || block.tipo || "").toLowerCase();
            const tipoEv = (block.tipo || "").toLowerCase();
            const isOptimizador = evPrincipal.includes("opt") || evPrincipal.includes("op") || tipoEv.includes("opt") || tipoEv.includes("op") || evNum === 1;

            const teamCom = comentariosMap[`TEAM_${fechaStr}`] || comentariosMap[`TEAM_${planifDay.id}`] || {};
            const teamPitchCom = pitchCommentsMap[fechaStr] || pitchCommentsMap[planifDay.id] || teamCom.comentario_tecnico_tactico || "";
            const teamPrepFisica = teamCom.comentario_preparacion_fisica || "";
            const teamFisioterapia = wellnessCommentsMap[fechaStr] || wellnessCommentsMap[planifDay.id] || teamCom.comentario_fisioterapia || "";

            const finalTeamTecnico = isOptimizador ? teamPitchCom : "";
            const finalTeamPrepFisica = isOptimizador ? teamPrepFisica : "";
            const finalTeamFisioterapia = isOptimizador ? teamFisioterapia : "";

            newLiveRows.push({
              id: rowId,
              sesion_dia_id: fechaStr,
              jugador_id: "TEAM",
              jugador: "TEAM",
              periodo: planifDay.periodo || "",
              fecha: fechaStr,
              subperiodo: planifDay.subperiodo || "",
              semana: planifDay.semana ?? null,
              md: planifDay.md || "",
              rival: planifDay.rival || "",
              resultado: planifDay.resultado_partido || "",
              evento_principal: planifDay.evento_am || planifDay.evento || (block.tipo === "PA" ? "PAL" : (block.tipo || "")),
              carga: planifDay.carga ? String(planifDay.carga) : (block.carga || ""),
              volumen: planifDay.volumen ? String(planifDay.volumen) : "",
              intensidad: planifDay.intensidad ? String(planifDay.intensidad) : "",
              comentario_microciclo: evNum === 1 ? (planifDay.comentario_microciclo || block.comentario || "") : "",
              disponibilidad: "",
              tipo_de_evento: block.tipo || "",
              hora_evento: exactHora,
              lugar_evento: block.lugar || "",
              duracion_evento: block.duracion || "",
              orientacion_evento: block.orientacion || "",
              carga_evento: block.carga || "",
              comentario_general_evento: block.comentario || "",
              num_jugadores_evento: numJugadoresCalculado,
              realiza_evento: "SI",
              objetivo: "",
              comentario_wellness: "",
              comentario_fisioterapia: finalTeamFisioterapia,
              comentario_lesion: "",
              comentario_medico: "",
              comentario_nutricional: "",
              comentario_preparacion_fisica: finalTeamPrepFisica,
              comentario_tecnico_tactico: finalTeamTecnico,
              comentario_tecnico: finalTeamTecnico,
              num_evento: evNum,
            });
          });

          // 2. Filas por Jugador: solo jugadores activos (no archivados)
          if (Array.isArray(players)) {
            players
              .filter((p) => p.activo !== false)
              .forEach((p) => {
              const normP = (str?: string | null) => (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
              const pNormId = normP(p.id);
              const pNormNombre = normP(p.nombre);
              const pNormApodo = normP(p.apodo);

              let assignedCodesStr = "";
              Object.keys(playerEvMap).forEach((k) => {
                const isMatchingDate = k.endsWith(`_${fechaStr}`) || (planifDay.id && k.endsWith(`_${planifDay.id}`));
                if (isMatchingDate) {
                  const dateSuffix = k.endsWith(`_${fechaStr}`) ? `_${fechaStr}` : `_${planifDay.id}`;
                  const prefix = k.replace(dateSuffix, "");
                  const normPrefix = normP(prefix);
                  if (
                    normPrefix === pNormId ||
                    (pNormApodo && normPrefix === pNormApodo) ||
                    (pNormNombre && normPrefix === pNormNombre) ||
                    (pNormId && (pNormId.startsWith(normPrefix) || normPrefix.startsWith(pNormId))) ||
                    (pNormApodo && (pNormApodo.startsWith(normPrefix) || normPrefix.startsWith(pNormApodo))) ||
                    (pNormNombre && (pNormNombre.startsWith(normPrefix) || normPrefix.startsWith(pNormNombre)))
                  ) {
                    if (playerEvMap[k]) {
                      assignedCodesStr = assignedCodesStr ? `${assignedCodesStr}, ${playerEvMap[k]}` : playerEvMap[k];
                    }
                  }
                }
              });

              const codesList = assignedCodesStr.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);

              const pKey1 = `${p.id}_${fechaStr}`;
              const pCom = comentariosMap[pKey1] || {};

              daySlots.forEach(({ slotIdx, block }, idx) => {
                const evNum = slotIdx + 1;
                const evCode = (block.tipo || "").trim().toLowerCase();

                // 1. Filtrar: solo crear la fila si el jugador TIENE este evento en Planificación
                let tieneEsteEvento = false;
                if (assignedCodesStr.trim() !== "") {
                  tieneEsteEvento = codesList.includes(evCode) || codesList.some((c) => c.startsWith(evCode) || evCode.startsWith(c));
                  if (!tieneEsteEvento) {
                    return; // Si el jugador no tiene este evento en Planificación, NO se crea la fila
                  }
                } else {
                  // Si no hay asignación específica: solo incluir si es un evento único de equipo y el jugador no es baja
                  let playerDispCheck = "";
                  const pKeys = [p.id, pNormId, pNormApodo, pNormNombre, p.apodo, p.nombre].filter(Boolean);
                  for (const pk of pKeys) {
                    const val1 = planifDispMap[`${pk}_${fechaStr}`];
                    const val2 = planifDay.id ? planifDispMap[`${pk}_${planifDay.id}`] : null;
                    if (val1) { playerDispCheck = val1; break; }
                    if (val2) { playerDispCheck = val2; break; }
                  }
                  const esBajaOLesion = playerDispCheck === "B" || playerDispCheck === "L" || playerDispCheck === "NO";
                  if (daySlots.length > 1 || esBajaOLesion) {
                    return;
                  }
                  tieneEsteEvento = true;
                }

                // 2. Disponibilidad del jugador en este día
                let playerDisp = "";
                const possibleDispPlayerKeys = [p.id, pNormId, pNormApodo, pNormNombre, p.apodo, p.nombre].filter(Boolean);
                for (const pk of possibleDispPlayerKeys) {
                  const val1 = planifDispMap[`${pk}_${fechaStr}`];
                  const val2 = planifDay.id ? planifDispMap[`${pk}_${planifDay.id}`] : null;
                  if (val1) { playerDisp = val1; break; }
                  if (val2) { playerDisp = val2; break; }
                }

                // 3. Minutaje individual específico si existe en minutesMap
                let minData: any = {};
                const possiblePlayerKeys = [p.id, pNormId, pNormApodo, pNormNombre].filter(Boolean);
                const possibleBlockKeys = [block.id, `ev_${fechaStr}_${slotIdx}`, `ev_${planifDay.id}_${slotIdx}`, block.tipo].filter(Boolean);

                for (const pk of possiblePlayerKeys) {
                  for (const bk of possibleBlockKeys) {
                    const candidateKey1 = `${pk}_${fechaStr}_${bk}`;
                    const candidateKey2 = `${pk}_${planifDay.id}_${bk}`;
                    if (minutesMap[candidateKey1]) {
                      minData = minutesMap[candidateKey1];
                      break;
                    }
                    if (minutesMap[candidateKey2]) {
                      minData = minutesMap[candidateKey2];
                      break;
                    }
                  }
                  if (minData.minutos !== undefined || minData.comentario) break;
                }

                const rowId = `${p.id}_${fechaStr}_ev${evNum}`;

                const commWellness = pCom.comentario_wellness || (minData.tipo === "WEL" ? minData.comentario : "") || "";
                const commFisio = pCom.comentario_fisioterapia || (minData.tipo === "FIS" ? minData.comentario : "") || "";
                const commMedico = pCom.comentario_medico || (minData.tipo === "OTR" ? minData.comentario : "") || "";
                const commPrepFisica = pCom.comentario_preparacion_fisica || (minData.tipo === "CON" ? minData.comentario : "") || "";
                const commTecnico = pCom.comentario_tecnico_tactico || (minData.tipo === "TEC" ? minData.comentario : "") || "";

                // Duración: minutaje individual si existe, si no la duración real del bloque
                let duracionJugadorEvento = "";
                if (minData.minutos !== undefined && minData.minutos !== null) {
                  duracionJugadorEvento = String(minData.minutos);
                } else if (pCom.duracion_evento !== undefined && pCom.duracion_evento !== null && String(pCom.duracion_evento) !== "") {
                  duracionJugadorEvento = String(pCom.duracion_evento);
                } else {
                  duracionJugadorEvento = block.duracion || "";
                }

                const volumenSesionGlobal = planifDay.volumen ? String(planifDay.volumen) : "";

                // 4. Asignar el evento exacto con sus características reales
                newLiveRows.push({
                  id: rowId,
                  sesion_dia_id: fechaStr,
                  jugador_id: p.id,
                  jugador: (p.apodo || p.nombre).toUpperCase(),
                  periodo: planifDay.periodo || "",
                  fecha: fechaStr,
                  subperiodo: planifDay.subperiodo || "",
                  semana: planifDay.semana ?? null,
                  md: planifDay.md || "",
                  rival: planifDay.rival || "",
                  resultado: planifDay.resultado_partido || "",
                  evento_principal: planifDay.evento_am || planifDay.evento || block.tipo || "",
                  carga: planifDay.carga ? String(planifDay.carga) : (block.carga || ""),
                  volumen: volumenSesionGlobal,
                  intensidad: planifDay.intensidad ? String(planifDay.intensidad) : "",
                  comentario_microciclo: planifDay.comentario_microciclo || "",
                  disponibilidad: playerDisp || "D",
                  tipo_de_evento: block.tipo || "",
                  hora_evento: block.hora || "",
                  lugar_evento: block.lugar || "",
                  duracion_evento: duracionJugadorEvento,
                  orientacion_evento: block.orientacion || "",
                  carga_evento: block.carga || (planifDay.carga ? String(planifDay.carga) : ""),
                  comentario_general_evento: minData.comentario || block.comentario || "",
                  num_jugadores_evento: block.num_jugadores ? Number(block.num_jugadores) : null,
                  realiza_evento: "SI",
                  titularidad: (block.tipo || "").trim().toLowerCase() === "pa" || planifDay.evento === "PA" ? minData.titularidad || "" : "",
                  objetivo: "",
                  comentario_wellness: commWellness,
                  comentario_fisioterapia: commFisio,
                  comentario_lesion: "",
                  comentario_medico: commMedico,
                  comentario_nutricional: "",
                  comentario_preparacion_fisica: commPrepFisica,
                  comentario_tecnico_tactico: commTecnico,
                  comentario_tecnico: commTecnico,
                  num_evento: evNum,
                });
              });
            });
          }
        });

        // 1. Obtener conjunto de IDs, nombres y apodos normalizados de jugadores archivados (activo === false)
        const normP = (str?: string | null) => (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        const archivedPlayersNorm = new Set<string>();
        if (Array.isArray(players)) {
          players.forEach((p) => {
            if (p.activo === false) {
              if (p.id) archivedPlayersNorm.add(normP(p.id));
              if (p.nombre) archivedPlayersNorm.add(normP(p.nombre));
              if (p.apodo) archivedPlayersNorm.add(normP(p.apodo));
            }
          });
        }

        // 2. Conservar filas válidas de la BBDD inicial (>= 2026-10-01)
        const cleanInitial = (initialRows || []).filter((r) => r && r.fecha && r.fecha >= "2026-10-01");

        // 3. Filtrar newLiveRows por fecha (>= 2026-10-01) y por si quedase algún deportista archivado
        const cleanLive = newLiveRows.filter((r) => {
          if (r && r.fecha && r.fecha < "2026-10-01") return false;
          if (r.jugador_id === "TEAM") return true;
          const rowJugNorm = normP(r.jugador || r.jugador_id);
          return !archivedPlayersNorm.has(rowJugNorm);
        });

        // 4. Fusionar cleanInitial y cleanLive sin duplicados usando un Map por ID
        const rowsMap = new Map<string, ExcelRow>();

        cleanInitial.forEach((r) => {
          if (r && r.id) {
            rowsMap.set(r.id, r);
          }
        });

        cleanLive.forEach((r) => {
          if (!r || !r.id) return;
          if (rowsMap.has(r.id)) {
            rowsMap.set(r.id, { ...rowsMap.get(r.id)!, ...r });
          } else {
            rowsMap.set(r.id, r);
          }
        });

        const allCombined = Array.from(rowsMap.values());

        setRows(allCombined);
      } catch (err) {}
  };

  buildLiveBBDD();

  const handleUpdate = () => {
    buildLiveBBDD();
  };

  window.addEventListener("storage", handleUpdate);
  window.addEventListener("eventos_bloques_updated", handleUpdate);
  window.addEventListener("player_events_updated", handleUpdate);
  window.addEventListener("planificacion_updated", handleUpdate);

  return () => {
    window.removeEventListener("storage", handleUpdate);
    window.removeEventListener("eventos_bloques_updated", handleUpdate);
    window.removeEventListener("player_events_updated", handleUpdate);
    window.removeEventListener("planificacion_updated", handleUpdate);
  };
}, [initialRows, players]);

  // Estado de Ordenación por Columna
  const [sortColumn, setSortColumn] = useState<keyof ExcelRow | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const handleSort = (col: keyof ExcelRow) => {
    if (sortColumn === col) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortColumn(null);
        setSortDirection("asc");
      }
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  };

  // Estado del equipo/temporada activa
  const [activeInfo] = useState<{ season: string; team: string }>(() => {
    if (typeof window !== "undefined") {
      try {
        const seasonsRaw = localStorage.getItem("active_seasons");
        const teamRaw = localStorage.getItem("active_team");
        const seasons = seasonsRaw ? JSON.parse(seasonsRaw) : ["2026/27"];
        const team = (teamRaw && !teamRaw.toLowerCase().includes("manresa")) ? teamRaw : "CE Europa";
        return { season: seasons.join(", "), team };
      } catch (e) {}
    }
    return { season: "2026/27", team: "CE Europa" };
  });

  // Formulario para añadir nueva fila
  const [newRow, setNewRow] = useState({
    jugador_id: "TEAM",
    fecha: new Date().toISOString().slice(0, 10),
    periodo: "P",
    subperiodo: "PRIMERA SEMANA",
    semana: 1,
    md: "> -5MD",
    rival: "",
    evento_am: "E",
    evento_pm: "",
    carga: "6",
    volumen: "8",
    intensidad: "4",
    comentario_microciclo: "",
    disponibilidad: "D",
    comentario_lesion: "",
    comentario_medico: "",
    comentario_nutricional: "",
    comentario_fisico: "",
    comentario_tecnico: "",
  });

  const filteredRows = rows.filter((r) => {
    // 1. Filtro global de búsqueda
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim();
      const matchGlobal =
        (r.jugador || "").toLowerCase().includes(q) ||
        (r.fecha || "").toLowerCase().includes(q) ||
        (r.rival || "").toLowerCase().includes(q) ||
        (r.periodo || "").toLowerCase().includes(q) ||
        (r.subperiodo || "").toLowerCase().includes(q) ||
        (r.md || "").toLowerCase().includes(q) ||
        (r.resultado || "").toLowerCase().includes(q) ||
        (r.evento_principal || "").toLowerCase().includes(q) ||
        (r.evento_am || "").toLowerCase().includes(q) ||
        (r.tipo_de_evento || "").toLowerCase().includes(q) ||
        (r.disponibilidad || "").toLowerCase().includes(q) ||
        (r.lugar_evento || "").toLowerCase().includes(q) ||
        (r.orientacion_evento || "").toLowerCase().includes(q) ||
        (r.comentario_microciclo || "").toLowerCase().includes(q) ||
        (r.comentario_general_evento || "").toLowerCase().includes(q) ||
        String(r.realiza_evento || "").toLowerCase().includes(q) ||
        (r.titularidad || "").toLowerCase().includes(q) ||
        (r.objetivo || "").toLowerCase().includes(q) ||
        (r.comentario_wellness || "").toLowerCase().includes(q) ||
        (r.comentario_fisioterapia || "").toLowerCase().includes(q) ||
        (r.comentario_lesion || "").toLowerCase().includes(q) ||
        (r.comentario_medico || "").toLowerCase().includes(q) ||
        (r.comentario_nutricional || "").toLowerCase().includes(q) ||
        (r.comentario_preparacion_fisica || "").toLowerCase().includes(q) ||
        (r.comentario_fisico || "").toLowerCase().includes(q) ||
        (r.comentario_tecnico_tactico || "").toLowerCase().includes(q) ||
        (r.comentario_tecnico || "").toLowerCase().includes(q);

      if (!matchGlobal) return false;
    }

    // 2. Filtros de Tabla Dinámica de Excel (valores seleccionados con checkbox por cada columna)
    for (const [colKey, allowedValues] of Object.entries(excelFilterState)) {
      if (!allowedValues || allowedValues.length === 0) continue;
      const rawCell = (r as any)[colKey];
      const cellStr = rawCell === null || rawCell === undefined ? "" : String(rawCell).trim();
      if (!allowedValues.includes(cellStr)) {
        return false;
      }
    }

    return true;
  });

  const displayedRows = [...filteredRows].sort((a, b) => {
    if (!sortColumn) return 0;
    let valA = a[sortColumn];
    let valB = b[sortColumn];

    if (valA === null || valA === undefined) valA = "";
    if (valB === null || valB === undefined) valB = "";

    if (typeof valA === "number" && typeof valB === "number") {
      return sortDirection === "asc" ? valA - valB : valB - valA;
    }

    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();

    if (strA < strB) return sortDirection === "asc" ? -1 : 1;
    if (strA > strB) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const handleCellEdit = async (id: string, field: keyof ExcelRow, value: any) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

    // Persistir duracion_evento o titularidad editada en localStorage
    if ((field === "duracion_evento" || field === "titularidad") && typeof window !== "undefined") {
      try {
        const rowToEdit = rows.find((r) => r.id === id);
        if (rowToEdit && rowToEdit.jugador_id !== "TEAM") {
          const rawMinutes = localStorage.getItem("player_event_minutes_map_v1");
          const minutesMap: Record<string, any> = rawMinutes ? JSON.parse(rawMinutes) : {};
          const slotIdx = (rowToEdit.num_evento ?? 1) - 1;
          const minuteKey = `${rowToEdit.jugador_id}_${rowToEdit.fecha}_ev_${rowToEdit.fecha}_${slotIdx}`;
          minutesMap[minuteKey] = {
            ...minutesMap[minuteKey],
            [field === "duracion_evento" ? "minutos" : "titularidad"]: value,
          };
          localStorage.setItem("player_event_minutes_map_v1", JSON.stringify(minutesMap));
        } else if (rowToEdit && rowToEdit.jugador_id === "TEAM" && field === "duracion_evento") {
          const rawBloques = localStorage.getItem("eventos_bloques_map_v5") || localStorage.getItem("eventos_bloques_map_v1");
          const bloquesMap: Record<string, any> = rawBloques ? JSON.parse(rawBloques) : {};
          const slotIdx = (rowToEdit.num_evento ?? 1) - 1;
          const keyDate = `${rowToEdit.fecha}_slot_${slotIdx}`;
          bloquesMap[keyDate] = {
            ...bloquesMap[keyDate],
            duracion: value,
          };
          localStorage.setItem("eventos_bloques_map_v5", JSON.stringify(bloquesMap));
          localStorage.setItem("eventos_bloques_map_v1", JSON.stringify(bloquesMap));
        }
      } catch (e) {}
    }

    if (field !== "titularidad") {
      try {
        await updateFullBBDDRow(id, field as string, value);
      } catch (e: any) {
        console.error("Error al actualizar la celda en Supabase:", e.message);
      }
    }
  };

  const handleExportCSV = () => {
    const dataToExport = displayedRows.length > 0 ? displayedRows : rows;
    if (!dataToExport || dataToExport.length === 0) return;

    const headers = [
      "Jugador", "Periodo", "Fecha", "Subperiodo", "Semana", "MD", "Rival", "Resultado",
      "Evento Principal", "Carga", "Volumen", "Intensidad", "Comentario Microciclo",
      "Disponibilidad", "Tipo de Evento", "Hora Evento", "Lugar Evento", "Duracion Evento",
      "Orientacion Evento", "Carga Evento", "Comentario General Evento", "Nº Jugadores Evento",
      "Realiza Evento", "Titularidad", "Objetivo", "Comentario Wellness", "Comentario Fisioterapia",
      "Comentario Médico", "Comentario Nutricional", "Comentario Prep. Física",
      "Comentario Técnico-Táctico", "Nº Evento"
    ];

    const csvRows = [headers.join(",")];

    dataToExport.forEach((r) => {
      const rowVals = [
        r.jugador, r.periodo, r.fecha, r.subperiodo, r.semana, r.md, r.rival, r.resultado,
        r.evento_principal, r.carga, r.volumen, r.intensidad, r.comentario_microciclo,
        r.disponibilidad, r.tipo_de_evento, r.hora_evento, r.lugar_evento, r.duracion_evento,
        r.orientacion_evento, r.carga_evento, r.comentario_general_evento, r.num_jugadores_evento,
        r.realiza_evento, r.titularidad, r.objetivo, r.comentario_wellness, r.comentario_fisioterapia,
        r.comentario_medico, r.comentario_nutricional, r.comentario_preparacion_fisica,
        r.comentario_tecnico_tactico, r.num_evento
      ].map((v) => {
        const valStr = v === null || v === undefined ? "" : String(v).replace(/"/g, '""');
        return `"${valStr}"`;
      });
      csvRows.push(rowVals.join(","));
    });

    const csvContent = "\uFEFF" + csvRows.join("\n"); // BOM para caracteres de acentos en Excel
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `bbdd_general_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRowMouseDown = (index: number, rowId: string, e: React.MouseEvent) => {
    // Si hace click en inputs, selects o botones de la celda, no iniciar arrastre
    const targetTag = (e.target as HTMLElement).tagName.toUpperCase();
    if (targetTag === "INPUT" || targetTag === "BUTTON" || targetTag === "SELECT") {
      return;
    }

    e.preventDefault(); // Evita selección accidental de texto al arrastrar

    if (e.shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          if (displayedRows[i]) next.add(displayedRows[i].id);
        }
        return next;
      });
      setLastClickedIndex(index);
      return;
    }

    const isCurrentlySelected = selectedRowIds.has(rowId);
    const mode = isCurrentlySelected ? "deselect" : "select";
    setDragMode(mode);
    setIsDraggingRows(true);
    setDragAnchorIndex(index);
    setLastClickedIndex(index);

    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (mode === "select") {
        next.add(rowId);
      } else {
        next.delete(rowId);
      }
      return next;
    });
  };

  const handleRowMouseEnter = (index: number) => {
    if (!isDraggingRows || dragAnchorIndex === null) return;
    const start = Math.min(dragAnchorIndex, index);
    const end = Math.max(dragAnchorIndex, index);

    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      for (let i = start; i <= end; i++) {
        const r = displayedRows[i];
        if (!r) continue;
        if (dragMode === "select") {
          next.add(r.id);
        } else {
          next.delete(r.id);
        }
      }
      return next;
    });
  };

  const isAllDisplayedSelected =
    displayedRows.length > 0 && displayedRows.every((r) => selectedRowIds.has(r.id));

  const handleToggleSelectAll = () => {
    if (isAllDisplayedSelected) {
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        displayedRows.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        displayedRows.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRowIds.size === 0) return;
    const count = selectedRowIds.size;
    if (!confirm(`¿Eliminar definitivamente las ${count} filas seleccionadas de la Base de Datos?`)) return;

    setIsSaving(true);
    try {
      const idsToDelete = Array.from(selectedRowIds);
      await deleteFullBBDDRowsBatch(idsToDelete);
      setRows((prev) => prev.filter((r) => !selectedRowIds.has(r.id)));
      setSelectedRowIds(new Set());
      alert(`Se han eliminado ${count} filas correctamente.`);
    } catch (err: any) {
      alert("Error al eliminar filas en lote: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta fila de la BBDD?")) return;
    setIsSaving(true);
    try {
      await deleteFullBBDDRow(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e: any) {
      alert("Error al eliminar: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await addFullBBDDRow(newRow);
      setShowAddModal(false);
      window.location.reload();
    } catch (err: any) {
      alert("Error al añadir fila: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Estado para menú de 3 puntos, modal de importación con mapeo de columnas y modal de confirmación de limpieza
  const [showOptionsDropdown, setShowOptionsDropdown] = useState<boolean>(false);
  const [showClearModal, setShowClearModal] = useState<boolean>(false);
  const [clearConfirmText, setClearConfirmText] = useState<string>("");
  const [isClearing, setIsClearing] = useState<boolean>(false);

  // Estados de importación CSV con mapeo de columnas
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRowsData, setCsvRowsData] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = useState<boolean>(false);

  const BBDD_SYSTEM_FIELDS = [
    { label: "Sin mapear (Ignorar)", value: "" },
    { label: "Jugador / Deportista", value: "jugador" },
    { label: "Fecha", value: "fecha" },
    { label: "Periodo", value: "periodo" },
    { label: "Subperiodo", value: "subperiodo" },
    { label: "Semana", value: "semana" },
    { label: "MD", value: "md" },
    { label: "Rival", value: "rival" },
    { label: "Evento Principal / AM", value: "evento_principal" },
    { label: "Evento PM", value: "evento_pm" },
    { label: "Carga", value: "carga" },
    { label: "Volumen", value: "volumen" },
    { label: "Intensidad", value: "intensidad" },
    { label: "Comentario Microciclo", value: "comentario_microciclo" },
    { label: "Disponibilidad", value: "disponibilidad" },
    { label: "Tipo de Evento (Col AO)", value: "tipo_de_evento" },
    { label: "Hora del Evento (Col AP)", value: "hora_evento" },
    { label: "Lugar del Evento (Col AQ)", value: "lugar_evento" },
    { label: "Duración del Evento (Col AR)", value: "duracion_evento" },
    { label: "Orientación del Evento (Col AS)", value: "orientacion_evento" },
    { label: "Carga del Evento (Col AT)", value: "carga_evento" },
    { label: "Comentario Evento (Col AU)", value: "comentario_general_evento" },
    { label: "Nº Jugadores Evento (Col AV)", value: "num_jugadores_evento" },
    { label: "Realiza Evento (Col AW)", value: "realiza_evento" },
    { label: "Titularidad (Col AX)", value: "titularidad" },
    { label: "Objetivo", value: "objetivo" },
    { label: "Comentario Wellness", value: "comentario_wellness" },
    { label: "Comentario Fisioterapia", value: "comentario_fisioterapia" },
    { label: "Comentario Médico", value: "comentario_medico" },
    { label: "Comentario Nutricional", value: "comentario_nutricional" },
    { label: "Comentario Prep. Física", value: "comentario_preparacion_fisica" },
    { label: "Comentario Técnico-Táctico", value: "comentario_tecnico_tactico" },
  ];

  const handleImportCSVClick = () => {
    setShowOptionsDropdown(false);
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".csv,.txt,.xlsx,.xlsm,.xls";
    fileInput.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;

      try {
        let parsedHeaders: string[] = [];
        let parsedData: string[][] = [];

        if (file.name.endsWith(".xlsx") || file.name.endsWith(".xlsm") || file.name.endsWith(".xls")) {
          const buffer = await file.arrayBuffer();
          const wb = XLSX.read(buffer, { type: "array" });
          const targetSheetName = wb.SheetNames.find((s) => s.toLowerCase().includes("bbdd")) || wb.SheetNames[0];
          const ws = wb.Sheets[targetSheetName];
          const rawGrid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

          if (!rawGrid || rawGrid.length < 2) {
            alert("El libro Excel no contiene suficientes datos en la hoja seleccionada.");
            return;
          }

          parsedHeaders = (rawGrid[0] || []).map((h) => (h !== undefined && h !== null ? String(h).trim() : ""));
          parsedData = rawGrid.slice(1).map((row) =>
            (row || []).map((cell) => {
              if (cell === undefined || cell === null) return "";
              if (typeof cell === "number" && cell > 35000 && cell < 60000) {
                // Conversión de formato de fecha numérico de Excel (ej: 46223 -> 2026-07-20)
                const dateObj = XLSX.SSF.parse_date_code(cell);
                if (dateObj) {
                  const m = String(dateObj.m).padStart(2, "0");
                  const d = String(dateObj.d).padStart(2, "0");
                  return `${dateObj.y}-${m}-${d}`;
                }
              }
              return String(cell).trim();
            })
          );
        } else {
          const text = await file.text();
          const rawLines = text.split(/\r?\n/).filter((l: string) => l.trim() !== "");
          if (rawLines.length < 2) {
            alert("El archivo CSV no contiene suficientes filas.");
            return;
          }

          const detectDelimiter = (line: string): string => {
            const commaCount = (line.match(/,/g) || []).length;
            const semiCount = (line.match(/;/g) || []).length;
            const tabCount = (line.match(/\t/g) || []).length;
            if (semiCount > commaCount && semiCount > tabCount) return ";";
            if (tabCount > commaCount && tabCount > semiCount) return "\t";
            return ",";
          };

          const delim = detectDelimiter(rawLines[0]);

          const parseCsvLine = (csvLine: string): string[] => {
            const result: string[] = [];
            let startValue = 0;
            let inQuotes = false;
            for (let i = 0; i < csvLine.length; i++) {
              const c = csvLine[i];
              if (c === '"') {
                inQuotes = !inQuotes;
              } else if (c === delim && !inQuotes) {
                let val = csvLine.substring(startValue, i).trim();
                if (val.startsWith('"') && val.endsWith('"')) {
                  val = val.substring(1, val.length - 1).replace(/""/g, '"');
                }
                result.push(val);
                startValue = i + 1;
              }
            }
            let lastVal = csvLine.substring(startValue).trim();
            if (lastVal.startsWith('"') && lastVal.endsWith('"')) {
              lastVal = lastVal.substring(1, lastVal.length - 1).replace(/""/g, '"');
            }
            result.push(lastVal);
            return result;
          };

          parsedHeaders = parseCsvLine(rawLines[0]);
          parsedData = rawLines.slice(1).map((l: string) => parseCsvLine(l));
        }

        setCsvHeaders(parsedHeaders);
        setCsvRowsData(parsedData);

        // Auto-mapeo inteligente sugerido por nombre de cabecera
        const initialMap: Record<string, string> = {};
        parsedHeaders.forEach((h, idx) => {
          if (!h) return;
          const hNorm = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

          if (hNorm === "jugador" || hNorm.includes("deportista")) {
            initialMap[`col_${idx}`] = "jugador";
          } else if (hNorm === "fecha") {
            initialMap[`col_${idx}`] = "fecha";
          } else if (hNorm === "periodo") {
            initialMap[`col_${idx}`] = "periodo";
          } else if (hNorm === "subperiodo") {
            initialMap[`col_${idx}`] = "subperiodo";
          } else if (hNorm.includes("semana")) {
            initialMap[`col_${idx}`] = "semana";
          } else if (hNorm === "md") {
            initialMap[`col_${idx}`] = "md";
          } else if (hNorm === "rival") {
            initialMap[`col_${idx}`] = "rival";
          } else if (hNorm.includes("evento am") || hNorm.includes("evento principal")) {
            initialMap[`col_${idx}`] = "evento_principal";
          } else if (hNorm.includes("evento pm")) {
            initialMap[`col_${idx}`] = "evento_pm";
          } else if (hNorm === "carga") {
            initialMap[`col_${idx}`] = "carga";
          } else if (hNorm === "volumen") {
            initialMap[`col_${idx}`] = "volumen";
          } else if (hNorm === "intensidad") {
            initialMap[`col_${idx}`] = "intensidad";
          } else if (hNorm.includes("disponibilidad")) {
            initialMap[`col_${idx}`] = "disponibilidad";
          } else if (hNorm.includes("tipo de evento") || hNorm.includes("tipo evento")) {
            initialMap[`col_${idx}`] = "tipo_de_evento";
          } else if (hNorm.includes("hora evento") || hNorm.includes("hora del evento")) {
            initialMap[`col_${idx}`] = "hora_evento";
          } else if (hNorm.includes("lugar evento") || hNorm.includes("lugar del evento")) {
            initialMap[`col_${idx}`] = "lugar_evento";
          } else if (hNorm.includes("duracion evento") || hNorm.includes("duracion del evento")) {
            initialMap[`col_${idx}`] = "duracion_evento";
          } else if (hNorm.includes("orientacion evento") || hNorm.includes("orientacion del evento")) {
            initialMap[`col_${idx}`] = "orientacion_evento";
          } else if (hNorm.includes("carga evento") || hNorm.includes("carga del evento")) {
            initialMap[`col_${idx}`] = "carga_evento";
          } else if (hNorm.includes("comentario general evento") || hNorm.includes("comentario evento")) {
            initialMap[`col_${idx}`] = "comentario_general_evento";
          } else if (hNorm.includes("jugadores evento") || hNorm.includes("num jugadores")) {
            initialMap[`col_${idx}`] = "num_jugadores_evento";
          } else if (hNorm.includes("realiza evento") || hNorm.includes("realiza el evento")) {
            initialMap[`col_${idx}`] = "realiza_evento";
          } else if (hNorm.includes("titularidad") || hNorm.includes("titular")) {
            initialMap[`col_${idx}`] = "titularidad";
          } else if (hNorm.includes("wellness")) {
            initialMap[`col_${idx}`] = "comentario_wellness";
          } else if (hNorm.includes("fisioterapia") || hNorm.includes("lesion") || hNorm.includes("lesiones")) {
            initialMap[`col_${idx}`] = "comentario_fisioterapia";
          } else if (hNorm.includes("medico") || hNorm.includes("medica")) {
            initialMap[`col_${idx}`] = "comentario_medico";
          } else if (hNorm.includes("nutricion") || hNorm.includes("nutricional")) {
            initialMap[`col_${idx}`] = "comentario_nutricional";
          } else if (hNorm.includes("preparacion") || hNorm.includes("fisica") || hNorm.includes("fisico")) {
            initialMap[`col_${idx}`] = "comentario_preparacion_fisica";
          } else if (hNorm.includes("tecnico") || hNorm.includes("tactico")) {
            initialMap[`col_${idx}`] = "comentario_tecnico_tactico";
          } else {
            const found = BBDD_SYSTEM_FIELDS.find((f) => {
              if (!f.value) return false;
              const fNorm = f.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
              return hNorm === fNorm || (hNorm.length >= 4 && fNorm.includes(hNorm));
            });
            initialMap[`col_${idx}`] = found ? found.value : "";
          }
        });

        setColumnMapping(initialMap);
        setShowImportModal(true);
      } catch (err: any) {
        alert("Error procesando el archivo: " + err.message);
      }
    };
    fileInput.click();
  };

  const handleConfirmImport = async () => {
    setIsImporting(true);
    try {
      const rowsPayload = csvRowsData.map((rowVals) => {
        const rowObj: Record<string, any> = {};
        csvHeaders.forEach((_, idx) => {
          const mappedKey = columnMapping[`col_${idx}`];
          if (mappedKey) {
            rowObj[mappedKey] = rowVals[idx] || "";
          }
        });
        return rowObj;
      });

      const res = await importFullBBDDBatch(rowsPayload);
      setShowImportModal(false);
      alert(`🎉 Importación completada con éxito. Se procesaron ${(res as any).count || rowsPayload.length} filas.`);
      window.location.reload();
    } catch (err: any) {
      alert("Error al importar filas: " + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClearBBDDSubmit = async () => {
    if (clearConfirmText.trim().toUpperCase() !== "BORRAR") {
      alert("Por favor escribe exactamente BORRAR para confirmar la eliminación de la base de datos.");
      return;
    }

    setIsClearing(true);
    try {
      await clearFullBBDD();

      // Limpiar caché local de eventos y rivales preservando comentarios de Wellness
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem("planificacion_days_v2");
          localStorage.removeItem("player_events_map_v1");
          localStorage.removeItem("eventos_bloques_map_v1");
          localStorage.removeItem("rival_evento_map_v1");
        } catch (e) {}
      }

      setShowClearModal(false);
      setClearConfirmText("");
      alert("Base de datos y planificación limpiadas. Los comentarios de tipo Wellness han sido preservados.");
      window.location.reload();
    } catch (err: any) {
      alert("Error al limpiar la base de datos: " + err.message);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div style={{ padding: "16px 24px", maxWidth: "1800px", margin: "0 auto", fontFamily: "sans-serif" }}>
      {/* NAVEGACIÓN SUPERIOR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <Link href="/" style={{ color: "#0284c7", fontSize: "12px", fontWeight: 700, textDecoration: "none", display: "inline-block", marginBottom: "4px" }}>
            ← Volver al Centro de Control
          </Link>
          <span style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "#64748b", letterSpacing: "0.05em" }}>
            BASE DE DATOS GENERAL / {activeInfo.team.toUpperCase()} ({activeInfo.season})
          </span>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 900, color: "#0f172a" }}>
            BBDD General — {activeInfo.team} ({activeInfo.season})
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", position: "relative" }}>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            style={{
              background: "#0284c7",
              color: "#ffffff",
              border: "none",
              padding: "9px 18px",
              borderRadius: "8px",
              fontWeight: 800,
              fontSize: "13px",
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(2,132,199,0.3)",
            }}
          >
            + Añadir Fila
          </button>

          {/* BOTÓN DE TRES PUNTOS */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowOptionsDropdown((prev) => !prev)}
              style={{
                background: "#f1f5f9",
                color: "#334155",
                border: "1px solid #cbd5e1",
                padding: "8px 14px",
                borderRadius: "8px",
                fontWeight: 900,
                fontSize: "18px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: "1",
              }}
              title="Opciones de BBDD"
            >
              ⋮
            </button>

            {showOptionsDropdown && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  marginTop: "6px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15)",
                  width: "210px",
                  zIndex: 99,
                  overflow: "hidden",
                  padding: "6px 0",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowOptionsDropdown(false);
                    handleExportCSV();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "10px 14px",
                    background: "transparent",
                    border: "none",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#1e293b",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  📥 Exportar a CSV
                </button>

                <button
                  type="button"
                  onClick={handleImportCSVClick}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "10px 14px",
                    background: "transparent",
                    border: "none",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#1e293b",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  📤 Importar BBDD
                </button>

                <div style={{ height: "1px", background: "#f1f5f9", margin: "4px 0" }} />

                <button
                  type="button"
                  onClick={() => {
                    setShowOptionsDropdown(false);
                    setShowClearModal(true);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "10px 14px",
                    background: "transparent",
                    border: "none",
                    fontSize: "13px",
                    fontWeight: 800,
                    color: "#ef4444",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  🗑️ Limpiar BBDD
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL INTERACTIVO DE MAPEO DE COLUMNAS CSV */}
      {showImportModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              padding: "24px 28px",
              borderRadius: "14px",
              maxWidth: "650px",
              width: "92%",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              border: "1px solid #cbd5e1",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "22px" }}>🔗</span>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 900, color: "#0f172a" }}>
                  Emparejar Columnas del CSV
                </h3>
              </div>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#0284c7", background: "#e0f2fe", padding: "4px 8px", borderRadius: "6px" }}>
                {csvRowsData.length} filas detectadas
              </span>
            </div>

            <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 16px 0", lineHeight: "1.4" }}>
              Asigna a qué campo del sistema corresponde cada columna de tu archivo CSV antes de importar a Supabase.
            </p>

            {/* LISTA DE COLUMNAS PARA EMPAREJAR */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "12px 16px",
                marginBottom: "16px",
                background: "#f8fafc",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {csvHeaders.map((headerName, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    background: "#ffffff",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                  }}
                >
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <span style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "#64748b" }}>
                      COLUMNA CSV #{idx + 1}
                    </span>
                    <strong style={{ fontSize: "13px", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                      {headerName || `(Columna ${idx + 1})`}
                    </strong>
                  </div>

                  <span style={{ color: "#94a3b8", fontWeight: 800 }}>➔</span>

                  <div style={{ flex: 1 }}>
                    <select
                      value={columnMapping[`col_${idx}`] || ""}
                      onChange={(e) =>
                        setColumnMapping((prev) => ({
                          ...prev,
                          [`col_${idx}`]: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        fontSize: "12px",
                        fontWeight: 700,
                        borderRadius: "6px",
                        border: columnMapping[`col_${idx}`] ? "1px solid #0284c7" : "1px solid #cbd5e1",
                        background: columnMapping[`col_${idx}`] ? "#f0f9ff" : "#ffffff",
                        color: columnMapping[`col_${idx}`] ? "#0369a1" : "#475569",
                        outline: "none",
                      }}
                    >
                      {BBDD_SYSTEM_FIELDS.map((fieldOption) => (
                        <option key={fieldOption.value} value={fieldOption.value}>
                          {fieldOption.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            {/* BOTONES DE ACCIÓN */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                disabled={isImporting}
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  border: "none",
                  padding: "9px 18px",
                  borderRadius: "8px",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting}
                style={{
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  padding: "9px 20px",
                  borderRadius: "8px",
                  fontWeight: 800,
                  fontSize: "13px",
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(2,132,199,0.3)",
                }}
              >
                {isImporting ? "Importando a BBDD..." : "Confirmar Importación"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CHECK SEGURIDAD PARA LIMPIAR BBDD */}
      {showClearModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              padding: "24px 28px",
              borderRadius: "14px",
              maxWidth: "460px",
              width: "90%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              border: "1px solid #fecaca",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <span style={{ fontSize: "24px" }}>⚠️</span>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 900, color: "#991b1b" }}>
                ¿Limpiar toda la Base de Datos?
              </h3>
            </div>

            <p style={{ fontSize: "13px", color: "#475569", lineHeight: "1.5", marginBottom: "16px" }}>
              Esta acción **eliminará permanentemente** todos los registros de sesiones y comentarios de jugadores almacenados en Supabase BBDD. Esta acción no se puede deshacer.
            </p>

            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "12px", marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#7f1d1d", marginBottom: "6px" }}>
                Escribe <span style={{ background: "#fee2e2", padding: "2px 6px", borderRadius: "4px" }}>BORRAR</span> para confirmar:
              </label>
              <input
                type="text"
                value={clearConfirmText}
                onChange={(e) => setClearConfirmText(e.target.value)}
                placeholder="Escribe BORRAR aquí..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #dc2626",
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#991b1b",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => {
                  setShowClearModal(false);
                  setClearConfirmText("");
                }}
                disabled={isClearing}
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleClearBBDDSubmit}
                disabled={isClearing || clearConfirmText.trim().toUpperCase() !== "BORRAR"}
                style={{
                  background: clearConfirmText.trim().toUpperCase() === "BORRAR" ? "#dc2626" : "#fca5a5",
                  color: "#ffffff",
                  border: "none",
                  padding: "8px 18px",
                  borderRadius: "6px",
                  fontWeight: 800,
                  fontSize: "13px",
                  cursor: clearConfirmText.trim().toUpperCase() === "BORRAR" ? "pointer" : "not-allowed",
                  boxShadow: clearConfirmText.trim().toUpperCase() === "BORRAR" ? "0 2px 4px rgba(220,38,38,0.3)" : "none",
                }}
              >
                {isClearing ? "Eliminando..." : "Sí, Limpiar BBDD"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BARRA DE BÚSQUEDA, FILTROS Y ZOOM */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#ffffff",
          padding: "10px 14px",
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          marginBottom: "12px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        {/* BUSCADOR GLOBAL Y RESUMEN DE FILTROS ACTIVOS */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: "10px", color: "#64748b", fontSize: "12px" }}>🔍</span>
            <input
              type="text"
              placeholder="Búsqueda rápida en BBDD..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{
                padding: "6px 12px 6px 30px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "12px",
                fontWeight: 600,
                width: "250px",
                outline: "none",
              }}
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda("")}
                style={{
                  position: "absolute",
                  right: "8px",
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 900,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {(activeFilterCount > 0 || busqueda) && (
            <button
              type="button"
              onClick={handleClearAllFilters}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "#fee2e2",
                color: "#b91c1c",
                border: "1px solid #fca5a5",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "11.5px",
                fontWeight: 800,
                cursor: "pointer",
              }}
              title="Borrar todos los filtros activos"
            >
              <span>✕</span>
              <span>
                Limpiar {activeFilterCount} {activeFilterCount === 1 ? "filtro activo" : "filtros activos"}
                {busqueda ? " + búsqueda" : ""}
              </span>
            </button>
          )}
        </div>

        {/* CONTROLES DE ZOOM Y RECUENTO DE FILAS */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          {/* BARRA DE ZOOM */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "#f1f5f9",
              padding: "3px 6px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", marginRight: "2px" }}>
              🔍 Zoom:
            </span>

            <button
              type="button"
              onClick={() => setZoomLevel((prev) => Math.max(prev - 10, 50))}
              style={{
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "4px",
                width: "24px",
                height: "24px",
                fontSize: "13px",
                fontWeight: 900,
                color: "#1e293b",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Reducir zoom"
            >
              −
            </button>

            {[75, 90, 100, 110, 125].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setZoomLevel(pct)}
                style={{
                  background: zoomLevel === pct ? "#1e293b" : "#ffffff",
                  color: zoomLevel === pct ? "#ffffff" : "#475569",
                  border: zoomLevel === pct ? "1px solid #0f172a" : "1px solid #cbd5e1",
                  borderRadius: "4px",
                  padding: "2px 6px",
                  fontSize: "10.5px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {pct}%
              </button>
            ))}

            <button
              type="button"
              onClick={() => setZoomLevel((prev) => Math.min(prev + 10, 160))}
              style={{
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "4px",
                width: "24px",
                height: "24px",
                fontSize: "13px",
                fontWeight: 900,
                color: "#1e293b",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Aumentar zoom"
            >
              +
            </button>
          </div>

          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            <strong>{filteredRows.length}</strong> de <strong>{rows.length}</strong> filas
          </div>
        </div>
      </div>

      {/* VENTANITA EMERGENTE DE FILTRO ESTILO TABLA DINÁMICA DE EXCEL */}
      {openFilterCol && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(2px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setOpenFilterCol(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #cbd5e1",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
              width: "350px",
              maxWidth: "92vw",
              overflow: "hidden",
              fontFamily: "inherit",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* CABECERA DE LA VENTANITA */}
            <div
              style={{
                background: "#0f172a",
                color: "#ffffff",
                padding: "10px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "14px" }}>📊</span>
                <span style={{ fontSize: "13px", fontWeight: 900 }}>
                  Filtro: {openFilterCol.replaceAll("_", " ").toUpperCase()}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpenFilterCol(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#cbd5e1",
                  fontSize: "14px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* BOTONES DE ACCIÓN RÁPIDA: ORDENACIÓN Y LIMPIAR */}
            <div style={{ padding: "8px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", gap: "6px" }}>
              <button
                type="button"
                onClick={() => {
                  setSortColumn(openFilterCol);
                  setSortDirection("asc");
                }}
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "5px",
                  cursor: "pointer",
                  color: "#334155",
                }}
              >
                Ordenar A → Z
              </button>
              <button
                type="button"
                onClick={() => {
                  setSortColumn(openFilterCol);
                  setSortDirection("desc");
                }}
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "5px",
                  cursor: "pointer",
                  color: "#334155",
                }}
              >
                Ordenar Z → A
              </button>
              {excelFilterState[openFilterCol] && (
                <button
                  type="button"
                  onClick={() => handleClearSingleColumnFilter(openFilterCol)}
                  style={{
                    padding: "5px 8px",
                    fontSize: "11px",
                    fontWeight: 800,
                    background: "#fee2e2",
                    color: "#b91c1c",
                    border: "1px solid #fca5a5",
                    borderRadius: "5px",
                    cursor: "pointer",
                  }}
                  title="Eliminar filtro de esta columna"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* BUSCADOR DENTRO DE LOS VALORES */}
            <div style={{ padding: "8px 12px", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <span style={{ position: "absolute", left: "8px", color: "#64748b", fontSize: "11px" }}>🔍</span>
                <input
                  type="text"
                  placeholder="Buscar en la lista..."
                  value={filterSearchText}
                  onChange={(e) => setFilterSearchText(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "5px 8px 5px 26px",
                    fontSize: "11.5px",
                    borderRadius: "5px",
                    border: "1px solid #cbd5e1",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* BOTONES RÁPIDOS SELECCIONAR TODOS / NINGUNO */}
            <div style={{ padding: "6px 12px", background: "#f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={handleSelectAllTemp}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#0284c7",
                    fontSize: "11px",
                    fontWeight: 800,
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  Seleccionar todos
                </button>
                <span style={{ color: "#cbd5e1" }}>|</span>
                <button
                  type="button"
                  onClick={handleDeselectAllTemp}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#64748b",
                    fontSize: "11px",
                    fontWeight: 800,
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  Deseleccionar todos
                </button>
              </div>
              <span style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 700 }}>
                {tempFilterSelected.size} / {currentColumnUniqueValues.length}
              </span>
            </div>

            {/* LISTA CON SCROLL DE VALORES Y CHECKBOXES */}
            <div style={{ maxHeight: "220px", overflowY: "auto", padding: "6px 12px" }}>
              {currentColumnUniqueValues
                .filter((item) => !filterSearchText.trim() || item.display.toLowerCase().includes(filterSearchText.toLowerCase().trim()))
                .map((item) => {
                  const isChecked = tempFilterSelected.has(item.val);
                  return (
                    <label
                      key={`chk_${item.val}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "5px 6px",
                        borderRadius: "5px",
                        fontSize: "11.5px",
                        cursor: "pointer",
                        userSelect: "none",
                        background: isChecked ? "#f0f9ff" : "transparent",
                        marginBottom: "2px",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = isChecked ? "#f0f9ff" : "transparent")}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleTempValue(item.val)}
                          style={{ cursor: "pointer", accentColor: "#0284c7" }}
                        />
                        <span
                          style={{
                            fontWeight: isChecked ? 700 : 500,
                            color: item.val === "" ? "#94a3b8" : "#0f172a",
                            fontStyle: item.val === "" ? "italic" : "normal",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.display}
                        </span>
                      </div>
                      <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700, marginLeft: "8px" }}>
                        {item.count}
                      </span>
                    </label>
                  );
                })}
            </div>

            {/* PIE CON BOTONES APLICAR Y CANCELAR */}
            <div style={{ padding: "10px 14px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setOpenFilterCol(null)}
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplyFilter}
                style={{
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  padding: "6px 18px",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(2,132,199,0.3)",
                }}
              >
                Aplicar Filtro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TABLA PRINCIPAL EXCEL CON ZOOM */}
      <div
        style={{
          overflowX: "auto",
          background: "#ffffff",
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
          width: "100%",
        }}
      >
        <div style={{ zoom: `${zoomLevel}%`, minWidth: "100%", width: "max-content" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", whiteSpace: "nowrap" }}>
            <thead>
              {/* FILA 1: TÍTULOS DE COLUMNAS CON BOTONCITO DE FILTRO EXCEL Y CHECKBOX SELECCIONAR TODO */}
              <tr style={{ background: "#0f172a", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "8px 8px", fontWeight: 900, textAlign: "center", width: "100px", background: "#0f172a" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    <input
                      type="checkbox"
                      checked={isAllDisplayedSelected}
                      onChange={handleToggleSelectAll}
                      style={{ cursor: "pointer", accentColor: "#0284c7" }}
                      title={isAllDisplayedSelected ? "Deseleccionar todas las filas" : "Seleccionar todas las filas mostradas"}
                    />
                    <span style={{ fontSize: "11px" }}>Acción</span>
                  </div>
                </th>
                {[
                  { col: "jugador" as const, title: "Jugador", bg: "#1e293b", width: "110px" },
                  { col: "periodo" as const, title: "Periodo", width: "60px" },
                  { col: "fecha" as const, title: "Fecha", width: "90px" },
                  { col: "subperiodo" as const, title: "Subperiodo", width: "80px" },
                  { col: "semana" as const, title: "Nº Semana", width: "70px" },
                  { col: "md" as const, title: "MD", width: "60px" },
                  { col: "rival" as const, title: "Rival", width: "100px" },
                  { col: "resultado" as const, title: "Resultado", bg: "#1e3a8a", width: "80px" },
                  { col: "evento_principal" as const, title: "Evento principal", bg: "#0284c7", width: "110px" },
                  { col: "carga" as const, title: "Carga", width: "55px" },
                  { col: "volumen" as const, title: "Volumen", width: "65px" },
                  { col: "intensidad" as const, title: "Intensidad", width: "75px" },
                  { col: "comentario_microciclo" as const, title: "Comentario Microciclo", width: "140px" },
                  { col: "disponibilidad" as const, title: "Disponibilidad", bg: "#166534", width: "90px" },
                  { col: "tipo_de_evento" as const, title: "Tipo de evento", bg: "#0e7490", width: "100px" },
                  { col: "hora_evento" as const, title: "Hora del evento", width: "90px" },
                  { col: "lugar_evento" as const, title: "Lugar del evento", width: "100px" },
                  { col: "duracion_evento" as const, title: "Duracion del evento", width: "110px" },
                  { col: "orientacion_evento" as const, title: "Orientacion del evento", width: "120px" },
                  { col: "carga_evento" as const, title: "Carga del evento", width: "100px" },
                  { col: "comentario_general_evento" as const, title: "Comentario general evento", bg: "#0284c7", width: "150px" },
                  { col: "num_jugadores_evento" as const, title: "Nº Jugadores del evento", width: "120px" },
                  { col: "realiza_evento" as const, title: "REALIZA EL EVENTO", bg: "#15803d", width: "120px" },
                  { col: "titularidad" as const, title: "TITULARIDAD", bg: "#15803d", width: "100px" },
                  { col: "objetivo" as const, title: "Objetivo", width: "120px" },
                  { col: "comentario_wellness" as const, title: "Comentario Wellness", width: "140px" },
                  { col: "comentario_fisioterapia" as const, title: "Comentario Fisioterapia", width: "140px" },
                  { col: "comentario_medico" as const, title: "Comentario Médico", width: "140px" },
                  { col: "comentario_nutricional" as const, title: "Comentario Nutricional", width: "140px" },
                  { col: "comentario_preparacion_fisica" as const, title: "Comentario Preparación Física", width: "150px" },
                  { col: "comentario_tecnico_tactico" as const, title: "Comentario Técnico-Táctico", width: "150px" },
                  { col: "num_evento" as const, title: "Nº Evento", width: "70px" },
                ].map(({ col, title, bg }) => {
                  const isFiltered = !!excelFilterState[col] && excelFilterState[col].length > 0;
                  return (
                    <th
                      key={col}
                      style={{
                        padding: "8px 8px",
                        fontWeight: 900,
                        userSelect: "none",
                        background: isFiltered ? "#0369a1" : bg || "transparent",
                        color: "#ffffff",
                        borderRight: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                        <span
                          onClick={() => handleSort(col)}
                          style={{
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                            flex: 1,
                          }}
                          title={`Ordenar por ${title}`}
                        >
                          <span>{title}</span>
                          <span style={{ fontSize: "9px", opacity: sortColumn === col ? 1 : 0.35 }}>
                            {sortColumn === col ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </span>

                        {/* BOTONCITO TIPO TABLA DINÁMICA DE EXCEL */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenFilterModal(col);
                          }}
                          style={{
                            background: isFiltered ? "#38bdf8" : "rgba(255,255,255,0.15)",
                            color: isFiltered ? "#0f172a" : "#ffffff",
                            border: isFiltered ? "1px solid #bae6fd" : "1px solid rgba(255,255,255,0.25)",
                            borderRadius: "4px",
                            padding: "2px 5px",
                            fontSize: "10px",
                            fontWeight: 900,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            lineHeight: "1",
                            boxShadow: isFiltered ? "0 0 6px rgba(56,189,248,0.8)" : "none",
                          }}
                          title={`Filtrar ${title} (Excel)`}
                        >
                          {isFiltered ? "▼⚡" : "▼"}
                        </button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={32} style={{ textAlign: "center", padding: "24px", color: "#94a3b8", fontWeight: 700 }}>
                  No se encontraron datos en la BBDD.
                </td>
              </tr>
            ) : (
              displayedRows.map((r, idx) => {
                const isTeam = r.jugador === "TEAM";
                const isSelected = selectedRowIds.has(r.id);
                const rowBg = isTeam ? "#f1f5f9" : idx % 2 === 0 ? "#ffffff" : "#f9fafb";
                const rowKey = r.id ? `${r.id}_${idx}` : `row_${idx}`;

                return (
                  <tr
                    key={rowKey}
                    onMouseDown={(e) => handleRowMouseDown(idx, r.id, e)}
                    onMouseEnter={() => handleRowMouseEnter(idx)}
                    style={{
                      borderBottom: "1px solid #e2e8f0",
                      background: isSelected ? "#e0f2fe" : rowBg,
                      boxShadow: isSelected ? "inset 4px 0 0 #0284c7" : "none",
                      userSelect: isDraggingRows ? "none" : "auto",
                    }}
                  >
                    <td style={{ padding: "4px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            setSelectedRowIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(r.id)) next.delete(r.id);
                              else next.add(r.id);
                              return next;
                            });
                          }}
                          style={{ cursor: "pointer", accentColor: "#0284c7" }}
                        />
                        <span
                          style={{
                            cursor: "grab",
                            color: isSelected ? "#0369a1" : "#94a3b8",
                            fontSize: "10.5px",
                            fontWeight: 800,
                            userSelect: "none",
                          }}
                          title="Arrastra para seleccionar múltiples filas (Shift+Click para rango)"
                        >
                          #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(r.id);
                          }}
                          disabled={isSaving}
                          style={{
                            background: "#fee2e2",
                            color: "#b91c1c",
                            border: "1px solid #fca5a5",
                            borderRadius: "4px",
                            padding: "2px 5px",
                            fontSize: "10px",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                          title="Eliminar fila individual"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>

                    {/* JUGADOR */}
                    <td style={{ padding: "4px 8px", fontWeight: 900, color: isTeam ? "#0284c7" : "#0f172a" }}>
                      <input
                        type="text"
                        value={r.jugador || ""}
                        onChange={(e) => handleCellEdit(r.id, "jugador", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", fontWeight: 900, width: "100px", outline: "none", background: "transparent" }}
                      />
                    </td>

                    {/* PERIODO */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.periodo || ""}
                        onChange={(e) => handleCellEdit(r.id, "periodo", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "40px", textAlign: "center", outline: "none" }}
                      />
                    </td>

                    {/* FECHA */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="date"
                        value={r.fecha || ""}
                        onChange={(e) => handleCellEdit(r.id, "fecha", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", fontWeight: 800, color: "#0f172a", outline: "none" }}
                      />
                    </td>

                    {/* SUBPERIODO */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.subperiodo || ""}
                        onChange={(e) => handleCellEdit(r.id, "subperiodo", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "110px", outline: "none" }}
                      />
                    </td>

                    {/* Nº SEMANA */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="number"
                        value={r.semana ?? ""}
                        onChange={(e) => handleCellEdit(r.id, "semana", Number(e.target.value) || null)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "45px", textAlign: "center", outline: "none" }}
                      />
                    </td>

                    {/* MD */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.md || ""}
                        onChange={(e) => handleCellEdit(r.id, "md", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", fontWeight: 800, width: "65px", outline: "none" }}
                      />
                    </td>

                    {/* RIVAL */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.rival || ""}
                        onChange={(e) => handleCellEdit(r.id, "rival", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", fontWeight: 800, color: "#1e3a8a", width: "110px", outline: "none" }}
                      />
                    </td>

                    {/* RESULTADO (Victoria / Empate / Derrota) */}
                    <td style={{ padding: "4px 8px" }}>
                      <select
                        value={r.resultado || ""}
                        onChange={(e) => handleCellEdit(r.id, "resultado", e.target.value)}
                        style={{
                          border: "1px solid #cbd5e1",
                          borderRadius: "4px",
                          padding: "2px 4px",
                          fontSize: "11px",
                          fontWeight: 800,
                          width: "80px",
                          outline: "none",
                          color: r.resultado === "Victoria" ? "#16a34a" : r.resultado === "Derrota" ? "#dc2626" : "#d97706",
                        }}
                      >
                        <option value="">-</option>
                        <option value="Victoria">Victoria</option>
                        <option value="Empate">Empate</option>
                        <option value="Derrota">Derrota</option>
                      </select>
                    </td>

                    {/* EVENTO PRINCIPAL (PAL, PAV, PL, PV, E, D) */}
                    <td style={{ padding: "4px 8px" }}>
                      <select
                        value={r.evento_principal || "E"}
                        onChange={(e) => handleCellEdit(r.id, "evento_principal", e.target.value)}
                        style={{
                          border: "1px solid #0284c7",
                          borderRadius: "4px",
                          padding: "2px 4px",
                          fontSize: "11px",
                          fontWeight: 900,
                          color: "#0284c7",
                          width: "65px",
                          textAlign: "center",
                          outline: "none",
                          background: "#f0f9ff",
                        }}
                      >
                        <option value="PAL">PAL</option>
                        <option value="PAV">PAV</option>
                        <option value="PL">PL</option>
                        <option value="PV">PV</option>
                        <option value="E">E</option>
                        <option value="D">D</option>
                      </select>
                    </td>

                    {/* CARGA */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.carga || ""}
                        onChange={(e) => handleCellEdit(r.id, "carga", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "50px", textAlign: "center", outline: "none" }}
                      />
                    </td>

                    {/* VOLUMEN */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.volumen || ""}
                        onChange={(e) => handleCellEdit(r.id, "volumen", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "50px", textAlign: "center", outline: "none" }}
                      />
                    </td>

                    {/* INTENSIDAD */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.intensidad || ""}
                        onChange={(e) => handleCellEdit(r.id, "intensidad", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "50px", textAlign: "center", outline: "none" }}
                      />
                    </td>

                    {/* COMENTARIO MICROCICLO */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.comentario_microciclo || ""}
                        onChange={(e) => handleCellEdit(r.id, "comentario_microciclo", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "160px", outline: "none" }}
                      />
                    </td>

                    {/* DISPONIBILIDAD */}
                    <td style={{ padding: "4px 8px", textTransform: "uppercase" }}>
                      <input
                        type="text"
                        value={r.disponibilidad || ""}
                        onChange={(e) => handleCellEdit(r.id, "disponibilidad", e.target.value)}
                        style={{ border: "1px solid #16a34a", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", fontWeight: 900, color: "#15803d", width: "45px", textAlign: "center", outline: "none", background: "#dcfce7" }}
                      />
                    </td>

                    {/* TIPO DE EVENTO (Exacto de Planificación) */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.tipo_de_evento || ""}
                        onChange={(e) => handleCellEdit(r.id, "tipo_de_evento", e.target.value)}
                        style={{
                          border: "1px solid #0e7490",
                          borderRadius: "4px",
                          padding: "2px 4px",
                          fontSize: "11px",
                          fontWeight: 800,
                          color: "#0e7490",
                          width: "90px",
                          outline: "none",
                          textAlign: "center",
                          background: "#ecfeff",
                        }}
                      />
                    </td>

                    {/* HORA DEL EVENTO */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.hora_evento || ""}
                        onChange={(e) => handleCellEdit(r.id, "hora_evento", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "65px", textAlign: "center", outline: "none" }}
                      />
                    </td>

                    {/* LUGAR DEL EVENTO */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.lugar_evento || ""}
                        onChange={(e) => handleCellEdit(r.id, "lugar_evento", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "90px", outline: "none" }}
                      />
                    </td>

                    {/* DURACIÓN DEL EVENTO */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.duracion_evento !== undefined && r.duracion_evento !== null ? String(r.duracion_evento) : ""}
                        onChange={(e) => handleCellEdit(r.id, "duracion_evento", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "45px", textAlign: "center", outline: "none" }}
                      />
                    </td>

                    {/* ORIENTACIÓN DEL EVENTO */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.orientacion_evento || ""}
                        onChange={(e) => handleCellEdit(r.id, "orientacion_evento", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "50px", textAlign: "center", outline: "none" }}
                      />
                    </td>

                    {/* CARGA DEL EVENTO */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.carga_evento || ""}
                        onChange={(e) => handleCellEdit(r.id, "carga_evento", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "45px", textAlign: "center", outline: "none" }}
                      />
                    </td>

                    {/* COMENTARIO GENERAL EVENTO */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.comentario_general_evento || ""}
                        onChange={(e) => handleCellEdit(r.id, "comentario_general_evento", e.target.value)}
                        style={{ border: "1px solid #0284c7", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "160px", outline: "none" }}
                      />
                    </td>

                    {/* Nº JUGADORES DEL EVENTO */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="number"
                        value={r.num_jugadores_evento !== null && r.num_jugadores_evento !== undefined ? r.num_jugadores_evento : ""}
                        onChange={(e) => handleCellEdit(r.id, "num_jugadores_evento", e.target.value ? Number(e.target.value) : null)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "50px", textAlign: "center", outline: "none" }}
                      />
                    </td>

                    {/* REALIZA EL EVENTO */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.realiza_evento || "SI"}
                        onChange={(e) => handleCellEdit(r.id, "realiza_evento", e.target.value)}
                        style={{ border: "1px solid #16a34a", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", fontWeight: 900, color: r.realiza_evento === "NO" ? "#dc2626" : "#15803d", width: "50px", textAlign: "center", outline: "none", background: r.realiza_evento === "NO" ? "#fee2e2" : "#dcfce7" }}
                      />
                    </td>

                    {/* TITULARIDAD */}
                    <td style={{ padding: "4px 8px", textAlign: "center" }}>
                      {((r.tipo_de_evento || "").trim().toLowerCase() === "pa" || r.evento_principal === "PA" || r.evento_am === "PA" || r.evento_pm === "PA") ? (
                        <select
                          value={r.titularidad || ""}
                          onChange={(e) => handleCellEdit(r.id, "titularidad", e.target.value)}
                          style={{ border: "1px solid #16a34a", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", fontWeight: 900, color: "#15803d", width: "80px", textAlign: "center", outline: "none", background: "#dcfce7" }}
                        >
                          <option value="">-</option>
                          <option value="T">T</option>
                          <option value="S">S</option>
                        </select>
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: "11px" }}>-</span>
                      )}
                    </td>

                    {/* OBJETIVO */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.objetivo || ""}
                        onChange={(e) => handleCellEdit(r.id, "objetivo", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "90px", outline: "none" }}
                      />
                    </td>

                    {/* COMENTARIO WELLNESS */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.comentario_wellness || ""}
                        onChange={(e) => handleCellEdit(r.id, "comentario_wellness", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "130px", outline: "none" }}
                      />
                    </td>

                    {/* COMENTARIO FISIOTERAPIA */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.comentario_fisioterapia || ""}
                        onChange={(e) => handleCellEdit(r.id, "comentario_fisioterapia", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "130px", outline: "none" }}
                      />
                    </td>

                    {/* COMENTARIO MÉDICO */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.comentario_medico || ""}
                        onChange={(e) => handleCellEdit(r.id, "comentario_medico", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "130px", outline: "none" }}
                      />
                    </td>

                    {/* COMENTARIO NUTRICIONAL */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.comentario_nutricional || ""}
                        onChange={(e) => handleCellEdit(r.id, "comentario_nutricional", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "130px", outline: "none" }}
                      />
                    </td>

                    {/* COMENTARIO PREPARACIÓN FÍSICA */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.comentario_preparacion_fisica || ""}
                        onChange={(e) => handleCellEdit(r.id, "comentario_preparacion_fisica", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "140px", outline: "none" }}
                      />
                    </td>

                    {/* COMENTARIO TÉCNICO-TÁCTICO */}
                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={r.comentario_tecnico_tactico || ""}
                        onChange={(e) => handleCellEdit(r.id, "comentario_tecnico_tactico", e.target.value)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "140px", outline: "none" }}
                      />
                    </td>

                    {/* Nº EVENTO */}
                    <td style={{ padding: "4px 8px", textAlign: "center" }}>
                      <input
                        type="number"
                        value={r.num_evento ?? 1}
                        onChange={(e) => handleCellEdit(r.id, "num_evento", Number(e.target.value) || 1)}
                        style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 4px", fontSize: "11px", width: "40px", textAlign: "center", outline: "none" }}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* MODAL NUEVA FILA */}
      {showAddModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <form onSubmit={handleAddSubmit} style={{ background: "#ffffff", padding: "20px", borderRadius: "12px", width: "520px", maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 900 }}>Añadir Registro a BBDD Excel</h3>

            <label style={{ fontSize: "11px", fontWeight: 700 }}>
              Jugador / Asignación
              <select value={newRow.jugador_id} onChange={(e) => setNewRow({ ...newRow, jugador_id: e.target.value })} style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                <option value="TEAM">TEAM (Fila General de Equipo)</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {(p.apodo || p.nombre || "").toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <label style={{ fontSize: "11px", fontWeight: 700 }}>
                Fecha
                <input type="date" required value={newRow.fecha} onChange={(e) => setNewRow({ ...newRow, fecha: e.target.value })} style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
              </label>
              <label style={{ fontSize: "11px", fontWeight: 700 }}>
                MD
                <input type="text" value={newRow.md} onChange={(e) => setNewRow({ ...newRow, md: e.target.value })} style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
              <label style={{ fontSize: "11px", fontWeight: 700 }}>
                Subperiodo
                <input type="text" value={newRow.subperiodo} onChange={(e) => setNewRow({ ...newRow, subperiodo: e.target.value })} style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
              </label>
              <label style={{ fontSize: "11px", fontWeight: 700 }}>
                Rival
                <input type="text" value={newRow.rival} onChange={(e) => setNewRow({ ...newRow, rival: e.target.value })} style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
              </label>
              <label style={{ fontSize: "11px", fontWeight: 700 }}>
                Disponibilidad
                <input type="text" value={newRow.disponibilidad} onChange={(e) => setNewRow({ ...newRow, disponibilidad: e.target.value })} style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
              <button type="button" onClick={() => setShowAddModal(false)} style={{ background: "#f1f5f9", padding: "8px 14px", borderRadius: "6px", border: "none", fontWeight: 700 }}>
                Cancelar
              </button>
              <button type="submit" disabled={isSaving} style={{ background: "#0284c7", color: "#ffffff", padding: "8px 16px", borderRadius: "6px", border: "none", fontWeight: 800 }}>
                {isSaving ? "Guardando..." : "Guardar Registro"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* BARRA FLOTANTE DE ACCIONES MASIVAS PARA FILAS SELECCIONADAS */}
      {selectedRowIds.size > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: "28px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#0f172a",
            color: "#ffffff",
            padding: "10px 20px",
            borderRadius: "14px",
            boxShadow: "0 20px 30px -5px rgba(0, 0, 0, 0.4), 0 0 15px rgba(2, 132, 199, 0.4)",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            zIndex: 9990,
            border: "1.5px solid #38bdf8",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                background: "#0284c7",
                color: "#ffffff",
                padding: "2px 8px",
                borderRadius: "6px",
                fontWeight: 900,
                fontSize: "13px",
              }}
            >
              {selectedRowIds.size}
            </span>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>
              {selectedRowIds.size === 1 ? "fila seleccionada" : "filas seleccionadas"}
            </span>
          </div>

          <div style={{ width: "1px", height: "20px", background: "#334155" }} />

          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={isSaving}
            style={{
              background: "#dc2626",
              color: "#ffffff",
              border: "none",
              padding: "8px 18px",
              borderRadius: "8px",
              fontWeight: 800,
              fontSize: "13px",
              cursor: isSaving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 6px rgba(220, 38, 38, 0.4)",
            }}
          >
            <span>🗑️</span>
            <span>{isSaving ? "Eliminando..." : `Borrar ${selectedRowIds.size} filas`}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedRowIds(new Set())}
            style={{
              background: "#1e293b",
              color: "#cbd5e1",
              border: "1px solid #475569",
              padding: "7px 14px",
              borderRadius: "8px",
              fontWeight: 700,
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            ✕ Deseleccionar
          </button>
        </div>
      )}
    </div>
  );
}
