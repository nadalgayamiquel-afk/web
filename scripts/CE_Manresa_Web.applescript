set isRunning to false
try
	set pidCheck to do shell script "export PATH='/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:'$PATH; lsof -ti :3000"
	if pidCheck is not "" then
		set isRunning to true
	end if
end try

if isRunning then
	set dialogResult to display dialog "🟢 El servidor CE Manresa Web está ACTIVO." & return & return & "¿Qué deseas hacer?" buttons {"Detener Servidor", "Reiniciar", "Abrir Web"} default button "Abrir Web" with title "CE Manresa Web" with icon note
	set userChoice to button returned of dialogResult
	
	if userChoice is "Abrir Web" then
		open location "http://localhost:3000"
	else if userChoice is "Detener Servidor" then
		do shell script "export PATH='/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:'$PATH; PIDS=$(lsof -ti :3000 2>/dev/null); if [ -n \"$PIDS\" ]; then kill -9 $PIDS; fi"
		display notification "Servidor detenido correctamente" with title "CE Manresa Web" sound name "default"
	else if userChoice is "Reiniciar" then
		do shell script "export PATH='/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:'$PATH; cd /Users/MiquelNadalGaya/web; PIDS=$(lsof -ti :3000 2>/dev/null); if [ -n \"$PIDS\" ]; then kill -9 $PIDS; sleep 1; fi; nohup npm run dev > /tmp/nextjs_manresa.log 2>&1 &"
		
		repeat 30 times
			try
				set checkPort to do shell script "export PATH='/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:'$PATH; lsof -ti :3000"
				if checkPort is not "" then exit repeat
			end try
			delay 0.5
		end repeat
		
		open location "http://localhost:3000"
		display notification "Servidor reiniciado con éxito" with title "CE Manresa Web" sound name "default"
	end if
else
	do shell script "export PATH='/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:'$PATH; cd /Users/MiquelNadalGaya/web; nohup npm run dev > /tmp/nextjs_manresa.log 2>&1 &"
	
	repeat 30 times
		try
			set checkPort to do shell script "export PATH='/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:'$PATH; lsof -ti :3000"
			if checkPort is not "" then exit repeat
		end try
		delay 0.5
	end repeat
	
	open location "http://localhost:3000"
	display notification "Servidor iniciado en http://localhost:3000" with title "CE Manresa Web" sound name "default"
end if
