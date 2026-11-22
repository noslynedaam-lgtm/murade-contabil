// Robô Conferidor de Empresa Repetida: nenhum sistema pode ter a mesma empresa duas vezes.
// Confere no banco (só lê): CNPJ no acesso de mais de um escritório, cadastro gravado com CNPJ diferente da chave,
// a mesma chave de CNPJ escrita de dois jeitos (com e sem pontuação) e o mesmo id em duas empresas (a tela juntaria as duas).
// Só conta: não mostra dado de nenhum escritório nem de nenhuma empresa, e nunca apaga nem junta nada sozinho.
import { chaveCnpjEmpresa } from '../utils/dedupEmpresas';

type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
export interface TabelasEmpresas {
  /** SELECT que devolve (cnpj, tenant) de cada acesso ativo. */
  acessos: string;
  /** SELECT que devolve (cnpj, cnpj_cadastro, id) de cada empresa cadastrada. */
  empresas: string;
}
export interface ResultadoEmpresaRepetida { total: number; emDoisEscritorios: number; cnpjDiferenteDaChave: number; chaveRepetida: number; idRepetido: number; alerta: boolean; resumo: string }

export function analisarEmpresasRepetidas(acessos: Array<{ cnpj: unknown; tenant: unknown }>, empresas: Array<{ cnpj: unknown; cnpj_cadastro?: unknown; id?: unknown }>): ResultadoEmpresaRepetida {
  const tenantsPorCnpj = new Map<string, Set<string>>();
  for (const a of acessos) {
    const c = chaveCnpjEmpresa(a.cnpj); if (!c) continue;
    if (!tenantsPorCnpj.has(c)) tenantsPorCnpj.set(c, new Set());
    tenantsPorCnpj.get(c)!.add(String(a.tenant ?? ''));
  }
  const emDoisEscritorios = [...tenantsPorCnpj.values()].filter((t) => t.size > 1).length;
  const porChave = new Map<string, number>(); const porId = new Map<string, Set<string>>();
  let cnpjDiferenteDaChave = 0;
  for (const e of empresas) {
    const c = chaveCnpjEmpresa(e.cnpj);
    porChave.set(c, (porChave.get(c) || 0) + 1);
    const doCadastro = chaveCnpjEmpresa(e.cnpj_cadastro);
    if (doCadastro && doCadastro !== c) cnpjDiferenteDaChave++;
    const id = String(e.id ?? '').trim();
    if (id) { if (!porId.has(id)) porId.set(id, new Set()); porId.get(id)!.add(c); }
  }
  const chaveRepetida = [...porChave.values()].filter((n) => n > 1).length;
  const idRepetido = [...porId.values()].filter((s) => s.size > 1).length;
  const alerta = emDoisEscritorios + cnpjDiferenteDaChave + chaveRepetida + idRepetido > 0;
  const partes: string[] = [];
  if (emDoisEscritorios) partes.push(`${emDoisEscritorios} CNPJ(s) no acesso de mais de um escritório`);
  if (chaveRepetida) partes.push(`${chaveRepetida} CNPJ(s) gravado(s) duas vezes (com e sem pontuação)`);
  if (cnpjDiferenteDaChave) partes.push(`${cnpjDiferenteDaChave} cadastro(s) com CNPJ diferente da chave`);
  if (idRepetido) partes.push(`${idRepetido} código(s) interno(s) usado(s) em duas empresas`);
  const resumo = alerta
    ? `ATENÇÃO: ${partes.join('; ')}. Nada foi apagado nem juntado: confira com o dono do sistema.`
    : `${empresas.length} empresa(s) conferida(s): nenhuma repetida (uma por CNPJ, cada uma em um só escritório).`;
  return { total: empresas.length, emDoisEscritorios, cnpjDiferenteDaChave, chaveRepetida, idRepetido, alerta, resumo };
}

export async function conferirEmpresasRepetidas(consultar: Consultar, tabelas: TabelasEmpresas): Promise<ResultadoEmpresaRepetida> {
  const [a, e] = await Promise.all([consultar(tabelas.acessos), consultar(tabelas.empresas)]);
  return analisarEmpresasRepetidas(a.rows, e.rows);
}
