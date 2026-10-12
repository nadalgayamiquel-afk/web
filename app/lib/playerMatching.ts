// Biblioteca centralizada y unificada para coincidencia inteligente de deportistas y fechas
// entre formularios externos (Google Sheets, Microsoft Forms, CSV, Excel) y la base de datos de jugadores.

export interface JugadorMatchItem {
  id: string;
  nombre: string;
  apodo?: string | null;
  equipo?: string | null;
  temporada?: string | null;
}

export function normalizeNameStr(str: string | null | undefined): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

// Mapeo de alias conocidos de los dos clubes (CE Manresa y CE Europa)
export const KNOWN_ALIASES: Record<string, { apodo?: string; nombreWords?: string[] }> = {
  // CE Manresa
  "bussi": { apodo: "busi", nombreWords: ["busquets"] },
  "busi": { apodo: "busi", nombreWords: ["busquets"] },
  "manel busquets": { nombreWords: ["manel", "busquets"] },
  "puli": { apodo: "puli", nombreWords: ["pulido"] },
  "pulido": { apodo: "puli", nombreWords: ["pulido"] },
  "oscar pulido": { nombreWords: ["oscar", "pulido"] },
  "oscar gomez": { nombreWords: ["oscar", "gomez"] },
  "zaka": { apodo: "zaka", nombreWords: ["zakarias"] },
  "zaka khader": { apodo: "zaka", nombreWords: ["zakarias"] },
  "zakarias": { apodo: "zaka", nombreWords: ["zakarias"] },
  "pochito": { apodo: "pochito", nombreWords: ["josep", "lluis", "diaz"] },
  "josep lluis diaz": { apodo: "pochito" },
  "nico olmedo": { nombreWords: ["nicolas", "olmedo"] },
  "nicolas olmedo": { nombreWords: ["nicolas", "olmedo"] },
  "olmedo": { nombreWords: ["olmedo"] },
  "igle": { apodo: "igle", nombreWords: ["iglesias"] },
  "iglesias": { nombreWords: ["iglesias"] },
  "alex iglesias": { nombreWords: ["alex", "iglesias"] },
  "jandro": { apodo: "jandro" },
  "saba": { apodo: "saba" },
  "saba samushia": { apodo: "saba" },
  "daouda": { nombreWords: ["daouda"] },
  "daouda kone": { nombreWords: ["daouda", "kone"] },
  "tebar": { nombreWords: ["tebar"] },
  "ivan tebar": { nombreWords: ["ivan", "tebar"] },
  "borras": { nombreWords: ["borras"] },
  "quim borras": { nombreWords: ["quim", "borras"] },
  "munells": { nombreWords: ["munells"] },
  "roger munells": { nombreWords: ["roger", "munells"] },
  "boukir": { nombreWords: ["boukir"] },
  "oussama boukir": { nombreWords: ["oussama", "boukir"] },
  "badr": { apodo: "badr" },
  "badr el amerani": { nombreWords: ["badr", "amerani"] },
  "dani ferrer": { nombreWords: ["dani", "ferrer"] },
  "aleix diaz": { nombreWords: ["aleix", "diaz"] },
  "eric montes": { nombreWords: ["eric", "montes"] },
  "david momoh": { nombreWords: ["david", "momoh"] },
  "jordi barrera": { nombreWords: ["jordi", "barrera"] },
  "carlos portero": { nombreWords: ["carlos", "portero"] },
  "matheus teixeira": { nombreWords: ["matheus", "teixeira"] },
  "moha ezzarfani": { nombreWords: ["moha", "ezzarfani"] },
  "marc castro": { nombreWords: ["marc", "castro"] },
  "jan molina": { nombreWords: ["jan", "molina"] },
  "jan": { apodo: "jan" },
  "angel vera": { nombreWords: ["angel", "vera"] },

  // CE Europa
  "edo": { nombreWords: ["victor", "edo"] },
  "victor edo": { nombreWords: ["victor", "edo"] },
  "victor morales": { nombreWords: ["victor", "morales"] },
  "sgro": { apodo: "marcel", nombreWords: ["sgro"] },
  "marcel sgro": { nombreWords: ["marcel", "sgro"] },
  "campeny": { nombreWords: ["campeny"] },
  "arnau campeny": { nombreWords: ["arnau", "campeny"] },
  "angles": { nombreWords: ["angles"] },
  "marc angles": { nombreWords: ["marc", "angles"] },
  "cano": { apodo: "cano", nombreWords: ["alex", "cano"] },
  "alex cano": { nombreWords: ["alex", "cano"] },
  "exposito": { apodo: "exposito", nombreWords: ["adri", "exposito"] },
  "adri exposito": { nombreWords: ["adri", "exposito"] },
  "padillo": { apodo: "padillo", nombreWords: ["adria", "padillo"] },
  "adria padillo": { nombreWords: ["adria", "padillo"] },
  "cancelo": { apodo: "cancelo", nombreWords: ["pedro", "cancelo"] },
  "pedro cancelo": { nombreWords: ["pedro", "cancelo"] },
  "cardelus": { apodo: "cardelus", nombreWords: ["cardelus"] },
  "guillem cardelus": { nombreWords: ["guillem", "cardelus"] },
  "teto": { apodo: "teto", nombreWords: ["teto"] },
  "teto martin": { nombreWords: ["teto", "martin"] },
  "tito": { apodo: "tito", nombreWords: ["tolosa"] },
  "tolosa": { apodo: "tito", nombreWords: ["tolosa"] },
  "albert tolosa": { apodo: "tito", nombreWords: ["albert", "tolosa"] },
  "coto": { apodo: "enol", nombreWords: ["enol", "coto"] },
  "enol coto": { nombreWords: ["enol", "coto"] },
  "mascaro": { apodo: "mascaro", nombreWords: ["joan", "mascaro"] },
  "joan mascaro": { nombreWords: ["joan", "mascaro"] },
  "joan puig": { nombreWords: ["joan", "puig"] },
  "gori": { apodo: "gori", nombreWords: ["gori", "gracia"] },
  "gori gracia": { nombreWords: ["gori", "gracia"] },
  "flavio": { apodo: "flavio", nombreWords: ["flavio", "ribeiro"] },
  "flavio ribeiro": { nombreWords: ["flavio", "ribeiro"] },
  "khalid": { apodo: "khalid", nombreWords: ["khalid", "noureddine"] },
  "khalid noureddine": { nombreWords: ["khalid", "noureddine"] },
  "cadenas": { apodo: "joel", nombreWords: ["joel", "cadenas"] },
  "joel cadenas": { nombreWords: ["joel", "cadenas"] },
  "pallares": { nombreWords: ["pallares"] },
  "santi pallares": { nombreWords: ["santi", "pallares"] },
  "ibuki": { apodo: "ibuki", nombreWords: ["ibuki", "nemoto"] },
  "ibuki nemoto": { nombreWords: ["ibuki", "nemoto"] },
  "zayzoun": { nombreWords: ["zayzoun"] },
  "youssef zayzoun": { nombreWords: ["youssef", "zayzoun"] },
  "nil ruiz": { nombreWords: ["nil", "ruiz"] },
  "lucas madrigal": { nombreWords: ["lucas", "madrigal"] },
};

