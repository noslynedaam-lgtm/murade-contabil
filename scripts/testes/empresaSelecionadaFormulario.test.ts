// Conferidor da regra do dono (27/11/2026): no cadastro da empresa, o que aparece embaixo é EXATAMENTE da empresa
// selecionada no topo, e os dados de duas empresas nunca se misturam. No Contábil o defeito era: "Editar Empresa" num
// cartão que não era o ativo abria o formulário de outra empresa com o topo parado; ao salvar, os dados dela eram
// MESCLADOS por cima da empresa ativa (ficavam campos contábeis da anterior junto com o CNPJ da nova), e trocar a
// empresa no topo não trocava o formulário. Este teste monta a tela de verdade (React Testing Library + jsdom).
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://contabil.murade.teste/', pretendToBeVisual: true });
const g = globalThis as any;
for (const chave of Object.getOwnPropertyNames(dom.window)) {
  if (chave in g) continue;
  try { g[chave] = (dom.window as any)[chave]; } catch { /* propriedade só de leitura */ }
}
const definir = (chave: string, valor: unknown) => Object.defineProperty(g, chave, { value: valor, configurable: true, writable: true });
definir('window', dom.window); definir('document', dom.window.document); definir('navigator', dom.window.navigator);
definir('localStorage', dom.window.localStorage); definir('sessionStorage', dom.window.sessionStorage);
g.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.scrollTo = (() => undefined) as any;
(dom.window.Element.prototype as any).scrollTo = () => undefined;
(dom.window.Element.prototype as any).scrollIntoView = () => undefined;
if (!dom.window.matchMedia) (dom.window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });

