'use client';

/**
 * Pantalla: Visión Individual (informe de solo lectura)
 * Ruta: app/jugadores/[id]/vision/page.tsx
 *
 * Reconstruye la hoja "Vision Individual" del Excel: una rejilla donde
 * cada COLUMNA es un día y cada FILA es SIEMPRE el mismo dato (igual que
 * en la hoja de Excel), con la disponibilidad coloreada según la leyenda.
 *
 * Es puramente informativo: no hay inputs que guarden nada, solo lectura
 * de lo que ya existe en la base de datos.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// ---------- tipos ----------

type Jugador = {
  id: string;
  nombre: string;
  apodo: string | null;
  posicion: string | null;
  equipo: string | null;
  foto_url: string | null;
};

type DiaColumna = {
  fecha: string; // YYYY-MM-DD
  sesionDiaId: string;
  periodo: string | null;
  subperiodo: string | null;
  md: string | null;
  rival: string | null;
  disponibilidad: string | null;
  objetivo: string | null;
  eventos: { tipo: string | null; hora: string | null; lugar: string | null; duracion: number | null }[];
  comentarios: { etiqueta: string; texto: string }[];
  tests: string[];
  planes: { nombre: string; acciones: string | null; evaluacion: number | null }[];
};

// ---------- colores según la leyenda (Disponible / Readaptación / Lesión) ----------

function colorDisponibilidad(valor: string | null): string {
  if (!valor) return 'bg-gray-50 text-gray-400';
  const v = valor.toLowerCase();
  if (v.includes('lesion') || v.includes('lesión')) return 'bg-red-100 text-red-800 font-medium';
  if (v.includes('readapt')) return 'bg-yellow-100 text-yellow-800 font-medium';
  if (v.includes('dispon')) return 'bg-green-100 text-green-800 font-medium';
  return 'bg-gray-50 text-gray-600';
}

function colorEvento(tipo: string | null): string {
  if (!tipo) return 'bg-gray-100 text-gray-600';
  const t = tipo.toUpperCase();
  if (t === 'RED' || t === 'CO') return 'bg-red-500 text-white';
  if (t === 'OP') return 'bg-blue-500 text-white';
  if (t === 'PA') return 'bg-orange-500 text-white';
  if (t === 'OPTIMIZADOR') return 'bg-purple-500 text-white';
  if (t === 'COADYUVANTE') return 'bg-teal-500 text-white';
  if (t === 'READAPTACION' || t === 'READAPTACIÓN') return 'bg-yellow-500 text-white';
  return 'bg-slate-500 text-white';
}

// Tipos "de presencia": basta con que haya un evento de este tipo ese día,
// no tiene sentido sumarles minutos (no son sesiones con duración propia).
const TIPOS_SOLO_PRESENCIA = ['OPTIMIZADOR', 'COADYUVANTE', 'READAPTACION', 'READAPTACIÓN'];

function formatFechaCorta(fechaISO: string): { dia: string; fecha: string } {
  const d = new Date(fechaISO + 'T00:00:00');
  const dias = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  return {
    dia: dias[d.getDay()],
    fecha: d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
  };
}

// ---------- fechas por defecto: últimas 2 semanas ----------

function fechaISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangoPorDefecto() {
  const hoy = new Date();
  const hace14 = new Date();
  hace14.setDate(hoy.getDate() - 14);
  return { desde: fechaISO(hace14), hasta: fechaISO(hoy) };
}

// ---------- componente ----------

export default function VisionIndividualPage() {
  const params = useParams();
  const jugadorId = params.id as string;

  const defaults = rangoPorDefecto();
  const [desde, setDesde] = useState(defaults.desde);
  const [hasta, setHasta] = useState(defaults.hasta);

  const [jugador, setJugador] = useState<Jugador | null>(null);
  const [dias, setDias] = useState<DiaColumna[]>([]);
  const [gpsResumen, setGpsResumen] = useState<Record<string, number>>({});
  const [lesiones, setLesiones] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // 1. Datos del jugador
      const { data: jugadoras, error: errJug } = await supabase
        .from('jugadores')
        .select('id, nombre, apodo, posicion, equipo, foto_url')
        .eq('id', jugadorId)
        .limit(1);
      if (errJug) throw errJug;
      setJugador(jugadoras?.[0] || null);

      // 2. Sesiones del rango de fechas (contexto compartido por todo el equipo)
      const { data: sesiones, error: errSes } = await supabase
        .from('sesiones_dia')
        .select('id, fecha, periodo, subperiodo, md, rival')
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: true });
      if (errSes) throw errSes;

      const sesionIds = (sesiones || []).map((s) => s.id);

      // 3. Estado diario de ESTE jugador en esas sesiones
      const { data: estados } = await supabase
        .from('estado_diario_jugador')
        .select('*')
        .eq('jugador_id', jugadorId)
        .in('sesion_dia_id', sesionIds.length ? sesionIds : ['00000000-0000-0000-0000-000000000000']);

      // 4. Eventos de este jugador en esas sesiones
      const { data: eventos } = await supabase
        .from('eventos_jugador')
        .select('id, sesion_dia_id, tipo_evento_codigo, hora, lugar, duracion')
        .eq('jugador_id', jugadorId)
        .in('sesion_dia_id', sesionIds.length ? sesionIds : ['00000000-0000-0000-0000-000000000000']);

      // 5. Tests asociados a esos eventos
      const eventoIds = (eventos || []).map((e) => e.id);
      const { data: tests } = eventoIds.length
        ? await supabase.from('tests_jugador_evento').select('evento_jugador_id, tipo_test').in('evento_jugador_id', eventoIds)
        : { data: [] as any[] };

      // 6. Planes de este jugador en esas sesiones
      const { data: planes } = await supabase
        .from('planes_jugador_dia')
        .select('sesion_dia_id, nombre, acciones, evaluacion')
        .eq('jugador_id', jugadorId)
        .in('sesion_dia_id', sesionIds.length ? sesionIds : ['00000000-0000-0000-0000-000000000000']);

      // 7. Lesiones del jugador que caen dentro del rango (o siguen abiertas)
      const { data: lesionesData } = await supabase
        .from('lesiones')
        .select('*')
        .eq('jugador_id', jugadorId)
        .lte('fecha_inicio', hasta)
        .or(`fecha_alta.gte.${desde},fecha_alta.is.null`);
      setLesiones(lesionesData || []);

      // 8. GPS: resumen (promedio de cada métrica) del rango
      const { data: gpsData } = await supabase
        .from('gps_datos')
        .select('metricas')
        .eq('jugador_id', jugadorId)
        .gte('fecha', desde)
        .lte('fecha', hasta);

      const sumas: Record<string, { total: number; n: number }> = {};
      (gpsData || []).forEach((row) => {
        const m = (row.metricas || {}) as Record<string, number>;
        Object.entries(m).forEach(([k, v]) => {
          if (typeof v !== 'number') return;
          if (!sumas[k]) sumas[k] = { total: 0, n: 0 };
          sumas[k].total += v;
          sumas[k].n += 1;
        });
      });
      const promedios: Record<string, number> = {};
      Object.entries(sumas).forEach(([k, { total, n }]) => {
        promedios[k] = Math.round((total / n) * 100) / 100;
      });
      setGpsResumen(promedios);

      // ---- ensamblar columnas de días ----
      const columnas: DiaColumna[] = (sesiones || []).map((s) => {
        const estado = (estados || []).find((e) => e.sesion_dia_id === s.id);
        const eventosDia = (eventos || []).filter((e) => e.sesion_dia_id === s.id);
        const eventoIdsDia = eventosDia.map((e) => e.id);
        const testsDia = (tests || [])
          .filter((t) => eventoIdsDia.includes(t.evento_jugador_id))
          .map((t) => t.tipo_test);
        const planesDia = (planes || []).filter((p) => p.sesion_dia_id === s.id);

        const comentarios: { etiqueta: string; texto: string }[] = [];
        if (estado?.comentario_lesiones) comentarios.push({ etiqueta: 'Lesión', texto: estado.comentario_lesiones });
        if (estado?.comentario_medico) comentarios.push({ etiqueta: 'Médico', texto: estado.comentario_medico });
        if (estado?.comentario_nutricion) comentarios.push({ etiqueta: 'Nutrición', texto: estado.comentario_nutricion });
        if (estado?.comentario_fisico) comentarios.push({ etiqueta: 'Físico', texto: estado.comentario_fisico });
        if (estado?.comentario_tecnico) comentarios.push({ etiqueta: 'Técnico', texto: estado.comentario_tecnico });

        return {
          fecha: s.fecha,
          sesionDiaId: s.id,
          periodo: s.periodo,
          subperiodo: s.subperiodo,
          md: s.md,
          rival: s.rival,
          disponibilidad: estado?.disponibilidad ?? null,
          objetivo: estado?.objetivo ?? null,
          eventos: eventosDia.map((e) => ({
            tipo: e.tipo_evento_codigo,
            hora: e.hora,
            lugar: e.lugar,
            duracion: e.duracion,
          })),
          comentarios,
          tests: testsDia,
          planes: planesDia.map((p) => ({ nombre: p.nombre, acciones: p.acciones, evaluacion: p.evaluacion })),
        };
      });

      setDias(columnas);
    } catch (e: any) {
      setError(e.message || 'Error cargando los datos');
    } finally {
      setCargando(false);
    }
  }, [jugadorId, desde, hasta]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const filasFijas = [
    'Fecha',
    'Periodo',
    'MD / Rival',
    'Disponibilidad',
    'Objetivo',
    'Eventos',
    'Tipo de Entrenamiento',
    'Minutos de Entrenamiento',
    'Comentarios',
    'Tests',
    'Planes',
  ];

  return (
    <div className="vision-page p-6 max-w-full">
      {/* Cabecera */}
      <div className="vision-topbar flex items-center justify-between mb-4 flex-wrap gap-4">
        <div className="vision-player-heading">
          <div className="vision-player-photo">
            {jugador?.foto_url ? (
              <img src={jugador.foto_url || undefined} alt={`Foto de ${jugador.nombre}`} />
            ) : (
              <span>{jugador?.nombre.slice(0, 2).toUpperCase() || '??'}</span>
            )}
          </div>
          <div className="vision-player-copy">
          <p className="text-sm text-slate-500 uppercase tracking-wide">Visión Individual</p>
          <h1 className="text-2xl font-bold text-blue-900">
            {jugador ? (jugador.apodo || jugador.nombre) : 'Cargando...'}
          </h1>
          {jugador && (
            <p className="text-sm text-slate-500">
              {jugador.posicion} · {jugador.equipo}
            </p>
          )}
          </div>
        </div>

        {/* Filtro de rango de fechas */}
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Leyenda de colores */}
      <div className="flex items-center gap-4 text-xs text-slate-600 mb-4">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-300 inline-block" /> Disponible
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-yellow-100 border border-yellow-300 inline-block" /> Readaptación
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300 inline-block" /> Lesión
        </span>
      </div>

      {error && <p className="text-red-600 mb-4">Error: {error}</p>}
      {cargando && <p className="text-slate-500">Cargando datos...</p>}

      {!cargando && !error && (
        <>
          {/* Rejilla: filas fijas x columnas de días */}
          <div className="overflow-x-auto border rounded-lg">
            <table className="border-collapse min-w-full">
              <tbody>
                {filasFijas.map((etiquetaFila, filaIdx) => (
                  <tr key={etiquetaFila} className={filaIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    {/* columna fija de la izquierda con el nombre de la fila */}
                    <th
                      className="sticky left-0 bg-slate-100 text-left text-xs font-semibold text-slate-600 uppercase p-2 border-b border-r whitespace-nowrap z-10"
                      style={{ minWidth: 120 }}
                    >
                      {etiquetaFila}
                    </th>

                    {dias.map((d) => (
                      <td
                        key={d.sesionDiaId}
                        className={`p-2 border-b border-r text-sm align-top ${
                          etiquetaFila === 'Disponibilidad' ? colorDisponibilidad(d.disponibilidad) : ''
                        }`}
                        style={{ minWidth: 150 }}
                      >
                        {etiquetaFila === 'Fecha' && (
                          <div className="font-semibold text-blue-900">
                            {formatFechaCorta(d.fecha).dia} {formatFechaCorta(d.fecha).fecha}
                          </div>
                        )}
                        {etiquetaFila === 'Periodo' && (
                          <span className="text-slate-600">
                            {d.periodo} {d.subperiodo ? `· ${d.subperiodo}` : ''}
                          </span>
                        )}
                        {etiquetaFila === 'MD / Rival' && (
                          <span className="text-slate-600">
                            {d.md} {d.rival ? `· ${d.rival}` : ''}
                          </span>
                        )}
                        {etiquetaFila === 'Disponibilidad' && (d.disponibilidad || '—')}
                        {etiquetaFila === 'Objetivo' && (
                          <span className="text-slate-600">{d.objetivo || '—'}</span>
                        )}
                        {etiquetaFila === 'Eventos' && (
                          <div className="flex flex-col gap-1">
                            {d.eventos.length === 0 && <span className="text-slate-300">—</span>}
                            {d.eventos.map((ev, i) => (
                              <span
                                key={i}
                                className={`inline-block px-1.5 py-0.5 rounded text-xs ${colorEvento(ev.tipo)}`}
                              >
                                {ev.tipo} {ev.hora} {ev.lugar} {ev.duracion ? `${ev.duracion}min` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        {(etiquetaFila === 'Tipo de Entrenamiento' || etiquetaFila === 'Minutos de Entrenamiento') && (() => {
                          // Agrupa los eventos del día por tipo y suma sus minutos
                          const porTipo = new Map<string, number>();
                          d.eventos.forEach((ev) => {
                            if (!ev.tipo) return;
                            porTipo.set(ev.tipo, (porTipo.get(ev.tipo) || 0) + (ev.duracion || 0));
                          });

                          if (porTipo.size === 0) return <span className="text-slate-300">—</span>;

                          if (etiquetaFila === 'Tipo de Entrenamiento') {
                            return (
                              <div className="flex flex-wrap gap-1">
                                {[...porTipo.keys()].map((tipo, i) => (
                                  <span
                                    key={i}
                                    className={`inline-block px-1.5 py-0.5 rounded text-xs ${colorEvento(tipo)}`}
                                  >
                                    {tipo}
                                  </span>
                                ))}
                              </div>
                            );
                          }

                          // Fila "Minutos de Entrenamiento": una línea por tipo,
                          // salvo los tipos de "solo presencia", que no suman minutos.
                          return (
                            <div className="flex flex-col gap-0.5 text-xs">
                              {[...porTipo.entries()].map(([tipo, minutos], i) =>
                                TIPOS_SOLO_PRESENCIA.includes(tipo.toUpperCase()) ? null : (
                                  <span key={i} className="font-semibold text-blue-900">
                                    {tipo}: {minutos} min
                                  </span>
                                )
                              )}
                            </div>
                          );
                        })()}
                        {etiquetaFila === 'Comentarios' && (
                          <div className="flex flex-col gap-1 text-xs text-slate-600">
                            {d.comentarios.length === 0 && <span className="text-slate-300">—</span>}
                            {d.comentarios.map((c, i) => (
                              <span key={i}>
                                <b>{c.etiqueta}:</b> {c.texto}
                              </span>
                            ))}
                          </div>
                        )}
                        {etiquetaFila === 'Tests' && (
                          <span className="text-slate-600">{d.tests.length ? d.tests.join(', ') : '—'}</span>
                        )}
                        {etiquetaFila === 'Planes' && (
                          <div className="flex flex-col gap-1 text-xs text-slate-600">
                            {d.planes.length === 0 && <span className="text-slate-300">—</span>}
                            {d.planes.map((p, i) => (
                              <span key={i}>
                                {p.nombre} {p.evaluacion ? `(${p.evaluacion}/5)` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bloque GPS: resumen del periodo */}
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-2">Resumen GPS del periodo</h2>
            {Object.keys(gpsResumen).length === 0 ? (
              <p className="text-sm text-slate-400">Sin datos GPS en este rango de fechas.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(gpsResumen).map(([nombre, valor]) => (
                  <div key={nombre} className="border rounded-lg p-3 bg-white">
                    <p className="text-xs text-slate-500 truncate">{nombre}</p>
                    <p className="text-lg font-bold text-blue-900">{valor}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bloque Lesiones */}
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-2">Lesiones en el periodo</h2>
            {lesiones.length === 0 ? (
              <p className="text-sm text-slate-400">Sin lesiones registradas en este rango.</p>
            ) : (
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-2">Inicio</th>
                    <th className="p-2">Alta</th>
                    <th className="p-2">Tipo</th>
                    <th className="p-2">Zona</th>
                    <th className="p-2">Gravedad</th>
                  </tr>
                </thead>
                <tbody>
                  {lesiones.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2">{l.fecha_inicio}</td>
                      <td className="p-2">{l.fecha_alta || 'en curso'}</td>
                      <td className="p-2">{l.tipo}</td>
                      <td className="p-2">{l.zona}</td>
                      <td className="p-2 text-red-700 font-medium">{l.gravedad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
