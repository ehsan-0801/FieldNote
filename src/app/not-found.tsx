import Link from "next/link";
import { CompassIcon } from "@phosphor-icons/react/ssr";
import { BrandLogo } from "@/components/ui/brand-logo";
import { EmptyState } from "@/components/ui/states";

/** Any address that matches no page, inside or outside the app. */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 inline-flex min-h-11 items-center" aria-label="FieldNote Atlas home">
          <BrandLogo height={36} />
        </Link>
        <div className="panel">
          <EmptyState
            icon={CompassIcon}
            title="There’s no page at this address."
            action={
              <Link href="/app" className="btn btn-primary">
                Go to the overview
              </Link>
            }
          >
            Check the link, or start from the overview.
          </EmptyState>
        </div>
      </div>
    </main>
  );
}
