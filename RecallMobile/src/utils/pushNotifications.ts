/**
 * Push notification plumbing for Firebase Cloud Messaging (FCM).
 * 
 * This module handles:
 * - FCM token registration
 * - Token refresh
 * - Sending token to backend for storage
 * 
 * Prerequisites:
 * 1. npm install @react-native-firebase/app @react-native-firebase/messaging
 * 2. Add google-services.json to android/app/
 * 3. Add Firebase SDK to android/build.gradle
 * 
 * TODO: Install Firebase packages and configure Android project.
 * This file is the integration point — uncomment when Firebase is added.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
// import messaging from '@react-native-firebase/messaging';

const FCM_TOKEN_KEY = 'recall_fcm_token';

/**
 * Request push notification permission and register FCM token.
 * Call this after successful login.
 */
export async function registerForPushNotifications(
  apiBaseUrl: string,
  authToken: string,
): Promise<string | null> {
  try {
    // TODO: Uncomment when @react-native-firebase/messaging is installed
    // const authStatus = await messaging().requestPermission();
    // const enabled =
    //   authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    //   authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    //
    // if (!enabled) {
    //   console.log('Push notification permission denied');
    //   return null;
    // }
    //
    // const fcmToken = await messaging().getToken();
    // const storedToken = await AsyncStorage.getItem(FCM_TOKEN_KEY);
    //
    // if (fcmToken !== storedToken) {
    //   // Register token with backend
    //   await fetch(`${apiBaseUrl}/auth/register-device`, {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //       Authorization: `Bearer ${authToken}`,
    //     },
    //     body: JSON.stringify({ fcm_token: fcmToken, platform: 'android' }),
    //   });
    //   await AsyncStorage.setItem(FCM_TOKEN_KEY, fcmToken);
    // }
    //
    // // Listen for token refresh
    // messaging().onTokenRefresh(async (newToken) => {
    //   await fetch(`${apiBaseUrl}/auth/register-device`, {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //       Authorization: `Bearer ${authToken}`,
    //     },
    //     body: JSON.stringify({ fcm_token: newToken, platform: 'android' }),
    //   });
    //   await AsyncStorage.setItem(FCM_TOKEN_KEY, newToken);
    // });
    //
    // return fcmToken;

    console.log('[Push] Firebase not yet configured. Skipping FCM registration.');
    return null;
  } catch (error) {
    console.error('[Push] Registration failed:', error);
    return null;
  }
}

/**
 * Handle incoming push notifications.
 * Call this in App.tsx useEffect.
 */
export function setupNotificationHandlers() {
  // TODO: Uncomment when @react-native-firebase/messaging is installed
  // // Foreground messages
  // messaging().onMessage(async (remoteMessage) => {
  //   console.log('[Push] Foreground message:', remoteMessage);
  //   // Show local notification or in-app alert
  // });
  //
  // // Background/quit messages
  // messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  //   console.log('[Push] Background message:', remoteMessage);
  // });

  console.log('[Push] Notification handlers not yet active (Firebase pending).');
}
