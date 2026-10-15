/** Download helper used for clearly labeled local drafts. */
export function baixarArquivoTexto(
  nomeArquivo: string,
  conteudo: string,
  tipoMime = "text/plain;charset=utf-8",
): void {
  const blob = new Blob([conteudo], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
