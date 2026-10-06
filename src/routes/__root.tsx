import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  Link,
  Outlet,
  useRouter,
} from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";

function NotFound() {
  return (
    <main className="grid min-h-[70vh] place-items-center px-4 text-center">
      <div>
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">That page doesn't exist.</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Back to library
        </Link>
      </div>
    </main>
  );
}

function ErrorView({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <main className="grid min-h-[70vh] place-items-center px-4 text-center">
      <div className="max-w-md">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <button
          onClick={() => {
            void router.invalidate();
            reset();
          }}
          className="mt-6 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <>
      <div className="aurora pointer-events-none fixed inset-0 -z-10" />
      <SiteHeader />
      <Outlet />
    </>
  ),
  notFoundComponent: NotFound,
  errorComponent: ErrorView,
});
