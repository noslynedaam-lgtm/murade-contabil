// Motor da Agente IA Murade (idêntico no DP, Fiscal e Contábil; cada sistema só traz as próprias ferramentas).
//
// Princípios:
//  1. A IA nunca acessa o banco nem executa nada por conta própria. Cada ferramenta chama uma rota que
//     já existe no servidor, com a mesma sessão do usuário. Escopo por empresa, perfil "somente consulta"
//     e todas as validações da folha continuam valendo, porque quem decide é a rota, não a IA.
//  2. Consultas rodam na hora. Qualquer alteração vira uma "ação pendente": o usuário vê exatamente o que
//     será feito e só então confirma. A ação confirmada executa uma única vez.
//  3. Os valores de mensagens (guias, folha) vêm do servidor, nunca do texto do modelo.
//  4. Tudo que é proposto, confirmado, recusado ou falha fica registrado.
import crypto from 'node:crypto';
import { validarPlanoPiloto, type RespostaPiloto } from '../utils/pilotoVisivel';

export type ChamarApi = (metodo: 'GET' | 'POST' | 'DELETE', caminho: string, corpo?: unknown) => Promise<{ status: number; corpo: any }>;

export interface DeclaracaoFerramenta {
  name: string;
  description: string;
  parameters: { type: 'OBJECT'; properties: Record<string, any>; required?: string[] };
}

export interface ChamadaModelo { nome: string; args: Record<string, any>; /** id do functionCall (Gemini 3.x pede o mesmo id no functionResponse). */ id?: string }
export interface RespostaModelo { texto: string; chamadas: ChamadaModelo[]; turnoModelo?: unknown; /** Medição: tokens do prompt e modelo que respondeu (quando o provedor informa). */ tokensPrompt?: number; modelo?: string }
/** `perfil`: quanto o modelo precisa pensar (simples = mínimo; documento = mais). Ver src/data/agenteAgil.ts. */
export type ModeloIA = (entrada: { instrucao: string; conteudos: any[]; declaracoes: DeclaracaoFerramenta[]; perfil?: PerfilPedido }) => Promise<RespostaModelo>;

export interface EventoAuditoria {
  evento: 'proposta' | 'confirmada' | 'recusada' | 'falha' | 'whatsapp_preparado' | 'expirada' | 'duvida_sem_resposta' | 'piloto';
  ferramenta: string;
  cnpj: string | null;
  resumo: string;
  resultado?: string;
}

export interface AcaoParaTela {
  id: string;
  ferramenta: string;
  titulo: string;
  descricao: string[];
  aviso: string | null;
  irreversivel: boolean;
  /** Exclusão: o cartão pede DUAS confirmações (Continuar, depois "Sim, excluir"). O servidor recusa a segunda sem a primeira. */
  duasEtapas: boolean;
  expiraEm: string;
}

export interface MensagemWhatsAppParaTela {
  empresa: string;
  numero: string | null;
  texto: string;
  link: string;
}
import type { CentralDePedidos } from './agentesEntreSistemas';
import { REGRAS_DE_ENTENDIMENTO, contextoDeRespostaCurta } from './agenteEntendimento';
import { REGRA_PEDIDO_LONGO } from './agenteEtapas';
import { cumprirPromessaSupervisor } from './chamadosSupervisor';
import { ESTILO_AGIL, MAX_TURNOS_HISTORICO, NOME_MAIS_FERRAMENTAS, PedidoAgil, REGRA_PERMISSAO, type PerfilPedido } from '../data/agenteAgil';

export interface ContextoAgente {
  sessaoHash: string;
  login: string;
  hoje: string;
  chamarApi: ChamarApi;
  registrar: (evento: EventoAuditoria) => Promise<void> | void;
  pendentes: ArmazemAcoesPendentes;
  kit: KitAgente;
  /** Protocolo com as Agentes dos outros sistemas Murade. */
  central?: CentralDePedidos;
  /** Nome de tratamento da pessoa que está falando (gravado pelo sistema; sem custo de IA). */
  nomeUsuario?: string;
  /** Quando o pedido chegou ao servidor (para medir o preparo antes do motor). */
  inicioMs?: number;
  /** O pedido como a pessoa escreveu (sem anexos): vira a pergunta do chamado para o supervisor. */
  mensagemOriginal?: string;
}

