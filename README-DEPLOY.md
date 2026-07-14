# Deploy da Maia (Edge Function `maia-chat`)

Esta function é o **proxy server-side** que protege a chave do Gemini.
O frontend nunca toca na chave — ele conversa com a Edge Function e ela
chama o Gemini com a chave guardada como secret do Supabase.

## Passo 1 — Adicionar a chave do Gemini como secret no Supabase

1. Vai em **https://supabase.com/dashboard** → seu projeto Master Prime
2. Menu lateral: **Edge Functions** → **Secrets** (tab no topo)
3. Clica em **+ Add new secret** e cria estes 2 secrets:

| Name | Value |
|---|---|
| `GEMINI_API_KEY` | _(cole a chave que gerou no Google AI Studio)_ |
| `GEMINI_MODEL` | `gemini-2.5-flash` (opcional — é o default) |

> ⚠️ Essa é a chave que o Google AI Studio gerou hoje na sua conta
> `allancarvalhoalmeida@gmail.com`. Ela só funciona pra Gemini API
> (já tem restrição). Aqui no secret, ela fica criptografada e
> ninguém consegue ver depois.

## Passo 2 — Criar a Edge Function

1. Menu lateral: **Edge Functions** → **Create a new function**
2. Nome: `maia-chat` (exatamente assim, sem maiúsculas)
3. **Vai abrir um editor de código.** Apaga TUDO que vier por padrão.
4. **Cola o conteúdo do arquivo** `supabase/functions/maia-chat/index.ts`
   (que está no repo) — copia tudo, do `import` até o `});` do final.
5. Clica em **Deploy function**

> Em alguns dashboards do Supabase, o botão aparece como
> **"Save and Deploy"** ou **"Create"**. Funciona igual.

## Passo 3 — Confirma que a function ficou pública

Por padrão, a function exige JWT (auth do consultor) — exatamente o que
a gente quer. Não precisa mexer em nada.

Se quiser confirmar:
- **Edge Functions** → `maia-chat` → **Details**
- Em "Configuration", confere que **"Verify JWT with legacy secret"**
  ou **"verify_jwt"** está LIGADO ✅

## Passo 4 — Testar

1. Commita os arquivos do portal e dá refresh no Material de Apoio
2. Abre a aba **"Maia"** e pergunta algo tipo:
   _"Sobra de crédito Bradesco — qual o prazo?"_
3. Se a Maia responder → 🎉 está funcionando

## Se der erro

Abre o **DevTools (F12) → Console** e olha a mensagem:

| Erro na tela | O que checar |
|---|---|
| "A Maia ainda não foi configurada no servidor" | Secret `GEMINI_API_KEY` faltando — refaz o Passo 1 |
| "Você precisa estar logado" | Saiu da sessão do portal — faz login de novo |
| "Limite de perguntas atingido" | 1000 perguntas/dia atingidas. Volta amanhã. |
| "HTTP 404" | A function não foi deployada — refaz o Passo 2 |
| Outras coisas | Vai em **Edge Functions → maia-chat → Logs** no Supabase |

## Pra trocar a chave do Gemini no futuro

1. Gera nova chave no AI Studio
2. Vai no Supabase → **Edge Functions → Secrets**
3. Edita o `GEMINI_API_KEY` com a nova chave
4. **Não precisa redeployar nada** — o secret é lido dinamicamente
