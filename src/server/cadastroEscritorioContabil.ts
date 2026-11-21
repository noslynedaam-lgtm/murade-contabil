// Cadastro do escritório visto do Contábil. O cadastro ÚNICO (dados, certificado A1 e-CNPJ e as caixinhas de procurações) é feito
// no Murade DP; o DP grava o CNPJ do escritório aqui (contabil_escritorio_cnpj, só quando vazio ou automático). Este módulo só LÊ
// o DP no mesmo banco (ligação: o dono do escritório no Contábil tem o MESMO login que o administrador do escritório no DP).
// Tabela ou permissão inexistente (outro banco) = "sem ligação", nunca erro. Nunca lê nem devolve o certificado ou a senha.
import type { Express, Request, RequestHandler } from 'express';
import { cnpjValido } from './escritorioConsultor';

export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
const DIA = 86_400_000;
async function tentar(c: Consultar, sql: string, p: unknown[]): Promise<any[] | null> { try { return (await c(sql, p)).rows; } catch { return null; } }

export type EtapaCertificado = 'vencido' | 7 | 15 | 30 | null;
export function etapaCertificado(validoAte: string | null | undefined, agora: Date = new Date()): { dias: number | null; etapa: EtapaCertificado } {
  if (!validoAte) return { dias: null, etapa: null };
  const t = new Date(validoAte).getTime(); if (!Number.isFinite(t)) return { dias: null, etapa: null };
  const dias = Math.floor((t - agora.getTime()) / DIA);
  if (t <= agora.getTime()) return { dias, etapa: 'vencido' };
  return { dias, etapa: dias <= 7 ? 7 : dias <= 15 ? 15 : dias <= 30 ? 30 : null };
}

export interface CadastroVistoDoContabil {
  ligadoAoDP: boolean;
  cnpjNoContabil: string | null; origemNoContabil: string | null;
  dp: null | { cnpj: string | null; faltando: string[]; completo: boolean; certificado: { instalado: boolean; validoAte: string | null; dias: number | null; etapa: EtapaCertificado } };
  avisos: string[];
}

export async function lerCadastroDoEscritorio(c: Consultar, tenantId: string, agora: Date = new Date()): Promise<CadastroVistoDoContabil> {
  const aqui = await tentar(c, 'SELECT cnpj, origem FROM contabil_escritorio_cnpj WHERE tenant_id=$1', [tenantId]);
  const cnpjNoContabil = aqui?.[0]?.cnpj ? String(aqui[0].cnpj) : null; const origemNoContabil = aqui?.[0]?.origem ? String(aqui[0].origem) : null;
  const dono = await tentar(c, 'SELECT login FROM contabil_auth_users WHERE id::text=$1', [tenantId]);
  const login = dono?.[0]?.login ? String(dono[0].login).trim().toLowerCase() : '';
  const base = { cnpjNoContabil, origemNoContabil };
  if (!login) return { ligadoAoDP: false, ...base, dp: null, avisos: [] };
  const dp = await tentar(c, `SELECT u.cnpj_escritorio, p.nome, p.responsavel, p.email, p.telefone, p.whatsapp, p.endereco
    FROM dp_auth_users u LEFT JOIN dp_escritorio_perfil p ON p.tenant_id = u.id::text WHERE lower(u.login)=$1 AND u.office_admin=true AND u.tenant_id=u.id AND u.disabled=false`, [login]);
  if (!dp || dp.length !== 1) return { ligadoAoDP: false, ...base, dp: null, avisos: [] };
  const l = dp[0]; const cnpj = cnpjValido(l.cnpj_escritorio);
  const cert = cnpj ? await tentar(c, 'SELECT certificate_valid_until FROM dp_esocial_certificates WHERE cnpj=$1', [cnpj]) : null;
  const validoAte = cert?.[0]?.certificate_valid_until ? new Date(cert[0].certificate_valid_until).toISOString() : null;
  const e = etapaCertificado(validoAte, agora);
  const faltando: string[] = [];
  if (!cnpj) faltando.push('CNPJ do escritório');
  if (!l.nome) faltando.push('razão social');
  if (!l.responsavel) faltando.push('contador responsável');
  if (!l.email) faltando.push('e-mail');
  if (!l.telefone && !l.whatsapp) faltando.push('telefone ou WhatsApp');
  if (!l.endereco) faltando.push('endereço');
  if (!validoAte) faltando.push('certificado digital A1 do escritório'); else if (e.etapa === 'vencido') faltando.push('certificado digital A1 do escritório (vencido)');
  const avisos: string[] = [];
  if (e.etapa === 'vencido') avisos.push('O certificado digital do escritório venceu. Envie o novo no cadastro do escritório (no DP).');
  else if (e.etapa) avisos.push(`O certificado digital do escritório vence em ${e.dias} dia${e.dias === 1 ? '' : 's'}. Renove no cadastro do escritório (no DP).`);
  if (faltando.length && e.etapa !== 'vencido') avisos.push(`Cadastro do escritório incompleto: falta ${faltando.join(', ')}. Faça no cadastro do escritório (no DP), que vale para todos os sistemas.`);
  if (cnpj && cnpjNoContabil && cnpjNoContabil !== cnpj) avisos.push(`O Contábil tem o CNPJ ${cnpjNoContabil} digitado à mão, diferente do cadastro do escritório (${cnpj}). Confira qual está certo.`);
  return { ligadoAoDP: true, ...base, dp: { cnpj, faltando, completo: faltando.length === 0, certificado: { instalado: Boolean(validoAte), validoAte, ...e } }, avisos };
}

