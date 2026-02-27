import { AlertTriangle } from "lucide-react";

interface ErrorCardProps {
  title: string;
  message: string;
  suggestion?: string;
}

export function ErrorCard({ title, message, suggestion }: ErrorCardProps) {
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <div className="mb-3 flex items-center gap-2.5">
        <div aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </div>
        <span className="font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {suggestion && (
        <p className="mt-2 text-xs italic text-muted-foreground/70">
          {suggestion}
        </p>
      )}
    </div>
  );
}
