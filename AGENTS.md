# Instruções do ecossistema Sarak

Esta é a base de inteligência Sarak. As capacidades reutilizáveis ficam em `skills/`; carregue a skill
adequada antes de executar o workflow que ela define. As especificações e templates normativos ficam em
`specs/`. Não replique suas regras em comandos, agentes ou hooks: aponte para a fonte de verdade.

## Invariantes de código

- Mantenha módulos, arquivos e funções com uma responsabilidade clara.
- Prefira guard clauses, nomes reveladores de intenção e estruturas pequenas; evite aninhamento profundo.
- Não embuta segredos. Use variáveis de ambiente para valores sensíveis e configuração versionada para
  parâmetros não sensíveis.
- Valide toda entrada externa na fronteira apropriada e trate falhas de forma explícita.
- Inclua testes para lógica nova ou refatoração complexa e execute a verificação pertinente antes de concluir.

## Arquitetura modular

- Para projetos que adotam o template de módulos, a fronteira física da pasta é a fronteira de dependência.
- A regra normativa está em `specs/_estrutura_modulos/doutrina/04-regras.md`; não invente uma estrutura
  modular parcial quando o projeto não adota o template.
- Valide projetos do template com `node tools/gate/validate.mjs --all`.

## Uso da base

- Skills são capacidades selecionadas pelo pedido e pela descrição; leia o `SKILL.md` antes de agir.
- Commands e manifests em `commands/` e `agents/` são adaptadores legados de outros provedores. Preserve-os,
  mas no Codex aplique o workflow da skill correspondente e use subagentes somente quando o trabalho for
  isolado, de baixo risco e não exigir confirmação humana.
- Mudanças destrutivas, de produção, de segurança ou com custo exigem confirmação explícita do usuário.
