// PILOTO VISÍVEL (mesmo contrato nos sistemas Murade).
//
// Quando o contador pede à Agente IA algo que envolve uma tela, a tela muda sozinha: navega, escolhe empresa e período,
// rola, destaca (anel + seta) e, se o pedido for de preencher, digita campo por campo em ritmo legível, com uma legenda curta
// de cada passo. Se o contador interferir (clicar, digitar, trocar de tela), o piloto PAUSA e devolve o controle.
//
// Regras de segurança (valem no código, não só no texto):
//  - só MOSTRA e PREENCHE; nunca clica em salvar/lançar/encerrar/enviar/transmitir/pagar/excluir/estornar: para no botão;
//  - nunca preenche senha, token, certificado nem dados bancários;
//  - nunca calcula nem altera valor: digita exatamente o texto recebido;
//  - não lê nem registra o que o contador digita durante a interferência (os ouvintes só sabem QUE houve toque/tecla);
//  - em segundo plano nunca navega nem mexe na tela: só executa o que tem caminho de API; o resto pausa e avisa.
//
// Este arquivo é puro (sem React). O DOM só é tocado dentro de criarAmbienteDom().

export type TipoPasso = 'navegar' | 'selecionar' | 'rolar' | 'destacar' | 'preencher' | 'parar_no_botao';
export interface PassoPiloto {
  tipo: TipoPasso;
  /** '#id' | '[data-campo=x]' | 'texto:...' */
  alvo: string;
  valor?: string;
  legenda: string;
  /** 'api' = existe caminho de servidor para executar este passo sem a tela (segundo plano). Padrão: 'tela'. */
  via?: 'tela' | 'api';
  api?: { ferramenta: string; args?: Record<string, string | number | boolean> };
}
export interface PlanoPiloto {
  titulo: string; passos: PassoPiloto[];
  /** Serviço completo da Agente: o trabalho de verdade roda no SERVIDOR. Se o contador mexer ou sair da tela, a animação só
   * se recolhe (não pausa nem pede "continua") e a Agente avisa que segue em segundo plano. */
  segundoPlanoAoInterferir?: boolean;
}
export type ComandoPiloto = 'continuar' | 'segundo_plano' | 'cancelar';
/** O que a resposta da Agente pode trazer no campo `piloto`. */
export type RespostaPiloto = PlanoPiloto | { comando: ComandoPiloto };

export type EstadoPiloto = 'rodando' | 'pausado' | 'segundo_plano' | 'aguardando_confirmacao' | 'concluido' | 'cancelado' | 'erro';
export type Ritmo = 'devagar' | 'normal' | 'rapido';

export const MS_POR_CARACTERE: Record<Ritmo, number> = { devagar: 90, normal: 50, rapido: 18 };
export const MS_ENTRE_CAMPOS: Record<Ritmo, number> = { devagar: 1100, normal: 650, rapido: 200 };
export const MS_APOS_DESTAQUE: Record<Ritmo, number> = { devagar: 1800, normal: 1100, rapido: 350 };

export const MSG_INTERFERENCIA = 'Você interferiu, vou pausar. Quando quiser que eu continue, é só me avisar.';
export const MSG_CONTINUANDO = 'Certo, continuando de onde parei.';
export const MSG_SEGUNDO_PLANO = 'Pode deixar, termino em segundo plano. Fique à vontade para usar outra tela.';
export const MSG_SO_TELA = 'Esta etapa só dá para fazer na tela; me chame quando quiser que eu continue aqui.';
export const MSG_CANCELADO = 'Cancelado. O que já foi preenchido continua na tela.';
export const MSG_CONFIRMADO = 'Confirmado.';
export const MSG_SERVICO_SEGUE = 'Pode usar o sistema à vontade: sigo trabalhando em segundo plano e te aviso quando o pedido estiver pronto para conferir.';

const MAX_PASSOS = 40;
const TELAS_SEGURAS = /^[a-z][a-z0-9-]{1,40}$/;

// ---------------------------------------------------------------------------------------------
// Alvos e conteúdo sensível
// ---------------------------------------------------------------------------------------------
export type AlvoAnalisado =
  | { tipo: 'menu'; tela: string }
  | { tipo: 'id'; id: string }
  | { tipo: 'campo'; campo: string }
  | { tipo: 'texto'; texto: string };

