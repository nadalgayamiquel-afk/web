// Tipos, configuraciones y modelos de datos para el módulo integral de Campo (Fútbol)

export type CampoPitchType =
  | "completo_horizontal"
  | "completo_vertical"
  | "medio_campo"
  | "area_penalti"
  | "reducido";

export type CampoElementType =
  | "jugador_a"      // Equipo A (Rojo / Azul)
  | "jugador_b"      // Equipo B (Blanco / Amarillo)
  | "comodin"        // Comodín neutral (Verde / Naranja)
  | "portero"        // Portero (Negro con guantes)
  | "balon"          // ⚽ Balón
  | "cono"           // 🛢️ Cono alto
  | "seta"           // 🔸 Chino / Seta delimitadora
  | "porteria"       // 🥅 Portería reglamentaria
  | "mini_porteria"  // 🥅 Portería pequeña
  | "silueta"        // 🛡️ Muñeco de barrera / Pica
  | "valla"          // 🪜 Valla de salto / Escalera
  | "flecha_pase"    // Flecha discontinua de pase
  | "flecha_carrera" // Flecha continua de carrera
  | "flecha_conduc"  // Flecha ondulada de conducción
  | "zona"           // Rectángulo de delimitación
  | "texto";         // Texto / Nota táctica

export interface CampoElementoGrafico {
  id: string;
  tipo: CampoElementType;
  x: number; // Porcentaje 0 - 100 relativo al lienzo
  y: number; // Porcentaje 0 - 100 relativo al lienzo
  rotation?: number; // Grados 0 - 360
  label?: string; // Dorsal, nombre o texto táctico
  color?: string; // Color personalizado
  width?: number; // Para zonas o porterías
  height?: number; // Para zonas
  endX?: number; // Para flechas (punto final)
  endY?: number; // Para flechas (punto final)
  curved?: boolean; // Para flechas con curvatura
}

export interface CampoFreeDrawPath {
  id: string;
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
}

export interface CampoDiagramaData {
  pitchType: CampoPitchType;
  elementos: CampoElementoGrafico[];
  trazosLibres?: CampoFreeDrawPath[];
  previewUrl?: string; // Data URL PNG para thumbnail
}

export type CampoCategoriaEjercicio =
  | "RONDO"
  | "POSESION"
  | "SSG_REDUCIDO"
  | "LSG_AMPLIO"
  | "FINALIZACION"
  | "ABP"
  | "TRANSICION"
  | "FISICO_TECNICO"
  | "CALENTAMIENTO"
  | "OTRO";

export interface CampoPerfilGpsEstimado {
  mMin: number;         // Metros por minuto estimados (ej. 80 - 130)
  hsrMin: number;       // Metros HSR (>21 km/h) por minuto (ej. 3 - 15)
  sprintMin: number;    // Metros Sprint (>24 km/h) por minuto (ej. 0.5 - 4)
  accMin: number;       // Aceleraciones (>3 m/s²) por minuto (ej. 0.8 - 2.5)
  playerLoadMin: number;// Player Load por minuto (ej. 8 - 16)
}

export interface CampoEjercicio {
  id: string;
  nombre: string;
  categoria: CampoCategoriaEjercicio;
  subcategoria?: string;
  faseJuego?: "ATAQUE" | "DEFENSA" | "TRANSICION_OF" | "TRANSICION_DEF" | "GLOBAL";
  
  // Dimensiones del espacio
  dimensiones: {
    largoM: number;
    anchoM: number;
    m2Totales: number;
    m2PorJugador: number;
  };

  // Jugadores
  jugadores: {
    atacantes: number;
    defensores: number;
    comodines: number;
    porteros: number;
    total: number;
  };

  // Estructura temporal
  estructura: {
    series: number;
    repsPorSerie: number;
    tiempoTrabajoSeg: number;
    tiempoDescansoSeg: number;
    tiempoTotalMin: number;
    ratioWR: string; // ej. "1:1", "2:1", "1:2"
  };

  // Metodología & Táctica
  consignas: {
    objetivoPrincipal: string;
    objetivoSecundario?: string;
    reglasProvocacion: string;
    descripcion: string;
    materialNecesario?: string;
    notasEntrenador?: string;
  };

  // Perfil GPS estimado
  perfilGps: CampoPerfilGpsEstimado;

  // Diseñador táctico
  diagrama: CampoDiagramaData;

  creadoEn: string;
  actualizadoEn: string;
  autor?: string;
}

export interface CampoSesionBloqueItem {
  id: string;
  ejercicioId?: string;
  ejercicioSnapshot?: CampoEjercicio;
  nombrePersonalizado?: string;
  series: number;
  tiempoTrabajoMin: number;
  pausaMin: number;
  tiempoTotalMin: number;
  orden: number;
}

export interface CampoSesionBloque {
  id: string;
  nombre: string; // ej. "Calentamiento / Activación", "Parte Principal - Tarea 1", etc.
  orden: number;
  items: CampoSesionBloqueItem[];
}