interface AcaoPendente {
  id: string;
  sessaoHash: string;
  login: string;
  ferramenta: string;
  cnpj: string | null;
  titulo: string;
  params: unknown;
  resumo: string;
  /** Exclusão: só executa depois de avancar() (primeira confirmação) e então confirmarAcao() (segunda). */
  duasEtapas: boolean;
  etapa1Em: number | null;
  expiraEmMs: number;
}

const VALIDADE_ACAO_MS = 15 * 60_000;
const MAX_PENDENTES_POR_SESSAO = 20;
const MAX_PASSOS_MODELO = 10;
const MAX_CHAMADAS_POR_PASSO = 4;
const LIMITE_RESULTADO_FERRAMENTA = 12_000;

export class ArmazemAcoesPendentes {
  private itens = new Map<string, AcaoPendente>();
  constructor(private agora: () => number = () => Date.now()) {}

  private limpar(): void {
    const t = this.agora();
    for (const [id, item] of this.itens) if (item.expiraEmMs <= t) this.itens.delete(id);
  }

  criar(dados: Omit<AcaoPendente, 'id' | 'expiraEmMs' | 'etapa1Em'>): AcaoPendente {
    this.limpar();
    const daSessao = [...this.itens.values()].filter((item) => item.sessaoHash === dados.sessaoHash);
    if (daSessao.length >= MAX_PENDENTES_POR_SESSAO) {
      // Descarta a mais antiga: a pessoa claramente deixou de olhar para ela.
      const maisAntiga = daSessao.sort((a, b) => a.expiraEmMs - b.expiraEmMs)[0];
      this.itens.delete(maisAntiga.id);
    }
    const item: AcaoPendente = { ...dados, etapa1Em: null, id: crypto.randomBytes(12).toString('base64url'), expiraEmMs: this.agora() + VALIDADE_ACAO_MS };
    this.itens.set(item.id, item);
    return item;
  }

  /** Olha a ação sem retirá-la (para checar a etapa antes de executar). */
  espiar(id: string, sessaoHash: string): AcaoPendente | null {
    const item = this.itens.get(String(id || ''));
    return item && item.sessaoHash === sessaoHash && item.expiraEmMs > this.agora() ? item : null;
  }

  /** Primeira confirmação de uma exclusão (botão Continuar do cartão). Não executa nada. */
  avancar(id: string, sessaoHash: string): { ok: boolean; motivo?: string } {
    const item = this.espiar(id, sessaoHash);
    if (!item) return { ok: false, motivo: 'Ação não encontrada. Ela pode já ter sido confirmada, cancelada ou ter expirado.' };
    if (!item.duasEtapas) return { ok: false, motivo: 'Esta ação não tem segunda etapa.' };
    item.etapa1Em = this.agora();
    return { ok: true };
  }

  /** Retira a ação do armazém (uso único). Devolve motivo quando não pode ser usada. */
  retirar(id: string, sessaoHash: string): { item?: AcaoPendente; motivo?: string } {
    const item = this.itens.get(String(id || ''));
    if (!item || item.sessaoHash !== sessaoHash) return { motivo: 'Ação não encontrada. Ela pode já ter sido confirmada, cancelada ou ter expirado.' };
    this.itens.delete(item.id);
    if (item.expiraEmMs <= this.agora()) return { item, motivo: 'Esta ação expirou. Peça novamente para a IA preparar.' };
    return { item };
  }

  tamanho(): number { this.limpar(); return this.itens.size; }
}

