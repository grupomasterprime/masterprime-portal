/*
 * Master Prime — Simulação Store (compartilhado pelos simuladores)
 * --------------------------------------------------------------
 * Permite que cada simulador salve / restaure simulações por 48h
 * usando a tabela portal_simulacoes_salvas no Supabase.
 *
 * Como usar dentro de um simulador:
 *   1) Carregue o supabase-js e este arquivo:
 *      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *      <script src="simulacao-store.js"></script>
 *
 *   2) Inicialize (uma vez):
 *      SimulacaoStore.init({
 *        supabaseUrl: 'https://...supabase.co',
 *        supabaseKey: '...',
 *        simulador:   'estruturada',                  // slug do simulador
 *        serialize:   () => ({...}),                  // captura o estado
 *        restore:     (dados) => { ... },             // restaura o estado
 *        mountPoint:  document.getElementById('simStoreBar') // onde injetar a UI
 *      });
 */
(function (global) {
  'use strict';

  const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

  let cfg = null;
  let sb  = null;
  let user = null;
  let currentSavedId = null; // id da simulação carregada atualmente (para sobrescrever)
  let cachedList = [];

  // ── helpers ─────────────────────────────────────────────────────
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fmtExpira(iso) {
    if (!iso) return '';
    const diffMs = new Date(iso).getTime() - Date.now();
    if (diffMs <= 0) return 'expirada';
    const h = Math.floor(diffMs / (60*60*1000));
    const m = Math.floor((diffMs % (60*60*1000)) / (60*1000));
    if (h >= 1) return `expira em ${h}h${m ? ' '+m+'min' : ''}`;
    return `expira em ${m} min`;
  }

  // ── auth ────────────────────────────────────────────────────────
  async function loadUser() {
    try {
      const { data } = await sb.auth.getUser();
      user = data?.user || null;
    } catch (e) {
      user = null;
    }
    return user;
  }

  // ── CRUD ───────────────────────────────────────────────────────
  async function salvar(titulo, dados, extras = {}) {
    if (!user) throw new Error('Usuário não logado');
    const expira = new Date(Date.now() + FORTY_EIGHT_HOURS_MS).toISOString();
    const payload = {
      consultor_auth_id: user.id,
      consultor_nome:    extras.consultor_nome || null,
      simulador:         cfg.simulador,
      titulo:            (titulo || 'Sem título').slice(0, 200),
      cliente_nome:      extras.cliente_nome || null,
      observacoes:       extras.observacoes  || null,
      dados,
      expira_em:         expira
    };
    const { data, error } = await sb
      .from('portal_simulacoes_salvas')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    currentSavedId = data.id;
    return data;
  }

  async function atualizar(id, titulo, dados, extras = {}) {
    const payload = { dados, titulo: (titulo || 'Sem título').slice(0, 200) };
    if (extras.cliente_nome !== undefined) payload.cliente_nome = extras.cliente_nome;
    if (extras.observacoes  !== undefined) payload.observacoes  = extras.observacoes;
    const { data, error } = await sb
      .from('portal_simulacoes_salvas')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    currentSavedId = data.id;
    return data;
  }

  async function listar() {
    if (!user) return [];
    const { data, error } = await sb
      .from('portal_simulacoes_salvas')
      .select('id, titulo, cliente_nome, dados, criado_em, atualizado_em, expira_em')
      .eq('consultor_auth_id', user.id)
      .eq('simulador', cfg.simulador)
      .gt('expira_em', new Date().toISOString())
      .order('atualizado_em', { ascending: false });
    if (error) throw error;
    cachedList = data || [];
    return cachedList;
  }

  async function carregar(id) {
    const { data, error } = await sb
      .from('portal_simulacoes_salvas')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async function deletar(id) {
    const { error } = await sb
      .from('portal_simulacoes_salvas')
      .delete()
      .eq('id', id);
    if (error) throw error;
    if (currentSavedId === id) currentSavedId = null;
  }

  // ── UI ─────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('simStoreStyles')) return;
    const css = `
      .ss-bar { background:#fff; border:1px solid #E5E7EB; border-radius:10px; padding:10px 14px;
                display:flex; align-items:center; gap:10px; margin:0 0 14px 0; font-size:13px;
                box-shadow:0 1px 2px rgba(0,0,0,.04); }
      .ss-bar.hidden { display:none; }
      .ss-bar .ss-icon { width:28px; height:28px; background:#F1F5F9; color:#2D3F5E;
                         border-radius:6px; display:flex; align-items:center; justify-content:center;
                         font-size:14px; flex-shrink:0; }
      .ss-bar select { flex:1; min-width:0; padding:6px 8px; border:1px solid #E5E7EB; border-radius:6px;
                       font-size:13px; background:#fff; color:#1F2937; cursor:pointer; }
      .ss-bar button { padding:6px 12px; border:1px solid #E5E7EB; border-radius:6px; background:#fff;
                       color:#2D3F5E; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap;
                       transition: all .15s; }
      .ss-bar button:hover { background:#F1F5F9; }
      .ss-bar button.primary { background:#2D3F5E; color:#fff; border-color:#2D3F5E; }
      .ss-bar button.primary:hover { background:#1E2D45; }
      .ss-bar button.danger { color:#DC2626; }
      .ss-bar button.danger:hover { background:#FEF2F2; border-color:#DC2626; }
      .ss-meta { color:#6B7280; font-size:11px; margin-left:4px; }
      .ss-modal-bg { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:9999;
                     display:flex; align-items:center; justify-content:center; padding:20px; }
      .ss-modal { background:#fff; border-radius:12px; padding:24px; width:100%; max-width:420px;
                  box-shadow:0 25px 50px rgba(0,0,0,.25); }
      .ss-modal h3 { font-size:16px; font-weight:600; color:#2D3F5E; margin-bottom:14px; }
      .ss-modal label { display:block; font-size:11px; color:#6B7280; font-weight:600;
                        text-transform:uppercase; letter-spacing:.5px; margin-bottom:6px; }
      .ss-modal input { width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px;
                        font-size:14px; margin-bottom:14px; outline:none; }
      .ss-modal input:focus { border-color:#4DBCC8; box-shadow:0 0 0 3px rgba(77,188,200,.15); }
      .ss-modal-footer { display:flex; gap:8px; justify-content:flex-end; margin-top:8px; }
      .ss-toast { position:fixed; bottom:24px; right:24px; background:#16A34A; color:#fff;
                  padding:12px 18px; border-radius:8px; font-size:13px; font-weight:500;
                  box-shadow:0 10px 25px rgba(0,0,0,.2); z-index:10000; opacity:0;
                  transition: opacity .2s, transform .2s; transform: translateY(10px); }
      .ss-toast.show { opacity:1; transform: translateY(0); }
      .ss-toast.err { background:#DC2626; }
    `;
    const style = document.createElement('style');
    style.id = 'simStoreStyles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function toast(msg, isErr=false) {
    const t = document.createElement('div');
    t.className = 'ss-toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 250);
    }, 2400);
  }

  function buildBar(mount) {
    injectStyles();
    const bar = document.createElement('div');
    bar.className = 'ss-bar hidden';
    bar.id = 'simStoreBar';
    bar.innerHTML = `
      <span class="ss-icon" title="Simulações salvas (48h)" aria-label="Simulações salvas">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
      </span>
      <select id="ssSelect">
        <option value="">— Nova simulação —</option>
      </select>
      <span class="ss-meta" id="ssMeta"></span>
      <button id="ssSaveBtn">Salvar</button>
      <button id="ssSaveAsBtn">Salvar como nova</button>
      <button id="ssDelBtn" class="danger" style="display:none">Excluir</button>
    `;
    mount.appendChild(bar);

    $('#ssSelect',  bar).addEventListener('change', onSelectChange);
    $('#ssSaveBtn', bar).addEventListener('click', onSaveClick);
    $('#ssSaveAsBtn', bar).addEventListener('click', onSaveAsClick);
    $('#ssDelBtn',  bar).addEventListener('click', onDeleteClick);

    return bar;
  }

  async function refreshSelect() {
    const sel  = $('#ssSelect');
    const meta = $('#ssMeta');
    const del  = $('#ssDelBtn');
    if (!sel) return;

    const items = await listar();
    sel.innerHTML = '<option value="">— Nova simulação —</option>' +
      items.map(it => `<option value="${it.id}">${escapeHtml(it.titulo)} · ${fmtDate(it.atualizado_em)}</option>`).join('');

    if (currentSavedId && items.find(i => i.id === currentSavedId)) {
      sel.value = currentSavedId;
      const cur = items.find(i => i.id === currentSavedId);
      meta.textContent = fmtExpira(cur.expira_em);
      del.style.display = '';
    } else {
      currentSavedId = null;
      meta.textContent = '';
      del.style.display = 'none';
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function onSelectChange(e) {
    const id = e.target.value;
    if (!id) {
      currentSavedId = null;
      $('#ssMeta').textContent = '';
      $('#ssDelBtn').style.display = 'none';
      return;
    }
    try {
      const row = await carregar(id);
      currentSavedId = row.id;
      cfg.restore(row.dados);
      $('#ssMeta').textContent = fmtExpira(row.expira_em);
      $('#ssDelBtn').style.display = '';
      toast('Simulação carregada');
    } catch (err) {
      console.error(err);
      toast('Erro ao carregar', true);
    }
  }

  function promptTitulo(defaultValue = '') {
    return new Promise(resolve => {
      const bg = document.createElement('div');
      bg.className = 'ss-modal-bg';
      bg.innerHTML = `
        <div class="ss-modal">
          <h3>Salvar simulação</h3>
          <label>Nome do cliente / título</label>
          <input id="ssTitInput" type="text" value="${escapeHtml(defaultValue)}" placeholder="Ex: João Silva — apto Jardins">
          <div class="ss-modal-footer">
            <button id="ssTitCancel">Cancelar</button>
            <button id="ssTitOk" class="primary">Salvar</button>
          </div>
        </div>`;
      document.body.appendChild(bg);
      const inp = $('#ssTitInput', bg);
      setTimeout(() => inp.focus(), 30);
      const close = (val) => { bg.remove(); resolve(val); };
      $('#ssTitCancel', bg).addEventListener('click', () => close(null));
      $('#ssTitOk', bg).addEventListener('click', () => close(inp.value.trim()));
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter')  close(inp.value.trim());
        if (e.key === 'Escape') close(null);
      });
    });
  }

  async function doSave(forceNew = false) {
    try {
      const dados = cfg.serialize();
      if (!dados || (typeof dados === 'object' && Object.keys(dados).length === 0)) {
        toast('Nada para salvar ainda', true); return;
      }
      let titulo;
      if (!forceNew && currentSavedId) {
        // sobrescrever a atual sem perguntar — só mostra toast
        const row = cachedList.find(i => i.id === currentSavedId);
        titulo = row?.titulo || 'Sem título';
        await atualizar(currentSavedId, titulo, dados);
        toast('Simulação atualizada');
      } else {
        titulo = await promptTitulo();
        if (titulo === null) return; // cancelado
        await salvar(titulo, dados);
        toast('Simulação salva (48h)');
      }
      await refreshSelect();
    } catch (err) {
      console.error(err);
      toast('Erro ao salvar', true);
    }
  }

  function onSaveClick()   { doSave(false); }
  function onSaveAsClick() { doSave(true); }

  async function onDeleteClick() {
    if (!currentSavedId) return;
    if (!confirm('Excluir esta simulação salva?')) return;
    try {
      await deletar(currentSavedId);
      currentSavedId = null;
      cfg.restore({}); // limpa estado opcionalmente
      await refreshSelect();
      toast('Simulação excluída');
    } catch (err) {
      console.error(err);
      toast('Erro ao excluir', true);
    }
  }

  // ── init ──────────────────────────────────────────────────────
  async function init(options) {
    cfg = Object.assign({
      supabaseUrl: null,
      supabaseKey: null,
      simulador:   null,
      serialize:   () => ({}),
      restore:     () => {},
      mountPoint:  null
    }, options || {});

    if (!cfg.supabaseUrl || !cfg.supabaseKey || !cfg.simulador) {
      console.warn('SimulacaoStore: configuração incompleta — save/load desativados.');
      return null;
    }
    if (!global.supabase || !global.supabase.createClient) {
      console.warn('SimulacaoStore: supabase-js não está carregado.');
      return null;
    }

    sb = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
    await loadUser();

    const mount = cfg.mountPoint || document.body;
    const bar = buildBar(mount);

    if (!user) {
      bar.classList.add('hidden');
      console.info('SimulacaoStore: usuário não logado — save/load oculto.');
      return null;
    }

    bar.classList.remove('hidden');
    await refreshSelect();

    return { refresh: refreshSelect, getCurrentId: () => currentSavedId };
  }

  // ── Helpers genéricos para form simples (inputs / selects / textareas) ──
  function snapshotForm(options) {
    options = options || {};
    const skipPrefixes = options.skipPrefixes || ['ss', 'simStore'];
    const skipIds = new Set(options.skipIds || []);
    const result = {};
    document.querySelectorAll('input[id], select[id], textarea[id]').forEach(function (el) {
      const id = el.id;
      if (skipIds.has(id)) return;
      if (skipPrefixes.some(function (p) { return id.indexOf(p) === 0; })) return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        result[id] = el.checked;
      } else {
        result[id] = el.value;
      }
    });
    return result;
  }

  function restoreForm(data, opts) {
    opts = opts || {};
    const recalcFn = opts.recalc;
    if (!data || typeof data !== 'object') return;
    Object.keys(data).forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      const val = data[id];
      if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = !!val;
      } else {
        el.value = (val == null ? '' : val);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (typeof recalcFn === 'function') {
      try { recalcFn(); } catch (e) { console.error(e); }
    }
  }

  global.SimulacaoStore = { init, snapshotForm, restoreForm };
})(window);
