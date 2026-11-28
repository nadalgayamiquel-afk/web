"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  CampoEjercicio,
  CampoSesionFicha,
  CampoCategoriaEjercicio,
  CampoSesionBloqueItem,
  BENCHMARKS_CATEGORIA_DEFECTO,
  TARGETS_MICROCICLO_MD,
  CampoDiagramaData,
} from "./campo-types";
import EjercicioModal from "./EjercicioModal";
import EjercicioDetailModal from "./EjercicioDetailModal";
import VideoPlayerModal from "./VideoPlayerModal";
import TacticalPitchDesigner from "./TacticalPitchDesigner";
import SesionFichaManager from "./SesionFichaManager";
import CalculadoraCarga from "./CalculadoraCarga";
import SesionGpsAnalysis from "./SesionGpsAnalysis";
import { getVideoEmbedInfo } from "./campo-video-utils";
import {
  getActiveJugadores,
  getCampoEjerciciosServer,
  saveCampoEjerciciosServer,
  getCampoSesionesServer,
  saveCampoSesionesServer,
} from "@/app/actions";

const EJERCICIOS_STORAGE_KEY = "campo_ejercicios_v2";
const SESIONES_STORAGE_KEY = "campo_sesiones_v2";

export const CATEGORIAS_LIST: Array<{
  id: CampoCategoriaEjercicio;
  label: string;
  icon: string;
  color: string;
}> = [
  { id: "RONDO", label: "Rondos & Ruedas", icon: "🔄", color: "#3b82f6" },
  { id: "POSESION", label: "Juegos de Posición", icon: "🛡️", color: "#10b981" },
  { id: "SSG_REDUCIDO", label: "Espacio Reducido (SSG)", icon: "⚡", color: "#f59e0b" },
  { id: "LSG_AMPLIO", label: "Espacio Amplio (LSG)", icon: "📐", color: "#8b5cf6" },
  { id: "FINALIZACION", label: "Finalizaciones", icon: "🎯", color: "#ef4444" },
  { id: "ABP", label: "Balón Parado (ABP)", icon: "⛳", color: "#06b6d4" },
  { id: "TRANSICION", label: "Transiciones Rápidas", icon: "🚀", color: "#ec4899" },
  { id: "FISICO_TECNICO", label: "Físico - Técnico", icon: "🏃", color: "#6366f1" },
  { id: "CALENTAMIENTO", label: "Calentamiento & Activación", icon: "🔥", color: "#f97316" },
  { id: "OTRO", label: "Otros Ejercicios", icon: "⚽", color: "#64748b" },
];

