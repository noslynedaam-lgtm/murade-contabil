import type { Express, Request, RequestHandler, Response } from 'express';
import {
  chaveServico, criarGuardaServico, criarServicoFeito, descreverRegistro, nomeDeQuemFez, resumoReferencias, tenantDaSessao,
  type Consultar, type RegistroServico, type SessaoServico,
} from './servicoFeito';

// Liga o módulo servicoFeito ao Contábil: guardas dos pontos de envio/fechamento, a rota de consulta (tela e Agente IA)
// e a manutenção do robô conferidor `servico_feito`. Fica fora do server.ts para o arquivo compartilhado mudar pouco.

export type SessaoRotas = SessaoServico & { cnpjs: string[] };

export interface DepsRotasServico {
  consultar: Consultar;
  sessao: (req: Request) => SessaoRotas | undefined;
  normalizarCnpj: (v: unknown) => string;
  cnpjValido: (v: string) => boolean;
}

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

export function montarServicoFeito(deps: DepsRotasServico) {
  const servico = criarServicoFeito(deps.consultar);

  const cacheNomes = new Map<string, { nome: string | null; ate: number }>();
  const nomeDe = async (userId: string): Promise<string | null> => {
    const c = cacheNomes.get(userId);
    if (c && c.ate > Date.now()) return c.nome;
    const r = await deps.consultar('SELECT nome_tratamento FROM contabil_auth_users WHERE id::text=$1', [userId]);
    const nome = r.rows[0]?.nome_tratamento ? String(r.rows[0].nome_tratamento).trim().slice(0, 60) || null : null;
    if (cacheNomes.size > 500) cacheNomes.clear();
    cacheNomes.set(userId, { nome, ate: Date.now() + 5 * 60_000 });
    return nome;
  };

  const guardaFabrica = criarGuardaServico({ servico, sessao: (req) => deps.sessao(req), nomeDe });

  const cnpjDaRota = (req: Request): string | null => {
    const cnpj = deps.normalizarCnpj(req.params.cnpj);
    const s = deps.sessao(req);
    return deps.cnpjValido(cnpj) && s?.cnpjs.includes(cnpj) ? cnpj : null; // fora do acesso: o handler responde 403
  };

  /** Fechamentos feitos antes deste recurso existir não têm registro: usa a própria tabela de fechamentos. */
  const fechamentoLegado = async (_tenant: string, cnpj: string | null, competencia: string | null): Promise<RegistroServico | null> => {
    if (!cnpj || !competencia) return null;
    const r = await deps.consultar(
      `SELECT c.login, c.fechado_em, c.user_id::text AS user_id, u.nome_tratamento FROM contabil_period_closures c LEFT JOIN contabil_auth_users u ON u.id=c.user_id WHERE c.cnpj=$1 AND c.competencia=$2`,
      [cnpj, competencia],
    );
    const l = r.rows[0]; if (!l) return null;
    return {
      tenantId: _tenant, chave: chaveServico('fechamento:periodo', cnpj, competencia), tipo: 'fechamento:periodo', cnpj, referencia: competencia, estado: 'concluido',
      porUserId: l.user_id, porLogin: l.login, porNome: l.nome_tratamento ?? null, porOrigem: 'pessoa', em: l.fechado_em, expiraEm: null, detalhe: null, atualizadoEm: l.fechado_em,
    };
  };

  const guardas = {
    fechamento: guardaFabrica({
      tipo: 'fechamento:periodo',
      chave: (req) => { const cnpj = cnpjDaRota(req); const comp = String(req.body?.competencia ?? ''); return cnpj && COMPETENCIA.test(comp) ? { cnpj, referencia: comp } : null; },
      legado: fechamentoLegado,
    }),
    contabilizacao: guardaFabrica({
      tipo: 'contabilizacao:lote',
      chave: (req) => {
        const cnpj = cnpjDaRota(req); const refs = req.body?.referencias;
        if (!cnpj || !Array.isArray(refs) || !refs.length || refs.length > 500 || refs.some((x: unknown) => typeof x !== 'string')) return null;
        return { cnpj, referencia: resumoReferencias(refs as string[]) };
      },
    }),
    decisaoLancamento: guardaFabrica({
      tipo: 'decisao:lancamento',
      chave: (req) => { const cnpj = cnpjDaRota(req); const id = String(req.params.id ?? '').trim(); return cnpj && id && id.length <= 200 ? { cnpj, referencia: id } : null; },
    }),
  };

  const paraJson = (r: RegistroServico) => ({
    tipo: r.tipo, cnpj: r.cnpj, referencia: r.referencia, estado: r.estado, feitoPor: nomeDeQuemFez(r), origem: r.porOrigem, em: r.em, atualizadoEm: r.atualizadoEm,
    detalhe: r.detalhe, mensagem: descreverRegistro(r),
  });

  function registrarRotas(app: Express, exigirSessao: RequestHandler): void {
    // Consulta do escritório (tela e Agente IA). Só o mesmo escritório; só empresas do acesso de quem pergunta.
    app.get('/api/servico-feito', exigirSessao, async (req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      const s = deps.sessao(req);
      if (!s) { res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' }); return; }
      try {
        const cnpjQ = req.query.cnpj ? deps.normalizarCnpj(req.query.cnpj) : '';
        if (cnpjQ && (!deps.cnpjValido(cnpjQ) || !s.cnpjs.includes(cnpjQ))) { res.status(403).json({ sucesso: false, motivo: 'Esta empresa não está no seu acesso.' }); return; }
        const tipo = typeof req.query.tipo === 'string' && req.query.tipo.length <= 40 ? req.query.tipo : null;
        const referencia = typeof req.query.referencia === 'string' && req.query.referencia.length <= 200 ? req.query.referencia : null;
        const pessoa = typeof req.query.pessoa === 'string' ? req.query.pessoa.trim().slice(0, 60) : '';
        let desde: Date | null = null;
        if (req.query.dia === 'hoje') {
          const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
          desde = new Date(`${hoje}T00:00:00-03:00`);
        }
        const tenant = tenantDaSessao(s);
        let registros = await servico.listar(tenant, { cnpj: cnpjQ || null, cnpjs: cnpjQ ? null : s.cnpjs, tipo, referencia, porNome: pessoa || null, desde, limite: Number(req.query.limite) || 30 });
        if (!registros.length && tipo === 'fechamento:periodo' && cnpjQ && referencia && !pessoa) {
          const legado = await fechamentoLegado(tenant, cnpjQ, referencia).catch(() => null);
          if (legado) registros = [legado];
        }
        res.json({ sucesso: true, registros: registros.map(paraJson) });
      } catch (erro) {
        servico.falhaLiberada('consulta', erro);
        res.json({ sucesso: true, registros: [], indisponivel: true }); // a consulta nunca derruba a tela
      }
    });
  }

  /** Rotina do robô conferidor `servico_feito`. */
  async function rodarConferidor(): Promise<string> {
    const m = await servico.manter();
    const c = servico.contadores;
    return `${m.expirados} em andamento vencido(s) liberado(s); ${m.apagados} registro(s) com mais de 120 dias apagado(s). Desde que o servidor iniciou: ${c.bloqueios} bloqueio(s), ${c.avisos} aviso(s) de serviço em andamento e ${c.liberadosPorFalha} liberação(ões) por falha do registro.`;
  }

  return { servico, guardas, registrarRotas, rodarConferidor, nomeDe };
}
