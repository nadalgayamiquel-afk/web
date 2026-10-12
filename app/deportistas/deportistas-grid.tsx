"use client";

import { comparePlayersByTacticalPosition } from "@/app/lib/posiciones";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { createJugador, archiveJugador, unarchiveJugador } from "@/app/actions";

type Jugador = {
  id: string;
  nombre: string;
  apodo: string | null;
  cor_id: string | null;
  dorsal: number | string | null;
  posicion: string | null;
  equipo: string | null;
  temporada: string | null;
  foto_url: string | null;
  activo: boolean | null;
};

type Orden = "nombre" | "dorsal" | "posicion";

const prioridadPosiciones = ["PORTERO", "CENTRAL", "LATERAL", "PIVOTE", "INTERIOR", "EXTREMO", "DELANTERO"];

function normalizarPosicion(posicion: string | null) {
  return (posicion || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function initials(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function DeportistasGrid({ jugadores }: { jugadores: Jugador[] }) {
  const [posicion, setPosicion] = useState("todas");
  const [orden, setOrden] = useState<Orden>("nombre");
  const [busqueda, setBusqueda] = useState("");

  const [equipoFiltro, setEquipoFiltro] = useState<string>("CE Europa");

  useEffect(() => {
    try {
      const savedTeam = localStorage.getItem("active_team");
      if (savedTeam) {
        setEquipoFiltro(savedTeam);
      } else {
        const seasonsRaw = localStorage.getItem("active_seasons");
        if (seasonsRaw) {
          const s = JSON.parse(seasonsRaw);
          if (s.includes("2025/26")) setEquipoFiltro("AE Prat");
          if (s.includes("2026/27")) setEquipoFiltro("CE Europa");
        }
      }
    } catch {}
  }, []);

  // Control del menú desplegable de 3 puntitos por jugador
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Ver/ocultar sección de archivados abajo del todo
  const [showArchivedSection, setShowArchivedSection] = useState(false);

  // Estado del modal "+ Añadir jugador"
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNombre, setNewNombre] = useState("");
  const [newApodo, setNewApodo] = useState("");
  const [newPosicionBase, setNewPosicionBase] = useState("CENTRAL");
  const [newLado, setNewLado] = useState(""); // "" | "DERECHO" | "IZQUIERDO" | "AMBOS"
  const [newDorsal, setNewDorsal] = useState("");
  const [newPiernaHabil, setNewPiernaHabil] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ID de jugador en proceso de archivo/desarchivo
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Estados de Importación de Excel Cuestionarios / Lesiones
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    totalPlayers: number;
    updatedPlayers: string[];
    lesionesCount: number;
    warnings: string[];
  } | null>(null);
  const [showImportResultModal, setShowImportResultModal] = useState(false);

  // Cerrar menú de 3 puntitos al hacer clic fuera
  useEffect(() => {
    function handleClickOutside() {
      setMenuOpenId(null);
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const isPlayerOfTeam = (j: Jugador, teamKey: string) => {
    if (teamKey === "todos") return true;
    const eq = (j.equipo || "").toLowerCase();
    const temp = (j.temporada || "").toLowerCase();
    if (teamKey === "AE Prat" || teamKey === "2025/26") {
      return eq.includes("prat") || temp.includes("25") || temp.includes("2025");
    }
    if (teamKey === "CE Europa" || teamKey.toLowerCase().includes("europa")) {
      return eq.includes("europa");
    }
    if (teamKey === "CE Manresa") {
      return eq.includes("manresa");
    }
    if (teamKey === "2026/27") {
      return eq.includes("europa") || eq.includes("manresa");
    }
    return eq.includes(teamKey.toLowerCase());
  };

  const activos = jugadores.filter((j) => j.activo !== false && isPlayerOfTeam(j, equipoFiltro));
  const archivados = jugadores.filter((j) => j.activo === false && isPlayerOfTeam(j, equipoFiltro));

  const posiciones = Array.from(new Set(activos.map((j) => j.posicion).filter((p): p is string => Boolean(p)))).sort();

  // Jugadores activos tras aplicar búsqueda, posición y orden
  const filtradas = activos
    .filter((j) => posicion === "todas" || j.posicion === posicion)
    .filter((j) => {
      if (!busqueda.trim()) return true;
      const q = busqueda.trim().toLowerCase();
      const dorsalStr = String(j.dorsal || j.cor_id || "");
      return (
        j.nombre.toLowerCase().includes(q) ||
        (j.apodo || "").toLowerCase().includes(q) ||
        dorsalStr.toLowerCase().includes(q) ||
        (j.posicion || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (orden === "posicion") {
        return comparePlayersByTacticalPosition(a, b);
      }

      if (orden === "dorsal") {
        const numA = Number(a.dorsal || a.cor_id || 9999);
        const numB = Number(b.dorsal || b.cor_id || 9999);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return String(a.dorsal || "").localeCompare(String(b.dorsal || ""), "es", { numeric: true });
      }

      return a.nombre.localeCompare(b.nombre, "es", { numeric: true, sensitivity: "base" });
    });

  const handleCreateJugador = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNombre.trim()) {
      setSubmitError("El nombre del jugador es obligatorio");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const fullPosicion = newLado ? `${newPosicionBase} ${newLado}` : newPosicionBase;

      const formData = new FormData();
      formData.append("nombre", newNombre.trim());
      if (newApodo.trim()) formData.append("apodo", newApodo.trim());
      formData.append("posicion", fullPosicion);
      if (newPiernaHabil.trim()) formData.append("pierna_habil", newPiernaHabil.trim());
      if (newDorsal.trim()) {
        formData.append("dorsal", newDorsal.trim());
        formData.append("cor_id", newDorsal.trim());
      }
      if (equipoFiltro && equipoFiltro !== "todos") {
        formData.append("equipo", equipoFiltro);
      }

      await createJugador(formData);

      setNewNombre("");
      setNewApodo("");
      setNewDorsal("");
      setNewLado("");
      setNewPiernaHabil("");
      setShowAddModal(false);
      window.location.reload();
    } catch (err: any) {
      setSubmitError(err.message || "Error al crear el jugador");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchiveJugador = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Estás seguro de archivar a ${nombre}? Pasará a la lista de archivados.`)) return;
    setLoadingId(id);
    try {
      await archiveJugador(id);
      window.location.reload();
    } catch (e: any) {
      alert("Error al archivar: " + e.message);
    } finally {
      setLoadingId(null);
    }
  };

  const handleUnarchiveJugador = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Quieres restaurar a ${nombre} en la plantilla activa?`)) return;
    setLoadingId(id);
    try {
      await unarchiveJugador(id);
      window.location.reload();
    } catch (e: any) {
      alert("Error al restaurar: " + e.message);
    } finally {
      setLoadingId(null);
    }
  };

  // ─── PARSER Y PROCESADOR DE EXCEL: EXCLUSIVAMENTE HOJA 2 (HISTORIAL LESIONAL) SIN DUPLICADOS ───
  const normStr = (s: any) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const findMatchingJugador = (rawName: string) => {
    if (!rawName) return null;
    const clean = normStr(rawName);
    if (!clean) return null;

    // 1. Coincidencia exacta o apodo
    let found = jugadores.find(
      (j) => normStr(j.nombre) === clean || (j.apodo && normStr(j.apodo) === clean)
    );
    if (found) return found;

    // 2. Coincidencia parcial
    found = jugadores.find((j) => {
      const jn = normStr(j.nombre);
      return jn.includes(clean) || clean.includes(jn);
    });
    if (found) return found;

    // 3. Coincidencia por partes de nombre/apellido
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      found = jugadores.find((j) => {
        const jn = normStr(j.nombre);
        return parts.every((p) => jn.includes(p));
      });
    }
    return found || null;
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setIsImporting(true);
    const updatedPlayersSet = new Set<string>();
    const warnings: string[] = [];
    let totalLesionesImported = 0;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array", cellDates: true });
      const sheetNames = workbook.SheetNames;

      if (sheetNames.length === 0) {
        throw new Error("El archivo Excel no contiene ninguna hoja.");
      }

      // Identificar Hoja 2 (Lesiones)
      let lesionSheetIdx = sheetNames.findIndex((n) => normStr(n).includes("lesion"));
      if (lesionSheetIdx === -1) {
        lesionSheetIdx = sheetNames.length >= 2 ? 1 : 0;
      }

      const lesionSheetName = sheetNames[lesionSheetIdx];
      const lesionSheet = workbook.Sheets[lesionSheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(lesionSheet, { header: 1, defval: "" });

      if (rows.length < 2) {
        throw new Error(`La hoja "${lesionSheetName}" no contiene suficientes filas de datos.`);
      }

      // Detectar fila de cabeceras en la Hoja 2
      let headerIdx = 0;
      for (let r = 0; r < Math.min(rows.length, 5); r++) {
        const rCells = rows[r].map((c) => normStr(c));
        if (rCells.some((c) => c.includes("jugador") || c.includes("nombre") || c.includes("deportista") || c.includes("lesion") || c.includes("zona") || c.includes("tipo"))) {
          headerIdx = r;
          break;
        }
      }

      const headers = rows[headerIdx].map((h) => String(h || "").trim());
      const headersNorm = headers.map(normStr);

      let playerColIdx = headersNorm.findIndex(
        (h) => h.includes("jugador") || h.includes("nombre") || h.includes("deportista") || h.includes("atleta")
      );
      if (playerColIdx === -1) playerColIdx = 0;

      // Ignorar columnas de timestamp / marca temporal de envío del formulario
      const isTimestampHeader = (h: string) => {
        const norm = normStr(h);
        return (
          norm.includes("marca temporal") ||
          norm.includes("timestamp") ||
          norm.includes("hora") ||
          norm.includes("respuesta") ||
          norm.includes("envio") ||
          norm.includes("valoracion") ||
          norm.includes("cuestionario") ||
          norm.includes("registro")
        );
      };

      // Buscar columna real de fecha/año de la lesión (NO la marca temporal del formulario)
      let fechaColIdx = headersNorm.findIndex(
        (h) => !isTimestampHeader(h) && (
          h.includes("ano lesion") ||
          h.includes("año lesion") ||
          h.includes("fecha lesion") ||
          h.includes("año de la lesion") ||
          h.includes("temporada") ||
          h.includes("cuando fue") ||
          h.includes("momento lesion") ||
          h.includes("año") ||
          h.includes("ano")
        )
      );
      if (fechaColIdx === -1) {
        fechaColIdx = headersNorm.findIndex(
          (h) => !isTimestampHeader(h) && (h.includes("fecha") || h.includes("dia"))
        );
      }
      const zonaColIdx = headersNorm.findIndex((h) => h.includes("zona") || h.includes("region") || h.includes("musculo") || h.includes("articulac") || h.includes("localiz"));
      const tipoColIdx = headersNorm.findIndex((h) => h.includes("tipo") || h.includes("tejido") || h.includes("diagnost") || h.includes("patologia"));
      const diasColIdx = headersNorm.findIndex((h) => h.includes("dias") || h.includes("tiempo") || h.includes("duracion") || h.includes("baja"));
      const estadoColIdx = headersNorm.findIndex((h) => h.includes("estado") || h.includes("alta") || h.includes("recuperad") || h.includes("situacion"));
      const contactoColIdx = headersNorm.findIndex((h) => h.includes("contacto") || h.includes("mecanismo"));
      const contextoColIdx = headersNorm.findIndex((h) => h.includes("contexto") || h.includes("momento") || h.includes("partido") || h.includes("entreno"));

      const standardColIndices = new Set([playerColIdx, fechaColIdx, zonaColIdx, tipoColIdx, diasColIdx, estadoColIdx, contactoColIdx, contextoColIdx].filter((i) => i >= 0));

      // Cargar y limpiar registros globales existentes
      let globalDetailedList: any[] = [];
      try {
        const raw = localStorage.getItem("lesiones_registro_detallado_v1");
        if (raw) globalDetailedList = JSON.parse(raw);
      } catch {}

      const getLesionKey = (jId: string, f: string, z: string, t: string, c: string) =>
        `${jId}_${normStr(f)}_${normStr(z)}_${normStr(t)}_${normStr(c).slice(0, 60)}`;

      // Set global de claves ya existentes
      const existingGlobalKeys = new Set<string>();
      const deduplicatedGlobalList: any[] = [];
      globalDetailedList.forEach((r) => {
        const k = getLesionKey(r.jugador_id || "", r.fecha || "", r.region_corporal || "", r.tejido || "", r.comentario || "");
        if (!existingGlobalKeys.has(k)) {
          existingGlobalKeys.add(k);
          deduplicatedGlobalList.push(r);
        }
      });

      const playerExtrasToUpdate: Record<string, any> = {};

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        const rawPlayerName = String(row[playerColIdx] || "").trim();
        if (!rawPlayerName) continue;

        const jugadorMatch = findMatchingJugador(rawPlayerName);
        if (!jugadorMatch) {
          warnings.push(`No se encontró coincidencia en plantilla para "${rawPlayerName}".`);
          continue;
        }

        // Extraer fecha (si no hay fecha queda en blanco "", si solo está el año se pone el año)
        const rawFecha: any = fechaColIdx >= 0 ? row[fechaColIdx] : null;
        let fechaVal = "";
        if (rawFecha instanceof Date) {
          fechaVal = rawFecha.toISOString().split("T")[0];
        } else if (rawFecha !== null && rawFecha !== undefined) {
          const s = String(rawFecha).trim();
          if (s && s !== "-" && s !== "—" && s.toLowerCase() !== "n/a" && s.toLowerCase() !== "no") {
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
              fechaVal = s;
            } else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(s)) {
              const parts = s.split(/[\/\-]/);
              fechaVal = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
            } else if (/^(19|20)\d{2}$/.test(s)) {
              // Solo año (ej: 2023, 2024) -> queda solo el año
              fechaVal = s;
            } else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2}$/.test(s)) {
              const parts = s.split(/[\/\-]/);
              fechaVal = `20${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
            } else {
              // Buscar si hay un año de 4 dígitos en el texto
              const yearMatch = s.match(/\b(19|20\d{2})\b/);
              if (yearMatch) {
                fechaVal = yearMatch[1];
              } else {
                fechaVal = s;
              }
            }
          }
        }

        // Si la fecha extraída es la de envío del cuestionario (30-08-2026), se deja en blanco
        if (fechaVal === "2026-08-30" || fechaVal === "30-08-2026" || fechaVal === "30/08/2026" || fechaVal.startsWith("2026-08-30") || fechaVal === "2026-08-29" || fechaVal === "2026-08-31") {
          fechaVal = "";
        }

        const zonaVal = zonaColIdx >= 0 && row[zonaColIdx] ? String(row[zonaColIdx]).trim() : "Zona no especificada";
        const tipoVal = tipoColIdx >= 0 && row[tipoColIdx] ? String(row[tipoColIdx]).trim() : "Lesión";
        const rawDias = diasColIdx >= 0 ? Number(String(row[diasColIdx]).replace(/[^0-9.]/g, "")) : 0;
        const diasVal = isNaN(rawDias) ? 0 : rawDias;
        const estadoVal = estadoColIdx >= 0 && String(row[estadoColIdx]).toLowerCase().includes("baja") ? "Baja Médica" : "Alta Médica";
        const contactoVal = contactoColIdx >= 0 && row[contactoColIdx] ? String(row[contactoColIdx]).trim() : "Sin contacto";
        const contextoVal = contextoColIdx >= 0 && row[contextoColIdx] ? String(row[contextoColIdx]).trim() : "Entrenamiento";

        // Redactar frases descriptivas de preguntas extra
        const extraSentences: string[] = [];
        headers.forEach((h, colI) => {
          if (!standardColIndices.has(colI) && h.trim()) {
            const cellVal = String(row[colI] ?? "").trim();
            if (cellVal && cellVal !== "-" && cellVal !== "—" && cellVal.toLowerCase() !== "no" && cellVal.toLowerCase() !== "n/a") {
              extraSentences.push(`${h}: ${cellVal}.`);
            }
          }
        });

        const finalComentario = extraSentences.join(" ");
        const lesionKey = getLesionKey(jugadorMatch.id, fechaVal, zonaVal, tipoVal, finalComentario);

        // Si ya existe exactamente esta lesión para este jugador, actualizarla sin duplicar
        if (existingGlobalKeys.has(lesionKey)) {
          continue; // Ya está registrada
        }
        existingGlobalKeys.add(lesionKey);

        const newLesionEntry = {
          id: `les_imp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          fechaInicio: fechaVal,
          fechaAlta: estadoVal === "Alta Médica" ? fechaVal : "",
          tipo: tipoVal,
          zona: zonaVal,
          contexto: contextoVal,
          contacto: contactoVal,
          recurrencia: "Nueva",
          gravedad: diasVal <= 7 ? "Leve (1 a 7)" : diasVal <= 28 ? "Moderada (8 a 28)" : "Grave (>28)",
          diasBaja: diasVal,
          estado: estadoVal,
          comentario: finalComentario,
          isGlobalRecord: true,
        };

        // Añadir a lista global deduplicada
        deduplicatedGlobalList.unshift({
          id: newLesionEntry.id,
          jugador_id: jugadorMatch.id,
          jugador_nombre: jugadorMatch.nombre,
          fecha: fechaVal,
          fecha_alta: newLesionEntry.fechaAlta,
          region_corporal: zonaVal,
          tejido: tipoVal,
          contexto: contextoVal,
          contacto: contactoVal,
          recurrencia: "Nueva",
          gravedad: newLesionEntry.gravedad,
          dias_baja: diasVal,
          resultado: diasVal === 0 ? "Sin baja" : "Baja",
          estado: estadoVal,
          comentario: finalComentario,
        });

        // Cargar y actualizar player_extra con deduplicación
        if (!playerExtrasToUpdate[jugadorMatch.id]) {
          const saved = localStorage.getItem(`player_extra_${jugadorMatch.id}`);
          playerExtrasToUpdate[jugadorMatch.id] = saved ? JSON.parse(saved) : {};
        }

        const currentLesiones: any[] = playerExtrasToUpdate[jugadorMatch.id].lesiones || [];
        const existingPlayerLesionKeys = new Set(
          currentLesiones.map((l) => getLesionKey(jugadorMatch.id, l.fechaInicio || "", l.zona || "", l.tipo || "", l.comentario || ""))
        );

        if (!existingPlayerLesionKeys.has(lesionKey)) {
          playerExtrasToUpdate[jugadorMatch.id].lesiones = [newLesionEntry, ...currentLesiones];
        }

        updatedPlayersSet.add(jugadorMatch.nombre);
        totalLesionesImported++;
      }

      // Guardar cambios en localStorage
      Object.keys(playerExtrasToUpdate).forEach((jId) => {
        localStorage.setItem(`player_extra_${jId}`, JSON.stringify(playerExtrasToUpdate[jId]));
      });

      localStorage.setItem("lesiones_registro_detallado_v1", JSON.stringify(deduplicatedGlobalList));

      setImportSummary({
        totalPlayers: updatedPlayersSet.size,
        updatedPlayers: Array.from(updatedPlayersSet),
        lesionesCount: totalLesionesImported,
        warnings,
      });
      setShowImportResultModal(true);
    } catch (err: any) {
      alert("Error al procesar la Hoja 2 de Lesiones: " + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      {/* BARRA DE FILTROS Y CONTROLES */}
      <div className="athletes-filters" aria-label="Filtrar y ordenar deportistas">
        {/* SELECTOR DE CLUB / TEMPORADA */}
        <label style={{ minWidth: "160px" }}>
          <span>Club / Temporada</span>
          <select
            value={equipoFiltro}
            onChange={(e) => {
              const val = e.target.value;
              setEquipoFiltro(val);
              if (typeof window !== "undefined") {
                if (val === "CE Europa") {
                  localStorage.setItem("active_team", "CE Europa");
                  localStorage.setItem("active_seasons", JSON.stringify(["2026/27"]));
                }
              }
            }}
            style={{ fontWeight: 800, color: equipoFiltro === "CE Europa" ? "#1e3a8a" : "#334155" }}
          >
            <option value="CE Europa">CE Europa (2026/27)</option>
            <option value="todos">Todos los clubes</option>
          </select>
        </label>

        {/* BÚSQUEDA DE JUGADOR */}
        <label style={{ flex: "1", minWidth: "180px" }}>
          <span>Búsqueda</span>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Buscar por nombre o dorsal..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{
                width: "100%",
                border: "1px solid #dce3de",
                borderRadius: "5px",
                padding: "9px 28px 9px 10px",
                color: "var(--ink)",
                background: "#fbfcfa",
                font: "inherit",
                fontSize: "11px",
                outline: "none",
              }}
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda("")}
                style={{
                  position: "absolute",
                  right: "8px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "#9aa3a3",
                  fontSize: "12px",
                }}
              >
                ✕
              </button>
            )}
          </div>
        </label>

        {/* POSICIÓN */}
        <label>
          <span>Posición</span>
          <select value={posicion} onChange={(event) => setPosicion(event.target.value)}>
            <option value="todas">Todas las posiciones</option>
            {posiciones.map((opcion) => (
              <option key={opcion} value={opcion}>{opcion}</option>
            ))}
          </select>
        </label>

        {/* ORDENAR POR */}
        <label>
          <span>Ordenar por</span>
          <select value={orden} onChange={(event) => setOrden(event.target.value as Orden)}>
            <option value="nombre">Orden alfabético</option>
            <option value="dorsal">Dorsal</option>
            <option value="posicion">Por Posición Táctica</option>
          </select>
        </label>

        {/* BOTÓN 📁 IMPORTAR EXCEL */}
        <label>
          <span style={{ visibility: "hidden" }}>Importar</span>
          <button
            type="button"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 14px",
              borderRadius: "5px",
              border: "1px solid #c7d2fe",
              background: "#e0e7ff",
              color: "#3730a3",
              fontSize: "11px",
              fontWeight: 800,
              cursor: isImporting ? "wait" : "pointer",
              height: "35px",
              whiteSpace: "nowrap",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              transition: "all 0.15s ease",
            }}
            title="Importar historial lesional de los deportistas desde la Hoja 2 de Excel (.xlsx)"
          >
            <span style={{ fontSize: "13px" }}>📁</span>
            <span>{isImporting ? "Procesando Hoja 2..." : "Importar Excel (Lesiones)"}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleExcelUpload}
          />
        </label>

        {/* BOTÓN + AÑADIR JUGADOR (A LA ALTURA DE LOS FILTROS) */}
        <label>
          <span style={{ visibility: "hidden" }}>Añadir</span>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 14px",
              borderRadius: "5px",
              border: "none",
              background: "#0284c7",
              color: "#ffffff",
              fontSize: "11px",
              fontWeight: 800,
              cursor: "pointer",
              height: "35px",
              whiteSpace: "nowrap",
              boxShadow: "0 1px 3px rgba(2, 132, 199, 0.3)",
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 900 }}>+</span>
            <span>Añadir jugador</span>
          </button>
        </label>

        <span className="filter-count" style={{ alignSelf: "end" }}>
          {filtradas.length} {filtradas.length === 1 ? "jugador" : "jugadores"}
        </span>
      </div>

      {/* GRID DE JUGADORES ACTIVOS */}
      {filtradas.length === 0 ? (
        <section className="athletes-empty">
          <span className="empty-icon">—</span>
          <h2>No hay coincidencias</h2>
          <p>Prueba con otra posición o término de búsqueda para ver la plantilla.</p>
        </section>
      ) : (
        <section className="athletes-grid" aria-label="Jugadores activos">
          {filtradas.map((jugador) => (
            <div key={jugador.id} style={{ position: "relative" }}>
              {/* BOTÓN DE 3 PUNTITOS MUY PEQUEÑOS EN ARRIBA A LA DERECHA */}
              <div style={{ position: "absolute", top: "10px", right: "10px", zIndex: 30 }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuOpenId(menuOpenId === jugador.id ? null : jugador.id);
                  }}
                  title="Opciones del jugador"
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#475569",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "13px",
                    fontWeight: 900,
                    cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ⋮
                </button>

                {menuOpenId === jugador.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      right: 0,
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
                      padding: "4px",
                      zIndex: 100,
                      minWidth: "130px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpenId(null);
                        handleArchiveJugador(jugador.id, jugador.nombre);
                      }}
                      disabled={loadingId === jugador.id}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#dc2626",
                        background: "transparent",
                        border: "none",
                        textAlign: "left",
                        borderRadius: "4px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#fff1f2")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span>📦</span> {loadingId === jugador.id ? "Archivando..." : "Archivar jugador"}
                    </button>
                  </div>
                )}
              </div>

              <Link className="athlete-card" href={`/deportistas/${jugador.id}`}>
                <div className="athlete-card-top">
                  <div className="athlete-avatar">
                    {jugador.foto_url ? (
                      <img src={jugador.foto_url || undefined} alt={`Foto de ${(jugador.nombre || '').toUpperCase()}`} style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "top" }} />
                    ) : (
                      initials(jugador.nombre)
                    )}
                  </div>
                </div>
                <div className="athlete-card-copy">
                  <span className="athlete-position">{jugador.posicion || "Posición sin indicar"}</span>
                  <h2>{(jugador.nombre || '').toUpperCase()}</h2>
                  <p>{(jugador.apodo || jugador.equipo || "Perfil individual").toUpperCase()}</p>
                </div>
                <div className="athlete-card-meta">
                  <span><i /> Disponible</span>
                  <small>{jugador.dorsal ? `Dorsal #${jugador.dorsal}` : jugador.cor_id ? `Dorsal #${jugador.cor_id}` : "Sin dorsal"}</small>
                </div>
              </Link>
            </div>
          ))}
        </section>
      )}

      {/* SECCIÓN/BOTÓN PARA ACCEDER A JUGADORES ARCHIVADOS ABAJO DEL TODO */}
      <div style={{ maxWidth: "1240px", margin: "36px auto 0", textAlign: "center", borderTop: "1px solid #e2e8f0", paddingTop: "24px" }}>
        <button
          type="button"
          onClick={() => setShowArchivedSection((prev) => !prev)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "9px 18px",
            borderRadius: "8px",
            border: "1px solid #cbd5e1",
            background: showArchivedSection ? "#0f172a" : "#ffffff",
            color: showArchivedSection ? "#ffffff" : "#475569",
            fontSize: "12px",
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            transition: "all 0.15s ease",
          }}
        >
          <span>📦</span>
          <span>{showArchivedSection ? "Ocultar jugadores archivados" : `Ver jugadores archivados (${archivados.length})`}</span>
        </button>

        {showArchivedSection && (
          <div style={{ marginTop: "24px", textAlign: "left" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h3 style={{ margin: 0, fontSize: "13px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Jugadores archivados ({archivados.length})
              </h3>
            </div>

            {archivados.length === 0 ? (
              <p style={{ fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>No hay ningún jugador archivado actualmente.</p>
            ) : (
              <section className="athletes-grid" aria-label="Jugadores archivados">
                {archivados.map((jugador) => (
                  <div key={jugador.id} style={{ position: "relative" }}>
                    <button
                      type="button"
                      onClick={() => handleUnarchiveJugador(jugador.id, jugador.nombre)}
                      disabled={loadingId === jugador.id}
                      title="Restaurar jugador a la plantilla activa"
                      style={{
                        position: "absolute",
                        top: "10px",
                        right: "10px",
                        zIndex: 10,
                        padding: "4px 8px",
                        borderRadius: "6px",
                        border: "1px solid #bbf7d0",
                        background: "#f0fdf4",
                        color: "#166534",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        cursor: loadingId === jugador.id ? "not-allowed" : "pointer",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      }}
                    >
                      {loadingId === jugador.id ? "..." : "🔄 Restaurar"}
                    </button>

                    <Link className="athlete-card" href={`/deportistas/${jugador.id}`} style={{ opacity: 0.8 }}>
                      <div className="athlete-card-top">
                        <div className="athlete-avatar" style={{ filter: "grayscale(80%)" }}>
                          {jugador.foto_url ? (
                            <img src={jugador.foto_url || undefined} alt={`Foto de ${(jugador.nombre || '').toUpperCase()}`} style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "top" }} />
                          ) : (
                            initials(jugador.nombre)
                          )}
                        </div>
                      </div>
                      <div className="athlete-card-copy">
                        <span className="athlete-position">{jugador.posicion || "Posición sin indicar"}</span>
                        <h2>{(jugador.nombre || '').toUpperCase()}</h2>
                        <p>{(jugador.apodo || jugador.equipo || "Archivado").toUpperCase()}</p>
                      </div>
                      <div className="athlete-card-meta">
                        <span><i style={{ background: "#94a3b8" }} /> Archivado</span>
                        <small>{jugador.dorsal ? `Dorsal #${jugador.dorsal}` : jugador.cor_id ? `Dorsal #${jugador.cor_id}` : "Sin dorsal"}</small>
                      </div>
                    </Link>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </div>

      {/* MODAL PARA AÑADIR NUEVO JUGADOR */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "480px",
              width: "100%",
              boxShadow: "0 20px 40px -10px rgba(0,0,0,0.25)",
              border: "1px solid #cbd5e1",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid #f1f5f9", paddingBottom: "10px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
                ➕ Añadir nuevo jugador
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: "none", border: "none", fontSize: "16px", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            {submitError && (
              <div style={{ padding: "8px 12px", borderRadius: "6px", background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", fontSize: "12px", marginBottom: "14px", fontWeight: 600 }}>
                {submitError}
              </div>
            )}

            <form onSubmit={handleCreateJugador} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "#334155", marginBottom: "4px", textTransform: "uppercase" }}>
                  Nombre y Apellidos *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Carlos Martínez"
                  value={newNombre}
                  onChange={(e) => setNewNombre(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "#334155", marginBottom: "4px", textTransform: "uppercase" }}>
                    Apodo / Nombre corto
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Charlie"
                    value={newApodo}
                    onChange={(e) => setNewApodo(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "#334155", marginBottom: "4px", textTransform: "uppercase" }}>
                    Dorsal
                  </label>
                  <input
                    type="number"
                    placeholder="Ej. 10"
                    value={newDorsal}
                    onChange={(e) => setNewDorsal(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* DOS CAMPOS DE TEXTO ESCRIBIBLES PARA LA POSICIÓN (POSICIÓN BASE + LATERALIDAD) */}
              <div style={{ display: "flex", gap: "10px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "#334155", marginBottom: "4px", textTransform: "uppercase" }}>
                    Posición Base *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. LATERAL, EXTREMO..."
                    value={newPosicionBase}
                    onChange={(e) => setNewPosicionBase(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "#334155", marginBottom: "4px", textTransform: "uppercase" }}>
                    Lateralidad
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. DERECHO, IZQUIERDO..."
                    value={newLado}
                    onChange={(e) => setNewLado(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    color: "#475569",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "6px",
                    border: "none",
                    background: isSubmitting ? "#94a3b8" : "#0284c7",
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 800,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                  }}
                >
                  {isSubmitting ? "Guardando..." : "Guardar jugador"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL DE RESULTADO DE IMPORTACIÓN DE EXCEL (HOJA 2 LESIONES) */}
      {showImportResultModal && importSummary && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setShowImportResultModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              border: "1px solid #cbd5e1",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              maxWidth: "560px",
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "24px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
                🩹
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#0f172a" }}>
                  Importación de Historial Lesional (Hoja 2)
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                  Lesiones registradas con éxito en los historiales individuales y globales.
                </p>
              </div>
            </div>

            {/* Tarjetas de Estadísticas */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "20px", fontWeight: 900, color: "#1e3a8a" }}>{importSummary.totalPlayers}</div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>Deportistas con lesiones</div>
              </div>
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "20px", fontWeight: 900, color: "#dc2626" }}>{importSummary.lesionesCount}</div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#991b1b" }}>Total lesiones añadidas</div>
              </div>
            </div>

            {/* Lista de Jugadores Actualizados */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "11px", fontWeight: 800, color: "#334155", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                Deportistas actualizados en Historial Lesional:
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "140px", overflowY: "auto", padding: "6px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                {importSummary.updatedPlayers.map((name) => (
                  <span key={name} style={{ fontSize: "11px", fontWeight: 700, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", padding: "3px 8px", borderRadius: "4px" }}>
                    🩹 {name}
                  </span>
                ))}
              </div>
            </div>

            {/* Advertencias si las hay */}
            {importSummary.warnings.length > 0 && (
              <div style={{ marginBottom: "16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 12px" }}>
                <div style={{ fontSize: "11px", fontWeight: 800, color: "#92400e", marginBottom: "4px" }}>⚠️ Avisos:</div>
                <div style={{ fontSize: "10.5px", color: "#b45309", maxHeight: "80px", overflowY: "auto" }}>
                  {importSummary.warnings.map((w, idx) => (
                    <div key={idx}>{w}</div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => {
                  setShowImportResultModal(false);
                  window.location.reload();
                }}
                style={{
                  padding: "9px 18px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#1e3a8a",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Aceptar y Actualizar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}