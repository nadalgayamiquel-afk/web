"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function CampoPage() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "inherit" }}>
      {/* Topbar */}
      <header style={{
        background: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 20
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link href="/" style={{
            fontSize: "12px",
            fontWeight: 700,
            color: "#64748b",
            textDecoration: "none",
            background: "#f1f5f9",
            padding: "6px 12px",
            borderRadius: "6px"
          }}>
            ← Inicio
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>⚽</span>
            <h1 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: 0 }}>
              Sesiones de Campo
            </h1>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              fontSize: "12px",
              fontWeight: 700,
              color: "#0f172a",
              background: "#ffffff"
            }}
          />
          <Link
            href="/disponibilidad"
            style={{
              fontSize: "12px",
              fontWeight: 800,
              color: "#ffffff",
              background: "#1e3a8a",
              padding: "7px 14px",
              borderRadius: "6px",
              textDecoration: "none"
            }}
          >
            📋 Pizarra & Disponibilidad
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
        <div style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#1e293b", margin: "0 0 4px 0" }}>
                Planificación de Campo ({selectedDate})
              </h2>
              <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
                Control y registro específico de ejercicios de campo, tareas colectivas y minutos técnicos.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <Link
                href="/base-datos/bbdd"
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#0284c7",
                  background: "#e0f2fe",
                  border: "1px solid #bae6fd",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  textDecoration: "none"
                }}
              >
                Ver en BBDD
              </Link>
            </div>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px",
            marginTop: "16px"
          }}>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#0284c7", textTransform: "uppercase", marginBottom: "6px" }}>
                🎯 Tareas Principales
              </div>
              <div style={{ fontSize: "13px", color: "#334155" }}>
                Accede a la pizarra táctica interactiva en Disponibilidad para diseñar la alineación y registrar los minutos de campo.
              </div>
            </div>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#16a34a", textTransform: "uppercase", marginBottom: "6px" }}>
                📊 Carga de Entrenamiento
              </div>
              <div style={{ fontSize: "13px", color: "#334155" }}>
                Supervisa el volumen e intensidad calculados automáticamente para los eventos Optimizadores del día.
              </div>
            </div>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#d97706", textTransform: "uppercase", marginBottom: "6px" }}>
                👥 Deportistas en Campo
              </div>
              <div style={{ fontSize: "13px", color: "#334155" }}>
                Consulta el estado médico, wellness y los minutos de participación por cada jugador en la sesión.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
