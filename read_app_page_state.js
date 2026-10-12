const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/page.tsx';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');
console.log(lines.slice(0, 150).join('\n'));
