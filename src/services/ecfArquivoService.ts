/**
 * Arquivo da ECF para importação no programa da ECF (PGE) — Leiaute 12 (Manual jul/2026).
 * Monta o Bloco 0 (0000, 0001, 0010, 0020, 0021, 0030, 0930, 0990), abre e fecha todos os blocos (C, E, J, K, L, M, N, P, Q, S, T, U, V, W, X, Y),
 * inclui o conteúdo calculado de M/N (Lucro Real) ou P (Lucro Presumido) e fecha com o Bloco 9 (9001, 9900, 9990, 9999).
 *
 * O que fica de fora de propósito: os blocos C, J, K e L são recuperados pelo programa da ECF a partir da ECD (a entrada deles é
 * facultativa); M010 (conta da Parte B), M305/M310 e os blocos X e Y não são montados — o arquivo informa como "sem dados" e o
 * robô lista a pendência. Os dados declaratórios S/N do 0020 dependem de quem conhece a empresa: só vão para o arquivo
 * depois que o contador confirmá-los.
 */
import { textoECD } from "./ecdService";

export type SN = "S" | "N";
export const CAMPOS_0020 = [
  "IND_ADM_FUN_CLU", "IND_PART_CONS", "IND_OP_EXT", "IND_OP_VINC", "IND_PJ_ENQUAD", "IND_PART_EXT", "IND_ATIV_RURAL", "IND_LUC_EXP",
  "IND_RED_ISEN", "IND_FIN", "IND_PART_COLIG", "IND_REC_EXT", "IND_ATIV_EXT", "IND_PGTO_EXT", "IND_E-COM_TI", "IND_ROY_REC", "IND_ROY_PAG",
  "IND_REND_SERV", "IND_PGTO_REM", "IND_INOV_TEC", "IND_CAP_INF", "IND_PJ_HAB", "IND_POLO_AM", "IND_ZON_EXP", "IND_AREA_COM",
  "IND_PAIS_A_PAIS", "IND_DEREX", "POSSUI_CEBRAS",
] as const;
export type Campo0020 = (typeof CAMPOS_0020)[number];

export const DESCRICAO_0020: Record<Campo0020, string> = {
  IND_ADM_FUN_CLU: "Administradora de fundos e clubes de investimento", IND_PART_CONS: "Participação em consórcio de empresas",
  IND_OP_EXT: "Operações com o exterior (exportação/importação, receitas ou despesas financeiras)", IND_OP_VINC: "Operações com pessoa vinculada, interposta pessoa ou país com tributação favorecida",
  IND_PJ_ENQUAD: "PJ enquadrada nos arts. 48 ou 49 da IN RFB 1.312/2012", IND_PART_EXT: "Participações no exterior", IND_ATIV_RURAL: "Atividade rural",
  IND_LUC_EXP: "Existência de lucro da exploração (benefícios fiscais)", IND_RED_ISEN: "Isenção e redução do imposto para Lucro Presumido (Refis)",
  IND_FIN: "Existência de Finor/Finam", IND_PART_COLIG: "Participação avaliada por equivalência patrimonial", IND_REC_EXT: "Recebimentos do exterior ou de não residentes",
  IND_ATIV_EXT: "Ativos no exterior (R$ 100.000 ou mais)", IND_PGTO_EXT: "Pagamentos ao exterior ou a não residentes", IND_E_COM_TI: "Comércio eletrônico e tecnologia da informação",
  IND_ROY_REC: "Royalties recebidos", IND_ROY_PAG: "Royalties pagos", IND_REND_SERV: "Rendimentos de serviços, juros e dividendos recebidos do exterior",
  IND_PGTO_REM: "Pagamentos ou remessas a título de serviços, juros e dividendos ao exterior", IND_INOV_TEC: "Inovação tecnológica e desenvolvimento tecnológico",
  IND_CAP_INF: "Capacitação de informática e inclusão digital", IND_PJ_HAB: "PJ habilitada em regime/programa especial (Repes, Recap, Padis, Reidi…)",
  IND_POLO_AM: "Polo industrial de Manaus e Amazônia Ocidental", IND_ZON_EXP: "Zonas de processamento de exportação", IND_AREA_COM: "Áreas de livre comércio",
  IND_PAIS_A_PAIS: "Declaração país-a-país", IND_DEREX: "Declaração de Operações Liquidadas com o Exterior (Derex)", POSSUI_CEBRAS: "Possui Cebas",
} as unknown as Record<Campo0020, string>;

