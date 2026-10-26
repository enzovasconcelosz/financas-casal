/* ==========================================================================
   charts.js — graficos em SVG, sem biblioteca externa

   Todos devolvem um elemento .chart pronto para inserir na tela.
   O SVG usa viewBox, entao acompanha a largura do container.
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var d = FC.dom, h = d.h, fmt = FC.fmt;
  var NS = d.SVG_NS;

  function svgEl(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    return el;
  }

  /** escala linear */
  function escala(dmin, dmax, rmin, rmax) {
    var span = dmax - dmin;
    if (!span) span = 1;
    return function (v) { return rmin + ((v - dmin) / span) * (rmax - rmin); };
  }

  /** escolhe uma "altura redonda" para o topo do eixo */
  function tetoBonito(v) {
    if (v <= 0) return 100;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / mag;
    var passo = n <= 1 ? 1 : (n <= 2 ? 2 : (n <= 2.5 ? 2.5 : (n <= 5 ? 5 : 10)));
    return passo * mag;
  }

  function marcasY(min, max, qtd) {
    var out = [];
    for (var i = 0; i <= qtd; i++) out.push(min + ((max - min) * i) / qtd);
    return out;
  }

  /** curva suave (catmull-rom -> bezier) */
  function caminhoSuave(pts, tensao) {
    if (pts.length < 2) return pts.length ? 'M' + pts[0][0] + ',' + pts[0][1] : '';
    var t = tensao == null ? 0.32 : tensao;
    var dd = 'M' + pts[0][0] + ',' + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i];
      var p1 = pts[i], p2 = pts[i + 1];
      var p3 = pts[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) * t / 3;
      var c1y = p1[1] + (p2[1] - p0[1]) * t / 3;
      var c2x = p2[0] - (p3[0] - p1[0]) * t / 3;
      var c2y = p2[1] - (p3[1] - p1[1]) * t / 3;
      dd += 'C' + c1x + ',' + c1y + ' ' + c2x + ',' + c2y + ' ' + p2[0] + ',' + p2[1];
    }
    return dd;
  }

  /** retangulo com cantos de cima arredondados */
  function barraPath(x, y, w, alt, raio) {
    var r = Math.min(raio, w / 2, Math.abs(alt));
    if (alt <= 0.5) return '';
    return 'M' + x + ',' + (y + alt) +
           'L' + x + ',' + (y + r) +
           'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
           'L' + (x + w - r) + ',' + y +
           'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
           'L' + (x + w) + ',' + (y + alt) + 'Z';
  }

  var idGrad = 0;

  /* ======================================================================
     GRAFICO DE AREA / LINHA
     op = { series:[{nome, cor, dados:[n], tipo:'area'|'linha'|'tracejada'}],
            rotulos:[str], altura, formatar, minZero }
     ====================================================================== */
  function area(op) {
    var W = 720, H = op.altura || 260;
    var mT = 14, mR = 8, mB = 26, mL = 46;
    var series = op.series || [];
    var rotulos = op.rotulos || [];
    var n = rotulos.length;
    var formatar = op.formatar || fmt.brl;

    var wrap = h('div.chart');
    if (!n || !series.length) return h('div.chart', FC.ui.vazio({ titulo: 'Sem dados no período', icone: 'chart' }));

    var todos = [];
    series.forEach(function (s) { s.dados.forEach(function (v) { todos.push(Number(v) || 0); }); });
    var vMax = Math.max.apply(null, todos);
    var vMin = Math.min.apply(null, todos);
    if (op.minZero !== false && vMin > 0) vMin = 0;
    if (vMax === vMin) vMax = vMin + 1;

    var topo = vMax > 0 ? tetoBonito(vMax * 1.08) : 0;
    var base = vMin < 0 ? -tetoBonito(Math.abs(vMin) * 1.08) : 0;
    if (topo === base) topo = base + 100;

    var x = escala(0, Math.max(1, n - 1), mL, W - mR);
    var y = escala(base, topo, H - mB, mT);

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', role: 'img' });
    svg.setAttribute('aria-label', op.descricao || 'Gráfico de evolução');

    /* grade + eixo Y */
    var gGrade = svgEl('g', { class: 'chart__grid' });
    var gEixo = svgEl('g', { class: 'chart__axis' });
    marcasY(base, topo, 4).forEach(function (v) {
      var yy = y(v);
      gGrade.appendChild(svgEl('line', { x1: mL, y1: yy, x2: W - mR, y2: yy }));
      var t = svgEl('text', { x: mL - 7, y: yy + 3.5, 'text-anchor': 'end' });
      t.textContent = fmt.numShort(v);
      gEixo.appendChild(t);
    });
    svg.appendChild(gGrade);

    if (base < 0) {
      svg.appendChild(svgEl('line', { class: 'chart__zero', x1: mL, y1: y(0), x2: W - mR, y2: y(0) }));
    }

    /* series */
    series.forEach(function (s, si) {
      var pts = s.dados.map(function (v, i) { return [x(i), y(Number(v) || 0)]; });
      var dLinha = n === 1 ? null : caminhoSuave(pts);

      if (s.tipo !== 'linha' && s.tipo !== 'tracejada' && dLinha) {
        var gid = 'g' + (++idGrad);
        var defs = svgEl('defs');
        var lg = svgEl('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' });
        lg.appendChild(svgEl('stop', { offset: '0%', 'stop-color': s.cor, 'stop-opacity': '.34' }));
        lg.appendChild(svgEl('stop', { offset: '100%', 'stop-color': s.cor, 'stop-opacity': '.02' }));
        defs.appendChild(lg);
        svg.appendChild(defs);

        var dArea = dLinha + 'L' + pts[pts.length - 1][0] + ',' + y(Math.max(base, 0)) +
                    'L' + pts[0][0] + ',' + y(Math.max(base, 0)) + 'Z';
        svg.appendChild(svgEl('path', { class: 'chart__area', d: dArea, fill: 'url(#' + gid + ')' }));
      }

      if (dLinha) {
        svg.appendChild(svgEl('path', {
          class: 'chart__line' + (s.tipo === 'tracejada' ? ' chart__line--dash' : ''),
          d: dLinha, stroke: s.cor
        }));
      } else {
        svg.appendChild(svgEl('circle', { cx: pts[0][0], cy: pts[0][1], r: 4, fill: s.cor }));
      }
    });

    /* eixo X */
    var passo = Math.max(1, Math.ceil(n / 8));
    rotulos.forEach(function (r, i) {
      if (i % passo !== 0 && i !== n - 1) return;
      var t = svgEl('text', { x: x(i), y: H - 8, 'text-anchor': 'middle' });
      t.textContent = r;
      gEixo.appendChild(t);
    });
    svg.appendChild(gEixo);

    /* interacao */
    var cursor = svgEl('line', { class: 'chart__cursor', y1: mT, y2: H - mB, opacity: 0 });
    svg.appendChild(cursor);
    var pontos = series.map(function (s) {
      var c = svgEl('circle', { class: 'chart__dot', r: 4.5, fill: s.cor, opacity: 0 });
      svg.appendChild(c);
      return c;
    });

    var tip = h('div.chart__tip');
    wrap.appendChild(svg);
    wrap.appendChild(tip);

    function aoMover(e) {
      var r = svg.getBoundingClientRect();
      var px = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width * W;
      var i = Math.round((px - mL) / ((W - mR - mL) / Math.max(1, n - 1)));
      i = fmt.clamp(i, 0, n - 1);

      cursor.setAttribute('x1', x(i));
      cursor.setAttribute('x2', x(i));
      cursor.setAttribute('opacity', 1);

      var linhas = [];
      series.forEach(function (s, si) {
        var v = Number(s.dados[i]) || 0;
        pontos[si].setAttribute('cx', x(i));
        pontos[si].setAttribute('cy', y(v));
        pontos[si].setAttribute('opacity', 1);
        linhas.push(h('div.chart__tip__r',
          h('span.chart__tip__k', h('span.chart__tip__sw', { style: { background: s.cor } }), s.nome),
          h('span.chart__tip__v', formatar(v))
        ));
      });

      d.mount(tip, h('div', h('div.chart__tip__t', rotulos[i]), linhas));
      tip.classList.add('is-on');
      tip.style.left = fmt.clamp((x(i) / W) * 100, 12, 88) + '%';
      tip.style.top = (y(Number(series[0].dados[i]) || 0) / H) * 100 + '%';
    }

    function aoSair() {
      cursor.setAttribute('opacity', 0);
      pontos.forEach(function (p) { p.setAttribute('opacity', 0); });
      tip.classList.remove('is-on');
    }

    svg.addEventListener('mousemove', aoMover);
    svg.addEventListener('mouseleave', aoSair);
    svg.addEventListener('touchstart', aoMover, { passive: true });
    svg.addEventListener('touchmove', aoMover, { passive: true });
    svg.addEventListener('touchend', aoSair);

    if (op.legenda !== false && series.length > 1) {
      wrap.appendChild(legenda(series));
    }
    return wrap;
  }

  /* ======================================================================
     BARRAS (agrupadas) + linha opcional
     op = { grupos:[{rotulo, valores:[n]}], series:[{nome,cor}],
            linha:{nome,cor,dados:[]}, altura, formatar }
     ====================================================================== */
  function barras(op) {
    var W = 720, H = op.altura || 260;
    var mT = 14, mR = 8, mB = 26, mL = 46;
    var grupos = op.grupos || [];
    var series = op.series || [];
    var formatar = op.formatar || fmt.brl;

    if (!grupos.length) return h('div.chart', FC.ui.vazio({ titulo: 'Sem dados no período', icone: 'chart' }));

    /* empilhado: uma barra por grupo, com as séries uma sobre a outra (só positivos) */
    var empilhado = !!op.empilhado;

    var todos = [];
    grupos.forEach(function (g) {
      if (empilhado) todos.push(g.valores.reduce(function (t, v) { return t + Math.max(0, Number(v) || 0); }, 0));
      else g.valores.forEach(function (v) { todos.push(Number(v) || 0); });
    });
    if (op.linha) op.linha.dados.forEach(function (v) { todos.push(Number(v) || 0); });

    var vMax = Math.max.apply(null, todos.concat([0]));
    var vMin = Math.min.apply(null, todos.concat([0]));
    var topo = tetoBonito(vMax * 1.12) || 100;
    var base = vMin < 0 ? -tetoBonito(Math.abs(vMin) * 1.12) : 0;

    var y = escala(base, topo, H - mB, mT);
    var larguraGrupo = (W - mL - mR) / grupos.length;
    var pad = Math.min(10, larguraGrupo * 0.18);
    /* com poucos grupos a barra fica larga demais: limita a 64px por série */
    var porGrupo = empilhado ? 1 : Math.max(1, series.length);
    var larguraBarra = fmt.clamp((larguraGrupo - pad * 2) / porGrupo - 2, 3, 64);
    var larguraCacho = larguraBarra * porGrupo + 2 * (porGrupo - 1);
    var recuo = Math.max(pad, (larguraGrupo - larguraCacho) / 2);

    var wrap = h('div.chart');
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', role: 'img' });
    svg.setAttribute('aria-label', op.descricao || 'Gráfico de barras');

    var gGrade = svgEl('g', { class: 'chart__grid' });
    var gEixo = svgEl('g', { class: 'chart__axis' });
    marcasY(base, topo, 4).forEach(function (v) {
      var yy = y(v);
      gGrade.appendChild(svgEl('line', { x1: mL, y1: yy, x2: W - mR, y2: yy }));
      var t = svgEl('text', { x: mL - 7, y: yy + 3.5, 'text-anchor': 'end' });
      t.textContent = fmt.numShort(v);
      gEixo.appendChild(t);
    });
    svg.appendChild(gGrade);
    if (base < 0) svg.appendChild(svgEl('line', { class: 'chart__zero', x1: mL, y1: y(0), x2: W - mR, y2: y(0) }));

    var tip = h('div.chart__tip');

    grupos.forEach(function (g, gi) {
      var x0 = mL + gi * larguraGrupo + recuo;
      var gg = svgEl('g');

      if (empilhado) {
        var acumulado = 0;
        var ultimaSerie = -1;
        g.valores.forEach(function (v, si) { if ((Number(v) || 0) > 0) ultimaSerie = si; });
        g.valores.forEach(function (v, si) {
          var val = Math.max(0, Number(v) || 0);
          if (!val) return;
          var yBase = y(acumulado), yTopoSeg = y(acumulado + val);
          acumulado += val;
          /* só o segmento de cima tem cantos arredondados */
          var dSeg = si === ultimaSerie
            ? barraPath(x0, yTopoSeg, larguraBarra, yBase - yTopoSeg, 3.5)
            : 'M' + x0 + ',' + yBase + 'V' + yTopoSeg + 'H' + (x0 + larguraBarra) + 'V' + yBase + 'Z';
          gg.appendChild(svgEl('path', {
            class: 'chart__bar', d: dSeg,
            fill: (series[si] && series[si].cor) || 'var(--accent)'
          }));
        });
      } else {
        g.valores.forEach(function (v, si) {
          var val = Number(v) || 0;
          var xx = x0 + si * (larguraBarra + 2);
          var yTopo = val >= 0 ? y(val) : y(0);
          var alt = Math.abs(y(val) - y(0));
          var p = svgEl('path', {
            class: 'chart__bar',
            d: barraPath(xx, yTopo, larguraBarra, alt, 3.5),
            fill: (series[si] && series[si].cor) || 'var(--accent)'
          });
          gg.appendChild(p);
        });
      }

      /* area sensivel ao mouse cobrindo o grupo todo */
      var alvo = svgEl('rect', {
        x: mL + gi * larguraGrupo, y: mT,
        width: larguraGrupo, height: H - mB - mT,
        fill: 'transparent', style: 'cursor:default'
      });
      alvo.addEventListener('mouseenter', function () {
        var linhas = g.valores.map(function (v, si) {
          return h('div.chart__tip__r',
            h('span.chart__tip__k',
              h('span.chart__tip__sw', { style: { background: (series[si] && series[si].cor) || 'var(--accent)' } }),
              (series[si] && series[si].nome) || ''),
            h('span.chart__tip__v', formatar(Number(v) || 0))
          );
        });
        if (empilhado) {
          linhas.push(h('div.chart__tip__r', { style: { borderTop: '1px solid var(--line)', marginTop: '3px', paddingTop: '3px' } },
            h('span.chart__tip__k', 'Total'),
            h('span.chart__tip__v', formatar(g.valores.reduce(function (t, v) { return t + (Number(v) || 0); }, 0)))
          ));
        }
        if (op.linha) {
          linhas.push(h('div.chart__tip__r',
            h('span.chart__tip__k', h('span.chart__tip__sw', { style: { background: op.linha.cor } }), op.linha.nome),
            h('span.chart__tip__v', formatar(Number(op.linha.dados[gi]) || 0))
          ));
        }
        d.mount(tip, h('div', h('div.chart__tip__t', g.rotulo), linhas));
        tip.classList.add('is-on');
        tip.style.left = fmt.clamp(((mL + gi * larguraGrupo + larguraGrupo / 2) / W) * 100, 14, 86) + '%';
        tip.style.top = '18%';
      });
      alvo.addEventListener('mouseleave', function () { tip.classList.remove('is-on'); });
      gg.appendChild(alvo);
      svg.appendChild(gg);

      var t = svgEl('text', { x: mL + gi * larguraGrupo + larguraGrupo / 2, y: H - 8, 'text-anchor': 'middle' });
      t.textContent = g.rotulo;
      gEixo.appendChild(t);
    });

    /* linha sobreposta (ex.: sobra do mes) */
    if (op.linha && op.linha.dados && op.linha.dados.length) {
      var pts = op.linha.dados.map(function (v, i) {
        return [mL + i * larguraGrupo + larguraGrupo / 2, y(Number(v) || 0)];
      });
      svg.appendChild(svgEl('path', {
        class: 'chart__line', d: caminhoSuave(pts, 0.25), stroke: op.linha.cor
      }));
      pts.forEach(function (p) {
        svg.appendChild(svgEl('circle', { class: 'chart__dot', cx: p[0], cy: p[1], r: 3.4, fill: op.linha.cor }));
      });
    }

    svg.appendChild(gEixo);
    wrap.appendChild(svg);
    wrap.appendChild(tip);

    if (op.legenda !== false) {
      var itens = series.slice();
      if (op.linha) itens.push({ nome: op.linha.nome, cor: op.linha.cor, linha: true });
      wrap.appendChild(legenda(itens));
    }
    return wrap;
  }

  /* ======================================================================
     DONUT (alocacao / categorias)
     op = { itens:[{nome, total, cor}], centro:{k,v}, tamanho, aoClicar }
     ====================================================================== */
  function donut(op) {
    var itens = (op.itens || []).filter(function (i) { return i.total > 0; });
    var T = op.tamanho || 220;
    var raio = T / 2 - 6;
    var espessura = op.espessura || 26;
    var rInt = raio - espessura;

    if (!itens.length) {
      return h('div.chart', FC.ui.vazio({ titulo: 'Nada gasto ainda', icone: 'pie', texto: op.vazioTexto }));
    }

    var total = itens.reduce(function (t, i) { return t + i.total; }, 0);
    var svg = svgEl('svg', { viewBox: '0 0 ' + T + ' ' + T, style: 'max-width:' + T + 'px;margin:0 auto' });
    var cx = T / 2, cy = T / 2;
    var ang = -Math.PI / 2;
    var vao = itens.length > 1 ? 0.016 : 0;
    var segmentos = [];

    itens.forEach(function (it, idx) {
      var frac = it.total / total;
      var a0 = ang + vao / 2;
      var a1 = ang + frac * Math.PI * 2 - vao / 2;
      ang += frac * Math.PI * 2;
      if (a1 <= a0) a1 = a0 + 0.001;

      var grande = (a1 - a0) > Math.PI ? 1 : 0;
      var p = 'M' + (cx + raio * Math.cos(a0)) + ',' + (cy + raio * Math.sin(a0)) +
              'A' + raio + ',' + raio + ' 0 ' + grande + ' 1 ' + (cx + raio * Math.cos(a1)) + ',' + (cy + raio * Math.sin(a1)) +
              'L' + (cx + rInt * Math.cos(a1)) + ',' + (cy + rInt * Math.sin(a1)) +
              'A' + rInt + ',' + rInt + ' 0 ' + grande + ' 0 ' + (cx + rInt * Math.cos(a0)) + ',' + (cy + rInt * Math.sin(a0)) + 'Z';

      var seg = svgEl('path', { class: 'donut__seg', d: p, fill: it.cor || 'var(--c' + ((idx % 12) + 1) + ')' });
      seg.appendChild(svgEl('title'));
      seg.lastChild.textContent = it.nome + ': ' + fmt.brl(it.total);

      seg.addEventListener('mouseenter', function () {
        segmentos.forEach(function (s) { if (s !== seg) s.classList.add('is-dim'); });
        if (centro) d.mount(centro, h('div',
          h('div.donut__k', fmt.truncate(it.nome, 16)),
          h('div.donut__v', fmt.brl(it.total)),
          h('div.donut__k', fmt.pct((it.total / total) * 100, 1))
        ));
      });
      seg.addEventListener('mouseleave', function () {
        segmentos.forEach(function (s) { s.classList.remove('is-dim'); });
        if (centro) d.mount(centro, centroPadrao());
      });
      if (op.aoClicar) seg.addEventListener('click', function () { op.aoClicar(it); });

      segmentos.push(seg);
      svg.appendChild(seg);
    });

    function centroPadrao() {
      return h('div',
        h('div.donut__k', (op.centro && op.centro.k) || 'Total'),
        h('div.donut__v', (op.centro && op.centro.v) || fmt.brl(total))
      );
    }

    var centro = h('div.donut__center', centroPadrao());
    var wrap = h('div.chart', h('div.donut__wrap', svg, centro));

    if (op.legenda !== false) {
      wrap.appendChild(legenda(itens.slice(0, 8).map(function (i, idx) {
        return { nome: i.nome, cor: i.cor || 'var(--c' + ((idx % 12) + 1) + ')' };
      })));
    }
    return wrap;
  }

  /* ======================================================================
     SPARKLINE (dentro dos KPIs)
     ====================================================================== */
  function sparkline(dados, cor, op) {
    op = op || {};
    var W = 160, H = 38, m = 3;
    var vals = (dados || []).map(function (v) { return Number(v) || 0; });
    if (vals.length < 2) return h('div.spark');

    var vMax = Math.max.apply(null, vals);
    var vMin = Math.min.apply(null, vals);
    if (vMax === vMin) { vMax += 1; vMin -= 1; }

    var x = escala(0, vals.length - 1, m, W - m);
    var y = escala(vMin, vMax, H - m, m);
    var pts = vals.map(function (v, i) { return [x(i), y(v)]; });
    var dLinha = caminhoSuave(pts, 0.3);

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none' });

    if (op.area !== false) {
      var gid = 'sp' + (++idGrad);
      var defs = svgEl('defs');
      var lg = svgEl('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' });
      lg.appendChild(svgEl('stop', { offset: '0%', 'stop-color': cor, 'stop-opacity': '.30' }));
      lg.appendChild(svgEl('stop', { offset: '100%', 'stop-color': cor, 'stop-opacity': '0' }));
      defs.appendChild(lg);
      svg.appendChild(defs);
      svg.appendChild(svgEl('path', {
        d: dLinha + 'L' + pts[pts.length - 1][0] + ',' + H + 'L' + pts[0][0] + ',' + H + 'Z',
        fill: 'url(#' + gid + ')'
      }));
    }

    svg.appendChild(svgEl('path', { class: 'spark__line', d: dLinha, stroke: cor }));
    svg.appendChild(svgEl('circle', {
      cx: pts[pts.length - 1][0], cy: pts[pts.length - 1][1], r: 2.6, fill: cor
    }));
    return h('div.spark', svg);
  }

  /* ======================================================================
     BARRAS HORIZONTAIS (ranking de categorias)
     ====================================================================== */
  function ranking(itens, op) {
    op = op || {};
    var lista = (itens || []).slice(0, op.limite || 8);
    if (!lista.length) return FC.ui.vazio({ titulo: 'Sem gastos no período', icone: 'list', texto: op.vazioTexto });

    var max = Math.max.apply(null, lista.map(function (i) { return i.total; }).concat([1]));

    return h('div.col', { style: { gap: '2px' } },
      lista.map(function (i) {
        return h('div.catrow', { style: { '--cat-color': i.cor || 'var(--accent)' } },
          h('div.catrow__n', { title: i.nome },
            h('span.catrow__dot'),
            h('span.ellipsis', i.nome)
          ),
          h('div.catrow__bar',
            h('div.catrow__fill', { style: { width: ((i.total / max) * 100) + '%' } })
          ),
          h('div.catrow__v', fmt.brl(i.total)),
          op.mostrarPct !== false
            ? h('div.catrow__v.dim', { style: { width: '5ch', textAlign: 'right' } }, fmt.pct(i.pct || 0, 0))
            : null
        );
      })
    );
  }

  /* ======================================================================
     COMPARATIVO ENTRE AS DUAS PESSOAS
     ====================================================================== */
  function comparativo(linhas, corA, corB) {
    var max = Math.max.apply(null, linhas.map(function (l) {
      return Math.max(l.a, l.b);
    }).concat([1]));

    return h('div.vs',
      linhas.map(function (l) {
        return h('div.vs__row',
          h('div.vs__side.vs__side--l',
            h('span.vs__v', fmt.brl(l.a)),
            h('div.vs__bar', { style: { width: ((l.a / max) * 100) + '%', background: corA } })
          ),
          h('div.vs__lbl', { title: l.nome }, l.curto || l.nome.slice(0, 3)),
          h('div.vs__side',
            h('div.vs__bar', { style: { width: ((l.b / max) * 100) + '%', background: corB } }),
            h('span.vs__v', fmt.brl(l.b))
          )
        );
      })
    );
  }

  /* ======================================================================
     MAPA DE CALOR DO MES
     ====================================================================== */
  function mapaCalor(dias, mes, corBase) {
    var max = Math.max.apply(null, dias.map(function (d2) { return d2.total; }).concat([1]));
    var inicio = fmt.firstWeekday(mes);
    var hoje = fmt.todayISO();
    var cells = [];

    fmt.DIAS_ABR.forEach(function (n) { cells.push(h('div.heat__hd', n.slice(0, 1))); });
    for (var i = 0; i < inicio; i++) cells.push(h('div'));

    dias.forEach(function (dd) {
      var intens = dd.total > 0 ? 0.16 + (dd.total / max) * 0.84 : 0;
      var iso = mes + '-' + fmt.pad(dd.dia);
      var cel = h('div.heat__d' + (iso === hoje ? '.is-today' : ''), {
        style: intens > 0
          ? { background: 'color-mix(in srgb, ' + corBase + ' ' + Math.round(intens * 100) + '%, var(--surface-3))',
              color: intens > 0.55 ? '#06130f' : 'var(--text-2)' }
          : null,
        title: fmt.dateBR(iso) + ' · ' + fmt.brl(dd.total) + (dd.qtd ? ' (' + dd.qtd + ')' : '')
      }, String(dd.dia));
      cells.push(cel);
    });

    return h('div.heat', cells);
  }

  /* ======================================================================
     LEGENDA
     ====================================================================== */
  function legenda(itens) {
    return h('div.legend',
      itens.map(function (i) {
        return h('span.legend__i',
          h('span.legend__sw' + (i.linha ? '.legend__sw--line' : ''), { style: { background: i.cor } }),
          i.nome
        );
      })
    );
  }

  FC.charts = {
    area: area, barras: barras, donut: donut, sparkline: sparkline,
    ranking: ranking, comparativo: comparativo, mapaCalor: mapaCalor, legenda: legenda,
    tetoBonito: tetoBonito
  };
})(typeof self !== 'undefined' ? self : this);
