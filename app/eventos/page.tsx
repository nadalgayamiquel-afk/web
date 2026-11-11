"use client";

import { pruneStaleFutureLocalStorage } from "@/app/lib/cleanStorage";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useClubConfig } from "@/app/lib/useClubConfig";
import { getActiveJugadores, getEventosBloquesBBDD, saveFullPlanificacionBBDD, saveMinutosJugadorEvento, getMinutosJugadorEventoAll, getPlayerEventsBBDD, savePlayerEventAssignments, saveEventDetailBBDD, getPlayerCommentsBBDD, saveSingleBloqueBBDD } from "../actions";

export type EventoBloque = {
  id: string;
  day_id: string;
  fecha: string;
  slot: number;
  tipo: string;
  hora: string;
  lugar: string;
  duracion: string;
  orientacion: string;
  carga: string;
  comentario: string;
  num_jugadores?: string;
};

export type TipoEventoConfig = {
  codigo: string;
  nombre: string;
  color: string;
  bg: string;
  border: string;
};

export type JugadorItem = {
  id: string;
  nombre: string;
  apodo?: string;
  dorsal?: number | string | null;
  posicion?: string;
  foto_url?: string;
};

export type EventoItem = {
  id: string;
  titulo: string;
  nombreCompleto: string;
  tipoCat: string;
  codigo: string;
  fecha: string; // 'YYYY-MM-DD'
  horaInicio: string; // 'HH:MM'
  duracionMin: number;
  lugar: string;
  orientacion?: string;
  carga?: string;
  comentario?: string;
  slotIdx: number;
  dayId: string;
};

export type PlayerEventMinuteData = {
  minutos: number;
  comentario: string;
  tipo: string;
  titularidad?: "T" | "S";
};

const DEFAULT_JUGADORES: JugadorItem[] = [
  { id: "j1", nombre: "Álex Rubio", dorsal: 4, posicion: "Central", foto_url: "" },
  { id: "j2", nombre: "Marc Fernández", dorsal: 7, posicion: "Extremo", foto_url: "" },
  { id: "j3", nombre: "Pau Gasol", dorsal: 16, posicion: "Pívot", foto_url: "" },
  { id: "j4", nombre: "Sergi Llull", dorsal: 23, posicion: "Base", foto_url: "" },
  { id: "j5", nombre: "Ricky Rubio", dorsal: 9, posicion: "Base", foto_url: "" },
  { id: "j6", nombre: "Willy Hernangómez", dorsal: 14, posicion: "Pívot", foto_url: "" },
  { id: "j7", nombre: "Juancho Hernangómez", dorsal: 41, posicion: "Alero", foto_url: "" },
  { id: "j8", nombre: "Usman Garuba", dorsal: 17, posicion: "Ala-Pívot", foto_url: "" },
];

const DEFAULT_TIPOS_EVENTO_CONFIG: TipoEventoConfig[] = [
  { codigo: "Co", nombre: "Coadyuvante", color: "#713f12", bg: "#fde047", border: "#eab308" },
  { codigo: "Op", nombre: "Optimizador", color: "#1e3a8a", bg: "#93c5fd", border: "#60a5fa" },
  { codigo: "Pa", nombre: "Partido", color: "#881337", bg: "#fecdd3", border: "#fda4af" },
  { codigo: "PAL", nombre: "Partido Local", color: "#881337", bg: "#fecdd3", border: "#fda4af" },
  { codigo: "PAV", nombre: "Partido Visitante", color: "#881337", bg: "#fecdd3", border: "#fda4af" },
  { codigo: "PL", nombre: "Partido Local", color: "#881337", bg: "#fecdd3", border: "#fda4af" },
  { codigo: "PV", nombre: "Partido Visitante", color: "#881337", bg: "#fecdd3", border: "#fda4af" },
  { codigo: "Vi", nombre: "Viaje", color: "#ffffff", bg: "#475569", border: "#334155" },
  { codigo: "VD", nombre: "Video", color: "#713f12", bg: "#fef08a", border: "#fde047" },
  { codigo: "Red", nombre: "Readaptación", color: "#713f12", bg: "#fef9c3", border: "#fef08a" },
  { codigo: "Ot", nombre: "Otros", color: "#1e293b", bg: "#e2e8f0", border: "#cbd5e1" },
  { codigo: "Va", nombre: "Valoraciones", color: "#7c2d12", bg: "#ffedd5", border: "#fed7aa" },
  { codigo: "Cop", nombre: "Coadyuvante Opcional", color: "#ffffff", bg: "#d97706", border: "#b45309" },
  { codigo: "Oop", nombre: "Optimizador Opcional", color: "#ffffff", bg: "#1e40af", border: "#1e3a8a" },
  { codigo: "PaAm", nombre: "Partido Amistoso", color: "#881337", bg: "#ffe4e6", border: "#fca5a5" },
];

const FILTER_CATEGORIES = [
  { id: "entrenamiento", label: "Entrenamientos Campo", icon: "⚽" },
  { id: "gimnasio", label: "Gimnasio / Fuerza", icon: "🏋️" },
  { id: "partido", label: "Partidos Oficiales", icon: "🏆" },
  { id: "charla", label: "Charla / Vídeo", icon: "📹" },
  { id: "readaptacion", label: "Readaptación", icon: "🏥" },
  { id: "viaje", label: "Viaje / Desplazamiento", icon: "🚌" },
];

// 6 TIPOS DE COMENTARIOS EXACTOS DE PLANIFICACIÓN
const TIPOS_COMENTARIOS_PLANIF = [
  { id: "FIS", label: "FIS · Fisioterapia", color: "#dc2626", bg: "#fef2f2" },
  { id: "CON", label: "CON · Condicional", color: "#d97706", bg: "#fffbeb" },
  { id: "TEC", label: "TEC · Técnico", color: "#2563eb", bg: "#eff6ff" },
  { id: "PSI", label: "PSI · Psicológico", color: "#7c3aed", bg: "#f5f3ff" },
  { id: "WEL", label: "WEL · Wellness", color: "#059669", bg: "#ecfdf5" },
  { id: "OTR", label: "OTR · Otros", color: "#475569", bg: "#f8fafc" },
];

const TIPOS_FALLBACK: Record<string, { label: string; bg: string; border: string; color: string; icon: string }> = {
  entrenamiento: { label: "Entrenamiento Campo", bg: "#e0f2fe", border: "#0284c7", color: "#0369a1", icon: "⚽" },
  gimnasio: { label: "Fuerza / Gimnasio", bg: "#ffedd5", border: "#f97316", color: "#c2410c", icon: "🏋️" },
  partido: { label: "Partido Oficial", bg: "#fef2f2", border: "#ef4444", color: "#b91c1c", icon: "🏆" },
  charla: { label: "Charla / Vídeo", bg: "#f3e8ff", border: "#a855f7", color: "#7e22ce", icon: "📹" },
  readaptacion: { label: "Readaptación", bg: "#ccfbf1", border: "#14b8a6", color: "#0f766e", icon: "🏥" },
  viaje: { label: "Viaje / Desplazamiento", bg: "#fef9c3", border: "#eab308", color: "#a16207", icon: "🚌" },
  otro: { label: "Otro Evento", bg: "#f1f5f9", border: "#64748b", color: "#334155", icon: "📌" },
};

function simplifyPosicion(pos?: string): string {
  if (!pos) return "";
  let clean = pos.trim();

  if (/central/i.test(clean)) return "Central";
  if (/extremo/i.test(clean)) return "Extremo";
  if (/lateral/i.test(clean)) return "Lateral";
  if (/interior/i.test(clean)) return "Interior";
  if (/pivote|medio|centrocampista/i.test(clean)) return "Centrocampista";
  if (/delantero|ariete/i.test(clean)) return "Delantero";
  if (/portero|guardameta/i.test(clean)) return "Portero";

  clean = clean
    .replace(/derech[oa]s?/gi, "")
    .replace(/izquierd[oa]s?/gi, "")
    .replace(/\b[DI]\b/gi, "")
    .trim();

  return clean || pos;
}

function getTipoIcon(codigo: string): string {
  const c = (codigo || "").trim().toUpperCase();
  if (["PA", "PAL", "PAV", "PL", "PV", "PAAM", "PARTIDO"].includes(c)) return "🏆";
  if (["GIM", "GIMNASIO", "FUERZA", "FUE"].includes(c)) return "🏋️";
  if (["CO", "CO1", "CO2", "OP", "ENTRENAMIENTO"].includes(c)) return "⚽";
  if (["VD", "VID", "CHARLA", "VIDEO"].includes(c)) return "📹";
  if (["RED", "REA", "READAPTACION", "FISIO"].includes(c)) return "🏥";
  if (["VI", "VIA", "VIAJE"].includes(c)) return "🚌";
  return "📌";
}

function getTipoCategoria(codigo: string): string {
  if (!codigo) return "otro";
  const c = codigo.trim().toUpperCase();
  if (["PA", "PAL", "PAV", "PL", "PV", "PAAM", "PARTIDO"].includes(c)) return "partido";
  if (["GIM", "GIMNASIO", "FUERZA", "FUE"].includes(c)) return "gimnasio";
  if (["CO", "CO1", "CO2", "OP", "ENTRENAMIENTO"].includes(c)) return "entrenamiento";
  if (["VD", "VID", "CHARLA", "VIDEO"].includes(c)) return "charla";
  if (["RED", "REA", "READAPTACION", "FISIO"].includes(c)) return "readaptacion";
  if (["VI", "VIA", "VIAJE"].includes(c)) return "viaje";
  return "entrenamiento";
}

function getNombreCompletoEvento(code: string, tiposConfigList: TipoEventoConfig[] = []): string {
  if (!code) return "Evento";
  const cleanCode = code.trim().toLowerCase();

  const matched = tiposConfigList.find((t) => t.codigo.toLowerCase() === cleanCode || cleanCode.startsWith(t.codigo.toLowerCase()));
  if (matched && matched.nombre) {
    return matched.nombre.replace(/\s*\([^)]*\)/g, "").trim();
  }

  if (cleanCode.startsWith("co")) return "Coadyuvante";
  if (cleanCode.startsWith("op")) return "Optimizador";
  if (cleanCode.startsWith("pa") || cleanCode === "pl" || cleanCode === "pv") return "Partido";
  if (cleanCode.startsWith("gim")) return "Fuerza / Gimnasio";
  if (cleanCode.startsWith("vd") || cleanCode.startsWith("vid")) return "Video";
  if (cleanCode.startsWith("red") || cleanCode.startsWith("rea")) return "Readaptación";
  if (cleanCode.startsWith("vi")) return "Viaje";
  if (cleanCode.startsWith("va")) return "Valoraciones";
  return code;
}

function timeToMinutesFromStart(horaStr: string): number {
  if (!horaStr || !horaStr.includes(":")) return 120;
  const [h, m] = horaStr.split(":").map(Number);
  const totalMins = h * 60 + (m || 0);
  const startMins = 8 * 60;
  return Math.max(0, totalMins - startMins);
}

