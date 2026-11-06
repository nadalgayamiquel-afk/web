"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { syncGpsDatabaseWeb, getAllGpsDatos } from "@/app/actions";
import { DEFAULT_EXTERNAL_LINKS } from "@/app/lib/externalLinks";

interface Props {
  initialRecords?: any[];
  jugadores?: any[];
}

export default function GpsBBDDClient({ initialRecords = [], jugadores = [] }: Props) {
  const [records, setRecords] = useState<any[]>(initialRecords);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [externalUrl, setExternalUrl] = useState<string>(DEFAULT_EXTERNAL_LINKS.gps.url);
  const [showIframe, setShowIframe] = useState<boolean>(false);

  // Filtros
  const [searchText, setSearchText] = useState<string>("");
  const [selectedJugador, setSelectedJugador] = useState<string>("TODOS");
  const [selectedMd, setSelectedMd] = useState<string>("TODOS");
  const [selectedTipo, setSelectedTipo] = useState<string>("TODOS");
  const [fechaDesde, setFechaDesde] = useState<string>("");
  const [fechaHasta, setFechaHasta] = useState<string>("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Cargar enlace de BBDD GPS configurado en localStorage si existe
  useEffect(() => {
    try {
      const savedLinks = localStorage.getItem("external_database_links_v1");
      if (savedLinks) {
        const parsed = JSON.parse(savedLinks);
        if (parsed?.gps?.url) {
          setExternalUrl(parsed.gps.url.trim());
        }
      }
    } catch {}
  }, []);

  // Cargar o fusionar con datos en localStorage
  useEffect(() => {
    try {
      const savedGps = localStorage.getItem("gps_datos_map_v1");
      if (savedGps) {
        const parsed = JSON.parse(savedGps);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecords((prev) => {
            const map = new Map();
            prev.forEach((r) => map.set(`${r.jugador_id}_${r.fecha}`, r));
            parsed.forEach((r: any) => map.set(`${r.jugador_id}_${r.fecha}`, r));
            return Array.from(map.values());
          });
        }
      }
    } catch {}
  }, []);

  const handleSyncGps = async () => {
    setIsSyncing(true);
    showToast("⚡ Sincronizando con la Base de Datos GPS externa (Google Sheets)...");
    try {
      const res = await syncGpsDatabaseWeb();
      if (res && res.success) {
        const fresh = await getAllGpsDatos();
        if (fresh && fresh.length > 0) {
          setRecords(fresh);
          try {
            localStorage.setItem("gps_datos_map_v1", JSON.stringify(fresh));
          } catch {}
        }
        const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
        showToast(`✓ BBDD GPS sincronizada: ${res.totalRecords} registros de ${res.datesProcessed?.length || 0} sesiones (${now})`);
      } else {
        showToast("⚠️ " + (res?.error || "Error al sincronizar con la BBDD externa"));
      }
    } catch (e: any) {
      showToast("⚠️ Error: " + (e?.message || "No se pudo sincronizar"));
    } finally {
      setIsSyncing(false);
    }
  };

  // Mapa de jugadores para nombres legibles
  const playerMap = useMemo(() => {
    const map = new Map<string, any>();
    jugadores.forEach((j) => map.set(j.id, j));
    return map;
  }, [jugadores]);

  // Lista de MDs únicos
  const uniqueMds = useMemo(() => {
    const s = new Set<string>();
    records.forEach((r) => {
      if (r.match_day) s.add(r.match_day);
    });
    return Array.from(s).sort();
  }, [records]);

  // Fechas únicas
  const uniqueDates = useMemo(() => {
    const s = new Set<string>();
    records.forEach((r) => {
      if (r.fecha) s.add(r.fecha);
    });
    return Array.from(s).sort((a, b) => b.localeCompare(a));
  }, [records]);

  // Registros enriquecidos y filtrados
  const filteredRecords = useMemo(() => {
    return records
      .map((r) => {
        const p = playerMap.get(r.jugador_id);
        const pName = p ? (p.apodo || p.nombre || "Jugador") : "Jugador";
        const pDorsal = p?.cor_id || p?.dorsal || "";
        const m = r.metricas || {};

        return {
          ...r,
          playerName: pName,
          playerDorsal: pDorsal,
          distanciaTotal: Math.round(Number(r.distancia_total ?? m["Distance(m)"] ?? m.distancia_total ?? 0)),
          distanciaMin: Number(m["Distance/min"] ?? m.distancia_min ?? (r.duracion_min > 0 ? (r.distancia_total / r.duracion_min) : 0)).toFixed(1),
          hsr: Math.round(Number(r.distancia_z4 ?? m["HSR Abs (m)"] ?? m.hsr ?? 0)),
          maxSpeed: Number(r.max_speed ?? m["MAX Speed(km/h)"] ?? m.max_speed ?? 0).toFixed(1),
          sprints: Math.round(Number(r.num_sprints ?? m["Sprints Count"] ?? m.sprints ?? 0)),
          playerLoad: Number(r.player_load ?? m["Player Load"] ?? m.player_load ?? 0).toFixed(1),
          hmld: Math.round(Number(m["HMLD(m)"] ?? m.HMLD ?? m.hmld ?? 0)),
          acc3: Math.round(Number(r.aceleraciones ?? m["Accs Count"] ?? m.aceleraciones ?? 0)),
          dec3: Math.round(Number(r.desaceleraciones ?? m["Decs Count"] ?? m.desaceleraciones ?? 0)),
          duracionMin: Number(r.duracion_min ?? m["Duration(min)"] ?? r.duracion ?? 0).toFixed(1),
        };
      })
      .filter((r) => {
        if (selectedJugador !== "TODOS" && r.jugador_id !== selectedJugador) return false;
        if (selectedMd !== "TODOS" && r.match_day !== selectedMd) return false;
        if (selectedTipo !== "TODOS" && (r.tipo_sesion || "").toUpperCase() !== selectedTipo.toUpperCase()) return false;
        if (fechaDesde && r.fecha < fechaDesde) return false;
        if (fechaHasta && r.fecha > fechaHasta) return false;
        if (searchText.trim()) {
          const q = searchText.toLowerCase().trim();
          const pMatch = r.playerName.toLowerCase().includes(q);
          const dMatch = (r.fecha || "").includes(q);
          const mdMatch = (r.match_day || "").toLowerCase().includes(q);
          const sMatch = (r.tipo_sesion || "").toLowerCase().includes(q);
          if (!pMatch && !dMatch && !mdMatch && !sMatch) return false;
        }
        return true;
      })
      .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || a.playerName.localeCompare(b.playerName));
  }, [records, playerMap, selectedJugador, selectedMd, selectedTipo, fechaDesde, fechaHasta, searchText]);

  const handleExportExcel = () => {
    const exportData = filteredRecords.map((r) => ({
      Fecha: r.fecha,
      MD: r.match_day || "",
      Tipo_Sesion: r.tipo_sesion || "",
      Jugador: r.playerName,
      Dorsal: r.playerDorsal || "",
      "Distancia Total (m)": r.distanciaTotal,
      "Distancia / Min (m/min)": r.distanciaMin,
      "HSR Abs (m)": r.hsr,
      "Vel Max (km/h)": r.maxSpeed,
      "Sprints (+24 km/h)": r.sprints,
      "Player Load": r.playerLoad,
      "HMLD (m)": r.hmld,
      "Acc +3 m/s²": r.acc3,
      "Dec +3 m/s²": r.dec3,
      "Duracion (min)": r.duracionMin,
      "Tipo Registro": r.es_simulado ? "SIMULADO" : "REAL",
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BBDD_GPS");
    XLSX.writeFile(wb, `BBDD_GPS_${new Date().toISOString().split("T")[0]}.xlsx`);
    showToast("✓ Archivo Excel de BBDD GPS exportado");
  };

  const handleExportCSV = () => {
    const headers = [
      "Fecha",
      "MD",
      "Tipo_Sesion",
      "Jugador",
      "Dorsal",
      "Distancia_Total_m",
      "Distancia_Min",
      "HSR_Abs_m",
      "Vel_Max_kmh",
      "Sprints",
      "Player_Load",
      "HMLD_m",
      "Acc3",
      "Dec3",
      "Duracion_min",
      "Tipo_Registro",
    ];

    const lines = filteredRecords.map((r) => [
      r.fecha,
      r.match_day || "",
      r.tipo_sesion || "",
      `"${r.playerName.replace(/"/g, '""')}"`,
      r.playerDorsal || "",
      r.distanciaTotal,
      r.distanciaMin,
      r.hsr,
      r.maxSpeed,
      r.sprints,
      r.playerLoad,
      r.hmld,
      r.acc3,
      r.dec3,
      r.duracionMin,
      r.es_simulado ? "SIMULADO" : "REAL",
    ].join(";"));

    const csvBody = [headers.join(";"), ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csvBody], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `BBDD_GPS_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("✓ Archivo CSV exportado con éxito");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "inherit" }}>
      {/* Toast */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "24px",
            background: "#0f172a",
            color: "#ffffff",
            padding: "10px 18px",
            borderRadius: "8px",
            fontWeight: 700,
            fontSize: "12.5px",
            zIndex: 99999,
            boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* TOPBAR */}
      <header
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <Link
            href="/"
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#64748b",
              textDecoration: "none",
              background: "#f1f5f9",
              padding: "6px 12px",
              borderRadius: "6px",
            }}
          >
            ← Inicio
          </Link>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "20px" }}>⚡</span>
              <h1 style={{ fontSize: "18px", fontWeight: 900, color: "#0f172a", margin: 0 }}>
                BASE DE DATOS: GPS & CARGA EXTERNA
              </h1>
              <span
                style={{
                  fontSize: "10.5px",
                  fontWeight: 800,
                  background: "#fed7aa",
                  color: "#9a3412",
                  padding: "2px 8px",
                  borderRadius: "12px",
                }}
              >
                CE EUROPA
              </span>
              <span
                style={{
                  fontSize: "10.5px",
                  fontWeight: 800,
                  background: "#dcfce7",
                  color: "#166534",
                  padding: "2px 8px",
                  borderRadius: "12px",
                }}
              >
                BBDD ENLAZADA
              </span>
            </div>
            <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#64748b" }}>
              Registro centralizado de métricas de carga externa sincronizado con Google Sheets
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* BOTÓN PRIMARIO: ABRIR GOOGLE SHEETS */}
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "#ea580c",
              color: "#ffffff",
              padding: "8px 16px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 800,
              textDecoration: "none",
              boxShadow: "0 2px 4px rgba(234, 88, 12, 0.25)",
            }}
            title="Abrir la base de datos externa de GPS directamente en Google Sheets"
          >
            <span>↗</span>
            <span>Abrir BBDD en Google Sheets</span>
          </a>

          {/* BOTÓN: SINCRONIZAR AHORA */}
          <button
            type="button"
            onClick={handleSyncGps}
            disabled={isSyncing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: isSyncing ? "#94a3b8" : "#0284c7",
              color: "#ffffff",
              padding: "8px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 800,
              border: "none",
              cursor: isSyncing ? "not-allowed" : "pointer",
            }}
          >
            <span>{isSyncing ? "⏳" : "⚡"}</span>
            <span>{isSyncing ? "Sincronizando..." : "Sincronizar BBDD"}</span>
          </button>

          {/* TOGGLE IFRAME PREVIEW */}
          <button
            type="button"
            onClick={() => setShowIframe(!showIframe)}
            style={{
              background: showIframe ? "#334155" : "#f1f5f9",
              color: showIframe ? "#ffffff" : "#334155",
              border: "1px solid #cbd5e1",
              padding: "8px 12px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {showIframe ? "Ocultar Vista Previa" : "Ver en Pantalla ▾"}
          </button>

          {/* EXPORTS */}
          <button
            type="button"
            onClick={handleExportExcel}
            style={{
              background: "#10b981",
              color: "#ffffff",
              border: "none",
              padding: "8px 12px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Excel
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            style={{
              background: "#f1f5f9",
              color: "#334155",
              border: "1px solid #cbd5e1",
              padding: "8px 12px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            CSV
          </button>
        </div>
      </header>

      {/* EMBEDDED IFRAME (SI ESTÁ ABIERTO) */}
      {showIframe && (
        <div style={{ background: "#0f172a", padding: "16px 24px", borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ color: "#f8fafc", fontSize: "12px", fontWeight: 700 }}>
              Vista en vivo del documento Google Sheets:
            </span>
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#38bdf8", fontSize: "11px", fontWeight: 700 }}
            >
              Abrir en pestaña nueva ↗
            </a>
          </div>
          <iframe
            src={externalUrl.replace("/edit", "/preview")}
            style={{ width: "100%", height: "500px", border: "1px solid #334155", borderRadius: "8px", background: "#ffffff" }}
            title="Google Sheets GPS Preview"
          />
        </div>
      )}

      {/* TARJETAS DE INFORMACIÓN */}
      <div style={{ padding: "16px 24px 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px" }}>
        {/* Card 1: BBDD Externa */}
        <div style={{ background: "#ffffff", border: "1px solid #fed7aa", borderRadius: "10px", padding: "14px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#ea580c", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            🔗 BBDD Externa Vinculada
          </div>
          <div style={{ fontSize: "15px", fontWeight: 900, color: "#0f172a", marginTop: "4px" }}>
            Google Sheets (Wimu GPS)
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", wordBreak: "break-all" }}>
            <a href={externalUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#ea580c", fontWeight: 700, textDecoration: "underline" }}>
              Ver hoja de cálculo original ↗
            </a>
          </div>
        </div>

        {/* Card 2: Sesiones */}
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            📅 Sesiones GPS Sincronizadas
          </div>
          <div style={{ fontSize: "20px", fontWeight: 900, color: "#0284c7", marginTop: "4px" }}>
            {uniqueDates.length} Fechas
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
            Desde {uniqueDates[uniqueDates.length - 1] || "—"} hasta {uniqueDates[0] || "—"}
          </div>
        </div>

        {/* Card 3: Registros Totales */}
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            🏃 Registros de Deportistas
          </div>
          <div style={{ fontSize: "20px", fontWeight: 900, color: "#16a34a", marginTop: "4px" }}>
            {records.length} Registros
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
            Mostrando {filteredRecords.length} con filtros actuales
          </div>
        </div>

        {/* Card 4: Estado de enlace */}
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            ⚡ Estado de Conexión
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
            <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e" }} />
            <span style={{ fontSize: "14px", fontWeight: 900, color: "#15803d" }}>Enlazada y Activa</span>
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
            Auto-sincronizada en web y móvil
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div style={{ padding: "16px 24px" }}>
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
            padding: "14px 18px",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
          }}
        >
          {/* Búsqueda */}
          <div style={{ flex: "1 1 200px" }}>
            <input
              type="text"
              placeholder="Buscar por jugador, fecha, rival o MD..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                fontSize: "12.5px",
                outline: "none",
              }}
            />
          </div>

          {/* Filtro Jugador */}
          <div>
            <select
              value={selectedJugador}
              onChange={(e) => setSelectedJugador(e.target.value)}
              style={{
                padding: "8px 12px",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                fontSize: "12px",
                background: "#ffffff",
                fontWeight: 600,
              }}
            >
              <option value="TODOS">Todos los Jugadores ({jugadores.length})</option>
              {jugadores.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.apodo || j.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro MD */}
          <div>
            <select
              value={selectedMd}
              onChange={(e) => setSelectedMd(e.target.value)}
              style={{
                padding: "8px 12px",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                fontSize: "12px",
                background: "#ffffff",
                fontWeight: 600,
              }}
            >
              <option value="TODOS">Todos los MDs</option>
              {uniqueMds.map((md) => (
                <option key={md} value={md}>
                  {md}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Tipo Sesión */}
          <div>
            <select
              value={selectedTipo}
              onChange={(e) => setSelectedTipo(e.target.value)}
              style={{
                padding: "8px 12px",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                fontSize: "12px",
                background: "#ffffff",
                fontWeight: 600,
              }}
            >
              <option value="TODOS">Todos los Tipos</option>
              <option value="PARTIDO">Partidos</option>
              <option value="ENTRENAMIENTO">Entrenamientos</option>
            </select>
          </div>

          {/* Fechas */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>Desde:</span>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              style={{
                padding: "6px 8px",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                fontSize: "12px",
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>Hasta:</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              style={{
                padding: "6px 8px",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                fontSize: "12px",
              }}
            />
          </div>

          {(searchText || selectedJugador !== "TODOS" || selectedMd !== "TODOS" || selectedTipo !== "TODOS" || fechaDesde || fechaHasta) && (
            <button
              type="button"
              onClick={() => {
                setSearchText("");
                setSelectedJugador("TODOS");
                setSelectedMd("TODOS");
                setSelectedTipo("TODOS");
                setFechaDesde("");
                setFechaHasta("");
              }}
              style={{
                background: "#f1f5f9",
                color: "#64748b",
                border: "1px solid #cbd5e1",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "11.5px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ✕ Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* TABLA DE REGISTROS */}
      <div style={{ padding: "0 24px 32px" }}>
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569", fontWeight: 800 }}>
                  <th style={{ padding: "10px 14px" }}>Fecha</th>
                  <th style={{ padding: "10px 10px" }}>MD</th>
                  <th style={{ padding: "10px 10px" }}>Tipo</th>
                  <th style={{ padding: "10px 14px" }}>Jugador</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Dist. Total</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>m / min</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>HSR Abs</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Vel Max</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Sprints</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Player Load</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>HMLD (m)</th>
                  <th style={{ padding: "10px 10px", textAlign: "right" }}>Acc +3</th>
                  <th style={{ padding: "10px 10px", textAlign: "right" }}>Dec +3</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Duración</th>
                  <th style={{ padding: "10px 14px", textAlign: "center" }}>Origen</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={15} style={{ padding: "36px", textAlign: "center", color: "#94a3b8", fontWeight: 600 }}>
                      No se encontraron registros de GPS con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r, idx) => (
                    <tr
                      key={r.id || `${r.jugador_id}_${r.fecha}_${idx}`}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        background: idx % 2 === 0 ? "#ffffff" : "#fafafa",
                      }}
                    >
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#1e293b", whiteSpace: "nowrap" }}>
                        {r.fecha}
                      </td>
                      <td style={{ padding: "10px 10px" }}>
                        {r.match_day ? (
                          <span
                            style={{
                              background: r.match_day.toUpperCase().includes("MD") && !r.match_day.includes("-") && !r.match_day.includes("+") ? "#fef3c7" : "#e0e7ff",
                              color: r.match_day.toUpperCase().includes("MD") && !r.match_day.includes("-") && !r.match_day.includes("+") ? "#92400e" : "#3730a3",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 800,
                            }}
                          >
                            {r.match_day}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "10px 10px", fontSize: "11px", fontWeight: 700, color: r.tipo_sesion === "PARTIDO" ? "#dc2626" : "#0284c7" }}>
                        {r.tipo_sesion || "ENTRENO"}
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 800, color: "#0f172a" }}>
                        {r.playerName}
                        {r.playerDorsal ? <span style={{ color: "#94a3b8", fontWeight: 600, marginLeft: "4px" }}>#{r.playerDorsal}</span> : null}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                        {r.distanciaTotal ? `${r.distanciaTotal} m` : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#475569" }}>
                        {r.distanciaMin ? `${r.distanciaMin}` : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, color: r.hsr > 400 ? "#ea580c" : "#0f172a" }}>
                        {r.hsr ? `${r.hsr} m` : "0 m"}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: Number(r.maxSpeed) > 28 ? "#dc2626" : "#475569" }}>
                        {r.maxSpeed ? `${r.maxSpeed} km/h` : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, color: r.sprints > 10 ? "#dc2626" : "#0f172a" }}>
                        {r.sprints}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#475569" }}>
                        {r.playerLoad || "—"}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#475569" }}>
                        {r.hmld ? `${r.hmld} m` : "—"}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 700, color: "#16a34a" }}>
                        {r.acc3}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 700, color: "#ea580c" }}>
                        {r.dec3}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#64748b" }}>
                        {r.duracionMin ? `${r.duracionMin} min` : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 800,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: r.es_simulado ? "#fef3c7" : "#dcfce7",
                            color: r.es_simulado ? "#92400e" : "#166534",
                          }}
                        >
                          {r.es_simulado ? "SIMULADO" : "REAL"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
