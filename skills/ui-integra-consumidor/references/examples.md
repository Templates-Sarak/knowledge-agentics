# Exemplos de Importação

## Exemplo Bom — Instalação mínima (SPA/Vite/CRA)
**Situação:** Projeto novo, frontend puro (sem SSR), precisa só renderizar manifestos.

**Instalação completa, do zero:**
```bash
npm install @sarak/lib-ui-core
npm install framer-motion lucide-react recharts echarts echarts-for-react reactflow react-grid-layout react-markdown react-syntax-highlighter react-dropzone pdfjs-dist clsx tailwind-merge date-fns @tanstack/react-virtual axios pg tailwindcss
```

**Entry point (`main.tsx`):**
```tsx
import ReactDOM from 'react-dom/client';
import { SarakUIProvider, SarakManifestRendererDefault, createSarakDataStore } from '@sarak/lib-ui-core';

const store = createSarakDataStore({ initialState: {} });

ReactDOM.createRoot(document.getElementById('root')!).render(
    <SarakUIProvider>
        <SarakManifestRendererDefault payload={meuManifesto} dataStore={store} />
    </SarakUIProvider>,
);
```

**Por que isso é correto:** nenhum `import '...css'` aparece em lugar nenhum. O `SarakUIProvider` injeta o stylesheet completo em runtime assim que é importado (um `<style id="sarak-ui-core-styles">` no `<head>`, gerado no build da lib) — a tela já sai estilizada. Se o `console` mostrar `[Sarak] CSS não detectado...`, é sinal de que a injeção automática falhou (bundler removendo o side-effect); só nesse caso, como último recurso, importe manualmente `@sarak/lib-ui-core/dist/sarak.css`.

## Exemplo Bom — SSR/Next.js (evitando FOUC)
**Situação:** App Next.js com `layout.tsx` renderizado no servidor; quer o CSS já presente no HTML inicial (sem flash de conteúdo sem estilo).

```tsx
// app/layout.tsx
import '@sarak/lib-ui-core/dist/sarak.css'; // opcional: só para SSR sem FOUC
import { SarakUIProvider } from '@sarak/lib-ui-core';
```

**Por que isso é correto:** a injeção automática (runtime, via JS) só acontece depois que o bundle do cliente executa — em SSR isso significa um instante sem estilo até a hidratação. Importar o CSS manualmente no `layout.tsx` server-side elimina esse flash. Essa é a ÚNICA situação em que o import manual de CSS é recomendado — no caso comum (SPA), não faça isso.

## Exemplo Bom (Design Engine)
**Situação:** O Agente detectou que o projeto é um frontend Next.js sem backend Python separado.

**Antes:** O projeto não tinha a Sarak UI instalada. O banco de dados precisava das tabelas do Design Engine.

**Depois (instrumentation.ts):**
```typescript
import { setupUIDatabase } from '@sarak/lib-ui-core/backend/node/database';

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.DATABASE_URL) {
        console.log("Inicializando banco UI Plug & Play");
        await setupUIDatabase(process.env.DATABASE_URL);
    }
}
```

**Por que isso é correto:** Ele delega a criação do schema e das tabelas `custom_themes` completamente para a ponte oficial `bridge-node`, sem precisar rodar queries `.sql` avulsas na aplicação.

## Exemplo Ruim
**Situação:** O Agente tentou instalar o Sarak UI Core.

**O Erro Comum:**
```typescript
import { Client } from 'pg';
import fs from 'fs';

async function inicializar() {
    // ⚠️ ERRO: O consumidor está tentando ler o arquivo e gerenciar a injeção
    const sql = fs.readFileSync('node_modules/@sarak/lib-ui-core/backend/sql/001_init_ui_schema.sql');
    const client = new Client();
    await client.query(sql);
}
```

**Por que é ruim:** O agente violou a arquitetura Plug & Play. O consumidor **nunca** deve ler ou processar o script SQL. Ele deve importar as funções da Bridge nativa (`setupUIDatabase`), que já encapsulam toda essa lógica, garantindo estabilidade e self-healing automático mantido pela equipe principal da biblioteca.
