#!/bin/bash

# Exportar rutas habituales de Node/npm en macOS
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Navegar a la carpeta del proyecto
cd "/Users/MiquelNadalGaya/web" || exit 1

# Buscar procesos en el puerto 3000 y detenerlos
PIDS=$(lsof -ti :3000 2>/dev/null)
if [ -n "$PIDS" ]; then
    kill -9 $PIDS 2>/dev/null
    echo "Servidor detenido correctamente."
    osascript -e 'display notification "Servidor detenido correctamente" with title "CE Manresa Web" sound name "default"' 2>/dev/null
else
    echo "El servidor ya estaba apagado."
    osascript -e 'display notification "El servidor ya estaba apagado" with title "CE Manresa Web"' 2>/dev/null
fi
