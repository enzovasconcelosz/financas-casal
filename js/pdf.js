/* ==========================================================================
   pdf.js — relatorios

   Dois caminhos para o mesmo conteudo:
     baixarPDF()  usa jsPDF (carregado do CDN na hora) e baixa um arquivo
     imprimir()   monta a versao de impressao e abre o dialogo do navegador
                  (funciona offline e permite "Salvar como PDF")

   Os dois consomem a mesma "receita" de relatorio, montada em views/reports.js
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var d = FC.dom, h = d.h, fmt = FC.fmt;

  var CDN_JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  var CDN_TABLE = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';

  function carregarScript(src) {
    return new Promise(function (ok, falhou) {
      var existente = document.querySelector('script[src="' + src + '"]');
      if (existente) {
        if (existente.dataset.pronto === '1') return ok();
        existente.addEventListener('load', function () { ok(); });
        existente.addEventListener('error', function () { falhou(new Error('falha ao carregar')); });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { s.dataset.pronto = '1'; ok(); };
      s.onerror = function () { falhou(new Error('não consegui carregar ' + src)); };
      document.head.appendChild(s);
    });
  }

  function carregarJsPDF() {
    if (root.jspdf && root.jspdf.jsPDF && root.jspdf.jsPDF.API.autoTable) return Promise.resolve();
    return carregarScript(CDN_JSPDF).then(function () { return carregarScript(CDN_TABLE); });
  }

  /* ======================================================================
     PDF de verdade (download)
     ====================================================================== */
  function baixarPDF(receita) {
    return carregarJsPDF().then(function () {
      var jsPDF = root.jspdf.jsPDF;
      var doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: receita.paisagem ? 'l' : 'p' });

      var larg = doc.internal.pageSize.getWidth();
      var margem = 12;
      var y = 16;

      var COR_TXT = [24, 30, 42];
      var COR_FRACA = [110, 122, 140];
      var COR_LINHA = [200, 208, 220];
      var COR_POS = [12, 122, 82];
      var COR_NEG = [182, 35, 52];

      /* cabecalho */
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(17);
      doc.setTextColor.apply(doc, COR_TXT);
      doc.text(receita.titulo || 'Relatório', margem, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor.apply(doc, COR_FRACA);
      y += 5.5;
      if (receita.subtitulo) doc.text(receita.subtitulo, margem, y);

      var carimbo = 'Gerado em ' + fmt.dateBR(fmt.todayISO()) +
                    ' às ' + new Date().toTimeString().slice(0, 5);
      doc.text(carimbo, larg - margem, 16, { align: 'right' });

      y += 4;
      doc.setDrawColor.apply(doc, COR_LINHA);
      doc.setLineWidth(0.4);
      doc.line(margem, y, larg - margem, y);
      y += 7;

      /* indicadores */
      if (receita.kpis && receita.kpis.length) {
        var porLinha = 4;
        var larguraKpi = (larg - margem * 2 - (porLinha - 1) * 3) / porLinha;

        receita.kpis.forEach(function (k, i) {
          var col = i % porLinha;
          var linha = Math.floor(i / porLinha);
          var x = margem + col * (larguraKpi + 3);
          var yy = y + linha * 17;

          doc.setDrawColor.apply(doc, COR_LINHA);
          doc.setLineWidth(0.25);
          doc.roundedRect(x, yy, larguraKpi, 14, 1.6, 1.6);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor.apply(doc, COR_FRACA);
          doc.text(String(k.k).toUpperCase(), x + 3, yy + 4.6);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11.5);
          if (k.sinal === 'pos') doc.setTextColor.apply(doc, COR_POS);
          else if (k.sinal === 'neg') doc.setTextColor.apply(doc, COR_NEG);
          else doc.setTextColor.apply(doc, COR_TXT);
          doc.text(String(k.v), x + 3, yy + 10.6);
        });

        y += Math.ceil(receita.kpis.length / porLinha) * 17 + 4;
      }

      /* secoes */
      (receita.secoes || []).forEach(function (sec) {
        if (sec.quebrarAntes) { doc.addPage(); y = 16; }

        if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 16; }

        if (sec.titulo) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor.apply(doc, COR_TXT);
          doc.text(sec.titulo, margem, y);
          y += 2;
          doc.setDrawColor.apply(doc, COR_LINHA);
          doc.line(margem, y, larg - margem, y);
          y += 4;
        }

        if (sec.tipo === 'texto') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor.apply(doc, COR_FRACA);
          var linhas = doc.splitTextToSize(sec.texto, larg - margem * 2);
          doc.text(linhas, margem, y + 3);
          y += linhas.length * 4.2 + 5;
          return;
        }

        if (sec.tipo === 'lista') {
          doc.setFontSize(9);
          sec.itens.forEach(function (it) {
            if (y > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 16; }
            doc.setFont('helvetica', 'normal');
            doc.setTextColor.apply(doc, COR_FRACA);
            doc.text(String(it.k), margem, y + 3);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor.apply(doc, COR_TXT);
            doc.text(String(it.v), larg - margem, y + 3, { align: 'right' });
            y += 5.4;
          });
          y += 3;
          return;
        }

        /* tabela */
        var corpo = sec.linhas || [];
        doc.autoTable({
          startY: y,
          head: [sec.colunas],
          body: corpo,
          foot: sec.totais ? [sec.totais] : null,
          margin: { left: margem, right: margem },
          theme: 'grid',
          styles: {
            font: 'helvetica', fontSize: 8, cellPadding: 1.6,
            textColor: COR_TXT, lineColor: [226, 232, 240], lineWidth: 0.15
          },
          headStyles: {
            fillColor: [241, 245, 249], textColor: [71, 85, 105],
            fontStyle: 'bold', fontSize: 7.5, lineWidth: 0.15
          },
          footStyles: {
            fillColor: [248, 250, 252], textColor: COR_TXT,
            fontStyle: 'bold', fontSize: 8.5, lineWidth: 0.2
          },
          alternateRowStyles: { fillColor: [252, 253, 255] },
          columnStyles: sec.estilosColuna || {},
          didParseCell: function (dados) {
            if (dados.section === 'body' && sec.colunasNumero) {
              if (sec.colunasNumero.indexOf(dados.column.index) >= 0) {
                dados.cell.styles.halign = 'right';
              }
            }
          }
        });
        y = doc.lastAutoTable.finalY + 7;
      });

      /* rodape com numeracao e aviso */
      var total = doc.internal.getNumberOfPages();
      for (var i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor.apply(doc, COR_FRACA);
        var alt = doc.internal.pageSize.getHeight();
        doc.text(receita.rodape || 'Finanças do Casal — controle particular', margem, alt - 7);
        doc.text(i + ' de ' + total, larg - margem, alt - 7, { align: 'right' });
      }

      doc.save(receita.arquivo || ('relatorio-' + fmt.todayISO() + '.pdf'));
      return true;
    });
  }

  /* ======================================================================
     Versao para impressao (funciona sem internet)
     ====================================================================== */
  function montarImpressao(receita) {
    var raiz = d.$('#printRoot');
    d.clear(raiz);

    raiz.appendChild(h('div.prt__head',
      h('div',
        h('h1.prt__title', receita.titulo || 'Relatório'),
        receita.subtitulo ? h('div.prt__sub', receita.subtitulo) : null
      ),
      h('div.prt__meta',
        h('div', 'Gerado em ' + fmt.dateBR(fmt.todayISO())),
        h('div', new Date().toTimeString().slice(0, 5))
      )
    ));

    if (receita.kpis && receita.kpis.length) {
      raiz.appendChild(h('div.prt__kpis',
        receita.kpis.map(function (k) {
          return h('div.prt__kpi',
            h('div.prt__kpi__k', k.k),
            h('div.prt__kpi__v' + (k.sinal === 'pos' ? '.prt__pos' : (k.sinal === 'neg' ? '.prt__neg' : '')), k.v)
          );
        })
      ));
    }

    (receita.secoes || []).forEach(function (sec) {
      var el = h('div.prt__sec' + (sec.quebrarAntes ? '.prt__break' : ''));
      if (sec.titulo) el.appendChild(h('h2', sec.titulo));

      if (sec.tipo === 'texto') {
        el.appendChild(h('p', { style: 'font-size:9pt;color:#555;line-height:1.5' }, sec.texto));
      } else if (sec.tipo === 'lista') {
        el.appendChild(h('table.prt__tbl',
          h('tbody', sec.itens.map(function (it) {
            return h('tr', h('td', it.k), h('td.num', it.v));
          }))
        ));
      } else {
        el.appendChild(h('table.prt__tbl',
          h('thead', h('tr', sec.colunas.map(function (c, i) {
            return h('th' + (sec.colunasNumero && sec.colunasNumero.indexOf(i) >= 0 ? '.num' : ''), c);
          }))),
          h('tbody', (sec.linhas || []).map(function (ln) {
            return h('tr', ln.map(function (c, i) {
              return h('td' + (sec.colunasNumero && sec.colunasNumero.indexOf(i) >= 0 ? '.num' : ''), String(c));
            }));
          })),
          sec.totais ? h('tfoot', h('tr', sec.totais.map(function (c, i) {
            return h('td' + (sec.colunasNumero && sec.colunasNumero.indexOf(i) >= 0 ? '.num' : ''), String(c));
          }))) : null
        ));
      }
      raiz.appendChild(el);
    });

    raiz.appendChild(h('div.prt__foot', receita.rodape || 'Finanças do Casal — controle particular'));
    return raiz;
  }

  function imprimir(receita) {
    montarImpressao(receita);
    setTimeout(function () { root.print(); }, 120);
  }

  /** Tenta o PDF; se o CDN nao responder, oferece a impressao */
  function exportar(receita) {
    var fecharAviso = FC.ui.toast('Montando o PDF…', 'info', 20000);
    return baixarPDF(receita).then(function () {
      fecharAviso && fecharAviso();
      FC.ui.toast('PDF salvo em Downloads.', 'ok');
    }).catch(function (e) {
      fecharAviso && fecharAviso();
      console.warn(e);
      FC.ui.confirmar({
        titulo: 'Não consegui montar o PDF',
        texto: 'A biblioteca de PDF precisa de internet para carregar da primeira vez. ' +
               'Posso abrir a janela de impressão — lá dá para escolher "Salvar como PDF".',
        ok: 'Abrir impressão',
        cancelar: 'Agora não'
      }).then(function (sim) { if (sim) imprimir(receita); });
    });
  }

  FC.pdf = {
    exportar: exportar,
    baixarPDF: baixarPDF,
    imprimir: imprimir,
    montarImpressao: montarImpressao
  };
})(typeof self !== 'undefined' ? self : this);
