# Sincronizar os dois celulares (Firebase, grátis)

Uma vez feito, os dois aparelhos veem o mesmo painel: o que um lança aparece no
outro em segundos. Leva uns 10 minutos e não precisa de cartão de crédito.

## O que fica onde

- **No Firebase (Google):** um único documento por painel, com os dados
  **compactados e criptografados no próprio celular**. Sem a senha de vocês, é
  um bloco ilegível — nem quem administra o projeto lê os lançamentos.
- **A senha não vai para o Google.** O login do Firebase recebe uma senha
  *derivada* da de vocês; a chave dos dados é outra derivação.
- **Em cada celular:** uma cópia completa. O app funciona sem internet e
  sincroniza quando a conexão volta.

## 1. Criar o projeto

1. Entre em **console.firebase.google.com** com a sua conta Google.
2. **Adicionar projeto** › nome `financas-casal` › pode desativar o Google
   Analytics › **Criar projeto**.

O plano que vem é o **Spark (gratuito)**. Não ative cobrança.

## 2. Ligar o login por e-mail

1. No menu, **Authentication** › **Vamos começar**.
2. Aba **Método de login** › **E-mail/senha** › ative a primeira chave › **Salvar**.

## 3. Criar o banco

1. No menu, **Firestore Database** › **Criar banco de dados**.
2. Local: **southamerica-east1 (São Paulo)**.
3. Modo: **produção** › **Criar**.
4. Aba **Regras**: apague tudo, cole o conteúdo do arquivo `firestore.rules`
   (na raiz do projeto) e clique em **Publicar**.

As regras dizem: cada acesso só lê e grava o próprio documento.

## 4. Pegar a configuração

1. Engrenagem ao lado de *Visão geral do projeto* › **Configurações do projeto**.
2. Em **Seus apps**, clique no ícone **Web** (`</>`), dê um apelido, **não**
   marque o Hosting, e clique em **Registrar app**.
3. Aparece um trecho `const firebaseConfig = { ... }`. Copie o `apiKey` e o
   `projectId` para o arquivo **`js/nuvem-config.js`**:

```js
window.FC_NUVEM = {
  apiKey: 'AIzaSy...',
  projectId: 'financas-casal-xxxxx'
};
```

Esses dois valores **não são segredo** — o Firebase foi feito para que eles
fiquem no site, à vista. Quem protege os dados são as regras do passo 3 e a
criptografia.

> Para testar antes de publicar: *Ajustes › Sincronização › Testar neste
> aparelho* aceita colar o trecho `firebaseConfig` direto.

## 5. Publicar e entrar

1. Publique o site com o arquivo preenchido (`git add .`, `git commit`, `git push`).
2. **No primeiro celular:** abra o site › *Criar um acesso*. Se você já usava o
   app neste aparelho, entre normalmente e vá em *Ajustes › Sincronização ›
   Ligar*.
3. **No segundo celular:** abra o site › *Entrar* com o **mesmo e-mail e a mesma
   senha**. O painel inteiro desce para ele.

O ícone de nuvem no topo mostra a situação: verde sincronizado, azul
sincronizando, amarelo sem internet, vermelho precisa de atenção.

## 6. Recomendado: fechar a porta para estranhos

Depois que o acesso do casal estiver criado, em **Authentication › Configurações
› Ações do usuário**, desmarque **Ativar criação (inscrição)**. Assim ninguém mais
consegue criar contas no seu projeto (o endereço do site é público).

Depois disso, "Criar um acesso" no app passa a dar erro — o normal é só entrar.

## Como as mudanças se juntam

- Os dois lançam ao mesmo tempo: os dois lançamentos ficam.
- Um edita o valor e o outro marca como pago, no mesmo lançamento: as duas
  mudanças ficam.
- Os dois mudam o **mesmo campo** do mesmo lançamento: fica a do aparelho que
  sincronizou por último.
- Um apaga e o outro edita: a edição sobrevive.
- Assinaturas lançadas na virada do mês pelos dois aparelhos não duplicam.
- O **tema** (claro/escuro) é de cada aparelho e não sincroniza.

## Trocar a senha

Troque em *Ajustes › Acesso e segurança* com internet. O outro celular vai
mostrar "entre de novo": bloqueie e entre com a senha nova. Até isso, ele ainda
abre com a senha antiga os dados que já tinha, mas não sincroniza.

**Não existe "esqueci minha senha"**: os dados na nuvem só abrem com ela.
Guardem-na bem e mantenham um backup em JSON de vez em quando.

## Limites do plano grátis

| | Limite | Uso típico do casal |
|---|---|---|
| Armazenamento | 1 GB | ~40 KB por painel (3 anos de histórico) |
| Leituras | 50 mil/dia | ~200 por hora de app aberto |
| Gravações | 20 mil/dia | uma por mudança |
| Tamanho de um documento | 1 MB | o app avisa se chegar perto |
