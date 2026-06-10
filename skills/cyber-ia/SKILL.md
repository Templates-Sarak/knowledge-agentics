---
name: cyber-ia
description: Auditoria de segurança em IA/LLMs — proteção contra Prompt Injection, Insecure Output Handling, Data Poisoning e abuso de limites (Model DoS). Use ao auditar ou implementar integrações com IA. NÃO acione proativamente.
---

# Skill: Segurança — Inteligência Artificial e LLMs

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Protege as fronteiras de integração com modelos de Inteligência Artificial, alinhada ao **OWASP Top 10 for LLMs**.
Foca em defender o sistema contra manipulações no prompt (Prompt Injection), tratar saídas não confiáveis do modelo (Insecure Output Handling) e evitar abusos de tokenização (Model DoS). Mutativa ao corrigir → HITL.

> Rate limiting genérico de API fica na `cyber-api`; vazamento de segredos na `cyber-segredos`. Aqui a atenção é restrita aos **dados trocados com o LLM**. Globais em `CLAUDE.md`.

## Quando usar
- Sob demanda, ao auditar ou implementar integrações com APIs de IA/LLMs.
- Mutativa (corrige limites, implementa sanitização) → HITL obrigatório.

## Workflow
Trate **uma integração/serviço por vez**.

1. **Mapear Fronteiras** — localize onde o input do usuário encontra o prompt da IA e onde a resposta da IA interage com o sistema (DOM, banco de dados, execução de código).
2. **Prompt Injection** — audite como o contexto é montado. Exija delimitadores claros, templates estritos e, se aplicável, validação semântica/camadas de moderação antes de enviar ao LLM.
3. **Insecure Output Handling** — assuma que o LLM pode ter sofrido *Indirect Injection* ou alucinação. A saída **não é segura**. Exija sanitização estrita (DOMPurify para HTML) ou validação de schema rígido (Zod) caso retorne JSON estruturado.
4. **Data Privacy (Vazamento de PII)** — verifique se dados sensíveis estão sendo enviados no prompt de terceiros sem mascaramento ou minimização (se aplicável, cruze com a `cyber-dados`).
5. **Model DoS e Limites** — confirme a existência de *rate limiting* e tetos físicos: limite severo de caracteres no input, e `max_tokens` razoável configurado na requisição para não gerar custos exorbitantes.
6. **HITL — plano** — achados de injeção + correção (delimitadores, sanitizadores, limites de payload). → "⚠️ Confirma as adequações?". **Aguarde.**
7. **Refatorar + reportar** — aplique os patches, preserve a lógica da IA, teste a feature e reporte o status.

## Regras e limites
- **NUNCA** confie que a saída de um LLM é segura contra XSS ou injeção; passe a resposta por sanitização antes de enviá-la ao front-end ou usá-la em queries dinâmicas.
- **NUNCA** permita que o LLM execute funções ou acesse dados (Tool Calling/RAG) sem controle rígido de autorização que verifique as permissões reais do usuário requerente.
- **NÃO** deixe requisições para LLMs sem limites máximos declarados (`max_tokens`) e limite no tamanho do texto da requisição.
- **NÃO** aplique modificações sem o HITL do passo 6.
- **NÃO** saia do escopo: falhas de infraestrutura → `cyber-infra`; falhas tradicionais de auth → `cyber-auth`.

## Checklist "pronta"
- [ ] Fronteiras de input/output mapeadas e documentadas?
- [ ] Mitigações para Prompt Injection (direto e indireto) aplicadas?
- [ ] Saída do modelo tratada como "untrusted" (sanitizada)?
- [ ] Proteções de Model DoS (Limites e max_tokens) configuradas?
- [ ] PII ofuscada antes de ir pro modelo?
- [ ] HITL feito; patches aplicados preservando o comportamento?

## Referências (Camada 3 — leia sob demanda)
- `references/workflow.md` — workflow detalhado.
- `references/examples.md` — exemplo de mitigação de injection.