export interface CampoSesionFicha {
  id: string;
  fecha: string; // YYYY-MM-DD
  microcicloMd: string; // "MD-4", "MD-3", "MD-2", "MD-1", "MD+1", "MD", etc.
  horaInicio?: string;
  horaFin?: string;
  duracionEstimadaMin: number;
  instalacion: string; // "Nou Sardenya", "Can Dragó", etc.
  objetivoPrincipal: string;
  objetivoFisico?: string;
  bloques: CampoSesionBloque[];
  
  // Métricas totales calculadas
  metricasEstimadas: {
    duracionTotalMin: number;
    distanciaTotalM: number;
    hsrTotalM: number;
    sprintTotalM: number;
    accTotal: number;
    playerLoadTotal: number;
  };

  observacionesTecnicas?: string;
  estado: "planificada" | "completada";
  creadaEn: string;
}

// Perfiles estándar de referencia por categoría de ejercicio para la calculadora
export const BENCHMARKS_CATEGORIA_DEFECTO: Record<CampoCategoriaEjercicio, CampoPerfilGpsEstimado> = {
  RONDO: { mMin: 65, hsrMin: 1.2, sprintMin: 0.1, accMin: 1.8, playerLoadMin: 8.5 },
  POSESION: { mMin: 95, hsrMin: 5.5, sprintMin: 0.8, accMin: 2.2, playerLoadMin: 11.2 },
  SSG_REDUCIDO: { mMin: 105, hsrMin: 6.8, sprintMin: 0.6, accMin: 2.6, playerLoadMin: 12.8 },
  LSG_AMPLIO: { mMin: 115, hsrMin: 14.5, sprintMin: 3.2, accMin: 1.6, playerLoadMin: 12.0 },
  FINALIZACION: { mMin: 80, hsrMin: 8.0, sprintMin: 2.5, accMin: 1.5, playerLoadMin: 9.0 },
  ABP: { mMin: 45, hsrMin: 1.0, sprintMin: 0.2, accMin: 0.5, playerLoadMin: 5.0 },
  TRANSICION: { mMin: 120, hsrMin: 16.0, sprintMin: 4.0, accMin: 2.0, playerLoadMin: 13.5 },
  FISICO_TECNICO: { mMin: 110, hsrMin: 11.0, sprintMin: 2.0, accMin: 2.4, playerLoadMin: 12.5 },
  CALENTAMIENTO: { mMin: 70, hsrMin: 2.0, sprintMin: 0.2, accMin: 1.0, playerLoadMin: 7.5 },
  OTRO: { mMin: 85, hsrMin: 5.0, sprintMin: 1.0, accMin: 1.5, playerLoadMin: 10.0 },
};

// Targets recomendados de sesión según el día de microciclo (MD)
export const TARGETS_MICROCICLO_MD: Record<string, {
  label: string;
  enfoque: string;
  distanciaRangoM: [number, number];
  hsrRangoM: [number, number];
  sprintRangoM: [number, number];
  playerLoadRango: [number, number];
  color: string;
}> = {
  "MD-4": {
    label: "MD-4 · Capacidad / Espacios Amplios",
    enfoque: "Volumen alto, distancias largas, LSG y transiciones",
    distanciaRangoM: [5500, 7200],
    hsrRangoM: [350, 650],
    sprintRangoM: [50, 150],
    playerLoadRango: [550, 750],
    color: "#2563eb",
  },
  "MD-3": {
    label: "MD-3 · Potencia / Espacios Reducidos",
    enfoque: "Fuerza, aceleraciones/desaceleraciones, SSG y duelos",
    distanciaRangoM: [4200, 5600],
    hsrRangoM: [150, 320],
    sprintRangoM: [10, 60],
    playerLoadRango: [480, 650],
    color: "#d97706",
  },
  "MD-2": {
    label: "MD-2 · Velocidad / Táctica Colectiva",
    enfoque: "Intensidad máxima, sprints cortos, recuperación completa",
    distanciaRangoM: [3500, 4800],
    hsrRangoM: [200, 450],
    sprintRangoM: [40, 110],
    playerLoadRango: [380, 500],
    color: "#16a34a",
  },
  "MD-1": {
    label: "MD-1 · Activación & ABP",
    enfoque: "Volumen muy bajo, reactividad y balón parado",
    distanciaRangoM: [2200, 3200],
    hsrRangoM: [30, 100],
    sprintRangoM: [0, 25],
    playerLoadRango: [220, 320],
    color: "#9333ea",
  },
  "MD+1": {
    label: "MD+1 · Recuperación / Compensatorio",
    enfoque: "Regenerativo para titulares, carga compensatoria suplentes",
    distanciaRangoM: [2500, 5000],
    hsrRangoM: [50, 250],
    sprintRangoM: [0, 50],
    playerLoadRango: [250, 500],
    color: "#0284c7",
  },
  "MD": {
    label: "MD · Día de Partido",
    enfoque: "Competición oficial 90 minutos",
    distanciaRangoM: [9500, 12500],
    hsrRangoM: [600, 1100],
    sprintRangoM: [120, 350],
    playerLoadRango: [900, 1300],
    color: "#dc2626",
  },
};
