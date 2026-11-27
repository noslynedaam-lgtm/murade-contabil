// AGENTE ÁGIL (igual no DP, Fiscal e Contábil). Arquivo puro: servidor e navegador usam o mesmo código.
//
// Pedido do dono (27/11/2026): "tem que ser ágil igual as outras IAs, ir direto ao ponto, resolver o que pedimos, não ficar conversando".
// Medição real (Render, DP): a chamada ao modelo levava 2,4 a 5,5 s e a voz mais 2,5 a 3,7 s para o primeiro áudio.
// O que este arquivo faz, sem tirar nenhuma proteção:
//  1. Escolhe só as ferramentas (e as linhas do prompt que falam delas) que têm a ver com o pedido. O prompt completo tinha
//     cerca de 230 mil caracteres (250 ferramentas). Se a escolha não servir, a ferramenta `mais_ferramentas` devolve a lista toda.
//  2. Decide quanto o modelo "pensa": mínimo nas perguntas simples; mais só com documento anexado ou cálculo.
//  3. Regra de estilo: responde em 1 a 3 frases curtas, começa pela resposta e faz a ação na primeira resposta.
//  4. Regra de permissão: levar até a tela é livre. Excluir, enviar, transmitir, fechar ou gravar só com ordem explícita E o OK no cartão.
//  5. Voz: fala só o resumo (1 a 2 frases, cerca de 250 caracteres) e divide em pedaços curtos para o primeiro áudio sair logo.
//  6. Medição: uma linha de log por pedido com o tempo de cada etapa e o tamanho do prompt (sem dado pessoal).

// ------------------------------------------------------------------------------------------------ nome da Agente
/** Nome da Agente nos sistemas Murade (decisão do dono, 27/11/2026). A pessoa chama por ele: "Murad, me ajuda com...". */
export const NOME_DA_AGENTE = 'Murad';
/** Apresentação do primeiro contato, logo depois de a pessoa dizer o nome (voz e texto). Uma vez só; depois é só "Oi, {nome}.". */
export function fraseDeApresentacao(nome: string | null | undefined): string {
  return `${nome ? `Prazer, ${nome}!` : 'Prazer!'} Meu nome é ${NOME_DA_AGENTE}. Qualquer coisa, é só me chamar pelo nome: "${NOME_DA_AGENTE}, me ajuda com..." ou "${NOME_DA_AGENTE}, faz tal coisa", que eu já te respondo.`;
}

// ------------------------------------------------------------------------------------------------ texto
export function semAcentoAgil(texto: string): string {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\be (social|cac)\b/g, 'e$1');
}
const PARADAS = new Set(['de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as', 'um', 'uma', 'para', 'pra', 'pro', 'no', 'na', 'nos', 'nas', 'em', 'e', 'que', 'eu', 'me', 'meu', 'minha', 'por', 'com', 'ao', 'aos', 'se', 'ou', 'pelo', 'pela', 'esse', 'essa', 'isso', 'este', 'esta', 'qual', 'quais', 'como', 'onde', 'voce', 'agente', 'sistema', 'quero', 'preciso', 'pode', 'favor', 'sim', 'nao', 'tem', 'ter', 'ja', 'mais', 'muito', 'vai', 'faz', 'fazer', 'ver', 'agora', 'aqui', 'ai', 'la', 'so', 'tudo', 'todo', 'toda', 'todos', 'todas', 'mes', 'hoje', 'ok', 'use', 'usar', 'quando', 'sem', 'ele', 'ela', 'dele', 'dela', 'seu', 'sua', 'ser', 'esta', 'estao', 'foi', 'sao', 'nunca', 'sempre', 'depois', 'antes', 'tambem', 'opcional', 'string', 'boolean', 'number', 'object', 'id']);
/** Raiz curta da palavra (tolera plural, acento e conjugação simples). */
export function raizAgil(p: string): string {
  const sem = p.length > 4 && p.endsWith('s') ? p.slice(0, -1) : p;
  return sem.length <= 5 ? sem : sem.slice(0, 5);
}
export function raizesAgil(texto: string): string[] {
  return semAcentoAgil(texto).split(' ').filter((t) => t.length >= 3 && !PARADAS.has(t)).map(raizAgil);
}

// ------------------------------------------------------------------------------------------------ intenções
/** "me leva", "abre a tela", "vai para", "quero ir em": pedido EXPLÍCITO de ir até um lugar. */
const RE_LEVAR = /^(oi |ola |por favor |agente |ei |entao |ok )*(me (leva|leve|levar|levam)|leva( me)?|leve( me)?|me (mostra|mostre) (a tela|o menu|onde)|abre|abra|abrir|abri|vai (para|pra|pro|ate|na|no|em)|va (para|pra|pro|ate)|ir (para|pra|pro|ate)|quero ir|queria ir|preciso ir|me (manda|joga) (para|pra|pro)|navega|navegue|entra (na|no|em)|entrar (na|no|em))\b/;
export function ehPedidoDeLevar(texto: string): boolean { return RE_LEVAR.test(semAcentoAgil(texto)); }

/** "onde fica", "como faço", "como excluo", "qual botão": PERGUNTA de lugar ou de como fazer (sem ordem de fazer). */
const RE_PERGUNTA_LOCAL = /^(oi |ola |por favor |agente |ei |entao |ok )*(onde|aonde|em qual (tela|menu|botao|aba|lugar)|qual (tela|menu|botao|aba|lugar)|como (que )?(eu )?(a gente )?(faco|fazer|fazemos|faz|se faz|consigo|posso|devo|coloco|colocar|cadastro|cadastrar|admito|admitir|emito|emitir|gero|gerar|lanco|lancar|imprimo|imprimir|mando|mandar|envio|enviar|transmito|transmitir|registro|registrar|acho|achar|encontro|encontrar|abro|abrir|chego|vou|marco|marcar|tiro|tirar|preencho|preencher|dou|incluo|incluir|excluo|excluir|apago|apagar|removo|remover|deleto|deletar|fecho|fechar|salvo|salvar|gravo|gravar|baixo|baixar|desligo|desligar|demito|demitir|calculo|calcular|altero|alterar|mudo|mudar|troco|trocar|corrijo|corrigir|configuro|configurar|vejo|ver|confiro|conferir))\b/;
// "Como comparo", "como desligo", "como reabro": verbo na 1ª pessoa (ou no infinitivo) logo depois do "como" também é pergunta de como fazer.
const RE_COMO_VERBO = /^(oi |ola |por favor |agente |ei |entao |ok )*como (que )?(eu )?(a gente )?(e que )?[a-z]{3,}(o|ar|er|ir)\b/;
export function ehPerguntaDeLocal(texto: string): boolean { const t = semAcentoAgil(texto); return RE_PERGUNTA_LOCAL.test(t) || RE_COMO_VERBO.test(t); }

