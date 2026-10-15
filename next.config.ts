import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keeps visited pages mounted (hidden via React <Activity>) instead of
  // unmounting them on navigation, so scraper results survive switching to
  // the dashboard and back. A full browser refresh still resets everything.
  cacheComponents: true,
};

export default nextConfig;
