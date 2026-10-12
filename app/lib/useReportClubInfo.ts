"use client";

import { useState, useEffect, useMemo } from "react";
import { useClubConfig } from "@/app/lib/useClubConfig";

export interface ReportClubInfo {
  clubName: string;
  clubShield: string;
  activeTemporada: string;
  setActiveTemporada: (temporada: string) => void;
  activeTeam: string;
  setActiveTeam: (team: string) => void;
  availableTemporadas: Array<{
    temporada: string;
    equipo: string;
    escudoUrl?: string;
    esActiva?: boolean;
    liga?: string;
    grupo?: string;
  }>;
  setSeasonAndTeam: (temporada: string, equipo: string) => void;
}

export function resolveShield(teamName?: string, season?: string, defaultShield?: string): string {
  const t = (teamName || "").toLowerCase();
  if (t.includes("europa")) return "/ce-europa.png";
  if (t.includes("manresa")) return "/ce-manresa.png";
  if (t.includes("prat")) return "/ae-prat.png";
  if (defaultShield && defaultShield.trim() !== "") return defaultShield;
  return "/ce-europa.png";
}

export function useReportClubInfo(): ReportClubInfo {
  const clubConfig = useClubConfig();

  const [activeTemporada, setActiveTemporadaState] = useState<string>("2026/27");
  const [activeTeam, setActiveTeamState] = useState<string>("CE EUROPA");

  const availableTemporadas = useMemo(() => {
    if (clubConfig?.temporadas && clubConfig.temporadas.length > 0) {
      return clubConfig.temporadas;
    }
    return [
      { temporada: "2026/27", equipo: "CE EUROPA", escudoUrl: "/ce-europa.png", esActiva: true },
      { temporada: "2026/27", equipo: "CE MANRESA", escudoUrl: "/ce-manresa.png", esActiva: false },
      { temporada: "2025/26", equipo: "AE PRAT", escudoUrl: "/ae-prat.png", esActiva: false },
    ];
  }, [clubConfig]);

  useEffect(() => {
    try {
      const savedTeam = localStorage.getItem("active_team");
      const seasonsRaw = localStorage.getItem("active_seasons");
      
      let temp = clubConfig?.temporadaActiva || "2026/27";
      if (seasonsRaw) {
        const s = JSON.parse(seasonsRaw);
        if (Array.isArray(s) && s[0]) temp = s[0];
      }
      setActiveTemporadaState(temp);

      if (savedTeam && savedTeam.trim() !== "" && savedTeam.toUpperCase().includes("EUROPA")) {
        setActiveTeamState(savedTeam);
      } else {
        const match = availableTemporadas.find(t => t.temporada === temp && t.esActiva) ||
                      availableTemporadas.find(t => t.temporada === temp);
        if (match?.equipo) {
          setActiveTeamState(match.equipo);
        } else if (clubConfig?.nombreClub) {
          setActiveTeamState(clubConfig.nombreClub);
        } else {
          setActiveTeamState("CE EUROPA");
        }
      }
    } catch (e) {}
  }, [clubConfig, availableTemporadas]);

  useEffect(() => {
    const handleSync = () => {
      try {
        const savedTeam = localStorage.getItem("active_team");
        if (savedTeam && savedTeam !== activeTeam && !savedTeam.toUpperCase().includes("MANRESA")) {
          setActiveTeamState(savedTeam);
        }
        const seasonsRaw = localStorage.getItem("active_seasons");
        if (seasonsRaw) {
          const s = JSON.parse(seasonsRaw);
          if (Array.isArray(s) && s[0] && s[0] !== activeTemporada) {
            setActiveTemporadaState(s[0]);
          }
        }
      } catch (e) {}
    };
    window.addEventListener("storage", handleSync);
    window.addEventListener("focus", handleSync);
    window.addEventListener("club_config_updated", handleSync);
    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("focus", handleSync);
      window.removeEventListener("club_config_updated", handleSync);
    };
  }, [activeTeam, activeTemporada]);

  const setSeasonAndTeam = (temp: string, team: string) => {
    setActiveTemporadaState(temp);
    setActiveTeamState(team);
    try {
      localStorage.setItem("active_team", team);
      localStorage.setItem("active_seasons", JSON.stringify([temp]));
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new Event("club_config_updated"));
    } catch (e) {}
  };

  const setActiveTemporada = (temp: string) => {
    const match = availableTemporadas.find(t => t.temporada === temp && (t.esActiva || t.equipo.toLowerCase() === activeTeam.toLowerCase())) ||
                  availableTemporadas.find(t => t.temporada === temp);
    const newTeam = match?.equipo || activeTeam;
    setSeasonAndTeam(temp, newTeam);
  };

  const setActiveTeam = (team: string) => {
    const match = availableTemporadas.find(t => t.equipo.toLowerCase() === team.toLowerCase());
    const newTemp = match?.temporada || activeTemporada;
    setSeasonAndTeam(newTemp, team);
  };

  const clubShield = useMemo(() => {
    const match = availableTemporadas.find(
      t => t.equipo.toLowerCase() === activeTeam.toLowerCase() && t.temporada === activeTemporada
    ) || availableTemporadas.find(t => t.equipo.toLowerCase() === activeTeam.toLowerCase());

    if (match?.escudoUrl) return match.escudoUrl;
    return resolveShield(activeTeam, activeTemporada, clubConfig?.escudoUrl);
  }, [activeTeam, activeTemporada, availableTemporadas, clubConfig]);

  return {
    clubName: activeTeam,
    clubShield,
    activeTemporada,
    setActiveTemporada,
    activeTeam,
    setActiveTeam,
    availableTemporadas,
    setSeasonAndTeam,
  };
}
