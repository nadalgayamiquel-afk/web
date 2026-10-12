CREATE TABLE "public"."db_testing" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"         text                     NOT NULL,
  "test_type_id" text                     NOT NULL,
  "structure"    text                     NOT NULL,
  "session_date" text,
  "data"         jsonb                    NOT NULL,
  "created_at"   timestamp with time zone DEFAULT now(),
  CONSTRAINT "db_testing_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."db_testing"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."db_tests" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"         text                     NOT NULL,
  "test_type_id" text                     NOT NULL,
  "structure"    text                     NOT NULL,
  "session_date" text,
  "data"         jsonb                    NOT NULL,
  "created_at"   timestamp with time zone DEFAULT now(),
  CONSTRAINT "db_tests_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."db_tests"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."ejercicios_campo" (
  "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
  "nombre"      text NOT NULL,
  "descripcion" text,
  "imagen_url"  text,
  CONSTRAINT "ejercicios_campo_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."ejercicios_campo"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."ejercicios_gimnasio" (
  "id"         uuid NOT NULL DEFAULT gen_random_uuid(),
  "nombre"     text NOT NULL,
  "musculo"    text,
  "postura"    text,
  "movimiento" text,
  "plano"      text,
  "video_url"  text,
  "imagen_url" text,
  CONSTRAINT "ejercicios_gimnasio_nombre_key" UNIQUE (nombre),
  CONSTRAINT "ejercicios_gimnasio_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."ejercicios_gimnasio"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."estado_diario_jugador" (
  "id"                   uuid    NOT NULL DEFAULT gen_random_uuid(),
  "jugador_id"           uuid,
  "sesion_dia_id"        uuid,
  "disponibilidad"       text,
  "objetivo"             text,
  "comentario_lesiones"  text,
  "comentario_medico"    text,
  "comentario_nutricion" text,
  "comentario_fisico"    text,
  "comentario_tecnico"   text,
  "evento_asignado"      text,
  "minutos"              integer,
  CONSTRAINT "estado_diario_jugador_jugador_id_sesion_dia_id_key" UNIQUE (jugador_id, sesion_dia_id),
  CONSTRAINT "estado_diario_jugador_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."estado_diario_jugador"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."eventos_jugador" (
  "id"                 uuid                   NOT NULL DEFAULT gen_random_uuid(),
  "jugador_id"         uuid,
  "sesion_dia_id"      uuid,
  "tipo_evento_codigo" text,
  "hora"               time without time zone,
  "lugar"              text,
  "duracion"           integer,
  "orientacion"        text,
  "carga"              numeric,
  "comentario"         text,
  "num_jugadores"      integer,
  CONSTRAINT "eventos_jugador_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."eventos_jugador"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."fuerza_sesiones" (
  "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
  "jugador_id"    uuid,
  "sesion_dia_id" uuid,
  "tipo_entreno"  text,
  "ejercicio_id"  uuid,
  "contenido"     text,
  CONSTRAINT "fuerza_sesiones_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."fuerza_sesiones"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gps_datos" (
  "id"            uuid    NOT NULL DEFAULT gen_random_uuid(),
  "jugador_id"    uuid,
  "fecha"         date    NOT NULL,
  "sesion_dia_id" uuid,
  "tipo_sesion"   text,
  "match_day"     text,
  "tarea"         text,
  "duracion"      numeric,
  "metricas"      jsonb   NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "gps_datos_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."gps_datos"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."grupo_jugador" (
  "grupo_id"   uuid NOT NULL,
  "jugador_id" uuid NOT NULL,
  CONSTRAINT "grupo_jugador_pkey" PRIMARY KEY (grupo_id, jugador_id)
);

