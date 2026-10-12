const fs = require("fs");
const file = "/Users/MiquelNadalGaya/web/app/actions.ts";
let content = fs.readFileSync(file, "utf8");

const oldBlock = `    const [sesionesRes, jugadoresRes, estadosRes] = await Promise.all([
      sesQuery,
      jugQuery,
      supabase.from("estado_diario_jugador").select("*"),
    ]);

    const sesionesRaw = sesionesRes.data || [];
    const jugadores = jugadoresRes.data || [];
    const rawEstados = estadosRes.data || [];
    
    // Crear mapa de estados e indexar
    const estadosMap = new Map();
    rawEstados.forEach(e => {
       estadosMap.set(\`\${e.jugador_id}_\${e.sesion_dia_id}\`, e);
    });`;

const newBlock = `    const [sesionesRes, jugadoresRes, estadosRes, minutosRes, comentariosRes] = await Promise.all([
      sesQuery,
      jugQuery,
      supabase.from("estado_diario_jugador").select("*"),
      supabase.from("minutos_jugador_evento").select("*"),
      supabase.from("comentarios_diarios_jugador").select("*"),
    ]);

    const sesionesRaw = sesionesRes.data || [];
    const jugadores = jugadoresRes.data || [];
    const rawEstados = estadosRes.data || [];
    const rawMinutos = minutosRes.data || [];
    const rawComentarios = comentariosRes.data || [];
    
    // Crear mapas
    const estadosMap = new Map();
    rawEstados.forEach(e => {
       estadosMap.set(\`\${e.jugador_id}_\${e.sesion_dia_id}\`, e);
    });

    const minutosMap = new Map();
    rawMinutos.forEach(m => {
       // m.evento_id is often the session ID if it's a match, or they map to fecha
       minutosMap.set(\`\${m.jugador_id}_\${m.fecha}\`, m);
    });

    const comentariosMap = new Map();
    rawComentarios.forEach(c => {
       comentariosMap.set(\`\${c.jugador_id}_\${c.fecha}\`, c);
    });`;

if (content.includes("const [sesionesRes, jugadoresRes, estadosRes] = await Promise.all([")) {
  content = content.replace(oldBlock, newBlock);

  // Now replace the inside of the loop where rows are pushed
  const oldPush = `duracion_evento: e?.duracion_evento || "",
            orientacion_evento: "",
            carga_evento: s.carga || "",
            comentario_general_evento: "",
            num_jugadores_evento: null,
            realiza_evento: e?.disponibilidad === "D" || !e?.disponibilidad ? "SI" : "NO",
            objetivo: e?.objetivo || "",
            comentario_wellness: e?.comentario_wellness || "",
            comentario_fisioterapia: e?.comentario_lesiones || "",
            comentario_medico: e?.comentario_medico || "",
            comentario_nutricional: e?.comentario_nutricion || "",
            comentario_preparacion_fisica: e?.comentario_fisico || "",
            comentario_tecnico_tactico: e?.comentario_tecnico || "",`;

  const newPush = `duracion_evento: m?.duracion || m?.minutos || e?.duracion_evento || "",
            orientacion_evento: "",
            carga_evento: s.carga || "",
            comentario_general_evento: c?.texto || "",
            num_jugadores_evento: null,
            realiza_evento: m?.realiza || (e?.disponibilidad === "D" || !e?.disponibilidad ? "SI" : "NO"),
            objetivo: e?.objetivo || "",
            comentario_wellness: e?.comentario_wellness || "",
            comentario_fisioterapia: e?.comentario_lesiones || "",
            comentario_medico: e?.comentario_medico || "",
            comentario_nutricional: e?.comentario_nutricion || "",
            comentario_preparacion_fisica: e?.comentario_fisico || "",
            comentario_tecnico_tactico: e?.comentario_tecnico || "",`;

  // We need to inject `const m = minutosMap.get(...)` and `const c = comentariosMap.get(...)`
  const oldLoopStart = `jugadores.forEach(p => {
          const e = estadosMap.get(\`\${p.id}_\${s.id}\`);
          
          rows.push({`;

  const newLoopStart = `jugadores.forEach(p => {
          const e = estadosMap.get(\`\${p.id}_\${s.id}\`);
          const m = minutosMap.get(\`\${p.id}_\${s.fecha}\`);
          const c = comentariosMap.get(\`\${p.id}_\${s.fecha}\`);
          
          rows.push({`;

  content = content.replace(oldPush, newPush);
  content = content.replace(oldLoopStart, newLoopStart);

  fs.writeFileSync(file, content);
  console.log("Patched getFullExcelBBDDRows successfully");
} else {
  console.log("Could not find the target block to patch");
}
