#!/usr/bin/env python3
"""
WorkWeave Scoring Engine
========================
Reads raw GitHub data, computes per-engineer Leverage-Adjusted Impact Scores,
assigns persona tags, and writes the ranked output to JSON.

Usage:
    python scorer.py

Environment variables (loaded from ../.env):
    GEMINI_API_KEY  - If set, PR complexity is scored via Google Gemini.
                      Otherwise a heuristic fallback is used.
"""

from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from complexity import heuristic_complexity, score_prs

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent
INPUT_PATH = BASE_DIR / "data" / "raw_github_data.json"
OUTPUT_PATH = BASE_DIR / "data" / "ranked_engineers.json"

# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def load_raw_data(path: Path) -> Dict[str, Any]:
    """Load and validate the raw GitHub JSON file."""
    if not path.exists():
        print(f"[error] Input file not found: {path}")
        sys.exit(1)
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    # Expect top-level keys: pull_requests, reviews, issues (at minimum)
    for key in ("pull_requests",):
        if key not in data:
            print(f"[error] Missing required key '{key}' in {path}")
            sys.exit(1)
    return data


# ---------------------------------------------------------------------------
# Aggregation helpers
# ---------------------------------------------------------------------------


def _index_prs_by_user(prs: List[Dict]) -> Dict[str, List[Dict]]:
    """Group PRs by their author username."""
    by_user: Dict[str, List[Dict]] = defaultdict(list)
    for pr in prs:
        user = pr.get("author") or pr.get("user", {}).get("login", "unknown")
        by_user[user].append(pr)
    return dict(by_user)


def _count_reviews_given(prs: List[Dict]) -> Dict[str, int]:
    """Count reviews each user has given on OTHER people's PRs.

    Reviews are embedded inside each PR object as pr["reviews"].
    """
    counts: Dict[str, int] = defaultdict(int)
    for pr in prs:
        pr_author = pr.get("author") or pr.get("user", {}).get("login", "")
        for review in (pr.get("reviews") or []):
            reviewer = review.get("author") or review.get("user", {}).get("login", "")
            if reviewer and reviewer != pr_author:
                counts[reviewer] += 1
    return dict(counts)


def _count_issues_filed(issues: List[Dict]) -> Dict[str, int]:
    """Count issues filed per user.

    Note: the GitHub list-issues endpoint only gives us the *author*
    (who opened the issue), not who resolved it.  We therefore treat
    this as "issues filed" and only award points to users who are also
    code contributors (have PRs or reviews) -- pure issue-filers are
    excluded in the scoring loop.
    """
    counts: Dict[str, int] = defaultdict(int)
    for issue in issues:
        filer = (
            issue.get("author")
            or (issue.get("user") or {}).get("login")
        )
        if filer:
            counts[filer] += 1
    return dict(counts)


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


def _compute_leverage(review_count: int, pr_count: int) -> float:
    """L = 1.2 if (review_count / pr_count) > 2.0, else 1.0."""
    if pr_count == 0:
        return 1.0
    return 1.2 if (review_count / pr_count) > 2.0 else 1.0


def _assign_persona(
    avg_complexity: float,
    leverage: float,
    issue_score: float,
    total_score: float,
    pr_count: int,
    review_count: int,
    issue_count: int,
) -> str:
    """Pick a persona tag based on strongest dimension."""
    # Check from most specific to least specific
    if avg_complexity > 1.2:
        return "The Architect"
    if leverage == 1.2:
        return "The Guardian"
    if total_score > 0 and (issue_score / total_score) > 0.15:
        return "The Closer"

    # Balanced check: no single dimension dominates by more than 50%
    pr_score_norm = pr_count
    dimensions = [pr_score_norm, review_count, issue_count]
    total_dims = sum(dimensions) or 1
    ratios = [d / total_dims for d in dimensions]
    if all(0.15 < r < 0.55 for r in ratios) and total_dims >= 3:
        return "The Polymath"

    return "The Machine"


