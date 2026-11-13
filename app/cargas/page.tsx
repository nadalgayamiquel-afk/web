"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { fetchLiveWellnessSheet, getActiveJugadores, getAllJugadoresIncludingArchived, saveGpsDatosBatch, getAllGpsDatos, getEstadoDiarioConFechas, syncAllDownloadsGpsFiles, syncGpsDatabaseWeb, getSesionesDiaRange, parseAndSaveGpsCsv } from "@/app/actions";
import { getDisponibilidadInfo } from "@/app/lib/disponibilidad";
import { useClubConfig } from "@/app/lib/useClubConfig";
import { ExternalDatabaseLinks, DEFAULT_EXTERNAL_LINKS } from "@/app/lib/externalLinks";
import CargaExternaSection from "./CargaExternaSection";
import { resolvePlanificacionMD, getLocalStoragePlanificacionDays } from "@/app/lib/planificacionMd";
import { findMatchingJugador, extractPlayerNameFromRow, extractDatesFromRow, isRowMatchingDate, normalizeDateStr } from "@/app/lib/playerMatching";

const teamsBySeason: Record<string, string[]> = {
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

const DEFAULT_EXCEL_URL = "https://docs.google.com/spreadsheets/d/1JQXKfCrGCxom-N-RM-6nbDqQ0asnL_le0Z4EOwFc5Ds/edit?gid=432486581#gid=432486581";

function calculateMedian(numbers: number[]): number {
  if (!numbers || numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(1));
  }
  return Number(sorted[middle].toFixed(1));
}

function getPlayerDayOfWeekMedians(
  playerId: string,
  targetDayOfWeek: number,
  liveRecords: any[],
  filteredJugadores: any[]
) {
  const suenoList: number[] = [];
  const calidadList: number[] = [];
  const fatigaList: number[] = [];
  const domsList: number[] = [];

  liveRecords.forEach((r) => {
    const rawName = extractPlayerNameFromRow(r);
    if (!rawName) return;

    // Exclusivo: Solo deportistas activos del equipo seleccionado
    const match = findMatchingJugador(rawName, filteredJugadores, filteredJugadores);
    if (match && match.id === playerId) {
      const dates = extractDatesFromRow(r);
      for (const dateStr of dates) {
        let rDate: Date | null = null;
        const clean = dateStr.split(" ")[0].replace(/T.*$/, "");
        const parts = clean.split(/[\/\-\.]/);
        if (parts.length === 3) {
          let p1 = parseInt(parts[0], 10);
          let p2 = parseInt(parts[1], 10);
          let p3 = parseInt(parts[2], 10);
          if (p3 < 100) p3 += 2000;
          if (p1 > 1000) {
            rDate = new Date(p1, p2 - 1, p3);
          } else if (p1 > 12) {
            rDate = new Date(p3, p2 - 1, p1);
          } else if (p2 > 12) {
            rDate = new Date(p3, p1 - 1, p2);
          } else {
            rDate = new Date(p3, p2 - 1, p1);
          }
        } else {
          rDate = new Date(clean);
        }

        if (rDate && !isNaN(rDate.getTime()) && rDate.getDay() === targetDayOfWeek) {
          const vals = extractWellnessValues(r);
          const sVal = parseFloat(vals.suenoHoras);
          const cVal = parseFloat(vals.calidadSueno);
          const fVal = parseFloat(vals.fatiga);
          const dVal = parseFloat(vals.doms);

          if (!isNaN(sVal)) suenoList.push(sVal);
          if (!isNaN(cVal)) calidadList.push(cVal);
          if (!isNaN(fVal)) fatigaList.push(fVal);
          if (!isNaN(dVal)) domsList.push(dVal);
          break;
        }
      }
    }
  });

  return {
    suenoMedian: suenoList.length > 0 ? calculateMedian(suenoList) : 7.5,
    calidadMedian: calidadList.length > 0 ? calculateMedian(calidadList) : 2,
    fatigaMedian: fatigaList.length > 0 ? calculateMedian(fatigaList) : 2,
    domsMedian: domsList.length > 0 ? calculateMedian(domsList) : 2,
    count: fatigaList.length,
  };
}

function getItemMedianBadge(valStr: string | undefined, median: number, isHigherBetter: boolean = false, suffix: string = "") {
  if (!valStr) {
    return <span style={{ color: "#94a3b8", fontSize: "11px" }}>—</span>;
  }

  const val = parseFloat(String(valStr).replace(/[^0-9.]/g, ""));
  if (isNaN(val)) return <span style={{ color: "#94a3b8", fontSize: "11px" }}>—</span>;

  let diffPeor = 0;
  if (isHigherBetter) {
    // Horas de sueño: es peor si duerme MENOS que su mediana (mediana - hoy)
    diffPeor = median - val;
  } else {
    // Fatiga, DOMS, Calidad (1-10): es peor si el valor es MAYOR que su mediana (hoy - mediana)
    diffPeor = val - median;
  }

  let color = "#16a34a"; // Verde (mejor, igual o hasta 1.0 pto peor)

  if (diffPeor > 2.5) {
    color = "#dc2626"; // Rojo (> 2.5 ptos peor)
  } else if (diffPeor > 1.0) {
    color = "#d97706"; // Amarillo (> 1.0 y <= 2.5 ptos peor)
  }

  return (
    <span style={{ color, fontWeight: 800, fontSize: "11.5px", whiteSpace: "nowrap" }}>
      {val}{suffix ? ` ${suffix}` : ""}
    </span>
  );
}

// Estilo de color según escala: 1 = Muy Bien (Verde), 10 = Muy Mal (Rojo)
function getScaleBadge(valStr: string) {
  const num = parseInt(String(valStr).replace(/[^0-9]/g, ""), 10);
  if (isNaN(num)) return <span style={{ color: "#94a3b8" }}>—</span>;

  let bg = "#dcfce7";
  let color = "#15803d";

  if (num >= 4 && num <= 6) {
    bg = "#fef9c3";
    color = "#a16207";
  } else if (num >= 7) {
    bg = "#fee2e2";
    color = "#b91c1c";
  }

  return (
    <span style={{ background: bg, color, padding: "2px 6px", borderRadius: "4px", fontWeight: 700, fontSize: "12px" }}>
      {num} / 10
    </span>
  );
}

// Calcular disponibilidad de un jugador para el campo táctico:
// "verde" = Disponible, "amarillo" = Con Cuidado, "rojo" = No Disponible / Riesgo
function getPlayerStatus(record: any) {
  if (!record) return { status: "amarillo", label: "Sin datos", bg: "#fef9c3", border: "#f59e0b", color: "#a16207" };

  const keys = Object.keys(record);
  const fatigaStr = record["Fatiga"] || record["Nivel de fatiga"] || record[keys[4]] || "2";
  const domsStr = record["Dolor Muscular"] || record["Molestias musculares"] || record[keys[5]] || "1";

  const fatiga = parseInt(String(fatigaStr).replace(/[^0-9]/g, ""), 10) || 2;
  const doms = parseInt(String(domsStr).replace(/[^0-9]/g, ""), 10) || 1;

  if (fatiga >= 7 || doms >= 7) {
    return { status: "rojo", label: "No Disponible", bg: "#fee2e2", border: "#ef4444", color: "#b91c1c" };
  } else if (fatiga >= 4 || doms >= 4) {
    return { status: "amarillo", label: "Con Cuidado", bg: "#fef3c7", border: "#f59e0b", color: "#b45309" };
  }
  return { status: "verde", label: "Disponible", bg: "#dcfce7", border: "#22c55e", color: "#15803d" };
}

// Mapeo táctico de posiciones en el campo
const pitchPositions: Record<string, { top: string; left: string }> = {
  PORTERO: { top: "86%", left: "50%" },
  LATERAL_IZQ: { top: "68%", left: "16%" },
  CENTRAL_IZQ: { top: "72%", left: "37%" },
  CENTRAL_DER: { top: "72%", left: "63%" },
  LATERAL_DER: { top: "68%", left: "84%" },
  PIVOTE: { top: "50%", left: "50%" },
  INTERIOR_IZQ: { top: "42%", left: "32%" },
  INTERIOR_DER: { top: "42%", left: "68%" },
  EXTREMO_IZQ: { top: "22%", left: "18%" },
  DELANTERO: { top: "16%", left: "50%" },
  EXTREMO_DER: { top: "22%", left: "82%" },
};

function extractWellnessValues(record: any) {
  if (!record) return { suenoHoras: "", calidadSueno: "", fatiga: "", doms: "", comentario: "" };
  const keys = Object.keys(record);

  const findVal = (terms: string[]) => {
    for (const k of keys) {
      const lower = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (terms.some((t) => lower.includes(t))) {
        const v = record[k];
        if (v !== undefined && v !== null) {
          const str = String(v).trim();
          if (str !== "" && str !== "—" && str !== "-" && str !== "null" && str !== "undefined") {
            return str;
          }
        }
      }
    }
    return "";
  };

  const suenoHoras = findVal(["horas de sueno", "horas sueno", "sueno horas", "sueno"]).replace(/[^0-9.]/g, "");
  const calidadSueno = findVal(["como has dormido", "calidad de sueno", "calidad sueno", "dormido"]).replace(/[^0-9]/g, "");
  const fatiga = findVal(["cuanto de cansado", "cansado", "fatiga", "nivel de fatiga"]).replace(/[^0-9]/g, "");
  const doms = findVal(["dolor muscular", "muscular", "molestias musculares", "doms"]).replace(/[^0-9]/g, "");

  // Extraer comentario ÚNICAMENTE de columnas explícitas de comentarios
  let rawComentario = "";
  for (const k of keys) {
    const lower = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (lower.includes("algo a comentar") || lower.includes("comentario") || lower.includes("observacion") || lower.includes("comentar")) {
      const v = record[k];
      if (v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s && s !== "—" && s !== "-" && s !== "null" && s !== "undefined") {
          rawComentario = s;
          break;
        }
      }
    }
  }

  if (!rawComentario && record["_colH"]) {
    const s = String(record["_colH"]).trim();
    if (s && s !== "—" && s !== "-" && s !== "null" && s !== "undefined") {
      rawComentario = s;
    }
  }

  return {
    suenoHoras,
    calidadSueno,
    fatiga,
    doms,
    comentario: rawComentario,
  };
}

