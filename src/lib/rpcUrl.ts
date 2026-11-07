const RPC_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;

function isLocalNodeAddress(input: string): boolean {
  const authority = input.split(/[/?#]/, 1)[0] || "";
  const hostname = authority
    .replace(/:\d+$/, "")
    .replace(/^\[|\]$/g, "")
    .toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "::1"
  ) {
    return true;
  }

  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = octets;
  return first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
}

/**
 * Normalize JSON-RPC addresses without inventing a port:
 * remote hostnames default to HTTPS/443, while local/private hosts default to HTTP.
 */
export function normalizeRpcUrl(value: string): string {
  const input = value.trim();
  if (!input || input === "__replit_litenode__") return input;

  const candidate = RPC_SCHEME.test(input)
    ? input
    : `${isLocalNodeAddress(input) ? "http" : "https"}://${input}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Enter a valid RPC host or HTTP(S) URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("RPC endpoints must use HTTP or HTTPS.");
  }
  if (!parsed.hostname) {
    throw new Error("Enter a valid RPC host or HTTP(S) URL.");
  }

  if (parsed.pathname === "/" && !parsed.search && !parsed.hash) {
    return `${parsed.protocol}//${parsed.host}`;
  }
  return parsed.toString();
}
