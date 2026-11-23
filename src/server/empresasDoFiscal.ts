// Empresas compartilhadas do Murade Fiscal: o Contábil puxa os CNPJs para a equipe não cadastrar de novo.
// Aqui a empresa passa a existir quando o escritório do dono ganha acesso ao CNPJ; o plano de contas e o restante
// continuam sendo montados pelo Contábil. Nada que já existe é sobrescrito e nenhum dado sigiloso é trazido.
import { urlDoSistema } from "./agentesEntreSistemas";

type Buscar = typeof fetch;

/** Regimes que o Fiscal manda (empresasCompartilhadas.ts lá). O MEI era descartado aqui e a empresa chegava sem regime. */
export const REGIMES_DO_FISCAL: readonly string[] = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI"];

export interface CnpjDoEscritorio { cnpj: string; escritorio: string; donoSistema: boolean; dados: Record<string, string> }

/** Mantém só CNPJs válidos e sem repetição, com o escritório (login do dono no Fiscal) e o cadastro básico no formato do Contábil. */
export function cnpjsValidosDoFiscal(lista: unknown, validar: (cnpj: string) => boolean): CnpjDoEscritorio[] {
  if (!Array.isArray(lista)) return [];
  const vistos = new Map<string, CnpjDoEscritorio>();
  const txt = (v: unknown) => String(v ?? "").trim();
  for (const e of lista as any[]) {
    const cnpj = txt(e?.cnpj).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cnpj.length === 14 && validar(cnpj) && !vistos.has(cnpj)) {
      const regime = REGIMES_DO_FISCAL.includes(e?.regime) ? txt(e.regime) : "";
      vistos.set(cnpj, { cnpj, escritorio: txt(e?.escritorio).toLowerCase(), donoSistema: e?.escritorioDonoSistema === true,
        dados: { cnpj, razaoSocial: txt(e?.razaoSocial), nomeFantasia: txt(e?.nomeFantasia), regime, municipio: txt(e?.cidade), uf: txt(e?.uf).toUpperCase().slice(0, 2) } });
    }
  }
  return [...vistos.values()];
}

/** CNPJs que o hub do Fiscal marcou como excluídos (lápide). Aceita lista de textos ou de objetos {cnpj}; o Fiscal pode mandar em `excluidas`, `lapides` ou `excluidos`. */
export function cnpjsExcluidosNoFiscal(corpo: any): string[] {
  const bruto = corpo?.excluidas ?? corpo?.lapides ?? corpo?.excluidos;
  if (!Array.isArray(bruto)) return [];
  const limpos = bruto.map((x: any) => String(typeof x === "string" ? x : x?.cnpj ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")).filter((c) => c.length === 14);
  return [...new Set(limpos)];
}

export async function buscarEmpresasDoFiscal(env: Record<string, string | undefined> = process.env, buscar: Buscar = fetch): Promise<{ ok: boolean; motivo?: string; empresas: any[]; excluidas?: string[] }> {
  const token = env.MURADE_INTEGRATION_TOKEN?.trim();
  if (!token) return { ok: false, motivo: "Token de integração (MURADE_INTEGRATION_TOKEN) não configurado neste sistema.", empresas: [] };
  try {
    const r = await buscar(`${urlDoSistema("fiscal", env)}/api/integracao/fiscal/empresas`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) return { ok: false, motivo: `O Murad Fiscal respondeu com erro (${r.status}).`, empresas: [] };
    const corpo: any = await r.json().catch(() => null);
    return { ok: true, empresas: Array.isArray(corpo?.empresas) ? corpo.empresas : [], excluidas: cnpjsExcluidosNoFiscal(corpo) };
  } catch { return { ok: false, motivo: "O Murad Fiscal não respondeu a tempo.", empresas: [] }; }
}

/** Resumo das notas da empresa no Fiscal (Robô Conferidor das Origens). Com competência, vem também a lista daquele mês. */
export async function buscarResumoNotasFiscal(cnpj: string, competencia?: string, env: Record<string, string | undefined> = process.env, buscar: Buscar = fetch): Promise<{ ok: boolean; motivo?: string; meses?: any[]; notas?: any[] }> {
  const token = env.MURADE_INTEGRATION_TOKEN?.trim();
  if (!token) return { ok: false, motivo: "token de integração não configurado" };
  try {
    const url = `${urlDoSistema("fiscal", env)}/api/integracao/fiscal/resumo-notas?cnpj=${encodeURIComponent(cnpj)}${competencia ? `&competencia=${encodeURIComponent(competencia)}` : ""}`;
    const r = await buscar(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000) });
    const corpo: any = await r.json().catch(() => null);
    if (!r.ok || corpo?.sucesso !== true || corpo?.cnpj !== cnpj) return { ok: false, motivo: corpo?.motivo || `o Fiscal respondeu com erro (${r.status})` };
    return { ok: true, meses: Array.isArray(corpo.meses) ? corpo.meses : [], notas: Array.isArray(corpo.notas) ? corpo.notas : [] };
  } catch { return { ok: false, motivo: "o Fiscal não respondeu a tempo" }; }
}

/** Pede ao Fiscal para pôr de novo na fila as notas indicadas (correção segura: o Contábil grava por chave e não duplica). */
export async function pedirReenvioNotasFiscal(cnpj: string, chaves: string[], env: Record<string, string | undefined> = process.env, buscar: Buscar = fetch): Promise<{ ok: boolean; motivo?: string; reabertas?: number }> {
  const token = env.MURADE_INTEGRATION_TOKEN?.trim();
  if (!token) return { ok: false, motivo: "token de integração não configurado" };
  try {
    const r = await buscar(`${urlDoSistema("fiscal", env)}/api/integracao/fiscal/reenviar-notas`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ cnpj, chaves }), signal: AbortSignal.timeout(30000),
    });
    const corpo: any = await r.json().catch(() => null);
    return r.ok && corpo?.sucesso === true ? { ok: true, reabertas: Number(corpo.reabertas) || 0 } : { ok: false, motivo: corpo?.motivo || `o Fiscal respondeu com erro (${r.status})` };
  } catch { return { ok: false, motivo: "o Fiscal não respondeu a tempo" }; }
}
