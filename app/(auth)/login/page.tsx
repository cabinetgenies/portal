import { redirect } from "next/navigation";

import { ConfigurationNotice } from "@/components/configuration-notice/configuration-notice";
import { DEFAULT_AUTHENTICATED_ROUTE, getSessionContext } from "@/lib/auth/dal";
import { safeRedirectTarget } from "@/lib/auth/redirects";
import { isSupabaseConfigured } from "@/lib/env";

import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in",
};

const MODULES = ["Commissions", "Sales", "Projects", "Production", "Reports"];

export default async function LoginPage(props: PageProps<"/login">) {
  const [searchParams, session] = await Promise.all([
    props.searchParams,
    getSessionContext(),
  ]);

  if (session) {
    redirect(DEFAULT_AUTHENTICATED_ROUTE);
  }

  const requestedNext = searchParams.next;
  const next = safeRedirectTarget(
    Array.isArray(requestedNext) ? requestedNext[0] : requestedNext,
  );

  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      <section className="hidden flex-1 flex-col justify-between bg-graphite px-12 py-14 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white">
            CG
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">Cabinet Genies</span>
            <span className="text-[0.7rem] tracking-[0.18em] text-white/45 uppercase">
              Portal
            </span>
          </span>
        </div>

        <div className="max-w-md space-y-6">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight">
            The Cabinet Genies operations portal
          </h1>
          <p className="text-sm leading-6 text-white/60">
            One place for the numbers and the work behind them. Modules come online
            as each part of the business moves into the portal.
          </p>
          <ul className="flex flex-wrap gap-2">
            {MODULES.map((module) => (
              <li
                key={module}
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60"
              >
                {module}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/40">
          Internal use only · Cabinet Genies, Inc.
        </p>
      </section>

      <section className="flex flex-1 items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-3">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white">
                CG
              </span>
              <span className="text-sm font-semibold tracking-tight text-ink">
                Cabinet Genies Portal
              </span>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-ink">
                Sign in
              </h2>
              <p className="text-sm leading-6 text-ink-muted">
                Use the work email and password issued for your Cabinet Genies account.
              </p>
            </div>
          </div>

          {isSupabaseConfigured ? (
            <LoginForm next={next} />
          ) : (
            <ConfigurationNotice />
          )}

          <p className="text-xs leading-5 text-ink-subtle">
            Access is limited to Cabinet Genies personnel. Accounts are created by an
            administrator — contact yours if you need access.
          </p>
        </div>
      </section>
    </div>
  );
}
