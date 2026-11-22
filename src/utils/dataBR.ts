// Datas no padrão brasileiro (dd/mm/aaaa) na tela, guardando AAAA-MM-DD como sempre.
// Usado pelo CampoData: o <input type="date"> do navegador mostra "mm/dd/yyyy" quando o navegador está em inglês.

/** Só os dígitos, com as barras no lugar: "01022026" -> "01/02/2026" (aceita digitação parcial). */
export function mascararDataBR(texto: string): string {
  const d = String(texto || '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "AAAA-MM-DD" (ou "AAAA-MM-DDTHH:MM...") -> "dd/mm/aaaa"; vazio ou fora do formato -> "". */
export function isoParaBR(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** "dd/mm/aaaa" -> "AAAA-MM-DD" só quando a data existe de verdade (31/02 não passa); senão null. */
export function brParaISO(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br || '').trim());
  if (!m) return null;
  const dia = Number(m[1]); const mes = Number(m[2]); const ano = Number(m[3]);
  if (ano < 1000 || mes < 1 || mes > 12 || dia < 1) return null;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  if (dia > ultimo) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Competência: "112026" -> "11/2026" (parcial aceito). */
export function mascararMesBR(texto: string): string {
  const d = String(texto || '').replace(/\D/g, '').slice(0, 6);
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
}

/** "AAAA-MM" (ou "AAAA-MM-DD") -> "mm/aaaa"; senão "". */
export function isoMesParaBR(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[2]}/${m[1]}` : '';
}

/** "mm/aaaa" -> "AAAA-MM" quando o mês é válido; senão null. */
export function brParaISOMes(br: string): string | null {
  const m = /^(\d{2})\/(\d{4})$/.exec(String(br || '').trim());
  if (!m) return null;
  const mes = Number(m[1]);
  if (mes < 1 || mes > 12 || Number(m[2]) < 1000) return null;
  return `${m[2]}-${m[1]}`;
}