// Ejercicios oficiales de referencia iniciales (diseñados tácticamente)
const EJERCICIOS_BASE_INICIALES: CampoEjercicio[] = [
  {
    id: "ej-def-1",
    nombre: "Rondo de Presión Tras Pérdida 4v4 + 3C",
    categoria: "RONDO",
    subcategoria: "MD-3 Potencia",
    faseJuego: "TRANSICION_DEF",
    videoUrl: "https://www.youtube.com/watch?v=kY7iQWJc1hE",
    dimensiones: { largoM: 25, anchoM: 20, m2Totales: 500, m2PorJugador: 45.5 },
    jugadores: { atacantes: 4, defensores: 4, comodines: 3, porteros: 0, total: 11 },
    estructura: { series: 4, repsPorSerie: 1, tiempoTrabajoSeg: 210, tiempoDescansoSeg: 90, tiempoTotalMin: 14, ratioWR: "2.3:1" },
    consignas: {
      objetivoPrincipal: "Acoso inmediato tras pérdida y fijación de comodín interior en zona activa.",
      objetivoSecundario: "Orientación corporal y perfiles para pase de seguridad.",
      reglasProvocacion: "Máximo 2 toques por jugador. Tras 6 pases seguidos, cambio de orientación obligatorio.",
      descripcion: "Rondo dinámico en espacio comprimido con 3 comodines interiores/exteriores.",
      materialNecesario: "12 conos naranjas, 8 petos azules, 6 balones, 3 petos amarillos.",
    },
    perfilGps: { ...BENCHMARKS_CATEGORIA_DEFECTO.RONDO },
    diagrama: {
      pitchType: "reducido",
      elementos: [
        { id: "p1", tipo: "jugador_a", x: 25, y: 30, color: "#ef4444", label: "4" },
        { id: "p2", tipo: "jugador_a", x: 25, y: 70, color: "#ef4444", label: "5" },
        { id: "p3", tipo: "jugador_a", x: 75, y: 30, color: "#ef4444", label: "8" },
        { id: "p4", tipo: "jugador_a", x: 75, y: 70, color: "#ef4444", label: "10" },
        { id: "p5", tipo: "jugador_b", x: 40, y: 40, color: "#3b82f6", label: "6" },
        { id: "p6", tipo: "jugador_b", x: 60, y: 40, color: "#3b82f6", label: "7" },
        { id: "p7", tipo: "jugador_b", x: 40, y: 60, color: "#3b82f6", label: "9" },
        { id: "p8", tipo: "jugador_b", x: 60, y: 60, color: "#3b82f6", label: "11" },
        { id: "c1", tipo: "comodin", x: 50, y: 50, color: "#eab308", label: "C" },
        { id: "b1", tipo: "balon", x: 48, y: 46 },
      ],
      trazosLibres: [],
    },
    creadoEn: "2026-11-10T10:00:00Z",
    actualizadoEn: "2026-11-10T10:00:00Z",
    autor: "Cuerpo Técnico",
  },
  {
    id: "ej-def-2",
    nombre: "Juego de Posición 6v6 + 2 Comodines con 2 Zonas",
    categoria: "POSESION",
    subcategoria: "MD-4 Capacidad",
    faseJuego: "ATAQUE",
    videoUrl: "https://www.youtube.com/watch?v=3q-v_q6F3jE",
    dimensiones: { largoM: 45, anchoM: 38, m2Totales: 1710, m2PorJugador: 122 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 2, porteros: 0, total: 14 },
    estructura: { series: 3, repsPorSerie: 1, tiempoTrabajoSeg: 360, tiempoDescansoSeg: 120, tiempoTotalMin: 18, ratioWR: "3:1" },
    consignas: {
      objetivoPrincipal: "Atraer en sector izquierdo para liberar alejado al comodín en banda contraria.",
      reglasProvocacion: "Pase al comodín de lado opuesto puntúa doble si supera línea de presión intermedia.",
      descripcion: "Juego posicional en dos mitades con progresión estructurada.",
      materialNecesario: "16 setas rojas, 10 petos blancos, 10 petos verdes, 8 balones.",
    },
    perfilGps: { ...BENCHMARKS_CATEGORIA_DEFECTO.POSESION },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "p1", tipo: "jugador_a", x: 20, y: 35, color: "#10b981", label: "2" },
        { id: "p2", tipo: "jugador_a", x: 30, y: 65, color: "#10b981", label: "5" },
        { id: "p3", tipo: "jugador_a", x: 50, y: 45, color: "#10b981", label: "8" },
        { id: "p4", tipo: "jugador_a", x: 70, y: 30, color: "#10b981", label: "7" },
        { id: "p5", tipo: "jugador_a", x: 65, y: 70, color: "#10b981", label: "9" },
        { id: "p6", tipo: "jugador_a", x: 80, y: 50, color: "#10b981", label: "11" },
        { id: "p7", tipo: "jugador_b", x: 25, y: 50, color: "#64748b", label: "9" },
        { id: "p8", tipo: "jugador_b", x: 45, y: 35, color: "#64748b", label: "10" },
        { id: "p9", tipo: "jugador_b", x: 55, y: 60, color: "#64748b", label: "6" },
        { id: "p10", tipo: "jugador_b", x: 75, y: 40, color: "#64748b", label: "4" },
        { id: "c1", tipo: "comodin", x: 15, y: 80, color: "#eab308", label: "C1" },
        { id: "c2", tipo: "comodin", x: 85, y: 20, color: "#eab308", label: "C2" },
        { id: "b1", tipo: "balon", x: 48, y: 47 },
      ],
      trazosLibres: [],
    },
    creadoEn: "2026-11-12T11:00:00Z",
    actualizadoEn: "2026-11-12T11:00:00Z",
    autor: "Cuerpo Técnico",
  },
  {
    id: "ej-def-3",
    nombre: "Partido Reducido 5v5 + Porteros con Porterías Grandes",
    categoria: "SSG_REDUCIDO",
    subcategoria: "MD-3 Potencia",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 32, m2Totales: 1280, m2PorJugador: 106.6 },
    jugadores: { atacantes: 5, defensores: 5, comodines: 0, porteros: 2, total: 12 },
    estructura: { series: 4, repsPorSerie: 1, tiempoTrabajoSeg: 240, tiempoDescansoSeg: 120, tiempoTotalMin: 16, ratioWR: "2:1" },
    consignas: {
      objetivoPrincipal: "Defensa de intervalos y remates rápidos con menos de 3 segundos en área.",
      reglasProvocacion: "Gol de primera vale doble. Transición tras robo con finalización en menos de 8 segundos.",
      descripcion: "Partido en espacio reducido con porterías reglamentarias.",
      materialNecesario: "2 porterías reglamentarias, 10 petos, 12 balones.",
    },
    perfilGps: { ...BENCHMARKS_CATEGORIA_DEFECTO.SSG_REDUCIDO },
    diagrama: {
      pitchType: "area_penalti",
      elementos: [
        { id: "gk1", tipo: "portero", x: 10, y: 50, color: "#065f46", label: "1" },
        { id: "gk2", tipo: "portero", x: 90, y: 50, color: "#065f46", label: "13" },
        { id: "p1", tipo: "jugador_a", x: 30, y: 35, color: "#dc2626", label: "3" },
        { id: "p2", tipo: "jugador_a", x: 35, y: 65, color: "#dc2626", label: "5" },
        { id: "p3", tipo: "jugador_a", x: 55, y: 40, color: "#dc2626", label: "8" },
        { id: "p4", tipo: "jugador_b", x: 70, y: 30, color: "#2563eb", label: "7" },
        { id: "p5", tipo: "jugador_b", x: 68, y: 70, color: "#2563eb", label: "9" },
        { id: "b1", tipo: "balon", x: 50, y: 48 },
      ],
      trazosLibres: [],
    },
    creadoEn: "2026-11-13T12:00:00Z",
    actualizadoEn: "2026-11-13T12:00:00Z",
    autor: "Cuerpo Técnico",
  },
  {
    id: "ej-def-4",
    nombre: "Circuito de Velocidad, Duelos 1v1 y Golpeo",
    categoria: "FISICO_TECNICO",
    subcategoria: "MD-2 Velocidad",
    faseJuego: "TRANSICION_OF",
    dimensiones: { largoM: 35, anchoM: 25, m2Totales: 875, m2PorJugador: 145.8 },
    jugadores: { atacantes: 6, defensores: 0, comodines: 0, porteros: 1, total: 7 },
    estructura: { series: 2, repsPorSerie: 4, tiempoTrabajoSeg: 300, tiempoDescansoSeg: 180, tiempoTotalMin: 10, ratioWR: "1:4" },
    consignas: {
      objetivoPrincipal: "Sprint reactivo a estímulo visual, cambio de dirección de 90° y finalización cruzada.",
      reglasProvocacion: "Máxima velocidad obligatoria. Descanso completo entre repeticiones individuales.",
      descripcion: "Circuito neuromuscular con cambios de dirección y golpeo a portería.",
      materialNecesario: "8 picas, 6 vallas bajas, 1 portería, 10 balones.",
    },
    perfilGps: { ...BENCHMARKS_CATEGORIA_DEFECTO.FISICO_TECNICO },
    diagrama: {
      pitchType: "area_penalti",
      elementos: [
        { id: "gk", tipo: "portero", x: 10, y: 50, color: "#065f46", label: "1" },
        { id: "c1", tipo: "cono", x: 40, y: 30, color: "#f97316" },
        { id: "c2", tipo: "cono", x: 55, y: 30, color: "#f97316" },
        { id: "c3", tipo: "cono", x: 70, y: 40, color: "#f97316" },
        { id: "p1", tipo: "jugador_a", x: 85, y: 40, color: "#1e3a8a", label: "7" },
        { id: "b1", tipo: "balon", x: 80, y: 42 },
      ],
      trazosLibres: [],
    },
    creadoEn: "2026-11-14T09:00:00Z",
    actualizadoEn: "2026-11-14T09:00:00Z",
    autor: "Preparación Física",
  },
  {
    id: "ej-def-5",
    nombre: "Estructurado 10v10 Campo Completo",
    categoria: "LSG_AMPLIO",
    subcategoria: "MD-4 Táctica Colectiva",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 105, anchoM: 68, m2Totales: 7140, m2PorJugador: 324.5 },
    jugadores: { atacantes: 10, defensores: 10, comodines: 0, porteros: 2, total: 22 },
    estructura: { series: 2, repsPorSerie: 1, tiempoTrabajoSeg: 720, tiempoDescansoSeg: 180, tiempoTotalMin: 24, ratioWR: "4:1" },
    consignas: {
      objetivoPrincipal: "Basculación compacta ante cambios de frente y achique hacia campo contrario.",
      reglasProvocacion: "Juego real con reinicios desde saque de banda y saques de meta.",
      descripcion: "Partido de 10v10 en dimensiones oficiales para trabajo de bloque y distancia total.",
      materialNecesario: "22 petos, 2 porterías, 15 balones.",
    },
    perfilGps: { ...BENCHMARKS_CATEGORIA_DEFECTO.LSG_AMPLIO },
    diagrama: {
      pitchType: "completo_horizontal",
      elementos: [
        { id: "gk1", tipo: "portero", x: 6, y: 50, color: "#065f46", label: "1" },
        { id: "gk2", tipo: "portero", x: 94, y: 50, color: "#065f46", label: "13" },
        { id: "p1", tipo: "jugador_a", x: 22, y: 25, color: "#1e3a8a", label: "2" },
        { id: "p2", tipo: "jugador_a", x: 20, y: 42, color: "#1e3a8a", label: "4" },
        { id: "p3", tipo: "jugador_a", x: 20, y: 58, color: "#1e3a8a", label: "5" },
        { id: "p4", tipo: "jugador_a", x: 22, y: 75, color: "#1e3a8a", label: "3" },
        { id: "p5", tipo: "jugador_a", x: 38, y: 50, color: "#1e3a8a", label: "6" },
        { id: "p6", tipo: "jugador_a", x: 50, y: 35, color: "#1e3a8a", label: "8" },
        { id: "p7", tipo: "jugador_a", x: 50, y: 65, color: "#1e3a8a", label: "10" },
        { id: "p8", tipo: "jugador_a", x: 65, y: 20, color: "#1e3a8a", label: "7" },
        { id: "p9", tipo: "jugador_a", x: 68, y: 50, color: "#1e3a8a", label: "9" },
        { id: "p10", tipo: "jugador_a", x: 65, y: 80, color: "#1e3a8a", label: "11" },
      ],
      trazosLibres: [],
    },
    creadoEn: "2026-11-15T11:00:00Z",
    actualizadoEn: "2026-11-15T11:00:00Z",
    autor: "Cuerpo Técnico",
  },
];

