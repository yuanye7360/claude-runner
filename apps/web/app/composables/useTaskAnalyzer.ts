export interface AnalysisResult {
  complexity: 'complex' | 'medium' | 'simple';
  repos: { confidence: 'high' | 'low'; path: string }[];
  missingInfo: string[];
  suggestedWorkflow: 'auto' | 'superpowers-full' | 'superpowers-light';
  summary: string;
}

export function useTaskAnalyzer() {
  const analysisResult = ref<AnalysisResult | null>(null);
  const analysing = ref(false);
  const analysisFailed = ref(false);
  const answers = ref<{ question: string; answer: string }[]>([]);
  const currentRound = ref(0);
  const MAX_ROUNDS = 3;

  async function analyze(
    issue: { key: string; summary?: string; description?: string; labels?: string[] },
    mode?: 'normal' | 'smart',
  ) {
    analysing.value = true;
    analysisFailed.value = false;
    try {
      const res = await $fetch<{ status: string; result?: AnalysisResult; message?: string }>(
        '/api/claude-runner/analyze',
        {
          method: 'POST',
          body: { issue, previousAnswers: answers.value, mode },
        },
      );
      if (res.status === 'fallback') {
        analysisFailed.value = true;
        return null;
      }
      analysisResult.value = res.result ?? null;
      currentRound.value++;
      return res.result ?? null;
    } catch {
      analysisFailed.value = true;
      return null;
    } finally {
      analysing.value = false;
    }
  }

  function submitAnswer(question: string, answer: string) {
    answers.value.push({ question, answer });
  }

  function reset() {
    analysisResult.value = null;
    analysing.value = false;
    analysisFailed.value = false;
    answers.value = [];
    currentRound.value = 0;
  }

  const canAskMore = computed(() => currentRound.value < MAX_ROUNDS);
  const needsInput = computed(
    () =>
      analysisResult.value !== null &&
      analysisResult.value.missingInfo.length > 0 &&
      canAskMore.value,
  );

  return {
    analysisResult,
    analysing,
    analysisFailed,
    answers,
    currentRound,
    needsInput,
    canAskMore,
    analyze,
    submitAnswer,
    reset,
  };
}
