import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { z } from "zod";
import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import { AssistantActionStatus, ChatRole } from "@/generated/prisma/enums";
import { REFERENCE_PATTERN, storedLinksSchema, storedProposalSchema, type StoredProposal } from "@/domain/assistant";
import { STATUS_LABEL } from "@/domain/workflow";

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
export const conversationSchema = z.object({ id: z.string(), title: z.string(), messages: z.array(messageSchema) });

type ChatMessage = z.infer<typeof messageSchema>;
export type Conversation = z.infer<typeof conversationSchema>;

export function ReplyText({ content, links }: { content: string; links: ChatMessage["links"] }) {
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

export function ProposalCard({
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
