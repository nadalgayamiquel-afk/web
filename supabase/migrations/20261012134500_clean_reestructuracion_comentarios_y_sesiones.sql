-- ==============================================================================
-- MIGRACIÓN DEFINITIVA: Reestructuración de Comentarios, Sesiones y Disponibilidad
-- ==============================================================================

-- 1. Asegurar columnas dedicadas en estado_diario_jugador para los 6 tipos individuales
ALTER TABLE "public"."estado_diario_jugador"
  ADD COLUMN IF NOT EXISTS "comentario_wellness" text,
  ADD COLUMN IF NOT EXISTS "comentario_psicologico" text,
  ADD COLUMN IF NOT EXISTS "comentario_otros" text;

-- 2. Crear tabla dedicada e independiente de comentarios
CREATE TABLE IF NOT EXISTS "public"."comentarios" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "ambito" text NOT NULL DEFAULT 'JUGADOR' CHECK (ambito IN ('JUGADOR', 'SESION', 'MICROCICLO', 'EVENTO')),
  "jugador_id" uuid REFERENCES "public"."jugadores"("id") ON DELETE CASCADE,
  "sesion_dia_id" uuid REFERENCES "public"."sesiones_dia"("id") ON DELETE CASCADE,
  "fecha" date NOT NULL,
  "tipo" text NOT NULL CHECK (tipo IN ('FIS', 'CON', 'TEC', 'PSI', 'WEL', 'OTR', 'MICRO', 'TAREA')),
  "texto" text NOT NULL,
  "autor" text,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "comentarios_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."comentarios" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'comentarios' AND policyname = 'Permitir todo en comentarios'
  ) THEN
    CREATE POLICY "Permitir todo en comentarios" ON "public"."comentarios" FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_comentarios_fecha" ON "public"."comentarios" ("fecha");
CREATE INDEX IF NOT EXISTS "idx_comentarios_jugador" ON "public"."comentarios" ("jugador_id");
CREATE INDEX IF NOT EXISTS "idx_comentarios_tipo" ON "public"."comentarios" ("tipo");

-- 3. Índices de integridad en sesiones_dia_bloques y gps_datos
CREATE INDEX IF NOT EXISTS "idx_bloques_fecha" ON "public"."sesiones_dia_bloques" ("fecha");
CREATE INDEX IF NOT EXISTS "idx_bloques_day_id" ON "public"."sesiones_dia_bloques" ("day_id");


-- 4. Estructura e Integridad Definitiva de Minutos (minutos_jugador_evento y estado_diario_jugador)
CREATE TABLE IF NOT EXISTS "public"."minutos_jugador_evento" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "jugador_id" uuid NOT NULL REFERENCES "public"."jugadores"("id") ON DELETE CASCADE,
  "fecha" date NOT NULL,
  "evento_id" text NOT NULL DEFAULT 'Pa',
  "codigo_evento" text,
  "minutos" integer,
  "duracion" integer,
  "realiza" boolean DEFAULT true,
  "manual" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "minutos_jugador_evento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "minutos_jugador_evento_jugador_fecha_evento_key" UNIQUE ("jugador_id", "fecha", "evento_id")
);

-- Asegurar columnas 'duracion' y 'minutos' en minutos_jugador_evento
ALTER TABLE "public"."minutos_jugador_evento"
  ADD COLUMN IF NOT EXISTS "duracion" integer,
  ADD COLUMN IF NOT EXISTS "minutos" integer;

-- Sincronizar duracion y minutos en minutos_jugador_evento
UPDATE "public"."minutos_jugador_evento"
  SET duracion = minutos
  WHERE duracion IS NULL AND minutos IS NOT NULL;

UPDATE "public"."minutos_jugador_evento"
  SET minutos = duracion
  WHERE minutos IS NULL AND duracion IS NOT NULL;

-- Asegurar columnas 'minutos' y 'duracion_evento' en estado_diario_jugador
ALTER TABLE "public"."estado_diario_jugador"
  ADD COLUMN IF NOT EXISTS "minutos" integer,
  ADD COLUMN IF NOT EXISTS "duracion_evento" integer;

UPDATE "public"."estado_diario_jugador"
  SET duracion_evento = minutos
  WHERE duracion_evento IS NULL AND minutos IS NOT NULL;

UPDATE "public"."estado_diario_jugador"
  SET minutos = duracion_evento
  WHERE minutos IS NULL AND duracion_evento IS NOT NULL;

-- RLS y Políticas de acceso libre para Minutos y Estado Diario
ALTER TABLE "public"."minutos_jugador_evento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."estado_diario_jugador" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'minutos_jugador_evento' AND policyname = 'Permitir todo en minutos_jugador_evento'
  ) THEN
    CREATE POLICY 'Permitir todo en minutos_jugador_evento' ON "public"."minutos_jugador_evento" FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'estado_diario_jugador' AND policyname = 'Permitir todo en estado_diario_jugador'
  ) THEN
    CREATE POLICY 'Permitir todo en estado_diario_jugador' ON "public"."estado_diario_jugador" FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_minutos_jugador_evento_fecha" ON "public"."minutos_jugador_evento" ("fecha");
CREATE INDEX IF NOT EXISTS "idx_minutos_jugador_evento_jugador" ON "public"."minutos_jugador_evento" ("jugador_id");
CREATE INDEX IF NOT EXISTS "idx_minutos_jugador_evento_lookup" ON "public"."minutos_jugador_evento" ("jugador_id", "fecha", "evento_id");


-- 5. Estructura, Columnas e Integridad de Fuerza (fuerza_sesiones)
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

-- RLS y Políticas de acceso para fuerza_sesiones
ALTER TABLE "public"."fuerza_sesiones" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fuerza_sesiones' AND policyname = 'Permitir todo en fuerza_sesiones'
  ) THEN
    CREATE POLICY 'Permitir todo en fuerza_sesiones' ON "public"."fuerza_sesiones" FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_fuerza_sesiones_jugador_id" ON "public"."fuerza_sesiones" ("jugador_id");
CREATE INDEX IF NOT EXISTS "idx_fuerza_sesiones_fecha" ON "public"."fuerza_sesiones" ("fecha");
