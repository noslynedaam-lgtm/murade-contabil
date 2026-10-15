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

Subir este serviço não conclui por si só a integração com Fiscal e DP. O Contábil tem rotas autenticadas para receber documentos fiscais e resumos agregados de folha, mas elas só funcionam com token válido e PostgreSQL configurado. A transferência depende também do serviço de origem estar configurado e chamar essas rotas.

## Estado do produto

O cadastro da empresa começa vazio; não há lançamentos, livros ou lembretes de exemplo pré-carregados. O plano de contas é apenas um modelo editável. O PostgreSQL armazena documentos fiscais recebidos e resumos agregados do DP, mas isso não equivale a persistência multiusuário de toda a aplicação. O Contábil ainda não gera partidas automaticamente a partir dessas fontes, não fecha livros oficiais, não transmite obrigações e não substitui autenticação de usuários, conferência profissional ou autorização de acesso aos órgãos. Testar se um site responde por HTTP não comprova autenticação, procuração nem autorização para consultar dados.

O pipeline atual confere campos básicos dos registros locais. A recepção fiscal preserva documentos por CNPJ e chave; a recepção do DP aceita somente totais agregados por CNPJ e competência. Essas rotas ainda não convertem os dados em lançamentos contábeis nem geram balancete ou livros a partir das fontes integradas. Não use prévias ou registros locais para escrituração oficial sem validação profissional.

## Próximos passos para produção

1. Configurar e confirmar no Render `DATABASE_URL`, `PGSSLMODE` e o mesmo `MURADE_INTEGRATION_TOKEN` no Contábil e nos serviços de origem.
2. Implementar no DP a persistência de folhas calculadas e o envio autenticado de totais aprovados; no Fiscal, confirmar a captura real e a transferência por empresa.
3. Implementar autenticação de usuários, isolamento de empresas e uma tela segura para consultar/revisar dados importados.
4. Definir mapeamentos contábeis por operação e regime; gerar partidas dobradas auditáveis somente após regras e parâmetros aprovados.
5. Validar tributos e obrigações em homologação com responsáveis técnicos. O workflow do GitHub roda typecheck e build; não publica nem transmite dados.

## Sobre Next.js

Não foi feita migração para Next.js: o projeto existente usa Vite e contém um servidor Express próprio. A conversão requer uma decisão de arquitetura e revisão das rotas de API, configuração e implantação. O guia acima instala e executa a estrutura React/Vite atual.


## Integração Murade Fiscal

O endpoint `GET /api/integracao/fiscal/status` aceita um token Bearer compartilhado e confirma o handshake. O Contábil também oferece `POST /api/integracao/fiscal/documentos` para receber lotes fiscais autenticados e armazená-los no PostgreSQL por CNPJ e chave do documento, e `GET /api/integracao/fiscal/documentos` para leitura autenticada entre serviços. Para o DP, `POST` e `GET /api/integracao/dp/folhas` recebem e leem apenas resumos contábeis agregados; o contrato rejeita dados pessoais e usa CNPJ + competência + UUID do processamento para idempotência. A gravação fiscal retorna `lancamentosContabeisGerados: 0`, e a gravação DP também não gera partidas: ambas preservam dados de origem até haver mapeamento contábil e revisão. Configure `MURADE_INTEGRATION_TOKEN` (o mesmo segredo nos serviços), `DATABASE_URL` e `PGSSLMODE` no Render do Contábil. A ação de envio no Fiscal também exige `MURADE_CONTABIL_URL` e certificado A1 validado para a empresa selecionada. O DP ainda precisa implementar seu armazenamento e emissor do resumo. Use uma base/role com permissões restritas para o Contábil; uma instância PostgreSQL compartilhada só deve ser usada se o isolamento de acesso estiver configurado corretamente.