export function scorePlayerMatch(rawInput: string, player: { nombre?: string; apodo?: string | null }): number {
  const cleanInput = normalizeNameStr(rawInput);
  if (!cleanInput) return 0;

  const normNombre = normalizeNameStr(player.nombre);
  const normApodo = normalizeNameStr(player.apodo || "");

  // 1. Coincidencia exacta completa
  if (normNombre === cleanInput) return 100;
  if (normApodo && normApodo === cleanInput) return 98;

  // 2. Diccionario de alias conocidos (comprueba palabras completas para evitar colisiones)
  const alias = KNOWN_ALIASES[cleanInput];
  if (alias) {
    if (alias.apodo && normApodo === alias.apodo) return 96;
    if (alias.nombreWords) {
      const pWords = normNombre.split(/\s+/);
      const allWordsPresent = alias.nombreWords.every((w) => pWords.includes(w));
      if (allWordsPresent) return 95;
    }
  }

  // 3. Tokenización y comprobación de palabras completas (evita que "olmedo" matchee "edo")
  const inputWords = cleanInput.split(/\s+/).filter((w) => w.length >= 2);
  const nameWords = normNombre.split(/\s+/).filter((w) => w.length >= 2);
  const apodoWords = normApodo ? normApodo.split(/\s+/).filter((w) => w.length >= 2) : [];
  const playerWords = [...nameWords, ...apodoWords];

  let exactWordMatches = 0;
  for (const iw of inputWords) {
    if (playerWords.includes(iw)) {
      exactWordMatches++;
    }
  }

  if (exactWordMatches > 0) {
    if (exactWordMatches >= 2) return 85;
    if (exactWordMatches === 1 && inputWords.length === 1) return 70;
    if (exactWordMatches === 1 && inputWords.length > 1) return 40;
  }

  return 0;
}

