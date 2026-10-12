-- Migración: Crear tabla configuracion_club para guardar club activo y configuraciones
CREATE TABLE IF NOT EXISTS "public"."configuracion_club" (
  "id" text NOT NULL DEFAULT 'default',
  "nombre_club" text,
  "siglas" text,
  "categoria" text,
  "escudo_url" text,
  "escudo_secundario_url" text,
  "temporada_activa" text,
  "temporadas" jsonb DEFAULT '[]'::jsonb,
  "config_json" jsonb DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "configuracion_club_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."configuracion_club" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'configuracion_club' AND policyname = 'Permitir todo en configuracion_club'
  ) THEN
    CREATE POLICY "Permitir todo en configuracion_club" ON "public"."configuracion_club" FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
