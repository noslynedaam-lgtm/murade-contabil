# Plano de configuração contábil e proteção de dados

## Estado atual

- O PostgreSQL do Contábil responde como configurado para receber documentos fiscais e resumos agregados do DP.
- O PostgreSQL tem uma tabela preparada para resumos do DP, mas o envio do navegador está bloqueado até existir autenticação de usuário e autorização por empresa. Nenhum resumo do DP foi recebido.
- O plano de contas, centros de custo e lançamentos gerais do Contábil ainda são mantidos no `localStorage` do navegador. O backup do PostgreSQL não cobre esses dados locais.
- O `render.yaml` do Contábil define o serviço web como `free`; esse valor não revela o plano nem o estado de backup do banco PostgreSQL separado.
- O endpoint vivo do Fiscal confirma PostgreSQL conectado, leitura/escrita testadas e cofre A1 AES-256-GCM configurado; `durabilidadeVerificada` permanece `false`. O estado do plano, retenção e backups ainda precisa ser lido no painel do banco.
- O Fiscal informa em produção que o cofre A1 está configurado no PostgreSQL com AES-256-GCM. Uma consulta sem a sessão privada do navegador não encontrou certificado ativo para o CNPJ consultado; isso não verifica a sessão aberta do usuário.
- O endpoint de certificado do DP responde `instalado: false`; não armazena nem valida certificado. A tela de empresa do Contábil só selecionava o nome do arquivo e não fazia upload/validação.
- O Contábil tem tokens de serviço para chamadas backend a backend, mas não existe login de usuário nem associação de usuários a empresas. Requisições sem o token correto são recusadas; o token de serviço não identifica qual contador pode acessar cada empresa.

## Autenticação por empresa e compartilhamento entre sistemas

1. Escolher um provedor OIDC/OAuth com usuários e MFA (ou aprovar uma autenticação própria, com política de senha, MFA, redefinição, bloqueio, auditoria e revisão de segurança). Criar a aplicação e as URLs de callback para os três domínios de produção.
2. Criar no PostgreSQL as tabelas de usuários, empresas, vínculos usuário–empresa e papéis. Toda leitura ou gravação deve verificar o vínculo no servidor; CNPJ enviado pelo navegador nunca serve como autorização.
3. Validar a identidade em cada backend com JWT/JWKS ou sessão `HttpOnly`, `Secure`, `SameSite`; aplicar CSRF quando usar cookie, limitação de tentativas e registro de auditoria.
4. Migrar dados hoje guardados por navegador para registros por `empresa_id`/CNPJ validado e usuário autorizado. Fazer exportação prévia, deduplicar e conferir os totais antes de retirar os dados antigos.
5. Depois da autenticação e autorização por empresa, trocar o cofre A1 do Fiscal: manter a chave mestra somente no backend, e oferecer operações de assinatura/consulta por API com autorização delegada e curta duração. Não retornar PFX ou senha aos outros frontends. DP e Contábil chamam essa API em contexto autorizado; o Fiscal registra cada uso, finalidade e CNPJ.
6. Validar certificado e CNPJ no Fiscal, testar autorização cruzada e isolamento entre duas empresas, expiração, revogação e auditoria. Mostrar conectado nos outros sistemas só depois de uma operação real bem-sucedida.

Não ativar compartilhamento de A1 enviando apenas CNPJ, token global ao navegador, senha A1 ou chave mestra. A sessão atual do Fiscal é privada ao navegador e não equivale a uma identidade compartilhada entre domínios.

## Plano de contas por empresa

- O usuário forneceu `ExpPContas.XLS` para servir de modelo padrão. O arquivo tem 569 contas, cinco níveis, códigos, descrições, natureza D/C e tipo sintética/analítica; não inclui saldos.
- Foram encontrados quatro registros com pai ausente: `2.2.02.01.01`, `2.2.02.01.02`, `2.2.02.01.03` e `4.4.01`. A pedido do usuário, os códigos referenciais `2.2.02`, `2.2.02.01` e `4.4` foram adicionados como contas sintéticas com descrição vazia; o modelo agora tem 572 registros. Nomes e códigos não foram inferidos nem remapeados.
- O usuário confirmou que cada empresa poderá preencher ou editar esses nomes conforme seu próprio plano. A tela do Contábil permite editar a descrição de qualquer conta sem alterar o código. Essa personalização por CNPJ é salva atualmente no `localStorage` do navegador; ainda não está persistida no PostgreSQL e não acompanha o usuário em outro navegador.
- Este é o modelo operacional do usuário, não uma declaração de que o arquivo seja o plano referencial oficial do SPED/CPC. O modelo não deve gerar lançamentos ou mapeamentos automáticos sem revisão.
- O Contábil agora usa esse modelo como conjunto padrão para empresas sem plano persistido, com suporte a cinco níveis e códigos com segmentos preenchidos por zero. Dados de empresas já salvos no navegador são preservados e não são sobrescritos por uma atualização.

