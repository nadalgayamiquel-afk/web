// Tipos y configuraciones para el módulo de Gimnasio & Fuerza

export type GimnasioEjercicio = {
  id: string;
  bloque?: string; // ej: 'ACT', 'PP'
  nombre: string;
  grupoMuscular: string; // Inicia siempre en blanco ""
  series: number | string; // En blanco por defecto
  reps: string; // En blanco por defecto
  pesoKg: string; // En blanco por defecto
  rpe?: number | null; // En blanco por defecto
  velocidad?: string; // ej: 'Moderada', 'Ràpida', 'Lenta'
  material?: string; // ej: 'Foam Roller', 'Goma', 'Kettlebell'
  notas?: string; // Comentario u observación específica del ejercicio
  showNotas?: boolean; // Plegado por defecto
  showVideo?: boolean; // Plegado por defecto
  videoUrl?: string; // Enlace de video específico del ejercicio
  variablesPersonalizadas?: Record<string, string>; // ej: { "Tiempo": "45s", "Velocidad": "1.2 m/s", "Material": "Goma" }
  // Monitorización con sensores (Encoder / Dinamómetro)
  monitorizado?: boolean;
  tipoSensor?: 'ENCODER' | 'DINAMOMETRO';
  pesoDefectoKg?: number | string;
};

export type SensorCaptureRecord = {
  id: string;
  jugadorId: string;
  jugadorNombre?: string;
  fecha: string;
  sesionId?: string;
  ejercicioId: string;
  ejercicioNombre: string;
  tipoSensor: 'ENCODER' | 'DINAMOMETRO';
  pesoKg?: number;
  repsCount?: number;
  repsData?: Array<{
    rep: number;
    velocidadMedia: number; // m/s
    velocidadPico: number; // m/s
    perdidaVelocidadPct: number; // % respecto a la mejor
  }>;
  velocidadMedia?: number;
  velocidadPico?: number;
  perdidaVelocidadTotalPct?: number;
  fuerzaPicoN?: number;
  fuerzaMediaN?: number;
  curvaPuntos?: Array<{ t: number; f: number }>; // t: segundos, f: Newtons
  duracionSegundos?: number;
  timestamp: string;
};

export type GimnasioSesion = {
  id: string;
  jugadorId: string; // 'TEAM' para sesión de grupo o ID de jugador
  fecha: string; // YYYY-MM-DD
  md?: string;
  nombreSesion: string;
  categoria: string; // ABIERTA: puede ser 'FUERZA', 'PREVENTIVO', o cualquier texto personalizado
  estado: 'planificado' | 'completado' | 'adaptado';
  duracionMin?: number;
  rpeMedio?: number | null;
  incluirRpe?: boolean; // Se puede quitar el RPE si no se desea
  variablesColumnas?: string[]; // Columnas añadidas como ['Tiempo', 'Velocidad']
  notas?: string;
  videoUrl?: string; // Enlace de video de la sesión
  hora?: string; // Hora específica del evento/reporte (ej. 10:30)
  lugar?: string; // Lugar del evento/reporte (ej. GYM)
  ejercicios: GimnasioEjercicio[];
};

export type GimnasioPlantilla = {
  id: string;
  titulo: string;
  categoria: string;
  mdSugerido: string;
  descripcion: string;
  ejercicios: Omit<GimnasioEjercicio, 'id'>[];
};

export const CATEGORIAS_SUGERIDAS = [
  'FUERZA',
  'PREVENTIVO',
  'POTENCIA',
  'CORE',
  'READAPTACION',
  'RECUPERACION',
  'HIPERTROFIA',
  'ACTIVACION',
  'COMPENSATORIO',
  'MOVILIDAD',
];

export const CATEGORIA_CONFIG: Record<string, {
  label: string;
  color: string;
  bg: string;
  border: string;
  badgeBg: string;
  icon: string;
}> = {
  FUERZA: {
    label: 'Fuerza',
    color: '#7c3aed',
    bg: '#fbf9ff',
    border: '#c4b5fd',
    badgeBg: '#ede9fe',
    icon: '🏋️',
  },
  PREVENTIVO: {
    label: 'Preventivo',
    color: '#0284c7',
    bg: '#f0f9ff',
    border: '#7dd3fc',
    badgeBg: '#e0f2fe',
    icon: '🛡️',
  },
  POTENCIA: {
    label: 'Potencia',
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    badgeBg: '#fef3c7',
    icon: '⚡',
  },
  CORE: {
    label: 'Core',
    color: '#059669',
    bg: '#f0fdf4',
    border: '#86efac',
    badgeBg: '#dcfce7',
    icon: '🧘',
  },
  READAPTACION: {
    label: 'Readaptación',
    color: '#db2777',
    bg: '#fdf2f8',
    border: '#fbcfe8',
    badgeBg: '#fce7f3',
    icon: '🩹',
  },
  RECUPERACION: {
    label: 'Recuperación',
    color: '#4f46e5',
    bg: '#eef2ff',
    border: '#c7d2fe',
    badgeBg: '#e0e7ff',
    icon: '🔄',
  },
  HIPERTROFIA: {
    label: 'Hipertrofia',
    color: '#b45309',
    bg: '#fffbeb',
    border: '#fcd34d',
    badgeBg: '#fef3c7',
    icon: '💪',
  },
  ACTIVACION: {
    label: 'Activación',
    color: '#0284c7',
    bg: '#f0f9ff',
    border: '#93c5fd',
    badgeBg: '#dbeafe',
    icon: '🚀',
  },
  COMPENSATORIO: {
    label: 'Compensatorio',
    color: '#475569',
    bg: '#f8fafc',
    border: '#cbd5e1',
    badgeBg: '#f1f5f9',
    icon: '⚖️',
  },
  MOVILIDAD: {
    label: 'Movilidad',
    color: '#0d9488',
    bg: '#f0fdfa',
    border: '#99f6e4',
    badgeBg: '#ccfbf1',
    icon: '🤸',
  },
};