export interface SignatarioEcf { nome: string; documento: string; qualificacao: string; crc?: string; email: string; fone: string }
export interface CadastroEcf {
  naturezaJuridica: string; cnae: string; endereco: string; numero: string; complemento?: string; bairro: string;
  uf: string; codigoMunicipio: string; cep: string; telefone?: string; email: string;
}
export interface ParametrosArquivoEcf {
  ano: number;
  cnpj: string;
  nome: string;
  indSitIniPer?: string;
  retificadora?: "N" | "S" | "F";
  numeroRecibo?: string;
  /** "1" Lucro Real ou "5" Lucro Presumido (as demais formas exigem o programa da ECF). */
  formaTrib: "1" | "5";
  formaApur: "T" | "A";
  /** Presumido: "C" (ECD com recuperação) ou "L" (livro caixa). */
  tipEscPre?: "C" | "L";
  /** 12 caracteres (E/B/0), só para Lucro Real com apuração anual. */
  mesBalRed?: string;
  aliqCsll: "1" | "3" | "4";
  optRefis?: SN;
  flags: Partial<Record<Campo0020, SN>>;
  /** Verdadeiro quando o contador revisou as declarações S/N do registro 0020. */
  flagsConfirmados: boolean;
  /** 0021: quais programas especiais (17 campos, em ordem), só se IND_PJ_HAB = "S". */
  programas?: SN[];
  cebas?: string;
  cadastro: CadastroEcf;
  signatarios: SignatarioEcf[];
  /** Registros já calculados (Lucro Real: M e N; Lucro Presumido: P). */
  registros?: string[];
}

export interface ResultadoArquivoEcf { ok: boolean; erros: string[]; avisos: string[]; linhas: string[]; conteudo: string }

