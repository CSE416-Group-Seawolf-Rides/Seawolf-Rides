import { router } from 'expo-router';
import { Text } from 'react-native';
import { Screen } from '../../../components/Screen';
import { AppButton } from '../../../components/AppButton';
export default function Route() { return <Screen title="Inbox"><Text>Messaging will be available with persisted ride requests.</Text><AppButton label="Find a match" onPress={() => router.navigate('/home')} /></Screen>; }
