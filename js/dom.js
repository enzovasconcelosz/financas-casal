/* ==========================================================================
   dom.js — mini biblioteca de DOM (sem framework)
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SVG_TAGS = {
    svg: 1, g: 1, path: 1, rect: 1, circle: 1, line: 1, text: 1, tspan: 1,
    polyline: 1, polygon: 1, defs: 1, linearGradient: 1, stop: 1, clipPath: 1,
    ellipse: 1, use: 1, mask: 1, filter: 1, feGaussianBlur: 1, title: 1
  };

  /**
   * h('div.card', {onclick: fn}, 'texto', outroNo)
   * Aceita seletor com classes: 'button.btn.btn--sm'
   * Props especiais: class, style (objeto), dataset, html, on<Evento>, ref
   */
  function h(sel, props) {
    var parts = String(sel).split('.');
    var tag = parts[0] || 'div';
    var el = SVG_TAGS[tag]
      ? document.createElementNS(SVG_NS, tag)
      : document.createElement(tag);

    for (var i = 1; i < parts.length; i++) {
      if (parts[i]) el.classList.add(parts[i]);
    }

    var children = [];
    var start = 1;
    if (props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props)) {
      start = 2;
      applyProps(el, props);
    }
    for (var j = start; j < arguments.length; j++) children.push(arguments[j]);
    append(el, children);
    return el;
  }

  function applyProps(el, props) {
    for (var k in props) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
      var v = props[k];
      if (v == null || v === false) continue;

      if (k === 'class' || k === 'className') {
        String(v).split(/\s+/).forEach(function (c) { if (c) el.classList.add(c); });
      } else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else for (var s in v) {
          if (s.indexOf('--') === 0) el.style.setProperty(s, v[s]);
          else el.style[s] = v[s];
        }
      } else if (k === 'dataset') {
        for (var d in v) el.dataset[d] = v[d];
      } else if (k === 'html') {
        el.innerHTML = v;
      } else if (k === 'text') {
        el.textContent = v;
      } else if (k === 'ref' && typeof v === 'function') {
        v(el);
      } else if (k.indexOf('on') === 0 && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'value' && 'value' in el) {
        el.value = v;
      } else if (k === 'checked' || k === 'disabled' || k === 'selected') {
        el[k] = !!v;
        if (v === true) el.setAttribute(k, '');
      } else {
        el.setAttribute(k, v === true ? '' : v);
      }
    }
  }

  function append(el, children) {
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c == null || c === false || c === '') continue;
      if (Array.isArray(c)) { append(el, c); continue; }
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }

  function mount(el, node) { clear(el); append(el, [node]); return el; }

  function on(el, ev, sel, fn) {
    if (typeof sel === 'function') { el.addEventListener(ev, sel); return; }
    el.addEventListener(ev, function (e) {
      var t = e.target.closest(sel);
      if (t && el.contains(t)) fn.call(t, e, t);
    });
  }

  /** icone SVG a partir de um caminho (path d) */
  function icon(d, cls) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    var paths = Array.isArray(d) ? d : [d];
    paths.forEach(function (pd) {
      var p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', pd);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '1.9');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(p);
    });
    return svg;
  }

  /** biblioteca de caminhos de icone usada no app */
  var ICONS = {
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    check: 'M4.5 12.5l5 5 10-11',
    x: 'M6 6l12 12M18 6L6 18',
    pencil: 'M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z',
    trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7',
    copy: 'M9 9h10v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9ZM5 15V5a1 1 0 0 1 1-1h10',
    chevRight: 'M9 6l6 6-6 6',
    chevLeft: 'M15 6l-6 6 6 6',
    chevDown: 'M6 9l6 6 6-6',
    chevUp: 'M6 15l6-6 6 6',
    arrowUp: 'M12 19V5M6 11l6-6 6 6',
    arrowDown: 'M12 5v14M6 13l6 6 6-6',
    arrowRight: 'M5 12h14M13 6l6 6-6 6',
    wallet: 'M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Zm13 4.5h4v3h-4a1.5 1.5 0 0 1 0-3Z',
    card: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Zm0 3h18M6.5 15.5h3',
    cash: 'M3 7h18v10H3zM12 12a2.2 2.2 0 1 0 0-.01M6.5 9.5h.01M17.5 14.5h.01',
    pix: 'M12 3 8 7l4 4 4-4-4-4Zm0 10-4 4 4 4 4-4-4-4ZM7 8l-4 4 4 4M17 8l4 4-4 4',
    trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    trendDown: 'M3 7l6 6 4-4 8 8M15 17h6v-6',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    pie: 'M12 3a9 9 0 1 0 9 9h-9V3Z',
    coins: 'M6 8.5c0-1.7 2.7-3 6-3s6 1.3 6 3-2.7 3-6 3-6-1.3-6-3Zm0 0v7c0 1.7 2.7 3 6 3s6-1.3 6-3v-7',
    bank: 'M4 10h16M5 10v7m4-7v7m6-7v7m4-7v7M3 20h18M12 3l9 5H3l9-5Z',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 8c0-3.5-3.6-6-8-6s-8 2.5-8 6',
    users: 'M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.5 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3.2 3.1-5.5 7-5.5s7 2.3 7 5.5m1.5-5.2c3 .5 5.5 2.5 5.5 5.2',
    heart: 'M12 20s-7.5-4.6-7.5-10a4.3 4.3 0 0 1 7.5-2.8A4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z',
    calendar: 'M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Zm0 4h16M8 3v4m8-4v4',
    tag: 'M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Zm4.5-5h.01',
    filter: 'M4 5h16l-6.5 7.5V19l-3 2v-8.5L4 5Z',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5.5-1.5L21 21',
    download: 'M12 4v11m-4.5-4.5L12 15l4.5-4.5M4 19h16',
    upload: 'M12 20V9m-4.5 4.5L12 9l4.5 4.5M4 5h16',
    file: 'M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 0v5h5',
    print: 'M7 9V4h10v5M7 18H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v7H7v-7Z',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8.4-3a8.4 8.4 0 0 0-.13-1.5l2-1.5-2-3.4-2.4 1a8.3 8.3 0 0 0-2.6-1.5L15 2H9l-.3 2.6A8.3 8.3 0 0 0 6.1 6.1l-2.4-1-2 3.4 2 1.5A8.4 8.4 0 0 0 3.6 12c0 .5 0 1 .1 1.5l-2 1.5 2 3.4 2.4-1c.8.6 1.7 1.2 2.6 1.5L9 22h6l.3-2.6c1-.3 1.8-.9 2.6-1.5l2.4 1 2-3.4-2-1.5c.1-.5.1-1 .1-1.5Z',
    moon: 'M20 14.2A8.2 8.2 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z',
    lock: 'M6 10V8a6 6 0 1 1 12 0v2m-13 0h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z',
    unlock: 'M7 10V8a5 5 0 0 1 9.6-2M5 10h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z',
    eye: 'M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12Zm10 2.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z',
    eyeOff: 'M4 4l16 16M10 6a9.9 9.9 0 0 1 2-.2c6.2 0 10 6.2 10 6.2a17 17 0 0 1-3.3 3.9M6.6 7.9A16.6 16.6 0 0 0 2 12s3.8 6.5 10 6.5c1.2 0 2.3-.2 3.3-.6',
    whats: 'M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3.5 20.5l1.7-5A8.5 8.5 0 1 1 21 11.5Z',
    bulb: 'M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .9 1.6h5.2c.1-.6.4-1.2.9-1.6A6 6 0 0 0 12 3Z',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9v4.5M12 7.8h.01',
    alert: 'M12 8.5V13m0 3.4h.01M10.3 3.9 2.6 17.3a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
    refresh: 'M20 11a8 8 0 1 0-1.3 5.3M20 5v6h-6',
    sync: 'M4 12a8 8 0 0 1 13.3-6M20 12a8 8 0 0 1-13.3 6M17 3v3h-3M7 21v-3h3',
    inbox: 'M3 13h5l1.5 3h5L16 13h5M4 4h16l1 9v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6l1-9Z',
    camera: 'M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm8 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    handCoins: 'M3 15l4-1 6 1.5a2 2 0 0 1-1 3.5L6 21l-3-1M13 17l6-2a1.6 1.6 0 0 0-1-3l-4 1M15 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
    piggy: 'M4 13c0-3.3 3.1-6 7-6h1.5l3-2v2.6c1 .7 1.8 1.7 2.2 2.9H21v4h-3.3a6.6 6.6 0 0 1-2.2 2.4V20h-3v-1.5h-2V20H7.5v-2.6C5.4 16.4 4 14.8 4 13Zm4-2h.01',
    target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0-3.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
    split: 'M3 6h4l5 12h4M3 18h4l1.8-4.3M21 6h-4l-1.8 4.3M18 3l3 3-3 3M18 15l3 3-3 3',
    receipt: 'M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21V3Zm3 5h6M9 12h6M9 16h3',
    star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5Z',
    dots: 'M12 6.5h.01M12 12h.01M12 17.5h.01',
    grid: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
    list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
    save: 'M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm3 0v6h7V4m-8 17v-6h10v6',
    logout: 'M15 5V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1m3-9 3 3-3 3m3-3H9',
    key: 'M15.5 3a5.5 5.5 0 1 0-2.2 10.6L12 15l-2 .3-.3 2-1.4 1.4-.3 2-2 .3-1-1 .3-2 6.4-6.4A5.5 5.5 0 0 0 15.5 3Zm1.5 4h.01'
  };

  function ic(name, cls) { return icon(ICONS[name] || ICONS.info, cls); }

  FC.dom = {
    h: h, $: $, $$: $$, clear: clear, mount: mount, on: on,
    icon: icon, ic: ic, ICONS: ICONS, SVG_NS: SVG_NS
  };
})(typeof self !== 'undefined' ? self : this);
