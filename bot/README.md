# Bot de WhatsApp

Anotar gasto mandando mensagem: `35,90 mercado` e pronto.

> **O site funciona sem isto.** Se você não quiser montar servidor nenhum, use
> **Caixa de entrada › Colar mensagem** no próprio site: copia a conversa do
> WhatsApp, cola, e o mesmo interpretador faz o trabalho. Este servidor só
> automatiza esse caminho.

---

## Como funciona

```
  você no WhatsApp
        │  "461,24 terno casamento credito 4/4"
        ▼
  serviço de WhatsApp  (Meta, Twilio ou Evolution)
        │  webhook
        ▼
  este servidor  ──▶  interpreta com js/parser.js
        │              responde no WhatsApp confirmando
        │              guarda numa fila
        ▼
  o site busca a fila quando você abre
        │
        ▼
  você confere e confirma  ──▶  vira lançamento no navegador
```

O servidor **não guarda o seu controle financeiro**. Ele é uma caixa de correio:
recebe a mensagem, interpreta, e segura até o site vir buscar. Os dados de
verdade continuam no navegador de vocês.

A única coisa que o site manda para cá é um resumo curto (totais do mês e
patrimônio), e só para o bot conseguir responder quando você escreve `saldo`.
Se não quiser nem isso, apague a rota `/api/resumo` do `server.js`.

---

## Instalar

Precisa de **Node 20 ou mais novo** e, para testar com WhatsApp de verdade na
sua máquina, do **cloudflared** (cria um endereço público sem precisar de conta).
Sem dependências de npm.

```powershell
winget install OpenJS.NodeJS.LTS
winget install Cloudflare.cloudflared
```

Depois, copie o `.env.example` para `.env` e preencha.

## Testar

### 1. Sem WhatsApp nenhum

```powershell
node teste-parser.js
```

Confere o interpretador com 15 mensagens de exemplo.

### 2. Com WhatsApp de verdade (Twilio Sandbox — o caminho mais rápido)

1. **Crie uma conta gratuita em twilio.com** e, no console, abra
   *Messaging › Try it out › Send a WhatsApp message*.
2. Do celular de cada um, mande para o número do Sandbox a mensagem
   `join <duas-palavras>` que aparece na tela. Isso libera o celular no teste.
3. No `bot\.env`:
   - `PROVIDER=twilio`
   - `ALLOWED_NUMBERS=` com os números de vocês dois, com 55 e DDD,
     sem espaço nem traço (ex.: `5543999998888,5543988887777`)
4. Dê **duplo clique em `iniciar-teste.bat`**. Ele sobe o site, o bot e o túnel,
   e já copia o endereço do webhook.
5. No console da Twilio, em *Sandbox settings › When a message comes in*, cole
   o endereço, deixe o método **POST** e salve.
6. Mande `35,90 mercado` no WhatsApp. A resposta de confirmação volta em
   segundos.
7. Abra `http://127.0.0.1:8777` (**por esse endereço**, não pelo arquivo — o bot
   só aceita o site vindo dali), vá em *Ajustes › Bot do WhatsApp*, preencha o
   endereço `http://127.0.0.1:8080` e o token que o script mostrou, e clique em
   *Testar conexão* e *Buscar agora*. A mensagem aparece na Caixa de entrada.

O endereço do túnel muda toda vez que o script roda: repita o passo 5 a cada vez.
Para um endereço fixo, hospede o servidor (seção abaixo).

Quem manda do próprio celular não precisa escrever o nome: o site usa o nome do
perfil do WhatsApp para saber de quem é o gasto.

### Simular uma mensagem sem WhatsApp, com o servidor no ar

```powershell
$corpo = '{"token":"SEU_APP_TOKEN","de":"5543999998888","nome":"Enzo","texto":"35,90 mercado credito"}'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8080/api/simular -ContentType 'application/json' -Body $corpo
```

---

## Hospedar

O servidor precisa de um endereço público com HTTPS para o WhatsApp mandar o
webhook. Opções com plano gratuito ou barato:

| Onde | Como |
|---|---|
| **Railway** | conecte o repositório, defina as variáveis do `.env`, comando `node server.js` |
| **Render** | Web Service, runtime Node, start `node server.js` |
| **Fly.io** | `fly launch` e `fly secrets set APP_TOKEN=...` |
| **Sua VPS** | `node server.js` atrás de um Nginx com HTTPS |

Para testar na sua máquina, exponha a porta com `ngrok http 8080` e use a URL
que ele der.

Depois de no ar, cole em **Ajustes › Bot do WhatsApp** do site:

