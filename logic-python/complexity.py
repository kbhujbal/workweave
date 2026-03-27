"""
Complexity analyzer for pull requests.

Provides two strategies:
  1. LLM-based (Anthropic Claude) - used when ANTHROPIC_API_KEY is set.
  2. Heuristic-based fallback    - used when no API key is available.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List

# ---------------------------------------------------------------------------
# Heuristic complexity scorer
# ---------------------------------------------------------------------------

# Keywords that hint at higher complexity
_HIGH_COMPLEXITY_KEYWORDS = [
    "architect", "migration", "redesign", "rewrite", "system",
    "infrastructure", "pipeline", "framework", "engine", "core",
    "breaking change", "rfc", "new service",
]

_MEDIUM_COMPLEXITY_KEYWORDS = [
    "refactor", "feature", "implement", "add support", "integrate",
    "endpoint", "module", "service", "handler", "middleware",
]

_LOW_COMPLEXITY_KEYWORDS = [
    "typo", "readme", "docs", "comment", "changelog", "config",
    "bump", "rename", "lint", "format", "ci", "chore",
]


def _keyword_boost(title: str) -> float:
    """Return a complexity adjustment based on title keywords."""
    lower = title.lower()
    for kw in _HIGH_COMPLEXITY_KEYWORDS:
        if kw in lower:
            return 0.4
    for kw in _MEDIUM_COMPLEXITY_KEYWORDS:
        if kw in lower:
            return 0.15
    for kw in _LOW_COMPLEXITY_KEYWORDS:
        if kw in lower:
            return -0.25
    return 0.0


def heuristic_complexity(pr: Dict[str, Any]) -> float:
    """
    Estimate PR complexity from numeric signals and title keywords.

    Returns a float clamped to [0.1, 2.0].
    """
    files_changed = pr.get("files_changed", 0)
    additions = pr.get("additions", 0)
    deletions = pr.get("deletions", 0)
    title = pr.get("title", "")

    total_diff = additions + deletions

    # Base score derived from change volume
    if total_diff <= 20 and files_changed <= 2:
        base = 0.2
    elif total_diff <= 80 and files_changed <= 5:
        base = 0.5
    elif total_diff <= 300 and files_changed <= 15:
        base = 0.8
    elif total_diff <= 800 and files_changed <= 30:
        base = 1.2
    else:
        base = 1.6

    # Files-changed bump
    if files_changed > 20:
        base += 0.2
    elif files_changed > 10:
        base += 0.1

    # Keyword adjustment
    base += _keyword_boost(title)

    return round(max(0.1, min(2.0, base)), 2)


# ---------------------------------------------------------------------------
# LLM-based complexity scorer
# ---------------------------------------------------------------------------

_CHUNK_SYSTEM_PROMPT = """\
You are a code-review complexity analyst for a GitHub repository.

TASK: Score the complexity of each pull request listed below.

RUBRIC (use strictly):
  0.1-0.3  Typos, docs, config, dependency bumps, formatting
  0.4-0.6  Small bug fixes, minor features, test additions
  0.7-1.0  Medium features, refactors, new endpoints
  1.1-1.5  Large features, significant refactors, new modules
  1.6-2.0  Core architectural changes, new systems, migrations

RULES:
- Score EACH PR independently based on its own metadata.
- Use the pr_number to identify each PR — do NOT confuse PRs with each other.
- Output ONLY a valid JSON array. No markdown, no explanation, no extra text.

