export interface EmpresaMuradeMigracao {
  id?: string; cnpj: string; razaoSocial: string; nomeFantasia?: string; uf?: string; cidade?: string; municipio?: string;
  regimeTributario?: string; regime?: string; inscricaoEstadual?: string; inscricaoMunicipal?: string; endereco?: string; cep?: string;
  configuracaoFiscal?: { seriesEmissao?: Array<{ serie: string; ultimoNumeroEmitido: string }>; modelosDocumento?: string[]; fontesEntrada?: string[]; fontesSaida?: string[]; identificadorEmissor?: string };
  certificado?: { nomeArquivo?: string; validade?: string; tipo?: string }; departamentos?: string[]; fpas?: string; aliquotaRat?: string;
}
const FORMATO = 'murade-company-migration';
export function baixarPacoteEmpresasMurade(empresas: EmpresaMuradeMigracao[]): void {
  const blob = new Blob([JSON.stringify({ formato: FORMATO, versao: 1, exportadoEm: new Date().toISOString(), empresas }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `murade-empresas-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
}
export async function lerPacoteEmpresasMurade(arquivo: File): Promise<EmpresaMuradeMigracao[]> {
  if (arquivo.size > 20 * 1024 * 1024) throw new Error('O pacote excede o limite de 20 MB.');
  const pacote = JSON.parse(await arquivo.text());
  if (pacote?.formato !== FORMATO || pacote?.versao !== 1 || !Array.isArray(pacote.empresas)) throw new Error('Arquivo Murade inválido ou versão não suportada.');
  const empresas = pacote.empresas as EmpresaMuradeMigracao[];
  if (!empresas.length) throw new Error('O pacote não contém empresas.');
  const invalidas = empresas.filter((e) => !e?.cnpj?.trim() || !e?.razaoSocial?.trim());
  if (invalidas.length) throw new Error(`${invalidas.length} cadastro(s) sem CNPJ ou razão social.`);
  return empresas;
}
