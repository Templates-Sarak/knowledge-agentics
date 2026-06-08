---
name: meta-verificacao-base
description: Verifica a integridade estrutural da base de agentes/skills (agents, commands, hooks, skills). Caça armadilhas YAML, falhas de contrato JSON e ponteiros órfãos. Use APENAS quando pedirem verificação da base. NÃO acione proativamente.
---

# Skill: Verificação de Integridade da Base (X-Skills)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Audita estaticamente o próprio ecossistema de inteligência (a base Sarak), verificando se as normas
arquiteturais (YAML limpos, contratos de saída estritos, *scripts* válidos e ausência de vazamentos)
estão sendo cumpridas.

> Esta skill audita o **comportamento do agente e do ambiente Sarak** (pilares: `agents/`, `commands/`, `hooks/`, `skills/`).
> Auditoria de código de projeto (cliente) é responsabilidade da `code-diagnostico`.

## Quando usar
- Sob demanda, quando houver suspeita de que a arquitetura do agente (uma *skill* ou subagente novo) está corrompida.
- Como passo final após uma grande refatoração nas pastas internas (`skills/`, `agents/`, etc).
- É mutativa (corrige erros apontados), exigindo aprovação (HITL).

## Workflow
Trate **a base inteira** como um único bloco.

1. **Varrer a base** — rode `python scripts/audit_base.py --raiz <caminho_base>`. O script requer o argumento `--raiz` (ex: `.` se estiver na raiz do X-Skills) e varrerá os 4 pilares em busca de:
   - **Armadilhas YAML:** Dois pontos (`: `) indevidos em descrições.
   - **Contratos:** Subagentes sem obrigatoriedade JSON.
   - **Ponteiros/Órfãos:** Inconsistências de nomenclatura.
   - **Erros Sintáticos/Vazamentos:** JSONs inválidos, JS quebrado ou tokens *hardcoded*.
2. **Triar a saída** — interprete a saída em JSON ou lista gerada pelo script. Separe o que é falha fatal (ex: quebra de *parser*) do que é aviso (falso-positivo heurístico).
3. **HITL — Plano de Correção** — liste os arquivos com falha e a proposta exata de correção (ex: trocar `:` por `=` no *frontmatter* da skill X). → "⚠️ Confirma as adequações estruturais?". **Aguarde.**
4. **Adequar** — para cada item aprovado, edite o arquivo respectivo resolvendo a inconsistência apontada. Não invente correções além das necessárias.
5. **Re-scan** — rode o script novamente para atestar que os erros corrigidos desapareceram do relatório.

## Regras e limites
- **NÃO** use caminhos absolutos (`C:\Users\...`). O script é dinâmico; use sempre o caminho atual repassado via `--raiz`.
- **NÃO** altere nenhum arquivo sem passar pelo HITL. Você é um auditor de infraestrutura; mutações são cirúrgicas.
- **NUNCA** classifique *links* markdown entre skills (ex: `references/workflow.md`) como "ponteiros órfãos" sem antes confirmar se a referência não é apenas o cruzamento de contexto para o agente ler.
- **NÃO** saia do escopo: esta *skill* foca nos 4 pilares do *framework* Sarak. Auditoria do produto/código cliente é de responsabilidade da família `code-` ou `cyber-`.

## Checklist "pronta"
- [ ] Script rodado passando o parâmetro `--raiz` sem caminhos fixos?
- [ ] Relatório gerado listando falhas reais vs avisos?
- [ ] Plano de adequação proposto ao usuário via HITL?
- [ ] Correções executadas apenas no que foi aprovado?
- [ ] Novo scan atestando a limpeza total?

## Referências (Camada 3 — leia sob demanda)
- `scripts/audit_base.py` — script de validação determinística de metadados, contratos e sintaxes no ecossistema Sarak.
