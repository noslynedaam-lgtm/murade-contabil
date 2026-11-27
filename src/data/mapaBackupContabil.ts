// Mapa do backup do sistema anterior → Murad Contábil (versionado no código; sem dado de cliente). A fonte é o MESMO catálogo que a
// importação e o conferidor campo a campo usam (DESTINO_COLUNAS em camposSistemaAnterior.ts): coluna → campo do Contábil, "consulta"
// (fica no registro do sistema anterior, por empresa, como veio: o cofre do backup do Contábil) ou "não vem" (com o motivo).
//  • REGRAS_007_CONTABIL: o que o Agente 007 confere depois de cada migração e onde a mesma regra já roda na importação.
//  • O registro do sistema anterior fica CIFRADO em repouso; coluna por coluna, o que não tem campo vai para o cofre do backup do Agente 007
//    (murad_007_cofre, cifrado, isolado por escritório, com tabela/coluna e registro de origem).
//  • IMPLANTAVEIS_CONTABIL: coluna que era "consulta" e ganhou campo (no cadastro da empresa, fora de competência). Ao pôr a linha aqui, a
//    versão do mapa muda e o 007 implanta do cofre, só onde está vazio, com a fonte "007: do backup (tabela.coluna)" (vazio por enquanto).
import { DESTINO_COLUNAS, TABELAS_FORA } from '../server/migracaoSistemaAnterior/camposSistemaAnterior';

export interface Regra007 { id: string; tabelas: string; regra: string; fonte: string; naImportacao: string; o007: string }
export const REGRAS_007_CONTABIL: Regra007[] = [
  { id: 'completar', tabelas: 'wphd.empresa, wcont.* (cadastro, títulos, cartões, lançamentos automáticos)', regra: 'campo vazio no Contábil que o registro do sistema anterior tem é completado, sem sobrescrever e fora de competência fechada', fonte: 'próprio backup (registro guardado da empresa)', naImportacao: 'gravação da empresa (mesmo conversor) e completarPayloadDoRegistro', o007: 'completa sozinho logo depois da gravação e conta os campos' },
  { id: 'balancete', tabelas: 'wcont.mv#####, wcont.sd#####', regra: 'balancete do Murad = saldos do sistema anterior (conta a conta, mês a mês)', fonte: 'próprio backup; ITG 2000 (escrituração contábil)', naImportacao: 'conferência no fim da gravação de cada empresa', o007: 'confere de novo com tudo gravado; o que não bate vira ponto para conferir' },
  { id: 'campo_a_campo', tabelas: 'todas as colunas com destino "campo"', regra: 'o que estava preenchido no backup e tem campo no Contábil tem de estar lá, igual', fonte: 'próprio backup', naImportacao: 'conferidor campo a campo (conferirCamposMigrados)', o007: 'conta o que faltou ou veio diferente e leva à empresa › Migração' },
  { id: 'cofre', tabelas: 'colunas com destino "consulta" e colunas fora do catálogo', regra: 'dado sem campo no Contábil fica guardado como veio no registro da empresa, cifrado em repouso', fonte: 'próprio backup', naImportacao: 'registro do sistema anterior (cifrado) na gravação de cada empresa', o007: 'guarda coluna por coluna no cofre do backup (cifrado, por escritório); o dono vê no painel "Campos do backup sem lugar no Murad"; quando a coluna entra em IMPLANTAVEIS_CONTABIL, implanta onde estiver vazio (nunca em competência fechada)' },
];
/** `tabela` = bloco do registro (ou tabela do catálogo); `campo` = caminho dentro do cadastro da empresa (payload.empresa). */
export interface ImplantavelContabil { tabela: string; coluna: string; campo: string; rotulo: string }
export const IMPLANTAVEIS_CONTABIL: ImplantavelContabil[] = [];

export function versaoMapaBackupContabil(): string {
  const base = JSON.stringify(['cofre-por-coluna-v1', Object.entries(DESTINO_COLUNAS).map(([t, d]) => [t, d.bloco || '', d.padrao.tipo, Object.entries(d.colunas).map(([c, x]) => [c, x.tipo]).sort()]).sort(), TABELAS_FORA.map((t) => t.tabelas), IMPLANTAVEIS_CONTABIL]);
  let h1 = 0x811c9dc5; let h2 = 0x01000193;
  for (let i = 0; i < base.length; i++) { const c = base.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}
/** Colunas com destino "consulta" (guardadas só no registro) de uma tabela do catálogo — o painel do dono sugere o campo a partir daqui. */
export function colunasSoConsulta(tabelaOuBloco: string): Array<{ coluna: string; motivo: string }> {
  const d = DESTINO_COLUNAS[tabelaOuBloco] || Object.values(DESTINO_COLUNAS).find((x) => x.bloco === tabelaOuBloco); if (!d) return [];
  return Object.entries(d.colunas).filter(([, x]) => x.tipo === 'consulta').map(([c, x]) => ({ coluna: c, motivo: (x as any).motivo || '' }));
}
