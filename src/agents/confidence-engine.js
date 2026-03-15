/**
 * FireSight — Confidence Engine
 *
 * Solves Problem #6 (Confidence-Aware Routing).
 *
 * Every agent action carries a confidence score. The commander sees:
 * - Routing confidence: how sure we are we picked the right agent
 * - Data confidence: how fresh/reliable the input data is
 * - Action confidence: how certain the agent is about its recommendation
 * - Composite confidence: weighted blend visible on each agent panel
 *
 * Low confidence = commander attention needed.
 * High confidence = agents can auto-execute.
 *
 * This feeds directly into the autonomy manager.
 */

import { bus, worldState } from './world-state.js';

// ============================================================
// CONFIDENCE SCORING
// ============================================================

/**
 * Calculate routing confidence — how sure are we that the voice command
 * was routed to the right agent?
 */
export function scoreRoutingConfidence(transcript, matchResult) {
  const { name, confidence: matchType } = matchResult;

  const baseScores = {
    explicit: 0.98,    // User said "Pyro, ..."
    mentioned: 0.90,   // User mentioned agent name somewhere
    keyword: 0.65,     // Matched on domain keywords
    special: 0.85,     // Special command like "sitrep"
    fallback: 0.30,    // No match, defaulted to Pyro
  };

  let score = baseScores[matchType] || 0.5;

  // Boost if transcript is short and focused (less ambiguity)
  const wordCount = transcript.split(/\s+/).length;
  if (wordCount < 8) score = Math.min(1.0, score + 0.05);
  if (wordCount > 30) score = Math.max(0.1, score - 0.1);

  // Penalize if multiple agents match equally
  if (matchType === 'keyword') {
    const agentKeywordCounts = countAgentKeywords(transcript);
    const topTwo = Object.values(agentKeywordCounts).sort((a, b) => b - a);
    if (topTwo.length >= 2 && topTwo[0] === topTwo[1]) {
      score *= 0.7; // tie = low confidence
    }
  }

  return {
    score: Math.round(score * 100) / 100,
    level: score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low',
    matchType,
    agent: name,
    explanation: buildRoutingExplanation(matchType, name, score),
  };
}

function countAgentKeywords(transcript) {
  const lower = transcript.toLowerCase();
  const agentKeywords = {
    pyro: ['fire', 'spread', 'burn', 'projection', 'wind', 'flame'],
    swarm: ['drone', 'scout', 'aerial', 'feed', 'camera', 'coverage'],
    evac: ['evacuate', 'evacuation', 'civilian', 'route', 'shelter'],
    deploy: ['engine', 'helicopter', 'crew', 'resource', 'suppression'],
  };

  const counts = {};
  for (const [agent, keywords] of Object.entries(agentKeywords)) {
    counts[agent] = keywords.filter(kw => lower.includes(kw)).length;
  }
  return counts;
}

function buildRoutingExplanation(matchType, agent, score) {
  switch (matchType) {
    case 'explicit': return `Commander directly addressed ${agent.toUpperCase()}`;
    case 'mentioned': return `${agent.toUpperCase()} mentioned in command`;
    case 'keyword': return `Domain keywords matched ${agent.toUpperCase()} (${Math.round(score * 100)}% confidence)`;
    case 'special': return `Special command detected`;
    case 'fallback': return `No clear match — defaulted to ${agent.toUpperCase()}. Commander may want to clarify.`;
    default: return `Routed to ${agent.toUpperCase()}`;
  }
}

/**
 * Calculate data confidence — how fresh and reliable is the data
 * the agent is working with?
 */
