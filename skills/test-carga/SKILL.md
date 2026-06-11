---
name: test-carga
description: Escreve e executa testes de estresse, concorrência e performance (k6, Artillery). Use ao precisar avaliar gargalos da aplicação, limites do banco de dados (N+1) e capacidade máxima de requisições. Contém gate HITL obrigatório.
---

# Skill: Testes de Carga e Performance

Garante que a aplicação aguenta o tráfego do mundo real, forçando limites para revelar gargalos (falta de índices no banco, memory leaks, latência).

## Quando usar
- Ao preparar uma infraestrutura para produção e necessitar de um *baseline* de requisições por segundo (RPS).
- Para validar se as otimizações feitas por `otimizacao-nivel-1` realmente melhoraram a performance sob estresse.

## Workflow

1. **Gate HITL (Obrigatório): Estimativa de Concorrência** 
   - **Ação:** PAUSE. Pergunte ao usuário: "Qual o pico estimado de concorrência (Virtual Users - VUs), a duração do teste e o tempo de ramp-up?"
   - **Regra Absoluta:** É PROIBIDO manter valores de estresse *hardcoded* criados por IA. Siga os valores informados pelo humano.
2. **Definir Ferramenta** — Utilize **k6** (preferido para scripts JS limpos) ou **Artillery**.
3. **Escrever o Script de Carga** — Defina as fases (ramp-up, plateau, ramp-down) com base nos dados aprovados no HITL.
4. **Métricas Chave (Thresholds)** — Defina critérios de sucesso da performance (ex: 95% das requisições devem retornar em menos de 200ms, taxa de erro < 1%).
5. **Executar e Analisar** — Rode o teste e correlacione os erros aos limites do banco ou da aplicação. Informe os gargalos.

## Regras e limites
- **NÃO** pule a etapa de HITL para a definição de VUs e RPS. Valores *hardcoded* criados de forma arbitrária pela IA podem causar DDoS não intencional em ambientes limitados.
- **NUNCA** rode testes de carga destrutivos contra bancos de dados de Produção.
- **NÃO** misture testes de fluxo funcional completo (como e2e com Playwright) com testes de carga por serem extremamente pesados; estresse apenas endpoints diretos e críticos da API.

## Checklist "pronta"
- [ ] A etapa HITL foi realizada para obter VUs e duração do teste de carga com o usuário?
- [ ] A métrica de sucesso (Threshold de latência/erros) foi definida no script?
- [ ] A ferramenta escolhida (k6/Artillery) bate direto nos endpoints sem depender da camada pesada de UI (navegadores reais)?
