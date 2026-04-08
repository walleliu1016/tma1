package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// LLMConfig holds the configuration for the LLM-as-judge feature.
type LLMConfig struct {
	APIKey   string
	Provider string // "anthropic" or "openai"
	Model    string // optional override
}

func (c LLMConfig) Available() bool {
	return c.APIKey != ""
}

func (c LLMConfig) resolvedModel() string {
	if c.Model != "" {
		return c.Model
	}
	if c.Provider == "openai" {
		return "gpt-4o-mini"
	}
	return "claude-sonnet-4-20250514"
}

// evalSemaphore limits concurrent LLM evaluation requests.
var evalSemaphore = make(chan struct{}, 3)

type evaluateRequest struct {
	Prompt  string          `json:"prompt"`
	Context evaluateContext `json:"context"`
}

type evaluateContext struct {
	Turns        int      `json:"turns"`
	ToolFailures int      `json:"tool_failures"`
	TotalTokens  int      `json:"total_tokens"`
	ToolsUsed    []string `json:"tools_used"`
}

type evaluateResponse struct {
	Scores      map[string]int `json:"scores"`
	Suggestions []string       `json:"suggestions"`
	Rewrite     string         `json:"rewrite"`
	Model       string         `json:"model"`
}

const evalSystemPrompt = `You are an expert prompt engineer evaluating prompts given to AI coding assistants (like Claude Code, GitHub Copilot, Cursor). Your job is to score the prompt quality and suggest improvements.

Score each dimension from 0-100:
- specificity: Does the prompt reference specific files, functions, error messages, or code artifacts?
- context: Does it provide supporting information like code snippets, logs, expected behavior?
- clarity: Is the instruction clear and actionable? Could a senior engineer understand exactly what to do?
- overall: Weighted average considering all dimensions.

Respond with ONLY valid JSON (no markdown, no explanation outside JSON):
{
  "scores": {"specificity": <int>, "context": <int>, "clarity": <int>, "overall": <int>},
  "suggestions": ["<concrete suggestion 1>", "<concrete suggestion 2>"],
  "rewrite": "<an improved version of the prompt that addresses the weaknesses>"
}

Rules for suggestions:
- Be specific and actionable, not generic
- Reference what's missing from THIS prompt
- Keep each suggestion under 100 characters
- Max 3 suggestions

Rules for rewrite:
- Keep the same intent as the original
- Add the missing specificity/context/clarity
- Use placeholders like [file path] or [error message] for info you don't have
- Keep it concise — better prompts are often shorter, not longer`

// handleEvaluate handles both the availability check and prompt evaluation.
func (s *Server) handleEvaluate(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		s.handleEvaluateCheck(w)
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	s.handleEvaluatePrompt(w, r)
}

func (s *Server) handleEvaluateCheck(w http.ResponseWriter) {
	llm := s.getLLMConfig()
	if !llm.Available() {
		writeJSON(w, http.StatusOK, map[string]any{"available": false})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"available": true,
		"provider":  llm.Provider,
		"model":     llm.resolvedModel(),
	})
}

func (s *Server) handleEvaluatePrompt(w http.ResponseWriter, r *http.Request) {
	llm := s.getLLMConfig()
	if !llm.Available() {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "LLM not configured. Set TMA1_LLM_API_KEY environment variable."})
		return
	}

	var req evaluateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}
	if strings.TrimSpace(req.Prompt) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "prompt is required"})
		return
	}

	// Acquire semaphore (max 3 concurrent evals).
	select {
	case evalSemaphore <- struct{}{}:
		defer func() { <-evalSemaphore }()
	default:
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too many concurrent evaluations, try again shortly"})
		return
	}

	userMsg := fmt.Sprintf("Evaluate this prompt:\n\n---\n%s\n---\n\nAdditional context: %d turns in session, %d tool failures, %d total tokens, tools used: %s",
		req.Prompt, req.Context.Turns, req.Context.ToolFailures, req.Context.TotalTokens, strings.Join(req.Context.ToolsUsed, ", "))

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	model := llm.resolvedModel()
	var result evaluateResponse

	var err error
	if llm.Provider == "openai" {
		err = s.callOpenAI(ctx, llm, model, evalSystemPrompt, userMsg, &result)
	} else {
		err = s.callAnthropic(ctx, llm, model, evalSystemPrompt, userMsg, &result)
	}
	if err != nil {
		s.logger.Error("LLM evaluation failed", "err", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "LLM evaluation failed"})
		return
	}

	result.Model = model
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) callAnthropic(ctx context.Context, llm LLMConfig, model, sysPrompt, userMsg string, out any) error {
	body := map[string]any{
		"model":      model,
		"max_tokens": 1024,
		"system":     sysPrompt,
		"messages":   []map[string]string{{"role": "user", "content": userMsg}},
	}
	bodyBytes, _ := json.Marshal(body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", llm.APIKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("anthropic API returned %d: %s", resp.StatusCode, string(respBody))
	}

	var anthropicResp struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(respBody, &anthropicResp); err != nil {
		return fmt.Errorf("failed to parse anthropic response: %w", err)
	}
	if len(anthropicResp.Content) == 0 {
		return fmt.Errorf("empty response from anthropic")
	}

	text := anthropicResp.Content[0].Text
	// Strip markdown code fences if present.
	text = stripCodeFences(text)

	if err := json.Unmarshal([]byte(text), out); err != nil {
		return fmt.Errorf("failed to parse LLM JSON output: %w\nraw: %s", err, text)
	}
	return nil
}

