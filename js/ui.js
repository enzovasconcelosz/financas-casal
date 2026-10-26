/* ==========================================================================
   ui.js — pecas de interface reaproveitadas: avisos, modais, menus
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var d = FC.dom, h = d.h, ic = d.ic;

  /* ---------------------------- AVISOS (toast) ---------------------------- */

  function toast(msg, tipo, ms, acao) {
    var raiz = d.$('#toastRoot');
    if (!raiz) return;

    var icones = { ok: 'check', err: 'alert', info: 'info' };
    var t = tipo || 'info';

    var el = h('div.toast.toast--' + t,
      ic(icones[t] || 'info', 'toast__ico'),
      h('div.grow', msg),
      acao ? h('button.toast__act', {
        onclick: function () { fechar(); acao.fn(); }
      }, acao.texto) : null
    );

    function fechar() {
      el.classList.add('is-out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }

    raiz.appendChild(el);
    var tempo = ms || (acao ? 6500 : 3200);
    var timer = setTimeout(fechar, tempo);
    el.addEventListener('mouseenter', function () { clearTimeout(timer); });
    el.addEventListener('mouseleave', function () { timer = setTimeout(fechar, 1600); });
    return fechar;
  }

  /* ---------------------------- MODAL ---------------------------- */

  var pilhaModais = [];

  /**
   * modal({titulo, sub, corpo, acoes, largura:'slim'|'wide', aoFechar})
   * `corpo` e um No ou funcao que recebe o controlador.
   */
  function modal(op) {
    op = op || {};
    var raiz = d.$('#modalRoot');
    var focoAnterior = document.activeElement;

    var ctrl = { fechar: fechar, el: null, corpoEl: null, rodapeEl: null };

    var corpo = typeof op.corpo === 'function' ? op.corpo(ctrl) : op.corpo;

    var corpoEl = h('div.modal__body', corpo);
    var rodapeEl = op.acoes ? h('div.modal__foot', op.acoes(ctrl)) : null;

    var cx = h('div.modal' + (op.largura === 'wide' ? '.modal--wide' : (op.largura === 'slim' ? '.modal--slim' : '')),
      { role: 'dialog', 'aria-modal': 'true', 'aria-label': op.titulo || 'Janela' },
      h('div.modal__grab'),
      h('div.modal__head',
        h('div.grow',
          h('h2.modal__title', op.titulo || ''),
          op.sub ? h('div.modal__sub', op.sub) : null
        ),
        h('button.modal__close', { type: 'button', 'aria-label': 'Fechar', onclick: fechar }, ic('x'))
      ),
      corpoEl,
      rodapeEl
    );

    ctrl.el = cx;
    ctrl.corpoEl = corpoEl;
    ctrl.rodapeEl = rodapeEl;

    var scrim = h('div.modal-scrim', {
      onclick: function (e) { if (e.target === scrim && op.fecharNoFundo !== false) fechar(); }
    }, cx);

    function aoTeclar(e) {
      if (e.key === 'Escape') { e.stopPropagation(); fechar(); return; }
      if (e.key === 'Tab') prenderFoco(e, cx);
    }

    function fechar(resultado) {
      document.removeEventListener('keydown', aoTeclar, true);
      if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
      var i = pilhaModais.indexOf(ctrl);
      if (i >= 0) pilhaModais.splice(i, 1);
      if (!pilhaModais.length) document.body.style.overflow = '';
      if (focoAnterior && focoAnterior.focus) { try { focoAnterior.focus(); } catch (e) {} }
      if (op.aoFechar) op.aoFechar(resultado);
    }

    raiz.appendChild(scrim);
    pilhaModais.push(ctrl);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', aoTeclar, true);

    setTimeout(function () {
      var alvo = cx.querySelector('[autofocus]') ||
                 cx.querySelector('input:not([type=hidden]), select, textarea, button');
      if (alvo && alvo.focus) alvo.focus();
    }, 60);

    return ctrl;
  }

  function prenderFoco(e, cx) {
    var focaveis = cx.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focaveis.length) return;
    var primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  }

  /** Pergunta sim/nao. Devolve Promise<boolean>. */
  function confirmar(op) {
    op = op || {};
    return new Promise(function (resolve) {
      var respondido = false;
      var ctrl = modal({
        titulo: op.titulo || 'Confirmar',
        largura: 'slim',
        corpo: h('div.col',
          op.perigo ? h('div.note.note--danger', ic('alert'), h('div', op.texto || '')) :
                      h('div', { style: { fontSize: 'var(--fs-md)', color: 'var(--text-2)', lineHeight: '1.6' } }, op.texto || ''),
          op.extra || null
        ),
        acoes: function (c) {
          return [
            h('div.grow'),
            h('button.btn.btn--ghost', {
              type: 'button',
              onclick: function () { respondido = true; c.fechar(); resolve(false); }
            }, op.cancelar || 'Cancelar'),
            h('button.btn' + (op.perigo ? '.btn--danger' : ''), {
              type: 'button', autofocus: true,
              onclick: function () { respondido = true; c.fechar(); resolve(true); }
            }, op.ok || 'Confirmar')
          ];
        },
        aoFechar: function () { if (!respondido) resolve(false); }
      });
      return ctrl;
    });
  }

  /* ---------------------------- MENU SUSPENSO ---------------------------- */

  function menu(ancora, itens) {
    var existente = d.$('.menu-pop');
    if (existente && existente.parentNode) existente.parentNode.removeChild(existente);

    var pop = h('div.menu-pop', { role: 'menu' },
      itens.map(function (it) {
        if (it.divisor) return h('div.menu-pop__hr');
        return h('button.menu-pop__i' + (it.perigo ? '.is-danger' : ''), {
          type: 'button', role: 'menuitem',
          onclick: function () { fechar(); it.fn && it.fn(); }
        }, it.icone ? ic(it.icone) : null, h('span', it.texto));
      })
    );

    function fechar() {
      document.removeEventListener('click', foraDaquela, true);
      document.removeEventListener('keydown', esc, true);
      if (pop.parentNode) pop.parentNode.removeChild(pop);
    }
    function foraDaquela(e) { if (!pop.contains(e.target) && e.target !== ancora) fechar(); }
    function esc(e) { if (e.key === 'Escape') fechar(); }

    document.body.appendChild(pop);
    var r = ancora.getBoundingClientRect();
    var larg = pop.offsetWidth || 190;
    var esq = Math.min(r.left, root.innerWidth - larg - 10);
    var topo = r.bottom + 6;
    if (topo + pop.offsetHeight > root.innerHeight - 10) topo = r.top - pop.offsetHeight - 6;
    pop.style.left = Math.max(8, esq) + 'px';
    pop.style.top = Math.max(8, topo) + 'px';

    setTimeout(function () {
      document.addEventListener('click', foraDaquela, true);
      document.addEventListener('keydown', esc, true);
    }, 0);
    return fechar;
  }

  /* ---------------------------- PECAS PRONTAS ---------------------------- */

  /** Cartao de indicador */
  function kpi(op) {
    return h('div.kpi', { style: op.cor ? { '--kpi-color': op.cor } : null },
      h('div.kpi__label', op.icone ? ic(op.icone) : null, h('span', op.rotulo)),
      h('div.kpi__value' + (op.pequeno ? '.kpi__value--sm' : ''),
        { class: op.classeValor || '' }, op.valor),
      op.rodape ? h('div.kpi__foot', op.rodape) : null,
      op.spark || null
    );
  }

  /** Selo de variacao (+12,3%) */
  function delta(v) {
    if (v == null || v.pct == null) return h('span.delta.delta--flat', '—');
    var cls = v.dir === 'up' ? 'delta--up' : (v.dir === 'down' ? 'delta--down' : 'delta--flat');
    var seta = v.dir === 'up' ? 'arrowUp' : (v.dir === 'down' ? 'arrowDown' : 'minus');
    var txt = (v.pct > 0 ? '+' : '') + FC.fmt.pct(v.pct, 1);
    return h('span.delta.' + cls, ic(seta), h('span', txt));
  }

  /** Estado vazio */
  function vazio(op) {
    return h('div.empty',
      ic(op.icone || 'inbox', 'empty__ico'),
      h('div.empty__title', op.titulo || 'Nada por aqui ainda'),
      op.texto ? h('p.empty__txt', op.texto) : null,
      op.acao || null
    );
  }

  /** Campo de formulario */
  function campo(rotulo, controle, dica, erro) {
    return h('label.field',
      h('span.field__label', rotulo),
      controle,
      dica ? h('span.field__hint', dica) : null,
      erro ? h('span.field__err', erro) : null
    );
  }

  /** Controle segmentado */
  function segmentado(opcoes, valor, aoMudar, classe) {
    var el = h('div.seg' + (classe ? '.' + classe : ''));
    opcoes.forEach(function (o) {
      var b = h('button.seg__item', {
        type: 'button',
        'aria-pressed': String(o.id === valor),
        onclick: function () {
          Array.prototype.forEach.call(el.children, function (c) { c.setAttribute('aria-pressed', 'false'); });
          b.setAttribute('aria-pressed', 'true');
          aoMudar(o.id);
        }
      }, o.icone ? ic(o.icone) : null, h('span', o.nome));
      el.appendChild(b);
    });
    return el;
  }

  /** Interruptor liga/desliga */
  function interruptor(rotulo, ligado, aoMudar) {
    var inp = h('input', {
      type: 'checkbox', checked: !!ligado,
      onchange: function () { aoMudar(inp.checked); }
    });
    return h('label.switch', inp, h('span.switch__track'), h('span.switch__text', rotulo));
  }

  /** Avatar da pessoa (foto ou iniciais) */
  function avatar(pessoa, tamanho) {
    var cls = 'avatar' + (tamanho ? '.avatar--' + tamanho : '');
    var cor = corDoAcento(pessoa.acento);
    if (pessoa.foto) {
      return h('div.' + cls, { style: { boxShadow: '0 0 0 2px var(--surface), 0 0 0 3.5px ' + cor } },
        h('img', { src: pessoa.foto, alt: pessoa.nome, loading: 'lazy' }));
    }
    return h('div.' + cls, { style: { boxShadow: '0 0 0 2px var(--surface), 0 0 0 3.5px ' + cor, color: cor } },
      FC.fmt.initials(pessoa.nome));
  }

  function corDoAcento(id) {
    var lista = FC.seed.ACENTOS;
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i].cor;
    return lista[0].cor;
  }

  /** Barra de progresso simples */
  function barra(pct, cor, grossa) {
    return h('div.bar' + (grossa ? '.bar--thick' : ''),
      h('div.bar__fill', { style: { width: FC.fmt.clamp(pct, 0, 100) + '%', background: cor || 'var(--accent)' } })
    );
  }

  /** Marcador de conferido (o check da planilha) */
  function check(marcado, aoMudar, titulo) {
    var b = h('button.check', {
      type: 'button', role: 'checkbox',
      'aria-checked': String(!!marcado),
      title: titulo || 'Marcar como pago',
      onclick: function (e) {
        e.stopPropagation();
        var novo = b.getAttribute('aria-checked') !== 'true';
        b.setAttribute('aria-checked', String(novo));
        aoMudar(novo);
      }
    }, ic('check'));
    return b;
  }

  FC.ui = {
    toast: toast, modal: modal, confirmar: confirmar, menu: menu,
    kpi: kpi, delta: delta, vazio: vazio, campo: campo,
    segmentado: segmentado, interruptor: interruptor,
    avatar: avatar, corDoAcento: corDoAcento, barra: barra, check: check
  };
})(typeof self !== 'undefined' ? self : this);
