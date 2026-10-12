#!/bin/bash
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Verificar si Docker está iniciado para Supabase local (puerto 54321)
if ! lsof -i :54321 >/dev/null 2>&1; then
    open -a "Docker" 2>/dev/null
fi

cd "/Users/MiquelNadalGaya/web" || exit 1

PID=$(lsof -ti :3000 2>/dev/null)
if [ -z "$PID" ]; then
    echo "Iniciando servidor de desarrollo Next.js..."
    nohup npm run dev > /tmp/nextjs_manresa.log 2>&1 &
    disown
    
    for i in {1..30}; do
        if lsof -i :3000 > /dev/null 2>&1; then
            break
        fi
        sleep 0.5
    done
fi

open "http://localhost:3000"
osascript -e 'display notification "Servidor activo en http://localhost:3000" with title "CE Manresa Web" sound name "default"' 2>/dev/null
