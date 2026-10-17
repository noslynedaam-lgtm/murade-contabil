# Integração central do Murade Contábil

## Objetivo

O Murade Contábil é o consumidor central da escrituração. O Fiscal e o Departamento Pessoal continuam sendo as fontes oficiais dos dados que produzem. O Contábil consulta essas fontes por CNPJ e competência, sem exigir redigitação ou envio manual de arquivos.

## Fontes e dados

| Origem | Dados a consultar | Chave de deduplicação |
| --- | --- | --- |
| Murade Fiscal | NF-e/CT-e recebidos e emitidos que a fonte disponibilizar; XML autorizado; livros de entrada e saída; apurações e guias com período, tributo, base e situação | CNPJ + chave de acesso; para apuração, CNPJ + tributo + competência + versão da origem |
| Murade DP | Folha processada por competência; eventos e encargos calculados; provisões de férias e 13º; identificadores do processamento e situação de validação | CNPJ + competência + tipo de evento + identificador/versão do processamento |
| Cadastro empresarial | Razão social, nome fantasia, CNPJ, inscrições, endereço/UF e contato empresarial | CNPJ |

Certificados, senhas, CPF de funcionário, dados bancários e documentos pessoais não fazem parte do contrato geral de integração. O DP deve fornecer agregados contábeis por competência; detalhes individuais exigem finalidade e autorização próprias.

## Fluxo esperado

1. Ao abrir uma empresa ou solicitar relatório, o Contábil consulta as APIs autenticadas do Fiscal e do DP para o CNPJ e a competência ativa.
2. Cada resposta registra origem, instante de consulta, competência, versão e identificador do registro de origem.
3. O importador é idempotente: consultar novamente atualiza a mesma origem ou registra uma nova versão; não duplica lançamento.
4. Dados fiscais e de folha são preservados como documentos de origem. O Contábil calcula rascunhos contábeis em partidas dobradas, ligados aos documentos que os originaram.
5. Classificações sem regra confiável ficam pendentes. Diferenças, documentos incompletos e cálculos não validados aparecem como pendência, sem inventar valores.
6. Balancete e demonstrações usam somente lançamentos contabilizados para a empresa e competência. Livros e declarações oficiais só recebem status de preparados ou transmitidos após validação e confirmação real do órgão.

## Segurança e disponibilidade

- Comunicação entre serviços usa HTTPS e `MURADE_INTEGRATION_TOKEN` no cabeçalho Bearer. O segredo permanece no servidor e nunca é enviado ao navegador.
- Toda consulta limita o escopo ao CNPJ solicitado e valida o CNPJ no serviço de origem.
- As rotas de leitura de documentos fiscais e agregados do DP não podem ser expostas como proxy público sem autenticação de usuário e autorização da empresa.
- O Render Blueprint do Contábil agora espera `DATABASE_URL` como segredo. Aponte para um PostgreSQL durável e confirme backups/retenção no provedor. Pode ser uma instância existente apenas se as permissões e o isolamento entre serviços estiverem adequados; o plano gratuito do web service não torna arquivos locais persistentes.
- Em indisponibilidade de uma fonte, o Contábil mantém a última consulta identificada como desatualizada e mostra a falha; não informa que está atualizado.

## Estado de implementação

