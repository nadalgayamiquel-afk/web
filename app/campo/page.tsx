"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  CampoEjercicio,
  CampoSesionFicha,
  CampoCategoriaEjercicio,
  CampoSesionBloqueItem,
  BENCHMARKS_CATEGORIA_DEFECTO,
  TARGETS_MICROCICLO_MD,
} from "./campo-types";
import EjercicioModal from "./EjercicioModal";
import SesionFichaManager from "./SesionFichaManager";
import CalculadoraCarga from "./CalculadoraCarga";
import SesionGpsAnalysis from "./SesionGpsAnalysis";
import { getActiveJugadores } from "@/app/actions";

const EJERCICIOS_STORAGE_KEY = "campo_ejercicios_v1";
const SESIONES_STORAGE_KEY = "campo_sesiones_v1";

const CATEGORIAS_LIST: Array<{ id: CampoCategoriaEjercicio; label: string; icon: string }> = [
  { id: "RONDO", label: "Rondos & Ruedas", icon: "🔄" },
  { id: "POSESION", label: "Juegos de Posición", icon: "🛡️" },
  { id: "SSG_REDUCIDO", label: "Espacio Reducido (SSG)", icon: "⚡" },
  { id: "LSG_AMPLIO", label: "Espacio Amplio (LSG)", icon: "📐" },
  { id: "FINALIZACION", label: "Finalizaciones & Remates", icon: "🎯" },
  { id: "ABP", label: "Balón Parado (ABP)", icon: "⛳" },
  { id: "TRANSICION", label: "Transiciones Rápidas", icon: "🚀" },
  { id: "FISICO_TECNICO", label: "Físico-Técnico / Circuitos", icon: "🏃" },
  { id: "CALENTAMIENTO", label: "Calentamiento & Activación", icon: "🔥" },
  { id: "OTRO", label: "Otros Ejercicios", icon: "⚽" },
];

// Ejercicios iniciales de arranque con la estructura completa de CampoEjercicio
const EJERCICIOS_DEFAULT: CampoEjercicio[] = [
  {
    id: "ej-def-1",
    nombre: "Rondo de Presión Tras Pérdida 4v4 + 3C",
    categoria: "RONDO",
    subcategoria: "MD-3 Potencia",
    faseJuego: "TRANSICION_DEF",
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
  },
  {
    id: "ej-def-2",
    nombre: "Juego de Posición 6v6 + 2 Comodines con 2 Zonas",
    categoria: "POSESION",
    subcategoria: "MD-4 Capacidad",
    faseJuego: "ATAQUE",
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
  },
];

