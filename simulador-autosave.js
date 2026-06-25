// ═════════════════════════════════════════════════════════════════
// Master Prime — Autosave dos Simuladores
// ─────────────────────────────────────────────────────────────────
// O que faz:
//   • Salva automaticamente cada input/select/textarea no localStorage
//     enquanto o consultor digita (debounce 350ms).
//   • Ao reabrir o simulador, restaura tudo de onde parou — não precisa
//     clicar em "Salvar simulação". Inspirado no comportamento do Ololu.
//   • A chave do localStorage é única por simulador (usa o pathname).
//   • Detecta os botões "Limpar tudo" / "Limpar" e zera o storage junto.
//
// Como funciona:
//   1. No load: lê o snapshot do localStorage e popula cada campo,
//      disparando 'input', 'change' e 'blur' pra rodar as máscaras e o
//      recalc do simulador.
//   2. Em cada digitação: salva o snapshot completo (debounced).
//
// Como usar:
//   <script src="simulador-autosave.js?v=20260616a"></script>
//   (já carregado em cada simulador — não precisa fazer init).
// ═════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // Chave única por simulador (pega o nome do arquivo HTML da URL).
  const path = (location.pathname.split('/').pop() || 'sim').replace(/\.html?$/i, '');
  const STORAGE_KEY = 'mp-sim-autosave::' + path;
  const VERSION_KEY = STORAGE_KEY + '::v';
  const OPS_KEY     = STORAGE_KEY + '::ops';   // linhas dinâmicas (Estruturada / Investidor)
  const SCHEMA_VERSION = 1;

  // ─── Operações (linhas dinâmicas) ─────────────────────────────
  // Simuladores como Estruturada e Investimento têm um array `operacoes`
  // (variável `let` do escopo do script, invisível em `window`). Pra
  // integrar com o autosave, esses simuladores expõem 2 callbacks:
  //   window._mpGetOps     = () => operacoes;
  //   window._mpRestoreOps = (saved) => { operacoes = saved; nextId = ... };
  // Se esses callbacks NÃO existirem (simuladores simples), as funções
  // abaixo viram no-op.
  function _hasOps() { return typeof window._mpGetOps === 'function'; }
  function _saveOps() {
    if (!_hasOps()) return;
    try {
      const ops = window._mpGetOps();
      if (!Array.isArray(ops)) return;
      localStorage.setItem(OPS_KEY, JSON.stringify({ operacoes: ops }));
    } catch (e) { /* localStorage cheio */ }
  }
  function _restoreOps() {
    if (!_hasOps() || typeof window._mpRestoreOps !== 'function') return false;
    try {
      const raw = localStorage.getItem(OPS_KEY);
      if (!raw) return false;
      const obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.operacoes)) return false;
      window._mpRestoreOps(obj.operacoes);
      if (typeof window.renderOps === 'function') {
        try { window.renderOps(); } catch (_) {}
      }
      return true;
    } catch (e) { return false; }
  }
  function _clearOps() {
    try { localStorage.removeItem(OPS_KEY); } catch (_) {}
  }
  // Exposto pra os simuladores chamarem manualmente se quiserem
  window._mpAutoSaveOps = _saveOps;

  // Seleciona todos os campos que devem ser persistidos.
  // Pula campos disabled, hidden, autocomplete='off' explícito e tags
  // internas (modais de % de lance, etc) — só queremos os inputs reais
  // que o consultor mexe.
  function getCampos() {
    return Array.from(document.querySelectorAll(
      'input[id], select[id], textarea[id]'
    )).filter(el => {
      if (el.type === 'hidden' || el.type === 'button' || el.type === 'submit') return false;
      if (el.dataset.noAutosave === 'true') return false;
      // Não autosalva inputs dos modais "% de lance livre"
      if (/modal/i.test(el.id)) return false;
      return true;
    });
  }

  // Patch automático em `renderOps`: cada vez que for chamada (após uma
  // mutação de operacoes), salva o array. Aplicado depois do DOMContentLoaded.
  function _patchRenderOps() {
    if (typeof window.renderOps !== 'function' || window.renderOps.__autosavePatched) return;
    const original = window.renderOps;
    window.renderOps = function () {
      const ret = original.apply(this, arguments);
      _saveOps();
      return ret;
    };
    window.renderOps.__autosavePatched = true;
  }

  // ─── Restaurar ──────────────────────────────────────────────────
  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const v = parseInt(localStorage.getItem(VERSION_KEY) || '0', 10);
      if (v !== SCHEMA_VERSION) return;  // esquema mudou, ignora

      const snap = JSON.parse(raw);
      if (!snap || typeof snap !== 'object') return;

      const campos = getCampos();
      let restoredAny = false;
      campos.forEach(el => {
        if (!(el.id in snap)) return;
        const val = snap[el.id];
        if (val === null || val === undefined) return;
        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = !!val;
        } else {
          el.value = val;
        }
        restoredAny = true;
      });

      // Mesmo sem inputs restaurados, prossegue pra restaurar as linhas
      // dinâmicas (operacoes) — feito após o try/catch, fora deste bloco.
      if (!restoredAny) return; // pula só os disparos de eventos abaixo

      // Dispara os eventos pras máscaras (money, pct, int) reaplicarem
      // a formatação e o recalc rodar. Usa requestAnimationFrame pra
      // garantir que o script principal do simulador já rodou.
      requestAnimationFrame(() => {
        campos.forEach(el => {
          if (!(el.id in snap)) return;
          el.dispatchEvent(new Event('input',  { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur',   { bubbles: true }));
        });
        // Recalc final (alguns simuladores expõem como window.recalc)
        if (typeof window.recalc === 'function') {
          try { window.recalc(); } catch (_) {}
        }
      });
    } catch (e) {
      console.warn('[autosave] falha ao restaurar:', e);
    } finally {
      // Restaura linhas dinâmicas mesmo se o snapshot de inputs estava vazio
      _restoreOps();
      _patchRenderOps();
    }
  }

  // ─── Salvar ─────────────────────────────────────────────────────
  let _saveTimer = null;
  function scheduleSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(saveNow, 350);
  }
  function saveNow() {
    try {
      const snap = {};
      getCampos().forEach(el => {
        if (el.type === 'checkbox' || el.type === 'radio') {
          snap[el.id] = !!el.checked;
        } else {
          snap[el.id] = el.value || '';
        }
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
      localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
    } catch (e) {
      // localStorage pode estar cheio ou bloqueado (modo privado, etc)
      console.warn('[autosave] falha ao salvar:', e);
    }
  }
  // expõe pra debug
  window._mpAutoSaveNow = saveNow;

  // ─── Limpar ────────────────────────────────────────────────────
  function clearStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(VERSION_KEY);
      _clearOps();
    } catch (_) {}
  }
  window._mpAutoSaveClear = clearStorage;

  // ─── Wire-up ───────────────────────────────────────────────────
  function wireUp() {
    // Salva a cada mudança nos campos
    document.addEventListener('input',  scheduleSave, true);
    document.addEventListener('change', scheduleSave, true);

    // Botões de limpar — apaga o storage também.
    // Cobre 'btnLimparTudo' e qualquer botão com texto "Limpar tudo" /
    // "Limpar simulação". Não apaga em "Limpar" de seções específicas
    // (proposta, lance, obs) porque o usuário pode querer só zerar
    // aquela parte.
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.id || '';
      const txt = (btn.textContent || '').trim().toLowerCase();
      if (id === 'btnLimparTudo' || /limpar tudo|limpar simula/.test(txt)) {
        clearStorage();
      }
    }, true);

    // Restaura DEPOIS que o script do simulador rodou pra ter as
    // máscaras prontas. setTimeout 0 já vai pro final da fila.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(restore, 0));
    } else {
      setTimeout(restore, 0);
    }
  }

  wireUp();
})();
