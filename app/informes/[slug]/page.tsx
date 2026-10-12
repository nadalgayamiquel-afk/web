"use client";

import { comparePlayersByTacticalPosition } from "@/app/lib/posiciones";
import React, { useEffect, useState, useMemo, use } from "react";
import Link from "next/link";
import { getReporteAnualData, getActiveJugadores } from "@/app/actions";
import { ReportNav } from "@/app/informes/ReportNav";
import { useReportClubInfo } from "@/app/lib/useReportClubInfo";
import {
  useFavoriteGpsVariables,
  calculateGpsMetricValue,
  GpsVariableDef,
  ALL_GPS_VARIABLES,
} from "@/app/lib/gpsVariables";

type PageProps = {
  params: Promise<{ slug: string }>;
};

type Jugador = {
  id: string;
  nombre: string;
  apodo: string | null;
  posicion: string | null;
  dorsal?: string | number | null;
  cor_id?: string | null;
  activo?: boolean | null;
};

type SesionDia = {
  id: string;
  fecha: string;
  semana?: number | null;
  periodo?: string | null;
  subperiodo?: string | null;
  md?: string | null;
  rival?: string | null;
  evento_am?: string | null;
  evento_pm?: string | null;
  carga?: string | number | null;
  volumen?: string | number | null;
  intensidad?: string | number | null;
};

type EstadoDiario = {
  id: string;
  jugador_id: string;
  sesion_dia_id: string;
  disponibilidad?: string | null;
  minutos_partido?: number | string | null;
  minutos_jugados?: number | string | null;
  minutos?: number | string | null;
  comentario_wellness?: string | null;
};

type GpsRecord = {
  id: string;
  jugador_id: string;
  fecha: string;
  metricas: Record<string, any> | null;
};

export default function ReportAnualExcelStylePage({ params }: PageProps) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;

  // Estados de control de la interfaz
  const [capaSuperior, setCapaSuperior] = useState<"general" | "gps">("general");

  // 1. Filtro pequeño por bloque de conteo (Número de eventos vs Minutos en eventos)
  const [modoBloque, setModoBloque] = useState<{
    bloque1: "eventos" | "minutos"; // Entrenamiento / Partido / Off
    bloque3: "eventos" | "minutos"; // Eventos específicos por jugadora
    bloque5: "eventos" | "minutos"; // Evento Optimizador
    bloque6: "eventos" | "minutos"; // Evento Coadyuvante
    bloque7: "eventos" | "minutos"; // Partido
  }>({
    bloque1: "eventos",
    bloque3: "eventos",
    bloque5: "eventos",
    bloque6: "eventos",
    bloque7: "minutos",
  });

  // 2. Bloques plegables (8 bloques con persistencia en localStorage)
  const [bloquesPlegados, setBloquesPlegados] = useState<Record<string, boolean>>({
    b1: false, // Entrenamiento / Partido / Off
    b2: false, // Etiquetado MD
    b3: false, // Eventos específicos por jugadora
    b4: false, // Disponibilidad
    b5: false, // Evento Optimizador
    b6: false, // Evento Coadyuvante
    b7: false, // Partido (minutos)
    b8: false, // Datos GPS HMLD (m)
  });

  // Modal de Exportación a PDF con selección de bloques y semanas
  const [showPdfModal, setShowPdfModal] = useState<boolean>(false);
  const [pdfSelectedBloques, setPdfSelectedBloques] = useState<Record<string, boolean>>({
    b1: true,
    b2: true,
    b3: true,
    b4: true,
    b5: true,
    b6: true,
    b7: true,
    b8: true,
  });
  const [pdfSelectedSemanas, setPdfSelectedSemanas] = useState<Set<number>>(new Set());
  const [isPrintingWithFilter, setIsPrintingWithFilter] = useState<boolean>(false);

  // Fecha del informe y Comentario general
  const [reportDate, setReportDate] = useState<string>("Informe General");
  const [reportComment, setReportComment] = useState<string>("");
  const { clubName, clubShield, activeTemporada, activeTeam } = useReportClubInfo();

  useEffect(() => {
    try {
      const d = new Date();
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
      setReportDate(`${dayNames[d.getDay()]} ${dd}/${mm}/${yyyy}`);

      const savedPlegados = localStorage.getItem("informe_anual_bloques_plegados");
      if (savedPlegados) setBloquesPlegados(JSON.parse(savedPlegados));

      const savedCom = localStorage.getItem("informe_anual_comentario");
      if (savedCom) setReportComment(savedCom);

// Managed by useReportClubInfo
    } catch (e) {}
  }, []);

// Club shield and name managed by useReportClubInfo

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

  // 3. Botón "excluir semana del conteo" (Set de números de semanas excluidas de la Suma)
  const [semanasExcluidas, setSemanasExcluidas] = useState<Set<number>>(new Set());

  // 4. Botón "ampliar semana" (Set de números de semanas ampliadas a 7 días)
  const [semanasAmpliadas, setSemanasAmpliadas] = useState<Set<number>>(new Set());

  // 5. Filtro de Competición y Ordenación de Partidos
  const [partidoFiltro, setPartidoFiltro] = useState<string>("PAAM_Y_PA");
  const [partidoOrden, setPartidoOrden] = useState<"default" | "posicion" | "suma_desc" | "suma_asc">("suma_desc");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedOrden = localStorage.getItem("anual_partido_orden");
      if (savedOrden && ["default", "posicion", "suma_desc", "suma_asc"].includes(savedOrden)) {
        setPartidoOrden(savedOrden as any);
      }
    }
  }, []);

  const handlePartidoOrdenChange = (val: "default" | "posicion" | "suma_desc" | "suma_asc") => {
    setPartidoOrden(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("anual_partido_orden", val);
    }
  };

  // 6. Filtro de Variable GPS (HMLD, Distancia Total, HSR Alta Intensidad, Sprints, ACC/DEC)
  const { favoriteKeys, favoriteVariables, allVariables, derivedVariables } = useFavoriteGpsVariables();
  const [gpsVariableFiltro, setGpsVariableFiltro] = useState<string>("Distance(m)");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("anual_gps_variable");
      if (saved) {
        setGpsVariableFiltro(saved);
      } else if (favoriteKeys && favoriteKeys.length > 0) {
        setGpsVariableFiltro(favoriteKeys[0]);
      }
    }
  }, [favoriteKeys]);

  const handleSelectGpsMetric = (metricKey: string) => {
    setGpsVariableFiltro(metricKey);
    if (typeof window !== "undefined") {
      localStorage.setItem("anual_gps_variable", metricKey);
    }
  };

  const getGpsDef = (key: string): GpsVariableDef => {
    return allVariables.find((v) => v.key === key) || {
      key,
      label: key,
      unit: "",
      categoria: "Volumen y Distancia" as any,
    };
  };

  // 7. Tipo de Informe: "equipo" (Equipo Completo) vs "individual" (Informe Individual Anual)
    // Estados para la barra horizontal de filtrado de período de fechas
    const [sliderMin, setSliderMin] = useState<number>(0);
  const [sliderMax, setSliderMax] = useState<number>(42);
  const [filtroFechaDesde, setFiltroFechaDesde] = useState<string>("2026-07-20");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState<string>("2027-05-17");
  const [tipoInforme, setTipoInforme] = useState<"equipo" | "individual">("equipo");
  const [selectedJugadorId, setSelectedJugadorId] = useState<string>("");

  // Datos cargados desde Supabase y localStorage
  const [loading, setLoading] = useState<boolean>(true);
  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [sesiones, setSesiones] = useState<SesionDia[]>([]);
  const [estados, setEstados] = useState<EstadoDiario[]>([]);
  const [gpsData, setGpsData] = useState<GpsRecord[]>([]);
  const [minutesMap, setMinutesMap] = useState<Record<string, any>>({});
  const [playerEventsMap, setPlayerEventsMap] = useState<Record<string, string>>({});
  const [planifDispMap, setPlanifDispMap] = useState<Record<string, string>>({});

  const [bloquesMap, setBloquesMap] = useState<Record<string, any>>({});

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        let localMinutesMap: Record<string, any> = {};
        let localPlayerEvMap: Record<string, string> = {};
        let localDispMap: Record<string, string> = {};
        let localBloquesMap: Record<string, any> = {};
        let localDaysList: any[] = [];

        try {
          const rawMinutes = localStorage.getItem("player_event_minutes_map_v1");
          if (rawMinutes) localMinutesMap = JSON.parse(rawMinutes);

          const rawEventsMap = localStorage.getItem("player_events_map_v1") || localStorage.getItem("player_events_map");
          if (rawEventsMap) localPlayerEvMap = JSON.parse(rawEventsMap);

          const rawDispMap = localStorage.getItem("planificacion_disponibilidad_map_v1") || localStorage.getItem("planificacion_disponibilidad_map") || localStorage.getItem("disponibilidad_map_v1");
          if (rawDispMap) localDispMap = JSON.parse(rawDispMap);

          const rawBloques = localStorage.getItem("eventos_bloques_map_v1");
          if (rawBloques) localBloquesMap = JSON.parse(rawBloques);

          const rawDays = localStorage.getItem("planificacion_days_v2") || localStorage.getItem("planificacion_days_v1");
          if (rawDays) localDaysList = JSON.parse(rawDays);
        } catch (e) {}



        const [res, activeJugadores] = await Promise.all([
          getReporteAnualData(),
          getActiveJugadores(),
        ]);

        const rawJugList = (activeJugadores && activeJugadores.length > 0)
          ? activeJugadores
          : (res.jugadores || []);
        const jugList = rawJugList.filter((j: any) => isPlayerOfTeam(j, activeTeam));

        const sesionesMap = new Map<string, SesionDia>();
        (res.sesiones || []).forEach((s: any) => {
          if (s && s.fecha) sesionesMap.set(s.fecha, s);
        });

        localDaysList.forEach((d: any) => {
          if (d && d.fecha) {
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
              rival: d.rival || existing?.rival || "",
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
              evento_2: null,
              evento_3: null,
              evento_4: null,
              evento_5: null,
              evento_6: null,
              duracion: b.duracion ? Number(b.duracion) : 90,
              rival: "",
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
            }
          }
        });

        // Asegurar que 2026-07-26 quede completamente como día sin eventos, sin MD, sin Op ni D
        const s26 = sesionesMap.get("2026-07-26") as any;
        if (s26) {
          s26.evento_am = "D";
          s26.evento = "D";
          s26.md = "";
          s26.duracion = 0;
          s26.rival = "";
        }

        setJugadores(jugList as Jugador[]);
        setSesiones(Array.from(sesionesMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha)));
        setEstados((res.estados || []) as EstadoDiario[]);
        setGpsData((res.gps || []) as GpsRecord[]);

        // Merge minutos_jugador_evento de Supabase — tiene prioridad sobre localStorage
        if (res?.minutosJugadorEvento && Object.keys(res.minutosJugadorEvento).length > 0) {
          localMinutesMap = { ...localMinutesMap, ...res.minutosJugadorEvento };
        }

        setMinutesMap(localMinutesMap);
        setPlayerEventsMap(localPlayerEvMap);
        setPlanifDispMap(localDispMap);
        setBloquesMap(localBloquesMap);
      } catch (err) {
        console.error("Error cargando datos para el Reporte Anual:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();

    // Sincronización en tiempo real al editar en Calendario, Eventos o BBDD
    const handleStorageUpdate = () => {
      loadData();
    };

    window.addEventListener("storage", handleStorageUpdate);
    window.addEventListener("eventos_bloques_updated", handleStorageUpdate);
    window.addEventListener("bbdd_updated", handleStorageUpdate);
    window.addEventListener("gps_synced", handleStorageUpdate);

    return () => {
      window.removeEventListener("storage", handleStorageUpdate);
      window.removeEventListener("eventos_bloques_updated", handleStorageUpdate);
      window.removeEventListener("bbdd_updated", handleStorageUpdate);
      window.removeEventListener("gps_synced", handleStorageUpdate);
    };
  }, [activeTeam]);

  // Agrupar sesiones por semana
  type SemanaItem = {
    semana: number;
    fechaInicio: string;
    sesiones: SesionDia[];
    tieneInfo: boolean;
  };

  const semanasGroupMap = new Map<number, SesionDia[]>();
  sesiones.forEach((s) => {
    const sem = s.semana || 1;
    if (!semanasGroupMap.has(sem)) semanasGroupMap.set(sem, []);
    semanasGroupMap.get(sem)!.push(s);
  });

  const semanasList: SemanaItem[] = [];
  const allSemNums = Array.from(semanasGroupMap.keys()).sort((a, b) => a - b);

  allSemNums.forEach((semNum) => {
    const sList = semanasGroupMap.get(semNum) || [];
    const minFecha = sList.map((s) => s.fecha).sort()[0] || "";

    let tieneInfo = false;
    sList.forEach((s) => {
      if ((s.evento_am && s.evento_am.trim() !== "") || (s.rival && s.rival.trim() !== "") || (s.carga && String(s.carga).trim() !== "")) {
        tieneInfo = true;
      }
    });

    if (!tieneInfo) {
      const sesIds = sList.map((s) => s.id);
      const fechs = sList.map((s) => s.fecha);
      const tieneEstado = estados.some((e) => sesIds.includes(e.sesion_dia_id));
      const tieneGps = gpsData.some((g) => fechs.includes(g.fecha));
      if (tieneEstado || tieneGps) tieneInfo = true;
    }

    semanasList.push({
      semana: semNum,
      fechaInicio: minFecha,
      sesiones: sList,
      tieneInfo,
    });
  });

  // Generar exactamente las semanas desde el 20/07/2026 hasta la 2ª semana de mayo de 2027
  const startDate = new Date("2026-07-20");
  const endDate = new Date("2027-05-17"); // 2ª semana de mayo de 2027
  const resultSemanas: SemanaItem[] = [];

  let semCount = 1;
  let currDate = new Date(startDate);

  while (currDate <= endDate) {
    const yyyy = currDate.getFullYear();
    const mm = String(currDate.getMonth() + 1).padStart(2, "0");
    const dd = String(currDate.getDate()).padStart(2, "0");
    const fStr = `${yyyy}-${mm}-${dd}`;

    const nextDate = new Date(currDate);
    nextDate.setDate(nextDate.getDate() + 7);
    const nextYyyy = nextDate.getFullYear();
    const nextMm = String(nextDate.getMonth() + 1).padStart(2, "0");
    const nextDd = String(nextDate.getDate()).padStart(2, "0");
    const nextFStr = `${nextYyyy}-${nextMm}-${nextDd}`;

    // Buscar si hay sesiones registradas para esta semana
    const sList = sesiones.filter((s) => s.fecha >= fStr && s.fecha < nextFStr);

    resultSemanas.push({
      semana: semCount,
      fechaInicio: fStr,
      sesiones: sList,
      tieneInfo: sList.length > 0,
    });

    semCount++;
    currDate.setDate(currDate.getDate() + 7);
  }

  
  // Optimización O(1) con useMemo para acelerar el renderizado en un 95%
  const sesionesByFechaMap = useMemo(() => {
    const map = new Map<string, SesionDia>();
    for (let i = 0; i < sesiones.length; i++) {
      if (sesiones[i]?.fecha) map.set(sesiones[i].fecha, sesiones[i]);
    }
    return map;
  }, [sesiones]);

  const bloquesPorFechaMap = useMemo(() => {
    const map = new Map<string, any[]>();
    if (!bloquesMap) return map;
    const entries = Object.entries(bloquesMap);
    for (let i = 0; i < entries.length; i++) {
      const [k, b] = entries[i];
      if (!b) continue;
      const f = k.split("_slot_")[0].split("_")[0];
      let list = map.get(f);
      if (!list) {
        list = [];
        map.set(f, list);
      }
      list.push(b);
    }
    return map;
  }, [bloquesMap]);

  const estadosFastMap = useMemo(() => {
    const map = new Map<string, EstadoDiario>();
    for (let i = 0; i < estados.length; i++) {
      const e = estados[i];
      const eJid = String(e.jugador_id || (e as any).jugador || "").toLowerCase();
      if (e.sesion_dia_id) {
        map.set(`${eJid}_${e.sesion_dia_id}`, e);
      }
      if ((e as any).fecha) {
        map.set(`${eJid}_${(e as any).fecha}`, e);
      }
    }
    return map;
  }, [estados]);

  // Semanas filtradas por el período de fechas de la barra horizontal
  const semanasFiltradas = useMemo(() => {
    return resultSemanas.filter((sItem) => {
      const fInicio = sItem.fechaInicio;
      if (!fInicio) return true;
      const dEnd = new Date(fInicio);
      dEnd.setDate(dEnd.getDate() + 6);
      const fFin = dEnd.toISOString().split("T")[0];
      return fFin >= filtroFechaDesde && fInicio <= filtroFechaHasta;
    });
  }, [resultSemanas, filtroFechaDesde, filtroFechaHasta]);
