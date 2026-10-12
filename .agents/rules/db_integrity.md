# Reglas de Integridad de Base de Datos y Supabase

## 1. Cero Datos Ficticios (No Hallucinations)
- El asistente NUNCA debe generar, simular o insertar datos inventados en Supabase (ni sesiones de gimnasio ficticias, ni partes médicos inventados, ni rivales no confirmados).
- Si una fecha no contiene datos, la base de datos se mantiene vacía y la interfaz muestra "Sin planificar".
- Los datos solo proceden de entradas manuales del usuario o archivos CSV oficiales proporcionados por él.

## 2. Tipos de Comentarios Independientes
- Los 6 tipos de comentarios son estrictamente independientes y nunca deben colisionar ni sobreescribirse:
  1. FIS: Fisioterapia / Lesiones (comentario_lesiones)
  2. CON: Condicional / Cargas / Gimnasio (comentario_fisico / comentario_condicional)
  3. TEC: Técnico / Táctico (comentario_tecnico)
  4. PSI: Psicológico / Foco mental (comentario_psicologico)
  5. WEL: Wellness / Cuestionario de bienestar (comentario_wellness)
  6. OTR: Otros / Observaciones generales (comentario_medico / comentario_otros)
- Nunca mapear WEL a comentario_fisico ni PSI a comentario_medico.

## 3. Supabase como Fuente Única de la Verdad
- No utilizar localStorage para persistir datos deportivos de la plantilla.
- LocalStorage se reserva exclusivamente para preferencias cosméticas de UI (modo oscuro, zoom, filtros activos).
- Siempre realizar copia de seguridad antes de cualquier mutación estructural masiva.
