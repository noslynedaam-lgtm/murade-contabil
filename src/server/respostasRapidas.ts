// Respostas imediatas (sem chamar IA externa) para dúvidas frequentes e estáveis.
// Conteúdo conferido em fontes públicas sobre a EC 132/2023 e a LC 214/2025 (alterada pela LC 227/2026).
// Valores e prazos específicos de cada empresa continuam dependendo da conferência do contador.

export interface RespostaRapida {
  reply: string;
  sources: { title: string; url: string }[];
}

const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const REFORMA: RespostaRapida = {
  reply: [
    "**Reforma Tributária do consumo — IBS e CBS em 2026**",
    "",
    "• **Base legal:** Emenda Constitucional nº 132/2023, regulamentada pela Lei Complementar nº 214/2025 (alterada pela LC nº 227/2026).",
    "• **O que são:** a **CBS** (federal) substituirá PIS e Cofins; o **IBS** (estados e municípios) substituirá ICMS e ISS. Também cria o Imposto Seletivo. Cobrança no destino, \"por fora\" do preço e com crédito amplo sobre as compras.",
    "• **2026 é ano de teste:** CBS de **0,9%** e IBS de **0,1%** destacados nos documentos fiscais. O valor é compensado com PIS/Cofins e, para quem cumpre as obrigações acessórias, o recolhimento é dispensado (LC 214/2025, art. 348). PIS, Cofins, ICMS, ISS e IPI continuam valendo normalmente.",
    "• **Documentos fiscais:** os campos de IBS/CBS são obrigatórios na NF-e, NFC-e e CT-e desde 03/08/2026 e na NFS-e desde 01/10/2026 (Ato Conjunto RFB/CGIBS nº 4/2026).",
    "• **Transição:** 2027 — CBS plena e fim de PIS/Cofins; 2029 a 2032 — troca gradual de ICMS e ISS pelo IBS; 2033 — transição completa.",
    "• **Simples Nacional e MEI:** continuam existindo; as regras de crédito e de opção pelo regime regular estão na LC 214/2025.",
    "",
    "⚠️ Orientação informativa. Confirme na legislação oficial e com o contador responsável antes de aplicar em uma empresa. Se quiser, me diga o regime e a UF da empresa e eu detalho o impacto.",
  ].join("\n"),
  sources: [
    { title: "Lei Complementar nº 214/2025 — Planalto", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm" },
    { title: "Portal Nacional da NF-e — Reforma Tributária", url: "https://www.nfe.fazenda.gov.br/" },
  ],
};

export function respostaRapida(mensagem: string): RespostaRapida | null {
  const t = normalizar(mensagem);
  const falaReforma = /\b(ibs|cbs)\b|reforma tributaria/.test(t);
  if (!falaReforma) return null;
  // Só responde na hora a perguntas gerais; perguntas específicas (cálculo, erro, empresa) seguem para a IA.
  const geral = /(como funciona|o que (e|sao)|explique|explica|resumo|entenda|me fale|fale sobre|qual (e )?(a )?(aliquota|data|prazo)|quando (comeca|entra))/.test(t);
  const especifica = /(calcul|rejei|erro|xml|cst|cclasstrib|simples nacional.*(credito|opcao)|minha empresa|essa empresa)/.test(t);
  return geral && !especifica && t.length < 160 ? REFORMA : null;
}
