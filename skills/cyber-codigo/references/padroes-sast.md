# Padrões SAST — risco e correção

O que cada achado de `sast_scan.py` significa e a correção segura. Heurístico → confirme o contexto (uso com
input do usuário é o que torna crítico). SQLi e validação de entrada são **norma** do `padrao-escrita`; aqui se audita.

| Tipo | Risco | Correção segura |
|---|---|---|
| **eval / new Function** | execução de código arbitrário se receber input | remover; usar parsing/lookup explícito (`JSON.parse`, mapa) |
| **Command injection** (`exec`, `os.system`, `shell=True`) | RCE se concatenar input no comando | usar APIs com args em array (`execFile`, `subprocess.run([...], shell=False)`); nunca concatenar input |
| **XSS sink** (`innerHTML`, `dangerouslySetInnerHTML`) | XSS armazenado/refletido | renderizar como texto; se HTML, **sanitizar** (DOMPurify); preferir templating que escapa |
| **Cripto fraca** (MD5/SHA1/DES/ECB) | hash/cifra quebrável | senha → `bcrypt`/`argon2`; hash → SHA-256+; cifra → AES-GCM |
| **Random inseguro** (`Math.random`) | token/ID previsível | CSPRNG: `crypto.randomBytes`/`crypto.getRandomValues`/`secrets` |
| **Desserialização insegura** (`pickle.loads`, `yaml.load` sem `SafeLoader`, `unserialize`) | RCE | `yaml.safe_load`; evitar pickle de fonte não confiável; formatos seguros (JSON) |
| **Path traversal** (`../`) | leitura/escrita fora do diretório | normalizar e validar o path contra uma base permitida (`path.resolve` + checagem de prefixo) |
| **SSRF** (`fetch`/`requests` com variável) | servidor acessa URL controlada pelo atacante | allowlist de hosts; bloquear IPs internos/metadata (169.254.169.254) |

## Como triar
- `confianca: alta` → quase sempre real, priorizar.
- `media` → depende se há **input externo** alcançando o ponto (siga o fluxo do dado).
- `baixa` → muito ruído (ex.: `Math.random` para animação é ok; só importa para segredo/token). Confirme a intenção.

> Validação de **todo input na borda `api/`** e **queries parametrizadas** são norma (`padrao-escrita`) — se violadas, registre como achado e corrija conforme a norma.
