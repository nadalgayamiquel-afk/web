const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Remove sidebar-controls completely
const regex = /<div className="sidebar-controls">[\s\S]*?<\/select>\s*<\/div>/;
content = content.replace(regex, '');

fs.writeFileSync(file, content);
