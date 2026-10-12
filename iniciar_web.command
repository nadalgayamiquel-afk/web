#!/bin/bash
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

cd "/Users/MiquelNadalGaya/web" || exit 1

PID=$(lsof -ti :3000 2>/dev/null)
if [ -z "$PID" ]; then
    echo "Iniciando servidor Next.js..."
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
osascript -e 'display notification "Servidor activo en http://localhost:3000" with title "Top Play Training Web" sound name "default"' 2>/dev/null