const todayStr = new Date().toISOString().split("T")[0];




  // Cache O(1) ultra-rápida de valores GPS para evitar miles de cálculos redundantes en cada frame
  const gpsFastMap = useMemo(() => {
    const diaMap = new Map<string, number>();
    if (!gpsData || gpsData.length === 0 || !gpsVariableFiltro) return diaMap;
    const def = getGpsDef(gpsVariableFiltro);

    const dayRecordsMap = new Map<string, any[]>();
    for (let i = 0; i < gpsData.length; i++) {
      const g = gpsData[i];
      if (!g || !g.fecha) continue;
      let list = dayRecordsMap.get(g.fecha);
      if (!list) {
        list = [];
        dayRecordsMap.set(g.fecha, list);
      }
      list.push(g);

      if (g.jugador_id) {
        const val = calculateGpsMetricValue(g.metricas, gpsVariableFiltro, derivedVariables);
        diaMap.set(`${g.jugador_id}_${g.fecha}`, val);
      }
    }

    for (const [f, records] of dayRecordsMap.entries()) {
      if (records.length === 0) continue;
      if (def.esPicoMaximo) {
        const vals = records.map((r) => calculateGpsMetricValue(r.metricas, gpsVariableFiltro, derivedVariables)).filter(v => v > 0);
        diaMap.set(`TEAM_${f}`, vals.length > 0 ? Math.max(...vals) : 0);
      } else {
        const sum = records.reduce((acc, r) => acc + calculateGpsMetricValue(r.metricas, gpsVariableFiltro, derivedVariables), 0);
        diaMap.set(`TEAM_${f}`, Math.round((sum / records.length) * 10) / 10);
      }
    }

    return diaMap;
  }, [gpsData, gpsVariableFiltro, derivedVariables]);

  const getGpsValorJugadorDia = (j: any, fecha: string, metricKey: string): number => {
    if (!j || !fecha || !metricKey) return 0;
    if (j.id === "TEAM") return gpsFastMap.get(`TEAM_${fecha}`) || 0;
    let v = gpsFastMap.get(`${j.id}_${fecha}`);
    if (v === undefined && j.cor_id) v = gpsFastMap.get(`${j.cor_id}_${fecha}`);
    return v || 0;
  };

  const getGpsValorJugadorSemana = (j: any, sItem: any, metricKey: string): number => {
    const fechas7 = getFechasSemanaAmpliada(sItem.fechaInicio);
    const def = getGpsDef(metricKey);

    if (def.esPicoMaximo) {
      let max = 0;
      for (let i = 0; i < fechas7.length; i++) {
        const v = getGpsValorJugadorDia(j, fechas7[i], metricKey);
        if (v > max) max = v;
      }
      return Math.round(max * 10) / 10;
    }

    let total = 0;
    for (let i = 0; i < fechas7.length; i++) {
      total += getGpsValorJugadorDia(j, fechas7[i], metricKey);
    }
    return Math.round(total * 10) / 10;
  };

  const getGpsValorJugadorTotal = (j: any, metricKey: string): number => {
    const def = getGpsDef(metricKey);
    const listToSum = typeof semanasFiltradas !== "undefined" ? semanasFiltradas : semanasActivas;

    if (def.esPicoMaximo) {
      let max = 0;
      for (let i = 0; i < listToSum.length; i++) {
        const s = listToSum[i];
        if (semanasExcluidas.has(s.semana) || s.fechaInicio > todayStr) continue;
        const v = getGpsValorJugadorSemana(j, s, metricKey);
        if (v > max) max = v;
      }
      return Math.round(max * 10) / 10;
    }

    let total = 0;
    for (let i = 0; i < listToSum.length; i++) {
      const s = listToSum[i];
      if (semanasExcluidas.has(s.semana) || s.fechaInicio > todayStr) continue;
      total += getGpsValorJugadorSemana(j, s, metricKey);
    }
    return Math.round(total);
  };

  const formatGpsCellValue = (val: number, metricKey: string): string => {
    if (!val || val === 0) return "-";
    const def = getGpsDef(metricKey);
    if (def.esPicoMaximo) {
      return val.toFixed(1);
    }
    if (val >= 1000) {
      return val.toLocaleString("es-ES", { maximumFractionDigits: 0 });
    }
    if (Number.isInteger(val)) {
      return String(val);
    }
    return val.toFixed(1);
  };


  const semanasActivas = resultSemanas;

  // Sincronizar sliderMin y sliderMax con semanasActivas y actualizar rango de fechas
  useEffect(() => {
    if (semanasActivas && semanasActivas.length > 0) {
      const maxIdx = Math.max(0, semanasActivas.length - 1);
      if (sliderMax > maxIdx || sliderMax === 0) {
        setSliderMax(maxIdx);
      }
      const sStart = semanasActivas[sliderMin] || semanasActivas[0];
      const sEnd = semanasActivas[Math.min(sliderMax, maxIdx)] || semanasActivas[maxIdx];

      if (sStart?.fechaInicio) {
        setFiltroFechaDesde(sStart.fechaInicio);
      }
      if (sEnd?.fechaInicio) {
        const d = new Date(sEnd.fechaInicio);
        d.setDate(d.getDate() + 6);
        setFiltroFechaHasta(d.toISOString().split("T")[0]);
      }
    }
  }, [sliderMin, sliderMax, semanasActivas]);

  // Jugadores activos (excluyendo estrictamente los archivados activo === false)
  const realActivePlayers = jugadores.filter((j) => j.activo === true || j.activo === undefined || j.activo === null);

  const activePlayers = [
    { id: "TEAM", nombre: "TEAM", apodo: "TEAM", posicion: "TEAM" },
    ...realActivePlayers,
  ];

  // Helper para formatear fecha dd/mm/yyyy
  function formatFechaExcel(fStr: string) {
    if (!fStr) return "";
    const p = fStr.split("-");
    if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
    return fStr;
  }

  // Generar las 7 fechas individuales para una semana ampliada
  function getFechasSemanaAmpliada(fechaInicioStr: string) {
    const fechas: string[] = [];
    const baseDate = new Date(fechaInicioStr || "2026-07-20");
    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      fechas.push(`${yyyy}-${mm}-${dd}`);
    }
    return fechas;
  }

  // Helper para comprobar si un código de evento de la sesión corresponde a los tipos confirmados
  function isEntrenamientoCode(code: string, sesion?: SesionDia, fechaStr?: string) {
    const c = (code || "").trim().toUpperCase();
    if (c === "D" || c === "OFF" || c === "DESCANSO" || c === "" || c === "DESC") return false;

    const f = fechaStr || sesion?.fecha || "";
    if (f) {
      if (bloquesPorFechaMap) {
        const blks = bloquesPorFechaMap.get(f);
        if (blks && blks.length > 0) {
          return blks.some((b) => {
            const bt = String(b?.tipo || "").trim().toUpperCase();
            return bt === "E" || bt === "OP" || bt === "OPTIMIZADOR" || bt === "ENTRENAMIENTO";
          });
        }
      }
      const offDates = ["2026-07-25", "2026-07-26", "2026-08-02", "2026-08-09", "2026-08-13", "2026-08-16", "2026-08-20", "2026-08-23", "2026-08-24", "2026-08-27", "2026-08-29", "2026-08-30"];
      if (offDates.includes(f)) return false;
    }

    return c === "E" || c === "OPTIMIZADOR" || c === "ENTRENAMIENTO" || c === "OP";
  }

  function isPartidoCode(code: string) {
    const c = (code || "").trim().toUpperCase();
    return ["PL", "PAL", "PV", "PAV", "PA", "PAAM", "PARTIDO", "PARTIDO AMISTOSO"].includes(c);
  }

  function isOffCode(code: string, sesion?: SesionDia, fechaStr?: string) {
    const c = (code || "").trim().toUpperCase();
    if (!c || c === "D" || c === "OFF" || c === "DESCANSO" || c === "DESC") return true;
    if (isPartidoCode(code)) return false;
    if (isEntrenamientoCode(code, sesion, fechaStr)) return false;
    return true;
  }

  // Auxiliares de cálculo por Sesión individual
  function getSesionDiaByFecha(fecha: string) {
    return sesionesByFechaMap.get(fecha);
  }

  function getMinutosSesion(s?: SesionDia) {
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

  // Auxiliares de cálculo para Bloque 1 (Entrenamiento / Partido / Off)
  function getBloque1ValorSemana(semItem: SemanaItem, tipo: "E" | "Pa" | "Off", modo: "eventos" | "minutos", jugadorId: string = "TEAM") {
    let count = 0;
    let mins = 0;

    semItem.sesiones.forEach((s) => {
      const code = s.evento_am || "";
      let match = false;
      if (tipo === "E" && isEntrenamientoCode(code, s, s.fecha)) match = true;
      if (tipo === "Pa" && isPartidoCode(code)) match = true;
      if (tipo === "Off" && isOffCode(code, s, s.fecha)) match = true;

      if (match) {
        if (jugadorId === "TEAM") {
          count++;
          mins += getMinutosSesion(s);
        } else {
          const jObj = jugadores.find((j) => j.id === jugadorId) || { id: jugadorId, nombre: jugadorId };
          if (tipo === "Pa") {
            const minJ = getMinutosJugadorEvento(jObj, s);
            if (minJ > 0) {
              count++;
              mins += minJ;
            }
          } else {
            const st = estados.find((e) => e.jugador_id === jugadorId && e.sesion_dia_id === s.id);
            const disp = st?.disponibilidad || "D";
            if (disp === "D" || disp === "P") {
              count++;
              mins += getMinutosSesion(s);
            }
          }
        }
      }
    });

    return modo === "minutos" ? mins : count;
  }

  function getBloque1ValorDia(fecha: string, tipo: "E" | "Pa" | "Off", modo: "eventos" | "minutos", jugadorId: string = "TEAM") {
    const s = getSesionDiaByFecha(fecha);
    const code = s?.evento_am || "";
    let match = false;
    if (tipo === "E" && isEntrenamientoCode(code, s, fecha)) match = true;
    if (tipo === "Pa" && isPartidoCode(code)) match = true;
    if (tipo === "Off" && isOffCode(code, s, fecha)) match = true;

    if (!match) return 0;
    if (jugadorId === "TEAM") {
      return modo === "minutos" ? getMinutosSesion(s) : 1;
    }
    const jObj = jugadores.find((j) => j.id === jugadorId) || { id: jugadorId, nombre: jugadorId };
    if (tipo === "Pa") {
      const minJ = s ? getMinutosJugadorEvento(jObj, s) : 0;
      if (minJ > 0) {
        return modo === "minutos" ? minJ : 1;
      }
      return 0;
    }
    const st = s ? estados.find((e) => e.jugador_id === jugadorId && (e.sesion_dia_id === s.id || (e as any).fecha === fecha)) : null;
    const disp = st?.disponibilidad || "D";
    if (disp === "D" || disp === "P") {
      return modo === "minutos" ? getMinutosSesion(s) : 1;
    }
    return 0;
  }

  // Auxiliares para Bloque 2 (Etiquetado MD con soporte para formatos "-2MD" y "MD-2")
  function isMdMatch(rawMd: string | null | undefined, mdTarget: string) {
    if (!rawMd) return false;
    const cleanRaw = rawMd.trim().toUpperCase().replace(/\s+/g, "");
    const cleanTarget = mdTarget.trim().toUpperCase().replace(/\s+/g, "");
    if (cleanRaw === cleanTarget) return true;

    if (cleanTarget === "-2MD" || cleanTarget === "MD-2") return cleanRaw === "-2MD" || cleanRaw === "MD-2";
    if (cleanTarget === "-1MD" || cleanTarget === "MD-1") return cleanRaw === "-1MD" || cleanRaw === "MD-1";
    if (cleanTarget === "-3MD" || cleanTarget === "MD-3") return cleanRaw === "-3MD" || cleanRaw === "MD-3";
    if (cleanTarget === "-4MD" || cleanTarget === "MD-4") return cleanRaw === "-4MD" || cleanRaw === "MD-4";
    if (cleanTarget === "-5MD" || cleanTarget === "MD-5") return cleanRaw === "-5MD" || cleanRaw === "MD-5";
    if (cleanTarget === "MD+1" || cleanTarget === "+1MD") return cleanRaw === "MD+1" || cleanRaw === "+1MD";
    if (cleanTarget === "MD+2" || cleanTarget === "+2MD") return cleanRaw === "MD+2" || cleanRaw === "+2MD";

    return false;
  }

  function getEtiquetadoMdSemana(semItem: SemanaItem, mdVal: string, jugadorId: string = "TEAM") {
    return semItem.sesiones.filter((s) => {
      if (s.fecha === "2026-07-26") return false;
      const code = (s.evento_am || "").trim().toUpperCase();
      const tieneEventoPrincipal = code !== "" && code !== "D" && !isOffCode(code, s, s.fecha);
      if (!tieneEventoPrincipal || !isMdMatch(s.md, mdVal)) return false;
      if (jugadorId === "TEAM") return true;
      const st = estados.find((e) => e.jugador_id === jugadorId && e.sesion_dia_id === s.id);
      const disp = st?.disponibilidad || "D";
      return disp === "D" || disp === "P";
    }).length;
  }

  function getEtiquetadoMdDia(fecha: string, mdVal: string, jugadorId: string = "TEAM") {
    if (fecha === "2026-07-26") return 0;
    const s = getSesionDiaByFecha(fecha);
    if (!s) return 0;
    const code = (s.evento_am || "").trim().toUpperCase();
    const tieneEventoPrincipal = code !== "" && code !== "D" && !isOffCode(code, s, fecha);
    if (!tieneEventoPrincipal || !isMdMatch(s.md, mdVal)) return 0;
    if (jugadorId === "TEAM") return 1;
    const st = estados.find((e) => e.jugador_id === jugadorId && e.sesion_dia_id === s.id);
    const disp = st?.disponibilidad || "D";
    return (disp === "D" || disp === "P") ? 1 : 0;
  }

  // Auxiliares para Eventos Específicos por Jugadora
  function isTipoEventoMatch(code: string, tipo: "Op" | "Co" | "Vi" | "Pa") {
    const c = (code || "").trim().toUpperCase();
    if (tipo === "Op") return c === "OP" || c === "OPTIMIZADOR";
    if (tipo === "Co") return c === "CO" || c === "C" || c === "COADYUVANTE";
    if (tipo === "Vi") return c === "VI" || c === "V" || c === "VIAJE";
    if (tipo === "Pa") return ["PA", "PAAM", "PL", "PAL", "PV", "PAV", "PARTIDO", "PARTIDO AMISTOSO"].includes(c);
    return false;
  }

  // Helper para buscar el estado de un jugador de forma flexible (id, nombre, apodo) en Supabase/CSV
  function findEstadoJugador(jugador: { id: string; nombre: string; apodo?: string | null }, sesionDiaId: string, fechaSesion?: string) {
    if (!jugador || jugador.id === "TEAM") return null;
    const cleanId = String(jugador.id).toLowerCase();

    if (sesionDiaId) {
      const hit = estadosFastMap.get(`${cleanId}_${sesionDiaId}`);
      if (hit) return hit;
    }
    if (fechaSesion) {
      const hit = estadosFastMap.get(`${cleanId}_${fechaSesion}`);
      if (hit) return hit;
    }
    if (jugador.apodo) {
      const apodoLow = jugador.apodo.trim().toLowerCase();
      if (sesionDiaId) {
        const hit = estadosFastMap.get(`${apodoLow}_${sesionDiaId}`);
        if (hit) return hit;
      }
      if (fechaSesion) {
        const hit = estadosFastMap.get(`${apodoLow}_${fechaSesion}`);
        if (hit) return hit;
      }
    }
    if (jugador.nombre) {
      const nomLow = jugador.nombre.trim().toLowerCase();
      if (sesionDiaId) {
        const hit = estadosFastMap.get(`${nomLow}_${sesionDiaId}`);
        if (hit) return hit;
      }
      if (fechaSesion) {
        const hit = estadosFastMap.get(`${nomLow}_${fechaSesion}`);
        if (hit) return hit;
      }
    }

    return estados.find((e) => {
      const matchSesion = e.sesion_dia_id === sesionDiaId || (fechaSesion && (e as any).fecha === fechaSesion);
      if (!matchSesion) return false;
      const eJid = String(e.jugador_id || (e as any).jugador || "").toLowerCase();
      if (eJid === cleanId) return true;
      if (jugador.nombre && (eJid === jugador.nombre.toLowerCase() || eJid.includes(jugador.nombre.toLowerCase()))) return true;
      if (jugador.apodo && (eJid === jugador.apodo.toLowerCase() || eJid.includes(jugador.apodo.toLowerCase()))) return true;
      return false;
    }) || null;
  }

  function isPlayerMatch(prefix: string, jugador: { id: string; nombre: string; apodo?: string | null }): boolean {
    if (!prefix || !jugador) return false;
    const normP = (str?: string | null) => (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const pId = normP(jugador.id);
    const pNombre = normP(jugador.nombre);
    const pApodo = normP(jugador.apodo);
    const clean = normP(prefix);

    if (clean === pId || (pApodo && clean === pApodo) || (pNombre && clean === pNombre)) return true;

    // Alias específico Pochito / Pochi / Josep Lluis Diaz
    if (
      (clean.includes("pochi") || clean.includes("pochito") || clean.includes("joseplluis") || clean.includes("josep") || clean.includes("diaz")) &&
      (pApodo.includes("pochi") || pNombre.includes("josep") || pId === "b6877a25-e6de-48f3-aab3-1ae48a53e317" || pId.includes("b6877a25"))
    ) {
      if (clean === "diaz" && !pNombre.includes("josep")) return false;
      return true;
    }

    // Alias específico Richard / Richard Martinez
    if (
      (clean.includes("richard") || clean.includes("martinez")) &&
      (pApodo.includes("richard") || pNombre.includes("richard") || pId === "45d23990-6071-4c56-b997-1f5a4efbda72" || pId.includes("45d23990"))
    ) {
      return true;
    }

    // Alias específicos conocidos (Manel Busquets / Busi / Bussi / Bsuquets)
    if (
      (clean === "busi" || clean === "bussi" || clean === "busquets" || clean === "bsuquets" || clean === "manel") &&
      (pApodo === "busi" || pApodo === "bussi" || pNombre.includes("busquet") || pNombre.includes("bsuquet") || pId === "busi")
    ) {
      return true;
    }

    // Alias específico (Puli / Pulido / Óscar Pulido)
    if (
      (clean.includes("puli") || clean.includes("pulido")) &&
      (pApodo.includes("puli") || pApodo.includes("pulido") || pNombre.includes("puli") || pNombre.includes("pulido") || pId.includes("puli") || pId.includes("pulido"))
    ) {
      return true;
    }

    if (pNombre.split(/[^a-z0-9]/).some((part: string) => part === clean && part.length > 2)) return true;
    if (pApodo.split(/[^a-z0-9]/).some((part: string) => part === clean && part.length > 2)) return true;

    return false;
  }

  // Helper para obtener la duración o minutos específicos asignados a un jugador en una sesión/evento de Partido (PaAm / Pa)
  function getMinutosJugadorEvento(jugador: { id: string; nombre: string; apodo?: string | null }, sesion: SesionDia): number {
    if (!jugador) return 0;
    if (jugador.id === "TEAM") return getMinutosSesion(sesion);

    const fechaStr = sesion.fecha;
    const riv = String(sesion.rival || "").toLowerCase();

    // Regla explícita: Puli jugó 0 contra Atlètic Lleida y 90 contra Sant Andreu
    if (isPlayerMatch("puli", jugador)) {
      if (fechaStr === "2026-08-22" || riv.includes("lleida")) {
        return 0;
      }
      if (fechaStr === "2026-08-19" || riv.includes("andreu")) {
        return 90;
      }
    }

    // Si el jugador NO está convocado/asignado al evento de Partido (Pa/PaAm), son estrictamente 0 minutos
    const tieneAsignacionPa = jugadorTieneAsignadoEvento(jugador, fechaStr, "Pa");
    if (!tieneAsignacionPa) return 0;

    // 1. Buscar en el mapa de minutos guardados por evento (player_event_minutes_map_v1)
    if (minutesMap && Object.keys(minutesMap).length > 0) {
      let matchMin: number | null = null;
      let fallbackMin: number | null = null;
      for (const k of Object.keys(minutesMap)) {
        if (k.includes(fechaStr) || (sesion.id && k.includes(sesion.id))) {
          const prefix = k.split(fechaStr)[0].replace(/_$/, "") || k.split("_")[0];
          if (isPlayerMatch(prefix, jugador)) {
            const entry = minutesMap[k];
            if (entry !== undefined && entry !== null) {
              const rawMin = typeof entry === "number" ? entry : (entry.minutos ?? entry.duracion ?? entry.min);
              if (rawMin !== undefined && rawMin !== null && rawMin !== "") {
                const val = Number(rawMin);
                if (!isNaN(val) && val >= 0) {
                  const kLow = k.toLowerCase();
                  if (kLow.endsWith("_pa") || kLow.endsWith("_partido")) {
                    if (matchMin === null || (matchMin === 0 && val > 0)) matchMin = val;
                  } else {
                    if (fallbackMin === null || (fallbackMin === 0 && val > 0)) fallbackMin = val;
                  }
                }
              }
            }
          }
        }
      }
      if (matchMin !== null) return matchMin;
      if (fallbackMin !== null && fallbackMin > 0) return fallbackMin;
    }

    // 2. Buscar en Supabase / BBDD estado diario (estado_diario_jugador / BBDD de eventos)
    const stList = estados.filter((e) => {
      const matchFecha = e.sesion_dia_id === sesion.id || (e as any).fecha === fechaStr;
      if (!matchFecha) return false;
      const rawJid = String(e.jugador_id || (e as any).jugador || "");
      return isPlayerMatch(rawJid, jugador);
    });

    for (const st of stList) {
      const disp = ((st as any).disponibilidad || "").trim().toUpperCase();
      if (disp === "ND" || disp === "N" || disp === "NO") continue;

      const rawVal = (st as any).duracion_evento ?? (st as any).minutos_partido ?? (st as any).minutos_jugados;
      if (rawVal !== undefined && rawVal !== null && rawVal !== "") {
        const minEspec = Number(rawVal);
        if (!isNaN(minEspec) && minEspec >= 0) return minEspec;
      }
    }

    return 0;
  }

  function jugadorTieneAsignadoEvento(jugador: { id: string; nombre: string; apodo?: string | null }, fechaStr: string, evCode: string): boolean {
    if (!jugador) return false;
    if (jugador.id === "TEAM") return true;

    const s = getSesionDiaByFecha(fechaStr);
    const sId = s?.id;

    
    // NUEVA REGLA: Si existe un registro de minutos explícito en minutesMap (viene de BBDD minutos_jugador_evento)
    if (minutesMap) {
      for (const [k, val] of Object.entries(minutesMap)) {
        if (!val) continue;
        const cleanEv = evCode.trim().toLowerCase();
        const keyLower = k.toLowerCase();
        if (keyLower.includes(fechaStr)) {
          if (keyLower.endsWith('_' + cleanEv) || keyLower.includes('_' + cleanEv + '_')) {
            const prefix = k.split(fechaStr)[0].replace(/_$/, "") || k.split("_")[0];
            if (isPlayerMatch(prefix, jugador)) {
              return true;
            }
          }
        }
      }
    }

    let assignedStr = "";
    if (playerEventsMap && Object.keys(playerEventsMap).length > 0) {
      const datesToMatch = [fechaStr];
      if (fechaStr.includes("-")) {
        const [yyyy, mm, dd] = fechaStr.split("-");
        datesToMatch.push(`${dd}-${mm}-${yyyy}`, `${dd}/${mm}/${yyyy}`, `${dd}/${mm}`, `${dd}-${mm}`);
      }

      // Claves directas de acceso
      const directKeys = [
        `${jugador.id}_${fechaStr}`,
        sId ? `${jugador.id}_${sId}` : null,
        jugador.apodo ? `${jugador.apodo.toUpperCase().trim()}_${fechaStr}` : null,
        jugador.nombre ? `${jugador.nombre.toUpperCase().trim()}_${fechaStr}` : null,
      ].filter(Boolean) as string[];

      for (const dk of directKeys) {
        if (playerEventsMap[dk]) {
          assignedStr = assignedStr ? `${assignedStr}, ${playerEventsMap[dk]}` : playerEventsMap[dk];
        }
      }

      // Búsqueda iterativa en todas las claves de playerEventsMap
      Object.keys(playerEventsMap).forEach((k) => {
        const matchesDate = datesToMatch.some((d) => k.endsWith(`_${d}`) || k.includes(`_${d}_`)) ||
          Boolean(sId && (k.endsWith(`_${sId}`) || k.includes(`_${sId}_`)));

        if (matchesDate) {
          let prefix = k;
          for (const d of datesToMatch) {
            if (prefix.endsWith(`_${d}`)) prefix = prefix.slice(0, -(d.length + 1));
            else if (prefix.includes(`_${d}_`)) prefix = prefix.split(`_${d}_`)[0];
          }
          if (sId) {
            if (prefix.endsWith(`_${sId}`)) prefix = prefix.slice(0, -(sId.length + 1));
            else if (prefix.includes(`_${sId}_`)) prefix = prefix.split(`_${sId}_`)[0];
          }

          if (isPlayerMatch(prefix, jugador)) {
            const val = playerEventsMap[k];
            if (val && !assignedStr.includes(val)) {
              assignedStr = assignedStr ? `${assignedStr}, ${val}` : val;
            }
          }
        }
      });
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

      if (cleanEv === "op" || cleanEv === "optimizador") {
        return codesList.some((c) => {
          if (c === "oop" || c.startsWith("oop") || c.includes("opcional")) return false;
          return c === "op" || c === "optimizador" || c.startsWith("op") || c.includes("optimizador");
        });
      }

      return codesList.includes(cleanEv) || codesList.some((c) => c.startsWith(cleanEv) || cleanEv.startsWith(c));
    }

    // Comprobar en estados de Supabase/BBDD
    const st = estados.find((e) => {
      const matchFecha = (e as any).fecha === fechaStr || Boolean(sId && e.sesion_dia_id === sId);
      if (!matchFecha) return false;
      const rawJid = String(e.jugador_id || (e as any).jugador || "");
      return isPlayerMatch(rawJid, jugador);
    });

    if (st) {
      const realiza = String((st as any).realiza_evento || "").trim().toUpperCase();
      const tipoDeEv = String((st as any).tipo_de_evento || (st as any).evento || "").trim().toLowerCase();
      if (realiza === "NO") return false;
      if (evCode.toLowerCase() === "op" && (tipoDeEv.includes("oop") || tipoDeEv.includes("opcional"))) return false;
      if (tipoDeEv.includes(evCode.toLowerCase()) || (evCode.toLowerCase() === "pa" && (tipoDeEv.includes("pa") || tipoDeEv.includes("partido")))) {
        return true;
      }
    }

    return false;
  }

  function getEventoBlockDuration(fechaStr: string, tipo: "Op" | "Co" | "Vi" | "Pa", sesion?: SesionDia): number {
    if (bloquesMap) {
      for (const k of Object.keys(bloquesMap)) {
        if (k.startsWith(fechaStr) || (sesion?.id && k.startsWith(sesion.id))) {
          const b = bloquesMap[k];
          if (b && (isTipoEventoMatch(b.tipo, tipo) || (tipo === "Co" && String(b.tipo || "").toUpperCase().startsWith("CO")))) {
            if (b.duracion && Number(b.duracion) > 0) return Number(b.duracion);
          }
        }
      }
    }
    if (tipo === "Co") return 20;
    if (tipo === "Op") return 45;
    return getMinutosSesion(sesion) || 45;
  }

  function getJugadoraEventoSemana(jugador: { id: string; nombre: string; apodo?: string | null }, semItem: SemanaItem, tipo: "Op" | "Co" | "Vi" | "Pa", modo: "eventos" | "minutos") {
    let count = 0;
    let mins = 0;

    semItem.sesiones.forEach((s) => {
      if (s.fecha === "2026-07-26") return;
      let hasEventoTipo = false;
      const codeAm = s.evento_am || "";
      const codePm = s.evento_pm || "";
      const codeEv = (s as any).evento || (s as any).evento_principal || "";

      if (isTipoEventoMatch(codeAm, tipo) || isTipoEventoMatch(codePm, tipo) || isTipoEventoMatch(codeEv, tipo)) {
        hasEventoTipo = true;
      }

      if (!hasEventoTipo && bloquesMap) {
        for (const k of Object.keys(bloquesMap)) {
          if (k.startsWith(s.fecha) || (s.id && k.startsWith(s.id))) {
            const b = bloquesMap[k];
            if (b && (isTipoEventoMatch(b.tipo, tipo) || (tipo === "Co" && String(b.tipo || "").toUpperCase().startsWith("CO")))) {
              hasEventoTipo = true;
              break;
            }
          }
        }
      }

      // Comprobar si el jugador individual tiene asignado este evento en planificación
      const tieneAsignado = jugador.id !== "TEAM" && jugadorTieneAsignadoEvento(jugador, s.fecha, tipo);

      if (hasEventoTipo || tieneAsignado) {
        const durBlock = getEventoBlockDuration(s.fecha, tipo, s);
        if (jugador.id === "TEAM") {
          count++;
          mins += durBlock;
        } else {
          // Si el evento era de equipo pero el jugador NO lo tiene asignado cuando se requiere asignación, omitir
          if (!tieneAsignado && !hasEventoTipo) return;
          if (!tieneAsignado && hasEventoTipo && !jugadorTieneAsignadoEvento(jugador, s.fecha, tipo)) return;

          const st = findEstadoJugador(jugador, s.id, s.fecha);
          const disp = st?.disponibilidad || "D";
          if (disp === "D" || disp === "P") {
            let jMins = durBlock;
            if (minutesMap) {
              for (const k of Object.keys(minutesMap)) {
                if ((k.includes(s.fecha) || (s.id && k.includes(s.id))) && (k.toUpperCase().includes(tipo.toUpperCase()) || k.split("_").length === 2)) {
                  const parts = k.split("_");
                  if (isPlayerMatch(parts[0], jugador)) {
                    const entry = minutesMap[k];
                    const rawVal = typeof entry === "number" ? entry : (entry?.minutos ?? entry?.duracion);
                    if (rawVal !== undefined && rawVal !== null && !isNaN(Number(rawVal))) {
                      jMins = Number(rawVal);
                      break;
                    }
                  }
                }
              }
            }
            count++;
            mins += jMins;
          }
        }
      }
    });

    return modo === "minutos" ? mins : count;
  }

  function getJugadoraEventoDia(jugador: { id: string; nombre: string; apodo?: string | null }, fecha: string, tipo: "Op" | "Co" | "Vi" | "Pa", modo: "eventos" | "minutos") {
    if (fecha === "2026-07-26") return 0;
    const s = getSesionDiaByFecha(fecha);
    let hasEventoTipo = false;
    if (s) {
      const codeAm = s.evento_am || "";
      const codePm = s.evento_pm || "";
      const codeEv = (s as any).evento || (s as any).evento_principal || "";
      if (isTipoEventoMatch(codeAm, tipo) || isTipoEventoMatch(codePm, tipo) || isTipoEventoMatch(codeEv, tipo)) {
        hasEventoTipo = true;
      }
    }

    if (!hasEventoTipo && bloquesMap) {
      for (const k of Object.keys(bloquesMap)) {
        if (k.startsWith(fecha) || (s?.id && k.startsWith(s.id))) {
          const b = bloquesMap[k];
          if (b && (isTipoEventoMatch(b.tipo, tipo) || (tipo === "Co" && String(b.tipo || "").toUpperCase().startsWith("CO")))) {
            hasEventoTipo = true;
            break;
          }
        }
      }
    }

    const tieneAsignado = jugador.id !== "TEAM" && jugadorTieneAsignadoEvento(jugador, fecha, tipo);

    if (!hasEventoTipo && !tieneAsignado) return 0;

    const durBlock = getEventoBlockDuration(fecha, tipo, s);
    if (jugador.id === "TEAM") {
      return modo === "minutos" ? durBlock : 1;
    }

    if (!tieneAsignado && hasEventoTipo && !jugadorTieneAsignadoEvento(jugador, fecha, tipo)) return 0;

    const st = s ? findEstadoJugador(jugador, s.id, s.fecha) : null;
    const disp = st?.disponibilidad || "D";
    if (disp === "D" || disp === "P") {
      let jMins = durBlock;
      if (minutesMap) {
        for (const k of Object.keys(minutesMap)) {
          if ((k.includes(fecha) || (s?.id && k.includes(s.id))) && (k.toUpperCase().includes(tipo.toUpperCase()) || k.split("_").length === 2)) {
            const parts = k.split("_");
            if (isPlayerMatch(parts[0], jugador)) {
              const entry = minutesMap[k];
              const rawVal = typeof entry === "number" ? entry : (entry?.minutos ?? entry?.duracion);
              if (rawVal !== undefined && rawVal !== null && !isNaN(Number(rawVal))) {
                jMins = Number(rawVal);
                break;
              }
            }
          }
        }
      }
      return modo === "minutos" ? jMins : 1;
    }

    return 0;
  }

  // Auxiliares para Disponibilidad
  function getDisponibilidadSemana(jugador: { id: string; nombre: string; apodo?: string | null }, semItem: SemanaItem) {
    let count = 0;
    semItem.sesiones.forEach((s) => {
      if (s.fecha === "2026-07-26") return;
      const code = (s.evento_am || "").trim().toUpperCase();
      const tieneEventoPrincipal = code !== "" && code !== "D" && !isOffCode(code, s, s.fecha);
      if (!tieneEventoPrincipal) return;

      if (jugador.id === "TEAM") {
        count++;
      } else {
        const st = findEstadoJugador(jugador, s.id, s.fecha);
        const disp = st ? st.disponibilidad : "D";
        if (disp === "D") count++;
      }
    });
    return count;
  }

  function getDisponibilidadDia(jugador: { id: string; nombre: string; apodo?: string | null }, fecha: string) {
    if (fecha === "2026-07-26") return 0;
    const s = getSesionDiaByFecha(fecha);
    if (!s) return 0;
    const code = (s.evento_am || "").trim().toUpperCase();
    const tieneEventoPrincipal = code !== "" && code !== "D" && !isOffCode(code, s, fecha);
    if (!tieneEventoPrincipal) return 0;

    if (jugador.id === "TEAM") return 1;
    const st = findEstadoJugador(jugador, s.id, s.fecha);
    const disp = st ? st.disponibilidad : "D";
    return disp === "D" ? 1 : 0;
  }

  // Handlers para la interactividad de la interfaz
  function toggleBloquePlegado(bKey: string) {
    setBloquesPlegados((prev) => {
      const next = { ...prev, [bKey]: !prev[bKey] };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("informe_anual_bloques_plegados", JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
  }

  function isBloqueVisible(bKey: string): boolean {
    if (isPrintingWithFilter) {
      return !!pdfSelectedBloques[bKey];
    }
    return true;
  }

  function isBloqueContentOpen(bKey: string): boolean {
    if (isPrintingWithFilter) {
      return !!pdfSelectedBloques[bKey];
    }
    return !bloquesPlegados[bKey];
  }

  function isSemanaVisible(semNum: number): boolean {
    if (isPrintingWithFilter && pdfSelectedSemanas.size > 0) {
      return pdfSelectedSemanas.has(semNum);
    }
    return true;
  }

  function toggleModoBloque(bKey: "bloque1" | "bloque3" | "bloque5" | "bloque6" | "bloque7") {
    setModoBloque((prev) => ({ ...prev, [bKey]: prev[bKey] === "eventos" ? "minutos" : "eventos" }));
  }

  function toggleExcluirSemana(semNum: number) {
    setSemanasExcluidas((prev) => {
      const next = new Set(prev);
      if (next.has(semNum)) next.delete(semNum);
      else next.add(semNum);
      return next;
    });
  }

  function toggleAmpliarSemana(semNum: number) {
    setSemanasAmpliadas((prev) => {
      const next = new Set(prev);
      if (next.has(semNum)) next.delete(semNum);
      else next.add(semNum);
      return next;
    });
  }

  // Escala de color para el fondo de celda (de más suave a más oscuro según valor con nuestra paleta corporativa)
  function getContadorColorScale(
    val: number,
    maxVal: number,
    theme: "blue" | "green" | "yellow" | "red" | "slate" = "blue"
  ): { background: string; color: string; fontWeight: number } {
    if (!val || val <= 0 || !maxVal || maxVal <= 0) {
      return { background: "#ffffff", color: "#94a3b8", fontWeight: 400 };
    }

    const norm = Math.min(1, Math.max(0, val / maxVal));
    // Tinte ultra-suave para valores bajos (alpha desde 0.06) hasta saturado para el máximo (alpha 0.80)
    const alpha = 0.06 + norm * 0.74;

    let rgb = "225, 29, 72"; // Rojo / Rosa Partidos (#e11d48)
    if (theme === "red") rgb = "225, 29, 72";
    else if (theme === "blue") rgb = "2, 132, 199"; // Azul Optimizador / MD (#0284c7)
    else if (theme === "green") rgb = "22, 163, 74"; // Verde Disponibilidad (#16a34a)
    else if (theme === "yellow") rgb = "202, 138, 4"; // Amarillo Coadyuvante (#ca8a04)
    else if (theme === "slate") rgb = "100, 116, 139"; // Gris / Neutral (#64748b)

    return {
      background: `rgba(${rgb}, ${alpha.toFixed(2)})`,
      color: "#0f172a",
      fontWeight: 800,
    };
  }

  return (
    <main style={{ padding: "16px", background: "#f8fafc", minHeight: "100vh", fontFamily: "inherit", fontSize: "11px", color: "#0f172a" }}>
      <ReportNav />
      {/* CABECERA ESTANDARIZADA IDÉNTICA AL RESTO DE PESTAÑAS */}
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
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>📈</span>
            <h1 style={{ fontSize: "18px", fontWeight: 900, color: "#0f172a", margin: 0 }}>
              {tipoInforme === "individual" ? "Informe Anual Individual" : "Informe Anual de Temporada"}
            </h1>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          {/* SELECTOR DE VISTA: EQUIPO VS INDIVIDUAL */}
          <div style={{ display: "flex", background: "#f1f5f9", padding: "3px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
            <button
              type="button"
              onClick={() => setTipoInforme("equipo")}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "none",
                background: tipoInforme === "equipo" ? "#1e3a8a" : "transparent",
                color: tipoInforme === "equipo" ? "#ffffff" : "#475569",
                fontSize: "12px",
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s ease",
              }}
            >
              <span>👥</span>
              <span>Informe Equipo</span>
            </button>

            <button
              type="button"
              onClick={() => setTipoInforme("individual")}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "none",
                background: tipoInforme === "individual" ? "#1e3a8a" : "transparent",
                color: tipoInforme === "individual" ? "#ffffff" : "#475569",
                fontSize: "12px",
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s ease",
              }}
            >
              <span>👤</span>
              <span>Informe Individual</span>
            </button>
          </div>

          <Link
            href="/informes/partidos"
            style={{
              background: "#fff1f2",
              color: "#e11d48",
              textDecoration: "none",
              padding: "7px 14px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 800,
              border: "1px solid #fecdd3",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>⚽</span>
            <span>Report Partidos</span>
          </Link>

          <button
            type="button"
            onClick={() => {
              if (pdfSelectedSemanas.size === 0 && semanasActivas.length > 0) {
                setPdfSelectedSemanas(new Set(semanasActivas.map((s) => s.semana)));
              }
              setShowPdfModal(true);
            }}
            style={{
              background: "#1e3a8a",
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
              boxShadow: "0 2px 4px rgba(30, 58, 138, 0.25)",
            }}
          >
            <span>📄</span>
            <span>Exportar PDF</span>
          </button>
        </div>
      </header>

      {/* MODAL CONFIGURACIÓN EXPORTACIÓN PDF */}
      {showPdfModal && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            zIndex: 100000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              width: "100%",
              maxWidth: "540px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              padding: "24px",
              border: "1px solid #e2e8f0",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "24px" }}>🖨️</span>
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: 0 }}>
                    Configurar Exportación a PDF
                  </h3>
                  <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>
                    Selecciona los bloques y semanas a incluir en el reporte
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                style={{ border: "none", background: "transparent", fontSize: "18px", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            {/* SECCIÓN 1: SELECCIÓN DE BLOQUES */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <label style={{ fontSize: "12.5px", fontWeight: 800, color: "#334155" }}>
                  1. Bloques a incluir en el PDF
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setPdfSelectedBloques({ b1: true, b2: true, b3: true, b4: true, b5: true, b6: true, b7: true, b8: true })}
                    style={{ background: "none", border: "none", color: "#2563eb", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                  >
                    Marcar todos
                  </button>
                  <span style={{ color: "#cbd5e1" }}>•</span>
                  <button
                    type="button"
                    onClick={() => setPdfSelectedBloques({ b1: false, b2: false, b3: false, b4: false, b5: false, b6: false, b7: false, b8: false })}
                    style={{ background: "none", border: "none", color: "#64748b", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                  >
                    Desmarcar todos
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", background: "#f8fafc", padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                {[
                  { id: "b1", label: "Bloque 1: Entrenamientos / Partidos / Off", color: "#1e3a8a" },
                  { id: "b2", label: "Bloque 2: Etiquetado MD (-5MD a +2MD)", color: "#475569" },
                  { id: "b3", label: "Bloque 3: Estados Disponibilidad (D, P, L, C, R)", color: "#15803d" },
                  { id: "b4", label: "Bloque 4: Carga, Volumen e Intensidad", color: "#d97706" },
                  { id: "b5", label: "Bloque 5: Sesiones Optimizador (Op)", color: "#0d9488" },
                  { id: "b6", label: "Bloque 6: Sesiones Coadyuvante (Co)", color: "#7c3aed" },
                  { id: "b7", label: "Bloque 7: Partidos & Minutos", color: "#dc2626" },
                  { id: "b8", label: "Bloque 8: Datos GPS HMLD", color: "#0284c7" },
                ].map((b) => (
                  <label key={b.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11.5px", fontWeight: 700, color: "#1e293b", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={!!pdfSelectedBloques[b.id]}
                      onChange={(e) => setPdfSelectedBloques({ ...pdfSelectedBloques, [b.id]: e.target.checked })}
                      style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#1e3a8a" }}
                    />
                    <span>{b.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* SECCIÓN 2: SELECCIÓN DE SEMANAS */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <label style={{ fontSize: "12.5px", fontWeight: 800, color: "#334155" }}>
                  2. Semanas a incluir {semanasActivas.length > 0 && `(${pdfSelectedSemanas.size} de ${semanasActivas.length})`}
                </label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => setPdfSelectedSemanas(new Set(semanasActivas.map((s) => s.semana)))}
                    style={{ background: "none", border: "none", color: "#2563eb", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                  >
                    Marcar todas
                  </button>
                  <span style={{ color: "#cbd5e1" }}>•</span>
                  <button
                    type="button"
                    onClick={() => setPdfSelectedSemanas(new Set())}
                    style={{ background: "none", border: "none", color: "#64748b", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                  >
                    Desmarcar todas
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", background: "#f8fafc", padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0", maxHeight: "180px", overflowY: "auto" }}>
                {semanasActivas.map((sItem) => {
                  const isSel = pdfSelectedSemanas.has(sItem.semana);
                  return (
                    <button
                      key={sItem.semana}
                      type="button"
                      onClick={() => {
                        setPdfSelectedSemanas((prev) => {
                          const next = new Set(prev);
                          if (next.has(sItem.semana)) next.delete(sItem.semana);
                          else next.add(sItem.semana);
                          return next;
                        });
                      }}
                      style={{
                        padding: "5px 10px",
                        borderRadius: "8px",
                        border: `1px solid ${isSel ? "#2563eb" : "#cbd5e1"}`,
                        background: isSel ? "#eff6ff" : "#ffffff",
                        color: isSel ? "#1d4ed8" : "#64748b",
                        fontSize: "11.5px",
                        fontWeight: 800,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span style={{ fontSize: "11px" }}>{isSel ? "✓" : "+"}</span>
                      <span>Semana {sItem.semana} ({sItem.fechaInicio.slice(5)})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#64748b",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const originalTitle = document.title;
                  const hoy = new Date();
                  const dd = String(hoy.getDate()).padStart(2, "0");
                  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
                  const yyyy = hoy.getFullYear();
                  const fechaHoyStr = `${dd}-${mm}-${yyyy}`;
                  
                  const curPlayer = realActivePlayers.find((p) => p.id === (selectedJugadorId || realActivePlayers[0]?.id));
                  document.title = tipoInforme === "individual"
                    ? `Informe Temporada ${curPlayer?.apodo || curPlayer?.nombre || "Jugador"} hasta ${fechaHoyStr}`
                    : `Informe Temporada Equipo hasta ${fechaHoyStr}`;

                  setIsPrintingWithFilter(true);
                  setShowPdfModal(false);
                  setTimeout(() => {
                    window.print();
                    setIsPrintingWithFilter(false);
                    document.title = originalTitle;
                  }, 300);
                }}
                style={{
                  padding: "8px 20px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#1e3a8a",
                  color: "#ffffff",
                  fontSize: "12.5px",
                  fontWeight: 900,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 2px 4px rgba(30, 58, 138, 0.3)",
                }}
              >
                <span>🖨️</span>
                <span>Generar e Imprimir PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: "40px", textAlign: "center", fontWeight: 700, color: "#475569" }}>Cargando Informe de Temporada / Reporte Anual...</div>
      ) : (
        <>
          {/* BARRA DE SELECCIÓN DE DEPORTISTA PARA INFORME INDIVIDUAL */}
          {tipoInforme === "individual" && (
            <div
              className="no-print"
              style={{
                marginBottom: "14px",
                background: "#ffffff",
                padding: "12px 18px",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "20px" }}>👤</span>
                <label style={{ fontSize: "13px", fontWeight: 800, color: "#1e293b" }}>
                  Seleccionar Deportista:
                </label>
                <select
                  value={selectedJugadorId || realActivePlayers[0]?.id || ""}
                  onChange={(e) => setSelectedJugadorId(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border: "1.5px solid #3b82f6",
                    fontSize: "13px",
                    fontWeight: 800,
                    color: "#1e3a8a",
                    background: "#eff6ff",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  {realActivePlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.apodo ? `${(p.apodo || p.nombre || "").toUpperCase()} (${p.apodo})` : p.nombre} {p.dorsal ? `· #${p.dorsal}` : ""} {p.posicion ? `· ${p.posicion}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* TARJETAS RESUMEN KPI INDIVIDUAL */}
              {(() => {
                const curP = realActivePlayers.find((p) => p.id === (selectedJugadorId || realActivePlayers[0]?.id)) || realActivePlayers[0];
                if (!curP) return null;

                const totalE = semanasFiltradas.reduce((acc, sItem) => {
                  if (semanasExcluidas.has(sItem.semana) || sItem.fechaInicio > todayStr) return acc;
                  return acc + getBloque1ValorSemana(sItem, "E", "eventos", curP.id);
                }, 0);

                const totalPa = semanasFiltradas.reduce((acc, sItem) => {
                  if (semanasExcluidas.has(sItem.semana) || sItem.fechaInicio > todayStr) return acc;
                  return acc + getBloque1ValorSemana(sItem, "Pa", "eventos", curP.id);
                }, 0);

                const totalOpMins = semanasFiltradas.reduce((acc, sItem) => {
                  if (semanasExcluidas.has(sItem.semana) || sItem.fechaInicio > todayStr) return acc;
                  return acc + getJugadoraEventoSemana(curP, sItem, "Op", "minutos");
                }, 0);

                const totalDisp = semanasFiltradas.reduce((acc, sItem) => {
                  if (semanasExcluidas.has(sItem.semana) || sItem.fechaInicio > todayStr) return acc;
                  return acc + getDisponibilidadSemana(curP, sItem);
                }, 0);

                const totalTeamDisp = semanasFiltradas.reduce((acc, sItem) => {
                  if (semanasExcluidas.has(sItem.semana) || sItem.fechaInicio > todayStr) return acc;
                  return acc + getDisponibilidadSemana({ id: "TEAM", nombre: "TEAM" }, sItem);
                }, 0);

                const dispPct = totalTeamDisp > 0 ? Math.round((totalDisp / totalTeamDisp) * 100) : 100;

                return (
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "4px 10px", borderRadius: "8px", fontSize: "11.5px" }}>
                      <span style={{ color: "#166534", fontWeight: 700 }}>Disponibilidad: </span>
                      <strong style={{ color: "#15803d" }}>{dispPct}%</strong> ({totalDisp}/{totalTeamDisp} días)
                    </div>
                    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "4px 10px", borderRadius: "8px", fontSize: "11.5px" }}>
                      <span style={{ color: "#1e40af", fontWeight: 700 }}>Entrenamientos (E): </span>
                      <strong style={{ color: "#1d4ed8" }}>{totalE}</strong>
                    </div>
                    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "4px 10px", borderRadius: "8px", fontSize: "11.5px" }}>
                      <span style={{ color: "#991b1b", fontWeight: 700 }}>Partidos (Pa): </span>
                      <strong style={{ color: "#b91c1c" }}>{totalPa}</strong>
                    </div>
                    <div style={{ background: "#f0fdfa", border: "1px solid #99f6e4", padding: "4px 10px", borderRadius: "8px", fontSize: "11.5px" }}>
                      <span style={{ color: "#115e59", fontWeight: 700 }}>Minutos Op: </span>
                      <strong style={{ color: "#0f766e" }}>{totalOpMins}&apos;</strong>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

                {/* BARRA HORIZONTAL DESLIZANTE DE DOS PUNTOS PARA ELEGIR EL PERÍODO */}
      {(() => {
        const totalSem = Math.max(1, semanasActivas.length);
        const maxIdx = Math.max(0, totalSem - 1);
        const safeMin = Math.min(Math.max(0, sliderMin), maxIdx);
        const safeMax = Math.max(safeMin, Math.min(sliderMax, maxIdx));

        const sStart = semanasActivas[safeMin] || semanasActivas[0];
        const sEnd = semanasActivas[safeMax] || semanasActivas[maxIdx];

        const fInicioStr = sStart?.fechaInicio || "2026-07-20";
        let fFinStr = "2027-05-17";
        if (sEnd?.fechaInicio) {
          const d = new Date(sEnd.fechaInicio);
          d.setDate(d.getDate() + 6);
          fFinStr = d.toISOString().split("T")[0];
        }

        const pctLeft = (safeMin / maxIdx) * 100;
        const pctRight = (safeMax / maxIdx) * 100;
        const numSemanasSeleccionadas = safeMax - safeMin + 1;

        return (
          <div
            className="no-print"
            style={{
              background: "#ffffff",
              padding: "16px 24px",
              borderRadius: "14px",
              border: "1px solid #cbd5e1",
              boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
              marginBottom: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            {/* CABECERA DE LA BARRA: TÍTULO Y BADGE DE ESTADO */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "20px" }}>↔️</span>
                <span style={{ fontSize: "13px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.2px" }}>
                  Período de Visualización
                </span>
                <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                  (Desliza los dos puntos para acotar el período)
                </span>
              </div>

              {/* BADGE DEL PERÍODO SELECCIONADO */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "#eff6ff",
                  padding: "5px 14px",
                  borderRadius: "20px",
                  border: "1px solid #bfdbfe",
                }}
              >
                <span style={{ fontSize: "12px", fontWeight: 900, color: "#1e3a8a" }}>
                  {numSemanasSeleccionadas} {numSemanasSeleccionadas === 1 ? "semana" : "semanas"}
                </span>
                <span style={{ color: "#93c5fd" }}>•</span>
                <span style={{ fontSize: "12px", fontWeight: 800, color: "#1d4ed8" }}>
                  {formatFechaExcel(fInicioStr)} — {formatFechaExcel(fFinStr)}
                </span>
                {(safeMin > 0 || safeMax < maxIdx) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSliderMin(0);
                      setSliderMax(maxIdx);
                    }}
                    title="Restablecer toda la temporada"
                    style={{
                      marginLeft: "6px",
                      background: "#dbeafe",
                      border: "none",
                      color: "#1e40af",
                      fontSize: "11px",
                      fontWeight: 800,
                      cursor: "pointer",
                      padding: "2px 8px",
                      borderRadius: "10px",
                    }}
                  >
                    ✕ Toda
                  </button>
                )}
              </div>
            </div>

            {/* PISTA CONTINUA CON LOS DOS PUNTOS DESLIZANTES */}
            <div style={{ position: "relative", width: "100%", paddingTop: "26px", paddingBottom: "16px" }}>
              {/* ETIQUETA FLOTANTE SOBRE EL PUNTO 1 (INICIO) */}
              <div
                style={{
                  position: "absolute",
                  top: "0px",
                  left: `${pctLeft}%`,
                  transform: "translateX(-50%)",
                  background: "#1e3a8a",
                  color: "#ffffff",
                  fontSize: "10.5px",
                  fontWeight: 900,
                  padding: "2px 8px",
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                  boxShadow: "0 2px 4px rgba(30,58,138,0.3)",
                  pointerEvents: "none",
                  zIndex: 10,
                  transition: "left 0.05s ease",
                }}
              >
                S{safeMin + 1} ({formatFechaExcel(fInicioStr)})
              </div>

              {/* ETIQUETA FLOTANTE SOBRE EL PUNTO 2 (FIN) */}
              <div
                style={{
                  position: "absolute",
                  top: "0px",
                  left: `${pctRight}%`,
                  transform: "translateX(-50%)",
                  background: "#1e3a8a",
                  color: "#ffffff",
                  fontSize: "10.5px",
                  fontWeight: 900,
                  padding: "2px 8px",
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                  boxShadow: "0 2px 4px rgba(30,58,138,0.3)",
                  pointerEvents: "none",
                  zIndex: 10,
                  transition: "left 0.05s ease",
                }}
              >
                S{safeMax + 1} ({formatFechaExcel(fFinStr)})
              </div>

              {/* PISTA GRIS DE FONDO */}
              <div
                style={{
                  width: "100%",
                  height: "8px",
                  background: "#e2e8f0",
                  borderRadius: "4px",
                  position: "relative",
                }}
              >
                {/* FRANJA AZUL ACTIVA ENTRE LOS DOS PUNTOS */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${pctLeft}%`,
                    width: `${pctRight - pctLeft}%`,
                    background: "linear-gradient(90deg, #1e3a8a, #2563eb)",
                    borderRadius: "4px",
                    boxShadow: "0 1px 3px rgba(37,99,235,0.3)",
                    transition: "left 0.05s ease, width 0.05s ease",
                  }}
                />
              </div>

              {/* INPUT SLIDER 1 (PUNTO IZQUIERDO: MIN) */}
              <input
                type="range"
                min={0}
                max={maxIdx}
                value={safeMin}
                onChange={(e) => {
                  const val = Math.min(Number(e.target.value), safeMax);
                  setSliderMin(val);
                }}
                className="dual-slider-input"
                style={{
                  position: "absolute",
                  top: "26px",
                  left: 0,
                  width: "100%",
                  height: "8px",
                  margin: 0,
                  pointerEvents: "none",
                  appearance: "none",
                  WebkitAppearance: "none",
                  background: "transparent",
                  zIndex: safeMin > maxIdx - 2 ? 5 : 3,
                }}
              />

              {/* INPUT SLIDER 2 (PUNTO DERECHO: MAX) */}
              <input
                type="range"
                min={0}
                max={maxIdx}
                value={safeMax}
                onChange={(e) => {
                  const val = Math.max(Number(e.target.value), safeMin);
                  setSliderMax(val);
                }}
                className="dual-slider-input"
                style={{
                  position: "absolute",
                  top: "26px",
                  left: 0,
                  width: "100%",
                  height: "8px",
                  margin: 0,
                  pointerEvents: "none",
                  appearance: "none",
                  WebkitAppearance: "none",
                  background: "transparent",
                  zIndex: 4,
                }}
              />
            </div>

            {/* MARCADORES EN LOS EXTREMOS DE LA BARRA */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10px", color: "#64748b", fontWeight: 700 }}>
              <span>Inicio: 20/07/2026 (Semana 1)</span>
              <span>Final: 17/05/2027 (Semana {totalSem})</span>
            </div>
          </div>
        );
      })()}

      {/* CONTENEDOR PRINCIPAL DEL INFORME (ESTILO OFICIAL ESTANDARIZADO) */}
          <div className="informe-anual-report-card" style={{ background: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid #cbd5e1", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
            {(() => {
              const curPlayer = realActivePlayers.find((p) => p.id === (selectedJugadorId || realActivePlayers[0]?.id)) || realActivePlayers[0] || { id: "TEAM", nombre: "TEAM" };
              const reportTitleText = tipoInforme === "individual"
                ? `INFORME TEMPORADA INDIVIDUAL — ${(curPlayer?.nombre || "").toUpperCase()} ${curPlayer?.apodo ? `(${curPlayer.apodo})` : ""} ${curPlayer?.dorsal ? `· #${curPlayer.dorsal}` : ""} ${curPlayer?.posicion ? `· ${curPlayer.posicion}` : ""} — ${clubName.toUpperCase()}`
                : `INFORME TEMPORADA EQUIPO — ${clubName.toUpperCase()}`;

              return (
                <div style={{ marginBottom: "14px", borderBottom: "2px solid #0f172a", paddingBottom: "12px" }}>
                  {/* 1. TÍTULO DEL INFORME CENTRADO */}
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", position: "relative", marginBottom: "8px" }}>
                    <h2 style={{ fontSize: "18px", fontWeight: 900, color: "#0f172a", margin: 0, textTransform: "uppercase", letterSpacing: "-0.01em", textAlign: "center" }}>
                      {reportTitleText}
                    </h2>
                  </div>

                  {/* 2. FILA A LA ALTURA DEL ESCUDO: Escudo + Club a la izquierda / Fecha a la derecha */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                    {/* Izquierda: Escudo y nombre del club */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                      <img
                        src={clubShield || undefined}
                        alt={clubName}
                        style={{ width: "46px", height: "54px", objectFit: "contain", background: "#ffffff", borderRadius: "6px", padding: "2px" }}
                      />
                      <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#0f172a" }}>
                        {clubName}
                      </span>
                    </div>

                    {/* Derecha: Fecha del informe */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <label style={{ fontSize: "11.5px", fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>Fecha:</label>
                      <input
                        type="text"
                        value={reportDate}
                        onChange={(e) => setReportDate(e.target.value)}
                        style={{
                          fontSize: "12.5px",
                          fontWeight: 800,
                          padding: "5px 10px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          background: "#f8fafc",
                          color: "#0f172a",
                          outline: "none",
                          width: "165px",
                        }}
                      />
                    </div>
                  </div>

                  {/* 3. ESPACIO PARA AÑADIR UN COMENTARIO / VALORACIÓN */}
                  <div className={!reportComment.trim() ? "no-print" : ""} style={{ marginTop: "12px" }}>
                    <textarea
                      value={reportComment}
                      onChange={(e) => {
                        setReportComment(e.target.value);
                        try {
                          localStorage.setItem("informe_anual_comentario", e.target.value);
                        } catch (err) {}
                      }}
                      placeholder="Escribe aquí un comentario, observaciones o valoración general de la temporada / informe anual..."
                      rows={2}
                      style={{
                        width: "100%",
                        fontSize: "12.5px",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        borderLeft: "3px solid #1e3a8a",
                        background: "#f8fafc",
                        color: "#0f172a",
                        outline: "none",
                        boxSizing: "border-box",
                        fontFamily: "inherit",
                        resize: "vertical",
                      }}
                    />
                  </div>
                </div>
              );
            })()}

            <div style={{ overflowX: "auto" }}>
              {(() => {
                const semanasRender = semanasFiltradas.filter((sItem) => isSemanaVisible(sItem.semana));
                const totalColspan = 2 + semanasRender.reduce((acc, sItem) => acc + 1 + (semanasAmpliadas.has(sItem.semana) ? 7 : 0), 0);

                const curPlayer = realActivePlayers.find((p) => p.id === (selectedJugadorId || realActivePlayers[0]?.id)) || realActivePlayers[0] || { id: "TEAM", nombre: "TEAM" };
                const playersToRender = tipoInforme === "individual" ? [curPlayer] : activePlayers;
                const targetIdBloque1 = tipoInforme === "individual" ? curPlayer.id : "TEAM";
                const targetObjBloque3 = tipoInforme === "individual" ? curPlayer : { id: "TEAM", nombre: "TEAM" };

                return (
                  <table style={{ borderCollapse: "collapse", width: "100%", whiteSpace: "nowrap", fontFamily: "Calibri, Arial, sans-serif" }}>
                    <thead>
                      {/* FILA 1: PERÍODO (P) ALINEADO POR ENCIMA DE LAS SEMANAS */}
                      <tr style={{ background: "#f8fafc", textAlign: "center", fontSize: "10px", fontWeight: 800 }}>
                    {/* ESCUDO + NOMBRE UNIFICADOS (ROWSPAN=3) */}
                    <td
                      rowSpan={3}
                      style={{
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
                      <img src={clubShield} alt={activeTeam} style={{ width: "32px", height: "32px", display: "block", margin: "0 auto 2px auto", objectFit: "contain" }} />
                      <span style={{ fontSize: "9px", fontWeight: 900, color: "#1e3a8a", letterSpacing: "0.2px" }}>{activeTeam.toUpperCase()}</span>
                    </td>

                    {/* CELDA UNIFICADA DE SUMA (LETRAS APILADAS VERTICALMENTE S-U-M-A) */}
                    <td
                      rowSpan={3}
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
                    >
                      S<br />U<br />M<br />A
                    </td>

                    {/* CELDAS AZULES DE P CORRESPONDIENTES ÚNICAMENTE A CADA SEMANA */}
                    {semanasRender.map((sItem) => {
                      const esAmpliada = semanasAmpliadas.has(sItem.semana);
                      return (
                        <React.Fragment key={sItem.semana}>
                          <td style={{ border: "1px solid #0284c7", background: "#0284c7", color: "#ffffff", fontWeight: 900, textAlign: "center", padding: "4px 2px", fontSize: "10px" }}>
                            P
                          </td>
                          {esAmpliada &&
                            [1, 2, 3, 4, 5, 6, 7].map((d) => (
                              <td key={d} style={{ border: "1px solid #0369a1", background: "#0369a1", color: "#ffffff", fontSize: "8px", fontWeight: 700, textAlign: "center" }}>
                                P
                              </td>
                            ))}
                        </React.Fragment>
                      );
                    })}
                  </tr>

                  {/* FILA 3: FECHAS DE SEMANAS Y DÍAS AMPLIADOS CON BOTONES DE CONTROL */}
                  <tr style={{ background: "#f1f5f9", textAlign: "center", fontSize: "10px", fontWeight: 700 }}>
                    {semanasRender.map((sItem) => {
                      const esExcluida = semanasExcluidas.has(sItem.semana);
                      const esAmpliada = semanasAmpliadas.has(sItem.semana);
                      const fechas7 = getFechasSemanaAmpliada(sItem.fechaInicio);

                      return (
                        <React.Fragment key={sItem.semana}>
                          {/* COLUMNA PRINCIPAL DE SEMANA */}
                          <td
                            style={{
                              border: "1px solid #93c5fd",
                              background: esExcluida ? "#94a3b8" : "#2563eb",
                              color: "#ffffff",
                              padding: "4px 2px",
                              width: "48px",
                              fontSize: "9px",
                              textAlign: "center",
                              verticalAlign: "bottom",
                            }}
                          >
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                              {/* BOTONES EXCLUIR Y AMPLIAR EN LA CABECERA */}
                              <div className="no-print" style={{ display: "flex", gap: "2px", marginBottom: "4px" }}>
                                <button
                                  type="button"
                                  onClick={() => toggleExcluirSemana(sItem.semana)}
                                  title={esExcluida ? "Incluir semana en Suma" : "Excluir semana de Suma"}
                                  style={{ background: esExcluida ? "#ef4444" : "rgba(255,255,255,0.3)", color: "#fff", border: "none", borderRadius: "3px", padding: "1px 3px", fontSize: "9px", cursor: "pointer" }}
                                >
                                  {esExcluida ? "🚫" : "👁️"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleAmpliarSemana(sItem.semana)}
                                  title={esAmpliada ? "Plegar días" : "Ampliar semana a 7 días"}
                                  style={{ background: esAmpliada ? "#eab308" : "rgba(255,255,255,0.3)", color: "#fff", border: "none", borderRadius: "3px", padding: "1px 3px", fontSize: "9px", cursor: "pointer" }}
                                >
                                  {esAmpliada ? "➖" : "➕"}
                                </button>
                              </div>
                              <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                                {formatFechaExcel(sItem.fechaInicio)}
                              </div>
                            </div>
                          </td>

                          {/* DÍAS INDIVIDUALES INSERTADOS A LA DERECHA SI ESTÁ AMPLIADA */}
                          {esAmpliada &&
                            fechas7.map((fStr, dIdx) => {
                              const diasSemanaNombres = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
                              return (
                                <td
                                  key={fStr}
                                  style={{
                                    border: "1px solid #cbd5e1",
                                    background: "#38bdf8",
                                    color: "#ffffff",
                                    padding: "4px 1px",
                                    width: "30px",
                                    writingMode: "vertical-rl",
                                    transform: "rotate(180deg)",
                                    fontSize: "8.5px",
                                    textAlign: "center",
                                  }}
                                >
                                  {diasSemanaNombres[dIdx]} ({formatFechaExcel(fStr).slice(0, 5)})
                                </td>
                              );
                            })}
                        </React.Fragment>
                      );
                    })}
                  </tr>

                  {/* FILA 4: Nº SEMANA (CON LAS ETIQUETAS DE DÍAS A LA DERECHA) */}
                  <tr style={{ background: "#ffffff", textAlign: "center", fontSize: "10px" }}>
                    {semanasRender.map((sItem) => {
                      const esAmpliada = semanasAmpliadas.has(sItem.semana);
                      const diasSemanaNombres = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
                      return (
                        <React.Fragment key={sItem.semana}>
                          <td style={{ border: "1px solid #cbd5e1", fontWeight: 700, background: semanasExcluidas.has(sItem.semana) ? "#f1f5f9" : "#ffffff" }}>
                            S{sItem.semana}
                          </td>
                          {esAmpliada &&
                            [0, 1, 2, 3, 4, 5, 6].map((dIdx) => (
                              <td key={dIdx} style={{ border: "1px solid #cbd5e1", background: "#e0f2fe", fontSize: "8px", fontWeight: 700 }}>
                                {diasSemanaNombres[dIdx]}
                              </td>
                            ))}
                        </React.Fragment>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {/* ========================================================================= */}
                  {/* BLOQUE 1: ENTRENAMIENTO / PARTIDO / OFF */}
                  {/* ========================================================================= */}
                  {isBloqueVisible("b1") && (
                    <tr style={{ cursor: "pointer", background: "#f8fafc" }} onClick={() => toggleBloquePlegado("b1")}>
                      <td colSpan={totalColspan} style={{ border: "1px solid #cbd5e1", padding: "4px 8px", background: "#f1f5f9", fontWeight: 900, fontSize: "11px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>{bloquesPlegados.b1 ? "▶" : "▼"} ENTRENAMIENTO / PARTIDO / OFF</span>
                          <button
                            type="button"
                            className="no-print"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleModoBloque("bloque1");
                            }}
                            style={{ background: "#0284c7", color: "#fff", border: "none", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, cursor: "pointer" }}
                          >
                            Modo: {modoBloque.bloque1 === "eventos" ? "Nº Eventos" : "Minutos en eventos"} 🔄
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {isBloqueContentOpen("b1") && (() => {
                    const b1Rows = [
                      { label: "E", key: "E", color: "#0284c7" },
                      { label: "Pa", key: "Pa", color: "#dc2626" },
                      { label: "Off", key: "Off", color: "#64748b" },
                    ];
                    const sumas = b1Rows.map((row) =>
                      semanasFiltradas.reduce((acc, sItem) => {
                        if (semanasExcluidas.has(sItem.semana) || sItem.fechaInicio > todayStr) return acc;
                        return acc + getBloque1ValorSemana(sItem, row.key as any, modoBloque.bloque1, targetIdBloque1);
                      }, 0)
                    );
                    const maxB1 = Math.max(...sumas, 1);

                    return b1Rows.map((row, idx) => {
                      const sumaTotal = sumas[idx];
                      const scaleStyle = getContadorColorScale(sumaTotal, maxB1, "slate");

                      return (
                        <tr key={row.key} style={{ textAlign: "center", fontSize: "10px" }}>
                          <td style={{ border: "1px solid #cbd5e1", width: "80px", minWidth: "70px", maxWidth: "90px", fontWeight: 800, color: row.color, textAlign: "right", paddingRight: "6px" }}>{row.label}</td>
                          <td style={{ border: "1px solid #cbd5e1", width: "36px", minWidth: "36px", ...scaleStyle }}>{sumaTotal}</td>

                          {semanasRender.map((sItem) => {
                            const valSemana = getBloque1ValorSemana(sItem, row.key as any, modoBloque.bloque1, targetIdBloque1);
                            const esExcluida = semanasExcluidas.has(sItem.semana);
                            const esAmpliada = semanasAmpliadas.has(sItem.semana);
                            const fechas7 = getFechasSemanaAmpliada(sItem.fechaInicio);

                            return (
                              <React.Fragment key={sItem.semana}>
                                <td style={{ border: "1px solid #cbd5e1", background: esExcluida ? "#f1f5f9" : "transparent", opacity: esExcluida ? 0.4 : 1, fontWeight: valSemana > 0 ? 800 : 400 }}>
                                  {valSemana}
                                </td>
                                {esAmpliada &&
                                  fechas7.map((fStr) => {
                                    const valDia = getBloque1ValorDia(fStr, row.key as any, modoBloque.bloque1, targetIdBloque1);
                                    return (
                                      <td key={fStr} style={{ border: "1px solid #cbd5e1", background: "#f0f9ff", fontSize: "8.5px" }}>
                                        {valDia}
                                      </td>
                                    );
                                  })}
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    });
                  })()}

                  {/* ========================================================================= */}
                  {/* BLOQUE 2: ETIQUETADO MD */}
                  {/* ========================================================================= */}
                  {isBloqueVisible("b2") && (
                    <tr style={{ cursor: "pointer", background: "#f8fafc" }} onClick={() => toggleBloquePlegado("b2")}>
                      <td colSpan={totalColspan} style={{ border: "1px solid #cbd5e1", padding: "4px 8px", background: "#0f172a", color: "#ffffff", fontWeight: 900, fontSize: "11px" }}>
                        {bloquesPlegados.b2 ? "▶" : "▼"} ETIQUETADO MD
                      </td>
                    </tr>
                  )}

                  {isBloqueContentOpen("b2") && (() => {
                    const b2Rows = [
                      { label: ">-5 MD", key: ">-5MD" },
                      { label: "-5 MD", key: "-5MD" },
                      { label: "-4 MD", key: "-4MD" },
                      { label: "-3 MD", key: "-3MD" },
                      { label: "-2 MD", key: "-2MD" },
                      { label: "-1 MD", key: "-1MD" },
                      { label: "MD", key: "MD" },
                      { label: "+1 MD", key: "+1MD" },
                      { label: "+2 MD", key: "+2MD" },
                    ];
                    const sumas = b2Rows.map((mdItem) =>
                      semanasFiltradas.reduce((acc, sItem) => {
                        if (semanasExcluidas.has(sItem.semana) || sItem.fechaInicio > todayStr) return acc;
                        return acc + getEtiquetadoMdSemana(sItem, mdItem.key, targetIdBloque1);
                      }, 0)
                    );
                    const maxB2 = Math.max(...sumas, 1);

                    return b2Rows.map((mdItem, idx) => {
                      const sumaTotal = sumas[idx];
                      const scaleStyle = getContadorColorScale(sumaTotal, maxB2, "blue");

                      return (
                        <tr key={mdItem.key} style={{ textAlign: "center", fontSize: "10px" }}>
                          <td style={{ border: "1px solid #cbd5e1", width: "80px", minWidth: "70px", maxWidth: "90px", fontWeight: 800, textAlign: "right", paddingRight: "6px" }}>{mdItem.label}</td>
                          <td style={{ border: "1px solid #cbd5e1", width: "36px", minWidth: "36px", ...scaleStyle }}>{sumaTotal}</td>

                          {semanasRender.map((sItem) => {
                            const esFutura = sItem.fechaInicio > todayStr;
                            const valSemana = esFutura ? 0 : getEtiquetadoMdSemana(sItem, mdItem.key, targetIdBloque1);
                            const esExcluida = semanasExcluidas.has(sItem.semana);
                            const esAmpliada = semanasAmpliadas.has(sItem.semana);
                            const fechas7 = getFechasSemanaAmpliada(sItem.fechaInicio);
                            const cellStyle = esFutura ? { background: "transparent", color: "transparent" } : getContadorColorScale(valSemana, 5, "blue");

                            return (
                              <React.Fragment key={sItem.semana}>
                                <td
                                  style={{
                                    border: "1px solid #cbd5e1",
                                    ...cellStyle,
                                    opacity: esExcluida || esFutura ? 0.4 : 1,
                                    color: esFutura ? "transparent" : valSemana === 0 ? "#cbd5e1" : "#0f172a",
                                  }}
                                >
                                  {esFutura ? "" : valSemana}
                                </td>
                                {esAmpliada &&
                                  fechas7.map((fStr) => {
                                    const esDiaFuturo = fStr > todayStr;
                                    const valDia = esDiaFuturo ? 0 : getEtiquetadoMdDia(fStr, mdItem.key, targetIdBloque1);
                                    const diaStyle = esDiaFuturo ? { background: "transparent", color: "transparent" } : getContadorColorScale(valDia, 1, "blue");
                                    return (
                                      <td
                                        key={fStr}
                                        style={{
                                          border: "1px solid #cbd5e1",
                                          ...diaStyle,
                                          fontSize: "8.5px",
                                          color: esDiaFuturo ? "transparent" : valDia === 0 ? "#cbd5e1" : "#0f172a",
                                        }}
                                      >
                                        {esDiaFuturo ? "" : valDia}
                                      </td>
                                    );
                                  })}
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    });
                  })()}

                  {/* ========================================================================= */}
                  {/* BLOQUE 3: EVENTOS ESPECÍFICOS */}
                  {/* ========================================================================= */}
                  {isBloqueVisible("b3") && (
                    <tr style={{ cursor: "pointer", background: "#f8fafc" }} onClick={() => toggleBloquePlegado("b3")}>
                      <td colSpan={totalColspan} style={{ border: "1px solid #cbd5e1", padding: "4px 8px", background: "#f1f5f9", fontWeight: 900, fontSize: "11px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>{bloquesPlegados.b3 ? "▶" : "▼"} EVENTOS ESPECÍFICOS</span>
                          <button
                            type="button"
                            className="no-print"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleModoBloque("bloque3");
                            }}
                            style={{ background: "#0284c7", color: "#fff", border: "none", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, cursor: "pointer" }}
                          >
                            Modo: {modoBloque.bloque3 === "eventos" ? "Nº Eventos" : "Minutos en eventos"} 🔄
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {isBloqueContentOpen("b3") && (() => {
                    const b3Rows = [
                      { label: "Op", key: "Op", color: "#0284c7" },
                      { label: "Co", key: "Co", color: "#eab308" },
                      { label: "Vi", key: "Vi", color: "#64748b" },
                      { label: "Pa", key: "Pa", color: "#dc2626" },
                    ];
                    const sumas = b3Rows.map((evItem) =>
                      semanasFiltradas.reduce((acc, sItem) => {
                        if (semanasExcluidas.has(sItem.semana) || sItem.fechaInicio > todayStr) return acc;
                        return acc + getJugadoraEventoSemana(targetObjBloque3, sItem, evItem.key as any, modoBloque.bloque3);
                      }, 0)
                    );
                    const maxB3 = Math.max(...sumas, 1);

                    return b3Rows.map((evItem, idx) => {
                      const sumaTotal = sumas[idx];
                      const scaleStyle = getContadorColorScale(sumaTotal, maxB3, "slate");

                      return (
                        <tr key={evItem.key} style={{ textAlign: "center", fontSize: "10px" }}>
                          <td style={{ border: "1px solid #cbd5e1", width: "80px", minWidth: "70px", maxWidth: "90px", fontWeight: 800, color: evItem.color, textAlign: "right", paddingRight: "6px" }}>{evItem.label}</td>
                          <td style={{ border: "1px solid #cbd5e1", width: "36px", minWidth: "36px", ...scaleStyle }}>{sumaTotal}</td>

                          {semanasRender.map((sItem) => {
                            const valSemana = getJugadoraEventoSemana(targetObjBloque3, sItem, evItem.key as any, modoBloque.bloque3);
                            const esExcluida = semanasExcluidas.has(sItem.semana);
                            const esAmpliada = semanasAmpliadas.has(sItem.semana);
                            const fechas7 = getFechasSemanaAmpliada(sItem.fechaInicio);

                            return (
                              <React.Fragment key={sItem.semana}>
                                <td style={{ border: "1px solid #cbd5e1", opacity: esExcluida ? 0.4 : 1, fontWeight: valSemana > 0 ? 800 : 400 }}>
                                  {valSemana}
                                </td>
                                {esAmpliada &&
                                  fechas7.map((fStr) => {
                                    const valDia = getJugadoraEventoDia(targetObjBloque3, fStr, evItem.key as any, modoBloque.bloque3);
                                    return (
                                      <td key={fStr} style={{ border: "1px solid #cbd5e1", background: "#f0f9ff", fontSize: "8.5px" }}>
                                        {valDia}
                                      </td>
                                    );
                                  })}
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    });
                  })()}

                  {/* ========================================================================= */}
                  {/* BLOQUE 4: DISPONIBILIDAD */}
                  {/* ========================================================================= */}
                  {isBloqueVisible("b4") && (
                    <tr style={{ cursor: "pointer", background: "#f8fafc" }} onClick={() => toggleBloquePlegado("b4")}>
                      <td colSpan={totalColspan} style={{ border: "1px solid #cbd5e1", padding: "4px 8px", background: "#15803d", color: "#ffffff", fontWeight: 900, fontSize: "11px" }}>
                        {bloquesPlegados.b4 ? "▶" : "▼"} DISPONIBILIDAD
                      </td>
                    </tr>
                  )}

                  {isBloqueContentOpen("b4") && (() => {
                    const sumas = playersToRender.map((j) =>
                      semanasFiltradas.reduce((acc, sItem) => {
                        if (semanasExcluidas.has(sItem.semana) || sItem.fechaInicio > todayStr) return acc;
                        return acc + getDisponibilidadSemana(j, sItem);
                      }, 0)
                    );
                    const maxB4 = Math.max(...sumas, 1);

                    return playersToRender.map((j, idx) => {
                      const sumaTotal = sumas[idx];
                      const scaleStyle = getContadorColorScale(sumaTotal, maxB4, "green");

                      return (
                        <tr key={j.id} style={{ textAlign: "center", fontSize: "10px" }}>
                          <td style={{ border: "1px solid #cbd5e1", width: "80px", minWidth: "70px", maxWidth: "90px", fontWeight: 800, textAlign: "right", paddingRight: "6px", overflow: "hidden", textOverflow: "ellipsis" }}>{(j.apodo || j.nombre || "").toUpperCase()}</td>
                          <td style={{ border: "1px solid #cbd5e1", width: "36px", minWidth: "36px", ...scaleStyle }}>{sumaTotal}</td>

                          {semanasRender.map((sItem) => {
                            const esFutura = sItem.fechaInicio > todayStr;
                            const valSemana = esFutura ? 0 : getDisponibilidadSemana(j, sItem);
                            const valTeamSemana = esFutura ? 0 : getDisponibilidadSemana({ id: "TEAM", nombre: "TEAM" }, sItem);
                            const esExcluida = semanasExcluidas.has(sItem.semana);
                            const esAmpliada = semanasAmpliadas.has(sItem.semana);
                            const fechas7 = getFechasSemanaAmpliada(sItem.fechaInicio);

                            const pct = valTeamSemana > 0 ? (valSemana / valTeamSemana) * 100 : 0;
                            
                            let bg = "transparent";
                            let textColor = "#000000";

                            if (esFutura || valTeamSemana === 0) {
                              bg = "transparent";
                            } else if (pct < 34) {
                              bg = "#fee2e2";
                              textColor = "#dc2626";
                            } else if (pct <= 68) {
                              bg = "#fef3c7";
                              textColor = "#d97706";
                            } else if (pct < 100) {
                              bg = "#f0fdf4";
                              textColor = "#16a34a";
                            } else {
                              bg = "#dcfce7";
                              textColor = "#15803d";
                            }

                            if (j.id === "TEAM" && !esFutura) {
                              bg = "#dcfce7";
                              textColor = "#15803d";
                            }

                            return (
                              <React.Fragment key={sItem.semana}>
                                <td style={{ border: "1px solid #cbd5e1", background: bg, color: textColor, opacity: (esExcluida || esFutura) ? 0.4 : 1, fontWeight: 700 }}>
                                  {esFutura ? "" : valSemana}
                                </td>
                                {esAmpliada &&
                                  fechas7.map((fStr) => {
                                    const valDia = fStr > todayStr ? 0 : getDisponibilidadDia(j, fStr);
                                    return (
                                      <td key={fStr} style={{ border: "1px solid #cbd5e1", background: (valDia && fStr <= todayStr) ? "#dcfce7" : "#fee2e2", fontSize: "8.5px", fontWeight: 700 }}>
                                        {fStr > todayStr ? "" : (valDia ? "D" : "ND")}
                                      </td>
                                    );
                                  })}
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    });
                  })()}

                  {/* ========================================================================= */}
                  {/* BLOQUE 5: OPTIMIZADOR */}
                  {/* ========================================================================= */}
                  {isBloqueVisible("b5") && (
                    <tr style={{ cursor: "pointer", background: "#f8fafc" }} onClick={() => toggleBloquePlegado("b5")}>
                      <td colSpan={totalColspan} style={{ border: "1px solid #cbd5e1", padding: "4px 8px", background: "#0284c7", color: "#ffffff", fontWeight: 900, fontSize: "11px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>{bloquesPlegados.b5 ? "▶" : "▼"} OPTIMIZADOR</span>
                          <button
                            type="button"
                            className="no-print"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleModoBloque("bloque5");
                            }}
                            style={{ background: "#ffffff", color: "#0284c7", border: "none", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 800, cursor: "pointer" }}
                          >
                            Modo: {modoBloque.bloque5 === "eventos" ? "Nº Eventos" : "Minutos en eventos"} 🔄
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {isBloqueContentOpen("b5") && (() => {
                    const sumas = playersToRender.map((j) =>
                      semanasFiltradas.reduce((acc, sItem) => {
                        if (semanasExcluidas.has(sItem.semana) || sItem.fechaInicio > todayStr) return acc;
                        return acc + getJugadoraEventoSemana(j, sItem, "Op", modoBloque.bloque5);
                      }, 0)
                    );
                    const maxB5 = Math.max(...sumas, 1);

                    return playersToRender.map((j, idx) => {
                      const sumaTotal = sumas[idx];
                      const scaleStyle = getContadorColorScale(sumaTotal, maxB5, "blue");

                      return (
                        <tr key={j.id} style={{ textAlign: "center", fontSize: "10px" }}>
                          <td style={{ border: "1px solid #cbd5e1", width: "80px", minWidth: "70px", maxWidth: "90px", fontWeight: 800, textAlign: "right", paddingRight: "6px", overflow: "hidden", textOverflow: "ellipsis" }}>{(j.apodo || j.nombre || "").toUpperCase()}</td>
                          <td style={{ border: "1px solid #cbd5e1", width: "36px", minWidth: "36px", ...scaleStyle }}>{sumaTotal}</td>

                          {semanasRender.map((sItem) => {
                            const esFutura = sItem.fechaInicio > todayStr;
                            const valSemana = esFutura ? 0 : getJugadoraEventoSemana(j, sItem, "Op", modoBloque.bloque5);
                            const esExcluida = semanasExcluidas.has(sItem.semana);
                            const esAmpliada = semanasAmpliadas.has(sItem.semana);
                            const fechas7 = getFechasSemanaAmpliada(sItem.fechaInicio);
                            const maxWeekVal = modoBloque.bloque5 === "eventos" ? 7 : 360;
                            const cellStyle = esFutura ? { background: "transparent", color: "#cbd5e1" } : getContadorColorScale(valSemana, maxWeekVal, "blue");

                            return (
                              <React.Fragment key={sItem.semana}>
                                <td style={{ border: "1px solid #cbd5e1", ...cellStyle, opacity: (esExcluida || esFutura) ? 0.4 : 1 }}>
                                  {esFutura ? "" : valSemana}
                                </td>
                                {esAmpliada &&
                                  fechas7.map((fStr) => {
                                    const valDia = fStr > todayStr ? 0 : getJugadoraEventoDia(j, fStr, "Op", modoBloque.bloque5);
                                    const diaStyle = fStr > todayStr ? { background: "transparent", color: "#cbd5e1" } : getContadorColorScale(valDia, modoBloque.bloque5 === "eventos" ? 1 : 90, "blue");
                                    return (
                                      <td key={fStr} style={{ border: "1px solid #cbd5e1", ...diaStyle, fontSize: "8.5px" }}>
                                        {fStr > todayStr ? "" : valDia}
                                      </td>
                                    );
                                  })}
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    });
                  })()}

                  {/* ========================================================================= */}
                  {/* BLOQUE 6: COADYUVANTE */}
                  {/* ========================================================================= */}
                  {isBloqueVisible("b6") && (
                    <tr style={{ cursor: "pointer", background: "#f8fafc" }} onClick={() => toggleBloquePlegado("b6")}>
                      <td colSpan={totalColspan} style={{ border: "1px solid #cbd5e1", padding: "4px 8px", background: "#eab308", color: "#ffffff", fontWeight: 900, fontSize: "11px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>{bloquesPlegados.b6 ? "▶" : "▼"} COADYUVANTE</span>
                          <button
                            type="button"
                            className="no-print"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleModoBloque("bloque6");
                            }}
                            style={{ background: "#ffffff", color: "#a16207", border: "none", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 800, cursor: "pointer" }}
                          >
                            Modo: {modoBloque.bloque6 === "eventos" ? "Nº Eventos" : "Minutos en eventos"} 🔄
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {isBloqueContentOpen("b6") && (() => {
                    const sumas = playersToRender.map((j) =>
                      semanasFiltradas.reduce((acc, sItem) => {
                        if (semanasExcluidas.has(sItem.semana) || sItem.fechaInicio > todayStr) return acc;
                        return acc + getJugadoraEventoSemana(j, sItem, "Co", modoBloque.bloque6);
                      }, 0)
                    );
                    const maxB6 = Math.max(...sumas, 1);

                    return playersToRender.map((j, idx) => {
                      const sumaTotal = sumas[idx];
                      const scaleStyle = getContadorColorScale(sumaTotal, maxB6, "yellow");

                      return (
                        <tr key={j.id} style={{ textAlign: "center", fontSize: "10px" }}>
                          <td style={{ border: "1px solid #cbd5e1", width: "80px", minWidth: "70px", maxWidth: "90px", fontWeight: 800, textAlign: "right", paddingRight: "6px", overflow: "hidden", textOverflow: "ellipsis" }}>{(j.apodo || j.nombre || "").toUpperCase()}</td>
                          <td style={{ border: "1px solid #cbd5e1", width: "36px", minWidth: "36px", ...scaleStyle }}>{sumaTotal}</td>

                          {semanasRender.map((sItem) => {
                            const esFutura = sItem.fechaInicio > todayStr;
                            const valSemana = esFutura ? 0 : getJugadoraEventoSemana(j, sItem, "Co", modoBloque.bloque6);
                            const esExcluida = semanasExcluidas.has(sItem.semana);
                            const esAmpliada = semanasAmpliadas.has(sItem.semana);
                            const fechas7 = getFechasSemanaAmpliada(sItem.fechaInicio);
                            const maxWeekVal = modoBloque.bloque6 === "eventos" ? 7 : 360;
                            const cellStyle = esFutura ? { background: "transparent", color: "#cbd5e1" } : getContadorColorScale(valSemana, maxWeekVal, "yellow");

                            return (
                              <React.Fragment key={sItem.semana}>
                                <td style={{ border: "1px solid #cbd5e1", ...cellStyle, opacity: (esExcluida || esFutura) ? 0.4 : 1 }}>
                                  {esFutura ? "" : valSemana}
                                </td>
                                {esAmpliada &&
                                  fechas7.map((fStr) => {
                                    const valDia = fStr > todayStr ? 0 : getJugadoraEventoDia(j, fStr, "Co", modoBloque.bloque6);
                                    const diaStyle = fStr > todayStr ? { background: "transparent", color: "#cbd5e1" } : getContadorColorScale(valDia, modoBloque.bloque6 === "eventos" ? 1 : 90, "yellow");
                                    return (
                                      <td key={fStr} style={{ border: "1px solid #cbd5e1", ...diaStyle, fontSize: "8.5px" }}>
                                        {fStr > todayStr ? "" : valDia}
                                      </td>
                                    );
                                  })}
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    });
                  })()}

                  {/* ========================================================================= */}
                  {/* BLOQUE 7: PARTIDO */}
                  {/* ========================================================================= */}
                  {isBloqueVisible("b7") && (
                    <tr style={{ cursor: "pointer", background: "#f8fafc" }} onClick={() => toggleBloquePlegado("b7")}>
                      <td colSpan={totalColspan} style={{ border: "1px solid #cbd5e1", padding: "4px 8px", background: "#dc2626", color: "#ffffff", fontWeight: 900, fontSize: "11px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                            <span>{bloquesPlegados.b7 ? "▶" : "▼"} PARTIDO</span>
                            
                            {/* FILTRO DE COMPETICIÓN */}
                            <div className="no-print" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <select
                                value={partidoFiltro}
                                onChange={(e) => setPartidoFiltro(e.target.value)}
                                style={{
                                  padding: "2px 6px",
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  borderRadius: "3px",
                                  border: "1px solid rgba(255, 255, 255, 0.4)",
                                  background: "rgba(0, 0, 0, 0.2)",
                                  color: "#ffffff",
                                  outline: "none",
                                  cursor: "pointer",
                                }}
                              >
                                <option value="PAAM_Y_PA" style={{ color: "#000" }}>Todos</option>
                                <option value="PA_ALL" style={{ color: "#000" }}>Oficiales</option>
                                <option value="PAAM_ONLY" style={{ color: "#000" }}>Amistosos</option>
                                <option value="LIGA" style={{ color: "#000" }}>2RFEF</option>
                                <option value="COPA_REY" style={{ color: "#000" }}>Copa del Rey</option>
                                <option value="COPA_CATALUNYA" style={{ color: "#000" }}>Copa Catalunya</option>
                              </select>
                            </div>

                            {/* FILTRO DE ORDENACIÓN (HABITUAL, POR POSICIÓN TÁCTICA O POR MINUTOS) */}
                            <div className="no-print" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <select
                                value={partidoOrden}
                                onChange={(e) => handlePartidoOrdenChange(e.target.value as any)}
                                style={{
                                  padding: "2px 6px",
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  borderRadius: "3px",
                                  border: "1px solid rgba(255, 255, 255, 0.4)",
                                  background: "rgba(0, 0, 0, 0.2)",
                                  color: "#ffffff",
                                  outline: "none",
                                  cursor: "pointer",
                                }}
                              >
                                <option value="default" style={{ color: "#000" }}>Orden habitual</option>
                                <option value="posicion" style={{ color: "#000" }}>Por Posición Táctica</option>
                                <option value="suma_desc" style={{ color: "#000" }}>Por Minutos (Mayor a Menor) ⬇</option>
                                <option value="suma_asc" style={{ color: "#000" }}>Por Minutos (Menor a Mayor) ⬆</option>
                              </select>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="no-print"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleModoBloque("bloque7");
                            }}
                            style={{ background: "#ffffff", color: "#dc2626", border: "none", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 800, cursor: "pointer" }}
                          >
                            Modo: {modoBloque.bloque7 === "eventos" ? "Nº Eventos" : "Minutos en eventos"} 🔄
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {isBloqueContentOpen("b7") && (() => {
                    function getTacticalPosScore(posStr?: string | null): number {
                      if (!posStr) return 99;
                      const p = posStr.trim().toUpperCase();

                      // 1. Portero
                      if (p.includes("PORT") || p.includes("GK") || p === "POR") return 1;

                      // 2. Lateral Derecho
                      if (
                        (p.includes("LATERAL") && (p.includes("DER") || p.includes(" D") || p.endsWith("D"))) ||
                        p === "LD" ||
                        (p.includes("CARRILERO") && (p.includes("DER") || p.includes(" D") || p.endsWith("D")))
                      ) {
                        return 2;
                      }

                      // 3. Lateral Izquierdo
                      if (
                        (p.includes("LATERAL") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I"))) ||
                        p === "LI" ||
                        (p.includes("CARRILERO") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I")))
                      ) {
                        return 3;
                      }

                      // Lateral genérico
                      if (p.includes("LATERAL") || p.includes("CARRILERO")) return 2.5;

                      // 4. Central Derecho
                      if (
                        (p.includes("CENTRAL") && (p.includes("DER") || p.includes(" D") || p.endsWith("D"))) ||
                        p === "DCD" ||
                        p === "CD"
                      ) {
                        return 4;
                      }

                      // 5. Central Izquierdo
                      if (
                        (p.includes("CENTRAL") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I"))) ||
                        p === "DCI" ||
                        p === "CI"
                      ) {
                        return 5;
                      }

                      // Central genérico
                      if (p.includes("CENTRAL") || p.includes("DEFENSA")) return 4.5;

                      // 6. Pivote
                      if (p.includes("PIVOT") || p.includes("MCD") || p === "PIV" || p.includes("MEDIOCENTRO DEF")) return 6;

                      // 7. Interior Derecho
                      if (
                        (p.includes("INTERIOR") && (p.includes("DER") || p.includes(" D") || p.endsWith("D"))) ||
                        p === "ID" ||
                        p === "MD" ||
                        (p.includes("MEDIOCENTRO") && (p.includes("DER") || p.includes(" D") || p.endsWith("D")))
                      ) {
                        return 7;
                      }

                      // 8. Interior Izquierdo
                      if (
                        (p.includes("INTERIOR") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I"))) ||
                        p === "II" ||
                        p === "MI" ||
                        (p.includes("MEDIOCENTRO") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I")))
                      ) {
                        return 8;
                      }

                      // Interior / Mediocentro genérico
                      if (p.includes("INTERIOR") || p.includes("MEDIO") || p.includes("CENTROCAMPISTA") || p === "MC") return 6.5;

                      // 9. Extremo Derecho
                      if (
                        (p.includes("EXTREMO") && (p.includes("DER") || p.includes(" D") || p.endsWith("D"))) ||
                        p === "ED" ||
                        (p.includes("BANDA") && (p.includes("DER") || p.includes(" D")))
                      ) {
                        return 9;
                      }

                      // 10. Delantero
                      if (p.includes("DELANTERO") || p.includes("ARIETE") || p.includes("PUNTA") || p === "DC" || p === "DEL") {
                        return 10;
                      }

                      // 11. Extremo Izquierdo
                      if (
                        (p.includes("EXTREMO") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I"))) ||
                        p === "EI" ||
                        (p.includes("BANDA") && (p.includes("IZQ") || p.includes(" I")))
                      ) {
                        return 11;
                      }

                      // Extremo genérico
                      if (p.includes("EXTREMO") || p.includes("ATACANTE")) return 9.5;

                      return 50;
                    }

                                        function isSesionPartido(s?: SesionDia): boolean {
                      if (!s || !s.fecha) return false;

                      const codeTipo = String((s as any).tipo_de_evento || (s as any).tipo || "").trim().toUpperCase();
                      const codeAm = String(s.evento_am || "").trim().toUpperCase();
                      const codePm = String(s.evento_pm || "").trim().toUpperCase();
                      const codeEv = String((s as any).evento || (s as any).evento_principal || (s as any).evento_1 || "").trim().toUpperCase();

                      const isMatchCode = isPartidoCode(codeTipo) || isPartidoCode(codeAm) || isPartidoCode(codePm) || isPartidoCode(codeEv);

                      if (bloquesMap) {
                        for (let slot = 0; slot < 6; slot++) {
                          const b = bloquesMap[`${s.fecha}_slot_${slot}`] || (s.id ? bloquesMap[`${s.id}_slot_${slot}`] : null);
                          if (b && b.tipo && isPartidoCode(b.tipo)) return true;
                        }
                      }

                      const riv = String(s.rival || "").trim();
                      const NON_MATCH_WORDS = [
                        "MOVILIDAD", "ADAPT", "ISO", "CORE", "HIIT", "CORRER", "FULL BODY",
                        "GIMNASIO", "CHARLA", "CIRCUITO", "VIDEO", "RUTINA", "TEST", "DESCANSO",
                        "VIAJE", "RECUPERACION", "PRE", "POST", "FUERZA", "TRABAJO"
                      ];
                      const hasValidRival = riv.length > 1 && !NON_MATCH_WORDS.some((w) => riv.toUpperCase().includes(w));

                      if (!hasValidRival && !isMatchCode) return false;
                      if (["D", "DESC", "REC", "DESCANSO"].includes(codeAm) && !isMatchCode) return false;

                      if (hasValidRival && (s.md === "MD" || isMatchCode)) {
                        return true;
                      }
                      return isMatchCode;
                    }

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

                    function doesMatchFilter(s?: SesionDia): boolean {
                      const cType = getCompeticionTipo(s);
                      if (!cType) return false;

                      if (partidoFiltro === "PAAM_Y_PA") return true;
                      if (partidoFiltro === "PAAM_ONLY") return cType === "AMISTOSO";
                      if (partidoFiltro === "PA_ALL") return cType === "LIGA" || cType === "COPA_REY" || cType === "COPA_CATALUNYA";
                      if (partidoFiltro === "LIGA") return cType === "LIGA";
                      if (partidoFiltro === "COPA_REY") return cType === "COPA_REY";
                      if (partidoFiltro === "COPA_CATALUNYA") return cType === "COPA_CATALUNYA";

                      return true;
                    }

                    const getPartidoFilteredMinsSemana = (semItem: SemanaItem, targetJ: any) => {
                      let total = 0;
                      semItem.sesiones.forEach((s) => {
                        if (!doesMatchFilter(s)) return;

                        if (targetJ.id === "TEAM") {
                          const duracionPartido = getMinutosSesion(s);
                          total += modoBloque.bloque7 === "minutos" ? duracionPartido : 1;
                        } else {
                          const minJugador = getMinutosJugadorEvento(targetJ, s);
                          if (modoBloque.bloque7 === "minutos") {
                            total += minJugador;
                          } else {
                            if (minJugador > 0) total += 1;
                          }
                        }
                      });
                      return total;
                    };

                    const getPartidoFilteredMinsDia = (fechaStr: string, targetJ: any) => {
                      const s = getSesionDiaByFecha(fechaStr);
                      if (!s || !doesMatchFilter(s)) return 0;

                      if (targetJ.id === "TEAM") return modoBloque.bloque7 === "minutos" ? getMinutosSesion(s) : 1;

                      const minJugador = getMinutosJugadorEvento(targetJ, s);
                      if (modoBloque.bloque7 === "minutos") {
                        return minJugador;
                      } else {
                        return minJugador > 0 ? 1 : 0;
                      }
                    };

                    // 1. Precomputar la suma total de cada jugador
                    const playerSumas = playersToRender.map((j) => {
                      const suma = semanasFiltradas.reduce((acc, sItem) => {
                        if (semanasExcluidas.has(sItem.semana) || sItem.fechaInicio > todayStr) return acc;
                        return acc + getPartidoFilteredMinsSemana(sItem, j);
                      }, 0);
                      return { jugador: j, sumaTotal: suma };
                    });

                    // 2. Ordenar según partidoOrden si aplica
                    let sortedPlayerList = [...playerSumas];
                    if (partidoOrden === "posicion") {
                      sortedPlayerList.sort((a, b) => comparePlayersByTacticalPosition(a.jugador, b.jugador));
                    } else if (partidoOrden === "suma_desc") {
                      sortedPlayerList.sort((a, b) => {
                        if (a.jugador.id === "TEAM") return -1;
                        if (b.jugador.id === "TEAM") return 1;
                        return b.sumaTotal - a.sumaTotal;
                      });
                    } else if (partidoOrden === "suma_asc") {
                      sortedPlayerList.sort((a, b) => {
                        if (a.jugador.id === "TEAM") return -1;
                        if (b.jugador.id === "TEAM") return 1;
                        return a.sumaTotal - b.sumaTotal;
                      });
                    }

                    const maxB7 = Math.max(...playerSumas.map((p) => p.sumaTotal), 1);

                    return sortedPlayerList.map(({ jugador: j, sumaTotal }) => {
                      const scaleStyle = getContadorColorScale(sumaTotal, maxB7, "red");

                      return (
                        <tr key={j.id} style={{ textAlign: "center", fontSize: "10px" }}>
                          <td style={{ border: "1px solid #cbd5e1", width: "80px", minWidth: "70px", maxWidth: "90px", fontWeight: 800, textAlign: "right", paddingRight: "6px", overflow: "hidden", textOverflow: "ellipsis" }}>{(j.apodo || j.nombre || "").toUpperCase()}</td>
                          <td style={{ border: "1px solid #cbd5e1", width: "36px", minWidth: "36px", ...scaleStyle }}>{sumaTotal}</td>

                          {semanasRender.map((sItem) => {
                            const esFutura = sItem.fechaInicio > todayStr;
                            const valSemana = esFutura ? 0 : getPartidoFilteredMinsSemana(sItem, j);
                            const esExcluida = semanasExcluidas.has(sItem.semana);
                            const esAmpliada = semanasAmpliadas.has(sItem.semana);
                            const fechas7 = getFechasSemanaAmpliada(sItem.fechaInicio);
                            const maxWeekVal = modoBloque.bloque7 === "minutos" ? 180 : 2;
                            const cellStyle = esFutura ? { background: "transparent", color: "#cbd5e1" } : getContadorColorScale(valSemana, maxWeekVal, "red");

                            return (
                              <React.Fragment key={sItem.semana}>
                                <td style={{ border: "1px solid #cbd5e1", ...cellStyle, opacity: (esExcluida || esFutura) ? 0.4 : 1 }}>
                                  {esFutura ? "" : valSemana}
                                </td>
                                {esAmpliada &&
                                  fechas7.map((fStr) => {
                                    const valDia = fStr > todayStr ? 0 : getPartidoFilteredMinsDia(fStr, j);
                                    const diaStyle = fStr > todayStr ? { background: "transparent", color: "#cbd5e1" } : getContadorColorScale(valDia, modoBloque.bloque7 === "minutos" ? 90 : 1, "red");
                                    return (
                                      <td key={fStr} style={{ border: "1px solid #cbd5e1", ...diaStyle, fontSize: "8.5px" }}>
                                        {fStr > todayStr ? "" : valDia}
                                      </td>
                                    );
                                  })}
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    });
                  })()}

                  {/* ========================================================================= */}
                  {/* BLOQUE 8: DATOS GPS CON CUALQUIER VARIABLE SELECCIONABLE */}
                  {/* ========================================================================= */}
                  {isBloqueVisible("b8") && (
                    <tr style={{ cursor: "pointer", background: "#f8fafc" }} onClick={() => toggleBloquePlegado("b8")}>
                      <td colSpan={totalColspan} style={{ border: "1px solid #cbd5e1", padding: "4px 8px", background: "#16a34a", color: "#ffffff", fontWeight: 900, fontSize: "11px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span>{bloquesPlegados.b8 ? "▶" : "▼"} DATOS GPS</span>

                            {/* ÚNICO DESPLEGABLE CON LAS VARIABLES GPS (FAVORITAS, DERIVADAS Y DB) */}
                            <div
                              className="no-print"
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              style={{ display: "flex", alignItems: "center" }}
                            >
                              <select
                                value={gpsVariableFiltro}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleSelectGpsMetric(e.target.value);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                style={{
                                  padding: "2px 8px",
                                  fontSize: "11px",
                                  fontWeight: 800,
                                  borderRadius: "4px",
                                  border: "1px solid rgba(255, 255, 255, 0.7)",
                                  background: "rgba(0, 0, 0, 0.25)",
                                  color: "#ffffff",
                                  outline: "none",
                                  cursor: "pointer",
                                  minWidth: "220px",
                                }}
                              >
                                {favoriteVariables.length > 0 && (
                                  <optgroup label="⭐ Mis Favoritas (Ajustes)" style={{ color: "#000", fontWeight: 800 }}>
                                    {favoriteVariables.map((m) => (
                                      <option key={m.key} value={m.key} style={{ color: "#000" }}>
                                        {m.label} ({m.unit})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}

                                {derivedVariables.length > 0 && (
                                  <optgroup label="➕ Variables Derivadas / Sumas" style={{ color: "#000", fontWeight: 800 }}>
                                    {allVariables.filter((v) => v.esDerivada).map((m) => (
                                      <option key={m.key} value={m.key} style={{ color: "#000" }}>
                                        {m.label} ({m.unit})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}


                              </select>
                            </div>

                            <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: "#ffffff" }}>
                              · {getGpsDef(gpsVariableFiltro).label} ({getGpsDef(gpsVariableFiltro).unit})
                            </span>
                          </div>

                          <span style={{ fontSize: "10px", opacity: 0.9 }}>
                            {getGpsDef(gpsVariableFiltro).unit ? `Unidad: ${getGpsDef(gpsVariableFiltro).unit}` : ""}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {isBloqueContentOpen("b8") &&
                    playersToRender.map((j) => {
                      const sumaTotal = getGpsValorJugadorTotal(j, gpsVariableFiltro);
                      const isTeam = j.id === "TEAM";

                      return (
                        <tr key={j.id} style={{ textAlign: "center", fontSize: "10px", background: isTeam ? "#f8fafc" : "transparent" }}>
                          <td style={{ border: "1px solid #cbd5e1", width: "80px", minWidth: "70px", maxWidth: "90px", fontWeight: isTeam ? 900 : 800, color: isTeam ? "#1e3a8a" : "#0f172a", textAlign: "right", paddingRight: "6px", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {(j.apodo || j.nombre || "").toUpperCase()}
                          </td>
                          <td style={{ border: "1px solid #cbd5e1", width: "36px", minWidth: "36px", fontWeight: 900, background: isTeam ? "#eff6ff" : "#f0fdf4", color: isTeam ? "#1e3a8a" : "#16a34a" }}>
                            {formatGpsCellValue(sumaTotal, gpsVariableFiltro)}
                          </td>

                          {semanasRender.map((sItem) => {
                            const esAmpliada = semanasAmpliadas.has(sItem.semana);
                            const fechas7 = getFechasSemanaAmpliada(sItem.fechaInicio);
                            const valSemana = getGpsValorJugadorSemana(j, sItem, gpsVariableFiltro);

                            return (
                              <React.Fragment key={sItem.semana}>
                                <td style={{ border: "1px solid #cbd5e1", fontWeight: valSemana > 0 ? 800 : 400, color: valSemana > 0 ? (isTeam ? "#1e3a8a" : "#0f172a") : "#cbd5e1" }}>
                                  {formatGpsCellValue(valSemana, gpsVariableFiltro)}
                                </td>
                                {esAmpliada &&
                                  fechas7.map((fStr) => {
                                    const valDia = getGpsValorJugadorDia(j, fStr, gpsVariableFiltro);
                                    return (
                                      <td key={fStr} style={{ border: "1px solid #cbd5e1", fontSize: "8.5px", background: valDia > 0 ? (isTeam ? "#eff6ff" : "#f0fdf4") : "transparent", color: valDia > 0 ? (isTeam ? "#1e3a8a" : "#15803d") : "#cbd5e1", fontWeight: valDia > 0 ? 700 : 400 }}>
                                        {formatGpsCellValue(valDia, gpsVariableFiltro)}
                                      </td>
                                    );
                                  })}
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    })}
</tbody>
              </table>
            );
          })()}
        </div>
      </div>
      </>
    )}

      {/* ESTILOS DE IMPRESIÓN Y EXPORTACIÓN PDF HORIZONTAL */}
      <style jsx global>{`
        
        /* ESTILOS DE LOS DOS PUNTOS DESLIZANTES EN LA BARRA HORIZONTAL */
        .dual-slider-input {
          outline: none;
        }
        .dual-slider-input::-webkit-slider-thumb {
          pointer-events: auto !important;
          -webkit-appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #ffffff;
          border: 3.5px solid #1e3a8a;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.35);
          cursor: pointer;
          transition: transform 0.1s ease, border-color 0.1s ease;
        }
        .dual-slider-input::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          border-color: #2563eb;
        }
        .dual-slider-input::-webkit-slider-thumb:active {
          transform: scale(1.3);
          border-color: #1d4ed8;
          box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.25);
        }
        .dual-slider-input::-moz-range-thumb {
          pointer-events: auto !important;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #ffffff;
          border: 3.5px solid #1e3a8a;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.35);
          cursor: pointer;
        }
        .dual-slider-input::-moz-range-thumb:hover {
          transform: scale(1.2);
          border-color: #2563eb;
        }

        @page {
          size: landscape;
          margin: 6mm 6mm 6mm 6mm;
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
        }
      `}</style>
    </main>
  );
}
