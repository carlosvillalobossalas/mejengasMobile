import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme } from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import HomeFeedScreen from '../screens/HomeFeedScreen';
import HomeExploreScreen from '../screens/HomeExploreScreen';
import HomeStatsScreen from '../screens/HomeStatsScreen';
import HomeManageScreen from '../screens/HomeManageScreen';

type HomeTabsParamList = {
  Feed: undefined;
  Explore: undefined;
  Stats: undefined;
  Manage: undefined;
};

const Tab = createBottomTabNavigator<HomeTabsParamList>();

export default function HomeTabsNavigator() {
  const theme = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="Feed"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outlineVariant,
        },
        tabBarIcon: ({ color, size }) => {
          const iconName =
            route.name === 'Feed'
              ? 'newspaper-variant-outline'
              : route.name === 'Explore'
                ? 'compass-outline'
                : route.name === 'Stats'
                  ? 'chart-box-outline'
                  : 'cog-outline';

          return <Icon name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Feed" component={HomeFeedScreen} options={{ title: 'Feed' }} />
      <Tab.Screen name="Explore" component={HomeExploreScreen} options={{ title: 'Explorar' }} />
      <Tab.Screen name="Stats" component={HomeStatsScreen} options={{ title: 'Estadísticas' }} />
      <Tab.Screen name="Manage" component={HomeManageScreen} options={{ title: 'Gestión' }} />
    </Tab.Navigator>
  );
}
