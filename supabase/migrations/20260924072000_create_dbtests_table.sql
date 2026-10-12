CREATE TABLE dbtests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  test_type_id TEXT NOT NULL,
  structure TEXT NOT NULL,
  dates JSONB NOT NULL DEFAULT '[]'::jsonb,
  players JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics_list JSONB,
  tabular_rows JSONB,
  session_date TEXT,
  date_groups JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (opcional si lo usan en frontend con supabase-js, 
-- pero como usan acciones de Next.js (service_role), puede no ser crítico, 
-- pero es buena práctica)
ALTER TABLE dbtests ENABLE ROW LEVEL SECURITY;

-- Permitir todas las operaciones a anon/authenticated (si lo llaman desde el cliente sin auth) o solo service_role
CREATE POLICY "Enable read access for all users" ON dbtests FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON dbtests FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON dbtests FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON dbtests FOR DELETE USING (true);
