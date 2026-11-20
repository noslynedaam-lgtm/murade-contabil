// Ferramentas da Agente IA (voz ou texto) para a ESCOLA MURADE.
//  - abrir_aula_escola: SÓ LEITURA. Acha a aula pelo assunto, abre a Escola e a seta mostra a aula (piloto: só mostra).
//  - explicar_termo: SÓ LEITURA. "Me explica X": o termo do glossário da Escola, com a fonte oficial.
//  - progresso_aluno_escola: SÓ LEITURA. Progresso, notas, nível e onde mais erra (gestor vê a equipe; os demais, o próprio).
//  - atribuir_trilha_escola: ação com CARTÃO DE CONFIRMAÇÃO (só o administrador do escritório). O aluno recebe aviso ao entrar.
// A Escola é um adicional pago: sem liberação, as ferramentas dizem isso e não mostram o conteúdo.
import { buscarAula, buscarGlossario, normalizarEscola, TRILHAS } from '../data/escolaConteudo';
import { pilotoAbrirAula } from '../utils/escolaMeMostra';
import { ok, erroApi, type ContextoAgente, type Ferramenta } from './agenteMotor';

export const NAO_LIBERADA = 'A Escola Murade é um adicional. Fale com o seu fornecedor para liberar.';
async function liberada(ctx: ContextoAgente): Promise<{ liberado: boolean; gestor: boolean; motivo: string }> {
  const r = await ctx.chamarApi('GET', '/api/escola/estado');
  return { liberado: r.corpo?.liberado === true, gestor: r.corpo?.gestor === true, motivo: String(r.corpo?.motivo || NAO_LIBERADA) };
}
const IDS_TRILHAS = TRILHAS.map((t) => t.id).join(', ');

