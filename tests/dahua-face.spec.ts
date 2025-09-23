import { describe, it, expect, vi, beforeEach } from 'vitest';

const undici = vi.hoisted(() => {
  const request = vi.fn();
  class AgentMock {
    constructor(public options: unknown) {}
  }
  return { request, AgentMock };
});

vi.mock('undici', () => ({
  request: undici.request,
  Agent: undici.AgentMock,
}));

import { upsertFace } from '../src/devices/dahua-face.js';

const request = undici.request;

function makeResponse(
  statusCode: number,
  body: string,
  headers: Record<string, string> = {},
) {
  return {
    statusCode,
    headers,
    body: {
      text: vi.fn().mockResolvedValue(body),
    },
  };
}

beforeEach(() => {
  request.mockReset();
});

describe('devices/dahua-face upsertFace', () => {
  it('returns added when add succeeds', async () => {
    request
      .mockResolvedValueOnce(
        makeResponse(401, '', {
          'www-authenticate': 'Digest realm="r", nonce="n", qop="auth"',
        }),
      )
      .mockResolvedValueOnce(makeResponse(200, 'OK'));

    const result = await upsertFace(
      { host: '1.2.3.4', user: 'u', pass: 'p', scheme: 'http' },
      { userId: '1', userName: 'Name', photoBase64: 'dGVzdA==' },
    );

    expect(result).toBe('added');
    expect(request).toHaveBeenCalledTimes(2);
    const challengeCall = request.mock.calls[0];
    expect(challengeCall[1].headers['content-length']).toBe('0');
    expect(challengeCall[1].headers.accept).toBe('application/json, text/plain, */*');
    const addCall = request.mock.calls[1];
    expect(addCall[0]).toBe('http://1.2.3.4/cgi-bin/FaceInfoManager.cgi?action=add');
    expect(Buffer.isBuffer(addCall[1].body)).toBe(true);
    const parsed = JSON.parse(addCall[1].body.toString());
    expect(parsed).toEqual({
      UserID: '1',
      Info: { UserName: 'Name', PhotoData: ['dGVzdA=='] },
    });
    expect(addCall[1].headers['content-length']).toBe(
      String((addCall[1].body as Buffer).length),
    );
    expect(addCall[1].headers.connection).toBe('close');
    expect(addCall[1].headers.expect).toBeUndefined();
    expect(addCall[1].headers.accept).toBe('application/json, text/plain, */*');
    expect(addCall[1].headers.authorization).toContain(
      'uri="/cgi-bin/FaceInfoManager.cgi?action=add"',
    );
  });

  it('falls back to update when add fails', async () => {
    request
      .mockResolvedValueOnce(
        makeResponse(401, '', {
          'www-authenticate': 'Digest realm="r", nonce="n", qop="auth"',
        }),
      )
      .mockResolvedValueOnce(makeResponse(400, 'Bad'))
      .mockResolvedValueOnce(
        makeResponse(401, '', {
          'www-authenticate': 'Digest realm="r", nonce="n2", qop="auth"',
        }),
      )
      .mockResolvedValueOnce(makeResponse(200, 'OK'));

    const result = await upsertFace(
      { host: '1.2.3.4', user: 'u', pass: 'p', scheme: 'http' },
      { userId: '1', userName: 'Name', photoBase64: 'dGVzdA==' },
    );

    expect(result).toBe('updated');
    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls[2][0]).toBe(
      'http://1.2.3.4/cgi-bin/FaceInfoManager.cgi?action=update',
    );
  });

  it('throws when both attempts fail', async () => {
    request
      .mockResolvedValueOnce(
        makeResponse(401, '', {
          'www-authenticate': 'Digest realm="r", nonce="n", qop="auth"',
        }),
      )
      .mockResolvedValueOnce(makeResponse(400, 'Bad'))
      .mockResolvedValueOnce(
        makeResponse(401, '', {
          'www-authenticate': 'Digest realm="r", nonce="n2", qop="auth"',
        }),
      )
      .mockResolvedValueOnce(makeResponse(500, 'Nope'));

    await expect(
      upsertFace(
        { host: '1.2.3.4', user: 'u', pass: 'p', scheme: 'http' },
        { userId: '1', userName: 'Name', photoBase64: 'dGVzdA==' },
      ),
    ).rejects.toThrow('face upsert failed: add=400 Bad | update=500 Nope');
  });
});
