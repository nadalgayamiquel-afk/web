"use client";

// ─── HELPER: AGENDA DINÁMICA DEL DÍA SEGÚN EVENTOS Y PLANIFICACIÓN REAL ───
function getAgendaForDate(
  dateISO: string,
  ses: any,
  bloquesMap: Record<string, any>
): Array<{ time: string; title: string; desc: string; tag: string; tone: string }> {
  const items: Array<{ time: string; title: string; desc: string; tag: string; tone: string }> = [];

  // 1. Filtrar bloques específicos detallados en eventosBloquesMap para la fecha seleccionada
  // Descartamos bloques vacíos sin tipo ni orientación para evitar multiplicaciones
  const rawBlocks = Object.values(bloquesMap || {}).filter(
    (b: any) =>
      b &&
      (b.fecha === dateISO || b.day_id === dateISO || b.day_id === `d_${dateISO}`) &&
      ((b.tipo && b.tipo.trim() !== "") ||
        (b.orientacion && b.orientacion.trim() !== "") ||
        (b.comentario && b.comentario.trim() !== ""))
  );

  // Deduplicación estricta de bloques por (hora + tipo + orientacion/comentario)
  const dedupedBlocks: any[] = [];
  const seenBlockKeys = new Set<string>();

  for (const b of rawBlocks) {
    const tipo = (b.tipo || "").trim().toUpperCase();
    const hora = (b.hora || "").trim();
    const info = (b.orientacion || b.comentario || "").trim().toLowerCase();
    const blockKey = `${hora}__${tipo}__${info}`;
    if (!seenBlockKeys.has(blockKey)) {
      seenBlockKeys.add(blockKey);
      dedupedBlocks.push(b);
    }
  }

  if (dedupedBlocks.length > 0) {
    dedupedBlocks.sort((a: any, b: any) => (a.hora || "10:30").localeCompare(b.hora || "10:30"));
    dedupedBlocks.forEach((b: any) => {
      const tipo = (b.tipo || "").trim().toUpperCase();
      let tag = b.tipo || "CAMPO";
      let tone = "blue";
      if (tipo === "CO") {
        tag = "COADYUVANTE";
        tone = "blue";
      } else if (tipo === "OP") {
        tag = "OPTIMIZADOR";
        tone = "coral";
      } else if (tipo.startsWith("PA") || tipo === "P") {
        tag = "PARTIDO";
        tone = "orange";
      } else if (tipo === "VD") {
        tag = "CHARLA";
        tone = "mint";
      } else if (tipo === "GIM") {
        tag = "FUERZA";
        tone = "blue";
      } else if (tipo === "RED") {
        tag = "MÉDICO";
        tone = "mint";
      }

      const durStr = b.duracion ? `${b.duracion} min` : "";
      const lugarStr = b.lugar || "Instalación";
      const comStr = b.comentario ? `· ${b.comentario}` : "";

      items.push({
        time: b.hora || "10:30",
        title: b.orientacion || b.comentario || `Sesión de ${b.tipo || "Entrenamiento"}`,
        desc: `${lugarStr} ${durStr ? "· " + durStr : ""} ${comStr}`.trim(),
        tag,
        tone,
      });
    });
  } else if (ses) {
    // 2. Si no hay bloques específicos, generar sesiones a partir de la planificación real (sin duplicar)
    const mdStr = (ses.md || "").trim();
    const rival = ses.rival ? ses.rival.trim() : "";
    const evAm = (ses.evento_am || ses.evento_principal || ses.evento || "").trim();
    const evPm = (ses.evento_pm || "").trim();
    const isVisitante = /PV|PAV|VISITANTE/i.test(`${evAm} ${evPm} ${ses.md || ""} ${ses.lugar || ""}`);

    // Partido oficial
    if (rival || mdStr === "MD" || evAm === "Pa" || evPm === "Pa" || evAm === "PL" || evAm === "PV" || evAm === "PAL" || evAm === "PAV") {
      items.push({
        time: "16:30",
        title: "Activación Pre-Partido & Charla Táctica",
        desc: "Vestuario / Sala técnica · Plan de partido y balón parado (30 min)",
        tag: "CHARLA",
        tone: "mint",
      });

      items.push({
        time: "18:00",
        title: rival ? `Partido Oficial vs ${rival}` : "Competición Oficial · Jornada de Liga",
        desc: `${ses.lugar || (isVisitante ? `Campo Visitante (${rival || "Rival"})` : "Nou Estadi Municipal")} · 90 min de competición oficial`,
        tag: "PARTIDO",
        tone: "orange",
      });
    } else {
      // Coadyuvante (Co)
      if (evPm === "Co" || evAm === "Co") {
        items.push({
          time: "10:00",
          title: "Activación Preventiva & Fuerza Coadyuvante (Co)",
          desc: "Gimnasio / Espacio de prevención · Core, isometría y movilidad articular (25 min)",
          tag: "FUERZA",
          tone: "blue",
        });
      }

      // Entrenamiento Principal de Campo (E)
      if (evAm === "E" || evPm === "E" || mdStr.includes("MD")) {
        const mdLabel = mdStr ? `Dinámica ${mdStr}` : "Sesión principal";
        const subLabel = ses.subperiodo ? `· ${ses.subperiodo}` : "";
        items.push({
          time: "10:30",
          title: `Sesión de Campo Principal ${mdStr ? "(" + mdStr + ")" : ""}`,
          desc: `Campo 1 · ${mdLabel} ${subLabel} (75 min)`,
          tag: "CAMPO",
          tone: mdStr.includes("+") ? "mint" : "coral",
        });
      }

      // Optimizador (Op)
      if (evPm === "Op" || evAm === "Op") {
        items.push({
          time: "11:45",
          title: "Trabajo Optimizador / Compensatorio (Op)",
          desc: "Campo 1 / Anexo · Situaciones reducidas y volumen complementario (25 min)",
          tag: "OPTIMIZADOR",
          tone: "blue",
        });
      }

      // Día de descanso / OFF
      if (items.length === 0 && (mdStr === "OFF" || (!evAm && !evPm))) {
        items.push({
          time: "Todo el día",
          title: "Día Libre / Descanso Regenerativo",
          desc: "Sin sesión de entrenamiento programada · Recuperación y descanso",
          tag: "DESCANSO",
          tone: "neutral",
        });
      }
    }
  }

  // Deduplicación final defensiva sobre todos los items generados
  const dedupedFinal: Array<{ time: string; title: string; desc: string; tag: string; tone: string }> = [];
  const seenFinalKeys = new Set<string>();

  for (const it of items) {
    const key = `${(it.time || "").trim()}__${(it.title || "").trim().toLowerCase()}__${(it.tag || "").trim().toLowerCase()}`;
    if (!seenFinalKeys.has(key)) {
      seenFinalKeys.add(key);
      dedupedFinal.push(it);
    }
  }

  return dedupedFinal;
}

import Link from "next/link";
import { useClubConfig } from "@/app/lib/useClubConfig";
import { useState, useEffect, useMemo } from "react";
import { getActiveJugadores, getEstadoDiarioConFechas, getSesionesDiaRange, getAllGpsDatos } from "@/app/actions";
import { DEFAULT_CUSTOM_MICROCICLOS } from "@/app/cargas/CargaExternaSection";
import { extractMicrocyclesFromGpsData, getDeletedMicrocycleIds, CustomMicrocycleDef } from "@/app/lib/microciclos";
import { getSemaforoCategoria, getDisponibilidadInfo } from "@/app/lib/disponibilidad";

type Jugador = {
  id: string;
  nombre: string;
  apodo?: string | null;
  posicion?: string | null;
  dorsal?: string | number | null;
  cor_id?: string | number | null;
  activo?: boolean | null;
  foto_url?: string | null;
  equipo?: string | null;
  temporada?: string | null;
};

type LesionInfo = {
  status: "baja" | "readaptacion" | "disponible";
  text: string;
  dias: number;
};

const teamsBySeason = {
  "2026/27": ["CE Europa"],
  "2025/26": ["AE Prat"],
};

const standaloneScreens = [
  ["▦", "Índice", "/indice"], ["🏃", "Deportistas", "/deportistas"],
  ["📅", "Planificación", "/calendario"], ["📋", "Disponibilidad", "/disponibilidad"],
  ["⚡", "Cargas", "/cargas"], ["🗓️", "Calendario", "/eventos"],
  ["⚽", "Campo", "/campo"], ["🏋️", "Gimnasio", "/gimnasio"], ["🏆", "Partidos", "/partidos"],
  ["📊", "Testing", "/testing"],
] as const;

const reports = [
  { name: "Report Sesión", href: "/informes/gps-diario" },
  { name: "Report Microciclo", href: "/informes/microciclo" },
  { name: "Report Mesociclo", href: "/informes/mesociclo" },
  { name: "Report Anual", href: "/informes/anual" },
  { name: "Report Partidos", href: "/informes/partidos" },
  { name: "Multas", href: "/informes/multas" },
];

const databaseScreens = ["BBDD", "BBDD_GPS", "BBDD_LESIONES", "BBDD_TESTS", "BBDD_FUERZA", "BBDD_CAMPO", "BBDD_EJERCICIOS", "BBDD_EJERCICIOS_CAMPO", "BBDD_RUTINAS", "BBDD_GRUPOS"];

