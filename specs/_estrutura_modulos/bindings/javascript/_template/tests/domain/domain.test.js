// Testes do dominio do modulo <module> — regras e validacao, sem I/O.
import { describe, expect, it } from 'vitest';

import { ValidationError, buildRecord } from '../../core/domain/index.js';
import { generateArtifact } from '../../core/engine/index.js';
import { recordExample } from '../fixtures/index.js';

const VALID_STATUSES = ['draft', 'active', 'closed'];
const INSTANT = '2024-01-01T00:00:00.000Z';

describe('buildRecord', () => {
  it('builds with the first status when none is given', () => {
    const entry = buildRecord({ title: 'Example' }, VALID_STATUSES, '10001', INSTANT);
    expect(entry).toEqual({
      hash: '10001',
      title: 'Example',
      status: 'draft',
      createdAt: INSTANT,
    });
  });

  it('trims whitespace around the title', () => {
    expect(buildRecord({ title: '  Example  ' }, VALID_STATUSES, '10001', INSTANT).title).toBe('Example');
  });

  it('rejects an empty title', () => {
    expect(() => buildRecord({ title: '   ' }, VALID_STATUSES, '10001', INSTANT)).toThrow(ValidationError);
  });

  it('rejects a status outside the config/domain.json vocabulary', () => {
    expect(() => buildRecord({ title: 'X', status: 'invented' }, VALID_STATUSES, '10001', INSTANT)).toThrow(
      ValidationError,
    );
  });

  it('does not invent an instant or an identifier — both come from outside', () => {
    const entry = buildRecord({ title: 'X' }, VALID_STATUSES, '99999', INSTANT);
    expect([entry.hash, entry.createdAt]).toEqual(['99999', INSTANT]);
  });
});

describe('generateArtifact', () => {
  const template = '<h1>{{title}}</h1><p>{{hash}}</p>';

  it('is DETERMINISTIC: same input, identical output', () => {
    const entry = recordExample();
    expect(generateArtifact(entry, template)).toBe(generateArtifact(entry, template));
  });

  it('escapes what goes into HTML', () => {
    const entry = recordExample({ title: '<script>alert(1)</script>' });
    expect(generateArtifact(entry, template)).not.toContain('<script>');
  });

  it('keeps a marker without a value instead of silently erasing it', () => {
    expect(generateArtifact(recordExample(), '{{missing}}')).toBe('{{missing}}');
  });
});
