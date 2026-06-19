// Edge Function: maia-chat
// ─────────────────────────────────────────────────────────────
// Proxy server-side da Maia.
//
// Estratégia: tenta Groq primeiro (mais rápido + limite 14.400/dia).
// Se Groq estiver indisponível ou bater rate limit, faz failover
// pro Gemini (1.500/dia). As 2 chaves ficam como secrets criptografados.
//
// Secrets necessários:
//   GROQ_API_KEY   = chave do console.groq.com (gsk_...)
//   GEMINI_API_KEY = chave do AI Studio (fallback)
//   GROQ_MODEL     = opcional, default "llama-3.3-70b-versatile"
//   GEMINI_MODEL   = opcional, default "gemini-2.5-flash"
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

// ─── Provider: Groq (primário) ───────────────────────────────
async function askGroq(system: string, question: string, history: any[]) {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  const model = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";

  // Formato OpenAI-compatível
  const messages: any[] = [{ role: "system", content: system }];
  history.slice(-10).forEach((m: any) => {
    const role = m?.role === "assistant" ? "assistant" : "user";
    const content = (m?.content || "").toString();
    if (content) messages.push({ role, content });
  });
  messages.push({ role: "user", content: question });

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      top_p: 0.8,
      max_tokens: 1500,
    }),
  });

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    const err: any = new Error(data?.error?.message || `Groq HTTP ${resp.status}`);
    err.status = resp.status;
    err.isRateLimit = resp.status === 429 || /rate|quota|limit/i.test(data?.error?.message || "");
    throw err;
  }

  const text = (data?.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("Groq empty response");
  return text;
}

// ─── Provider: Gemini (fallback) ─────────────────────────────
async function askGemini(system: string, question: string, history: any[]) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

  const contents: any[] = [];
  history.slice(-10).forEach((m: any) => {
    const role = m?.role === "assistant" ? "model" : "user";
    const text = (m?.content || "").toString();
    if (text) contents.push({ role, parts: [{ text }] });
  });
  contents.push({ role: "user", parts: [{ text: question }] });

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    encodeURIComponent(model) +
    `:generateContent?key=` +
    encodeURIComponent(apiKey);

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature: 0.2, topP: 0.8, maxOutputTokens: 1500 },
    }),
  });

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    const err: any = new Error(data?.error?.message || `Gemini HTTP ${resp.status}`);
    err.status = resp.status;
    err.isRateLimit = resp.status === 429 || /quota|rate/i.test(data?.error?.message || "");
    throw err;
  }

  const cand = data?.candidates?.[0];
  if (!cand) throw new Error("Gemini empty response");
  if (cand.finishReason === "SAFETY") {
    const err: any = new Error("safety_blocked");
    err.isSafety = true;
    throw err;
  }
  const text = (cand.content?.parts || []).map((p: any) => p?.text || "").join("").trim();
  if (!text) throw new Error("Gemini empty response");
  return text;
}

// ─── Handler principal ──────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
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

    const hasGroq = !!Deno.env.get("GROQ_API_KEY");
    const hasGemini = !!Deno.env.get("GEMINI_API_KEY");

    if (!hasGroq && !hasGemini) {
      return json({ error: "server_misconfigured", detail: "no provider configured" }, 500);
    }

    // Tenta Groq primeiro, fallback pro Gemini
    let answer: string | null = null;
    let lastError: any = null;
    let provider = "";

    if (hasGroq) {
      try {
        answer = await askGroq(system, question, history);
        provider = "groq";
      } catch (e: any) {
        lastError = e;
        // Se Groq não tá disponível ou bateu limite, log e tenta Gemini
        console.warn("Groq falhou, tentando Gemini:", e?.message);
      }
    }

    if (!answer && hasGemini) {
      try {
        answer = await askGemini(system, question, history);
        provider = "gemini";
      } catch (e: any) {
        lastError = e;
      }
    }

    if (answer) {
      return json({ answer, provider });
    }

    // Ambos falharam — mapeia o último erro pra mensagem útil
    if (lastError?.isSafety) {
      return json(
        { error: "safety_blocked", message: "A resposta foi bloqueada por filtros de segurança. Tenta reformular a pergunta." },
        400,
      );
    }
    if (lastError?.isRateLimit) {
      return json(
        { error: "rate_limit", message: "Limite de perguntas atingido por agora. Tenta de novo em 1 minuto." },
        429,
      );
    }
    if (lastError?.status === 401 || lastError?.status === 403) {
      return json(
        { error: "auth", message: "Chave de IA inválida. Avisa o admin." },
        500,
      );
    }
    return json(
      { error: "provider_unavailable", message: lastError?.message || "Sem resposta dos provedores." },
      502,
    );
  } catch (e: any) {
    return json({ error: "exception", message: e?.message || String(e) }, 500);
  }
});
