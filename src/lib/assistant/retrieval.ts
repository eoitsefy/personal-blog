export type RetrievalCandidate = {
  id: string;
  content: string;
  heading: string | null;
  embedding?: number[] | null;
  post: { id: string; slug: string; title: string; excerpt: string | null };
};

export type RankedEvidence = RetrievalCandidate & { score: number };

function terms(value: string) {
  const normalized = value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
  const result = new Set(normalized.split(/\s+/).filter((item) => item.length > 1));
  const chinese = normalized.replace(/[^\p{Script=Han}]/gu, "");
  for (let index = 0; index < chinese.length - 1; index += 1) result.add(chinese.slice(index, index + 2));
  return result;
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  return leftMagnitude && rightMagnitude ? dot / Math.sqrt(leftMagnitude * rightMagnitude) : 0;
}

export function rankEvidence(question: string, candidates: RetrievalCandidate[], options: { limit: number; minScore: number; queryEmbedding?: number[] }) {
  const queryTerms = terms(question);
  return candidates
    .map((candidate): RankedEvidence => {
      if (options.queryEmbedding && candidate.embedding) {
        return { ...candidate, score: cosineSimilarity(options.queryEmbedding, candidate.embedding) };
      }
      const bodyTerms = terms(`${candidate.post.title} ${candidate.heading ?? ""} ${candidate.content}`);
      const overlap = [...queryTerms].filter((term) => bodyTerms.has(term)).length;
      const titleTerms = terms(candidate.post.title);
      const titleOverlap = [...queryTerms].filter((term) => titleTerms.has(term)).length;
      const score = queryTerms.size ? (overlap + titleOverlap * 0.75) / queryTerms.size : 0;
      return { ...candidate, score: Math.min(1, score) };
    })
    .filter(({ score }) => score >= options.minScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, options.limit);
}
