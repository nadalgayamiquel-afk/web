"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { syncGpsDatabaseWeb } from "@/app/actions";

export function ReportNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const links = [
    { href: "/informes/gps-diario", label: "Sesión" },
    { href: "/informes/microciclo", label: "Microciclo" },
    { href: "/informes/mesociclo", label: "Mesociclo" },
    { href: "/informes/anual", label: "Anual" },
  ];

  const handleSyncGps = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncFeedback("Sincronizando...");
    try {
      const res = await syncGpsDatabaseWeb();
      if (res.success) {
        setSyncFeedback(`✓ ${res.totalRecords} reg. (${res.datesProcessed?.length || 0} sesiones)`);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("gps_synced", { detail: res }));
        }
        router.refresh();
      } else {
        setSyncFeedback("Error al sincronizar");
      }
    } catch {
      setSyncFeedback("Error al sincronizar");
    } finally {
      setIsSyncing(false);
      setTimeout(() => {
        setSyncFeedback(null);
      }, 4000);
    }
  };

  return (
    <div
      className="no-print"
      style={{
        position: "absolute",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: "4px",
        padding: "3px 6px",
        background: "rgba(255, 255, 255, 0.94)",
        backdropFilter: "blur(6px)",
        borderRadius: "12px",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        border: "1px solid rgba(226, 232, 240, 0.8)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      {links.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            style={{
              fontSize: "10.5px",
              fontWeight: isActive ? 800 : 600,
              padding: "2px 8px",
              borderRadius: "8px",
              background: isActive ? "#0f172a" : "transparent",
              color: isActive ? "#ffffff" : "#64748b",
              textDecoration: "none",
              transition: "all 0.15s ease",
            }}
          >
            {link.label}
          </Link>
        );
      })}

      <div style={{ width: "1px", height: "12px", background: "#cbd5e1", margin: "0 2px" }} />

      {/* Botón discreto para actualizar la DB GPS a la web */}
      <button
        onClick={handleSyncGps}
        disabled={isSyncing}
        title="Actualizar base de datos GPS desde nube y archivos descargados a la web"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "10px",
          fontWeight: 700,
          padding: "2px 7px",
          borderRadius: "6px",
          border: "none",
          background: isSyncing ? "#f1f5f9" : "transparent",
          color: syncFeedback && syncFeedback.startsWith("✓") ? "#15803d" : "#475569",
          cursor: isSyncing ? "default" : "pointer",
          transition: "all 0.15s ease",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          if (!isSyncing) e.currentTarget.style.background = "#f1f5f9";
        }}
        onMouseLeave={(e) => {
          if (!isSyncing) e.currentTarget.style.background = "transparent";
        }}
      >
        <span
          style={{
            fontSize: "10.5px",
            display: "inline-block",
            transform: isSyncing ? "rotate(180deg)" : "none",
            transition: isSyncing ? "transform 0.8s linear infinite" : "none",
          }}
        >
          🔄
        </span>
        <span>{syncFeedback || (isSyncing ? "Cargando..." : "Actualizar GPS")}</span>
      </button>
    </div>
  );
}
