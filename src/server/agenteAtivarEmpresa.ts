// "Murad, ativa a empresa X no DP" / "no Contábil" (28/11/2026). A empresa que chegou por cópia de outro sistema fica "disponível —
// ainda não atendida aqui" e nenhum robô age nela; ativar diz que ESTE escritório faz este serviço dela. Cartão de OK antes de gravar.
// Mesmo arquivo no DP e no Contábil; cada sistema só diz o nome do serviço. Usa as rotas da tela com a sessão da pessoa.
import { type ContextoAgente, type Ferramenta, erroApi, ok } from './agenteMotor';

export interface OpcoesAtivarEmpresa { servico: 'DP' | 'Contábil' }
const so = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const semAcento = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export interface EmpresaDisponivelLista { cnpj: string; razaoSocial: string; nomeFantasia?: string }
/** Acha a empresa pedida entre as disponíveis: pelo CNPJ (exato) ou pelo nome (contém). Mais de uma com o nome: pede para escolher. */
export function acharDisponivel(lista: EmpresaDisponivelLista[], pedido: string): { empresa?: EmpresaDisponivelLista; varias?: EmpresaDisponivelLista[] } {
  const c = so(pedido);
  if (c.length === 14) { const e = lista.find((x) => so(x.cnpj) === c); return e ? { empresa: e } : {}; }
  const n = semAcento(pedido);
  if (n.length < 3) return {};
  const achadas = lista.filter((x) => semAcento(x.razaoSocial).includes(n) || semAcento(x.nomeFantasia).includes(n));
  return achadas.length === 1 ? { empresa: achadas[0] } : achadas.length > 1 ? { varias: achadas.slice(0, 8) } : {};
}

export const instrucaoAtivarEmpresa = (servico: string) => `

ATIVAR EMPRESA NESTE SISTEMA ("ativa a empresa X no ${servico}", "este escritório faz o ${servico} da empresa X"): empresa que veio por cópia de outro sistema fica "disponível — ainda não atendida no ${servico}" (bloco recolhido "Empresas do escritório ainda não ativadas aqui" na tela de Empresas) e nenhum robô age nela. Use ativar_empresa_aqui com o nome ou o CNPJ; o cartão de OK mostra a empresa e só ativa com o OK. Para saber quais estão disponíveis, use listar_empresas_nao_ativadas. Nunca diga que ativou sem o OK.`;

export function criarFerramentasAtivarEmpresa(o: OpcoesAtivarEmpresa): Ferramenta[] {
  const S = (description: string) => ({ type: 'STRING', description });
  const listar = async (ctx: ContextoAgente): Promise<EmpresaDisponivelLista[] | { erro: string }> => {
    const r = await ctx.chamarApi('GET', '/api/empresas/atendimento/disponiveis');
    if (!ok(r)) return erroApi(r);
    return Array.isArray(r.corpo?.empresas) ? r.corpo.empresas : [];
  };
  return [
    {
      tipo: 'leitura',
      declaracao: { name: 'listar_empresas_nao_ativadas', description: `Lista as empresas do escritório que chegaram por cópia de outro sistema e ainda NÃO foram ativadas no ${o.servico} (nenhum robô age nelas).`, parameters: { type: 'OBJECT', properties: {} } },
      async executar(ctx) {
        const l = await listar(ctx);
        if (!Array.isArray(l)) return l;
        return { total: l.length, empresas: l.slice(0, 40).map((e) => ({ cnpj: e.cnpj, nome: e.razaoSocial })), orientacao: l.length ? `Para ativar: "ativa a empresa <nome> no ${o.servico}" ou o botão "Ativar aqui" na tela de Empresas.` : `Todas as empresas do escritório já estão ativadas no ${o.servico}.` };
      },
    },
    {
      tipo: 'acao',
      declaracao: {
        name: 'ativar_empresa_aqui',
        description: `Ativa no ${o.servico} UMA empresa que está "disponível — ainda não atendida no ${o.servico}" (veio por cópia de outro sistema). Depois de ativada, ela aparece na lista, entra no painel e os robôs passam a cuidar dela.`,
        parameters: { type: 'OBJECT', properties: { empresa: S('Nome (razão social ou fantasia) ou CNPJ da empresa a ativar.') }, required: ['empresa'] },
      },
      async preparar(ctx, args) {
        const l = await listar(ctx);
        if (!Array.isArray(l)) return l;
        const a = acharDisponivel(l, String(args?.empresa || ''));
        if (a.varias) return { erro: `Achei ${a.varias.length} empresas não ativadas com esse nome: ${a.varias.map((e) => `${e.razaoSocial} (${e.cnpj})`).join('; ')}. Diga qual (pelo CNPJ).` };
        if (!a.empresa) return { erro: l.length ? `Não achei essa empresa entre as não ativadas no ${o.servico}. Ela pode já estar ativa. As não ativadas são: ${l.slice(0, 10).map((e) => e.razaoSocial).join('; ')}${l.length > 10 ? '…' : ''}.` : `Não há empresa esperando ativação no ${o.servico}: todas já estão ativas.` };
        const e = a.empresa;
        return {
          params: { cnpj: so(e.cnpj) }, cnpj: so(e.cnpj),
          titulo: `Ativar ${e.razaoSocial} no ${o.servico}`,
          descricao: [`Empresa: ${e.razaoSocial} — CNPJ ${e.cnpj}.`, `Hoje ela está "disponível — ainda não atendida no ${o.servico}": veio por cópia de outro sistema e nenhum robô age nela.`,
            `Ao ativar, este escritório passa a fazer o ${o.servico} dela: ela entra na lista e no painel, e os robôs (obrigações, avisos de vencimento, transmissões) passam a cuidar dela.`, 'Nada é apagado; dá para ver o histórico da mudança.'],
          resumo: `Ativar ${e.razaoSocial} no ${o.servico}`,
        };
      },
      async executar(ctx, params) {
        const cnpj = so(params?.cnpj);
        if (cnpj.length !== 14) return { sucesso: false, mensagem: 'Empresa inválida. Peça para eu preparar de novo.' };
        const r = await ctx.chamarApi('POST', '/api/empresas/atendimento/ativar', { cnpj, motivo: 'Ativada pela Murad (com o OK da pessoa).' });
        if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
        return { sucesso: true, mensagem: r.corpo?.mensagem || `Empresa ativada no ${o.servico}.` };
      },
    },
  ];
}
