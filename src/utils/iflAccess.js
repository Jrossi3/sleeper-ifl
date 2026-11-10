// Password gate for the International Football League.
//
// IMPORTANT: this runs entirely in the browser (the site is static, hosted on
// GitHub Pages), so it keeps casual visitors out but is NOT real security —
// the hash below ships in the page, and the underlying Sleeper and Google
// Sheet data is reachable without it. Treat it as a door lock, not a vault.
export const IFL_PASSWORD_SHA256 = "e41d5782cb23daf440904d68988c92ff0e176c0a08caa9529e3a61762a462241";

const ACCESS_KEY = "ifl_access_v1";

export async function sha256Hex(text) {
  if (!window.crypto?.subtle) throw new Error("This browser can't verify passwords on an insecure (http) page.");
  const bytes = new TextEncoder().encode(text);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function checkIflPassword(password) {
  return (await sha256Hex(`ifl-v1:${password}`)) === IFL_PASSWORD_SHA256;
}

// Access is remembered in localStorage so switching leagues (or reloading)
// never asks again. It is tied to the current hash, so changing the password
// above signs everyone out.
export function hasIflAccess() {
  try {
    return localStorage.getItem(ACCESS_KEY) === IFL_PASSWORD_SHA256;
  } catch (e) {
    return false;
  }
}

export function grantIflAccess() {
  try {
    localStorage.setItem(ACCESS_KEY, IFL_PASSWORD_SHA256);
  } catch (e) {
    /* storage unavailable: access lasts until the page reloads */
  }
}

export function revokeIflAccess() {
  try {
    localStorage.removeItem(ACCESS_KEY);
  } catch (e) {
    /* nothing to clear */
  }
}