interface PrReviewRecord {
  id: number;
  repoLabel: string;
  prNumber: number;
  prTitle: string;
  prAuthor: string;
  commitSha: string;
  blockers: number;
  majors: number;
  minors: number;
  suggestions: number;
  reviewedAt: string;
}

export function usePrReviewHistory() {
  const reviews = ref<PrReviewRecord[]>([]);
  const loading = ref(false);

  const totalBlockers = computed(() => reviews.value.reduce((s, r) => s + r.blockers, 0));
  const totalMajors = computed(() => reviews.value.reduce((s, r) => s + r.majors, 0));
  const totalMinors = computed(() => reviews.value.reduce((s, r) => s + r.minors, 0));
  const totalSuggestions = computed(() => reviews.value.reduce((s, r) => s + r.suggestions, 0));

  async function fetch(date?: string) {
    loading.value = true;
    try {
      reviews.value = await $fetch<PrReviewRecord[]>('/api/pr-review/history', {
        params: date ? { date } : {},
      });
    } catch (error) {
      console.error('Failed to fetch review history:', error);
    } finally {
      loading.value = false;
    }
  }

  async function copyDailyReport(date?: string) {
    try {
      const { markdown } = await $fetch<{ markdown: string }>(
        '/api/pr-review/daily-report',
        { params: date ? { date } : {} },
      );
      await navigator.clipboard.writeText(markdown);
      useToast().add({ title: '已複製', description: '每日報告已複製到剪貼簿', color: 'success' });
    } catch (error) {
      useToast().add({ title: '複製失敗', description: String(error), color: 'error' });
    }
  }

  return {
    reviews,
    loading,
    totalBlockers,
    totalMajors,
    totalMinors,
    totalSuggestions,
    fetch,
    copyDailyReport,
  };
}
