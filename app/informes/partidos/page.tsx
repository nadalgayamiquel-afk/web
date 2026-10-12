"use client";

import { getTacticalPosScore, comparePlayersByTacticalPosition } from "@/app/lib/posiciones";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useReportClubInfo } from "@/app/lib/useReportClubInfo";
import { useClubConfig } from "@/app/lib/useClubConfig";
import Link from "next/link";
import { getReportePartidosData, saveReportePartidosPlayerMinute, saveMinutosJugadorEvento, cleanEmptySessions } from "@/app/actions";
import { findRivalEscudoUrl, getStoredRivales, RivalConfig, normalizeTeamName } from "@/app/lib/rivales";

// Interfaces
interface Jugador {
  id: string;
  nombre: string;
  apodo?: string | null;
  dorsal?: number | null;
  posicion?: string | null;
  estado?: string | null;
  activo?: boolean | null;
  foto_url?: string | null;
}

interface SesionDia {
  id?: string;
  fecha: string;
  periodo?: string | null;
  subperiodo?: string | null;
  semana?: number | null;
  md?: string | null;
  rival?: string | null;
  competicion?: string | null;
  evento_am?: string | null;
  evento_pm?: string | null;
  tipo?: string | null;
  tipo_de_evento?: string | null;
  duracion?: number | null;
  carga?: number | string | null;
  resultado?: string | null;
  local_visitante?: string | null;
}

interface EstadoDiario {
  id?: string;
  jugador_id: string;
  sesion_dia_id: string;
  fecha?: string;
  disponibilidad?: string | null;
  tipo_de_evento?: string | null;
  realiza_evento?: string | null;
  duracion_evento?: number | null;
  minutos_partido?: number | null;
  minutos_jugados?: number | null;
}

interface PartidoMatch {
  id: string;
  fecha: string;
  semana: number;
  jornadaNum?: number | null;
  jornadaLabel?: string | null;
  competicionTipo: "LIGA" | "AMISTOSO" | "COPA_REY" | "COPA_CATALUNYA";
  competicionLabel: string;
  rival: string;
  localVisitante: "L" | "V" | "-";
  resultado?: string;
  duracionMinutos: number;
  esFuturo: boolean;
  sesionRef: SesionDia;
}



const NON_MATCH_WORDS = [
  "MOVILIDAD", "ADAPT", "ISO", "CORE", "HIIT", "CORRER", "FULL BODY",
  "GIMNASIO", "CHARLA", "CIRCUITO", "VIDEO", "RUTINA", "TEST", "DESCANSO",
  "VIAJE", "RECUPERACION", "PRE", "POST", "FUERZA", "TRABAJO", "REHAB", "READAPTACION"
];

function isNonMatchComment(str?: string | null): boolean {
  if (!str) return true;
  const s = str.trim().toUpperCase();
  if (s.length < 2) return true;
  return NON_MATCH_WORDS.some((w) => s.includes(w));
}

export type MatchOutcomeType = "VICTORIA" | "EMPATE" | "DERROTA" | "PENDIENTE" | "SIN_DATOS";

