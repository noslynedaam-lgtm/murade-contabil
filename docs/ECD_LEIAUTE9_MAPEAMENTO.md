# ECD leiaute 9 — mapeamento de implementação

Este documento separa os dados que já existem no Murade dos dados/registros que ainda precisam ser modelados antes de gerar um TXT de ECD. Não é uma especificação completa do leiaute e não autoriza transmissão. A fonte normativa deve ser sempre o [Manual oficial da ECD — leiaute 9, atualização de janeiro de 2026](https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/ecd/manuais-e-documentos-tecnicos/manual_de_orientacao_da_ecd_leiaute_9_janeiro_2026.pdf), junto das tabelas e regras vigentes no PGE.

## Mapeamento inicial

| Grupo/registro do leiaute | Dados atuais no Murade | Lacuna antes de gerar |
| --- | --- | --- |
| Identificação da escrituração (`0000`, `I010`) | CNPJ, razão social e dados cadastrais da empresa; lançamentos por competência/data | Forma de escrituração escolhida pelo responsável e demais campos do registro conforme o período e a situação da empresa |
| Plano (`I050` e registros associados) | Contas, código, descrição, natureza, nível e tipo analítica/sintética | Campos e regras completos do plano no leiaute, contas referenciais quando exigidas e validação de vínculos/níveis |
| Termo de abertura (`I030`) | Razão social e CNPJ | Número de ordem do livro, natureza/finalidade, data de encerramento do exercício e demais campos condicionais; não inferir |
| Diário (`I200`, `I250`) | Lançamentos definitivos com data, contas de débito/crédito, valor, histórico e centro de custo opcional | Converter partidas para os registros e campos do leiaute, validar códigos e relações, preservar histórico e tratar todos os campos condicionais |
| Saldos periódicos (`I150`, `I155`) | Lançamentos definitivos e saldos iniciais por conta | Garantir saldos de abertura por período, movimentos e saldos finais conciliados; a tela atual não fecha nem valida a escrituração anual oficial |
| Demonstrações (`J005`, `J100`, `J150` e associados) | Balanço e DRE gerenciais calculados por descrição de contas | Estrutura oficial, linhas, códigos de aglutinação, períodos comparativos e mapeamento explícito do plano; classificação textual gerencial não pode ser reaproveitada como classificação oficial |
| Encerramento (`J900`) | Nenhum parâmetro de termo armazenado | Número e natureza do livro, datas inicial/final e contagem de linhas coerentes com abertura e encerramento do arquivo |
| Signatários (`J930`) | Nome e CRC do contador; nome do responsável legal, sem cadastro estruturado de signatários | Identificação, qualificação e demais informações exigidas para cada signatário; assinatura digital fica fora do escopo do TXT e deve ser feita/validada no fluxo oficial |
| Controles e encerramento de blocos (`9900`, `9990`, `9999` e outros aplicáveis) | Nada específico da ECD | Gerar contagens e encerramentos a partir do arquivo final e validar consistência estrutural no PGE |

## Regras de segurança da implementação

- Não gerar arquivo transmitível enquanto qualquer campo obrigatório, vínculo, período ou registro aplicável estiver ausente ou inválido.
- Não inventar saldos, identificadores, códigos de histórico, qualificação de signatário, número de livro ou classificação referencial.
- Separar o gerador por leiaute/ano-calendário e manter exportação em codificação e formato previstos pelo manual vigente.
- Validar o arquivo final no PGE oficial em ambiente de homologação/revisão antes de anunciar compatibilidade; o PGE é a validação oficial, uma checagem local não a substitui.
- Guardar o TXT, seu hash, a versão do leiaute, o resultado da validação, aprovações e recibo sem substituir nem apagar versões anteriores.

## Estado atual

O Murade ainda não implementa esses registros como TXT ECD nem executa validação pelo PGE. O CSV da tela é checklist interno. Este mapeamento orienta a implementação seguinte e não deve ser apresentado como arquivo ou validação oficial.
