// Cliente mínimo de armazenamento compatível com S3 (Backblaze B2, Cloudflare R2, Wasabi, AWS), sem dependências:
// assinatura AWS SigV4, envio em partes (multipart) a partir de um fluxo, leitura em fluxo, listagem e exclusão.
// Nenhuma mensagem de erro daqui inclui chaves, cabeçalhos de autorização ou a URL assinada.
import { createHash, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';

export interface ConfigS3 { endpoint: string; bucket: string; accessKey: string; secretKey: string; region: string }
export interface ObjetoS3 { chave: string; tamanho: number; modificadoEm: Date }

export class ErroS3 extends Error {
  constructor(mensagem: string, readonly status?: number, readonly codigo?: string) { super(mensagem); this.name = 'ErroS3'; }
}

export const TAMANHO_PARTE = 8 * 1024 * 1024;
const sha256Hex = (d: Buffer | string) => createHash('sha256').update(d).digest('hex');
const hmac = (k: Buffer | string, d: string) => createHmac('sha256', k).update(d).digest();
const codificar = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export function normalizarEndpoint(endpoint: string, region: string): URL {
  let bruto = (endpoint || '').trim();
  if (!bruto) bruto = `https://s3.${region.trim()}.amazonaws.com`;
  if (!/^https?:\/\//i.test(bruto)) bruto = `https://${bruto}`;
  const url = new URL(bruto);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('O endereço do destino do backup precisa começar com https://.');
  return url;
}

/** Assinatura AWS Signature V4. `caminho` já vem codificado; `consulta` são os pares ainda sem codificar. */
export function assinarSigV4(p: {
  metodo: string; host: string; caminho: string; consulta?: Record<string, string>; cabecalhos?: Record<string, string>;
  hashCorpo: string; accessKey: string; secretKey: string; region: string; agora: Date; servico?: string;
}): Record<string, string> {
  const servico = p.servico || 's3';
  const amzData = p.agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dia = amzData.slice(0, 8);
  const cab: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.cabecalhos || {})) cab[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ');
  cab.host = p.host;
  cab['x-amz-content-sha256'] = p.hashCorpo;
  cab['x-amz-date'] = amzData;
  const nomes = Object.keys(cab).sort();
  const cabCanonicos = nomes.map((n) => `${n}:${cab[n]}\n`).join('');
  const consultaCanonica = Object.entries(p.consulta || {}).map(([k, v]) => [codificar(k), codificar(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
  const canonica = [p.metodo.toUpperCase(), p.caminho, consultaCanonica, cabCanonicos, nomes.join(';'), p.hashCorpo].join('\n');
  const escopo = `${dia}/${p.region}/${servico}/aws4_request`;
  const aAssinar = ['AWS4-HMAC-SHA256', amzData, escopo, sha256Hex(canonica)].join('\n');
  const kData = hmac('AWS4' + p.secretKey, dia);
  const chaveAssinatura = hmac(hmac(hmac(kData, p.region), servico), 'aws4_request');
  const assinatura = createHmac('sha256', chaveAssinatura).update(aAssinar).digest('hex');
  return { ...cab, authorization: `AWS4-HMAC-SHA256 Credential=${p.accessKey}/${escopo}, SignedHeaders=${nomes.join(';')}, Signature=${assinatura}` };
}

const desescapar = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (xml: string, nome: string) => { const m = xml.match(new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`)); return m ? desescapar(m[1]) : undefined; };

export class ClienteS3 {
  private base: URL;
  constructor(private cfg: ConfigS3, private leitor: typeof fetch = fetch, private agora: () => Date = () => new Date(), private esperar: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {
    this.base = normalizarEndpoint(cfg.endpoint, cfg.region);
  }

  private caminho(chave?: string): string {
    const prefixoBase = this.base.pathname.replace(/\/+$/, '');
    const partes = [codificar(this.cfg.bucket), ...(chave ? chave.split('/').map(codificar) : [])];
    return `${prefixoBase}/${partes.join('/')}${chave === undefined ? '/' : ''}`.replace(/\/{2,}/g, '/');
  }

  private limpar(texto: string): string {
    let t = texto;
    for (const s of [this.cfg.secretKey, this.cfg.accessKey]) if (s) t = t.split(s).join('***');
    return t.slice(0, 300);
  }

  private async chamar(metodo: string, chave: string | undefined, o: { consulta?: Record<string, string>; corpo?: Buffer; cabecalhos?: Record<string, string>; tentativas?: number; fluxo?: boolean } = {}): Promise<Response> {
    const corpo = o.corpo ?? Buffer.alloc(0);
    const tentativas = o.tentativas ?? 4;
    let ultimo: unknown;
    for (let t = 0; t < tentativas; t++) {
      try {
        const caminho = this.caminho(chave);
        const cab = assinarSigV4({ metodo, host: this.base.host, caminho, consulta: o.consulta, cabecalhos: o.cabecalhos, hashCorpo: sha256Hex(corpo), accessKey: this.cfg.accessKey, secretKey: this.cfg.secretKey, region: this.cfg.region, agora: this.agora() });
        const qs = Object.entries(o.consulta || {}).map(([k, v]) => `${codificar(k)}=${codificar(v)}`).join('&');
        const { host: _h, ...enviar } = cab;
        const resp = await this.leitor(`${this.base.protocol}//${this.base.host}${caminho}${qs ? `?${qs}` : ''}`, { method: metodo, headers: enviar, body: corpo.length ? new Uint8Array(corpo) : undefined });
        if (resp.status >= 500 || resp.status === 429) {
          const texto = await resp.text().catch(() => '');
          ultimo = new ErroS3(`O destino do backup respondeu com erro temporário (HTTP ${resp.status}${tag(texto, 'Code') ? ': ' + tag(texto, 'Code') : ''}).`, resp.status, tag(texto, 'Code'));
        } else return resp;
      } catch (erro: any) {
        ultimo = erro instanceof ErroS3 ? erro : new ErroS3(`Não consegui falar com o destino do backup (${this.limpar(String(erro?.cause?.code || erro?.message || 'falha de rede'))}).`);
      }
      if (t < tentativas - 1) await this.esperar(500 * 2 ** t);
    }
    throw ultimo;
  }

  private async exigirOk(resp: Response, acao: string): Promise<string> {
    const texto = await resp.text().catch(() => '');
    if (resp.status >= 200 && resp.status < 300) return texto;
    const codigo = tag(texto, 'Code');
    const msg = tag(texto, 'Message');
    throw new ErroS3(this.limpar(`Falha ao ${acao} no destino do backup (HTTP ${resp.status}${codigo ? `: ${codigo}` : ''}${msg ? ` — ${msg}` : ''}).`), resp.status, codigo);
  }

  async enviar(chave: string, corpo: Buffer, tipo = 'application/octet-stream'): Promise<void> {
    await this.exigirOk(await this.chamar('PUT', chave, { corpo, cabecalhos: { 'content-type': tipo } }), 'gravar o arquivo');
  }

  async tamanho(chave: string): Promise<number | null> {
    const resp = await this.chamar('HEAD', chave);
    if (resp.status === 404) return null;
    await this.exigirOk(resp, 'consultar o arquivo');
    const n = Number(resp.headers.get('content-length'));
    return Number.isFinite(n) ? n : null;
  }

  async ler(chave: string): Promise<{ fluxo: Readable; tamanho: number | null }> {
    const resp = await this.chamar('GET', chave);
    if (resp.status === 404) throw new ErroS3('Arquivo de backup não encontrado no destino.', 404, 'NoSuchKey');
    if (!(resp.status >= 200 && resp.status < 300) || !resp.body) await this.exigirOk(resp, 'baixar o arquivo');
    const n = Number(resp.headers.get('content-length'));
    return { fluxo: Readable.fromWeb(resp.body as any), tamanho: Number.isFinite(n) && n > 0 ? n : null };
  }

  async lerTexto(chave: string): Promise<string | null> {
    const resp = await this.chamar('GET', chave);
    if (resp.status === 404) { await resp.text().catch(() => ''); return null; }
    return this.exigirOk(resp, 'baixar o arquivo');
  }

  async apagar(chave: string): Promise<void> {
    const resp = await this.chamar('DELETE', chave);
    if (resp.status === 404) { await resp.text().catch(() => ''); return; }
    await this.exigirOk(resp, 'apagar o arquivo antigo');
  }

  async listar(prefixo: string): Promise<ObjetoS3[]> {
    const saida: ObjetoS3[] = [];
    let token: string | undefined;
    for (let pagina = 0; pagina < 200; pagina++) {
      const consulta: Record<string, string> = { 'list-type': '2', prefix: prefixo };
      if (token) consulta['continuation-token'] = token;
      const xml = await this.exigirOk(await this.chamar('GET', undefined, { consulta }), 'listar os arquivos');
      for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const chave = tag(m[1], 'Key'); if (!chave) continue;
        saida.push({ chave, tamanho: Number(tag(m[1], 'Size') || 0), modificadoEm: new Date(tag(m[1], 'LastModified') || 0) });
      }
      if (tag(xml, 'IsTruncated') === 'true' && tag(xml, 'NextContinuationToken')) token = tag(xml, 'NextContinuationToken'); else break;
    }
    return saida;
  }

  /** Envia o fluxo inteiro (em partes de 8 MB quando grande) e devolve tamanho e SHA-256 do que foi enviado. */
  async enviarFluxo(chave: string, origem: AsyncIterable<Buffer>, tipo = 'application/octet-stream'): Promise<{ tamanho: number; sha256: string }> {
    const hash = createHash('sha256');
    let total = 0;
    let acumulado: Buffer[] = [];
    let acumuladoTam = 0;
    let uploadId: string | null = null;
    const etags: string[] = [];
    const enviarParte = async (dados: Buffer) => {
      if (!uploadId) {
        const xml = await this.exigirOk(await this.chamar('POST', chave, { consulta: { uploads: '' }, cabecalhos: { 'content-type': tipo } }), 'iniciar o envio');
        uploadId = tag(xml, 'UploadId') || null;
        if (!uploadId) throw new ErroS3('O destino não devolveu o identificador do envio em partes.');
      }
      const n = etags.length + 1;
      const resp = await this.chamar('PUT', chave, { consulta: { partNumber: String(n), uploadId }, corpo: dados });
      await this.exigirOk(resp, `enviar a parte ${n}`);
      const etag = resp.headers.get('etag');
      if (!etag) throw new ErroS3(`O destino não confirmou a parte ${n} (sem ETag).`);
      etags.push(etag);
    };
    try {
      for await (const pedaco of origem) {
        hash.update(pedaco); total += pedaco.length;
        acumulado.push(pedaco); acumuladoTam += pedaco.length;
        while (acumuladoTam >= TAMANHO_PARTE) {
          const tudo = Buffer.concat(acumulado, acumuladoTam);
          await enviarParte(tudo.subarray(0, TAMANHO_PARTE));
          const resto = tudo.subarray(TAMANHO_PARTE);
          acumulado = resto.length ? [Buffer.from(resto)] : []; acumuladoTam = resto.length;
        }
      }
      const final = Buffer.concat(acumulado, acumuladoTam);
      if (!uploadId) {
        await this.enviar(chave, final, tipo);
      } else {
        if (final.length) await enviarParte(final);
        const corpoXml = `<CompleteMultipartUpload>${etags.map((e, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${e.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
        const xml = await this.exigirOk(await this.chamar('POST', chave, { consulta: { uploadId }, corpo: Buffer.from(corpoXml), cabecalhos: { 'content-type': 'application/xml' } }), 'concluir o envio');
        if (/<Error>/.test(xml)) throw new ErroS3(this.limpar(`O destino não concluiu o envio (${tag(xml, 'Code') || 'erro'}).`), 200, tag(xml, 'Code'));
      }
      return { tamanho: total, sha256: hash.digest('hex') };
    } catch (erro) {
      if (uploadId) await this.chamar('DELETE', chave, { consulta: { uploadId }, tentativas: 1 }).then((r) => r.text()).catch(() => undefined);
      throw erro;
    }
  }
}