export function getResultBadge(
  res?: string,
  localVisitante?: "L" | "V" | "-",
  esFuturo?: boolean
): { bg: string; text: string; border: string; label: string; marcador: string; outcome: MatchOutcomeType; tooltip: string } {
  if (!res || !res.trim()) {
    if (esFuturo) {
      return { bg: "#f1f5f9", text: "#64748b", border: "#e2e8f0", label: "Próximo", marcador: "", outcome: "PENDIENTE", tooltip: "Partido por disputar" };
    }
    return { bg: "#f8fafc", text: "#94a3b8", border: "#cbd5e1", label: "Sin datos", marcador: "", outcome: "SIN_DATOS", tooltip: "Partido disputado sin marcador. Haz clic para añadir resultado." };
  }

  const raw = res.trim();
  const clean = raw.toUpperCase();

  // Detección por marcador numérico (ej. 2-1, 1-0, 0-0, Victoria 2-1, 2:1)
  const match = clean.match(/(\d+)\s*[-:]\s*(\d+)/);
  if (match) {
    const goalsA = parseInt(match[1], 10);
    const goalsB = parseInt(match[2], 10);
    const scoreStr = `${goalsA} - ${goalsB}`;

    if (goalsA === goalsB) {
      return {
        bg: "#fef9c3",
        text: "#854d0e",
        border: "#fde047",
        label: `E · ${scoreStr}`,
        marcador: scoreStr,
        outcome: "EMPATE",
        tooltip: `Empate (${scoreStr})`,
      };
    }

    const isVisitante = localVisitante === "V";
    let weWon = isVisitante ? goalsB > goalsA : goalsA > goalsB;

    if (clean.includes("VICT") || clean.includes("GAN")) weWon = true;
    if (clean.includes("DERR") || clean.includes("PERD")) weWon = false;

    if (weWon) {
      return {
        bg: "#dcfce7",
        text: "#15803d",
        border: "#86efac",
        label: `V · ${scoreStr}`,
        marcador: scoreStr,
        outcome: "VICTORIA",
        tooltip: `Victoria (${scoreStr}) ${isVisitante ? "como Visitante" : "como Local"}`,
      };
    } else {
      return {
        bg: "#fee2e2",
        text: "#b91c1c",
        border: "#fca5a5",
        label: `D · ${scoreStr}`,
        marcador: scoreStr,
        outcome: "DERROTA",
        tooltip: `Derrota (${scoreStr}) ${isVisitante ? "como Visitante" : "como Local"}`,
      };
    }
  }

  // Detección por letras directas (V, E, D, G, P, Victoria, Empate, Derrota)
  if (clean === "V" || clean.startsWith("VICT") || clean.startsWith("GAN")) {
    return { bg: "#dcfce7", text: "#15803d", border: "#86efac", label: "Victoria", marcador: "V", outcome: "VICTORIA", tooltip: "Victoria (Ganamos)" };
  }
  if (clean === "E" || clean.startsWith("EMP")) {
    return { bg: "#fef9c3", text: "#854d0e", border: "#fde047", label: "Empate", marcador: "E", outcome: "EMPATE", tooltip: "Empate (Empatamos)" };
  }
  if (clean === "D" || clean === "P" || clean.startsWith("DERR") || clean.startsWith("PERD")) {
    return { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5", label: "Derrota", marcador: "D", outcome: "DERROTA", tooltip: "Derrota (Perdimos)" };
  }

  return { bg: "#f1f5f9", text: "#475569", border: "#cbd5e1", label: raw, marcador: raw, outcome: "SIN_DATOS", tooltip: "Resultado: " + raw };
}

export default function ReportPartidosPage() {
  const { clubName: activeTeam, clubShield, activeTemporada, setActiveTemporada, setActiveTeam, setSeasonAndTeam, availableTemporadas } = useReportClubInfo();
  const globalClubConfig = useClubConfig();

  const activeSeasonMatch = useMemo(() => {
    return (
      availableTemporadas.find(
        (t) => t.equipo.toLowerCase() === activeTeam.toLowerCase() && t.temporada === activeTemporada
      ) || availableTemporadas.find((t) => t.temporada === activeTemporada)
    );
  }, [availableTemporadas, activeTeam, activeTemporada]);

  const defaultLigaLabel = useMemo(() => {
    const l = activeSeasonMatch?.liga || (activeSeasonMatch as any)?.categoria || globalClubConfig?.categoria || "";
    if (!l) return "Liga";
    if (/primera\s*federaci/i.test(l) || /1\s*rfef/i.test(l)) return "1RFEF";
    if (/segunda\s*federaci/i.test(l) || /2\s*rfef/i.test(l)) return "2RFEF";
    if (/tercera\s*federaci/i.test(l) || /3\s*rfef/i.test(l)) return "3RFEF";
    return l;
  }, [activeSeasonMatch, globalClubConfig]);

  const seasonCategoriaFullName = useMemo(() => {
    return activeSeasonMatch?.liga || activeSeasonMatch?.grupo || globalClubConfig?.categoria || defaultLigaLabel;
  }, [activeSeasonMatch, globalClubConfig, defaultLigaLabel]);

  const [partidosEstadoFiltro, setPartidosEstadoFiltro] = useState<"TODOS" | "JUGADOS">("TODOS");
  const [jornadasMap, setJornadasMap] = useState<Record<string, number>>({});

  
  // LIMPIEZA DE CACHÉ FANTASMA
  useEffect(() => {
    try {
      const raw = localStorage.getItem('player_event_minutes_map_v1');
      if (raw) {
        let map = JSON.parse(raw);
        let changed = false;
        const keysToDelete = [];
        for (const k of Object.keys(map)) {
          if ((k.includes('2026-09-06') || k.includes('2026-08-22')) && (k.toLowerCase().includes('oussama') || k.toLowerCase().includes('igle') || k.toLowerCase().includes('bilal') || k.toLowerCase().includes('roger') || k.includes('44a17d58') || k.includes('e218da66') || k.includes('c10999d2') || k.includes('8a71c6f6') || k.includes('d0444862'))) {
            keysToDelete.push(k);
          }
        }
        for (const k of keysToDelete) {
          delete map[k];
          changed = true;
        }
        if (keysToDelete.length > 0) {
          for (const k of keysToDelete) {
             delete map[k];
          }
          localStorage.setItem('player_event_minutes_map_v1', JSON.stringify(map));
          console.log('Borrados datos fantasma:', keysToDelete);
        } }
    } catch(e){}
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

  // Configuración del Club para escudos dinámicos
  const [clubConfig, setClubConfig] = useState<{ nombreClub: string; escudoUrl?: string; temporadaActiva: string }>({
    nombreClub: "CE EUROPA",
    escudoUrl: "/ce-europa.png",
    temporadaActiva: "2026/27",
  });

  // Lista y configuración de escudos de rivales
  const [rivalesList, setRivalesList] = useState<RivalConfig[]>(() => {
    return getStoredRivales();
  });

  // Vista activa: matriz de minutos o análisis por rivales
  const [activeView, setActiveView] = useState<"matriz" | "rivales">("matriz");
  const [rivalFiltro, setRivalFiltro] = useState<string>("TODOS");
  const [rivalSearch, setRivalSearch] = useState<string>("");
  const [excludedRivales, setExcludedRivales] = useState<string[]>([]);
  const [showRivalPicker, setShowRivalPicker] = useState<boolean>(false);
  const [rivalSearchText, setRivalSearchText] = useState<string>("");
  const rivalDropdownRef = useRef<HTMLDivElement>(null);
  const playerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rivalDropdownRef.current && !rivalDropdownRef.current.contains(event.target as Node)) {
        setShowRivalPicker(false);
      }
      if (playerDropdownRef.current && !playerDropdownRef.current.contains(event.target as Node)) {
        setShowPlayerPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    try {
      const savedClub = localStorage.getItem("custom_club_config");
      if (savedClub) {
        const parsed = JSON.parse(savedClub);
        setClubConfig(parsed);
        if (parsed.temporadaActiva) setActiveTemporada(parsed.temporadaActiva);
      }
      const savedTeam = localStorage.getItem("active_team");
      if (savedTeam) setActiveTeam(savedTeam);
      const savedSeasons = localStorage.getItem("active_seasons");
      if (savedSeasons) {
        const arr = JSON.parse(savedSeasons);
        if (Array.isArray(arr) && arr.length > 0) setActiveTemporada(arr[0]);
      }
    } catch (e) {}

    const handleSyncRivales = () => {
      setRivalesList(getStoredRivales());
      try {
        const savedClub = localStorage.getItem("custom_club_config");
        if (savedClub) setClubConfig(JSON.parse(savedClub));
      } catch (e) {}
    };
    window.addEventListener("rivales_updated", handleSyncRivales);
    window.addEventListener("storage", handleSyncRivales);
    window.addEventListener("club_config_updated", handleSyncRivales);
    return () => {
      window.removeEventListener("rivales_updated", handleSyncRivales);
      window.removeEventListener("storage", handleSyncRivales);
      window.removeEventListener("club_config_updated", handleSyncRivales);
    };
  }, []);

  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [sesiones, setSesiones] = useState<SesionDia[]>([]);
  const [estados, setEstados] = useState<EstadoDiario[]>([]);
  const [gpsList, setGpsList] = useState<any[]>([]);
  const [minutesMap, setMinutesMap] = useState<Record<string, any>>({});
  const [playerEventsMap, setPlayerEventsMap] = useState<Record<string, string>>({});
  const [bloquesMap, setBloquesMap] = useState<Record<string, any>>({});
  const [rivalMap, setRivalMap] = useState<Record<string, { rival: string; evento: string }>>({});

  // Filtros
  const [competicionFiltro, setCompeticionFiltro] = useState<string>("TODOS");
  const [localFiltro, setLocalFiltro] = useState<"TODOS" | "L" | "V">("TODOS");
  const [excludedPlayerIds, setExcludedPlayerIds] = useState<string[]>([]);
  const [showPlayerPicker, setShowPlayerPicker] = useState<boolean>(false);
  const [playerSearchText, setPlayerSearchText] = useState<string>("");
  const [ordenFiltro, setOrdenFiltro] = useState<"posicion" | "minutos_desc" | "minutos_asc" | "default">("posicion");
  const [partidosExcluidos, setPartidosExcluidos] = useState<Set<string>>(new Set());
  const [reportComment, setReportComment] = useState<string>("");

  // Fecha del informe
  const [reportDate, setReportDate] = useState<string>(() => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    return `${dayNames[d.getDay()]} ${dd}/${mm}/${yyyy}`;
  });

  const todayStr = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, [activeTeam]);

  // Carga de datos idéntica a Reporte Anual + GPS data
  useEffect(() => {
    const loadAllData = async () => {
      try {
        setLoading(true);

        let localMatchRes: Record<string, string> = {};
        let localMinutesMap: Record<string, any> = {};
        let localPlayerEvMap: Record<string, string> = {};
        let localBloquesMap: Record<string, any> = {};
        let localRivalMap: Record<string, any> = {};
        let localDaysList: any[] = [];
        let localGpsList: any[] = [];

        try {
          const rawMatchRes = localStorage.getItem("match_results_map_v1");
          if (rawMatchRes) {
            try { localMatchRes = JSON.parse(rawMatchRes); } catch (e) {}
          }
          const rawMinutes = localStorage.getItem("player_event_minutes_map_v1") || localStorage.getItem("minutos_por_jugador_v1");
          if (rawMinutes) localMinutesMap = JSON.parse(rawMinutes);

          const rawEventsMap = localStorage.getItem("player_events_map_v1");
          if (rawEventsMap) localPlayerEvMap = JSON.parse(rawEventsMap);

          const rawBloques = localStorage.getItem("eventos_bloques_map_v5") || localStorage.getItem("eventos_bloques_map_v1");
          if (rawBloques) localBloquesMap = JSON.parse(rawBloques);

          const rawRival = localStorage.getItem("rival_evento_map_v1");
          if (rawRival) localRivalMap = JSON.parse(rawRival);

          const rawDays = localStorage.getItem("planificacion_days_v5") || localStorage.getItem("planificacion_days_v4") || localStorage.getItem("planificacion_days_v3") || localStorage.getItem("planificacion_days_v2") || localStorage.getItem("planificacion_days_v1");
          if (rawDays) localDaysList = JSON.parse(rawDays);

          const rawGps = localStorage.getItem("gps_datos_map_v1") || localStorage.getItem("gps_datos_cache");
          if (rawGps) {
            const parsedG = JSON.parse(rawGps);
            if (Array.isArray(parsedG)) localGpsList = parsedG;
            else if (typeof parsedG === "object") localGpsList = Object.values(parsedG);
          }

          const savedComment = localStorage.getItem("report_partidos_comment");
          if (savedComment) setReportComment(savedComment);

          const rawJornadas = localStorage.getItem("partidos_jornadas_map_v1");
          if (rawJornadas) setJornadasMap(JSON.parse(rawJornadas));
        } catch (e) {}

        const res = await getReportePartidosData();

        const rawJugList = res?.jugadores || [];
        const jugList = rawJugList.filter((j: any) => isPlayerOfTeam(j, activeTeam));

        const sesionesMap = new Map<string, SesionDia>();
        (res.sesiones || []).forEach((s: any) => {
          if (s && s.fecha) sesionesMap.set(s.fecha, s);
        });

        // Olvidar días, rivales y bloques previos al 01/10/2026
        localDaysList = (localDaysList || []).filter((d: any) => d && d.fecha && d.fecha >= "2026-10-01");
        Object.keys(localBloquesMap).forEach((k) => {
          const b = localBloquesMap[k];
          const f = b?.fecha || (k.includes("_slot_") ? k.split("_slot_")[0] : "");
          if (f && f < "2026-10-01") delete localBloquesMap[k];
        });
        Object.keys(localRivalMap).forEach((k) => {
          if (k < "2026-10-01") delete localRivalMap[k];
        });
        Object.keys(localMatchRes).forEach((k) => {
          if (k < "2026-10-01") delete localMatchRes[k];
        });

        localDaysList.forEach((d: any) => {
          if (d && d.fecha && d.fecha >= "2026-10-01") {
            const existing = sesionesMap.get(d.fecha) as any;
            sesionesMap.set(d.fecha, {
              ...(existing || {}),
              ...d,
              id: existing?.id || d.id || `ses_${d.fecha}`,
              fecha: d.fecha,
              semana: d.semana ?? existing?.semana ?? null,
              evento: d.evento || existing?.evento || "",
              evento_am: d.evento_am || d.evento || d.evento_1 || existing?.evento_am || existing?.evento || "",
              evento_pm: d.evento_pm || d.evento_2 || existing?.evento_pm || "",
              duracion: d.duracion || existing?.duracion || 90,
              rival: d.rival || existing?.rival || localRivalMap[d.fecha]?.rival || "",
              resultado: localMatchRes[d.fecha] || localMatchRes[d.id] || d.resultado_partido || d.resultado || existing?.resultado_partido || existing?.resultado || ((d.comentario_microciclo || d.comentario || "").match(/\b(\d+)\s*[-:]\s*(\d+)\b/)?.[0]) || "",
              resultado_partido: localMatchRes[d.fecha] || localMatchRes[d.id] || d.resultado_partido || existing?.resultado_partido || d.resultado || ((d.comentario_microciclo || d.comentario || "").match(/\b(\d+)\s*[-:]\s*(\d+)\b/)?.[0]) || "",
              local_visitante: d.local_visitante || existing?.local_visitante || "",
              md: d.md || existing?.md || "",
            } as any);
          }
        });

        Object.keys(localBloquesMap).forEach((k) => {
          const b = localBloquesMap[k];
          if (!b) return;
          const fecha = b.fecha || (k.includes("_slot_") ? k.split("_slot_")[0] : "");
          if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !sesionesMap.has(fecha)) {
            sesionesMap.set(fecha, {
              id: b.id || `ses_${fecha}`,
              fecha: fecha,
              semana: null,
              evento: b.tipo || "",
              evento_am: b.tipo || "",
              evento_pm: null,
              evento_1: b.tipo || null,
              duracion: b.duracion ? Number(b.duracion) : 90,
              rival: b.rival || (isPartidoCode(b.tipo) ? b.comentario : "") || "",
              md: "",
            } as any);
          }
        });

        Array.from(sesionesMap.values()).forEach((s: any) => {
          for (let slot = 0; slot < 6; slot++) {
            const b = localBloquesMap[`${s.fecha}_slot_${slot}`] || (s.id ? localBloquesMap[`${s.id}_slot_${slot}`] : null);
            if (b && b.tipo) {
              const bTipo = String(b.tipo).trim().toUpperCase();
              if (!s.evento_am || s.evento_am.trim() === "" || s.evento_am === "D" || bTipo.startsWith("PA") || bTipo.includes("PARTIDO")) {
                s.evento_am = b.tipo;
              }
              if (b.duracion && (!s.duracion || s.duracion === 90)) {
                s.duracion = Number(b.duracion);
              }
              if (b.rival && (!s.rival || s.rival === "")) {
                s.rival = b.rival;
              } else if (isPartidoCode(b.tipo) && b.comentario && (!s.rival || s.rival === "") && !isNonMatchComment(b.comentario)) {
                s.rival = b.comentario;
              }
              if (b.resultado_partido || b.resultado) {
                s.resultado = b.resultado_partido || b.resultado;
                s.resultado_partido = b.resultado_partido || b.resultado;
              }
              if (b.local_visitante) {
                s.local_visitante = b.local_visitante;
              }
            }
          }
        });

        // Asegurar que 2026-07-26 quede completamente como día sin eventos
        const s26 = sesionesMap.get("2026-07-26") as any;
        if (s26) {
          s26.evento_am = "D";
          s26.evento = "D";
          s26.md = "";
          s26.duracion = 0;
          s26.rival = "";
        }

        const finalJugList = jugList.length > 0 ? jugList : rawJugList;
        const allGps = (res?.gps || []).concat(localGpsList);

        // Merge bloquesMap de Supabase
        if (res?.bloquesMap && Object.keys(res.bloquesMap).length > 0) {
          localBloquesMap = { ...res.bloquesMap, ...localBloquesMap };
        }

        // Merge minutos_jugador_evento de Supabase — tiene prioridad sobre localStorage
        if (res?.minutosJugadorEvento && Object.keys(res.minutosJugadorEvento).length > 0) {
          localMinutesMap = { ...localMinutesMap, ...res.minutosJugadorEvento };
          try {
            localStorage.setItem("player_event_minutes_map_v1", JSON.stringify(localMinutesMap));
          } catch (e) {}
        }

        setJugadores(finalJugList as Jugador[]);
        setSesiones(Array.from(sesionesMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha)));
        setEstados((res.estados || []) as EstadoDiario[]);
        setGpsList(allGps);
        setMinutesMap(localMinutesMap);
        setPlayerEventsMap(localPlayerEvMap);
        setBloquesMap(localBloquesMap);
        setRivalMap(localRivalMap);
      } catch (err) {
        console.error("Error cargando datos de partidos:", err);
      } finally {
        setLoading(false);
      }
    };

    loadAllData();
  }, []);

  // Escuchar eventos en vivo para sincronización reactiva automática
  useEffect(() => {
    const handleLiveSync = () => {
      try {
        // Leer minutos de localStorage (merge simple: v1 primero, luego el nuevo lo sobrescribe)
        let mergedMin: Record<string, any> = {};
        const rawMinV1 = localStorage.getItem("minutos_por_jugador_v1");
        const rawMinNew = localStorage.getItem("player_event_minutes_map_v1");
        if (rawMinV1) try { mergedMin = { ...mergedMin, ...JSON.parse(rawMinV1) }; } catch(e){}
        if (rawMinNew) try { mergedMin = { ...mergedMin, ...JSON.parse(rawMinNew) }; } catch(e){}

        if (Object.keys(mergedMin).length > 0) {
           setMinutesMap((prev) => ({ ...prev, ...mergedMin }));
        }

        const rawEvents = localStorage.getItem("player_events_map_v1");
        if (rawEvents) setPlayerEventsMap(JSON.parse(rawEvents));

        const rawBloques = localStorage.getItem("eventos_bloques_map_v5") || localStorage.getItem("eventos_bloques_map_v1");
        if (rawBloques) setBloquesMap(JSON.parse(rawBloques));

        const rawGps = localStorage.getItem("gps_datos_map_v1");
        if (rawGps) {
          const parsed = JSON.parse(rawGps);
          if (Array.isArray(parsed)) setGpsList((prev) => [...prev, ...parsed]);
          else if (typeof parsed === "object") setGpsList((prev) => [...prev, ...Object.values(parsed)]);
        }
      } catch (e) {}
    };

    window.addEventListener("storage", handleLiveSync);
    window.addEventListener("focus", handleLiveSync);
    window.addEventListener("minutes_updated", handleLiveSync);
    window.addEventListener("gps_updated", handleLiveSync);
    return () => {
      window.removeEventListener("storage", handleLiveSync);
      window.removeEventListener("focus", handleLiveSync);
      window.removeEventListener("minutes_updated", handleLiveSync);
      window.removeEventListener("gps_updated", handleLiveSync);
    };
  }, []);

  const handleSyncMinutosAutomaticamente = async () => {
    try {
      setIsSyncing(true);
      const res = await getReportePartidosData();
      if (res.gps) {
        setGpsList((prev) => {
          const map = new Map<string, any>();
          [...res.gps, ...prev].forEach((g: any) => {
            if (g && g.fecha && (g.jugador_id || g.jugador)) {
              map.set(`${g.jugador_id || g.jugador}_${g.fecha}`, g);
            }
          });
          return Array.from(map.values());
        });
      }
      if (res.estados) setEstados(res.estados);
      if (res.bloquesMap) {
        setBloquesMap((prev) => ({ ...res.bloquesMap, ...prev }));
      }
      if (res.minutosJugadorEvento) {
        setMinutesMap((prev) => ({ ...prev, ...res.minutosJugadorEvento }));
      }
      if (res.sesiones) {
        setSesiones((prev) => {
          const map = new Map<string, SesionDia>();
          prev.forEach((s) => map.set(s.fecha, s));
          res.sesiones.forEach((s: any) => {
            if (s?.fecha) map.set(s.fecha, { ...(map.get(s.fecha) || {}), ...s });
          });
          return Array.from(map.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
        });
      }

      // Merge localStorage minutes (simple: v1 base, luego el nuevo sobrescribe)
      try {
        let mergedMin: Record<string, any> = {};
        const rawMinV1 = localStorage.getItem("minutos_por_jugador_v1");
        const rawMinNew = localStorage.getItem("player_event_minutes_map_v1");
        if (rawMinV1) try { mergedMin = { ...mergedMin, ...JSON.parse(rawMinV1) }; } catch(e){}
        if (rawMinNew) try { mergedMin = { ...mergedMin, ...JSON.parse(rawMinNew) }; } catch(e){}
        if (Object.keys(mergedMin).length > 0) setMinutesMap((prev) => ({ ...prev, ...mergedMin }));
      } catch (e) {}
    } catch (err) {
      console.error("Error al sincronizar minutos automáticamente:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdatePlayerMinutes = async (
    j: Jugador,
    p: PartidoMatch,
    currentMins: number,
    currentTitular: boolean
  ) => {
    if (j.id === "TEAM" || p.esFuturo) return;

    const promptMsg = `Minutos de ${(j.apodo || j.nombre || "").toUpperCase()} vs ${p.rival} (${p.fecha}):\n(Introduce los minutos jugados, ej: 90, 45, 0)`;
    const input = window.prompt(promptMsg, String(currentMins ?? 0));
    if (input === null) return;
    const num = parseInt(input.trim(), 10);
    if (isNaN(num) || num < 0) return;

    const newTitular = num > 45 ? "T" : (num > 0 ? "S" : "");

    // 1. Actualizar estado local reactivo
    const key = `${j.id}_${p.fecha}`;
    const keySes = p.sesionRef?.id ? `${j.id}_${p.sesionRef.id}` : null;
    const nextMinMap = { ...minutesMap };
    nextMinMap[key] = { minutos: num, titularidad: newTitular };
    if (keySes) nextMinMap[keySes] = { minutos: num, titularidad: newTitular };
    setMinutesMap(nextMinMap);

    // 2. Guardar en localStorage y emitir evento
    try {
      localStorage.setItem("player_event_minutes_map_v1", JSON.stringify(nextMinMap));
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("minutes_updated"));
    } catch (e) {}

    // 3. Persistir en Supabase (DOBLE ESCRITURA: minutos_jugador_evento + estado_diario_jugador)
    try {
      await saveReportePartidosPlayerMinute(j.id, p.fecha, num, newTitular as any);
    } catch (e) {}

    // 4. TAMBIÉN guardar en minutos_jugador_evento (la tabla principal de minutos)
    try {
      await saveMinutosJugadorEvento([{
        jugador_id: j.id,
        fecha: p.fecha,
        evento_id: p.id || "Pa",
        minutos: num,
        duracion: num,
      }]);
    } catch (e) {}
  };

  const handleCommentChange = (text: string) => {
    setReportComment(text);
    try {
      localStorage.setItem("report_partidos_comment", text);
    } catch (e) {}
  };

  // Helper para comparar identificadores de jugador (id, nombre, apodo) - EXACTO DE REPORTE ANUAL
  function isPlayerMatch(val: string | null | undefined, jugador: { id: string; nombre: string; apodo?: string | null }): boolean {
    if (!val || !jugador) return false;
    const clean = String(val).trim().toLowerCase();
    const jId = String(jugador.id || "").trim().toLowerCase();
    const jNombre = String(jugador.nombre || "").trim().toLowerCase();
    const jApodo = String(jugador.apodo || "").trim().toLowerCase();

    if (clean === jId || clean === jNombre || (jApodo && clean === jApodo)) return true;

    // Alias específicos conocidos (Manel Busquets / Busi / Bussi / Bsuquets)
    if (
      (clean === "busi" || clean === "bussi" || clean === "busquets" || clean === "bsuquets" || clean === "manel") &&
      (jApodo === "busi" || jApodo === "bussi" || jNombre.includes("busquet") || jNombre.includes("bsuquet") || jId === "busi")
    ) {
      return true;
    }

    // Alias específico (Puli / Pulido / Óscar Pulido)
    if (
      (clean.includes("puli") || clean.includes("pulido")) &&
      (jApodo.includes("puli") || jApodo.includes("pulido") || jNombre.includes("puli") || jNombre.includes("pulido") || jId.includes("puli") || jId.includes("pulido"))
    ) {
      return true;
    }

    const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const pClean = normalize(clean);
    const pNombre = normalize(jNombre);
    const pApodo = normalize(jApodo);

    if (pClean === pNombre || (pApodo && pClean === pApodo)) return true;
    if (pNombre.split(/[^a-z0-9]/).some((part: string) => part === clean && part.length > 2)) return true;
    if (pApodo.split(/[^a-z0-9]/).some((part: string) => part === clean && part.length > 2)) return true;

    return false;
  }

  function isPartidoCode(code: string) {
    const c = (code || "").trim().toUpperCase();
    return ["PL", "PAL", "PV", "PAV", "PA", "PAAM", "PARTIDO", "PARTIDO AMISTOSO"].includes(c);
  }

  // Helper de duración de sesión (idéntico al Reporte Anual)
  function getMinutosSesion(s?: SesionDia): number {
    if (!s) return 0;
    if (s.fecha && bloquesMap) {
      for (let slot = 0; slot < 6; slot++) {
        const b = bloquesMap[`${s.fecha}_slot_${slot}`] || (s.id ? bloquesMap[`${s.id}_slot_${slot}`] : null);
        if (b && (isPartidoCode(b.tipo) || String(b.tipo || "").toUpperCase().includes("PA"))) {
          if (b.duracion && Number(b.duracion) > 0) return Number(b.duracion);
        }
      }
    }
    const raw = (s as any).duracion ?? (s as any).duracion_evento ?? (s as any).minutos;
    if (raw !== undefined && raw !== null && raw !== "") {
      const num = Number(raw);
      if (!isNaN(num) && num > 0) return num;
    }
    return 90;
  }

  // Indexación por fecha de playerEventsMap para evitar escaneos O(N)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, Array<{ prefix: string; val: string }>>();
    if (!playerEventsMap) return map;
    for (const k of Object.keys(playerEventsMap)) {
      const idx = k.lastIndexOf("_");
      if (idx > 0) {
        const prefix = k.substring(0, idx);
        const datePart = k.substring(idx + 1);
        let arr = map.get(datePart);
        if (!arr) {
          arr = [];
          map.set(datePart, arr);
        }
        arr.push({ prefix, val: playerEventsMap[k] });
      }
    }
    return map;
  }, [playerEventsMap]);

  // Indexación por fecha de minutesMap para evitar escaneos O(N)
  const minutesByDate = useMemo(() => {
    const map = new Map<string, Array<{ prefix: string; val: any }>>();
    if (!minutesMap) return map;
    for (const k of Object.keys(minutesMap)) {
      const idx = k.lastIndexOf("_");
      if (idx > 0) {
        const prefix = k.substring(0, idx);
        const datePart = k.substring(idx + 1);
        let arr = map.get(datePart);
        if (!arr) {
          arr = [];
          map.set(datePart, arr);
        }
        arr.push({ prefix, val: minutesMap[k] });
      }
    }
    return map;
  }, [minutesMap]);

  // Indexación por fecha y sesion_dia_id de estados
  const estadosByDate = useMemo(() => {
    const map = new Map<string, EstadoDiario[]>();
    if (!estados) return map;
    for (const e of estados) {
      const d = (e as any).fecha;
      if (d) {
        let arr = map.get(d);
        if (!arr) {
          arr = [];
          map.set(d, arr);
        }
        arr.push(e);
      }
      if (e.sesion_dia_id) {
        let arr = map.get(e.sesion_dia_id);
        if (!arr) {
          arr = [];
          map.set(e.sesion_dia_id, arr);
        }
        arr.push(e);
      }
    }
    return map;
  }, [estados]);

  // Indexación de datos GPS por fecha
  const gpsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    if (!gpsList || gpsList.length === 0) return map;
    for (const g of gpsList) {
      if (!g || !g.fecha) continue;
      const f = g.fecha;
      let arr = map.get(f);
      if (!arr) {
        arr = [];
        map.set(f, arr);
      }
      arr.push(g);
    }
    return map;
  }, [gpsList]);

  // Helper para verificar asignación a partido optimizado
  function jugadorTieneAsignadoEvento(jugador: { id: string; nombre: string; apodo?: string | null }, fechaStr: string, evCode: string): boolean {
    if (!jugador) return false;
    if (jugador.id === "TEAM") return true;

    // 0. Si ya tiene minutos registrados en minutesMap para esta fecha/evento, está convocado/asignado
    if (minutesMap && typeof minutesMap === "object") {
      for (const [k, val] of Object.entries(minutesMap)) {
        if (!val) continue;
        if (k.includes(fechaStr)) {
          const prefix = k.split(fechaStr)[0].replace(/_$/, "") || k.split("_")[0];
          if (isPlayerMatch(prefix, jugador)) {
            const rawM = (val as any).minutos ?? (val as any).duracion ?? val;
            if (rawM !== undefined && rawM !== null && rawM !== "") {
              return true;
            }
          }
        }
      }
    }

    let assignedStr = "";
    if (playerEventsMap && typeof playerEventsMap === "object") {
      for (const [k, val] of Object.entries(playerEventsMap)) {
        if (!val) continue;
        if (k.includes(fechaStr)) {
          const prefix = k.split(fechaStr)[0].replace(/_$/, "") || k.split("_")[0];
          if (isPlayerMatch(prefix, jugador)) {
            assignedStr = assignedStr ? `${assignedStr}, ${val}` : String(val);
          }
        }
      }
    }

    if (assignedStr.trim()) {
      const cleanEv = evCode.trim().toLowerCase();
      const codesList = assignedStr.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);

      if (cleanEv === "pa" || cleanEv === "paam" || cleanEv === "partido") {
        return codesList.some((c) =>
          c === "pa" || c === "paam" || c === "pal" || c === "pav" || c === "pl" || c === "pv" ||
          c.startsWith("pa") || c.includes("partido")
        );
      }

      return codesList.includes(cleanEv) || codesList.some((c) => c.startsWith(cleanEv) || cleanEv.startsWith(c));
    }


    
    // Si playerEventsMap tiene datos para este día, y el jugador no estaba, entonces estrictamente no está asignado.
    // Solo caemos en BBDD si playerEventsMap no tiene NINGÚN dato para este día (ej: dispositivo nuevo sin caché)
    let dayHasAnyEvents = false;
    if (playerEventsMap) {
      for (const k of Object.keys(playerEventsMap)) {
        if (k.includes(fechaStr) && playerEventsMap[k]) {
          dayHasAnyEvents = true;
          break;
        }
      }
    }
    if (dayHasAnyEvents) return false;

    
    // Si no hay asignación en playerEventsMap, comprobar en estado diario de Supabase/BBDD indexado
    const dayEstados = estadosByDate.get(fechaStr);
    if (dayEstados && dayEstados.length > 0) {
      const st = dayEstados.find((e) => {
        const rawJid = String(e.jugador_id || (e as any).jugador || "");
        return isPlayerMatch(rawJid, jugador);
      });

      if (st) {
        const realiza = String((st as any).realiza_evento || "").trim().toUpperCase();
        const tipoDeEv = String((st as any).tipo_de_evento || (st as any).evento_asignado || "").trim().toLowerCase();
        const minVal = (st as any).minutos ?? (st as any).duracion_evento;
        if (realiza === "NO" && (minVal === undefined || minVal === null)) return false;
        if (tipoDeEv.includes(evCode.toLowerCase()) || (evCode.toLowerCase() === "pa" && (tipoDeEv.includes("pa") || tipoDeEv.includes("partido")))) {
          return true;
        }
        if ((minVal !== undefined && minVal !== null && Number(minVal) > 0) || (st as any).titularidad) {
          return true;
        }
        return false;
      }
    }

    return false;
  }

  // Helper exacto de cálculo de minutos por jugador en partido (compatibilidad total con player_event_minutes_map_v1, GPS y BBDD)
  // =============================================================================
  // getMinutosJugadorEvento - VERSIÓN LIMPIA Y DEFINITIVA
  // PRIORIDAD: 1) Hardcodes → 2) BBDD (minutesMap con clave jugadorId_fecha_*) → 3) GPS → 4) estado_diario → 5) 0
  // =============================================================================
  function getMinutosJugadorEvento(jugador: { id: string; nombre: string; apodo?: string | null }, sesion: SesionDia): number {
    if (jugador.id === "TEAM") return getMinutosSesion(sesion);
    const fechaStr = sesion.fecha || "";
    const sId = sesion.id;

    // ── HARDCODES ESPECÍFICOS DEL ENTRENADOR ──
    const jName = jugador.nombre.toLowerCase();
    const jApodo = (jugador.apodo || "").toLowerCase();

    if (fechaStr === "2026-09-06" && (jName.includes("oussama") || jApodo.includes("oussama") || jName.includes("igle") || jApodo.includes("igle") || jName.includes("bilal") || jApodo.includes("bilal"))) return 0;
    if (fechaStr === "2026-08-22" && (jName.includes("roger") || jApodo.includes("roger") || jName.includes("peña") || jApodo.includes("peña"))) return 0;
    if (fechaStr === "2026-08-16" && isPlayerMatch("aleix", jugador)) return 60;
    if (isPlayerMatch("puli", jugador)) {
      if (fechaStr === "2026-08-22") return 0;
      if (fechaStr === "2026-08-19") return 90;
    }

    // Identificar bloque específico de partido si existe en la sesión
    const sBloques = bloquesMap ? [
      bloquesMap[`${fechaStr}_slot_0`],
      bloquesMap[`${fechaStr}_slot_1`],
      bloquesMap[`${fechaStr}_slot_2`],
      bloquesMap[`${fechaStr}_slot_3`],
      bloquesMap[`${fechaStr}_slot_4`],
      bloquesMap[`${fechaStr}_slot_5`],
      sId ? bloquesMap[`${sId}_slot_0`] : null,
      sId ? bloquesMap[`${sId}_slot_1`] : null,
      sId ? bloquesMap[`${sId}_slot_2`] : null,
    ].filter(Boolean) : [];
    const matchBlock = sBloques.find((b: any) => {
      const t = (b?.tipo || "").toLowerCase();
      return t === "pa" || t.startsWith("pa") || t.includes("partido");
    });
    const matchBlockId = matchBlock?.id;

    // ── BÚSQUEDA EN minutesMap (incluye BBDD + localStorage mergeado) ──
    // La clave tiene formato: jugadorId_fecha_eventoId o jugadorId_fecha_Pa
    if (minutesMap && typeof minutesMap === "object") {
      let matchMin: number | null = null;
      let fallbackMin: number | null = null;

      for (const [k, val] of Object.entries(minutesMap)) {
        if (!val) continue;

        // ¿La clave pertenece a esta fecha?
        const matchesDate = k.includes(fechaStr) || Boolean(sId && k.includes(sId));
        if (!matchesDate) continue;

        // Extraer el prefijo (jugador ID o nombre) antes de la fecha
        let prefix = "";
        if (k.includes(fechaStr)) {
          prefix = k.split(fechaStr)[0].replace(/_$/, "");
        } else if (sId && k.includes(sId)) {
          prefix = k.split(sId)[0].replace(/_$/, "");
        } else {
          prefix = k.split("_")[0];
        }

        // ¿Es este jugador?
        if (!isPlayerMatch(prefix, jugador)) continue;

        // Extraer el número de minutos del valor
        let num: number | null = null;
        if (typeof val === "number") {
          num = val;
        } else if (typeof val === "object" && val !== null) {
          const rawMin = (val as any).minutos ?? (val as any).duracion ?? (val as any).min;
          if (rawMin !== undefined && rawMin !== null && rawMin !== "") {
            const parsed = Number(rawMin);
            if (!isNaN(parsed) && parsed >= 0) num = parsed;
          }
        }

        if (num === null) continue;

        const kLow = k.toLowerCase();
        const isExplicitMatchKey = kLow.endsWith("_pa") || kLow.endsWith("_partido") || Boolean(matchBlockId && k.includes(matchBlockId));

        if (isExplicitMatchKey) {
          // Si es clave de partido: preferir minutaje real de sustitución (>0) sobre 90, pero NUNCA sobrescribir 90 con 0
          if (matchMin === null) {
            matchMin = num;
          } else if (matchMin === 90 && num !== 90 && num > 0) {
            matchMin = num;
          } else if (matchMin === 0 && num > 0) {
            matchMin = num;
          }
        } else {
          // Clave genérica o fallback
          if (fallbackMin === null) fallbackMin = num;
          else if (fallbackMin === 90 && num !== 90 && num > 0) fallbackMin = num;
          else if (fallbackMin === 0 && num > 0) fallbackMin = num;
        }
      }

      if (matchMin !== null) return matchMin;
      if (fallbackMin !== null && fallbackMin > 0) return fallbackMin;
    }

    // ── CONVOCATORIA: Si no tiene minutaje explícito de partido en BBDD, verificar si estuvo convocado ──
    const tieneAsignacionPa = jugadorTieneAsignadoEvento(jugador, fechaStr, "Pa");
    if (!tieneAsignacionPa) return 0;

    // ── GPS como fallback ──
    const dayGps = gpsByDate.get(fechaStr) || (sId ? gpsByDate.get(sId) : null);
    if (dayGps && dayGps.length > 0) {
      for (const g of dayGps) {
        const rawJid = String(g.jugador_id || g.jugador || "");
        if (isPlayerMatch(rawJid, jugador)) {
          const met = g.metricas;
          if (met && typeof met === "object") {
            const durVal = met["Duration(min)"] ?? met["Volume(min)"] ?? met["Duration"] ?? met["time"] ?? met["Time (min)"] ?? met["duracion_min"] ?? met["minutos"];
            const parsedDur = typeof durVal === "number" ? durVal : parseFloat(durVal);
            if (!isNaN(parsedDur) && parsedDur > 0) return Math.round(parsedDur);
          }
        }
      }
    }

    // ── Estado diario de BBDD como último fallback ──
    const stList = (estadosByDate.get(fechaStr) || []).concat(sId ? (estadosByDate.get(sId) || []) : []);
    for (const st of stList) {
      const rawJid = String(st.jugador_id || (st as any).jugador || "");
      if (isPlayerMatch(rawJid, jugador)) {
        const disp = ((st as any).disponibilidad || "").trim().toUpperCase();
        if (disp === "ND" || disp === "N" || disp === "NO") continue;
        const rawVal = (st as any).duracion_evento ?? (st as any).minutos_partido ?? (st as any).minutos_jugados;
        if (rawVal !== undefined && rawVal !== null && rawVal !== "") {
          const minEspec = Number(rawVal);
          if (!isNaN(minEspec) && minEspec >= 0) return minEspec;
        }
      }
    }

    return 0;
  }

  // Comprobar si el jugador es Titular en un partido (Solo oficiales, no amistosos)
  function isJugadorTitularPartido(
    jugador: { id: string; nombre: string; apodo?: string | null },
    p: PartidoMatch,
    mins: number
  ): boolean {
    if (jugador.id === "TEAM") return false;
    // Solo pondremos titulares y suplentes en los partidos que no son amistosos
    if (p.competicionTipo === "AMISTOSO") return false;
    if (mins <= 0) return false;

    const fechaStr = p.fecha;
    const sId = p.sesionRef?.id;

    // 1. Revisar si hay titularidad explícitamente guardada en minutesMap (T o S)
    if (minutesMap && typeof minutesMap === "object") {
      for (const [k, val] of Object.entries(minutesMap)) {
        if (!val) continue;
        if (k.includes(fechaStr) || (sId && k.includes(sId))) {
          const prefix = k.split(fechaStr)[0].replace(/_$/, "") || k.split("_")[0];
          if (isPlayerMatch(prefix, jugador)) {
            const entry = val as any;
            if (entry && typeof entry === "object" && entry.titularidad) {
              return entry.titularidad === "T";
            }
          }
        }
      }
    }

    // 2. Regla automática: Si el jugador acumula más de 45min se debe quedar automáticamente como T
    return mins > 45;
  }

  function isSesionPartido(s?: SesionDia): boolean {
    if (!s || !s.fecha) return false;

    // 1. Filtrar estrictamente: olvidar partidos y rivales previos al 01/10/2026
    if (s.fecha < "2026-10-01") return false;
    if (activeTemporada === "2025/26" && (s.fecha < "2025-07-01" || s.fecha >= "2026-07-01")) return false;

    const codeTipo = String((s as any).tipo_de_evento || (s as any).tipo || "").trim().toUpperCase();
    const codeAm = String(s.evento_am || "").trim().toUpperCase();
    const codePm = String(s.evento_pm || "").trim().toUpperCase();
    const codeEv = String((s as any).evento || (s as any).evento_principal || (s as any).evento_1 || "").trim().toUpperCase();

    const hasMatchCode = isPartidoCode(codeTipo) || isPartidoCode(codeAm) || isPartidoCode(codePm) || isPartidoCode(codeEv);

    if (bloquesMap) {
      for (let slot = 0; slot < 6; slot++) {
        const b = bloquesMap[`${s.fecha}_slot_${slot}`] || (s.id ? bloquesMap[`${s.id}_slot_${slot}`] : null);
        if (b && b.tipo && isPartidoCode(b.tipo)) return true;
      }
    }

    // 2. Comprobar rival
    const riv = String(s.rival || "").trim();
    const hasValidRival = riv && !isNonMatchComment(riv);

    // Si no tiene código de partido ni rival válido, NO es partido
    if (!hasValidRival && !hasMatchCode) return false;

    // Días explícitos de puro descanso sin bloque de partido no son partidos
    if (["D", "DESC", "REC", "DESCANSO"].includes(codeAm) && !hasMatchCode) return false;

    // Si tiene un rival legítimo y es Match Day (MD) o tiene código de partido
    if (hasValidRival && (s.md === "MD" || hasMatchCode)) {
      return true;
    }

    return hasMatchCode;
  }

  // Identificador de tipo de competición (EXACTO DE REPORTE ANUAL)
  function getCompeticionTipo(s?: SesionDia): "AMISTOSO" | "LIGA" | "COPA_REY" | "COPA_CATALUNYA" | null {
    if (!s || !isSesionPartido(s)) return null;
    const fechaStr = s.fecha;

    const comp = String((s as any).competicion || (s as any).competici || "").trim().toUpperCase();
    if (comp.includes("REY") || comp === "CR") return "COPA_REY";
    if (comp.includes("CATALU") || comp === "CC") return "COPA_CATALUNYA";
    if (comp.includes("AMIST") || comp === "PAAM") return "AMISTOSO";
    if (comp.includes("2RFEF") || comp.includes("3RFEF") || comp.includes("RFEF") || comp.includes("LIGA") || comp.includes("FEDERAC")) return "LIGA";

    if (bloquesMap) {
      for (let slot = 0; slot < 6; slot++) {
        const b = bloquesMap[`${fechaStr}_slot_${slot}`] || (s.id ? bloquesMap[`${s.id}_slot_${slot}`] : null);
        if (b && b.tipo) {
          const bt = String(b.tipo).trim().toUpperCase();
          const bComp = String(b.competicion || b.orientacion || "").trim().toUpperCase();
          if (bComp.includes("REY") || bt === "CR" || bt.includes("COPA REY")) return "COPA_REY";
          if (bComp.includes("CATALU") || bt === "CC" || bt.includes("COPA CAT")) return "COPA_CATALUNYA";
          if (bt === "PAAM" || bt === "AMISTOSO" || bComp.includes("AMIST")) return "AMISTOSO";
          if (bt === "PAL" || bt === "PAV" || bt === "PL" || bt === "PV" || bt.includes("LIGA") || bt.includes("RFEF") || bComp.includes("LIGA") || bComp.includes("RFEF")) return "LIGA";
        }
      }
    }

    const codeTipo = String((s as any).tipo_de_evento || (s as any).tipo || "").trim().toUpperCase();
    const codeAm = String(s.evento_am || "").trim().toUpperCase();
    const codePm = String(s.evento_pm || "").trim().toUpperCase();
    const codeEv = String((s as any).evento || (s as any).evento_principal || (s as any).evento_1 || "").trim().toUpperCase();
    const riv = String(s.rival || "").trim().toUpperCase();

    if (codeTipo === "CR" || codeAm === "CR" || codeEv === "CR") return "COPA_REY";
    if (codeTipo === "CC" || codeAm === "CC" || codeEv === "CC") return "COPA_CATALUNYA";
    if (codeTipo === "PAAM" || codeAm === "PAAM" || codeEv === "PAAM" || riv.includes("AMISTOSO")) return "AMISTOSO";
    if (["PAL", "PAV", "PL", "PV"].includes(codeTipo) || ["PAL", "PAV", "PL", "PV"].includes(codeAm) || ["PAL", "PAV", "PL", "PV"].includes(codeEv)) return "LIGA";

    if (fechaStr < "2026-09-01") return "AMISTOSO";
    return "LIGA";
  }

  // Helper de posición táctica ordenada (Portero -> Laterales -> Centrales -> Pivotes -> Interiores -> Extremos -> Delanteros)
  const getTacticalPosScore = (posStr?: string | null): number => {
    if (!posStr) return 99;
    const p = posStr.trim().toUpperCase();
    if (p.includes("PORT") || p.includes("GK") || p === "POR") return 1;
    if ((p.includes("LATERAL") && (p.includes("DER") || p.includes(" D") || p.endsWith("D"))) || p === "LD" || (p.includes("CARRILERO") && (p.includes("DER") || p.includes(" D") || p.endsWith("D")))) return 2;
    if ((p.includes("LATERAL") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I"))) || p === "LI" || (p.includes("CARRILERO") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I")))) return 3;
    if (p.includes("LATERAL") || p.includes("CARRILERO")) return 2.5;
    if ((p.includes("CENTRAL") && (p.includes("DER") || p.includes(" D") || p.endsWith("D"))) || p === "DCD" || p === "CD") return 4;
    if ((p.includes("CENTRAL") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I"))) || p === "DCI" || p === "CI") return 5;
    if (p.includes("CENTRAL") || p.includes("DEFENSA")) return 4.5;
    if (p.includes("PIVOT") || p.includes("MCD") || p === "PIV" || p.includes("MEDIOCENTRO DEF")) return 6;
    if ((p.includes("INTERIOR") && (p.includes("DER") || p.includes(" D") || p.endsWith("D"))) || p === "ID" || p === "MD" || (p.includes("MEDIOCENTRO") && (p.includes("DER") || p.includes(" D") || p.endsWith("D")))) return 7;
    if ((p.includes("INTERIOR") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I"))) || p === "II" || p === "MI" || (p.includes("MEDIOCENTRO") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I")))) return 8;
    if (p.includes("INTERIOR") || p.includes("MEDIO") || p.includes("CENTROCAMPISTA") || p === "MC") return 6.5;
    if ((p.includes("EXTREMO") && (p.includes("DER") || p.includes(" D") || p.endsWith("D"))) || p === "ED" || (p.includes("BANDA") && (p.includes("DER") || p.includes(" D")))) return 9;
    if (p.includes("DELANTERO") || p.includes("ARIETE") || p.includes("PUNTA") || p === "DC" || p === "DEL") return 10;
    if ((p.includes("EXTREMO") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I"))) || p === "EI" || (p.includes("BANDA") && (p.includes("IZQ") || p.includes(" I")))) return 11;
    if (p.includes("EXTREMO") || p.includes("ATACANTE")) return 9.5;
    return 50;
  };

  // Parsear partidos de la temporada ordenados cronológicamente por fecha en el Eje X
  const listaPartidos: PartidoMatch[] = useMemo(() => {
    const map = new Map<string, PartidoMatch>();

    sesiones.forEach((s) => {
      const compTipo = getCompeticionTipo(s);
      if (!compTipo) return;

      const fecha = s.fecha;
      let compLabel = defaultLigaLabel;
      if (compTipo === "COPA_REY") compLabel = "Copa Rey";
      else if (compTipo === "COPA_CATALUNYA") compLabel = "Copa Cat.";
      else if (compTipo === "AMISTOSO") compLabel = "Amistoso";

      const rivalRaw = String(s.rival || rivalMap[s.fecha]?.rival || rivalMap[s.id || ""]?.rival || "").trim();

      // Local / Visitante en función si es PL, PAL, PV, o PAV
      let locVis: "L" | "V" | "-" = "-";

      const evCodes = [
        String(s.evento_am || "").trim().toUpperCase(),
        String((s as any).evento_principal || "").trim().toUpperCase(),
        String(s.evento_pm || "").trim().toUpperCase(),
        String((s as any).evento || "").trim().toUpperCase(),
        String((s as any).tipo_de_evento || (s as any).tipo || "").trim().toUpperCase(),
        String((s as any).evento_1 || "").trim().toUpperCase(),
        String((s as any).evento_2 || "").trim().toUpperCase(),
      ];

      if (bloquesMap) {
        for (let slot = 0; slot < 6; slot++) {
          const b = bloquesMap[`${fecha}_slot_${slot}`] || (s.id ? bloquesMap[`${s.id}_slot_${slot}`] : null);
          if (b && b.tipo) {
            evCodes.push(String(b.tipo).trim().toUpperCase());
          }
        }
      }

      for (const c of evCodes) {
        if (c === "PL" || c === "PAL" || c.includes("PARTIDO LOCAL") || c.includes("AMISTOSO LOCAL")) {
          locVis = "L";
          break;
        }
        if (c === "PV" || c === "PAV" || c.includes("PARTIDO VISITANTE") || c.includes("AMISTOSO VISITANTE")) {
          locVis = "V";
          break;
        }
      }

      if (locVis === "-") {
        if (s.local_visitante) {
          locVis = s.local_visitante.toUpperCase().startsWith("L") ? "L" : "V";
        } else if (rivalRaw.startsWith("@") || rivalRaw.toLowerCase().includes("visitante") || rivalRaw.toLowerCase().includes("(v)")) {
          locVis = "V";
        } else if (rivalRaw.startsWith("vs") || rivalRaw.toLowerCase().includes("local") || rivalRaw.toLowerCase().includes("(l)")) {
          locVis = "L";
        }
      }

      const rivalClean = rivalRaw.replace(/^(@|vs|v\.?s\.?)\s*/i, "").trim() || "Rival por confirmar";
      const duracion = getMinutosSesion(s);

      const hasMinutesRecorded = (() => {
        if (!minutesMap) return false;
        return Object.keys(minutesMap).some(
          (k) =>
            (k.includes(fecha) || Boolean(s.id && k.includes(s.id))) &&
            Number((minutesMap[k] as any)?.minutos ?? (minutesMap[k] as any)?.duracion ?? minutesMap[k]) > 0
        );
      })();
      const hasResultado = Boolean(s.resultado || (s as any).resultado_partido);

      map.set(fecha, {
        id: s.id || fecha,
        fecha,
        semana: Number(s.semana) || 1,
        competicionTipo: compTipo,
        competicionLabel: compLabel,
        rival: rivalClean,
        localVisitante: locVis,
        resultado: s.resultado || (s as any).resultado_partido || undefined,
        duracionMinutos: duracion,
        esFuturo: fecha > todayStr && !hasMinutesRecorded && !hasResultado,
        sesionRef: s,
      });
    });

    const sorted = Array.from(map.values()).sort((a, b) => b.fecha.localeCompare(a.fecha));

    // Asignar Jornada (J1, J2...) correlativa a los partidos de liga 2RFEF (y nada a amistosos)
    let ligaCount = 0;
    return sorted.map((p) => {
      if (p.competicionTipo === "LIGA") {
        let explicitJ: number | null = null;
        const s = p.sesionRef;
        const searchTexts = [
          (s as any)?.jornada,
          (s as any)?.faseJornada,
          (s as any)?.orientacion,
          (s as any)?.comentario,
          bloquesMap ? (bloquesMap[`${p.fecha}_slot_0`]?.orientacion || bloquesMap[`${p.fecha}_slot_1`]?.orientacion || bloquesMap[`${p.fecha}_slot_0`]?.comentario) : ""
        ];
        for (const txt of searchTexts) {
          if (!txt) continue;
          const match = String(txt).match(/(?:jornada|j\.?)\s*(\d+)/i);
          if (match && match[1]) {
            explicitJ = parseInt(match[1], 10);
            break;
          }
        }

        if (explicitJ === null) {
          if (jornadasMap[p.fecha] || (s?.id && jornadasMap[s.id])) {
            explicitJ = Number(jornadasMap[p.fecha] || (s?.id ? jornadasMap[s.id] : undefined));
          }
        }

        if (explicitJ === null) {
          const rivNorm = p.rival.toLowerCase();
          if (p.fecha === "2026-10-04" || rivNorm.includes("huesca")) explicitJ = 5;
          else if (p.fecha === "2026-10-11" || rivNorm.includes("algeciras")) explicitJ = 6;
          else if (p.fecha === "2026-10-16" || p.fecha === "2026-10-18" || rivNorm.includes("cartagena")) explicitJ = 7;
          else if (p.fecha === "2026-10-23" || p.fecha === "2026-10-25" || rivNorm.includes("zaragoza")) explicitJ = 8;
          else if (p.semana && p.semana >= 8) explicitJ = p.semana - 7;
        }

        ligaCount++;
        const jNum = explicitJ !== null && !isNaN(explicitJ) ? explicitJ : (ligaCount + 4);
        return {
          ...p,
          jornadaNum: jNum,
          jornadaLabel: `J${jNum}`,
        };
      }

      // En los amistosos NO poner nada
      // En copas poner eliminatoria si existe
      if (p.competicionTipo === "COPA_REY" || p.competicionTipo === "COPA_CATALUNYA") {
        const s = p.sesionRef;
        let ronda: string | null = null;
        const searchTexts = [(s as any)?.faseJornada, (s as any)?.orientacion, (s as any)?.comentario];
        for (const txt of searchTexts) {
          if (!txt) continue;
          const str = String(txt).trim();
          if (str.includes("Ronda") || str.includes("Octavos") || str.includes("Cuartos") || str.includes("Previa")) {
            ronda = str;
            break;
          }
        }
        return {
          ...p,
          jornadaNum: null,
          jornadaLabel: ronda,
        };
      }

      return {
        ...p,
        jornadaNum: null,
        jornadaLabel: null,
      };
    });
  }, [sesiones, rivalMap, todayStr, bloquesMap, activeTemporada, minutesMap, defaultLigaLabel, jornadasMap]);

  const handleUpdateJornada = (p: PartidoMatch) => {
    const promptMsg = `Número de jornada para el partido vs ${p.rival} (${p.fecha}):`;
    const input = window.prompt(promptMsg, String(p.jornadaNum || ""));
    if (input === null) return;
    const num = parseInt(input.trim(), 10);
    if (isNaN(num) || num <= 0) return;

    const nextMap = { ...jornadasMap, [p.fecha]: num };
    if (p.sesionRef?.id) nextMap[p.sesionRef.id] = num;
    setJornadasMap(nextMap);
    try {
      localStorage.setItem("partidos_jornadas_map_v1", JSON.stringify(nextMap));
      window.dispatchEvent(new Event("storage"));
    } catch (e) {}
  };

  // Actualizar resultado de partido directamente con sincronización a Calendario
  const handleUpdateResultado = (fecha: string, dayId: string, currentRes?: string, rivalName?: string) => {
    const promptMsg = "Resultado del partido vs " + (rivalName || "rival") + " (ej. 2-1, 0-0, 1-3, V, E, D):";
    const input = window.prompt(promptMsg, currentRes || "");
    if (input === null) return;
    const newRes = input.trim();

    setSesiones((prev) =>
      prev.map((s) => {
        if (s.fecha === fecha || s.id === dayId) {
          return { ...s, resultado: newRes, resultado_partido: newRes };
        }
        return s;
      })
    );

    try {
      const rawMap = localStorage.getItem("match_results_map_v1") || "{}";
      const map = JSON.parse(rawMap);
      map[fecha] = newRes;
      if (dayId) map[dayId] = newRes;
      localStorage.setItem("match_results_map_v1", JSON.stringify(map));

      const rawDays = localStorage.getItem("planificacion_days_v2") || localStorage.getItem("planificacion_days_v1");
      if (rawDays) {
        const parsed = JSON.parse(rawDays);
        if (Array.isArray(parsed)) {
          const updated = parsed.map((d: any) => {
            if (d.fecha === fecha || d.id === dayId) {
              return { ...d, resultado_partido: newRes, resultado: newRes };
            }
            return d;
          });
          localStorage.setItem("planificacion_days_v2", JSON.stringify(updated));
        }
      }
      window.dispatchEvent(new Event("storage"));
    } catch (e) {
      console.error(e);
    }
  };

  // Filtrado de Partidos en Eje X
  const partidosFiltrados = useMemo(() => {
    return listaPartidos.filter((p) => {
      if (partidosEstadoFiltro === "JUGADOS" && p.esFuturo) return false;
      if (competicionFiltro === "OFICIALES" && p.competicionTipo === "AMISTOSO") return false;
      if (competicionFiltro === "AMISTOSOS" && p.competicionTipo !== "AMISTOSO") return false;
      if (competicionFiltro === "LIGA" && p.competicionTipo !== "LIGA") return false;
      if (competicionFiltro === "COPA_REY" && p.competicionTipo !== "COPA_REY") return false;
      if (competicionFiltro === "COPA_CATALUNYA" && p.competicionTipo !== "COPA_CATALUNYA") return false;

      if (localFiltro !== "TODOS" && p.localVisitante !== "-" && p.localVisitante !== localFiltro) return false;
      if (rivalFiltro !== "TODOS" && normalizeTeamName(p.rival) !== normalizeTeamName(rivalFiltro) && p.rival !== rivalFiltro) return false;
      if (excludedRivales.length > 0) {
        const normRival = normalizeTeamName(p.rival);
        if (excludedRivales.includes(p.rival) || excludedRivales.includes(normRival)) return false;
      }

      return true;
    });
  }, [listaPartidos, competicionFiltro, localFiltro, rivalFiltro, excludedRivales, partidosEstadoFiltro]);

  // Jugadores activos (excluyendo estrictamente los archivados activo === false)
  const realActivePlayers = useMemo(() => {
    return jugadores.filter((j) => (j.activo === true || j.activo === undefined || j.activo === null) && j.id !== "TEAM");
  }, [jugadores]);

  const activePlayers = useMemo(() => {
    return [{ id: "TEAM", nombre: "TEAM", apodo: "TEAM", posicion: "TEAM" }, ...realActivePlayers];
  }, [realActivePlayers]);

  // Precomputación en memoria de minutos y titularidad para todos los jugadores x partidos
  const matrixCellData = useMemo(() => {
    const map = new Map<string, { mins: number; esTitular: boolean }>();
    activePlayers.forEach((j) => {
      listaPartidos.forEach((p) => {
        const mins = p.esFuturo ? 0 : (j.id === "TEAM" ? getMinutosSesion(p.sesionRef) : getMinutosJugadorEvento(j, p.sesionRef));
        const esTitular = !p.esFuturo && isJugadorTitularPartido(j, p, mins);
        map.set(`${j.id}_${p.id}`, { mins, esTitular });
      });
    });
    return map;
  }, [activePlayers, listaPartidos, minutesByDate, eventsByDate, estadosByDate, gpsByDate, bloquesMap]);

  // Estadísticas y ordenación de jugadores (Eje Y)
  // Resumen y estadísticas agrupadas por cada rival
  const rivalesSummary = useMemo(() => {
    const map = new Map<string, {
      nombre: string;
      escudoUrl: string;
      partidos: PartidoMatch[];
      victorias: number;
      empates: number;
      derrotas: number;
      pendientes: number;
      minutosTotales: number;
      topJugadores: { jugador: Jugador; minutos: number }[];
    }>();

    listaPartidos.forEach((p) => {
      const normKey = normalizeTeamName(p.rival) || p.rival;
      if (!map.has(normKey)) {
        map.set(normKey, {
          nombre: p.rival,
          escudoUrl: findRivalEscudoUrl(p.rival, rivalesList),
          partidos: [],
          victorias: 0,
          empates: 0,
          derrotas: 0,
          pendientes: 0,
          minutosTotales: 0,
          topJugadores: [],
        });
      }
      const entry = map.get(normKey)!;
      entry.partidos.push(p);

      const badge = getResultBadge(p.resultado, p.localVisitante, p.esFuturo);
      if (badge.outcome === "VICTORIA") entry.victorias++;
      else if (badge.outcome === "EMPATE") entry.empates++;
      else if (badge.outcome === "DERROTA") entry.derrotas++;
      else entry.pendientes++;
      entry.minutosTotales += p.duracionMinutos || 90;
    });

    // Calcular top jugadores para cada rival
    map.forEach((entry) => {
      const playerMins = realActivePlayers.map((j) => {
        const total = entry.partidos.reduce((acc, p) => {
          if (p.esFuturo) return acc;
          const cell = matrixCellData.get(`${j.id}_${p.id}`);
          return acc + (cell ? cell.mins : 0);
        }, 0);
        return { jugador: j, minutos: total };
      });
      playerMins.sort((a, b) => b.minutos - a.minutos);
      entry.topJugadores = playerMins.filter((item) => item.minutos > 0).slice(0, 5);
    });

    return Array.from(map.values()).sort((a, b) => {
      const playedA = a.partidos.length - a.pendientes;
      const playedB = b.partidos.length - b.pendientes;
      if (playedA !== playedB) return playedB - playedA;
      return a.nombre.localeCompare(b.nombre);
    });
  }, [listaPartidos, rivalesList, realActivePlayers, matrixCellData]);

  // Lista de nombres únicos de rivales para el selector
  const listaRivalesNombres = useMemo(() => {
    return Array.from(new Set(listaPartidos.map((p) => p.rival).filter(Boolean))).sort();
  }, [listaPartidos]);

  const rowsData = useMemo(() => {
    const filtered = activePlayers.filter((j) => {
      if (j.id === "TEAM") return true;
      if (excludedPlayerIds.length > 0 && excludedPlayerIds.includes(String(j.id))) return false;
      return true;
    });

    const computed = filtered.map((j) => {
      let sumaMin = 0;

      partidosFiltrados.forEach((p) => {
        if (partidosExcluidos.has(p.id) || p.esFuturo) return;
        const cell = matrixCellData.get(`${j.id}_${p.id}`);
        sumaMin += cell ? cell.mins : 0;
      });

      return {
        jugador: j,
        sumaMinutos: sumaMin,
      };
    });

    // Ordenación en el Eje Y
    computed.sort((a, b) => {
      if (a.jugador.id === "TEAM") return -1;
      if (b.jugador.id === "TEAM") return 1;

      if (ordenFiltro === "posicion") {
        return comparePlayersByTacticalPosition(a.jugador, b.jugador);
      }
      if (ordenFiltro === "minutos_desc") {
        return b.sumaMinutos - a.sumaMinutos;
      }
      if (ordenFiltro === "minutos_asc") {
        return a.sumaMinutos - b.sumaMinutos;
      }
      return 0;
    });

    return computed;
  }, [activePlayers, excludedPlayerIds, partidosFiltrados, partidosExcluidos, ordenFiltro, matrixCellData]);

  // Escala de calor para minutos (rojo corporativo del Reporte Anual)
  const maxMinutos = useMemo(() => {
    const list = rowsData.filter((r) => r.jugador.id !== "TEAM").map((r) => r.sumaMinutos);
    return Math.max(...list, 1);
  }, [rowsData]);

  const getContadorColorScale = (val: number, maxVal: number) => {
    if (val === 0) return { background: "transparent", color: "#cbd5e1" };
    const norm = Math.min(Math.max(val / maxVal, 0.05), 1);
    const alpha = (0.06 + norm * 0.74).toFixed(3);
    const textCol = norm > 0.65 ? "#ffffff" : "#991b1b";
    return {
      background: `rgba(225, 29, 72, ${alpha})`,
      color: textCol,
      fontWeight: norm > 0.4 ? 800 : 600,
    };
  };

  // Exportar PDF
  const handleExportPdf = () => {
    const originalTitle = document.title;
    const hoy = new Date();
    const dd = String(hoy.getDate()).padStart(2, "0");
    const mm = String(hoy.getMonth() + 1).padStart(2, "0");
    const yyyy = hoy.getFullYear();
    document.title = `Informe Temporada Partidos hasta ${dd}-${mm}-${yyyy}`;

    setTimeout(() => {
      window.print();
      document.title = originalTitle;
    }, 200);
  };

  const toggleExcluirPartido = (id: string) => {
    setPartidosExcluidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [isMigrating, setIsMigrating] = useState(false);
  const handleMigrateToSupabase = async () => {
    if (!confirm("¿Seguro que quieres subir todos los minutos calculados en este informe a Supabase?")) return;
    try {
      setIsMigrating(true);
      const rowsToUpload = [];
      for (const jugador of activePlayers) {
        if (jugador.id === "TEAM") continue;
        for (const p of partidosFiltrados) {
          if (p.esFuturo) continue;
          const minutos = getMinutosJugadorEvento(jugador, p.sesionRef);
          if (minutos > 0 || (minutos === 0 && (jugadorTieneAsignadoEvento(jugador, p.fecha, "Pa") || p.fecha === "2026-09-06" || p.fecha === "2026-08-22"))) {
             rowsToUpload.push({
               jugador_id: jugador.id,
               fecha: p.fecha,
               evento_id: p.id,
               minutos: minutos,
               duracion: minutos
             });
          }
        }
      }
      
      console.log("Subiendo a Supabase:", rowsToUpload);
      await cleanEmptySessions(); await saveMinutosJugadorEvento(rowsToUpload);
      alert("¡Migración completada con éxito! Todos los minutos están ahora en Supabase.");
    } catch(err) {
      alert("Error al migrar: " + err);
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <main
      style={{
        padding: "16px",
        background: "#f8fafc",
        minHeight: "100vh",
        color: "#0f172a",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* BARRA SUPERIOR DE NAVEGACIÓN */}
      <header
        className="topbar no-print"
        style={{
          marginBottom: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#ffffff",
          padding: "12px 20px",
          borderRadius: "10px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link
            href="/"
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#64748b",
              textDecoration: "none",
              background: "#f1f5f9",
              padding: "6px 12px",
              borderRadius: "6px",
            }}
          >
            ← Inicio
          </Link>
          <button
            onClick={handleMigrateToSupabase}
            disabled={isMigrating}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "none",
              background: "#3b82f6",
              color: "#ffffff",
              cursor: isMigrating ? "wait" : "pointer",
              fontWeight: 600,
              fontSize: "12px"
            }}
          >
            {isMigrating ? "Subiendo..." : "Subir minutos a BBDD"}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>⚽</span>
            <h1 style={{ fontSize: "18px", fontWeight: 900, color: "#0f172a", margin: 0 }}>
              Report Partidos & Rivales
            </h1>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <Link
            href="/informes/anual"
            style={{
              background: "#f1f5f9",
              color: "#334155",
              textDecoration: "none",
              padding: "7px 14px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 700,
              border: "1px solid #cbd5e1",
            }}
          >
            📈 Report Anual
          </Link>

          <button
            type="button"
            onClick={handleExportPdf}
            style={{
              background: "#e11d48",
              color: "#ffffff",
              border: "none",
              padding: "8px 16px",
              borderRadius: "8px",
              fontSize: "12.5px",
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 4px rgba(225, 29, 72, 0.3)",
            }}
          >
            <span>📄</span>
            <span>Exportar PDF</span>
          </button>
        </div>
      </header>

      {/* CONTENEDOR PRINCIPAL DEL INFORME (ESTILO OFICIAL EXCEL / CE MANRESA) */}
      <div
        className="informe-anual-report-card"
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          padding: "16px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        {/* ENCABEZADO INSTITUCIONAL */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "2px solid #e11d48",
            paddingBottom: "12px",
            marginBottom: "14px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <img
              src={clubShield}
              alt={activeTeam} suppressHydrationWarning
              style={{ width: "54px", height: "54px", objectFit: "contain", background: "#ffffff", borderRadius: "8px", padding: "2px" }}
              
            />
            <div>
              <div suppressHydrationWarning style={{ fontSize: "11px", fontWeight: 800, color: "#e11d48", letterSpacing: "1px", textTransform: "uppercase" }}>
                {activeTeam.toUpperCase()} · TEMPORADA {activeTemporada} · {seasonCategoriaFullName.toUpperCase()}
              </div>
              <div style={{ fontSize: "18px", fontWeight: 900, color: "#0f172a", letterSpacing: "-0.3px" }}>
                INFORME DE PARTIDOS — MINUTOS Y RIVALES
              </div>
              <div style={{ fontSize: "11.5px", color: "#64748b", fontWeight: 600, marginTop: "2px" }}>
                Total Partidos en Calendario: <strong>{partidosFiltrados.length}</strong> (
                {partidosFiltrados.filter((p) => !p.esFuturo).length} disputados, {partidosFiltrados.filter((p) => p.esFuturo).length} próximos)
              </div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Fecha del informe
            </div>
            <input
              type="text"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              style={{
                fontSize: "12px",
                fontWeight: 800,
                color: "#0f172a",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "3px 8px",
                textAlign: "right",
                background: "#f8fafc",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* ESPACIO PARA COMENTARIO GENERAL */}
        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#475569", marginBottom: "4px" }}>
            📝 Observaciones / Comentario de Partidos:
          </div>
          <textarea
            value={reportComment}
            onChange={(e) => handleCommentChange(e.target.value)}
            placeholder="Escribe aquí notas sobre minutos de partidos, rotaciones, rivales o rendimiento competitivo..."
            rows={2}
            style={{
              width: "100%",
              fontSize: "12px",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              borderLeft: "3px solid #e11d48",
              background: "#f8fafc",
              color: "#0f172a",
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
        </div>

        {/* SELECTOR DE VISTA: MATRIZ DE MINUTOS vs ANÁLISIS POR RIVALES */}
        <div className="no-print" style={{ display: "flex", gap: "8px", marginBottom: "12px", borderBottom: "1px solid #fecdd3", paddingBottom: "10px" }}>
          <button
            type="button"
            onClick={() => setActiveView("matriz")}
            style={{
              padding: "7px 18px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 800,
              cursor: "pointer",
              border: "none",
              background: activeView === "matriz" ? "#e11d48" : "#f1f5f9",
              color: activeView === "matriz" ? "#ffffff" : "#475569",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: activeView === "matriz" ? "0 2px 6px rgba(225, 29, 72, 0.25)" : "none",
            }}
          >
            <span>📊</span>
            <span>Matriz de Minutos ({partidosFiltrados.length} partidos)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView("rivales")}
            style={{
              padding: "7px 18px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 800,
              cursor: "pointer",
              border: "none",
              background: activeView === "rivales" ? "#e11d48" : "#f1f5f9",
              color: activeView === "rivales" ? "#ffffff" : "#475569",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: activeView === "rivales" ? "0 2px 6px rgba(225, 29, 72, 0.25)" : "none",
            }}
          >
            <span>🛡️</span>
            <span>Análisis por Rivales ({rivalesSummary.length} equipos)</span>
          </button>
        </div>

        {/* BARRA DE FILTROS Y CONTROLES INTERACTIVOS (UNA SOLA FILA) */}
        <div
          className="no-print"
          style={{
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            borderRadius: "8px",
            padding: "8px 12px",
            marginBottom: "14px",
            display: "flex",
            alignItems: "center",
            flexWrap: "nowrap",
            overflow: "visible",
            gap: "10px",
          }}
        >
          {/* SELECTOR DE TEMPORADA */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#9f1239", whiteSpace: "nowrap" }}>Temporada:</span>
            <select
              value={`${activeTemporada}::${activeTeam}`}
              onChange={(e) => {
                const [val, teamVal] = e.target.value.split("::");
                setSeasonAndTeam(val, teamVal);
                setExcludedPlayerIds([]);
                setExcludedRivales([]);
                setRivalFiltro("TODOS");
              }}
              style={{
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 800,
                borderRadius: "5px",
                border: "1px solid #f43f5e",
                background: "#ffffff",
                color: "#881337",
                outline: "none",
                cursor: "pointer",
              }}
            >
              {availableTemporadas.map((t) => (
                <option key={`${t.temporada}_${t.equipo}`} value={`${t.temporada}::${t.equipo}`}>
                  {t.temporada} · {t.equipo}
                </option>
              ))}
            </select>
          </div>

          {/* FILTRO DE RIVAL (DESPLEGABLE CON CHECKBOX) */}
          <div ref={rivalDropdownRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#9f1239", whiteSpace: "nowrap" }}>Rival:</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowRivalPicker((prev) => !prev);
                setShowPlayerPicker(false);
              }}
              style={{
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 700,
                borderRadius: "5px",
                border: excludedRivales.length > 0 ? "1.5px solid #be123c" : "1px solid #f43f5e",
                background: excludedRivales.length > 0 ? "#ffe4e6" : "#ffffff",
                color: "#881337",
                outline: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                maxWidth: "170px",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {excludedRivales.length === 0
                  ? "Todos (" + listaRivalesNombres.length + ")"
                  : excludedRivales.length >= listaRivalesNombres.length
                  ? "Ninguno (0)"
                  : listaRivalesNombres.filter((r) => !excludedRivales.includes(r) && !excludedRivales.includes(normalizeTeamName(r))).length === 1
                  ? listaRivalesNombres.find((r) => !excludedRivales.includes(r) && !excludedRivales.includes(normalizeTeamName(r))) || "1 rival"
                  : listaRivalesNombres.filter((r) => !excludedRivales.includes(r) && !excludedRivales.includes(normalizeTeamName(r))).length + " rivales"}
              </span>
              <span style={{ fontSize: "9px", color: "#9f1239" }}>▾</span>
            </button>

            {showRivalPicker && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  zIndex: 9999,
                  background: "#ffffff",
                  border: "1px solid #fda4af",
                  boxShadow: "0 10px 25px -5px rgba(159, 18, 57, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                  borderRadius: "8px",
                  width: "270px",
                  maxHeight: "360px",
                  display: "flex",
                  flexDirection: "column",
                  padding: "8px",
                  color: "#1e293b",
                }}
              >
                <div style={{ marginBottom: "6px" }}>
                  <input
                    type="text"
                    placeholder="Buscar rival..."
                    value={rivalSearchText}
                    onChange={(e) => setRivalSearchText(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "4px 8px",
                      fontSize: "11px",
                      borderRadius: "4px",
                      border: "1px solid #cbd5e1",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingBottom: "6px",
                    borderBottom: "1px solid #fecdd3",
                    marginBottom: "6px",
                    fontSize: "10.5px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setExcludedRivales([]);
                      setRivalFiltro("TODOS");
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#be123c",
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: "2px 4px",
                    }}
                  >
                    ✓ Marcar todos ({listaRivalesNombres.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const all: string[] = [];
                      listaRivalesNombres.forEach((r) => {
                        all.push(r);
                        all.push(normalizeTeamName(r));
                      });
                      setExcludedRivales(all);
                      setRivalFiltro("TODOS");
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#64748b",
                      cursor: "pointer",
                      padding: "2px 4px",
                    }}
                  >
                    Desmarcar todos
                  </button>
                </div>

                <div style={{ overflowY: "auto", maxHeight: "230px", display: "flex", flexDirection: "column", gap: "2px" }}>
                  {listaRivalesNombres
                    .filter((r) => {
                      if (!rivalSearchText.trim()) return true;
                      return r.toLowerCase().includes(rivalSearchText.toLowerCase());
                    })
                    .map((r) => {
                      const norm = normalizeTeamName(r);
                      const isChecked = !excludedRivales.includes(r) && !excludedRivales.includes(norm);
                      const countMatches = listaPartidos.filter((p) => p.rival === r || normalizeTeamName(p.rival) === norm).length;

                      return (
                        <label
                          key={r}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "6px",
                            padding: "4px 6px",
                            borderRadius: "4px",
                            cursor: "pointer",
                            background: isChecked ? "transparent" : "#f8fafc",
                            opacity: isChecked ? 1 : 0.5,
                            fontSize: "11px",
                            userSelect: "none",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#fff1f2";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isChecked ? "transparent" : "#f8fafc";
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                setRivalFiltro("TODOS");
                                if (!e.target.checked) {
                                  setExcludedRivales((prev) => Array.from(new Set([...prev, r, norm])));
                                } else {
                                  setExcludedRivales((prev) => prev.filter((x) => x !== r && x !== norm));
                                }
                              }}
                              style={{ cursor: "pointer", accentColor: "#e11d48", width: "14px", height: "14px" }}
                            />
                            <span
                              style={{
                                fontWeight: isChecked ? 700 : 500,
                                color: isChecked ? "#1e293b" : "#94a3b8",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {r}
                            </span>
                            <span style={{ fontSize: "9px", color: "#64748b", background: "#f1f5f9", padding: "1px 4px", borderRadius: "3px" }}>
                              {countMatches}p
                            </span>
                          </div>

                          <button
                            type="button"
                            title="Ver solo a este rival"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setRivalFiltro("TODOS");
                              const allOthers: string[] = [];
                              listaRivalesNombres.forEach((x) => {
                                if (x !== r && normalizeTeamName(x) !== norm) {
                                  allOthers.push(x);
                                  allOthers.push(normalizeTeamName(x));
                                }
                              });
                              setExcludedRivales(allOthers);
                            }}
                            style={{
                              fontSize: "9px",
                              padding: "1px 5px",
                              background: "#f1f5f9",
                              color: "#475569",
                              border: "1px solid #cbd5e1",
                              borderRadius: "3px",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#be123c";
                              e.currentTarget.style.color = "#ffffff";
                              e.currentTarget.style.borderColor = "#be123c";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#f1f5f9";
                              e.currentTarget.style.color = "#475569";
                              e.currentTarget.style.borderColor = "#cbd5e1";
                            }}
                          >
                            Solo
                          </button>
                        </label>
                      );
                    })}
                </div>

                <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px solid #fecdd3", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", color: "#881337", fontWeight: 700 }}>
                    {listaRivalesNombres.filter((r) => !excludedRivales.includes(r) && !excludedRivales.includes(normalizeTeamName(r))).length} de {listaRivalesNombres.length} visibles
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowRivalPicker(false)}
                    style={{
                      padding: "3px 8px",
                      fontSize: "10.5px",
                      fontWeight: 700,
                      background: "#9f1239",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Listo
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* FILTRO DE COMPETICIÓN */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#9f1239", whiteSpace: "nowrap" }}>Competición:</span>
            <select
              value={competicionFiltro}
              onChange={(e) => setCompeticionFiltro(e.target.value)}
              style={{
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 700,
                borderRadius: "5px",
                border: "1px solid #f43f5e",
                background: "#ffffff",
                color: "#881337",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="TODOS">Todos los partidos</option>
              <option value="OFICIALES">Solo Oficiales</option>
              <option value="AMISTOSOS">Solo Amistosos</option>
              <option value="LIGA">{defaultLigaLabel} (Liga)</option>
              <option value="COPA_REY">Copa del Rey</option>
              <option value="COPA_CATALUNYA">Copa Catalunya</option>
            </select>
          </div>

          {/* FILTRO PARTIDOS PROGRAMADOS VS JUGADOS HASTA AHORA */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#9f1239", whiteSpace: "nowrap" }}>Partidos:</span>
            <select
              value={partidosEstadoFiltro}
              onChange={(e) => setPartidosEstadoFiltro(e.target.value as any)}
              style={{
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 700,
                borderRadius: "5px",
                border: "1px solid #f43f5e",
                background: "#ffffff",
                color: "#881337",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="TODOS">Todos los programados</option>
              <option value="JUGADOS">Solo jugados hasta ahora</option>
            </select>
          </div>

          {/* FILTRO LOCAL / VISITANTE */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#9f1239", whiteSpace: "nowrap" }}>Condición:</span>
            <select
              value={localFiltro}
              onChange={(e) => setLocalFiltro(e.target.value as any)}
              style={{
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 700,
                borderRadius: "5px",
                border: "1px solid #f43f5e",
                background: "#ffffff",
                color: "#881337",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="TODOS">Local y Visitante</option>
              <option value="L">Solo Local (L)</option>
              <option value="V">Solo Visitante (V)</option>
            </select>
          </div>

          {/* FILTRO DE JUGADORES (DESPLEGABLE CON CHECKBOX) */}
          <div ref={playerDropdownRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#9f1239", whiteSpace: "nowrap" }}>Jugadores:</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowPlayerPicker((prev) => !prev);
                setShowRivalPicker(false);
              }}
              style={{
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 700,
                borderRadius: "5px",
                border: excludedPlayerIds.length > 0 ? "1.5px solid #be123c" : "1px solid #f43f5e",
                background: excludedPlayerIds.length > 0 ? "#ffe4e6" : "#ffffff",
                color: "#881337",
                outline: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                maxWidth: "170px",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {excludedPlayerIds.length === 0
                  ? "Todos (" + realActivePlayers.length + ")"
                  : excludedPlayerIds.length >= realActivePlayers.length
                  ? "Ninguno (0)"
                  : realActivePlayers.filter((p) => !excludedPlayerIds.includes(String(p.id))).length === 1
                  ? realActivePlayers.find((p) => !excludedPlayerIds.includes(String(p.id)))?.apodo ||
                    realActivePlayers.find((p) => !excludedPlayerIds.includes(String(p.id)))?.nombre ||
                    "1 jugador"
                  : realActivePlayers.filter((p) => !excludedPlayerIds.includes(String(p.id))).length + " futbolistas"}
              </span>
              <span style={{ fontSize: "9px", color: "#9f1239" }}>▾</span>
            </button>

            {showPlayerPicker && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  zIndex: 9999,
                  background: "#ffffff",
                  border: "1px solid #fda4af",
                  boxShadow: "0 10px 25px -5px rgba(159, 18, 57, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                  borderRadius: "8px",
                  width: "270px",
                  maxHeight: "360px",
                  display: "flex",
                  flexDirection: "column",
                  padding: "8px",
                  color: "#1e293b",
                }}
              >
                <div style={{ marginBottom: "6px" }}>
                  <input
                    type="text"
                    placeholder="Buscar por nombre o dorsal..."
                    value={playerSearchText}
                    onChange={(e) => setPlayerSearchText(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "4px 8px",
                      fontSize: "11px",
                      borderRadius: "4px",
                      border: "1px solid #cbd5e1",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingBottom: "6px",
                    borderBottom: "1px solid #fecdd3",
                    marginBottom: "6px",
                    fontSize: "10.5px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setExcludedPlayerIds([]);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#be123c",
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: "2px 4px",
                    }}
                  >
                    ✓ Marcar todos ({realActivePlayers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExcludedPlayerIds(realActivePlayers.map((p) => String(p.id)));
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#64748b",
                      cursor: "pointer",
                      padding: "2px 4px",
                    }}
                  >
                    Desmarcar todos
                  </button>
                </div>

                <div style={{ overflowY: "auto", maxHeight: "230px", display: "flex", flexDirection: "column", gap: "2px" }}>
                  {realActivePlayers
                    .filter((p) => {
                      if (!playerSearchText.trim()) return true;
                      const q = playerSearchText.toLowerCase();
                      return (
                        (p.apodo || "").toLowerCase().includes(q) ||
                        (p.nombre || "").toLowerCase().includes(q) ||
                        (p.posicion || "").toLowerCase().includes(q) ||
                        String(p.dorsal || "").includes(q)
                      );
                    })
                    .map((p) => {
                      const pIdStr = String(p.id);
                      const isChecked = !excludedPlayerIds.includes(pIdStr);

                      return (
                        <label
                          key={p.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "6px",
                            padding: "4px 6px",
                            borderRadius: "4px",
                            cursor: "pointer",
                            background: isChecked ? "transparent" : "#f8fafc",
                            opacity: isChecked ? 1 : 0.5,
                            fontSize: "11px",
                            userSelect: "none",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#fff1f2";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isChecked ? "transparent" : "#f8fafc";
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (!e.target.checked) {
                                  setExcludedPlayerIds((prev) => Array.from(new Set([...prev, pIdStr])));
                                } else {
                                  setExcludedPlayerIds((prev) => prev.filter((x) => x !== pIdStr));
                                }
                              }}
                              style={{ cursor: "pointer", accentColor: "#e11d48", width: "14px", height: "14px" }}
                            />
                            <span style={{ fontWeight: 700, color: isChecked ? "#9f1239" : "#94a3b8", minWidth: "22px", textAlign: "right", fontSize: "10px" }}>
                              {p.dorsal ? "#" + p.dorsal : ""}
                            </span>
                            <span style={{ fontWeight: isChecked ? 600 : 400, color: isChecked ? "#1e293b" : "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {(p.apodo || p.nombre || "").toUpperCase()}
                            </span>
                            <span style={{ fontSize: "9px", color: "#64748b", background: "#f1f5f9", padding: "1px 4px", borderRadius: "3px" }}>
                              {p.posicion || "JUG"}
                            </span>
                          </div>

                          <button
                            type="button"
                            title="Ver solo a este jugador"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const allOthers = realActivePlayers.map((x) => String(x.id)).filter((id) => id !== pIdStr);
                              setExcludedPlayerIds(allOthers);
                            }}
                            style={{
                              fontSize: "9px",
                              padding: "1px 5px",
                              background: "#f1f5f9",
                              color: "#475569",
                              border: "1px solid #cbd5e1",
                              borderRadius: "3px",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#be123c";
                              e.currentTarget.style.color = "#ffffff";
                              e.currentTarget.style.borderColor = "#be123c";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#f1f5f9";
                              e.currentTarget.style.color = "#475569";
                              e.currentTarget.style.borderColor = "#cbd5e1";
                            }}
                          >
                            Solo
                          </button>
                        </label>
                      );
                    })}
                </div>

                <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px solid #fecdd3", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", color: "#881337", fontWeight: 700 }}>
                    {realActivePlayers.filter((p) => !excludedPlayerIds.includes(String(p.id))).length} de {realActivePlayers.length} visibles
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPlayerPicker(false)}
                    style={{
                      padding: "3px 8px",
                      fontSize: "10.5px",
                      fontWeight: 700,
                      background: "#9f1239",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Listo
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* FILTRO DE ORDEN */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#9f1239", whiteSpace: "nowrap" }}>Orden:</span>
            <select
              value={ordenFiltro}
              onChange={(e) => setOrdenFiltro(e.target.value as any)}
              style={{
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 700,
                borderRadius: "5px",
                border: "1px solid #f43f5e",
                background: "#ffffff",
                color: "#881337",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="posicion">Por Posición Táctica</option>
              <option value="minutos_desc">Por Minutos Totales (Mayor a Menor) ⬇</option>
              <option value="minutos_asc">Por Minutos Totales (Menor a Mayor) ⬆</option>
              <option value="default">Orden habitual de plantilla</option>
            </select>
          </div>
        </div>

        {/* VISTA 1: MATRIZ DE MINUTOS */}
        {activeView === "matriz" && (
          <div>
            <div style={{ overflowX: "auto" }}>

          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              whiteSpace: "nowrap",
              fontFamily: "Calibri, Arial, sans-serif",
              fontSize: "11px",
            }}
          >
            <thead>
              {/* FILA 1: CABECERA DE DATOS GENERALES Y PARTIDOS */}
              <tr style={{ background: "#f8fafc", textAlign: "center", fontSize: "10px", fontWeight: 800 }}>
                {/* ESCUDO / CLUB */}
                <th
                  rowSpan={4}
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 20,
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    textAlign: "center",
                    verticalAlign: "middle",
                    padding: "4px",
                    width: "80px",
                    minWidth: "70px",
                    maxWidth: "90px",
                  }}
                >
                  <img
                    src={clubShield}
                    alt={activeTeam}
                    style={{ width: "32px", height: "32px", display: "block", margin: "0 auto 2px auto", objectFit: "contain" }}
                    
                  />
                  <span suppressHydrationWarning style={{ fontSize: "9px", fontWeight: 900, color: "#1e3a8a", letterSpacing: "0.2px" }}>
                    {activeTeam}
                  </span>
                </th>

                {/* RECUENTO SUMA MINUTOS */}
                <th
                  rowSpan={4}
                  style={{
                    border: "1px solid #cbd5e1",
                    width: "36px",
                    minWidth: "36px",
                    background: "#cbd5e1",
                    color: "#0f172a",
                    fontWeight: 900,
                    fontSize: "11px",
                    lineHeight: "1.3",
                    textAlign: "center",
                    verticalAlign: "middle",
                    padding: "4px 2px",
                  }}
                  title="Recuento total de minutos jugados"
                >
                  S<br />U<br />M<br />A
                </th>

                {/* EJE X: CABECERA FILA 1 DE PARTIDOS (COMPETICIÓN Y SEMANA) */}
                {partidosFiltrados.map((p) => {
                  const isExcluded = partidosExcluidos.has(p.id);
                  return (
                    <th
                      key={p.id}
                      style={{
                        border: "1px solid #e11d48",
                        background: isExcluded ? "#94a3b8" : "#e11d48",
                        color: "#ffffff",
                        fontWeight: 900,
                        textAlign: "center",
                        padding: "3px 4px",
                        fontSize: "9.5px",
                        minWidth: "75px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "4px", textAlign: "center" }}>
                        <span>{p.competicionLabel}</span>
                        {p.competicionTipo === "LIGA" && p.jornadaLabel ? (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateJornada(p);
                            }}
                            style={{
                              opacity: 0.95,
                              fontSize: "8.5px",
                              background: "rgba(0,0,0,0.25)",
                              padding: "1px 4px",
                              borderRadius: "3px",
                              fontWeight: 900,
                              cursor: "pointer",
                            }}
                            title="Clic para editar número de jornada"
                          >
                            {p.jornadaLabel}
                          </span>
                        ) : null}
                      </div>
                    </th>
                  );
                })}
              </tr>

              {/* EJE X: FILA 2 (FECHAS ORDENADAS CRONOLÓGICAMENTE) */}
              <tr style={{ textAlign: "center", fontSize: "9px", fontWeight: 800 }}>
                {partidosFiltrados.map((p) => {
                  const dateParts = p.fecha.split("-");
                  const shortDate = `${dateParts[2]}/${dateParts[1]}`;
                  const isExcluded = partidosExcluidos.has(p.id);

                  return (
                    <th
                      key={`f2_${p.id}`}
                      style={{
                        border: isExcluded ? "1px solid #cbd5e1" : "1px solid #e2e8f0",
                        background: isExcluded ? "#e2e8f0" : "#f8fafc",
                        color: isExcluded ? "#64748b" : "#1e293b",
                        padding: "3px 4px",
                        fontWeight: 800,
                        textAlign: "center",
                      }}
                    >
                      <span>{shortDate}</span>
                    </th>
                  );
                })}
              </tr>

              {/* EJE X: FILA 3 (FILA PEQUEÑA: LOCAL O VISITANTE EN FUNCIÓN DE PL, PAL, PV, PAV) */}
              <tr style={{ textAlign: "center", fontSize: "8.5px", fontWeight: 900 }}>
                {partidosFiltrados.map((p) => {
                  const isExcluded = partidosExcluidos.has(p.id);
                  const isLocal = p.localVisitante === "L";
                  const isVisitante = p.localVisitante === "V";
                  const label = isLocal ? "Local" : isVisitante ? "Visitante" : "-";

                  return (
                    <th
                      key={`f_lv_${p.id}`}
                      style={{
                        border: isExcluded ? "1px solid #cbd5e1" : isLocal ? "1px solid #bfdbfe" : isVisitante ? "1px solid #fde68a" : "1px solid #e2e8f0",
                        background: isExcluded ? "#f1f5f9" : isLocal ? "#eff6ff" : isVisitante ? "#fffbeb" : "#f8fafc",
                        color: isExcluded ? "#94a3b8" : isLocal ? "#1d4ed8" : isVisitante ? "#b45309" : "#64748b",
                        padding: "2px 2px",
                        fontWeight: 900,
                        fontSize: "8.5px",
                        letterSpacing: "0.2px",
                        textAlign: "center",
                        lineHeight: "1.2",
                      }}
                      title={`${label} (${isLocal ? "PL / PAL" : isVisitante ? "PV / PAV" : "Sin definir"})`}
                    >
                      {label}
                    </th>
                  );
                })}
              </tr>

              {/* EJE X: FILA 3 (ESCUDO Y RIVAL: FONDO LOCAL / VISITANTE Y ESTADO V / E / D) */}
              <tr style={{ textAlign: "center", fontSize: "9.5px", fontWeight: 900 }}>
                {partidosFiltrados.map((p) => {
                  const isExcluded = partidosExcluidos.has(p.id);
                  const isLocal = p.localVisitante === "L";
                  const isVisitante = p.localVisitante === "V";
                  const badge = getResultBadge(p.resultado, p.localVisitante, p.esFuturo);

                  // Fondo y bordes: VERDE (Victoria), AMARILLO (Empate), ROJO (Derrota) o Local/Visitante si pendiente
                  let cellBg = "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)";
                  let topBorder = "3px solid #94a3b8";
                  let cellBorder = "1px solid #e2e8f0";
                  let cellTextColor = "#0f172a";

                  if (isExcluded) {
                    cellBg = "#f1f5f9";
                    topBorder = "3px solid #cbd5e1";
                    cellBorder = "1px solid #e2e8f0";
                    cellTextColor = "#94a3b8";
                  } else if (badge.outcome === "VICTORIA") {
                    cellBg = "linear-gradient(180deg, #dcfce7 0%, #bbf7d0 100%)";
                    topBorder = "3px solid #16a34a";
                    cellBorder = "1px solid #86efac";
                    cellTextColor = "#14532d";
                  } else if (badge.outcome === "EMPATE") {
                    cellBg = "linear-gradient(180deg, #fef9c3 0%, #fef08a 100%)";
                    topBorder = "3px solid #ca8a04";
                    cellBorder = "1px solid #fde047";
                    cellTextColor = "#713f12";
                  } else if (badge.outcome === "DERROTA") {
                    cellBg = "linear-gradient(180deg, #fee2e2 0%, #fecaca 100%)";
                    topBorder = "3px solid #dc2626";
                    cellBorder = "1px solid #fca5a5";
                    cellTextColor = "#7f1d1d";
                  } else {
                    // Celdas de equipo sin resultado: fondo blanco limpio
                    cellBg = "#ffffff";
                    topBorder = "3px solid #cbd5e1";
                    cellBorder = "1px solid #e2e8f0";
                    cellTextColor = "#0f172a";
                  }

                  return (
                    <th
                      key={`f3_${p.id}`}
                      style={{
                        border: cellBorder,
                        borderTop: topBorder,
                        background: cellBg,
                        color: cellTextColor,
                        padding: "5px 3px 6px 3px",
                        maxWidth: "115px",
                        minWidth: "85px",
                        overflow: "hidden",
                        position: "relative",
                        transition: "all 0.15s ease",
                      }}
                      title={`vs ${p.rival} (${isLocal ? "LOCAL - En casa" : isVisitante ? "VISITANTE - Fuera" : "Campo neutral"})\n${badge.tooltip}`}
                    >
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
                        {/* BOTÓN EXCLUIR ALINEADO SUTILMENTE */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", width: "100%", padding: "0 2px" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExcluirPartido(p.id);
                            }}
                            style={{
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              fontSize: "8.5px",
                              padding: "0 2px",
                              opacity: isExcluded ? 0.35 : 0.5,
                              color: isExcluded ? "#64748b" : "#b91c1c",
                              fontWeight: 800,
                            }}
                            title={isExcluded ? "Incluir este partido en la suma de minutos" : "Excluir este partido de la suma de minutos"}
                          >
                            {isExcluded ? "👁️‍🗨️" : "✕"}
                          </button>
                        </div>

                        {/* ESCUDO DEL RIVAL */}
                        {(() => {
                          const escudo = findRivalEscudoUrl(p.rival, rivalesList);
                          return escudo ? (
                            <img
                              src={escudo || undefined}
                              alt={p.rival}
                              style={{
                                width: "26px",
                                height: "26px",
                                objectFit: "contain",
                                display: "inline-block",
                                filter: isExcluded ? "grayscale(100%) opacity(40%)" : "none",
                              }}
                              onError={(e: any) => { e.currentTarget.style.display = "none"; }}
                            />
                          ) : (
                            <span style={{ fontSize: "16px", opacity: 0.4 }}>🛡️</span>
                          );
                        })()}

                        {/* NOMBRE DEL RIVAL EN MAYÚSCULAS */}
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            letterSpacing: "-0.2px",
                            fontWeight: 900,
                            fontSize: "9px",
                            maxWidth: "105px",
                            color: cellTextColor,
                          }}
                        >
                          {p.rival}
                        </div>

                        {/* RESULTADO SIN RECUADRO NI CIRCULITO */}
                        {badge.marcador ? (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateResultado(p.fecha, p.id, p.resultado, p.rival);
                            }}
                            style={{
                              fontSize: "11px",
                              fontWeight: 900,
                              letterSpacing: "0.5px",
                              color: cellTextColor,
                              cursor: "pointer",
                              marginTop: "2px",
                              lineHeight: "1.2",
                              textAlign: "center",
                            }}
                            title={`Resultado: ${badge.marcador} (${badge.outcome === "VICTORIA" ? "Victoria" : badge.outcome === "EMPATE" ? "Empate" : "Derrota"})\nHaz clic para modificar`}
                          >
                            {badge.marcador}
                          </div>
                        ) : (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateResultado(p.fecha, p.id, p.resultado, p.rival);
                            }}
                            style={{
                              fontSize: "9px",
                              color: cellTextColor,
                              opacity: 0.35,
                              cursor: "pointer",
                              marginTop: "2px",
                              fontWeight: 700,
                            }}
                            title="Haz clic para añadir resultado"
                          >
                            {p.esFuturo ? "" : "—"}
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>

              </thead>

            <tbody>
              {/* EJE Y: FILAS DE CADA JUGADOR ORDENADOS POR POSICIÓN TÁCTICA */}
              {rowsData.map(({ jugador: j, sumaMinutos }) => {
                const isTeam = j.id === "TEAM";
                const scaleStyle = isTeam
                  ? { background: "#ffe4e6", color: "#9f1239", fontWeight: 900 }
                  : getContadorColorScale(sumaMinutos, maxMinutos);

                return (
                  <tr
                    key={j.id}
                    style={{
                      textAlign: "center",
                      background: isTeam ? "#fff1f2" : "#ffffff",
                      fontWeight: isTeam ? 900 : 400,
                    }}
                  >
                    {/* NOMBRE DEL JUGADOR ALINEADO A LA DERECHA */}
                    <td
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 10,
                        background: isTeam ? "#fff1f2" : "#ffffff",
                        border: "1px solid #cbd5e1",
                        width: "80px",
                        minWidth: "70px",
                        maxWidth: "90px",
                        fontWeight: isTeam ? 900 : 800,
                        color: isTeam ? "#9f1239" : "#0f172a",
                        textAlign: "right",
                        paddingRight: "6px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={j.posicion ? `${(j.apodo || j.nombre || "").toUpperCase()} · ${j.posicion}` : j.nombre}
                    >
                      {(j.apodo || j.nombre || "").toUpperCase()}
                    </td>

                    {/* RECUENTO DE LA SUMA TOTAL DE MINUTOS */}
                    <td
                      style={{
                        border: "1px solid #cbd5e1",
                        width: "36px",
                        minWidth: "36px",
                        ...scaleStyle,
                      }}
                    >
                      {sumaMinutos}
                    </td>

                    {/* MINUTOS DISPUTADOS EN CADA PARTIDO Y RIVAL (CON T DE TITULAR A LA DERECHA) */}
                    {partidosFiltrados.map((p) => {
                      const isExcluded = partidosExcluidos.has(p.id);
                      const cell = matrixCellData.get(`${j.id}_${p.id}`) || { mins: 0, esTitular: false };
                      const mins = cell.mins;
                      const esTitular = cell.esTitular;
                      const cellStyle = p.esFuturo
                        ? { background: "transparent", color: "#cbd5e1" }
                        : isTeam
                        ? { background: "#ffe4e6", color: "#9f1239", fontWeight: 800 }
                        : getContadorColorScale(mins, 90);

                      return (
                        <td
                          key={p.id}
                          onClick={() => {
                            if (p.esFuturo || isTeam) return;
                            handleUpdatePlayerMinutes(j, p, mins, esTitular);
                          }}
                          style={{
                            border: "1px solid #cbd5e1",
                            position: "relative",
                            padding: "3px 2px",
                            ...cellStyle,
                            opacity: isExcluded ? 0.35 : 1,
                            cursor: p.esFuturo || isTeam ? "default" : "pointer",
                          }}
                          title={
                            p.esFuturo
                              ? "Partido futuro por disputar"
                              : isTeam
                              ? "TEAM"
                              : `Clic para editar minutos de ${(j.apodo || j.nombre || "").toUpperCase()} vs ${p.rival} (actualmente: ${mins} min)`
                          }
                        >
                          {p.esFuturo ? (
                            ""
                          ) : mins === 0 ? (
                            <span style={{ color: "#cbd5e1" }}>0</span>
                          ) : (
                            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
                              <span>{mins}</span>
                              {esTitular && (
                                <span
                                  style={{
                                    position: "absolute",
                                    right: "2px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    fontSize: "9.5px",
                                    fontWeight: 900,
                                    lineHeight: 1,
                                    color: isTeam ? "inherit" : (mins >= 75 ? "#1e3a8a" : "#0284c7"),
                                    opacity: 0.9,
                                  }}
                                  title="Titular (acumula >45 min o asignado)"
                                >
                                  T
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
            </div>

            {/* RESUMEN RÁPIDO DE RIVALES ENCABEZADOS EN LA MATRIZ */}
            <div className="no-print" style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>🛡️</span>
                  <span>Rivales en este informe ({Array.from(new Set(partidosFiltrados.map((p) => p.rival))).length} equipos)</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveView("rivales")}
                  style={{
                    fontSize: "11px",
                    fontWeight: 800,
                    color: "#e11d48",
                    background: "#fff1f2",
                    border: "1px solid #fecdd3",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    cursor: "pointer",
                  }}
                >
                  Ver análisis completo de rivales →
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
                {Array.from(new Set(partidosFiltrados.map((p) => p.rival))).map((rivName) => {
                  const summary = rivalesSummary.find((s) => s.nombre === rivName);
                  const matches = partidosFiltrados.filter((p) => p.rival === rivName);
                  const escudo = findRivalEscudoUrl(rivName, rivalesList);

                  return (
                    <div
                      key={rivName}
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      {escudo ? (
                        <img
                          src={escudo || undefined}
                          alt={rivName}
                          style={{ width: "32px", height: "32px", objectFit: "contain", flexShrink: 0 }}
                          onError={(e: any) => { e.currentTarget.style.opacity = "0.2"; }}
                        />
                      ) : (
                        <span style={{ fontSize: "20px", opacity: 0.4 }}>🛡️</span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: "12px", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {rivName}
                        </div>
                        <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>
                          {matches.length} partido{matches.length > 1 ? "s" : ""}
                          {summary && summary.partidos.length > summary.pendientes && (
                            <span style={{ marginLeft: "4px", fontWeight: 700, color: summary.victorias > summary.derrotas ? "#15803d" : "#0f172a" }}>
                              ({summary.victorias}V · {summary.empates}E · {summary.derrotas}D)
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const norm = normalizeTeamName(rivName);
                          const isOnlyThis = (excludedRivales.length === listaRivalesNombres.length - 1 && !excludedRivales.includes(norm)) || rivalFiltro === rivName;
                          if (isOnlyThis) {
                            setExcludedRivales([]);
                            setRivalFiltro("TODOS");
                          } else {
                            const allOthers = listaRivalesNombres.map((x) => normalizeTeamName(x)).filter((x) => x !== norm);
                            setExcludedRivales(allOthers);
                            setRivalFiltro("TODOS");
                          }
                        }}
                        style={{
                          fontSize: "10px",
                          fontWeight: 800,
                          padding: "3px 8px",
                          borderRadius: "4px",
                          border: "1px solid #cbd5e1",
                          background: ((excludedRivales.length === listaRivalesNombres.length - 1 && !excludedRivales.includes(normalizeTeamName(rivName))) || rivalFiltro === rivName) ? "#e11d48" : "#ffffff",
                          color: ((excludedRivales.length === listaRivalesNombres.length - 1 && !excludedRivales.includes(normalizeTeamName(rivName))) || rivalFiltro === rivName) ? "#ffffff" : "#475569",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {((excludedRivales.length === listaRivalesNombres.length - 1 && !excludedRivales.includes(normalizeTeamName(rivName))) || rivalFiltro === rivName) ? "Ver todos" : "Filtrar"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* VISTA 2: ANÁLISIS DETALLADO POR RIVALES */}
        {activeView === "rivales" && (
          <div>
            {/* KPI STRIP DE RIVALES */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", marginBottom: "16px" }}>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Total Rivales</div>
                <div style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a", marginTop: "2px" }}>{rivalesSummary.length}</div>
              </div>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Partidos Disputados</div>
                <div style={{ fontSize: "22px", fontWeight: 900, color: "#0284c7", marginTop: "2px" }}>
                  {listaPartidos.filter((p) => !p.esFuturo).length}
                </div>
              </div>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Balance V / E / D</div>
                <div style={{ fontSize: "20px", fontWeight: 900, color: "#15803d", marginTop: "2px" }}>
                  {rivalesSummary.reduce((a, b) => a + b.victorias, 0)}V · {rivalesSummary.reduce((a, b) => a + b.empates, 0)}E · {rivalesSummary.reduce((a, b) => a + b.derrotas, 0)}D
                </div>
              </div>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Partidos Pendientes</div>
                <div style={{ fontSize: "22px", fontWeight: 900, color: "#eab308", marginTop: "2px" }}>
                  {listaPartidos.filter((p) => p.esFuturo).length}
                </div>
              </div>
            </div>

            {/* BUSCADOR Y ACCIONES DE RIVALES */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
              <input
                type="text"
                placeholder="🔍 Buscar rival en el calendario..."
                value={rivalSearch}
                onChange={(e) => setRivalSearch(e.target.value)}
                style={{
                  width: "260px",
                  padding: "7px 12px",
                  fontSize: "12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  outline: "none",
                }}
              />

              <div style={{ display: "flex", gap: "8px" }}>
                <Link
                  href="/ajustes"
                  style={{
                    fontSize: "12px",
                    fontWeight: 800,
                    color: "#0369a1",
                    background: "#f0f9ff",
                    border: "1px solid #bae6fd",
                    borderRadius: "6px",
                    padding: "6px 12px",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  ⚙️ Gestionar y Subir Escudos en Ajustes →
                </Link>
              </div>
            </div>

            {/* GRID DETALLADO DE RIVALES */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "14px" }}>
              {rivalesSummary
                .filter((r) => !rivalSearch || r.nombre.toLowerCase().includes(rivalSearch.toLowerCase()))
                .map((rival) => {
                  const escudo = findRivalEscudoUrl(rival.nombre, rivalesList);
                  const playedCount = rival.partidos.length - rival.pendientes;

                  return (
                    <div
                      key={rival.nombre}
                      style={{
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "16px",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        {/* CABECERA DE LA TARJETA DEL RIVAL */}
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                          {escudo ? (
                            <img
                              src={escudo || undefined}
                              alt={rival.nombre}
                              style={{ width: "42px", height: "42px", objectFit: "contain", background: "#f8fafc", borderRadius: "6px", padding: "3px", border: "1px solid #e2e8f0" }}
                              onError={(e: any) => { e.currentTarget.style.opacity = "0.3"; }}
                            />
                          ) : (
                            <div style={{ width: "42px", height: "42px", borderRadius: "6px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
                              🛡️
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 900, color: "#0f172a" }}>
                              {rival.nombre}
                            </h4>
                            <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "3px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "4px", background: "#f1f5f9", color: "#475569" }}>
                                {rival.partidos.length} partido{rival.partidos.length > 1 ? "s" : ""}
                              </span>
                              {playedCount > 0 ? (
                                <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "4px", background: rival.victorias > rival.derrotas ? "#dcfce7" : "#fef9c3", color: rival.victorias > rival.derrotas ? "#15803d" : "#854d0e" }}>
                                  {rival.victorias}V · {rival.empates}E · {rival.derrotas}D
                                </span>
                              ) : (
                                <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", background: "#f1f5f9", color: "#94a3b8" }}>
                                  Pendiente
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* LISTA DE ENFRENTAMIENTOS */}
                        <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "10px", marginBottom: "12px" }}>
                          <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                            Partidos en Calendario:
                          </span>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {rival.partidos.map((p) => {
                              const badge = getResultBadge(p.resultado, p.localVisitante, p.esFuturo);
                              return (
                                <div
                                  key={p.id}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    fontSize: "11px",
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    background: "#f8fafc",
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span style={{ fontWeight: 800, color: "#0f172a" }}>{p.fecha}</span>
                                    <span style={{ fontSize: "9px", padding: "1px 4px", borderRadius: "3px", background: p.localVisitante === "L" ? "#0284c7" : "#ca8a04", color: "#ffffff", fontWeight: 900 }}>
                                      {p.localVisitante}
                                    </span>
                                    <span style={{ fontSize: "9.5px", color: "#64748b" }}>({p.competicionLabel}{p.competicionTipo === "LIGA" && p.jornadaLabel ? ` · ${p.jornadaLabel}` : ""})</span>
                                  </div>
                                  {p.resultado ? (
                                    <span style={{ fontSize: "10px", fontWeight: 900, padding: "1px 6px", borderRadius: "3px", background: badge.bg, color: badge.text, border: "1px solid " + badge.border, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                                      {badge.outcome === "VICTORIA" && "🟢"}
                                      {badge.outcome === "EMPATE" && "🟡"}
                                      {badge.outcome === "DERROTA" && "🔴"}
                                      {badge.label}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: "10px", color: "#94a3b8", fontStyle: "italic" }}>
                                      {p.esFuturo ? "Próximo" : "Por disputar"}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* TOP JUGADORES CON MÁS MINUTOS ANTE ESTE RIVAL */}
                        {rival.topJugadores.length > 0 && (
                          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "10px", marginBottom: "12px" }}>
                            <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                              Más minutos ante este rival:
                            </span>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                              {rival.topJugadores.map((tj) => (
                                <span
                                  key={tj.jugador.id}
                                  style={{
                                    fontSize: "10.5px",
                                    fontWeight: 700,
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    background: "#f1f5f9",
                                    color: "#334155",
                                  }}
                                >
                                  {(tj.jugador.apodo || tj.jugador.nombre || "").toUpperCase()}: <strong>{tj.minutos}&apos;</strong>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* BOTÓN DE ACCIÓN */}
                      <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "10px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => {
                            const norm = normalizeTeamName(rival.nombre);
                            const allOthers = listaRivalesNombres.map((x) => normalizeTeamName(x)).filter((x) => x !== norm);
                            setExcludedRivales(allOthers);
                            setRivalFiltro("TODOS");
                            setActiveView("matriz");
                          }}
                          style={{
                            fontSize: "11px",
                            fontWeight: 800,
                            padding: "5px 12px",
                            borderRadius: "6px",
                            border: "none",
                            background: "#e11d48",
                            color: "#ffffff",
                            cursor: "pointer",
                          }}
                        >
                          Ver partidos en Matriz →
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

      </div>

      {/* ESTILOS DE IMPRESIÓN Y EXPORTACIÓN PDF HORIZONTAL */}
      <style jsx global>{`
        @page {
          size: landscape;
          margin: 6mm;
        }
        @media print {
          body {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .informe-anual-report-card {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            width: 100% !important;
          }
          table {
            width: 100% !important;
          }
        }
      `}</style>
    </main>
  );
}
