// Dias úteis federais (sábado, domingo e feriados NACIONAIS, inclui Sexta-feira Santa e, desde 2024, 20 de novembro — Lei 14.759/2023).
// Mesma regra do Murade Fiscal (src/utils/prazosFederais.ts de lá). Feriado estadual/municipal não entra: confira no Sicalc.
function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function feriadosNacionais(ano: number): Set<string> {
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];
  if (ano >= 2024) fixos.push("11-20");
  const s = new Set(fixos.map((x) => `${ano}-${x}`));
  const sexta = pascoa(ano); sexta.setUTCDate(sexta.getUTCDate() - 2); s.add(iso(sexta));
  return s;
}
export function ehDiaUtil(d: Date): boolean { const w = d.getUTCDay(); return w !== 0 && w !== 6 && !feriadosNacionais(d.getUTCFullYear()).has(iso(d)); }
/** Último dia útil do mês (mes 1-12). */
export function ultimoDiaUtilDoMes(ano: number, mes: number): string { const d = new Date(Date.UTC(ano, mes, 0)); while (!ehDiaUtil(d)) d.setUTCDate(d.getUTCDate() - 1); return iso(d); }
/** N-ésimo dia útil depois de uma data (exclusive). */
export function diaUtilDepois(data: string, n: number): string { const d = new Date(`${data}T00:00:00Z`); let c = 0; while (c < n) { d.setUTCDate(d.getUTCDate() + 1); if (ehDiaUtil(d)) c += 1; } return iso(d); }
