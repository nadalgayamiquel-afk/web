"use client";

// ─── HELPER: AGENDA DINÁMICA DEL DÍA SEGÚN EVENTOS Y PLANIFICACIÓN REAL ───
function getAgendaForDate(
  dateISO: string,
  ses: any,
  bloquesMap: Record<string, any>
): Array<{ time: string; title: string; desc: string; tag: string; tone: string }> {
  // 1. Si hay bloques específicos detallados en eventosBloquesMap
  const dayBlocks = Object.values(bloquesMap || {}).filter(
    (b: any) => b && (b.fecha === dateISO || b.day_id === dateISO)
  );

  if (dayBlocks.length > 0) {
    dayBlocks.sort((a: any, b: any) => (a.hora || "").localeCompare(b.hora || ""));
    return dayBlocks.map((b: any) => {
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

      return {
        time: b.hora || "10:30",
        title: b.orientacion || b.comentario || `Sesión de ${b.tipo || "Entrenamiento"}`,
        desc: `${lugarStr} ${durStr ? "· " + durStr : ""} ${comStr}`.trim(),
        tag,
        tone,
      };
    });
  }

  // 2. Si no hay bloques específicos, generar sesiones a partir de la planificación real
  if (!ses) return [];

  const items: Array<{ time: string; title: string; desc: string; tag: string; tone: string }> = [];
  const mdStr = (ses.md || "").trim();
  const rival = ses.rival ? ses.rival.trim() : "";
  const evAm = ses.evento_am || ses.evento_principal || ses.evento || "";
  const evPm = ses.evento_pm || "";
  const isVisitante = /PV|PAV|VISITANTE/i.test(`${evAm} ${evPm} ${ses.md || undefined} ${ses.lugar || undefined}`);

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
    return items;
  }

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

  return items;
}

