# Checklist de Segurança de API (OWASP API Top 10)

## Autorização (as falhas mais comuns)
- [ ] **BOLA/IDOR** (API1): todo endpoint que recebe ID confirma que o objeto pertence ao usuário (ou tem permissão). Nunca `findById(req.params.id)` sem checar dono.
- [ ] **Function-level** (API5): rotas admin/privilegiadas validam role no servidor — não basta ocultar no front.
- [ ] **Mass assignment** (API6): update aceita **allowlist** de campos (`pick(body, ['nome'])`), nunca o `body` inteiro (evita setar `role`/`isAdmin`).
- [ ] **Multi-tenant**: toda query filtra pelo tenant do usuário.

## Abuso e limites de recurso (API4)
- [ ] **Rate limiting** em login, busca, export e endpoints caros (ex.: 100 req/min/IP; mais estrito no login).
- [ ] **Limite de payload** (body size) e **paginação máxima** (não permitir `?limit=100000`).
- [ ] Timeouts e proteção contra operações pesadas sem paginação/stream.

## Exposição de dados (API3)
- [ ] **Excessive data exposure**: a resposta serializa só campos públicos (DTO), não o objeto do banco inteiro (senha_hash, tokens, flags internas).
- [ ] Erros não vazam stack trace/SQL/caminho (ver `cyber-config`).

## Web classics
- [ ] **CORS**: origin específica (allowlist), nunca `*` com `credentials: true` (ver `cyber-config`).
- [ ] **CSRF**: ações de estado (POST/PUT/DELETE) com token anti-CSRF ou `SameSite` + checagem de origin.
- [ ] **SSRF**: fetch/proxy a partir de URL do usuário usa **allowlist de host** e bloqueia IP interno/`169.254.169.254`.
- [ ] **Open redirect**: redirect só para destinos da allowlist.
- [ ] **Webhook**: valida assinatura HMAC do remetente antes de processar.
- [ ] **GraphQL**: limite de profundidade/complexidade; introspection desligada em produção.

## Lógica de negócio
- [ ] **Race/TOCTOU**: operações críticas (saldo, estoque, cupom) com lock/transação atômica.
- [ ] Regras validadas no servidor (preço, quantidade, desconto) — nunca confiar no valor do cliente.

## Teste ativo (DAST leve — só no próprio app/autorizado)
- [ ] Acessar objeto de outro usuário → espera **403/404**, não 200.
- [ ] Estourar o rate limit → espera **429**.
- [ ] Requisição com origin não permitida → CORS bloqueia.
