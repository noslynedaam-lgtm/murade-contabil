// Cadastro de empresa por foto/arquivo (27/11/2026): leitura do XML, conferência da leitura da IA, mesclagem com a Receita e MEI.
// Dados fictícios (CNPJs de teste com dígito verificador válido).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cnpjValidoCadastro, lerXmlParaCadastro, interpretarRespostaIA, montarFicha, prepararFicha, dadosLidosDe, linhasDaFicha, cnpjDoTexto,
  validarArquivoCadastro, type DadosReceitaCadastro,
} from '../../src/server/cadastroPorDocumento';

const receitaBase = (extra: Partial<DadosReceitaCadastro> = {}): DadosReceitaCadastro => ({
  cnpj: '11222333000181', razao_social: 'PADARIA PAO BOM LTDA', nome_fantasia: 'PAO BOM', cnae_fiscal: '1091102', cnae_fiscal_descricao: 'Fabricação de produtos de padaria',
  uf: 'GO', municipio: 'GOIANIA', bairro: 'SETOR CENTRAL', descricao_tipo_de_logradouro: 'RUA', logradouro: '10', numero: '100', cep: '74000000',
  descricao_situacao_cadastral: 'ATIVA', data_inicio_atividade: '2020-01-15', ddd_telefone_1: '6232221111', email: 'contato@paobom.com.br',
  opcao_pelo_mei: false, opcao_pelo_simples: true, fonte: 'BrasilAPI', ...extra,
});

const XML_NFE = `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe52" versao="4.00">
<emit><CNPJ>11222333000181</CNPJ><xNome>PADARIA PAO BOM LTDA</xNome><xFant>PAO BOM</xFant><enderEmit><xLgr>RUA 10</xLgr><nro>100</nro><xBairro>SETOR CENTRAL</xBairro><cMun>5208707</cMun><xMun>Goiânia</xMun><UF>GO</UF><CEP>74000000</CEP><fone>6232221111</fone></enderEmit><IE>101234567</IE><IM>98765</IM><CNAE>1091102</CNAE><CRT>1</CRT></emit>
<dest><CNPJ>45723174000110</CNPJ><xNome>MERCADO &amp; CIA LTDA</xNome><enderDest><xLgr>AV GOIAS</xLgr><nro>5</nro><xBairro>CENTRO</xBairro><xMun>ANAPOLIS</xMun><UF>GO</UF><CEP>75000000</CEP></enderDest><indIEDest>9</indIEDest><email>compras@mercado.com.br</email></dest>
</infNFe></NFe></nfeProc>`;

test('CNPJ com dígito verificador (numérico e alfanumérico)', () => {
  assert.equal(cnpjValidoCadastro('11.222.333/0001-81'), true);
  assert.equal(cnpjValidoCadastro('11.222.333/0001-80'), false);
  assert.equal(cnpjValidoCadastro('12ABC34501DE35'), true);
  assert.equal(cnpjValidoCadastro('00000000000000'), false);
  assert.equal(cnpjDoTexto('Murad, cadastra o CNPJ 11.222.333/0001-81 como MEI'), '11222333000181');
});

test('XML de NF-e: lê emitente e destinatário sem IA, com CRT, IE, IM e endereço', () => {
  const x = lerXmlParaCadastro(XML_NFE);
  assert.equal(x.emitente?.campos.cnpj, '11222333000181');
  assert.equal(x.emitente?.campos.inscricaoEstadual, '101234567');
  assert.equal(x.emitente?.campos.inscricaoMunicipal, '98765');
  assert.equal(x.emitente?.campos.cnae, '1091-1/02');
  assert.equal(x.emitente?.campos.cep, '74000-000');
  assert.equal(x.emitente?.campos.telefone, '(62) 3222-1111');
  assert.equal(x.emitente?.simples, true);
  assert.equal(x.emitente?.origem, 'xml');
  assert.equal(x.destinatario?.campos.razaoSocial, 'MERCADO & CIA LTDA');
  assert.equal(x.destinatario?.campos.email, 'compras@mercado.com.br');
  // Consumidor com CPF não vira empresa.
  const soCpf = lerXmlParaCadastro(XML_NFE.replace('<CNPJ>45723174000110</CNPJ>', '<CPF>12345678909</CPF>'));
  assert.equal(soCpf.destinatario, null);
});

