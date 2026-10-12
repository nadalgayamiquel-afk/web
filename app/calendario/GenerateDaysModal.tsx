"use client";

import { useState, useEffect } from "react";
import { generateSesionesDia } from "../actions";
import { useRouter } from "next/navigation";

export default function GenerateDaysModal() {
  const [startDate, setStartDate] = useState("");
  const [weeks, setWeeks] = useState(42); // 42 weeks is roughly 10 months (a full season)
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const [clubName, setClubName] = useState("CE Europa");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("custom_club_config");
      if (saved) {
        const config = JSON.parse(saved);
        if (config.nombreClub) setClubName(config.nombreClub);
      }
    } catch(e) {}
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate) return;
    setLoading(true);
    try {
      await generateSesionesDia(startDate, clubName, weeks);
      router.refresh(); // Refresh the page to load the new days
    } catch(err) {
      alert("Error: " + err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "32px", textAlign: "center", background: "#ffffff", borderRadius: "12px", border: "1px solid #cbd5e1", maxWidth: "400px", margin: "40px auto", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)" }}>
      <h2 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 900, color: "#0f172a" }}>Empezar Temporada</h2>
      <p style={{ margin: "0 0 20px", fontSize: "12px", color: "#64748b" }}>
        No hay días de planificación registrados para <strong>{clubName}</strong>. Indica la fecha de inicio para generar el calendario.
      </p>

      <form onSubmit={handleGenerate} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ textAlign: "left" }}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 800, marginBottom: "4px" }}>Fecha de Inicio de Pretemporada</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)}
            required
            style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
          />
        </div>

        <div style={{ textAlign: "left" }}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 800, marginBottom: "4px" }}>Semanas a generar (Toda la temporada)</label>
          <input 
            type="number" 
            value={weeks} 
            onChange={e => setWeeks(Number(e.target.value))}
            min={1}
            max={52}
            required
            style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          style={{ background: "#0284c7", color: "#fff", border: "none", padding: "10px", borderRadius: "8px", fontWeight: 800, cursor: loading ? "wait" : "pointer" }}
        >
          {loading ? "Generando calendario..." : "Generar Planificación"}
        </button>
      </form>
    </div>
  );
}
