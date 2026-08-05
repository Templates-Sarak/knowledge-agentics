// Testes do dominio do modulo <modulo> — regras e validacao, sem I/O.
import { describe, expect, it } from 'vitest';

import { ErroDeValidacao, montarRegistro } from '../../core/dominio/index.js';
import { gerarArtefato } from '../../core/motor/index.js';
import { registroDeExemplo } from '../fixtures/index.js';

const STATUS_VALIDOS = ['rascunho', 'ativo', 'encerrado'];
const INSTANTE = '2024-01-01T00:00:00.000Z';

describe('montarRegistro', () => {
  it('monta com o primeiro status quando nenhum e informado', () => {
    const registro = montarRegistro({ titulo: 'Exemplo' }, STATUS_VALIDOS, '10001', INSTANTE);
    expect(registro).toEqual({ hash: '10001', titulo: 'Exemplo', status: 'rascunho', criadoEm: INSTANTE });
  });

  it('remove espaco em volta do titulo', () => {
    const registro = montarRegistro({ titulo: '  Exemplo  ' }, STATUS_VALIDOS, '10001', INSTANTE);
    expect(registro.titulo).toBe('Exemplo');
  });

  it('recusa titulo vazio', () => {
    expect(() => montarRegistro({ titulo: '   ' }, STATUS_VALIDOS, '10001', INSTANTE)).toThrow(
      ErroDeValidacao,
    );
  });

  it('recusa status fora do vocabulario de config/dominio.json', () => {
    expect(() =>
      montarRegistro({ titulo: 'X', status: 'inventado' }, STATUS_VALIDOS, '10001', INSTANTE),
    ).toThrow(ErroDeValidacao);
  });

  it('nao inventa instante nem identificador — os dois vem de fora', () => {
    const registro = montarRegistro({ titulo: 'X' }, STATUS_VALIDOS, '99999', INSTANTE);
    expect(registro.hash).toBe('99999');
    expect(registro.criadoEm).toBe(INSTANTE);
  });
});

describe('gerarArtefato', () => {
  const template = '<h1>{{titulo}}</h1><p>{{hash}}</p>';

  it('e DETERMINISTICO: mesma entrada, saida identica', () => {
    const registro = registroDeExemplo();
    expect(gerarArtefato(registro, template)).toBe(gerarArtefato(registro, template));
  });

  it('escapa o que vai para HTML', () => {
    const registro = registroDeExemplo({ titulo: '<script>alert(1)</script>' });
    expect(gerarArtefato(registro, template)).not.toContain('<script>');
  });

  it('preserva marcador sem valor em vez de apagar silenciosamente', () => {
    expect(gerarArtefato(registroDeExemplo(), '{{inexistente}}')).toBe('{{inexistente}}');
  });
});
