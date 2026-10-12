const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data: jugadores } = await supabase.from('jugadores').select('id, nombre, apodo').eq('activo', true);
  const { data: estados } = await supabase.from('estado_diario_jugador').select('*').eq('fecha', '2026-09-06');
  const { data: minutos } = await supabase.from('minutos_jugador_evento').select('*').eq('fecha', '2026-09-06');
  
  const minutosMap = {};
  for (const m of minutos) {
      minutosMap[`${m.jugador_id}_2026-09-06_Pa`] = { minutos: m.duracion, titularidad: m.titularidad || "N" };
  }
  
  const estadosByDate = new Map();
  estadosByDate.set('2026-09-06', estados);

  function isPlayerMatch(rawId, j) {
    if (!rawId || !j) return false;
    const strId = String(rawId).toLowerCase();
    const jId = String(j.id).toLowerCase();
    return strId === jId;
  }

  const jugadorTieneAsignadoEvento = (jugador) => {
      const dayEstados = estadosByDate.get('2026-09-06');
      if (dayEstados) {
          const st = dayEstados.find(e => isPlayerMatch(e.jugador_id, jugador));
          if (st) {
              const realiza = String(st.realiza_evento || "").trim().toUpperCase();
              const tipoDeEv = String(st.tipo_de_evento || "").trim().toLowerCase();
              if (realiza === "NO") return false;
              if (tipoDeEv.includes("pa") || tipoDeEv.includes("partido")) return true;
          }
      }
      return false;
  };

  for (const j of jugadores) {
      if (!j.nombre.toLowerCase().includes('oussama') && !j.nombre.toLowerCase().includes('igle') && !j.nombre.toLowerCase().includes('bilal') && !j.nombre.toLowerCase().includes('roger')) continue;
      
      const tieneAsignacionPa = jugadorTieneAsignadoEvento(j);
      let mins = 0;
      let matchedKey = null;
      if (tieneAsignacionPa) {
          for (const [k, val] of Object.entries(minutosMap)) {
              if (k.startsWith(j.id)) {
                  mins = val.minutos;
                  matchedKey = k;
                  break;
              }
          }
      }
      console.log(`${j.nombre}: Asignado=${tieneAsignacionPa}, Minutos=${mins}, Key=${matchedKey}`);
  }
}
test();
