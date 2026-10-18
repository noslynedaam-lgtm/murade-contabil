import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const schemaEsperado = {
  contabil_auth_users: ["id", "login", "password_salt", "password_hash", "disabled", "global_admin"],
  contabil_auth_company_access: ["user_id", "cnpj", "role"],
  contabil_auth_sessions: ["token_hash", "user_id", "created_at", "expires_at"],
  contabil_auth_invites: ["token_hash", "login", "cnpjs", "role", "created_by", "expires_at"],
  contabil_company_workspaces: ["cnpj", "payload", "version", "updated_at"],
  contabil_accounting_approval_audit: ["cnpj", "referencia", "user_id", "login", "valor", "conta_debito", "conta_credito", "aprovado_em"],
  contabil_manual_journal_audit: ["cnpj", "lancamento_id", "evento", "user_id", "login", "lancamento", "registrado_em"],
  contabil_manual_journal_events: ["evento_id", "cnpj", "lancamento_id", "evento", "user_id", "login", "lancamento", "registrado_em"],
  contabil_opening_balance_audit: ["cnpj", "conta_codigo", "evento", "saldo_anterior", "saldo_novo", "competencia", "user_id", "login", "registrado_em"],
  contabil_period_closures: ["cnpj", "competencia", "user_id", "login", "fechado_em", "quantidade_lancamentos", "total_debitos"],
  murade_documentos_fiscais_origem: ["cnpj", "chave_documento", "competencia", "tipo", "documento", "recebido_em", "atualizado_em"],
  murade_documentos_fiscais_versoes: ["versao_id", "cnpj", "chave_documento", "competencia", "tipo", "documento", "recebido_em", "arquivado_em"],
  murade_folhas_dp_origem: ["cnpj", "competencia", "processamento_id", "calculado_em", "resumo", "recebido_em", "atualizado_em"],
};

const tabelasPorEmpresa = [
  "contabil_auth_company_access",
  "contabil_company_workspaces",
  "contabil_accounting_approval_audit",
  "contabil_manual_journal_audit",
  "contabil_manual_journal_events",
  "contabil_opening_balance_audit",
  "contabil_period_closures",
  "murade_documentos_fiscais_origem",
  "murade_documentos_fiscais_versoes",
  "murade_folhas_dp_origem",
];

function reportar(tipo, mensagem) {
  console.log(`${tipo} ${mensagem}`);
}

