export default function Loading() {
  return (
    <div className="min-h-screen bg-[#efe9dc]">
      <div className="h-16 animate-pulse border-b border-black/10 bg-[#13151a] px-6">
        <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between">
          <div className="h-6 w-44 rounded-md bg-white/10" />
          <div className="hidden h-10 w-64 rounded-full bg-white/10 lg:block" />
        </div>
      </div>
      <div className="flex flex-col lg:flex-row">
        <aside className="border-b border-black/10 bg-[#faf7f1] p-4 lg:h-[calc(100vh-4rem)] lg:w-72 lg:border-b-0 lg:border-r">
          <div className="space-y-4">
            <div className="h-10 animate-pulse rounded-md bg-black/5" />
            <div className="space-y-2">
              <div className="h-24 animate-pulse rounded-2xl bg-black/5" />
              <div className="h-24 animate-pulse rounded-2xl bg-black/5" />
              <div className="h-24 animate-pulse rounded-2xl bg-black/5" />
            </div>
          </div>
        </aside>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1600px] space-y-6">
            <div className="h-32 animate-pulse rounded-[28px] border border-black/10 bg-[#faf7f1]" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-[24px] border border-black/10 bg-[#faf7f1]" />
              ))}
            </div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
              <div className="h-[420px] animate-pulse rounded-[28px] border border-black/10 bg-[#faf7f1]" />
              <div className="space-y-6">
                <div className="h-48 animate-pulse rounded-[28px] border border-black/10 bg-[#faf7f1]" />
                <div className="h-48 animate-pulse rounded-[28px] border border-black/10 bg-[#faf7f1]" />
              </div>
            </div>
            <div className="h-[360px] animate-pulse rounded-[28px] border border-black/10 bg-[#faf7f1]" />
          </div>
        </main>
      </div>
    </div>
  );
}
