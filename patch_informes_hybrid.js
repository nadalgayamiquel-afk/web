const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/informes/partidos/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const original = 'const matchesDate = k.includes(fechaStr) || Boolean(sId && k.includes(sId));\n        if (matchesDate) {';
const hybrid = `const matchesDate = k.includes(fechaStr) || Boolean(sId && k.includes(sId));
        const isPaKey = k.endsWith("_Pa") || k.endsWith("_PaAm") || k.includes("_Pa_") || k.toLowerCase().includes("partido");
        let shouldProcess = false;
        if (matchesDate) {
          if (fechaStr >= "2026-08-16") {
             shouldProcess = isPaKey;
          } else {
             shouldProcess = true;
          }
        }
        if (shouldProcess) {`;

if (content.includes(original)) {
    content = content.replace(original, hybrid);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Patched hybrid logic successfully");
} else {
    console.log("Could not find original code block.");
}
