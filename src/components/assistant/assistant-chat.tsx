"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowSquareOutIcon,
  ChatCircleTextIcon,
  CircleNotchIcon,
  PaperPlaneRightIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react/ssr";
import { AssistantActionStatus, ChatRole } from "@/generated/prisma/enums";
import { anyData, callApi, type ApiFailure } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { ConfirmActionDialog } from "../ui/confirm-action-dialog";
import { EmptyState, InlineNotice } from "../ui/states";
import { ProposalCard, ReplyText, conversationSchema, type Conversation } from "./assistant-message";

const SUGGESTIONS = [
  "What needs a decision today?",
  "Summarise the latest on WO-1008.",
  "How is priority worked out here?",
  "Help me report: the lift on level 2 keeps stopping between floors.",
];

/** Plain-text reply with "- " bullet lists; work-order references the person can open become links. */
export function AssistantChat({
  conversations,
  conversation: initial,
  available,
  unavailableMessage,
}: {
  conversations: { id: string; title: string; updatedAt: string }[];
  conversation: Conversation | null;
  available: boolean;
  unavailableMessage: string;
}) {
  const router = useRouter();
  const [conversation, setConversation] = useState<Conversation | null>(initial);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const messageCount = conversation?.messages.length ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messageCount, pendingText]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    setPendingText(content);
    setDraft("");
    // Slightly longer than the server's own turn budget, so a slow reply still arrives but a dead request ends.
    const result = await callApi("/api/assistant/messages", {
      signal: AbortSignal.timeout(70_000),
      method: "POST",
      body: { content, ...(conversation ? { conversationId: conversation.id } : {}) },
      schema: conversationSchema,
    });
    setSending(false);
    setPendingText(null);
    if (!result.ok) {
      setError(result.error);
      setDraft(content);
      return;
    }
    const isNew = !conversation;
    setConversation(result.data);
    if (isNew) router.replace(`/app/assistant?c=${result.data.id}`);
    router.refresh();
  }

  async function decide(messageId: string, decision: "confirm" | "dismiss") {
    setDeciding(messageId);
    setError(null);
    const result = await callApi(`/api/assistant/messages/${messageId}/decision`, {
      method: "POST",
      body: { decision },
      schema: conversationSchema,
    });
    setDeciding(null);
    if (!result.ok) return setError(result.error);
    setConversation(result.data);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Conversations" className="space-y-2 lg:sticky lg:top-24 lg:self-start">
        <Link href="/app/assistant" className="btn btn-secondary w-full justify-start">
          <PlusIcon size={16} aria-hidden />
          New conversation
        </Link>
        {conversations.length ? (
          <ul className="max-h-[50vh] space-y-0.5 overflow-y-auto lg:max-h-[calc(100dvh-14rem)]">
            {conversations.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/app/assistant?c=${item.id}`}
                  aria-current={item.id === conversation?.id ? "page" : undefined}
                  className={`block rounded-control px-3 py-2 text-sm ${item.id === conversation?.id ? "bg-paper-deep font-medium" : "text-ink-muted hover:bg-paper-deep hover:text-ink"}`}
                >
                  <span className="block truncate">{item.title}</span>
                  <span className="font-mono text-[11px] text-ink-muted">{formatDateTime(item.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 text-xs text-ink-muted">Your conversations are saved here. Only you can see them.</p>
        )}
      </nav>

      <section className="panel flex min-h-[60vh] flex-col" aria-label="Conversation">
        <div className="panel-head">
          <h2 className="panel-title truncate">{conversation?.title ?? "New conversation"}</h2>
          {conversation ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(true)}>
              <TrashIcon size={14} aria-hidden />
              Delete
            </button>
          ) : null}
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
          {!conversation && !pendingText ? (
            <EmptyState icon={ChatCircleTextIcon} title="Ask anything, or about your work orders.">
              <p>
                The assistant looks up only the work orders you can already open. It can suggest changes, but nothing happens until you
                confirm.
              </p>
              {available ? (
                <div className="mt-4 flex flex-wrap justify-start gap-2 sm:justify-center">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="btn btn-secondary btn-sm h-auto py-1.5 text-left whitespace-normal"
                      onClick={() => send(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </EmptyState>
          ) : null}

          {conversation?.messages.map((message) =>
            message.role === ChatRole.USER ? (
              <div
                key={message.id}
                className="ml-auto max-w-[85%] rounded-panel bg-paper-deep px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-line"
              >
                {message.content}
              </div>
            ) : (
              <article key={message.id} className="max-w-[92%] border-l-2 border-signal/50 pl-4">
                <p className="label-mono mb-1.5">
                  Assistant{message.provider ? ` · ${message.provider}` : ""} · {formatDateTime(message.createdAt)}
                </p>
                <ReplyText content={message.content} links={message.links} />
                {message.notice ? <p className="mt-2 text-xs text-amber-ink">{message.notice}</p> : null}
                <ProposalCard message={message} busy={deciding === message.id} onDecide={(decision) => decide(message.id, decision)} />
                {message.links.length &&
                message.proposal?.type === "create_report" &&
                message.actionStatus === AssistantActionStatus.CONFIRMED ? (
                  <Link href={`/app/work-orders/${message.links[0].workOrderId}`} className="btn btn-secondary btn-sm mt-2">
                    Review {message.links[0].reference}
                    <ArrowSquareOutIcon size={14} aria-hidden />
                  </Link>
                ) : null}
              </article>
            ),
          )}

          {pendingText ? (
            <>
              <div className="ml-auto max-w-[85%] rounded-panel bg-paper-deep px-4 py-2.5 text-[15px] whitespace-pre-line opacity-80">
                {pendingText}
              </div>
              <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
                <CircleNotchIcon size={16} className="animate-spin text-signal motion-reduce:animate-none" aria-hidden />
                Thinking… this can take a few seconds when it looks things up.
              </p>
            </>
          ) : null}
          <div ref={endRef} />
        </div>

        <div className="border-t border-rule px-4 py-3 sm:px-6">
          {!available ? (
            <InlineNotice tone="warning" title="The assistant is unavailable.">
              {unavailableMessage}
            </InlineNotice>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send(draft);
              }}
            >
              {error ? (
                <div className="mb-2">
                  <InlineNotice tone="danger" live>
                    {error.message}
                  </InlineNotice>
                </div>
              ) : null}
              <label htmlFor="assistant-input" className="field-label">
                Message the assistant
              </label>
              <div className="flex items-end gap-2">
                <textarea
                  id="assistant-input"
                  className="input max-h-48 min-h-11 resize-y"
                  rows={2}
                  value={draft}
                  maxLength={2000}
                  placeholder="Ask a question, or describe what you need"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void send(draft);
                    }
                  }}
                />
                <button type="submit" className="btn btn-primary h-11" disabled={sending || !draft.trim()} aria-label="Send message">
                  <PaperPlaneRightIcon size={16} aria-hidden />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
              <p className="mt-1.5 text-xs text-ink-muted">
                Enter to send, Shift+Enter for a new line. Messages go to an external AI provider with contact details removed; don’t
                include passwords.
              </p>
            </form>
          )}
        </div>
      </section>

      {conversation ? (
        <ConfirmActionDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Delete this conversation?"
          description="The messages are removed for good. Anything you confirmed from it stays on the work orders and in the audit log."
          confirmLabel="Delete"
          tone="danger"
          onConfirm={async () => {
            const result = await callApi(`/api/assistant/conversations/${conversation.id}`, { method: "DELETE", schema: anyData });
            if (!result.ok) return result.error.message;
            router.replace("/app/assistant");
            router.refresh();
            return null;
          }}
        />
      ) : null}
    </div>
  );
}
