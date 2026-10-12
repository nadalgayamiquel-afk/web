const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/informes/partidos/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Delete NUEVA REGLA block
const nuevaReglaRegex = /\/\/\s*NUEVA REGLA: Si existe un registro de minutos explícito en minutesMap[\s\S]*?\}\n    \}\n\n/m;
content = content.replace(nuevaReglaRegex, '');

// 2. Restore strict hybrid extraction loop
const extractionRegex = /if \(minutesMap && typeof minutesMap === "object"\) \{[\s\S]*?\/\/ 2\. Si está asignado, buscar en GPS/m;
const strictHybrid = `if (minutesMap && typeof minutesMap === "object") {
      for (const [k, val] of Object.entries(minutesMap)) {
        if (!val) continue;
        const matchesDate = k.includes(fechaStr) || Boolean(sId && k.includes(sId));
        const isPaKey = k.endsWith("_Pa") || k.endsWith("_PaAm") || k.includes("_Pa_") || k.toLowerCase().includes("partido");
        let shouldProcess = false;
        if (matchesDate) {
          if (fechaStr >= "2026-08-16") {
             shouldProcess = isPaKey;
          } else {
             shouldProcess = true;
          }
        }
        if (shouldProcess) {
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
              if (!isNaN(num) && num >= 0) return num;
            }
          }
        }
      }
    }

    // 2. Si está asignado, buscar en GPS`;

content = content.replace(extractionRegex, strictHybrid);
fs.writeFileSync(file, content, 'utf8');
console.log("Patched final fix successfully");