/** "O sistema tem X?", "faz X?", "tem como X?": pergunta se a função existe (a resposta vem do mapa de telas, nunca de suposição). */
const RE_SE_TEM = /^(oi |ola |agente |ei |murad |murade )*(o sistema |voce |vc |a agente |o murad |aqui )?(tem|faz|da para|da pra|consegue|existe|tem como|ja tem|ja faz|e possivel)\b\s*(o |a |os |as |um |uma |algum |alguma |opcao de |funcao de |como )?/;
export function ehPerguntaSeTem(texto: string): boolean { return RE_SE_TEM.test(semAcentoAgil(texto)) && semAcentoAgil(texto).replace(RE_SE_TEM, '').trim().length >= 3; }
export function assuntoDaPerguntaSeTem(texto: string): string { return semAcentoAgil(texto).replace(RE_SE_TEM, '').replace(/\b(no sistema|aqui|nesse sistema|neste sistema)\b/g, ' ').replace(/\s+/g, ' ').trim(); }
export const respostaTemSim = (lugar: string, paraQue = ''): string => `Tem sim: fica em ${lugar}.${paraQue ? ` ${paraQue}` : ''} ${OFERTA_LEVAR}`.replace(/\s+/g, ' ').trim();

/** Resposta curta que aceita a oferta "Quer que eu te leve?". */
const RE_SIM_LEVAR = /^(sim|s|pode|pode sim|pode ir|pode levar|leva|leve|me leva|me leve|leva sim|quero|quero sim|claro|isso|isso mesmo|bora|vamos|vai|manda|ok|ok pode|beleza|por favor|sim por favor|sim pode|sim leva|sim me leva|aham|uhum|com certeza|perfeito)( sim| agente| por favor| la| ai| entao)*$/;
export function ehSimParaLevar(texto: string): boolean { const t = semAcentoAgil(texto); return t.length <= 40 && RE_SIM_LEVAR.test(t); }

/** Frase que a Agente usa para oferecer levar (o "sim" seguinte leva sem chamar o modelo). */
export const OFERTA_LEVAR = 'Quer que eu te leve?';
export const ofereceuLevar = (textoDaAgente: string): boolean => semAcentoAgil(textoDaAgente).endsWith(semAcentoAgil(OFERTA_LEVAR));

// Verbos de ação protegida (excluir, enviar/transmitir, fechar folha, gravar/salvar).
const VERBO_TIRAR = '(exclui|excluir|exclua|excluo|excluam|exclusao|apaga|apagar|apague|apago|remove|remover|remova|removo|deleta|deletar|delete|esquece|esqueca|esquecer|tira|tire|tirar|retira|retire|retirar|desfaz|desfaca|desfazer|limpa|limpe|cancela|cancele|cancelar|descadastra|descadastre|desvincula|desvincule|revoga|revogue|desliga|desligue)';
const VERBO_ENVIAR = '(envia|enviar|envie|mande|manda|mandar|transmite|transmitir|transmita|transmissao|protocola|protocolar|declara|declarar)';
const VERBO_FECHAR = '(fecha|fechar|feche|encerra|encerrar|encerre)';
const VERBO_GRAVAR = '(salva|salvar|salve|grava|gravar|grave|cadastra|cadastrar|cadastre|lanca|lancar|lance|registra|registrar|registre|calcula|calcular|calcule|emite|emitir|emita|gera|gerar|gere|marca|marcar|marque|paga|pagar|pague|baixa|baixar|baixe|corrige|corrigir|corrija|atualiza|atualizar|atualize|altera|alterar|altere|importa|importar|importe|delega|delegar|delegue|avisa|avisar|avise|agenda|agendar|agende|prepara|preparar|prepare|roda|rodar|rode|faz|faca|fazer)';
const RE_ORDEM = new RegExp(`(^|\\b(pode|podes|pode ja|ja pode|por favor|agora|entao|ok|sim|vai|quero que (voce )?|preciso que (voce )?|faz o favor de|faca o favor de)\\s+)(${VERBO_TIRAR}|${VERBO_ENVIAR}|${VERBO_FECHAR}|${VERBO_GRAVAR})\\b`);
const RE_ORDEM_TIRAR = new RegExp(`(^|\\b(pode|podes|pode ja|ja pode|por favor|agora|entao|ok|sim|vai|quero que (voce )?|preciso que (voce )?)\\s+)${VERBO_TIRAR}\\b|\\b(quero|preciso) (excluir|apagar|remover|deletar|tirar|cancelar|desfazer|esquecer)\\b`);

/** "Você pode excluir funcionário?", "dá para enviar pelo sistema?": pergunta sobre o que o sistema faz, não é ordem. */
const RE_PERGUNTA_CAPACIDADE = /^(oi |ola |agente |ei )*(voce |vc |a agente |o sistema )?(pode|podes|consegue|sabe|faz|da para|da pra|e possivel|tem como|existe)\b/;
const pareceCapacidade = (bruto: string, t: string): boolean => /\?\s*$/.test(String(bruto || '')) && RE_PERGUNTA_CAPACIDADE.test(t);

/**
 * Há ORDEM explícita para fazer (não só pergunta)? "pode excluir o fulano", "exclui a empresa X", "envia a admissão", "fecha a folha".
 * "Como excluo?", "onde envio?" e "você pode excluir?" NÃO são ordem.
 */
