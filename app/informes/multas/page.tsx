"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { getActiveJugadores, fetchLiveWellnessSheet, getSesionesDiaRange, getEventosBloquesBBDD } from "@/app/actions";
import REAL_MULTAS_DATA from "./real-multas-data.json";
import { saveMultasToDatabase, loadMultasFromDatabase, cleanupObsoleteLocalStorage, StoredMulta } from "./multas-storage";
import { useClubConfig } from "@/app/lib/useClubConfig";
import { findMatchingJugador as findMatchingJugadorLib, extractPlayerNameFromRow, isRowMatchingDate, scorePlayerMatch } from "@/app/lib/playerMatching";

export interface Multa {
  id: string;
  fecha: string;
  jugador_id: string;
  jugador_nombre: string;
  jugador_apodo?: string;
  jugador_dorsal?: number | string;
  jugador_foto?: string;
  equipo?: string;
  categoria: "Preparación Física" | "Vestuario" | "Médico / Fisioterapia" | "Nutrición" | "Técnico / Táctico" | "Otros";
  concepto: string;
  importe: number;
  reincidencia?: "1ª Falta" | "2ª Falta" | "Reincidente";
  comentario?: string;
  creado_por?: string;
}

export interface TipoMultaConfig {
  id: string;
  titulo: string;
  descripcion: string;
  importe: number;
  categoria: Multa["categoria"];
  icon: string;
}

interface JugadorSimple {
  id: string;
  nombre: string;
  apodo?: string | null;
  dorsal?: number | string | null;
  posicion?: string | null;
  foto_url?: string | null;
  activo?: boolean;
  equipo?: string | null;
  temporada?: string | null;
}

// 23 Jugadores activos de CE Europa (Temporada 2026/27)
const INITIAL_MANRESA_JUGADORES: JugadorSimple[] = [
  { id: "e218da66-f670-4e19-8812-a5d9ba301de2", nombre: "BILAL ACHHIBA", equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "860fc2f5-166b-4ae3-b64e-d0f51cf27033", nombre: "DAOUDA KONE", equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "45d23990-6071-4c56-b997-1f5a4efbda72", nombre: "RICHARD MARTINEZ", equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "4f25efc4-8b6c-4dd8-8799-a805aaa8b66d", nombre: "ALEIX DÍAZ", dorsal: 7, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "c10999d2-2293-4191-bdeb-2ea4c72aa63a", nombre: "ALEX IGLESIAS", dorsal: 21, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "029a3c4d-e44a-4ef1-9d95-5715033dec42", nombre: "ÁNGEL VERA", dorsal: 23, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "7bd5dc45-ca0d-4dce-9f59-8c7a3837fbcc", nombre: "CARLOS PORTERO", dorsal: 9, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "4d3ad31c-f7cd-4de8-a199-af723618bff4", nombre: "DANI FERRER", dorsal: 11, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "aec4e6e1-5a47-4b55-b23a-715eaac292a2", nombre: "DAVID MOMOH", dorsal: 17, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "82d3987f-9ebb-4164-8fe5-b7e68a08e18b", nombre: "IVAN TÉBAR", dorsal: 22, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "b6877a25-e6de-48f3-aab3-1ae48a53e317", nombre: "POCHITO", dorsal: 4, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "ba0f3680-2107-4718-b117-90879fb52f4b", nombre: "NICOLAS OLMEDO", dorsal: 19, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "44a17d58-563b-41a5-811f-58ee1365866d", nombre: "OUSSAMA BOUKIR", dorsal: 25, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "44980484-06d0-4eba-9896-417d29438e91", nombre: "QUIM BORRÀS", dorsal: 16, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "d0444862-4bb1-4d9e-81d6-2eae200a036c", nombre: "ROGER MUNELLS", dorsal: 12, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "08dee8b5-d0e0-4358-86e7-5124ece580ca", nombre: "BADR EL AMERANI", dorsal: 24, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "33182eb2-bed8-4320-9bd5-9c1fbf63c260", nombre: "MATHEUS TEIXEIRA", dorsal: 18, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "10e6eb1c-6377-47c6-93dd-2bd583a4661b", nombre: "SANTI GUZMAN", dorsal: 10, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "b77c80d6-486a-4276-a20a-f33985249e8f", nombre: "ERIC MONTES", dorsal: 6, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "32a88998-f40c-43c9-900d-d1aecf3244b5", nombre: "MARC CASTRO", dorsal: 8, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "71ba8914-0d2d-47fe-a078-5aba08bf8a26", nombre: "MOHA EZZARFANI", dorsal: 20, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "8a894b48-7fde-406b-9cdd-8dc7536b1648", nombre: "OSCAR GÓMEZ", dorsal: 1, equipo: "CE Europa", temporada: "2026/27", activo: true },
  { id: "94dc8b4e-3db5-49b5-981a-5222e0a136a2", nombre: "OSCAR PULIDO", dorsal: 13, equipo: "CE Europa", temporada: "2026/27", activo: true },
];

// Configuración de navegación estándar
const teamsBySeason = {
  "2026/27": ["CE Europa"],
  "2025/26": ["AE Prat"],
};

const standaloneScreens = [
  ["▦", "Índice", "/indice"],
  ["🏃", "Deportistas", "/deportistas"],
  ["📅", "Planificación", "/calendario"],
  ["📋", "Disponibilidad", "/disponibilidad"],
  ["⚡", "Cargas", "/cargas"],
  ["🗓️", "Calendario", "/eventos"],
  ["⚽", "Campo", "/campo"],
  ["🏋️", "Gimnasio", "/gimnasio"],
  ["🏆", "Partidos", "/partidos"],
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

// Catálogo inicial de Tipos de Multa con precios base reglamentarios
export const DEFAULT_TIPOS_MULTA: TipoMultaConfig[] = [
  {
    id: "tm_peso",
    icon: "⚖️",
    titulo: "Control de Peso / Báscula",
    descripcion: "No registrar el peso en un día con evento asignado",
    importe: 2,
    categoria: "Preparación Física",
  },
  {
    id: "tm_well_tarde",
    icon: "⏱️",
    titulo: "No realizar el wellness antes de las 12:30",
    descripcion: "No realizar el wellness antes de las 12:30 en un día con sesión asignada",
    importe: 2,
    categoria: "Preparación Física",
  },
  {
    id: "tm_well_no",
    icon: "❌",
    titulo: "No realizar el cuestionario Wellness",
    descripcion: "No realizar el cuestionario Wellness en día con evento asignado",
    importe: 2,
    categoria: "Preparación Física",
  },
  {
    id: "tm_gps",
    icon: "⚡",
    titulo: "GPS / Pulsómetro",
    descripcion: "No llevar o no encender el dispositivo GPS / pulsómetro",
    importe: 10,
    categoria: "Preparación Física",
  },
  {
    id: "tm_ret_gym",
    icon: "⏱️",
    titulo: "Retraso Gimnasio / Activación",
    descripcion: "Llegada tardía a la sesión de fuerza o activación",
    importe: 10,
    categoria: "Preparación Física",
  },
  {
    id: "tm_material",
    icon: "🏋️",
    titulo: "Material sin Recoger",
    descripcion: "Dejar mancuernas, discos o gomas tiradas en el gimnasio",
    importe: 15,
    categoria: "Preparación Física",
  },
  {
    id: "tm_prevencion",
    icon: "🏃",
    titulo: "Rutina de Prevención",
    descripcion: "No realizar la rutina de prevención / warm-up individual",
    importe: 10,
    categoria: "Preparación Física",
  },
  {
    id: "tm_suple",
    icon: "🥤",
    titulo: "Suplementación / Batido",
    descripcion: "No tomar la suplementación o batido recuperador pautado",
    importe: 5,
    categoria: "Preparación Física",
  },
  {
    id: "tm_ropa",
    icon: "👟",
    titulo: "Indumentaria Gimnasio",
    descripcion: "Calzado o ropa inadecuada durante el entrenamiento de fuerza",
    importe: 10,
    categoria: "Preparación Física",
  },
  {
    id: "tm_movil",
    icon: "📱",
    titulo: "Teléfono Móvil",
    descripcion: "Uso de teléfono móvil en charla o vestuario",
    importe: 20,
    categoria: "Vestuario",
  },
  {
    id: "tm_retraso_conv",
    icon: "⏰",
    titulo: "Retraso Convocatoria",
    descripcion: "Llegada tarde a charla o autobús",
    importe: 25,
    categoria: "Vestuario",
  },
  {
    id: "tm_fisio",
    icon: "🩺",
    titulo: "No avisar a Fisio",
    descripcion: "No reportar molestia muscular antes de la sesión",
    importe: 20,
    categoria: "Médico / Fisioterapia",
  },
  {
    id: "tm_menu",
    icon: "🥗",
    titulo: "Menú no reglamentario",
    descripcion: "Incumplimiento de pauta nutricional en concentración",
    importe: 15,
    categoria: "Nutrición",
  },
];

// Helpers para partidos, nombres, fechas y horarios
export function isPartidoCode(code?: string | null): boolean {
  if (!code) return false;
  const c = String(code).trim().toUpperCase();
  return (
    c === "PL" ||
    c === "PV" ||
    c === "MD" ||
    c === "P" ||
    c === "PAL" ||
    c === "PAV" ||
    c === "PA" ||
    c === "PAAM" ||
    c === "MATCHDAY" ||
    c === "PARTIDO" ||
    c === "PARTIDO LIGA" ||
    c === "PARTIDO VISITANTE" ||
    c === "PARTIDO LOCAL" ||
    c === "PARTIDO AMISTOSO" ||
    c === "PARTIDO COPA" ||
    c.startsWith("PL ") ||
    c.startsWith("PV ") ||
    c.startsWith("MD ") ||
    c.startsWith("PARTIDO") ||
    c.startsWith("PA ") ||
    c.includes("PARTIDO") ||
    c.includes("AMISTOSO") ||
    c.includes("PAAM") ||
    c.includes("MATCHDAY")
  );
}

export const KNOWN_MATCH_DATES = new Set([
  "2026-07-29",
  "2026-08-01",
  "2026-08-05",
  "2026-08-08",
  "2026-08-12",
  "2026-08-19",
  "2026-08-22",
  "2026-09-06",
  "2026-09-12",
  "2026-09-13",
]);

// Helper para verificar si una fecha corresponde a día de partido (por fecha conocida o evento programado en planificación como PL, PV o MD)
export function isMatchDateOrEvent(fechaISO?: string, eventos?: any[]): boolean {
  if (!fechaISO) return false;
  if (KNOWN_MATCH_DATES.has(fechaISO)) return true;

  // Cargar bloques de calendario y planificación de localStorage si existen
  let allEvents = eventos && Array.isArray(eventos) ? [...eventos] : [];
  if (typeof window !== "undefined") {
    try {
      const rawBloques = localStorage.getItem("calendario_bloques_v1");
      if (rawBloques) {
        const parsed = JSON.parse(rawBloques);
        if (Array.isArray(parsed)) allEvents = [...allEvents, ...parsed];
      }
      const rawPlanif = localStorage.getItem("planificacion_sesiones_v1") || localStorage.getItem("planificacion_calendario_v1");
      if (rawPlanif) {
        const parsedP = JSON.parse(rawPlanif);
        if (Array.isArray(parsedP)) allEvents = [...allEvents, ...parsedP];
      }
    } catch (e) {}
  }

  const matches = allEvents.filter((ev) => normalizeDateStr(ev.fecha || ev.day_id || ev.date) === fechaISO);
  return matches.some((ev) => {
    const t = String(ev.tipo || ev.tipo_evento || ev.evento || ev.evento_principal || ev.evento_am || ev.evento_pm || ev.codigo || "").trim().toUpperCase();
    const com = String(ev.comentario || ev.comentario_am || ev.comentario_pm || "").trim().toUpperCase();
    const ori = String(ev.orientacion || ev.orientacion_am || ev.orientacion_pm || "").trim().toUpperCase();
    const rival = String(ev.rival || ev.rival_am || ev.rival_pm || "").trim();
    const md = String(ev.md || ev.tipo_dia || ev.subtipo || "").trim().toUpperCase();

    // Detección exhaustiva de días de partido: PL (Partido Liga/Local), PV (Partido Visitante), MD (Match Day), rival, etc.
    const isPl = t === "PL" || ori === "PL" || md === "PL" || t.startsWith("PL ") || ori.startsWith("PL ");
    const isPv = t === "PV" || ori === "PV" || md === "PV" || t.startsWith("PV ") || ori.startsWith("PV ");
    const isMd = md === "MD" || t === "MD" || ori === "MD" || md === "MATCHDAY" || md.startsWith("MD ");
    const isPal = t === "PAL" || ori === "PAL";
    const isPav = t === "PAV" || ori === "PAV";
    const hasRival = rival.length > 0;
    const isPart = isPartidoCode(t) || isPartidoCode(ori) || isPartidoCode(md) || ori === "PAAM" || ori === "PA";
    const hasPartText = (com.includes("PARTIDO") && !com.includes("PREPARTIDO") && !com.includes("PRE PARTIDO")) || (com.includes(" VS ") && !com.includes("PREPARTIDO"));

    return isPl || isPv || isMd || isPal || isPav || hasRival || isPart || hasPartText;
  });
}

// Fechas que explícitamente NO deben tener multas (días libres, errores de BD, etc.)
export const KNOWN_EXCLUDED_DATES = new Set([
  "2026-09-08",
  "2026-09-15",
  "2026-09-18",
  "2026-09-21"
]);

// Helper para verificar si una fecha tiene un evento de tipo Coadyuvante u Optimizador
export function hasCoOrOpEventInDB(fechaISO?: string, eventos?: any[], bloquesEventos?: any[]): boolean {
  if (!fechaISO) return false;
  if (KNOWN_EXCLUDED_DATES.has(fechaISO)) return false;
  if (KNOWN_VALID_CO_OP_DATES.has(fechaISO)) return true;

  let allEvents = eventos && Array.isArray(eventos) ? [...eventos] : [];
  if (bloquesEventos && Array.isArray(bloquesEventos)) {
    allEvents = [...allEvents, ...bloquesEventos];
  }
  if (typeof window !== "undefined") {
    try {
      const rawBloques = localStorage.getItem("calendario_bloques_v1");
      if (rawBloques) {
        const parsed = JSON.parse(rawBloques);
        if (Array.isArray(parsed)) allEvents = [...allEvents, ...parsed];
      }
      const rawPlanif = localStorage.getItem("planificacion_sesiones_v1") || localStorage.getItem("planificacion_calendario_v1");
      if (rawPlanif) {
        const parsedP = JSON.parse(rawPlanif);
        if (Array.isArray(parsedP)) allEvents = [...allEvents, ...parsedP];
      }
    } catch (e) {}
  }
  const matches = allEvents.filter((ev) => {
    let dateStr = ev.fecha || ev.date;
    if (!dateStr && ev.day_id) {
      if (ev.day_id.includes("-") && Array.isArray(eventos)) {
        const session = eventos.find(s => s.id === ev.day_id);
        if (session) dateStr = session.fecha;
      } else {
        dateStr = ev.day_id;
      }
    }
    return normalizeDateStr(dateStr) === fechaISO;
  });
  if (matches.length === 0) return false;

  return matches.some((ev) => {
    const t = String(ev.tipo || ev.tipo_evento || ev.evento || "").trim().toUpperCase();
    const com = String(ev.comentario || "").trim().toUpperCase();
    const ori = String(ev.orientacion || "").trim().toUpperCase();
    return isCoOrOpCode(t, ori, com);
  });
}


// Helper para determinar si un evento o código corresponde a Coadyuvante (Co) u Optimizador (Op)
export function isCoOrOpCode(code?: string | null, orientacion?: string | null, comentario?: string | null): boolean {
  const c = String(code || "").trim().toUpperCase();
  const o = String(orientacion || "").trim().toUpperCase();
  const com = String(comentario || "").trim().toUpperCase();

  // Si es partido, no cuenta como sesión regular Co/Op
  if (isPartidoCode(c) || isPartidoCode(o)) return false;

  // OOP = Optimizador Opcional -> NO cuenta para multas obligatorias de wellness
  if (c === "OOP" || c.startsWith("OOP") || o === "OOP" || o.startsWith("OOP")) return false;

  // CO (Coadyuvante)
  const isCo =
    c === "CO" ||
    c.startsWith("CO ") ||
    c.endsWith(" CO") ||
    c === "COADYUVANTE" ||
    c.includes("COADYUVANTE") ||
    o === "CO" ||
    o.startsWith("CO ") ||
    o === "COADYUVANTE" ||
    com.includes("COADYUVANTE");

  // OP (Optimizador) or E (Entrenamiento)
  const isOp =
    c === "OP" ||
    c.startsWith("OP ") ||
    c.endsWith(" OP") ||
    c === "OPTIMIZADOR" ||
    c.includes("OPTIMIZADOR") ||
    o === "OP" ||
    o.startsWith("OP ") ||
    o === "OPTIMIZADOR" ||
    (c === "E" && (o === "OP" || o === "CO" || !o)) ||
    com.includes("OPTIMIZADOR");

  return isCo || isOp;
}

// Fechas oficiales de la temporada 2026/27 con eventos Co u Op y sin partido
export const KNOWN_VALID_CO_OP_DATES = new Set([
  "2026-07-23",
  "2026-07-24",
  "2026-07-27",
  "2026-07-28",
  "2026-07-31",
  "2026-08-03",
  "2026-08-04",
  "2026-08-07",
  "2026-08-10",
  "2026-08-11",
  "2026-08-14",
  "2026-08-17",
  "2026-08-18",
  "2026-08-21",
  "2026-08-25",
  "2026-08-28",
  "2026-08-31",
  "2026-09-02",
  "2026-09-03",
  "2026-09-05",
  "2026-09-07",
  "2026-09-08",
  "2026-09-10",
  "2026-09-11",
  "2026-09-17",
  "2026-09-19"
]);

export function formatDateDDMM(isoStr?: string | null): string {
  if (!isoStr) return "";
  const str = String(isoStr).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const parts = str.slice(0, 10).split("-");
    return `${parts[2]}/${parts[1]}`;
  }
  const parts = str.split(" ")[0].split(/[\/\-\.]/);
  if (parts.length >= 3) {
    let p1 = parseInt(parts[0], 10);
    let p2 = parseInt(parts[1], 10);
    let p3 = parseInt(parts[2], 10);
    if (p3 > 2000) {
      return `${String(p1).padStart(2, "0")}/${String(p2).padStart(2, "0")}`;
    }
    if (p1 > 2000) {
      return `${String(p3).padStart(2, "0")}/${String(p2).padStart(2, "0")}`;
    }
  }
  return str;
}

