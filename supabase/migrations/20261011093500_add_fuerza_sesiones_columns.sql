-- Migración: Separar las variables de fuerza_sesiones como columnas dedicadas en Supabase
-- Fecha: 2026-10-11

ALTER TABLE "public"."fuerza_sesiones"
  ADD COLUMN IF NOT EXISTS "fecha" date,
  ADD COLUMN IF NOT EXISTS "md" text,
  ADD COLUMN IF NOT EXISTS "jugador_nombre" text,
  ADD COLUMN IF NOT EXISTS "dorsal" text,
  ADD COLUMN IF NOT EXISTS "posicion" text,
  ADD COLUMN IF NOT EXISTS "nombre_sesion" text,
  ADD COLUMN IF NOT EXISTS "categoria" text,
  ADD COLUMN IF NOT EXISTS "ejercicio_nombre" text,
  ADD COLUMN IF NOT EXISTS "grupo_muscular" text,
  ADD COLUMN IF NOT EXISTS "series" text,
  ADD COLUMN IF NOT EXISTS "reps" text,
  ADD COLUMN IF NOT EXISTS "peso_kg" text,
  ADD COLUMN IF NOT EXISTS "rpe" numeric,
  ADD COLUMN IF NOT EXISTS "comentario" text,
  ADD COLUMN IF NOT EXISTS "estado" text DEFAULT 'completado',
  ADD COLUMN IF NOT EXISTS "tiempo" text,
  ADD COLUMN IF NOT EXISTS "velocidad" text,
  ADD COLUMN IF NOT EXISTS "material" text,
  ADD COLUMN IF NOT EXISTS "potencia" text,
  ADD COLUMN IF NOT EXISTS "variables" jsonb DEFAULT '{}'::jsonb;

-- Migrar datos estructurados desde el campo JSON 'contenido' a las columnas dedicadas
DO $$
BEGIN
  UPDATE "public"."fuerza_sesiones"
  SET
    fecha = CASE 
      WHEN fecha IS NULL AND contenido LIKE '{%' THEN (contenido::jsonb->>'fecha')::date 
      ELSE fecha 
    END,
    md = COALESCE(md, CASE WHEN contenido LIKE '{%' THEN contenido::jsonb->>'md' END),
    jugador_nombre = COALESCE(jugador_nombre, CASE WHEN contenido LIKE '{%' THEN contenido::jsonb->>'jugadorNombre' END),
    dorsal = COALESCE(dorsal, CASE WHEN contenido LIKE '{%' THEN contenido::jsonb->>'dorsal' END),
    posicion = COALESCE(posicion, CASE WHEN contenido LIKE '{%' THEN contenido::jsonb->>'posicion' END),
    nombre_sesion = COALESCE(nombre_sesion, CASE WHEN contenido LIKE '{%' THEN contenido::jsonb->>'nombreSesion' END),
    categoria = COALESCE(categoria, tipo_entreno, CASE WHEN contenido LIKE '{%' THEN contenido::jsonb->>'categoria' END),
    ejercicio_nombre = COALESCE(ejercicio_nombre, CASE WHEN contenido LIKE '{%' THEN COALESCE(contenido::jsonb->>'ejercicioNombre', contenido::jsonb->>'ejercicio') END),
    grupo_muscular = COALESCE(grupo_muscular, CASE WHEN contenido LIKE '{%' THEN contenido::jsonb->>'grupoMuscular' END),
    series = COALESCE(series, CASE WHEN contenido LIKE '{%' THEN contenido::jsonb->>'series' END),
    reps = COALESCE(reps, CASE WHEN contenido LIKE '{%' THEN contenido::jsonb->>'reps' END),
    peso_kg = COALESCE(peso_kg, CASE WHEN contenido LIKE '{%' THEN contenido::jsonb->>'pesoKg' END),
    rpe = COALESCE(rpe, CASE WHEN contenido LIKE '{%' AND (contenido::jsonb->>'rpe') ~ '^[0-9]+(\.[0-9]+)?$' THEN (contenido::jsonb->>'rpe')::numeric END),
    comentario = COALESCE(comentario, CASE WHEN contenido LIKE '{%' THEN COALESCE(contenido::jsonb->>'comentario', contenido::jsonb->>'notas') END),
    estado = COALESCE(estado, CASE WHEN contenido LIKE '{%' THEN contenido::jsonb->>'estado' END),
    tiempo = COALESCE(tiempo, CASE WHEN contenido LIKE '{%' THEN COALESCE(contenido::jsonb->'variables'->>'Tiempo', contenido::jsonb->'variables'->>'tiempo') END),
    velocidad = COALESCE(velocidad, CASE WHEN contenido LIKE '{%' THEN COALESCE(contenido::jsonb->'variables'->>'Velocidad', contenido::jsonb->'variables'->>'velocidad') END),
    material = COALESCE(material, CASE WHEN contenido LIKE '{%' THEN COALESCE(contenido::jsonb->'variables'->>'Material', contenido::jsonb->'variables'->>'material') END),
    variables = COALESCE(variables, CASE WHEN contenido LIKE '{%' AND contenido::jsonb ? 'variables' THEN (contenido::jsonb->'variables') END, '{}'::jsonb)
  WHERE contenido IS NOT NULL AND contenido LIKE '{%';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
