# Manual do Murade Contábil

Este manual foi escrito a partir do código e dos arquivos deste repositório (situação de 20/11/2026, último commit antes deste manual: `3472e10`).
Onde aparece **"conferir"**, a informação não pôde ser confirmada só pelo código e precisa ser verificada no painel do Render ou no próprio sistema.

Não há neste manual nenhuma senha, chave, token ou dado de cliente. Os valores secretos ficam **somente** no painel do Render (aba *Environment*).

---

## Índice

**PARTE 1 — Para o dono (sem programar)**

1. [O que o sistema faz](#1-o-que-o-sistema-faz)
2. [As telas (menu da esquerda) e a barra do topo](#2-as-telas-menu-da-esquerda-e-a-barra-do-topo)
3. [Os robôs e conferidores](#3-os-robôs-e-conferidores)
4. [Como ver se um robô parou e como usar o "Rodar agora"](#4-como-ver-se-um-robô-parou-e-como-usar-o-rodar-agora)
5. [Como o Contábil recebe dados do Fiscal e do DP](#5-como-o-contábil-recebe-dados-do-fiscal-e-do-dp)
6. [Como saber se o sistema está no ar](#6-como-saber-se-o-sistema-está-no-ar)
7. [Render passo a passo: ver erros, reiniciar, publicar, voltar versão](#7-render-passo-a-passo-ver-erros-reiniciar-publicar-voltar-versão)
8. [Variáveis de ambiente (só os nomes e para que servem)](#8-variáveis-de-ambiente-só-os-nomes-e-para-que-servem)
9. [Backups](#9-backups)
10. [Problemas comuns e o que fazer](#10-problemas-comuns-e-o-que-fazer)

**PARTE 2 — Para o programador**

11. [Stack (tecnologias)](#11-stack-tecnologias)
12. [Pastas e arquivos importantes](#12-pastas-e-arquivos-importantes)
13. [Rodar no computador](#13-rodar-no-computador)
14. [Testes](#14-testes)
15. [Publicar (deploy)](#15-publicar-deploy)
16. [Banco de dados e tabelas principais](#16-banco-de-dados-e-tabelas-principais)
17. [Onde fica cada robô no código](#17-onde-fica-cada-robô-no-código)
18. [Agente IA (Gemini)](#18-agente-ia-gemini)
19. [Integração com Fiscal, DP e Fisco IA (rotas)](#19-integração-com-fiscal-dp-e-fisco-ia-rotas)
20. [Login, isolamento por escritório e por empresa](#20-login-isolamento-por-escritório-e-por-empresa)
21. [Regras do dono que o código precisa respeitar](#21-regras-do-dono-que-o-código-precisa-respeitar)
22. [Pontos para conferir](#22-pontos-para-conferir)

---

# PARTE 1 — Para o dono (sem programar)

## 1. O que o sistema faz

O Murade Contábil é o sistema de **contabilidade** da família Murade (Fiscal, DP, Contábil, Fisco IA, Agente IA). Ele:

- **Recebe** do Murade Fiscal as notas fiscais (NF-e/CT-e) e as apurações de tributo já confirmadas (DIFAL, IRPJ/CSLL/PIS/COFINS do Presumido).
- **Recebe** do Murade DP os resumos da folha (só totais, sem nome nem CPF de funcionário), o pró-labore e os eventos de 13º e rescisão.
- **Prepara sozinho os pré-lançamentos** (rascunhos em partidas dobradas) a partir desses dados, quando a empresa tem o "mapeamento de contas" feito.
- **Não contabiliza sozinho**: o lançamento definitivo só nasce quando uma pessoa aprova (tela **Aprovar lançamentos** ou **Revisar dados recebidos**). Isso é regra do código, de propósito.
- Mantém **plano de contas**, **lançamentos manuais**, **balancete**, **DRE e Balanço gerenciais**, **livros** (Diário, Razão) em PDF/XLS.
- **Gera os arquivos da ECD (Leiaute 9) e da ECF** (Lucro Presumido e Lucro Real). A validação no PGE da Receita, a assinatura e a transmissão continuam sendo feitas **fora do sistema**, pelo contador.
- Tem a **Agente IA** (por texto e por voz) que consulta e faz tarefas usando as mesmas regras das telas; o que altera dados sempre pede confirmação.
- Tem **robôs** que rodam sozinhos no servidor (lista na seção 3).
- É **instalável como aplicativo** no celular/tablet/computador (arquivos `public/manifest.webmanifest`, `public/sw.js`, `public/app-instalavel.js`).

Endereço público do sistema (padrão usado no código): `https://murade-contabil.onrender.com`.

## 2. As telas (menu da esquerda) e a barra do topo

Menu da esquerda (arquivo `src/components/Sidebar.tsx`), na ordem padrão. Cada pessoa pode reordenar as favoritas em **Meu jeito**.

| Item do menu | Para que serve |
|---|---|
| **Tela Inicial** | Resumo geral da empresa selecionada. |
| **Cadastro de Empresa** | Dados da empresa (CNPJ, regime etc.). Daqui também se exclui uma empresa (uma por vez, com duas confirmações). |
| **Agenda & Lembretes** | Lembretes e prazos. |
| **Fluxo Prevítico** | Tela de fluxo/previsão (conferir o uso real com a contadora). |
| **Obrigações & Gestão** | Marcado no menu como "Em configuração". |
| **Gestão contábil** | Painel de gestão contábil. |
| **Conexão Órgãos** | Situação de conexão com órgãos (Receita, SERPRO via Fisco IA). Marcado como "Pendente". |
| **Lançamentos** | Lançamentos contábeis da empresa. |
| **Aprovar lançamentos** | Pré-lançamentos esperando aprovação. O número no menu mostra quantos estão pendentes. |
| **Balancete** | Balancete da competência. |
| **Livros Fiscais & ECD** | Diário, Razão, Balancete, DRE, Balanço (PDF/XLS) e geradores de ECD/ECF. |
| **Plano de Contas** | Plano de contas da empresa (modelo padrão editável). |
| **Migração Contábil** | Importação de dados de outro sistema (4 etapas). |
| **Integrações** | Situação da ligação com Fiscal e DP, botões manuais e o painel **Saúde dos robôs**. No fim, para o dono, o painel **Backup completo do banco**. |
| **Revisar dados recebidos** | O que chegou do Fiscal e do DP, mapeamento de contas por empresa, prévias, conciliação e aprovação final. |
| **Calculadora 3D** | Calculadora. |
| **Agentes & Robô** | Tela da Agente e de uma conferência local feita no navegador (ver observação na seção 3). |
| **Tarefas da equipe** | Pedidos que a administradora faz à equipe. |
| **Backups** | Backup mensal cifrado do escritório: ver, **Gerar agora** e **Baixar**. |
| **Meu jeito** | Preferências pessoais aprendidas pela Agente (ordem do menu etc.). |
| **IA Murade Premium** | Tela da IA (voz). |

Barra escura no topo (arquivo `src/components/ContabilAccessGate.tsx`):

- **Conta: (seu login)** — mostra quem está logado.
- **Usuários e licenças** (no celular aparece só "Usuários") — só para administrador. Ali ficam: convites, acessos por empresa, a equipe e, **só para o dono do sistema**, o painel **Escritórios que contrataram o sistema** e o painel de dúvidas enviadas ao supervisor.
- **Segurança** (ícone de escudo) — código de segurança (2 etapas) da conta.
- **Sair**.

## 3. Os robôs e conferidores

Os robôs de verdade rodam **no servidor** (arquivo `server.ts`). Eles começam a rodar alguns segundos/minutos depois que o sistema liga e depois repetem no intervalo abaixo. Se o serviço estiver desligado (por exemplo, plano gratuito "dormindo"), eles param até o serviço voltar.

| Nome (como aparece na tela) | O que faz | Quando roda | Tem "Rodar agora"? |
|---|---|---|---|
| **Robô Reconciliador** | Lê o que o Fiscal e o DP mandaram, aplica sozinho o mapeamento padrão de contas quando código e descrição batem e prepara os pré-lançamentos. Nunca aprova nada. | 1 s depois de ligar e a cada **1 minuto** | Sim |
| **Robô Contabilizador** | Transformaria pré-lançamento em lançamento definitivo. **Não tem rotina automática por regra**: lançamento definitivo só com aprovação de uma pessoa. Aparece como "aguardando configuração". | Nunca sozinho | Não (de propósito) |
| **Robô Mensageiro** | Reenvia os pedidos entre as Agentes dos sistemas Murade que não chegaram ao destino. | A cada **1 minuto** | Sim |
| **Robô Conferidor** | Confere todas as empresas: o que falta para fechar o mês (aprovações, rascunhos do Fiscal e do DP, folha do DP que não virou partida, depreciação, partidas) e se a ECD do ano anterior está pronta (Balanço, DRE, assinaturas, plano referencial). | 45 s depois de ligar e a cada **30 minutos** | Sim (e também o botão **Conferir fechamento agora**) |
| **Robô de Empresas do Fiscal** | Traz do Fiscal as empresas que ainda não existem no Contábil. Não altera o que já existe, não traz certificado nem senha e nunca recria empresa excluída. | 2 min depois de ligar e a cada **1 hora** | Sim |
| **Robô Conferidor de Empresas Excluídas** | Só lê: avisa se uma empresa excluída no Fiscal ainda sobrou no Contábil. Nunca apaga sozinho. | 2,5 min depois de ligar e a cada **1 hora** | Sim |
| **Robô Conferidor de Acessos** | Confere se contas/escritórios excluídos ou bloqueados não deixaram acesso ou sessão aberta, mantendo os e-mails livres para novo cadastro. | 1,5 min depois de ligar e a cada **1 hora** | Sim |
| **Robô Conferidor de Segurança do Login** | Só lê as últimas 24 h do login (senhas e códigos errados, bloqueios, códigos de emergência, dono sem código ligado) e avisa o que fugir do normal. | ~2 min depois de ligar e a cada **2 horas** | Sim |
| **Robô de Tarefas da Equipe** | Refaz aviso de tarefa que não chegou, lembra quem não abriu o pedido em mais de 2 horas úteis e avisa quando o prazo vence. Nunca conclui nem apaga tarefa. | 2,5 min depois de ligar e a cada **15 minutos** | Sim |
| **Robô Conferidor do Meu Jeito** | Confere se as regras que a Agente aprendeu de cada pessoa ainda valem; pausa as obsoletas e limpa o que ficou velho. | ~3 min depois de ligar e a cada **24 horas** | Sim |
| **Robô Conferidor da Apresentação** | Só lê: confere se a apresentação falada do sistema ainda bate com o código (robôs, telas, integrações). | ~3,3 min depois de ligar e a cada **24 horas** | Sim |
| **Robô de Backups Mensais** | Confere se cada escritório tem o backup cifrado do mês, gerado e conferido; gera de novo se faltar ou falhar; mantém só o do mês corrente e avisa o escritório por e-mail. | 2,5 min depois de ligar e a cada **1 hora** | Sim |
| **Robô de Backup do Banco** | Backup COMPLETO do banco, cifrado, para fora do Render, todo dia a partir das **3h (Brasília)**. Guarda 7 diários, 4 semanais e 12 mensais. Alerta se passar de 26 h sem backup. Fica desligado até as variáveis do destino serem configuradas. **Só o dono do sistema vê este robô.** | Verifica a cada **10 minutos** se está na hora | Sim (e o botão **Fazer backup agora**) |
| **Robô Conferidor do Piloto Visível** | Só lê: confere se as telas, campos e botões que a Agente usa para mostrar/preencher ainda existem no código. | ~2,8 min depois de ligar e a cada **24 horas** | Sim |
| **Robô Conferidor de Serviço Feito** | Evita retrabalho: libera os "estou fazendo" esquecidos depois de 15 minutos, apaga registros com mais de 120 dias. Só mexe no próprio registro. | ~2,8 min depois de ligar e a cada **15 minutos** | Sim |

Observação sobre a tela **Agentes & Robô**: ela usa um "motor" que roda **no navegador** (`src/services/muradeRobosEngine.ts`) e faz uma conferência local da tela. Não é o mesmo que os robôs do servidor acima. O estado verdadeiro dos robôs é o do painel **Saúde dos robôs** (seção 4).

## 4. Como ver se um robô parou e como usar o "Rodar agora"

**Aviso automático:** se algum robô passar de 3 vezes o seu intervalo sem rodar, aparece em todas as telas uma **faixa vermelha** no topo: "Atenção: o robô X parou de rodar no tempo esperado". A faixa se atualiza a cada 5 minutos.

**Ver o painel completo:**

1. Entre no sistema.
2. No menu da esquerda, clique em **Integrações**.
3. Role a tela até o quadro **Saúde dos robôs**.
4. Cada robô mostra: estado (ativo / parado / aguardando configuração), quando rodou pela última vez, quantas vezes rodou, falhas, último erro e o resumo do que fez.
5. Clique em **Atualizar** (no canto do quadro) para ler de novo.

**Rodar agora (só o dono do sistema vê o botão):**

1. No mesmo quadro **Saúde dos robôs**, embaixo do robô desejado, clique em **Rodar agora**.
2. O botão muda para "Disparando…" e depois "Rodando agora…". O resultado aparece no painel em instantes (clique em **Atualizar**).
3. Se o robô já estiver rodando, o sistema avisa para aguardar.
4. O Robô Contabilizador não tem o botão, de propósito.

**Botões manuais que qualquer usuário da empresa vê** (tela **Integrações**, quadro "Automático e manual, lado a lado"):

- **Reprocessar recepção desta empresa** — reaplica o mapeamento padrão e prepara de novo os rascunhos com o que já chegou do Fiscal e do DP. Não aprova nada.
- **Conferir fechamento agora** — roda o Robô Conferidor na hora (no máximo uma vez por minuto).

**Pela Agente IA:** pode pedir por voz ou texto, por exemplo "como estão os robôs?" ou "roda o robô conferidor agora".

## 5. Como o Contábil recebe dados do Fiscal e do DP

Ordem do fluxo: **Fiscal → DP → Contábil** e **Fiscal → Contábil**. Quem **manda** são o Fiscal e o DP; o Contábil **recebe e guarda**. O Contábil não consulta a SEFAZ.

1. O **Fiscal** guarda as notas e manda para o Contábil por uma fila que tenta de novo sozinha (a cada 60 s, segundo `docs/INTEGRACAO_CONTABIL_CENTRAL.md`). As apurações confirmadas pela contadora vão por outra fila.
2. O **DP** manda o resumo da folha (só totais) quando todos os funcionários da competência têm prévia salva; também manda pró-labore e eventos de 13º/rescisão. A fila do DP tenta de novo a cada 30 s.
3. Os três sistemas usam a **mesma** variável secreta `MURADE_INTEGRATION_TOKEN`. Se ela for diferente em um deles, a entrega falha.
4. O Contábil grava tudo no banco, separado por CNPJ. Reenviar o mesmo dado não duplica.
5. O **Robô Reconciliador** (a cada minuto) transforma o que chegou em **pré-lançamentos**, se a empresa tiver mapeamento de contas.
6. Uma pessoa revisa e aprova em **Aprovar lançamentos** ou **Revisar dados recebidos**.

**Como conferir se está chegando:**

1. Menu **Integrações**: os quadros "Murade Fiscal" e "Murade Departamento Pessoal" mostram quantos documentos/resumos foram recebidos para a empresa selecionada e se a API do outro sistema respondeu.
2. Menu **Revisar dados recebidos**: lista os documentos do Fiscal e os resumos do DP por competência e mostra o que falta mapear.
3. Se chegou mas não virou pré-lançamento, normalmente falta o **Mapeamento de contas por empresa** (em **Revisar dados recebidos**). O Robô Conferidor também aponta folha que não virou partida.

**Empresas:** o Robô de Empresas do Fiscal traz as empresas novas do Fiscal. Quando uma empresa é excluída no Fiscal, o Fiscal pode mandar o Contábil apagar aquela empresa (uma por vez); o CNPJ **nunca fica bloqueado** para novo cadastro.

## 6. Como saber se o sistema está no ar

**Jeito mais simples:** abra no navegador `https://murade-contabil.onrender.com/api/health`.
Se aparecer um texto com `"status":"ok"` e `"system":"Murad Contábil"`, o servidor está no ar. Essa página não mostra dados de clientes.

**No Render:**

1. Entre em `https://dashboard.render.com`.
2. Clique no serviço **murade-contabil** (código interno `srv-db64f0bbc2fs73ap4jh0`).
3. No topo da página do serviço aparece o estado (por exemplo "Live" em verde quando está no ar; "Deploying" quando está publicando; "Failed" quando a publicação falhou).

O Render usa esse mesmo endereço `/api/health` para checar a saúde do serviço (configurado em `render.yaml`).

Atenção: o `render.yaml` diz `plan: free`. No plano gratuito o Render pode "adormecer" o serviço sem uso, e o primeiro acesso demora; enquanto dorme, **os robôs não rodam**. O plano real em uso deve ser conferido no painel (**conferir**).

## 7. Render passo a passo: ver erros, reiniciar, publicar, voltar versão

> Os nomes dos botões abaixo são os do painel do Render em inglês. Se o Render mudar algum nome, procure o equivalente (**conferir** na tela).
> **Antes de reiniciar ou publicar, confirme que ninguém (você ou a contadora) está cadastrando ou testando**: reiniciar derruba o que estão fazendo.

### 7.1 Ver os erros (Logs)

1. Entre em `https://dashboard.render.com`.
2. Clique no serviço **murade-contabil**.
3. No menu da esquerda do serviço, clique em **Logs**.
4. Aparecem as mensagens do servidor em tempo real. Erros costumam ter as palavras "Falha", "Erro" ou "[Murad Contábil]".
5. Use a caixa de busca dos Logs para procurar, por exemplo, `Falha no Robô` ou o nome de um robô.

Mensagens úteis que o sistema escreve:
- `[Murad Contábil] Servidor ativo em ...` — o sistema ligou.
- `[Murad Contábil] Reconciliação de rascunhos habilitada a cada 60 segundos ...` — o Robô Reconciliador foi ligado.
- `Falha no Robô ...` — um robô deu erro naquela rodada (ele tenta de novo na próxima).
- `Exceção não capturada; reiniciando` — erro grave; o processo sai e o Render liga de novo sozinho.

### 7.2 Reiniciar (Restart)

1. Abra o serviço **murade-contabil** no Render.
2. No canto superior direito, clique no botão **Manual Deploy** (abre uma lista).
3. Escolha **Restart service** (reinicia a mesma versão, sem publicar nada novo). Se essa opção não estiver nessa lista, procure **Restart** no menu do serviço (**conferir**).
4. Espere o estado voltar para **Live**.

### 7.3 Publicar a versão mais nova (Manual Deploy)

Normalmente não precisa: todo envio (push) para a branch `main` no GitHub publica sozinho (`autoDeploy: true` no `render.yaml`). Exceção: commits com `[skip render]` na mensagem **não** publicam.

Para publicar na mão:
1. Abra o serviço **murade-contabil**.
2. Clique em **Manual Deploy** (canto superior direito).
3. Escolha **Deploy latest commit**.
4. Acompanhe em **Events** ou **Logs**. Leva alguns minutos (instala, compila e liga).

### 7.4 Voltar para uma versão anterior (Rollback)

1. Abra o serviço **murade-contabil**.
2. No menu da esquerda, clique em **Events**.
3. Aparece a lista de publicações (deploys) com data e mensagem do commit.
4. Na publicação que funcionava, clique em **Rollback** (ou "Rollback to this deploy").
5. Confirme. Espere o estado voltar para **Live**.
6. Importante: o rollback volta o **código**; o **banco de dados não volta**. E o próximo push na `main` publica de novo a versão nova (**conferir** se o Render desliga o auto-deploy depois de um rollback).

### 7.5 Mudar uma variável de ambiente

1. Abra o serviço **murade-contabil**.
2. No menu da esquerda, clique em **Environment**.
3. Para mudar: clique no lápis/editar ao lado do nome. Para criar: **Add Environment Variable**.
4. Clique em **Save Changes** (ou **Save, rebuild and deploy**). Isso reinicia o sistema.

### 7.6 Banco de dados

O banco é PostgreSQL, **compartilhado** com os outros sistemas Murade (código interno `dpg-db80ev0u01pc738eju5g-a`). No Render, ele aparece como um item separado (tipo "PostgreSQL") na lista de serviços. Plano, backups e janela de recuperação do banco: **conferir** no painel do banco.

## 8. Variáveis de ambiente (só os nomes e para que servem)

Ficam no Render, em **murade-contabil > Environment**. **Nunca** coloque os valores no código, no GitHub ou no chat.

| Nome | Para que serve | Obrigatória? |
|---|---|---|
| `DATABASE_URL` | Endereço do banco PostgreSQL. Sem ela não há login, empresas nem robôs que usam banco. | Sim |
| `PGSSLMODE` | `require` liga conexão segura com o banco. | Sim (o `render.yaml` já define) |
| `NODE_ENV` | `production` no Render. | Sim (já definido) |
| `MURADE_INTEGRATION_TOKEN` | Senha interna que liga Contábil, Fiscal, DP e Fisco IA. **Tem de ser igual nos sistemas.** | Sim, para integração |
| `GEMINI_API_KEY` | Chave do Google Gemini para a Agente IA. Sem ela a Agente avisa que está indisponível. | Para a IA |
| `GEMINI_MODEL` | Modelo principal do Gemini (o `render.yaml` define um). | Opcional |
| `GEMINI_MODEL_RAPIDO` | Modelo rápido tentado primeiro. | Opcional |
| `GEMINI_TTS_MODEL` | Modelo da voz premium. | Opcional |
| `VOZ_PREMIUM` | Com o valor `ligada`, usa a voz do Gemini; senão, a voz do navegador (econômica). | Opcional |
| `CONTABIL_AUTH_BOOTSTRAP_TOKEN` | Código temporário só para criar o **primeiro** administrador. Depois deve ser apagado. | Só no primeiro acesso |
| `MURADE_DONO_SISTEMA` | Login(s) do dono do sistema, separados por vírgula. Se vazio, o dono é o primeiro administrador criado. | Recomendado |
| `MURADE_2FA_OBRIGATORIO_DONO` | Se for `nao`, o código de segurança deixa de ser obrigatório para o dono. Se não existir, é obrigatório (quando a chave mestra existe). | Opcional |
| `MURADE_BACKUP_MASTER_KEY` | Chave mestra que cifra os backups mensais dos escritórios e o segredo do código de segurança (2 etapas). Guardar cópia em lugar seguro. | Sim, para backups mensais e 2 etapas |
| `MURADE_BACKUP_CHAVE` | Senha que cifra o backup completo do banco. Sem ela o backup completo fica desligado. Sem ela não se abre o backup. | Para backup completo |
| `MURADE_BACKUP_S3_ENDPOINT` | Endereço do armazenamento externo (ex.: Backblaze B2). | Para backup completo |
| `MURADE_BACKUP_S3_BUCKET` | Nome do "bucket" (pasta principal) do armazenamento. | Para backup completo |
| `MURADE_BACKUP_S3_ACCESS_KEY` | Chave de acesso do armazenamento. | Para backup completo |
| `MURADE_BACKUP_S3_SECRET_KEY` | Chave secreta do armazenamento. | Para backup completo |
| `MURADE_BACKUP_S3_REGION` | Região do bucket. | Para backup completo |
| `EMAIL_FROM` | Remetente dos e-mails (convites, senha, aviso de backup). | Para e-mail |
| `RESEND_API_KEY` | Envio de e-mail pelo serviço Resend (alternativa ao SMTP). | Uma das duas formas |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Envio de e-mail por servidor SMTP (alternativa ao Resend). | Uma das duas formas |
| `PUBLIC_APP_URL` | Endereço usado nos links dos e-mails/convites. Se faltar, usa `RENDER_EXTERNAL_URL`. | Opcional |
| `RENDER_EXTERNAL_URL` | Preenchida pelo próprio Render. | Automática |
| `PORT` | Porta do servidor (o Render define; padrão 3000). | Automática |
| `MURADE_FISCAL_URL`, `MURADE_DP_URL`, `MURADE_CONTABIL_URL`, `MURADE_FISCOIA_URL` | Endereços dos outros sistemas. Se faltar, usa os endereços padrão `*.onrender.com` gravados no código. | Opcional |
| `MURADE_FISCO_IA_URL` | Endereço do Fisco IA usado só na tela **Conexão Órgãos** (situação do SERPRO). Atenção: nome diferente de `MURADE_FISCOIA_URL` (ver seção 22). | Opcional |

Usadas só pelo programador (não vão no Render): `DATABASE_URL_RESTAURAR` (script de restauração), `TEST_DATABASE_URL` e `MURADE_TESTE_PG_URL` (testes com banco).

## 9. Backups

Existem **dois** backups diferentes:

1. **Backup mensal do escritório** (menu **Backups**)
   - Cada escritório vê só o próprio. Cifrado, guardado dentro do próprio banco (tabela `murade_contabil_backups`).
   - O **Robô de Backups Mensais** gera sozinho; o botão **Gerar agora** gera na hora; **Baixar** baixa o arquivo.
   - Fica só o backup do **mês corrente** (decisão do dono de 06/11/2026); o anterior é apagado depois que o novo é conferido. O escritório recebe cópia por e-mail.
   - Precisa da variável `MURADE_BACKUP_MASTER_KEY`.

2. **Backup completo do banco** (só o dono vê)
   - Menu **Integrações**, role até o fim: quadro **Backup completo do banco (só o dono do sistema vê)**.
   - Botões **Fazer backup agora** e **Conferir o último backup**.
   - Vai para um armazenamento **fora do Render** (S3/Backblaze), cifrado com `MURADE_BACKUP_CHAVE`.
   - O próprio quadro mostra o passo a passo de configuração quando falta alguma variável.
   - Restaurar: só um programador, num banco **novo e vazio**, com `scripts/restaurar-backup.ts` (seção 16).

## 10. Problemas comuns e o que fazer

| Problema | O que fazer |
|---|---|
| Sistema não abre / demora muito na primeira vez | Pode estar "acordando" (plano gratuito). Espere 1 minuto e recarregue. Se continuar, veja `/api/health` (seção 6) e os **Logs** (seção 7.1). |
| Faixa vermelha "o robô X parou" | Vá em **Integrações > Saúde dos robôs**, veja o "último erro". Clique **Rodar agora**. Se continuar, veja os **Logs** e, se preciso, **Restart** (7.2). |
| Nota do Fiscal ou folha do DP não aparece | 1) **Integrações**: veja se a API do Fiscal/DP aparece acessível. 2) Confira se `MURADE_INTEGRATION_TOKEN` é igual nos sistemas. 3) Confira se o Fiscal/DP está no ar. 4) Clique **Reprocessar recepção desta empresa**. |
| Chegou mas não virou pré-lançamento | Falta mapeamento de contas: **Revisar dados recebidos > Mapeamento de contas por empresa**. Depois clique **Reprocessar recepção desta empresa**. |
| Agente IA diz "indisponível" | Falta `GEMINI_API_KEY` ou a cota do Gemini acabou. Veja os **Logs** ("Erro na chamada Gemini"). |
| Agente diz "Muitos pedidos em pouco tempo" | Limite de 40 pedidos a cada 10 minutos por sessão. Espere alguns minutos. |
| Tela pede "Configurar primeiro acesso" | O banco está vazio de usuários. Siga a seção "Ativar primeiro acesso no Render" de `docs/INTEGRACAO_CONTABIL_CENTRAL.md`. |
| Dono não consegue entrar sem ligar o código de segurança | É obrigatório para o dono. Ligue o código em **Segurança**. (Só um programador muda isso, pela variável `MURADE_2FA_OBRIGATORIO_DONO`.) |
| Aplicativo instalado mostra versão velha | Abra `https://murade-contabil.onrender.com/reparar.html`: limpa a versão guardada no aparelho sem apagar usuário, senha ou dados. |
| Empresa excluída no Fiscal ainda aparece aqui | O Robô Conferidor de Empresas Excluídas avisa. Exclua em **Cadastro de Empresa** (uma por vez) ou peça à Agente por voz. |
| Alerta "Faz X h sem backup do banco" | Em **Integrações > Backup completo do banco**, veja o erro e clique **Fazer backup agora**. Confira as variáveis `MURADE_BACKUP_*`. |
| Publicação no Render falhou ("Failed") | Abra **Events** > o deploy que falhou > leia o erro. Para voltar a funcionar já, faça **Rollback** (7.4) e chame um programador. |

---

# PARTE 2 — Para o programador

## 11. Stack (tecnologias)

- **Node.js ≥ 20.18** (`package.json > engines`); a CI usa Node 22.
- **Backend:** Express 4 em TypeScript, num único processo (`server.ts`). Em desenvolvimento roda com `tsx`; em produção é empacotado com **esbuild** para `dist/server.cjs`.
- **Frontend:** React 19 + Vite 6 + Tailwind 4 (SPA). Em desenvolvimento, o Vite roda como middleware dentro do Express; em produção, o Express serve `dist/` e devolve `index.html` para qualquer rota que não seja `/api`.
- **Banco:** PostgreSQL via `pg` (pool de no máximo 5 conexões, `src/server/authContabil.ts`). As tabelas são criadas pelo próprio código (`CREATE TABLE IF NOT EXISTS`) — não há ferramenta de migração.
- **IA:** `@google/genai` (Gemini).
- **E-mail:** Resend (HTTP) ou SMTP via `nodemailer` (`src/server/emailMurade.ts`).
- **Outros:** `jszip` (backups), `qrcode` (código de segurança), `@f-o-t/xml` (XML), `lucide-react` (ícones), `motion`.
- **Consultas externas:** BrasilAPI para CNPJ e CEP (`/api/receita/cnpj/:cnpj`, `/api/receita/cep/:cep`).

## 12. Pastas e arquivos importantes

```
server.ts                   Servidor inteiro: rotas, integração, robôs (agendamento), Agente, arquivos estáticos
render.yaml                 Configuração do serviço no Render (build, start, health check, variáveis)
.env.example                Modelo de variáveis para rodar local (sem valores)
.github/workflows/ci.yml    GitHub Actions: npm ci, typecheck, test, build (não publica)
index.html, vite.config.ts  Entrada do frontend
public/                     Ícones, manifest e service worker (app instalável), reparar.html
src/App.tsx                 Tela principal e troca de abas (tabAtiva)
src/main.tsx                Inicialização do React
src/components/             Componentes; tabs/ = uma tela por item do menu; modals/
src/components/Sidebar.tsx  Menu da esquerda
src/components/ContabilAccessGate.tsx  Login, primeiro acesso, barra do topo, usuários/licenças
src/components/PainelRobos.tsx         Quadro "Saúde dos robôs"
src/components/AlertaRobosParados.tsx  Faixa vermelha de robô parado
src/server/                 Lógica de servidor (auth, stores de integração, conferidores, Agente, backup)
src/server/backupBanco/     Backup completo do banco (dump, cripto, S3, restauração)
src/services/               ECD/ECF, backup mensal por escritório, migração, plano referencial
src/utils/                  Regras de negócio puras (fechamento, livros, origens contábeis etc.)
src/data/                   Plano de contas modelo, plano referencial, textos da apresentação, mapa de telas
scripts/testes/             Testes automatizados (node:test via tsx)
scripts/restaurar-backup.ts Restaura backup completo num banco novo e vazio
scripts/validar-migracao-banco.mjs  Conferência só-leitura da estrutura do banco
docs/                       Documentos técnicos (integração, ECD, plano de contas/backups, validação de migração)
```

## 13. Rodar no computador

```bash
git clone https://github.com/noslynedaam-lgtm/murade-contabil.git
cd murade-contabil
npm ci
cp .env.example .env      # no Windows PowerShell: Copy-Item .env.example .env
# preencha no .env pelo menos DATABASE_URL (um Postgres de teste, NUNCA o de produção)
npm run dev               # abre em http://localhost:3000
```

Sem `DATABASE_URL`, o login não funciona (a tela avisa). Sem `GEMINI_API_KEY`, a Agente responde que está indisponível.

Versão de produção local:

```bash
npm run typecheck
npm run build             # vite build + esbuild -> dist/
npm start                 # node dist/server.cjs (defina NODE_ENV=production para servir dist/)
```

Outros comandos (`package.json`): `npm run lint` / `npm run typecheck` (tsc), `npm run clean` (apaga `dist/`), `npm run db:validate` (confere a estrutura do banco em modo só leitura; veja `docs/VALIDACAO_MIGRACAO_BANCO.md`).

## 14. Testes

```bash
npm test                  # tsx --test scripts/testes/*.test.ts
```

- São ~53 arquivos em `scripts/testes/` (mais dois em `src/server/*.test.ts`, que **não** entram no `npm test` pelo padrão do glob — **conferir** se devem entrar).
- Alguns testes usam um Postgres de teste: `TEST_DATABASE_URL` e `MURADE_TESTE_PG_URL`. O de backup completo é pulado sem `MURADE_TESTE_PG_URL`; os que usam `TEST_DATABASE_URL` — **conferir** como se comportam sem a variável.
- A CI (GitHub Actions) roda `typecheck`, `test` e `build` a cada push/PR na `main`. Ela **não** publica no Render.
- Testes que conferem coerência do sistema: `robosRodarAgora.test.ts`, `apresentacao.test.ts`, `mapaTelasContabil.test.ts`, `pilotoVisivel.test.ts` (quebram se você criar robô/tela sem atualizar a apresentação e o mapa da Agente).

## 15. Publicar (deploy)

- **Push na `main` = publicação automática** no Render (`autoDeploy: true`). Serviço `srv-db64f0bbc2fs73ap4jh0`.
- Build no Render: `npm ci && npm run build`. Start: `npm start`. Health check: `/api/health`.
- Para enviar um commit **sem** publicar/reiniciar (ex.: só documentação), coloque `[skip render]` na mensagem do commit.
- Publicar **reinicia** o processo: sessões em andamento e robôs no meio da rodada são interrompidos. O dono pede para **não publicar enquanto ele ou a contadora estão usando**.
- Antes de publicar: `npm run typecheck && npm test && npm run build`.

## 16. Banco de dados e tabelas principais

PostgreSQL **compartilhado** com os outros sistemas Murade (`dpg-db80ev0u01pc738eju5g-a`). Por isso as tabelas do Contábil têm prefixo `contabil_` ou `murade_..._origem`; **nunca** apague/renomeie tabelas sem prefixo do Contábil — podem ser de outro sistema. As tabelas são criadas sozinhas na inicialização.

| Tabela | O que guarda | Onde é criada |
|---|---|---|
| `contabil_auth_users` | Usuários (login, hash scrypt da senha, `global_admin` = administrador de escritório, `office_owner`, `tenant_id`, `disabled`). | `src/server/authContabil.ts` |
| `contabil_auth_company_access` | Quais CNPJs cada usuário acessa e com qual papel (admin/operator/viewer). | idem |
| `contabil_auth_sessions` | Sessões de login. | idem |
| `contabil_auth_invites` | Convites. | idem |
| `contabil_auth_senha_resets`, `contabil_auth_marcadores` | Troca de senha e marcadores da gestão de equipe. | `src/server/gestaoEquipe.ts` |
| `contabil_login_falhas`, `contabil_eventos_seguranca`, `contabil_2fa`, `contabil_dispositivos_confiaveis` | Segurança do login (tentativas, eventos, código de 2 etapas, aparelhos confiáveis). | `src/server/segurancaLogin.ts` (prefixo `contabil`) |
| `contabil_company_workspaces` | **O coração**: um JSON (`payload`) por CNPJ com plano de contas, lançamentos, pré-lançamentos, mapeamentos, imobilizado, ECD/ECF etc. Tem coluna `version` (controle de concorrência). | `authContabil.ts` |
| `contabil_empresas_compartilhadas` | Cadastro básico das empresas (vindo do Fiscal ou cadastrado aqui). | `authContabil.ts` |
| `contabil_period_closures` | Fechamentos de competência. | `authContabil.ts` |
| `contabil_accounting_approval_audit` | Auditoria das aprovações de lançamentos integrados (quem, quando, valor). | `authContabil.ts` |
| `contabil_manual_journal_events`, `contabil_manual_journal_audit`, `contabil_opening_balance_audit` | Lançamentos manuais/estornos e saldos iniciais, com auditoria. | `authContabil.ts` |
| `contabil_ai_agent_log` | Registro do que a Agente propôs/confirmou/recusou. | `authContabil.ts` |
| `murade_documentos_fiscais_origem` / `murade_documentos_fiscais_versoes` | Notas recebidas do Fiscal (versão atual / versões anteriores). | `src/server/documentosFiscaisStore.ts` |
| `murade_apuracoes_fiscais_origem` | Apurações confirmadas vindas do Fiscal. | `src/server/apuracoesFiscaisStore.ts` |
| `murade_folhas_dp_origem` | Resumos agregados da folha vindos do DP. | `src/server/dadosDpStore.ts` |
| `murade_prolabore_dp_origem` | Pró-labore vindo do DP. | `src/server/dadosProLaboreStore.ts` |
| `murade_eventos_dp_origem` | 13º e rescisões vindos do DP. | `src/server/dadosDpEventosStore.ts` |
| `agente_pedidos` | Pedidos entre as Agentes dos sistemas Murade. | `src/server/agentesEntreSistemas.ts` |
| `contabil_atividade_equipe` | Atividade da equipe do escritório. | `src/server/atividadeEscritorio.ts` (nome passado em `server.ts`) |
| `contabil_tarefas_equipe`, `contabil_tarefas_equipe_avisos` | Tarefas da equipe e avisos. | `src/server/tarefasEquipe.ts` |
| `contabil_meu_jeito` | Preferências aprendidas por pessoa. | `src/server/meuJeito.ts` |
| `contabil_servico_registro` | "Serviço feito / estou fazendo" (anti-retrabalho). | `src/server/servicoFeito.ts` |
| `contabil_empresas_excluidas_arquivo` | Arquivo do que foi apagado na exclusão de empresa em cascata. | `src/server/exclusaoEmpresaCascata.ts` |
| `murade_contabil_backups` | Backups mensais cifrados por escritório (bytea). | `src/services/backupEscritorioContabilService.ts` |
| `murade_backup_banco_log` | Registro dos backups completos do banco (a coluna `sistema` separa os sistemas). | `src/server/backupBanco/servico.ts` |

**Restaurar o backup completo** (só num banco NOVO e VAZIO, nunca no de produção; o script recusa se o destino for igual ao `DATABASE_URL`):

```bash
DATABASE_URL_RESTAURAR="<url do banco novo>" MURADE_BACKUP_CHAVE="<chave>" \
  npx tsx scripts/restaurar-backup.ts --arquivo caminho/do/backup.mbk
# ou direto do armazenamento (com as variáveis MURADE_BACKUP_S3_*):
npx tsx scripts/restaurar-backup.ts --sistema contabil --ultimo
```

## 17. Onde fica cada robô no código

- **Registro e estado** (não sobreposição, última execução, erros, alerta, "Rodar agora"): `src/server/robosStatus.ts`. Um robô é "parado" quando passou de 3× o intervalo sem rodar. O estado fica **em memória**: ao reiniciar, os contadores zeram.
- **Agendamento** (`setTimeout` inicial + `setInterval`): `server.ts`, por volta das linhas 1425–1590; o Reconciliador fica dentro do `app.listen` (por volta da linha 1672 em diante).
- **Rotas:** `GET /api/robos/status` (o robô `backup_banco` só aparece para o dono) e `POST /api/robos/:id/rodar-agora` (só dono).

| id | Lógica principal |
|---|---|
| `reconciliador` | `server.ts` (função `reconciliarRascunhos`) + `src/server/prepararRascunhosContabeis.ts` |
| `contabilizador` | Sem rotina (aprovação manual: `POST /api/workspaces/:cnpj/contabilizar`) |
| `mensageiro` | `src/server/agentesEntreSistemas.ts` (`reenviarPendentes`) |
| `conferidor` | `src/server/conferidorContabil.ts`, `conferidorFolhaDP.ts`, `conferidorEcd.ts` |
| `empresas_fiscal` | `src/server/empresasDoFiscal.ts` + `server.ts` (`sincronizarEmpresasDoFiscal`) |
| `empresas_excluidas` | `src/server/exclusaoEmpresaCascata.ts` (`sobrasDeEmpresasExcluidas`) |
| `acessos` | `src/server/conferidorAcessos.ts` |
| `seguranca_login` | `src/server/segurancaLogin.ts` |
| `tarefas_equipe` | `src/server/tarefasEquipe.ts` |
| `meu_jeito` | `src/server/meuJeito.ts` |
| `apresentacao` | `src/server/conferidorApresentacao.ts` + `src/data/apresentacaoSistema.ts` |
| `backups` | `src/server/conferidorBackupsContabil.ts` + `src/services/backupEscritorioContabilService.ts` |
| `backup_banco` | `src/server/backupBanco/servico.ts` (`rodadaDoRobo`, hora 3h Brasília, retenção 7/4/12) |
| `piloto` | `src/server/conferidorPiloto.ts` + `src/data/mapaTelasContabil.ts` |
| `servico_feito` | `src/server/servicoFeito.ts` |

**Ao criar um robô novo:** registre com `registrarRobo({...})`, agende com `executarRobo(id, ...)`, registre o `registrarRotinaManual` (botão "Rodar agora"), acrescente o bloco na apresentação (`src/data/apresentacaoSistema.ts`) e, se a Agente precisar, a ferramenta em `src/server/agenteContabil.ts`. Rode `npm test` — o Robô Conferidor da Apresentação e os testes acusam o que faltar.

## 18. Agente IA (Gemini)

- **Motor** (igual no DP, Fiscal e Contábil): `src/server/agenteMotor.ts`. Princípios escritos no topo do arquivo: a IA **nunca** acessa o banco direto; cada ferramenta chama uma rota que já existe, **com a sessão do usuário** (o servidor chama a si mesmo em `http://127.0.0.1:PORT`), então as mesmas permissões valem. Consultas rodam na hora; alterações viram **ação pendente** que a pessoa confirma (exclusão pede **duas** confirmações). Tudo vai para o registro (`contabil_ai_agent_log`).
- **Ferramentas do Contábil:** `src/server/agenteContabil.ts` (34 ferramentas: listar empresas, pendências, fechamentos, status de robôs/integrações/backup, rodar robô, reprocessar recepção, apagar empresa, contabilizar pré-lançamentos, fechar competência, delegar tarefa, meu jeito, apresentar sistema, chamar supervisor etc.). Ferramentas entre sistemas: `src/server/ferramentasEntreSistemas.ts`; piloto visível (mostrar/preencher na tela): `src/server/pilotoContabil.ts`.
- **Gemini:** `server.ts` (início do arquivo: `getAI`, `gerarComReserva` — tenta `GEMINI_MODEL_RAPIDO` e depois `GEMINI_MODEL`; função `modeloGeminiAgente`). Sem `GEMINI_API_KEY` a rota responde 503.
- **Rotas:** `POST /api/ai/agente`, `/continuar`, `/confirmar`, `/recusar`, `/saudacao`, `/nome`, `/piloto/registro`, `GET /api/ai/agente/registro`, `POST /api/ai/chat` (chat simples), `POST /api/tts` (voz premium, `src/server/vozGeminiTTS.ts`).
- **Limites:** pedido até 30.000 caracteres; 40 pedidos por sessão a cada 10 minutos.
- Outros arquivos: `agenteEntendimento.ts` (regras de entendimento), `agenteSaudacao.ts`, `respostasRapidas.ts` (respostas sem custo de IA).

## 19. Integração com Fiscal, DP e Fisco IA (rotas)

Autenticação serviço-a-serviço: cabeçalho `Authorization: Bearer <MURADE_INTEGRATION_TOKEN>` (mesmo segredo em todos). O token é uma credencial **global** interna: nunca vai ao navegador. Detalhes de contrato em `docs/INTEGRACAO_CONTABIL_CENTRAL.md`.

**Recebidas pelo Contábil:**

| Rota | Quem chama | O que faz |
|---|---|---|
| `GET /api/integracao/fiscal/status` | Fiscal | Handshake (confirma token). |
| `POST /api/integracao/fiscal/documentos` / `GET` | Fiscal | Recebe/lê notas por CNPJ + chave. Idempotente; versão anterior vai para `..._versoes`. |
| `GET /api/integracao/fiscal/documentos/versoes` | Fiscal | Lê até 10 versões de uma nota. |
| `POST /api/integracao/fiscal/apuracoes` / `GET` | Fiscal | Apurações **confirmadas** (DIFAL, IRPJ/CSLL/PIS/COFINS Presumido). |
| `GET /api/integracao/dp/status` | DP | Handshake do DP. |
| `POST /api/integracao/dp/folhas` / `GET` | DP | Resumo agregado da folha (sem dado pessoal; payload até 16 KB; idempotente por CNPJ + competência + `processamentoId`; mesmo id com outro conteúdo = 409). |
| `POST /api/integracao/dp/prolabore` | DP | Pró-labore (totais). |
| `POST /api/integracao/dp/eventos` / `GET` | DP | 13º e rescisão pagos. |
| `DELETE /api/integracao/empresa/:cnpj` | Fiscal (ou outro) | Exclui UMA empresa em cascata (acessos, cadastro, workspace, atividade); preserva fechamentos, auditorias e documentos de origem; não bloqueia o CNPJ. |
| `POST /api/integracao/agente/mensagem` | Agentes dos outros sistemas | Pedidos entre Agentes. |

**Chamadas pelo Contábil a outros sistemas:**

- Fiscal `GET /api/integracao/fiscal/empresas` (Robôs de Empresas do Fiscal e de Empresas Excluídas).
- Fiscal `GET /api/integracao/contabil/status` e DP `GET /api/integracao/contabil/ping` (tela Integrações; endereços fixos no código).
- DP `GET /api/integracao/licenca?cnpj=` (licença por empresa; `GET /api/licenca`).
- Fisco IA `GET /api/serpro/status-integracao` (tela Conexão Órgãos; só lê se as variáveis do SERPRO existem lá, não faz consulta paga).
- Agentes dos outros sistemas (`agentesEntreSistemas.ts`, endereço via `urlDoSistema`).

**Rotas antigas que só respondem "não configurado":** `GET /api/integracao/fiscal/empresas` e `/empresa-ativa` **deste** sistema, `POST /api/integracao/fiscal/conectar`, `GET /api/integracao/dp/dados`, `POST /api/integracao/dp/conectar`, `POST /api/integracao/empresas`. Não são usadas pelo fluxo atual (**conferir** antes de remover, se algum front ainda chama).

**Do recebido ao lançamento:** stores (`documentosFiscaisStore.ts`, `apuracoesFiscaisStore.ts`, `dadosDpStore.ts`, `dadosProLaboreStore.ts`, `dadosDpEventosStore.ts`) → `prepararRascunhosContabeis.ts` (rascunhos idempotentes, só com mapeamento válido) → aprovação humana em `POST /api/workspaces/:cnpj/contabilizar` (revalida origem e mapeamento e grava lançamento + auditoria numa transação).

## 20. Login, isolamento por escritório e por empresa

Arquivo central: `src/server/authContabil.ts`.

- **Primeiro acesso:** só com `CONTABIL_AUTH_BOOTSTRAP_TOKEN` (`POST /api/auth/bootstrap`). Senha mínima de 12 caracteres, hash scrypt. Cookie de sessão `HttpOnly`, `Secure` em produção, `SameSite=Strict`.
- **Escritório (tenant):** cada usuário tem `tenant_id`. O administrador de escritório (`global_admin = true`) é o dono do tenant; a equipe tem `office_owner` apontando para ele e herda as empresas dele.
- **Empresa:** o acesso é por CNPJ (`contabil_auth_company_access`). Toda rota de workspace confere se o CNPJ está na sessão (`sessao.cnpjs`). Um CNPJ não pode ser de dois escritórios diferentes (checagem ao cadastrar empresa).
- **Workspace:** `contabil_company_workspaces` é chaveado só por CNPJ; o isolamento vem da checagem de acesso acima.
- **Backups mensais:** toda leitura filtra por `tenant_id` no próprio SQL; a chave de cifra é derivada por escritório.
- **Dono do sistema** (`sessao.donoSistema`): login listado em `MURADE_DONO_SISTEMA` (ou, se vazio, o primeiro administrador criado). Só ele vê/usa: "Rodar agora", robô e painel de backup completo do banco, painel de escritórios, trazer empresas do Fiscal. Código de 2 etapas obrigatório para ele (salvo `MURADE_2FA_OBRIGATORIO_DONO=nao`).
- **Proteções:** `exigirOrigemNavegador` (bloqueia POST de outra origem), `exigirSessaoContabil`, `trust proxy` ligado (Render). Erros não tratados viram JSON genérico; exceção síncrona derruba o processo para o Render religar.

## 21. Regras do dono que o código precisa respeitar

Estas regras aparecem no código e nos comentários; quem mantiver o sistema deve preservá-las:

- Lançamento **definitivo só com aprovação de uma pessoa** (o Contabilizador não roda sozinho).
- **Excluir não bloqueia** CNPJ nem e-mail: só apaga, para poder cadastrar de novo.
- Excluir é **uma empresa por vez, com duas confirmações**; nada de "apagar tudo".
- Toda funcionalidade automática tem também **opção manual** ao lado (ex.: "Rodar agora", "Reprocessar recepção").
- Funções de **administração do sistema** só para o dono (não aparecem para escritórios clientes).
- Funcionalidade nova deve ter **robô/conferidor** e poder ser pedida **por voz à Agente**.
- Consultas **pagas ao SERPRO** só por clique de uma pessoa, nunca por robô.
- Dados do DP chegam **sem dados pessoais** (só totais).
- Valor não apurado é `null` ("Não apurado"), **nunca zero**.
- Sistema precisa funcionar bem em celular, tablet e computador e ser instalável.

## 22. Pontos para conferir

1. **Plano do Render:** `render.yaml` diz `plan: free`; o plano real do serviço e do banco precisa ser conferido no painel. No gratuito, os robôs param quando o serviço dorme.
2. **Nome do endereço do Fisco IA:** `server.ts` usa `MURADE_FISCO_IA_URL`; `src/server/agentesEntreSistemas.ts` usa `MURADE_FISCOIA_URL`. Hoje os dois caem no mesmo endereço padrão, mas se alguém configurar só um deles, a outra parte continua no padrão.
3. **Endereços fixos:** a rota `GET /api/integracao/status` usa os endereços do Fiscal e do DP escritos no código (não lê `MURADE_FISCAL_URL`/`MURADE_DP_URL`).
4. **Testes em `src/server/*.test.ts`** (`emailMurade.test.ts`, `sessaoCelular.test.ts`) não entram no glob do `npm test`.
5. **Botões do Render** (Restart, Rollback) podem mudar de nome/lugar; e se o auto-deploy fica desligado depois de um Rollback.
6. **Backups do PostgreSQL no Render** (plano do banco, PITR, retenção): não aparecem no código.
7. **Telas "Fluxo Prevítico", "Obrigações & Gestão" e "Conexão Órgãos"**: o uso real de cada uma deve ser confirmado com o dono/contadora; o menu marca "Em configuração" e "Pendente".
8. **Rotas antigas de integração** que só respondem "não configurado" (seção 19): conferir se alguma tela ainda chama antes de remover.
9. **README.md** tem partes desatualizadas (ex.: "O Contábil ainda não gera partidas automaticamente"), enquanto o código já prepara rascunhos e gera ECD/ECF. Em caso de dúvida, vale o código e este manual.
