-- ══════════════════════════════════════════════════════════════════════════
-- MASTER PRIME — PORTAL DO CONSULTOR
-- Setup do banco de dados Supabase
--
-- COMO USAR:
-- 1. Crie uma conta em https://supabase.com (gratuito)
-- 2. Crie um novo projeto
-- 3. Va em SQL Editor (menu lateral)
-- 4. Cole TODO este arquivo e clique "Run"
-- 5. Copie a URL e a anon key do projeto (Settings > API)
-- 6. Cole no index.html nas variaveis SUPABASE_URL e SUPABASE_KEY
-- ══════════════════════════════════════════════════════════════════════════

-- Tabela de usuarios
CREATE TABLE IF NOT EXISTS portal_users (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'consultor',  -- admin, socio, consultor
  senha TEXT NOT NULL,
  criado TEXT DEFAULT to_char(now(), 'YYYY-MM-DD'),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de demonstrativos
CREATE TABLE IF NOT EXISTS portal_demonstrativos (
  id SERIAL PRIMARY KEY,
  mes TEXT NOT NULL,           -- formato YYYY-MM
  nome TEXT NOT NULL,          -- nome do consultor
  dados JSONB NOT NULL,        -- { nome, totalFinal, linhas, avulsos, despesas }
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mes, nome)            -- um registro por consultor por mes
);

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_demo_mes ON portal_demonstrativos(mes);
CREATE INDEX IF NOT EXISTS idx_demo_nome ON portal_demonstrativos(nome);
CREATE INDEX IF NOT EXISTS idx_users_cpf ON portal_users(cpf);

-- Row Level Security (permite acesso do frontend)
ALTER TABLE portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_demonstrativos ENABLE ROW LEVEL SECURITY;

-- Politicas de acesso (anon key pode ler/escrever)
-- NOTA: Para producao, recomenda-se usar Supabase Auth
-- e restringir acesso por usuario autenticado
CREATE POLICY "anon_full_users" ON portal_users
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "anon_full_demos" ON portal_demonstrativos
  FOR ALL USING (true) WITH CHECK (true);

-- Inserir admin padrao (Allan)
-- IMPORTANTE: Troque o CPF e senha pelos dados reais!
INSERT INTO portal_users (nome, cpf, tipo, senha)
VALUES ('ALLAN ALMEIDA', '00000000000', 'admin', '123456')
ON CONFLICT (cpf) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- PRONTO! Agora copie a URL e anon key do Supabase e cole no index.html
-- Settings > API > Project URL  e  Project API keys > anon/public
-- ══════════════════════════════════════════════════════════════════════════