OUTPUT FORMAT (strict):
[{"pr_number": 12345, "complexity": 0.8}, {"pr_number": 12346, "complexity": 1.3}, ...]
"""

CHUNK_SIZE = 25  # PRs per LLM call — small enough for accurate scoring


def _build_chunk_prompt(prs: List[Dict[str, Any]], chunk_index: int) -> str:
    """Build a clearly structured prompt for one chunk of PRs.

    Each PR is separated with a visible delimiter and labeled with its
    unique pr_number so the model can't confuse them.
    """
    lines = [f"=== CHUNK {chunk_index + 1}: {len(prs)} Pull Requests to score ===\n"]

    for i, pr in enumerate(prs, 1):
        body = (pr.get("body") or "")[:150].replace("\n", " ").strip()
        lines.append(
            f"--- PR {i}/{len(prs)} ---\n"
            f"  pr_number   : {pr.get('number', 0)}\n"
            f"  author      : {pr.get('author', 'unknown')}\n"
            f"  title       : {pr.get('title', 'N/A')}\n"
            f"  description : {body or 'No description'}\n"
            f"  files_changed: {pr.get('files_changed', 0)}\n"
            f"  additions   : {pr.get('additions', 0)}\n"
            f"  deletions   : {pr.get('deletions', 0)}\n"
        )

    lines.append(f"=== END OF CHUNK — Return exactly {len(prs)} scores ===")
    return "\n".join(lines)


def _parse_chunk_response(text: str, prs: List[Dict[str, Any]]) -> Dict[int, float]:
    """Parse the LLM response for a chunk into pr_number -> complexity."""
    scores: Dict[int, float] = {}

    cleaned = text.strip()
    # Strip markdown code fences if present
    if "```" in cleaned:
        match = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", cleaned, re.DOTALL)
        if match:
            cleaned = match.group(1)

    try:
        data = json.loads(cleaned)
        if isinstance(data, list):
            for item in data:
                pr_num = item.get("pr_number", 0)
                raw = float(item.get("complexity", 0.5))
                scores[pr_num] = round(max(0.1, min(2.0, raw)), 2)
    except (json.JSONDecodeError, TypeError, ValueError):
        pass

    # Heuristic fallback for any PRs the model missed or garbled
    for pr in prs:
        pr_num = pr.get("number", 0)
        if pr_num not in scores:
            scores[pr_num] = heuristic_complexity(pr)

    return scores


def _send_chunk(prs: List[Dict[str, Any]], chunk_index: int, client: Any) -> Dict[int, float]:
    """Send one chunk of PRs to Gemini and return scored results."""
    import time

    prompt = _CHUNK_SYSTEM_PROMPT + "\n\n" + _build_chunk_prompt(prs, chunk_index)

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )

    # Sleep 4s between calls to stay under 15 RPM free-tier limit
    time.sleep(4)

    return _parse_chunk_response(response.text, prs)


# ---------------------------------------------------------------------------
# Batch helpers
# ---------------------------------------------------------------------------


def score_prs(
    prs: List[Dict[str, Any]],
    use_llm: bool = False,
    llm_client: Any = None,
) -> tuple[Dict[int, float], str]:
    """
    Score a list of PRs and return (pr_number -> complexity, actual_method).

    actual_method is "llm", "mixed", or "heuristic" reflecting what
    really happened (not just what was attempted).
    """
    if use_llm and llm_client is not None:
        all_scores: Dict[int, float] = {}
        chunks = [prs[i:i + CHUNK_SIZE] for i in range(0, len(prs), CHUNK_SIZE)]
        total_chunks = len(chunks)
        llm_success = 0
        llm_failed = 0

        print(f"  [info] Scoring {len(prs)} PRs via LLM in {total_chunks} chunk(s) "
              f"of up to {CHUNK_SIZE} PRs each...")

        for idx, chunk in enumerate(chunks):
            try:
                print(f"  [info] Sending chunk {idx + 1}/{total_chunks} "
                      f"({len(chunk)} PRs)...")
                chunk_scores = _send_chunk(chunk, idx, llm_client)
                all_scores.update(chunk_scores)
                llm_success += 1
                print(f"  [info] Chunk {idx + 1}/{total_chunks} done — "
                      f"scored {len(chunk_scores)} PRs")
            except Exception as exc:
                print(f"  [warn] Chunk {idx + 1} failed: {exc}. "
                      f"Using heuristic for {len(chunk)} PRs.")
                llm_failed += 1
                for pr in chunk:
                    all_scores[pr.get("number", 0)] = heuristic_complexity(pr)

        # Report actual method used
        if llm_success == total_chunks:
            method = "llm"
        elif llm_success > 0:
            method = "mixed"
            print(f"  [info] {llm_success}/{total_chunks} chunks used LLM, "
                  f"{llm_failed} fell back to heuristic")
        else:
            method = "heuristic"
            print(f"  [warn] All {total_chunks} chunks failed — "
                  f"entire scoring is heuristic-based")

        return all_scores, method

    # Heuristic fallback
    scores: Dict[int, float] = {}
    for pr in prs:
        scores[pr.get("number", 0)] = heuristic_complexity(pr)
    return scores, "heuristic"
