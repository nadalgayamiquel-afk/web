const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/informes/partidos/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `    // 3. Fallback: minutos de la sesión completa
    return getMinutosSesion(sesion);`;

const replacement = `    // 3. Fallback: minutos de la sesión completa
    // NUEVO: Si el mapa de minutos tiene registros de otros jugadores para este evento, significa que ya se pasaron los minutos.
    // Si llegamos hasta aquí, el jugador no tiene minutos. Por tanto, es 0.
    if (minutesMap && typeof minutesMap === "object") {
      let matchHasMinutes = false;
      for (const k of Object.keys(minutesMap)) {
        if (k.includes(fechaStr) && (k.endsWith("_Pa") || k.endsWith("_PaAm") || k.toLowerCase().includes("partido") || k.includes("_ev_"))) {
          matchHasMinutes = true;
          break;
        }
      }
      if (matchHasMinutes) {
        return 0; // El entrenador ya registró los minutos del partido, este jugador no está en la lista.
      }
    }
    return getMinutosSesion(sesion);`;

if (content.includes(target) && !content.includes('let matchHasMinutes = false;')) {
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Patched fallback successfully");
} else {
    console.log("Could not patch fallback or already patched");
}
