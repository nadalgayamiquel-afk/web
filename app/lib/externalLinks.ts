"use client";

export interface ExternalDatabaseLinks {
  wellness: {
    url: string;
    nombre?: string;
    proveedor?: string;
    notas?: string;
    ultimaSincronizacion?: string;
  };
  gps: {
    url: string;
    nombre?: string;
    proveedor?: string;
    notas?: string;
    ultimaSincronizacion?: string;
  };
  adicionales?: Array<{
    id: string;
    nombre: string;
    url: string;
    categoria?: string;
    notas?: string;
  }>;
}

export const DEFAULT_EXTERNAL_LINKS: ExternalDatabaseLinks = {
  wellness: {
    url: "https://docs.google.com/spreadsheets/d/1JQXKfCrGCxom-N-RM-6nbDqQ0asnL_le0Z4EOwFc5Ds/edit?resourcekey=&gid=432486581#gid=432486581",
    nombre: "Base de Datos Wellness (Carga Interna)",
    proveedor: "Google Sheets",
    notas: "Cuestionarios diarios de fatiga, sueño, dolor muscular y bienestar general.",
  },
  gps: {
    url: "https://docs.google.com/spreadsheets/d/1Q_jYilNR1KQk3YSmugbYXbeW8xdWUqQlWtcDJ2Np9JA/edit?gid=0#gid=0",
    nombre: "Base de Datos GPS (Carga Externa)",
    proveedor: "Wimu Cloud",
    notas: "Repositorio o plataforma de métricas GPS de entrenamientos y partidos.",
  },
  adicionales: [],
};
