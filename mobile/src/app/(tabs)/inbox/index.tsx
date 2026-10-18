import { router } from 'expo-router';
import { Text } from 'react-native';
import { Screen } from '../../../components/Screen';
import { AppButton } from '../../../components/AppButton';
export default function Route() { return <Screen title="Inbox"><Text>Ride requests and driver decisions are in Rides. Messaging is not available in this demonstration.</Text><AppButton label="View rides and requests" onPress={() => router.navigate('/rides')} /></Screen>; }
