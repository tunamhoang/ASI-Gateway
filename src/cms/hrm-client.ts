export async function fetchEmployees() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(process.env.CMS_HRM_ENDPOINT!, {
      headers: {
        accept: 'application/json',
        ...(process.env.CMS_HRM_AUTH_HEADER
          ? { authorization: process.env.CMS_HRM_AUTH_HEADER }
          : {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HRM fetch error: ${res.status} ${await res.text()}`);
    }
    const resJson = await res.json();
    return resJson?.data ?? resJson;
  } finally {
    clearTimeout(timer);
  }
}
