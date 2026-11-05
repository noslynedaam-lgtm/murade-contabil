// Robô Conferidor de Backups do Contábil: garante que todo escritório com empresa cadastrada tem o backup
// mensal cifrado deste período gerado e conferido. Quando falta ou falhou, gera de novo sozinho — sem precisar
// do dono. Mesma lógica do robô equivalente do Murade Fiscal (src/server/conferidorBackups.ts), adaptada ao
// Contábil. Nunca mexe em lançamento, cadastro de empresa nem dado de outro escritório; só lê e grava na
// própria tabela de backups.
import { gerarBackupEscritorio, listarBackupsEscritorio, periodoDe, type Consultar } from '../services/backupEscritorioContabilService';

export interface RelatorioBackupsContabil {
  escritorios: number;
  emDia: number;
  gerados: number;
  falhas: number;
  atencao: boolean;
  resumo: string;
}

export interface EscritorioParaConferirBackup { id: string; cnpjs: string[] }

/**
 * Confere, para o período corrente (mês de `agora`), se cada escritório com ao menos uma empresa tem backup
 * cifrado gerado e verificado. Quem não tem, ele gera agora mesmo (self-heal); erro de um escritório não impede
 * os demais. Chame de hora em hora: quem falhar numa rodada é tentado de novo na próxima, até sair certo.
 */
export async function conferirBackupsEscritorios(
  consultar: Consultar, escritorios: EscritorioParaConferirBackup[], agora: Date = new Date(),
): Promise<RelatorioBackupsContabil> {
  const periodo = periodoDe(agora);
  const comEmpresa = escritorios.filter((e) => e.cnpjs.length > 0);
  let emDia = 0; let gerados = 0; let falhas = 0; let ultimoErro: string | null = null;

  for (const escritorio of comEmpresa) {
    try {
      const resultado = await gerarBackupEscritorio(consultar, escritorio.id, periodo, agora);
      if (resultado.motivo === 'gerado') gerados += 1; else emDia += 1;
    } catch (erro: any) {
      falhas += 1;
      ultimoErro = String(erro?.message || 'Falha desconhecida ao gerar o backup.').slice(0, 300);
    }
  }

  const atencao = falhas > 0;
  const resumo = comEmpresa.length === 0
    ? 'Nenhum escritório com empresa cadastrada; nada para fazer backup ainda.'
    : atencao
      ? `ATENÇÃO: ${falhas} escritório(s) sem conseguir gerar o backup de ${periodo} (nova tentativa na próxima rodada). ${emDia} em dia, ${gerados} gerado(s) agora.${ultimoErro ? ` Último erro: ${ultimoErro}` : ''}`
      : gerados > 0
        ? `Backup de ${periodo}: ${gerados} escritório(s) gerado(s) agora, ${emDia} já estavam em dia.`
        : `Backup de ${periodo} em dia para os ${emDia} escritório(s) com empresa cadastrada.`;

  return { escritorios: comEmpresa.length, emDia, gerados, falhas, atencao, resumo };
}

/** Usado pela tela/rota: confirma se um escritório específico já tem o backup do período corrente. */
export async function temBackupDoPeriodoAtual(consultar: Consultar, tenantId: string, agora: Date = new Date()): Promise<boolean> {
  const periodo = periodoDe(agora);
  const lista = await listarBackupsEscritorio(consultar, tenantId);
  return lista.some((b) => b.periodo === periodo && b.status === 'ok' && b.verificado);
}
