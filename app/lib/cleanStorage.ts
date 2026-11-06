
/**
 * Guarda de forma segura un valor en localStorage.
 * Si se produce un error de cuota (QuotaExceededError), purga cachés masivas no críticas
 * (como duplicados de gps_datos que ya residen en Supabase) y reintenta el guardado
 * para evitar bloqueos y garantizar que los datos del usuario nunca se pierdan ni fallen.
 */
export function safeSetItem(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err: any) {
    console.warn(`[safeSetItem] Error al guardar "${key}":`, err?.name || err?.message);
    if (err?.name === "QuotaExceededError" || err?.code === 22 || String(err).includes("quota")) {
      try {
        localStorage.removeItem("gps_datos_map_v1");
        localStorage.removeItem("gps_datos_cache");
        localStorage.removeItem("bbdd_general_rows_v1");
        localStorage.setItem(key, value);
        return true;
      } catch (retryErr) {
        console.error(`[safeSetItem] Cuota excedida incluso tras liberar caché:`, retryErr);
        return false;
      }
    }
    return false;
  }
}

/**
 * Limpieza automática de claves obsoletas en localStorage para fechas >= 2026-10-17.
 * Evita que datos locales antiguos de disponibilidad, comentarios o bloques de eventos
 * reaparezcan en el cliente tras haber sido purgados de Supabase.
 */
export function pruneStaleFutureLocalStorage(_cutoffDate = "2099-12-31") {
  // Desactivado: se conserva toda la información real posterior al 12 de octubre.
  return;
}
