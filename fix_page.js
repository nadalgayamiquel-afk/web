const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/PRIMERA_RFEF_G2/g, 'PRIMERA_RFEF_G2_2627');

fs.writeFileSync(file, content);
