const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/informes/partidos/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetRegex = /if \(minutesMap && typeof minutesMap === "object"\) \{[\s\S]*?\/\/ 2\. Si está asignado, buscar en GPS/m;

const replacement = `if (minutesMap && typeof minutesMap === "object") {
      let bestMin = undefined;
      let foundPa = false;

      for (const [k, val] of Object.entries(minutesMap)) {
        if (!val) continue;
        const matchesDate = k.includes(fechaStr) || Boolean(sId && k.includes(sId));
        if (matchesDate) {
          let prefix = k;
          if (prefix.includes(fechaStr)) {
            prefix = prefix.split(fechaStr)[0].replace(/_$/, "");
          } else if (sId && prefix.includes(sId)) {
            prefix = prefix.split(sId)[0].replace(/_$/, "");
          } else {
            prefix = k.split("_")[0];
          }

          if (isPlayerMatch(prefix, jugador)) {
            const entry = val as any;
            const rawMin = typeof entry === "number" ? entry : (entry.minutos ?? entry.duracion ?? entry.min);
            if (rawMin !== undefined && rawMin !== null && rawMin !== "") {
              const num = Number(rawMin);
              if (!isNaN(num) && num >= 0) {
                const isPaKey = k.endsWith("_Pa") || k.endsWith("_PaAm") || k.includes("_Pa_") || k.toLowerCase().includes("partido");
                if (isPaKey) {
                  return num; // Si encontramos la clave de BBDD explícita de partido, la devolvemos ya
                }
                // Si no, la guardamos por si no hay clave _Pa (para datos de localstorage antiguos o no sincronizados)
                if (bestMin === undefined) bestMin = num;
              }
            }
          }
        }
      }
      
      if (bestMin !== undefined) {
        return bestMin;
      }
    }

    // 2. Si está asignado, buscar en GPS`;

content = content.replace(targetRegex, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log("Patched extraction to prioritize _Pa but allow _ev_");