function normalizeNameStr(name: string): string {
  return (name || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function matchPlayerName(sheetNameRaw: string, player: { nombre?: string; apodo?: string | null }): boolean {
  if (!sheetNameRaw || !player) return false;
  const sNorm = normalizeNameStr(sheetNameRaw);
  const pNombre = normalizeNameStr(player.nombre || "");
  const pApodo = normalizeNameStr(player.apodo || "");

  if (!sNorm) return false;

  // Exact full name or apodo match
  if (pNombre === sNorm || pApodo === sNorm) return true;

  // REGLA ESTRICTA: Nombres/Palabras ambiguas que NO deben contar si se ponen solos
  const ambiguousNames = ["oscar", "marc", "dani", "carlos", "portero", "alex"];
  if (ambiguousNames.includes(sNorm)) {
    return false; // Es ambiguo. Fuerza a que aparezcan ambos como "No Realizado" para que aprendan a poner apellido.
  }

  // Desambiguaciones críticas (con && para evitar falsos positivos cruzados)
  if (sNorm.includes("pulido") && (pNombre.includes("pulido") || pApodo.includes("puli"))) return true;
  if (sNorm.includes("gomez") && pNombre.includes("gomez")) return true;

  if ((sNorm.includes("pochito") || sNorm.includes("pocho") || sNorm.includes("pepo") || sNorm.includes("josep lluis") || sNorm === "josep") &&
      (pNombre.includes("josep") || pNombre.includes("lluis") || pApodo.includes("poch") || pApodo.includes("pepo"))) {
    return true;
  }
  
  if (sNorm.includes("aleix") && pNombre.includes("aleix")) return true;
  
  if ((sNorm.includes("alex") && sNorm.includes("igles")) || sNorm.includes("iglesia") || sNorm.includes("igle")) {
     if (pNombre.includes("iglesia") || pApodo.includes("igle")) return true;
  }

  // Jugadores con apellidos únicos
  if (sNorm.includes("olmedo") && pNombre.includes("olmedo")) return true;
  if (sNorm.includes("kone") && pNombre.includes("kone")) return true;
  if (sNorm.includes("daouda") && pNombre.includes("daouda")) return true;
  if ((sNorm.includes("bili") || sNorm.includes("bilal")) && (pNombre.includes("bilal") || pApodo.includes("bili"))) return true;
  if (sNorm.includes("ezzarfani") && pNombre.includes("ezzarfani")) return true;
  if (sNorm.includes("richard") && pNombre.includes("richard")) return true;
  if (sNorm.includes("portero") && pNombre.includes("portero")) return true;
  if (sNorm.includes("ferrer") && pNombre.includes("ferrer")) return true;
  if (sNorm.includes("momoh") && pNombre.includes("momoh")) return true;
  if (sNorm.includes("tebar") && pNombre.includes("tebar")) return true;
  if ((sNorm.includes("boukir") || sNorm.includes("oussa")) && (pNombre.includes("boukir") || pApodo.includes("oussa"))) return true;
  if (sNorm.includes("borras") && pNombre.includes("borras")) return true;
  if ((sNorm.includes("munells") || sNorm.includes("mune")) && (pNombre.includes("munells") || pApodo.includes("mune"))) return true;
  if (sNorm.includes("amerani") && pNombre.includes("amerani")) return true;
  if (sNorm.includes("teixeira") && pNombre.includes("teixeira")) return true;
  if (sNorm.includes("guzman") && pNombre.includes("guzman")) return true;
  if (sNorm.includes("montes") && pNombre.includes("montes")) return true;
  if (sNorm.includes("castro") && pNombre.includes("castro")) return true;
  if (sNorm.includes("vera") && pNombre.includes("vera")) return true;

  // Generic fallback if sNorm perfectly matches a part of pNombre
  if (pNombre && (pNombre === sNorm || pNombre.startsWith(sNorm + " ") || pNombre.endsWith(" " + sNorm))) return true;
  if (pApodo && (pApodo === sNorm || pApodo.startsWith(sNorm + " ") || pApodo.endsWith(" " + sNorm))) return true;

  return false;
}

function normalizeDateStr(dateRaw: any): string {
  if (!dateRaw) return "";
  const str = String(dateRaw).trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }

  const firstSpace = str.split(" ")[0];
  const parts = firstSpace.split(/[\/\-\.]/);
  if (parts.length >= 3) {
    let p1 = parseInt(parts[0], 10);
    let p2 = parseInt(parts[1], 10);
    let p3 = parseInt(parts[2], 10);

    if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
      if (p3 < 100) p3 += 2000;
      if (p3 > 2000) {
        const dd = String(p1).padStart(2, "0");
        const mm = String(p2).padStart(2, "0");
        return `${p3}-${mm}-${dd}`;
      } else if (p1 > 2000) {
        const mm = String(p2).padStart(2, "0");
        const dd = String(p3).padStart(2, "0");
        return `${p1}-${mm}-${dd}`;
      }
    }
  }
  return "";
}

function extractRecordDateISO(r: any): string {
  if (!r) return "";
  const keys = Object.keys(r);
  const rawA = r["_colA"] ?? r["_col0"] ?? r["Marca temporal"] ?? r["Timestamp"] ?? r["Fecha"] ?? r[keys[0]] ?? "";
  const isoA = normalizeDateStr(rawA);

  const rawB = r["_colB"] ?? r["_col1"] ?? (keys.length > 1 ? r[keys[1]] : "") ?? "";
  const isoB = normalizeDateStr(rawB);

  // Si la marca temporal coincide con un día de sesión válido, usar Marca temporal para evitar errores de selección en el form
  if (isoA && (KNOWN_VALID_CO_OP_DATES.has(isoA) || !isoB)) {
    return isoA;
  }
  if (isoB && KNOWN_VALID_CO_OP_DATES.has(isoB)) {
    return isoB;
  }
  return isoA || isoB || "";
}

function extractRecordPlayerName(r: any): string {
  if (!r) return "";
  const keys = Object.keys(r);
  const explicit = r["_colC"] || r["_colB"] || r["Jugador"] || r["Jugadora"] || r["Nombre"] || r["Nombre y Apellidos"] || r["Apellidos y Nombre"];
  if (explicit && typeof explicit === "string" && !/^\d{1,4}[\/\-\.]\d{1,4}/.test(explicit.trim())) {
    return explicit;
  }

  for (let i = 0; i < Math.min(keys.length, 4); i++) {
    const val = r[keys[i]];
    if (typeof val === "string" && val.trim().length > 1 && !normalizeDateStr(val)) {
      return val;
    }
  }
  return "";
}

function extractRecordSubmissionTime(r: any): { timeStr: string; isLate: boolean; hours: number; minutes: number } {
  if (!r) return { timeStr: "", isLate: false, hours: 0, minutes: 0 };
  const keys = Object.keys(r);

  let raw = r["_colI"] ?? r["_col8"] ?? (keys.length > 8 ? r[keys[8]] : "") ?? r["Hora"] ?? r["Hora de finalización"] ?? r["Hora entrega"] ?? "";
  let str = String(raw).trim();

  // 1. Time string like "13:08", "12:40"
  const timeMatch = str.match(/(?:(\d{1,2})[:\.](\d{2})(?:[:\.](\d{2}))?\s*(am|pm)?)/i);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const m = parseInt(timeMatch[2], 10);
    const ampm = timeMatch[4]?.toLowerCase();

    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;

    const formatted = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}h`;
    const totalMins = h * 60 + m;
    const limitMins = 12 * 60 + 30; // 12:30h limit

    return {
      timeStr: formatted,
      isLate: totalMins > limitMins,
      hours: h,
      minutes: m,
    };
  }

  // 2. Fractional float in Col I
  const num = parseFloat(str.replace(",", "."));
  if (!isNaN(num) && num > 0 && num < 1) {
    const totalSecs = Math.round(num * 86400);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const formatted = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}h`;
    const totalMins = h * 60 + m;
    return {
      timeStr: formatted,
      isLate: totalMins > 750,
      hours: h,
      minutes: m,
    };
  }

  // 3. Check Col A timestamp
  const rawA = r["_colA"] ?? r["_col0"] ?? r["Marca temporal"] ?? r["Timestamp"] ?? "";
  if (typeof rawA === "number") {
    const frac = rawA - Math.floor(rawA);
    if (frac > 0) {
      const totalSecs = Math.round(frac * 86400);
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const formatted = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}h`;
      const totalMins = h * 60 + m;
      return {
        timeStr: formatted,
        isLate: totalMins > 750,
        hours: h,
        minutes: m,
      };
    }
  } else if (typeof rawA === "string") {
    const mtMatch = rawA.match(/(?:(\d{1,2})[:\.](\d{2})(?:[:\.](\d{2}))?\s*(am|pm)?)/i);
    if (mtMatch) {
      let h = parseInt(mtMatch[1], 10);
      const m = parseInt(mtMatch[2], 10);
      const ampm = mtMatch[4]?.toLowerCase();
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      const formatted = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}h`;
      const totalMins = h * 60 + m;
      return {
        timeStr: formatted,
        isLate: totalMins > 750,
        hours: h,
        minutes: m,
      };
    }
  }

  return { timeStr: str || "—", isLate: false, hours: 0, minutes: 0 };
}

// Helper para obtener lista negra permanente de multas eliminadas
export const getDeletedBlacklist = (): { ids: Set<string>; signatures: Set<string> } => {
  const ids = new Set<string>();
  const signatures = new Set<string>();
  if (typeof window === "undefined") return { ids, signatures };
  try {
    const rawIds = localStorage.getItem("multas_deleted_ids_v2");
    if (rawIds) {
      const parsed: string[] = JSON.parse(rawIds);
      parsed.forEach((x) => ids.add(x));
    }
  } catch (e) {}
  try {
    const rawSig = localStorage.getItem("multas_deleted_signatures_v1");
    if (rawSig) {
      const parsed: string[] = JSON.parse(rawSig);
      parsed.forEach((x) => signatures.add(x));
    }
  } catch (e) {}
  return { ids, signatures };
};

// Helper para verificar si una multa está eliminada
export const isMultaDeleted = (
  m: { id?: string; jugador_id?: string; fecha?: string; concepto?: string },
  blacklist: { ids: Set<string>; signatures: Set<string> }
): boolean => {
  if (!m) return false;
  if (m.id && blacklist.ids.has(m.id)) return true;
  if (m.jugador_id && m.fecha) {
    const sigDate = `${m.jugador_id}::${m.fecha}`;
    if (blacklist.signatures.has(sigDate)) return true;
    if (m.concepto) {
      const sigConcept = `${m.jugador_id}::${m.fecha}::${m.concepto}`;
      if (blacklist.signatures.has(sigConcept)) return true;
    }
    if (blacklist.ids.has(`real_well_no_${m.jugador_id}_${m.fecha}`)) return true;
    if (blacklist.ids.has(`real_well_tarde_${m.jugador_id}_${m.fecha}`)) return true;
  }
  return false;
};

// Helper para limpiar multas con la lista negra y excepciones conocidas
export const cleanMultas = (list: Multa[], blacklist: { ids: Set<string>; signatures: Set<string> }, eventos?: any[], bloquesEventos?: any[]): Multa[] => {
  return list
    .filter((m) => {
      if (isMultaDeleted(m, blacklist)) return false;
      const isWellness = m.concepto.includes("Wellness") || m.concepto.includes("Cuestionario");
      if (isWellness) {
        // Excluir si es día de partido (tanto oficial conocido como partido programado en planificación)
        if (isMatchDateOrEvent(m.fecha, eventos)) {
          return false;
        }
        // Excluir cualquier multa en fechas donde no haya eventos Co/Op planificados
        if (!hasCoOrOpEventInDB(m.fecha, eventos, bloquesEventos)) {
          return false;
        }
      }
      return true;
    })
    .map((m) => {
      let jNombre = m.jugador_nombre;
      let jId = m.jugador_id;
      if (
        m.jugador_id === "b6877a25-e6de-48f3-aab3-1ae48a53e317" ||
        jNombre.toLowerCase().includes("pochito") ||
        jNombre.toLowerCase().includes("josep lluis")
      ) {
        jNombre = "POCHITO";
      } else if (jNombre.toLowerCase().includes("daouda")) {
        jNombre = "DAOUDA KONÉ";
        jId = "daouda_kone_merged_id";
      }
      let com = m.comentario ? m.comentario.replace(/\s*\([^)]*\)/g, "").trim() : "";
      return {
        ...m,
        jugador_id: jId,
        jugador_nombre: jNombre,
        jugador_apodo: undefined,
        comentario: com,
      };
    });
};

