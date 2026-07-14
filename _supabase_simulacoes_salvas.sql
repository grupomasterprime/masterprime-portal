-- =================================================================
-- SIMULAÇÕES SALVAS — Master Prime Portal
-- Guarda simulações dos consultores por 48 horas para retomar
-- atendimentos sem precisar preencher tudo de novo.
-- =================================================================
-- Como rodar: cole TUDO de uma vez no Supabase SQL Editor e clique Run.
-- Idempotente: pode rodar de novo sem quebrar nada.
-- =================================================================

-- ─────────────────────────────────────────────────────────────────
-- 1) Tabela
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portal_simulacoes_salvas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Quem salvou
  consultor_auth_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consultor_nome    TEXT,

  -- Identificação da simulação
  simulador         TEXT NOT NULL,        -- ex: 'estruturada', 'porto-auto', 'itau-reduzida'
  titulo            TEXT NOT NULL,        -- normalmente nome do cliente
  cliente_nome      TEXT,                 -- opcional, separado para busca
  observacoes       TEXT,

  -- Conteúdo da simulação (form state + operacoes etc.)
  dados             JSONB NOT NULL,

  -- TTL automático de 48h (renovado a cada atualização)
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em         TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '48 hours')
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_simulacoes_consultor_simulador_expira
  ON public.portal_simulacoes_salvas (consultor_auth_id, simulador, expira_em DESC);

CREATE INDEX IF NOT EXISTS idx_simulacoes_expira
  ON public.portal_simulacoes_salvas (expira_em);

-- ─────────────────────────────────────────────────────────────────
-- 2) Trigger: atualiza atualizado_em e renova expira_em em cada UPDATE
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._touch_simulacao()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := now();
  -- renova validade de 48h sempre que o usuário mexe na simulação
  NEW.expira_em := now() + INTERVAL '48 hours';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_simulacao ON public.portal_simulacoes_salvas;
CREATE TRIGGER trg_touch_simulacao
  BEFORE UPDATE ON public.portal_simulacoes_salvas
  FOR EACH ROW EXECUTE FUNCTION public._touch_simulacao();

-- ─────────────────────────────────────────────────────────────────
-- 3) RLS — cada consultor só vê/edita as próprias simulações
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.portal_simulacoes_salvas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consultor le proprias simulacoes" ON public.portal_simulacoes_salvas;
CREATE POLICY "consultor le proprias simulacoes"
  ON public.portal_simulacoes_salvas FOR SELECT
  USING (consultor_auth_id = auth.uid() OR public.is_portal_admin());

DROP POLICY IF EXISTS "consultor insere proprias simulacoes" ON public.portal_simulacoes_salvas;
CREATE POLICY "consultor insere proprias simulacoes"
  ON public.portal_simulacoes_salvas FOR INSERT
  WITH CHECK (consultor_auth_id = auth.uid());

DROP POLICY IF EXISTS "consultor atualiza proprias simulacoes" ON public.portal_simulacoes_salvas;
CREATE POLICY "consultor atualiza proprias simulacoes"
  ON public.portal_simulacoes_salvas FOR UPDATE
  USING (consultor_auth_id = auth.uid())
  WITH CHECK (consultor_auth_id = auth.uid());

DROP POLICY IF EXISTS "consultor apaga proprias simulacoes" ON public.portal_simulacoes_salvas;
CREATE POLICY "consultor apaga proprias simulacoes"
  ON public.portal_simulacoes_salvas FOR DELETE
  USING (consultor_auth_id = auth.uid() OR public.is_portal_admin());

-- ─────────────────────────────────────────────────────────────────
-- 4) Limpeza periódica das simulações expiradas
-- (alternativa simples — sem precisar de pg_cron)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.limpar_simulacoes_expiradas()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  qtd INT;
BEGIN
  DELETE FROM public.portal_simulacoes_salvas
   WHERE expira_em < now();
  GET DIAGNOSTICS qtd = ROW_COUNT;
  RETURN qtd;
END;
$$;

-- Opcional: agendar via pg_cron (se a extensão estiver habilitada).
-- Roda a cada hora e apaga o que expirou.
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
--     PERFORM cron.schedule(
--       'limpar-simulacoes-expiradas',
--       '0 * * * *',
--       $$SELECT public.limpar_simulacoes_expiradas();$$
--     );
--   END IF;
-- END $$;

-- =================================================================
-- FIM
-- =================================================================
