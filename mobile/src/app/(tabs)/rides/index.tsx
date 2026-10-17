import { router } from 'expo-router';
import { Text } from 'react-native';
import { Screen } from '../../../components/Screen';
import { AppButton } from '../../../components/AppButton';
export default function Route() { return <Screen title="Rides"><Text>Ride requests and reservations are coming after the matching MVP. Matching results do not reserve seats.</Text><AppButton label="Find a match" onPress={() => router.navigate('/home')} /></Screen>; }
