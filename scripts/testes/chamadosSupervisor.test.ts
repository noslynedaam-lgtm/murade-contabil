// Chamados para o supervisor (pedido do Beny, 28/11/2026): a Murad disse "vou chamar meu supervisor" e nada chegou ao dono.
// Prova: (1) resposta que promete o supervisor SEM a ferramenta → o servidor registra sozinho; (2) com a ferramenta não duplica;
// (3) se não der para registrar, a resposta deixa de prometer; (4) o dono recebe o aviso no aparelho; (5) a resposta do dono volta só
// para quem perguntou (não vaza para outro escritório); (6) o robô reenvia o aviso de chamado aberto há mais de 2 h sem o dono ver.
// Dados fictícios. Postgres de verdade (initdb do sistema) quando existir; sem ele, só a parte sem banco roda.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArmazemAcoesPendentes, conversar, type ContextoAgente, type ModeloIA, type EventoAuditoria } from '../../src/server/agenteMotor';
import { prometeuSupervisor, cumprirPromessaSupervisor, FRASE_SEM_REGISTRO, registrarChamado, listarChamados, contarChamados, marcarChamadosVistos, responderChamado, resolverChamado, respostasParaUsuario, marcarRespostaLida, conferirChamados, limparPreparoChamadosParaTeste, type DepsChamados } from '../../src/server/chamadosSupervisor';
import { temPostgresLocal, subirPostgres } from './apoio/psqlConsultar';

test('reconhece a promessa de chamar o supervisor (e não confunde com o supervisor do estágio)', () => {
  assert.equal(prometeuSupervisor('Isso eu não sei resolver aqui. Vou levar ao meu supervisor e volto a falar com você.'), true);
  assert.equal(prometeuSupervisor('Vou chamar meu supervisor.'), true);
  assert.equal(prometeuSupervisor('Já registrei e encaminhei para a minha supervisora.'), true);
  assert.equal(prometeuSupervisor('Preencha o CPF do supervisor do estágio na aba Estagiário.'), false);
  assert.equal(prometeuSupervisor('Supervisor (nome) e CPF do supervisor ficam no cadastro do estagiário.'), false);
  assert.equal(prometeuSupervisor('Você tem 3 empresas cadastradas.'), false);
});

test('cumprirPromessaSupervisor: registra quando faltou, não duplica, e tira a promessa quando o registro falha', async () => {
  const feitos: any[] = [];
  const r1 = await cumprirPromessaSupervisor({ resposta: 'Vou levar ao meu supervisor.', jaRegistrado: false, pergunta: 'Como faço o eSocial do doméstico?', cnpj: null, registrar: (e) => { feitos.push(e); } });
  assert.equal(r1.registrouAgora, true); assert.equal(feitos.length, 1); assert.equal(feitos[0].evento, 'duvida_sem_resposta'); assert.equal(feitos[0].resumo, 'Como faço o eSocial do doméstico?');
  const r2 = await cumprirPromessaSupervisor({ resposta: 'Vou levar ao meu supervisor.', jaRegistrado: true, pergunta: 'x', cnpj: null, registrar: (e) => { feitos.push(e); } });
  assert.equal(r2.registrouAgora, false); assert.equal(feitos.length, 1);
  const r3 = await cumprirPromessaSupervisor({ resposta: 'Vou levar ao meu supervisor.', jaRegistrado: false, pergunta: 'x', cnpj: null, registrar: () => { throw new Error('banco fora'); } });
  assert.equal(r3.resposta, FRASE_SEM_REGISTRO);
  assert.equal(prometeuSupervisor(r3.resposta), true, 'a frase honesta fala do supervisor, mas não promete levar');
});

function ctxDeTeste(registrar: (e: EventoAuditoria) => Promise<void> | void, ferramentas: any[] = []): ContextoAgente {
  return { sessaoHash: 'h', login: 'murad@escritorio-a.test', hoje: '2026-11-28', chamarApi: async () => ({ status: 200, corpo: {} }), registrar, pendentes: new ArmazemAcoesPendentes(), kit: { ferramentas, instrucao: '' }, mensagemOriginal: 'Como registro o ponto do vigia noturno 12x36?' };
}

