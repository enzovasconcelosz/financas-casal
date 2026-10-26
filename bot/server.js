/* ==========================================================================
   server.js — servidor do bot de WhatsApp

   O que ele faz:
     1. recebe a mensagem do WhatsApp (Meta Cloud API, Twilio ou Evolution)
     2. interpreta com o MESMO parser que o site usa (../js/parser.js)
     3. responde no WhatsApp confirmando o que entendeu
     4. deixa o lançamento numa fila, que o site busca quando abre

   Ele NÃO guarda o seu controle financeiro: isso continua no navegador.
   A fila é só uma caixa de correio temporária.

   Node 18 ou mais novo. Sem dependências: roda com `node server.js`.
   ========================================================================== */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const parser = require('../js/parser.js');

/* ---------------------------------------------------------------------------
   CONFIGURAÇÃO — por variáveis de ambiente (veja .env.example)
   --------------------------------------------------------------------------- */
const cfg = {
  porta: parseInt(process.env.PORT || '8080', 10),

  // token que o SITE usa para buscar a fila. Invente um valor longo.
  token: process.env.APP_TOKEN || '',

  // de onde o site é servido, para liberar o CORS. Use * só em teste.
  origem: process.env.SITE_ORIGIN || '*',

  // só estes números podem lançar. Ex.: "5543999998888,5543988887777"
  numeros: (process.env.ALLOWED_NUMBERS || '')
    .split(',').map(s => s.replace(/\D/g, '')).filter(Boolean),

  provedor: (process.env.PROVIDER || 'meta').toLowerCase(),

  // fuso usado para "hoje" e "ontem" nas mensagens
  fuso: process.env.TIMEZONE || 'America/Sao_Paulo',

  // Meta (WhatsApp Cloud API)
  metaToken: process.env.META_TOKEN || '',
  metaPhoneId: process.env.META_PHONE_ID || '',
  metaVerify: process.env.META_VERIFY_TOKEN || '',

  // Evolution API
  evoUrl: (process.env.EVOLUTION_URL || '').replace(/\/+$/, ''),
  evoKey: process.env.EVOLUTION_KEY || '',
  evoInstancia: process.env.EVOLUTION_INSTANCE || '',

  arquivoFila: process.env.QUEUE_FILE || path.join(__dirname, 'fila.json')
};

if (!cfg.token) {
  console.error('\n  Falta definir APP_TOKEN. Veja o arquivo .env.example.\n');
  process.exit(1);
}

/* ---------------------------------------------------------------------------
   FILA — em memória, espelhada em disco para sobreviver a reinício
   --------------------------------------------------------------------------- */
let fila = [];
let resumo = null;

function carregarFila() {
  try {
    const bruto = fs.readFileSync(cfg.arquivoFila, 'utf8');
    const dados = JSON.parse(bruto);
    fila = Array.isArray(dados.fila) ? dados.fila : [];
    resumo = dados.resumo || null;
    console.log(`fila carregada: ${fila.length} mensagens`);
  } catch (e) {
    fila = [];
  }
}

let gravando = null;
function salvarFila() {
  clearTimeout(gravando);
  gravando = setTimeout(() => {
    try {
      fs.writeFileSync(cfg.arquivoFila, JSON.stringify({ fila, resumo }, null, 1));
    } catch (e) {
      console.error('não consegui gravar a fila:', e.message);
    }
  }, 250);
}

/** Tira o que já foi entregue e é antigo, para o arquivo não crescer sem fim */
function limparFila() {
  const limite = Date.now() - 30 * 24 * 3600 * 1000;
  const antes = fila.length;
  fila = fila.filter(m => !(m.entregue && new Date(m.em).getTime() < limite));
  if (fila.length !== antes) salvarFila();
}

/* ---------------------------------------------------------------------------
   ENVIO DE MENSAGEM DE VOLTA
   --------------------------------------------------------------------------- */
