const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/informes/partidos/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /(\/\/\s*NUEVA REGLA: Si existe un registro de minutos explícito en minutesMap[\s\S]*?\}\n    \}\n\n)([\s\S]*?)(\/\/\s*Si playerEventsMap tiene datos para este día[\s\S]*?if \(dayHasAnyEvents\) return false;\n)/m;

const match = content.match(regex);
if (match) {
    const nuevaRegla = match[1];
    const middleCode = match[2];
    const dayHasAnyEvents = match[3];

    // Swap dayHasAnyEvents to be ABOVE nuevaRegla
    const replacement = dayHasAnyEvents + "\n" + middleCode + nuevaRegla;
    content = content.replace(regex, replacement);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Swapped order successfully");
} else {
    console.log("Could not find the blocks to swap");
}
