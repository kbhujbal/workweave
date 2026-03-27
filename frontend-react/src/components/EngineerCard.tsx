import type { Engineer } from '../types';
import PersonaTag from './PersonaTag';
import ScoreBreakdown from './ScoreBreakdown';
import InsightPanel from './InsightPanel';

interface EngineerCardProps {
  engineer: Engineer;
  onClick: () => void;
}

const DEFAULT_GRADIENT = 'from-zinc-600/10 via-transparent to-transparent border-zinc-700/40';
const DEFAULT_RANK_COLOR = 'text-zinc-500';

const rankGradients: Record<number, string> = {
  1: 'from-amber-500/20 via-amber-500/5 to-transparent border-amber-500/30',
  2: 'from-zinc-300/15 via-zinc-300/5 to-transparent border-zinc-400/25',
  3: 'from-orange-700/15 via-orange-700/5 to-transparent border-orange-700/25',
};

const rankColors: Record<number, string> = {
  1: 'text-amber-400',
  2: 'text-zinc-300',
  3: 'text-orange-600',
};

export default function EngineerCard({ engineer, onClick }: EngineerCardProps) {
  const gradient = rankGradients[engineer.rank] || DEFAULT_GRADIENT;
  const rankColor = rankColors[engineer.rank] || DEFAULT_RANK_COLOR;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-linear-to-br ${gradient} backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/20 cursor-pointer`}
      onClick={onClick}
    >
      {/* Rank badge */}
      <div className="absolute right-4 top-4">
        <span className={`font-mono text-4xl font-black opacity-20 ${rankColor}`}>
          #{engineer.rank}
        </span>
      </div>

      <div className="relative p-3.5">
        {/* Header: Avatar + Name + Persona */}
        <div className="mb-2.5 flex items-center gap-3">
          <div className="relative">
            <img
              src={engineer.avatar_url}
              alt={engineer.username}
              className="h-10 w-10 rounded-full border-2 border-zinc-700 shadow-lg"
              loading="lazy"
            />
            <div
              className={`absolute -bottom-0.5 -left-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-zinc-900 bg-zinc-800 text-[9px] font-bold ${rankColor}`}
            >
              {engineer.rank}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="truncate text-sm font-semibold text-zinc-100 group-hover:text-white">
                @{engineer.username}
              </span>
              <PersonaTag persona={engineer.persona_tag} />
            </div>
          </div>
        </div>

        {/* Score + Leverage */}
        <div className="mb-2.5 flex items-end gap-2">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-zinc-500">Impact Score</div>
            <div className="text-2xl font-black tabular-nums text-white">
              {engineer.score.toFixed(1)}
            </div>
          </div>
          {engineer.leverage_multiplier > 1.0 && (
            <span className="mb-0.5 inline-flex items-center gap-1 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-yellow-400">
              <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" />
              </svg>
              {engineer.leverage_multiplier}x
            </span>
          )}
        </div>

        {/* Score Breakdown */}
        <div className="mb-2.5">
          <ScoreBreakdown
            prScore={engineer.breakdown.pr_score}
            reviewScore={engineer.breakdown.review_score}
            issueScore={engineer.breakdown.issue_score}
            prCount={engineer.breakdown.pr_count}
            reviewCount={engineer.breakdown.review_count}
            issueCount={engineer.breakdown.issue_count}
            total={engineer.score}
          />
        </div>

        {/* Insight */}
        <InsightPanel insight={engineer.why} />

        {/* Click hint */}
        <div className="mt-2 text-center text-[9px] text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">
          Click for details
        </div>
      </div>
    </div>
  );
}
