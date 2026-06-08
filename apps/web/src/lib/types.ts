// ─── API Response Wrapper ────────────────────────────
export interface ApiResponse<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

// ─── Auth ────────────────────────────────────────────
export interface User {
  id: string;
  name?: string;
  role: "ceo" | "admin";
  telegram_id: number;
  created_at?: string;
}

export interface OTPRequest {
  telegram_id: number;
}

export interface OTPVerify {
  telegram_id: number;
  otp: string;
}

// ─── Chat ────────────────────────────────────────────
export interface ChatSession {
  id: string;
  user_id?: string;
  title?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  thinking_trace?: ThinkingTraceStep[];
  model_used?: string;
  reasoning_mode?: "auto" | "fast" | "deep";
  tokens_used?: number;
  latency_ms?: number;
  created_at: string;
}

export interface ThinkingTraceStep {
  step: number;
  agent: string;
  status: "running" | "done" | "error";
  duration_ms: number;
  result: string;
}

export type ReasoningMode = "auto" | "fast" | "deep";

// ─── Deep Research ──────────────────────────────────
export interface ResearchPlanEvent {
  event: "plan";
  questions: string[];
}

export interface ResearchProgressEvent {
  event: "progress";
  step: "planning" | "researching" | "compiling";
  message?: string;
  question?: string;
  index?: number;
  total?: number;
}

export interface ResearchDoneEvent {
  event: "done";
  doc_id: string;
  title: string;
  word_count: number;
  question_count: number;
}

export interface ResearchErrorEvent {
  event: "error";
  message: string;
}

export interface ResearchHeartbeatEvent {
  event: "heartbeat";
  elapsed: number;
}

export interface ResearchWarningEvent {
  event: "warning";
  elapsed: number;
  message: string;
}

export type ResearchSSEEvent =
  | { event: "start" }
  | ResearchPlanEvent
  | ResearchProgressEvent
  | ResearchDoneEvent
  | ResearchErrorEvent
  | ResearchHeartbeatEvent
  | ResearchWarningEvent;

// ─── Research V2 — Job types ─────────────────────────
export interface ResearchSection {
  id: string;
  title: string;
  status: "pending" | "running" | "done" | "failed";
  content: string | null;
}

export interface ResearchPlanSection {
  id: string;
  title: string;
  description?: string;
  objective?: string;
  search_queries?: string[];
  memory_queries?: string[];
  use_previous_sections?: string[];
  output_format?: "paragraph" | "bullets" | "table" | "mixed";
  estimated_words?: 200 | 300 | 400 | 500;
  key_questions?: string[];
  key_points?: string[];
}

export interface ResearchAngles {
  who?: {
    primary?: string;
    stakeholders?: string[];
    competitors?: string[];
  };
  what?: {
    core_topic?: string;
    dimensions?: string[];
    not_asking_about?: string[];
  };
  when?: {
    timeframe?: string;
    key_milestones?: string[];
    urgency?: "immediate" | "strategic" | "exploratory";
  };
  why?: {
    underlying_goal?: string;
    decision_to_make?: string;
    success_metric?: string;
  };
  risk?: {
    known_risks?: string[];
    unknown_risks?: string[];
    blind_spots?: string[];
  };
  gap?: {
    likely_knows?: string[];
    likely_missing?: string[];
    assumptions_to_validate?: string[];
  };
  action?: {
    output_type?: "decision" | "strategy" | "analysis" | "report";
    audience?: string;
    recommended_depth?: "brief" | "standard" | "deep";
    recommended_sections?: 4 | 6 | 8;
  };
}

export interface ResearchJobStatus {
  job_id: string;
  status: string;
  progress: number;
  current_step: string;
  plan_title: string | null;
  angles?: ResearchAngles | null;
  intent_meta?: {
    depth?: "brief" | "standard" | "deep";
    memory_hits?: number;
    estimated_sections?: 4 | 6 | 8;
  } | null;
  plan?: {
    title?: string;
    sections?: ResearchPlanSection[];
  } | null;
  sections: ResearchSection[];
  error: string | null;
  document_id: string | null;
  completed_at: string | null;
}

// ─── Memory ──────────────────────────────────────────
export interface MemoryItem {
  id: string;
  content: string;
  status: "pending" | "canonical" | "archived";
  source: "chat" | "capture" | "studio" | "manual";
  source_ref?: string;
  approved_at?: string;
  approved_by?: string;
  decay_at?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ─── Capture ─────────────────────────────────────────
export interface CaptureItem {
  id: string;
  user_id: string;
  type: "text" | "link" | "image";
  content?: string;
  url?: string;
  raw_file_r2_key?: string;
  extracted_facts?: Array<{ fact: string; confidence: number }>;
  status: "processing" | "extracted" | "committed" | "failed";
  created_at: string;
}

// ─── Studio ──────────────────────────────────────────
export interface StudioDocument {
  id: string;
  user_id: string;
  title: string;
  content: string;
  r2_key?: string;
  compile_status: "draft" | "compiling" | "compiled" | "failed";
  memory_ids?: string[];
  created_at: string;
  updated_at: string;
}

// ─── Console ─────────────────────────────────────────
export interface AgentStatus {
  name: string;
  status: "active" | "idle";
  last_called_at?: string;
  call_count_today?: number;
}

export interface SkillStatus {
  name: string;
  description?: string;
  enabled: boolean;
  version: string;
  call_count_session?: number;
}

export interface AuditLogEntry {
  id: string;
  user_id?: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  llm_model?: string;
  llm_tokens?: number;
  payload?: Record<string, unknown>;
  created_at: string;
}

// ─── SSE Events ──────────────────────────────────────
export type SSEEvent =
  | { event: "trace"; data: ThinkingTraceStep }
  | { event: "token"; data: { delta: string } }
  | {
      event: "done";
      data: {
        message_id: string;
        memory_candidates: Array<{ content: string; confidence: number }>;
      };
    }
  | { event: "error"; data: { code: string; message: string } };

// ─── Mini App — Adaptive Mode ─────────────────────────
export type AdaptiveModeType =
  | "briefing"
  | "premeeting"
  | "capture"
  | "chat"
  | "memory";

export interface AdaptiveModeResponse {
  mode: AdaptiveModeType;
  reason:
    | "morning_routine"
    | "meeting_soon"
    | "post_meeting"
    | "default"
    | "learned_pattern";
  confidence: number;
  meeting: {
    title: string;
    start_time: string;
    duration_min: number;
    google_meet_url?: string;
  } | null;
}

export interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  duration_min: number;
  tag?: string;
}

export interface MiniAppOpenLogEntry {
  timestamp: string;
  vn_hour: number;
  mode_shown: string;
  had_meeting_soon: boolean;
  duration_seconds: number;
}

export interface MemorySearchResult {
  id: string;
  content: string;
  score: number;
  status: "canonical";
  source: string;
  created_at: string;
}

export interface PendingMemorySummary {
  count: number;
  breakdown: { chat: number; capture: number; studio: number; manual: number };
}

export interface ContextMemoryCard {
  id: string;
  content: string;
  source_label: string;
  created_ago: string;
}
