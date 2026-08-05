/**
 * regras/operacao.mjs — família "Operação" do catálogo (specs/arquitetura/04-regras.md §4.6).
 * ids: log, determinismo, gateway-credencial, random-inseguro
 *
 * Todas leem `arquivo.linhasCodigo`, nunca o conteúdo bruto: comentário e docstring não são
 * código, e a lei escrita num comentário não pode virar violação dela mesma.
 */

/**
 * Sufixo que denuncia CREDENCIAL numa chave de env. Vocabulário fechado, e o ÚNICO — exportado
 * porque `segredo-em-publico` (§4.4) faz a mesma pergunta sobre a mesma chave, por outro ângulo.
 * Uma segunda lista divergiria da primeira na primeira vez que alguém acrescentasse um sufixo.
 */
export const PADRAO_CREDENCIAL = /_(API_KEY|SECRET|TOKEN|PASSWORD|SENHA|CLIENT_SECRET|PRIVATE_KEY)$/;

/**
 * Geradores NÃO-criptográficos. `Math.random` e o módulo `random` do Python são previsíveis por
 * construção: dada a semente, a sequência inteira sai. Para token, segredo ou id de sessão, isso é
 * o defeito — o certo é CSPRNG (`crypto.randomUUID`, `crypto.getRandomValues`, `secrets`).
 */
const RNG_FRACO = /Math\.random\(|\brandom\.(?:random|randint|randrange|choice|choices|shuffle|sample|uniform)\(/;

/**
 * O que torna o RNG fraco um problema de SEGURANÇA, e não só de estilo: o valor gerado é usado
 * como credencial. Vocabulário fechado e deliberadamente estreito — exige o contexto na MESMA
 * linha, então `const cor = Math.random()` passa e `const token = Math.random()` cai.
 *
 * `hash` fica de FORA de propósito: aqui ele é o identificador público e universal do registro
 * (02-contrato-e-dados §4), não um segredo. Incluí-lo acusaria o gerador de id de todo adapter.
 */
const PALAVRAS_SECRETAS = new Set([
  'token', 'secret', 'segredo', 'senha', 'password', 'passwd', 'apikey',
  'nonce', 'salt', 'session', 'sessao', 'otp', 'csrf', 'jwt', 'credencial',
]);

/**
 * As palavras de uma linha, com camelCase e snake_case desmontados: `novoToken` vira
 * `['novo', 'token']`.
 *
 * Por palavra INTEIRA, e não por substring, nas duas direções: `\btoken\b` não casaria dentro de
 * `novoToken` (não há fronteira entre `o` e `T`), e a substring solta faria `assalto` casar `salt`.
 * Desmontar o identificador resolve os dois de uma vez.
 */
function palavrasDe(texto) {
  return texto
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((parte) => parte !== '')
    .map((parte) => parte.toLowerCase());
}

/** Bigrama junto cobre `api_key` e `apiKey`, que desmontam em duas palavras genéricas. */
function temContextoSecreto(texto) {
  const palavras = palavrasDe(texto);
  return palavras.some((palavra, indice) => (
    PALAVRAS_SECRETAS.has(palavra) || PALAVRAS_SECRETAS.has(palavra + (palavras[indice + 1] ?? ''))
  ));
}

/**
 * Onde procurar o contexto secreto. A linha do RNG, e — só quando ela é um `return` — também a
 * linha de código anterior.
 *
 * A janela existe pela forma canônica, que tem o nome na assinatura e o gerador no corpo:
 *
 *     function novoToken() {
 *       return String(Math.random());
 *     }
 *
 * Exigir tudo na mesma linha deixaria escapar justamente essa, que é a mais comum. Uma linha, e só
 * em `return`, é o quanto dá para ampliar sem falso positivo: `const jitter = Math.random()` logo
 * abaixo de uma linha que fala de token continua passando, porque não é `return`.
 */
function contextoSecretoPerto(texto, anterior) {
  if (temContextoSecreto(texto)) return true;
  return /^\s*return\b/.test(texto) && anterior !== undefined && temContextoSecreto(anterior);
}

/** Percorre as linhas de código de cada arquivo do módulo que casa o filtro. */
function varrer(ctx, filtrar, padrao, mensagem) {
  const achados = [];
  for (const arquivo of ctx.codigo) {
    if (arquivo.eTeste || !filtrar(arquivo)) continue;
    for (const { numero, texto } of arquivo.linhasCodigo) {
      if (padrao.test(texto)) achados.push(`${arquivo.rel}:${numero}: ${mensagem}`);
    }
  }
  return achados;
}

export default [
  {
    id: 'log',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      return varrer(
        ctx,
        () => true,
        /\bconsole\.\w+\(|(^|[^.\w])print\(/,
        'saida direta — use o logger estruturado',
      );
    },
  },
  {
    id: 'determinismo',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      return varrer(
        ctx,
        (arquivo) => arquivo.rel.startsWith('core/'),
        /Math\.random\(|new Date\(\s*\)|Date\.now\(|datetime\.now\(|\brandom\.\w+\(/,
        'nao-determinismo em core/ — use as portas relogio e geradorId',
      );
    },
  },
  {
    id: 'random-inseguro',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      for (const arquivo of ctx.codigo) {
        // FRONTEIRA com `determinismo`, e ela e explicita: dentro de `core/` quem cobra RNG fraco e
        // o `determinismo`, por reprodutibilidade, e o conserto dele (receber a porta `geradorId`)
        // ja resolve o lado da seguranca. Acusar aqui tambem daria duas mensagens para um conserto
        // so. Fora de `core/` o `determinismo` cala, e e exatamente ali que esta regra vive.
        if (arquivo.eTeste || arquivo.rel.startsWith('core/')) continue;
        arquivo.linhasCodigo.forEach(({ numero, texto }, indice) => {
          if (RNG_FRACO.test(texto) && contextoSecretoPerto(texto, arquivo.linhasCodigo[indice - 1]?.texto)) {
            achados.push(`${arquivo.rel}:${numero}: token/segredo gerado com RNG nao-criptografico`
              + ' — use CSPRNG (crypto.randomUUID, crypto.getRandomValues, secrets)');
          }
        });
      }
      return achados;
    },
  },
  {
    id: 'gateway-credencial',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      if (ctx.manifesto?.papel === 'gateway') return [];
      return (ctx.manifesto?.envRequerido ?? [])
        .filter((chave) => PADRAO_CREDENCIAL.test(chave))
        .map((chave) => `env "${chave}" e credencial de servico externo — so modulo com papel "gateway" pode declarar`);
    },
  },
];
