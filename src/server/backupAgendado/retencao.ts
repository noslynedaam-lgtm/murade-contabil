// Retenção dos backups do escritório (regra pura, igual nos três sistemas Murade).
//  - Guarda os N backups COMPLETOS mais novos que deram certo (N escolhido pelo escritório; padrão 3).
//  - Os "só alterações" ficam em rodízio pelos últimos D dias (padrão 7) e só enquanto o completo em que se baseiam
//    continuar guardado (sem a base eles não restauram).
//  - A cópia de segurança feita sozinha antes de uma restauração fica 7 dias a mais, fora da conta dos N.
//  - Tentativas que falharam não têm arquivo; o registro (data, quem, resultado) continua no relatório.
// No servidor do Murade guarda no máximo LIMITE_SERVIDOR completos (o escritório pode guardar mais na nuvem dele).

export const LIMITE_SERVIDOR = 5;
export const DIAS_COPIA_ANTES_RESTAURAR = 7;

export interface ItemRetencao { id: string; tipo: 'completo' | 'alteracoes'; status: 'executando' | 'ok' | 'falha'; iniciadoEm: string; baseId: string | null; origem: string }

/** Devolve os ids que devem SAIR (apagar o arquivo); os demais ficam. */
export function idsParaRemover(itens: ItemRetencao[], completosGuardar: number, diasAlteracoes: number, agora: Date): string[] {
  const ok = itens.filter((i) => i.status === 'ok').sort((a, b) => Date.parse(b.iniciadoEm) - Date.parse(a.iniciadoEm));
  const ficam = new Set<string>();
  const limiteCopia = agora.getTime() - DIAS_COPIA_ANTES_RESTAURAR * 86_400_000;
  let completos = 0;
  for (const i of ok) {
    if (i.tipo !== 'completo') continue;
    if (i.origem === 'antes_restaurar' && Date.parse(i.iniciadoEm) >= limiteCopia) { ficam.add(i.id); continue; }
    if (completos < Math.max(1, completosGuardar)) { ficam.add(i.id); completos += 1; }
  }
  const limiteAlteracoes = agora.getTime() - Math.max(1, diasAlteracoes) * 86_400_000;
  for (const i of ok) {
    if (i.tipo !== 'alteracoes') continue;
    if (i.baseId && ficam.has(i.baseId) && Date.parse(i.iniciadoEm) >= limiteAlteracoes) ficam.add(i.id);
  }
  return itens.filter((i) => i.status !== 'executando' && !ficam.has(i.id)).map((i) => i.id);
}
