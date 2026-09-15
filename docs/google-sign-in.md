# Google sign-in

Google is an additional way to sign in to the portal. It is not an additional
way to get *access* to the portal, and that distinction is the whole design.

```
Continue with Google
  → Google authenticates the person
  → Supabase creates or restores the Supabase Auth session
  → the portal resolves that auth user's public.profiles row
  → the profile is active?
        yes → the portal opens, with the role, department, business role and
              capabilities that profile already had
        no  → /access-denied: authenticated, not authorized
```

Nothing else about authentication changed. Supabase Auth, the SSR cookie
session, the `profiles` table, capability checks, the protected routes and Row
Level Security are all the same ones the email/password flow uses, and the
password form still appears below the Google button.

## The approved-user rule

This is an internal application, so a successful Google sign-in proves an
identity and nothing more. Access requires a profile that an administrator has
approved:

* New auth users — a first Google sign-in, a password sign-up, or an account
  created in the Supabase dashboard — get a profile with `active = false`. The
  trigger still fills in the name Google supplied, so the row reads as a person
  in Admin → Users.
* An administrator grants access by setting that person's role and switching
  their status to Active. That is the same `active` flag, the same screen and the
  same audit trail the directory already used.
* An existing employee who signs in with Google keeps their role, department,
  business role, permissions and reporting line. Google never adds, removes or
  re-scopes a capability.
* An account that is signed in without an active profile lands on
  `/access-denied`, which says what happened, shows the address they signed in
  with, and offers Sign out. It exposes no portal data.
* Nobody can approve themselves: `profiles_protect_privileged_columns` rejects a
  change to `active` (or `role`, `department`, `manager_id`, `email`) from anyone
  who is not already an active administrator.

There is deliberately **no company-domain allow-list**. The authoritative check
is the approved active profile, because a legitimate person's email domain is
not something this application should be guessing about. If Cabinet Genies later
wants "only `@cabinetgenies.com` may sign in", that belongs in the Supabase
Google provider configuration (Google Workspace restricted to the domain) or in
a deliberately added rule — not in an invisible assumption.

## Profile linking, and why duplicates cannot appear

The portal does not run its own account-matching step, because the data model
already makes one unnecessary and unsafe:

* `public.profiles.id` is a primary key **and** a foreign key to `auth.users.id`,
  so one auth user has exactly one profile and one profile has exactly one auth
  user.
* `profiles_email_unique_idx` makes profiles unique on `lower(email)`.
* The sign-up trigger inserts `on conflict (id) do update`, so a repeated
  sign-in cannot add a second row.
* An existing employee's Supabase Auth user already exists, so a Google sign-in
  with the same address either links the Google identity onto that same user or
  fails with a provider error — in both cases there is no new profile and no new
  employee record.

The portal does not attempt to "match by email" between two different auth
users, because two auth users with one address cannot exist: `auth.users.email`
is unique. Ambiguous matches are therefore not silently resolved — they cannot
arise.

When Supabase cannot link automatically, the person sees a plain explanation on
the sign-in screen ("An account already exists for that email address…") and can
use their existing password, or an administrator can link the identity from the
Supabase dashboard.

## Configuration

### 1. Google Cloud (Google Auth Platform)

1. Create (or choose) a project, then **APIs & Services → OAuth consent screen**.
   Internal user type if the company is on Google Workspace, otherwise External.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. Authorized JavaScript origins: `https://<your-portal-domain>`
   (plus `http://localhost:3000` if you want sign-in to work in local development).
4. Authorized redirect URIs — the **Supabase** callback, not the application's:
   `https://<project-ref>.supabase.co/auth/v1/callback`

### 2. Supabase Dashboard → Authentication → Providers → Google

1. Enable Google.
2. Paste the **Client ID** and **Client Secret** from step 1.

### 3. Supabase Dashboard → Authentication → URL Configuration

* **Site URL**: `https://<your-portal-domain>`
* **Redirect URLs** (allow-list) — add the application callback for every
  environment:
  * `https://<your-portal-domain>/auth/callback`
  * `http://localhost:3000/auth/callback`

The application builds its callback from `NEXT_PUBLIC_SITE_URL` when it is set
and from the request host otherwise, and Supabase refuses any redirect that is
not on this list. That allow-list is the backstop behind the portal's own
`safeRedirectTarget`, which only ever accepts same-origin absolute paths.

### 4. Environment

Nothing. No Google secret is read by this application: the OAuth client id and
secret live in Google and Supabase only, so there is nothing to leak from the
repository or the browser. `NEXT_PUBLIC_SITE_URL` is a URL, not a credential.

## Scopes and tokens

The portal asks for `email profile` and nothing else — enough for Supabase to
establish an identity, not enough to read Drive, Gmail or a calendar. No Google
access token is stored: the Supabase session cookie is the only credential the
application keeps, exactly as it does for a password sign-in.

Signing out ends the Supabase session (either sign-in method, the same action).
It does not sign the person out of Google — that is between them and Google.

## Tests

The flow is pinned in `lib/auth/*.test.ts`:

| Guarantee | Test |
| --- | --- |
| The action asks Supabase for `provider: "google"` | `oauth.test.ts` |
| The redirect returns through the allow-listed `/auth/callback` | `oauth.test.ts` |
| An active profile gets normal access, role and capabilities unchanged | `access.test.ts` |
| Google sign-in cannot create duplicate profiles | `profile-provisioning.test.ts` |
| An authenticated account with no profile is denied | `access.test.ts` |
| An inactive profile is denied | `access.test.ts` |
| Email/password sign-in still works | `messages.test.ts`, `sign-in-surface.test.ts` |
| Sign-out works for either login type | `sign-in-surface.test.ts` |
| The callback cannot bypass protected-route authorization | `access.test.ts` |
| Redirect targets are validated against arbitrary URLs | `redirects.test.ts` |

## What is still manual

Enabling the provider (steps 1–3) is a Google/Supabase dashboard action. Until
those are done the Google button reports "Google sign-in is not available right
now" and the password form keeps working, so the portal is never locked by a
half-finished OAuth setup.
