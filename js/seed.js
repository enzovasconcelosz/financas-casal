/* ==========================================================================
   seed.js — dados iniciais: categorias, dicas e indicadores
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var uid = FC.fmt.uid;

  /* ---------------------------- CATEGORIAS ---------------------------- */
  var CATEGORIAS = [
    { nome: 'Mercado',     cor: 'var(--c1)',  icone: 'cash' },
    { nome: 'Alimentação', cor: 'var(--c8)',  icone: 'cash' },
    { nome: 'Saúde',       cor: 'var(--c5)',  icone: 'heart' },
    { nome: 'Educação',    cor: 'var(--c2)',  icone: 'file' },
    { nome: 'Transporte',  cor: 'var(--c4)',  icone: 'trend' },
    { nome: 'Moradia',     cor: 'var(--c6)',  icone: 'bank' },
    { nome: 'Assinaturas', cor: 'var(--c3)',  icone: 'refresh' },
    { nome: 'Vestuário',   cor: 'var(--c10)', icone: 'tag' },
    { nome: 'Beleza',      cor: 'var(--c12)', icone: 'star' },
    { nome: 'Lazer',       cor: 'var(--c11)', icone: 'star' },
    { nome: 'Casamento',   cor: 'var(--c9)',  icone: 'heart' },
    { nome: 'Presentes',   cor: 'var(--c7)',  icone: 'tag' },
    { nome: 'Pets',        cor: 'var(--c6)',  icone: 'heart' },
    { nome: 'Viagem',      cor: 'var(--c2)',  icone: 'trend' },
    { nome: 'Impostos',    cor: 'var(--c5)',  icone: 'receipt' },
    { nome: 'Outros',      cor: 'var(--c9)',  icone: 'dots' }
  ];

  function categoriasPadrao() {
    return CATEGORIAS.map(function (c) {
      return { id: uid('cat'), nome: c.nome, cor: c.cor, icone: c.icone, arquivada: false };
    });
  }

  /* ---------------------------- CORES DAS ABAS ---------------------------- */
  var ACENTOS = [
    { id: 'esmeralda', nome: 'Esmeralda', cor: '#1ecb8b' },
    { id: 'violeta',   nome: 'Violeta',   cor: '#a78bfa' },
    { id: 'oceano',    nome: 'Oceano',    cor: '#38bdf8' },
    { id: 'coral',     nome: 'Coral',     cor: '#fb7185' },
    { id: 'ambar',     nome: 'Âmbar',     cor: '#f5b544' },
    { id: 'indigo',    nome: 'Índigo',    cor: '#818cf8' },
    { id: 'jade',      nome: 'Jade',      cor: '#2dd4bf' },
    { id: 'rosa',      nome: 'Rosa',      cor: '#f472b6' },
    { id: 'cobre',     nome: 'Cobre',     cor: '#e8875a' },
    { id: 'grafite',   nome: 'Grafite',   cor: '#94a3b8' }
  ];

  /* ---------------------------- TIPOS DE INVESTIMENTO ---------------------------- */
  var TIPOS_INVEST = [
    'Renda fixa', 'Tesouro Direto', 'CDB', 'LCI/LCA', 'Poupança',
    'Fundo', 'Ações', 'FIIs', 'ETF', 'Previdência', 'Cripto', 'Reserva de emergência', 'Outro'
  ];

  /* ---------------------------- INDICADORES ----------------------------
     Valores de referencia coletados em 20/09/2026. O app tenta atualizar
     sozinho (Banco Central e AwesomeAPI); se nao conseguir, mostra estes
     com a data de origem, sempre indicando a fonte.
     -------------------------------------------------------------------- */
  function indicadoresPadrao() {
    return {
      selic: { valor: 13.75, em: '2026-09-16', fonte: 'Copom/Banco Central' },
      dolar: { valor: 5.1427, em: '2026-09-19', fonte: 'AwesomeAPI' },
      cdi:   { valor: 13.65, em: '2026-09-16', fonte: 'aproximação: Selic − 0,10 p.p.' },
      poupanca: { valor: 6.17, em: '2026-09-16', fonte: 'regra: 0,5% a.m. + TR (Selic acima de 8,5%)' },
      atualizadoEm: null
    };
  }

  /* ---------------------------- EDUCAÇÃO FINANCEIRA ----------------------------
     Conteudo educativo e generico. Nao e recomendacao de investimento,
     nao indica produto, instituicao nem momento de compra ou venda.
     -------------------------------------------------------------------- */
  var DICAS = [
    { t: 'Orçamento', d: 'Anotar todo gasto por algumas semanas costuma revelar para onde o dinheiro realmente vai. O registro vem antes de qualquer meta.' },
    { t: 'Orçamento', d: 'Uma divisão bastante citada em educação financeira é separar a renda em três blocos: necessidades, desejos e poupança. Os percentuais variam conforme a realidade de cada família.' },
    { t: 'Reserva', d: 'Reserva de emergência é o dinheiro guardado para imprevistos — conserto, desemprego, saúde. O ponto principal é poder sacar rápido, sem perder valor.' },
    { t: 'Reserva', d: 'É comum ouvir que a reserva deve cobrir de 3 a 12 meses de despesas. Quem tem renda variável costuma precisar de uma reserva maior.' },
    { t: 'Dívidas', d: 'Juros do rotativo do cartão e do cheque especial estão entre os mais altos do mercado brasileiro. Sair deles costuma ser prioridade antes de qualquer outra meta.' },
    { t: 'Dívidas', d: 'Pagar o valor mínimo da fatura faz o restante entrar no rotativo, com juros. O saldo devedor pode crescer rápido.' },
    { t: 'Cartão', d: 'O parcelamento não diminui o valor da compra: ele só distribui o peso pelos meses seguintes. Somar as parcelas futuras ajuda a ver o compromisso real.' },
    { t: 'Cartão', d: 'Compras feitas depois da data de fechamento caem na fatura do mês seguinte. Saber o dia do fechamento evita surpresa.' },
    { t: 'Cartão', d: 'Ao emprestar o cartão, anote quem gastou e quanto. Sem esse controle, a fatura mistura o que é seu com o que é dos outros.' },
    { t: 'Casal', d: 'Casais costumam combinar como dividir as contas: meio a meio, proporcional à renda de cada um, ou uma conta conjunta para as despesas da casa. Não existe fórmula única.' },
    { t: 'Casal', d: 'Uma conversa curta sobre dinheiro uma vez por mês tende a evitar discussão grande depois. Olhar os números juntos ajuda mais do que cobrar.' },
    { t: 'Casal', d: 'Combinar um valor a partir do qual a compra é conversada antes ajuda a evitar atrito com gastos grandes.' },
    { t: 'Metas', d: 'Meta com prazo e valor definidos é mais fácil de acompanhar do que "guardar um dinheiro". Ex.: R$ 6.000 em 12 meses são R$ 500 por mês.' },
    { t: 'Metas', d: 'Separar o valor da meta logo que a renda entra, e não com o que sobra no fim do mês, costuma dar mais resultado.' },
    { t: 'Juros', d: 'Juros compostos rendem sobre o montante acumulado, não apenas sobre o valor inicial. É o mesmo mecanismo que faz a dívida crescer e a poupança render.' },
    { t: 'Juros', d: 'A Selic é a taxa básica de juros do país, definida pelo Copom a cada 45 dias. Ela serve de referência para boa parte das aplicações de renda fixa e para o custo do crédito.' },
    { t: 'Juros', d: 'O CDI é a taxa entre bancos e costuma andar próxima da Selic. Muita aplicação de renda fixa é apresentada como um percentual do CDI.' },
    { t: 'Inflação', d: 'Inflação corrói o poder de compra: o mesmo dinheiro compra menos com o tempo. Por isso se fala em rendimento "real", que é o ganho acima da inflação.' },
    { t: 'Impostos', d: 'Em várias aplicações de renda fixa há Imposto de Renda regressivo: quanto mais tempo o dinheiro fica aplicado, menor a alíquota. Vale conferir as regras do produto.' },
    { t: 'Segurança', d: 'O FGC é um mecanismo de proteção que cobre certos produtos e instituições até um limite por CPF. Vale confirmar se a aplicação está coberta.' },
    { t: 'Segurança', d: 'Promessa de ganho alto, rápido e garantido é um sinal de alerta clássico de golpe. Rendimento garantido e retorno alto raramente andam juntos.' },
    { t: 'Consumo', d: 'Esperar um ou dois dias antes de uma compra por impulso costuma reduzir o arrependimento — e o gasto.' },
    { t: 'Consumo', d: 'Assinaturas pequenas somam. Revisar a lista de mensalidades a cada poucos meses costuma revelar serviço esquecido.' },
    { t: 'Consumo', d: 'Custo por uso ajuda a decidir: um item de R$ 300 usado toda semana sai mais barato, no fim, que um de R$ 80 usado uma vez.' },
    { t: 'Renda', d: 'Aumento de renda sem ajuste de orçamento tende a virar aumento de gasto. Definir para onde vai o valor extra antes de recebê-lo ajuda.' },
    { t: 'Documentos', d: 'Guardar comprovantes e conferir a fatura linha a linha ajuda a achar cobrança indevida e assinatura esquecida.' }
  ];

  var AVISO_LEGAL = 'Conteúdo educativo e informativo. Não é recomendação de investimento, ' +
                    'nem indicação de produto ou instituição. Para decisões sobre o seu ' +
                    'dinheiro, procure um profissional certificado.';

  /* ---------------------------- COFRE NOVO ---------------------------- */
  function novoCofre(nomeA, nomeB, nomeCasal) {
    var cats = categoriasPadrao();
    var pA = { id: uid('p'), nome: nomeA || 'Pessoa 1', apelido: '', foto: null, acento: 'esmeralda', ordem: 0 };
    var pB = { id: uid('p'), nome: nomeB || 'Pessoa 2', apelido: '', foto: null, acento: 'violeta', ordem: 1 };

    return {
      versao: 1,
      casal: {
        nome: nomeCasal || 'Nosso dinheiro',
        pessoas: [pA, pB]
      },
      config: {
        tema: 'dark',
        acentoCasal: 'oceano',
        mostrarDicas: true,
        modoPlanilha: true,
        primeiroDia: 1,
        criptografado: false,
        travarAoFechar: true,
        avisoBackup: true
      },
      categorias: cats,
      cartoes: [
        { id: uid('card'), nome: 'Cartão principal', pessoaId: pA.id, fechamento: 25, vencimento: 5, cor: 'var(--c3)' }
      ],
      terceiros: [],
      contas: [
        { id: uid('acc'), nome: 'Conta ' + (nomeA || 'Pessoa 1'), pessoaId: pA.id, saldoInicial: 0, desde: FC.fmt.monthKey(new Date()) + '-01' },
        { id: uid('acc'), nome: 'Conta ' + (nomeB || 'Pessoa 2'), pessoaId: pB.id, saldoInicial: 0, desde: FC.fmt.monthKey(new Date()) + '-01' }
      ],
      lancamentos: [],
      recorrentes: [],
      investimentos: [],
      movimentos: [],
      educacao: {
        dicas: DICAS.slice(),
        indicadores: indicadoresPadrao(),
        avisoLegal: AVISO_LEGAL,
        dicaDoDia: 0
      },
      bot: { url: '', token: '', ultimaSync: null, ativo: false },
      caixa: [],
      meta: {
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
        ultimoBackup: null,
        mesInicial: FC.fmt.thisMonth()
      }
    };
  }

  FC.seed = {
    CATEGORIAS: CATEGORIAS,
    ACENTOS: ACENTOS,
    TIPOS_INVEST: TIPOS_INVEST,
    DICAS: DICAS,
    AVISO_LEGAL: AVISO_LEGAL,
    categoriasPadrao: categoriasPadrao,
    indicadoresPadrao: indicadoresPadrao,
    novoCofre: novoCofre
  };
})(typeof self !== 'undefined' ? self : this);