export default function CampoPage() {
  const [activeTab, setActiveTab] = useState<"ejercicios" | "sesion" | "pizarra" | "calculadora" | "gps">("ejercicios");
  const [ejercicios, setEjercicios] = useState<CampoEjercicio[]>([]);
  const [sesiones, setSesiones] = useState<CampoSesionFicha[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<"synced" | "saving" | "offline">("synced");

  // Modales
  const [modalEjercicioOpen, setModalEjercicioOpen] = useState(false);
  const [editingEjercicio, setEditingEjercicio] = useState<CampoEjercicio | null>(null);
  const [detailEjercicio, setDetailEjercicio] = useState<CampoEjercicio | null>(null);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [activeVideoDrill, setActiveVideoDrill] = useState<{ url: string; title: string; category?: string } | null>(null);
  const [backupModalOpen, setBackupModalOpen] = useState(false);

  // Vista de biblioteca (grid de tarjetas vs tabla)
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Filtros de la base de datos
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategoria, setFilterCategoria] = useState<string>("todas");
  const [filterFase, setFilterFase] = useState<string>("todas");
  const [filterOnlyWithVideo, setFilterOnlyWithVideo] = useState(false);
  const [filterDensity, setFilterDensity] = useState<"todos" | "reducido" | "medio" | "amplio">("todos");
  const [filterMd, setFilterMd] = useState<string>("todos");

  // Datos para GPS y jugadores
  const [allGpsRows, setAllGpsRows] = useState<any[]>([]);
  const [allJugadores, setAllJugadores] = useState<any[]>([]);
  const [selectedGpsDate, setSelectedGpsDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  // Pizarra libre independiente
  const [freePitchData, setFreePitchData] = useState<CampoDiagramaData>({
    pitchType: "medio_campo",
    elementos: [],
    trazosLibres: [],
  });

  // 1. CARGA INICIAL: Eliminar ejercicios simulados (ej-bbdd-) y cargar del Servidor + LocalStorage
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // A) Intentar cargar de Supabase / Servidor
        let serverEjercicios = await getCampoEjerciciosServer();
        let serverSesiones = await getCampoSesionesServer();

        // B) Revisar localStorage
        let localEj: CampoEjercicio[] = [];
        if (typeof window !== "undefined") {
          try {
            // Limpiar datos antiguos de la clave previa
            const oldStored = localStorage.getItem("campo_ejercicios_v1");
            if (oldStored) {
              const oldParsed = JSON.parse(oldStored);
              if (Array.isArray(oldParsed)) {
                // Purgamos estrictamente cualquier tarea simulada
                localEj = oldParsed.filter((e: CampoEjercicio) => !e.id?.startsWith("ej-bbdd-"));
              }
            }
            const currentStored = localStorage.getItem(EJERCICIOS_STORAGE_KEY);
            if (currentStored) {
              const currParsed = JSON.parse(currentStored);
              if (Array.isArray(currParsed) && currParsed.length > 0) {
                localEj = currParsed.filter((e: CampoEjercicio) => !e.id?.startsWith("ej-bbdd-"));
              }
            }
          } catch (e) {
            console.error("Error reading localStorage:", e);
          }
        }

        // Combinar datos: Servidor tiene prioridad si existe, si no local, si no base inicial
        let finalEjercicios: CampoEjercicio[] = [];
        if (Array.isArray(serverEjercicios) && serverEjercicios.length > 0) {
          finalEjercicios = serverEjercicios.filter((e: CampoEjercicio) => !e.id?.startsWith("ej-bbdd-"));
        } else if (localEj.length > 0) {
          finalEjercicios = localEj;
        } else {
          finalEjercicios = EJERCICIOS_BASE_INICIALES;
        }

        setEjercicios(finalEjercicios);
        if (typeof window !== "undefined") {
          localStorage.setItem(EJERCICIOS_STORAGE_KEY, JSON.stringify(finalEjercicios));
        }

        // Sesiones
        let finalSesiones: CampoSesionFicha[] = [];
        if (Array.isArray(serverSesiones) && serverSesiones.length > 0) {
          finalSesiones = serverSesiones;
        } else if (typeof window !== "undefined") {
          const storedSes = localStorage.getItem(SESIONES_STORAGE_KEY);
          if (storedSes) {
            finalSesiones = JSON.parse(storedSes);
          }
        }
        setSesiones(finalSesiones);

        setSyncStatus("synced");
      } catch (err) {
        console.error("Error al inicializar módulo de campo:", err);
        setEjercicios(EJERCICIOS_BASE_INICIALES);
        setSyncStatus("offline");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Cargar datos GPS y jugadores para módulo GPS
  useEffect(() => {
    async function loadGpsAndPlayers() {
      try {
        const jug = await getActiveJugadores();
        if (Array.isArray(jug)) setAllJugadores(jug);
      } catch (e) {
        console.error("Error loading players:", e);
      }
    }
    loadGpsAndPlayers();
  }, []);

  // Guardar ejercicios en Servidor y LocalStorage
  const persistEjercicios = async (updated: CampoEjercicio[]) => {
    setEjercicios(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem(EJERCICIOS_STORAGE_KEY, JSON.stringify(updated));
    }
    setSyncStatus("saving");
    try {
      await saveCampoEjerciciosServer(updated);
      setSyncStatus("synced");
    } catch (e) {
      console.error("Error syncing to server:", e);
      setSyncStatus("offline");
    }
  };

  // Guardar sesiones en Servidor y LocalStorage
  const persistSesiones = async (updated: CampoSesionFicha[]) => {
    setSesiones(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem(SESIONES_STORAGE_KEY, JSON.stringify(updated));
    }
    try {
      await saveCampoSesionesServer(updated);
    } catch (e) {
      console.error("Error syncing sessions to server:", e);
    }
  };

  // Guardar / Crear ejercicio
  const handleSaveEjercicio = (ejercicio: CampoEjercicio) => {
    let updated: CampoEjercicio[];
    const exists = ejercicios.some((e) => e.id === ejercicio.id);
    if (exists) {
      updated = ejercicios.map((e) => (e.id === ejercicio.id ? ejercicio : e));
    } else {
      updated = [ejercicio, ...ejercicios];
    }
    persistEjercicios(updated);
    setModalEjercicioOpen(false);
    setEditingEjercicio(null);
  };

  // Duplicar ejercicio
  const handleDuplicate = (ej: CampoEjercicio) => {
    const duplicated: CampoEjercicio = {
      ...ej,
      id: `ej-${Date.now()}`,
      nombre: `${ej.nombre} (Copia)`,
      creadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
    };
    const updated = [duplicated, ...ejercicios];
    persistEjercicios(updated);
  };

  // Eliminar ejercicio
  const handleDelete = (id: string) => {
    const target = ejercicios.find((e) => e.id === id);
    const confirmName = target ? `"${target.nombre}"` : "este ejercicio";
    if (!window.confirm(`¿Estás seguro de eliminar ${confirmName} de la base de datos?`)) return;
    const updated = ejercicios.filter((e) => e.id !== id);
    persistEjercicios(updated);
  };

  // Guardar sesión desde ficha manager
  const handleSaveSesion = (ses: CampoSesionFicha) => {
    let updated: CampoSesionFicha[];
    const idx = sesiones.findIndex((s) => s.id === ses.id);
    if (idx >= 0) {
      updated = [...sesiones];
      updated[idx] = ses;
    } else {
      updated = [ses, ...sesiones];
    }
    persistSesiones(updated);
  };

  // Eliminar sesión
  const handleDeleteSesion = (id: string) => {
    if (!window.confirm("¿Eliminar esta ficha de sesión?")) return;
    const updated = sesiones.filter((s) => s.id !== id);
    persistSesiones(updated);
  };

  // Exportar desde calculadora a sesión
  const handleExportFromCalculadora = (items: CampoSesionBloqueItem[], md: string) => {
    const today = new Date().toISOString().split("T")[0];
    const durTotalMin = items.reduce((acc, it) => acc + it.tiempoTotalMin, 0);
    const nuevaSesion: CampoSesionFicha = {
      id: `ses-${Date.now()}`,
      fecha: today,
      microcicloMd: md,
      instalacion: "Nou Sardenya",
      objetivoPrincipal: `Sesión ${md} calculada por objetivos de carga`,
      duracionEstimadaMin: durTotalMin,
      bloques: [
        {
          id: `b-calc-${Date.now()}`,
          nombre: "Parte Principal (Calculada)",
          orden: 1,
          items,
        },
      ],
      metricasEstimadas: {
        duracionTotalMin: durTotalMin,
        distanciaTotalM: Math.round(items.reduce((acc, it) => acc + (it.ejercicioSnapshot?.perfilGps?.mMin || 90) * it.tiempoTrabajoMin, 0)),
        hsrTotalM: Math.round(items.reduce((acc, it) => acc + (it.ejercicioSnapshot?.perfilGps?.hsrMin || 5) * it.tiempoTrabajoMin, 0)),
        sprintTotalM: Math.round(items.reduce((acc, it) => acc + (it.ejercicioSnapshot?.perfilGps?.sprintMin || 1) * it.tiempoTrabajoMin, 0)),
        accTotal: Math.round(items.reduce((acc, it) => acc + (it.ejercicioSnapshot?.perfilGps?.accMin || 1.5) * it.tiempoTrabajoMin, 0)),
        playerLoadTotal: Math.round(items.reduce((acc, it) => acc + (it.ejercicioSnapshot?.perfilGps?.playerLoadMin || 10) * it.tiempoTrabajoMin, 0)),
      },
      estado: "planificada",
      creadaEn: new Date().toISOString(),
    };
    handleSaveSesion(nuevaSesion);
    setActiveTab("sesion");
  };

  // Abrir reproductor de vídeo
  const handlePlayVideo = (url: string, title: string, category?: string) => {
    setActiveVideoDrill({ url, title, category });
    setVideoModalOpen(true);
  };

  // Exportar JSON de la BBDD
  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(ejercicios, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `campo_ejercicios_${new Date().toISOString().split("T")[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Importar JSON
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((it) => it && it.id && it.nombre);
          if (cleaned.length > 0) {
            persistEjercicios(cleaned);
            alert(`¡Base de datos importada con éxito! Se cargaron ${cleaned.length} tareas.`);
            setBackupModalOpen(false);
          } else {
            alert("El archivo no contenía un formato válido de ejercicios.");
          }
        }
      } catch (err) {
        alert("Error al leer el archivo JSON.");
      }
    };
    reader.readAsText(file);
  };

  // Métricas agregadas
  const totalEjercicios = ejercicios.length;
  const countConVideo = ejercicios.filter((e) => Boolean(e.videoUrl?.trim())).length;
  const avgTiempoMin = totalEjercicios > 0
    ? Math.round(ejercicios.reduce((acc, it) => acc + (it.estructura?.tiempoTotalMin || 10), 0) / totalEjercicios)
    : 0;
  const avgM2 = totalEjercicios > 0
    ? Math.round(ejercicios.reduce((acc, it) => acc + (it.dimensiones?.m2PorJugador || 100), 0) / totalEjercicios)
    : 0;

  // Filtrado de la Base de Datos
  const filteredEjercicios = useMemo(() => {
    return ejercicios.filter((ej) => {
      // Categoría
      if (filterCategoria !== "todas" && ej.categoria !== filterCategoria) {
        return false;
      }
      // Fase de juego
      if (filterFase !== "todas" && ej.faseJuego !== filterFase) {
        return false;
      }
      // Solo con vídeo
      if (filterOnlyWithVideo && !ej.videoUrl?.trim()) {
        return false;
      }
      // Densidad
      if (filterDensity === "reducido" && (ej.dimensiones?.m2PorJugador || 100) >= 80) {
        return false;
      }
      if (filterDensity === "medio" && ((ej.dimensiones?.m2PorJugador || 100) < 80 || (ej.dimensiones?.m2PorJugador || 100) > 160)) {
        return false;
      }
      if (filterDensity === "amplio" && (ej.dimensiones?.m2PorJugador || 100) <= 160) {
        return false;
      }
      // Microciclo MD
      if (filterMd !== "todos") {
        const sub = (ej.subcategoria || "").toUpperCase();
        if (!sub.includes(filterMd.toUpperCase())) return false;
      }
      // Búsqueda libre
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const inTitle = (ej.nombre || "").toLowerCase().includes(q);
        const inSub = (ej.subcategoria || "").toLowerCase().includes(q);
        const inObj = (ej.consignas?.objetivoPrincipal || "").toLowerCase().includes(q);
        const inDesc = (ej.consignas?.descripcion || "").toLowerCase().includes(q);
        if (!inTitle && !inSub && !inObj && !inDesc) return false;
      }
      return true;
    });
  }, [ejercicios, filterCategoria, filterFase, filterOnlyWithVideo, filterDensity, filterMd, searchTerm]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "inherit" }}>
      {/* CABECERA PRINCIPAL MODERNA */}
      <header
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          padding: "16px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "14px",
          position: "sticky",
          top: 0,
          zIndex: 40,
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}
      >
        {/* TÍTULO Y RETORNO */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link
            href="/"
            style={{
              fontSize: "12px",
              fontWeight: 800,
              color: "#475569",
              textDecoration: "none",
              background: "#f1f5f9",
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>←</span>
            <span>Menú Principal</span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #1e3a8a, #0284c7)",
                display: "grid",
                placeItems: "center",
                color: "#ffffff",
                fontSize: "20px",
                boxShadow: "0 3px 8px rgba(2, 132, 199, 0.35)",
              }}
            >
              ⚽
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h1 style={{ fontSize: "18px", fontWeight: 900, color: "#0f172a", margin: 0, letterSpacing: "-0.4px" }}>
                  Metodología de Campo & Base de Datos Táctica
                </h1>
                <span
                  style={{
                    background: syncStatus === "synced" ? "#dcfce7" : "#fef3c7",
                    color: syncStatus === "synced" ? "#166534" : "#92400e",
                    fontSize: "10.5px",
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: "999px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: syncStatus === "synced" ? "#16a34a" : "#f59e0b",
                    }}
                  />
                  {syncStatus === "synced" ? "BBDD Sincronizada" : syncStatus === "saving" ? "Guardando..." : "Local"}
                </span>
              </div>
              <p style={{ fontSize: "11.5px", color: "#64748b", margin: "2px 0 0 0" }}>
                Banco de tareas con vídeo demostrativo, diseñador de pizarra táctica, planificador y cargas GPS
              </p>
            </div>
          </div>
        </div>

        {/* CONTADORES RESUMEN Y BOTONES DE ACCIÓN */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* STATS RÁPIDOS */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              padding: "6px 14px",
              borderRadius: "10px",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "9px", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Tareas</div>
              <div style={{ fontSize: "13px", fontWeight: 900, color: "#0f172a" }}>{totalEjercicios}</div>
            </div>
            <div style={{ width: "1px", height: "18px", background: "#cbd5e1" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "9px", fontWeight: 800, color: "#ef4444", textTransform: "uppercase" }}>Con Vídeo</div>
              <div style={{ fontSize: "13px", fontWeight: 900, color: "#dc2626" }}>{countConVideo}</div>
            </div>
            <div style={{ width: "1px", height: "18px", background: "#cbd5e1" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "9px", fontWeight: 800, color: "#0284c7", textTransform: "uppercase" }}>Media m²/j</div>
              <div style={{ fontSize: "13px", fontWeight: 900, color: "#0369a1" }}>{avgM2}</div>
            </div>
          </div>

          {/* BOTÓN BACKUP / GESTIÓN */}
          <button
            type="button"
            onClick={() => setBackupModalOpen(true)}
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#475569",
              fontSize: "12px",
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            title="Copias de seguridad e importación/exportación JSON de tareas"
          >
            <span>⚙️</span>
            <span>BBDD JSON</span>
          </button>

          {/* BOTÓN NUEVO EJERCICIO */}
          <button
            type="button"
            onClick={() => {
              setEditingEjercicio(null);
              setModalEjercicioOpen(true);
            }}
            style={{
              padding: "9px 18px",
              borderRadius: "8px",
              border: "none",
              background: "linear-gradient(135deg, #0284c7, #1e3a8a)",
              color: "#ffffff",
              fontSize: "12.5px",
              fontWeight: 900,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 8px rgba(2, 132, 199, 0.35)",
            }}
          >
            <span>✨</span>
            <span>+ Nuevo Ejercicio</span>
          </button>
        </div>
      </header>

      {/* BARRA DE NAVEGACIÓN DE PESTAÑAS */}
      <div
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          padding: "0 28px",
          display: "flex",
          gap: "4px",
          overflowX: "auto",
        }}
      >
        {[
          { id: "ejercicios", label: "📚 Base de Datos de Tareas", count: totalEjercicios },
          { id: "sesion", label: "📋 Planificador de Sesión", count: sesiones.length },
          { id: "pizarra", label: "📐 Pizarra Táctica Libre" },
          { id: "calculadora", label: "⚡ Calculadora Carga MD" },
          { id: "gps", label: "📡 Análisis Post-Sesión GPS" },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: "13px 18px",
                border: "none",
                background: "transparent",
                color: isActive ? "#0284c7" : "#64748b",
                fontSize: "13px",
                fontWeight: isActive ? 900 : 700,
                borderBottom: isActive ? "3px solid #0284c7" : "3px solid transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
              }}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  style={{
                    background: isActive ? "#e0f2fe" : "#f1f5f9",
                    color: isActive ? "#0284c7" : "#64748b",
                    fontSize: "11px",
                    fontWeight: 800,
                    padding: "2px 7px",
                    borderRadius: "999px",
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <main style={{ maxWidth: "1680px", margin: "0 auto", padding: "20px 28px" }}>
        {/* ========================================================================= */}
        {/* TAB 1: BASE DE DATOS DE EJERCICIOS CON VÍDEO Y DIAGRAMAS                   */}
        {/* ========================================================================= */}
        {activeTab === "ejercicios" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* CARROUSEL / CHIPS DE CATEGORÍAS */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                overflowX: "auto",
                paddingBottom: "4px",
              }}
            >
              <button
                type="button"
                onClick={() => setFilterCategoria("todas")}
                style={{
                  padding: "7px 14px",
                  borderRadius: "999px",
                  border: filterCategoria === "todas" ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                  background: filterCategoria === "todas" ? "#e0f2fe" : "#ffffff",
                  color: filterCategoria === "todas" ? "#0369a1" : "#475569",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  whiteSpace: "nowrap",
                }}
              >
                <span>🌐 Todas las tareas</span>
                <span style={{ fontSize: "10.5px", background: "rgba(0,0,0,0.06)", padding: "1px 6px", borderRadius: "999px" }}>
                  {ejercicios.length}
                </span>
              </button>

              {CATEGORIAS_LIST.map((cat) => {
                const count = ejercicios.filter((e) => e.categoria === cat.id).length;
                const isSelected = filterCategoria === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setFilterCategoria(cat.id)}
                    style={{
                      padding: "7px 14px",
                      borderRadius: "999px",
                      border: isSelected ? `1.5px solid ${cat.color}` : "1px solid #cbd5e1",
                      background: isSelected ? `${cat.color}15` : "#ffffff",
                      color: isSelected ? cat.color : "#475569",
                      fontSize: "12px",
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                    <span style={{ fontSize: "10.5px", opacity: 0.75 }}>({count})</span>
                  </button>
                );
              })}
            </div>

            {/* BARRA DE BÚSQUEDA Y FILTROS AVANZADOS */}
            <div
              style={{
                background: "#ffffff",
                borderRadius: "14px",
                border: "1px solid #e2e8f0",
                padding: "14px 18px",
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                alignItems: "center",
                justifyContent: "space-between",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              }}
            >
              {/* LADO IZQUIERDO: INPUT + DROPDOWNS */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", flex: 1 }}>
                {/* BUSCADOR */}
                <div style={{ position: "relative", minWidth: "260px", flex: "1 1 280px" }}>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="🔍 Buscar por nombre, consignas, dinámica..."
                    style={{
                      width: "100%",
                      padding: "8px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      outline: "none",
                      boxSizing: "border-box",
                      background: "#f8fafc",
                    }}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        fontSize: "12px",
                        cursor: "pointer",
                        color: "#94a3b8",
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* TOGGLE: SOLO CON VÍDEO */}
                <button
                  type="button"
                  onClick={() => setFilterOnlyWithVideo(!filterOnlyWithVideo)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: filterOnlyWithVideo ? "1.5px solid #ef4444" : "1px solid #cbd5e1",
                    background: filterOnlyWithVideo ? "#fef2f2" : "#ffffff",
                    color: filterOnlyWithVideo ? "#dc2626" : "#475569",
                    fontSize: "12px",
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>▶️ Solo con vídeo</span>
                  <span
                    style={{
                      background: filterOnlyWithVideo ? "#ef4444" : "#f1f5f9",
                      color: filterOnlyWithVideo ? "#ffffff" : "#64748b",
                      fontSize: "10px",
                      fontWeight: 900,
                      padding: "1px 6px",
                      borderRadius: "999px",
                    }}
                  >
                    {countConVideo}
                  </span>
                </button>

                {/* FILTRO FASE DE JUEGO */}
                <select
                  value={filterFase}
                  onChange={(e) => setFilterFase(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "12px",
                    fontWeight: 700,
                    background: "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <option value="todas">Fase de Juego: Todas</option>
                  <option value="GLOBAL">Global / Juego Real</option>
                  <option value="ATAQUE">Fase Ofensiva</option>
                  <option value="DEFENSA">Fase Defensiva</option>
                  <option value="TRANSICION_OF">Transición Ofensiva</option>
                  <option value="TRANSICION_DEF">Transición Defensiva</option>
                </select>

                {/* FILTRO ESPACIO / DENSIDAD */}
                <select
                  value={filterDensity}
                  onChange={(e) => setFilterDensity(e.target.value as any)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "12px",
                    fontWeight: 700,
                    background: "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <option value="todos">Densidad: Todas</option>
                  <option value="reducido">Reducido (&lt;80 m²/j)</option>
                  <option value="medio">Medio (80-160 m²/j)</option>
                  <option value="amplio">Amplio (&gt;160 m²/j)</option>
                </select>

                {/* FILTRO MICROCICLO */}
                <select
                  value={filterMd}
                  onChange={(e) => setFilterMd(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "12px",
                    fontWeight: 700,
                    background: "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <option value="todos">Todos los MDs</option>
                  <option value="MD-4">MD-4 (Capacidad / Espacios Amplios)</option>
                  <option value="MD-3">MD-3 (Potencia / Reducidos)</option>
                  <option value="MD-2">MD-2 (Velocidad / Reactividad)</option>
                  <option value="MD-1">MD-1 (Activación / Balón Parado)</option>
                </select>
              </div>

              {/* LADO DERECHO: CONMUTADOR DE VISTA (GRID / TABLE) */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
                  Mostrando <strong style={{ color: "#0f172a" }}>{filteredEjercicios.length}</strong> tareas
                </div>

                <div style={{ display: "flex", background: "#f1f5f9", padding: "2px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    style={{
                      border: "none",
                      padding: "5px 10px",
                      borderRadius: "6px",
                      background: viewMode === "grid" ? "#ffffff" : "transparent",
                      color: viewMode === "grid" ? "#0284c7" : "#64748b",
                      fontWeight: 800,
                      fontSize: "12px",
                      cursor: "pointer",
                      boxShadow: viewMode === "grid" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                    }}
                    title="Vista en tarjetas cuadrícula"
                  >
                    🔲 Tarjetas
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    style={{
                      border: "none",
                      padding: "5px 10px",
                      borderRadius: "6px",
                      background: viewMode === "table" ? "#ffffff" : "transparent",
                      color: viewMode === "table" ? "#0284c7" : "#64748b",
                      fontWeight: 800,
                      fontSize: "12px",
                      cursor: "pointer",
                      boxShadow: viewMode === "table" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                    }}
                    title="Vista en tabla compacta"
                  >
                    📋 Tabla
                  </button>
                </div>
              </div>
            </div>

            {/* CONTENIDO DE LA BIBLIOTECA */}
            {filteredEjercicios.length === 0 ? (
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: "14px",
                  border: "2px dashed #cbd5e1",
                  padding: "60px 20px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "44px", marginBottom: "12px" }}>⚽</div>
                <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#1e293b", margin: "0 0 6px 0" }}>
                  No se encontraron ejercicios con estos criterios
                </h3>
                <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 16px 0" }}>
                  Prueba a limpiar los filtros de búsqueda o crea un nuevo ejercicio para tu base de datos.
                </p>
                <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm("");
                      setFilterCategoria("todas");
                      setFilterFase("todas");
                      setFilterOnlyWithVideo(false);
                      setFilterDensity("todos");
                      setFilterMd("todos");
                    }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      background: "#f1f5f9",
                      color: "#334155",
                      fontSize: "12px",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    Restablecer Filtros
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEjercicio(null);
                      setModalEjercicioOpen(true);
                    }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#0284c7",
                      color: "#ffffff",
                      fontSize: "12px",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    + Nuevo Ejercicio
                  </button>
                </div>
              </div>
            ) : viewMode === "grid" ? (
              /* ==================== VISTA CUADRÍCULA DE TARJETAS ==================== */
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
                  gap: "20px",
                }}
              >
                {filteredEjercicios.map((ej) => {
                  const catInfo = CATEGORIAS_LIST.find((c) => c.id === ej.categoria);
                  const hasVideo = Boolean(ej.videoUrl?.trim());
                  const elementsCount = ej.diagrama?.elementos?.length || 0;

                  return (
                    <div
                      key={ej.id}
                      style={{
                        background: "#ffffff",
                        borderRadius: "14px",
                        border: "1px solid #e2e8f0",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {/* MINIATURA PIZARRA TÁCTICA */}
                      <div
                        onClick={() => setDetailEjercicio(ej)}
                        style={{
                          height: "175px",
                          background: "#044320",
                          position: "relative",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderBottom: "1px solid #e2e8f0",
                          cursor: "pointer",
                        }}
                      >
                        {/* Mini preview SVG */}
                        <svg
                          viewBox="0 0 100 100"
                          style={{
                            width: "100%",
                            height: "100%",
                            opacity: 0.92,
                          }}
                        >
                          <rect x="4" y="4" width="92" height="92" fill="#0b5e2b" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.45" rx="2" />
                          <circle cx="50" cy="50" r="14" fill="none" stroke="#ffffff" strokeWidth="0.8" strokeOpacity="0.35" />
                          <line x1="50" y1="4" x2="50" y2="96" stroke="#ffffff" strokeWidth="0.8" strokeOpacity="0.35" />

                          {/* Elementos colocados */}
                          {ej.diagrama?.elementos?.slice(0, 30).map((elem) => {
                            if (elem.tipo === "balon") {
                              return <circle key={elem.id} cx={elem.x} cy={elem.y} r="2.2" fill="#ffffff" stroke="#000000" strokeWidth="0.4" />;
                            }
                            if (elem.tipo === "cono" || elem.tipo === "seta") {
                              return <circle key={elem.id} cx={elem.x} cy={elem.y} r="1.6" fill={elem.color || "#f97316"} />;
                            }
                            if (elem.tipo === "mini_porteria" || elem.tipo === "porteria") {
                              return <rect key={elem.id} x={elem.x - 3} y={elem.y - 1.5} width="6" height="3" fill="#ffffff" stroke="#0f172a" strokeWidth="0.4" />;
                            }
                            return (
                              <g key={elem.id}>
                                <circle cx={elem.x} cy={elem.y} r="3" fill={elem.color || "#1e3a8a"} stroke="#ffffff" strokeWidth="0.6" />
                                {elem.label && (
                                  <text x={elem.x} y={elem.y + 1} fontSize="2.8" fontWeight="bold" fill="#ffffff" textAnchor="middle">
                                    {elem.label}
                                  </text>
                                )}
                              </g>
                            );
                          })}
                        </svg>

                        {/* Badge Categoría arriba izquierda */}
                        <div
                          style={{
                            position: "absolute",
                            top: "8px",
                            left: "8px",
                            background: "rgba(15, 23, 42, 0.85)",
                            backdropFilter: "blur(4px)",
                            color: "#ffffff",
                            fontSize: "10.5px",
                            fontWeight: 800,
                            padding: "3px 8px",
                            borderRadius: "6px",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <span>{catInfo?.icon || "⚽"}</span>
                          <span>{catInfo?.label || ej.categoria}</span>
                        </div>

                        {/* Badge Vídeo si existe arriba derecha */}
                        {hasVideo && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlayVideo(ej.videoUrl!, ej.nombre, catInfo?.label);
                            }}
                            style={{
                              position: "absolute",
                              top: "8px",
                              right: "8px",
                              background: "linear-gradient(135deg, #ef4444, #b91c1c)",
                              color: "#ffffff",
                              fontSize: "11px",
                              fontWeight: 900,
                              padding: "4px 10px",
                              borderRadius: "6px",
                              border: "none",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              boxShadow: "0 2px 6px rgba(220, 38, 38, 0.5)",
                            }}
                            title="Reproducir vídeo demostrativo"
                          >
                            <span>▶️</span>
                            <span>Ver Vídeo</span>
                          </button>
                        )}

                        {/* Duración abajo derecha */}
                        <div
                          style={{
                            position: "absolute",
                            bottom: "8px",
                            right: "8px",
                            background: "rgba(15, 23, 42, 0.8)",
                            color: "#ffffff",
                            fontSize: "10.5px",
                            fontWeight: 900,
                            padding: "2px 7px",
                            borderRadius: "5px",
                          }}
                        >
                          ⏱️ {ej.estructura.tiempoTotalMin} min
                        </div>

                        {/* Elementos abajo izquierda */}
                        <div
                          style={{
                            position: "absolute",
                            bottom: "8px",
                            left: "8px",
                            background: "rgba(0,0,0,0.55)",
                            color: "#e2e8f0",
                            fontSize: "9.5px",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "4px",
                          }}
                        >
                          🎨 {elementsCount} piezas tácticas
                        </div>
                      </div>

                      {/* CUERPO DE LA TARJETA */}
                      <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
                          <h4
                            onClick={() => setDetailEjercicio(ej)}
                            style={{
                              fontSize: "14px",
                              fontWeight: 900,
                              color: "#0f172a",
                              margin: "0 0 4px 0",
                              lineHeight: 1.3,
                              cursor: "pointer",
                            }}
                          >
                            {ej.nombre}
                          </h4>
                          {ej.faseJuego && (
                            <span
                              style={{
                                background: "#f1f5f9",
                                color: "#475569",
                                fontSize: "9.5px",
                                fontWeight: 800,
                                padding: "2px 6px",
                                borderRadius: "4px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {ej.faseJuego}
                            </span>
                          )}
                        </div>

                        {ej.subcategoria && (
                          <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, marginBottom: "8px" }}>
                            {ej.subcategoria}
                          </div>
                        )}

                        {/* OBJETIVO PRINCIPAL */}
                        <div style={{ fontSize: "11.5px", color: "#475569", marginBottom: "12px", lineHeight: 1.35 }}>
                          <strong style={{ color: "#1e293b" }}>Obj:</strong> {ej.consignas.objetivoPrincipal}
                        </div>

                        {/* DATOS CLAVE (ESPACIO, JUGADORES, DENSIDAD) */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(3, 1fr)",
                            gap: "6px",
                            background: "#f8fafc",
                            padding: "8px",
                            borderRadius: "8px",
                            border: "1px solid #e2e8f0",
                            marginBottom: "12px",
                            textAlign: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: "9px", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                              Espacio
                            </div>
                            <div style={{ fontSize: "11px", fontWeight: 800, color: "#1e293b", marginTop: "1px" }}>
                              {ej.dimensiones.anchoM}x{ej.dimensiones.largoM}m
                            </div>
                            <div style={{ fontSize: "9px", color: "#0284c7", fontWeight: 800 }}>
                              {ej.dimensiones.m2PorJugador} m²/j
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: "9px", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                              Jugadores
                            </div>
                            <div style={{ fontSize: "11px", fontWeight: 800, color: "#1e293b", marginTop: "1px" }}>
                              {ej.jugadores.total} pax
                            </div>
                            <div style={{ fontSize: "9px", color: "#64748b", fontWeight: 600 }}>
                              {ej.jugadores.atacantes}v{ej.jugadores.defensores}
                              {ej.jugadores.comodines > 0 ? `+${ej.jugadores.comodines}` : ""}
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: "9px", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                              Estructura
                            </div>
                            <div style={{ fontSize: "11px", fontWeight: 800, color: "#1e293b", marginTop: "1px" }}>
                              {ej.estructura.series}x{Math.round(ej.estructura.tiempoTrabajoSeg / 60)}'
                            </div>
                            <div style={{ fontSize: "9px", color: "#16a34a", fontWeight: 800 }}>
                              W:R {ej.estructura.ratioWR}
                            </div>
                          </div>
                        </div>

                        {/* PERFIL GPS ESTIMADO */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, 1fr)",
                            gap: "4px",
                            background: "#ffffff",
                            padding: "6px 8px",
                            borderRadius: "6px",
                            border: "1px solid #e2e8f0",
                            marginBottom: "14px",
                            fontSize: "10px",
                            textAlign: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: "8px", color: "#64748b", fontWeight: 700 }}>DIST/MIN</div>
                            <div style={{ fontWeight: 800, color: "#0284c7" }}>{ej.perfilGps.mMin} m</div>
                          </div>
                          <div>
                            <div style={{ fontSize: "8px", color: "#64748b", fontWeight: 700 }}>HSR &gt;21</div>
                            <div style={{ fontWeight: 800, color: "#d97706" }}>{ej.perfilGps.hsrMin} m</div>
                          </div>
                          <div>
                            <div style={{ fontSize: "8px", color: "#64748b", fontWeight: 700 }}>ACC &gt;3</div>
                            <div style={{ fontWeight: 800, color: "#16a34a" }}>{ej.perfilGps.accMin} /m</div>
                          </div>
                          <div>
                            <div style={{ fontSize: "8px", color: "#64748b", fontWeight: 700 }}>PL/MIN</div>
                            <div style={{ fontWeight: 800, color: "#7c3aed" }}>{ej.perfilGps.playerLoadMin}</div>
                          </div>
                        </div>

                        {/* BOTONES DE ACCIÓN */}
                        <div style={{ display: "flex", gap: "6px", marginTop: "auto" }}>
                          <button
                            type="button"
                            onClick={() => setDetailEjercicio(ej)}
                            style={{
                              flex: 1,
                              padding: "7px 10px",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              background: "#f8fafc",
                              color: "#334155",
                              fontSize: "11px",
                              fontWeight: 800,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "4px",
                            }}
                          >
                            <span>👁️</span>
                            <span>Ver Ficha</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingEjercicio(ej);
                              setModalEjercicioOpen(true);
                            }}
                            style={{
                              flex: 1,
                              padding: "7px 10px",
                              borderRadius: "6px",
                              border: "1px solid #0284c7",
                              background: "#e0f2fe",
                              color: "#0369a1",
                              fontSize: "11px",
                              fontWeight: 800,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "4px",
                            }}
                          >
                            <span>✏️</span>
                            <span>Editar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDuplicate(ej)}
                            title="Duplicar tarea"
                            style={{
                              padding: "7px 10px",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              background: "#f8fafc",
                              color: "#475569",
                              fontSize: "11px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            📋
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(ej.id)}
                            title="Eliminar tarea"
                            style={{
                              padding: "7px 10px",
                              borderRadius: "6px",
                              border: "1px solid #fecaca",
                              background: "#fef2f2",
                              color: "#dc2626",
                              fontSize: "11px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ==================== VISTA TABLA COMPACTA ==================== */
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: "14px",
                  border: "1px solid #e2e8f0",
                  overflowX: "auto",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569", fontSize: "11px", fontWeight: 800 }}>
                      <th style={{ padding: "12px 14px" }}>Nombre del Ejercicio</th>
                      <th style={{ padding: "12px 10px" }}>Categoría</th>
                      <th style={{ padding: "12px 10px" }}>Fase</th>
                      <th style={{ padding: "12px 10px", textAlign: "center" }}>Vídeo</th>
                      <th style={{ padding: "12px 10px" }}>Jugadores</th>
                      <th style={{ padding: "12px 10px" }}>Espacio</th>
                      <th style={{ padding: "12px 10px" }}>Duración</th>
                      <th style={{ padding: "12px 10px" }}>GPS PL/min</th>
                      <th style={{ padding: "12px 14px", textAlign: "right" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEjercicios.map((ej) => {
                      const catInfo = CATEGORIAS_LIST.find((c) => c.id === ej.categoria);
                      const hasVideo = Boolean(ej.videoUrl?.trim());
                      return (
                        <tr
                          key={ej.id}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                            transition: "background 0.15s ease",
                          }}
                        >
                          <td style={{ padding: "10px 14px", fontWeight: 800, color: "#0f172a" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ cursor: "pointer" }} onClick={() => setDetailEjercicio(ej)}>
                                {ej.nombre}
                              </span>
                            </div>
                            {ej.subcategoria && (
                              <div style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>{ej.subcategoria}</div>
                            )}
                          </td>
                          <td style={{ padding: "10px" }}>
                            <span
                              style={{
                                background: `${catInfo?.color || "#0284c7"}15`,
                                color: catInfo?.color || "#0284c7",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "10.5px",
                                fontWeight: 800,
                              }}
                            >
                              {catInfo?.icon} {catInfo?.label || ej.categoria}
                            </span>
                          </td>
                          <td style={{ padding: "10px", color: "#475569", fontWeight: 700 }}>
                            {ej.faseJuego || "GLOBAL"}
                          </td>
                          <td style={{ padding: "10px", textAlign: "center" }}>
                            {hasVideo ? (
                              <button
                                type="button"
                                onClick={() => handlePlayVideo(ej.videoUrl!, ej.nombre, catInfo?.label)}
                                style={{
                                  background: "#fee2e2",
                                  border: "1px solid #fca5a5",
                                  color: "#dc2626",
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  fontSize: "10.5px",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                ▶️ Vídeo
                              </button>
                            ) : (
                              <span style={{ color: "#cbd5e1" }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: "10px", color: "#334155" }}>
                            <strong>{ej.jugadores.total} pax</strong> ({ej.jugadores.atacantes}v{ej.jugadores.defensores})
                          </td>
                          <td style={{ padding: "10px", color: "#334155" }}>
                            {ej.dimensiones.anchoM}x{ej.dimensiones.largoM}m ({ej.dimensiones.m2PorJugador} m²/j)
                          </td>
                          <td style={{ padding: "10px", fontWeight: 800, color: "#16a34a" }}>
                            ⏱️ {ej.estructura.tiempoTotalMin} min
                          </td>
                          <td style={{ padding: "10px", color: "#7c3aed", fontWeight: 800 }}>
                            {ej.perfilGps.playerLoadMin} PL
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                onClick={() => setDetailEjercicio(ej)}
                                style={{
                                  background: "#f1f5f9",
                                  border: "1px solid #cbd5e1",
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                Ver
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEjercicio(ej);
                                  setModalEjercicioOpen(true);
                                }}
                                style={{
                                  background: "#e0f2fe",
                                  border: "1px solid #bae6fd",
                                  color: "#0369a1",
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(ej.id)}
                                style={{
                                  background: "#fef2f2",
                                  border: "1px solid #fecaca",
                                  color: "#dc2626",
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: CREADOR / GESTOR DE FICHA DE SESIÓN                                */}
        {/* ========================================================================= */}
        {activeTab === "sesion" && (
          <SesionFichaManager
            sesiones={sesiones}
            ejerciciosDB={ejercicios}
            onSaveSesion={handleSaveSesion}
            onDeleteSesion={handleDeleteSesion}
          />
        )}

        {/* ========================================================================= */}
        {/* TAB 3: PIZARRA TÁCTICA LIBRE (DIBUJAR Y EXPORTAR)                         */}
        {/* ========================================================================= */}
        {activeTab === "pizarra" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                background: "#ffffff",
                borderRadius: "14px",
                border: "1px solid #e2e8f0",
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: "0 0 3px 0" }}>
                  📐 Diseñador & Pizarra Táctica Libre
                </h3>
                <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>
                  Dibuja jugadas ensayadas, esquemas tácticos, sistemas de juego y descárgalos en imagen o guárdalos como nueva tarea.
                </p>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setEditingEjercicio({
                      id: `ej-${Date.now()}`,
                      nombre: "Nueva Tarea desde Pizarra",
                      categoria: "POSESION",
                      dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
                      jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 0, total: 12 },
                      estructura: { series: 3, repsPorSerie: 1, tiempoTrabajoSeg: 240, tiempoDescansoSeg: 90, tiempoTotalMin: 12, ratioWR: "2.7:1" },
                      consignas: { objetivoPrincipal: "Tarea diseñada en pizarra libre", reglasProvocacion: "", descripcion: "" },
                      perfilGps: { ...BENCHMARKS_CATEGORIA_DEFECTO.POSESION },
                      diagrama: freePitchData,
                      creadoEn: new Date().toISOString(),
                      actualizadoEn: new Date().toISOString(),
                    });
                    setModalEjercicioOpen(true);
                  }}
                  style={{
                    background: "#0284c7",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 16px",
                    fontSize: "12px",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  💾 Convertir Pizarra en Ejercicio
                </button>
              </div>
            </div>

            <div style={{ background: "#ffffff", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "16px" }}>
              <TacticalPitchDesigner
                initialData={freePitchData}
                onChange={(data) => setFreePitchData(data)}
                height={620}
              />
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: CALCULADORA DE CARGA POR EJERCICIOS & TARGETS MD                   */}
        {/* ========================================================================= */}
        {activeTab === "calculadora" && (
          <CalculadoraCarga
            ejerciciosDB={ejercicios}
            onExportToSesion={handleExportFromCalculadora}
          />
        )}

        {/* ========================================================================= */}
        {/* TAB 5: VINCULACIÓN POST-SESIÓN CON DISPOSITIVOS GPS                       */}
        {/* ========================================================================= */}
        {activeTab === "gps" && (
          <div>
            <div
              style={{
                background: "#ffffff",
                borderRadius: "14px",
                border: "1px solid #e2e8f0",
                padding: "16px 20px",
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: "0 0 3px 0" }}>
                  📡 Vinculación Post-Sesión con Dispositivos GPS (BBDD)
                </h3>
                <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>
                  Compara los metros, HSR, sprints y Player Load reales registrados con la planificación de la sesión.
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <label style={{ fontSize: "12px", fontWeight: 800, color: "#334155" }}>
                  Fecha de la Sesión:
                </label>
                <input
                  type="date"
                  value={selectedGpsDate}
                  onChange={(e) => setSelectedGpsDate(e.target.value)}
                  style={{
                    padding: "7px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "12px",
                    fontWeight: 700,
                    background: "#ffffff",
                    color: "#0f172a",
                  }}
                />
              </div>
            </div>

            <SesionGpsAnalysis
              fecha={selectedGpsDate}
              allGpsRows={allGpsRows}
              allJugadores={allJugadores}
              sesion={sesiones.find((s) => s.fecha === selectedGpsDate) || null}
            />
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODALES GLOBALES                                                          */}
      {/* ========================================================================= */}

      {/* MODAL CREADOR / EDITOR DE EJERCICIO CON PIZARRA Y VÍDEO */}
      <EjercicioModal
        ejercicio={editingEjercicio}
        isOpen={modalEjercicioOpen}
        onSave={handleSaveEjercicio}
        onClose={() => {
          setModalEjercicioOpen(false);
          setEditingEjercicio(null);
        }}
      />

      {/* MODAL DETALLE / INSPECTOR DE EJERCICIO */}
      <EjercicioDetailModal
        ejercicio={detailEjercicio}
        isOpen={Boolean(detailEjercicio)}
        onClose={() => setDetailEjercicio(null)}
        onEdit={(ej) => {
          setEditingEjercicio(ej);
          setModalEjercicioOpen(true);
        }}
        onDuplicate={handleDuplicate}
      />

      {/* MODAL REPRODUCTOR DE VÍDEO INTEGRADO */}
      <VideoPlayerModal
        isOpen={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        videoUrl={activeVideoDrill?.url}
        title={activeVideoDrill?.title || "Vídeo Demostrativo"}
        categoryLabel={activeVideoDrill?.category}
      />

      {/* MODAL DE BACKUP / EXPORTACIÓN & IMPORTACIÓN JSON */}
      {backupModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(6px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setBackupModalOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "520px",
              background: "#ffffff",
              borderRadius: "16px",
              padding: "24px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: 0 }}>
                ⚙️ Gestión de Base de Datos de Campo
              </h3>
              <button
                type="button"
                onClick={() => setBackupModalOpen(false)}
                style={{ background: "none", border: "none", fontSize: "16px", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 20px 0" }}>
              Actualmente tienes <strong>{ejercicios.length}</strong> ejercicios en tu base de datos persistente. Puedes descargar una copia de seguridad o restaurar tareas previas.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* EXPORTAR */}
              <button
                type="button"
                onClick={handleExportJson}
                style={{
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "12px 18px",
                  fontSize: "13px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <span>📥 Descargar Copia de Seguridad JSON</span>
              </button>

              {/* IMPORTAR */}
              <label
                style={{
                  background: "#f1f5f9",
                  border: "1.5px dashed #cbd5e1",
                  borderRadius: "8px",
                  padding: "14px 18px",
                  textAlign: "center",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#334155",
                  display: "block",
                }}
              >
                <span>📤 Importar Ejercicios desde Archivo JSON</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportJson}
                  style={{ display: "none" }}
                />
              </label>

              {/* RESTABLECER A BASE */}
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("¿Restablecer la biblioteca a los 5 ejercicios tácticos base? (No afectará a las copias de seguridad descargadas)")) {
                    persistEjercicios(EJERCICIOS_BASE_INICIALES);
                    setBackupModalOpen(false);
                  }
                }}
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#dc2626",
                  borderRadius: "8px",
                  padding: "10px",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                  marginTop: "8px",
                }}
              >
                ⚠️ Reiniciar Biblioteca a Ejercicios Base
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
