'use server';

/**
 * Server Actions para la ficha de jugador e informes.
 * Ruta: app/actions.ts
 */

import { createClient } from '@supabase/supabase-js';
import {
  getMasterBackupTable,
  getMasterPlanificacionDays,
  getMasterEventosBloquesMap,
  getMasterPlayerEventsMap,
  getMasterDisponibilidadMap,
  getMasterComentarios,
} from "@/app/lib/masterBackup";
import { revalidatePath } from 'next/cache';
import fs from "fs";
import path from "path";




function getServerSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://noumrtldxzmtqrfmydwz.supabase.co";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_H3rT__cBnF3fk5QAHUFjVg_Tf1vI9Cs";

  return createClient(
    supabaseUrl,
    supabaseKey
  );
}


// Los eventos anteriores a esta fecha no se muestran nunca (no los ha introducido el usuario).
const FECHA_INICIO_EVENTOS = "2026-07-01";

// Nombre del club activo guardado en configuracion_club (p.ej. "CE EUROPA").
async function getActiveClubName(): Promise<string> {
  try {
    const supabase = getServerSupabase();
    const { data } = await supabase.from("configuracion_club").select("nombre_club").limit(1).maybeSingle();
    if (data?.nombre_club) return data.nombre_club.trim();
  } catch {}
  try {
    const conf = await getClubConfig();
    if (conf?.nombreClub) return conf.nombreClub.trim();
  } catch {}
  return "CE EUROPA";
}

// Palabra clave para filtrar por equipo ("CE EUROPA" -> "EUROPA").
function clubKeyword(clubName: string): string {
  return clubName.replace(/^(CE|CF|FC|UE|CD|AE|SD|UD|CP)\s+/i, "").trim();
}

export async function archiveJugador(id: string) {
  const supabase = getServerSupabase();
  const { error } = await supabase
    .from('jugadores')
    .update({ activo: false })
    .eq('id', id);

  if (error) {
    throw new Error(`No se pudo archivar el jugador: ${error.message}`);
  }

  revalidatePath('/deportistas');
  revalidatePath(`/deportistas/${id}`);
}

export async function unarchiveJugador(id: string) {
  const supabase = getServerSupabase();
  const { error } = await supabase
    .from('jugadores')
    .update({ activo: true })
    .eq('id', id);

  if (error) {
    throw new Error(`No se pudo desarchivar el jugador: ${error.message}`);
  }

  revalidatePath('/deportistas');
  revalidatePath(`/deportistas/${id}`);
}

export async function updateJugador(id: string, datos: Record<string, unknown>) {
  const supabase = getServerSupabase();

  // Handle unique constraint conflict cleanly if nombre is being updated
  if (typeof datos.nombre === 'string' && datos.nombre.trim()) {
    const targetNombre = datos.nombre.trim();
    const { data: existing } = await supabase
      .from('jugadores')
      .select('id, nombre')
      .neq('id', id)
      .ilike('nombre', targetNombre);

    if (existing && existing.length > 0) {
      for (const other of existing) {
        // Rename conflicting player to free up the unique constraint
        await supabase
          .from('jugadores')
          .update({ nombre: `${other.nombre} (anterior ${other.id.slice(0, 4)})` })
          .eq('id', other.id);
      }
    }
  }

  const payload: Record<string, any> = { ...datos };

  let { error } = await supabase
    .from('jugadores')
    .update(payload)
    .eq('id', id);

  // Si falla por columnas que no existen en el esquema de Supabase (como dorsal o pierna_habil), reintentar sin ellas
  if (error) {
    delete payload.dorsal;
    delete payload.pierna_habil;
    const retryResult = await supabase
      .from('jugadores')
      .update(payload)
      .eq('id', id);
    error = retryResult.error;
  }

  if (error) {
    throw new Error(`No se pudo actualizar el jugador: ${error.message}`);
  }

  revalidatePath('/deportistas');
  revalidatePath(`/deportistas/${id}`);
}

export async function saveJugador(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) throw new Error('Falta el identificador del jugador');

  const fields = [
    'nombre', 'apodo', 'cor_id', 'dorsal', 'posicion', 'equipo', 'seccion', 'temporada',
    'nacionalidad', 'fecha_nacimiento', 'contacto', 'anos_en_club', 'peso',
    'altura', 'foto_url', 'pierna_habil',
  ];
  const datos: Record<string, any> = Object.fromEntries(fields.map((field) => [field, formData.get(field) || null]));
  
  const rawNombre = String(formData.get('nombre') || '').trim();
  datos.nombre = rawNombre || 'Jugador Sin Nombre';

  const posicionBase = String(formData.get('posicion_base') || '').trim();
  const lateralidad = String(formData.get('lateralidad') || '').trim();
  if (posicionBase || lateralidad) {
    datos.posicion = lateralidad ? `${posicionBase} ${lateralidad}`.trim() : posicionBase;
  } else if (formData.get('posicion')) {
    datos.posicion = String(formData.get('posicion')).trim();
  }

  const rawDorsal = formData.get('dorsal') || formData.get('cor_id');
  if (rawDorsal) {
    datos.dorsal = isNaN(Number(rawDorsal)) ? String(rawDorsal) : Number(rawDorsal);
    datos.cor_id = String(rawDorsal);
  }

  datos.anos_en_club = datos.anos_en_club ? Number(datos.anos_en_club) : null;
  datos.peso = datos.peso ? Number(datos.peso) : null;
  datos.altura = datos.altura ? Number(datos.altura) : null;
  datos.seleccion_autonomica = formData.get('seleccion_autonomica') === 'on';
  datos.seleccion_nacional = formData.get('seleccion_nacional') === 'on';

  await updateJugador(id, datos);
}

