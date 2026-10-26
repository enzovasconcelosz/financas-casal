/* ==========================================================================
   format.js — formatacao de dinheiro, datas e numeros (pt-BR)
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MESES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                   'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var DIAS_ABR = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  var nfMoney = new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  var nfPlain = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  var nfInt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

  /** R$ 1.234,56 — aceita null/undefined/NaN sem quebrar */
  function brl(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return nfMoney.format(v);
  }

  /** 1.234,56 (sem simbolo) */
  function money(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return nfPlain.format(v);
  }

  /** Versao curta para eixos de grafico: 1,2 mil / 45,3 mil / 1,2 mi */
  function brlShort(n) {
    var v = Number(n) || 0;
    var s = v < 0 ? '-' : '';
    var a = Math.abs(v);
    if (a >= 1e6) return s + 'R$ ' + nfPlain.format(a / 1e6).replace(',00', '') + ' mi';
    if (a >= 1e3) return s + 'R$ ' + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace('.', ',') + 'k';
    return s + 'R$ ' + nfInt.format(a);
  }

  /** Curto sem simbolo, para eixo Y */
  function numShort(n) {
    var v = Number(n) || 0;
    var s = v < 0 ? '-' : '';
    var a = Math.abs(v);
    if (a >= 1e6) return s + (a / 1e6).toFixed(1).replace('.', ',') + 'mi';
    if (a >= 1e3) return s + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace('.', ',') + 'k';
    return s + nfInt.format(a);
  }

  function pct(n, casas) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return v.toFixed(casas == null ? 1 : casas).replace('.', ',') + '%';
  }

  /**
   * Interpreta dinheiro digitado por gente: "35,90", "1.234,56", "1234.56",
   * "R$ 89,90", "2k", "1,5mil". Devolve numero ou null.
   */
  function parseMoney(str) {
    if (typeof str === 'number') return isFinite(str) ? str : null;
    if (!str) return null;
    var s = String(str).trim().toLowerCase();
    s = s.replace(/r\$/g, '').replace(/\s/g, '');
    if (!s) return null;

    var mult = 1;
    var mk = s.match(/(k|mil|mi|m)$/);
    if (mk) {
      var suf = mk[1];
      if (suf === 'k' || suf === 'mil') mult = 1e3;
      else if (suf === 'mi') mult = 1e6;
      else if (suf === 'm') mult = 1e3;
      s = s.slice(0, s.length - suf.length);
    }

    var temVirgula = s.indexOf(',') >= 0;
    var temPonto = s.indexOf('.') >= 0;

    if (temVirgula && temPonto) {
      // "1.234,56" -> ponto e separador de milhar
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (temVirgula) {
      s = s.replace(',', '.');
    } else if (temPonto) {
      // "1.234" provavelmente milhar; "12.34" provavelmente decimal
      var partes = s.split('.');
      var ult = partes[partes.length - 1];
      if (partes.length > 2 || ult.length === 3) s = s.replace(/\./g, '');
    }

    s = s.replace(/[^0-9.\-]/g, '');
    if (!s || s === '-' || s === '.') return null;
    var v = parseFloat(s);
    if (!isFinite(v)) return null;
    return Math.round(v * mult * 100) / 100;
  }

  /* -------------------------- DATAS -------------------------- */

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /** Date -> "2026-09-20" (hora local, sem fuso) */
  function isoOf(d) {
    var dt = d instanceof Date ? d : new Date(d);
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  }

  function todayISO() { return isoOf(new Date()); }

  /** "2026-09-20" -> Date local (evita o bug de fuso do new Date(str)) */
  function dateOf(iso) {
    if (iso instanceof Date) return iso;
    var p = String(iso || '').split('-');
    if (p.length < 3) return new Date(NaN);
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  /** "2026-09-20" -> "20/09/2026" */
  function dateBR(iso) {
    var p = String(iso || '').split('-');
    if (p.length < 3) return '';
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  /** "2026-09-20" -> "20/set" */
  function dateShort(iso) {
    var p = String(iso || '').split('-');
    if (p.length < 3) return '';
    return p[2] + '/' + MESES_ABR[+p[1] - 1];
  }

  /** "2026-09-20" -> "sáb, 20/09" */
  function dateWeek(iso) {
    var d = dateOf(iso);
    if (isNaN(d)) return '';
    return DIAS_ABR[d.getDay()] + ', ' + dateBR(iso).slice(0, 5);
  }

  /**
   * Timestamp completo ("2026-09-23T01:24:00.000Z") -> data LOCAL "22/09/2026".
   * Cortar a string direto daria a data em UTC, que no Brasil vira o dia
   * seguinte a partir das 21h.
   */
  function stampDateBR(stamp) {
    var d = new Date(stamp);
    if (isNaN(d)) return '';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  /** Timestamp -> "22/09/2026 22:24" no horário local */
  function stampBR(stamp) {
    var d = new Date(stamp);
    if (isNaN(d)) return '';
    return stampDateBR(stamp) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* -------------------------- MESES (competencia) -------------------------- */

  /** Date|iso -> "2026-09" */
  function monthKey(d) {
    if (typeof d === 'string') {
      if (/^\d{4}-\d{2}$/.test(d)) return d;
      return d.slice(0, 7);
    }
    var dt = d instanceof Date ? d : new Date();
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1);
  }

  function thisMonth() { return monthKey(new Date()); }

  /** "2026-09" -> "setembro 2026"  |  short: "set/26" */
  function monthLabel(key, short) {
    var p = String(key || '').split('-');
    if (p.length < 2) return '';
    var m = +p[1] - 1;
    if (m < 0 || m > 11) return '';
    if (short) return MESES_ABR[m] + '/' + p[0].slice(2);
    return MESES[m] + ' ' + p[0];
  }

  /** "2026-09" + 2 -> "2026-11" */
  function addMonths(key, n) {
    var p = String(key).split('-');
    var y = +p[0], m = +p[1] - 1 + (n | 0);
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + '-' + pad(m + 1);
  }

  /** diferenca em meses: ("2026-01","2026-09") -> 8 */
  function diffMonths(a, b) {
    var pa = String(a).split('-'), pb = String(b).split('-');
    return (+pb[0] - +pa[0]) * 12 + (+pb[1] - +pa[1]);
  }

  /** lista dos ultimos n meses terminando em `ate` (inclusive) */
  function lastMonths(ate, n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) out.push(addMonths(ate, -i));
    return out;
  }

  function daysInMonth(key) {
    var p = String(key).split('-');
    return new Date(+p[0], +p[1], 0).getDate();
  }

  /** primeiro dia da semana (0=dom) do dia 1 do mes */
  function firstWeekday(key) {
    var p = String(key).split('-');
    return new Date(+p[0], +p[1] - 1, 1).getDay();
  }

  /* -------------------------- TEXTO -------------------------- */

  /** remove acentos e caixa, para busca tolerante */
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim();
  }

  function initials(nome) {
    var partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  function titleCase(s) {
    var t = String(s || '').trim();
    if (!t) return t;
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function truncate(s, n) {
    var t = String(s || '');
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }

  /** id curto, unico o bastante para uso local */
  function uid(prefixo) {
    var t = Date.now().toString(36);
    var r = Math.random().toString(36).slice(2, 8);
    return (prefixo || 'id') + '_' + t + r;
  }

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

  /** arredonda para 2 casas evitando lixo de ponto flutuante */
  function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

  /** soma segura de uma lista de objetos */
  function sumBy(arr, fn) {
    var t = 0;
    for (var i = 0; i < arr.length; i++) t += Number(fn(arr[i], i)) || 0;
    return round2(t);
  }

  /** "12/03" ou "3" -> {n,of} das parcelas */
  function parseParcela(s) {
    var m = String(s || '').match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
    if (!m) return null;
    var n = +m[1], of = +m[2];
    if (!n || !of || n > of) return null;
    return { n: n, of: of };
  }

  FC.fmt = {
    MESES: MESES, MESES_ABR: MESES_ABR, DIAS_ABR: DIAS_ABR,
    brl: brl, money: money, brlShort: brlShort, numShort: numShort, pct: pct,
    parseMoney: parseMoney,
    isoOf: isoOf, todayISO: todayISO, dateOf: dateOf,
    dateBR: dateBR, dateShort: dateShort, dateWeek: dateWeek,
    stampDateBR: stampDateBR, stampBR: stampBR,
    monthKey: monthKey, thisMonth: thisMonth, monthLabel: monthLabel,
    addMonths: addMonths, diffMonths: diffMonths, lastMonths: lastMonths,
    daysInMonth: daysInMonth, firstWeekday: firstWeekday,
    norm: norm, initials: initials, titleCase: titleCase, truncate: truncate,
    uid: uid, clamp: clamp, round2: round2, sumBy: sumBy, pad: pad,
    parseParcela: parseParcela
  };
})(typeof self !== 'undefined' ? self : this);
