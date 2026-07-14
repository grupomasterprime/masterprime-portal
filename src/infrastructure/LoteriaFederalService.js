export class LoteriaFederalService {
  /**
   * Fetches the latest Loteria Federal results.
   */
  static _allResultsCache = null;

  static async getLatestResults() {
    try {
      const res = await fetch('https://loteriascaixa-api.herokuapp.com/api/federal/latest');
      if (!res.ok) throw new Error('Falha na API da Loteria Federal');
      return await res.json();
    } catch (e) {
      console.error('[LoteriaFederalService] Error:', e);
      throw e;
    }
  }

  static async getResultByDate(dateStr) {
    try {
      if (!this._allResultsCache) {
        const res = await fetch('https://loteriascaixa-api.herokuapp.com/api/federal');
        if (!res.ok) throw new Error('Falha ao buscar historico');
        this._allResultsCache = await res.json();
      }
      const found = this._allResultsCache.find(d => d.data === dateStr);
      if (!found) throw new Error('Nenhum sorteio encontrado nesta data');
      return found;
    } catch (e) {
      console.error('[LoteriaFederalService] Error:', e);
      throw e;
    }
  }
}
