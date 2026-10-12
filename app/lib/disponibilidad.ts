/**
 * Constantes y utilidades para los Códigos de Disponibilidad de Deportistas.
 * Ruta: app/lib/disponibilidad.ts
 */

export type DisponibilidadCodigo = 'D' | 'DCS' | 'DS' | 'P' | 'NDR' | 'NDO' | 'NDL' | 'L' | 'DCI';

export interface DisponibilidadInfo {
  codigo: DisponibilidadCodigo;
  nombre: string;
  color: string;
  textColor: string;
  categoriaSemaforo: 'verde' | 'amarillo' | 'rojo';
  manual: boolean; // false para L
}

export const DISPONIBILIDADES: Record<DisponibilidadCodigo, DisponibilidadInfo> = {
  D:   { codigo: 'D',   nombre: 'D',   color: '#4ade80', textColor: '#064e3b', categoriaSemaforo: 'verde',    manual: true },
  DCS: { codigo: 'DCS', nombre: 'DCS', color: '#38bdf8', textColor: '#0f172a', categoriaSemaforo: 'rojo',     manual: true },
  DS:  { codigo: 'DS',  nombre: 'DS',  color: '#c084fc', textColor: '#ffffff', categoriaSemaforo: 'rojo',     manual: true },
  P:   { codigo: 'P',   nombre: 'P',   color: '#facc15', textColor: '#0f172a', categoriaSemaforo: 'amarillo', manual: true },
  NDR: { codigo: 'NDR', nombre: 'NDR', color: '#ef4444', textColor: '#ffffff', categoriaSemaforo: 'rojo',     manual: true },
  NDO: { codigo: 'NDO', nombre: 'NDO', color: '#ef4444', textColor: '#ffffff', categoriaSemaforo: 'rojo',     manual: true },
  NDL: { codigo: 'NDL', nombre: 'NDL', color: '#ef4444', textColor: '#ffffff', categoriaSemaforo: 'rojo',     manual: true },
  L:   { codigo: 'L',   nombre: 'L',   color: '#dc2626', textColor: '#ffffff', categoriaSemaforo: 'rojo',     manual: false },
  DCI: { codigo: 'DCI', nombre: 'DCI', color: '#86efac', textColor: '#064e3b', categoriaSemaforo: 'rojo',     manual: true },
};

// 8 Códigos elegibles manualmente en desplegables (excluyendo 'L')
export const CODIGOS_MANUALES: DisponibilidadCodigo[] = ['D', 'DCS', 'DS', 'P', 'NDR', 'NDO', 'NDL', 'DCI'];

// Opciones del mini-selector por categoría de semáforo (excluyendo 'L'):
export const OPCIONES_AMARILLO: DisponibilidadCodigo[] = ['P', 'NDR'];
export const OPCIONES_ROJO: DisponibilidadCodigo[] = ['NDO', 'NDL', 'DCI', 'DCS', 'DS'];

/**
 * Normaliza cualquier valor de disponibilidad (incluyendo textos largos como DISPONIBLE)
 * a los 9 códigos predeterminados exactos del sistema.
 */
export function normalizeDisponibilidadCodigo(codigo?: string | null): DisponibilidadCodigo | '' {
  if (!codigo) return '';
  const upper = codigo.trim().toUpperCase();
  if (upper === 'DISPONIBLE' || upper === 'D' || upper === 'DISP' || upper === 'SI' || upper === 'S') return 'D';
  if (upper === 'NO_DISPONIBLE' || upper === 'NO DISPONIBLE' || upper === 'ND' || upper === 'NO' || upper === 'N') return 'NDR';
  if (upper === 'DUDA') return 'P';
  if (upper in DISPONIBILIDADES) return upper as DisponibilidadCodigo;
  return '';
}

/**
 * Obtener la información completa de un código de disponibilidad
 */
export function getDisponibilidadInfo(codigo?: string | null): DisponibilidadInfo | null {
  if (!codigo) return null;
  const norm = normalizeDisponibilidadCodigo(codigo);
  if (!norm) return null;
  return DISPONIBILIDADES[norm] || null;
}

/**
 * Traducir código a semáforo simple: 'verde' | 'amarillo' | 'rojo' | 'vacio'
 */
export function getSemaforoCategoria(codigo?: string | null): 'verde' | 'amarillo' | 'rojo' | 'vacio' {
  const info = getDisponibilidadInfo(codigo);
  if (!info) return 'vacio';
  return info.categoriaSemaforo;
}

/**
 * Obtener color de fondo del semáforo simple para la vista de Planificación
 */
export function getSemaforoEstilos(codigo?: string | null): { bg: string; border: string; color: string; label: string } {
  const cat = getSemaforoCategoria(codigo);
  const info = getDisponibilidadInfo(codigo);
  const labelText = info ? info.nombre : '—';

  switch (cat) {
    case 'verde':
      return { bg: '#dcfce7', border: '#4ade80', color: '#15803d', label: labelText };
    case 'amarillo':
      return { bg: '#fef3c7', border: '#f59e0b', color: '#b45309', label: labelText };
    case 'rojo':
      return { bg: '#fee2e2', border: '#ef4444', color: '#b91c1c', label: labelText };
    default:
      return { bg: '#ffffff', border: '#cbd5e1', color: '#64748b', label: '—' };
  }
}
