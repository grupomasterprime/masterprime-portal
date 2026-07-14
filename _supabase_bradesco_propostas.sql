-- =================================================================
-- BRADESCO PROPOSTAS DE ADESÃO — Master Prime Portal
-- Cria tabelas para receber os formulários PF e PJ do menu Formulários.
-- =================================================================
-- Como rodar: cole TUDO de uma vez no Supabase SQL Editor e clique Run.
-- Idempotente: pode rodar de novo sem quebrar nada.
-- =================================================================

-- ─────────────────────────────────────────────────────────────────
-- 1) Helper: descobre se o usuário logado é admin/sócio
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_portal_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.portal_users
    WHERE auth_id = auth.uid()
      AND tipo IN ('admin', 'socio')
  );
$$;

-- ─────────────────────────────────────────────────────────────────
-- 2) Tabela: PESSOA FÍSICA
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portal_bradesco_propostas_pf (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Auditoria
  criado_em        TIMESTAMPTZ DEFAULT now(),
  atualizado_em    TIMESTAMPTZ DEFAULT now(),
  consultor_auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  consultor_nome   TEXT,
  status           TEXT DEFAULT 'recebido', -- recebido, em_analise, enviado, aprovado, recusado, cancelado
  observacoes      TEXT,

  -- Dados pessoais
  cpf              TEXT NOT NULL,
  nome_completo    TEXT NOT NULL,
  data_nascimento  TEXT NOT NULL,
  nacionalidade    TEXT NOT NULL,
  nome_pai         TEXT,
  nome_mae         TEXT NOT NULL,
  estado_civil     TEXT NOT NULL,

  -- Cônjuge (opcional)
  nome_conjuge             TEXT,
  cpf_conjuge              TEXT,
  data_nascimento_conjuge  TEXT,

  -- Profissional
  nome_empresa   TEXT NOT NULL,
  data_admissao  TEXT NOT NULL,
  renda_mensal   TEXT NOT NULL,

  -- Endereço
  cep              TEXT NOT NULL,
  logradouro       TEXT NOT NULL,
  numero           TEXT NOT NULL,
  complemento      TEXT,
  bairro           TEXT NOT NULL,
  cidade           TEXT NOT NULL,
  estado           TEXT NOT NULL,
  tempo_residencia TEXT NOT NULL,

  -- Contato
  email   TEXT NOT NULL,
  celular TEXT NOT NULL,

  -- Adesão
  forma_pagamento TEXT NOT NULL,
  deseja_seguro   TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────────
-- 3) Tabela: PESSOA JURÍDICA
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portal_bradesco_propostas_pj (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Auditoria
  criado_em        TIMESTAMPTZ DEFAULT now(),
  atualizado_em    TIMESTAMPTZ DEFAULT now(),
  consultor_auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  consultor_nome   TEXT,
  status           TEXT DEFAULT 'recebido',
  observacoes      TEXT,

  -- Empresa
  cnpj            TEXT NOT NULL,
  razao_social    TEXT NOT NULL,
  nome_fantasia   TEXT,
  ramo_atividade  TEXT NOT NULL,

  -- Sócio administrador
  socio_nome                TEXT NOT NULL,
  socio_cpf                 TEXT NOT NULL,
  socio_data_nascimento     TEXT NOT NULL,
  socio_tipo_documento      TEXT NOT NULL,
  socio_numero_documento    TEXT NOT NULL,
  socio_percentual_empresa  TEXT NOT NULL,
  socio_estado_civil        TEXT NOT NULL,
  socio_nome_conjuge        TEXT,
  socio_cpf_conjuge         TEXT,

  -- Contato
  email   TEXT NOT NULL,
  celular TEXT NOT NULL,

  -- Endereço
  cep         TEXT NOT NULL,
  logradouro  TEXT NOT NULL,
  numero      TEXT NOT NULL,
  complemento TEXT,
  bairro      TEXT NOT NULL,
  cidade      TEXT NOT NULL,
  estado      TEXT NOT NULL,

  -- Adesão
  forma_pagamento TEXT,
  deseja_seguro   TEXT
);

