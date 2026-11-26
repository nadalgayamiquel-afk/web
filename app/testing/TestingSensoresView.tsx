'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getAllSensorCaptures, deleteSensorCapture } from '@/app/actions';

interface TestingSensoresViewProps {
  jugadores: any[];
  datasets?: any[];
  testTypes?: any[];
  onOpenLiveStation?: () => void;
}

export default function TestingSensoresView({
  jugadores,
  datasets = [],
  testTypes = [],
  onOpenLiveStation,
}: TestingSensoresViewProps) {
  // Pestaña interna: 'tests' | 'resumen_jugador'
  const [subTab, setSubTab] = useState<'tests' | 'resumen_jugador'>('tests');

  // Datos de sensores
  const [sensorCaptures, setSensorCaptures] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filtros de la pestaña de tests
  const [filterSensor, setFilterSensor] = useState<'ALL' | 'TINDEQ' | 'ENODE'>('ALL');
  const [filterEjercicio, setFilterEjercicio] = useState<string>('ALL');
  const [filterJugadorId, setFilterJugadorId] = useState<string>('ALL');
  const [searchText, setSearchText] = useState<string>('');

  // Modal de detalle de test (Curva o Reps)
  const [selectedCaptureDetail, setSelectedCaptureDetail] = useState<any | null>(null);
  const detailCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Estado para la pestaña de resumen por jugador
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [searchPlayerQuery, setSearchPlayerQuery] = useState<string>('');

  // Carga inicial de capturas de sensores (Supabase + localStorage fallback)
  const loadCaptures = async () => {
    setLoading(true);
    let list: any[] = [];

    // 1. Cargar desde localStorage
    try {
      const raw = localStorage.getItem('gimnasio_sensor_capturas_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      }
    } catch {}

    // 2. Cargar desde Supabase
    try {
      const remote = await getAllSensorCaptures();
      if (Array.isArray(remote) && remote.length > 0) {
        const seenIds = new Set(list.map((c) => c.id));
        remote.forEach((rc) => {
          if (!seenIds.has(rc.id)) {
            list.push(rc);
          }
        });
      }
    } catch (e) {
      console.warn('Error loading remote captures:', e);
    }

    // Ordenar descendente por fecha / timestamp
    list.sort((a, b) => {
      const timeA = new Date(a.timestamp || a.fecha).getTime() || 0;
      const timeB = new Date(b.timestamp || b.fecha).getTime() || 0;
      return timeB - timeA;
    });

    setSensorCaptures(list);
    setLoading(false);

    // Seleccionar primer jugador por defecto si no hay ninguno seleccionado
    if (jugadores.length > 0 && !selectedPlayerId) {
      setSelectedPlayerId(jugadores[0].id);
    }
  };

  useEffect(() => {
    loadCaptures();
  }, [jugadores]);

  // Selección automática de jugador inicial
  useEffect(() => {
    if (!selectedPlayerId && jugadores.length > 0) {
      setSelectedPlayerId(jugadores[0].id);
    }
  }, [jugadores, selectedPlayerId]);

  // Borrar captura
  const handleDeleteCapture = async (captureId: string) => {
    if (!confirm('¿Seguro que deseas eliminar este registro de test?')) return;
    try {
      await deleteSensorCapture(captureId);
      // Eliminar de localStorage
      try {
        const raw = localStorage.getItem('gimnasio_sensor_capturas_v1');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const updated = parsed.filter((c: any) => c.id !== captureId);
            localStorage.setItem('gimnasio_sensor_capturas_v1', JSON.stringify(updated));
          }
        }
      } catch {}

      setSensorCaptures((prev) => prev.filter((c) => c.id !== captureId));
      if (selectedCaptureDetail?.id === captureId) setSelectedCaptureDetail(null);
    } catch (e) {
      console.error('Error deleting capture:', e);
    }
  };

  // Lista de ejercicios únicos registrados en los sensores
  const availableEjercicios = useMemo(() => {
    const set = new Set<string>();
    sensorCaptures.forEach((c) => {
      const name = c.ejercicioNombre || c.ejercicioId;
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [sensorCaptures]);

  // Filtrado de capturas
  const filteredCaptures = useMemo(() => {
    return sensorCaptures.filter((c) => {
      // Filtro Sensor
      if (filterSensor === 'TINDEQ' && c.tipoSensor !== 'DINAMOMETRO') return false;
      if (filterSensor === 'ENODE' && c.tipoSensor !== 'ENCODER') return false;

      // Filtro Ejercicio
      if (filterEjercicio !== 'ALL') {
        const ej = c.ejercicioNombre || c.ejercicioId || '';
        if (ej !== filterEjercicio) return false;
      }

      // Filtro Jugador
      if (filterJugadorId !== 'ALL' && c.jugadorId !== filterJugadorId) return false;

      // Filtro texto
      if (searchText.trim()) {
        const q = searchText.toLowerCase().trim();
        const jName = (c.jugadorNombre || '').toLowerCase();
        const ejName = (c.ejercicioNombre || c.ejercicioId || '').toLowerCase();
        if (!jName.includes(q) && !ejName.includes(q)) return false;
      }

      return true;
    });
  }, [sensorCaptures, filterSensor, filterEjercicio, filterJugadorId, searchText]);

  // KPIs globales de plantilla
  const globalKpis = useMemo(() => {
    const tindeqTests = sensorCaptures.filter((c) => c.tipoSensor === 'DINAMOMETRO');
    const enodeTests = sensorCaptures.filter((c) => c.tipoSensor === 'ENCODER');

    let maxForceN = 0;
    let maxForcePlayer = '';
    let maxForceEj = '';
    let sumForceN = 0;

    tindeqTests.forEach((c) => {
      const f = c.fuerzaPicoN || 0;
      sumForceN += f;
      if (f > maxForceN) {
        maxForceN = f;
        maxForcePlayer = c.jugadorNombre || 'Jugador';
        maxForceEj = c.ejercicioNombre || '';
      }
    });

    let maxVel = 0;
    let maxVelPlayer = '';
    let maxVelEj = '';
    let maxVelWeight = 0;

    enodeTests.forEach((c) => {
      const v = c.velocidadPico || c.velocidadMedia || 0;
      if (v > maxVel) {
        maxVel = v;
        maxVelPlayer = c.jugadorNombre || 'Jugador';
        maxVelEj = c.ejercicioNombre || '';
        maxVelWeight = c.pesoKg || 0;
      }
    });

    const evaluatedPlayerIds = new Set(sensorCaptures.map((c) => c.jugadorId).filter(Boolean));

    return {
      totalTests: sensorCaptures.length,
      totalTindeq: tindeqTests.length,
      totalEnode: enodeTests.length,
      maxForceN,
      maxForceKg: (maxForceN / 9.80665).toFixed(1),
      maxForcePlayer,
      maxForceEj,
      avgForceN: tindeqTests.length > 0 ? Math.round(sumForceN / tindeqTests.length) : 0,
      maxVel: maxVel.toFixed(2),
      maxVelPlayer,
      maxVelEj,
      maxVelWeight,
      coveragePct: jugadores.length > 0 ? Math.round((evaluatedPlayerIds.size / jugadores.length) * 100) : 0,
      lastDate: sensorCaptures[0]?.fecha || 'Sin registros',
    };
  }, [sensorCaptures, jugadores]);

  // Dibujar curva en el modal de detalle
  useEffect(() => {
    if (!selectedCaptureDetail || selectedCaptureDetail.tipoSensor !== 'DINAMOMETRO') return;
    const canvas = detailCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const points = selectedCaptureDetail.curvaPuntos || [];
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Fondo
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // Líneas de cuadrícula
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (points.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Curva fuerza-tiempo no disponible para este registro', w / 2, h / 2);
      return;
    }

    const maxF = Math.max(...points.map((p: any) => p.f), 100);
    const maxT = Math.max(...points.map((p: any) => p.t), 1);

    // Gradiente de curva
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(6, 182, 212, 0.45)');
    grad.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

    ctx.beginPath();
    ctx.moveTo(0, h);
    points.forEach((p: any, i: number) => {
      const x = (p.t / maxT) * (w - 20) + 10;
      const y = h - (p.f / maxF) * (h - 30) - 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Relleno
    ctx.lineTo((points[points.length - 1].t / maxT) * (w - 20) + 10, h);
    ctx.lineTo(10, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Línea de pico
    const peakY = h - (maxF / maxF) * (h - 30) - 10;
    ctx.strokeStyle = '#f59e0b';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, peakY);
    ctx.lineTo(w, peakY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Pico: ${maxF} N (${(maxF / 9.80665).toFixed(1)} kg)`, w - 10, peakY - 6);
  }, [selectedCaptureDetail]);

  // Datos del jugador seleccionado para la vista 360º
  const selectedPlayerData = useMemo(() => {
    if (!selectedPlayerId) return null;
    const j = jugadores.find((item) => item.id === selectedPlayerId);
    if (!j) return null;

    const jCaptures = sensorCaptures.filter((c) => c.jugadorId === j.id);
    const tindeqList = jCaptures.filter((c) => c.tipoSensor === 'DINAMOMETRO');
    const enodeList = jCaptures.filter((c) => c.tipoSensor === 'ENCODER');

    // Récords Tindeq
    let maxForceN = 0;
    let maxForceEj = '';
    let maxForceDate = '';

    tindeqList.forEach((c) => {
      if ((c.fuerzaPicoN || 0) > maxForceN) {
        maxForceN = c.fuerzaPicoN;
        maxForceEj = c.ejercicioNombre || '';
        maxForceDate = c.fecha;
      }
    });

    // Perfil VBT Enode (agrupado por ejercicio y pesoKg)
    const enodeProfile: Record<string, { bestMeanV: number; bestPeakV: number; count: number; lastDate: string }> = {};
    enodeList.forEach((c) => {
      const key = `${c.ejercicioNombre || 'Ejercicio'} (${c.pesoKg || 0} kg)`;
      const meanV = c.velocidadMedia || 0;
      const peakV = c.velocidadPico || 0;
      if (!enodeProfile[key]) {
        enodeProfile[key] = { bestMeanV: meanV, bestPeakV: peakV, count: 1, lastDate: c.fecha };
      } else {
        enodeProfile[key].bestMeanV = Math.max(enodeProfile[key].bestMeanV, meanV);
        enodeProfile[key].bestPeakV = Math.max(enodeProfile[key].bestPeakV, peakV);
        enodeProfile[key].count++;
      }
    });

    // Datos de otros tests (datasets de Testing: peso, pliegues, sprints)
    const otherTests: Array<{ name: string; date: string; value: string; unit: string }> = [];

    datasets.forEach((ds) => {
      const pData = ds.players?.find(
        (p: any) =>
          p.name?.toLowerCase().includes(j.nombre.toLowerCase()) ||
          (j.apodo && p.name?.toLowerCase().includes(j.apodo.toLowerCase()))
      );
      if (pData && ds.dates && ds.dates.length > 0) {
        ds.dates.forEach((d: string, idx: number) => {
          const val = pData.values?.[idx];
          if (val !== null && val !== undefined) {
            const tt = testTypes.find((t) => t.id === ds.testTypeId);
            otherTests.push({
              name: ds.name || tt?.name || 'Test',
              date: d,
              value: String(val),
              unit: tt?.unit || '',
            });
          }
        });
      }
    });

    // Ordenar cronológicamente
    otherTests.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      jugador: j,
      totalCaptures: jCaptures.length,
      tindeqList,
      enodeList,
      maxForceN,
      maxForceKg: (maxForceN / 9.80665).toFixed(1),
      maxForceEj,
      maxForceDate,
      enodeProfile,
      otherTests,
    };
  }, [selectedPlayerId, jugadores, sensorCaptures, datasets, testTypes]);

  // Lista de jugadores filtrada por búsqueda en la barra lateral
  const filteredPlayersList = useMemo(() => {
    if (!searchPlayerQuery.trim()) return jugadores;
    const q = searchPlayerQuery.toLowerCase().trim();
    return jugadores.filter(
      (j) =>
        (j.nombre || '').toLowerCase().includes(q) ||
        (j.apodo || '').toLowerCase().includes(q) ||
        (j.posicion || '').toLowerCase().includes(q) ||
        String(j.dorsal || '').includes(q)
    );
  }, [jugadores, searchPlayerQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── BARRA SUPERIOR DE SUB-PESTAÑAS EN TESTING ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#ffffff',
          padding: '8px 14px',
          borderRadius: '12px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setSubTab('tests')}
            style={{
              padding: '7px 18px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              background: subTab === 'tests' ? '#1e3a8a' : 'transparent',
              color: subTab === 'tests' ? '#ffffff' : '#475569',
              boxShadow: subTab === 'tests' ? '0 2px 4px rgba(30,58,138,0.2)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            📡 Tests de Sensores (Tindeq & Enode) ({sensorCaptures.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('resumen_jugador')}
            style={{
              padding: '7px 18px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              background: subTab === 'resumen_jugador' ? '#1e3a8a' : 'transparent',
              color: subTab === 'resumen_jugador' ? '#ffffff' : '#475569',
              boxShadow: subTab === 'resumen_jugador' ? '0 2px 4px rgba(30,58,138,0.2)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            👤 Resumen por Jugador (Data 360º)
          </button>
        </div>

        {/* Acceso a lanzar test en vivo */}
        {onOpenLiveStation && (
          <button
            type="button"
            onClick={onOpenLiveStation}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, #0284c7, #0369a1)',
              color: '#ffffff',
              border: 'none',
              padding: '7px 16px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 2px 5px rgba(2,132,199,0.3)',
            }}
          >
            <span>⚡</span>
            <span>Realizar Test en Vivo (Bluetooth)</span>
          </button>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VISTA 1: LISTADO Y REGISTRO DE TESTS DE SENSORES                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {subTab === 'tests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* TARJETAS KPI GLOBALES DE PLANTILLA */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '12px',
            }}
          >
            {/* Card 1: Tindeq Fuerza Máxima */}
            <div
              style={{
                background: '#ffffff',
                padding: '14px 16px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                borderLeft: '4px solid #0891b2',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#0891b2', textTransform: 'uppercase' }}>
                💪 Dinamometría Isométrica (Tindeq)
              </div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', margin: '4px 0 2px 0' }}>
                {globalKpis.maxForceN > 0 ? `${globalKpis.maxForceN.toLocaleString()} N` : '0 N'}
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
                {globalKpis.maxForceN > 0 ? (
                  <>
                    <span style={{ color: '#0369a1', fontWeight: 800 }}>{globalKpis.maxForceKg} kg</span> · {globalKpis.maxForcePlayer} ({globalKpis.maxForceEj})
                  </>
                ) : (
                  'Sin registros todavía'
                )}
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                Total tests: {globalKpis.totalTindeq} · Media: {globalKpis.avgForceN} N
              </div>
            </div>

            {/* Card 2: Enode Velocidad Máxima */}
            <div
              style={{
                background: '#ffffff',
                padding: '14px 16px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                borderLeft: '4px solid #2563eb',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase' }}>
                ⚡ Velocidad de Ejecución (Enode VBT)
              </div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', margin: '4px 0 2px 0' }}>
                {Number(globalKpis.maxVel) > 0 ? `${globalKpis.maxVel} m/s` : '0.00 m/s'}
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
                {Number(globalKpis.maxVel) > 0 ? (
                  <>
                    {globalKpis.maxVelPlayer} · {globalKpis.maxVelEj} ({globalKpis.maxVelWeight} kg)
                  </>
                ) : (
                  'Sin registros todavía'
                )}
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                Total series: {globalKpis.totalEnode} VBT
              </div>
            </div>

            {/* Card 3: Cobertura de Plantilla */}
            <div
              style={{
                background: '#ffffff',
                padding: '14px 16px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                borderLeft: '4px solid #10b981',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', textTransform: 'uppercase' }}>
                📊 Cobertura y Actividad
              </div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', margin: '4px 0 2px 0' }}>
                {globalKpis.coveragePct}%
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
                Plantilla evaluada con hardware
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                Último test: {globalKpis.lastDate}
              </div>
            </div>
          </div>

          {/* BARRA DE FILTROS */}
          <div
            style={{
              background: '#ffffff',
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Filtro Sensor */}
              <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '6px', padding: '2px', border: '1px solid #cbd5e1' }}>
                <button
                  type="button"
                  onClick={() => setFilterSensor('ALL')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: filterSensor === 'ALL' ? 800 : 600,
                    cursor: 'pointer',
                    background: filterSensor === 'ALL' ? '#1e3a8a' : 'transparent',
                    color: filterSensor === 'ALL' ? '#ffffff' : '#475569',
                  }}
                >
                  Todos ({sensorCaptures.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterSensor('TINDEQ')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: filterSensor === 'TINDEQ' ? 800 : 600,
                    cursor: 'pointer',
                    background: filterSensor === 'TINDEQ' ? '#0891b2' : 'transparent',
                    color: filterSensor === 'TINDEQ' ? '#ffffff' : '#475569',
                  }}
                >
                  💪 Tindeq ({globalKpis.totalTindeq})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterSensor('ENODE')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: filterSensor === 'ENODE' ? 800 : 600,
                    cursor: 'pointer',
                    background: filterSensor === 'ENODE' ? '#2563eb' : 'transparent',
                    color: filterSensor === 'ENODE' ? '#ffffff' : '#475569',
                  }}
                >
                  ⚡ Enode ({globalKpis.totalEnode})
                </button>
              </div>

              {/* Filtro Ejercicio */}
              <select
                value={filterEjercicio}
                onChange={(e) => setFilterEjercicio(e.target.value)}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '11.5px',
                  background: '#ffffff',
                  color: '#334155',
                  fontWeight: 600,
                }}
              >
                <option value="ALL">Todos los Ejercicios</option>
                {availableEjercicios.map((ej) => (
                  <option key={ej} value={ej}>
                    {ej}
                  </option>
                ))}
              </select>

              {/* Filtro Jugador */}
              <select
                value={filterJugadorId}
                onChange={(e) => setFilterJugadorId(e.target.value)}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '11.5px',
                  background: '#ffffff',
                  color: '#334155',
                  fontWeight: 600,
                }}
              >
                <option value="ALL">Toda la Plantilla</option>
                {jugadores.map((j) => (
                  <option key={j.id} value={j.id}>
                    #{j.dorsal || ''} {j.apodo || j.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Buscador */}
            <input
              type="text"
              placeholder="Buscar por jugador o ejercicio..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '11.5px',
                width: '210px',
                outline: 'none',
              }}
            />
          </div>

          {/* TABLA PRINCIPAL DE TESTS */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#0f172a' }}>
                <thead>
                  <tr
                    style={{
                      background: '#f8fafc',
                      borderBottom: '2px solid #cbd5e1',
                      textAlign: 'left',
                      color: '#475569',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                    }}
                  >
                    <th style={{ padding: '10px 12px' }}>Fecha</th>
                    <th style={{ padding: '10px 12px' }}>Deportista</th>
                    <th style={{ padding: '10px 12px' }}>Ejercicio</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center' }}>Sensor</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center' }}>Carga</th>
                    <th style={{ padding: '10px 12px' }}>Resultado Principal</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center' }}>Volumen</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                        Cargando tests de sensores...
                      </td>
                    </tr>
                  ) : filteredCaptures.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
                        <div style={{ fontSize: '28px', marginBottom: '8px' }}>📡</div>
                        <div style={{ fontWeight: 800, fontSize: '13px', color: '#334155' }}>
                          No hay tests registrados con los filtros seleccionados
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                          Puedes realizar tests desde la Estación de Gimnasio con Bluetooth o en Modo Simulación.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredCaptures.map((c) => {
                      const isTindeq = c.tipoSensor === 'DINAMOMETRO';
                      const j = jugadores.find((item) => item.id === c.jugadorId);

                      return (
                        <tr
                          key={c.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          {/* Fecha */}
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontWeight: 600, color: '#334155' }}>
                            {c.fecha}
                            {c.timestamp && (
                              <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500 }}>
                                {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </td>

                          {/* Deportista */}
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {j?.foto_url ? (
                                <img
                                  src={j.foto_url}
                                  alt={c.jugadorNombre}
                                  style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover' }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: '26px',
                                    height: '26px',
                                    borderRadius: '50%',
                                    background: '#e2e8f0',
                                    color: '#475569',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                  }}
                                >
                                  {c.jugadorNombre?.charAt(0) || 'J'}
                                </div>
                              )}
                              <div>
                                <div style={{ fontWeight: 800, color: '#0f172a' }}>
                                  {j?.dorsal ? `#${j.dorsal} ` : ''}
                                  {c.jugadorNombre}
                                </div>
                                <div style={{ fontSize: '10px', color: '#64748b' }}>{j?.posicion || 'Jugador'}</div>
                              </div>
                            </div>
                          </td>

                          {/* Ejercicio */}
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1e293b' }}>
                            {c.ejercicioNombre || c.ejercicioId || 'Ejercicio'}
                          </td>

                          {/* Sensor Badge */}
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '3px 7px',
                                borderRadius: '4px',
                                fontSize: '10.5px',
                                fontWeight: 800,
                                background: isTindeq ? '#ecfeff' : '#eff6ff',
                                color: isTindeq ? '#0891b2' : '#2563eb',
                                border: isTindeq ? '1px solid #a5f3fc' : '1px solid #bfdbfe',
                              }}
                            >
                              {isTindeq ? '💪 Tindeq' : '⚡ Enode'}
                            </span>
                          </td>

                          {/* Carga (kg) */}
                          <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#334155' }}>
                            {!isTindeq && c.pesoKg ? `${c.pesoKg} kg` : '-'}
                          </td>

                          {/* Resultado Principal */}
                          <td style={{ padding: '10px 12px' }}>
                            {isTindeq ? (
                              <div>
                                <span style={{ fontWeight: 900, color: '#0891b2', fontSize: '13px' }}>
                                  {c.fuerzaPicoN ? `${c.fuerzaPicoN.toLocaleString()} N` : '0 N'}
                                </span>
                                <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>
                                  ({(c.fuerzaPicoN / 9.80665).toFixed(1)} kg)
                                </span>
                                {c.fuerzaMediaN && (
                                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                    Media: {c.fuerzaMediaN} N
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <span style={{ fontWeight: 900, color: '#2563eb', fontSize: '13px' }}>
                                  {c.velocidadMedia ? `${c.velocidadMedia} m/s` : '-'}
                                </span>
                                {c.velocidadPico && (
                                  <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>
                                    (Pico: {c.velocidadPico} m/s)
                                  </span>
                                )}
                                {c.perdidaVelocidadTotalPct !== undefined && c.perdidaVelocidadTotalPct > 0 && (
                                  <div style={{ fontSize: '10.5px', color: '#e11d48', fontWeight: 700 }}>
                                    Pérdida: -{c.perdidaVelocidadTotalPct}%
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Volumen */}
                          <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                            {isTindeq ? `${c.duracionSegundos || 5}s isom.` : `${c.repsCount || c.repsData?.length || 0} reps`}
                          </td>

                          {/* Acciones */}
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => setSelectedCaptureDetail(c)}
                                style={{
                                  background: '#f1f5f9',
                                  color: '#0284c7',
                                  border: '1px solid #cbd5e1',
                                  padding: '4px 8px',
                                  borderRadius: '5px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                                title="Ver detalles y gráfica del test"
                              >
                                📈 Curva
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCapture(c.id)}
                                style={{
                                  background: 'transparent',
                                  color: '#94a3b8',
                                  border: 'none',
                                  padding: '4px 6px',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                }}
                                title="Eliminar registro"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VISTA 2: RESUMEN 360º POR JUGADOR (DATA INTEGRADA DE TESTS)       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {subTab === 'resumen_jugador' && (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '16px' }}>
          {/* BARRA LATERAL: LISTA DE JUGADORES */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              height: 'fit-content',
              maxHeight: '800px',
              overflowY: 'auto',
            }}
          >
            <input
              type="text"
              placeholder="Buscar jugador..."
              value={searchPlayerQuery}
              onChange={(e) => setSearchPlayerQuery(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '11.5px',
                outline: 'none',
              }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {filteredPlayersList.map((j) => {
                const isSelected = j.id === selectedPlayerId;
                const capturesCount = sensorCaptures.filter((c) => c.jugadorId === j.id).length;

                return (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => setSelectedPlayerId(j.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: isSelected ? '1.5px solid #0284c7' : '1px solid transparent',
                      background: isSelected ? '#f0f9ff' : 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {j.foto_url ? (
                      <img
                        src={j.foto_url}
                        alt={j.nombre}
                        style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: isSelected ? '#0284c7' : '#e2e8f0',
                          color: isSelected ? '#ffffff' : '#475569',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 800,
                        }}
                      >
                        {j.nombre?.charAt(0) || 'J'}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '11.5px', color: isSelected ? '#0369a1' : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {j.dorsal ? `#${j.dorsal} ` : ''}
                        {j.apodo || j.nombre}
                      </div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>
                        {j.posicion || 'Jugador'} · {capturesCount} tests
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CONTENIDO PRINCIPAL DEL JUGADOR SELECCIONADO */}
          {selectedPlayerData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* CABECERA DEL JUGADOR */}
              <div
                style={{
                  background: '#ffffff',
                  padding: '16px 20px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {selectedPlayerData.jugador.foto_url ? (
                    <img
                      src={selectedPlayerData.jugador.foto_url}
                      alt={selectedPlayerData.jugador.nombre}
                      style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #0284c7' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: '#1e3a8a',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '22px',
                        fontWeight: 900,
                      }}
                    >
                      {selectedPlayerData.jugador.nombre?.charAt(0) || 'J'}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
                      {selectedPlayerData.jugador.dorsal ? `#${selectedPlayerData.jugador.dorsal} ` : ''}
                      {selectedPlayerData.jugador.nombre}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                      {selectedPlayerData.jugador.posicion || 'Posición sin definir'} · Equipo: {selectedPlayerData.jugador.equipo || 'Primer Equipo'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: '8px', padding: '8px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#0891b2', textTransform: 'uppercase' }}>Fuerza Pico (Tindeq)</div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                      {selectedPlayerData.maxForceN > 0 ? `${selectedPlayerData.maxForceN} N` : '-'}
                    </div>
                    <div style={{ fontSize: '9.5px', color: '#64748b' }}>
                      {selectedPlayerData.maxForceN > 0 ? `${selectedPlayerData.maxForceKg} kg` : 'Sin test'}
                    </div>
                  </div>

                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '8px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase' }}>Tests Completados</div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                      {selectedPlayerData.totalCaptures}
                    </div>
                    <div style={{ fontSize: '9.5px', color: '#64748b' }}>En gimnasio / sensores</div>
                  </div>
                </div>
              </div>

              {/* BLOQUE 1: DINAMOMETRÍA ISOMÉTRICA (TINDEQ) */}
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '16px' }}>💪</span>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                      Dinamometría Isométrica (Tindeq Progressor)
                    </h4>
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {selectedPlayerData.tindeqList.length} evaluaciones registradas
                  </span>
                </div>

                {selectedPlayerData.tindeqList.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                    Este deportista aún no tiene tests de tracción o fuerza isométrica registrados.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                          <th style={{ padding: '7px 10px' }}>Fecha</th>
                          <th style={{ padding: '7px 10px' }}>Ejercicio</th>
                          <th style={{ padding: '7px 10px' }}>Fuerza Pico</th>
                          <th style={{ padding: '7px 10px' }}>Fuerza Media</th>
                          <th style={{ padding: '7px 10px', textAlign: 'right' }}>Gráfica</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPlayerData.tindeqList.map((c) => (
                          <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '7px 10px', fontWeight: 600 }}>{c.fecha}</td>
                            <td style={{ padding: '7px 10px', fontWeight: 700 }}>{c.ejercicioNombre}</td>
                            <td style={{ padding: '7px 10px', fontWeight: 900, color: '#0891b2' }}>
                              {c.fuerzaPicoN} N ({(c.fuerzaPicoN / 9.80665).toFixed(1)} kg)
                            </td>
                            <td style={{ padding: '7px 10px', color: '#64748b' }}>
                              {c.fuerzaMediaN ? `${c.fuerzaMediaN} N` : '-'}
                            </td>
                            <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => setSelectedCaptureDetail(c)}
                                style={{
                                  background: '#ecfeff',
                                  color: '#0891b2',
                                  border: '1px solid #a5f3fc',
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  fontSize: '10.5px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                Ver Curva
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* BLOQUE 2: VELOCIDAD DE EJECUCIÓN (ENODE VBT) */}
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '16px' }}>⚡</span>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                      Velocidad y Perfil VBT (Enode)
                    </h4>
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {selectedPlayerData.enodeList.length} series registradas
                  </span>
                </div>

                {Object.keys(selectedPlayerData.enodeProfile).length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                    Este deportista aún no tiene series de velocidad o encoders registradas.
                  </div>
                ) : (
                  <div>
                    {/* Tarjetas de cargas evaluadas */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                      {Object.entries(selectedPlayerData.enodeProfile).map(([key, data]) => (
                        <div
                          key={key}
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '10px 14px',
                            minWidth: '150px',
                          }}
                        >
                          <div style={{ fontSize: '11px', fontWeight: 800, color: '#1e40af' }}>{key}</div>
                          <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', margin: '3px 0' }}>
                            {data.bestMeanV} m/s
                          </div>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>
                            Pico: {data.bestPeakV} m/s · {data.count} series
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Tabla de series recientes */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                            <th style={{ padding: '7px 10px' }}>Fecha</th>
                            <th style={{ padding: '7px 10px' }}>Ejercicio</th>
                            <th style={{ padding: '7px 10px' }}>Carga</th>
                            <th style={{ padding: '7px 10px' }}>Reps</th>
                            <th style={{ padding: '7px 10px' }}>Velocidad Media</th>
                            <th style={{ padding: '7px 10px' }}>Pérdida %</th>
                            <th style={{ padding: '7px 10px', textAlign: 'right' }}>Detalle</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPlayerData.enodeList.map((c) => (
                            <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '7px 10px', fontWeight: 600 }}>{c.fecha}</td>
                              <td style={{ padding: '7px 10px', fontWeight: 700 }}>{c.ejercicioNombre}</td>
                              <td style={{ padding: '7px 10px' }}>{c.pesoKg} kg</td>
                              <td style={{ padding: '7px 10px' }}>{c.repsCount || c.repsData?.length || 0}</td>
                              <td style={{ padding: '7px 10px', fontWeight: 800, color: '#2563eb' }}>
                                {c.velocidadMedia} m/s
                              </td>
                              <td style={{ padding: '7px 10px', color: c.perdidaVelocidadTotalPct > 15 ? '#e11d48' : '#64748b', fontWeight: 700 }}>
                                -{c.perdidaVelocidadTotalPct || 0}%
                              </td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedCaptureDetail(c)}
                                  style={{
                                    background: '#eff6ff',
                                    color: '#2563eb',
                                    border: '1px solid #bfdbfe',
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Ver Reps
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* BLOQUE 3: TESTS DE TESTING GENERAL (PESO, PLIEGUES, SPRINTS) */}
              {selectedPlayerData.otherTests.length > 0 && (
                <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '16px' }}>📊</span>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                      Histórico de Tests Antropométricos y de Campo
                    </h4>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                          <th style={{ padding: '7px 10px' }}>Fecha</th>
                          <th style={{ padding: '7px 10px' }}>Test</th>
                          <th style={{ padding: '7px 10px' }}>Resultado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPlayerData.otherTests.map((t, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '7px 10px', fontWeight: 600 }}>{t.date}</td>
                            <td style={{ padding: '7px 10px', fontWeight: 700 }}>{t.name}</td>
                            <td style={{ padding: '7px 10px', fontWeight: 800, color: '#0f172a' }}>
                              {t.value} {t.unit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: '#ffffff', borderRadius: '10px', padding: '40px', textAlign: 'center', color: '#64748b' }}>
              Selecciona un jugador para ver su resumen 360º de tests.
            </div>
          )}
        </div>
      )}

      {/* ── MODAL DE DETALLE: CURVA TINDEQ O REPS ENODE ── */}
      {selectedCaptureDetail && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setSelectedCaptureDetail(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '620px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      background: selectedCaptureDetail.tipoSensor === 'DINAMOMETRO' ? '#ecfeff' : '#eff6ff',
                      color: selectedCaptureDetail.tipoSensor === 'DINAMOMETRO' ? '#0891b2' : '#2563eb',
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                    }}
                  >
                    {selectedCaptureDetail.tipoSensor === 'DINAMOMETRO' ? '💪 Tindeq Progressor' : '⚡ Enode VBT'}
                  </span>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>{selectedCaptureDetail.fecha}</span>
                </div>
                <h3 style={{ margin: '6px 0 2px 0', fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>
                  {selectedCaptureDetail.jugadorNombre} · {selectedCaptureDetail.ejercicioNombre}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCaptureDetail(null)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  color: '#475569',
                }}
              >
                ✕
              </button>
            </div>

            {/* Si es Tindeq: Canvas de curva continua fuerza-tiempo */}
            {selectedCaptureDetail.tipoSensor === 'DINAMOMETRO' ? (
              <div>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: 1 }}>
                    <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700 }}>FUERZA PICO</div>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: '#0891b2' }}>
                      {selectedCaptureDetail.fuerzaPicoN} N ({((selectedCaptureDetail.fuerzaPicoN || 0) / 9.80665).toFixed(1)} kg)
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: 1 }}>
                    <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700 }}>FUERZA MEDIA</div>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: '#334155' }}>
                      {selectedCaptureDetail.fuerzaMediaN ? `${selectedCaptureDetail.fuerzaMediaN} N` : '-'}
                    </div>
                  </div>
                </div>

                <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #0f172a' }}>
                  <canvas ref={detailCanvasRef} width={570} height={230} style={{ display: 'block', width: '100%', height: 'auto' }} />
                </div>
              </div>
            ) : (
              /* Si es Enode: Barras de repeticiones y velocidad */
              <div>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: 1 }}>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>CARGA</div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                      {selectedCaptureDetail.pesoKg || 0} kg
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: 1 }}>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>VELOCIDAD MEDIA</div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#2563eb' }}>
                      {selectedCaptureDetail.velocidadMedia} m/s
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: 1 }}>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>PÉRDIDA VELOCIDAD</div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#e11d48' }}>
                      -{selectedCaptureDetail.perdidaVelocidadTotalPct || 0}%
                    </div>
                  </div>
                </div>

                {/* Lista de repeticiones */}
                {selectedCaptureDetail.repsData && selectedCaptureDetail.repsData.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                      Desglose de Repeticiones ({selectedCaptureDetail.repsData.length}):
                    </div>
                    {selectedCaptureDetail.repsData.map((rep: any) => (
                      <div
                        key={rep.rep}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, color: '#64748b', fontSize: '11px' }}>Rep {rep.rep}</span>
                          <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '13px' }}>{rep.velocidadMedia} m/s</span>
                          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>(Pico: {rep.velocidadPico} m/s)</span>
                        </div>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            color: rep.perdidaVelocidadPct > 15 ? '#e11d48' : '#10b981',
                          }}
                        >
                          {rep.perdidaVelocidadPct > 0 ? `-${rep.perdidaVelocidadPct}%` : 'Mejor Rep'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '16px' }}>
                    Sin datos individuales de repeticiones para este registro.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