export function ehOrdemExplicita(texto: string): boolean {
  const t = semAcentoAgil(texto);
  if (!t || pareceCapacidade(texto, t)) return false;
  return RE_ORDEM.test(t);
}
/** Ordem explícita de EXCLUIR ("pode excluir", "exclui o João", "quero excluir a empresa X"). */
export function ehOrdemDeTirar(texto: string): boolean {
  const t = semAcentoAgil(texto);
  if (!t || pareceCapacidade(texto, t)) return false;
  if (ehPerguntaDeLocal(t) && !/\b(pode|por favor|quero que|preciso que)\s+(exclu|apag|remov|delet)/.test(t)) return false;
  return RE_ORDEM_TIRAR.test(t);
}
/** A pessoa só perguntou como/onde fazer (sem dar a ordem): a Agente LEVA até a tela e diz o clique, nunca prepara a ação. */
export function soPerguntouComoFazer(texto: string): boolean { return ehPerguntaDeLocal(texto) && !ehOrdemExplicita(texto); }

/**
 * Pode preparar o cartão de uma AÇÃO nesta conversa? Regra do dono (firme): só se a pessoa pediu.
 *  - pergunta de como/onde fazer: nunca;
 *  - exclusão: só com ordem explícita de excluir na mensagem, ou um "sim" logo depois de a Agente perguntar se pode excluir.
 * Mesmo liberada, a ação continua virando cartão de OK (o motor nunca executa sozinho).
 */
export function podePrepararAcao(mensagem: string, exclusao: boolean, ultimaFalaDaAgente = ''): { pode: boolean; motivo?: string } {
  if (soPerguntouComoFazer(mensagem)) return { pode: false, motivo: 'A pessoa só PERGUNTOU como/onde fazer: não prepare a ação. Leve até a tela (onde_fica com guiar=true ou mostrar_na_tela) e diga em uma frase qual botão ela clica.' };
  if (exclusao) {
    const sim = /^(sim|pode|pode sim|isso|confirmo|quero|ok|pode excluir|sim pode|sim exclui|exclui|pode apagar)( sim| agora| por favor| agente)*$/.test(semAcentoAgil(mensagem));
    const perguntouTirar = /\b(exclu|apag|remov)\w*\b.*\?\s*$/.test(semAcentoAgil(ultimaFalaDaAgente) + (ultimaFalaDaAgente.trim().endsWith('?') ? '?' : ''));
    if (!ehOrdemDeTirar(mensagem) && !(sim && perguntouTirar)) return { pode: false, motivo: 'Exclusão só com ordem explícita da pessoa ("pode excluir o fulano"). Ela não deu essa ordem: não prepare a exclusão; leve até a tela e diga onde ela clica, ou pergunte se ela quer mesmo excluir.' };
  }
  return { pode: true };
}

// ------------------------------------------------------------------------------------------------ perfil do pedido
export type PerfilPedido = 'simples' | 'acao' | 'calculo' | 'documento';
const RE_CALCULO = /\b(calcul\w*|simul\w*|quanto (da|fica|vai|sai|custa|deu|e)|proporciona\w*|aliquota|apura\w*|rescis\w*|media de|soma|diferenca de|juros|multa de|reajust\w*|retroativ\w*|fator r|rbt12)\b/;
const RE_ACAO = new RegExp(`\\b(${VERBO_TIRAR}|${VERBO_ENVIAR}|${VERBO_FECHAR}|${VERBO_GRAVAR}|admit\\w*|demit\\w*|deslig\\w*)\\b`);
/** Classifica o pedido para escolher o raciocínio do modelo. */
export function perfilDoPedido(mensagem: string, opcoes: { anexo?: boolean } = {}): PerfilPedido {
  const t = semAcentoAgil(mensagem);
  if (opcoes.anexo || /conteudo do arquivo xml anexado|<\?xml/.test(String(mensagem || '').slice(0, 20000).toLowerCase()) || mensagem.length > 4000) return 'documento';
  if (RE_CALCULO.test(t)) return 'calculo';
  if (!soPerguntouComoFazer(t) && RE_ACAO.test(t)) return 'acao';
  return 'simples';
}

export type NivelRaciocinio = 'MINIMAL' | 'LOW' | 'MEDIUM';
/**
 * Raciocínio e limites por perfil (documentação oficial do Gemini, 27/11/2026: Gemini 3.x usa `thinkingLevel`; não dá para
 * mandar `thinkingBudget` junto; 'minimal' existe no 3.1/3.5 Flash-Lite e no 3.6 Flash, mas NÃO no 3.8 Flash, que vai de 'low' para cima;
 * 'minimal' pode encerrar cedo tarefas de várias etapas com ferramentas, por isso ação usa 'low').
 */
export function configDoPerfil(modelo: string, perfil: PerfilPedido): { thinkingLevel: NivelRaciocinio; maxOutputTokens: number; tempoRapidoMs: number } {
  const aceitaMinimo = /flash-lite|3\.6-flash|^gemini-3-flash/.test(String(modelo || ''));
  if (perfil === 'documento') return { thinkingLevel: 'MEDIUM', maxOutputTokens: 8192, tempoRapidoMs: 30_000 };
  if (perfil === 'calculo') return { thinkingLevel: 'LOW', maxOutputTokens: 4096, tempoRapidoMs: 15_000 };
  if (perfil === 'acao') return { thinkingLevel: 'LOW', maxOutputTokens: 4096, tempoRapidoMs: 12_000 };
  return { thinkingLevel: aceitaMinimo ? 'MINIMAL' : 'LOW', maxOutputTokens: 2048, tempoRapidoMs: 9_000 };
}
/** Gemini 3.x: temperatura/top-p/top-k não são mais recomendados (a documentação manda tirar). Modelos antigos mantêm a temperatura. */
export const aceitaTemperatura = (modelo: string): boolean => !/^gemini-[3-9]/.test(String(modelo || ''));

