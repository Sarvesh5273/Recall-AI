import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Safe Area & Premium Icons
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';

// Database & API Imports
import { DatabaseProvider } from '@nozbe/watermelondb/DatabaseProvider';
import { database } from './src/database'; 
import { API_BASE_URL } from '@env';

// The Sync Engine
import { processOutboxQueue } from './src/utils/SyncWorker';

// Screen Imports
import HomeScreen from './src/screens/HomeScreen';
import InboxScreen from './src/screens/InboxScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import CameraScreen from './src/screens/CameraScreen';
import MatchModal from './src/screens/MatchModal';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator 
      screenOptions={({ route }) => ({ 
        headerShown: false,
       tabBarStyle: { 
          backgroundColor: '#FFFFFF', 
          borderTopWidth: 0,
          elevation: 20, 
          shadowOpacity: 0.1,
          shadowRadius: 15,
          shadowOffset: { width: 0, height: -5 },
          height: 75 + (insets.bottom > 0 ? insets.bottom : 10), 
          paddingBottom: (insets.bottom > 0 ? insets.bottom : 15) + 10, 
          paddingTop: 12
        },
        tabBarActiveTintColor: '#3B82F6', 
        tabBarInactiveTintColor: '#64748B', 
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700', marginTop: 4 },
        tabBarIcon: ({ color }) => {
          let iconName = 'circle';
          if (route.name === 'Home') iconName = 'home';
          else if (route.name === 'Inbox') iconName = 'inbox';
          else if (route.name === 'Inventory') iconName = 'box';
          else if (route.name === 'Settings') iconName = 'settings';
          return <Feather name={iconName} size={22} color={color} />;
        }
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Inbox" component={InboxScreen} />
      <Tab.Screen name="Inventory" component={InventoryScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  
  // THE STARTUP HEARTBEAT
  useEffect(() => {
    const syncCustomDictionary = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/sync-custom-dictionary?shop_id=shop_10065`);
        const json = await response.json();
        
        if (json.data) {
          const cloudItems = json.data;
          
          await database.write(async () => {
            const collection = database.get('custom_skus');
            const allLocal = await collection.query().fetch();
            
            const deleted = allLocal.map(i => i.prepareDestroyPermanently());
            const created = cloudItems.map((item: any) => 
              collection.prepareCreate(record => {
                record._raw.id = item.uid; 
                (record as any).uid = item.uid;
                (record as any).standard_name = item.standard_name;
              })
            );
            
            await database.batch(...deleted, ...created);
          });
          console.log("Custom Dictionary Synced to Edge Cache.");
        }
      } catch (error) {
        console.error("Startup Sync Failed:", error);
      }
    };

    syncCustomDictionary();
  }, []);

  // --- THE OFFLINE-FIRST SYNC MANAGER ---
  useEffect(() => {
    // 1. Check the queue immediately when the app launches
    processOutboxQueue();

    // 2. Listen for the app waking up from the background
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        console.log("App foregrounded. Firing Sync Engine...");
        processOutboxQueue();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <DatabaseProvider database={database}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="MainTabs" component={TabNavigator} />
            <Stack.Screen name="Camera" component={CameraScreen} options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="MatchModal" component={MatchModal} options={{ presentation: 'modal' }} />
          </Stack.Navigator>
        </NavigationContainer>
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}