export default function MultasPage() {
  const clubConfig = useClubConfig();

  useEffect(() => {
    if (clubConfig?.nombreClub) setTeam(clubConfig.nombreClub);
    if (clubConfig?.temporadaActiva) setSeasons([clubConfig.temporadaActiva as any]);
  }, [clubConfig]);

  const [mounted, setMounted] = useState<boolean>(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState<boolean>(false);
  const [refreshSuccessMessage, setRefreshSuccessMessage] = useState<string | null>(null);

  // Navigation & Shell State
  const [seasons, setSeasons] = useState<Array<keyof typeof teamsBySeason>>(["2026/27"]);
  const [team, setTeam] = useState<string>("CE Europa");

  const [openGroups, setOpenGroups] = useState({
    screens: true,
    reports: true,
    database: false,
    settings: false,
  });

  const toggleGroup = (group: keyof typeof openGroups) => {
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const handleSeasonToggle = (seasonOption: keyof typeof teamsBySeason) => {
    let next: Array<keyof typeof teamsBySeason>;
    if (seasons.includes(seasonOption)) {
      if (seasons.length === 1) return;
      next = seasons.filter((s) => s !== seasonOption);
    } else {
      next = [...seasons, seasonOption];
    }
    setSeasons(next);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("active_seasons", JSON.stringify(next));
      } catch {}
    }
  };

  const availableTeams = useMemo(() => {
    return Array.from(new Set(seasons.flatMap((seasonOption) => teamsBySeason[seasonOption] ?? [])));
  }, [seasons]);

  // Multas data & Real BBDD State (Initialised directly from real-multas-data, then synchronized from DB / localStorage on mount)
  const [multas, setMultas] = useState<Multa[]>(REAL_MULTAS_DATA as Multa[]);
  const [todosJugadores, setTodosJugadores] = useState<JugadorSimple[]>(INITIAL_MANRESA_JUGADORES);
  const [planificacionEventos, setPlanificacionEventos] = useState<any[]>([]);
  const [bloquesEventos, setBloquesEventos] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"generador_informe" | "detector_wellness" | "catalogo_tipos" | "ranking">("generador_informe");
  const [isLoadingRealData, setIsLoadingRealData] = useState<boolean>(false);

  // Tipos de multa personalizables
  const [tiposMultaCatalogo, setTiposMultaCatalogo] = useState<TipoMultaConfig[]>(DEFAULT_TIPOS_MULTA);

  // Filtros del Generador de Informes (Vacíos por defecto para mostrar todos los datos de la temporada)
  const [reportFechaDesde, setReportFechaDesde] = useState<string>("");
  const [reportFechaHasta, setReportFechaHasta] = useState<string>("");
  const [filtroTipoMulta, setFiltroTipoMulta] = useState<string>("TODOS");
  const [filtroJugador, setFiltroJugador] = useState<string>("TODOS");
  const [busqueda, setBusqueda] = useState<string>("");

  // Modal crear/editar tipo de multa
  const [showTipoMultaModal, setShowTipoMultaModal] = useState<boolean>(false);
  const [editingTipoMulta, setEditingTipoMulta] = useState<TipoMultaConfig | null>(null);
  const [tipoFormTitulo, setTipoFormTitulo] = useState<string>("");
  const [tipoFormDescripcion, setTipoFormDescripcion] = useState<string>("");
  const [tipoFormImporte, setTipoFormImporte] = useState<number>(2);
  const [tipoFormCategoria, setTipoFormCategoria] = useState<Multa["categoria"]>("Preparación Física");
  const [tipoFormIcon, setTipoFormIcon] = useState<string>("⚠️");

  // Modal editar multa individual
  const [editingMulta, setEditingMulta] = useState<Multa | null>(null);
  const [editConcepto, setEditConcepto] = useState<string>("");
  const [editImporte, setEditImporte] = useState<number>(0);
  const [editComentario, setEditComentario] = useState<string>("");
  const [editCategoria, setEditCategoria] = useState<Multa["categoria"]>("Preparación Física");

  // Modal añadir multa manual al informe
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [addJugadorId, setAddJugadorId] = useState<string>(INITIAL_MANRESA_JUGADORES[0].id);
  const [addFecha, setAddFecha] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [addTipoId, setAddTipoId] = useState<string>("");
  const [addConcepto, setAddConcepto] = useState<string>("");
  const [addImporte, setAddImporte] = useState<number>(2);
  const [addCategoria, setAddCategoria] = useState<Multa["categoria"]>("Preparación Física");
  const [addComentario, setAddComentario] = useState<string>("");

  // Estado del Detector Automático de Wellness
  const [wellnessDate, setWellnessDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [excelUrl, setExcelUrl] = useState<string>(DEFAULT_EXCEL_URL);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<{ message: string; isError: boolean } | null>(null);
  const [liveSheetRecords, setLiveSheetRecords] = useState<any[]>([]);
  const [checkedAutoMultas, setCheckedAutoMultas] = useState<Record<string, boolean>>({});
  const [customImportes, setCustomImportes] = useState<Record<string, number>>({});
  const [customComentarios, setCustomComentarios] = useState<Record<string, string>>({});

  // Ordenación interactiva de la tabla
  const [sortCol, setSortCol] = useState<"fecha" | "jugador" | "concepto" | "importe" | "observaciones">("fecha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (col: "fecha" | "jugador" | "concepto" | "importe" | "observaciones") => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(col === "fecha" || col === "importe" ? "desc" : "asc");
    }
  };

  // Funciones de actualización y persistencia de filtros en localStorage
  const handleSetReportFechaDesde = (val: string) => {
    setReportFechaDesde(val);
    if (typeof window !== "undefined") {
      if (val) localStorage.setItem("multas_filtro_fecha_desde", val);
      else localStorage.removeItem("multas_filtro_fecha_desde");
    }
  };

  const handleSetReportFechaHasta = (val: string) => {
    setReportFechaHasta(val);
    if (typeof window !== "undefined") {
      if (val) localStorage.setItem("multas_filtro_fecha_hasta", val);
      else localStorage.removeItem("multas_filtro_fecha_hasta");
    }
  };

  const handleSetFiltroTipoMulta = (val: string) => {
    setFiltroTipoMulta(val);
    if (typeof window !== "undefined") {
      if (val && val !== "TODOS") localStorage.setItem("multas_filtro_tipo", val);
      else localStorage.removeItem("multas_filtro_tipo");
    }
  };

  const handleSetFiltroJugador = (val: string) => {
    setFiltroJugador(val);
    if (typeof window !== "undefined") {
      if (val && val !== "TODOS") localStorage.setItem("multas_filtro_jugador", val);
      else localStorage.removeItem("multas_filtro_jugador");
    }
  };

  const handleSetBusqueda = (val: string) => {
    setBusqueda(val);
    if (typeof window !== "undefined") {
      if (val) localStorage.setItem("multas_filtro_busqueda", val);
      else localStorage.removeItem("multas_filtro_busqueda");
    }
  };

  const handleSetActiveTab = (tab: "generador_informe" | "detector_wellness" | "catalogo_tipos" | "ranking") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      localStorage.setItem("multas_active_tab", tab);
    }
  };

  const handleResetFilters = () => {
    setReportFechaDesde("");
    setReportFechaHasta("");
    setFiltroTipoMulta("TODOS");
    setFiltroJugador("TODOS");
    setBusqueda("");
    if (typeof window !== "undefined") {
      localStorage.removeItem("multas_filtro_fecha_desde");
      localStorage.removeItem("multas_filtro_fecha_hasta");
      localStorage.removeItem("multas_filtro_tipo");
      localStorage.removeItem("multas_filtro_jugador");
      localStorage.removeItem("multas_filtro_busqueda");
    }
  };

  useEffect(() => {
    setMounted(true);

    try {
      const savedSeasons = localStorage.getItem("active_seasons");
      if (savedSeasons) setSeasons(JSON.parse(savedSeasons));
      const savedTeam = localStorage.getItem("active_team");
      if (savedTeam) setTeam(savedTeam);

      // Cargar filtros persistidos
      const savedFechaDesde = localStorage.getItem("multas_filtro_fecha_desde");
      if (savedFechaDesde !== null) setReportFechaDesde(savedFechaDesde);

      const savedFechaHasta = localStorage.getItem("multas_filtro_fecha_hasta");
      if (savedFechaHasta !== null) setReportFechaHasta(savedFechaHasta);

      const savedFiltroTipo = localStorage.getItem("multas_filtro_tipo");
      if (savedFiltroTipo !== null) setFiltroTipoMulta(savedFiltroTipo);

      const savedFiltroJugador = localStorage.getItem("multas_filtro_jugador");
      if (savedFiltroJugador !== null) setFiltroJugador(savedFiltroJugador);

      const savedBusqueda = localStorage.getItem("multas_filtro_busqueda");
      if (savedBusqueda !== null) setBusqueda(savedBusqueda);

      const savedTab = localStorage.getItem("multas_active_tab");
      if (savedTab && ["generador_informe", "detector_wellness", "catalogo_tipos", "ranking"].includes(savedTab)) {
        setActiveTab(savedTab as any);
      }
      
      const savedTipos = localStorage.getItem("tipos_multa_catalogo_v2");
      if (savedTipos) {
        const parsedTipos: TipoMultaConfig[] = JSON.parse(savedTipos);
        const updatedTipos = parsedTipos.map((t) => {
          if ((t.id === "tm_well_tarde" || t.id === "tm_well_no" || t.id === "tm_peso") && t.importe === 5) {
            return { ...t, importe: 2 };
          }
          return t;
        });
        setTiposMultaCatalogo(updatedTipos);
      } else {
        setTiposMultaCatalogo(DEFAULT_TIPOS_MULTA);
        localStorage.setItem("tipos_multa_catalogo_v2", JSON.stringify(DEFAULT_TIPOS_MULTA));
      }

      const blacklist = getDeletedBlacklist();
      cleanupObsoleteLocalStorage();

      const savedMultas = localStorage.getItem("multas_registro_v9");
      if (savedMultas) {
        try {
          const parsed = JSON.parse(savedMultas);
          if (Array.isArray(parsed)) {
            const cleaned = cleanMultas(parsed, blacklist, planificacionEventos, bloquesEventos);
            setMultas(cleaned);
            saveMultasToDatabase(cleaned as StoredMulta[]);
          } else {
            const initial = cleanMultas(REAL_MULTAS_DATA as Multa[], blacklist, planificacionEventos, bloquesEventos);
            setMultas(initial);
            saveMultasToDatabase(initial as StoredMulta[]);
          }
        } catch (e) {
          const initial = cleanMultas(REAL_MULTAS_DATA as Multa[], blacklist, planificacionEventos, bloquesEventos);
          setMultas(initial);
          saveMultasToDatabase(initial as StoredMulta[]);
        }
      } else {
        // Cargar desde IndexedDB o inicializar con REAL_MULTAS_DATA
        loadMultasFromDatabase().then((dbData) => {
          if (dbData && dbData.length > 0) {
            const cleaned = cleanMultas(dbData, blacklist, planificacionEventos, bloquesEventos);
            setMultas(cleaned);
            saveMultasToDatabase(cleaned as StoredMulta[]);
          } else {
            const initial = cleanMultas(REAL_MULTAS_DATA as Multa[], blacklist, planificacionEventos, bloquesEventos);
            setMultas(initial);
            saveMultasToDatabase(initial as StoredMulta[]);
          }
        }).catch(() => {
          const initial = cleanMultas(REAL_MULTAS_DATA as Multa[], blacklist, planificacionEventos, bloquesEventos);
          setMultas(initial);
          saveMultasToDatabase(initial as StoredMulta[]);
        });
      }
    } catch (e) {
      setMultas(REAL_MULTAS_DATA as Multa[]);
    }
  }, []);

  // Carga e hidratación en background de datos adicionales
  useEffect(() => {
    let isMounted = true;
    async function loadAdditionalRealData() {
      try {
        setIsLoadingRealData(true);
        const [jugadores, ses, sheetRes, bloquesRes] = await Promise.all([
          getActiveJugadores().catch(() => null),
          getSesionesDiaRange().catch(() => null),
          fetchLiveWellnessSheet(DEFAULT_EXCEL_URL).catch(() => null),
          getEventosBloquesBBDD().catch(() => null),
        ]);

        const sheetRecords: any[] = sheetRes && (sheetRes as any).data && Array.isArray((sheetRes as any).data) ? (sheetRes as any).data : [];

        if (!isMounted) return;

        if (jugadores && Array.isArray(jugadores) && jugadores.length > 0) {
          const filteredManresa = jugadores.filter(
            (j) =>
              (j.equipo || "").toLowerCase().includes("manresa") ||
              j.temporada === "2026/27" ||
              !j.equipo
          );
          if (filteredManresa.length > 0) {
            setTodosJugadores(filteredManresa);
          }
        }
        if (ses && Array.isArray(ses)) {
          setPlanificacionEventos(ses);
        }
        if (sheetRecords && Array.isArray(sheetRecords)) {
          setLiveSheetRecords(sheetRecords);
        }
        if (bloquesRes && typeof bloquesRes === "object") {
          setBloquesEventos(Object.values(bloquesRes));
        }
      } catch (err) {
        console.error("Error al cargar datos en segundo plano:", err);
      } finally {
        if (isMounted) setIsLoadingRealData(false);
      }
    }

    loadAdditionalRealData();
    return () => {
      isMounted = false;
    };
  }, [team]);

  // Guardar multas en la BBDD (IndexedDB + localStorage de forma segura y compacta)
  const saveMultasToStorage = (updated: Multa[]) => {
    setMultas(updated);
    saveMultasToDatabase(updated as StoredMulta[]).catch(() => {});
  };

  // Manejar edición directa del campo observaciones en la tabla
  const handleObservationChange = (multaId: string, text: string) => {
    const updated = multas.map((m) => (m.id === multaId ? { ...m, comentario: text } : m));
    saveMultasToStorage(updated);
  };

  // Guardar catálogo de tipos de multa
  const saveTiposCatalogo = (updated: TipoMultaConfig[]) => {
    setTiposMultaCatalogo(updated);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("tipos_multa_catalogo_v2", JSON.stringify(updated));
      } catch (e) {}
    }
  };

  // Sincronizar Google Sheets en vivo
  const handleSyncWellness = useCallback(async () => {
    setIsSyncing(true);
    setSyncStatus({ message: "Sincronizando Google Sheets...", isError: false });
    try {
      const sheetRes = await fetchLiveWellnessSheet(excelUrl);
      const records = sheetRes && (sheetRes as any).data && Array.isArray((sheetRes as any).data) ? (sheetRes as any).data : [];
      if (records.length > 0) {
        setLiveSheetRecords(records);
        const timeNow = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
        setSyncStatus({ message: `✓ ${records.length} respuestas cargadas con éxito (${timeNow})`, isError: false });
      } else {
        setSyncStatus({ message: sheetRes?.error || "No se encontraron respuestas en la hoja de cálculo.", isError: true });
      }
    } catch (err: any) {
      setSyncStatus({ message: `Error al sincronizar: ${err?.message || "Comprueba la conexión"}`, isError: true });
    } finally {
      setIsSyncing(false);
    }
  }, [excelUrl]);

  // Actualizar y refrescar todos los datos de multas, respuestas de Wellness y base de datos
  const handleActualizarMultas = useCallback(async () => {
    setIsRefreshingAll(true);
    setRefreshSuccessMessage(null);
    try {
      // 1. Sincronizar jugadores, eventos de planificación y respuestas del Google Sheet en vivo
      const [jugadores, ses, sheetRes, bloquesRes, dbData] = await Promise.all([
        getActiveJugadores().catch(() => null),
        getSesionesDiaRange().catch(() => null),
        fetchLiveWellnessSheet(excelUrl || DEFAULT_EXCEL_URL).catch(() => null),
        getEventosBloquesBBDD().catch(() => null),
        loadMultasFromDatabase().catch(() => null),
      ]);

      const activePlayers = (jugadores && Array.isArray(jugadores) && jugadores.length > 0
        ? jugadores
        : todosJugadores
      ).filter(
        (j) =>
          (j.equipo || "").toLowerCase().includes("manresa") ||
          j.temporada === "2026/27" ||
          !j.equipo
      );

      if (activePlayers.length > 0) {
        setTodosJugadores(activePlayers);
      }

      if (ses && Array.isArray(ses)) {
        setPlanificacionEventos(ses);
      }
      if (bloquesRes && typeof bloquesRes === "object") {
        setBloquesEventos(Object.values(bloquesRes));
      }

      const sheetRecords: any[] = sheetRes && (sheetRes as any).data && Array.isArray((sheetRes as any).data) ? (sheetRes as any).data : [];
      if (sheetRecords && Array.isArray(sheetRecords)) {
        setLiveSheetRecords(sheetRecords);
      }

      // 2. Cargar lista negra y registros guardados
      const blacklist = getDeletedBlacklist();
      let rawList: Multa[] = REAL_MULTAS_DATA as Multa[];

      if (typeof window !== "undefined") {
        try {
          const savedMultas = localStorage.getItem("multas_registro_v9");
          if (savedMultas) {
            const parsed = JSON.parse(savedMultas);
            if (Array.isArray(parsed) && parsed.length > 0) {
              rawList = parsed;
            }
          } else if (dbData && dbData.length > 0) {
            rawList = dbData as Multa[];
          }
        } catch (e) {}
      }

      // 3. Procesar respuestas del sheet y generar multas de wellness automáticas para fechas activas (incluyendo hoy)
      const newAutoMultas: Multa[] = [];
      const datesInSheet = new Set<string>();
      sheetRecords.forEach((r) => {
        const iso = extractRecordDateISO(r);
        if (iso) datesInSheet.add(iso);
      });

      const todayStr = new Date().toISOString().split("T")[0];
      if (todayStr) datesInSheet.add(todayStr);

      const latePrice = tiposMultaCatalogo.find((t) => t.id === "tm_well_tarde")?.importe ?? 2;
      const noRespPrice = tiposMultaCatalogo.find((t) => t.id === "tm_well_no")?.importe ?? 2;

      datesInSheet.forEach((dStr) => {
        // Los días de partido NUNCA se multan por no contestar ni por retraso de Wellness
        if (isMatchDateOrEvent(dStr, ses || planificacionEventos)) return;
        
        // Los días sin entrenamiento (sin eventos Co/Op) NUNCA se multan
        if (!hasCoOrOpEventInDB(dStr, ses || planificacionEventos, bloquesRes ? Object.values(bloquesRes) : bloquesEventos)) return;

        const daySheetRecords = sheetRecords.filter((r) => extractRecordDateISO(r) === dStr);
        // Procesar si hay respuestas en la hoja de ese día
        if (daySheetRecords.length === 0) return;

        activePlayers.forEach((j) => {
          const rec = daySheetRecords.find((r) => {
            const rawPlayer = extractRecordPlayerName(r);
            return matchPlayerName(rawPlayer, j);
          });
          const submission = rec ? extractRecordSubmissionTime(rec) : null;

          const isDeletedByUser =
            blacklist.ids.has(`${j.id}_${dStr}`) ||
            blacklist.ids.has(`real_well_no_${j.id}_${dStr}`) ||
            blacklist.ids.has(`real_well_tarde_${j.id}_${dStr}`) ||
            blacklist.signatures.has(`${j.id}::${dStr}`);

          if (isDeletedByUser) return;

          if (!rec) {
            const uniqueId = `real_well_no_${j.id}_${dStr}`;
            const yaExiste = rawList.some((m) => m.id === uniqueId || (m.jugador_id === j.id && m.fecha === dStr && (m.concepto.includes("Wellness") || m.concepto.includes("Cuestionario"))));
            if (!yaExiste && !blacklist.ids.has(uniqueId)) {
              newAutoMultas.push({
                id: uniqueId,
                fecha: dStr,
                jugador_id: j.id,
                jugador_nombre: j.nombre,
                jugador_apodo: j.apodo || undefined,
                jugador_dorsal: j.dorsal || j.cor_id || undefined,
                jugador_foto: j.foto_url || undefined,
                equipo: team || "CE Europa",
                categoria: "Preparación Física",
                concepto: "No realizar el cuestionario Wellness",
                importe: noRespPrice,
                reincidencia: "1ª Falta",
                comentario: "",
                creado_por: "Detector Automático",
              });
            }
          } else if (submission && submission.isLate) {
            const uniqueId = `real_well_tarde_${j.id}_${dStr}`;
            const yaExiste = rawList.some((m) => m.id === uniqueId || (m.jugador_id === j.id && m.fecha === dStr && (m.concepto.includes("Wellness") || m.concepto.includes("Cuestionario"))));
            if (!yaExiste && !blacklist.ids.has(uniqueId)) {
              newAutoMultas.push({
                id: uniqueId,
                fecha: dStr,
                jugador_id: j.id,
                jugador_nombre: j.nombre,
                jugador_apodo: j.apodo || undefined,
                jugador_dorsal: j.dorsal || j.cor_id || undefined,
                jugador_foto: j.foto_url || undefined,
                equipo: team || "CE Europa",
                categoria: "Preparación Física",
                concepto: "No realizar el wellness antes de las 12:30",
                importe: latePrice,
                reincidencia: "1ª Falta",
                comentario: `Entregado tarde a las ${submission.timeStr}`,
                creado_por: "Detector Automático",
              });
            }
          }
        });
      });

      const combined = [...newAutoMultas, ...rawList];
      const cleaned = cleanMultas(combined, blacklist, ses || planificacionEventos, bloquesRes ? Object.values(bloquesRes) : bloquesEventos);
      setMultas(cleaned);
      saveMultasToDatabase(cleaned as StoredMulta[]).catch(() => {});
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("multas_registro_v9", JSON.stringify(cleaned));
        } catch (e) {}
      }

      const timeNow = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const addedMsg = newAutoMultas.length > 0 ? ` (+${newAutoMultas.length} multas nuevas detectadas)` : "";
      setRefreshSuccessMessage(`✓ Multas y datos actualizados correctamente (${timeNow})${addedMsg} — ${cleaned.length} registros cargados`);
      setTimeout(() => {
        setRefreshSuccessMessage(null);
      }, 5000);
    } catch (err: any) {
      console.error("Error al actualizar multas:", err);
      alert("Error al actualizar multas: " + (err?.message || "Comprueba tu conexión"));
    } finally {
      setIsRefreshingAll(false);
    }
  }, [excelUrl, team, todosJugadores, tiposMultaCatalogo, planificacionEventos, bloquesEventos]);

  // Comprobar si el día tiene eventos asignados Co o Op y si es día de partido
  const hasPlanificacionEventsForDate = useCallback(
    (fechaISO: string): { hasEvent: boolean; isMatchDay: boolean; hasCoOrOp: boolean; eventNames: string[]; matchDetails?: string } => {
      if (!fechaISO) return { hasEvent: false, isMatchDay: false, hasCoOrOp: false, eventNames: [] };

      const matches = planificacionEventos.filter((ev) => {
        const evDate = normalizeDateStr(ev.fecha || ev.day_id);
        return evDate === fechaISO;
      });

      if (typeof window !== "undefined") {
        try {
          const rawBloques = localStorage.getItem("calendario_bloques_v1");
          if (rawBloques) {
            const parsed = JSON.parse(rawBloques);
            if (Array.isArray(parsed)) {
              parsed.forEach((b) => {
                if (normalizeDateStr(b.fecha) === fechaISO && !matches.some((m) => m.id === b.id)) {
                  matches.push(b);
                }
              });
            }
          }
        } catch (e) {}
      }

      // 2. Add blocks fetched directly from DB
      if (bloquesEventos && bloquesEventos.length > 0) {
        bloquesEventos.forEach((b) => {
          const sessionForBlock = planificacionEventos.find(s => s.id === b.day_id);
          const blockDateStr = b.fecha || (sessionForBlock ? sessionForBlock.fecha : b.day_id);
          
          if (normalizeDateStr(blockDateStr) === fechaISO && !matches.some((m) => m.id === b.id)) {
            matches.push(b);
          }
        });
      }

      let isMatch = KNOWN_MATCH_DATES.has(fechaISO);
      let matchRival = "";
      let hasCoOrOp = KNOWN_VALID_CO_OP_DATES.has(fechaISO);

      matches.forEach((ev) => {
        const t = String(ev.tipo || ev.tipo_evento || ev.evento || ev.evento_principal || "").trim().toUpperCase();
        const com = String(ev.comentario || "").trim().toUpperCase();
        const ori = String(ev.orientacion || "").trim().toUpperCase();
        const rival = String(ev.rival || "").trim();
        const md = String(ev.md || ev.tipo_dia || "").trim().toUpperCase();

        if (
          rival.length > 0 ||
          md === "MD" ||
          isPartidoCode(t) ||
          ori === "PAAM" ||
          ori === "PA" ||
          (com.includes("PARTIDO") && !com.includes("PREPARTIDO") && !com.includes("PRE PARTIDO")) ||
          (com.includes(" VS ") && !com.includes("PREPARTIDO"))
        ) {
          isMatch = true;
          if (rival) matchRival = rival;
          else if (com && !com.includes("PREPARTIDO") && !com.includes("PRE PARTIDO")) matchRival = com;
        }

        if (isCoOrOpCode(t, ori, com)) {
          hasCoOrOp = true;
        }
      });

      // Si es día de partido, no cuenta como día multable Co/Op
      if (isMatch) {
        hasCoOrOp = false;
      }

      const validEvents = matches.filter((ev) => {
        const t = String(ev.tipo || ev.tipo_evento || "").trim().toUpperCase();
        return t !== "D" && t !== "DESCANSO" && t !== "LIBRE" && t !== "";
      });

      const names = validEvents.map((ev) => ev.tipo || ev.tipo_evento || ev.comentario || "Sesión");
      return {
        hasEvent: validEvents.length > 0 || isMatch || hasCoOrOp,
        isMatchDay: isMatch,
        hasCoOrOp,
        eventNames: names,
        matchDetails: matchRival ? `vs ${matchRival}` : "Partido",
      };
    },
    [planificacionEventos, bloquesEventos, liveSheetRecords]
  );

  // Análisis automático de Wellness para la fecha seleccionada
  const wellnessAnalysis = useMemo(() => {
    const { hasEvent, isMatchDay, hasCoOrOp, eventNames, matchDetails } = hasPlanificacionEventsForDate(wellnessDate);

    const recordsMap = new Map<string, any>();
    liveSheetRecords.forEach((r) => {
      if (!isRowMatchingDate(r, wellnessDate)) return;

      const rawPlayer = extractPlayerNameFromRow(r) || extractRecordPlayerName(r);
      if (!rawPlayer) return;

      const matched = findMatchingJugadorLib(rawPlayer, todosJugadores, todosJugadores);
      if (matched) {
        recordsMap.set(matched.id, r);
      } else if (rawPlayer) {
        recordsMap.set(`raw-${rawPlayer}`, r);
      }
    });

    const latePrice = tiposMultaCatalogo.find((t) => t.id === "tm_well_tarde")?.importe ?? 2;
    const noRespPrice = tiposMultaCatalogo.find((t) => t.id === "tm_well_no")?.importe ?? 2;

    const rows = todosJugadores.map((jugador) => {
      const record = recordsMap.get(jugador.id);
      const submission = record ? extractRecordSubmissionTime(record) : null;

      let status: "OK" | "TARDE" | "NO_REALIZADO" | "EXENTO" = "OK";
      let motivo = "Wellness completado a tiempo";
      let importeSugerido = 0;
      let horaTexto = submission?.timeStr || "—";

      if (isMatchDay) {
        status = "EXENTO";
        motivo = `Día de Partido ${matchDetails} (Exento de multa Wellness)`;
        importeSugerido = 0;
      } else if (!hasCoOrOp) {
        status = "EXENTO";
        motivo = "Día sin evento Co o Op en Planificación (Exento de multa)";
        importeSugerido = 0;
      } else if (!record) {
        status = "NO_REALIZADO";
        motivo = "No ha realizado el cuestionario Wellness";
        importeSugerido = noRespPrice;
      } else if (submission && submission.isLate) {
        status = "TARDE";
        motivo = `Wellness enviado tarde a las ${submission.timeStr}`;
        importeSugerido = latePrice;
      }

      const blacklist = typeof window !== "undefined" ? {
        ids: new Set<string>(JSON.parse(localStorage.getItem("multas_deleted_ids_v2") || "[]")),
        signatures: new Set<string>(JSON.parse(localStorage.getItem("multas_deleted_signatures_v1") || "[]")),
      } : { ids: new Set<string>(), signatures: new Set<string>() };

      const isDeletedByUser =
        blacklist.ids.has(`${jugador.id}_${wellnessDate}`) ||
        blacklist.ids.has(`real_well_no_${jugador.id}_${wellnessDate}`) ||
        blacklist.ids.has(`real_well_tarde_${jugador.id}_${wellnessDate}`) ||
        blacklist.signatures.has(`${jugador.id}::${wellnessDate}`);

      if (isDeletedByUser) {
        status = "EXENTO";
        motivo = "Multa eliminada previamente por el usuario (Exento)";
        importeSugerido = 0;
      }

      const isExempt = isMatchDay || !hasCoOrOp || isDeletedByUser;
      const uniqueKey = `${jugador.id}_${wellnessDate}`;
      const isChecked = !isExempt && (checkedAutoMultas[uniqueKey] ?? (status === "TARDE" || status === "NO_REALIZADO"));
      const currentImporte = isExempt ? 0 : customImportes[uniqueKey] !== undefined ? customImportes[uniqueKey] : importeSugerido;
      const currentMotivo = customComentarios[uniqueKey] !== undefined ? customComentarios[uniqueKey] : motivo;

      return {
        jugador,
        uniqueKey,
        record,
        horaTexto,
        status,
        motivo: currentMotivo,
        importe: currentImporte,
        isChecked,
      };
    });

    return {
      hasEvent,
      isMatchDay,
      hasCoOrOp,
      eventNames,
      matchDetails,
      rows,
      countTarde: rows.filter((r) => r.status === "TARDE").length,
      countNoResp: rows.filter((r) => r.status === "NO_REALIZADO").length,
      countOk: rows.filter((r) => r.status === "OK").length,
      countExento: rows.filter((r) => r.status === "EXENTO").length,
    };
  }, [wellnessDate, liveSheetRecords, todosJugadores, tiposMultaCatalogo, hasPlanificacionEventsForDate, checkedAutoMultas, customImportes, customComentarios, bloquesEventos]);

  // Aplicar e incorporar multas automáticas detectadas
  const handleApplyAutoMultas = () => {
    const blacklist = typeof window !== "undefined" ? {
      ids: new Set<string>(JSON.parse(localStorage.getItem("multas_deleted_ids_v2") || "[]")),
      signatures: new Set<string>(JSON.parse(localStorage.getItem("multas_deleted_signatures_v1") || "[]")),
    } : { ids: new Set<string>(), signatures: new Set<string>() };

    const toAdd: Multa[] = [];
    wellnessAnalysis.rows.forEach((r) => {
      if (r.isChecked && (r.status === "TARDE" || r.status === "NO_REALIZADO")) {
        const uniqueId = `real_well_${r.status === "TARDE" ? "tarde" : "no"}_${r.jugador.id}_${wellnessDate}`;
        const isDeleted =
          blacklist.ids.has(uniqueId) ||
          blacklist.ids.has(`real_well_no_${r.jugador.id}_${wellnessDate}`) ||
          blacklist.ids.has(`real_well_tarde_${r.jugador.id}_${wellnessDate}`) ||
          blacklist.signatures.has(`${r.jugador.id}::${wellnessDate}`);

        if (isDeleted) return;

        const yaExiste = multas.some((m) => m.id === uniqueId || (m.jugador_id === r.jugador.id && m.fecha === wellnessDate && (m.concepto.includes("Wellness") || m.concepto.includes("Cuestionario"))));

        if (!yaExiste) {
          toAdd.push({
            id: uniqueId,
            fecha: wellnessDate,
            jugador_id: r.jugador.id,
            jugador_nombre: r.jugador.nombre,
            jugador_apodo: r.jugador.apodo || undefined,
            jugador_dorsal: r.jugador.dorsal || undefined,
            jugador_foto: r.jugador.foto_url || undefined,
            equipo: team,
            categoria: "Preparación Física",
            concepto: r.status === "TARDE" ? "No realizar el wellness antes de las 12:30" : "No realizar el cuestionario Wellness",
            importe: r.importe,
            reincidencia: "1ª Falta",
            comentario: "",
            creado_por: "Detector Automático",
          });
        }
      }
    });

    if (toAdd.length > 0) {
      const updated = [...toAdd, ...multas];
      saveMultasToStorage(updated);
      alert(`✓ Se han incorporado con éxito ${toAdd.length} multas de Wellness al registro oficial.`);
      setActiveTab("generador_informe");
    } else {
      alert("No hay multas nuevas seleccionadas para incorporar.");
    }
  };

  // Filtrado robusto de multas para el Generador de Informes
  const filteredMultas = useMemo(() => {
    return multas.filter((m) => {
      // Filtro de fecha desde
      if (reportFechaDesde && m.fecha && m.fecha < reportFechaDesde) {
        return false;
      }
      // Filtro de fecha hasta
      if (reportFechaHasta && m.fecha && m.fecha > reportFechaHasta) {
        return false;
      }

      // Filtro de tipo de multa
      if (filtroTipoMulta && filtroTipoMulta !== "TODOS") {
        const normFilter = normalizeNameStr(filtroTipoMulta);
        const normConcept = normalizeNameStr(m.concepto || "");
        if (normConcept !== normFilter && !normConcept.includes(normFilter) && !normFilter.includes(normConcept)) {
          return false;
        }
      }

      // Filtro por jugador
      if (filtroJugador && filtroJugador !== "TODOS") {
        if (m.jugador_id !== filtroJugador) {
          const jObj = todosJugadores.find((j) => j.id === filtroJugador);
          if (!jObj || !matchPlayerName(m.jugador_nombre, jObj)) {
            return false;
          }
        }
      }

      // Búsqueda de texto libre
      if (busqueda.trim()) {
        const q = normalizeNameStr(busqueda);
        const matchPlayer = normalizeNameStr(m.jugador_nombre).includes(q) || (m.jugador_apodo && normalizeNameStr(m.jugador_apodo).includes(q));
        const matchConcept = normalizeNameStr(m.concepto || "").includes(q);
        const matchCom = normalizeNameStr(m.comentario || "").includes(q);
        const matchFecha = (m.fecha || "").includes(busqueda.trim());
        if (!matchPlayer && !matchConcept && !matchCom && !matchFecha) return false;
      }

      return true;
    });
  }, [multas, reportFechaDesde, reportFechaHasta, filtroTipoMulta, filtroJugador, busqueda, todosJugadores]);

  // Verificar si hay observaciones rellenadas para la vista de impresión
  const hasAnyObservation = useMemo(() => {
    return filteredMultas.some((m) => (m.comentario || "").trim().length > 0);
  }, [filteredMultas]);

  // Rango de fechas y fecha del informe formateada para cabecera PDF
  const fechaRangoTexto = useMemo(() => {
    if (reportFechaDesde && reportFechaHasta) {
      return `Del ${formatDateDDMM(reportFechaDesde)} al ${formatDateDDMM(reportFechaHasta)}`;
    }
    if (reportFechaDesde) {
      return `Desde el ${formatDateDDMM(reportFechaDesde)}`;
    }
    if (reportFechaHasta) {
      return `Hasta el ${formatDateDDMM(reportFechaHasta)}`;
    }
    if (filteredMultas.length > 0) {
      const dates = filteredMultas.map((m) => m.fecha).filter(Boolean).sort();
      if (dates.length > 0) {
        return `Del ${formatDateDDMM(dates[0])} al ${formatDateDDMM(dates[dates.length - 1])}`;
      }
    }
    return "Temporada 2026/27";
  }, [reportFechaDesde, reportFechaHasta, filteredMultas]);

  const todayFormatted = useMemo(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }, []);

  // Métricas del informe
  const totalRecaudado = useMemo(() => filteredMultas.reduce((acc, m) => acc + (m.importe || 0), 0), [filteredMultas]);
  const totalInfracciones = filteredMultas.length;

  const topInfractor = useMemo(() => {
    if (filteredMultas.length === 0) return null;
    const totals: Record<string, { nombre: string; total: number; count: number }> = {};
    filteredMultas.forEach((m) => {
      if (!totals[m.jugador_id]) {
        totals[m.jugador_id] = { nombre: m.jugador_nombre, total: 0, count: 0 };
      }
      totals[m.jugador_id].total += m.importe || 0;
      totals[m.jugador_id].count += 1;
    });

    const sorted = Object.values(totals).sort((a, b) => b.total - a.total);
    return sorted[0] || null;
  }, [filteredMultas]);

  // Ranking general por deportista
  const playerRanking = useMemo(() => {
    const map: Record<string, { id: string; nombre: string; apodo?: string; dorsal?: any; total: number; count: number; multas: Multa[] }> = {};

    todosJugadores.forEach((j) => {
      let jNombre = j.nombre;
      if (j.id === "b6877a25-e6de-48f3-aab3-1ae48a53e317" || jNombre.toLowerCase().includes("pochito") || jNombre.toLowerCase().includes("josep lluis")) {
        jNombre = "POCHITO";
      }
      map[j.id] = {
        id: j.id,
        nombre: jNombre,
        apodo: j.apodo || undefined,
        dorsal: j.dorsal || undefined,
        total: 0,
        count: 0,
        multas: [],
      };
    });

    filteredMultas.forEach((m) => {
      let jNombre = m.jugador_nombre;
      if (m.jugador_id === "b6877a25-e6de-48f3-aab3-1ae48a53e317" || jNombre.toLowerCase().includes("pochito") || jNombre.toLowerCase().includes("josep lluis")) {
        jNombre = "POCHITO";
      }
      if (!map[m.jugador_id]) {
        map[m.jugador_id] = {
          id: m.jugador_id,
          nombre: jNombre,
          apodo: m.jugador_apodo,
          dorsal: m.jugador_dorsal,
          total: 0,
          count: 0,
          multas: [],
        };
      }
      map[m.jugador_id].total += m.importe || 0;
      map[m.jugador_id].count += 1;
      map[m.jugador_id].multas.push(m);
    });

    return Object.values(map).sort((a, b) => b.total - a.total || b.count - a.count);
  }, [todosJugadores, filteredMultas]);

  // Lista ordenada y filtrada de multas para la tabla principal
  const displayedMultas = useMemo(() => {
    const list = [...filteredMultas];
    list.sort((a, b) => {
      let comp = 0;
      if (sortCol === "fecha") {
        comp = (a.fecha || "").localeCompare(b.fecha || "");
      } else if (sortCol === "jugador") {
        comp = (a.jugador_nombre || "").localeCompare(b.jugador_nombre || "");
      } else if (sortCol === "concepto") {
        comp = (a.concepto || "").localeCompare(b.concepto || "");
      } else if (sortCol === "importe") {
        comp = (a.importe || 0) - (b.importe || 0);
      } else if (sortCol === "observaciones") {
        comp = (a.comentario || "").localeCompare(b.comentario || "");
      }
      return sortDir === "asc" ? comp : -comp;
    });
    return list;
  }, [filteredMultas, sortCol, sortDir]);

  // Resumen formateado por deportista (para exportar PDF, imprimir y copiar)
  // Formato: "Pochito Total 32€ - Wellness No Realizado 27/07 - 04/08 ... - Wellness Tarde (>12:30h) ..."
  const resumenPorJugador = useMemo(() => {
    const list = playerRanking.filter((p) => p.total > 0 || p.count > 0);

    return list.map((p) => {
      const conceptMap = new Map<string, string[]>();
      const sortedMultas = [...p.multas].sort((a, b) => a.fecha.localeCompare(b.fecha));

      sortedMultas.forEach((m) => {
        let conceptKey = m.concepto;
        if (conceptKey.toLowerCase().includes("no realiz") || conceptKey.toLowerCase().includes("no_realiz")) {
          conceptKey = "No realizar el cuestionario Wellness";
        } else if (conceptKey.includes("12:30") || conceptKey.toLowerCase().includes("tarde")) {
          conceptKey = "No realizar el wellness antes de las 12:30";
        }
        const formattedDate = formatDateDDMM(m.fecha);

        const cur = conceptMap.get(conceptKey) || [];
        cur.push(formattedDate);
        conceptMap.set(conceptKey, cur);
      });

      const conceptParts: string[] = [];
      conceptMap.forEach((dates, concept) => {
        conceptParts.push(`${concept} ${dates.join(" - ")}`);
      });

      const playerName = p.nombre;
      const formattedLine = `${playerName} Total ${p.total}€ - ${conceptParts.join(" - ")}`;

      return {
        ...p,
        playerName,
        conceptParts,
        formattedLine,
      };
    });
  }, [playerRanking]);

  // Manejar añadir multa manual
  const handleAddMultaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addJugadorId) {
      alert("Por favor selecciona un deportista");
      return;
    }

    const playerObj = todosJugadores.find((j) => j.id === addJugadorId);
    if (!playerObj) return;

    const newMulta: Multa = {
      id: `multa_man_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      fecha: addFecha || "2026-09-13",
      jugador_id: playerObj.id,
      jugador_nombre: playerObj.nombre,
      jugador_apodo: playerObj.apodo || undefined,
      jugador_dorsal: playerObj.dorsal || undefined,
      jugador_foto: playerObj.foto_url || undefined,
      equipo: team,
      categoria: addCategoria,
      concepto: addConcepto.trim() || "Infracción reglamentaria",
      importe: Number(addImporte) || 0,
      reincidencia: "1ª Falta",
      comentario: addComentario.trim(),
      creado_por: "Staff Técnico",
    };

    saveMultasToStorage([newMulta, ...multas]);
    setShowAddModal(false);
    setAddConcepto("");
    setAddComentario("");
  };

  // Manejar eliminar multa permanentemente del registro
  const handleDeleteMulta = (id: string) => {
    const target = multas.find((m) => m.id === id);
    if (window.confirm("¿Seguro que deseas eliminar esta multa del registro?")) {
      // 1. Guardar ID y firmas en lista negra permanente de eliminados
      let deletedIds: string[] = [];
      let deletedSignatures: string[] = [];
      try {
        const raw = localStorage.getItem("multas_deleted_ids_v2");
        if (raw) deletedIds = JSON.parse(raw);
      } catch (e) {}
      try {
        const rawSig = localStorage.getItem("multas_deleted_signatures_v1");
        if (rawSig) deletedSignatures = JSON.parse(rawSig);
      } catch (e) {}

      if (!deletedIds.includes(id)) deletedIds.push(id);

      if (target) {
        const sigDate = `${target.jugador_id}::${target.fecha}`;
        const sigConcept = `${target.jugador_id}::${target.fecha}::${target.concepto}`;
        const idNo = `real_well_no_${target.jugador_id}_${target.fecha}`;
        const idTarde = `real_well_tarde_${target.jugador_id}_${target.fecha}`;
        const uniqueKey = `${target.jugador_id}_${target.fecha}`;

        if (!deletedSignatures.includes(sigDate)) deletedSignatures.push(sigDate);
        if (!deletedSignatures.includes(sigConcept)) deletedSignatures.push(sigConcept);
        if (!deletedIds.includes(idNo)) deletedIds.push(idNo);
        if (!deletedIds.includes(idTarde)) deletedIds.push(idTarde);
        if (!deletedIds.includes(uniqueKey)) deletedIds.push(uniqueKey);
      }

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("multas_deleted_ids_v2", JSON.stringify(deletedIds));
          localStorage.setItem("multas_deleted_signatures_v1", JSON.stringify(deletedSignatures));
        } catch (e) {}
      }

      // 2. Filtrar multa en memoria y actualizar localStorage
      const updated = multas.filter((m) => m.id !== id);
      saveMultasToStorage(updated);
    }
  };

  // Manejar guardar edición de multa
  const handleSaveEditMulta = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMulta) return;

    const updated = multas.map((m) => {
      if (m.id === editingMulta.id) {
        return {
          ...m,
          concepto: editConcepto,
          importe: Number(editImporte) || 0,
          categoria: editCategoria,
          comentario: editComentario,
        };
      }
      return m;
    });

    saveMultasToStorage(updated);
    setEditingMulta(null);
  };

  // Exportar informe a Excel
  const handleExportExcel = () => {
    if (filteredMultas.length === 0) {
      alert("No hay multas para exportar con los filtros seleccionados.");
      return;
    }

    const rows = filteredMultas.map((m) => ({
      "Fecha (DD/MM)": formatDateDDMM(m.fecha),
      Fecha_ISO: m.fecha,
      Deportista: m.jugador_nombre,
      Apodo: m.jugador_apodo || "",
      Concepto: m.concepto,
      "Importe (€)": m.importe,
      Observaciones: m.comentario || "",
      "Creado Por": m.creado_por || "Staff",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Informe Multas");
    XLSX.writeFile(wb, `Informe_Multas_${team}_${reportFechaDesde || "inicio"}_al_${reportFechaHasta || "fin"}.xlsx`);
  };

  return (
    <main className="app-shell">
      {/* Sidebar Integrada idéntica al resto de la web */}
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
          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.screens} onClick={() => toggleGroup("screens")}>
            <span>PANTALLAS</span>
            <b>{openGroups.screens ? "−" : "+"}</b>
          </button>
          {openGroups.screens && (
            <div className="nav-group-list">
              <a className="nav-link" href="/">
                <span>▦</span> Índice
              </a>
              <a className="nav-link" href="/deportistas">
                <span>🏃</span> Deportistas
              </a>
              <a className="nav-link" href="/calendario">
                <span>📅</span> Planificación
              </a>
              <a className="nav-link" href="/disponibilidad">
                <span>📋</span> Disponibilidad
              </a>
              <a className="nav-link" href="/cargas">
                <span>⚡</span> Cargas
              </a>
              {standaloneScreens.slice(5).map(([icon, label, href]) => (
                <a className="nav-link" href={href} key={label}>
                  <span>{icon}</span> {label}
                </a>
              ))}
            </div>
          )}
          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.reports} onClick={() => toggleGroup("reports")}>
            <span>INFORMES</span>
            <b>{openGroups.reports ? "−" : "+"}</b>
          </button>
          {openGroups.reports && (
            <div className="nav-group-list">
              {reports.map((item) => (
                <a
                  className={`nav-link ${item.name === "Multas" ? "active" : ""}`}
                  href={item.href}
                  key={item.name}
                >
                  <span>▤</span> {item.name}
                </a>
              ))}
            </div>
          )}
          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.database} onClick={() => toggleGroup("database")}>
            <span>BASE DE DATOS</span>
            <b>{openGroups.database ? "−" : "+"}</b>
          </button>
          {openGroups.database && (
            <div className="nav-group-list">
              {databaseScreens.map((label) => (
                <a className="nav-link" href={`/base-datos/${label.toLowerCase()}`} key={label}>
                  <span>▥</span> {label}
                </a>
              ))}
            </div>
          )}
          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.settings} onClick={() => toggleGroup("settings")}>
            <span>AJUSTES</span>
            <b>{openGroups.settings ? "−" : "+"}</b>
          </button>
          {openGroups.settings && (
            <div className="nav-group-list">
              <a className="nav-link" href="/ajustes">
                <span>⚙️</span> Configuración General
              </a>
            </div>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="sync-status">
            <span className="online-dot" /> Datos sincronizados <small>en vivo</small>
          </div>
          <div className="profile">
            <div className="avatar">MN</div>
            <div>
              <strong>Miquel Nadal</strong>
              <small>Staff técnico</small>
            </div>
            <span>···</span>
          </div>
        </div>
      </aside>

      {/* Contenido Principal */}
      <section className="content" style={{ position: "relative", minHeight: "100vh" }}>
        {/* Estilos CSS para Impresión / PDF Oficial con Márgenes Cuidados */}
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              margin: 0; /* Elimina cabecera y pie por defecto del navegador */
              size: A4 portrait;
            }
            body {
              padding: 12mm 12mm 14mm 12mm !important;
              background: #ffffff !important;
              color: #000000 !important;
              font-size: 10.5px !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            aside, .sidebar, .topbar, .no-print {
              display: none !important;
            }
            .content {
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
            }
            .print-only {
              display: block !important;
            }
            .print-card-box {
              border: none !important;
              box-shadow: none !important;
              border-radius: 0 !important;
              background: transparent !important;
            }
            table {
              font-size: 10px !important;
              width: 100% !important;
              border-collapse: collapse !important;
              page-break-inside: auto !important;
            }
            thead {
              display: table-header-group !important;
            }
            tfoot {
              display: table-footer-group !important;
            }
            th, td {
              padding: 4px 6px !important;
              line-height: 1.15 !important;
              border: 1px solid #cbd5e1 !important;
            }
            th {
              background: #0f172a !important;
              color: #ffffff !important;
              font-weight: 800 !important;
              font-size: 9.5px !important;
              text-transform: uppercase !important;
              letter-spacing: 0.03em !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            tr {
              page-break-inside: avoid !important;
              page-break-after: auto !important;
            }
            tr:nth-child(even) {
              background-color: #f8fafc !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .print-section-totals {
              page-break-inside: avoid !important;
              margin-top: 18px !important;
              padding: 12px 16px !important;
              border: 1.5px solid #0f172a !important;
              border-radius: 8px !important;
              background: #f8fafc !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
          @media screen {
            .print-only {
              display: none !important;
            }
          }
        `}} />

        {/* Cabecera Oficial del Informe (Estándar CE Europa con Escudo, Período y Fecha) */}
        <div className="print-only" style={{ marginBottom: "16px", borderBottom: "2px solid #0f172a", paddingBottom: "12px" }}>
          {/* 1. TÍTULO DEL INFORME CENTRADO */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "8px" }}>
            <h1 style={{ fontSize: "17px", fontWeight: 900, color: "#0f172a", margin: 0, textTransform: "uppercase", letterSpacing: "0.03em", textAlign: "center" }}>
              INFORME DE MULTAS
            </h1>
          </div>

          {/* 2. FILA CON ESCUDO + NOMBRE A LA IZQUIERDA / PERÍODO AL CENTRO / DEPARTAMENTO Y FECHA A LA DERECHA */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
            {/* Izquierda: Escudo y Nombre del Club */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <img
                src="/ce-europa.png"
                alt={team}
                style={{ width: "38px", height: "46px", objectFit: "contain", background: "#ffffff", borderRadius: "4px", padding: "1px" }}
              />
              <div>
                <div style={{ fontSize: "12px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>{team}</div>
                <div style={{ fontSize: "9.5px", fontWeight: 700, color: "#64748b" }}>Temporada 2026/27</div>
              </div>
            </div>

            {/* Centro: Período de las multas en pequeño (sin recuadro) */}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "8.5px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Período de Sanciones
              </div>
              <div style={{ fontSize: "11px", fontWeight: 900, color: "#0f172a" }}>
                {fechaRangoTexto}
              </div>
            </div>

            {/* Derecha eliminada a petición del usuario */}
          </div>
        </div>

        {/* Topbar Estándar */}
        <header className="topbar no-print" style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Link href="/" style={{ fontSize: "12px", fontWeight: 800, color: "#1e3a8a", background: "#e2e8f0", padding: "4px 10px", borderRadius: "6px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              ← Menú
            </Link>
            <span style={{ color: "#cbd5e1", fontSize: "14px" }}>|</span>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Centro de Control / Informes
              </span>
              <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 900, color: "#0f172a" }}>
                ⚖️ Régimen Interno & Informe de Multas
              </h1>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Botón Actualizar Multas */}
            <button
              type="button"
              onClick={handleActualizarMultas}
              disabled={isRefreshingAll}
              style={{
                fontSize: "12.5px",
                fontWeight: 700,
                color: "#1e3a8a",
                background: "#eff6ff",
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid #bfdbfe",
                cursor: isRefreshingAll ? "wait" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s ease",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                opacity: isRefreshingAll ? 0.7 : 1,
              }}
              title="Recargar y sincronizar multas, respuestas de Wellness y eventos"
            >
              <span
                style={{
                  display: "inline-block",
                  animation: isRefreshingAll ? "spin 1s linear infinite" : "none",
                }}
              >
                🔄
              </span>
              {isRefreshingAll ? "Actualizando..." : "Actualizar Multas"}
            </button>

            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              style={{
                fontSize: "12.5px",
                fontWeight: 800,
                color: "#ffffff",
                background: "linear-gradient(135deg, #1e3a8a, #2563eb)",
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 6px rgba(30,58,138,0.25)",
              }}
            >
              + Añadir Multa
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              style={{
                fontSize: "12.5px",
                fontWeight: 700,
                color: "#166534",
                background: "#dcfce7",
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid #86efac",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              📊 Exportar Excel
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              style={{
                fontSize: "12.5px",
                fontWeight: 700,
                color: "#475569",
                background: "#ffffff",
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              🖨️ Imprimir / PDF
            </button>
          </div>
        </header>

        {/* Mensaje de feedback de actualización */}
        {refreshSuccessMessage && (
          <div
            className="no-print"
            style={{
              marginBottom: "14px",
              padding: "10px 16px",
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "8px",
              color: "#166534",
              fontSize: "12.5px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 2px 4px rgba(0,0,0,0.03)",
            }}
          >
            <span>{refreshSuccessMessage}</span>
            <button
              type="button"
              onClick={() => setRefreshSuccessMessage(null)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "#166534",
                fontWeight: 800,
                fontSize: "14px",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* BARRA DE CAPAS / PESTAÑAS */}
        <div
          className="no-print"
          style={{
            display: "flex",
            width: "100%",
            background: "#e2e8f0",
            padding: "4px",
            borderRadius: "10px",
            border: "1px solid #cbd5e1",
            marginBottom: "16px",
            gap: "6px",
            boxSizing: "border-box",
          }}
        >
          <button
            type="button"
            onClick={() => handleSetActiveTab("generador_informe")}
            style={{
              flex: 1,
              padding: "9px 16px",
              borderRadius: "8px",
              border: "none",
              fontSize: "13px",
              fontWeight: 800,
              cursor: "pointer",
              textAlign: "center",
              whiteSpace: "nowrap",
              background: activeTab === "generador_informe" ? "#1e3a8a" : "transparent",
              color: activeTab === "generador_informe" ? "#ffffff" : "#475569",
              boxShadow: activeTab === "generador_informe" ? "0 2px 6px rgba(30,58,138,0.3)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            📋 Generador de Informes ({filteredMultas.length})
          </button>
          <button
            type="button"
            onClick={() => handleSetActiveTab("detector_wellness")}
            style={{
              flex: 1,
              padding: "9px 16px",
              borderRadius: "8px",
              border: "none",
              fontSize: "13px",
              fontWeight: 800,
              cursor: "pointer",
              textAlign: "center",
              whiteSpace: "nowrap",
              background: activeTab === "detector_wellness" ? "#1e3a8a" : "transparent",
              color: activeTab === "detector_wellness" ? "#ffffff" : "#475569",
              boxShadow: activeTab === "detector_wellness" ? "0 2px 6px rgba(30,58,138,0.3)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            ⚡ Detector Automático Wellness
          </button>
          <button
            type="button"
            onClick={() => handleSetActiveTab("ranking")}
            style={{
              flex: 1,
              padding: "9px 16px",
              borderRadius: "8px",
              border: "none",
              fontSize: "13px",
              fontWeight: 800,
              cursor: "pointer",
              textAlign: "center",
              whiteSpace: "nowrap",
              background: activeTab === "ranking" ? "#1e3a8a" : "transparent",
              color: activeTab === "ranking" ? "#ffffff" : "#475569",
              boxShadow: activeTab === "ranking" ? "0 2px 6px rgba(30,58,138,0.3)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            📊 Resumen por Deportista
          </button>
          <button
            type="button"
            onClick={() => handleSetActiveTab("catalogo_tipos")}
            style={{
              flex: 1,
              padding: "9px 16px",
              borderRadius: "8px",
              border: "none",
              fontSize: "13px",
              fontWeight: 800,
              cursor: "pointer",
              textAlign: "center",
              whiteSpace: "nowrap",
              background: activeTab === "catalogo_tipos" ? "#1e3a8a" : "transparent",
              color: activeTab === "catalogo_tipos" ? "#ffffff" : "#475569",
              boxShadow: activeTab === "catalogo_tipos" ? "0 2px 6px rgba(30,58,138,0.3)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            ⚖️ Catálogo de Multas & Precios ({tiposMultaCatalogo.length})
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PESTAÑA 1: GENERADOR DE INFORMES DE MULTAS                   */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "generador_informe" && (
          <div>
            {/* Panel de Filtros Superiores */}
            <div
              className="no-print"
              style={{
                background: "#ffffff",
                padding: "16px 20px",
                borderRadius: "12px",
                border: "1px solid #cbd5e1",
                boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                marginBottom: "16px",
                display: "grid",
                gridTemplateColumns: "repeat(6, 1fr)",
                gap: "12px",
                alignItems: "end",
              }}
            >
              {/* Rango de Fechas */}
              <div>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                  📅 Fecha Desde
                </label>
                <input
                  type="date"
                  value={reportFechaDesde}
                  onChange={(e) => handleSetReportFechaDesde(e.target.value)}
                  style={{
                    width: "100%",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    padding: "7px 10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    color: "#0f172a",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                  📅 Fecha Hasta
                </label>
                <input
                  type="date"
                  value={reportFechaHasta}
                  onChange={(e) => handleSetReportFechaHasta(e.target.value)}
                  style={{
                    width: "100%",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    padding: "7px 10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    color: "#0f172a",
                  }}
                />
              </div>

              {/* Filtro por Tipo de Multa */}
              <div>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                  ⚖️ Tipo de Multa
                </label>
                <select
                  value={filtroTipoMulta}
                  onChange={(e) => handleSetFiltroTipoMulta(e.target.value)}
                  style={{
                    width: "100%",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    padding: "7px 10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#0f172a",
                  }}
                >
                  <option value="TODOS">Todos los tipos ({tiposMultaCatalogo.length})</option>
                  {tiposMultaCatalogo.map((t) => (
                    <option key={t.id} value={t.titulo}>
                      {t.icon} {t.titulo} ({t.importe}€)
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por Deportista */}
              <div>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                  🏃 Deportista Registrado
                </label>
                <select
                  value={filtroJugador}
                  onChange={(e) => handleSetFiltroJugador(e.target.value)}
                  style={{
                    width: "100%",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    padding: "7px 10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#0f172a",
                  }}
                >
                  <option value="TODOS">Toda la plantilla ({todosJugadores.length} jugadores)</option>
                  {todosJugadores.map((j) => (
                    <option key={j.id} value={j.id}>
                      {(j.apodo || j.nombre || "").toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Búsqueda rápida */}
              <div>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                  🔍 Búsqueda
                </label>
                <input
                  type="text"
                  placeholder="Buscar motivo, nombre..."
                  value={busqueda}
                  onChange={(e) => handleSetBusqueda(e.target.value)}
                  style={{
                    width: "100%",
                    fontSize: "12.5px",
                    padding: "7px 10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                  }}
                />
              </div>

              {/* Selector de Ordenación Rápida */}
              <div>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                  ↕️ Ordenar Tabla
                </label>
                <select
                  value={`${sortCol}_${sortDir}`}
                  onChange={(e) => {
                    const [col, dir] = e.target.value.split("_");
                    setSortCol(col as any);
                    setSortDir(dir as any);
                  }}
                  style={{
                    width: "100%",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    padding: "7px 10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#0f172a",
                  }}
                >
                  <option value="fecha_desc">📅 Fecha (Más reciente primero)</option>
                  <option value="fecha_asc">📅 Fecha (Más antigua primero)</option>
                  <option value="importe_desc">💰 Importe (€ Mayor a menor)</option>
                  <option value="importe_asc">💰 Importe (€ Menor a mayor)</option>
                  <option value="jugador_asc">🏃 Deportista (A - Z)</option>
                  <option value="jugador_desc">🏃 Deportista (Z - A)</option>
                  <option value="concepto_asc">⚖️ Concepto (A - Z)</option>
                </select>
              </div>
            </div>

            {/* Tarjetas KPI de Resumen (Solo en pantalla, no en PDF) */}
            <div
              className="no-print"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              <div style={{ background: "#ffffff", padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
                <span style={{ fontSize: "10px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Total Recaudado</span>
                <div style={{ fontSize: "18px", fontWeight: 900, color: "#1e3a8a", marginTop: "2px" }}>
                  {totalRecaudado} €
                </div>
                <small style={{ color: "#94a3b8", fontSize: "10px" }}>En el período seleccionado</small>
              </div>

              <div style={{ background: "#ffffff", padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
                <span style={{ fontSize: "10px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Infracciones Registradas</span>
                <div style={{ fontSize: "18px", fontWeight: 900, color: "#0f172a", marginTop: "2px" }}>
                  {totalInfracciones}
                </div>
                <small style={{ color: "#94a3b8", fontSize: "10px" }}>Total de multas aplicadas</small>
              </div>

              <div style={{ background: "#ffffff", padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
                <span style={{ fontSize: "10px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Mayor Importe Acumulado</span>
                <div style={{ fontSize: "15px", fontWeight: 900, color: "#b91c1c", marginTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {topInfractor ? `${topInfractor.nombre} (${topInfractor.total}€)` : "—"}
                </div>
                <small style={{ color: "#94a3b8", fontSize: "10px" }}>{topInfractor ? `${topInfractor.count} infracciones` : "Sin infracciones"}</small>
              </div>

              <div style={{ background: "#ffffff", padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
                <span style={{ fontSize: "10px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Equipo & Plantilla</span>
                <div style={{ fontSize: "15px", fontWeight: 900, color: "#0f172a", marginTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {team}
                </div>
                <small style={{ color: "#166534", fontSize: "10px", fontWeight: 700 }}>✓ {todosJugadores.length} deportistas activos</small>
              </div>
            </div>

            {/* Tabla Principal del Informe */}
            <div
              className="print-card-box"
              style={{
                background: "#ffffff",
                borderRadius: "12px",
                border: "1px solid #cbd5e1",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                overflow: "hidden",
              }}
            >
              <div
                className="no-print"
                style={{
                  padding: "14px 18px",
                  background: "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 900, color: "#0f172a" }}>
                    📋 Registro Detallado de Multas
                  </span>
                  <span style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", background: "#eff6ff", padding: "2px 8px", borderRadius: "6px" }}>
                    {filteredMultas.length} registros
                  </span>
                  {isLoadingRealData && (
                    <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700 }}>
                      ⏳ Sincronizando datos...
                    </span>
                  )}
                </div>

                <div className="no-print" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={handleActualizarMultas}
                    disabled={isRefreshingAll}
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#1e3a8a",
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      cursor: isRefreshingAll ? "wait" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                    title="Actualizar y refrescar todos los datos de multas"
                  >
                    <span style={{ display: "inline-block", animation: isRefreshingAll ? "spin 1s linear infinite" : "none" }}>
                      🔄
                    </span>
                    {isRefreshingAll ? "Actualizando..." : "Actualizar Multas"}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#64748b",
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    Restablecer Filtros
                  </button>
                </div>
              </div>

              {filteredMultas.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px" }}>
                    <thead>
                      <tr style={{ background: "#0f172a", color: "#ffffff", textAlign: "left" }}>
                        <th
                          onClick={() => handleSort("fecha")}
                          title="Ordenar por fecha"
                          style={{ padding: "6px 8px", fontWeight: 800, width: "95px", textAlign: "center", cursor: "pointer", userSelect: "none" }}
                        >
                          Fecha (DD/MM) {sortCol === "fecha" ? (sortDir === "asc" ? " ▲" : " ▼") : " ↕"}
                        </th>
                        <th
                          onClick={() => handleSort("jugador")}
                          title="Ordenar por deportista"
                          style={{ padding: "6px 8px", fontWeight: 800, width: "135px", cursor: "pointer", userSelect: "none" }}
                        >
                          Deportista {sortCol === "jugador" ? (sortDir === "asc" ? " ▲" : " ▼") : " ↕"}
                        </th>
                        <th
                          onClick={() => handleSort("concepto")}
                          title="Ordenar por concepto"
                          style={{ padding: "6px 8px", fontWeight: 800, cursor: "pointer", userSelect: "none" }}
                        >
                          Concepto / Infracción {sortCol === "concepto" ? (sortDir === "asc" ? " ▲" : " ▼") : " ↕"}
                        </th>
                        <th
                          onClick={() => handleSort("importe")}
                          title="Ordenar por importe"
                          style={{ padding: "6px 8px", fontWeight: 800, width: "80px", textAlign: "center", cursor: "pointer", userSelect: "none" }}
                        >
                          Importe {sortCol === "importe" ? (sortDir === "asc" ? " ▲" : " ▼") : " ↕"}
                        </th>
                        <th
                          onClick={() => handleSort("observaciones")}
                          title="Ordenar por observaciones"
                          className={!hasAnyObservation ? "no-print" : ""}
                          style={{ padding: "6px 8px", fontWeight: 800, width: "140px", cursor: "pointer", userSelect: "none" }}
                        >
                          Observaciones {sortCol === "observaciones" ? (sortDir === "asc" ? " ▲" : " ▼") : " ↕"}
                        </th>
                        <th className="no-print" style={{ padding: "6px 8px", fontWeight: 800, width: "75px", textAlign: "center" }}>
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedMultas.map((m, idx) => (
                        <tr
                          key={m.id || idx}
                          style={{
                            borderBottom: "1px solid #e2e8f0",
                            background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
                          }}
                        >
                          <td style={{ padding: "4px 8px", fontWeight: 700, color: "#334155", whiteSpace: "nowrap", textAlign: "center", verticalAlign: "middle" }}>
                            {formatDateDDMM(m.fecha)}
                          </td>
                          <td style={{ padding: "4px 8px", verticalAlign: "middle" }}>
                            <strong style={{ color: "#0f172a", fontSize: "11.5px" }}>{m.jugador_nombre}</strong>
                          </td>
                          <td style={{ padding: "4px 8px", color: "#1e293b", fontSize: "10.5px", lineHeight: 1.2, verticalAlign: "middle" }}>
                            {m.concepto}
                          </td>
                          <td style={{ padding: "4px 8px", fontWeight: 900, color: "#b91c1c", textAlign: "center", verticalAlign: "middle", fontSize: "12px" }}>
                            {m.importe} €
                          </td>
                          <td className={!hasAnyObservation ? "no-print" : ""} style={{ padding: "4px 8px", verticalAlign: "middle" }}>
                            {/* Input editable en pantalla */}
                            <input
                              type="text"
                              value={m.comentario || ""}
                              placeholder="Añadir nota..."
                              onChange={(e) => handleObservationChange(m.id, e.target.value)}
                              className="no-print"
                              style={{
                                width: "130px",
                                maxWidth: "100%",
                                fontSize: "11px",
                                padding: "3px 6px",
                                borderRadius: "4px",
                                border: (m.comentario || "").trim() ? "1px solid #93c5fd" : "1px solid #cbd5e1",
                                background: (m.comentario || "").trim() ? "#eff6ff" : "#ffffff",
                                color: "#0f172a",
                                outline: "none",
                              }}
                            />
                            {/* Texto solo para impresión (si está rellenado) */}
                            {(m.comentario || "").trim() ? (
                              <span className="print-only" style={{ fontSize: "10px", color: "#334155" }}>
                                {m.comentario}
                              </span>
                            ) : null}
                          </td>
                          <td className="no-print" style={{ padding: "4px 8px", textAlign: "center", verticalAlign: "middle" }}>
                            <div style={{ display: "inline-flex", gap: "4px" }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMulta(m);
                                  setEditConcepto(m.concepto);
                                  setEditImporte(m.importe);
                                  setEditCategoria(m.categoria);
                                  setEditComentario(m.comentario || "");
                                }}
                                title="Editar importe o concepto"
                                style={{
                                  background: "#f1f5f9",
                                  border: "1px solid #cbd5e1",
                                  padding: "2px 5px",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "10.5px",
                                }}
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMulta(m.id)}
                                title="Eliminar multa"
                                style={{
                                  background: "#fee2e2",
                                  border: "1px solid #fca5a5",
                                  padding: "2px 5px",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "10.5px",
                                  color: "#b91c1c",
                                }}
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748b" }}>
                  <div style={{ fontSize: "32px", marginBottom: "8px" }}>⚖️</div>
                  <p style={{ margin: "0 0 6px", fontWeight: 800, fontSize: "14px", color: "#1e293b" }}>
                    No hay multas que coincidan con los filtros seleccionados
                  </p>
                  <p style={{ margin: "0 0 16px", fontSize: "12px" }}>
                    Prueba a restablecer los filtros para ver todas las 561 multas de la plantilla o añade una nueva infracción.
                  </p>
                  <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setReportFechaDesde("");
                        setReportFechaHasta("");
                        setFiltroTipoMulta("TODOS");
                        setFiltroJugador("TODOS");
                        setBusqueda("");
                      }}
                      style={{
                        background: "#1e3a8a",
                        color: "#ffffff",
                        padding: "7px 16px",
                        borderRadius: "6px",
                        border: "none",
                        fontSize: "12px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Restablecer Filtros
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddModal(true)}
                      style={{
                        background: "#3b82f6",
                        color: "#ffffff",
                        padding: "7px 16px",
                        borderRadius: "6px",
                        border: "none",
                        fontSize: "12px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      + Añadir Multa Manual
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sección Final: Totales Acumulados por Deportista */}
            {playerRanking.some((p) => p.total > 0) && (
              <div
                className="print-section-totals"
                style={{
                  marginTop: "16px",
                  background: "#ffffff",
                  borderRadius: "10px",
                  border: "1.5px solid #cbd5e1",
                  padding: "12px 16px",
                  pageBreakInside: "avoid",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "2px solid #0f172a",
                    paddingBottom: "6px",
                    marginBottom: "10px",
                  }}
                >
                  <span style={{ fontSize: "12.5px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
                    📊 Resumen de Totales por Deportista
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: 900, color: "#1e3a8a" }}>
                    Total Recaudado: {totalRecaudado} € ({filteredMultas.length} multas)
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
                    gap: "6px 10px",
                    fontSize: "11px",
                  }}
                >
                  {playerRanking
                    .filter((p) => p.total > 0 || p.count > 0)
                    .map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "4px 8px",
                          background: "#f8fafc",
                          borderRadius: "6px",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <span style={{ fontWeight: 800, color: "#0f172a" }}>
                          {p.id === "b6877a25-e6de-48f3-aab3-1ae48a53e317" || p.nombre.toLowerCase().includes("pochito") || p.nombre.toLowerCase().includes("josep lluis") ? "POCHITO" : p.nombre}
                        </span>
                        <span style={{ fontWeight: 900, color: "#b91c1c" }}>
                          {p.total} € <small style={{ fontWeight: 600, color: "#64748b" }}>({p.count} f.)</small>
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PESTAÑA 2: DETECTOR AUTOMÁTICO DE WELLNESS (SHEETS + PLANIF) */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "detector_wellness" && (
          <div>
            {/* Header del Detector */}
            <div
              style={{
                background: "#ffffff",
                padding: "16px 20px",
                borderRadius: "12px",
                border: "1px solid #cbd5e1",
                boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                marginBottom: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "3px" }}>
                    📅 Fecha del Cuestionario Wellness
                  </label>
                  <input
                    type="date"
                    value={wellnessDate}
                    onChange={(e) => setWellnessDate(e.target.value)}
                    style={{
                      fontSize: "13px",
                      fontWeight: 800,
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: "1.5px solid #3b82f6",
                      background: "#eff6ff",
                      color: "#1e3a8a",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Indicador de Estado de Planificación en esa fecha */}
                <div style={{ marginTop: "16px" }}>
                  {wellnessAnalysis.isMatchDay ? (
                    <span style={{ fontSize: "12px", fontWeight: 800, color: "#1e40af", background: "#dbeafe", border: "1px solid #93c5fd", padding: "5px 12px", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      🏟️ Día de Partido {wellnessAnalysis.matchDetails} (Deportistas exentos de multas Wellness)
                    </span>
                  ) : wellnessAnalysis.hasCoOrOp ? (
                    <span style={{ fontSize: "12px", fontWeight: 800, color: "#15803d", background: "#dcfce7", border: "1px solid #86efac", padding: "5px 12px", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      ✓ Día con sesión Coadyuvante/Optimizador ({wellnessAnalysis.eventNames.join(", ") || "Co/Op"})
                    </span>
                  ) : (
                    <span style={{ fontSize: "12px", fontWeight: 800, color: "#b45309", background: "#fef3c7", border: "1px solid #fde68a", padding: "5px 12px", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      🏖️ Sin sesión Co o Op en Planificación (Deportistas exentos de multa)
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleSyncWellness}
                  disabled={isSyncing}
                  style={{
                    background: isSyncing ? "#94a3b8" : "#15803d",
                    color: "#ffffff",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    fontSize: "12.5px",
                    fontWeight: 800,
                    cursor: isSyncing ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {isSyncing ? "⏳ Sincronizando..." : "🔄 Sincronizar Google Sheets"}
                </button>

                <button
                  type="button"
                  onClick={handleApplyAutoMultas}
                  disabled={!wellnessAnalysis.hasCoOrOp || wellnessAnalysis.isMatchDay || (wellnessAnalysis.countTarde === 0 && wellnessAnalysis.countNoResp === 0)}
                  style={{
                    background:
                      !wellnessAnalysis.hasCoOrOp || wellnessAnalysis.isMatchDay || (wellnessAnalysis.countTarde === 0 && wellnessAnalysis.countNoResp === 0)
                        ? "#cbd5e1"
                        : "linear-gradient(135deg, #1e3a8a, #2563eb)",
                    color: "#ffffff",
                    border: "none",
                    padding: "8px 18px",
                    borderRadius: "8px",
                    fontSize: "12.5px",
                    fontWeight: 800,
                    cursor:
                      !wellnessAnalysis.hasCoOrOp || wellnessAnalysis.isMatchDay || (wellnessAnalysis.countTarde === 0 && wellnessAnalysis.countNoResp === 0)
                        ? "not-allowed"
                        : "pointer",
                    boxShadow: "0 2px 6px rgba(30,58,138,0.25)",
                  }}
                >
                  ⚡ Registrar e Incorporar Multas
                </button>
              </div>
            </div>

            {/* Mensaje de estado de sync */}
            {syncStatus && (
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: syncStatus.isError ? "#dc2626" : "#15803d",
                  background: syncStatus.isError ? "#fef2f2" : "#f0fdf4",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: `1px solid ${syncStatus.isError ? "#fecaca" : "#bbf7d0"}`,
                  marginBottom: "16px",
                }}
              >
                {syncStatus.message}
              </div>
            )}

            {/* Reglas explicadas claramente */}
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "12px 16px",
                marginBottom: "16px",
                fontSize: "12px",
                color: "#334155",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "10px",
              }}
            >
              <div>
                <strong style={{ color: "#1e3a8a", display: "block" }}>⏰ Límite de Entrega: 12:30h</strong>
                <span>Se lee de la Columna I (Hora). Envíos ≥ 12:30h se marcan automáticamente como tarde.</span>
              </div>
              <div>
                <strong style={{ color: "#b91c1c", display: "block" }}>❌ No Realizado</strong>
                <span>Deportistas de la plantilla activa sin registro en el día con evento asignado.</span>
              </div>
              <div>
                <strong style={{ color: "#1e40af", display: "block" }}>🏟️ Regla Días de Partido</strong>
                <span>Los días de partido no se multa por no hacer el wellness o enviarlo tarde.</span>
              </div>
              <div>
                <strong style={{ color: "#15803d", display: "block" }}>🏋️ Regla Sesiones Co / Op</strong>
                <span>Solo se multan días con eventos Coadyuvante (Co) u Optimizador (Op). Días libres o sin Co/Op están exentos.</span>
              </div>
            </div>

            {/* Tabla de Resultados por Jugador Real */}
            <div
              style={{
                background: "#ffffff",
                borderRadius: "12px",
                border: "1px solid #cbd5e1",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                overflow: "hidden",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                <thead>
                  <tr style={{ background: "#0f172a", color: "#ffffff", textAlign: "left" }}>
                    <th style={{ padding: "10px 14px", width: "40px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={wellnessAnalysis.rows.some((r) => r.isChecked)}
                        onChange={(e) => {
                          const next: Record<string, boolean> = {};
                          wellnessAnalysis.rows.forEach((r) => {
                            next[r.uniqueKey] = e.target.checked;
                          });
                          setCheckedAutoMultas((prev) => ({ ...prev, ...next }));
                        }}
                      />
                    </th>
                    <th style={{ padding: "10px 14px", fontWeight: 800 }}>Deportista</th>
                    <th style={{ padding: "10px 14px", fontWeight: 800, width: "130px" }}>Hora Entrega (Col. I)</th>
                    <th style={{ padding: "10px 14px", fontWeight: 800, width: "150px" }}>Estado Detectado</th>
                    <th style={{ padding: "10px 14px", fontWeight: 800 }}>Motivo de la Infracción</th>
                    <th style={{ padding: "10px 14px", fontWeight: 800, width: "100px", textAlign: "right" }}>Importe (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {wellnessAnalysis.rows.map((row, idx) => (
                    <tr
                      key={row.uniqueKey || idx}
                      style={{
                        borderBottom: "1px solid #e2e8f0",
                        background:
                          row.status === "TARDE"
                            ? "#fffbeb"
                            : row.status === "NO_REALIZADO"
                            ? "#fef2f2"
                            : row.status === "EXENTO"
                            ? "#f8fafc"
                            : "#ffffff",
                      }}
                    >
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={row.isChecked}
                          disabled={row.status === "OK" || row.status === "EXENTO"}
                          onChange={(e) => {
                            setCheckedAutoMultas((prev) => ({
                              ...prev,
                              [row.uniqueKey]: e.target.checked,
                            }));
                          }}
                        />
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <strong style={{ color: "#0f172a" }}>{(row.jugador.apodo || row.jugador.nombre || "").toUpperCase()}</strong>
                        {row.jugador.apodo && <small style={{ color: "#64748b", marginLeft: "4px" }}>({row.jugador.apodo})</small>}
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: row.status === "TARDE" ? "#b45309" : "#334155" }}>
                        {row.horaTexto}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {row.status === "OK" ? (
                          <span style={{ fontSize: "11px", fontWeight: 800, color: "#15803d", background: "#dcfce7", padding: "2px 8px", borderRadius: "4px" }}>
                            ✓ A Tiempo
                          </span>
                        ) : row.status === "TARDE" ? (
                          <span style={{ fontSize: "11px", fontWeight: 800, color: "#b45309", background: "#fef3c7", padding: "2px 8px", borderRadius: "4px" }}>
                            ⚠️ Tarde (&gt;12:30h)
                          </span>
                        ) : row.status === "NO_REALIZADO" ? (
                          <span style={{ fontSize: "11px", fontWeight: 800, color: "#b91c1c", background: "#fee2e2", padding: "2px 8px", borderRadius: "4px" }}>
                            ❌ No Realizado
                          </span>
                        ) : (
                          <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: "4px" }}>
                            🏖️ Exento (Descanso)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <input
                          type="text"
                          value={row.motivo}
                          disabled={row.status === "OK" || row.status === "EXENTO"}
                          onChange={(e) => {
                            setCustomComentarios((prev) => ({
                              ...prev,
                              [row.uniqueKey]: e.target.value,
                            }));
                          }}
                          style={{
                            width: "100%",
                            fontSize: "12px",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            background: row.status === "OK" || row.status === "EXENTO" ? "transparent" : "#ffffff",
                          }}
                        />
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        <input
                          type="number"
                          value={row.importe}
                          disabled={row.status === "OK" || row.status === "EXENTO"}
                          onChange={(e) => {
                            setCustomImportes((prev) => ({
                              ...prev,
                              [row.uniqueKey]: Number(e.target.value) || 0,
                            }));
                          }}
                          style={{
                            width: "70px",
                            fontSize: "12.5px",
                            fontWeight: 800,
                            padding: "4px 8px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            textAlign: "right",
                            color: row.importe > 0 ? "#b91c1c" : "#334155",
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PESTAÑA 3: RESUMEN Y RANKING POR DEPORTISTA                   */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "ranking" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                flexWrap: "wrap",
                gap: "10px",
                background: "#ffffff",
                padding: "14px 18px",
                borderRadius: "12px",
                border: "1px solid #cbd5e1",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#0f172a" }}>
                  📊 Resumen Económico y Acumulado por Deportista
                </h3>
                <small style={{ color: "#64748b" }}>
                  {resumenPorJugador.length} jugadores con multas de {todosJugadores.length} plantilla | Total: {totalRecaudado}€
                </small>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "14px",
              }}
            >
              {playerRanking.map((p, idx) => (
                <div
                  key={p.id || idx}
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    border: `1.5px solid ${p.total > 0 ? "#fca5a5" : "#e2e8f0"}`,
                    padding: "16px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "50%",
                            background: idx === 0 && p.total > 0 ? "#ef4444" : "#1e3a8a",
                            color: "#ffffff",
                            fontSize: "12px",
                            fontWeight: 900,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {idx + 1}
                        </span>
                        <div>
                          <strong style={{ fontSize: "14px", color: "#0f172a", display: "block" }}>{(p.apodo || p.nombre || "").toUpperCase()}</strong>
                          {p.apodo && <small style={{ color: "#64748b" }}>{p.apodo}</small>}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "18px", fontWeight: 900, color: p.total > 0 ? "#b91c1c" : "#15803d" }}>
                          {p.total} €
                        </div>
                        <small style={{ color: "#64748b", fontSize: "11px" }}>{p.count} infracciones</small>
                      </div>
                    </div>

                    {p.multas.length > 0 && (
                      <div style={{ marginTop: "10px", borderTop: "1px solid #f1f5f9", paddingTop: "8px" }}>
                        <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Últimas faltas:</span>
                        <ul style={{ margin: "4px 0 0", paddingLeft: "16px", fontSize: "11.5px", color: "#334155" }}>
                          {p.multas.slice(0, 3).map((m, mIdx) => (
                            <li key={m.id || mIdx} style={{ marginBottom: "2px" }}>
                              {m.fecha}: <strong>{m.concepto}</strong> ({m.importe}€)
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PESTAÑA 4: CATÁLOGO DE TIPOS DE MULTA & PRECIOS BASE         */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "catalogo_tipos" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#0f172a" }}>
                  ⚖️ Catálogo de Tipos de Multa y Baremos
                </h3>
                <small style={{ color: "#64748b" }}>Define los precios base y conceptos sancionables de la plantilla</small>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingTipoMulta(null);
                  setTipoFormTitulo("");
                  setTipoFormDescripcion("");
                  setTipoFormImporte(5);
                  setTipoFormCategoria("Preparación Física");
                  setTipoFormIcon("⚠️");
                  setShowTipoMultaModal(true);
                }}
                style={{
                  fontSize: "12.5px",
                  fontWeight: 800,
                  color: "#ffffff",
                  background: "#1e3a8a",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                + Crear Nuevo Tipo de Multa
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: "14px",
              }}
            >
              {tiposMultaCatalogo.map((tipo) => (
                <div
                  key={tipo.id}
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    border: "1px solid #cbd5e1",
                    padding: "16px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "22px" }}>{tipo.icon}</span>
                        <div>
                          <strong style={{ fontSize: "14px", color: "#0f172a", display: "block" }}>{tipo.titulo}</strong>
                          <span
                            style={{
                              fontSize: "10.5px",
                              fontWeight: 800,
                              color: "#1e3a8a",
                              background: "#eff6ff",
                              padding: "1px 6px",
                              borderRadius: "4px",
                            }}
                          >
                            {tipo.categoria}
                          </span>
                        </div>
                      </div>

                      <div style={{ fontSize: "18px", fontWeight: 900, color: "#b91c1c" }}>
                        {tipo.importe} €
                      </div>
                    </div>

                    <p style={{ margin: "8px 0 12px", fontSize: "12px", color: "#64748b" }}>
                      {tipo.descripcion}
                    </p>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", borderTop: "1px solid #f1f5f9", paddingTop: "8px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTipoMulta(tipo);
                        setTipoFormTitulo(tipo.titulo);
                        setTipoFormDescripcion(tipo.descripcion);
                        setTipoFormImporte(tipo.importe);
                        setTipoFormCategoria(tipo.categoria);
                        setTipoFormIcon(tipo.icon);
                        setShowTipoMultaModal(true);
                      }}
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#1e3a8a",
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        padding: "4px 10px",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      ✏️ Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`¿Eliminar el tipo de multa "${tipo.titulo}"?`)) {
                          saveTiposCatalogo(tiposMultaCatalogo.filter((t) => t.id !== tipo.id));
                        }
                      }}
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#dc2626",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        padding: "4px 10px",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      🗑️ Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* MODAL: AÑADIR MULTA MANUAL AL INFORME                         */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {showAddModal && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15, 23, 42, 0.6)",
              backdropFilter: "blur(4px)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
            }}
            onClick={() => setShowAddModal(false)}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: "14px",
                border: "1px solid #cbd5e1",
                boxShadow: "0 20px 30px -5px rgba(0, 0, 0, 0.3)",
                width: "520px",
                maxWidth: "95vw",
                overflow: "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ background: "#0f172a", color: "#ffffff", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 900 }}>+ Añadir Multa al Registro</h3>
                <button type="button" onClick={() => setShowAddModal(false)} style={{ background: "transparent", border: "none", color: "#cbd5e1", fontSize: "16px", cursor: "pointer" }}>✕</button>
              </div>

              <form onSubmit={handleAddMultaSubmit} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                    🏃 Deportista Registrado
                  </label>
                  <select
                    value={addJugadorId}
                    onChange={(e) => setAddJugadorId(e.target.value)}
                    required
                    style={{ width: "100%", fontSize: "13px", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc" }}
                  >
                    <option value="" disabled>Selecciona deportista...</option>
                    {todosJugadores.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.dorsal ? `#${j.dorsal} ` : ""}{(j.apodo || j.nombre || "").toUpperCase()} {j.apodo ? `(${j.apodo})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                      📅 Fecha de la Infracción
                    </label>
                    <input
                      type="date"
                      value={addFecha}
                      onChange={(e) => setAddFecha(e.target.value)}
                      required
                      style={{ width: "100%", fontSize: "12.5px", padding: "7px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                      ⚖️ Tipo Predefinido
                    </label>
                    <select
                      value={addTipoId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAddTipoId(val);
                        const match = tiposMultaCatalogo.find((t) => t.id === val);
                        if (match) {
                          setAddConcepto(match.titulo);
                          setAddImporte(match.importe);
                          setAddCategoria(match.categoria);
                        }
                      }}
                      style={{ width: "100%", fontSize: "12.5px", padding: "7px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    >
                      <option value="">Personalizado...</option>
                      {tiposMultaCatalogo.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.icon} {t.titulo} ({t.importe}€)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                    Concepto / Motivo de la Multa
                  </label>
                  <input
                    type="text"
                    value={addConcepto}
                    onChange={(e) => setAddConcepto(e.target.value)}
                    placeholder="Ej: Cuestionario Wellness (>12:30h), Retraso gimnasio..."
                    required
                    style={{ width: "100%", fontSize: "12.5px", padding: "7px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                      Importe (€)
                    </label>
                    <input
                      type="number"
                      value={addImporte}
                      onChange={(e) => setAddImporte(Number(e.target.value) || 0)}
                      required
                      min={0}
                      style={{ width: "100%", fontSize: "12.5px", fontWeight: 800, padding: "7px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                      Categoría
                    </label>
                    <select
                      value={addCategoria}
                      onChange={(e) => setAddCategoria(e.target.value as any)}
                      style={{ width: "100%", fontSize: "12.5px", padding: "7px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    >
                      <option value="Preparación Física">Preparación Física</option>
                      <option value="Vestuario">Vestuario</option>
                      <option value="Médico / Fisioterapia">Médico / Fisioterapia</option>
                      <option value="Nutrición">Nutrición</option>
                      <option value="Técnico / Táctico">Técnico / Táctico</option>
                      <option value="Otros">Otros</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                    Observaciones (Opcional)
                  </label>
                  <textarea
                    value={addComentario}
                    onChange={(e) => setAddComentario(e.target.value)}
                    placeholder="Detalles adicionales opcionales..."
                    rows={2}
                    style={{ width: "100%", fontSize: "12px", padding: "7px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", background: "#f1f5f9", padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{ fontSize: "12px", fontWeight: 800, color: "#ffffff", background: "#1e3a8a", padding: "8px 20px", borderRadius: "8px", border: "none", cursor: "pointer" }}
                  >
                    Guardar Multa
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* MODAL: EDITAR MULTA EXISTENTE                                 */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {editingMulta && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15, 23, 42, 0.6)",
              backdropFilter: "blur(4px)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
            }}
            onClick={() => setEditingMulta(null)}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: "14px",
                border: "1px solid #cbd5e1",
                boxShadow: "0 20px 30px -5px rgba(0, 0, 0, 0.3)",
                width: "480px",
                maxWidth: "95vw",
                overflow: "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ background: "#0f172a", color: "#ffffff", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 900 }}>✏️ Editar Multa — {editingMulta.jugador_nombre}</h3>
                <button type="button" onClick={() => setEditingMulta(null)} style={{ background: "transparent", border: "none", color: "#cbd5e1", fontSize: "16px", cursor: "pointer" }}>✕</button>
              </div>

              <form onSubmit={handleSaveEditMulta} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                    Concepto / Infracción
                  </label>
                  <input
                    type="text"
                    value={editConcepto}
                    onChange={(e) => setEditConcepto(e.target.value)}
                    required
                    style={{ width: "100%", fontSize: "12.5px", padding: "7px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                      Importe (€)
                    </label>
                    <input
                      type="number"
                      value={editImporte}
                      onChange={(e) => setEditImporte(Number(e.target.value) || 0)}
                      required
                      min={0}
                      style={{ width: "100%", fontSize: "12.5px", fontWeight: 800, padding: "7px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                      Categoría
                    </label>
                    <select
                      value={editCategoria}
                      onChange={(e) => setEditCategoria(e.target.value as any)}
                      style={{ width: "100%", fontSize: "12.5px", padding: "7px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    >
                      <option value="Preparación Física">Preparación Física</option>
                      <option value="Vestuario">Vestuario</option>
                      <option value="Médico / Fisioterapia">Médico / Fisioterapia</option>
                      <option value="Nutrición">Nutrición</option>
                      <option value="Técnico / Táctico">Técnico / Táctico</option>
                      <option value="Otros">Otros</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>
                    Observaciones (Opcional)
                  </label>
                  <textarea
                    value={editComentario}
                    onChange={(e) => setEditComentario(e.target.value)}
                    rows={2}
                    style={{ width: "100%", fontSize: "12px", padding: "7px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setEditingMulta(null)}
                    style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", background: "#f1f5f9", padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{ fontSize: "12px", fontWeight: 800, color: "#ffffff", background: "#1e3a8a", padding: "8px 20px", borderRadius: "8px", border: "none", cursor: "pointer" }}
                  >
                    Guardar Cambios
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* MODAL: CREAR / EDITAR TIPO DE MULTA EN CATÁLOGO              */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {showTipoMultaModal && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15, 23, 42, 0.6)",
              backdropFilter: "blur(4px)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
            }}
            onClick={() => setShowTipoMultaModal(false)}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: "14px",
                border: "1px solid #cbd5e1",
                boxShadow: "0 20px 30px -5px rgba(0, 0, 0, 0.3)",
                width: "480px",
                maxWidth: "95vw",
                overflow: "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ background: "#0f172a", color: "#ffffff", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 900 }}>
                  {editingTipoMulta ? "✏️ Editar Tipo de Multa" : "+ Nuevo Tipo de Multa"}
                </h3>
                <button type="button" onClick={() => setShowTipoMultaModal(false)} style={{ background: "transparent", border: "none", color: "#cbd5e1", fontSize: "16px", cursor: "pointer" }}>✕</button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!tipoFormTitulo.trim()) return;

                  if (editingTipoMulta) {
                    const updated = tiposMultaCatalogo.map((t) => {
                      if (t.id === editingTipoMulta.id) {
                        return {
                          ...t,
                          titulo: tipoFormTitulo.trim(),
                          descripcion: tipoFormDescripcion.trim(),
                          importe: Number(tipoFormImporte) || 0,
                          categoria: tipoFormCategoria,
                          icon: tipoFormIcon,
                        };
                      }
                      return t;
                    });
                    saveTiposCatalogo(updated);
                  } else {
                    const newType: TipoMultaConfig = {
                      id: `tm_${Date.now()}`,
                      titulo: tipoFormTitulo.trim(),
                      descripcion: tipoFormDescripcion.trim(),
                      importe: Number(tipoFormImporte) || 0,
                      categoria: tipoFormCategoria,
                      icon: tipoFormIcon,
                    };
                    saveTiposCatalogo([...tiposMultaCatalogo, newType]);
                  }
                  setShowTipoMultaModal(false);
                }}
                style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "12px" }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>Icono</label>
                    <input
                      type="text"
                      value={tipoFormIcon}
                      onChange={(e) => setTipoFormIcon(e.target.value)}
                      style={{ width: "100%", fontSize: "16px", textAlign: "center", padding: "6px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>Nombre del Tipo</label>
                    <input
                      type="text"
                      value={tipoFormTitulo}
                      onChange={(e) => setTipoFormTitulo(e.target.value)}
                      placeholder="Ej: Retraso Gimnasio"
                      required
                      style={{ width: "100%", fontSize: "12.5px", padding: "7px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>Importe Base (€)</label>
                    <input
                      type="number"
                      value={tipoFormImporte}
                      onChange={(e) => setTipoFormImporte(Number(e.target.value) || 0)}
                      required
                      min={0}
                      style={{ width: "100%", fontSize: "12.5px", fontWeight: 800, padding: "7px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>Categoría</label>
                    <select
                      value={tipoFormCategoria}
                      onChange={(e) => setTipoFormCategoria(e.target.value as any)}
                      style={{ width: "100%", fontSize: "12.5px", padding: "7px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    >
                      <option value="Preparación Física">Preparación Física</option>
                      <option value="Vestuario">Vestuario</option>
                      <option value="Médico / Fisioterapia">Médico / Fisioterapia</option>
                      <option value="Nutrición">Nutrición</option>
                      <option value="Técnico / Táctico">Técnico / Táctico</option>
                      <option value="Otros">Otros</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", display: "block", marginBottom: "4px" }}>Descripción / Supuesto</label>
                  <textarea
                    value={tipoFormDescripcion}
                    onChange={(e) => setTipoFormDescripcion(e.target.value)}
                    placeholder="Cuándo y cómo se aplica esta infracción..."
                    rows={2}
                    style={{ width: "100%", fontSize: "12px", padding: "7px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setShowTipoMultaModal(false)}
                    style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", background: "#f1f5f9", padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{ fontSize: "12px", fontWeight: 800, color: "#ffffff", background: "#1e3a8a", padding: "8px 20px", borderRadius: "8px", border: "none", cursor: "pointer" }}
                  >
                    Guardar Tipo
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