export const FERRAMENTAS_ESCOLA: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: {
      name: 'abrir_aula_escola',
      description: 'Abre a Escola Murade (aba do menu) e mostra com a seta a aula pedida (ex.: "abre a aula de conciliação", "quero estudar partidas dobradas"). Só mostra: não grava nada.',
      parameters: { type: 'OBJECT', properties: { assunto: { type: 'STRING', description: 'O assunto ou o nome da aula, nas palavras da pessoa.' } }, required: ['assunto'] },
    },
    async executar(ctx, args) {
      const lib = await liberada(ctx); if (!lib.liberado) return { liberado: false, mensagem: lib.motivo };
      const aula = buscarAula(String(args.assunto || ''));
      if (!aula) return { encontrado: false, trilhas: TRILHAS.map((t) => t.titulo), instrucao: 'Não achei essa aula. Diga as trilhas disponíveis e pergunte qual a pessoa quer.' };
      const trilha = TRILHAS.find((t) => t.id === aula.trilha)?.titulo;
      const piloto = pilotoAbrirAula(aula.id, aula.titulo, `Aqui está a aula "${aula.titulo}" (trilha ${trilha}). Clique para abrir.`);
      return { ...(piloto ? { piloto } : {}), encontrado: true, aula: aula.titulo, trilha, resumo: aula.oQueE, instrucao: 'Diga em uma frase que a aula está na tela e o que ela ensina.' };
    },
  },
  {
    tipo: 'leitura',
    declaracao: {
      name: 'explicar_termo',
      description: 'Explica um termo pelo glossário "O que é isso?" da Escola Murade (CFOP, CSOSN, RBT12, Fator R, DIFAL, PGDAS-D, partidas dobradas, ECD...), com a fonte oficial. Use para "me explica X", "o que é X", "o que significa X".',
      parameters: { type: 'OBJECT', properties: { termo: { type: 'STRING', description: 'O termo, como a pessoa falou.' } }, required: ['termo'] },
    },
    async executar(ctx, args) {
      const lib = await liberada(ctx); if (!lib.liberado) return { liberado: false, mensagem: lib.motivo };
      const achados = buscarGlossario(String(args.termo || ''), 3);
      if (!achados.length) return { encontrado: false, instrucao: 'Esse termo não está no glossário da Escola. Diga isso e, se souber com segurança, explique sem inventar regra; nada de lei sem fonte oficial.' };
      const g = achados[0];
      return { encontrado: true, termo: g.termo, explicacao: g.explicacao, fonte: g.fonte.nome, aulaRelacionada: g.aula, parecidos: achados.slice(1).map((x) => x.termo),
        instrucao: 'Explique em linguagem simples, com a fonte. Ofereça abrir a aula relacionada (abrir_aula_escola).' };
    },
  },
  {
    tipo: 'leitura',
    declaracao: {
      name: 'progresso_aluno_escola',
      description: 'Mostra o progresso na Escola Murade: aulas feitas, notas, provas, nível e onde mais erra. O administrador do escritório pode pedir de alguém da equipe (pelo usuário/e-mail); os demais veem só o próprio.',
      parameters: { type: 'OBJECT', properties: { aluno: { type: 'STRING', description: 'Usuário (login) de quem o gestor quer ver. Vazio = eu mesmo ou a equipe toda (gestor).' } } },
    },
    async executar(ctx, args) {
      const lib = await liberada(ctx); if (!lib.liberado) return { liberado: false, mensagem: lib.motivo };
      if (lib.gestor) {
        const r = await ctx.chamarApi('GET', '/api/escola/gestor'); if (!ok(r)) return erroApi(r);
        const alvo = normalizarEscola(args.aluno || '');
        const alunos = (r.corpo.alunos || []).filter((a: any) => !alvo || normalizarEscola(a.login).includes(alvo));
        return { alunos: alunos.slice(0, 15).map((a: any) => ({ login: a.login, aulasFeitas: `${a.aulasFeitas} de ${a.totalAulas}`, mediaQuestionarios: a.mediaQuiz, nivel: a.nivel, ultimaProva: a.provas[0] ? { pratica: a.provas[0].praticaId, nota: a.provas[0].nota } : null, ondeMaisErra: a.ondeMaisErra, parado: a.parado.length > 0 })) };
      }
      const r = await ctx.chamarApi('GET', '/api/escola/conteudo'); if (!ok(r)) return erroApi(r);
      const p = r.corpo.progresso || {};
      return { aulasConcluidas: (p.aulas || []).filter((a: any) => a.concluida).length, nivel: p.nivel, provas: (p.provas || []).slice(0, 5).map((x: any) => ({ pratica: x.praticaId, nota: x.nota, nivel: x.nivel })), trilhasAtribuidas: (p.atribuicoes || []).map((a: any) => a.trilhaId) };
    },
  },
  {
    tipo: 'acao',
    declaracao: {
      name: 'atribuir_trilha_escola',
      description: `Propõe atribuir uma trilha da Escola Murade a alguém da equipe ("você vai estudar isto"); a pessoa recebe um aviso ao entrar. Só o administrador do escritório. Trilhas: ${IDS_TRILHAS}.`,
      parameters: { type: 'OBJECT', properties: { aluno: { type: 'STRING', description: 'Usuário (login/e-mail) da pessoa da equipe.' }, trilha: { type: 'STRING', description: 'Id ou nome da trilha.' } }, required: ['aluno', 'trilha'] },
    },
    async preparar(ctx, args) {
      const lib = await liberada(ctx); if (!lib.liberado) return { erro: lib.motivo };
      if (!lib.gestor) return { erro: 'Só o administrador do escritório atribui trilhas.' };
      const t = normalizarEscola(args.trilha || '');
      const trilha = TRILHAS.find((x) => x.id === t || normalizarEscola(x.titulo) === t) || TRILHAS.find((x) => normalizarEscola(x.titulo).includes(t) || x.id.includes(t.replace(/ /g, '-')));
      if (!t || !trilha) return { erro: `Trilha não encontrada. As trilhas são: ${TRILHAS.map((x) => x.titulo).join('; ')}.` };
      const r = await ctx.chamarApi('GET', '/api/escola/gestor'); if (!ok(r)) return { erro: String(r.corpo?.motivo || 'Não consegui ler a equipe.') };
      const alvo = normalizarEscola(args.aluno || '');
      const achados = (r.corpo.alunos || []).filter((a: any) => alvo && normalizarEscola(a.login).includes(alvo));
      if (achados.length !== 1) return { erro: achados.length ? 'Mais de uma pessoa com esse nome: diga o usuário completo.' : 'Essa pessoa não está na equipe do escritório.' };
      return { cnpj: '', params: { login: achados[0].login, trilhaId: trilha.id }, titulo: `Atribuir a trilha "${trilha.titulo}" a ${achados[0].login}`,
        descricao: [`Trilha: ${trilha.titulo} — ${trilha.resumo}`, `Aluno: ${achados[0].login}`, 'Ele recebe o aviso "Você vai estudar isto" ao entrar no sistema.'], resumo: `Atribuir trilha ${trilha.titulo}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', '/api/escola/atribuir', params);
      return { sucesso: r.corpo?.sucesso === true, mensagem: String(r.corpo?.mensagem || r.corpo?.motivo || 'Não foi possível atribuir.') };
    },
  },
];

export const INSTRUCAO_ESCOLA = `

ESCOLA MURADE (aba "Escola Murade" do menu; adicional pago)
- "Me explica X", "o que é X", "o que significa X" sobre o trabalho fiscal ou contábil: use explicar_termo e responda curto, com a fonte oficial. Nunca invente regra ou artigo de lei.
- "Quero estudar", "abre a aula de ...": use abrir_aula_escola (a seta mostra a aula).
- Progresso, notas e nível de alguém da equipe: progresso_aluno_escola. Atribuir trilha a um funcionário novo: atribuir_trilha_escola (cartão de confirmação).
- Se a Escola não estiver liberada, diga exatamente: "${NAO_LIBERADA}"
`;
