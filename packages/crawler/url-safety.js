const dns = require("dns").promises;
const net = require("net");

function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const parts = address.split(".").map(Number);
    return parts[0] === 10
      || parts[0] === 127
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
      || parts[0] === 0;
  }
  if (net.isIPv6(address)) {
    const value = address.toLowerCase().split("%")[0];
    return value === "::1"
      || value === "::"
      || value.startsWith("fc")
      || value.startsWith("fd")
      || value.startsWith("fe8")
      || value.startsWith("fe9")
      || value.startsWith("fea")
      || value.startsWith("feb");
  }
  return true;
}

async function assertSafePublicUrl(siteUrl, options = {}) {
  const parsed = new URL(siteUrl);
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw unsafeUrlError();
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw unsafeUrlError();
    return siteUrl;
  }
  const lookup = options.lookup || dns.lookup;
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    const wrapped = new Error("無法解析此網站網域，請確認網址是否正確");
    wrapped.statusCode = 400;
    wrapped.stage = "url_dns";
    throw wrapped;
  }
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) {
    throw unsafeUrlError();
  }
  return siteUrl;
}

function unsafeUrlError() {
  const error = new Error("基於安全考量，不能檢測本機、私有網路或內部服務網址");
  error.statusCode = 400;
  error.stage = "url_safety";
  return error;
}

module.exports = { assertSafePublicUrl, isPrivateIp };
