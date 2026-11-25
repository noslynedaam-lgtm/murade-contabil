// Linha de log de "Ativar avisos neste aparelho" que não deu certo (etapa + navegador + detalhe curto do erro).
// Sem login, sem endereço do aparelho, sem nada que identifique a pessoa. O mesmo arquivo existe no Fiscal, no DP e no Contábil.
export const ETAPAS_FALHA_AVISO = ['sem_suporte', 'iphone_sem_instalar', 'sem_sessao', 'servidor_sem_chave', 'chave_invalida', 'permissao_negada', 'permissao_fechada', 'service_worker', 'assinatura', 'gravacao'] as const;

export function navegadorCurto(ua: unknown): string {
  const u = String(ua || '');
  const sistema = /iphone|ipad|ipod/i.test(u) ? 'iPhone' : /android/i.test(u) ? 'Android' : /windows/i.test(u) ? 'Windows' : /mac os/i.test(u) ? 'Mac' : /linux/i.test(u) ? 'Linux' : 'outro';
  const nav = /SamsungBrowser\/(\d+)/i.exec(u)?.[0] || /Edg\/(\d+)/i.exec(u)?.[0] || /(CriOS|Chrome)\/(\d+)/i.exec(u)?.[0] || /Firefox\/(\d+)/i.exec(u)?.[0] || (/Safari\//i.test(u) ? 'Safari' : 'desconhecido');
  return `${nav.replace(/\.\d.*$/, '')} (${sistema})`;
}

export function linhaFalhaAvisoAparelho(corpo: unknown, ua: unknown): string {
  const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>;
  const etapa = (ETAPAS_FALHA_AVISO as readonly string[]).includes(String(c.etapa)) ? String(c.etapa) : 'desconhecida';
  const detalhe = String(c.detalhe ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/https?:\/\/\S+/g, '[endereço]').trim().slice(0, 200);
  return `não ativou: etapa=${etapa} navegador=${navegadorCurto(ua)}${detalhe ? ` detalhe=${detalhe}` : ''}`;
}
