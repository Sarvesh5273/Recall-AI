import React, { useEffect } from 'react';
import { AppState, View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { DatabaseProvider } from '@nozbe/watermelondb/DatabaseProvider';
import { database } from './src/database';
import { API_BASE_URL } from '@env';
import { processOutboxQueue } from './src/utils/SyncWorker';

// Auth
import { AuthProvider, useAuth } from './src/context/AuthContext';
import SendOTPScreen from './src/screens/auth/SendOTPScreen';
import VerifyOTPScreen from './src/screens/auth/VerifyOTPScreen';
import SetPINScreen from './src/screens/auth/SetPINScreen';
import LoginScreen from './src/screens/auth/LoginScreen';

// App Screens
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

function AppNavigator() {
  const { shopId } = useAuth();

  useEffect(() => {
    const syncCustomDictionary = async () => {
      try {
        const tokenRes = await import('@react-native-async-storage/async-storage');
        const AsyncStorage = tokenRes.default;
        const token = await AsyncStorage.getItem('recall_token');
        if (!token) return;

        const response = await fetch(`${API_BASE_URL}/sync-custom-dictionary`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await response.json();

        if (json.data) {
          await database.write(async () => {
            const collection = database.get('custom_skus');
            const allLocal = await collection.query().fetch();
            const deleted = allLocal.map((i: any) => i.prepareDestroyPermanently());
            const created = json.data.map((item: any) =>
              collection.prepareCreate((record: any) => {
                record._raw.id = item.uid;
                record.uid = item.uid;
                record.standard_name = item.standard_name;
              })
            );
            await database.batch(...deleted, ...created);
          });
          console.log('Custom Dictionary Synced.');
        }
      } catch (error) {
        console.error('Startup Sync Failed:', error);
      }
    };

    syncCustomDictionary();
  }, [shopId]);

  useEffect(() => {
    processOutboxQueue();
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') processOutboxQueue();
    });
    return () => subscription.remove();
  }, []);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen name="Camera" component={CameraScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="MatchModal" component={MatchModal} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}

// FIX: SendOTP is first — new users land on Register, not PIN
function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SendOTP" component={SendOTPScreen} />
      <Stack.Screen name="VerifyOTP" component={VerifyOTPScreen} />
      <Stack.Screen name="SetPIN" component={SetPINScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

function RootNavigator() {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#3B82F6" size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {token ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <DatabaseProvider database={database}>
          <RootNavigator />
        </DatabaseProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}