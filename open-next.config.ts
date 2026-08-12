// Cloudflare/OpenNext configuration pinned to the adapter used by this branch.
// Keep this file dependency-free so Cloudflare CI can compile it even when the
// adapter is invoked through npx instead of being installed in package.json.

const dummy = "dummy" as const;

export default {
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: dummy,
      tagCache: dummy,
      queue: dummy,
      cdnInvalidation: dummy,
    },
    routePreloadingBehavior: "none",
  },
  edgeExternals: ["node:crypto"],
  cloudflare: {
    useWorkerdCondition: true,
  },
  dangerous: {
    enableCacheInterception: false,
  },
  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: dummy,
      tagCache: dummy,
      queue: dummy,
    },
  },
};