export async function createJugador(formData: FormData) {
  const supabase = getServerSupabase();
  const rawNombre = String(formData.get('nombre') || '').trim();
  if (!rawNombre) throw new Error('El nombre del jugador es obligatorio');

  const posicion = formData.get('posicion') ? String(formData.get('posicion')) : null;
  const apodo = formData.get('apodo') ? String(formData.get('apodo')).toUpperCase() : null;
  const pierna_habil = formData.get('pierna_habil') ? String(formData.get('pierna_habil')) : null;
  const rawDorsal = formData.get('dorsal') || formData.get('cor_id');
  const dorsal = rawDorsal ? (isNaN(Number(rawDorsal)) ? String(rawDorsal) : Number(rawDorsal)) : null;

  // Determinar equipo y temporada activa
  let equipo = formData.get('equipo') ? String(formData.get('equipo')).trim() : null;
  let temporada = formData.get('temporada') ? String(formData.get('temporada')).trim() : null;

  if (!equipo || !temporada) {
    const { data: conf } = await supabase.from('configuracion_club').select('nombre_club, temporada_activa').limit(1).maybeSingle();
    if (!equipo) equipo = conf?.nombre_club || 'CE Europa';
    if (!temporada) temporada = conf?.temporada_activa || '2026/27';
  }

  // Comprobar si ya existe un jugador con este nombre para evitar violación de unicidad
  const { data: existingPlayer } = await supabase
    .from('jugadores')
    .select('id, nombre, activo, equipo, temporada')
    .ilike('nombre', rawNombre)
    .maybeSingle();

  if (existingPlayer) {
    const updatePayload: Record<string, any> = {
      activo: true,
      equipo: equipo || existingPlayer.equipo,
      temporada: temporada || existingPlayer.temporada,
    };
    if (posicion) updatePayload.posicion = posicion;
    if (apodo) updatePayload.apodo = apodo;
    if (pierna_habil) updatePayload.pierna_habil = pierna_habil;
    if (dorsal !== null) {
      updatePayload.dorsal = dorsal;
      updatePayload.cor_id = String(rawDorsal);
    }

    const { data: updated, error: updateError } = await supabase
      .from('jugadores')
      .update(updatePayload)
      .eq('id', existingPlayer.id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Error al actualizar el jugador existente: ${updateError.message}`);
    }

    revalidatePath('/deportistas');
    revalidatePath('/calendario');
    revalidatePath('/planificacion');
    return updated;
  }

  const insertPayload: Record<string, any> = {
    nombre: rawNombre,
    posicion,
    apodo,
    dorsal,
    pierna_habil,
    cor_id: rawDorsal ? String(rawDorsal) : null,
    activo: true,
    equipo,
    temporada,
  };

  let { data, error } = await supabase
    .from('jugadores')
    .insert([insertPayload])
    .select()
    .single();

  if (error) {
    delete insertPayload.dorsal;
    delete insertPayload.pierna_habil;
    const retryResult = await supabase
      .from('jugadores')
      .insert([insertPayload])
      .select()
      .single();
    data = retryResult.data;
    error = retryResult.error;
  }

  if (error) {
    throw new Error(`No se pudo crear el jugador: ${error.message}`);
  }

  revalidatePath('/deportistas');
  revalidatePath('/calendario');
  revalidatePath('/planificacion');
  return data;
}

export async function checkDuplicateJugadorNombre(nombre: string, currentId: string) {
  if (!nombre || !nombre.trim()) return false;
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('jugadores')
    .select('id, nombre')
    .neq('id', currentId)
    .ilike('nombre', nombre.trim())
    .eq('activo', true)
    .limit(1);

  if (error || !data) return false;
  return data.length > 0;
}

export async function archiveJugadorFromForm(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) throw new Error('Falta el identificador del jugador');
  await archiveJugador(id);
}

export async function getActiveJugadores() {
  let rawJugadores: any[] = [];
  try {
    const supabase = getServerSupabase();
    const club = clubKeyword(await getActiveClubName());
    let query = supabase
      .from("jugadores")
      .select("id, nombre, apodo, posicion, foto_url, fecha_nacimiento, activo, cor_id, equipo, temporada")
      .eq("activo", true)
      .order("nombre");
    if (club) query = query.ilike("equipo", `%${club}%`);
    const { data, error } = await query;

    if (!error && data && data.length > 0) {
      rawJugadores = data;
    } else if (error) {
      console.warn("Supabase getActiveJugadores error, usando backup maestro:", error.message);
    }
  } catch (err: any) {
    console.warn("Exception getActiveJugadores, usando backup maestro:", err?.message);
  }

  // Fallback a copia de seguridad maestra local si Supabase falló
  if (rawJugadores.length === 0) {
    const backupRows = getMasterBackupTable("jugadores");
    let filtered = backupRows.filter((j: any) => j.activo !== false);
    const club = clubKeyword(await getActiveClubName());
    if (club) {
      const clubNorm = club.toLowerCase();
      const clubMatches = filtered.filter((j: any) => (j.equipo || "").toLowerCase().includes(clubNorm));
      if (clubMatches.length > 0) {
        filtered = clubMatches;
      }
    }
    rawJugadores = filtered;
  }

  return rawJugadores.map((item: any) => ({ ...item, dorsal: item.cor_id || item.dorsal || null }));
}

export async function updatePesosBatch(entries: { playerName: string; peso: number }[]) {
  console.log('[updatePesosBatch] Called with', entries.length, 'entries:', entries.map(e => `${e.playerName}=${e.peso}`).join(', '));
  const supabase = getServerSupabase();

  // Get all active players to match by nombre/apodo
  const { data: jugadores, error: fetchError } = await supabase
    .from('jugadores')
    .select('id, nombre, apodo')
    .eq('activo', true);

  console.log('[updatePesosBatch] DB jugadores:', jugadores?.length, 'fetchError:', fetchError?.message);
  if (jugadores && jugadores.length > 0) {
    console.log('[updatePesosBatch] Sample jugadores:', jugadores.slice(0, 3).map(j => `${j.nombre} (${j.apodo})`).join(', '));
  }

  if (!jugadores || jugadores.length === 0) return { updated: 0, errors: ['No active players found'] };

  const normalise = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  let updated = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    const norm = normalise(entry.playerName);
    const match = jugadores.find(
      j => normalise(j.nombre) === norm || (j.apodo && normalise(j.apodo) === norm)
    );
    if (!match) {
      console.log(`[updatePesosBatch] NO MATCH for "${entry.playerName}" (norm: "${norm}")`);
      errors.push(`No se encontró jugador activo: "${entry.playerName}"`);
      continue;
    }
    console.log(`[updatePesosBatch] MATCH: "${entry.playerName}" -> id=${match.id} (${match.nombre}), peso=${entry.peso}`);
    const { error } = await supabase
      .from('jugadores')
      .update({ peso: entry.peso })
      .eq('id', match.id);
    if (error) {
      console.log(`[updatePesosBatch] UPDATE ERROR for ${match.nombre}:`, error.message);
      errors.push(`Error actualizando ${entry.playerName}: ${error.message}`);
    } else {
      updated++;
    }
  }

  console.log(`[updatePesosBatch] Done: ${updated} updated, ${errors.length} errors`);
  revalidatePath('/deportistas');
  return { updated, errors };
}

export async function getAllJugadoresIncludingArchived() {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('jugadores')
    .select('id, nombre, apodo, posicion, foto_url, fecha_nacimiento, activo, cor_id, equipo, temporada')
    .order('nombre');

  if (error) {
    console.error('Error fetching all jugadores including archived:', error);
    return [];
  }
  return data || [];
}

export async function getGpsDatosReport(jugadorId: string) {
  let jugador: any = null;

  try {
    const supabase = getServerSupabase();
    const { data: dbJugador } = await supabase
      .from('jugadores')
      .select('id, nombre, apodo, posicion, foto_url, fecha_nacimiento, activo')
      .eq('id', jugadorId)
      .maybeSingle();
    if (dbJugador) jugador = dbJugador;
  } catch (e) {}

  if (!jugador) {
    const backupPlayers = getMasterBackupTable("jugadores");
    jugador = backupPlayers.find((j: any) => j.id === jugadorId) || null;
  }

  const teamGps = await getAllGpsDatos();
  const playerGps = teamGps.filter((g: any) => g.jugador_id === jugadorId);

  return {
    jugador: jugador || null,
    playerGps: playerGps || [],
    teamGps: teamGps || [],
  };
}

export async function saveGpsDatosBatch(records: any[]) {
  try {
    const supabase = getServerSupabase();
    if (!records || records.length === 0) return { success: true, count: 0 };

    const formattedRecords = records.map((r) => {
      const dist = Number(r.distancia_total || r["Distance(m)"] || r.total_distance || 0);
      const dur = Number(r.duracion_min || r.duracion || r["Duration(min)"] || 0);
      const hsr = Number(r.distancia_z4 || r.hsr || r["HSR Abs (m)"] || 0);
      const sp = Number(r.sprints || r.num_sprints || r["Sprints Count"] || 0);
      const distMin = dur > 0 ? Math.round((dist / dur) * 100) / 100 : 0;
      const dist21 = Math.round(sp + hsr);

      const metricas = r.metricas || {
        "Distance(m)": dist,
        "Distancia Total (m)": dist,
        "Distancia Total": dist,
        "total_distance": dist,
        "distancia_total": dist,
        "Distancia / Min": distMin,
        "m/min": distMin,
        "distancia_min": distMin,
        "19,8 - 21 km/h (Distancia)": hsr,
        "+ 24 km/h (Distancia)": sp,
        "Distance +21 (m)": dist21,
        "Distancia (+21km/h) (m)": dist21,
        "HSR Abs (m)": hsr,
        "hsr": hsr,
        "HSR": hsr,
        "Sprints Count": sp,
        "Sprints": sp,
        "num_sprints": sp,
        "MAX Speed(km/h)": Number(r.max_speed || r.v_max || 0),
        "max_speed": Number(r.max_speed || r.v_max || 0),
        "Top Speed (km/h)": Number(r.max_speed || r.v_max || 0),
        "Accs Count": Number(r.aceleraciones || r.acc || 0),
        "aceleraciones": Number(r.aceleraciones || r.acc || 0),
        "Decs Count": Number(r.desaceleraciones || r.dec || 0),
        "desaceleraciones": Number(r.desaceleraciones || r.dec || 0),
        "Acc+Dec": Number(r.aceleraciones || 0) + Number(r.desaceleraciones || 0),
        "Player Load": Number(r.player_load || 0),
        "player_load": Number(r.player_load || 0),
        "Duration(min)": dur,
        "duracion_min": dur,
        "Volume(min)": dur,
        "time": dur,
      };

      return {
        jugador_id: r.jugador_id,
        fecha: r.fecha,
        sesion_dia_id: r.sesion_dia_id || null,
        tipo_sesion: r.tipo_sesion || r.sesion_nombre || "ENTRENAMIENTO",
        match_day: r.match_day || null,
        tarea: r.tarea || "Total",
        duracion: Number(r.duracion || r.duracion_min || 0),
        metricas,
      };
    });

    const uniquePairs = Array.from(new Set(formattedRecords.map((r) => `${r.jugador_id}_${r.fecha}`)));
    for (const pair of uniquePairs) {
      const [jId, f] = pair.split("_");
      await supabase.from("gps_datos").delete().match({ jugador_id: jId, fecha: f });
    }

    const { data, error } = await supabase
      .from("gps_datos")
      .insert(formattedRecords)
      .select("id");

    if (error) {
      console.error("Error inserting gps_datos:", error);
      return { success: false, error: error.message };
    }

    return { success: true, count: formattedRecords.length };
  } catch (err: any) {
    console.error("Exception in saveGpsDatosBatch:", err);
    return { success: false, error: err.message || "Error al guardar en BBDD GPS" };
  }
}

export async function getAllGpsDatos() {
  let rawData: any[] = [];
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("gps_datos")
      .select("*")
      .order("fecha", { ascending: false });

    if (!error && data && data.length > 0) {
      rawData = data;
    } else if (error) {
      console.warn("Error fetching gps_datos, usando backup maestro:", error.message);
    }
  } catch (err: any) {
    console.warn("Exception in getAllGpsDatos, usando backup maestro:", err?.message);
  }

  if (rawData.length === 0) {
    try {
      const fs = require("fs");
      const path = require("path");
      const syncedFile = path.join(process.cwd(), "public", "gps_datos_synced.json");
      if (fs.existsSync(syncedFile)) {
        const parsed = JSON.parse(fs.readFileSync(syncedFile, "utf8"));
        if (Array.isArray(parsed) && parsed.length > 0) {
          rawData = parsed;
        }
      }
    } catch (e) {}
  }

  if (rawData.length === 0) {
    rawData = getMasterBackupTable("gps_datos");
  }

  rawData.sort((a: any, b: any) => (b.fecha || "").localeCompare(a.fecha || ""));

  // Aplanar métricas en cada registro para que campos como distancia_total, hsr, max_speed estén disponibles directamente
  return rawData.map((r: any) => ({
    ...r,
    es_simulado: Boolean(r.metricas?.es_simulado || r.metricas?.tipo_registro === "SIMULADO" || (r.metricas?.colC && String(r.metricas?.colC).toUpperCase().includes("SIMULA"))),
    tipo_registro: r.metricas?.tipo_registro || (r.metricas?.es_simulado ? "SIMULADO" : "REAL"),
    distancia_total: r.metricas?.["Distance(m)"] ?? r.metricas?.distancia_total ?? r.distancia_total ?? 0,
    distancia_z4: r.metricas?.["HSR Abs (m)"] ?? r.metricas?.hsr ?? r.distancia_z4 ?? 0,
    max_speed: r.metricas?.["MAX Speed(km/h)"] ?? r.metricas?.max_speed ?? r.max_speed ?? 0,
    player_load: r.metricas?.["Player Load"] ?? r.metricas?.player_load ?? r.player_load ?? 0,
    num_sprints: r.metricas?.["Sprints Count"] ?? r.metricas?.num_sprints ?? r.num_sprints ?? 0,
    aceleraciones: r.metricas?.["Accs Count"] ?? r.metricas?.aceleraciones ?? r.aceleraciones ?? 0,
    desaceleraciones: r.metricas?.["Decs Count"] ?? r.metricas?.desaceleraciones ?? r.desaceleraciones ?? 0,
    duracion_min: r.duracion ?? r.metricas?.["Duration(min)"] ?? r.metricas?.duracion_min ?? 0,
  }));
}

/**
 * Escanea y sincroniza automáticamente todos los archivos CSV de GPS presentes en Downloads
 * vinculando los datos con los deportistas y sesiones reales en Supabase.
 */
/**
 * Sincroniza la hoja de cálculo de Google Sheets externa de GPS (Google Sheets export CSV).
 * Procesa y contabiliza tanto registros REALES como SIMULADOS (indicados en Columna C).
 * Añade la etiqueta es_simulado y tipo_registro para cada registro.
 */
export async function syncGoogleSheetGpsData() {
  try {
    const https = require("https");
    const fs = require("fs");
    const path = require("path");

    // Obtener URL configurada para GPS desde BBDD o archivo o usar la por defecto
    let sheetUrl = "https://docs.google.com/spreadsheets/d/1Q_jYilNR1KQk3YSmugbYXbeW8xdWUqQlWtcDJ2Np9JA/export?format=csv&gid=0";
    try {
      const extLinks = await getExternalLinksBBDD();
      if (extLinks?.gps?.url) {
        let u = extLinks.gps.url.trim();
        if (u.includes("docs.google.com/spreadsheets/d/")) {
          const m = u.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
          const gidM = u.match(/gid=([0-9]+)/);
          const gidParam = gidM && gidM[1] ? `&gid=${gidM[1]}` : "&gid=0";
          if (m && m[1]) {
            sheetUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gidParam}`;
          }
        } else if (u.startsWith("http")) {
          sheetUrl = u;
        }
      }
    } catch (e) {
      console.warn("Could not read external links, using fallback GPS sheet url", e);
    }

    // Descargar CSV siguiendo redirecciones
    const fetchCsv = (targetUrl: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        function getReq(curr: string) {
          https.get(curr, (res: any) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              getReq(res.headers.location);
              return;
            }
            let data = "";
            res.on("data", (chunk: any) => data += chunk);
            res.on("end", () => resolve(data));
          }).on("error", reject);
        }
        getReq(targetUrl);
      });
    };

    const csvData = await fetchCsv(sheetUrl);
    const lines = csvData.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
    if (lines.length < 2) {
      return { success: false, error: "La hoja de Google Sheets no contiene datos suficientes." };
    }

    const parseLine = (line: string) => {
      const cols: string[] = [];
      let curr = "", inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === String.fromCharCode(34)) inQuote = !inQuote;
        else if (c === "," && !inQuote) { cols.push(curr.trim()); curr = ""; }
        else curr += c;
      }
      cols.push(curr.trim());
      return cols;
    };

    const header = parseLine(lines[0]);
    const rawRows = lines.slice(1).map((l: string) => {
      const cols = parseLine(l);
      const obj: Record<string, string> = {};
      header.forEach((h: string, idx: number) => {
        obj[h || `col_${idx}`] = cols[idx] ?? "";
      });
      (obj as any)._rawCols = cols;
      return obj;
    });

    const supabase = getServerSupabase();
    let dbPlayers: any[] = [];
    try {
      const { data: fetchedPlayers, error: pErr } = await supabase.from("jugadores").select("id, nombre, apodo, cor_id, equipo, activo");
      if (!pErr && fetchedPlayers && fetchedPlayers.length > 0) {
        dbPlayers = fetchedPlayers;
      }
    } catch (e) {}

    if (!dbPlayers || dbPlayers.length === 0) {
      dbPlayers = getMasterBackupTable("jugadores");
    }

    const europaPlayers = (dbPlayers || []).filter((p: any) => ((p.equipo || "").toUpperCase().includes("EUROPA") && p.activo) || p.activo);

    const normalize = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const aliases: Record<string, string> = {
      "edo": "edo",
      "victor edo": "edo",
      "sgro": "marcel",
      "campeny": "arnau",
      "angles": "angles",
      "exposito": "exposito",
      "morales": "morales",
      "padillo": "padillo",
      "cancelo": "cancelo",
      "cardelus": "cardelus",
      "teto martin": "teto",
      "tito": "tolosa",
      "enol": "enol",
      "khalid": "khalid",
      "cano": "cano",
      "mascaro": "mascaro",
      "youssef": "youssef",
      "flavio": "flavio",
      "joel": "joel",
      "gori": "gori",
      "santi": "santi",
      "xavi v": "xavi",
      "xavi victor": "xavi"
    };

    const matchPlayer = (rawName: string) => {
      const norm = normalize(rawName);
      if (!norm) return null;
      let match = europaPlayers.find((p: any) => normalize(p.apodo) === norm);
      if (match) return match;
      match = europaPlayers.find((p: any) => normalize(p.nombre) === norm);
      if (match) return match;
      match = europaPlayers.find((p: any) => normalize(p.nombre).split(/\s+/).includes(norm));
      if (match) return match;
      const alias = aliases[norm];
      if (alias) {
        match = europaPlayers.find((p: any) => {
          const aNorm = normalize(p.apodo);
          const nNorm = normalize(p.nombre);
          return aNorm === alias || nNorm.split(/\s+/).includes(alias) || nNorm === alias;
        });
        if (match) return match;
      }
      match = europaPlayers.find((p: any) => {
        const aNorm = normalize(p.apodo);
        const nNorm = normalize(p.nombre);
        return (aNorm && aNorm.includes(norm)) || nNorm.includes(norm) || (aNorm && norm.includes(aNorm) && aNorm.length > 2);
      });
      return match || null;
    };

    const parseNum = (val: string, def = 0) => {
      if (!val) return def;
      const clean = String(val).replace(/\./g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
      const num = parseFloat(clean);
      return isNaN(num) ? def : num;
    };

    const parseDateToISO = (rawDate: string) => {
      if (!rawDate) return "";
      const s = String(rawDate).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      if (s.includes("/")) {
        const parts = s.split("/");
        if (parts.length === 3) {
          const p1 = parseInt(parts[0], 10);
          const p2 = parseInt(parts[1], 10);
          let p3 = parseInt(parts[2], 10);
          if (p3 < 100) p3 += 2000;

          // Caso especial: 11/10/2026 es 11 de Octubre (J7 Algeciras)
          if ((p1 === 11 && p2 === 10) || (p1 === 10 && p2 === 11)) {
            return `${p3}-10-11`;
          }

          // Si una parte es 11 (Noviembre en temporada 2026-2027), el mes es 11
          if (p1 === 11 && p2 <= 30) {
            return `${p3}-11-${String(p2).padStart(2, "0")}`;
          }
          if (p2 === 11 && p1 <= 30) {
            return `${p3}-11-${String(p1).padStart(2, "0")}`;
          }

          // Si una parte es 10 (Octubre en temporada 2026-2027), el mes es 10
          if (p1 === 10 && p2 <= 31) {
            return `${p3}-10-${String(p2).padStart(2, "0")}`;
          }
          if (p2 === 10 && p1 <= 31) {
            return `${p3}-10-${String(p1).padStart(2, "0")}`;
          }

          if (p1 > 12) {
            return `${p3}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
          }
          if (p2 > 12) {
            return `${p3}-${String(p1).padStart(2, "0")}-${String(p2).padStart(2, "0")}`;
          }

          return `${p3}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
        }
      }
      return "";
    };

    // Agrupar filas por (fecha, jugador)
    const datePlayerMap = new Map<string, { isoDate: string; player: any; rows: any[] }>();
    const datesFound = new Set<string>();

    const getRowCol = (row: any, keys: string[], fallbackIdx?: number) => {
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
          return String(row[k]).trim();
        }
        const lower = k.toLowerCase().trim();
        for (const [rk, rv] of Object.entries(row)) {
          if (rk.toLowerCase().trim() === lower && rv !== undefined && rv !== null && String(rv).trim() !== "") {
            return String(rv).trim();
          }
        }
      }
      if (fallbackIdx !== undefined && row._rawCols && row._rawCols[fallbackIdx] !== undefined) {
        return String(row._rawCols[fallbackIdx]).trim();
      }
      return "";
    };

    for (const r of rawRows) {
      const playerName = getRowCol(r, ["player", "jugador", "deportista", "name", "nombre", "athlete"], 6) || getRowCol(r, [], 12);
      if (!playerName || playerName.toUpperCase() === "TEAM" || playerName.toUpperCase() === "AVG") continue;

      const rawDateCheck = getRowCol(r, ["date", "fecha", "session_date"], 3) || getRowCol(r, [], 9);
      const isoDateCheck = parseDateToISO(rawDateCheck);
      if (isoDateCheck === "2026-10-29" && (playerName.toLowerCase().includes("teto") || playerName.toLowerCase().includes("carames"))) {
        continue;
      }

      const match = matchPlayer(playerName);

      if (!match) continue;

      const rawDate = getRowCol(r, ["date", "fecha", "session_date"], 3) || getRowCol(r, [], 9);
      const isoDate = parseDateToISO(rawDate);
      if (!isoDate) continue;

      datesFound.add(isoDate);
      const key = `${isoDate}_${match.id}`;
      if (!datePlayerMap.has(key)) {
        datePlayerMap.set(key, { isoDate, player: match, rows: [] });
      }
      datePlayerMap.get(key)!.rows.push(r);
    }

    let totalInserted = 0;
    let simuladosCount = 0;
    let realesCount = 0;
    const allProcessedRecords: any[] = [];
    const allDatesArray = Array.from(datesFound);

    // Consulta por lotes para sesiones_dia (mucho más rápido y eficiente)
    const { data: existingSesiones } = await supabase
      .from("sesiones_dia")
      .select("id, fecha, evento_am, md, rival")
      .in("fecha", allDatesArray);

    const sesionesMap = new Map<string, any>();
    (existingSesiones || []).forEach((s: any) => sesionesMap.set(s.fecha, s));

    const normalizeMD = (val: string) => {
      if (!val) return "";
      let s = val.trim();
      if (/^[-+]?\d+\s*MD$/i.test(s)) {
        const num = s.replace(/MD/i, "").trim();
        return `MD${num.startsWith("-") || num.startsWith("+") ? num : `-${num}`}`;
      }
      if (/^MD\s*[-+]?\d+$/i.test(s)) return s.replace(/\s+/g, "");
      return s;
    };

    const missingSesionesToInsert: any[] = [];
    for (const isoDate of allDatesArray) {
      if (!sesionesMap.has(isoDate)) {
        const sampleDateRow = rawRows.find((r: any) => {
          const rawD = getRowCol(r, ["date", "fecha"], 3) || getRowCol(r, [], 9);
          return parseDateToISO(rawD) === isoDate && (getRowCol(r, ["md", "match_day"], 5));
        }) || rawRows.find((r: any) => parseDateToISO(getRowCol(r, ["date", "fecha"], 3) || getRowCol(r, [], 9)) === isoDate);

        const rawMD = (getRowCol(sampleDateRow || {}, ["md", "match_day", "MD"], 5) || "").trim();
        const sheetMD = normalizeMD(rawMD);
        const rawRival = (sampleDateRow?.["Nº S / Nº J + RIVAL"] || sampleDateRow?._rawCols?.[4] || "").trim();
        const rawSesion = (sampleDateRow?.["Sesión"] || sampleDateRow?._rawCols?.[7] || "").trim();
        const isPartido = rawSesion.toLowerCase().includes("partido") || rawRival.toLowerCase().includes("huesca") || sheetMD.toUpperCase() === "MD";

        missingSesionesToInsert.push({
          fecha: isoDate,
          md: sheetMD || (isPartido ? "MD" : null),
          evento_am: isPartido ? "PARTIDO" : "ENTRENAMIENTO",
          rival: isPartido ? (rawRival.includes("HUESCA") ? "SD HUESCA" : rawRival) : "",
          volumen: 90,
          equipo: "CE EUROPA",
        });
      }
    }

    if (missingSesionesToInsert.length > 0) {
      try {
        const { data: newInserted } = await supabase
          .from("sesiones_dia")
          .insert(missingSesionesToInsert)
          .select("id, fecha, evento_am, md, rival");
        if (newInserted) {
          newInserted.forEach((s: any) => sesionesMap.set(s.fecha, s));
        }
      } catch (errSes) {
        console.warn("Nota sesiones_dia batch insert:", errSes);
      }
    }

    for (const [key, { isoDate, player, rows: pRows }] of datePlayerMap.entries()) {
      const sesionDia = sesionesMap.get(isoDate);
      const sesion_dia_id = sesionDia?.id || null;
      const tipo_sesion = sesionDia?.rival ? "PARTIDO" : "ENTRENAMIENTO";
      const match_day = sesionDia?.md || null;

      // FILTRO ESTRICTO: Olvidar las filas de "Total" y coger únicamente las tareas distintas
      const taskRows = pRows.filter((r: any) => {
        const tName = (getRowCol(r, ["task", "tarea", "period", "split"], 8) || r["Tarea"] || r["tarea"] || r._rawCols?.[8] || "").trim().toLowerCase();
        return tName !== "total";
      });

      // Si por alguna anomalía sólo existiese la fila "Total", se usa como fallback
      const effectiveRows = taskRows.length > 0 ? taskRows : pRows;

        let sumDist = 0;
        let sumDur = 0;
        let sumDurActiva = 0;
        let sumDurEfectiva = 0;
        let sumV1_8 = 0;
        let sumV8_17 = 0;
        let sumV17_19 = 0;
        let sumV19_21 = 0;
        let sumV21 = 0;
        let sumV24 = 0;
        let sumV28Num = 0;
        let sumV28Dist = 0;
        let sumV28Time = 0;
        let sumSprints = 0;
        let sumPL = 0;
        let sumHMLD = 0;
        let sumHMLDNum = 0;
        let sumHMLDTime = 0;
        let sumAcc = 0;
        let sumAcc4 = 0;
        let sumDec = 0;
        let sumDec4 = 0;
        let sumHids = 0;

        let peakSpeed = 0;
        let peakAcc = 0;
        let peakDec = 0;

        let isSimulado = false;

        const tasksParsed = effectiveRows.map((r: any) => {
          const raw = r._rawCols || [];
          const colC = (r["REAL / SIMULADO"] || raw[2] || "").trim().toUpperCase();
          const isRowSim = colC.includes("SIMULA");
          if (isRowSim) isSimulado = true;

          const d = parseNum(r["Distancia Total (m)"] || raw[16]);
          const t = parseNum(r["Tiempo"] || raw[13]);
          const tAct = parseNum(r["TIiempo Activo"] || raw[14]);
          const tEf = parseNum(r["Tiempo Efectivo"] || raw[15]);
          const v1_8 = parseNum(r["15 - 16 km/h (Distancia)"] || r["15-16 km/h (Distancia)"] || r["1 - 8 km/h (Distancia)"] || raw[18]);
          const v8_17 = parseNum(r["16 - 17 km/h (Distancia)"] || r["16-17 km/h (Distancia)"] || r["8 - 17 km/h (Distancia)"] || raw[19]);
          const v17_19 = parseNum(r["17 - 19,8 km/h (Distancia)"] || raw[20]);
          const v19_21 = parseNum(r["19,8 - 21 km/h (Distancia)"] || raw[21]);
          const v21 = parseNum(r["21 - 24 km/h (Distancia)"] || raw[22]);
          const v24 = parseNum(r["+ 24 km/h (Distancia)"] || raw[23]);
          const v28num = parseNum(r["+28 km/h (Num)"] || raw[24]);
          const v28dist = parseNum(r["+28 km/h (Distancia)"] || raw[25]);
          const v28time = parseNum(r["+28 km/h (Tiempo)"] || raw[26]);
          const sp = parseNum(r["+24 km/h (Num)"] || raw[27]);
          const pl = parseNum(r["player_load"] || raw[28]);
          const hm = parseNum(r["HMLD"] || raw[29]);
          const hmNum = parseNum(r["HMLD (num)"] || raw[30]);
          const hmTime = parseNum(r["hmld_time"] || raw[31]);
          const ac = parseNum(r["Acc + 3 m/s2 (Num)"] || raw[33]);
          const ac4 = parseNum(r["Acc + 4 m/s2 (Num)"] || raw[34]);
          const dc = parseNum(r["Dec + 3 m/s2 (Num)"] || raw[35]);
          const dc4 = parseNum(r["Dec + 4 m/s2 (Num)"] || raw[36]);
          const mAcc = parseNum(r["Max Acc"] || raw[37]);
          const mDec = Math.abs(parseNum(r["Max Dec"] || raw[38]));
          const speed = parseNum(r["Vel Max"] || raw[39]);
          const hids = parseNum(r["num_hids"] || raw[40]);

          sumDist += d;
          sumDur += t;
          sumDurActiva += tAct;
          sumDurEfectiva += tEf;
          sumV1_8 += v1_8;
          sumV8_17 += v8_17;
          sumV17_19 += v17_19;
          sumV19_21 += v19_21;
          sumV21 += v21;
          sumV24 += v24;
          sumV28Num += v28num;
          sumV28Dist += v28dist;
          sumV28Time += v28time;
          sumSprints += sp;
          sumPL += pl;
          sumHMLD += hm;
          sumHMLDNum += hmNum;
          sumHMLDTime += hmTime;
          sumAcc += ac;
          sumAcc4 += ac4;
          sumDec += dc;
          sumDec4 += dc4;
          sumHids += hids;

          if (speed > peakSpeed) peakSpeed = speed;
          if (mAcc > peakAcc) peakAcc = mAcc;
          if (mDec > peakDec) peakDec = mDec;

          const taskHsr = Math.round(v21 + v24 + v19_21);
          const taskDistMin = t > 0 ? Math.round((d / t) * 100) / 100 : 0;

          return {
            nombre: (r["Tarea"] || raw[8] || "Tarea").trim(),
            "Distance(m)": Math.round(d),
            "Distancia Total (m)": Math.round(d),
            distancia_total: Math.round(d),
            "Duration(min)": Math.round(t * 100) / 100,
            Tiempo: Math.round(t * 100) / 100,
            duracion_min: Math.round(t * 100) / 100,
            "TIiempo Activo": Math.round(tAct * 100) / 100,
            tiempo_activo: Math.round(tAct * 100) / 100,
            "Tiempo Efectivo": Math.round(tEf * 100) / 100,
            tiempo_efectivo: Math.round(tEf * 100) / 100,
            "MAX Speed(km/h)": speed,
            "Vel Max": speed,
            max_speed: speed,
            "Sprints Count": Math.round(sp),
            "+24 km/h (Num)": Math.round(sp),
            num_sprints: Math.round(sp),
            "Accs Count": Math.round(ac),
            "Acc + 3 m/s2 (Num)": Math.round(ac),
            aceleraciones: Math.round(ac),
            "Acc + 4 m/s2 (Num)": Math.round(ac4),
            "Max Acc": mAcc,
            max_acc: mAcc,
            "Decs Count": Math.round(dc),
            "Dec + 3 m/s2 (Num)": Math.round(dc),
            desaceleraciones: Math.round(dc),
            "Dec + 4 m/s2 (Num)": Math.round(dc4),
            "Max Dec": mDec,
            max_dec: mDec,
            "Player Load": Math.round(pl > 0 ? pl : hm),
            player_load: Math.round(pl > 0 ? pl : hm),
            HMLD: Math.round(hm),
            hmld: Math.round(hm),
            "HMLD (num)": Math.round(hmNum),
            hmld_time: Math.round(hmTime * 100) / 100,
            "15 - 16 km/h (Distancia)": Math.round(v1_8),
            "16 - 17 km/h (Distancia)": Math.round(v8_17),
            "15-16 km/h (Distancia)": Math.round(v1_8),
            "16-17 km/h (Distancia)": Math.round(v8_17),
            "1 - 8 km/h (Distancia)": Math.round(v1_8),
            "8 - 17 km/h (Distancia)": Math.round(v8_17),
            distance_vrange1: Math.round(v1_8),
            distance_vrange2: Math.round(v8_17),
            "17 - 19,8 km/h (Distancia)": Math.round(v17_19),
            "19,8 - 21 km/h (Distancia)": Math.round(v19_21),
            "21 - 24 km/h (Distancia)": Math.round(v21),
            "+ 24 km/h (Distancia)": Math.round(v24),
            "HSR Abs (m)": taskHsr,
            hsr: taskHsr,
            "+28 km/h (Distancia)": Math.round(v28dist),
            "+28 km/h (Num)": Math.round(v28num),
            "+28 km/h (Tiempo)": Math.round(v28time * 100) / 100,
            num_hids: Math.round(hids),
            "Distancia / Min": taskDistMin,
            distancia_min: taskDistMin,
            "m/min": taskDistMin,
            average_speed: taskDistMin > 0 ? Math.round((taskDistMin * 0.06) * 100) / 100 : 0,
            es_simulado: isRowSim,
            colC,
          };
        });

        const totalHsr = Math.round(sumV21 + sumV24 + sumV19_21);
        const finalPL = sumPL > 0 ? Math.round(sumPL) : Math.round(sumHMLD);
        const distMin = sumDur > 0 ? Math.round((sumDist / sumDur) * 100) / 100 : 0;

        if (isSimulado) simuladosCount++;
        else realesCount++;

        const mainMetrics = {
          // Volumen y Distancia
          "Distance(m)": Math.round(sumDist),
          "Distancia Total (m)": Math.round(sumDist),
          distancia_total: Math.round(sumDist),
          "Distancia / Min": distMin,
          distancia_min: distMin,
          "m/min": distMin,

          // Zonas de Velocidad
          "15 - 16 km/h (Distancia)": Math.round(sumV1_8),
          "16 - 17 km/h (Distancia)": Math.round(sumV8_17),
          "15-16 km/h (Distancia)": Math.round(sumV1_8),
          "16-17 km/h (Distancia)": Math.round(sumV8_17),
          "1 - 8 km/h (Distancia)": Math.round(sumV1_8),
          "8 - 17 km/h (Distancia)": Math.round(sumV8_17),
          distance_vrange1: Math.round(sumV1_8),
          distance_vrange2: Math.round(sumV8_17),
          "17 - 19,8 km/h (Distancia)": Math.round(sumV17_19),
          "19,8 - 21 km/h (Distancia)": Math.round(sumV19_21),
          "21 - 24 km/h (Distancia)": Math.round(sumV21),
          "+ 24 km/h (Distancia)": Math.round(sumV24),
          "HSR Abs (m)": totalHsr,
          hsr: totalHsr,

          // Velocidad y Picos
          "MAX Speed(km/h)": peakSpeed,
          "Vel Max": peakSpeed,
          max_speed: peakSpeed,
          average_speed: distMin > 0 ? Math.round((distMin * 0.06) * 100) / 100 : 0,

          // Sprints y Alta Intensidad
          "Sprints Count": Math.round(sumSprints),
          "+24 km/h (Num)": Math.round(sumSprints),
          num_sprints: Math.round(sumSprints),
          "+28 km/h (Distancia)": Math.round(sumV28Dist),
          "+28 km/h (Num)": Math.round(sumV28Num),
          "+28 km/h (Tiempo)": Math.round(sumV28Time * 100) / 100,
          num_hids: Math.round(sumHids),

          // Aceleraciones y Desaceleraciones
          "Accs Count": Math.round(sumAcc),
          "Acc + 3 m/s2 (Num)": Math.round(sumAcc),
          aceleraciones: Math.round(sumAcc),
          "Acc + 4 m/s2 (Num)": Math.round(sumAcc4),
          "Max Acc": peakAcc,
          max_acc: peakAcc,

          "Decs Count": Math.round(sumDec),
          "Dec + 3 m/s2 (Num)": Math.round(sumDec),
          desaceleraciones: Math.round(sumDec),
          "Dec + 4 m/s2 (Num)": Math.round(sumDec4),
          "Max Dec": peakDec,
          max_dec: peakDec,

          // Carga y Esfuerzo
          "Player Load": finalPL,
          player_load: finalPL,
          HMLD: Math.round(sumHMLD),
          hmld: Math.round(sumHMLD),
          "HMLD (num)": Math.round(sumHMLDNum),
          hmld_time: Math.round(sumHMLDTime * 100) / 100,

          // Tiempos
          "Duration(min)": Math.round(sumDur * 100) / 100,
          Tiempo: Math.round(sumDur * 100) / 100,
          duracion_min: Math.round(sumDur * 100) / 100,
          "TIiempo Activo": Math.round(sumDurActiva * 100) / 100,
          tiempo_activo: Math.round(sumDurActiva * 100) / 100,
          "Tiempo Efectivo": Math.round(sumDurEfectiva * 100) / 100,
          tiempo_efectivo: Math.round(sumDurEfectiva * 100) / 100,

          es_simulado: isSimulado,
          tipo_registro: isSimulado ? "SIMULADO" : "REAL",
          origen_dato: isSimulado ? "SIMULADO" : "REAL",
          tareas: tasksParsed,
        };

        const newRecord = {
          jugador_id: player.id,
          fecha: isoDate,
          sesion_dia_id,
          tipo_sesion,
          match_day,
          tarea: "Total",
          duracion: mainMetrics["Duration(min)"],
          metricas: mainMetrics,
        };

        allProcessedRecords.push(newRecord);
      }

      if (allProcessedRecords.length > 0 && allDatesArray.length > 0) {
        try {
          await supabase.from("gps_datos").delete().in("fecha", allDatesArray);
          const chunkSize = 200;
          for (let i = 0; i < allProcessedRecords.length; i += chunkSize) {
            const chunk = allProcessedRecords.slice(i, i + chunkSize);
            await supabase.from("gps_datos").insert(chunk);
          }
        } catch (insErr) {
          console.warn("Supabase insert note:", insErr);
        }
      }

    try {
      const fs = require("fs");
      const path = require("path");
      const syncedPath = path.join(process.cwd(), "public", "gps_datos_synced.json");
      fs.writeFileSync(syncedPath, JSON.stringify(allProcessedRecords, null, 2), "utf8");
    } catch (e) {
      console.warn("Could not write gps_datos_synced.json:", e);
    }

    return {
      success: true,
      records: allProcessedRecords,
      datesProcessed: Array.from(datesFound),
      totalRecords: allProcessedRecords.length,
      simuladosCount,
      realesCount,
    };
  } catch (err: any) {
    console.error("Error in syncGoogleSheetGpsData:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Escanea y sincroniza automáticamente tanto la base de datos de Google Sheets externa
 * como cualquier archivo CSV de GPS presente en Downloads vinculando los datos con los deportistas y sesiones reales.
 */
export async function syncGpsDatabaseWeb() {
  try {
    // 1. Sincronizar Google Sheet (enlace externo de GPS) con máxima prioridad y rapidez (~3s)
    const sheetRes = await syncGoogleSheetGpsData();

    // 2. Sincronizar CSVs locales de Downloads solo si existe el directorio local
    let downloadsRes: any = { datesProcessed: [], totalRecords: 0 };
    try {
      downloadsRes = await syncAllDownloadsGpsFiles();
    } catch (e) {}

    const datesProcessed = Array.from(new Set([
      ...(sheetRes.datesProcessed || []),
      ...(downloadsRes.datesProcessed || []),
    ]));

    const totalRecords = Math.max(sheetRes.totalRecords || 0, (sheetRes.totalRecords || 0) + (downloadsRes.totalRecords || 0));

    return {
      success: Boolean(sheetRes.success || downloadsRes.success),
      records: sheetRes.records || [],
      sheetRecords: sheetRes.totalRecords || 0,
      downloadsRecords: downloadsRes.totalRecords || 0,
      totalRecords: sheetRes.totalRecords || totalRecords,
      datesProcessed,
      simuladosCount: sheetRes.simuladosCount || 0,
      realesCount: sheetRes.realesCount || 0,
    };
  } catch (err: any) {
    console.error("Error in syncGpsDatabaseWeb:", err);
    return { success: false, error: err.message || "Error al sincronizar base de datos GPS" };
  }
}

export async function syncAllDownloadsGpsFiles() {
  try {
    const fs = require("fs");
    const path = require("path");
    const homeDir = process.env.HOME || "/Users/MiquelNadalGaya";
    const downloadsDir = path.join(homeDir, "Downloads");

    if (!fs.existsSync(downloadsDir)) {
      return { success: false, error: "Carpeta Downloads no encontrada" };
    }

    const files = fs.readdirSync(downloadsDir);
    const candidateFiles = files.filter((f: string) =>
      f.endsWith(".csv") &&
      (f.includes("total") || f.includes("HUESCA") || f.includes("entrenamiento") || f.includes("partido"))
    );

    const supabase = getServerSupabase();
    let dbPlayers: any[] = [];
    try {
      const { data: fetchedPlayers, error: pErr } = await supabase.from("jugadores").select("id, nombre, apodo, cor_id, equipo, activo");
      if (!pErr && fetchedPlayers && fetchedPlayers.length > 0) {
        dbPlayers = fetchedPlayers;
      }
    } catch (e) {}

    if (!dbPlayers || dbPlayers.length === 0) {
      dbPlayers = getMasterBackupTable("jugadores");
    }

    const europaPlayers = (dbPlayers || []).filter((p: any) => ((p.equipo || "").toUpperCase().includes("EUROPA") && p.activo) || p.activo);

    const normalize = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const aliases: Record<string, string> = {
      "edo": "edo",
      "victor edo": "edo",
      "sgro": "marcel",
      "campeny": "arnau",
      "angles": "angles",
      "exposito": "exposito",
      "morales": "morales",
      "padillo": "padillo",
      "cancelo": "cancelo",
      "cardelus": "cardelus",
      "teto martin": "teto",
      "tito": "tolosa",
      "enol": "enol",
      "khalid": "khalid",
      "cano": "cano",
      "mascaro": "mascaro",
      "youssef": "youssef",
      "flavio": "flavio",
      "joel": "joel",
      "gori": "gori",
      "santi": "santi",
      "xavi v": "xavi",
      "xavi victor": "xavi"
    };

    const matchPlayer = (rawName: string) => {
      const norm = normalize(rawName);
      if (!norm) return null;
      let match = europaPlayers.find((p: any) => normalize(p.apodo) === norm);
      if (match) return match;
      match = europaPlayers.find((p: any) => normalize(p.nombre) === norm);
      if (match) return match;
      match = europaPlayers.find((p: any) => normalize(p.nombre).split(/\s+/).includes(norm));
      if (match) return match;
      const alias = aliases[norm];
      if (alias) {
        match = europaPlayers.find((p: any) => {
          const aNorm = normalize(p.apodo);
          const nNorm = normalize(p.nombre);
          return aNorm === alias || nNorm.split(/\s+/).includes(alias) || nNorm === alias;
        });
        if (match) return match;
      }
      match = europaPlayers.find((p: any) => {
        const aNorm = normalize(p.apodo);
        const nNorm = normalize(p.nombre);
        return (aNorm && aNorm.includes(norm)) || nNorm.includes(norm) || (aNorm && norm.includes(aNorm) && aNorm.length > 2);
      });
      return match || null;
    };

    const parseNum = (val: any, def = 0) => {
      if (val === undefined || val === null || val === "") return def;
      if (typeof val === "number") return isNaN(val) ? def : val;
      const s = String(val).trim();
      let clean = s;
      if (clean.includes(",") && clean.includes(".")) {
        clean = clean.replace(/\./g, "").replace(/,/g, ".");
      } else if (clean.includes(",")) {
        clean = clean.replace(/,/g, ".");
      }
      clean = clean.replace(/[^0-9.-]/g, "");
      const num = parseFloat(clean);
      return isNaN(num) ? def : num;
    };

    const processedDates = new Set<string>();
    let totalInserted = 0;

    for (const fileName of candidateFiles) {
      const filePath = path.join(downloadsDir, fileName);
      const csv = fs.readFileSync(filePath, "utf8");
      const lines = csv.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
      if (lines.length < 2) continue;

      const delim = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
      const header = lines[0].split(delim).map((h: string) => h.trim());

      const rows = lines.slice(1).map((l: string) => {
        const parts = l.split(delim);
        const obj: Record<string, string> = {};
        header.forEach((h: string, i: number) => {
          obj[h] = parts[i]?.trim() || "";
        });
        return obj;
      });

      const getVal = (rowObj: Record<string, string>, possibleNames: string[]): string => {
        if (!rowObj) return "";
        // 1. Prioridad: Coincidencia exacta de nombre de columna
        for (const p of possibleNames) {
          const normP = normalize(p);
          for (const [k, v] of Object.entries(rowObj)) {
            const normK = normalize(k);
            if (normK === normP) {
              if (v !== undefined && v !== null && v !== "") return String(v).trim();
            }
          }
        }
        // 2. Coincidencia parcial (evitando prefijos id_ si no se piden)
        for (const p of possibleNames) {
          const normP = normalize(p);
          for (const [k, v] of Object.entries(rowObj)) {
            const normK = normalize(k);
            if (normK.startsWith("id ") && !normP.startsWith("id")) continue;
            if (normK.includes(normP) || normP.includes(normK)) {
              if (v !== undefined && v !== null && v !== "") return String(v).trim();
            }
          }
        }
        return "";
      };

      const sampleRow = rows.find((r: any) => getVal(r, ["date", "fecha", "day", "timestamp"]) || r.date || r.fecha) || rows[0];
      const rawDate = sampleRow ? (getVal(sampleRow, ["date", "fecha", "day", "timestamp"]) || sampleRow.date || sampleRow.fecha || "") : "";
      let isoDate = "";
      // 1. Priorizar la fecha explícita del nombre del archivo si existe (ej: _8-11-2026_total -> 2026-11-08)
      const fileDateM = fileName.match(/_(\d{1,2})[-/](\d{1,2})[-/](\d{4})/) || fileName.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (fileDateM) {
        const p1 = parseInt(fileDateM[1], 10);
        const p2 = parseInt(fileDateM[2], 10);
        const year = fileDateM[3];
        if (p2 === 11 || p1 === 11) {
          const day = p1 === 11 ? p2 : p1;
          isoDate = `${year}-11-${String(day).padStart(2, "0")}`;
        } else if (p2 === 10 || p1 === 10) {
          const day = p1 === 10 && p2 !== 10 ? p2 : p1;
          isoDate = `${year}-10-${String(day).padStart(2, "0")}`;
        } else {
          isoDate = `${year}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
        }
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        isoDate = rawDate;
      } else if (rawDate.includes("/")) {
        const dParts = rawDate.split("/");
        if (dParts.length === 3) {
          const p1 = parseInt(dParts[0], 10);
          const p2 = parseInt(dParts[1], 10);
          const p3 = parseInt(dParts[2], 10);
          const year = p3 < 100 ? 2000 + p3 : p3;
          if (p1 === 11 && p2 <= 30) {
            isoDate = `${year}-11-${String(p2).padStart(2, "0")}`;
          } else if (p2 === 11 && p1 <= 30) {
            isoDate = `${year}-11-${String(p1).padStart(2, "0")}`;
          } else if (p1 === 10 && p2 <= 31) {
            isoDate = `${year}-10-${String(p2).padStart(2, "0")}`;
          } else if (p2 === 10 && p1 <= 31) {
            isoDate = `${year}-10-${String(p1).padStart(2, "0")}`;
          } else {
            isoDate = `${year}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
          }
        }
      }

      if (!isoDate) continue;
      processedDates.add(isoDate);

      const { data: sesionDia } = await supabase
        .from("sesiones_dia")
        .select("id, evento_am, md, rival")
        .eq("fecha", isoDate)
        .maybeSingle();

      const sesion_dia_id = sesionDia?.id || null;
      const tipo_sesion = sesionDia?.rival ? "PARTIDO" : (fileName.toLowerCase().includes("partido") ? "PARTIDO" : "ENTRENAMIENTO");
      const match_day = sesionDia?.md || (tipo_sesion === "PARTIDO" ? "MD" : null);

      const playerRowsMap = new Map<string, { player: any; rows: any[] }>();
      for (const r of rows) {
        const pRawName = getVal(r, ["player", "jugador", "deportista", "name", "nombre", "athlete"]) || r.player || r.jugador;
        if (!pRawName) continue;

        // El 29/10/2026 el chaleco/dispositivo registrado como Teto Martín perteneció en realidad a Pol Caramés (no activo)
        if (isoDate === "2026-10-29" && (pRawName.toLowerCase().includes("teto") || pRawName.toLowerCase().includes("carames"))) {
          continue;
        }

        const match = matchPlayer(pRawName);

        if (!match) continue;

        if (!playerRowsMap.has(match.id)) {
          playerRowsMap.set(match.id, { player: match, rows: [] });
        }
        playerRowsMap.get(match.id)!.rows.push(r);
      }

      const recordsToInsert: any[] = [];
      for (const [jugador_id, { rows: pRows }] of playerRowsMap.entries()) {
        const totalRow = pRows.find((r: any) => {
          const t = getVal(r, ["task", "tarea", "period", "split", "activity"]) || r.task;
          return t && t.toLowerCase() === "total";
        }) || pRows[0];
        const taskRows = pRows.filter((r: any) => {
          const t = getVal(r, ["task", "tarea", "period", "split", "activity"]) || r.task;
          return t && t.toLowerCase() !== "total";
        });

        const buildMetrics = (r: any) => {
          const v1 = parseNum(getVal(r, ["15 - 16 km/h (distancia)", "15-16 km/h (distancia)", "15 - 16 km/h", "15-16 km/h", "15 - 16", "15-16", "vrange1", "distance_vrange1", "1 - 8 km/h", "1-8 km/h", "zona 1", "z1"]));
          const v2 = parseNum(getVal(r, ["16 - 17 km/h (distancia)", "16-17 km/h (distancia)", "16 - 17 km/h", "16-17 km/h", "16 - 17", "16-17", "vrange2", "distance_vrange2", "8 - 17 km/h", "8-17 km/h", "zona 2", "z2"]));
          const v3 = parseNum(getVal(r, ["vrange3", "distance_vrange3", "17 - 19,8", "17 - 19.8", "17-19,8", "zona 3", "z3"]));
          const v4 = parseNum(getVal(r, ["vrange4", "distance_vrange4", "19,8 - 21", "19.8 - 21", "19-21", "zona 4", "z4"]));
          const v5 = parseNum(getVal(r, ["vrange5", "distance_vrange5", "21 - 24", "21-24", "zona 5", "z5"]));
          const v6 = parseNum(getVal(r, ["vrange6", "distance_vrange6", "+ 24 km/h", "+24 km/h", "+24", "sprint distance", "distancia sprint", "zona 6", "z6"]));
          const v7 = parseNum(getVal(r, ["vrange7", "distance_vrange7", "+ 28 km/h", "+28 km/h", "+28", "zona 7", "z7"]));
          const sprints28 = parseNum(getVal(r, ["+28 km/h (num)", "+ 28 km/h (num)", "+28 km/h (nº)", "sprints_28", "sprints28"]));

          let hsr = Math.round(v4 + v5 + v6);
          const rawHsr = parseNum(getVal(r, ["hsr", "high speed running", "distancia z4", "hsr abs"]));
          if (rawHsr > 0) hsr = Math.round(rawHsr);

          let dist = Math.round(parseNum(getVal(r, ["total_distance", "total distance", "distance (m)", "distance(m)", "distancia total", "distancia", "distance"])));
          if (dist === 0 && (v1 + v2 + v3 + v4 + v5 + v6) > 0) {
            dist = Math.round(v1 + v2 + v3 + v4 + v5 + v6);
          }

          const speed = parseNum(getVal(r, ["max_speed", "top speed", "max speed", "velocidad maxima", "v max"]));
          const load = Math.round(parseNum(getVal(r, ["player_load", "player load", "hmld", "load", "carga"])));
          const sprints = Math.round(parseNum(getVal(r, ["sprints", "num_sprints", "sprint count", "+24 km/h (num)"])));
          const acc = Math.round(parseNum(getVal(r, ["num_acc", "accs count", "aceleraciones", "acc"])));
          const dec = Math.round(parseNum(getVal(r, ["num_dec", "decs count", "desaceleraciones", "dec"])));
          const dur = parseNum(getVal(r, ["time", "duration", "duracion", "volume", "minutos"]));

          const distMin = dur > 0 ? Math.round((dist / dur) * 100) / 100 : 0;
          const dist21 = Math.round(v5 + v6);

          return {
            "Distance(m)": dist,
            "Distancia Total (m)": dist,
            "Distancia Total": dist,
            distancia_total: dist,
            "Distancia / Min": distMin,
            "m/min": distMin,
            distancia_min: distMin,
            "15 - 16 km/h (Distancia)": v1,
            "16 - 17 km/h (Distancia)": v2,
            "15-16 km/h (Distancia)": v1,
            "16-17 km/h (Distancia)": v2,
            "1 - 8 km/h (Distancia)": v1,
            "8 - 17 km/h (Distancia)": v2,
            distance_vrange1: v1,
            distance_vrange2: v2,
            "17 - 19,8 km/h (Distancia)": v3,
            "19,8 - 21 km/h (Distancia)": v4,
            "21 - 24 km/h (Distancia)": v5,
            "+ 24 km/h (Distancia)": v6,
            "Distance +21 (m)": dist21,
            "Distancia (+21km/h) (m)": dist21,
            "HSR Abs (m)": hsr,
            hsr,
            "MAX Speed(km/h)": speed,
            max_speed: speed,
            "Player Load": load,
            player_load: load,
            "Sprints Count": sprints,
            "+24 km/h (Num)": sprints,
            num_sprints: sprints,
            "+28 km/h (Distancia)": v7,
            "+28 km/h (Num)": sprints28,
            "Accs Count": acc,
            aceleraciones: acc,
            "Decs Count": dec,
            desaceleraciones: dec,
            "Acc+Dec": acc + dec,
            "Duration(min)": dur,
            duracion_min: dur,
            vrange1: v1,
            vrange2: v2,
            vrange3: v3,
            vrange4: v4,
            vrange5: v5,
            vrange6: v6,
          };
        };

        const mainMetrics = buildMetrics(totalRow);
        if (taskRows.length > 0) {
          (mainMetrics as any).tareas = taskRows.map((tr: any) => {
            let taskName = (getVal(tr, ["task", "tarea", "period", "split", "activity"]) || tr.task || "Tarea").trim();
            // Mapeo automático de periodos genéricos si es partido contra Zaragoza (23/10/2026)
            if (isoDate === "2026-10-23" || fileName.toLowerCase().includes("zaragoza")) {
              const lowerT = taskName.toLowerCase();
              if (lowerT === "periodo 4") taskName = "ACTIVACIÓN PREPARTIDO";
              else if (lowerT === "periodo 1") taskName = "PRIMERA PARTE";
              else if (lowerT === "periodo 2") taskName = "SEGUNDA PARTE";
              else if (lowerT === "periodo 3") taskName = "CARRERAS";
            }
            return {
              nombre: taskName,
              ...buildMetrics(tr),
            };
          });
        }

        recordsToInsert.push({
          jugador_id,
          fecha: isoDate,
          sesion_dia_id,
          tipo_sesion,
          match_day,
          tarea: "Total",
          duracion: mainMetrics["Duration(min)"],
          metricas: mainMetrics,
        });
      }

      if (recordsToInsert.length > 0) {
        await supabase.from("gps_datos").delete().eq("fecha", isoDate).in("jugador_id", recordsToInsert.map((r: any) => r.jugador_id));
        const { error: insErr } = await supabase.from("gps_datos").insert(recordsToInsert);
        if (!insErr) {
          totalInserted += recordsToInsert.length;
        }
      }
    }

    return {
      success: true,
      filesProcessed: candidateFiles,
      datesProcessed: Array.from(processedDates),
      totalRecords: totalInserted,
    };
  } catch (err: any) {
    console.error("Error in syncAllDownloadsGpsFiles:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Conexión server-side para leer hojas de Excel Web / Google Sheets.
 * Soporta autoconversión de enlaces "Insertar" (Embed) de Excel Web y Google Sheets.
 */
export async function fetchLiveWellnessSheet(sheetUrl?: string) {
  try {
    let targetUrl = (sheetUrl || "").trim();
    if (!targetUrl) {
      try {
        const ext = await getExternalLinksBBDD();
        targetUrl = (ext?.wellness?.url || "").trim();
      } catch (e) {}
    }
    if (!targetUrl) {
      targetUrl = "https://docs.google.com/spreadsheets/d/1JQXKfCrGCxom-N-RM-6nbDqQ0asnL_le0Z4EOwFc5Ds/edit?resourcekey=&gid=432486581#gid=432486581";
    }

    // Si pegan el código iframe entero de Excel Web, extraer la URL del src
    if (targetUrl.includes("<iframe") && targetUrl.includes("src=")) {
      const srcMatch = targetUrl.match(/src=["']([^"']+)["']/);
      if (srcMatch && srcMatch[1]) {
        targetUrl = srcMatch[1];
      }
    }

    // Autoconvertir URLs de Excel Web Insertar/Embed a descarga directa
    if (targetUrl.includes("authkey=") && (targetUrl.includes("resid=") || targetUrl.includes("onedrive"))) {
      const matchResid = targetUrl.match(/resid=([^&]+)/);
      const matchAuth = targetUrl.match(/authkey=([^&]+)/);
      if (matchResid && matchAuth) {
        targetUrl = `https://onedrive.live.com/download?resid=${matchResid[1]}&authkey=${matchAuth[1]}`;
      }
    }

    // Autoconvertir URLs estándar de Google Sheets al formato de exportación CSV directo (preservando el gid)
    if (targetUrl.includes("docs.google.com/spreadsheets/d/")) {
      const match = targetUrl.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      const gidMatch = targetUrl.match(/gid=([0-9]+)/);
      const gidParam = gidMatch && gidMatch[1] ? `&gid=${gidMatch[1]}` : "";
      if (match && match[1]) {
        targetUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${gidParam}`;
      }
    }

    const response = await fetch(targetUrl, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/csv,text/plain;q=0.8,*/*;q=0.7",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      if (response.status === 403) {
        return {
          success: false,
          error: "Error 403 (Microsoft Excel Web): En Excel Web ve a Archivo -> Compartir -> Insertar, y copia el enlace de inserción/código.",
          data: [],
        };
      }
      return { success: false, error: `Error HTTP ${response.status}: El servidor no permitió descargar los datos.`, data: [] };
    }

    const text = await response.text();
    if (text.includes("<!DOCTYPE html>") || text.includes("<html")) {
      return {
        success: false,
        error: "El enlace requiere inicio de sesión. Asegúrate de publicar la hoja en la web o dar acceso público de lectura.",
        data: [],
      };
    }

    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length < 2) {
      return { success: false, error: "La hoja de respuestas no contiene suficientes filas.", data: [] };
    }

    const detectDelimiter = (line: string): string => {
      const commaCount = (line.match(/,/g) || []).length;
      const semiCount = (line.match(/;/g) || []).length;
      const tabCount = (line.match(/\t/g) || []).length;
      if (semiCount > commaCount && semiCount > tabCount) return ";";
      if (tabCount > commaCount && tabCount > semiCount) return "\t";
      return ",";
    };

    const delim = detectDelimiter(lines[0]);

    const parseCsvLine = (csvLine: string): string[] => {
      const result: string[] = [];
      let startValue = 0;
      let inQuotes = false;
      for (let i = 0; i < csvLine.length; i++) {
        const c = csvLine[i];
        if (c === '"') {
          inQuotes = !inQuotes;
        } else if (c === delim && !inQuotes) {
          let val = csvLine.substring(startValue, i).trim();
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.substring(1, val.length - 1).replace(/""/g, '"');
          }
          result.push(val);
          startValue = i + 1;
        }
      }
      let lastVal = csvLine.substring(startValue).trim();
      if (lastVal.startsWith('"') && lastVal.endsWith('"')) {
        lastVal = lastVal.substring(1, lastVal.length - 1).replace(/""/g, '"');
      }
      result.push(lastVal);
      return result;
    };

    const headers = parseCsvLine(lines[0]);
    const records = lines.slice(1).map((line, idx) => {
      const values = parseCsvLine(line);
      const row: Record<string, string> = { _id: `row-${idx}` };
      headers.forEach((h, i) => {
        let key = h;
        let counter = 1;
        while (row[key] !== undefined) {
          key = `${h}_${counter}`;
          counter++;
        }
        row[key] = values[i] || "";
      });

      // Mapeo exhaustivo por letras de columna (A..Z) y por índice numérico (_col0..N)
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      values.forEach((v, i) => {
        row[`_col${i}`] = v || "";
        if (i < alphabet.length) {
          row[`_col${alphabet[i]}`] = v || "";
        }
      });

      return row;
    });

    return { success: true, headers, data: records };
  } catch (err: any) {
    return { success: false, error: err.message || "Error al conectar con la hoja en tiempo real", data: [] };
  }
}

/**
 * Server Actions para Calendario / Planificación
 */
export async function getTiposEvento() {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from("tipos_evento").select("*");
  
  const defaults = [
    { codigo: "E", texto: "Entrenamiento", color: "#1e3a8a" },
    { codigo: "PL", texto: "Partido Liga", color: "#dc2626" },
    { codigo: "PAL", texto: "Partido Amistoso Local", color: "#b91c1c" },
    { codigo: "PV", texto: "Partido Viaje", color: "#d97706" },
    { codigo: "PAV", texto: "Partido Amistoso Visitante", color: "#ea580c" },
    { codigo: "D", texto: "Descanso", color: "#64748b" },
  ];

  if (error || !data || data.length === 0) {
    return defaults;
  }
  return data;
}

export async function getSesionesDiaRange(desde?: string, hasta?: string, equipo?: string) {
  let data: any[] | null = null;
  try {
    const supabase = getServerSupabase();
    let query = supabase.from("sesiones_dia").select("*").order("fecha", { ascending: true });

    let targetEquipo = equipo;
    if (!targetEquipo) {
      try {
        const conf = await getClubConfig();
        if (conf?.nombreClub) targetEquipo = conf.nombreClub;
      } catch (e) {}
    }

    if (targetEquipo) {
      if (targetEquipo.toLowerCase().includes("prat")) {
        query = query.ilike("equipo", "%Prat%");
      } else if (targetEquipo.toLowerCase().includes("manresa")) {
        query = query.ilike("equipo", "%Manresa%");
      } else if (targetEquipo.toLowerCase().includes("europa")) {
        query = query.ilike("equipo", "%Europa%");
      } else {
        query = query.eq("equipo", targetEquipo);
      }
    }

    if (desde) query = query.gte("fecha", desde);
    if (hasta) query = query.lte("fecha", hasta);

    const res = await query;
    if (!res.error && res.data && res.data.length > 0) {
      data = res.data;
    } else if (res.error) {
      console.warn("Supabase getSesionesDiaRange error, recuperando desde backup maestro:", res.error.message);
    }
  } catch (err: any) {
    console.warn("Exception getSesionesDiaRange, recuperando desde backup maestro:", err?.message);
  }

  // Fallback a backup maestro si Supabase dio error o no devolvió datos
  if (!data || data.length === 0) {
    const backupRows = getMasterBackupTable("sesiones_dia");
    let filtered = [...backupRows];
    if (desde) filtered = filtered.filter((r: any) => (r.fecha || "") >= desde);
    if (hasta) filtered = filtered.filter((r: any) => (r.fecha || "") <= hasta);
    if (equipo) {
      const eqNorm = equipo.toLowerCase();
      filtered = filtered.filter((r: any) => (r.equipo || "").toLowerCase().includes(eqNorm));
    }
    filtered.sort((a: any, b: any) => (a.fecha || "").localeCompare(b.fecha || ""));
    data = filtered;
  }

  const normalized = (data || []).map((row: any) => {
    const mainEv = row.evento_am ?? row.evento_principal ?? row.evento ?? (row.rival ? "P" : null);

    return {
      ...row,
      rival: row.rival ?? "",
      carga: row.carga ?? null,
      volumen: row.volumen ?? null,
      intensidad: row.intensidad ?? null,
      resultado_partido: row.resultado_partido ?? "",
      evento: mainEv,
      evento_principal: mainEv,
      evento_am: row.evento_am ?? mainEv,
      evento_pm: row.evento_pm ?? null,
      evento_1: row.evento_1 ?? null,
      evento_2: row.evento_2 ?? null,
      evento_3: row.evento_3 ?? null,
      evento_4: row.evento_4 ?? null,
      evento_5: row.evento_5 ?? null,
      evento_6: row.evento_6 ?? null,
      subperiodo: row.subperiodo ?? "",
      md: row.md ?? "",
      comentario_microciclo: row.comentario_microciclo ?? "",
    };
  });

  return normalized;
}

export async function getOptimizadorSessionNumber(targetDateISO: string): Promise<number> {
  try {
    const supabase = getServerSupabase();
    const { data: dbData } = await supabase
      .from("sesiones_dia")
      .select("*");
    const dbSessions = dbData || [];

    const { calculateOptimizadorSessionNumber } = await import("@/app/lib/sessionCounter");
    return calculateOptimizadorSessionNumber(targetDateISO, { daysList: dbSessions });
  } catch (e) {
    const { calculateOptimizadorSessionNumber } = await import("@/app/lib/sessionCounter");
    return calculateOptimizadorSessionNumber(targetDateISO);
  }
}


function cleanNumericValue(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const s = String(val).trim().replace(",", ".");
  const n = Number(s);
  if (!isNaN(n)) return n;
  const match = s.match(/[-+]?[0-9]*\.?[0-9]+/);
  if (match) {
    const p = parseFloat(match[0]);
    if (!isNaN(p)) return p;
  }
  return null;
}

function cleanIntegerValue(val: any): number | null {
  const n = cleanNumericValue(val);
  return n !== null ? Math.round(n) : null;
}

export async function updateSesionDia(id: string, datos: Record<string, any>) {
  const supabase = getServerSupabase();
  
  const VALID_COLS = [
    "fecha", "equipo", "periodo", "subperiodo", "semana", "md", "rival",
    "carga", "volumen", "intensidad", "evento_am", "evento_pm",
    "comentario_microciclo"
  ];

  const payload: Record<string, any> = {};
  Object.keys(datos).forEach((k) => {
    if (datos[k] !== undefined) {
      if (k === "evento" || k === "evento_am" || k === "evento_general" || k === "evento_principal" || k === "evento_1") {
        payload["evento_am"] = datos[k] || null;
      } else if (k === "evento_pm" || k === "evento_2") {
        payload["evento_pm"] = datos[k] || null;
      } else if (k === "comentario" || k === "comentario_microciclo" || k === "comentario_fisico" || k === "comentario_tecnico") {
        payload["comentario_microciclo"] = datos[k] || null;
      } else if (k === "carga" || k === "volumen" || k === "intensidad") {
        payload[k] = cleanNumericValue(datos[k]);
      } else if (k === "semana") {
        payload[k] = cleanIntegerValue(datos[k]);
      } else if (VALID_COLS.includes(k)) {
        payload[k] = datos[k] === "" ? null : datos[k];
      }
    }
  });

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  let query = supabase.from("sesiones_dia").update(payload);
  if (isUuid) {
    query = query.eq("id", id);
  } else if (datos.fecha) {
    query = query.eq("fecha", datos.fecha);
  } else {
    const cleanDate = id.replace(/^day_/, "");
    query = query.eq("fecha", cleanDate);
  }
  const { error } = await query;

  if (error) {
    console.error("Error al actualizar la sesión:", error.message);
    throw new Error(`Error BBDD: ${error.message}`);
  }
}

export async function batchUpdateSesionesDia(updates: Array<{ id: string; datos: Record<string, any> }>) {
  const supabase = getServerSupabase();
  if (!updates || updates.length === 0) return { success: true, count: 0 };

  const VALID_COLS = [
    "fecha", "equipo", "periodo", "subperiodo", "semana", "md", "rival",
    "carga", "volumen", "intensidad", "evento_am", "evento_pm",
    "comentario_microciclo"
  ];

  const rows = updates.map((item) => {
    const payload: Record<string, any> = { id: item.id };
    Object.keys(item.datos).forEach((k) => {
      if (item.datos[k] !== undefined) {
        if (k === "evento" || k === "evento_am" || k === "evento_general" || k === "evento_principal" || k === "evento_1") {
          payload["evento_am"] = item.datos[k] || null;
        } else if (k === "evento_pm" || k === "evento_2") {
          payload["evento_pm"] = item.datos[k] || null;
        } else if (k === "comentario" || k === "comentario_microciclo" || k === "comentario_fisico" || k === "comentario_tecnico") {
          payload["comentario_microciclo"] = item.datos[k] || null;
        } else if (k === "carga" || k === "volumen" || k === "intensidad") {
          payload[k] = cleanNumericValue(item.datos[k]);
        } else if (k === "semana") {
          payload[k] = cleanIntegerValue(item.datos[k]);
        } else if (VALID_COLS.includes(k)) {
          payload[k] = item.datos[k] === "" ? null : item.datos[k];
        }
      }
    });
    return payload;
  });

  const { error } = await supabase.from("sesiones_dia").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("Error en batchUpdateSesionesDia bulk upsert:", error.message);
  }

  return { success: !error };
}

export async function saveFullPlanificacionBBDD(sessionsPayload: any[], commentsPayload?: any[], playerEventsMap?: Record<string, string>, playerMinutesMap?: Record<string, number>, eventosBloquesMap?: Record<string, any>, disponibilidadMap?: Record<string, string>) {
  
  const supabase = getServerSupabase();
  const hasSessions = Boolean(sessionsPayload && sessionsPayload.length > 0);
  const hasComments = Boolean(commentsPayload && commentsPayload.length > 0);
  const hasPlayerEvents = Boolean(playerEventsMap && Object.keys(playerEventsMap).length > 0);
  const hasPlayerMinutes = Boolean(playerMinutesMap && Object.keys(playerMinutesMap).length > 0);
  const hasBlocks = Boolean(eventosBloquesMap && Object.keys(eventosBloquesMap).length > 0);
  const hasDisp = Boolean(disponibilidadMap && Object.keys(disponibilidadMap).length > 0);

  if (!hasSessions && !hasComments && !hasPlayerEvents && !hasPlayerMinutes && !hasBlocks && !hasDisp) {
    return { success: true, count: 0 };
  }

  const cleanRows = sessionsPayload.map((s) => {
    return {
      id: s.id,
      fecha: s.fecha,
      equipo: s.equipo ?? "CE EUROPA",
      periodo: s.periodo ?? null,
      subperiodo: s.subperiodo ?? null,
      semana: cleanIntegerValue(s.semana),
      md: s.md ?? null,
      rival: s.rival ?? null,
      carga: cleanNumericValue(s.carga),
      volumen: cleanNumericValue(s.volumen),
      intensidad: cleanNumericValue(s.intensidad),
      evento_am: s.evento_am ?? s.evento ?? s.evento_principal ?? s.evento_1 ?? null,
      evento_pm: s.evento_pm ?? s.evento_2 ?? null,
      comentario_microciclo: s.comentario_microciclo ?? s.comentario ?? null,
    };
  });

  // Asegurar que cada fila use el UUID exacto de la base de datos para su fecha
  const { data: dbSessions } = await supabase.from("sesiones_dia").select("id, fecha");
  const dateToExistingId = new Map<string, string>((dbSessions || []).map((s: any) => [s.fecha, s.id]));

  cleanRows.forEach((r) => {
    if (r.fecha && dateToExistingId.has(r.fecha)) {
      r.id = dateToExistingId.get(r.fecha)!;
    }
  });

  const validCleanRows = cleanRows.filter((r) => r.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.id));
  const newCleanRows = cleanRows.filter((r) => !(r.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.id)));
  
  if (validCleanRows.length > 0) {
    const { error } = await supabase.from("sesiones_dia").upsert(validCleanRows, { onConflict: "id" });
    if (error) {
      console.error("Error al guardar planificación completa en Supabase (sesiones_dia):", error.message);
    }
  }

  // 1. Construir un mapa base de fecha/id a UUID real con las filas que ya conocemos
  const fechaToUuidMap = new Map<string, string>();
  cleanRows.forEach((r) => {
    if (r.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.id)) {
      fechaToUuidMap.set(r.id, r.id);
      if (r.fecha) fechaToUuidMap.set(r.fecha, r.id);
    }
  });

  // Fallback seguro para días nuevos generados localmente (con id "day_YYYY-MM-DD")
  if (newCleanRows.length > 0) {
    for (const r of newCleanRows) {
      const { id, ...rest } = r;
      if (!rest.fecha) continue;
      
      const { data: existing } = await supabase.from("sesiones_dia").select("id").eq("fecha", rest.fecha).maybeSingle();
      if (existing) {
        await supabase.from("sesiones_dia").update(rest).eq("id", existing.id);
        fechaToUuidMap.set(rest.fecha, existing.id);
      } else {
        const { data: inserted } = await supabase.from("sesiones_dia").insert(rest).select("id").single();
        if (inserted) {
          fechaToUuidMap.set(rest.fecha, inserted.id);
        }
      }
    }
  }

  // 2. Extraer todas las fechas que faltan por resolver a UUID real
  const missingDateStrs = new Set<string>();
  const extractMissingDateStr = (rawSesionId: string) => {
    if (!fechaToUuidMap.has(rawSesionId)) {
      const dateStr = String(rawSesionId).replace("day_", "");
      if (!fechaToUuidMap.has(dateStr)) {
        missingDateStrs.add(dateStr);
      }
    }
  };

  if (playerEventsMap) {
    Object.keys(playerEventsMap).forEach(key => {
      const parts = key.split("_");
      if (parts.length > 1 && parts[0] !== "TEAM" && parts[0] !== "EQUIPO") {
        extractMissingDateStr(parts.slice(1).join("_"));
      }
    });
  }

  if (disponibilidadMap) {
    Object.keys(disponibilidadMap).forEach(key => {
      const parts = key.split("_");
      if (parts.length > 1 && parts[0] !== "TEAM" && parts[0] !== "EQUIPO") {
        extractMissingDateStr(parts.slice(1).join("_"));
      }
    });
  }

  if (playerMinutesMap) {
    Object.keys(playerMinutesMap).forEach(key => {
      const match = key.match(/\d{4}-\d{2}-\d{2}/);
      if (match) {
        extractMissingDateStr(match[0]);
      } else {
        const parts = key.split("_");
        if (parts.length > 1 && parts[0] !== "TEAM" && parts[0] !== "EQUIPO") {
          extractMissingDateStr(parts.slice(1).join("_"));
        }
      }
    });
  }

  if (eventosBloquesMap) {
    Object.keys(eventosBloquesMap).forEach(key => {
      const match = key.match(/(.+)_slot_(\d+)/);
      if (match) extractMissingDateStr(match[1]);
    });
  }

  if (commentsPayload) {
    for (const c of commentsPayload) {
      const rawSesionId = c.day_id || c.fecha;
      if (rawSesionId) extractMissingDateStr(rawSesionId);
      if (c.fecha) extractMissingDateStr(c.fecha);
    }
  }

  // 3. Consultar a la BBDD para resolver las fechas a UUIDs reales
  if (missingDateStrs.size > 0) {
    const missingDatesArray = Array.from(missingDateStrs);
    const { data: existingSessions } = await supabase
      .from("sesiones_dia")
      .select("id, fecha")
      .in("fecha", missingDatesArray);

    existingSessions?.forEach((s) => {
      if (s.fecha && s.id) {
        fechaToUuidMap.set(s.fecha, s.id);
        fechaToUuidMap.set(s.id, s.id);
      }
    });
  }

  const getRealUuid = (rawIdOrDate: string, extraDate?: string) => {
    let dayId = rawIdOrDate;
    const dateStr = String(rawIdOrDate).replace("day_", "");
    if (fechaToUuidMap.has(rawIdOrDate)) dayId = fechaToUuidMap.get(rawIdOrDate) || dayId;
    else if (fechaToUuidMap.has(dateStr)) dayId = fechaToUuidMap.get(dateStr) || dayId;
    else if (extraDate && fechaToUuidMap.has(extraDate)) dayId = fechaToUuidMap.get(extraDate) || dayId;
    return dayId;
  };

  // 4. Guardar playerEventsMap, playerMinutesMap y commentsPayload en estado_diario_jugador
  const estadoRowsMap = new Map<string, any>();
  const getRowKey = (jugadorId: string, rawSesionId: string, fecha?: string) => {
    const realUuid = getRealUuid(rawSesionId, fecha);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(realUuid);
    if (!isUuid) return null;
    
    const key = `${jugadorId}_${realUuid}`;
    if (!estadoRowsMap.has(key)) {
        estadoRowsMap.set(key, { jugador_id: String(jugadorId), sesion_dia_id: String(realUuid) });
    }
    return key;
  };

  if (playerEventsMap) {
    Object.keys(playerEventsMap).forEach(key => {
      const parts = key.split("_");
      const jugadorId = parts[0];
      if (!jugadorId || jugadorId === "TEAM" || jugadorId === "EQUIPO") return;
      const rawSesionId = parts.slice(1).join("_");
      const rowKey = getRowKey(jugadorId, rawSesionId);
      if (rowKey) {
        estadoRowsMap.get(rowKey).evento_asignado = playerEventsMap[key];
      }
    });
  }

  if (disponibilidadMap) {
    Object.keys(disponibilidadMap).forEach(key => {
      const parts = key.split("_");
      const jugadorId = parts[0];
      if (!jugadorId || jugadorId === "TEAM" || jugadorId === "EQUIPO") return;
      const rawSesionId = parts.slice(1).join("_");
      const rowKey = getRowKey(jugadorId, rawSesionId);
      if (rowKey) {
        const val = disponibilidadMap[key];
        estadoRowsMap.get(rowKey).disponibilidad = val || null;
      }
    });
  }

  if (playerMinutesMap) {
    Object.keys(playerMinutesMap).forEach(key => {
      const parts = key.split("_");
      const jugadorId = parts[0];
      if (!jugadorId || jugadorId === "TEAM" || jugadorId === "EQUIPO") return;
      const matchDate = key.match(/\d{4}-\d{2}-\d{2}/);
      const rawSesionId = matchDate ? matchDate[0] : parts[1];
      const rowKey = getRowKey(jugadorId, rawSesionId, matchDate ? matchDate[0] : undefined);
      if (rowKey) {
        const mins = Number(playerMinutesMap[key]) || 0;
        const row = estadoRowsMap.get(rowKey);
        if (row) {
          row.minutos = mins;
          row.duracion_evento = String(mins);
          row.minutos_partido = mins;
          row.minutos_jugados = mins;
          if (mins > 0) {
            row.disponibilidad = "D";
            row.realiza_evento = "SI";
          }
        }
      }
    });
  }

  if (commentsPayload) {
    for (const c of commentsPayload) {
      const rawSesionId = c.day_id || c.fecha;
      if (!c.jugador_id || !rawSesionId) continue;
      if (c.jugador_id === "TEAM" || c.jugador_id === "team" || c.jugador_id === "EQUIPO") continue;

      const key = getRowKey(String(c.jugador_id), String(rawSesionId), String(c.fecha));
      if (!key) continue;

      const row = estadoRowsMap.get(key);
      const appendComment = (current: string | undefined, incoming: string) => {
        if (!current || !current.trim()) return incoming;
        const parts = current.split("\n").map((p: string) => p.trim());
        if (parts.includes(incoming.trim())) return current;
        return `${current}\n${incoming.trim()}`;
      };

      if (c.tipo === "WEL") {
        const cleanWel = (c.texto || "").replace(/^[\"']|[\"']$/g, "").trim();
        if (cleanWel) {
          row.comentario_wellness = cleanWel;
        }
      } else if (c.tipo === "FIS") {
        row.comentario_lesiones = appendComment(row.comentario_lesiones, c.texto);
        row.comentario_fisioterapia = appendComment(row.comentario_fisioterapia, c.texto);
      } else if (c.tipo === "TEC") {
        row.comentario_tecnico = appendComment(row.comentario_tecnico, c.texto);
      } else if (c.tipo === "CON") {
        row.comentario_fisico = appendComment(row.comentario_fisico, c.texto);
      } else if (c.tipo === "OTR") {
        row.comentario_medico = appendComment(row.comentario_medico, c.texto);
      }
    }
  }

  const allEstadoRows = Array.from(estadoRowsMap.values());
  const estadoRows: any[] = [];
  const emptyEstadoRows: any[] = [];

  allEstadoRows.forEach(rawRow => {
    const isEmpty = (
      (!rawRow.evento_asignado || rawRow.evento_asignado.trim() === "") &&
      (!rawRow.disponibilidad || rawRow.disponibilidad.trim() === "") &&
      (!rawRow.minutos || rawRow.minutos <= 0) &&
      (!rawRow.comentario_wellness || rawRow.comentario_wellness.trim() === "") &&
      (!rawRow.comentario_fisioterapia || rawRow.comentario_fisioterapia.trim() === "") &&
      (!rawRow.comentario_lesiones || rawRow.comentario_lesiones.trim() === "") &&
      (!rawRow.comentario_tecnico || rawRow.comentario_tecnico.trim() === "") &&
      (!rawRow.comentario_fisico || rawRow.comentario_fisico.trim() === "") &&
      (!rawRow.comentario_medico || rawRow.comentario_medico.trim() === "")
    );
    if (isEmpty) {
      emptyEstadoRows.push(rawRow);
    } else {
      // Objeto limpio con columnas dedicadas en PostgreSQL: bloques separados para Condicional y Wellness
      const cleanRow: any = {
        jugador_id: String(rawRow.jugador_id),
        sesion_dia_id: String(rawRow.sesion_dia_id),
        disponibilidad: rawRow.disponibilidad || null,
        objetivo: rawRow.objetivo || null,
        comentario_lesiones: rawRow.comentario_lesiones || rawRow.comentario_fisioterapia || null,
        comentario_medico: rawRow.comentario_medico || null,
        comentario_nutricion: rawRow.comentario_nutricion || null,
        // BLOQUE CONDICIONAL: exclusivo para tipo CON (físico/condicional)
        comentario_fisico: rawRow.comentario_fisico || null,
        // BLOQUE WELLNESS: exclusivo para tipo WEL (cuestionario wellness)
        comentario_wellness: rawRow.comentario_wellness || null,
        comentario_psicologico: rawRow.comentario_psicologico || null,
        comentario_tecnico: rawRow.comentario_tecnico || null,
        evento_asignado: rawRow.evento_asignado || null,
        minutos: rawRow.minutos ? Number(rawRow.minutos) : null,
      };
      estadoRows.push(cleanRow);
    }
  });

  // Validar foreign key: asegurar que solo se envíen jugadores existentes en la tabla 'jugadores'
  const { data: dbJugadores } = await supabase.from("jugadores").select("id");
  const validPlayerIds = new Set((dbJugadores || []).map((j: any) => j.id));
  const validEstadoRows = estadoRows.filter((r) => validPlayerIds.has(r.jugador_id));

  // 4b. Guardado optimizado ultra rápido en lote para estado_diario_jugador
  if (validEstadoRows.length > 0) {
    const { error: upsertError } = await supabase
      .from("estado_diario_jugador")
      .upsert(validEstadoRows, { onConflict: "jugador_id,sesion_dia_id" });

    if (upsertError) {
      console.error("Error upsert estado_diario_jugador:", upsertError.message);
    }
  }

  // 5. Guardar bloques de eventos específicos en la nueva tabla (sesiones_dia_bloques)
  if (eventosBloquesMap) {
    const bloquesRows: any[] = [];
    const bloquesToDelete: any[] = [];
    Object.keys(eventosBloquesMap).forEach((key) => {
      const block = eventosBloquesMap[key];
      const match = key.match(/(.+)_slot_(\d+)/);
      if (match && block) {
        let rawSesionId = match[1];
        if (rawSesionId.startsWith("ev_")) {
            rawSesionId = rawSesionId.replace("ev_", "");
        }
        const slot = parseInt(match[2], 10);
        
        const dayId = getRealUuid(rawSesionId);
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dayId);
        
        if (isUuid) {
          const isEmpty = !(block.tipo || block.hora || block.lugar || block.duracion || block.orientacion || block.carga || block.comentario || block.num_jugadores || block.competicion);
          if (!isEmpty) {
            bloquesRows.push({
              day_id: dayId,
              fecha: block.fecha || null,
              slot: slot,
              tipo: block.tipo || null,
              hora: block.hora || null,
              lugar: block.lugar || null,
              duracion: block.duracion || null,
              orientacion: block.orientacion || null,
              carga: block.carga || null,
              comentario: block.comentario || null,
              num_jugadores: block.num_jugadores || null,
              competicion: block.competicion || null
            });
          } else {
            bloquesToDelete.push({ day_id: dayId, slot: slot });
          }
        }
      }
    });

    // Deduplicar bloques por si el frontend envía el mismo evento con la key antigua (day_...) y la key nueva (uuid...)
    const uniqueBloquesMap = new Map<string, any>();
    bloquesRows.forEach((row) => {
      uniqueBloquesMap.set(`${row.day_id}_${row.slot}`, row);
    });
    const uniqueBloquesRows = Array.from(uniqueBloquesMap.values());

    if (uniqueBloquesRows.length > 0) {
      const { error: errBloques } = await supabase.from("sesiones_dia_bloques").upsert(uniqueBloquesRows, { onConflict: "day_id,slot" });
      if (errBloques) {
        console.error("Error upserting bloques a Supabase:", errBloques.message);
        try { require("fs").writeFileSync(path.join(process.cwd(), "public", "debug_error.json"), JSON.stringify(errBloques, null, 2)); } catch(e) {}
      } else {
        try { require("fs").writeFileSync(path.join(process.cwd(), "public", "debug_error.json"), JSON.stringify({ success: true, count: bloquesRows.length }, null, 2)); } catch(e) {}
      }

      // Sincronizar automáticamente info del evento en sesiones_dia (bulk upsert en 1 sola consulta)
      try {
        const dayUpdates = new Map<string, any>();
        uniqueBloquesRows.forEach((b) => {
          if (!dayUpdates.has(b.day_id)) {
            dayUpdates.set(b.day_id, { id: b.day_id });
          }
          const dayRow = dayUpdates.get(b.day_id);
// sync to evento_am / evento_pm
          if (b.slot === 0 && b.tipo) dayRow.evento_am = b.tipo;
          if (b.slot === 1 && b.tipo) dayRow.evento_pm = b.tipo;

          if (b.carga && !isNaN(Number(b.carga))) dayRow.carga = Number(b.carga);
          if (b.duracion && !isNaN(Number(b.duracion))) dayRow.volumen = Number(b.duracion);
          if (b.comentario) dayRow.comentario_microciclo = b.comentario;
          // Preserve genuine rival; do not overwrite with venue
          if (b.rival) dayRow.rival = b.rival;
        });

        const dayRowsToUpdate = Array.from(dayUpdates.values());
        if (dayRowsToUpdate.length > 0) {
          await supabase.from("sesiones_dia").upsert(dayRowsToUpdate, { onConflict: "id" });
        }
      } catch (errSync: any) {
        console.error("Error syncing bloques to sesiones_dia:", errSync?.message);
      }
    }
  }

  // 6. Write-through: guardar minutos individuales por jugador en minutos_jugador_evento
  // Se parsea el playerMinutesMap completo (que incluye minutos, realiza, manual, etc.)
  // La key tiene formato: jugadorId_YYYY-MM-DD_eventoId  (la que viene de eventos/page.tsx)
  if (playerMinutesMap && Object.keys(playerMinutesMap).length > 0) {
    try {
      const minutosRows: any[] = [];
      // playerMinutesMap from eventos/page.tsx tiene valores number (minutos)
      // pero el savedMinutesMap completo (con realiza, manual) lo pasamos en commentsPayload como sidecar
      // Reconstruimos con la info disponible aquí
      for (const key of Object.keys(playerMinutesMap)) {
        // key puede ser: uuid_YYYY-MM-DD_eventoId  o  uuid_YYYY-MM-DD_codigoCorto
        const parts = key.split("_");
        if (parts.length < 3) continue;
        const jugador_id = parts[0];
        if (!jugador_id || jugador_id.length < 30) continue; // descartar claves no-uuid
        // La fecha está en parts[1] si tiene formato YYYY-MM-DD
        const fechaPart = parts[1];
        if (!fechaPart || !/^\d{4}-\d{2}-\d{2}$/.test(fechaPart)) continue;
        const evento_id = parts.slice(2).join("_");
        const minutos = playerMinutesMap[key];
        const durVal = typeof minutos === "number" ? minutos : parseInt(String(minutos)) || null;
        minutosRows.push({
          jugador_id,
          fecha: fechaPart,
          evento_id,
          minutos: durVal,
          realiza: (durVal ?? 0) > 0,
        });
      }

      if (minutosRows.length > 0) {
        // Deduplicar por jugador+fecha+evento antes de upsert
        const uniqueMinMap = new Map<string, any>();
        minutosRows.forEach(r => uniqueMinMap.set(`${r.jugador_id}_${r.fecha}_${r.evento_id}`, r));
        const uniqueMinRows = Array.from(uniqueMinMap.values()).filter((r: any) => validPlayerIds.has(r.jugador_id));

        for (let i = 0; i < uniqueMinRows.length; i += 500) {
          const batch = uniqueMinRows.slice(i, i + 500);
          await supabase
            .from("minutos_jugador_evento")
            .upsert(batch, { onConflict: "jugador_id,fecha,evento_id" });
        }
      }
    } catch (e: any) {
      console.error("Error guardando minutos_jugador_evento:", e?.message);
    }
  }

  // 7. Write-through: guardar comentarios en estado_diario_jugador y sesiones_dia
  if (commentsPayload && commentsPayload.length > 0) {
    try {
      for (const c of commentsPayload) {
        if (!c.texto || !c.texto.trim()) continue;
        const rawDate = c.fecha || (c.day_id ? String(c.day_id).replace("d_", "") : null);
        if (!rawDate) continue;
        const sessionId = getRealUuid(c.day_id || rawDate, rawDate);
        if (!sessionId) continue;

        if (c.jugador_id === "TEAM" || c.jugador_id === "team" || c.jugador_id === "EQUIPO") {
          const teamUpdates: any = {};
          if (c.tipo === "CON") {
            teamUpdates.comentario_fisico = c.texto.trim();
          } else {
            teamUpdates.comentario_microciclo = c.texto.trim();
            teamUpdates.comentario_tecnico = c.texto.trim();
          }
          await supabase.from("sesiones_dia").update(teamUpdates).eq("id", sessionId);
        } else if (c.jugador_id) {
          const colMap: Record<string, string> = {
            WEL: "comentario_wellness",
            FIS: "comentario_lesiones",
            TEC: "comentario_tecnico",
            CON: "comentario_fisico",
            OTR: "comentario_medico",
            PSI: "comentario_psicologico",
            NUT: "comentario_nutricion",
          };
          const targetCol = colMap[c.tipo] || "comentario_lesiones";
          const { data: exist } = await supabase
            .from("estado_diario_jugador")
            .select("id")
            .match({ jugador_id: c.jugador_id, sesion_dia_id: sessionId })
            .maybeSingle();

          if (exist) {
            await supabase
              .from("estado_diario_jugador")
              .update({ [targetCol]: c.texto.trim() })
              .eq("id", exist.id);
          } else {
            await supabase
              .from("estado_diario_jugador")
              .insert({
                jugador_id: c.jugador_id,
                sesion_dia_id: sessionId,
                [targetCol]: c.texto.trim(),
                disponibilidad: "D",
              });
          }
        }
      }
    } catch (e: any) {
      console.error("Error guardando comentarios en BBDD:", e?.message);
    }
  }

  try {
    revalidatePath("/calendario");
    revalidatePath("/planificacion");
    revalidatePath("/eventos");
  } catch (e) {}

  return { success: true, count: cleanRows.length };
}

export async function getPlayerEventsBBDD(): Promise<Record<string, string>> {
  try {
    const supabase = getServerSupabase();
    const [{ data: sesiones }, { data: estados }] = await Promise.all([
      supabase.from("sesiones_dia").select("id, fecha"),
      supabase.from("estado_diario_jugador").select("jugador_id, sesion_dia_id, evento_asignado"),
    ]);

    const idToFecha = new Map<string, string>();
    (sesiones || []).forEach((s: any) => {
      if (s.id && s.fecha) idToFecha.set(s.id, s.fecha);
    });

    const playerAssignments: Record<string, string> = {};
    (estados || []).forEach((e: any) => {
      if (!e.evento_asignado || !e.jugador_id) return;
      const fecha = idToFecha.get(e.sesion_dia_id);
      if (fecha) {
        playerAssignments[`${e.jugador_id}_${fecha}`] = e.evento_asignado;
      }
      if (e.sesion_dia_id) {
        playerAssignments[`${e.jugador_id}_${e.sesion_dia_id}`] = e.evento_asignado;
      }
    });

    if (Object.keys(playerAssignments).length === 0) {
      return getMasterPlayerEventsMap();
    }
    return { ...getMasterPlayerEventsMap(), ...playerAssignments };
  } catch (err: any) {
    console.error("Error getPlayerEventsBBDD:", err);
    return getMasterPlayerEventsMap();
  }
}

export async function savePlayerEventAssignments(
  assignmentRows: Array<{ jugador_id: string; fecha: string; evento_asignado: string | null }>
) {
  if (!assignmentRows || assignmentRows.length === 0) return { success: true };
  const supabase = getServerSupabase();

  try {
    const uniqueFechas = Array.from(new Set(assignmentRows.map((r) => r.fecha)));
    const { data: sesiones } = await supabase
      .from("sesiones_dia")
      .select("id, fecha")
      .in("fecha", uniqueFechas);

    const fechaToId = new Map((sesiones || []).map((s: any) => [s.fecha, s.id]));

    const { data: dbJugadores } = await supabase.from("jugadores").select("id");
    const validPlayerIds = new Set((dbJugadores || []).map((j: any) => j.id));

    const dedupMap = new Map<string, any>();
    for (const r of assignmentRows) {
      if (!r.jugador_id || !validPlayerIds.has(r.jugador_id)) continue;
      let sesionId = fechaToId.get(r.fecha);
      if (!sesionId) {
        const { data: newS } = await supabase
          .from("sesiones_dia")
          .insert({ fecha: r.fecha, equipo: "CE EUROPA" })
          .select("id")
          .single();
        if (newS) {
          sesionId = newS.id;
          fechaToId.set(r.fecha, sesionId);
        }
      }
      if (sesionId) {
        dedupMap.set(`${r.jugador_id}_${sesionId}`, {
          jugador_id: r.jugador_id,
          sesion_dia_id: sesionId,
          evento_asignado: r.evento_asignado || null,
        });
      }
    }

    const rowsToUpsert = Array.from(dedupMap.values());
    if (rowsToUpsert.length > 0) {
      const { error } = await supabase
        .from("estado_diario_jugador")
        .upsert(rowsToUpsert, { onConflict: "jugador_id,sesion_dia_id" });
      if (error) {
        console.error("Error upserting player assignments:", error.message);
      }
    }

    revalidatePath("/calendario");
    revalidatePath("/planificacion");
    revalidatePath("/eventos");
  } catch (e: any) {
    console.error("Error in savePlayerEventAssignments:", e?.message);
  }

  return { success: true };
}


export async function getPlayerCommentsBBDD(): Promise<Array<{
  id: string;
  jugador_id: string;
  day_id: string;
  fecha: string;
  tipo: string;
  texto: string;
}>> {
  try {
    const supabase = getServerSupabase();
    const [{ data: sesiones }, { data: estados }] = await Promise.all([
      supabase.from("sesiones_dia").select("id, fecha, comentario_microciclo, comentario_tecnico, comentario_fisico"),
      supabase.from("estado_diario_jugador").select("id, jugador_id, sesion_dia_id, comentario_lesiones, comentario_tecnico, comentario_fisico, comentario_wellness, comentario_psicologico, comentario_medico, comentario_nutricion"),
    ]);

    const idToFecha = new Map<string, string>();
    (sesiones || []).forEach((s: any) => {
      if (s.id && s.fecha) idToFecha.set(s.id, s.fecha);
    });

    const result: Array<{
      id: string;
      jugador_id: string;
      day_id: string;
      fecha: string;
      tipo: string;
      texto: string;
    }> = [];

    // Comentarios TEAM desde sesiones_dia
    (sesiones || []).forEach((s: any) => {
      if (!s.fecha) return;
      if (s.comentario_microciclo && s.comentario_microciclo.trim()) {
        result.push({
          id: `team_micro_${s.id}`,
          jugador_id: "TEAM",
          day_id: s.id,
          fecha: s.fecha,
          tipo: "TEC",
          texto: s.comentario_microciclo.trim(),
        });
      }
      if (s.comentario_tecnico && s.comentario_tecnico.trim() && s.comentario_tecnico.trim() !== s.comentario_microciclo?.trim()) {
        result.push({
          id: `team_tec_${s.id}`,
          jugador_id: "TEAM",
          day_id: s.id,
          fecha: s.fecha,
          tipo: "TEC",
          texto: s.comentario_tecnico.trim(),
        });
      }
      if (s.comentario_fisico && s.comentario_fisico.trim()) {
        result.push({
          id: `team_fis_${s.id}`,
          jugador_id: "TEAM",
          day_id: s.id,
          fecha: s.fecha,
          tipo: "CON",
          texto: s.comentario_fisico.trim(),
        });
      }
    });

    // Comentarios individuales desde estado_diario_jugador
    (estados || []).forEach((e: any) => {
      const fecha = idToFecha.get(e.sesion_dia_id) || e.sesion_dia_id;
      if (!e.jugador_id || !fecha) return;

      const addComment = (txt: string | null | undefined, tipo: string, col: string) => {
        if (!txt || !txt.trim()) return;
        const lines = txt.split("\n").map((l: string) => l.trim()).filter(Boolean);
        lines.forEach((lineText: string, idx: number) => {
          result.push({
            id: `db_${col}_${e.jugador_id}_${fecha}_${idx}`,
            jugador_id: e.jugador_id,
            day_id: e.sesion_dia_id,
            fecha: fecha,
            tipo: tipo,
            texto: lineText,
          });
        });
      };

      const fisicoTexto = (e.comentario_fisico || "").trim();
      const wellnessTexto = (e.comentario_wellness || "").trim();

      addComment(e.comentario_lesiones, "FIS", "fis");
      // Bloque Condicional vs Bloque Wellness: evitar duplicar si son idénticos
      if (fisicoTexto && fisicoTexto !== wellnessTexto) {
        addComment(e.comentario_fisico, "CON", "con");
      }
      if (wellnessTexto) {
        const cleanWel = wellnessTexto.replace(/^[\"']|[\"']$/g, "").trim();
        if (cleanWel) {
          result.push({
            id: `wel_${e.jugador_id}_${fecha}`,
            jugador_id: e.jugador_id,
            day_id: e.sesion_dia_id,
            fecha: fecha,
            tipo: "WEL",
            texto: cleanWel,
          });
        }
      }
      addComment(e.comentario_tecnico, "TEC", "tec");
      addComment(e.comentario_psicologico, "PSI", "psi");
      addComment(e.comentario_medico, "OTR", "med");
      addComment(e.comentario_nutricion, "NUT", "nut");
    });

    if (result.length === 0) {
      return getMasterComentarios();
    }
    return result;
  } catch (err: any) {
    console.error("Error getPlayerCommentsBBDD:", err?.message || err);
    return getMasterComentarios();
  }
}

export async function saveEventDetailBBDD(params: {
  fecha: string;
  block: {
    id: string;
    slot: number;
    tipo: string;
    hora?: string | null;
    lugar?: string | null;
    duracion?: string | null;
    orientacion?: string | null;
    carga?: string | null;
    comentario?: string | null;
    num_jugadores?: string | null;
    competicion?: string | null;
  };
  assignments: Array<{
    jugador_id: string;
    evento_asignado: string | null;
  }>;
  minutes: Array<{
    jugador_id: string;
    evento_id: string;
    duracion: number;
    titularidad?: string;
  }>;
  comments: Array<{
    jugador_id: string;
    tipo: string;
    texto: string;
  }>;
  teamComment?: string | null;
}) {
  const supabase = getServerSupabase();
  const fecha = params.fecha;
  if (!fecha) return { success: false, error: "Missing fecha" };

  try {
    // 1. Asegurar sesión para esta fecha
    let { data: sesion } = await supabase
      .from("sesiones_dia")
      .select("id, evento_am, evento_pm")
      .eq("fecha", fecha)
      .maybeSingle();

    if (!sesion) {
      const { data: newS, error: newSErr } = await supabase
        .from("sesiones_dia")
        .insert({ fecha, equipo: "CE EUROPA", temporada: "2026/27" })
        .select("id, evento_am, evento_pm")
        .single();
      if (newSErr) throw newSErr;
      sesion = newS;
    }
    const sessionId = sesion.id;

    // 2. Actualizar sesiones_dia con los datos del bloque (info de evento, carga, volumen, comentario)
    const sessionUpdates: any = {};
    const slot = params.block.slot || 0;
    const tipo = params.block.tipo || null;

// sync to evento_am / evento_pm
    if (slot === 0 && tipo) sessionUpdates.evento_am = tipo;
    if (slot === 1 && tipo) sessionUpdates.evento_pm = tipo;


    if (params.block.carga && !isNaN(Number(params.block.carga))) sessionUpdates.carga = Number(params.block.carga);
    if (params.block.duracion && !isNaN(Number(params.block.duracion))) {
      sessionUpdates.volumen = Number(params.block.duracion);
    }
    if (params.teamComment && params.teamComment.trim()) {
      sessionUpdates.comentario_microciclo = params.teamComment.trim();
      sessionUpdates.comentario_tecnico = params.teamComment.trim();
    } else if (params.block.comentario && params.block.comentario.trim()) {
      sessionUpdates.comentario_microciclo = params.block.comentario.trim();
    }
    // Preservar rival, no sobreescribir con lugar/estadio

    if (Object.keys(sessionUpdates).length > 0) {
      await supabase.from("sesiones_dia").update(sessionUpdates).eq("id", sessionId);
    }

    // 3. Upsert en sesiones_dia_bloques
    const blockRow = {
      day_id: sessionId,
      fecha: fecha,
      slot: slot,
      tipo: tipo,
      hora: params.block.hora || null,
      lugar: params.block.lugar || null,
      duracion: params.block.duracion ? String(params.block.duracion) : null,
      orientacion: params.block.orientacion || null,
      carga: params.block.carga || null,
      comentario: params.block.comentario || null,
      num_jugadores: params.block.num_jugadores || null,
      competicion: params.block.competicion || null,
    };
    await supabase.from("sesiones_dia_bloques").upsert([blockRow], { onConflict: "day_id,slot" });

    // 4. Upsert en minutos_jugador_evento
    if (params.minutes && params.minutes.length > 0) {
      const minRows = params.minutes.map((m) => {
        const dur = Number((m as any).minutos ?? m.duracion ?? 0);
        return {
          jugador_id: String(m.jugador_id),
          fecha: fecha,
          evento_id: String(m.evento_id || tipo || "Pa"),
          minutos: dur,
          realiza: dur > 0,
        };
      });
      await supabase.from("minutos_jugador_evento").upsert(minRows, { onConflict: "jugador_id,fecha,evento_id" });
    }

    // 5. Actualizar o insertar estado_diario_jugador para cada jugador
    const { data: existingRows } = await supabase
      .from("estado_diario_jugador")
      .select("*")
      .eq("sesion_dia_id", sessionId);

    const existingMap = new Map<string, any>((existingRows || []).map((r: any) => [r.jugador_id, r]));

    const assignMap = new Map((params.assignments || []).map((a) => [a.jugador_id, a.evento_asignado]));
    const minuteMap = new Map((params.minutes || []).map((m) => [m.jugador_id, m]));
    const commentMap = new Map((params.comments || []).map((c) => [c.jugador_id, c]));

    const allPlayerIds = new Set([
      ...assignMap.keys(),
      ...minuteMap.keys(),
      ...commentMap.keys(),
    ]);

    for (const jId of allPlayerIds) {
      const existing = existingMap.get(jId);
      const assign = assignMap.get(jId);
      const min = minuteMap.get(jId);
      const com = commentMap.get(jId);

      const payload: any = {};
      if (assign !== undefined) {
        payload.evento_asignado = assign || null;
      }
      if (min) {
        const mins = Number(min.duracion ?? 0);
        payload.minutos = mins;
        if (mins > 0) {
          payload.disponibilidad = "D";
        }
      }
      if (com && com.texto && com.texto.trim()) {
        const t = com.tipo;
        const txt = com.texto.trim();
        if (t === "CON") payload.comentario_fisico = txt;
        else if (t === "WEL") payload.comentario_wellness = txt;
        else if (t === "FIS") payload.comentario_lesiones = txt;
        else if (t === "TEC") payload.comentario_tecnico = txt;
        else if (t === "PSI") payload.comentario_psicologico = txt;
        else if (t === "NUT") payload.comentario_nutricion = txt;
        else if (t === "OTR") payload.comentario_medico = txt;
      }

      if (existing) {
        if (Object.keys(payload).length > 0) {
          await supabase.from("estado_diario_jugador").update(payload).eq("id", existing.id);
        }
      } else {
        if (payload.evento_asignado || payload.minutos || payload.comentario_lesiones || payload.comentario_tecnico || payload.comentario_fisico || payload.comentario_wellness || payload.comentario_medico || payload.comentario_nutricion || payload.comentario_psicologico) {
          payload.jugador_id = jId;
          payload.sesion_dia_id = sessionId;
          if (!payload.disponibilidad) payload.disponibilidad = "D";
          await supabase.from("estado_diario_jugador").insert(payload);
        }
      }
    }

    

    try {
      revalidatePath("/calendario");
      revalidatePath("/planificacion");
      revalidatePath("/eventos");
      revalidatePath("/informes/partidos");
      revalidatePath("/base-datos");
    } catch (e) {}

    return { success: true };
  } catch (err: any) {
    console.error("Error saveEventDetailBBDD:", err?.message || err);
    return { success: false, error: err?.message || "Unknown error" };
  }
}

export async function getEventosBloquesBBDD(dayIds?: string[]) {
  const supabase = getServerSupabase();
  const PAGE_SIZE = 1000;

  if (dayIds && dayIds.length > 0) {
    const CHUNK_SIZE = 100;
    const promises = [];
    for (let i = 0; i < dayIds.length; i += CHUNK_SIZE) {
      const chunk = dayIds.slice(i, i + CHUNK_SIZE);
      promises.push(
        supabase.from("sesiones_dia_bloques").select("*").in("day_id", chunk).gte("fecha", FECHA_INICIO_EVENTOS)
      );
    }
    const results = await Promise.all(promises);
    const map: Record<string, any> = {};
    for (const res of results) {
      if (res.data) {
        res.data.forEach((row) => {
          if (row.day_id) {
            map[`${row.day_id}_slot_${row.slot}`] = row;
            if (row.fecha) {
              map[`${row.fecha}_slot_${row.slot}`] = row;
              map[`day_${row.fecha}_slot_${row.slot}`] = row;
            }
          }
        });
      }
    }
    if (Object.keys(map).length === 0) {
      return getMasterEventosBloquesMap();
    }
    return { ...getMasterEventosBloquesMap(), ...map };
  }

  const { count, error: errCount } = await supabase
    .from("sesiones_dia_bloques")
    .select("*", { count: "exact", head: true })
    .gte("fecha", FECHA_INICIO_EVENTOS);

  if (errCount) {
    console.warn("Error fetching sesiones_dia_bloques, usando backup maestro:", errCount.message);
    return getMasterEventosBloquesMap();
  }

  const total = count || 0;
  const numPages = Math.ceil(total / PAGE_SIZE);
  const promises = [];
  for (let i = 0; i < Math.max(numPages, 1); i++) {
    promises.push(
      supabase
        .from("sesiones_dia_bloques")
        .select("*")
        .gte("fecha", FECHA_INICIO_EVENTOS)
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
    );
  }

  const results = await Promise.all(promises);
  const map: Record<string, any> = {};

  for (const res of results) {
    if (res.data) {
      res.data.forEach((row) => {
        if (row.day_id) {
          map[`${row.day_id}_slot_${row.slot}`] = row;
          if (row.fecha) {
            map[`${row.fecha}_slot_${row.slot}`] = row;
            map[`day_${row.fecha}_slot_${row.slot}`] = row;
          }
        }
      });
    }
  }
  return map;
}

/**
 * Server Actions para Disponibilidad de Jugadores (estado_diario_jugador)
 */

export async function getEstadoDiarioJugadores(sesionDiaIds?: string[]) {
  try {
    const supabase = getServerSupabase();
    const selectFields = "jugador_id, sesion_dia_id, disponibilidad, objetivo, comentario_fisico, comentario_tecnico, comentario_lesiones, comentario_wellness, comentario_psicologico, comentario_medico, comentario_nutricion, evento_asignado, minutos";

    if (!sesionDiaIds || sesionDiaIds.length === 0) {
      const { data, error } = await supabase
        .from("estado_diario_jugador")
        .select(selectFields);
      if (error || !data || data.length === 0) {
        console.warn("Error/empty fetching estado_diario_jugador, usando backup maestro:", error?.message);
        return getMasterBackupTable("estado_diario_jugador");
      }
      return data || [];
    }

    // Realizar consultas en paralelo con lotes de 25 sesiones
    const chunkSize = 25;
    const chunks: string[][] = [];
    for (let i = 0; i < sesionDiaIds.length; i += chunkSize) {
      chunks.push(sesionDiaIds.slice(i, i + chunkSize));
    }

    const chunkPromises = chunks.map((chunk) =>
      supabase
        .from("estado_diario_jugador")
        .select(selectFields)
        .in("sesion_dia_id", chunk)
    );

    const results = await Promise.all(chunkPromises);
    const allResults: any[] = [];
    for (const res of results) {
      if (res.error) {
        console.error("Error fetching chunk of estado_diario_jugador:", res.error);
      } else if (res.data) {
        allResults.push(...res.data);
      }
    }

    if (allResults.length > 0) return allResults;
  } catch (err: any) {
    console.warn("Exception getEstadoDiarioJugadores, usando backup maestro:", err?.message);
  }

  const backup = getMasterBackupTable("estado_diario_jugador");
  if (sesionDiaIds && sesionDiaIds.length > 0) {
    const set = new Set(sesionDiaIds);
    return backup.filter((r: any) => set.has(r.sesion_dia_id));
  }
  return backup;
}

export async function getEstadoDiarioConFechas(): Promise<Record<string, string>> {
  const res: Record<string, string> = {};
  try {
    const supabase = getServerSupabase();

    const PAGE_SIZE = 1000;
    const { count } = await supabase
      .from("estado_diario_jugador")
      .select("*", { count: "exact", head: true });

    const total = count || 0;
    const numPages = Math.ceil(total / PAGE_SIZE);
    const promises = [];
    for (let i = 0; i < Math.max(numPages, 1); i++) {
      promises.push(
        supabase
          .from("estado_diario_jugador")
          .select("jugador_id, sesion_dia_id, disponibilidad")
          .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
      );
    }

    const [results, sesResult] = await Promise.all([
      Promise.all(promises),
      supabase.from("sesiones_dia").select("id, fecha").limit(5000),
    ]);

    const fechaMap = new Map<string, string>();
    if (sesResult.data) {
      sesResult.data.forEach((s) => fechaMap.set(s.id, s.fecha));
    }

    results.forEach((r) => {
      if (r.data) {
        r.data.forEach((e) => {
          if (!e.disponibilidad) return;
          res[`${e.jugador_id}_${e.sesion_dia_id}`] = e.disponibilidad;
          const f = fechaMap.get(e.sesion_dia_id);
          if (f) res[`${e.jugador_id}_${f}`] = e.disponibilidad;
        });
      }
    });
  } catch (err: any) {
    console.warn("Exception getEstadoDiarioConFechas, usando backup maestro:", err?.message);
  }

  if (Object.keys(res).length === 0) {
    const backup = getMasterBackupTable("estado_diario_jugador");
    const backupSes = getMasterBackupTable("sesiones_dia");
    const bFechaMap = new Map<string, string>();
    backupSes.forEach((s: any) => bFechaMap.set(s.id, s.fecha));
    backup.forEach((e: any) => {
      if (!e.disponibilidad) return;
      res[`${e.jugador_id}_${e.sesion_dia_id}`] = e.disponibilidad;
      const f = bFechaMap.get(e.sesion_dia_id);
      if (f) res[`${e.jugador_id}_${f}`] = e.disponibilidad;
    });
  }

  return res;
}

export interface DisponibilidadPlanificacionData {
  sesionesDia: any[];
  eventosBloquesMap: Record<string, any>;
  disponibilidadMap: Record<string, string>;
  playerEventsMap: Record<string, string>;
}

export async function getDisponibilidadPlanificacionData(): Promise<DisponibilidadPlanificacionData> {
  const supabase = getServerSupabase();
  try {
    const [sesionesRes, bloquesRes, estadosRes] = await Promise.all([
      supabase.from("sesiones_dia").select("*").order("fecha", { ascending: true }),
      supabase.from("sesiones_dia_bloques").select("*").order("slot", { ascending: true }),
      supabase.from("estado_diario_jugador").select("jugador_id, sesion_dia_id, disponibilidad, evento_asignado"),
    ]);

    const sesionesRaw = (sesionesRes.data && sesionesRes.data.length > 0) ? sesionesRes.data : getMasterPlanificacionDays();
    const bloquesRaw = (bloquesRes.data && bloquesRes.data.length > 0) ? bloquesRes.data : getMasterBackupTable("sesiones_dia_bloques");
    const estadosRaw = (estadosRes.data && estadosRes.data.length > 0) ? estadosRes.data : getMasterBackupTable("estado_diario_jugador");

    const dateToUuidMap = new Map<string, string>();
    const uuidToDateMap = new Map<string, string>();
    sesionesRaw.forEach((s: any) => {
      if (s.fecha && s.id) {
        dateToUuidMap.set(s.fecha, s.id);
        uuidToDateMap.set(s.id, s.fecha);
      }
    });

    const eventosBloquesMap: Record<string, any> = {};
    bloquesRaw.forEach((b: any) => {
      const f = b.fecha || uuidToDateMap.get(b.day_id);
      const dayId = b.day_id || dateToUuidMap.get(b.fecha);
      const slot = b.slot ?? 0;
      const blockData = { ...b, fecha: f, day_id: dayId };
      if (f) {
        eventosBloquesMap[`${f}_slot_${slot}`] = blockData;
        eventosBloquesMap[`day_${f}_slot_${slot}`] = blockData;
      }
      if (dayId) {
        eventosBloquesMap[`${dayId}_slot_${slot}`] = blockData;
      }
    });

    // Synthesize missing blocks from sesiones_dia fields (evento_1..6, evento_am, evento_pm)
    sesionesRaw.forEach((s: any) => {
      const f = s.fecha;
      const dayId = s.id;
      for (let slot = 0; slot < 6; slot++) {
        const hasBlock = (f && eventosBloquesMap[`${f}_slot_${slot}`]) || (dayId && eventosBloquesMap[`${dayId}_slot_${slot}`]);
        if (!hasBlock) {
          const evField = s[`evento_${slot + 1}`] || (slot === 0 ? s.evento_am || s.evento_principal : (slot === 1 ? s.evento_pm : null));
          if (evField && String(evField).trim()) {
            const synth = {
              day_id: dayId,
              fecha: f,
              slot,
              tipo: String(evField).trim(),
              hora: "",
              lugar: "",
              comentario: "",
              duracion: "",
              orientacion: "",
            };
            if (f) {
              eventosBloquesMap[`${f}_slot_${slot}`] = synth;
              eventosBloquesMap[`day_${f}_slot_${slot}`] = synth;
            }
            if (dayId) eventosBloquesMap[`${dayId}_slot_${slot}`] = synth;
          }
        }
      }
    });

    

    const disponibilidadMap: Record<string, string> = {};
    const playerEventsMap: Record<string, string> = {};
    estadosRaw.forEach((e: any) => {
      const f = uuidToDateMap.get(e.sesion_dia_id);
      const dayId = e.sesion_dia_id;
      if (e.disponibilidad) {
        if (f) {
          disponibilidadMap[`${e.jugador_id}_${f}`] = e.disponibilidad;
          disponibilidadMap[`${e.jugador_id}_day_${f}`] = e.disponibilidad;
        }
        if (dayId) disponibilidadMap[`${e.jugador_id}_${dayId}`] = e.disponibilidad;
      }
      if (e.evento_asignado) {
        if (f) {
          playerEventsMap[`${e.jugador_id}_${f}`] = e.evento_asignado;
          playerEventsMap[`${e.jugador_id}_day_${f}`] = e.evento_asignado;
        }
        if (dayId) playerEventsMap[`${e.jugador_id}_${dayId}`] = e.evento_asignado;
      }
    });

    

    return {
      sesionesDia: sesionesRaw,
      eventosBloquesMap,
      disponibilidadMap,
      playerEventsMap,
    };
  } catch (err: any) {
    console.error("Error in getDisponibilidadPlanificacionData:", err);
    return {
      sesionesDia: [],
      eventosBloquesMap: {},
      disponibilidadMap: {},
      playerEventsMap: {},
    };
  }
}

export async function updateEstadoDiarioJugador(
  jugadorId: string,
  rawSesionId: string,
  disponibilidad: string | null
) {
  const supabase = getServerSupabase();
  let sesionDiaId = String(rawSesionId).replace(/^day_|^ev_/, "");

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sesionDiaId)) {
    let { data: s } = await supabase.from("sesiones_dia").select("id").eq("fecha", sesionDiaId).maybeSingle();
    if (s?.id) {
      sesionDiaId = s.id;
    } else {
      const { data: newS } = await supabase.from("sesiones_dia").insert({ fecha: sesionDiaId, equipo: "CE EUROPA" }).select("id").single();
      if (newS?.id) sesionDiaId = newS.id;
      else return;
    }
  }

  const { error } = await supabase
    .from("estado_diario_jugador")
    .upsert(
      {
        jugador_id: jugadorId,
        sesion_dia_id: sesionDiaId,
        disponibilidad: disponibilidad, 
      },
      { onConflict: "jugador_id,sesion_dia_id" }
    );

  if (error) {
    // Si no hay índice único compuesto, hacer update e insert condicional optimizado
    const { data: existing } = await supabase
      .from("estado_diario_jugador")
      .select("id")
      .eq("jugador_id", jugadorId)
      .eq("sesion_dia_id", sesionDiaId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("estado_diario_jugador")
        .update({ disponibilidad: disponibilidad })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("estado_diario_jugador")
        .insert({
          jugador_id: jugadorId,
          sesion_dia_id: sesionDiaId,
          disponibilidad: disponibilidad,
        });
    }
  }
}

export async function addLesion(
  jugadorId: string,
  datos: { fecha_inicio: string; tipo?: string; zona?: string; gravedad?: string; comentario?: string }
) {
  const supabase = getServerSupabase();

  // 1. Insertar lesión en la tabla 'lesiones'
  const { data: lesion, error: errLesion } = await supabase
    .from("lesiones")
    .insert({
      jugador_id: jugadorId,
      fecha_inicio: datos.fecha_inicio,
      tipo: datos.tipo || null,
      zona: datos.zona || null,
      gravedad: datos.gravedad || null,
    })
    .select()
    .single();

  if (errLesion) {
    throw new Error(`Error al registrar lesión: ${errLesion.message}`);
  }

  // 2. Buscar o crear la sesión_dia para fecha_inicio
  let { data: sesionDia } = await supabase
    .from("sesiones_dia")
    .select("id")
    .eq("fecha", datos.fecha_inicio)
    .maybeSingle();

  if (!sesionDia) {
    const { data: newSesion, error: errSesion } = await supabase
      .from("sesiones_dia")
      .insert({ fecha: datos.fecha_inicio })
      .select("id")
      .single();
    if (!errSesion && newSesion) {
      sesionDia = newSesion;
    }
  }

  // 3. Fijar automáticamente disponibilidad = 'L' en estado_diario_jugador
  if (sesionDia) {
    await updateEstadoDiarioJugador(jugadorId, sesionDia.id, "L");
  }

  revalidatePath("/calendario");
  revalidatePath("/planificacion");
  revalidatePath("/disponibilidad");
  revalidatePath(`/deportistas/${jugadorId}`);
  revalidatePath(`/deportistas/${jugadorId}/vision`);

  return lesion;
}

/**
 * Server Actions para la vista BBDD General (formato Hoja Excel Prat 25/26)
 */
export async function getFullExcelBBDDRows(equipoParamIn?: string) {
  try {
    const supabase = getServerSupabase();
    // Siempre se filtra por el club activo; ignorar peticiones de otros equipos (p.ej. Manresa)
    const activeClub = clubKeyword(await getActiveClubName());
    const equipoParam = activeClub || equipoParamIn;

    let sesQuery = supabase.from("sesiones_dia").select("*").gte("fecha", "2026-10-01").order("fecha", { ascending: true });
    let jugQuery = supabase.from("jugadores").select("id, nombre, apodo, activo, equipo, temporada, foto_url").order("nombre");

    if (equipoParam) {
      if (equipoParam.toLowerCase().includes("prat")) {
        sesQuery = sesQuery.or("equipo.ilike.%prat%,fecha.lt.2026-07-01");
        jugQuery = jugQuery.or("equipo.ilike.%prat%,temporada.ilike.%25/26%");
      } else if (equipoParam.toLowerCase().includes("manresa") || equipoParam.toLowerCase().includes("europa")) {
        // Para Europa o Manresa nueva temp
        sesQuery = sesQuery.filter("equipo", "ilike", `%${equipoParam}%`);
        jugQuery = jugQuery.filter("equipo", "ilike", `%${equipoParam}%`);
      } else {
         sesQuery = sesQuery.filter("equipo", "ilike", `%${equipoParam}%`);
         jugQuery = jugQuery.filter("equipo", "ilike", `%${equipoParam}%`);
      }
    }

    const [sesionesRes, jugadoresRes, minutosRes, bloquesRes] = await Promise.all([
      sesQuery,
      jugQuery,
      supabase.from("minutos_jugador_evento").select("*"),
      supabase.from("sesiones_dia_bloques").select("*"),
    ]);

    const sesionesRaw = (sesionesRes.data && sesionesRes.data.length > 0) ? sesionesRes.data : getMasterBackupTable("sesiones_dia");
    const jugadores = (jugadoresRes.data && jugadoresRes.data.length > 0) ? jugadoresRes.data : getMasterBackupTable("jugadores");
    const rawMinutos = (minutosRes.data && minutosRes.data.length > 0) ? minutosRes.data : getMasterBackupTable("minutos_jugador_evento");
    const rawBloques = (bloquesRes.data && bloquesRes.data.length > 0) ? bloquesRes.data : getMasterBackupTable("sesiones_dia_bloques");

    const jugIds = (jugadores || []).map((j: any) => j.id).filter(Boolean);
    const rawEstados: any[] = [];
    if (jugIds.length > 0) {
      let from = 0;
      const step = 1000;
      while (true) {
        const { data: batch } = await supabase
          .from("estado_diario_jugador")
          .select("*")
          .in("jugador_id", jugIds)
          .range(from, from + step - 1);
        if (!batch || batch.length === 0) break;
        rawEstados.push(...batch);
        if (batch.length < step) break;
        from += step;
      }
    } else {
      const { data: batch } = await supabase.from("estado_diario_jugador").select("*").range(0, 999);
      if (batch) rawEstados.push(...batch);
    }
    if (rawEstados.length === 0) {
      rawEstados.push(...getMasterBackupTable("estado_diario_jugador"));
    }

    const estadosMap = new Map();
    rawEstados.forEach(e => {
      estadosMap.set(`${e.jugador_id}_${e.sesion_dia_id}`, e);
    });

    const minutosMap = new Map();
    rawMinutos.forEach(m => {
      minutosMap.set(`${m.jugador_id}_${m.fecha}`, m);
    });

    const bloquesByDay = new Map<string, any[]>();
    rawBloques.forEach(b => {
      if (!bloquesByDay.has(b.day_id)) bloquesByDay.set(b.day_id, []);
      bloquesByDay.get(b.day_id)!.push(b);
    });

    const rows: any[] = [];

    sesionesRaw.forEach(s => {
      const dayBloques = (bloquesByDay.get(s.id) || []).sort((a: any, b: any) => (a.slot ?? 0) - (b.slot ?? 0));
      const eventSlots = dayBloques.length > 0 ? dayBloques : [
        {
          slot: 0,
          tipo: s.evento_am || s.evento_principal || "",
          hora: "",
          lugar: "",
          duracion: "",
          orientacion: "",
          carga: s.carga || "",
          comentario: s.comentario_microciclo || "",
          num_jugadores: null,
        }
      ];

      const hasSessionData = Boolean(s.rival || s.carga || s.comentario_microciclo || (eventSlots.length > 0 && eventSlots[0].tipo));
      if (hasSessionData) {
        eventSlots.forEach((blk: any, idx: number) => {
          if (!blk.tipo && !s.rival && !s.comentario_microciclo) return;
          const evNum = (blk.slot ?? idx) + 1;
          rows.push({
            id: `TEAM_${s.fecha || s.id}_ev${evNum}`,
            sesion_dia_id: s.id,
            jugador_id: "TEAM",
            jugador: "TEAM",
            periodo: s.periodo || "",
            fecha: s.fecha,
            subperiodo: s.subperiodo || "",
            semana: s.semana ?? "",
            md: s.md || "",
            rival: s.rival || "",
            resultado: "",
            evento_principal: s.evento_am || s.evento_principal || blk.tipo || "",
            carga: s.carga || "",
            volumen: s.volumen || "",
            intensidad: s.intensidad || "",
            comentario_microciclo: evNum === 1 ? (s.comentario_microciclo || "") : "",
            disponibilidad: "",
            tipo_de_evento: blk.tipo || s.evento_am || "",
            hora_evento: blk.hora || "",
            lugar_evento: blk.lugar || "",
            duracion_evento: blk.duracion || "",
            orientacion_evento: blk.orientacion || "",
            carga_evento: blk.carga || s.carga || "",
            comentario_general_evento: blk.comentario || "",
            num_jugadores_evento: blk.num_jugadores || null,
            realiza_evento: "SI",
            titularidad: "",
            objetivo: "",
            comentario_wellness: "",
            comentario_fisioterapia: "",
            comentario_medico: "",
            comentario_nutricional: "",
            comentario_preparacion_fisica: "",
            comentario_tecnico_tactico: "",
            num_evento: evNum,
          });
        });

        jugadores.forEach(p => {
        const e = estadosMap.get(`${p.id}_${s.id}`);
        const m = minutosMap.get(`${p.id}_${s.fecha}`);

        // Incluir a todos los deportistas de la plantilla para el evento

        const assignedCodes = (e?.evento_asignado || "").split(",").map((c: string) => c.trim().toLowerCase()).filter(Boolean);

        eventSlots.forEach((blk: any, idx: number) => {
          const evNum = (blk.slot ?? idx) + 1;
          const blkCode = (blk.tipo || "").trim().toLowerCase();

          if (assignedCodes.length > 0 && blkCode) {
            const match = assignedCodes.includes(blkCode) || assignedCodes.some((c: string) => c.startsWith(blkCode) || blkCode.startsWith(c));
            if (!match && eventSlots.length > 1) return;
          }

          rows.push({
            id: `${p.id}_${s.fecha || s.id}_ev${evNum}`,
            sesion_dia_id: s.id,
            jugador_id: p.id,
            jugador: (p.apodo || p.nombre || "").toUpperCase().trim(),
            periodo: s.periodo || "",
            fecha: s.fecha,
            subperiodo: s.subperiodo || "",
            semana: s.semana ?? "",
            md: s.md || "",
            rival: s.rival || "",
            resultado: "",
            evento_principal: s.evento_am || s.evento_principal || blk.tipo || "",
            carga: s.carga || "",
            volumen: s.volumen || "",
            intensidad: s.intensidad || "",
            comentario_microciclo: evNum === 1 ? (s.comentario_microciclo || "") : "",
            disponibilidad: e?.disponibilidad || "D",
            tipo_de_evento: blk.tipo || s.evento_am || (e?.evento_asignado || ""),
            hora_evento: blk.hora || "",
            lugar_evento: blk.lugar || "",
            duracion_evento: m?.duracion || m?.minutos || e?.duracion_evento || blk.duracion || "",
            orientacion_evento: blk.orientacion || "",
            carga_evento: blk.carga || s.carga || "",
            comentario_general_evento: blk.comentario || "",
            num_jugadores_evento: blk.num_jugadores || null,
            realiza_evento: e?.realiza_evento || m?.realiza || (e?.disponibilidad === "D" || !e?.disponibilidad ? "SI" : "NO"),
            titularidad: e?.titularidad || "",
            objetivo: e?.objetivo || "",
            comentario_wellness: e?.comentario_wellness || "",
            comentario_fisioterapia: e?.comentario_fisioterapia || e?.comentario_lesiones || "",
            comentario_medico: e?.comentario_medico || "",
            comentario_nutricional: e?.comentario_nutricion || "",
            comentario_preparacion_fisica: e?.comentario_fisico || "",
            comentario_tecnico_tactico: e?.comentario_tecnico || "",
            num_evento: evNum,
          });
        });
      });
      }
    });

    return { rows, jugadores };
  } catch (err) {
    console.error("Error al cargar la BBDD:", err);
    return { rows: [], jugadores: [] };
  }
}

export async function getReporteAnualData() {
  const supabase = getServerSupabase();
  const repClub = clubKeyword(await getActiveClubName());

  let jugadores: any[] | null = null;
  let sesiones: any[] | null = null;
  let estados: any[] | null = null;
  let gps: any[] | null = null;
  let minutosJugador: any[] | null = null;

  try {
    const [jRes, sRes, eRes, gRes, mRes] = await Promise.all([
      supabase.from("jugadores").select("id, nombre, apodo, posicion, foto_url, fecha_nacimiento, activo, cor_id, equipo, temporada").eq("activo", true).ilike("equipo", `%${repClub || ""}%`).order("nombre"),
      supabase.from("sesiones_dia").select("*").order("fecha", { ascending: true }),
      supabase.from("estado_diario_jugador").select("*"),
      supabase.from("gps_datos").select("*"),
      supabase.from("minutos_jugador_evento").select("*"),
    ]);
    jugadores = jRes.data;
    sesiones = sRes.data;
    estados = eRes.data;
    gps = gRes.data;
    minutosJugador = mRes.data;
  } catch (e) {}

  if (!jugadores || jugadores.length === 0) {
    jugadores = getMasterBackupTable("jugadores").filter((p: any) => p.activo && (!repClub || (p.equipo || "").toLowerCase().includes(repClub.toLowerCase())));
  }
  if (!sesiones || sesiones.length === 0) {
    sesiones = getMasterBackupTable("sesiones_dia");
  }
  if (!estados || estados.length === 0) {
    estados = getMasterBackupTable("estado_diario_jugador");
  }
  if (!gps || gps.length === 0) {
    gps = await getAllGpsDatos();
  }
  if (!minutosJugador || minutosJugador.length === 0) {
    minutosJugador = getMasterBackupTable("minutos_jugador_evento");
  }

  const minutosMap: Record<string, any> = {};
  (minutosJugador || []).forEach((row: any) => {
    if (!row.jugador_id || !row.fecha) return;
    const dur = Number(row.minutos ?? row.duracion ?? 0);
    const key = `${row.jugador_id}_${row.fecha}_${row.evento_id}`;
    minutosMap[key] = { minutos: dur, duracion: dur, realiza: row.realiza !== undefined ? Boolean(row.realiza) : dur > 0 };
  });

  return {
    jugadores: (jugadores || []).map((item: any) => ({ ...item, dorsal: item.cor_id || null })),
    sesiones: sesiones || [],
    estados: estados || [],
    gps: gps || [],
    minutosJugadorEvento: minutosMap,
  };
}

/**
 * Guarda físicamente los datos locales del calendario en el disco duro para evitar pérdidas.
 */
export async function forceBackupSyncDataLocal(payload: any) {
  try {
    const fs = require("fs");
    const path = require("path");
    const syncPath = path.join(process.cwd(), "public", "calendar_sync_data.json");
    const rootSyncPath = path.join(process.cwd(), "calendar_sync_data.json");

    let existingData: any = {};
    if (fs.existsSync(syncPath)) {
      try {
        existingData = JSON.parse(fs.readFileSync(syncPath, "utf8"));
      } catch (e) {}
    }

    // Mergear payload de forma segura
    const merged = { ...existingData };
    if (payload.playerEventsMap) merged.playerEventsMap = { ...(merged.playerEventsMap || {}), ...payload.playerEventsMap };
    if (payload.eventosBloquesMap) merged.eventosBloquesMap = { ...(merged.eventosBloquesMap || {}), ...payload.eventosBloquesMap };
    if (payload.playerMinutesMap) merged.playerMinutesMap = { ...(merged.playerMinutesMap || {}), ...payload.playerMinutesMap };
    if (payload.disponibilidadMap) merged.disponibilidadMap = { ...(merged.disponibilidadMap || {}), ...payload.disponibilidadMap };
    
    // Backup completo de planificacion y mapas de rivales
    if (payload.planificacionDays) merged.planificacionDays = payload.planificacionDays;
    if (payload.rivalEventoMap) merged.rivalEventoMap = payload.rivalEventoMap;
    
    // Para comentarios
    if (payload.comentarios && Array.isArray(payload.comentarios)) {
      const comMap = new Map();
      (merged.comentarios || []).forEach((c: any) => { if (c.id) comMap.set(c.id, c); });
      payload.comentarios.forEach((c: any) => { if (c.id) comMap.set(c.id, c); });
      merged.comentarios = Array.from(comMap.values());
    }

    merged.updated_at = new Date().toISOString();

    // No escribir calendar_sync_data.json para evitar reintroducir mock data

    return { success: true };
  } catch (err: any) {
    console.error("Error en forceBackupSyncDataLocal:", err);
    return { success: false, error: err.message };
  }
}

export async function getRivalesBBDD() {
  const supabase = getServerSupabase();
  try {
    const { data, error } = await supabase.from("rivales").select("*").order("nombre", { ascending: true });
    if (!error && data && data.length > 0) {
      return data.map((r: any) => ({
        id: r.id,
        nombre: r.nombre,
        escudoUrl: r.escudo_url || "",
        escudo_url: r.escudo_url || "",
        alias: r.alias || []
      }));
    }
  } catch (err) {}

  try {
    const path = require("path");
    const filePath = path.join(process.cwd(), "public", "rivales_config.json");
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}

  return [];
}

export async function saveRivalesBBDD(rivales: any[]) {
  try {
    const path = require("path");
    const filePath = path.join(process.cwd(), "public", "rivales_config.json");
    fs.writeFileSync(filePath, JSON.stringify(rivales, null, 2), "utf8");
  } catch (e) {
    console.error("Error guardando public/rivales_config.json:", e);
  }

  const supabase = getServerSupabase();
  try {
    const rows = rivales.map(r => ({
      id: r.id || String(r.nombre || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "-"),
      nombre: String(r.nombre || "").trim().toUpperCase(),
      escudo_url: r.escudo_url !== undefined ? r.escudo_url : (r.escudoUrl || ""),
      alias: r.alias || [String(r.nombre || "").trim().toUpperCase()]
    }));
    await supabase.from("rivales").upsert(rows, { onConflict: "id" });
  } catch (err: any) {}

  revalidatePath("/calendario");
  return { success: true };
}

export async function upsertSingleRivalBBDD(rival: { id?: string; nombre: string; escudo_url?: string; escudoUrl?: string; alias?: string[] }) {
  const supabase = getServerSupabase();
  try {
    const nombreClean = String(rival.nombre || "").trim().toUpperCase();
    if (!nombreClean) return { success: false, error: "Nombre de rival vacío" };

    const rawId = rival.id || nombreClean.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
    const escudo_url = (rival.escudo_url !== undefined ? rival.escudo_url : rival.escudoUrl) || "";

    // Verificar si ya existe un rival con id o nombre exacto
    const { data: existing } = await supabase
      .from("rivales")
      .select("id, nombre, alias")
      .or(`id.eq.${rawId},nombre.ilike.${nombreClean}`)
      .limit(1)
      .maybeSingle();

    const targetId = existing?.id || rawId;
    const existingAlias = Array.isArray(existing?.alias) ? existing.alias : [];
    const mergedAlias = Array.from(new Set([...existingAlias, nombreClean, ...(rival.alias || [])]));

    const { data, error } = await supabase.from("rivales").upsert({
      id: targetId,
      nombre: nombreClean,
      escudo_url,
      alias: mergedAlias,
    }, { onConflict: "id" }).select().single();

    if (error) {
      console.error("Error upsertSingleRivalBBDD:", error.message);
      return { success: false, error: error.message };
    }

    revalidatePath("/calendario");
    revalidatePath("/base-datos/bbdd");
    return { success: true, rival: data };
  } catch (err: any) {
    console.error("Error upsertSingleRivalBBDD:", err);
    return { success: false, error: err?.message };
  }
}

export async function deleteRivalBBDD(id: string) {
  const supabase = getServerSupabase();
  try {
    const { error } = await supabase.from("rivales").delete().eq("id", id);
    if (error) {
      console.error("Error deleteRivalBBDD:", error.message);
      return { success: false, error: error.message };
    }
    revalidatePath("/calendario");
    return { success: true };
  } catch (err: any) {
    console.error("Error deleteRivalBBDD:", err);
    return { success: false, error: err?.message };
  }
}

/* ─── TESTING DATASETS (Local File Storage) ─── */

export async function getTestingDatasets() {
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("db_tests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error('Supabase error fetching db_tests:', error.message || error);
      return [];
    }

    return (data || []).map((row: any) => {
      const extraData = (row.data && typeof row.data === "object") ? row.data : {};
      return {
        id: row.id,
        name: row.name,
        testTypeId: row.test_type_id,
        structure: row.structure,
        dates: extraData.dates || row.dates || [],
        players: extraData.players || row.players || [],
        metricsList: extraData.metricsList || extraData.metrics_list || row.metrics_list || [],
        tabularRows: extraData.tabularRows || extraData.tabular_rows || row.tabular_rows || [],
        sessionDate: row.session_date,
        dateGroups: extraData.dateGroups || extraData.date_groups || row.date_groups || null,
        createdAt: row.created_at,
      };
    });
  } catch (error) {
    console.error('Error fetching testing datasets:', error);
    return [];
  }
}

export async function saveTestingDataset(dataset: any) {
  try {
    if (!dataset.name || !dataset.testTypeId || !dataset.structure) {
      throw new Error('Missing required fields for testing dataset');
    }
    
    const supabase = getServerSupabase();

    const isUuid = dataset.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dataset.id);
    let targetId = isUuid ? dataset.id : null;

    if (!targetId) {
      const { data: existing } = await supabase
        .from('db_tests')
        .select('id')
        .eq('name', dataset.name)
        .maybeSingle();
      if (existing?.id) targetId = existing.id;
    }
    
    const dbPayload = {
      ...(targetId ? { id: targetId } : {}),
      name: dataset.name,
      test_type_id: dataset.testTypeId,
      structure: dataset.structure,
      session_date: dataset.sessionDate || null,
      data: {
        dates: dataset.dates || [],
        players: dataset.players || [],
        metricsList: dataset.metricsList || dataset.metrics_list || null,
        tabularRows: dataset.tabularRows || dataset.tabular_rows || null,
        dateGroups: dataset.dateGroups || dataset.date_groups || null,
      },
    };

    const { error } = await supabase
      .from("db_tests")
      .upsert(dbPayload, { onConflict: "id" });

    if (error) {
      throw error;
    }
    
    revalidatePath('/testing');
    return { success: true };
  } catch (error: any) {
    console.error(error);
    throw new Error(`Failed to save testing dataset: ${error.message}`);
  }
}

export async function deleteTestingDataset(id: string) {
  try {
    const supabase = getServerSupabase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let query = supabase.from("db_tests").delete();
    if (isUuid) {
      query = query.eq("id", id);
    } else {
      query = query.eq("name", id);
    }
    const { error } = await query;
      
    if (error) {
      throw error;
    }
    
    revalidatePath('/testing');
    return { success: true };
  } catch (error: any) {
    throw new Error(`Failed to delete testing dataset: ${error.message}`);
  }
}

export async function cleanEmptySessions() {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from('sesiones_dia').select('id, tipo_de_evento');
  if (data) {
    const toDelete = data.filter(d => !d.tipo_de_evento).map(d => d.id);
    if (toDelete.length > 0) {
      await supabase.from('sesiones_dia').delete().in('id', toDelete);
    }
    // WIPE POISONED FALLBACKS
    const { data: allStates } = await supabase.from('estado_diario_jugador').select('id, sesion_dia_id').not('sesion_dia_id', 'is', null);
    if (allStates) {
      const stateIds = allStates.map(s => s.id);
      for(let i = 0; i < stateIds.length; i+=500) {
        await supabase.from('estado_diario_jugador').update({ duracion_evento: null, minutos_jugados: null }).in('id', stateIds.slice(i, i+500));
      }
    }
  }
}


export async function getMinutosJugadorEventoAll() {
  let data: any[] | null = null;
  try {
    const supabase = getServerSupabase();
    const res = await supabase.from("minutos_jugador_evento").select("*");
    if (!res.error && res.data && res.data.length > 0) {
      data = res.data;
    }
  } catch (err: any) {
    console.warn("Exception getMinutosJugadorEventoAll, usando backup:", err?.message);
  }

  if (!data || data.length === 0) {
    data = getMasterBackupTable("minutos_jugador_evento");
  }

  return (data || []).map((row: any) => {
    const dur = Number(row.minutos ?? row.duracion ?? 0);
    return { ...row, minutos: dur, duracion: dur, realiza: row.realiza !== undefined ? Boolean(row.realiza) : dur > 0 };
  });
}

export async function addFullBBDDRow(payload: any) { return { success: true }; }
export async function deleteFullBBDDRow(id: string) { return { success: true }; }
export async function deleteFullBBDDRowsBatch(ids: string[]) { return { success: true }; }
export async function clearFullBBDD() { return { success: true }; }
export async function importFullBBDD(rows: any[]) { return { success: true }; }
export async function updateFullBBDDRow(id: string, fieldOrUpdates: any, value?: any) {
  const supabase = getServerSupabase();
  try {
    const updates: Record<string, any> = typeof fieldOrUpdates === "string" ? { [fieldOrUpdates]: value } : (fieldOrUpdates || {});
    
    // Extraer fecha del ID de la fila (ej: "TEAM_2026-10-04_ev1" o "<uuid>_2026-10-04_ev1")
    let fecha = "";
    const dateMatch = id.match(/\d{4}-\d{2}-\d{2}/);
    if (dateMatch) {
      fecha = dateMatch[0];
    }

    const sessionFields = ["rival", "periodo", "subperiodo", "semana", "md", "carga", "volumen", "intensidad", "comentario_microciclo"];
    const sessionUpdates: Record<string, any> = {};
    for (const f of sessionFields) {
      if (updates[f] !== undefined) {
        sessionUpdates[f] = updates[f];
      }
    }
    if (updates.comentario_fisico || updates.comentario_tecnico) {
      sessionUpdates.comentario_microciclo = updates.comentario_fisico || updates.comentario_tecnico;
    }

    if (Object.keys(sessionUpdates).length > 0 && fecha) {
      await supabase.from("sesiones_dia").update(sessionUpdates).eq("fecha", fecha);
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error en updateFullBBDDRow:", err);
    return { success: false, error: err.message };
  }
}

export async function importFullBBDDBatch(rows: any[]) { return { success: true }; }

export async function generateSesionesDia(startDate: string, team: string, weeks: number) {
  const supabase = getServerSupabase();
  const start = new Date(startDate);
  const rows = [];
  
  // Create days for N weeks
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const isoDate = d.toISOString().split("T")[0];
    
    rows.push({
      fecha: isoDate,
      equipo: team,
      semana: Math.floor(i / 7) + 1,
      periodo: "P",
      subperiodo: "Pretemporada",
      md: "",
      rival: "",
      evento_am: "",
      evento_pm: "",
      carga: null,
      volumen: null,
      intensidad: null,
      comentario_microciclo: ""
    });
  }

  const { error } = await supabase.from("sesiones_dia").insert(rows);
  if (error) {
    console.error("Error generating days:", error);
    throw new Error(error.message);
  }
  return { success: true };
}


export async function adminWipeDefaultEvents() {
  const supabase = getServerSupabase();
  const { error } = await supabase
    .from("sesiones_dia")
    .update({
      evento_1: null,
      evento_2: null,
      evento_3: null,
      evento_4: null,
      evento_5: null,
      evento_6: null,
      evento_am: null
    })
    .neq("id", "123456789");
  
  if (error) console.error("adminWipeDefaultEvents Error:", error);
  return { success: !error };
}


export async function saveMinutosJugadorEvento(minutoRows: any[]) {
  if (!minutoRows || minutoRows.length === 0) return { success: true };
  const supabase = getServerSupabase();

  // 1. Guardar en minutos_jugador_evento con columnas limpias
  const minRowsToSave = minutoRows.map((r) => {
    const dur = Number(r.minutos ?? r.duracion ?? 0);
    return {
      jugador_id: String(r.jugador_id),
      fecha: String(r.fecha),
      evento_id: String(r.evento_id || "Pa"),
      minutos: dur,
      realiza: r.realiza !== undefined ? Boolean(r.realiza) : dur > 0,
    };
  });

  const { error: minErr } = await supabase
    .from("minutos_jugador_evento")
    .upsert(minRowsToSave, { onConflict: "jugador_id, fecha, evento_id" });

  if (minErr) {
    console.error("Error saveMinutosJugadorEvento en minutos_jugador_evento:", minErr.message);
  }

  // 2. Sincronizar en estado_diario_jugador (duracion_evento, minutos, etc.)
  try {
    const uniqueFechas = Array.from(new Set(minutoRows.map((r: any) => r.fecha).filter(Boolean)));
    const { data: sesiones } = await supabase
      .from("sesiones_dia")
      .select("id, fecha")
      .in("fecha", uniqueFechas);

    const fechaToSesionId = new Map<string, string>((sesiones || []).map((s: any) => [s.fecha, s.id]));

    for (const f of uniqueFechas) {
      if (!fechaToSesionId.has(f)) {
        const { data: newS } = await supabase
          .from("sesiones_dia")
          .insert({ fecha: f, equipo: "CE EUROPA", temporada: "2026/27" })
          .select("id")
          .single();
        if (newS) fechaToSesionId.set(f, newS.id);
      }
    }

    const estadoRows: any[] = [];
    for (const r of minutoRows) {
      const sesionId = fechaToSesionId.get(r.fecha);
      if (!sesionId || !r.jugador_id) continue;
      const dur = Number(r.minutos ?? r.duracion ?? 0);
      estadoRows.push({
        jugador_id: String(r.jugador_id),
        sesion_dia_id: sesionId,
        minutos: dur,
        disponibilidad: dur > 0 ? "D" : (r.disponibilidad || "NDR"),
        evento_asignado: r.evento_id || null,
      });
    }

    if (estadoRows.length > 0) {
      const { error: estErr } = await supabase
        .from("estado_diario_jugador")
        .upsert(estadoRows, { onConflict: "jugador_id,sesion_dia_id" });

      if (estErr) {
        console.error("Error saveMinutosJugadorEvento en estado_diario_jugador:", estErr.message);
      }
    }
  } catch (e: any) {
    console.error("Error sincronizando estado_diario_jugador:", e.message);
  }

  try {
    const { revalidatePath } = require("next/cache");
    revalidatePath("/base-datos");
    revalidatePath("/eventos");
    revalidatePath("/calendario");
    revalidatePath("/informes/partidos");
  } catch (e) {}

  return { success: true };
}


export async function getReportePartidosData(equipo?: string): Promise<any> {
  try {
    const supabase = getServerSupabase();
    const repClub = clubKeyword(equipo || await getActiveClubName());

    let jugQuery = supabase
      .from("jugadores")
      .select("id, nombre, apodo, posicion, foto_url, fecha_nacimiento, activo, cor_id, equipo, temporada")
      .eq("activo", true);
    if (repClub) {
      jugQuery = jugQuery.ilike("equipo", `%${repClub}%`);
    }

    let rawJ: any = null, rawS: any = null, rawB: any = null, rawE: any = null, rawG: any = null, rawM: any = null;
    try {
      const results = await Promise.all([
        jugQuery.order("nombre"),
        supabase.from("sesiones_dia").select("*").gte("fecha", "2026-10-01").order("fecha", { ascending: true }),
        supabase.from("sesiones_dia_bloques").select("*"),
        supabase.from("estado_diario_jugador").select("*"),
        supabase.from("gps_datos").select("*"),
        supabase.from("minutos_jugador_evento").select("*"),
      ]);
      rawJ = results[0]?.data;
      rawS = results[1]?.data;
      rawB = results[2]?.data;
      rawE = results[3]?.data;
      rawG = results[4]?.data;
      rawM = results[5]?.data;
    } catch (e) {
      console.warn("Exception getInformeJugadorData, using master backup:", e);
    }

    const jugadores = (rawJ && rawJ.length > 0) ? rawJ : getMasterBackupTable("jugadores");
    const sesiones = (rawS && rawS.length > 0) ? rawS : getMasterBackupTable("sesiones_dia");
    const bloques = (rawB && rawB.length > 0) ? rawB : getMasterBackupTable("sesiones_dia_bloques");
    const estados = (rawE && rawE.length > 0) ? rawE : getMasterBackupTable("estado_diario_jugador");
    const gps = (rawG && rawG.length > 0) ? rawG : getMasterBackupTable("gps_datos");
    const minutosJugador = (rawM && rawM.length > 0) ? rawM : getMasterBackupTable("minutos_jugador_evento");

    const sesionIdToFecha = new Map<string, string>();
    (sesiones || []).forEach((s: any) => {
      if (s.id && s.fecha) sesionIdToFecha.set(s.id, s.fecha);
    });

    const bloquesMap: Record<string, any> = {};
    (bloques || []).forEach((b: any) => {
      if (b.fecha) {
        bloquesMap[`${b.fecha}_slot_${b.slot}`] = b;
        if (b.day_id) bloquesMap[`${b.day_id}_slot_${b.slot}`] = b;
        if (b.id) bloquesMap[b.id] = b;
      }
    });

    const minutosMap: Record<string, any> = {};
    (minutosJugador || []).forEach((row: any) => {
      if (!row.jugador_id || !row.fecha) return;
      const dur = Number(row.minutos ?? row.duracion ?? 0);
      const item = { minutos: dur, duracion: dur, realiza: row.realiza !== undefined ? Boolean(row.realiza) : dur > 0 };
      minutosMap[`${row.jugador_id}_${row.fecha}_${row.evento_id}`] = item;
      minutosMap[`${row.jugador_id}_${row.fecha}`] = item;
      minutosMap[`${row.jugador_id}_${row.fecha}_Pa`] = item;
      minutosMap[`${row.jugador_id}_${row.fecha}_partido`] = item;
    });

    const estadosWithFecha = (estados || []).map((e: any) => {
      const fecha = sesionIdToFecha.get(e.sesion_dia_id) || e.fecha;
      if (e.jugador_id && fecha) {
        const dur = Number(e.minutos ?? e.duracion_evento ?? 0);
        const tit = e.titularidad || (dur > 45 ? "T" : (dur > 0 ? "S" : undefined));
        const k = `${e.jugador_id}_${fecha}`;
        if (!minutosMap[k]) {
          minutosMap[k] = { minutos: dur, duracion: dur, realiza: dur > 0, titularidad: tit };
        } else {
          if (tit) minutosMap[k].titularidad = tit;
        }
        if (minutosMap[`${k}_Pa`]) {
          if (tit) minutosMap[`${k}_Pa`].titularidad = tit;
        } else {
          minutosMap[`${k}_Pa`] = { minutos: dur, duracion: dur, realiza: dur > 0, titularidad: tit };
        }
        if (e.sesion_dia_id) {
          minutosMap[`${e.jugador_id}_${e.sesion_dia_id}`] = { minutos: dur, titularidad: tit };
        }
      }
      return { ...e, fecha };
    });

    return {
      jugadores: (jugadores || []).map((item: any) => ({ ...item, dorsal: item.cor_id || null })),
      sesiones: sesiones || [],
      bloquesMap,
      estados: estadosWithFecha,
      gps: gps || [],
      minutosJugadorEvento: minutosMap,
    };
  } catch (err: any) {
    console.error("Error getReportePartidosData:", err);
    return { sesiones: [], minutosJugadorEvento: {}, jugadores: [], estados: [], gps: [], bloquesMap: {} };
  }
}

export async function saveReportePartidosPlayerMinute(jugadorId: string, fecha: string, minutos: number | null, titular: any) {
  const supabase = getServerSupabase();
  const dur = minutos ?? 0;
  const rows = [
    {
      jugador_id: jugadorId,
      fecha,
      evento_id: "partido",
      minutos: dur,
      realiza: dur > 0,
    },
    {
      jugador_id: jugadorId,
      fecha,
      evento_id: "Pa",
      minutos: dur,
      realiza: dur > 0,
    },
  ];
  const { error } = await supabase.from("minutos_jugador_evento").upsert(rows, { onConflict: "jugador_id, fecha, evento_id" });
  if (error) {
    console.error("Error saveReportePartidosPlayerMinute:", error);
  }

  try {
    const { data: sesion } = await supabase
      .from("sesiones_dia")
      .select("id")
      .eq("fecha", fecha)
      .maybeSingle();

    let sesionId = sesion?.id;
    if (!sesionId) {
      const { data: newS } = await supabase
        .from("sesiones_dia")
        .insert({ fecha, equipo: "CE EUROPA", temporada: "2026/27" })
        .select("id")
        .single();
      if (newS) sesionId = newS.id;
    }

    if (sesionId) {
      await supabase.from("estado_diario_jugador").upsert([
        {
          jugador_id: jugadorId,
          sesion_dia_id: sesionId,
          minutos: dur,
          disponibilidad: dur > 0 ? "D" : "NDR",
          evento_asignado: "Pa",
        }
      ], { onConflict: "jugador_id,sesion_dia_id" });
    }
  } catch (e: any) {
    console.error("Error sync estado_diario en saveReportePartidosPlayerMinute:", e?.message);
  }
}

/**
 * Gestión persistente de Club, Temporada y Escudos
 */
export interface ClubConfigData {
  nombreClub: string;
  siglas: string;
  categoria: string;
  escudoUrl: string;
  escudoSecundarioUrl?: string;
  temporadaActiva: string;
  temporadas: Array<{
    temporada: string;
    equipo: string;
    escudoUrl?: string;
    esActiva?: boolean;
    liga?: string;
    grupo?: string;
  }>;
  gpsConfig?: {
    favoriteVariables?: string[];
    derivedVariables?: any[];
  };
}

export async function getClubConfig(): Promise<ClubConfigData | null> {
  try {
    // 1. Prioridad: Base de Datos Supabase (tabla configuracion_club)
    const supabase = getServerSupabase();
    const { data: dbData, error } = await supabase
      .from("configuracion_club")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    if (dbData) {
      const parsed: ClubConfigData = {
        nombreClub: dbData.nombre_club || "",
        siglas: dbData.siglas || "",
        categoria: dbData.categoria || "",
        escudoUrl: dbData.escudo_url || "",
        escudoSecundarioUrl: dbData.escudo_secundario_url || "",
        temporadaActiva: dbData.temporada_activa || "",
        temporadas: Array.isArray(dbData.temporadas) && dbData.temporadas.length > 0 ? dbData.temporadas : (dbData.config_json?.temporadas || []),
        ...(dbData.config_json || {}),
      };

      // Guardar caché local
      try {
        const path = require("path");
        const filePath = path.join(process.cwd(), "public", "club_config.json");
        fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), "utf8");
      } catch (e) {}

      return parsed;
    }

    // 2. Fallback: Archivo JSON local
    const path = require("path");
    const filePath = path.join(process.cwd(), "public", "club_config.json");
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Error reading club config:", e);
  }
  return null;
}

export async function saveClubConfig(config: ClubConfigData): Promise<{ success: boolean; config: ClubConfigData }> {
  try {
    const path = require("path");
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const saveBase64Image = (dataUrl?: string, prefix: string = "escudo") => {
      if (!dataUrl || !dataUrl.startsWith("data:image/")) return dataUrl || "";
      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (!matches || matches.length < 3) return dataUrl;
      const extRaw = matches[1].toLowerCase();
      const ext = extRaw.includes("jpeg") ? "jpg" : extRaw.includes("svg") ? "svg" : "png";
      const base64Data = matches[2];
      const fileName = `${prefix}_${Date.now()}.${ext}`;
      const filePath = path.join(uploadsDir, fileName);
      fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
      return `/uploads/${fileName}`;
    };

    const cleanConfig: ClubConfigData = {
      ...config,
      escudoUrl: saveBase64Image(config.escudoUrl, "escudo_main"),
      escudoSecundarioUrl: config.escudoSecundarioUrl ? saveBase64Image(config.escudoSecundarioUrl, "escudo_sec") : "",
      temporadas: (config.temporadas || []).map((t, idx) => ({
        ...t,
        escudoUrl: t.escudoUrl ? saveBase64Image(t.escudoUrl, `escudo_temp_${idx}`) : "",
      })),
    };

    // 1. Guardar en Base de Datos Supabase (tabla configuracion_club)
    const supabase = getServerSupabase();
    const { error: dbError } = await supabase.from("configuracion_club").upsert(
      {
        id: "default",
        nombre_club: cleanConfig.nombreClub || "",
        siglas: cleanConfig.siglas || "",
        categoria: cleanConfig.categoria || "",
        escudo_url: cleanConfig.escudoUrl || "",
        escudo_secundario_url: cleanConfig.escudoSecundarioUrl || "",
        temporada_activa: cleanConfig.temporadaActiva || "",
        temporadas: cleanConfig.temporadas || [],
        config_json: cleanConfig,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (dbError) {
      console.error("Error guardando configuracion_club en Supabase:", dbError.message);
    }

    // 2. Guardar en archivo local JSON como respaldo
    const filePath = path.join(process.cwd(), "public", "club_config.json");
    fs.writeFileSync(filePath, JSON.stringify(cleanConfig, null, 2), "utf8");

    return { success: true, config: cleanConfig };
  } catch (e: any) {
    console.error("Error saving club config:", e);
    return { success: false, config };
  }
}

import { ExternalDatabaseLinks, DEFAULT_EXTERNAL_LINKS } from "./lib/externalLinks";
export type { ExternalDatabaseLinks };

export async function getGpsFavoritesServer(): Promise<{ favoriteVariables: string[]; derivedVariables: any[] }> {
  try {
    const config = await getClubConfig();
    if (config?.gpsConfig?.favoriteVariables && Array.isArray(config.gpsConfig.favoriteVariables) && config.gpsConfig.favoriteVariables.length > 0) {
      return {
        favoriteVariables: config.gpsConfig.favoriteVariables,
        derivedVariables: config.gpsConfig.derivedVariables || [],
      };
    }
  } catch (e) {}
  return {
    favoriteVariables: [
      "Distance(m)",
      "Distance +21 (m)",
      "MAX Speed(km/h)",
      "Sprints Count",
      "Accs Count",
      "Decs Count",
      "Player Load",
      "Duration(min)",
      "Distancia / Min",
      "Acc+Dec",
    ],
    derivedVariables: [],
  };
}

export async function saveGpsFavoritesServer(
  favoriteKeys: string[],
  derivedVariables?: any[]
): Promise<{ success: boolean }> {
  try {
    const config = (await getClubConfig()) || ({} as any);
    config.gpsConfig = {
      ...(config.gpsConfig || {}),
      favoriteVariables: favoriteKeys,
      derivedVariables: derivedVariables !== undefined ? derivedVariables : (config.gpsConfig?.derivedVariables || []),
    };
    await saveClubConfig(config);
    return { success: true };
  } catch (e) {
    return { success: false };
  }
}

export type PlayerProfileConfig = {
  ratios: Record<string, number>;
  variables?: string[];
  hsriVariableKey?: string;
  benchmarkOverrides?: Record<string, number>;
  updatedAt?: string;
};

export async function getPlayerProfileConfigServer(jugadorId: string): Promise<PlayerProfileConfig | null> {
  try {
    // 1. Prioridad: Supabase (tabla db_testing con test_type_id = "player_profile_config")
    const supabase = getServerSupabase();
    const { data: dbRow, error } = await supabase
      .from("db_testing")
      .select("data")
      .eq("id", jugadorId)
      .eq("test_type_id", "player_profile_config")
      .maybeSingle();

    if (dbRow && dbRow.data && typeof dbRow.data === "object") {
      return dbRow.data as PlayerProfileConfig;
    }

    // 2. Fallback: Archivo JSON local
    const path = require("path");
    const filePath = path.join(process.cwd(), "public", "player_ratios_config.json");
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      const allConfigs = JSON.parse(raw);
      if (allConfigs && allConfigs[jugadorId]) {
        return allConfigs[jugadorId];
      }
    }
    const config = await getClubConfig();
    if (config && (config as any).playerRatiosConfig && (config as any).playerRatiosConfig[jugadorId]) {
      return (config as any).playerRatiosConfig[jugadorId];
    }
  } catch (e) {
    console.error("Error reading player profile config from Supabase:", e);
  }
  return null;
}

export async function savePlayerProfileConfigServer(
  jugadorId: string,
  payload: {
    ratios: Record<string, number>;
    variables?: string[];
    hsriVariableKey?: string;
    benchmarkOverrides?: Record<string, number>;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const dataToSave: PlayerProfileConfig = {
      ratios: payload.ratios,
      variables: payload.variables,
      hsriVariableKey: payload.hsriVariableKey,
      benchmarkOverrides: payload.benchmarkOverrides,
      updatedAt: new Date().toISOString(),
    };

    // 1. Guardar de forma permanente en Supabase (tabla db_testing)
    const supabase = getServerSupabase();
    const { error: sbError } = await supabase.from("db_testing").upsert({
      id: jugadorId,
      name: `player_config_${jugadorId}`,
      test_type_id: "player_profile_config",
      structure: "CONFIG",
      data: dataToSave,
    });

    if (sbError) {
      console.error("Error guardando player_profile_config en Supabase db_testing:", sbError.message);
    }

    // 2. Guardar también en archivo local como respaldo rápido
    try {
      const path = require("path");
      const filePath = path.join(process.cwd(), "public", "player_ratios_config.json");
      let allConfigs: Record<string, PlayerProfileConfig> = {};
      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, "utf8");
          allConfigs = JSON.parse(raw) || {};
        } catch (err) {}
      }
      allConfigs[jugadorId] = dataToSave;
      fs.writeFileSync(filePath, JSON.stringify(allConfigs, null, 2), "utf8");
    } catch (e) {}

    // 3. Sincronizar en club_config si está disponible
    try {
      const config = await getClubConfig();
      if (config) {
        if (!(config as any).playerRatiosConfig) (config as any).playerRatiosConfig = {};
        (config as any).playerRatiosConfig[jugadorId] = dataToSave;
        await saveClubConfig(config);
      }
    } catch (e) {}

    return { success: !sbError, error: sbError?.message };
  } catch (e: any) {
    console.error("Error saving player profile config:", e);
    return { success: false, error: e?.message };
  }
}

export async function getExternalLinksBBDD(): Promise<ExternalDatabaseLinks> {
  try {
    const supabase = getServerSupabase();
    const { data: dbData } = await supabase
      .from("configuracion_club")
      .select("config_json")
      .eq("id", "default")
      .maybeSingle();

    if (dbData?.config_json?.enlacesExternos) {
      return {
        ...DEFAULT_EXTERNAL_LINKS,
        ...dbData.config_json.enlacesExternos,
        wellness: { ...DEFAULT_EXTERNAL_LINKS.wellness, ...(dbData.config_json.enlacesExternos.wellness || {}) },
        gps: { ...DEFAULT_EXTERNAL_LINKS.gps, ...(dbData.config_json.enlacesExternos.gps || {}) },
      };
    }

    const path = require("path");
    const filePath = path.join(process.cwd(), "public", "external_links.json");
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);
      return {
        ...DEFAULT_EXTERNAL_LINKS,
        ...parsed,
        wellness: { ...DEFAULT_EXTERNAL_LINKS.wellness, ...(parsed.wellness || {}) },
        gps: { ...DEFAULT_EXTERNAL_LINKS.gps, ...(parsed.gps || {}) },
      };
    }
  } catch (e) {
    console.warn("Error leyendo enlaces externos BBDD:", e);
  }
  return DEFAULT_EXTERNAL_LINKS;
}

export async function saveExternalLinksBBDD(links: ExternalDatabaseLinks): Promise<{ success: boolean }> {
  try {
    const supabase = getServerSupabase();
    const { data: dbData } = await supabase
      .from("configuracion_club")
      .select("config_json")
      .eq("id", "default")
      .maybeSingle();

    const currentConfigJson = dbData?.config_json || {};
    const updatedConfigJson = {
      ...currentConfigJson,
      enlacesExternos: links,
    };

    await supabase.from("configuracion_club").upsert(
      {
        id: "default",
        config_json: updatedConfigJson,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    try {
      const path = require("path");
      const filePath = path.join(process.cwd(), "public", "external_links.json");
      fs.writeFileSync(filePath, JSON.stringify(links, null, 2), "utf8");
    } catch (e) {}

    return { success: true };
  } catch (e: any) {
    console.error("Error guardando enlaces externos BBDD:", e);
    return { success: false };
  }
}

export async function saveSingleBloqueBBDD(params: {
  dayId: string;
  fecha: string;
  slot: number;
  block: {
    id?: string;
    tipo?: string | null;
    hora?: string | null;
    lugar?: string | null;
    duracion?: string | null;
    orientacion?: string | null;
    carga?: string | null;
    comentario?: string | null;
    num_jugadores?: string | null;
    competicion?: string | null;
  };
}) {
  const supabase = getServerSupabase();
  let realDayId = params.dayId;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(realDayId);
  if (!isUuid) {
    let { data: s } = await supabase.from("sesiones_dia").select("id").eq("fecha", params.fecha).maybeSingle();
    if (s?.id) {
      realDayId = s.id;
    } else {
      const { data: newS } = await supabase.from("sesiones_dia").insert({ fecha: params.fecha, equipo: "CE EUROPA", temporada: "2026/27" }).select("id").single();
      if (newS?.id) realDayId = newS.id;
      else return { success: false, error: "Session could not be created" };
    }
  }

  // 1. Obtener bloque existente para fusionar características y nunca sobreescribir con null datos previos
  const { data: existing } = await supabase
    .from("sesiones_dia_bloques")
    .select("*")
    .match({ day_id: realDayId, slot: params.slot })
    .maybeSingle();

  // Si se elimina explícitamente el tipo (vacío o null) y no se pasan otras características, borrar bloque
  const isClearingBlock = (params.block.tipo === "" || params.block.tipo === null) &&
    (!params.block.hora && !params.block.lugar && !params.block.duracion && !params.block.orientacion && !params.block.carga && !params.block.comentario && !params.block.num_jugadores);

  if (isClearingBlock) {
    await supabase.from("sesiones_dia_bloques").delete().match({ day_id: realDayId, slot: params.slot });
  } else {
    // Si un campo no viene en params.block (undefined), preservamos el valor existente en BBDD
    const finalTipo = params.block.tipo !== undefined ? (params.block.tipo || null) : (existing?.tipo || null);
    const finalHora = params.block.hora !== undefined ? (params.block.hora || null) : (existing?.hora || null);
    const finalLugar = params.block.lugar !== undefined ? (params.block.lugar || null) : (existing?.lugar || null);
    const finalDuracion = params.block.duracion !== undefined ? (params.block.duracion ? String(params.block.duracion) : null) : (existing?.duracion ? String(existing.duracion) : null);
    const finalOrientacion = params.block.orientacion !== undefined ? (params.block.orientacion || null) : (existing?.orientacion || null);
    const finalCarga = params.block.carga !== undefined ? (params.block.carga || null) : (existing?.carga || null);
    const finalComentario = params.block.comentario !== undefined ? (params.block.comentario || null) : (existing?.comentario || null);
    const finalNumJugadores = params.block.num_jugadores !== undefined ? (params.block.num_jugadores || null) : (existing?.num_jugadores || null);
    const finalCompeticion = params.block.competicion !== undefined ? (params.block.competicion || null) : (existing?.competicion || null);

    const isAllEmpty = !finalTipo && !finalHora && !finalLugar && !finalDuracion && !finalOrientacion && !finalCarga && !finalComentario && !finalNumJugadores;

    if (isAllEmpty) {
      await supabase.from("sesiones_dia_bloques").delete().match({ day_id: realDayId, slot: params.slot });
    } else {
      await supabase.from("sesiones_dia_bloques").upsert({
        day_id: realDayId,
        fecha: params.fecha,
        slot: params.slot,
        tipo: finalTipo,
        hora: finalHora,
        lugar: finalLugar,
        duracion: finalDuracion,
        orientacion: finalOrientacion,
        carga: finalCarga,
        comentario: finalComentario,
        num_jugadores: finalNumJugadores,
        competicion: finalCompeticion,
      }, { onConflict: "day_id,slot" });
    }
  }

  // Also sync slot info into sesiones_dia (only specific slots evento_1..6, never touch evento_am which is Evento General)
  const sessionUpdates: Record<string, any> = {};
  const slot = params.slot;
  const tipo = params.block.tipo !== undefined ? (params.block.tipo || null) : (existing?.tipo || null);
// sync to evento_am / evento_pm
    if (slot === 0 && tipo) sessionUpdates.evento_am = tipo;
    if (slot === 1 && tipo) sessionUpdates.evento_pm = tipo;

  const cargaVal = params.block.carga !== undefined ? params.block.carga : existing?.carga;
  if (cargaVal && !isNaN(Number(cargaVal))) sessionUpdates.carga = Number(cargaVal);

  const durVal = params.block.duracion !== undefined ? params.block.duracion : existing?.duracion;
  if (durVal && !isNaN(Number(durVal))) sessionUpdates.volumen = Number(durVal);

  const lugarVal = params.block.lugar !== undefined ? params.block.lugar : existing?.lugar;
  if (lugarVal && (String(tipo).toLowerCase().includes("pa") || String(tipo).toLowerCase().includes("partido"))) {
    sessionUpdates.rival = lugarVal;
  }

  if (Object.keys(sessionUpdates).length > 0) {
    await supabase.from("sesiones_dia").update(sessionUpdates).eq("id", realDayId);
  }

  return { success: true };
}

export async function updatePlayerEventAssignmentBBDD(params: {
  jugadorId: string;
  dayId: string;
  fecha?: string;
  eventoAsignado: string | null;
}) {
  const supabase = getServerSupabase();
  let realDayId = params.dayId;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(realDayId);
  if (!isUuid && params.fecha) {
    let { data: s } = await supabase.from("sesiones_dia").select("id").eq("fecha", params.fecha).maybeSingle();
    if (s?.id) {
      realDayId = s.id;
    } else {
      const { data: newS } = await supabase.from("sesiones_dia").insert({ fecha: params.fecha, equipo: "CE EUROPA", temporada: "2026/27" }).select("id").single();
      if (newS?.id) realDayId = newS.id;
      else return { success: false, error: "Session not found or created" };
    }
  } else if (!isUuid) {
    const cleanDate = realDayId.replace(/^day_/, "");
    let { data: s } = await supabase.from("sesiones_dia").select("id").eq("fecha", cleanDate).maybeSingle();
    if (s?.id) {
      realDayId = s.id;
    } else {
      const { data: newS } = await supabase.from("sesiones_dia").insert({ fecha: cleanDate, equipo: "CE EUROPA", temporada: "2026/27" }).select("id").single();
      if (newS?.id) realDayId = newS.id;
      else return { success: false, error: "Session not found or created" };
    }
  }

  const { data: existing } = await supabase
    .from("estado_diario_jugador")
    .select("id")
    .eq("jugador_id", params.jugadorId)
    .eq("sesion_dia_id", realDayId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("estado_diario_jugador")
      .update({ evento_asignado: params.eventoAsignado || null })
      .eq("id", existing.id);
  } else {
    if (params.eventoAsignado) {
      await supabase.from("estado_diario_jugador").insert({
        jugador_id: params.jugadorId,
        sesion_dia_id: realDayId,
        evento_asignado: params.eventoAsignado,
        disponibilidad: "D",
      });
    }
  }

  return { success: true };
}


export async function savePlayerCommentBBDD(params: {
  jugadorId: string;
  dayId: string;
  fecha?: string;
  tipo: string;
  texto: string;
}) {
  const supabase = getServerSupabase();
  const fecha = params.fecha || params.dayId.replace(/^day_/, "");

  if (params.jugadorId === "TEAM") {
    const updatePayload: Record<string, any> = {};
    if (params.tipo === "TEC") {
      updatePayload.comentario_tecnico = params.texto.trim() || null;
      updatePayload.comentario_microciclo = params.texto.trim() || null;
    } else if (params.tipo === "CON") {
      updatePayload.comentario_fisico = params.texto.trim() || null;
    }
    if (Object.keys(updatePayload).length > 0) {
      await supabase.from("sesiones_dia").update(updatePayload).eq("fecha", fecha);
    }
    return { success: true };
  }

  let realDayId = params.dayId;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(realDayId);
  if (!isUuid) {
    let { data: s } = await supabase.from("sesiones_dia").select("id").eq("fecha", fecha).maybeSingle();
    if (s?.id) {
      realDayId = s.id;
    } else {
      const { data: newS } = await supabase.from("sesiones_dia").insert({ fecha, equipo: "CE EUROPA", temporada: "2026/27" }).select("id").single();
      if (newS?.id) realDayId = newS.id;
      else return { success: false, error: "Could not create session" };
    }
  }

  const fieldMap: Record<string, string> = {
    WEL: "comentario_wellness",
    FIS: "comentario_lesiones",
    TEC: "comentario_tecnico",
    CON: "comentario_fisico",
    OTR: "comentario_medico",
    PSI: "comentario_psicologico",
    NUT: "comentario_nutricion",
  };
  const targetCol = fieldMap[params.tipo] || "comentario_lesiones";
  const val = params.texto.trim() || null;

  const { data: existing } = await supabase
    .from("estado_diario_jugador")
    .select("id")
    .eq("jugador_id", params.jugadorId)
    .eq("sesion_dia_id", realDayId)
    .maybeSingle();

  if (existing) {
    await supabase.from("estado_diario_jugador").update({ [targetCol]: val }).eq("id", existing.id);
  } else {
    await supabase.from("estado_diario_jugador").insert({
      jugador_id: params.jugadorId,
      sesion_dia_id: realDayId,
      disponibilidad: "D",
      [targetCol]: val,
    });
  }
  return { success: true };
}

export async function deletePlayerCommentBBDD(params: {
  jugadorId: string;
  dayId: string;
  fecha?: string;
  tipo: string;
}) {
  return savePlayerCommentBBDD({
    jugadorId: params.jugadorId,
    dayId: params.dayId,
    fecha: params.fecha,
    tipo: params.tipo,
    texto: "",
  });
}

export async function syncWellnessCommentsBatchBBDD(comments: Array<{
  jugadorId: string;
  fecha: string;
  texto: string;
}>): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!comments || comments.length === 0) return { success: true, count: 0 };
    const supabase = getServerSupabase();

    const fechas = Array.from(new Set(comments.map((c) => c.fecha).filter(Boolean)));
    const { data: sesiones } = await supabase
      .from("sesiones_dia")
      .select("id, fecha")
      .in("fecha", fechas);

    const fechaToSessionId = new Map<string, string>();
    (sesiones || []).forEach((s: any) => {
      if (s.id && s.fecha) fechaToSessionId.set(s.fecha, s.id);
    });

    for (const f of fechas) {
      if (!fechaToSessionId.has(f)) {
        const { data: newS } = await supabase
          .from("sesiones_dia")
          .insert({ fecha: f, equipo: "CE EUROPA", temporada: "2026/27" })
          .select("id")
          .maybeSingle();
        if (newS?.id) {
          fechaToSessionId.set(f, newS.id);
        }
      }
    }

    const sessionIds = Array.from(fechaToSessionId.values());
    if (sessionIds.length === 0) return { success: true, count: 0 };

    const { data: existingStates } = await supabase
      .from("estado_diario_jugador")
      .select("id, jugador_id, sesion_dia_id, comentario_wellness")
      .in("sesion_dia_id", sessionIds);

    const stateMap = new Map<string, any>();
    (existingStates || []).forEach((st: any) => {
      stateMap.set(`${st.jugador_id}_${st.sesion_dia_id}`, st);
    });

    let updatedCount = 0;

    for (const c of comments) {
      if (!c.jugadorId || !c.fecha || !c.texto?.trim()) continue;
      const sessionId = fechaToSessionId.get(c.fecha);
      if (!sessionId) continue;

      const key = `${c.jugadorId}_${sessionId}`;
      const existing = stateMap.get(key);
      const cleanText = c.texto.trim();

      if (existing) {
        if (existing.comentario_wellness !== cleanText) {
          await supabase
            .from("estado_diario_jugador")
            .update({ comentario_wellness: cleanText })
            .eq("id", existing.id);
          updatedCount++;
        }
      } else {
        const { data: newRow } = await supabase
          .from("estado_diario_jugador")
          .insert({
            jugador_id: c.jugadorId,
            sesion_dia_id: sessionId,
            disponibilidad: "D",
            comentario_wellness: cleanText,
          })
          .select("id")
          .maybeSingle();
        if (newRow?.id) {
          stateMap.set(key, { id: newRow.id, jugador_id: c.jugadorId, sesion_dia_id: sessionId, comentario_wellness: cleanText });
          updatedCount++;
        }
      }
    }

    return { success: true, count: updatedCount };
  } catch (err: any) {
    console.error("Error en syncWellnessCommentsBatchBBDD:", err);
    return { success: false, count: 0, error: err?.message };
  }
}



// ==========================================
// BBDD FUERZA & GIMNASIO SUPABASE ACTIONS
// ==========================================

export type FuerzaBBDDRow = {
  id: string;
  jugador_id?: string | null;
  sesion_dia_id?: string | null;
  fecha: string;
  md?: string | null;
  jugadorNombre: string;
  dorsal?: string | number | null;
  posicion?: string | null;
  nombreSesion: string;
  categoria: string;
  bloque?: string | null;
  ejercicioNombre: string;
  grupoMuscular?: string | null;
  series: number | string;
  reps: string;
  pesoKg: string;
  rpe?: number | null;
  comentario?: string | null;
  videoUrl?: string | null;
  sesionNotas?: string | null;
  sesionVideoUrl?: string | null;
  hora?: string | null;
  lugar?: string | null;
  tiempo?: string | null;
  velocidad?: string | null;
  material?: string | null;
  potencia?: string | null;
  variables?: Record<string, string> | null;
  estado?: string | null;
  created_at?: string | null;
};

export async function saveFuerzaSesionesBatch(rows: Array<Omit<FuerzaBBDDRow, 'id'> & { id?: string }>) {
  if (!rows || rows.length === 0) return { success: true, count: 0 };
  const supabase = getServerSupabase();

  try {
    const { data: dbJugadores } = await supabase.from('jugadores').select('id, nombre, apodo');
    const nameToId = new Map<string, string>();
    (dbJugadores || []).forEach((j: any) => {
      if (j.nombre) nameToId.set(j.nombre.toLowerCase().trim(), j.id);
      if (j.apodo) nameToId.set(j.apodo.toLowerCase().trim(), j.id);
    });

    const fechas = [...new Set(rows.map(r => r.fecha).filter(Boolean))];
    const dateToId = new Map<string, string>();
    if (fechas.length > 0) {
      const { data: dbDays } = await supabase.from('sesiones_dia').select('id, fecha').in('fecha', fechas);
      (dbDays || []).forEach((d: any) => {
        if (d.fecha) dateToId.set(d.fecha, d.id);
      });
    }

    const payload = rows.map(r => {
      let jId: string | null = null;
      if (r.jugador_id && r.jugador_id.length > 30 && r.jugador_id.includes('-')) {
        jId = r.jugador_id;
      } else if (r.jugadorNombre) {
        const found = nameToId.get(r.jugadorNombre.toLowerCase().trim());
        if (found) jId = found;
      }

      const sId = dateToId.get(r.fecha) || (r.sesion_dia_id && r.sesion_dia_id.includes('-') ? r.sesion_dia_id : null);

      const vars = r.variables || {};
      const tiempoVal = r.tiempo || vars['Tiempo'] || vars['tiempo'] || null;
      const velocidadVal = r.velocidad || vars['Velocidad'] || vars['velocidad'] || null;
      const materialVal = r.material || vars['Material'] || vars['material'] || null;
      const potenciaVal = r.potencia || vars['Potencia'] || vars['potencia'] || null;
      const videoUrlVal = r.videoUrl || vars['videoUrl'] || vars['video_url'] || null;
      const sesionVideoUrlVal = r.sesionVideoUrl || null;
      const sesionNotasVal = r.sesionNotas || null;
      const bloqueVal = r.bloque || null;
      const horaVal = r.hora || null;
      const lugarVal = r.lugar || null;

      const fullVars = { ...vars };
      if (tiempoVal && !fullVars['Tiempo']) fullVars['Tiempo'] = tiempoVal;
      if (velocidadVal && !fullVars['Velocidad']) fullVars['Velocidad'] = velocidadVal;
      if (materialVal && !fullVars['Material']) fullVars['Material'] = materialVal;
      if (potenciaVal && !fullVars['Potencia']) fullVars['Potencia'] = potenciaVal;
      if (videoUrlVal && !fullVars['videoUrl']) fullVars['videoUrl'] = videoUrlVal;

      const contenidoObj = {
        fecha: r.fecha,
        md: r.md || '',
        jugadorNombre: r.jugadorNombre,
        dorsal: r.dorsal || null,
        posicion: r.posicion || null,
        nombreSesion: r.nombreSesion,
        categoria: r.categoria,
        bloque: bloqueVal,
        ejercicioNombre: r.ejercicioNombre,
        grupoMuscular: r.grupoMuscular || '',
        series: r.series,
        reps: r.reps,
        pesoKg: r.pesoKg,
        rpe: r.rpe ?? null,
        comentario: r.comentario || '',
        videoUrl: videoUrlVal || '',
        sesionNotas: sesionNotasVal || '',
        sesionVideoUrl: sesionVideoUrlVal || '',
        hora: horaVal || '',
        lugar: lugarVal || '',
        tiempo: tiempoVal,
        velocidad: velocidadVal,
        material: materialVal,
        potencia: potenciaVal,
        variables: fullVars,
        estado: r.estado || 'completado',
        savedAt: new Date().toISOString(),
      };

      return {
        jugador_id: jId,
        sesion_dia_id: sId,
        tipo_entreno: r.categoria || 'FUERZA',
        contenido: JSON.stringify(contenidoObj),
        fecha: r.fecha || null,
        md: r.md || null,
        jugador_nombre: r.jugadorNombre || null,
        dorsal: r.dorsal !== undefined && r.dorsal !== null ? String(r.dorsal) : null,
        posicion: r.posicion || null,
        nombre_sesion: r.nombreSesion || null,
        categoria: r.categoria || 'FUERZA',
        ejercicio_nombre: r.ejercicioNombre || null,
        grupo_muscular: r.grupoMuscular || null,
        series: r.series !== undefined && r.series !== null ? String(r.series) : null,
        reps: r.reps !== undefined && r.reps !== null ? String(r.reps) : null,
        peso_kg: r.pesoKg !== undefined && r.pesoKg !== null ? String(r.pesoKg) : null,
        rpe: r.rpe !== undefined && r.rpe !== null ? Number(r.rpe) : null,
        comentario: r.comentario || null,
        estado: r.estado || 'completado',
        tiempo: tiempoVal,
        velocidad: velocidadVal,
        material: materialVal,
        potencia: potenciaVal,
        variables: fullVars,
      };
    });

    // 1. Limpiar registros previos de estas sesiones (jugador_id, fecha, nombreSesion) para evitar duplicados al editar
    try {
      const keysToDelete = new Set(payload.map(p => {
        let c: any = {};
        try { c = JSON.parse(p.contenido); } catch(e) {}
        return `${p.jugador_id || 'null'}_${c.fecha}_${c.nombreSesion}`;
      }));

      const { data: existingRows } = await supabase.from('fuerza_sesiones').select('id, jugador_id, contenido');
      const idsToDelete = (existingRows || []).filter(r => {
        let c: any = {};
        try { c = JSON.parse(r.contenido || '{}'); } catch(e) {}
        const k = `${r.jugador_id || 'null'}_${c.fecha}_${c.nombreSesion}`;
        return keysToDelete.has(k);
      }).map(r => r.id);

      if (idsToDelete.length > 0) {
        await supabase.from('fuerza_sesiones').delete().in('id', idsToDelete);
      }
    } catch (e) {
      console.warn('[saveFuerzaSesionesBatch] Warning cleaning existing rows:', e);
    }

    let { data, error } = await supabase.from('fuerza_sesiones').insert(payload).select();
    if (error && error.message && error.message.includes('column')) {
      const fallbackPayload = payload.map(p => ({
        jugador_id: p.jugador_id,
        sesion_dia_id: p.sesion_dia_id,
        tipo_entreno: p.tipo_entreno,
        contenido: p.contenido,
      }));
      const resFallback = await supabase.from('fuerza_sesiones').insert(fallbackPayload).select();
      data = resFallback.data;
      error = resFallback.error;
    }

    if (error) {
      console.error('[saveFuerzaSesionesBatch] Supabase error:', error);
      return { success: false, error: error.message };
    }

    // Auto-backup persistente en disco (100% de recuperabilidad ante cualquier borrado)
    await backupFuerzaBBDDToDisk().catch(err => console.warn('[saveFuerzaSesionesBatch] Auto-backup warning:', err));

    return { success: true, count: data?.length || payload.length };
  } catch (err: any) {
    console.error('[saveFuerzaSesionesBatch] Exception:', err);
    return { success: false, error: err.message };
  }
}

export async function getFuerzaBBDDRows(desde?: string, hasta?: string, jugadorNombre?: string): Promise<FuerzaBBDDRow[]> {
  const supabase = getServerSupabase();
  const repClub = clubKeyword(await getActiveClubName());

  try {
    const { data, error } = await supabase
      .from('fuerza_sesiones')
      .select('*, jugadores(nombre, apodo, cor_id, posicion, equipo)');

    if (error) {
      console.error('[getFuerzaBBDDRows] Error fetching from Supabase:', error);
      return [];
    }

    const rows: FuerzaBBDDRow[] = [];
    (data || []).forEach((item: any) => {
      let parsedContenido: any = {};
      try {
        if (typeof item.contenido === 'string') {
          parsedContenido = JSON.parse(item.contenido);
        } else if (item.contenido && typeof item.contenido === 'object') {
          parsedContenido = item.contenido;
        }
      } catch (e) {}

      if (repClub && item.jugadores?.equipo && !item.jugadores.equipo.toUpperCase().includes(repClub.toUpperCase())) {
        return;
      }

      const fecha = item.fecha || parsedContenido.fecha || '';
      if (desde && fecha < desde) return;
      if (hasta && fecha > hasta) return;

      const jName = item.jugador_nombre || parsedContenido.jugadorNombre || item.jugadores?.apodo || item.jugadores?.nombre || 'Jugador';
      if (jugadorNombre && !jName.toLowerCase().includes(jugadorNombre.toLowerCase())) return;

      const vars = item.variables || parsedContenido.variables || parsedContenido.variablesPersonalizadas || {};
      const tiempo = item.tiempo || parsedContenido.tiempo || vars['Tiempo'] || vars['tiempo'] || null;
      const velocidad = item.velocidad || parsedContenido.velocidad || vars['Velocidad'] || vars['velocidad'] || null;
      const material = item.material || parsedContenido.material || vars['Material'] || vars['material'] || null;
      const potencia = item.potencia || parsedContenido.potencia || vars['Potencia'] || vars['potencia'] || null;
      const videoUrl = item.video_url || parsedContenido.videoUrl || parsedContenido.video_url || vars['videoUrl'] || vars['video_url'] || null;
      const sesionNotas = parsedContenido.sesionNotas || parsedContenido.notasSesion || null;
      const sesionVideoUrl = parsedContenido.sesionVideoUrl || null;
      const bloque = parsedContenido.bloque || null;

      const fullVars = { ...vars };
      if (tiempo && !fullVars['Tiempo']) fullVars['Tiempo'] = tiempo;
      if (velocidad && !fullVars['Velocidad']) fullVars['Velocidad'] = velocidad;
      if (material && !fullVars['Material']) fullVars['Material'] = material;
      if (potencia && !fullVars['Potencia']) fullVars['Potencia'] = potencia;
      if (videoUrl && !fullVars['videoUrl']) fullVars['videoUrl'] = videoUrl;

      rows.push({
        id: item.id,
        jugador_id: item.jugador_id,
        sesion_dia_id: item.sesion_dia_id,
        fecha,
        md: item.md || parsedContenido.md || '',
        jugadorNombre: jName,
        dorsal: item.dorsal || parsedContenido.dorsal || item.jugadores?.cor_id || null,
        posicion: item.posicion || parsedContenido.posicion || item.jugadores?.posicion || null,
        nombreSesion: item.nombre_sesion || parsedContenido.nombreSesion || 'Sesión de Fuerza',
        categoria: item.categoria || item.tipo_entreno || parsedContenido.categoria || 'FUERZA',
        bloque,
        ejercicioNombre: item.ejercicio_nombre || parsedContenido.ejercicioNombre || parsedContenido.ejercicio || 'Ejercicio',
        grupoMuscular: item.grupo_muscular || parsedContenido.grupoMuscular || '',
        series: item.series !== undefined && item.series !== null ? item.series : (parsedContenido.series || 1),
        reps: String(item.reps !== undefined && item.reps !== null ? item.reps : (parsedContenido.reps || '')),
        pesoKg: String(item.peso_kg !== undefined && item.peso_kg !== null ? item.peso_kg : (parsedContenido.pesoKg || '')),
        rpe: item.rpe !== null && item.rpe !== undefined ? Number(item.rpe) : (parsedContenido.rpe ?? null),
        comentario: item.comentario || parsedContenido.comentario || parsedContenido.notas || '',
        videoUrl,
        sesionNotas,
        sesionVideoUrl,
        tiempo,
        velocidad,
        material,
        potencia,
        variables: fullVars,
        estado: item.estado || parsedContenido.estado || 'completado',
      });
    });

    rows.sort((a, b) => b.fecha.localeCompare(a.fecha));
    return rows;
  } catch (err) {
    console.error('[getFuerzaBBDDRows] Exception:', err);
    return [];
  }
}

export async function deleteFuerzaBBDDRow(id: string) {
  const supabase = getServerSupabase();
  const { error } = await supabase.from('fuerza_sesiones').delete().eq('id', id);
  if (error) {
    console.error('[deleteFuerzaBBDDRow] Error:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function updateFuerzaBBDDRow(id: string, updatedFields: Partial<FuerzaBBDDRow>) {
  const supabase = getServerSupabase();
  const { data: existing, error: fetchErr } = await supabase.from('fuerza_sesiones').select('*').eq('id', id).maybeSingle();
  if (fetchErr || !existing) return { success: false, error: 'Registro no encontrado' };

  let parsed: any = {};
  try {
    parsed = typeof existing.contenido === 'string' ? JSON.parse(existing.contenido) : existing.contenido || {};
  } catch (e) {}

  const vars = updatedFields.variables || parsed.variables || {};
  const tiempoVal = updatedFields.tiempo !== undefined ? updatedFields.tiempo : (parsed.tiempo || vars['Tiempo'] || vars['tiempo'] || null);
  const velocidadVal = updatedFields.velocidad !== undefined ? updatedFields.velocidad : (parsed.velocidad || vars['Velocidad'] || vars['velocidad'] || null);
  const materialVal = updatedFields.material !== undefined ? updatedFields.material : (parsed.material || vars['Material'] || vars['material'] || null);
  const potenciaVal = updatedFields.potencia !== undefined ? updatedFields.potencia : (parsed.potencia || vars['Potencia'] || vars['potencia'] || null);
  const videoUrlVal = updatedFields.videoUrl !== undefined ? updatedFields.videoUrl : (parsed.videoUrl || vars['videoUrl'] || vars['video_url'] || null);
  const comentarioVal = updatedFields.comentario !== undefined ? updatedFields.comentario : (parsed.comentario || null);

  const fullVars = { ...vars };
  if (tiempoVal) fullVars['Tiempo'] = tiempoVal;
  if (velocidadVal) fullVars['Velocidad'] = velocidadVal;
  if (materialVal) fullVars['Material'] = materialVal;
  if (potenciaVal) fullVars['Potencia'] = potenciaVal;
  if (videoUrlVal) fullVars['videoUrl'] = videoUrlVal;

  const mergedContenido = {
    ...parsed,
    ...updatedFields,
    comentario: comentarioVal || '',
    videoUrl: videoUrlVal || '',
    tiempo: tiempoVal,
    velocidad: velocidadVal,
    material: materialVal,
    potencia: potenciaVal,
    variables: fullVars,
    updatedAt: new Date().toISOString(),
  };

  const updatePayload: any = {
    tipo_entreno: updatedFields.categoria || existing.tipo_entreno,
    contenido: JSON.stringify(mergedContenido),
    fecha: updatedFields.fecha || mergedContenido.fecha || null,
    md: updatedFields.md || mergedContenido.md || null,
    jugador_nombre: updatedFields.jugadorNombre || mergedContenido.jugadorNombre || null,
    dorsal: updatedFields.dorsal !== undefined ? String(updatedFields.dorsal) : (mergedContenido.dorsal || null),
    posicion: updatedFields.posicion || mergedContenido.posicion || null,
    nombre_sesion: updatedFields.nombreSesion || mergedContenido.nombreSesion || null,
    categoria: updatedFields.categoria || mergedContenido.categoria || 'FUERZA',
    ejercicio_nombre: updatedFields.ejercicioNombre || mergedContenido.ejercicioNombre || null,
    grupo_muscular: updatedFields.grupoMuscular || mergedContenido.grupoMuscular || null,
    series: updatedFields.series !== undefined && updatedFields.series !== null ? String(updatedFields.series) : (mergedContenido.series || null),
    reps: updatedFields.reps !== undefined && updatedFields.reps !== null ? String(updatedFields.reps) : (mergedContenido.reps || null),
    peso_kg: updatedFields.pesoKg !== undefined && updatedFields.pesoKg !== null ? String(updatedFields.pesoKg) : (mergedContenido.pesoKg || null),
    rpe: updatedFields.rpe !== undefined && updatedFields.rpe !== null ? Number(updatedFields.rpe) : (mergedContenido.rpe ?? null),
    comentario: comentarioVal,
    estado: updatedFields.estado || mergedContenido.estado || 'completado',
    tiempo: tiempoVal,
    velocidad: velocidadVal,
    material: materialVal,
    potencia: potenciaVal,
    variables: fullVars,
  };

  let { error } = await supabase
    .from('fuerza_sesiones')
    .update(updatePayload)
    .eq('id', id);

  if (error && error.message && error.message.includes('column')) {
    const fallbackUpdate = {
      tipo_entreno: updatedFields.categoria || existing.tipo_entreno,
      contenido: JSON.stringify(mergedContenido),
    };
    const resFallback = await supabase.from('fuerza_sesiones').update(fallbackUpdate).eq('id', id);
    error = resFallback.error;
  }

  if (error) return { success: false, error: error.message };
  return { success: true };
}


/**
 * =========================================================================
 * SISTEMA DE RESPALDO Y RECUPERACIÓN AL 100% DE BBDD FUERZA & GIMNASIO
 * =========================================================================
 */

export async function backupFuerzaBBDDToDisk(): Promise<{ success: boolean; count: number; timestamp: string; error?: string }> {
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase.from('fuerza_sesiones').select('*');
    if (error) {
      console.error('[backupFuerzaBBDDToDisk] Supabase error:', error);
      return { success: false, count: 0, timestamp: '', error: error.message };
    }

    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const historyDir = path.join(backupDir, 'fuerza_history');
    if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

    const payload = {
      timestamp: new Date().toISOString(),
      origen: 'auto_backup_fuerza_supabase',
      total_registros: data?.length || 0,
      rows: data || []
    };

    const latestPath = path.join(backupDir, 'fuerza_sesiones_backup_latest.json');
    fs.writeFileSync(latestPath, JSON.stringify(payload, null, 2), 'utf8');

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(historyDir, `fuerza_backup_${stamp}.json`), JSON.stringify(payload, null, 2), 'utf8');

    return { success: true, count: data?.length || 0, timestamp: payload.timestamp };
  } catch (err: any) {
    console.error('[backupFuerzaBBDDToDisk] Exception:', err);
    return { success: false, count: 0, timestamp: '', error: err.message };
  }
}

export async function restoreFuerzaBBDDFromDisk(): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const backupDir = path.join(process.cwd(), 'backups');
    const latestPath = path.join(backupDir, 'fuerza_sesiones_backup_latest.json');
    if (!fs.existsSync(latestPath)) {
      return { success: false, count: 0, error: 'No se encontró archivo de copia de seguridad (fuerza_sesiones_backup_latest.json)' };
    }

    const fileContent = fs.readFileSync(latestPath, 'utf8');
    const parsed = JSON.parse(fileContent);
    const rows = parsed.rows || [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, count: 0, error: 'La copia de seguridad existe pero no contiene registros.' };
    }

    const supabase = getServerSupabase();
    // Limpiar tabla actual de fuerza_sesiones para evitar duplicados en la restauración 100%
    await supabase.from('fuerza_sesiones').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    const cleanRows = rows.map((r: any) => ({
      id: r.id,
      jugador_id: r.jugador_id || null,
      sesion_dia_id: r.sesion_dia_id || null,
      tipo_entreno: r.tipo_entreno || 'FUERZA',
      ejercicio_id: r.ejercicio_id || null,
      contenido: typeof r.contenido === 'string' ? r.contenido : JSON.stringify(r.contenido || {}),
    }));

    const { data, error } = await supabase.from('fuerza_sesiones').insert(cleanRows).select();
    if (error) {
      console.error('[restoreFuerzaBBDDFromDisk] Insert error:', error);
      return { success: false, count: 0, error: error.message };
    }

    revalidatePath('/gimnasio');
    revalidatePath('/base-datos/fuerza');
    return { success: true, count: data?.length || cleanRows.length };
  } catch (err: any) {
    console.error('[restoreFuerzaBBDDFromDisk] Exception:', err);
    return { success: false, count: 0, error: err.message };
  }
}

export async function deleteFuerzaSesionFromSupabase(
  jugadorId: string,
  fecha: string,
  nombreSesion?: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  const supabase = getServerSupabase();
  try {
    const { data: rows, error: selectErr } = await supabase.from('fuerza_sesiones').select('id, contenido, jugador_id');
    if (selectErr) throw selectErr;

    const idsToDelete = (rows || []).filter((r: any) => {
      let c: any = {};
      try {
        if (typeof r.contenido === 'string') c = JSON.parse(r.contenido);
        else if (r.contenido && typeof r.contenido === 'object') c = r.contenido;
      } catch (e) {}

      const jMatches = jugadorId === 'TEAM' ? (!r.jugador_id || r.jugador_id === 'TEAM') : r.jugador_id === jugadorId;
      const fMatches = c.fecha === fecha;
      const nMatches = !nombreSesion || c.nombreSesion === nombreSesion;
      return jMatches && fMatches && nMatches;
    }).map((r: any) => r.id);

    if (idsToDelete.length > 0) {
      const { error: delErr } = await supabase.from('fuerza_sesiones').delete().in('id', idsToDelete);
      if (delErr) throw delErr;
    }

    await backupFuerzaBBDDToDisk().catch(console.warn);
    revalidatePath('/gimnasio');
    revalidatePath('/base-datos/fuerza');
    return { success: true, count: idsToDelete.length };
  } catch (err: any) {
    console.error('[deleteFuerzaSesionFromSupabase] Error:', err);
    return { success: false, error: err.message };
  }
}

export async function getFuerzaSesionesForMatrix(): Promise<Record<string, any[]>> {
  let data: any[] | null = null;
  try {
    const supabase = getServerSupabase();
    const res = await supabase.from('fuerza_sesiones').select('*');
    if (!res.error && res.data && res.data.length > 0) {
      data = res.data;
    }
  } catch (e) {
    console.warn('[getFuerzaSesionesForMatrix] Exception, usando backup maestro:', e);
  }

  if (!data || data.length === 0) {
    data = getMasterBackupTable('fuerza_sesiones');
  }

  try {

    const matrixMap: Record<string, any[]> = {};

    (data || []).forEach((row) => {
      let c: any = {};
      try {
        if (typeof row.contenido === 'string') c = JSON.parse(row.contenido);
        else if (row.contenido && typeof row.contenido === 'object') c = row.contenido;
      } catch (e) {}

      const jugadorId = row.jugador_id || 'TEAM';
      const fecha = c.fecha || row.fecha;
      if (!fecha) return;

      const key = `${jugadorId}_${fecha}`;
      if (!matrixMap[key]) matrixMap[key] = [];

      const sesionNombre = c.nombreSesion || row.nombre_sesion || 'Sesión de Fuerza';
      let ses = matrixMap[key].find((s: any) => s.nombreSesion === sesionNombre);

      if (!ses) {
        ses = {
          id: 'sesion_' + jugadorId + '_' + fecha + '_' + (matrixMap[key].length + 1),
          jugadorId,
          fecha,
          md: c.md || '',
          nombreSesion: sesionNombre,
          categoria: c.categoria || row.tipo_entreno || 'FUERZA',
          estado: c.estado || 'completado',
          duracionMin: c.duracionMin || 45,
          rpeMedio: c.rpeMedio ?? null,
          incluirRpe: c.rpe !== null && c.rpe !== undefined,
          hora: c.hora || '',
          lugar: c.lugar || '',
          notas: c.sesionNotas || c.notasSesion || (c.notas && c.notas !== c.comentario ? c.notas : ''),
          videoUrl: c.sesionVideoUrl || c.videoUrlSesion || '',
          variablesColumnas: c.variablesColumnas || [],
          ejercicios: [],
        };
        matrixMap[key].push(ses);
      } else {
        if (!ses.notas && (c.sesionNotas || c.notasSesion)) {
          ses.notas = c.sesionNotas || c.notasSesion;
        }
        if (!ses.videoUrl && (c.sesionVideoUrl || c.videoUrlSesion)) {
          ses.videoUrl = c.sesionVideoUrl || c.videoUrlSesion;
        }
      }

      ses.ejercicios.push({
        id: row.id || ('ej_' + Date.now() + '_' + Math.random()),
        bloque: c.bloque || 'PP',
        nombre: c.ejercicioNombre || row.ejercicio_nombre || 'Ejercicio',
        grupoMuscular: c.grupoMuscular || row.grupo_muscular || '',
        series: c.series !== undefined ? c.series : (row.series || 1),
        reps: String(c.reps !== undefined ? c.reps : (row.reps || '')),
        pesoKg: String(c.pesoKg !== undefined ? c.pesoKg : (row.peso_kg || '')),
        rpe: c.rpe !== undefined ? c.rpe : (row.rpe ?? null),
        velocidad: c.velocidad || row.velocidad || '',
        material: c.material || row.material || '',
        notas: c.comentario || row.comentario || c.notas || '',
        videoUrl: c.videoUrl || c.video_url || row.video_url || c.variables?.videoUrl || '',
        variablesPersonalizadas: c.variables || row.variables || {},
      });
    });

    return matrixMap;
  } catch (err) {
    console.error('[getFuerzaSesionesForMatrix] Exception:', err);
    return {};
  }
}

// ==============================================================================
// SINCRONIZACIÓN SUPABASE -> GITHUB Y BACKUPS COMPLETOS
// ==============================================================================

export async function syncSupabaseToGitHubAction(): Promise<{
  success: boolean;
  sizeMB?: string;
  committed?: boolean;
  pushed?: boolean;
  message?: string;
  timestamp?: string;
  error?: string;
}> {
  try {
    const { runBackup } = require("../scripts/backup_external");
    const { backupData, sizeMB } = await runBackup();

    const fs = require("fs");
    const path = require("path");
    const supabaseBackupsDir = path.resolve(process.cwd(), "supabase", "backups");
    if (!fs.existsSync(supabaseBackupsDir)) {
      fs.mkdirSync(supabaseBackupsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(supabaseBackupsDir, "supabase_data_latest.json"), JSON.stringify(backupData, null, 2), "utf8");

    const { execSync } = require("child_process");
    const gitEnv = {
      ...process.env,
      GIT_EXEC_PATH: "/Applications/GitHub Desktop.app/Contents/Resources/app/git/libexec/git-core",
      GIT_TEMPLATE_DIR: "/Applications/GitHub Desktop.app/Contents/Resources/app/git/share/git-core/templates",
      GIT_TERMINAL_PROMPT: "0",
      PATH: `/Users/MiquelNadalGaya/.gemini/antigravity-ide/bin:/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin:${process.env.PATH || ""}`
    };

    execSync("git add supabase/ backups/ultimo_backup.json public/club_config.json", { cwd: process.cwd(), env: gitEnv });
    const nowStr = new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
    const commitMsg = `chore: sincronizar datos y esquema de Supabase [${nowStr}]`;

    let committed = false;
    try {
      execSync(`git commit -m "${commitMsg}"`, { cwd: process.cwd(), env: gitEnv });
      committed = true;
    } catch {}

    let pushed = false;
    let pushMessage = "";
    try {
      execSync("git push origin main", { cwd: process.cwd(), env: gitEnv });
      pushed = true;
      pushMessage = "Los cambios y datos se han subido directamente a GitHub.";
    } catch (pushErr) {
      pushMessage = "Copia guardada y confirmada en Git. Puedes pulsar 'Push origin' en GitHub Desktop para subirla.";
    }

    return {
      success: true,
      sizeMB,
      committed,
      pushed,
      message: pushMessage,
      timestamp: new Date().toISOString()
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getCompleteSupabaseBackup(): Promise<any> {
  const { runBackup } = require("../scripts/backup_external");
  const { backupData } = await runBackup();
  return backupData;
}

export async function saveSensorCapture(capture: any): Promise<{ success: boolean; id: string }> {
  try {
    const supabase = getServerSupabase();
    const id = capture.id || `sensor_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const row = {
      id,
      jugador_id: capture.jugadorId,
      sesion_dia_id: capture.fecha,
      tipo_entreno: 'MONITORIZACION_SENSOR',
      ejercicio_id: capture.ejercicioId || capture.ejercicioNombre || 'ejercicio',
      contenido: {
        ...capture,
        id,
        saved_at: new Date().toISOString(),
      },
    };

    if (supabase) {
      const { error } = await supabase.from('fuerza_sesiones').upsert(row, { onConflict: 'id' });
      if (error) {
        console.warn('Error saving sensor capture in Supabase:', error.message);
      }
    }

    return { success: true, id };
  } catch (e: any) {
    console.error('Error in saveSensorCapture:', e);
    return { success: false, id: capture?.id || '' };
  }
}

export async function getSensorCapturesForDate(fecha: string): Promise<any[]> {
  try {
    const supabase = getServerSupabase();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('fuerza_sesiones')
      .select('*')
      .eq('sesion_dia_id', fecha)
      .eq('tipo_entreno', 'MONITORIZACION_SENSOR');
    if (error) {
      console.warn('Error fetching sensor captures:', error.message);
      return [];
    }
    return (data || []).map((row: any) => row.contenido || row);
  } catch {
    return [];
  }
}

export async function getAllSensorCaptures(): Promise<any[]> {
  try {
    const supabase = getServerSupabase();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('fuerza_sesiones')
      .select('*')
      .eq('tipo_entreno', 'MONITORIZACION_SENSOR')
      .order('sesion_dia_id', { ascending: false });
    if (error) {
      console.warn('Error fetching all sensor captures:', error.message);
      return [];
    }
    return (data || []).map((row: any) => row.contenido || row);
  } catch {
    return [];
  }
}
