'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { resolvePlanificacionMD, getLocalStoragePlanificacionDays } from "@/app/lib/planificacionMd";
import Link from 'next/link';
import {
  GimnasioEjercicio,
  GimnasioSesion,
  GimnasioPlantilla,
  CATEGORIAS_SUGERIDAS,
  getCategoriaEstilo,
  EJERCICIOS_CATALOGO_RAPIDO,
  PLANTILLAS_PREDEFINIDAS,
} from './gimnasio-types';
import type { SesionDia } from '../calendario/CalendarGrid';
import {
  saveFuerzaSesionesBatch,
  backupFuerzaBBDDToDisk,
  restoreFuerzaBBDDFromDisk,
  deleteFuerzaSesionFromSupabase,
} from '@/app/actions';
import GimnasioEstacionModal from './GimnasioEstacionModal';

export type JugadorGimnasio = {
  id: string;
  nombre: string;
  apodo?: string | null;
  posicion?: string | null;
  foto_url?: string | null;
  dorsal?: string | number | null;
  activo?: boolean;
};

interface Props {
  initialJugadores?: JugadorGimnasio[];
  initialDays?: SesionDia[];
  initialSesionesMap?: Record<string, GimnasioSesion[]>;
  initialBloquesMap?: Record<string, any>;
}

const STORAGE_KEY = 'gimnasio_sesiones_map_v1';
const VIDEOS_CATALOG_KEY = 'gimnasio_ejercicios_videos_catalog';

