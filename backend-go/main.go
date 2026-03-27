package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// ---- Data types ----

type Review struct {
	Author string `json:"author"`
	State  string `json:"state"`
}

type PullRequest struct {
	Number       int      `json:"number"`
	Title        string   `json:"title"`
	Author       string   `json:"author"`
	Body         string   `json:"body"`
	MergedAt     string   `json:"merged_at"`
	FilesChanged int      `json:"files_changed"`
	Additions    int      `json:"additions"`
	Deletions    int      `json:"deletions"`
	Reviews      []Review `json:"reviews"`
}

type Issue struct {
	Number   int      `json:"number"`
	Title    string   `json:"title"`
	Author   string   `json:"author"`
	Labels   []string `json:"labels"`
	ClosedAt string   `json:"closed_at"`
}

type Output struct {
	PullRequests []PullRequest `json:"pull_requests"`
	Issues       []Issue       `json:"issues"`
	FetchedAt    string        `json:"fetched_at"`
}

// ---- GitHub API response types ----

type ghUser struct {
	Login string `json:"login"`
}

type ghLabel struct {
	Name string `json:"name"`
}

type ghPR struct {
	Number    int     `json:"number"`
	Title     string  `json:"title"`
	Body      string  `json:"body"`
	User      ghUser  `json:"user"`
	MergedAt  *string `json:"merged_at"`
	Additions int     `json:"additions"`
	Deletions int     `json:"deletions"`
	// changed_files is only present on the single-PR endpoint
	ChangedFiles int `json:"changed_files"`
}

type ghReview struct {
	User  ghUser `json:"user"`
	State string `json:"state"`
}

type ghIssue struct {
	Number   int       `json:"number"`
	Title    string    `json:"title"`
	User     ghUser    `json:"user"`
	Labels   []ghLabel `json:"labels"`
	ClosedAt *string   `json:"closed_at"`
	// PRs also appear in the issues endpoint; filter by pull_request field
	PullRequest *json.RawMessage `json:"pull_request"`
}

// ---- HTTP helpers ----

const (
	owner   = "posthog"
	repo    = "posthog"
	baseURL = "https://api.github.com"
	perPage = 100
)

var httpClient = &http.Client{Timeout: 30 * time.Second}

