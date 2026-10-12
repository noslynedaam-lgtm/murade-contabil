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

Subir este serviço não conecta automaticamente os serviços Fiscal e DP hospedados separadamente. As integrações entre eles ainda precisam dos endereços públicos e do contrato de API de cada sistema, além de autenticação segura e armazenamento persistente. Até isso ser implementado, o app apresenta esses módulos como não conectados e não importa nem transmite dados.

## Estado do produto

O aviso “Ambiente de demonstração” é intencional. O cadastro da empresa começa vazio; não há lançamentos, livros ou lembretes de exemplo pré-carregados. O plano de contas é apenas um modelo editável. Ainda não há banco de dados, persistência multiusuário, integração autenticada com SEFAZ/eSocial, gestão de certificado, transmissão de obrigações ou rotina agendada. As APIs de integração respondem como indisponíveis até serem implementadas e configuradas. Testar se um site responde por HTTP não comprova autenticação, procuração nem autorização para consultar dados.

O pipeline atual só pode conferir campos básicos dos registros locais. Ele não calcula tributos, importa folhas ou XMLs, fecha livros, transmite declarações nem substitui revisão profissional. Não use os exemplos para escrituração oficial.

## Próximos passos para produção

1. Definir banco de dados, autenticação de usuários, isolamento por empresa e política de retenção.
2. Implementar integrações oficiais com credenciais e ambientes de homologação próprios.
3. Validar as regras tributárias e trabalhistas com responsáveis técnicos e fontes oficiais vigentes.
4. Proteger endpoints de escrita, adicionar auditoria e revisar LGPD, certificados e segredos.
5. Configurar o provedor de hospedagem e variáveis de ambiente no painel dele. O workflow do GitHub roda typecheck e build; não publica nem transmite dados.

## Sobre Next.js

Não foi feita migração para Next.js: o projeto existente usa Vite e contém um servidor Express próprio. A conversão requer uma decisão de arquitetura e revisão das rotas de API, configuração e implantação. O guia acima instala e executa a estrutura React/Vite atual.
