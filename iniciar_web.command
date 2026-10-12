#!/bin/bash

# Exportar rutas habituales de Node/npm en macOS
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Navegar a la carpeta del proyecto
cd "/Users/MiquelNadalGaya/web" || exit 1

# Comprobar si el servidor ya está activo en el puerto 3000
PID=$(lsof -ti :3000 2>/dev/null)
if [ -z "$PID" ]; then
    echo "Iniciando servidor de desarrollo Next.js..."
    nohup npm run dev > /tmp/nextjs_manresa.log 2>&1 &
    
    # Esperar hasta que el puerto 3000 esté levantado (máx 15 segundos)
    for i in {1..30}; do
        if lsof -i :3000 > /dev/null 2>&1; then
            break
        fi
        sleep 0.5
    done
fi

# Abrir el navegador en localhost:3000
open "http://localhost:3000"
osascript -e 'display notification "Servidor activo en http://localhost:3000" with title "CE Manresa Web" sound name "default"' 2>/dev/null