export default function Home() {
  const [seasons, setSeasons] = useState<Array<keyof typeof teamsBySeason>>(["2026/27"]);
  const [team, setTeam] = useState<string>("CE Europa");
  const [isHydrated, setIsHydrated] = useState(false);
  const clubConfig = useClubConfig();

  const [openGroups, setOpenGroups] = useState({ screens: true, reports: false, database: false, settings: false });
  const [cargaTab, setCargaTab] = useState<"interna" | "externa" | "wellness">("interna");
  const [rosterFilter, setRosterFilter] = useState<"todos" | "disponibles" | "bajas" | "readaptacion">("todos");
  const [rosterSearch, setRosterSearch] = useState<string>("");

  // ─── DATOS REALES DE JUGADORES Y DISPONIBILIDAD ───
  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [loadingJugadores, setLoadingJugadores] = useState<boolean>(true);
  const [calendarioDisponibilidadMap, setCalendarioDisponibilidadMap] = useState<Record<string, string>>({});
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [detailedLesiones, setDetailedLesiones] = useState<any[]>([]);
  const [sesionesPlanif, setSesionesPlanif] = useState<any[]>([]);
  const [eventosBloquesMap, setEventosBloquesMap] = useState<Record<string, any>>({});
  const [testingCount, setTestingCount] = useState<number>(0);

  // ─── GPS RECORDS PARA ALARMAS DE HSR ───
  const [gpsRecords, setGpsRecords] = useState<any[]>([]);
  const [loadingGps, setLoadingGps] = useState<boolean>(true);
  const [alarmThreshold, setAlarmThreshold] = useState<number>(50); // 50% umbral solicitado
  const [alarmFilter, setAlarmFilter] = useState<"todos" | "picos" | "descensos">("todos");

  // ─── COMENTARIOS DEL DÍA EN JUGADORES (PERSISTIDOS EN LOCALSTORAGE) ───
  type DailyPlayerComment = {
    id: string;
    playerId: string;
    playerName: string;
    playerPhoto?: string | null;
    posicion?: string | null;
    dateISO: string;
    tag: string;
    comment: string;
    author: string;
    createdAt: string;
  };

  const [dailyComments, setDailyComments] = useState<DailyPlayerComment[]>([]);
  const [externalComments, setExternalComments] = useState<DailyPlayerComment[]>([]);

  const [selectedCommentPlayerId, setSelectedCommentPlayerId] = useState<string>("");
  const [commentTag, setCommentTag] = useState<string>("Médico / Molestias");
  const [commentText, setCommentText] = useState<string>("");

  const saveDailyComments = (newComments: DailyPlayerComment[]) => {
    setDailyComments(newComments);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("daily_player_observations_v2", JSON.stringify(newComments));
      } catch {}
    }
  };

  const handleAddDailyComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCommentPlayerId || !commentText.trim()) return;
    const p = teamJugadores.find((j) => j.id === selectedCommentPlayerId);
    if (!p) return;

    const newEntry: DailyPlayerComment = {
      id: "comment-" + Date.now(),
      playerId: p.id,
      playerName: p.apodo || p.nombre,
      playerPhoto: p.foto_url || null,
      posicion: p.posicion || null,
      dateISO: activeDay.dateISO,
      tag: commentTag,
      comment: commentText.trim(),
      author: "Staff Técnico",
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    saveDailyComments([newEntry, ...dailyComments]);
    setCommentText("");
  };

  const handleDeleteDailyComment = (id: string) => {
    saveDailyComments(dailyComments.filter((c) => c.id !== id));
  };

  useEffect(() => {
    if (clubConfig?.nombreClub) setTeam(clubConfig.nombreClub);
    if (clubConfig?.temporadaActiva) setSeasons([clubConfig.temporadaActiva as any]);
  }, [clubConfig]);

  useEffect(() => {
    setIsHydrated(true);
    if (clubConfig?.nombreClub) setTeam(clubConfig.nombreClub);
    if (clubConfig?.temporadaActiva) setSeasons([clubConfig.temporadaActiva as any]);
    try {
      const savedSeasons = localStorage.getItem("active_seasons");
      if (savedSeasons) {
        const parsed = JSON.parse(savedSeasons);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSeasons(parsed);
        }
      }
      const savedTeam = localStorage.getItem("active_team");
      if (savedTeam) {
        setTeam(savedTeam);
      }

      // Cargar comentarios diarios guardados en cliente sin provocar hydration mismatch
      const savedDaily = localStorage.getItem("daily_player_observations_v2");
      if (savedDaily) {
        const parsedDaily = JSON.parse(savedDaily);
        if (Array.isArray(parsedDaily)) setDailyComments(parsedDaily);
      }
    } catch (e) {}
  }, []);

  // ─── CÁLCULO DE SEMANA / MICROCICLO ACTUAL REAL CON DATOS DE PLANIFICACIÓN ───
  const currentWeekDays = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const distanceToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - distanceToMonday);

    const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

    // Mapa rápido de sesiones por fecha
    const sMap = new Map<string, any>();
    (sesionesPlanif || []).forEach((s) => {
      if (s.fecha) sMap.set(s.fecha, s);
    });

    return dayNames.map((dName, idx) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + idx);
      const isToday = d.toDateString() === now.toDateString();
      const dateISO = d.toISOString().split("T")[0];
      const ses = sMap.get(dateISO);

      const realMd = ses?.md ? String(ses.md).trim() : "";
      const rival = ses?.rival ? String(ses.rival).trim() : "";
      const evAm = ses?.evento_am || ses?.evento_principal || ses?.evento || "";
      const evPm = ses?.evento_pm || "";
      const isVisitante = /PV|PAV|VISITANTE/i.test(`${evAm} ${evPm} ${realMd} ${ses?.lugar || undefined}`);

      // Determinar tono visual y etiqueta
      let tone = "blue";
      let displayMd = realMd || "—";
      let sessionTitle = "Sesión de Entrenamiento";
      let loadText = ses?.carga ? `${ses.carga} AU` : "MEDIA";

      const isMatch = Boolean(rival || realMd === "MD" || evAm === "Pa" || evPm === "Pa" || evAm === "PL" || evAm === "PV" || evAm === "PAL" || evAm === "PAV");
      const isOff = realMd === "OFF" || (!realMd && !evAm && !evPm && !rival);
      const isRecovery = realMd === "+1 MD" || realMd === "+2 MD";

      if (isMatch) {
        tone = "orange";
        displayMd = isVisitante ? "PV" : (realMd || "MD");
        sessionTitle = rival ? `Partido Oficial vs ${rival}` : "Competición Oficial";
        loadText = "MÁXIMA";
      } else if (isOff) {
        tone = "neutral";
        displayMd = "OFF";
        sessionTitle = "Día Libre / Descanso";
        loadText = "DESCANSO";
      } else if (isRecovery) {
        tone = "mint";
        sessionTitle = "Recuperación Activa & Hidroterapia";
        loadText = "BAJA";
      } else {
        tone = "blue";
        sessionTitle = realMd ? `Sesión Táctica (${realMd})` : "Sesión de Campo";
        loadText = realMd === "-4 MD" || realMd === "-3 MD" ? "ALTA" : "MEDIA";
      }

      // Horario estimado o de bloque
      const dayBlocks = Object.values(eventosBloquesMap || {}).filter(
        (b: any) => b && (b.fecha === dateISO || b.day_id === dateISO)
      );
      const timeStr = dayBlocks[0]?.hora ? `${dayBlocks[0].hora}h` : (isMatch ? "18:00h" : isOff ? "Todo el día" : "10:30h");

      return {
        dayName: dName,
        dateNum: String(d.getDate()).padStart(2, "0"),
        dateISO,
        fullDateStr: d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
        md: displayMd,
        rawMd: realMd,
        rival,
        label: realMd || (isMatch ? "Competición" : isOff ? "Descanso" : "Entrenamiento"),
        tone,
        session: sessionTitle,
        time: timeStr,
        load: loadText,
        isToday,
        isMatch,
        subperiodo: ses?.subperiodo || "",
        periodo: ses?.periodo || "",
        ses,
      };
    });
  }, [sesionesPlanif, eventosBloquesMap]);

  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    return (dayOfWeek + 6) % 7;
  });

  const activeDay = currentWeekDays[selectedDayIdx] || currentWeekDays[0];

  // ─── TÍTULO DINÁMICO DEL MICROCICLO ACTUAL ───
  const microcicloInfo = useMemo(() => {
    const mondayISO = currentWeekDays[0]?.dateISO || "";

    // Calcular semana de la temporada (Semana 1 de Manresa = 2026-07-20)
    const isSeason2025 = team === "AE Prat";
    const semana1Start = isSeason2025 ? "2025-07-21" : "2026-07-20";

    let weekNum = 7;
    if (mondayISO && semana1Start) {
      const diffMs = new Date(mondayISO + "T12:00:00").getTime() - new Date(semana1Start + "T12:00:00").getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      weekNum = Math.floor(diffDays / 7) + 1;
    }

    const subperiodo = currentWeekDays.find((d) => d.subperiodo)?.subperiodo || "COMPETITIVO";
    const rival = currentWeekDays.find((d) => d.rival)?.rival || "";

    return {
      weekNum,
      subperiodo,
      rival,
      title: `Microciclo ${weekNum} · ${subperiodo} (${currentWeekDays[0]?.fullDateStr} - ${currentWeekDays[6]?.fullDateStr})${rival ? " · vs " + rival : ""}`,
    };
  }, [currentWeekDays, team]);

  // ─── SESIONES REALES PROGRAMADAS PARA EL DÍA SELECCIONADO ───
  const activeDayAgenda = useMemo(() => {
    return getAgendaForDate(activeDay.dateISO, activeDay.ses, eventosBloquesMap);
  }, [activeDay, eventosBloquesMap]);

  // ─── CARGA DE DISPONIBILIDAD Y PLANIFICACIÓN SINCRONIZADA ───
  const loadDisponibilidadData = async () => {
    let dbMap: Record<string, string> = {};
    let dbSesiones: any[] = [];
    try {
      const [m, s] = await Promise.all([
        getEstadoDiarioConFechas(),
        getSesionesDiaRange(),
      ]);
      dbMap = m || {};
      dbSesiones = s || [];
    } catch (e) {}

    if (typeof window !== "undefined") {
      try {
        const saved1 = localStorage.getItem("disponibilidad_map_v1");
        const saved2 = localStorage.getItem("planificacion_disponibilidad_map");
        const m1 = saved1 ? JSON.parse(saved1) : {};
        const m2 = saved2 ? JSON.parse(saved2) : {};
        setCalendarioDisponibilidadMap({ ...dbMap, ...m1, ...m2 });

        const rawOverrides = localStorage.getItem("disponibilidad_status_overrides_v1");
        if (rawOverrides) setStatusOverrides(JSON.parse(rawOverrides));

        const rawDetailed = localStorage.getItem("lesiones_registro_detallado_v1");
        if (rawDetailed) setDetailedLesiones(JSON.parse(rawDetailed));

        // Sesiones de planificación (localStorage tiene prioridad si se editaron en /calendario)
        const rawDays = localStorage.getItem("planificacion_days_v2");
        if (rawDays) {
          try {
            const parsedDays = JSON.parse(rawDays);
            const seen = new Set();
            const dedup = [];
            for (const d of parsedDays) {
              if (d && d.fecha && !seen.has(d.fecha)) {
                seen.add(d.fecha);
                dedup.push(d);
              }
            }
            setSesionesPlanif(dedup.length > 0 ? dedup : dbSesiones);
          } catch (e) {
            setSesionesPlanif(dbSesiones);
          }
        } else {
          setSesionesPlanif(dbSesiones);
        }

        // Bloques de eventos de sesión
        const rawBloques = localStorage.getItem("eventos_bloques_map_v1");
        if (rawBloques) {
          setEventosBloquesMap(JSON.parse(rawBloques));
        }

        const savedTeam = localStorage.getItem("active_team");
        if (savedTeam && savedTeam !== team) setTeam(savedTeam);
      } catch (e) {
        setCalendarioDisponibilidadMap(dbMap);
        setSesionesPlanif(dbSesiones);
      }
    } else {
      setCalendarioDisponibilidadMap(dbMap);
      setSesionesPlanif(dbSesiones);
    }
  };

  // ─── CARGA DE DATOS AL MONTAR Y REACTIVIDAD ───
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoadingJugadores(true);
        const [activeList, _, allGps] = await Promise.all([
          getActiveJugadores(),
          loadDisponibilidadData(),
          getAllGpsDatos(),
        ]);
        if (!isMounted) return;
        setJugadores((activeList as Jugador[]) || []);
        if (allGps && Array.isArray(allGps)) {
          setGpsRecords(allGps);
        }
        setLoadingGps(false);
        if (!isMounted) return;
        setJugadores((activeList as Jugador[]) || []);

        try {
          const rawIndex = localStorage.getItem("testing_datasets_index");
          const idxList = rawIndex ? JSON.parse(rawIndex) : [];
          setTestingCount(Array.isArray(idxList) ? idxList.length : 0);
        } catch (e) {}
      } catch (err) {
        console.error("Error loading dashboard data:", err);
      } finally {
        if (isMounted) setLoadingJugadores(false);
      }
    }
    loadData();

    window.addEventListener("focus", loadDisponibilidadData);
    window.addEventListener("storage", loadDisponibilidadData);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", loadDisponibilidadData);
      window.removeEventListener("storage", loadDisponibilidadData);
    };
  }, [team]);

  const isPlayerOfTeam = (j: Jugador, teamName: string) => {
    if (j.activo === false) return false;
    const eq = (j.equipo || "").toLowerCase();
    const temp = (j.temporada || "").toLowerCase();
    if (teamName === "AE Prat") {
      return eq.includes("prat") || temp.includes("25") || temp.includes("2025");
    }
    if (teamName === "CE Europa") {
      return eq.includes("europa") || (!eq.includes("prat") && !eq.includes("manresa") && !temp.includes("2025/26"));
    }
    if (teamName === "CE Manresa") {
      return eq.includes("manresa");
    }
    return true;
  };

  const teamJugadores = useMemo(() => {
    return jugadores.filter((j) => isPlayerOfTeam(j, team));
  }, [jugadores, team]);

  // ─── RESOLUCIÓN DINÁMICA DE DISPONIBILIDAD POR JUGADOR ───
  // ─── CÁLCULO DINÁMICO DE ALARMAS GPS (HSR > 50% vs ÚLTIMO MICROCICLO) ───
  const hsrAlarmsData = useMemo(() => {
    if (gpsRecords.length === 0 || teamJugadores.length === 0) {
      return { alerts: [], latestMc: null, prevMc: null };
    }

    let custom: CustomMicrocycleDef[] = DEFAULT_CUSTOM_MICROCICLOS;
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_custom_microcycles");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) custom = parsed;
        }
      } catch {}
    }

    const deletedIds = getDeletedMicrocycleIds();
    const extracted = extractMicrocyclesFromGpsData(gpsRecords, custom);
    const baseList: CustomMicrocycleDef[] = [...custom.filter(c => !deletedIds.includes(c.id))];

    extracted.forEach((ext) => {
      if (deletedIds.includes(ext.id)) return;
      const overlaps = baseList.some(
        (c) =>
          (ext.start >= c.start && ext.start <= c.end) ||
          (ext.end >= c.start && ext.end <= c.end) ||
          (c.start >= ext.start && c.end <= ext.end)
      );
      if (!overlaps) baseList.push(ext);
    });

    baseList.sort((a, b) => a.start.localeCompare(b.start));

    const now = new Date();
    const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // ─── FILTRADO ESTRICTO: SOLO LOS 2 ÚLTIMOS MICROCICLOS TERMINADOS ───
    // Un microciclo se considera terminado cuando su fecha final ya ha concluido antes de hoy (end < todayISO)
    const completedMicrocycles = baseList.filter((mc) => {
      const isCompleted = mc.end < todayISO;
      const hasGpsData = gpsRecords.some((r) => r.fecha >= mc.start && r.fecha <= mc.end);
      return isCompleted && hasGpsData;
    });

    completedMicrocycles.sort((a, b) => a.start.localeCompare(b.start));

    let latestMc: CustomMicrocycleDef | null = null;
    let prevMc: CustomMicrocycleDef | null = null;

    if (completedMicrocycles.length >= 2) {
      latestMc = completedMicrocycles[completedMicrocycles.length - 1]; // Último microciclo terminado
      prevMc = completedMicrocycles[completedMicrocycles.length - 2];   // Penúltimo microciclo terminado
    } else {
      // Fallback si la temporada recién comienza y no hay aún 2 microciclos finalizados
      const withData = baseList.filter((mc) => gpsRecords.some((r) => r.fecha >= mc.start && r.fecha <= mc.end));
      if (withData.length >= 2) {
        latestMc = withData[withData.length - 1];
        prevMc = withData[withData.length - 2];
      } else {
        return { alerts: [], latestMc: null, prevMc: null };
      }
    }

    if (!latestMc || !prevMc) {
      return { alerts: [], latestMc: null, prevMc: null };
    }

    const currentMap = new Map<string, number>();
    const prevMap = new Map<string, number>();

    gpsRecords.forEach((r) => {
      const hsr = Number(r.distancia_z4 || r.hsr || r.metricas?.["HSR Abs (m)"] || r.metricas?.hsr || 0);
      if (r.fecha >= latestMc.start && r.fecha <= latestMc.end) {
        currentMap.set(r.jugador_id, (currentMap.get(r.jugador_id) || 0) + hsr);
      }
      if (r.fecha >= prevMc.start && r.fecha <= prevMc.end) {
        prevMap.set(r.jugador_id, (prevMap.get(r.jugador_id) || 0) + hsr);
      }
    });

    const list: Array<{
      player: Jugador;
      curr: number;
      prev: number;
      diffPct: number;
      diffM: number;
      isSpike: boolean;
      status: string;
    }> = [];

    teamJugadores.forEach((j) => {
      const curr = currentMap.get(j.id) || 0;
      const prev = prevMap.get(j.id) || 0;

      if (prev > 0) {
        const diffPct = Math.round(((curr - prev) / prev) * 100);
        if (Math.abs(diffPct) >= alarmThreshold) {
          list.push({
            player: j,
            curr,
            prev,
            diffPct,
            diffM: curr - prev,
            isSpike: diffPct > 0,
            status: diffPct > 0 ? "Pico Agudo" : "Descenso Brusco",
          });
        }
      } else if (curr >= 200) {
        list.push({
          player: j,
          curr,
          prev: 0,
          diffPct: 100,
          diffM: curr,
          isSpike: true,
          status: "Nuevo Pico (>200m)",
        });
      }
    });

    list.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));

    return { alerts: list, latestMc, prevMc };
  }, [gpsRecords, teamJugadores, alarmThreshold]);

  const filteredHsrAlerts = useMemo(() => {
    if (alarmFilter === "picos") return hsrAlarmsData.alerts.filter((a) => a.isSpike);
    if (alarmFilter === "descensos") return hsrAlarmsData.alerts.filter((a) => !a.isSpike);
    return hsrAlarmsData.alerts;
  }, [hsrAlarmsData.alerts, alarmFilter]);

  // ─── FECHAS DE LOS ÚLTIMOS 4 DÍAS ───
  const last4DaysList = useMemo(() => {
    const list: Array<{ dateISO: string; label: string; relative: string; dayName: string }> = [];
    const now = new Date();
    const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

    for (let i = 0; i < 4; i++) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      let relative = "";
      if (i === 0) relative = "Hoy";
      else if (i === 1) relative = "Ayer";
      else if (i === 2) relative = "Hace 2 días";
      else relative = "Hace 3 días";

      list.push({
        dateISO: iso,
        label: `${d.getDate()} ${monthNames[d.getMonth()]}`,
        relative,
        dayName: dayNames[d.getDay()],
      });
    }
    return list;
  }, []);

  const [commentDayFilter, setCommentDayFilter] = useState<string>("todos");
  const [commentSearch, setCommentSearch] = useState<string>("");

  // Recopilar todos los comentarios de todos los jugadores de los últimos 4 días
  const last4DaysPlayerComments = useMemo(() => {
    if (!isHydrated) return [];
    const validDates = new Set(last4DaysList.map((d) => d.dateISO));
    const items: DailyPlayerComment[] = [];
    const seen = new Set<string>();

    // 1. De dailyComments (daily_player_observations_v2)
    dailyComments.forEach((c) => {
      if (validDates.has(c.dateISO)) {
        const key = `${c.playerId}_${c.dateISO}_${c.comment.slice(0, 20)}`;
        if (!seen.has(key)) {
          seen.add(key);
          items.push(c);
        }
      }
    });

    // 2. De disponibilidad_player_comments_v1 en localStorage
    if (typeof window !== "undefined") {
      try {
        const rawDisp = localStorage.getItem("disponibilidad_player_comments_v1");
        if (rawDisp) {
          const mapObj = JSON.parse(rawDisp);
          Object.entries(mapObj).forEach(([k, text]) => {
            if (!text || typeof text !== "string" || !text.trim()) return;
            const lastUnderscore = k.lastIndexOf("_");
            if (lastUnderscore <= 0) return;
            const pId = k.substring(0, lastUnderscore);
            const dateISO = k.substring(lastUnderscore + 1);

            if (validDates.has(dateISO)) {
              const key = `${pId}_${dateISO}_${text.slice(0, 20)}`;
              if (!seen.has(key)) {
                seen.add(key);
                const p = teamJugadores.find((j) => j.id === pId);
                items.push({
                  id: `disp-${k}`,
                  playerId: pId,
                  playerName: p?.apodo || p?.nombre || pId,
                  playerPhoto: p?.foto_url || null,
                  posicion: p?.posicion || null,
                  dateISO,
                  tag: "Disponibilidad / Campo",
                  comment: text.trim(),
                  author: "Cuerpo Técnico",
                  createdAt: "Sesión",
                });
              }
            }
          });
        }
      } catch {}

      // 3. De comentarios_jugadores_v2 & planificacion_comentarios_v1
      try {
        const rawCom = localStorage.getItem("comentarios_jugadores_v2");
        const rawPlan = localStorage.getItem("planificacion_comentarios_v1");
        const allStored = [
          ...(rawCom ? JSON.parse(rawCom) : []),
          ...(rawPlan ? JSON.parse(rawPlan) : []),
        ];

        allStored.forEach((c) => {
          if (!c || !c.jugador_id || c.jugador_id === "TEAM" || !c.texto) return;
          const dateISO = c.fecha || c.day_id;
          if (dateISO && validDates.has(dateISO)) {
            const key = `${c.jugador_id}_${dateISO}_${c.texto.slice(0, 20)}`;
            if (!seen.has(key)) {
              seen.add(key);
              const p = teamJugadores.find((j) => j.id === c.jugador_id);
              let tag = "General";
              if (c.tipo === "FIS" || c.tipo === "OTR") tag = "Médico / Molestias";
              else if (c.tipo === "WEL") tag = "Carga / Fatiga";
              else if (c.tipo === "TEC") tag = "Técnico / Táctico";
              else if (c.tipo === "CON") tag = "Físico";

              items.push({
                id: `stored-${c.jugador_id}-${dateISO}-${items.length}`,
                playerId: c.jugador_id,
                playerName: p?.apodo || p?.nombre || c.jugador_id,
                playerPhoto: p?.foto_url || null,
                posicion: p?.posicion || null,
                dateISO,
                tag,
                comment: c.texto.trim(),
                author: "Staff",
                createdAt: "Informe",
              });
            }
          }
        });
      } catch {}
    }

    // 4. Si la lista está vacía, proporcionar observaciones de demostración contextualizadas en el equipo
    if (items.length === 0 && teamJugadores.length > 0) {
      const d0 = last4DaysList[0]?.dateISO || "2026-11-05";
      const d1 = last4DaysList[1]?.dateISO || "2026-11-04";
      const d2 = last4DaysList[2]?.dateISO || "2026-11-03";
      const d3 = last4DaysList[3]?.dateISO || "2026-11-02";

      const pCampeny = teamJugadores.find((j) => (j.nombre || "").toUpperCase().includes("CAMPENY")) || teamJugadores[0];
      const pExp = teamJugadores.find((j) => (j.nombre || "").toUpperCase().includes("EXPÓSITO") || (j.nombre || "").toUpperCase().includes("EXPOSITO")) || teamJugadores[1];
      const pPad = teamJugadores.find((j) => (j.nombre || "").toUpperCase().includes("PADILLO")) || teamJugadores[2];
      const pTito = teamJugadores.find((j) => (j.nombre || "").toUpperCase().includes("TITO")) || teamJugadores[3];
      const pCano = teamJugadores.find((j) => (j.nombre || "").toUpperCase().includes("CANO")) || teamJugadores[4];

      if (pCampeny) {
        items.push({
          id: "demo-1",
          playerId: pCampeny.id,
          playerName: pCampeny.apodo || pCampeny.nombre,
          playerPhoto: pCampeny.foto_url || null,
          posicion: pCampeny.posicion || "CENTRAL IZQ",
          dateISO: d0,
          tag: "Médico / Molestias",
          comment: "Molestias leves en el bíceps femoral de la pierna derecha al finalizar la tarea reducida. Realiza trabajo preventivo y descarga con fisioterapeuta.",
          author: "Cuerpo Médico",
          createdAt: "10:15",
        });
      }
      if (pExp) {
        items.push({
          id: "demo-2",
          playerId: pExp.id,
          playerName: pExp.apodo || pExp.nombre,
          playerPhoto: pExp.foto_url || null,
          posicion: pExp.posicion || "INTERIOR DERECHO",
          dateISO: d0,
          tag: "Físico",
          comment: "Muy buena respuesta al estímulo de alta velocidad. Completa el 100% del volumen programado de carrera a alta intensidad sin fatiga residual.",
          author: "Prep. Físico",
          createdAt: "11:30",
        });
      }
      if (pPad) {
        items.push({
          id: "demo-3",
          playerId: pPad.id,
          playerName: pPad.apodo || pPad.nombre,
          playerPhoto: pPad.foto_url || null,
          posicion: pPad.posicion || "CARRIL DERECHO",
          dateISO: d1,
          tag: "Carga / Fatiga",
          comment: "Buena integración al ritmo competitivo tras alta. Acumula minutos de aceleraciones y desaceleraciones óptimas en tareas tácticas.",
          author: "Cuerpo Técnico",
          createdAt: "12:00",
        });
      }
      if (pTito) {
        items.push({
          id: "demo-4",
          playerId: pTito.id,
          playerName: pTito.apodo || pTito.nombre,
          playerPhoto: pTito.foto_url || null,
          posicion: pTito.posicion || "PIVOTE",
          dateISO: d2,
          tag: "Técnico / Táctico",
          comment: "Excelente posicionamiento en las basculaciones defensivas y transiciones. Reporta sensaciones óptimas de recuperación post-partido.",
          author: "Segundo Entrenador",
          createdAt: "17:45",
        });
      }
      if (pCano) {
        items.push({
          id: "demo-5",
          playerId: pCano.id,
          playerName: pCano.apodo || pCano.nombre,
          playerPhoto: pCano.foto_url || null,
          posicion: pCano.posicion || "CARRIL DERECHO",
          dateISO: d3,
          tag: "Carga / Fatiga",
          comment: "Fatiga muscular general tras doble partido. Se pauta protocolo de baño de contraste y trabajo regenerativo guiado.",
          author: "Prep. Físico",
          createdAt: "18:20",
        });
      }
    }

    // Ordenar cronológicamente descendente
    return items.sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  }, [isHydrated, dailyComments, last4DaysList, teamJugadores]);

  const filteredLast4Comments = useMemo(() => {
    return last4DaysPlayerComments.filter((c) => {
      if (commentDayFilter !== "todos" && c.dateISO !== commentDayFilter) return false;
      if (commentSearch.trim()) {
        const q = commentSearch.toLowerCase().trim();
        const matchName = (c.playerName || "").toLowerCase().includes(q);
        const matchText = (c.comment || "").toLowerCase().includes(q);
        const matchTag = (c.tag || "").toLowerCase().includes(q);
        const matchPos = (c.posicion || "").toLowerCase().includes(q);
        if (!matchName && !matchText && !matchTag && !matchPos) return false;
      }
      return true;
    });
  }, [last4DaysPlayerComments, commentDayFilter, commentSearch]);

  const todayPlayerComments = useMemo(() => {
    return dailyComments.filter((c) => c.dateISO === activeDay.dateISO);
  }, [dailyComments, activeDay.dateISO]);

  const playerStatusMap = useMemo(() => {
    const map: Record<string, LesionInfo> = {};
    const targetDate = activeDay?.dateISO || new Date().toISOString().split("T")[0];

    const isSeason2025 = team === "AE Prat";
    const seasonStart = isSeason2025 ? "2025-07-01" : "2026-07-01";
    const seasonEnd = isSeason2025 ? "2026-06-30" : "2027-06-30";

    teamJugadores.forEach((j) => {
      // 1. Override manual explícito en Disponibilidad
      const override = statusOverrides[`${j.id}_${targetDate}`] || statusOverrides[j.id];
      if (override) {
        if (override === "verde") {
          map[j.id] = { status: "disponible", text: "Disponible (D)", dias: 0 };
          return;
        } else if (override === "amarillo") {
          map[j.id] = { status: "readaptacion", text: "Readaptación (P)", dias: 0 };
          return;
        } else if (override === "rojo") {
          map[j.id] = { status: "baja", text: "Baja Médica (L)", dias: 0 };
          return;
        } else if (override === "gris") {
          map[j.id] = { status: "disponible", text: "Apto / Sin incidencias", dias: 0 };
          return;
        }
      }

      // 2. Estado en Calendario / Planificación
      let calCode =
        calendarioDisponibilidadMap[`${j.id}_${targetDate}`] ||
        calendarioDisponibilidadMap[`${j.id}_day_${targetDate}`];

      // Si no hay código el día seleccionado, consultar la última sesión registrada en la temporada
      if (!calCode) {
        const playerDates = Object.keys(calendarioDisponibilidadMap)
          .filter((k) => k.startsWith(`${j.id}_`) && !k.includes("day_") && !k.includes("undefined"))
          .map((k) => k.replace(`${j.id}_`, ""))
          .filter((f) => f >= seasonStart && f <= seasonEnd && f !== "2026-08-30" && f !== "30-08-2026")
          .sort();

        if (playerDates.length > 0) {
          const latestDate = playerDates[playerDates.length - 1];
          calCode = calendarioDisponibilidadMap[`${j.id}_${latestDate}`];
        }
      }

      if (calCode && calCode.trim()) {
        const cat = getSemaforoCategoria(calCode);
        const info = getDisponibilidadInfo(calCode);
        const label = info ? info.nombre : calCode;

        if (cat === "verde") {
          map[j.id] = { status: "disponible", text: `Disponible (${label})`, dias: 0 };
          return;
        } else if (cat === "amarillo") {
          map[j.id] = { status: "readaptacion", text: `Readaptación (${label})`, dias: 0 };
          return;
        } else if (cat === "rojo") {
          map[j.id] = { status: "baja", text: `Baja Médica (${label})`, dias: 0 };
          return;
        }
      }

      // 3. Lesión activa de la temporada en curso (excluyendo 30-08-2026)
      const jLesions = detailedLesiones.filter(
        (l) =>
          (l.jugador_id === j.id || (l.jugador_nombre && l.jugador_nombre.toLowerCase() === j.nombre.toLowerCase())) &&
          l.fecha &&
          l.fecha >= seasonStart &&
          l.fecha <= seasonEnd &&
          l.fecha !== "2026-08-30" &&
          l.fecha !== "30-08-2026"
      );

      const activeBaja = jLesions.find(
        (l) =>
          (l.resultado === "Con baja" || l.estado === "Baja Médica" || (l.dias_baja && Number(l.dias_baja) > 7)) &&
          l.estado !== "Alta Médica" &&
          l.resultado !== "Alta Médica"
      );

      const activeRehab = jLesions.find(
        (l) =>
          (l.estado === "Readaptación" || (l.dias_baja && Number(l.dias_baja) > 0)) &&
          l.estado !== "Alta Médica" &&
          l.resultado !== "Alta Médica"
      );

      if (activeBaja) {
        map[j.id] = {
          status: "baja",
          text: activeBaja.region_corporal || "Baja Médica",
          dias: Number(activeBaja.dias_baja || 0),
        };
        return;
      } else if (activeRehab) {
        map[j.id] = {
          status: "readaptacion",
          text: activeRehab.region_corporal || "Readaptación",
          dias: Number(activeRehab.dias_baja || 0),
        };
        return;
      }

      // 4. Por defecto: Apto / Disponible
      map[j.id] = { status: "disponible", text: "Apto / Disponible", dias: 0 };
    });

    return map;
  }, [teamJugadores, activeDay, statusOverrides, calendarioDisponibilidadMap, detailedLesiones, team]);

  // ─── ESTADÍSTICAS GLOBALES DE PLANTILLA ───
  const stats = useMemo(() => {
    const total = teamJugadores.length;
    let bajas = 0;
    let readaptacion = 0;
    let disponibles = 0;

    teamJugadores.forEach((j) => {
      const st = playerStatusMap[j.id]?.status || "disponible";
      if (st === "baja") bajas++;
      else if (st === "readaptacion") readaptacion++;
      else disponibles++;
    });

    const disponibilidadPct = total > 0 ? Math.round((disponibles / total) * 100) : 100;

    return {
      total,
      bajas,
      readaptacion,
      disponibles,
      disponibilidadPct,
    };
  }, [teamJugadores, playerStatusMap]);

  // ─── FILTRADO DE JUGADORES EN EL PANEL ───
  const filteredJugadores = useMemo(() => {
    return teamJugadores.filter((j) => {
      const st = playerStatusMap[j.id]?.status || "disponible";
      if (rosterFilter === "disponibles" && st !== "disponible") return false;
      if (rosterFilter === "bajas" && st !== "baja") return false;
      if (rosterFilter === "readaptacion" && st !== "readaptacion") return false;

      if (rosterSearch.trim()) {
        const query = rosterSearch.toLowerCase();
        const matchName = j.nombre?.toLowerCase().includes(query);
        const matchPos = j.posicion?.toLowerCase().includes(query);
        const matchDorsal = String(j.dorsal || j.cor_id || "").includes(query);
        if (!matchName && !matchPos && !matchDorsal) return false;
      }
      return true;
    });
  }, [teamJugadores, playerStatusMap, rosterFilter, rosterSearch]);

  const availableTeams = Array.from(new Set(seasons.flatMap((seasonOption) => teamsBySeason[seasonOption])));

  const handleSeasonToggle = (nextSeason: keyof typeof teamsBySeason) => {
    const nextSeasons = seasons.includes(nextSeason)
      ? seasons.filter((seasonOption) => seasonOption !== nextSeason)
      : seasons.length < 2
      ? [...seasons, nextSeason]
      : seasons;

    if (nextSeasons.length === 0) return;
    setSeasons(nextSeasons);
    if (typeof window !== "undefined") {
      localStorage.setItem("active_seasons", JSON.stringify(nextSeasons));
    }
    const nextAvailableTeams = Array.from(new Set(nextSeasons.flatMap((seasonOption) => teamsBySeason[seasonOption])));
    if (!nextAvailableTeams.includes(team)) {
      setTeam(nextAvailableTeams[0]);
      if (typeof window !== "undefined") {
        localStorage.setItem("active_team", nextAvailableTeams[0]);
      }
    }
  };

  const handleTeamChange = (newTeam: string) => {
    setTeam(newTeam);
    if (typeof window !== "undefined") {
      localStorage.setItem("active_team", newTeam);
    }
  };

  const toggleGroup = (group: keyof typeof openGroups) => {
    setOpenGroups((current) => ({ ...current, [group]: !current[group] }));
  };

  const todayFormatted = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="app-shell">
      {/* ─── BARRA LATERAL (SIDEBAR EXACTA ORIGINAL) ─── */}
      <aside className="sidebar">
        
        
        <div className="brand-header" style={{ padding: "20px 0", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <img
            src={clubConfig?.escudoUrl || "/ce-europa.png"}
            alt={clubConfig?.nombreClub || "Club"}
            style={{ width: "64px", height: "72px", objectFit: "contain" }}
            onError={(e) => { (e.target as HTMLImageElement).src = "/ce-europa.png"; }}
          />
          <div style={{ marginTop: "12px", fontSize: "14px", fontWeight: "bold", color: "#f8fafc", textAlign: "center" }}>
            {clubConfig?.nombreClub || "CE Europa"}
          </div>
        </div>
        <nav className="main-nav" aria-label="Navegación principal">
          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.screens} onClick={() => toggleGroup("screens")}><span>PANTALLAS</span><b>{openGroups.screens ? "−" : "+"}</b></button>
          {openGroups.screens && (
            <div className="nav-group-list">
              <a className="nav-link active" href="/indice"><span>▦</span> Índice</a>
              <a className="nav-link" href="/deportistas"><span>🏃</span> Deportistas</a>
              <a className="nav-link" href="/calendario"><span>📅</span> Planificación</a>
              <a className="nav-link" href="/disponibilidad"><span>📋</span> Disponibilidad</a>
              <a className="nav-link" href="/cargas"><span>⚡</span> Cargas</a>

              {standaloneScreens.slice(5).map(([icon, label, href]) => (
                <a className="nav-link" href={href} key={label}><span>{icon}</span> {label}</a>
              ))}
            </div>
          )}
          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.reports} onClick={() => toggleGroup("reports")}><span>INFORMES</span><b>{openGroups.reports ? "−" : "+"}</b></button>
          {openGroups.reports && <div className="nav-group-list">{reports.map((item) => <a className="nav-link" href={item.href} key={item.name}><span>▤</span> {item.name}</a>)}</div>}
          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.database} onClick={() => toggleGroup("database")}><span>BASE DE DATOS</span><b>{openGroups.database ? "−" : "+"}</b></button>
          {openGroups.database && <div className="nav-group-list">{databaseScreens.map((label) => <a className="nav-link" href={label.toLowerCase() === "bbdd" ? "/base-datos/bbdd" : ("/base-datos/" + label.toLowerCase())} key={label}><span>▥</span> {label}</a>)}</div>}
          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.settings} onClick={() => toggleGroup("settings")}><span>AJUSTES</span><b>{openGroups.settings ? "−" : "+"}</b></button>
          {openGroups.settings && <div className="nav-group-list"><a className="nav-link" href="/ajustes"><span>⚙️</span> Configuración General</a></div>}
        </nav>
        <div className="sidebar-footer" suppressHydrationWarning><div className="sync-status"><span className="online-dot" /> Datos sincronizados <small>hace 4 min</small></div><div className="profile"><div className="avatar">MN</div><div><strong>Miquel Nadal</strong><small>Staff técnico</small></div><span>···</span></div></div>
      </aside>

      {/* ─── CONTENIDO PRINCIPAL (DASHBOARD REAL) ─── */}
      <section className="content" id="resumen">
        {/* TOPBAR */}
        <header className="topbar">
          <div>
            <span className="breadcrumb">CENTRO DE CONTROL / <strong>RESUMEN DE RENDIMIENTO</strong></span>
            <h1 suppressHydrationWarning>
              Panel de Control · {team}
              <span style={{ fontSize: "12px", background: "#10b981", color: "#ffffff", padding: "3px 10px", borderRadius: "12px", marginLeft: "12px", fontWeight: 800, verticalAlign: "middle" }}>
                ● EN VIVO
              </span>
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b", textTransform: "capitalize" }} suppressHydrationWarning>
              {todayFormatted} · Microciclo en curso
            </p>
          </div>
          <div className="header-actions">
            <Link
              href="/calendario"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "8px",
                background: "#1e3a8a",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 800,
                textDecoration: "none",
                boxShadow: "0 1px 3px rgba(30, 58, 138, 0.25)",
              }}
            >
              <span>📅</span> Ver Planificación
            </Link>
          </div>
        </header>

        {/* ─── GRID DE CARDS & PANELES ─── */}
        <div className="dashboard-grid">
          
          {/* HERO CARD RESUMEN DEL DÍA (COMPACTO Y SIN ESPACIOS VACÍOS) */}
          <section
            className="hero-card"
            style={{
              gridColumn: "span 2",
              minHeight: "unset",
              padding: "18px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "18px",
              background: "linear-gradient(135deg, #f05e4d 0%, #ee7567 100%)",
              borderRadius: "12px",
              boxShadow: "0 2px 10px rgba(238, 117, 103, 0.22)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                <span className="eyebrow light" style={{ margin: 0, fontSize: "10.5px", letterSpacing: "0.06em", opacity: 0.9 }}>
                  {activeDay.dayName.toUpperCase()} · {activeDay.md}
                </span>
                <span style={{ fontSize: "10.5px", fontWeight: 800, background: "rgba(255,255,255,0.22)", color: "#ffffff", padding: "1px 7px", borderRadius: "4px" }}>
                  {activeDay.fullDateStr}
                </span>
                {activeDay.isToday && (
                  <span style={{ fontSize: "10px", fontWeight: 900, background: "#ffffff", color: "#ee7567", padding: "1px 6px", borderRadius: "4px" }}>
                    HOY
                  </span>
                )}
              </div>
              <h2 style={{ margin: "4px 0 6px 0", fontSize: "22px", fontWeight: 800, lineHeight: 1.2, color: "#ffffff", letterSpacing: "-0.02em" }}>
                {activeDay.session}
              </h2>
              <p style={{ margin: 0, fontSize: "12.5px", color: "rgba(255,255,255,0.92)", lineHeight: 1.4 }}>
                ⏰ {activeDay.time} &nbsp;|&nbsp; ⚡ Carga programada: <strong>{activeDay.load}</strong>
                {activeDay.subperiodo ? ` · ${activeDay.subperiodo}` : ""}
              </p>
            </div>

            <div
              style={{
                flexShrink: 0,
                width: "84px",
                height: "84px",
                borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.5)",
                background: "rgba(0,0,0,0.1)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              }}
            >
              <span style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.85)", fontWeight: 700 }}>
                DISP.
              </span>
              <strong style={{ fontSize: "21px", color: "#ffffff", fontWeight: 900, lineHeight: 1.1 }}>
                {stats.disponibilidadPct}%
              </strong>
            </div>
          </section>

          {/* CARD DISPONIBILIDAD REAL MEJORADA (COLUMNA DERECHA) */}
          <section
            className="metric-card"
            style={{
              gridColumn: "span 1",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "16px 18px",
              borderRadius: "12px",
            }}
          >
            <div>
              <div className="card-heading">
                <span className="eyebrow">DISPONIBILIDAD DE PLANTILLA</span>
                <span className={"trend " + (stats.disponibilidadPct >= 85 ? "up" : "neutral-trend")}>
                  {stats.disponibilidadPct >= 85 ? "🟢 Óptimo" : "⚠️ En Seguimiento"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                <div className="metric-value">
                  {stats.disponibilidadPct}<span>%</span>
                </div>
                <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
                  ({stats.disponibles} de {stats.total} aptos)
                </span>
              </div>
              <div className="progress" style={{ margin: "6px 0" }}>
                <span style={{ width: stats.disponibilidadPct + "%", background: stats.disponibilidadPct >= 85 ? "#10b981" : "#f59e0b" }} />
              </div>
              <div style={{ display: "flex", gap: "6px", fontSize: "11px", fontWeight: 700, flexWrap: "wrap", marginTop: "2px" }}>
                <span style={{ color: "#16a34a", background: "#f0fdf4", padding: "2px 6px", borderRadius: "4px" }}>
                  ● {stats.disponibles} Aptos
                </span>
                <span style={{ color: "#d97706", background: "#fffbeb", padding: "2px 6px", borderRadius: "4px" }}>
                  ● {stats.readaptacion} Readaptación
                </span>
                <span style={{ color: "#dc2626", background: "#fef2f2", padding: "2px 6px", borderRadius: "4px" }}>
                  ● {stats.bajas} Bajas
                </span>
              </div>
            </div>

            {/* Listado rápido de bajas y readaptación */}
            <div style={{ marginTop: "8px", paddingTop: "6px", borderTop: "1px dashed #e2e8f0" }}>
              {(stats.bajas > 0 || stats.readaptacion > 0) ? (
                <div>
                  <div style={{ fontSize: "9.5px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: "3px" }}>
                    En seguimiento médico:
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {teamJugadores.filter(j => playerStatusMap[j.id]?.status === "baja" || playerStatusMap[j.id]?.status === "readaptacion").slice(0, 2).map(j => {
                      const st = playerStatusMap[j.id];
                      const isBaja = st?.status === "baja";
                      return (
                        <div key={j.id} style={{ fontSize: "10.5px", display: "flex", alignItems: "center", justifyContent: "space-between", color: isBaja ? "#dc2626" : "#d97706" }}>
                          <span style={{ fontWeight: 700 }}>{j.apodo || j.nombre}</span>
                          <span style={{ fontSize: "9.5px", opacity: 0.85 }}>{st?.text || (isBaja ? "Baja médica" : "Readaptación")}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "10.5px", color: "#16a34a", fontWeight: 700 }}>
                  ✅ 100% de la plantilla disponible
                </div>
              )}
              <div style={{ marginTop: "6px" }}>
                <Link href="/disponibilidad" style={{ fontSize: "10.5px", fontWeight: 800, color: "#1e3a8a", textDecoration: "none" }}>
                  Ver disponibilidad completa ↗
                </Link>
              </div>
            </div>
          </section>

          {/* ─── PANEL MICROCICLO SEMANAL INTERACTIVO ─── */}
          <section className="panel week-panel" id="planificacion" suppressHydrationWarning>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">SEMANA EN CURSO</span>
                <h3>{microcicloInfo.title}</h3>
              </div>
              <Link href="/calendario" className="text-button">
                Planificación Completa <span>↗</span>
              </Link>
            </div>

            {/* Tira de 7 días */}
            <div className="week-strip">
              {currentWeekDays.map((day, idx) => {
                const nowISO = new Date().toISOString().split("T")[0];
                const isRealToday = day.dateISO === nowISO;
                return (
                  <div
                    key={day.dayName}
                    className={"day-cell " + (selectedDayIdx === idx ? "selected" : "")}
                    onClick={() => setSelectedDayIdx(idx)}
                    style={{
                      cursor: "pointer",
                      position: "relative",
                      border: isRealToday ? "2px solid #1e3a8a" : undefined,
                    }}
                  >
                    {isRealToday && (
                      <span
                        style={{
                          position: "absolute",
                          top: "-8px",
                          left: "50%",
                          transform: "translateX(-50%)",
                          background: "#1e3a8a",
                          color: "#ffffff",
                          fontSize: "8.5px",
                          fontWeight: 900,
                          padding: "1px 5px",
                          borderRadius: "6px",
                          letterSpacing: "0.02em",
                        }}
                      >
                        HOY
                      </span>
                    )}
                    <span style={{ fontSize: "11px", fontWeight: 700 }}>{day.dayName}</span>
                    <strong>{day.dateNum}</strong>
                    <small style={{ fontWeight: 800, color: day.md === "MATCH" ? "#ea580c" : "#1e3a8a" }}>{day.md}</small>
                    <span className={"day-dot " + day.tone} />
                  </div>
                );
              })}
            </div>

            {/* Detalle del día seleccionado */}
            <div className="selected-session" style={{ marginTop: "12px" }}>
              <div className="session-date">
                <strong>{activeDay.dateNum}</strong>
                <span>{activeDay.dayName.toUpperCase()}</span>
              </div>
              <div className="session-info">
                <h4 style={{ fontSize: "14px", fontWeight: 800, margin: 0, color: "#0f172a" }}>
                  {activeDay.session}
                </h4>
                <p style={{ fontSize: "12px", color: "#64748b", margin: "3px 0 0" }}>
                  📍 {activeDay.time} &nbsp;·&nbsp; Dinámica: {activeDay.label} {activeDay.subperiodo ? `· ${activeDay.subperiodo}` : ""}
                </p>
              </div>
              <span className={"load-pill " + activeDay.tone} style={{ alignSelf: "center" }}>
                {activeDay.load.toUpperCase()}
              </span>
            </div>
          </section>

          {/* ─── PANEL SESIONES DEL DÍA (AGENDA REAL SINCRONIZADA) ─── */}
          <section className="panel sessions-panel" id="eventos" suppressHydrationWarning>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">AGENDA DEL DÍA ({activeDay.fullDateStr.toUpperCase()})</span>
                <h3>Sesiones Programadas · {activeDay.md}</h3>
              </div>
              <Link href="/campo" className="round-arrow" title="Ver campo">
                →
              </Link>
            </div>
            <div className="session-list">
              {activeDayAgenda.length === 0 ? (
                <div style={{ padding: "24px 16px", textAlign: "center", color: "#64748b", fontSize: "12px", background: "#f8fafc", borderRadius: "8px" }}>
                  <p style={{ margin: "0 0 6px", fontWeight: 700 }}>🛌 Sin sesiones programadas para este día</p>
                  <span style={{ fontSize: "11px", color: "#94a3b8" }}>Día de descanso o sin tareas registradas en la planificación.</span>
                </div>
              ) : (
                activeDayAgenda.map((item, idx) => (
                  <div key={idx} className="agenda-row">
                    <time>{item.time}</time>
                    <div>
                      <div className="agenda-line">
                        <span className={`agenda-dot ${item.tone}`} />
                        <strong>{item.title}</strong>
                      </div>
                      <p>{item.desc}</p>
                    </div>
                    <span className={`event-tag ${item.tone}`}>{item.tag}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* ─── 🚨 PANEL DE ALARMAS DE CARGA GPS (HSR > 50% vs ÚLTIMO MICROCICLO) ─── */}
          <section
            className="panel"
            suppressHydrationWarning
            style={{
              gridColumn: "span 3",
              background: "#ffffff",
              padding: "18px 22px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                marginBottom: "14px",
                paddingBottom: "10px",
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 900, color: "#dc2626", background: "#fef2f2", padding: "3px 8px", borderRadius: "6px", letterSpacing: "0.04em" }}>
                    🚨 CONTROL DE SOBRECARGA GPS · 2 ÚLTIMOS MICROCICLOS TERMINADOS
                  </span>
                  {hsrAlarmsData.latestMc && hsrAlarmsData.prevMc && (
                    <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                      Comparando: <strong>{hsrAlarmsData.prevMc.nombre || `${hsrAlarmsData.prevMc.start} al ${hsrAlarmsData.prevMc.end}`}</strong> ➔ <strong>{hsrAlarmsData.latestMc.nombre || `${hsrAlarmsData.latestMc.start} al ${hsrAlarmsData.latestMc.end}`}</strong> (Semanas Completas Finalizadas)
                    </span>
                  )}
                </div>
                <h3 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: "4px 0 0 0" }}>
                  Alarmas de HSR (Variación &gt; {alarmThreshold}% en Alta Velocidad)
                </h3>
              </div>

              {/* Filtros de la alarma */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: "6px", padding: "2px", border: "1px solid #cbd5e1" }}>
                  <button
                    type="button"
                    onClick={() => setAlarmFilter("todos")}
                    style={{
                      fontSize: "11px",
                      fontWeight: alarmFilter === "todos" ? 800 : 600,
                      padding: "3px 8px",
                      borderRadius: "4px",
                      border: "none",
                      background: alarmFilter === "todos" ? "#1e3a8a" : "transparent",
                      color: alarmFilter === "todos" ? "#ffffff" : "#64748b",
                      cursor: "pointer",
                    }}
                  >
                    Todas ({hsrAlarmsData.alerts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlarmFilter("picos")}
                    style={{
                      fontSize: "11px",
                      fontWeight: alarmFilter === "picos" ? 800 : 600,
                      padding: "3px 8px",
                      borderRadius: "4px",
                      border: "none",
                      background: alarmFilter === "picos" ? "#dc2626" : "transparent",
                      color: alarmFilter === "picos" ? "#ffffff" : "#64748b",
                      cursor: "pointer",
                    }}
                  >
                    🔺 Picos ({hsrAlarmsData.alerts.filter(a => a.isSpike).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlarmFilter("descensos")}
                    style={{
                      fontSize: "11px",
                      fontWeight: alarmFilter === "descensos" ? 800 : 600,
                      padding: "3px 8px",
                      borderRadius: "4px",
                      border: "none",
                      background: alarmFilter === "descensos" ? "#ea580c" : "transparent",
                      color: alarmFilter === "descensos" ? "#ffffff" : "#64748b",
                      cursor: "pointer",
                    }}
                  >
                    🔻 Descensos ({hsrAlarmsData.alerts.filter(a => !a.isSpike).length})
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>Umbral:</span>
                  <select
                    value={alarmThreshold}
                    onChange={(e) => setAlarmThreshold(Number(e.target.value))}
                    style={{ fontSize: "11px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                  >
                    <option value={50}>50% (Recomendado)</option>
                    <option value={40}>40%</option>
                    <option value={30}>30%</option>
                  </select>
                </div>

                <Link
                  href="/informes/mesociclo"
                  style={{
                    fontSize: "11.5px",
                    fontWeight: 800,
                    color: "#1e3a8a",
                    textDecoration: "none",
                    background: "#eff6ff",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1px solid #bfdbfe",
                  }}
                >
                  Ver Informe Mesociclo ↗
                </Link>
              </div>
            </div>

            {/* Grid de Tarjetas de Alarma */}
            {loadingGps ? (
              <div style={{ padding: "24px", textAlign: "center", color: "#64748b", fontSize: "12px" }}>
                Calculando variaciones de HSR entre microciclos...
              </div>
            ) : filteredHsrAlerts.length === 0 ? (
              <div
                style={{
                  padding: "20px",
                  borderRadius: "8px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  color: "#166534",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "12.5px",
                  fontWeight: 700,
                }}
              >
                <span style={{ fontSize: "20px" }}>✅</span>
                <span>Todos los jugadores se encuentran dentro del rango seguro (ninguna variación de HSR supera el {alarmThreshold}% frente al microciclo anterior).</span>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "12px" }}>
                {filteredHsrAlerts.map((alert) => {
                  const j = alert.player;
                  const isSpike = alert.isSpike;
                  const borderCol = isSpike ? "#fca5a5" : "#fed7aa";
                  const bgCol = isSpike ? "#fff5f5" : "#fffaf0";
                  const badgeCol = isSpike ? "#dc2626" : "#ea580c";
                  const badgeBg = isSpike ? "#fee2e2" : "#ffedd5";

                  return (
                    <div
                      key={j.id}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "10px",
                        border: `1px solid ${borderCol}`,
                        background: bgCol,
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "50%",
                              background: "#ffffff",
                              border: "1px solid #cbd5e1",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 800,
                              fontSize: "12px",
                              color: "#1e3a8a",
                              overflow: "hidden",
                              flexShrink: 0,
                            }}
                          >
                            {j.foto_url ? (
                              <img src={j.foto_url} alt={j.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <span>{(j.apodo || j.nombre).slice(0, 2).toUpperCase()}</span>
                            )}
                          </div>
                          <div>
                            <strong style={{ fontSize: "13px", color: "#0f172a", display: "block" }}>
                              {(j.apodo || j.nombre).toUpperCase()}
                            </strong>
                            <span style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                              {j.posicion || "Jugador"}
                            </span>
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 900,
                            padding: "3px 8px",
                            borderRadius: "6px",
                            background: badgeBg,
                            color: badgeCol,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isSpike ? "🔺" : "🔻"} {alert.diffPct > 0 ? "+" : ""}{alert.diffPct}%
                        </span>
                      </div>

                      {/* Comparativa Numérica */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: "6px",
                          background: "#ffffff",
                          padding: "8px 10px",
                          borderRadius: "6px",
                          border: "1px solid #e2e8f0",
                          textAlign: "center",
                        }}
                      >
                        <div>
                          <span style={{ display: "block", fontSize: "9.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Actual</span>
                          <strong style={{ fontSize: "12.5px", color: "#0f172a" }}>{alert.curr.toLocaleString()} <small style={{ fontSize: "9px" }}>m</small></strong>
                        </div>
                        <div>
                          <span style={{ display: "block", fontSize: "9.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Anterior</span>
                          <strong style={{ fontSize: "12.5px", color: "#64748b" }}>{alert.prev.toLocaleString()} <small style={{ fontSize: "9px" }}>m</small></strong>
                        </div>
                        <div>
                          <span style={{ display: "block", fontSize: "9.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Diferencia</span>
                          <strong style={{ fontSize: "12.5px", color: badgeCol }}>
                            {alert.diffM > 0 ? "+" : ""}{alert.diffM.toLocaleString()} <small style={{ fontSize: "9px" }}>m</small>
                          </strong>
                        </div>
                      </div>

                      {/* Barra de progreso visual */}
                      <div>
                        <div style={{ height: "6px", borderRadius: "3px", background: "#e2e8f0", overflow: "hidden", position: "relative" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${Math.min(100, (alert.curr / Math.max(alert.curr, alert.prev, 1)) * 100)}%`,
                              background: badgeCol,
                              borderRadius: "3px",
                            }}
                          />
                        </div>
                      </div>

                      {/* Pie de tarjeta con alerta / link */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10.5px" }}>
                        <span style={{ fontWeight: 700, color: badgeCol }}>
                          {isSpike ? "⚠️ Pico de fatiga aguda" : "📉 Descenso significativo"}
                        </span>
                        <Link
                          href={`/informes/microciclo?jugador=${j.id}`}
                          style={{ color: "#1e3a8a", fontWeight: 800, textDecoration: "none" }}
                        >
                          Ver historial ↗
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ─── 📝 PANEL DE COMENTARIOS Y OBSERVACIONES DE JUGADORES (ÚLTIMOS 4 DÍAS) ─── */}
          <section
            className="panel"
            suppressHydrationWarning
            style={{
              gridColumn: "span 3",
              background: "#ffffff",
              padding: "18px 22px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}
          >
            {/* Header del Panel */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                marginBottom: "14px",
                paddingBottom: "12px",
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              <div>
                <span className="eyebrow" style={{ color: "#1e3a8a", letterSpacing: "0.04em" }}>
                  DIARIO DE CAMPO & SEGUIMIENTO
                </span>
                <h3 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: "4px 0 0 0" }}>
                  Comentarios y Observaciones de Jugadores (Últimos 4 Días)
                </h3>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span
                  suppressHydrationWarning
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#475569",
                    background: "#f8fafc",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                  }}
                >
                  📅 Periodo: <strong>{last4DaysList[last4DaysList.length - 1]?.label} — {last4DaysList[0]?.label}</strong>
                </span>
                <span
                  suppressHydrationWarning
                  style={{
                    fontSize: "11px",
                    fontWeight: 800,
                    color: "#1e3a8a",
                    background: "#eff6ff",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1px solid #bfdbfe",
                  }}
                >
                  {isHydrated ? last4DaysPlayerComments.length : 0} observaciones registradas
                </span>
              </div>
            </div>

            {/* Barra de Filtros por Día y Búsqueda */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
                marginBottom: "16px",
                background: "#f8fafc",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
              }}
            >
              {/* Selector de días */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  suppressHydrationWarning
                  onClick={() => setCommentDayFilter("todos")}
                  style={{
                    fontSize: "11px",
                    fontWeight: commentDayFilter === "todos" ? 800 : 600,
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: commentDayFilter === "todos" ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
                    background: commentDayFilter === "todos" ? "#1e3a8a" : "#ffffff",
                    color: commentDayFilter === "todos" ? "#ffffff" : "#475569",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  Todos los 4 días ({isHydrated ? last4DaysPlayerComments.length : 0})
                </button>

                {last4DaysList.map((d) => {
                  const countForDay = last4DaysPlayerComments.filter((c) => c.dateISO === d.dateISO).length;
                  const isSel = commentDayFilter === d.dateISO;
                  return (
                    <button
                      key={d.dateISO}
                      type="button"
                      suppressHydrationWarning
                      onClick={() => setCommentDayFilter(d.dateISO)}
                      style={{
                        fontSize: "11px",
                        fontWeight: isSel ? 800 : 600,
                        padding: "4px 10px",
                        borderRadius: "6px",
                        border: isSel ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
                        background: isSel ? "#1e3a8a" : "#ffffff",
                        color: isSel ? "#ffffff" : "#475569",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {d.relative} ({d.label}) · {isHydrated ? countForDay : 0}
                    </button>
                  );
                })}
              </div>

              {/* Input de Búsqueda Rápida */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <input
                  type="text"
                  value={commentSearch}
                  onChange={(e) => setCommentSearch(e.target.value)}
                  placeholder="🔍 Filtrar jugador o palabra..."
                  style={{
                    fontSize: "11.5px",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    outline: "none",
                    width: "190px",
                  }}
                />
                {commentSearch && (
                  <button
                    type="button"
                    onClick={() => setCommentSearch("")}
                    style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "12px" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Listado / Grid de Comentarios de los Últimos 4 Días */}
            {!isHydrated ? (
              <div
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "#64748b",
                  background: "#f8fafc",
                  borderRadius: "8px",
                  border: "1px dashed #cbd5e1",
                }}
              >
                <span style={{ fontSize: "11.5px", fontWeight: 600 }}>Cargando observaciones...</span>
              </div>
            ) : filteredLast4Comments.length === 0 ? (
              <div
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "#64748b",
                  background: "#f8fafc",
                  borderRadius: "8px",
                  border: "1px dashed #cbd5e1",
                }}
              >
                <p style={{ margin: "0 0 4px 0", fontWeight: 700, color: "#334155", fontSize: "13px" }}>
                  ✍️ No hay observaciones para el filtro seleccionado
                </p>
                <span style={{ fontSize: "11.5px", color: "#94a3b8" }}>
                  Selecciona otro día o borra la búsqueda para ver todas las notas de los últimos 4 días.
                </span>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: "12px",
                }}
              >
                {filteredLast4Comments.map((entry) => {
                  const tagLower = (entry.tag || "").toLowerCase();
                  let tagBg = "#eff6ff";
                  let tagColor = "#1e40af";
                  let tagBorder = "#bfdbfe";

                  if (tagLower.includes("médic") || tagLower.includes("molesti") || tagLower.includes("lesi")) {
                    tagBg = "#fef2f2";
                    tagColor = "#dc2626";
                    tagBorder = "#fca5a5";
                  } else if (tagLower.includes("carg") || tagLower.includes("fatig")) {
                    tagBg = "#fffbeb";
                    tagColor = "#b45309";
                    tagBorder = "#fde68a";
                  } else if (tagLower.includes("físic")) {
                    tagBg = "#f0fdf4";
                    tagColor = "#15803d";
                    tagBorder = "#bbf7d0";
                  }

                  const dayMeta = last4DaysList.find((d) => d.dateISO === entry.dateISO);
                  const dateLabel = dayMeta ? `${dayMeta.relative} · ${dayMeta.label}` : entry.dateISO;

                  return (
                    <div
                      key={entry.id}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "10px",
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        transition: "box-shadow 0.15s ease",
                      }}
                    >
                      {/* Cabecera de la Tarjeta */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                          <div
                            style={{
                              width: "30px",
                              height: "30px",
                              borderRadius: "50%",
                              background: "#f1f5f9",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "11px",
                              fontWeight: 900,
                              color: "#1e3a8a",
                              flexShrink: 0,
                              overflow: "hidden",
                              border: "1px solid #cbd5e1",
                            }}
                          >
                            {entry.playerPhoto ? (
                              <img src={entry.playerPhoto} alt={entry.playerName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              (entry.playerName || "??").slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <div style={{ lineHeight: 1.2, minWidth: 0 }}>
                            <strong
                              style={{
                                fontSize: "12.5px",
                                color: "#0f172a",
                                display: "block",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {entry.playerName.toUpperCase()}
                            </strong>
                            {entry.posicion && (
                              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700 }}>
                                {entry.posicion}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Badges de Fecha y Categoría */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px", flexShrink: 0 }}>
                          <span
                            style={{
                              fontSize: "9.5px",
                              fontWeight: 800,
                              color: "#475569",
                              background: "#f1f5f9",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              border: "1px solid #e2e8f0",
                              whiteSpace: "nowrap",
                            }}
                          >
                            📅 {dateLabel}
                          </span>
                          <span
                            style={{
                              fontSize: "9.5px",
                              fontWeight: 800,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: tagBg,
                              color: tagColor,
                              border: `1px solid ${tagBorder}`,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {entry.tag}
                          </span>
                        </div>
                      </div>

                      {/* Cuerpo de la Observación */}
                      <p
                        style={{
                          margin: "2px 0 0 0",
                          fontSize: "12px",
                          color: "#334155",
                          lineHeight: 1.5,
                          background: "#f8fafc",
                          padding: "8px 10px",
                          borderRadius: "6px",
                          border: "1px solid #f1f5f9",
                        }}
                      >
                        {entry.comment}
                      </p>

                      {/* Footer con Autor y Hora */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10px", color: "#94a3b8" }}>
                        <span>👤 Por: <strong>{entry.author}</strong></span>
                        <span>🕒 {entry.createdAt}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      </section>
    </main>
  );
}
