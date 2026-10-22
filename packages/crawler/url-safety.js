const dns = require("dns").promises;
const net = require("net");
const { assertPublicHttpUrl, isPrivateIp } = require("../shared/public-url.js");

async function assertSafePublicUrl(siteUrl, options = {}) {
  await resolveSafePublicUrl(siteUrl, options);
  return siteUrl;
}

async function resolveSafePublicUrl(siteUrl, options = {}) {
  let parsed;
  try { parsed = assertPublicHttpUrl(siteUrl); } catch { throw unsafeUrlError(); }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw unsafeUrlError();
    return { url: parsed, address: hostname, family: net.isIP(hostname) };
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
  return { url: parsed, ...addresses[0] };
}

function unsafeUrlError() {
  const error = new Error("基於安全考量，不能檢測本機、私有網路或內部服務網址");
  error.statusCode = 400;
  error.stage = "url_safety";
  return error;
}

module.exports = { assertSafePublicUrl, resolveSafePublicUrl, isPrivateIp };
