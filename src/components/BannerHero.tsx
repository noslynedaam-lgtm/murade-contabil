import React from "react";

interface BannerHeroProps {
  onAbaClick?: (aba: string) => void;
}

export const BannerHero: React.FC<BannerHeroProps> = () => {
  return (
    <div className="bg-[#082B66] border border-[#0A357D] text-white rounded-xl py-2 px-3.5 sm:px-4 mb-3 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="font-extrabold text-white text-xs sm:text-sm tracking-tight">
          Murade Contábil
        </h1>
        <span className="text-blue-200 hidden md:inline text-[11px]">
          Contabilidade Autônoma
        </span>
      </div>
    </div>
  );
};
