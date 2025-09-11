import fetch from 'node-fetch';

export async function fetchEmployees() {
  const res = await fetch(process.env.CMS_HRM_ENDPOINT!, {
    headers: {
      accept: 'application/json',
      ...(process.env.CMS_HRM_AUTH_HEADER
        ? { authorization: process.env.CMS_HRM_AUTH_HEADER }
        : {}),
    },
    timeout: 10000,
  } as any);
  if (!res.ok) {
    throw new Error(`HRM fetch error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
