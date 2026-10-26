/* ==========================================================================
   parser.js — interpreta mensagens de texto (WhatsApp) em lancamentos

   O MESMO arquivo roda no navegador (window.FC.parser) e no Node do bot
   (require('./parser.js')). Nao depende de DOM.

   Exemplos que entende:
     35,90 mercado
     gastei 89,90 na farmacia no credito
     enzo 150 combustivel debito
     giovana 460,00 terno casamento credito 4/4
     120 dentista credito @pai            -> gasto de terceiro no cartao
     recebi 4518,74 salario
     aporte 500 tesouro selic
     resgatei 200 do tesouro selic
     saldo
   ========================================================================== */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  var FC = (raiz.FC = raiz.FC || {});
  FC.parser = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim();
  }

  /* ------------------------------ dicionarios ------------------------------ */

  var PALAVRAS_GASTO = ['gasto', 'gastei', 'gastou', 'paguei', 'pagou', 'comprei', 'comprou',
                        'despesa', 'saiu', 'debitou', 'custou'];
  var PALAVRAS_RECEITA = ['recebi', 'recebeu', 'receita', 'entrou', 'entrada', 'salario',
                          'ganhei', 'ganhou', 'rendeu', 'deposito', 'depositei', 'pix recebido'];
  var PALAVRAS_APORTE = ['aporte', 'aportei', 'investi', 'investir', 'apliquei', 'aplicar',
                         'guardei', 'guardar', 'poupei'];
  var PALAVRAS_RESGATE = ['resgate', 'resgatei', 'resgatar', 'retirei', 'retirar', 'saquei',
                          'sacar', 'tirei do', 'tirar do'];
  var PALAVRAS_SALDO = ['saldo', 'resumo', 'situacao', 'quanto temos', 'quanto tem', 'extrato'];
  var PALAVRAS_AJUDA = ['ajuda', 'help', 'menu', 'comandos', 'como usar', '?'];

  var METODOS = [
    { id: 'credito', palavras: ['credito', 'cartao', 'cartao de credito', 'fatura', 'no cartao', 'parcelado', 'nubank credito'] },
    { id: 'debito',  palavras: ['debito', 'no debito', 'cartao de debito', 'conta'] },
    { id: 'pix',     palavras: ['pix', 'transferencia', 'ted', 'doc'] },
    { id: 'dinheiro',palavras: ['dinheiro', 'especie', 'cash', 'a vista', 'vista', 'papel'] }
  ];

  /* sinonimo -> nome da categoria padrao */
  var SINONIMOS = {
    mercado: 'Mercado', supermercado: 'Mercado', feira: 'Mercado', acougue: 'Mercado',
    padaria: 'Mercado', hortifruti: 'Mercado', compras: 'Mercado', 'pao': 'Mercado',

    almoco: 'Alimentação', janta: 'Alimentação', jantar: 'Alimentação', lanche: 'Alimentação',
    restaurante: 'Alimentação', ifood: 'Alimentação', delivery: 'Alimentação', pizza: 'Alimentação',
    cafe: 'Alimentação', coffee: 'Alimentação', sorvete: 'Alimentação', churros: 'Alimentação',
    cookie: 'Alimentação', doce: 'Alimentação', hamburguer: 'Alimentação', bar: 'Alimentação',

    farmacia: 'Saúde', remedio: 'Saúde', medico: 'Saúde', dentista: 'Saúde', exame: 'Saúde',
    consulta: 'Saúde', 'plano de saude': 'Saúde', psicologo: 'Saúde', academia: 'Saúde',
    totalpass: 'Saúde', gympass: 'Saúde', vacina: 'Saúde', oculos: 'Saúde',

    faculdade: 'Educação', curso: 'Educação', livro: 'Educação', mensalidade: 'Educação',
    escola: 'Educação', apostila: 'Educação', unifil: 'Educação', material: 'Educação',

    combustivel: 'Transporte', gasolina: 'Transporte', etanol: 'Transporte', alcool: 'Transporte',
    diesel: 'Transporte', uber: 'Transporte', taxi: 'Transporte', onibus: 'Transporte',
    estacionamento: 'Transporte', pedagio: 'Transporte', mecanico: 'Transporte', oficina: 'Transporte',
    pneu: 'Transporte', revisao: 'Transporte', ipva: 'Transporte', licenciamento: 'Transporte',
    'seguro auto': 'Transporte', pastilha: 'Transporte', oleo: 'Transporte',

    aluguel: 'Moradia', condominio: 'Moradia', luz: 'Moradia', energia: 'Moradia',
    agua: 'Moradia', gas: 'Moradia', internet: 'Moradia', iptu: 'Moradia', faxina: 'Moradia',
    reforma: 'Moradia', movel: 'Moradia', moveis: 'Moradia', ferramenta: 'Moradia',
    limpeza: 'Moradia', utensilio: 'Moradia', sabonete: 'Moradia', 'led': 'Moradia',

    cinema: 'Lazer', show: 'Lazer', jogo: 'Lazer', game: 'Lazer', passeio: 'Lazer',
    netflix: 'Assinaturas', spotify: 'Assinaturas', disney: 'Assinaturas', prime: 'Assinaturas',
    assinatura: 'Assinaturas', celular: 'Assinaturas', claro: 'Assinaturas', vivo: 'Assinaturas',
    tim: 'Assinaturas', oi: 'Assinaturas', telefone: 'Assinaturas', nuvem: 'Assinaturas',

    roupa: 'Vestuário', tenis: 'Vestuário', sapato: 'Vestuário', calca: 'Vestuário',
    camisa: 'Vestuário', vestido: 'Vestuário', terno: 'Vestuário', bolsa: 'Vestuário',
    shein: 'Vestuário', shopee: 'Vestuário', papete: 'Vestuário', brinco: 'Vestuário',

    cabelo: 'Beleza', salao: 'Beleza', barbearia: 'Beleza', barba: 'Beleza', unha: 'Beleza',
    manicure: 'Beleza', maquiagem: 'Beleza', perfume: 'Beleza', cosmetico: 'Beleza',

    presente: 'Presentes', aniversario: 'Presentes', lembrancinha: 'Presentes',
    casamento: 'Casamento', noivado: 'Casamento', buffet: 'Casamento', convite: 'Casamento',
    'cha de casa nova': 'Casamento', 'cha de panela': 'Casamento',

    pet: 'Pets', racao: 'Pets', veterinario: 'Pets', petshop: 'Pets',
    viagem: 'Viagem', hotel: 'Viagem', passagem: 'Viagem', airbnb: 'Viagem',
    imposto: 'Impostos', taxa: 'Impostos', cartorio: 'Impostos', multa: 'Impostos',
    certidao: 'Impostos', sedex: 'Outros', correio: 'Outros',

    /* vocabulário que aparece nas planilhas do casal */
    agili: 'Alimentação', snack: 'Alimentação', burguer: 'Alimentação', burger: 'Alimentação',
    marmita: 'Alimentação', acai: 'Alimentação', poke: 'Alimentação', kfc: 'Alimentação',
    donuts: 'Alimentação', pastel: 'Alimentação', espetinho: 'Alimentação', milkshake: 'Alimentação',
    churrasco: 'Alimentação', chopp: 'Alimentação', cerveja: 'Alimentação', energetico: 'Alimentação',
    bolo: 'Alimentação', chocolate: 'Alimentação', padoca: 'Alimentação',

    muffato: 'Mercado', carrefour: 'Mercado', feirinha: 'Mercado',

    carro: 'Transporte', fiesta: 'Transporte', logan: 'Transporte', corsa: 'Transporte',
    borracheiro: 'Transporte', lavagem: 'Transporte', radiador: 'Transporte',
    'zona azul': 'Transporte', 'troca de oleo': 'Transporte',

    whey: 'Saúde', creatina: 'Saúde', hipercalorico: 'Saúde', otorrino: 'Saúde',
    oftalmo: 'Saúde', oftalmologista: 'Saúde', pneumologista: 'Saúde', ultrasom: 'Saúde',
    fisio: 'Saúde', quiropraxia: 'Saúde', hospital: 'Saúde', unimed: 'Saúde', colirio: 'Saúde',
    sisos: 'Saúde', 'raio-x': 'Saúde',

    camiseta: 'Vestuário', cueca: 'Vestuário', meia: 'Vestuário', shorts: 'Vestuário',
    bermuda: 'Vestuário', jaqueta: 'Vestuário', alfaiate: 'Vestuário', costureira: 'Vestuário',
    renner: 'Vestuário',

    barbeiro: 'Beleza', sobrancelha: 'Beleza', desodorante: 'Beleza', barbeador: 'Beleza',
    'oleo de cabelo': 'Beleza',

    alianca: 'Casamento', fotografo: 'Casamento', decoracao: 'Casamento', acessora: 'Casamento',
    assessora: 'Casamento', cerimonia: 'Casamento', padrinhos: 'Casamento', dj: 'Casamento',
    'pre wedding': 'Casamento', 'story maker': 'Casamento', 'lua de mel': 'Casamento',

    ingresso: 'Lazer', expo: 'Lazer', campeonato: 'Lazer', festa: 'Lazer', steam: 'Lazer',

    canva: 'Assinaturas', claude: 'Assinaturas', gamepass: 'Assinaturas',

    disciplina: 'Educação', rematricula: 'Educação', tcc: 'Educação',

    faqueiro: 'Moradia', caneca: 'Moradia', xicara: 'Moradia', cesto: 'Moradia', pilha: 'Moradia',

    mimo: 'Presentes', flores: 'Presentes', buque: 'Presentes', pascoa: 'Presentes',
    maceio: 'Viagem', 'agua de coco': 'Alimentação',

    /* marcas e lugares frequentes nas planilhas */
    'taco bell': 'Alimentação', franui: 'Alimentação', cupuacu: 'Alimentação', bisteca: 'Alimentação',
    refri: 'Alimentação', docinho: 'Alimentação', 'lava rapido': 'Transporte',
    lentes: 'Saúde', melissa: 'Vestuário', karsten: 'Moradia', toalha: 'Moradia',
    wepink: 'Beleza', 'fita clareadora': 'Beleza', monograma: 'Casamento', 'making off': 'Casamento',
    'area 43': 'Lazer', 'lista 43': 'Lazer', 'aluguel de terno': 'Vestuário'
  };

  /* categorias que dizem PARA QUE foi o gasto; vencem as que dizem O QUE foi
     comprado. "vestido casamento" é Casamento, não Vestuário. */
  var CONTEXTO = ['Presentes', 'Casamento', 'Viagem', 'Pets', 'Educação'];

  /* palavras vagas: só decidem a categoria se nada mais na frase decidir.
     "compras na farmacia" é Saúde; "celular giovana 4/12" é um aparelho. */
  var FRACAS = { compras: 1, celular: 1, material: 1 };

  var DIAS_REL = { hoje: 0, ontem: -1, anteontem: -2 };

  /* ------------------------------ auxiliares ------------------------------ */

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function isoDe(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function hojeISO() { return isoDe(new Date()); }

  function contem(txt, lista) {
    for (var i = 0; i < lista.length; i++) {
      var p = lista[i];
      var re = new RegExp('(^|[^a-z0-9])' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)');
      if (re.test(txt)) return p;
    }
    return null;
  }

  function parseValor(s) {
    if (!s) return null;
    var t = String(s).replace(/r\$/gi, '').replace(/\s/g, '');
    var temV = t.indexOf(',') >= 0, temP = t.indexOf('.') >= 0;
    if (temV && temP) t = t.replace(/\./g, '').replace(',', '.');
    else if (temV) t = t.replace(',', '.');
    else if (temP) {
      var ps = t.split('.');
      if (ps.length > 2 || ps[ps.length - 1].length === 3) t = t.replace(/\./g, '');
    }
    var v = parseFloat(t);
    return isFinite(v) ? Math.round(v * 100) / 100 : null;
  }

  /* ------------------------------ interpretador ------------------------------ */

  /**
   * @param {string} texto  mensagem crua
   * @param {object} [ctx]  { pessoas:[{id,nome,apelido}], categorias:[{id,nome}],
   *                          terceiros:[{id,nome}], investimentos:[{id,nome}],
   *                          hoje:'2026-09-20' }
   */
  function interpretar(texto, ctx) {
    ctx = ctx || {};
    var original = String(texto || '').trim();
    var r = {
      ok: false, tipo: 'desconhecido', original: original,
      valor: null, descricao: '', dataISO: ctx.hoje || hojeISO(),
      metodo: null, pessoaTexto: null, pessoaId: null,
      categoriaTexto: null, categoriaId: null,
      terceiroTexto: null, terceiroId: null,
      investimentoTexto: null, investimentoId: null,
      parcela: null, avisos: []
    };
    if (!original) { r.erro = 'Mensagem vazia.'; return r; }

    var t = norm(original);
    var resto = t;

    /* comandos sem valor */
    if (contem(t, PALAVRAS_AJUDA) || t === '?') { r.ok = true; r.tipo = 'ajuda'; return r; }
    if (contem(t, PALAVRAS_SALDO)) { r.ok = true; r.tipo = 'saldo'; return r; }

    /* --- terceiro marcado com @ --- */
    var mArroba = original.match(/@([\p{L}][\p{L}\s]{0,24})/u);
    if (mArroba) {
      r.terceiroTexto = mArroba[1].trim();
      resto = norm(original.replace(mArroba[0], ' '));
    }

    /* --- parcela 3/6 ou "3 de 6" --- */
    var mParc = resto.match(/(^|\s)(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})(\s|$)/);
    if (mParc) {
      var pn = +mParc[2], pof = +mParc[3];
      if (pn >= 1 && pof >= 1 && pn <= pof && pof <= 99) {
        r.parcela = { n: pn, de: pof };
        resto = resto.replace(mParc[0], ' ');
      }
    }

    /* --- data --- */
    var mData = resto.match(/(^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(\s|$)/);
    if (mData) {
      var dd = +mData[2], mm = +mData[3];
      var base = new Date(r.dataISO.slice(0, 4), 0, 1);
      var aa = mData[4] ? (+mData[4] < 100 ? 2000 + +mData[4] : +mData[4]) : base.getFullYear();
      if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
        r.dataISO = aa + '-' + pad(mm) + '-' + pad(dd);
        resto = resto.replace(mData[0], ' ');
      }
    } else {
      for (var rel in DIAS_REL) {
        if (contem(resto, [rel])) {
          var d = new Date(r.dataISO.split('-')[0], +r.dataISO.split('-')[1] - 1, +r.dataISO.split('-')[2]);
          d.setDate(d.getDate() + DIAS_REL[rel]);
          r.dataISO = isoDe(d);
          resto = resto.replace(new RegExp(rel, 'g'), ' ');
          break;
        }
      }
      var mDia = resto.match(/(^|\s)dia\s+(\d{1,2})(\s|$)/);
      if (mDia && +mDia[2] >= 1 && +mDia[2] <= 31) {
        r.dataISO = r.dataISO.slice(0, 8) + pad(+mDia[2]);
        resto = resto.replace(mDia[0], ' ');
      }
    }

    /* --- tipo de operacao --- */
    var kw;
    if ((kw = contem(resto, PALAVRAS_APORTE))) { r.tipo = 'aporte'; resto = resto.replace(kw, ' '); }
    else if ((kw = contem(resto, PALAVRAS_RESGATE))) { r.tipo = 'resgate'; resto = resto.replace(kw, ' '); }
    else if ((kw = contem(resto, PALAVRAS_RECEITA))) { r.tipo = 'receita'; resto = resto.replace(kw, ' '); }
    else if ((kw = contem(resto, PALAVRAS_GASTO))) { r.tipo = 'gasto'; resto = resto.replace(kw, ' '); }
    else r.tipo = 'gasto';

    /* --- valor --- */
    var mVal = resto.match(/(^|\s)(r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(\s*(reais|conto|pila))?(\s|$)/);
    if (mVal) {
      r.valor = parseValor(mVal[3]);
      resto = resto.replace(mVal[0], ' ');
    }
    if (r.valor == null || r.valor <= 0) {
      r.erro = 'Não achei o valor. Escreva algo como "35,90 mercado".';
      return r;
    }

    /* --- forma de pagamento --- */
    for (var i = 0; i < METODOS.length; i++) {
      var achou = contem(resto, METODOS[i].palavras);
      if (achou) {
        r.metodo = METODOS[i].id;
        resto = resto.replace(achou, ' ');
        break;
      }
    }

    /* --- pessoa (por nome/apelido cadastrado) --- */
    var pessoas = ctx.pessoas || [];
    for (var p = 0; p < pessoas.length; p++) {
      var nomes = [pessoas[p].nome, pessoas[p].apelido].filter(Boolean);
      var primeiro = norm(pessoas[p].nome).split(' ')[0];
      if (primeiro) nomes.push(primeiro);
      for (var n = 0; n < nomes.length; n++) {
        var alvo = norm(nomes[n]);
        if (alvo && contem(resto, [alvo])) {
          r.pessoaId = pessoas[p].id;
          r.pessoaTexto = pessoas[p].nome;
          resto = resto.replace(new RegExp(alvo, 'g'), ' ');
          break;
        }
      }
      if (r.pessoaId) break;
    }

    /* --- investimento (para aporte/resgate) --- */
    if (r.tipo === 'aporte' || r.tipo === 'resgate') {
      var achado = casarInvestimento(resto, ctx.investimentos || []);
      if (achado) {
        r.investimentoId = achado.inv.id;
        r.investimentoTexto = achado.inv.nome;
        achado.palavras.forEach(function (w) {
          resto = resto.replace(new RegExp('(^|\\s)' + w + '(\\s|$)', 'g'), ' ');
        });
      }
      resto = resto.replace(/(^|\s)(no|na|do|da|em|pro|para)(\s|$)/g, ' ');
      if (!r.investimentoTexto) {
        var sobra = limpar(resto);
        if (sobra) r.investimentoTexto = sobra;
      }
      r.descricao = r.investimentoTexto || (r.tipo === 'aporte' ? 'Aporte' : 'Resgate');
      r.ok = true;
      return r;
    }

    /* --- terceiro por nome cadastrado (sem @) --- */
    if (!r.terceiroTexto && ctx.terceiros) {
      for (var w = 0; w < ctx.terceiros.length; w++) {
        var alvoT = norm(ctx.terceiros[w].nome);
        if (alvoT && alvoT.length >= 3 && contem(resto, [alvoT])) {
          r.terceiroId = ctx.terceiros[w].id;
          r.terceiroTexto = ctx.terceiros[w].nome;
          resto = resto.replace(new RegExp(alvoT, 'g'), ' ');
          break;
        }
      }
    } else if (r.terceiroTexto && ctx.terceiros) {
      var alvoA = norm(r.terceiroTexto);
      for (var y = 0; y < ctx.terceiros.length; y++) {
        if (norm(ctx.terceiros[y].nome) === alvoA) { r.terceiroId = ctx.terceiros[y].id; break; }
      }
    }

    /* --- categoria: primeiro as cadastradas, depois os sinonimos --- */
    var cats = ctx.categorias || [];
    for (var c = 0; c < cats.length; c++) {
      var alvoC = norm(cats[c].nome);
      if (alvoC && alvoC.length >= 3 && resto.indexOf(alvoC) >= 0) {
        r.categoriaId = cats[c].id;
        r.categoriaTexto = cats[c].nome;
        break;
      }
    }
    if (!r.categoriaTexto) {
      /* junta todos os sinonimos da frase; se houver uma categoria de
         contexto ("terno casamento"), ela vence a do tipo de item */
      var achadas = [], vagas = [];
      /* expressões compostas primeiro: "oleo de cabelo" é mais específico que "oleo" */
      for (var chave in SINONIMOS) {
        if (chave.indexOf(' ') > 0 && resto.indexOf(chave) >= 0) achadas.push(SINONIMOS[chave]);
      }
      resto.split(/[\s(),+\/]+/).filter(Boolean).forEach(function (w) {
        /* plural simples: "lanches", "aliancas", "pneus" */
        var base = SINONIMOS[w] ? w
          : (w.length > 3 && w.charAt(w.length - 1) === 's' && SINONIMOS[w.slice(0, -1)] ? w.slice(0, -1) : null);
        if (base) (FRACAS[base] ? vagas : achadas).push(SINONIMOS[base]);
      });
      achadas = achadas.concat(vagas);
      for (var pc = 0; pc < CONTEXTO.length && !r.categoriaTexto; pc++) {
        if (achadas.indexOf(CONTEXTO[pc]) >= 0) r.categoriaTexto = CONTEXTO[pc];
      }
      if (!r.categoriaTexto && achadas.length) r.categoriaTexto = achadas[0];
      if (r.categoriaTexto && cats.length) {
        for (var k = 0; k < cats.length; k++) {
          if (norm(cats[k].nome) === norm(r.categoriaTexto)) { r.categoriaId = cats[k].id; break; }
        }
      }
    }

    /* --- descricao: o que sobrou --- */
    r.descricao = limpar(resto) || r.categoriaTexto || (r.tipo === 'receita' ? 'Entrada' : 'Gasto');
    r.descricao = r.descricao.charAt(0).toUpperCase() + r.descricao.slice(1);

    if (!r.metodo && r.tipo === 'gasto') {
      r.metodo = 'debito';
      r.avisos.push('Sem forma de pagamento na mensagem — usei débito.');
    }
    if (!r.pessoaId && pessoas.length) {
      r.avisos.push('Sem nome na mensagem — confirme de quem é o gasto.');
    }

    r.ok = true;
    return r;
  }

  /**
   * Casa o investimento citado na mensagem com um cadastrado, mesmo escrito
   * pela metade: "tesouro selic" acha "Tesouro Selic 2029".
   * Devolve { inv, palavras } ou null.
   */
  function casarInvestimento(texto, invs) {
    var melhor = null;
    var melhorNota = 0;

    for (var i = 0; i < invs.length; i++) {
      var nome = norm(invs[i].nome);
      if (!nome) continue;

      /* nome inteiro dentro da mensagem: casa na hora */
      if (texto.indexOf(nome) >= 0) {
        return { inv: invs[i], palavras: nome.split(/\s+/).filter(Boolean) };
      }

      var palavras = nome.split(/\s+/).filter(function (w) { return w.length >= 3; });
      if (!palavras.length) continue;

      var casadas = palavras.filter(function (w) {
        return new RegExp('(^|\\s)' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(texto);
      });
      var nota = casadas.length / palavras.length;

      /* precisa de pelo menos uma palavra e metade do nome */
      if (casadas.length && nota >= 0.5 && nota > melhorNota) {
        melhorNota = nota;
        melhor = { inv: invs[i], palavras: casadas };
      }
    }
    return melhor;
  }

  function limpar(s) {
    return String(s || '')
      .replace(/(^|\s)(no|na|do|da|de|em|com|por|pra|para|o|a|os|as|um|uma|e)(\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Interpreta varias linhas de uma vez (uma por lancamento) */
  function interpretarLista(texto, ctx) {
    return String(texto || '')
      .split(/[\n;]+/)
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 1; })
      .map(function (l) { return interpretar(l, ctx); });
  }

  var NOME_METODO = { credito: 'crédito', debito: 'débito', pix: 'Pix', dinheiro: 'dinheiro' };

  /** R$ 8.518,74 — com ponto de milhar, igual ao resto do app */
  var fmtBRL = null;
  function brl(v) {
    var n = Number(v) || 0;
    try {
      if (!fmtBRL) fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
      /* o Intl usa espaço não separável depois do R$; troca por espaço comum
         para não virar caractere estranho em alguns celulares */
      return fmtBRL.format(n).replace(/ /g, ' ');
    } catch (e) {
      var partes = Math.abs(n).toFixed(2).split('.');
      partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      return (n < 0 ? '-' : '') + 'R$ ' + partes.join(',');
    }
  }

  /** Mensagem de confirmacao que o bot devolve no WhatsApp */
  function confirmacao(r) {
    if (!r.ok) return '⚠️ ' + (r.erro || 'Não entendi.') + '\n\nMande "ajuda" para ver os exemplos.';
    if (r.tipo === 'ajuda') return ajuda();
    if (r.tipo === 'saldo') return null;

    var v = brl(r.valor);
    var linhas = [];

    if (r.tipo === 'aporte') linhas.push('📈 Aporte de ' + v + (r.investimentoTexto ? ' em ' + r.investimentoTexto : ''));
    else if (r.tipo === 'resgate') linhas.push('📉 Resgate de ' + v + (r.investimentoTexto ? ' de ' + r.investimentoTexto : ''));
    else if (r.tipo === 'receita') linhas.push('💚 Entrada de ' + v + ' — ' + r.descricao);
    else linhas.push('✅ Gasto de ' + v + ' — ' + r.descricao);

    var det = [];
    if (r.pessoaTexto) det.push('👤 ' + r.pessoaTexto);
    if (r.metodo) det.push('💳 ' + (NOME_METODO[r.metodo] || r.metodo));
    if (r.categoriaTexto) det.push('🏷️ ' + r.categoriaTexto);
    if (r.terceiroTexto) det.push('🤝 para ' + r.terceiroTexto);
    if (r.parcela) det.push('🧾 parcela ' + r.parcela.n + '/' + r.parcela.de);
    if (det.length) linhas.push(det.join('  ·  '));

    var dataTxt = r.dataISO.split('-').reverse().join('/');
    linhas.push('📅 ' + dataTxt);
    if (r.avisos && r.avisos.length) linhas.push('\n⚠️ ' + r.avisos.join(' '));
    linhas.push('\nFica na caixa de entrada até você abrir o site.');
    return linhas.join('\n');
  }

  function ajuda() {
    return [
      '💡 *Como anotar pelo WhatsApp*',
      '',
      'Gasto simples:',
      '  `35,90 mercado`',
      '  `gastei 89,90 na farmacia no credito`',
      '',
      'Dizendo de quem é:',
      '  `enzo 150 combustivel debito`',
      '  `giovana 210 unha credito`',
      '',
      'Parcelado:',
      '  `461,24 terno casamento credito 4/4`',
      '',
      'Cartão emprestado para alguém:',
      '  `39,90 notebook credito @pai`',
      '',
      'Entrada de dinheiro:',
      '  `recebi 4518,74 salario`',
      '',
      'Investimento:',
      '  `aporte 500 tesouro selic`',
      '  `resgatei 200 do tesouro selic`',
      '',
      'Outras datas: `ontem`, `dia 15`, `15/09`',
      '',
      'Escreva `saldo` para o resumo.'
    ].join('\n');
  }

  return {
    interpretar: interpretar,
    interpretarLista: interpretarLista,
    confirmacao: confirmacao,
    ajuda: ajuda,
    norm: norm,
    brl: brl,
    parseValor: parseValor,
    SINONIMOS: SINONIMOS,
    NOME_METODO: NOME_METODO
  };
});
