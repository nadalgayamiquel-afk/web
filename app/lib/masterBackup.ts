import masterBackupData from "@/public/master_backup.json";

export function getMasterBackupTable(tableName: string): any[] {
  try {
    const tableData = (masterBackupData as any)?.database_tables?.[tableName];
    if (tableData && Array.isArray(tableData.rows)) return tableData.rows;
    if (Array.isArray(tableData)) return tableData;
  } catch (e) {
    console.warn("[masterBackup] Error reading table " + tableName + ":", e);
  }
  return [];
}

export function getMasterBackupData(): any {
  return masterBackupData;
}

export function getMasterPlayerEventsMap(): Record<string, string> {
  return (masterBackupData as any)?.player_events_map || {};
}

export function getMasterEventosBloquesMap(): Record<string, any> {
  return (masterBackupData as any)?.eventos_bloques_map || {};
}

export function getMasterDisponibilidadMap(): Record<string, string> {
  return (masterBackupData as any)?.disponibilidad_map || {};
}

export function getMasterComentarios(): any[] {
  return (masterBackupData as any)?.comentarios_jugadores || [];
}

export function getMasterPlanificacionDays(): any[] {
  return (masterBackupData as any)?.planificacion_days || getMasterBackupTable("sesiones_dia");
}

export function getMasterMinutesMap(): Record<string, any> {
  return (masterBackupData as any)?.player_event_minutes_map || {};
}

export function getMasterBrowserData(): Record<string, any> {
  return (masterBackupData as any)?.browser_data || {};
}
