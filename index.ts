// Edge Function: maia-chat
// ─────────────────────────────────────────────────────────────
// Proxy server-side da Maia. Recebe a pergunta + contexto do
// portal e chama a API do Gemini com a chave guardada como
// secret no Supabase (NUNCA exposta ao frontend).
//
// Deploy:
//   1) Painel Supabase → Edge Functions → Create function "maia-chat"
//   2) Cola este arquivo no editor e clica "Deploy"
//   3) Em "Secrets" do projeto, adiciona:
//        GEMINI_API_KEY  = <sua-chave-do-google-ai-studio>
//        GEMINI_MODEL    = gemini-2.5-flash  (opcional, esse é o default)
//
// O Supabase já força que requisições venham com um JWT válido
// de usuário logado (verify_jwt está ligado por padrão), então
// só consultores logados conseguem usar a Maia.
// ─────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...extraHeaders },
  });
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // ── Body ────────────────────────────────────────────────
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const question = (body?.question || "").toString().trim();
    const system = (body?.system || "").toString();
    const history = Array.isArray(body?.history) ? body.history : [];

    if (!question) return json({ error: "missing question" }, 400);
    if (!system) return json({ error: "missing system prompt" }, 400);
    if (question.length > 2000) {
      return json({ error: "question too long (max 2000 chars)" }, 400);
    }
    if (system.length > 200000) {
      return json({ error: "system prompt too long" }, 400);
    }

    // ── Secret ──────────────────────────────────────────────
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json(
        { error: "server_misconfigured", detail: "GEMINI_API_KEY not set" },
        500,
      );
    }
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

    // ── Histórico → formato Gemini ──────────────────────────
    const contents: any[] = [];
    history.slice(-10).forEach((m: any) => {
      const role = m?.role === "assistant" ? "model" : "user";
      const text = (m?.content || "").toString();
      if (text) contents.push({ role, parts: [{ text }] });
    });
    contents.push({ role: "user", parts: [{ text: question }] });

    // ── Chama Gemini ────────────────────────────────────────
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      encodeURIComponent(model) +
      `:generateContent?key=` +
      encodeURIComponent(apiKey);

    const geminiResp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          maxOutputTokens: 1500,
        },
      }),
    });

    let data: any;
    try {
      data = await geminiResp.json();
    } catch {
      return json({ error: "gemini_invalid_response" }, 502);
    }

    if (!geminiResp.ok) {
      // Mapeia erros comuns pra mensagens curtas
      const code = data?.error?.code || geminiResp.status;
      const msg = (data?.error?.message || "").toString();
      if (geminiResp.status === 429 || /quota|rate/i.test(msg)) {
        return json(
          { error: "rate_limit", message: "Limite de perguntas atingido por agora. Tenta de novo em 1 minuto." },
          429,
        );
      }
      if (geminiResp.status === 401 || geminiResp.status === 403) {
        return json(
          { error: "auth", message: "Chave Gemini inválida. Avisa o admin." },
          500,
        );
      }
      return json({ error: "gemini", code, message: msg }, 502);
    }

    const cand = data?.candidates?.[0];
    if (!cand) return json({ error: "empty_response" }, 502);
    if (cand.finishReason === "SAFETY") {
      return json(
        {
          error: "safety_blocked",
          message:
            "A resposta foi bloqueada por filtros de segurança. Tenta reformular a pergunta.",
        },
        400,
      );
    }
    const text = (cand.content?.parts || [])
      .map((p: any) => p?.text || "")
      .join("")
      .trim();
    if (!text) return json({ error: "empty_response" }, 502);

    return json({ answer: text });
  } catch (e: any) {
    return json({ error: "exception", message: e?.message || String(e) }, 500);
  }
});
