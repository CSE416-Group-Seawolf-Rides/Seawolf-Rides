import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { ComponentProps } from 'react';


import { BottomTabBar } from '../../components/BottomTabBar';
import { RidesProvider } from '../../rides/RidesProvider';
import { colors } from '../../theme';
import { ThreeCarDemoProvider } from '../../matching/ThreeCarDemoProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(selected: IconName, unselected: IconName) {
  return function TabIcon({
    focused,
    color,
    size,
  }: {
    focused: boolean;
    color: any;
    size: number;
  }) {
    return <Ionicons color={color} name={focused ? selected : unselected} size={size} />;
  };
}

// Five destinations, modeled on ride apps (Home, Activity, Map, Account) plus the carpool
// inbox that drivers and riders need to coordinate pickups:
// - Home: your next ride, your week, and what needs doing (requests, matches).
// - Rides: everything already in motion — dated trips, requests in flight, and history.
// - Map: a placeholder for the future map experience.
// - Inbox: conversations with matched drivers and riders.
// - Account: profile, commute role, and sign-out.
function TabsNavigator() {
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
        }}
      />
      <Tabs.Screen
        name="rides"
        options={{
          title: 'Rides',
          tabBarIcon: tabIcon('calendar-clear', 'calendar-clear-outline'),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: 'Map', tabBarIcon: tabIcon('map', 'map-outline') }}
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
  if (!__DEV__) return <TabsNavigator />;
  return (
    <RidesProvider>
      <ThreeCarDemoProvider>
        <TabsNavigator />
      </ThreeCarDemoProvider>
    </RidesProvider>
  );
}
