export function normalizeBase64Jpeg(b64: string) {
  if (typeof b64 !== 'string') {
    throw new Error('face_image_b64 must be a string');
  }

  let cleaned = b64.replace(/^data:.*?;base64,/, '').trim();
  cleaned = cleaned.replace(/\s+/g, '');

  const pad = cleaned.length % 4;
  if (pad) {
    cleaned += '='.repeat(4 - pad);
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(cleaned)) {
    throw new Error('face_image_b64 contains invalid base64 characters');
  }

  const padChars = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  const bytes = Math.floor((cleaned.length * 3) / 4) - padChars;
  if (bytes > 350_000) {
    throw new Error(`face_image_b64 too large: ${bytes} bytes`);
  }

  return { b64: cleaned, bytes };
}

export function buildFacePayload(u: {
  personId: string;
  name?: string;
  imageB64: string;
}) {
  const { issues, normalized, name } = validateFaceRequest(u);
  if (issues.length || !normalized) {
    throw new Error(issues.join('; ') || 'invalid face payload');
  }

  return {
    personId: u.personId,
    name,
    image: normalized.b64,
  };
}

export function validateFaceRequest(u: {
  personId: string;
  name?: string;
  imageB64: string;
}) {
  const issues: string[] = [];
  if (!/^[\w\-:.@]{1,64}$/.test(u.personId)) {
    issues.push('personId invalid (expect ASCII word chars, <=64)');
  }

  let normalized: ReturnType<typeof normalizeBase64Jpeg> | undefined;
  try {
    normalized = normalizeBase64Jpeg(u.imageB64);
  } catch (err) {
    issues.push((err as Error).message);
  }

  const name = u.name?.trim();
  let safeName: string | undefined;
  if (!name) {
    issues.push('name required');
  } else if (name.length > 32) {
    issues.push('name too long (>32)');
    safeName = name.slice(0, 32);
  } else {
    safeName = name;
  }

  return { issues, normalized, name: safeName };
}
