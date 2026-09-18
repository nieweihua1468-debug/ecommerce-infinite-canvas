const LOOPBACK_ADDRESSES = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
]);

export function allowsLocalAdminSession({ nodeEnv, remoteAddress }) {
  return (
    String(nodeEnv || "").toLowerCase() !== "production" &&
    LOOPBACK_ADDRESSES.has(String(remoteAddress || ""))
  );
}