/** Rotina do robô (contagens só): escritórios com cadastro incompleto, certificado vencendo/vencido e CNPJ divergente. */
export async function conferirCadastrosDosEscritorios(c: Consultar, agora: Date = new Date()): Promise<{ ligados: number; incompletos: number; vencendo: number; vencidos: number; divergentes: number; texto: string }> {
  const donos = await tentar(c, `SELECT u.id::text AS tenant FROM contabil_auth_users u WHERE u.global_admin=true AND u.disabled=false AND COALESCE(u.tenant_id::text, u.id::text)=u.id::text LIMIT 500`, []) || [];
  const r = { ligados: 0, incompletos: 0, vencendo: 0, vencidos: 0, divergentes: 0, texto: '' };
  for (const d of donos) {
    const v = await lerCadastroDoEscritorio(c, String(d.tenant), agora);
    if (!v.dp) continue;
    r.ligados += 1;
    if (!v.dp.completo) r.incompletos += 1;
    if (v.dp.certificado.etapa === 'vencido') r.vencidos += 1; else if (v.dp.certificado.etapa) r.vencendo += 1;
    if (v.dp.cnpj && v.cnpjNoContabil && v.dp.cnpj !== v.cnpjNoContabil) r.divergentes += 1;
  }
  r.texto = `Cadastro do escritório (feito no DP): ${r.ligados} escritório(s) ligado(s), ${r.incompletos} incompleto(s), ${r.vencendo} com certificado vencendo em até 30 dias, ${r.vencidos} vencido(s), ${r.divergentes} com CNPJ diferente do digitado no Contábil.`;
  return r;
}

export function registrarRotaCadastroEscritorioContabil(app: Express, exigirSessao: RequestHandler, deps: { consultar: Consultar; sessao: (req: Request) => { tenantId: string } | undefined; urlDP: () => string }): void {
  app.get('/api/escritorio/cadastro-situacao', exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const s = deps.sessao(req); if (!s) { res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' }); return; }
    try { res.json({ sucesso: true, ...(await lerCadastroDoEscritorio(deps.consultar, s.tenantId)), linkDP: `${deps.urlDP()}/#cadastro-escritorio` }); }
    catch { res.status(503).json({ sucesso: false, motivo: 'Não foi possível ler agora.' }); }
  });
}
