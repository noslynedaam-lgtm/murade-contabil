// Ferramentas da Agente IA para o backup do escritório (iguais nos três sistemas Murade; muda só o caminho da API).
//  - ultimo_backup_escritorio: SÓ LEITURA — quando foi o último backup, o próximo agendado, a agenda e o destino.
//  - backup_escritorio_agora: cartão de confirmação; faz o backup do escritório na hora (completo ou só alterações).
//  - agendar_backup_escritorio: cartão de confirmação; inclui um agendamento (todo dia / semana / mês, horário).
// Restaurar backup NÃO é pela Agente: só na tela Backup, pelo administrador do escritório, com duas confirmações.
import { erroApi, ok, type Ferramenta } from '../agenteMotor';

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const dataHora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null);

function diaSemanaDe(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (Number.isInteger(n) && n >= 0 && n <= 6) return n;
  const t = String(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const i = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'].findIndex((p) => t.startsWith(p));
  return i >= 0 ? i : undefined;
}

function horaDe(v: unknown): string | null {
  const m = String(v ?? '').trim().match(/^(\d{1,2})(?:[:h]\s*(\d{2})?)?\s*h?$/i);
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2] || 0);
  return h <= 23 && min <= 59 ? `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` : null;
}

export function ferramentasBackupEscritorio(api: string, nomeSistema: string): Ferramenta[] {
  return [
    {
      tipo: 'leitura',
      declaracao: {
        name: 'ultimo_backup_escritorio',
        description: `Diz quando foi o último backup do escritório no ${nomeSistema}, se foi conferido, o próximo agendado, os agendamentos (todo dia/semana/mês, completo ou só alterações) e para onde vai (computador, nuvem do escritório). SÓ CONSULTA. Use quando perguntarem "quando foi o último backup", "o backup está em dia?", "qual a agenda do backup". Não é o backup completo do banco do sistema (esse é só do dono).`,
        parameters: { type: 'OBJECT', properties: {} },
      },
      async executar(ctx) {
        const r = await ctx.chamarApi('GET', `${api}/resumo`);
        if (!ok(r)) return erroApi(r);
        const c = r.corpo || {};
        return {
          ultimoBackup: c.ultimo ? { quando: dataHora(c.ultimo.em), diasAtras: c.diasDesdeUltimo, tipo: c.ultimo.tipo, origem: c.ultimo.origem } : null,
          emAndamento: Boolean(c.emAndamento),
          proximo: c.proximo ? { quando: dataHora(c.proximo.quando), qual: c.proximo.descricao } : null,
          agendamentos: (c.perfis || []).map((p: any) => ({ descricao: p.descricao, ativo: p.ativo })),
          destino: { computador: c.config?.pastaComputador ? 'grava sozinho na pasta escolhida quando o sistema está aberto' : 'baixar pela tela Backup', nuvem: c.config?.nuvem ? `${c.config.nuvem.bucket} (${c.config.nuvem.ativo ? 'ligada' : 'desligada'})` : 'não configurada' },
          conferenciaDepoisDoBackup: c.config?.validar !== false,
          observacao: 'Só consulta. Se não houver agendamento, ofereça agendar (agendar_backup_escritorio) e lembre que o backup mensal automático continua valendo. Restaurar é só na tela Backup, pelo administrador do escritório.',
        };
      },
    },
    {
      tipo: 'acao',
      declaracao: {
        name: 'backup_escritorio_agora',
        description: `Propõe fazer AGORA o backup do escritório no ${nomeSistema} (arquivo próprio do Murade, cifrado, conferido depois e enviado à nuvem do escritório se houver). Tipo "completo" (padrão) ou "alteracoes" (só o que mudou desde o último completo). Use quando pedirem "faz backup agora". Só lê os dados; não altera nada.`,
        parameters: { type: 'OBJECT', properties: { tipo: { type: 'STRING', description: 'completo (padrão) ou alteracoes.' } } },
      },
      async preparar(ctx, args) {
        const r = await ctx.chamarApi('GET', `${api}/resumo`);
        if (!ok(r)) return erroApi(r);
        if (r.corpo?.chaveConfigurada === false) return { erro: 'O backup cifrado ainda não foi ativado neste servidor (falta a chave mestra). Avise o suporte do Murade.' };
        if (r.corpo?.emAndamento) return { erro: 'Já existe um backup deste escritório em andamento. Aguarde terminar.' };
        const tipo = String(args.tipo || '').toLowerCase().startsWith('altera') ? 'alteracoes' : 'completo';
        return {
          cnpj: '', params: { tipo },
          titulo: `Fazer backup ${tipo === 'completo' ? 'completo' : 'só das alterações'} agora`,
          descricao: [`Gera o arquivo de backup do escritório (formato próprio do Murade, cifrado), confere e guarda na lista da tela Backup${r.corpo?.config?.nuvem?.ativo ? ' e na nuvem do escritório' : ''}.`, 'Só lê os dados: nada é alterado. Leva de segundos a poucos minutos.'],
          resumo: `Backup ${tipo === 'completo' ? 'completo' : 'das alterações'} agora`,
        };
      },
      async executar(ctx, params) {
        const r = await ctx.chamarApi('POST', `${api}/executar`, { tipo: params?.tipo === 'alteracoes' ? 'alteracoes' : 'completo', origem: 'agente' });
        if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
        return { sucesso: true, mensagem: r.corpo?.mensagem || 'Backup iniciado.' };
      },
    },
    {
      tipo: 'acao',
      declaracao: {
        name: 'agendar_backup_escritorio',
        description: `Propõe INCLUIR um agendamento de backup do escritório no ${nomeSistema}: todo dia, toda semana (com o dia da semana) ou todo mês (com o dia do mês), no horário pedido (Brasília), completo ou só alterações. Ex.: "agenda backup todo dia às 18h", "backup completo toda sexta às 19h". Só o administrador do escritório pode. Não apaga os agendamentos que já existem.`,
        parameters: {
          type: 'OBJECT',
          properties: {
            frequencia: { type: 'STRING', description: 'diario, semanal ou mensal.' },
            hora: { type: 'STRING', description: 'Horário HH:MM (ex.: 18:00).' },
            diaSemana: { type: 'STRING', description: 'Só no semanal: domingo, segunda, terça, quarta, quinta, sexta ou sábado.' },
            diaMes: { type: 'NUMBER', description: 'Só no mensal: dia do mês de 1 a 31 (mês mais curto usa o último dia).' },
            tipo: { type: 'STRING', description: 'completo (padrão) ou alteracoes.' },
          },
          required: ['frequencia', 'hora'],
        },
      },
      async preparar(ctx, args) {
        const f = String(args.frequencia || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const frequencia = f.startsWith('di') || f.includes('dia') ? 'diario' : f.startsWith('sem') ? 'semanal' : f.startsWith('mes') || f.startsWith('men') ? 'mensal' : null;
        if (!frequencia) return { erro: 'Diga se o backup é todo dia, toda semana ou todo mês.' };
        const hora = horaDe(args.hora);
        if (!hora) return { erro: 'Diga o horário (ex.: 18:00).' };
        const diaSemana = frequencia === 'semanal' ? diaSemanaDe(args.diaSemana) : undefined;
        if (frequencia === 'semanal' && diaSemana === undefined) return { erro: 'Diga o dia da semana do backup semanal.' };
        const diaMes = frequencia === 'mensal' ? Number(args.diaMes) : undefined;
        if (frequencia === 'mensal' && !(Number.isInteger(diaMes) && diaMes! >= 1 && diaMes! <= 31)) return { erro: 'Diga o dia do mês (1 a 31).' };
        const tipo = String(args.tipo || '').toLowerCase().startsWith('altera') ? 'alteracoes' : 'completo';
        const r = await ctx.chamarApi('GET', `${api}/resumo`);
        if (!ok(r)) return erroApi(r);
        if (r.corpo?.voce?.administrador !== true) return { erro: 'Somente o administrador do escritório muda a agenda do backup.' };
        const quando = frequencia === 'diario' ? `todo dia às ${hora}` : frequencia === 'semanal' ? `toda ${DIAS[diaSemana!]} às ${hora}` : `todo dia ${diaMes} do mês às ${hora}`;
        return {
          cnpj: '', params: { frequencia, hora, diaSemana, diaMes, tipo },
          titulo: `Agendar backup ${tipo === 'completo' ? 'completo' : 'só das alterações'} ${quando}`,
          descricao: [`Inclui o agendamento: ${tipo === 'completo' ? 'backup completo' : 'só as alterações desde o último completo'} ${quando} (horário de Brasília).`, 'Os agendamentos que já existem continuam. Se dois caírem no mesmo horário, vale o completo.'],
          resumo: `Agendar backup ${quando}`,
        };
      },
      async executar(ctx, params) {
        const r = await ctx.chamarApi('POST', `${api}/perfis`, params);
        if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
        return { sucesso: true, mensagem: `Agendamento incluído: ${r.corpo?.perfil?.nome || 'backup agendado'}.` };
      },
    },
  ];
}

export const INSTRUCAO_BACKUP_ESCRITORIO = `
- Backup do escritório (tela Backup): para "quando foi o último backup" use ultimo_backup_escritorio; para "faz backup agora" use backup_escritorio_agora; para "agenda backup todo dia às 18h" (ou semanal/mensal) use agendar_backup_escritorio. As duas últimas viram cartão de confirmação. Restaurar backup é só na tela Backup, pelo administrador do escritório, com duas confirmações — oriente a pessoa a ir lá. Não confunda com status_backup/backup_agora, que são o backup completo do banco do sistema, só do dono.`;
