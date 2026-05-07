/* ════════════════════════════════════════════════════════════════════════
 * pdf-master-prime.js — Módulo compartilhado para geração de PDF
 * dos simuladores Master Prime (estilo Conkey, layout adaptativo).
 *
 * Uso típico em cada simulador:
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
 *   <script src="pdf-master-prime.js"></script>
 *
 *   PdfMasterPrime.gerar({
 *     tituloEstrategia: 'Operação Simples',
 *     filename: 'master-prime-op-simples',
 *     blocos: [
 *       { tipo: 'card', titulo: 'DADOS DA COTA', linhas: [...] },
 *       { tipo: 'card', titulo: 'DETALHES DA CONTEMPLAÇÃO', linhas: [...] },
 *       { tipo: 'tabela', titulo: 'COMPARATIVO APÓS CONTEMPLAÇÃO', ... }
 *     ]
 *   });
 *
 * Modos suportados:
 *   - PdfMasterPrime.gerar(opt)    → gera e baixa o PDF
 *   - PdfMasterPrime.preview(opt)  → renderiza inline na página (validação visual)
 * ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const PDF_WIDTH = 1300;
  const NAVY = '#2D3F5E';
  const NAVY_DARK = '#1E2D45';
  const CARD_BG = '#F4F5F7';
  const TEXT_MUTED = '#6B7280';
  const BORDER = '#E5E7EB';

  // ─── Disclaimer padrão ───
  const DISCLAIMER_PADRAO = [
    'Os resultados apresentados nesta simulação possuem caráter meramente informativo e indicativo, sendo elaborados com base em informações fornecidas pelo usuário, as quais podem ser estimadas, hipotéticas ou não refletir condições reais de mercado, não constituindo promessa, garantia ou obrigação de resultado, tampouco vinculando a administradora ou quaisquer terceiros.',
    'A efetiva contratação do consórcio está condicionada à disponibilidade de vagas nos respectivos grupos, à análise e aprovação da administradora, bem como ao integral atendimento dos requisitos, regras e condições estabelecidos no contrato de adesão e na regulamentação aplicável.',
    'O usuário declara estar ciente de que o contrato de adesão, o regulamento do consórcio e os demais documentos aplicáveis constituem os instrumentos que regem a relação contratual, recomendando-se sua leitura integral, sendo o aceite manifestação inequívoca de ciência e concordância com todos os seus termos.'
  ];

  // ─── Logo SVG inline (versão branca pro header navy) ───
  // Reproduz o logo Master Prime real: círculo segmentado em 4 quadrantes coloridos
  // com pequenos gaps entre eles (amarelo, ciano, lilás, azul-periwinkle), letra M
  // sólida em branco no centro. As cores dos quadrantes mantêm a identidade visual.
  const LOGO_SVG = `
    <svg width="62" height="62" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;">
      <!-- Quadrante amarelo (top-left) -->
      <path d="M 4.10 27.73 A 26 26 0 0 1 27.73 4.10" fill="none" stroke="#F4C24A" stroke-width="3.6" stroke-linecap="round"/>
      <!-- Quadrante ciano (top-right) -->
      <path d="M 32.27 4.10 A 26 26 0 0 1 55.90 27.73" fill="none" stroke="#7DD3D8" stroke-width="3.6" stroke-linecap="round"/>
      <!-- Quadrante lilás (bottom-right) -->
      <path d="M 55.90 32.27 A 26 26 0 0 1 32.27 55.90" fill="none" stroke="#C8B5DC" stroke-width="3.6" stroke-linecap="round"/>
      <!-- Quadrante azul-periwinkle (bottom-left) -->
      <path d="M 27.73 55.90 A 26 26 0 0 1 4.10 32.27" fill="none" stroke="#7B96D4" stroke-width="3.6" stroke-linecap="round"/>
      <!-- Letra M sólida em branco (sans-serif bold) -->
      <text x="30" y="41" font-family="'Arial Black','Helvetica Neue',Helvetica,sans-serif" font-size="28" font-weight="900" text-anchor="middle" fill="#ffffff">M</text>
    </svg>`;

  // ─── HEADER ───
  function renderHeader(tituloEstrategia) {
    return `
      <div style="background:${NAVY}; color:#fff; padding:28px 50px; display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:18px;">
          ${LOGO_SVG}
          <div>
            <div style="font-size:26px; font-weight:700; letter-spacing:0.3px; color:#ffffff; line-height:1.1;">Master Prime</div>
            <div style="font-size:11px; letter-spacing:1px; color:rgba(255,255,255,0.78); margin-top:4px;">Corretora de Consórcios e Seguros</div>
          </div>
        </div>
        <div style="font-size:18px; font-weight:600;">Estratégia Simulada: ${tituloEstrategia || ''}</div>
      </div>`;
  }

  // ─── FOOTER ───
  function renderFooter() {
    const hoje = new Date();
    const dd = String(hoje.getDate()).padStart(2, '0');
    const mm = String(hoje.getMonth() + 1).padStart(2, '0');
    const yyyy = hoje.getFullYear();
    return `
      <div style="background:${NAVY}; color:#fff; padding:22px 50px; display:flex; justify-content:space-between; align-items:center; font-size:15px;">
        <div style="font-weight:600;">Master Prime · Simulador de Consórcio</div>
        <div style="text-align:right; line-height:1.5;">Documento gerado em ${dd}/${mm}/${yyyy}<br>Página 1/1</div>
      </div>`;
  }

  // ─── BLOCO TIPO "CARD" ───
  // {
  //   tipo: 'card',
  //   titulo: 'DADOS DA COTA',
  //   linhas: [
  //     { campos: [{label, value}, ...], destaque: {label, value, multi: [{label, value}]} },
  //     { campos: [{label, value}, ...] }    // linha 2 (sem destaque)
  //   ]
  // }
  function renderCard(bloco) {
    const linhasHtml = (bloco.linhas || []).map((linha, idxLinha) => {
      const campos = (linha.campos || []).filter(c => c && c.value !== undefined && c.value !== null && c.value !== '');
      if (campos.length === 0 && !linha.destaque) return '';

      // Quantas colunas?
      let nCols = campos.length;
      const hasDestaque = !!linha.destaque;

      // Linha 1 normalmente tem destaque (parcela inicial / crédito disponível) à direita
      const cellsHtml = campos.map(c => `
        <div>
          <div style="font-size:13px; color:${TEXT_MUTED}; margin-bottom:6px;">${c.label}</div>
          <div style="font-size:18px; font-weight:600;">${c.value}</div>
        </div>`).join('');

      let destaqueHtml = '';
      if (hasDestaque) {
        const d = linha.destaque;
        if (d.multi && Array.isArray(d.multi)) {
          // multiplas badges (ex: "3 parcelas" + "Demais parcelas")
          destaqueHtml = `
            <div style="text-align:right;">
              <div style="display:flex; gap:14px; align-items:flex-end; justify-content:flex-end;">
                ${d.multi.map(m => `
                  <div>
                    <div style="font-size:13px; color:${TEXT_MUTED}; margin-bottom:6px;">${m.label}</div>
                    <div style="background:${NAVY}; color:#fff; font-weight:700; font-size:18px; padding:10px 18px; border-radius:7px; display:inline-block;">${m.value}</div>
                  </div>`).join('')}
              </div>
            </div>`;
        } else {
          destaqueHtml = `
            <div style="text-align:right;">
              <div style="font-size:13px; color:${TEXT_MUTED}; margin-bottom:6px;">${d.label}</div>
              <div style="background:${NAVY}; color:#fff; font-weight:700; font-size:18px; padding:10px 18px; border-radius:7px; display:inline-block;">${d.value}</div>
            </div>`;
        }
      }

      const gridCols = hasDestaque
        ? `repeat(${Math.max(nCols, 1)},1fr) auto`
        : `repeat(${Math.max(nCols, 1)},1fr)`;
      const marginTop = idxLinha === 0 ? '' : 'margin-top:18px;';

      return `
        <div style="display:grid; grid-template-columns:${gridCols}; gap:32px; align-items:center; ${marginTop}">
          ${cellsHtml}
          ${destaqueHtml}
        </div>`;
    }).filter(Boolean).join('');

    return `
      <div style="font-size:14px; font-weight:700; letter-spacing:2.5px; color:${NAVY}; margin:28px 0 16px;">${bloco.titulo}</div>
      <div style="background:${CARD_BG}; border-radius:12px; padding:24px 30px;">
        ${linhasHtml}
      </div>`;
  }

  // ─── BLOCO TIPO "TABELA COMPARATIVA" ───
  // {
  //   tipo: 'tabela',
  //   titulo: 'COMPARATIVO APÓS CONTEMPLAÇÃO',
  //   colunas: ['REDUÇÃO DE PARCELA', 'REDUÇÃO DE PRAZO'],
  //   separador: 'OU',  // opcional, default 'OU'
  //   linhas: [
  //     { label: 'Parcela', valores: ['R$ 1.591,92', 'R$ 2.400,00'] },
  //     { label: 'Prazo restante', valores: ['99 meses', '66 meses'] },
  //     { label: 'CET (Custo Efetivo Total)', valores: ['0,29% ao mês | 3,54% ao ano', '0,43% ao mês | 5,28% ao ano'] }
  //   ]
  // }
  function renderTabela(bloco) {
    const sep = bloco.separador !== undefined ? bloco.separador : 'OU';
    const nCols = (bloco.colunas || []).length;

    const headerColunas = (bloco.colunas || []).map((c, i) => {
      const radius = i === 0 ? '0' : (i === nCols - 1 ? '0 12px 0 0' : '0');
      return `<th style="text-align:center; padding:18px 22px; font-size:13px; font-weight:700; letter-spacing:2px; color:${NAVY}; background:${CARD_BG}; border-radius:${radius};">${c}</th>`;
    }).join(sep ? `<th style="width:60px; background:${CARD_BG};"></th>` : '');

    const linhasHtml = (bloco.linhas || []).map((linha, iL) => {
      const isLast = iL === bloco.linhas.length - 1;
      const borderBottom = isLast ? 'none' : `1px solid ${BORDER}`;
      const cellLabel = `<td style="padding:16px 22px; color:${TEXT_MUTED}; font-size:16px; border-bottom:${borderBottom};">${linha.label}</td>`;
      const cellsValores = (linha.valores || []).map((v, iV) => {
        let html = `<td style="padding:16px 22px; text-align:center; font-weight:700; font-size:18px; border-bottom:${borderBottom};">${v}</td>`;
        // separador "OU" no meio (rowspan na primeira linha)
        if (sep && iV === 0 && (bloco.valores || bloco.linhas).length > 1 && nCols === 2 && iL === 0) {
          html += `<td rowspan="${bloco.linhas.length}" style="text-align:center; color:${TEXT_MUTED}; font-weight:600; font-size:14px;">${sep}</td>`;
        }
        return html;
      }).join('');
      return `<tr>${cellLabel}${cellsValores}</tr>`;
    }).join('');

    return `
      <table style="width:100%; border-collapse:separate; border-spacing:0; margin-top:32px;">
        <thead>
          <tr>
            <th style="text-align:left; padding:18px 22px; font-size:13px; font-weight:700; letter-spacing:2px; color:${NAVY}; background:${CARD_BG}; border-radius:12px 0 0 0;">${bloco.titulo}</th>
            ${headerColunas}
          </tr>
        </thead>
        <tbody>${linhasHtml}</tbody>
      </table>`;
  }

  // ─── BLOCO TIPO "TEXTO" (livre, ex: observações) ───
  function renderTexto(bloco) {
    return `
      ${bloco.titulo ? `<div style="font-size:14px; font-weight:700; letter-spacing:2.5px; color:${NAVY}; margin:28px 0 16px;">${bloco.titulo}</div>` : ''}
      <div style="font-size:15px; color:#1F2937; line-height:1.55;">${bloco.html || bloco.texto || ''}</div>`;
  }

  // ─── DISCLAIMER ───
  function renderDisclaimer(linhas) {
    const paragrafos = (linhas || DISCLAIMER_PADRAO);
    return `
      <div style="margin-top:36px; font-size:13px; color:${TEXT_MUTED}; line-height:1.65; text-align:justify;">
        ${paragrafos.map(p => `<p style="margin:0 0 12px;">${p}</p>`).join('')}
      </div>`;
  }

  // ─── BUILD TEMPLATE COMPLETO ───
  function buildTemplate(opts) {
    const blocosHtml = (opts.blocos || []).map(b => {
      if (b.tipo === 'card') return renderCard(b);
      if (b.tipo === 'tabela') return renderTabela(b);
      if (b.tipo === 'texto') return renderTexto(b);
      return '';
    }).join('');

    return `
      <div style="width:1300px; background:#fff; font-family:'Inter',-apple-system,system-ui,sans-serif; color:#1F2937; font-size:18px; line-height:1.5;">
        ${renderHeader(opts.tituloEstrategia)}
        <div style="padding:42px 50px;">
          ${blocosHtml}
          ${renderDisclaimer(opts.disclaimer)}
        </div>
        ${renderFooter()}
      </div>`;
  }

  // ─── GERA O PDF (html2canvas + jsPDF, escala pra A4) ───
  async function gerar(opts) {
    if (typeof html2canvas !== 'function') throw new Error('html2canvas não está carregado');
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF não está carregado');

    // Cria container off-screen mas dentro da viewport (z-index baixíssimo)
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:fixed; top:0; left:0; width:${PDF_WIDTH}px; background:#fff; z-index:-99999; pointer-events:none; overflow:hidden;`;
    wrap.innerHTML = buildTemplate(opts);
    document.body.appendChild(wrap);

    try {
      // Aguarda layout + carregamento de imagens (logo SVG é inline, mas dá uma folga)
      await new Promise(r => setTimeout(r, 350));

      const target = wrap.firstElementChild;
      const canvas = await html2canvas(target, {
        scale: 2,
        backgroundColor: '#FFFFFF',
        width: PDF_WIDTH,
        windowWidth: PDF_WIDTH,
        useCORS: true,
        allowTaint: true,
        logging: false
      });

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      const pageW = 210, pageH = 297;
      const fitW = pageW;
      const fitH = (canvas.height * fitW) / canvas.width;
      const imgData = canvas.toDataURL('image/jpeg', 0.96);

      if (fitH <= pageH) {
        pdf.addImage(imgData, 'JPEG', 0, 0, fitW, fitH);
      } else {
        // Conteúdo maior que A4 — escala pra caber em 1 página inteira
        const fitH2 = pageH;
        const fitW2 = (canvas.width * fitH2) / canvas.height;
        const offsetX = (pageW - fitW2) / 2;
        pdf.addImage(imgData, 'JPEG', offsetX, 0, fitW2, fitH2);
      }

      const hoje = new Date();
      const dd = String(hoje.getDate()).padStart(2, '0');
      const mm = String(hoje.getMonth() + 1).padStart(2, '0');
      const yyyy = hoje.getFullYear();
      const filename = (opts.filename || 'master-prime-simulacao') + `-${dd}${mm}${yyyy}.pdf`;
      pdf.save(filename);
    } finally {
      wrap.remove();
    }
  }

  // ─── PREVIEW INLINE (para validar visualmente sem baixar) ───
  function preview(opts) {
    // Esconde o conteúdo normal da página (header + main do simulador)
    document.querySelectorAll('header, main').forEach(el => el.style.display = 'none');

    const wrap = document.createElement('div');
    wrap.style.cssText = 'min-height:100vh; background:#E5E7EB; padding:40px 0; display:flex; flex-direction:column; align-items:center; gap:24px; font-family:Inter,sans-serif;';
    wrap.innerHTML = `
      <div style="text-align:center;">
        <div style="color:${NAVY_DARK}; font-size:14px; letter-spacing:1.5px; text-transform:uppercase; font-weight:700;">Pré-visualização do PDF — Master Prime · ${opts.tituloEstrategia}</div>
        <div style="color:${TEXT_MUTED}; font-size:12px; margin-top:4px;">Cenário demo · escala 1:1 (1300px)</div>
      </div>
      <div style="box-shadow:0 12px 40px rgba(0,0,0,0.12); border-radius:6px; overflow:hidden;">
        ${buildTemplate(opts)}
      </div>`;
    document.body.appendChild(wrap);
  }

  // ─── EXPORT PUBLIC API ───
  window.PdfMasterPrime = { gerar, preview, buildTemplate, _internals: { DISCLAIMER_PADRAO, NAVY, CARD_BG } };
})();
