import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Vibration, TextInput, TouchableWithoutFeedback
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';

const MAX_ATTEMPTS = 5;

export default function PINLockScreen() {
  const insets = useSafeAreaInsets();
  const { shopName, logout, setPinVerified } = useAuth();
  const pinInputRef = useRef<TextInput>(null);

  const [pin, setPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const checkPIN = async (entered: string) => {
    if (isChecking) return;
    setIsChecking(true);

    try {
      const stored = await AsyncStorage.getItem('recall_pin');

      if (entered === stored) {
        // Correct — let RootNavigator show the app
        setPinVerified();
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        Vibration.vibrate([0, 80, 80, 80]);

        if (newAttempts >= MAX_ATTEMPTS) {
          // Force logout after 5 wrong attempts
          await logout();
          return;
        }

        setError(`Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts === 1 ? '' : 's'} remaining.`);
        setPin('');
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handlePinChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setError('');
    setPin(digits);
    if (digits.length === 6) checkPIN(digits);
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>

      {/* Header */}
      <View style={styles.top}>
        <View style={styles.logoRow}>
          <Text style={styles.logoSub}>RECALL AI</Text>
        </View>
        <Text style={styles.shopName}>{shopName ?? 'Your Shop'}</Text>
        <Text style={styles.subtitle}>Enter PIN to unlock</Text>
      </View>

      {/* PIN Dots — tap to re-open keyboard */}
      <TouchableWithoutFeedback onPress={() => pinInputRef.current?.focus()}>
        <View style={styles.middle}>
          <View style={styles.iconWrap}>
            <Feather name="lock" size={32} color="#3B82F6" />
          </View>

          <View style={styles.dotsRow}>
            {[0,1,2,3,4,5].map(i => (
              <View key={i} style={[
                styles.dot,
                pin.length > i && styles.dotFilled,
                !!error && styles.dotError,
                pin.length === i && !error && styles.dotActive,
              ]} />
            ))}
          </View>

          {error
            ? <View style={styles.errorRow}>
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            : <Text style={styles.hint}>Tap to enter PIN</Text>
          }
        </View>
      </TouchableWithoutFeedback>

      {/* Hidden TextInput — triggers native numpad */}
      <TextInput
        ref={pinInputRef}
        style={styles.hiddenInput}
        value={pin}
        onChangeText={handlePinChange}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        caretHidden
        secureTextEntry
        editable={!isChecking}
      />

      {/* Logout link */}
      <TouchableOpacity onPress={handleLogout} style={styles.logoutRow}>
        <Feather name="log-out" size={14} color="#94A3B8" />
        <Text style={styles.logoutText}>Login with different account</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#0F172A',
    justifyContent: 'space-between', paddingHorizontal: 24,
  },
  top: { alignItems: 'center', paddingTop: 20 },
  logoRow: { marginBottom: 20 },
  logoSub: { color: '#3B82F6', fontSize: 13, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  shopName: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: '#64748B', fontSize: 15, fontWeight: '500' },
  middle: { alignItems: 'center' },
  iconWrap: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: '#1E293B',
    justifyContent: 'center', alignItems: 'center', marginBottom: 32,
  },
  dotsRow: { flexDirection: 'row', gap: 16, justifyContent: 'center', marginBottom: 16 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#334155', backgroundColor: 'transparent' },
  dotActive: { borderColor: '#3B82F6' },
  dotFilled: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  dotError: { borderColor: '#EF4444', backgroundColor: '#450A0A' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },
  hint: { color: '#475569', fontSize: 13, fontWeight: '500' },
  hiddenInput: { position: 'absolute', width: 0, height: 0, opacity: 0 },
  logoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  logoutText: { color: '#475569', fontSize: 13, fontWeight: '600' },
});