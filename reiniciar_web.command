#!/bin/bash

# Exportar rutas habituales de Node/npm en macOS
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Navegar a la carpeta del proyecto
cd "/Users/MiquelNadalGaya/web" || exit 1

# Detener cualquier proceso anterior en el puerto 3000
PIDS=$(lsof -ti :3000 2>/dev/null)
if [ -n "$PIDS" ]; then
    kill -9 $PIDS 2>/dev/null
    sleep 1
fi

echo "Reiniciando servidor de desarrollo Next.js..."
nohup npm run dev > /tmp/nextjs_manresa.log 2>&1 &

# Esperar a que el puerto 3000 esté levantado
for i in {1..30}; do
    if lsof -i :3000 > /dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

# Abrir el navegador en localhost:3000
open "http://localhost:3000"
osascript -e 'display notification "Servidor reiniciado con éxito" with title "CE Manresa Web" sound name "default"' 2>/dev/null
