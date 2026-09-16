"use client";

import { useState, useRef, useEffect } from "react";

import { AssistantIcon, InfoIcon, SpinnerIcon } from "@/components/icons";
import { saveDraftAction } from "@/lib/ai/draft-actions";
import type { AssistantAnswer, SourceReference } from "@/lib/ai/schema";
import { cn } from "@/lib/utils/cn";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  answer?: AssistantAnswer;
  error?: string;
};

function sourceHref(source: SourceReference): string | null {
  switch (source.recordType) {
    case "knowledge_item":
      return "/knowledge";
    case "project":
      return `/projects/${source.recordId}`;
    case "compensation_plan_version":
      return "/admin/compensation-plans";
    case "commission_event":
      return "/sales/commissions";
    default:
      return null;
  }
}

function AnswerView({
  answer,
  conversationId,
  runId,
}: {
  answer: AssistantAnswer;
  conversationId?: string;
  runId?: string;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 whitespace-pre-wrap text-ink">{answer.answer}</p>

      {answer.activity.length > 0 ? (
        <p className="text-xs text-ink-subtle">
          {answer.activity.join(" · ")} · data as of{" "}
          {new Date(answer.dataTimestamp).toLocaleString()}
        </p>
      ) : null}

      {answer.sources.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
            Authorized sources
          </p>
          <ul className="space-y-1.5">
            {answer.sources.map((source) => {
              const href = sourceHref(source);
              const title = `${source.title} · ${source.recordType}`;

              return (
                <li key={source.id} className="text-xs">
                  {href ? (
                    <a
                      href={href}
                      className="text-accent-strong underline-offset-4 hover:underline"
                    >
                      {title}
                    </a>
                  ) : (
                    <span className="text-ink-muted">{title}</span>
                  )}
                  <span className="text-ink-subtle"> · {source.sensitivity}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {answer.drafts.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
            Drafts
          </p>
          {answer.drafts.map((draft) => (
            <div key={draft.id} className="rounded-lg border border-line bg-surface-muted p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink">{draft.title}</p>
                <span className="text-xs text-ink-subtle">{draft.status}</span>
              </div>
              {draft.subject ? (
                <p className="mt-2 text-sm font-medium text-ink">Subject: {draft.subject}</p>
              ) : null}
              <p className="mt-1 text-sm leading-6 whitespace-pre-wrap text-ink-muted">
                {draft.body}
              </p>
              <form action={saveDraftAction} className="mt-3">
                <input type="hidden" name="conversationId" value={conversationId ?? ""} />
                <input type="hidden" name="runId" value={runId ?? ""} />
                <input type="hidden" name="kind" value={draft.kind} />
                <input type="hidden" name="title" value={draft.title} />
                <input type="hidden" name="subject" value={draft.subject ?? ""} />
                <input type="hidden" name="body" value={draft.body} />
                <button
                  type="submit"
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Save as private draft
                </button>
              </form>
            </div>
          ))}
        </div>
      ) : null}

      {answer.missingInformation.length > 0 ? (
        <div className="rounded-lg border border-line bg-surface-muted px-3 py-3">
          <p className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
            Missing information
          </p>
          <ul className="mt-1 list-inside list-disc text-sm text-ink-muted">
            {answer.missingInformation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {answer.warnings.length > 0 ? (
        <div className="rounded-lg border border-line bg-accent-soft px-3 py-3">
          <p className="text-xs font-semibold tracking-[0.12em] text-accent-strong uppercase">
            Warnings
          </p>
          <ul className="mt-1 list-inside list-disc text-sm text-accent-strong">
            {answer.warnings.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function AssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [runId, setRunId] = useState<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    setInput("");
    setLoading(true);
    setMessages((current) => [...current, { role: "user", content: message }]);

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: payload?.error?.message ?? "The assistant could not complete the request.",
            error: payload?.error?.code,
          },
        ]);
        return;
      }

      setConversationId(payload.conversationId);
      setRunId(payload.runId);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: payload.text,
          answer: payload.answer,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: "The assistant could not reach the server.",
          error: "network",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[60dvh] flex-col rounded-xl border border-line bg-surface">
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
            <AssistantIcon className="h-6 w-6 text-accent" />
            <p className="text-sm font-medium text-ink">Ask a question or request a draft.</p>
            <p className="max-w-md text-sm text-ink-muted">
              Example: explain how my commission is projected, or find the approved procedure
              for a design handoff.
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                "max-w-[90%] rounded-xl border px-4 py-3",
                message.role === "user"
                  ? "ml-auto border-transparent bg-graphite text-white"
                  : "border-line bg-surface-muted",
              )}
            >
              {message.role === "user" ? (
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              ) : message.answer ? (
                <AnswerView
                  answer={message.answer}
                  conversationId={conversationId}
                  runId={runId}
                />
              ) : (
                <p className="text-sm leading-6 whitespace-pre-wrap text-ink-muted">
                  {message.content}
                </p>
              )}
              {message.error ? (
                <p className="mt-2 text-xs text-accent-strong">
                  Code: {message.error}
                </p>
              ) : null}
            </div>
          ))
        )}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <SpinnerIcon className="h-4 w-4" />
            Working with the orchestrator…
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="border-t border-line p-4">
        <label htmlFor="assistant-message" className="sr-only">
          Message
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="assistant-message"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={2}
            placeholder="Ask Cabinet Genies…"
            className="min-h-[3rem] flex-1 resize-none rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-line-strong focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || input.trim().length === 0}
            className="rounded-lg bg-graphite px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-graphite/90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-subtle">
          <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Answers are read-only and sourced. Drafts are private and never sent automatically.
        </p>
      </form>
    </div>
  );
}
