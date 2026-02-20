import { AlertTriangle } from "lucide-react";

interface ErrorCardProps {
  title: string;
  message: string;
  suggestion?: string;
}

export function ErrorCard({ title, message, suggestion }: ErrorCardProps) {
  return (
    <div className="rounded-xl border border-[#ef4444]/30 bg-red-500/5 p-6">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
          <AlertTriangle className="h-4 w-4 text-red-400" />
        </div>
        <span className="font-semibold text-[#e2e8f0]">{title}</span>
      </div>
      <p className="text-sm text-[#94a3b8]">{message}</p>
      {suggestion && (
        <p className="text-xs text-[#94a3b8]/70 italic mt-2">
          {suggestion}
        </p>
      )}
    </div>
  );
}
