export default function Loading() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <aside className="flex w-[260px] flex-col border-r border-border bg-surface">
        <div className="px-5 pt-5">
          <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        </div>
        <div className="px-3 pt-4">
          <div className="h-8 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="space-y-1 px-3 pt-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-12 animate-pulse rounded-lg bg-muted/60"
              style={{ animationDelay: `${index * 60}ms` }}
            />
          ))}
        </div>
      </aside>

      <main className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="space-y-1.5">
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
            <div className="h-3 w-64 animate-pulse rounded bg-muted/60" />
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-8 w-8 animate-pulse rounded-md bg-muted/60" />
            ))}
          </div>
        </div>

        <div className="border-b border-border px-6 py-4">
          <div className="h-24 animate-pulse rounded-md bg-muted/60" />
          <div className="mt-3 flex justify-center gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-8 w-8 animate-pulse rounded-full bg-muted" />
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-4 px-6 pt-8">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="h-3 w-10 animate-pulse rounded bg-muted/60" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-full animate-pulse rounded bg-muted/60" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-muted/60" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
