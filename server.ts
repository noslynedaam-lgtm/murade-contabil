import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { timingSafeEqual } from "node:crypto";

dotenv.config();

let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    try {
      aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    } catch (e) {
      console.error("Erro ao inicializar GoogleGenAI:", e);
    }
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // API Health
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      system: "Murad Contábil",
      version: "2026.1",
      timestamp: new Date().toISOString(),
    });
  });

  // Authenticated server-to-server handshake used by Murade Fiscal.
  app.get("/api/integracao/fiscal/status", (req, res) => {
    const expected = process.env.MURADE_INTEGRATION_TOKEN;
    if (!expected) {
      return res.status(503).json({ conectado: false, motivo: "MURADE_INTEGRATION_TOKEN não configurado." });
    }

    const authorization = req.get("authorization") || "";
    const supplied = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(supplied);
    const autorizado = suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
    if (!autorizado) {
      return res.status(401).json({ conectado: false, motivo: "Credencial de integração inválida." });
    }

    return res.json({
      conectado: true,
      sistema: "Murade Contábil",
      integracao: "Murade Fiscal",
      dadosCompartilhados: false,
      timestamp: new Date().toISOString(),
    });
  });

  // Authenticated status handshake used by Murade Departamento Pessoal.
  app.get("/api/integracao/dp/status", (req, res) => {
    const expected = process.env.MURADE_INTEGRATION_TOKEN;
    if (!expected) {
      return res.status(503).json({ conectado: false, motivo: "MURADE_INTEGRATION_TOKEN não configurado." });
    }

    const authorization = req.get("authorization") || "";
    const supplied = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(supplied);
    const autorizado = suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
    if (!autorizado) {
      return res.status(401).json({ conectado: false, motivo: "Credencial de integração inválida." });
    }

    return res.json({
      conectado: true,
      sistema: "Murade Contábil",
      integracao: "Murade Departamento Pessoal",
      dadosCompartilhados: false,
      timestamp: new Date().toISOString(),
    });
  });

  // In-memory store for shared Murad companies across Fiscal, DP and Contábil
  let empresasMuradFiscal: Array<Record<string, any>> = [];


  // API de Integração Murad Fiscal: Listar empresas
  app.get("/api/integracao/fiscal/empresas", (req, res) => {
    res.json({
      origem: "MURAD FISCAL",
      status: "desconectado",
      total: empresasMuradFiscal.length,
      empresas: empresasMuradFiscal,
      timestamp: new Date().toISOString(),
    });
  });

  // API de Integração Murad Fiscal: Puxar empresa ativa
  app.get("/api/integracao/fiscal/empresa-ativa", (req, res) => {
    const empresa = empresasMuradFiscal[0] || null;
    if (!empresa) {
      return res.status(404).json({ error: "Nenhuma empresa cadastrada no Murad Fiscal." });
    }
    res.json({
      origem: "MURAD FISCAL",
      status: "desconectado",
      mensagem: "Empresa recuperada com sucesso do módulo Murad Fiscal.",
      empresa,
      timestamp: new Date().toISOString(),
    });
  });

  // API de Integração Murad Fiscal: Conectar e sincronizar
  app.post("/api/integracao/fiscal/conectar", (req, res) => {
    res.status(503).json({ error: "Integração com Murad Fiscal ainda não configurada. Nenhum documento foi sincronizado." });
  });

  // API de Integração Murad DP: Dados de folha e funcionários
  app.get("/api/integracao/dp/dados", (req, res) => {
    res.status(503).json({ error: "Integração com Murad DP ainda não configurada. Nenhum dado de folha foi importado." });
  });

  // API de Integração Murad DP: Conectar
  app.post("/api/integracao/dp/conectar", (req, res) => {
    res.status(503).json({ error: "Integração com Murad DP ainda não configurada. Nenhum evento do eSocial foi transmitido ou importado." });
  });

  // Escrita persistente exige autenticação, autorização por empresa e banco de dados.
  app.post("/api/integracao/empresas", (_req, res) => {
    res.status(503).json({ error: "Cadastro compartilhado indisponível. Não há autenticação nem banco de dados configurados." });
  });

  // API de Consulta CNPJ Real na Receita Federal (BrasilAPI + ReceitaWS como contingência)
  app.get("/api/receita/cnpj/:cnpj", async (req, res) => {
    const rawCnpj = (req.params.cnpj || "").replace(/\D/g, "");
    if (rawCnpj.length !== 14) {
      return res.status(400).json({ error: "CNPJ inválido. Informe 14 dígitos numéricos." });
    }

    try {
      // 1. Consulta primária: BrasilAPI (base oficial da Receita Federal)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6500);

      const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${rawCnpj}`, {
        signal: controller.signal,
        headers: { "User-Agent": "MuradContabil-RFB-Connector/2026.1" },
      });
      clearTimeout(timeout);

      if (resp.ok) {
        const d = await resp.json();
        const cleanCep = (d.cep || "").replace(/\D/g, "");
        const formattedCep = cleanCep.length === 8 ? `${cleanCep.slice(0, 5)}-${cleanCep.slice(5)}` : d.cep;
        const formattedCnpj = `${rawCnpj.slice(0, 2)}.${rawCnpj.slice(2, 5)}.${rawCnpj.slice(5, 8)}/${rawCnpj.slice(8, 12)}-${rawCnpj.slice(12)}`;

        // Determinar Regime Tributário
        // Capital social não determina Lucro Real ou Lucro Presumido.
        let regimeTributario = "Não informado pela consulta cadastral";
        if (d.opcao_pelo_mei) regimeTributario = "MEI (opção cadastral informada pela fonte)";
        else if (d.opcao_pelo_simples) regimeTributario = "Simples Nacional (opção cadastral informada pela fonte)";

        const dataAberturaFormatada = d.data_inicio_atividade
          ? d.data_inicio_atividade.split("-").reverse().join("/")
          : "Não informada";

        const dataSituacaoFormatada = d.data_situacao_cadastral
          ? d.data_situacao_cadastral.split("-").reverse().join("/")
          : "Não informada";

        const telefoneFormatado = d.ddd_telefone_1 ? `(${d.ddd_telefone_1.slice(0, 2)}) ${d.ddd_telefone_1.slice(2)}` : "";

        return res.json({
          cnpj: formattedCnpj,
          razaoSocial: d.razao_social || "",
          nomeFantasia: d.nome_fantasia || d.razao_social || "",
          situacao: d.descricao_situacao_cadastral || "ATIVA",
          dataSituacao: dataSituacaoFormatada,
          dataAbertura: dataAberturaFormatada,
          regimeTributario,
          naturezaJuridica: d.natureza_juridica || "",
          cnaePrincipal: `${d.cnae_fiscal || ""} - ${d.cnae_fiscal_descricao || ""}`,
          cnaesSecundarios: (d.cnaes_secundarios || []).map((c: any) => `${c.codigo} - ${c.descricao}`),
          capitalSocial: d.capital_social || 0,
          capitalSocialFormatado: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(d.capital_social || 0),
          endereco: {
            logradouro: d.logradouro || "",
            numero: d.numero || "",
            complemento: d.complemento || "",
            bairro: d.bairro || "",
            municipio: d.municipio || "",
            uf: d.uf || "",
            cep: formattedCep,
            completo: `${d.logradouro || ""}${d.numero ? ", " + d.numero : ""}${d.complemento ? " - " + d.complemento : ""}, ${d.bairro || ""}`,
          },
          contato: {
            telefone: telefoneFormatado,
            email: d.email ? d.email.toLowerCase() : "",
          },
          qsa: (d.qsa || []).map((socio: any) => ({
            nome: socio.nome_socio || socio.nome || "",
            qualificacao: socio.qualificacao_socio || socio.qualificacao || "Sócio / Administrador",
            faixaEtaria: socio.faixa_etaria || "",
          })),
          fonte: "BrasilAPI (consulta cadastral pública; validar com a Receita Federal)",
          timestamp: new Date().toISOString(),
        });
      }

      // 2. Contingência ReceitaWS se BrasilAPI falhar
      const controllerWs = new AbortController();
      const timeoutWs = setTimeout(() => controllerWs.abort(), 6500);
      const wsResp = await fetch(`https://receitaws.com.br/v1/cnpj/${rawCnpj}`, {
        signal: controllerWs.signal,
      });
      clearTimeout(timeoutWs);

      if (wsResp.ok) {
        const ws = await wsResp.json();
        if (ws.status !== "ERROR") {
          return res.json({
            cnpj: ws.cnpj || req.params.cnpj,
            razaoSocial: ws.nome || "",
            nomeFantasia: ws.fantasia || ws.nome || "",
            situacao: ws.situacao || "ATIVA",
            dataSituacao: ws.data_situacao || "",
            dataAbertura: ws.abertura || "",
            regimeTributario: ws.simples?.optante ? "Simples Nacional (opção cadastral informada pela fonte)" : "Não informado pela consulta cadastral",
            naturezaJuridica: ws.natureza_juridica || "",
            cnaePrincipal: ws.atividade_principal?.[0] ? `${ws.atividade_principal[0].code} - ${ws.atividade_principal[0].text}` : "",
            cnaesSecundarios: (ws.atividades_secundarias || []).map((a: any) => `${a.code} - ${a.text}`),
            capitalSocial: parseFloat(ws.capital_social || "0"),
            capitalSocialFormatado: ws.capital_social ? `R$ ${ws.capital_social}` : "R$ 0,00",
            endereco: {
              logradouro: ws.logradouro || "",
              numero: ws.numero || "",
              complemento: ws.complemento || "",
              bairro: ws.bairro || "",
              municipio: ws.municipio || "",
              uf: ws.uf || "",
              cep: ws.cep || "",
              completo: `${ws.logradouro || ""}${ws.numero ? ", " + ws.numero : ""}, ${ws.bairro || ""}`,
            },
            contato: {
              telefone: ws.telefone || "",
              email: ws.email ? ws.email.toLowerCase() : "",
            },
            qsa: (ws.qsa || []).map((q: any) => ({
              nome: q.nome || "",
              qualificacao: q.qual || "Sócio",
            })),
            fonte: "ReceitaWS (consulta cadastral de terceiros)",
            timestamp: new Date().toISOString(),
          });
        }
      }

      return res.status(404).json({ error: "CNPJ não localizado na base pública da Receita Federal." });
    } catch (err: any) {
      console.error("Erro na consulta CNPJ:", err);
      return res.status(500).json({ error: "Falha ao conectar com a base da Receita Federal. Tente novamente." });
    }
  });

  // API de Consulta CEP Real
  app.get("/api/receita/cep/:cep", async (req, res) => {
    const rawCep = (req.params.cep || "").replace(/\D/g, "");
    if (rawCep.length !== 8) {
      return res.status(400).json({ error: "CEP inválido. Informe 8 dígitos." });
    }

    try {
      const resp = await fetch(`https://brasilapi.com.br/api/cep/v1/${rawCep}`);
      if (resp.ok) {
        const data = await resp.json();
        return res.json({
          cep: `${rawCep.slice(0, 5)}-${rawCep.slice(5)}`,
          logradouro: data.street || "",
          bairro: data.neighborhood || "",
          cidade: data.city || "",
          uf: data.state || "",
          fonte: "BrasilAPI / Correios",
        });
      }

      // Fallback ViaCEP
      const viaCepResp = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`);
      if (viaCepResp.ok) {
        const v = await viaCepResp.json();
        if (!v.erro) {
          return res.json({
            cep: v.cep || `${rawCep.slice(0, 5)}-${rawCep.slice(5)}`,
            logradouro: v.logradouro || "",
            bairro: v.bairro || "",
            cidade: v.localidade || "",
            uf: v.uf || "",
            fonte: "ViaCEP / Correios",
          });
        }
      }

      return res.status(404).json({ error: "CEP não encontrado." });
    } catch (e) {
      return res.status(500).json({ error: "Erro ao consultar CEP." });
    }
  });

  // API de Teste de Conexão Real com Portais Governamentais
  app.get("/api/orgaos/status", async (req, res) => {
    const endpointsParaTestar = [
      { id: "rfb", nome: "Receita Federal do Brasil", url: "https://servicos.receita.fazenda.gov.br", timeoutMs: 3500 },
      { id: "serpro", nome: "SERPRO / gov.br", url: "https://www.gov.br/pt-br", timeoutMs: 3500 },
      { id: "pgfn", nome: "PGFN — Regularize", url: "https://www.regularize.pgfn.gov.br", timeoutMs: 3500 },
      { id: "fgts-caixa", nome: "Caixa / FGTS Digital", url: "https://www.caixa.gov.br", timeoutMs: 3500 },
      { id: "sefaz", nome: "Portal NF-e / SEFAZ Nacional", url: "https://www.nfe.fazenda.gov.br", timeoutMs: 3500 },
      { id: "sintegra", nome: "Sintegra / Cadastro CCC", url: "https://dfe-portal.svrs.rs.gov.br", timeoutMs: 3500 },
      { id: "esocial", nome: "Portal eSocial Oficial", url: "https://www.gov.br/esocial/pt-br", timeoutMs: 3500 },
      { id: "simples", nome: "Simples Nacional", url: "https://www8.receita.fazenda.gov.br/SimplesNacional", timeoutMs: 3500 },
    ];

    const resultados = await Promise.all(
      endpointsParaTestar.map(async (item) => {
        const inicio = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), item.timeoutMs);

        try {
          const resp = await fetch(item.url, {
            method: "GET",
            signal: controller.signal,
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
          });
          clearTimeout(timer);
          const duracao = Date.now() - inicio;

          // Se retornou código HTTP (200, 301, 302, 403 de WAF governamental, etc.), o servidor está online e respondeu
          const online = resp.status >= 200 && resp.status < 500;
          return {
            id: item.id,
            nome: item.nome,
            url: item.url,
            // HTTP response is only reachability; it does not establish authentication/integration.
            status: online ? "alerta" : "offline",
            statusCode: resp.status,
            statusTexto: resp.statusText || (online ? "OK" : "Indisponível"),
            pingMs: duracao,
            tls: "HTTPS respondeu; autenticação e integração não verificadas",
            verificadoEm: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            autenticacaoValida: false,
          };
        } catch (err: any) {
          clearTimeout(timer);
          const duracao = Date.now() - inicio;
          return {
            id: item.id,
            nome: item.nome,
            url: item.url,
            status: "offline",
            statusTexto: err?.name === "AbortError" ? "Tempo limite excedido" : "Não foi possível conectar",
            pingMs: duracao,
            tls: "Não verificado",
            verificadoEm: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            autenticacaoValida: false,
          };
        }
      })
    );

    const todosResultados = resultados;

    res.json({
      timestamp: new Date().toISOString(),
      totalTestados: todosResultados.length,
      conectados: todosResultados.filter((r) => r.status === "conectado").length,
      resultados: todosResultados,
    });
  });

  // API do Agente IA Murad (Contabilidade, Fisco e Reforma Tributária 2026)
  app.post("/api/ai/chat", async (req, res) => {
    const { message, context } = req.body;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Mensagem não fornecida." });
    }
    if (message.length > 4000) return res.status(413).json({ error: "Mensagem excede o limite de 4.000 caracteres." });

    const ai = getAI();

    // Contexto base de especialista contábil brasileiro
    const systemInstruction = `Você é o Agente Murad, a inteligência contábil e tributária do sistema Murad Contábil.
Você é um especialista sênior em contabilidade brasileira, CPC/IFRS, legislação tributária (Lucro Real, Lucro Presumido, Simples Nacional, MEI), obrigações acessórias (SPED, EFD ICMS/IPI, ECD, ECF, DCTFWeb, eSocial) e principalmente na Reforma Tributária de 2026 (IBS, CBS e Imposto Seletivo).
Seu tom é profissional, ágil, prestativo e seguro.
Ao responder:
- Seja conciso e direto ao ponto com linguagem técnica e clara.
- Se a dúvida for sobre lançamentos contábeis (Débito e Crédito), forneça o exemplo das contas contábeis correspondentes segundo o padrão CPC.
- Não invente dados da empresa, saldos, transmissões, conexões, alíquotas ou prazos. Quando faltarem dados, peça-os e recomende validação pelo profissional responsável.
- Para 2026, diferencie a fase de teste das alíquotas definitivas e valide enquadramento, exceções e regras vigentes antes de orientar cálculos.
- Responda sempre em português do Brasil.`;

    if (!ai) return res.status(503).json({ error: "Assistente IA indisponível. Configure uma GEMINI_API_KEY válida." });
    try {
        const response = await ai.models.generateContent({
          model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
          config: { systemInstruction },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Contexto contábil atual do sistema:\n${JSON.stringify(context || {}).slice(0, 4000)}\n\nPergunta do usuário: ${message}`,
                },
              ],
            },
          ],
        });

        if (!response.text) return res.status(502).json({ error: "O provedor de IA não retornou uma resposta." });
        return res.json({ reply: response.text });
    } catch (err: any) {
      console.error("Erro na chamada Gemini:", err);
      return res.status(502).json({ error: "Não foi possível obter resposta do provedor de IA." });
    }
  });

  // Vite middleware em desenvolvimento
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Murad Contábil] Servidor ativo em http://localhost:${PORT}`);
  });
}

startServer();
