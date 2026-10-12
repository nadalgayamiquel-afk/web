"use client";

import { useState, useEffect } from "react";
import { getClubConfig, ClubConfigData } from "@/app/actions";

export function useClubConfig() {
  const [clubConfig, setClubConfig] = useState<ClubConfigData | null>(null);

  useEffect(() => {
    // 1. Carga inmediata desde localStorage
    try {
      const saved = localStorage.getItem("custom_club_config");
      if (saved) setClubConfig(JSON.parse(saved));
    } catch (e) {}

    // 2. Cargar desde archivo de configuración del servidor
    getClubConfig().then((serverConf) => {
      if (serverConf && (serverConf.nombreClub || serverConf.temporadaActiva || serverConf.escudoUrl)) {
        setClubConfig(serverConf);
        try {
          localStorage.setItem("custom_club_config", JSON.stringify(serverConf));
        } catch (e) {}
      }
    }).catch(() => {});

    // 3. Escuchar evento de actualización en caliente
    const handleUpdate = () => {
      try {
        const saved = localStorage.getItem("custom_club_config");
        if (saved) setClubConfig(JSON.parse(saved));
      } catch (e) {}
    };

    window.addEventListener("club_config_updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("club_config_updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  return clubConfig;
}
