# Workflow Detalhado: Auditoria Contínua de Padrões

Versão expandida do workflow de `SKILL.md`. Este documento detalha como orquestrar a invocação dos validadores e como tratar as falhas sem delegar o trabalho manual de correção para o usuário.

## Passo 1: Identificar a Linguagem/Stack
**Objetivo:** descobrir qual script validador deve ser acionado.
1. Olhe para a extensão principal dos arquivos modificados.
2. Identifique qual skill da família `padrao-[linguagem]` gerencia essa stack. (Ex: `padrao-typescript`, `padrao-python`, `padrao-go`).

## Passo 2: Acionar o Motor de AST
**Objetivo:** Rodar a ferramenta especializada que executa as validações estruturais.
1. Localize o script de validação da respectiva stack. Geralmente fica em `.agents/skills/padrao-[linguagem]/scripts/`.
2. Rode o comando passando o arquivo ou diretório que você modificou como argumento.
   - *Exemplo (TypeScript):* `node .agents/skills/padrao-typescript/scripts/validate.mjs src/meu-modulo`
   - *Exemplo (Python):* `python .agents/skills/padrao-python/scripts/validate.py src/meu-modulo`

## Passo 3: Avaliar o Exit Code e Corrigir Infrações
**Objetivo:** Atuar como um Gatekeeper inegociável.

**O que detectar (no output do script):**
- Funções excedendo 40 linhas (Limiar Físico).
- Mais de 3 níveis de aninhamento lógico (Falta de guard clauses).
- Logs proibidos (`console.log`, `print`).
- Hardcoded strings suspeitas ou segredos vazados.
- Imports cross-module ilegais (ferindo o encapsulamento do domínio).
- Arquivos de teste espelho inexistentes.

**Como corrigir (Ação do Agente):**
1. **NÃO PEÇA DESCULPAS AO USUÁRIO NEM MOSTRE O LOG.** O usuário quer o código pronto e conforme.
2. Vá diretamente aos arquivos apontados e refatore-os.
   - Se a função passou de 40 linhas, extraia trechos menores obedecendo o SRP.
   - Se o import cruzou módulos de forma ilegal (ex: lendo de `domain/` alheio), altere para usar o adaptador/contrato do `api/` do outro módulo.
   - Se o arquivo fonte não tem testes de paridade, crie-os imediatamente.
3. Rode o script de validação novamente (Passo 2).
4. O ciclo só se encerra quando o output for limpo (Exit Code 0).

**Exemplo Prático (Simulação de Output e Correção):**
*O agente roda o script e recebe:*
\`\`\`
[FATAL] src/users/domain/UserService.ts:L45 - Função "processPaymentAndNotify" excede 40 linhas (total: 55).
[FATAL] src/users/domain/UserService.ts:L12 - Import ilegal de "src/orders/domain/OrderEntity". Módulos só se comunicam pelo contrato /api/.
Exit code 1.
\`\`\`
*Ação:* O agente usa a ferramenta para refatorar `UserService.ts`, separando a notificação para uma função auxiliar, e alterando o import para acessar `src/orders/api/index.ts`. Em seguida, re-executa a validação.
