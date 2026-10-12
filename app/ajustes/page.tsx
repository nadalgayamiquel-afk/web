"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { DEFAULT_TIPOS_EVENTO_CONFIG, TipoEventoConfig } from "@/app/calendario/CalendarGrid";
import { DISPONIBILIDADES, DisponibilidadInfo } from "@/app/lib/disponibilidad";
import { RivalConfig, DEFAULT_RIVALES, PRIMERA_RFEF_G2_2627, getStoredRivales, saveStoredRivales, findRivalEscudoUrl, syncRivalesFromBBDD } from "@/app/lib/rivales";
import { getClubConfig, saveClubConfig, upsertSingleRivalBBDD, deleteRivalBBDD, getRivalesBBDD, getExternalLinksBBDD, saveExternalLinksBBDD, syncSupabaseToGitHubAction, getCompleteSupabaseBackup } from "@/app/actions";
import { ExternalDatabaseLinks, DEFAULT_EXTERNAL_LINKS } from "@/app/lib/externalLinks";
import GpsSettingsSection from "./GpsSettingsSection";

const teamsBySeason = {
  "2026/27": ["CE Manresa"],
  "2025/26": ["AE Prat"],
};

const reports = [
  { name: "Report Sesión", href: "/informes/gps-diario" },
  { name: "Report Microciclo", href: "/informes/microciclo" },
  { name: "Report Mesociclo", href: "/informes/mesociclo" },
  { name: "Report Anual", href: "/informes/anual" },
  { name: "Report Partidos", href: "/informes/partidos" },
  { name: "Multas", href: "/informes/multas" },
];

const databaseScreens = ["BBDD", "BBDD_GPS", "BBDD_LESIONES", "BBDD_TESTS", "BBDD_FUERZA", "BBDD_CAMPO", "BBDD_EJERCICIOS", "BBDD_EJERCICIOS_CAMPO", "BBDD_RUTINAS", "BBDD_GRUPOS"];

// Configuración por defecto de las Pantallas
const DEFAULT_PANTALLAS = [
  { id: "indice", name: "Índice", href: "/indice", icon: "▦", color: "#1e3a8a" },
  { id: "deportistas", name: "Deportistas", href: "/deportistas", icon: "🏃", color: "#0284c7" },
  { id: "calendario", name: "Planificación", href: "/calendario", icon: "📅", color: "#0d9488" },
  { id: "disponibilidad", name: "Disponibilidad", href: "/disponibilidad", icon: "📋", color: "#16a34a" },
  { id: "cargas", name: "Cargas", href: "/cargas", icon: "⚡", color: "#eab308" },
  { id: "eventos", name: "Calendario", href: "/eventos", icon: "🗓️", color: "#6366f1" },
  { id: "campo", name: "Campo", href: "/campo", icon: "⚽", color: "#22c55e" },
  { id: "gimnasio", name: "Gimnasio", href: "/gimnasio", icon: "🏋️", color: "#f97316" },
  { id: "partidos", name: "Partidos", href: "/partidos", icon: "🏆", color: "#e11d48" },
  { id: "valoracion", name: "Testing", href: "/testing", icon: "📊", color: "#8b5cf6" },
];

export interface ClubConfig {
  nombreClub: string;
  siglas: string;
  categoria: string;
  escudoUrl: string;
  escudoSecundarioUrl?: string;
  temporadaActiva: string;
  temporadas: Array<{
    temporada: string;
    equipo: string;
    escudoUrl?: string;
    esActiva?: boolean;
    liga?: string;
    grupo?: string;
  }>;
}

const DEFAULT_CLUB_CONFIG: ClubConfig = {
  nombreClub: "",
  siglas: "",
  categoria: "",
  escudoUrl: "",
  escudoSecundarioUrl: "",
  temporadaActiva: "",
  temporadas: [
    { temporada: "", equipo: "", escudoUrl: "", esActiva: true, liga: "", grupo: "" }
  ],
};

