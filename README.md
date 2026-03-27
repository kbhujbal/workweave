# WorkWeave - Engineering Impact Dashboard

A single-page dashboard that ranks and visualizes the most impactful engineers in the [posthog/posthog](https://github.com/posthog/posthog) repository over the last 90 days.

Built as a modular monolith: **Go** (data fetching) + **Python** (AI-powered scoring) + **React/Tailwind** (visualization).

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Scoring Methodology](#scoring-methodology)
  - [Impact Score Formula](#impact-score-formula)
  - [PR Complexity Scoring](#pr-complexity-scoring)
  - [Leverage Multiplier](#leverage-multiplier)
  - [Persona Tags](#persona-tags)
- [SPACE Framework Coverage](#space-framework-coverage)
- [Data Pipeline](#data-pipeline)
- [Setup & Running](#setup--running)
- [Project Structure](#project-structure)

---

## Architecture Overview

```
GitHub API (posthog/posthog)
        |
        v
  backend-go/main.go          [Go - Data Fetching]
  Fetches all merged PRs, reviews, and closed issues from the last 90 days.
        |
        v
  data/raw_github_data.json    [Shared JSON Cache]
        |
        v
  logic-python/scorer.py       [Python - AI Scoring]
  Scores PR complexity via Gemini LLM (or heuristic fallback),
  computes per-engineer impact scores, assigns persona tags.
        |
        v
  data/ranked_engineers.json    [Shared JSON Cache]
        |
        v
  frontend-react/              [React + Tailwind + TypeScript]
  Renders a dark, executive-level dashboard showing Top 5 engineers
  with score breakdowns, persona tags, and transparency insights.
```

---

## Scoring Methodology

### Impact Score Formula

The Leverage-Adjusted Impact Score is based on the **SPACE Framework** for developer productivity:

```
S = [ PR_Score + Review_Score + Issue_Score ] x Leverage_Multiplier
```

Where:

| Component        | Formula                         | Description                                       |
|------------------|---------------------------------|---------------------------------------------------|
| **PR Score**     | `sum(5 x Complexity)` per PR    | Each merged PR earns 5 base points scaled by its complexity (0.1-2.0). A typical PR scores ~4 pts; an architectural PR scores ~9 pts. |
| **Review Score** | `Review_Count x 2`              | Each code review given on another engineer's PR earns 2 points. Only reviews on *other people's* PRs count. |
| **Issue Score**  | `Issue_Count x 1`               | Each issue filed earns 1 point. Deliberately low-weighted since filing an issue is less effort than authoring a PR. Only credited to engineers who also have code contributions (PRs or reviews). Pure issue-filers are excluded. |
| **Leverage (L)** | `1.2` if Reviews/PRs > 2.0, else `1.0` | 20% bonus for engineers who review more than 2x their own PR output. |

**Design Rationale**: PRs are the dominant signal (5pt base) because code authorship is the strongest indicator of engineering output. Reviews (2pt) reward collaboration. Issues (1pt) are deliberately low-weighted — filing an issue is valuable but far less effort than authoring a PR or conducting a review. Issues only count for active code contributors to prevent non-contributors from ranking.

---

### PR Complexity Scoring

Each PR is assigned a complexity multiplier between **0.1** and **2.0**. Two scoring strategies are available:

#### 1. LLM-Based Scoring (Gemini 2.5 Flash)

When a `GEMINI_API_KEY` is configured, PRs are sent to Google Gemini in **chunks of 25** for complexity analysis.

**Rubric provided to the model:**

| Score Range | Category                                    |
|-------------|---------------------------------------------|
| 0.1 - 0.3  | Typos, docs, config changes, dependency bumps |
| 0.4 - 0.6  | Small bug fixes, minor features, test additions |
| 0.7 - 1.0  | Medium features, refactors, new endpoints    |
| 1.1 - 1.5  | Large features, significant refactors, new modules |
| 1.6 - 2.0  | Core architectural changes, new systems, migrations |

**Anti-hallucination measures:**
- Each PR in the prompt is separated with numbered delimiters (`--- PR 1/25 ---`) and labeled with its unique `pr_number`.
- The system prompt explicitly instructs: *"Score EACH PR independently. Use the pr_number to identify each PR. Do NOT confuse PRs with each other."*
- Each chunk ends with `=== END OF CHUNK - Return exactly N scores ===`.
- A 4-second delay between API calls respects the 15 RPM free-tier rate limit.
- If any chunk fails, only that chunk falls back to heuristic scoring; successful chunks retain LLM scores.

**Data sent per PR:**
- `pr_number`, `author`, `title`, `description` (first 150 characters), `files_changed`, `additions`, `deletions`

#### 2. Heuristic-Based Scoring (Fallback)

Used when no API key is set or when LLM calls fail. Scores are derived from change volume and title keywords.

**Base score from change volume:**

| Total Lines Changed | Files Changed | Base Score |
|---------------------|---------------|------------|
| <= 20               | <= 2          | 0.2        |
| <= 80               | <= 5          | 0.5        |
| <= 300              | <= 15         | 0.8        |
| <= 800              | <= 30         | 1.2        |
| > 800               | > 30          | 1.6        |

**Adjustments:**
- **+0.2** if files_changed > 20
- **+0.1** if files_changed > 10
- **Keyword boost from PR title:**
  - High complexity (+0.4): "architect", "migration", "redesign", "rewrite", "system", "infrastructure", "pipeline", "framework", "breaking change", "new service"
  - Medium complexity (+0.15): "refactor", "feature", "implement", "endpoint", "module", "service"
  - Low complexity (-0.25): "typo", "readme", "docs", "ci", "chore", "bump", "lint"

Final score is clamped to `[0.1, 2.0]`.

**Scoring method transparency:** The output JSON includes a `scoring_method` field that honestly reports:
- `"llm"` - all chunks scored via Gemini
- `"mixed"` - some LLM, some heuristic fallback
- `"heuristic"` - all LLM calls failed or no API key

---

### Leverage Multiplier

The Leverage Multiplier identifies engineers who **scale their impact by enabling others** through code reviews.

```
If (Reviews Given / PRs Authored) > 2.0:
    L = 1.2  (20% bonus)
Else:
    L = 1.0  (no bonus)
```

**Why this matters:** An engineer who reviews 30 PRs while authoring 10 of their own is unblocking the entire team. This "force multiplier" effect is captured by the 1.2x bonus applied to their entire score.

---

### Persona Tags

Each engineer is assigned a persona tag based on their **strongest SPACE dimension**. Tags are evaluated in priority order:

| Persona          | Condition                                      | Description                          |
|------------------|-------------------------------------------------|--------------------------------------|
| **The Architect** | Average PR complexity > 1.2                    | Tackles the hardest, most complex work |
| **The Guardian**  | Leverage multiplier = 1.2                      | Scales the team through reviews       |
| **The Closer**    | Issue score > 15% of total score               | Drives bug fixes and issue resolution |
| **The Polymath**  | All dimensions between 15-55% (balanced)       | Broad cross-area contributor          |
| **The Machine**   | Default (none of the above)                    | Highest raw output volume             |

Each persona also generates a human-readable **"Why" insight** explaining the ranking, e.g.:
- *"Lead contributor to complex changes like 'Refactor HogQL query engine'"*
- *"Reviewed 35 PRs across the team, more than 2x their own PR output"*

---

## SPACE Framework Coverage

The scoring methodology maps to the [SPACE Framework](https://queue.acm.org/detail.cfm?id=3454124) dimensions:

| SPACE Dimension                | Coverage | How                                                  |
|-------------------------------|----------|------------------------------------------------------|
| **S**atisfaction & Well-being | Partial  | Weekly consistency as an engagement proxy (planned)   |
| **P**erformance               | Partial  | PR complexity scoring as a quality proxy              |
| **A**ctivity                  | Covered  | PR count, review count, issue count                   |
| **C**ommunication & Collaboration | Partial | Review count and leverage multiplier                |
| **E**fficiency                | Planned  | Time-to-merge, review turnaround (data available)     |

---

## Data Pipeline

### What Gets Fetched (Go Backend)

From `posthog/posthog` for the last 90 days:

- **Merged Pull Requests**: number, title, author, body, merged_at, files_changed, additions, deletions, reviews (author + state per review)
- **Closed Issues**: number, title, author, labels, closed_at
- Pagination handles all data within the window (no fixed count limit)
- PR enrichment: 2 API calls per PR (detail endpoint + reviews endpoint)

### Filtering Rules (Python Scorer)

- **Code contributors only**: Must have at least 1 PR or 1 review to be ranked
- **Bots excluded**: Usernames ending with `[bot]` are filtered out
- **Issues credited only to contributors**: Pure issue-filers cannot appear in rankings

### Output

`ranked_engineers.json` includes for each engineer:
- Rank, username, avatar URL, total score
- Persona tag and leverage multiplier
- Full breakdown: PR score, review score, issue score, counts, average complexity
- "Why" insight explaining the ranking
- Top 5 PRs by complexity with GitHub links

---

## Setup & Running

### Prerequisites

- Go 1.21+
- Python 3.10+
- Node.js 18+

### Environment Variables

Copy the example and fill in your keys:

```bash
cp env.example .env
```

```env
GITHUB_TOKEN=ghp_your_token_here       # Required - GitHub PAT (public repo read access)
GEMINI_API_KEY=your_gemini_key_here     # Optional - enables LLM complexity scoring
```

- **GITHUB_TOKEN**: Create at GitHub > Settings > Developer settings > Fine-grained tokens. Select "Public repositories (read-only)". No account permissions needed.
- **GEMINI_API_KEY**: Create at [Google AI Studio](https://aistudio.google.com/). Optional - without it, the heuristic scorer is used automatically.

### Run the Full Pipeline

```bash
./run.sh
```

This runs all 3 steps in sequence:
1. Fetches GitHub data (Go) - takes a few minutes for PR enrichment
2. Scores engineers (Python) - ~60 seconds with LLM, instant with heuristic
3. Launches dashboard at `http://localhost:5173`

### Run Steps Individually

```bash
# 1. Fetch GitHub data
cd backend-go && go run main.go

# 2. Score engineers
cd logic-python && source venv/bin/activate && python3 scorer.py

# 3. Copy data and launch frontend
cp data/ranked_engineers.json frontend-react/public/ranked_engineers.json
cd frontend-react && npm run dev
```

---

## Project Structure

```
WorkWeave/
|-- .env                    # API keys (gitignored)
|-- env.example             # Template for .env
|-- .gitignore
|-- run.sh                  # Single-command pipeline orchestrator
|-- README.md
|
|-- backend-go/             # Go - GitHub data fetching
|   |-- go.mod
|   |-- main.go             # Fetches PRs, reviews, issues (90-day window)
|
|-- logic-python/           # Python - AI scoring engine
|   |-- venv/               # Virtual environment (gitignored)
|   |-- requirements.txt    # google-genai, python-dotenv
|   |-- complexity.py       # LLM + heuristic complexity scoring
|   |-- scorer.py           # Impact score calculation, persona assignment
|
|-- frontend-react/         # React + Tailwind + TypeScript dashboard
|   |-- public/
|   |   |-- ranked_engineers.json  # Copied from data/ for serving
|   |-- src/
|   |   |-- App.tsx                # Main dashboard layout
|   |   |-- types.ts               # TypeScript interfaces
|   |   |-- sampleData.ts          # Fallback data for offline/demo
|   |   |-- components/
|   |       |-- EngineerCard.tsx    # Engineer card with all metrics
|   |       |-- ScoreBreakdown.tsx  # Stacked bar chart
|   |       |-- PersonaTag.tsx      # Color-coded persona badge
|   |       |-- InsightPanel.tsx    # "Why this ranking" panel
|
|-- data/                   # Shared JSON cache
    |-- raw_github_data.json       # Raw GitHub API output
    |-- ranked_engineers.json      # Final scored + ranked output
```
