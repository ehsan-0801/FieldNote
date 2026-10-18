"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  ArrowSquareOutIcon,
  ChatCircleTextIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  PaperPlaneRightIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
} from "@phosphor-icons/react/ssr";
import { AssistantActionStatus, ChatRole } from "@/generated/prisma/enums";
import { REFERENCE_PATTERN, storedLinksSchema, storedProposalSchema, type StoredProposal } from "@/domain/assistant";
import { STATUS_LABEL } from "@/domain/workflow";
import { anyData, callApi, type ApiFailure } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { ConfirmActionDialog } from "../ui/confirm-action-dialog";
import { EmptyState, InlineNotice } from "../ui/states";

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(ChatRole),
  content: z.string(),
  links: storedLinksSchema,
  proposal: storedProposalSchema.nullable(),
  actionStatus: z.enum(AssistantActionStatus).nullable(),
  actionResult: z.string().nullable(),
  notice: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.string(),
});
const conversationSchema = z.object({ id: z.string(), title: z.string(), messages: z.array(messageSchema) });

export type ChatMessage = z.infer<typeof messageSchema>;
export type Conversation = z.infer<typeof conversationSchema>;

const SUGGESTIONS = [
  "What needs a decision today?",
  "Summarise the latest on WO-1008.",
  "How is priority worked out here?",
  "Help me report: the lift on level 2 keeps stopping between floors.",
];

/** Plain-text reply with "- " bullet lists; work-order references the person can open become links. */
function ReplyText({ content, links }: { content: string; links: ChatMessage["links"] }) {
  const byReference = new Map(links.map((link) => [link.reference, link.workOrderId]));
  const withLinks = (line: string, key: string): ReactNode[] =>
    line.split(new RegExp(`(${REFERENCE_PATTERN.source})`, "g")).map((part, index) => {
      const workOrderId = byReference.get(part);
      return workOrderId ? (
        <Link key={`${key}-${index}`} href={`/app/work-orders/${workOrderId}`} className="link font-mono text-[0.92em]">
          {part}
        </Link>
      ) : (
        <Fragment key={`${key}-${index}`}>{part}</Fragment>
      );
    });

  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      const items = bullets;
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-5">
          {items.map((item, index) => (
            <li key={index}>{withLinks(item, `li-${blocks.length}-${index}`)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const line of content.split("\n")) {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={`p-${blocks.length}`}>{withLinks(line, `p-${blocks.length}`)}</p>);
  }
  flush();
  return <div className="space-y-2 text-[15px] leading-relaxed">{blocks}</div>;
}

function describeProposal(proposal: StoredProposal): { title: string; detailLabel?: string; detail?: string } {
  switch (proposal.type) {
    case "assign":
      return { title: `Assign ${proposal.reference} to ${proposal.assigneeName}` };
    case "change_status":
      return {
        title: `Move ${proposal.reference} to ${STATUS_LABEL[proposal.toStatus]}`,
        detailLabel: proposal.toStatus === "RESOLVED" ? "Resolution note" : "Reason",
        detail: proposal.text || undefined,
      };
    case "add_note":
      return { title: `Add a note to ${proposal.reference}`, detailLabel: "Note", detail: proposal.body };
    case "create_report":
      return {
        title: "File a new report",
        detailLabel: proposal.location ? `Report · ${proposal.location}` : "Report",
        detail: proposal.report,
      };
  }
}

function ProposalCard({
  message,
  onDecide,
  busy,
}: {
  message: ChatMessage;
  onDecide: (decision: "confirm" | "dismiss") => void;
  busy: boolean;
}) {
  if (!message.proposal) return null;
  const { title, detailLabel, detail } = describeProposal(message.proposal);
  const status = message.actionStatus;
  return (
    <div className="mt-3 rounded-panel border border-signal/40 bg-chalk">
      <div className="border-b border-rule px-4 py-2.5">
        <p className="label-mono">Suggested action · needs your confirmation</p>
        <p className="mt-0.5 text-sm font-semibold">{title}</p>
      </div>
      {detail ? (
        <div className="px-4 py-3 text-sm">
          <p className="label-mono mb-1">{detailLabel}</p>
          <p className="whitespace-pre-line">{detail}</p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t border-rule px-4 py-2.5" aria-live="polite">
        {status === AssistantActionStatus.PENDING ? (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onDecide("confirm")}>
              <CheckCircleIcon size={14} aria-hidden />
              {busy ? "Working…" : "Confirm"}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onDecide("dismiss")}>
              Dismiss
            </button>
            <span className="text-xs text-ink-muted">Runs with your permissions and is recorded in the audit log.</span>
          </>
        ) : status === AssistantActionStatus.CONFIRMED ? (
          <p className="flex items-center gap-1.5 text-sm text-signal">
            <CheckCircleIcon size={16} weight="fill" aria-hidden />
            {message.actionResult}
          </p>
        ) : status === AssistantActionStatus.FAILED ? (
          <p className="flex items-center gap-1.5 text-sm text-oxide">
            <XCircleIcon size={16} weight="fill" aria-hidden />
            Not done: {message.actionResult}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">Dismissed.</p>
        )}
      </div>
    </div>
  );
}

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
    const result = await callApi("/api/assistant/messages", {
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
              <label htmlFor="assistant-input" className="sr-only">
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
