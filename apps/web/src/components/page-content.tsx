export function PageContent({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-7xl">
        {children}
      </div>
    </main>
  );
}
