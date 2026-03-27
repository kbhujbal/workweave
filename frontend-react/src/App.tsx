import { useEffect, useMemo, useState } from 'react';
import type { Engineer } from './types';
import { sampleEngineers } from './sampleData';
import EngineerCard from './components/EngineerCard';
import EngineerModal from './components/EngineerModal';

const PERSONA_LIST = ['The Architect', 'The Guardian', 'The Closer', 'The Machine', 'The Polymath'] as const;

const personaColors: Record<string, string> = {
  'The Architect': 'border-purple-500/40 bg-purple-500/10 text-purple-300',
  'The Guardian': 'border-blue-500/40 bg-blue-500/10 text-blue-300',
  'The Closer': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  'The Machine': 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  'The Polymath': 'border-teal-500/40 bg-teal-500/10 text-teal-300',
};

function App() {
  const [allEngineers, setAllEngineers] = useState<Engineer[]>(sampleEngineers);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<'live' | 'sample'>('sample');
  const [search, setSearch] = useState('');
  const [activePersona, setActivePersona] = useState<string | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);
  const [selectedEngineer, setSelectedEngineer] = useState<Engineer | null>(null);

  useEffect(() => {
    fetch('/ranked_engineers.json')
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data: Record<string, unknown>) => {
        const raw = Array.isArray(data) ? data : (data as { engineers?: Engineer[] }).engineers ?? [];
        const list = raw as Engineer[];
        if (list.length === 0) throw new Error('Empty data');
        setAllEngineers(list.slice(0, 5));
        setDataSource('live');
      })
      .catch(() => {
        setAllEngineers(sampleEngineers);
        setDataSource('sample');
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = allEngineers;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((e) => e.username.toLowerCase().includes(q));
    }
    if (activePersona) {
      result = result.filter((e) => e.persona_tag === activePersona);
    }
    return result;
  }, [allEngineers, search, activePersona]);

  const availablePersonas = useMemo(() => {
    const set = new Set(allEngineers.map((e) => e.persona_tag));
    return PERSONA_LIST.filter((p) => set.has(p));
  }, [allEngineers]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-96 bg-linear-to-b from-violet-950/20 to-transparent" />

      <div className="relative mx-auto max-w-7xl px-3 py-3 sm:px-5">
        {/* Header */}
        <header className="mb-3 text-center">
          <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-[10px] font-medium text-zinc-400 backdrop-blur">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {dataSource === 'live' ? 'Live Data' : 'Sample Data'}
          </div>
          <h1 className="bg-linear-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-2xl font-black tracking-tight text-transparent sm:text-3xl">
            Engineering Impact Dashboard
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            <span className="font-mono text-zinc-400">posthog/posthog</span>
            <span className="mx-2 text-zinc-700">|</span>
            Last 90 Days
          </p>
        </header>

        {/* Filters + Methodology Toggle */}
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search engineer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 w-40 rounded-lg border border-zinc-700/50 bg-zinc-900 pl-8 pr-3 text-[10px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30"
              />
            </div>

            {/* Persona Filters */}
            {availablePersonas.map((p) => (
              <button
                key={p}
                onClick={() => setActivePersona(activePersona === p ? null : p)}
                className={`h-7 rounded-lg border px-2.5 text-[10px] font-medium transition-all ${
                  activePersona === p
                    ? personaColors[p]
                    : 'border-zinc-700/50 bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {p.replace('The ', '')}
              </button>
            ))}

            {(search || activePersona) && (
              <button
                onClick={() => { setSearch(''); setActivePersona(null); }}
                className="h-7 rounded-lg border border-zinc-700/50 bg-zinc-900 px-2.5 text-[10px] text-zinc-500 hover:text-zinc-300"
              >
                Clear
              </button>
            )}
          </div>

          <button
            onClick={() => setShowMethodology(true)}
            className="h-7 shrink-0 rounded-lg border border-zinc-700/50 bg-zinc-900 px-3 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            How is this calculated?
          </button>
        </div>

        {/* Filter status */}
        {(search || activePersona) && (
          <p className="mb-2 text-[10px] text-zinc-500">
            Showing {filtered.length} of {allEngineers.length} engineers
          </p>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-32">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
          </div>
        )}

        {/* Engineer Cards Grid */}
        {!loading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((eng) => (
              <div key={eng.username}>
                <EngineerCard engineer={eng} onClick={() => setSelectedEngineer(eng)} />
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full py-16 text-center text-sm text-zinc-500">
                No engineers match your filters.
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-4 border-t border-zinc-800/50 pb-3 pt-2 text-center text-[10px] text-zinc-600">
          WorkWeave Engineering Impact Dashboard &middot; Data sourced from GitHub API
          &middot; Scores computed via AI-powered analysis engine
        </footer>
      </div>

      {/* Engineer Detail Modal */}
      {selectedEngineer && (
        <EngineerModal engineer={selectedEngineer} onClose={() => setSelectedEngineer(null)} />
      )}

      {/* Methodology Modal */}
      {showMethodology && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowMethodology(false)}
        >
          <div
            className="relative mx-4 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowMethodology(false)}
              className="absolute right-4 top-4 text-zinc-500 hover:text-zinc-200"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h2 className="mb-5 text-lg font-bold text-zinc-200">Scoring Methodology</h2>

            <div className="grid gap-6 sm:grid-cols-3">
              <div>
                <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-violet-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
                  PR Score
                </h3>
                <p className="text-xs leading-relaxed text-zinc-400">
                  Each merged PR earns 5 base points scaled by AI-assessed complexity (0.1-2.0).
                </p>
              </div>
              <div>
                <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-sky-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
                  Review Score
                </h3>
                <p className="text-xs leading-relaxed text-zinc-400">
                  Each code review on another engineer's PR earns 2 points.
                </p>
              </div>
              <div>
                <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-amber-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  Issue Score
                </h3>
                <p className="text-xs leading-relaxed text-zinc-400">
                  Each issue filed earns 1 point. Only counted for active code contributors.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-zinc-300">Formula</h3>
              <code className="block text-sm leading-loose text-zinc-400">
                <span className="text-white">S</span> = [
                <span className="text-violet-400">sum(5 x Complexity)</span> +{' '}
                <span className="text-sky-400">Reviews x 2</span> +{' '}
                <span className="text-amber-400">Issues x 1</span>]
                <span className="text-yellow-400"> x L</span>
              </code>
              <div className="mt-2 space-y-1 text-xs text-zinc-500">
                <p><span className="text-violet-400/70">Complexity</span>: AI-scored 0.1 (typo) to 2.0 (architectural change) per PR</p>
                <p><span className="text-yellow-400/70">Leverage (L)</span>: 1.2x bonus if reviews &gt; 2x own PR count, otherwise 1.0</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-5">
              {[
                { name: 'Architect', bg: 'bg-purple-500/15', text: 'text-purple-300', border: 'border-purple-500/30', desc: 'High-complexity work' },
                { name: 'Guardian', bg: 'bg-blue-500/15', text: 'text-blue-300', border: 'border-blue-500/30', desc: 'Review leverage' },
                { name: 'Closer', bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30', desc: 'Issue resolution' },
                { name: 'Machine', bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/30', desc: 'High output volume' },
                { name: 'Polymath', bg: 'bg-pink-500/15', text: 'text-pink-300', border: 'border-pink-500/30', desc: 'Broad contributor' },
              ].map((p) => (
                <div key={p.name} className={`rounded-lg border ${p.border} ${p.bg} p-2.5 text-center`}>
                  <div className={`text-xs font-semibold ${p.text}`}>{p.name}</div>
                  <div className="text-[10px] text-zinc-500">{p.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
