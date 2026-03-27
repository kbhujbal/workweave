export interface TopPR {
  title: string;
  complexity: number;
  number: number;
}

export interface Engineer {
  rank: number;
  username: string;
  avatar_url: string;
  score: number;
  persona_tag: string;
  leverage_multiplier: number;
  breakdown: {
    pr_score: number;
    review_score: number;
    issue_score: number;
    pr_count: number;
    review_count: number;
    issue_count: number;
    avg_complexity: number;
  };
  why: string;
  top_prs: TopPR[];
}
