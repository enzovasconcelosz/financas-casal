/* ==========================================================================
   app.js — inicializacao, abas, navegacao por mes e rotas
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var d = FC.dom, h = d.h, ic = d.ic, fmt = FC.fmt, ui = FC.ui;

  var mesAtual = fmt.thisMonth();
  var rota = '#/visao';
  var pintando = false;

  /* ======================================================================
     INICIO
     ====================================================================== */
  function iniciar() {
    if (!FC.store.disponivel()) {
      document.body.innerHTML =
        '<div style="max-width:440px;margin:18vh auto;padding:24px;font-family:system-ui;' +
        'text-align:center;color:#e8edf4;background:#11161d;border-radius:16px">' +
        '<h1 style="font-size:20px;margin:0 0 12px">Armazenamento bloqueado</h1>' +
        '<p style="color:#9aa8bb;line-height:1.6;margin:0">Este site guarda os dados no próprio ' +
        'navegador. Saia da navegação anônima ou libere o armazenamento local para este ' +
        'endereço e recarregue a página.</p></div>';
      return;
    }

    aplicarTemaSalvo();
    ligarEventosFixos();

    var mes = sessionStorage.getItem('fc:mes');
    if (mes && /^\d{4}-\d{2}$/.test(mes)) mesAtual = mes;

    if (FC.store.retomarSessao()) {
      aoEntrar();
      FC.nuvem.retomar();      // F5 com a sessão aberta: volta a sincronizar sem pedir senha
    } else {
      mostrarBloqueio();
    }

    registrarServiceWorker();
  }

  /* ======================================================================
     BLOQUEIO / ENTRADA
     ====================================================================== */
  function mostrarBloqueio() {
    d.$('#lock').hidden = false;
    d.$('#app').hidden = true;
    FC.viewLogin.render();
  }

  function aoEntrar(novo) {
    d.$('#lock').hidden = true;
    d.$('#app').hidden = false;

    rota = location.hash || '#/visao';
    if (rota === '#/' || rota === '#') rota = '#/visao';

    aplicarTema();
    montarAbas();
    atualizarBadge();
    avisouReentrar = false;
    atualizarIndicadorNuvem();

    /* qualquer alteração nos dados redesenha a tela atual */
    FC.store.subscrever(function () {
      if (!FC.store.conectado()) return;
      montarAbas();
      atualizarBadge();
      var nome = d.$('#coupleName');
      var s = FC.store.get();
      if (nome && s) nome.textContent = s.casal.nome;
      redesenhar();
    });

    /* assinaturas: lança as dos meses que chegaram desde a última vez */
    var lancadas = 0;
    if ((FC.store.get().recorrentes || []).length) {
      FC.store.atualizar(function (st) { lancadas = FC.model.materializar(st); }, true);
    }
    if (lancadas) {
      setTimeout(function () {
        ui.toast(lancadas + (lancadas === 1 ? ' assinatura lançada' : ' assinaturas lançadas') + ' no mês.', 'info', 5000,
          { texto: 'Ver', fn: function () { irPara('#/faturas'); } });
      }, 800);
    }

    redesenhar();

    if (FC.sync.configurado()) {
      FC.sync.iniciarPoll();
      FC.sync.sincronizar(true).catch(function () {});
    }
    FC.indicadores.atualizarSeVelho().catch(function () {});

    if (novo) {
      setTimeout(boasVindas, 500);
    } else {
      lembrarBackup();
    }
  }

  function aoSair() {
    FC.sync.pararPoll();
    FC.nuvem.parar(true);
    mostrarBloqueio();
  }

  /* ---------------- indicador da nuvem no topo ---------------- */
  var avisouReentrar = false;
  function atualizarIndicadorNuvem(st) {
    var b = d.$('#btnNuvem');
    if (!b) return;
    st = st || FC.nuvem.status();
    b.hidden = !st.configurado || !FC.store.conectado();
    b.setAttribute('data-estado', st.ligado ? st.estado : 'desligado');
    var textos = {
      ok: 'Sincronizado' + (st.ultimo ? ' às ' + fmt.stampBR(st.ultimo).slice(11) : ''),
      sincronizando: 'Sincronizando…',
      offline: 'Sem internet: as mudanças ficam aqui e sobem quando voltar',
      erro: 'Erro na sincronização: ' + (st.erro || ''),
      reentrar: st.erro || 'Entre de novo para sincronizar',
      desligado: 'Este aparelho não está sincronizando (Ajustes › Sincronização)'
    };
    b.title = st.ligado ? (textos[st.estado] || '') : textos.desligado;
    if (st.estado === 'reentrar' && !avisouReentrar) {
      avisouReentrar = true;
      ui.toast(st.erro || 'Entre de novo para sincronizar.', 'err', 9000,
        { texto: 'Bloquear', fn: bloquear });
    }
  }

  function bloquear() {
    FC.store.sair();
    aoSair();
    ui.toast('Painel bloqueado.', 'ok');
  }

  /* ======================================================================
     TEMA
     ====================================================================== */
  function aplicarTemaSalvo() {
    var t = localStorage.getItem('fc:tema') || 'dark';
    definirTema(t);
  }

  function aplicarTema() {
    var s = FC.store.get();
    definirTema(s ? s.config.tema : 'dark');
  }

  function definirTema(t) {
    var efetivo = t;
    if (t === 'sistema') {
      efetivo = root.matchMedia && root.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', efetivo);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', efetivo === 'light' ? '#f4f6fa' : '#0b0f14');
    try { localStorage.setItem('fc:tema', t); } catch (e) {}
  }

  function alternarTema() {
    var s = FC.store.get();
    var atual = s ? s.config.tema : (localStorage.getItem('fc:tema') || 'dark');
    var efetivo = document.documentElement.getAttribute('data-theme');
    var novo = efetivo === 'dark' ? 'light' : 'dark';

    if (s) FC.store.atualizar(function (st) { st.config.tema = novo; }, true);
    definirTema(novo);
  }

  /* ======================================================================
     ABAS
     ====================================================================== */
  function abas() {
    var s = FC.store.get();
    if (!s) return [];

    var lista = [{
      id: '#/visao', nome: 'Casal', icone: 'users',
      cor: ui.corDoAcento(s.config.acentoCasal || 'oceano')
    }];

    s.casal.pessoas.forEach(function (p) {
      lista.push({
        id: '#/pessoa/' + p.id,
        nome: p.apelido || p.nome,
        pessoa: p,
        cor: ui.corDoAcento(p.acento)
      });
    });

    lista.push({ id: '#/faturas', nome: 'Faturas', icone: 'card', cor: 'var(--c3)' });
    lista.push({ id: '#/investimentos', nome: 'Investimentos', icone: 'trend', cor: 'var(--c1)' });
    lista.push({ id: '#/relatorios', nome: 'Relatórios', icone: 'file', cor: 'var(--c2)' });
    lista.push({ id: '#/config', nome: 'Ajustes', icone: 'gear', cor: 'var(--text-2)' });

    return lista;
  }

  function montarAbas() {
    var barra = d.$('#tabs');
    if (!barra) return;

    d.clear(barra);
    abas().forEach(function (a) {
      var atual = rota === a.id || (a.id !== '#/visao' && rota.indexOf(a.id) === 0);
      var el = h('button.tab', {
        type: 'button',
        style: { '--tab-accent': a.cor },
        'aria-current': atual ? 'page' : null,
        onclick: function () { irPara(a.id); }
      },
        a.pessoa ? miniAvatar(a.pessoa) : (a.icone ? ic(a.icone) : h('span.tab__dot')),
        h('span', a.nome)
      );
      barra.appendChild(el);
    });

    montarNavInferior();
  }

  function miniAvatar(p) {
    if (p.foto) return h('img.tab__ava', { src: p.foto, alt: '' });
    return h('span.tab__dot');
  }

  function montarNavInferior() {
    var nav = d.$('#bottomNav');
    if (!nav) return;
    d.clear(nav);

    var s = FC.store.get();
    if (!s) return;

    var itens = [
      { id: '#/visao', nome: 'Casal', icone: 'users', cor: ui.corDoAcento(s.config.acentoCasal || 'oceano') }
    ];
    s.casal.pessoas.forEach(function (p) {
      itens.push({
        id: '#/pessoa/' + p.id,
        nome: fmt.truncate(p.apelido || p.nome.split(' ')[0], 9),
        pessoa: p,
        cor: ui.corDoAcento(p.acento)
      });
    });
    itens.push({ id: '#/investimentos', nome: 'Investir', icone: 'trend', cor: 'var(--c1)' });
    itens.push({ id: '__mais', nome: 'Mais', icone: 'dots', cor: 'var(--text-2)' });

    itens.forEach(function (a) {
      var atual = rota === a.id || (a.id !== '#/visao' && a.id !== '__mais' && rota.indexOf(a.id) === 0);
      nav.appendChild(h('button.bnav', {
        type: 'button',
        style: { '--bnav-accent': a.cor },
        'aria-current': atual ? 'page' : null,
        onclick: function (e) {
          if (a.id === '__mais') return menuMais(e.currentTarget);
          irPara(a.id);
        }
      },
        a.pessoa && a.pessoa.foto ? h('img.bnav__ava', { src: a.pessoa.foto, alt: '' }) : ic(a.icone || 'user'),
        h('span', a.nome)
      ));
    });
  }

  function menuMais(ancora) {
    ui.menu(ancora, [
      { texto: 'Faturas futuras', icone: 'card', fn: function () { irPara('#/faturas'); } },
      { texto: 'Relatórios', icone: 'file', fn: function () { irPara('#/relatorios'); } },
      { texto: 'Caixa de entrada', icone: 'inbox', fn: function () { irPara('#/caixa'); } },
      { texto: 'Ajustes', icone: 'gear', fn: function () { irPara('#/config'); } },
      { divisor: true },
      { texto: 'Baixar backup', icone: 'download', fn: function () { FC.store.baixarBackup(); } },
      { texto: 'Bloquear', icone: 'lock', fn: bloquear }
    ]);
  }

  /* ======================================================================
     NAVEGACAO
     ====================================================================== */
  function irPara(novaRota) {
    rota = novaRota;
    if (location.hash !== novaRota) location.hash = novaRota;
    montarAbas();
    redesenhar();
    root.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** só para o botão voltar do navegador: a rota mudou por fora */
  function aoMudarHash() {
    var nova = location.hash || '#/visao';
    if (nova === rota) return;
    rota = nova;
    montarAbas();
    redesenhar();
    root.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ======================================================================
     MES
     ====================================================================== */
  function mes() { return mesAtual; }

  function definirMes(m) {
    mesAtual = m;
    try { sessionStorage.setItem('fc:mes', m); } catch (e) {}
    atualizarRotuloMes();
    redesenhar();
  }

  function andarMes(n) {
    definirMes(fmt.addMonths(mesAtual, n));
  }

  function atualizarRotuloMes() {
    var el = d.$('#mLabel');
    if (!el) return;
    var ehAtual = mesAtual === fmt.thisMonth();
    el.textContent = ehAtual ? fmt.monthLabel(mesAtual) : fmt.monthLabel(mesAtual);
    el.style.color = ehAtual ? '' : 'var(--accent)';
  }

  function escolherMes(ancora) {
    var s = FC.store.get();
    var comDados = FC.model.mesesComDados(s);
    var ano = parseInt(mesAtual.slice(0, 4), 10);

    var grade = h('div');

    function pintarAno(a) {
      d.clear(grade);
      grade.appendChild(h('div.row.row--between', { style: { marginBottom: 'var(--sp-3)' } },
        h('button.iconbtn.iconbtn--ghost', { type: 'button', onclick: function () { pintarAno(a - 1); } }, ic('chevLeft')),
        h('strong', { style: { fontSize: 'var(--fs-lg)' } }, String(a)),
        h('button.iconbtn.iconbtn--ghost', { type: 'button', onclick: function () { pintarAno(a + 1); } }, ic('chevRight'))
      ));

      grade.appendChild(h('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-2)' }
      },
        fmt.MESES_ABR.map(function (nome, i) {
          var chave = a + '-' + fmt.pad(i + 1);
          var tem = comDados.indexOf(chave) >= 0;
          var ehAtual = chave === mesAtual;
          return h('button.btn' + (ehAtual ? '' : '.btn--ghost'), {
            type: 'button',
            style: { textTransform: 'capitalize', position: 'relative' },
            onclick: function () { definirMes(chave); fecharMenu(); }
          },
            nome,
            tem && !ehAtual ? h('span', {
              style: {
                position: 'absolute', bottom: '5px', left: '50%', width: '4px', height: '4px',
                borderRadius: '99px', background: 'var(--accent)', transform: 'translateX(-50%)'
              }
            }) : null
          );
        })
      ));

      grade.appendChild(h('button.btn.btn--soft.btn--sm.btn--block.mt-4', {
        type: 'button',
        onclick: function () { definirMes(fmt.thisMonth()); fecharMenu(); }
      }, ic('calendar'), 'Ir para o mês atual'));
    }

    pintarAno(ano);

    var ctrl = ui.modal({
      titulo: 'Escolher o mês',
      largura: 'slim',
      corpo: grade
    });

    function fecharMenu() { ctrl.fechar(); }
  }

  /* ======================================================================
     DESENHO DA TELA
     ====================================================================== */
  function redesenhar() {
    if (pintando) return;
    pintando = true;

    root.requestAnimationFrame(function () {
      pintando = false;
      var alvo = d.$('#view');
      if (!alvo || !FC.store.conectado()) return;

      atualizarRotuloMes();

      var s = FC.store.get();
      var nomeEl = d.$('#coupleName');
      if (nomeEl) nomeEl.textContent = s.casal.nome;

      var ctx = { mes: mesAtual, rota: rota };

      try {
        if (rota.indexOf('#/pessoa/') === 0) {
          ctx.pessoaId = rota.slice('#/pessoa/'.length);
          FC.viewPessoa.render(alvo, ctx);
        } else if (rota === '#/faturas') {
          FC.viewFaturas.render(alvo, ctx);
        } else if (rota === '#/investimentos') {
          FC.viewInvest.render(alvo, ctx);
        } else if (rota === '#/relatorios') {
          FC.viewRelatorios.render(alvo, ctx);
        } else if (rota === '#/config') {
          FC.viewConfig.render(alvo, ctx);
        } else if (rota === '#/caixa') {
          FC.viewCaixa.render(alvo, ctx);
        } else {
          FC.viewVisao.render(alvo, ctx);
        }
      } catch (e) {
        console.error(e);
        d.mount(alvo, h('div.card',
          ui.vazio({
            titulo: 'Algo quebrou ao desenhar esta tela',
            icone: 'alert',
            texto: e.message,
            acao: h('button.btn.btn--sm', { type: 'button', onclick: function () { irPara('#/visao'); } },
              'Voltar para a visão geral')
          })
        ));
      }
    });
  }

  /* ======================================================================
     EVENTOS FIXOS
     ====================================================================== */
  function ligarEventosFixos() {
    d.$('#mPrev').addEventListener('click', function () { andarMes(-1); });
    d.$('#mNext').addEventListener('click', function () { andarMes(1); });
    d.$('#mLabel').addEventListener('click', function (e) { escolherMes(e.currentTarget); });
    d.$('#btnTheme').addEventListener('click', alternarTema);
    d.$('#btnLock').addEventListener('click', bloquear);
    FC.nuvem.aoMudarStatus(atualizarIndicadorNuvem);
    d.$('#btnNuvem').addEventListener('click', function () {
      var st = FC.nuvem.status();
      if (!st.ligado) { irPara('#/config'); return; }
      if (st.estado === 'reentrar') { ui.toast(st.erro, 'err', 7000, { texto: 'Bloquear', fn: bloquear }); return; }
      FC.nuvem.sincronizar().then(function (ok) {
        var s2 = FC.nuvem.status();
        ui.toast(ok ? 'Sincronizado.' : (s2.erro || 'Não consegui sincronizar agora.'), ok ? 'ok' : 'err');
      });
    });
    d.$('#btnHome').addEventListener('click', function () { irPara('#/visao'); });
    d.$('#btnInbox').addEventListener('click', function () { irPara('#/caixa'); });
    d.$('#btnAdd').addEventListener('click', function () { FC.forms.lancamento({ mes: mesAtual }); });
    d.$('#fab').addEventListener('click', function () { FC.forms.lancamento({ mes: mesAtual }); });

    root.addEventListener('hashchange', aoMudarHash);

    if (root.matchMedia) {
      var mq = root.matchMedia('(prefers-color-scheme: light)');
      var aoTrocarSistema = function () {
        var s = FC.store.get();
        if (s && s.config.tema === 'sistema') aplicarTema();
      };
      if (mq.addEventListener) mq.addEventListener('change', aoTrocarSistema);
      else if (mq.addListener) mq.addListener(aoTrocarSistema);
    }

    document.addEventListener('keydown', function (e) {
      if (!FC.store.conectado()) return;
      var alvo = e.target;
      var digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' ||
                               alvo.tagName === 'SELECT' || alvo.isContentEditable);
      if (digitando || e.ctrlKey || e.metaKey || e.altKey) return;
      if (d.$('.modal-scrim')) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        FC.forms.lancamento({ mes: mesAtual });
      } else if (e.key === 'ArrowLeft') {
        andarMes(-1);
      } else if (e.key === 'ArrowRight') {
        andarMes(1);
      } else if (e.key >= '1' && e.key <= '7') {
        var lista = abas();
        var i = parseInt(e.key, 10) - 1;
        if (lista[i]) irPara(lista[i].id);
      } else if (e.key === 'l' || e.key === 'L') {
        bloquear();
      }
    });

    /* salva antes de fechar */
    root.addEventListener('beforeunload', function () {
      if (FC.store.conectado()) FC.store.salvarAgora();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && FC.store.conectado()) FC.store.salvarAgora();
    });
  }

  /* ======================================================================
     AVISOS
     ====================================================================== */
  function atualizarBadge() {
    var b = d.$('#inboxBadge');
    if (!b) return;
    var n = FC.store.conectado() ? FC.sync.pendentes().length : 0;
    b.textContent = n > 99 ? '99+' : String(n);
    b.hidden = n === 0;
  }

  function lembrarBackup() {
    var s = FC.store.get();
    if (!s || !s.config.avisoBackup) return;
    if (!s.lancamentos.length) return;

    var ultimo = s.meta.ultimoBackup;
    var dias = ultimo ? (Date.now() - new Date(ultimo).getTime()) / 86400000 : 999;
    if (dias < 30) return;

    setTimeout(function () {
      ui.toast(
        ultimo ? 'Faz um tempo desde o último backup.' : 'Vale baixar um backup dos dados.',
        'info', 9000,
        { texto: 'Baixar', fn: function () { FC.store.baixarBackup(); ui.toast('Backup salvo.', 'ok'); } }
      );
    }, 2500);
  }

  function boasVindas() {
    var s = FC.store.get();
    ui.modal({
      titulo: 'Tudo pronto, ' + (s.casal.pessoas[0].nome.split(' ')[0]) + '!',
      sub: 'três coisas para começar bem',
      corpo: h('div.col', { style: { gap: 'var(--sp-4)' } },
        passo('1', 'wallet', 'Diga quanto tem em conta',
          'Em Ajustes › Saldo em conta, informe quanto há hoje em cada conta. ' +
          'É desse ponto que sai o patrimônio do casal.'),
        passo('2', 'card', 'Cadastre os cartões',
          'Com o dia do fechamento, o app já joga a compra na fatura certa.'),
        passo('3', 'plus', 'Lance o primeiro gasto',
          'Pelo botão Lançar, ou digitando direto na linha de cada painel, como na planilha. ' +
          'A tecla N abre o lançamento de qualquer tela.'),
        h('div.note.note--warn', ic('alert'),
          h('div', h('strong.note__title', 'Baixe backups de vez em quando'),
            'Os dados ficam só neste navegador. Em Ajustes › Seus dados você baixa um arquivo ' +
            'JSON com tudo — é ele que leva os dados para outro aparelho.'))
      ),
      acoes: function (c) {
        return [
          h('div.grow'),
          h('button.btn.btn--ghost', { type: 'button', onclick: function () { c.fechar(); } }, 'Depois'),
          h('button.btn', {
            type: 'button',
            onclick: function () { c.fechar(); irPara('#/config'); }
          }, ic('gear'), 'Ir para os ajustes')
        ];
      }
    });
  }

  function passo(n, icone, titulo, texto) {
    return h('div.row', { style: { alignItems: 'flex-start', gap: 'var(--sp-3)' } },
      h('span.lock__acc__av', { style: { flex: 'none' } }, n),
      h('div',
        h('div', { style: { fontWeight: '650', marginBottom: '2px' } }, titulo),
        h('div.dim', { style: { fontSize: 'var(--fs-sm)', lineHeight: '1.55' } }, texto)
      )
    );
  }

  /* ======================================================================
     SERVICE WORKER (uso offline)
     ====================================================================== */
  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').catch(function () { /* segue sem offline */ });
  }

  /* ======================================================================
     EXPORTA
     ====================================================================== */
  FC.app = {
    iniciar: iniciar,
    aoEntrar: aoEntrar,
    aoSair: aoSair,
    bloquear: bloquear,
    irPara: irPara,
    redesenhar: redesenhar,
    mes: mes,
    definirMes: definirMes,
    aplicarTema: aplicarTema,
    atualizarBadge: atualizarBadge,
    rota: function () { return rota; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})(typeof self !== 'undefined' ? self : this);
