// Robô Conferidor de Backups do Contábil: garante que todo escritório com empresa cadastrada tem o backup
// mensal cifrado deste período gerado e conferido. Quando falta ou falhou, gera de novo sozinho — sem precisar
// do dono. Mesma lógica do robô equivalente do Murade Fiscal (src/server/conferidorBackups.ts), adaptada ao
// Contábil. Nunca mexe em lançamento, cadastro de empresa nem dado de outro escritório; só lê e grava na
// própria tabela de backups.
//
// Decisão do dono (06/11/2026): além de ficar disponível pra baixar na tela "Backups", o robô avisa o escritório
// por e-mail quando o backup do período fica pronto (reaproveita emailMurade.ts). Não manda o arquivo em anexo —
// ele só abre de dentro do sistema, então um anexo que ninguém consegue abrir só confundiria; o e-mail é só o
// aviso + o lembrete de onde baixar. O envio só é marcado como feito depois de confirmado (email_enviado), então
// uma falha de e-mail é tentada de novo na próxima rodada, sem nunca travar a geração do backup em si.
import { gerarBackupEscritorio, listarBackupsEscritorio, marcarEmailBackupEnviado, periodoDe, type Consultar } from '../services/backupEscritorioContabilService';
import { emailConfigurado, enviarEmail } from './emailMurade';

export interface RelatorioBackupsContabil {
  escritorios: number;
  emDia: number;
  gerados: number;
  falhas: number;
  emailsEnviados: number;
  emailsFalhos: number;
  atencao: boolean;
  resumo: string;
}

export interface EscritorioParaConferirBackup { id: string; cnpjs: string[]; login?: string }

function textoEmailBackup(periodo: string): { assunto: string; texto: string } {
  return {
    assunto: `Murade Contábil: backup de ${periodo} pronto`,
    texto: `Olá!\n\nO backup mensal dos dados do seu escritório no Murade Contábil referente a ${periodo} foi gerado e conferido com sucesso.\n\nPara baixar, entre no sistema e acesse a tela "Backups". Por segurança, o arquivo só pode ser aberto de dentro do Murade, com o seu login — ele não funciona fora do sistema.\n\nEste é só um aviso automático; não é preciso responder.`,
  };
}

/**
 * Confere, para o período corrente (mês de `agora`), se cada escritório com ao menos uma empresa tem backup
 * cifrado gerado e verificado. Quem não tem, ele gera agora mesmo (self-heal); erro de um escritório não impede
 * os demais. Depois de gerado/conferido, tenta avisar o escritório por e-mail (se ainda não avisou e tiver login
 * configurado). Chame de hora em hora: quem falhar numa rodada (backup ou e-mail) é tentado de novo na próxima,
 * até sair certo.
 */
export async function conferirBackupsEscritorios(
  consultar: Consultar, escritorios: EscritorioParaConferirBackup[], agora: Date = new Date(),
): Promise<RelatorioBackupsContabil> {
  const periodo = periodoDe(agora);
  const comEmpresa = escritorios.filter((e) => e.cnpjs.length > 0);
  let emDia = 0; let gerados = 0; let falhas = 0; let emailsEnviados = 0; let emailsFalhos = 0;
  let ultimoErro: string | null = null;
  const podeEnviarEmail = emailConfigurado();

  for (const escritorio of comEmpresa) {
    try {
      const resultado = await gerarBackupEscritorio(consultar, escritorio.id, periodo, agora);
      if (resultado.motivo === 'gerado') gerados += 1; else emDia += 1;

      if (podeEnviarEmail && escritorio.login) {
        const atual = resultado.registro
          ?? (await listarBackupsEscritorio(consultar, escritorio.id)).find((b) => b.periodo === periodo);
        if (atual && atual.status === 'ok' && atual.verificado && !atual.emailEnviado) {
          try {
            const { assunto, texto } = textoEmailBackup(periodo);
            await enviarEmail(escritorio.login, assunto, texto);
            await marcarEmailBackupEnviado(consultar, escritorio.id, atual.id);
            emailsEnviados += 1;
          } catch {
            emailsFalhos += 1; // tentado de novo na próxima rodada; não impede o backup, que já está ok
          }
        }
      }
    } catch (erro: any) {
      falhas += 1;
      ultimoErro = String(erro?.message || 'Falha desconhecida ao gerar o backup.').slice(0, 300);
    }
  }

  const atencao = falhas > 0;
  const textoEmails = emailsEnviados || emailsFalhos
    ? ` ${emailsEnviados} aviso(s) por e-mail enviado(s)${emailsFalhos ? `, ${emailsFalhos} falha(s) de envio (tenta de novo na próxima rodada)` : ''}.`
    : '';
  const resumo = comEmpresa.length === 0
    ? 'Nenhum escritório com empresa cadastrada; nada para fazer backup ainda.'
    : atencao
      ? `ATENÇÃO: ${falhas} escritório(s) sem conseguir gerar o backup de ${periodo} (nova tentativa na próxima rodada). ${emDia} em dia, ${gerados} gerado(s) agora.${ultimoErro ? ` Último erro: ${ultimoErro}` : ''}${textoEmails}`
      : gerados > 0
        ? `Backup de ${periodo}: ${gerados} escritório(s) gerado(s) agora, ${emDia} já estavam em dia.${textoEmails}`
        : `Backup de ${periodo} em dia para os ${emDia} escritório(s) com empresa cadastrada.${textoEmails}`;

  return { escritorios: comEmpresa.length, emDia, gerados, falhas, emailsEnviados, emailsFalhos, atencao, resumo };
}

/** Usado pela tela/rota: confirma se um escritório específico já tem o backup do período corrente. */
export async function temBackupDoPeriodoAtual(consultar: Consultar, tenantId: string, agora: Date = new Date()): Promise<boolean> {
  const periodo = periodoDe(agora);
  const lista = await listarBackupsEscritorio(consultar, tenantId);
  return lista.some((b) => b.periodo === periodo && b.status === 'ok' && b.verificado);
}
