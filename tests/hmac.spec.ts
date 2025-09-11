import { describe, expect, it } from 'vitest';
import { hmacSign } from '../src/core/hmac.js';

describe('hmacSign', () => {
  it('creates deterministic signature', () => {
    const sig = hmacSign('payload', 'secret');
    expect(sig).toEqual(hmacSign('payload', 'secret'));
  });
});
