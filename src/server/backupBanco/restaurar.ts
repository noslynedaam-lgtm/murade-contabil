// Restauração do backup completo (usada por scripts/restaurar-backup.ts). Só restaura em banco NOVO E VAZIO, depois de uma
// confirmação digitada (o nome do banco), e tudo em uma única transação: se algo falhar, o banco continua vazio.
import { Client } from 'pg';
import fs from 'node:fs';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream';
import { criarDecifrador } from './cripto';
import { contarObjetosDeUsuario, restaurarDump } from './dump';
import { ClienteS3, type ConfigS3 } from './s3';
import { dataDoObjeto } from './servico';

export interface OpcoesRestauracao {
  urlDestino: string;
  urlBancoDoSistema?: string;
  chave: string;
  arquivo?: string;
  s3?: { cfg: ConfigS3; sistema: string; objeto?: string };
  /** Pergunta ao operador; devolve o que ele digitou. */
  perguntar: (texto: string) => Promise<string>;
  /** Confirmação já informada por parâmetro (para uso sem teclado). */
  confirmacaoInformada?: string;
  escrever: (texto: string) => void;
  ssl?: any;
}

export const nomeDoBancoNaUrl = (url: string): string => { try { return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')) || ''; } catch { return ''; } };
export const descreverUrl = (url: string): string => { try { const u = new URL(url); return `${u.hostname}${u.port ? ':' + u.port : ''}/${nomeDoBancoNaUrl(url)}`; } catch { return '(endereço inválido)'; } };
const mesmoBanco = (a: string, b: string) => { try { const x = new URL(a); const y = new URL(b); return x.hostname === y.hostname && (x.port || '5432') === (y.port || '5432') && x.pathname === y.pathname; } catch { return a === b; } };

export async function restaurarBackup(o: OpcoesRestauracao): Promise<{ ok: boolean; mensagem: string; linhas?: number; tabelas?: number }> {
  if (!o.urlDestino) return { ok: false, mensagem: 'Informe o banco NOVO onde restaurar em DATABASE_URL_RESTAURAR.' };
  if (o.urlBancoDoSistema && mesmoBanco(o.urlDestino, o.urlBancoDoSistema)) return { ok: false, mensagem: 'O banco de destino é o mesmo banco do sistema (DATABASE_URL). Por segurança, restaure só em um banco novo e vazio.' };
  const nomeBanco = nomeDoBancoNaUrl(o.urlDestino);
  if (!nomeBanco) return { ok: false, mensagem: 'Não consegui ler o nome do banco no endereço de destino.' };
  const cliente = new Client({ connectionString: o.urlDestino, ssl: o.ssl });
  try { await cliente.connect(); } catch (e: any) { return { ok: false, mensagem: `Não consegui conectar no banco de destino (${String(e?.code || e?.message || 'erro').slice(0, 80)}).` }; }
  try {
    const existentes = await contarObjetosDeUsuario(cliente);
    if (existentes > 0) return { ok: false, mensagem: `O banco de destino NÃO está vazio (${existentes} tabela(s)/objeto(s)). Nada foi feito. Crie um banco novo e vazio e tente de novo.` };
    // Abre o backup antes de pedir a confirmação, para falhar cedo se a chave ou o arquivo estiverem errados.
    let origem: Readable; let descricaoOrigem: string;
    if (o.arquivo) { origem = fs.createReadStream(o.arquivo); descricaoOrigem = `arquivo ${o.arquivo}`; }
    else if (o.s3) {
      const s3 = new ClienteS3(o.s3.cfg);
      let objeto = o.s3.objeto;
      if (!objeto) {
        const prefixo = `${o.s3.sistema}/`;
        const todos = (await s3.listar(prefixo)).filter((x) => dataDoObjeto(prefixo, x.chave)).sort((a, b) => dataDoObjeto(prefixo, b.chave)!.getTime() - dataDoObjeto(prefixo, a.chave)!.getTime());
        if (!todos.length) return { ok: false, mensagem: 'Não há backup no destino para este sistema.' };
        objeto = todos[0].chave;
      }
      origem = (await s3.ler(objeto)).fluxo; descricaoOrigem = `destino S3, objeto ${objeto}`;
    } else return { ok: false, mensagem: 'Informe o backup: --arquivo <caminho> ou --objeto/--ultimo com as variáveis MURADE_BACKUP_S3_*.' };
    o.escrever(`Vou restaurar o backup (${descricaoOrigem}) no banco ${descreverUrl(o.urlDestino)}, que está vazio.`);
    const digitado = (o.confirmacaoInformada ?? await o.perguntar(`Para confirmar, digite o nome do banco de destino (${nomeBanco}): `)).trim();
    if (digitado !== nomeBanco) { origem.destroy(); return { ok: false, mensagem: 'Confirmação não confere. Nada foi feito.' }; }
    let ultimaTabela = '';
    // pipeline liga os erros de todas as etapas (arquivo, decifrar, descomprimir) ao último fluxo, que é o que o restaurador lê.
    const plano = createGunzip();
    pipeline(origem, criarDecifrador(o.chave), plano, () => undefined);
    const r = await restaurarDump(cliente, plano as AsyncIterable<Buffer>, (tabela, linhas) => { if (tabela !== ultimaTabela) { ultimaTabela = tabela; o.escrever(`  restaurando ${tabela}…`); } void linhas; });
    return { ok: true, mensagem: `Restauração concluída: ${Object.keys(r.tabelas).length} tabelas e ${r.totalLinhas} linhas.`, linhas: r.totalLinhas, tabelas: Object.keys(r.tabelas).length };
  } catch (e: any) {
    return { ok: false, mensagem: `Restauração falhou e o banco de destino foi mantido vazio: ${String(e?.message || e).replace(/postgres(ql)?:\/\/\S+/gi, 'postgres://***').slice(0, 300)}` };
  } finally { await cliente.end().catch(() => undefined); }
}
