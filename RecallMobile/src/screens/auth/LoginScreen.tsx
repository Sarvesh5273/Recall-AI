import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Vibration, TextInput, KeyboardAvoidingView,
  Platform, Keyboard
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@env';
import { useAuth } from '../../context/AuthContext';

export default function LoginScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const loadStored = async () => {
      try {
        const storedPhone = await AsyncStorage.getItem('recall_phone');
        const storedShopName = await AsyncStorage.getItem('recall_shop_name');
        if (storedPhone) setPhone(storedPhone);
        if (storedShopName) setShopName(storedShopName);
      } catch {}
    };
    loadStored();

    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    setTimeout(() => inputRef.current?.focus(), 400);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleCardPress = () => {
    Keyboard.dismiss();
    setTimeout(() => inputRef.current?.focus(), 120);
  };

  const handlePinChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setPin(digits);
    setError('');
    if (digits.length === 6) handleLogin(digits);
  };

  const triggerError = (msg: string) => {
    Vibration.vibrate([0, 80, 80, 80]);
    setError(msg);
    setPin('');
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  const handleLogin = async (enteredPin: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin: enteredPin })
      });
      const json = await res.json();
      if (!res.ok) {
        triggerError(json.detail || 'Incorrect PIN');
        return;
      }
      await AsyncStorage.setItem('recall_phone', phone);
      await AsyncStorage.setItem('recall_shop_name', json.shop_name);
      await login(json.token, json.shop_id, json.shop_name);
    } catch {
      triggerError('Connection failed. Check network.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.headerSub}>RECALL AI</Text>
        <Text style={styles.headerTitle}>
          {shopName ? 'Welcome back' : 'Login'}
        </Text>
        {shopName ? <Text style={styles.shopName}>{shopName}</Text> : null}
      </View>

      <View style={[styles.body, { paddingBottom: insets.bottom + 24 }]}>

        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          value={pin}
          onChangeText={handlePinChange}
          keyboardType="number-pad"
          maxLength={6}
          caretHidden
          autoFocus
        />

        <View style={styles.card} onTouchStart={handleCardPress}>
          <View style={styles.iconWrap}>
            {loading
              ? <ActivityIndicator color="#3B82F6" size="small" />
              : <Feather name="lock" size={28} color="#3B82F6" />
            }
          </View>
          <Text style={styles.cardTitle}>Enter your PIN</Text>
          <Text style={styles.cardSub}>6-digit security PIN</Text>

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

          {error ? (
            <View style={styles.errorRow}>
              <Feather name="alert-circle" size={14} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <Text style={styles.hint}>
              {isKeyboardVisible ? 'Enter your 6-digit PIN' : 'Tap here to enter PIN'}
            </Text>
          )}
        </View>

        <TouchableOpacity
          onPress={() => navigation.replace('SendOTP')}
          style={styles.registerLink}
        >
          <Feather name="plus-circle" size={15} color="#3B82F6" />
          <Text style={styles.registerText}>Register a new shop</Text>
        </TouchableOpacity>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#0F172A', borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    paddingBottom: 32, paddingHorizontal: 24,
  },
  headerSub: { color: '#64748B', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
  headerTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', marginBottom: 2 },
  shopName: { color: '#3B82F6', fontSize: 15, fontWeight: '700', marginTop: 4 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 24 },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, marginBottom: 20,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: '#EFF6FF',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 6 },
  cardSub: { fontSize: 14, color: '#64748B', fontWeight: '500', marginBottom: 24 },
  dotsRow: { flexDirection: 'row', gap: 14, justifyContent: 'center', marginBottom: 16 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#CBD5E1', backgroundColor: 'transparent' },
  dotActive: { borderColor: '#3B82F6', borderWidth: 2.5 },
  dotFilled: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  dotError: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },
  hint: { color: '#94A3B8', fontSize: 12, textAlign: 'center', fontWeight: '500' },
  registerLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 'auto', paddingTop: 24,
  },
  registerText: { color: '#3B82F6', fontSize: 14, fontWeight: '700' },
});