ALTER TABLE "public"."grupo_jugador"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."grupos_jugadores" (
  "id"     uuid NOT NULL DEFAULT gen_random_uuid(),
  "nombre" text NOT NULL,
  CONSTRAINT "grupos_jugadores_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."grupos_jugadores"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."jugadores" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "nombre"               text                     NOT NULL,
  "posicion"             text,
  "equipo"               text,
  "foto_url"             text,
  "wimu_device_id"       text,
  "activo"               boolean                  DEFAULT true,
  "created_at"           timestamp with time zone DEFAULT now(),
  "apodo"                text,
  "cor_id"               text,
  "seccion"              text,
  "fecha_nacimiento"     date,
  "temporada"            text,
  "nacionalidad"         text,
  "contacto"             text,
  "anos_en_club"         integer,
  "seleccion_autonomica" boolean                  DEFAULT false,
  "seleccion_nacional"   boolean                  DEFAULT false,
  "peso"                 numeric,
  "altura"               numeric,
  CONSTRAINT "jugadores_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."jugadores"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."lesiones" (
  "id"           uuid NOT NULL DEFAULT gen_random_uuid(),
  "jugador_id"   uuid,
  "fecha_inicio" date,
  "fecha_alta"   date,
  "tipo"         text,
  "zona"         text,
  "gravedad"     text,
  CONSTRAINT "lesiones_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."lesiones"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."planes_jugador_dia" (
  "id"            uuid    NOT NULL DEFAULT gen_random_uuid(),
  "jugador_id"    uuid,
  "sesion_dia_id" uuid,
  "numero_plan"   integer,
  "nombre"        text,
  "acciones"      text,
  "comentario"    text,
  "evaluacion"    integer,
  CONSTRAINT "planes_jugador_dia_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."planes_jugador_dia"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."rutinas" (
  "id"        uuid  NOT NULL DEFAULT gen_random_uuid(),
  "nombre"    text  NOT NULL,
  "contenido" jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT "rutinas_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."rutinas"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."sesiones_dia_bloques" (
  "id"            uuid    NOT NULL DEFAULT gen_random_uuid(),
  "day_id"        uuid,
  "fecha"         date,
  "slot"          integer NOT NULL,
  "tipo"          text,
  "hora"          text,
  "lugar"         text,
  "duracion"      text,
  "orientacion"   text,
  "carga"         text,
  "comentario"    text,
  "num_jugadores" text,
  "competicion"   text,
  CONSTRAINT "sesiones_dia_bloques_day_id_slot_key" UNIQUE (day_id, slot),
  CONSTRAINT "sesiones_dia_bloques_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."sesiones_dia_bloques"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."sesiones_dia" (
  "id"                    uuid    NOT NULL DEFAULT gen_random_uuid(),
  "fecha"                 date    NOT NULL,
  "equipo"                text,
  "periodo"               text,
  "subperiodo"            text,
  "semana"                integer,
  "md"                    text,
  "rival"                 text,
  "carga"                 numeric,
  "volumen"               numeric,
  "intensidad"            numeric,
  "evento_am"             text,
  "evento_pm"             text,
  "comentario_microciclo" text,
  CONSTRAINT "sesiones_dia_fecha_key" UNIQUE (fecha),
  CONSTRAINT "sesiones_dia_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."sesiones_dia"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."tareas_campo_jugador" (
  "id"            uuid    NOT NULL DEFAULT gen_random_uuid(),
  "jugador_id"    uuid,
  "fecha"         date,
  "numero_evento" integer,
  "tipo_evento"   text,
  "orientacion"   text,
  "numero_tarea"  integer,
  "nombre_tarea"  text,
  "series"        integer,
  "tiempo"        numeric,
  "comentarios"   text,
  "equipo"        text,
  CONSTRAINT "tareas_campo_jugador_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."tareas_campo_jugador"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."tests_fuerza" (
  "id"         uuid  NOT NULL DEFAULT gen_random_uuid(),
  "jugador_id" uuid,
  "fecha"      date,
  "tipo_test"  text,
  "pierna"     text,
  "metricas"   jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "tests_fuerza_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."tests_fuerza"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."tests_jugador_evento" (
  "id"                uuid NOT NULL DEFAULT gen_random_uuid(),
  "evento_jugador_id" uuid,
  "tipo_test"         text,
  CONSTRAINT "tests_jugador_evento_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."tests_jugador_evento"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."tipos_evento" (
  "codigo" text NOT NULL,
  "texto"  text NOT NULL DEFAULT ''::text,
  "color"  text NOT NULL DEFAULT '#dbe5e2'::text,
  CONSTRAINT "tipos_evento_pkey" PRIMARY KEY (codigo)
);

ALTER TABLE "public"."tipos_evento"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."fuerza_sesiones"
  ADD CONSTRAINT "fuerza_sesiones_ejercicio_id_fkey" FOREIGN KEY (ejercicio_id) REFERENCES public.ejercicios_gimnasio(id);

ALTER TABLE "public"."grupo_jugador"
  ADD CONSTRAINT "grupo_jugador_grupo_id_fkey" FOREIGN KEY (grupo_id) REFERENCES public.grupos_jugadores(id) ON DELETE CASCADE;

ALTER TABLE "public"."estado_diario_jugador"
  ADD CONSTRAINT "estado_diario_jugador_jugador_id_fkey" FOREIGN KEY (jugador_id) REFERENCES public.jugadores(id) ON DELETE CASCADE;

ALTER TABLE "public"."eventos_jugador"
  ADD CONSTRAINT "eventos_jugador_jugador_id_fkey" FOREIGN KEY (jugador_id) REFERENCES public.jugadores(id) ON DELETE CASCADE;

