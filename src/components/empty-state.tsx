interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-[#1f2937] bg-[#0b1220]/50 px-6 py-16 text-center">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-[#e2e8f0] mb-2">{title}</h3>
      <p className="text-sm text-[#94a3b8] max-w-md mx-auto leading-relaxed">
        {description}
      </p>
    </div>
  );
}
