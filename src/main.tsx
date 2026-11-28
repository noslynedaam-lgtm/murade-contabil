import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { aplicarTamanhoLetra } from './utils/tamanhoLetra';
aplicarTamanhoLetra();
import App from './App.tsx';
import './index.css';
import { SinoChamadosSupervisor, RespostasDoSupervisor } from './components/ChamadosSupervisor';
import { AtivarAvisosContabil } from './components/AtivarAvisosContabil';
import './services/muradeRobosEngine.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <SinoChamadosSupervisor ativarAvisos={<AtivarAvisosContabil />} />
    <RespostasDoSupervisor />
  </StrictMode>,
);
