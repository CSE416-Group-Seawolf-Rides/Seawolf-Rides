import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { ComponentProps } from 'react';
import { ColorValue } from 'react-native';

import { BottomTabBar } from '../../components/BottomTabBar';
import { useSession } from '../../auth/SessionProvider';
import { sharedDrivingDays } from '../../rides/rideModel';
import { RidesProvider, useRides } from '../../rides/RidesProvider';
import { colors } from '../../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(selected: IconName, unselected: IconName) {
  return function TabIcon({
    focused,
    color,
    size,
  }: {
    focused: boolean;
    color: ColorValue;
    size: number;
  }) {
    return <Ionicons color={color} name={focused ? selected : unselected} size={size} />;
  };
}

// Four destinations, modeled on ride apps (Home, Activity, Account) plus the carpool
// inbox that drivers and riders need to coordinate pickups:
// - Home: your next ride, your week, and what needs doing (requests, matches).
// - Rides: everything already in motion — dated trips, requests in flight, and history.
// - Inbox: conversations with matched drivers and riders.
// - Account: profile, commute role, and sign-out.
function TabsNavigator() {
  const { commute } = useSession();
  const { incoming } = useRides();
  // Badge only what needs the user's action: riders waiting on a yes/no.
  const needsAnswer = commute
    ? incoming.filter(
        (request) =>
          request.status === 'pending' && sharedDrivingDays(commute, request).length > 0,
      ).length
    : 0;

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
      tabBar={(props) => <BottomTabBar {...props} />}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: tabIcon('home', 'home-outline'),
          tabBarBadge: needsAnswer > 0 ? needsAnswer : undefined,
          tabBarAccessibilityLabel:
            needsAnswer > 0
              ? `Home, ${needsAnswer} ride request${needsAnswer === 1 ? '' : 's'} to answer`
              : 'Home',
        }}
      />
      <Tabs.Screen
        name="rides"
        options={{ title: 'Rides', tabBarIcon: tabIcon('calendar-clear', 'calendar-clear-outline') }}
      />
      <Tabs.Screen
        name="inbox"
        options={{ title: 'Inbox', tabBarIcon: tabIcon('chatbubbles', 'chatbubbles-outline') }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: tabIcon('person-circle', 'person-circle-outline'),
        }}
      />
    </Tabs>
  );
}

export default function TabsLayout() {
  // Prototype ride requests belong to the active session. Keeping their provider
  // inside the protected tabs subtree clears them when sign-out unmounts the tabs.
  return (
    <RidesProvider>
      <TabsNavigator />
    </RidesProvider>
  );
}