function CargasContent() {
  const clubConfig = useClubConfig();

  useEffect(() => {
    if (clubConfig?.nombreClub) setTeam(clubConfig.nombreClub);
    if (clubConfig?.temporadaActiva) setSeasons([clubConfig.temporadaActiva as any]);
  }, [clubConfig]);

  const searchParams = useSearchParams();
  const tipoParam = searchParams.get("tipo");
  const seccionParam = searchParams.get("seccion");

  const [seasons, setSeasons] = useState<Array<keyof typeof teamsBySeason>>(["2026/27"]);
  const [team, setTeam] = useState<string>("CE Europa");

  useEffect(() => {
    try {
      const savedSeasons = localStorage.getItem("active_seasons");
      if (savedSeasons) {
        const parsed = JSON.parse(savedSeasons);
        if (Array.isArray(parsed) && parsed.length > 0) setSeasons(parsed);
      }
      const savedTeam = localStorage.getItem("active_team");
      if (savedTeam) setTeam(savedTeam);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("active_team", team);
      } catch {}
    }
  }, [team]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("active_seasons", JSON.stringify(seasons));
      } catch {}
    }
  }, [seasons]);

  useEffect(() => {
    const handleStorageSync = () => {
      const savedTeam = localStorage.getItem("active_team");
      if (savedTeam && savedTeam !== team) {
        setTeam(savedTeam);
      }
      const savedSeasons = localStorage.getItem("active_seasons");
      if (savedSeasons) {
        try {
          const parsed = JSON.parse(savedSeasons);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSeasons(parsed);
          }
        } catch {}
      }
    };
    window.addEventListener("storage", handleStorageSync);
    window.addEventListener("focus", handleStorageSync);
    return () => {
      window.removeEventListener("storage", handleStorageSync);
      window.removeEventListener("focus", handleStorageSync);
    };
  }, [team]);
  const [openGroups, setOpenGroups] = useState({ screens: true, reports: false, database: false });

  const [tab, setTab] = useState<"interna" | "externa">("interna");
  const [internaSeccion, setInternaSeccion] = useState<"wellness" | "rpe" | "fc">("wellness");
  const [wellnessSubView, setWellnessSubView] = useState<"respuestas" | "equipo">("respuestas");
  const [isDirectEditing, setIsDirectEditing] = useState<boolean>(false);
  const [manualWellness, setManualWellness] = useState<Record<string, { suenoHoras?: string; calidadSueno?: string; fatiga?: string; doms?: string; comentario?: string }>>({});

  // Mapa de disponibilidad diaria según la hoja de planificación
  const [planifDisponibilidadMap, setPlanifDisponibilidadMap] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const rawW = localStorage.getItem("cargas_manual_wellness_v3");
      if (rawW) setManualWellness(JSON.parse(rawW));
      const saved1 = localStorage.getItem("disponibilidad_map_v1");
      const saved2 = localStorage.getItem("planificacion_disponibilidad_map");
      const m1 = saved1 ? JSON.parse(saved1) : {};
      const m2 = saved2 ? JSON.parse(saved2) : {};
      if (saved1 || saved2) setPlanifDisponibilidadMap({ ...m1, ...m2 });
    } catch {}
  }, []);

  useEffect(() => {
    async function loadDisponibilidad() {
      try {
        const dbMap = await getEstadoDiarioConFechas();
        if (dbMap) {
          setPlanifDisponibilidadMap((prev) => {
            let local1: Record<string, string> = {};
            let local2: Record<string, string> = {};
            if (typeof window !== "undefined") {
              try {
                const s1 = localStorage.getItem("disponibilidad_map_v1");
                const s2 = localStorage.getItem("planificacion_disponibilidad_map");
                if (s1) local1 = JSON.parse(s1);
                if (s2) local2 = JSON.parse(s2);
              } catch {}
            }
            return { ...dbMap, ...local1, ...local2, ...prev };
          });
        }
      } catch (e) {}
    }
    loadDisponibilidad();
  }, []);

  const getPlayerDisponibilidad = (player: any, fecha: string): string => {
    if (!player) return "D";
    const jid = String(player.id || "");
    const k1 = `${jid}_${fecha}`;
    const k2 = `${jid}_day_${fecha}`;
    let code = "";
    if (planifDisponibilidadMap[k1]) code = planifDisponibilidadMap[k1].trim().toUpperCase();
    else if (planifDisponibilidadMap[k2]) code = planifDisponibilidadMap[k2].trim().toUpperCase();
    else {
      const ap = (player.apodo || "").trim().toUpperCase();
      const nom = (player.nombre || "").trim().toUpperCase();
      if (ap && planifDisponibilidadMap[`${ap}_${fecha}`]) code = planifDisponibilidadMap[`${ap}_${fecha}`].trim().toUpperCase();
      else if (nom && planifDisponibilidadMap[`${nom}_${fecha}`]) code = planifDisponibilidadMap[`${nom}_${fecha}`].trim().toUpperCase();
    }

    if (!code) code = "D";

    // Si el código es L o si es Moha, mostrar NDL en lugar de L
    const pName = `${player.nombre || undefined} ${player.apodo || undefined}`.toLowerCase();
    if (code === "L" || (pName.includes("moha") && (code === "L" || code === "ROJO"))) {
      return "NDL";
    }

    return code;
  };

  const renderDisponibilidadBadge = (player: any) => {
    const code = getPlayerDisponibilidad(player, selectedDate);
    const info = getDisponibilidadInfo(code);
    const bg = info ? info.color : "#4ade80";
    const textColor = info ? info.textColor : "#064e3b";

    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: "22px",
          height: "18px",
          padding: "0 3px",
          borderRadius: "4px",
          fontSize: "9.5px",
          fontWeight: 900,
          background: bg,
          color: textColor,
          border: "1px solid rgba(0,0,0,0.12)",
          lineHeight: 1,
          flexShrink: 0,
          letterSpacing: "-0.2px",
        }}
        title={`Disponibilidad en Planificación: ${info?.nombre || code}`}
      >
        {code}
      </span>
    );
  };
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [manualMD, setManualMD] = useState<Record<string, string>>({});
  const [planificacionDays, setPlanificacionDays] = useState<any[]>([]);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    let isMounted = true;
    const local = getLocalStoragePlanificacionDays();
    if (local && local.length > 0) {
      setPlanificacionDays(local);
    }
    getSesionesDiaRange()
      .then((data) => {
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setPlanificacionDays(data);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cargas_manual_md_v1");
      if (raw) setManualMD(JSON.parse(raw));
    } catch {}
  }, []);
  const [wellnessGeneralComment, setWellnessGeneralComment] = useState<string>("");
  const [externaSeccion, setExternaSeccion] = useState<"sesion" | "microciclo" | "mesociclo" | "temporada">("sesion");
  const [subView, setSubView] = useState<"jugador" | "comparativa" | "equipo">("equipo");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");

  // Estado de fecha actual
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });

  // Cargar comentario general de la sesión de Wellness para la fecha seleccionada
  useEffect(() => {
    if (typeof window === "undefined" || !selectedDate) return;
    try {
      const rawMap = localStorage.getItem("cargas_wellness_general_comments_v2");
      if (rawMap) {
        const mapObj = JSON.parse(rawMap);
        if (mapObj[selectedDate] !== undefined) {
          setWellnessGeneralComment(mapObj[selectedDate] || "");
          return;
        }
      }
      // Fallback desde comentarios_jugadores_v2 / planificacion_comentarios_v1 (TEAM, FIS: Comentario Fisioterapia)
      const rawCom = localStorage.getItem("comentarios_jugadores_v2");
      const rawPlanif = localStorage.getItem("planificacion_comentarios_v1");
      const allCom = [
        ...(rawCom ? JSON.parse(rawCom) : []),
        ...(rawPlanif ? JSON.parse(rawPlanif) : []),
      ];
      const teamCom = allCom.find(
        (c) =>
          c &&
          c.jugador_id === "TEAM" &&
          (c.fecha === selectedDate || c.day_id === selectedDate) &&
          c.tipo === "FIS"
      );
      setWellnessGeneralComment(teamCom?.texto || "");
    } catch (e) {
      setWellnessGeneralComment("");
    }
  }, [selectedDate]);

  // Guardar comentario general de sesión de Wellness (sincronizado a TEAM en Comentario Fisioterapia: FIS)
  const handleWellnessGeneralCommentChange = (val: string) => {
    setWellnessGeneralComment(val);
    if (typeof window === "undefined" || !selectedDate) return;
    try {
      // 1. Guardar en mapa local de comentarios generales de wellness
      const rawMap = localStorage.getItem("cargas_wellness_general_comments_v2");
      const mapObj = rawMap ? JSON.parse(rawMap) : {};
      mapObj[selectedDate] = val;
      localStorage.setItem("cargas_wellness_general_comments_v2", JSON.stringify(mapObj));

      const comVal = (val || "").trim();

      // 2. Guardar en comentarios_jugadores_v2 (TEAM, FIS: Comentario Fisioterapia)
      const rawCom = localStorage.getItem("comentarios_jugadores_v2");
      let comArr: any[] = rawCom ? JSON.parse(rawCom) : [];
      comArr = comArr.filter(
        (c) =>
          !(
            c &&
            c.jugador_id === "TEAM" &&
            (c.fecha === selectedDate || c.day_id === selectedDate) &&
            c.tipo === "FIS"
          )
      );
      if (comVal) {
        comArr.push({
          jugador_id: "TEAM",
          fecha: selectedDate,
          day_id: selectedDate,
          tipo: "FIS",
          texto: comVal,
        });
      }
      localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(comArr));

      // 3. Guardar en planificacion_comentarios_v1 (TEAM, FIS: Comentario Fisioterapia)
      const rawPlanif = localStorage.getItem("planificacion_comentarios_v1");
      let planifArr: any[] = rawPlanif ? JSON.parse(rawPlanif) : [];
      planifArr = planifArr.filter(
        (c) =>
          !(
            c &&
            c.jugador_id === "TEAM" &&
            (c.fecha === selectedDate || c.day_id === selectedDate) &&
            c.tipo === "FIS"
          )
      );
      if (comVal) {
        planifArr.push({
          jugador_id: "TEAM",
          fecha: selectedDate,
          day_id: selectedDate,
          tipo: "FIS",
          texto: comVal,
        });
      }
      localStorage.setItem("planificacion_comentarios_v1", JSON.stringify(planifArr));
    } catch (e) {
      console.error("Error al guardar comentario general de wellness:", e);
    }
  };

  // Estado de sincronización en vivo
  const [excelUrl, setExcelUrl] = useState<string>(DEFAULT_EXCEL_URL);
  const [extLinks, setExtLinks] = useState<ExternalDatabaseLinks>(DEFAULT_EXTERNAL_LINKS);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("external_database_links_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        setExtLinks(parsed);
        if (parsed.wellness?.url && parsed.wellness.url.trim()) {
          setExcelUrl(parsed.wellness.url.trim());
        }
      }
    } catch (e) {}

    const handleLinksUpdated = () => {
      try {
        const saved = localStorage.getItem("external_database_links_v1");
        if (saved) {
          const parsed = JSON.parse(saved);
          setExtLinks(parsed);
          if (parsed.wellness?.url && parsed.wellness.url.trim()) {
            setExcelUrl(parsed.wellness.url.trim());
          }
        }
      } catch (e) {}
    };

    window.addEventListener("external_links_updated", handleLinksUpdated);
    window.addEventListener("storage", handleLinksUpdated);
    return () => {
      window.removeEventListener("external_links_updated", handleLinksUpdated);
      window.removeEventListener("storage", handleLinksUpdated);
    };
  }, []);
  const [showConfigMenu, setShowConfigMenu] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<{ message: string; isError: boolean; lastUpdated?: string } | null>(null);
  const [liveRecords, setLiveRecords] = useState<any[]>([]);
  const [jugadoresDB, setJugadoresDB] = useState<any[]>([]);
  const [showPasteModal, setShowPasteModal] = useState<boolean>(false);
  const [pasteText, setPasteText] = useState<string>("");

  const handleProcessPasteText = () => {
    if (!pasteText || !pasteText.trim()) return;

    const lines = pasteText.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return;

    const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
    const headers = lines[0].split(delimiter).map((h) => h.replace(/^["']|["']$/g, "").trim());

    const parsedRecords = lines.slice(1).map((line) => {
      const cols = line.split(delimiter).map((c) => c.replace(/^["']|["']$/g, "").trim());
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = cols[i] || "";
      });
      return obj;
    });

    if (parsedRecords.length > 0) {
      setLiveRecords(parsedRecords);
      const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      setSyncStatus({
        message: `✓ ${parsedRecords.length} respuestas cargadas (${now})`,
        isError: false,
        lastUpdated: now,
      });
      setShowPasteModal(false);
      setPasteText("");
    }
  };

  const availableTeams = Array.from(new Set(seasons.flatMap((seasonOption) => teamsBySeason[seasonOption])));

  const handleSeasonToggle = (nextSeason: keyof typeof teamsBySeason) => {
    const nextSeasons = seasons.includes(nextSeason)
      ? seasons.filter((seasonOption) => seasonOption !== nextSeason)
      : seasons.length < 2
        ? [...seasons, nextSeason]
        : seasons;

    if (nextSeasons.length === 0) return;
    setSeasons(nextSeasons);
    const nextAvailableTeams = Array.from(new Set(nextSeasons.flatMap((seasonOption) => teamsBySeason[seasonOption])));
    if (!nextAvailableTeams.includes(team)) setTeam(nextAvailableTeams[0]);
  };

  const toggleGroup = (group: keyof typeof openGroups) => {
    setOpenGroups((current) => ({ ...current, [group]: !current[group] }));
  };

  // Navegación de días (Día Anterior / Día Posterior)
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setSelectedDate(`${yyyy}-${mm}-${dd}`);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setSelectedDate(`${yyyy}-${mm}-${dd}`);
  };

  // Cargar deportistas activos desde la BBDD Supabase
  useEffect(() => {
    async function loadJugadores() {
      try {
        const data = await getActiveJugadores();
        setJugadoresDB((data || []).filter((j: any) => j.activo !== false));
      } catch (e) {
        console.error("Error al cargar deportistas:", e);
      }
    }
    loadJugadores();
  }, []);

  const isPlayerOfTeam = (j: any, teamName: string) => {
    if (!j) return false;
    if (j.activo === false) return false;
    const eq = (j.equipo || "").trim().toLowerCase();
    const temp = (j.temporada || "").trim().toLowerCase();
    const tn = (teamName || "").trim().toLowerCase();
    if (tn.includes("prat") || tn.includes("25/26")) {
      return eq.includes("prat") || temp.includes("25/26") || temp.includes("2025/26");
    }
    if (tn.includes("europa") || tn.includes("26/27")) {
      return eq.includes("europa") || temp.includes("26/27") || temp.includes("2026/27");
    }
    return eq === tn;
  };

  const filteredJugadores = useMemo(() => {
    return (jugadoresDB || []).filter((j) => isPlayerOfTeam(j, team));
  }, [jugadoresDB, team]);

  useEffect(() => {
    if (tipoParam === "interna") setTab("interna");
    else if (tipoParam === "externa") setTab("externa");

    if (seccionParam === "wellness" || seccionParam === "rpe" || seccionParam === "fc") {
      setInternaSeccion(seccionParam);
    }
  }, [tipoParam, seccionParam]);

  // Estado para gestión y almacenamiento de registros GPS
  const [gpsRecords, setGpsRecords] = useState<any[]>([]);
  const [isGpsUploading, setIsGpsUploading] = useState<boolean>(false);
  const [gpsUploadStatus, setGpsUploadStatus] = useState<{ message: string; isError: boolean } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("gps_datos_map_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setGpsRecords(parsed);
          // Si había datos en localStorage, respaldar a Supabase para que nada se pierda
          saveGpsDatosBatch(parsed).catch(() => {});
        }
      }
    } catch {}
  }, []);

  // Cargar registros GPS iniciales desde la BBDD / backup
  const loadDbGpsRecords = async () => {
    try {
      const dbGps = await getAllGpsDatos();
      if (dbGps && dbGps.length > 0) {
        setGpsRecords((prev) => {
          const map = new Map();
          prev.forEach((r) => map.set(`${r.jugador_id}_${r.fecha}`, r));
          dbGps.forEach((r) => map.set(`${r.jugador_id}_${r.fecha}`, r));
          const merged = Array.from(map.values());
          try {
            localStorage.setItem("gps_datos_map_v1", JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
    } catch (e) {}
  };

  useEffect(() => {
    loadDbGpsRecords();
  }, []);

  const [isGpsSyncing, setIsGpsSyncing] = useState<boolean>(false);

  const handleUpdateGps = async () => {
    setIsGpsSyncing(true);
    setGpsUploadStatus({ message: "Sincronizando con Base de Datos GPS en vivo...", isError: false });
    try {
      // 1. Sincronizar Google Sheets BBDD GPS externa y descargas
      let extraCount = 0;
      let datesCount = 0;
      try {
        const syncRes = await syncGpsDatabaseWeb();
        if (syncRes && syncRes.success) {
          extraCount = syncRes.totalRecords || 0;
          datesCount = syncRes.datesProcessed?.length || 0;
          if (Array.isArray(syncRes.records) && syncRes.records.length > 0) {
            setGpsRecords((prev) => {
              const map = new Map();
              prev.forEach((r) => map.set(`${r.jugador_id}_${r.fecha}`, r));
              (syncRes.records || []).forEach((r: any) => map.set(`${r.jugador_id}_${r.fecha}`, r));
              const merged = Array.from(map.values());
              try {
                localStorage.setItem("gps_datos_map_v1", JSON.stringify(merged));
              } catch {}
              return merged;
            });
          }
        }
      } catch (err) {}

      // 2. Recargar todos los registros frescos de GPS desde BBDD / backup
      await loadDbGpsRecords();

      const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const extraMsg = extraCount > 0 ? ` (${extraCount} registros de ${datesCount} sesiones)` : "";
      setGpsUploadStatus({
        message: `✓ BBDD GPS enlazada y sincronizada a las ${now}${extraMsg}`,
        isError: false,
      });
    } catch (e: any) {
      setGpsUploadStatus({ message: e.message || "Error al actualizar GPS", isError: true });
    } finally {
      setIsGpsSyncing(false);
    }
  };

  const handleSyncDownloadsGps = async () => {
    setIsGpsUploading(true);
    setGpsUploadStatus({ message: "Escaneando y sincronizando archivos de GPS en Downloads...", isError: false });
    try {
      const res = await syncAllDownloadsGpsFiles();
      const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      if (res.success) {
        await loadDbGpsRecords();
        setGpsUploadStatus({
          message: `✓ Sincronizados ${res.totalRecords} registros de GPS de ${res.datesProcessed?.length} fechas (${now})`,
          isError: false,
        });
      } else {
        setGpsUploadStatus({ message: res.error || "Error al sincronizar archivos GPS", isError: true });
      }
    } catch (e: any) {
      setGpsUploadStatus({ message: e.message || "Error al sincronizar archivos GPS", isError: true });
    } finally {
      setIsGpsUploading(false);
    }
  };

  // Función para procesar y adjuntar archivo CSV de GPS a la BBDD datos_gps
  const handleGpsCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsGpsUploading(true);
    setGpsUploadStatus({ message: `Procesando "${file.name}"...`, isError: false });

    try {
      const text = await file.text();
      const res = await parseAndSaveGpsCsv(text, file.name);

      if (!res.success) {
        setGpsUploadStatus({ message: res.error || "Error al procesar el archivo CSV de GPS.", isError: true });
        setIsGpsUploading(false);
        return;
      }

      if (res.date) {
        setSelectedDate(res.date);
      }

      await loadDbGpsRecords();

      const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      setGpsUploadStatus({
        message: `✓ ${res.count} registros de GPS guardados y sincronizados para el ${res.date} (${now})`,
        isError: false,
      });
    } catch (err: any) {
      setGpsUploadStatus({ message: err.message || "Error al procesar el archivo CSV de GPS", isError: true });
    } finally {
      setIsGpsUploading(false);
    }
  };

  // Carga automática continua en segundo plano ("Lee solo" sin intervención manual)
  useEffect(() => {
    async function autoFetchLiveData() {
      try {
        if (excelUrl && excelUrl.trim()) {
          const sheetRes = await fetchLiveWellnessSheet(excelUrl);
          if (sheetRes.success && sheetRes.data && sheetRes.data.length > 0) {
            setLiveRecords(sheetRes.data);
            return;
          }
        }

        const res = await fetch("/api/wellness/webhook");
        const json = await res.json();
        if (json.success && json.data && json.data.length > 0) {
          setLiveRecords(json.data);
        }
      } catch (e) {
        // Silencioso
      }
    }
    autoFetchLiveData();
    const interval = setInterval(autoFetchLiveData, 10000);
    return () => clearInterval(interval);
  }, [excelUrl]);

  // Botón directo: 🔄 Actualizar Base de Datos Wellness
  const handleUpdateDatabase = async () => {
    setIsSyncing(true);
    setSyncStatus({ message: "Sincronizando...", isError: false });

    try {
      if (excelUrl && excelUrl.trim()) {
        const sheetRes = await fetchLiveWellnessSheet(excelUrl);
        const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

        if (sheetRes.success && sheetRes.data && sheetRes.data.length > 0) {
          setLiveRecords(sheetRes.data);
          setSyncStatus({
            message: `✓ Actualizado a las ${now}`,
            isError: false,
            lastUpdated: now,
          });
          setIsSyncing(false);
          return;
        } else if (!sheetRes.success && sheetRes.error) {
          const isPriv = sheetRes.error.includes("401") || sheetRes.error.includes("permitió");
          setSyncStatus({
            message: isPriv
              ? "⚠️ El Google Sheet configurado es privado. Ve a: Compartir > Cualquier persona con el enlace (Lector)"
              : `Error: ${sheetRes.error}`,
            isError: true,
          });
          setIsSyncing(false);
          return;
        }
      }

      const res = await fetch("/api/wellness/webhook");
      const json = await res.json();
      const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      if (json.success && json.data && json.data.length > 0) {
        setLiveRecords(json.data);
        setSyncStatus({
          message: `✓ Actualizado a las ${now}`,
          isError: false,
          lastUpdated: now,
        });
      } else {
        setSyncStatus({
          message: `✓ Al día (${now})`,
          isError: false,
          lastUpdated: now,
        });
      }
    } catch (err: any) {
      setSyncStatus({ message: "Error de sincronización", isError: true });
    } finally {
      setIsSyncing(false);
    }
  };

  // Cargar archivo Excel de Microsoft Forms (.xlsx / .csv) al instante
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSyncing(true);
    setSyncStatus({ message: `Cargando "${file.name}"...`, isError: false });

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data && data.length > 0) {
          setLiveRecords(data);
          const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
          setSyncStatus({
            message: `✓ ${data.length} respuestas cargadas (${now})`,
            isError: false,
            lastUpdated: now,
          });
        } else {
          setSyncStatus({ message: "Archivo vacío", isError: true });
        }
      } catch (err: any) {
        setSyncStatus({ message: "Error al leer Excel", isError: true });
      } finally {
        setIsSyncing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Normalizador de fecha para matchear con selectedDate (YYYY-MM-DD)
  const normalizeDateStr = (dateStr: any): string => {
    if (!dateStr) return "";
    if (typeof dateStr === "number" && dateStr > 40000) {
      const p = XLSX.SSF.parse_date_code(Math.floor(dateStr));
      return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
    }
    const strVal = String(dateStr).trim();
    if (/^\d{5}/.test(strVal)) {
      const num = parseFloat(strVal);
      if (num > 40000) {
        const p = XLSX.SSF.parse_date_code(Math.floor(num));
        return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
      }
    }
    let clean = strVal;
    if (clean.includes(" ")) clean = clean.split(" ")[0];
    if (clean.includes("T")) clean = clean.split("T")[0];

    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

    const partsSlash = clean.split(/[\/\-\.]/);
    if (partsSlash.length === 3) {
      let p1 = parseInt(partsSlash[0], 10);
      let p2 = parseInt(partsSlash[1], 10);
      let p3 = parseInt(partsSlash[2], 10);
      if (p3 < 100) p3 += 2000;
      if (p3 > 2000) {
        return `${p3}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
      }
    }

    return clean;
  };

  // Mapear respuestas del Forms/Google Sheets con jugadores de la BBDD
  const availableDatesInSheet = useMemo(() => {
    const dSet = new Set<string>();
    liveRecords.forEach((r) => {
      const dates = extractDatesFromRow(r);
      dates.forEach((dStr) => {
        const parsed = normalizeDateStr(dStr);
        if (parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
          dSet.add(parsed);
        }
      });
    });
    return Array.from(dSet).sort().reverse();
  }, [liveRecords]);

  const recordsMap = new Map();
  liveRecords.forEach((r) => {
    // Un registro coincide si alguna de sus columnas de fecha coincide con selectedDate (o si no tiene fecha)
    if (!isRowMatchingDate(r, selectedDate)) {
      return;
    }

    const rawName = extractPlayerNameFromRow(r);
    if (!rawName) return;

    // Exclusivo: Solo deportistas activos del equipo seleccionado (Europa)
    const match = findMatchingJugador(rawName, filteredJugadores, filteredJugadores);
    if (match) {
      recordsMap.set(match.id, r);
    }
  });

  // Aplicar respuestas manuales para la fecha seleccionada
  filteredJugadores.forEach((j) => {
    const mKey = `${selectedDate}_${j.id}`;
    const manual = manualWellness[mKey];
    if (manual) {
      const existing = recordsMap.get(j.id) || {};
      const keys = Object.keys(existing);

      recordsMap.set(j.id, {
        ...existing,
        "Horas de sueño": manual.suenoHoras !== undefined ? (manual.suenoHoras.includes("h") ? manual.suenoHoras : `${manual.suenoHoras} h`) : (existing["Horas de sueño"] || existing["Sueño"] || existing[keys[2]] || "7.5 h"),
        "Calidad de sueño": manual.calidadSueno !== undefined ? manual.calidadSueno : (existing["Calidad de sueño"] || existing["Calidad sueño"] || existing[keys[3]] || "2"),
        "Fatiga": manual.fatiga !== undefined ? manual.fatiga : (existing["Fatiga"] || existing["Nivel de fatiga"] || existing[keys[4]] || "2"),
        "Dolor Muscular": manual.doms !== undefined ? manual.doms : (existing["Dolor Muscular"] || existing["Molestias musculares"] || existing[keys[5]] || "1"),
        "Comentarios": manual.comentario !== undefined ? manual.comentario : (existing["Comentarios"] || existing["Comentario"] || existing["Observaciones"] || existing[keys[6]] || ""),
        isManual: true,
      });
    }
  });

  const updateManualWellness = (playerId: string, field: string, value: string) => {
    const mKey = `${selectedDate}_${playerId}`;
    setManualWellness((prev) => {
      const next = {
        ...prev,
        [mKey]: {
          ...(prev[mKey] || {}),
          [field]: value,
        },
      };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("cargas_manual_wellness_v3", JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  };

  // Cálculo de deportistas pendientes
  const pendingJugadores = filteredJugadores.filter((j) => !recordsMap.has(j.id));

  return (
    <main className="app-shell">
      {/* Sidebar Integrada */}
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
              <a className="nav-link" href="/"><span>▦</span> Índice</a>
              <a className="nav-link" href="/deportistas"><span>🏃</span> Deportistas</a>
              <a className="nav-link" href="/calendario"><span>📅</span> Planificación</a>
              <a className="nav-link" href="/disponibilidad"><span>📋</span> Disponibilidad</a>
              <a className="nav-link active" href="/cargas"><span>⚡</span> Cargas</a>

              {standaloneScreens.slice(5).map(([icon, label, href]) => (
                <a className="nav-link" href={href} key={label}><span>{icon}</span> {label}</a>
              ))}
            </div>
          )}
          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.reports} onClick={() => toggleGroup("reports")}><span>INFORMES</span><b>{openGroups.reports ? "−" : "+"}</b></button>
          {openGroups.reports && <div className="nav-group-list">{reports.map((item) => <a className="nav-link" href={item.href} key={item.name}><span>▤</span> {item.name}</a>)}</div>}
          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.database} onClick={() => toggleGroup("database")}><span>BASE DE DATOS</span><b>{openGroups.database ? "−" : "+"}</b></button>
          {openGroups.database && <div className="nav-group-list">{databaseScreens.map((label) => <a className="nav-link" href={`/base-datos/${label.toLowerCase()}`} key={label}><span>▥</span> {label}</a>)}</div>}
          <button className="nav-group-toggle" type="button" aria-expanded={(openGroups as any).settings} onClick={() => toggleGroup("settings" as any)}><span>AJUSTES</span><b>{(openGroups as any).settings ? "−" : "+"}</b></button>
          {(openGroups as any).settings && <div className="nav-group-list"><a className="nav-link" href="/ajustes"><span>⚙️</span> Configuración General</a></div>}
        </nav>
        <div className="sidebar-footer" suppressHydrationWarning><div className="sync-status"><span className="online-dot" /> Datos sincronizados <small>hace 4 min</small></div><div className="profile"><div className="avatar">MN</div><div><strong>Miquel Nadal</strong><small>Staff técnico</small></div><span>···</span></div></div>
      </aside>

      {/* Contenido Principal */}
      <section className="content" style={{ position: "relative" }}>
        <header className="topbar no-print" style={{ marginBottom: "16px" }}>
          <div>
            <span className="breadcrumb">CENTRO DE CONTROL / <strong>CONTROL DE CARGAS</strong></span>
            <h1>Control de Cargas ⚡</h1>
          </div>
        </header>

        {/* BARRA PRINCIPAL FULL-WIDTH (Carga Interna vs Carga Externa) */}
        <div className="no-print" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", background: "#e2e8f0", padding: "4px", borderRadius: "10px", border: "1px solid #cbd5e1", width: "100%", marginBottom: "12px" }}>
          <button
            type="button"
            onClick={() => setTab("interna")}
            style={{
              padding: "6px 12px",
              borderRadius: "7px",
              border: "none",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              textAlign: "center",
              background: tab === "interna" ? "#1e3a8a" : "transparent",
              color: tab === "interna" ? "#ffffff" : "#64748b",
              boxShadow: tab === "interna" ? "0 2px 6px rgba(30, 58, 138, 0.2)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            Carga Interna
          </button>

          <button
            type="button"
            onClick={() => setTab("externa")}
            style={{
              padding: "6px 12px",
              borderRadius: "7px",
              border: "none",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              textAlign: "center",
              background: tab === "externa" ? "#ea580c" : "transparent",
              color: tab === "externa" ? "#ffffff" : "#64748b",
              boxShadow: tab === "externa" ? "0 2px 6px rgba(234, 88, 12, 0.2)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            Carga Externa
          </button>
        </div>

        {/* SUB-BARRAS MÁS BAJAS, SIN NÚMEROS, SIN PARENTESIS Y SIN EMOTICONOS */}
        {tab === "interna" && (
          <>
            <div className="no-print" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "16px" }}>
              <button
                type="button"
                onClick={() => setInternaSeccion("wellness")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "center",
                  background: internaSeccion === "wellness" ? "#e0f2fe" : "#ffffff",
                  color: internaSeccion === "wellness" ? "#0369a1" : "#64748b",
                  border: internaSeccion === "wellness" ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                  transition: "all 0.15s ease",
                }}
              >
                Wellness
              </button>

              <button
                type="button"
                onClick={() => setInternaSeccion("rpe")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "center",
                  background: internaSeccion === "rpe" ? "#fef3c7" : "#ffffff",
                  color: internaSeccion === "rpe" ? "#b45309" : "#64748b",
                  border: internaSeccion === "rpe" ? "1.5px solid #f59e0b" : "1px solid #cbd5e1",
                  transition: "all 0.15s ease",
                }}
              >
                RPE
              </button>

              <button
                type="button"
                onClick={() => setInternaSeccion("fc")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "center",
                  background: internaSeccion === "fc" ? "#fee2e2" : "#ffffff",
                  color: internaSeccion === "fc" ? "#b91c1c" : "#64748b",
                  border: internaSeccion === "fc" ? "1.5px solid #ef4444" : "1px solid #cbd5e1",
                  transition: "all 0.15s ease",
                }}
              >
                Frecuencia Cardíaca
              </button>
            </div>

            {/* TABS DE SUB-VISTAS: JUGADOR | COMPARATIVA | EQUIPO */}
            <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "16px", background: "#f1f5f9", padding: "6px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
              <button
                type="button"
                onClick={() => setSubView("jugador")}
                style={{
                  flex: 1,
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  background: subView === "jugador" ? "#1e3a8a" : "transparent",
                  color: subView === "jugador" ? "#ffffff" : "#475569",
                  border: "none",
                  boxShadow: subView === "jugador" ? "0 2px 6px rgba(30, 58, 138, 0.25)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <span>👤</span> Jugador
              </button>

              <button
                type="button"
                onClick={() => setSubView("comparativa")}
                style={{
                  flex: 1,
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  background: subView === "comparativa" ? "#ea580c" : "transparent",
                  color: subView === "comparativa" ? "#ffffff" : "#475569",
                  border: "none",
                  boxShadow: subView === "comparativa" ? "0 2px 6px rgba(234, 88, 12, 0.25)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <span>📊</span> Comparativa
              </button>

              <button
                type="button"
                onClick={() => setSubView("equipo")}
                style={{
                  flex: 1,
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  background: subView === "equipo" ? "#0284c7" : "transparent",
                  color: subView === "equipo" ? "#ffffff" : "#475569",
                  border: "none",
                  boxShadow: subView === "equipo" ? "0 2px 6px rgba(2, 132, 199, 0.25)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <span>👥</span> Equipo
              </button>
            </div>
          </>
        )}

                {/* BARRA DE NAVEGACIÓN DE FECHA + 3 BOTONES EN HORIZONTAL ALINEADOS */}
        <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#ffffff", padding: "10px 16px", borderRadius: "10px", border: "1px solid #cbd5e1", marginBottom: "16px", flexWrap: "wrap", gap: "10px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 800, color: "#334155" }}>FECHA DE CONSULTA:</span>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <button
                type="button"
                onClick={handlePrevDay}
                title="Día Anterior"
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  color: "#334155",
                  fontWeight: 800,
                  fontSize: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ◀
              </button>

              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  padding: "4px 8px",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  color: "#0f172a",
                  outline: "none",
                }}
              />

              <button
                type="button"
                onClick={handleNextDay}
                title="Día Posterior"
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  color: "#334155",
                  fontWeight: 800,
                  fontSize: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ▶
              </button>
            </div>
          </div>

          {/* BOTÓN EXPORTAR A PDF (ENTRE LA FECHA Y LOS 3 BOTONES) */}
          <button
            className="no-print"
            type="button"
            onClick={() => {
              const oldTitle = document.title;
              const dateObj = new Date(selectedDate + "T12:00:00");
              const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
              const dayName = dayNames[dateObj.getDay()];
              const dd = String(dateObj.getDate()).padStart(2, "0");
              const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
              const fechaStr = `${dayName} ${dd}/${mm}`;
              document.title = `Informe Wellness ${fechaStr}`;
              window.print();
              setTimeout(() => {
                document.title = oldTitle;
              }, 1000);
            }}
            style={{
              background: "#0f172a",
              color: "#ffffff",
              border: "none",
              padding: "6px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
            }}
          >
            <span>📄</span> Exportar PDF
          </button>

          {/* BOTONES DE ACCIÓN SEGÚN SECCIÓN (CARGA INTERNA: WELLNESS | CARGA EXTERNA: GPS) */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }} className="no-print">
            {tab === "interna" ? (
              <>
                {syncStatus && (
                  <span style={{ fontSize: "11.5px", fontWeight: 700, color: syncStatus.isError ? "#dc2626" : "#16a34a", marginRight: "4px" }}>
                    {syncStatus.message}
                  </span>
                )}

                {/* BOTÓN DIRECTO BBDD WELLNESS EXTERNA */}
                {extLinks.wellness?.url ? (
                  <a
                    href={extLinks.wellness.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={extLinks.wellness.nombre || "Abrir Base de Datos Wellness"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      background: "#f0fdf4",
                      color: "#166534",
                      border: "1px solid #bbf7d0",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 800,
                      textDecoration: "none",
                    }}
                  >
                    <span>📊</span>
                    <span>BBDD Wellness ↗</span>
                  </a>
                ) : null}

                {/* BOTÓN: ACTUALIZAR WELLNESS */}
                <button
                  type="button"
                  onClick={handleUpdateDatabase}
                  disabled={isSyncing}
                  style={{
                    background: "#1e3a8a",
                    color: "#ffffff",
                    border: "none",
                    padding: "6px 14px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 800,
                    cursor: isSyncing ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    boxShadow: "0 1px 4px rgba(30,58,138,0.2)",
                  }}
                >
                  <span>🔄</span> {isSyncing ? "Actualizando..." : "Actualizar Wellness"}
                </button>

                {/* TRES PUNTOS SENCILLOS PARA CAMBIAR ENLACE SI ES NECESARIO */}
                <button
                  type="button"
                  onClick={() => setShowConfigMenu(!showConfigMenu)}
                  title="Cambiar enlace de Google Sheets"
                  style={{
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: showConfigMenu ? "#e0f2fe" : "#f8fafc",
                    color: showConfigMenu ? "#0284c7" : "#475569",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 900,
                    lineHeight: 1,
                  }}
                >
                  ···
                </button>
              </>
            ) : (
              <>
                {gpsUploadStatus && (
                  <span style={{ fontSize: "11.5px", fontWeight: 700, color: gpsUploadStatus.isError ? "#dc2626" : "#16a34a", marginRight: "4px" }}>
                    {gpsUploadStatus.message}
                  </span>
                )}

                {/* BOTÓN DIRECTO BBDD GPS EXTERNA */}
                <a
                  href={extLinks.gps?.url || DEFAULT_EXTERNAL_LINKS.gps.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={extLinks.gps?.nombre || "Abrir Base de Datos GPS en Google Sheets"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    background: "#fff7ed",
                    color: "#9a3412",
                    border: "1px solid #fed7aa",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 800,
                    textDecoration: "none",
                  }}
                >
                  <span>⚡</span>
                  <span>BBDD GPS ↗</span>
                </a>

                {/* BOTÓN: ACTUALIZAR GPS */}
                <button
                  type="button"
                  onClick={handleUpdateGps}
                  disabled={isGpsSyncing || isGpsUploading}
                  style={{
                    background: (isGpsSyncing || isGpsUploading) ? "#94a3b8" : "#ea580c",
                    color: "#ffffff",
                    border: "none",
                    padding: "6px 14px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 800,
                    cursor: (isGpsSyncing || isGpsUploading) ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    boxShadow: "0 1px 4px rgba(234,88,12,0.25)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>🔄</span> {(isGpsSyncing || isGpsUploading) ? "Actualizando GPS..." : "Actualizar GPS"}
                </button>
              </>
            )}
          </div>

          {/* DESPLEGABLE POPUP AL HACER CLIC EN TRES PUNTOS (···) */}
          {showConfigMenu && (
            <div
              style={{
                position: "absolute",
                top: "46px",
                right: "16px",
                width: "320px",
                background: "#ffffff",
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                zIndex: 100,
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a", marginBottom: "8px" }}>
                🌐 Enlace de Google Sheets / Base de Datos
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  URL de la hoja:
                </label>
                <input
                  type="url"
                  value={excelUrl}
                  onChange={(e) => {
                    setExcelUrl(e.target.value);
                    if (typeof window !== "undefined") {
                      localStorage.setItem("wellness_sheet_url_v2", e.target.value);
                    }
                  }}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  style={{ width: "100%", padding: "6px 8px", fontSize: "11.5px", borderRadius: "6px", border: "1px solid #cbd5e1", outline: "none" }}
                />
              </div>
            </div>
          )}
        </div>

        {/* CONTENIDOS CARGA INTERNA */}
        {tab === "interna" && (
          <section>
            {/* ESPACIO 1: WELLNESS */}
            {internaSeccion === "wellness" && (() => {
              const dateObj = new Date(selectedDate + "T12:00:00");
              const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
              const dayName = dayNames[dateObj.getDay()];
              const dd = String(dateObj.getDate()).padStart(2, "0");
              const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
              const autoDay = `${dayName} ${dd}/${mm}`;
              const planMD = mounted ? resolvePlanificacionMD(selectedDate, planificacionDays) : "MD";
              const autoMD = (mounted && manualMD[selectedDate] !== undefined)
                ? manualMD[selectedDate] 
                : (planMD || "MD");

              return (
                <div>
                  <div style={{ background: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid #e2e6e3", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                    
                    {/* ESTILOS DE IMPRESIÓN / EXPORTACIÓN */}
                    <style>{`
                      @media print {
                        .cargas-report-header {
                          display: grid !important;
                          grid-template-columns: 80px 1fr auto !important;
                          align-items: flex-start !important;
                          margin-bottom: 8px !important;
                          padding-bottom: 6px !important;
                        }
                        .cargas-header-metadata {
                          align-self: flex-start !important;
                          margin-top: -6px !important;
                          text-align: right !important;
                        }
                        .cargas-header-title {
                          font-size: 14px !important;
                          text-align: center !important;
                        }
                      }
                    `}</style>

                    {/* CABECERA ESTÁNDAR DEL INFORME: ESCUDO Y CLUB A LA IZQ, TÍTULO ENMEDIO, DÍA Y MD A LA DERECHA BIEN ARRIBA */}
                    <div className="cargas-report-header" style={{ display: "grid", gridTemplateColumns: "85px 1fr auto", alignItems: "flex-start", marginBottom: "12px", borderBottom: "2px solid #0f172a", paddingBottom: "10px", gap: "10px" }}>
                      {/* Arriba a la izquierda: Escudo y nombre del club */}
                      <div style={{ justifySelf: "start", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", minWidth: "75px" }}>
                        <img
                          src="/ce-europa.png"
                          alt="CE Europa"
                          style={{ width: "46px", height: "54px", objectFit: "contain", background: "#ffffff", borderRadius: "6px", padding: "2px" }}
                        />
                        <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap" }}>
                          {team}
                        </span>
                      </div>

                      {/* Centro: Título */}
                      <div style={{ justifySelf: "center", alignSelf: "center", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 8px" }}>
                        <h2 className="cargas-header-title" style={{ fontSize: "17px", fontWeight: 900, color: "#0f172a", margin: 0, textTransform: "uppercase", letterSpacing: "-0.01em", lineHeight: 1.2 }}>
                          INFORME WELLNESS · {autoDay.toUpperCase()}
                        </h2>
                      </div>

                      {/* Arriba a la derecha: Día y MD pegados arriba al margen derecho */}
                      <div className="cargas-header-metadata" style={{ justifySelf: "end", alignSelf: "flex-start", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", marginTop: "0px" }}>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.2px" }}>Día:</span>
                            <span suppressHydrationWarning className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: "#0f172a" }}>
                              {autoDay}
                            </span>
                            <input
                              type="text"
                              defaultValue={autoDay}
                              key={autoDay}
                              className="clean-header-input no-print"
                              style={{ fontSize: "11.5px", fontWeight: 800, padding: "2px 4px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", outline: "none", width: "95px", textAlign: "center" }}
                            />
                          </div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.2px" }}>MD:</span>
                            <span
                              suppressHydrationWarning
                              className="print-only"
                              style={{ fontSize: "11px", fontWeight: 800, color: autoMD === "MD" ? "#dc2626" : "#0f172a" }}
                            >
                              {autoMD}
                            </span>
                            <input
                              suppressHydrationWarning
                              type="text"
                              value={autoMD}
                              onChange={(e) => {
                                const val = e.target.value;
                                setManualMD((prev) => {
                                  const next = { ...prev, [selectedDate]: val };
                                  if (typeof window !== "undefined") {
                                    try {
                                      localStorage.setItem("cargas_manual_md_v1", JSON.stringify(next));
                                    } catch {}
                                  }
                                  return next;
                                });
                              }}
                              className="clean-header-input no-print"
                              style={{ fontSize: "11.5px", fontWeight: 800, padding: "2px 4px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", color: autoMD === "MD" ? "#dc2626" : "#0f172a", outline: "none", width: "52px", textAlign: "center" }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ESPACIO PEQUEÑO PARA ESCRIBIR UN COMENTARIO ENTRE LA CABECERA Y LAS RESPUESTAS */}
                    <div style={{ marginBottom: "12px" }}>
                      <textarea
                        value={wellnessGeneralComment}
                        onChange={(e) => handleWellnessGeneralCommentChange(e.target.value)}
                        placeholder="Escribe aquí una valoración o comentario general de la sesión…"
                        rows={2}
                        style={{
                          width: "100%",
                          fontSize: "12.5px",
                          padding: "4px 0",
                          border: "none",
                          background: "transparent",
                          color: "#0f172a",
                          resize: "vertical",
                          outline: "none",
                          fontFamily: "inherit",
                          lineHeight: 1.5,
                          boxSizing: "border-box",
                        }}
                      />
                    </div>

                    {/* Selector de sub-vista Wellness */}
                    <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                      <h3 style={{ fontSize: "14.5px", fontWeight: 800, color: "var(--navy)", margin: 0 }}>
                        {wellnessSubView === "respuestas" ? "Respuestas Cuestionario Wellness" : "Visión Equipo — Comparativa vs Mediana del día"}
                      </h3>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={handleUpdateDatabase}
                          disabled={isSyncing}
                          style={{
                            padding: "5px 12px",
                            borderRadius: "6px",
                            border: "1px solid #0284c7",
                            background: isSyncing ? "#e0f2fe" : "#f0f9ff",
                            color: "#0369a1",
                            fontSize: "12px",
                            fontWeight: 800,
                            cursor: isSyncing ? "wait" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            transition: "all 0.15s ease",
                          }}
                          title="Actualizar datos y comentarios de Wellness desde Google Sheets y Webhook"
                        >
                          <span style={{ display: "inline-block", transform: isSyncing ? "rotate(180deg)" : "none", transition: "transform 0.5s ease" }}>
                            🔄
                          </span>
                          <span>{isSyncing ? "Actualizando..." : "Actualizar Wellness"}</span>
                        </button>

                        <div style={{ display: "flex", background: "#f1f5f9", padding: "3px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                          <button
                            type="button"
                            onClick={() => setWellnessSubView("respuestas")}
                            style={{
                              padding: "5px 12px",
                              borderRadius: "6px",
                              border: "none",
                              fontSize: "12px",
                              fontWeight: 800,
                              cursor: "pointer",
                              background: wellnessSubView === "respuestas" ? "#1e3a8a" : "transparent",
                              color: wellnessSubView === "respuestas" ? "#ffffff" : "#475569",
                              transition: "all 0.15s ease",
                            }}
                          >
                            📋 Respuestas Hoy
                          </button>
                          <button
                            type="button"
                            onClick={() => setWellnessSubView("equipo")}
                            style={{
                              padding: "5px 12px",
                              borderRadius: "6px",
                              border: "none",
                              fontSize: "12px",
                              fontWeight: 800,
                              cursor: "pointer",
                              background: wellnessSubView === "equipo" ? "#15803d" : "transparent",
                              color: wellnessSubView === "equipo" ? "#ffffff" : "#475569",
                              transition: "all 0.15s ease",
                            }}
                          >
                            📊 Visión Equipo (vs Mediana)
                          </button>
                        </div>
                      </div>
                  </div>

                  {/* VISTA 1: TABLA DE RESPUESTAS DIRECTAMENTE EDITABLES */}
                  <div className="no-print">
                    {liveRecords.length > 0 && recordsMap.size === 0 && (
                      <div style={{ margin: "10px 0 14px", padding: "10px 14px", background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: "8px", fontSize: "11.5px", color: "#92400e" }}>
                        <div style={{ fontWeight: 800, marginBottom: "4px" }}>
                          ℹ️ Hay {liveRecords.length} respuestas cargadas en el archivo, pero ninguna coincide con la fecha ({selectedDate}) y equipo ({team}).
                        </div>
                        {availableDatesInSheet.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginTop: "6px" }}>
                            <span style={{ fontWeight: 700 }}>Ir a una fecha con respuestas:</span>
                            {availableDatesInSheet.slice(0, 10).map((d) => (
                              <button
                                key={d}
                                onClick={() => setSelectedDate(d)}
                                style={{
                                  background: "#ffffff",
                                  border: "1px solid #d97706",
                                  color: "#b45309",
                                  borderRadius: "4px",
                                  padding: "2px 8px",
                                  fontSize: "11px",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                📅 {d}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {wellnessSubView === "respuestas" && (() => {
                    const pendingPlayers = filteredJugadores.filter((j) => {
                      const rec = recordsMap.get(j.id);
                      const m = manualWellness[`${selectedDate}_${j.id}`];
                      const mHasVal = Boolean(m?.suenoHoras || m?.calidadSueno || m?.fatiga || m?.doms || m?.comentario);
                      return !rec && !mHasVal;
                    });

                    return (
                      <div>
                        <table style={{ width: "100%", borderCollapse: "collapse", color: "#0f172a", fontSize: "11px" }}>
                          <thead>
                            <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                              <th style={{ padding: "4px 6px", width: "135px", textAlign: "left", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" }}>Deportista</th>
                              <th style={{ padding: "4px 4px", width: "75px", textAlign: "center", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" }}>Horas Sueño</th>
                              <th style={{ padding: "4px 4px", width: "70px", textAlign: "center", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" }}>Calidad</th>
                              <th style={{ padding: "4px 4px", width: "70px", textAlign: "center", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" }}>Fatiga</th>
                              <th style={{ padding: "4px 4px", width: "75px", textAlign: "center", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" }}>Dolor Musc.</th>
                              <th style={{ padding: "4px 6px", textAlign: "left", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" }}>Comentarios</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredJugadores.map((j, idx) => {
                              const record = recordsMap.get(j.id);
                              const mKey = `${selectedDate}_${j.id}`;
                              const manual = manualWellness[mKey];

                              const extracted = record ? extractWellnessValues(record) : null;
                              let suenoHoras = manual?.suenoHoras !== undefined ? manual.suenoHoras : (extracted?.suenoHoras ?? "");
                              let calidadSueno = manual?.calidadSueno !== undefined ? manual.calidadSueno : (extracted?.calidadSueno ?? "");
                              let fatiga = manual?.fatiga !== undefined ? manual.fatiga : (extracted?.fatiga ?? "");
                              let doms = manual?.doms !== undefined ? manual.doms : (extracted?.doms ?? "");
                              let comentario = manual?.comentario !== undefined ? manual.comentario : (extracted?.comentario ?? "");

                              const hasData = Boolean(record || manual?.suenoHoras || manual?.calidadSueno || manual?.fatiga || manual?.doms || manual?.comentario);

                              const renderSelectBadge = (valStr: string | undefined, fieldKey: string) => {
                                return (
                                  <>
                                    <span className="print-only" style={{ fontWeight: 700, fontSize: "11px", color: "#0f172a" }}>
                                      {valStr || "—"}
                                    </span>
                                    <select
                                      className="no-print"
                                      value={valStr ?? ""}
                                      onChange={(e) => updateManualWellness(j.id, fieldKey, e.target.value)}
                                      style={{
                                        background: "#ffffff",
                                        color: "#0f172a",
                                        border: "1px solid #cbd5e1",
                                        borderRadius: "4px",
                                        padding: "1px 4px",
                                        fontSize: "11px",
                                        fontWeight: 700,
                                        outline: "none",
                                        cursor: "pointer",
                                      }}
                                    >
                                      <option value="">—</option>
                                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                                        <option key={n} value={String(n)}>
                                          {n}
                                        </option>
                                      ))}
                                    </select>
                                  </>
                                );
                              };

                              return (
                                <tr key={j.id || idx} className={hasData ? "" : "wellness-pending-row"} style={{ borderBottom: "1px solid #f1f5f9", background: hasData ? "#ffffff" : "#fafafa" }}>
                                  {/* Deportista */}
                                  <td style={{ padding: "4px 6px", fontWeight: 700, textAlign: "left", fontSize: "11px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                      {renderDisponibilidadBadge(j)}
                                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: hasData ? "#16a34a" : "#d97706" }} />
                                      <span>{(j.apodo || j.nombre || "").toUpperCase()}</span>
                                    </div>
                                  </td>

                                  {/* Horas Sueño */}
                                  <td style={{ padding: "4px 4px", textAlign: "center" }}>
                                    <span className="print-only" style={{ fontWeight: 700, fontSize: "11px", color: "#0f172a" }}>
                                      {suenoHoras ? `${suenoHoras} h` : "—"}
                                    </span>
                                    <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3px" }}>
                                      <input
                                        type="number"
                                        step="0.5"
                                        min="0"
                                        max="24"
                                        value={suenoHoras ?? ""}
                                        placeholder="—"
                                        onChange={(e) => updateManualWellness(j.id, "suenoHoras", e.target.value)}
                                        style={{
                                          width: "44px",
                                          padding: "1px 4px",
                                          fontSize: "11px",
                                          fontWeight: 700,
                                          borderRadius: "4px",
                                          border: "1px solid #cbd5e1",
                                          background: "#ffffff",
                                          outline: "none",
                                          color: "#0f172a",
                                          textAlign: "center",
                                        }}
                                      />
                                      <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>h</span>
                                    </div>
                                  </td>

                                  {/* Calidad (1-10) */}
                                  <td style={{ padding: "4px 4px", textAlign: "center" }}>
                                    {renderSelectBadge(calidadSueno, "calidadSueno")}
                                  </td>

                                  {/* Fatiga (1-10) */}
                                  <td style={{ padding: "4px 4px", textAlign: "center" }}>
                                    {renderSelectBadge(fatiga, "fatiga")}
                                  </td>

                                  {/* Dolor Muscular (1-10) */}
                                  <td style={{ padding: "4px 4px", textAlign: "center" }}>
                                    {renderSelectBadge(doms, "doms")}
                                  </td>

                                  {/* Comentarios: Más espacio horizontal, fuente 10px, interlineado 1.15 */}
                                  <td style={{ padding: "4px 6px", textAlign: "left" }}>
                                    <span className="print-only" style={{ fontSize: "10px", lineHeight: 1.15, color: "#1e293b", display: "block" }}>
                                      {comentario || "—"}
                                    </span>
                                    <input
                                      className="no-print"
                                      type="text"
                                      value={comentario ?? ""}
                                      placeholder="Escribir comentario…"
                                      onChange={(e) => updateManualWellness(j.id, "comentario", e.target.value)}
                                      style={{
                                        width: "100%",
                                        padding: "2px 6px",
                                        fontSize: "10px",
                                        lineHeight: 1.15,
                                        borderRadius: "4px",
                                        border: "1px solid #cbd5e1",
                                        background: "transparent",
                                        outline: "none",
                                        color: "#1e293b",
                                      }}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {/* VENTANITA ABAJO CON NOMBRES DE JUGADORES PENDIENTES */}
                        {pendingPlayers.length > 0 && (
                          <div style={{ marginTop: "12px", padding: "8px 12px", borderRadius: "8px", background: "#f8fafc", border: "1px solid #cbd5e1", fontSize: "11px" }}>
                            <span style={{ fontWeight: 800, color: "#64748b", textTransform: "uppercase", fontSize: "10px", letterSpacing: "0.03em" }}>
                              ⏳ Pendientes de información ({pendingPlayers.length}):
                            </span>
                            <div style={{ marginTop: "4px", fontSize: "11px", color: "#334155", fontWeight: 700 }}>
                              {(pendingPlayers || []).map(p => (p.apodo || p.nombre || "").toUpperCase()).join(" • ")}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* VISTA 2: VISIÓN EQUIPO (VS MEDIANA DE ESE DÍA DE LA SEMANA) */}
                  {wellnessSubView === "equipo" && (() => {
                    const selDateObj = new Date(selectedDate + "T12:00:00");
                    const targetDayOfWeek = selDateObj.getDay();
                    const dayNamesEs = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
                    const dayName = dayNamesEs[targetDayOfWeek];

                    const pendingPlayersEquipo = filteredJugadores.filter((j) => !recordsMap.get(j.id));

                    return (
                      <div>
                        <div style={{ marginBottom: "12px", background: "#f8fafc", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "11.5px", color: "#475569", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span>ℹ️</span>
                          <span>
                            Comparando respuestas de hoy con la <strong>mediana histórica individual de cada jugador en {dayName}s</strong>.
                            Leyenda: <strong style={{ color: "#16a34a" }}>🟢 Verde</strong> (mejor, igual o hasta 1 pto peor), <strong style={{ color: "#b45309" }}>🟡 Amarillo</strong> (más de 1 pto peor) y <strong style={{ color: "#b91c1c" }}>🔴 Rojo</strong> (más de 2,5 ptos peor que su mediana).
                          </span>
                        </div>

                        <table style={{ width: "100%", borderCollapse: "collapse", color: "#0f172a", fontSize: "11px" }}>
                          <thead>
                            <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                              <th style={{ padding: "4px 6px", width: "140px", textAlign: "left", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" }}>Deportista</th>
                              <th style={{ padding: "4px 2px", width: "65px", textAlign: "center", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" }}>Horas Sueño</th>
                              <th style={{ padding: "4px 2px", width: "65px", textAlign: "center", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" }}>Cal. Sueño</th>
                              <th style={{ padding: "4px 2px", width: "55px", textAlign: "center", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" }}>Fatiga</th>
                              <th style={{ padding: "4px 2px", width: "70px", textAlign: "center", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" }}>Dolor Musc.</th>
                              <th style={{ padding: "4px 8px", textAlign: "left", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" }}>Comentarios</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredJugadores.map((j, idx) => {
                              const record = recordsMap.get(j.id);
                              const medians = getPlayerDayOfWeekMedians(j.id, targetDayOfWeek, liveRecords, filteredJugadores);
                              const mKey = `${selectedDate}_${j.id}`;
                              const manual = manualWellness[mKey];

                              let suenoHorasStr: string | undefined = undefined;
                              let calidadStr: string | undefined = undefined;
                              let fatigaStr: string | undefined = undefined;
                              let domsStr: string | undefined = undefined;

                              const extracted = record ? extractWellnessValues(record) : null;
                              let comentario = manual?.comentario !== undefined ? manual.comentario : (extracted?.comentario ?? "");

                              const hasData = Boolean(record || manual?.suenoHoras || manual?.calidadSueno || manual?.fatiga || manual?.doms || manual?.comentario);
                              if (hasData) {
                                suenoHorasStr = manual?.suenoHoras !== undefined ? (manual.suenoHoras.includes("h") ? manual.suenoHoras : `${manual.suenoHoras} h`) : (extracted?.suenoHoras ? `${extracted.suenoHoras} h` : undefined);
                                calidadStr = manual?.calidadSueno !== undefined ? manual.calidadSueno : (extracted?.calidadSueno || undefined);
                                fatigaStr = manual?.fatiga !== undefined ? manual.fatiga : (extracted?.fatiga || undefined);
                                domsStr = manual?.doms !== undefined ? manual.doms : (extracted?.doms || undefined);
                              }

                              return (
                                <tr key={j.id || idx} className={hasData ? "" : "wellness-pending-row"} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                  <td style={{ padding: "4px 6px", fontWeight: 700, textAlign: "left", fontSize: "11px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                      {renderDisponibilidadBadge(j)}
                                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: record ? "#16a34a" : "#d97706" }} />
                                      <span>{(j.apodo || j.nombre || "").toUpperCase()}</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: "4px 2px", textAlign: "center" }}>
                                    {getItemMedianBadge(suenoHorasStr, medians.suenoMedian, true, "h")}
                                  </td>
                                  <td style={{ padding: "4px 2px", textAlign: "center" }}>
                                    {getItemMedianBadge(calidadStr, medians.calidadMedian, false, "")}
                                  </td>
                                  <td style={{ padding: "4px 2px", textAlign: "center" }}>
                                    {getItemMedianBadge(fatigaStr, medians.fatigaMedian, false, "")}
                                  </td>
                                  <td style={{ padding: "4px 2px", textAlign: "center" }}>
                                    {getItemMedianBadge(domsStr, medians.domsMedian, false, "")}
                                  </td>
                                  {/* Comentarios a la derecha de Dolor Muscular */}
                                  <td style={{ padding: "3px 8px", textAlign: "left" }}>
                                    <span className="print-only" style={{ fontSize: "10.5px", lineHeight: 1.2, color: "#1e293b", display: "block" }}>
                                      {comentario || "—"}
                                    </span>
                                    <input
                                      className="no-print"
                                      type="text"
                                      value={comentario ?? ""}
                                      placeholder="Escribir o añadir comentario…"
                                      onChange={(e) => updateManualWellness(j.id, "comentario", e.target.value)}
                                      style={{
                                        width: "100%",
                                        padding: "3px 8px",
                                        fontSize: "11px",
                                        borderRadius: "4px",
                                        border: "1px solid #cbd5e1",
                                        background: "#ffffff",
                                        outline: "none",
                                        color: "#1e293b",
                                      }}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {/* VENTANITA ABAJO CON NOMBRES DE JUGADORES PENDIENTES */}
                        {pendingPlayersEquipo.length > 0 && (
                          <div style={{ marginTop: "12px", padding: "8px 12px", borderRadius: "8px", background: "#f8fafc", border: "1px solid #cbd5e1", fontSize: "11px" }}>
                            <span style={{ fontWeight: 800, color: "#64748b", textTransform: "uppercase", fontSize: "10px", letterSpacing: "0.03em" }}>
                              ⏳ Pendientes de información ({pendingPlayersEquipo.length}):
                            </span>
                            <div style={{ marginTop: "4px", fontSize: "11px", color: "#334155", fontWeight: 700 }}>
                              {(pendingPlayersEquipo || []).map(p => (p.apodo || p.nombre || "").toUpperCase()).join(" • ")}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })()}

            {/* ESPACIO 2: RPE */}
            {internaSeccion === "rpe" && (
              <div>
                <div style={{ background: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid #e2e6e3", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                  <h3 style={{ marginBottom: "10px", fontSize: "14.5px", fontWeight: 800, color: "var(--navy)" }}>Registro de sRPE por Jugador</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", color: "#0f172a", fontSize: "12.5px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#475569" }}>
                        <th style={{ padding: "6px 8px" }}>Jugador</th>
                        <th style={{ padding: "6px 8px" }}>RPE Individual</th>
                        <th style={{ padding: "6px 8px" }}>Duración</th>
                        <th style={{ padding: "6px 8px" }}>sRPE Carga</th>
                        <th style={{ padding: "6px 8px" }}>Desviación vs Media</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 8px", fontWeight: 700 }}>ALEIX DÍAZ</td>
                        <td style={{ padding: "6px 8px" }}>8.0 / 10</td>
                        <td style={{ padding: "6px 8px" }}>90 min</td>
                        <td style={{ padding: "6px 8px" }}>720 AU</td>
                        <td style={{ padding: "6px 8px", color: "#d97706", fontWeight: 700 }}>+8% alto</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 8px", fontWeight: 700 }}>ALEJANDRO PEREIRA</td>
                        <td style={{ padding: "6px 8px" }}>7.5 / 10</td>
                        <td style={{ padding: "6px 8px" }}>90 min</td>
                        <td style={{ padding: "6px 8px" }}>675 AU</td>
                        <td style={{ padding: "6px 8px", color: "#16a34a", fontWeight: 700 }}>En media</td>
                      </tr>
                      <tr>
                        <td style={{ padding: "6px 8px", fontWeight: 700 }}>ALEX IGLESIAS</td>
                        <td style={{ padding: "6px 8px" }}>9.0 / 10</td>
                        <td style={{ padding: "6px 8px" }}>90 min</td>
                        <td style={{ padding: "6px 8px" }}>810 AU</td>
                        <td style={{ padding: "6px 8px", color: "#dc2626", fontWeight: 700 }}>+21% muy alto</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ESPACIO 3: FRECUENCIA CARDÍACA */}
            {internaSeccion === "fc" && (
              <div>
                <div style={{ background: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid #e2e6e3", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                  <h3 style={{ marginBottom: "10px", fontSize: "14.5px", fontWeight: 800, color: "var(--navy)" }}>Tiempo en Zonas de Frecuencia Cardíaca</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", marginBottom: "4px", color: "#0f172a" }}>
                        <span>Zona 5 (&gt;90%): 172-186 ppm</span>
                        <strong>14 min (15%)</strong>
                      </div>
                      <div style={{ height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ width: "15%", height: "100%", background: "#ef4444" }}></div>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", marginBottom: "4px", color: "#0f172a" }}>
                        <span>Zona 4 (80-90%): 153-171 ppm</span>
                        <strong>38 min (42%)</strong>
                      </div>
                      <div style={{ height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ width: "42%", height: "100%", background: "#f97316" }}></div>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", marginBottom: "4px", color: "#0f172a" }}>
                        <span>Zona 3 (70-80%): 134-152 ppm</span>
                        <strong>26 min (29%)</strong>
                      </div>
                      <div style={{ height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ width: "29%", height: "100%", background: "#eab308" }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* CONTENIDOS CARGA EXTERNA (REPLANTEADA ORDENADA Y PRECISA) */}
        {tab === "externa" && (
          <CargaExternaSection
            planificacionDays={planificacionDays}
            gpsRecords={gpsRecords}
            jugadores={filteredJugadores}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            isGpsUploading={isGpsUploading}
            handleGpsCsvUpload={handleGpsCsvUpload}
            handleSyncDownloadsGps={handleSyncDownloadsGps}
            gpsUploadStatus={gpsUploadStatus}
            handleUpdateGps={handleUpdateGps}
            loadDbGpsRecords={loadDbGpsRecords}
            renderDisponibilidadBadge={renderDisponibilidadBadge}
          />
        )}
      </section>
    </main>
  );
}

export default function CargasPageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: "32px", textAlign: "center" }}>Cargando página de Cargas...</div>}>
      <CargasContent />
    </Suspense>
  );
}
