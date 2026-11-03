import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ChoiceSheet } from '../components/ChoiceSheet';
import { Screen } from '../components/Screen';
import { SettingsGroup, SettingsRow } from '../components/settings/SettingsGroup';
import { TextField } from '../components/TextField';
import { getFirebaseFirestore } from '../firebase/firebase';
import { colors } from '../theme';
import { validateEmergencyContact, type EmergencyContact } from './accountModel';
import { loadEmergencyContact, removeEmergencyContact, saveEmergencyContact } from './accountRepository';
import { AccountMemberPage, accountBack, accountStyles, useConfirmedAction } from './accountShared';

export function EmergencyContactScreen() {
  return <AccountMemberPage title="Emergency contact">{(uid) => <ContactPage key={uid} uid={uid} />}</AccountMemberPage>;
}

function ContactPage({ uid }: { uid: string }) {
  const [loaded, setLoaded] = useState(false);
  const [initial, setInitial] = useState<EmergencyContact | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadEmergencyContact(getFirebaseFirestore(), uid).then(
      (value) => { if (active) { setInitial(value); setLoaded(true); } },
      () => { if (active) setError(true); },
    );
    return () => { active = false; };
  }, [uid, attempt]);
  if (!loaded) return <Screen onBack={accountBack} title="Emergency contact">
    {error ? <><Text accessibilityRole="alert" style={accountStyles.error}>Couldn’t load your contact. Check your connection and try again.</Text><AppButton label="Try again" onPress={() => { setError(false); setAttempt((value) => value + 1); }} /></>
      : <ActivityIndicator accessibilityLabel="Loading emergency contact" color={colors.accent} />}
  </Screen>;
  return <ContactForm uid={uid} initial={initial} />;
}

function ContactForm({ uid, initial }: { uid: string; initial: EmergencyContact | null }) {
  const empty = { name: '', phone: '', relationship: '' };
  const [draft, setDraft] = useState<EmergencyContact>(initial ?? empty);
  const [saved, setSaved] = useState(initial);
  const [validation, setValidation] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const action = useConfirmedAction();
  const disabled = action.busy || action.pending;
  const save = () => {
    setValidation(''); setNotice('');
    let value: EmergencyContact;
    try { value = validateEmergencyContact(draft); }
    catch (error) { setValidation((error as Error).message); return; }
    void action.run(JSON.stringify(['save', value]), () => saveEmergencyContact(getFirebaseFirestore(), uid, value), () => {
      setSaved(value); setDraft(value); setNotice('Contact saved.');
    });
  };
  const remove = () => {
    setConfirmRemove(false); setValidation(''); setNotice('');
    void action.run('remove', () => removeEmergencyContact(getFirebaseFirestore(), uid), () => {
      setSaved(null); setDraft(empty); setNotice('Contact removed.');
    });
  };
  const contact = async (method: 'tel' | 'sms') => {
    if (!saved) return;
    try { await Linking.openURL(`${method}:${saved.phone}`); }
    catch { setValidation(`Couldn’t open ${method === 'tel' ? 'Phone' : 'Messages'} on this device.`); }
  };

  return <Screen eyebrow="SAFETY & PRIVACY" onBack={accountBack} title="Emergency contact" subtitle="Keep someone you trust within reach.">
    <Text style={accountStyles.body}>This contact is private to your account. We don’t share it with other commuters or send alerts automatically. Ask the person before adding their number.</Text>
    <TextField label="Full name" value={draft.name} maxLength={80} editable={!disabled} autoComplete="name" onChangeText={(name) => setDraft({ ...draft, name })} />
    <TextField label="Phone number" value={draft.phone} maxLength={30} editable={!disabled} keyboardType="phone-pad" autoComplete="tel" helperText="For numbers outside the US, include + and the country code." onChangeText={(phone) => setDraft({ ...draft, phone })} />
    <TextField label="Relationship (optional)" value={draft.relationship} maxLength={40} editable={!disabled} placeholder="Parent, partner, friend" onChangeText={(relationship) => setDraft({ ...draft, relationship })} />
    {!!(validation || action.error) && <Text accessibilityRole="alert" style={accountStyles.error}>{validation || action.error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={accountStyles.success}>{notice}</Text>}
    <AppButton label={action.busy ? 'Saving…' : action.pending ? 'Check save' : 'Save contact'} disabled={action.busy} onPress={action.pending ? action.retry : save} />
    {saved && <>
      <SettingsGroup title="Contact options">
        <SettingsRow icon="call-outline" label={`Call ${saved.name}`} onPress={() => void contact('tel')} />
        <SettingsRow icon="chatbubble-outline" label={`Text ${saved.name}`} last onPress={() => void contact('sms')} />
      </SettingsGroup>
      <AppButton label="Remove contact" variant="secondary" disabled={disabled} onPress={() => setConfirmRemove(true)} />
    </>}
    <View style={accountStyles.section}><Text style={accountStyles.caption}>For an immediate emergency, contact local emergency services. Saving a contact does not notify anyone or request help.</Text></View>
    {confirmRemove && <ChoiceSheet title="Remove emergency contact?" message="Their name and phone number will be removed from your account." choices={[{ label: 'Remove contact', destructive: true, onPress: remove }]} onClose={() => setConfirmRemove(false)} />}
  </Screen>;
}
