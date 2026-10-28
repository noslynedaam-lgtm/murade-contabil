import React, { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

export interface ItemBusca {
  id: string;
  rotulo: string;
  tipo: string;
  /** Palavras extras que também encontram o item (sinônimos). */
  palavras?: string;
  acao: () => void;
}

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Barra de pesquisa do topo: acha módulos, empresas e contas do plano. Enter abre o primeiro resultado. */
export const BuscaGlobal: React.FC<{ itens: ItemBusca[]; placeholder?: string }> = ({ itens, placeholder }) => {
  const [texto, setTexto] = useState("");
  const [aberta, setAberta] = useState(false);
  const [indice, setIndice] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  const resultados = useMemo(() => {
    const termos = normalizar(texto).split(/\s+/).filter(Boolean);
    if (termos.length === 0) return itens.filter((i) => i.tipo === "Módulo").slice(0, 6);
    return itens
      .filter((i) => { const alvo = normalizar(`${i.rotulo} ${i.palavras || ""}`); return termos.every((t) => alvo.includes(t)); })
      .slice(0, 8);
  }, [texto, itens]);

  const escolher = (item: ItemBusca) => {
    item.acao();
    setTexto("");
    setAberta(false);
    entrada.current?.blur();
  };

  return (
    <div className="relative w-full">
      <Search className="w-4 h-4 text-white/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        ref={entrada}
        type="search"
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setIndice(0); setAberta(true); }}
        onFocus={() => setAberta(true)}
        onBlur={() => setTimeout(() => setAberta(false), 200)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIndice((i) => Math.min(i + 1, resultados.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIndice((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && resultados[indice]) { e.preventDefault(); escolher(resultados[indice]); }
          else if (e.key === "Escape") { setAberta(false); entrada.current?.blur(); }
        }}
        placeholder={placeholder || "Pesquisar módulo, empresa ou conta..."}
        aria-label="Pesquisar no sistema"
        className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-white/20 bg-white/15 focus:bg-white focus:text-[#1D2129] focus:placeholder-gray-400 text-xs text-white placeholder-white/70 outline-none transition-colors"
      />
      {aberta && (
        <div className="absolute left-0 right-0 mt-1 bg-white text-[#1D2129] border border-[#E5E6EB] rounded-lg shadow-2xl p-1.5 z-50 text-xs max-h-80 overflow-y-auto">
          <div className="text-[10px] text-[#86909C] px-2 py-1 font-semibold uppercase tracking-wider">
            {texto.trim() ? "Resultados" : "Acesso rápido"}
          </div>
          {resultados.length === 0 && <div className="px-2.5 py-2 text-[#4E5969]">Nada encontrado. Tente outra palavra.</div>}
          {resultados.map((r, i) => (
            <div
              key={r.id}
              onMouseDown={(e) => { e.preventDefault(); escolher(r); }}
              onMouseEnter={() => setIndice(i)}
              className={`px-2.5 py-1.5 rounded cursor-pointer flex items-center justify-between gap-2 ${i === indice ? "bg-[#EEF4FB] text-[#0F2B5B]" : "text-[#4E5969]"}`}
            >
              <span className="truncate">{r.rotulo}</span>
              <span className="text-[10px] px-1.5 rounded bg-[#F2F3F5] text-[#0F2B5B] shrink-0">{r.tipo}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
