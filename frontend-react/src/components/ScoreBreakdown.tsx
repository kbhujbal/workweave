interface ScoreBreakdownProps {
  prScore: number;
  reviewScore: number;
  issueScore: number;
  prCount: number;
  reviewCount: number;
  issueCount: number;
  total: number;
}

export default function ScoreBreakdown({ prScore, reviewScore, issueScore, prCount, reviewCount, issueCount, total }: ScoreBreakdownProps) {
  const safeTotal = total || 1;
  const prPct = (prScore / safeTotal) * 100;
  const reviewPct = (reviewScore / safeTotal) * 100;
  const issuePct = (issueScore / safeTotal) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-zinc-400">
        <span>Score Breakdown</span>
        <span className="font-mono">{total.toFixed(1)}</span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className="bg-violet-500 transition-all duration-500"
          style={{ width: `${prPct}%` }}
          title={`PR Score: ${prScore.toFixed(1)} from ${prCount} PRs`}
        />
        <div
          className="bg-sky-500 transition-all duration-500"
          style={{ width: `${reviewPct}%` }}
          title={`Review Score: ${reviewScore.toFixed(1)} from ${reviewCount} reviews`}
        />
        <div
          className="bg-amber-500 transition-all duration-500"
          style={{ width: `${issuePct}%` }}
          title={`Issue Score: ${issueScore.toFixed(1)} from ${issueCount} issues`}
        />
      </div>
      <div className="flex gap-3 text-[10px]">
        <span className="flex items-center gap-1.5" title={`${prScore.toFixed(1)} pts from ${prCount} merged PRs`}>
          <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
          <span className="text-zinc-400">PR</span>
          <span className="font-mono text-zinc-300">{prScore.toFixed(1)}</span>
          <span className="text-zinc-600">({prCount})</span>
        </span>
        <span className="flex items-center gap-1.5" title={`${reviewScore.toFixed(1)} pts from ${reviewCount} reviews given`}>
          <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
          <span className="text-zinc-400">Review</span>
          <span className="font-mono text-zinc-300">{reviewScore.toFixed(1)}</span>
          <span className="text-zinc-600">({reviewCount})</span>
        </span>
        <span className="flex items-center gap-1.5" title={`${issueScore.toFixed(1)} pts from ${issueCount} issues filed`}>
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-zinc-400">Issue</span>
          <span className="font-mono text-zinc-300">{issueScore.toFixed(1)}</span>
          <span className="text-zinc-600">({issueCount})</span>
        </span>
      </div>
    </div>
  );
}
