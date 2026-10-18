import { getTextContent, parseXml, type XmlElement } from "@f-o-t/xml";

type DocumentoFiscal = Record<string, unknown>;
type CoberturaXml = {
  documentosAnalisados: number;
  documentosSemXmlCompleto: number;
  documentosXmlInvalido: number;
  itens: number;
  itensComCfop: number;
  itensComNcm: number;
  itensComCstIcmsOuCsosn: number;
  itensComCstPis: number;
  itensComCstCofins: number;
};

function filhos(elemento: XmlElement, nome: string): XmlElement[] {
  return elemento.children.filter((filho): filho is XmlElement => filho.type === "element" && filho.localName === nome);
}

function descendentes(elemento: XmlElement, nome: string): XmlElement[] {
  const encontrados: XmlElement[] = [];
  for (const filho of elemento.children) {
    if (filho.type !== "element") continue;
    if (filho.localName === nome) encontrados.push(filho);
    encontrados.push(...descendentes(filho, nome));
  }
  return encontrados;
}

function texto(elemento: XmlElement, nome: string): string {
  return descendentes(elemento, nome).map(getTextContent).find((valor) => valor.trim())?.trim() || "";
}

function temClassificacao(imposto: XmlElement | undefined, nomes: string[]): boolean {
  if (!imposto) return false;
  return nomes.some((nome) => descendentes(imposto, nome).some((item) => getTextContent(item).trim().length > 0));
}

/** Inspects only XML structure and field coverage; it never calculates tax due. */
export function resumirCoberturaXmlFiscal(documentos: DocumentoFiscal[]): CoberturaXml {
  const cobertura: CoberturaXml = {
    documentosAnalisados: 0,
    documentosSemXmlCompleto: 0,
    documentosXmlInvalido: 0,
    itens: 0,
    itensComCfop: 0,
    itensComNcm: 0,
    itensComCstIcmsOuCsosn: 0,
    itensComCstPis: 0,
    itensComCstCofins: 0,
  };

  for (const documento of documentos) {
    const xml = typeof documento.xmlOriginal === "string" ? documento.xmlOriginal : "";
    if (!xml || xml.length > 2_000_000) {
      cobertura.documentosSemXmlCompleto += 1;
      continue;
    }
    try {
      const root = parseXml(xml, { preserveComments: false, preserveProcessingInstructions: false }).root;
      if (!root || !["nfeProc", "NFe"].includes(root.localName)) throw new Error("Raiz NF-e ausente");
      const infNFe = descendentes(root, "infNFe")[0];
      const itens = infNFe ? descendentes(infNFe, "det") : [];
      if (!infNFe || !itens.length) throw new Error("NF-e sem itens");
      cobertura.documentosAnalisados += 1;
      for (const item of itens) {
        cobertura.itens += 1;
        const produto = descendentes(item, "prod")[0];
        const imposto = descendentes(item, "imposto")[0];
        if (produto && texto(produto, "CFOP")) cobertura.itensComCfop += 1;
        if (produto && texto(produto, "NCM")) cobertura.itensComNcm += 1;
        if (temClassificacao(imposto, ["CST", "CSOSN"])) cobertura.itensComCstIcmsOuCsosn += 1;
        const grupoPis = descendentes(imposto || item, "PIS")[0];
        if (temClassificacao(grupoPis, ["CST"])) cobertura.itensComCstPis += 1;
        const grupoCofins = descendentes(imposto || item, "COFINS")[0];
        if (temClassificacao(grupoCofins, ["CST"])) cobertura.itensComCstCofins += 1;
      }
    } catch {
      cobertura.documentosXmlInvalido += 1;
    }
  }
  return cobertura;
}

/** Do not send full source XML to the browser when only its coverage summary is needed. */
export function omitirXmlOriginal(documento: DocumentoFiscal): DocumentoFiscal {
  const { xmlOriginal: _xmlOriginal, ...resumo } = documento;
  return resumo;
}
