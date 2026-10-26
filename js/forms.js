/* ==========================================================================
   forms.js — janelas de cadastro: lancamento, investimento, pessoa, etc.
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var d = FC.dom, h = d.h, ic = d.ic, fmt = FC.fmt, ui = FC.ui;

  function S() { return FC.store.get(); }

  /* ======================================================================
     FOTO — reduz a imagem antes de guardar (localStorage e pequeno)
     ====================================================================== */
  function lerFoto(arquivo, lado) {
    lado = lado || 320;
    return new Promise(function (ok, falhou) {
      if (!arquivo || !/^image\//.test(arquivo.type)) {
        return falhou(new Error('Escolha um arquivo de imagem.'));
      }
      if (arquivo.size > 12 * 1024 * 1024) {
        return falhou(new Error('Imagem muito grande (máximo 12 MB).'));
      }

      var leitor = new FileReader();
      leitor.onerror = function () { falhou(new Error('Não consegui ler o arquivo.')); };
      leitor.onload = function () {
        var img = new Image();
        img.onerror = function () { falhou(new Error('Arquivo de imagem inválido.')); };
        img.onload = function () {
          var escala = Math.min(1, lado / Math.max(img.width, img.height));
          var w = Math.round(img.width * escala);
          var alt = Math.round(img.height * escala);

          var cv = document.createElement('canvas');
          cv.width = w; cv.height = alt;
          var cx = cv.getContext('2d');
          cx.imageSmoothingQuality = 'high';
          cx.drawImage(img, 0, 0, w, alt);

          try {
            ok(cv.toDataURL('image/jpeg', 0.82));
          } catch (e) {
            falhou(new Error('Não consegui converter a imagem.'));
          }
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  function botaoFoto(valorAtual, aoTrocar) {
    var previa = h('div.avatar.avatar--xl', { style: { margin: '0 auto' } });

    function pintar(v) {
      d.clear(previa);
      if (v) previa.appendChild(h('img', { src: v, alt: 'Foto' }));
      else previa.appendChild(ic('camera', 'ico--lg'));
    }
    pintar(valorAtual);

    var input = h('input', {
      type: 'file', accept: 'image/*', style: { display: 'none' },
      onchange: function () {
        var f = input.files && input.files[0];
        if (!f) return;
        lerFoto(f).then(function (dataURL) {
          pintar(dataURL);
          aoTrocar(dataURL);
        }).catch(function (e) { ui.toast(e.message, 'err'); });
        input.value = '';
      }
    });

    return h('div.col', { style: { alignItems: 'center', gap: 'var(--sp-3)' } },
      previa,
      input,
      h('div.row',
        h('button.btn.btn--soft.btn--sm', { type: 'button', onclick: function () { input.click(); } },
          ic('camera'), 'Escolher foto'),
        h('button.btn.btn--ghost.btn--sm', {
          type: 'button',
          onclick: function () { pintar(null); aoTrocar(null); }
        }, 'Tirar')
      )
    );
  }

  /* ======================================================================
     LANCAMENTO (gasto / entrada)
     ====================================================================== */
  function lancamento(op) {
    op = op || {};
    var s = S();
    var editando = !!op.id;
    var orig = null;

    if (editando) {
      for (var i = 0; i < s.lancamentos.length; i++) {
        if (s.lancamentos[i].id === op.id) orig = s.lancamentos[i];
      }
      if (!orig) return ui.toast('Lançamento não encontrado.', 'err');
    }

    var mesAtual = op.mes || (FC.app ? FC.app.mes() : fmt.thisMonth());

    var dados = orig ? JSON.parse(JSON.stringify(orig)) : {
      id: null,
      tipo: op.tipo || 'gasto',
      data: mesAtual === fmt.thisMonth() ? fmt.todayISO() : (mesAtual + '-01'),
      mes: mesAtual,
      desc: op.desc || '',
      valor: op.valor || null,
      pessoaId: op.pessoaId || s.casal.pessoas[0].id,
      metodo: op.metodo || 'debito',
      cartaoId: op.cartaoId || null,
      categoriaId: op.categoriaId || null,
      terceiroId: op.terceiroId || null,
      pago: false,
      reembolsado: false,
      parcela: null,
      obs: '',
      origem: 'web'
    };

    /* repetição (só em lançamento novo): 'unico' | 'parcelado' | 'mensal' */
    var repeticao = op.repeticao || 'unico';
    var modoValor = 'total';          // o valor digitado é o total da compra ou a parcela
    var aplicarSeguintes = false;     // edição de parcela: levar a mudança às próximas
    var salvarENovo = false;

    /* --------- campos --------- */
    var inValor = h('input.input.input--lg.input--money', {
      type: 'text', inputmode: 'decimal', placeholder: '0,00', autofocus: true,
      value: dados.valor != null ? fmt.money(dados.valor) : '',
      onblur: function () {
        var v = fmt.parseMoney(inValor.value);
        if (v != null) inValor.value = fmt.money(v);
      }
    });

    var inDesc = h('input.input', {
      type: 'text', placeholder: 'Ex.: Mercado do mês', maxlength: '80',
      value: dados.desc,
      list: 'sugestoesDesc'
    });

    var inData = h('input.input', { type: 'date', value: dados.data });

    var selCategoria = h('select.select',
      h('option', { value: '' }, 'Sem categoria'),
      s.categorias.filter(function (c) { return !c.arquivada; }).map(function (c) {
        return h('option', { value: c.id, selected: c.id === dados.categoriaId }, c.nome);
      })
    );

    var selCartao = h('select.select',
      h('option', { value: '' }, 'Sem cartão específico'),
      s.cartoes.map(function (c) {
        return h('option', { value: c.id, selected: c.id === dados.cartaoId }, c.nome);
      })
    );

    var selTerceiro = h('select.select',
      h('option', { value: '' }, 'É nosso gasto'),
      s.terceiros.map(function (t) {
        return h('option', { value: t.id, selected: t.id === dados.terceiroId }, t.nome);
      }),
      h('option', { value: '__novo' }, '+ Cadastrar outra pessoa…')
    );
    selTerceiro.addEventListener('change', function () {
      if (selTerceiro.value === '__novo') {
        selTerceiro.value = dados.terceiroId || '';
        terceiro({
          aoSalvar: function (novo) {
            selTerceiro.insertBefore(
              h('option', { value: novo.id, selected: true }, novo.nome),
              selTerceiro.lastChild
            );
            selTerceiro.value = novo.id;
          }
        });
      }
    });

    var inMesFatura = h('input.input', { type: 'month', value: dados.mes });
    var inObs = h('textarea.textarea', { placeholder: 'Anotação (opcional)', maxlength: '240' }, dados.obs || '');

    var inQtdParcelas = h('input.input', { type: 'number', min: '2', max: '60', value: String(op.parcelas || 2) });
    var inPrimeira = h('input.input', { type: 'number', min: '1', max: '60', value: '1' });
    var inFimRep = h('input.input', { type: 'month', value: '' });

    /* --------- blocos que aparecem e somem --------- */
    var blocoCredito = h('div.fgrid', { style: { display: 'none' } },
      ui.campo('Cartão', selCartao),
      ui.campo('Mês da fatura', inMesFatura, 'Em qual fatura esta compra entra')
    );

    var avisoParcela = h('div.note', { style: { display: 'none' } });

    var opcoesParcela = h('div.col', { style: { gap: 'var(--sp-3)' } },
      h('div.fgrid',
        ui.campo('Número de parcelas', inQtdParcelas),
        ui.campo('Começa na parcela', inPrimeira, 'Já pagou algumas? Ex.: 3 = está na 3ª')
      ),
      ui.campo('O valor digitado é', ui.segmentado(
        [{ id: 'total', nome: 'Total da compra' }, { id: 'parcela', nome: 'De cada parcela' }],
        modoValor, function (v) { modoValor = v; atualizarResumoParcela(); }, 'seg--block'))
    );

    var opcoesMensal = h('div.col', { style: { gap: 'var(--sp-3)' } },
      ui.campo('Até (opcional)', inFimRep, 'Deixe vazio para repetir até você encerrar')
    );

    var segRepeticao = ui.segmentado(
      [{ id: 'unico', nome: 'Uma vez' }, { id: 'parcelado', nome: 'Parcelado' }, { id: 'mensal', nome: 'Todo mês' }],
      repeticao, function (v) { repeticao = v; atualizarResumoParcela(); }, 'seg--block'
    );

    var blocoRepeticao = editando ? null : h('div.col', { style: { gap: 'var(--sp-3)' } },
      ui.campo('Repetição', segRepeticao), opcoesParcela, opcoesMensal, avisoParcela);

    /** mês do lançamento: fatura (crédito) ou mês da data */
    function mesDoLancamento() {
      return dados.metodo === 'credito' ? (inMesFatura.value || fmt.monthKey(inData.value)) : fmt.monthKey(inData.value);
    }

    function atualizarResumoParcela() {
      if (!blocoRepeticao) return;
      opcoesParcela.style.display = repeticao === 'parcelado' ? '' : 'none';
      opcoesMensal.style.display = repeticao === 'mensal' ? '' : 'none';
      var v = fmt.parseMoney(inValor.value) || 0;
      var mes = mesDoLancamento();
      var txt = '';

      if (repeticao === 'parcelado') {
        var de = fmt.clamp(parseInt(inQtdParcelas.value, 10) || 2, 2, 60);
        var prim = fmt.clamp(parseInt(inPrimeira.value, 10) || 1, 1, de);
        var parcela = modoValor === 'parcela' ? v : v / de;
        var qtd = de - prim + 1;
        if (v > 0) {
          txt = 'Lança ' + qtd + (qtd === 1 ? ' parcela' : ' parcelas') + ' de ' + fmt.brl(parcela) +
                ' (' + prim + '/' + de + ' a ' + de + '/' + de + '), de ' + fmt.monthLabel(mes, true) +
                ' a ' + fmt.monthLabel(fmt.addMonths(mes, qtd - 1), true) +
                '. Total da compra: ' + fmt.brl(modoValor === 'parcela' ? v * de : v) + '.';
        }
      } else if (repeticao === 'mensal') {
        txt = 'Lança ' + (v > 0 ? fmt.brl(v) : 'o valor') + ' em ' + fmt.monthLabel(mes, true) +
              ' e cria uma assinatura. Nos meses seguintes ela aparece como prevista e entra nas faturas futuras; ' +
              'quando o mês chega, é lançada sozinha.';
      }
      avisoParcela.style.display = txt ? '' : 'none';
      d.clear(avisoParcela);
      avisoParcela.appendChild(ic('info'));
      avisoParcela.appendChild(h('div', txt));
    }
    [inQtdParcelas, inPrimeira, inValor].forEach(function (el) { el.addEventListener('input', atualizarResumoParcela); });
    inMesFatura.addEventListener('change', atualizarResumoParcela);

    /* --------- edição: parcela de um grupo ou lançamento de assinatura --------- */
    var blocoVinculo = null;
    if (editando && orig.tipo === 'gasto') {
      if (orig.parcela && orig.parcela.grupoId) {
        var grupo = FC.model.parcelamentos(s).filter(function (g) { return g.grupoId === orig.parcela.grupoId; })[0];
        var seguintes = grupo ? grupo.itens.filter(function (l) { return l.parcela.n > orig.parcela.n; }).length : 0;
        blocoVinculo = h('div.note', ic('calendar'), h('div.grow',
          h('strong.note__title', 'Parcela ' + orig.parcela.n + ' de ' + orig.parcela.de),
          grupo ? (grupo.itens.length + ' lançadas' + (grupo.faltamLancar > 0 ? ' · faltam ' + grupo.faltamLancar : ' · todas lançadas')) : '',
          seguintes ? h('div.mt-2', ui.interruptor('Aplicar valor, descrição e categoria às ' + seguintes + ' parcelas seguintes',
            false, function (v) { aplicarSeguintes = v; })) : null,
          grupo && grupo.faltamLancar > 0 ? h('button.btn.btn--soft.btn--sm.mt-2', {
            type: 'button',
            onclick: function () { ctrl.fechar(); lancarParcelasQueFaltam(grupo.grupoId); }
          }, ic('plus'), 'Lançar as ' + grupo.faltamLancar + ' que faltam') : null
        ));
      } else if (orig.recorrenteId && FC.model.recorrente && FC.model.recorrente(s, orig.recorrenteId)) {
        blocoVinculo = h('div.note', ic('refresh'), h('div.grow',
          h('strong.note__title', 'Faz parte de uma assinatura'),
          'Mudanças aqui valem só para este mês. ',
          h('button.btn.btn--soft.btn--sm.mt-2', {
            type: 'button', onclick: function () { ctrl.fechar(); assinatura({ id: orig.recorrenteId }); }
          }, ic('pencil'), 'Editar a assinatura')
        ));
      } else if (!orig.parcela && !orig.terceiroId) {
        blocoVinculo = h('button.btn.btn--ghost.btn--sm', {
          type: 'button',
          onclick: function () { ctrl.fechar(); assinaturaDeLancamento(orig); }
        }, ic('refresh'), 'Repetir todo mês (criar assinatura)');
      }
    }

    /* forma de pagamento */
    var segMetodo = ui.segmentado(
      FC.model.METODOS.map(function (m) { return { id: m.id, nome: m.nome }; }),
      dados.metodo,
      function (v) { dados.metodo = v; aplicarMetodo(); },
      'seg--block'
    );

    function aplicarMetodo() {
      var ehCred = dados.metodo === 'credito';
      blocoCredito.style.display = ehCred ? '' : 'none';
      if (ehCred && !dados.cartaoId && s.cartoes.length) {
        var meuCartao = null;
        for (var i = 0; i < s.cartoes.length; i++) {
          if (s.cartoes[i].pessoaId === dados.pessoaId) { meuCartao = s.cartoes[i]; break; }
        }
        if (meuCartao) selCartao.value = meuCartao.id;
      }
      ajustarMesFatura();
      atualizarResumoParcela();
    }

    /** Se a compra foi depois do fechamento, sugere a fatura do mes seguinte */
    function ajustarMesFatura() {
      if (dados.metodo !== 'credito' || editando) return;
      var c = selCartao.value ? FC.model.cartao(s, selCartao.value) : null;
      var mesCompra = fmt.monthKey(inData.value);
      if (c && c.fechamento) {
        var dia = parseInt(String(inData.value).slice(8, 10), 10);
        inMesFatura.value = dia > c.fechamento ? fmt.addMonths(mesCompra, 1) : mesCompra;
      } else {
        inMesFatura.value = mesCompra;
      }
      atualizarResumoParcela();
    }
    inData.addEventListener('change', ajustarMesFatura);
    selCartao.addEventListener('change', ajustarMesFatura);

    /* tipo: gasto ou entrada */
    var blocoGasto = h('div');
    var segTipo = ui.segmentado(
      [{ id: 'gasto', nome: 'Gasto' }, { id: 'receita', nome: 'Entrada' }],
      dados.tipo,
      function (v) {
        dados.tipo = v;
        blocoGasto.style.display = v === 'gasto' ? '' : 'none';
        inValor.style.color = v === 'receita' ? 'var(--pos)' : '';
      },
      'seg--block'
    );

    /* pessoa */
    var segPessoa = h('div.seg.seg--block');
    s.casal.pessoas.forEach(function (p) {
      var b = h('button.seg__item', {
        type: 'button',
        'aria-pressed': String(p.id === dados.pessoaId),
        style: { '--accent': ui.corDoAcento(p.acento) },
        onclick: function () {
          dados.pessoaId = p.id;
          Array.prototype.forEach.call(segPessoa.children, function (c) { c.setAttribute('aria-pressed', 'false'); });
          b.setAttribute('aria-pressed', 'true');
        }
      }, ui.avatar(p, 'sm'), h('span', p.apelido || p.nome));
      segPessoa.appendChild(b);
    });

    /* sugestoes de descricao a partir do historico */
    var vistos = {}, sugestoes = [];
    for (var k = s.lancamentos.length - 1; k >= 0 && sugestoes.length < 40; k--) {
      var dsc = s.lancamentos[k].desc;
      if (dsc && !vistos[dsc]) { vistos[dsc] = 1; sugestoes.push(dsc); }
    }

    /* --------- montagem --------- */
    var corpo = h('div.col', { style: { gap: 'var(--sp-4)' } },
      h('datalist', { id: 'sugestoesDesc' }, sugestoes.map(function (x) { return h('option', { value: x }); })),
      segTipo,
      h('div.fgrid',
        ui.campo('Valor', h('div.input-group', h('span.input-group__prefix', 'R$'), inValor)),
        ui.campo('Data', inData)
      ),
      ui.campo('Descrição', inDesc),
      ui.campo('De quem é', segPessoa),
      blocoGasto
    );

    d.mount(blocoGasto, h('div.col', { style: { gap: 'var(--sp-4)' } },
      ui.campo('Forma de pagamento', segMetodo),
      blocoCredito,
      blocoRepeticao,
      blocoVinculo,
      h('div.fgrid',
        ui.campo('Categoria', selCategoria),
        ui.campo('Quem usou', selTerceiro, 'Para quando o cartão foi emprestado')
      ),
      ui.campo('Observação', inObs)
    ));

    blocoGasto.style.display = dados.tipo === 'gasto' ? '' : 'none';

    var ctrl = ui.modal({
      titulo: editando ? 'Editar lançamento' : 'Novo lançamento',
      sub: editando ? null : 'Mês ' + fmt.monthLabel(mesAtual),
      corpo: corpo,
      acoes: function (c) {
        return [
          editando ? h('button.btn.btn--danger-ghost.btn--sm', {
            type: 'button',
            onclick: function () { c.fechar(); apagarLancamento(orig); }
          }, ic('trash'), 'Excluir') : null,
          h('div.grow'),
          !editando ? h('button.btn.btn--ghost', {
            type: 'button',
            onclick: function () { salvarENovo = true; salvar(c); }
          }, 'Salvar e novo') : null,
          h('button.btn', { type: 'button', onclick: function () { salvarENovo = false; salvar(c); } },
            ic('check'), editando ? 'Salvar' : 'Lançar')
        ];
      }
    });

    aplicarMetodo();

    corpo.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        salvar(ctrl);
      }
    });

    function salvar(c) {
      var valor = fmt.parseMoney(inValor.value);
      if (valor == null || valor <= 0) {
        ui.toast('Informe um valor maior que zero.', 'err');
        inValor.focus();
        return;
      }
      var desc = inDesc.value.trim();
      if (!desc) {
        ui.toast('Escreva uma descrição.', 'err');
        inDesc.focus();
        return;
      }

      var novo = {
        id: dados.id || fmt.uid('lan'),
        tipo: dados.tipo,
        data: inData.value || fmt.todayISO(),
        desc: desc,
        valor: valor,
        pessoaId: dados.pessoaId,
        metodo: dados.tipo === 'receita' ? 'pix' : dados.metodo,
        cartaoId: dados.metodo === 'credito' ? (selCartao.value || null) : null,
        categoriaId: selCategoria.value || null,
        terceiroId: dados.tipo === 'gasto' ? (selTerceiro.value || null) : null,
        pago: dados.pago || false,
        reembolsado: dados.reembolsado || false,
        parcela: dados.parcela || null,
        obs: inObs.value.trim(),
        origem: dados.origem || 'web',
        criadoEm: orig ? orig.criadoEm : new Date().toISOString()
      };

      novo.mes = (dados.tipo === 'gasto' && dados.metodo === 'credito')
        ? (inMesFatura.value || fmt.monthKey(novo.data))
        : fmt.monthKey(novo.data);

      if (orig && orig.recorrenteId) novo.recorrenteId = orig.recorrenteId;

      var ehGasto = dados.tipo === 'gasto' && !editando;
      var vaiParcelar = ehGasto && repeticao === 'parcelado';
      var vaiRepetir = ehGasto && repeticao === 'mensal';
      var de = fmt.clamp(parseInt(inQtdParcelas.value, 10) || 2, 2, 60);
      var primeira = fmt.clamp(parseInt(inPrimeira.value, 10) || 1, 1, de);
      var qtdCriada = de - primeira + 1;

      if (vaiRepetir && novo.terceiroId) {
        ui.toast('Assinatura não pode ser de terceiro. Tire o "Quem usou" ou lance só uma vez.', 'err', 5000);
        return;
      }
      if (vaiRepetir && inFimRep.value && inFimRep.value < novo.mes) {
        ui.toast('O mês final é antes do primeiro.', 'err');
        return;
      }

      FC.store.atualizar(function (st) {
        if (editando) {
          for (var i = 0; i < st.lancamentos.length; i++) {
            if (st.lancamentos[i].id === novo.id) { st.lancamentos[i] = novo; break; }
          }
          /* levar a mudança às próximas parcelas do mesmo grupo */
          if (aplicarSeguintes && orig.parcela && orig.parcela.grupoId) {
            st.lancamentos.forEach(function (l) {
              if (l.parcela && l.parcela.grupoId === orig.parcela.grupoId && l.parcela.n > orig.parcela.n) {
                l.valor = novo.valor; l.desc = novo.desc; l.categoriaId = novo.categoriaId;
              }
            });
          }
        } else if (vaiParcelar) {
          FC.model.gerarParcelas(novo, de, {
            primeira: primeira,
            valorParcela: modoValor === 'parcela' ? valor : null
          }).forEach(function (p) { st.lancamentos.push(p); });
        } else if (vaiRepetir) {
          var r = novaRecorrente(novo, inFimRep.value || null);
          novo.recorrenteId = r.id;
          st.recorrentes.push(r);
          st.lancamentos.push(novo);
        } else {
          st.lancamentos.push(novo);
        }
      });

      ui.toast(
        editando ? (aplicarSeguintes ? 'Parcela e seguintes atualizadas.' : 'Lançamento atualizado.')
                 : vaiParcelar ? qtdCriada + (qtdCriada === 1 ? ' parcela lançada.' : ' parcelas lançadas.')
                 : vaiRepetir ? 'Lançado e agendado todo mês.'
                 : 'Lançado: ' + fmt.brl(valor),
        'ok'
      );

      if (salvarENovo) {
        inValor.value = '';
        inDesc.value = '';
        inObs.value = '';
        salvarENovo = false;
        inValor.focus();
        if (FC.app) FC.app.redesenhar();
      } else {
        c.fechar();
      }
    }

    return ctrl;
  }

  /* ======================================================================
     PARCELAS QUE FALTAM
     ====================================================================== */
  function lancarParcelasQueFaltam(grupoId) {
    var s = S();
    var novas = FC.model.completarParcelas(s, grupoId);
    if (!novas.length) return ui.toast('Esse parcelamento já está completo.', 'info');
    var p0 = novas[0], pN = novas[novas.length - 1];

    ui.confirmar({
      titulo: 'Lançar as parcelas que faltam',
      texto: '"' + p0.desc + '": ' + novas.length + ' parcelas de ' + fmt.brl(p0.valor) +
             ' (' + p0.parcela.n + '/' + p0.parcela.de + ' a ' + pN.parcela.n + '/' + pN.parcela.de + '), de ' +
             fmt.monthLabel(p0.mes, true) + ' a ' + fmt.monthLabel(pN.mes, true) + '.',
      ok: 'Lançar ' + novas.length
    }).then(function (sim) {
      if (!sim) return;
      FC.store.atualizar(function (st) { novas.forEach(function (l) { st.lancamentos.push(l); }); });
      FC.store.guardarDesfazer('parcelas', function (st) {
        var ids = novas.map(function (l) { return l.id; });
        st.lancamentos = st.lancamentos.filter(function (l) { return ids.indexOf(l.id) < 0; });
      });
      ui.toast(novas.length + ' parcelas lançadas.', 'ok', 6000,
        { texto: 'Desfazer', fn: function () { FC.store.desfazer(); } });
    });
  }

  /** Completa de uma vez todos os parcelamentos em andamento que têm parcelas faltando */
  function completarTodasParcelas() {
    var s = S();
    var grupos = FC.model.parcelasIncompletas(s);
    var novas = [];
    grupos.forEach(function (g) { novas = novas.concat(FC.model.completarParcelas(s, g.grupoId)); });
    if (!novas.length) return ui.toast('Nenhum parcelamento com parcelas faltando.', 'info');

    ui.confirmar({
      titulo: 'Completar ' + grupos.length + ' parcelamentos',
      texto: 'Vou lançar ' + novas.length + ' parcelas nos próximos meses, repetindo o valor da última parcela ' +
             'de cada compra. Total: ' + fmt.brl(fmt.sumBy(novas, function (l) { return l.valor; })) + '.',
      extra: h('div.col', { style: { gap: '4px', fontSize: 'var(--fs-sm)', maxHeight: '220px', overflowY: 'auto' } },
        grupos.map(function (g) {
          return h('div.row.row--between',
            h('span.ellipsis', g.desc + ' · ' + FC.model.nomePessoa(s, g.pessoaId)),
            h('span.dim.nowrap', (g.nMax + 1) + '–' + g.de + '/' + g.de + ' · ' + fmt.brl(g.valorParcela)));
        })),
      ok: 'Lançar ' + novas.length
    }).then(function (sim) {
      if (!sim) return;
      FC.store.atualizar(function (st) { novas.forEach(function (l) { st.lancamentos.push(l); }); });
      FC.store.guardarDesfazer('parcelas', function (st) {
        var ids = novas.map(function (l) { return l.id; });
        st.lancamentos = st.lancamentos.filter(function (l) { return ids.indexOf(l.id) < 0; });
      });
      ui.toast(novas.length + ' parcelas lançadas.', 'ok', 6000,
        { texto: 'Desfazer', fn: function () { FC.store.desfazer(); } });
    });
  }

  /* ======================================================================
     ASSINATURAS (gastos que repetem todo mês)
     ====================================================================== */
  function novaRecorrente(base, fim) {
    return {
      id: fmt.uid('rec'),
      desc: base.desc,
      valor: base.valor,
      pessoaId: base.pessoaId,
      metodo: base.metodo,
      cartaoId: base.metodo === 'credito' ? base.cartaoId : null,
      categoriaId: base.categoriaId,
      dia: parseInt(String(base.data || '').slice(8, 10), 10) || 1,
      inicio: base.mes,
      fim: fim || null,
      ultimoMes: base.mes,      // o mês de `base` já está lançado
      criadoEm: new Date().toISOString()
    };
  }

  /** "Repetir todo mês" a partir de um lançamento existente: ele vira a ocorrência daquele mês */
  function assinaturaDeLancamento(l) {
    var r = novaRecorrente(l, null);
    FC.store.atualizar(function (st) {
      st.recorrentes.push(r);
      st.lancamentos.forEach(function (x) { if (x.id === l.id) x.recorrenteId = r.id; });
      FC.model.materializar(st);
    });
    ui.toast('"' + l.desc + '" agora se repete todo mês.', 'ok', 6000,
      { texto: 'Ajustar', fn: function () { assinatura({ id: r.id }); } });
  }

  /**
   * Criar/editar assinatura.
   * op: { id } para editar; { sugestao } para pré-preencher a partir do histórico.
   */
  function assinatura(op) {
    op = op || {};
    var s = S();
    var orig = op.id ? FC.model.recorrente(s, op.id) : null;
    var base = orig || op.sugestao || {};
    var atual = fmt.thisMonth();

    var dados = {
      pessoaId: base.pessoaId || s.casal.pessoas[0].id,
      metodo: base.metodo || 'credito'
    };

    var inDesc = h('input.input', { type: 'text', value: base.desc || '', placeholder: 'Ex.: Spotify', maxlength: '60', autofocus: !orig });
    var inValor = h('input.input.input--money', { type: 'text', inputmode: 'decimal',
      value: base.valor != null ? fmt.money(base.valor) : '', placeholder: '0,00' });
    var inDia = h('input.input', { type: 'number', min: '1', max: '31', value: String(base.dia || 1) });
    /* começa no mês atual: se o gasto já estiver lançado neste mês, ele é adotado, não duplicado */
    var inicioPadrao = orig ? orig.inicio : atual;
    var inInicio = h('input.input', { type: 'month', value: inicioPadrao, disabled: !!orig });
    var inFim = h('input.input', { type: 'month', value: (orig && orig.fim) || '' });

    var selCategoria = h('select.select',
      h('option', { value: '' }, 'Sem categoria'),
      s.categorias.map(function (c) { return h('option', { value: c.id, selected: c.id === base.categoriaId }, c.nome); }));
    var selCartao = h('select.select',
      s.cartoes.map(function (c) { return h('option', { value: c.id, selected: c.id === base.cartaoId }, c.nome); }));
    if (!base.cartaoId) {
      var doDono = s.cartoes.filter(function (c) { return c.pessoaId === dados.pessoaId; })[0];
      if (doDono) selCartao.value = doDono.id;
    }
    var campoCartao = ui.campo('Cartão', selCartao);

    var segPessoa = ui.segmentado(s.casal.pessoas.map(function (p) { return { id: p.id, nome: p.apelido || p.nome }; }),
      dados.pessoaId, function (v) { dados.pessoaId = v; });
    var segMetodo = ui.segmentado(FC.model.METODOS.map(function (m) { return { id: m.id, nome: m.nome }; }),
      dados.metodo, function (v) { dados.metodo = v; campoCartao.style.display = v === 'credito' ? '' : 'none'; }, 'seg--block');
    campoCartao.style.display = dados.metodo === 'credito' ? '' : 'none';

    var lancadas = orig ? s.lancamentos.filter(function (l) { return l.recorrenteId === orig.id; }).length : 0;

    ui.modal({
      titulo: orig ? 'Editar assinatura' : 'Nova assinatura',
      sub: orig ? (lancadas + ' meses já lançados · desde ' + fmt.monthLabel(orig.inicio, true)) : 'gasto que se repete todo mês',
      corpo: h('div.col', { style: { gap: 'var(--sp-4)' } },
        h('div.fgrid',
          ui.campo('Descrição', inDesc),
          ui.campo('Valor por mês', h('div.input-group', h('span.input-group__prefix', 'R$'), inValor))
        ),
        ui.campo('De quem é', segPessoa),
        ui.campo('Forma de pagamento', segMetodo),
        h('div.fgrid', campoCartao, ui.campo('Categoria', selCategoria)),
        h('div.fgrid.fgrid--3',
          ui.campo('Dia da cobrança', inDia),
          ui.campo('Começa em', inInicio),
          ui.campo('Termina em', inFim, 'vazio = sem fim')
        ),
        h('div.note', ic('info'), h('div',
          'Nos meses futuros a assinatura aparece como prevista e entra na previsão das faturas. ' +
          'Quando o mês chega, vira um lançamento normal, que você pode ajustar só naquele mês. ' +
          (orig ? 'Mudar o valor aqui vale para os meses que ainda não chegaram.' : '')))
      ),
      acoes: function (c) {
        return [
          orig ? h('button.btn.btn--danger-ghost.btn--sm', {
            type: 'button', onclick: function () { c.fechar(); encerrarAssinatura(orig); }
          }, ic('x'), 'Encerrar') : null,
          h('div.grow'),
          h('button.btn', {
            type: 'button',
            onclick: function () {
              var valor = fmt.parseMoney(inValor.value);
              var desc = inDesc.value.trim();
              if (!desc) { ui.toast('Escreva a descrição.', 'err'); return; }
              if (valor == null || valor <= 0) { ui.toast('Informe o valor.', 'err'); return; }
              var inicio = inInicio.value || atual;
              var fim = inFim.value || null;
              if (fim && fim < inicio) { ui.toast('O fim é antes do começo.', 'err'); return; }

              var campos = {
                desc: desc, valor: valor, pessoaId: dados.pessoaId, metodo: dados.metodo,
                cartaoId: dados.metodo === 'credito' ? (selCartao.value || null) : null,
                categoriaId: selCategoria.value || null,
                dia: fmt.clamp(parseInt(inDia.value, 10) || 1, 1, 31), fim: fim
              };

              var criados = 0;
              FC.store.atualizar(function (st) {
                if (orig) {
                  Object.assign(FC.model.recorrente(st, orig.id), campos);
                } else {
                  st.recorrentes.push(Object.assign({ id: fmt.uid('rec'), inicio: inicio, ultimoMes: null,
                    criadoEm: new Date().toISOString() }, campos));
                }
                criados = FC.model.materializar(st);
              });
              c.fechar();
              ui.toast(orig ? 'Assinatura atualizada.'
                : 'Assinatura criada' + (criados ? ' e lançada em ' + criados + (criados === 1 ? ' mês.' : ' meses.') : '.'), 'ok');
            }
          }, ic('check'), 'Salvar')
        ];
      }
    });
  }

  function encerrarAssinatura(r) {
    var atual = fmt.thisMonth();
    var futuros = S().lancamentos.filter(function (l) { return l.recorrenteId === r.id && l.mes > atual; });
    ui.confirmar({
      titulo: 'Encerrar "' + r.desc + '"',
      texto: 'A assinatura para de aparecer a partir de ' + fmt.monthLabel(fmt.addMonths(atual, 1)) +
             '. O que já foi lançado até ' + fmt.monthLabel(atual) + ' continua no histórico.' +
             (futuros.length ? ' ' + futuros.length + ' lançamentos de meses futuros serão removidos.' : ''),
      ok: 'Encerrar', perigo: true
    }).then(function (sim) {
      if (!sim) return;
      FC.store.atualizar(function (st) {
        var alvo = FC.model.recorrente(st, r.id);
        if (alvo && alvo.inicio > atual) {
          st.recorrentes = st.recorrentes.filter(function (x) { return x.id !== r.id; });   // nem começou
        } else if (alvo) {
          alvo.fim = atual;
        }
        st.lancamentos = st.lancamentos.filter(function (l) { return !(l.recorrenteId === r.id && l.mes > atual); });
      });
      ui.toast('Assinatura encerrada.', 'ok');
    });
  }

  /** Lancamento rapido a partir da linha da planilha */
  function lancamentoRapido(op) {
    var valor = fmt.parseMoney(op.valorTexto);
    if (valor == null || valor <= 0) {
      ui.toast('Valor inválido.', 'err');
      return false;
    }
    var desc = String(op.desc || '').trim();
    if (!desc) { ui.toast('Escreva a descrição.', 'err'); return false; }

    var s = S();
    var cartaoId = null;
    if (op.metodo === 'credito') {
      for (var i = 0; i < s.cartoes.length; i++) {
        if (s.cartoes[i].pessoaId === op.pessoaId) { cartaoId = s.cartoes[i].id; break; }
      }
    }

    /* tenta adivinhar a categoria pelo texto, como o bot faz */
    var pal = FC.parser.interpretar(desc + ' ' + valor, FC.sync.contextoParser());
    var categoriaId = pal && pal.categoriaId ? pal.categoriaId : null;

    var novo = {
      id: fmt.uid('lan'),
      tipo: op.tipo || 'gasto',
      data: op.mes === fmt.thisMonth() ? fmt.todayISO() : (op.mes + '-01'),
      mes: op.mes,
      desc: desc,
      valor: valor,
      pessoaId: op.pessoaId,
      metodo: op.metodo,
      cartaoId: cartaoId,
      categoriaId: categoriaId,
      terceiroId: op.terceiroId || null,
      pago: false,
      reembolsado: false,
      parcela: null,
      obs: '',
      origem: 'web',
      criadoEm: new Date().toISOString()
    };

    FC.store.atualizar(function (st) { st.lancamentos.push(novo); });
    return true;
  }

  function apagarLancamento(l) {
    var s = S();
    var irmaos = FC.model.irmaosDaParcela(s, l);

    function remover(ids) {
      var backup = s.lancamentos.filter(function (x) { return ids.indexOf(x.id) >= 0; });
      FC.store.atualizar(function (st) {
        st.lancamentos = st.lancamentos.filter(function (x) { return ids.indexOf(x.id) < 0; });
      });
      FC.store.guardarDesfazer('exclusão', function (st) {
        backup.forEach(function (b) { st.lancamentos.push(b); });
      });
      ui.toast(
        ids.length > 1 ? ids.length + ' parcelas excluídas.' : 'Lançamento excluído.',
        'ok', 6000,
        { texto: 'Desfazer', fn: function () { FC.store.desfazer(); ui.toast('Restaurado.', 'ok'); } }
      );
    }

    if (irmaos.length > 1) {
      ui.modal({
        titulo: 'Excluir parcelamento',
        largura: 'slim',
        corpo: h('div.col',
          h('div', { style: { color: 'var(--text-2)', fontSize: 'var(--fs-md)' } },
            'Este lançamento faz parte de uma compra em ' + irmaos.length + ' parcelas.')
        ),
        acoes: function (c) {
          return [
            h('div.grow'),
            h('button.btn.btn--ghost', { type: 'button', onclick: function () { c.fechar(); remover([l.id]); } },
              'Só esta parcela'),
            h('button.btn.btn--danger', {
              type: 'button',
              onclick: function () {
                c.fechar();
                remover(irmaos.map(function (x) { return x.id; }));
              }
            }, 'Todas as ' + irmaos.length)
          ];
        }
      });
      return;
    }

    ui.confirmar({
      titulo: 'Excluir lançamento',
      texto: '"' + l.desc + '" de ' + fmt.brl(l.valor) + ' será removido.',
      ok: 'Excluir', perigo: true
    }).then(function (sim) { if (sim) remover([l.id]); });
  }

  /* ======================================================================
     PAGAR A FATURA
     ====================================================================== */
  function pagarFatura(op) {
    var s = S();
    var mes = op.mes;
    var pessoaId = op.pessoaId;

    var abertos = s.lancamentos.filter(function (l) {
      return l.mes === mes && l.tipo === 'gasto' && l.metodo === 'credito' &&
             l.pessoaId === pessoaId && !l.pago;
    });

    if (!abertos.length) {
      return ui.toast('Nada em aberto nessa fatura.', 'info');
    }

    var total = fmt.sumBy(abertos, function (l) { return l.valor; });
    var deTerceiros = fmt.sumBy(abertos.filter(function (l) { return l.terceiroId; }), function (l) { return l.valor; });

    var inValorPago = h('input.input.input--money', { type: 'text', value: fmt.money(total) });
    var inDataPg = h('input.input', { type: 'date', value: fmt.todayISO() });
    var lancarSaida = true;

    ui.modal({
      titulo: 'Pagar fatura de ' + fmt.monthLabel(mes),
      sub: FC.model.nomePessoa(s, pessoaId),
      largura: 'slim',
      corpo: h('div.col', { style: { gap: 'var(--sp-4)' } },
        h('dl.dl',
          h('dt', 'Itens em aberto'), h('dd', String(abertos.length)),
          h('dt', 'Total da fatura'), h('dd', fmt.brl(total)),
          deTerceiros > 0 ? h('dt', 'Sendo de terceiros') : null,
          deTerceiros > 0 ? h('dd', { class: 'muted' }, fmt.brl(deTerceiros)) : null
        ),
        h('div.fgrid',
          ui.campo('Valor pago', h('div.input-group', h('span.input-group__prefix', 'R$'), inValorPago)),
          ui.campo('Data do pagamento', inDataPg)
        ),
        ui.interruptor('Lançar a saída do dinheiro da conta', true, function (v) { lancarSaida = v; }),
        h('div.note', ic('info'),
          h('div', 'Os itens da fatura ficam marcados como pagos e deixam de contar como dívida em aberto. ' +
                   'A saída entra como um lançamento único, para não contar o gasto duas vezes.'))
      ),
      acoes: function (c) {
        return [
          h('div.grow'),
          h('button.btn.btn--ghost', { type: 'button', onclick: function () { c.fechar(); } }, 'Cancelar'),
          h('button.btn', {
            type: 'button',
            onclick: function () {
              var valorPg = fmt.parseMoney(inValorPago.value) || total;
              var ids = abertos.map(function (l) { return l.id; });

              FC.store.atualizar(function (st) {
                st.lancamentos.forEach(function (l) {
                  if (ids.indexOf(l.id) >= 0) l.pago = true;
                });
                if (lancarSaida) {
                  st.lancamentos.push({
                    id: fmt.uid('lan'),
                    tipo: 'fatura',
                    data: inDataPg.value || fmt.todayISO(),
                    mes: fmt.monthKey(inDataPg.value || fmt.todayISO()),
                    desc: 'Fatura ' + fmt.monthLabel(mes, true),
                    valor: valorPg,
                    pessoaId: pessoaId,
                    metodo: 'debito',
                    cartaoId: null,
                    categoriaId: null,
                    terceiroId: null,
                    pago: true,
                    reembolsado: false,
                    parcela: null,
                    obs: 'Pagamento da fatura de ' + fmt.monthLabel(mes),
                    origem: 'web',
                    criadoEm: new Date().toISOString()
                  });
                }
              });

              c.fechar();
              ui.toast('Fatura de ' + fmt.monthLabel(mes, true) + ' marcada como paga.', 'ok');
            }
          }, ic('check'), 'Confirmar pagamento')
        ];
      }
    });
  }

  /* ======================================================================
     INVESTIMENTO
     ====================================================================== */
  function investimento(op) {
    op = op || {};
    var s = S();
    var orig = op.id ? FC.model.investimento(s, op.id) : null;

    var dados = orig ? JSON.parse(JSON.stringify(orig)) : {
      id: null, nome: '', tipo: 'Renda fixa', instituicao: '',
      pessoaId: 'casal', cor: 'var(--c1)', obs: ''
    };

    var inNome = h('input.input', { type: 'text', placeholder: 'Ex.: Tesouro Selic 2029', value: dados.nome, autofocus: true });
    var selTipo = h('select.select', FC.seed.TIPOS_INVEST.map(function (t) {
      return h('option', { value: t, selected: t === dados.tipo }, t);
    }));
    var inInst = h('input.input', { type: 'text', placeholder: 'Ex.: Nubank, XP, Banco do Brasil', value: dados.instituicao });

    var selDono = h('select.select',
      h('option', { value: 'casal', selected: dados.pessoaId === 'casal' }, 'Do casal'),
      s.casal.pessoas.map(function (p) {
        return h('option', { value: p.id, selected: p.id === dados.pessoaId }, p.apelido || p.nome);
      })
    );

    var corEscolhida = dados.cor;
    var paleta = h('div.swatches',
      ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)',
       'var(--c7)', 'var(--c8)', 'var(--c9)', 'var(--c10)', 'var(--c11)', 'var(--c12)'].map(function (cor) {
        var b = h('button.swatch', {
          type: 'button', 'aria-pressed': String(cor === corEscolhida), title: 'Cor',
          onclick: function () {
            corEscolhida = cor;
            Array.prototype.forEach.call(paleta.children, function (x) { x.setAttribute('aria-pressed', 'false'); });
            b.setAttribute('aria-pressed', 'true');
          }
        }, h('span.swatch__in', { style: { background: cor } }));
        return b;
      })
    );

    ui.modal({
      titulo: orig ? 'Editar investimento' : 'Novo investimento',
      corpo: h('div.col', { style: { gap: 'var(--sp-4)' } },
        ui.campo('Nome', inNome),
        h('div.fgrid',
          ui.campo('Tipo', selTipo),
          ui.campo('Onde está', inInst)
        ),
        ui.campo('De quem é', selDono),
        ui.campo('Cor no gráfico', paleta),
        orig ? null : h('div.note', ic('info'),
          h('div', 'Depois de criar, registre os aportes e resgates. O saldo é calculado por essas movimentações.'))
      ),
      acoes: function (c) {
        return [
          orig ? h('button.btn.btn--danger-ghost.btn--sm', {
            type: 'button',
            onclick: function () { c.fechar(); apagarInvestimento(orig); }
          }, ic('trash'), 'Excluir') : null,
          h('div.grow'),
          h('button.btn', {
            type: 'button',
            onclick: function () {
              var nome = inNome.value.trim();
              if (!nome) { ui.toast('Dê um nome ao investimento.', 'err'); inNome.focus(); return; }

              var novo = {
                id: dados.id || fmt.uid('inv'),
                nome: nome,
                tipo: selTipo.value,
                instituicao: inInst.value.trim(),
                pessoaId: selDono.value,
                cor: corEscolhida,
                obs: dados.obs || '',
                criadoEm: orig ? orig.criadoEm : new Date().toISOString()
              };

              FC.store.atualizar(function (st) {
                if (orig) {
                  for (var i = 0; i < st.investimentos.length; i++) {
                    if (st.investimentos[i].id === novo.id) { st.investimentos[i] = novo; break; }
                  }
                } else {
                  st.investimentos.push(novo);
                }
              });

              c.fechar();
              ui.toast(orig ? 'Investimento atualizado.' : 'Investimento criado.', 'ok');
              if (!orig && op.aoCriar) op.aoCriar(novo);
            }
          }, ic('check'), 'Salvar')
        ];
      }
    });
  }

  function apagarInvestimento(inv) {
    var s = S();
    var movs = s.movimentos.filter(function (m) { return m.investimentoId === inv.id; });

    ui.confirmar({
      titulo: 'Excluir investimento',
      texto: '"' + inv.nome + '"' +
             (movs.length ? ' e as ' + movs.length + ' movimentações dele' : '') +
             ' serão removidos.',
      ok: 'Excluir', perigo: true
    }).then(function (sim) {
      if (!sim) return;
      var bkInv = JSON.parse(JSON.stringify(inv));
      var bkMov = JSON.parse(JSON.stringify(movs));

      FC.store.atualizar(function (st) {
        st.investimentos = st.investimentos.filter(function (x) { return x.id !== inv.id; });
        st.movimentos = st.movimentos.filter(function (m) { return m.investimentoId !== inv.id; });
      });
      FC.store.guardarDesfazer('exclusão', function (st) {
        st.investimentos.push(bkInv);
        bkMov.forEach(function (m) { st.movimentos.push(m); });
      });
      ui.toast('Investimento excluído.', 'ok', 6000,
        { texto: 'Desfazer', fn: function () { FC.store.desfazer(); } });
    });
  }

  /* ======================================================================
     MOVIMENTACAO DE INVESTIMENTO
     ====================================================================== */
  function movimento(op) {
    op = op || {};
    var s = S();

    if (!s.investimentos.length) {
      return ui.confirmar({
        titulo: 'Nenhum investimento cadastrado',
        texto: 'Antes de registrar um aporte, crie o investimento (nome, tipo e onde está o dinheiro).',
        ok: 'Criar investimento', cancelar: 'Agora não'
      }).then(function (sim) { if (sim) investimento({ aoCriar: function (inv) { movimento({ investimentoId: inv.id }); } }); });
    }

    var orig = null;
    if (op.id) {
      for (var i = 0; i < s.movimentos.length; i++) if (s.movimentos[i].id === op.id) orig = s.movimentos[i];
    }

    var dados = orig ? JSON.parse(JSON.stringify(orig)) : {
      id: null,
      investimentoId: op.investimentoId || s.investimentos[0].id,
      tipo: op.tipo || 'aporte',
      data: fmt.todayISO(),
      valor: null,
      obs: ''
    };

    var selInv = h('select.select', s.investimentos.map(function (inv) {
      return h('option', { value: inv.id, selected: inv.id === dados.investimentoId }, inv.nome);
    }));

    var inValor = h('input.input.input--lg.input--money', {
      type: 'text', inputmode: 'decimal', placeholder: '0,00', autofocus: true,
      value: dados.valor != null ? fmt.money(dados.valor) : ''
    });
    var inData = h('input.input', { type: 'date', value: dados.data });
    var inObs = h('input.input', { type: 'text', placeholder: 'Anotação (opcional)', value: dados.obs || '' });

    var explicacao = h('div.field__hint');
    function explicar() {
      var textos = {
        aporte: 'Sai dinheiro da conta e entra no investimento.',
        resgate: 'Sai do investimento e volta para a conta.',
        rendimento: 'Só o que o investimento rendeu. Não mexe na conta.',
        ajuste: 'Corrige o saldo para bater com o extrato. Aceita valor negativo.'
      };
      explicacao.textContent = textos[dados.tipo] || '';
    }

    var segTipo = ui.segmentado([
      { id: 'aporte', nome: 'Aporte' },
      { id: 'resgate', nome: 'Resgate' },
      { id: 'rendimento', nome: 'Rendimento' },
      { id: 'ajuste', nome: 'Ajuste' }
    ], dados.tipo, function (v) { dados.tipo = v; explicar(); }, 'seg--block');

    explicar();

    ui.modal({
      titulo: orig ? 'Editar movimentação' : 'Movimentar investimento',
      corpo: h('div.col', { style: { gap: 'var(--sp-4)' } },
        ui.campo('O que aconteceu', segTipo, null),
        explicacao,
        ui.campo('Investimento', selInv),
        h('div.fgrid',
          ui.campo('Valor', h('div.input-group', h('span.input-group__prefix', 'R$'), inValor)),
          ui.campo('Data', inData)
        ),
        ui.campo('Observação', inObs)
      ),
      acoes: function (c) {
        return [
          orig ? h('button.btn.btn--danger-ghost.btn--sm', {
            type: 'button',
            onclick: function () {
              c.fechar();
              FC.store.atualizar(function (st) {
                st.movimentos = st.movimentos.filter(function (m) { return m.id !== orig.id; });
              });
              ui.toast('Movimentação excluída.', 'ok');
            }
          }, ic('trash'), 'Excluir') : null,
          h('div.grow'),
          h('button.btn', {
            type: 'button',
            onclick: function () {
              var v = fmt.parseMoney(inValor.value);
              if (v == null || (dados.tipo !== 'ajuste' && v <= 0)) {
                ui.toast('Informe um valor válido.', 'err'); inValor.focus(); return;
              }

              var novo = {
                id: dados.id || fmt.uid('mov'),
                investimentoId: selInv.value,
                tipo: dados.tipo,
                data: inData.value || fmt.todayISO(),
                valor: v,
                obs: inObs.value.trim(),
                origem: 'web',
                criadoEm: orig ? orig.criadoEm : new Date().toISOString()
              };

              FC.store.atualizar(function (st) {
                if (orig) {
                  for (var j = 0; j < st.movimentos.length; j++) {
                    if (st.movimentos[j].id === novo.id) { st.movimentos[j] = novo; break; }
                  }
                } else {
                  st.movimentos.push(novo);
                }
              });

              c.fechar();
              var nomes = { aporte: 'Aporte', resgate: 'Resgate', rendimento: 'Rendimento', ajuste: 'Ajuste' };
              ui.toast(nomes[novo.tipo] + ' de ' + fmt.brl(v) + ' registrado.', 'ok');
            }
          }, ic('check'), 'Salvar')
        ];
      }
    });
  }

  /* ======================================================================
     PESSOA (nome, apelido, foto, cor da aba)
     ====================================================================== */
  function pessoa(op) {
    var s = S();
    var p = FC.model.pessoa(s, op.id);
    if (!p) return;

    var nome = p.nome, apelido = p.apelido || '', foto = p.foto, acento = p.acento;

    var inNome = h('input.input', { type: 'text', value: nome, maxlength: '40', autofocus: true });
    var inApelido = h('input.input', { type: 'text', value: apelido, maxlength: '24', placeholder: 'Como aparece na aba' });

    var paleta = h('div.swatches',
      FC.seed.ACENTOS.map(function (a) {
        var b = h('button.swatch', {
          type: 'button', title: a.nome, 'aria-pressed': String(a.id === acento),
          onclick: function () {
            acento = a.id;
            Array.prototype.forEach.call(paleta.children, function (x) { x.setAttribute('aria-pressed', 'false'); });
            b.setAttribute('aria-pressed', 'true');
          }
        }, h('span.swatch__in', { style: { background: a.cor } }));
        return b;
      })
    );

    ui.modal({
      titulo: 'Aba de ' + (p.apelido || p.nome),
      sub: 'Nome, foto e cor',
      corpo: h('div.col', { style: { gap: 'var(--sp-5)' } },
        botaoFoto(foto, function (v) { foto = v; }),
        h('div.fgrid',
          ui.campo('Nome completo', inNome),
          ui.campo('Apelido', inApelido, 'Fica no lugar do nome na aba')
        ),
        ui.campo('Cor da aba', paleta, 'Ajuda a bater o olho e saber de quem é o painel')
      ),
      acoes: function (c) {
        return [
          h('div.grow'),
          h('button.btn.btn--ghost', { type: 'button', onclick: function () { c.fechar(); } }, 'Cancelar'),
          h('button.btn', {
            type: 'button',
            onclick: function () {
              var n = inNome.value.trim();
              if (!n) { ui.toast('O nome não pode ficar vazio.', 'err'); return; }

              FC.store.atualizar(function (st) {
                var alvo = FC.model.pessoa(st, op.id);
                if (!alvo) return;
                alvo.nome = n;
                alvo.apelido = inApelido.value.trim();
                alvo.foto = foto;
                alvo.acento = acento;
              });
              c.fechar();
              ui.toast('Aba atualizada.', 'ok');
            }
          }, ic('check'), 'Salvar')
        ];
      }
    });
  }

  /* ======================================================================
     CATEGORIA
     ====================================================================== */
  function categoria(op) {
    op = op || {};
    var s = S();
    var orig = op.id ? FC.model.categoria(s, op.id) : null;
    var cor = orig ? orig.cor : 'var(--c1)';

    var inNome = h('input.input', {
      type: 'text', value: orig ? orig.nome : '', maxlength: '28',
      placeholder: 'Ex.: Farmácia', autofocus: true
    });

    var paleta = h('div.swatches',
      ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)',
       'var(--c7)', 'var(--c8)', 'var(--c9)', 'var(--c10)', 'var(--c11)', 'var(--c12)'].map(function (x) {
        var b = h('button.swatch', {
          type: 'button', 'aria-pressed': String(x === cor),
          onclick: function () {
            cor = x;
            Array.prototype.forEach.call(paleta.children, function (o) { o.setAttribute('aria-pressed', 'false'); });
            b.setAttribute('aria-pressed', 'true');
          }
        }, h('span.swatch__in', { style: { background: x } }));
        return b;
      })
    );

    ui.modal({
      titulo: orig ? 'Editar categoria' : 'Nova categoria',
      largura: 'slim',
      corpo: h('div.col', { style: { gap: 'var(--sp-4)' } },
        ui.campo('Nome', inNome),
        ui.campo('Cor', paleta)
      ),
      acoes: function (c) {
        return [
          h('div.grow'),
          h('button.btn', {
            type: 'button',
            onclick: function () {
              var n = inNome.value.trim();
              if (!n) { ui.toast('Escreva o nome.', 'err'); return; }
              FC.store.atualizar(function (st) {
                if (orig) {
                  var alvo = FC.model.categoria(st, orig.id);
                  if (alvo) { alvo.nome = n; alvo.cor = cor; }
                } else {
                  st.categorias.push({ id: fmt.uid('cat'), nome: n, cor: cor, icone: 'tag', arquivada: false });
                }
              });
              c.fechar();
              ui.toast(orig ? 'Categoria atualizada.' : 'Categoria criada.', 'ok');
            }
          }, ic('check'), 'Salvar')
        ];
      }
    });
  }

  /* ======================================================================
     CARTAO
     ====================================================================== */
  function cartao(op) {
    op = op || {};
    var s = S();
    var orig = op.id ? FC.model.cartao(s, op.id) : null;

    var inNome = h('input.input', {
      type: 'text', value: orig ? orig.nome : '', placeholder: 'Ex.: Nubank', maxlength: '28', autofocus: true
    });
    var selDono = h('select.select', s.casal.pessoas.map(function (p) {
      return h('option', { value: p.id, selected: orig && orig.pessoaId === p.id }, p.apelido || p.nome);
    }));
    var inFecha = h('input.input', { type: 'number', min: '1', max: '31', value: orig ? orig.fechamento : 25 });
    var inVence = h('input.input', { type: 'number', min: '1', max: '31', value: orig ? orig.vencimento : 5 });

    ui.modal({
      titulo: orig ? 'Editar cartão' : 'Novo cartão',
      largura: 'slim',
      corpo: h('div.col', { style: { gap: 'var(--sp-4)' } },
        ui.campo('Nome do cartão', inNome),
        ui.campo('Titular', selDono),
        h('div.fgrid',
          ui.campo('Dia do fechamento', inFecha, 'Depois desse dia, cai na fatura seguinte'),
          ui.campo('Dia do vencimento', inVence)
        )
      ),
      acoes: function (c) {
        return [
          orig ? h('button.btn.btn--danger-ghost.btn--sm', {
            type: 'button',
            onclick: function () {
              c.fechar();
              FC.store.atualizar(function (st) {
                st.cartoes = st.cartoes.filter(function (x) { return x.id !== orig.id; });
              });
              ui.toast('Cartão removido.', 'ok');
            }
          }, ic('trash'), 'Excluir') : null,
          h('div.grow'),
          h('button.btn', {
            type: 'button',
            onclick: function () {
              var n = inNome.value.trim();
              if (!n) { ui.toast('Escreva o nome do cartão.', 'err'); return; }
              FC.store.atualizar(function (st) {
                if (orig) {
                  var alvo = FC.model.cartao(st, orig.id);
                  if (alvo) {
                    alvo.nome = n;
                    alvo.pessoaId = selDono.value;
                    alvo.fechamento = fmt.clamp(parseInt(inFecha.value, 10) || 25, 1, 31);
                    alvo.vencimento = fmt.clamp(parseInt(inVence.value, 10) || 5, 1, 31);
                  }
                } else {
                  st.cartoes.push({
                    id: fmt.uid('card'), nome: n, pessoaId: selDono.value,
                    fechamento: fmt.clamp(parseInt(inFecha.value, 10) || 25, 1, 31),
                    vencimento: fmt.clamp(parseInt(inVence.value, 10) || 5, 1, 31),
                    cor: 'var(--c3)'
                  });
                }
              });
              c.fechar();
              ui.toast('Cartão salvo.', 'ok');
            }
          }, ic('check'), 'Salvar')
        ];
      }
    });
  }

  /* ======================================================================
     TERCEIRO (quem pegou o cartao emprestado)
     ====================================================================== */
  function terceiro(op) {
    op = op || {};
    var s = S();
    var orig = op.id ? FC.model.terceiro(s, op.id) : null;

    var inNome = h('input.input', {
      type: 'text', value: orig ? orig.nome : '', placeholder: 'Ex.: Pai, Julia, Tio Beto',
      maxlength: '28', autofocus: true
    });
    var inObs = h('input.input', {
      type: 'text', value: orig ? (orig.obs || '') : '', placeholder: 'Anotação (opcional)', maxlength: '60'
    });

    ui.modal({
      titulo: orig ? 'Editar pessoa' : 'Quem usou o cartão',
      largura: 'slim',
      corpo: h('div.col', { style: { gap: 'var(--sp-4)' } },
        ui.campo('Nome', inNome),
        ui.campo('Observação', inObs),
        h('div.note', ic('info'),
          h('div', 'Gastos marcados com esta pessoa entram na fatura, mas ficam fora dos seus gastos ' +
                   'e aparecem como "a receber" até você marcar que foi acertado.'))
      ),
      acoes: function (c) {
        return [
          orig ? h('button.btn.btn--danger-ghost.btn--sm', {
            type: 'button',
            onclick: function () {
              c.fechar();
              var usados = s.lancamentos.filter(function (l) { return l.terceiroId === orig.id; }).length;
              ui.confirmar({
                titulo: 'Excluir ' + orig.nome,
                texto: usados
                  ? 'Existem ' + usados + ' lançamentos com esta pessoa. Eles voltam a contar como gasto de vocês.'
                  : 'Esta pessoa será removida da lista.',
                ok: 'Excluir', perigo: true
              }).then(function (sim) {
                if (!sim) return;
                FC.store.atualizar(function (st) {
                  st.terceiros = st.terceiros.filter(function (x) { return x.id !== orig.id; });
                  st.lancamentos.forEach(function (l) { if (l.terceiroId === orig.id) l.terceiroId = null; });
                });
                ui.toast('Removido.', 'ok');
              });
            }
          }, ic('trash'), 'Excluir') : null,
          h('div.grow'),
          h('button.btn', {
            type: 'button',
            onclick: function () {
              var n = inNome.value.trim();
              if (!n) { ui.toast('Escreva o nome.', 'err'); return; }
              var novo = { id: orig ? orig.id : fmt.uid('ter'), nome: n, obs: inObs.value.trim() };

              FC.store.atualizar(function (st) {
                if (orig) {
                  for (var i = 0; i < st.terceiros.length; i++) {
                    if (st.terceiros[i].id === novo.id) st.terceiros[i] = novo;
                  }
                } else {
                  st.terceiros.push(novo);
                }
              });
              c.fechar();
              ui.toast('Salvo.', 'ok');
              if (op.aoSalvar) op.aoSalvar(novo);
            }
          }, ic('check'), 'Salvar')
        ];
      }
    });
  }

  /* ======================================================================
     SALDO EM CONTA (ponto de partida do patrimonio)
     ====================================================================== */
  function saldoConta(op) {
    var s = S();
    var conta = null;
    for (var i = 0; i < s.contas.length; i++) if (s.contas[i].id === op.id) conta = s.contas[i];
    if (!conta) return;

    var inNome = h('input.input', { type: 'text', value: conta.nome, maxlength: '32' });
    var inSaldo = h('input.input.input--money', { type: 'text', value: fmt.money(conta.saldoInicial || 0) });
    var inDesde = h('input.input', { type: 'date', value: conta.desde });

    ui.modal({
      titulo: 'Saldo da conta',
      largura: 'slim',
      corpo: h('div.col', { style: { gap: 'var(--sp-4)' } },
        ui.campo('Nome da conta', inNome),
        h('div.fgrid',
          ui.campo('Saldo nessa data', h('div.input-group', h('span.input-group__prefix', 'R$'), inSaldo)),
          ui.campo('Data', inDesde)
        ),
        h('div.note', ic('info'),
          h('div', 'Informe quanto havia na conta em uma data. A partir dela, o app soma as entradas ' +
                   'e desconta o que saiu, para chegar ao saldo de hoje.'))
      ),
      acoes: function (c) {
        return [
          h('div.grow'),
          h('button.btn', {
            type: 'button',
            onclick: function () {
              FC.store.atualizar(function (st) {
                for (var j = 0; j < st.contas.length; j++) {
                  if (st.contas[j].id === op.id) {
                    st.contas[j].nome = inNome.value.trim() || st.contas[j].nome;
                    st.contas[j].saldoInicial = fmt.parseMoney(inSaldo.value) || 0;
                    st.contas[j].desde = inDesde.value || st.contas[j].desde;
                  }
                }
              });
              c.fechar();
              ui.toast('Saldo atualizado.', 'ok');
            }
          }, ic('check'), 'Salvar')
        ];
      }
    });
  }

  FC.forms = {
    lancamento: lancamento,
    lancamentoRapido: lancamentoRapido,
    lancarParcelasQueFaltam: lancarParcelasQueFaltam,
    completarTodasParcelas: completarTodasParcelas,
    assinatura: assinatura,
    assinaturaDeLancamento: assinaturaDeLancamento,
    encerrarAssinatura: encerrarAssinatura,
    apagarLancamento: apagarLancamento,
    pagarFatura: pagarFatura,
    investimento: investimento,
    movimento: movimento,
    pessoa: pessoa,
    categoria: categoria,
    cartao: cartao,
    terceiro: terceiro,
    saldoConta: saldoConta,
    lerFoto: lerFoto,
    botaoFoto: botaoFoto
  };
})(typeof self !== 'undefined' ? self : this);
