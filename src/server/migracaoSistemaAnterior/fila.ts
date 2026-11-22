// Fila das migrações pelo backup do sistema anterior: o servidor é compartilhado por todos os escritórios (512 MB), então só UMA
// leitura pesada (lista de empresas, prévia, gravação) roda por vez. Quem chega depois espera a vez e a tela mostra
// "sua migração começa em seguida (posição N)". Ninguém é derrubado: os pedidos normais das telas continuam respondendo,
// porque a migração cede a vez ao servidor entre um lote e outro (leitorDump.cederVez).

interface Pedido { id: string; comecar: () => void }

export class FilaMigracao {
  private espera: Pedido[] = [];
  private rodando: string | null = null;
  private rodandoDesde = 0;

  /** Roda `fn` quando chegar a vez de `id` (um por vez no servidor inteiro, na ordem de chegada). */
  entrar<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((ok, falha) => {
      const comecar = () => {
        this.rodando = id; this.rodandoDesde = Date.now();
        void (async () => { try { ok(await fn()); } catch (e) { falha(e); } finally { this.rodando = null; this.proximo(); } })();
      };
      this.espera.push({ id, comecar });
      if (!this.rodando) this.proximo();
    });
  }
  private proximo() {
    if (this.rodando) return;
    const p = this.espera.shift();
    if (p) p.comecar();
  }
  /** 0 = é a vez dela agora; N = há N na frente (a tela mostra "posição N"); null = não está na fila. */
  posicao(id: string): number | null {
    if (this.rodando === id) return 0;
    const i = this.espera.findIndex((p) => p.id === id);
    return i === -1 ? null : i + 1;
  }
  get ocupada(): boolean { return this.rodando !== null; }
  get aguardando(): number { return this.espera.length; }
  /** Há quanto tempo a migração da vez está rodando (para o aviso de quem espera). */
  get rodandoHaSegundos(): number { return this.rodando ? Math.round((Date.now() - this.rodandoDesde) / 1000) : 0; }
}

export const textoDaFila = (posicao: number | null) => (posicao && posicao > 0
  ? `Outro escritório está migrando agora. Sua migração começa em seguida (posição ${posicao} na fila). Pode deixar esta tela aberta: ela começa sozinha.`
  : '');