- O handshake permanece separado do processamento e não prova que os dados foram transferidos nem que o banco de destino está disponível.
- O Fiscal oferece `GET /api/integracao/fiscal/documentos?cnpj=...`, com autenticação, filtro opcional de período e paginação.
- O Contábil recebe lotes por `POST /api/integracao/fiscal/documentos` e grava documentos de origem no PostgreSQL em tabela separada por CNPJ, chave e competência. A leitura serviço a serviço usa `GET` autenticado na mesma rota. No Fiscal atual, uma outbox persistente envia os documentos já armazenados ao Contábil em segundo plano, com tentativa inicial após a inicialização e repetição a cada 60 segundos. Requer PostgreSQL, `MURADE_CONTABIL_URL` e `MURADE_INTEGRATION_TOKEN` configurados no serviço Fiscal; não consulta a SEFAZ para buscar novas notas.
- O Contábil oferece `POST /api/integracao/dp/folhas` e `GET /api/integracao/dp/folhas`, autenticados com o mesmo token serviço a serviço. O contrato aceita somente `quantidadeFuncionarios`, `folhaBruta`, `outrosProventos`, `descontosINSS`, `descontosIRRF`, `descontosOutros`, `liquidoFolha`, `fgts`, `inssPatronal`, `provisaoFerias`, `provisao13` e `encargosOutros`, por CNPJ e competência. O payload é limitado a 16 KB e rejeita campos pessoais ou adicionais. `processamentoId` deve ser UUID; a chave idempotente é CNPJ + competência + identificador. O estado do receptor aparece em `/api/integracao/dp/status` como `recebimentoDPConfigurado`, separado de `dadosCompartilhados`.
- O DP persiste prévias salariais individuais no PostgreSQL e, quando todas as pessoas elegíveis de uma competência têm prévia, forma um resumo agregado sem nomes, CPFs ou dados bancários. A fila tenta entregar o resumo ao Contábil após a formação do resumo e a cada 30 segundos, com repetição em caso de falha. Requer PostgreSQL, `MURADE_CONTABIL_URL` e `MURADE_INTEGRATION_TOKEN` configurados no serviço DP. Encargos patronais e provisões ainda não apurados são enviados como `null`, nunca como zero.
- A tela autenticada **Revisão das Origens** consulta documentos do Fiscal e resumos do DP por CNPJ e competência. Valores nulos aparecem como “Não apurado”. O recebimento e a revisão não geram lançamentos por si só.
- A tela permite salvar, no workspace persistente e isolado por CNPJ, o mapeamento revisado de seis origens agregadas: entradas, saídas, folha bruta, INSS descontado, IRRF descontado e FGTS. O servidor valida origem, unicidade e contas analíticas existentes. Isso ainda é configuração de classificação; não gera lançamentos automaticamente. Notas de entrada variam por CFOP/operação, e tributos destacados, encargos patronais e provisões precisam de regras próprias antes de calcular partidas.
- A mesma tela calcula uma prévia não persistida de partidas da folha a partir dos resumos DP, somente quando os totais necessários estão apurados, descontos não mapeados são zero, o líquido concilia e as contas revisadas existem. A prévia não alimenta o balancete nem cria lançamento; o contador ainda precisa validar a regra e a origem antes de qualquer contabilização.
- Rascunhos fiscais e do DP são preparados com referências idempotentes e persistidos por empresa. A aprovação final passa por endpoint autenticado no servidor, que revalida os dados de origem e mapeamentos atuais, grava lançamento + status aprovado + auditoria do usuário em transação PostgreSQL e recusa dados que mudaram desde a prévia. O endpoint geral de workspace preserva lançamentos integrados já aprovados e não permite ao navegador criá-los ou alterar seu estado. A etapa continua limitada às regras de rascunho disponíveis e não equivale a fechamento de folha, validação fiscal completa ou transmissão oficial.
- A tela autenticada de Revisão das Origens consulta o histórico de aprovações do PostgreSQL por CNPJ (`GET /api/workspaces/:cnpj/historico-aprovacoes`). Exibe até 100 aprovações mais recentes com usuário, data/hora, referência, contas e valor; o servidor exige sessão e acesso à empresa e desabilita cache. Isso permite a segunda conferência sem expor registros de outros CNPJs.
- A mesma consulta compara a auditoria completa com os lançamentos integrados do workspace e sinaliza aprovações sem partida correspondente, diferenças de valor/conta, partidas integradas sem auditoria e rascunhos marcados como contabilizados sem partida. Uma divergência aparece para revisão; não é corrigida nem apagada automaticamente.
- DRE e Balanço gerencial agrupam contas pela descrição da conta e de seus grupos superiores, sem assumir que os códigos numéricos têm a mesma classificação em todo plano. Contas sem descrição reconhecível não são classificadas nem incluídas nos totais; a tela e as exportações identificam essa limitação para revisão do contador.
- Na inicialização do Contábil e a cada 60 segundos, o servidor reconcilia os CNPJs que têm mapeamentos de origem no workspace persistente e atualiza rascunhos idempotentes a partir dos dados recebidos. Falhas por empresa são registradas sem interromper as demais. Essa rotina não contabiliza lançamentos definitivos; a aprovação explícita continua obrigatória.
- A gravação de documentos fiscais e de resumos do DP ainda não cria lançamentos contábeis. Livros oficiais, demonstrações e transmissões continuam sem fechamento ponta a ponta.
- A aba **Livros Contábeis** gera relatórios internos em PDF (imprimir/salvar) e XLS com Diário, Razão, Balancete, DRE e Balanço gerenciais, somente após confirmar persistência e validar os lançamentos. Diário e Razão recebem uma sequência interna no relatório, que não é numeração oficial do livro nem dos termos. A auditoria persistida atual cobre aprovações dos lançamentos integrados; ainda não mantém autoria completa de cada lançamento manual.
- A aplicação ainda não gera o arquivo estruturado TXT no leiaute ECD e seus registros obrigatórios; PDF/XLS são relatórios de conferência e não podem ser importados/transmitidos como ECD. O caminho oficial indicado na tela é a página ECD do SPED (`https://sped.rfb.gov.br/projeto/show/273`), onde ficam o PGE, leiautes e manuais. O responsável deve gerar/importar e validar o arquivo ECD conforme o leiaute vigente, assinar com certificado digital autorizado, transmitir e guardar o recibo. A Receita informa que, para livros mercantis abrangidos, o recibo de entrega da ECD comprova a autenticação; a obrigatoriedade depende do enquadramento da empresa.

