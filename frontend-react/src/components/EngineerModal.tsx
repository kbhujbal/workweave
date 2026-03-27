import type { Engineer } from '../types';
import PersonaTag from './PersonaTag';
import ScoreBreakdown from './ScoreBreakdown';

interface EngineerModalProps {
  engineer: Engineer;
  onClose: () => void;
}

export default function EngineerModal({ engineer, onClose }: EngineerModalProps) {
  const b = engineer.breakdown;
  const leverageBonus = engineer.leverage_multiplier > 1.0
    ? (engineer.score - engineer.score / engineer.leverage_multiplier)
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="p-6 pb-0">
          <div className="flex items-center gap-5">
            <div className="relative">
              <img
                src={engineer.avatar_url}
                alt={engineer.username}
                className="h-20 w-20 rounded-full border-2 border-zinc-600 shadow-lg"
              />
              <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-zinc-900 bg-zinc-800 text-sm font-bold text-amber-400">
                #{engineer.rank}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <a
                  href={`https://github.com/${engineer.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xl font-bold text-white hover:underline"
                >
                  @{engineer.username}
                </a>
                <PersonaTag persona={engineer.persona_tag} />
              </div>
              <div className="mt-2 flex items-end gap-3">
                <span className="text-4xl font-black tabular-nums text-white">{engineer.score.toFixed(1)}</span>
                <span className="mb-1 text-sm text-zinc-500">Impact Score</span>
              </div>
            </div>
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="px-6 pt-5">
          <ScoreBreakdown
            prScore={b.pr_score}
            reviewScore={b.review_score}
            issueScore={b.issue_score}
            prCount={b.pr_count}
            reviewCount={b.review_count}
            issueCount={b.issue_count}
            total={engineer.score}
          />
        </div>

        {/* Detailed Stats Grid */}
        <div className="mx-6 mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-center">
            <div className="text-2xl font-bold tabular-nums text-violet-400">{b.pr_count}</div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Merged PRs</div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-center">
            <div className="text-2xl font-bold tabular-nums text-sky-400">{b.review_count}</div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Reviews Given</div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-center">
            <div className="text-2xl font-bold tabular-nums text-amber-400">{b.issue_count}</div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Issues Filed</div>
          </div>
        </div>

        {/* Score Calculation */}
        <div className="mx-6 mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">How this score was calculated</h3>
          <div className="space-y-1.5 text-sm text-zinc-400">
            <div className="flex justify-between">
              <span><span className="text-violet-400">PR Score</span>: {b.pr_count} PRs x avg {b.pr_count > 0 ? (b.pr_score / b.pr_count).toFixed(1) : '0'} pts</span>
              <span className="font-mono text-zinc-300">{b.pr_score.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span><span className="text-sky-400">Review Score</span>: {b.review_count} reviews x 2 pts</span>
              <span className="font-mono text-zinc-300">{b.review_score.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span><span className="text-amber-400">Issue Score</span>: {b.issue_count} issues x 1 pt</span>
              <span className="font-mono text-zinc-300">{b.issue_score.toFixed(1)}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-800 pt-1.5">
              <span className="text-zinc-300">Subtotal</span>
              <span className="font-mono text-zinc-300">{(b.pr_score + b.review_score + b.issue_score).toFixed(1)}</span>
            </div>
            {engineer.leverage_multiplier > 1.0 && (
              <div className="flex justify-between">
                <span><span className="text-yellow-400">Leverage bonus</span> ({engineer.leverage_multiplier}x)</span>
                <span className="font-mono text-yellow-400">+{leverageBonus.toFixed(1)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-zinc-700 pt-1.5 text-base font-bold">
              <span className="text-white">Total Impact Score</span>
              <span className="font-mono text-white">{engineer.score.toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* Avg Complexity */}
        {b.avg_complexity > 0 && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-2.5">
            <span className="text-xs text-zinc-500">Avg PR Complexity:</span>
            <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-500/60"
                style={{ width: `${(b.avg_complexity / 2.0) * 100}%` }}
              />
            </div>
            <span className="font-mono text-sm font-semibold text-violet-400">{b.avg_complexity.toFixed(2)}</span>
            <span className="text-[10px] text-zinc-600">/ 2.0</span>
          </div>
        )}

        {/* Why */}
        <div className="mx-6 mt-4 rounded-lg border border-zinc-700/50 bg-zinc-800/40 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5.002 5.002 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Why this ranking
          </div>
          <p className="text-sm leading-relaxed text-zinc-300">{engineer.why}</p>
        </div>

        {/* Top PRs */}
        {engineer.top_prs.length > 0 && (
          <div className="mx-6 mt-4 mb-6">
            <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Top Contributions (by complexity)
            </h3>
            <ul className="space-y-2">
              {engineer.top_prs.slice(0, 5).map((pr, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg border border-zinc-800/50 bg-zinc-950/30 px-3 py-2 text-xs">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-800 text-[10px] font-bold text-zinc-400">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={`https://github.com/posthog/posthog/pull/${pr.number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-zinc-300 hover:text-white hover:underline"
                      title={pr.title}
                    >
                      {pr.title}
                    </a>
                    <span className="text-[10px] text-zinc-600">#{pr.number}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-sm font-semibold text-violet-400">{pr.complexity.toFixed(1)}</div>
                    <div className="text-[9px] text-zinc-600">complexity</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
