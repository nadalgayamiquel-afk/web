const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/informes/partidos/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// The strict replacement was:
// const matchesDate = k.includes(fechaStr) || Boolean(sId && k.includes(sId));
// const isPaKey = k.endsWith("_Pa") || k.endsWith("_PaAm") || k.includes("_Pa_") || k.toLowerCase().includes("partido");
// if (matchesDate && isPaKey) {

const strictSearch = 'const matchesDate = k.includes(fechaStr) || Boolean(sId && k.includes(sId));\n        const isPaKey = k.endsWith("_Pa") || k.endsWith("_PaAm") || k.includes("_Pa_") || k.toLowerCase().includes("partido");\n        if (matchesDate && isPaKey) {';
const original = 'const matchesDate = k.includes(fechaStr) || Boolean(sId && k.includes(sId));\n        if (matchesDate) {';

if (content.includes(strictSearch)) {
    content = content.replace(strictSearch, original);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Reverted to original");
} else {
    console.log("Could not find strict search to revert. I will try the previous patch format.");
    const oldPatchSearch = 'const matchesDate = k.includes(fechaStr) || Boolean(sId && k.includes(sId));\n        const isPaKey = k.endsWith("_Pa") || k.endsWith("_PaAm") || k.toLowerCase().includes("partido") || k.includes("_ev_");\n        if (matchesDate && (isPaKey || k.includes("_Pa"))) {';
    if (content.includes(oldPatchSearch)) {
        content = content.replace(oldPatchSearch, original);
        fs.writeFileSync(file, content, 'utf8');
        console.log("Reverted from first patch");
    } else {
        console.log("NOTHING MATCHED");
    }
}
