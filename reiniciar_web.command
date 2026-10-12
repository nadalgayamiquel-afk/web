#!/bin/bash
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

cd "/Users/MiquelNadalGaya/web" || exit 1

PIDS=$(lsof -ti :3000 2>/dev/null)
if [ -n "$PIDS" ]; then
    kill -9 $PIDS 2>/dev/null
    sleep 1
fi

echo "Reiniciando servidor Next.js..."
nohup npm run dev > /tmp/nextjs_manresa.log 2>&1 &
disown

for i in {1..30}; do
    if lsof -i :3000 > /dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

open "http://localhost:3000"
osascript -e 'display notification "Servidor reiniciado con éxito" with title "Top Play Training Web" sound name "default"' 2>/dev/null
