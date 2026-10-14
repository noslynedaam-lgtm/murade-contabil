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
- Os serviços Render atuais usam plano gratuito com sistema de arquivos efêmero. Antes de usar a integração como livro contábil persistente, é necessário banco durável, backup e trilha de auditoria.
- Em indisponibilidade de uma fonte, o Contábil mantém a última consulta identificada como desatualizada e mostra a falha; não informa que está atualizado.

## Estado de implementação

- Os três serviços confirmam conectividade autenticada. O handshake informa `dadosCompartilhados: false`.
- O Fiscal passou a oferecer um endpoint autenticado, somente leitura, para documentos já recebidos: `GET /api/integracao/fiscal/documentos?cnpj=...`, com filtro opcional de período e limite por chamada.
- Ainda falta um importador do lado do Contábil, uma API de agregados contábeis do DP, banco persistente e autenticação/autorização de usuários. Até esses itens serem implementados, não há sincronização automática ponta a ponta nem lançamentos contábeis derivados desses dados.
