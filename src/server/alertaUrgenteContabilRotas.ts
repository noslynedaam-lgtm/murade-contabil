// Rotas e robô do ALERTA URGENTE DE VENCIMENTO do Contábil (ver alertaUrgenteContabil.ts). Só as empresas da sessão; somente leitura
// não marca "Resolvido". "Rodar agora" com barra de progresso, um por escritório.
import type express from "express";
import { acessoEmpresa } from "./escrituracaoRotas";
import { normalizarCnpjAcesso } from "./authContabil";
import { painelCentral, tabelaSelicContabil, vencimentoEcd, vencimentoEcf, type DepsCentral, type Obrigacao } from "./centralLucroReal";
import {
  aparelhosNoFiscal, urlDoFiscal, basesDaMulta, conferirAlertasUrgentes, enviarAlertasUrgentes, itensUrgentes, lerPrefsAlerta, marcarResolvido, obrigacoesEcdEcfGerais, resolvidosDe, salvarPrefsAlerta,
  TIPOS_URGENTE_CONTABIL, DIAS_ATRASO_NO_URGENTE, type EnviarUrgente, type ItemUrgenteContabil, type ResumoUrgente,
} from "./alertaUrgenteContabil";
import { pushConfiguradoContabil } from "./avisoAparelhoContabil";

type Mw = express.RequestHandler;
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
export const minutosSP = (d = new Date()) => { const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).split(":").map(Number); return h * 60 + m; };

export interface DepsUrgenteContabil extends DepsCentral {
  sessao: (req: express.Request) => { cnpjs: string[]; login: string; tenantId: string } | undefined;
  empresasLucroReal: (cnpjs?: string[]) => Promise<string[]>;
  todasEmpresas: (cnpjs?: string[]) => Promise<string[]>;
  enviar: () => EnviarUrgente;
}

/** ECD/ECF das empresas fora do Lucro Real só entram perto do prazo (7 dias antes até 30 de atraso): fora disso nem lê o cadastro. */
export function ecdEcfNaJanela(hoje: string): boolean {
  const ano = Number(hoje.slice(0, 4)) - 1;
  return [vencimentoEcd(ano), vencimentoEcf(ano)].some((v) => { const d = diasEntre(hoje, v); return d <= 7 && d >= -DIAS_ATRASO_NO_URGENTE; });
}

export async function montarItensUrgentesContabil(deps: DepsUrgenteContabil, cnpjs: string[], aoProgresso?: (feito: number, total: number) => void): Promise<ItemUrgenteContabil[]> {
  if (!cnpjs.length) return [];
  const hoje = deps.hoje(); const ano = Number(hoje.slice(0, 4));
  const lr = new Set(await deps.empresasLucroReal(cnpjs));
  const alvo = ecdEcfNaJanela(hoje) ? cnpjs : cnpjs.filter((c) => lr.has(c));
  if (!alvo.length) return [];
  const selic = await tabelaSelicContabil(deps.consultar).catch(() => ({}));
  const resolvidos = await resolvidosDe(deps.consultar, alvo);
  const out: ItemUrgenteContabil[] = []; let feito = 0;
  for (const cnpj of alvo) {
    aoProgresso?.(feito, alvo.length); feito += 1;
    try {
      const payload = await deps.lerWorkspace(cnpj); if (!payload) continue;
      const razao = String(payload?.empresa?.razaoSocial || payload?.empresa?.nome || cnpj);
      const obrig: Obrigacao[] = lr.has(cnpj) ? [...(await painelCentral(deps, cnpj, ano)).obrigacoes] : [];
      obrig.push(...obrigacoesEcdEcfGerais(payload, hoje)); // a da Central vem antes e prevalece (mesmo id)
      out.push(...itensUrgentes(cnpj, razao, obrig, hoje, selic, basesDaMulta(payload, hoje), resolvidos.get(cnpj) ?? new Set()));
    } catch (e: any) { console.error("[alerta urgente contábil]", cnpj, e?.message || e); }
  }
  aoProgresso?.(alvo.length, alvo.length);
  return out.sort((a, b) => a.dias - b.dias || a.razaoSocial.localeCompare(b.razaoSocial));
}

export interface Progresso { inicio: number; fase: string; feito: number; total: number; fim?: number; resultado?: string; erro?: string }
export function resumoTexto(r: ResumoUrgente, c: { semEnvio: string[]; semAparelho: string[]; semChave?: boolean }): string {
  const p = [`${r.itens} vencimento(s) do Contábil no alerta urgente; ${r.avisosNovos} aviso(s) novo(s) agora (${r.entregues} entregue(s) no celular, ${r.semAparelho} de quem ainda não ativou o aparelho, ${r.silenciados} desligado(s) pela pessoa); ${r.jaEnviados} já avisado(s) nesta etapa.`];
  if (r.falhasFiscal) p.push(`${r.falhasFiscal} aviso(s) não saíram porque o Murad Fiscal não respondeu (${r.erros.join("; ")}); tenta de novo na próxima rodada.`);
  if (c.semEnvio.length) p.push(`Conferidor: ${c.semEnvio.length} vencimento(s) sem aviso aceito agora (${c.semEnvio.slice(0, 4).join("; ")}).`);
  if (c.semAparelho.length) p.push(`Conferidor: ninguém recebeu no celular (${c.semAparelho.slice(0, 4).join("; ")}) — peça para tocar em "Ativar avisos neste aparelho".`);
  if (c.semChave) p.push("Conferidor: o Contábil está sem as chaves de aviso (VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no Render): os avisos só saem pelo Murad Fiscal.");
  return `${r.falhasFiscal || c.semEnvio.length || c.semAparelho.length || c.semChave ? "ATENÇÃO: " : ""}${p.join(" ")}`;
}

