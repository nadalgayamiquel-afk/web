const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/informes/partidos/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `    const tieneAsignacionPa = jugadorTieneAsignadoEvento(jugador, fechaStr, "Pa");
    if (!tieneAsignacionPa) {
      return 0;
    }`;

const replacement = `    const tieneAsignacionPa = jugadorTieneAsignadoEvento(jugador, fechaStr, "Pa");
    if (jugador.nombre.toLowerCase().includes('oussama') && fechaStr === '2026-09-06') {
      console.log('--- DEBUG OUSSAMA ARNEDO ---');
      console.log('tieneAsignacionPa:', tieneAsignacionPa);
      console.log('playerEventsMap:', typeof playerEventsMap !== 'undefined' ? JSON.stringify(playerEventsMap).substring(0, 50) + '...' : 'undefined');
    }
    if (!tieneAsignacionPa) {
      return 0;
    }`;

if (content.includes(target) && !content.includes('DEBUG OUSSAMA ARNEDO')) {
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Injected log for Oussama successfully");
} else {
    console.log("Could not inject log or already injected");
}
