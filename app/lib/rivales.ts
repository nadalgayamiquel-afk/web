"use client";
import { getRivalesBBDD, saveRivalesBBDD } from "@/app/actions";

export interface RivalConfig {
  id: string;
  nombre: string;
  escudoUrl: string;
}

export function makeClubShieldSvg(initials: string, bg1 = "#1e3a8a", bg2 = "#0284c7", textCol = "#ffffff"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><defs><linearGradient id="g_${initials}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/></linearGradient></defs><path d="M50 4 L90 18 C90 66 50 96 50 96 C50 96 10 66 10 18 Z" fill="url(#g_${initials})" stroke="#ffffff" stroke-width="3"/><path d="M50 11 L82 22 C82 61 50 88 50 88 C50 88 18 61 18 22 Z" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/><text x="50" y="58" font-family="Arial, sans-serif" font-weight="900" font-size="${initials.length > 3 ? 16 : 22}" fill="${textCol}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1">${initials}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}



export const PRIMERA_RFEF_G2_2627: RivalConfig[] = [
  { id: "ad-alcorcon", nombre: "AD ALCORCÓN", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/11596.png" },
  { id: "aguilas-fc", nombre: "ÁGUILAS FC", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/49957.png" },
  { id: "algeciras-cf", nombre: "ALGECIRAS CF", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/3705.png" },
  { id: "antequera-cf", nombre: "ANTEQUERA CF", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/16022.png" },
  { id: "atletico-madrileno", nombre: "ATLÉTICO MADRILEÑO", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/3679.png" },
  { id: "cd-teruel", nombre: "CD TERUEL", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/19301.png" },
  { id: "ce-europa", nombre: "CE EUROPA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/20528.png" },
  { id: "rayo-majadahonda", nombre: "CF RAYO MAJADAHONDA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/13702.png" },
  { id: "fc-cartagena", nombre: "FC CARTAGENA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/7077.png" },
  { id: "nastic", nombre: "GIMNÀSTIC DE TARRAGONA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/5648.png" },
  { id: "hercules-cf", nombre: "HÉRCULES CF", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/7971.png" },
  { id: "juventud-torremolinos", nombre: "JUVENTUD DE TORREMOLINOS CF", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/43454.png" },
  { id: "real-jaen", nombre: "REAL JAÉN CF", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/666.png" },
  { id: "real-madrid-castilla", nombre: "REAL MADRID CASTILLA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/6767.png" },
  { id: "real-murcia", nombre: "REAL MURCIA CF", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/171.png" },
  { id: "real-zaragoza", nombre: "REAL ZARAGOZA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/142.png" },
  { id: "sd-huesca", nombre: "SD HUESCA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/5358.png" },
  { id: "ud-ibiza", nombre: "UD IBIZA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/13241.png" },
  { id: "ue-sant-andreu", nombre: "UE SANT ANDREU", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/12697.png" },
  { id: "villarreal-b", nombre: "VILLARREAL CF B", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/11972.png" }
];


export const DEFAULT_RIVALES: RivalConfig[] = PRIMERA_RFEF_G2_2627;

export const RIVALES_STORAGE_KEY = "custom_rivales_config";

export function normalizeTeamName(str?: string | null): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\(.*?\)/g, "") // Eliminar marcadores o notas entre paréntesis como (2-1), (0-0)
    .replace(/[^a-z0-9]/g, "");
}

export function getStoredRivales(): RivalConfig[] {
  if (typeof window === "undefined") return PRIMERA_RFEF_G2_2627;
  try {
    const defaultMap = new Map(PRIMERA_RFEF_G2_2627.map((d) => [d.id, d.escudoUrl]));
    const nameMap = new Map(PRIMERA_RFEF_G2_2627.map((d) => [normalizeTeamName(d.nombre), d.escudoUrl]));
    const validNorms = new Set(PRIMERA_RFEF_G2_2627.map((d) => normalizeTeamName(d.nombre)));
    const validIds = new Set(PRIMERA_RFEF_G2_2627.map((d) => d.id));

    const saved = localStorage.getItem(RIVALES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filtrar y eliminar estrictamente equipos de otras divisiones o clubes pasados (ej: Manresa, Olot, Prat, etc.)
        const validItems = parsed.filter((item: any) => {
          const norm = normalizeTeamName(item?.nombre || "");
          return validNorms.has(norm) || validIds.has(item?.id);
        });

        const updated = validItems.map((item: any) => {
          const defUrl = defaultMap.get(item.id) || nameMap.get(normalizeTeamName(item.nombre));
          const upperName = (item.nombre || "").toUpperCase();
          if (defUrl) {
            return { ...item, nombre: upperName, escudoUrl: defUrl };
          }
          return { ...item, nombre: upperName };
        });

        const existingIds = new Set(updated.map((p: any) => p.id));
        const missingDefaults = PRIMERA_RFEF_G2_2627.filter((d) => !existingIds.has(d.id));
        const fullList = [...updated, ...missingDefaults];

        localStorage.setItem(RIVALES_STORAGE_KEY, JSON.stringify(fullList));
        return fullList;
      }
    }

    localStorage.setItem(RIVALES_STORAGE_KEY, JSON.stringify(PRIMERA_RFEF_G2_2627));
    return PRIMERA_RFEF_G2_2627;
  } catch (e) {
    console.error("Error leyendo custom_rivales_config:", e);
  }
  return PRIMERA_RFEF_G2_2627;
}

export function saveStoredRivales(rivales: RivalConfig[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RIVALES_STORAGE_KEY, JSON.stringify(rivales));
    window.dispatchEvent(new Event("rivales_updated"));
    // Sincronizar asíncronamente con BBDD
    saveRivalesBBDD(rivales).catch(console.error);
  } catch (e) {
    console.error("Error guardando custom_rivales_config:", e);
  }
}

export async function syncRivalesFromBBDD(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const dbRivales = await getRivalesBBDD();
    if (dbRivales && dbRivales.length > 0) {
      const formatted = dbRivales.map((r: any) => ({
        id: r.id,
        nombre: r.nombre,
        escudoUrl: r.escudo_url || ""
      }));
      localStorage.setItem(RIVALES_STORAGE_KEY, JSON.stringify(formatted));
      window.dispatchEvent(new Event("rivales_updated"));
    }
  } catch (e) {
    console.error("Error sincronizando rivales desde BBDD:", e);
  }
}

export function findRivalEscudoUrl(rivalName: string, rivalesList?: RivalConfig[]): string {
  if (!rivalName || !rivalName.trim()) return "";
  const list = rivalesList && rivalesList.length > 0 ? rivalesList : getStoredRivales();
  const rawTarget = rivalName.trim();
  const target = normalizeTeamName(rawTarget);
  if (!target) return "";

  const sanitizeUrl = (url?: string): string => {
    if (!url) return "";
    const clean = url.trim();
    if (clean.includes("wikimedia.org") || clean.includes("wikipedia.org")) {
      const def = DEFAULT_RIVALES.find(d => normalizeTeamName(d.nombre) === target || target.includes(normalizeTeamName(d.nombre)) || normalizeTeamName(d.nombre).includes(target));
      if (def && def.escudoUrl && !def.escudoUrl.includes("wikimedia.org")) {
        return def.escudoUrl;
      }
    }
    return clean;
  };

  // 1. Coincidencia exacta normalizada
  const exact = list.find((r) => normalizeTeamName(r.nombre) === target);
  if (exact && exact.escudoUrl && exact.escudoUrl.trim()) {
    const s = sanitizeUrl(exact.escudoUrl);
    if (s && !s.includes("wikimedia.org")) return s;
  }

  // 2. Coincidencia de subcadena (si contiene o es contenido)
  const partial = list.find((r) => {
    const rNorm = normalizeTeamName(r.nombre);
    if (rNorm.length < 3) return false;
    return target.includes(rNorm) || rNorm.includes(target);
  });
  if (partial && partial.escudoUrl && partial.escudoUrl.trim()) {
    const s = sanitizeUrl(partial.escudoUrl);
    if (s && !s.includes("wikimedia.org")) return s;
  }

  // 3. Reglas especiales para variaciones de clubes
  if (target === "uesa" || target.includes("andreu")) {
    const r = list.find(x => x.id === "ue-sant-andreu" || x.id === "uesa");
    if (r && r.escudoUrl) return r.escudoUrl;
    return "https://tmssl.akamaized.net/images/wappen/head/12697.png";
  }
  if (target.includes("lleida")) {
    const r = list.find(x => x.id === "atletic-lleida" || x.id === "at-lleida");
    if (r && r.escudoUrl) return r.escudoUrl;
    return "https://tmssl.akamaized.net/images/wappen/head/92869.png";
  }
  if (target.includes("europa")) {
    const r = list.find(x => x.id === "ce-europa" || x.id === "europa");
    if (r && r.escudoUrl) return r.escudoUrl;
    return "https://tmssl.akamaized.net/images/wappen/head/20528.png";
  }
  if (target.includes("hospitalet")) {
    const r = list.find(x => x.id === "ce-l-hospitalet" || x.id === "hospitalet");
    if (r && r.escudoUrl) return r.escudoUrl;
    return "https://tmssl.akamaized.net/images/wappen/head/9477.png";
  }
  if (target.includes("sabadell")) {
    const r = list.find(x => x.id === "ce-sabadell" || x.id === "sabadell");
    if (r && r.escudoUrl) return r.escudoUrl;
    return "https://tmssl.akamaized.net/images/wappen/head/11422.png";
  }
  if (target.includes("grama")) {
    const r = list.find(x => x.id === "fe-grama" || x.id === "grama");
    if (r && r.escudoUrl) return r.escudoUrl;
    return "https://tmssl.akamaized.net/images/wappen/head/61118.png";
  }
  if (target.includes("vilanova")) {
    const r = list.find(x => x.id === "vilanova-cf" || x.id === "vilanova");
    if (r && r.escudoUrl) return r.escudoUrl;
    return "https://tmssl.akamaized.net/images/wappen/head/41558.png";
  }
  if (target.includes("barcelona") || target.includes("barca")) {
    const r = list.find(x => x.id === "fc-barcelona-atletic" || x.id === "barca-atletic");
    if (r && r.escudoUrl) return r.escudoUrl;
  }
  if (target.includes("girona")) {
    const r = list.find(x => x.id === "girona-fc-b" || x.id === "girona-b");
    if (r && r.escudoUrl) return r.escudoUrl;
  }
  if (target.includes("espanyol")) {
    const r = list.find(x => x.id === "rcd-espanyol-b" || x.id === "espanyol-b");
    if (r && r.escudoUrl) return r.escudoUrl;
  }
  if (target.includes("osasuna")) {
    const r = list.find(x => x.id === "ca-osasuna-promesas" || x.id === "osasuna-promesas");
    if (r && r.escudoUrl) return r.escudoUrl;
  }
  if (target.includes("reus")) {
    const r = list.find(x => x.id === "reus-fc-reddis" || x.id === "reus");
    if (r && r.escudoUrl) return r.escudoUrl;
  }
  if (target.includes("olot")) {
    const r = list.find(x => x.id === "ue-olot" || x.id === "olot");
    if (r && r.escudoUrl) return r.escudoUrl;
    return "https://tmssl.akamaized.net/images/wappen/head/38456.png";
  }
  if (target.includes("arnedo")) {
    const r = list.find(x => x.id === "cd-arnedo" || x.id === "arnedo");
    if (r && r.escudoUrl) return r.escudoUrl;
    return "https://tmssl.akamaized.net/images/wappen/head/59757.png";
  }
  if (target.includes("logrones")) {
    if (target.includes("sd")) {
      const r = list.find(x => x.id === "sd-logrones");
      if (r && r.escudoUrl) return r.escudoUrl;
    } else {
      const r = list.find(x => x.id === "ud-logrones-promesas" || x.id === "ud-logrones");
      if (r && r.escudoUrl) return r.escudoUrl;
    }
  }

  // 4. Generar escudo vectorizado elegante en base a iniciales
  const initials = rawTarget
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
  return makeClubShieldSvg(initials || "RIV");
}
