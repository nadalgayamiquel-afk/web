const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/informes/partidos/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /(\s*\/\/\s*Si playerEventsMap tiene datos para este día[\s\S]*?if \(dayHasAnyEvents\) return false;\n)([\s\S]*?if \(assignedStr\.trim\(\)\) \{[\s\S]*?return codesList\.includes[\s\S]*?\}\n)/m;

const match = content.match(regex);
if (match) {
    const dayHasAnyEvents = match[1];
    const assignedStrBlock = match[2];

    const replacement = assignedStrBlock + dayHasAnyEvents;
    content = content.replace(regex, replacement);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Fixed assigned logic order!");
} else {
    console.log("Could not find blocks to fix order");
}