-- ─────────────────────────────────────────────────────────────────
-- 4) Índices (consultas comuns)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bradesco_pf_criado    ON public.portal_bradesco_propostas_pf(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_bradesco_pf_consultor ON public.portal_bradesco_propostas_pf(consultor_auth_id);
CREATE INDEX IF NOT EXISTS idx_bradesco_pf_cpf       ON public.portal_bradesco_propostas_pf(cpf);
CREATE INDEX IF NOT EXISTS idx_bradesco_pf_status    ON public.portal_bradesco_propostas_pf(status);

CREATE INDEX IF NOT EXISTS idx_bradesco_pj_criado    ON public.portal_bradesco_propostas_pj(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_bradesco_pj_consultor ON public.portal_bradesco_propostas_pj(consultor_auth_id);
CREATE INDEX IF NOT EXISTS idx_bradesco_pj_cnpj      ON public.portal_bradesco_propostas_pj(cnpj);
CREATE INDEX IF NOT EXISTS idx_bradesco_pj_status    ON public.portal_bradesco_propostas_pj(status);

-- ─────────────────────────────────────────────────────────────────
-- 5) Trigger: atualiza atualizado_em em cada UPDATE
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_set_atualizado_em()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bradesco_pf_set_atualizado_em ON public.portal_bradesco_propostas_pf;
CREATE TRIGGER bradesco_pf_set_atualizado_em
  BEFORE UPDATE ON public.portal_bradesco_propostas_pf
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_atualizado_em();

DROP TRIGGER IF EXISTS bradesco_pj_set_atualizado_em ON public.portal_bradesco_propostas_pj;
CREATE TRIGGER bradesco_pj_set_atualizado_em
  BEFORE UPDATE ON public.portal_bradesco_propostas_pj
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_atualizado_em();

-- ─────────────────────────────────────────────────────────────────
-- 6) Row Level Security
--    Regra: consultor vê só as propostas que ele criou; admin/sócio vê tudo.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.portal_bradesco_propostas_pf ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_bradesco_propostas_pj ENABLE ROW LEVEL SECURITY;

-- limpa políticas anteriores caso estejam reaplicando (idempotência)
DROP POLICY IF EXISTS bradesco_pf_select ON public.portal_bradesco_propostas_pf;
DROP POLICY IF EXISTS bradesco_pf_insert ON public.portal_bradesco_propostas_pf;
DROP POLICY IF EXISTS bradesco_pf_update ON public.portal_bradesco_propostas_pf;
DROP POLICY IF EXISTS bradesco_pf_delete ON public.portal_bradesco_propostas_pf;
DROP POLICY IF EXISTS bradesco_pj_select ON public.portal_bradesco_propostas_pj;
DROP POLICY IF EXISTS bradesco_pj_insert ON public.portal_bradesco_propostas_pj;
DROP POLICY IF EXISTS bradesco_pj_update ON public.portal_bradesco_propostas_pj;
DROP POLICY IF EXISTS bradesco_pj_delete ON public.portal_bradesco_propostas_pj;

-- PF
CREATE POLICY bradesco_pf_select ON public.portal_bradesco_propostas_pf
  FOR SELECT TO authenticated
  USING (consultor_auth_id = auth.uid() OR public.is_portal_admin());

CREATE POLICY bradesco_pf_insert ON public.portal_bradesco_propostas_pf
  FOR INSERT TO authenticated
  WITH CHECK (consultor_auth_id = auth.uid());

CREATE POLICY bradesco_pf_update ON public.portal_bradesco_propostas_pf
  FOR UPDATE TO authenticated
  USING (consultor_auth_id = auth.uid() OR public.is_portal_admin());

CREATE POLICY bradesco_pf_delete ON public.portal_bradesco_propostas_pf
  FOR DELETE TO authenticated
  USING (public.is_portal_admin());

-- PJ
CREATE POLICY bradesco_pj_select ON public.portal_bradesco_propostas_pj
  FOR SELECT TO authenticated
  USING (consultor_auth_id = auth.uid() OR public.is_portal_admin());

CREATE POLICY bradesco_pj_insert ON public.portal_bradesco_propostas_pj
  FOR INSERT TO authenticated
  WITH CHECK (consultor_auth_id = auth.uid());

CREATE POLICY bradesco_pj_update ON public.portal_bradesco_propostas_pj
  FOR UPDATE TO authenticated
  USING (consultor_auth_id = auth.uid() OR public.is_portal_admin());

CREATE POLICY bradesco_pj_delete ON public.portal_bradesco_propostas_pj
  FOR DELETE TO authenticated
  USING (public.is_portal_admin());

-- ─────────────────────────────────────────────────────────────────
-- Pronto! Teste rápido:
--   SELECT count(*) FROM public.portal_bradesco_propostas_pf;
--   SELECT count(*) FROM public.portal_bradesco_propostas_pj;
-- Ambos devem retornar 0 antes do primeiro envio.
-- ─────────────────────────────────────────────────────────────────
