# Murade Contábil

Aplicação React + Vite servida por um backend Express/TypeScript. O repositório ainda não usa Next.js.

## Requisitos

- Node.js 20.18 ou superior
- npm 10 ou superior

## Instalação local

```bash
git clone https://github.com/noslynedaam-lgtm/murade-contabil.git
cd murade-contabil
npm ci
```

Copie `.env.example` para `.env`. `GEMINI_API_KEY` é opcional e só deve ficar no servidor. Sem ela, o chat de IA informa que está indisponível; não fabrica respostas de contabilidade.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
npm run dev
```

Abra `http://localhost:3000`. Para criar e iniciar a versão de produção:

```bash
npm run typecheck
npm run build
npm start
```

## Publicar no Render

O arquivo `render.yaml` configura um Web Service Node para este app (build, inicialização, health check e variáveis de ambiente). No Render, crie um Blueprint conectado ao repositório e selecione o `render.yaml`. O Render solicitará `GEMINI_API_KEY`; deixe-a vazia se não quiser habilitar o chat IA. Nunca coloque a chave no código nem em uma variável `VITE_*`.

O plano Free pode suspender o serviço após inatividade, causando demora no primeiro acesso. Para uso contínuo, escolha um plano sempre ativo no painel do Render.

O primeiro acesso administrativo exige `DATABASE_URL` e a variável temporária `CONTABIL_AUTH_BOOTSTRAP_TOKEN` no ambiente privado do serviço. Gere o token localmente com `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`, cadastre-o no Render, faça o deploy e abra o sistema. Na tela inicial, informe um usuário, uma senha com ao menos 12 caracteres e os CNPJs autorizados (um por linha ou separados por vírgula). A senha é armazenada com hash scrypt e a sessão usa cookie `HttpOnly`, `Secure` em produção e `SameSite=Strict`. Depois de criar o primeiro acesso, remova `CONTABIL_AUTH_BOOTSTRAP_TOKEN` do ambiente do Render.

Subir este serviço não conclui por si só a integração com Fiscal e DP. O Contábil tem rotas autenticadas para receber documentos fiscais e resumos agregados de folha, mas elas só funcionam com token válido e PostgreSQL configurado. A transferência depende também do serviço de origem estar configurado e chamar essas rotas.

## Estado do produto

O cadastro da empresa começa vazio; não há lançamentos, livros ou lembretes de exemplo pré-carregados. O plano de contas é apenas um modelo editável. A aplicação possui autenticação com autorização por CNPJ e persistência de workspace no PostgreSQL; para ativá-la em um ambiente, configure o token temporário de primeiro acesso e conclua o cadastro do administrador. Dados locais são enviados somente para CNPJs autorizados e após confirmação do banco. O Contábil ainda não gera partidas automaticamente a partir das fontes, não fecha livros oficiais nem transmite obrigações. Testar se um site responde por HTTP não comprova procuração nem autorização para consultar dados oficiais.

O pipeline atual confere campos básicos dos registros locais. A recepção fiscal preserva documentos por CNPJ e chave; a recepção do DP aceita somente totais agregados por CNPJ e competência. Essas rotas ainda não convertem os dados em lançamentos contábeis nem geram balancete ou livros a partir das fontes integradas. Não use prévias ou registros locais para escrituração oficial sem validação profissional.

## Próximos passos para produção

1. Configurar e confirmar no Render `DATABASE_URL`, `PGSSLMODE` e o mesmo `MURADE_INTEGRATION_TOKEN` no Contábil e nos serviços de origem.
2. Concluir o primeiro acesso do Contábil e confirmar a persistência dos workspaces por CNPJ no Render.
3. Construir a fila de revisão de documentos fiscais e resumos DP; nenhuma origem deve virar lançamento contábil sem mapeamento revisado.
4. Definir mapeamentos por operação e regime; gerar partidas dobradas auditáveis somente após regras e parâmetros aprovados.
5. Validar tributos e obrigações em homologação com responsáveis técnicos. O workflow do GitHub roda typecheck e build; não publica nem transmite dados.

