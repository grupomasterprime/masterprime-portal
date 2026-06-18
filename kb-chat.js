/*
 * Master Prime — Assistente IA do Material de Apoio
 * --------------------------------------------------------------
 * Chat que responde perguntas do consultor usando os cards
 * dos KBs (Porto, Itaú, Bradesco, FGTS Caixa, Comissões) como
 * único contexto. Usa Google Gemini 2.5 Flash via REST API.
 *
 * Requer:
 *   - window.KB_CHAT_CONFIG (de kb-chat-config.js)
 *   - window.KB_ADMIN (carregado pelos kb-*.js)
 */
(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────
  var CFG = window.KB_CHAT_CONFIG || {};
  var STORAGE_KEY = 'mp-kb-chat-history-v1';
  var MAX_HISTORY_TURNS = 6;       // últimas 6 mensagens do usuário+IA enviadas como contexto
  var MAX_DISPLAY_TURNS = 50;      // máx. mensagens exibidas em tela / salvas

  var ADM_LABELS = {
    porto: 'Porto', itau: 'Itaú', bradesco: 'Bradesco',
    fgts: 'FGTS Caixa', comissoes: 'Comissões'
  };

  // ── Estado ─────────────────────────────────────────────────
  var history = [];   // [{ role: 'user'|'assistant', content: '...', sources?: [...] }]
  var isLoading = false;

  // ── Helpers ────────────────────────────────────────────────
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function loadHistory() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.slice(-MAX_DISPLAY_TURNS) : [];
    } catch (e) { return []; }
  }
  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_DISPLAY_TURNS)));
    } catch (e) {}
  }

  // ── Coleta todos os cards de todos os KBs num array único ──
  function gatherAllCards() {
    var out = [];
    var adm = window.KB_ADMIN || {};
    Object.keys(adm).forEach(function (admKey) {
      var d = adm[admKey] || {};
      var nomeAdm = ADM_LABELS[admKey] || d.nome || admKey;
      (d.entradas || []).forEach(function (e) {
        out.push({
          admKey: admKey,
          admNome: nomeAdm,
          categoria: e.categoria_label || '',
          titulo: e.titulo || '',
          conteudo: e.conteudo || '',
          tags: e.tags || ''
        });
      });
      // Inclui também os downloads como "fontes externas conhecidas"
      (d.downloads || []).forEach(function (dl) {
        out.push({
          admKey: admKey,
          admNome: nomeAdm,
          categoria: 'PDF — material para baixar',
          titulo: dl.titulo || dl.arquivo || '',
          conteudo: dl.descricao || ('PDF disponível: ' + (dl.arquivo || '')),
          tags: 'pdf, material, download'
        });
      });
    });
    return out;
  }

  // ── Normaliza texto (sem acento, minúsculo) ──
  function norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  // Lista mínima de stopwords pt-BR pra não pesar a busca
  var STOPWORDS = {
    'a':1,'o':1,'as':1,'os':1,'um':1,'uma':1,'uns':1,'umas':1,'de':1,'do':1,'da':1,'dos':1,'das':1,
    'em':1,'no':1,'na':1,'nos':1,'nas':1,'e':1,'ou':1,'que':1,'se':1,'ao':1,'aos':1,
    'para':1,'por':1,'com':1,'como':1,'esse':1,'essa':1,'isso':1,'este':1,'esta':1,'isto':1,
    'meu':1,'minha':1,'seu':1,'sua':1,'eu':1,'voce':1,'eles':1,'elas':1,'nós':1,'nos':1,
    'pode':1,'posso':1,'poder':1,'preciso':1,'quero':1,'tem':1,'ter':1,'ser':1,'sou':1,'é':1,
    'qual':1,'quais':1,'quando':1,'onde':1,'porque':1,'por que':1,'oque':1,'q':1,
    'mais':1,'menos':1,'muito':1,'pouco':1,'sim':1,'nao':1
  };

  function extractTerms(q) {
    var n = norm(q);
    return n.split(' ').filter(function (t) {
      return t.length >= 2 && !STOPWORDS[t];
    });
  }

  // ── Score: quantos termos batem no card (peso título > tags > conteudo) ──
  function scoreCard(card, terms) {
    var t = norm(card.titulo);
    var tg = norm(card.tags);
    var c = norm(card.conteudo);
    var cat = norm(card.categoria);
    var adm = norm(card.admNome);
    var score = 0;
    terms.forEach(function (term) {
      if (t.indexOf(term) !== -1) score += 6;
      if (tg.indexOf(term) !== -1) score += 4;
      if (cat.indexOf(term) !== -1) score += 3;
      if (adm.indexOf(term) !== -1) score += 3;
      if (c.indexOf(term) !== -1) score += 1;
    });
    return score;
  }

  // ── Pega top-N cards mais relevantes pra pergunta ──
  function findRelevantCards(question, max) {
    var allCards = gatherAllCards();
    var terms = extractTerms(question);
    if (terms.length === 0) return allCards.slice(0, max);

    var scored = allCards.map(function (c, i) {
      return { card: c, score: scoreCard(c, terms), idx: i };
    }).filter(function (x) { return x.score > 0; });

    scored.sort(function (a, b) {
      return b.score - a.score || a.idx - b.idx;
    });

    // Se não encontrou nada, devolve uma amostra geral
    if (scored.length === 0) return allCards.slice(0, max);
    return scored.slice(0, max).map(function (x) { return x.card; });
  }

  // ── Monta prompt pro Gemini ──
  function buildPrompt(question, relevantCards, conversationHistory) {
    var contextBlocks = relevantCards.map(function (c, i) {
      return '[CARD ' + (i+1) + ' · ' + c.admNome + ' · ' + c.categoria + ']\n' +
             'Título: ' + c.titulo + '\n' +
             'Conteúdo: ' + c.conteudo;
    }).join('\n\n');

    var historyBlock = '';
    if (conversationHistory && conversationHistory.length > 0) {
      historyBlock = '\n\nHISTÓRICO RECENTE DA CONVERSA (use só pra entender o contexto da nova pergunta):\n' +
        conversationHistory.map(function (m) {
          return (m.role === 'user' ? 'Consultor' : 'Assistente') + ': ' + m.content;
        }).join('\n');
    }

    var system =
      'Você é a Maia, assistente virtual da Master Prime (corretora de consórcios e seguros). ' +
      'O nome "Maia" vem de MA (Master) + IA — você é a IA da casa. ' +
      'Você ajuda os consultores tirando dúvidas SOMENTE com base nos materiais de apoio fornecidos abaixo, ' +
      'que cobrem as administradoras Porto, Itaú, Bradesco, FGTS Caixa e Comissões.\n\n' +
      'PERSONALIDADE:\n' +
      '• Cordial, próxima e amigável — fala como uma colega de trabalho prestativa, não como um manual frio.\n' +
      '• Moderna no jeito (pode usar emojis com moderação tipo ✅ ⚠️ 📘 quando ajuda) mas SEMPRE precisa em matéria técnica.\n' +
      '• Direta ao ponto: nada de enrolar.\n' +
      '• Se apresenta como Maia na primeira interação ou quando perguntarem o nome.\n\n' +
      'REGRAS OBRIGATÓRIAS:\n' +
      '1. Use APENAS as informações dos cards abaixo. NÃO invente, NÃO faça suposições, NÃO use conhecimento geral sobre consórcios.\n' +
      '2. Se a resposta não estiver nos cards, diga gentilmente: "Não encontrei isso no nosso material. Vale confirmar direto com a [administradora]." e sugira a fonte oficial.\n' +
      '3. SEMPRE cite a fonte ao final, no formato: "📘 Fonte: [Título do card] · [Banco] · [Categoria]". Liste todos os cards usados.\n' +
      '4. Responda em português brasileiro, tom cordial e profissional.\n' +
      '5. Use formatação Markdown: **negrito** pra destacar pontos-chave, bullets com "•" quando ajudar a organizar.\n' +
      '6. Respostas curtas e precisas. Sem floreio desnecessário.\n' +
      '7. Se a pergunta for casual (oi, tudo bem, obrigado), responda calorosamente e ofereça ajuda com o material.\n' +
      '8. Nunca diga que "é uma IA" de forma fria — assume o papel da Maia naturalmente.\n\n' +
      'MATERIAIS DE APOIO DISPONÍVEIS (use só esses):\n\n' + contextBlocks + historyBlock;

    return {
      system: system,
      userMsg: question
    };
  }

  // ── Pega sessão Supabase do usuário logado ─────────────────
  function getSupabaseSession() {
    // O portal cria um cliente supabase com nome "supabase" global.
    // Caso a Maia seja embedada via iframe, busca também no top.
    var sb = null;
    try { sb = window.supabase && window.supabase.createClient ? null : window.supabaseClient; } catch (e) {}
    // Procura por instância já criada que tenha .auth
    var candidates = [
      window.supabaseClient,
      window.supabase && window.supabase._client,
      window.sb,
      window.top && window.top.supabaseClient
    ].filter(Boolean);
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] && candidates[i].auth) return candidates[i].auth.getSession();
    }
    // Fallback: cria um cliente novo usando as creds em CFG
    if (window.supabase && window.supabase.createClient && CFG.supabaseUrl && CFG.supabaseAnonKey) {
      window._maiaSb = window._maiaSb || window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
      return window._maiaSb.auth.getSession();
    }
    return Promise.resolve({ data: { session: null }, error: null });
  }

  // ── Chama a Edge Function maia-chat (proxy seguro) ─────────
  function askMaia(question, relevantCards, conversationHistory) {
    if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) {
      return Promise.reject(new Error('CONFIG: URL/chave do Supabase não configurada em kb-chat-config.js.'));
    }
    var endpoint = CFG.supabaseUrl.replace(/\/+$/, '') + '/functions/v1/maia-chat';
    var prompt = buildPrompt(question, relevantCards, conversationHistory);

    return getSupabaseSession().then(function (s) {
      var accessToken = s && s.data && s.data.session && s.data.session.access_token;
      if (!accessToken) {
        throw new Error('AUTH: Você precisa estar logado no portal pra falar com a Maia.');
      }
      var body = {
        question: prompt.userMsg,
        system: prompt.system,
        history: (conversationHistory || []).map(function (m) {
          return { role: m.role, content: m.content };
        })
      };
      return fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + accessToken,
          'apikey': CFG.supabaseAnonKey
        },
        body: JSON.stringify(body)
      });
    }).then(function (resp) {
      return resp.json().then(function (data) { return { status: resp.status, data: data }; });
    }).then(function (r) {
      if (r.status >= 200 && r.status < 300) {
        var txt = (r.data && r.data.answer) || '';
        if (!txt) throw new Error('Resposta vazia da Maia.');
        return txt;
      }
      // mapeia erros amigáveis
      var err = r.data && (r.data.message || r.data.error) || ('HTTP ' + r.status);
      if (r.status === 401) err = 'Você precisa estar logado para usar a Maia.';
      if (r.status === 429) err = 'Limite de perguntas atingido. Tenta de novo em 1 minuto.';
      if (r.data && r.data.error === 'server_misconfigured') {
        err = 'A Maia ainda não foi configurada no servidor. Avisa o admin pra adicionar a chave Gemini nos secrets do Supabase.';
      }
      throw new Error(err);
    });
  }

  // ── Markdown muito simples → HTML ──
  function mdToHtml(md) {
    var html = esc(md)
      // bold **x**
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // italic *x* (mas evita o que já virou bold)
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      // inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    // bullets: linhas começando com • ou - ou *
    var lines = html.split('\n');
    var out = [];
    var inUl = false;
    lines.forEach(function (ln) {
      var m = ln.match(/^\s*[•\-*]\s+(.*)/);
      if (m) {
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push('<li>' + m[1] + '</li>');
      } else {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (ln.trim()) out.push('<p>' + ln + '</p>');
      }
    });
    if (inUl) out.push('</ul>');
    return out.join('');
  }

  // ── Render ──
  function renderHistory() {
    var box = $('#kbc-messages');
    if (!box) return;
    if (history.length === 0) {
      box.innerHTML = welcomeHTML();
      return;
    }
    box.innerHTML = history.map(function (m) {
      if (m.role === 'user') {
        return '<div class="kbc-msg user"><div class="kbc-bubble">' + esc(m.content) + '</div></div>';
      }
      var sourcesHtml = '';
      if (m.sources && m.sources.length) {
        sourcesHtml = '<div class="kbc-sources">' + m.sources.map(function (s) {
          return '<span class="kbc-src">📘 ' + esc(s) + '</span>';
        }).join('') + '</div>';
      }
      return '<div class="kbc-msg bot">' +
               '<div class="maia-avatar maia-avatar-sm"></div>' +
               '<div class="kbc-bubble">' + mdToHtml(m.content) + sourcesHtml + '</div>' +
             '</div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  function welcomeHTML() {
    var examples = [
      'Sobra de crédito Bradesco — qual o prazo?',
      'A Porto aceita máquinas agrícolas?',
      'FGTS pode ser usado pra dar lance?',
      'Como funciona o reajuste no Itaú?',
      'Quais documentos pro consórcio de imóvel Bradesco?'
    ];
    var ex = examples.map(function (e) {
      return '<button class="kbc-example" data-q="' + esc(e) + '">' + esc(e) + '</button>';
    }).join('');
    return (
      '<div class="kbc-welcome">' +
        '<div class="kbc-welcome-avatar maia-avatar maia-avatar-lg"></div>' +
        '<h3>Oi, eu sou a Maia 👋</h3>' +
        '<p>Sua assistente do <strong>Material de Apoio</strong>. Posso te ajudar com dúvidas sobre Porto, Itaú, Bradesco, FGTS Caixa e Comissões — respondo com base no material do portal e cito as fontes.</p>' +
        '<div class="kbc-examples-label">Posso começar por aqui:</div>' +
        '<div class="kbc-examples">' + ex + '</div>' +
      '</div>'
    );
  }

  function addMessage(role, content, sources) {
    var msg = { role: role, content: content, ts: Date.now() };
    if (sources) msg.sources = sources;
    history.push(msg);
    if (history.length > MAX_DISPLAY_TURNS) history = history.slice(-MAX_DISPLAY_TURNS);
    saveHistory();
    renderHistory();
  }

  // ── Lida com submit ──
  function send(question) {
    if (!question || isLoading) return;
    addMessage('user', question);

    var input = $('#kbc-input');
    if (input) input.value = '';
    setLoading(true);

    // Histórico curto pra contexto (últimas N mensagens, exceto a que acabamos de adicionar)
    var convHist = history.slice(0, -1).slice(-MAX_HISTORY_TURNS);
    var relevant = findRelevantCards(question, CFG.maxCardsContext || 12);
    var sources = relevant.slice(0, 8).map(function (c) {
      return c.titulo + ' · ' + c.admNome + ' · ' + c.categoria;
    });

    askMaia(question, relevant, convHist)
      .then(function (answer) {
        // Extrai os "📘 Fonte:" do texto se vierem inline, ou usa os cards relevantes top
        var foundInlineSources = (answer.match(/📘\s*Fonte[:：]?\s*[^\n]+/g) || []);
        var srcUsed = foundInlineSources.length > 0
          ? foundInlineSources.map(function (s) { return s.replace(/^📘\s*Fonte[:：]?\s*/, '').trim(); })
          : sources.slice(0, 3);
        // Remove a linha "Fonte:" duplicada do corpo
        var cleanAnswer = answer.replace(/(\n+)?📘\s*Fonte[:：]?\s*[^\n]+/g, '').trim();
        addMessage('assistant', cleanAnswer, srcUsed);
      })
      .catch(function (err) {
        console.error('[KB Chat] erro:', err);
        var msg = 'Tive um probleminha: ' + err.message;
        if (err.message && err.message.indexOf('CONFIG') === 0) {
          msg = '⚠️ A Maia ainda não foi configurada no portal. Veja `kb-chat-config.js`.';
        } else if (err.message && err.message.indexOf('AUTH') === 0) {
          msg = '⚠️ Você precisa estar logado no portal pra falar comigo.';
        }
        addMessage('assistant', msg, []);
      })
      .then(function () { setLoading(false); });
  }

  function setLoading(v) {
    isLoading = v;
    var btn = $('#kbc-send');
    var input = $('#kbc-input');
    var typing = $('#kbc-typing');
    if (btn) btn.disabled = v;
    if (input) input.disabled = v;
    if (typing) typing.style.display = v ? 'flex' : 'none';
    if (v) {
      // scroll pro fundo pra ver o "digitando..."
      var box = $('#kbc-messages');
      if (box) box.scrollTop = box.scrollHeight;
    }
  }

  function clearChat() {
    if (history.length === 0) return;
    if (!confirm('Limpar toda a conversa?')) return;
    history = [];
    saveHistory();
    renderHistory();
  }

  // ── Mount ──
  function mount(container) {
    history = loadHistory();
    container.innerHTML = (
      '<div class="kbc-root">' +
        '<div class="kbc-head">' +
          '<div class="kbc-head-l">' +
            '<div class="maia-avatar maia-avatar-md"></div>' +
            '<div>' +
              '<div class="kbc-head-title">Maia <span class="kbc-head-status">● online</span></div>' +
              '<div class="kbc-head-sub">Sua assistente do Material de Apoio</div>' +
            '</div>' +
          '</div>' +
          '<button class="kbc-clear" id="kbc-clear" title="Limpar conversa">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>' +
            ' Limpar' +
          '</button>' +
        '</div>' +
        '<div class="kbc-messages" id="kbc-messages"></div>' +
        '<div class="kbc-typing" id="kbc-typing" style="display:none">' +
          '<div class="maia-avatar maia-avatar-sm"></div>' +
          '<span class="kbc-dot"></span><span class="kbc-dot"></span><span class="kbc-dot"></span>' +
          '<span class="kbc-typing-label">Maia está digitando…</span>' +
        '</div>' +
        '<form class="kbc-form" id="kbc-form">' +
          '<input id="kbc-input" type="text" autocomplete="off" placeholder="Pergunte para a Maia… ex.: Sobra de crédito Bradesco prazo?" />' +
          '<button type="submit" id="kbc-send" class="kbc-send" title="Enviar (Enter)">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
          '</button>' +
        '</form>' +
        '<div class="kbc-foot">As respostas vêm da Maia (IA) com base no material do portal. Sempre confirme valores e prazos com a administradora antes de enviar ao cliente.</div>' +
      '</div>'
    );

    renderHistory();

    var form = $('#kbc-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = $('#kbc-input');
        var v = input ? input.value.trim() : '';
        if (v) send(v);
      });
    }
    var clearBtn = $('#kbc-clear');
    if (clearBtn) clearBtn.addEventListener('click', clearChat);

    // Delegate: clica em sugestão de pergunta
    container.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.kbc-example') : null;
      if (!btn) return;
      var q = btn.getAttribute('data-q');
      if (q) {
        var input = $('#kbc-input');
        if (input) input.value = q;
        send(q);
      }
    });

    // Foca o input
    setTimeout(function () { var i = $('#kbc-input'); if (i) i.focus(); }, 100);
  }

  function isConfigured() {
    return CFG && CFG.supabaseUrl && CFG.supabaseAnonKey && CFG.enabled !== false;
  }

  // ── API pública ────────────────────────────────────────────
  window.KB_CHAT = {
    mount: mount,
    isConfigured: isConfigured
  };
})();
