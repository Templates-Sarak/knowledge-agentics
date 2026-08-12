# Presente de proposito, nao sobra: sem ele "tests" e namespace package (PEP 420), e QUALQUER
# pacote REGULAR chamado "tests" em outro ponto do sys.path do consumidor (uma lib que publicou a
# propria pasta de teste por acidente de empacotamento, por exemplo) vence a porcao de namespace
# local — a ordem do path nao salva. Regular aqui fecha essa porta. `tests/contract/` e
# `tests/domain/` nao precisam do mesmo: uma vez que "tests" e regular, os dois so sao procurados
# dentro do `tests.__path__` já fixado nesta pasta, nunca mais no `sys.path` inteiro (medido).
