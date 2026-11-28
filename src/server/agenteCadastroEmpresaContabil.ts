// "Murad, cadastra essa empresa" no Contábil: vincula o CNPJ ao escritório (/api/auth/companies) e grava a ficha conferida no
// cadastro da empresa (/api/empresas/cadastro-pela-ficha: nova ganha o workspace; existente só tem os campos vazios completados).
// Depois do salvar, o cadastro vai sozinho ao Fiscal e, de lá, ao DP.
import { criarFerramentasCadastroEmpresa } from "./agenteCadastroEmpresa";
import { erroApi, ok } from "./agenteMotor";
import { fichaParaContabil } from "./sincroniaCadastroContabil";

export { INSTRUCAO_CADASTRO_EMPRESA } from "./agenteCadastroEmpresa";
const so = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export const FERRAMENTAS_CADASTRO_EMPRESA_CONTABIL = criarFerramentasCadastroEmpresa({
  sistema: "contabil",
  async buscarExistente(ctx, cnpj) {
    const r = await ctx.chamarApi("GET", "/api/workspaces");
    if (!ok(r)) return null;
    return (r.corpo?.empresas || []).find((e: any) => so(e.cnpj) === cnpj) ?? null;
  },
  async salvar(ctx, ficha, existente) {
    if (!existente) {
      const a = await ctx.chamarApi("POST", "/api/auth/companies", { cnpj: ficha.cnpj });
      if (!ok(a)) return { sucesso: false, mensagem: erroApi(a).erro };
    }
    const r = await ctx.chamarApi("POST", "/api/empresas/cadastro-pela-ficha", { cnpj: ficha.cnpj, empresa: fichaParaContabil(ficha) });
    if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
    const n = Array.isArray(r.corpo?.preenchidos) ? r.corpo.preenchidos.length : 0;
    const nome = ficha.campos.razaoSocial.valor;
    if (existente) return { sucesso: true, mensagem: n ? `Cadastro da ${nome} completado (${n} campo(s) que estavam vazios). Já vai para o Fiscal e o DP.` : `A ${nome} já tinha todos esses campos preenchidos; nada foi trocado.` };
    return { sucesso: true, mensagem: `Empresa ${nome} cadastrada no Contábil${ficha.mei ? " como MEI" : ""}, com o plano de contas padrão. Já vai para o Fiscal e o DP.${ficha.paraConferir ? ` Confira os ${ficha.paraConferir} campo(s) marcados em Cadastro de Empresa.` : ""}` };
  },
});
