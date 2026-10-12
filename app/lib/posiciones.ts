"use client";

/**
 * Módulo de ordenación por Posición Táctica unificada en toda la web:
 * Orden oficial: (POR, LD, LI, CD, CI, PIV, ID, II, ED, DEL, EI)
 */

export const ORDEN_POSICION_TACTICA_LABEL = "Por Posición Táctica";

export function getTacticalPosScore(posStr?: string | null): number {
  if (!posStr) return 99;
  const p = posStr.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1. Portero (POR)
  if (p.includes("PORT") || p.includes("GK") || p === "POR" || p.includes("GUARDAMETA") || p.includes("ARQUERO")) {
    return 1;
  }

  // 2. Lateral Derecho (LD)
  if (
    (p.includes("LATERAL") && (p.includes("DER") || p.includes(" D") || p.endsWith("D"))) ||
    p === "LD" ||
    (p.includes("CARRILERO") && (p.includes("DER") || p.includes(" D") || p.endsWith("D"))) ||
    p === "DEFENSA DERECHO"
  ) {
    return 2;
  }

  // 3. Lateral Izquierdo (LI)
  if (
    (p.includes("LATERAL") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I"))) ||
    p === "LI" ||
    (p.includes("CARRILERO") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I"))) ||
    p === "DEFENSA IZQUIERDO"
  ) {
    return 3;
  }

  // Lateral genérico (entre LD y LI)
  if (p.includes("LATERAL") || p.includes("CARRILERO")) {
    return 2.5;
  }

  // 4. Central Derecho (CD)
  if (
    (p.includes("CENTRAL") && (p.includes("DER") || p.includes(" D") || p.endsWith("D"))) ||
    p === "DCD" ||
    p === "CD"
  ) {
    return 4;
  }

  // 5. Central Izquierdo (CI)
  if (
    (p.includes("CENTRAL") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I"))) ||
    p === "DCI" ||
    p === "CI"
  ) {
    return 5;
  }

  // Central / Defensa genérico
  if (p.includes("CENTRAL") || p.includes("DEFENSA") || p === "DEF") {
    return 4.5;
  }

  // 6. Pivote (PIV)
  if (p.includes("PIVOT") || p.includes("MCD") || p === "PIV" || p.includes("MEDIOCENTRO DEF")) {
    return 6;
  }

  // 7. Interior Derecho (ID)
  if (
    (p.includes("INTERIOR") && (p.includes("DER") || p.includes(" D") || p.endsWith("D"))) ||
    p === "ID" ||
    p === "MD" ||
    (p.includes("MEDIOCENTRO") && (p.includes("DER") || p.includes(" D") || p.endsWith("D")))
  ) {
    return 7;
  }

  // 8. Interior Izquierdo (II)
  if (
    (p.includes("INTERIOR") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I"))) ||
    p === "II" ||
    p === "MI" ||
    (p.includes("MEDIOCENTRO") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I")))
  ) {
    return 8;
  }

  // Interior / Mediocentro genérico
  if (p.includes("INTERIOR") || p.includes("MEDIO") || p.includes("CENTROCAMPISTA") || p === "MC" || p.includes("VOLANTE")) {
    return 7.5;
  }

  // 9. Extremo Derecho (ED)
  if (
    (p.includes("EXTREMO") && (p.includes("DER") || p.includes(" D") || p.endsWith("D"))) ||
    p === "ED" ||
    (p.includes("BANDA") && (p.includes("DER") || p.includes(" D"))) ||
    p === "PUNTA DERECHO"
  ) {
    return 9;
  }

  // 10. Delantero (DEL)
  if (p.includes("DELANTER") || p.includes("ARIETE") || p.includes("PUNTA") || p === "DC" || p === "DEL" || p.includes("CENTRODELANTERO")) {
    return 10;
  }

  // 11. Extremo Izquierdo (EI)
  if (
    (p.includes("EXTREMO") && (p.includes("IZQ") || p.includes(" I") || p.endsWith("I"))) ||
    p === "EI" ||
    (p.includes("BANDA") && (p.includes("IZQ") || p.includes(" I"))) ||
    p === "PUNTA IZQUIERDO"
  ) {
    return 11;
  }

  // Extremo genérico
  if (p.includes("EXTREMO") || p.includes("ATACANTE")) {
    return 9.5;
  }

  return 50;
}

export function comparePlayersByTacticalPosition<
  T extends { posicion?: string | null; nombre?: string; apodo?: string | null; id?: string }
>(a: T, b: T): number {
  if (a.id === "TEAM" || a.nombre === "TEAM") return -1;
  if (b.id === "TEAM" || b.nombre === "TEAM") return 1;

  const scoreA = getTacticalPosScore(a.posicion);
  const scoreB = getTacticalPosScore(b.posicion);
  if (scoreA !== scoreB) return scoreA - scoreB;

  const nameA = a.apodo || a.nombre || "";
  const nameB = b.apodo || b.nombre || "";
  return nameA.localeCompare(nameB, "es", { sensitivity: "base" });
}
