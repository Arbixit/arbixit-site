// Gemensam Microsoft Graph-hjälpare för brevbäraren (appen arbixit-claude-graph).
// Autentisering endast via miljövariabler – aldrig i filer eller loggar:
//   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET
// Postlådans adress kommer via MAIL_MAILBOX (Actions-secret, maskas i loggar).

export const GRAPH = 'https://graph.microsoft.com/v1.0';

export function fail(msg) {
  console.error(`brevbararen: ${msg}`);
  process.exit(1);
}

export function kravEnv(namn) {
  const v = process.env[namn];
  if (!v) fail(`miljövariabeln ${namn} måste vara satt.`);
  return v;
}

export function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

export async function getToken() {
  const tenant = kravEnv('GRAPH_TENANT_ID');
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: kravEnv('GRAPH_CLIENT_ID'),
      client_secret: kravEnv('GRAPH_CLIENT_SECRET'),
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) fail(`tokenanrop misslyckades (HTTP ${res.status}).`);
  return (await res.json()).access_token;
}

// Anropar Graph och felar med status – aldrig med svarsinnehåll (kan röja
// mejlinnehåll i publika Actions-loggar).
export async function graph(token, path, init = {}) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) fail(`Graph-anropet ${init.method ?? 'GET'} ${path.split('?')[0].slice(0, 60)}… misslyckades (HTTP ${res.status}).`);
  return res;
}