// ---------------------------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------------------------
export const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
export function cnpjDe(valor: unknown): string | null {
  const c = String(valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{12}\d{2}$/.test(c) ? c : null;
}
export const competenciaDe = (v: unknown): string | null => (typeof v === 'string' && COMPETENCIA.test(v) ? v : null);
export const numeroNaoNegativo = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e9;
export const reais = (v: unknown): string => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const mesAno = (competencia: string): string => `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
export const q = (valor: string): string => encodeURIComponent(valor);

export function erroApi(r: { status: number; corpo: any }): { erro: string } {
  const motivo = r.corpo?.motivo || r.corpo?.error || r.corpo?.mensagem;
  return { erro: String(motivo || `O sistema respondeu com erro (HTTP ${r.status}).`).slice(0, 500) };
}
export const ok = (r: { status: number; corpo: any }): boolean => r.status >= 200 && r.status < 300 && r.corpo?.sucesso !== false;

export interface PropostaAcao { params: unknown; titulo: string; descricao: string[]; aviso?: string; irreversivel?: boolean; cnpj: string; resumo: string }

export interface FerramentaLeitura {
  tipo: 'leitura';
  declaracao: DeclaracaoFerramenta;
  executar(ctx: ContextoAgente, args: Record<string, any>): Promise<unknown>;
}
export interface FerramentaAcao {
  tipo: 'acao';
  declaracao: DeclaracaoFerramenta;
  /** Valida os argumentos e monta a proposta. Retorna texto de erro quando algo está faltando ou inválido. */
  preparar(ctx: ContextoAgente, args: Record<string, any>): Promise<PropostaAcao | { erro: string }>;
  executar(ctx: ContextoAgente, params: any): Promise<{ sucesso: boolean; mensagem: string; detalhes?: unknown }>;
  /** true em TODA ferramenta que exclui, remove ou apaga algo: o cartão exige duas confirmações antes de executar. */
  exclusao?: boolean;
}
export interface FerramentaMensagem {
  tipo: 'mensagem';
  declaracao: DeclaracaoFerramenta;
  executar(ctx: ContextoAgente, args: Record<string, any>): Promise<{ erro: string } | { mensagem: MensagemWhatsAppParaTela }>;
}
export type Ferramenta = FerramentaLeitura | FerramentaAcao | FerramentaMensagem;

export interface KitAgente { ferramentas: Ferramenta[]; instrucao: string }

// ---------------------------------------------------------------------------------------------
// Conversa
// ---------------------------------------------------------------------------------------------
export interface TurnoHistorico { papel: 'usuario' | 'ia'; texto: string }
/** `piloto`: roteiro para a tela mudar sozinha (Piloto Visível) ou comando (continuar, segundo_plano, cancelar). Ver src/utils/pilotoVisivel.ts. */
export interface ResultadoConversa { resposta: string; acoes: AcaoParaTela[]; whatsapp: MensagemWhatsAppParaTela[]; piloto?: RespostaPiloto | null }

function resultadoParaModelo(valor: unknown): Record<string, unknown> {
  const texto = JSON.stringify(valor ?? {});
  if (texto.length <= LIMITE_RESULTADO_FERRAMENTA) return (valor && typeof valor === 'object' ? valor : { resultado: valor }) as Record<string, unknown>;
  return { aviso: 'Resultado muito grande; mostrando só o começo.', parcial: texto.slice(0, LIMITE_RESULTADO_FERRAMENTA) };
}

async function auditar(ctx: ContextoAgente, evento: EventoAuditoria): Promise<void> {
  try { await ctx.registrar(evento); } catch (erro: any) { console.error('Falha ao registrar ação da Agente IA:', erro?.message || erro); }
}


// Atalho sem IA para o pedido mais comum ("quantas empresas eu tenho?"): resposta exata e instantânea.
function formatarCnpjFalado(valor: unknown): string {
  const c = String(valor ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c;
}
async function atalhoListarEmpresas(ctx: ContextoAgente, mensagem: string, porNome: Map<string, Ferramenta>): Promise<ResultadoConversa | null> {
  const t = mensagem.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length > 90 || !/\bempresas?\b/.test(t)) return null;
  if (/\b(vence|venc|folha|guia|nota|notas|funcionari|certificado|robo|erro|calcul|fech|imprim|whats|esocial|dctf|das|fgts|inss|irrf)\w*/.test(t)) return null;
  if (!/\b(quantas?|quais|lista|listar|mostra|mostrar|ver|fala|diga|minhas?|cadastradas?|tenho|tem)\b/.test(t)) return null;
  const ferramenta = porNome.get('listar_empresas');
  if (!ferramenta || ferramenta.tipo !== 'leitura') return null;
  try {
    const r: any = await ferramenta.executar(ctx, {});
    if (!r || typeof r !== 'object' || r.erro || !Array.isArray(r.empresas)) return null;
    const lista: any[] = r.empresas;
    if (!lista.length) return { resposta: 'Não há nenhuma empresa cadastrada neste sistema.', acoes: [], whatsapp: [] };
    const nome = (e: any) => String(e.razaoSocial || e.nome || e.nomeFantasia || 'sem nome');
    const ordinais = ['primeira', 'segunda', 'terceira', 'quarta', 'quinta', 'sexta', 'sétima', 'oitava', 'nona', 'décima'];
    const marca = (e: any) => (e.atendidaNoDP === false || e.atendidaNoContabil === false ? ', ainda não ativada aqui' : '');
    const descricao = (e: any) => `${nome(e)}, CNPJ ${formatarCnpjFalado(e.cnpj)}${e.regime ? `, regime ${e.regime}` : ''}${marca(e)}`;
    // Mesmo texto de contagem das telas (total do escritório E a divisão), quando a ferramenta traz o resumo.
    const resumo = typeof r.resumo === 'string' && r.resumo ? r.resumo : '';
    const atalho = resumo && /ainda não ativad/.test(resumo) ? ' Para ativar, abra Empresa e o bloco "Empresas do escritório ainda não ativadas aqui", ou me peça "ativa a empresa tal".' : '';
    if (lista.length === 1) return { resposta: `Você tem uma empresa cadastrada: ${descricao(lista[0])}.${atalho}`, acoes: [], whatsapp: [] };
    const ordenada = [...lista.filter((e) => !marca(e)), ...lista.filter((e) => marca(e))];
    const partes = ordenada.slice(0, 10).map((e, i) => `A ${ordinais[i]} é ${descricao(e)}.`);
    const mais = lista.length > 10 ? ` Mostrei as dez primeiras. Peça para ver as outras, se quiser.` : '';
    return { resposta: `Você tem ${resumo || `${lista.length} empresas cadastradas`}. ${partes.join(' ')}${mais}${atalho}`, acoes: [], whatsapp: [] };
  } catch { return null; }
}

/** Anexo opcional (foto/PDF): a IA multimodal lê; usado no "Murad, cadastra essa empresa". Nada é gravado sem o cartão de OK. */
export interface AnexoConversa { mimeType: string; dadosBase64: string }

export async function conversar(ctx: ContextoAgente, modelo: ModeloIA, mensagem: string, historico: TurnoHistorico[] = [], anexo?: AnexoConversa): Promise<ResultadoConversa> {
  // Chamado para o supervisor (28/11/2026): se a resposta promete chamar o supervisor e nada foi registrado, o servidor registra
  // sozinho; se não conseguir registrar, a resposta deixa de prometer. Nunca promete sem registrar.
  const registrarOriginal = ctx.registrar;
  let supervisorRegistrado = false;
  ctx.registrar = async (evento) => { await registrarOriginal(evento); if (evento.evento === 'duvida_sem_resposta') supervisorRegistrado = true; };
  try {
    const r = await conversarSemGarantia(ctx, modelo, mensagem, historico, anexo);
    const garantia = await cumprirPromessaSupervisor({ resposta: r.resposta, jaRegistrado: supervisorRegistrado, pergunta: ctx.mensagemOriginal || mensagem, cnpj: null, registrar: (e) => registrarOriginal(e) });
    return garantia.resposta === r.resposta ? r : { ...r, resposta: garantia.resposta };
  } finally { ctx.registrar = registrarOriginal; }
}

async function conversarSemGarantia(ctx: ContextoAgente, modelo: ModeloIA, mensagem: string, historico: TurnoHistorico[] = [], anexo?: AnexoConversa): Promise<ResultadoConversa> {
  const porNome = new Map(ctx.kit.ferramentas.map((f) => [f.declaracao.name, f]));
  historico = historico.slice(-MAX_TURNOS_HISTORICO);
  // Agente ágil: só as ferramentas (e as linhas do prompt) que têm a ver com o pedido; mede cada etapa; aplica a regra de permissão.
  const agil = new PedidoAgil({ sistema: 'contabil', declaracoes: ctx.kit.ferramentas.map((f) => f.declaracao), instrucaoKit: ctx.kit.instrucao, mensagem, historico, anexo: Boolean(anexo?.dadosBase64), inicioMs: ctx.inicioMs });
  const rapida = anexo ? null : await atalhoListarEmpresas(ctx, mensagem, porNome);
  if (rapida) { agil.registrar(rapida.resposta, 'empresas'); return rapida; }
  let respostaFinal = '';
  try { const r = await conversarComModelo(ctx, modelo, mensagem, historico, porNome, agil, anexo); respostaFinal = r.resposta; return r; }
  finally { agil.registrar(respostaFinal); }
}

async function conversarComModelo(ctx: ContextoAgente, modelo: ModeloIA, mensagem: string, historico: TurnoHistorico[], porNome: Map<string, Ferramenta>, agil: PedidoAgil<DeclaracaoFerramenta>, anexo?: AnexoConversa): Promise<ResultadoConversa> {
  // Avisa o usuário de pedidos recebidos de outros sistemas que ainda aguardam resposta.
  let instrucao = ESTILO_AGIL + REGRA_PERMISSAO + REGRAS_DE_ENTENDIMENTO + REGRA_PEDIDO_LONGO;
  if (ctx.nomeUsuario) instrucao += `\n\nA pessoa que está falando com você se chama ${ctx.nomeUsuario}. Trate-a pelo nome de vez em quando, de forma natural, sem repetir em toda frase. Não diga bom dia, boa tarde nem boa noite: o sistema já faz isso sozinho.`;
  try {
    const abertos = ctx.central ? (await ctx.central.caixaDeEntrada(true)).filter((p) => p.estado === 'recebido').length : 0;
    if (abertos > 0) instrucao += `\n\nAVISO: há ${abertos} pedido(s) recebido(s) de outros sistemas aguardando resposta. Na sua resposta, diga isso ao usuário em uma frase e ofereça mostrar (ver_pedidos_entre_sistemas).`;
  } catch { /* a caixa indisponível não impede a conversa */ }
  const conteudos: any[] = historico.filter((t) => t && typeof t.texto === 'string' && t.texto.trim()).map((t) => ({
    role: t.papel === 'ia' ? 'model' : 'user', parts: [{ text: t.texto.slice(0, 8000) }],
  }));
  const partesUsuario: any[] = [{ text: `Data de hoje: ${ctx.hoje}\n${contextoDeRespostaCurta(mensagem, historico)}${mensagem}` }];
  if (anexo && anexo.dadosBase64 && anexo.mimeType) partesUsuario.push({ inlineData: { mimeType: anexo.mimeType, data: anexo.dadosBase64 } });
  conteudos.push({ role: 'user', parts: partesUsuario });

  const acoes: AcaoParaTela[] = [];
  const whatsapp: MensagemWhatsAppParaTela[] = [];
  let piloto: RespostaPiloto | null = null;

  for (let passo = 0; passo < MAX_PASSOS_MODELO; passo += 1) {
    const entrada = { instrucao: agil.instrucaoKit + instrucao, conteudos, declaracoes: agil.declaracoes, perfil: agil.perfil };
    const r = await agil.chamar(entrada, () => modelo(entrada));
    if (!r.chamadas.length) {
      return { resposta: r.texto.trim() || 'Não consegui montar uma resposta. Pode repetir o pedido?', acoes, whatsapp, piloto };
    }
    conteudos.push(r.turnoModelo ?? { role: 'model', parts: r.chamadas.map((c) => ({ functionCall: { name: c.nome, args: c.args, ...(c.id ? { id: c.id } : {}) } })) });
    const respostas: any[] = [];
    for (const chamada of r.chamadas.slice(0, MAX_CHAMADAS_POR_PASSO)) {
      let resultado: Record<string, unknown>;
      const ferramenta = porNome.get(chamada.nome);
      const args = chamada.args && typeof chamada.args === 'object' ? chamada.args : {};
      try {
        if (chamada.nome === NOME_MAIS_FERRAMENTAS) { agil.liberarTudo(); resultado = { status: 'lista_completa_liberada', instrucao: 'Agora todas as ferramentas do sistema estão disponíveis. Escolha a certa e continue.' }; }
        else if (!ferramenta) resultado = { erro: `Ferramenta desconhecida: ${chamada.nome}.` };
        else if (ferramenta.tipo === 'leitura') {
          const bruto: any = await agil.ferramenta(() => ferramenta.executar(ctx, args));
          // Piloto Visível: o roteiro vai para a tela do usuário, não para o modelo.
          if (bruto && typeof bruto === 'object' && bruto.piloto) {
            const { piloto: p, ...resto } = bruto;
            const valido = p && typeof p === 'object' && 'comando' in p ? (['continuar', 'segundo_plano', 'cancelar'].includes(p.comando) ? { comando: p.comando } : null) : (() => { const v = validarPlanoPiloto(p); return v.ok ? v.plano : null; })();
            if (valido) {
              piloto = valido as RespostaPiloto;
              await auditar(ctx, { evento: 'piloto', ferramenta: chamada.nome, cnpj: cnpjDe((args as any).cnpj), resumo: 'comando' in (valido as any) ? `Comando do piloto: ${(valido as any).comando}` : `Piloto: ${(valido as any).titulo}` });
            }
            resultado = resultadoParaModelo(resto);
          } else resultado = resultadoParaModelo(bruto);
        }
        else if (ferramenta.tipo === 'mensagem') {
          const m = await agil.ferramenta(() => ferramenta.executar(ctx, args));
          if ('erro' in m) resultado = m;
          else {
            whatsapp.push(m.mensagem);
            resultado = { status: 'mensagem_preparada', numeroCadastrado: Boolean(m.mensagem.numero), instrucao: m.mensagem.numero ? 'O botão para abrir o WhatsApp já aparece para o usuário. Avise que ele precisa clicar e enviar.' : 'A empresa não tem WhatsApp de avisos válido cadastrado. O botão abre o WhatsApp sem destinatário. Avise para cadastrar o número na tela Empresa.' };
          }
        } else {
          // Regra de permissão (firme): pergunta de como/onde fazer nunca vira ação; exclusão só com ordem explícita. Mesmo liberada, é só o cartão de OK.
          const antes = agil.permissao(false);
          const proposta = antes.pode ? await agil.ferramenta(() => ferramenta.preparar(ctx, args)) : { erro: antes.motivo || 'Sem permissão.' };
          const depois = 'erro' in proposta ? { pode: true } : agil.permissao(ferramenta.exclusao === true);
          if ('erro' in proposta) resultado = proposta;
          else if (!depois.pode) resultado = { erro: depois.motivo || 'Sem permissão.' };
          else {
            const pendente = ctx.pendentes.criar({ sessaoHash: ctx.sessaoHash, login: ctx.login, ferramenta: chamada.nome, cnpj: proposta.cnpj, titulo: proposta.titulo, params: proposta.params, resumo: proposta.resumo, duasEtapas: ferramenta.exclusao === true });
            acoes.push({ id: pendente.id, ferramenta: chamada.nome, titulo: proposta.titulo, descricao: proposta.descricao, aviso: proposta.aviso ?? null, irreversivel: proposta.irreversivel === true, duasEtapas: pendente.duasEtapas, expiraEm: new Date(pendente.expiraEmMs).toISOString() });
            await auditar(ctx, { evento: 'proposta', ferramenta: chamada.nome, cnpj: proposta.cnpj, resumo: proposta.resumo });
            resultado = { status: 'aguardando_confirmacao_do_usuario', instrucao: 'A ação AINDA NÃO foi executada. O usuário vê um cartão e precisa clicar em ' + (pendente.duasEtapas ? 'Continuar e, depois, em "Sim, excluir" (duas confirmações, porque é uma exclusão).' : 'Confirmar.') };
          }
        }
      } catch (erro: any) {
        console.error(`Falha na ferramenta ${chamada.nome} da Agente IA:`, erro?.message || erro);
        resultado = { erro: 'Não foi possível concluir esta consulta agora.' };
      }
      respostas.push({ functionResponse: { name: chamada.nome, response: resultado, ...(chamada.id ? { id: chamada.id } : {}) } });
    }
    conteudos.push({ role: 'user', parts: respostas });
  }
  // Passou do número de rodadas: em vez de desistir, pede ao modelo uma resposta final, SEM ferramentas, com o que já
  // foi levantado (texto longo ou pedido com várias partes nunca deve virar "não entendi").
  try {
    conteudos.push({ role: 'user', parts: [{ text: 'Responda agora ao usuário em português, com tudo o que você já levantou nas consultas acima. Se alguma parte do pedido ficou sem resposta, diga qual e o que falta, em uma frase. Não chame mais ferramentas.' }] });
    const entradaFim = { instrucao: agil.instrucaoKit + instrucao, conteudos, declaracoes: [] as DeclaracaoFerramenta[], perfil: agil.perfil };
    const fim = await agil.chamar(entradaFim, () => modelo(entradaFim));
    if (fim.texto.trim()) return { resposta: fim.texto.trim(), acoes, whatsapp, piloto };
  } catch (erro: any) { console.error('Falha na resposta final da Agente IA:', erro?.message || erro); }
  return { resposta: 'Fiz várias consultas para responder e não consegui fechar tudo de uma vez. Me diga qual parte do pedido você quer primeiro que eu continuo daí.', acoes, whatsapp, piloto };
}

export const MENSAGEM_FALTA_ETAPA_1 = 'Falta a primeira confirmação desta exclusão. Toque em Continuar no cartão e depois confirme de novo. Nada foi excluído.';

/** Primeira confirmação de uma exclusão pedida por voz. Só marca a etapa; quem executa é confirmarAcao. */
export async function avancarAcao(ctx: ContextoAgente, id: string): Promise<{ sucesso: boolean; mensagem: string }> {
  const r = ctx.pendentes.avancar(id, ctx.sessaoHash);
  return r.ok ? { sucesso: true, mensagem: 'Última confirmação: toque em "Sim, excluir" para concluir ou em "Não, cancelar".' } : { sucesso: false, mensagem: r.motivo || 'Ação não encontrada.' };
}

export async function confirmarAcao(ctx: ContextoAgente, id: string): Promise<{ sucesso: boolean; mensagem: string; detalhes?: unknown }> {
  const espiada = ctx.pendentes.espiar(id, ctx.sessaoHash);
  // Exclusão sem a primeira confirmação: recusa SEM gastar a ação (a pessoa ainda pode continuar pelo cartão).
  if (espiada?.duasEtapas && espiada.etapa1Em === null) return { sucesso: false, mensagem: MENSAGEM_FALTA_ETAPA_1 };
  const { item, motivo } = ctx.pendentes.retirar(id, ctx.sessaoHash);
  if (!item || motivo) {
    if (item) await auditar(ctx, { evento: 'expirada', ferramenta: item.ferramenta, cnpj: item.cnpj, resumo: item.resumo });
    return { sucesso: false, mensagem: motivo || 'Ação não encontrada.' };
  }
  const ferramenta = ctx.kit.ferramentas.find((f) => f.declaracao.name === item.ferramenta);
  if (!ferramenta || ferramenta.tipo !== 'acao') return { sucesso: false, mensagem: 'Ação não reconhecida.' };
  try {
    const r = await ferramenta.executar(ctx, item.params);
    await auditar(ctx, { evento: r.sucesso ? 'confirmada' : 'falha', ferramenta: item.ferramenta, cnpj: item.cnpj, resumo: item.resumo, resultado: r.mensagem.slice(0, 300) });
    return r;
  } catch (erro: any) {
    console.error(`Falha ao executar a ação ${item.ferramenta}:`, erro?.message || erro);
    await auditar(ctx, { evento: 'falha', ferramenta: item.ferramenta, cnpj: item.cnpj, resumo: item.resumo, resultado: 'erro inesperado' });
    return { sucesso: false, mensagem: 'Não foi possível executar a ação agora. Nada foi alterado de forma confirmada; confira a tela antes de tentar de novo.' };
  }
}

export async function recusarAcao(ctx: ContextoAgente, id: string): Promise<{ sucesso: boolean }> {
  const { item } = ctx.pendentes.retirar(id, ctx.sessaoHash);
  if (item) await auditar(ctx, { evento: 'recusada', ferramenta: item.ferramenta, cnpj: item.cnpj, resumo: item.resumo });
  return { sucesso: Boolean(item) };
}

