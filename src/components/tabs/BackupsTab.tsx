import React from "react";
import { PainelBackupEscritorio } from "../backupEscritorio/PainelBackupEscritorio";

/** Tela "Backup" do escritório no Contábil: agenda (dia/semana/mês), onde guardar (computador ou nuvem do escritório),
 * avisos, relatório e restauração. O backup mensal automático que já existia aparece na mesma tela. Não é tela de
 * administrador para ver e baixar; mudar a agenda, a nuvem e restaurar é só do administrador do escritório. */
export const BackupsTab: React.FC = () => (
  <PainelBackupEscritorio api="/api/contabil/backup-agendado" sistema="contabil" nomeSistema="Murad Contábil" urlMensal={(id) => `/api/contabil/backups/${id}/download`} />
);
