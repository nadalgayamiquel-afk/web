import Link from 'next/link';

type Enlace = { nombre: string; ruta: string };

const pantallasSueltas: Enlace[] = [
  { nombre: 'Deportistas', ruta: '/deportistas' },
  { nombre: 'Planificación', ruta: '/calendario' },
  { nombre: 'Calendario', ruta: '/eventos' },
  { nombre: 'Campo', ruta: '/campo' },
  { nombre: 'Gimnasio', ruta: '/gimnasio' },
  { nombre: 'Partidos', ruta: '/partidos' },
  { nombre: 'Testing', ruta: '/testing' },
  { nombre: 'Plan Semanal', ruta: '/agenda' },
];

const informes: Enlace[] = [
  { nombre: 'Report Sesión', ruta: '/informes/gps-diario' },
  { nombre: 'Report Microciclo', ruta: '/informes/microciclo' },
  { nombre: 'Report Mesociclo', ruta: '/informes/mesociclo' },
  { nombre: 'Report Anual', ruta: '/informes/anual' },
  { nombre: 'Report Partidos', ruta: '/informes/partidos' },
  { nombre: 'Multas', ruta: '/informes/multas' },
];

const baseDatos: Enlace[] = [
  { nombre: 'General (BBDD)', ruta: '/base-datos/bbdd' },
  { nombre: 'GPS', ruta: '/base-datos/gps' },
  { nombre: 'Lesiones', ruta: '/base-datos/lesiones' },
  { nombre: 'Tests', ruta: '/base-datos/tests' },
  { nombre: 'Fuerza', ruta: '/base-datos/fuerza' },
  { nombre: 'Campo', ruta: '/base-datos/campo' },
  { nombre: 'Ejercicios', ruta: '/base-datos/ejercicios' },
  { nombre: 'Ejercicios Campo', ruta: '/base-datos/ejercicios-campo' },
  { nombre: 'Rutinas', ruta: '/base-datos/rutinas' },
  { nombre: 'Grupos', ruta: '/base-datos/grupos' },
];

function Seccion({ titulo, enlaces, color }: { titulo: string; enlaces: Enlace[]; color: string }) {
  return (
    <div className="mb-10">
      <h2 className={`text-sm font-semibold uppercase tracking-wide mb-3 ${color}`}>{titulo}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {enlaces.map((e) => (
          <Link
            key={e.ruta}
            href={e.ruta}
            className="block border rounded-lg p-3 bg-white hover:border-blue-400 hover:shadow-sm transition text-sm text-slate-700"
          >
            {e.nombre}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="p-6 max-w-5xl mx-auto">
      <p className="text-sm text-slate-500 uppercase tracking-wide">Top Play Training</p>
      <h1 className="text-3xl font-bold text-blue-900 mb-6">Centro de Control</h1>

      {/* BANNER DE VICTORIA DESTACADA */}
      <div className="mb-8 p-5 bg-gradient-to-r from-emerald-900 via-slate-900 to-blue-950 rounded-xl border border-emerald-500 text-white shadow-lg relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="bg-emerald-500 text-white text-xs font-black px-2.5 py-1 rounded tracking-wide uppercase">
              🏆 ¡VICTORIA OFICIAL!
            </span>
            <span className="bg-white/10 text-emerald-200 text-xs font-bold px-2.5 py-1 rounded">
              Jornada 1 · Segunda Federación
            </span>
          </div>
          <span className="text-xs text-emerald-300 font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-sm shadow-emerald-400" />
            Finalizado · Hoy Domingo 6 Sep
          </span>
        </div>

        <div className="grid grid-cols-3 items-center bg-slate-900/60 p-4 rounded-lg border border-white/10 mb-4">
          {/* Equipo Local: CD Arnedo */}
          <div className="text-right flex items-center justify-end gap-3">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">
                Local
              </span>
              <h3 className="text-base font-black text-white">CD ARNEDO</h3>
            </div>
            <img src="https://tmssl.akamaized.net/images/wappen/head/59757.png" alt="CD Arnedo" className="w-9 h-9 object-contain" />
          </div>

          {/* Marcador */}
          <div className="text-center">
            <div className="text-3xl font-black text-white tracking-wider flex items-center justify-center gap-2">
              <span className="text-slate-200">1</span>
              <span className="text-slate-400 text-xl">-</span>
              <span className="text-emerald-400">2</span>
            </div>
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
              +3 Pts Fuera
            </span>
          </div>

          {/* Equipo Visitante: CE Manresa (Ganador) */}
          <div className="text-left flex items-center justify-start gap-3">
            <img src="/ce-manresa.png" alt="CE Manresa" className="w-9 h-9 object-contain" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Visitante</span>
                <span className="text-[10px] text-yellow-300 font-extrabold uppercase bg-yellow-400/20 px-1.5 py-0.5 rounded">
                  Ganador
                </span>
              </div>
              <h3 className="text-base font-black text-white">CE MANRESA</h3>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
          <p className="m-0">
            🔥 <strong>Gran debut liguero a domicilio:</strong> Victoria 1 - 2 en el campo del CD Arnedo para comenzar la temporada sumando de 3 como visitante.
          </p>
          <div className="flex gap-2">
            <Link href="/informes/gps-diario" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded transition">
              📊 Reporte GPS
            </Link>
            <Link href="/partidos" className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 rounded transition">
              🏆 Ficha de Partido
            </Link>
          </div>
        </div>
      </div>

      <Seccion titulo="Pantallas" enlaces={pantallasSueltas} color="text-blue-800" />
      <Seccion titulo="Informes" enlaces={informes} color="text-orange-600" />
      <Seccion titulo="Base de Datos" enlaces={baseDatos} color="text-slate-500" />
    </main>
  );
}
