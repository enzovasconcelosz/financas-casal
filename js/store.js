/* ==========================================================================
   store.js — contas de acesso, cofre de dados e persistencia no localStorage

   Chaves usadas:
     fc:contas        lista de acessos (email + hash da senha)
     fc:cofre:<id>    dados de cada acesso (texto ou pacote criptografado)
     fc:ultima        ultimo acesso usado (so para pre-preencher o email)
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var fmt = FC.fmt, cripto = FC.cripto;

  var K_CONTAS = 'fc:contas';
  var K_COFRE = 'fc:cofre:';
  var K_ULTIMA = 'fc:ultima';
  var K_SESSAO = 'fc:sessao';

  var estado = null;      // cofre aberto
  var contaAtual = null;  // {id, email, nome}
  var senhaMem = null;    // so em memoria, para cofre criptografado
  var ouvintes = [];
  var timerSalvar = null;
  var pilhaDesfazer = [];

  /* ---------------------------- localStorage seguro ---------------------------- */

  function lsGet(k) {
    try { return root.localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { root.localStorage.setItem(k, v); return true; }
    catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        FC.store._erroQuota = true;
      }
      return false;
    }
  }
  function lsDel(k) {
    try { root.localStorage.removeItem(k); } catch (e) {}
  }
  function ssGet(k) {
    try { return root.sessionStorage.getItem(k); } catch (e) { return null; }
  }
  function ssSet(k, v) {
    try { root.sessionStorage.setItem(k, v); } catch (e) {}
  }
  function ssDel(k) {
    try { root.sessionStorage.removeItem(k); } catch (e) {}
  }

  function disponivel() {
    try {
      var t = '__fc_test__';
      root.localStorage.setItem(t, '1');
      root.localStorage.removeItem(t);
      return true;
    } catch (e) { return false; }
  }

  /* ---------------------------- contas ---------------------------- */

  function listarContas() {
    try { return JSON.parse(lsGet(K_CONTAS) || '[]'); } catch (e) { return []; }
  }

  function gravarContas(lista) {
    lsSet(K_CONTAS, JSON.stringify(lista));
  }

  function acharConta(email) {
    var alvo = fmt.norm(email);
    var lista = listarContas();
    for (var i = 0; i < lista.length; i++) {
      if (fmt.norm(lista[i].email) === alvo) return lista[i];
    }
    return null;
  }

  function ultimoEmail() { return lsGet(K_ULTIMA) || ''; }

  /**
   * Cria um acesso novo com o cofre inicial.
   * @returns Promise<{id,email}>
   */
  function criarConta(dados) {
    var email = String(dados.email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return Promise.reject(new Error('E-mail inválido.'));
    }
    if (String(dados.senha || '').length < 6) {
      return Promise.reject(new Error('A senha precisa de pelo menos 6 caracteres.'));
    }
    if (acharConta(email)) {
      return Promise.reject(new Error('Já existe um acesso com esse e-mail neste navegador.'));
    }

    return cripto.criarSenha(dados.senha).then(function (reg) {
      var conta = {
        id: fmt.uid('acc'),
        email: email,
        nome: dados.nomeCasal || 'Nosso dinheiro',
        senha: reg,
        criadoEm: new Date().toISOString()
      };
      var cofre = FC.seed.novoCofre(dados.nomeA, dados.nomeB, dados.nomeCasal);

      var lista = listarContas();
      lista.push(conta);
      gravarContas(lista);
      lsSet(K_COFRE + conta.id, JSON.stringify(cofre));
      lsSet(K_ULTIMA, email);

      contaAtual = { id: conta.id, email: conta.email, nome: conta.nome };
      estado = cofre;
      senhaMem = dados.senha;
      ssSet(K_SESSAO, conta.id);
      notificar();
      return contaAtual;
    });
  }

  /** Abre um acesso existente. @returns Promise<conta> */
  function entrar(email, senha) {
    var conta = acharConta(email);
    if (!conta) return Promise.reject(new Error('Não encontrei esse e-mail neste navegador.'));

    return cripto.conferirSenha(senha, conta.senha).then(function (ok) {
      if (!ok) throw new Error('Senha incorreta.');
      return carregarCofre(conta, senha);
    });
  }

  function carregarCofre(conta, senha) {
    var bruto = lsGet(K_COFRE + conta.id);
    if (!bruto) {
      estado = FC.seed.novoCofre();
      finalizarEntrada(conta, senha);
      return Promise.resolve(contaAtual);
    }

    var dados;
    try { dados = JSON.parse(bruto); }
    catch (e) { return Promise.reject(new Error('Os dados guardados estão corrompidos.')); }

    if (dados && dados.enc === 1) {
      return cripto.decifrar(dados, senha, conta.senha.salt).then(function (cofre) {
        estado = migrar(cofre);
        finalizarEntrada(conta, senha);
        return contaAtual;
      }).catch(function () {
        throw new Error('Não consegui abrir os dados criptografados.');
      });
    }

    estado = migrar(dados);
    finalizarEntrada(conta, senha);
    return Promise.resolve(contaAtual);
  }

  function finalizarEntrada(conta, senha) {
    contaAtual = { id: conta.id, email: conta.email, nome: conta.nome };
    senhaMem = senha;
    lsSet(K_ULTIMA, conta.email);
    ssSet(K_SESSAO, conta.id);
    notificar();
  }

  /** Reabre a sessao da aba (evita pedir senha a cada F5) — so se nao criptografado */
  function retomarSessao() {
    var id = ssGet(K_SESSAO);
    if (!id) return false;
    var lista = listarContas();
    var conta = null;
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) conta = lista[i];
    if (!conta) return false;

    var bruto = lsGet(K_COFRE + conta.id);
    if (!bruto) return false;
    var dados;
    try { dados = JSON.parse(bruto); } catch (e) { return false; }
    if (dados && dados.enc === 1) return false; // precisa da senha

    estado = migrar(dados);
    contaAtual = { id: conta.id, email: conta.email, nome: conta.nome };
    return true;
  }

  function sair() {
    salvarAgora();
    estado = null;
    contaAtual = null;
    senhaMem = null;
    ssDel(K_SESSAO);
    notificar();
  }

  function trocarSenha(atual, nova) {
    if (!contaAtual) return Promise.reject(new Error('Ninguém conectado.'));
    var lista = listarContas();
    var conta = null, idx = -1;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === contaAtual.id) { conta = lista[i]; idx = i; }
    }
    if (!conta) return Promise.reject(new Error('Acesso não encontrado.'));
    if (String(nova || '').length < 6) return Promise.reject(new Error('A nova senha precisa de 6 caracteres ou mais.'));

    return cripto.conferirSenha(atual, conta.senha).then(function (ok) {
      if (!ok) throw new Error('A senha atual não confere.');
      return cripto.criarSenha(nova);
    }).then(function (reg) {
      lista[idx].senha = reg;
      gravarContas(lista);
      senhaMem = nova;
      salvarAgora();  // regrava o cofre (importante se estiver criptografado)
      return true;
    });
  }

  function apagarConta(id) {
    var lista = listarContas().filter(function (c) { return c.id !== id; });
    gravarContas(lista);
    lsDel(K_COFRE + id);
    if (contaAtual && contaAtual.id === id) sair();
  }

  /* ---------------------------- migracao de versao ---------------------------- */

  function migrar(cofre) {
    if (!cofre || typeof cofre !== 'object') return FC.seed.novoCofre();
    var base = FC.seed.novoCofre();

    // garante que todo campo novo exista, sem apagar o que ja havia
    ['casal', 'config', 'educacao', 'bot', 'meta'].forEach(function (k) {
      cofre[k] = Object.assign({}, base[k], cofre[k] || {});
    });
    ['categorias', 'cartoes', 'terceiros', 'contas', 'lancamentos',
     'investimentos', 'movimentos', 'caixa', 'recorrentes'].forEach(function (k) {
      if (!Array.isArray(cofre[k])) cofre[k] = base[k] || [];
    });
    if (!cofre.casal.pessoas || cofre.casal.pessoas.length < 2) {
      cofre.casal.pessoas = base.casal.pessoas;
    }
    if (!cofre.educacao.dicas || !cofre.educacao.dicas.length) {
      cofre.educacao.dicas = FC.seed.DICAS.slice();
    }
    cofre.educacao.indicadores = Object.assign(
      FC.seed.indicadoresPadrao(), cofre.educacao.indicadores || {}
    );
    cofre.educacao.avisoLegal = FC.seed.AVISO_LEGAL;
    cofre.versao = 1;
    return cofre;
  }

  /* ---------------------------- persistencia ---------------------------- */

  function serializar() {
    return JSON.stringify(estado);
  }

  function salvarAgora() {
    if (!estado || !contaAtual) return Promise.resolve(false);
    estado.meta.atualizadoEm = new Date().toISOString();

    if (estado.config.criptografado && cripto.temSubtle() && senhaMem) {
      var conta = null, lista = listarContas();
      for (var i = 0; i < lista.length; i++) if (lista[i].id === contaAtual.id) conta = lista[i];
      if (!conta) return Promise.resolve(false);
      return cripto.cifrar(estado, senhaMem, conta.senha.salt).then(function (pac) {
        pac.enc = 1;
        var ok = lsSet(K_COFRE + contaAtual.id, JSON.stringify(pac));
        if (!ok) avisarQuota();
        return ok;
      });
    }

    var ok2 = lsSet(K_COFRE + contaAtual.id, serializar());
    if (!ok2) avisarQuota();
    return Promise.resolve(ok2);
  }

  function avisarQuota() {
    if (FC.ui && FC.ui.toast) {
      FC.ui.toast('Espaço do navegador cheio. Exporte um backup e apague fotos grandes.', 'err', 8000);
    }
  }

  function agendarSalvar() {
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(function () { salvarAgora(); }, 400);
  }

  /* ---------------------------- estado e eventos ---------------------------- */

  function get() { return estado; }
  function conta() { return contaAtual; }
  function conectado() { return !!estado && !!contaAtual; }

  function subscrever(fn) {
    ouvintes.push(fn);
    return function () {
      var i = ouvintes.indexOf(fn);
      if (i >= 0) ouvintes.splice(i, 1);
    };
  }

  function notificar() {
    for (var i = 0; i < ouvintes.length; i++) {
      try { ouvintes[i](estado); } catch (e) { console.error(e); }
    }
  }

  /**
   * Altera o cofre. `fn` recebe o estado e pode mexer nele a vontade.
   * @param {function} fn
   * @param {boolean} [silencioso] nao redesenha a tela
   */
  function atualizar(fn, silencioso) {
    if (!estado) return;
    fn(estado);
    agendarSalvar();
    avisarAlteracao();
    if (!silencioso) notificar();
  }

  /* ---------------------------- ganchos da sincronização ---------------------------- */

  var ouvintesAlteracao = [];
  /** chamado a cada mudança feita NESTE aparelho (a nuvem usa para enviar) */
  function aoAlterar(fn) { ouvintesAlteracao.push(fn); }
  function avisarAlteracao() {
    ouvintesAlteracao.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  }

  /** Troca o cofre pelo que veio da nuvem (não conta como alteração local) */
  function aplicarDaNuvem(novo) {
    if (!contaAtual) return;
    estado = migrar(novo);
    agendarSalvar();
    notificar();
  }

  /** Guarda a base da sincronização dentro do cofre, sem redesenhar nem reenviar */
  function gravarSync(info) {
    if (!estado) return;
    estado._sync = info;
    agendarSalvar();
  }

  /**
   * Cria o acesso local de um painel que veio da nuvem (2º aparelho).
   * Se o e-mail já existir aqui, só atualiza a senha e o cofre.
   */
  function criarContaLocal(email, senha, cofre) {
    return cripto.criarSenha(senha).then(function (reg) {
      var lista = listarContas();
      var existente = acharConta(email);
      var conta = existente || { id: fmt.uid('acc'), email: email, criadoEm: new Date().toISOString() };
      conta.nome = (cofre.casal && cofre.casal.nome) || conta.nome || 'Nosso dinheiro';
      conta.senha = reg;
      if (existente) {
        for (var i = 0; i < lista.length; i++) if (lista[i].id === conta.id) lista[i] = conta;
      } else {
        lista.push(conta);
      }
      gravarContas(lista);

      estado = migrar(cofre);
      contaAtual = { id: conta.id, email: conta.email, nome: conta.nome };
      senhaMem = senha;
      lsSet(K_COFRE + conta.id, serializar());
      lsSet(K_ULTIMA, email);
      ssSet(K_SESSAO, conta.id);
      notificar();
      return contaAtual;
    });
  }

  /** A senha foi trocada em outro aparelho: atualiza a trava local */
  function atualizarSenhaLocal(senha) {
    if (!contaAtual) return Promise.resolve();
    return cripto.criarSenha(senha).then(function (reg) {
      var lista = listarContas();
      for (var i = 0; i < lista.length; i++) if (lista[i].id === contaAtual.id) lista[i].senha = reg;
      gravarContas(lista);
      senhaMem = senha;
      return salvarAgora();
    });
  }

  /** Lê o cofre guardado de um e-mail sem abrir sessão (null se criptografado ou ausente) */
  function lerCofreBruto(email) {
    var c = acharConta(email);
    if (!c) return null;
    try {
      var d = JSON.parse(lsGet(K_COFRE + c.id) || 'null');
      return d && d.enc !== 1 ? d : null;
    } catch (e) { return null; }
  }

  /** A senha confere com a trava local deste aparelho? */
  function conferirSenhaLocal(email, senha) {
    var c = acharConta(email);
    if (!c) return Promise.resolve(false);
    return cripto.conferirSenha(senha, c.senha);
  }

  /* ---------------------------- desfazer ---------------------------- */

  function guardarDesfazer(rotulo, desfazerFn) {
    pilhaDesfazer.push({ rotulo: rotulo, fn: desfazerFn, em: Date.now() });
    if (pilhaDesfazer.length > 20) pilhaDesfazer.shift();
  }

  function desfazer() {
    var ult = pilhaDesfazer.pop();
    if (!ult) return false;
    atualizar(ult.fn);
    return ult.rotulo;
  }

  /* ---------------------------- exportar / importar ---------------------------- */

  function exportar() {
    if (!estado) return null;
    var copia = JSON.parse(JSON.stringify(estado));
    delete copia._sync;
    copia._exportado = {
      em: new Date().toISOString(),
      app: 'Finanças do Casal',
      versao: 1,
      conta: contaAtual ? contaAtual.email : null
    };
    return copia;
  }

  function baixarBackup() {
    var dados = exportar();
    if (!dados) return;
    var nome = 'financas-casal-' + fmt.todayISO() + '.json';
    var blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    atualizar(function (s) { s.meta.ultimoBackup = new Date().toISOString(); }, true);
  }

  /**
   * Importa um JSON de backup.
   * @param {object} dados
   * @param {'substituir'|'juntar'} modo
   */
  function importar(dados, modo) {
    if (!dados || typeof dados !== 'object') throw new Error('Arquivo inválido.');
    if (!dados.casal || !dados.lancamentos) throw new Error('Este arquivo não parece um backup do app.');
    if (modo === 'planilha') return importarPlanilha(dados);

    var novo = migrar(JSON.parse(JSON.stringify(dados)));
    delete novo._exportado;

    if (modo === 'substituir' || !estado) {
      /* mantém a base da sincronização: a nuvem verá a troca como alteração local */
      if (estado && estado._sync) novo._sync = estado._sync;
      else delete novo._sync;
      estado = novo;
      agendarSalvar();
      avisarAlteracao();
      notificar();
      return { lancamentos: novo.lancamentos.length, modo: 'substituir' };
    }

    // juntar: acrescenta o que ainda nao existe (pelo id)
    var res = { lancamentos: 0, investimentos: 0, movimentos: 0, categorias: 0 };
    atualizar(function (s) {
      ['categorias', 'cartoes', 'terceiros', 'contas', 'investimentos', 'movimentos', 'recorrentes', 'lancamentos']
        .forEach(function (col) {
          var existentes = {};
          s[col].forEach(function (x) { existentes[x.id] = true; });
          (novo[col] || []).forEach(function (x) {
            if (!existentes[x.id]) {
              s[col].push(x);
              if (res[col] != null) res[col]++;
            }
          });
        });
      // pessoas: mantem as atuais, so completa se faltar
      if (s.casal.pessoas.length < 2 && novo.casal.pessoas.length >= 2) {
        s.casal.pessoas = novo.casal.pessoas;
      }
    });
    res.modo = 'juntar';
    return res;
  }

  /**
   * Traz os lançamentos da planilha para o painel ATUAL, sem mexer no resto:
   *   - pessoas, categorias, cartões e terceiros são casados pelo NOME
   *     (os ids do arquivo não valem no painel de vocês);
   *   - lançamentos que vieram da planilha antes são trocados pelos novos;
   *   - o que foi lançado no app, assinaturas, investimentos e ajustes ficam.
   * Rodar de novo com a planilha atualizada não duplica.
   */
  function importarPlanilha(arq) {
    if (!estado) throw new Error('Entre no painel antes de importar.');
    var norm = fmt.norm;
    var primeiro = function (p) { return norm(p.apelido || p.nome).split(' ')[0]; };
    var res = { lancamentos: 0, trocados: 0, criados: { categorias: 0, cartoes: 0, terceiros: 0 }, doAppNosMeses: 0, modo: 'planilha' };

    atualizar(function (s) {
      /* pessoas: pelo primeiro nome; se não achar, pela posição */
      var mapaP = {};
      arq.casal.pessoas.forEach(function (p, i) {
        var achou = s.casal.pessoas.filter(function (x) {
          return primeiro(x) === primeiro(p) || norm(x.nome).split(' ')[0] === norm(p.nome).split(' ')[0];
        })[0];
        mapaP[p.id] = (achou || s.casal.pessoas[i] || s.casal.pessoas[0]).id;
      });

      function casar(lista, destino, chaveTipo, ajustar) {
        var mapa = {};
        (lista || []).forEach(function (x) {
          var achou = destino.filter(function (y) { return norm(y.nome) === norm(x.nome); })[0];
          if (!achou) {
            achou = Object.assign({}, x, { id: x.id && x.id.indexOf('_pl_') > 0 ? x.id : fmt.uid(chaveTipo) });
            if (ajustar) ajustar(achou);
            destino.push(achou);
            res.criados[chaveTipo === 'cat' ? 'categorias' : chaveTipo === 'card' ? 'cartoes' : 'terceiros']++;
          }
          mapa[x.id] = achou.id;
        });
        return mapa;
      }
      var mapaC = casar(arq.categorias, s.categorias, 'cat');
      var mapaK = casar(arq.cartoes, s.cartoes, 'card', function (k) { k.pessoaId = mapaP[k.pessoaId] || k.pessoaId; });
      var mapaT = casar(arq.terceiros, s.terceiros, 'ter');

      var antes = s.lancamentos.length;
      s.lancamentos = s.lancamentos.filter(function (l) { return l.origem !== 'planilha'; });
      res.trocados = antes - s.lancamentos.length;

      var mesesPlanilha = {};
      (arq.lancamentos || []).forEach(function (l) {
        var n = JSON.parse(JSON.stringify(l));
        n.origem = 'planilha';
        n.pessoaId = mapaP[l.pessoaId] || l.pessoaId;
        n.categoriaId = l.categoriaId ? (mapaC[l.categoriaId] || null) : null;
        n.cartaoId = l.cartaoId ? (mapaK[l.cartaoId] || null) : null;
        n.terceiroId = l.terceiroId ? (mapaT[l.terceiroId] || null) : null;
        s.lancamentos.push(n);
        mesesPlanilha[n.mes] = true;
        res.lancamentos++;
      });

      /* o que foi lançado no app nos mesmos meses pode estar também na planilha */
      res.doAppNosMeses = s.lancamentos.filter(function (l) {
        return l.origem !== 'planilha' && l.origem !== 'assinatura' && mesesPlanilha[l.mes];
      }).length;

      var ini = Object.keys(mesesPlanilha).sort()[0];
      if (ini && (!s.meta.mesInicial || ini < s.meta.mesInicial)) s.meta.mesInicial = ini;
    });
    return res;
  }

  function apagarTudoDaConta() {
    if (!contaAtual) return;
    var id = contaAtual.id;
    estado = FC.seed.novoCofre(
      estado.casal.pessoas[0].nome,
      estado.casal.pessoas[1].nome,
      estado.casal.nome
    );
    lsSet(K_COFRE + id, serializar());
    notificar();
  }

  /** Quanto o cofre ocupa, em KB (aproximado) */
  function tamanhoKB() {
    if (!contaAtual) return 0;
    var s = lsGet(K_COFRE + contaAtual.id) || '';
    return Math.round((s.length * 2) / 1024);
  }

  FC.store = {
    disponivel: disponivel,
    listarContas: listarContas, acharConta: acharConta, ultimoEmail: ultimoEmail,
    criarConta: criarConta, entrar: entrar, sair: sair, retomarSessao: retomarSessao,
    trocarSenha: trocarSenha, apagarConta: apagarConta,
    get: get, conta: conta, conectado: conectado,
    subscrever: subscrever, notificar: notificar, atualizar: atualizar,
    salvarAgora: salvarAgora,
    guardarDesfazer: guardarDesfazer, desfazer: desfazer,
    exportar: exportar, baixarBackup: baixarBackup, importar: importar,
    apagarTudoDaConta: apagarTudoDaConta, tamanhoKB: tamanhoKB,
    aoAlterar: aoAlterar, aplicarDaNuvem: aplicarDaNuvem, gravarSync: gravarSync,
    criarContaLocal: criarContaLocal, atualizarSenhaLocal: atualizarSenhaLocal,
    conferirSenhaLocal: conferirSenhaLocal, lerCofreBruto: lerCofreBruto,
    _erroQuota: false
  };
})(typeof self !== 'undefined' ? self : this);
