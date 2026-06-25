/* ─────────────────────────────────────────────────────────────────────────
 *  pdf-config-personalizado.js
 *  Permite a consultores específicos ocultarem linhas do PDF gerado pelos
 *  simuladores dedicados (Porto/Itaú/Bradesco).
 *
 *  Como funciona:
 *  • Cada simulador "registra" suas seções e linhas via PdfConfigPersonalizado.registrar(...)
 *  • Se o usuário logado está na ALLOWLIST, aparece o botão "⚙️ Configurar PDF" no
 *    canto do botão de gerar PDF.
 *  • Click no botão abre modal com checkboxes — uma linha por linha que pode ser ocultada.
 *  • Marcações salvam em localStorage por (usuário × simulador).
 *  • Antes de gerar o PDF, o simulador chama PdfConfigPersonalizado.filtrar(payload)
 *    que devolve uma cópia com as linhas marcadas como ocultas REMOVIDAS.
 *
 *  IDs no localStorage:
 *    mp:pdf-hidden:<USERNAME>:<SIMULADOR>  → JSON array de chaves ocultas
 * ───────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // Allowlist: usuários que podem configurar
  // Para adicionar Douglas no futuro, só incluir aqui.
  const ALLOWLIST = ['ERIK GONCALVES', 'ALLAN ALMEIDA'];

  // Estado interno (preenchido via registrar())
  let _config = null;

  function _getUserName() {
    // O portal declara `let currentUser` no index.html, o que NÃO cria window.currentUser.
    // Então a forma confiável é ler do DOM (o portal seta #sb-user-name na sidebar).
    // Mantemos os outros caminhos como fallback caso o portal mude.
    try {
      // 1) Lê do DOM do top window (mais confiável — o portal sempre seta isso após login)
      if (window.top && window.top.document) {
        const el = window.top.document.getElementById('sb-user-name');
        if (el && el.textContent && el.textContent.trim() && el.textContent.trim() !== '--') {
          return el.textContent.toUpperCase().trim();
        }
      }
      // 2) Fallback: window.top.currentUser (caso o portal exponha no futuro)
      if (window.top && window.top.currentUser && window.top.currentUser.nome) {
        return String(window.top.currentUser.nome).toUpperCase().trim();
      }
      // 3) Fallback: parent imediato (caso simulador rode em iframe direto)
      if (window.parent && window.parent !== window && window.parent.currentUser && window.parent.currentUser.nome) {
        return String(window.parent.currentUser.nome).toUpperCase().trim();
      }
    } catch (e) { /* cross-origin */ }
    return '';
  }

  function _isAllowed() {
    const u = _getUserName();
    return ALLOWLIST.some(a => a.toUpperCase() === u);
  }

  function _storageKey() {
    if (!_config) return null;
    const u = _getUserName() || 'ANON';
    return 'mp:pdf-hidden:' + u + ':' + _config.simulador;
  }

  function _getHidden() {
    const k = _storageKey();
    if (!k) return [];
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : [];
    } catch (e) { return []; }
  }

  function _setHidden(arr) {
    const k = _storageKey();
    if (!k) return;
    try { localStorage.setItem(k, JSON.stringify(arr)); } catch (e) {}
  }

  /* ──────────── API pública ──────────── */

  /**
   * Registra a configuração do simulador atual.
   * @param {Object} cfg
   * @param {string} cfg.simulador - ID curto (ex.: 'porto-auto')
   * @param {Array<{secao:string,label:string,linhas:Array<{key:string,label:string}>}>} cfg.secoes
   *        - Lista de seções com suas linhas configuráveis.
   *        - secao = nome da chave no payload do PDF (ex.: 'inputs', 'outputs', 'lance')
   *        - label = nome amigável da seção
   *        - linhas = array de { key, label } - key é o que será removido
   * @param {string} cfg.botaoPdfId - id do botão de gerar PDF (pra colocar o ⚙️ do lado)
   */
  function registrar(cfg) {
    _config = cfg;
    if (!_isAllowed()) return;
    _renderBotao();
    // Defesa: se o usuário sair (currentUser zerado/trocado) o botão some.
    // Verifica a cada 3s — leve e à prova de simulações de teste/troca de sessão.
    setInterval(() => {
      const btn = document.getElementById('btnConfigPdfMP');
      if (!btn) return;
      btn.style.display = _isAllowed() ? '' : 'none';
    }, 3000);
  }

  /**
   * Recebe o payload que vai pro PdfMasterPrime.gerarComercial(...) e devolve
   * uma cópia com as linhas marcadas como ocultas REMOVIDAS.
   */
  function filtrar(payload) {
    if (!_isAllowed() || !_config) return payload;
    const hidden = new Set(_getHidden());
    if (hidden.size === 0) return payload;

    const out = JSON.parse(JSON.stringify(payload));

    _config.secoes.forEach(secao => {
      // 'lance' não é array — é objeto com keys (embutido, apagar, total)
      if (out[secao.secao] && Array.isArray(out[secao.secao])) {
        out[secao.secao] = out[secao.secao].filter((_item, idx) => {
          const linha = secao.linhas[idx];
          return !linha || !hidden.has(linha.key);
        });
      } else if (out[secao.secao] && typeof out[secao.secao] === 'object') {
        // objeto: deletar keys ocultas
        secao.linhas.forEach(linha => {
          if (hidden.has(linha.key) && (linha.objectKey in out[secao.secao])) {
            delete out[secao.secao][linha.objectKey];
          }
        });
      }
    });

    return out;
  }

  /* ──────────── UI ──────────── */

  function _renderBotao() {
    const btnPdf = document.getElementById(_config.botaoPdfId);
    if (!btnPdf) return;
    if (document.getElementById('btnConfigPdfMP')) return; // já existe

    const btn = document.createElement('button');
    btn.id = 'btnConfigPdfMP';
    btn.type = 'button';
    btn.className = 'secondary';
    btn.title = 'Configurar quais linhas aparecem no PDF';
    btn.textContent = '⚙️ Configurar PDF';
    btn.style.cssText = 'margin-right:8px;';
    btn.addEventListener('click', _abrirModal);
    btnPdf.parentNode.insertBefore(btn, btnPdf);
  }

  function _abrirModal() {
    // Re-verificação de segurança: só abre o modal se o usuário ainda é permitido
    if (!_isAllowed()) {
      const btn = document.getElementById('btnConfigPdfMP');
      if (btn) btn.style.display = 'none';
      return;
    }
    const hidden = new Set(_getHidden());

    const overlay = document.createElement('div');
    overlay.id = 'pdfConfigOverlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;' +
      'display:flex;align-items:center;justify-content:center;';

    const box = document.createElement('div');
    box.style.cssText =
      'background:#fff;border-radius:12px;padding:24px 28px;max-width:520px;width:92%;' +
      'max-height:80vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.25);' +
      'font-family:Inter,system-ui,sans-serif;';

    let html = '';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
    html += '  <h3 style="margin:0;font-size:18px;color:#1a2640;">Configurar PDF</h3>';
    html += '  <button type="button" id="pdfCfgClose" style="background:transparent;border:0;font-size:22px;cursor:pointer;color:#666;line-height:1;">&times;</button>';
    html += '</div>';
    html += '<p style="margin:0 0 16px;color:#666;font-size:13px;">Desmarque o que NÃO quer mostrar no PDF. Suas preferências ficam salvas neste navegador.</p>';

    _config.secoes.forEach(sec => {
      html += '<div style="margin-bottom:14px;padding:10px 12px;background:#f6f8fb;border-radius:8px;">';
      html += '  <div style="font-weight:600;color:#1a2640;font-size:13px;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em;">' + sec.label + '</div>';
      sec.linhas.forEach(linha => {
        const checked = !hidden.has(linha.key);
        html += '  <label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:14px;cursor:pointer;">';
        html += '    <input type="checkbox" data-key="' + linha.key + '"' + (checked ? ' checked' : '') + ' style="width:16px;height:16px;cursor:pointer;">';
        html += '    <span>' + linha.label + '</span>';
        html += '  </label>';
      });
      html += '</div>';
    });

    html += '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;">';
    html += '  <button type="button" id="pdfCfgResetar" style="padding:8px 14px;background:#fff;border:1px solid #d0d6e0;border-radius:6px;cursor:pointer;font-size:13px;color:#555;">Mostrar tudo</button>';
    html += '  <button type="button" id="pdfCfgSalvar" style="padding:8px 18px;background:#1a2640;color:#fff;border:0;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">Salvar</button>';
    html += '</div>';

    box.innerHTML = html;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) _fecharModal(); });
    document.getElementById('pdfCfgClose').addEventListener('click', _fecharModal);

    document.getElementById('pdfCfgResetar').addEventListener('click', () => {
      box.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; });
    });

    document.getElementById('pdfCfgSalvar').addEventListener('click', () => {
      const novosOcultos = [];
      box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (!cb.checked) novosOcultos.push(cb.dataset.key);
      });
      _setHidden(novosOcultos);
      _fecharModal();
      // toast simples
      const t = document.createElement('div');
      t.textContent = 'Preferências salvas';
      t.style.cssText =
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
        'background:#1a2640;color:#fff;padding:10px 18px;border-radius:6px;font-size:13px;' +
        'z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.25);';
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 1800);
    });
  }

  function _fecharModal() {
    const o = document.getElementById('pdfConfigOverlay');
    if (o) o.remove();
  }

  window.PdfConfigPersonalizado = { registrar, filtrar };
})();
