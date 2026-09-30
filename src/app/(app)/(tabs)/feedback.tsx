import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { FeedbackCard } from '@/components/cards';
import { Banner, Card, EmptyState, Fab, HeroHeader, ListSkeleton, Screen, Segmented, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { useMe } from '@/providers/AuthProvider';
import { gradients, spacing } from '@/theme/tokens';

type Scope = 'inbox' | 'mine' | 'qa' | 'blockers';

export default function Feedback() {
  const { me, isEmployee } = useMe();
  const params = useLocalSearchParams<{ scope?: Scope }>();
  const [scope, setScope] = useState<Scope>(params.scope ?? (isEmployee ? 'mine' : 'inbox'));
  const [q, setQ] = useState('');

  // Follow deep links like /tasks?scope=review without an effect.
  const [lastParam, setLastParam] = useState(params.scope);
  if (params.scope !== lastParam) {
    setLastParam(params.scope);
    if (params.scope) setScope(params.scope);
  }

  const { data, loading, refreshing, refresh, error } = useLoad(() => api.feedback(scope, me.id), [scope]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((f) => !term || f.title.toLowerCase().includes(term) || f.body.toLowerCase().includes(term));
  }, [data, q]);

  const scopes = isEmployee
    ? [
        { value: 'mine' as const, label: 'My posts' },
        { value: 'qa' as const, label: 'Q&A board' },
      ]
    : [
        { value: 'inbox' as const, label: 'Inbox' },
        { value: 'blockers' as const, label: 'Blockers' },
        { value: 'mine' as const, label: 'Mine' },
        { value: 'qa' as const, label: 'Q&A' },
      ];

  return (
    <View style={{ flex: 1 }}>
      <Screen
        refreshing={refreshing}
        onRefresh={refresh}
        header={
          <HeroHeader title="Feedback" subtitle="Questions · ideas · blockers" colorsOverride={gradients.feedback} />
        }>
        <View style={{ gap: spacing.md }}>
          <Segmented options={scopes} value={scope} onChange={setScope} />
          <TextField icon="search" placeholder="Search" value={q} onChangeText={setQ} autoCorrect={false} />
          {scope === 'mine' && (
            <Banner tone="info">Posts you sent anonymously are not linked to you, so they don&apos;t appear here. Answers to anonymous questions can be published on the Q&amp;A board.</Banner>
          )}
          {error && <Banner tone="danger">{error}</Banner>}
          {loading ? (
            <ListSkeleton rows={4} />
          ) : list.length === 0 ? (
            <Card>
              <EmptyState
                icon={scope === 'qa' ? 'library-outline' : scope === 'blockers' ? 'hand-left-outline' : 'chatbubbles-outline'}
                title={scope === 'qa' ? 'No published answers yet' : scope === 'blockers' ? 'No open blockers' : 'Nothing here yet'}
                body={scope === 'mine' ? 'Ask a question, share an idea, or tell us what is stopping your work.' : undefined}
              />
            </Card>
          ) : (
            list.map((f, i) => <FeedbackCard key={f.id} item={f} index={i} />)
          )}
        </View>
      </Screen>
      <Fab label="New" icon="create-outline" onPress={() => router.push('/feedback/new')} />
    </View>
  );
}
