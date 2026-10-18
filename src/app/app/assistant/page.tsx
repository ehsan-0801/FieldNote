import { Suspense } from "react";
import type { Metadata } from "next";
import { z } from "zod";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { DomainError } from "@/domain/errors";
import { ASSISTANT_UNAVAILABLE, getConversation, isAssistantAvailable, listConversations } from "@/server/assistant/service";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Assistant" };

const conversationParam = z.string().trim().min(1).max(40).optional().catch(undefined);

export default function AssistantPage({ searchParams }: PageProps<"/app/assistant">) {
  return (
    <>
      <PageHeader
        title="Assistant"
        description="Ask anything. For work orders it uses only what you can already see, and it can suggest changes you confirm yourself."
      />
      <Suspense fallback={<LoadingState label="Loading conversations…" />}>
        <Assistant searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Assistant({ searchParams }: { searchParams: PageProps<"/app/assistant">["searchParams"] }) {
  const user = await requirePageUser();
  const { c } = await searchParams;
  const conversationId = conversationParam.parse(Array.isArray(c) ? c[0] : c);
  const [conversations, conversation] = await Promise.all([
    listConversations(user),
    conversationId
      ? getConversation(user, conversationId).catch((error: unknown) => {
          // Someone else's or a deleted conversation just opens a fresh one.
          if (error instanceof DomainError && error.code === "NOT_FOUND") return null;
          throw error;
        })
      : Promise.resolve(null),
  ]);
  return (
    <AssistantChat
      key={conversation?.id ?? "new"}
      available={isAssistantAvailable()}
      unavailableMessage={ASSISTANT_UNAVAILABLE}
      conversations={conversations.map((item) => ({ id: item.id, title: item.title, updatedAt: item.updatedAt.toISOString() }))}
      conversation={conversation}
    />
  );
}
