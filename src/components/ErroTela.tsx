// @ts-nocheck — tipos do React indisponíveis no ambiente de verificação; a classe é padrão do React.
import React, { Component, type ReactNode } from "react";

/** Evita tela branca: se uma aba der erro, mostra o aviso e deixa a pessoa trocar de aba ou tentar de novo, sem perder a sessão. */
export class ErroTela extends Component<{ chave?: string; children: ReactNode }, { erro: Error | null }> {
  state = { erro: null as Error | null };
  static getDerivedStateFromError(erro: Error) { return { erro }; }
  componentDidUpdate(anterior: { chave?: string }) {
    if (this.state.erro && anterior.chave !== this.props.chave) this.setState({ erro: null });
  }
  componentDidCatch(erro: Error) { console.error("[Contábil] Erro de tela:", erro); }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
        <strong className="block">Esta aba encontrou um erro e foi interrompida.</strong>
        <span className="mt-1 block break-words font-mono text-xs">{this.state.erro.message}</span>
        <span className="mt-1 block text-xs">O restante do sistema continua funcionando: escolha outra aba no menu ou tente de novo.</span>
        <button type="button" onClick={() => this.setState({ erro: null })} className="mt-3 cursor-pointer rounded bg-rose-700 px-3 py-1.5 text-xs font-bold text-white">Tentar de novo</button>
      </div>
    );
  }
}
