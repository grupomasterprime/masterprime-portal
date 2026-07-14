export class Cota {
  constructor({ cota, nome, grupo, status, consultor, admin, credito, originalRow = {} }) {
    this.cota = Number(cota) || 0;
    this.nome = nome || 'N/I';
    this.grupo = grupo || '';
    this.status = status || '';
    this.consultor = consultor || '';
    this.admin = admin || '';
    this.credito = Number(credito) || 0;
    this.originalRow = originalRow;
  }

  getProximidade(cotaSorteada) {
    return this.cota - cotaSorteada;
  }

  isDentroDoIntervalo(cotaSorteada, min, max) {
    const proximidade = this.getProximidade(cotaSorteada);
    return proximidade >= min && proximidade <= max;
  }
}
