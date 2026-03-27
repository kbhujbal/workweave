interface InsightPanelProps {
  insight: string;
}

export default function InsightPanel({ insight }: InsightPanelProps) {
  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/40 p-2.5">
      <div className="mb-1 flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-zinc-500">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5.002 5.002 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        Why this ranking
      </div>
      <p className="text-xs leading-relaxed text-zinc-300">{insight}</p>
    </div>
  );
}
