/**
 * regras/operacao.mjs — família "Operação" do catálogo (specs/arquitetura/04-regras.md §4.6).
 * ids: log, determinismo, gateway-credencial
 *
 * Todas leem `arquivo.linhasCodigo`, nunca o conteúdo bruto: comentário e docstring não são
 * código, e a lei escrita num comentário não pode virar violação dela mesma.
 */
const PADRAO_CREDENCIAL = /_(API_KEY|SECRET|TOKEN|PASSWORD|SENHA|CLIENT_SECRET|PRIVATE_KEY)$/;

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
