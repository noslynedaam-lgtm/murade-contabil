export function escolherVozPtBr(vozes: SpeechSynthesisVoice[], masculina = false): SpeechSynthesisVoice | null {
  const pontuar = (v: SpeechSynthesisVoice): number => {
    const lang = v.lang.toLowerCase().replace("_", "-");
    if (!lang.startsWith("pt")) return -1;
    const nome = v.name.toLowerCase();
    let p = lang === "pt-br" ? 10 : 0;
    if (/natural|neural|online/.test(nome)) p += 50;
    if (/google/.test(nome)) p += 30;
    if (v.localService === false) p += 5;
    const ehMasc = /antonio|daniel|felipe|ricardo|guilherme|male/.test(nome);
    const ehFem = /francisca|thalita|maria|luciana|female/.test(nome);
    if (masculina && ehMasc) p += 20;
    if (!masculina && ehFem) p += 5;
    return p;
  };
  let melhor: SpeechSynthesisVoice | null = null;
  let max = -1;
  for (const v of vozes) { const p = pontuar(v); if (p > max) { melhor = v; max = p; } }
  return melhor;
}