export function findMatchingJugador<T extends JugadorMatchItem = any>(
  rawName: string,
  allJugadores: T[],
  preferredJugadores: T[] = []
): T | null {
  if (!rawName || !allJugadores || allJugadores.length === 0) return null;

  // 1. Priorizar el equipo activo preferido (evita colisiones cruzadas como Alex Cano vs Alex Iglesias)
  if (preferredJugadores && preferredJugadores.length > 0) {
    let bestPref: T | null = null;
    let bestScorePref = 0;
    for (const j of preferredJugadores) {
      const s = scorePlayerMatch(rawName, j);
      if (s > bestScorePref) {
        bestScorePref = s;
        bestPref = j;
      }
    }
    if (bestPref && bestScorePref >= 50) {
      return bestPref;
    }
  }

  // 2. Buscar en la base de datos completa si no se encontró en el equipo activo
  let best: T | null = null;
  let bestScore = 0;
  for (const j of allJugadores) {
    const s = scorePlayerMatch(rawName, j);
    if (s > bestScore) {
      bestScore = s;
      best = j;
    }
  }

  if (best && bestScore >= 50) {
    return best;
  }
  return null;
}

// Extraer el nombre del deportista de cualquier fila (Google Sheets, Forms, CSV)
export function extractPlayerNameFromRow(r: any): string {
  if (!r) return "";
  const keys = Object.keys(r);

  const isInvalidName = (val: any) => {
    if (val === null || val === undefined) return true;
    const str = String(val).trim();
    if (!str || str === "—" || str === "-" || str === "null" || str === "undefined") return true;
    const norm = normalizeNameStr(str);
    if (norm === "anonimo" || norm === "anonymo" || norm === "anonymous") return true;
    // Ignorar si es fecha u hora pura
    if (/^\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}/.test(str)) return true;
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) return true;
    return false;
  };

  const priorityKeys = [
    "2. JUGADOR", "2. JUGADORA", "2. JUGADOR/A", "2. NOMBRE",
    "NOMBRE1", "NOMBRE 1",
    "JUGADOR", "JUGADORA", "JUGADOR/A", "DEPORTISTA",
    "NOMBRE Y APELLIDOS", "APELLIDOS Y NOMBRE",
    "NOMBRE",
    "RESPUESTAS",
    "_colC"
  ];

  for (const pk of priorityKeys) {
    for (const k of keys) {
      if (k.trim().toUpperCase() === pk) {
        if (!isInvalidName(r[k])) return String(r[k]).trim();
      }
    }
  }

  for (const k of keys) {
    const normK = normalizeNameStr(k);
    if (normK.includes("correo") || normK.includes("email") || normK.includes("hora") || normK.includes("fecha") || normK.includes("marca")) {
      continue;
    }
    if (normK.includes("jugador") || normK.includes("deportista") || normK.includes("nombre") || normK.includes("quien")) {
      if (!isInvalidName(r[k])) {
        return String(r[k]).trim();
      }
    }
  }

  if (keys.length > 2 && !isInvalidName(r[keys[2]])) {
    return String(r[keys[2]]).trim();
  }
  if (keys.length > 1 && !isInvalidName(r[keys[1]])) {
    return String(r[keys[1]]).trim();
  }

  return "";
}

