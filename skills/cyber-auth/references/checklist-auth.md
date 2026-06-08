# Checklist de Autenticação & Sessão

Marque cada item; a coluna de correção é o alvo.

## Senha
- [ ] Armazenada com **bcrypt** ou **argon2id** (com salt) — nunca MD5/SHA1/SHA-256 puro/texto plano.
- [ ] Custo/iterações adequados (bcrypt cost ≥ 10; argon2 padrão).
- [ ] Política mínima (tamanho, sem senha comum); idealmente checar contra listas de vazadas.
- [ ] Reset de senha por token de uso único, com expiração; não revela se o e-mail existe.

## Token / JWT
- [ ] Assinatura **verificada** no servidor a cada request.
- [ ] **Algoritmo fixado** no verify (rejeitar `alg: none` e troca de RS↔HS).
- [ ] `exp` curto (access token) + refresh token rotacionado.
- [ ] Segredo/chave de assinatura **forte e no `.env`** (não hardcoded — ver `cyber-segredos`).
- [ ] Sem dados sensíveis no payload do JWT (é legível por quem tem o token).

## Sessão & cookies
- [ ] Cookie de sessão com **`HttpOnly`**, **`Secure`**, **`SameSite`** (`Lax`/`Strict`).
- [ ] Token de auth **não** em `localStorage`/`sessionStorage` (XSS lê) — preferir cookie `HttpOnly`.
- [ ] Sessão invalidada no logout e na troca de senha; timeout de inatividade.

## Abuso de login
- [ ] **Brute-force**: lockout/backoff progressivo + rate limit no endpoint de login (ver `cyber-api`).
- [ ] **Account enumeration**: mensagem e tempo de resposta **uniformes** entre "não existe" e "senha errada".
- [ ] CAPTCHA/2º fator após N tentativas (opcional).

## Identidade & acesso
- [ ] **MFA** disponível (ao menos para admin).
- [ ] Sem **credenciais default** (admin/admin, senhas de exemplo) em código/seed.
- [ ] Princípio do menor privilégio nas roles atribuídas no login.
