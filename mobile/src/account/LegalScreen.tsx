import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { SettingsGroup, SettingsRow } from '../components/settings/SettingsGroup';
import { accountBack, accountStyles } from './accountShared';
import { POLICY_DATE, POLICY_VERSION, PRIVACY, TERMS } from './legalContent';

export function LegalScreen() {
  return <Screen eyebrow="HELP" onBack={accountBack} title="Terms & privacy" subtitle="How Seawolf Rides works and how your information is handled.">
    <SettingsGroup>
      <SettingsRow icon="document-text-outline" label="Terms of use" onPress={() => router.push('/account/terms')} />
      <SettingsRow icon="shield-checkmark-outline" label="Privacy policy" last onPress={() => router.push('/account/privacy-policy')} />
    </SettingsGroup>
    <Text style={accountStyles.caption}>Version {POLICY_VERSION} · Updated {POLICY_DATE}</Text>
  </Screen>;
}

export function PolicyScreen({ policy }: { policy: 'terms' | 'privacy' }) {
  const document = policy === 'terms' ? TERMS : PRIVACY;
  return <Screen onBack={accountBack} title={document.title} subtitle={`Version ${POLICY_VERSION} · Updated ${POLICY_DATE}`}>
    <Text style={accountStyles.body}>{document.introduction}</Text>
    {document.sections.map((section) => <Card key={section.title} style={accountStyles.section}>
      <Text accessibilityRole="header" style={accountStyles.title}>{section.title}</Text>
      {section.paragraphs.map((paragraph) => <Text key={paragraph} selectable style={accountStyles.body}>{paragraph}</Text>)}
    </Card>)}
    <View style={accountStyles.section}><SettingsGroup><SettingsRow icon="flag-outline" label="Contact the project team" last onPress={() => router.push('/account/report-problem')} /></SettingsGroup></View>
  </Screen>;
}
