// Tenta carregar o sarak.manifest.json. Em caso de TypeScript com resolveJsonModule false, ajuste conforme a config.
import manifest from './sarak.manifest.json';
import Painel from './Painel';

/**
 * Contrato de Exportação (Barrel)
 * Une o Manifesto e o Painel em um único objeto para consumo rápido pelo host.
 */
export const UI = {
    ...manifest,
    component: Painel
};

export default UI;
