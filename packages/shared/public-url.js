const { isIP } = require("node:net");

// This syntax-only policy is shared by edge admission and the Node crawler. DNS resolution
// remains the caller's responsibility; accepting a public-looking name is not an egress guard.
function isPrivateIp(address) {
  const host = String(address).toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
      || (a === 198 && (b === 18 || b === 19));
  }
  if (isIP(host) === 6) {
    // Only global unicast is eligible. This excludes loopback, mapped/compatible IPv4,
    // unique-local, link-local, multicast and transition addresses that hide IPv4 targets.
    const normalized = new URL(`http://[${host}]/`).hostname.slice(1, -1);
    const first = Number.parseInt(normalized.split(":")[0], 16);
    return !Number.isFinite(first) || first < 0x2000 || first > 0x3fff || first === 0x2002
      || /^2001:(?:0:|db8:)/.test(normalized) || normalized.startsWith("2001::");
  }
  return true;
}

function isPrivateHostname(value) {
  const hostname = String(value).toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (isIP(hostname)) return isPrivateIp(hostname);
  return !hostname.includes(".") || hostname.endsWith(".localhost") || hostname.endsWith(".local")
    || hostname.endsWith(".internal") || hostname === "localhost.localdomain";
}

function assertPublicHttpUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port || isPrivateHostname(url.hostname)) {
    throw new Error("unsafe_public_url");
  }
  return url;
}

module.exports = { assertPublicHttpUrl, isPrivateHostname, isPrivateIp };
