// Criptografia em fluxo do backup completo do banco (formato MBK1).
//
// O arquivo é cifrado em blocos de 1 MB com AES-256-GCM, para nunca precisar carregar o backup inteiro na memória
// (o servidor tem 512 MB). A chave de cada arquivo é derivada de MURADE_BACKUP_CHAVE com scrypt e um sal aleatório
// próprio do arquivo; o número do bloco entra no nonce e a marca "último bloco" entra nos dados autenticados, então
// qualquer adulteração, reordenação ou corte do arquivo é detectado ao decifrar.
//
//   [ "MBK1" | sal (16) ] { [ tamanho (4, BE) | texto cifrado | etiqueta GCM (16) ] }...
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { Transform } from 'node:stream';

export const MAGIA_BACKUP = Buffer.from('MBK1');
export const TAMANHO_BLOCO = 1024 * 1024;
export const TAMANHO_MINIMO_CHAVE = 16;
const TAM_SAL = 16;
const TAM_ETIQUETA = 16;

export function chaveBackupValida(chave: string | undefined | null): chave is string {
  return typeof chave === 'string' && chave.trim().length >= TAMANHO_MINIMO_CHAVE;
}

function derivarChave(chave: string, sal: Buffer): Buffer {
  return scryptSync(chave.trim(), sal, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
}

function nonceDoBloco(indice: number): Buffer {
  const n = Buffer.alloc(12);
  n.writeBigUInt64BE(BigInt(indice), 4);
  return n;
}

const dadosAutenticados = (ultimo: boolean) => Buffer.from([ultimo ? 1 : 0]);

export function criarCifrador(chave: string): Transform {
  if (!chaveBackupValida(chave)) throw new Error(`A chave do backup precisa ter ao menos ${TAMANHO_MINIMO_CHAVE} caracteres.`);
  const sal = randomBytes(TAM_SAL);
  const k = derivarChave(chave, sal);
  let indice = 0;
  let pendente: Buffer = Buffer.alloc(0);
  let cabecalhoEnviado = false;
  const selar = (bloco: Buffer, ultimo: boolean): Buffer => {
    const c = createCipheriv('aes-256-gcm', k, nonceDoBloco(indice), { authTagLength: TAM_ETIQUETA });
    c.setAAD(dadosAutenticados(ultimo));
    const cifrado = Buffer.concat([c.update(bloco), c.final()]);
    const etiqueta = c.getAuthTag();
    indice += 1;
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(cifrado.length);
    return Buffer.concat([tam, cifrado, etiqueta]);
  };
  return new Transform({
    transform(pedaco: Buffer, _codificacao, cb) {
      try {
        if (!cabecalhoEnviado) { this.push(Buffer.concat([MAGIA_BACKUP, sal])); cabecalhoEnviado = true; }
        pendente = pendente.length ? Buffer.concat([pendente, pedaco]) : pedaco;
        // Só fecha um bloco quando ainda sobra dado depois dele: o último bloco é sempre o do flush.
        while (pendente.length > TAMANHO_BLOCO) {
          this.push(selar(pendente.subarray(0, TAMANHO_BLOCO), false));
          pendente = pendente.subarray(TAMANHO_BLOCO);
        }
        cb();
      } catch (erro) { cb(erro as Error); }
    },
    flush(cb) {
      try {
        if (!cabecalhoEnviado) { this.push(Buffer.concat([MAGIA_BACKUP, sal])); cabecalhoEnviado = true; }
        this.push(selar(pendente, true));
        pendente = Buffer.alloc(0);
        cb();
      } catch (erro) { cb(erro as Error); }
    },
  });
}

export function criarDecifrador(chave: string): Transform {
  if (!chaveBackupValida(chave)) throw new Error(`A chave do backup precisa ter ao menos ${TAMANHO_MINIMO_CHAVE} caracteres.`);
  let buffer: Buffer = Buffer.alloc(0);
  let k: Buffer | null = null;
  let indice = 0;
  let viuUltimo = false;
  const decifrarBloco = (cifrado: Buffer, etiqueta: Buffer): { texto: Buffer; ultimo: boolean } => {
    for (const ultimo of [false, true]) {
      try {
        const d = createDecipheriv('aes-256-gcm', k!, nonceDoBloco(indice), { authTagLength: TAM_ETIQUETA });
        d.setAAD(dadosAutenticados(ultimo));
        d.setAuthTag(etiqueta);
        return { texto: Buffer.concat([d.update(cifrado), d.final()]), ultimo };
      } catch { /* tenta a outra marca */ }
    }
    throw new Error('Não consegui decifrar o backup: a chave está errada ou o arquivo foi alterado ou corrompido.');
  };
  return new Transform({
    transform(pedaco: Buffer, _codificacao, cb) {
      try {
        buffer = buffer.length ? Buffer.concat([buffer, pedaco]) : pedaco;
        if (!k) {
          if (buffer.length < MAGIA_BACKUP.length + TAM_SAL) return cb();
          if (!buffer.subarray(0, MAGIA_BACKUP.length).equals(MAGIA_BACKUP)) throw new Error('Este arquivo não é um backup do Murad (formato desconhecido).');
          k = derivarChave(chave, buffer.subarray(MAGIA_BACKUP.length, MAGIA_BACKUP.length + TAM_SAL));
          buffer = buffer.subarray(MAGIA_BACKUP.length + TAM_SAL);
        }
        for (;;) {
          if (buffer.length < 4) break;
          const tam = buffer.readUInt32BE(0);
          if (tam > TAMANHO_BLOCO) throw new Error('Backup corrompido (bloco com tamanho inválido).');
          if (buffer.length < 4 + tam + TAM_ETIQUETA) break;
          if (viuUltimo) throw new Error('Backup corrompido (há dados depois do último bloco).');
          const cifrado = buffer.subarray(4, 4 + tam);
          const etiqueta = buffer.subarray(4 + tam, 4 + tam + TAM_ETIQUETA);
          const r = decifrarBloco(cifrado, etiqueta);
          indice += 1;
          viuUltimo = r.ultimo;
          buffer = buffer.subarray(4 + tam + TAM_ETIQUETA);
          if (r.texto.length) this.push(r.texto);
        }
        cb();
      } catch (erro) { cb(erro as Error); }
    },
    flush(cb) {
      if (!k) return cb(new Error('Backup vazio ou incompleto (sem cabeçalho).'));
      if (!viuUltimo || buffer.length) return cb(new Error('Backup incompleto: o arquivo foi cortado antes do fim.'));
      cb();
    },
  });
}
