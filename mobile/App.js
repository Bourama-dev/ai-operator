import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from './screens/HomeScreen';
import VoiceScreen from './screens/VoiceScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#0F172A',
            borderTopColor: '#1E293B',
            borderTopWidth: 1,
            height: 64,
            paddingBottom: 10,
          },
          tabBarActiveTintColor: '#2563EB',
          tabBarInactiveTintColor: '#475569',
          tabBarIcon: ({ color, size }) => {
            const icons = { Home: 'home-outline', Voice: 'mic-outline' };
            return <Ionicons name={icons[route.name]} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Dashboard' }} />
        <Tab.Screen name="Voice" component={VoiceScreen} options={{ tabBarLabel: 'Assistant' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
