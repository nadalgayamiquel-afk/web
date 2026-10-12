const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/informes/partidos/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Patch in getMinutosSesion
content = content.replace(
    'const isPaKey = k.endsWith("_Pa") || k.endsWith("_PaAm") || k.toLowerCase().includes("partido") || k.includes("_ev_");\n        if (matchesDate && (isPaKey || k.includes("_Pa"))) {',
    'const isPaKey = k.endsWith("_Pa") || k.endsWith("_PaAm") || k.includes("_Pa_") || k.toLowerCase().includes("partido");\n        if (matchesDate && isPaKey) {'
);

fs.writeFileSync(file, content, 'utf8');
console.log("Patched strict successfully");