const A = { id: 'emp-11222333000181', cnpj: '11.222.333/0001-81', razaoSocial: 'MORAIS CONSTRUCOES LTDA', nomeFantasia: 'Morais Construções', regime: 'Simples Nacional', municipio: 'Goiânia', uf: 'GO', competencia: '2026-11', ibsAliquota: 0, cbsAliquota: 0, cnae: '', situacaoCadastral: 'ATIVA', certificadoAtivo: false, inscricaoEstadual: '101010' };
const B = { id: 'emp-45997418000153', cnpj: '45.997.418/0001-53', razaoSocial: 'MORAES ASSESSORIA CONTABIL LTDA', nomeFantasia: 'Moraes Assessoria', regime: 'Lucro Presumido', municipio: 'Goiânia', uf: 'GO', competencia: '2026-11', ibsAliquota: 0, cbsAliquota: 0, cnae: '', situacaoCadastral: 'ATIVA', certificadoAtivo: false, inscricaoEstadual: '202020' };
const chave = (c: unknown) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const fetchFalso = async (entrada: any) => {
  const url = String(typeof entrada === 'string' ? entrada : entrada?.url || '');
  if (url.includes('/api/workspaces')) return new Response(JSON.stringify({ sucesso: true, empresas: [A, B] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify({ sucesso: false }), { status: 404, headers: { 'Content-Type': 'application/json' } });
};
g.fetch = fetchFalso; (dom.window as any).fetch = fetchFalso;

test('Cadastro de Empresa (Contábil): formulário sempre da empresa do topo, sem misturar empresas, e trava ao salvar com CNPJ diferente', async () => {
  const React = await import('react');
  const { render, screen, fireEvent, waitFor, act, cleanup } = await import('@testing-library/react');
  const { EmpresaTab } = await import('../../src/components/tabs/EmpresaTab');
  const { initialEmpresa } = await import('../../src/data/mockData');
  const { ContextoAuthContabilParaTeste } = await import('../../src/components/ContabilAccessGate');
  const sessao = { usuario: 'contadora', cnpjs: [], memberships: [], administrador: false, sair: async () => undefined, atualizarAcesso: async () => undefined, abrirUsuarios: () => undefined, abrirSeguranca: () => undefined };
  dom.window.localStorage.setItem('murad_empresas_lista', JSON.stringify([A, B]));

  // Igual ao App: atualizar = mesclar na empresa ativa; trocar = substituir (nada da anterior fica junto).
  const topo: { atual: any; trocar: (e: any) => void } = { atual: null, trocar: () => undefined };
  const Moldura = () => {
    const [empresa, setEmpresa] = React.useState({ ...A, contasDisponibilidadesCodigo: ["1.1.1.01"] } as any);
    topo.atual = empresa;
    const trocar = (nova: any) => setEmpresa({ ...initialEmpresa, ...nova, certificadoAtivo: false });
    topo.trocar = trocar;
    return React.createElement(ContextoAuthContabilParaTeste.Provider, { value: sessao as any }, React.createElement(EmpresaTab, {
      empresa, cnpjsAutorizados: [chave(A.cnpj), chave(B.cnpj)], onAutorizarCnpj: async () => true,
      onUpdateEmpresa: (d: any) => setEmpresa((prev: any) => ({ ...prev, ...d })), onTrocarEmpresaAtiva: trocar,
    } as any));
  };
  const campoCnpj = () => document.querySelector('input[data-campo="empresa-cnpj"]') as HTMLInputElement;
  const campoRazao = () => document.querySelector('input[data-campo="empresa-razao-social"]') as HTMLInputElement;
  const salvar = () => document.querySelector('[data-campo="empresa-salvar"]') as HTMLButtonElement;
  const editarDo = (emp: typeof A) => {
    const cartao = screen.getAllByText(`CNPJ: ${emp.cnpj}`)[0].closest('div.p-4') as HTMLElement;
    return Array.from(cartao.querySelectorAll('button')).find((b) => b.textContent?.includes('Editar Empresa')) as HTMLButtonElement;
  };

  try {
    render(React.createElement(Moldura));
    await waitFor(() => assert.ok(editarDo(B)));

    // 1) "Editar Empresa" na MORAES com a MORAIS no topo: o topo passa a ser a MORAES, sem nada da MORAIS junto.
    await act(async () => { fireEvent.click(editarDo(B)); });
    assert.equal(chave(topo.atual.cnpj), chave(B.cnpj), 'Editar põe a empresa no topo');
    assert.equal(topo.atual.razaoSocial, B.razaoSocial);
    assert.equal(topo.atual.contasDisponibilidadesCodigo, undefined, 'nada da empresa anterior ficou misturado');
    assert.equal(chave(campoCnpj().value), chave(B.cnpj));
    assert.equal(campoRazao().value, B.razaoSocial);

    // 2) Troca a empresa no topo com o formulário aberto: o formulário passa a ser da nova empresa do topo.
    await act(async () => { topo.trocar(A); });
    await waitFor(() => { assert.equal(chave(campoCnpj().value), chave(A.cnpj)); assert.equal(campoRazao().value, A.razaoSocial); });

    // 3) Trava: com a MORAIS no topo, o CNPJ do formulário vira o da MORAES. Salvar não grava nada e avisa.
    const listaAntes = dom.window.localStorage.getItem('murad_empresas_lista');
    await act(async () => { fireEvent.change(campoCnpj(), { target: { value: B.cnpj } }); });
    await act(async () => { fireEvent.click(salvar()); });
    await waitFor(() => assert.ok(screen.getByText(/Nada foi salvo, para não gravar os dados de uma empresa em outra/)));
    assert.equal(chave(topo.atual.cnpj), chave(A.cnpj), 'o topo continua na MORAIS');
    assert.equal(topo.atual.razaoSocial, A.razaoSocial);
    assert.equal(dom.window.localStorage.getItem('murad_empresas_lista'), listaAntes, 'lista de empresas intacta');

    // 4) Com o CNPJ certo, salva na própria MORAIS (no lugar, sem trocar de empresa).
    await act(async () => { fireEvent.change(campoCnpj(), { target: { value: A.cnpj } }); });
    await act(async () => { fireEvent.change(campoRazao(), { target: { value: 'MORAIS CONSTRUCOES E REFORMAS LTDA' } }); });
    await act(async () => { fireEvent.click(salvar()); });
    await waitFor(() => assert.equal(topo.atual.razaoSocial, 'MORAIS CONSTRUCOES E REFORMAS LTDA'));
    assert.equal(chave(topo.atual.cnpj), chave(A.cnpj));
    const lista = JSON.parse(dom.window.localStorage.getItem('murad_empresas_lista') || '[]');
    assert.equal(lista.find((e: any) => chave(e.cnpj) === chave(B.cnpj))?.razaoSocial, B.razaoSocial, 'a MORAES não foi tocada');
    assert.equal(lista.find((e: any) => chave(e.cnpj) === chave(A.cnpj))?.razaoSocial, 'MORAIS CONSTRUCOES E REFORMAS LTDA');
  } finally {
    cleanup();
  }
});
