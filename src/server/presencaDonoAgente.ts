// Agente IA (voz e chat): online/offline dos escritórios e usuários, SÓ para o dono do sistema (mesma rota da tela Usuários e licenças).
import { erroApi, ok, type Ferramenta } from './agenteMotor';

export const INSTRUCAO_PRESENCA_DONO = `
ONLINE/OFFLINE DOS ESCRITÓRIOS (só o dono do sistema): "quem está online?", "o escritório X está usando?", "quantos do escritório X estão online?": use escritorios_online. Online = sinal nos últimos 2 minutos; ativo = até 15 minutos; offline mostra o último horário visto (Brasília). Junta DP, Fiscal e Contábil. Se a ferramenta recusar, diga que só o dono do sistema vê.
`;

export const FERRAMENTAS_PRESENCA_DONO: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: { name: 'escritorios_online', description: 'Só para o DONO DO SISTEMA: mostra quais escritórios clientes e quais usuários estão online agora (sinal nos últimos 2 minutos), ativos há pouco (até 15 minutos) ou offline (com o último horário visto), em qual sistema (DP, Fiscal, Contábil) e em qual tela. Use quando o dono perguntar "quem está online?", "o Natan está no sistema?", "a Pontual Contabilidade está usando?", "quantos usuários do escritório X estão online?". Escritórios clientes nunca veem isto: se a ferramenta recusar, diga que só o dono do sistema vê.', parameters: { type: 'OBJECT', properties: { escritorio: { type: 'STRING', description: 'Parte do e-mail do escritório ou do usuário (opcional). Sem isso, traz o resumo de todos.' } } } },
    async executar(ctx, args) {
      const r = await ctx.chamarApi('GET', '/api/auth/tenants/presenca');
      if (r.status === 403) return { erro: 'Só o dono do sistema vê quem está online nos escritórios.' };
      if (!ok(r)) return erroApi(r);
      const busca = String(args.escritorio ?? '').trim().toLowerCase();
      const todos: any[] = Object.values(r.corpo?.escritorios || {});
      const lista = busca ? todos.filter((e) => String(e.login).includes(busca) || (e.usuarios || []).some((u: any) => String(u.login).includes(busca))) : todos;
      if (busca && !lista.length) return { erro: 'Não encontrei esse escritório ou usuário.', escritorios: todos.map((e) => e.login) };
      return {
        geradoEm: r.corpo?.geradoEm,
        resumo: { escritoriosComAlguemOnline: lista.filter((e) => e.online > 0).length, usuariosOnline: lista.reduce((n, e) => n + Number(e.online || 0), 0), totalEscritorios: lista.length },
        escritorios: lista.map((e) => ({
          escritorio: e.login, situacao: e.texto, online: e.online, ativosHaPouco: e.ativos, usuarios: e.totalUsuarios,
          pessoas: busca ? (e.usuarios || []).map((u: any) => ({ login: u.login, papel: u.papel, situacao: u.texto, ondeEsta: (u.sistemas || []).filter((x: any) => x.estado !== 'offline').map((x: any) => `${x.sistema}${x.tela ? ` (tela ${x.tela})` : ''}`) })) : undefined,
        })),
        sistemasSemResposta: (r.corpo?.sistemas || []).filter((x: any) => !x.ok).map((x: any) => x.sistema),
        observacao: 'Online = sinal nos últimos 2 minutos; ativo = até 15 minutos; offline mostra o último horário visto (Brasília). Também fica em Usuários e licenças, na lista de escritórios.',
      };
    },
  },
];