const digitos = (s: string) => String(s || "").replace(/\D/g, "");
const dataBR = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}${d.getUTCFullYear()}`;
const t = (v: unknown, max = 255) => textoECD(v, max);

export function cpfValido(valor: string): boolean {
  const c = digitos(valor);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(c[n])) return false;
  }
  return true;
}

const BLOCOS_ABERTURA = ["C", "E", "J", "K", "L", "M", "N", "P", "Q", "S", "T", "U", "V", "W", "X", "Y"] as const;

export function gerarArquivoEcf(p: ParametrosArquivoEcf): ResultadoArquivoEcf {
  const erros: string[] = [];
  const avisos: string[] = [];
  const cnpj = String(p.cnpj || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (cnpj.length !== 14) erros.push("CNPJ da empresa incompleto.");
  if (!String(p.nome || "").trim()) erros.push("Razão social não informada.");
  if (!Number.isInteger(p.ano) || p.ano < 2015) erros.push("Ano-calendário inválido.");
  if (!["1", "3", "4"].includes(p.aliqCsll)) erros.push("Alíquota da CSLL não suportada (só 9%, 15% ou 20%).");
  if (p.formaTrib === "5" && p.formaApur !== "T") erros.push("Lucro Presumido é sempre trimestral.");
  if (p.formaTrib === "5" && !p.tipEscPre) erros.push("Lucro Presumido: informe se a escrituração é contábil (ECD) ou livro caixa.");
  if (p.formaTrib === "1" && p.formaApur === "A" && !/^[0EB]{12}$/.test(p.mesBalRed || "")) erros.push("Lucro Real anual: informe, mês a mês, se a estimativa é por receita bruta (E) ou balancete (B).");
  if (p.formaTrib === "1" && p.formaApur === "T" && p.mesBalRed) erros.push("Lucro Real trimestral não usa a forma de apuração da estimativa mensal.");
  const retificadora = p.retificadora || "N";
  if (retificadora !== "N" && !String(p.numeroRecibo || "").trim()) erros.push("ECF retificadora exige o número do recibo da ECF anterior.");

  // 0020: coerências de preenchimento do manual
  const f = (k: Campo0020): SN => p.flags[k] || "N";
  if (!p.flagsConfirmados) erros.push("Falta o contador confirmar as declarações do registro 0020 (operações com o exterior, atividade rural, regimes especiais etc.).");
  if (f("IND_OP_EXT") === "N" && f("IND_OP_VINC") === "S") erros.push("0020: operações com vinculadas exigem operações com o exterior marcadas.");
  if (p.formaTrib === "5" && f("IND_PART_EXT") === "S" && (p.optRefis || "N") === "N") erros.push("0020: Lucro Presumido sem Refis não pode ter participações no exterior.");
  if (p.formaTrib === "5" && f("IND_LUC_EXP") === "S") erros.push("0020: lucro da exploração só existe no Lucro Real.");
  if (p.formaTrib === "5" && f("IND_FIN") === "S") erros.push("0020: Finor/Finam só se aplica ao Lucro Real.");
  if (f("IND_PJ_HAB") === "S" && !(p.programas || []).includes("S")) erros.push("0021: marque ao menos um programa especial.");
  if (f("IND_PJ_HAB") === "S" && (p.programas || []).length !== 17) erros.push("0021: devem ser informados os 17 indicadores.");

  // 0030
  const c = p.cadastro;
  const natJur = digitos(c.naturezaJuridica).slice(0, 4);
  const cnae = digitos(c.cnae);
  if (natJur.length !== 4) erros.push("0030: natureza jurídica (4 dígitos) não informada no cadastro da empresa.");
  if (cnae.length !== 7) erros.push("0030: CNAE (7 dígitos) não informado no cadastro da empresa.");
  if (!String(c.endereco || "").trim() || !String(c.numero || "").trim() || !String(c.bairro || "").trim()) erros.push("0030: endereço, número e bairro são obrigatórios.");
  if (!/^[A-Z]{2}$/.test(String(c.uf || "").toUpperCase())) erros.push("0030: UF inválida.");
  if (digitos(c.codigoMunicipio).length !== 7) erros.push("0030: código IBGE do município (7 dígitos) não informado.");
  if (digitos(c.cep).length !== 8) erros.push("0030: CEP inválido.");
  if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,4}$/.test(String(c.email || ""))) erros.push("0030: e-mail da empresa inválido.");

  // 0930
  const sig = p.signatarios || [];
  if (sig.length < 2 || sig.length > 2) erros.push("0930: informe exatamente dois signatários (contador e representante da empresa).");
  const contador = sig.find((s) => s.qualificacao === "900");
  if (!contador) erros.push("0930: falta o contador (qualificação 900).");
  else {
    if (!cpfValido(contador.documento)) erros.push("0930: CPF do contador inválido.");
    if (!String(contador.crc || "").trim()) erros.push("0930: CRC do contador não informado.");
  }
  if (!sig.some((s) => s.qualificacao !== "900")) erros.push("0930: falta o representante da empresa (qualificação diferente de 900).");
  for (const s of sig) {
    if (!String(s.nome || "").trim()) erros.push("0930: signatário sem nome.");
    const d = digitos(s.documento);
    if (d.length === 11 && !cpfValido(d)) erros.push(`0930: CPF de ${s.nome || "signatário"} inválido.`);
    if (d.length !== 11 && d.length !== 14) erros.push(`0930: documento de ${s.nome || "signatário"} deve ter 11 (CPF) ou 14 (CNPJ) dígitos.`);
    if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,4}$/.test(String(s.email || ""))) erros.push(`0930: e-mail de ${s.nome || "signatário"} inválido.`);
    if (digitos(s.fone).length < 10) erros.push(`0930: telefone com DDD de ${s.nome || "signatário"} inválido.`);
  }
  if (erros.length) return { ok: false, erros, avisos, linhas: [], conteudo: "" };

  // ---- montagem
  const ini = dataBR(new Date(Date.UTC(p.ano, 0, 1))), fim = dataBR(new Date(Date.UTC(p.ano, 11, 31)));
  const forma = p.formaTrib === "1" ? "R" : "P";
  const bloco0: string[] = [
    `|0000|LECF|0012|${cnpj}|${t(p.nome, 115)}|${p.indSitIniPer || "0"}|0|||${ini}|${fim}|${retificadora}|${t(p.numeroRecibo || "", 40)}|0||`,
    `|0001|0|`,
    `|0010||${p.optRefis || "N"}|${p.formaTrib}|${p.formaApur}|01|${forma.repeat(4)}|${p.formaTrib === "1" && p.formaApur === "A" ? p.mesBalRed : ""}|${p.formaTrib === "5" ? p.tipEscPre : p.formaTrib === "1" ? "C" : ""}||||`,
    `|0020|${p.aliqCsll}|0|${CAMPOS_0020.map((k) => f(k)).join("|")}|${t(p.cebas || "", 255)}|`,
  ];
  if (f("IND_PJ_HAB") === "S") bloco0.push(`|0021|${(p.programas || []).join("|")}|`);
  bloco0.push(`|0030|${natJur}|${cnae}|${t(c.endereco, 150)}|${t(c.numero, 6)}|${t(c.complemento || "", 50)}|${t(c.bairro, 50)}|${String(c.uf).toUpperCase()}|${digitos(c.codigoMunicipio)}|${digitos(c.cep)}|${digitos(c.telefone || "")}|${t(c.email, 115)}|`);
  for (const s of sig) bloco0.push(`|0930|${t(s.nome, 100)}|${digitos(s.documento)}|${s.qualificacao}|${s.qualificacao === "900" ? t(s.crc || "", 20) : ""}|${t(s.email, 60)}|${digitos(s.fone)}|`);
  bloco0.push(`|0990|${bloco0.length + 1}|`);

  const todos: string[] = [...bloco0];
  const conteudo = (p.registros || []);
  const porBloco: Record<string, string[]> = {};
  for (const r of conteudo) {
    const b = r.charAt(1);
    (porBloco[b] ||= []).push(r);
  }
  const esperado = p.formaTrib === "1" ? "M" : "P";
  if (!(porBloco[esperado] || []).length) avisos.push(p.formaTrib === "1" ? "Nenhum registro do Bloco M (e-Lalur/e-Lacs) foi incluído: calcule o Lucro Real antes." : "Nenhum registro do Bloco P foi incluído: calcule o Lucro Presumido antes.");
  if (p.formaTrib === "1" && !(porBloco["N"] || []).length) avisos.push("Nenhum registro do Bloco N (cálculo do IRPJ/CSLL) foi incluído.");
  const naoUsados = Object.keys(porBloco).filter((b) => !BLOCOS_ABERTURA.includes(b as never));
  if (naoUsados.length) erros.push(`Registros de bloco desconhecido: ${naoUsados.join(", ")}.`);
  for (const b of BLOCOS_ABERTURA) {
    const dados = porBloco[b] || [];
    todos.push(`|${b}001|${dados.length ? 0 : 1}|`);
    todos.push(...dados);
    todos.push(`|${b}990|${dados.length + 2}|`);
  }
  avisos.push("Blocos C, J, K e L: o programa da ECF recupera da ECD (importe a ECD no programa antes de validar).");
  if (p.formaTrib === "1") avisos.push("Bloco M sem M010/M305/M310 (conta da Parte B e relacionamentos) e Blocos X e Y sem dados: complete no programa da ECF, se a empresa tiver esses fatos.");

  // Bloco 9
  const contagem = new Map<string, number>();
  for (const l of todos) { const r = l.split("|")[1]; contagem.set(r, (contagem.get(r) || 0) + 1); }
  const regs9 = [...contagem.keys(), "9001", "9900", "9990", "9999"].filter((v, i, a) => a.indexOf(v) === i);
  const linhas9900 = regs9.map((r) => {
    const q = r === "9001" ? 1 : r === "9900" ? regs9.length : r === "9990" ? 1 : r === "9999" ? 1 : contagem.get(r)!;
    return `|9900|${r}|${q}|`;
  });
  const total9 = 1 + linhas9900.length + 1;
  const bloco9 = ["|9001|0|", ...linhas9900, `|9990|${total9}|`];
  const linhas = [...todos, ...bloco9];
  linhas.push(`|9999|${linhas.length + 1}|`);
  return { ok: erros.length === 0, erros, avisos, linhas, conteudo: erros.length ? "" : linhas.join("\r\n") + "\r\n" };
}

/** Separa o texto do Lucro Real anual em M/N com os períodos A00 (M030/N030) que o leiaute exige antes dos registros. */
export function comPeriodoAnual(ano: number, registros: string[]): string[] {
  const ini = `0101${ano}`, fim = `3112${ano}`;
  const m = registros.filter((r) => r.startsWith("|M")), n = registros.filter((r) => r.startsWith("|N"));
  return [...(m.length ? [`|M030|${ini}|${fim}|A00|`, ...m] : []), ...(n.length ? [`|N030|${ini}|${fim}|A00|`, ...n] : [])];
}
