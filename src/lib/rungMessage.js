import { formatIndianNumber } from "./gameEngine.js";

// Inter-rung acknowledgement shown after a correct answer on Q1–Q14.
// KBC-style framing per Aasif's call (2026-05-09): every screen between
// rungs states (a) what the player scored on the previous question,
// (b) what's guaranteed if they get a future question wrong (the last
// safety net cleared), and (c) what's at stake on the next question.
// From Q11 onwards the body also explicitly mentions walk-away as an
// option — at those stakes the choice deserves to be spelled out, not
// just left as a button.
//
// Pure copy, no React, so any reveal view can use it. The iOS app keeps
// the same thing in `RungMessage.make`.
export function rungMessage(cleared, scoreLabel, playerName) {
  const next = cleared + 1;
  const name = playerName?.trim() || "friend";

  // What you take home if you get a future question wrong, given safety
  // nets you've already passed.
  let guaranteed = 0;
  if (cleared >= 10) guaranteed = 1000000; // 10 lakh
  else if (cleared >= 5) guaranteed = 25000; // 25 thousand
  const consequence =
    guaranteed > 0
      ? `Get Q${next} wrong and you take home ${formatIndianNumber(guaranteed)} (the safety net).`
      : `Get Q${next} wrong and you take home nothing.`;

  // From Q11 onwards, also call out walk-away as an option in the body.
  const stakes =
    cleared >= 11
      ? `${consequence} Or walk away with ${scoreLabel} now.`
      : consequence;

  // Just cleared a safety net rung — the safety net IS the news.
  if (cleared === 5) {
    return {
      headline: `First safety net secured, ${name}.`,
      body: `25,000 credibility points are now guaranteed, even if you fall on a later question. Q6 awaits.`,
    };
  }
  if (cleared === 10) {
    return {
      headline: `Second safety net secured, ${name}.`,
      body: `10,00,000 credibility points are now guaranteed, even if you fall on a later question. Q11 awaits.`,
    };
  }

  // Tier transitions
  if (cleared === 4) {
    return {
      headline: `Tier 1 cleared, ${name}.`,
      body: `${scoreLabel} credibility points secured. Q5 is the first safety net. ${stakes}`,
    };
  }
  if (cleared === 8) {
    return {
      headline: `Tier 2 cleared, ${name}.`,
      body: `${scoreLabel} credibility points secured. Q9 starts the hard tier. ${stakes}`,
    };
  }
  if (cleared === 12) {
    return {
      headline: `Tier 3 cleared, ${name}.`,
      body: `${scoreLabel} credibility points secured. Q13 starts the expert tier — three from a crore. ${stakes}`,
    };
  }

  // Late expert tier
  if (cleared === 14) {
    return {
      headline: `One question from a crore, ${name}.`,
      body: `${scoreLabel} credibility points secured. Q15 is the last one. ${stakes}`,
    };
  }
  if (cleared === 13) {
    return {
      headline: `Expert tier, ${name}.`,
      body: `Q13 cleared with ${scoreLabel} credibility points. Two more questions to a crore. ${stakes}`,
    };
  }

  // Generic in-tier (Q1, Q2, Q3, Q6, Q7, Q9, Q11)
  let praise;
  if (cleared <= 3) praise = "Well played";
  else if (cleared <= 7) praise = "Strong work";
  else praise = "Impressive"; // Q9, Q11

  return {
    headline: `${praise}, ${name}.`,
    body: `Q${cleared} cleared with ${scoreLabel} credibility points. ${stakes}`,
  };
}
