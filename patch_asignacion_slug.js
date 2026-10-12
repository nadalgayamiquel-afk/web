const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/informes/[slug]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `    // Si no hay asignación en playerEventsMap, comprobar en estado diario de Supabase/BBDD indexado
    const dayEstados = estadosByDate.get(fechaStr);`;

const replacement = `    // Si playerEventsMap tiene datos para este día, y el jugador no estaba, entonces estrictamente no está asignado.
    // Solo caemos en BBDD si playerEventsMap no tiene NINGÚN dato para este día (ej: dispositivo nuevo sin caché)
    let dayHasAnyEvents = false;
    if (playerEventsMap) {
      for (const k of Object.keys(playerEventsMap)) {
        if (k.includes(fechaStr) && playerEventsMap[k]) {
          dayHasAnyEvents = true;
          break;
        }
      }
    }
    if (dayHasAnyEvents) return false;

    // Si no hay asignación en playerEventsMap, comprobar en estado diario de Supabase/BBDD indexado
    const dayEstados = estadosByDate.get(fechaStr);`;

if (content.includes(target) && !content.includes('let dayHasAnyEvents = false;')) {
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Patched slug assignment fallback successfully");
} else {
    console.log("Could not patch or already patched slug.");
}
