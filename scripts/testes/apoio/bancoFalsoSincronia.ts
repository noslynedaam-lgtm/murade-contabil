// Banco falso (em memória) só para os testes da sincronia do cadastro: entende as consultas da fila e dos avisos "conferir"
// (sincroniaCadastroEmpresas.ts) e aceita tratadores extras para as tabelas de cada sistema. Dados fictícios.
export type Tratador = (sql: string, p: any[]) => { rows: any[]; rowCount?: number } | undefined;

export function criarBancoFalso(extras: Tratador[] = []) {
  const fila = new Map<string, any>();
  const divergencias = new Map<string, any>();
  const chamadas: string[] = [];
  const novas = new Map<string, { escritorio: string; marcada: Date; consumida: boolean }>();
  const marco = new Date(Date.now() - 1000);
  const consultar = async (sqlBruto: string, p: any[] = []) => {
    const sql = sqlBruto.replace(/\s+/g, ' ').trim();
    chamadas.push(sql);
    for (const t of extras) { const r = t(sql, p); if (r) return { rowCount: r.rows.length, ...r }; }
    if (/^(CREATE TABLE|ALTER TABLE)/i.test(sql)) return { rows: [], rowCount: 0 };
    if (/_sincronia_marco/.test(sql) && /^INSERT/.test(sql)) return { rows: [], rowCount: 0 };
    if (/^SELECT em FROM .*_sincronia_marco/.test(sql)) return { rows: [{ em: marco }] };
    if (/_sincronia_empresas_novas/.test(sql)) {
      if (/^INSERT/.test(sql)) { novas.set(p[0], { escritorio: p[1], marcada: new Date(), consumida: false }); return { rows: [], rowCount: 1 }; }
      if (/^UPDATE/.test(sql)) { const n = novas.get(p[0]); if (n && !n.consumida && n.marcada >= marco) { n.consumida = true; return { rows: [{ cnpj: p[0] }], rowCount: 1 }; } return { rows: [], rowCount: 0 }; }
    }
    if (/_sincronia_empresas_fila/.test(sql)) {
      if (/^INSERT INTO/.test(sql)) {
        const k = `${p[0]}|${p[1]}`; const atual = fila.get(k);
        fila.set(k, { ...(atual || { tentativas: 0, ultimo_erro: '', entregue_assinatura: '', criado_em: new Date() }), cnpj: p[0], destino: p[1], escritorio: p[2] || atual?.escritorio || '', origem: p[3], dono_sistema: p[4], pendente: true, criar: Boolean(atual?.criar) || p[5] === true, atualizado_em: new Date() });
        return { rows: [], rowCount: 1 };
      }
      if (/^SELECT \* FROM .* WHERE pendente=true/.test(sql)) return { rows: [...fila.values()].filter((x) => x.pendente).slice(0, p[0]), rowCount: 0 };
      if (/^SELECT cnpj, destino, entregue_assinatura, pendente/.test(sql)) return { rows: [...fila.values()] };
      if (/^UPDATE .* SET pendente=false, (criar=false, )?tentativas=0/.test(sql)) { const x = fila.get(`${p[0]}|${p[1]}`); if (x) Object.assign(x, { pendente: false, criar: false, tentativas: 0, ultimo_erro: '', entregue_assinatura: p[2] }); return { rows: [], rowCount: x ? 1 : 0 }; }
      if (/^UPDATE .* SET tentativas=tentativas\+1/.test(sql)) { const x = fila.get(`${p[0]}|${p[1]}`); if (x) Object.assign(x, { tentativas: x.tentativas + 1, ultimo_erro: p[2], pendente: p[3], entregue_assinatura: p[3] ? x.entregue_assinatura : p[4], criar: p[3] ? x.criar : false }); return { rows: [], rowCount: x ? 1 : 0 }; }
      if (/^DELETE FROM .* WHERE cnpj=\$1/.test(sql)) { for (const k of [...fila.keys()]) if (k.startsWith(`${p[0]}|`)) fila.delete(k); return { rows: [], rowCount: 1 }; }
    }
    if (/_cadastro_divergencias/.test(sql)) {
      if (/^INSERT INTO/.test(sql)) { divergencias.set(`${p[0]}|${p[1]}`, { cnpj: p[0], campo: p[1], aqui: p[2], la: p[3], origem: p[4], criado_em: new Date() }); return { rows: [], rowCount: 1 }; }
      if (/^DELETE FROM .* campo = ANY/.test(sql)) { for (const c of p[1]) divergencias.delete(`${p[0]}|${c}`); return { rows: [], rowCount: 1 }; }
      if (/^DELETE FROM .* campo=\$2/.test(sql)) { const ok = divergencias.delete(`${p[0]}|${p[1]}`); return { rows: [], rowCount: ok ? 1 : 0 }; }
      if (/^SELECT \* FROM/.test(sql)) return { rows: [...divergencias.values()].filter((d) => !p[0] || p[0].includes(d.cnpj)) };
    }
    throw new Error(`Consulta não esperada no banco falso: ${sql.slice(0, 160)}`);
  };
  return { consultar, fila, divergencias, chamadas, novas };
}
