import { Suspense } from "react";
import type { Metadata } from "next";
import { LoadingState } from "@/components/ui/loading-state";
import { AdminOnly } from "@/components/admin/admin-only";
import { AiProviderManager } from "@/components/admin/ai-provider-manager";
import { PageHeader } from "@/components/ui/page-header";
import { canManageWorkspace } from "@/domain/access";
import { listAiProviders } from "@/server/admin/ai-providers";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "AI providers" };

// Session-dependent content streams in behind its own boundary so client navigations stay instant.
export default function AiProvidersPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading AI providers…" />}>
      <AiProviders />
    </Suspense>
  );
}

async function AiProviders() {
  const user = await requirePageUser();
  if (!canManageWorkspace(user)) return <AdminOnly />;
  const { providers, source } = await listAiProviders(user);
  return (
    <>
      <PageHeader
        title="AI providers"
        description="Choose the model used for report drafting and the assistant. Keys are encrypted when saved and only their last four characters are ever shown."
      />
      <AiProviderManager
        source={source}
        providers={providers.map((provider) => ({
          id: provider.id,
          label: provider.label,
          provider: provider.provider,
          service: provider.service,
          model: provider.model,
          keyLast4: provider.keyLast4,
          baseUrl: provider.baseUrl,
          isActive: provider.isActive,
          keyReadable: provider.keyReadable,
          createdByName: provider.createdByName,
          updatedAt: provider.updatedAt.toISOString(),
        }))}
      />
    </>
  );
}