test('XML com dois lados: pede para escolher; com o lado escolhido, monta a ficha conferida na Receita', async () => {
  const deps = { consultarReceita: async (c: string) => (c === '11222333000181' ? { ok: true, dados: receitaBase() } : { ok: false, mensagem: 'não achou' }) };
  const arquivo = { nome: 'nota.xml', mimeType: 'text/xml', dadosBase64: Buffer.from(XML_NFE).toString('base64') };
  const r1 = await prepararFicha(deps, { arquivo });
  assert.ok(r1.ok && 'escolherLado' in r1 && r1.escolherLado.length === 2);
  const r2 = await prepararFicha(deps, { arquivo, lado: 'emitente' });
  assert.ok(r2.ok && 'ficha' in r2);
  const f = (r2 as any).ficha;
  assert.equal(f.receita.conferida, true);
  assert.equal(f.campos.regime.valor, 'Simples Nacional');
  assert.equal(f.campos.inscricaoEstadual.valor, '101234567');
  assert.equal(f.campos.inscricaoEstadual.origem, 'xml');
  assert.equal(f.campos.razaoSocial.origem, 'receita');
  assert.equal(f.campos.cidade.conferir, false, 'Goiânia x GOIANIA é a mesma cidade (sem acento)');
  assert.equal(f.pronta, true);
});

