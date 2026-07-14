import { LoteriaFederalService } from '../../../infrastructure/LoteriaFederalService.js';
import { FiltrarCotasUseCase } from '../../../usecases/FiltrarCotasUseCase.js';
import { Cota } from '../../../domain/Cota.js';

class AnaliseCarteiraController {
  constructor() {
    this.cotas = [];
    this.chart = null;
    this.currentChartCenter = 0;
    
    // Bindings
    this.switchTab = this.switchTab.bind(this);
    this.aplicarFiltro = this.aplicarFiltro.bind(this);
    this.fetchLoteriaFederal = this.fetchLoteriaFederal.bind(this);
    this.loadData = this.loadData.bind(this);
    this.limparFiltro = this.limparFiltro.bind(this);
  }

  init() {
    this.setupListeners();
    this.initChart();
    this.loadData();
  }

  setupListeners() {
    document.getElementById('btn-aplicar-filtro')?.addEventListener('click', this.aplicarFiltro);
    document.getElementById('btn-refresh-loteria')?.addEventListener('click', this.fetchLoteriaFederal);
    
    document.querySelectorAll('.ac-tab').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.currentTarget.dataset.tab));
    });

    const inputs = ['f-cota', 'f-int-min', 'f-int-max', 'f-consultor', 'f-admin', 'f-busca'];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.aplicarFiltro(); });
    });
  }

  switchTab(tabId) {
    document.querySelectorAll('.ac-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.ac-tab[data-tab="${tabId}"]`).classList.add('active');

    document.querySelectorAll('.ac-tab-content').forEach(c => c.style.display = 'none');
    document.getElementById(`tab-${tabId}`).style.display = 'block';

    if (tabId === 'extracao') {
      this.fetchLoteriaFederal();
    }
  }

  openLanceGrupo(grupo, admName) {
    if (window.parent && window.parent.nav) {
      window.parent.nav('lances');
      const ifr = window.parent.document.getElementById('iframe-lances');
      if (ifr) {
        localStorage.setItem('lanceSearchGrupo', grupo);
        if (admName) localStorage.setItem('lanceSearchAdm', admName);
        try {
          if (ifr.contentWindow && typeof ifr.contentWindow.applyDirectSearch === 'function') {
            ifr.contentWindow.applyDirectSearch(grupo, admName);
          } else if (ifr.contentWindow) {
            ifr.contentWindow.postMessage({ type: 'SEARCH_GRUPO', grupo: grupo, adm: admName }, '*');
          }
        } catch (e) {
          console.error('Erro ao acessar iframe de lances', e);
        }
      }
    }
  }

  async loadPortalConfig() {
    const r = await fetch('./index.html?' + Date.now());
    const html = await r.text();
    const urlM = html.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
    const keyM = html.match(/SUPABASE_KEY\s*=\s*['"]([^'"]+)['"]/);
    if (!urlM || !keyM) throw new Error('Supabase config não encontrada');
    return { url: urlM[1], key: keyM[1] };
  }

  async loadData() {
    document.getElementById('file-info').style.display = 'flex';
    document.getElementById('file-name').textContent = 'Base de Vendas (Apropriado)';
    document.getElementById('file-count').textContent = 'Carregando...';

    try {
      let sb;
      // Tenta usar do pai, se falhar ou se for acesso direto cria próprio client
      if (window.parent && window.parent.sb) {
        console.log("Analise: Usando sb do parent");
        sb = window.parent.sb;
      } else {
        console.log("Analise: Criando sb proprio");
        if (!window.supabase) throw new Error("A biblioteca do Supabase não foi carregada.");
        const cfg = await this.loadPortalConfig();
        sb = window.supabase.createClient(cfg.url, cfg.key);
      }
      
      console.log("Analise: Buscando cache id=1...");
      const { data, error } = await sb.from('portal_vendas_cache').select('dados').eq('id', 1).maybeSingle();
      if (error) {
        console.error("Analise Supabase Error:", error);
        throw error;
      }
      if (!data) throw new Error("A base de vendas está vazia ou não foi sincronizada.");
      
      const rawRows = data?.dados || [];
      // ── Filtro por perfil (mesma regra do Dashboard de Vendas): vendedor/consultor
      //    só vê a própria carteira; admin/master/sócio/backoffice veem tudo. ──
      let __pUser = null;
      try { if (window.parent && window.parent !== window) __pUser = window.parent.portalCurrentUser || window.parent.currentUser || null; } catch(e) {}
      const __canSeeAll = u => u && ['admin','master','socio','backoffice'].includes(u.tipo);
      if (!__pUser) {
        // acesso direto (fora do portal): não exibe nada sem sessão
        throw new Error('Abra a Análise de Carteira pelo Portal Master Prime.');
      }
      const __rows = __canSeeAll(__pUser) ? rawRows : rawRows.filter(r => String(r.consultor||'').trim() === String(__pUser.nome||'').trim());

      console.log(`Analise: Recebeu ${__rows.length} linhas brutas (perfil: ${__pUser.tipo})`);
      const parsed = [];
      const consultores = new Set();
      const administradoras = new Set();

      __rows.forEach(row => {
        const isContemplado = String(row.sitRaw || '').trim().toUpperCase().startsWith('CONTEMPL') || 
                              String(row.status || '').trim().toUpperCase().startsWith('CONTEMPL');
        
        if (isContemplado) return; // ignora os contemplados

        const sit = String(row.sitRaw || row.status || '').trim().toUpperCase();
        if (sit !== 'APROPRIADO' && sit !== 'NORMAL') return;

        const cotaMatch = String(row.grupoCota || '').match(/\/(\d+)/);
        const grupoMatch = String(row.grupoCota || '').match(/^(\d+)/);
        const cotaNum = cotaMatch ? parseInt(cotaMatch[1], 10) : 0;
        const grupo = grupoMatch ? grupoMatch[1] : String(row.grupoCota || '');

        if (!cotaNum) return;

        const consultor = String(row.consultor || '').trim();
        const admin = String(row.adm || '').trim();
        if (consultor) consultores.add(consultor);
        if (admin) administradoras.add(admin);

        let credito = 0;
        if (typeof row.credito === 'number') credito = row.credito;
        else credito = parseFloat(String(row.credito || 0).replace(/[R$\s\.]/g, '').replace(',', '.')) || 0;

        parsed.push(new Cota({
          cota: cotaNum,
          nome: String(row.cliente || '').trim(),
          grupo: grupo.trim(),
          status: sit,
          consultor: consultor,
          admin: admin,
          credito: credito,
          originalRow: row
        }));
      });

      this.cotas = parsed;
      document.getElementById('file-count').textContent = `${parsed.length} clientes`;

      // Preenche Selects usando initMS
      const arrConsultores = Array.from(consultores).sort();
      window.initMS('wrapConsultor', arrConsultores, 'Todos', { onChange: () => this.aplicarFiltro() });

      const arrAdministradoras = Array.from(administradoras).sort();
      window.initMS('wrapAdmin', arrAdministradoras, 'Todas', { onChange: () => this.aplicarFiltro() });

      this.aplicarFiltro();
    } catch (error) {
      console.error(error);
      alert('Erro ao carregar lista de vendas: ' + error.message);
    }
  }

  limparFiltro() {
    const fCota = document.getElementById('f-cota');
    if (fCota) fCota.value = '0';
    
    const fIntMin = document.getElementById('f-int-min');
    if (fIntMin) fIntMin.value = '-20';
    
    const fIntMax = document.getElementById('f-int-max');
    if (fIntMax) fIntMax.value = '20';
    
    const fBusca = document.getElementById('f-busca');
    if (fBusca) fBusca.value = '';
    
    if (window.msState) {
      if (window.msState['wrapConsultor']) {
         window.msState['wrapConsultor'].selected = [];
         document.querySelectorAll('#wrapConsultor_list .ms-item:not(.all) input').forEach(cb => cb.checked = false);
         if (window.updateMSLabel) window.updateMSLabel('wrapConsultor');
      }
      if (window.msState['wrapAdmin']) {
         window.msState['wrapAdmin'].selected = [];
         document.querySelectorAll('#wrapAdmin_list .ms-item:not(.all) input').forEach(cb => cb.checked = false);
         if (window.updateMSLabel) window.updateMSLabel('wrapAdmin');
      }
    }
    
    this.sortCol = null;
    this.aplicarFiltro();
  }

  aplicarFiltro() {
    const filtros = {
      cotaSorteada: parseInt(document.getElementById('f-cota').value) || 0,
      intervaloMin: parseInt(document.getElementById('f-int-min').value) || 0,
      intervaloMax: parseInt(document.getElementById('f-int-max').value) || 0,
      consultor: window.getMSValues ? window.getMSValues('wrapConsultor').map(s => s.toLowerCase()) : [],
      admin: window.getMSValues ? window.getMSValues('wrapAdmin').map(s => s.toLowerCase()) : [],
      busca: document.getElementById('f-busca').value.toLowerCase(),
    };

    const { filtrados, stats, dist } = FiltrarCotasUseCase.execute(this.cotas, filtros);

    const uniqueAdms = new Set(filtrados.map(f => String(f.item.admin || '').trim().toLowerCase()).filter(Boolean));

    document.getElementById('stat-base').textContent = document.querySelectorAll('#table-body tr').length > 0 ? document.getElementById('stat-base').textContent : this.cotas.length; // base 
    document.getElementById('stat-intervalo').textContent = stats.dentroDoIntervalo;
    document.getElementById('stat-credito').textContent = `R$ ${stats.creditoNoIntervalo.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    document.getElementById('stat-menor').textContent = stats.menorProximidade;
    document.getElementById('stat-adms').textContent = uniqueAdms.size;

    // Sorteia os dados filtrados
    if (!this.sortCol) {
      this.sortCol = 'proximidade';
      this.sortDir = 1; // 1 = asc, -1 = desc
    }

    filtrados.sort((a, b) => {
      // Sempre destaque no topo quem foi sorteado exato (proximidade == 0)
      if (a.proximidade === 0 && b.proximidade !== 0) return -1;
      if (b.proximidade === 0 && a.proximidade !== 0) return 1;

      let valA, valB;
      switch (this.sortCol) {
        case 'nome': valA = a.item.nome; valB = b.item.nome; break;
        case 'grupo': valA = a.item.grupo; valB = b.item.grupo; break;
        case 'cota': valA = a.item.cota; valB = b.item.cota; break;
        case 'proximidade': valA = Math.abs(a.proximidade); valB = Math.abs(b.proximidade); break;
        case 'credito': valA = a.item.credito; valB = b.item.credito; break;
        case 'consultor': valA = a.item.consultor; valB = b.item.consultor; break;
        case 'admin': valA = a.item.admin; valB = b.item.admin; break;
        default: valA = Math.abs(a.proximidade); valB = Math.abs(b.proximidade);
      }
      if (valA < valB) return -1 * this.sortDir;
      if (valA > valB) return 1 * this.sortDir;
      return 0;
    });

    this.renderTable(filtrados);
    this.atualizarGrafico(dist, filtros.intervaloMin, filtros.intervaloMax);
  }

  sortBy(col) {
    if (this.sortCol === col) {
      this.sortDir *= -1;
    } else {
      this.sortCol = col;
      this.sortDir = 1;
    }
    this.aplicarFiltro();
  }

  renderTable(filtrados) {
    const tbody = document.getElementById('table-body');
    const tableSection = document.getElementById('table-section');
    
    if (filtrados.length === 0) {
      tableSection.style.display = 'none';
      tbody.innerHTML = '';
      return;
    }

    const ADMIN_BRAND_COLORS = {
      'ITAU':'#EC7000','ITAÚ':'#EC7000',
      'PORTO SEGURO':'#002D72','PORTO':'#002D72',
      'BRADESCO':'#CC092F',
      'SANTANDER':'#EC0000',
      'CAIXA':'#0070AE',
      'HS CONSORCIOS':'#7B2E7F','HS CONSÓRCIOS':'#7B2E7F',
      'YAMAHA':'#E60012',
      'ADEMICON':'#00A88E',
      'EMBRACON':'#F29100',
      'MAGALU':'#0086FF',
      'MAGAZINE LUIZA':'#0086FF'
    };
    
    const hexToTint = (hex, amount) => { 
      const h = hex.replace('#',''); 
      const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16); 
      const mix = c => Math.round(c + (255 - c) * amount); 
      return '#' + [mix(r),mix(g),mix(b)].map(n => n.toString(16).padStart(2,'0')).join(''); 
    };

    const admBadgeColor = (name) => {
      const k = (name||'').toString().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
      const brand = ADMIN_BRAND_COLORS[k];
      if (brand) return { bg: hexToTint(brand, 0.88), fg: brand };
      return { bg: '#F1F5F9', fg: '#64748B' };
    };

    tableSection.style.display = 'block';
    tbody.innerHTML = filtrados.map(({ item, proximidade }) => {
      const isWinner = proximidade === 0;
      const rowStyle = isWinner ? 'background-color: #F0FDF4; border-left: 4px solid #16A34A;' : '';
      const proxStyle = isWinner ? 'color: #16A34A; font-weight: 800; font-size: 15px;' : 'color: #64748B; font-weight: 600;';
      const nameStyle = isWinner ? 'color: #16A34A; font-weight: 800;' : 'font-weight: 700;';
      
      const adminName = item.admin || '-';
      const badgeColors = admBadgeColor(adminName);
      const adminHtml = adminName !== '-' 
        ? `<span style="background:${badgeColors.bg}; color:${badgeColors.fg}; padding:4px 8px; border-radius:6px; font-weight:700; font-size:11px; white-space:nowrap">${adminName.toUpperCase()}</span>`
        : '-';

      return `
        <tr style="${rowStyle}">
          <td style="${nameStyle}">${item.nome}${isWinner ? ' 🌟' : ''}</td>
          <td>${item.grupo ? `<a href="#" onclick="window.AnaliseCarteiraApp.openLanceGrupo('${item.grupo.split('/')[0].trim()}', '${item.admin}'); return false;" style="color:#0284C7; text-decoration:underline; font-weight:700;">${item.grupo.split('/')[0].trim()}</a>` : '-'}</td>
          <td>${item.cota}</td>
          <td style="${proxStyle}">${proximidade > 0 ? '+'+proximidade : proximidade}</td>
          <td style="font-weight:600">R$ ${item.credito.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
          <td>${item.consultor || '-'}</td>
          <td>${adminHtml}</td>
        </tr>
      `;
    }).join('');
  }

  initChart() {
    const ctx = document.getElementById('proximidadeChart')?.getContext('2d');
    if (!ctx) return;
    this.chart = new window.Chart(ctx, {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Clientes', data: [], backgroundColor: [], borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { title: (c) => 'Proximidade: ' + c[0].label, label: (c) => c.raw + ' clientes' }
        } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  atualizarGrafico(dist, min, max) {
    if (!this.chart) return;
    const labels = [];
    const data = [];
    const colors = [];
    
    const absMax = Math.max(Math.abs(min), Math.abs(max), 10); 
    const start = -absMax;
    const end = absMax;

    for (let i = start; i <= end; i++) {
      labels.push(i > 0 ? `+${i}` : String(i));
      data.push(dist[i] || 0);

      if (i >= min && i <= max) {
        colors.push(i === 0 ? '#16A34A' : '#3B82F6');
      } else {
        colors.push('#93C5FD');
      }
    }

    this.chart.data.labels = labels;
    this.chart.data.datasets[0].data = data;
    this.chart.data.datasets[0].backgroundColor = colors;
    this.chart.update();
  }

  async fetchLoteriaFederal() {
    const title = document.getElementById('lf-concurso');
    const dateStr = document.getElementById('lf-data');
    const prizesContainer = document.getElementById('lf-prizes');
    const searchDate = document.getElementById('lf-search-date')?.value;
    
    title.textContent = "Buscando resultado...";
    prizesContainer.innerHTML = '<div style="text-align:center;padding:40px;color:#94A3B8"><i data-lucide="loader" class="spinner-dark" style="animation: spin 1s linear infinite; display:inline-block"></i> Carregando...</div>';
    if(window.lucide) window.lucide.createIcons();

    try {
      let data;
      if (searchDate) {
        const [y, m, d] = searchDate.split('-');
        const formattedDate = `${d}/${m}/${y}`;
        data = await LoteriaFederalService.getResultByDate(formattedDate);
      } else {
        data = await LoteriaFederalService.getLatestResults();
      }

      title.textContent = `Concurso ${data.concurso}`;
      dateStr.textContent = `Sorteio realizado em ${data.data}`;
      const numeros = data.dezenas || data.listaDezenas || [];
      
      prizesContainer.innerHTML = numeros.length > 0 
        ? numeros.map((num, i) => `
          <div class="lottery-prize">
            <div class="lottery-prize-pos">${i+1}º</div>
            <div class="lottery-prize-ticket">${num}</div>
          </div>
        `).join('')
        : '<p>Nenhum prêmio processado.</p>';
    } catch (e) {
      title.textContent = "Erro ao buscar Loteria Federal";
      dateStr.textContent = searchDate ? "Verifique se houve sorteio na data informada." : "Tente novamente mais tarde.";
      prizesContainer.innerHTML = `<p style="color:var(--red); padding: 16px; text-align:center;">${e.message}</p>`;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.AnaliseCarteiraApp = new AnaliseCarteiraController();
  window.AnaliseCarteiraApp.init();
});
