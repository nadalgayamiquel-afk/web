'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
  FuerzaBBDDRow,
  deleteFuerzaBBDDRow,
  updateFuerzaBBDDRow,
  getFuerzaBBDDRows,
  saveFuerzaSesionesBatch,
  backupFuerzaBBDDToDisk,
  restoreFuerzaBBDDFromDisk,
} from '@/app/actions';
import { getCategoriaEstilo } from '@/app/gimnasio/gimnasio-types';

interface Props {
  initialRows?: FuerzaBBDDRow[];
  jugadores?: any[];
}

export default function FuerzaBBDDClient({ initialRows = [], jugadores = [] }: Props) {
  const [rows, setRows] = useState<FuerzaBBDDRow[]>(initialRows);
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filtros
  const [searchText, setSearchText] = useState('');
  const [selectedJugador, setSelectedJugador] = useState('TODOS');
  const [selectedCategoria, setSelectedCategoria] = useState('TODAS');
  const [selectedMd, setSelectedMd] = useState('TODOS');
  const [selectedEjercicio, setSelectedEjercicio] = useState('TODOS');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Modal de edición de registro
  const [editingRow, setEditingRow] = useState<FuerzaBBDDRow | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Cargar datos locales de gimnasio si no están aún en Supabase para asegurar coherencia total
  useEffect(() => {
    try {
      const savedGimnasio = localStorage.getItem('gimnasio_sesiones_map_v1');
      if (savedGimnasio) {
        const parsed = JSON.parse(savedGimnasio);
        if (parsed && typeof parsed === 'object') {
          const localRows: FuerzaBBDDRow[] = [];
          Object.values(parsed).forEach((ses: any) => {
            if (ses && Array.isArray(ses.ejercicios) && ses.jugadorId !== 'TEAM') {
              // Buscar nombre del jugador
              let jName = 'Jugador';
              let dorsal: any = null;
              let pos: any = null;
              const jug = jugadores.find((j: any) => j.id === ses.jugadorId);
              if (jug) {
                jName = jug.apodo || jug.nombre;
                dorsal = jug.dorsal || jug.cor_id;
                pos = jug.posicion;
              }

              ses.ejercicios.forEach((ej: any) => {
                localRows.push({
                  id: 'local_' + ses.id + '_' + ej.id,
                  jugador_id: ses.jugadorId,
                  fecha: ses.fecha,
                  md: ses.md || '',
                  jugadorNombre: jName,
                  dorsal,
                  posicion: pos,
                  nombreSesion: ses.nombreSesion,
                  categoria: ses.categoria,
                  ejercicioNombre: ej.nombre,
                  grupoMuscular: ej.grupoMuscular || '',
                  series: ej.series,
                  reps: String(ej.reps || ''),
                  pesoKg: String(ej.pesoKg || ''),
                  rpe: ej.rpe ?? null,
                  comentario: ej.notas || '',
                  videoUrl: ej.videoUrl || '',
                  sesionNotas: ses.notas || '',
                  sesionVideoUrl: ses.videoUrl || '',
                  bloque: ej.bloque || 'PP',
                  tiempo: ej.tiempo || ej.variablesPersonalizadas?.['Tiempo'] || ej.variablesPersonalizadas?.['tiempo'] || null,
                  velocidad: ej.velocidad || ej.variablesPersonalizadas?.['Velocidad'] || ej.variablesPersonalizadas?.['velocidad'] || null,
                  material: ej.material || ej.variablesPersonalizadas?.['Material'] || ej.variablesPersonalizadas?.['material'] || null,
                  variables: {
                    ...(ej.variablesPersonalizadas || {}),
                    ...(ej.material ? { Material: ej.material } : {}),
                    ...(ej.velocidad ? { Velocidad: ej.velocidad } : {}),
                    ...(ej.tiempo ? { Tiempo: ej.tiempo } : {}),
                  },
                  estado: ses.estado || 'completado',
                });
              });
            }
          });

          // Si hay más registros locales que en Supabase, combinar
          if (localRows.length > 0 && initialRows.length === 0) {
            setRows(localRows);
          }
        }
      }
    } catch (e) {}
  }, [jugadores, initialRows]);

  // Recargar desde Supabase
  const handleReloadSupabase = async () => {
    setIsLoading(true);
    try {
      const fresh = await getFuerzaBBDDRows();
      setRows(fresh);
      showToast('✓ BBDD FUERZA actualizada desde Supabase (' + fresh.length + ' registros)');
    } catch (e) {
      showToast('⚠️ Error al conectar con Supabase');
    } finally {
      setIsLoading(false);
    }
  };

  // Respaldar y Restaurar al 100%
  const handleManualBackup = async () => {
    setIsLoading(true);
    try {
      const res = await backupFuerzaBBDDToDisk();
      if (res.success) {
        showToast(`🛡️ Copia de seguridad guardada al 100% (${res.count} ejercicios respaldados)`);
      } else {
        showToast(`⚠️ Error al respaldar: ${res.error || 'Desconocido'}`);
      }
    } catch (e: any) {
      showToast(`⚠️ Error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualRestore = async () => {
    const ok = window.confirm(
      '¿Deseas restaurar la base de datos de fuerza al 100% desde la copia de seguridad guardada en el servidor?\n\nEsto recuperará todos los ejercicios y sesiones guardadas.'
    );
    if (!ok) return;

    setIsLoading(true);
    try {
      const res = await restoreFuerzaBBDDFromDisk();
      if (res.success) {
        showToast(`✓ Restaurado al 100% (${res.count} ejercicios recuperados). Actualizando...`);
        handleReloadSupabase();
      } else {
        showToast(`⚠️ Error al restaurar: ${res.error || 'No se pudo recuperar'}`);
      }
    } catch (e: any) {
      showToast(`⚠️ Error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Sincronizar sesiones locales hacia Supabase
  const handleSyncLocalToSupabase = async () => {
    setIsLoading(true);
    try {
      const saved = localStorage.getItem('gimnasio_sesiones_map_v1');
      if (!saved) {
        showToast('No hay sesiones locales pendientes de sincronizar');
        setIsLoading(false);
        return;
      }
      const parsed = JSON.parse(saved);
      const rowsToSync: any[] = [];
      Object.values(parsed).forEach((ses: any) => {
        if (ses && Array.isArray(ses.ejercicios) && ses.jugadorId !== 'TEAM') {
          let jName = 'Jugador';
          let dorsal: any = null;
          let pos: any = null;
          const jug = jugadores.find((j: any) => j.id === ses.jugadorId);
          if (jug) {
            jName = jug.apodo || jug.nombre;
            dorsal = jug.dorsal || jug.cor_id;
            pos = jug.posicion;
          }

          ses.ejercicios.forEach((ej: any) => {
            rowsToSync.push({
              fecha: ses.fecha,
              md: ses.md || '',
              jugadorNombre: jName,
              dorsal,
              posicion: pos,
              nombreSesion: ses.nombreSesion,
              categoria: ses.categoria,
              ejercicioNombre: ej.nombre,
              grupoMuscular: ej.grupoMuscular || '',
              series: ej.series,
              reps: String(ej.reps || ''),
              pesoKg: String(ej.pesoKg || ''),
              rpe: ej.rpe ?? null,
              comentario: ej.notas || '',
              tiempo: ej.tiempo || ej.variablesPersonalizadas?.['Tiempo'] || ej.variablesPersonalizadas?.['tiempo'] || null,
              velocidad: ej.velocidad || ej.variablesPersonalizadas?.['Velocidad'] || ej.variablesPersonalizadas?.['velocidad'] || null,
              material: ej.material || ej.variablesPersonalizadas?.['Material'] || ej.variablesPersonalizadas?.['material'] || null,
              variables: {
                ...(ej.variablesPersonalizadas || {}),
                ...(ej.material ? { Material: ej.material } : {}),
                ...(ej.velocidad ? { Velocidad: ej.velocidad } : {}),
                ...(ej.tiempo ? { Tiempo: ej.tiempo } : {}),
              },
              estado: ses.estado || 'completado',
            });
          });
        }
      });

      if (rowsToSync.length > 0) {
        const res = await saveFuerzaSesionesBatch(rowsToSync);
        if (res.success) {
          showToast('✓ ' + (res.count || rowsToSync.length) + ' ejercicios sincronizados con Supabase');
          handleReloadSupabase();
        } else {
          showToast('⚠️ Error: ' + (res.error || 'No se pudo sincronizar'));
        }
      }
    } catch (e: any) {
      showToast('⚠️ Error al sincronizar: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Obtener todas las claves de variables presentes en las filas (Material, Velocidad, Tiempo, etc.)
  const variableKeys = useMemo(() => {
    const keysSet = new Set<string>();
    // Claves estándar siempre contempladas
    keysSet.add('Material');
    keysSet.add('Velocidad');
    keysSet.add('Tiempo');

    rows.forEach(r => {
      if (r.material) keysSet.add('Material');
      if (r.velocidad) keysSet.add('Velocidad');
      if (r.tiempo) keysSet.add('Tiempo');
      if (r.potencia) keysSet.add('Potencia');
      if (r.variables && typeof r.variables === 'object') {
        Object.keys(r.variables).forEach(k => {
          if (k && k.trim()) keysSet.add(k.trim());
        });
      }
    });

    const standardOrder = ['Material', 'Velocidad', 'Tiempo', 'Potencia'];
    return Array.from(keysSet).sort((a, b) => {
      const idxA = standardOrder.indexOf(a);
      const idxB = standardOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [rows]);

  const getRowVariableValue = (r: FuerzaBBDDRow, varKey: string): string => {
    if (varKey.toLowerCase() === 'material') {
      return r.material || r.variables?.['Material'] || r.variables?.['material'] || '';
    }
    if (varKey.toLowerCase() === 'velocidad') {
      return r.velocidad || r.variables?.['Velocidad'] || r.variables?.['velocidad'] || '';
    }
    if (varKey.toLowerCase() === 'tiempo') {
      return r.tiempo || r.variables?.['Tiempo'] || r.variables?.['tiempo'] || '';
    }
    if (varKey.toLowerCase() === 'potencia') {
      return r.potencia || r.variables?.['Potencia'] || r.variables?.['potencia'] || '';
    }
    return r.variables?.[varKey] || (r as any)[varKey] || '';
  };

  // Listas únicas para filtros
  const uniqueJugadores = useMemo(() => {
    return [...new Set(rows.map(r => r.jugadorNombre).filter((j): j is string => Boolean(j)))].sort();
  }, [rows]);

  const uniqueCategorias = useMemo(() => {
    return [...new Set(rows.map(r => r.categoria).filter((c): c is string => Boolean(c)))].sort();
  }, [rows]);

  const uniqueEjercicios = useMemo(() => {
    return [...new Set(rows.map(r => r.ejercicioNombre).filter((e): e is string => Boolean(e)))].sort();
  }, [rows]);

  const uniqueMds = useMemo(() => {
    return [...new Set(rows.map(r => r.md).filter((m): m is string => Boolean(m)))].sort();
  }, [rows]);

  // Filtrado de filas
  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (selectedJugador !== 'TODOS' && r.jugadorNombre !== selectedJugador) return false;
      if (selectedCategoria !== 'TODAS' && r.categoria !== selectedCategoria) return false;
      if (selectedMd !== 'TODOS' && r.md !== selectedMd) return false;
      if (selectedEjercicio !== 'TODOS' && r.ejercicioNombre !== selectedEjercicio) return false;
      if (fechaDesde && r.fecha < fechaDesde) return false;
      if (fechaHasta && r.fecha > fechaHasta) return false;

      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        const mJ = r.jugadorNombre?.toLowerCase().includes(q);
        const mE = r.ejercicioNombre?.toLowerCase().includes(q);
        const mS = r.nombreSesion?.toLowerCase().includes(q);
        const mC = r.comentario?.toLowerCase().includes(q);
        const mG = r.grupoMuscular?.toLowerCase().includes(q);
        const mV = r.videoUrl?.toLowerCase().includes(q);
        if (!mJ && !mE && !mS && !mC && !mG && !mV) return false;
      }
      return true;
    });
  }, [rows, selectedJugador, selectedCategoria, selectedMd, selectedEjercicio, fechaDesde, fechaHasta, searchText]);

  // Métricas
  const metricas = useMemo(() => {
    const totalEjercicios = filteredRows.length;
    const jugsCount = new Set(filteredRows.map(r => r.jugadorNombre)).size;
    const fechasCount = new Set(filteredRows.map(r => r.fecha)).size;

    // Carga máxima numérica
    let maxKg = 0;
    let sumKg = 0;
    let countKg = 0;
    filteredRows.forEach(r => {
      const num = parseFloat(String(r.pesoKg).replace(',', '.'));
      if (!isNaN(num) && num > 0) {
        if (num > maxKg) maxKg = num;
        sumKg += num;
        countKg++;
      }
    });

    const mediaKg = countKg > 0 ? (sumKg / countKg).toFixed(1) : '—';
    return { totalEjercicios, jugsCount, fechasCount, maxKg, mediaKg };
  }, [filteredRows]);

  // Exportar a Excel
  const handleExportExcel = () => {
    const dataToExport = filteredRows.map(r => ({
      Fecha: r.fecha,
      MD: r.md || '',
      Jugador: r.jugadorNombre,
      Dorsal: r.dorsal || '',
      Posicion: r.posicion || '',
      Categoria: r.categoria,
      Sesion: r.nombreSesion,
      Ejercicio: r.ejercicioNombre,
      GrupoMuscular: r.grupoMuscular || '',
      Series: r.series,
      Reps: r.reps,
      Carga_Kg: r.pesoKg,
      RPE: r.rpe || '',
      Comentario_Observacion: r.comentario || '',
      Video_URL: r.videoUrl || '',
      Variables: Object.entries(r.variables || {}).map(([k, v]) => k + ': ' + v).join('; '),
      Estado: r.estado || 'completado',
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BBDD_Fuerza');
    XLSX.writeFile(wb, 'BBDD_Fuerza_' + new Date().toISOString().split('T')[0] + '.xlsx');
    showToast('✓ Archivo Excel exportado con éxito');
  };

  // Exportar a CSV
    const handleExportCSV = () => {
    const headers = ['Fecha', 'MD', 'Jugador', 'Dorsal', 'Posicion', 'Categoria', 'Sesion', 'Ejercicio', 'GrupoMuscular', 'Series', 'Reps', 'Carga_Kg', 'RPE', 'Comentario', 'Video_URL', 'Variables'];
    const lines = filteredRows.map(r => [
      r.fecha,
      r.md || '',
      '"' + (r.jugadorNombre || '').replace(/"/g, '""') + '"',
      r.dorsal || '',
      r.posicion || '',
      r.categoria || '',
      '"' + (r.nombreSesion || '').replace(/"/g, '""') + '"',
      '"' + (r.ejercicioNombre || '').replace(/"/g, '""') + '"',
      '"' + (r.grupoMuscular || '').replace(/"/g, '""') + '"',
      r.series,
      r.reps,
      r.pesoKg,
      r.rpe || '',
      '"' + (r.comentario || '').replace(/"/g, '""') + '"',
      '"' + (r.videoUrl || '').replace(/"/g, '""') + '"',
      '"' + Object.entries(r.variables || {}).map(([k, v]) => k + ': ' + v).join('; ') + '"',
    ].join(';'));

    const csvBody = [headers.join(';'), ...lines].join('\n');
    const blob = new Blob(["\uFEFF" + csvBody], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'BBDD_Fuerza_' + new Date().toISOString().split('T')[0] + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('✓ Archivo CSV exportado con éxito');
  };

  // Eliminar registro
  const handleDeleteRow = async (id: string) => {
    if (!confirm('¿Eliminar este registro de fuerza?')) return;
    if (!id.startsWith('local_')) {
      await deleteFuerzaBBDDRow(id);
    }
    setRows(rows.filter(r => r.id !== id));
    showToast('🗑️ Registro eliminado');
  };

  // Guardar edición
  const handleSaveEdit = async () => {
    if (!editingRow) return;
    if (!editingRow.id.startsWith('local_')) {
      await updateFuerzaBBDDRow(editingRow.id, editingRow);
    }
    setRows(rows.map(r => (r.id === editingRow.id ? editingRow : r)));

    // Sincronizar también con el almacenamiento local del Gimnasio
    try {
      const savedMap = localStorage.getItem('gimnasio_sesiones_map_v1');
      if (savedMap) {
        const parsed = JSON.parse(savedMap);
        let changed = false;
        for (const k in parsed) {
          const list = parsed[k];
          if (Array.isArray(list)) {
            list.forEach((ses: any) => {
              if (ses.fecha === editingRow.fecha && ses.nombreSesion === editingRow.nombreSesion) {
                (ses.ejercicios || []).forEach((ej: any) => {
                  if (ej.nombre === editingRow.ejercicioNombre) {
                    if (editingRow.comentario !== undefined) ej.notas = editingRow.comentario;
                    if (editingRow.videoUrl !== undefined) ej.videoUrl = editingRow.videoUrl;
                    changed = true;
                  }
                });
              }
            });
          }
        }
        if (changed) {
          localStorage.setItem('gimnasio_sesiones_map_v1', JSON.stringify(parsed));
        }
      }
    } catch (e) {}

    showToast('✓ Registro actualizado en Supabase y BBDD');
    setEditingRow(null);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'inherit' }}>
      {/* Toast */}
      {toastMessage && (
        <div className="no-print" style={{
          position: 'fixed',
          top: '20px',
          right: '24px',
          background: '#0f172a',
          color: '#ffffff',
          padding: '10px 18px',
          borderRadius: '8px',
          fontWeight: 700,
          fontSize: '12.5px',
          zIndex: 99999,
          boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
        }}>
          {toastMessage}
        </div>
      )}

      {/* TOPBAR */}
      <header style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link
            href="/"
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#64748b',
              textDecoration: 'none',
              background: '#f1f5f9',
              padding: '6px 12px',
              borderRadius: '6px',
            }}
          >
            ← Inicio
          </Link>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🏋️</span>
              <h1 style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', margin: 0 }}>
                BASE DE DATOS: FUERZA & GIMNASIO
              </h1>
              <span style={{
                fontSize: '10.5px',
                fontWeight: 800,
                background: '#ede9fe',
                color: '#6d28d9',
                padding: '2px 8px',
                borderRadius: '12px',
                border: '1px solid #c4b5fd',
              }}>
                Supabase Sync
              </span>
            </div>
            <p style={{ fontSize: '11.5px', color: '#64748b', margin: 0 }}>
              Registro consolidado de ejercicios, cargas levantadas, repeticiones, variables y observaciones
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleManualBackup}
            disabled={isLoading}
            title="Crear copia de seguridad del 100% de la BBDD de fuerza en el servidor"
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              border: '1px solid #16a34a',
              background: '#f0fdf4',
              color: '#15803d',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span>🛡️</span>
            <span>Copia 100%</span>
          </button>

          <button
            onClick={handleManualRestore}
            disabled={isLoading}
            title="Restaurar el 100% de la BBDD de fuerza desde la copia guardada"
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              border: '1px solid #d97706',
              background: '#fffbeb',
              color: '#b45309',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span>🔄</span>
            <span>Restaurar 100%</span>
          </button>

          <button
            onClick={handleSyncLocalToSupabase}
            disabled={isLoading}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              border: '1px solid #bfdbfe',
              background: '#eff6ff',
              color: '#1e3a8a',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            🔄 Sincronizar con Supabase
          </button>

          <button
            onClick={handleExportExcel}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#166534',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            📥 Excel
          </button>

          <button
            onClick={handleExportCSV}
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            📄 CSV
          </button>

          <Link
            href="/gimnasio"
            style={{
              fontSize: '12px',
              fontWeight: 800,
              color: '#ffffff',
              background: '#1e3a8a',
              padding: '7px 14px',
              borderRadius: '6px',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            🏋️ Diseñador Gimnasio
          </Link>
        </div>
      </header>

      {/* TARJETAS DE MÉTRICAS */}
      <section style={{ padding: '16px 24px 0 24px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
              Total Ejercicios
            </div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>
              {metricas.totalEjercicios}
            </div>
            <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>
              Filtrados en pantalla
            </div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
              Jugadores Únicos
            </div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#1e3a8a', marginTop: '2px' }}>
              {metricas.jugsCount}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              Con registros de fuerza
            </div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
              Días Registrados
            </div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#d97706', marginTop: '2px' }}>
              {metricas.fechasCount}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              Sesiones de entrenamiento
            </div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
              Carga Máxima / Media
            </div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#7c3aed', marginTop: '2px' }}>
              {metricas.maxKg > 0 ? metricas.maxKg + ' kg' : '—'}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              Media: {metricas.mediaKg !== '—' ? metricas.mediaKg + ' kg' : '—'}
            </div>
          </div>
        </div>
      </section>

      {/* BARRA DE FILTROS */}
      <section style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        margin: '16px 24px',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
            <input
              type="text"
              placeholder="Buscar por jugador, ejercicio, observación..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '12px',
                outline: 'none',
              }}
            />
            {searchText && (
              <button
                onClick={() => setSearchText('')}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Desde:</span>
            <input
              type="date"
              value={fechaDesde}
              onChange={e => setFechaDesde(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11.5px' }}
            />
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Hasta:</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={e => setFechaHasta(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11.5px' }}
            />
            {(fechaDesde || fechaHasta) && (
              <button
                onClick={() => { setFechaDesde(''); setFechaHasta(''); }}
                style={{ fontSize: '11px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Limpiar fechas
              </button>
            )}
          </div>
        </div>

        {/* SELECTORES DE FILTRO */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <select
            value={selectedJugador}
            onChange={e => setSelectedJugador(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11.5px', fontWeight: 700 }}
          >
            <option value="TODOS">Todos los Jugadores ({uniqueJugadores.length})</option>
            {uniqueJugadores.map(j => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>

          <select
            value={selectedCategoria}
            onChange={e => setSelectedCategoria(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11.5px', fontWeight: 700 }}
          >
            <option value="TODAS">Todas las Categorías ({uniqueCategorias.length})</option>
            {uniqueCategorias.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={selectedMd}
            onChange={e => setSelectedMd(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11.5px', fontWeight: 700 }}
          >
            <option value="TODOS">Todos los MD ({uniqueMds.length})</option>
            {uniqueMds.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <select
            value={selectedEjercicio}
            onChange={e => setSelectedEjercicio(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11.5px', fontWeight: 700 }}
          >
            <option value="TODOS">Todos los Ejercicios ({uniqueEjercicios.length})</option>
            {uniqueEjercicios.map(ej => (
              <option key={ej} value={ej}>{ej}</option>
            ))}
          </select>

          <div style={{ marginLeft: 'auto', fontSize: '11.5px', fontWeight: 700, color: '#64748b' }}>
            Mostrando <strong>{filteredRows.length}</strong> de <strong>{rows.length}</strong> registros
          </div>
        </div>
      </section>

      {/* TABLA BBDD FUERZA */}
      <main style={{ padding: '0 24px 32px 24px', overflowX: 'auto' }}>
        <div style={{
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #cbd5e1',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#ffffff', height: '34px' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 800 }}>Fecha</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 800 }}>MD</th>
                <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 800 }}>Jugador</th>
                <th style={{ padding: '6px 6px', textAlign: 'center', fontWeight: 800 }}>Pos.</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 800 }}>Categoría</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 800 }}>Sesión</th>
                <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 900 }}>Ejercicio</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 800 }}>Grupo Muscular</th>
                <th style={{ padding: '6px 6px', textAlign: 'center', fontWeight: 800 }}>Series</th>
                <th style={{ padding: '6px 6px', textAlign: 'center', fontWeight: 800 }}>Reps</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 900, background: '#1e293b' }}>Carga (kg)</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 800 }}>Variables</th>
                <th style={{ padding: '6px 6px', textAlign: 'center', fontWeight: 800 }}>RPE</th>
                <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 800 }}>Observación / Comentario</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 800 }}>Video</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 800, width: '60px' }}>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={16} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8', fontSize: '13px' }}>
                    No se encontraron registros de ejercicios con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, idx) => {
                  const estiloCat = getCategoriaEstilo(r.categoria);
                  const isEven = idx % 2 === 0;

                  return (
                    <tr
                      key={r.id}
                      style={{
                        background: isEven ? '#ffffff' : '#f8fafc',
                        borderBottom: '1px solid #f1f5f9',
                        height: '34px',
                      }}
                    >
                      {/* Fecha */}
                      <td style={{ padding: '4px 10px', fontWeight: 800, color: '#334155' }}>
                        {r.fecha}
                      </td>

                      {/* MD */}
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        {r.md ? (
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 900,
                            padding: '1px 6px',
                            borderRadius: '10px',
                            background: r.md === '-2MD' ? '#ede9fe' : '#f1f5f9',
                            color: r.md === '-2MD' ? '#6d28d9' : '#475569',
                            border: '1px solid ' + (r.md === '-2MD' ? '#c4b5fd' : '#cbd5e1'),
                          }}>
                            {r.md}
                          </span>
                        ) : '—'}
                      </td>

                      {/* Jugador */}
                      <td style={{ padding: '4px 12px', fontWeight: 900, color: '#0f172a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            background: '#1e3a8a',
                            color: '#ffffff',
                            fontSize: '9px',
                            fontWeight: 900,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            {r.dorsal || r.jugadorNombre.slice(0, 1)}
                          </div>
                          <span>{r.jugadorNombre}</span>
                        </div>
                      </td>

                      {/* Posición */}
                      <td style={{ padding: '4px 6px', textAlign: 'center', fontSize: '9.5px', fontWeight: 800, color: '#64748b' }}>
                        {r.posicion || '—'}
                      </td>

                      {/* Categoría */}
                      <td style={{ padding: '4px 8px' }}>
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 900,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          background: estiloCat.badgeBg,
                          color: estiloCat.color,
                        }}>
                          {estiloCat.icon} {r.categoria}
                        </span>
                      </td>

                      {/* Sesión */}
                      <td style={{ padding: '4px 10px', color: '#64748b', fontSize: '11px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.nombreSesion}>
                        {r.nombreSesion}
                      </td>

                      {/* Ejercicio */}
                      <td style={{ padding: '4px 12px', fontWeight: 900, color: '#0f172a' }}>
                        {r.ejercicioNombre}
                      </td>

                      {/* Grupo Muscular */}
                      <td style={{ padding: '4px 8px', color: '#64748b', fontSize: '11px' }}>
                        {r.grupoMuscular || '—'}
                      </td>

                      {/* Series */}
                      <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 800 }}>
                        {r.series}
                      </td>

                      {/* Reps */}
                      <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 800 }}>
                        {r.reps}
                      </td>

                      {/* Carga (kg) */}
                      <td style={{ padding: '4px 8px', textAlign: 'center', background: '#f1f5f9' }}>
                        {r.pesoKg ? (
                          <span style={{
                            fontWeight: 900,
                            color: '#1e3a8a',
                            background: '#e0f2fe',
                            border: '1px solid #bae6fd',
                            padding: '1px 6px',
                            borderRadius: '4px',
                          }}>
                            {r.pesoKg} kg
                          </span>
                        ) : '—'}
                      </td>

                      {/* Variables (Tiempo, Velocidad...) */}
                      <td style={{ padding: '4px 8px', textAlign: 'center', fontSize: '10.5px' }}>
                        {r.variables && Object.keys(r.variables).length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                            {Object.entries(r.variables).map(([k, v]) => (
                              <span key={k} style={{ color: '#0369a1', fontWeight: 700 }}>
                                {k}: {v}
                              </span>
                            ))}
                          </div>
                        ) : '—'}
                      </td>

                      {/* RPE */}
                      <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 800, color: '#b45309' }}>
                        {r.rpe ? 'RPE ' + r.rpe : '—'}
                      </td>

                      {/* Comentario / Observación */}
                      <td style={{ padding: '4px 12px', color: r.comentario ? '#0f172a' : '#94a3b8' }}>
                        {r.comentario ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '11px' }}>💬</span>
                            <span>{r.comentario}</span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Video */}
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        {r.videoUrl ? (
                          <a
                            href={r.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={r.videoUrl}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: '#fee2e2',
                              color: '#b91c1c',
                              border: '1px solid #fca5a5',
                              fontSize: '10.5px',
                              fontWeight: 800,
                              textDecoration: 'none',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span>🎥</span>
                            <span>Ver</span>
                          </a>
                        ) : (
                          <span style={{ color: '#cbd5e1' }}>—</span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <button
                            onClick={() => setEditingRow(JSON.parse(JSON.stringify(r)))}
                            title="Editar fila"
                            style={{ background: 'none', border: 'none', color: '#1e3a8a', cursor: 'pointer', fontSize: '11px' }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteRow(r.id)}
                            title="Eliminar fila"
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px' }}
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
      </main>

      {/* MODAL DE EDICIÓN DE REGISTRO BBDD */}
      {editingRow && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px',
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '10px',
            width: '100%',
            maxWidth: '600px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            overflow: 'hidden',
          }}>
            <div style={{
              background: '#0f172a',
              color: '#ffffff',
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: 900, margin: 0 }}>
                Editar Registro en BBDD Fuerza
              </h3>
              <button
                onClick={() => setEditingRow(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '75vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#475569' }}>Jugador</label>
                  <input
                    type="text"
                    value={editingRow.jugadorNombre}
                    onChange={e => setEditingRow({ ...editingRow, jugadorNombre: e.target.value })}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#475569' }}>Fecha</label>
                  <input
                    type="date"
                    value={editingRow.fecha}
                    onChange={e => setEditingRow({ ...editingRow, fecha: e.target.value })}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#475569' }}>Ejercicio</label>
                <input
                  type="text"
                  value={editingRow.ejercicioNombre}
                  onChange={e => setEditingRow({ ...editingRow, ejercicioNombre: e.target.value })}
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 800 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#475569' }}>Series</label>
                  <input
                    type="number"
                    value={editingRow.series}
                    onChange={e => setEditingRow({ ...editingRow, series: parseInt(e.target.value) || 1 })}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '12px', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#475569' }}>Reps</label>
                  <input
                    type="text"
                    value={editingRow.reps}
                    onChange={e => setEditingRow({ ...editingRow, reps: e.target.value })}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '12px', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#475569' }}>Carga (kg)</label>
                  <input
                    type="text"
                    value={editingRow.pesoKg}
                    onChange={e => setEditingRow({ ...editingRow, pesoKg: e.target.value })}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '12px', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#475569' }}>RPE</label>
                  <input
                    type="number"
                    value={editingRow.rpe || ''}
                    onChange={e => setEditingRow({ ...editingRow, rpe: e.target.value ? parseInt(e.target.value) : null })}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '12px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#475569' }}>Observación / Comentario</label>
                <textarea
                  value={editingRow.comentario || ''}
                  onChange={e => setEditingRow({ ...editingRow, comentario: e.target.value })}
                  placeholder="Observación del ejercicio..."
                  style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11.5px', minHeight: '44px' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#b91c1c' }}>🎥 Enlace de Video (URL)</label>
                  {editingRow.videoUrl && (
                    <a
                      href={editingRow.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '10px', color: '#dc2626', fontWeight: 800, textDecoration: 'none' }}
                    >
                      ▶ Probar video
                    </a>
                  )}
                </div>
                <input
                  type="url"
                  value={editingRow.videoUrl || ''}
                  onChange={e => setEditingRow({ ...editingRow, videoUrl: e.target.value })}
                  placeholder="https://... (YouTube, Drive, Vimeo de este ejercicio)"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #fca5a5', fontSize: '11.5px' }}
                />
              </div>
            </div>

            <div style={{
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              padding: '10px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '8px',
            }}>
              <button
                onClick={() => setEditingRow(null)}
                style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '11.5px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                style={{ padding: '6px 16px', borderRadius: '4px', border: 'none', background: '#1e3a8a', color: '#ffffff', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
