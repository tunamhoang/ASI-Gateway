import crypto from "node:crypto";
import { request, Agent } from "undici";

const agent = new Agent({
  connect: { timeout: 10_000 },
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 30_000,
});

function parseWwwAuth(h: string) {
  const out: Record<string, string> = {};
  h
    .replace(/^Digest\s+/i, "")
    .split(/,\s*/)
    .forEach((p) => {
      const m = p.match(/^(\w+)=(?:"([^"]+)"|([^,]+))$/);
      if (m) out[m[1]] = m[2] ?? m[3];
    });
  return out as {
    realm: string;
    nonce: string;
    qop?: string;
    opaque?: string;
    algorithm?: string;
  };
}

function buildDigest({
  username,
  password,
  method,
  uri,
  chal,
  nc,
  cnonce,
}: {
  username: string;
  password: string;
  method: string;
  uri: string;
  chal: ReturnType<typeof parseWwwAuth>;
  nc: string;
  cnonce: string;
}) {
  const qop = chal.qop || "auth";
  const ha1 = crypto
    .createHash("md5")
    .update(`${username}:${chal.realm}:${password}`)
    .digest("hex");
  const ha2 = crypto.createHash("md5").update(`${method}:${uri}`).digest("hex");
  const resp = crypto
    .createHash("md5")
    .update(`${ha1}:${chal.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    .digest("hex");
  const kv = [
    `username="${username}"`,
    `realm="${chal.realm}"`,
    `nonce="${chal.nonce}"`,
    `uri="${uri}"`,
    `qop=${qop}`,
    `nc=${nc}`,
    `cnonce="${cnonce}"`,
    `response="${resp}"`,
    chal.opaque ? `opaque="${chal.opaque}"` : undefined,
  ].filter(Boolean);
  return `Digest ${kv.join(", ")}`;
}

export async function digestPostJson(
  url: string,
  bodyObj: unknown,
  user: string,
  pass: string,
) {
  const u = new URL(url);
  const uri = u.pathname + (u.search || "");
  const challenge = await request(url, {
    method: "POST",
    dispatcher: agent,
    headers: {
      "content-length": "0",
      connection: "close",
    },
    body: Buffer.alloc(0),
  });
  try {
    if (challenge.statusCode !== 401) {
      throw new Error(`Expected 401, got ${challenge.statusCode}`);
    }
    const chalHeader = String(challenge.headers["www-authenticate"] || "");
    if (!chalHeader) {
      throw new Error("Missing www-authenticate header");
    }
    const chal = parseWwwAuth(chalHeader);
    const buf = Buffer.from(JSON.stringify(bodyObj), "utf8");
    const auth = buildDigest({
      username: user,
      password: pass,
      method: "POST",
      uri,
      chal,
      nc: "00000001",
      cnonce: crypto.randomBytes(8).toString("hex"),
    });
    const response = await request(url, {
      method: "POST",
      dispatcher: agent,
      headers: {
        authorization: auth,
        "content-type": "application/json; charset=UTF-8",
        "content-length": String(buf.length),
        connection: "close",
      },
      body: buf,
    });
    const text = await response.body.text();
    return { status: response.statusCode, text };
  } finally {
    await challenge.body.text().catch(() => {});
  }
}
