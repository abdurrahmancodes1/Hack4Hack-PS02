import axios from "axios";
import { lookup } from "node:dns/promises";
import { isIP, BlockList } from "node:net";

const blocked = new BlockList();
for (const [subnet, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
]) blocked.addSubnet(subnet, prefix, "ipv4");
for (const [subnet, prefix] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10],
  ["ff00::", 8], ["2001:db8::", 32],
]) blocked.addSubnet(subnet, prefix, "ipv6");

const assertPublicAddress = (address) => {
  if (address.toLowerCase().startsWith("::ffff:")) {
    const mapped = address.slice(address.lastIndexOf(":") + 1);
    if (isIP(mapped) === 4 && blocked.check(mapped, "ipv4")) throw new Error("Private network URLs are not allowed");
  }
  const family = isIP(address);
  if (!family || blocked.check(address, family === 4 ? "ipv4" : "ipv6")) {
    throw new Error("Private network URLs are not allowed");
  }
};

const resolvePublic = async (hostname) => {
  const family = isIP(hostname);
  const addresses = family ? [{ address: hostname, family }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length) throw new Error("Hostname has no public address");
  addresses.forEach(({ address }) => assertPublicAddress(address));
  return addresses;
};

const requestOptions = (addresses) => ({
  timeout: 5000,
  maxRedirects: 0,
  validateStatus: (status) => status < 500,
  headers: { "User-Agent": "Hack4Hack-LinkChecker/1.0", Range: "bytes=0-1024" },
  lookup: (_hostname, options, callback) => {
    if (options?.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  },
});

export const checkSingleUrl = async (url) => {
  if (!url || typeof url !== "string" || !url.trim()) return null;
  let parsed;
  try {
    parsed = new URL(url.trim());
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error("Only public HTTP and HTTPS URLs are allowed");
    }
    const addresses = await resolvePublic(parsed.hostname);
    const options = requestOptions(addresses);
    let response;
    try {
      response = await axios.head(parsed.toString(), options);
    } catch {
      response = await axios.get(parsed.toString(), { ...options, responseType: "stream" });
      response.data?.destroy?.();
    }
    return {
      url: parsed.toString(),
      status: response.status,
      reachable: response.status >= 200 && response.status < 400,
      error: response.status >= 400 ? `HTTP status ${response.status}` : null,
    };
  } catch (error) {
    return {
      url: parsed?.toString() || String(url),
      status: 0,
      reachable: false,
      error: error.message || "Failed to reach host",
    };
  }
};

export const checkSubmissionLinks = async ({ repoUrl, liveDemoUrl }) => {
  const results = await Promise.all([
    repoUrl ? checkSingleUrl(repoUrl) : null,
    liveDemoUrl ? checkSingleUrl(liveDemoUrl) : null,
  ]);
  return results.filter(Boolean);
};