## Sobre Next.js

Não foi feita migração para Next.js: o projeto existente usa Vite e contém um servidor Express próprio. A conversão requer uma decisão de arquitetura e revisão das rotas de API, configuração e implantação. O guia acima instala e executa a estrutura React/Vite atual.


## Integração Murade Fiscal

## Validar banco após migração

Quando `DATABASE_URL` estiver configurada no serviço, rode `npm run db:validate` no Shell do Render para conferir a estrutura e a integridade básica em modo somente leitura. Para restringir a saída a uma empresa/competência, substitua o CNPJ pelo da empresa: `npm run db:validate -- --cnpj SEU_CNPJ_SEM_PONTUACAO --competencia 2026-10`. O roteiro de comparação entre origem e destino está em [`docs/VALIDACAO_MIGRACAO_BANCO.md`](docs/VALIDACAO_MIGRACAO_BANCO.md). Essa checagem não substitui a comparação dos dados por empresa/competência nem a confirmação de backup recuperável.

## Integração Murade Fiscal

Ao receber documentos fiscais ou resumos agregados do DP, o servidor também prepara e persiste rascunhos pendentes quando os dados estão completos, autorizados e mapeados. A preparação executa ainda ao salvar mapeamentos e na reconciliação de inicialização do serviço. Ela é idempotente e isolada por CNPJ; não cria lançamentos definitivos nem transmite obrigações. A tela de revisão apenas consulta e aprova os rascunhos.

O endpoint `GET /api/integracao/fiscal/status` aceita um token Bearer compartilhado e confirma o handshake. O Contábil também oferece `POST /api/integracao/fiscal/documentos` para receber lotes fiscais autenticados e armazená-los no PostgreSQL por CNPJ e chave do documento, `GET /api/integracao/fiscal/documentos` para leitura da versão atual e `GET /api/integracao/fiscal/documentos/versoes?cnpj=<CNPJ>&chave=<CHAVE>&limite=10` para ler versões arquivadas. A leitura histórica exige o mesmo token serviço a serviço e valida a autorização do CNPJ; retorna no máximo 10 versões por chamada. Reenvio idêntico é idempotente; quando uma nota recebida com a mesma chave muda, a versão anterior é arquivada em `murade_documentos_fiscais_versoes` antes da atualização. **O token é uma credencial interna compartilhada entre os serviços, não uma credencial por empresa: quem o possuir pode operar sobre qualquer CNPJ autorizado no Contábil. Mantenha-o somente no servidor, nunca no navegador, e rotacione-o se houver exposição.** Para o DP, `POST` e `GET /api/integracao/dp/folhas` recebem e leem apenas resumos contábeis agregados; o contrato rejeita dados pessoais e usa CNPJ + competência + UUID do processamento para idempotência. Os valores de provisões de férias, 13º e outros encargos aceitam `null` enquanto ainda não forem apurados, para não registrar ausência de cálculo como zero. A gravação fiscal retorna `lancamentosContabeisGerados: 0`, e a gravação DP também não gera partidas: ambas preservam dados de origem até haver mapeamento contábil e revisão. Configure `MURADE_INTEGRATION_TOKEN` (o mesmo segredo nos serviços), `DATABASE_URL` e `PGSSLMODE` no Render do Contábil. A ação de envio no Fiscal também exige `MURADE_CONTABIL_URL` e certificado A1 validado para a empresa selecionada. O DP encaminha prévias agregadas já persistidas no próprio servidor somente após ter todos os funcionários elegíveis salvos; requer `MURADE_CONTABIL_URL=https://murade-contabil.onrender.com` e o mesmo `MURADE_INTEGRATION_TOKEN` em seu serviço. Esse caminho não equivale a folha oficial nem a geração de partidas. Use uma base/role com permissões restritas para o Contábil; uma instância PostgreSQL compartilhada só deve ser usada se o isolamento de acesso estiver configurado corretamente.
