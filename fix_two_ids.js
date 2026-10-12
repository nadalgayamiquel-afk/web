const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/lib/rivales.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/head\/7196\.png/, 'head/7077.png');
content = content.replace(/head\/2812\.png/, 'head/5648.png');

fs.writeFileSync(file, content);
