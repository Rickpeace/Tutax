import "server-only";
import net from "node:net";
import { lookup } from "node:dns/promises";

/** Private/loopback/link-local/CGNAT/Metadata-Bereiche (IPv4 + IPv6-Basics). */
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + Cloud-Metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true; // fe80::/10
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // ULA fc00::/7
  if (v.startsWith("::ffff:")) return isPrivateIp(v.split(":").pop() ?? ""); // IPv4-mapped
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
