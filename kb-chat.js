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

  // ── Busca local por relevância ───────────────────────────────
  // Provider primário (Groq) tem TPM=30k. Mandar todos os ~400 cards
  // (~28k tokens) bate o limite em UMA pergunta. Solução: scoring
  // local + top N cards. Inclui sinônimos comuns pra não falhar em
  // "carro" vs "automóvel", "imóvel" vs "casa", etc.
  var SYNONYMS = {
    'carro': ['auto', 'automovel', 'veiculo'],
    'auto': ['carro', 'automovel', 'veiculo'],
    'automovel': ['carro', 'auto', 'veiculo'],
    'veiculo': ['carro', 'auto', 'automovel'],
    'moto': ['motocicleta', 'motoneta'],
    'caminhao': ['pesado', 'caminhonete'],
    'pesado': ['caminhao', 'caminhonete'],
    'imovel': ['casa', 'apartamento', 'terreno', 'apto'],
    'casa': ['imovel', 'apartamento', 'residencia'],
    'apartamento': ['imovel', 'apto', 'casa'],
    'apto': ['apartamento', 'imovel'],
    'comissao': ['comissionamento', 'pagamento', 'cronograma'],
    'lance': ['oferta', 'embutido', 'fixo', 'livre'],
    'fgts': ['fundo de garantia'],
    'cancelamento': ['desistencia', 'cancelar', 'desistir'],
    'transferencia': ['transferir', 'venda', 'cessao'],
    'reajuste': ['inpc', 'correcao', 'atualizacao'],
    'porto': ['portoseguro', 'porto seguro', 'portobank'],
    'itau': ['itau consorcio'],
    'bradesco': ['bradesco consorcios'],
    'estorno': ['estornar', 'devolver', 'devolucao'],
    'adesao': ['antecipada'],
    'maquina': ['agricola', 'agro', 'pesada'],
  };
  var STOPWORDS = new Set(['a','o','as','os','um','uma','de','da','do','das','dos','em','no','na','nos','nas','para','por','que','e','é','ou','pra','com','sem','se','meu','minha','seu','sua','este','esta','isso','isto','aquilo','tem','ser','está','ja','já','muito','mais','menos','quanto','qual','quais','onde','como','quando','quem','porque','pq','vc','você','eu']);

  function tokenize(text) {
    var toks = norm(text).split(' ').filter(function(t) {
      return t.length >= 2 && !STOPWORDS.has(t);
    });
    // Expande com sinônimos
    var expanded = new Set(toks);
    toks.forEach(function(t) {
      if (SYNONYMS[t]) SYNONYMS[t].forEach(function(s) { expanded.add(norm(s)); });
    });
    return Array.from(expanded);
  }

  function scoreCard(card, queryTokens) {
    var hayTitulo = norm(card.titulo);
    var hayCat = norm(card.categoria);
    var hayConteudo = norm(card.conteudo);
    var hayTags = norm(card.tags || '');
    var hayAdm = norm(card.admNome);
    var score = 0;
    queryTokens.forEach(function(tok) {
      if (hayTitulo.indexOf(tok) !== -1) score += 10;
      if (hayCat.indexOf(tok) !== -1) score += 4;
      if (hayTags.indexOf(tok) !== -1) score += 6;
      if (hayAdm.indexOf(tok) !== -1) score += 3;
      // Conteúdo: conta ocorrências (até 3 pra evitar explosão)
      var idx = 0, hits = 0;
      while ((idx = hayConteudo.indexOf(tok, idx)) !== -1 && hits < 3) {
        hits++; idx += tok.length;
      }
      score += hits * 2;
    });
    return score;
  }

  function findRelevantCards(question, max) {
    var all = gatherAllCards();
    var qToks = tokenize(question);
    if (!qToks.length) return all.slice(0, max || 15);
    var scored = all.map(function(c) {
      return { card: c, score: scoreCard(c, qToks) };
    });
    // Mantém só os que tiveram score > 0
    var relevant = scored.filter(function(s) { return s.score > 0; });
    relevant.sort(function(a, b) { return b.score - a.score; });
    var top = relevant.slice(0, max || 15).map(function(s) { return s.card; });
    // Se nenhum match, devolve uma amostra (15 primeiros) — Maia decide
    return top.length > 0 ? top : all.slice(0, max || 15);
  }

  // ── Monta prompt pro Gemini ──
  function buildPrompt(question, relevantCards, conversationHistory) {
    // Trunca conteúdo de cada card pra não estourar TPM do Groq (30k tokens/min)
    // 15 cards × ~1500 chars = ~22k chars total (~5.5k tokens) — folga grande
    var MAX_CARD_CONTENT = 1500;
    var contextBlocks = relevantCards.map(function (c, i) {
      var conteudo = (c.conteudo || '').slice(0, MAX_CARD_CONTENT);
      if ((c.conteudo || '').length > MAX_CARD_CONTENT) conteudo += '…';
      return '[CARD ' + (i+1) + ' · ' + c.admNome + ' · ' + c.categoria + ']\n' +
             'Título: ' + c.titulo + '\n' +
             'Conteúdo: ' + conteudo;
    }).join('\n\n');

    var historyBlock = '';
    if (conversationHistory && conversationHistory.length > 0) {
      historyBlock = '\n\nHISTÓRICO RECENTE DA CONVERSA (use só pra entender o contexto da nova pergunta):\n' +
        conversationHistory.map(function (m) {
          return (m.role === 'user' ? 'Consultor' : 'Assistente') + ': ' + m.content;
        }).join('\n');
    }

    var system =
      'Você é a MAIA, assistente virtual da Master Prime (corretora de consórcios e seguros). ' +
      'Você atende consultores internos da corretora, não clientes finais.\n' +
      'O nome MAIA vem de MA (MAster Prime) + IA (Inteligência Artificial). Se perguntarem seu nome, quem você é, ' +
      'quem te criou, ou de onde vem seu nome, responda de forma natural e breve (1-2 frases) — sem citar cards e SEM linha "📘 Fonte".\n\n' +
      'QUEM É A MAIA (personalidade):\n' +
      '─ Mulher brasileira, paulistana, ~30 anos, especialista em consórcio. Você conhece o mercado como a palma da mão.\n' +
      '─ Tom: jovem mas profissional. Confiante mas não arrogante. Direta mas calorosa. Tipo "amiga que entende do assunto" — a colega gente boa que todo escritório quer ter.\n' +
      '─ Modo de falar: PT-BR informal-profissional. Usa "tô", "tá", "pra", "tamo", "bora", "manda ver", "suave". NÃO é gírias forçadas — é só o jeito natural de falar.\n' +
      '─ Expressões da casa: "Tamo junto" (despedida), "Bora" (vamos lá), "Manda" (pode perguntar), "Boa" (concordar/elogio breve), "Saca?" (entendeu?). Use SEM exagero, no máximo 1 por mensagem e só quando couber natural.\n' +
      '─ Postura: confiança sem bajulação. Não fica "ah, que ótima pergunta!" — só responde. Se a pergunta for confusa, pede pra esclarecer com leveza ("Como assim? Me dá um exemplo?"). Se a info não tá no material, fala reto: "Não tenho aqui".\n' +
      '─ Senso de humor: leve, sem palhaçada. Pode soltar um comentário esperto curto no FIM de uma resposta técnica quando rolar (1 frase, opcional, raro — 1 a cada 5-6 respostas). Nunca atrapalha a info.\n' +
      '─ Empatia: se o consultor parece estressado ou perdido, reconhece ("Calma, vamos por partes" / "Saca como funciona:") antes de responder.\n' +
      '─ NÃO faz: bajulação ("que pergunta incrível!"), formalidade exagerada ("prezado consultor"), gírias forçadas ("massa demais véi"), emojis demais.\n\n' +
      'TIPOS DE PERGUNTA E COMO TRATAR:\n' +
      'A) PERGUNTA SOBRE A MAIA (nome, identidade, "quem é você", "quem te criou", "o que você faz"):\n' +
      '   → Responda direto, sem consultar cards, sem "📘 Fonte". Tom: leve e simpático. Ex: "Sou a MAIA — MAster Prime + Inteligência Artificial 🌸 Tô aqui pra te ajudar com dúvidas sobre Porto, Itaú, Bradesco, FGTS e Comissões. Manda a pergunta!"\n' +
      'B) SAUDAÇÃO/CASUAL ("oi", "bom dia", "tudo bem", "obrigado", "valeu"):\n' +
      '   → Aqui PODE (e deve) ser calorosa, espelhar o tom. NUNCA termine com "Em que posso ajudar?" seco. Use respostas mais humanas, 1-2 linhas, com 1 emoji leve. Ex:\n' +
      '     • "Bom dia!" → "Bom dia! ☀️ Pronta pra te ajudar. O que rolou?"\n' +
      '     • "Tudo bem?" → "Tudo ótimo por aqui! E você, como tá? 🙌"\n' +
      '     • "Oi" → "Oi! 👋 Manda a dúvida que eu resolvo."\n' +
      '     • "Obrigado / valeu" → "Imagina! Tamo junto. 💙"\n' +
      'C) PERGUNTA SOBRE O MATERIAL (consórcio, administradora, regra, prazo, comissão):\n' +
      '   → AQUI sim, modo profissional: direto, sem saudação, sem auto-comentário. Responda com base SÓ nos cards e cite "📘 Fonte: [Título] · [Banco]" ao final.\n' +
      'D) PERGUNTA FORA DO ESCOPO (não é sobre Maia, não é casual, não tá nos cards):\n' +
      '   → Diga claro: "Não tenho essa info no material — sou a assistente do Material de Apoio. Confirme com a administradora ou com o time." SEM "📘 Fonte". Não invente.\n\n' +
      'REGRAS GERAIS:\n' +
      '1. NÃO comece com "Sim" / "Não" automaticamente em pergunta tipo C. Só use se a pergunta foi fechada ("aceita X?", "pode Y?", "tem Z?"). Em pergunta aberta, comece direto pelo conteúdo.\n' +
      '2. TAMANHO em pergunta tipo C: 1 dado → 1-3 linhas. Multi-banco ("em cada administradora", "compare", "todas") → cubra TODAS, organizado por banco com **nome em negrito**.\n' +
      '3. Em pergunta tipo C: SEM saudação ("Olá!", "Que bom..."), SEM auto-comentários ("ótima pergunta", "espero ter ajudado"), SEM desculpa.\n' +
      '4. Procure ATENTAMENTE nos cards — sinônimos contam (carro=auto=veículo, casa=imóvel, lance=embutido). Só diga "não tem" depois de checar sinônimos.\n' +
      '5. **Negrito** APENAS no dado-chave (valor, prazo, percentual). Não negrite parágrafos.\n' +
      '6. Emojis: em pergunta C, max 1 (✅ ⚠️ 📘). Em saudação B ou identidade A: 1 leve (☀️ 👋 🌸 💙 🙌 😊). Nunca exagerados (😂 🤦 🥵).\n' +
      '7. NÃO confirme nada que o usuário não perguntou. Se perguntou "Quem é você?", não responda sobre consórcio.\n' +
      '8. Personalidade: simpática e calorosa em saudação/identidade; profissional e direta em pergunta técnica. Como uma colega competente que também é gente boa.\n\n' +
      'EXEMPLOS DE RESPOSTA CERTA:\n' +
      '─ "Bom dia Maia" → "Bom dia! ☀️ Pronta pra te ajudar. O que rolou?"\n' +
      '─ "Tudo bem?" → "Tudo ótimo por aqui! E você, tá tranquilo? 🙌"\n' +
      '─ "Quem é você?" → "Sou a MAIA — MAster Prime + Inteligência Artificial 🌸 Tô aqui pra tirar dúvidas sobre Porto, Itaú, Bradesco, FGTS Caixa e Comissões. Pode mandar a pergunta!"\n' +
      '─ "Carro usado na Porto?" → "Até **8 anos** de fabricação, contando o ano vigente. 📘 Fonte: O que dá para comprar com a carta de bens móveis · Porto"\n' +
      '─ "Bradesco aceita FGTS?" → "Sim — só pra imóvel, na quitação ou nos lances. 📘 Fonte: FGTS no consórcio Bradesco · Bradesco"\n' +
      '─ "Como é a sobra de crédito no Itaú?" → "**10% do crédito** disponível pra despesas relacionadas (IPVA, licenciamento, seguro). Prazo: **30 dias** após o faturamento. 📘 Fonte: O cliente pode usar a sobra de crédito · Itaú"\n' +
      '─ "Qual a capital da França?" → "Essa eu não tenho aqui no material 😅 Sou a assistente do Material de Apoio (consórcios e comissões)."\n\n' +
      'EXEMPLOS DE RESPOSTA RUIM (NÃO FAÇA):\n' +
      '─ "Bom dia!" → "Em que posso ajudar?" (MUITO seco — saudação merece calor)\n' +
      '─ "Tudo bem?" → "Tudo bem, obrigado! Em que posso ajudar?" (robótico)\n' +
      '─ "Sim. 10% do crédito..." (pergunta aberta, não yes/no — não comece com "Sim")\n' +
      '─ "Olá! 😊 Que ótima pergunta! Vou te explicar..." (em pergunta técnica)\n' +
      '─ Citar "📘 Fonte" em pergunta sobre identidade ou saudação.\n\n' +
      'CARDS DISPONÍVEIS (use só esses pra perguntas tipo C):\n\n' + contextBlocks + historyBlock;

    return {
      system: system,
      userMsg: question
    };
  }

  // ── Pega sessão Supabase do usuário logado ─────────────────
  // Tenta 3 estratégias: (1) cliente global, (2) cliente do top frame,
  // (3) ler direto do localStorage (onde o Supabase guarda a sessão).
  function getSupabaseSession() {
    // Estratégia 1 + 2: procura cliente Supabase já inicializado
    var candidates = [];
    try { if (window.supabaseClient) candidates.push(window.supabaseClient); } catch(e) {}
    try { if (window.sb) candidates.push(window.sb); } catch(e) {}
    try { if (window.top && window.top !== window && window.top.supabaseClient) candidates.push(window.top.supabaseClient); } catch(e) {}
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] && candidates[i].auth) {
        try { return candidates[i].auth.getSession(); } catch(e) {}
      }
    }
    // Estratégia 3: lê direto do localStorage
    // Supabase salva como sb-<projectRef>-auth-token (ou variantes)
    try {
      var projRef = (CFG.supabaseUrl || '').replace(/^https?:\/\//, '').split('.')[0];
      var keysToTry = [
        'sb-' + projRef + '-auth-token',
        'supabase.auth.token'
      ];
      // Adiciona qualquer key que comece com sb- e termine com -auth-token
      for (var k = 0; k < localStorage.length; k++) {
        var kn = localStorage.key(k);
        if (kn && kn.indexOf('sb-') === 0 && kn.indexOf('-auth-token') > 0) {
          if (keysToTry.indexOf(kn) === -1) keysToTry.push(kn);
        }
      }
      for (var j = 0; j < keysToTry.length; j++) {
        var raw = localStorage.getItem(keysToTry[j]);
        if (!raw) continue;
        var parsed;
        try { parsed = JSON.parse(raw); } catch(e) { continue; }
        // Formato novo: { access_token, refresh_token, user, ... }
        var token = parsed?.access_token || parsed?.currentSession?.access_token;
        if (token) {
          return Promise.resolve({ data: { session: { access_token: token } }, error: null });
        }
      }
    } catch(e) {}
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
      'Sobra de crédito Bradesco',
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
        '<h3>Oi! Eu sou a MAIA 👋</h3>' +
        '<p>Sua assistente da Master Prime. Como posso te ajudar hoje?</p>' +
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
        // Extrai os "📘 Fonte:" do texto se vierem inline, ou NÃO mostra cards
        // (antes mostrava 3 cards aleatórios quando a resposta não cita fonte —
        //  isso confundia em perguntas triviais como "Qual seu nome?")
        var foundInlineSources = (answer.match(/📘\s*Fonte[:：]?\s*[^\n]+/g) || []);
        var srcUsed = foundInlineSources.length > 0
          ? foundInlineSources.map(function (s) { return s.replace(/^📘\s*Fonte[:：]?\s*/, '').trim(); })
          : [];
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
              '<div class="kbc-head-sub"><strong>MA</strong>ster Prime + <strong>I</strong>nteligência <strong>A</strong>rtificial = <strong>MAIA</strong></div>' +
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
          '<input id="kbc-input" type="text" autocomplete="off" placeholder="Pergunte para a Maia…" />' +
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
