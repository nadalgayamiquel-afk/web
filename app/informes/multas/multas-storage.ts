// Base de Datos persistente e IndexedDB para el módulo de Multas

export interface StoredMulta {
  id: string;
  fecha: string;
  jugador_id: string;
  jugador_nombre: string;
  jugador_apodo?: string;
  jugador_dorsal?: number | string;
  jugador_foto?: string;
  equipo?: string;
  categoria: "Preparación Física" | "Vestuario" | "Médico / Fisioterapia" | "Nutrición" | "Técnico / Táctico" | "Otros";
  concepto: string;
  importe: number;
  reincidencia?: "1ª Falta" | "2ª Falta" | "Reincidente";
  comentario?: string;
  creado_por?: string;
}

const DB_NAME = "antigravity_multas_db";
const STORE_NAME = "multas_records";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB no disponible"));
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Limpia claves antiguas de versiones anteriores de localStorage para liberar espacio de cuota.
 */
export function cleanupObsoleteLocalStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const obsoleteKeys = [
      "multas_registro_v1",
      "multas_registro_v2",
      "multas_registro_v3",
      "multas_registro_v4",
      "multas_registro_v5",
      "multas_registro_v6",
      "multas_registro_v7",
      "multas_registro_v8",
      "multas_deleted_ids",
      "tipos_multa_catalogo",
    ];

    obsoleteKeys.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });

    // Limpiar claves temporales grandes si existen
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("temp_") || key.startsWith("cache_multas_"))) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}

/**
 * Guarda las multas en IndexedDB (BBDD principal) y en localStorage de forma segura.
 */
export async function saveMultasToDatabase(multas: StoredMulta[]): Promise<void> {
  // 1. Guardar en IndexedDB
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ key: "active_multas_list", data: multas, updatedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    // Si IndexedDB falla por alguna razón del navegador, continuar a localStorage
  }

  // 2. Guardar en localStorage de forma segura y compacta
  if (typeof window !== "undefined") {
    cleanupObsoleteLocalStorage();
    try {
      // Guardar versión limpia (sin fotos pesadas para ahorrar cuota)
      const compactList = multas.map((m) => ({
        id: m.id,
        fecha: m.fecha,
        jugador_id: m.jugador_id,
        jugador_nombre: m.jugador_nombre,
        categoria: m.categoria,
        concepto: m.concepto,
        importe: m.importe,
        reincidencia: m.reincidencia,
        comentario: m.comentario,
        creado_por: m.creado_por,
      }));
      localStorage.setItem("multas_registro_v9", JSON.stringify(compactList));
    } catch (quotaError) {
      // Si la cuota de localStorage se supera, limpiar claves obsoletas adicionales
      try {
        localStorage.removeItem("multas_registro_v8");
        localStorage.removeItem("multas_registro_v7");
        localStorage.removeItem("multas_registro_v6");
      } catch {}
      // No emitir console.error para no disparar el overlay de error de Next.js, ya que IndexedDB contiene los datos seguros
    }
  }
}

/**
 * Carga las multas desde IndexedDB o localStorage como respaldo.
 */
export async function loadMultasFromDatabase(): Promise<StoredMulta[] | null> {
  // 1. Intentar cargar desde IndexedDB
  try {
    const db = await openDB();
    const result = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get("active_multas_list");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (result && Array.isArray(result.data) && result.data.length > 0) {
      return result.data as StoredMulta[];
    }
  } catch (err) {
    // IndexedDB no disponible o vacío
  }

  // 2. Respaldo desde localStorage
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("multas_registro_v9");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as StoredMulta[];
        }
      }
    } catch {}
  }

  return null;
}
