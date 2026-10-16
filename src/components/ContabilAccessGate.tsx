import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type AuthData = { usuario: string; cnpjs: string[]; administrador: boolean };
type AuthContextValue = AuthData & { sair: () => Promise<void>; atualizarAcesso: () => Promise<void> };

const AuthContext = createContext<AuthContextValue | null>(null);

export function useContabilAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useContabilAuth deve ser usado dentro de ContabilAccessGate.");
  return value;
}

export const ContabilAccessGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [status, setStatus] = useState<{ carregando: boolean; primeiroAcesso: boolean; configuracaoNecessaria: boolean; erro: string }>({ carregando: true, primeiroAcesso: false, configuracaoNecessaria: false, erro: "" });
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [token, setToken] = useState("");
  const [cnpjsInput, setCnpjsInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const atualizarAcesso = async () => {
    const response = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.motivo || "Não foi possível consultar a sessão.");
    setAuth(data.autenticado ? { usuario: data.usuario, cnpjs: data.cnpjs || [], administrador: data.administrador === true } : null);
  };

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [statusResponse, sessionResponse] = await Promise.all([
          fetch("/api/auth/status", { cache: "no-store" }),
          fetch("/api/auth/session", { credentials: "include", cache: "no-store" }),
        ]);
        const [statusData, sessionData] = await Promise.all([statusResponse.json().catch(() => ({})), sessionResponse.json().catch(() => ({}))]);
        if (!ativo) return;
        if (!statusResponse.ok || !statusData.disponivel) throw new Error(statusData.motivo || "Autenticação indisponível.");
        setStatus({ carregando: false, primeiroAcesso: statusData.primeiroAcesso === true, configuracaoNecessaria: statusData.configuracaoNecessaria === true, erro: "" });
        setAuth(sessionResponse.ok && sessionData.autenticado ? { usuario: sessionData.usuario, cnpjs: sessionData.cnpjs || [], administrador: sessionData.administrador === true } : null);
      } catch (error) {
        if (!ativo) return;
        setStatus({ carregando: false, primeiroAcesso: false, configuracaoNecessaria: false, erro: error instanceof Error ? error.message : "Não foi possível validar o acesso." });
      }
    })();
    return () => { ativo = false; };
  }, []);

  const efetuarLogin = async (usuario: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ login: usuario, senha: password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.sucesso !== true) throw new Error(data.motivo || "Não foi possível entrar.");
    await atualizarAcesso();
  };

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setEnviando(true);
    setMensagem("");
    try {
      if (status.primeiroAcesso) {
        const cnpjs = cnpjsInput.split(/[\s,;]+/).map((item) => item.toUpperCase().replace(/[^0-9A-Z]/g, "")).filter(Boolean);
        const response = await fetch("/api/auth/bootstrap", {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ token, login, senha, cnpjs }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.sucesso !== true) throw new Error(data.motivo || "Não foi possível configurar o primeiro acesso.");
        await efetuarLogin(login, senha);
        setToken("");
      } else {
        await efetuarLogin(login, senha);
      }
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : "Falha no acesso.");
    } finally {
      setEnviando(false);
    }
  };

  const sair = async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } finally { setAuth(null); }
  };

  const value = useMemo(() => auth ? { ...auth, sair, atualizarAcesso } : null, [auth]);
  if (auth) return <AuthContext.Provider value={value!}>{children}</AuthContext.Provider>;

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <section className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="bg-[#082B66] px-6 py-5 text-white">
          <div className="text-xs font-semibold uppercase tracking-widest text-blue-200">Murade Contábil · acesso seguro</div>
          <h1 className="mt-2 text-2xl font-black">{status.primeiroAcesso ? "Configurar primeiro acesso" : "Entrar"}</h1>
          <p className="mt-1 text-sm text-blue-100">Os dados contábeis ficam separados por CNPJ e vinculados à sua sessão.</p>
        </div>
        <form className="space-y-4 p-6" onSubmit={enviar}>
          {status.carregando && <p className="text-sm text-slate-600">Verificando banco persistente…</p>}
          {status.erro && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{status.erro}</div>}
          {status.configuracaoNecessaria && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">O primeiro acesso ainda não foi criado. Configure <code>CONTABIL_AUTH_BOOTSTRAP_TOKEN</code> nas variáveis do serviço Contábil no Render e recarregue esta página.</div>}
          {status.primeiroAcesso && (
            <>
              <label className="block text-sm font-semibold text-slate-700">Código temporário do Render
                <input autoComplete="off" required value={token} onChange={(event) => setToken(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="block text-sm font-semibold text-slate-700">CNPJs autorizados
                <textarea required rows={3} value={cnpjsInput} onChange={(event) => setCnpjsInput(event.target.value)} placeholder="Um CNPJ por linha ou separados por vírgula" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono font-normal" />
              </label>
            </>
          )}
          {!status.carregando && !status.erro && !status.primeiroAcesso && !status.configuracaoNecessaria && (
            <>
              <label className="block text-sm font-semibold text-slate-700">Usuário
                <input autoComplete="username" required value={login} onChange={(event) => setLogin(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="block text-sm font-semibold text-slate-700">Senha
                <input type="password" autoComplete="current-password" required value={senha} onChange={(event) => setSenha(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
            </>
          )}
          {status.primeiroAcesso && (
            <>
              <label className="block text-sm font-semibold text-slate-700">Usuário administrador
                <input autoComplete="username" required value={login} onChange={(event) => setLogin(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="block text-sm font-semibold text-slate-700">Senha (mínimo 12 caracteres)
                <input type="password" autoComplete="new-password" required minLength={12} value={senha} onChange={(event) => setSenha(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
            </>
          )}
          {mensagem && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{mensagem}</p>}
          {!status.carregando && !status.erro && !status.configuracaoNecessaria && !auth && (
            <button disabled={enviando} className="w-full rounded-lg bg-blue-700 px-4 py-3 font-bold text-white disabled:opacity-60">{enviando ? "Aguarde…" : status.primeiroAcesso ? "Criar acesso e entrar" : "Entrar"}</button>
          )}
          <p className="text-xs text-slate-500">A senha é armazenada como hash; o navegador recebe apenas um cookie de sessão HTTP-only.</p>
        </form>
      </section>
    </main>
  );
};
