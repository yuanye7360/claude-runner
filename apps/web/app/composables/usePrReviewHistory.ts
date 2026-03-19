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

  const totalBlockers = computed(() =>
    reviews.value.reduce((s, r) => s + r.blockers, 0),
  );
  const totalMajors = computed(() =>
    reviews.value.reduce((s, r) => s + r.majors, 0),
  );
  const totalMinors = computed(() =>
    reviews.value.reduce((s, r) => s + r.minors, 0),
  );
  const totalSuggestions = computed(() =>
    reviews.value.reduce((s, r) => s + r.suggestions, 0),
  );

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

  const sending = ref(false);

  async function sendToSlack(channel: string, date?: string) {
    sending.value = true;
    try {
      const result = await $fetch<{ channel: string; ok: boolean; reviewCount: number }>(
        '/api/pr-review/send-report',
        {
          method: 'POST',
          body: { channel, ...(date ? { date } : {}) },
        },
      );
      useToast().add({
        title: '已發送',
        description: `報告已發送到 ${result.channel}（${result.reviewCount} 筆 review）`,
        color: 'success',
      });
      return true;
    } catch (error) {
      const msg =
        (error as any)?.data?.message ||
        (error instanceof Error ? error.message : '發送失敗');
      useToast().add({
        title: '發送失敗',
        description: msg,
        color: 'error',
      });
      return false;
    } finally {
      sending.value = false;
    }
  }

  return {
    reviews,
    loading,
    sending,
    totalBlockers,
    totalMajors,
    totalMinors,
    totalSuggestions,
    fetch,
    sendToSlack,
  };
}
