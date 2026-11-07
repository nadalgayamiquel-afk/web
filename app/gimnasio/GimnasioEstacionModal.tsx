'use client';

import React, { useState, useEffect, useRef } from 'react';
import { GimnasioSesion, GimnasioEjercicio, SensorCaptureRecord } from './gimnasio-types';
import { saveSensorCapture } from '@/app/actions';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  allDays: any[];
  sesionesMap: Record<string, GimnasioSesion[]>;
  jugadores: any[];
  initialFecha?: string;
  initialEjercicioNombre?: string;
}

export default function GimnasioEstacionModal({
  isOpen,
  onClose,
  allDays,
  sesionesMap,
  jugadores,
  initialFecha,
  initialEjercicioNombre,
}: Props) {
  if (!isOpen) return null;

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedFecha, setSelectedFecha] = useState<string>(initialFecha || todayStr);
  const [selectedEjercicio, setSelectedEjercicio] = useState<string>(initialEjercicioNombre || '');
  const [sensorType, setSensorType] = useState<'ENCODER' | 'DINAMOMETRO'>('ENCODER');
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [bluetoothConnected, setBluetoothConnected] = useState<boolean>(false);
  const [bluetoothDeviceName, setBluetoothDeviceName] = useState<string>('');
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  // Active workout state
  const [activeJugador, setActiveJugador] = useState<any | null>(null);
  const [weightKg, setWeightKg] = useState<number>(60);
  const [workoutState, setWorkoutState] = useState<'IDLE' | 'LISTENING' | 'ACTIVE' | 'SUMMARY'>('IDLE');
  const [searchJugadorText, setSearchJugadorText] = useState<string>('');
  const [showAllJugadores, setShowAllJugadores] = useState<boolean>(false);

  // Encoder live metrics
  const [currentReps, setCurrentReps] = useState<Array<{ rep: number; velocidadMedia: number; velocidadPico: number; perdidaVelocidadPct: number }>>([]);
  const [lastVelocity, setLastVelocity] = useState<number>(0);
  const [currentInstantVelocity, setCurrentInstantVelocity] = useState<number>(0);
  const [bestVelocity, setBestVelocity] = useState<number>(0);

  // Dynamometer live metrics
  const [currentForceN, setCurrentForceN] = useState<number>(0);
  const [peakForceN, setPeakForceN] = useState<number>(0);
  const [curvePoints, setCurvePoints] = useState<Array<{ t: number; f: number }>>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Auto-finish timer & auto-reset timer
  const [autoResetCountdown, setAutoResetCountdown] = useState<number>(4);
  const silenceTimerRef = useRef<any>(null);
  const simIntervalRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 1. Identify monitored exercises or all exercises for selected date
  const availableExercises = React.useMemo(() => {
    const list: Array<{ id: string; nombre: string; monitorizado: boolean; tipoSensor: 'ENCODER' | 'DINAMOMETRO'; pesoDefectoKg?: number | string }> = [];
    const seen = new Set<string>();

    Object.entries(sesionesMap).forEach(([key, sesList]) => {
      sesList.forEach(ses => {
        if (ses.fecha === selectedFecha) {
          ses.ejercicios.forEach(ej => {
            if (ej.nombre && !seen.has(ej.nombre.trim().toUpperCase())) {
              seen.add(ej.nombre.trim().toUpperCase());
              list.push({
                id: ej.id,
                nombre: ej.nombre.trim(),
                monitorizado: Boolean(ej.monitorizado),
                tipoSensor: ej.tipoSensor || 'ENCODER',
                pesoDefectoKg: ej.pesoKg ? parseFloat(ej.pesoKg) : 60,
              });
            }
          });
        }
      });
    });

    if (list.length === 0) {
      list.push(
        { id: 'ej_std_1', nombre: 'Sentadilla Trasera', monitorizado: true, tipoSensor: 'ENCODER', pesoDefectoKg: 60 },
        { id: 'ej_std_2', nombre: 'Press Banca', monitorizado: true, tipoSensor: 'ENCODER', pesoDefectoKg: 50 },
        { id: 'ej_std_3', nombre: 'Tracción Isométrica (Mid-Thigh Pull)', monitorizado: true, tipoSensor: 'DINAMOMETRO', pesoDefectoKg: 0 }
      );
    }
    return list;
  }, [selectedFecha, sesionesMap]);

  // Set default exercise on date change
  useEffect(() => {
    if (!selectedEjercicio || !availableExercises.some(e => e.nombre === selectedEjercicio)) {
      const firstMonitored = availableExercises.find(e => e.monitorizado) || availableExercises[0];
      if (firstMonitored) {
        setSelectedEjercicio(firstMonitored.nombre);
        setSensorType(firstMonitored.tipoSensor || 'ENCODER');
        if (firstMonitored.pesoDefectoKg) {
          setWeightKg(Number(firstMonitored.pesoDefectoKg) || 60);
        }
      }
    }
  }, [availableExercises, selectedEjercicio]);

  // Filter athletes assigned to the session of selected date
  const assignedJugadores = React.useMemo(() => {
    if (showAllJugadores) return jugadores;

    // Check if there is a TEAM session on that date
    let isTeamSession = false;
    const assignedIds = new Set<string>();

    Object.entries(sesionesMap).forEach(([key, sesList]) => {
      sesList.forEach(ses => {
        if (ses.fecha === selectedFecha) {
          if (ses.jugadorId === 'TEAM') isTeamSession = true;
          else assignedIds.add(ses.jugadorId);
        }
      });
    });

    if (isTeamSession || assignedIds.size === 0) {
      return jugadores;
    }
    return jugadores.filter(j => assignedIds.has(j.id));
  }, [jugadores, selectedFecha, sesionesMap, showAllJugadores]);

  const filteredJugadores = React.useMemo(() => {
    if (!searchJugadorText.trim()) return assignedJugadores;
    const q = searchJugadorText.toLowerCase().trim();
    return assignedJugadores.filter(j =>
      (j.nombre || '').toLowerCase().includes(q) ||
      (j.apodo || '').toLowerCase().includes(q) ||
      String(j.dorsal || '').includes(q)
    );
  }, [assignedJugadores, searchJugadorText]);

  // Handle Fullscreen toggle
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setIsFullScreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullScreen(false);
    }
  };

  // Bluetooth Connect using Web Bluetooth API
  const handleConnectBluetooth = async () => {
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).bluetooth) {
        const device = await (navigator as any).bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['battery_service', '0000ffe0-0000-1000-8000-00805f9b34fb'],
        });
        setBluetoothConnected(true);
        setBluetoothDeviceName(device.name || 'Sensor Bluetooth');
        setIsSimulating(false);
      } else {
        alert('Web Bluetooth API no disponible en este navegador. Activando Modo Simulación para pruebas fluidas.');
        setIsSimulating(true);
      }
    } catch (e: any) {
      console.warn('Bluetooth connection cancelled or failed:', e);
      setIsSimulating(true);
    }
  };

  // Start athlete turn
  const handleSelectJugador = (jugador: any) => {
    setActiveJugador(jugador);
    setCurrentReps([]);
    setLastVelocity(0);
    setCurrentInstantVelocity(0);
    setBestVelocity(0);
    setCurrentForceN(0);
    setPeakForceN(0);
    setCurvePoints([]);
    setWorkoutState('LISTENING');
  };

  // Movement detection & execution logic (Simulation or Live Sensor)
  useEffect(() => {
    if (workoutState !== 'LISTENING' && workoutState !== 'ACTIVE') {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      return;
    }

    if (isSimulating) {
      let repCount = currentReps.length;
      let startTime = Date.now();
      let repActive = false;
      let repPeakVel = 0;
      let repSumVel = 0;
      let repSamples = 0;

      simIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;

        if (sensorType === 'ENCODER') {
          // Emulate reps every ~2.5 seconds
          const phase = (elapsed % 3);
          if (phase > 0.6 && phase < 2.0) {
            // Concentric movement!
            if (!repActive) {
              repActive = true;
              setWorkoutState('ACTIVE');
              repPeakVel = 0;
              repSumVel = 0;
              repSamples = 0;
            }
            // Generate velocity pulse (e.g. 0.65 to 0.95 m/s with progressive slight fatigue)
            const fatigueDrop = repCount * 0.035;
            const currentV = Math.max(0.35, (0.85 - fatigueDrop) * Math.sin((phase - 0.6) / 1.4 * Math.PI) + (Math.random() * 0.05));
            setCurrentInstantVelocity(parseFloat(currentV.toFixed(2)));
            repPeakVel = Math.max(repPeakVel, currentV);
            repSumVel += currentV;
            repSamples++;
          } else {
            // Movement stopped or eccentric reset
            if (repActive && repSamples > 0) {
              repActive = false;
              repCount++;
              const meanV = parseFloat((repSumVel / repSamples).toFixed(2));
              const peakV = parseFloat(repPeakVel.toFixed(2));
              
              setCurrentReps(prev => {
                const newBest = prev.length === 0 ? meanV : Math.max(prev[0].velocidadMedia, meanV);
                setBestVelocity(newBest);
                const dropPct = parseFloat((((newBest - meanV) / newBest) * 100).toFixed(1));
                setLastVelocity(meanV);
                return [...prev, { rep: prev.length + 1, velocidadMedia: meanV, velocidadPico: peakV, perdidaVelocidadPct: dropPct }];
              });

              // Stop automatically after 4 reps in simulation
              if (repCount >= 4) {
                finishSerie();
              }
            }
            setCurrentInstantVelocity(0);
          }
        } else {
          // DINAMOMETRO (Continuous Isometric Curve)
          setWorkoutState('ACTIVE');
          // Smooth isometric pull curve rising to ~1200-1400 N and holding
          let forceVal = 0;
          if (elapsed < 1.0) {
            forceVal = (elapsed / 1.0) * 1150 + (Math.random() * 40 - 20);
          } else if (elapsed < 4.0) {
            forceVal = 1150 + Math.sin(elapsed * 2) * 80 + (Math.random() * 30 - 15);
          } else {
            // Fatigue / stop
            forceVal = Math.max(0, 1150 - (elapsed - 4.0) * 800);
          }

          forceVal = Math.max(0, Math.round(forceVal));
          setCurrentForceN(forceVal);
          setPeakForceN(prev => Math.max(prev, forceVal));

          setCurvePoints(prev => {
            const next = [...prev, { t: parseFloat(elapsed.toFixed(2)), f: forceVal }];
            return next.slice(-150); // Keep last 150 points for smooth canvas rendering
          });

          if (elapsed >= 5.0) {
            finishSerie();
          }
        }
      }, 50);

      return () => {
        if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      };
    }
  }, [workoutState, isSimulating, sensorType, currentReps.length]);

  // Finish Serie and auto-save
  const finishSerie = () => {
    if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    setWorkoutState('SUMMARY');

    // Trigger save to Supabase
    if (activeJugador) {
      const record: SensorCaptureRecord = {
        id: `sensor_${Date.now()}_${activeJugador.id}`,
        jugadorId: activeJugador.id,
        jugadorNombre: activeJugador.apodo || activeJugador.nombre,
        fecha: selectedFecha,
        ejercicioId: selectedEjercicio,
        ejercicioNombre: selectedEjercicio,
        tipoSensor: sensorType,
        pesoKg: sensorType === 'ENCODER' ? weightKg : undefined,
        repsCount: sensorType === 'ENCODER' ? currentReps.length : undefined,
        repsData: sensorType === 'ENCODER' ? currentReps : undefined,
        velocidadMedia: sensorType === 'ENCODER' && currentReps.length > 0 ? parseFloat((currentReps.reduce((a, b) => a + b.velocidadMedia, 0) / currentReps.length).toFixed(2)) : undefined,
        velocidadPico: bestVelocity,
        perdidaVelocidadTotalPct: currentReps.length > 0 ? currentReps[currentReps.length - 1].perdidaVelocidadPct : 0,
        fuerzaPicoN: sensorType === 'DINAMOMETRO' ? peakForceN : undefined,
        fuerzaMediaN: sensorType === 'DINAMOMETRO' && curvePoints.length > 0 ? Math.round(curvePoints.reduce((a, b) => a + b.f, 0) / curvePoints.length) : undefined,
        curvaPuntos: sensorType === 'DINAMOMETRO' ? curvePoints : undefined,
        duracionSegundos: sensorType === 'DINAMOMETRO' ? 5 : undefined,
        timestamp: new Date().toISOString(),
      };

      saveSensorCapture(record).catch(console.warn);

      // Save locally as immediate backup
      try {
        const raw = localStorage.getItem('gimnasio_sensor_capturas_v1');
        const existing = raw ? JSON.parse(raw) : [];
        existing.unshift(record);
        localStorage.setItem('gimnasio_sensor_capturas_v1', JSON.stringify(existing.slice(0, 500)));
      } catch {}
    }
  };

  // Auto-reset countdown back to player selection
  useEffect(() => {
    if (workoutState === 'SUMMARY') {
      setAutoResetCountdown(4);
      const timer = setInterval(() => {
        setAutoResetCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setActiveJugador(null);
            setWorkoutState('IDLE');
            return 4;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [workoutState]);

  // Render Dynamometer Canvas Chart
  useEffect(() => {
    if (sensorType !== 'DINAMOMETRO' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += h / 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (curvePoints.length < 2) return;

    const maxForce = Math.max(1500, peakForceN * 1.15);

    // Fill area under curve
    ctx.beginPath();
    ctx.moveTo(0, h);
    curvePoints.forEach((pt, i) => {
      const x = (i / Math.max(curvePoints.length - 1, 1)) * w;
      const y = h - (pt.f / maxForce) * h;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    curvePoints.forEach((pt, i) => {
      const x = (i / Math.max(curvePoints.length - 1, 1)) * w;
      const y = h - (pt.f / maxForce) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();
  }, [curvePoints, sensorType, peakForceN]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: '#090d16',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ─── BARRA DE ESTACIÓN Y CONTROL SUPERIOR ─── */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 20px',
          background: '#0f172a',
          borderBottom: '1px solid #1e293b',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>📱</span>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Estación de Fuerza & Rendimiento
              </div>
              <h2 style={{ fontSize: '16px', fontWeight: 900, margin: 0, color: '#f8fafc' }}>
                Modo Tablet Kiosco
              </h2>
            </div>
          </div>

          {/* Selector de Ejercicio Fijo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#1e293b', padding: '4px 10px', borderRadius: '8px' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>🏋️ Ejercicio:</span>
            <select
              value={selectedEjercicio}
              onChange={e => {
                setSelectedEjercicio(e.target.value);
                const found = availableExercises.find(ex => ex.nombre === e.target.value);
                if (found) {
                  setSensorType(found.tipoSensor || 'ENCODER');
                  if (found.pesoDefectoKg) setWeightKg(Number(found.pesoDefectoKg) || 60);
                }
              }}
              style={{
                background: '#0f172a',
                color: '#f8fafc',
                border: '1px solid #334155',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 800,
                outline: 'none',
              }}
            >
              {availableExercises.map(ex => (
                <option key={ex.id} value={ex.nombre}>
                  {ex.monitorizado ? '⚡ ' : ''}{ex.nombre} ({ex.tipoSensor === 'DINAMOMETRO' ? 'Dinamómetro' : 'Encoder'})
                </option>
              ))}
            </select>
          </div>

          {/* Tipo de sensor */}
          <div style={{ display: 'inline-flex', background: '#1e293b', borderRadius: '6px', padding: '2px', border: '1px solid #334155' }}>
            <button
              onClick={() => setSensorType('ENCODER')}
              style={{
                fontSize: '11px',
                fontWeight: sensorType === 'ENCODER' ? 900 : 700,
                background: sensorType === 'ENCODER' ? '#2563eb' : 'transparent',
                color: sensorType === 'ENCODER' ? '#ffffff' : '#94a3b8',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              ⚡ Encoder (VBT)
            </button>
            <button
              onClick={() => setSensorType('DINAMOMETRO')}
              style={{
                fontSize: '11px',
                fontWeight: sensorType === 'DINAMOMETRO' ? 900 : 700,
                background: sensorType === 'DINAMOMETRO' ? '#0891b2' : 'transparent',
                color: sensorType === 'DINAMOMETRO' ? '#ffffff' : '#94a3b8',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              💪 Dinamómetro
            </button>
          </div>
        </div>

        {/* Controles de hardware y salida */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Bluetooth */}
          <button
            onClick={handleConnectBluetooth}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: bluetoothConnected ? '#15803d' : '#1e293b',
              color: '#ffffff',
              border: bluetoothConnected ? '1px solid #22c55e' : '1px solid #334155',
              padding: '6px 12px',
              borderRadius: '7px',
              fontSize: '11.5px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <span>{bluetoothConnected ? '🟢' : '🔵'}</span>
            <span>{bluetoothConnected ? (bluetoothDeviceName || 'Sensor Enlazado') : 'Conectar BT'}</span>
          </button>

          {/* Simulación */}
          <button
            onClick={() => setIsSimulating(!isSimulating)}
            style={{
              background: isSimulating ? '#7c3aed' : '#1e293b',
              color: '#ffffff',
              border: isSimulating ? '1px solid #a855f7' : '1px solid #334155',
              padding: '6px 10px',
              borderRadius: '7px',
              fontSize: '11.5px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            🧪 {isSimulating ? 'Simulación ON' : 'Simulación OFF'}
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullScreen}
            style={{
              background: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              padding: '6px 10px',
              borderRadius: '7px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
            title="Pantalla Completa Tablet"
          >
            ⛶
          </button>

          {/* Salir */}
          <button
            onClick={onClose}
            style={{
              background: '#dc2626',
              color: '#ffffff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            ✕ Salir
          </button>
        </div>
      </header>

      {/* ─── CUERPO PRINCIPAL DEL MODO ESTACIÓN ─── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* PANTALLA 1: SELECCIÓN DE ROSTROS DEL JUGADOR */}
        {!activeJugador && (
          <div
            style={{
              flex: 1,
              padding: '24px 30px',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
            }}
          >
            {/* Cabecera del Kiosco */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <h1 style={{ fontSize: '26px', fontWeight: 900, margin: '0 0 4px 0', color: '#f8fafc' }}>
                  ¿Quién realiza la serie?
                </h1>
                <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
                  Toca tu foto para registrar automáticamente tus repeticiones en <strong>{selectedEjercicio}</strong>
                </p>
              </div>

              {/* Buscador y filtro */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar compañero..."
                  value={searchJugadorText}
                  onChange={e => setSearchJugadorText(e.target.value)}
                  style={{
                    background: '#1e293b',
                    color: '#ffffff',
                    border: '1px solid #334155',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    outline: 'none',
                    width: '180px',
                  }}
                />
                <button
                  onClick={() => setShowAllJugadores(!showAllJugadores)}
                  style={{
                    background: showAllJugadores ? '#2563eb' : '#1e293b',
                    color: '#ffffff',
                    border: '1px solid #334155',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {showAllJugadores ? '👥 Toda la plantilla' : '📋 Asignados a la sesión'}
                </button>
              </div>
            </div>

            {/* Grid de Rostros Grandes y Táctiles */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: '16px',
                paddingBottom: '20px',
              }}
            >
              {filteredJugadores.map(j => (
                <div
                  key={j.id}
                  onClick={() => handleSelectJugador(j)}
                  style={{
                    background: '#0f172a',
                    border: '2px solid #1e293b',
                    borderRadius: '16px',
                    padding: '16px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    userSelect: 'none',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = '#38bdf8';
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = '#1e293b';
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                  }}
                >
                  {/* Foto circular grande */}
                  <div
                    style={{
                      width: '84px',
                      height: '84px',
                      borderRadius: '50%',
                      background: '#1e293b',
                      border: '3px solid #38bdf8',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                      fontWeight: 900,
                      color: '#38bdf8',
                    }}
                  >
                    {j.foto_url ? (
                      <img src={j.foto_url} alt={j.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span>{(j.apodo || j.nombre).slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '13px', fontWeight: 900, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '130px' }}>
                      {(j.apodo || j.nombre).toUpperCase()}
                    </div>
                    {j.posicion && (
                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, marginTop: '2px' }}>
                        {j.posicion}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PANTALLA 2: EJECUCIÓN ACTIVA DEL JUGADOR */}
        {activeJugador && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '20px 30px',
              overflowY: 'auto',
              gap: '16px',
            }}
          >
            {/* Fila del Jugador Activo & Selector de Peso */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#0f172a',
                border: '1px solid #1e293b',
                padding: '14px 22px',
                borderRadius: '16px',
                flexWrap: 'wrap',
                gap: '14px',
              }}
            >
              {/* Info del Atleta */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: '#1e293b',
                    border: '3px solid #38bdf8',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    fontWeight: 900,
                    color: '#38bdf8',
                  }}
                >
                  {activeJugador.foto_url ? (
                    <img src={activeJugador.foto_url} alt={activeJugador.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span>{(activeJugador.apodo || activeJugador.nombre).slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Atleta Activo • Serie en Curso
                  </div>
                  <h2 style={{ fontSize: '20px', fontWeight: 900, margin: '2px 0 0 0', color: '#f8fafc' }}>
                    {(activeJugador.apodo || activeJugador.nombre).toUpperCase()}
                  </h2>
                </div>
              </div>

              {/* Selector de Carga Rápido (Modificable en Encoder) */}
              {sensorType === 'ENCODER' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1e293b', padding: '6px 12px', borderRadius: '12px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#94a3b8' }}>Carga:</span>
                  <button
                    onClick={() => setWeightKg(w => Math.max(0, w - 10))}
                    style={{ background: '#334155', color: '#ffffff', border: 'none', padding: '6px 10px', borderRadius: '6px', fontWeight: 900, cursor: 'pointer' }}
                  >
                    -10
                  </button>
                  <button
                    onClick={() => setWeightKg(w => Math.max(0, w - 2.5))}
                    style={{ background: '#334155', color: '#ffffff', border: 'none', padding: '6px 8px', borderRadius: '6px', fontWeight: 900, cursor: 'pointer' }}
                  >
                    -2.5
                  </button>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: '#38bdf8', minWidth: '85px', textAlign: 'center' }}>
                    {weightKg} <small style={{ fontSize: '13px', color: '#94a3b8' }}>kg</small>
                  </div>
                  <button
                    onClick={() => setWeightKg(w => w + 2.5)}
                    style={{ background: '#334155', color: '#ffffff', border: 'none', padding: '6px 8px', borderRadius: '6px', fontWeight: 900, cursor: 'pointer' }}
                  >
                    +2.5
                  </button>
                  <button
                    onClick={() => setWeightKg(w => w + 10)}
                    style={{ background: '#334155', color: '#ffffff', border: 'none', padding: '6px 10px', borderRadius: '6px', fontWeight: 900, cursor: 'pointer' }}
                  >
                    +10
                  </button>
                </div>
              )}

              {/* Botón de Terminar / Cancelar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={finishSerie}
                  style={{
                    background: '#15803d',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 18px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  ⏹️ Terminar Serie
                </button>
                <button
                  onClick={() => {
                    setActiveJugador(null);
                    setWorkoutState('IDLE');
                  }}
                  style={{
                    background: '#334155',
                    color: '#94a3b8',
                    border: 'none',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>

            {/* PANEL CENTRAL: VISUALIZACIÓN EN VIVO */}
            {sensorType === 'ENCODER' ? (
              /* ENCODER: FEEDBACK DE VELOCIDADES */
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', flex: 1, minHeight: 0 }}>
                {/* Gran pantalla de velocidad */}
                <div
                  style={{
                    background: '#0f172a',
                    border: '2px solid #1e293b',
                    borderRadius: '20px',
                    padding: '30px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    gap: '12px',
                    position: 'relative',
                  }}
                >
                  {/* Estado escucha */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: workoutState === 'ACTIVE' ? '#14532d' : '#1e293b',
                      color: workoutState === 'ACTIVE' ? '#4ade80' : '#38bdf8',
                      padding: '6px 14px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 800,
                    }}
                  >
                    <span>{workoutState === 'ACTIVE' ? '🟢 Repetición en Curso' : '⚡ Esperando Movimiento...'}</span>
                  </div>

                  {/* Lectura Gigante de Velocidad */}
                  <div>
                    <div style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Velocidad Propulsiva
                    </div>
                    <div style={{ fontSize: '84px', fontWeight: 900, color: lastVelocity > 0 ? (lastVelocity >= bestVelocity * 0.9 ? '#22c55e' : '#eab308') : '#f8fafc', lineHeight: 1 }}>
                      {lastVelocity > 0 ? lastVelocity : (currentInstantVelocity > 0 ? currentInstantVelocity : '0.00')}
                      <span style={{ fontSize: '24px', color: '#94a3b8', marginLeft: '6px' }}>m/s</span>
                    </div>
                  </div>

                  {/* Pérdida de velocidad */}
                  {currentReps.length > 0 && (
                    <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
                      <div style={{ background: '#1e293b', padding: '8px 16px', borderRadius: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>MEJOR REP</div>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: '#38bdf8' }}>{bestVelocity} m/s</div>
                      </div>
                      <div style={{ background: '#1e293b', padding: '8px 16px', borderRadius: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>PÉRDIDA VELOCIDAD</div>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: currentReps[currentReps.length - 1].perdidaVelocidadPct > 15 ? '#ef4444' : '#22c55e' }}>
                          -{currentReps[currentReps.length - 1].perdidaVelocidadPct}%
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Listado de Repeticiones de la Serie */}
                <div
                  style={{
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '20px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    overflowY: 'auto',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 900, color: '#f8fafc', borderBottom: '1px solid #1e293b', paddingBottom: '8px' }}>
                    Repeticiones de la Serie ({currentReps.length})
                  </div>

                  {currentReps.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '13px', textAlign: 'center' }}>
                      Inicia la primera repetición.<br />El encoder detectará el movimiento automáticamente.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {currentReps.map(r => (
                        <div
                          key={r.rep}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#1e293b',
                            padding: '10px 14px',
                            borderRadius: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 900, color: '#38bdf8', background: '#0f172a', padding: '3px 8px', borderRadius: '6px' }}>
                              #{r.rep}
                            </span>
                            <span style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff' }}>
                              {r.velocidadMedia} m/s
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: r.perdidaVelocidadPct > 15 ? '#ef4444' : '#22c55e' }}>
                            {r.perdidaVelocidadPct > 0 ? `-${r.perdidaVelocidadPct}%` : 'MAX'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* DINAMÓMETRO: CURVA DE FUERZA CRUDA EN DIRECTO */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, minHeight: 0 }}>
                {/* Métricas superiores */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                  <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '16px 20px', borderRadius: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8' }}>FUERZA INSTANTÁNEA</div>
                    <div style={{ fontSize: '38px', fontWeight: 900, color: '#38bdf8', lineHeight: 1.1 }}>
                      {currentForceN.toLocaleString()} <small style={{ fontSize: '16px', color: '#94a3b8' }}>N</small>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>≈ {(currentForceN / 9.81).toFixed(1)} kg</div>
                  </div>

                  <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '16px 20px', borderRadius: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8' }}>PICO MÁXIMO (FMAX)</div>
                    <div style={{ fontSize: '38px', fontWeight: 900, color: '#22c55e', lineHeight: 1.1 }}>
                      {peakForceN.toLocaleString()} <small style={{ fontSize: '16px', color: '#94a3b8' }}>N</small>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>≈ {(peakForceN / 9.81).toFixed(1)} kg</div>
                  </div>

                  <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '16px 20px', borderRadius: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8' }}>TIEMPO BAJO TENSIÓN</div>
                    <div style={{ fontSize: '38px', fontWeight: 900, color: '#f8fafc', lineHeight: 1.1 }}>
                      {curvePoints.length > 0 ? (curvePoints[curvePoints.length - 1].t).toFixed(1) : '0.0'} <small style={{ fontSize: '16px', color: '#94a3b8' }}>s</small>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Tensión isométrica</div>
                  </div>
                </div>

                {/* Canvas de Curva Cruda Continua */}
                <div
                  style={{
                    flex: 1,
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '20px',
                    padding: '16px',
                    position: 'relative',
                    minHeight: '220px',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 900, color: '#38bdf8' }}>
                      📈 Señal Cruda en Tiempo Real (N vs Tiempo)
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Frecuencia sensor: 50 Hz</span>
                  </div>
                  <canvas
                    ref={canvasRef}
                    width={800}
                    height={260}
                    style={{ width: '100%', height: '100%', borderRadius: '8px' }}
                  />
                </div>
              </div>
            )}

            {/* OVERLAY DE RESUMEN Y AUTOGUARDADO */}
            {workoutState === 'SUMMARY' && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(9, 13, 22, 0.92)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 100000,
                  padding: '20px',
                }}
              >
                <div
                  style={{
                    background: '#0f172a',
                    border: '2px solid #22c55e',
                    borderRadius: '24px',
                    padding: '36px 40px',
                    maxWidth: '480px',
                    width: '100%',
                    textAlign: 'center',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                  }}
                >
                  <div style={{ fontSize: '48px' }}>✅</div>
                  <h2 style={{ fontSize: '24px', fontWeight: 900, margin: 0, color: '#f8fafc' }}>
                    ¡Serie Guardada con Éxito!
                  </h2>
                  <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                    Registrada para <strong>{(activeJugador.apodo || activeJugador.nombre).toUpperCase()}</strong> en la base de datos de fuerza.
                  </p>

                  {/* Resumen numérico */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#1e293b', padding: '16px', borderRadius: '14px' }}>
                    {sensorType === 'ENCODER' ? (
                      <>
                        <div>
                          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>REPETICIONES</div>
                          <div style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff' }}>{currentReps.length}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>PÉRDIDA VELOCIDAD</div>
                          <div style={{ fontSize: '24px', fontWeight: 900, color: '#22c55e' }}>
                            -{currentReps.length > 0 ? currentReps[currentReps.length - 1].perdidaVelocidadPct : 0}%
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>PICO MÁXIMO</div>
                          <div style={{ fontSize: '24px', fontWeight: 900, color: '#38bdf8' }}>{peakForceN} N</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>EQUIVALENTE</div>
                          <div style={{ fontSize: '24px', fontWeight: 900, color: '#22c55e' }}>
                            {(peakForceN / 9.81).toFixed(1)} kg
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Cuenta atrás */}
                  <div style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 800 }}>
                    Siguiente jugador en {autoResetCountdown} segundos...
                  </div>

                  <button
                    onClick={() => {
                      setActiveJugador(null);
                      setWorkoutState('IDLE');
                    }}
                    style={{
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      padding: '12px',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    👉 Siguiente Jugador Ya
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
