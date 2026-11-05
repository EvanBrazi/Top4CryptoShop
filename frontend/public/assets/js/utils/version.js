'use strict';

// Shared version banner. Runs once per page load.
// Reads version.json (cache: 'no-cache' to revalidate on each load),
// logs once with the actual version or a graceful fallback.

let logged = false;

async function readVersion() {
  try {
    const res = await fetch('/version.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.version === 'string' && data.version.trim().length > 0 && data.version.length <= 32) {
      return data.version.trim();
    }
    return null;
  } catch (_) {
    return null;
  }
}

export async function logVersionBanner() {
  if (logged) return;
  logged = true;
  const version = await readVersion();
  console.info(version ? '[Top4] v' + version + ' loaded' : '[Top4] loaded');
}
