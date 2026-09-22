import "server-only";
import net from "node:net";
import { lookup } from "node:dns/promises";

/** Nicht-öffentliche IPv4-Bereiche (privat, Loopback, Link-local/Cloud-Metadata, CGNAT, …). */
function isPrivateIpv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local + Cloud-Metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 (IETF) + 192.0.2.0/24 (Doku)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (Benchmark)
  if (a >= 224) return true; // Multicast + reserviert + Broadcast
  return false;
}

/** IPv6 auf 8 Hextets (Zahlen) ausschreiben; IPv4-Anhängsel („::ffff:1.2.3.4") inklusive. */
function expandIpv6(ip: string): number[] | null {
  let v = ip.toLowerCase().split("%")[0];
  const v4 = v.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    if (!net.isIPv4(v4[1])) return null;
    const p = v4[1].split(".").map(Number);
    v = v.slice(0, -v4[1].length) + ((p[0] << 8) | p[1]).toString(16) + ":" + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = v.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const parts = [...head, ...Array(fill).fill("0"), ...tail];
  if (parts.length !== 8) return null;
  const nums = parts.map((h) => parseInt(h, 16));
  return nums.some((n) => !Number.isFinite(n) || n < 0 || n > 0xffff) ? null : nums;
}

/**
 * Private/loopback/link-local/CGNAT/Metadata-Bereiche — IPv4 UND IPv6 vollständig ausgewertet,
 * inkl. eingebetteter IPv4 in JEDER Schreibweise (Sicherheitsprüfung Welle 51, M2: Node schreibt
 * `[::ffff:127.0.0.1]` als `::ffff:7f00:1` — die alte Prüfung sah darin keine IPv4).
 */
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip);
  const h = expandIpv6(ip);
  if (!h) return true; // unlesbar -> im Zweifel blockieren
  const embeddedV4 = () => `${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`;
  const zero = (from: number, to: number) => h.slice(from, to).every((n) => n === 0);
  if (zero(0, 8)) return true; // ::
  if (zero(0, 7) && h[7] === 1) return true; // ::1
  if (zero(0, 5) && h[5] === 0xffff) return isPrivateIpv4(embeddedV4()); // ::ffff:0:0/96 (IPv4-mapped)
  if (zero(0, 6)) return isPrivateIpv4(embeddedV4()); // ::/96 (IPv4-compatible, veraltet)
  if (h[0] === 0x64 && h[1] === 0xff9b && zero(2, 6)) return isPrivateIpv4(embeddedV4()); // 64:ff9b::/96 (NAT64)
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((h[0] & 0xff00) === 0xff00) return true; // ff00::/8 Multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // Doku-Präfix
  return false;
}

/** true, wenn die URL öffentlich & http(s) ist (nicht localhost/privat/Metadata). Löst DNS auf. */
export async function isSafePublicUrl(raw: string): Promise<boolean> {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (net.isIP(host)) return !isPrivateIp(host);
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && !addrs.some((a) => isPrivateIp(a.address));
  } catch {
    return false;
  }
}

/** fetch nur für sichere/öffentliche URLs; wirft sonst (SSRF-Schutz). */
export async function safeFetch(raw: string, init?: RequestInit): Promise<Response> {
  if (!(await isSafePublicUrl(raw))) throw new Error("Blockierte oder interne URL");
  return fetch(raw, init);
}
