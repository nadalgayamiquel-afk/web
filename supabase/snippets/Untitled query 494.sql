CREATE TABLE public.minutos_jugador_evento (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    jugador_id text NOT NULL,
    fecha date NOT NULL,
    evento_id text NOT NULL,
    duracion integer NOT NULL DEFAULT 0,
    realiza boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Esta restricción única es clave para que funcione el 'upsert' del código al actualizar
    CONSTRAINT unique_jugador_fecha_evento UNIQUE (jugador_id, fecha, evento_id)
);

-- Permisos necesarios si usas RLS (si tienes las reglas activadas)
ALTER TABLE public.minutos_jugador_evento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for authenticated users" ON public.minutos_jugador_evento FOR ALL USING (true);
