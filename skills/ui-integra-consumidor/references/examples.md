# Exemplos de Importação

## Exemplo Bom
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