export const getEjerciciosVideoCatalog = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(VIDEOS_CATALOG_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

export const saveEjercicioVideoToCatalog = (nombreEj: string, url: string) => {
  if (!nombreEj || typeof window === 'undefined') return;
  try {
    const cat = getEjerciciosVideoCatalog();
    const key = nombreEj.toLowerCase().trim();
    if (url && url.trim()) {
      cat[key] = url.trim();
    } else {
      delete cat[key];
    }
    localStorage.setItem(VIDEOS_CATALOG_KEY, JSON.stringify(cat));
  } catch {}
};

const DEFAULT_JUGADORES: JugadorGimnasio[] = [
  { id: 'jug_jm', nombre: 'JOAN MASCARÓ', apodo: 'MASCARÓ', foto_url: 'https://img.a.transfermarkt.technology/portrait/medium/948295-1730833823.jpg?lm=4711', dorsal: 9, activo: true },
  { id: 'jug_exposito', nombre: 'ADRI EXPÓSITO', apodo: 'ADRI', dorsal: 15, activo: true },
  { id: 'jug_1', nombre: 'Alejandro G.', apodo: 'Alejandro', dorsal: 1, activo: true },
  { id: 'jug_2', nombre: 'Pablo Sánchez', apodo: 'Pablo', dorsal: 2, activo: true },
  { id: 'jug_3', nombre: 'Carlos García', apodo: 'Carlos', dorsal: 4, activo: true },
  { id: 'jug_4', nombre: 'Jan Jou', apodo: 'Jan', dorsal: 5, activo: true },
  { id: 'jug_5', nombre: 'Jordi Álvarez', apodo: 'Jordi', dorsal: 6, activo: true },
  { id: 'jug_6', nombre: 'Alex Civit', apodo: 'Civit', dorsal: 8, activo: true },
  { id: 'jug_7', nombre: 'Óscar Romero', apodo: 'Romero', dorsal: 7, activo: true },
  { id: 'jug_8', nombre: 'Guillermo R.', apodo: 'Guille', dorsal: 11, activo: true },
  { id: 'jug_9', nombre: 'Eric Molinas', apodo: 'Molinas', dorsal: 12, activo: true },
  { id: 'jug_10', nombre: 'Ibán Ribas', apodo: 'Ibán', dorsal: 10, activo: true },
  { id: 'jug_11', nombre: 'Sergio Peña', apodo: 'Peña', dorsal: 14, activo: true },
  { id: 'jug_12', nombre: 'Marc Font', apodo: 'Font', dorsal: 17, activo: true },
  { id: 'jug_13', nombre: 'Albert Morral', apodo: 'Albert', dorsal: 3, activo: true },
  { id: 'jug_14', nombre: 'Manel Busquets', apodo: 'Manel', dorsal: 19, activo: true },
  { id: 'jug_15', nombre: 'Adri Rivas', apodo: 'Adri', dorsal: 18, activo: true },
];

function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatFechaCol(fechaISO: string): { diaSem: string; diaMes: string } {
  try {
    const d = new Date(fechaISO + 'T12:00:00');
    const dias = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
    return {
      diaSem: dias[d.getDay()],
      diaMes: d.getDate() + '/' + (d.getMonth() + 1),
    };
  } catch (e) {
    return { diaSem: '', diaMes: fechaISO };
  }
}

function getMdBadgeStyle(md?: string | null): { bg: string; text: string; border: string } {
  if (!md) return { bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' };
  const m = md.trim().toUpperCase();
  if (m === '-2MD' || m === 'MD-2') return { bg: '#ede9fe', text: '#6d28d9', border: '#c4b5fd' };
  if (m === '-3MD' || m === 'MD-3') return { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' };
  if (m === '-1MD' || m === 'MD-1') return { bg: '#fef3c7', text: '#b45309', border: '#fde68a' };
  if (m === 'MD') return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' };
  if (m === '+1MD' || m === 'MD+1') return { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' };
  if (m === '+2MD' || m === 'MD+2') return { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' };
  return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
}

function getCellKey(jugadorId: string, fecha: string): string {
  return jugadorId + '_' + fecha;
}

function normalizeMd(md?: string | null): string {
  if (!md) return '';
  const clean = md.trim().toUpperCase().replace(/\s+/g, '');
  if (clean === 'MD-5' || clean === '-5MD') return '-5MD';
  if (clean === 'MD-4' || clean === '-4MD') return '-4MD';
  if (clean === 'MD-3' || clean === '-3MD') return '-3MD';
  if (clean === 'MD-2' || clean === '-2MD') return '-2MD';
  if (clean === 'MD-1' || clean === '-1MD') return '-1MD';
  if (clean === 'MD') return 'MD';
  if (clean === 'MD+1' || clean === '+1MD') return '+1MD';
  if (clean === 'MD+2' || clean === '+2MD') return '+2MD';
  return clean;
}

export default function GimnasioMatrixClient({ initialJugadores = [], initialDays = [], initialSesionesMap = {} }: Props) {
  // 1. Jugadores
  const [jugadores] = useState<JugadorGimnasio[]>(() => {
    const list = initialJugadores && initialJugadores.length > 0 ? [...initialJugadores] : [...DEFAULT_JUGADORES];
    if (!list.some(j => j.nombre.toLowerCase().includes('exposito') || j.nombre.toLowerCase().includes('adri expósito'))) {
      list.push({ id: 'jug_exposito', nombre: 'ADRI EXPÓSITO', apodo: 'ADRI', dorsal: 15, activo: true });
    }
    return list;
  });

  const [allDays, setAllDays] = useState<SesionDia[]>(() => {
    const base = initialDays && initialDays.length > 0 ? [...initialDays] : [];
    if (!base.some(d => d.fecha === '2026-10-10')) {
      base.push({
        id: 'dia_2026-10-10',
        fecha: '2026-10-10',
        dia_semana: 'Sábado',
        md: '-2MD',
        meso_nombre: 'COMPETITIVO',
      } as any);
    }
    return base;
  });
  const [eventosPlanMap, setEventosPlanMap] = useState<Record<string, any>>({});
  const [playerEventsMap, setPlayerEventsMap] = useState<Record<string, string>>({});
  const [clubConfig, setClubConfig] = useState<{ nombreClub: string; escudoUrl: string; categoria: string }>({
    nombreClub: 'CE EUROPA',
    escudoUrl: '/ce-europa.png',
    categoria: '1er Equipo',
  });
  const [tiposConfigMap, setTiposConfigMap] = useState<Record<string, any>>({});
  const [expandedJugadoresMap, setExpandedJugadoresMap] = useState<Record<string, boolean>>({});
  const [expandedSesionIds, setExpandedSesionIds] = useState<Record<string, boolean>>({});
  const [globalExpandEjercicios, setGlobalExpandEjercicios] = useState<boolean>(false);

  const toggleExpandJugador = (jugId: string) => {
    setExpandedJugadoresMap(prev => ({
      ...prev,
      [jugId]: !prev[jugId],
    }));
  };

  const toggleExpandSesion = (sesId: string) => {
    setExpandedSesionIds(prev => ({
      ...prev,
      [sesId]: !prev[sesId],
    }));
  };

  useEffect(() => {
    try {
      const savedClub = localStorage.getItem('club_config_v1') || localStorage.getItem('club_config');
      if (savedClub) {
        const pc = JSON.parse(savedClub);
        if (pc && pc.nombreClub) {
          setClubConfig({
            nombreClub: pc.nombreClub || 'CE EUROPA',
            escudoUrl: pc.escudoUrl || '/ce-europa.png',
            categoria: pc.categoria || '1er Equipo',
          });
        }
      }

      const localCal = getLocalStoragePlanificacionDays();
      if (localCal && localCal.length > 0) {
        const cleaned = localCal.map((d: any) => {
          const m = resolvePlanificacionMD(d.fecha, localCal);
          return m ? { ...d, md: m } : d;
        });
        if (!cleaned.some((d: any) => d.fecha === '2026-10-10')) {
          cleaned.push({
            id: 'dia_2026-10-10',
            fecha: '2026-10-10',
            dia_semana: 'Sábado',
            md: '-2MD',
            meso_nombre: 'COMPETITIVO',
          } as any);
        }
        setAllDays(cleaned);
        try {
          localStorage.setItem("planificacion_days_v5", JSON.stringify(cleaned));
          localStorage.setItem("planificacion_days_v2", JSON.stringify(cleaned));
          localStorage.setItem("planificacion_days_v1", JSON.stringify(cleaned));
        } catch {}
      }
      const savedBloques = localStorage.getItem('eventos_bloques_map_v5') || localStorage.getItem('eventos_bloques_map_v4');
      if (savedBloques) {
        const parsedB = JSON.parse(savedBloques);
        if (parsedB && typeof parsedB === 'object') setEventosPlanMap(parsedB);
      }
      const savedPlayerEvents = localStorage.getItem('player_events_map_v1');
      if (savedPlayerEvents) {
        const parsedPE = JSON.parse(savedPlayerEvents);
        if (parsedPE && typeof parsedPE === 'object') setPlayerEventsMap(parsedPE);
      }
      const savedTipos = localStorage.getItem('tipos_evento_config_v1');
      if (savedTipos) {
        const parsedT = JSON.parse(savedTipos);
        if (Array.isArray(parsedT)) {
          const map: Record<string, any> = {};
          parsedT.forEach((t: any) => {
            if (t.codigo) map[t.codigo.toUpperCase()] = t;
            if (t.nombre) map[t.nombre.toUpperCase()] = t;
          });
          setTiposConfigMap(map);
        }
      }
    } catch (e) {}
  }, []);

  // 2. Sesiones de Gimnasio
  const [sesionesMap, setSesionesMap] = useState<Record<string, GimnasioSesion[]>>(initialSesionesMap || {});
  const [isBackupLoading, setIsBackupLoading] = useState<boolean>(false);
  const [pasteDialog, setPasteDialog] = useState<{
    jugadorId: string;
    jugadorNombre: string;
    fecha: string;
    existingCount: number;
  } | null>(null);

  // Helper seguro para obtener lista de sesiones de una celda
  const getSesionesList = (cellKey: string): GimnasioSesion[] => {
    const val = (sesionesMap as any)[cellKey];
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  };

  // Cargar sesiones sincronizadas con Supabase (Fuente de Verdad) y respaldar localmente
  useEffect(() => {
    const sesion10Oct: GimnasioSesion = {
      id: 'sesion_team_2026-10-10',
      jugadorId: 'TEAM',
      fecha: '2026-10-10',
      md: '-2MD',
      nombreSesion: 'COADYUVANTE - FUERZA',
      categoria: 'PAPE',
      estado: 'completado',
      duracionMin: 45,
      hora: 'MAÑANA',
      lugar: 'GYM',
      incluirRpe: false,
      ejercicios: [
        { id: 'ej_10_1', bloque: 'PP', nombre: 'BICI', grupoMuscular: '', series: 1, reps: "10'", pesoKg: '—', velocidad: 'Suave', material: '—', videoUrl: '', notas: '' },
        { id: 'ej_10_2', bloque: 'PP', nombre: 'SQUAT EXCENTRICA + SALTO', grupoMuscular: '', series: 2, reps: '6', pesoKg: '24', velocidad: 'Rapida', material: 'Kettlebells', videoUrl: '', notas: 'Bajar squat con una kettlebell en cada mano, cuando llegas abaja las sueltas y saltas alto y rapido' },
        { id: 'ej_10_3', bloque: 'PP', nombre: 'HIP THRUST UNIPODAL + SALTO', grupoMuscular: '', series: 2, reps: '6', pesoKg: '—', velocidad: 'Rapida', material: 'Banco', videoUrl: '', notas: 'Espalda en banco, mirando hacia el techo, un pie apoyado al suelo y saltar lo mas alto y rápido posible' },
        { id: 'ej_10_4', bloque: 'PP', nombre: 'ADUCCIONES LATERALES CON GOMA', grupoMuscular: '', series: 2, reps: '6', pesoKg: '—', velocidad: 'Rapida', material: 'Goma', videoUrl: '', notas: 'Enganchar goma altura tobillo y en tobillo. La goma tiene que ir en contra de cerrar. Abrir y cerrar los mas rápido posible.' },
        { id: 'ej_10_5', bloque: 'PP', nombre: 'SALTO VERTICAL ASISTIDO CON GOMA', grupoMuscular: '', series: 2, reps: '6', pesoKg: '—', velocidad: 'Rapida', material: 'Goma', videoUrl: '', notas: 'Enganchar goma que venga por encima de la cabeza, coger goma con las manos y saltar lo mas alto y rápido posible' },
        { id: 'ej_10_6', bloque: 'PP', nombre: 'ISO PUSH SQUAT', grupoMuscular: '', series: 2, reps: '4', pesoKg: "3''", velocidad: '-', material: 'Barra', videoUrl: '', notas: 'Pies debajo de la barra, altura maxima con rodillas semiflexionadas y empujar lo maximo hacia arriba' },
        { id: 'ej_10_7', bloque: 'PP', nombre: 'ISO PUSH HORIZONTAL', grupoMuscular: '', series: 2, reps: '4', pesoKg: "3''", velocidad: '-', material: 'Barra', videoUrl: '', notas: 'Empujar al máximo hacia el rack, con cadera y rodilla traseras extendidas.' },
      ],
    };

    // 1. Partir de lo que viene de Supabase
    let loadedMap: Record<string, GimnasioSesion[]> = { ...(initialSesionesMap || {}) };

    // Sanitizar videoUrl de youtube.com placeholder si existía
    Object.values(loadedMap).forEach(list => {
      list.forEach(s => {
        if (s.videoUrl === 'https://youtube.com') s.videoUrl = '';
        s.ejercicios?.forEach(ej => {
          if (ej.videoUrl === 'https://youtube.com') ej.videoUrl = '';
        });
      });
    });

    // 2. Si hay algo en localStorage, combinarlo de forma inteligente para no perder videos ni notas
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          for (const k in parsed) {
            const item = parsed[k];
            const localList: GimnasioSesion[] = Array.isArray(item) ? item : (item ? [item] : []);
            if (!loadedMap[k] || loadedMap[k].length === 0) {
              if (localList.length > 0) loadedMap[k] = localList;
            } else {
              // Si ya está en Supabase, rescatar videoUrl y notas locales si en Supabase vinieron vacías
              loadedMap[k] = loadedMap[k].map(supSes => {
                const matchedLocal = localList.find(loc => loc.id === supSes.id || loc.nombreSesion === supSes.nombreSesion);
                if (!matchedLocal) return supSes;

                const mergedNotas = (supSes.notas && supSes.notas.trim()) ? supSes.notas : (matchedLocal.notas || '');
                const mergedVideo = (supSes.videoUrl && supSes.videoUrl.trim() && supSes.videoUrl !== 'https://youtube.com') ? supSes.videoUrl : (matchedLocal.videoUrl || '');

                const mergedEjercicios = (supSes.ejercicios || []).map((ej, idx) => {
                  const localEj = matchedLocal.ejercicios?.find(e => e.id === ej.id || e.nombre.toLowerCase().trim() === ej.nombre.toLowerCase().trim()) || matchedLocal.ejercicios?.[idx];
                  if (!localEj) return ej;

                  return {
                    ...ej,
                    notas: (ej.notas && ej.notas.trim()) ? ej.notas : (localEj.notas || ''),
                    videoUrl: (ej.videoUrl && ej.videoUrl.trim() && ej.videoUrl !== 'https://youtube.com') ? ej.videoUrl : (localEj.videoUrl || ''),
                    bloque: ej.bloque || localEj.bloque || 'PP',
                  };
                });

                return {
                  ...supSes,
                  notas: mergedNotas,
                  videoUrl: mergedVideo,
                  ejercicios: mergedEjercicios,
                };
              });
            }
          }
        }
      }
    } catch (e) {}

    // 3. Asegurar que la sesión confirmada del 10/10 para Expósito y Mascaró esté siempre presente
    const expMasPlayers = jugadores.filter(j => 
      j.nombre.toLowerCase().includes("exposito") || 
      (j.apodo && j.apodo.toLowerCase().includes("exposito")) ||
      j.nombre.toLowerCase().includes("mascaro") || 
      (j.apodo && j.apodo.toLowerCase().includes("mascaro")) ||
      j.id === "ab298ab8-69cc-4c04-a572-a795f1c9c29d" ||
      j.id === "09c711ca-94ef-4e87-bb2b-eac760b560a5"
    );
    expMasPlayers.forEach(p => {
      const k = getCellKey(p.id, "2026-10-10");
      if (!loadedMap[k] || loadedMap[k].length === 0) {
        loadedMap[k] = [{ ...sesion10Oct, id: "sesion_" + p.id + "_2026-10-10", jugadorId: p.id }];
      }
    });

    setSesionesMap(loadedMap);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loadedMap));
    } catch (e) {}
  }, [allDays, jugadores, initialSesionesMap]);

  // 3. Filtros y UI
  const [selectedMdFilter, setSelectedMdFilter] = useState<string>('TODOS');
  const [selectedJugadorChip, setSelectedJugadorChip] = useState<string>('TODOS');
  const [searchJugadorText, setSearchJugadorText] = useState<string>('');
  const [showUltimoGymPanel, setShowUltimoGymPanel] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // PORTAPAPELES COMPACTO
  const [clipboardSesion, setClipboardSesion] = useState<GimnasioSesion | null>(null);
  const [draggedSesion, setDraggedSesion] = useState<{ sesion: GimnasioSesion; fromKey: string } | null>(null);

  // Helper para fecha local YYYY-MM-DD
  const formatLocalDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Fecha de hoy en formato YYYY-MM-DD
  const todayStr = useMemo(() => formatLocalDate(new Date()), []);

  // Rango de fechas predeterminado: 8 DÍAS, donde HOY es el DÍA NÚMERO 5
  // (Día 1: hoy - 4, Día 2: hoy - 3, Día 3: hoy - 2, Día 4: hoy - 1, Día 5: HOY, Día 6: hoy + 1, Día 7: hoy + 2, Día 8: hoy + 3)
  const [fechaDesde, setFechaDesde] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 4);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const [fechaHasta, setFechaHasta] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  // Función para resetear a la ventana predeterminada de 8 días (Hoy = día 5)
  const handleReset8DiasHoy = () => {
    const d1 = new Date();
    d1.setDate(d1.getDate() - 4);
    const d2 = new Date();
    d2.setDate(d2.getDate() + 3);
    setFechaDesde(formatLocalDate(d1));
    setFechaHasta(formatLocalDate(d2));
    setSelectedMdFilter('TODOS');
    showToast('✓ Vista restablecida: 8 días (Hoy es el día 5)');
  };

  // Desplazar período en bloques de 8 días
  const handleShiftDias = (diasDelta: number) => {
    const d1 = new Date(fechaDesde + 'T12:00:00');
    const d2 = new Date(fechaHasta + 'T12:00:00');
    d1.setDate(d1.getDate() + diasDelta);
    d2.setDate(d2.getDate() + diasDelta);
    setFechaDesde(formatLocalDate(d1));
    setFechaHasta(formatLocalDate(d2));
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 4. Modales
  const [modalSesion, setModalSesion] = useState<GimnasioSesion | null>(null);
  const [modalTargetNombre, setModalTargetNombre] = useState<string>('');
  const [clipboardEjercicio, setClipboardEjercicio] = useState<GimnasioEjercicio | null>(null);
  const [draggedEjercicioIndex, setDraggedEjercicioIndex] = useState<number | null>(null);
  const [nuevaVariableInput, setNuevaVariableInput] = useState<string>('');
  const [showAddVariableDropdown, setShowAddVariableDropdown] = useState<boolean>(false);
  const [mostrarGrupoMuscular, setMostrarGrupoMuscular] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('gimnasio_mostrar_grupo_muscular');
        if (stored !== null) return stored === 'true';
      } catch {}
    }
    return false; // Por defecto desactivado para dar más espacio a Ejercicio
  });

  // Refs para scroll dinámico de ejercicios
  const modalBodyRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const ejerciciosBottomRef = useRef<HTMLTableRowElement | null>(null);

  // 5. MODAL DE REPORTES
  const [showReportConfigModal, setShowReportConfigModal] = useState<boolean>(false);
  const [showReportPreviewModal, setShowReportPreviewModal] = useState<boolean>(false);
  const [reportTipo, setReportTipo] = useState<'individual' | 'grupal' | 'ambos'>('individual');
  const [reportFecha, setReportFecha] = useState<string>('2026-10-10');
  const [selectedReportJugadorIds, setSelectedReportJugadorIds] = useState<string[]>([]);
  const [showEstacionModal, setShowEstacionModal] = useState<boolean>(false);
  const [showMenuPuntitos, setShowMenuPuntitos] = useState<boolean>(false);
  const menuPuntitosRef = useRef<HTMLDivElement | null>(null);

  // Días ordenados
  const sortedDays = useMemo(() => {
    return [...allDays].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [allDays]);

  const diasFiltrados = useMemo(() => {
    return sortedDays.filter(day => {
      if (selectedMdFilter === 'TODOS') {
        if (fechaDesde && day.fecha < fechaDesde) return false;
        if (fechaHasta && day.fecha > fechaHasta) return false;
      }
      if (selectedMdFilter !== 'TODOS') {
        const norm = normalizeMd(day.md);
        if (norm !== selectedMdFilter) return false;
      }
      return true;
    });
  }, [sortedDays, fechaDesde, fechaHasta, selectedMdFilter]);

  const semanasAgrupadas = useMemo(() => {
    const groups: { semana: number | string; count: number; dias: SesionDia[] }[] = [];
    diasFiltrados.forEach(day => {
      const sem = day.semana || 'Micro';
      const last = groups[groups.length - 1];
      if (last && last.semana === sem) {
        last.count++;
        last.dias.push(day);
      } else {
        groups.push({ semana: sem, count: 1, dias: [day] });
      }
    });
    return groups;
  }, [diasFiltrados]);

  // Jugadores filtrados (COLUMNAS SIN POSICIÓN PARA QUE OCUPEN MENOS)
  const jugadoresFiltrados = useMemo(() => {
    return jugadores.filter(jug => {
      if (selectedJugadorChip !== 'TODOS' && jug.id !== selectedJugadorChip) return false;
      if (searchJugadorText.trim()) {
        const q = searchJugadorText.toLowerCase();
        const mN = jug.nombre.toLowerCase().includes(q);
        const mA = jug.apodo ? jug.apodo.toLowerCase().includes(q) : false;
        const mD = jug.dorsal ? String(jug.dorsal).includes(q) : false;
        if (!mN && !mA && !mD) return false;
      }
      return true;
    });
  }, [jugadores, selectedJugadorChip, searchJugadorText]);

  // Helper para eventos de planificación con hora y color predeterminado (FILA COMPACTA: SOLO Op, Co, Pa)
  const getEventosEspecificosCompact = (day: SesionDia): Array<{ tipo: string; hora: string; bg: string; color: string; border: string }> => {
    const res: Array<{ tipo: string; hora: string; bg: string; color: string; border: string }> = [];

    const classify = (tipoVal?: string | null): 'Co' | 'Op' | 'Pa' | null => {
      if (!tipoVal) return null;
      const c = tipoVal.trim().toUpperCase();
      if (
        c === 'CO' ||
        c === 'COP' ||
        c.startsWith('CO ') ||
        c.startsWith('CO1') ||
        c.startsWith('CO2') ||
        c.includes('COADYUVANTE') ||
        c.includes('COADJUVANT')
      ) {
        return 'Co';
      }
      if (
        c === 'OP' ||
        c === 'OOP' ||
        c.startsWith('OP ') ||
        c.startsWith('OP1') ||
        c.startsWith('OP2') ||
        c.includes('OPTIMIZADOR') ||
        c.includes('OPTIMIZADORA')
      ) {
        return 'Op';
      }
      if (
        c === 'PA' ||
        c === 'PAL' ||
        c === 'PAV' ||
        c === 'PL' ||
        c === 'PV' ||
        c === 'PAAM' ||
        c.startsWith('PA ') ||
        c.startsWith('PA VS') ||
        c.startsWith('PA.') ||
        c.includes('PARTIDO')
      ) {
        return 'Pa';
      }
      return null;
    };

    const getColors = (cat: 'Co' | 'Op' | 'Pa', rawTipo: string) => {
      const conf = tiposConfigMap[rawTipo.toUpperCase()] || tiposConfigMap[cat.toUpperCase()];
      if (conf?.bg && conf?.color && conf?.border) {
        return { bg: conf.bg, color: conf.color, border: conf.border };
      }
      if (cat === 'Co') {
        return { bg: '#fde047', color: '#713f12', border: '#eab308' };
      }
      if (cat === 'Op') {
        return { bg: '#93c5fd', color: '#1e3a8a', border: '#60a5fa' };
      }
      return { bg: '#fecdd3', color: '#881337', border: '#fda4af' };
    };

    // 1. Revisar bloques / slots 0..6 (incluye slot 0 para sesiones matinales / Coadyuvante)
    for (let slot = 0; slot <= 6; slot++) {
      const k1 = day.id + '_slot_' + slot;
      const k2 = day.fecha + '_slot_' + slot;
      const k3 = 'day_' + day.fecha + '_slot_' + slot;
      const k4 = 'day_' + day.id + '_slot_' + slot;
      const evObj = eventosPlanMap[k1] || eventosPlanMap[k2] || eventosPlanMap[k3] || eventosPlanMap[k4];
      const rawTipo = (evObj?.tipo || (day as any)['evento_' + slot] || (slot === 0 ? (day as any)['evento_1'] : '') || '').trim();
      const horaVal = evObj?.hora || '';

      const cat = classify(rawTipo);
      if (cat) {
        let label: string = cat;
        if (cat === 'Co' && rawTipo.toUpperCase().startsWith('COP')) label = 'Cop';
        if (cat === 'Op' && rawTipo.toUpperCase().startsWith('OOP')) label = 'Oop';
        if (cat === 'Pa') {
          label = day.rival?.trim() ? 'Pa vs ' + day.rival.trim() : 'Pa';
        }

        const existing = res.find(r => r.tipo === label && r.hora === horaVal);
        if (!existing) {
          const colors = getColors(cat, rawTipo);
          res.push({ tipo: label, hora: horaVal, ...colors });
        } else if (!existing.hora && horaVal) {
          existing.hora = horaVal;
        }
      }
    }

    // 2. Si hay rival y no se ha añadido Pa
    if (day.rival?.trim() && !res.some(r => r.tipo.startsWith('Pa'))) {
      const colors = getColors('Pa', 'PA');
      res.push({
        tipo: 'Pa vs ' + day.rival.trim(),
        hora: (day as any).hora || '12:00',
        ...colors,
      });
    }

    // 3. Revisar day.evento general si no se encontró nada en slots
    if (res.length === 0 && day.evento) {
      const cat = classify(day.evento);
      if (cat) {
        let label: string = cat;
        if (cat === 'Co' && day.evento.toUpperCase().startsWith('COP')) label = 'Cop';
        if (cat === 'Op' && day.evento.toUpperCase().startsWith('OOP')) label = 'Oop';
        if (cat === 'Pa') {
          label = day.rival?.trim() ? 'Pa vs ' + day.rival.trim() : 'Pa';
        }
        const colors = getColors(cat, day.evento);
        res.push({ tipo: label, hora: '', ...colors });
      }
    }

    return res;
  };

  // Cómputo de Último día de Gimnasio
  const ultimoDiaGymPorJugador = useMemo(() => {
    const res: Record<string, { fecha: string; md: string; nombreSesion: string; diasTranscurridos: number }> = {};

    jugadores.forEach(jug => {
      const sesList: GimnasioSesion[] = [];
      Object.entries(sesionesMap).forEach(([k, val]) => {
        const list = Array.isArray(val) ? val : [val];
        list.forEach(ses => {
          if (!ses) return;
          const jugHasOwn = getSesionesList(getCellKey(jug.id, ses.fecha)).length > 0;
          if (ses.jugadorId === jug.id || (ses.jugadorId === 'TEAM' && !jugHasOwn)) {
            sesList.push(ses);
          }
        });
      });

      if (sesList.length > 0) {
        sesList.sort((a, b) => b.fecha.localeCompare(a.fecha));
        const ult = sesList[0];
        const diffMs = new Date(todayStr + 'T12:00:00').getTime() - new Date(ult.fecha + 'T12:00:00').getTime();
        const diffDias = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        res[jug.id] = { fecha: ult.fecha, md: ult.md || '—', nombreSesion: ult.nombreSesion, diasTranscurridos: diffDias };
      }
    });

    return res;
  }, [jugadores, sesionesMap]);

  // Apertura de Nueva Sesión (SERIES Y REPS EN BLANCO, IGUAL QUE RPE Y GRUPO MUSCULAR)
  const handleOpenNuevaSesion = (jugadorId: string, fecha: string, targetNombre: string) => {
    const day = sortedDays.find(d => d.fecha === fecha);
    const md = day?.md ? normalizeMd(day.md) : '-2MD';

    const nueva: GimnasioSesion = {
      id: 'sesion_' + Date.now(),
      jugadorId,
      fecha,
      md,
      nombreSesion: md === '-2MD' ? 'Fuerza Máxima -2MD' : 'Gimnasio',
      categoria: md === '-2MD' ? 'FUERZA' : 'PREVENTIVO',
      estado: 'planificado',
      duracionMin: 45,
      incluirRpe: true,
      rpeMedio: null,
      variablesColumnas: ['Material'],
      notas: '',
      videoUrl: '',
      hora: '',
      lugar: '',
      ejercicios: [
        {
          id: 'ej_' + Date.now() + '_1',
          bloque: 'PP',
          nombre: '',
          grupoMuscular: '', // EN BLANCO
          series: '', // EN BLANCO
          reps: '', // EN BLANCO
          pesoKg: '', // EN BLANCO
          rpe: null, // EN BLANCO
          material: '', // EN BLANCO
          velocidad: '', // EN BLANCO
          notas: '',
          showNotas: false,
          variablesPersonalizadas: {},
          monitorizado: false,
          tipoSensor: 'ENCODER',
        },
      ],
    };

    setModalSesion(nueva);
    setModalTargetNombre(targetNombre);
  };

  const handleEditSesion = (sesion: GimnasioSesion, targetNombre: string) => {
    const copy: GimnasioSesion = JSON.parse(JSON.stringify(sesion));
    copy.ejercicios = copy.ejercicios.map(e => ({
      ...e,
      showNotas: Boolean(e.notas?.trim()),
      variablesPersonalizadas: e.variablesPersonalizadas || {},
      monitorizado: Boolean(e.monitorizado),
      tipoSensor: e.tipoSensor || 'ENCODER',
    }));
    if (copy.incluirRpe === undefined) copy.incluirRpe = true;
    if (!copy.variablesColumnas) copy.variablesColumnas = ['Material'];
    else if (!copy.variablesColumnas.includes('Material')) copy.variablesColumnas.unshift('Material');

    setModalSesion(copy);
    setModalTargetNombre(targetNombre);
  };

  const handleSaveModalSesion = async () => {
    if (!modalSesion) return;

    const newMap = { ...sesionesMap };
    const key = getCellKey(modalSesion.jugadorId, modalSesion.fecha);
    const currentList = getSesionesList(key);
    const existingIdx = currentList.findIndex(s => s.id === modalSesion.id);

    if (existingIdx >= 0) {
      const updated = [...currentList];
      updated[existingIdx] = modalSesion;
      newMap[key] = updated;
    } else {
      newMap[key] = [...currentList, modalSesion];
    }

    setSesionesMap(newMap);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newMap));
    } catch (e) {}

    // Guardar enlaces de video de los ejercicios en el catálogo permanente para recordarlos siempre
    modalSesion.ejercicios.forEach(ej => {
      if (ej.nombre?.trim() && ej.videoUrl?.trim()) {
        saveEjercicioVideoToCatalog(ej.nombre, ej.videoUrl);
      }
    });

    // Sincronizar con Supabase
    let targetJugadoresList: JugadorGimnasio[] = [];
    if (modalSesion.jugadorId === 'TEAM') targetJugadoresList = jugadores;
    else {
      const single = jugadores.find(j => j.id === modalSesion.jugadorId);
      targetJugadoresList = single ? [single] : [{ id: modalSesion.jugadorId, nombre: modalTargetNombre || 'Jugador' }];
    }

    const rowsToSave: any[] = [];
    targetJugadoresList.forEach(jug => {
      modalSesion.ejercicios.forEach(ej => {
        rowsToSave.push({
          fecha: modalSesion.fecha,
          md: modalSesion.md || '',
          jugador_id: jug.id,
          jugadorNombre: jug.apodo || jug.nombre,
          dorsal: jug.dorsal || null,
          posicion: jug.posicion || null,
          nombreSesion: modalSesion.nombreSesion,
          categoria: modalSesion.categoria,
          bloque: ej.bloque || 'PP',
          ejercicioNombre: ej.nombre,
          grupoMuscular: ej.grupoMuscular || '',
          series: ej.series,
          reps: String(ej.reps || ''),
          pesoKg: String(ej.pesoKg || ''),
          rpe: modalSesion.incluirRpe ? ej.rpe : null,
          comentario: ej.notas || '',
          videoUrl: ej.videoUrl || '',
          sesionVideoUrl: modalSesion.videoUrl || '',
          sesionNotas: modalSesion.notas || '',
          hora: modalSesion.hora || '',
          lugar: modalSesion.lugar || '',
          variables: { ...ej.variablesPersonalizadas, ...(ej.material ? { Material: ej.material } : {}), ...(ej.velocidad ? { Velocidad: ej.velocidad } : {}), ...(ej.videoUrl ? { videoUrl: ej.videoUrl } : {}) },
          estado: modalSesion.estado || 'completado',
        });
      });
    });

    saveFuerzaSesionesBatch(rowsToSave).catch(console.warn);
    showToast('✓ Sesión guardada en Supabase y BBDD FUERZA');
    setModalSesion(null);
  };

  const handleDeleteSesion = (jugadorId: string, fecha: string, sesionId?: string) => {
    const key = getCellKey(jugadorId, fecha);
    const newMap = { ...sesionesMap };
    const currentList = getSesionesList(key);
    const toDelete = sesionId ? currentList.find(s => s.id === sesionId) : currentList[0];

    if (sesionId && currentList.length > 1) {
      newMap[key] = currentList.filter(s => s.id !== sesionId);
    } else {
      delete newMap[key];
    }

    setSesionesMap(newMap);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newMap));
    } catch (e) {}

    // Sincronizar borrado con Supabase y actualizar backup en disco
    deleteFuerzaSesionFromSupabase(jugadorId, fecha, toDelete?.nombreSesion).catch(console.warn);

    showToast('🗑️ Sesión eliminada de Supabase y BBDD');
    if (modalSesion && (!sesionId || modalSesion.id === sesionId)) setModalSesion(null);
  };

  const handleAplicarATodoElEquipo = async (sesion: GimnasioSesion) => {
    const newMap = { ...sesionesMap };
    newMap[getCellKey('TEAM', sesion.fecha)] = [{ ...sesion, jugadorId: 'TEAM' }];

    jugadores.forEach(jug => {
      const copy: GimnasioSesion = {
        ...JSON.parse(JSON.stringify(sesion)),
        id: 'sesion_' + jug.id + '_' + sesion.fecha + '_' + Date.now(),
        jugadorId: jug.id,
      };
      newMap[getCellKey(jug.id, sesion.fecha)] = [copy];
    });

    setSesionesMap(newMap);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newMap));
    } catch (e) {}

    const rowsToSave: any[] = [];
    jugadores.forEach(jug => {
      sesion.ejercicios.forEach(ej => {
        rowsToSave.push({
          fecha: sesion.fecha,
          md: sesion.md || '',
          jugador_id: jug.id,
          jugadorNombre: jug.apodo || jug.nombre,
          dorsal: jug.dorsal || null,
          posicion: jug.posicion || null,
          nombreSesion: sesion.nombreSesion,
          categoria: sesion.categoria,
          bloque: ej.bloque || 'PP',
          ejercicioNombre: ej.nombre,
          grupoMuscular: ej.grupoMuscular || '',
          series: ej.series,
          reps: String(ej.reps || ''),
          pesoKg: String(ej.pesoKg || ''),
          rpe: sesion.incluirRpe ? ej.rpe : null,
          comentario: ej.notas || '',
          videoUrl: ej.videoUrl || '',
          sesionVideoUrl: sesion.videoUrl || '',
          sesionNotas: sesion.notas || '',
          hora: sesion.hora || '',
          lugar: sesion.lugar || '',
          variables: { ...ej.variablesPersonalizadas, ...(ej.material ? { Material: ej.material } : {}), ...(ej.videoUrl ? { videoUrl: ej.videoUrl } : {}) },
          estado: sesion.estado || 'completado',
        });
      });
    });

    saveFuerzaSesionesBatch(rowsToSave).catch(console.warn);
    showToast('✓ Aplicada a todo el equipo y guardada en Supabase');
    setModalSesion(null);
  };

  // Copiar sesión
  const handleCopiarSesion = (sesion: GimnasioSesion, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setClipboardSesion(JSON.parse(JSON.stringify(sesion)));
    showToast('📋 Sesión copiada. Ahora puedes pegarla en cualquier celda.');
  };

  // Comprobar si ya tiene sesión para preguntar si añadir como 2ª sesión o reemplazar
  const handlePromptPegarSesion = (targetJugadorId: string, targetFecha: string, targetNombre: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!clipboardSesion) return;

    const key = getCellKey(targetJugadorId, targetFecha);
    const currentList = getSesionesList(key);

    if (currentList.length === 0) {
      handleEjecutarPegar(targetJugadorId, targetFecha, 'add');
    } else {
      setPasteDialog({
        jugadorId: targetJugadorId,
        jugadorNombre: targetNombre,
        fecha: targetFecha,
        existingCount: currentList.length,
      });
    }
  };

  const handleEjecutarPegar = (targetJugadorId: string, targetFecha: string, mode: 'add' | 'replace' = 'add') => {
    if (!clipboardSesion) return;

    const newMap = { ...sesionesMap };
    const key = getCellKey(targetJugadorId, targetFecha);
    const currentList = getSesionesList(key);
    const pasted: GimnasioSesion = {
      ...JSON.parse(JSON.stringify(clipboardSesion)),
      id: 'sesion_' + targetJugadorId + '_' + targetFecha + '_' + Date.now(),
      jugadorId: targetJugadorId,
      fecha: targetFecha,
    };

    if (mode === 'add') {
      newMap[key] = [...currentList, pasted];
    } else {
      newMap[key] = [pasted];
    }

    setSesionesMap(newMap);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newMap));
    } catch (e) {}

    // Guardar enlaces de video de los ejercicios en el catálogo permanente para recordarlos siempre
    pasted.ejercicios.forEach(ej => {
      if (ej.nombre?.trim() && ej.videoUrl?.trim()) {
        saveEjercicioVideoToCatalog(ej.nombre, ej.videoUrl);
      }
    });

    // Sincronizar con Supabase
    const targetJug = jugadores.find(j => j.id === targetJugadorId);
    const rowsToSave = pasted.ejercicios.map(ej => ({
      fecha: targetFecha,
      md: pasted.md || '',
      jugador_id: targetJug?.id || targetJugadorId,
      jugadorNombre: targetJug?.apodo || targetJug?.nombre || (targetJugadorId === 'TEAM' ? 'Equipo Completo' : 'Jugador'),
      dorsal: targetJug?.dorsal || null,
      posicion: targetJug?.posicion || null,
      nombreSesion: pasted.nombreSesion,
      categoria: pasted.categoria,
      bloque: ej.bloque || 'PP',
      ejercicioNombre: ej.nombre,
      grupoMuscular: ej.grupoMuscular || '',
      series: ej.series,
      reps: String(ej.reps || ''),
      pesoKg: String(ej.pesoKg || ''),
      rpe: pasted.incluirRpe ? ej.rpe : null,
      comentario: ej.notas || '',
      videoUrl: ej.videoUrl || '',
      sesionVideoUrl: pasted.videoUrl || '',
      sesionNotas: pasted.notas || '',
      hora: pasted.hora || '',
      lugar: pasted.lugar || '',
      variables: { ...(ej.variablesPersonalizadas || {}), ...(ej.videoUrl ? { videoUrl: ej.videoUrl } : {}) },
      estado: pasted.estado || 'completado',
    }));
    saveFuerzaSesionesBatch(rowsToSave).catch(console.warn);

    showToast(mode === 'add' && currentList.length > 0 ? '✓ 2ª Sesión añadida con éxito' : '📥 Sesión pegada exitosamente');
  };

  const handleDragStartSesion = (sesion: GimnasioSesion, fromKey: string, e: React.DragEvent) => {
    setDraggedSesion({ sesion, fromKey });
    e.dataTransfer.setData('text/plain', fromKey);
  };

  const handleDropOnCell = (targetJugadorId: string, targetFecha: string, e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedSesion) return;

    const newMap = { ...sesionesMap };
    const targetKey = getCellKey(targetJugadorId, targetFecha);
    const targetList = getSesionesList(targetKey);

    const movedSesion: GimnasioSesion = {
      ...JSON.parse(JSON.stringify(draggedSesion.sesion)),
      id: 'sesion_' + targetJugadorId + '_' + targetFecha + '_' + Date.now(),
      jugadorId: targetJugadorId,
      fecha: targetFecha,
    };

    newMap[targetKey] = [...targetList, movedSesion];
    if (!e.altKey && draggedSesion.fromKey !== targetKey) {
      const fromList = getSesionesList(draggedSesion.fromKey);
      const remaining = fromList.filter(s => s.id !== draggedSesion.sesion.id);
      if (remaining.length === 0) delete newMap[draggedSesion.fromKey];
      else newMap[draggedSesion.fromKey] = remaining;
    }

    setSesionesMap(newMap);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newMap));
    } catch (e) {}

    // Sincronizar destino con Supabase
    const targetJug = jugadores.find(j => j.id === targetJugadorId);
    const rowsToSave = movedSesion.ejercicios.map(ej => ({
      fecha: targetFecha,
      md: movedSesion.md || '',
      jugador_id: targetJug?.id || targetJugadorId,
      jugadorNombre: targetJug?.apodo || targetJug?.nombre || (targetJugadorId === 'TEAM' ? 'Equipo Completo' : 'Jugador'),
      dorsal: targetJug?.dorsal || null,
      posicion: targetJug?.posicion || null,
      nombreSesion: movedSesion.nombreSesion,
      categoria: movedSesion.categoria,
      bloque: ej.bloque || 'PP',
      ejercicioNombre: ej.nombre,
      grupoMuscular: ej.grupoMuscular || '',
      series: ej.series,
      reps: String(ej.reps || ''),
      pesoKg: String(ej.pesoKg || ''),
      rpe: movedSesion.incluirRpe ? ej.rpe : null,
      comentario: ej.notas || '',
      videoUrl: ej.videoUrl || '',
      sesionVideoUrl: movedSesion.videoUrl || '',
      sesionNotas: movedSesion.notas || '',
      hora: movedSesion.hora || '',
      lugar: movedSesion.lugar || '',
      variables: { ...(ej.variablesPersonalizadas || {}), ...(ej.videoUrl ? { videoUrl: ej.videoUrl } : {}) },
      estado: movedSesion.estado || 'completado',
    }));
    saveFuerzaSesionesBatch(rowsToSave).catch(console.warn);

    // Si no es duplicar con Alt, eliminar de origen en Supabase
    if (!e.altKey && draggedSesion.fromKey !== targetKey) {
      deleteFuerzaSesionFromSupabase(
        draggedSesion.sesion.jugadorId,
        draggedSesion.sesion.fecha,
        draggedSesion.sesion.nombreSesion
      ).catch(console.warn);
    }

    setDraggedSesion(null);
    showToast('✓ Sesión guardada y sincronizada en Supabase');
  };


  // Handlers para respaldo y recuperación al 100% de la BBDD Fuerza
  const handleManualBackup = async () => {
    setIsBackupLoading(true);
    try {
      const res = await backupFuerzaBBDDToDisk();
      if (res.success) {
        showToast(`🛡️ Copia de seguridad guardada al 100% (${res.count} ejercicios respaldados)`);
      } else {
        showToast(`⚠️ Error al respaldar: ${res.error || 'Desconocido'}`);
      }
    } catch (e: any) {
      showToast(`⚠️ Error: ${e.message}`);
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleManualRestore = async () => {
    const ok = window.confirm(
      '¿Deseas restaurar la base de datos de fuerza y gimnasio al 100% desde la copia de seguridad guardada en el servidor?\n\nEsto recuperará todos los ejercicios y sesiones guardadas.'
    );
    if (!ok) return;

    setIsBackupLoading(true);
    try {
      const res = await restoreFuerzaBBDDFromDisk();
      if (res.success) {
        showToast(`✓ Restaurado al 100% (${res.count} ejercicios recuperados). Actualizando...`);
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } else {
        showToast(`⚠️ Error al restaurar: ${res.error || 'No se pudo recuperar'}`);
      }
    } catch (e: any) {
      showToast(`⚠️ Error: ${e.message}`);
    } finally {
      setIsBackupLoading(false);
    }
  };

  // Función para hacer auto-scroll suave hacia el ejercicio recién añadido a la pila
  const scrollToNewEjercicio = (nuevoId?: string) => {
    setTimeout(() => {
      if (tableScrollRef.current) {
        tableScrollRef.current.scrollTo({
          top: tableScrollRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }
      if (ejerciciosBottomRef.current) {
        ejerciciosBottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      if (nuevoId) {
        const input = document.getElementById(`ej_input_nombre_${nuevoId}`);
        if (input) {
          input.focus();
        }
      }
    }, 60);
  };

  // Añadir ejercicio en modal (SERIES Y REPS EN BLANCO)
  const handleAddEjercicio = () => {
    if (!modalSesion) return;
    const nuevoId = 'ej_' + Date.now();
    const nuevo: GimnasioEjercicio = {
      id: nuevoId,
      bloque: 'PP',
      nombre: '',
      grupoMuscular: '', // EN BLANCO
      series: '', // EN BLANCO
      reps: '', // EN BLANCO
      pesoKg: '', // EN BLANCO
      rpe: null, // EN BLANCO
      material: '', // EN BLANCO
      velocidad: '', // EN BLANCO
      notas: '',
      showNotas: false,
      variablesPersonalizadas: {},
      monitorizado: false,
      tipoSensor: 'ENCODER',
    };
    setModalSesion({ ...modalSesion, ejercicios: [...modalSesion.ejercicios, nuevo] });
    scrollToNewEjercicio(nuevoId);
  };

  const handleCopiarFilaEjercicio = (ej: GimnasioEjercicio) => {
    setClipboardEjercicio(JSON.parse(JSON.stringify(ej)));
    showToast('📋 Ejercicio copiado');
  };

  const handlePegarFilaEjercicio = () => {
    if (!modalSesion || !clipboardEjercicio) return;
    const clonedId = 'ej_' + Date.now();
    const cloned: GimnasioEjercicio = {
      ...JSON.parse(JSON.stringify(clipboardEjercicio)),
      id: clonedId,
    };
    setModalSesion({ ...modalSesion, ejercicios: [...modalSesion.ejercicios, cloned] });
    showToast('📥 Ejercicio pegado');
    scrollToNewEjercicio(clonedId);
  };

  const handleMoveEjercicio = (index: number, direction: 'up' | 'down') => {
    if (!modalSesion) return;
    const list = [...modalSesion.ejercicios];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;
    setModalSesion({ ...modalSesion, ejercicios: list });
  };

  const handleDragStartModal = (index: number) => {
    setDraggedEjercicioIndex(index);
  };

  const handleDropModal = (targetIndex: number) => {
    if (!modalSesion || draggedEjercicioIndex === null || draggedEjercicioIndex === targetIndex) return;
    const list = [...modalSesion.ejercicios];
    const item = list.splice(draggedEjercicioIndex, 1)[0];
    list.splice(targetIndex, 0, item);
    setModalSesion({ ...modalSesion, ejercicios: list });
    setDraggedEjercicioIndex(null);
  };

  const handleAddVariable = (nombreVar: string) => {
    if (!modalSesion || !nombreVar.trim()) return;
    const clean = nombreVar.trim();
    const cols = modalSesion.variablesColumnas || [];
    if (!cols.includes(clean)) {
      setModalSesion({ ...modalSesion, variablesColumnas: [...cols, clean] });
      showToast('✓ Variable "' + clean + '" añadida');
    }
    setNuevaVariableInput('');
    setShowAddVariableDropdown(false);
  };

  const handleRemoveVariable = (nombreVar: string) => {
    if (!modalSesion) return;
    const cols = (modalSesion.variablesColumnas || []).filter(c => c !== nombreVar);
    setModalSesion({ ...modalSesion, variablesColumnas: cols });
  };

  // Abrir Modal de Reportes
  const handleOpenReportModal = () => {
    // Buscar la fecha más reciente con entrenos o por defecto 2026-10-10
    const fechaConSesion = sortedDays.slice().reverse().find(d => sesionesMap[getCellKey('TEAM', d.fecha)] || Object.keys(sesionesMap).some(k => k.endsWith('_' + d.fecha)))?.fecha || '2026-10-10';
    setReportFecha(fechaConSesion);
    const adriJug = jugadores.find(j => j.nombre.toLowerCase().includes('exposito') || j.nombre.toLowerCase().includes('adri'));
    if (adriJug) {
      setSelectedReportJugadorIds([adriJug.id]);
    } else {
      setSelectedReportJugadorIds(jugadores.slice(0, 5).map(j => j.id));
    }
    setShowReportConfigModal(true);
  };

  // Obtener evento Co (Coadyuvante) y sus características exactas para el reporte
  const getEventoCoContextoReporte = (day?: SesionDia, jugadorId?: string, sesion?: GimnasioSesion) => {
    if (!day) {
      return {
        hora: (sesion?.hora && sesion.hora.trim()) || '',
        lugar: (sesion?.lugar && sesion.lugar.trim()) || 'GYM',
        duracion: String(sesion?.duracionMin || 45),
        orientacion: sesion?.categoria || 'RECUPERACION',
        tipo: 'COADYUVANTE',
      };
    }

    // 1. Identificar si el jugador tiene asignado un código específico de Co (ej. Co, Co1, Co2)
    let targetCode = '';
    if (jugadorId) {
      const assigned = playerEventsMap[`${jugadorId}_${day.id}`] || playerEventsMap[`${jugadorId}_${day.fecha}`];
      if (assigned) {
        const parts = assigned.split(',').map(s => s.trim());
        const coPart = parts.find(p => p.toUpperCase().startsWith('CO'));
        if (coPart) targetCode = coPart.toUpperCase();
      }
    }

    // 2. Buscar bloques de evento Co en el día (slots 0..6)
    let coEvent: any = null;
    const allDayCoEvents: any[] = [];

    for (let slot = 0; slot <= 6; slot++) {
      const k1 = `${day.id}_slot_${slot}`;
      const k2 = `${day.fecha}_slot_${slot}`;
      const ev = eventosPlanMap[k1] || eventosPlanMap[k2];
      const directTipo = (day as any)[`evento_${slot}`] || (day as any)[`evento_${slot + 1}`];
      const tipo = (ev?.tipo || directTipo || '').trim().toUpperCase();

      if (
        tipo === 'CO' ||
        tipo.startsWith('CO ') ||
        tipo.startsWith('CO1') ||
        tipo.startsWith('CO2') ||
        tipo.startsWith('COP') ||
        tipo.includes('COADYUVANTE') ||
        tipo.includes('COADJUVANT')
      ) {
        const item = ev || {
          tipo,
          hora: (day as any).hora || '',
          lugar: (day as any).lugar || (day as any).campo || '',
          duracion: (day as any).duracion || '',
          orientacion: '',
        };
        allDayCoEvents.push(item);
      }
    }

    // Si hay código asignado exacto (ej. Co1, Co2)
    if (targetCode && allDayCoEvents.length > 0) {
      coEvent = allDayCoEvents.find(e => (e.tipo || '').toUpperCase() === targetCode) || allDayCoEvents[0];
    } else if (allDayCoEvents.length > 0) {
      coEvent = allDayCoEvents[0];
    }

    // Fallback: si no hay Co explícito, buscar eventos de fuerza/gym
    if (!coEvent) {
      for (let slot = 0; slot <= 6; slot++) {
        const k1 = `${day.id}_slot_${slot}`;
        const k2 = `${day.fecha}_slot_${slot}`;
        const ev = eventosPlanMap[k1] || eventosPlanMap[k2];
        const tipo = (ev?.tipo || '').toLowerCase();
        if (tipo.includes('fuerza') || tipo.includes('gimnasio') || tipo.includes('gym')) {
          coEvent = ev;
          break;
        }
      }
    }

    // Extraer hora limpia (si la sesión tiene hora editada, usarla)
    let hora = (sesion?.hora && sesion.hora.trim()) || coEvent?.hora || (day as any).hora || '';
    if (hora) {
      hora = hora.trim().replace(/^0(\d:)/, '$1');
    } else {
      hora = '';
    }

    // Extraer lugar limpio (si la sesión tiene lugar editado, usarlo)
    let lugar = (sesion?.lugar && sesion.lugar.trim()) || coEvent?.lugar || (day as any).lugar || (day as any).campo || '';
    if (lugar && lugar.trim().toUpperCase() !== 'BOX49') {
      lugar = lugar.trim().toUpperCase();
    } else {
      lugar = 'GYM';
    }

    // Extraer duración
    let duracion = coEvent?.duracion || (day as any).duracion || '';
    if (duracion) {
      duracion = duracion.toString().replace(/'$/, '').replace(/min$/i, '').trim();
    }
    if (!duracion && sesion?.duracionMin) {
      duracion = String(sesion.duracionMin);
    }
    if (!duracion) duracion = '45';

    // Título / Orientación real de la sesión (prioridad absoluta al título real)
    let orientacion = (sesion?.nombreSesion && sesion.nombreSesion.trim()) ||
                      (sesion?.categoria && sesion.categoria.trim()) ||
                      coEvent?.orientacion?.trim() ||
                      coEvent?.comentario?.trim() ||
                      'FUERZA';
    orientacion = orientacion.toUpperCase();

    return {
      hora,
      lugar,
      duracion,
      orientacion,
      tipo: coEvent?.tipo || 'COADYUVANTE',
    };
  };

  // Sesiones para el Reporte (SOLO incluye sesiones reales, nunca inventadas ni copiadas a todos)
  const reportData = useMemo(() => {
    const individualSheets: Array<{ jugador: JugadorGimnasio; sesion: GimnasioSesion; day?: SesionDia }> = [];
    let teamSheet: { sesion: GimnasioSesion; day?: SesionDia; jugadores: JugadorGimnasio[] } | null = null;

    const dayObj = sortedDays.find(d => d.fecha === reportFecha);

    // Individuales seleccionados: SOLO los jugadores que tienen sesión individual registrada con ejercicios
    selectedReportJugadorIds.forEach(jId => {
      const jug = jugadores.find(j => j.id === jId);
      if (!jug) return;
      
      const jugSesiones = getSesionesList(getCellKey(jug.id, reportFecha));
      if (jugSesiones && jugSesiones.length > 0) {
        jugSesiones.forEach(s => {
          if (s.ejercicios && s.ejercicios.length > 0) {
            individualSheets.push({ jugador: jug, sesion: s, day: dayObj });
          }
        });
      }
    });

    // Grupal: SOLO si existe una sesión registrada para el equipo ('TEAM') con ejercicios
    const teamSesList = getSesionesList(getCellKey('TEAM', reportFecha));
    if (teamSesList && teamSesList.length > 0 && teamSesList[0].ejercicios?.length > 0) {
      teamSheet = {
        sesion: teamSesList[0],
        day: dayObj,
        jugadores: jugadores.filter(j => selectedReportJugadorIds.includes(j.id)),
      };
    }

    return { individualSheets, teamSheet, dayObj };
  }, [reportFecha, selectedReportJugadorIds, sesionesMap, sortedDays, jugadores]);

  // Generar título del PDF con formato: sesión gimnasio (nombre) - (dia)
  const getPdfExportTitle = () => {
    let nombre = 'Equipo';
    if (reportTipo === 'individual' || reportTipo === 'ambos') {
      if (reportData.individualSheets.length === 1) {
        nombre = reportData.individualSheets[0].jugador.nombre;
      } else if (reportData.individualSheets.length > 1) {
        const uniqueNames = Array.from(new Set(reportData.individualSheets.map(s => s.jugador.nombre)));
        if (uniqueNames.length === 1) {
          nombre = uniqueNames[0];
        } else if (uniqueNames.length <= 2) {
          nombre = uniqueNames.join(', ');
        } else {
          nombre = 'Varios Jugadores';
        }
      }
    } else if (reportTipo === 'grupal') {
      nombre = 'Equipo';
    }

    let diaStr = reportFecha;
    if (reportFecha && reportFecha.includes('-')) {
      const parts = reportFecha.split('-');
      if (parts.length === 3) {
        const [yyyy, mm, dd] = parts;
        diaStr = `${dd}-${mm}-${yyyy}`;
      }
    }

    const realSessionTitle = reportData.individualSheets[0]?.sesion?.nombreSesion ||
      reportData.teamSheet?.sesion?.nombreSesion ||
      'sesión gimnasio';
    return `${realSessionTitle.toLowerCase()} ${nombre} - ${diaStr}`;
  };

  const handlePrintReport = () => {
    if (typeof window === 'undefined') return;
    setToastMessage(null);
    const prevTitle = document.title;
    const pdfTitle = getPdfExportTitle();
    document.title = pdfTitle;
    window.print();
    setTimeout(() => {
      if (!showReportPreviewModal) {
        document.title = prevTitle;
      }
    }, 2000);
  };

  // Mantener document.title actualizado mientras la vista previa del reporte esté abierta
  useEffect(() => {
    if (!showReportPreviewModal || typeof window === 'undefined') return;
    const prevTitle = document.title;
    document.title = getPdfExportTitle();
    return () => {
      document.title = prevTitle;
    };
  }, [showReportPreviewModal, reportData, reportTipo, reportFecha]);

  // Cerrar menú de 3 puntitos al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuPuntitosRef.current && !menuPuntitosRef.current.contains(event.target as Node)) {
        setShowMenuPuntitos(false);
      }
    }
    if (showMenuPuntitos) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenuPuntitos]);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'inherit' }}>
      {/* Toast */}
      {toastMessage && (
        <div className="no-print" style={{
          position: 'fixed',
          top: '20px',
          right: '24px',
          background: '#0f172a',
          color: '#ffffff',
          padding: '10px 18px',
          borderRadius: '8px',
          fontWeight: 700,
          fontSize: '12.5px',
          zIndex: 99999,
          boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
        }}>
          {toastMessage}
        </div>
      )}

      {/* TOPBAR */}
      <header className="no-print" style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 60,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link
            href="/"
            style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textDecoration: 'none', background: '#f1f5f9', padding: '5px 10px', borderRadius: '6px' }}
          >
            ← Inicio
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>🏋️</span>
            <h1 style={{ fontSize: '17px', fontWeight: 900, color: '#0f172a', margin: 0 }}>
              GIMNASIO
            </h1>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* BOTÓN MONITORIZACIÓN (TABLET / MÓVIL) */}
          <button
            onClick={() => setShowEstacionModal(true)}
            title="Abrir Monitorización de Ejercicios en Kiosco / Tablet (Encoder VBT y Dinamómetro)"
            style={{
              padding: '7px 15px',
              borderRadius: '6px',
              border: 'none',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 5px rgba(2, 132, 199, 0.35)',
              whiteSpace: 'nowrap',
            }}
          >
            <span>⚡</span>
            <span>Monitorización</span>
          </button>

          {/* BOTÓN REALIZAR REPORT (INDIVIDUAL O GRUPAL) */}
          <button
            onClick={handleOpenReportModal}
            style={{
              padding: '7px 13px',
              borderRadius: '6px',
              border: 'none',
              background: '#b91c1c',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(185, 28, 28, 0.25)',
              whiteSpace: 'nowrap',
            }}
          >
            <span>📄</span>
            <span>Generar Report</span>
          </button>

          {/* BOTÓN 3 PUNTITOS (MÁS OPCIONES: COPIA, RESTAURAR, BBDD FUERZA, PLANIFICACIÓN, CONTROL DE CARGAS) */}
          <div ref={menuPuntitosRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMenuPuntitos(prev => !prev)}
              title="Más opciones de gestión y enlaces"
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: showMenuPuntitos ? '#f1f5f9' : '#ffffff',
                color: '#334155',
                fontSize: '18px',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              ⋮
            </button>

            {showMenuPuntitos && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '6px',
                  width: '220px',
                  background: '#ffffff',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                  border: '1px solid #cbd5e1',
                  padding: '6px',
                  zIndex: 9999,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', padding: '4px 8px' }}>
                  Gestión y Respaldo
                </div>

                <button
                  onClick={() => {
                    setShowMenuPuntitos(false);
                    handleManualBackup();
                  }}
                  disabled={isBackupLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '5px',
                    border: 'none',
                    background: '#f0fdf4',
                    color: '#15803d',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span>🛡️</span>
                  <span>Copia 100%</span>
                </button>

                <button
                  onClick={() => {
                    setShowMenuPuntitos(false);
                    handleManualRestore();
                  }}
                  disabled={isBackupLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '5px',
                    border: 'none',
                    background: '#fffbeb',
                    color: '#b45309',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span>🔄</span>
                  <span>Restaurar 100%</span>
                </button>

                <div style={{ height: '1px', background: '#f1f5f9', margin: '4px 0' }} />

                <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', padding: '4px 8px' }}>
                  Enlaces Rápidos
                </div>

                <Link
                  href="/base-datos/fuerza"
                  onClick={() => setShowMenuPuntitos(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '5px',
                    color: '#0369a1',
                    background: '#f0f9ff',
                    textDecoration: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                >
                  <span>📊</span>
                  <span>BBDD Fuerza</span>
                </Link>

                <Link
                  href="/calendario"
                  onClick={() => setShowMenuPuntitos(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '5px',
                    color: '#1e3a8a',
                    background: '#eff6ff',
                    textDecoration: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                >
                  <span>📅</span>
                  <span>Planificación</span>
                </Link>

                <Link
                  href="/cargas"
                  onClick={() => setShowMenuPuntitos(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '5px',
                    color: '#ffffff',
                    background: '#1e3a8a',
                    textDecoration: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                >
                  <span>⚡</span>
                  <span>Control de Cargas</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* FILTROS SUPERIORES */}
      <section className="no-print" style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '10px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        {/* Fila MD y Portapapeles compacto */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
              Filtro MD:
            </span>
            {['TODOS', '-5MD', '-4MD', '-3MD', '-2MD', '-1MD', 'MD', '+1MD', '+2MD'].map(mdTag => {
              const isSelected = selectedMdFilter === mdTag;
              return (
                <button
                  key={mdTag}
                  onClick={() => setSelectedMdFilter(mdTag)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '16px',
                    fontSize: '11px',
                    fontWeight: isSelected ? 900 : 700,
                    cursor: 'pointer',
                    border: isSelected ? '1px solid #1e3a8a' : '1px solid #cbd5e1',
                    background: isSelected ? '#1e3a8a' : '#ffffff',
                    color: isSelected ? '#ffffff' : '#334155',
                  }}
                >
                  {mdTag}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* PORTAPAPELES COMPACTO Y FÁCIL DE QUITAR */}
            {clipboardSesion && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                padding: '3px 8px',
                borderRadius: '16px',
                fontSize: '11px',
                color: '#1e3a8a',
                fontWeight: 800,
              }}>
                <span>📋 Copiado: {clipboardSesion.nombreSesion.slice(0, 16)}</span>
                <button
                  onClick={() => { setClipboardSesion(null); showToast('Portapapeles vaciado'); }}
                  title="Quitar de portapapeles"
                  style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontWeight: 900, padding: 0 }}
                >
                  ✕
                </button>
              </div>
            )}

            <button
              onClick={() => setShowUltimoGymPanel(!showUltimoGymPanel)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: showUltimoGymPanel ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                background: showUltimoGymPanel ? '#fef3c7' : '#ffffff',
                color: showUltimoGymPanel ? '#b45309' : '#0f172a',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              ⚡ {showUltimoGymPanel ? 'Ocultar Último Día' : 'Último Día Gym'}
            </button>
          </div>
        </div>

        {/* Fila Fechas y Búsqueda */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
              <button
                onClick={() => handleShiftDias(-8)}
                title="Retroceder 8 días"
                style={{ padding: '3px 7px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
              >
                ◀
              </button>
              <button
                onClick={handleReset8DiasHoy}
                title="Predeterminado: 8 días (Hoy es el día 5)"
                style={{ padding: '3px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '11px', fontWeight: 800, color: '#1e3a8a', cursor: 'pointer' }}
              >
                Hoy (8d)
              </button>
              <button
                onClick={() => handleShiftDias(8)}
                title="Avanzar 8 días"
                style={{ padding: '3px 7px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
              >
                ▶
              </button>
            </div>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Desde:</span>
            <input
              type="date"
              value={fechaDesde}
              onChange={e => setFechaDesde(e.target.value)}
              style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11.5px' }}
            />
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Hasta:</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={e => setFechaHasta(e.target.value)}
              style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11.5px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => setGlobalExpandEjercicios(!globalExpandEjercicios)}
              title={globalExpandEjercicios ? "Contraer a vista compacta de sesiones" : "Ampliar y desglosar ejercicios de todas las sesiones mientras ves los días"}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                border: globalExpandEjercicios ? '1px solid #3b82f6' : '1px solid #cbd5e1',
                background: globalExpandEjercicios ? '#eff6ff' : '#ffffff',
                color: globalExpandEjercicios ? '#1d4ed8' : '#475569',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{globalExpandEjercicios ? '⊟' : '⊞'}</span>
              <span>{globalExpandEjercicios ? 'Vista Compacta' : 'Ampliar Ejercicios'}</span>
            </button>

            {/* SELECTOR DE JUGADOR INDIVIDUAL */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <select
                value={selectedJugadorChip}
                onChange={e => {
                  const val = e.target.value;
                  setSelectedJugadorChip(val);
                  if (val !== 'TODOS') {
                    setExpandedJugadoresMap(prev => ({ ...prev, [val]: true }));
                  }
                }}
                title="Seleccionar un jugador para visión individual o ver todos"
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: selectedJugadorChip !== 'TODOS' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                  background: selectedJugadorChip !== 'TODOS' ? '#eff6ff' : '#ffffff',
                  color: selectedJugadorChip !== 'TODOS' ? '#1d4ed8' : '#334155',
                  fontSize: '11.5px',
                  fontWeight: selectedJugadorChip !== 'TODOS' ? 800 : 600,
                  cursor: 'pointer',
                  maxWidth: '170px',
                }}
              >
                <option value="TODOS">👥 Todos ({jugadores.length})</option>
                {jugadores.slice().sort((a,b) => (a.apodo || a.nombre).localeCompare(b.apodo || b.nombre)).map(j => (
                  <option key={j.id} value={j.id}>
                    {j.dorsal ? '#' + j.dorsal + ' ' : ''}{j.apodo || j.nombre}
                  </option>
                ))}
              </select>

              {selectedJugadorChip !== 'TODOS' && (
                <button
                  onClick={() => setSelectedJugadorChip('TODOS')}
                  title="Volver a ver todos los jugadores"
                  style={{
                    padding: '3px 6px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: '#f1f5f9',
                    color: '#64748b',
                    fontSize: '10px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            <input
              type="text"
              placeholder="Buscar jugador..."
              value={searchJugadorText}
              onChange={e => setSearchJugadorText(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11.5px', width: '110px' }}
            />
          </div>
        </div>
      </section>

      {/* BANNER VISIÓN INDIVIDUAL DE UN SOLO JUGADOR */}
      {selectedJugadorChip !== 'TODOS' && (() => {
        const jugSel = jugadores.find(j => j.id === selectedJugadorChip);
        if (!jugSel) return null;
        const isExp = Boolean(globalExpandEjercicios || expandedJugadoresMap[jugSel.id] || selectedJugadorChip === jugSel.id);
        return (
          <div className="no-print" style={{
            background: 'linear-gradient(90deg, #eff6ff 0%, #f8fafc 100%)',
            borderBottom: '2px solid #bfdbfe',
            borderTop: '1px solid #dbeafe',
            padding: '8px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {jugSel.foto_url ? (
                <img
                  src={jugSel.foto_url}
                  alt={jugSel.nombre}
                  style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #3b82f6' }}
                  onError={e => { (e.currentTarget as any).style.display = 'none'; }}
                />
              ) : (
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#1d4ed8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900 }}>
                  {jugSel.dorsal || (jugSel.apodo || jugSel.nombre).charAt(0)}
                </div>
              )}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 900, color: '#1e3a8a' }}>
                    {jugSel.apodo || jugSel.nombre}
                  </span>
                  {jugSel.dorsal && (
                    <span style={{ fontSize: '10.5px', background: '#dbeafe', color: '#1d4ed8', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                      DORSAL #{jugSel.dorsal}
                    </span>
                  )}
                  {jugSel.posicion && (
                    <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700 }}>
                      {jugSel.posicion}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#2563eb', fontWeight: 600 }}>
                  👁️ Visión individual activada — Visualizando {diasFiltrados.length} días de la planificación
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => toggleExpandJugador(jugSel.id)}
                title={isExp ? "Contraer ejercicios a vista resumen" : "Desglosar todos los ejercicios y series"}
                style={{
                  padding: '5px 12px',
                  borderRadius: '5px',
                  border: isExp ? '1px solid #2563eb' : '1px solid #93c5fd',
                  background: isExp ? '#2563eb' : '#ffffff',
                  color: isExp ? '#ffffff' : '#1d4ed8',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <span>{isExp ? '⊟' : '⊞'}</span>
                <span>{isExp ? 'Plegar Ejercicios' : 'Ampliar Ejercicios'}</span>
              </button>

              <button
                onClick={() => setSelectedJugadorChip('TODOS')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '5px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                👥 Ver todos los jugadores
              </button>
            </div>
          </div>
        );
      })()}

      {/* PANEL ÚLTIMO DÍA DE GIMNASIO */}
      {showUltimoGymPanel && (
        <section className="no-print" style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '10px 20px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 900, color: '#92400e', marginBottom: '6px' }}>
            ⚡ ÚLTIMO DÍA QUE HIZO GIMNASIO CADA JUGADOR (Referencia: 08/10/2026)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '6px' }}>
            {jugadores.map(jug => {
              const ult = ultimoDiaGymPorJugador[jug.id];
              return (
                <div key={jug.id} style={{ background: '#ffffff', borderRadius: '4px', border: '1px solid #fde68a', padding: '4px 8px', fontSize: '10.5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                    <span>{jug.apodo || jug.nombre}</span>
                    {ult ? (
                      <span style={{ color: ult.diasTranscurridos <= 2 ? '#16a34a' : ult.diasTranscurridos <= 4 ? '#d97706' : '#dc2626' }}>
                        {ult.diasTranscurridos === 0 ? 'Hoy' : 'Hace ' + ult.diasTranscurridos + 'd'}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>Sin registro</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TABLA MATRIZ: COLUMNA DE JUGADORES INMOVILIZADA (SIN POSICIÓN, MUCHO MÁS ESTRECHA) */}
      <main className="no-print" style={{ padding: '10px 20px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{
          overflowX: 'auto',
          overflowY: 'visible',
          width: '100%',
          position: 'relative',
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <table style={{
            borderCollapse: 'separate',
            borderSpacing: 0,
            width: 'max-content',
            minWidth: '100%',
            fontSize: '11px',
          }}>
            <thead>
              {/* CABECERA 1: SEMANAS */}
              <tr style={{ height: '24px', background: '#0f172a', color: '#ffffff' }}>
                <th style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 50,
                  background: '#0f172a',
                  width: '135px',
                  minWidth: '135px',
                  maxWidth: '135px',
                  padding: '3px 8px',
                  textAlign: 'left',
                  fontSize: '10px',
                  fontWeight: 900,
                  borderRight: '2px solid #cbd5e1',
                }}>
                  JUGADORES
                </th>
                {semanasAgrupadas.map((semGroup, idx) => (
                  <th
                    key={idx}
                    colSpan={semGroup.count}
                    style={{
                      textAlign: 'center',
                      padding: '2px 4px',
                      fontSize: '10px',
                      fontWeight: 900,
                      borderRight: '2px solid #334155',
                      borderLeft: idx > 0 ? '1px solid #1e293b' : 'none',
                    }}
                  >
                    SEM {semGroup.semana}
                  </th>
                ))}
              </tr>

              {/* CABECERA 2: DÍA Y FECHA */}
              <tr style={{ height: '24px', background: '#f8fafc' }}>
                <th style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 50,
                  background: '#f8fafc',
                  width: '135px',
                  minWidth: '135px',
                  maxWidth: '135px',
                  padding: '2px 8px',
                  textAlign: 'left',
                  fontSize: '10px',
                  fontWeight: 800,
                  color: '#475569',
                  borderRight: '2px solid #cbd5e1',
                  borderBottom: '1px solid #e2e8f0',
                }}>
                  Fecha
                </th>
                {diasFiltrados.map(day => {
                  const { diaSem, diaMes } = formatFechaCol(day.fecha);
                  const isSun = new Date(day.fecha + 'T12:00:00').getDay() === 0;
                  const isToday = day.fecha === todayStr;

                  return (
                    <th
                      key={day.id}
                      style={{
                        width: '135px',
                        minWidth: '135px',
                        padding: '3px 4px',
                        textAlign: 'center',
                        fontSize: '10.5px',
                        fontWeight: isToday ? 900 : 800,
                        color: isToday ? '#ffffff' : isSun ? '#b91c1c' : '#1e293b',
                        background: isToday
                          ? 'linear-gradient(180deg, #1e3a8a 0%, #1e40af 100%)'
                          : isSun
                          ? '#fef2f2'
                          : '#f8fafc',
                        borderRight: isToday ? '2px solid #1e3a8a' : '1px solid #e2e8f0',
                        borderLeft: isToday ? '2px solid #1e3a8a' : undefined,
                        borderBottom: isToday ? '2px solid #1e3a8a' : '1px solid #e2e8f0',
                        borderTop: isToday ? '2px solid #3b82f6' : undefined,
                        position: 'relative',
                        boxShadow: isToday ? 'inset 0 0 0 1px #60a5fa, 0 1px 3px rgba(30, 58, 138, 0.3)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ letterSpacing: isToday ? '0.3px' : 'normal' }}>{diaSem} {diaMes}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>

              {/* CABECERA 3: CONTEXTO MD */}
              <tr style={{ height: '24px', background: '#ffffff' }}>
                <th style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 50,
                  background: '#ffffff',
                  width: '135px',
                  minWidth: '135px',
                  maxWidth: '135px',
                  padding: '2px 8px',
                  textAlign: 'left',
                  fontSize: '10px',
                  fontWeight: 800,
                  color: '#475569',
                  borderRight: '2px solid #cbd5e1',
                  borderBottom: '1px solid #e2e8f0',
                }}>
                  Contexto MD
                </th>
                {diasFiltrados.map(day => {
                  const effectiveMd = resolvePlanificacionMD(day.fecha, allDays) || day.md || '—';
                  const badge = getMdBadgeStyle(effectiveMd);
                  return (
                    <th
                      key={day.id}
                      style={{
                        width: '135px',
                        minWidth: '135px',
                        padding: '2px 4px',
                        textAlign: 'center',
                        borderRight: '1px solid #e2e8f0',
                        borderBottom: '1px solid #e2e8f0',
                      }}
                    >
                      <span
                        suppressHydrationWarning
                        style={{
                          fontSize: '9.5px',
                          fontWeight: 900,
                          padding: '1px 5px',
                          borderRadius: '10px',
                          background: badge.bg,
                          color: badge.text,
                          border: '1px solid ' + badge.border,
                        }}
                      >
                        {effectiveMd || '—'}
                      </span>
                    </th>
                  );
                })}
              </tr>

              {/* CABECERA 4: SESIÓN PLANIFICACIÓN (FILA COMPACTA CON HORA Y COLOR PREDETERMINADO) */}
              <tr style={{ minHeight: '26px', height: 'auto', background: '#f8fafc' }}>
                <th
                  title="Sesión Planificada: Op (Optimizador), Co (Coadyuvante), Pa (Partido)"
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 50,
                    background: '#f8fafc',
                    width: '135px',
                    minWidth: '135px',
                    maxWidth: '135px',
                    padding: '2px 8px',
                    textAlign: 'left',
                    fontSize: '10px',
                    fontWeight: 800,
                    color: '#475569',
                    borderRight: '2px solid #cbd5e1',
                    borderBottom: '2px solid #cbd5e1',
                  }}
                >
                  Sesión Plan.
                </th>
                {diasFiltrados.map(day => {
                  const evList = getEventosEspecificosCompact(day);
                  return (
                    <th
                      key={day.id}
                      style={{
                        width: '135px',
                        minWidth: '135px',
                        padding: '2px 3px',
                        textAlign: 'center',
                        borderRight: '1px solid #e2e8f0',
                        borderBottom: '2px solid #cbd5e1',
                        verticalAlign: 'middle',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', flexWrap: 'wrap', minHeight: '18px', padding: '2px 0' }}>
                        {evList.length === 0 ? (
                          <span style={{ fontSize: '10px', color: '#cbd5e1', fontWeight: 600 }}>—</span>
                        ) : (
                          evList.map((ev, i) => (
                            <span
                              key={i}
                              style={{
                                fontSize: '9px',
                                fontWeight: 800,
                                background: ev.bg,
                                color: ev.color,
                                border: '1px solid ' + ev.border,
                                padding: '1px 4px',
                                borderRadius: '3px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '125px',
                              }}
                              title={ev.hora ? ev.hora + ' • ' + ev.tipo : ev.tipo}
                            >
                              {ev.hora && <span style={{ opacity: 0.75, marginRight: '2px' }}>{ev.hora}</span>}
                              {ev.tipo}
                            </span>
                          ))
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {/* FILA EQUIPO GENERAL */}
              {(() => {
                const isTeamExpanded = Boolean(globalExpandEjercicios || expandedJugadoresMap['TEAM']);
                return (
                  <tr style={{ height: isTeamExpanded ? 'auto' : '32px', background: '#f8fafc' }}>
                    <td style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 25,
                      background: '#f1f5f9',
                      width: '135px',
                      minWidth: '135px',
                      maxWidth: '135px',
                      padding: '2px 6px',
                      fontWeight: 900,
                      color: '#1e3a8a',
                      borderRight: '2px solid #cbd5e1',
                      borderBottom: '2px solid #94a3b8',
                      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.12)',
                      verticalAlign: 'top',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', paddingTop: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '12px' }}>👥</span>
                          <span style={{ fontSize: '10px' }}>EQUIPO</span>
                        </div>
                        <button
                          onClick={() => toggleExpandJugador('TEAM')}
                          title={isTeamExpanded ? "Plegar ejercicios de equipo" : "Ampliar y ver ejercicios de equipo en todos los días"}
                          style={{
                            background: isTeamExpanded ? '#eff6ff' : 'transparent',
                            border: isTeamExpanded ? '1px solid #bfdbfe' : '1px solid #cbd5e1',
                            borderRadius: '3px',
                            padding: '1px 3px',
                            fontSize: '8.5px',
                            fontWeight: 900,
                            color: isTeamExpanded ? '#1d4ed8' : '#64748b',
                            cursor: 'pointer',
                          }}
                        >
                          {isTeamExpanded ? '▲' : '⊞'}
                        </button>
                      </div>
                    </td>

                {diasFiltrados.map(day => {
                  const cellKey = getCellKey('TEAM', day.fecha);
                  const teamSesiones = getSesionesList(cellKey);
                  return (
                    <td
                      key={day.id}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => handleDropOnCell('TEAM', day.fecha, e)}
                      style={{ padding: '2px', verticalAlign: 'middle', borderRight: '1px solid #e2e8f0', borderBottom: '2px solid #94a3b8', background: '#f8fafc' }}
                    >
                      {teamSesiones.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
                          {teamSesiones.map((ses, sIdx) => (
                            <MatrixCellSesionItem
                              key={ses.id || sIdx}
                              sesion={ses}
                              sesionNumber={teamSesiones.length > 1 ? sIdx + 1 : undefined}
                              totalSesiones={teamSesiones.length}
                              isExpanded={Boolean(isTeamExpanded || expandedSesionIds[ses.id])}
                              hasClipboard={Boolean(clipboardSesion)}
                              onEdit={() => handleEditSesion(ses, 'Equipo Completo')}
                              onDelete={() => handleDeleteSesion('TEAM', day.fecha, ses.id)}
                              onCopy={e => handleCopiarSesion(ses, e)}
                              onPaste={e => handlePromptPegarSesion('TEAM', day.fecha, 'Equipo Completo', e)}
                              onAddAnother={() => handleOpenNuevaSesion('TEAM', day.fecha, 'Equipo Completo')}
                              onToggleExpand={() => toggleExpandSesion(ses.id)}
                              onDragStart={e => handleDragStartSesion(ses, cellKey, e)}
                            />
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '2px' }}>
                          <button
                            onClick={() => handleOpenNuevaSesion('TEAM', day.fecha, 'Equipo Completo')}
                            style={{ flex: 1, height: '24px', border: '1px dashed #cbd5e1', borderRadius: '4px', background: 'transparent', color: '#94a3b8', fontSize: '11px', cursor: 'pointer' }}
                          >
                            +
                          </button>
                          {clipboardSesion && (
                            <button
                              onClick={e => handlePromptPegarSesion('TEAM', day.fecha, 'Equipo Completo', e)}
                              title="Pegar sesión"
                              style={{ height: '24px', padding: '0 4px', border: '1px solid #bfdbfe', borderRadius: '4px', background: '#eff6ff', color: '#1e3a8a', fontSize: '9px', fontWeight: 800, cursor: 'pointer' }}
                            >
                              📥
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })()}

              {/* FILAS DE JUGADORES (CON FOTO, SIN POSICIÓN, COLUMNA ESTRECHA 135px) */}
              {jugadoresFiltrados.map((jug, idx) => {
                const isEven = idx % 2 === 0;
                const isJugExpanded = Boolean(
                  globalExpandEjercicios ||
                  expandedJugadoresMap[jug.id] ||
                  selectedJugadorChip === jug.id ||
                  (searchJugadorText.trim().length > 0 && jugadoresFiltrados.length === 1)
                );
                const rowBg = isJugExpanded ? '#f0f7ff' : isEven ? '#ffffff' : '#fafafa';

                return (
                  <tr key={jug.id} style={{ height: isJugExpanded ? 'auto' : '32px', background: rowBg }}>
                    {/* COLUMNA STICKY DE JUGADOR */}
                    <td style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 25,
                      background: rowBg,
                      width: '135px',
                      minWidth: '135px',
                      maxWidth: '135px',
                      padding: '2px 6px',
                      borderRight: '2px solid #cbd5e1',
                      borderBottom: '1px solid #e2e8f0',
                      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.12)',
                      verticalAlign: 'top',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3px', paddingTop: '2px' }}>
                        <div
                          onClick={() => toggleExpandJugador(jug.id)}
                          title="Clic para ampliar o plegar ejercicios de este jugador"
                          style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden', flex: 1, cursor: 'pointer' }}
                        >
                          {/* FOTO DEL JUGADOR */}
                          {jug.foto_url ? (
                            <img
                              src={jug.foto_url}
                              alt={jug.nombre}
                              style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #cbd5e1' }}
                              onError={e => {
                                (e.currentTarget as any).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              background: '#1e3a8a',
                              color: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '9px',
                              fontWeight: 900,
                              flexShrink: 0,
                            }}>
                              {jug.dorsal || getInitials(jug.nombre)}
                            </div>
                          )}

                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '10.5px', fontWeight: 800, color: isJugExpanded ? '#1d4ed8' : '#0f172a' }}>
                              {jug.apodo || jug.nombre}
                            </span>
                          </div>
                        </div>

                        {/* BOTÓN FOCUS UN SOLO JUGADOR */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (selectedJugadorChip === jug.id) {
                              setSelectedJugadorChip('TODOS');
                            } else {
                              setSelectedJugadorChip(jug.id);
                              setExpandedJugadoresMap(prev => ({ ...prev, [jug.id]: true }));
                            }
                          }}
                          title={selectedJugadorChip === jug.id ? "Volver a ver todos los jugadores" : "Ver solo este jugador en todos los días"}
                          style={{
                            background: selectedJugadorChip === jug.id ? '#1d4ed8' : 'transparent',
                            border: selectedJugadorChip === jug.id ? '1px solid #1e40af' : '1px solid #cbd5e1',
                            borderRadius: '3px',
                            padding: '1px 3px',
                            fontSize: '9px',
                            color: selectedJugadorChip === jug.id ? '#ffffff' : '#64748b',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          👁️
                        </button>

                        {/* BOTÓN TOGGLE AMPLIAR EJERCICIOS DEL JUGADOR */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpandJugador(jug.id);
                          }}
                          title={isJugExpanded ? "Plegar vista de ejercicios" : "Ampliar ejercicios de este jugador a lo largo de los días"}
                          style={{
                            background: isJugExpanded ? '#dbeafe' : 'transparent',
                            border: isJugExpanded ? '1px solid #93c5fd' : '1px solid #cbd5e1',
                            borderRadius: '3px',
                            padding: '1px 3px',
                            fontSize: '8.5px',
                            fontWeight: 900,
                            color: isJugExpanded ? '#1d4ed8' : '#64748b',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          {isJugExpanded ? '▲' : '⊞'}
                        </button>
                      </div>
                    </td>

                    {/* CELDAS CRUCE DÍAS */}
                    {diasFiltrados.map(day => {
                      const cellKey = getCellKey(jug.id, day.fecha);
                      const jugSesiones = getSesionesList(cellKey);

                      return (
                        <td
                          key={day.id}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => handleDropOnCell(jug.id, day.fecha, e)}
                          style={{ padding: '2px', verticalAlign: 'middle', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}
                        >
                          {jugSesiones.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
                              {jugSesiones.map((ses, sIdx) => (
                                <MatrixCellSesionItem
                                  key={ses.id || sIdx}
                                  sesion={ses}
                                  sesionNumber={jugSesiones.length > 1 ? sIdx + 1 : undefined}
                                  totalSesiones={jugSesiones.length}
                                  isExpanded={Boolean(isJugExpanded || expandedSesionIds[ses.id])}
                                  hasClipboard={Boolean(clipboardSesion)}
                                  onEdit={() => handleEditSesion(ses, jug.apodo || jug.nombre)}
                                  onDelete={() => handleDeleteSesion(jug.id, day.fecha, ses.id)}
                                  onCopy={e => handleCopiarSesion(ses, e)}
                                  onPaste={e => handlePromptPegarSesion(jug.id, day.fecha, jug.apodo || jug.nombre, e)}
                                  onAddAnother={() => handleOpenNuevaSesion(jug.id, day.fecha, jug.apodo || jug.nombre)}
                                  onToggleExpand={() => toggleExpandSesion(ses.id)}
                                  onDragStart={e => handleDragStartSesion(ses, cellKey, e)}
                                />
                              ))}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '2px', width: '100%', height: '100%' }}>
                              <button
                                onClick={() => handleOpenNuevaSesion(jug.id, day.fecha, jug.apodo || jug.nombre)}
                                style={{ flex: 1, height: '24px', border: '1px dashed transparent', borderRadius: '4px', background: 'transparent', color: '#cbd5e1', fontSize: '11px', cursor: 'pointer' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#1e3a8a'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = '#cbd5e1'; }}
                              >
                                +
                              </button>
                              {clipboardSesion && (
                                <button
                                  onClick={e => handlePromptPegarSesion(jug.id, day.fecha, jug.apodo || jug.nombre, e)}
                                  title="Pegar sesión"
                                  style={{ height: '24px', padding: '0 4px', border: '1px solid #bfdbfe', borderRadius: '4px', background: '#eff6ff', color: '#1e3a8a', fontSize: '9px', fontWeight: 800, cursor: 'pointer' }}
                                >
                                  📥
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      {/* MODAL DE ELECCIÓN AL PEGAR SESIÓN EN CELDA CON SESIÓN EXISTENTE */}
      {pasteDialog && clipboardSesion && (
        <div className="no-print" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          padding: '16px',
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '440px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
          }}>
            <div style={{ background: '#0f172a', color: '#ffffff', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📋</span>
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 900 }}>Pegar Sesión de Gimnasio</h4>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>{pasteDialog.jugadorNombre} • {pasteDialog.fecha}</div>
                </div>
              </div>
              <button onClick={() => setPasteDialog(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#334155' }}>
                Este jugador ya tiene <strong>{pasteDialog.existingCount} {pasteDialog.existingCount === 1 ? 'sesión asignada' : 'sesiones asignadas'}</strong> en este día.<br/>
                Sesión a pegar: <strong style={{ color: '#1e3a8a' }}>{clipboardSesion.nombreSesion}</strong> ({clipboardSesion.ejercicios.length} ejercicios)
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  onClick={() => {
                    handleEjecutarPegar(pasteDialog.jugadorId, pasteDialog.fecha, 'add');
                    setPasteDialog(null);
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid #3b82f6',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    fontWeight: 800,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900 }}>➕ Añadir como {pasteDialog.existingCount + 1}ª sesión</div>
                    <div style={{ fontSize: '10.5px', color: '#60a5fa', fontWeight: 500 }}>Conserva la sesión actual y agrega esta como segunda sesión</div>
                  </div>
                  <span style={{ fontSize: '10px', background: '#3b82f6', color: '#fff', padding: '2px 7px', borderRadius: '4px', fontWeight: 800 }}>MÚLTIPLE</span>
                </button>

                <button
                  onClick={() => {
                    handleEjecutarPegar(pasteDialog.jugadorId, pasteDialog.fecha, 'replace');
                    setPasteDialog(null);
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    color: '#475569',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, color: '#334155' }}>🔄 Reemplazar sesión existente</div>
                    <div style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 500 }}>Sobrescribe la sesión actual con la del portapapeles</div>
                  </div>
                  <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#64748b', padding: '2px 7px', borderRadius: '4px' }}>REEMPLAZAR</span>
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                <button
                  onClick={() => setPasteDialog(null)}
                  style={{
                    padding: '6px 14px',
                    border: 'none',
                    background: 'transparent',
                    color: '#64748b',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLADO DE DISEÑAR LA SESIÓN */}
      {modalSesion && (
        <div className="no-print" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '16px',
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '10px',
            width: '96%',
            maxWidth: '1080px',
            maxHeight: '92vh',
            height: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            overflow: 'hidden',
          }}>
            <div style={{ background: '#0f172a', color: '#ffffff', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>🏋️</span>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 900, margin: 0 }}>Diseñar Sesión de Gimnasio</h3>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>{modalTargetNombre} • {modalSesion.fecha} ({modalSesion.md || '—'})</div>
                </div>
              </div>
              <button onClick={() => setModalSesion(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>

            <div
              ref={modalBodyRef}
              style={{
                padding: '16px 20px',
                overflowY: 'auto',
                overflowX: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                flex: '1 1 auto',
                minHeight: 0,
                scrollbarWidth: 'thin',
                scrollbarColor: '#cbd5e1 transparent',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.3fr 0.8fr 0.9fr 1.1fr auto', gap: '8px', alignItems: 'flex-end', flexShrink: 0 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#475569', marginBottom: '2px' }}>Título de la Sesión</label>
                  <input
                    type="text"
                    value={modalSesion.nombreSesion}
                    onChange={e => setModalSesion({ ...modalSesion, nombreSesion: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#475569', marginBottom: '2px' }}>Categoría (Abierta)</label>
                  <input
                    type="text"
                    list="categorias_datalist"
                    value={modalSesion.categoria}
                    onChange={e => setModalSesion({ ...modalSesion, categoria: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 700 }}
                  />
                  <datalist id="categorias_datalist">
                    {CATEGORIAS_SUGERIDAS.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#475569', marginBottom: '2px' }}>Duración (min)</label>
                  <input
                    type="number"
                    value={modalSesion.duracionMin || 45}
                    onChange={e => setModalSesion({ ...modalSesion, duracionMin: parseInt(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#1e3a8a', marginBottom: '2px' }}>🕒 Hora Reporte</label>
                  <input
                    type="text"
                    placeholder="8:00"
                    value={modalSesion.hora || ''}
                    onChange={e => setModalSesion({ ...modalSesion, hora: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#1e3a8a', marginBottom: '2px' }}>📍 Lugar Reporte</label>
                  <input
                    type="text"
                    placeholder="GYM"
                    value={modalSesion.lugar || ''}
                    onChange={e => setModalSesion({ ...modalSesion, lugar: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 700 }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', height: '32px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 800, color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(modalSesion.incluirRpe)}
                      onChange={e => setModalSesion({ ...modalSesion, incluirRpe: e.target.checked })}
                    />
                    <span>RPE</span>
                  </label>
                </div>
              </div>

              {/* BARRA DE HERRAMIENTAS DE EJERCICIOS */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', flexWrap: 'wrap', gap: '8px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 900, color: '#0f172a' }}>
                    EJERCICIOS ({modalSesion.ejercicios.length})
                  </span>
                  <button
                    onClick={handleAddEjercicio}
                    style={{ padding: '5px 12px', borderRadius: '5px', background: '#1e3a8a', color: '#ffffff', fontSize: '11.5px', fontWeight: 800, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span>➕</span> Añadir Ejercicio
                  </button>
                  {clipboardEjercicio && (
                    <button
                      onClick={handlePegarFilaEjercicio}
                      style={{ padding: '4px 10px', borderRadius: '5px', background: '#eff6ff', color: '#1e3a8a', border: '1px solid #bfdbfe', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
                    >
                      📥 Pegar Fila ({clipboardEjercicio.nombre || 'ejercicio'})
                    </button>
                  )}
                </div>

                {/* + VARIABLE CON MATERIAL PROMINENTE */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                  <button
                    onClick={() => setShowAddVariableDropdown(!showAddVariableDropdown)}
                    style={{ padding: '4px 10px', borderRadius: '5px', background: '#ffffff', color: '#0369a1', border: '1px solid #7dd3fc', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    + Variable (Material, Tiempo...) ▼
                  </button>

                  {showAddVariableDropdown && (
                    <div style={{
                      position: 'absolute',
                      right: 0,
                      top: '100%',
                      marginTop: '4px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
                      padding: '8px',
                      zIndex: 100,
                      minWidth: '220px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}>
                      <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                        Variables Disponibles
                      </div>
                      {!mostrarGrupoMuscular && (
                        <button
                          onClick={() => {
                            setMostrarGrupoMuscular(true);
                            try { localStorage.setItem('gimnasio_mostrar_grupo_muscular', 'true'); } catch {}
                            setShowAddVariableDropdown(false);
                          }}
                          style={{ textAlign: 'left', padding: '4px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', color: '#166534' }}
                        >
                          + Grupo Muscular
                        </button>
                      )}
                      {['Material', 'Velocidad', 'Bloque', 'Tiempo', 'Descanso', 'Potencia', 'Distancia'].map(v => (
                        <button
                          key={v}
                          onClick={() => handleAddVariable(v)}
                          style={{ textAlign: 'left', padding: '4px 8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          + {v}
                        </button>
                      ))}
                      <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                        <input
                          type="text"
                          placeholder="Otra variable..."
                          value={nuevaVariableInput}
                          onChange={e => setNuevaVariableInput(e.target.value)}
                          style={{ flex: 1, padding: '3px 6px', fontSize: '11px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                        />
                        <button onClick={() => handleAddVariable(nuevaVariableInput)} style={{ background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', padding: '0 6px', cursor: 'pointer' }}>OK</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* TABLA DE EJERCICIOS (SCROLLABLE, CON CABECERA STICKY Y SERIES, REPS Y RPE EN BLANCO) */}
              <div
                ref={tableScrollRef}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  overflowX: 'auto',
                  overflowY: 'auto',
                  maxHeight: '440px',
                  minHeight: '160px',
                  background: '#ffffff',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
                  position: 'relative',
                  scrollbarWidth: 'thin',
                  scrollbarColor: '#94a3b8 #f1f5f9',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 15, background: '#f8fafc', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' }}>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', color: '#475569' }}>
                      <th style={{ padding: '7px 8px', width: '32px', textAlign: 'center', background: '#f8fafc' }}>⠿</th>
                      <th style={{ padding: '7px 6px', textAlign: 'center', width: '55px', fontWeight: 800, background: '#f8fafc' }}>Bloq</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 800, background: '#f8fafc', minWidth: '220px' }}>Ejercicio</th>
                      {mostrarGrupoMuscular && (
                        <th style={{ padding: '7px 6px', textAlign: 'left', fontWeight: 800, width: '100px', background: '#f8fafc' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2px' }}>
                            <span>G. Muscular</span>
                            <button
                              type="button"
                              onClick={() => {
                                setMostrarGrupoMuscular(false);
                                try { localStorage.setItem('gimnasio_mostrar_grupo_muscular', 'false'); } catch {}
                              }}
                              style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '10px', cursor: 'pointer', padding: '0 2px' }}
                              title="Ocultar columna Grupo Muscular"
                            >
                              ✕
                            </button>
                          </div>
                        </th>
                      )}
                      <th style={{ padding: '7px 6px', textAlign: 'center', fontWeight: 800, width: '60px', background: '#f8fafc' }}>Series</th>
                      <th style={{ padding: '7px 6px', textAlign: 'center', fontWeight: 800, width: '65px', background: '#f8fafc' }}>Reps</th>
                      <th style={{ padding: '7px 6px', textAlign: 'center', fontWeight: 800, width: '75px', background: '#f8fafc' }}>Carga (kg)</th>

                      {modalSesion.incluirRpe && (
                        <th style={{ padding: '7px 6px', textAlign: 'center', fontWeight: 800, width: '55px', background: '#f8fafc' }}>RPE</th>
                      )}

                      {(modalSesion.variablesColumnas || []).map(colName => (
                        <th key={colName} style={{ padding: '7px 6px', textAlign: 'center', fontWeight: 800, width: '85px', background: '#eff6ff', color: '#1e3a8a' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                            <span>{colName}</span>
                            <button onClick={() => handleRemoveVariable(colName)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '10px', cursor: 'pointer' }}>✕</button>
                          </div>
                        </th>
                      ))}

                      <th style={{ padding: '7px 4px', textAlign: 'center', fontWeight: 800, width: '60px', background: '#f0f9ff', color: '#0369a1' }} title="Sensor / Kiosco (Encoder o Dinamómetro)">
                        ⚡ Sensor
                      </th>
                      <th style={{ padding: '7px 8px', textAlign: 'center', width: '90px', background: '#f8fafc' }}>Acciones</th>
                    </tr>
                  </thead>

                  <tbody>
                    {modalSesion.ejercicios.map((ej, index) => (
                      <React.Fragment key={ej.id}>
                        <tr
                          draggable
                          onDragStart={() => handleDragStartModal(index)}
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => handleDropModal(index)}
                          style={{
                            borderBottom: ej.showNotas ? 'none' : '1px solid #f1f5f9',
                            background: draggedEjercicioIndex === index ? '#f1f5f9' : '#ffffff',
                          }}
                        >
                          <td style={{ padding: '4px', textAlign: 'center', cursor: 'grab', color: '#94a3b8' }}>⠿</td>

                          {/* Bloque (ACT, PP...) */}
                          <td style={{ padding: '4px 4px' }}>
                            <input
                              type="text"
                              value={ej.bloque || ''}
                              onChange={e => {
                                const copy = [...modalSesion.ejercicios];
                                copy[index].bloque = e.target.value;
                                setModalSesion({ ...modalSesion, ejercicios: copy });
                              }}
                              placeholder="PP"
                              style={{ width: '100%', padding: '4px 2px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '11px', fontWeight: 800 }}
                            />
                          </td>

                          {/* Ejercicio */}
                          <td style={{ padding: '4px 6px', minWidth: '220px' }}>
                            <input
                              id={`ej_input_nombre_${ej.id}`}
                              type="text"
                              list="ejercicios_datalist"
                              value={ej.nombre}
                              onChange={e => {
                                const val = e.target.value;
                                const copy = [...modalSesion.ejercicios];
                                copy[index].nombre = val;
                                if (!copy[index].videoUrl?.trim()) {
                                  const cat = getEjerciciosVideoCatalog();
                                  const savedVid = cat[val.toLowerCase().trim()];
                                  if (savedVid) {
                                    copy[index].videoUrl = savedVid;
                                  }
                                }
                                setModalSesion({ ...modalSesion, ejercicios: copy });
                              }}
                              placeholder="Nombre del ejercicio..."
                              style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11.5px', fontWeight: 700 }}
                            />
                          </td>

                          {/* Grupo Muscular (INICIA EN BLANCO, CONDICIONAL) */}
                          {mostrarGrupoMuscular && (
                            <td style={{ padding: '4px 4px' }}>
                              <input
                                type="text"
                                value={ej.grupoMuscular || ''}
                                onChange={e => {
                                  const copy = [...modalSesion.ejercicios];
                                  copy[index].grupoMuscular = e.target.value;
                                  setModalSesion({ ...modalSesion, ejercicios: copy });
                                }}
                                placeholder=""
                                style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11px' }}
                              />
                            </td>
                          )}

                          {/* Series (INICIA EN BLANCO) */}
                          <td style={{ padding: '4px 4px' }}>
                            <input
                              type="text"
                              value={ej.series}
                              onChange={e => {
                                const copy = [...modalSesion.ejercicios];
                                copy[index].series = e.target.value;
                                setModalSesion({ ...modalSesion, ejercicios: copy });
                              }}
                              placeholder=""
                              style={{ width: '100%', padding: '4px 2px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '11.5px', fontWeight: 700 }}
                            />
                          </td>

                          {/* Reps (INICIA EN BLANCO) */}
                          <td style={{ padding: '4px 4px' }}>
                            <input
                              type="text"
                              value={ej.reps}
                              onChange={e => {
                                const copy = [...modalSesion.ejercicios];
                                copy[index].reps = e.target.value;
                                setModalSesion({ ...modalSesion, ejercicios: copy });
                              }}
                              placeholder=""
                              style={{ width: '100%', padding: '4px 2px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '11.5px', fontWeight: 700 }}
                            />
                          </td>

                          {/* PesoKg (INICIA EN BLANCO) */}
                          <td style={{ padding: '4px 4px' }}>
                            <input
                              type="text"
                              value={ej.pesoKg}
                              onChange={e => {
                                const copy = [...modalSesion.ejercicios];
                                copy[index].pesoKg = e.target.value;
                                setModalSesion({ ...modalSesion, ejercicios: copy });
                              }}
                              placeholder=""
                              style={{ width: '100%', padding: '4px 2px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '11.5px', fontWeight: 700 }}
                            />
                          </td>

                          {/* RPE (INICIA EN BLANCO) */}
                          {modalSesion.incluirRpe && (
                            <td style={{ padding: '4px 4px' }}>
                              <input
                                type="number"
                                value={ej.rpe ?? ''}
                                onChange={e => {
                                  const copy = [...modalSesion.ejercicios];
                                  copy[index].rpe = e.target.value ? parseInt(e.target.value) : null;
                                  setModalSesion({ ...modalSesion, ejercicios: copy });
                                }}
                                placeholder=""
                                min="1"
                                max="10"
                                style={{ width: '100%', padding: '4px 2px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '11.5px' }}
                              />
                            </td>
                          )}

                          {/* Columnas dinámicas (Material, Velocidad...) */}
                          {(modalSesion.variablesColumnas || []).map(colName => {
                            const val = colName === 'Material' ? (ej.material || '') : colName === 'Velocidad' ? (ej.velocidad || '') : (ej.variablesPersonalizadas?.[colName] || '');
                            return (
                              <td key={colName} style={{ padding: '4px 4px' }}>
                                <input
                                  type="text"
                                  value={val}
                                  onChange={e => {
                                    const copy = [...modalSesion.ejercicios];
                                    if (colName === 'Material') copy[index].material = e.target.value;
                                    else if (colName === 'Velocidad') copy[index].velocidad = e.target.value;
                                    else {
                                      const vars = { ...(copy[index].variablesPersonalizadas || {}) };
                                      vars[colName] = e.target.value;
                                      copy[index].variablesPersonalizadas = vars;
                                    }
                                    setModalSesion({ ...modalSesion, ejercicios: copy });
                                  }}
                                  placeholder={colName}
                                  style={{ width: '100%', padding: '4px 2px', borderRadius: '4px', border: '1px solid #bfdbfe', background: '#f8fafc', textAlign: 'center', fontSize: '11px' }}
                                />
                              </td>
                            );
                          })}

                          {/* Sensor Kiosco (Compacto, sin ocupar espacio excesivo) */}
                          <td style={{ padding: '4px 2px', textAlign: 'center', width: '60px', background: ej.monitorizado ? '#f0fdf4' : 'transparent' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                              <input
                                type="checkbox"
                                checked={!!ej.monitorizado}
                                onChange={e => {
                                  const copy = [...modalSesion.ejercicios];
                                  copy[index].monitorizado = e.target.checked;
                                  if (e.target.checked && !copy[index].tipoSensor) {
                                    copy[index].tipoSensor = 'ENCODER';
                                  }
                                  setModalSesion({ ...modalSesion, ejercicios: copy });
                                }}
                                title={ej.monitorizado ? "Sensor activo en Kiosco" : "Activar sensor Kiosco para este ejercicio"}
                                style={{ cursor: 'pointer', accentColor: '#16a34a', width: '15px', height: '15px' }}
                              />
                              {ej.monitorizado && (
                                <select
                                  value={ej.tipoSensor || 'ENCODER'}
                                  onChange={e => {
                                    const copy = [...modalSesion.ejercicios];
                                    copy[index].tipoSensor = e.target.value as 'ENCODER' | 'DINAMOMETRO';
                                    setModalSesion({ ...modalSesion, ejercicios: copy });
                                  }}
                                  style={{
                                    fontSize: '8.5px',
                                    padding: '1px 2px',
                                    borderRadius: '3px',
                                    border: '1px solid #86efac',
                                    background: '#dcfce7',
                                    color: '#166534',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    maxWidth: '54px',
                                  }}
                                >
                                  <option value="ENCODER">Enc.</option>
                                  <option value="DINAMOMETRO">Din.</option>
                                </select>
                              )}
                            </div>
                          </td>

                          {/* Acciones */}
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                              <button
                                onClick={() => {
                                  const copy = [...modalSesion.ejercicios];
                                  copy[index].showVideo = !copy[index].showVideo;
                                  setModalSesion({ ...modalSesion, ejercicios: copy });
                                }}
                                title={ej.videoUrl?.trim() ? `Video guardado: ${ej.videoUrl}` : "Añadir enlace de video a este ejercicio"}
                                style={{
                                  background: ej.videoUrl?.trim() ? '#fee2e2' : '#f1f5f9',
                                  color: ej.videoUrl?.trim() ? '#b91c1c' : '#64748b',
                                  border: '1px solid ' + (ej.videoUrl?.trim() ? '#f87171' : '#cbd5e1'),
                                  borderRadius: '3px',
                                  padding: '2px 4px',
                                  fontSize: '10px',
                                  fontWeight: ej.videoUrl?.trim() ? 800 : 400,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                }}
                              >
                                <span>🎥</span>
                                {ej.videoUrl?.trim() && <span style={{ fontSize: '8px' }}>▶</span>}
                              </button>
                              <button
                                onClick={() => {
                                  const copy = [...modalSesion.ejercicios];
                                  copy[index].showNotas = !copy[index].showNotas;
                                  setModalSesion({ ...modalSesion, ejercicios: copy });
                                }}
                                title="Observación o comentario"
                                style={{
                                  background: ej.notas?.trim() ? '#e0f2fe' : '#f1f5f9',
                                  color: ej.notas?.trim() ? '#0369a1' : '#64748b',
                                  border: '1px solid ' + (ej.notas?.trim() ? '#7dd3fc' : '#cbd5e1'),
                                  borderRadius: '3px',
                                  padding: '2px 4px',
                                  fontSize: '10px',
                                  cursor: 'pointer',
                                }}
                              >
                                💬
                              </button>
                              <button onClick={() => handleCopiarFilaEjercicio(ej)} title="Copiar ejercicio" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '3px', padding: '2px 4px', fontSize: '10px', cursor: 'pointer' }}>📋</button>
                              <button onClick={() => handleMoveEjercicio(index, 'up')} disabled={index === 0} style={{ background: 'none', border: 'none', fontSize: '9px', cursor: index === 0 ? 'default' : 'pointer', opacity: index === 0 ? 0.3 : 1 }}>▲</button>
                              <button onClick={() => handleMoveEjercicio(index, 'down')} disabled={index === modalSesion.ejercicios.length - 1} style={{ background: 'none', border: 'none', fontSize: '9px', cursor: index === modalSesion.ejercicios.length - 1 ? 'default' : 'pointer', opacity: index === modalSesion.ejercicios.length - 1 ? 0.3 : 1 }}>▼</button>
                              <button onClick={() => { const copy = modalSesion.ejercicios.filter((_, i) => i !== index); setModalSesion({ ...modalSesion, ejercicios: copy }); }} title="Eliminar fila" style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer' }}>✕</button>
                            </div>
                          </td>
                        </tr>

                        {/* ENLACE DE VIDEO PLEGADO */}
                        {ej.showVideo && (
                          <tr style={{ background: '#fef2f2', borderBottom: '1px solid #fee2e2' }}>
                            <td colSpan={7 + (mostrarGrupoMuscular ? 1 : 0) + (modalSesion.incluirRpe ? 1 : 0) + (modalSesion.variablesColumnas?.length || 0) + 1} style={{ padding: '6px 10px 8px 38px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#b91c1c', whiteSpace: 'nowrap' }}>🎥 Enlace de Video:</span>
                                <input
                                  type="url"
                                  value={ej.videoUrl || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    const copy = [...modalSesion.ejercicios];
                                    copy[index].videoUrl = val;
                                    if (copy[index].nombre?.trim()) {
                                      saveEjercicioVideoToCatalog(copy[index].nombre, val);
                                    }
                                    setModalSesion({ ...modalSesion, ejercicios: copy });
                                  }}
                                  placeholder="https://... (Enlace de YouTube, Drive, Vimeo de este ejercicio)"
                                  style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid #fca5a5', background: '#ffffff', fontSize: '11px' }}
                                />
                                {ej.videoUrl && (
                                  <a
                                    href={ej.videoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ padding: '3px 8px', borderRadius: '4px', background: '#dc2626', color: '#ffffff', fontSize: '10px', fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '3px' }}
                                  >
                                    <span>▶</span> Probar
                                  </a>
                                )}
                                <button
                                  onClick={() => {
                                    const copy = [...modalSesion.ejercicios];
                                    copy[index].showVideo = false;
                                    setModalSesion({ ...modalSesion, ejercicios: copy });
                                  }}
                                  style={{ background: 'none', border: 'none', fontSize: '10px', color: '#64748b', cursor: 'pointer' }}
                                >
                                  Plegar ▲
                                </button>
                              </div>
                              {ej.videoUrl && (
                                <div style={{ fontSize: '9.5px', color: '#16a34a', marginTop: '3px', fontWeight: 600 }}>
                                  ✓ Enlace guardado para "{ej.nombre || 'este ejercicio'}". Se recordará automáticamente en futuras sesiones.
                                </div>
                              )}
                            </td>
                          </tr>
                        )}

                        {/* COMENTARIO PLEGADO */}
                        {ej.showNotas && (
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <td colSpan={7 + (mostrarGrupoMuscular ? 1 : 0) + (modalSesion.incluirRpe ? 1 : 0) + (modalSesion.variablesColumnas?.length || 0) + 1} style={{ padding: '4px 10px 8px 38px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '10px', fontWeight: 800, color: '#0369a1' }}>Observación:</span>
                                <input
                                  type="text"
                                  value={ej.notas || ''}
                                  onChange={e => {
                                    const copy = [...modalSesion.ejercicios];
                                    copy[index].notas = e.target.value;
                                    setModalSesion({ ...modalSesion, ejercicios: copy });
                                  }}
                                  placeholder="Escribe la observación del ejercicio (ej. Passar per grups musculars mes grans, baixar molt lent...)"
                                  style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid #bae6fd', background: '#ffffff', fontSize: '11px' }}
                                />
                                <button onClick={() => { const copy = [...modalSesion.ejercicios]; copy[index].showNotas = false; setModalSesion({ ...modalSesion, ejercicios: copy }); }} style={{ background: 'none', border: 'none', fontSize: '10px', color: '#64748b', cursor: 'pointer' }}>Plegar ▲</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {/* Elemento ancla para auto-scroll al fondo de la lista */}
                    <tr ref={ejerciciosBottomRef} style={{ height: '1px' }}>
                      <td colSpan={100} style={{ padding: 0, border: 'none', height: '1px' }} />
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Botón rápido al pie de la tabla para añadir otro ejercicio */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, marginTop: '-4px' }}>
                <button
                  onClick={handleAddEjercicio}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '5px',
                    background: '#eff6ff',
                    color: '#1e3a8a',
                    border: '1px dashed #93c5fd',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <span>➕</span>
                  <span>Añadir otro ejercicio</span>
                </button>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                  {modalSesion.ejercicios.length} {modalSesion.ejercicios.length === 1 ? 'ejercicio configurado' : 'ejercicios configurados'}
                </span>
              </div>

              <datalist id="ejercicios_datalist">
                {EJERCICIOS_CATALOGO_RAPIDO.map(e => <option key={e} value={e} />)}
              </datalist>

              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '12px', background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', flexShrink: 0 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>📹</span>
                      <span>Enlace de Video de la Sesión</span>
                    </label>
                    <span style={{ fontSize: '9.5px', color: '#64748b' }}>YouTube, Drive, Vimeo, etc.</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={modalSesion.videoUrl || ''}
                      onChange={e => setModalSesion({ ...modalSesion, videoUrl: e.target.value })}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11.5px', background: '#ffffff' }}
                    />
                    {modalSesion.videoUrl && (
                      <a
                        href={modalSesion.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Probar enlace de video"
                        style={{
                          padding: '6px 10px',
                          borderRadius: '5px',
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          color: '#1d4ed8',
                          fontSize: '11px',
                          fontWeight: 800,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ▶ Ver
                      </a>
                    )}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '3px' }}>
                    Observaciones Generales
                  </label>
                  <textarea
                    value={modalSesion.notas || ''}
                    onChange={e => setModalSesion({ ...modalSesion, notas: e.target.value })}
                    placeholder="Comentarios, notas u objetivos..."
                    rows={1}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11.5px', minHeight: '32px', background: '#ffffff' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button onClick={() => handleDeleteSesion(modalSesion.jugadorId, modalSesion.fecha)} style={{ padding: '6px 12px', borderRadius: '5px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: '11.5px', fontWeight: 800, cursor: 'pointer' }}>🗑️ Eliminar</button>
                <button onClick={() => handleAplicarATodoElEquipo(modalSesion)} style={{ padding: '6px 12px', borderRadius: '5px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1e3a8a', fontSize: '11.5px', fontWeight: 800, cursor: 'pointer' }}>👥 Aplicar a Todo el Equipo</button>
                <button
                  type="button"
                  onClick={() => {
                    handleSaveModalSesion();
                    setReportFecha(modalSesion.fecha);
                    if (modalSesion.jugadorId === 'TEAM') {
                      setReportTipo('grupal');
                    } else {
                      setReportTipo('individual');
                      setSelectedReportJugadorIds([modalSesion.jugadorId]);
                    }
                    setShowReportPreviewModal(true);
                  }}
                  style={{ padding: '6px 12px', borderRadius: '5px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1e3a8a', fontSize: '11.5px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="Guardar y ver/guardar PDF de esta sesión"
                >
                  <span>🖨️</span>
                  <span>Guardar y Ver PDF</span>
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button onClick={() => setModalSesion(null)} style={{ padding: '6px 12px', borderRadius: '5px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleSaveModalSesion} style={{ padding: '6px 16px', borderRadius: '5px', border: 'none', background: '#1e3a8a', color: '#ffffff', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>💾 Guardar Sesión</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIGURACIÓN DE REPORTES (INDIVIDUAL / GRUPAL / AMBOS) */}
      {showReportConfigModal && (
        <div className="no-print" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px',
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '10px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            overflow: 'hidden',
          }}>
            <div style={{ background: '#0f172a', color: '#ffffff', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📄</span>
                <h3 style={{ fontSize: '15px', fontWeight: 900, margin: 0 }}>Generar Reporte de Gimnasio</h3>
              </div>
              <button onClick={() => setShowReportConfigModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Fecha */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                  Selecciona la Fecha de la Sesión
                </label>
                <input
                  type="date"
                  value={reportFecha}
                  onChange={e => setReportFecha(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 700 }}
                />
              </div>

              {/* Modo: Individual, Grupal o Ambos */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                  Tipo de Reporte
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <button
                    onClick={() => setReportTipo('individual')}
                    style={{
                      padding: '8px',
                      borderRadius: '6px',
                      border: reportTipo === 'individual' ? '2px solid #b91c1c' : '1px solid #cbd5e1',
                      background: reportTipo === 'individual' ? '#fef2f2' : '#ffffff',
                      color: reportTipo === 'individual' ? '#991b1b' : '#334155',
                      fontWeight: 800,
                      fontSize: '11.5px',
                      cursor: 'pointer',
                    }}
                  >
                    👤 Individuales
                  </button>

                  <button
                    onClick={() => setReportTipo('grupal')}
                    style={{
                      padding: '8px',
                      borderRadius: '6px',
                      border: reportTipo === 'grupal' ? '2px solid #b91c1c' : '1px solid #cbd5e1',
                      background: reportTipo === 'grupal' ? '#fef2f2' : '#ffffff',
                      color: reportTipo === 'grupal' ? '#991b1b' : '#334155',
                      fontWeight: 800,
                      fontSize: '11.5px',
                      cursor: 'pointer',
                    }}
                  >
                    👥 Grupal (Equipo)
                  </button>

                  <button
                    onClick={() => setReportTipo('ambos')}
                    style={{
                      padding: '8px',
                      borderRadius: '6px',
                      border: reportTipo === 'ambos' ? '2px solid #b91c1c' : '1px solid #cbd5e1',
                      background: reportTipo === 'ambos' ? '#fef2f2' : '#ffffff',
                      color: reportTipo === 'ambos' ? '#991b1b' : '#334155',
                      fontWeight: 800,
                      fontSize: '11.5px',
                      cursor: 'pointer',
                    }}
                  >
                    ⚡ Ambos
                  </button>
                </div>
              </div>

              {/* Selector de Jugadores para Individuales */}
              {(reportTipo === 'individual' || reportTipo === 'ambos') && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569' }}>
                      Jugadores a incluir ({selectedReportJugadorIds.length})
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => setSelectedReportJugadorIds(jugadores.map(j => j.id))}
                        style={{ background: 'none', border: 'none', color: '#1e3a8a', fontSize: '10.5px', fontWeight: 800, cursor: 'pointer' }}
                      >
                        Todos
                      </button>
                      <button
                        onClick={() => setSelectedReportJugadorIds([])}
                        style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '10.5px', cursor: 'pointer' }}
                      >
                        Ninguno
                      </button>
                    </div>
                  </div>

                  <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    {jugadores.map(jug => {
                      const isChecked = selectedReportJugadorIds.includes(jug.id);
                      return (
                        <label key={jug.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px', background: isChecked ? '#eff6ff' : 'transparent' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => {
                              if (e.target.checked) setSelectedReportJugadorIds([...selectedReportJugadorIds, jug.id]);
                              else setSelectedReportJugadorIds(selectedReportJugadorIds.filter(id => id !== jug.id));
                            }}
                          />
                          <span style={{ fontWeight: isChecked ? 800 : 500, color: '#0f172a' }}>
                            {jug.apodo || jug.nombre}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setShowReportConfigModal(false)} style={{ padding: '6px 12px', borderRadius: '5px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '11.5px', cursor: 'pointer' }}>Cancelar</button>
              <button
                onClick={() => {
                  setShowReportConfigModal(false);
                  setShowReportPreviewModal(true);
                }}
                style={{ padding: '6px 16px', borderRadius: '5px', border: 'none', background: '#b91c1c', color: '#ffffff', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
              >
                👁️ Previsualizar e Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VISTA PREVIA E IMPRESIÓN DEL REPORTE (IDÉNTICO A LA FOTO ADJUNTA) */}
      {showReportPreviewModal && (
        <div
          className="gym-print-modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: '#e2e8f0',
            zIndex: 999999,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}>
          {/* Barra de Controles Superior (Oculta al Imprimir) */}
          <div className="no-print" style={{
            background: '#0f172a',
            color: '#ffffff',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>🖨️</span>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 900, margin: 0 }}>Reportes de Gimnasio - {reportFecha}</h3>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {reportTipo === 'individual' ? `${reportData.individualSheets.length} Fichas Individuales` : reportTipo === 'grupal' ? 'Ficha Grupal de Equipo' : `${reportData.individualSheets.length} Fichas Individuales + 1 Grupal`}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={handlePrintReport}
                style={{
                  padding: '7px 18px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#b91c1c',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(185, 28, 28, 0.4)',
                }}
              >
                <span>🖨️</span>
                <span>Imprimir / Guardar PDF</span>
              </button>

              <button
                onClick={() => {
                  setShowReportPreviewModal(false);
                  setShowReportConfigModal(true);
                }}
                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #475569', background: '#1e293b', color: '#cbd5e1', fontSize: '11.5px', cursor: 'pointer' }}
              >
                ← Configurar
              </button>

              <button
                onClick={() => setShowReportPreviewModal(false)}
                style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#334155', color: '#ffffff', fontSize: '11.5px', cursor: 'pointer' }}
              >
                ✕ Cerrar
              </button>
            </div>
          </div>

          {/* CONTENEDOR DE FICHAS IMPRIMIBLES (ESTILO FOTO ADJUNTA) */}
          <div
            className="gym-print-sheets-container"
            style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
            <style jsx global>{`
              @media print {
                @page {
                  size: A4 portrait !important;
                  margin: 8mm 8mm 8mm 8mm !important;
                }
                html, body {
                  background: #ffffff !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  width: 100% !important;
                  height: auto !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                .no-print {
                  display: none !important;
                }
                .gym-print-modal-overlay {
                  position: static !important;
                  background: #ffffff !important;
                  padding: 0 !important;
                  margin: 0 !important;
                  width: 100% !important;
                  height: auto !important;
                  overflow: visible !important;
                  display: block !important;
                }
                .gym-print-sheets-container {
                  padding: 0 !important;
                  margin: 0 !important;
                  width: 100% !important;
                  gap: 0 !important;
                  display: block !important;
                }
                .report-page-break {
                  page-break-after: always !important;
                  break-after: page !important;
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                  width: 100% !important;
                  max-width: 100% !important;
                  margin: 0 auto !important;
                  padding: 0 !important;
                  box-sizing: border-box !important;
                  box-shadow: none !important;
                  border: none !important;
                }
                .report-page-break:last-child {
                  page-break-after: auto !important;
                  break-after: auto !important;
                }
                .report-page-break .gym-header-top {
                  margin-bottom: 8px !important;
                }
                .report-page-break .gym-yellow-bar {
                  margin-bottom: 6px !important;
                  padding: 4px 8px !important;
                }
                .report-page-break .gym-comment-block {
                  margin-bottom: 5px !important;
                  padding-bottom: 2px !important;
                }
                .report-page-break table {
                  margin-bottom: 4px !important;
                  width: 100% !important;
                  table-layout: fixed !important;
                }
                .report-page-break th,
                .report-page-break td {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
              }
            `}</style>

            {/* FICHAS INDIVIDUALES (COMO EN LA FOTO DE JOAN MASCARÓ) */}
            {(reportTipo === 'individual' || reportTipo === 'ambos') && (
              reportData.individualSheets.length === 0 && reportTipo === 'individual' ? (
                <div style={{
                  background: '#ffffff',
                  width: '100%',
                  maxWidth: '850px',
                  padding: '40px 32px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: '13px',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.06)',
                }}>
                  No hay sesiones individuales registradas para los jugadores seleccionados en esta fecha.
                </div>
              ) : (
                reportData.individualSheets.map((item, sheetIdx) => (
                <div
                  key={item.jugador.id + '_' + (item.sesion.id || sheetIdx)}
                  className="report-page-break"
                  style={{
                    background: '#ffffff',
                    width: '100%',
                    maxWidth: '850px',
                    padding: '24px 32px',
                    borderRadius: '8px',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.06)',
                    boxSizing: 'border-box',
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  {/* CABECERA TOP: TEXTO/EQUIPO IZQUIERDA - FOTO Y NOMBRE CENTRO - ESCUDO DERECHA */}
                  <div className="gym-header-top" style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto 1fr',
                    alignItems: 'center',
                    marginBottom: '14px',
                    gap: '12px',
                    width: '100%',
                  }}>
                    {/* Izquierda: Datos del Club (sin repetir título de la sesión aquí) */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 900, color: '#0f172a' }}>
                        {clubConfig.nombreClub} - {clubConfig.categoria || '1er Equipo'}
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginTop: '2px' }}>
                        Preparació Física
                      </div>
                    </div>

                    {/* Centro: Foto y Nombre del Jugador PERFECTAMENTE CENTRADO */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0 12px' }}>
                      {item.jugador.foto_url ? (
                        <img
                          src={item.jugador.foto_url}
                          alt={item.jugador.nombre}
                          style={{
                            height: '110px',
                            maxHeight: '120px',
                            maxWidth: '160px',
                            width: 'auto',
                            objectFit: 'contain',
                            background: 'transparent',
                            border: 'none',
                            boxShadow: 'none',
                            borderRadius: '4px',
                            mixBlendMode: 'multiply',
                          }}
                        />
                      ) : (
                        <div style={{ height: '60px', color: '#1e3a8a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 900 }}>
                          {item.jugador.dorsal ? '#' + item.jugador.dorsal : getInitials(item.jugador.nombre)}
                        </div>
                      )}
                      <h2 style={{
                        fontSize: item.jugador.nombre.length > 22 ? '17px' : item.jugador.nombre.length > 16 ? '19px' : '22px',
                        fontWeight: 900,
                        color: '#b91c1c',
                        margin: 0,
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                        wordBreak: 'break-word',
                        lineHeight: 1.2,
                      }}>
                        {item.jugador.nombre}
                      </h2>
                    </div>

                    {/* Derecha: Escudo del Club */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <img
                          src={clubConfig.escudoUrl}
                          alt={clubConfig.nombreClub}
                          style={{ width: '56px', height: '56px', objectFit: 'contain' }}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '/ce-europa.png';
                          }}
                        />
                        <div style={{
                          fontSize: '9.5px',
                          fontWeight: 800,
                          color: '#475569',
                          marginTop: '3px',
                          letterSpacing: '0.5px',
                          textTransform: 'uppercase',
                          textAlign: 'center',
                        }}>
                          {clubConfig.nombreClub}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BARRA HORIZONTAL DORADA / AMARILLA DE CONTEXTO */}
                  {(() => {
                    const evCo = getEventoCoContextoReporte(item.day, item.jugador.id, item.sesion);
                    const sTitle = (item.sesion.nombreSesion && item.sesion.nombreSesion.trim()) ||
                                   (item.sesion.categoria && item.sesion.categoria.trim()) ||
                                   evCo.orientacion ||
                                   'FUERZA';
                    const horaVal = (item.sesion.hora && item.sesion.hora.trim()) || (evCo.hora && evCo.hora.trim()) || '';
                    const lugarVal = (item.sesion.lugar && item.sesion.lugar.trim()) || evCo.lugar;
                    const durVal = item.sesion.duracionMin ? String(item.sesion.duracionMin) : evCo.duracion;

                    return (
                      <div className="gym-yellow-bar" style={{
                        background: '#fef08a',
                        borderRadius: '4px',
                        padding: '6px 12px',
                        display: 'grid',
                        gridTemplateColumns: '1fr auto 1fr',
                        alignItems: 'center',
                        fontWeight: 800,
                        fontSize: '12px',
                        color: '#0f172a',
                        marginBottom: '14px',
                        border: '1px solid #fde047',
                        width: '100%',
                        boxSizing: 'border-box',
                      }}>
                        {/* Zona Izquierda: Día, Fecha y Periodo/MD */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start', whiteSpace: 'nowrap' }}>
                          <span>{formatFechaCol(item.sesion.fecha).diaSem}</span>
                          <span>{formatFechaCol(item.sesion.fecha).diaMes}/26</span>
                          <span style={{ textTransform: 'uppercase', color: '#1e293b' }}>
                            {resolvePlanificacionMD(item.sesion.fecha, allDays) || item.day?.md || item.sesion.md || 'MD'}
                          </span>
                        </div>

                        {/* Zona Central: Título real de la sesión (auto-ajustable a longitud, perfectamente centrado) */}
                        <div style={{
                          textAlign: 'center',
                          fontWeight: 900,
                          fontSize: sTitle.length > 30 ? '12px' : '13.5px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.8px',
                          color: '#0f172a',
                          padding: '0 12px',
                          whiteSpace: 'nowrap',
                        }} title={sTitle}>
                          {sTitle}
                        </div>

                        {/* Zona Derecha: Hora (solo si existe), Lugar y Duración */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', whiteSpace: 'nowrap' }}>
                          {horaVal ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '11px' }}>🕒</span>
                              <span>{horaVal}</span>
                            </div>
                          ) : null}
                          {lugarVal ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '11px' }}>📍</span>
                              <span style={{ textTransform: 'uppercase' }}>{lugarVal}</span>
                            </div>
                          ) : null}
                          {durVal ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '11px' }}>⏱️</span>
                              <span>{durVal}'</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })()}

                  {/* COMENTARIO DE LA SESIÓN Y BOTÓN DE VIDEO ENTRE BLOQUE AMARILLO Y TABLA (SIN RECUADRO) */}
                  {(Boolean(item.sesion.notas?.trim()) || Boolean(hasReportVideo(item.sesion.videoUrl))) && (
                    <div className="gym-comment-block" style={{
                      background: 'transparent',
                      border: 'none',
                      padding: '2px 0 6px 0',
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '14px',
                      lineHeight: 1.4,
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                        {item.sesion.notas ? (
                          <>
                            <span style={{
                              fontSize: '10.5px',
                              fontWeight: 900,
                              color: '#1e3a8a',
                              textTransform: 'uppercase',
                              letterSpacing: '0.6px',
                            }}>
                              Comentario de la sesión:
                            </span>
                            <div style={{ color: '#000000', fontSize: '11.5px', fontWeight: 500, lineHeight: 1.45 }}>
                              {item.sesion.notas}
                            </div>
                          </>
                        ) : (
                          <span style={{ fontWeight: 900, color: '#1e3a8a', textTransform: 'uppercase', fontSize: '10.5px', letterSpacing: '0.6px' }}>
                            Recursos de la Sesión
                          </span>
                        )}
                      </div>

                      {/* BOTONCITO DE VIDEO CLICKABLE EN EXPORTACIÓN / IMPRESIÓN */}
                      {hasReportVideo(item.sesion.videoUrl) && (
                        <a
                          href={item.sesion.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 12px',
                            borderRadius: '4px',
                            background: '#dc2626',
                            color: '#ffffff',
                            textDecoration: 'none',
                            fontSize: '11px',
                            fontWeight: 800,
                            boxShadow: '0 1px 3px rgba(220, 38, 38, 0.25)',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            cursor: 'pointer',
                          }}
                          title="Abrir enlace de video de la sesión"
                        >
                          <span style={{ fontSize: '10px' }}>▶</span>
                          <span>Ver Video</span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* TABLA DE EJERCICIOS DINÁMICA (OMITE COLUMNAS SIN INFORMACIÓN) */}
                  <ReportExerciseTable sesion={item.sesion} />
                </div>
              ))
            ))}

            {/* FICHA GRUPAL DE EQUIPO */}
            {(reportTipo === 'grupal' || reportTipo === 'ambos') && reportData.teamSheet && (
              <div
                className="report-page-break"
                style={{
                  background: '#ffffff',
                  width: '100%',
                  maxWidth: '850px',
                  padding: '24px 32px',
                  borderRadius: '8px',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.06)',
                  boxSizing: 'border-box',
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                {/* CABECERA TOP GRUPAL: TEXTO/EQUIPO IZQUIERDA - TITULO CENTRO - ESCUDO DERECHA */}
                <div className="gym-header-top" style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  alignItems: 'center',
                  marginBottom: '14px',
                  gap: '12px',
                  width: '100%',
                }}>
                  {/* Izquierda: Datos del Club (sin repetir título arriba a la izquierda) */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 900, color: '#0f172a' }}>
                      {clubConfig.nombreClub} - {clubConfig.categoria || '1er Equipo'}
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginTop: '2px' }}>
                      Preparació Física
                    </div>
                  </div>

                  {/* Centro: Título EQUIPO centrado */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '0 12px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#b91c1c', margin: 0, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                      EQUIPO
                    </h2>
                  </div>

                  {/* Derecha: Escudo del Club */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <img
                        src={clubConfig.escudoUrl}
                        alt={clubConfig.nombreClub}
                        style={{ width: '56px', height: '56px', objectFit: 'contain' }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = '/ce-europa.png';
                        }}
                      />
                      <div style={{
                        fontSize: '9.5px',
                        fontWeight: 800,
                        color: '#475569',
                        marginTop: '3px',
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                      }}>
                        {clubConfig.nombreClub}
                      </div>
                    </div>
                  </div>
                </div>

                {/* BARRA HORIZONTAL DORADA / AMARILLA DE CONTEXTO GRUPAL */}
                {(() => {
                  const teamEvCo = getEventoCoContextoReporte(reportData.teamSheet.day, undefined, reportData.teamSheet.sesion);
                  const tTitle = (reportData.teamSheet.sesion.nombreSesion && reportData.teamSheet.sesion.nombreSesion.trim()) ||
                                 (reportData.teamSheet.sesion.categoria && reportData.teamSheet.sesion.categoria.trim()) ||
                                 teamEvCo.orientacion ||
                                 'FUERZA';
                  const horaVal = (reportData.teamSheet.sesion.hora && reportData.teamSheet.sesion.hora.trim()) || (teamEvCo.hora && teamEvCo.hora.trim()) || '';
                  const lugarVal = (reportData.teamSheet.sesion.lugar && reportData.teamSheet.sesion.lugar.trim()) || teamEvCo.lugar;
                  const durVal = reportData.teamSheet.sesion.duracionMin ? String(reportData.teamSheet.sesion.duracionMin) : teamEvCo.duracion;

                  return (
                    <div style={{
                      background: '#fef08a',
                      borderRadius: '4px',
                      padding: '6px 12px',
                      display: 'grid',
                      gridTemplateColumns: '1fr auto 1fr',
                      alignItems: 'center',
                      fontWeight: 800,
                      fontSize: '12px',
                      color: '#0f172a',
                      marginBottom: '14px',
                      border: '1px solid #fde047',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}>
                      {/* Zona Izquierda: Día, Fecha y Periodo/MD */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start', whiteSpace: 'nowrap' }}>
                        <span>{formatFechaCol(reportData.teamSheet.sesion.fecha).diaSem}</span>
                        <span>{formatFechaCol(reportData.teamSheet.sesion.fecha).diaMes}/26</span>
                        <span style={{ textTransform: 'uppercase', color: '#1e293b' }}>
                          {resolvePlanificacionMD(reportData.teamSheet.sesion.fecha, allDays) || reportData.teamSheet.day?.md || reportData.teamSheet.sesion.md || 'MD'}
                        </span>
                      </div>

                      {/* Zona Central: Título real de la sesión (auto-ajustable a longitud, perfectamente centrado) */}
                      <div style={{
                        textAlign: 'center',
                        fontWeight: 900,
                        fontSize: tTitle.length > 30 ? '12px' : '13.5px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.8px',
                        color: '#0f172a',
                        padding: '0 12px',
                        whiteSpace: 'nowrap',
                      }} title={tTitle}>
                        {tTitle}
                      </div>

                      {/* Zona Derecha: Hora (solo si existe), Lugar y Duración */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', whiteSpace: 'nowrap' }}>
                        {horaVal ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '11px' }}>🕒</span>
                            <span>{horaVal}</span>
                          </div>
                        ) : null}
                        {lugarVal ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '11px' }}>📍</span>
                            <span style={{ textTransform: 'uppercase' }}>{lugarVal}</span>
                          </div>
                        ) : null}
                        {durVal ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '11px' }}>⏱️</span>
                            <span>{durVal}'</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}

                {/* COMENTARIO DE LA SESIÓN Y BOTÓN DE VIDEO GRUPAL ENTRE BLOQUE AMARILLO Y TABLA (SIN RECUADRO) */}
                {(Boolean(reportData.teamSheet.sesion.notas?.trim()) || Boolean(hasReportVideo(reportData.teamSheet.sesion.videoUrl))) && (
                  <div style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '2px 0 8px 0',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '14px',
                    lineHeight: 1.4,
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                      {reportData.teamSheet.sesion.notas ? (
                        <>
                          <span style={{
                            fontSize: '10.5px',
                            fontWeight: 900,
                            color: '#1e3a8a',
                            textTransform: 'uppercase',
                            letterSpacing: '0.6px',
                          }}>
                            Comentario de la sesión:
                          </span>
                          <div style={{ color: '#000000', fontSize: '11.5px', fontWeight: 500, lineHeight: 1.45 }}>
                            {reportData.teamSheet.sesion.notas}
                          </div>
                        </>
                      ) : (
                        <span style={{ fontWeight: 900, color: '#1e3a8a', textTransform: 'uppercase', fontSize: '10.5px', letterSpacing: '0.6px' }}>
                          Recursos de la Sesión
                        </span>
                      )}
                    </div>

                    {/* BOTONCITO DE VIDEO CLICKABLE EN EXPORTACIÓN / IMPRESIÓN */}
                    {hasReportVideo(reportData.teamSheet.sesion.videoUrl) && (
                      <a
                        href={reportData.teamSheet.sesion.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '4px 12px',
                          borderRadius: '4px',
                          background: '#dc2626',
                          color: '#ffffff',
                          textDecoration: 'none',
                          fontSize: '11px',
                          fontWeight: 800,
                          boxShadow: '0 1px 3px rgba(220, 38, 38, 0.25)',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          cursor: 'pointer',
                        }}
                        title="Abrir enlace de video de la sesión"
                      >
                        <span style={{ fontSize: '10px' }}>▶</span>
                        <span>Ver Video</span>
                      </a>
                    )}
                  </div>
                )}

                {/* TABLA DE EJERCICIOS DINÁMICA (OMITE COLUMNAS SIN INFORMACIÓN) */}
                <ReportExerciseTable sesion={reportData.teamSheet.sesion} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL MODO ESTACIÓN / TABLET KIOSCO */}
      <GimnasioEstacionModal
        isOpen={showEstacionModal}
        onClose={() => setShowEstacionModal(false)}
        allDays={sortedDays}
        sesionesMap={sesionesMap}
        jugadores={jugadores}
        initialFecha={sortedDays[0]?.fecha}
      />
    </div>
  );
}


// HELPERS PARA REPORTES: OMITIR COLUMNAS O VIDEOS SIN INFORMACIÓN
function hasReportValue(val: any): boolean {
  if (val === undefined || val === null) return false;
  const str = String(val).trim();
  if (!str) return false;
  if (str === '—' || str === '-' || str === '–' || str === '--' || str === '---') return false;
  if (str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') return false;
  return true;
}

function hasReportVideo(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.includes('youtube.com/placeholder') || trimmed === '#' || trimmed === '—' || trimmed === '-') return false;
  return true;
}

interface ReportColumnDef {
  id: string;
  label: string;
  align: 'left' | 'center' | 'right';
  width?: string;
  renderCell: (ej: GimnasioEjercicio) => React.ReactNode;
}

function ReportExerciseTable({ sesion }: { sesion: GimnasioSesion }) {
  const ejs = sesion.ejercicios || [];

  if (ejs.length === 0) {
    return (
      <div style={{
        padding: '24px 16px',
        textAlign: 'center',
        color: '#64748b',
        fontSize: '12px',
        fontStyle: 'italic',
        background: '#f8fafc',
        borderRadius: '6px',
        border: '1px dashed #cbd5e1',
        marginBottom: '16px',
      }}>
        Sin ejercicios registrados para esta sesión
      </div>
    );
  }

  const hasBloq = ejs.some(ej => hasReportValue(ej.bloque));
  const hasSeries = ejs.some(ej => hasReportValue(ej.series));
  const hasReps = ejs.some(ej => hasReportValue(ej.reps));
  const hasCarga = ejs.some(ej => hasReportValue(ej.pesoKg));
  const hasVel = ejs.some(ej => hasReportValue(ej.velocidad) || hasReportValue(ej.variablesPersonalizadas?.['Velocidad']) || hasReportValue(ej.variablesPersonalizadas?.['Vel']));
  const hasMaterial = ejs.some(ej => hasReportValue(ej.material) || hasReportValue(ej.variablesPersonalizadas?.['Material']));
  const hasRpe = Boolean(sesion.incluirRpe) && ejs.some(ej => hasReportValue(ej.rpe));
  const hasVideo = ejs.some(ej => hasReportVideo(ej.videoUrl));

  // Variables personalizadas adicionales
  const standardKeys = new Set([
    'Bloq', 'bloque', 'Ejercicio', 'ejercicio', 'Series', 'series', 'Reps', 'reps',
    'Carga', 'pesoKg', 'Velocidad', 'Vel', 'velocidad', 'Material', 'material',
    'Video', 'videoUrl', 'RPE', 'rpe', 'Grupo Muscular', 'grupoMuscular', 'Notas', 'notas'
  ]);
  const customKeys: string[] = [];
  const foundCustom = new Set<string>();
  (sesion.variablesColumnas || []).forEach(c => {
    if (c && !standardKeys.has(c)) foundCustom.add(c);
  });
  ejs.forEach(ej => {
    if (ej.variablesPersonalizadas) {
      Object.keys(ej.variablesPersonalizadas).forEach(k => {
        if (k && !standardKeys.has(k)) foundCustom.add(k);
      });
    }
  });
  foundCustom.forEach(k => {
    if (ejs.some(ej => hasReportValue(ej.variablesPersonalizadas?.[k]))) {
      customKeys.push(k);
    }
  });

  const cols: ReportColumnDef[] = [];

  if (hasBloq) {
    cols.push({
      id: 'bloq',
      label: 'Bloq',
      align: 'center',
      width: '38px',
      renderCell: (ej) => (
        <span style={{ fontWeight: 800, color: '#475569', fontSize: '10px', whiteSpace: 'nowrap' }}>
          {ej.bloque || '—'}
        </span>
      ),
    });
  }

  // Ejercicio siempre visible con ancho horizontal amplio y proporcionado
  cols.push({
    id: 'ejercicio',
    label: 'Ejercicio',
    align: 'left',
    width: '210px',
    renderCell: (ej) => (
      <div style={{
        fontWeight: 900,
        color: '#0f172a',
        textTransform: 'uppercase',
        lineHeight: 1.25,
        fontSize: '10.5px',
        wordBreak: 'normal',
        overflowWrap: 'break-word',
        whiteSpace: 'normal',
        minWidth: '180px',
      }}>
        {ej.nombre || 'Ejercicio'}
      </div>
    ),
  });

  if (hasSeries) {
    cols.push({
      id: 'series',
      label: 'Nº Series',
      align: 'center',
      width: '46px',
      renderCell: (ej) => (
        <span style={{ fontWeight: 700, fontSize: '10px', whiteSpace: 'nowrap' }}>
          {ej.series || '—'}
        </span>
      ),
    });
  }

  if (hasReps) {
    cols.push({
      id: 'reps',
      label: 'Rep',
      align: 'center',
      width: '48px',
      renderCell: (ej) => (
        <span style={{ fontWeight: 700, fontSize: '10px', whiteSpace: 'nowrap' }}>
          {ej.reps || '—'}
        </span>
      ),
    });
  }

  if (hasCarga) {
    cols.push({
      id: 'carga',
      label: 'Carga',
      align: 'center',
      width: '46px',
      renderCell: (ej) => (
        <span style={{ fontWeight: 700, fontSize: '10px', whiteSpace: 'nowrap' }}>
          {ej.pesoKg || '—'}
        </span>
      ),
    });
  }

  if (hasVel) {
    cols.push({
      id: 'vel',
      label: 'Vel',
      align: 'center',
      width: '58px',
      renderCell: (ej) => (
        <span style={{ color: '#475569', fontSize: '9.5px', whiteSpace: 'nowrap' }}>
          {ej.velocidad || ej.variablesPersonalizadas?.['Velocidad'] || ej.variablesPersonalizadas?.['Vel'] || '—'}
        </span>
      ),
    });
  }

  if (hasMaterial) {
    cols.push({
      id: 'material',
      label: 'Material',
      align: 'left',
      width: '78px',
      renderCell: (ej) => (
        <div style={{
          color: '#334155',
          fontWeight: 600,
          fontSize: '9.5px',
          lineHeight: 1.25,
          wordBreak: 'normal',
          whiteSpace: 'normal',
        }}>
          {ej.material || ej.variablesPersonalizadas?.['Material'] || '—'}
        </div>
      ),
    });
  }

  if (hasRpe) {
    cols.push({
      id: 'rpe',
      label: 'RPE',
      align: 'center',
      width: '44px',
      renderCell: (ej) => (
        <span style={{ fontWeight: 700, fontSize: '10px', whiteSpace: 'nowrap' }}>
          {ej.rpe != null ? ej.rpe : '—'}
        </span>
      ),
    });
  }

  customKeys.forEach(k => {
    cols.push({
      id: `cust_${k}`,
      label: k,
      align: 'center',
      width: '52px',
      renderCell: (ej) => (
        <div style={{
          color: '#334155',
          fontWeight: 600,
          fontSize: '9.5px',
          lineHeight: 1.25,
          wordBreak: 'normal',
          whiteSpace: 'normal',
        }}>
          {ej.variablesPersonalizadas?.[k] || '—'}
        </div>
      ),
    });
  });

  if (hasVideo) {
    cols.push({
      id: 'video',
      label: 'Video',
      align: 'center',
      width: '54px',
      renderCell: (ej) => (
        hasReportVideo(ej.videoUrl) ? (
          <a
            href={ej.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              padding: '2px 5px',
              borderRadius: '3px',
              background: '#dc2626',
              color: '#ffffff',
              textDecoration: 'none',
              fontSize: '8.5px',
              fontWeight: 800,
              boxShadow: '0 1px 2px rgba(220, 38, 38, 0.2)',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              width: '44px',
              boxSizing: 'border-box',
            }}
            title="Ver video de este ejercicio"
          >
            <span style={{ fontSize: '7px' }}>▶</span>
            <span>Video</span>
          </a>
        ) : null
      ),
    });
  }

  return (
    <table style={{
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '10.5px',
      marginBottom: '8px',
      tableLayout: 'auto',
    }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #0f172a', height: '28px', color: '#0f172a' }}>
          {cols.map(c => (
            <th
              key={c.id}
              style={{
                textAlign: c.align,
                padding: c.id === 'ejercicio' ? '4px 6px' : '4px 3px',
                fontWeight: 900,
                fontSize: '10px',
                ...(c.width ? { width: c.width } : {}),
                ...(c.id === 'ejercicio' ? { minWidth: '180px' } : {}),
                whiteSpace: 'nowrap',
              }}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ejs.map((ej) => (
          <React.Fragment key={ej.id}>
            <tr style={{
              height: '24px',
              borderBottom: (ej.notas && hasReportValue(ej.notas)) ? 'none' : '1px solid #f1f5f9',
            }}>
              {cols.map(c => (
                <td
                  key={c.id}
                  style={{
                    padding: c.id === 'ejercicio' ? '4px 6px' : '4px 3px',
                    textAlign: c.align,
                    verticalAlign: 'middle',
                    ...(c.id === 'ejercicio' ? { minWidth: '180px' } : {}),
                  }}
                >
                  {c.renderCell(ej)}
                </td>
              ))}
            </tr>

            {/* Sub-fila: Comentario en cursiva gris debajo del ejercicio */}
            {ej.notas && hasReportValue(ej.notas) && (
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                {hasBloq ? (
                  <>
                    <td></td>
                    <td
                      colSpan={cols.length - 1}
                      style={{
                        padding: '1px 6px 4px 6px',
                        fontSize: '9.5px',
                        color: '#64748b',
                        fontStyle: 'italic',
                        lineHeight: 1.3,
                        wordBreak: 'normal',
                        whiteSpace: 'normal',
                      }}
                    >
                      {ej.notas}
                    </td>
                  </>
                ) : (
                  <td
                    colSpan={cols.length}
                    style={{
                      padding: '1px 6px 4px 6px',
                      fontSize: '9.5px',
                      color: '#64748b',
                      fontStyle: 'italic',
                      lineHeight: 1.3,
                      wordBreak: 'normal',
                      whiteSpace: 'normal',
                    }}
                  >
                    {ej.notas}
                  </td>
                )}
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}


// COMPONENTE TARJETA DE CELDA (COMPACTA O AMPLIADA CON DESGLOSE DE EJERCICIOS)
function MatrixCellSesionItem({
  sesion,
  sesionNumber,
  totalSesiones,
  isExpanded = false,
  hasClipboard,
  onEdit,
  onDelete,
  onCopy,
  onPaste,
  onAddAnother,
  onToggleExpand,
  onDragStart,
}: {
  sesion: GimnasioSesion;
  sesionNumber?: number;
  totalSesiones?: number;
  isExpanded?: boolean;
  hasClipboard: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: (e: React.MouseEvent) => void;
  onPaste: (e: React.MouseEvent) => void;
  onAddAnother?: () => void;
  onToggleExpand?: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const estilo = getCategoriaEstilo(sesion.categoria);

  if (!isExpanded) {
    // VISTA COMPACTA
    return (
      <div
        draggable
        onDragStart={onDragStart}
        onClick={onEdit}
        style={{
          background: estilo.bg,
          border: '1px solid ' + estilo.border,
          borderLeft: '3px solid ' + estilo.color,
          borderRadius: '4px',
          padding: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '4px',
          cursor: 'grab',
          height: '24px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
        title={sesion.nombreSesion + ' • ' + sesion.ejercicios.length + ' ej. (Clic para editar, ▼ para ampliar ejercicios)'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', overflow: 'hidden', flex: 1 }}>
          {sesion.videoUrl && (
            <span
              title="Esta sesión tiene video asignado"
              style={{
                fontSize: '8px',
                color: '#dc2626',
                background: '#fee2e2',
                borderRadius: '2px',
                padding: '1px 2px',
                lineHeight: 1,
              }}
            >
              ▶
            </span>
          )}
          {sesionNumber && (
            <span style={{
              fontSize: '8px',
              fontWeight: 900,
              color: '#ffffff',
              background: '#1e3a8a',
              padding: '1px 3px',
              borderRadius: '2px',
              whiteSpace: 'nowrap',
            }}>
              S{sesionNumber}
            </span>
          )}
          <span style={{
            fontSize: '8.5px',
            fontWeight: 900,
            color: estilo.color,
            background: estilo.badgeBg,
            padding: '1px 3px',
            borderRadius: '2px',
            whiteSpace: 'nowrap',
          }}>
            {estilo.label}
          </span>
          <span style={{
            fontSize: '10px',
            fontWeight: 800,
            color: '#0f172a',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {sesion.nombreSesion}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {/* BOTÓN AMPLIAR EJERCICIOS */}
          {onToggleExpand && (
            <button
              onClick={e => { e.stopPropagation(); onToggleExpand(); }}
              title="Ampliar ejercicios de esta sesión"
              style={{
                background: 'none',
                border: 'none',
                padding: '0 2px',
                fontSize: '9.5px',
                fontWeight: 900,
                color: '#64748b',
                cursor: 'pointer',
                lineHeight: 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#1e3a8a'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#64748b'; }}
            >
              ▼
            </button>
          )}
          {onAddAnother && (
            <button
              onClick={e => { e.stopPropagation(); onAddAnother(); }}
              title="Añadir otra sesión a este día"
              style={{
                background: 'none',
                border: 'none',
                padding: '0 2px',
                fontSize: '11px',
                fontWeight: 900,
                color: '#64748b',
                cursor: 'pointer',
                lineHeight: 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#1e3a8a'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#64748b'; }}
            >
              +
            </button>
          )}
          {hasClipboard && (
            <button
              onClick={onPaste}
              title="Pegar sesión copiada"
              style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '3px', padding: '0 2px', fontSize: '9px', cursor: 'pointer', color: '#1e3a8a', fontWeight: 900 }}
            >
              📥
            </button>
          )}
          <button
            onClick={onCopy}
            title="Copiar sesión"
            style={{ background: 'none', border: 'none', padding: 0, fontSize: '9px', cursor: 'pointer', opacity: 0.6 }}
          >
            📋
          </button>
          <button
            onClick={onDelete}
            title="Eliminar sesión"
            style={{ background: 'none', border: 'none', padding: 0, fontSize: '9px', color: '#ef4444', cursor: 'pointer', opacity: 0.6 }}
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // VISTA AMPLIADA / EXPANDIDA (DESGLOSE COMPLETO DE EJERCICIOS DÍA A DÍA)
  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={{
        background: estilo.bg,
        border: '1px solid ' + estilo.border,
        borderLeft: '4px solid ' + estilo.color,
        borderRadius: '6px',
        padding: '5px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
        boxSizing: 'border-box',
        cursor: 'grab',
        width: '100%',
        minWidth: '128px',
      }}
    >
      {/* Cabecera de la Tarjeta Ampliada */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3px', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '3px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', overflow: 'hidden', flex: 1 }}>
          {sesionNumber && (
            <span style={{
              fontSize: '8px',
              fontWeight: 900,
              color: '#ffffff',
              background: '#1e3a8a',
              padding: '1px 3px',
              borderRadius: '2px',
              whiteSpace: 'nowrap',
            }}>
              S{sesionNumber}
            </span>
          )}
          <span style={{
            fontSize: '8px',
            fontWeight: 900,
            color: estilo.color,
            background: estilo.badgeBg,
            padding: '1px 3px',
            borderRadius: '2px',
            whiteSpace: 'nowrap',
          }}>
            {estilo.label}
          </span>
          <span
            onClick={onEdit}
            title="Clic para abrir en diseñador"
            style={{
              fontSize: '10px',
              fontWeight: 900,
              color: '#0f172a',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {sesion.nombreSesion}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {onToggleExpand && (
            <button
              onClick={e => { e.stopPropagation(); onToggleExpand(); }}
              title="Plegar a vista compacta"
              style={{ background: 'none', border: 'none', padding: '0 2px', fontSize: '9.5px', fontWeight: 900, color: '#3b82f6', cursor: 'pointer', lineHeight: 1 }}
            >
              ▲
            </button>
          )}
          <button
            onClick={onEdit}
            title="Editar en diseñador"
            style={{ background: 'none', border: 'none', padding: '0 1px', fontSize: '9px', cursor: 'pointer', color: '#1e3a8a' }}
          >
            ✎
          </button>
          {onAddAnother && (
            <button
              onClick={e => { e.stopPropagation(); onAddAnother(); }}
              title="Añadir otra sesión a este día"
              style={{ background: 'none', border: 'none', padding: '0 2px', fontSize: '11px', fontWeight: 900, color: '#64748b', cursor: 'pointer', lineHeight: 1 }}
            >
              +
            </button>
          )}
          {hasClipboard && (
            <button
              onClick={onPaste}
              title="Pegar sesión copiada"
              style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '3px', padding: '0 2px', fontSize: '8.5px', cursor: 'pointer', color: '#1e3a8a', fontWeight: 900 }}
            >
              📥
            </button>
          )}
          <button
            onClick={onCopy}
            title="Copiar sesión"
            style={{ background: 'none', border: 'none', padding: 0, fontSize: '9px', cursor: 'pointer', opacity: 0.6 }}
          >
            📋
          </button>
          <button
            onClick={onDelete}
            title="Eliminar sesión"
            style={{ background: 'none', border: 'none', padding: 0, fontSize: '9px', color: '#ef4444', cursor: 'pointer', opacity: 0.6 }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Lista Desglosada de Ejercicios */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        maxHeight: '220px',
        overflowY: 'auto',
        scrollbarWidth: 'thin',
        scrollbarColor: '#cbd5e1 transparent',
      }}>
        {sesion.ejercicios.length === 0 ? (
          <div style={{ fontSize: '9px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '4px 0' }}>
            Sin ejercicios definidos
          </div>
        ) : (
          sesion.ejercicios.map((ej, eIdx) => (
            <div
              key={ej.id || eIdx}
              style={{
                background: 'rgba(255, 255, 255, 0.75)',
                border: '1px solid rgba(0,0,0,0.06)',
                borderRadius: '3px',
                padding: '3px 4px',
                fontSize: '9px',
                lineHeight: 1.25,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2px' }}>
                <span style={{ fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {ej.monitorizado && (
                    <span
                      title={`Monitorizado: ${ej.tipoSensor === 'DINAMOMETRO' ? 'Dinamómetro' : 'Encoder'}`}
                      style={{
                        fontSize: '7.5px',
                        padding: '1px 3px',
                        borderRadius: '3px',
                        background: '#dcfce7',
                        color: '#15803d',
                        fontWeight: 900,
                        border: '1px solid #86efac',
                        flexShrink: 0,
                      }}
                    >
                      ⚡ {ej.tipoSensor === 'DINAMOMETRO' ? 'DIN' : 'VBT'}
                    </span>
                  )}
                  {ej.nombre}
                </span>
                {ej.bloque && (
                  <span style={{ fontSize: '7.5px', fontWeight: 900, color: '#64748b', background: '#f1f5f9', padding: '0 2px', borderRadius: '2px' }}>
                    {ej.bloque}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#475569', fontSize: '8.5px', fontWeight: 700, marginTop: '1px' }}>
                {(ej.series || ej.reps) && (
                  <span>{ej.series || '—'} × {ej.reps || '—'}</span>
                )}
                {ej.pesoKg && (
                  <span style={{ color: '#1e3a8a' }}>• {ej.pesoKg.includes('kg') ? ej.pesoKg : ej.pesoKg + ' kg'}</span>
                )}
                {ej.velocidad && (
                  <span style={{ color: '#059669' }}>• {ej.velocidad}</span>
                )}
                {ej.material && (
                  <span style={{ color: '#d97706' }}>• {ej.material}</span>
                )}
              </div>
              {ej.notas && (
                <div style={{ fontSize: '8px', color: '#64748b', fontStyle: 'italic', marginTop: '1px' }}>
                  💬 {ej.notas}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Notas generales de la sesión si las tiene */}
      {sesion.notas && (
        <div style={{ fontSize: '8.5px', fontStyle: 'italic', color: '#475569', background: 'rgba(254, 240, 138, 0.45)', borderRadius: '3px', padding: '2px 4px', border: '1px solid rgba(253, 224, 71, 0.5)' }}>
          📝 {sesion.notas}
        </div>
      )}

      {/* Pie interactivo para diseñar / añadir ejercicios */}
      <button
        onClick={onEdit}
        style={{
          width: '100%',
          padding: '2px 4px',
          background: '#ffffff',
          border: '1px dashed #cbd5e1',
          borderRadius: '3px',
          color: '#1e3a8a',
          fontSize: '8.5px',
          fontWeight: 800,
          cursor: 'pointer',
          textAlign: 'center',
          marginTop: '1px',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#1e3a8a'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; }}
      >
        ✎ Abrir diseñador
      </button>
    </div>
  );
}
