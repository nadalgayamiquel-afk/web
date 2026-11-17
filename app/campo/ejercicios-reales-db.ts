// Ejercicios reales extraídos directamente de la base de datos de dispositivos GPS (gps_datos_synced.json)
// Promedios históricos reales basados en cientos de repeticiones registradas en el 1er equipo

import { CampoEjercicio } from "./campo-types";

export const EJERCICIOS_REALES_DB: CampoEjercicio[] = [
  {
    id: "ej-bbdd-1",
    nombre: "ACTIVACIÓN",
    categoria: "CALENTAMIENTO",
    subcategoria: "BBDD Real GPS (311 registros en -2 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 600,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 10,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (311 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 76 m/min | HSR: 0.3 m/min | Acc: 0.18/min | PL: 1.1/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 76,
      hsrMin: 0.3,
      sprintMin: 0.01,
      accMin: 0.18,
      playerLoadMin: 1.1
    },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-2",
    nombre: "OLEADAS (TRANSICIONES)",
    categoria: "TRANSICION",
    subcategoria: "BBDD Real GPS (174 registros en -3 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 780,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 13,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (174 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 101 m/min | HSR: 4.7 m/min | Acc: 0.52/min | PL: 8.1/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 101,
      hsrMin: 4.7,
      sprintMin: 1.3,
      accMin: 0.52,
      playerLoadMin: 8.1
    },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-3",
    nombre: "JDP MEDIO",
    categoria: "POSESION",
    subcategoria: "BBDD Real GPS (148 registros en -4 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 960,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 16,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (148 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 81 m/min | HSR: 1.4 m/min | Acc: 0.6/min | PL: 4/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 81,
      hsrMin: 1.4,
      sprintMin: 0.21,
      accMin: 0.6,
      playerLoadMin: 4
    },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-4",
    nombre: "JDP PEQUEÑO",
    categoria: "POSESION",
    subcategoria: "BBDD Real GPS (124 registros en -4 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 900,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 15,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (124 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 63 m/min | HSR: 0.1 m/min | Acc: 0.54/min | PL: 2/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 63,
      hsrMin: 0.1,
      sprintMin: 0,
      accMin: 0.54,
      playerLoadMin: 2
    },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-5",
    nombre: "PARTIDOS REDUCIDOS",
    categoria: "SSG_REDUCIDO",
    subcategoria: "BBDD Real GPS (115 registros en -1 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 780,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 13,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (115 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 79 m/min | HSR: 0.6 m/min | Acc: 0.74/min | PL: 4.5/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 79,
      hsrMin: 0.6,
      sprintMin: 0.02,
      accMin: 0.74,
      playerLoadMin: 4.5
    },
    diagrama: {
      pitchType: "area_penalti",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-6",
    nombre: "ABP",
    categoria: "ABP",
    subcategoria: "BBDD Real GPS (112 registros en -2 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 1200,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 20,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (112 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 23 m/min | HSR: 0.2 m/min | Acc: 0.11/min | PL: 0.9/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 23,
      hsrMin: 0.2,
      sprintMin: 0.02,
      accMin: 0.11,
      playerLoadMin: 0.9
    },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-7",
    nombre: "RONDO PRESIÓN",
    categoria: "RONDO",
    subcategoria: "BBDD Real GPS (97 registros en -2 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 900,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 15,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (97 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 50 m/min | HSR: 0.1 m/min | Acc: 0.46/min | PL: 2.2/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 50,
      hsrMin: 0.1,
      sprintMin: 0,
      accMin: 0.46,
      playerLoadMin: 2.2
    },
    diagrama: {
      pitchType: "reducido",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-8",
    nombre: "FINALIZACIONES",
    categoria: "FINALIZACION",
    subcategoria: "BBDD Real GPS (92 registros en -1 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 960,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 16,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (92 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 48 m/min | HSR: 1.6 m/min | Acc: 0.28/min | PL: 3.4/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 48,
      hsrMin: 1.6,
      sprintMin: 0.2,
      accMin: 0.28,
      playerLoadMin: 3.4
    },
    diagrama: {
      pitchType: "area_penalti",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-9",
    nombre: "ACTIVACIÓN PREPARTIDO",
    categoria: "CALENTAMIENTO",
    subcategoria: "BBDD Real GPS (60 registros en MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 1200,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 20,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (60 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 78 m/min | HSR: 1.4 m/min | Acc: 0.46/min | PL: 3.7/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 78,
      hsrMin: 1.4,
      sprintMin: 0.33,
      accMin: 0.46,
      playerLoadMin: 3.7
    },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-10",
    nombre: "RONDOS",
    categoria: "RONDO",
    subcategoria: "BBDD Real GPS (60 registros en -2 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 1140,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 19,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (60 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 33 m/min | HSR: 0.1 m/min | Acc: 0.13/min | PL: 0.5/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 33,
      hsrMin: 0.1,
      sprintMin: 0,
      accMin: 0.13,
      playerLoadMin: 0.5
    },
    diagrama: {
      pitchType: "reducido",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-11",
    nombre: "RDP",
    categoria: "FISICO_TECNICO",
    subcategoria: "BBDD Real GPS (58 registros en -5 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 780,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 13,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (58 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 88 m/min | HSR: 0.3 m/min | Acc: 0.27/min | PL: 1.5/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 88,
      hsrMin: 0.3,
      sprintMin: 0,
      accMin: 0.27,
      playerLoadMin: 1.5
    },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-12",
    nombre: "PARTIDO MEDIO CAMPO",
    categoria: "SSG_REDUCIDO",
    subcategoria: "BBDD Real GPS (52 registros en -2 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 840,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 14,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (52 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 89 m/min | HSR: 2.2 m/min | Acc: 0.61/min | PL: 4.1/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 89,
      hsrMin: 2.2,
      sprintMin: 0.28,
      accMin: 0.61,
      playerLoadMin: 4.1
    },
    diagrama: {
      pitchType: "area_penalti",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-13",
    nombre: "CARRERAS",
    categoria: "FISICO_TECNICO",
    subcategoria: "BBDD Real GPS (45 registros en -2 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 300,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 5,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (45 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 132 m/min | HSR: 46 m/min | Acc: 0.51/min | PL: 40.6/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 132,
      hsrMin: 46,
      sprintMin: 9.08,
      accMin: 0.51,
      playerLoadMin: 40.6
    },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-14",
    nombre: "AT-DEF 1X1 - 2X2...",
    categoria: "FINALIZACION",
    subcategoria: "BBDD Real GPS (40 registros en -4 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 1440,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 24,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (40 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 60 m/min | HSR: 5.6 m/min | Acc: 0.43/min | PL: 8.9/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 60,
      hsrMin: 5.6,
      sprintMin: 2.03,
      accMin: 0.43,
      playerLoadMin: 8.9
    },
    diagrama: {
      pitchType: "area_penalti",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-15",
    nombre: "PARTIDO",
    categoria: "LSG_AMPLIO",
    subcategoria: "BBDD Real GPS (39 registros en -3 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 960,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 16,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (39 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 100 m/min | HSR: 5 m/min | Acc: 0.45/min | PL: 8/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 100,
      hsrMin: 5,
      sprintMin: 1.39,
      accMin: 0.45,
      playerLoadMin: 8
    },
    diagrama: {
      pitchType: "completo_horizontal",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-16",
    nombre: "REACTIVACIÓN",
    categoria: "CALENTAMIENTO",
    subcategoria: "BBDD Real GPS (38 registros en -2 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 300,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 5,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (38 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 67 m/min | HSR: 2.4 m/min | Acc: 0.22/min | PL: 3.3/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 67,
      hsrMin: 2.4,
      sprintMin: 1.01,
      accMin: 0.22,
      playerLoadMin: 3.3
    },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-17",
    nombre: "SALIDA DE BALON",
    categoria: "LSG_AMPLIO",
    subcategoria: "BBDD Real GPS (38 registros en -2 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 1020,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 17,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (38 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 68 m/min | HSR: 2.6 m/min | Acc: 0.36/min | PL: 4.7/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 68,
      hsrMin: 2.6,
      sprintMin: 0.37,
      accMin: 0.36,
      playerLoadMin: 4.7
    },
    diagrama: {
      pitchType: "completo_horizontal",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-18",
    nombre: "PARTIDO ABP",
    categoria: "ABP",
    subcategoria: "BBDD Real GPS (20 registros en -1 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 1380,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 23,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (20 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 79 m/min | HSR: 3.2 m/min | Acc: 0.56/min | PL: 7.1/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 79,
      hsrMin: 3.2,
      sprintMin: 0.53,
      accMin: 0.56,
      playerLoadMin: 7.1
    },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-19",
    nombre: "TRICOLOR",
    categoria: "POSESION",
    subcategoria: "BBDD Real GPS (20 registros en -2 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 720,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 12,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (20 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 66 m/min | HSR: 0.2 m/min | Acc: 0.5/min | PL: 2.7/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 66,
      hsrMin: 0.2,
      sprintMin: 0,
      accMin: 0.5,
      playerLoadMin: 2.7
    },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-20",
    nombre: "SPRINT",
    categoria: "FISICO_TECNICO",
    subcategoria: "BBDD Real GPS (20 registros en -3 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 180,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 3,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (20 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 103 m/min | HSR: 26.3 m/min | Acc: 0.47/min | PL: 28.3/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 103,
      hsrMin: 26.3,
      sprintMin: 14.85,
      accMin: 0.47,
      playerLoadMin: 28.3
    },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-21",
    nombre: "EVOLUCIONES",
    categoria: "LSG_AMPLIO",
    subcategoria: "BBDD Real GPS (20 registros en -2 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 960,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 16,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (20 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 60 m/min | HSR: 0.8 m/min | Acc: 0.68/min | PL: 4/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 60,
      hsrMin: 0.8,
      sprintMin: 0.06,
      accMin: 0.68,
      playerLoadMin: 4
    },
    diagrama: {
      pitchType: "completo_horizontal",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-22",
    nombre: "JDP GRANDE",
    categoria: "LSG_AMPLIO",
    subcategoria: "BBDD Real GPS (20 registros en -3 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 1080,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 18,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (20 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 87 m/min | HSR: 6.1 m/min | Acc: 0.57/min | PL: 9.1/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 87,
      hsrMin: 6.1,
      sprintMin: 1.58,
      accMin: 0.57,
      playerLoadMin: 9.1
    },
    diagrama: {
      pitchType: "completo_horizontal",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-23",
    nombre: "SPRINTS",
    categoria: "FISICO_TECNICO",
    subcategoria: "BBDD Real GPS (20 registros en -3 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 120,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 2,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (20 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 95 m/min | HSR: 44.5 m/min | Acc: 0.63/min | PL: 48/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 95,
      hsrMin: 44.5,
      sprintMin: 24.3,
      accMin: 0.63,
      playerLoadMin: 48
    },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-24",
    nombre: "RDP SAQUE DE BANDA",
    categoria: "FISICO_TECNICO",
    subcategoria: "BBDD Real GPS (20 registros en -3 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 840,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 14,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (20 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 77 m/min | HSR: 0.1 m/min | Acc: 0.39/min | PL: 2/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 77,
      hsrMin: 0.1,
      sprintMin: 0,
      accMin: 0.39,
      playerLoadMin: 2
    },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-25",
    nombre: "JDP 9X9+2",
    categoria: "LSG_AMPLIO",
    subcategoria: "BBDD Real GPS (20 registros en -3 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 1080,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 18,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (20 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 80 m/min | HSR: 1 m/min | Acc: 0.61/min | PL: 4.4/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 80,
      hsrMin: 1,
      sprintMin: 0.13,
      accMin: 0.61,
      playerLoadMin: 4.4
    },
    diagrama: {
      pitchType: "completo_horizontal",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-26",
    nombre: "PARTIDOS REDUCIDOS DEFENSA AREA",
    categoria: "SSG_REDUCIDO",
    subcategoria: "BBDD Real GPS (19 registros en -4 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 1380,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 23,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (19 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 79 m/min | HSR: 1.9 m/min | Acc: 0.49/min | PL: 4.7/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 79,
      hsrMin: 1.9,
      sprintMin: 0.16,
      accMin: 0.49,
      playerLoadMin: 4.7
    },
    diagrama: {
      pitchType: "area_penalti",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-27",
    nombre: "5X4 REDUCIDO",
    categoria: "SSG_REDUCIDO",
    subcategoria: "BBDD Real GPS (19 registros en -4 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 840,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 14,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (19 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 60 m/min | HSR: 0.3 m/min | Acc: 0.51/min | PL: 3/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 60,
      hsrMin: 0.3,
      sprintMin: 0.04,
      accMin: 0.51,
      playerLoadMin: 3
    },
    diagrama: {
      pitchType: "area_penalti",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-28",
    nombre: "RONDO 3 EQUIPOS 2 ZONAS",
    categoria: "RONDO",
    subcategoria: "BBDD Real GPS (19 registros en -1 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 960,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 16,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (19 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 59 m/min | HSR: 0.1 m/min | Acc: 0.55/min | PL: 2.4/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 59,
      hsrMin: 0.1,
      sprintMin: 0,
      accMin: 0.55,
      playerLoadMin: 2.4
    },
    diagrama: {
      pitchType: "reducido",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-29",
    nombre: "REDUCIDOS",
    categoria: "SSG_REDUCIDO",
    subcategoria: "BBDD Real GPS (19 registros en -1 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 720,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 12,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (19 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 76 m/min | HSR: 0.4 m/min | Acc: 0.67/min | PL: 3.9/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 76,
      hsrMin: 0.4,
      sprintMin: 0,
      accMin: 0.67,
      playerLoadMin: 3.9
    },
    diagrama: {
      pitchType: "area_penalti",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-30",
    nombre: "PARTIDOS REDUCIDOS / RONDO COMPETIVOS",
    categoria: "RONDO",
    subcategoria: "BBDD Real GPS (19 registros en -4 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 1440,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 24,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (19 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 78 m/min | HSR: 1.2 m/min | Acc: 0.62/min | PL: 4.6/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 78,
      hsrMin: 1.2,
      sprintMin: 0.21,
      accMin: 0.62,
      playerLoadMin: 4.6
    },
    diagrama: {
      pitchType: "reducido",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-31",
    nombre: "RONDOS 5X2",
    categoria: "RONDO",
    subcategoria: "BBDD Real GPS (18 registros en -2 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 900,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 15,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (18 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 58 m/min | HSR: 0.3 m/min | Acc: 0.14/min | PL: 0.9/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 58,
      hsrMin: 0.3,
      sprintMin: 0,
      accMin: 0.14,
      playerLoadMin: 0.9
    },
    diagrama: {
      pitchType: "reducido",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-32",
    nombre: "RDP GRANDE",
    categoria: "FISICO_TECNICO",
    subcategoria: "BBDD Real GPS (18 registros en -3 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 960,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 16,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (18 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 95 m/min | HSR: 0.1 m/min | Acc: 0.38/min | PL: 1.8/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 95,
      hsrMin: 0.1,
      sprintMin: 0,
      accMin: 0.38,
      playerLoadMin: 1.8
    },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-33",
    nombre: "RONDO",
    categoria: "RONDO",
    subcategoria: "BBDD Real GPS (17 registros en +1 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 960,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 16,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (17 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 41 m/min | HSR: 0.1 m/min | Acc: 0.17/min | PL: 0.5/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 41,
      hsrMin: 0.1,
      sprintMin: 0,
      accMin: 0.17,
      playerLoadMin: 0.5
    },
    diagrama: {
      pitchType: "reducido",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-34",
    nombre: "EVOLUCIONES DIRIGIDAS",
    categoria: "LSG_AMPLIO",
    subcategoria: "BBDD Real GPS (11 registros en -4 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 960,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 16,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (11 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 48 m/min | HSR: 0.6 m/min | Acc: 0.3/min | PL: 2.4/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 48,
      hsrMin: 0.6,
      sprintMin: 0.07,
      accMin: 0.3,
      playerLoadMin: 2.4
    },
    diagrama: {
      pitchType: "completo_horizontal",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-35",
    nombre: "CARRERA CONTINUA",
    categoria: "FISICO_TECNICO",
    subcategoria: "BBDD Real GPS (11 registros en +1 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 480,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 8,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (11 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 115 m/min | HSR: 0.1 m/min | Acc: 0.1/min | PL: 0.5/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 115,
      hsrMin: 0.1,
      sprintMin: 0,
      accMin: 0.1,
      playerLoadMin: 0.5
    },
    diagrama: {
      pitchType: "medio_campo",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-36",
    nombre: "PARTIDOS REDUCIDOS COMPENSATORIO",
    categoria: "SSG_REDUCIDO",
    subcategoria: "BBDD Real GPS (10 registros en +1 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 660,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 11,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (10 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 90 m/min | HSR: 1.1 m/min | Acc: 0.82/min | PL: 5.9/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 90,
      hsrMin: 1.1,
      sprintMin: 0.07,
      accMin: 0.82,
      playerLoadMin: 5.9
    },
    diagrama: {
      pitchType: "area_penalti",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  },
  {
    id: "ej-bbdd-37",
    nombre: "AT - DEF 2X2",
    categoria: "FINALIZACION",
    subcategoria: "BBDD Real GPS (8 registros en -4 MD)",
    faseJuego: "GLOBAL",
    dimensiones: { largoM: 40, anchoM: 30, m2Totales: 1200, m2PorJugador: 100 },
    jugadores: { atacantes: 6, defensores: 6, comodines: 0, porteros: 2, total: 14 },
    estructura: {
      series: 1,
      repsPorSerie: 1,
      tiempoTrabajoSeg: 960,
      tiempoDescansoSeg: 120,
      tiempoTotalMin: 16,
      ratioWR: "3:1"
    },
    consignas: {
      objetivoPrincipal: "Tarea real registrada en sesiones de campo (8 repeticiones monitorizadas con Catapult/GPS).",
      reglasProvocacion: "Datos reales BBDD: 47 m/min | HSR: 0.1 m/min | Acc: 0.49/min | PL: 2.4/min.",
      descripcion: "Ejercicio extraído del histórico de entrenamientos del 1er equipo.",
      materialNecesario: "Balones, petos y conos según diseño específico."
    },
    perfilGps: {
      mMin: 47,
      hsrMin: 0.1,
      sprintMin: 0,
      accMin: 0.49,
      playerLoadMin: 2.4
    },
    diagrama: {
      pitchType: "area_penalti",
      elementos: [
        { id: "e1", tipo: "jugador_a", x: 35, y: 40, color: "#ef4444", label: "A" },
        { id: "e2", tipo: "jugador_b", x: 65, y: 60, color: "#3b82f6", label: "B" },
        { id: "b1", tipo: "balon", x: 50, y: 50 }
      ],
      trazosLibres: []
    },
    creadoEn: "2026-11-17T00:00:00Z",
    actualizadoEn: "2026-11-17T00:00:00Z",
    autor: "BBDD GPS Europa"
  }
];
