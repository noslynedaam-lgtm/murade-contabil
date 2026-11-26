// Rotas do histórico guardado (exercícios antigos fora do documento da empresa). Mesmo acesso das rotas da escrituração: o CNPJ
// tem de ser da sessão; quem só lê consulta, mas não guarda nem traz de volta. A Agente IA usa estas rotas (ação com cartão).
import type express from "express";
import { acessoEmpresa, erroHttp } from "./escrituracaoRotas";
import { conferirHistoricoEmpresa, ErroHistorico, guardarExerciciosNoHistorico, trazerExercicioDeVolta } from "./historicoLancamentos";
import { lerExercicioDoHistorico, prepararTabelaHistorico, resumoHistorico } from "./historicoLancamentosStore";
import type { BancoTransacional, ConsultaSql } from "./exclusaoEmpresaCascata";
import { conferirEmpresaMigrada } from "./migracaoSistemaAnterior/banco";

type Mw = (req: express.Request, res: express.Response, next: express.NextFunction) => unknown;

export function registrarRotasHistoricoContabil(app: express.Express, deps: { exigirOrigemNavegador: Mw; exigirSessaoContabil: Mw; consultar: ConsultaSql; banco: () => BancoTransacional; validar: (p: Record<string, unknown>) => boolean }): void {
  const { exigirOrigemNavegador: origem, exigirSessaoContabil: sessaoMw, consultar } = deps;
  const falha = (res: express.Response, e: any, padrao: string) => (e instanceof ErroHistorico ? res.status(e.status).json({ sucesso: false, motivo: e.message }) : erroHttp(res, e, padrao));
  const payloadDe = async (cnpj: string) => (await consultar("SELECT payload FROM contabil_company_workspaces WHERE cnpj=$1", [cnpj])).rows[0]?.payload || null;

  // Anos guardados (contagens) e a marca do documento. Só lê.
  app.get("/api/workspaces/:cnpj/historico", sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    try {
      await prepararTabelaHistorico(consultar);
      const p = await payloadDe(a.cnpj);
      res.json({ sucesso: true, cnpj: a.cnpj, marcador: p?.historicoArquivado ?? null, ...(await resumoHistorico(consultar, a.cnpj)) });
    } catch (e) { falha(res, e, "Não foi possível ler o histórico guardado agora."); }
  });
  // Um exercício guardado: saldo transportado até o fim do ano anterior + os lançamentos do ano (para os relatórios). Só lê.
  app.get("/api/workspaces/:cnpj/historico/ano/:ano", sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    const ano = Number(req.params.ano);
    if (!Number.isInteger(ano) || ano < 1900 || ano > 2999) { res.status(400).json({ sucesso: false, motivo: "Ano inválido." }); return; }
    try {
      await prepararTabelaHistorico(consultar);
      const p = await payloadDe(a.cnpj);
      const corte = String(p?.historicoArquivado?.ateCompetencia || "");
      if (!corte || `${ano}-01` > corte) { res.status(404).json({ sucesso: false, motivo: `O exercício de ${ano} não está no histórico guardado desta empresa.` }); return; }
      const r = await lerExercicioDoHistorico(consultar, a.cnpj, ano, Array.isArray(p.contas) ? p.contas : []);
      res.json({ sucesso: true, cnpj: a.cnpj, ano, ...r });
    } catch (e) { falha(res, e, "Não foi possível ler este exercício do histórico agora."); }
  });
  // Conferência: histórico x saldo transportado x marca; e, se a empresa veio do sistema anterior, o balancete por conta e mês
  // (documento + histórico) x backup. Só lê.
  app.get("/api/workspaces/:cnpj/historico/conferencia", sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    try {
      await prepararTabelaHistorico(consultar);
      const historico = await conferirHistoricoEmpresa(consultar, a.cnpj);
      const migracao = await conferirEmpresaMigrada(consultar, a.cnpj).catch(() => null);
      res.json({ sucesso: true, cnpj: a.cnpj, historico, migracao: migracao ? { bate: migracao.bate, resumo: migracao.resumo, contasConferidas: migracao.contasConferidas, competenciasConferidas: migracao.competenciasConferidas, lancamentos: migracao.lancamentosNoMurade, diferencas: migracao.diferencas.slice(0, 20) } : null });
    } catch (e) { falha(res, e, "Não foi possível conferir o histórico agora."); }
  });
  // Guardar exercícios antigos (o escritório escolhe até que ano) e trazer o último de volta. Segunda confirmação na tela.
  app.post("/api/workspaces/:cnpj/historico/guardar", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    if (req.body?.confirmado !== true) { res.status(400).json({ sucesso: false, motivo: "Confirme antes de guardar os exercícios no histórico." }); return; }
    try { res.json({ sucesso: true, ...(await guardarExerciciosNoHistorico(deps.banco(), a.cnpj, Number(req.body?.ateAno), a.sessao.login, deps.validar)) }); }
    catch (e) { falha(res, e, "Não foi possível guardar os exercícios agora; nada foi alterado."); }
  });
  app.post("/api/workspaces/:cnpj/historico/trazer-de-volta", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    if (req.body?.confirmado !== true) { res.status(400).json({ sucesso: false, motivo: "Confirme antes de trazer o exercício de volta." }); return; }
    try { res.json({ sucesso: true, ...(await trazerExercicioDeVolta(deps.banco(), a.cnpj, a.sessao.login, deps.validar)) }); }
    catch (e) { falha(res, e, "Não foi possível trazer o exercício de volta agora; nada foi alterado."); }
  });
}