func githubGet(path string, token string) ([]byte, http.Header, error) {
	url := baseURL + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, nil, fmt.Errorf("creating request for %s: %w", url, err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("fetching %s: %w", url, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil, fmt.Errorf("reading response from %s: %w", url, err)
	}

	if resp.StatusCode == 403 {
		// Check for rate limit
		if remaining := resp.Header.Get("X-RateLimit-Remaining"); remaining == "0" {
			resetUnix, _ := strconv.ParseInt(resp.Header.Get("X-RateLimit-Reset"), 10, 64)
			resetTime := time.Unix(resetUnix, 0)
			return nil, nil, fmt.Errorf("rate limited until %s — set GITHUB_TOKEN for higher limits", resetTime.Format(time.RFC3339))
		}
	}

	if resp.StatusCode != 200 {
		return nil, nil, fmt.Errorf("unexpected status %d from %s: %s", resp.StatusCode, url, string(body[:min(len(body), 300)]))
	}

	return body, resp.Header, nil
}

// parseLinkNext extracts the "next" page URL from the Link header.
func parseLinkNext(header http.Header) string {
	link := header.Get("Link")
	if link == "" {
		return ""
	}
	for _, part := range strings.Split(link, ",") {
		part = strings.TrimSpace(part)
		if strings.Contains(part, `rel="next"`) {
			start := strings.Index(part, "<")
			end := strings.Index(part, ">")
			if start >= 0 && end > start {
				return part[start+1 : end]
			}
		}
	}
	return ""
}

// ---- Fetchers ----

// fetchMergedPRs returns up to `limit` most recently merged PRs.
func fetchMergedPRs(token string, since time.Time) ([]PullRequest, error) {
	fmt.Printf("[PRs] Fetching all merged pull requests since %s...\n", since.Format("2006-01-02"))

	var results []PullRequest
	page := 1
	reachedCutoff := false

	for !reachedCutoff {
		path := fmt.Sprintf("/repos/%s/%s/pulls?state=closed&sort=updated&direction=desc&per_page=%d&page=%d",
			owner, repo, perPage, page)

		body, _, err := githubGet(path, token)
		if err != nil {
			return nil, err
		}

		var prs []ghPR
		if err := json.Unmarshal(body, &prs); err != nil {
			return nil, fmt.Errorf("decoding PRs page %d: %w", page, err)
		}
		if len(prs) == 0 {
			break
		}

		for _, pr := range prs {
			if pr.MergedAt == nil {
				continue // skip closed-but-not-merged
			}
			mergedTime, err := time.Parse(time.RFC3339, *pr.MergedAt)
			if err != nil {
				continue
			}
			if mergedTime.Before(since) {
				reachedCutoff = true
				break
			}
			results = append(results, PullRequest{
				Number:   pr.Number,
				Title:    pr.Title,
				Author:   pr.User.Login,
				Body:     pr.Body,
				MergedAt: *pr.MergedAt,
			})
		}

		page++
		fmt.Printf("[PRs] Collected %d merged PRs so far (scanned page %d)\n", len(results), page-1)
	}

	// Now enrich each PR with file stats and reviews
	fmt.Printf("[PRs] Enriching %d PRs with file stats and reviews...\n", len(results))
	for i := range results {
		pr := &results[i]
		if err := enrichPR(pr, token); err != nil {
			return nil, fmt.Errorf("enriching PR #%d: %w", pr.Number, err)
		}
		if (i+1)%10 == 0 || i+1 == len(results) {
			fmt.Printf("[PRs] Enriched %d/%d\n", i+1, len(results))
		}
	}

	return results, nil
}

// enrichPR fills in file stats and reviews for a single PR.
func enrichPR(pr *PullRequest, token string) error {
	// Fetch single PR endpoint for file stats
	path := fmt.Sprintf("/repos/%s/%s/pulls/%d", owner, repo, pr.Number)
	body, _, err := githubGet(path, token)
	if err != nil {
		return err
	}
	var detail ghPR
	if err := json.Unmarshal(body, &detail); err != nil {
		return fmt.Errorf("decoding PR detail: %w", err)
	}
	pr.FilesChanged = detail.ChangedFiles
	pr.Additions = detail.Additions
	pr.Deletions = detail.Deletions

	// Fetch reviews (paginated)
	pr.Reviews, err = fetchReviewsForPR(pr.Number, token)
	return err
}

// fetchReviewsForPR fetches all reviews for a PR.
func fetchReviewsForPR(prNumber int, token string) ([]Review, error) {
	var reviews []Review
	page := 1
	for {
		path := fmt.Sprintf("/repos/%s/%s/pulls/%d/reviews?per_page=%d&page=%d",
			owner, repo, prNumber, perPage, page)
		body, _, err := githubGet(path, token)
		if err != nil {
			return nil, err
		}
		var ghRevs []ghReview
		if err := json.Unmarshal(body, &ghRevs); err != nil {
			return nil, fmt.Errorf("decoding reviews: %w", err)
		}
		if len(ghRevs) == 0 {
			break
		}
		for _, r := range ghRevs {
			reviews = append(reviews, Review{
				Author: r.User.Login,
				State:  r.State,
			})
		}
		if len(ghRevs) < perPage {
			break
		}
		page++
	}
	return reviews, nil
}

// fetchClosedIssues returns all issues closed since the given date (excluding PRs).
func fetchClosedIssues(token string, since time.Time) ([]Issue, error) {
	fmt.Printf("[Issues] Fetching all closed issues since %s...\n", since.Format("2006-01-02"))

	var results []Issue
	page := 1
	reachedCutoff := false

	for !reachedCutoff {
		// Use the `since` query param to let GitHub filter server-side
		path := fmt.Sprintf("/repos/%s/%s/issues?state=closed&sort=updated&direction=desc&since=%s&per_page=%d&page=%d",
			owner, repo, since.Format(time.RFC3339), perPage, page)

		body, _, err := githubGet(path, token)
		if err != nil {
			return nil, err
		}

		var issues []ghIssue
		if err := json.Unmarshal(body, &issues); err != nil {
			return nil, fmt.Errorf("decoding issues page %d: %w", page, err)
		}
		if len(issues) == 0 {
			break
		}

		for _, iss := range issues {
			// Skip pull requests that appear in the issues endpoint
			if iss.PullRequest != nil {
				continue
			}
			// Double-check closed_at is within our window
			if iss.ClosedAt != nil {
				closedTime, err := time.Parse(time.RFC3339, *iss.ClosedAt)
				if err == nil && closedTime.Before(since) {
					continue
				}
			}
			labels := make([]string, 0, len(iss.Labels))
			for _, l := range iss.Labels {
				labels = append(labels, l.Name)
			}
			closedAt := ""
			if iss.ClosedAt != nil {
				closedAt = *iss.ClosedAt
			}
			results = append(results, Issue{
				Number:   iss.Number,
				Title:    iss.Title,
				Author:   iss.User.Login,
				Labels:   labels,
				ClosedAt: closedAt,
			})
		}

		page++
		fmt.Printf("[Issues] Collected %d closed issues so far (scanned page %d)\n", len(results), page-1)
	}

	return results, nil
}

// ---- .env loader ----

func loadEnv() {
	envPath := filepath.Join(filepath.Dir(os.Args[0]), "..", ".env")
	// Also try relative to working directory
	if _, err := os.Stat(envPath); err != nil {
		envPath = filepath.Join("..", ".env")
	}
	data, err := os.ReadFile(envPath)
	if err != nil {
		return // .env not found, rely on environment
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		if val == "" {
			continue
		}
		// Don't override existing env vars
		if os.Getenv(key) == "" {
			os.Setenv(key, val)
		}
	}
}

// ---- Main ----

func main() {
	loadEnv()
	token := os.Getenv("GITHUB_TOKEN")
	if token != "" {
		fmt.Println("Using GITHUB_TOKEN for authentication (higher rate limits)")
	} else {
		fmt.Println("No GITHUB_TOKEN set — using unauthenticated requests (60 req/hr limit)")
		fmt.Println("Tip: export GITHUB_TOKEN=ghp_... for 5000 req/hr")
	}
	fmt.Println()

	start := time.Now()

	// Fetch PRs
	since := time.Now().UTC().AddDate(0, 0, -90)
	prs, err := fetchMergedPRs(token, since)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error fetching PRs: %v\n", err)
		os.Exit(1)
	}
	fmt.Println()

	// Fetch issues
	issues, err := fetchClosedIssues(token, since)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error fetching issues: %v\n", err)
		os.Exit(1)
	}
	fmt.Println()

	output := Output{
		PullRequests: prs,
		Issues:       issues,
		FetchedAt:    time.Now().UTC().Format(time.RFC3339),
	}

	// Write output
	outputPath := filepath.Join("..", "data", "raw_github_data.json")
	// Also support an absolute fallback
	absPath := "/Users/kunalbhujbal/Desktop/Projects/WorkWeave/data/raw_github_data.json"

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "Error creating output directory: %v\n", err)
		os.Exit(1)
	}
	_ = outputPath // we use the absolute path for reliability

	data, err := json.MarshalIndent(output, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error marshaling JSON: %v\n", err)
		os.Exit(1)
	}

	if err := os.WriteFile(absPath, data, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "Error writing output file: %v\n", err)
		os.Exit(1)
	}

	elapsed := time.Since(start)
	fmt.Printf("Done in %s\n", elapsed.Round(time.Second))
	fmt.Printf("Wrote %d PRs and %d issues to %s\n", len(prs), len(issues), absPath)
}
