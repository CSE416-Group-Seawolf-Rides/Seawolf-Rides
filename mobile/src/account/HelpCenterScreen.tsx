import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../components/Screen';
import { SettingsGroup, SettingsRow } from '../components/settings/SettingsGroup';
import { TextField } from '../components/TextField';
import { colors, spacing } from '../theme';
import { accountBack, accountStyles } from './accountShared';
import { searchHelp } from './helpContent';

export function HelpCenterScreen() {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const articles = searchHelp(query);
  const sections = [...new Set(articles.map((article) => article.section))];
  return <Screen eyebrow="HELP" title="Help center" onBack={accountBack} subtitle="Answers to common questions about your commute.">
    <TextField label="Search help" placeholder="Try cancellation, return trip or gas share" autoCorrect={false} returnKeyType="search" value={query} onChangeText={setQuery} accessory={<Ionicons name="search-outline" size={20} color={colors.textMuted} />} />
    {sections.map((section) => <SettingsGroup key={section} title={section}>
      {articles.filter((article) => article.section === section).map((article, index, items) => {
        const open = expanded === article.id;
        return <View key={article.id} style={index !== items.length - 1 ? styles.divider : undefined}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={article.question} onPress={() => setExpanded(open ? null : article.id)} style={({ pressed }) => [styles.question, pressed && styles.pressed]}>
            <Text style={styles.questionText}>{article.question}</Text>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </Pressable>
          {open && <Text style={styles.answer}>{article.answer}</Text>}
        </View>;
      })}
    </SettingsGroup>)}
    {!articles.length && <View style={accountStyles.section}><Text style={accountStyles.title}>No answers found</Text><Text style={accountStyles.body}>Try a different word, or send us a report below.</Text></View>}
    <SettingsGroup title="Still need help?"><SettingsRow icon="flag-outline" label="Report a problem" last onPress={() => router.push('/account/report-problem')} /></SettingsGroup>
  </Screen>;
}

const styles = StyleSheet.create({
  question: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 58, padding: spacing.lg },
  questionText: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600', lineHeight: 23 },
  answer: { color: colors.textMuted, fontSize: 15, lineHeight: 23, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.surfaceMuted },
});
