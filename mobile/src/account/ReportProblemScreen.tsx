import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Text } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { ChoiceSheet } from '../components/ChoiceSheet';
import { Screen } from '../components/Screen';
import { SettingsGroup, SettingsRow } from '../components/settings/SettingsGroup';
import { TextField } from '../components/TextField';
import { getFirebaseFirestore } from '../firebase/firebase';
import { PROBLEM_CATEGORIES, reportReference, validateProblemReport, type ProblemCategory, type ProblemReport } from './accountModel';
import { newProblemReportId, submitProblemReport } from './accountRepository';
import { AccountMemberPage, accountBack, accountStyles, useConfirmedAction } from './accountShared';

export function ReportProblemScreen() {
  return <AccountMemberPage title="Report a problem">{(uid) => <ReportForm key={uid} uid={uid} />}</AccountMemberPage>;
}

function ReportForm({ uid }: { uid: string }) {
  const [category, setCategory] = useState<ProblemCategory | null>(null);
  const [description, setDescription] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [id] = useState(() => newProblemReportId(getFirebaseFirestore()));
  const [submitted, setSubmitted] = useState(false);
  const [validation, setValidation] = useState('');
  const action = useConfirmedAction();
  const disabled = action.busy || action.pending;
  const submit = () => {
    setValidation('');
    if (!category) { setValidation('Choose a topic before submitting.'); return; }
    let report: ProblemReport;
    try {
      report = validateProblemReport({ category, description, appVersion: Constants.expoConfig?.version ?? 'unknown', platform: Platform.OS });
    } catch (error) { setValidation((error as Error).message); return; }
    void action.run(id, () => submitProblemReport(getFirebaseFirestore(), uid, id, report), () => setSubmitted(true));
  };
  if (submitted) return <Screen onBack={accountBack} title="Report submitted" subtitle="Thank you for letting us know.">
    <Card style={accountStyles.section}>
      <Text style={accountStyles.title}>Your reference number</Text>
      <Text selectable style={accountStyles.body}>{reportReference(id)}</Text>
      <Text style={accountStyles.body}>Your report has been saved for the Seawolf Rides team to review. Keep this reference if you contact us about the same issue.</Text>
    </Card>
    <Text style={accountStyles.body}>Reports are reviewed manually. This is not a live support chat or an emergency service.</Text>
    <AppButton label="Back to Account" onPress={() => router.replace('/account')} />
  </Screen>;

  return <Screen eyebrow="HELP" onBack={accountBack} title="Report a problem" subtitle="Tell us what happened and what you expected instead.">
    <SettingsGroup title="Topic"><SettingsRow icon="flag-outline" label={PROBLEM_CATEGORIES.find((item) => item.value === category)?.label ?? 'Choose a topic'} last onPress={disabled ? undefined : () => setChoosing(true)} /></SettingsGroup>
    <TextField label="Description" placeholder="Include the steps that led to the problem and any error message you saw." multiline textAlignVertical="top" style={{ minHeight: 160 }} maxLength={2000} editable={!disabled} value={description} onChangeText={setDescription} helperText={`${description.length.toLocaleString()} / 2,000 characters. Leave out passwords, payment details and exact addresses.`} />
    <Text style={accountStyles.caption}>Your account ID, app version and device platform are included with this report. Messages, photos and location data are not attached automatically.</Text>
    {!!(validation || action.error) && <Text accessibilityRole="alert" style={accountStyles.error}>{validation || action.error}</Text>}
    <AppButton label={action.busy ? 'Submitting…' : action.pending ? 'Check submission' : 'Submit report'} disabled={action.busy} onPress={submit} />
    <Text style={accountStyles.body}>To report a commuter’s behavior, open their profile and choose Report commuter. Use Account or privacy above for a data or account-deletion request.</Text>
    <Text style={accountStyles.caption}>Reports are reviewed manually and are not monitored for emergencies.</Text>
    {choosing && <ChoiceSheet title="What is the problem about?" choices={PROBLEM_CATEGORIES.map((item) => ({ label: item.label, onPress: () => { setCategory(item.value); setChoosing(false); } }))} onClose={() => setChoosing(false)} />}
  </Screen>;
}
