// Contas do pré-lançamento de uma nota do Fiscal: UMA regra só, usada por quem GERA o pré-lançamento (prepararRascunhosContabeis.ts)
// e por quem o GRAVA (mesclarRascunhosAutomaticosContabil em authContabil.ts e mesclarRascunhosNoWorkspace).
//
// Por que existe: em 02/11/2026 a NFC-e passou a debitar o Caixa (venda de balcão recebida na hora), mas a gravação continuou exigindo
// que as contas fossem exatamente as do mapeamento "Fiscal — Saída" (Clientes). Resultado: toda NFC-e nova era descartada em silêncio
// nas empresas cujo plano tem conta de Caixa no formato 1.1.1 a 1.1.3. Com a regra num lugar só, gerar e gravar nunca divergem.
//
// Regras (o mapeamento da empresa continua sendo o ponto de partida; nada aqui inventa conta que o plano não tem):
//  - NFC-e (modelo 65) de saída: débito na conta analítica de Caixa/Banco/Cartão do grupo 1.1.1 a 1.1.3, se existir; senão, o débito do mapeamento.
//  - NFS-e de saída: crédito na conta analítica de receita de "Prestação de serviços" do MESMO grupo da receita de vendas do mapeamento;
//    sem essa conta, não há pré-lançamento (a nota vira pendência para o contador; nunca vai para Receita de Mercadorias).
//  - Demais notas: as contas do mapeamento.

type Conta = Record<string, any>;
export interface ParContas { debito: string; credito: string }

const analitica = (c: Conta) => c?.tipo === "analitica";
const nomeDe = (c: Conta) => String(c?.nome || c?.descricao || "");

/** Identificador do documento dentro da referência FISCAL:<cnpj>:<competência>:<Entrada|Saida>:<documento>. */
export function partesReferenciaFiscal(referencia: string): { tipo: "Entrada" | "Saida"; documento: string } | null {
  const m = /^FISCAL:[A-Z0-9]{14}:\d{4}-\d{2}:(Entrada|Saida):(.+)$/.exec(String(referencia || ""));
  return m ? { tipo: m[1] as "Entrada" | "Saida", documento: m[2] } : null;
}

/** NFC-e: chave de 44 dígitos com modelo 65 (posições 21 e 22). */
export function ehChaveNfce(documento: string): boolean {
  return /^\d{44}$/.test(documento) && documento.slice(20, 22) === "65";
}

/** NFS-e: chave nacional de 50 dígitos ou identificador "nfse-..." que o Fiscal dá à nota de serviço. */
export function ehReferenciaNfse(documento: string): boolean {
  return /^\d{50}$/.test(documento) || /^nfse-/i.test(documento);
}

/** Conta de Caixa/Banco/Cartão para a NFC-e (mesma regra que já existia na geração, agora compartilhada). */
export function contaCaixaNfce(contas: Conta[], contaCredito: string): string | null {
  const caixa = contas.find((c) => analitica(c) && /^1\.1\.[1-3]/.test(String(c.codigo)) && /caixa|banco|cart[ãa]o/i.test(nomeDe(c)));
  return caixa && String(caixa.codigo) !== contaCredito ? String(caixa.codigo) : null;
}

/** Conta de receita de prestação de serviços no mesmo grupo (primeiro nível do código) da receita de vendas do mapeamento. */
export function contaReceitaServicos(contas: Conta[], contaReceitaVendas: string, contaDebito: string): string | null {
  const grupo = String(contaReceitaVendas || "").split(".")[0];
  if (!grupo) return null;
  const achada = contas.find((c) => analitica(c) && String(c.codigo).split(".")[0] === grupo
    && /^(receita\s+(de\s+)?)?presta[cç][aã]o\s+de\s+servi[cç]os?$|servi[cç]os\s+prestados/i.test(nomeDe(c).trim()));
  return achada && String(achada.codigo) !== contaDebito ? String(achada.codigo) : null;
}

/**
 * Contas esperadas para o pré-lançamento da nota com esta referência, a partir do mapeamento da origem e do plano da empresa.
 * null = a nota não tem como virar pré-lançamento com este plano (vira pendência; quem gera e quem grava concordam).
 */
export function contasDoRascunhoFiscal(referencia: string, mapeamento: { contaDebitoCodigo?: unknown; contaCreditoCodigo?: unknown } | null | undefined, contas: Conta[]): ParContas | null {
  if (!mapeamento) return null;
  const debito = String(mapeamento.contaDebitoCodigo ?? ""), credito = String(mapeamento.contaCreditoCodigo ?? "");
  if (!debito || !credito || debito === credito) return null;
  const partes = partesReferenciaFiscal(referencia);
  if (!partes) return { debito, credito };
  if (partes.tipo === "Saida" && ehChaveNfce(partes.documento)) return { debito: contaCaixaNfce(contas, credito) ?? debito, credito };
  if (partes.tipo === "Saida" && ehReferenciaNfse(partes.documento)) {
    const servicos = contaReceitaServicos(contas, credito, debito);
    return servicos ? { debito, credito: servicos } : null;
  }
  return { debito, credito };
}

/** Para a gravação: o pré-lançamento traz exatamente as contas que a regra manda para esta referência? */
export function contasDoRascunhoConferem(candidato: { referenciaOrigem: string; contaDebitoCodigo: string; contaCreditoCodigo: string }, mapeamento: Record<string, unknown> | null | undefined, contas: Conta[]): boolean {
  if (!mapeamento) return false;
  if (!String(candidato.referenciaOrigem).startsWith("FISCAL:") || /:APURACAO:/.test(candidato.referenciaOrigem)) {
    return mapeamento.contaDebitoCodigo === candidato.contaDebitoCodigo && mapeamento.contaCreditoCodigo === candidato.contaCreditoCodigo;
  }
  const esperado = contasDoRascunhoFiscal(candidato.referenciaOrigem, mapeamento, contas);
  return !!esperado && esperado.debito === candidato.contaDebitoCodigo && esperado.credito === candidato.contaCreditoCodigo;
}
