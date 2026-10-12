CREATE TABLE db_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  test_type_id TEXT NOT NULL,
  structure TEXT NOT NULL,
  session_date TEXT,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Permisos (RLS opcional, como lo tengas configurado)
ALTER TABLE db_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for authenticated users" ON db_tests FOR ALL USING (true);