// ------------------------------------------------------------------------------------------------ estilo e permissão (prompt)
export const ESTILO_AGIL = `

JEITO DE RESPONDER (regra do dono, vale mais que qualquer outra sobre tamanho)
- Comece pela resposta ou pela ação. Sem saudação, sem repetir a pergunta, sem "claro", sem "posso ajudar em mais alguma coisa".
- 1 a 3 frases curtas (a resposta é falada). Não liste opções que ninguém pediu. Detalhes só se a pessoa pedir ("explica melhor").
- Quando a pessoa pede para fazer, faça já na primeira resposta: chame a ferramenta (ou prepare o cartão de OK) sem explicar antes.
- Na tela pode ir uma lista curta quando a pessoa pediu dados (empresas, guias, vencimentos); a primeira frase é o resumo.

HONESTIDADE SOBRE O QUE O SISTEMA FAZ (regra do dono)
- "O sistema tem X?", "faz X?": responda só pelo que REALMENTE existe (onde_fica / mostrar_na_tela, apresentar_sistema e as ferramentas desta lista).
- Tem: "Tem sim: fica em ..." e ofereça levar. Parcial: diga o que já faz e o que ainda não faz. Não tem: "Ainda não tem." e registre o pedido de melhoria com chamar_supervisor (se existir); só diga que anotou depois de registrar.
- Nunca diga que tem uma função que você não achou no sistema, e nunca invente tela, botão ou função.`;

export const REGRA_PERMISSAO = `

PERMISSÃO (regra firme do dono, conferida também pelo sistema)
- Levar até a tela é livre: para "onde fica", "como faço", "me leva" use a ferramenta de levar/mostrar a tela.
- Excluir, enviar ou transmitir (eSocial, Receita), fechar folha ou gravar dados só acontece se a pessoa PEDIR com todas as letras ("pode excluir", "pode enviar") E der o OK no cartão.
- Pergunta "como excluo?", "onde envio?" é só pergunta: leve até a tela e diga em uma frase qual botão ela clica. Nunca prepare a exclusão nem abra o processo de exclusão por conta própria.`;

// ------------------------------------------------------------------------------------------------ escolha de ferramentas
export interface DeclaracaoAgil { name: string; description: string; parameters?: unknown }
export const NOME_MAIS_FERRAMENTAS = 'mais_ferramentas';
export const DECLARACAO_MAIS_FERRAMENTAS: DeclaracaoAgil = {
  name: NOME_MAIS_FERRAMENTAS,
  description: 'Use SÓ se nenhuma ferramenta desta lista serve para o pedido: devolve a lista completa de ferramentas do sistema para você escolher a certa.',
  parameters: { type: 'OBJECT', properties: {} },
};
/** Ferramentas que sempre vão (navegar, apresentação, piloto, supervisor, consultas básicas). Nomes que não existirem no sistema são ignorados. */
export const FERRAMENTAS_SEMPRE = [
  'onde_fica', 'mostrar_na_tela', 'preencher_na_tela', 'continuar_piloto', 'cancelar_piloto', 'piloto_segundo_plano',
  'apresentar_sistema', 'perguntar_integracoes', 'listar_empresas', 'chamar_supervisor', 'consultar_legislacao', 'perguntar_consultor',
  'status_robos', 'vencimentos_urgentes', 'central_anti_multa', 'ver_pedidos_entre_sistemas', 'meu_jeito', 'ver_meu_jeito',
  // "Murad, o que o 007 fez?": o resumo do Agente 007 (conferidor do backup) vai sempre (é leitura e curta).
  'agente_007_resumo',
];
const MAX_ESCOLHIDAS = 28;

interface IndiceFerramentas { nomes: string[]; raizesNome: Array<Set<string>>; raizesDescricao: Array<Set<string>>; df: Map<string, number> }
const CACHE_INDICE = new WeakMap<object, IndiceFerramentas>();
function indexar(declaracoes: DeclaracaoAgil[]): IndiceFerramentas {
  const guardado = CACHE_INDICE.get(declaracoes);
  if (guardado) return guardado;
  const raizesNome = declaracoes.map((d) => new Set(raizesAgil(d.name.replace(/_/g, ' '))));
  const raizesDescricao = declaracoes.map((d) => new Set(raizesAgil(`${d.description} ${JSON.stringify((d.parameters as any)?.properties || {})}`.slice(0, 4000))));
  const df = new Map<string, number>();
  raizesDescricao.forEach((s, i) => { for (const r of new Set([...s, ...raizesNome[i]])) df.set(r, (df.get(r) || 0) + 1); });
  const indice = { nomes: declaracoes.map((d) => d.name), raizesNome, raizesDescricao, df };
  CACHE_INDICE.set(declaracoes, indice);
  return indice;
}

export interface EscolhaFerramentas<D extends DeclaracaoAgil> { declaracoes: D[]; instrucao: string; completo: boolean; total: number; escolhidas: number }

/**
 * Escolhe as ferramentas que têm a ver com o pedido (palavras do pedido, das últimas falas e da tela atual), mais as que sempre vão,
 * e corta do prompt as linhas que só falam de ferramentas que ficaram de fora. Linhas de segurança ("nunca", "confirma"...) nunca saem.
 * Sem pista nenhuma no pedido, manda tudo (completo). Ferramenta fora da escolha continua funcionando se o modelo chamar
 * (o motor executa pelo nome), e `mais_ferramentas` devolve a lista completa.
 */
export function escolherFerramentas<D extends DeclaracaoAgil>(declaracoes: D[], instrucao: string, textoRelevante: string, sempre: string[] = FERRAMENTAS_SEMPRE): EscolhaFerramentas<D> {
  const total = declaracoes.length;
  const completo = (): EscolhaFerramentas<D> => ({ declaracoes, instrucao, completo: true, total, escolhidas: total });
  if (total <= MAX_ESCOLHIDAS + sempre.length) return completo();
  const pedido = [...new Set(raizesAgil(textoRelevante))];
  if (!pedido.length) return completo();
  const ix = indexar(declaracoes);
  const idf = (r: string) => Math.log((total + 1) / ((ix.df.get(r) || 0) + 0.5));
  const notas = declaracoes.map((_, i) => {
    let n = 0;
    for (const r of pedido) {
      if (ix.raizesNome[i].has(r)) n += 3 * idf(r);
      else if (ix.raizesDescricao[i].has(r)) n += idf(r);
    }
    return n;
  });
  const ordem = notas.map((n, i) => ({ n, i })).filter((x) => x.n > 0.9).sort((a, b) => b.n - a.n).slice(0, MAX_ESCOLHIDAS);
  if (!ordem.length) return completo();
  const escolhidasIdx = new Set(ordem.map((x) => x.i));
  declaracoes.forEach((d, i) => { if (sempre.includes(d.name)) escolhidasIdx.add(i); });
  const escolhidas = declaracoes.filter((_, i) => escolhidasIdx.has(i));
  const nomesEscolhidos = new Set(escolhidas.map((d) => d.name));
  return { declaracoes: escolhidas, instrucao: podarInstrucao(instrucao, ix.nomes, nomesEscolhidos), completo: false, total, escolhidas: escolhidas.length };
}

