// Base de Conhecimento Master Prime - conteúdo Comissões.
// Cronograma de pagamento, regras de estorno e recálculo por administradora.
// Para editar ou adicionar: alterar este arquivo e commitar.
window.KB_ADMIN = window.KB_ADMIN || {};
window.KB_ADMIN["comissoes"] = {
  "administradora": "comissoes",
  "nome": "Comissões",
  "atualizado": "2026-06",
  "nota": "Cronograma de pagamento de comissão, regras de estorno e recálculo por administradora. Em caso de divergência no demonstrativo, abra um chamado de comissão pelo Histórico — o canal oficial é o portal (não WhatsApp).",
  "entradas": [
    {
      "categoria_key": "visao_geral",
      "categoria_label": "Como sua comissão é paga",
      "categoria_ordem": 1,
      "titulo": "Em quantas vezes recebo minha comissão?",
      "conteudo": "Depende da administradora e do tipo de bem vendido. Resumo geral:\n\n• PORTO Pesados/Bike/BM: 6 parcelas variáveis (20%, 10%, 10%, 15%, 20%, 25%)\n• PORTO Automóvel: 6 parcelas iguais (atualizado 2026, era 4)\n• PORTO Imóvel padrão: à vista, 5x ou 12x — varia pela venda\n• PORTO Imóvel novas regras 2026: Opção 1 (adm antecipada, 5x) ou Opção 2 (adm diluída, 12 parcelas crescentes 7→12%)\n\n• ITAÚ Imóvel padrão: 6 parcelas iguais (atualizado 2026)\n• ITAÚ Imóvel com redutor: 13 parcelas iguais (~7,69% cada)\n• ITAÚ Automóvel padrão: 4 parcelas iguais\n• ITAÚ Automóvel grupo com 50% de redutor: 10 parcelas iguais\n\n• BRADESCO Automóvel: 6 parcelas iguais (16,67% cada)\n• BRADESCO Imóvel: 10 parcelas iguais (10% cada)\n\n• ADEMICON 50% Diluído: 14 parcelas em 3 etapas (1-10: 5,60%; 11-13: ~10,32%; pula 14; 15: 13,05%)\n\nVeja o PDF completo no fim desta seção para detalhes visuais e exemplos.",
      "tags": "cronograma, parcelas, pagamento, porto, itau, bradesco, ademicon, quantas vezes, prazo",
      "ordem": 1
    },
    {
      "categoria_key": "visao_geral",
      "categoria_label": "Como sua comissão é paga",
      "categoria_ordem": 1,
      "titulo": "Como funciona o cálculo do meu líquido?",
      "conteudo": "Toda comissão segue o mesmo fluxo:\n\n1. COMISSÃO BASE — % da venda × valor do crédito\n2. − NF 17,43% (retenção fiscal, obrigatória)\n3. − ADM Master 10% (sobre o líquido pós-NF)\n4. = LÍQUIDO que cai na sua conta\n\nFórmula resumida: Líquido = Base × 0,8257 × 0,90\n\nPra cada R$ 1.000 de comissão base você recebe R$ 743,13 líquido.\n\nEXCEÇÕES (não descontam ADM, só NF):\n• Fernando Sublime\n• João Portomax\n\nVendedores que emitem NF própria (LE — Edson, Erik Gonçalves) recebem como parceiros, fora do split do consultor principal.",
      "tags": "calculo, NF, ADM, liquido, formula, 17.43, 10%, fernando sublime, joao portomax, edson, erik",
      "ordem": 2
    },
    {
      "categoria_key": "porto",
      "categoria_label": "Porto Seguro",
      "categoria_ordem": 2,
      "titulo": "Cronograma Porto Auto / Pesados / Imóvel",
      "conteudo": "AUTOMÓVEL (atualizado 2026): pago em 6 parcelas iguais de 16,67% cada. Era 4 parcelas antes.\n\nPESADOS, BIKE E BENS MÓVEIS (BM): pago em 6 parcelas variáveis:\n• 1ª: 20%\n• 2ª: 10%\n• 3ª: 10%\n• 4ª: 15%\n• 5ª: 20%\n• 6ª: 25%\n\nIMÓVEL (regra padrão antiga):\n• À vista, A e B: 6 parcelas (20-10-10-15-20-25)\n• 5 vezes: 5 parcelas iguais (20% cada)\n• 12 vezes: 12 parcelas iguais (8,33% cada)\n\nIMÓVEL — NOVAS REGRAS 2026:\n• Opção 1 (taxa adm antecipada): parcelada em até 5x. Comissão SEM alteração — segue cronograma antigo acima.\n• Opção 2 (taxa adm diluída): comissão em 12 parcelas CRESCENTES (7%, 6%, 6%, 6%, 7%, 8%, 8%, 9%, 10%, 10%, 11%, 12%).\n• Imóvel em CAMPANHA: 87,5% diluído em 10 parcelas iguais (8,75% cada), 11ª NÃO paga, 12ª paga 12,5% restante.",
      "tags": "porto, auto, automovel, pesados, bike, BM, imovel, parcelas, cronograma, 6x, 12x, campanha",
      "ordem": 1
    },
    {
      "categoria_key": "porto",
      "categoria_label": "Porto Seguro",
      "categoria_ordem": 2,
      "titulo": "Porto tem estorno de comissão?",
      "conteudo": "NÃO. A Porto não estorna comissão por inadimplência do cliente. Uma vez paga, fica pago.\n\nMas atenção: se o crédito do plano for alterado depois (aumento ou redução), a comissão é recalculada proporcionalmente. Veja o card específico sobre recálculo.",
      "tags": "porto, estorno, inadimplencia, recalculo",
      "ordem": 2
    },
    {
      "categoria_key": "itau",
      "categoria_label": "Itaú",
      "categoria_ordem": 3,
      "titulo": "Cronograma Itaú Imóvel / Auto",
      "conteudo": "IMÓVEL — padrão (atualizado 2026): 6 parcelas iguais de 16,67% cada (era 5 parcelas antes).\n\nIMÓVEL — grupo com redutor: 13 parcelas iguais (~7,69% cada). Verifique no contrato se o grupo tem redutor.\n\nAUTOMÓVEL — padrão: 4 parcelas iguais (25% cada).\n\nAUTOMÓVEL — grupo com 50% de redutor: 10 parcelas iguais (10% cada).",
      "tags": "itau, imovel, automovel, parcelas, redutor, 6x, 13x, 10x",
      "ordem": 1
    },
    {
      "categoria_key": "itau",
      "categoria_label": "Itaú",
      "categoria_ordem": 3,
      "titulo": "Itaú tem estorno de comissão?",
      "conteudo": "SIM. Para NÃO haver estorno, o cliente precisa pagar TODAS as parcelas comissionáveis.\n\nEm caso de inadimplência (cliente para de pagar antes de fechar as comissionáveis), o estorno é de 80% da comissão.\n\nIsso significa que, se uma venda foi pra estorno, você devolve 80% do que recebeu naquela cota.",
      "tags": "itau, estorno, 80%, inadimplencia, comissoes, parcelas comissionaveis",
      "ordem": 2
    },
    {
      "categoria_key": "bradesco",
      "categoria_label": "Bradesco",
      "categoria_ordem": 4,
      "titulo": "Cronograma Bradesco Auto / Imóvel",
      "conteudo": "AUTOMÓVEL: pago em 6 parcelas iguais (100% diluído) — 16,67% cada parcela.\n\nIMÓVEL: pago em 10 parcelas iguais — 10% cada parcela.",
      "tags": "bradesco, auto, imovel, parcelas, 6x, 10x, diluido",
      "ordem": 1
    },
    {
      "categoria_key": "bradesco",
      "categoria_label": "Bradesco",
      "categoria_ordem": 4,
      "titulo": "Bradesco tem estorno de comissão?",
      "conteudo": "NÃO. A Bradesco não tem estorno de comissão.\n\nMas, igual a Porto, se o crédito do plano for alterado (aumento ou redução), a comissão é recalculada proporcionalmente.",
      "tags": "bradesco, estorno, recalculo",
      "ordem": 2
    },
    {
      "categoria_key": "ademicon",
      "categoria_label": "Ademicon",
      "categoria_ordem": 5,
      "titulo": "Cronograma Ademicon — Plano 50% Diluído",
      "conteudo": "A Ademicon paga a comissão em ETAPAS conforme o plano 50%-DILUIDO (10X+3X+0,3 15P*), regra de comissão 1027:\n\n• Parcelas 1 a 10 (10 parcelas iguais): 5,60% cada — soma 56,00%\n• Parcelas 11 e 12 (2 parcelas iguais): 10,32% cada — soma 20,64%\n• Parcela 13: 10,31%\n• Parcela 14: NÃO PAGA (pulada)\n• Parcela 15 (complementar): 13,05%\n\nTOTAL: 100% da comissão paga em 14 parcelas distribuídas em 15 meses.\n\nA Ademicon tem outros planos de venda com regras diferentes. Esse é o plano padrão atual.",
      "tags": "ademicon, parcelas, 14x, 50% diluido, plano 1027, etapas, cronograma",
      "ordem": 1
    },
    {
      "categoria_key": "ademicon",
      "categoria_label": "Ademicon",
      "categoria_ordem": 5,
      "titulo": "Ademicon tem estorno de comissão?",
      "conteudo": "NÃO. A Ademicon não tem estorno de comissão.\n\nIgual Porto e Bradesco, se o crédito do plano for alterado (aumento ou redução), a comissão é recalculada proporcionalmente.",
      "tags": "ademicon, estorno, recalculo",
      "ordem": 2
    },
    {
      "categoria_key": "regras_gerais",
      "categoria_label": "Regras gerais",
      "categoria_ordem": 6,
      "titulo": "Recálculo da comissão por alteração de crédito",
      "conteudo": "Em qualquer administradora, se o valor do crédito do plano for alterado depois da venda (aumento ou redução), a comissão é RECALCULADA PROPORCIONALMENTE.\n\nExemplos:\n• Cliente fechou uma cota de R$ 100.000 e depois pediu aumento pra R$ 150.000 → sua comissão aumenta proporcionalmente (50%).\n• Cliente fechou R$ 200.000 e pediu redução pra R$ 150.000 → sua comissão é reduzida proporcionalmente (25%).\n\nO recalculo é aplicado nas parcelas FUTURAS, não nas já pagas. Se já recebeu 2 de 6 parcelas e o crédito mudou na 3ª, da 3ª em diante vem o novo valor proporcional.",
      "tags": "recalculo, aumento, reducao, credito, proporcional, alteracao",
      "ordem": 1
    },
    {
      "categoria_key": "regras_gerais",
      "categoria_label": "Regras gerais",
      "categoria_ordem": 6,
      "titulo": "Minha comissão não bateu — o que faço?",
      "conteudo": "O canal oficial para divergências de comissão é o CHAMADO DE COMISSÃO dentro do portal:\n\n1. Vá em Histórico\n2. Clique em 'Abrir chamado de comissão'\n3. Descreva a divergência com clareza (qual venda, qual valor esperado, qual veio)\n4. Anexe print do demonstrativo se ajudar\n\nA gente responde dentro do portal, fica tudo registrado e você consegue consultar depois.\n\nEVITE WhatsApp — perde o histórico e atrapalha o atendimento.",
      "tags": "chamado, divergencia, comissao errada, nao bateu, suporte, whatsapp",
      "ordem": 2
    },
    {
      "categoria_key": "regras_gerais",
      "categoria_label": "Regras gerais",
      "categoria_ordem": 6,
      "titulo": "Quando o cliente desistiu — perco a comissão?",
      "conteudo": "Depende da administradora:\n\n• PORTO: NÃO. Não tem estorno. Se você já recebeu, fica.\n• BRADESCO: NÃO. Mesma regra da Porto.\n• ADEMICON: NÃO. Mesma regra.\n• ITAÚ: SIM, parcial. Se o cliente não pagar TODAS as parcelas comissionáveis, vai 80% da comissão pra estorno (você devolve 80% do que recebeu).\n\nEm qualquer caso, parcelas FUTURAS não pagas deixam de cair. O estorno é só para o que JÁ FOI PAGO.",
      "tags": "desistencia, cancelamento, estorno, porto, itau, bradesco, ademicon, 80%",
      "ordem": 3
    }
  ],
  "downloads": [
    {
      "titulo": "Cronograma de Comissionamento (PDF)",
      "descricao": "Guia visual completo: cronograma de pagamento por administradora (Porto, Itaú, Bradesco, Ademicon), Opção 1/2/Campanha do Porto Imóvel, regras de estorno e recálculo. 6 páginas.",
      "arquivo": "kb-cronograma-comissionamento.pdf"
    }
  ]
};
