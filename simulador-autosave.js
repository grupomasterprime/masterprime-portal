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
  const SCHEMA_VERSION = 1;

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

      if (!restoredAny) return;

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