function lerArgumento(nome) {
  const prefixo = `${nome}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefixo));
  if (inline) return inline.slice(prefixo.length).trim();
  const indice = process.argv.indexOf(nome);
  return indice >= 0 ? String(process.argv[indice + 1] || "").trim() : "";
}

const cnpjSolicitado = lerArgumento("--cnpj").toUpperCase().replace(/[^A-Z0-9]/g, "");
const competenciaSolicitada = lerArgumento("--competencia");

async function main() {
  if (cnpjSolicitado && !/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpjSolicitado)) {
    reportar("FALHA", "--cnpj precisa conter 14 caracteres alfanuméricos, com os dois verificadores numéricos.");
    process.exitCode = 2;
    return;
  }
  if (competenciaSolicitada && !/^\d{4}-(0[1-9]|1[0-2])$/.test(competenciaSolicitada)) {
    reportar("FALHA", "--competencia deve estar no formato AAAA-MM.");
    process.exitCode = 2;
    return;
  }
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    reportar("FALHA", "DATABASE_URL não está configurada. Nenhuma conexão foi feita.");
    process.exitCode = 2;
    return;
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : undefined,
    max: 1,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    application_name: "murade-contabil-db-validator",
  });

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const ping = await client.query("SELECT current_schema() AS schema, current_setting('transaction_read_only') AS somente_leitura");
      if (ping.rows[0]?.somente_leitura !== "on") {
        throw new Error("A conexão não entrou em modo somente leitura.");
      }
      reportar("OK", "Conexão PostgreSQL estabelecida em transação somente leitura.");

      const tabelas = Object.keys(schemaEsperado);
      const encontrados = await client.query(
        `SELECT table_name, column_name
         FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = ANY($1::text[])
         ORDER BY table_name, ordinal_position`,
        [tabelas],
      );
      const colunasPorTabela = new Map();
      for (const row of encontrados.rows) {
        if (!colunasPorTabela.has(row.table_name)) colunasPorTabela.set(row.table_name, new Set());
        colunasPorTabela.get(row.table_name).add(row.column_name);
      }

      const faltas = [];
      for (const [tabela, colunas] of Object.entries(schemaEsperado)) {
        const presentes = colunasPorTabela.get(tabela);
        if (!presentes) {
          faltas.push(`${tabela} (tabela ausente)`);
          continue;
        }
        const colunasAusentes = colunas.filter((coluna) => !presentes.has(coluna));
        if (colunasAusentes.length) faltas.push(`${tabela} (colunas: ${colunasAusentes.join(", ")})`);
      }

      if (faltas.length) {
        reportar("PENDENTE", `Estrutura incompleta: ${faltas.join("; ")}`);
        reportar("DICA", "A validação não aplica alterações. Confirme a versão implantada e a inicialização do schema pelo serviço antes de repetir.");
        process.exitCode = 1;
        await client.query("ROLLBACK");
        return;
      }
      reportar("OK", `${tabelas.length} tabelas e colunas essenciais encontradas.`);

      const contagens = [];
      for (const tabela of tabelas) {
        const result = await client.query(`SELECT count(*)::bigint AS total FROM ${tabela}`);
        contagens.push({ tabela, total: String(result.rows[0].total) });
      }
      for (const tabela of tabelasPorEmpresa) {
        const result = await client.query(
          `SELECT count(*)::bigint AS total
           FROM ${tabela}
           WHERE cnpj IS NULL OR length(regexp_replace(upper(cnpj), '[^A-Z0-9]', '', 'g')) <> 14`,
        );
        const invalidos = Number(result.rows[0].total);
        if (invalidos) {
          reportar("PENDENTE", `${tabela}: ${invalidos} registro(s) com chave de empresa ausente ou fora do formato de 14 caracteres.`);
          process.exitCode = 1;
        }
      }

      const acessos = await client.query(`
        SELECT count(*)::bigint AS acessos,
               count(*) FILTER (WHERE u.id IS NULL)::bigint AS acessos_sem_usuario,
               count(*) FILTER (WHERE a.cnpj IS NULL OR length(regexp_replace(upper(a.cnpj), '[^A-Z0-9]', '', 'g')) <> 14)::bigint AS acessos_com_empresa_invalida
        FROM contabil_auth_company_access a
        LEFT JOIN contabil_auth_users u ON u.id = a.user_id
      `);
      const resumoAcessos = acessos.rows[0];
      if (Number(resumoAcessos.acessos_sem_usuario) || Number(resumoAcessos.acessos_com_empresa_invalida)) {
        reportar("PENDENTE", "Há vínculos de acesso sem usuário ou com CNPJ inválido.");
        process.exitCode = 1;
      }

      await client.query("ROLLBACK");
      for (const item of contagens) reportar("DADOS", `${item.tabela}: ${item.total} registro(s)`);
      reportar("DADOS", `Acessos por empresa: ${resumoAcessos.acessos}; vínculos sem usuário: ${resumoAcessos.acessos_sem_usuario}.`);
      if (cnpjSolicitado) {
        await client.query("BEGIN READ ONLY");
        const workspaceResult = await client.query(
          "SELECT payload FROM contabil_company_workspaces WHERE cnpj = $1",
          [cnpjSolicitado],
        );
        if (!workspaceResult.rowCount) {
          reportar("PENDENTE", "Não há workspace persistido para o CNPJ selecionado.");
          process.exitCode = 1;
        } else {
          const payload = workspaceResult.rows[0].payload || {};
          const cnpjWorkspace = String(payload?.empresa?.cnpj || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (!cnpjWorkspace || cnpjWorkspace !== cnpjSolicitado) {
            reportar("PENDENTE", "O CNPJ declarado dentro do workspace está ausente ou difere da chave do registro.");
            process.exitCode = 1;
          }
          const contas = Array.isArray(payload.contas) ? payload.contas : [];
          const centros = Array.isArray(payload.centrosCusto) ? payload.centrosCusto : [];
          const lancamentos = Array.isArray(payload.lancamentos) ? payload.lancamentos : [];
          const preLancamentos = Array.isArray(payload.preLancamentos) ? payload.preLancamentos : [];
          const obterCompetenciaItem = (item) => {
            const declarada = String(item?.competencia || "");
            if (/^\d{4}-(0[1-9]|1[0-2])$/.test(declarada)) return declarada;
            const data = String(item?.data || "");
            const iso = /^(\d{4})-(\d{2})-\d{2}/.exec(data);
            const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data);
            return iso ? `${iso[1]}-${iso[2]}` : br ? `${br[3]}-${br[2]}` : "";
          };
          const filtrarCompetencia = (item) => !competenciaSolicitada || obterCompetenciaItem(item) === competenciaSolicitada;
          const lancamentosEscopo = lancamentos.filter(filtrarCompetencia);
          const rascunhosEscopo = preLancamentos.filter(filtrarCompetencia);
          reportar("EMPRESA", `Workspace persistido; ${contas.length} conta(s), ${centros.length} centro(s) de custo.`);
          reportar("EMPRESA", `${lancamentosEscopo.length} lançamento(s) no escopo; ${rascunhosEscopo.filter((item) => item?.status === "contabilizado").length} rascunho(s) contabilizado(s), ${rascunhosEscopo.filter((item) => item?.status === "pendente_conferencia").length} pendente(s) de conferência.`);
        }

        const competenciaArgs = competenciaSolicitada ? [cnpjSolicitado, competenciaSolicitada] : [cnpjSolicitado];
        const fiscal = await client.query(`
          SELECT competencia, tipo, count(*)::bigint AS total
          FROM murade_documentos_fiscais_origem
          WHERE cnpj = $1 ${competenciaSolicitada ? "AND competencia = $2" : ""}
          GROUP BY competencia, tipo
          ORDER BY competencia, tipo
        `, competenciaArgs);
        const dp = await client.query(`
          SELECT competencia, count(*)::bigint AS total
          FROM murade_folhas_dp_origem
          WHERE cnpj = $1 ${competenciaSolicitada ? "AND competencia = $2" : ""}
          GROUP BY competencia
          ORDER BY competencia
        `, competenciaArgs);
        for (const row of fiscal.rows) reportar("FISCAL", `${row.competencia} · ${row.tipo}: ${row.total} documento(s)`);
        for (const row of dp.rows) reportar("DP", `${row.competencia}: ${row.total} resumo(s) de folha`);
        if (!fiscal.rowCount) reportar("FISCAL", "Nenhum documento fiscal persistido no escopo selecionado.");
        if (!dp.rowCount) reportar("DP", "Nenhum resumo de folha persistido no escopo selecionado.");

        const auditoria = await client.query(`
          SELECT
            (SELECT count(*) FROM contabil_accounting_approval_audit WHERE cnpj = $1) AS aprovacoes_integradas,
            (SELECT count(*) FROM contabil_manual_journal_events WHERE cnpj = $1) AS eventos_manuais,
            (SELECT count(*) FROM contabil_opening_balance_audit WHERE cnpj = $1) AS alteracoes_saldo_inicial,
            (SELECT count(*) FROM contabil_period_closures WHERE cnpj = $1) AS competencias_fechadas
        `, [cnpjSolicitado]);
        const a = auditoria.rows[0];
        reportar("AUDITORIA", `${a.aprovacoes_integradas} aprovação(ões) integrada(s), ${a.eventos_manuais} evento(s) manual(is), ${a.alteracoes_saldo_inicial} alteração(ões) de saldo inicial, ${a.competencias_fechadas} competência(s) fechada(s).`);
        if (competenciaSolicitada) reportar("EMPRESA", `Escopo da leitura: competência ${competenciaSolicitada}.`);
        await client.query("ROLLBACK");
      }
      reportar("AVISO", "Contagens não comprovam cópia integral. Compare-as com o inventário/exportação da origem e valide uma empresa por vez antes de liberar uso contábil.");
      if (process.exitCode !== 1) reportar("OK", "Estrutura e integridade básica validadas; backup e integrações externas exigem conferência separada.");
    } finally {
      client.release();
    }
  } catch (error) {
    const codigo = typeof error === "object" && error && "code" in error ? String(error.code) : "sem código";
    reportar("FALHA", `Não foi possível validar o PostgreSQL (código ${codigo}). Verifique DATABASE_URL, SSL e disponibilidade do banco no painel do Render; a credencial não foi exibida.`);
    process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

await main();