/**
 * Tira do prompt as linhas que citam SÓ ferramentas fora da escolha (a regra de uso de uma ferramenta só importa se ela pode ser chamada;
 * as proteções de verdade — cartão de OK, segunda confirmação, permissão — estão no código do motor, não no texto).
 * Linhas sem nome de ferramenta ficam sempre. Com `mais_ferramentas` o motor volta ao prompt completo.
 */
export function podarInstrucao(instrucao: string, todosOsNomes: string[], escolhidos: Set<string>): string {
  const nomes = todosOsNomes.filter((n) => n.length >= 6 && n.includes('_'));
  const re = nomes.length ? new RegExp(`\\b(${nomes.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|')})\\b`, 'g') : null;
  if (!re) return instrucao;
  const saida: string[] = [];
  for (const linha of instrucao.split('\n')) {
    const citados = linha.match(re);
    if (!citados || citados.some((n) => escolhidos.has(n))) saida.push(linha);
  }
  return saida.join('\n').replace(/\n{3,}/g, '\n\n');
}

// ------------------------------------------------------------------------------------------------ voz
const limparParaFala = (t: string): string => String(t || '')
  .replace(/https?:\/\/[^\s)]+/g, ' ')
  .replace(/^#{1,6}\s+/gm, '')
  .replace(/[*_`~>|]/g, ' ')
  .replace(/^\s*(?:[-•]|\d+[.)])\s+/gm, '')
  .replace(/\s+/g, ' ')
  .trim();

/** Frases do texto (corte em . ! ? seguido de espaço; não corta "R$ 1.234,56" nem "S-1200"). */
export function frasesDoTexto(texto: string): string[] {
  return limparParaFala(texto).split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ú0-9"“(])/).map((f) => f.trim()).filter(Boolean);
}
export const MAX_FALA_RESUMO = 250;
export const AVISO_RESTO_NA_TELA = 'O resto está na tela.';
/**
 * O que a voz fala da resposta da Agente: só as primeiras 1 a 2 frases (até ~250 caracteres). O texto inteiro continua na tela.
 * Quando sobra texto, termina com "O resto está na tela." (frase fixa, fica guardada no cache de áudio).
 */
export function resumoParaFala(texto: string, max = MAX_FALA_RESUMO): string {
  const frases = frasesDoTexto(texto);
  if (!frases.length) return '';
  let fala = '';
  let usadas = 0;
  for (const f of frases) {
    if (usadas >= 2) break;
    const junto = fala ? `${fala} ${f}` : f;
    if (junto.length > max) break;
    fala = junto; usadas += 1;
  }
  if (!fala) {
    // A primeira frase sozinha passa do limite: corta numa vírgula ou espaço, sem quebrar palavra.
    const f = frases[0];
    let corte = Math.max(f.lastIndexOf(', ', max - 1), f.lastIndexOf('; ', max - 1));
    if (corte < max * 0.5) corte = f.lastIndexOf(' ', max - 1);
    fala = `${f.slice(0, corte > 0 ? corte : max).replace(/[,;:]\s*$/, '').trim()}.`;
    usadas = 1;
  }
  const sobrou = usadas < frases.length || fala.length < limparParaFala(texto).length - 5;
  return sobrou ? `${fala} ${AVISO_RESTO_NA_TELA}` : fala;
}

/**
 * Pedaços para a voz humana: o primeiro é bem curto (uma frase, até ~90 caracteres) para o áudio começar logo; os outros até ~200.
 * Frase fixa ("O resto está na tela.") vai sozinha, para sair do cache.
 */
export function pedacosParaVoz(texto: string, primeiro = 90, demais = 200): string[] {
  const frases: string[] = [];
  for (const f of frasesDoTexto(texto)) {
    let resto = f;
    const limite = frases.length === 0 ? primeiro : demais;
    while (resto.length > limite) {
      let corte = Math.max(resto.lastIndexOf(', ', limite), resto.lastIndexOf('; ', limite));
      if (corte < limite * 0.4) corte = resto.lastIndexOf(' ', limite);
      if (corte <= 0) corte = limite;
      frases.push(resto.slice(0, corte + 1).trim());
      resto = resto.slice(corte + 1).trim();
    }
    if (resto) frases.push(resto);
  }
  const pedacos: string[] = [];
  let atual = '';
  for (const f of frases) {
    const fixa = FRASES_PRONTAS.includes(f);
    const limite = pedacos.length === 0 ? primeiro : demais;
    if (fixa) { if (atual) pedacos.push(atual); pedacos.push(f); atual = ''; continue; }
    if (atual && (`${atual} ${f}`).length > limite) { pedacos.push(atual); atual = f; }
    else atual = atual ? `${atual} ${f}` : f;
    if (pedacos.length === 0 && atual.length >= primeiro * 0.5) { pedacos.push(atual); atual = ''; }
  }
  if (atual) pedacos.push(atual);
  return pedacos.filter(Boolean);
}

/** Frases que se repetem muito: o áudio delas fica guardado (no servidor e no aparelho) e sai na hora. */
export const FRASES_PRONTAS = ['Pois não?', 'Feito.', 'Pronto.', 'Certo.', AVISO_RESTO_NA_TELA, OFERTA_LEVAR, 'Aqui, ó.', 'Pronto, cheguei.', 'Não entendi, pode repetir?'];

// ------------------------------------------------------------------------------------------------ medição
export interface MedicaoAgente {
  sistema: string; perfil: PerfilPedido; preparoMs: number; promptMs: number; modeloMs: number[]; ferramentasMs: number;
  rodadas: number; promptChars: number; tokensPrompt: number | null; resposta: number; escolhidas: number; total: number; atalho?: string; modelo?: string;
}
/** Linha do log: só tempos, contagens e tamanhos (nada do que a pessoa escreveu). */
export function linhaDeTempo(m: MedicaoAgente): string {
  const somaModelo = m.modeloMs.reduce((a, b) => a + b, 0);
  return `[Agente tempo] sistema=${m.sistema} perfil=${m.perfil}${m.atalho ? ` atalho=${m.atalho}` : ''} preparo=${m.preparoMs}ms prompt=${m.promptMs}ms modelo=${somaModelo}ms${m.modeloMs.length > 1 ? `(${m.modeloMs.join('+')})` : ''} ferramentas=${m.ferramentasMs}ms rodadas=${m.rodadas} promptChars=${m.promptChars} tokens~${m.tokensPrompt ?? Math.round(m.promptChars / 4)} resposta=${m.resposta} escolhidas=${m.escolhidas}/${m.total}${m.modelo ? ` modeloUsado=${m.modelo}` : ''}`;
}

// ------------------------------------------------------------------------------------------------ uso no motor da Agente
export interface TurnoAgil { papel: 'usuario' | 'ia'; texto: string }
/** Histórico que vai ao modelo: no máximo os últimos 6 turnos (antes eram 10). */
export const MAX_TURNOS_HISTORICO = 6;
/** Tira a dica interna do mapa ("[Dica interna ...]\n") e o XML anexado do começo/fim, para as regras olharem só o que a pessoa disse. */
export function pedidoDaPessoa(mensagem: string): string {
  return String(mensagem || '').replace(/^\[Dica interna[^\]]*\]\n/, '').replace(/\n\n\[CONTEÚDO DO ARQUIVO XML ANEXADO[\s\S]*$/, '').trim();
}

/**
 * Acompanha um pedido no motor: escolhe ferramentas/prompt, mede cada chamada ao modelo, libera a lista completa quando o modelo
 * pede `mais_ferramentas`, aplica a regra de permissão e escreve a linha de tempo no log.
 */
export class PedidoAgil<D extends DeclaracaoAgil> {
  readonly perfil: PerfilPedido;
  declaracoes: D[];
  instrucaoKit: string;
  completo: boolean;
  private readonly t0 = Date.now();
  private primeiraChamada = 0;
  private readonly modeloMs: number[] = [];
  private ferramentasMs = 0;
  private promptChars = 0;
  private tokensPrompt: number | null = null;
  private modeloUsado: string | undefined;
  private readonly total: number;
  private escolhidas: number;
  readonly pedido: string;
  private readonly ultimaFalaAgente: string;

  constructor(private readonly o: { sistema: string; declaracoes: D[]; instrucaoKit: string; mensagem: string; historico: TurnoAgil[]; anexo?: boolean; inicioMs?: number; sempre?: string[] }) {
    this.pedido = pedidoDaPessoa(o.mensagem);
    this.perfil = perfilDoPedido(o.mensagem, { anexo: o.anexo });
    const recentes = o.historico.slice(-2).map((t) => String(t.texto || '').slice(0, 300)).join(' ');
    // Pedido curto ("sim", "pode", "e a outra?") depende do que veio antes: as últimas falas entram na escolha.
    const relevante = `${this.pedido} ${this.pedido.split(' ').length <= 6 ? recentes : ''}`;
    const e = escolherFerramentas(o.declaracoes, o.instrucaoKit, relevante, o.sempre);
    this.declaracoes = e.completo ? e.declaracoes : [...e.declaracoes, DECLARACAO_MAIS_FERRAMENTAS as D];
    this.instrucaoKit = e.instrucao;
    this.completo = e.completo;
    this.total = e.total;
    this.escolhidas = e.escolhidas;
    this.ultimaFalaAgente = [...o.historico].reverse().find((t) => t.papel === 'ia')?.texto || '';
  }

  /** O modelo pediu a lista completa: volta às ferramentas e ao prompt inteiros. */
  liberarTudo(): void { this.declaracoes = this.o.declaracoes; this.instrucaoKit = this.o.instrucaoKit; this.completo = true; this.escolhidas = this.total; }

  /** Chama o modelo medindo o tempo e o tamanho do prompt. */
  async chamar<R extends { tokensPrompt?: number; modelo?: string }>(entrada: { instrucao: string; conteudos: unknown[]; declaracoes: unknown[] }, f: () => Promise<R>): Promise<R> {
    if (!this.primeiraChamada) this.primeiraChamada = Date.now();
    this.promptChars = entrada.instrucao.length + JSON.stringify(entrada.declaracoes).length + JSON.stringify(entrada.conteudos).replace(/"data":"[A-Za-z0-9+/=]{200,}"/g, '"data":""').length;
    const t = Date.now();
    try {
      const r = await f();
      if (typeof r?.tokensPrompt === 'number') this.tokensPrompt = r.tokensPrompt;
      if (r?.modelo) this.modeloUsado = r.modelo;
      return r;
    } finally { this.modeloMs.push(Date.now() - t); }
  }
  async ferramenta<R>(f: () => Promise<R>): Promise<R> { const t = Date.now(); try { return await f(); } finally { this.ferramentasMs += Date.now() - t; } }

  /** Regra de permissão (firme): pode preparar o cartão desta ação? */
  permissao(exclusao: boolean): { pode: boolean; motivo?: string } { return podePrepararAcao(this.pedido, exclusao, this.ultimaFalaAgente); }

  medicao(resposta: string, atalho?: string): MedicaoAgente {
    const inicio = this.o.inicioMs && this.o.inicioMs <= this.t0 ? this.o.inicioMs : this.t0;
    return {
      sistema: this.o.sistema, perfil: this.perfil, preparoMs: this.t0 - inicio, promptMs: this.primeiraChamada ? this.primeiraChamada - this.t0 : Date.now() - this.t0,
      modeloMs: this.modeloMs, ferramentasMs: this.ferramentasMs, rodadas: this.modeloMs.length, promptChars: this.promptChars, tokensPrompt: this.tokensPrompt,
      resposta: resposta.length, escolhidas: this.escolhidas, total: this.total, ...(atalho ? { atalho } : {}), ...(this.modeloUsado ? { modelo: this.modeloUsado } : {}),
    };
  }
  registrar(resposta: string, atalho?: string): void { try { console.log(linhaDeTempo(this.medicao(resposta, atalho))); } catch { /* o log nunca derruba a conversa */ } }
}

// ------------------------------------------------------------------------------------------------ palavra de chamada ("Murad, ...")
/** "Murad" e as variações que o reconhecimento de voz costuma escrever (Murade, Muradi, Mourad, Murat...). Texto sem acento. */
const RE_CHAMADA = /\b(m[ou]u?rr?a(d|de|di|dy|t|te|ti|ch|j)|mu rad|mo rad|mu rade)\b/;
export function chamouMurad(texto: string): boolean { return RE_CHAMADA.test(semAcentoAgil(texto)); }
/** Tira o "Murad" (e a vírgula) do começo: "Murad, me leva até a folha" → "me leva até a folha". */
export function semPalavraDeChamada(bruto: string): string {
  return String(bruto || '').replace(/^[\s,.!?]*(ei |oi |ô |o )?(m[oóu]u?rr?[aá](d|de|di|dy|t|te|ti|ch|j)|mu rad|mo rad|mu rade)[\s,.!?:;-]*/i, '').trim();
}
/**
 * Só a janela EM USO escuta e responde (nunca duas): a que tem foco e está visível. Sem nenhuma com foco (a pessoa está em outro
 * programa), responde só a janela da interação MAIS recente entre os sistemas — o que exige um lugar comum às janelas: o cookie
 * do domínio pai (ex.: .murad.com.br, quando os sistemas estão em subdomínios dele). Sem esse cookie (domínios diferentes, como
 * *.onrender.com), janela sem foco não responde: assim nunca respondem duas.
 */
export function janelaEmUso(e: { temFoco: boolean; visivel: boolean; souAMaisRecente: boolean | null }): boolean {
  if (!e.visivel) return false;
  if (e.temFoco) return true;
  return e.souAMaisRecente === true;
}
/** Domínios em que cada sistema é um "site" separado (lista pública de sufixos): o cookie do domínio pai não vale. */
const SUFIXOS_PUBLICOS = ['onrender.com', 'vercel.app', 'netlify.app', 'herokuapp.com', 'github.io', 'pages.dev', 'web.app', 'firebaseapp.com', 'localhost'];
/** Domínio pai comum aos sistemas (ex.: "dp.murad.com.br" → "murad.com.br"); null quando não há um que sirva. */
export function dominioPai(host: string): string | null {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '');
  if (!h || /^\d+\.\d+\.\d+\.\d+$/.test(h) || SUFIXOS_PUBLICOS.some((s) => h === s || h.endsWith(`.${s}`))) return null;
  const partes = h.split('.');
  const nivel = /\.(com|net|org|gov|edu|adv|eng|ind|art)\.br$/.test(h) ? 3 : 2;
  return partes.length > nivel ? partes.slice(-nivel).join('.') : null;
}
export const COOKIE_JANELA = 'murad_janela_ativa';
/** Valor do cookie: id da janela e a hora da interação. */
export const valorCookieJanela = (id: string, agoraMs: number): string => `${id}.${agoraMs}`;
/** Esta janela é a da interação mais recente? null = não há cookie comum (não dá para saber). */
export function souAJanelaMaisRecente(cookies: string, id: string): boolean | null {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE_JANELA}=([^;]+)`).exec(String(cookies || ''));
  if (!m) return null;
  return decodeURIComponent(m[1]).split('.')[0] === id;
}

/** Dica junto do microfone: onde há escuta contínua, "Diga 'Murad'"; no iPhone/Safari (sem escuta contínua), "toque no microfone". */
export function dicaDeChamada(temEscutaContinua: boolean): string {
  return temEscutaContinua ? `Diga "${NOME_DA_AGENTE}" para falar comigo` : 'Toque no microfone e fale';
}

// ------------------------------------------------------------------------------------------------ achar a tela pelo jeito de falar
/** Tira do pedido "me leva até a tela de", "onde fica o", "como faço o", "o sistema tem": sobra só o assunto. */
const PREFIXO_DE_LUGAR = /^(oi |ola |por favor |agente |ei |entao |ok |murad |murade )*(me (leva|leve|levar|levam|mostra|mostre)|leva( me)?|leve( me)?|abre|abra|abrir|abri|vai|va|ir|quero ir|queria ir|preciso ir|navega|navegue|entra|entrar|onde (e que )?(fica|ficam|esta|estao|vejo|acho|encontro|faco|eu faco|consigo|eu vejo|eu acho|tem)|aonde (fica|vejo|acho)|em qual (tela|menu|lugar|aba)( (fica|esta|vejo|faco|eu faco))?|qual (tela|menu|aba)|como (que )?(eu )?([a-z]{3,}o|faco|vejo|acho|abro|chego|entro|encontro|consigo)|(o sistema |voce |vc )?(tem|faz|da para|da pra|existe|tem como|ja tem))\b( (para|pra|pro|ate|na|no|nas|nos|em|a|o|as|os|um|uma|ver|abrir|fazer|achar|lancar|gerar|emitir|cadastrar)\b)*( (tela|aba|menu|parte|area|modulo)\b)?( (de|do|da|dos|das)\b)?\s*/;
const VAZIAS = new Set(['a', 'o', 'as', 'os', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas', 'para', 'pra', 'com', 'meu', 'minha', 'meus', 'minhas', 'tela', 'aba', 'menu', 'parte', 'area', 'sistema', 'aqui', 'ai', 'la']);
export function assuntoDoPedidoDeLugar(texto: string): string {
  return semAcentoAgil(texto).replace(PREFIXO_DE_LUGAR, '').split(' ').filter((w) => w && !VAZIAS.has(w)).join(' ');
}
const casa = (w: string, b: string) => w === b || (w.length >= 4 && b.length >= 4 && (b.startsWith(w) || w.startsWith(b)) && Math.abs(w.length - b.length) <= 3);
/**
 * Acha o item (tela, seção) cujo nome ou apelido tem TODAS as palavras do assunto (tolerando plural e conjugação curta).
 * Vence quem tiver mais palavras do assunto no próprio nome; empate entre telas diferentes = não sabe (devolve null, sem chutar).
 * Chave "tela#secao": na mesma tela, a seção vence a tela.
 */
export function acharPorApelidos<T>(assunto: string, itens: Array<{ item: T; nomes: string[]; chave: string }>): T | null {
  const palavras = assunto.split(' ').filter(Boolean);
  if (!palavras.length) return null;
  let melhor: { item: T; chave: string; nota: number } | null = null;
  let empate = false;
  for (const it of itens) {
    for (const nome of it.nomes) {
      const bolsa = semAcentoAgil(nome).split(' ').filter((w) => w && !VAZIAS.has(w));
      if (!palavras.every((w) => bolsa.some((b) => casa(w, b)))) continue;
      const nota = palavras.length * 10 - (bolsa.length - palavras.length);
      const grupo = (c: string) => c.split('#')[0];
      if (!melhor || nota > melhor.nota) { melhor = { item: it.item, chave: it.chave, nota }; empate = false; }
      else if (nota === melhor.nota && it.chave !== melhor.chave) {
        // Mesma tela ("livros" e "livros#livro-diario"): fica a seção, que é mais exata. Telas diferentes: não chuta.
        if (grupo(it.chave) === grupo(melhor.chave)) { if (it.chave.includes('#') && !melhor.chave.includes('#')) melhor = { item: it.item, chave: it.chave, nota }; }
        else empate = true;
      }
    }
  }
  return melhor && !empate ? melhor.item : null;
}

// ------------------------------------------------------------------------------------------------ o que ainda não tem (honestidade)
/** Função que o sistema ainda NÃO tem ou tem só em parte (levantamento conferido no código). Está na lista de melhorias. */
export interface FuncaoQueFalta { id: string; tipo: 'nao_tem' | 'parcial'; nomes: string[]; /** Frase curta: o que é (e, no parcial, o que já faz e o que falta). */ texto: string }
export const LISTA_DE_MELHORIAS = 'Já está na lista de melhorias.';
/** "Tem autônomo/RPA?": se a função está no catálogo do que falta, responde a verdade (não tem / tem em parte). */
export function respostaDoQueFalta(mensagem: string, catalogo: FuncaoQueFalta[]): string | null {
  // Aqui o nome da função é que tem de estar INTEIRO na pergunta ("férias em dobro" só quando a pessoa disse "em dobro"; "férias" sozinho não).
  const palavras = assuntoDoPedidoDeLugar(mensagem).split(' ').filter(Boolean);
  let f: FuncaoQueFalta | null = null; let maior = 0;
  for (const x of catalogo) for (const nome of x.nomes) {
    const n = semAcentoAgil(nome).split(' ').filter((w) => w && !VAZIAS.has(w));
    if (n.length && n.every((w) => palavras.some((p) => casa(p, w))) && n.length > maior) { f = x; maior = n.length; }
  }
  if (!f) return null;
  return f.tipo === 'nao_tem' ? `Ainda não tem ${f.texto} ${LISTA_DE_MELHORIAS}` : `Tem em parte: ${f.texto} ${LISTA_DE_MELHORIAS}`;
}

// ------------------------------------------------------------------------------------------------ dica de ajuda por inatividade
/** "Precisa de ajuda?": na primeira semana de uso, parado 20 s numa tela, no máximo 1 vez por tela por dia; dá para desligar. */
export const FRASE_AJUDA = `Precisa de ajuda? É só dizer "${NOME_DA_AGENTE}".`;
export const AJUDA_PARADO_MS = 20_000;
export const AJUDA_DIAS_DE_USO = 7;
export interface EstadoAjuda { primeiroUsoMs: number; ofertas: Record<string, string>; desligada: boolean }
export function deveOferecerAjuda(e: EstadoAjuda, tela: string, agoraMs: number, ultimaInteracaoMs: number, hoje: string): boolean {
  if (e.desligada || !tela) return false;
  if (agoraMs - e.primeiroUsoMs > AJUDA_DIAS_DE_USO * 24 * 60 * 60_000) return false;
  if (agoraMs - ultimaInteracaoMs < AJUDA_PARADO_MS) return false;
  return e.ofertas[tela] !== hoje;
}

// ------------------------------------------------------------------------------------------------ piloto: retomar sozinho e reconferir
/** Pausou porque a pessoa mexeu: volta sozinho quando ela fica parada este tempo (se ela não estava digitando num campo). */
export const PILOTO_RETOMAR_SOZINHO_MS = 5000;
/** Regra comum (Fiscal e Contábil; o DP tem a mesma em src/utils/pilotoVisivel.ts): pausa por interferência + 5 s parada + sem digitação num campo + sem cartão de OK aberto. */
export function pilotoPodeRetomar(e: { pausadoPorInterferencia: boolean; msDesdeUltimaInteracao: number; digitouEmCampo: boolean; aguardandoOk: boolean }): boolean {
  return e.pausadoPorInterferencia && !e.aguardandoOk && !e.digitouEmCampo && e.msDesdeUltimaInteracao >= PILOTO_RETOMAR_SOZINHO_MS;
}
/** Ritmo inicial: quem pediu ao aparelho para reduzir animações recebe o rápido; senão vale a escolha salva da pessoa. */
export const ritmoInicialDoPiloto = <R extends string>(reduzirAnimacao: boolean, salvo: R, rapido: R): R => (reduzirAnimacao ? rapido : salvo);
/** Título dos planos de correção do "faz certo": a tela reconhece e, quando o piloto termina, pede a conferência de novo. */
export const TITULO_CORRECAO = 'Corrigir o cadastro da';
export const ehPlanoDeCorrecao = (titulo: unknown): boolean => String(titulo || '').startsWith(TITULO_CORRECAO);
/** Depois de corrigir, a Murad confere de novo: "Pronto, agora está certo." ou o que ainda falta. */
export const fraseDaReconferencia = (pendentes: string[]): string => (pendentes.length ? `Ainda falta: ${pendentes[0]}.${pendentes.length > 1 ? ` E mais ${pendentes.length - 1}.` : ''}` : 'Pronto, agora está certo.');