test('motor: a Murad só escreveu "vou chamar meu supervisor" → o servidor registra com a pergunta original', async () => {
  const eventos: EventoAuditoria[] = [];
  const modelo: ModeloIA = async () => ({ texto: 'Não encontrei onde resolver isso. Vou chamar meu supervisor e volto a falar com você.', chamadas: [] });
  const r = await conversar(ctxDeTeste((e) => { eventos.push(e); }), modelo, '[dica do mapa] Como registro o ponto do vigia noturno 12x36?');
  const chamados = eventos.filter((e) => e.evento === 'duvida_sem_resposta');
  assert.equal(chamados.length, 1);
  assert.equal(chamados[0].ferramenta, 'chamar_supervisor_automatico');
  assert.equal(chamados[0].resumo, 'Como registro o ponto do vigia noturno 12x36?');
  assert.match(r.resposta, /supervisor/);
});

test('motor: com a ferramenta chamar_supervisor não registra de novo; com falha no registro a resposta não promete', async () => {
  const eventos: EventoAuditoria[] = [];
  const ferramenta = { tipo: 'leitura', declaracao: { name: 'chamar_supervisor', description: '', parameters: { type: 'OBJECT', properties: {} } }, async executar(ctx: ContextoAgente, args: any) { await ctx.registrar({ evento: 'duvida_sem_resposta', ferramenta: 'chamar_supervisor', cnpj: null, resumo: String(args.pergunta) }); return { status: 'registrado' }; } };
  let passo = 0;
  const modelo: ModeloIA = async () => (passo++ === 0 ? { texto: '', chamadas: [{ nome: 'chamar_supervisor', args: { pergunta: 'Ponto do vigia 12x36' } }] } : { texto: 'Levei ao meu supervisor; assim que tiver a resposta, volto a falar com você.', chamadas: [] });
  await conversar(ctxDeTeste((e) => { eventos.push(e); }, [ferramenta]), modelo, 'Como registro o ponto do vigia?');
  assert.equal(eventos.filter((e) => e.evento === 'duvida_sem_resposta').length, 1);

  const modelo2: ModeloIA = async () => ({ texto: 'Vou levar isso ao meu supervisor.', chamadas: [] });
  const r = await conversar(ctxDeTeste((e) => { if (e.evento === 'duvida_sem_resposta') throw new Error('banco fora'); }), modelo2, 'pergunta');
  assert.equal(r.resposta, FRASE_SEM_REGISTRO);
});

