#!/usr/bin/env python3
"""
Atualiza fundos-cartas.json com a rentabilidade dos fundos onde ficam as
cartas contempladas (Porto e Itaú), a partir do Informe Diário de Fundos da
CVM (dados.cvm.gov.br), fonte pública e oficial.

Roda sozinho no GitHub Actions (ver .github/workflows/fundos-cartas.yml):
baixa os zips mensais, pega a última cota de cada mês por CNPJ e calcula a
rentabilidade mensal (cota do fim do mês / cota do fim do mês anterior).

Bruto = variação da cota (o que CVM e ANBIMA mostram).
Líquido = bruto com IR de 22,5% sobre o ganho (resgate em até 180 dias, que
é o caso típico da carta contemplada até faturar o bem). Bate com a tabela
"Rendimento Líquido" que a Porto manda.
"""
import csv
import io
import json
import os
import sys
import urllib.request
import zipfile
from datetime import date, timedelta

BASE = "https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/"
SAIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fundos-cartas.json")
ALIQUOTA_IR = 0.225

FUNDOS = [
    {"apelido": "Fundo Porto", "nome": "Porto Seguro FIF Renda Fixa Referenciado DI (carta contemplada)",
     "cnpj": "18.716.322/0001-05", "tx_adm": 0.90},
    {"apelido": "Fundo Itaú", "nome": "Itaú PP Mega RF Curto Prazo FIC (carta contemplada)",
     "cnpj": "09.145.291/0001-80", "tx_adm": 1.75},
]
MESES_HISTORICO = 22  # quantos meses de histórico manter (precisa de 13+ pra 12m)


def baixar(ym):
    url = f"{BASE}inf_diario_fi_{ym}.zip"
    req = urllib.request.Request(url, headers={"User-Agent": "masterprime-portal/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def ultima_cota_por_cnpj(zip_bytes, cnpjs):
    """Devolve {cnpj: (data, cota)} com a última data do arquivo."""
    out = {}
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        nome = z.namelist()[0]
        with z.open(nome) as f:
            texto = io.TextIOWrapper(f, encoding="latin-1", newline="")
            leitor = csv.reader(texto, delimiter=";")
            cab = next(leitor)
            i_cnpj = cab.index("CNPJ_FUNDO_CLASSE") if "CNPJ_FUNDO_CLASSE" in cab else cab.index("CNPJ_FUNDO")
            i_dt, i_q = cab.index("DT_COMPTC"), cab.index("VL_QUOTA")
            alvo = set(cnpjs)
            for linha in leitor:
                if len(linha) <= i_q:
                    continue
                c = linha[i_cnpj]
                if c in alvo:
                    dt, q = linha[i_dt], linha[i_q]
                    if q and (c not in out or dt > out[c][0]):
                        out[c] = (dt, float(q))
    return out


def lista_meses(qtd):
    hoje = date.today()
    meses = []
    y, m = hoje.year, hoje.month
    for _ in range(qtd):
        meses.append(f"{y}{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(meses))


def main():
    cnpjs = [f["cnpj"] for f in FUNDOS]
    meses = lista_meses(MESES_HISTORICO + 1)  # +1 pra ter a base do primeiro mês
    ultimo = {}
    for ym in meses:
        try:
            ultimo[ym] = ultima_cota_por_cnpj(baixar(ym), cnpjs)
            print("ok", ym, {c: v[0] for c, v in ultimo[ym].items()})
        except Exception as e:  # mês ainda sem arquivo, etc.
            print("sem", ym, e)
            ultimo[ym] = {}

    hoje = date.today()
    mes_atual = f"{hoje.year}{hoje.month:02d}"
    fundos_out = []
    for f in FUNDOS:
        c = f["cnpj"]
        rent = {}
        for i in range(1, len(meses)):
            a, b = ultimo[meses[i - 1]].get(c), ultimo[meses[i]].get(c)
            if a and b:
                rent[meses[i]] = round((b[1] / a[1] - 1) * 100, 4)
        fechados = [ym for ym in sorted(rent) if ym < mes_atual]
        if not fechados:
            print("sem dados fechados pra", f["apelido"])
            continue
        ult = fechados[-1]

        def acum(lista):
            p = 1.0
            for ym in lista:
                p *= 1 + rent[ym] / 100
            return round((p - 1) * 100, 2)

        ult12 = fechados[-12:]
        ano = [ym for ym in fechados if ym[:4] == ult[:4]]
        ano_ant = [ym for ym in fechados if ym[:4] == str(int(ult[:4]) - 1)]
        liq = lambda v: round(v * (1 - ALIQUOTA_IR), 2) if v is not None else None
        parcial = None
        if mes_atual in rent and ultimo[mes_atual].get(c):
            parcial = {"mes": f"{mes_atual[:4]}-{mes_atual[4:]}", "rent": rent[mes_atual],
                       "rent_liq": liq(rent[mes_atual]), "ate": ultimo[mes_atual][c][0]}
        fundos_out.append({
            **f,
            "ultimo_mes": f"{ult[:4]}-{ult[4:]}",
            "rent_mes": rent[ult], "rent_mes_liq": liq(rent[ult]),
            "rent_12m": acum(ult12), "rent_12m_liq": liq(acum(ult12)),
            "janela_12m": f"{ult12[0][:4]}-{ult12[0][4:]} a {ult[:4]}-{ult[4:]}",
            "rent_ano": acum(ano), "rent_ano_liq": liq(acum(ano)),
            "rent_ano_anterior": acum(ano_ant) if ano_ant else None,
            "parcial": parcial,
            "mensal": {f"{ym[:4]}-{ym[4:]}": rent[ym] for ym in sorted(rent)},
        })

    saida = {
        "fonte": "CVM · Informe Diário de Fundos (dados.cvm.gov.br). Bruto = variação da cota; líquido = bruto com IR de 22,5% sobre o ganho (resgate em até 180 dias).",
        "aliquota_ir": ALIQUOTA_IR,
        "atualizado_em": hoje.isoformat(),
        "fundos": fundos_out,
    }
    with open(SAIDA, "w", encoding="utf-8") as fp:
        json.dump(saida, fp, ensure_ascii=False, indent=2)
    print("gravado", SAIDA)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERRO:", e)
        sys.exit(1)
