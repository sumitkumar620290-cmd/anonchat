
/**
 * CONTENT MODERATION (Local Logic)
 * Removes Gemini dependencies for stable deployment.
 */
export async function moderate(text) {
  if (!text || text.trim().length === 0) return 'ALLOWED';

  // Simple local regex guard for critical safety violations
  const criticalRegex = /child.*(porn|sex|abuse)|terroris(m|t)|trafficking|bomb.*making|mass.*killing/i;
  if (criticalRegex.test(text)) {
    return 'BLOCKED';
  }

  // All other content defaults to allowed in this anonymous space
  return 'ALLOWED';
}

/**
 * STATIC TOPIC GENERATOR
 * Replaces AI generation with static fallback.
 */
export async function generateTopic(style = 'DEEP') {
  const deepFallbacks = [
    "What is a thought you've never shared out loud?",
    "What is something you regret not saying to someone?",
    "If you could erase one memory, what would it be?",
    "What is a secret you carry that feels heavy today?"
  ];
  
  const playfulFallbacks = [
    "What is your most harmless unpopular opinion?",
    "If you were a ghost, who would you mildly inconvenience?",
    "What is the strangest dream you remember?",
    "What's a quirk you have that no one knows about?"
  ];

  const pool = style === 'DEEP' ? deepFallbacks : playfulFallbacks;
  return pool[Math.floor(Math.random() * pool.length)];
}
