-- ═══════════════════════════════════════════════════════════════════
-- Redução de taxa: liberar a CRIAÇÃO de processos para todos os
-- usuários logados do portal (vendedores incluídos).
--
-- Contexto: o Paulo tentou criar um "processo interno — Redução de taxa
-- Itaú" e recebeu "new row violates row-level security policy for table
-- portal_processos". A política de INSERT da tabela só cobria os perfis
-- de administração. Decisão do Allan (06/08/2026): todo vendedor pode
-- solicitar redução de taxa — é um trabalho a menos para o ADM.
--
-- Este script ADICIONA uma política permissiva de INSERT para qualquer
-- usuário autenticado. Políticas RLS são combinadas com OU, então as
-- políticas existentes continuam valendo — nada é revogado.
-- A visualização ("Meus Processos") já funciona para vendedores hoje,
-- então SELECT não precisa mudar.
--
-- Como rodar: Supabase → SQL Editor → colar tudo → Run.
-- ═══════════════════════════════════════════════════════════════════

drop policy if exists "processos_insert_autenticados" on public.portal_processos;

create policy "processos_insert_autenticados"
on public.portal_processos
for insert
to authenticated
with check (true);

-- Conferência: lista as políticas ativas da tabela depois de rodar.
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'portal_processos'
order by cmd, policyname;
