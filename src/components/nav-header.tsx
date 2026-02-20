import Link from "next/link";

export function NavHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight hover:text-primary transition-colors"
        >
          Mission Control
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Stories
          </Link>
          <Link
            href="/board"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Board
          </Link>
        </nav>
      </div>
    </header>
  );
}
