"use client";

import React, { useMemo, useState, useEffect } from "react";
import { getLesionesDataServer, saveLesionesDataServer } from "@/app/actions";
import {
  LesionFormData,
  CONTEXTOS_OPTIONS,
  CONTACTO_OPTIONS,
  REGIONES_OPTIONS,
  RECURRENCIA_OPTIONS,
  TEJIDO_OPTIONS,
  RESULTADO_OPTIONS,
  GRAVEDAD_OPTIONS,
} from "../calendario/LesionControlModal";

export type HistorialLesionesViewProps = {
  jugadores: any[];
  calendarioDisponibilidadMap: Record<string, string>;
  statusOverrides?: Record<string, string>;
  showPlayerPhotos?: boolean;
  activeTeam?: string;
  activeSeasons?: string[];
};

// Utilidades para normalizar y filtrar estrictamente por temporada y fechas válidas
function parseISOFecha(f: string): string {
  if (!f) return "";
  const s = f.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  const parts = s.split(/[\/-]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      const dd = parts[0].padStart(2, "0");
      const mm = parts[1].padStart(2, "0");
      const yyyy = parts[2];
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  return s;
}

// 30-08-2026 fue la fecha de envío del formulario de valoración inicial / día off sin lesión
function isFechaCuestionarioOInvalida(fechaStr: string): boolean {
  if (!fechaStr) return true;
  const s = fechaStr.trim();
  const iso = parseISOFecha(s);
  if (
    iso === "2026-08-30" ||
    iso === "2026-08-29" ||
    iso === "2026-08-31" ||
    s === "30-08-2026" ||
    s === "30/08/2026" ||
    s.startsWith("2026-08-30")
  ) {
    return true;
  }
  return false;
}

function isDateInSeason(fechaStr: string, start: string, end: string): boolean {
  const iso = parseISOFecha(fechaStr);
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return iso >= start && iso <= end;
}

export type ClasificacionDimension =
  | "gravedad"
  | "region_corporal"
  | "tejido"
  | "contexto"
  | "contacto"
  | "recurrencia"
  | "resultado"
  | "posicion";

const DIMENSION_CONFIG: Record<
  ClasificacionDimension,
  { label: string; defaultOptions: string[] }
> = {
  gravedad: {
    label: "Gravedad",
    defaultOptions: ["Sin baja ( 0 )", "Leve (1 a 7)", "Moderada (8 a 28)", "Grave (>28)"],
  },
  region_corporal: {
    label: "Región Corporal",
    defaultOptions: REGIONES_OPTIONS,
  },
  tejido: {
    label: "Tejido",
    defaultOptions: TEJIDO_OPTIONS,
  },
  contexto: {
    label: "Contexto",
    defaultOptions: CONTEXTOS_OPTIONS,
  },
  contacto: {
    label: "Contacto",
    defaultOptions: CONTACTO_OPTIONS,
  },
  recurrencia: {
    label: "Recurrencia",
    defaultOptions: RECURRENCIA_OPTIONS,
  },
  resultado: {
    label: "Resultado",
    defaultOptions: RESULTADO_OPTIONS,
  },
  posicion: {
    label: "Posición",
    defaultOptions: ["PORTERO", "LATERAL", "CENTRAL", "PIVOTE", "INTERIOR", "EXTREMO", "DELANTERO"],
  },
};

export default function HistorialLesionesView({
  jugadores,
  calendarioDisponibilidadMap,
  statusOverrides = {},
  showPlayerPhotos = true,
  activeTeam,
  activeSeasons,
}: HistorialLesionesViewProps) {
  // Determinar temporada activa y su rango oficial de fechas
  const currentTeam = activeTeam || (typeof window !== "undefined" ? localStorage.getItem("active_team") || "CE Manresa" : "CE Manresa");
  const currentSeasons = activeSeasons || (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('active_seasons') || '["2026/27"]') : ['2026/27']);

  const is2025_26 =
    currentTeam.toLowerCase().includes("prat") ||
    (Array.isArray(currentSeasons) && currentSeasons.includes("2025/26") && !currentSeasons.includes("2026/27"));

  const seasonStart = is2025_26 ? "2025-07-01" : "2026-07-01";
  const seasonEnd = is2025_26 ? "2026-06-30" : "2027-06-30";
  const seasonLabel = is2025_26 ? "Temporada 2025/26" : "Temporada 2026/27";
  // Estado para mostrar / ocultar el gráfico dinámico
  const [showChart, setShowChart] = useState<boolean>(true);

  const toggleShowChart = (val?: boolean) => {
    const nextVal = typeof val === "boolean" ? val : !showChart;
    setShowChart(nextVal);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("historial_show_chart_v1", JSON.stringify(nextVal));
      } catch (e) {}
    }
  };

  // Dimensión seleccionada para el gráfico dinámico
  const [selectedDimension, setSelectedDimension] = useState<ClasificacionDimension>("gravedad");

  // Filtro activo al hacer clic en una barra del gráfico
  const [chartSelectedValue, setChartSelectedValue] = useState<string | null>(null);

  // Filtros de búsqueda
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPlayerId, setFilterPlayerId] = useState("ALL");
  const [editingModalRecord, setEditingModalRecord] = useState<LesionFormData | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [saveIndicatorId, setSaveIndicatorId] = useState<string | null>(null);

  // Claves de lesiones eliminadas por el usuario
  const [deletedLesionKeys, setDeletedLesionKeys] = useState<Set<string>>(new Set());

  // Estado de sincronización con la base de datos
  const [bbddStatus, setBbddStatus] = useState<string>("Sincronizando BBDD...");

  // Selección múltiple y arrastre estilo Excel (para borrado por lotes)
  const [selectedLesionKeys, setSelectedLesionKeys] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [dragAction, setDragAction] = useState<"select" | "deselect">("select");
  const [dragBaseSelection, setDragBaseSelection] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // Listener global para finalizar el arrastre de selección al soltar el ratón en cualquier lugar
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setDragStartIndex(null);
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, []);

  // 1. Estado local de registros clasificados detallados (filtrado estricto por temporada activa y sin 30-08-2026)
  const [localRecords, setLocalRecords] = useState<LesionFormData[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedChart = localStorage.getItem("historial_show_chart_v1");
      if (savedChart !== null) setShowChart(JSON.parse(savedChart));
    } catch (e) {}

    // Cargar caché inmediata local para evitar parpadeos
    let initialLocal: LesionFormData[] = [];
    try {
      const raw = localStorage.getItem("lesiones_registro_detallado_v1");
      if (raw) {
        const parsed: LesionFormData[] = JSON.parse(raw);
        initialLocal = parsed.filter((r) => !isFechaCuestionarioOInvalida(r.fecha));
        setLocalRecords(initialLocal);
      }
    } catch (e) {}

    try {
      const rawDeleted = localStorage.getItem("lesiones_eliminadas_v1");
      if (rawDeleted) setDeletedLesionKeys(new Set(JSON.parse(rawDeleted)));
    } catch (e) {}

    // Cargar de forma persistente desde Supabase (db_testing) y servidor
    let isMounted = true;
    getLesionesDataServer()
      .then(({ records: serverRecords, deletedKeys: serverDeleted }) => {
        if (!isMounted) return;

        let activeDeleted = new Set<string>();
        if (Array.isArray(serverDeleted)) {
          activeDeleted = new Set(serverDeleted);
          setDeletedLesionKeys((prev) => new Set([...prev, ...serverDeleted]));
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("lesiones_eliminadas_v1", JSON.stringify(serverDeleted));
            } catch (e) {}
          }
        }

        if (Array.isArray(serverRecords) && serverRecords.length > 0) {
          setLocalRecords((prev) => {
            // Unir servidor (fuente de verdad) con registros locales existentes
            const serverMap = new Map<string, LesionFormData>();
            serverRecords.forEach((r) => {
              if (r && r.jugador_id && r.fecha) {
                serverMap.set(`${r.jugador_id}_${r.fecha}`, r);
              }
            });

            prev.forEach((r) => {
              const k = `${r.jugador_id}_${r.fecha}`;
              if (!serverMap.has(k)) {
                serverMap.set(k, r);
              }
            });

            const merged = Array.from(serverMap.values()).filter(
              (r) => !isFechaCuestionarioOInvalida(r.fecha)
            );

            if (typeof window !== "undefined") {
              try {
                localStorage.setItem("lesiones_registro_detallado_v1", JSON.stringify(merged));
              } catch (e) {}
            }
            return merged;
          });
          setBbddStatus("✓ BBDD Sincronizada");
        } else if (initialLocal.length > 0) {
          // Si el servidor estaba vacío pero el navegador tenía registros locales, subirlos a la BBDD
          saveLesionesDataServer({
            records: initialLocal,
            deletedKeys: Array.from(activeDeleted),
          }).catch(() => {});
          setBbddStatus("✓ BBDD Guardada");
        } else {
          setBbddStatus("✓ BBDD Conectada");
        }
      })
      .catch((err) => {
        console.warn("Error cargando lesiones desde servidor/BBDD:", err);
        if (isMounted) setBbddStatus("Modo local (Offline)");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Guardar en localStorage y en la Base de Datos (Supabase + Servidor)
  const saveRecordsToStorage = (updatedList: LesionFormData[], currentDeleted?: Set<string>) => {
    const cleaned = updatedList.filter((r) => !isFechaCuestionarioOInvalida(r.fecha));
    setLocalRecords(cleaned);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lesiones_registro_detallado_v1", JSON.stringify(cleaned));
      } catch (e) {}
    }

    // Persistir de forma permanente en Supabase db_testing y servidor
    setBbddStatus("💾 Guardando en BBDD...");
    const delArr = currentDeleted ? Array.from(currentDeleted) : Array.from(deletedLesionKeys);
    saveLesionesDataServer({ records: cleaned, deletedKeys: delArr })
      .then((res) => {
        if (res.success) {
          setBbddStatus("✓ Guardado en BBDD");
          setTimeout(() => setBbddStatus("✓ BBDD Sincronizada"), 2000);
        } else {
          setBbddStatus("⚠️ Error BBDD (guardado local)");
        }
      })
      .catch((err) => {
        console.warn("Error guardando en BBDD:", err);
        setBbddStatus("⚠️ Error BBDD (guardado local)");
      });
  };

  // 2. Leer comentarios de fisioterapia / médico de localStorage
  const [comentariosMap, setComentariosMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawCom = localStorage.getItem("comentarios_jugadores_v2");
      const rawPlanif = localStorage.getItem("planificacion_comentarios_v1");
      const allCom = [
        ...(rawCom ? JSON.parse(rawCom) : []),
        ...(rawPlanif ? JSON.parse(rawPlanif) : []),
      ];
      const map: Record<string, string> = {};
      allCom.forEach((c) => {
        if (!c || (!c.jugador_id && !c.fecha)) return;
        const f = c.fecha || (c.day_id ? c.day_id.replace(/^d_/, "") : "");
        const key = `${c.jugador_id}_${f}`;
        if (c.tipo === "FIS" || c.tipo === "OTR" || c.tipo === "WEL") {
          if (c.texto && c.texto.trim()) {
            map[key] = map[key] ? `${map[key]} | ${c.texto.trim()}` : c.texto.trim();
          }
        }
      });
      setComentariosMap(map);
    } catch (e) {}
  }, []);

  // 3. Algoritmo de detección de episodios lesionales (D -> NDL o D -> NDR) estrictamente de esta temporada y sin 30-08-2026
  const episodios: LesionFormData[] = useMemo(() => {
    const detailedMap = new Map<string, LesionFormData>();
    localRecords.forEach((rec) => {
      if (rec.fecha && !isFechaCuestionarioOInvalida(rec.fecha) && isDateInSeason(rec.fecha, seasonStart, seasonEnd)) {
        detailedMap.set(`${rec.jugador_id}_${rec.fecha}`, rec);
      }
    });

    const fechasSet = new Set<string>();
    Object.keys(calendarioDisponibilidadMap).forEach((k) => {
      const dateMatch = k.match(/(\d{4}-\d{2}-\d{2})$/);
      if (dateMatch) {
        const f = dateMatch[1];
        if (!isFechaCuestionarioOInvalida(f) && isDateInSeason(f, seasonStart, seasonEnd)) {
          fechasSet.add(f);
        }
      }
    });
    localRecords.forEach((r) => {
      if (r.fecha && !isFechaCuestionarioOInvalida(r.fecha) && isDateInSeason(r.fecha, seasonStart, seasonEnd)) {
        fechasSet.add(parseISOFecha(r.fecha));
      }
    });
    Object.keys(comentariosMap).forEach((k) => {
      const dateMatch = k.match(/(\d{4}-\d{2}-\d{2})$/);
      if (dateMatch) {
        const f = dateMatch[1];
        if (!isFechaCuestionarioOInvalida(f) && isDateInSeason(f, seasonStart, seasonEnd)) {
          fechasSet.add(f);
        }
      }
    });

    const fechasSorted = Array.from(fechasSet).sort((a, b) => a.localeCompare(b));
    const rawList: LesionFormData[] = [];

    jugadores.forEach((j) => {
      let lastKnownStatus: string | null = null;
      let currentEp: {
        fechaInicio: string;
        tipoInicial: "NDL" | "NDR" | "L";
        fechasNDL: string[];
      } | null = null;

      fechasSorted.forEach((fecha) => {
        if (isFechaCuestionarioOInvalida(fecha) || !isDateInSeason(fecha, seasonStart, seasonEnd)) return;
        const key1 = `${j.id}_${fecha}`;
        const key2 = `${j.id}_day_${fecha}`;
        const rawStatus = calendarioDisponibilidadMap[key1] || calendarioDisponibilidadMap[key2] || "";
        const override = statusOverrides[key1] || statusOverrides[key2];

        let status = rawStatus ? rawStatus.trim().toUpperCase() : "";
        if (override) {
          if (override === "verde") status = "D";
          else if (override === "amarillo") status = "P";
          else if (override === "rojo" && !status) status = "NDL";
        }

        // Si este día no tiene ningún registro ni sesión (p. ej. día libre o descanso sin sesión):
        // NO asumimos "D". Los días libres no alteran el estado médico del jugador ni crean lesiones falsas.
        if (!status) return;

        const isNDL = status === "NDL" || status === "L";
        const isNDR = status === "NDR";
        const isLesion = isNDL || isNDR;
        const isDisponible = status === "D" || status === "DCS" || status === "DS" || status === "DCI";

        if (isLesion) {
          if (!currentEp) {
            // Regla solicitada: Solo crear episodio si el estado anterior registrado era Disponible o DCI
            const prevWasDisponible =
              lastKnownStatus === "D" ||
              lastKnownStatus === "DCS" ||
              lastKnownStatus === "DS" ||
              lastKnownStatus === "DCI";

            if (prevWasDisponible) {
              currentEp = {
                fechaInicio: fecha,
                tipoInicial: isNDL ? "NDL" : "NDR",
                fechasNDL: [fecha],
              };
            }
          } else {
            currentEp.fechasNDL.push(fecha);
          }
        } else if (isDisponible) {
          if (currentEp) {
            // El jugador vuelve a estar disponible en esta fecha (fin de baja)
            const fechaAlta = fecha;
            const existing = detailedMap.get(`${j.id}_${currentEp.fechaInicio}`);
            const comFisio = comentariosMap[`${j.id}_${currentEp.fechaInicio}`] || "";

            // Los días de baja se suman hasta que tenga la siguiente Disponibilidad
            const finalAlta = existing?.fecha_alta || fechaAlta;
            let diffDays = 0;
            if (finalAlta && currentEp.fechaInicio) {
              const d1 = new Date(currentEp.fechaInicio + "T00:00:00");
              const d2 = new Date(finalAlta + "T00:00:00");
              diffDays = Math.max(0, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
            } else {
              diffDays = currentEp.fechasNDL.length;
            }

            let grav = "Leve (1 a 7)";
            if (diffDays === 0) grav = "Sin baja (0)";
            else if (diffDays <= 7) grav = "Leve (1 a 7)";
            else if (diffDays <= 28) grav = "Moderada (8 a 28)";
            else grav = "Grave (>28)";

            rawList.push({
              id: existing?.id || `${j.id}_${currentEp.fechaInicio}`,
              jugador_id: j.id,
              jugador_nombre: j.nombre,
              jugador_apodo: j.apodo || "",
              posicion: j.posicion || "",
              cor_id: j.cor_id || j.dorsal || "",
              seccion: "CE MANRESA",
              equipo: "1er EQUIPO",
              fecha_nacimiento: j.fecha_nacimiento || "",
              fecha: currentEp.fechaInicio,
              fecha_alta: finalAlta,
              tipo_disponibilidad: currentEp.tipoInicial,
              contexto: existing?.contexto || "Entrenamiento Optimizador",
              contacto: existing?.contacto || "Sin contacto",
              region_corporal: existing?.region_corporal || "Muslo (cuádriceps)",
              recurrencia: existing?.recurrencia || "Nueva",
              tejido: existing?.tejido || "Músculo",
              resultado: existing?.resultado || (diffDays === 0 ? "Sin baja" : "Con baja"),
              gravedad: existing?.gravedad || grav,
              dias_baja: existing?.dias_baja !== undefined ? existing.dias_baja : diffDays,
              comentario: existing?.comentario !== undefined ? existing.comentario : comFisio,
            });

            currentEp = null;
          }
        }

        lastKnownStatus = status;
      });

      // Si el episodio sigue abierto (aún no ha llegado a la siguiente Disponibilidad)
      if (currentEp) {
        const existing = detailedMap.get(`${j.id}_${currentEp.fechaInicio}`);
        const comFisio = comentariosMap[`${j.id}_${currentEp.fechaInicio}`] || "";

        let finalAlta = existing?.fecha_alta || "";
        let diffDays = 0;
        if (finalAlta && currentEp.fechaInicio) {
          const d1 = new Date(currentEp.fechaInicio + "T00:00:00");
          const d2 = new Date(finalAlta + "T00:00:00");
          diffDays = Math.max(0, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
        } else {
          // Si sigue de baja activa, los días se van sumando hasta hoy
          const d1 = new Date(currentEp.fechaInicio + "T00:00:00");
          const dHoy = new Date();
          diffDays = Math.max(1, Math.round((dHoy.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
        }

        let grav = "Leve (1 a 7)";
        if (diffDays === 0) grav = "Sin baja (0)";
        else if (diffDays <= 7) grav = "Leve (1 a 7)";
        else if (diffDays <= 28) grav = "Moderada (8 a 28)";
        else grav = "Grave (>28)";

        rawList.push({
          id: existing?.id || `${j.id}_${currentEp.fechaInicio}`,
          jugador_id: j.id,
          jugador_nombre: j.nombre,
          jugador_apodo: j.apodo || "",
          posicion: j.posicion || "",
          cor_id: j.cor_id || j.dorsal || "",
          seccion: "CE MANRESA",
          equipo: "1er EQUIPO",
          fecha_nacimiento: j.fecha_nacimiento || "",
          fecha: currentEp.fechaInicio,
          fecha_alta: finalAlta,
          tipo_disponibilidad: currentEp.tipoInicial,
          contexto: existing?.contexto || "Entrenamiento Optimizador",
          contacto: existing?.contacto || "Sin contacto",
          region_corporal: existing?.region_corporal || "Muslo (cuádriceps)",
          recurrencia: existing?.recurrencia || "Nueva",
          tejido: existing?.tejido || "Músculo",
          resultado: existing?.resultado || (diffDays === 0 ? "Sin baja" : "Con baja"),
          gravedad: existing?.gravedad || grav,
          dias_baja: existing?.dias_baja !== undefined ? existing.dias_baja : diffDays,
          comentario: existing?.comentario !== undefined ? existing.comentario : comFisio,
        });
      }
    });

    localRecords.forEach((r) => {
      if (
        r.fecha &&
        !isFechaCuestionarioOInvalida(r.fecha) &&
        isDateInSeason(r.fecha, seasonStart, seasonEnd)
      ) {
        if (!rawList.some((l) => l.jugador_id === r.jugador_id && l.fecha === r.fecha)) {
          rawList.push(r);
        }
      }
    });

    // Filtrar estrictamente cualquier registro que haya sido eliminado por el usuario, fuera de esta temporada o del 30-08-2026
    const nonDeleted = rawList.filter(
      (item) =>
        !deletedLesionKeys.has(`${item.jugador_id}_${item.fecha}`) &&
        (!item.id || !deletedLesionKeys.has(item.id)) &&
        !isFechaCuestionarioOInvalida(item.fecha) &&
        isDateInSeason(item.fecha, seasonStart, seasonEnd)
    );

    // Deduplicar estrictamente por jugador_id y fecha
    const seen = new Set<string>();
    const deduplicada: LesionFormData[] = [];
    nonDeleted.forEach((item) => {
      const uKey = `${item.jugador_id}_${item.fecha}`;
      if (!seen.has(uKey)) {
        seen.add(uKey);
        deduplicada.push(item);
      }
    });

    return deduplicada.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [jugadores, calendarioDisponibilidadMap, statusOverrides, comentariosMap, localRecords, deletedLesionKeys, seasonStart, seasonEnd]);

  // Actualizar comentario directamente inline
  const handleUpdateComment = (ep: LesionFormData, newComment: string) => {
    const updatedEp: LesionFormData = { ...ep, comentario: newComment };

    let nextList = [...localRecords];
    const idx = nextList.findIndex((r) => r.jugador_id === ep.jugador_id && r.fecha === ep.fecha);
    if (idx >= 0) {
      nextList[idx] = updatedEp;
    } else {
      nextList.unshift(updatedEp);
    }
    saveRecordsToStorage(nextList);

    if (typeof window !== "undefined") {
      try {
        const rawCom = localStorage.getItem("comentarios_jugadores_v2");
        let comArr: any[] = rawCom ? JSON.parse(rawCom) : [];
        comArr = comArr.filter(
          (c) => !(c.jugador_id === ep.jugador_id && c.fecha === ep.fecha && c.tipo === "FIS")
        );
        if (newComment && newComment.trim()) {
          comArr.push({
            jugador_id: ep.jugador_id,
            fecha: ep.fecha,
            tipo: "FIS",
            texto: newComment.trim(),
          });
        }
        localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(comArr));
      } catch (e) {}
    }

    setSaveIndicatorId(`${ep.jugador_id}_${ep.fecha}`);
    setTimeout(() => setSaveIndicatorId(null), 1500);
  };

  // Guardar desde el modal de edición/añadir
  const handleSaveModalRecord = (data: LesionFormData) => {
    const nextDeletedSet = new Set(deletedLesionKeys);
    nextDeletedSet.delete(`${data.jugador_id}_${data.fecha}`);
    if (data.id) nextDeletedSet.delete(data.id);
    setDeletedLesionKeys(nextDeletedSet);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lesiones_eliminadas_v1", JSON.stringify(Array.from(nextDeletedSet)));
      } catch (e) {}
    }

    let nextList = [...localRecords];
    const idx = nextList.findIndex((r) => r.jugador_id === data.jugador_id && r.fecha === data.fecha);
    if (idx >= 0) {
      nextList[idx] = data;
    } else {
      nextList.unshift(data);
    }
    saveRecordsToStorage(nextList, nextDeletedSet);

    if (typeof window !== "undefined") {
      try {
        const rawCom = localStorage.getItem("comentarios_jugadores_v2");
        let comArr: any[] = rawCom ? JSON.parse(rawCom) : [];
        comArr = comArr.filter(
          (c) => !(c.jugador_id === data.jugador_id && c.fecha === data.fecha && c.tipo === "FIS")
        );
        if (data.comentario && data.comentario.trim()) {
          comArr.push({
            jugador_id: data.jugador_id,
            fecha: data.fecha,
            tipo: "FIS",
            texto: data.comentario.trim(),
          });
        }
        localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(comArr));
      } catch (e) {}
    }

    setEditingModalRecord(null);
    setIsAddingNew(false);
  };

  // Eliminar un registro de lesión
  const handleDeleteRecord = (ep: LesionFormData) => {
    if (!window.confirm(`¿Eliminar el registro de lesión de ${ep.jugador_nombre} del día ${ep.fecha}?`)) return;

    const nextList = localRecords.filter(
      (r) => !(r.jugador_id === ep.jugador_id && r.fecha === ep.fecha)
    );

    const key1 = `${ep.jugador_id}_${ep.fecha}`;
    const key2 = ep.id || "";
    const nextDeletedSet = new Set(deletedLesionKeys);
    if (key1) nextDeletedSet.add(key1);
    if (key2) nextDeletedSet.add(key2);
    setDeletedLesionKeys(nextDeletedSet);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lesiones_eliminadas_v1", JSON.stringify(Array.from(nextDeletedSet)));
      } catch (e) {}
    }

    saveRecordsToStorage(nextList, nextDeletedSet);

    if (typeof window !== "undefined") {
      try {
        const rawCom = localStorage.getItem("comentarios_jugadores_v2");
        let comArr: any[] = rawCom ? JSON.parse(rawCom) : [];
        comArr = comArr.filter(
          (c) => !(c.jugador_id === ep.jugador_id && c.fecha === ep.fecha && c.tipo === "FIS")
        );
        localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(comArr));
      } catch (e) {}
    }
  };

  // 4. AGRUPACIÓN DINÁMICA SEGÚN LA COLUMNA / DIMENSIÓN SELECCIONADA
  const dynamicStats = useMemo(() => {
    const config = DIMENSION_CONFIG[selectedDimension];
    const getPlayerNames = (arr: LesionFormData[]) => {
      const names = Array.from(
        new Set(arr.map((e) => e.jugador_apodo || e.jugador_nombre.split(" ")[0].toUpperCase()))
      );
      return names.join(", ");
    };

    if (selectedDimension === "gravedad") {
      const sinBaja = episodios.filter((e) => e.gravedad.includes("Sin baja") || e.dias_baja === 0);
      const leve = episodios.filter(
        (e) => e.gravedad.includes("Leve") || (e.dias_baja >= 1 && e.dias_baja <= 7)
      );
      const moderada = episodios.filter(
        (e) => e.gravedad.includes("Moderada") || (e.dias_baja >= 8 && e.dias_baja <= 28)
      );
      const grave = episodios.filter((e) => e.gravedad.includes("Grave") || e.dias_baja > 28);

      return [
        { label: "Sin baja ( 0 )", count: sinBaja.length, players: getPlayerNames(sinBaja), key: "sin", barColor: "#94a3b8" },
        { label: "Leve (1 a 7)", count: leve.length, players: getPlayerNames(leve), key: "leve", barColor: "#4f81bd" },
        { label: "Moderada (8 a 28)", count: moderada.length, players: getPlayerNames(moderada), key: "mod", barColor: "#eab308" },
        { label: "Grave (>28)", count: grave.length, players: getPlayerNames(grave), key: "grave", barColor: "#dc2626" },
      ];
    }

    // Para cualquier otra dimensión: agrupar por valor
    const groupedMap = new Map<string, LesionFormData[]>();

    // Inicializar con las opciones por defecto
    config.defaultOptions.forEach((opt) => groupedMap.set(opt, []));

    episodios.forEach((ep) => {
      let val = "";
      if (selectedDimension === "region_corporal") val = ep.region_corporal || "Otro";
      else if (selectedDimension === "tejido") val = ep.tejido || "Otro";
      else if (selectedDimension === "contexto") val = ep.contexto || "Otro";
      else if (selectedDimension === "contacto") val = ep.contacto || "Sin contacto";
      else if (selectedDimension === "recurrencia") val = ep.recurrencia || "Nueva";
      else if (selectedDimension === "resultado") val = ep.resultado || "Con baja";
      else if (selectedDimension === "posicion") val = (ep.posicion || "Otro").toUpperCase();

      let foundKey = "";
      for (const k of Array.from(groupedMap.keys())) {
        if (k.toLowerCase() === val.toLowerCase() || (val.length > 3 && k.toLowerCase().includes(val.toLowerCase()))) {
          foundKey = k;
          break;
        }
      }
      if (!foundKey) {
        foundKey = val;
        groupedMap.set(foundKey, []);
      }
      groupedMap.get(foundKey)!.push(ep);
    });

    const palette = [
      "#4f81bd",
      "#0284c7",
      "#0d9488",
      "#16a34a",
      "#eab308",
      "#f97316",
      "#dc2626",
      "#8b5cf6",
      "#64748b",
    ];

    const results = Array.from(groupedMap.entries()).map(([label, list], idx) => ({
      label,
      count: list.length,
      players: getPlayerNames(list),
      key: `cat_${idx}`,
      barColor: palette[idx % palette.length],
    }));

    return results.filter((r) => r.count > 0 || config.defaultOptions.includes(r.label));
  }, [episodios, selectedDimension]);

  // Filtrado de la tabla
  const episodiosFiltrados = useMemo(() => {
    return episodios.filter((ep) => {
      if (filterPlayerId !== "ALL" && ep.jugador_id !== filterPlayerId) return false;

      // Filtro interactivo desde el clic en la barra del gráfico (si el gráfico está visible)
      if (showChart && chartSelectedValue) {
        const valToMatch = chartSelectedValue.toLowerCase();
        if (selectedDimension === "gravedad") {
          if (valToMatch.includes("sin") && !(ep.gravedad.includes("Sin baja") || ep.dias_baja === 0)) return false;
          if (valToMatch.includes("leve") && !(ep.gravedad.includes("Leve") || (ep.dias_baja >= 1 && ep.dias_baja <= 7))) return false;
          if (valToMatch.includes("moderada") && !(ep.gravedad.includes("Moderada") || (ep.dias_baja >= 8 && ep.dias_baja <= 28))) return false;
          if (valToMatch.includes("grave") && !(ep.gravedad.includes("Grave") || ep.dias_baja > 28)) return false;
        } else if (selectedDimension === "region_corporal") {
          if ((ep.region_corporal || "").toLowerCase() !== valToMatch) return false;
        } else if (selectedDimension === "tejido") {
          if ((ep.tejido || "").toLowerCase() !== valToMatch) return false;
        } else if (selectedDimension === "contexto") {
          if ((ep.contexto || "").toLowerCase() !== valToMatch) return false;
        } else if (selectedDimension === "contacto") {
          if ((ep.contacto || "").toLowerCase() !== valToMatch) return false;
        } else if (selectedDimension === "recurrencia") {
          if ((ep.recurrencia || "").toLowerCase() !== valToMatch) return false;
        } else if (selectedDimension === "resultado") {
          if ((ep.resultado || "").toLowerCase() !== valToMatch) return false;
        } else if (selectedDimension === "posicion") {
          if ((ep.posicion || "").toLowerCase() !== valToMatch) return false;
        }
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName =
          ep.jugador_nombre.toLowerCase().includes(q) ||
          (ep.jugador_apodo || "").toLowerCase().includes(q);
        const matchCom = ep.comentario?.toLowerCase().includes(q);
        const matchRegion = ep.region_corporal?.toLowerCase().includes(q);
        const matchTejido = ep.tejido?.toLowerCase().includes(q);
        const matchContext = ep.contexto?.toLowerCase().includes(q);
        if (!matchName && !matchCom && !matchRegion && !matchTejido && !matchContext) return false;
      }

      return true;
    });
  }, [episodios, filterPlayerId, chartSelectedValue, selectedDimension, showChart, searchTerm]);

  // Clave unívoca por fila de lesión
  const getLesionItemKey = (ep: LesionFormData) => `${ep.jugador_id}_${ep.fecha}`;

  // Seleccionar / Deseleccionar todas las lesiones visibles
  const handleToggleAll = () => {
    if (selectedLesionKeys.size === episodiosFiltrados.length && episodiosFiltrados.length > 0) {
      setSelectedLesionKeys(new Set());
    } else {
      const all = new Set(episodiosFiltrados.map((ep) => getLesionItemKey(ep)));
      setSelectedLesionKeys(all);
    }
  };

  // Clic y arrastre estilo Excel para selección de múltiples filas
  const handleRowMouseDown = (idx: number, key: string, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedIndex !== null) {
      const min = Math.min(lastClickedIndex, idx);
      const max = Math.max(lastClickedIndex, idx);
      const next = new Set(selectedLesionKeys);
      for (let i = min; i <= max; i++) {
        const item = episodiosFiltrados[i];
        if (item) next.add(getLesionItemKey(item));
      }
      setSelectedLesionKeys(next);
      setLastClickedIndex(idx);
      return;
    }

    const willSelect = !selectedLesionKeys.has(key);
    setIsDragging(true);
    setDragStartIndex(idx);
    setDragAction(willSelect ? "select" : "deselect");
    setLastClickedIndex(idx);

    const base = new Set(selectedLesionKeys);
    setDragBaseSelection(base);

    const next = new Set(base);
    if (willSelect) next.add(key);
    else next.delete(key);
    setSelectedLesionKeys(next);
  };

  const handleRowMouseEnter = (hoverIdx: number) => {
    if (!isDragging || dragStartIndex === null) return;

    const min = Math.min(dragStartIndex, hoverIdx);
    const max = Math.max(dragStartIndex, hoverIdx);

    const next = new Set(dragBaseSelection);
    const rangeItems = episodiosFiltrados.slice(min, max + 1);

    if (dragAction === "select") {
      rangeItems.forEach((ep) => next.add(getLesionItemKey(ep)));
    } else {
      rangeItems.forEach((ep) => next.delete(getLesionItemKey(ep)));
    }

    setSelectedLesionKeys(next);
  };

  // Borrar en lote todas las lesiones seleccionadas
  const handleDeleteSelected = () => {
    if (selectedLesionKeys.size === 0) return;
    if (!window.confirm(`¿Estás seguro de que deseas eliminar las ${selectedLesionKeys.size} lesiones seleccionadas?`)) return;

    const nextDeletedSet = new Set(deletedLesionKeys);
    const toRemoveKeys = new Set(selectedLesionKeys);

    // Filtrar localRecords
    const nextList = localRecords.filter((r) => {
      const k = getLesionItemKey(r);
      const isSelected = toRemoveKeys.has(k) || (r.id && toRemoveKeys.has(r.id));
      if (isSelected) {
        nextDeletedSet.add(k);
        if (r.id) nextDeletedSet.add(r.id);
        return false;
      }
      return true;
    });

    toRemoveKeys.forEach((k) => nextDeletedSet.add(k));

    setDeletedLesionKeys(nextDeletedSet);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lesiones_eliminadas_v1", JSON.stringify(Array.from(nextDeletedSet)));
      } catch (e) {}
    }

    saveRecordsToStorage(nextList, nextDeletedSet);
    setSelectedLesionKeys(new Set());
    setLastClickedIndex(null);
  };

  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        padding: "16px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
      }}
    >
      {/* 1. GRÁFICO DINÁMICO (MOSTRADO SOLO SI showChart === true) */}
      {showChart && (
        <div
          style={{
            marginBottom: "20px",
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            overflow: "hidden",
            boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
          }}
        >
          {/* Cabecera azul petróleo dinámica con selector de dimensión y botón ocultar */}
          <div
            style={{
              background: "#083344",
              color: "#ffffff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 14px",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "14px" }}>📊</span>
              <span
                style={{
                  fontWeight: 900,
                  fontSize: "12.5px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Clasificación: {DIMENSION_CONFIG[selectedDimension].label}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "11px", opacity: 0.85, fontWeight: 700 }}>
                Ver por:
              </span>
              <select
                value={selectedDimension}
                onChange={(e) => {
                  setSelectedDimension(e.target.value as ClasificacionDimension);
                  setChartSelectedValue(null);
                }}
                style={{
                  background: "#0f172a",
                  color: "#ffffff",
                  border: "1px solid #334155",
                  borderRadius: "5px",
                  padding: "3px 8px",
                  fontSize: "11.5px",
                  fontWeight: 800,
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                <option value="gravedad">Gravedad</option>
                <option value="region_corporal">Región Corporal</option>
                <option value="tejido">Tejido</option>
                <option value="contexto">Contexto</option>
                <option value="contacto">Contacto</option>
                <option value="recurrencia">Recurrencia</option>
                <option value="resultado">Resultado</option>
                <option value="posicion">Posición</option>
              </select>

              {/* Botón para ocultar el gráfico directamente desde su cabecera */}
              <button
                type="button"
                onClick={() => toggleShowChart(false)}
                style={{
                  background: "rgba(255,255,255,0.12)",
                  color: "#ffffff",
                  border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: "5px",
                  padding: "3px 8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                title="Ocultar gráfico superior"
              >
                <span>✕</span> Ocultar gráfico
              </button>
            </div>
          </div>

          {/* Filas dinámicas de la clasificación */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {dynamicStats.map((stat, idx) => {
              const hasData = stat.count > 0;
              const isFilterSelected =
                chartSelectedValue &&
                chartSelectedValue.toLowerCase() === stat.label.toLowerCase();

              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (hasData) {
                      setChartSelectedValue(
                        isFilterSelected ? null : stat.label
                      );
                    }
                  }}
                  title={
                    hasData
                      ? isFilterSelected
                        ? "Clic para quitar filtro de tabla"
                        : `Clic para filtrar la tabla por ${stat.label}`
                      : ""
                  }
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    borderBottom:
                      idx === dynamicStats.length - 1 ? "none" : "1px solid #e2e8f0",
                    minHeight: "26px",
                    fontSize: "11px",
                    cursor: hasData ? "pointer" : "default",
                    background: isFilterSelected ? "#f0fdf4" : "#ffffff",
                    transition: "background 0.15s ease",
                  }}
                >
                  {/* Etiqueta izquierda */}
                  <div
                    style={{
                      width: "200px",
                      padding: "4px 10px",
                      background: isFilterSelected ? "#dcfce7" : "#f8fafc",
                      color: isFilterSelected ? "#15803d" : "#334155",
                      fontWeight: isFilterSelected ? 900 : 700,
                      textAlign: "right",
                      borderRight: "1px solid #cbd5e1",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: "6px",
                    }}
                  >
                    {isFilterSelected && (
                      <span style={{ fontSize: "10px", color: "#16a34a" }}>●</span>
                    )}
                    {stat.label}
                  </div>

                  {/* Barra y Nombres de jugadores */}
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      position: "relative",
                      background: hasData
                        ? isFilterSelected
                          ? "#f0fdf4"
                          : "#f8fafc"
                        : "#f1f5f9",
                    }}
                  >
                    {hasData ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          width: "100%",
                          padding: "2px 10px",
                          background: isFilterSelected
                            ? "#16a34a"
                            : stat.barColor,
                          color: "#ffffff",
                          fontWeight: 800,
                          gap: "10px",
                          minHeight: "24px",
                          boxShadow: isFilterSelected
                            ? "0 2px 4px rgba(22, 163, 74, 0.3)"
                            : "none",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: 900,
                            padding: "0 4px",
                            background: "rgba(0,0,0,0.15)",
                            borderRadius: "4px",
                          }}
                        >
                          {stat.count}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            letterSpacing: "0.3px",
                          }}
                        >
                          {stat.players}
                        </span>
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: "4px 10px",
                          color: "#94a3b8",
                          fontStyle: "italic",
                          fontSize: "10.5px",
                        }}
                      >
                        —
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. BARRA DE FILTROS, TOGGLE DE GRÁFICO & ACCIONES */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          background: "#f8fafc",
          padding: "8px 12px",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          marginBottom: "14px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: "200px" }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por deportista, tejido, región o comentario…"
            style={{
              width: "100%",
              padding: "5px 10px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              fontSize: "11.5px",
              outline: "none",
            }}
          />
        </div>

        {/* Indicador de filtro activo desde la barra */}
        {showChart && chartSelectedValue && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "#dcfce7",
              border: "1px solid #86efac",
              padding: "3px 8px",
              borderRadius: "6px",
              fontSize: "11.5px",
              color: "#166534",
              fontWeight: 700,
            }}
          >
            <span>
              Filtro: <strong>{chartSelectedValue}</strong> ({DIMENSION_CONFIG[selectedDimension].label})
            </span>
            <button
              type="button"
              onClick={() => setChartSelectedValue(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#166534",
                fontWeight: 900,
                cursor: "pointer",
                padding: "0 2px",
              }}
              title="Quitar filtro del gráfico"
            >
              ✕
            </button>
          </div>
        )}

        {/* Botón para Mostrar / Ocultar Gráfico */}
        <button
          type="button"
          onClick={() => toggleShowChart()}
          style={{
            padding: "5px 10px",
            borderRadius: "6px",
            border: "1px solid #cbd5e1",
            background: showChart ? "#e2e8f0" : "#ffffff",
            color: showChart ? "#1e3a8a" : "#475569",
            fontSize: "11.5px",
            fontWeight: 800,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
          }}
          title={showChart ? "Ocultar gráfico superior" : "Mostrar gráfico superior"}
        >
          <span>📊</span> {showChart ? "Ocultar Gráfico" : "Mostrar Gráfico"}
        </button>

        {/* Filtro Deportista */}
        <select
          value={filterPlayerId}
          onChange={(e) => setFilterPlayerId(e.target.value)}
          style={{
            padding: "5px 8px",
            borderRadius: "6px",
            border: "1px solid #cbd5e1",
            fontSize: "11.5px",
            fontWeight: 600,
            background: "#ffffff",
            color: "#0f172a",
          }}
        >
          <option value="ALL">Todos los deportistas</option>
          {jugadores.map((j) => (
            <option key={j.id} value={j.id}>
              {(j.nombre || "").toUpperCase()} {j.apodo ? `(${(j.apodo || "").toUpperCase()})` : ""}
            </option>
          ))}
        </select>

        {/* Indicador de persistencia BBDD */}
        <div
          style={{
            fontSize: "11px",
            fontWeight: 700,
            padding: "4px 9px",
            borderRadius: "6px",
            background: bbddStatus.includes("✓") ? "#dcfce7" : bbddStatus.includes("Guardando") ? "#fef3c7" : "#f1f5f9",
            color: bbddStatus.includes("✓") ? "#15803d" : bbddStatus.includes("Guardando") ? "#b45309" : "#475569",
            border: `1px solid ${bbddStatus.includes("✓") ? "#86efac" : bbddStatus.includes("Guardando") ? "#fde047" : "#cbd5e1"}`,
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
          }}
          title="Estado de sincronización permanente con la base de datos Supabase"
        >
          <span>{bbddStatus.includes("✓") ? "💾" : bbddStatus.includes("Guardando") ? "⏳" : "🔄"}</span>
          <span>{bbddStatus}</span>
        </div>

        {/* Botón Añadir Incidencia Manual */}
        <button
          type="button"
          onClick={() => {
            const firstPlayer = jugadores[0] || {};
            setEditingModalRecord({
              id: `manual_${Date.now()}`,
              jugador_id: firstPlayer.id || "",
              jugador_nombre: firstPlayer.nombre || "",
              jugador_apodo: firstPlayer.apodo || "",
              posicion: firstPlayer.posicion || "",
              cor_id: firstPlayer.cor_id || firstPlayer.dorsal || "",
              seccion: "CE MANRESA",
              equipo: "1er EQUIPO",
              fecha_nacimiento: firstPlayer.fecha_nacimiento || "",
              fecha: new Date().toISOString().split("T")[0],
              fecha_alta: "",
              tipo_disponibilidad: "NDL",
              contexto: "Entrenamiento Optimizador",
              contacto: "Sin contacto",
              region_corporal: "Muslo (cuádriceps)",
              recurrencia: "Nueva",
              tejido: "Músculo",
              resultado: "Con baja",
              gravedad: "Leve (1 a 7)",
              dias_baja: 3,
              comentario: "",
            });
            setIsAddingNew(true);
          }}
          style={{
            padding: "5px 12px",
            borderRadius: "6px",
            border: "none",
            background: "#1e3a8a",
            color: "#ffffff",
            fontSize: "11.5px",
            fontWeight: 800,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <span>+</span> Añadir Lesión
        </button>
      </div>

      {/* Banner informativo de temporada activa */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
          padding: "7px 12px",
          background: "#f0f9ff",
          border: "1px solid #bae6fd",
          borderRadius: "6px",
          fontSize: "11.5px",
          color: "#0369a1",
          fontWeight: 700,
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>📅</span>
          <span>
            <strong>{currentTeam} · {seasonLabel}</strong>: Mostrando únicamente lesiones de la temporada en curso ({seasonStart.split("-").reverse().join("/")} – {seasonEnd.split("-").reverse().join("/")})
          </span>
        </div>
        <span style={{ fontSize: "10.5px", color: "#0284c7", fontWeight: 800 }}>
          ✓ {episodiosFiltrados.length} incidencias esta temporada
        </span>
      </div>

      {/* BARRA DE ACCIÓN FLOTANTE CUANDO HAY LESIONES SELECCIONADAS (ESTILO EXCEL) */}
      {selectedLesionKeys.size > 0 && (
        <div
          style={{
            position: "sticky",
            top: "10px",
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#fee2e2",
            border: "1.5px solid #ef4444",
            padding: "8px 14px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(239,68,68,0.15)",
            marginBottom: "12px",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "14px" }}>📋</span>
            <span style={{ fontSize: "12px", fontWeight: 900, color: "#991b1b" }}>
              {selectedLesionKeys.size} {selectedLesionKeys.size === 1 ? "lesión seleccionada" : "lesiones seleccionadas"}
            </span>
            <span style={{ fontSize: "11px", color: "#b91c1c" }}>
              (Arrastra con clic presionado o usa Shift para seleccionar varias seguidas)
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={() => {
                setSelectedLesionKeys(new Set());
                setLastClickedIndex(null);
              }}
              style={{
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "5px",
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: 700,
                color: "#475569",
                cursor: "pointer",
              }}
            >
              ✕ Deseleccionar
            </button>

            <button
              type="button"
              onClick={handleDeleteSelected}
              style={{
                background: "#dc2626",
                border: "none",
                borderRadius: "5px",
                padding: "5px 14px",
                fontSize: "11.5px",
                fontWeight: 900,
                color: "#ffffff",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                boxShadow: "0 2px 4px rgba(220,38,38,0.25)",
              }}
            >
              <span>🗑️</span> Borrar Seleccionadas ({selectedLesionKeys.size})
            </button>
          </div>
        </div>
      )}

      {/* 3. TABLA CON SELECTORES DE COLUMNA PARA EL GRÁFICO (CHECKBOXES / BOTONES INTERACTIVOS) */}
      <div style={{ overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: "6px" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "11.5px",
            textAlign: "left",
            whiteSpace: "nowrap",
          }}
        >
          <thead>
            {/* FILA DE SELECTORES DE CLASIFICACIÓN (CHECKBOXES ESTILO EXCEL) */}
            <tr style={{ background: "#f1f5f9", borderBottom: "1px solid #cbd5e1", textAlign: "center" }}>
              <th style={{ padding: "4px", borderRight: "1px solid #e2e8f0", width: "38px" }}></th>
              <th style={{ padding: "4px", borderRight: "1px solid #e2e8f0" }}></th>
              <th style={{ padding: "4px", borderRight: "1px solid #e2e8f0" }}></th>
              <th style={{ padding: "4px", borderRight: "1px solid #e2e8f0" }}></th>

              {/* Posición */}
              <th style={{ padding: "4px", borderRight: "1px solid #e2e8f0" }}>
                <input
                  type="radio"
                  name="clasif_dim"
                  checked={showChart && selectedDimension === "posicion"}
                  onChange={() => {
                    toggleShowChart(true);
                    setSelectedDimension("posicion");
                    setChartSelectedValue(null);
                  }}
                  title="Clasificar gráfico superior por Posición"
                  style={{ cursor: "pointer", accentColor: "#1e3a8a" }}
                />
              </th>

              {/* Contexto */}
              <th style={{ padding: "4px", borderRight: "1px solid #e2e8f0" }}>
                <input
                  type="radio"
                  name="clasif_dim"
                  checked={showChart && selectedDimension === "contexto"}
                  onChange={() => {
                    toggleShowChart(true);
                    setSelectedDimension("contexto");
                    setChartSelectedValue(null);
                  }}
                  title="Clasificar gráfico superior por Contexto"
                  style={{ cursor: "pointer", accentColor: "#1e3a8a" }}
                />
              </th>

              {/* Contacto */}
              <th style={{ padding: "4px", borderRight: "1px solid #e2e8f0" }}>
                <input
                  type="radio"
                  name="clasif_dim"
                  checked={showChart && selectedDimension === "contacto"}
                  onChange={() => {
                    toggleShowChart(true);
                    setSelectedDimension("contacto");
                    setChartSelectedValue(null);
                  }}
                  title="Clasificar gráfico superior por Contacto"
                  style={{ cursor: "pointer", accentColor: "#1e3a8a" }}
                />
              </th>

              {/* Región corporal */}
              <th style={{ padding: "4px", borderRight: "1px solid #e2e8f0" }}>
                <input
                  type="radio"
                  name="clasif_dim"
                  checked={showChart && selectedDimension === "region_corporal"}
                  onChange={() => {
                    toggleShowChart(true);
                    setSelectedDimension("region_corporal");
                    setChartSelectedValue(null);
                  }}
                  title="Clasificar gráfico superior por Región corporal"
                  style={{ cursor: "pointer", accentColor: "#1e3a8a" }}
                />
              </th>

              {/* Recurrencia */}
              <th style={{ padding: "4px", borderRight: "1px solid #e2e8f0" }}>
                <input
                  type="radio"
                  name="clasif_dim"
                  checked={showChart && selectedDimension === "recurrencia"}
                  onChange={() => {
                    toggleShowChart(true);
                    setSelectedDimension("recurrencia");
                    setChartSelectedValue(null);
                  }}
                  title="Clasificar gráfico superior por Recurrencia"
                  style={{ cursor: "pointer", accentColor: "#1e3a8a" }}
                />
              </th>

              {/* Tejido */}
              <th style={{ padding: "4px", borderRight: "1px solid #e2e8f0" }}>
                <input
                  type="radio"
                  name="clasif_dim"
                  checked={showChart && selectedDimension === "tejido"}
                  onChange={() => {
                    toggleShowChart(true);
                    setSelectedDimension("tejido");
                    setChartSelectedValue(null);
                  }}
                  title="Clasificar gráfico superior por Tejido"
                  style={{ cursor: "pointer", accentColor: "#1e3a8a" }}
                />
              </th>

              {/* Resultado */}
              <th style={{ padding: "4px", borderRight: "1px solid #e2e8f0" }}>
                <input
                  type="radio"
                  name="clasif_dim"
                  checked={showChart && selectedDimension === "resultado"}
                  onChange={() => {
                    toggleShowChart(true);
                    setSelectedDimension("resultado");
                    setChartSelectedValue(null);
                  }}
                  title="Clasificar gráfico superior por Resultado"
                  style={{ cursor: "pointer", accentColor: "#1e3a8a" }}
                />
              </th>

              {/* Gravedad */}
              <th style={{ padding: "4px", borderRight: "1px solid #e2e8f0" }}>
                <input
                  type="radio"
                  name="clasif_dim"
                  checked={showChart && selectedDimension === "gravedad"}
                  onChange={() => {
                    toggleShowChart(true);
                    setSelectedDimension("gravedad");
                    setChartSelectedValue(null);
                  }}
                  title="Clasificar gráfico superior por Gravedad"
                  style={{ cursor: "pointer", accentColor: "#1e3a8a" }}
                />
              </th>

              <th style={{ padding: "4px", borderRight: "1px solid #e2e8f0" }}></th>
              <th style={{ padding: "4px" }}></th>
              <th style={{ padding: "4px" }}></th>
            </tr>

            {/* FILA DE NOMBRES DE COLUMNA CLICKABLES */}
            <tr
              style={{
                background: "#475569",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: "10.5px",
                textAlign: "center",
              }}
            >
              <th style={{ padding: "6px 8px", width: "38px", textAlign: "center", borderRight: "1px solid #64748b" }}>
                <input
                  type="checkbox"
                  checked={episodiosFiltrados.length > 0 && selectedLesionKeys.size === episodiosFiltrados.length}
                  onChange={handleToggleAll}
                  style={{ cursor: "pointer", width: "14px", height: "14px", accentColor: "#dc2626" }}
                  title="Seleccionar / deseleccionar todas"
                />
              </th>
              <th style={{ padding: "8px 10px", borderRight: "1px solid #64748b" }}>Deportista</th>
              <th style={{ padding: "8px 10px", borderRight: "1px solid #64748b" }}>Fecha Lesión</th>
              <th style={{ padding: "8px 10px", borderRight: "1px solid #64748b" }}>Vuelta / Alta</th>

              {/* Posición Clickable */}
              <th
                onClick={() => {
                  toggleShowChart(true);
                  setSelectedDimension("posicion");
                  setChartSelectedValue(null);
                }}
                style={{
                  padding: "8px 10px",
                  borderRight: "1px solid #64748b",
                  cursor: "pointer",
                  background: showChart && selectedDimension === "posicion" ? "#1e3a8a" : "inherit",
                }}
                title="Haz clic para clasificar el gráfico superior por Posición"
              >
                Posición {showChart && selectedDimension === "posicion" && "📊"}
              </th>

              {/* Contexto Clickable */}
              <th
                onClick={() => {
                  toggleShowChart(true);
                  setSelectedDimension("contexto");
                  setChartSelectedValue(null);
                }}
                style={{
                  padding: "8px 10px",
                  borderRight: "1px solid #64748b",
                  cursor: "pointer",
                  background: showChart && selectedDimension === "contexto" ? "#1e3a8a" : "inherit",
                }}
                title="Haz clic para clasificar el gráfico superior por Contexto"
              >
                Contexto {showChart && selectedDimension === "contexto" && "📊"}
              </th>

              {/* Contacto Clickable */}
              <th
                onClick={() => {
                  toggleShowChart(true);
                  setSelectedDimension("contacto");
                  setChartSelectedValue(null);
                }}
                style={{
                  padding: "8px 10px",
                  borderRight: "1px solid #64748b",
                  cursor: "pointer",
                  background: showChart && selectedDimension === "contacto" ? "#1e3a8a" : "inherit",
                }}
                title="Haz clic para clasificar el gráfico superior por Contacto"
              >
                Contacto {showChart && selectedDimension === "contacto" && "📊"}
              </th>

              {/* Región corporal Clickable */}
              <th
                onClick={() => {
                  toggleShowChart(true);
                  setSelectedDimension("region_corporal");
                  setChartSelectedValue(null);
                }}
                style={{
                  padding: "8px 12px",
                  borderRight: "1px solid #64748b",
                  cursor: "pointer",
                  background: showChart && selectedDimension === "region_corporal" ? "#1e3a8a" : "inherit",
                }}
                title="Haz clic para clasificar el gráfico superior por Región corporal"
              >
                Región corporal {showChart && selectedDimension === "region_corporal" && "📊"}
              </th>

              {/* Recurrencia Clickable */}
              <th
                onClick={() => {
                  toggleShowChart(true);
                  setSelectedDimension("recurrencia");
                  setChartSelectedValue(null);
                }}
                style={{
                  padding: "8px 8px",
                  borderRight: "1px solid #64748b",
                  cursor: "pointer",
                  background: showChart && selectedDimension === "recurrencia" ? "#1e3a8a" : "inherit",
                }}
                title="Haz clic para clasificar el gráfico superior por Recurrencia"
              >
                Recurrencia {showChart && selectedDimension === "recurrencia" && "📊"}
              </th>

              {/* Tejido Clickable */}
              <th
                onClick={() => {
                  toggleShowChart(true);
                  setSelectedDimension("tejido");
                  setChartSelectedValue(null);
                }}
                style={{
                  padding: "8px 10px",
                  borderRight: "1px solid #64748b",
                  cursor: "pointer",
                  background: showChart && selectedDimension === "tejido" ? "#1e3a8a" : "inherit",
                }}
                title="Haz clic para clasificar el gráfico superior por Tejido"
              >
                Tejido {showChart && selectedDimension === "tejido" && "📊"}
              </th>

              {/* Resultado Clickable */}
              <th
                onClick={() => {
                  toggleShowChart(true);
                  setSelectedDimension("resultado");
                  setChartSelectedValue(null);
                }}
                style={{
                  padding: "8px 8px",
                  borderRight: "1px solid #64748b",
                  cursor: "pointer",
                  background: showChart && selectedDimension === "resultado" ? "#1e3a8a" : "inherit",
                }}
                title="Haz clic para clasificar el gráfico superior por Resultado"
              >
                Resultado {showChart && selectedDimension === "resultado" && "📊"}
              </th>

              {/* Gravedad Clickable */}
              <th
                onClick={() => {
                  toggleShowChart(true);
                  setSelectedDimension("gravedad");
                  setChartSelectedValue(null);
                }}
                style={{
                  padding: "8px 10px",
                  borderRight: "1px solid #64748b",
                  cursor: "pointer",
                  background: showChart && selectedDimension === "gravedad" ? "#1e3a8a" : "inherit",
                }}
                title="Haz clic para clasificar el gráfico superior por Gravedad"
              >
                Gravedad {showChart && selectedDimension === "gravedad" && "📊"}
              </th>

              <th style={{ padding: "8px 8px", borderRight: "1px solid #64748b" }}>Días de baja</th>
              <th style={{ padding: "8px 14px", minWidth: "280px" }}>Comentario (Editable)</th>
              <th style={{ padding: "8px 8px", textAlign: "center" }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {episodiosFiltrados.length === 0 ? (
              <tr>
                <td
                  colSpan={15}
                  style={{
                    padding: "30px",
                    textAlign: "center",
                    color: "#64748b",
                    background: "#f8fafc",
                  }}
                >
                  No hay registros lesionales para los filtros seleccionados.
                  {chartSelectedValue && (
                    <div style={{ marginTop: "6px" }}>
                      <button
                        type="button"
                        onClick={() => setChartSelectedValue(null)}
                        style={{
                          background: "#1e3a8a",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "4px",
                          padding: "4px 10px",
                          fontSize: "11px",
                          cursor: "pointer",
                        }}
                      >
                        Quitar filtro "{chartSelectedValue}"
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              episodiosFiltrados.map((ep, idx) => {
                const isEven = idx % 2 === 0;
                const itemKey = getLesionItemKey(ep);
                const isChecked = selectedLesionKeys.has(itemKey);
                const rowKey = `${ep.id || ep.jugador_id}_${ep.fecha}_${idx}`;
                const saveKey = `${ep.jugador_id}_${ep.fecha}`;
                const isSaved = saveIndicatorId === saveKey;

                return (
                  <tr
                    key={rowKey}
                    onMouseDown={(e) => {
                      if (e.shiftKey) {
                        handleRowMouseDown(idx, itemKey, e);
                      }
                    }}
                    onMouseEnter={() => handleRowMouseEnter(idx)}
                    style={{
                      background: isChecked ? "#fef2f2" : isEven ? "#ffffff" : "#f8fafc",
                      borderBottom: "1px solid #e2e8f0",
                      color: "#0f172a",
                      userSelect: isDragging ? "none" : "auto",
                      transition: "background-color 0.1s ease",
                    }}
                  >
                    {/* Checkbox de selección tipo Excel con clic y arrastre */}
                    <td
                      onMouseDown={(e) => handleRowMouseDown(idx, itemKey, e)}
                      onMouseEnter={() => handleRowMouseEnter(idx)}
                      style={{
                        padding: "6px 8px",
                        textAlign: "center",
                        borderRight: "1px solid #e2e8f0",
                        cursor: "pointer",
                        background: isChecked ? "#fee2e2" : "inherit",
                        userSelect: "none",
                        width: "38px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        style={{
                          cursor: "pointer",
                          width: "14px",
                          height: "14px",
                          accentColor: "#dc2626",
                          pointerEvents: "none",
                        }}
                      />
                    </td>

                    <td
                      style={{
                        padding: "7px 10px",
                        fontWeight: 900,
                        borderRight: "1px solid #e2e8f0",
                        textAlign: "center",
                      }}
                    >
                      {ep.jugador_apodo || ep.jugador_nombre.toUpperCase()}
                    </td>
                    <td
                      style={{
                        padding: "7px 10px",
                        fontWeight: 700,
                        borderRight: "1px solid #e2e8f0",
                        textAlign: "center",
                      }}
                    >
                      {ep.fecha}
                    </td>
                    <td
                      style={{
                        padding: "7px 10px",
                        fontWeight: 700,
                        borderRight: "1px solid #e2e8f0",
                        textAlign: "center",
                      }}
                    >
                      {ep.fecha_alta ? (
                        <span style={{ color: "#166534", fontWeight: 800 }}>
                          {ep.fecha_alta}
                        </span>
                      ) : (
                        <span
                          style={{
                            background: "#fef3c7",
                            color: "#b45309",
                            border: "1px solid #fde047",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "10px",
                            fontWeight: 800,
                          }}
                        >
                          En curso
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "7px 10px",
                        borderRight: "1px solid #e2e8f0",
                        textAlign: "center",
                        fontWeight: 700,
                        background: showChart && selectedDimension === "posicion" ? "#eff6ff" : "inherit",
                      }}
                    >
                      {ep.posicion?.toUpperCase() || "—"}
                    </td>
                    <td
                      style={{
                        padding: "7px 10px",
                        borderRight: "1px solid #e2e8f0",
                        textAlign: "center",
                        background: showChart && selectedDimension === "contexto" ? "#eff6ff" : "inherit",
                      }}
                    >
                      {ep.contexto || "Entrenamiento Optimizador"}
                    </td>
                    <td
                      style={{
                        padding: "7px 10px",
                        borderRight: "1px solid #e2e8f0",
                        textAlign: "center",
                        background: showChart && selectedDimension === "contacto" ? "#eff6ff" : "inherit",
                      }}
                    >
                      {ep.contacto || "Sin contacto"}
                    </td>
                    <td
                      style={{
                        padding: "7px 12px",
                        borderRight: "1px solid #e2e8f0",
                        fontWeight: 700,
                        background: showChart && selectedDimension === "region_corporal" ? "#eff6ff" : "inherit",
                      }}
                    >
                      {ep.region_corporal || "—"}
                    </td>
                    <td
                      style={{
                        padding: "7px 8px",
                        borderRight: "1px solid #e2e8f0",
                        textAlign: "center",
                        background: showChart && selectedDimension === "recurrencia" ? "#eff6ff" : "inherit",
                      }}
                    >
                      {ep.recurrencia || "Nueva"}
                    </td>
                    <td
                      style={{
                        padding: "7px 10px",
                        borderRight: "1px solid #e2e8f0",
                        textAlign: "center",
                        background: showChart && selectedDimension === "tejido" ? "#eff6ff" : "inherit",
                      }}
                    >
                      {ep.tejido || "Músculo"}
                    </td>
                    <td
                      style={{
                        padding: "7px 8px",
                        borderRight: "1px solid #e2e8f0",
                        textAlign: "center",
                        background: showChart && selectedDimension === "resultado" ? "#eff6ff" : "inherit",
                      }}
                    >
                      {ep.resultado || "Con baja"}
                    </td>
                    <td
                      style={{
                        padding: "7px 10px",
                        borderRight: "1px solid #e2e8f0",
                        textAlign: "center",
                        fontWeight: 700,
                        color: ep.gravedad.includes("Grave")
                          ? "#dc2626"
                          : ep.gravedad.includes("Moderada")
                          ? "#d97706"
                          : "#2563eb",
                        background: showChart && selectedDimension === "gravedad" ? "#eff6ff" : "inherit",
                      }}
                    >
                      {ep.gravedad}
                    </td>
                    <td
                      style={{
                        padding: "7px 8px",
                        borderRight: "1px solid #e2e8f0",
                        textAlign: "center",
                        fontWeight: 900,
                      }}
                    >
                      {ep.dias_baja}
                    </td>

                    {/* COMENTARIO EDITABLE INLINE DIRECTAMENTE POR EL USUARIO */}
                    <td style={{ padding: "4px 8px", position: "relative", minWidth: "280px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <input
                          type="text"
                          defaultValue={ep.comentario || undefined}
                          key={ep.comentario || saveKey}
                          onBlur={(e) => {
                            const val = e.target.value;
                            if (val !== (ep.comentario || "")) {
                              handleUpdateComment(ep, val);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          placeholder="Escribe o edita el comentario…"
                          style={{
                            width: "100%",
                            padding: "4px 8px",
                            borderRadius: "5px",
                            border: "1px solid #cbd5e1",
                            background: "#ffffff",
                            fontSize: "11px",
                            color: "#0f172a",
                            outline: "none",
                          }}
                        />
                        {isSaved && (
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 800,
                              color: "#16a34a",
                              whiteSpace: "nowrap",
                            }}
                          >
                            ✓ Guardado
                          </span>
                        )}
                      </div>
                    </td>

                    {/* ACCIONES (EDITAR COMPLETO / BORRAR) */}
                    <td style={{ padding: "4px 8px", textAlign: "center" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                        }}
                      >
                        <button
                          type="button"
                          title="Editar detalles completos"
                          onClick={() => setEditingModalRecord(ep)}
                          style={{
                            background: "#e0f2fe",
                            border: "1px solid #bae6fd",
                            borderRadius: "4px",
                            padding: "3px 6px",
                            fontSize: "10px",
                            cursor: "pointer",
                            color: "#0369a1",
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          title="Eliminar registro"
                          onClick={() => handleDeleteRecord(ep)}
                          style={{
                            background: "#fee2e2",
                            border: "1px solid #fecaca",
                            borderRadius: "4px",
                            padding: "3px 6px",
                            fontSize: "10px",
                            cursor: "pointer",
                            color: "#b91c1c",
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL DE EDICIÓN O AÑADIR REGISTRO MANUAL */}
      {editingModalRecord && (
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
          onClick={() => setEditingModalRecord(null)}
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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "18px",
                borderBottom: "1px solid #e2e8f0",
                paddingBottom: "12px",
              }}
            >
              <h3 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: 0 }}>
                {isAddingNew
                  ? "➕ Añadir Nueva Incidencia Lesional"
                  : `✏️ Editar Lesión de ${editingModalRecord.jugador_nombre}`}
              </h3>
              <button
                type="button"
                onClick={() => setEditingModalRecord(null)}
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  fontSize: "13px",
                  fontWeight: 800,
                  color: "#64748b",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveModalRecord(editingModalRecord);
              }}
            >
              {/* Selección de deportista si es nuevo */}
              {isAddingNew && (
                <div style={{ marginBottom: "14px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11.5px",
                      fontWeight: 800,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    Deportista *
                  </label>
                  <select
                    value={editingModalRecord.jugador_id}
                    onChange={(e) => {
                      const sel = jugadores.find((j) => j.id === e.target.value);
                      if (sel) {
                        setEditingModalRecord({
                          ...editingModalRecord,
                          jugador_id: sel.id,
                          jugador_nombre: sel.nombre,
                          jugador_apodo: sel.apodo || "",
                          posicion: sel.posicion || "",
                          cor_id: sel.cor_id || sel.dorsal || "",
                          fecha_nacimiento: sel.fecha_nacimiento || "",
                        });
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "7px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  >
                    {jugadores.map((j) => (
                      <option key={j.id} value={j.id}>
                        {(j.nombre || "").toUpperCase()} {j.apodo ? `(${(j.apodo || "").toUpperCase()})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Pregunta de fecha de inicio y fecha de vuelta a disponibilidad */}
              <div
                style={{
                  background: "#eff6ff",
                  border: "1.5px solid #93c5fd",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  marginBottom: "16px",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 800,
                      color: "#1e3a8a",
                      marginBottom: "6px",
                    }}
                  >
                    📅 ¿Cuándo ocurrió la lesión? *
                  </label>
                  <input
                    type="date"
                    required
                    value={editingModalRecord.fecha}
                    onChange={(e) => {
                      const newFecha = e.target.value;
                      let newDias = editingModalRecord.dias_baja;
                      let newGrav = editingModalRecord.gravedad;
                      let newRes = editingModalRecord.resultado;
                      if (editingModalRecord.fecha_alta && newFecha) {
                        const d1 = new Date(newFecha + "T00:00:00");
                        const d2 = new Date(editingModalRecord.fecha_alta + "T00:00:00");
                        newDias = Math.max(0, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
                        if (newDias === 0) {
                          newGrav = "Sin baja (0)";
                          newRes = "Sin baja";
                        } else if (newDias <= 7) {
                          newGrav = "Leve (1 a 7)";
                          newRes = "Con baja";
                        } else if (newDias <= 28) {
                          newGrav = "Moderada (8 a 28)";
                          newRes = "Con baja";
                        } else {
                          newGrav = "Grave (>28)";
                          newRes = "Con baja";
                        }
                      }
                      setEditingModalRecord({
                        ...editingModalRecord,
                        fecha: newFecha,
                        dias_baja: newDias,
                        gravedad: newGrav,
                        resultado: newRes,
                      });
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "1.5px solid #2563eb",
                      fontSize: "13px",
                      fontWeight: 800,
                      color: "#0f172a",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 800,
                      color: "#15803d",
                      marginBottom: "6px",
                    }}
                  >
                    🟢 ¿Cuándo volvió a estar disponible? (Opcional)
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <input
                      type="date"
                      value={editingModalRecord.fecha_alta || ""}
                      onChange={(e) => {
                        const altaVal = e.target.value;
                        let newDias = editingModalRecord.dias_baja;
                        let newGrav = editingModalRecord.gravedad;
                        let newRes = editingModalRecord.resultado;
                        if (altaVal && editingModalRecord.fecha) {
                          const d1 = new Date(editingModalRecord.fecha + "T00:00:00");
                          const d2 = new Date(altaVal + "T00:00:00");
                          newDias = Math.max(0, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
                          if (newDias === 0) {
                            newGrav = "Sin baja (0)";
                            newRes = "Sin baja";
                          } else if (newDias <= 7) {
                            newGrav = "Leve (1 a 7)";
                            newRes = "Con baja";
                          } else if (newDias <= 28) {
                            newGrav = "Moderada (8 a 28)";
                            newRes = "Con baja";
                          } else {
                            newGrav = "Grave (>28)";
                            newRes = "Con baja";
                          }
                        }
                        setEditingModalRecord({
                          ...editingModalRecord,
                          fecha_alta: altaVal,
                          dias_baja: newDias,
                          gravedad: newGrav,
                          resultado: newRes,
                        });
                      }}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "1.5px solid #16a34a",
                        fontSize: "13px",
                        fontWeight: 800,
                        color: "#0f172a",
                        flex: 1,
                        boxSizing: "border-box",
                      }}
                    />
                    {editingModalRecord.fecha_alta && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingModalRecord({
                            ...editingModalRecord,
                            fecha_alta: "",
                          })
                        }
                        style={{
                          background: "#f1f5f9",
                          border: "1px solid #cbd5e1",
                          borderRadius: "5px",
                          padding: "6px 8px",
                          fontSize: "11px",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                        title="Limpiar fecha de alta (sigue de baja)"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <span style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 600, display: "block", marginTop: "4px" }}>
                    {editingModalRecord.fecha_alta ? `✓ Calcula automáticamente ${editingModalRecord.dias_baja} días de baja` : "Dejar vacío si la baja sigue activa"}
                  </span>
                </div>
              </div>

              {/* Selectores de clasificación */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11.5px",
                      fontWeight: 800,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    Contexto
                  </label>
                  <select
                    value={editingModalRecord.contexto}
                    onChange={(e) =>
                      setEditingModalRecord({
                        ...editingModalRecord,
                        contexto: e.target.value,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  >
                    {CONTEXTOS_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11.5px",
                      fontWeight: 800,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    Contacto
                  </label>
                  <select
                    value={editingModalRecord.contacto}
                    onChange={(e) =>
                      setEditingModalRecord({
                        ...editingModalRecord,
                        contacto: e.target.value,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  >
                    {CONTACTO_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11.5px",
                      fontWeight: 800,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    Región Corporal
                  </label>
                  <select
                    value={editingModalRecord.region_corporal}
                    onChange={(e) =>
                      setEditingModalRecord({
                        ...editingModalRecord,
                        region_corporal: e.target.value,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  >
                    {REGIONES_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11.5px",
                      fontWeight: 800,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    Recurrencia
                  </label>
                  <select
                    value={editingModalRecord.recurrencia}
                    onChange={(e) =>
                      setEditingModalRecord({
                        ...editingModalRecord,
                        recurrencia: e.target.value,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  >
                    {RECURRENCIA_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11.5px",
                      fontWeight: 800,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    Tejido
                  </label>
                  <select
                    value={editingModalRecord.tejido}
                    onChange={(e) =>
                      setEditingModalRecord({
                        ...editingModalRecord,
                        tejido: e.target.value,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  >
                    {TEJIDO_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11.5px",
                      fontWeight: 800,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    Resultado
                  </label>
                  <select
                    value={editingModalRecord.resultado}
                    onChange={(e) =>
                      setEditingModalRecord({
                        ...editingModalRecord,
                        resultado: e.target.value,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  >
                    {RESULTADO_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11.5px",
                      fontWeight: 800,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    Días de Baja
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editingModalRecord.dias_baja}
                    onChange={(e) => {
                      const d = Number(e.target.value) || 0;
                      let g = "Leve (1 a 7)";
                      if (d === 0) g = "Sin baja (0)";
                      else if (d <= 7) g = "Leve (1 a 7)";
                      else if (d <= 28) g = "Moderada (8 a 28)";
                      else g = "Grave (>28)";
                      setEditingModalRecord({
                        ...editingModalRecord,
                        dias_baja: d,
                        gravedad: g,
                      });
                    }}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11.5px",
                      fontWeight: 800,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    Gravedad
                  </label>
                  <select
                    value={editingModalRecord.gravedad}
                    onChange={(e) =>
                      setEditingModalRecord({
                        ...editingModalRecord,
                        gravedad: e.target.value,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  >
                    {GRAVEDAD_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Comentario */}
              <div style={{ marginBottom: "18px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11.5px",
                    fontWeight: 800,
                    color: "#334155",
                    marginBottom: "4px",
                  }}
                >
                  💬 Comentario / Observaciones Clínicas
                </label>
                <textarea
                  rows={3}
                  value={editingModalRecord.comentario || ""}
                  onChange={(e) =>
                    setEditingModalRecord({
                      ...editingModalRecord,
                      comentario: e.target.value,
                    })
                  }
                  placeholder="Detalles del diagnóstico, fisioterapia, pautas o evolución..."
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "12px",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  borderTop: "1px solid #e2e8f0",
                  paddingTop: "14px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setEditingModalRecord(null)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#475569",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "8px 18px",
                    borderRadius: "6px",
                    border: "none",
                    background: "#1e3a8a",
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  ✓ Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