ALTER TABLE "public"."fuerza_sesiones"
  ADD CONSTRAINT "fuerza_sesiones_jugador_id_fkey" FOREIGN KEY (jugador_id) REFERENCES public.jugadores(id) ON DELETE CASCADE;

ALTER TABLE "public"."gps_datos"
  ADD CONSTRAINT "gps_datos_jugador_id_fkey" FOREIGN KEY (jugador_id) REFERENCES public.jugadores(id) ON DELETE CASCADE;

ALTER TABLE "public"."grupo_jugador"
  ADD CONSTRAINT "grupo_jugador_jugador_id_fkey" FOREIGN KEY (jugador_id) REFERENCES public.jugadores(id) ON DELETE CASCADE;

ALTER TABLE "public"."lesiones"
  ADD CONSTRAINT "lesiones_jugador_id_fkey" FOREIGN KEY (jugador_id) REFERENCES public.jugadores(id) ON DELETE CASCADE;

ALTER TABLE "public"."planes_jugador_dia"
  ADD CONSTRAINT "planes_jugador_dia_jugador_id_fkey" FOREIGN KEY (jugador_id) REFERENCES public.jugadores(id) ON DELETE CASCADE;

ALTER TABLE "public"."estado_diario_jugador"
  ADD CONSTRAINT "estado_diario_jugador_sesion_dia_id_fkey" FOREIGN KEY (sesion_dia_id) REFERENCES public.sesiones_dia(id) ON DELETE CASCADE;

ALTER TABLE "public"."eventos_jugador"
  ADD CONSTRAINT "eventos_jugador_sesion_dia_id_fkey" FOREIGN KEY (sesion_dia_id) REFERENCES public.sesiones_dia(id) ON DELETE CASCADE;

ALTER TABLE "public"."fuerza_sesiones"
  ADD CONSTRAINT "fuerza_sesiones_sesion_dia_id_fkey" FOREIGN KEY (sesion_dia_id) REFERENCES public.sesiones_dia(id);

ALTER TABLE "public"."gps_datos"
  ADD CONSTRAINT "gps_datos_sesion_dia_id_fkey" FOREIGN KEY (sesion_dia_id) REFERENCES public.sesiones_dia(id);

ALTER TABLE "public"."planes_jugador_dia"
  ADD CONSTRAINT "planes_jugador_dia_sesion_dia_id_fkey" FOREIGN KEY (sesion_dia_id) REFERENCES public.sesiones_dia(id) ON DELETE CASCADE;

ALTER TABLE "public"."sesiones_dia_bloques"
  ADD CONSTRAINT "sesiones_dia_bloques_day_id_fkey" FOREIGN KEY (day_id) REFERENCES public.sesiones_dia(id) ON DELETE CASCADE;

ALTER TABLE "public"."tareas_campo_jugador"
  ADD CONSTRAINT "tareas_campo_jugador_jugador_id_fkey" FOREIGN KEY (jugador_id) REFERENCES public.jugadores(id) ON DELETE CASCADE;

ALTER TABLE "public"."tests_fuerza"
  ADD CONSTRAINT "tests_fuerza_jugador_id_fkey" FOREIGN KEY (jugador_id) REFERENCES public.jugadores(id) ON DELETE CASCADE;

ALTER TABLE "public"."tests_jugador_evento"
  ADD CONSTRAINT "tests_jugador_evento_evento_jugador_id_fkey" FOREIGN KEY (evento_jugador_id) REFERENCES public.eventos_jugador(id) ON DELETE CASCADE;

CREATE INDEX idx_gps_jugador_fecha ON public.gps_datos USING btree (jugador_id, fecha);

CREATE UNIQUE INDEX jugadores_nombre_unique ON public.jugadores USING btree (nombre);

CREATE POLICY "Allow all operations for authenticated users" ON "public"."db_testing"
  FOR ALL
  TO PUBLIC
  USING (true);

CREATE POLICY "Allow all operations for authenticated users" ON "public"."db_tests"
  FOR ALL
  TO PUBLIC
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."db_testing" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."db_tests" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ejercicios_campo" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ejercicios_gimnasio" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."estado_diario_jugador" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."eventos_jugador" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."fuerza_sesiones" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gps_datos" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."grupo_jugador" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."grupos_jugadores" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."jugadores" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lesiones" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."planes_jugador_dia" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rutinas" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sesiones_dia" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sesiones_dia_bloques" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tareas_campo_jugador" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tests_fuerza" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tests_jugador_evento" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tipos_evento" TO "anon", "authenticated", "postgres", "service_role";