export function getCategoriaEstilo(cat: string) {
  const norm = (cat || '').trim().toUpperCase();
  if (CATEGORIA_CONFIG[norm]) return CATEGORIA_CONFIG[norm];
  return {
    label: cat || 'General',
    color: '#475569',
    bg: '#f8fafc',
    border: '#cbd5e1',
    badgeBg: '#f1f5f9',
    icon: '📌',
  };
}

export const EJERCICIOS_CATALOGO_RAPIDO = [
  'Sentadilla Trasera con Barra',
  'Prensa de Piernas 45°',
  'Extensión de Cuádriceps',
  'Hip Thrust con Barra',
  'Peso Muerto Barra Hexagonal',
  'Nordic Hamstring Curls',
  'Curl Femoral Tumbado en Máquina',
  'Copenhagen Adductor',
  'Zancadas Búlgaras con Mancuernas',
  'Lanzamiento Balón Medicinal a Pared',
  'Trap Bar Jump Explosivo',
  'Salto al Cajón Pliométrico',
  'Press de Banca Plano',
  'Remo con Mancuerna Unilateral',
  'Dominadas con Lastre / Asistidas',
  'Press Militar de Hombros',
  'Pallof Press con Polea',
  'Plancha Abdominal con Disco',
  'Puente Glúteo Unipodal con Goma',
  'Elevación de Gemelos en Escalón',
];

export const PLANTILLAS_PREDEFINIDAS: GimnasioPlantilla[] = [
  {
    id: 'plantilla_fuerza_md2',
    titulo: 'GIMNASIO: Fuerza Máxima & Carga (-2MD)',
    categoria: 'FUERZA',
    mdSugerido: '-2MD',
    descripcion: 'Sesión de desarrollo de fuerza funcional.',
    ejercicios: [
      { nombre: 'Sentadilla Trasera con Barra', grupoMuscular: '', series: 4, reps: '6', pesoKg: '80', rpe: 8, notas: 'Descanso 2 min.' },
      { nombre: 'Hip Thrust con Barra', grupoMuscular: '', series: 4, reps: '8', pesoKg: '95', rpe: 8, notas: 'Bloqueo 1s arriba.' },
      { nombre: 'Prensa de Piernas 45°', grupoMuscular: '', series: 3, reps: '8', pesoKg: '140', rpe: 7, notas: '' },
      { nombre: 'Peso Muerto Barra Hexagonal', grupoMuscular: '', series: 3, reps: '5', pesoKg: '90', rpe: 8, notas: 'Máxima aceleración.' },
      { nombre: 'Extensión de Cuádriceps', grupoMuscular: '', series: 3, reps: '10', pesoKg: '45', rpe: 7, notas: '' },
    ],
  },
  {
    id: 'plantilla_preventivo_md3',
    titulo: 'GIMNASIO: Preventivo Isquios & Pubis (-3MD)',
    categoria: 'PREVENTIVO',
    mdSugerido: '-3MD',
    descripcion: 'Protocolo de prevención con énfasis en isquios y aductores.',
    ejercicios: [
      { nombre: 'Nordic Hamstring Curls', grupoMuscular: '', series: 3, reps: '6', pesoKg: 'P. Corp.', rpe: 8, notas: 'Fase de caída lenta 4s.' },
      { nombre: 'Copenhagen Adductor', grupoMuscular: '', series: 3, reps: '20s', pesoKg: 'P. Corp.', rpe: 7, notas: 'Isométrico 20s/lado.' },
      { nombre: 'Curl Femoral Tumbado en Máquina', grupoMuscular: '', series: 3, reps: '8', pesoKg: '40', rpe: 7, notas: '' },
      { nombre: 'Puente Glúteo Unipodal con Goma', grupoMuscular: '', series: 3, reps: '10/lado', pesoKg: 'Goma', rpe: 6, notas: '' },
      { nombre: 'Pallof Press con Polea', grupoMuscular: '', series: 3, reps: '10/lado', pesoKg: '15', rpe: 6, notas: '' },
    ],
  },
  {
    id: 'plantilla_potencia_md1',
    titulo: 'GIMNASIO: Activación Neuromuscular (-1MD)',
    categoria: 'POTENCIA',
    mdSugerido: '-1MD',
    descripcion: 'Sesión balística de activación previa a partido.',
    ejercicios: [
      { nombre: 'Lanzamiento Balón Medicinal a Pared', grupoMuscular: '', series: 3, reps: '6', pesoKg: '5', rpe: 7, notas: 'Máxima explosividad.' },
      { nombre: 'Trap Bar Jump Explosivo', grupoMuscular: '', series: 3, reps: '4', pesoKg: '30', rpe: 7, notas: '30% 1RM.' },
      { nombre: 'Salto al Cajón Pliométrico', grupoMuscular: '', series: 3, reps: '5', pesoKg: 'P. Corp.', rpe: 6, notas: '' },
    ],
  },
];
