export class FiltrarCotasUseCase {
  /**
   * Filtra um array de Cotas com base nos critérios estabelecidos
   */
  static execute(cotas, filtros) {
    const {
      cotaSorteada,
      intervaloMin,
      intervaloMax,
      status,
      consultor,
      admin,
      busca
    } = filtros;

    let dentroDoIntervalo = 0;
    let creditoNoIntervalo = 0;
    let menorProximidade = Infinity;
    const dist = {};
    const filtrados = [];

    for (const item of cotas) {
      if (status && !item.status.toLowerCase().includes(status)) continue;
      
      if (consultor && consultor.length > 0) {
        if (!consultor.includes(item.consultor.toLowerCase()) && !consultor.includes('')) continue;
      }
      
      if (admin && admin.length > 0) {
        if (!admin.includes(item.admin.toLowerCase()) && !admin.includes('')) continue;
      }

      if (busca) {
        const fullText = JSON.stringify(item.originalRow).toLowerCase();
        if (!fullText.includes(busca)) continue;
      }

      const proximidade = item.getProximidade(cotaSorteada);

      // Histograma do gráfico (+-100 itens)
      if (proximidade >= -100 && proximidade <= 100) {
        dist[proximidade] = (dist[proximidade] || 0) + 1;
      }

      if (item.isDentroDoIntervalo(cotaSorteada, intervaloMin, intervaloMax)) {
        dentroDoIntervalo++;
        creditoNoIntervalo += item.credito;
        if (Math.abs(proximidade) < Math.abs(menorProximidade)) {
          menorProximidade = proximidade;
        }
        
        filtrados.push({
          item,
          proximidade
        });
      }
    }

    return {
      filtrados,
      stats: {
        dentroDoIntervalo,
        creditoNoIntervalo,
        menorProximidade: menorProximidade === Infinity ? 0 : menorProximidade,
        totalFiltrados: filtrados.length // No original esse total era toda a base considerando os outros filtros sem o intervalo, mas ajustamos pro padrao.
      },
      dist
    };
  }
}
