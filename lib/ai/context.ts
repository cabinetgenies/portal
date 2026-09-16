import type { AuthorizedSession } from "@/lib/auth/dal";
import type { AiAccessResult } from "@/lib/ai/access";
import type { AiServerConfig } from "@/lib/ai/config";

/**
 * The authorized context assembled once per request, from the verified session
 * and server configuration. The model never supplies any part of this.
 */
export type AuthorizedAiContext = {
  session: AuthorizedSession;
  access: AiAccessResult;
  config: AiServerConfig;
};

