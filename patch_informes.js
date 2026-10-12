const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/informes/partidos/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const injection = `
    // NUEVA REGLA: Si existe un registro de minutos explícito en minutesMap (viene de BBDD minutos_jugador_evento)
    if (minutesMap) {
      for (const [k, val] of Object.entries(minutesMap)) {
        if (!val) continue;
        const cleanEv = evCode.trim().toLowerCase();
        const keyLower = k.toLowerCase();
        if (keyLower.includes(fechaStr)) {
          // Check if it ends with the event code
          if (keyLower.endsWith('_' + cleanEv) || keyLower.includes('_' + cleanEv + '_')) {
            const prefix = k.split(fechaStr)[0].replace(/_$/, "") || k.split("_")[0];
            if (isPlayerMatch(prefix, jugador)) {
              return true;
            }
          }
        }
      }
    }
`;

if (!content.includes('NUEVA REGLA: Si existe un registro')) {
    content = content.replace(
        'let assignedStr = "";',
        injection + '\n    let assignedStr = "";'
    );
    fs.writeFileSync(file, content, 'utf8');
    console.log("Patched successfully");
} else {
    console.log("Already patched");
}
