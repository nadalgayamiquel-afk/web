const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /<div>\s*<h1>top play <strong>training<\/strong><\/h1>\s*<span className="subtitle">\{clubConfig\.siglas \|\| "PANEL DE CONTROL"\}<\/span>\s*<\/div>/g;

content = content.replace(regex, '');

fs.writeFileSync(file, content);
