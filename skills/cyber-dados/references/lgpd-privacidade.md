# LGPD & Privacidade — checklist

## Dados pessoais (PII) — o que mapear
| Categoria | Exemplos | Padrão (para buscar/mascarar) |
|---|---|---|
| Identificadores | CPF, CNPJ, RG | CPF `\d{3}\.?\d{3}\.?\d{3}-?\d{2}`; CNPJ `\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}` |
| Contato | e-mail, telefone | e-mail `[\w.+-]+@[\w-]+\.\w+`; tel `\(?\d{2}\)?\s?\d{4,5}-?\d{4}` |
| Financeiro | cartão, conta | cartão `\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}` |
| **Sensível** (LGPD art. 5º) | saúde, biometria, origem racial, religião, opinião política | atenção redobrada — cifra + acesso restrito |

> Para varrer logs/código por esses padrões, reutilize o scanner da `cyber-segredos` (ajustando os padrões).

## Princípios (LGPD)
- [ ] **Minimização**: coletar só o necessário para a finalidade declarada.
- [ ] **Finalidade & base legal**: cada dado tem propósito e base (consentimento, contrato, obrigação legal).
- [ ] **Consentimento**: explícito e revogável quando a base for consentimento.

## Proteção
- [ ] **Em trânsito**: TLS (ver `cyber-config`).
- [ ] **Em repouso**: campos sensíveis cifrados no banco; chave no `.env`/KMS (não hardcoded — `cyber-segredos`).
- [ ] **Logs**: PII **mascarada** (`123.***.**9-00`, `j***@dominio.com`); nunca cartão/CPF/token crú.
- [ ] **Acesso**: menor privilégio a quem lê dado pessoal; trilha de auditoria de acesso a dado sensível.

## Retenção & direitos do titular
- [ ] **Retenção**: prazo definido; apagar/anonimizar quando não há mais finalidade.
- [ ] **Direitos**: acesso, correção, **exclusão**, portabilidade, informação sobre uso. O sistema precisa suportar (ex.: rota de exclusão de conta que apaga/anonimiza de fato).

## Logging de eventos de segurança
- [ ] Registrar: login (sucesso/falha), mudança de permissão/senha, acesso a dado sensível, exportação.
- [ ] Sem PII/segredo no conteúdo do log; reter logs com prazo e proteção.
