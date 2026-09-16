import { AssistantChat } from "@/components/assistant/assistant-chat";
import { PageHeader } from "@/components/page-header/page-header";
import { Panel } from "@/components/ui/panel";
import { resolveAiAccess } from "@/lib/ai/access";
import { aiAvailability } from "@/lib/ai/config";
import { requireSession } from "@/lib/auth/dal";

export const metadata = {
  title: "Ask Cabinet Genies",
};

/**
 * The single assistant workspace. Every request still enters the one
 * orchestrator; this page is only the entry point, never a competing chat
 * window.
 */
export default async function AssistantPage() {
  const session = await requireSession();
  const access = await resolveAiAccess(session);
  const availability = aiAvailability();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Assistant"
        title="Ask Cabinet Genies"
        description="A permission-aware assistant over approved knowledge, commission and communication drafts. Answers are sourced and drafts are never sent automatically."
      />

      {!availability.configured ? (
        <Panel id="assistant-not-configured" title="AI is not configured">
          <p className="text-sm leading-6 text-ink-muted">
            Ask an administrator to set the server model and API key before the assistant can
            be enabled. Until then this page shows this notice rather than a fake response.
          </p>
        </Panel>
      ) : !access.allowed ? (
        <Panel id="assistant-not-authorized" title="Assistant is not enabled for you">
          <p className="text-sm leading-6 text-ink-muted">
            {access.reason ??
              "The assistant is not enabled for your role. Ask an administrator to add your business role to the AI pilot."}
          </p>
        </Panel>
      ) : (
        <AssistantChat />
      )}
    </div>
  );
}

