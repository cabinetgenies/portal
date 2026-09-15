import type { NextConfig } from "next";

import { LEGACY_COMMISSION_REDIRECTS, SALES_PROJECT_REDIRECTS } from "./lib/routes";

const nextConfig: NextConfig = {
  /**
   * The commission sub-app moved under Sales in Phase 4.3. The old paths redirect
   * permanently instead of 404ing, and the list lives in `lib/routes.ts` so the
   * redirects and the links cannot drift apart.
   */
  async redirects() {
    return [...LEGACY_COMMISSION_REDIRECTS, ...SALES_PROJECT_REDIRECTS].map((redirect) => ({
      ...redirect,
      permanent: true,
    }));
  },
};

export default nextConfig;