1. **Cadastrar ou importar o plano vigente da empresa.** Preservar código, descrição, natureza devedora/credora, nível, tipo sintética/analítica e situação. Não reutilizar códigos de outra empresa.
2. **Configurar regras por CNPJ e vigência.** Para cada origem, o responsável escolhe conta de débito, conta de crédito, centro de custo opcional, histórico e critérios (tipo de documento/operação, regime e tributo). Nenhuma conta é escolhida silenciosamente pelo sistema.
3. **Mapear DP separadamente.** Salários/proventos, benefícios, encargos patronais, FGTS, INSS/IRRF a recolher, líquido a pagar e provisões de férias/13º apontam para contas analíticas específicas do plano da empresa. Valores de provisão só entram quando calculados e aprovados.
4. **Mapear Fiscal por operação.** Entradas e saídas, contas a pagar/receber, receita/custos/estoque e tributos recuperáveis ou a recolher variam conforme operação e regime. O sistema não deve inferir tratamento fiscal apenas pelo nome da conta.
5. **Validar antes de gerar.** Exigir contas analíticas ativas existentes, CNPJ e competência, origem identificável, partidas equilibradas (débito = crédito), chave idempotente para evitar duplicidade e relatório de itens sem mapeamento.
6. **Manter estados auditáveis.** Importado → pendente de mapeamento → pré-lançamento → conferido/aprovado → contabilizado. Só a aprovação do responsável libera a gravação no diário. Guardar origem, regra/versionamento, autor e data de cada alteração.

Estrutura sugerida no PostgreSQL: plano e centros por CNPJ; regras de mapeamento por CNPJ, origem, evento, vigência e versão; lote contábil vinculado à chave da origem; partidas do lote com débito, crédito, valor e centro de custo. A gravação do plano e das partidas deve substituir a persistência atual em `localStorage` antes de anunciar que os dados estão centralizados ou protegidos por backup.

## Backups do PostgreSQL

1. No painel Render, abrir o serviço PostgreSQL real usado pelo Contábil/Fiscal/DP, conferir `Plan` e `Recovery`, e criar exportação lógica. O `render.yaml` dos apps não identifica qual banco está ligado em produção.
2. Ativar PITR pagando o plano adequado somente após confirmar custo e janela desejada. A documentação atual informa janela de 3 dias no workspace Hobby e 7 dias em Pro ou superior; Free não tem PITR nem exportações lógicas geradas pelo Render.
3. Criar cópia externa diária com `pg_dump` e armazenamento S3, usando IAM de privilégio mínimo. Proposta inicial: 30 dias de retenção, criptografia do bucket e alerta em falha. Cron Job no Render e S3 podem gerar custo; não foram criados porque faltam bucket/região/credenciais aprovadas e plano escolhido.
4. Monitorar cada execução e fazer restauração mensal em base isolada. PITR e arquivos só contam como proteção após validar uma restauração.
4. Nunca incluir senha ou arquivo do certificado A1 nos backups operacionais sem necessidade; segredos ficam em gerenciador de segredos separado.
5. Se não houver armazenamento externo configurado, usar exportação manual `pg_dump` criptografada como medida provisória. Um backup apenas no mesmo disco/serviço não é cópia independente.

## Certificado digital A1

- Manter um cofre central, vinculado ao CNPJ e a uma sessão autenticada; não copiar PFX/senha para localStorage nem replicar certificados sem necessidade.
- O cofre já existente no Fiscal usa AES-256-GCM no PostgreSQL, com chave mestra `MURADE_CERTIFICADO_A1_KEY`. O status de produção confirmou cofre configurado; isso não prova que um certificado esteja ativo nesta sessão nem que DP/Contábil tenham autorização para usá-lo.
- O DP e o Contábil devem solicitar operações ao cofre por backend autenticado e autorização explícita por CNPJ. A chave mestra e a senha A1 nunca vão ao navegador, logs ou repositório.
- Antes de habilitar uso por DP/Contábil, implementar login/autorização por empresa e vínculo de sessão comum. Depois, validar o arquivo, senha, titular/CNPJ, cadeia e validade; só então mostrar “ativo”. A3 requer integração própria com token/dispositivo e não é suportado por este fluxo A1.
- Nunca incluir certificado, senha A1 ou chave mestra em backups operacionais se isso puder ser evitado. A cópia do PostgreSQL pode conter o certificado cifrado, então a chave mestra precisa ser guardada separadamente e com controle de acesso; sem ela, os dados cifrados não são recuperáveis.

## Pré-requisitos que ainda faltam para ativar

- Aprovar provedor de login/SSO (ou autorizar autenticação própria) e cadastrar callback/segredos para os três apps.
- No Render, confirmar o banco principal, seu plano/custo e janela de PITR desejada.
- Definir um bucket S3 existente ou autorizar a criação (nome, região e orçamento); cadastrar IAM de privilégio mínimo diretamente no Render, sem compartilhar segredos no chat.
- Para cada empresa, importar o plano de contas atual ou informar que deseja somente preparar a importação. Não gerar lançamentos reais com base apenas no plano fictício inicial.
- Após a autenticação, autorização por empresa, armazenamento central e backups, fazer ensaio de isolamento empresa A/B e restauração antes de habilitar processamento automático.