- **Endereço**: a URL do servidor (sem barra no fim)
- **Token**: o mesmo `APP_TOKEN` do `.env`

e clique em **Testar conexão**.

---

## Escolher o serviço de WhatsApp

### Meta — WhatsApp Cloud API (`PROVIDER=meta`)

O caminho oficial. Conta de desenvolvedor em `developers.facebook.com`, crie um
app do tipo Business e adicione o produto WhatsApp.

1. Pegue o **Token** de acesso e o **Phone number ID**
2. Em Configuração do webhook, aponte para `https://seu-servidor/webhook`
3. Use no campo "Verify token" o mesmo valor de `META_VERIFY_TOKEN`
4. Assine o evento **messages**

Preencha `META_TOKEN`, `META_PHONE_ID` e `META_VERIFY_TOKEN`.

Atenção: o token de teste da Meta vence em 24 horas. Para uso contínuo, gere um
token permanente por um usuário de sistema no Business Manager.

### Twilio (`PROVIDER=twilio`)

O mais rápido para experimentar, pelo Sandbox do WhatsApp.

1. No console da Twilio, ative o WhatsApp Sandbox
2. Em "When a message comes in", aponte para `https://seu-servidor/webhook`
3. Não precisa de chave neste servidor: a resposta volta no próprio webhook

### Evolution API (`PROVIDER=evolution`)

Alternativa self-hosted, que conversa com o WhatsApp Web. Não é a via oficial da
Meta e existe risco de bloqueio do número — avalie antes de usar com um número
importante.

Preencha `EVOLUTION_URL`, `EVOLUTION_KEY` e `EVOLUTION_INSTANCE`, e aponte o
webhook da instância para `https://seu-servidor/webhook`.

---

## Segurança

- **`ALLOWED_NUMBERS` não é opcional na prática.** Sem essa lista, qualquer
  pessoa que descobrir o endereço do webhook consegue enfiar lançamento na sua
  fila. Coloque só os números de vocês dois.
- **`APP_TOKEN` longo e aleatório.** É ele que protege a fila.
- **`SITE_ORIGIN` com o endereço real do site**, não `*`, quando estiver no ar.
- Nunca suba o `.env` para repositório público.
- **Limite conhecido:** o servidor ainda não confere a assinatura das requisições
  (`X-Twilio-Signature` na Twilio, `X-Hub-Signature-256` na Meta). Quem descobrir
  o endereço do webhook e souber um dos números liberados pode forjar uma
  mensagem. No túnel temporário, com endereço aleatório que muda a cada vez, o
  risco é pequeno; antes de deixar num endereço fixo, vale implementar essa
  checagem. O estrago máximo é um lançamento falso na caixa de entrada — que
  vocês ainda precisam confirmar antes de virar registro.
- Nada que passa por aqui é criptografado ponta a ponta: a descrição do gasto
  fica visível para o provedor de WhatsApp e para quem administra o servidor.

---

## O que o bot entende

| Mensagem | Vira |
|---|---|
| `35,90 mercado` | gasto de R$ 35,90, débito, categoria Mercado |
| `gastei 89,90 na farmacia no credito` | gasto no crédito, categoria Saúde |
| `enzo 150 combustivel debito` | gasto do Enzo, débito, Transporte |
| `461,24 terno casamento credito 4/4` | gasto parcelado, 4ª de 4 |
| `39,90 notebook credito @pai` | gasto de terceiro (a receber) |
| `recebi 4518,74 salario` | entrada de dinheiro |
| `aporte 500 tesouro selic` | aporte no investimento |
| `resgatei 200 do cdb casamento` | resgate |
| `ontem 25 uber` / `dia 15 40 mercado` | outra data |
| `saldo` | resumo do último estado que o site mandou |
| `ajuda` | lista de exemplos |

A ordem das palavras não importa muito. O interpretador procura o valor, a forma
de pagamento, os nomes cadastrados e palavras conhecidas de categoria.

Para mudar o vocabulário, edite `SINONIMOS` em `../js/parser.js` — vale para o
bot e para o site ao mesmo tempo, porque os dois usam o mesmo arquivo.

---

## Rotas

| Rota | Para quê |
|---|---|
| `GET /` | ver se está no ar |
| `GET /webhook` | verificação do webhook da Meta |
| `POST /webhook` | recebe as mensagens |
| `GET /api/ping?token=` | o site testa a conexão |
| `GET /api/inbox?token=` | o site busca a fila |
| `POST /api/inbox/ack` | o site confirma o que recebeu |
| `POST /api/resumo` | o site manda o resumo para o `saldo` |
| `POST /api/simular` | simular mensagem sem WhatsApp |
