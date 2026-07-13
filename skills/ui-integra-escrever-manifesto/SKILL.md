---
name: ui-integra-escrever-manifesto
description: Ensina a compor telas, componentes e lógicas construindo arquivos JSON válidos para o SarakManifestRenderer. Use ao criar ou editar páginas de interface num consumidor que já importou @sarak/lib-ui-core, ou logo após rodar a skill ui-integra-consumidor (Handoff). NÃO acione proativamente.
---

# Skill: Escrever Manifesto Declarativo (UI)

Skill responsável por transformar regras de negócio e rabiscos de interface em arquivos JSON estritamente tipados que a Engine da Sarak processará para desenhar telas reativas. 

## Quando usar
- Sempre que o usuário pedir para "criar uma tela nova", "montar um modal", "construir um formulário" ou "desenhar uma tabela" num projeto consumidor que já tem a `Sarak-Lib-UI-Core` instalada.
- Quando precisar adicionar lógicas visuais (If, For) ou interações de botões (Eventos) num layout já existente.
- Use APENAS sob demanda. NÃO acione proativamente.

## Workflow (Composição do JSON)

Ao instruir o agente ou escrever código para criar uma tela, siga obrigatoriamente estes blocos:

1. **A Raiz do Nó (ManifestNode)**
   - Todo JSON começa com um nó. A chave obrigatória é `type` (Ex: `"type": "SarakGrid"`, `"type": "SarakButton"`).
   - O array `children` aninha sub-nós para montar a árvore hierárquica.
2. **Propriedades Visuais (Props)**
   - Propriedades de estilo são injetadas no bloco `"props": {}`. 
   - Apenas tokens de design válidos definidos na Sarak UI Core podem ser usados (ex: `"gap": "spacing-md"`, `"color": "primary-500"`). **Jamais** use valores hardcoded absolutos (como `15px` ou `#FF0000`).
3. **Motores de Lógica (Control Flow)**
   - **Condicionais:** Use `"renderIf": "{{user.isLogged}}"` na raiz de um nó para exibi-lo condicionalmente. A Sarak Engine (Safe Evaluator) resolverá a expressão Javascript contra a DataStore injetada.
   - **Repetição:** Use `"renderFor": "{{minhaListaDeItens}}"` para iterar. A engine clonará a sub-árvore injetando o escopo local (ex: acessível via `{{item.nome}}`).
4. **Data Binding & Pipes**
   - Strings de conteúdo visual podem conter expressões reativas usando chaves duplas: `"label": "Olá, {{user.name | capitalize}}!"`.
   - Modificadores de formatação (*Pipes*) como `currency`, `date` ou `uppercase` ficam após o caractere `|`.
5. **Eventos e Ações (Dispatcher)**
   - Interações são declaradas em `"actions": []` — **array plano**, nunca um objeto com chaves de evento (`onClick`/`onSubmit`). A própria Engine decide o gatilho: `onClick` em botões, `onChange` em campos com `model`. Não existe `"actions": { "onClick": [...] }` — isso quebra a iteração da Engine (`actions` deixa de ser iterável) e o nó cai no Error Boundary.
   - `api_call` exige `endpoint`/`method`/`body`/`params` dentro de `payload` — **nunca soltos** no objeto da ação (o Dispatcher só lê `action.payload.*`).
   - Exemplo (Botão de Salvar que dispara API e fecha modal):
     ```json
     "actions": [
       { "type": "api_call", "payload": { "endpoint": "/api/save", "method": "POST", "body": "{{formState}}" } },
       { "type": "mutate_state", "payload": { "path": "isModalOpen", "value": false } }
     ]
     ```
   - **Erro comum a evitar** (schema que já causou falha real em produção — o nó renderiza um erro genérico em vez do botão):
     ```json
     // ❌ ERRADO: "actions" como objeto, endpoint/method soltos
     "actions": { "onClick": [{ "type": "api_call", "endpoint": "/api/save", "method": "POST" }] }
     ```

## Regras de Ouro e Segurança
- **Proibição do TSX:** Telas não são construídas misturando componentes React (`<SarakCard>`) no código do consumidor. Tudo é um objeto JSON.
- **Isolamento de Escopo (No-Eval):** As expressões dentro de `{{ }}` rodam num ambiente restrito (Safe Eval). **Nunca** instrua ou crie códigos que tentem acessar `window`, `document` ou funções globais nativas do browser por dentro do JSON. Utilize apenas variáveis presentes na DataStore.

## Referências
- A gramática estrita do manifesto pertence à **Spec 11** da Sarak-Lib-UI-Core.