_DOMAIN_KEYWORDS = {
    "session replay": ["session replay", "replay", "recording", "rrweb"],
    "feature flags": ["feature flag", "feature-flag", "flags"],
    "ingestion": ["ingest", "capture", "event", "kafka", "clickhouse"],
    "pipeline": ["pipeline", "batch export", "export", "cdp"],
    "billing": ["billing", "subscription", "stripe", "usage limit"],
    "notebooks": ["notebook", "collaborative"],
    "dashboards": ["dashboard", "insight", "trend", "funnel", "retention"],
    "onboarding": ["onboarding", "setup", "getting started"],
    "API": ["api", "endpoint", "rest", "graphql"],
    "infrastructure": ["infra", "deploy", "ci", "docker", "k8s", "terraform"],
    "frontend": ["frontend", "ui", "component", "modal", "sidebar", "toolbar"],
    "backend": ["backend", "django", "celery", "worker", "migration"],
    "SDKs": ["sdk", "posthog-js", "posthog-python", "posthog-node"],
    "data model": ["schema", "model", "migration", "database", "table"],
    "auth": ["auth", "permission", "login", "sso", "oauth"],
    "experiments": ["experiment", "a/b test", "variant"],
    "surveys": ["survey", "feedback", "nps"],
    "HogQL": ["hogql", "hog ql", "query engine"],
}


def _extract_domains(prs: List[Dict]) -> List[str]:
    """Extract the top 2 domain areas from PR titles."""
    domain_counts: Dict[str, int] = defaultdict(int)
    for pr in prs:
        title = pr.get("title", "").lower()
        for domain, keywords in _DOMAIN_KEYWORDS.items():
            if any(kw in title for kw in keywords):
                domain_counts[domain] += 1

    if not domain_counts:
        return []

    sorted_domains = sorted(domain_counts.items(), key=lambda x: x[1], reverse=True)
    return [d[0] for d in sorted_domains[:2]]


def _generate_why(
    username: str,
    persona: str,
    avg_complexity: float,
    pr_count: int,
    review_count: int,
    issue_count: int,
    top_prs: List[Dict],
    user_prs: List[Dict],
) -> str:
    """Generate a short human-readable insight string with domain context."""
    parts: List[str] = []

    # Extract domain areas from all their PRs
    domains = _extract_domains(user_prs)
    domain_str = " and ".join(domains) if domains else ""

    if persona == "The Architect":
        if domain_str:
            parts.append(f"Top contributor to {domain_str} with high-complexity changes")
        elif top_prs:
            area = top_prs[0]["title"][:60]
            parts.append(f"Lead contributor to complex changes like \"{area}\"")
        else:
            parts.append("Consistently tackles high-complexity work")
    elif persona == "The Guardian":
        base = f"Reviewed {review_count} PRs across the team, more than 2x their own PR output"
        if domain_str:
            base += f", primarily in {domain_str}"
        parts.append(base)
    elif persona == "The Closer":
        base = f"Resolved {issue_count} issues, driving bug-fix and feature-delivery throughput"
        if domain_str:
            base += f" in {domain_str}"
        parts.append(base)
    elif persona == "The Machine":
        base = f"Shipped {pr_count} PRs with avg complexity {avg_complexity:.1f}"
        if domain_str:
            base += f", focused on {domain_str}"
        parts.append(base)
    elif persona == "The Polymath":
        if domain_str:
            parts.append(f"Balanced contributor across {domain_str}, reviews, and issue resolution")
        else:
            parts.append("Balanced contributor across code, reviews, and issue resolution")

    if review_count and persona != "The Guardian":
        parts.append(f"with {review_count} code reviews")

    return "; ".join(parts)


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------