export default function CampoPage() {
  const [activeTab, setActiveTab] = useState<"ejercicios" | "sesion" | "calculadora" | "gps">("ejercicios");
  const [ejercicios, setEjercicios] = useState<CampoEjercicio[]>([]);
  const [sesiones, setSesiones] = useState<CampoSesionFicha[]>([]);
  const [modalEjercicioOpen, setModalEjercicioOpen] = useState(false);
  const [editingEjercicio, setEditingEjercicio] = useState<CampoEjercicio | null>(null);

  // Datos para GPS y plantilla
  const [allGpsRows, setAllGpsRows] = useState<any[]>([]);
  const [allJugadores, setAllJugadores] = useState<any[]>([]);
  const [selectedGpsDate, setSelectedGpsDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  // Filtros biblioteca
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategoria, setFilterCategoria] = useState<string>("todas");
  const [filterMd, setFilterMd] = useState<string>("todos");

  // Cargar ejercicios y sesiones de localStorage al montar
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedEj = localStorage.getItem(EJERCICIOS_STORAGE_KEY);
      if (storedEj) {
        const parsed = JSON.parse(storedEj);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEjercicios(parsed);
        } else {
          setEjercicios(EJERCICIOS_DEFAULT);
          localStorage.setItem(EJERCICIOS_STORAGE_KEY, JSON.stringify(EJERCICIOS_DEFAULT));
        }
      } else {
        setEjercicios(EJERCICIOS_DEFAULT);
        localStorage.setItem(EJERCICIOS_STORAGE_KEY, JSON.stringify(EJERCICIOS_DEFAULT));
      }

      const storedSes = localStorage.getItem(SESIONES_STORAGE_KEY);
      if (storedSes) {
        setSesiones(JSON.parse(storedSes));
      }
    } catch (err) {
      console.error("Error al cargar de localStorage en /campo:", err);
      setEjercicios(EJERCICIOS_DEFAULT);
    }
  }, []);

  // Cargar datos GPS y jugadores para el módulo GPS
  useEffect(() => {
    async function loadGpsAndPlayers() {
      try {
        const jug = await getActiveJugadores();
        if (Array.isArray(jug)) setAllJugadores(jug);
      } catch (e) {
        console.warn("No se pudieron cargar jugadores:", e);
      }

      try {
        const resp = await fetch("/gps_datos_synced.json");
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data)) setAllGpsRows(data);
        }
      } catch (e) {
        console.warn("No se pudo cargar /gps_datos_synced.json:", e);
      }
    }
    loadGpsAndPlayers();
  }, []);

  // Guardar ejercicios
  const handleSaveEjercicio = (ejercicio: CampoEjercicio) => {
    let updated: CampoEjercicio[];
    const exists = ejercicios.some((e) => e.id === ejercicio.id);
    if (exists) {
      updated = ejercicios.map((e) => (e.id === ejercicio.id ? ejercicio : e));
    } else {
      updated = [ejercicio, ...ejercicios];
    }
    setEjercicios(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem(EJERCICIOS_STORAGE_KEY, JSON.stringify(updated));
    }
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
    setEjercicios(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem(EJERCICIOS_STORAGE_KEY, JSON.stringify(updated));
    }
  };

  // Eliminar ejercicio
  const handleDelete = (id: string) => {
    if (!window.confirm("¿Estás seguro de eliminar este ejercicio de la biblioteca?")) return;
    const updated = ejercicios.filter((e) => e.id !== id);
    setEjercicios(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem(EJERCICIOS_STORAGE_KEY, JSON.stringify(updated));
    }
  };

  // Guardar ficha de sesión
  const handleSaveSesion = (ses: CampoSesionFicha) => {
    let updated: CampoSesionFicha[];
    const idx = sesiones.findIndex((s) => s.id === ses.id);
    if (idx >= 0) {
      updated = [...sesiones];
      updated[idx] = ses;
    } else {
      updated = [ses, ...sesiones];
    }
    setSesiones(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem(SESIONES_STORAGE_KEY, JSON.stringify(updated));
    }
  };

  // Eliminar ficha de sesión
  const handleDeleteSesion = (id: string) => {
    if (!window.confirm("¿Eliminar esta ficha de sesión?")) return;
    const updated = sesiones.filter((s) => s.id !== id);
    setSesiones(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem(SESIONES_STORAGE_KEY, JSON.stringify(updated));
    }
  };

  // Exportar desde calculadora a ficha de sesión
  const handleExportFromCalculadora = (items: CampoSesionBloqueItem[], md: string) => {
    const today = new Date().toISOString().split("T")[0];
    const nuevaSesion: CampoSesionFicha = {
      id: `ses-${Date.now()}`,
      fecha: today,
      microcicloMd: md,
      instalacion: "Nou Sardenya",
      objetivoPrincipal: `Sesión ${md} calculada por objetivos de carga`,
      duracionEstimadaMin: items.reduce((acc, it) => acc + it.tiempoTotalMin, 0),
      bloques: [
        {
          id: "b-calc-1",
          nombre: "Parte Principal (Calculada)",
          orden: 1,
          items,
        },
      ],
      metricasEstimadas: {
        duracionTotalMin: items.reduce((acc, it) => acc + it.tiempoTotalMin, 0),
        distanciaTotalM: Math.round(items.reduce((acc, it) => acc + (it.ejercicioSnapshot?.perfilGps.mMin || 90) * it.tiempoTrabajoMin, 0)),
        hsrTotalM: Math.round(items.reduce((acc, it) => acc + (it.ejercicioSnapshot?.perfilGps.hsrMin || 5) * it.tiempoTrabajoMin, 0)),
        sprintTotalM: Math.round(items.reduce((acc, it) => acc + (it.ejercicioSnapshot?.perfilGps.sprintMin || 1) * it.tiempoTrabajoMin, 0)),
        accTotal: Math.round(items.reduce((acc, it) => acc + (it.ejercicioSnapshot?.perfilGps.accMin || 1.5) * it.tiempoTrabajoMin, 0)),
        playerLoadTotal: Math.round(items.reduce((acc, it) => acc + (it.ejercicioSnapshot?.perfilGps.playerLoadMin || 10) * it.tiempoTrabajoMin, 0)),
      },
      estado: "planificada",
      creadaEn: new Date().toISOString(),
    };
    handleSaveSesion(nuevaSesion);
    setActiveTab("sesion");
  };

  // Filtrado de ejercicios
  const filteredEjercicios = useMemo(() => {
    return ejercicios.filter((ej) => {
      if (filterCategoria !== "todas" && ej.categoria !== filterCategoria) return false;
      if (filterMd !== "todos") {
        const sub = (ej.subcategoria || "").toUpperCase();
        if (!sub.includes(filterMd.toUpperCase())) return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const inTitle = ej.nombre.toLowerCase().includes(q);
        const inSub = (ej.subcategoria || "").toLowerCase().includes(q);
        const inObj = (ej.consignas.objetivoPrincipal || "").toLowerCase().includes(q);
        if (!inTitle && !inSub && !inObj) return false;
      }
      return true;
    });
  }, [ejercicios, filterCategoria, filterMd, searchTerm]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "inherit" }}>
      {/* HEADER SUPERIOR CON NAVEGACIÓN Y ACCIONES */}
      <header
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          position: "sticky",
          top: 0,
          zIndex: 30,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <Link
            href="/"
            style={{
              fontSize: "12px",
              fontWeight: 800,
              color: "#475569",
              textDecoration: "none",
              background: "#f1f5f9",
              padding: "7px 12px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
            }}
          >
            ← Volver al Menú
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #1e3a8a, #0284c7)",
                display: "grid",
                placeItems: "center",
                color: "#ffffff",
                fontSize: "18px",
                boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)",
              }}
            >
              ⚽
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h1 style={{ fontSize: "17px", fontWeight: 900, color: "#0f172a", margin: 0, letterSpacing: "-0.3px" }}>
                  Área de Campo & Táctica
                </h1>
                <span
                  style={{
                    background: "#e0f2fe",
                    color: "#0284c7",
                    fontSize: "10px",
                    fontWeight: 900,
                    padding: "2px 8px",
                    borderRadius: "999px",
                    textTransform: "uppercase",
                  }}
                >
                  Suite 1RFEF
                </span>
              </div>
              <p style={{ fontSize: "11px", color: "#64748b", margin: 0 }}>
                Diseñador táctico, fichas de sesión, calculadora de carga por MD y vinculación GPS
              </p>
            </div>
          </div>
        </div>

        {/* BOTÓN CREAR EJERCICIO DIRECTO */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
              background: "linear-gradient(135deg, #0284c7, #1e3a8a)",
              color: "#ffffff",
              fontSize: "12px",
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 6px rgba(2, 132, 199, 0.35)",
            }}
          >
            <span>✨</span>
            <span>Nuevo Ejercicio con Pizarra</span>
          </button>
        </div>
      </header>

      {/* BARRA DE PESTAÑAS PRINCIPALES */}
      <div
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          padding: "0 24px",
          display: "flex",
          gap: "4px",
          overflowX: "auto",
        }}
      >
        {[
          { id: "ejercicios", label: "📚 Biblioteca de Ejercicios", count: ejercicios.length },
          { id: "sesion", label: "📋 Creador Ficha de Sesión", count: sesiones.length },
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
                padding: "12px 18px",
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
                    padding: "2px 6px",
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

      {/* CONTENIDO PRINCIPAL SEGÚN PESTAÑA */}
      <main style={{ maxWidth: "1600px", margin: "0 auto", padding: "20px 24px" }}>
        {/* ========================================================================= */}
        {/* TAB 1: BIBLIOTECA DE EJERCICIOS & PIZARRA                                 */}
        {/* ========================================================================= */}
        {activeTab === "ejercicios" && (
          <div>
            {/* BARRA DE FILTROS Y BÚSQUEDA */}
            <div
              style={{
                background: "#ffffff",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                padding: "16px",
                marginBottom: "20px",
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                alignItems: "center",
                justifyContent: "space-between",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", flex: 1 }}>
                {/* Input Búsqueda */}
                <div style={{ position: "relative", minWidth: "260px" }}>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="🔍 Buscar por nombre, objetivo, categoría..."
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                      fontWeight: 600,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      style={{
                        position: "absolute",
                        right: "8px",
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

                {/* Filtro Categoría */}
                <select
                  value={filterCategoria}
                  onChange={(e) => setFilterCategoria(e.target.value)}
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
                  <option value="todas">Todas las categorías ({ejercicios.length})</option>
                  {CATEGORIAS_LIST.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.label}
                    </option>
                  ))}
                </select>

                {/* Filtro Microciclo MD */}
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
                  <option value="MD-3">MD-3 (Potencia / Espacios Reducidos)</option>
                  <option value="MD-2">MD-2 (Velocidad / Reactividad)</option>
                  <option value="MD-1">MD-1 (Activación / Balón Parado)</option>
                  <option value="MD+1">MD+1 (Recuperación / Compensatorio)</option>
                </select>
              </div>

              <div style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
                Mostrando <strong style={{ color: "#0f172a" }}>{filteredEjercicios.length}</strong> de{" "}
                {ejercicios.length} tareas
              </div>
            </div>

            {/* GRILLA DE TARJETAS DE EJERCICIO */}
            {filteredEjercicios.length === 0 ? (
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: "12px",
                  border: "2px dashed #cbd5e1",
                  padding: "60px 20px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "40px", marginBottom: "12px" }}>⚽</div>
                <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#1e293b", margin: "0 0 6px 0" }}>
                  No se encontraron ejercicios con estos filtros
                </h3>
                <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 16px 0" }}>
                  Prueba a limpiar la búsqueda o crea un nuevo ejercicio desde cero.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setFilterCategoria("todas");
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
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
                  gap: "20px",
                }}
              >
                {filteredEjercicios.map((ej) => {
                  const catInfo = CATEGORIAS_LIST.find((c) => c.id === ej.categoria);
                  const elementsCount = ej.diagrama?.elementos?.length || 0;

                  return (
                    <div
                      key={ej.id}
                      style={{
                        background: "#ffffff",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {/* MINIATURA PIZARRA TÁCTICA */}
                      <div
                        style={{
                          height: "170px",
                          background: "#044320",
                          position: "relative",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderBottom: "1px solid #e2e8f0",
                        }}
                      >
                        {/* Mini preview SVG de elementos */}
                        <svg
                          viewBox="0 0 100 100"
                          style={{
                            width: "100%",
                            height: "100%",
                            opacity: 0.9,
                          }}
                        >
                          {/* Campo básico */}
                          <rect x="5" y="5" width="90" height="90" fill="#0b5e2b" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.4" rx="2" />
                          <circle cx="50" cy="50" r="14" fill="none" stroke="#ffffff" strokeWidth="0.8" strokeOpacity="0.3" />
                          <line x1="50" y1="5" x2="50" y2="95" stroke="#ffffff" strokeWidth="0.8" strokeOpacity="0.3" />

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
                            background: "rgba(15, 23, 42, 0.8)",
                            backdropFilter: "blur(4px)",
                            color: "#ffffff",
                            fontSize: "10px",
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

                        {/* Badge Tiempo Total arriba derecha */}
                        <div
                          style={{
                            position: "absolute",
                            top: "8px",
                            right: "8px",
                            background: "rgba(2, 132, 199, 0.9)",
                            color: "#ffffff",
                            fontSize: "11px",
                            fontWeight: 900,
                            padding: "3px 8px",
                            borderRadius: "6px",
                          }}
                        >
                          ⏱️ {ej.estructura.tiempoTotalMin} min
                        </div>

                        {/* Contador de elementos pizarra abajo izquierda */}
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
                      <div style={{ padding: "14px", flex: 1, display: "flex", flexDirection: "column" }}>
                        <h4
                          style={{
                            fontSize: "14px",
                            fontWeight: 900,
                            color: "#0f172a",
                            margin: "0 0 4px 0",
                            lineHeight: 1.3,
                          }}
                        >
                          {ej.nombre}
                        </h4>
                        {ej.subcategoria && (
                          <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, marginBottom: "8px" }}>
                            {ej.subcategoria}
                          </div>
                        )}

                        {/* OBJETIVO TÁCTICO */}
                        <div style={{ fontSize: "11px", color: "#475569", marginBottom: "12px", lineHeight: 1.3 }}>
                          <strong>Obj:</strong> {ej.consignas.objetivoPrincipal}
                        </div>

                        {/* DATOS CLAVE: ESPACIO, JUGADORES Y W:R */}
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
                            <div style={{ fontSize: "9px", color: "#0284c7", fontWeight: 700 }}>
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
                              Densidad
                            </div>
                            <div style={{ fontSize: "11px", fontWeight: 800, color: "#1e293b", marginTop: "1px" }}>
                              {ej.estructura.series}x{ej.estructura.tiempoTrabajoSeg / 60}'
                            </div>
                            <div style={{ fontSize: "9px", color: "#16a34a", fontWeight: 800 }}>
                              W:R {ej.estructura.ratioWR}
                            </div>
                          </div>
                        </div>

                        {/* ESTIMACIÓN GPS PREVIA */}
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
                            <div style={{ fontSize: "8.5px", color: "#64748b", fontWeight: 700 }}>DIST/MIN</div>
                            <div style={{ fontWeight: 800, color: "#0284c7" }}>
                              {ej.perfilGps.mMin} m
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: "8.5px", color: "#64748b", fontWeight: 700 }}>HSR &gt;21</div>
                            <div style={{ fontWeight: 800, color: "#d97706" }}>
                              {ej.perfilGps.hsrMin} m
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: "8.5px", color: "#64748b", fontWeight: 700 }}>ACC &gt;3</div>
                            <div style={{ fontWeight: 800, color: "#16a34a" }}>
                              {ej.perfilGps.accMin} /m
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: "8.5px", color: "#64748b", fontWeight: 700 }}>PL/MIN</div>
                            <div style={{ fontWeight: 800, color: "#7c3aed" }}>
                              {ej.perfilGps.playerLoadMin}
                            </div>
                          </div>
                        </div>

                        {/* BOTONES DE ACCIÓN */}
                        <div style={{ display: "flex", gap: "6px", marginTop: "auto" }}>
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
                            <span>Editar & Pizarra</span>
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
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: CREADOR DE FICHA DE SESIÓN (ORDENACIÓN, BLOQUES, PDF)              */}
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
        {/* TAB 3: CALCULADORA DE CARGA POR EJERCICIOS ANTERIORES & MD TARGETS        */}
        {/* ========================================================================= */}
        {activeTab === "calculadora" && (
          <CalculadoraCarga
            ejerciciosDB={ejercicios}
            onExportToSesion={handleExportFromCalculadora}
          />
        )}

        {/* ========================================================================= */}
        {/* TAB 4: SESIÓN CON DATOS GPS POST-SESIÓN (BBDD gps_datos)                  */}
        {/* ========================================================================= */}
        {activeTab === "gps" && (
          <div>
            <div
              style={{
                background: "#ffffff",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                padding: "14px 18px",
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div>
                <h3 style={{ fontSize: "15px", fontWeight: 900, color: "#0f172a", margin: "0 0 3px 0" }}>
                  📡 Vinculación Post-Sesión con Dispositivos GPS (BBDD)
                </h3>
                <p style={{ fontSize: "11px", color: "#64748b", margin: 0 }}>
                  Compara los metros, HSR, sprints y Player Load reales registrados con la planificación.
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
                    padding: "6px 12px",
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

      {/* MODAL CREADOR / EDITOR DE EJERCICIO CON PIZARRA TÁCTICA */}
      <EjercicioModal
        ejercicio={editingEjercicio}
        isOpen={modalEjercicioOpen}
        onSave={handleSaveEjercicio}
        onClose={() => {
          setModalEjercicioOpen(false);
          setEditingEjercicio(null);
        }}
      />
    </div>
  );
}
