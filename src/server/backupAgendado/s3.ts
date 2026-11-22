// O backup agendado reaproveita o mesmo cliente S3 (assinatura AWS SigV4, sem SDK) do backup completo do banco.
export { ClienteS3, ErroS3, type ConfigS3 } from '../backupBanco/s3';
