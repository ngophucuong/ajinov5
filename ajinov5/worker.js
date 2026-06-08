// ============================================
// NAMING CONVENTION REMINDER:
// - agent-gateway   = THIS WORKER (compute)
// - llm-observatory = AI Gateway (observability, separate service)
// ============================================

const CONFIG = {
  JWT_SECRET: 'your-production-jwt-secret-min-32-chars-here!!',
  TUNNEL_BASE_URL: 'https://api.ajinov5.cuong.ngo',
  
  // AI Gateway endpoint for direct calls (if needed)
  AI_GATEWAY_URL: 'https://gateway.ai.cloudflare.com/v1/c420c80032474b31c185cb71930c4e8f/llm-observatory',
  
  RATE_LIMIT_WINDOW: 60,
  RATE_LIMIT_MAX: 100,
  OTP_TTL: 300,
};

// ... rest of worker code
