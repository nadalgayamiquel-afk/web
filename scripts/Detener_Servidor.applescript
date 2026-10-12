do shell script "export PATH='/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:'$PATH; PIDS=$(lsof -ti :3000 2>/dev/null); if [ -n \"$PIDS\" ]; then kill -9 $PIDS; fi"
display notification "Servidor detenido correctamente" with title "CE Manresa Web" sound name "default"
