'use client';

import React, { useState, useEffect, useRef } from 'react';
import { GimnasioSesion, GimnasioEjercicio, SensorCaptureRecord } from './gimnasio-types';
import { saveSensorCapture, getSensorCapturesForDate, getAllSensorCaptures } from '@/app/actions';

// ════════════════════════════════════════════════════════════════════════════════
// PROTOCOLOS BLUETOOTH LE OFICIALES PARA HARDWARE DE GIMNASIO
// ════════════════════════════════════════════════════════════════════════════════
// 1. Tindeq Progressor (Dinamómetro de Tracción Isométrica)
const TINDEQ_SERVICE_UUID = '7e4e1701-0ea6-4190-9f39-512902f62241';
const TINDEQ_DATA_CHAR_UUID = '7e4e1702-0ea6-4190-9f39-512902f62241';
const TINDEQ_CTRL_CHAR_UUID = '7e4e1703-0ea6-4190-9f39-512902f62241';

// 2. Enode / Vmaxpro (Encoder Lineal VBT - Nordic UART Service & VBT Profile)
const ENODE_NORDIC_UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const ENODE_RX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const ENODE_TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

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
  const [connectedSensorType, setConnectedSensorType] = useState<'ENODE' | 'TINDEQ' | null>(null);
  const [showBluefyModal, setShowBluefyModal] = useState<boolean>(false);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  // Referencias Bluetooth GATT
  const bleDeviceRef = useRef<any>(null);
  const bleDataCharRef = useRef<any>(null);
  const bleCtrlCharRef = useRef<any>(null);
  const tindeqStartTimeRef = useRef<number>(0);

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

  // Jugadores que ya han sido monitorizados en esta sesión / fecha
  const [monitoredJugadorIds, setMonitoredJugadorIds] = useState<Set<string>>(new Set());

  // Cargar jugadores monitorizados para la fecha seleccionada (localStorage + Supabase)
  useEffect(() => {
    const ids = new Set<string>();

    try {
      const raw = localStorage.getItem('gimnasio_sensor_capturas_v1');
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          list.forEach((c: any) => {
            if (c.fecha === selectedFecha && c.jugadorId) {
              ids.add(c.jugadorId);
            }
          });
        }
      }
    } catch {}

    setMonitoredJugadorIds(new Set(ids));

    // Consultar también en Supabase
    getSensorCapturesForDate(selectedFecha).then(captures => {
      if (Array.isArray(captures)) {
        captures.forEach((c: any) => {
          const jId = c.jugadorId || c.jugador_id;
          if (jId) ids.add(jId);
        });
        setMonitoredJugadorIds(new Set(ids));
      }
    }).catch(console.warn);
  }, [selectedFecha]);

  // Histórico completo de capturas (locales y de Supabase) para consultar registros previos
  const [allHistoricalCaptures, setAllHistoricalCaptures] = useState<any[]>([]);

  useEffect(() => {
    let localList: any[] = [];
    try {
      const raw = localStorage.getItem('gimnasio_sensor_capturas_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) localList = parsed;
      }
    } catch {}

    setAllHistoricalCaptures(localList);

    getAllSensorCaptures().then(remoteCaptures => {
      if (Array.isArray(remoteCaptures) && remoteCaptures.length > 0) {
        const combined = [...localList];
        const seenIds = new Set(combined.map(c => c.id));
        remoteCaptures.forEach(rc => {
          if (!seenIds.has(rc.id)) {
            combined.push(rc);
          }
        });
        setAllHistoricalCaptures(combined);
      }
    }).catch(console.warn);
  }, []);

  // Mapa de última carga, velocidad máxima o kg máximos para cada jugador en el ejercicio seleccionado
  const lastRecordsByJugador = React.useMemo(() => {
    const map: Record<string, { pesoKg?: string | number; velMax?: string | number; kgMax?: number; fuerzaPicoN?: number; fecha?: string }> = {};
    if (!selectedEjercicio) return map;

    const targetEx = selectedEjercicio.trim().toUpperCase();

    // 1. Buscar primero en capturas de sensores (de más reciente a más antigua)
    allHistoricalCaptures.forEach(c => {
      const cEx = (c.ejercicioNombre || c.ejercicioId || '').trim().toUpperCase();
      const jId = c.jugadorId || c.jugador_id;
      if (cEx === targetEx && jId && !map[jId]) {
        const fPico = c.fuerzaPicoN ? Number(c.fuerzaPicoN) : undefined;
        const kgFromForce = fPico ? Math.round(fPico / 9.81) : undefined;
        map[jId] = {
          pesoKg: c.pesoKg,
          velMax: c.velocidadPico || c.velocidadMedia,
          fuerzaPicoN: fPico,
          kgMax: kgFromForce,
          fecha: c.fecha,
        };
      }
    });

    // 2. Si no hay captura del sensor, buscar en las sesiones planificadas de gimnasio
    (allDays || []).slice().reverse().forEach(d => {
      Object.entries(sesionesMap).forEach(([key, sesList]) => {
        sesList.forEach(ses => {
          if (ses.fecha === d.fecha) {
            ses.ejercicios.forEach(ej => {
              if ((ej.nombre || '').trim().toUpperCase() === targetEx) {
                if (ses.jugadorId === 'TEAM') {
                  jugadores.forEach(j => {
                    if (!map[j.id] && (ej.pesoKg || ej.velocidad)) {
                      map[j.id] = {
                        pesoKg: ej.pesoKg,
                        velMax: ej.velocidad,
                        fecha: ses.fecha,
                      };
                    }
                  });
                } else if (ses.jugadorId && !map[ses.jugadorId] && (ej.pesoKg || ej.velocidad)) {
                  map[ses.jugadorId] = {
                    pesoKg: ej.pesoKg,
                    velMax: ej.velocidad,
                    fecha: ses.fecha,
                  };
                }
              }
            });
          }
        });
      });
    });

    return map;
  }, [selectedEjercicio, allHistoricalCaptures, allDays, sesionesMap, jugadores]);

  // Contar cuántas veces ha pasado cada jugador por esta posta (ejercicio) en esta sesión
  const passCountByJugador = React.useMemo(() => {
    const counts: Record<string, number> = {};
    const targetEx = (selectedEjercicio || '').trim().toUpperCase();

    allHistoricalCaptures.forEach(c => {
      if (c.fecha === selectedFecha) {
        const cEx = (c.ejercicioNombre || c.ejercicioId || '').trim().toUpperCase();
        if (!targetEx || cEx === targetEx) {
          const jId = c.jugadorId || c.jugador_id;
          if (jId) {
            counts[jId] = (counts[jId] || 0) + 1;
          }
        }
      }
    });

    return counts;
  }, [allHistoricalCaptures, selectedFecha, selectedEjercicio]);

  // 1. Identificar ejercicios de la sesión actual Y ADEMÁS los monitorizados hasta día de hoy
  const { sessionExercises, historyExercises, allAvailableExercises } = React.useMemo(() => {
    const sessionList: Array<{ id: string; nombre: string; monitorizado: boolean; tipoSensor: 'ENCODER' | 'DINAMOMETRO'; pesoDefectoKg?: number | string; origen: 'SESION' }> = [];
    const historyList: Array<{ id: string; nombre: string; monitorizado: boolean; tipoSensor: 'ENCODER' | 'DINAMOMETRO'; pesoDefectoKg?: number | string; origen: 'HISTORICO' }> = [];
    const seenSession = new Set<string>();
    const seenHistory = new Set<string>();

    // A. Ejercicios de la sesión de la fecha seleccionada
    Object.entries(sesionesMap).forEach(([key, sesList]) => {
      sesList.forEach(ses => {
        if (ses.fecha === selectedFecha) {
          ses.ejercicios.forEach(ej => {
            const norm = (ej.nombre || '').trim().toUpperCase();
            if (norm && !seenSession.has(norm)) {
              seenSession.add(norm);
              sessionList.push({
                id: ej.id,
                nombre: ej.nombre.trim(),
                monitorizado: Boolean(ej.monitorizado),
                tipoSensor: ej.tipoSensor || 'ENCODER',
                pesoDefectoKg: ej.pesoKg ? parseFloat(ej.pesoKg) : 60,
                origen: 'SESION',
              });
            }
          });
        }
      });
    });

    // B. Ejercicios monitorizados en el histórico de todas las sesiones
    Object.entries(sesionesMap).forEach(([key, sesList]) => {
      sesList.forEach(ses => {
        ses.ejercicios.forEach(ej => {
          const norm = (ej.nombre || '').trim().toUpperCase();
          if (norm && !seenSession.has(norm) && !seenHistory.has(norm) && ej.monitorizado) {
            seenHistory.add(norm);
            historyList.push({
              id: ej.id,
              nombre: ej.nombre.trim(),
              monitorizado: true,
              tipoSensor: ej.tipoSensor || 'ENCODER',
              pesoDefectoKg: ej.pesoKg ? parseFloat(ej.pesoKg) : 60,
              origen: 'HISTORICO',
            });
          }
        });
      });
    });

    // C. Capturas anteriores en almacenamiento local
    try {
      const raw = localStorage.getItem('gimnasio_sensor_capturas_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((c: any) => {
            const norm = (c.ejercicioNombre || '').trim().toUpperCase();
            if (norm && !seenSession.has(norm) && !seenHistory.has(norm)) {
              seenHistory.add(norm);
              historyList.push({
                id: `hist_${c.ejercicioNombre}`,
                nombre: c.ejercicioNombre.trim(),
                monitorizado: true,
                tipoSensor: c.tipoSensor || 'ENCODER',
                pesoDefectoKg: c.pesoKg || 60,
                origen: 'HISTORICO',
              });
            }
          });
        }
      }
    } catch {}

    if (sessionList.length === 0 && historyList.length === 0) {
      historyList.push(
        { id: 'ej_std_1', nombre: 'Sentadilla Trasera', monitorizado: true, tipoSensor: 'ENCODER', pesoDefectoKg: 60, origen: 'HISTORICO' },
        { id: 'ej_std_2', nombre: 'Press Banca', monitorizado: true, tipoSensor: 'ENCODER', pesoDefectoKg: 50, origen: 'HISTORICO' },
        { id: 'ej_std_3', nombre: 'Tracción Isométrica (Mid-Thigh Pull)', monitorizado: true, tipoSensor: 'DINAMOMETRO', pesoDefectoKg: 0, origen: 'HISTORICO' }
      );
    }

    const all = [...sessionList, ...historyList];
    return { sessionExercises: sessionList, historyExercises: historyList, allAvailableExercises: all };
  }, [selectedFecha, sesionesMap]);

  // Set default exercise on date change
  useEffect(() => {
    if (!selectedEjercicio || !allAvailableExercises.some(e => e.nombre === selectedEjercicio)) {
      const firstMonitored = allAvailableExercises.find(e => e.monitorizado) || allAvailableExercises[0];
      if (firstMonitored) {
        setSelectedEjercicio(firstMonitored.nombre);
        setSensorType(firstMonitored.tipoSensor || 'ENCODER');
        if (firstMonitored.pesoDefectoKg) {
          setWeightKg(Number(firstMonitored.pesoDefectoKg) || 60);
        }
      }
    }
  }, [allAvailableExercises, selectedEjercicio]);

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

  // ════════════════════════════════════════════════════════════════════════════════
  // CONTROLADOR BLUETOOTH LE (TINDEQ PROGRESSOR & ENODE / VMAXPRO)
  // ════════════════════════════════════════════════════════════════════════════════

  // Notificación de datos de Tindeq Progressor (Fuerza continua en Newtons)
  const handleTindeqNotification = (event: any) => {
    const value: DataView = event.target.value;
    if (!value || value.byteLength < 4) return;

    let weightKg = 0;
    try {
      if (value.byteLength >= 8) {
        // Paquete estándar Tindeq: timestamp (4b) + float32 weight en kg (4b)
        weightKg = value.getFloat32(4, true);
      } else {
        weightKg = value.getFloat32(0, true);
      }
    } catch {
      weightKg = 0;
    }

    if (isNaN(weightKg)) return;
    const forceN = Math.max(0, Math.round(weightKg * 9.80665));

    setCurrentForceN(forceN);
    setPeakForceN((prev) => Math.max(prev, forceN));

    if (forceN > 25) {
      setWorkoutState('ACTIVE');
    }

    const elapsed = parseFloat(((Date.now() - (tindeqStartTimeRef.current || Date.now())) / 1000).toFixed(2));
    setCurvePoints((prev) => {
      const next = [...prev, { t: elapsed, f: forceN }];
      return next.slice(-200); // 200 puntos en pantalla
    });
  };

  // Notificación de repeticiones de Enode / Vmaxpro (Velocidad en m/s)
  const handleEnodeNotification = (event: any) => {
    const value: DataView = event.target.value;
    if (!value || value.byteLength === 0) return;

    try {
      let meanV = 0;
      let peakV = 0;

      if (value.byteLength >= 4) {
        // Lectura de velocidad propulsiva en cm/s o m/s
        const raw1 = value.getUint16(0, true) / 100;
        const raw2 = value.getUint16(2, true) / 100;
        if (raw1 > 0.1 && raw1 < 3.5) {
          meanV = parseFloat(raw1.toFixed(2));
          peakV = parseFloat(Math.max(meanV, raw2).toFixed(2));
        }
      }

      if (meanV > 0.15) {
        setWorkoutState('ACTIVE');
        setCurrentInstantVelocity(meanV);
        setLastVelocity(meanV);

        setCurrentReps((prev) => {
          const newBest = prev.length === 0 ? meanV : Math.max(prev[0].velocidadMedia, meanV);
          setBestVelocity(newBest);
          const dropPct = parseFloat((((newBest - meanV) / newBest) * 100).toFixed(1));
          return [
            ...prev,
            {
              rep: prev.length + 1,
              velocidadMedia: meanV,
              velocidadPico: peakV,
              perdidaVelocidadPct: dropPct,
            },
          ];
        });
      }
    } catch (e) {
      console.warn('Error interpretando paquete Enode:', e);
    }
  };

  // Tarar Tindeq a 0
  const handleTindeqTare = async () => {
    if (bleCtrlCharRef.current) {
      try {
        // Comando 0x64 (Tare) en Tindeq Progressor
        await bleCtrlCharRef.current.writeValue(new Uint8Array([0x64]));
        setCurrentForceN(0);
        setPeakForceN(0);
        setCurvePoints([]);
      } catch (e) {
        console.warn('Error tarando Tindeq:', e);
      }
    }
  };

  // Iniciar streaming continuo en Tindeq
  const startTindeqStreaming = async () => {
    if (bleCtrlCharRef.current) {
      try {
        tindeqStartTimeRef.current = Date.now();
        // Comando 0x65 (Start continuous measurement)
        await bleCtrlCharRef.current.writeValue(new Uint8Array([0x65]));
      } catch (e) {
        console.warn('Error iniciando streaming Tindeq:', e);
      }
    }
  };

  // Detener streaming en Tindeq
  const stopTindeqStreaming = async () => {
    if (bleCtrlCharRef.current) {
      try {
        // Comando 0x66 (Stop continuous measurement)
        await bleCtrlCharRef.current.writeValue(new Uint8Array([0x66]));
      } catch (e) {
        console.warn('Error deteniendo streaming Tindeq:', e);
      }
    }
  };

  // Conectar dispositivo Bluetooth mediante Web Bluetooth API
  const handleConnectBluetooth = async () => {
    const target = sensorType === 'ENCODER' ? 'ENODE' : 'TINDEQ';

    if (typeof navigator === 'undefined' || !(navigator as any).bluetooth) {
      setShowBluefyModal(true);
      setIsSimulating(true);
      return;
    }

    try {
      let device: any = null;

      if (target === 'TINDEQ') {
        device = await (navigator as any).bluetooth.requestDevice({
          filters: [
            { namePrefix: 'Progressor' },
            { namePrefix: 'Tindeq' },
            { services: [TINDEQ_SERVICE_UUID] },
          ],
          optionalServices: [TINDEQ_SERVICE_UUID, 'battery_service'],
        });
      } else {
        device = await (navigator as any).bluetooth.requestDevice({
          filters: [
            { namePrefix: 'Vmaxpro' },
            { namePrefix: 'Enode' },
            { namePrefix: 'ENODE' },
          ],
          optionalServices: [
            ENODE_NORDIC_UART_SERVICE,
            'battery_service',
            '0000ffe0-0000-1000-8000-00805f9b34fb',
          ],
        });
      }

      if (!device) return;

      bleDeviceRef.current = device;
      const server = await device.gatt.connect();

      device.addEventListener('gattserverdisconnected', () => {
        setBluetoothConnected(false);
        setBluetoothDeviceName('');
        setConnectedSensorType(null);
        setIsSimulating(true);
      });

      if (target === 'TINDEQ') {
        const service = await server.getPrimaryService(TINDEQ_SERVICE_UUID);
        const dataChar = await service.getCharacteristic(TINDEQ_DATA_CHAR_UUID);
        const ctrlChar = await service.getCharacteristic(TINDEQ_CTRL_CHAR_UUID);

        await dataChar.startNotifications();
        dataChar.addEventListener('characteristicvaluechanged', handleTindeqNotification);

        bleDataCharRef.current = dataChar;
        bleCtrlCharRef.current = ctrlChar;
      } else {
        try {
          const service = await server.getPrimaryService(ENODE_NORDIC_UART_SERVICE);
          const txChar = await service.getCharacteristic(ENODE_TX_CHAR_UUID);
          await txChar.startNotifications();
          txChar.addEventListener('characteristicvaluechanged', handleEnodeNotification);
          bleDataCharRef.current = txChar;
        } catch (e) {
          console.warn('Enode fallback connection:', e);
        }
      }

      setBluetoothConnected(true);
      setBluetoothDeviceName(device.name || (target === 'TINDEQ' ? 'Tindeq Progressor' : 'Enode Sensor'));
      setConnectedSensorType(target);
      setIsSimulating(false);
    } catch (e: any) {
      if (e.name !== 'NotFoundError') {
        console.warn('Bluetooth connection error:', e);
      }
    }
  };

  // Desconectar dispositivo Bluetooth
  const handleDisconnectBluetooth = () => {
    if (bleDeviceRef.current && bleDeviceRef.current.gatt && bleDeviceRef.current.gatt.connected) {
      bleDeviceRef.current.gatt.disconnect();
    }
    bleDeviceRef.current = null;
    bleDataCharRef.current = null;
    bleCtrlCharRef.current = null;
    setBluetoothConnected(false);
    setBluetoothDeviceName('');
    setConnectedSensorType(null);
    setIsSimulating(true);
  };

  // Start athlete turn (mantiene la última carga configurada en la estación)
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

    // Si es Tindeq en directo, tarar e iniciar medición continua
    if (bluetoothConnected && connectedSensorType === 'TINDEQ') {
      handleTindeqTare();
      startTindeqStreaming();
    }
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
    if (bluetoothConnected && connectedSensorType === 'TINDEQ') {
      stopTindeqStreaming();
    }
    setWorkoutState('SUMMARY');

    // Trigger save to Supabase
    if (activeJugador) {
      setMonitoredJugadorIds(prev => new Set([...prev, activeJugador.id]));
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
      setAllHistoricalCaptures(prev => [record, ...prev]);

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
                Monitorización de Fuerza & VBT
              </div>
              <h2 style={{ fontSize: '16px', fontWeight: 900, margin: 0, color: '#f8fafc' }}>
                Monitorización (Tablet / Móvil)
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
                const found = allAvailableExercises.find(ex => ex.nombre === e.target.value);
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
                maxWidth: '260px',
              }}
            >
              {sessionExercises.length > 0 && (
                <optgroup label="📋 Ejercicios de la Sesión">
                  {sessionExercises.map(ex => (
                    <option key={ex.id} value={ex.nombre}>
                      {ex.monitorizado ? '⚡ ' : ''}{ex.nombre} ({ex.tipoSensor === 'DINAMOMETRO' ? 'Dinamómetro' : 'Encoder'})
                    </option>
                  ))}
                </optgroup>
              )}
              {historyExercises.length > 0 && (
                <optgroup label="⚡ Histórico de Monitorizados">
                  {historyExercises.map(ex => (
                    <option key={ex.id} value={ex.nombre}>
                      ⚡ {ex.nombre} ({ex.tipoSensor === 'DINAMOMETRO' ? 'Dinamómetro' : 'Encoder'})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Tipo de sensor */}
          <div style={{ display: 'inline-flex', background: '#1e293b', borderRadius: '6px', padding: '2px', border: '1px solid #334155' }}>
            <button
              onClick={() => {
                setSensorType('ENCODER');
                if (connectedSensorType !== 'ENODE') {
                  // Si cambiamos a Encoder y no está conectado Enode, permitimos conectar Enode
                }
              }}
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
              ⚡ Enode (VBT)
            </button>
            <button
              onClick={() => {
                setSensorType('DINAMOMETRO');
              }}
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
              💪 Tindeq (Dinamómetro)
            </button>
          </div>
        </div>

        {/* Controles de hardware y salida */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Botón de Tarar para Tindeq cuando está conectado */}
          {sensorType === 'DINAMOMETRO' && bluetoothConnected && connectedSensorType === 'TINDEQ' && (
            <button
              onClick={handleTindeqTare}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: '#0e7490',
                color: '#ffffff',
                border: '1px solid #06b6d4',
                padding: '6px 10px',
                borderRadius: '7px',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Calibrar y poner a 0 Newtons el Tindeq Progressor"
            >
              <span>⚖️</span>
              <span>Tarar a 0</span>
            </button>
          )}

          {/* Bluetooth Connect / Disconnect */}
          {bluetoothConnected ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#15803d',
                  color: '#ffffff',
                  border: '1px solid #22c55e',
                  padding: '6px 10px',
                  borderRadius: '7px',
                  fontSize: '11px',
                  fontWeight: 800,
                }}
              >
                <span>🟢</span>
                <span>{bluetoothDeviceName || (connectedSensorType === 'TINDEQ' ? 'Tindeq' : 'Enode')}</span>
              </div>
              <button
                onClick={handleDisconnectBluetooth}
                style={{
                  background: '#334155',
                  color: '#f87171',
                  border: '1px solid #475569',
                  padding: '6px 8px',
                  borderRadius: '7px',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                title="Desconectar sensor Bluetooth"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectBluetooth}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: sensorType === 'ENCODER' ? '#1e3a8a' : '#164e63',
                color: '#ffffff',
                border: sensorType === 'ENCODER' ? '1px solid #3b82f6' : '1px solid #06b6d4',
                padding: '6px 12px',
                borderRadius: '7px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}
              title={sensorType === 'ENCODER' ? 'Conectar Enode / Vmaxpro por Bluetooth' : 'Conectar Tindeq Progressor por Bluetooth'}
            >
              <span>🔵</span>
              <span>{sensorType === 'ENCODER' ? 'Conectar Enode' : 'Conectar Tindeq'}</span>
            </button>
          )}

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
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: '14px',
                paddingBottom: '20px',
              }}
            >
              {filteredJugadores.map(j => {
                const passCount = passCountByJugador[j.id] || 0;
                const isMonitored = passCount > 0 || monitoredJugadorIds.has(j.id);
                const lastRec = lastRecordsByJugador[j.id];
                return (
                  <div
                    key={j.id}
                    onClick={() => handleSelectJugador(j)}
                    style={{
                      position: 'relative',
                      background: '#0f172a',
                      border: isMonitored ? '2px solid #22c55e' : '2px solid #1e293b',
                      borderRadius: '12px',
                      padding: '10px 8px 8px 8px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isMonitored ? '0 4px 14px rgba(34, 197, 94, 0.25)' : '0 4px 12px rgba(0,0,0,0.3)',
                      userSelect: 'none',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = '#38bdf8';
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = isMonitored ? '#22c55e' : '#1e293b';
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                    }}
                  >
                    {/* PUNTO VERDE ARRIBA A LA DERECHA Y NÚMERO DE VECES EN GRIS DEBAJO */}
                    {isMonitored && (
                      <div
                        title={`Ha pasado ${passCount || 1} ${passCount === 1 ? 'vez' : 'veces'} por esta posta`}
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px',
                          zIndex: 5,
                        }}
                      >
                        <div
                          style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: '#22c55e',
                            boxShadow: '0 0 8px #22c55e',
                            border: '2px solid #0f172a',
                          }}
                        />
                        {passCount > 0 && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              color: '#94a3b8',
                              lineHeight: 1,
                            }}
                          >
                            {passCount}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Foto rectangular del jugador (recortada desde abajo) */}
                    <div
                      style={{
                        width: '100%',
                        height: '108px',
                        borderRadius: '8px',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '22px',
                        fontWeight: 900,
                        color: '#38bdf8',
                      }}
                    >
                      {j.foto_url ? (
                        <img
                          src={j.foto_url}
                          alt={j.nombre}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            objectPosition: 'top center',
                          }}
                        />
                      ) : (
                        <span>{(j.apodo || j.nombre).slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>

                    {/* Nombre del jugador (sin posición) */}
                    <div style={{ textAlign: 'center', width: '100%' }}>
                      <div
                        style={{
                          fontSize: '12.5px',
                          fontWeight: 900,
                          color: '#f8fafc',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          width: '100%',
                          lineHeight: 1.2,
                        }}
                        title={j.apodo || j.nombre}
                      >
                        {(j.apodo || j.nombre).toUpperCase()}
                      </div>

                      {/* Debajo del nombre en gris: última carga y vel máx (o kg máx en dinamómetro). Si no hay, no muestra nada */}
                      <div
                        style={{
                          marginTop: '3px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#94a3b8',
                          lineHeight: 1.2,
                          minHeight: '14px',
                        }}
                      >
                        {lastRec && (lastRec.pesoKg || lastRec.velMax || lastRec.kgMax || lastRec.fuerzaPicoN) ? (
                          sensorType === 'DINAMOMETRO' ? (
                            <span style={{ color: '#94a3b8' }}>
                              {lastRec.kgMax ? `${lastRec.kgMax} kg máx` : lastRec.fuerzaPicoN ? `${Math.round(lastRec.fuerzaPicoN / 9.81)} kg máx` : ''}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              {lastRec.pesoKg && (
                                <span>{String(lastRec.pesoKg).includes('kg') ? lastRec.pesoKg : `${lastRec.pesoKg}kg`}</span>
                              )}
                              {lastRec.pesoKg && lastRec.velMax && <span>•</span>}
                              {lastRec.velMax && (
                                <span style={{ color: '#38bdf8', fontWeight: 800 }}>
                                  {String(lastRec.velMax).includes('m/s') ? lastRec.velMax : `${lastRec.velMax} m/s`}
                                </span>
                              )}
                              {!lastRec.pesoKg && !lastRec.velMax && lastRec.kgMax && (
                                <span>{lastRec.kgMax} kg</span>
                              )}
                            </span>
                          )
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
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
                    width: '52px',
                    height: '62px',
                    borderRadius: '6px',
                    background: '#1e293b',
                    border: '2px solid #38bdf8',
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
                    <img src={activeJugador.foto_url} alt={activeJugador.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
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

      {/* ── MODAL INFORMATIVO: BLUETOOTH EN IPAD / BLUEFY ── */}
      {showBluefyModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setShowBluefyModal(false)}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1.5px solid #38bdf8',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
              color: '#f8fafc',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <span style={{ fontSize: '28px' }}>📡</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#ffffff' }}>
                  Conectar {sensorType === 'ENCODER' ? 'Enode' : 'Tindeq'} en iPad
                </h3>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Aviso para Google Chrome / Safari en iPadOS
                </span>
              </div>
            </div>

            <div style={{ background: '#1e293b', borderRadius: '10px', padding: '14px', border: '1px solid #334155', marginBottom: '16px', fontSize: '12px', lineHeight: '1.55', color: '#cbd5e1' }}>
              <p style={{ margin: '0 0 10px 0' }}>
                <strong style={{ color: '#f59e0b' }}>⚠️ Restricción de Apple en iPad:</strong> Apple bloquea el acceso Bluetooth en Chrome y Safari para iPadOS.
              </p>
              <p style={{ margin: '0 0 8px 0' }}>
                Para conectar tu <strong>{sensorType === 'ENCODER' ? 'Enode (Vmaxpro)' : 'Tindeq Progressor'}</strong> en vivo en el iPad:
              </p>
              <ol style={{ margin: '0 0 10px 0', paddingLeft: '18px' }}>
                <li>Descarga en el iPad la app gratuita <strong>Bluefy</strong> (<em>Web BLE Browser</em>) desde la App Store.</li>
                <li>Abre tu web dentro de Bluefy: <code style={{ color: '#38bdf8', background: '#0f172a', padding: '2px 4px', borderRadius: '3px' }}>mng18.vercel.app</code></li>
                <li>¡Pulsa Conectar y el sensor se vinculará en directo!</li>
              </ol>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                💡 <em>Si aún no tienes los sensores físicos o estás probando la estación, el <strong>Modo Simulación</strong> te permite probar atletas, repeticiones y guardado en Supabase al instante.</em>
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setIsSimulating(true);
                  setShowBluefyModal(false);
                }}
                style={{
                  background: '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                🧪 Usar Modo Simulación
              </button>
              <button
                onClick={() => setShowBluefyModal(false)}
                style={{
                  background: '#334155',
                  color: '#e2e8f0',
                  border: '1px solid #475569',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
