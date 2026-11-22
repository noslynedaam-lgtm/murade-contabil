// Frase que a caixinha "Pedir para alguém" (tela inicial) manda para a Agente IA. A Agente usa a ferramenta delegar_tarefa,
// a mesma da voz e do chat flutuante; a permissão de pedir a OUTRA pessoa é conferida no servidor, não aqui.
export function montarFraseParaAgente(texto: string, administrador: boolean): string {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!t) return '';
  return administrador ? t : `Anote uma tarefa só para mim (não é para outra pessoa): ${t}`;
}
export const rotuloCaixaPedir = (administrador: boolean) => (administrador
  ? { titulo: 'Pedir para alguém', dica: 'Ex.: pedir para o funcionário conciliar o banco da empresa', botao: 'Pedir' }
  : { titulo: 'Anotar tarefa para mim', dica: 'Ex.: conciliar o banco da empresa X até sexta', botao: 'Anotar' });
