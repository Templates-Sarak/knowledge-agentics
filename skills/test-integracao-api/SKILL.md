---
name: test-integracao-api
description: Escreve testes de integração focados em endpoints (/api/) com infraestrutura real de banco de dados efêmero (Testcontainers/Docker). Use ao cobrir o contrato real da API validando a persistência de dados e as respostas de rede, sem testar a interface de usuário (UI).
---

# Skill: Testes de Integração de API

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Testes de integração garantem que o "Meio do Caminho" funciona. Diferente do `test-unitario` (que mocka tudo) e do `test-e2e` (que é muito lento e focado na UI), esta skill garante que a lógica de negócio por trás do endpoint interage corretamente com o banco de dados real.

## Quando usar
- Ao precisar validar endpoints HTTP (`GET`, `POST`, etc.) verificando a mudança de estado num banco de dados.
- Roda contra uma infraestrutura real mas efêmera (ex: Testcontainers ou docker-compose temporário).

## Workflow

1. **Definir escopo e ambiente** — Identifique os endpoints a serem testados e como o banco de dados temporário será levantado (Testcontainers é a recomendação padrão em Java/Go/TS/Python).
2. **Setup/Teardown do DB** — Escreva a rotina que sobe o banco limpo antes dos testes, roda as migrations e destrói o banco ao final. Os testes NÃO devem depender de dados persistentes de outras baterias.
3. **Escrever o Cenário (Cliente HTTP)** — Utilize um cliente HTTP (supertest, httpx, REST Assured) para chamar o endpoint simulando o consumidor da API.
4. **Asserções Duplas** — Para requisições que alteram estado (POST/PUT/DELETE):
   - Asserção 1: O código de status HTTP e o corpo da resposta (`201 Created`).
   - Asserção 2: Verificação direta no Banco de Dados para garantir que a persistência ocorreu (efetivamente lendo do DB de testes).
5. **Rodar e Reportar** — Execute a suíte de integração e informe endpoints cobertos e falhas na camada do ORM/DB.

## Regras e limites
- **NÃO** teste a Interface Gráfica (UI) aqui. Isso é responsabilidade do `test-e2e`.
- **NUNCA** faça *mock* do Banco de Dados nesta skill. A função primária desta skill é testar o I/O real do banco.
- **NÃO** rode testes de integração contra bancos de dados de Produção ou Staging compartilhado. Use *bancos efêmeros/containerizados* para não poluir dados.

## Checklist "pronta"
- [ ] O banco de dados é efêmero (Testcontainers ou similar) e tem um processo de teardown limpo?
- [ ] Não há mocks na camada de dados/ORM?
- [ ] As asserções validam tanto o retorno HTTP quanto o estado persistido no banco?
