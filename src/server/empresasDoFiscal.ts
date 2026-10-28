// Empresas compartilhadas do Murade Fiscal: o Contábil puxa os CNPJs para a equipe não cadastrar de novo.
// Aqui a empresa passa a existir quando o escritório do dono ganha acesso ao CNPJ; o plano de contas e o restante
// continuam sendo montados pelo Contábil. Nada que já existe é sobrescrito e nenhum dado sigiloso é trazido.
import { urlDoSistema } from "./agentesEntreSistemas";

type Buscar = typeof fetch;

export interface CnpjDoEscritorio { cnpj: string; escritorio: string; donoSistema: boolean }

/** Mantém só CNPJs válidos e sem repetição, junto com o escritório (login do dono no Fiscal) a que pertencem. */
export function cnpjsValidosDoFiscal(lista: unknown, validar: (cnpj: string) => boolean): CnpjDoEscritorio[] {
  if (!Array.isArray(lista)) return [];
  const vistos = new Map<string, CnpjDoEscritorio>();
  for (const e of lista as any[]) {
    const cnpj = String(e?.cnpj ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cnpj.length === 14 && validar(cnpj) && !vistos.has(cnpj)) vistos.set(cnpj, { cnpj, escritorio: String(e?.escritorio ?? "").trim().toLowerCase(), donoSistema: e?.escritorioDonoSistema === true });
  }
  return [...vistos.values()];
}

export async function buscarEmpresasDoFiscal(env: Record<string, string | undefined> = process.env, buscar: Buscar = fetch): Promise<{ ok: boolean; motivo?: string; empresas: any[] }> {
  const token = env.MURADE_INTEGRATION_TOKEN?.trim();
  if (!token) return { ok: false, motivo: "Token de integração (MURADE_INTEGRATION_TOKEN) não configurado neste sistema.", empresas: [] };
  try {
    const r = await buscar(`${urlDoSistema("fiscal", env)}/api/integracao/fiscal/empresas`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) return { ok: false, motivo: `O Murade Fiscal respondeu com erro (${r.status}).`, empresas: [] };
    const corpo: any = await r.json().catch(() => null);
    return { ok: true, empresas: Array.isArray(corpo?.empresas) ? corpo.empresas : [] };
  } catch { return { ok: false, motivo: "O Murade Fiscal não respondeu a tempo.", empresas: [] }; }
}