test('Foto lida pela IA: campo com dúvida e campo fora do formato ficam "conferir"; Receita vence e aponta divergência', () => {
  const { principal } = interpretarRespostaIA('```json\n' + JSON.stringify({
    tipoDocumento: 'cartao_cnpj', cnpj: '11.222.333/0001-81', razaoSocial: 'PADARIA PAO BOM LTDA', nomeFantasia: 'PAO BOM', cnae: '1091-1/02',
    inscricaoEstadual: '10.123.456-7', cep: '7400000', uf: 'GO', cidade: 'Goiania', email: 'contato@paobom', duvidas: ['inscricaoEstadual'], socios: [{ nome: 'JOSE FICTICIO', qualificacao: 'Sócio-Administrador', cpf: '111' }],
  }) + '\n```');
  const f = montarFicha(principal, receitaBase({ nome_fantasia: 'PAO BOM PADARIA' }));
  assert.equal(f.campos.inscricaoEstadual.conferir, true);
  assert.equal(f.campos.inscricaoEstadual.valor, '101234567');
  assert.equal(f.campos.cep.valor, '74000-000', 'CEP veio da Receita');
  assert.equal(f.campos.cep.conferir, true, 'o CEP lido estava incompleto: marca para conferir');
  assert.equal(f.campos.email.valor, 'contato@paobom.com.br');
  assert.equal(f.campos.nomeFantasia.valor, 'PAO BOM PADARIA');
  assert.equal(f.campos.nomeFantasia.conferir, true);
  assert.match(String(f.campos.nomeFantasia.motivo), /Receita/);
  assert.equal(f.campos.titular.valor, 'JOSE FICTICIO');
  assert.ok(!JSON.stringify(f.socios).includes('111'), 'CPF não é guardado');
  assert.ok(f.paraConferir >= 3);
  assert.ok(linhasDaFicha(f).some((l) => /Inscrição estadual: 101234567 \(conferir/.test(l)));
});

test('MEI: CCMEI + Receita com SIMEI = MEI; CCMEI sem SIMEI na Receita = conferir (nunca chuta)', () => {
  const ccmei = dadosLidosDe({ tipoDocumento: 'ccmei', cnpj: '45723174000110', razaoSocial: 'MARIA FICTICIA 12345678909' });
  const rMei = receitaBase({ cnpj: '45723174000110', razao_social: 'MARIA FICTICIA 12345678909', opcao_pelo_mei: true, opcao_pelo_simples: true });
  const f1 = montarFicha(ccmei, rMei);
  assert.equal(f1.campos.regime.valor, 'MEI');
  assert.equal(f1.campos.regime.conferir, false);
  assert.equal(f1.mei, true);
  assert.equal(f1.campos.titular.valor, 'MARIA FICTICIA');
  const f2 = montarFicha(ccmei, { ...rMei, opcao_pelo_mei: false });
  assert.equal(f2.campos.regime.valor, 'Simples Nacional');
  assert.equal(f2.campos.regime.conferir, true);
  const f3 = montarFicha(ccmei, { ...rMei, opcao_pelo_mei: false, opcao_pelo_simples: false });
  assert.equal(f3.campos.regime.valor, '');
  assert.equal(f3.campos.regime.conferir, true);
});

test('Pedido por texto ("cadastra o CNPJ ... como MEI"): busca na Receita e, com o SIMEI lá, fica MEI', async () => {
  const deps = { consultarReceita: async () => ({ ok: true, dados: receitaBase({ opcao_pelo_mei: true }) }) };
  const r = await prepararFicha(deps, { cnpj: '11.222.333/0001-81', mei: true });
  assert.ok(r.ok && 'ficha' in r);
  assert.equal((r as any).ficha.campos.regime.valor, 'MEI');
  assert.equal((r as any).ficha.campos.razaoSocial.valor, 'PADARIA PAO BOM LTDA');
});

test('Receita fora do ar: usa o documento e marca tudo "conferir" com aviso', async () => {
  const lidos = dadosLidosDe({ cnpj: '11222333000181', razaoSocial: 'PADARIA PAO BOM LTDA', uf: 'GO', mei: true });
  const r = await prepararFicha({ consultarReceita: async () => ({ ok: false, mensagem: 'As consultas públicas não responderam' }) }, { lidos });
  const f = (r as any).ficha;
  assert.equal(f.receita.conferida, false);
  assert.equal(f.campos.razaoSocial.conferir, true);
  assert.equal(f.campos.regime.valor, 'MEI');
  assert.equal(f.campos.regime.conferir, true);
  assert.ok(f.avisos.some((a: string) => /Não deu para conferir na Receita/.test(a)));
});

test('CNPJ lido errado não consulta a Receita e avisa; situação não ativa vira aviso', async () => {
  let consultou = false;
  const r = await prepararFicha({ consultarReceita: async () => { consultou = true; return { ok: false }; } }, { lidos: { cnpj: '11222333000180', razaoSocial: 'X' } });
  assert.equal(consultou, false);
  assert.equal((r as any).ficha.campos.cnpj.conferir, true);
  assert.equal((r as any).ficha.pronta, false);
  const f = montarFicha(dadosLidosDe({ cnpj: '11222333000181' }), receitaBase({ descricao_situacao_cadastral: 'BAIXADA' }));
  assert.ok(f.avisos.some((a) => /BAIXADA/.test(a)));
});

test('Foto sem IA configurada e arquivo inválido: mensagens claras, nada é lido', async () => {
  const r = await prepararFicha({ consultarReceita: async () => ({ ok: false }) }, { arquivo: { mimeType: 'image/jpeg', dadosBase64: 'AAAA' } });
  assert.equal(r.ok, false);
  assert.equal(validarArquivoCadastro({ mimeType: 'application/zip', dadosBase64: 'AAAA' }).ok, false);
  assert.equal(validarArquivoCadastro({ nome: 'nota.XML', mimeType: '', dadosBase64: 'AAAA' }).ok, true);
});

test('DANFE em foto com destinatário: pede para escolher o lado (emitente ou destinatário)', async () => {
  const resposta = JSON.stringify({ tipoDocumento: 'nota_fiscal', cnpj: '11222333000181', razaoSocial: 'PADARIA PAO BOM LTDA', destinatario: { cnpj: '45723174000110', razaoSocial: 'MERCADO & CIA LTDA' } });
  const deps = { lerComIA: async () => resposta, consultarReceita: async () => ({ ok: false }) };
  const r = await prepararFicha(deps, { arquivo: { mimeType: 'image/jpeg', dadosBase64: 'AAAA' } });
  assert.ok(r.ok && 'escolherLado' in r);
  const dest = (r as any).escolherLado.find((l: any) => l.lado === 'destinatario');
  const r2 = await prepararFicha(deps, { lidos: dest.lidos });
  assert.equal((r2 as any).ficha.cnpj, '45723174000110');
});

test('Murad: argumentos da Agente viram "lidos"; anexo XML vira texto; completar só o vazio', async () => {
  const { lidosDosArgumentos, soVazios, lerAnexoDoPedidoAgente } = await import('../../src/server/agenteCadastroEmpresa');
  const l = lidosDosArgumentos({ cnpj: '11222333000181', tipoDocumento: 'ccmei', mei: true, razaoSocial: ' MARIA ', socios: 'JOSE (Sócio-Administrador); ANA', duvidas: 'cep, inscricaoEstadual', inventado: 'x' });
  assert.equal(l.tipoDocumento, 'ccmei'); assert.equal(l.mei, true); assert.equal(l.razaoSocial, 'MARIA');
  assert.deepEqual(l.socios, [{ nome: 'JOSE', qualificacao: 'Sócio-Administrador' }, { nome: 'ANA', qualificacao: '' }]);
  assert.deepEqual(l.duvidas, ['cep', 'inscricaoEstadual']);
  assert.equal('inventado' in l, false);
  assert.deepEqual(soVazios({ razaoSocial: 'A', email: '', cidade: 'Não informada' }, { razaoSocial: 'B', email: 'e@x.com.br', cidade: 'GOIANIA' }), { email: 'e@x.com.br', cidade: 'GOIANIA' });
  const x = lerAnexoDoPedidoAgente({ mimeType: 'text/xml', dadosBase64: Buffer.from('<nfeProc/>').toString('base64') });
  assert.ok(x.ok && x.textoXml.includes('<nfeProc/>') && !x.anexo);
  assert.equal(lerAnexoDoPedidoAgente({ mimeType: 'application/zip', dadosBase64: 'AAAA' }).ok, false);
});
