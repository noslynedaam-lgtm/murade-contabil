import React from 'react';
import { PainelChamadosSupervisor } from './ChamadosSupervisor';

// Só o dono do sistema: "Chamados para o supervisor" — pedidos que a Murad de QUALQUER escritório não soube resolver.
// Mesma lista do contador do canto da tela (ChamadosSupervisor.tsx), com Responder e Resolvido (28/11/2026).
export function PainelDuvidasSupervisor() {
  return (
    <section className="mb-5 rounded-xl border-2 border-sky-300 bg-sky-50 p-4">
      <h3 className="mb-1 font-semibold">Chamados para o supervisor</h3>
      <PainelChamadosSupervisor />
    </section>
  );
}
