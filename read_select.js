const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');
console.log(lines.slice(270, 310).join('\n'));