export function analisarAlvo(alvo: unknown): AlvoAnalisado | null {
  if (typeof alvo !== 'string') return null;
  const a = alvo.trim();
  let m = /^#(btn-menu-)([a-z][a-z0-9-]{1,40})$/.exec(a);
  if (m) return { tipo: 'menu', tela: m[2] };
  m = /^#([A-Za-z][\w-]{0,60})$/.exec(a);
  if (m) return { tipo: 'id', id: m[1] };
  m = /^\[data-campo=(["']?)([a-z0-9][a-z0-9-]{0,60})\1\]$/.exec(a);
  if (m) return { tipo: 'campo', campo: m[2] };
  m = /^texto:(.{2,80})$/.exec(a);
  if (m && !/[<>{}\u0000-\u001f]/.test(m[1])) return { tipo: 'texto', texto: m[1].trim() };
  return null;
}

const SENSIVEL = /(senha|password|passwd|\btoken\b|certificad|\.pfx|\.p12|\bcvv\b|cart[aã]o|\bpix\b|ag[eê]ncia|conta-?banc[aá]ria|dados-?banc|segredo|secret|\botp\b|\b2fa\b|c[oó]digo-?de-?seguran|credencial)/i;
export const textoSensivel = (t: string): boolean => SENSIVEL.test(String(t || ''));

const DESTRUTIVO = /\b(salvar|gravar|lan[cç]ar|encerrar|fechar|enviar|transmitir|pagar|excluir|apagar|remover|estornar|aprovar|rejeitar|confirmar|finalizar|assinar)\b/i;
export const textoDeAcaoFinal = (t: string): boolean => DESTRUTIVO.test(String(t || ''));

export function validarPlanoPiloto(entrada: unknown): { ok: true; plano: PlanoPiloto } | { ok: false; motivo: string } {
  const e = entrada as any;
  if (!e || typeof e !== 'object') return { ok: false, motivo: 'Plano ausente.' };
  const titulo = typeof e.titulo === 'string' ? e.titulo.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  if (!titulo) return { ok: false, motivo: 'Plano sem título.' };
  if (!Array.isArray(e.passos) || e.passos.length < 1 || e.passos.length > MAX_PASSOS) return { ok: false, motivo: `O plano precisa de 1 a ${MAX_PASSOS} passos.` };
  const passos: PassoPiloto[] = [];
  for (let i = 0; i < e.passos.length; i += 1) {
    const p = e.passos[i];
    if (!p || typeof p !== 'object') return { ok: false, motivo: `Passo ${i + 1} inválido.` };
    const tipos: TipoPasso[] = ['navegar', 'selecionar', 'rolar', 'destacar', 'preencher', 'parar_no_botao'];
    if (!tipos.includes(p.tipo)) return { ok: false, motivo: `Passo ${i + 1}: tipo desconhecido.` };
    const alvo = analisarAlvo(p.alvo);
    if (!alvo) return { ok: false, motivo: `Passo ${i + 1}: alvo inválido.` };
    if (textoSensivel(String(p.alvo))) return { ok: false, motivo: `Passo ${i + 1}: o piloto não mexe em campo de senha, token, certificado ou dados bancários.` };
    if (p.tipo === 'navegar' && alvo.tipo === 'texto') return { ok: false, motivo: `Passo ${i + 1}: navegar não aceita alvo por texto.` };
    const legenda = typeof p.legenda === 'string' ? p.legenda.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) : '';
    if (!legenda) return { ok: false, motivo: `Passo ${i + 1}: falta a legenda.` };
    const passo: PassoPiloto = { tipo: p.tipo, alvo: String(p.alvo).trim(), legenda };
    if (p.tipo === 'preencher' || p.tipo === 'selecionar') {
      if (typeof p.valor !== 'string' || p.valor.length > 300 || /[\u0000-\u0008\u000b-\u001f]/.test(p.valor)) return { ok: false, motivo: `Passo ${i + 1}: valor ausente ou inválido.` };
      passo.valor = p.valor;
    }
    if (p.via === 'api') {
      const a = p.api;
      if (!a || typeof a.ferramenta !== 'string' || !/^[a-z_]{3,60}$/.test(a.ferramenta)) return { ok: false, motivo: `Passo ${i + 1}: caminho de API inválido.` };
      const args: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(a.args && typeof a.args === 'object' ? a.args : {})) {
        if (!/^[a-zA-Z_]{1,40}$/.test(k) || !['string', 'number', 'boolean'].includes(typeof v) || String(v).length > 300) return { ok: false, motivo: `Passo ${i + 1}: argumento de API inválido.` };
        args[k] = v as string | number | boolean;
      }
      passo.via = 'api'; passo.api = { ferramenta: a.ferramenta, args };
    }
    passos.push(passo);
    if (p.tipo === 'parar_no_botao' && i !== e.passos.length - 1) return { ok: false, motivo: 'Depois de parar no botão não pode haver mais passos.' };
  }
  for (const p of passos) if (p.tipo === 'navegar') { const a = analisarAlvo(p.alvo); if (a?.tipo === 'menu' && !TELAS_SEGURAS.test(a.tela)) return { ok: false, motivo: 'Tela inválida.' }; }
  return { ok: true, plano: { titulo, passos, ...(e.segundoPlanoAoInterferir === true ? { segundoPlanoAoInterferir: true } : {}) } };
}

// ---------------------------------------------------------------------------------------------
// Máquina de estados (pura)
// ---------------------------------------------------------------------------------------------
export type EventoPiloto = 'interferencia' | 'rota_fora_do_plano' | 'continuar' | 'segundo_plano' | 'cancelar' | 'parou_no_botao' | 'terminou' | 'falhou' | 'confirmado' | 'precisa_tela';
export const ESTADOS_FINAIS: EstadoPiloto[] = ['concluido', 'cancelado', 'erro'];

export function transicaoPiloto(estado: EstadoPiloto, evento: EventoPiloto): EstadoPiloto {
  if (ESTADOS_FINAIS.includes(estado)) return estado;
  switch (estado) {
    case 'rodando':
      switch (evento) {
        case 'interferencia': case 'rota_fora_do_plano': return 'pausado';
        case 'segundo_plano': return 'segundo_plano';
        case 'cancelar': return 'cancelado';
        case 'parou_no_botao': return 'aguardando_confirmacao';
        case 'terminou': return 'concluido';
        case 'falhou': return 'erro';
        case 'precisa_tela': return 'rodando';
        default: return estado;
      }
    case 'pausado':
      switch (evento) {
        case 'continuar': return 'rodando';
        case 'segundo_plano': return 'segundo_plano';
        case 'cancelar': return 'cancelado';
        default: return estado; // interferir de novo, ou qualquer outro evento: continua pausado
      }
    case 'segundo_plano':
      switch (evento) {
        case 'continuar': return 'rodando';
        case 'cancelar': return 'cancelado';
        case 'precisa_tela': return 'pausado';
        case 'parou_no_botao': return 'aguardando_confirmacao';
        case 'terminou': return 'concluido';
        case 'falhou': return 'erro';
        default: return estado; // interferência não tira do segundo plano: o contador deve usar outra tela
      }
    case 'aguardando_confirmacao':
      switch (evento) {
        case 'confirmado': return 'concluido';
        case 'cancelar': return 'cancelado';
        case 'continuar': return 'rodando';
        default: return estado;
      }
    default: return estado;
  }
}

// ---------------------------------------------------------------------------------------------
// Frases do contador (voz e chat)
// ---------------------------------------------------------------------------------------------
export type IntencaoPiloto = 'continuar' | 'segundo_plano' | 'cancelar' | 'confirmar';
const normalizar = (t: string) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function intencaoDoTexto(texto: string): IntencaoPiloto | null {
  let t = normalizar(texto);
  if (!t || t.length > 90) return null;
  t = t.replace(/^(ei |ola |oi )?(contabil |murade |agente |assistente )+/, '').replace(/^(sim |ok |isso |entao |certo |tudo bem |beleza )+/, '').replace(/( por favor| obrigado| obrigada)$/, '').trim();
  if (/\b(segundo plano|por tras|nos bastidores|background|2o plano)\b/.test(t) && !/\bnao\b/.test(t)) return 'segundo_plano';
  if (/^(faz|faca|termina|termine|finaliza|finalize)\b.*\benquanto eu (uso|uso a|mexo|estou|fico)\b/.test(t)) return 'segundo_plano';
  if (/^(pode )?(confirmar|confirma|confirmo|gravar|grava)( (a )?(gravacao|tudo|isso))?$/.test(t)) return 'confirmar';
  if (/^(pode )?(cancela|cancelar|cancele|para|pare|parar|chega|desiste|desistir|deixa pra la)( (o )?(piloto|tudo|isso|ai|agora))*$/.test(t)) return 'cancelar';
  if (/^(pode |vamos |vai )?(continua|continuar|continue|segue|seguir|siga|prossiga|prossegue|retoma|retomar|vai|em frente)( (de onde parou|em frente|agora|ai|ate o fim|a| o piloto))*$/.test(t)) return 'continuar';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Ambiente (a ponte com a tela) e executor
// ---------------------------------------------------------------------------------------------
export type ModoCampo = 'digitar' | 'numero' | 'instantaneo';
export interface AmbientePiloto {
  /** Procura sem esperar; nunca lança. */
  resolver(alvo: string): unknown | null;
  /** Espera o elemento aparecer (a tela acabou de abrir). */
  aguardar(alvo: string, ms: number): Promise<unknown | null>;
  ehSensivel(el: unknown): boolean;
  ehDesabilitado(el: unknown): boolean;
  modoDoCampo(el: unknown): ModoCampo;
  temOpcao(el: unknown, valor: string): boolean;
  ehCampoEditavel(el: unknown): boolean;
  /** Clique permitido para ABRIR algo (menu ou botão marcado data-piloto-abrir) e nunca em botão final. */
  podeClicarParaAbrir(el: unknown): boolean;
  /** 'salvar' aceita confirmação por voz; 'irreversivel' só por clique do contador. */
  tipoDeBotaoFinal(el: unknown): 'salvar' | 'irreversivel' | null;
  rolarAte(el: unknown): void;
  destacar(el: unknown, legenda: string, botaoFinal: boolean): void;
  limparDestaque(): void;
  definirValor(el: unknown, texto: string): void;
  focar(el: unknown): void;
  clicar(el: unknown): void;
  /** Observa o clique REAL do contador (isTrusted) no botão final. Devolve função para desligar. */
  aoClicarUmaVez(el: unknown, cb: () => void): () => void;
  /** Troca de tela feita pelo piloto. Devolve false se a tela não existe. */
  navegarPara(tela: string): boolean;
  selecionarEmpresa(cnpj: string): boolean;
  telaAtual(): string;
  empresaAtual(): string;
  empresaPronta(): boolean;
  /** Caminho de API do servidor para o segundo plano. */
  executarApi(passo: PassoPiloto): Promise<{ ok: boolean; motivo?: string }>;
  esperar(ms: number): Promise<void>;
}

export interface InstantaneoPiloto {
  estado: EstadoPiloto;
  titulo: string;
  passo: number; // 1-based
  total: number;
  legenda: string;
  ritmo: Ritmo;
  recusados: number;
  interferencias: number;
  /** No estado aguardando_confirmacao: o botão ainda não está destacado na tela (parou em segundo plano). */
  botaoForaDaTela: boolean;
}
export interface ResultadoPiloto { estado: EstadoPiloto; titulo: string; passosFeitos: number; total: number; interferencias: number; recusados: number; usouSegundoPlano: boolean; ultimoErro: string | null }

interface OpcoesExecutor {
  ritmo?: Ritmo;
  aoMudar?: (i: InstantaneoPiloto) => void;
  /** Mensagem que a Agente deve FALAR (se a voz estiver ligada) e escrever. */
  aoFalar?: (texto: string) => void;
  aoFim?: (r: ResultadoPiloto) => void;
}

type Retorno = 'ok' | 'repetir' | 'parou' | 'falha';
const INTERROMPIDO = Symbol('interrompido');

export class PilotoExecutor {
  private estado: EstadoPiloto = 'rodando';
  private cursor = 0;
  private feitos = 0;
  private interferencias = 0;
  private recusados = 0;
  private usouBg = false;
  private ritmo: Ritmo;
  private legenda = '';
  private erro: string | null = null;
  private telaDoPlano = '';
  private empresaDoPlano = '';
  private telaEsperada: string | null = null;
  private reposicionar = false;
  /** Verdadeiro só durante o reposicionamento (refaz o que já foi feito sem animar). */
  private semAnimacao = false;
  private botaoForaDaTela = false;
  private acordar: (() => void) | null = null;
  private emLoop = false;
  private fimAvisado = false;
  private desligarBotao: (() => void) | null = null;
  private resolverFim: ((r: ResultadoPiloto) => void) | null = null;
  readonly terminou: Promise<ResultadoPiloto>;

  constructor(readonly plano: PlanoPiloto, private amb: AmbientePiloto, private opc: OpcoesExecutor = {}) {
    this.ritmo = opc.ritmo || 'normal';
    this.terminou = new Promise((res) => { this.resolverFim = res; });
  }

  // ---- consulta
  getEstado(): EstadoPiloto { return this.estado; }
  instantaneo(): InstantaneoPiloto {
    return { estado: this.estado, titulo: this.plano.titulo, passo: Math.min(this.cursor + 1, this.plano.passos.length), total: this.plano.passos.length, legenda: this.legenda, ritmo: this.ritmo, recusados: this.recusados, interferencias: this.interferencias, botaoForaDaTela: this.botaoForaDaTela };
  }
  resultado(): ResultadoPiloto { return { estado: this.estado, titulo: this.plano.titulo, passosFeitos: this.feitos, total: this.plano.passos.length, interferencias: this.interferencias, recusados: this.recusados, usouSegundoPlano: this.usouBg, ultimoErro: this.erro }; }
  private final(): boolean { return ESTADOS_FINAIS.includes(this.estado); }

  // ---- controle
  iniciar(): Promise<ResultadoPiloto> { this.avisar(); this.ligarLoop(); return this.terminou; }
  definirRitmo(r: Ritmo): void { this.ritmo = r; this.avisar(); }

  /** O contador clicou, digitou ou trocou de tela fora do plano. Nunca recebe o conteúdo da interação. */
  interferir(_origem: 'toque' | 'teclado' | 'rota'): void {
    if (this.estado !== 'rodando') return;
    this.interferencias += 1;
    if (this.plano.segundoPlanoAoInterferir) {
      // O servidor continua o serviço: a animação se recolhe sem pausar e a Agente avisa no fim.
      this.usouBg = true; this.limparBotao(); this.amb.limparDestaque();
      this.mudar('cancelar'); this.falar(MSG_SERVICO_SEGUE); this.concluir();
      return;
    }
    this.mudar('interferencia');
    this.amb.limparDestaque();
    this.falar(MSG_INTERFERENCIA);
  }
  /** A tela mudou. Se não foi o próprio piloto que mudou, é interferência. */
  telaMudou(tela: string): void {
    if (this.telaEsperada !== null && tela === this.telaEsperada) { this.telaEsperada = null; return; }
    if (this.estado === 'rodando') this.interferir('rota');
  }
  retomar(): void {
    if (this.estado !== 'pausado' && this.estado !== 'segundo_plano' && this.estado !== 'aguardando_confirmacao') return;
    if (this.estado === 'aguardando_confirmacao' && !this.botaoForaDaTela) return; // já está destacado na tela
    this.reposicionar = this.amb.telaAtual() !== this.telaDoPlano || this.amb.empresaAtual() !== this.empresaDoPlano || this.estado !== 'pausado';
    this.botaoForaDaTela = false;
    this.mudar('continuar'); this.falar(MSG_CONTINUANDO);
    this.ligarLoop();
  }
  segundoPlano(): void {
    if (this.estado !== 'rodando' && this.estado !== 'pausado') return;
    this.usouBg = true; this.amb.limparDestaque();
    this.mudar('segundo_plano'); this.falar(MSG_SEGUNDO_PLANO);
    this.ligarLoop();
  }
  cancelar(): void {
    if (this.final()) return;
    this.mudar('cancelar'); this.limparBotao(); this.amb.limparDestaque(); this.falar(MSG_CANCELADO); this.concluir();
  }
  /** Botão "Pausar" do próprio piloto: pausa sem dizer que o contador interferiu. */
  pausarPeloBotao(): void { if (this.estado !== 'rodando') return; this.mudar('interferencia'); this.amb.limparDestaque(); this.legenda = 'Pausado. Toque em "Continuar de onde parou" quando quiser.'; this.avisar(); }
  /** Clique REAL do contador no botão final. */
  confirmadoPeloContador(): void { if (this.estado === 'aguardando_confirmacao') { this.mudar('confirmado'); this.limparBotao(); this.amb.limparDestaque(); this.concluir(); } }
  /** "Pode confirmar" por voz. Só vale para botão de salvar; ação irreversível exige o clique do contador. */
  confirmarPorVoz(): 'confirmado' | 'levado_ao_botao' | 'so_clique' | 'nada' {
    if (this.estado !== 'aguardando_confirmacao') return 'nada';
    if (this.botaoForaDaTela) { this.retomar(); return 'levado_ao_botao'; }
    const passo = this.plano.passos[this.cursor];
    if (!passo || passo.tipo !== 'parar_no_botao') return 'nada';
    const el = this.amb.resolver(passo.alvo);
    if (!el || this.amb.tipoDeBotaoFinal(el) !== 'salvar') return 'so_clique';
    this.amb.clicar(el); // o contador autorizou em voz alta; o clique real dispara aoClicarUmaVez, mas garantimos o estado
    this.confirmadoPeloContador();
    return 'confirmado';
  }

  // ---- internos
  private mudar(ev: EventoPiloto): void {
    const novo = transicaoPiloto(this.estado, ev);
    const mudou = novo !== this.estado;
    this.estado = novo;
    if (mudou || ev === 'interferencia') this.avisar();
    this.acordar?.(); this.acordar = null;
  }
  private avisar(): void { try { this.opc.aoMudar?.(this.instantaneo()); } catch { /* a tela não pode derrubar o piloto */ } }
  private falar(t: string): void { this.legenda = t; this.avisar(); try { this.opc.aoFalar?.(t); } catch { /* idem */ } }
  private concluir(): void {
    if (this.fimAvisado) return; this.fimAvisado = true;
    const r = this.resultado();
    try { this.opc.aoFim?.(r); } catch { /* idem */ }
    this.resolverFim?.(r);
  }
  private limparBotao(): void { this.desligarBotao?.(); this.desligarBotao = null; }
  private ligarLoop(): void {
    if (this.emLoop) return;
    this.emLoop = true;
    void this.loop().catch((e) => { this.erro = String((e as Error)?.message || e).slice(0, 200); this.legenda = 'Não consegui continuar. Faça esta parte manualmente.'; this.mudar('falhou'); this.concluir(); }).finally(() => { this.emLoop = false; if (!this.final() && (this.estado === 'rodando' || this.estado === 'segundo_plano')) this.ligarLoop(); });
  }
  private async dormir(ms: number): Promise<void> { if (ms > 0 && !this.semAnimacao) await this.amb.esperar(ms); }

  private async loop(): Promise<void> {
    const passos = this.plano.passos;
    for (;;) {
      if (this.final()) return;
      if (this.estado === 'pausado') { await new Promise<void>((res) => { this.acordar = res; }); continue; }
      if (this.estado === 'aguardando_confirmacao') return;
      if (this.reposicionar && this.estado === 'rodando') { this.reposicionar = false; if (!(await this.repor())) return; continue; }
      if (this.cursor >= passos.length) { this.mudar('terminou'); this.concluirComResumo(); return; }
      const passo = passos[this.cursor];
      const r = this.estado === 'segundo_plano' ? await this.passoEmSegundoPlano(passo) : await this.passoNaTela(passo, !this.semAnimacao);
      if (this.final()) return;
      if (r === 'repetir') continue;
      if (r === 'falha') { this.mudar('falhou'); this.amb.limparDestaque(); this.concluir(); return; }
      if (r === 'parou') { return; }
      this.cursor += 1; this.feitos += 1; this.avisar();
    }
  }
  private concluirComResumo(): void {
    if (this.usouBg) this.falar(`Pronto, terminei: ${this.plano.titulo}. ${this.feitos} de ${this.plano.passos.length} passos feitos.`);
    this.concluir();
  }

  /** Refaz sem animar o que já foi feito, quando o contador trocou de tela ou de empresa durante a pausa. */
  private async repor(): Promise<boolean> {
    const antes = this.cursor;
    const rapido = this.semAnimacao; this.semAnimacao = true;
    try {
      for (let i = 0; i < antes; i += 1) {
        const p = this.plano.passos[i];
        if (p.tipo === 'rolar' || p.tipo === 'destacar') continue;
        const r = await this.passoNaTela(p, false);
        if (r === 'falha') { this.mudar('falhou'); this.concluir(); return false; }
        if (this.estado !== 'rodando') return false;
      }
    } finally { this.semAnimacao = rapido; }
    return true;
  }

  private async passoEmSegundoPlano(p: PassoPiloto): Promise<Retorno> {
    // Segundo plano nunca toca a tela: nada de resolver, navegar, rolar, destacar, digitar ou clicar.
    if (p.tipo === 'rolar' || p.tipo === 'destacar') return 'ok';
    if (p.tipo === 'parar_no_botao') {
      this.botaoForaDaTela = true;
      this.mudar('parou_no_botao');
      this.falar(`Pronto, terminei o que dava. Falta só você confirmar: ${p.legenda}`);
      return 'parou';
    }
    if (p.via === 'api' && p.api) {
      let r: { ok: boolean; motivo?: string };
      try { r = await this.amb.executarApi(p); } catch (e) { r = { ok: false, motivo: String((e as Error)?.message || e) }; }
      if (r.ok) return 'ok';
      this.erro = r.motivo || 'A etapa não pôde ser feita pelo servidor.';
    }
    this.mudar('precisa_tela');
    this.falar(MSG_SO_TELA);
    return 'repetir';
  }

  /** Espera o elemento. Devolve INTERROMPIDO se o contador pausou/cancelou enquanto esperava (nada pode ser feito na tela depois disso). */
  private async achar(alvo: string, ms = 3500): Promise<unknown | null | typeof INTERROMPIDO> {
    const el = await this.amb.aguardar(alvo, this.semAnimacao ? Math.min(ms, 2000) : ms);
    return !this.livre() && !this.semAnimacao ? INTERROMPIDO : el;
  }
  private falhar(texto: string): Retorno { this.erro = texto; this.legenda = texto; this.avisar(); return 'falha'; }
  private livre(): boolean { return this.estado === 'rodando'; }

  private async passoNaTela(p: PassoPiloto, animar: boolean): Promise<Retorno> {
    this.legenda = p.legenda; this.avisar();
    const a = analisarAlvo(p.alvo);
    if (!a) return this.falhar('Não entendi onde fica essa parte da tela.');
    const ritmo = this.ritmo;

    if (p.tipo === 'navegar') {
      if (a.tipo === 'menu') {
        this.telaEsperada = a.tela;
        if (this.amb.telaAtual() === a.tela) this.telaEsperada = null;
        else if (!this.amb.navegarPara(a.tela)) { this.telaEsperada = null; return this.falhar('Não encontrei essa tela.'); }
        this.telaDoPlano = a.tela;
        await this.dormir(animar ? 500 : 0);
        return this.livre() || this.semAnimacao ? 'ok' : 'repetir';
      }
      const el = await this.achar(p.alvo);
      if (el === INTERROMPIDO) return 'repetir';
      if (!el) return this.falhar('Não encontrei esse botão na tela.');
      if (!this.amb.podeClicarParaAbrir(el)) return this.falhar('Por segurança, o piloto só abre telas e formulários; não clica em botões de ação.');
      this.amb.rolarAte(el); this.amb.destacar(el, p.legenda, false);
      await this.dormir(animar ? MS_APOS_DESTAQUE[ritmo] / 2 : 0);
      if (!this.livre()) return 'repetir';
      this.amb.clicar(el);
      await this.dormir(animar ? 400 : 0);
      return 'ok';
    }

    if (p.tipo === 'selecionar' && a.tipo === 'campo' && a.campo === 'empresa-ativa') {
      const cnpj = String(p.valor || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      if (!cnpj) return this.falhar('Empresa não informada.');
      if (this.amb.empresaAtual() !== cnpj) {
        if (!this.amb.selecionarEmpresa(cnpj)) return this.falhar('Essa empresa não está entre as empresas liberadas para você.');
        for (let i = 0; i < 40 && !this.amb.empresaPronta(); i += 1) { await this.amb.esperar(150); if (!this.livre() && !this.semAnimacao) return 'repetir'; }
      }
      this.empresaDoPlano = cnpj;
      await this.dormir(animar ? 500 : 0);
      return this.livre() || this.semAnimacao ? 'ok' : 'repetir';
    }

    const el = await this.achar(p.alvo);
    if (el === INTERROMPIDO) return 'repetir';
    if (!el) return this.falhar(p.tipo === 'parar_no_botao' ? 'Não encontrei o botão na tela.' : 'Não encontrei essa parte na tela.');

    if (p.tipo === 'rolar') { this.amb.rolarAte(el); await this.dormir(animar ? 500 : 0); return this.livre() || this.semAnimacao ? 'ok' : 'repetir'; }

    if (p.tipo === 'destacar') {
      this.amb.rolarAte(el); this.amb.destacar(el, p.legenda, false);
      await this.dormir(animar ? MS_APOS_DESTAQUE[ritmo] : 0);
      return this.livre() || this.semAnimacao ? 'ok' : 'repetir';
    }

    if (p.tipo === 'parar_no_botao') {
      this.amb.rolarAte(el); this.amb.destacar(el, p.legenda, true);
      // NUNCA clica aqui. Só o clique do contador (ou "pode confirmar" por voz, para botão de salvar) conclui.
      this.botaoForaDaTela = false;
      this.limparBotao();
      this.desligarBotao = this.amb.aoClicarUmaVez(el, () => this.confirmadoPeloContador());
      this.mudar('parou_no_botao');
      this.falar(`Confira e clique você: ${p.legenda}`);
      return 'parou';
    }

    // selecionar / preencher
    if (this.amb.ehSensivel(el)) {
      this.recusados += 1; this.legenda = 'Este campo é sigiloso (senha, token, certificado ou dado bancário): preencha você.'; this.avisar();
      this.amb.rolarAte(el); this.amb.destacar(el, this.legenda, false);
      await this.dormir(animar ? MS_APOS_DESTAQUE[ritmo] : 0);
      return this.livre() || this.semAnimacao ? 'ok' : 'repetir';
    }
    if (!this.amb.ehCampoEditavel(el)) return this.falhar('Esse item da tela não é um campo de preencher.');
    if (this.amb.ehDesabilitado(el)) {
      this.legenda = `${p.legenda} (este campo o sistema preenche sozinho)`; this.avisar();
      this.amb.rolarAte(el); this.amb.destacar(el, this.legenda, false);
      await this.dormir(animar ? MS_APOS_DESTAQUE[ritmo] : 0);
      return this.livre() || this.semAnimacao ? 'ok' : 'repetir';
    }
    const valor = String(p.valor ?? '');
    this.amb.rolarAte(el); this.amb.destacar(el, p.legenda, false); this.amb.focar(el);
    const modo = this.amb.modoDoCampo(el);
    if (modo === 'instantaneo' || p.tipo === 'selecionar') {
      if (modo === 'instantaneo' && !this.amb.temOpcao(el, valor)) return this.falhar('A opção pedida não existe nesta lista.');
      await this.dormir(animar ? 350 : 0);
      if (!this.livre() && !this.semAnimacao) return 'repetir';
      this.amb.definirValor(el, valor);
      await this.dormir(animar ? MS_ENTRE_CAMPOS[ritmo] : 0);
      return this.livre() || this.semAnimacao ? 'ok' : 'repetir';
    }
    // Digitação à vista: um caractere por vez, no ritmo escolhido. O texto é exatamente o recebido.
    if (animar) this.amb.definirValor(el, '');
    if (!animar) { this.amb.definirValor(el, valor); return 'ok'; }
    for (let i = 1; i <= valor.length; i += 1) {
      if (!this.livre()) return 'repetir';
      const parcial = valor.slice(0, i);
      if (modo === 'numero' && /[.,]$/.test(parcial) && i < valor.length) continue; // campo numérico não aceita "12." como valor parcial
      this.amb.definirValor(el, parcial);
      await this.amb.esperar(MS_POR_CARACTERE[this.ritmo]);
    }
    if (!this.livre()) return 'repetir';
    await this.amb.esperar(MS_ENTRE_CAMPOS[this.ritmo]);
    return this.livre() ? 'ok' : 'repetir';
  }
}

// ---------------------------------------------------------------------------------------------
// Piloto ativo (um por vez) — usado pelo chat/voz para continuar, segundo plano, cancelar e confirmar
// ---------------------------------------------------------------------------------------------
let ativo: PilotoExecutor | null = null;
export const registrarPilotoAtivo = (p: PilotoExecutor | null): void => { ativo = p; };
export const pilotoAtivo = (): PilotoExecutor | null => (ativo && !ESTADOS_FINAIS.includes(ativo.getEstado()) ? ativo : null);

/**
 * Aplica ao piloto ativo o que o contador disse/escreveu. `tratado` = existe piloto e a frase foi para ele.
 * `falado` = o próprio piloto já falou/escreveu a mensagem (quem chamou não deve repetir `resposta`).
 */
export function aplicarIntencaoAoPiloto(i: IntencaoPiloto): { tratado: boolean; falado: boolean; resposta?: string } {
  const p = pilotoAtivo();
  if (!p) return { tratado: false, falado: false };
  const e = p.getEstado();
  if (i === 'continuar') { if (e === 'pausado' || e === 'segundo_plano' || e === 'aguardando_confirmacao') { p.retomar(); return { tratado: true, falado: true }; } return { tratado: true, falado: false, resposta: 'Já estou continuando.' }; }
  if (i === 'segundo_plano') { if (e === 'rodando' || e === 'pausado') { p.segundoPlano(); return { tratado: true, falado: true }; } return { tratado: true, falado: false, resposta: e === 'segundo_plano' ? 'Já estou fazendo em segundo plano.' : 'Não há o que fazer em segundo plano agora.' }; }
  if (i === 'cancelar') { p.cancelar(); return { tratado: true, falado: true }; }
  if (e !== 'aguardando_confirmacao') return { tratado: false, falado: false };
  const r = p.confirmarPorVoz();
  if (r === 'confirmado') return { tratado: true, falado: false, resposta: MSG_CONFIRMADO };
  if (r === 'levado_ao_botao') return { tratado: true, falado: true };
  return { tratado: true, falado: false, resposta: 'Essa ação é definitiva: clique você mesmo no botão destacado.' };
}

// ---------------------------------------------------------------------------------------------
// Ambiente real (DOM)
// ---------------------------------------------------------------------------------------------
export interface OpcoesAmbienteDom {
  telasValidas: ReadonlySet<string>;
  navegarPara: (tela: string) => void;
  selecionarEmpresa: (cnpj: string) => boolean;
  telaAtual: () => string;
  empresaAtual: () => string;
  empresaPronta: () => boolean;
  executarApi?: (p: PassoPiloto) => Promise<{ ok: boolean; motivo?: string }>;
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const visivel = (el: Element) => { const h = el as HTMLElement; return !!(h.offsetParent || h.getClientRects().length); };

export function criarAmbienteDom(o: OpcoesAmbienteDom): AmbientePiloto {
  let anel: HTMLDivElement | null = null;
  let alvoDoAnel: Element | null = null;
  let religar: (() => void) | null = null;

  const posicionar = () => {
    if (!anel || !alvoDoAnel) return;
    const r = alvoDoAnel.getBoundingClientRect();
    anel.style.top = `${r.top - 5}px`; anel.style.left = `${r.left - 5}px`; anel.style.width = `${r.width + 10}px`; anel.style.height = `${r.height + 10}px`;
  };
  const limparDestaque = () => {
    if (religar) { window.removeEventListener('scroll', religar, true); window.removeEventListener('resize', religar); religar = null; }
    anel?.remove(); anel = null; alvoDoAnel = null;
  };
  const resolver = (alvo: string): Element | null => {
    const a = analisarAlvo(alvo);
    if (!a) return null;
    try {
      if (a.tipo === 'menu') return document.getElementById(`btn-menu-${a.tela}`);
      if (a.tipo === 'id') return document.getElementById(a.id);
      if (a.tipo === 'campo') {
        const todos = Array.from(document.querySelectorAll(`[data-campo="${a.campo}"]`));
        return todos.find(visivel) || null;
      }
      const alvoTxt = semAcento(a.texto);
      const cands = Array.from(document.querySelectorAll<HTMLElement>('label, span, p, h2, h3, h4, button'));
      return cands.find((el) => visivel(el) && el.children.length <= 2 && (el.textContent || '').length < 140 && semAcento(el.textContent || '').includes(alvoTxt)) || null;
    } catch { return null; }
  };
  const tipoFinal = (el: Element): 'salvar' | 'irreversivel' | null => {
    const m = el.closest('[data-piloto-final]') as HTMLElement | null;
    if (m) return m.getAttribute('data-piloto-final') === 'salvar' ? 'salvar' : 'irreversivel';
    const b = el.closest('button, input[type=submit], a') as HTMLElement | null;
    if (!b) return null;
    if ((b as HTMLButtonElement).type === 'submit' || textoDeAcaoFinal(b.textContent || '') || textoDeAcaoFinal(b.getAttribute('aria-label') || '') || textoDeAcaoFinal(b.getAttribute('title') || '')) return 'irreversivel';
    return null;
  };

  return {
    resolver: (alvo) => resolver(alvo),
    aguardar: async (alvo, ms) => {
      const fim = Date.now() + ms;
      for (;;) {
        const el = resolver(alvo);
        if (el) return el;
        if (Date.now() >= fim) return null;
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    ehSensivel: (el) => {
      const e = el as HTMLInputElement;
      const t = (e.type || '').toLowerCase();
      if (t === 'password' || t === 'file') return true;
      const ac = (e.getAttribute?.('autocomplete') || '').toLowerCase();
      if (/password|^cc-|one-time-code/.test(ac)) return true;
      return [e.name, e.id, e.getAttribute?.('data-campo'), e.getAttribute?.('aria-label'), e.placeholder].some((x) => !!x && textoSensivel(String(x)));
    },
    ehDesabilitado: (el) => !!(el as HTMLInputElement).disabled || !!(el as HTMLInputElement).readOnly,
    modoDoCampo: (el) => {
      const e = el as HTMLElement; const tag = e.tagName; const t = ((e as HTMLInputElement).type || '').toLowerCase();
      if (tag === 'SELECT' || ['month', 'date', 'time', 'datetime-local', 'range', 'color', 'checkbox', 'radio'].includes(t)) return 'instantaneo';
      return t === 'number' ? 'numero' : 'digitar';
    },
    temOpcao: (el, valor) => { const e = el as HTMLSelectElement; if (e.tagName !== 'SELECT') return true; return Array.from(e.options).some((op) => op.value === valor && !op.disabled); },
    ehCampoEditavel: (el) => { const tag = (el as HTMLElement).tagName; return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'; },
    podeClicarParaAbrir: (el) => {
      const e = el as HTMLElement;
      if (tipoFinal(e)) return false;
      return (e.id || '').startsWith('btn-menu-') || e.hasAttribute('data-piloto-abrir');
    },
    tipoDeBotaoFinal: (el) => tipoFinal(el as Element),
    rolarAte: (el) => { try { const reduz = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; (el as HTMLElement).scrollIntoView({ behavior: reduz ? 'auto' : 'smooth', block: 'center' }); } catch { /* sem rolagem */ } },
    destacar: (el, legenda, botaoFinal) => {
      limparDestaque();
      alvoDoAnel = el as Element;
      const d = document.createElement('div');
      d.setAttribute('data-piloto-ignorar', '1'); d.setAttribute('aria-hidden', 'true');
      d.className = 'animate-pulse';
      d.style.cssText = `position:fixed;z-index:10050;pointer-events:none;border:3px solid ${botaoFinal ? '#10b981' : '#f59e0b'};border-radius:10px;box-shadow:0 0 0 4px ${botaoFinal ? 'rgba(16,185,129,.30)' : 'rgba(245,158,11,.30)'};transition:all .25s;`;
      const seta = document.createElement('div');
      seta.textContent = '👇';
      seta.style.cssText = 'position:absolute;left:50%;top:-26px;transform:translateX(-50%);font-size:20px;line-height:1;';
      d.appendChild(seta);
      d.title = legenda;
      document.body.appendChild(d);
      anel = d; religar = posicionar;
      window.addEventListener('scroll', religar, true); window.addEventListener('resize', religar);
      posicionar(); window.setTimeout(posicionar, 350);
    },
    limparDestaque,
    definirValor: (el, texto) => {
      const e = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const proto = e.tagName === 'SELECT' ? HTMLSelectElement.prototype : e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(e, texto); else e.value = texto;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      if (e.tagName === 'SELECT' || ['month', 'date'].includes((e as HTMLInputElement).type)) e.dispatchEvent(new Event('change', { bubbles: true }));
    },
    focar: (el) => { try { (el as HTMLElement).focus({ preventScroll: true }); } catch { /* sem foco */ } },
    clicar: (el) => { (el as HTMLElement).click(); },
    aoClicarUmaVez: (el, cb) => {
      const h = (ev: Event) => { if (ev.isTrusted) { (el as Element).removeEventListener('click', h, true); cb(); } };
      (el as Element).addEventListener('click', h, true);
      return () => (el as Element).removeEventListener('click', h, true);
    },
    navegarPara: (tela) => { if (!o.telasValidas.has(tela)) return false; o.navegarPara(tela); return true; },
    selecionarEmpresa: (cnpj) => o.selecionarEmpresa(cnpj),
    telaAtual: o.telaAtual,
    empresaAtual: o.empresaAtual,
    empresaPronta: o.empresaPronta,
    executarApi: async (p) => (o.executarApi ? o.executarApi(p) : { ok: false, motivo: 'Sem caminho de servidor para esta etapa.' }),
    esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}
