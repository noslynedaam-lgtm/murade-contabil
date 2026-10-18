# Validação da migração do PostgreSQL

Este roteiro prepara a conferência do banco persistente do Murade Contábil. A verificação automatizada é somente leitura: não cria tabelas, não altera registros e não imprime `DATABASE_URL`, senhas, hashes, nomes de usuários ou dados de empresas.

## Comando automatizado

No Shell do serviço **murade-contabil** no Render, execute na pasta raiz do repositório:

```bash
npm run db:validate
```

Para conferir uma empresa e uma competência específicas, informe o CNPJ sem pontuação e o período no formato `AAAA-MM`:

```bash
npm run db:validate -- --cnpj SEU_CNPJ_SEM_PONTUACAO --competencia 2026-10
```

Substitua `SEU_CNPJ_SEM_PONTUACAO` pelo CNPJ real da empresa que está sendo conferida.

O comando precisa da variável `DATABASE_URL` configurada no serviço. Ele entra em uma transação PostgreSQL somente leitura, confere as tabelas e colunas essenciais de autenticação, workspaces, auditoria, recebimentos do Fiscal e resumos do DP, procura chaves de empresa malformadas e resume quantidades de registros. Quando `PGSSLMODE=require`, a conexão exige TLS com validação do certificado; o validador não desativa a verificação para contornar erros de certificado. Com `--cnpj`, também informa contagens do workspace, origens, aprovações e auditoria daquela empresa, e sinaliza se o CNPJ interno do workspace estiver ausente ou não corresponder à chave persistida; com `--competencia`, limita os registros por período quando aplicável. O CNPJ usado como filtro não é impresso no relatório. O código de saída é `0` quando a estrutura e as verificações básicas passam, `1` quando há estrutura/dados pendentes e `2` quando não foi possível conectar ou validar.

Mensagens `PENDENTE` indicam a tabela/coluna ausente ou a integridade básica que precisa de análise. O comando não corrige o banco. Se a estrutura estiver incompleta, confirme primeiro que a versão atual do serviço foi implantada e que a inicialização autenticada do schema terminou; depois rode novamente.

## Conferência da migração de dados

Na importação de CSV/TXT com coluna CNPJ, qualquer linha sem CNPJ ou de outra empresa bloqueia o arquivo inteiro; separe por empresa e corrija a origem antes de importar. Arquivos sem coluna CNPJ exibem um aviso para conferência manual da empresa ativa. Pacotes JSON Murade aceitam somente os campos do formato definido; propriedades extras ou status desconhecidos são rejeitados, e estados de aprovação antigos não são confiados nem importados como aprovação atual. Lançamentos migrados precisam de nova revisão e aprovação no destino.

O validador informa contagens do destino, mas não consegue provar sozinho que todos os dados da origem foram copiados. Antes de liberar a migração:

1. Preserve a exportação original e confirme que existe backup/snapshot do PostgreSQL no provedor. A execução do script não cria nem verifica backups.
2. Registre na origem, por empresa e competência, os totais de empresas, contas, centros de custo, lançamentos definitivos, aprovações e registros de auditoria a migrar.
3. Execute `npm run db:validate` e compare as quantidades do destino com o inventário da origem. Diferenças devem ser explicadas e resolvidas; uma contagem igual, sozinha, não valida conteúdo.
4. Para cada CNPJ autorizado, compare amostras de códigos de contas, saldos, lançamentos, referências, competências e totais de débito/crédito. Confirme que a empresa não enxerga registros de outro CNPJ.
5. Atualize a tela, entre novamente e confira que os registros continuam no PostgreSQL. Não faça uma segunda importação até confirmar o comportamento de duplicidades e a idempotência do pacote utilizado.
6. Só depois de reconciliar a origem e o destino, validar a trilha de auditoria e confirmar o backup, considere a migração aprovada.

Na tela **Migração Contábil**, a confirmação de gravação só aparece depois da resposta positiva do PostgreSQL. Se o servidor rejeitar algum dado, a etapa permanece em revisão e a mensagem de erro precisa ser resolvida antes de tentar novamente. A validação automatizada continua sendo somente leitura e não aprova conteúdo contábil.

O aplicativo mantém algumas informações legadas no navegador e as gravações atuais no PostgreSQL; a existência de `DATABASE_URL` ou um handshake entre serviços não comprova que o histórico local foi importado integralmente. O processo não apaga a origem local. A limpeza da cópia local deve ocorrer somente depois de uma conferência independente e de um backup recuperável.

## Preparação para Fiscal e Departamento Pessoal

Depois da validação do banco, a integração só pode ser conferida quando os dois serviços estiverem disponíveis e autenticados. Use uma empresa autorizada e uma competência controlada, confirme os estados de fila nas origens, receba o lote no Contábil e compare identificador, CNPJ, competência, versão e totais com a fonte. Repita o mesmo lote para verificar idempotência e uma versão nova com novo identificador para confirmar preservação do histórico. Divergências ficam pendentes; nenhum lançamento definitivo ou envio oficial deve ser produzido automaticamente.

