import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { ComponentProps } from 'react';
import { ColorValue } from 'react-native';

import { BottomTabBar } from '../../components/BottomTabBar';
import {
  RideRequestsProvider,
  useRideRequests,
} from '../../prototypeData/RideRequestsProvider';
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
// - Home: start the main task, finding (or later, offering) a ride.
// - Rides: everything already in motion — pending requests and scheduled commutes.
// - Inbox: conversations with matched drivers and riders.
// - Account: profile, commute role, and sign-out.
function TabsNavigator() {
  const { requestedCommuteIds } = useRideRequests();
  const pendingRequests = requestedCommuteIds.length;

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
      tabBar={(props) => <BottomTabBar {...props} />}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="rides"
        options={{
          title: 'Rides',
          tabBarIcon: tabIcon('calendar-clear', 'calendar-clear-outline'),
          tabBarBadge: pendingRequests > 0 ? pendingRequests : undefined,
          tabBarAccessibilityLabel:
            pendingRequests > 0
              ? `Rides, ${pendingRequests} pending request${pendingRequests === 1 ? '' : 's'}`
              : 'Rides',
        }}
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
    <RideRequestsProvider>
      <TabsNavigator />
    </RideRequestsProvider>
  );
}