async function responder(para, texto) {
  if (!texto) return;
  try {
    if (cfg.provedor === 'meta') {
      if (!cfg.metaToken || !cfg.metaPhoneId) return;
      const r = await fetch(`https://graph.facebook.com/v21.0/${cfg.metaPhoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfg.metaToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: para,
          type: 'text',
          text: { body: texto, preview_url: false }
        })
      });
      if (!r.ok) console.error('Meta respondeu', r.status, await r.text());

    } else if (cfg.provedor === 'evolution') {
      if (!cfg.evoUrl || !cfg.evoInstancia) return;
      const r = await fetch(`${cfg.evoUrl}/message/sendText/${cfg.evoInstancia}`, {
        method: 'POST',
        headers: { 'apikey': cfg.evoKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: para, text: texto })
      });
      if (!r.ok) console.error('Evolution respondeu', r.status, await r.text());
    }
    /* no Twilio a resposta vai no próprio corpo da requisição (TwiML) */
  } catch (e) {
    console.error('falha ao responder:', e.message);
  }
}

/* ---------------------------------------------------------------------------
   PROCESSA UMA MENSAGEM RECEBIDA
   --------------------------------------------------------------------------- */
function autorizado(numero) {
  if (!cfg.numeros.length) return true;             // sem lista = libera geral
  const n = String(numero || '').replace(/\D/g, '');
  return cfg.numeros.some(p => n.endsWith(p) || p.endsWith(n));
}

/**
 * Data de hoje no fuso de vocês, não no do servidor. Hospedagens costumam
 * rodar em UTC: sem isso, uma mensagem às 22h sairia com a data de amanhã.
 */
function hojeNoFuso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: cfg.fuso, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());   // en-CA já devolve AAAA-MM-DD
}

function processar(de, nomeDe, texto) {
  if (!autorizado(de)) {
    console.log('número não autorizado:', de);
    return 'Este número não está liberado para lançar gastos.';
  }

  const r = parser.interpretar(texto, { hoje: hojeNoFuso() });

  if (r.tipo === 'saldo') {
    if (!resumo) {
      return 'Ainda não recebi um resumo do site. Abra o painel uma vez para eu poder responder isso.';
    }
    const brl = parser.brl;
    const linhas = [
      `📊 *${resumo.mes}*`,
      '',
      `Entradas: ${brl(resumo.entradas)}`,
      `Gastos: ${brl(resumo.gastos)}`,
      `  débito/Pix: ${brl(resumo.debito)}`,
      `  crédito: ${brl(resumo.credito)}`,
      `Sobra: ${brl(resumo.sobra)}`,
      '',
      `💰 Patrimônio: ${brl(resumo.patrimonio)}`,
      `  em conta: ${brl(resumo.conta)}`,
      `  investido: ${brl(resumo.investido)}`,
      `  fatura aberta: ${brl(resumo.fatura)}`
    ];
    if (resumo.pessoas && resumo.pessoas.length) {
      linhas.push('');
      resumo.pessoas.forEach(p => linhas.push(`${p.nome}: ${brl(p.gastos)}`));
    }
    linhas.push('', `_atualizado em ${new Date(resumo.em).toLocaleString('pt-BR')}_`);
    return linhas.join('\n');
  }

  if (r.tipo === 'ajuda') return parser.ajuda();

  if (!r.ok) return parser.confirmacao(r);

  /* entra na fila para o site buscar */
  const item = {
    id: 'wa_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    texto: String(texto).trim(),
    de: de,
    nomeDe: nomeDe || '',
    em: new Date().toISOString(),
    entregue: false
  };
  fila.push(item);
  salvarFila();
  console.log(`+ fila (${fila.length}):`, item.texto);

  return parser.confirmacao(r);
}

/* ---------------------------------------------------------------------------
   HTTP
   --------------------------------------------------------------------------- */
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', cfg.origem);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Vary', 'Origin');
}

function json(res, codigo, corpo) {
  cors(res);
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(corpo));
}

function texto(res, codigo, corpo, tipo) {
  cors(res);
  res.writeHead(codigo, { 'Content-Type': tipo || 'text/plain; charset=utf-8' });
  res.end(corpo);
}

function lerCorpo(req) {
  return new Promise((ok, falhou) => {
    let dados = '';
    let tamanho = 0;
    req.on('data', p => {
      tamanho += p.length;
      if (tamanho > 1e6) { req.destroy(); falhou(new Error('corpo grande demais')); return; }
      dados += p;
    });
    req.on('end', () => ok(dados));
    req.on('error', falhou);
  });
}

function tokenValido(u, corpo) {
  const t = u.searchParams.get('token') || (corpo && corpo.token);
  return t && t === cfg.token;
}

const servidor = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const rota = u.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }

  try {
    /* ---------------- site: teste de conexão ---------------- */
    if (rota === '/api/ping' && req.method === 'GET') {
      if (!tokenValido(u)) return json(res, 401, { erro: 'token inválido' });
      limparFila();
      return json(res, 200, {
        ok: true,
        provedor: cfg.provedor,
        pendentes: fila.filter(m => !m.entregue).length,
        temResumo: !!resumo
      });
    }

    /* ---------------- site: buscar a fila ---------------- */
    if (rota === '/api/inbox' && req.method === 'GET') {
      if (!tokenValido(u)) return json(res, 401, { erro: 'token inválido' });
      const itens = fila
        .filter(m => !m.entregue)
        .map(m => ({ id: m.id, texto: m.texto, de: m.de, nomeDe: m.nomeDe, em: m.em }));
      return json(res, 200, { itens, total: itens.length });
    }

    /* ---------------- site: confirmar recebimento ---------------- */
    if (rota === '/api/inbox/ack' && req.method === 'POST') {
      const corpo = JSON.parse((await lerCorpo(req)) || '{}');
      if (!tokenValido(u, corpo)) return json(res, 401, { erro: 'token inválido' });
      const ids = new Set(corpo.ids || []);
      let n = 0;
      fila.forEach(m => { if (ids.has(m.id)) { m.entregue = true; n++; } });
      salvarFila();
      return json(res, 200, { ok: true, marcadas: n });
    }

    /* ---------------- site: mandar o resumo (para responder "saldo") ---------------- */
    if (rota === '/api/resumo' && req.method === 'POST') {
      const corpo = JSON.parse((await lerCorpo(req)) || '{}');
      if (!tokenValido(u, corpo)) return json(res, 401, { erro: 'token inválido' });
      resumo = corpo.resumo || null;
      salvarFila();
      return json(res, 200, { ok: true });
    }

    /* ---------------- Meta: verificação do webhook ---------------- */
    if (rota === '/webhook' && req.method === 'GET') {
      const modo = u.searchParams.get('hub.mode');
      const tk = u.searchParams.get('hub.verify_token');
      const desafio = u.searchParams.get('hub.challenge');
      if (modo === 'subscribe' && tk === cfg.metaVerify) {
        console.log('webhook verificado pela Meta');
        return texto(res, 200, desafio || '');
      }
      return texto(res, 403, 'verificação falhou');
    }

    /* ---------------- recebimento das mensagens ---------------- */
    if (rota === '/webhook' && req.method === 'POST') {
      const bruto = await lerCorpo(req);

      /* -------- Twilio: form-encoded, resposta em TwiML -------- */
      if ((req.headers['content-type'] || '').includes('application/x-www-form-urlencoded')) {
        const p = new URLSearchParams(bruto);
        const de = (p.get('From') || '').replace('whatsapp:', '');
        const corpoMsg = p.get('Body') || '';
        const nome = p.get('ProfileName') || '';
        const resposta = processar(de, nome, corpoMsg);
        const escapado = String(resposta || '')
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return texto(res, 200,
          `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapado}</Message></Response>`,
          'text/xml; charset=utf-8');
      }

      const corpo = JSON.parse(bruto || '{}');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');   // responde rápido; o resto vai por fora

      /* -------- Meta (WhatsApp Cloud API) -------- */
      if (corpo.object === 'whatsapp_business_account') {
        for (const entrada of corpo.entry || []) {
          for (const mudanca of entrada.changes || []) {
            const valor = mudanca.value || {};
            const contato = (valor.contacts || [])[0] || {};
            for (const msg of valor.messages || []) {
              if (msg.type !== 'text') {
                await responder(msg.from, 'Por enquanto entendo só mensagem de texto.');
                continue;
              }
              const resposta = processar(
                msg.from,
                (contato.profile && contato.profile.name) || '',
                msg.text.body
              );
              await responder(msg.from, resposta);
            }
          }
        }
        return;
      }

      /* -------- Evolution API -------- */
      if (corpo.event && String(corpo.event).startsWith('messages')) {
        const dados = corpo.data || {};
        const chave = dados.key || {};
        if (chave.fromMe) return;
        const jid = chave.remoteJid || '';
        if (jid.endsWith('@g.us')) return;   // ignora grupos
        const de = jid.split('@')[0];
        const msg = dados.message || {};
        const t = msg.conversation ||
                  (msg.extendedTextMessage && msg.extendedTextMessage.text) || '';
        if (!t) return;
        const resposta = processar(de, dados.pushName || '', t);
        await responder(de, resposta);
        return;
      }

      return;
    }

    /* ---------------- teste rápido pelo navegador ---------------- */
    if (rota === '/' && req.method === 'GET') {
      return texto(res, 200,
        'Bot do Finanças do Casal está no ar.\n' +
        `provedor: ${cfg.provedor}\n` +
        `mensagens na fila: ${fila.filter(m => !m.entregue).length}\n`);
    }

    /* ---------------- simular uma mensagem (para testar sem WhatsApp) ---------------- */
    if (rota === '/api/simular' && req.method === 'POST') {
      const corpo = JSON.parse((await lerCorpo(req)) || '{}');
      if (!tokenValido(u, corpo)) return json(res, 401, { erro: 'token inválido' });
      const resposta = processar(corpo.de || '5500000000000', corpo.nome || 'Teste', corpo.texto || '');
      return json(res, 200, { resposta, fila: fila.filter(m => !m.entregue).length });
    }

    json(res, 404, { erro: 'rota não encontrada' });

  } catch (e) {
    console.error('erro:', e);
    json(res, 500, { erro: 'erro interno' });
  }
});

carregarFila();
setInterval(limparFila, 6 * 3600 * 1000);

servidor.listen(cfg.porta, () => {
  console.log('');
  console.log('  Bot do Finanças do Casal');
  console.log('  ------------------------');
  console.log(`  porta:      ${cfg.porta}`);
  console.log(`  provedor:   ${cfg.provedor}`);
  console.log(`  webhook:    POST /webhook`);
  console.log(`  API p/ site: GET /api/inbox?token=...`);
  console.log(`  liberado p/: ${cfg.numeros.length ? cfg.numeros.join(', ') : 'qualquer número (cuidado!)'}`);
  console.log('');
});