### Critérios objetivos do ensaio

Os endpoints de integração abaixo são serviço a serviço e exigem `Authorization: Bearer <MURADE_INTEGRATION_TOKEN>`. Não coloque o token em comandos salvos, capturas de tela, navegador ou chamados. O `GET` de status é somente leitura; os `POST` persistem dados no PostgreSQL e só devem ser usados durante um ensaio autorizado, com CNPJ e competência conferidos:

| Origem | Verificação de conexão (não grava dados) | Recebimento persistente (grava dados) | Evidência mínima de sucesso |
| --- | --- | --- | --- |
| Fiscal | `GET /api/integracao/fiscal/status` | `POST /api/integracao/fiscal/documentos` | `conectado`, `recebimentoFiscalConfigurado` e `dadosCompartilhados` são avaliados separadamente; o POST confirma recebidos/novos/atualizados/inalterados e discrimina entradas/saídas. Depois, o GET autenticado de documentos deve localizar os mesmos identificadores no escopo do CNPJ e período; o endpoint separado de versões permite conferir as versões arquivadas. |
| DP | `GET /api/integracao/dp/status` | `POST /api/integracao/dp/folhas` | `conectado`, `recebimentoDPConfigurado` e `dadosCompartilhados` são avaliados separadamente; o POST confirma o UUID do processamento, CNPJ, competência e resumo agregado persistido. Depois, o GET autenticado de folhas deve recuperar essa mesma versão. |

Para leitura histórica fiscal, use `GET /api/integracao/fiscal/documentos/versoes?cnpj=<CNPJ>&chave=<CHAVE>&limite=10` com o mesmo Bearer serviço a serviço. A resposta é somente leitura, limitada a 10 versões, e só é liberada quando o CNPJ está autorizado. O endpoint retorna os documentos arquivados em JSON, que podem conter dados fiscais pessoais; não copie a resposta para logs ou evidências públicas.

`dadosCompartilhados: true` por si só não prova que a competência esperada chegou: é necessário comparar registros e totais no GET filtrado com o painel/outbox da origem. Para Fiscal, comparar cada chave, data, tipo Entrada/Saída e valor total; datas de emissão impossíveis ou timestamps inválidos devem ser rejeitados. O endpoint de Contábil preserva o JSON do documento, mas não prova que a SEFAZ forneceu todos os XMLs/eventos. Para DP, comparar `processamentoId`, competência e todos os valores agregados; campos ainda não apurados devem permanecer `null`, nunca ser completados com zero.

Resultados esperados durante o ensaio: repetir um documento fiscal com a mesma chave e conteúdo deve ser idempotente; se o conteúdo da mesma chave mudar, a versão anterior é arquivada em `murade_documentos_fiscais_versoes` antes da atualização. Repetir a mesma folha com o mesmo UUID e conteúdo retorna a versão existente; reutilizar UUID com valores diferentes deve resultar em HTTP 409. CNPJ não autorizado deve resultar em HTTP 403, contrato inválido em HTTP 400/422 e banco indisponível em HTTP 503. Registre somente status HTTP, contagens e identificadores técnicos não sensíveis; nunca exporte token, certificado, CPF, nomes ou dados bancários para evidência.

Receber a origem pode preparar rascunhos cobertos pelas regras existentes, mas a resposta informa `lancamentosContabeisGerados: 0`. Nenhum recebimento, reconciliação ou tarefa periódica deve aprovar/contabilizar automaticamente, fechar competência ou enviar obrigação a portal oficial. A aprovação do contador permanece uma etapa separada.

### Limite conhecido da importação histórica

A migração contábil agora transforma lançamentos do arquivo em propostas manuais pendentes de aprovação, marca o sistema de origem e preserva a classificação declarada no arquivo como dado não verificado. A gravação usa a trilha atual de eventos manuais, que registra quem fez a importação agora; ela não cria autoria nem aprovação histórica. Enquanto pendentes, as propostas ficam fora dos livros e do balancete. Linhas com contas inexistentes ou sintéticas, códigos repetidos no plano/centros e lançamentos duplicados/indistinguíveis bloqueiam a importação inteira para evitar perda silenciosa de movimento. Conflitos com cadastros existentes também bloqueiam substituições automáticas. Antes de considerar a migração completa, confira os lançamentos, aprove ou rejeite cada proposta e compare os totais com a origem. A persistência do pacote, sozinha, não equivale à aprovação do inventário contábil migrado.

O teste de conectividade, o recebimento de dados e a reconciliação contábil são etapas diferentes. O validador do banco não testa SEFAZ, eSocial, certificado, transmissão, cálculo fiscal ou correção dos dados de origem. O teste real dessas integrações continua pendente até os serviços, credenciais e ambiente controlado estarem disponíveis.