def run() -> None:
    """Execute the full scoring pipeline."""
    print(f"[info] Loading data from {INPUT_PATH}")
    raw = load_raw_data(INPUT_PATH)

    prs: List[Dict] = raw.get("pull_requests", [])
    issues: List[Dict] = raw.get("issues", [])

    total_reviews = sum(len(pr.get("reviews") or []) for pr in prs)
    print(f"[info] Found {len(prs)} PRs, {total_reviews} reviews, "
          f"{len(issues)} issues")

    # ------------------------------------------------------------------
    # 1. Complexity scoring
    # ------------------------------------------------------------------
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    use_llm = bool(api_key)
    gemini_client = None
    scoring_method = "heuristic"

    if use_llm:
        try:
            from google import genai
            gemini_client = genai.Client(api_key=api_key)
            scoring_method = "llm"
            print("[info] GEMINI_API_KEY detected -- using Gemini LLM complexity scoring")
        except ImportError:
            print("[warn] google-genai package not installed. "
                  "Falling back to heuristic scoring.")
            use_llm = False
    else:
        print("[info] No GEMINI_API_KEY found -- using heuristic complexity scoring")

    print("[info] Scoring PR complexity ...")
    complexity_map, scoring_method = score_prs(
        prs, use_llm=use_llm, llm_client=gemini_client
    )

    # ------------------------------------------------------------------
    # 2. Aggregate per-engineer metrics
    # ------------------------------------------------------------------
    prs_by_user = _index_prs_by_user(prs)
    reviews_by_user = _count_reviews_given(prs)
    issues_by_user = _count_issues_filed(issues)

    # Only rank engineers who have actual code contributions (PRs or reviews).
    # Pure issue-filers are not code contributors and should not be ranked.
    code_contributors = set(prs_by_user.keys()) | set(reviews_by_user.keys())

    # Filter out bots
    all_users = {u for u in code_contributors if not u.endswith("[bot]") and u != "unknown"}

    engineers: List[Dict[str, Any]] = []

    for username in sorted(all_users):
        user_prs = prs_by_user.get(username, [])
        review_count = reviews_by_user.get(username, 0)
        issue_count = issues_by_user.get(username, 0)
        pr_count = len(user_prs)

        # PR score: each merged PR gets a base of 5 points scaled by complexity.
        # A typical PR (complexity 0.8) = 4 pts, architectural PR (1.8) = 9 pts.
        # This ensures PRs are the dominant signal over issues.
        pr_score = 0.0
        pr_complexities: List[Tuple[Dict, float]] = []
        for pr in user_prs:
            merged = 1 if pr.get("merged_at") or pr.get("merged", False) else 0
            cx = complexity_map.get(pr.get("number", 0), heuristic_complexity(pr))
            pr_score += merged * 5 * cx
            pr_complexities.append((pr, cx))

        review_score = review_count * 2
        issue_score = issue_count * 1

        leverage = _compute_leverage(review_count, pr_count)
        raw_total = pr_score + review_score + issue_score
        final_score = round(raw_total * leverage, 2)

        avg_complexity = (
            round(sum(c for _, c in pr_complexities) / len(pr_complexities), 2)
            if pr_complexities
            else 0.0
        )

        persona = _assign_persona(
            avg_complexity, leverage, issue_score, raw_total,
            pr_count, review_count, issue_count,
        )

        # Top PRs by complexity (up to 5)
        top_prs = sorted(pr_complexities, key=lambda x: x[1], reverse=True)[:5]
        top_prs_out = [
            {
                "title": pr.get("title", ""),
                "complexity": cx,
                "number": pr.get("number", 0),
            }
            for pr, cx in top_prs
        ]

        why = _generate_why(
            username, persona, avg_complexity,
            pr_count, review_count, issue_count, top_prs_out, user_prs,
        )

        engineers.append({
            "username": username,
            "avatar_url": f"https://github.com/{username}.png",
            "score": final_score,
            "persona_tag": persona,
            "leverage_multiplier": leverage,
            "breakdown": {
                "pr_score": round(pr_score, 2),
                "review_score": review_score,
                "issue_score": issue_score,
                "pr_count": pr_count,
                "review_count": review_count,
                "issue_count": issue_count,
                "avg_complexity": avg_complexity,
            },
            "why": why,
            "top_prs": top_prs_out,
        })

    # ------------------------------------------------------------------
    # 3. Rank and write output
    # ------------------------------------------------------------------
    engineers.sort(key=lambda e: e["score"], reverse=True)
    for i, eng in enumerate(engineers, start=1):
        eng["rank"] = i

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scoring_method": scoring_method,
        "engineers": engineers,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"[info] Wrote ranked output to {OUTPUT_PATH}")
    print(f"[info] Ranked {len(engineers)} engineers "
          f"(method={scoring_method})")

    # Quick summary
    for eng in engineers[:5]:
        print(
            f"  #{eng['rank']}  {eng['username']:<20s}  "
            f"score={eng['score']:<8.1f}  "
            f"persona={eng['persona_tag']}"
        )


if __name__ == "__main__":
    run()
