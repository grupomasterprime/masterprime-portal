/*
 * Master Prime — Configuração da Maia (Assistente IA)
 * --------------------------------------------------------------
 * A Maia usa uma Edge Function do Supabase como proxy. A chave
 * do Gemini fica GUARDADA NO SERVIDOR (Supabase secret) e NUNCA
 * aparece neste arquivo nem em qualquer JS do portal.
 *
 * O que tem aqui é só a URL e a chave pública (anon) do Supabase
 * — as mesmas que já estão no index.html e que podem ficar
 * tranquilamente no GitHub público.
 *
 * Pra ativar a Maia, faça os passos do arquivo:
 *   supabase/functions/maia-chat/README-DEPLOY.md
 */
window.KB_CHAT_CONFIG = {
  // Credenciais públicas do Supabase (mesmas do resto do portal)
  supabaseUrl:     'https://jhwciwvgagnuxakukyob.supabase.co',
  supabaseAnonKey: 'sb_publishable_fy-iwSFNHKRuqP1pDokFuQ_X_UCiqzx',

  // Quantos cards do material são enviados como contexto a cada pergunta
  maxCardsContext: 12,

  // Habilita a pill da Maia (false = aparece a tela "configure")
  enabled: true
};