export default function AjustesPage() {
  const [openGroups, setOpenGroups] = useState({ screens: true, reports: false, database: false, settings: true });

  const [activeTab, setActiveTab] = useState<"club" | "pantallas" | "eventos" | "disponibilidad" | "bbdd" | "rivales" | "datos" | "links_externos" | "gps">("club");

  // State para Club, Temporadas y Escudos
  const [clubConfig, setClubConfig] = useState<ClubConfig>(DEFAULT_CLUB_CONFIG);
  const [syncingGithub, setSyncingGithub] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success?: boolean; message?: string; sizeMB?: string; timestamp?: string } | null>(null);
  const [downloadingSupabase, setDownloadingSupabase] = useState(false);

  const handleSyncToGitHub = async () => {
    setSyncingGithub(true);
    setSyncResult(null);
    try {
      const res = await syncSupabaseToGitHubAction();
      setSyncResult(res);
    } catch (err: any) {
      setSyncResult({ success: false, message: err.message });
    } finally {
      setSyncingGithub(false);
    }
  };

  const handleDownloadSupabase = async () => {
    setDownloadingSupabase(true);
    try {
      const data = await getCompleteSupabaseBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_supabase_completo_${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Error al descargar el backup de Supabase: " + err.message);
    } finally {
      setDownloadingSupabase(false);
    }
  };
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    getClubConfig().then((serverConf) => {
      if (serverConf && (serverConf.nombreClub || serverConf.temporadaActiva || serverConf.escudoUrl)) {
        setClubConfig(serverConf);
        try {
          localStorage.setItem("custom_club_config", JSON.stringify(serverConf));
        } catch (e) {}
      } else {
        try {
          const saved = localStorage.getItem("custom_club_config");
          if (saved) setClubConfig(JSON.parse(saved));
        } catch (e) {}
      }
    }).catch(() => {
      try {
        const saved = localStorage.getItem("custom_club_config");
        if (saved) setClubConfig(JSON.parse(saved));
      } catch (e) {}
    });
  }, []);

  const seasons = [clubConfig.temporadaActiva];
  const team = clubConfig.nombreClub;

  // State para Pantallas (Nombres, iconos, colores)
  const [pantallasConfig, setPantallasConfig] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("custom_pantallas_config");
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return DEFAULT_PANTALLAS;
  });

  // State para Tipos de Evento (Códigos, Nombres, Colores, Fondos)
  const [eventosConfig, setEventosConfig] = useState<TipoEventoConfig[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("custom_eventos_config");
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return DEFAULT_TIPOS_EVENTO_CONFIG;
  });

  // State para Disponibilidades (Códigos, Nombres, Colores)
  const [disponibilidadConfig, setDisponibilidadConfig] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("custom_disponibilidad_config");
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return Object.values(DISPONIBILIDADES);
  });

  // State para Nomenclatura BBDD
  const [bbddConfig, setBbddConfig] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("custom_bbdd_config");
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return databaseScreens.map((name) => ({ id: name, name, label: name }));
  });

  // State para Rivales (Escudos de equipos rivales)
  const [rivalesConfig, setRivalesConfig] = useState<RivalConfig[]>(() => {
    return getStoredRivales();
  });

  // Auto-purga de enlaces antiguos o bloqueados (como upload.wikimedia.org) hacia Transfermarkt
  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = getStoredRivales();
    setRivalesConfig(current);
    syncRivalesFromBBDD();
    const handleRivalesSync = () => {
      setRivalesConfig(getStoredRivales());
    };
    window.addEventListener("rivales_updated", handleRivalesSync);
    window.addEventListener("storage", handleRivalesSync);
    return () => {
      window.removeEventListener("rivales_updated", handleRivalesSync);
      window.removeEventListener("storage", handleRivalesSync);
    };
  }, []);
  // Gestión de Enlaces a Bases de Datos Externas (Wellness, GPS, etc.)
  const [externalLinks, setExternalLinks] = useState<ExternalDatabaseLinks>(DEFAULT_EXTERNAL_LINKS);
  const [isSavingExternalLinks, setIsSavingExternalLinks] = useState(false);
  const [externalLinksSaveMsg, setExternalLinksSaveMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("external_database_links_v1");
      if (saved) {
        setExternalLinks(JSON.parse(saved));
      }
    } catch (e) {}

    getExternalLinksBBDD().then((dbLinks) => {
      if (dbLinks && (dbLinks.wellness?.url || dbLinks.gps?.url || (dbLinks.adicionales && dbLinks.adicionales.length > 0))) {
        setExternalLinks(dbLinks);
        try {
          localStorage.setItem("external_database_links_v1", JSON.stringify(dbLinks));
        } catch (e) {}
      }
    }).catch(console.error);
  }, []);

  const handleSaveExternalLinks = async () => {
    setIsSavingExternalLinks(true);
    setExternalLinksSaveMsg(null);
    try {
      localStorage.setItem("external_database_links_v1", JSON.stringify(externalLinks));
      window.dispatchEvent(new Event("external_links_updated"));
      window.dispatchEvent(new Event("storage"));

      const res = await saveExternalLinksBBDD(externalLinks);
      if (res.success) {
        setExternalLinksSaveMsg("✓ Enlaces de bases de datos guardados correctamente en la base de datos.");
      } else {
        setExternalLinksSaveMsg("✓ Enlaces guardados localmente.");
      }
    } catch (e: any) {
      setExternalLinksSaveMsg("Error al guardar: " + e.message);
    } finally {
      setIsSavingExternalLinks(false);
      setTimeout(() => setExternalLinksSaveMsg(null), 4000);
    }
  };

  const handleCopyLink = (url: string, id: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleAddCustomLink = () => {
    setExternalLinks((prev) => ({
      ...prev,
      adicionales: [
        ...(prev.adicionales || []),
        {
          id: `link_${Date.now()}`,
          nombre: "Nuevo Enlace",
          url: "",
          categoria: "General",
          notas: "",
        },
      ],
    }));
  };

  const handleRemoveCustomLink = (id: string) => {
    setExternalLinks((prev) => ({
      ...prev,
      adicionales: (prev.adicionales || []).filter((l) => l.id !== id),
    }));
  };

  const [newRivalName, setNewRivalName] = useState("");
  const [newRivalEscudoUrl, setNewRivalEscudoUrl] = useState("");
  const [rivalSearch, setRivalSearch] = useState("");

  // Subir imagen de escudo de rival
  const handleRivalFileUpload = (e: React.ChangeEvent<HTMLInputElement>, index?: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const dataUrl = uploadEvent.target?.result as string;
      if (dataUrl) {
        if (index !== undefined) {
          setRivalesConfig((prev) => {
            const next = prev.map((r, i) => (i === index ? { ...r, escudoUrl: dataUrl } : r));
            saveStoredRivales(next);
            if (index !== undefined && prev[index]) {
              upsertSingleRivalBBDD({
                id: prev[index].id,
                nombre: prev[index].nombre,
                escudo_url: dataUrl
              }).catch(console.error);
            }
            return next;
          });
        } else {
          setNewRivalEscudoUrl(dataUrl);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [memoryUsage, setMemoryUsage] = useState({ pct: 0, mb: "0.00", color: "#10b981" });
  const [isMigrating, setIsMigrating] = useState(false);
  const [migracionStatus, setMigracionStatus] = useState("");

  useEffect(() => {
    if (activeTab === "datos" && typeof window !== "undefined") {
      try {
        let total = 0;
        for(let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            total += ((localStorage.getItem(key)?.length || 0) + key.length) * 2;
          }
        }
        const max = 5 * 1024 * 1024; // ~5MB
        const pct = Math.min((total / max) * 100, 100);
        const mb = (total / (1024 * 1024)).toFixed(2);
        let color = "#10b981";
        if(pct > 85) color = "#ef4444";
        else if(pct > 60) color = "#f59e0b";
        setMemoryUsage({ pct, mb, color });
      } catch(e) {}
    }
  }, [activeTab]);

  // Subir imagen de escudo y convertir a Data URL
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, targetField: "escudoUrl" | "escudoSecundarioUrl", seasonIdx?: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const dataUrl = uploadEvent.target?.result as string;
      if (dataUrl) {
        if (seasonIdx !== undefined) {
          setClubConfig((prev) => {
            const nextTemps = [...prev.temporadas];
            nextTemps[seasonIdx] = { ...nextTemps[seasonIdx], escudoUrl: dataUrl };
            return { ...prev, temporadas: nextTemps };
          });
        } else {
          setClubConfig((prev) => ({
            ...prev,
            [targetField]: dataUrl,
          }));
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const [isSaving, setIsSaving] = useState(false);

  // Guardar Cambios en Servidor y en localStorage
  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      // 1. Guardar en Servidor y convertir imágenes a archivos permanentes en /public/uploads/
      const res = await saveClubConfig(clubConfig);
      const cleanConfig = res.success ? res.config : clubConfig;
      setClubConfig(cleanConfig);

      // 2. Guardar en localStorage de forma segura
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("custom_club_config", JSON.stringify(cleanConfig));
          localStorage.setItem("custom_pantallas_config", JSON.stringify(pantallasConfig));
          localStorage.setItem("custom_eventos_config", JSON.stringify(eventosConfig));
          localStorage.setItem("custom_disponibilidad_config", JSON.stringify(disponibilidadConfig));
          localStorage.setItem("custom_bbdd_config", JSON.stringify(bbddConfig));
          saveStoredRivales(rivalesConfig);
        } catch (e) {
          console.warn("Aviso localStorage lleno:", e);
        }
        window.dispatchEvent(new Event("storage"));
        window.dispatchEvent(new Event("club_config_updated"));
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      console.error("Error guardando configuracion:", err);
      alert("Error al guardar: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleGroup = (group: keyof typeof openGroups) => {
    setOpenGroups((current) => ({ ...current, [group]: !current[group] }));
  };

  if (!isMounted) return null;

  return (
    <div className="app-shell">
      {/* SIDEBAR NAVEGACIÓN */}
      <aside className="sidebar no-print">
        <div className="brand-header">
          <img
            src={clubConfig.escudoUrl || undefined}
            alt={clubConfig.nombreClub}
            style={{ width: "64px", height: "72px", objectFit: "contain" }}
            
          />
          
        </div>

        

        <nav className="main-nav">
          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.screens} onClick={() => toggleGroup("screens")}>
            <span>PANTALLAS</span><b>{openGroups.screens ? "−" : "+"}</b>
          </button>
          {openGroups.screens && (
            <div className="nav-group-list">
              {pantallasConfig.map((p: any) => (
                <Link key={p.id} className="nav-link" href={p.href}>
                  <span>{p.icon}</span> {p.name}
                </Link>
              ))}
            </div>
          )}

          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.reports} onClick={() => toggleGroup("reports")}>
            <span>INFORMES</span><b>{openGroups.reports ? "−" : "+"}</b>
          </button>
          {openGroups.reports && (
            <div className="nav-group-list">
              {reports.map((item) => (
                <Link key={item.name} className="nav-link" href={item.href}>
                  <span>▤</span> {item.name}
                </Link>
              ))}
            </div>
          )}

          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.database} onClick={() => toggleGroup("database")}>
            <span>BASE DE DATOS</span><b>{openGroups.database ? "−" : "+"}</b>
          </button>
          {openGroups.database && (
            <div className="nav-group-list">
              {bbddConfig.map((item: any) => (
                <Link key={item.id} className="nav-link" href={`/base-datos/${item.id.toLowerCase()}`}>
                  <span>▥</span> {item.name}
                </Link>
              ))}
            </div>
          )}

          {/* BLOQUE AJUSTES */}
          <button className="nav-group-toggle" type="button" aria-expanded={openGroups.settings} onClick={() => toggleGroup("settings")}>
            <span>AJUSTES</span><b>{openGroups.settings ? "−" : "+"}</b>
          </button>
          {openGroups.settings && (
            <div className="nav-group-list">
              <Link className="nav-link active" href="/ajustes">
                <span>⚙️</span> Configuración General
              </Link>
            </div>
          )}
        </nav>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <section className="content">
        <header className="topbar no-print">
          <div>
            <span className="breadcrumb">SISTEMA / <strong>⚙️ AJUSTES Y CONFIGURACIÓN</strong></span>
            <h1>Configuración General de la Aplicación</h1>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {savedSuccess && (
              <span style={{ background: "#dcfce7", color: "#15803d", fontSize: "12px", fontWeight: 800, padding: "6px 12px", borderRadius: "8px", border: "1px solid #86efac" }}>
                ✓ ¡Cambios guardados con éxito!
              </span>
            )}
            <button
              disabled={isSaving}
              onClick={handleSaveAll}
              style={{
                background: "#0284c7",
                color: "#ffffff",
                border: "none",
                padding: "8px 18px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)",
              }}
            >
              {isSaving ? "⏳ Guardando..." : "💾 Guardar Cambios"}
            </button>
          </div>
        </header>

        <div style={{ background: "#ffffff", padding: "20px", borderRadius: "12px", border: "1px solid #cbd5e1", boxShadow: "0 2px 10px rgba(0,0,0,0.03)" }}>
          
          {/* PESTAÑAS DE SECCIONES DE AJUSTES */}
          <div style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e2e8f0", paddingBottom: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
            <button
              onClick={() => setActiveTab("club")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 800,
                cursor: "pointer",
                border: "none",
                background: activeTab === "club" ? "#1e3a8a" : "#f1f5f9",
                color: activeTab === "club" ? "#ffffff" : "#64748b",
              }}
            >
              🛡️ Club, Temporada y Escudos
            </button>
            <button
              onClick={() => setActiveTab("pantallas")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 800,
                cursor: "pointer",
                border: "none",
                background: activeTab === "pantallas" ? "#1e3a8a" : "#f1f5f9",
                color: activeTab === "pantallas" ? "#ffffff" : "#64748b",
              }}
            >
              📱 Nombres y Iconos de Pantallas
            </button>
            <button
              onClick={() => setActiveTab("eventos")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 800,
                cursor: "pointer",
                border: "none",
                background: activeTab === "eventos" ? "#1e3a8a" : "#f1f5f9",
                color: activeTab === "eventos" ? "#ffffff" : "#64748b",
              }}
            >
              🗓️ Tipos de Evento y Colores
            </button>
            <button
              onClick={() => setActiveTab("disponibilidad")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 800,
                cursor: "pointer",
                border: "none",
                background: activeTab === "disponibilidad" ? "#1e3a8a" : "#f1f5f9",
                color: activeTab === "disponibilidad" ? "#ffffff" : "#64748b",
              }}
            >
              📋 Disponibilidades y Semáforo
            </button>
            <button
              onClick={() => setActiveTab("rivales")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 800,
                cursor: "pointer",
                border: "none",
                background: activeTab === "rivales" ? "#1e3a8a" : "#f1f5f9",
                color: activeTab === "rivales" ? "#ffffff" : "#64748b",
              }}
            >
              🛡️ Rivales
            </button>
            <button
              onClick={() => setActiveTab("bbdd")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 800,
                cursor: "pointer",
                border: "none",
                background: activeTab === "bbdd" ? "#1e3a8a" : "#f1f5f9",
                color: activeTab === "bbdd" ? "#ffffff" : "#64748b",
              }}
            >
              ▥ Nomenclatura Base de Datos
            </button>
                        <button
              onClick={() => setActiveTab("gps")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 800,
                cursor: "pointer",
                border: "none",
                background: activeTab === "gps" ? "#1e3a8a" : "#f1f5f9",
                color: activeTab === "gps" ? "#ffffff" : "#64748b",
              }}
            >
              🛰️ GPS
            </button>
            <button
              onClick={() => setActiveTab("links_externos")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 800,
                cursor: "pointer",
                border: "none",
                background: activeTab === "links_externos" ? "#1e3a8a" : "#f1f5f9",
                color: activeTab === "links_externos" ? "#ffffff" : "#64748b",
              }}
            >
              🔗 Bases de Datos Externas
            </button>
            <button
              onClick={() => setActiveTab("datos")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 800,
                cursor: "pointer",
                border: "none",
                background: activeTab === "datos" ? "#1e3a8a" : "#f1f5f9",
                color: activeTab === "datos" ? "#ffffff" : "#64748b",
              }}
            >
              💾 Datos y Memoria
            </button>
          </div>

          {/* CONTENIDO DE LA PESTAÑA: GPS */}
          {activeTab === "gps" && (
            <GpsSettingsSection />
          )}

          {/* CONTENIDO DE LA PESTAÑA: DATOS Y MEMORIA */}
          {activeTab === "datos" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* CARD: SUPABASE CLOUD & GITHUB SYNC */}
              <div style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "20px", background: "#ffffff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 900, color: "#0f766e", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                    ☁️ Supabase Cloud & GitHub Sync
                  </h3>
                  <span style={{ fontSize: "11px", fontWeight: 800, padding: "4px 10px", borderRadius: "999px", background: "#dcfce7", color: "#166534" }}>
                    ● Supabase Conectado
                  </span>
                </div>

                <p style={{ fontSize: "13px", color: "#475569", marginBottom: "16px", lineHeight: "1.5" }}>
                  Extrae las tablas en tiempo real de <strong>Supabase</strong> (jugadores, sesiones, minutos, fuerza, lesiones, GPS, ejercicios y comentarios), genera un respaldo estructurado e interactúa con el repositorio de <strong>GitHub</strong> (<code>nadalgayamiquel-afk/web</code>).
                </p>

                {syncResult && (
                  <div style={{
                    marginBottom: "16px",
                    padding: "12px 16px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    background: syncResult.success ? "#f0fdf4" : "#fef2f2",
                    border: `1px solid ${syncResult.success ? "#bbf7d0" : "#fecaca"}`,
                    color: syncResult.success ? "#166534" : "#991b1b"
                  }}>
                    <strong>{syncResult.success ? "✅ Sincronización Completada:" : "❌ Error:"}</strong> {syncResult.message}
                    {syncResult.sizeMB && ` (Tamaño exportado: ${syncResult.sizeMB} MB)`}
                  </div>
                )}

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleSyncToGitHub}
                    disabled={syncingGithub}
                    style={{
                      background: syncingGithub ? "#94a3b8" : "#0f766e",
                      color: "#ffffff",
                      border: "none",
                      padding: "10px 20px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: 800,
                      cursor: syncingGithub ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                  >
                    {syncingGithub ? "⏳ Extrayendo y sincronizando..." : "🚀 Sincronizar Supabase a GitHub"}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadSupabase}
                    disabled={downloadingSupabase}
                    style={{
                      background: downloadingSupabase ? "#94a3b8" : "#1e293b",
                      color: "#ffffff",
                      border: "none",
                      padding: "10px 20px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: 800,
                      cursor: downloadingSupabase ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                  >
                    {downloadingSupabase ? "⏳ Generando JSON..." : "⬇️ Descargar BBDD Supabase (JSON)"}
                  </button>
                </div>
              </div>
              <div style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "20px", background: "#ffffff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 900, color: "#1e3a8a", margin: 0 }}>
                    💾 Caché Local del Navegador (Historial de Versiones Anteriores)
                  </h3>
                  <span style={{ fontSize: "11px", fontWeight: 800, padding: "4px 8px", borderRadius: "6px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}>
                    ✅ BBDD Principal Activa: Supabase Cloud
                  </span>
                </div>
                
                {/* INDICADOR DE MEMORIA */}
                <div style={{ marginBottom: "20px", padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 800, color: "#475569" }}>USO DE MEMORIA LOCAL</span>
                    <span style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a" }}>
                      {memoryUsage.mb} MB de ~5.00 MB ({memoryUsage.pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div style={{ width: "100%", height: "10px", background: "#e2e8f0", borderRadius: "5px", overflow: "hidden" }}>
                    <div style={{ width: `${memoryUsage.pct}%`, height: "100%", background: memoryUsage.color, transition: "width 0.3s" }}></div>
                  </div>
                </div>

                <div style={{ padding: "12px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", marginBottom: "16px" }}>
                  <p style={{ fontSize: "13px", color: "#1e40af", margin: 0, lineHeight: "1.5" }}>
                    ℹ️ <strong>Tu base de datos principal activa es Supabase Cloud.</strong> Los {memoryUsage.mb} MB mostrados arriba corresponden a la caché acumulada en la memoria temporal de este navegador (localStorage) durante versiones anteriores. Puedes pulsar en <strong>☁️ Migrar Datos a Supabase</strong> para asegurarte de que cualquier dato antiguo pase a la nube, o limpiar la caché local con seguridad.
                  </p>
                </div>
                
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const backup: any = {};
                        for (let i = 0; i < localStorage.length; i++) {
                          const key = localStorage.key(i);
                          if (key) backup[key] = localStorage.getItem(key);
                        }
                        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `backup_completo_top_play_${new Date().toISOString().split("T")[0]}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch (e) {
                        alert("Error al crear la copia de seguridad.");
                      }
                    }}
                    style={{ background: "#0284c7", color: "#ffffff", border: "none", padding: "10px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    ⬇️ Descargar Copia
                  </button>

                  <label style={{ display: "flex", alignItems: "center", gap: "6px", background: "#10b981", color: "#ffffff", padding: "10px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 800, cursor: "pointer" }}>
                    ⬆️ Restaurar Copia
                    <input
                      type="file"
                      accept=".json"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          try {
                            const data = JSON.parse(ev.target?.result as string);
                            for (const key of Object.keys(data)) {
                              localStorage.setItem(key, data[key]);
                            }
                            alert("Copia restaurada con éxito. La aplicación se recargará ahora para aplicar los cambios.");
                            window.location.reload();
                          } catch (err) {
                            console.error(err);
                            alert("Error al restaurar: Es posible que el archivo sea inválido o la memoria esté llena.");
                          }
                        };
                        reader.readAsText(file);
                      }}
                    />
                  </label>
                  
                  <button
                    type="button"
                    onClick={() => {
                      const inputDate = window.prompt(
                        "Introduce la fecha límite (formato YYYY-MM-DD).\nSe borrarán los eventos, disponibilidades y comentarios ANTERIORES a este día para liberar memoria (tu configuración se mantiene intacta).",
                        "2026-07-19"
                      );
                      
                      if (!inputDate) return; // User cancelled
                      
                      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                      if (!dateRegex.test(inputDate)) {
                        alert("Formato de fecha incorrecto. Debe ser YYYY-MM-DD.");
                        return;
                      }

                      const cutoffISO = inputDate;

                      if (window.confirm(`¿Seguro que quieres borrar TODO el historial anterior al ${cutoffISO}?`)) {
                        try {
                          let freed = 0;

                          // 1. Limpiar diccionarios por fecha
                          ['eventos_bloques_map_v1', 'disponibilidad_map_v1', 'player_event_minutes_map_v1', 'player_events_map_v1', 'informe_microciclo_comentarios_v1', 'cargas_wellness_general_comments_v1', 'cargas_manual_wellness_v2', 'cargas_manual_md_v1'].forEach(key => {
                            const raw = localStorage.getItem(key);
                            if (raw) {
                               try {
                                 const obj = JSON.parse(raw);
                                 let changed = false;
                                 for (const dateKey of Object.keys(obj)) {
                                   const dateMatch = dateKey.match(/\d{4}-\d{2}-\d{2}/);
                                   if (dateMatch && dateMatch[0] < cutoffISO) {
                                     delete obj[dateKey];
                                     changed = true;
                                     freed++;
                                   }
                                 }
                                 if (changed) {
                                   localStorage.removeItem(key); // Evita error de cuota al sobrescribir
                                   localStorage.setItem(key, JSON.stringify(obj));
                                 }
                               } catch (e) {}
                            }
                          });

                          // 2. Limpiar arrays con fechas
                          ['comentarios_jugadores_v2', 'lesiones_registro_detallado_v1', 'planificacion_comentarios_v1', 'gps_datos_map_v1', 'planificacion_days_v2'].forEach(key => {
                            const raw = localStorage.getItem(key);
                            if (raw) {
                               try {
                                 const arr = JSON.parse(raw);
                                 if (Array.isArray(arr)) {
                                   const next = arr.filter((item: any) => {
                                     const d = item.fecha || item.fechaInicio || item.day_id;
                                     if (d) {
                                       const dateMatch = String(d).match(/\d{4}-\d{2}-\d{2}/);
                                       if (dateMatch && dateMatch[0] < cutoffISO) return false;
                                     }
                                     return true;
                                   });
                                   if (next.length !== arr.length) {
                                     freed += (arr.length - next.length);
                                     localStorage.removeItem(key); // Evita error de cuota al sobrescribir
                                     localStorage.setItem(key, JSON.stringify(next));
                                   }
                                 }
                               } catch (e) {}
                            }
                          });

                          alert(`Limpieza completada con éxito. Se han eliminado ${freed} registros antiguos. La página se recargará.`);
                          window.location.reload();
                        } catch (err) {
                          alert("Error durante la limpieza.");
                        }
                      }
                    }}
                    style={{ background: "#f59e0b", color: "#ffffff", border: "none", padding: "10px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    🧹 Limpieza Personalizada (por fecha)
                  </button>

                  {/* ── INSPECTOR DE CACHÉ LOCAL ── */}
                  <button
                    type="button"
                    onClick={() => {
                      const KNOWN_KEYS = [
                        { key: 'planificacion_days_v2',        label: 'Planificación (días)',       safe: false },
                        { key: 'comentarios_jugadores_v2',     label: 'Comentarios jugadores',      safe: false },
                        { key: 'eventos_bloques_map_v1',       label: 'Bloques de eventos',         safe: false },
                        { key: 'player_events_map_v1',         label: 'Eventos por jugador',        safe: false },
                        { key: 'lesiones_registro_detallado_v1', label: 'Registro de lesiones',     safe: false },
                        { key: 'disponibilidad_map_v1',        label: 'Disponibilidad',             safe: false },
                        { key: 'player_event_minutes_map_v1',  label: 'Minutos por jugador',        safe: false },
                        { key: 'planificacion_comentarios_v1', label: 'Comentarios planificación',  safe: false },
                        { key: 'lesiones_eliminadas_v1',       label: 'Lesiones eliminadas',        safe: true  },
                        { key: 'multas_registro_v9',           label: 'Multas',                     safe: false },
                        { key: 'gps_datos_map_v1',             label: 'GPS datos',                  safe: false },
                        { key: 'informe_microciclo_comentarios_v1', label: 'Comentarios microciclo', safe: true },
                        { key: 'cargas_wellness_general_comments_v1', label: 'Comentarios wellness', safe: true },
                        { key: 'cargas_manual_wellness_v2',    label: 'Wellness manual',            safe: false },
                        { key: 'cargas_manual_md_v1',          label: 'Cargas manual MD',           safe: false },
                        { key: 'bbdd_general_rows_v1',         label: 'BBDD general (caché)',        safe: true  },
                        { key: 'jugadores_db_full_v1',         label: 'Jugadores caché',            safe: true  },
                      ];

                      const rows = KNOWN_KEYS.map(({ key, label, safe }) => {
                        const raw = localStorage.getItem(key);
                        const kb = raw ? (raw.length / 1024).toFixed(1) : '0';
                        return { key, label, kb: parseFloat(kb), safe, exists: !!raw };
                      }).filter(r => r.exists).sort((a, b) => b.kb - a.kb);

                      const totalKB = rows.reduce((s, r) => s + r.kb, 0);
                      const limitKB = 5120;

                      const msg = [
                        `📊 USO CACHÉ LOCAL: ${totalKB.toFixed(0)} KB / ~5.000 KB`,
                        `${'█'.repeat(Math.round(totalKB / limitKB * 30))}${'░'.repeat(30 - Math.round(totalKB / limitKB * 30))} ${(totalKB / limitKB * 100).toFixed(0)}%`,
                        '',
                        ...rows.map(r => `${r.kb > 100 ? '🔴' : r.kb > 30 ? '🟡' : '🟢'} ${r.label}: ${r.kb.toFixed(1)} KB  [${r.key}]`),
                        '',
                        '──────────────────────────────',
                        'Introduce el nombre de la clave a borrar (o deja vacío para cancelar):',
                      ].join('\n');

                      const input = window.prompt(msg, '');
                      if (input && input.trim()) {
                        const keyToDel = input.trim();
                        if (localStorage.getItem(keyToDel) !== null) {
                          if (window.confirm(`¿Borrar "${keyToDel}" del caché local? Los datos solo se perderán si NO están en Supabase.`)) {
                            localStorage.removeItem(keyToDel);
                            alert(`✅ "${keyToDel}" eliminado del caché local. Recarga la página.`);
                          }
                        } else {
                          alert(`No existe la clave "${keyToDel}" en localStorage.`);
                        }
                      }
                    }}
                    style={{ background: "#6366f1", color: "#ffffff", border: "none", padding: "10px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    🗂️ Ver y Limpiar Caché Local
                  </button>

                  <button
                    type="button"
                    disabled={isMigrating}
                    onClick={async () => {
                      if (!window.confirm("¿Deseas volcar cualquier dato o comentario antiguo guardado en el navegador directamente a Supabase Cloud?")) return;
                      
                      setIsMigrating(true);
                      setMigracionStatus("Conectando con Supabase...");
                      try {
                        const { supabase } = await import("@/lib/supabase");
                        let insertsComentarios = 0;
                        let insertsMinutos = 0;
                        
                        // 1. Migrar Comentarios
                        const comRaw = localStorage.getItem("comentarios_jugadores_v2");
                        if (comRaw) {
                          const arr = JSON.parse(comRaw);
                          if (Array.isArray(arr) && arr.length > 0) {
                            const batches = [];
                            for (let i = 0; i < arr.length; i += 500) batches.push(arr.slice(i, i + 500));
                            let batchNum = 0;
                            for (const batch of batches) {
                              batchNum++;
                              setMigracionStatus(`Subiendo comentarios... (lote ${batchNum}/${batches.length})`);
                              const rows = batch.map((c: any) => ({
                                jugador_id: c.jugador_id,
                                fecha: c.fecha,
                                tipo: c.tipo || null,
                                texto: c.texto || ""
                              })).filter((r: any) => r.jugador_id && r.fecha);
                              if (rows.length > 0) {
                                await supabase.from("comentarios_diarios_jugador").insert(rows);
                                insertsComentarios += rows.length;
                              }
                            }
                            localStorage.removeItem("comentarios_jugadores_v2");
                          }
                        }

                        // 2. Migrar Minutos
                        const minRaw = localStorage.getItem("player_event_minutes_map_v1");
                        const evtRaw = localStorage.getItem("player_events_map_v1");
                        if (minRaw) {
                          setMigracionStatus("Procesando minutos de jugadores...");
                          const objMin = JSON.parse(minRaw);
                          const objEvt = evtRaw ? JSON.parse(evtRaw) : {};
                          const rowsMap = new Map();
                          
                          for (const key of Object.keys(objMin)) {
                            const parts = key.split("_");
                            if (parts.length >= 3) {
                              const jugador_id = parts[0];
                              const fecha = parts[1];
                              const evento_id = parts.slice(2).join("_");
                              const mData = objMin[key];
                              const eData = objEvt[key] || null;
                              if (jugador_id && fecha && evento_id && jugador_id.length > 30) {
                                const durVal = parseInt(mData.minutos) || parseInt(mData.duracion) || null;
                                rowsMap.set(key, {
                                  jugador_id, fecha, evento_id,
                                  codigo_evento: eData,
                                  minutos: durVal,
                                  realiza: mData.realiza === true || (durVal ?? 0) > 0,
                                  manual: mData.manual === true
                                });
                              }
                            }
                          }
                          
                          const allRows = Array.from(rowsMap.values());
                          const batches = [];
                          for (let i = 0; i < allRows.length; i += 500) batches.push(allRows.slice(i, i + 500));
                          let batchNum = 0;
                          for (const batch of batches) {
                            batchNum++;
                            setMigracionStatus(`Subiendo minutos... (lote ${batchNum}/${batches.length})`);
                            if (batch.length > 0) {
                              await supabase.from("minutos_jugador_evento").upsert(batch, { onConflict: "jugador_id, fecha, evento_id" });
                              insertsMinutos += batch.length;
                            }
                          }
                          localStorage.removeItem("player_event_minutes_map_v1");
                          localStorage.removeItem("player_events_map_v1");
                        }

                        // 3. Migrar Disponibilidad → estado_diario_jugador
                        let insertsDisp = 0;
                        const dispRaw = localStorage.getItem("disponibilidad_map_v1");
                        if (dispRaw) {
                          setMigracionStatus("Subiendo disponibilidad de jugadores...");
                          const dispObj = JSON.parse(dispRaw);
                          const dispRows: any[] = [];
                          for (const key of Object.keys(dispObj)) {
                            const parts = key.split("_");
                            if (parts.length < 2) continue;
                            const jugador_id = parts[0];
                            const sesion_dia_id = parts.slice(1).join("_");
                            if (!jugador_id || jugador_id.length < 30) continue;
                            if (!/^[0-9a-f-]{36}$/i.test(sesion_dia_id)) continue;
                            const val = dispObj[key];
                            dispRows.push({
                              jugador_id,
                              sesion_dia_id,
                              disponibilidad: val === "D" ? "DISPONIBLE" : val === "ND" ? "NO_DISPONIBLE" : val === "M" ? "MOLESTIAS" : val || "DISPONIBLE"
                            });
                          }
                          if (dispRows.length > 0) {
                            const bDisp: any[][] = [];
                            for (let i = 0; i < dispRows.length; i += 500) bDisp.push(dispRows.slice(i, i + 500));
                            for (const batch of bDisp) {
                              await supabase.from("estado_diario_jugador").upsert(batch, { onConflict: "jugador_id,sesion_dia_id" });
                              insertsDisp += batch.length;
                            }
                            localStorage.removeItem("disponibilidad_map_v1");
                          }
                        }

                        // 4. Migrar Eventos Bloques → sesiones_dia_bloques
                        let insertsBloques = 0;
                        const bloquesRaw = localStorage.getItem("eventos_bloques_map_v1");
                        if (bloquesRaw) {
                          setMigracionStatus("Subiendo bloques de eventos...");
                          const bloquesObj = JSON.parse(bloquesRaw);
                          const bloquesRows: any[] = [];
                          for (const key of Object.keys(bloquesObj)) {
                            const match = key.match(/^(.+)_slot_(\d+)$/);
                            if (!match) continue;
                            const rawDayId = match[1];
                            const slot = parseInt(match[2]);
                            if (!/^[0-9a-f-]{36}$/i.test(rawDayId)) continue;
                            const block = bloquesObj[key];
                            if (!block || typeof block !== "object") continue;
                            bloquesRows.push({
                              day_id: rawDayId, slot,
                              fecha: block.fecha || null, tipo: block.tipo || null,
                              hora: block.hora || null, lugar: block.lugar || null,
                              duracion: block.duracion || null, orientacion: block.orientacion || null,
                              carga: block.carga || null, comentario: block.comentario || null,
                              num_jugadores: block.num_jugadores || null,
                            });
                          }
                          if (bloquesRows.length > 0) {
                            const bBloques: any[][] = [];
                            for (let i = 0; i < bloquesRows.length; i += 500) bBloques.push(bloquesRows.slice(i, i + 500));
                            for (const batch of bBloques) {
                              await supabase.from("sesiones_dia_bloques").upsert(batch, { onConflict: "day_id,slot" });
                              insertsBloques += batch.length;
                            }
                            localStorage.removeItem("eventos_bloques_map_v1");
                          }
                        }

                        // 5. Migrar Planificación de días → sesiones_dia
                        let insertsSesiones = 0;
                        const daysRaw = localStorage.getItem("planificacion_days_v2");
                        if (daysRaw) {
                          setMigracionStatus("Subiendo sesiones de planificación...");
                          const daysArr = JSON.parse(daysRaw);
                          if (Array.isArray(daysArr) && daysArr.length > 0) {
                            const sesionesRows = daysArr
                              .filter((d: any) => d.id && /^[0-9a-f-]{36}$/i.test(d.id))
                              .map((d: any) => ({
                                id: d.id, fecha: d.fecha || null, equipo: d.equipo || null,
                                periodo: d.periodo || null, subperiodo: d.subperiodo || null,
                                semana: d.semana || null, md: d.md || null, rival: d.rival || null,
                                carga: d.carga || null, volumen: d.volumen || null, intensidad: d.intensidad || null,
                                evento_am: d.evento_am || d.evento_principal || null,
                                evento_pm: d.evento_pm || null,
                                comentario_microciclo: d.comentario_microciclo || null,
                              }));
                            if (sesionesRows.length > 0) {
                              const bSes: any[][] = [];
                              for (let i = 0; i < sesionesRows.length; i += 500) bSes.push(sesionesRows.slice(i, i + 500));
                              for (const batch of bSes) {
                                await supabase.from("sesiones_dia").upsert(batch, { onConflict: "id" });
                                insertsSesiones += batch.length;
                              }
                              localStorage.removeItem("planificacion_days_v2");
                            }
                          }
                        }

                        setMigracionStatus(`✅ ¡Completado! ${insertsComentarios} comentarios · ${insertsMinutos} minutos · ${insertsDisp} disponibilidades · ${insertsBloques} bloques · ${insertsSesiones} sesiones. Recargando...`);
                        setTimeout(() => window.location.reload(), 2500);
                      } catch (error: any) {
                        setMigracionStatus("");
                        setIsMigrating(false);
                        alert("Error en la migración: " + error.message);
                      }
                    }}
                    style={{ background: isMigrating ? "#6d28d9" : "#7c3aed", color: "#ffffff", border: "none", padding: "10px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 800, cursor: isMigrating ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px", opacity: isMigrating ? 0.8 : 1 }}
                  >
                    {isMigrating ? `⏳ ${migracionStatus}` : "☁️ Migrar Datos a Supabase"}
                  </button>
                  {migracionStatus && !migracionStatus.startsWith("✅") && isMigrating && (
                    <p style={{ fontSize: "12px", color: "#7c3aed", margin: "4px 0 0 0", fontWeight: 700 }}>{migracionStatus}</p>
                  )}
                  
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("⚠️ ATENCIÓN: Esta acción borrará permanentemente TODA la planificación, eventos, datos de jugadores, comentarios y configuraciones de este navegador. Haz una copia de seguridad antes. ¿Estás absolutamente seguro de que quieres continuar?")) {
                        
for (let i = localStorage.length - 1; i >= 0; i--) {
  const k = localStorage.key(i);
  if (k && !k.startsWith("custom_")) {
    localStorage.removeItem(k);
  }
}

                        alert("Memoria borrada. La aplicación se reiniciará.");
                        window.location.href = "/";
                      }
                    }}
                    style={{ background: "#ef4444", color: "#ffffff", border: "none", padding: "10px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 800, cursor: "pointer", marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    🗑️ Borrar TODO
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CONTENIDO DE LA PESTAÑA: CLUB, TEMPORADA Y ESCUDOS */}
          {activeTab === "club" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* VISTA PREVIA Y CABECERA DEL CLUB */}
              <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)", borderRadius: "12px", padding: "20px", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px", boxShadow: "0 4px 12px rgba(15, 23, 42, 0.15)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div style={{ width: "70px", height: "70px", background: "#ffffff", borderRadius: "12px", padding: "6px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
                    <img
                      src={clubConfig.escudoUrl || undefined}
                      alt={clubConfig.nombreClub}
                      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                      
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: "#93c5fd" }}>
                      ENTIDAD DEPORTIVA • TEMPORADA {clubConfig.temporadaActiva}
                    </span>
                    <h2 style={{ fontSize: "22px", fontWeight: 900, margin: "2px 0 4px 0", color: "#ffffff" }}>
                      {clubConfig.nombreClub || "CE Manresa"} {clubConfig.siglas ? `(${clubConfig.siglas})` : ""}
                    </h2>
                    <span style={{ fontSize: "13px", color: "#cbd5e1", fontWeight: 600 }}>
                      {clubConfig.categoria || "1er Equipo"}
                    </span>
                  </div>
                </div>

                {clubConfig.escudoSecundarioUrl && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(255,255,255,0.1)", padding: "8px 14px", borderRadius: "10px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#cbd5e1" }}>Logo Secundario / Sponsor:</span>
                    <img
                      src={clubConfig.escudoSecundarioUrl || undefined}
                      alt="Secundario"
                      style={{ width: "40px", height: "40px", objectFit: "contain", background: "#ffffff", borderRadius: "6px", padding: "2px" }}
                    />
                  </div>
                )}
              </div>

              {/* FORMULARIO DE DATOS DEL CLUB Y ESCUDOS */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
                {/* BLOQUE 1: DATOS GENERALES DEL CLUB */}
                <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "18px", background: "#f8fafc" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: 900, color: "#1e3a8a", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                    🏛️ Datos Principales del Club
                  </h3>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label style={{ fontSize: "11.5px", fontWeight: 800, color: "#475569", display: "block", marginBottom: "4px" }}>
                        Nombre Oficial del Club:
                      </label>
                      <input
                        type="text"
                        value={clubConfig.nombreClub}
                        onChange={(e) => setClubConfig((prev) => ({ ...prev, nombreClub: e.target.value }))}
                        placeholder="Ej. CE Manresa"
                        style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", fontWeight: 700 }}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div>
                        <label style={{ fontSize: "11.5px", fontWeight: 800, color: "#475569", display: "block", marginBottom: "4px" }}>
                          Siglas / Abreviatura:
                        </label>
                        <input
                          type="text"
                          value={clubConfig.siglas}
                          onChange={(e) => setClubConfig((prev) => ({ ...prev, siglas: e.target.value.toUpperCase() }))}
                          placeholder="Ej. CEM"
                          style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", fontWeight: 700 }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: "11.5px", fontWeight: 800, color: "#475569", display: "block", marginBottom: "4px" }}>
                          Categoría / Sección:
                        </label>
                        <input
                          type="text"
                          value={clubConfig.categoria}
                          onChange={(e) => setClubConfig((prev) => ({ ...prev, categoria: e.target.value }))}
                          placeholder="Ej. 1er Equipo"
                          style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", fontWeight: 700 }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* BLOQUE 2: ESCUDO PRINCIPAL Y ARCHIVOS */}
                <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "18px", background: "#f8fafc" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: 900, color: "#1e3a8a", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                    🛡️ Escudo Principal del Club
                  </h3>

                  <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                    <div style={{ width: "64px", height: "64px", background: "#ffffff", borderRadius: "10px", border: "2px solid #e2e8f0", padding: "4px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <img
                        src={clubConfig.escudoUrl || undefined}
                        alt="Escudo"
                        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                      />
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                      <label style={{ fontSize: "11.5px", fontWeight: 800, color: "#475569" }}>
                        Subir Escudo desde el Ordenador:
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, "escudoUrl")}
                        style={{ fontSize: "12px" }}
                      />
                      <div>
                        <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", display: "block", marginTop: "4px" }}>
                          O pegar URL / Ruta directa:
                        </label>
                        <input
                          type="text"
                          value={clubConfig.escudoUrl}
                          onChange={(e) => setClubConfig((prev) => ({ ...prev, escudoUrl: e.target.value }))}
                          placeholder="Ruta local o https://..."
                          style={{ width: "100%", padding: "5px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px dashed #cbd5e1" }}>
                    <label style={{ fontSize: "11.5px", fontWeight: 800, color: "#475569", display: "block", marginBottom: "4px" }}>
                      Escudo Secundario / Patrocinador (Opcional):
                    </label>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, "escudoSecundarioUrl")}
                        style={{ fontSize: "11px", flex: 1 }}
                      />
                      {clubConfig.escudoSecundarioUrl && (
                        <button
                          type="button"
                          onClick={() => setClubConfig((prev) => ({ ...prev, escudoSecundarioUrl: "" }))}
                          style={{ background: "#fee2e2", color: "#b91c1c", border: "none", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* GESTIÓN DE TEMPORADAS Y CLUBES ASOCIADOS */}
              <div style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "20px", background: "#ffffff", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", flexWrap: "wrap", gap: "12px", borderBottom: "2px solid #f1f5f9", paddingBottom: "14px" }}>
                  <div>
                    <h3 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                      📅 Temporadas y Clubes (Escudo y Datos Específicos por Temporada)
                    </h3>
                    <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>
                      Cada temporada puede pertenecer a un club distinto con su propio escudo, siglas y categoría independiente.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const idNuevo = `temp_${Date.now()}`;
                      setClubConfig((prev) => ({
                        ...prev,
                        temporadas: [
                          ...prev.temporadas,
                          {
                            temporada: "2027/28",
                            equipo: "Nuevo Club",
                            escudoUrl: "",
                            esActiva: false,
                          },
                        ],
                      }));
                    }}
                    style={{ background: "#10b981", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", fontSize: "12.5px", fontWeight: 900, cursor: "pointer", boxShadow: "0 2px 6px rgba(16,185,129,0.3)" }}
                  >
                    + Añadir Temporada / Club
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {clubConfig.temporadas.map((tempItem, idx) => {
                    const isActiva = tempItem.temporada === clubConfig.temporadaActiva && tempItem.equipo === clubConfig.nombreClub;
                    return (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "14px",
                          padding: "16px",
                          borderRadius: "10px",
                          border: isActiva ? "2px solid #0284c7" : "1px solid #e2e8f0",
                          background: isActiva ? "#f0f9ff" : "#f8fafc",
                          boxShadow: isActiva ? "0 4px 12px rgba(2, 132, 199, 0.1)" : "none",
                        }}
                      >
                        {/* Cabecera de la Tarjeta de Temporada */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", borderBottom: "1px dashed #cbd5e1", paddingBottom: "10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <span style={{ fontSize: "14px", fontWeight: 900, color: isActiva ? "#0369a1" : "#1e293b", background: isActiva ? "#e0f2fe" : "#e2e8f0", padding: "4px 10px", borderRadius: "6px" }}>
                              {tempItem.temporada || "Sin Temporada"}
                            </span>
                            <span style={{ fontSize: "14px", fontWeight: 800, color: "#334155" }}>
                              {tempItem.equipo || "Club no definido"}
                            </span>
                            {isActiva && (
                              <span style={{ background: "#22c55e", color: "#ffffff", fontSize: "10.5px", fontWeight: 900, padding: "2px 8px", borderRadius: "12px" }}>
                                ★ TEMPORADA ACTIVA
                              </span>
                            )}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <button
                                type="button"
                                onClick={() => {
                                  setClubConfig((prev) => {
                                    const nextIsActiva = prev.temporadaActiva === tempItem.temporada && prev.nombreClub === tempItem.equipo;
                                    return {
                                      ...prev,
                                      temporadaActiva: nextIsActiva ? "" : tempItem.temporada,
                                      nombreClub: nextIsActiva ? "" : (tempItem.equipo || prev.nombreClub),
                                      escudoUrl: nextIsActiva ? "" : (tempItem.escudoUrl || prev.escudoUrl),
                                    };
                                  });
                                }}
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: "6px",
                                  fontSize: "11.5px",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                  border: isActiva ? "1px solid #fca5a5" : "1px solid #cbd5e1",
                                  background: isActiva ? "#fee2e2" : "#f1f5f9",
                                  color: isActiva ? "#b91c1c" : "#0f172a",
                                }}
                              >
                                {isActiva ? "Deseleccionar" : "Seleccionar como Activa"}
                              </button>

                            {clubConfig.temporadas.length > 1 && (
                              <button
                                type="button"
                                title="Eliminar temporada"
                                onClick={() => {
                                  setClubConfig((prev) => {
                                    const next = prev.temporadas.filter((_, i) => i !== idx);
                                    const newActiva = prev.temporadaActiva === tempItem.temporada ? (next[0]?.temporada || "") : prev.temporadaActiva;
                                    return { ...prev, temporadas: next, temporadaActiva: newActiva };
                                  });
                                }}
                                style={{ background: "#fee2e2", color: "#b91c1c", border: "none", padding: "5px 9px", borderRadius: "6px", fontSize: "11px", fontWeight: 900, cursor: "pointer" }}
                              >
                                🗑️ Eliminar
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Campos de la Temporada / Club */}
                        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
                          {/* ESCUDO INDEPENDIENTE DE ESTA TEMPORADA */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                            <div style={{ width: "62px", height: "62px", background: "#ffffff", borderRadius: "10px", border: "2px solid #cbd5e1", padding: "4px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                              <img
                                src={tempItem.escudoUrl || clubConfig.escudoUrl || undefined}
                                alt={tempItem.equipo}
                                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                                
                              />
                            </div>
                            <label style={{ fontSize: "10.5px", fontWeight: 800, color: "#0284c7", cursor: "pointer", textAlign: "center" }}>
                              <span>📷 Subir Escudo</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleFileUpload(e, "escudoUrl", idx)}
                                style={{ display: "none" }}
                              />
                            </label>
                          </div>

                          {/* DATOS DE TEXTO */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <div>
                              <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569", display: "block", marginBottom: "2px" }}>
                                Temporada:
                              </label>
                              <input
                                type="text"
                                value={tempItem.temporada}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setClubConfig((prev) => {
                                    const next = [...prev.temporadas];
                                    const oldTemp = next[idx].temporada;
                                    next[idx] = { ...next[idx], temporada: val };
                                    return {
                                      ...prev,
                                      temporadas: next,
                                      temporadaActiva: prev.temporadaActiva === oldTemp ? val : prev.temporadaActiva,
                                    };
                                  });
                                }}
                                placeholder="Ej. 2026/27"
                                style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", fontWeight: 800 }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569", display: "block", marginBottom: "2px" }}>
                                Ruta / URL Escudo:
                              </label>
                              <input
                                type="text"
                                value={tempItem.escudoUrl || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setClubConfig((prev) => {
                                    const next = [...prev.temporadas];
                                    next[idx] = { ...next[idx], escudoUrl: val };
                                    const isCurrent = prev.temporadaActiva === tempItem.temporada;
                                    return {
                                      ...prev,
                                      temporadas: next,
                                      escudoUrl: isCurrent ? val : prev.escudoUrl,
                                    };
                                  });
                                }}
                                placeholder="Ruta local o https://..."
                                style={{ width: "100%", padding: "5px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "11.5px" }}
                              />
                            </div>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <div>
                              <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569", display: "block", marginBottom: "2px" }}>
                                Nombre del Club / Equipo:
                              </label>
                              <input
                                type="text"
                                value={tempItem.equipo}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setClubConfig((prev) => {
                                    const next = [...prev.temporadas];
                                    next[idx] = { ...next[idx], equipo: val };
                                    const isCurrent = prev.temporadaActiva === tempItem.temporada;
                                    return {
                                      ...prev,
                                      temporadas: next,
                                      nombreClub: isCurrent ? val : prev.nombreClub,
                                    };
                                  });
                                }}
                                placeholder="Ej. CE Manresa / AE Prat"
                                style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", fontWeight: 800 }}
                              />
                            </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                              <div>
                                <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569", display: "block", marginBottom: "2px" }}>Liga:</label>
                                <input
                                  type="text"
                                  list="ligas-list"
                                  value={tempItem.liga || ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setClubConfig((prev) => {
                                      const next = [...prev.temporadas];
                                      next[idx] = { ...next[idx], liga: val };
                                      return { ...prev, temporadas: next };
                                    });
                                  }}
                                  placeholder="Ej. Segunda Federación"
                                  style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 700 }}
                                />
                                <datalist id="ligas-list">
                                  <option value="Primera División"></option>
                                  <option value="Segunda División"></option>
                                  <option value="Primera Federación"></option>
                                  <option value="Segunda Federación"></option>
                                  <option value="Tercera Federación"></option>
                                  <option value="Lliga Elit"></option>
                                  <option value="Primera Catalana"></option>
                                  <option value="Segona Catalana"></option>
                                </datalist>
                              </div>
                              <div>
                                <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569", display: "block", marginBottom: "2px" }}>Grupo:</label>
                                <input
                                  type="text"
                                  list="grupos-list"
                                  value={tempItem.grupo || ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setClubConfig((prev) => {
                                      const next = [...prev.temporadas];
                                      next[idx] = { ...next[idx], grupo: val };
                                      return { ...prev, temporadas: next };
                                    });
                                  }}
                                  placeholder="Ej. Grupo 3"
                                  style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 700 }}
                                />
                                <datalist id="grupos-list">
                                  <option value="Grupo 1"></option>
                                  <option value="Grupo 2"></option>
                                  <option value="Grupo 3"></option>
                                  <option value="Grupo 4"></option>
                                  <option value="Grupo 5"></option>
                                  <option value="Único"></option>
                                </datalist>
                              </div>

                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* CONTENIDO DE LA PESTAÑA: PANTALLAS */}
          {activeTab === "pantallas" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                  Edición de Nombres, Iconos y Colores de la Barra Principal (Pantallas)
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    const idNuevo = `pantalla_${Date.now()}`;
                    const nueva = { id: idNuevo, name: "Nueva Pantalla", href: `/${idNuevo}`, icon: "📌", color: "#64748b" };
                    setPantallasConfig((prev: any) => [...prev, nueva]);
                  }}
                  style={{
                    background: "#10b981",
                    color: "#ffffff",
                    border: "none",
                    padding: "6px 14px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  ➕ Añadir Pantalla
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                {pantallasConfig.map((item: any, idx: number) => (
                  <div key={item.id + idx} style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f8fafc", position: "relative" }}>
                    
                    {/* Menú de tres puntos a la derecha */}
                    <div style={{ position: "absolute", top: "8px", right: "8px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`¿Eliminar la pantalla "${item.name}"?`)) {
                            setPantallasConfig((prev: any) => prev.filter((_: any, i: number) => i !== idx));
                          }
                        }}
                        title="Opciones / Eliminar pantalla"
                        style={{
                          background: "rgba(0, 0, 0, 0.05)",
                          border: "none",
                          borderRadius: "50%",
                          width: "24px",
                          height: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "14px",
                          fontWeight: 900,
                          cursor: "pointer",
                          color: "#64748b",
                        }}
                      >
                        ⋮
                      </button>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", paddingRight: "28px" }}>
                      <input
                        type="text"
                        value={item.icon}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPantallasConfig((prev: any) => prev.map((p: any, i: number) => i === idx ? { ...p, icon: val } : p));
                        }}
                        style={{ width: "36px", textAlign: "center", fontSize: "16px", padding: "4px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                      />
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPantallasConfig((prev: any) => prev.map((p: any, i: number) => i === idx ? { ...p, name: val } : p));
                        }}
                        style={{ flex: 1, fontSize: "13px", fontWeight: 800, padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>Color distintivo:</label>
                      <input
                        type="color"
                        value={item.color}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPantallasConfig((prev: any) => prev.map((p: any, i: number) => i === idx ? { ...p, color: val } : p));
                        }}
                        style={{ width: "40px", height: "26px", border: "none", borderRadius: "4px", cursor: "pointer" }}
                      />
                      <span style={{ fontSize: "11px", fontFamily: "monospace", color: "#64748b" }}>{item.color}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CONTENIDO DE LA PESTAÑA: EVENTOS */}
          {activeTab === "eventos" && (
            <div>
              {/* Botón para añadir un nuevo tipo de evento */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                  Configuración de Tipos de Eventos
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    const nuevo = { codigo: "Nuevo", nombre: "Nuevo Evento", color: "#0f172a", bg: "#e2e8f0", border: "#cbd5e1" };
                    setEventosConfig((prev) => [...prev, nuevo]);
                  }}
                >
                  ➕ Añadir Tipo de Evento
                </button>
              </div>

              {(() => {
                // Eventos Generales: E (Entrenamiento)
                const generales = eventosConfig.filter((item) => item.codigo === "E" || item.nombre.toLowerCase().startsWith("entrenamiento"));
                // Eventos Específicos: Co, Op, Pa, VD, Vi, Red, Va, Oop, Cop, PaAm, etc.
                const especificos = eventosConfig.filter((item) => !generales.includes(item));

                const renderEventCard = (item: TipoEventoConfig) => {
                  const idx = eventosConfig.findIndex((e) => e === item);
                  return (
                    <div key={item.codigo + idx} style={{ padding: "12px", border: "1px solid #cbd5e1", borderRadius: "8px", background: item.bg, color: item.color, position: "relative" }}>
                      
                      {/* Menú de tres puntos a la derecha */}
                      <div style={{ position: "absolute", top: "8px", right: "8px" }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`¿Eliminar el tipo de evento "${item.codigo} - ${item.nombre}"?`)) {
                              setEventosConfig((prev) => prev.filter((_, i) => i !== idx));
                            }
                          }}
                          title="Opciones / Eliminar evento"
                          style={{
                            background: "rgba(0, 0, 0, 0.08)",
                            border: "none",
                            borderRadius: "50%",
                            width: "24px",
                            height: "24px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "14px",
                            fontWeight: 900,
                            cursor: "pointer",
                            color: "inherit",
                          }}
                        >
                          ⋮
                        </button>
                      </div>

                      <div style={{ display: "flex", gap: "8px", marginBottom: "8px", paddingRight: "28px" }}>
                        <input
                          type="text"
                          value={item.codigo}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEventosConfig((prev) => prev.map((ev, i) => i === idx ? { ...ev, codigo: val } : ev));
                          }}
                          placeholder="Código"
                          style={{ width: "70px", fontWeight: 900, fontSize: "12px", padding: "4px 8px", borderRadius: "6px", border: "1px solid #94a3b8" }}
                        />
                        <input
                          type="text"
                          value={item.nombre}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEventosConfig((prev) => prev.map((ev, i) => i === idx ? { ...ev, nombre: val } : ev));
                          }}
                          placeholder="Nombre completo"
                          style={{ flex: 1, fontWeight: 800, fontSize: "12px", padding: "4px 8px", borderRadius: "6px", border: "1px solid #94a3b8" }}
                        />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "11px", fontWeight: 700 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <span>Texto:</span>
                          <input
                            type="color"
                            value={item.color}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEventosConfig((prev) => prev.map((ev, i) => i === idx ? { ...ev, color: val } : ev));
                            }}
                            style={{ width: "32px", height: "24px", border: "none", cursor: "pointer" }}
                          />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <span>Fondo:</span>
                          <input
                            type="color"
                            value={item.bg}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEventosConfig((prev) => prev.map((ev, i) => i === idx ? { ...ev, bg: val, border: val } : ev));
                            }}
                            style={{ width: "32px", height: "24px", border: "none", cursor: "pointer" }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                };

                return (
                  <>
                    {/* SUB-SECCIÓN 1: EVENTOS GENERALES */}
                    <div style={{ marginBottom: "24px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", borderBottom: "1.5px solid #cbd5e1", paddingBottom: "6px" }}>
                        <span style={{ fontSize: "16px" }}>🏃</span>
                        <h4 style={{ fontSize: "14px", fontWeight: 900, color: "#166534", margin: 0, textTransform: "uppercase" }}>
                          Eventos Generales (E - Entrenamiento)
                        </h4>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
                        {generales.map(renderEventCard)}
                      </div>
                    </div>

                    {/* SUB-SECCIÓN 2: EVENTOS ESPECÍFICOS */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", borderBottom: "1.5px solid #cbd5e1", paddingBottom: "6px" }}>
                        <span style={{ fontSize: "16px" }}>🎯</span>
                        <h4 style={{ fontSize: "14px", fontWeight: 900, color: "#1e3a8a", margin: 0, textTransform: "uppercase" }}>
                          Eventos Específicos (Co, Op, Pa, VD, Vi, Red, Va, etc.)
                        </h4>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
                        {especificos.map(renderEventCard)}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* CONTENIDO DE LA PESTAÑA: DISPONIBILIDAD */}
          {activeTab === "disponibilidad" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                  Edición de Códigos de Disponibilidad (D, NDR, NDL, P, L, etc.)
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    const nuevo = { codigo: "NUEVO", nombre: "Nuevo Estado", color: "#64748b", textColor: "#ffffff", categoriaSemaforo: "amarillo" };
                    setDisponibilidadConfig((prev: any) => [...prev, nuevo]);
                  }}
                  style={{
                    background: "#10b981",
                    color: "#ffffff",
                    border: "none",
                    padding: "6px 14px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  ➕ Añadir Disponibilidad
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                {disponibilidadConfig.map((item: any, idx: number) => (
                  <div key={item.codigo + idx} style={{ padding: "12px", border: `2px solid ${item.color || "#cbd5e1"}`, borderRadius: "8px", background: "#ffffff", position: "relative" }}>
                    
                    {/* Menú de tres puntos a la derecha */}
                    <div style={{ position: "absolute", top: "8px", right: "8px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`¿Eliminar la disponibilidad "${item.codigo} - ${item.nombre}"?`)) {
                            setDisponibilidadConfig((prev: any) => prev.filter((_: any, i: number) => i !== idx));
                          }
                        }}
                        title="Opciones / Eliminar estado"
                        style={{
                          background: "rgba(0, 0, 0, 0.05)",
                          border: "none",
                          borderRadius: "50%",
                          width: "24px",
                          height: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "14px",
                          fontWeight: 900,
                          cursor: "pointer",
                          color: "#64748b",
                        }}
                      >
                        ⋮
                      </button>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", paddingRight: "28px" }}>
                      <input
                        type="text"
                        value={item.codigo}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDisponibilidadConfig((prev: any) => prev.map((d: any, i: number) => i === idx ? { ...d, codigo: val } : d));
                        }}
                        placeholder="Cód"
                        style={{ width: "65px", fontWeight: 900, fontSize: "12px", padding: "4px 6px", borderRadius: "6px", border: "1px solid #94a3b8", textAlign: "center" }}
                      />
                      <input
                        type="text"
                        value={item.nombre}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDisponibilidadConfig((prev: any) => prev.map((d: any, i: number) => i === idx ? { ...d, nombre: val } : d));
                        }}
                        style={{ flex: 1, fontSize: "12.5px", fontWeight: 800, padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "11px", fontWeight: 700 }}>
                      <label>Categoría Semáforo:</label>
                      <select
                        value={item.categoriaSemaforo}
                        onChange={(e) => {
                          const val = e.target.value;
                          const colorMap: any = { verde: "#22c55e", amarillo: "#eab308", rojo: "#ef4444" };
                          setDisponibilidadConfig((prev: any) => prev.map((d: any, i: number) => i === idx ? { ...d, categoriaSemaforo: val, color: colorMap[val] || d.color } : d));
                        }}
                        style={{ fontSize: "11px", fontWeight: 800, padding: "3px 6px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                      >
                        <option value="verde">🟢 Verde (Disponible)</option>
                        <option value="amarillo">🟡 Amarillo (Con Cuidado)</option>
                        <option value="rojo">🔴 Rojo (No Disponible)</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CONTENIDO DE LA PESTAÑA: RIVALES */}
          {activeTab === "rivales" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                    🛡️ Gestión de Equipos Rivales y Escudos
                  </h3>
                  <p style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                    Introduce la dirección de imagen (URL) o sube el archivo del escudo de cada equipo rival. Se mostrarán automáticamente en la fila &quot;Escudo&quot; de Planificación.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <select
                    id="league_select"
                    style={{ padding: "6px 10px", borderRadius: "6px", fontSize: "12px", border: "1px solid #cbd5e1" }}
                  >
                    <option value="primera">Primera RFEF Grupo 2</option>
                    <option value="segunda">Segunda RFEF G3 (Cat/Ara/Val)</option>
                  </select>
                  <button
                    onClick={() => {
                      const sel = document.getElementById('league_select') as HTMLSelectElement;
                      const conf = confirm("¿Deseas restaurar todos los escudos oficiales para " + sel.options[sel.selectedIndex].text + "? Esto sobrescribirá tus rivales actuales.");
                      if (conf) {
                        const ligasMap: any = {
                          "primera": PRIMERA_RFEF_G2_2627,
                          "segunda": DEFAULT_RIVALES
                        };
                        const targetList = ligasMap[sel.value];
                        if (targetList) {
                          setRivalesConfig(targetList);
                          saveStoredRivales(targetList);
                        }
                      }
                    }}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 800,
                      background: "#0284c7",
                      color: "#ffffff",
                      border: "1px solid #0369a1",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                  >
                    🔄 Cargar Equipos Oficiales
                  </button>
                </div>
              </div>

              {/* FORMULARIO PARA AÑADIR NUEVO RIVAL */}
              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
                <h4 style={{ fontSize: "13px", fontWeight: 800, color: "#1e293b", marginBottom: "12px" }}>
                  ➕ Añadir Nuevo Rival
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr)) auto", gap: "12px", alignItems: "end" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "4px" }}>
                      Nombre del Equipo Rival *
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: CF Badalona"
                      value={newRivalName}
                      onChange={(e) => setNewRivalName(e.target.value)}
                      style={{ width: "100%", fontSize: "13px", fontWeight: 600, padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "4px" }}>
                      Dirección de Imagen (URL) del Escudo
                    </label>
                    <input
                      type="text"
                      placeholder="https://.../escudo.png"
                      value={newRivalEscudoUrl}
                      onChange={(e) => setNewRivalEscudoUrl(e.target.value)}
                      style={{ width: "100%", fontSize: "13px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <label
                      style={{
                        padding: "8px 14px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 700,
                        background: "#ffffff",
                        color: "#0284c7",
                        border: "1px solid #0284c7",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      📁 Subir archivo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleRivalFileUpload(e)}
                        style={{ display: "none" }}
                      />
                    </label>

                    {newRivalEscudoUrl && (
                      <img
                        src={newRivalEscudoUrl || undefined}
                        alt="Preview"
                        style={{ width: "32px", height: "32px", objectFit: "contain", background: "#ffffff", borderRadius: "4px", border: "1px solid #cbd5e1", padding: "2px" }}
                        onError={(e: any) => { e.currentTarget.style.display = "none"; }}
                      />
                    )}

                    <button
                      onClick={() => {
                        const trimmed = newRivalName.trim().toUpperCase();
                        if (!trimmed) {
                          alert("Por favor introduce el nombre del equipo");
                          return;
                        }
                        const id = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "-");
                        const cleanUrl = newRivalEscudoUrl.trim();
                        upsertSingleRivalBBDD({
                          id,
                          nombre: trimmed,
                          escudo_url: cleanUrl
                        }).catch(console.error);

                        setRivalesConfig((prev) => {
                          const next = [{ id, nombre: trimmed, escudoUrl: cleanUrl }, ...prev.filter(r => r.id !== id)];
                          saveStoredRivales(next);
                          return next;
                        });
                        setNewRivalName("");
                        setNewRivalEscudoUrl("");
                      }}
                      style={{
                        padding: "8px 18px",
                        borderRadius: "6px",
                        fontSize: "13px",
                        fontWeight: 800,
                        background: "#0284c7",
                        color: "#ffffff",
                        border: "none",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Añadir
                    </button>
                  </div>
                </div>
              </div>

              {/* BUSCADOR Y CONTADOR */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
                  {rivalesConfig.length} equipos configurados
                </span>
                <input
                  type="text"
                  placeholder="🔍 Buscar rival..."
                  value={rivalSearch}
                  onChange={(e) => setRivalSearch(e.target.value)}
                  style={{ width: "220px", fontSize: "12px", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              {/* LISTA / TABLA DE RIVALES */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", borderBottom: "1px solid #cbd5e1" }}>
                      <th style={{ padding: "10px 14px", width: "70px", color: "#475569", fontWeight: 800, textAlign: "center" }}>Escudo</th>
                      <th style={{ padding: "10px 14px", width: "220px", color: "#475569", fontWeight: 800 }}>Nombre Equipo</th>
                      <th style={{ padding: "10px 14px", color: "#475569", fontWeight: 800 }}>Dirección de imagen (URL) del escudo</th>
                      <th style={{ padding: "10px 14px", width: "160px", color: "#475569", fontWeight: 800, textAlign: "center" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rivalesConfig
                      .filter((r) => !rivalSearch || r.nombre.toLowerCase().includes(rivalSearch.toLowerCase()))
                      .map((rival, idx) => {
                        const originalIdx = rivalesConfig.findIndex((r) => r.id === rival.id);
                        return (
                          <tr key={rival.id || idx} style={{ borderBottom: "1px solid #f1f5f9", background: idx % 2 === 0 ? "#ffffff" : "#fcfdfd" }}>
                            <td style={{ padding: "8px 12px", textAlign: "center", verticalAlign: "middle" }}>
                              {rival.escudoUrl ? (
                                <img
                                  src={rival.escudoUrl || undefined}
                                  alt={rival.nombre}
                                  style={{ width: "32px", height: "32px", objectFit: "contain", display: "inline-block" }}
                                  onError={(e: any) => {
                                    const fallback = findRivalEscudoUrl(rival.nombre, DEFAULT_RIVALES);
                                    if (fallback && !fallback.includes("wikimedia.org") && e.currentTarget.src !== fallback) {
                                      e.currentTarget.src = fallback;
                                    } else {
                                      e.currentTarget.style.opacity = "0.2";
                                    }
                                  }}
                                />
                              ) : (
                                <span style={{ fontSize: "18px", opacity: 0.3 }} title="Sin escudo">🛡️</span>
                              )}
                            </td>
                            <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>
                              <input
                                type="text"
                                value={rival.nombre}
                                onChange={(e) => {
                                  const val = e.target.value.toUpperCase();
                                  setRivalesConfig((prev) => {
                                    const next = prev.map((r, i) => (i === originalIdx ? { ...r, nombre: val } : r));
                                    saveStoredRivales(next);
                                    if (prev[originalIdx]) {
                                      upsertSingleRivalBBDD({
                                        id: prev[originalIdx].id,
                                        nombre: val,
                                        escudo_url: prev[originalIdx].escudoUrl
                                      }).catch(console.error);
                                    }
                                    return next;
                                  });
                                }}
                                style={{ width: "100%", fontSize: "13px", fontWeight: 700, color: "#1e293b", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                              />
                            </td>
                            <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>
                              <input
                                type="text"
                                placeholder="Pega aquí la URL de la imagen del escudo..."
                                value={rival.escudoUrl || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setRivalesConfig((prev) => {
                                    const next = prev.map((r, i) => (i === originalIdx ? { ...r, escudoUrl: val } : r));
                                    saveStoredRivales(next);
                                    if (prev[originalIdx]) {
                                      upsertSingleRivalBBDD({
                                        id: prev[originalIdx].id,
                                        nombre: prev[originalIdx].nombre,
                                        escudo_url: val
                                      }).catch(console.error);
                                    }
                                    return next;
                                  });
                                }}
                                style={{ width: "100%", fontSize: "12px", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", color: "#0f172a" }}
                              />
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "center", verticalAlign: "middle" }}>
                              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "6px" }}>
                                <label
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: "6px",
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    background: "#f0f9ff",
                                    color: "#0369a1",
                                    border: "1px solid #bae6fd",
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                  }}
                                  title="Subir archivo de imagen para este escudo"
                                >
                                  📁 Subir
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleRivalFileUpload(e, originalIdx)}
                                    style={{ display: "none" }}
                                  />
                                </label>
                                <button
                                  onClick={() => {
                                    if (confirm("¿Eliminar rival \"" + rival.nombre + "\"?")) {
                                      setRivalesConfig((prev) => {
                                        const next = prev.filter((_, i) => i !== originalIdx);
                                        saveStoredRivales(next);
                                        return next;
                                      });
                                    }
                                  }}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: "6px",
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    background: "#fef2f2",
                                    color: "#b91c1c",
                                    border: "1px solid #fecaca",
                                    cursor: "pointer",
                                  }}
                                  title="Eliminar rival"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CONTENIDO DE LA PESTAÑA: BASE DE DATOS */}
          {activeTab === "bbdd" && (
            <div>
              <h3 style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", marginBottom: "14px" }}>
                Edición de Nomenclaturas y Etiquetas de la Base de Datos (BBDD)
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                {bbddConfig.map((item: any, idx: number) => (
                  <div key={item.id} style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f8fafc" }}>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "4px" }}>
                      Identificador BBDD: <code>{item.id}</code>
                    </label>
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBbddConfig((prev: any) => prev.map((b: any, i: number) => i === idx ? { ...b, name: val } : b));
                      }}
                      style={{ width: "100%", fontSize: "13px", fontWeight: 800, padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CONTENIDO DE LA PESTAÑA: BASES DE DATOS EXTERNAS (WELLNESS, GPS, ETC.) */}
          {activeTab === "links_externos" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* CABECERA DE LA SECCIÓN */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "14px", background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)", padding: "20px 24px", borderRadius: "12px", color: "#ffffff", boxShadow: "0 4px 12px rgba(15, 23, 42, 0.15)" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "24px" }}>🔗</span>
                    <h3 style={{ fontSize: "18px", fontWeight: 900, margin: 0, letterSpacing: "-0.01em" }}>
                      Enlaces a Bases de Datos Externas
                    </h3>
                  </div>
                  <p style={{ margin: "6px 0 0 0", fontSize: "12.5px", color: "#94a3b8", maxWidth: "680px", lineHeight: "1.4" }}>
                    Configura los accesos directos a tus fuentes externas de <strong>Wellness (Carga Interna)</strong> y <strong>GPS (Carga Externa)</strong>. Puedes vincular hojas de Google Sheets, formularios, carpetas compartidas en la nube o plataformas oficiales como Wimu, Catapult o STATSports.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={handleSaveExternalLinks}
                    disabled={isSavingExternalLinks}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "9px 18px",
                      borderRadius: "8px",
                      background: "#10b981",
                      color: "#ffffff",
                      fontSize: "13px",
                      fontWeight: 800,
                      border: "none",
                      cursor: "pointer",
                      boxShadow: "0 2px 6px rgba(16, 185, 129, 0.3)",
                      transition: "all 0.15s ease",
                      opacity: isSavingExternalLinks ? 0.7 : 1,
                    }}
                  >
                    <span>💾</span> {isSavingExternalLinks ? "Guardando..." : "Guardar Enlaces en BBDD"}
                  </button>
                </div>
              </div>

              {externalLinksSaveMsg && (
                <div style={{ padding: "12px 16px", borderRadius: "8px", background: "#dcfce7", color: "#166534", fontSize: "13px", fontWeight: 700, border: "1px solid #86efac", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>✓</span> {externalLinksSaveMsg}
                </div>
              )}

              {/* GRID PRINCIPAL: 2 TARJETAS DESTACADAS (WELLNESS Y GPS) */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "20px" }}>
                {/* TARJETA 1: WELLNESS (CARGA INTERNA) */}
                <div style={{ border: "1.5px solid #bae6fd", borderRadius: "12px", background: "#ffffff", padding: "20px", display: "flex", flexDirection: "column", gap: "16px", boxShadow: "0 2px 8px rgba(2, 132, 199, 0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e0f2fe", paddingBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
                        🌿
                      </div>
                      <div>
                        <h4 style={{ fontSize: "15px", fontWeight: 900, color: "#0369a1", margin: 0 }}>
                          Base de Datos Wellness
                        </h4>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#0284c7" }}>
                          Carga Interna · Respuestas y Cuestionarios
                        </span>
                      </div>
                    </div>

                    <span style={{
                      padding: "4px 8px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: 800,
                      background: externalLinks.wellness?.url ? "#dcfce7" : "#f1f5f9",
                      color: externalLinks.wellness?.url ? "#15803d" : "#64748b",
                      border: externalLinks.wellness?.url ? "1px solid #bbf7d0" : "1px solid #e2e8f0"
                    }}>
                      {externalLinks.wellness?.url ? "● Enlace configurado" : "○ Sin enlace"}
                    </span>
                  </div>

                  {/* Campo URL */}
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a", display: "block", marginBottom: "6px" }}>
                      URL del Enlace / Base de Datos:
                    </label>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <input
                        type="url"
                        placeholder="https://docs.google.com/spreadsheets/d/... o https://forms.gle/..."
                        value={externalLinks.wellness?.url || ""}
                        onChange={(e) => setExternalLinks(prev => ({
                          ...prev,
                          wellness: { ...(prev.wellness || {}), url: e.target.value }
                        }))}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          borderRadius: "8px",
                          border: "1.5px solid #cbd5e1",
                          fontSize: "12.5px",
                          fontFamily: "monospace",
                          outline: "none",
                        }}
                      />
                      {externalLinks.wellness?.url && (
                        <>
                          <a
                            href={externalLinks.wellness.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: "8px 12px",
                              borderRadius: "8px",
                              background: "#0284c7",
                              color: "#ffffff",
                              fontSize: "12px",
                              fontWeight: 800,
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              whiteSpace: "nowrap"
                            }}
                            title="Abrir enlace en pestaña nueva"
                          >
                            Abrir ↗
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCopyLink(externalLinks.wellness.url, "wellness")}
                            style={{
                              padding: "8px 10px",
                              borderRadius: "8px",
                              border: "1px solid #cbd5e1",
                              background: "#f8fafc",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer",
                              color: "#475569"
                            }}
                            title="Copiar enlace"
                          >
                            {copiedLink === "wellness" ? "✓" : "📋"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Nombre y Proveedor */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                        Nombre / Etiqueta:
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Google Sheets Wellness"
                        value={externalLinks.wellness?.nombre || ""}
                        onChange={(e) => setExternalLinks(prev => ({
                          ...prev,
                          wellness: { ...(prev.wellness || {}), nombre: e.target.value }
                        }))}
                        style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                        Plataforma / Proveedor:
                      </label>
                      <select
                        value={externalLinks.wellness?.proveedor || "Google Sheets"}
                        onChange={(e) => setExternalLinks(prev => ({
                          ...prev,
                          wellness: { ...(prev.wellness || {}), proveedor: e.target.value }
                        }))}
                        style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", background: "#ffffff" }}
                      >
                        <option value="Google Sheets">Google Sheets</option>
                        <option value="Google Forms">Google Forms</option>
                        <option value="Microsoft Forms">Microsoft Forms</option>
                        <option value="Typeform">Typeform</option>
                        <option value="Notion">Notion</option>
                        <option value="Airtable">Airtable</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                  </div>

                  {/* Notas */}
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      Notas o Instrucciones para el Cuerpo Técnico:
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Cuestionarios diarios que completan los deportistas cada mañana..."
                      value={externalLinks.wellness?.notas || ""}
                      onChange={(e) => setExternalLinks(prev => ({
                        ...prev,
                        wellness: { ...(prev.wellness || {}), notas: e.target.value }
                      }))}
                      style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", resize: "vertical" }}
                    />
                  </div>
                </div>

                {/* TARJETA 2: GPS (CARGA EXTERNA) */}
                <div style={{ border: "1.5px solid #fed7aa", borderRadius: "12px", background: "#ffffff", padding: "20px", display: "flex", flexDirection: "column", gap: "16px", boxShadow: "0 2px 8px rgba(249, 115, 22, 0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #ffedd5", paddingBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "#ffedd5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
                        🛰️
                      </div>
                      <div>
                        <h4 style={{ fontSize: "15px", fontWeight: 900, color: "#c2410c", margin: 0 }}>
                          Base de Datos GPS
                        </h4>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#ea580c" }}>
                          Carga Externa · Dispositivos y Métricas Físicas
                        </span>
                      </div>
                    </div>

                    <span style={{
                      padding: "4px 8px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: 800,
                      background: externalLinks.gps?.url ? "#dcfce7" : "#f1f5f9",
                      color: externalLinks.gps?.url ? "#15803d" : "#64748b",
                      border: externalLinks.gps?.url ? "1px solid #bbf7d0" : "1px solid #e2e8f0"
                    }}>
                      {externalLinks.gps?.url ? "● Enlace configurado" : "○ Sin enlace"}
                    </span>
                  </div>

                  {/* Campo URL */}
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a", display: "block", marginBottom: "6px" }}>
                      URL del Enlace / Base de Datos:
                    </label>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <input
                        type="url"
                        placeholder="https://cloud.wimu.es/... o https://drive.google.com/..."
                        value={externalLinks.gps?.url || ""}
                        onChange={(e) => setExternalLinks(prev => ({
                          ...prev,
                          gps: { ...(prev.gps || {}), url: e.target.value }
                        }))}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          borderRadius: "8px",
                          border: "1.5px solid #cbd5e1",
                          fontSize: "12.5px",
                          fontFamily: "monospace",
                          outline: "none",
                        }}
                      />
                      {externalLinks.gps?.url && (
                        <>
                          <a
                            href={externalLinks.gps.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: "8px 12px",
                              borderRadius: "8px",
                              background: "#ea580c",
                              color: "#ffffff",
                              fontSize: "12px",
                              fontWeight: 800,
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              whiteSpace: "nowrap"
                            }}
                            title="Abrir enlace en pestaña nueva"
                          >
                            Abrir ↗
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCopyLink(externalLinks.gps.url, "gps")}
                            style={{
                              padding: "8px 10px",
                              borderRadius: "8px",
                              border: "1px solid #cbd5e1",
                              background: "#f8fafc",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer",
                              color: "#475569"
                            }}
                            title="Copiar enlace"
                          >
                            {copiedLink === "gps" ? "✓" : "📋"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Nombre y Proveedor */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                        Nombre / Etiqueta:
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Wimu Cloud / Repositorio GPS"
                        value={externalLinks.gps?.nombre || ""}
                        onChange={(e) => setExternalLinks(prev => ({
                          ...prev,
                          gps: { ...(prev.gps || {}), nombre: e.target.value }
                        }))}
                        style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                        Plataforma / Proveedor:
                      </label>
                      <select
                        value={externalLinks.gps?.proveedor || "Wimu Cloud"}
                        onChange={(e) => setExternalLinks(prev => ({
                          ...prev,
                          gps: { ...(prev.gps || {}), proveedor: e.target.value }
                        }))}
                        style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", background: "#ffffff" }}
                      >
                        <option value="Wimu Cloud">Wimu Cloud</option>
                        <option value="Catapult OpenField">Catapult OpenField</option>
                        <option value="STATSports Sonra">STATSports Sonra</option>
                        <option value="GPSports">GPSports</option>
                        <option value="Google Drive">Google Drive</option>
                        <option value="OneDrive">OneDrive</option>
                        <option value="Dropbox">Dropbox</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                  </div>

                  {/* Notas */}
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      Notas o Instrucciones para el Cuerpo Técnico:
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Exportaciones en CSV con métricas de distancia, HSR, sprints y player load..."
                      value={externalLinks.gps?.notas || ""}
                      onChange={(e) => setExternalLinks(prev => ({
                        ...prev,
                        gps: { ...(prev.gps || {}), notas: e.target.value }
                      }))}
                      style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", resize: "vertical" }}
                    />
                  </div>
                </div>
              </div>

              {/* TARJETA 3: ENLACES ADICIONALES PERSONALIZADOS */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", background: "#ffffff", padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
                  <div>
                    <h4 style={{ fontSize: "14.5px", fontWeight: 900, color: "#0f172a", margin: 0 }}>
                      ➕ Enlaces Externos Adicionales (Vídeo, Médico, Gimnasio, etc.)
                    </h4>
                    <span style={{ fontSize: "11.5px", color: "#64748b" }}>
                      Agrega otros accesos directos que el cuerpo técnico necesite consultar regularmente.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddCustomLink}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      background: "#f1f5f9",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                      fontWeight: 800,
                      color: "#1e3a8a",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <span>＋</span> Añadir Enlace
                  </button>
                </div>

                {(!externalLinks.adicionales || externalLinks.adicionales.length === 0) ? (
                  <div style={{ padding: "16px", textAlign: "center", color: "#94a3b8", fontSize: "12px", fontStyle: "italic", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
                    No hay enlaces adicionales configurados. Pulsa en "＋ Añadir Enlace" si deseas registrar otros accesos.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {externalLinks.adicionales.map((item, idx) => (
                      <div key={item.id || idx} style={{ padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", display: "grid", gridTemplateColumns: "180px 1fr auto", gap: "10px", alignItems: "center" }}>
                        <input
                          type="text"
                          placeholder="Nombre (ej. Wyscout / Vídeo)"
                          value={item.nombre}
                          onChange={(e) => {
                            const val = e.target.value;
                            setExternalLinks(prev => ({
                              ...prev,
                              adicionales: (prev.adicionales || []).map((l, i) => i === idx ? { ...l, nombre: val } : l)
                            }));
                          }}
                          style={{ padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 700 }}
                        />
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <input
                            type="url"
                            placeholder="https://..."
                            value={item.url}
                            onChange={(e) => {
                              const val = e.target.value;
                              setExternalLinks(prev => ({
                                ...prev,
                                adicionales: (prev.adicionales || []).map((l, i) => i === idx ? { ...l, url: val } : l)
                              }));
                            }}
                            style={{ flex: 1, padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", fontFamily: "monospace" }}
                          />
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ padding: "6px 10px", borderRadius: "6px", background: "#1e3a8a", color: "#ffffff", fontSize: "11px", fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap" }}
                            >
                              Abrir ↗
                            </a>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomLink(item.id)}
                          style={{ padding: "6px 8px", borderRadius: "6px", background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* BOTÓN INFERIOR DE GUARDADO */}
              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "8px" }}>
                <button
                  type="button"
                  onClick={handleSaveExternalLinks}
                  disabled={isSavingExternalLinks}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 24px",
                    borderRadius: "8px",
                    background: "#10b981",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 900,
                    border: "none",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
                    transition: "all 0.15s ease",
                    opacity: isSavingExternalLinks ? 0.7 : 1,
                  }}
                >
                  <span>💾</span> {isSavingExternalLinks ? "Guardando en Base de Datos..." : "Guardar Todos los Enlaces Externos"}
                </button>
              </div>
            </div>
          )}

        </div>
      </section>
    </div>
  );
}
