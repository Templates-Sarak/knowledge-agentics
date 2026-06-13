import React from 'react';
import { SarakAnalyticalPage } from '@sarak/lib-ui-core';
// IMPORTANTE: Substitua o caminho abaixo pelo componente real do seu módulo
import MeuComponentePrincipal from '../components/MeuComponentePrincipal';

/**
 * Painel Adapter - O Corpo do Módulo Sarak UI
 * 
 * Lei Arquitetural: O componente original NUNCA deve ser alterado para fins de responsividade extrema.
 * Qualquer adaptação de tela (domar fontes, colocar barras de rolagem, esconder texto) 
 * DEVE ser feita injetando CSS via Tailwind V4 no wrapper deste Painel.
 */
const Painel: React.FC<any> = (props) => {
    return (
        <SarakAnalyticalPage 
            centeredOnDesktop={true}
            mainContent={
                // Exemplo de CSS Injection: Domando h1 gigante no mobile e adicionando padding
                <div className="max-sm:[&>div]:!p-4 max-sm:[&_h1]:!text-4xl max-sm:[&_h1]:!leading-tight">
                    <MeuComponentePrincipal {...props} />
                </div>
            }
        />
    );
};

export default Painel;