// Extraer cadenas de fecha de una fila de cuestionario
export function extractDatesFromRow(r: any): string[] {
  if (!r) return [];
  const keys = Object.keys(r);
  const found: string[] = [];

  const dateKeys = [
    "1. FECHA", "1. FECHA ", "FECHA", "DATE", "MARCA TEMPORAL", "TIMESTAMP", "HORA DE FINALIZACIÓN", "HORA DE FINALIZACION", "_colB", "_colA"
  ];

  for (const dk of dateKeys) {
    for (const k of keys) {
      if (k.trim().toUpperCase() === dk && r[k]) {
        const val = String(r[k]).trim();
        if (val && !found.includes(val)) found.push(val);
      }
    }
  }

  for (const k of keys) {
    const lk = normalizeNameStr(k);
    if ((lk.includes("fecha") || lk.includes("marca temporal") || lk.includes("timestamp") || lk.includes("finalizacion")) && r[k]) {
      const val = String(r[k]).trim();
      if (val && !found.includes(val)) found.push(val);
    }
  }

  return found;
}

// Comprueba si una cadena de fecha coincide con targetYMD (formato YYYY-MM-DD)
export function isDateMatch(rawStr: any, targetYMD: string): boolean {
  if (!rawStr || !targetYMD) return false;

  // Código de fecha serie de Excel (ej: 46227)
  if (typeof rawStr === "number" && rawStr > 40000) {
    const d = new Date(Math.round((rawStr - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      if (`${y}-${m}-${day}` === targetYMD) return true;
    }
  }

  const strVal = String(rawStr).trim();
  if (/^\d{5}/.test(strVal)) {
    const num = parseFloat(strVal);
    if (num > 40000) {
      const d = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        if (`${y}-${m}-${day}` === targetYMD) return true;
      }
    }
  }

  let clean = strVal;
  if (clean.includes(" ")) clean = clean.split(" ")[0];
  if (clean.includes("T")) clean = clean.split("T")[0];
  if (!clean) return false;

  if (clean === targetYMD) return true;

  const ymdMatch = clean.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})$/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = String(parseInt(ymdMatch[2], 10)).padStart(2, "0");
    const d = String(parseInt(ymdMatch[3], 10)).padStart(2, "0");
    return `${y}-${m}-${d}` === targetYMD;
  }

  const parts = clean.split(/[\/\-\.]/);
  if (parts.length === 3) {
    let p1 = parseInt(parts[0], 10);
    let p2 = parseInt(parts[1], 10);
    let p3 = parseInt(parts[2], 10);
    if (p3 < 100) p3 += 2000;

    const tParts = targetYMD.split("-").map((n) => parseInt(n, 10));
    if (tParts.length === 3) {
      const [tY, tM, tD] = tParts;
      if (p3 === tY) {
        // DD/MM/YYYY
        if (p1 === tD && p2 === tM) return true;
        // MM/DD/YYYY
        if (p1 === tM && p2 === tD) return true;
      }
    }
  }

  return false;
}

export function isRowMatchingDate(r: any, targetYMD: string): boolean {
  if (!targetYMD) return true;
  const dates = extractDatesFromRow(r);
  if (dates.length === 0) return true;
  return dates.some((d) => isDateMatch(d, targetYMD));
}

export function normalizeDateStr(dateRaw: any, targetYMD?: string): string {
  if (!dateRaw) return "";
  if (targetYMD && isDateMatch(dateRaw, targetYMD)) return targetYMD;

  const strVal = String(dateRaw).trim();
  let clean = strVal.split(" ")[0].split("T")[0];
  if (!clean) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  const parts = clean.split(/[\/\-\.]/);
  if (parts.length === 3) {
    let p1 = parseInt(parts[0], 10);
    let p2 = parseInt(parts[1], 10);
    let p3 = parseInt(parts[2], 10);
    if (p3 < 100) p3 += 2000;
    if (p3 > 2000) {
      if (p1 > 12) {
        // p1 es día, p2 es mes
        return `${p3}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
      } else if (p2 > 12) {
        // p2 es día, p1 es mes
        return `${p3}-${String(p1).padStart(2, "0")}-${String(p2).padStart(2, "0")}`;
      } else {
        // Por defecto en España, DD/MM/YYYY
        return `${p3}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
      }
    }
  }

  return clean;
}