function getHoraFinStr(horaInicioStr: string, duracionMin: number): string {
  if (!horaInicioStr || !horaInicioStr.includes(":")) return "";
  const [h, m] = horaInicioStr.split(":").map(Number);
  const endTotalMins = h * 60 + (m || 0) + (duracionMin || 60);
  const endH = Math.floor(endTotalMins / 60) % 24;
  const endM = endTotalMins % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

const DEFAULT_INITIAL_MAP: Record<string, EventoBloque> = {};

const HOUR_SLOTS = [
  "08:00", "09:00", "10:00", "11:00", "12:00", "13:00",
  "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"
];
const HOUR_HEIGHT = 60;

export default function EventosCalendarPage() {
  const clubConfig = useClubConfig();
  const [viewMode, setViewMode] = useState<"dia" | "microciclo" | "mesociclo" | "cronograma">("microciclo");
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  
  // FILTRO MULTISELECCIÓN DE TIPOS DE EVENTOS
  const [selectedFilterTipos, setSelectedFilterTipos] = useState<string[]>([]);
  const [showFilterDropdown, setShowFilterDropdown] = useState<boolean>(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // FILTRO INDIVIDUAL DE JUGADOR
  const [selectedJugadorId, setSelectedJugadorId] = useState<string>("");
  const [showPlayerDropdown, setShowPlayerDropdown] = useState<boolean>(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState<string>("");
  const playerDropdownRef = useRef<HTMLDivElement>(null);

  // ESTADO EXPORTACIÓN PDF
  const [showPdfModal, setShowPdfModal] = useState<boolean>(false);
  const [pdfComment, setPdfComment] = useState<string>("");
  
  const [activeTeam, setActiveTeam] = useState<string>("CE Europa");

  useEffect(() => {
    try {
      const savedTeam = localStorage.getItem("active_team");
      if (savedTeam) {
        setActiveTeam(savedTeam);
      } else {
        const seasonsRaw = localStorage.getItem("active_seasons");
        if (seasonsRaw) {
          const s = JSON.parse(seasonsRaw);
          if (s.includes("2025/26")) setActiveTeam("AE Prat");
          if (s.includes("2026/27")) setActiveTeam("CE Europa");
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    const handleSync = () => {
      const savedTeam = localStorage.getItem("active_team");
      if (savedTeam && savedTeam !== activeTeam) {
        setActiveTeam(savedTeam);
      }
    };
    window.addEventListener("storage", handleSync);
    window.addEventListener("focus", handleSync);
    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("focus", handleSync);
    };
  }, [activeTeam]);

  const isPlayerOfTeam = (j: any, teamName: string) => {
    if (!j) return false;
    const eq = (j.equipo || "").trim().toLowerCase();
    const temp = (j.temporada || "").trim().toLowerCase();
    if (teamName === "AE Prat" || teamName === "2025/26") {
      return eq.includes("prat") || temp.includes("25/26") || temp.includes("2025/26");
    }
    if (teamName === "CE Europa" || teamName === "2026/27") {
      return eq.includes("europa") || temp.includes("26/27") || temp.includes("2026/27");
    }
    if (teamName === "CE Manresa") {
      return eq.includes("manresa") || temp.includes("26/27") || temp.includes("2026/27");
    }
    return eq === teamName.trim().toLowerCase();
  };

  const [allPlayersDB, setAllPlayersDB] = useState<any[]>([]);

  const jugadoresList = useMemo(() => {
    if (!allPlayersDB || allPlayersDB.length === 0) return [];
    const filtered = allPlayersDB.filter((j) => isPlayerOfTeam(j, activeTeam));
    return filtered.map((j: any) => ({
      id: String(j.id),
      nombre: j.nombre || j.apodo || "Jugador",
      apodo: j.apodo,
      dorsal: j.dorsal !== undefined && j.dorsal !== null ? j.dorsal : j.cor_id,
      posicion: simplifyPosicion(j.posicion),
      foto_url: j.foto_url || j.foto || "",
    }));
  }, [allPlayersDB, activeTeam]);
  const [playerEventsMap, setPlayerEventsMap] = useState<Record<string, string>>({});
  const [eventosMap, setEventosMap] = useState<Record<string, EventoBloque>>({});
  const [dayIdToFecha, setDayIdToFecha] = useState<Record<string, string>>({});
  const [tiposConfigList, setTiposConfigList] = useState<TipoEventoConfig[]>(DEFAULT_TIPOS_EVENTO_CONFIG);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  
  // ESTADO PARA EDICIÓN DE EVENTO, CONVOCATORIA Y MINUTOS/OBSERVACIONES INDIVIDUALES
  const [selectedEventDetail, setSelectedEventDetail] = useState<EventoItem | null>(null);
  const [modalActiveTab, setModalActiveTab] = useState<"general" | "jugadores" | "minutos">("general");
  
  // Campos del formulario de edición en el modal
  const [editTipoCat, setEditTipoCat] = useState("entrenamiento");
  const [editCodigo, setEditCodigo] = useState("Co");
  const [editFecha, setEditFecha] = useState("2026-08-12");
  const [editHora, setEditHora] = useState("10:00");
  const [editDuracion, setEditDuracion] = useState(90);
  const [editLugar, setEditLugar] = useState("Pabellón Principal");
  const [editOrientacion, setEditOrientacion] = useState("");
  const [editCarga, setEditCarga] = useState("");
  const [editComentario, setEditComentario] = useState("");
  const [assignedPlayerIds, setAssignedPlayerIds] = useState<string[]>([]);

  // Pestaña 3: Minutos y Comentarios por deportista
  const [playerMinutesMap, setPlayerMinutesMap] = useState<Record<string, number>>({});
  const [playerCommentsMap, setPlayerCommentsMap] = useState<Record<string, string>>({});
  const [playerCommentTypesMap, setPlayerCommentTypesMap] = useState<Record<string, string>>({});
  const [playerTitularidadMap, setPlayerTitularidadMap] = useState<Record<string, "T" | "S">>({});

  // Form State para Nuevo Evento
  const [formTipoCat, setFormTipoCat] = useState("entrenamiento");
  const [formCodigo, setFormCodigo] = useState("Co");
  const [formFecha, setFormFecha] = useState("2026-08-12");
  const [formHora, setFormHora] = useState("10:00");
  const [formDuracion, setFormDuracion] = useState(90);
  const [formLugar, setFormLugar] = useState("Pabellón Principal");
  const [formOrientacion, setFormOrientacion] = useState("");
  const [formCarga, setFormCarga] = useState("");
  const [formComentario, setFormComentario] = useState("");

  // Estado para los minutos de BBDD (fuente de verdad)
  const [bbddMinutesMap, setBbddMinutesMap] = useState<Record<string, any>>({});

  // Cargar minutos de BBDD al inicio
  useEffect(() => {
    async function loadBbddMinutes() {
      try {
        const rows = await getMinutosJugadorEventoAll();
        const map: Record<string, any> = {};
        for (const row of rows) {
          if (!row.jugador_id || !row.fecha) continue;
          const dur = Number(row.minutos ?? row.duracion ?? 0);
          const key = `${row.jugador_id}_${row.fecha}_${row.evento_id}`;
          const keyShort = `${row.jugador_id}_${row.fecha}`;
          map[key] = { minutos: dur, duracion: dur, realiza: row.realiza !== undefined ? Boolean(row.realiza) : dur > 0 };
          map[keyShort] = { minutos: dur, duracion: dur, realiza: row.realiza !== undefined ? Boolean(row.realiza) : dur > 0 };
        }
        setBbddMinutesMap(map);
        
        // También sincronizar con localStorage para que el informe los tenga
        if (typeof window !== "undefined") {
          try {
            const existing = JSON.parse(localStorage.getItem("player_event_minutes_map_v1") || "{}");
            const merged = { ...existing, ...map };
            localStorage.setItem("player_event_minutes_map_v1", JSON.stringify(merged));
          } catch(e) {}
        }
      } catch (e) {
        console.warn("Error cargando minutos BBDD:", e);
      }
    }
    loadBbddMinutes();
  }, []);

  // Cargar Jugadores Reales del Equipo desde Supabase o localStorage
  useEffect(() => {
    async function loadRealTeamPlayers() {
      try {
        const realPlayers = await getActiveJugadores();
        if (realPlayers && realPlayers.length > 0) {
          setAllPlayersDB(realPlayers);
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("jugadores_db_full_v1", JSON.stringify(realPlayers));
            } catch (e) {}
          }
          return;
        }
      } catch (err) {
        console.warn("No se pudieron cargar jugadores desde Supabase:", err);
      }

      if (typeof window !== "undefined") {
        try {
          const localJugadores = localStorage.getItem("jugadores_db_full_v1");
          if (localJugadores) {
            setAllPlayersDB(JSON.parse(localJugadores));
          }
        } catch (e) {}
      }
    }

    loadRealTeamPlayers();
  }, []);

  const loadDataFromStorage = useCallback(() => {
    if (typeof window !== "undefined") {
      pruneStaleFutureLocalStorage();
      try {
        const savedTipos = localStorage.getItem("tipos_evento_config_v1");
        if (savedTipos) {
          setTiposConfigList(JSON.parse(savedTipos));
        } else {
          setTiposConfigList(DEFAULT_TIPOS_EVENTO_CONFIG);
        }

        const savedPlayerEvents = localStorage.getItem("player_events_map_v1");
        if (savedPlayerEvents) {
          setPlayerEventsMap(JSON.parse(savedPlayerEvents));
        }

        // 1. Mapeo day_id -> fecha desde planificacion_days
        const savedDays = localStorage.getItem("planificacion_days_v5") || localStorage.getItem("planificacion_days_v1");
        if (savedDays) {
          try {
            const parsedDays = JSON.parse(savedDays);
            if (Array.isArray(parsedDays)) {
              const mapping: Record<string, string> = {};
              parsedDays.forEach((d: any) => {
                if (d?.id && d?.fecha) mapping[d.id] = d.fecha;
              });
              setDayIdToFecha(mapping);
            }
          } catch (e) {}
        }

        // 2. Cargar inmediatamente de localStorage para evitar parpadeos
        const localSavedBlocks = localStorage.getItem("eventos_bloques_map_v5") || localStorage.getItem("eventos_bloques_map_v1");
        if (localSavedBlocks) {
          try {
            const parsedBlocks = JSON.parse(localSavedBlocks);
            if (parsedBlocks && Object.keys(parsedBlocks).length > 0) {
              setEventosMap(parsedBlocks);
            }
          } catch (e) {}
        }
        
        // 3. Cargar datos autoritativos actualizados de la BBDD Supabase
        getEventosBloquesBBDD().then((dbData) => {
          if (dbData && Object.keys(dbData).length > 0) {
            setEventosMap(dbData);
            try {
              localStorage.setItem("eventos_bloques_map_v5", JSON.stringify(dbData));
              localStorage.setItem("eventos_bloques_map_v1", JSON.stringify(dbData));
            } catch (e) {}
          }
        }).catch((err) => {
          console.error("Error cargando eventos bloques BBDD:", err);
        });

        // 4. Cargar asignaciones autoritativas de jugadores desde la BBDD Supabase
        getPlayerEventsBBDD().then((dbPlayerEvents) => {
          if (dbPlayerEvents && Object.keys(dbPlayerEvents).length > 0) {
            setPlayerEventsMap((prev) => {
              const next = { ...prev, ...dbPlayerEvents };
              try {
                localStorage.setItem("player_events_map_v1", JSON.stringify(next));
              } catch (e) {}
              return next;
            });
          }
        }).catch((err) => {
          console.error("Error cargando playerEvents BBDD:", err);
        });

        // 5. Cargar comentarios autoritativos desde la BBDD Supabase y sincronizar con localStorage
        getPlayerCommentsBBDD().then((dbComments) => {
          if (dbComments && dbComments.length > 0) {
            try {
              const rawLocal = localStorage.getItem("comentarios_jugadores_v2");
              const localList: any[] = rawLocal ? JSON.parse(rawLocal) : [];
              const map = new Map<string, any>();
              localList.forEach((c) => map.set(c.id || `${c.jugador_id}_${c.fecha}_${c.tipo}_${c.texto}`, c));
              dbComments.forEach((c) => map.set(c.id || `${c.jugador_id}_${c.fecha}_${c.tipo}_${c.texto}`, c));
              const merged = Array.from(map.values());
              localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(merged));
              localStorage.setItem("planificacion_comentarios_v1", JSON.stringify(merged));
              window.dispatchEvent(new Event("comentarios_updated"));
            } catch (e) {}
          }
        }).catch((err) => {
          console.error("Error cargando comentarios BBDD:", err);
        });

      } catch (e) {
        setTiposConfigList(DEFAULT_TIPOS_EVENTO_CONFIG);
      }
    }
  }, []);

  useEffect(() => {
    loadDataFromStorage();

    const handleStorageEvent = () => {
      loadDataFromStorage();
    };

    window.addEventListener("storage", handleStorageEvent);
    window.addEventListener("eventos_bloques_updated", handleStorageEvent);
    window.addEventListener("player_events_updated", handleStorageEvent);
    window.addEventListener("planificacion_updated", handleStorageEvent);
    return () => {
      window.removeEventListener("storage", handleStorageEvent);
      window.removeEventListener("eventos_bloques_updated", handleStorageEvent);
      window.removeEventListener("player_events_updated", handleStorageEvent);
      window.removeEventListener("planificacion_updated", handleStorageEvent);
    };
  }, [loadDataFromStorage]);

  // Clic fuera de los desplegables para cerrarlos
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
      if (playerDropdownRef.current && !playerDropdownRef.current.contains(e.target as Node)) {
        setShowPlayerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getEventStyle = useCallback(
    (code: string, tipoCat: string) => {
      if (!code) return TIPOS_FALLBACK[tipoCat] || TIPOS_FALLBACK.otro;
      const cleanCode = code.trim().toLowerCase();

      const exact = tiposConfigList.find((t) => t.codigo.toLowerCase() === cleanCode);
      if (exact) {
        return {
          label: exact.nombre.replace(/\s*\([^)]*\)/g, "").trim(),
          bg: exact.bg,
          border: exact.border,
          color: exact.color,
          icon: getTipoIcon(cleanCode),
        };
      }

      const prefixMatch = tiposConfigList.find((t) => cleanCode.startsWith(t.codigo.toLowerCase()));
      if (prefixMatch) {
        return {
          label: prefixMatch.nombre.replace(/\s*\([^)]*\)/g, "").trim(),
          bg: prefixMatch.bg,
          border: prefixMatch.border,
          color: prefixMatch.color,
          icon: getTipoIcon(cleanCode),
        };
      }

      const fallback = TIPOS_FALLBACK[tipoCat] || TIPOS_FALLBACK.otro;
      return {
        ...fallback,
        label: getNombreCompletoEvento(code, tiposConfigList),
        icon: getTipoIcon(cleanCode),
      };
    },
    [tiposConfigList]
  );

  const saveMapToStorage = (newMap: Record<string, EventoBloque>) => {
    setEventosMap(newMap);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("eventos_bloques_map_v5", JSON.stringify(newMap));
        localStorage.setItem("eventos_bloques_map_v1", JSON.stringify(newMap));
        window.dispatchEvent(new Event("eventos_bloques_updated"));
        window.dispatchEvent(new Event("storage"));
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Convertir el Mapa de Planificación en lista de eventos
  const eventosList = useMemo(() => {
    const list: EventoItem[] = [];
    const seenIds = new Set<string>();
    
    Object.entries(eventosMap).forEach(([key, ev]) => {
      if (!ev || !ev.tipo || !ev.tipo.trim()) return;

      const idToUse = ev.id || key;
      if (seenIds.has(idToUse)) return;
      seenIds.add(idToUse);

      let dateStr = "";
      if (ev.fecha && /^\d{4}-\d{2}-\d{2}$/.test(ev.fecha)) {
        dateStr = ev.fecha;
      } else if (ev.day_id && dayIdToFecha[ev.day_id]) {
        dateStr = dayIdToFecha[ev.day_id];
      } else {
        const parts = key.split("_slot_");
        if (parts[0] && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
          dateStr = parts[0];
        } else if (parts[0] && dayIdToFecha[parts[0]]) {
          dateStr = dayIdToFecha[parts[0]];
        }
      }
      if (!dateStr) return;
      if (dateStr < "2026-10-01") return; // nunca mostrar eventos anteriores al 01/10

      const tipoCat = getTipoCategoria(ev.tipo);
      const codigo = ev.tipo.trim();
      const nombreCompleto = getNombreCompletoEvento(codigo, tiposConfigList);
      
      const titulo = ev.orientacion
        ? `${nombreCompleto} · ${ev.orientacion}`
        : ev.comentario
        ? `${nombreCompleto} · ${ev.comentario}`
        : nombreCompleto;

      list.push({
        id: idToUse,
        titulo,
        nombreCompleto,
        tipoCat,
        codigo,
        fecha: dateStr,
        horaInicio: ev.hora ? ev.hora.trim() : "",
        duracionMin: Number(ev.duracion) || 60,
        lugar: ev.lugar ? ev.lugar.trim() : "",
        orientacion: ev.orientacion ? ev.orientacion.trim() : "",
        carga: ev.carga ? ev.carga.trim() : "",
        comentario: ev.comentario ? ev.comentario.trim() : "",
        slotIdx: ev.slot !== undefined && ev.slot !== null ? Number(ev.slot) : 0,
        dayId: ev.day_id || dateStr,
      });
    });
    return list;
  }, [eventosMap, tiposConfigList, dayIdToFecha]);

  // Función ordenadora: prioriza horaInicio cronológica; si no hay hora o es idéntica, ordena por slotIdx (#1, #2, #3...)
  const sortDayEvents = useCallback((a: EventoItem, b: EventoItem) => {
    const timeA = a.horaInicio?.trim() || "";
    const timeB = b.horaInicio?.trim() || "";
    if (timeA && timeB && timeA !== timeB) {
      return timeA.localeCompare(timeB);
    }
    return (a.slotIdx ?? 0) - (b.slotIdx ?? 0);
  }, []);

  const microcicloDays = useMemo(() => {
    const curr = new Date(selectedDateStr + "T12:00:00");
    const dayOfWeek = curr.getDay();
    const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(curr);
    monday.setDate(curr.getDate() + distanceToMonday);

    const days = [];
    const dayNames = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "DOMINGO"];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const isoStr = d.toISOString().split("T")[0];
      const dayNum = d.getDate();
      const monthShort = d.toLocaleString("es-ES", { month: "short" }).toUpperCase();

      const todayISO = new Date().toISOString().split("T")[0];
      days.push({
        dateStr: isoStr,
        dayName: dayNames[i],
        dayNum,
        monthShort,
        isToday: isoStr === todayISO,
        isSelected: isoStr === selectedDateStr,
      });
    }
    return days;
  }, [selectedDateStr]);

  const mesocicloWeeks = useMemo(() => {
    const mondayFirst = new Date(microcicloDays[0].dateStr + "T12:00:00");
    const weeks = [];
    const todayISO = new Date().toISOString().split("T")[0];

    for (let w = 0; w < 4; w++) {
      const weekDays = [];
      for (let d = 0; d < 7; d++) {
        const dateObj = new Date(mondayFirst);
        dateObj.setDate(mondayFirst.getDate() + w * 7 + d);
        const isoStr = dateObj.toISOString().split("T")[0];
        weekDays.push({
          dateStr: isoStr,
          dayNum: dateObj.getDate(),
          monthShort: dateObj.toLocaleString("es-ES", { month: "short" }),
          isToday: isoStr === todayISO,
        });
      }
      weeks.push({ weekNum: w + 1, days: weekDays });
    }
    return weeks;
  }, [microcicloDays]);

  const handlePrevPeriod = () => {
    const d = new Date(selectedDateStr + "T12:00:00");
    if (viewMode === "dia") d.setDate(d.getDate() - 1);
    else if (viewMode === "microciclo" || viewMode === "cronograma") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 28);
    setSelectedDateStr(d.toISOString().split("T")[0]);
  };

  const handleNextPeriod = () => {
    const d = new Date(selectedDateStr + "T12:00:00");
    if (viewMode === "dia") d.setDate(d.getDate() + 1);
    else if (viewMode === "microciclo" || viewMode === "cronograma") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 28);
    setSelectedDateStr(d.toISOString().split("T")[0]);
  };

  const handleGoToday = () => {
    setSelectedDateStr(new Date().toISOString().split("T")[0]);
  };

  // FILTRADO COMBINADO DE EVENTOS: POR TIPO DE EVENTO + POR CALENDARIO INDIVIDUAL DEL JUGADOR
  const filteredEventos = useMemo(() => {
    let list = eventosList;

    // 1. Filtrado por tipo de evento (multiselección)
    if (selectedFilterTipos.length > 0 && selectedFilterTipos.length < FILTER_CATEGORIES.length) {
      list = list.filter((ev) => selectedFilterTipos.includes(ev.tipoCat.toLowerCase()));
    }

    // 2. Filtrado por Calendario Individual de Jugador (según player_events_map_v1 asignaciones)
    if (selectedJugadorId) {
      list = list.filter((ev) => {
        const keysToTry = [
          `${selectedJugadorId}_${ev.fecha}`,
          `${selectedJugadorId}_${ev.dayId}`,
        ];

        let assignedStr = "";
        for (const k of keysToTry) {
          if (playerEventsMap[k] !== undefined) {
            assignedStr = playerEventsMap[k];
            break;
          }
        }

        if (assignedStr !== undefined && assignedStr.trim() !== "") {
          const assignedCodes = assignedStr.split(",").map((c) => c.trim().toLowerCase());
          return assignedCodes.some((ac) => ev.codigo.toLowerCase().startsWith(ac) || ac.startsWith(ev.codigo.toLowerCase()));
        }

        const isPartido = ["pa", "pal", "pav", "pl", "pv"].includes(ev.codigo.toLowerCase());
        return isPartido || true;
      });
    }

    return list;
  }, [eventosList, selectedFilterTipos, selectedJugadorId, playerEventsMap]);

  const handleToggleFilterTipo = (catId: string) => {
    setSelectedFilterTipos((prev) => {
      if (prev.includes(catId)) {
        return prev.filter((id) => id !== catId);
      } else {
        return [...prev, catId];
      }
    });
  };

  const handleSelectAllFilters = () => {
    setSelectedFilterTipos(FILTER_CATEGORIES.map((c) => c.id));
  };

  const handleClearFilters = () => {
    setSelectedFilterTipos([]);
  };

  // ABRIR MODAL DE DETALLE, EDICIÓN, CONVOCATORIA Y MINUTO/OBSERVACIONES DE EVENTO
  const handleOpenEditModal = (ev: EventoItem) => {
    setSelectedEventDetail(ev);
    setModalActiveTab("general");

    setEditTipoCat(ev.tipoCat);
    setEditCodigo(ev.codigo);
    setEditFecha(ev.fecha);
    setEditHora(ev.horaInicio);
    setEditDuracion(ev.duracionMin);
    setEditLugar(ev.lugar);
    setEditOrientacion(ev.orientacion || "");
    setEditCarga(ev.carga || "");
    let teamCommTxt = ev.comentario || "";
    if (!teamCommTxt && typeof window !== "undefined") {
      try {
        const rawComms = localStorage.getItem("comentarios_jugadores_v2");
        if (rawComms) {
          const commList = JSON.parse(rawComms);
          const matchTeam = commList.find((c: any) => (c.jugador_id === "TEAM" || c.jugador_id === "team" || c.jugador_id === "EQUIPO") && (c.fecha === ev.fecha || c.day_id === ev.dayId || c.day_id === `d_${ev.fecha}`));
          if (matchTeam && matchTeam.texto) {
            teamCommTxt = matchTeam.texto;
          }
        }
      } catch (e) {}
    }
    setEditComentario(teamCommTxt);

    // Inicializar asignaciones de jugadores para este evento (vacío por defecto)
    const initialAssigned: string[] = [];
    const minutesObj: Record<string, number> = {};
    const commentsObj: Record<string, string> = {};
    const typesObj: Record<string, string> = {};
    const titularidadObj: Record<string, "T" | "S"> = {};

    let savedMinutesMap: Record<string, PlayerEventMinuteData> = {};
    if (typeof window !== "undefined") {
      try {
        const rawMinutes = localStorage.getItem("player_event_minutes_map_v1");
        if (rawMinutes) savedMinutesMap = JSON.parse(rawMinutes);
      } catch (e) {}
    }

    jugadoresList.forEach((j) => {
      const k1 = `${j.id}_${ev.fecha}`;
      const k2 = `${j.id}_${ev.dayId}`;
      const assignedStr = (playerEventsMap[k1] || playerEventsMap[k2] || "").trim();

      if (assignedStr) {
        const codes = assignedStr.split(",").map((c) => c.trim().toLowerCase());
        if (codes.some((c) => c === ev.codigo.toLowerCase() || ev.codigo.toLowerCase().startsWith(c) || c.startsWith(ev.codigo.toLowerCase()))) {
          initialAssigned.push(j.id);
        }
      }

      // Cargar minutaje guardado o valor por defecto
      const minuteKey = `${j.id}_${ev.fecha}_${ev.id}`;
      const minuteKeyShort = `${j.id}_${ev.fecha}_${ev.codigo}`;
      
      // Prioridad: 1) BBDD, 2) localStorage
      let savedData = bbddMinutesMap[minuteKey] || bbddMinutesMap[minuteKeyShort] || savedMinutesMap[minuteKey] || savedMinutesMap[minuteKeyShort];
      
      // Búsqueda agresiva (como el informe) para rescatar claves antiguas
      if (!savedData && savedMinutesMap && typeof savedMinutesMap === "object") {
        for (const [k, val] of Object.entries(savedMinutesMap)) {
          if (!val) continue;
          if (k.includes(ev.fecha)) {
             let prefix = k.split(ev.fecha)[0].replace(/_$/, "");
             if (prefix === j.id || (prefix.toLowerCase().includes(j.nombre.split(" ")[0].toLowerCase()))) {
                const isPaKey = k.endsWith("_Pa") || k.endsWith("_PaAm") || k.includes("_Pa_") || k.toLowerCase().includes("partido");
                if (isPaKey) {
                   savedData = val;
                   break;
                }
             }
          }
        }
      }

      // Buscar si hay comentario en comentarios_jugadores_v2 o planificacion_comentarios_v1
      let foundExternalComment = "";
      let foundExternalType = "OTR";
      if (typeof window !== "undefined") {
        try {
          const rawComms = localStorage.getItem("comentarios_jugadores_v2") || localStorage.getItem("planificacion_comentarios_v1");
          if (rawComms) {
            const commList = JSON.parse(rawComms);
            const matchComm = commList.find((c: any) => c.jugador_id === j.id && (c.fecha === ev.fecha || c.day_id === ev.dayId || c.day_id === `d_${ev.fecha}`));
            if (matchComm && matchComm.texto) {
              foundExternalComment = matchComm.texto;
              foundExternalType = matchComm.tipo || "OTR";
            }
          }
        } catch (e) {}
      }

      if (savedData !== undefined && savedData !== null) {
        const m = typeof savedData === "number" ? savedData : (savedData.minutos ?? savedData.duracion ?? ev.duracionMin);
        minutesObj[j.id] = m;
        commentsObj[j.id] = savedData.comentario || foundExternalComment || "";
        typesObj[j.id] = savedData.tipo || foundExternalType || "OTR";
        titularidadObj[j.id] = savedData.titularidad || (m > 45 ? "T" : "S");
      } else {
        const m = ev.duracionMin;
        minutesObj[j.id] = m;
        commentsObj[j.id] = foundExternalComment || "";
        typesObj[j.id] = foundExternalType || "OTR";
        titularidadObj[j.id] = m > 45 ? "T" : "S";
      }
    });

    setAssignedPlayerIds(initialAssigned);
    setPlayerMinutesMap(minutesObj);
    setPlayerCommentsMap(commentsObj);
    setPlayerCommentTypesMap(typesObj);
    setPlayerTitularidadMap(titularidadObj);
  };

  // GUARDAR EDICIÓN DE EVENTO, CONVOCATORIA, MINUTAJE Y COMENTARIOS
  const handleSaveEventEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventDetail) return;

    // 1. Actualizar Bloque de Evento en `eventos_bloques_map_v1` y `v5`
    const newEventsMap = { ...eventosMap };
    
    let targetKey = "";
    Object.entries(newEventsMap).forEach(([k, v]) => {
      if (v.id === selectedEventDetail.id || k === `${selectedEventDetail.fecha}_slot_${selectedEventDetail.slotIdx}`) {
        targetKey = k;
      }
    });

    if (!targetKey) {
      targetKey = `${editFecha}_slot_${selectedEventDetail.slotIdx}`;
    }

    const updatedBlock: EventoBloque = {
      id: selectedEventDetail.id,
      day_id: editFecha,
      fecha: editFecha,
      slot: selectedEventDetail.slotIdx,
      tipo: editCodigo.trim() || "Co",
      hora: editHora,
      lugar: editLugar,
      duracion: String(editDuracion),
      orientacion: editOrientacion,
      carga: editCarga,
      comentario: editComentario,
    };

    newEventsMap[targetKey] = updatedBlock;
    saveMapToStorage(newEventsMap);

    // 2. Actualizar Asignaciones de Jugadores en `player_events_map_v1` (con fecha y con dayId)
    const newPlayerEventsMap = { ...playerEventsMap };

    jugadoresList.forEach((j) => {
      const keyFecha = `${j.id}_${editFecha}`;
      const keyId = selectedEventDetail.dayId ? `${j.id}_${selectedEventDetail.dayId}` : "";
      const existingStr = (newPlayerEventsMap[keyFecha] || (keyId ? newPlayerEventsMap[keyId] : "") || "").trim();
      let codesList = existingStr ? existingStr.split(",").map((c) => c.trim()).filter(Boolean) : [];

      const isAssigned = assignedPlayerIds.includes(j.id);

      if (isAssigned) {
        if (!codesList.some((c) => c.toLowerCase() === editCodigo.toLowerCase())) {
          codesList.push(editCodigo);
        }
      } else {
        codesList = codesList.filter((c) => c.toLowerCase() !== editCodigo.toLowerCase());
      }

      const assignedStr = codesList.join(", ");
      newPlayerEventsMap[keyFecha] = assignedStr;
      if (keyId) {
        newPlayerEventsMap[keyId] = assignedStr;
      }
    });

    setPlayerEventsMap(newPlayerEventsMap);

    // 3. Guardar Minutaje y Comentarios por Deportista en `player_event_minutes_map_v1`
    let savedMinutesMap: Record<string, PlayerEventMinuteData> = {};
    let rawSupabaseMinutesMap: Record<string, number> = {};
    let planifComentarios: any[] = [];

    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("player_event_minutes_map_v1");
        if (raw) savedMinutesMap = JSON.parse(raw);
      } catch (e) {}

      jugadoresList.forEach((j) => {
        if (assignedPlayerIds.includes(j.id)) {
          const m = playerMinutesMap[j.id] ?? editDuracion;
          const tit = playerTitularidadMap[j.id] || (m > 45 ? "T" : "S");
          const minuteKey = `${j.id}_${editFecha}_${selectedEventDetail.id}`;
          const minuteKeyShort = `${j.id}_${editFecha}_${selectedEventDetail.codigo}`;
          
          const dataPayload = {
            minutos: m,
            comentario: playerCommentsMap[j.id] || "",
            tipo: playerCommentTypesMap[j.id] || "OTR",
            titularidad: tit,
          };
          
          savedMinutesMap[minuteKey] = dataPayload;
          savedMinutesMap[minuteKeyShort] = dataPayload;
          
          rawSupabaseMinutesMap[minuteKey] = m;
          rawSupabaseMinutesMap[minuteKeyShort] = m;
        }
      });

      // 4. Sincronizar Comentarios con `comentarios_jugadores_v2` y `planificacion_comentarios_v1` para Planificación
      try {
        const rawCom = localStorage.getItem("comentarios_jugadores_v2") || localStorage.getItem("planificacion_comentarios_v1");
        if (rawCom) planifComentarios = JSON.parse(rawCom);
      } catch (e) {}

      // Comentarios de jugadores
      jugadoresList.forEach((j) => {
        const userComment = playerCommentsMap[j.id]?.trim();
        const userType = playerCommentTypesMap[j.id] || "OTR";

        if (userComment && assignedPlayerIds.includes(j.id)) {
          const commentId = `com_${j.id}_${editFecha}_${userType}`;
          const existingIdx = planifComentarios.findIndex((c) => c.id === commentId || (c.jugador_id === j.id && c.fecha === editFecha && c.tipo === userType));

          const newCommentObj = {
            id: commentId,
            jugador_id: j.id,
            day_id: `d_${editFecha}`,
            fecha: editFecha,
            tipo: userType,
            texto: userComment,
          };

          if (existingIdx >= 0) {
            planifComentarios[existingIdx] = newCommentObj;
          } else {
            planifComentarios.push(newCommentObj);
          }
        }
      });

      // Comentario de TEAM / Sesión
      if (editComentario && editComentario.trim()) {
        const teamCommentId = `team_${editFecha}_com`;
        const existingTeamIdx = planifComentarios.findIndex((c) => c.id === teamCommentId || ((c.jugador_id === "TEAM" || c.jugador_id === "team") && c.fecha === editFecha));
        const newTeamObj = {
          id: teamCommentId,
          jugador_id: "TEAM",
          day_id: `d_${editFecha}`,
          fecha: editFecha,
          tipo: "TEC",
          texto: editComentario.trim(),
        };
        if (existingTeamIdx >= 0) {
          planifComentarios[existingTeamIdx] = newTeamObj;
        } else {
          planifComentarios.push(newTeamObj);
        }
      }

      try {
        localStorage.setItem("player_events_map_v1", JSON.stringify(newPlayerEventsMap));
        localStorage.setItem("player_event_minutes_map_v1", JSON.stringify(savedMinutesMap));
        localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(planifComentarios));
        localStorage.setItem("planificacion_comentarios_v1", JSON.stringify(planifComentarios));
        
        window.dispatchEvent(new Event("player_events_updated"));
        window.dispatchEvent(new Event("eventos_bloques_updated"));
        window.dispatchEvent(new Event("comentarios_updated"));
        window.dispatchEvent(new Event("planificacion_updated"));
        window.dispatchEvent(new Event("storage"));
      } catch (err) {
        console.error("Error guardando datos localmente:", err);
      }
    }

    // 5. Guardar todo atómicamente en Supabase (sesiones_dia, sesiones_dia_bloques, estado_diario_jugador, minutos_jugador_evento)
    const assignmentRows = jugadoresList.map((j) => {
      const key = `${j.id}_${editFecha}`;
      const currentCodes = newPlayerEventsMap[key] || "";
      return {
        jugador_id: j.id,
        fecha: editFecha,
        evento_asignado: currentCodes || null,
      };
    });

    const minutoRows: Array<{ jugador_id: string; fecha: string; evento_id: string; duracion: number; titularidad?: string }> = [];
    jugadoresList.forEach((j) => {
      if (assignedPlayerIds.includes(j.id)) {
        const m = Number(playerMinutesMap[j.id] ?? editDuracion);
        const tit = playerTitularidadMap[j.id] || (m > 45 ? "T" : "S");
        const eventoId = selectedEventDetail!.codigo || editCodigo || "Pa";
        minutoRows.push({ jugador_id: j.id, fecha: editFecha, evento_id: eventoId, duracion: m, titularidad: tit });
      }
    });

    const commentsRows: Array<{ jugador_id: string; tipo: string; texto: string }> = [];
    jugadoresList.forEach((j) => {
      if (assignedPlayerIds.includes(j.id) && playerCommentsMap[j.id]?.trim()) {
        commentsRows.push({
          jugador_id: j.id,
          tipo: playerCommentTypesMap[j.id] || "OTR",
          texto: playerCommentsMap[j.id].trim(),
        });
      }
    });

    try {
      await saveEventDetailBBDD({
        fecha: editFecha,
        block: updatedBlock,
        assignments: assignmentRows,
        minutes: minutoRows,
        comments: commentsRows,
        teamComment: editComentario?.trim() || null,
      });

      setBbddMinutesMap((prev) => {
        const nextMap = { ...prev };
        minutoRows.forEach((r) => {
          const k1 = `${r.jugador_id}_${r.fecha}_${r.evento_id}`;
          const k2 = `${r.jugador_id}_${r.fecha}`;
          nextMap[k1] = { minutos: r.duracion, duracion: r.duracion, realiza: r.duracion > 0 };
          nextMap[k2] = { minutos: r.duracion, duracion: r.duracion, realiza: r.duracion > 0 };
        });
        return nextMap;
      });
    } catch (e) {
      console.error("Error guardando detalle del evento en BBDD:", e);
    }

    setSelectedEventDetail(null);
  };

  const handleTogglePlayerAssignment = (playerId: string) => {
    setAssignedPlayerIds((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      } else {
        return [...prev, playerId];
      }
    });
  };

  const handleSelectAllPlayers = () => {
    setAssignedPlayerIds(jugadoresList.map((j) => j.id));
  };

  const handleDeselectAllPlayers = () => {
    setAssignedPlayerIds([]);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let targetSlot = 0;
    for (let s = 0; s < 6; s++) {
      const key = `${formFecha}_slot_${s}`;
      if (!eventosMap[key] || !eventosMap[key].tipo || !eventosMap[key].tipo.trim()) {
        targetSlot = s;
        break;
      }
    }

    const slotKey = `${formFecha}_slot_${targetSlot}`;
    const newBlock: EventoBloque = {
      id: `ev_${formFecha}_${targetSlot}`,
      day_id: formFecha,
      fecha: formFecha,
      slot: targetSlot,
      tipo: formCodigo.trim() || (formTipoCat === "gimnasio" ? "Gim" : formTipoCat === "partido" ? "Pa" : "Co"),
      hora: formHora,
      lugar: formLugar,
      duracion: String(formDuracion),
      orientacion: formOrientacion,
      carga: formCarga,
      comentario: formComentario,
    };

    const newMap = { ...eventosMap, [slotKey]: newBlock };
    saveMapToStorage(newMap);
    
    saveSingleBloqueBBDD({
      dayId: formFecha,
      fecha: formFecha,
      slot: targetSlot,
      block: newBlock,
    }).then(() => {
      window.dispatchEvent(new Event("eventos_bloques_updated"));
      window.dispatchEvent(new Event("planificacion_updated"));
    }).catch(e => {
      console.error("Failed to save to BBDD", e);
    });
    
    setShowCreateModal(false);
    setFormOrientacion("");
  };

  const handleDeleteEvent = (id: string, slotIdx: number, dateStr: string) => {
    if (confirm("¿Seguro que deseas eliminar este evento del calendario y de la planificación?")) {
      const newMap = { ...eventosMap };
      const slotKey = `${dateStr}_slot_${slotIdx}`;
      
      newMap[slotKey] = {
        id: id,
        day_id: dateStr,
        fecha: dateStr,
        slot: slotIdx,
        tipo: "",
        hora: "",
        lugar: "",
        duracion: "",
        orientacion: "",
        carga: "",
        comentario: "",
        num_jugadores: "",
        // competicion: "",
      };

      saveMapToStorage(newMap);
      
      saveSingleBloqueBBDD({
        dayId: dateStr,
        fecha: dateStr,
        slot: slotIdx,
        block: { tipo: "" },
      }).then(() => {
        window.dispatchEvent(new Event("eventos_bloques_updated"));
        window.dispatchEvent(new Event("planificacion_updated"));
      }).catch(e => {
        console.error("Failed to delete in BBDD", e);
      });
      
      setSelectedEventDetail(null);
    }
  };

  // Texto de etiqueta del filtro de tipos
  const filterButtonLabel = useMemo(() => {
    if (selectedFilterTipos.length === 0 || selectedFilterTipos.length === FILTER_CATEGORIES.length) {
      return "🏷️ Todos los eventos";
    }
    if (selectedFilterTipos.length === 1) {
      const found = FILTER_CATEGORIES.find((c) => c.id === selectedFilterTipos[0]);
      return found ? `${found.icon} ${found.label}` : "1 seleccionado";
    }
    return `🏷️ ${selectedFilterTipos.length} tipos seleccionados`;
  }, [selectedFilterTipos]);

  // Jugador seleccionado actualmente
  const selectedJugador = useMemo(() => {
    return jugadoresList.find((j) => j.id === selectedJugadorId);
  }, [jugadoresList, selectedJugadorId]);

  // Jugadores filtrados para el menú de selección individual
  const filteredJugadoresForSelect = useMemo(() => {
    if (!playerSearchQuery.trim()) return jugadoresList;
    const q = playerSearchQuery.trim().toLowerCase();
    return jugadoresList.filter(
      (j) =>
        j.nombre.toLowerCase().includes(q) ||
        (j.apodo && j.apodo.toLowerCase().includes(q)) ||
        (j.dorsal !== undefined && j.dorsal !== null && String(j.dorsal).includes(q))
    );
  }, [jugadoresList, playerSearchQuery]);

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", padding: "16px", color: "#0f172a", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* IMPRESIÓN IMPERATIVA DE ESTILOS CSS PARA EXPORTACIÓN PDF A4 LANDSCAPE */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4 landscape !important;
            margin: 6mm 8mm 6mm 8mm !important;
          }
          html, body {
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .pdf-print-header {
            display: grid !important;
            grid-template-columns: 1fr auto 1fr !important;
            background: #0f172a !important;
            color: #ffffff !important;
            margin-top: 0 !important;
            margin-bottom: 8px !important;
            padding: 8px 14px !important;
            border-radius: 6px !important;
            border: 1px solid #0f172a !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            page-break-inside: avoid !important;
            page-break-after: avoid !important;
            box-sizing: border-box !important;
            width: 100% !important;
          }
          .pdf-print-footer {
            display: flex !important;
            page-break-inside: avoid !important;
            margin-top: 8px !important;
            padding-top: 4px !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box !important;
            width: 100% !important;
          }
          main {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            background: #ffffff !important;
          }
          div, section, main, article {
            overflow: visible !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          .eventos-grid-week {
            display: grid !important;
            grid-template-columns: repeat(7, 1fr) !important;
            width: 100% !important;
            min-width: 100% !important;
            gap: 6px !important;
          }
          .eventos-day-col {
            min-height: 480px !important;
            width: 100% !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          div[style*="minmax(140px"] {
            grid-template-columns: repeat(7, 1fr) !important;
            width: 100% !important;
          }
          div[style*="minmax(130px"] {
            grid-template-columns: 50px repeat(7, 1fr) !important;
            width: 100% !important;
          }
          div[style*="overflowX"], div[style*="overflow-x"] {
            overflow: visible !important;
            width: 100% !important;
          }
        }
      ` }} />

      {/* BARRA SUPERIOR DE ENCABEZADO Y ACCIONES */}
      <header
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          background: "#ffffff",
          padding: "12px 18px",
          borderRadius: "12px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Link
            href="/"
            style={{
              fontSize: "11px",
              fontWeight: 800,
              color: "#1e3a8a",
              background: "#e2e8f0",
              padding: "4px 10px",
              borderRadius: "6px",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            ← Menú
          </Link>
          <Link
            href="/calendario"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              fontWeight: 800,
              color: "#0284c7",
              textDecoration: "none",
              background: "#e0f2fe",
              padding: "4px 10px",
              borderRadius: "6px",
            }}
          >
            Planificación
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "22px" }}>🗓️</span>
            <div>
              <h1 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: 0, letterSpacing: "-0.02em" }}>
                CALENDARIO DE EQUIPO
              </h1>
            </div>
          </div>
        </div>

        {/* NAVEGACIÓN DE FECHAS */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            onClick={handlePrevPeriod}
            style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}
          >
            ◀ Anterior
          </button>
          <button
            type="button"
            onClick={handleGoToday}
            style={{ border: "1px solid #0284c7", background: "#e0f2fe", color: "#0369a1", borderRadius: "6px", padding: "4px 12px", fontSize: "11px", fontWeight: 900, cursor: "pointer" }}
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={handleNextPeriod}
            style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}
          >
            Siguiente ▶
          </button>
          <span style={{ fontSize: "12px", fontWeight: 800, color: "#1e293b", paddingLeft: "6px" }}>
            {viewMode === "dia" && `Día ${selectedDateStr}`}
            {(viewMode === "microciclo" || viewMode === "cronograma") && `${microcicloDays[0].dayNum} ${microcicloDays[0].monthShort} - ${microcicloDays[6].dayNum} ${microcicloDays[6].monthShort} 2026`}
            {viewMode === "mesociclo" && `Mesociclo · Agosto/Septiembre`}
          </span>
        </div>

        {/* SELECTOR DE VISTAS (FILTRO TIPO + PASTILLAS + RELOJ + FILTRO JUGADOR AVATAR + NUEVO EVENTO + EXPORTAR PDF) */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* FILTRO MULTISELECCIÓN DE TIPOS DE EVENTOS */}
          <div ref={filterDropdownRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowFilterDropdown((prev) => !prev)}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: selectedFilterTipos.length > 0 && selectedFilterTipos.length < FILTER_CATEGORIES.length ? "2px solid #0284c7" : "1px solid #cbd5e1",
                fontSize: "11px",
                fontWeight: 800,
                background: selectedFilterTipos.length > 0 && selectedFilterTipos.length < FILTER_CATEGORIES.length ? "#e0f2fe" : "#ffffff",
                color: selectedFilterTipos.length > 0 && selectedFilterTipos.length < FILTER_CATEGORIES.length ? "#0369a1" : "#0f172a",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <span>{filterButtonLabel}</span>
              <span style={{ fontSize: "9px" }}>{showFilterDropdown ? "▲" : "▼"}</span>
            </button>

            {/* MENÚ DESPLEGABLE CON CHECKBOXES MULTISELECCIÓN */}
            {showFilterDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  zIndex: 200,
                  background: "#ffffff",
                  borderRadius: "10px",
                  border: "1px solid #cbd5e1",
                  boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15)",
                  padding: "10px",
                  minWidth: "220px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>Filtrar Tipos</span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button type="button" onClick={handleSelectAllFilters} style={{ background: "none", border: "none", fontSize: "10px", color: "#0284c7", fontWeight: 800, cursor: "pointer" }}>
                      Todos
                    </button>
                    <span style={{ color: "#cbd5e1", fontSize: "10px" }}>|</span>
                    <button type="button" onClick={handleClearFilters} style={{ background: "none", border: "none", fontSize: "10px", color: "#ef4444", fontWeight: 800, cursor: "pointer" }}>
                      Limpiar
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "2px" }}>
                  {FILTER_CATEGORIES.map((cat) => (
                    <label
                      key={cat.id}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "11px",
                        fontWeight: 800,
                        color: "#334155",
                        padding: "4px 6px",
                        borderRadius: "5px",
                        cursor: "pointer",
                        background: selectedFilterTipos.includes(cat.id) ? "#f0f9ff" : "transparent",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFilterTipos.includes(cat.id)}
                        onChange={() => handleToggleFilterTipo(cat.id)}
                        style={{ cursor: "pointer" }}
                      />
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </label>
                  ))}
                </div>

                <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "6px", display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setShowFilterDropdown(false)}
                    style={{ background: "#0284c7", color: "#ffffff", border: "none", borderRadius: "5px", padding: "3px 10px", fontSize: "10.5px", fontWeight: 900, cursor: "pointer" }}
                  >
                    Listo
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* PASTILLAS PRINCIPALES DE VISTA */}
          <div style={{ display: "flex", background: "#f1f5f9", padding: "3px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
            <button
              type="button"
              onClick={() => setViewMode("dia")}
              style={{
                border: "none",
                background: viewMode === "dia" ? "#0284c7" : "transparent",
                color: viewMode === "dia" ? "#ffffff" : "#475569",
                borderRadius: "5px",
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: 900,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Día
            </button>
            <button
              type="button"
              onClick={() => setViewMode("microciclo")}
              style={{
                border: "none",
                background: viewMode === "microciclo" ? "#0284c7" : "transparent",
                color: viewMode === "microciclo" ? "#ffffff" : "#475569",
                borderRadius: "5px",
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: 900,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Microciclo
            </button>
            <button
              type="button"
              onClick={() => setViewMode("mesociclo")}
              style={{
                border: "none",
                background: viewMode === "mesociclo" ? "#0284c7" : "transparent",
                color: viewMode === "mesociclo" ? "#ffffff" : "#475569",
                borderRadius: "5px",
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: 900,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Mesociclo
            </button>
          </div>

          {/* BOTÓN INDEPENDIENTE PEQUEÑO CON ICONO DE RELOJ */}
          <button
            type="button"
            title="Visión de Cronograma Horario Proporcional"
            onClick={() => setViewMode("cronograma")}
            style={{
              width: "32px",
              height: "32px",
              display: "grid",
              placeItems: "center",
              border: viewMode === "cronograma" ? "2px solid #7c3aed" : "1px solid #cbd5e1",
              background: viewMode === "cronograma" ? "#7c3aed" : "#ffffff",
              color: viewMode === "cronograma" ? "#ffffff" : "#475569",
              borderRadius: "8px",
              fontSize: "15px",
              cursor: "pointer",
              boxShadow: viewMode === "cronograma" ? "0 2px 8px rgba(124,58,237,0.3)" : "0 1px 3px rgba(0,0,0,0.06)",
              transition: "all 0.15s ease",
            }}
          >
            ⏱️
          </button>

          {/* BOTÓN FILTRO COMPACTO CON AVATAR Y FOTO DE DEPORTISTA */}
          <div ref={playerDropdownRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowPlayerDropdown((prev) => !prev)}
              style={{
                height: "32px",
                padding: "0 10px",
                borderRadius: "8px",
                border: selectedJugadorId ? "2px solid #0284c7" : "1px solid #cbd5e1",
                background: selectedJugadorId ? "#e0f2fe" : "#ffffff",
                color: selectedJugadorId ? "#0369a1" : "#475569",
                fontSize: "11px",
                fontWeight: 900,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              {selectedJugador ? (
                selectedJugador.foto_url ? (
                  <img
                    src={selectedJugador.foto_url || undefined}
                    alt={(selectedJugador.apodo || selectedJugador.nombre || "").toUpperCase()}
                    style={{ width: "20px", height: "20px", borderRadius: "50%", objectFit: "cover", border: "1px solid #0284c7" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      background: "#0284c7",
                      color: "#ffffff",
                      fontSize: "9px",
                      fontWeight: 900,
                      display: "grid",
                      placeItems: "center",
                      textTransform: "uppercase",
                    }}
                  >
                    {selectedJugador.nombre.substring(0, 2)}
                  </div>
                )
              ) : (
                <span style={{ fontSize: "14px" }}>👥</span>
              )}

              <span>{selectedJugador ? selectedJugador.nombre : "Todo el equipo"}</span>
              <span style={{ fontSize: "9px" }}>{showPlayerDropdown ? "▲" : "▼"}</span>
            </button>

            {/* MENÚ DESPLEGABLE DE SELECCIÓN DE JUGADOR DEPORTISTA CON FOTO DE AVATAR */}
            {showPlayerDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  zIndex: 200,
                  background: "#ffffff",
                  borderRadius: "10px",
                  border: "1px solid #cbd5e1",
                  boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15)",
                  padding: "10px",
                  minWidth: "250px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "2px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>
                    Deportistas ({jugadoresList.length})
                  </span>
                </div>

                <input
                  type="text"
                  value={playerSearchQuery}
                  onChange={(e) => setPlayerSearchQuery(e.target.value)}
                  placeholder="🔍 Buscar por nombre o dorsal..."
                  style={{
                    padding: "5px 8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "11px",
                    width: "100%",
                    outline: "none",
                  }}
                />

                <div style={{ maxHeight: "230px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "3px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedJugadorId("");
                      setShowPlayerDropdown(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "none",
                      background: !selectedJugadorId ? "#e0f2fe" : "transparent",
                      color: !selectedJugadorId ? "#0369a1" : "#334155",
                      fontSize: "11px",
                      fontWeight: 800,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: "14px" }}>👥</span>
                    <span>Todo el equipo (Vista General)</span>
                  </button>

                  {filteredJugadoresForSelect.map((j) => {
                    const isSelected = selectedJugadorId === j.id;
                    const posSimplificada = simplifyPosicion(j.posicion);

                    return (
                      <button
                        key={j.id}
                        type="button"
                        onClick={() => {
                          setSelectedJugadorId(j.id);
                          setShowPlayerDropdown(false);
                        }}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "6px 8px",
                          borderRadius: "6px",
                          border: "none",
                          background: isSelected ? "#0284c7" : "transparent",
                          color: isSelected ? "#ffffff" : "#334155",
                          fontSize: "11px",
                          fontWeight: 800,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {j.foto_url ? (
                            <img
                              src={j.foto_url || undefined}
                              alt={(j.apodo || j.nombre || "").toUpperCase()}
                              style={{ width: "22px", height: "22px", borderRadius: "50%", objectFit: "cover", border: isSelected ? "1px solid #ffffff" : "1px solid #cbd5e1" }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "22px",
                                height: "22px",
                                borderRadius: "50%",
                                background: isSelected ? "#ffffff" : "#0284c7",
                                color: isSelected ? "#0284c7" : "#ffffff",
                                fontSize: "9px",
                                fontWeight: 900,
                                display: "grid",
                                placeItems: "center",
                                textTransform: "uppercase",
                              }}
                            >
                              {j.nombre.substring(0, 2)}
                            </div>
                          )}
                          <span>
                            {(j.apodo || j.nombre || "").toUpperCase()} {j.dorsal !== undefined && j.dorsal !== null && j.dorsal !== "" ? `(#${j.dorsal})` : ""}
                          </span>
                        </div>

                        {posSimplificada && (
                          <span style={{ fontSize: "9.5px", opacity: isSelected ? 0.9 : 0.7, fontWeight: 700, paddingLeft: "6px" }}>
                            {posSimplificada}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setFormFecha(selectedDateStr);
              setShowCreateModal(true);
            }}
            style={{
              background: "#16a34a",
              color: "#ffffff",
              border: "none",
              borderRadius: "7px",
              padding: "5px 12px",
              fontSize: "11px",
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>+</span> Nuevo Evento
          </button>

          {/* BOTÓN EXPORTAR EN PDF (IMPRESIÓN HORIZONTAL DE 1 PÁGINA) */}
          <button
            type="button"
            className="no-print"
            onClick={() => setShowPdfModal(true)}
            style={{
              background: "#0284c7",
              color: "#ffffff",
              border: "none",
              borderRadius: "7px",
              padding: "5px 12px",
              fontSize: "11px",
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>📄</span> Exportar PDF
          </button>
        </div>
      </header>

      {/* BANNER INFORMATIVO SI HAY UN CALENDARIO INDIVIDUALIZADO ACTIVO */}
      {selectedJugador && (
        <div
          className="no-print"
          style={{
            background: "#e0f2fe",
            border: "1.5px solid #0284c7",
            borderRadius: "10px",
            padding: "8px 14px",
            marginBottom: "14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 2px 5px rgba(2,132,199,0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", fontWeight: 800, color: "#0369a1" }}>
            {selectedJugador.foto_url ? (
              <img
                src={selectedJugador.foto_url || undefined}
                alt={(selectedJugador.apodo || selectedJugador.nombre || "").toUpperCase()}
                style={{ width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover", border: "1.5px solid #0284c7" }}
              />
            ) : (
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: "#0284c7",
                  color: "#ffffff",
                  fontSize: "11px",
                  fontWeight: 900,
                  display: "grid",
                  placeItems: "center",
                  textTransform: "uppercase",
                }}
              >
                {selectedJugador.nombre.substring(0, 2)}
              </div>
            )}
            <div>
              <span>
                CALENDARIO INDIVIDUALIZADO: <strong>{(selectedJugador.apodo || selectedJugador.nombre || "").toUpperCase()}</strong> {selectedJugador.dorsal !== undefined && selectedJugador.dorsal !== null && selectedJugador.dorsal !== "" ? `(#${selectedJugador.dorsal})` : ""} {selectedJugador.posicion ? `· ${simplifyPosicion(selectedJugador.posicion)}` : ""}
              </span>
              <span style={{ fontSize: "10.5px", fontWeight: 700, display: "block", color: "#0284c7" }}>
                Filtrado de eventos personalizado según la asignación individual realizada en Planificación
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedJugadorId("")}
            style={{
              background: "#ffffff",
              border: "1px solid #0284c7",
              color: "#0369a1",
              borderRadius: "6px",
              padding: "4px 12px",
              fontSize: "11px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            ✕ Ver Todo el Equipo
          </button>
        </div>
      )}

      {/* CABECERA EXCLUSIVA PARA LA EXPORTACIÓN EN PDF (IMPRESIÓN LANDSCAPE) */}
      <div
        className="pdf-print-header"
        style={{
          display: "none",
          width: "100%",
          marginBottom: "12px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
          borderRadius: "8px",
          padding: "10px 16px",
          color: "#ffffff",
          boxShadow: "0 2px 6px rgba(15, 23, 42, 0.15)",
          border: "1px solid #1e3a8a",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "12px", width: "100%" }}>
          {/* LADO IZQUIERDO: ESCUDO + DATOS DEL CLUB */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <img
              src={clubConfig?.escudoUrl || "/ce-europa.png"}
              alt={clubConfig?.nombreClub || "Club"}
              style={{
                height: "50px",
                width: "50px",
                objectFit: "contain",
                background: "transparent",
                filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/ce-europa.png";
              }}
            />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: "14px", fontWeight: 900, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.2 }}>
                {clubConfig?.nombreClub || activeTeam || "CE EUROPA"}
              </div>
              <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#93c5fd", marginTop: "2px", lineHeight: 1.2 }}>
                {clubConfig?.categoria || "1er Equipo"} • Área de Rendimiento
              </div>
              <div style={{ fontSize: "9.5px", fontWeight: 600, color: "#cbd5e1", marginTop: "1px" }}>
                Temporada {clubConfig?.temporadaActiva || "2026/27"}
              </div>
            </div>
          </div>

          {/* CENTRO: TÍTULO DESTACADO Y RANGO DE FECHAS */}
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              fontSize: "15px",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              color: "#ffffff",
              lineHeight: 1.2,
            }}>
              CALENDARIO DE EQUIPO
            </div>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "#fef08a", marginTop: "3px" }}>
              {viewMode === "dia" && `Agenda Diaria · ${selectedDateStr}`}
              {(viewMode === "microciclo" || viewMode === "cronograma") && (
                `Microciclo · ${microcicloDays[0]?.dayNum} ${microcicloDays[0]?.monthShort} — ${microcicloDays[6]?.dayNum} ${microcicloDays[6]?.monthShort} 2026`
              )}
              {viewMode === "mesociclo" && `Planificación Mesociclo`}
            </div>
            <div style={{ fontSize: "9.5px", fontWeight: 700, color: "#e0f2fe", marginTop: "2px" }}>
              {selectedJugador ? `Ficha Individual: ${(selectedJugador.apodo || selectedJugador.nombre || "").toUpperCase()}` : "Vista General de la Plantilla"}
            </div>
          </div>

          {/* LADO DERECHO: METADATA OFICIAL */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center" }}>
            <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.5px", color: "#67e8f9", textTransform: "uppercase" }}>
              TOP PLAY TRAINING
            </div>
            <div style={{ fontSize: "9.5px", fontWeight: 700, color: "#cbd5e1", marginTop: "2px" }}>
              Planificación Semanal
            </div>
            <div style={{ fontSize: "9px", color: "#94a3b8", fontWeight: 600, marginTop: "1px" }}>
              Emitido: {new Date().toLocaleDateString("es-ES")}
            </div>
          </div>
        </div>

        {/* COMENTARIOS LIMPIOS SI SE ESCRIBIERON EN EL MODAL DE PDF */}
        {pdfComment.trim() !== "" && (
          <div
            style={{
              marginTop: "8px",
              padding: "6px 12px",
              background: "rgba(255, 255, 255, 0.1)",
              borderLeft: "3px solid #fef08a",
              borderRadius: "4px",
              fontSize: "10.5px",
              lineHeight: "1.4",
              color: "#ffffff",
              fontWeight: 700,
              whiteSpace: "pre-wrap",
            }}
          >
            {pdfComment}
          </div>
        )}
      </div>

      {/* CONTENIDO PRINCIPAL SEGÚN VISTA SELECCIONADA */}
      <main style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #cbd5e1", boxShadow: "0 4px 12px rgba(0,0,0,0.03)", padding: "16px" }}>
        {/* ========================================================================= */}
        {/* VISTA 1: VISTA DE DÍA (DAY VIEW)                                          */}
        {/* ========================================================================= */}
        {viewMode === "dia" && (
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: "16px" }}>
            {/* PANEL LATERAL DE INFORMACIÓN DEL DÍA */}
            <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "14px", border: "1px solid #e2e8f0" }}>
              <div style={{ borderBottom: "1px solid #cbd5e1", paddingBottom: "8px", marginBottom: "12px" }}>
                <span style={{ fontSize: "10px", fontWeight: 900, color: "#0284c7", textTransform: "uppercase" }}>Agenda Diaria</span>
                <h2 style={{ fontSize: "18px", fontWeight: 900, margin: "2px 0 0 0" }}>{selectedDateStr}</h2>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
                  Eventos del día ({filteredEventos.filter((e) => e.fecha === selectedDateStr).length})
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
                  {filteredEventos
                    .filter((e) => e.fecha === selectedDateStr)
                    .map((ev) => {
                      const styleConfig = getEventStyle(ev.codigo, ev.tipoCat);
                      return (
                        <div
                          key={ev.id}
                          onClick={() => handleOpenEditModal(ev)}
                          style={{
                            padding: "6px 8px",
                            borderRadius: "6px",
                            border: `1.5px solid ${styleConfig.border}`,
                            background: styleConfig.bg,
                            color: styleConfig.color,
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontSize: "11px", fontWeight: 900 }}>{styleConfig.icon} {ev.titulo}</div>
                          <div style={{ fontSize: "10px", fontWeight: 700, opacity: 0.9 }}>⏰ {ev.horaInicio} ({ev.duracionMin} min) · 📍 {ev.lugar}</div>
                        </div>
                      );
                    })}
                  {filteredEventos.filter((e) => e.fecha === selectedDateStr).length === 0 && (
                    <div style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic", textAlign: "center", padding: "12px" }}>
                      Sin eventos programados para este día
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CRONOGRAMA HORARIO DEL DÍA (08:00 A 21:00) */}
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {HOUR_SLOTS.map((hora) => {
                const eventsAtHour = filteredEventos.filter(
                  (e) => e.fecha === selectedDateStr && e.horaInicio.startsWith(hora.split(":")[0])
                );

                return (
                  <div
                    key={hora}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "60px 1fr",
                      alignItems: "center",
                      minHeight: "44px",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#64748b" }}>{hora}</span>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", padding: "4px 0" }}>
                      {eventsAtHour.map((ev) => {
                        const styleConfig = getEventStyle(ev.codigo, ev.tipoCat);
                        return (
                          <div
                            key={ev.id}
                            onClick={() => handleOpenEditModal(ev)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: `1.5px solid ${styleConfig.border}`,
                              background: styleConfig.bg,
                              color: styleConfig.color,
                              fontWeight: 800,
                              fontSize: "11px",
                              cursor: "pointer",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                            }}
                          >
                            <span>{styleConfig.icon}</span>
                            <span>{ev.titulo}</span>
                            <span style={{ fontSize: "9.5px", background: "rgba(255,255,255,0.7)", padding: "1px 4px", borderRadius: "3px" }}>
                              {ev.lugar}
                            </span>
                            {ev.carga && <span style={{ fontSize: "9.5px", fontWeight: 900 }}>⚡ {ev.carga}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VISTA 2: VISTA DE MICROCICLO (LUNES A DOMINGO - 7 COLUMNAS REJILLA)      */}
        {/* ========================================================================= */}
        {viewMode === "microciclo" && (
          <div style={{ overflowX: "auto" }}>
            <div
              className="eventos-grid-week"
              style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(140px, 1fr))", gap: "8px" }}
            >
              {microcicloDays.map((day) => {
                const dayEvents = filteredEventos
                  .filter((e) => e.fecha === day.dateStr)
                  .sort(sortDayEvents);

                return (
                  <div
                    key={day.dateStr}
                    className="eventos-day-col"
                    style={{
                      background: day.isToday ? "#f0f9ff" : "#ffffff",
                      borderRadius: "8px",
                      border: day.isToday ? "2px solid #0284c7" : "1px solid #cbd5e1",
                      minHeight: "480px",
                      display: "flex",
                      flexDirection: "column",
                      boxShadow: day.isToday ? "0 4px 12px rgba(2,132,199,0.12)" : "none",
                    }}
                  >
                    {/* CABECERA DEL DÍA */}
                    <div
                      onClick={() => setSelectedDateStr(day.dateStr)}
                      style={{
                        padding: "8px 10px",
                        background: day.isToday ? "#0284c7" : "#f8fafc",
                        color: day.isToday ? "#ffffff" : "#0f172a",
                        borderTopLeftRadius: "6px",
                        borderTopRightRadius: "6px",
                        borderBottom: "1px solid #cbd5e1",
                        textAlign: "center",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: "10px", fontWeight: 900, opacity: 0.9 }}>{day.dayName}</div>
                      <div style={{ fontSize: "16px", fontWeight: 900 }}>{day.dayNum} {day.monthShort}</div>
                    </div>

                    {/* EVENTOS DEL DÍA EN MICROCICLO */}
                    <div style={{ padding: "6px", display: "flex", flexDirection: "column", gap: "6px", flex: 1, overflowY: "auto" }}>
                      {dayEvents.map((ev) => {
                        const styleConfig = getEventStyle(ev.codigo, ev.tipoCat);

                        return (
                          <div
                            key={ev.id}
                            onClick={() => handleOpenEditModal(ev)}
                            style={{
                              padding: "6px 8px",
                              borderRadius: "6px",
                              border: `1.5px solid ${styleConfig.border}`,
                              background: styleConfig.bg,
                              color: styleConfig.color,
                              fontSize: "11px",
                              fontWeight: 800,
                              cursor: "pointer",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                              transition: "transform 0.1s ease",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                              <span style={{ fontSize: "9.5px", fontWeight: 900, background: styleConfig.border, color: "#ffffff", padding: "1px 5px", borderRadius: "3px" }}>
                                #{ev.slotIdx + 1} · {ev.codigo}
                              </span>
                              {ev.horaInicio ? (
                                <span style={{ fontSize: "10px", fontWeight: 900 }}>⏰ {ev.horaInicio}</span>
                              ) : (
                                <span style={{ fontSize: "9px", fontWeight: 800, opacity: 0.65 }}>Evento #{ev.slotIdx + 1}</span>
                              )}
                            </div>

                            <div style={{ fontSize: "11px", fontWeight: 900, lineHeight: 1.25, marginTop: "3px" }}>
                              {styleConfig.icon} {ev.nombreCompleto}
                            </div>

                            <div style={{ 
                              fontSize: "10px", 
                              fontWeight: 800, 
                              lineHeight: 1.2, 
                              margin: "2px 0", 
                              textAlign: "center",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              opacity: 0.9
                            }}>
                              {ev.orientacion ? ev.orientacion.toUpperCase() : (ev.comentario ? ev.comentario.toUpperCase() : " ")}
                            </div>

                            <div style={{ fontSize: "9.5px", fontWeight: 700, opacity: 0.9, marginTop: "1px" }}>
                              📍 {ev.lugar ? ev.lugar.toUpperCase() : ""}
                            </div>
                          </div>
                        );
                      })}

                      {dayEvents.length === 0 && (
                        <div style={{ fontSize: "10.5px", color: "#cbd5e1", textAlign: "center", fontStyle: "italic", marginTop: "20px" }}>
                          Sin eventos
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VISTA 3: VISTA DE MESOCICLO COMPLETA (SIN TRUNCAR NINGÚN EVENTO)          */}
        {/* ========================================================================= */}
        {viewMode === "mesociclo" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {mesocicloWeeks.map((week) => (
              <div key={`week-${week.weekNum}`} style={{ background: "#f8fafc", borderRadius: "8px", border: "1px solid #cbd5e1", padding: "8px" }}>
                <div style={{ fontSize: "10.5px", fontWeight: 900, color: "#0284c7", textTransform: "uppercase", marginBottom: "6px" }}>
                  📅 Semana #{week.weekNum} del Mesociclo
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px" }}>
                  {week.days.map((d) => {
                    const dayEvents = filteredEventos.filter((e) => e.fecha === d.dateStr).sort(sortDayEvents);

                    return (
                      <div
                        key={d.dateStr}
                        onClick={() => {
                          setSelectedDateStr(d.dateStr);
                          setViewMode("dia");
                        }}
                        style={{
                          background: d.isToday ? "#f0f9ff" : "#ffffff",
                          border: d.isToday ? "2px solid #0284c7" : "1px solid #e2e8f0",
                          borderRadius: "6px",
                          padding: "6px",
                          minHeight: "85px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "3px",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontSize: "11px", fontWeight: 900, color: "#0f172a", marginBottom: "2px" }}>
                          {d.dayNum} <small style={{ color: "#64748b", fontWeight: 700 }}>{d.monthShort}</small>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px", flex: 1 }}>
                          {dayEvents.map((ev) => {
                            const styleConfig = getEventStyle(ev.codigo, ev.tipoCat);
                            return (
                              <div
                                key={ev.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEditModal(ev);
                                }}
                                style={{
                                  fontSize: "9px",
                                  fontWeight: 800,
                                  background: styleConfig.bg,
                                  color: styleConfig.color,
                                  border: `1px solid ${styleConfig.border}`,
                                  borderRadius: "3px",
                                  padding: "2px 4px",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  lineHeight: 1.25,
                                }}
                              >
                                {ev.horaInicio} {ev.codigo} ({ev.nombreCompleto})
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ========================================================================= */}
        {/* VISTA 4: VISTA DE CRONOGRAMA HORARIO (TIMELINE PROPORCIONAL A DURACIÓN)   */}
        {/* ========================================================================= */}
        {viewMode === "cronograma" && (
          <div style={{ overflowX: "auto" }}>
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "8px", background: "#ffffff" }}>
              {/* CABECERA CON DÍAS DEL MICROCICLO */}
              <div style={{ display: "grid", gridTemplateColumns: "70px repeat(7, minmax(130px, 1fr))", borderBottom: "2px solid #cbd5e1", background: "#f8fafc" }}>
                <div style={{ padding: "10px", fontSize: "10px", fontWeight: 900, color: "#64748b", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>
                  HORA
                </div>
                {microcicloDays.map((day) => (
                  <div
                    key={day.dateStr}
                    onClick={() => setSelectedDateStr(day.dateStr)}
                    style={{
                      padding: "8px",
                      textAlign: "center",
                      borderRight: "1px solid #e2e8f0",
                      background: day.isToday ? "#e0f2fe" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: "10px", fontWeight: 900, color: day.isToday ? "#0369a1" : "#475569" }}>{day.dayName}</div>
                    <div style={{ fontSize: "15px", fontWeight: 900, color: day.isToday ? "#0284c7" : "#0f172a" }}>{day.dayNum} {day.monthShort}</div>
                  </div>
                ))}
              </div>

              {/* CUERPO DEL CRONOGRAMA: HORAS (08:00 A 21:00) + BLOQUES POSICIONADOS */}
              <div style={{ display: "grid", gridTemplateColumns: "70px repeat(7, minmax(130px, 1fr))", position: "relative" }}>
                {/* COLUMNA DE HORAS */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {HOUR_SLOTS.map((h) => (
                    <div key={h} style={{ height: `${HOUR_HEIGHT}px`, borderBottom: "1px solid #f1f5f9", borderRight: "1px solid #cbd5e1", padding: "4px 8px", fontSize: "11px", fontWeight: 800, color: "#64748b", textAlign: "right" }}>
                      {h}
                    </div>
                  ))}
                </div>

                {/* COLUMNAS POR DÍA CON EVENTOS POSICIONADOS SEGÚN SU HORA INICIO Y DURACIÓN */}
                {microcicloDays.map((day) => {
                  const dayEvents = filteredEventos.filter((e) => e.fecha === day.dateStr);

                  return (
                    <div
                      key={day.dateStr}
                      style={{
                        position: "relative",
                        borderRight: "1px solid #e2e8f0",
                        background: day.isToday ? "rgba(240, 249, 255, 0.4)" : "transparent",
                      }}
                    >
                      {/* LÍNEAS HORARIAS DE FONDO */}
                      {HOUR_SLOTS.map((h) => (
                        <div key={h} style={{ height: `${HOUR_HEIGHT}px`, borderBottom: "1px solid #f1f5f9" }} />
                      ))}

                      {/* TARJETAS DE EVENTOS POSICIONADAS EXACTAMENTE */}
                      {dayEvents.map((ev) => {
                        const styleConfig = getEventStyle(ev.codigo, ev.tipoCat);
                        const topPx = (timeToMinutesFromStart(ev.horaInicio) / 60) * HOUR_HEIGHT;
                        const heightPx = Math.max(36, (ev.duracionMin / 60) * HOUR_HEIGHT);
                        const horaFinStr = getHoraFinStr(ev.horaInicio, ev.duracionMin);

                        return (
                          <div
                            key={ev.id}
                            onClick={() => handleOpenEditModal(ev)}
                            style={{
                              position: "absolute",
                              top: `${topPx}px`,
                              height: `${heightPx}px`,
                              left: "4px",
                              right: "4px",
                              borderRadius: "6px",
                              border: `1.5px solid ${styleConfig.border}`,
                              background: styleConfig.bg,
                              color: styleConfig.color,
                              padding: "4px 6px",
                              boxShadow: "0 2px 5px rgba(0,0,0,0.08)",
                              overflow: "hidden",
                              cursor: "pointer",
                              zIndex: 10,
                              transition: "transform 0.1s ease, box-shadow 0.1s ease",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
                              <span style={{ fontSize: "9px", fontWeight: 900, background: styleConfig.border, color: "#ffffff", padding: "0 4px", borderRadius: "3px" }}>
                                {ev.codigo}
                              </span>
                              <span style={{ fontSize: "9.5px", fontWeight: 900 }}>
                                ⏰ {ev.horaInicio} - {horaFinStr}
                              </span>
                            </div>

                            <div style={{ fontSize: "10.5px", fontWeight: 900, lineHeight: 1.2, marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {styleConfig.icon} {ev.nombreCompleto}
                            </div>

                            <div style={{ 
                              fontSize: "9.5px", 
                              fontWeight: 800, 
                              lineHeight: 1.2, 
                              margin: "2px 0", 
                              textAlign: "center",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              opacity: 0.9
                            }}>
                              {ev.orientacion ? ev.orientacion.toUpperCase() : (ev.comentario ? ev.comentario.toUpperCase() : " ")}
                            </div>

                            {heightPx > 50 && (
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "9px", opacity: 0.9, marginTop: "1px" }}>
                                <span>📍 {ev.lugar ? ev.lugar.toUpperCase() : ""}</span>
                                <span>⏱️ {ev.duracionMin} min</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* PIE DE PÁGINA PROFESIONAL EN IMPRESIÓN / EXPORTACIÓN */}
        <div
          className="pdf-print-footer"
          style={{
            display: "none",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 10px",
            marginTop: "12px",
            fontSize: "9.5px",
            fontWeight: 600,
            color: "#64748b",
            borderTop: "1px solid #cbd5e1",
          }}
        >
          <span>
            © {new Date().getFullYear()} {clubConfig?.nombreClub || activeTeam || "CE Europa"} • Área de Rendimiento Deportivo • Top Play Training
          </span>
          <span>
            Documento técnico oficial para uso exclusivo del club y cuerpo técnico
          </span>
        </div>
      </main>



      {/* MODAL CONFIGURACIÓN DE EXPORTACIÓN A PDF (1 PÁGINA HORIZONTAL) */}
      {showPdfModal && (
        <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1100, display: "grid", placeItems: "center", padding: "16px" }}>
          <div style={{ background: "#ffffff", borderRadius: "14px", padding: "20px", maxWidth: "480px", width: "100%", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px", marginBottom: "12px" }}>
              <span style={{ fontSize: "12px", fontWeight: 900, color: "#0284c7", textTransform: "uppercase" }}>📄 Exportar PDF Horizontal (1 Página)</span>
              <button type="button" onClick={() => setShowPdfModal(false)} style={{ border: "none", background: "none", fontSize: "14px", cursor: "pointer", fontWeight: 900 }}>✕</button>
            </div>

            <div style={{ fontSize: "11px", color: "#334155", display: "flex", flexDirection: "column", gap: "10px" }}>
              <p style={{ margin: 0, lineHeight: 1.4 }}>
                Se exportará el calendario en formato <strong>Horizontal (Landscape)</strong> en una sola página, omitiendo botones de navegación y filtros, e incluyendo el <strong>escudo oficial del CE Europa</strong>.
              </p>

              <div>
                <label style={{ fontWeight: 800, display: "block", marginBottom: "4px", color: "#0f172a" }}>
                  📝 Comentario / Observación para el PDF (Opcional):
                </label>
                <textarea
                  value={pdfComment}
                  onChange={(e) => setPdfComment(e.target.value)}
                  placeholder="Escribe aquí observaciones o instrucciones adicionales..."
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "11px",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
                <span style={{ fontSize: "9.5px", color: "#64748b", fontStyle: "italic", marginTop: "2px", display: "block" }}>
                  Si no escribes comentario, el PDF se exportará limpiamente sin este bloque.
                </span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "6px 12px", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPdfModal(false);
                  const prevTitle = document.title;
                  const clubClean = (clubConfig?.nombreClub || activeTeam || "CE_Europa").replace(/\s+/g, "_");
                  const fFirst = microcicloDays[0]?.dateStr || "";
                  const fLast = microcicloDays[6]?.dateStr || "";
                  document.title = `Calendario_${clubClean}_${viewMode}_${fFirst}_${fLast}`;
                  setTimeout(() => {
                    window.print();
                    setTimeout(() => {
                      document.title = prevTitle;
                    }, 1500);
                  }, 150);
                }}
                style={{ background: "#0284c7", color: "#ffffff", border: "none", borderRadius: "6px", padding: "6px 16px", fontSize: "11px", fontWeight: 900, cursor: "pointer", boxShadow: "0 2px 5px rgba(2,132,199,0.3)" }}
              >
                🖨️ Generar / Imprimir PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL UNIFICADO (EDICIÓN DE EVENTO, CONVOCATORIA Y MINUTOS/OBSERVACIONES EN VISTA ÚNICA SCROLLABLE) */}
      {selectedEventDetail && (
        <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "grid", placeItems: "center", padding: "16px" }}>
          <form
            onSubmit={handleSaveEventEdit}
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              padding: "20px",
              maxWidth: "650px",
              width: "100%",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* CABECERA UNIFICADA DEL MODAL */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>📝</span>
                <span style={{ fontSize: "14px", fontWeight: 900, color: "#0f172a" }}>
                  Detalles del Evento · {selectedEventDetail.nombreCompleto} ({editCodigo})
                </span>
              </div>
              <button type="button" onClick={() => setSelectedEventDetail(null)} style={{ border: "none", background: "none", fontSize: "16px", cursor: "pointer", fontWeight: 900, color: "#64748b" }}>✕</button>
            </div>

            {/* CUERPO UNIFICADO DE SCROLL CON LAS 3 SECCIONES EN ORDEN */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px", overflowY: "auto", paddingRight: "6px", maxHeight: "calc(90vh - 140px)" }}>
              
              {/* SECCIÓN 1: INFORMACIÓN GENERAL */}
              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontSize: "12px", fontWeight: 900, color: "#0284c7", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>⚙️</span> 1. Información General del Evento
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div>
                    <label style={{ fontWeight: 800, display: "block", marginBottom: "3px", fontSize: "11px" }}>Categoría General:</label>
                    <select
                      value={editTipoCat}
                      onChange={(e) => {
                        setEditTipoCat(e.target.value);
                        if (e.target.value === "gimnasio") setEditCodigo("Gim");
                        else if (e.target.value === "partido") setEditCodigo("Pa");
                        else if (e.target.value === "charla") setEditCodigo("VD");
                        else setEditCodigo("Co");
                      }}
                      style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "11px" }}
                    >
                      <option value="entrenamiento">⚽ Coadyuvante / Optimizador (Co/Op)</option>
                      <option value="gimnasio">🏋️ Fuerza / Gimnasio (Gim)</option>
                      <option value="partido">🏆 Partido Oficial (Pa/PAL/PAV)</option>
                      <option value="charla">📹 Charla / Vídeo (VD)</option>
                      <option value="readaptacion">🏥 Readaptación (Red)</option>
                      <option value="viaje">🚌 Viaje / Desplazamiento (Vi)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontWeight: 800, display: "block", marginBottom: "3px", fontSize: "11px" }}>Código Planificación:</label>
                    <input type="text" value={editCodigo} onChange={(e) => setEditCodigo(e.target.value)} placeholder="ej. Co, Op, Gim, Pa" style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "11px" }} />
                  </div>
                </div>

                <div>
                  <label style={{ fontWeight: 800, display: "block", marginBottom: "3px", fontSize: "11px" }}>Orientación Táctica / Nombre de Sesión:</label>
                  <input type="text" value={editOrientacion} onChange={(e) => setEditOrientacion(e.target.value)} placeholder="ej. Salida de presión y 5v5" style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "11px" }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                  <div>
                    <label style={{ fontWeight: 800, display: "block", marginBottom: "3px", fontSize: "11px" }}>Fecha:</label>
                    <input type="date" value={editFecha} onChange={(e) => setEditFecha(e.target.value)} style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "11px" }} />
                  </div>
                  <div>
                    <label style={{ fontWeight: 800, display: "block", marginBottom: "3px", fontSize: "11px" }}>Hora Inicio:</label>
                    <input type="text" value={editHora} onChange={(e) => setEditHora(e.target.value)} placeholder="HH:MM" style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "11px" }} />
                  </div>
                  <div>
                    <label style={{ fontWeight: 800, display: "block", marginBottom: "3px", fontSize: "11px" }}>Duración (min):</label>
                    <input type="number" value={editDuracion} onChange={(e) => setEditDuracion(Number(e.target.value))} style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "11px" }} />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div>
                    <label style={{ fontWeight: 800, display: "block", marginBottom: "3px", fontSize: "11px" }}>Lugar / Instalación:</label>
                    <input type="text" value={editLugar} onChange={(e) => setEditLugar(e.target.value)} placeholder="Pabellón Principal" style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "11px" }} />
                  </div>
                  <div>
                    <label style={{ fontWeight: 800, display: "block", marginBottom: "3px", fontSize: "11px" }}>Carga Estimada:</label>
                    <input type="text" value={editCarga} onChange={(e) => setEditCarga(e.target.value)} placeholder="7.5 AU" style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "11px" }} />
                  </div>
                </div>

                <div>
                  <label style={{ fontWeight: 800, display: "block", marginBottom: "3px", fontSize: "11px" }}>Notas / Comentarios de Sesión:</label>
                  <input type="text" value={editComentario} onChange={(e) => setEditComentario(e.target.value)} placeholder="Notas metodológicas o de sesión" style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "11px" }} />
                </div>
              </div>

              {/* SECCIÓN 2: ASIGNACIÓN / CONVOCATORIA (VACÍA POR DEFECTO HASTA MARCAR) */}
              <div style={{ background: "#ffffff", padding: "14px", borderRadius: "10px", border: "1px solid #cbd5e1", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: "12px", fontWeight: 900, color: "#0369a1", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>👥</span> 2. Convocatoria / Asignación de deportistas ({assignedPlayerIds.length}/{jugadoresList.length})
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button type="button" onClick={handleSelectAllPlayers} style={{ background: "#e0f2fe", color: "#0369a1", border: "none", borderRadius: "4px", padding: "3px 8px", fontSize: "10px", fontWeight: 800, cursor: "pointer" }}>
                      ✅ Todos
                    </button>
                    <button type="button" onClick={handleDeselectAllPlayers} style={{ background: "#fef2f2", color: "#b91c1c", border: "none", borderRadius: "4px", padding: "3px 8px", fontSize: "10px", fontWeight: 800, cursor: "pointer" }}>
                      ❌ Ninguno
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 700 }}>
                  💡 Selecciona los deportistas asignados a este evento. Al guardar, esta asignación pasará automáticamente a la vista de Planificación.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  {jugadoresList.map((j) => {
                    const isAssigned = assignedPlayerIds.includes(j.id);
                    const posSimplificada = simplifyPosicion(j.posicion);

                    return (
                      <label
                        key={j.id}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "6px 8px",
                          borderRadius: "6px",
                          border: isAssigned ? "1.5px solid #0284c7" : "1px solid #e2e8f0",
                          background: isAssigned ? "#f0f9ff" : "#ffffff",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isAssigned}
                          onChange={() => handleTogglePlayerAssignment(j.id)}
                          style={{ cursor: "pointer" }}
                        />

                        {j.foto_url ? (
                          <img
                            src={j.foto_url || undefined}
                            alt={(j.apodo || j.nombre || "").toUpperCase()}
                            style={{ width: "22px", height: "22px", borderRadius: "50%", objectFit: "cover", border: "1px solid #cbd5e1" }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "22px",
                              height: "22px",
                              borderRadius: "50%",
                              background: isAssigned ? "#0284c7" : "#cbd5e1",
                              color: "#ffffff",
                              fontSize: "9px",
                              fontWeight: 900,
                              display: "grid",
                              placeItems: "center",
                              textTransform: "uppercase",
                            }}
                          >
                            {j.nombre.substring(0, 2)}
                          </div>
                        )}

                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontSize: "11px", fontWeight: 800, color: "#0f172a" }}>
                            {(j.apodo || j.nombre || "").toUpperCase()} {j.dorsal !== undefined && j.dorsal !== null && j.dorsal !== "" ? `(#${j.dorsal})` : ""}
                          </span>
                          {posSimplificada && (
                            <span style={{ fontSize: "9px", color: "#64748b", fontWeight: 700 }}>
                              {posSimplificada}
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* SECCIÓN 3: MINUTAJE Y OBSERVACIONES POR DEPORTISTA */}
              <div style={{ background: "#fdf4ff", padding: "14px", borderRadius: "10px", border: "1px solid #f5d0fe", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontSize: "12px", fontWeight: 900, color: "#7c3aed", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>⏱️</span> 3. Minutos y Observaciones Individuales
                </div>

                {assignedPlayerIds.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "16px", fontSize: "11px", color: "#94a3b8", fontStyle: "italic", background: "#ffffff", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
                    Sin deportistas convocados. Marca deportistas arriba en la sección 👥 Convocatoria para ajustar sus minutos y observaciones.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {jugadoresList
                      .filter((j) => assignedPlayerIds.includes(j.id))
                      .map((j) => {
                        const currentMins = playerMinutesMap[j.id] ?? editDuracion;
                        const currentComment = playerCommentsMap[j.id] || "";
                        const currentType = playerCommentTypesMap[j.id] || "OTR";
                        const posSimplificada = simplifyPosicion(j.posicion);

                        return (
                          <div
                            key={`min-${j.id}`}
                            style={{
                              background: "#ffffff",
                              borderRadius: "8px",
                              border: "1px solid #cbd5e1",
                              padding: "10px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                {j.foto_url ? (
                                  <img
                                    src={j.foto_url || undefined}
                                    alt={(j.apodo || j.nombre || "").toUpperCase()}
                                    style={{ width: "24px", height: "24px", borderRadius: "50%", objectFit: "cover", border: "1px solid #cbd5e1" }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: "24px",
                                      height: "24px",
                                      borderRadius: "50%",
                                      background: "#7c3aed",
                                      color: "#ffffff",
                                      fontSize: "10px",
                                      fontWeight: 900,
                                      display: "grid",
                                      placeItems: "center",
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    {j.nombre.substring(0, 2)}
                                  </div>
                                )}
                                <div>
                                  <div style={{ fontSize: "11px", fontWeight: 900, color: "#0f172a" }}>
                                    {(j.apodo || j.nombre || "").toUpperCase()} {j.dorsal !== undefined && j.dorsal !== null && j.dorsal !== "" ? `(#${j.dorsal})` : ""}
                                  </div>
                                  {posSimplificada && <div style={{ fontSize: "9px", color: "#64748b", fontWeight: 700 }}>{posSimplificada}</div>}
                                </div>
                              </div>

                              {(() => {
                                const cod = (editCodigo || selectedEventDetail?.codigo || "").toLowerCase();
                                const isAmistoso = cod === "paam" || (editTipoCat || "").toLowerCase().includes("amistoso") || (selectedEventDetail?.nombreCompleto || "").toLowerCase().includes("amistoso") || (editOrientacion || "").toLowerCase().includes("amistoso") || (editComentario || "").toLowerCase().includes("amistoso");
                                const isRealMatch = (
                                  ["pa", "pal", "pav", "pl", "pv", "cr", "cc", "paam"].includes(cod) ||
                                  (editTipoCat || selectedEventDetail?.tipoCat || "").toLowerCase().includes("partido") ||
                                  (selectedEventDetail?.nombreCompleto || "").toLowerCase().includes("partido") ||
                                  isAmistoso
                                );

                                const currentTit = playerTitularidadMap[j.id] || (currentMins > 45 ? "T" : "S");

                                return (
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <label style={{ fontSize: "10.5px", fontWeight: 800, color: "#475569" }}>Minutos:</label>
                                    <input
                                      type="number"
                                      value={currentMins}
                                      onChange={(e) => {
                                        const val = Number(e.target.value);
                                        setPlayerMinutesMap((prev) => ({ ...prev, [j.id]: val }));
                                        // Regla: si acumula >45min automáticamente T, sino S
                                        setPlayerTitularidadMap((prev) => ({
                                          ...prev,
                                          [j.id]: val > 45 ? "T" : "S",
                                        }));
                                      }}
                                      style={{ width: "55px", padding: "3px 5px", borderRadius: "5px", border: "1px solid #7c3aed", fontSize: "11px", fontWeight: 900, textAlign: "center" }}
                                    />
                                    <span style={{ fontSize: "10px", fontWeight: 800, color: "#64748b" }}>min</span>

                                    {/* DESPLEGABLE T / S (TITULAR O SUPLENTE) EN EVENTOS DE PARTIDO */}
                                    {isRealMatch && (
                                      <div style={{ display: "flex", alignItems: "center", gap: "3px", marginLeft: "4px" }}>
                                        <select
                                          value={currentTit}
                                          onChange={(e) => {
                                            const val = e.target.value as "T" | "S";
                                            setPlayerTitularidadMap((prev) => ({ ...prev, [j.id]: val }));
                                          }}
                                          style={{
                                            padding: "3px 6px",
                                            borderRadius: "5px",
                                            border: currentTit === "T" ? "1.5px solid #16a34a" : "1.5px solid #d97706",
                                            background: currentTit === "T" ? "#dcfce7" : "#fef3c7",
                                            color: currentTit === "T" ? "#15803d" : "#b45309",
                                            fontSize: "11px",
                                            fontWeight: 900,
                                            cursor: "pointer",
                                            outline: "none",
                                          }}
                                          title={`Rol en partido: ${currentTit === "T" ? "Titular (>45min o manual)" : "Suplente (<=45min o manual)"}`}
                                        >
                                          <option value="T">T (Titular)</option>
                                          <option value="S">S (Suplente)</option>
                                        </select>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "6px", alignItems: "center" }}>
                              <select
                                value={currentType}
                                onChange={(e) => setPlayerCommentTypesMap((prev) => ({ ...prev, [j.id]: e.target.value }))}
                                style={{
                                  padding: "4px",
                                  borderRadius: "5px",
                                  border: "1px solid #cbd5e1",
                                  fontSize: "10px",
                                  fontWeight: 900,
                                  background: "#f8fafc",
                                  color: "#0f172a",
                                }}
                              >
                                {TIPOS_COMENTARIOS_PLANIF.map((t) => (
                                  <option key={t.id} value={t.id}>{t.label}</option>
                                ))}
                              </select>

                              <input
                                type="text"
                                value={currentComment}
                                onChange={(e) => setPlayerCommentsMap((prev) => ({ ...prev, [j.id]: e.target.value }))}
                                placeholder="Añadir comentario / observación para este deportista..."
                                style={{
                                  padding: "5px 8px",
                                  borderRadius: "5px",
                                  border: "1px solid #cbd5e1",
                                  fontSize: "10.5px",
                                  width: "100%",
                                  outline: "none",
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            {/* BOTONES INFERIORES ACCIONES DEL MODAL */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e2e8f0", paddingTop: "14px", marginTop: "14px" }}>
              <button
                type="button"
                onClick={() => handleDeleteEvent(selectedEventDetail.id, selectedEventDetail.slotIdx, selectedEventDetail.fecha)}
                style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: "6px", padding: "6px 12px", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}
              >
                🗑️ Eliminar Evento
              </button>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setSelectedEventDetail(null)}
                  style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#475569", borderRadius: "6px", padding: "6px 12px", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ background: "#0284c7", color: "#ffffff", border: "none", borderRadius: "6px", padding: "6px 16px", fontSize: "11px", fontWeight: 900, cursor: "pointer", boxShadow: "0 2px 5px rgba(2,132,199,0.3)" }}
                >
                  💾 Guardar Cambios
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL CREAR NUEVO EVENTO */}
      {showCreateModal && (
        <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "grid", placeItems: "center", padding: "16px" }}>
          <form onSubmit={handleCreateSubmit} style={{ background: "#ffffff", borderRadius: "12px", padding: "20px", maxWidth: "460px", width: "100%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px", marginBottom: "12px" }}>
              <span style={{ fontSize: "12px", fontWeight: 900, color: "#16a34a", textTransform: "uppercase" }}>➕ Nuevo Evento (Sincronizado)</span>
              <button type="button" onClick={() => setShowCreateModal(false)} style={{ border: "none", background: "none", fontSize: "14px", cursor: "pointer", fontWeight: 900 }}>✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "11px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div>
                  <label style={{ fontWeight: 800, display: "block", marginBottom: "3px" }}>Categoría General:</label>
                  <select value={formTipoCat} onChange={(e) => { setFormTipoCat(e.target.value); if (e.target.value === "gimnasio") setFormCodigo("Gim"); else if (e.target.value === "partido") setFormCodigo("Pa"); else if (e.target.value === "charla") setFormCodigo("VD"); else setFormCodigo("Co"); }} style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px" }}>
                    <option value="entrenamiento">⚽ Coadyuvante / Optimizador (Co/Op)</option>
                    <option value="gimnasio">🏋️ Fuerza / Gimnasio (Gim)</option>
                    <option value="partido">🏆 Partido Oficial (Pa/PAL/PAV)</option>
                    <option value="charla">📹 Charla / Vídeo (VD)</option>
                    <option value="readaptacion">🏥 Readaptación (Red)</option>
                    <option value="viaje">🚌 Viaje / Desplazamiento (Vi)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontWeight: 800, display: "block", marginBottom: "3px" }}>Código Planificación:</label>
                  <input type="text" value={formCodigo} onChange={(e) => setFormCodigo(e.target.value)} placeholder="ej. Co, Op, Gim, Pa" style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px" }} />
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 800, display: "block", marginBottom: "3px" }}>Orientación Táctica / Notas de Sesión:</label>
                <input type="text" value={formOrientacion} onChange={(e) => setFormOrientacion(e.target.value)} placeholder="ej. Salida de presión y 5v5" style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px" }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                <div>
                  <label style={{ fontWeight: 800, display: "block", marginBottom: "3px" }}>Fecha:</label>
                  <input type="date" value={formFecha} onChange={(e) => setFormFecha(e.target.value)} style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px" }} />
                </div>
                <div>
                  <label style={{ fontWeight: 800, display: "block", marginBottom: "3px" }}>Hora Inicio:</label>
                  <input type="text" value={formHora} onChange={(e) => setFormHora(e.target.value)} placeholder="HH:MM" style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px" }} />
                </div>
                <div>
                  <label style={{ fontWeight: 800, display: "block", marginBottom: "3px" }}>Duración (min):</label>
                  <input type="number" value={formDuracion} onChange={(e) => setFormDuracion(Number(e.target.value))} style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px" }} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div>
                  <label style={{ fontWeight: 800, display: "block", marginBottom: "3px" }}>Lugar / Instalación:</label>
                  <input type="text" value={formLugar} onChange={(e) => setFormLugar(e.target.value)} placeholder="Pabellón Principal" style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px" }} />
                </div>
                <div>
                  <label style={{ fontWeight: 800, display: "block", marginBottom: "3px" }}>Carga Estimada:</label>
                  <input type="text" value={formCarga} onChange={(e) => setFormCarga(e.target.value)} placeholder="7.5 AU" style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px" }} />
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 800, display: "block", marginBottom: "3px" }}>Comentarios / Notas:</label>
                <input type="text" value={formComentario} onChange={(e) => setFormComentario(e.target.value)} placeholder="Notas metodológicas o de sesión" style={{ width: "100%", padding: "6px", border: "1px solid #cbd5e1", borderRadius: "6px" }} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
              <button type="button" onClick={() => setShowCreateModal(false)} style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "6px 12px", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}>Cancelar</button>
              <button type="submit" style={{ background: "#16a34a", color: "#ffffff", border: "none", borderRadius: "6px", padding: "6px 14px", fontSize: "11px", fontWeight: 900, cursor: "pointer" }}>Guardar Evento</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
