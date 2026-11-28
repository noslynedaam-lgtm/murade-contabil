// Consulta dos dados cadastrais públicos de um CNPJ (cartão CNPJ) para preencher o cadastro da empresa.
// Em 23/11/2026 a única fonte usada (BrasilAPI) respondeu com erro para um CNPJ novo e a contadora ficou sem os dados: agora, se a
// primeira fonte falha, o servidor tenta a seguinte (ReceitaWS e CNPJ.ws), cada uma com tempo limite curto. Só "não encontrado" de
// TODAS as que responderam vira 404; qualquer outra falha vira 502 com a lista do que foi tentado. Nada é gravado aqui.

export interface DadosCnpjFormulario {
  cnpj: string; razao_social: string; nome_fantasia: string; cnae_fiscal: string; cnae_fiscal_descricao: string; uf: string; municipio: string;
  bairro: string; descricao_tipo_de_logradouro: string; logradouro: string; numero: string; cep: string; descricao_situacao_cadastral: string;
  data_inicio_atividade: string; ddd_telefone_1: string; email: string; opcao_pelo_mei: boolean; opcao_pelo_simples: boolean; fonte: string;
}
type Buscar = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;
export interface ResultadoConsultaCnpj { ok: boolean; dados?: DadosCnpjFormulario; status?: 404 | 502; mensagem?: string; tentativas: string[] }

const so = (v: unknown) => String(v ?? '').trim();
const digitos = (v: unknown) => so(v).replace(/\D/g, '');
const dataIso = (v: unknown) => { const t = so(v); const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t); return br ? `${br[3]}-${br[2]}-${br[1]}` : /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : ''; };
const simNao = (v: unknown) => v === true || /^sim$/i.test(so(v));

interface Fonte { nome: string; url: (cnpj: string) => string; ler: (d: any, cnpj: string) => DadosCnpjFormulario | null; naoAchou?: (status: number, d: any) => boolean }

export const FONTES_CNPJ: Fonte[] = [
  {
    nome: 'BrasilAPI', url: (c) => `https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(c)}`,
    ler: (d, cnpj) => (so(d?.razao_social) ? {
      cnpj, razao_social: so(d.razao_social), nome_fantasia: so(d.nome_fantasia), cnae_fiscal: digitos(d.cnae_fiscal), cnae_fiscal_descricao: so(d.cnae_fiscal_descricao),
      uf: so(d.uf).toUpperCase(), municipio: so(d.municipio), bairro: so(d.bairro), descricao_tipo_de_logradouro: so(d.descricao_tipo_de_logradouro), logradouro: so(d.logradouro),
      numero: so(d.numero), cep: digitos(d.cep), descricao_situacao_cadastral: so(d.descricao_situacao_cadastral), data_inicio_atividade: dataIso(d.data_inicio_atividade),
      ddd_telefone_1: digitos(d.ddd_telefone_1), email: so(d.email).toLowerCase(), opcao_pelo_mei: d.opcao_pelo_mei === true, opcao_pelo_simples: d.opcao_pelo_simples === true, fonte: 'BrasilAPI',
    } : null),
    naoAchou: (status) => status === 404,
  },
  {
    nome: 'ReceitaWS', url: (c) => `https://receitaws.com.br/v1/cnpj/${encodeURIComponent(c)}`,
    ler: (d, cnpj) => (d?.status !== 'ERROR' && so(d?.nome) ? {
      cnpj, razao_social: so(d.nome), nome_fantasia: so(d.fantasia), cnae_fiscal: digitos(d.atividade_principal?.[0]?.code), cnae_fiscal_descricao: so(d.atividade_principal?.[0]?.text),
      uf: so(d.uf).toUpperCase(), municipio: so(d.municipio), bairro: so(d.bairro), descricao_tipo_de_logradouro: '', logradouro: so(d.logradouro),
      numero: so(d.numero), cep: digitos(d.cep), descricao_situacao_cadastral: so(d.situacao), data_inicio_atividade: dataIso(d.abertura),
      ddd_telefone_1: digitos(String(d.telefone || '').split('/')[0]), email: so(d.email).toLowerCase(), opcao_pelo_mei: d.simei?.optante === true, opcao_pelo_simples: d.simples?.optante === true, fonte: 'ReceitaWS',
    } : null),
    naoAchou: (status, d) => status === 404 || (d?.status === 'ERROR' && /inv[aá]lido|n[aã]o (encontrado|existe)|rejeitado/i.test(so(d?.message))),
  },
  {
    nome: 'CNPJ.ws', url: (c) => `https://publica.cnpj.ws/cnpj/${encodeURIComponent(c)}`,
    ler: (d, cnpj) => {
      const e = d?.estabelecimento || {};
      if (!so(d?.razao_social)) return null;
      return {
        cnpj, razao_social: so(d.razao_social), nome_fantasia: so(e.nome_fantasia), cnae_fiscal: digitos(e.atividade_principal?.id ?? e.atividade_principal?.subclasse), cnae_fiscal_descricao: so(e.atividade_principal?.descricao),
        uf: so(e.estado?.sigla).toUpperCase(), municipio: so(e.cidade?.nome), bairro: so(e.bairro), descricao_tipo_de_logradouro: so(e.tipo_logradouro), logradouro: so(e.logradouro),
        numero: so(e.numero), cep: digitos(e.cep), descricao_situacao_cadastral: so(e.situacao_cadastral), data_inicio_atividade: dataIso(e.data_inicio_atividade),
        ddd_telefone_1: digitos(`${so(e.ddd1)}${so(e.telefone1)}`), email: so(e.email).toLowerCase(), opcao_pelo_mei: simNao(d.simples?.mei), opcao_pelo_simples: simNao(d.simples?.simples), fonte: 'CNPJ.ws',
      };
    },
    naoAchou: (status) => status === 404,
  },
];

export async function consultarCnpjPublico(cnpj: string, buscar: Buscar = fetch as any, fontes: Fonte[] = FONTES_CNPJ, tempoMs = 6000): Promise<ResultadoConsultaCnpj> {
  const tentativas: string[] = []; let naoAcharam = 0; let responderam = 0;
  for (const f of fontes) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), tempoMs);
    try {
      const r = await buscar(f.url(cnpj), { signal: ctrl.signal, headers: { Accept: 'application/json', 'User-Agent': 'MuradFiscal/1.0 (consulta cadastral)' } });
      const d = await r.json().catch(() => null);
      if (r.ok) { const dados = f.ler(d, cnpj); if (dados) return { ok: true, dados, tentativas }; }
      responderam += 1;
      if (f.naoAchou?.(r.status, d)) { naoAcharam += 1; tentativas.push(`${f.nome}: não encontrou`); }
      else tentativas.push(`${f.nome}: HTTP ${r.status}`);
    } catch (e: any) { tentativas.push(`${f.nome}: ${e?.name === 'AbortError' ? 'demorou demais' : 'sem resposta'}`); }
    finally { clearTimeout(t); }
  }
  if (responderam > 0 && naoAcharam === responderam) return { ok: false, status: 404, mensagem: 'Nenhuma consulta pública encontrou este CNPJ. Confira o número ou preencha os dados à mão.', tentativas };
  return { ok: false, status: 502, mensagem: `As consultas públicas de CNPJ não responderam agora (${tentativas.join('; ')}). Preencha a razão social e salve: o resto dá para completar depois.`, tentativas };
}