import Link from "next/link";
import { useClubConfig } from "@/app/lib/useClubConfig";
import { useState, useEffect, useMemo } from "react";
import { getActiveJugadores, getEstadoDiarioConFechas, getSesionesDiaRange } from "@/app/actions";
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
        const [activeList] = await Promise.all([
          getActiveJugadores(),
          loadDisponibilidadData(),
        ]);
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
          
          {/* HERO CARD RESUMEN DEL DÍA */}
          <section className="hero-card">
            <div>
              <span className="eyebrow light">
                {activeDay.dayName.toUpperCase()} · {activeDay.md}
              </span>
              <h2>{activeDay.session}</h2>
              <p>
                ⏰ {activeDay.time} &nbsp;|&nbsp; ⚡ Carga programada: <strong>{activeDay.load}</strong>
              </p>
            </div>
            <div className="hero-orbit">
              <span className="orbit-label">
                DISP.<br />
                <strong>{stats.disponibilidadPct}%</strong>
              </span>
              <span className="orbit-line one" />
              <span className="orbit-line two" />
            </div>
          </section>

          {/* CARD DISPONIBILIDAD REAL */}
          <section className="metric-card">
            <div className="card-heading">
              <span className="eyebrow">DISPONIBILIDAD DE PLANTILLA</span>
              <span className={"trend " + (stats.disponibilidadPct >= 85 ? "up" : "neutral-trend")}>
                {stats.disponibilidadPct >= 85 ? "🟢 Óptimo" : "⚠️ En Seguimiento"}
              </span>
            </div>
            <div className="metric-value">
              {stats.disponibilidadPct}<span>%</span>
            </div>
            <div className="progress">
              <span style={{ width: stats.disponibilidadPct + "%", background: stats.disponibilidadPct >= 85 ? "#10b981" : "#f59e0b" }} />
            </div>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "8px 0 0" }}>
              <strong>{stats.disponibles}</strong> disponibles · <span style={{ color: "#d97706" }}><strong>{stats.readaptacion}</strong> readaptación</span> · <span style={{ color: "#dc2626" }}><strong>{stats.bajas}</strong> baja médica</span>
            </p>
          </section>

          {/* CARD CARGA SEMANAL / TOTAL DEPORTISTAS */}
          <section className="metric-card">
            <div className="card-heading">
              <span className="eyebrow">PLANTILLA & TESTS</span>
              <span className="trend neutral-trend">{stats.total} Jugadores</span>
            </div>
            <div className="metric-value">
              {stats.total}<span> Acreditados</span>
            </div>
            <div className="bar-chart" aria-label="Distribución semanal">
              <i style={{ height: "45%", background: "#3b82f6" }} />
              <i style={{ height: "70%", background: "#3b82f6" }} />
              <i className="current" style={{ height: "85%", background: "#10b981" }} />
              <i style={{ height: "60%", background: "#3b82f6" }} />
              <i style={{ height: "40%", background: "#3b82f6" }} />
              <i style={{ height: "95%", background: "#ea580c" }} />
              <i style={{ height: "20%", background: "#94a3b8" }} />
            </div>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "8px 0 0" }}>
              📊 {testingCount > 0 ? (testingCount + " baterías de tests registradas") : "Base de datos de testing activa"}
            </p>
          </section>

          {/* ─── PANEL MICROCICLO SEMANAL INTERACTIVO ─── */}
          <section className="panel week-panel" id="planificacion">
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
              {currentWeekDays.map((day, idx) => (
                <div
                  key={day.dayName}
                  className={"day-cell " + (selectedDayIdx === idx ? "selected" : "")}
                  onClick={() => setSelectedDayIdx(idx)}
                  style={{ cursor: "pointer" }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 700 }}>{day.dayName}</span>
                  <strong>{day.dateNum}</strong>
                  <small style={{ fontWeight: 800, color: day.md === "MATCH" ? "#ea580c" : "#1e3a8a" }}>{day.md}</small>
                  <span className={"day-dot " + day.tone} />
                </div>
              ))}
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
          <section className="panel sessions-panel" id="eventos">
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

          {/* ─── PANEL ESTADO DE LA PLANTILLA ─── */}
          <section className="panel roster-panel" id="jugadores">
            <div className="panel-heading" style={{ flexWrap: "wrap", gap: "8px" }}>
              <div>
                <span className="eyebrow">MONITORIZACIÓN MÉDICO-DEPORTIVA</span>
                <h3>Plantilla Activa ({stats.total})</h3>
              </div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                {/* Filtros rápidos */}
                <button
                  type="button"
                  onClick={() => setRosterFilter("todos")}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: rosterFilter === "todos" ? "#1e3a8a" : "#ffffff",
                    color: rosterFilter === "todos" ? "#ffffff" : "#475569",
                  }}
                >
                  Todos ({stats.total})
                </button>
                <button
                  type="button"
                  onClick={() => setRosterFilter("bajas")}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "6px",
                    border: "1px solid #fecaca",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: rosterFilter === "bajas" ? "#dc2626" : "#fef2f2",
                    color: rosterFilter === "bajas" ? "#ffffff" : "#dc2626",
                  }}
                >
                  Bajas ({stats.bajas})
                </button>
                <Link href="/deportistas" className="text-button" style={{ marginLeft: "6px" }}>
                  Ver todos <span>↗</span>
                </Link>
              </div>
            </div>

            {/* Input de Búsqueda */}
            <div style={{ marginBottom: "10px" }}>
              <input
                type="text"
                placeholder="Filtrar por nombre, posición o dorsal..."
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "12px",
                  background: "#f8fafc",
                  outline: "none",
                }}
              />
            </div>

            {/* Lista de Jugadores Reales */}
            <div className="roster-list" style={{ maxHeight: "320px", overflowY: "auto" }}>
              {loadingJugadores ? (
                <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "12px" }}>
                  Cargando plantilla real...
                </div>
              ) : filteredJugadores.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "12px" }}>
                  No se encontraron deportistas con el filtro seleccionado.
                </div>
              ) : (
                filteredJugadores.slice(0, 10).map((player) => {
                  const lesInfo = playerStatusMap[player.id] || { status: "disponible", text: "Disponible", dias: 0 };
                  const isBaja = lesInfo.status === "baja";
                  const isRehab = lesInfo.status === "readaptacion";

                  const toneClass = isBaja ? "coral" : isRehab ? "orange" : "mint";
                  const statusLabel = isBaja ? (lesInfo.text || "Baja Médica") : isRehab ? (lesInfo.text || "Readaptación") : "Disponible";

                  return (
                    <Link
                      href={"/deportistas/" + player.id}
                      className="roster-row"
                      key={player.id}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <div className="mini-avatar">
                        {player.dorsal || player.cor_id ? String(player.dorsal || player.cor_id) : (player.nombre.slice(0, 2).toUpperCase())}
                      </div>
                      <div className="player-name">
                        <strong>{(player.apodo || player.nombre || "").toUpperCase()} {player.apodo ? ("(" + player.apodo + ")") : ""}</strong>
                        <span>{player.posicion || "Jugador"}</span>
                      </div>
                      <div className={"status " + toneClass}>
                        <i /> {statusLabel}
                      </div>
                      <div className="readiness" style={{ fontSize: "11px", color: "#64748b" }}>
                        {isBaja || isRehab ? lesInfo.text : "100%"}
                      </div>
                      <span className="row-arrow">›</span>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          {/* ─── PANEL MONITORIZACIÓN DE CARGAS (INTERNA / EXTERNA / WELLNESS) ─── */}
          <section className="panel gps-panel" id="cargas">
            <div className="panel-heading" style={{ marginBottom: "12px" }}>
              <div>
                <span className="eyebrow">MONITORIZACIÓN Y RENDIMIENTO</span>
                <h3>Control de Cargas & Wellness</h3>
              </div>
              <div style={{ display: "flex", gap: "4px", background: "#e2e8f0", padding: "3px", borderRadius: "8px" }}>
                <button
                  type="button"
                  onClick={() => setCargaTab("interna")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: cargaTab === "interna" ? "#ffffff" : "transparent",
                    color: cargaTab === "interna" ? "#1e3a8a" : "#64748b",
                    boxShadow: cargaTab === "interna" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  }}
                >
                  🧠 Interna
                </button>
                <button
                  type="button"
                  onClick={() => setCargaTab("externa")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: cargaTab === "externa" ? "#ffffff" : "transparent",
                    color: cargaTab === "externa" ? "#ea580c" : "#64748b",
                    boxShadow: cargaTab === "externa" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  }}
                >
                  ⚡ Externa (GPS)
                </button>
                <button
                  type="button"
                  onClick={() => setCargaTab("wellness")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: cargaTab === "wellness" ? "#ffffff" : "transparent",
                    color: cargaTab === "wellness" ? "#16a34a" : "#64748b",
                    boxShadow: cargaTab === "wellness" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  }}
                >
                  🧘 Wellness
                </button>
              </div>
            </div>

            {cargaTab === "interna" && (
              <>
                <div className="gps-summary">
                  <div><span>sRPE Semanal</span><strong>2,840 <small>AU</small></strong></div>
                  <div><span>RPE Medio</span><strong>6.8 <small>/10</small></strong></div>
                  <div><span>Ratio A/C</span><strong>1.08 <small>Óptimo</small></strong></div>
                </div>
                <div className="sparkline">
                  <span style={{ height: "45%" }} /><span style={{ height: "60%" }} /><span style={{ height: "75%" }} /><span style={{ height: "65%" }} /><span style={{ height: "90%" }} /><span style={{ height: "70%" }} /><span style={{ height: "85%" }} /><span style={{ height: "95%" }} /><span style={{ height: "80%" }} /><span style={{ height: "72%" }} />
                </div>
                <Link className="report-link" href="/cargas?tipo=interna" style={{ display: "inline-flex", textDecoration: "none" }}>
                  Abrir Módulo de Carga Interna 🧠 <span>↗</span>
                </Link>
              </>
            )}

            {cargaTab === "externa" && (
              <>
                <div className="gps-summary">
                  <div><span>Distancia GPS</span><strong>6.42 <small>km</small></strong></div>
                  <div><span>HSD &gt;21km/h</span><strong>385 <small>m</small></strong></div>
                  <div><span>PlayerLoad</span><strong>540 <small>pl</small></strong></div>
                </div>
                <div className="sparkline">
                  <span style={{ height: "30%" }} /><span style={{ height: "45%" }} /><span style={{ height: "55%" }} /><span style={{ height: "60%" }} /><span style={{ height: "80%" }} /><span style={{ height: "65%" }} /><span style={{ height: "78%" }} /><span style={{ height: "88%" }} /><span style={{ height: "75%" }} /><span style={{ height: "90%" }} />
                </div>
                <Link className="report-link" href="/cargas?tipo=externa" style={{ display: "inline-flex", textDecoration: "none" }}>
                  Abrir Módulo de Carga Externa (GPS) ⚡ <span>↗</span>
                </Link>
              </>
            )}

            {cargaTab === "wellness" && (
              <>
                <div className="gps-summary">
                  <div><span>Fatiga</span><strong>4.1 <small>/5</small></strong></div>
                  <div><span>Sueño / Descanso</span><strong>4.4 <small>/5</small></strong></div>
                  <div><span>Dolor Muscular</span><strong>3.8 <small>/5</small></strong></div>
                </div>
                <div className="sparkline">
                  <span style={{ height: "75%", background: "#10b981" }} /><span style={{ height: "80%", background: "#10b981" }} /><span style={{ height: "85%", background: "#10b981" }} /><span style={{ height: "70%", background: "#10b981" }} /><span style={{ height: "90%", background: "#10b981" }} /><span style={{ height: "85%", background: "#10b981" }} /><span style={{ height: "95%", background: "#10b981" }} />
                </div>
                <Link className="report-link" href="/cargas?tipo=wellness" style={{ display: "inline-flex", textDecoration: "none" }}>
                  Ver Cuestionarios Wellness 🧘 <span>↗</span>
                </Link>
              </>
            )}
          </section>

          {/* ─── PANEL HUB DE ACCESOS RÁPIDOS (PANTALLAS PRINCIPALES) ─── */}
          <section className="panel" style={{ gridColumn: "span 2", background: "#ffffff", padding: "18px" }}>
            <div className="panel-heading" style={{ marginBottom: "14px" }}>
              <div>
                <span className="eyebrow">NAVEGACIÓN RÁPIDA</span>
                <h3>Acceso Directo a los Módulos de Trabajo</h3>
              </div>
              <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700 }}>
                Top Play Training v2.0
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" }}>
              <Link
                href="/deportistas"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  textDecoration: "none",
                  color: "#0f172a",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontSize: "22px" }}>🏃</div>
                <div>
                  <strong style={{ fontSize: "13px", display: "block" }}>Deportistas</strong>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>{stats.total} Fichas activas</span>
                </div>
              </Link>

              <Link
                href="/calendario"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  textDecoration: "none",
                  color: "#0f172a",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontSize: "22px" }}>📅</div>
                <div>
                  <strong style={{ fontSize: "13px", display: "block" }}>Planificación</strong>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>Microciclos y tareas</span>
                </div>
              </Link>

              <Link
                href="/disponibilidad"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  textDecoration: "none",
                  color: "#0f172a",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontSize: "22px" }}>📋</div>
                <div>
                  <strong style={{ fontSize: "13px", display: "block" }}>Disponibilidad</strong>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>{stats.disponibles} aptos · {stats.bajas} bajas</span>
                </div>
              </Link>

              <Link
                href="/cargas"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  textDecoration: "none",
                  color: "#0f172a",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontSize: "22px" }}>⚡</div>
                <div>
                  <strong style={{ fontSize: "13px", display: "block" }}>Cargas</strong>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>sRPE & GPS</span>
                </div>
              </Link>

              <Link
                href="/campo"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  textDecoration: "none",
                  color: "#0f172a",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontSize: "22px" }}>⚽</div>
                <div>
                  <strong style={{ fontSize: "13px", display: "block" }}>Campo</strong>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>Ejercicios y pizarras</span>
                </div>
              </Link>

              <Link
                href="/gimnasio"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  textDecoration: "none",
                  color: "#0f172a",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontSize: "22px" }}>🏋️</div>
                <div>
                  <strong style={{ fontSize: "13px", display: "block" }}>Gimnasio</strong>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>Rutinas de fuerza</span>
                </div>
              </Link>

              <Link
                href="/partidos"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  textDecoration: "none",
                  color: "#0f172a",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontSize: "22px" }}>🏆</div>
                <div>
                  <strong style={{ fontSize: "13px", display: "block" }}>Partidos</strong>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>Informes de rival</span>
                </div>
              </Link>

              <Link
                href="/testing"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  textDecoration: "none",
                  color: "#0f172a",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontSize: "22px" }}>📊</div>
                <div>
                  <strong style={{ fontSize: "13px", display: "block" }}>Testing</strong>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>Tests y pliegues</span>
                </div>
              </Link>
            </div>
          </section>

        </div>
      </section>
    </main>
  );
}
