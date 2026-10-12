const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/informes/partidos/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `    // 3. Si está asignado, buscar en Supabase / BBDD estado diario indexado`;
const replacement = `    // Si no tiene GPS ni minutos explícitos en un partido, ha jugado 0 minutos. (El estado general de la sesión daría 90 a todos por error).
    return 0;

    // 3. Si está asignado, buscar en Supabase / BBDD estado diario indexado`;

if (content.includes(target) && !content.includes('Si no tiene GPS ni minutos explícitos en un partido')) {
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Patched step 3 successfully");
} else {
    console.log("Could not patch step 3 or already patched");
}
