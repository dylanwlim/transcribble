export default function Loading() {
  return (
    <div className="min-h-screen bg-white">
      <div className="h-16 animate-pulse border-b border-gray-200 bg-white px-6">
        <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between">
          <div className="h-6 w-52 rounded-md bg-gray-100" />
          <div className="hidden h-10 w-80 rounded-md bg-gray-100 lg:block" />
        </div>
      </div>
      <div className="flex flex-col lg:flex-row">
        <aside className="border-b border-gray-200 bg-white p-4 lg:h-[calc(100vh-4rem)] lg:w-60 lg:border-b-0 lg:border-r">
          <div className="space-y-4">
            <div className="h-10 animate-pulse rounded-md bg-gray-100" />
            <div className="space-y-2">
              <div className="h-10 animate-pulse rounded-md bg-purple-50" />
              <div className="h-10 animate-pulse rounded-md bg-gray-50" />
              <div className="h-10 animate-pulse rounded-md bg-gray-50" />
            </div>
          </div>
        </aside>
        <main className="flex-1 bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1600px] space-y-6">
            <div className="h-24 animate-pulse rounded-lg border border-gray-200 bg-white" />
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-32 animate-pulse rounded-lg border border-gray-200 bg-white" />
              ))}
            </div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
              <div className="h-[420px] animate-pulse rounded-lg border border-gray-200 bg-white" />
              <div className="space-y-6">
                <div className="h-48 animate-pulse rounded-lg border border-gray-200 bg-white" />
                <div className="h-48 animate-pulse rounded-lg border border-gray-200 bg-white" />
              </div>
            </div>
            <div className="h-[360px] animate-pulse rounded-lg border border-gray-200 bg-white" />
          </div>
        </main>
      </div>
    </div>
  );
}
