"use client";

import { useEffect, useState } from "react";
import { getFullExcelBBDDRows, getClubConfig } from "@/app/actions";
import { BBDDTableClient } from "./bbdd-client";

export default function BBDDGeneralPage() {
  const [data, setData] = useState<{ rows: any[]; jugadores: any[] }>({ rows: [], jugadores: [] });
  const [loading, setLoading] = useState(true);
  const [activeTeam, setActiveTeam] = useState<string>("CE Europa");

  useEffect(() => {
    try {
      getClubConfig()
        .then((conf) => {
          if (conf?.nombreClub) {
            setActiveTeam(conf.nombreClub);
            if (typeof window !== "undefined") {
              localStorage.setItem("active_team", conf.nombreClub);
            }
          }
        })
        .catch(() => {
          const savedTeam = localStorage.getItem("active_team");
          if (savedTeam) setActiveTeam(savedTeam);
        });
    } catch {}
  }, []);

  useEffect(() => {
    const handleSync = () => {
      const savedTeam = localStorage.getItem("active_team");
      if (savedTeam && savedTeam !== activeTeam) {
        setActiveTeam(savedTeam);
      }
    };
    window.addEventListener("storage", handleSync);
    window.addEventListener("focus", handleSync);
    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("focus", handleSync);
    };
  }, [activeTeam]);

  useEffect(() => {
    setLoading(true);
    getFullExcelBBDDRows(activeTeam)
      .then((res) => {
        if (res) setData({ rows: res.rows || [], jugadores: res.jugadores || [] });
      })
      .catch((err) => {
        console.error("Error cargando BBDD:", err);
      })
      .finally(() => setLoading(false));
  }, [activeTeam]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-amber-400">
        <p className="animate-pulse text-lg font-semibold">Cargando Base de Datos ({activeTeam})...</p>
      </div>
    );
  }

  return <BBDDTableClient initialRows={data.rows} players={data.jugadores} />;
}