export function registrarAlertaUrgenteContabil(app: express.Express, mw: { exigirSessao: Mw; exigirOrigem: Mw }, deps: DepsUrgenteContabil) {
  const falha = (res: express.Response, e: any) => { console.error("[alerta-urgente]", e?.message || e); return res.status(503).json({ sucesso: false, motivo: "Não foi possível montar os vencimentos urgentes agora. Tente de novo." }); };
  const cnpjsDa = (s: { cnpjs: string[] }) => s.cnpjs.map(normalizarCnpjAcesso).slice(0, 500);

  app.get("/api/alerta-urgente", mw.exigirSessao, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const s = deps.sessao(req); if (!s) return res.status(401).json({ sucesso: false });
    try { const itens = await montarItensUrgentesContabil(deps, await deps.todasEmpresas(cnpjsDa(s))); return res.json({ sucesso: true, itens, tipos: TIPOS_URGENTE_CONTABIL }); }
    catch (e) { return falha(res, e); }
  });
  // "Resolvido" (ou desfazer): para os avisos urgentes daquela obrigação, registrado com o nome. Acesso de escrita à empresa.
  app.post("/api/workspaces/:cnpj/alerta-urgente/resolvido", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    try { const r = await marcarResolvido(deps.consultar, a.cnpj, String(req.body?.obrigacaoId ?? ""), a.sessao.login, req.body?.desfazer === true); return "erro" in r ? res.status(400).json({ sucesso: false, motivo: r.erro }) : res.json({ sucesso: true }); }
    catch (e) { return falha(res, e); }
  });
  // Convite "Ativar avisos neste aparelho": o aviso do Contábil chega pelo aplicativo do Murad Fiscal; diz se a pessoa já ativou lá.
  app.get("/api/alerta-urgente/aparelho", mw.exigirSessao, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const s = deps.sessao(req); if (!s) return res.status(401).json({ sucesso: false });
    const r = await aparelhosNoFiscal(s.login);
    return res.json({ sucesso: true, conferido: Boolean(r), temConta: r?.temConta ?? null, aparelhos: r?.aparelhos ?? null, fiscal: urlDoFiscal() });
  });
  app.get("/api/alerta-urgente/preferencias", mw.exigirSessao, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const s = deps.sessao(req); if (!s) return res.status(401).json({ sucesso: false });
    try { return res.json({ sucesso: true, preferencias: await lerPrefsAlerta(deps.consultar, s.login), tipos: TIPOS_URGENTE_CONTABIL }); } catch (e) { return falha(res, e); }
  });
  app.put("/api/alerta-urgente/preferencias", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const s = deps.sessao(req); if (!s) return res.status(401).json({ sucesso: false });
    try { return res.json({ sucesso: true, preferencias: await salvarPrefsAlerta(deps.consultar, s.login, req.body) }); } catch (e) { return falha(res, e); }
  });

  // Robô (todos os escritórios, cada empresa para a própria equipe) e "Rodar agora" (só as empresas da sessão).
  const rodar = async (cnpjs: string[] | undefined, st?: Progresso): Promise<string> => {
    const lista = await deps.todasEmpresas(cnpjs);
    if (st) st.fase = "Montando os vencimentos do Contábil";
    const itens = await montarItensUrgentesContabil(deps, lista, (f, t) => { if (st) { st.feito = f; st.total = Math.max(1, t * 2); } });
    if (st) st.fase = "Avisando a equipe pelo celular";
    const hoje = deps.hoje(); const min = minutosSP();
    const r = await enviarAlertasUrgentes(deps.consultar, itens, deps.enviar(), hoje, min, (f, t) => { if (st) { st.feito = t + f; st.total = Math.max(1, t * 2); } });
    if (st) st.fase = "Conferindo se cada vencimento gerou aviso";
    return resumoTexto(r, { ...(await conferirAlertasUrgentes(deps.consultar, itens, hoje, min)), semChave: !pushConfiguradoContabil() });
  };
  const rodadas = new Map<string, Progresso>();
  app.post("/api/alerta-urgente/rodar-agora", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const s = deps.sessao(req); if (!s) return res.status(401).json({ sucesso: false });
    const atual = rodadas.get(s.tenantId);
    if (atual && !atual.fim && Date.now() - atual.inicio < 10 * 60_000) return res.json({ sucesso: true, jaRodando: true, progresso: atual });
    const st: Progresso = { inicio: Date.now(), fase: "Começando", feito: 0, total: 1 }; rodadas.set(s.tenantId, st);
    const cnpjs = cnpjsDa(s);
    void rodar(cnpjs, st).then((t) => { st.resultado = t; st.fase = "Pronto"; st.feito = st.total; }).catch((e) => { st.erro = String(e?.message || e).slice(0, 200); st.fase = "Falhou"; }).finally(() => { st.fim = Date.now(); });
    return res.json({ sucesso: true, progresso: st });
  });
  app.get("/api/alerta-urgente/rodar-agora", mw.exigirSessao, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const s = deps.sessao(req); if (!s) return res.status(401).json({ sucesso: false });
    return res.json({ sucesso: true, progresso: rodadas.get(s.tenantId) || null });
  });
  return { rodarRobo: () => rodar(undefined) };
}
