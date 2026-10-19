import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { UserPlus, X, LogOut, KeyRound } from "lucide-react";

type Membership = { cnpj: string; role: "admin" | "operator" | "viewer" };
type AuthData = { usuario: string; cnpjs: string[]; memberships: Membership[]; administrador: boolean };
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
  const [modo, setModo] = useState<"login" | "ativar">("login");
  const [convite, setConvite] = useState("");
  const [painelUsuarios, setPainelUsuarios] = useState(false);
  const [cnpjUsuarios, setCnpjUsuarios] = useState("");
  const [novoLogin, setNovoLogin] = useState("");
  const [novoPerfil, setNovoPerfil] = useState<Membership["role"]>("operator");
  const [loginExistente, setLoginExistente] = useState("");
  const [perfilExistente, setPerfilExistente] = useState<Membership["role"]>("operator");
  const [codigoConvite, setCodigoConvite] = useState("");
  const [erroConvite, setErroConvite] = useState("");
  const [usuarios, setUsuarios] = useState<Array<{ login: string; role: string }>>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("convite");
    if (token) { setConvite(token); setLogin(params.get("login") || ""); setModo("ativar"); }
  }, []);

  const atualizarAcesso = async () => {
    const response = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.motivo || "Não foi possível consultar a sessão.");
    setAuth(data.autenticado ? { usuario: data.usuario, cnpjs: data.cnpjs || [], memberships: data.memberships || [], administrador: data.administrador === true } : null);
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
        setAuth(sessionResponse.ok && sessionData.autenticado ? { usuario: sessionData.usuario, cnpjs: sessionData.cnpjs || [], memberships: sessionData.memberships || [], administrador: sessionData.administrador === true } : null);
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
      if (modo === "ativar") {
        const response = await fetch("/api/auth/redeem", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ convite, login, senha }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.sucesso !== true) throw new Error(data.motivo || "Não foi possível ativar o convite.");
        window.history.replaceState({}, document.title, window.location.pathname);
        setConvite(""); setModo("login");
        await efetuarLogin(login, senha);
      } else if (status.primeiroAcesso) {
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
  const empresasAdministradas = auth?.administrador ? auth.cnpjs : auth?.memberships.filter((item) => item.role === "admin").map((item) => item.cnpj) || [];
  useEffect(() => { if (!cnpjUsuarios && empresasAdministradas.length) setCnpjUsuarios(empresasAdministradas[0]); }, [empresasAdministradas.join(",")]);
  useEffect(() => {
    if (!painelUsuarios || !cnpjUsuarios) return;
    void fetch(`/api/auth/users?cnpj=${encodeURIComponent(cnpjUsuarios)}`, { credentials: "include", cache: "no-store" }).then((r) => r.json()).then((data) => setUsuarios(Array.isArray(data.usuarios) ? data.usuarios : [])).catch(() => setUsuarios([]));
  }, [painelUsuarios, cnpjUsuarios]);
  const criarConvite = async (event: React.FormEvent) => {
    event.preventDefault(); setErroConvite(""); setCodigoConvite("");
    try {
      const response = await fetch("/api/auth/invites", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ login: novoLogin, cnpj: cnpjUsuarios, role: novoPerfil }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.sucesso !== true) throw new Error(data.motivo || "Não foi possível criar o convite.");
      setCodigoConvite(data.conviteUrl || data.convite); setNovoLogin("");
      const list = await fetch(`/api/auth/users?cnpj=${encodeURIComponent(cnpjUsuarios)}`, { credentials: "include", cache: "no-store" }).then((r) => r.json()); setUsuarios(Array.isArray(list.usuarios) ? list.usuarios : []);
    } catch (error) { setErroConvite(error instanceof Error ? error.message : "Falha ao criar convite."); }
  };
  const revogar = async (usuario: string) => {
    if (!window.confirm(`Revogar o acesso de ${usuario} a ${cnpjUsuarios}? Os dados contábeis da empresa serão preservados.`)) return;
    const response = await fetch(`/api/auth/users/${encodeURIComponent(usuario)}?cnpj=${encodeURIComponent(cnpjUsuarios)}`, { method: "DELETE", credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.sucesso !== true) { setErroConvite(data.motivo || "Não foi possível revogar o acesso."); return; }
    setUsuarios((prev) => prev.filter((item) => item.login !== usuario));
  };
  const vincularExistente = async (event: React.FormEvent) => {
    event.preventDefault(); setErroConvite("");
    try {
      const response = await fetch("/api/auth/access", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ login: loginExistente, cnpj: cnpjUsuarios, role: perfilExistente }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.sucesso !== true) throw new Error(data.motivo || "Não foi possível vincular a conta existente.");
      setLoginExistente(""); const list = await fetch(`/api/auth/users?cnpj=${encodeURIComponent(cnpjUsuarios)}`, { credentials: "include", cache: "no-store" }).then((r) => r.json()); setUsuarios(Array.isArray(list.usuarios) ? list.usuarios : []);
    } catch (error) { setErroConvite(error instanceof Error ? error.message : "Falha ao vincular usuário."); }
  };
  if (auth) return <AuthContext.Provider value={value!}>
    <div className="sticky top-0 z-[100] flex min-h-10 flex-wrap items-center justify-between gap-2 bg-slate-950 px-4 py-1.5 text-xs text-white"><span>Conta: <strong>{auth.usuario}</strong> · {auth.cnpjs.length} empresa(s) autorizada(s)</span><div className="flex gap-2">{empresasAdministradas.length > 0 && <button onClick={() => setPainelUsuarios(true)} className="rounded bg-white/15 px-3 py-1 hover:bg-white/25"><UserPlus className="mr-1 inline h-3.5 w-3.5" /> Usuários e licenças</button>}<button onClick={() => void sair()} className="rounded bg-white/15 px-3 py-1 hover:bg-white/25"><LogOut className="mr-1 inline h-3.5 w-3.5" /> Sair</button></div></div>
    {painelUsuarios && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"><section className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 shadow-2xl"><header className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Usuários e licenças por empresa</h2><button onClick={() => setPainelUsuarios(false)} aria-label="Fechar"><X /></button></header>
      <label className="block text-sm font-semibold">Empresa<select value={cnpjUsuarios} onChange={(e) => setCnpjUsuarios(e.target.value)} className="mt-1 w-full rounded-lg border p-2">{empresasAdministradas.map((cnpj) => <option key={cnpj}>{cnpj}</option>)}</select></label>
      <form onSubmit={criarConvite} className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">Convidar usuário individual</h3><p className="text-xs text-slate-600">A pessoa define a própria senha ao ativar o convite; você não recebe nem compartilha a senha.</p><label className="block text-sm">Login<input required value={novoLogin} onChange={(e) => setNovoLogin(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label><label className="block text-sm">Acesso<select value={novoPerfil} onChange={(e) => setNovoPerfil(e.target.value as Membership["role"])} className="mt-1 w-full rounded-lg border p-2"><option value="operator">Operador</option><option value="viewer">Somente leitura</option><option value="admin">Administrador da empresa</option></select></label><button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white"><KeyRound className="mr-1 inline h-4 w-4" /> Gerar convite (válido por 24 horas)</button></form>
      <form onSubmit={vincularExistente} className="mt-3 space-y-2 rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">Dar acesso a uma conta existente</h3><p className="text-xs text-slate-600">A senha que o usuário já escolheu não muda nem é compartilhada.</p><input required value={loginExistente} onChange={(e) => setLoginExistente(e.target.value)} placeholder="Login cadastrado" className="w-full rounded-lg border p-2" /><div className="flex gap-2"><select value={perfilExistente} onChange={(e) => setPerfilExistente(e.target.value as Membership["role"])} className="flex-1 rounded-lg border p-2"><option value="operator">Operador</option><option value="viewer">Somente leitura</option><option value="admin">Administrador da empresa</option></select><button className="rounded-lg bg-slate-800 px-3 text-white">Vincular</button></div></form>
      {codigoConvite && <div className="mt-3 break-all rounded-lg border border-green-300 bg-green-50 p-3 text-sm"><strong>Link de convite (válido por 24 horas):</strong><p className="mt-1"><a className="font-semibold text-blue-800 underline" href={codigoConvite}>{codigoConvite}</a></p><button type="button" className="mt-2 rounded bg-green-800 px-3 py-1.5 font-semibold text-white" onClick={() => void navigator.clipboard.writeText(codigoConvite)}>Copiar link</button><a className="ml-2 mt-2 inline-block rounded bg-emerald-700 px-3 py-1.5 font-semibold text-white" href={`https://wa.me/?text=${encodeURIComponent(`Convite de acesso ao Murade Contábil (válido por 24 horas). Abra o link e crie sua senha: ${codigoConvite}`)}`} target="_blank" rel="noreferrer">Enviar pelo WhatsApp</a><p className="mt-1 text-xs">Envie o link em particular pelo WhatsApp. Ao abrir, a pessoa cria a própria senha.</p></div>}{erroConvite && <p role="alert" className="mt-3 text-sm text-red-700">{erroConvite}</p>}
      <div className="mt-5"><h3 className="mb-2 font-semibold">Acessos ativos</h3>{usuarios.map((user) => <div key={user.login} className="flex items-center justify-between border-t py-2 text-sm"><span>{user.login} <span className="text-slate-500">· {user.role}</span></span>{user.login !== auth.usuario && <button onClick={() => void revogar(user.login)} className="text-red-700 hover:underline">Revogar</button>}</div>)}</div>
    </section></div>}
    {children}
  </AuthContext.Provider>;

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
          {!status.carregando && !status.primeiroAcesso && !status.configuracaoNecessaria && <div className="flex rounded-lg bg-slate-100 p-1 text-sm"><button type="button" onClick={() => setModo("login")} className={`flex-1 rounded-md p-2 ${modo === "login" ? "bg-white shadow font-semibold" : ""}`}>Entrar</button><button type="button" onClick={() => setModo("ativar")} className={`flex-1 rounded-md p-2 ${modo === "ativar" ? "bg-white shadow font-semibold" : ""}`}>Ativar convite</button></div>}
          {modo === "ativar" && !status.primeiroAcesso && (convite ? <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Convite recebido pelo link. Crie seu usuário e sua senha para ativar o acesso.</p> : <label className="block text-sm font-semibold text-slate-700">Link ou código do convite<input autoComplete="one-time-code" required value={convite} onChange={(event) => setConvite(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>)}
          {!status.carregando && !status.erro && !status.primeiroAcesso && !status.configuracaoNecessaria && (
            <>
              <label className="block text-sm font-semibold text-slate-700">Usuário
                <input autoComplete="username" required readOnly={Boolean(convite)} value={login} onChange={(event) => setLogin(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal read-only:bg-slate-100" />
              </label>
              <label className="block text-sm font-semibold text-slate-700">Senha{modo === "ativar" ? " (mínimo 12 caracteres)" : ""}
                <input type="password" autoComplete={modo === "ativar" ? "new-password" : "current-password"} required minLength={modo === "ativar" ? 12 : undefined} value={senha} onChange={(event) => setSenha(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
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
            <button disabled={enviando} className="w-full rounded-lg bg-blue-700 px-4 py-3 font-bold text-white disabled:opacity-60">{enviando ? "Aguarde…" : status.primeiroAcesso ? "Criar acesso e entrar" : modo === "ativar" ? "Ativar conta e entrar" : "Entrar"}</button>
          )}
          <p className="text-xs text-slate-500">A senha é armazenada como hash; o navegador recebe apenas um cookie de sessão HTTP-only.</p>
        </form>
      </section>
    </main>
  );
};