func (s *Server) callOpenAI(ctx context.Context, llm LLMConfig, model, sysPrompt, userMsg string, out any) error {
	body := map[string]any{
		"model":      model,
		"max_tokens": 1024,
		"messages": []map[string]string{
			{"role": "system", "content": sysPrompt},
			{"role": "user", "content": userMsg},
		},
	}
	bodyBytes, _ := json.Marshal(body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+llm.APIKey)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("openai API returned %d: %s", resp.StatusCode, string(respBody))
	}

	var openaiResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &openaiResp); err != nil {
		return fmt.Errorf("failed to parse openai response: %w", err)
	}
	if len(openaiResp.Choices) == 0 {
		return fmt.Errorf("empty response from openai")
	}

	text := openaiResp.Choices[0].Message.Content
	text = stripCodeFences(text)

	if err := json.Unmarshal([]byte(text), out); err != nil {
		return fmt.Errorf("failed to parse LLM JSON output: %w\nraw: %s", err, text)
	}
	return nil
}

// --- Summary evaluation (sampled batch) ---

type summaryPrompt struct {
	Content    string `json:"content"`
	Score      int    `json:"score"`
	Turns      int    `json:"turns"`
	CostTokens int    `json:"cost_tokens"`
}

type summaryRequest struct {
	Prompts      []summaryPrompt `json:"prompts"`
	TotalPrompts int             `json:"total_prompts"`
	AvgScore     int             `json:"avg_score"`
}

type summaryPattern struct {
	Issue      string `json:"issue"`
	Frequency  string `json:"frequency"`
	Suggestion string `json:"suggestion"`
}

type summaryResponse struct {
	Summary  string           `json:"summary"`
	Patterns []summaryPattern `json:"patterns"`
	TopTip   string           `json:"top_tip"`
	Model    string           `json:"model"`
}

const evalSummarySystemPrompt = `You are an expert prompt engineer analyzing a stratified sample of prompts given to AI coding assistants. The sample is biased toward lower-scoring prompts to surface improvement opportunities.

Each prompt has a heuristic score (0-100), turn count (how many back-and-forth turns the session needed), and token cost.

Analyze the sample and respond with ONLY valid JSON (no markdown, no explanation outside JSON):
{
  "summary": "<2-3 sentence narrative about the overall prompt quality patterns you see>",
  "patterns": [
    {"issue": "<concise issue name>", "frequency": "high|medium|low", "suggestion": "<specific actionable advice>"}
  ],
  "top_tip": "<single most impactful improvement the user could make>"
}

Rules:
- Identify 3-5 recurring patterns across the prompts
- frequency: "high" = affects >50% of sample, "medium" = 20-50%, "low" = <20%
- Suggestions must be specific and actionable, not generic
- top_tip should be the single highest-leverage change
- Keep summary under 80 words
- Keep each suggestion under 100 characters`

func (s *Server) handleEvaluateSummary(w http.ResponseWriter, r *http.Request) {
	llm := s.getLLMConfig()
	if !llm.Available() {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "LLM not configured. Set TMA1_LLM_API_KEY in Settings."})
		return
	}

	var req summaryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}
	if len(req.Prompts) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "prompts array is required"})
		return
	}

	// Acquire semaphore.
	select {
	case evalSemaphore <- struct{}{}:
		defer func() { <-evalSemaphore }()
	default:
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too many concurrent evaluations, try again shortly"})
		return
	}

	// Build user message with truncated prompts.
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Analyze this stratified sample of %d prompts (from %d total, avg heuristic score: %d):\n\n",
		len(req.Prompts), req.TotalPrompts, req.AvgScore))
	for i, p := range req.Prompts {
		content := p.Content
		if len(content) > 200 {
			content = content[:200] + "..."
		}
		sb.WriteString(fmt.Sprintf("--- Prompt %d (score: %d, turns: %d, tokens: %d) ---\n%s\n\n",
			i+1, p.Score, p.Turns, p.CostTokens, content))
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	model := llm.resolvedModel()
	var result summaryResponse

	var err error
	if llm.Provider == "openai" {
		err = s.callOpenAI(ctx, llm, model, evalSummarySystemPrompt, sb.String(), &result)
	} else {
		err = s.callAnthropic(ctx, llm, model, evalSummarySystemPrompt, sb.String(), &result)
	}
	if err != nil {
		s.logger.Error("LLM summary evaluation failed", "err", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "LLM evaluation failed"})
		return
	}

	result.Model = model
	writeJSON(w, http.StatusOK, result)
}

// stripCodeFences removes ```json ... ``` wrappers from LLM output.
func stripCodeFences(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		// Remove opening fence line.
		if idx := strings.Index(s, "\n"); idx != -1 {
			s = s[idx+1:]
		}
		// Remove closing fence.
		if idx := strings.LastIndex(s, "```"); idx != -1 {
			s = s[:idx]
		}
		s = strings.TrimSpace(s)
	}
	return s
}