## Ativar primeiro acesso no Render

1. Gere um token temporário no PowerShell local com `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Não envie o resultado pelo chat nem o coloque no repositório.
2. No serviço web **Murade Contábil** do Render, abra **Environment**, adicione `CONTABIL_AUTH_BOOTSTRAP_TOKEN` e cole o token no campo privado de valor.
3. Salve e aguarde o deploy terminar. Em seguida, abra o Contábil e use **Primeiro acesso** para criar o administrador; informe somente os CNPJs que esse usuário pode acessar.
4. Depois que o primeiro acesso for confirmado, remova `CONTABIL_AUTH_BOOTSTRAP_TOKEN` do Render e faça novo deploy. As próximas entradas usam o login normal.

O token é obrigatório antes de publicar a autenticação do Contábil pela primeira vez. A aplicação não aceita login de demonstração nem cria um administrador padrão.
- O fechamento mensal do Balancete agora é persistido no PostgreSQL por CNPJ e competência, registra usuário, horário, quantidade de lançamentos e total de débitos. O servidor só fecha após confirmar workspace existente, ausência de pré-lançamentos pendentes e ausência de lançamentos inválidos no período; também exige balancete equilibrado entre saldos devedores e credores. A gravação incrementa a versão do workspace para rejeitar salvamentos concorrentes desatualizados.
- Depois do fechamento, lançamentos, pré-lançamentos e livros daquela competência ficam bloqueados no endpoint de gravação, e a contabilização automática recusa a competência fechada. A conciliação automática não gera novos rascunhos nela. O plano de contas histórico não pode ser alterado nem removido; permite adicionar contas sem saldo inicial e sem reparentalizar contas existentes. Fechar mês é uma trava interna, não envia informações a órgão oficial nem substitui assinatura ou encerramento legal.