test('banco: registra, avisa o dono no aparelho, responde só para quem perguntou e o robô reenvia depois de 2 h', { skip: !temPostgresLocal && 'sem Postgres local' }, async () => {
  const pg = subirPostgres();
  try {
    limparPreparoChamadosParaTeste();
    // Tabela como estava antes (colunas antigas): as novas entram sozinhas.
    await pg.consultar(`CREATE TABLE contabil_ai_agent_log (id bigserial PRIMARY KEY, login text NOT NULL, cnpj text, event text NOT NULL, tool text NOT NULL, summary text NOT NULL, result text, created_at timestamptz NOT NULL DEFAULT now())`);
    await pg.consultar(`INSERT INTO contabil_ai_agent_log (login, cnpj, event, tool, summary) VALUES ('antigo@x.test', NULL, 'duvida_sem_resposta', 'chamar_supervisor', 'Chamado antigo') RETURNING id`);
    const pushes: Array<{ userId: string; titulo: string; corpo: string }> = [];
    const deps: DepsChamados = {
      consultar: pg.consultar, tabela: 'contabil_ai_agent_log', sistema: 'Contábil',
      donos: async () => [{ id: '1', login: 'dono@murad.test' }],
      enviarPush: async (userId, aviso) => { pushes.push({ userId, titulo: aviso.titulo, corpo: aviso.corpo }); return { enviados: 1, motivo: 'ok' }; },
      idDoLogin: async (login) => (login === 'murad@escritorio-a.test' ? '77' : null),
    };
    const r = await registrarChamado(deps, { login: 'murad@escritorio-a.test', cnpj: '11222333000181', pergunta: 'Como registro o ponto do vigia 12x36?', contexto: { origem: 'automatico', escritorio: 'escritorio-a@x.test', tenant: '5', empresaCnpj: '11222333000181', empresaNome: 'Padaria Fictícia', tela: 'contabil#lancamentos', respostaMurad: 'Vou chamar meu supervisor.' } });
    assert.equal(r.novo, true); assert.equal(r.aparelhos, 1);
    assert.equal(pushes.length, 1); assert.equal(pushes[0].userId, '1');
    assert.match(pushes[0].titulo, /Chamado para o supervisor \(Contábil\)/); assert.match(pushes[0].corpo, /vigia/);
    // O mesmo pedido de novo em seguida não duplica (nem manda outro aviso).
    const dup = await registrarChamado(deps, { login: 'murad@escritorio-a.test', cnpj: '11222333000181', pergunta: 'Como registro o ponto do vigia 12x36?', contexto: { origem: 'automatico' } });
    assert.equal(dup.novo, false); assert.equal(dup.id, r.id); assert.equal(pushes.length, 1);

    const lista = await listarChamados(deps);
    assert.equal(lista.length, 2);
    const meu = lista.find((c) => c.id === r.id)!;
    assert.equal(meu.contexto?.empresaNome, 'Padaria Fictícia'); assert.equal(meu.contexto?.tela, 'contabil#lancamentos'); assert.equal(meu.contexto?.origem, 'automatico');
    assert.equal(meu.avisosEnviados, 1); assert.equal(meu.aparelhosAvisados, 1); assert.equal(meu.vistoEm, null);
    assert.deepEqual(await contarChamados(deps), { abertos: 2, novos: 2, semResposta: 2 });

    // Robô: ainda não passou 2 h → não reenvia. Volta o relógio 3 h → reenvia uma vez; rodando de novo não reenvia.
    assert.equal((await conferirChamados(deps)).reenviados, 0);
    await pg.consultar(`UPDATE contabil_ai_agent_log SET created_at = now() - interval '3 hours', push_at = CASE WHEN push_at IS NULL THEN NULL ELSE now() - interval '3 hours' END RETURNING id`);
    const conf = await conferirChamados(deps);
    assert.equal(conf.reenviados, 2, 'os dois abertos há mais de 2 h sem o dono ver');
    assert.match(pushes[pushes.length - 1].titulo, /^Ainda aberto/);
    assert.equal((await conferirChamados(deps)).reenviados, 0, 'no máximo um reenvio a cada 2 h');
    // O dono abriu a lista: vistos → o robô não reenvia mais, mesmo passando o tempo.
    assert.equal(await marcarChamadosVistos(deps), 2);
    await pg.consultar(`UPDATE contabil_ai_agent_log SET push_at = now() - interval '5 hours' RETURNING id`);
    assert.equal((await conferirChamados(deps)).reenviados, 0);

    // Resposta do dono: volta só para quem perguntou; outro escritório não vê nem marca como lida.
    const antes = pushes.length;
    const resp = await responderChamado(deps, Number(r.id), 'Use a escala 12x36 na aba Jornada do funcionário.', 'dono@murad.test');
    assert.equal(resp.ok, true); assert.equal(resp.avisouAparelho, 1);
    assert.equal(pushes.length, antes + 1); assert.equal(pushes[pushes.length - 1].userId, '77');
    assert.deepEqual(await respostasParaUsuario(deps, 'outra@escritorio-b.test'), []);
    assert.equal(await marcarRespostaLida(deps, 'outra@escritorio-b.test', Number(r.id)), false);
    const minhas = await respostasParaUsuario(deps, 'MURAD@escritorio-a.test');
    assert.equal(minhas.length, 1); assert.match(minhas[0].resposta, /12x36/);
    assert.equal((await conferirChamados(deps)).respostasNaoLidas, 1);
    assert.equal(await marcarRespostaLida(deps, 'murad@escritorio-a.test', Number(r.id)), true);
    assert.deepEqual(await respostasParaUsuario(deps, 'murad@escritorio-a.test'), []);
    assert.equal((await responderChamado(deps, Number(r.id), '', 'dono')).ok, false);
    assert.equal((await responderChamado(deps, 999999, 'oi', 'dono')).ok, false);

    // Resolvido sai da lista de abertos (fica guardado).
    assert.equal(await resolverChamado(deps, Number(r.id)), true);
    assert.equal((await listarChamados(deps)).length, 1);
    assert.equal((await listarChamados(deps, { todas: true })).length, 2);
    assert.equal((await contarChamados(deps)).abertos, 1);
  } finally { pg.parar(); }
});