export function scoreDataConfidence(agentName) {
  const now = Date.now();
  const factors = [];

  // Wind data freshness
  const windAge = now - (worldState.wind?.lastUpdated || 0);
  const windFreshness = Math.max(0, 1 - windAge / (10 * 60 * 1000)); // decays over 10 min
  factors.push({ name: 'wind_data', score: windFreshness, weight: agentName === 'pyro' ? 3 : 1 });

  // Fire projection freshness
  const fireAge = now - (worldState.fire?.lastProjection || 0);
  const fireFreshness = Math.max(0, 1 - fireAge / (5 * 60 * 1000)); // decays over 5 min
  factors.push({ name: 'fire_projection', score: fireFreshness, weight: agentName === 'evac' ? 3 : 1 });

  // Drone data freshness (if swarm has recent feeds)
  const droneAge = now - (worldState.drones?.lastUpdate || 0);
  const droneFreshness = Math.max(0, 1 - droneAge / (3 * 60 * 1000)); // decays over 3 min
  factors.push({ name: 'drone_feeds', score: droneFreshness, weight: agentName === 'swarm' ? 3 : 1 });

  // Resource status freshness
  const resourceAge = now - (worldState.resources?.lastUpdate || 0);
  const resourceFreshness = Math.max(0, 1 - resourceAge / (5 * 60 * 1000));
  factors.push({ name: 'resource_status', score: resourceFreshness, weight: agentName === 'deploy' ? 3 : 1 });

  // Weighted average
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const weightedScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight;

  return {
    score: Math.round(weightedScore * 100) / 100,
    level: weightedScore >= 0.7 ? 'high' : weightedScore >= 0.4 ? 'medium' : 'low',
    factors,
    stale_sources: factors.filter(f => f.score < 0.3).map(f => f.name),
  };
}

/**
 * Calculate action confidence — how certain is the agent about
 * its specific recommendation?
 *
 * This is inferred from the agent's response characteristics.
 */
export function scoreActionConfidence(agentResponse) {
  let score = 0.7; // baseline

  // Hedging language reduces confidence
  const hedgeWords = ['maybe', 'possibly', 'uncertain', 'might', 'could be', 'not sure', 'unclear'];
  const speech = (agentResponse.speech || '').toLowerCase();
  const hedgeCount = hedgeWords.filter(w => speech.includes(w)).length;
  score -= hedgeCount * 0.1;

  // Strong language increases confidence
  const strongWords = ['recommend', 'must', 'critical', 'immediately', 'confirmed', 'verified'];
  const strongCount = strongWords.filter(w => speech.includes(w)).length;
  score += strongCount * 0.05;

  // Tool success rate
  if (agentResponse.toolResults?.length > 0) {
    const successRate = agentResponse.toolResults.filter(r => r.success !== false).length / agentResponse.toolResults.length;
    score = score * 0.6 + successRate * 0.4;
  }

  // Blocked by conflict = low confidence
  if (agentResponse.toolResults?.some(r => r.blocked_by_conflict)) {
    score *= 0.4;
  }

  score = Math.max(0, Math.min(1, score));

  return {
    score: Math.round(score * 100) / 100,
    level: score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low',
    hedge_count: hedgeCount,
  };
}

/**
 * Composite confidence — the single number shown on the agent panel.
 */
export function getCompositeConfidence(routingConf, dataConf, actionConf) {
  // Routing: 30%, Data: 30%, Action: 40%
  const composite = routingConf.score * 0.3 + dataConf.score * 0.3 + actionConf.score * 0.4;

  return {
    score: Math.round(composite * 100) / 100,
    level: composite >= 0.75 ? 'high' : composite >= 0.45 ? 'medium' : 'low',
    breakdown: {
      routing: routingConf,
      data: dataConf,
      action: actionConf,
    },
    recommendation: composite < 0.45
      ? 'Commander review recommended — confidence is low'
      : composite < 0.75
        ? 'Proceeding with moderate confidence'
        : 'High confidence — auto-executing',
  };
}

// ============================================================
// CONFIDENCE HISTORY — for trend visualization
// ============================================================

const confidenceHistory = [];

export function recordConfidence(agentName, composite) {
  confidenceHistory.push({
    agent: agentName,
    timestamp: Date.now(),
    ...composite,
  });

  // Keep last 50 entries
  if (confidenceHistory.length > 50) confidenceHistory.shift();

  bus.emit('confidence_updated', { agent: agentName, confidence: composite });
}

export function getConfidenceHistory(agentName) {
  return agentName
    ? confidenceHistory.filter(c => c.agent === agentName)
    : confidenceHistory;
}
