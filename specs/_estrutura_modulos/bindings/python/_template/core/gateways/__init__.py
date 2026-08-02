"""Gateways do modulo <modulo>: o que ele precisa de OUTROS MODULOS.
Lei dona: doutrina/01-modulo.md §6.  Decisao: ADR-002.

PORTA e infraestrutura (banco, storage, auth). GATEWAY e outro modulo.
Sao riscos diferentes, por isso moram em pastas diferentes — e o gate cobra regras diferentes:

  - arquivo aqui fala EXCLUSIVAMENTE HTTP (regra `gateway-http`);
    nenhum SQL, nenhuma conexao, nenhum acesso a tabela — nem a propria;
  - cada arquivo aqui TEM entrada em modulo.json:consome (regra `gateway-declarado`);
  - o grafo de `consome` nao pode ter ciclo (regra `consome-ciclo`);
  - a URL base vem do ambiente, nunca literal (regra `hardcode-url`).

Este modulo nasce sem gateway (`consome: []`). Para acrescentar um, crie
`core/gateways/<outro>.py` seguindo a forma abaixo e declare-o no manifesto:

    # core/gateways/financeiro.py
    import httpx
    from . import ErroDeGateway

    class FinanceiroGateway:
        def __init__(self, base_url: str) -> None:
            self._base_url = base_url

        async def obter_aliquota_vigente_pct(self) -> float:
            async with httpx.AsyncClient() as cliente:
                resposta = await cliente.get(f"{self._base_url}/aliquotas/vigente")
            if resposta.status_code != 200:
                raise ErroDeGateway("financeiro", f"HTTP {resposta.status_code}")
            return float(resposta.json()["valor"])   # projete SO a fatia que declarou precisar
"""
from __future__ import annotations


class ErroDeGateway(Exception):
    """Falha ao falar com outro modulo. A borda a traduz para DEPENDENCIA_EXTERNA (502)."""

    def __init__(self, modulo: str, motivo: str) -> None:
        super().__init__(f'gateway "{modulo}" indisponivel: {motivo}')
        self.modulo = modulo
