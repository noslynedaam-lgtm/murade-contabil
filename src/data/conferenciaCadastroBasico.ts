// "Murad, confere a empresa X" (igual no Fiscal e no Contábil). Catálogo de conferidores do cadastro da empresa: o que confere,
// o campo, e se a correção é com OK ou só orientação. Correção com OK só quando o valor certo sai do próprio dado (CEP no formato
// dos Correios, espaços sobrando); sem fonte do valor certo, a Murad só aponta e nunca preenche por conta própria. Só confere campo que o cadastro TEM (campo ausente não vira erro).
// O DP tem, além destes, o RAT x CNAE com correção pelo piloto e o OK da pessoa no Salvar.

export interface AchadoCadastro { conferidor: string; campo: string; rotulo: string; texto: string; correcao: 'com_ok' | 'orientacao'; /** Só quando a correção é certa (com_ok). */ valorCerto?: string; fonte?: string }
export interface ConferidorCadastro { id: string; oQueConfere: string; campo: string; correcao: 'com_ok' | 'orientacao'; conferir(e: Record<string, any>): AchadoCadastro | null }

/** Dígitos verificadores do CNPJ (numérico e alfanumérico da IN RFB 2.229/2024: cada caractere vale o código ASCII menos 48). */
export function cnpjComDigitoCerto(v: unknown): boolean {
  const c = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{12}\d{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const val = (ch: string) => ch.charCodeAt(0) - 48;
  const dv = (n: number) => { const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i += 1) s += val(c[i]) * pesos[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
const tem = (e: Record<string, any>, k: string) => Object.prototype.hasOwnProperty.call(e, k);
const achado = (conferidor: string, campo: string, rotulo: string, texto: string): AchadoCadastro => ({ conferidor, campo, rotulo, texto, correcao: 'orientacao' });

export const CONFERIDORES_CADASTRO: ConferidorCadastro[] = [
  { id: 'cnpj_digito', oQueConfere: 'Dígitos verificadores do CNPJ', campo: 'cnpj', correcao: 'orientacao',
    conferir: (e) => (cnpjComDigitoCerto(e.cnpj) ? null : achado('cnpj_digito', 'cnpj', 'CNPJ', 'o CNPJ não confere nos dígitos verificadores; confira no cartão CNPJ da Receita')) },
  { id: 'razao_social', oQueConfere: 'Razão social preenchida', campo: 'razaoSocial', correcao: 'orientacao',
    conferir: (e) => (!tem(e, 'razaoSocial') || String(e.razaoSocial || '').trim().length >= 2 ? null : achado('razao_social', 'razaoSocial', 'Razão social', 'a razão social está vazia; copie do cartão CNPJ')) },
  { id: 'cnae_formato', oQueConfere: 'CNAE principal com os 7 dígitos da subclasse', campo: 'cnae', correcao: 'orientacao',
    conferir: (e) => (!tem(e, 'cnae') || String(e.cnae ?? '').replace(/\D/g, '').length === 7 ? null : achado('cnae_formato', 'cnae', 'CNAE principal', 'o CNAE principal está vazio ou incompleto (são 7 dígitos, ex.: 4120-4/00); confira no cartão CNPJ')) },
  { id: 'cep_formato', oQueConfere: 'CEP com 8 dígitos, no formato 00000-000', campo: 'cep', correcao: 'com_ok',
    conferir: (e) => {
      const bruto = String(e.cep ?? '').trim();
      if (!bruto) return null;
      const d = bruto.replace(/\D/g, '');
      if (d.length !== 8) return achado('cep_formato', 'cep', 'CEP', 'o CEP não tem 8 dígitos; confira nos Correios ou no cartão CNPJ');
      const certo = `${d.slice(0, 5)}-${d.slice(5)}`;
      // Os mesmos 8 dígitos, só no formato dos Correios: correção certa (não muda o número), com o OK da pessoa.
      return bruto === certo ? null : { conferidor: 'cep_formato', campo: 'cep', rotulo: 'CEP', correcao: 'com_ok', valorCerto: certo, fonte: 'formato dos Correios (00000-000)', texto: `o CEP está como "${bruto}"; no formato certo é ${certo}` };
    } },
  { id: 'razao_espacos', oQueConfere: 'Razão social sem espaços sobrando', campo: 'razaoSocial', correcao: 'com_ok',
    conferir: (e) => {
      if (!tem(e, 'razaoSocial')) return null;
      const r = String(e.razaoSocial || ''); const certo = r.replace(/\s+/g, ' ').trim();
      return !certo || certo === r ? null : { conferidor: 'razao_espacos', campo: 'razaoSocial', rotulo: 'Razão social', correcao: 'com_ok', valorCerto: certo, fonte: 'o próprio texto, sem os espaços sobrando', texto: 'a razão social tem espaços sobrando' };
    } },
  { id: 'uf_formato', oQueConfere: 'UF com a sigla do estado', campo: 'uf', correcao: 'orientacao',
    conferir: (e) => { const uf = String(e.uf ?? '').trim().toUpperCase(); return !uf || /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(uf) ? null : achado('uf_formato', 'uf', 'UF', 'a UF não é uma sigla de estado válida'); } },
];

export const conferirCadastro = (e: Record<string, any>): AchadoCadastro[] =>
  CONFERIDORES_CADASTRO.map((c) => { try { return c.conferir(e || {}); } catch { return null; } }).filter((a): a is AchadoCadastro => !!a);

export function resumoDaConferenciaCadastro(nome: string, achados: AchadoCadastro[]): string {
  if (!achados.length) return `Está tudo certo no cadastro da ${nome}.`;
  const n = achados.length;
  return `Achei ${n} ${n === 1 ? 'erro' : 'erros'} no cadastro da ${nome}: ${achados[0].texto}.${n > 1 ? ` E mais ${n - 1} na tela.` : ''} ${achados.some((a) => a.correcao === 'com_ok') ? 'Quer que eu corrija?' : 'Quer que eu te leve até o cadastro?'}`;
}
