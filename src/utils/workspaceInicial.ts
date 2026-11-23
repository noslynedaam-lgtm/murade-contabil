// Workspace inicial de uma empresa no Contábil: plano de contas padrão do Murade + mapeamentos de origem padrão.
// Usado pela tela (primeira abertura da empresa) e pelo servidor (empresa que chegou do Fiscal, do DP, da migração
// ou do cadastro manual e ainda não tem workspace), para as duas montarem exatamente o mesmo ponto de partida.
import type { ContaPlano } from "../types";
import { planoContasModelo } from "../data/planoContasModelo";
import { ordenarContasPorSequenciaNumerica } from "./planoContasUtils";
import { sugerirMapeamentosPadrao } from "./sugestoesContas";
import { adaptarPlanoParaEntidade, ehRegimeEntidade } from "./planoEntidade";

export function planoContasInicialContabil(): ContaPlano[] {
  return ordenarContasPorSequenciaNumerica(planoContasModelo);
}

/**
 * Monta o workspace vazio da empresa. O plano padrão do Murade é o mesmo para Simples, Presumido e Real
 * (o regime muda a forma de gerar os pré-lançamentos, não as contas). Nada é lançado em definitivo:
 * os pré-lançamentos que o robô preparar ficam "pendente de conferência" até uma pessoa aprovar.
 */
export function montarWorkspaceInicialContabil(empresa: Record<string, unknown>, agoraIso = new Date().toISOString()) {
  // Entidade sem finalidade de lucros: Patrimônio Social, superávit/déficit e as contas de doações, subvenções e gratuidades (ITG 2002).
  const contas = ehRegimeEntidade(empresa?.regime) ? ordenarContasPorSequenciaNumerica(adaptarPlanoParaEntidade(planoContasInicialContabil()).contas) : planoContasInicialContabil();
  return {
    empresa,
    contas,
    centrosCusto: [] as unknown[],
    bensImobilizado: [] as unknown[],
    mapeamentosOrigem: sugerirMapeamentosPadrao(contas, [], agoraIso),
    preLancamentos: [] as unknown[],
    lancamentos: [] as unknown[],
    livros: [] as unknown[],
    lembretes: [] as unknown[],
    historicosPadrao: [] as unknown[],
    lancamentosPadrao: [] as unknown[],
    regrasConciliacao: [] as unknown[],
  };
}

/** Cadastro básico vindo do Fiscal → campo "empresa" do workspace. Só leva campos preenchidos (a tela nunca perde o que a pessoa digitou). */
export function empresaInicialDoCadastro(cnpj: string, dados: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const empresa: Record<string, unknown> = { cnpj };
  for (const campo of ["razaoSocial", "nomeFantasia", "regime", "municipio", "uf", "cnae"]) {
    const valor = typeof dados?.[campo] === "string" ? String(dados[campo]).trim().slice(0, 240) : "";
    if (valor) empresa[campo] = valor;
  }
  empresa.certificadoAtivo = false;
  return empresa;
}
