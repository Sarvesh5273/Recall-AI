import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Vibration, TextInput, TouchableWithoutFeedback
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@env';
import { useAuth } from '../../context/AuthContext';

// mode='register' — new user, collect shop name + call /auth/register
// mode='local'    — existing user on new device, just save PIN locally
type Mode = 'register' | 'local';
type Step = 'set' | 'confirm' | 'shop_name';

export default function SetPINScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { phone, otp } = route.params ?? {};
  const mode: Mode = phone && otp ? 'register' : 'local';

  const { login, setLocalPinSet } = useAuth();
  const pinInputRef = useRef<TextInput>(null);

  const [step, setStep] = useState<Step>('set');
  const [pin, setPin] = useState('');
  const [confirmedPin, setConfirmedPin] = useState('');
  const [shopName, setShopName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currentPin = step === 'set' ? pin : confirmedPin;

  const triggerError = (msg: string) => {
    Vibration.vibrate(400);
    setError(msg);
    if (step === 'confirm') setConfirmedPin('');
  };

  const handlePinChange = (val: string) => {
    // Only digits, max 6
    const digits = val.replace(/\D/g, '').slice(0, 6);
    const setter = step === 'set' ? setPin : setConfirmedPin;
    setError('');
    setter(digits);

    if (digits.length === 6) {
      setTimeout(() => {
        if (step === 'set') {
          setStep('confirm');
          setConfirmedPin('');
          // re-focus for confirm step
          setTimeout(() => pinInputRef.current?.focus(), 100);
        } else {
          if (digits !== pin) {
            triggerError('PINs do not match. Try again.');
          } else {
            if (mode === 'local') {
              saveLocalPIN(digits);
            } else {
              setStep('shop_name');
            }
          }
        }
      }, 150);
    }
  };

  // Called when mode=local after PIN confirmed
  const saveLocalPIN = async (confirmedPinValue: string) => {
    await AsyncStorage.setItem('recall_pin', confirmedPinValue);
    setLocalPinSet(); // tells AuthContext PIN is now set → RootNavigator shows app
  };

  // Called when mode=register after shop name entered
  const handleRegister = async () => {
    if (!shopName.trim() || shopName.trim().length < 2) {
      setError('Enter your shop name (at least 2 characters)');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          otp,
          shop_name: shopName.trim()
          // PIN intentionally NOT sent — lives on device only
        })
      });
      const json = await res.json();

      if (res.status === 409 && json.detail === 'ALREADY_REGISTERED') {
        // Edge case: user went through OTP again but was already registered
        // Shouldn't happen normally but handle gracefully
        setError('This number is already registered. Please login.');
        return;
      }

      if (!res.ok) throw new Error(json.detail || 'Registration failed');

      // Save PIN locally AFTER successful registration
      await AsyncStorage.setItem('recall_pin', pin);

      // Login sets token in context → RootNavigator shows PIN flow
      await login(json.token, json.shop_id, json.shop_name);
      // After login(), localPinSet will be true (we just set it above)
      // and pinVerified is false → RootNavigator routes to PINLockScreen
      // But we just set the PIN, so we want to go straight to app
      // Solution: also call setLocalPinSet so RootNavigator skips PINLock
      setLocalPinSet();

    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const stepConfig = {
    set:       { title: 'Set PIN',      sub: 'Choose a 6-digit app lock PIN', icon: 'lock' },
    confirm:   { title: 'Confirm PIN',  sub: 'Re-enter your PIN',              icon: 'check-circle' },
    shop_name: { title: 'Shop Name',    sub: 'What is your shop called?',      icon: 'home' },
  };
  const config = stepConfig[step];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity
          onPress={() => {
            if (step === 'set') navigation.goBack();
            else if (step === 'confirm') { setStep('set'); setPin(''); setConfirmedPin(''); }
            else setStep('confirm');
          }}
          style={styles.backBtn}
        >
          <Feather name="arrow-left" size={20} color="#94A3B8" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerSub}>RECALL AI</Text>
          <Text style={styles.headerTitle}>{config.title}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {mode === 'register' && (
          <>
            <View style={styles.stepRow}>
              <View style={[styles.stepDot, styles.stepDotDone]} />
              <View style={[styles.stepLine, styles.stepLineDone]} />
              <View style={[styles.stepDot, styles.stepDotDone]} />
              <View style={[styles.stepLine, step === 'shop_name' && styles.stepLineDone]} />
              <View style={[styles.stepDot, step === 'shop_name' ? styles.stepDotDone : styles.stepDotActive]} />
            </View>
            <Text style={styles.stepLabel}>Step 3 of 3 — {config.sub}</Text>
          </>
        )}

        {mode === 'local' && (
          <View style={styles.infoBox}>
            <Feather name="smartphone" size={16} color="#3B82F6" />
            <Text style={styles.infoText}>
              Set a PIN to lock the app on this device. Your account is already active.
            </Text>
          </View>
        )}

        {step !== 'shop_name' ? (
          <>
            {/* Hidden TextInput — triggers native numpad */}
            <TextInput
              ref={pinInputRef}
              style={styles.hiddenInput}
              value={currentPin}
              onChangeText={handlePinChange}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              caretHidden
              secureTextEntry
            />

            {/* Tapping card re-focuses the hidden input */}
            <TouchableWithoutFeedback onPress={() => pinInputRef.current?.focus()}>
              <View style={styles.card}>
                <View style={styles.iconWrap}>
                  <Feather name={config.icon as any} size={28} color="#3B82F6" />
                </View>
                <Text style={styles.cardTitle}>{config.title}</Text>
                <Text style={styles.cardSub}>{config.sub}</Text>

                <View style={styles.dotsRow}>
                  {[0,1,2,3,4,5].map(i => (
                    <View key={i} style={[
                      styles.dot,
                      currentPin.length > i && styles.dotFilled,
                      !!error && styles.dotError
                    ]} />
                  ))}
                </View>

                {error
                  ? <View style={styles.errorRow}>
                      <Feather name="alert-circle" size={14} color="#EF4444" />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  : <Text style={styles.hint}>Tap here if keyboard doesn't appear</Text>
                }
              </View>
            </TouchableWithoutFeedback>
          </>
        ) : (
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Feather name="home" size={28} color="#10B981" />
            </View>
            <Text style={styles.cardTitle}>Almost Done!</Text>
            <Text style={styles.cardSub}>Enter your shop name to complete registration</Text>

            <TextInput
              style={styles.shopInput}
              placeholder="e.g. Sharma General Store"
              placeholderTextColor="#CBD5E1"
              value={shopName}
              onChangeText={t => { setShopName(t); setError(''); }}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleRegister}
            />

            {error
              ? <View style={styles.errorRow}>
                  <Feather name="alert-circle" size={14} color="#EF4444" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              : null
            }

            <TouchableOpacity
              style={[styles.btn, (!shopName.trim() || loading) && styles.btnDisabled]}
              onPress={handleRegister}
              disabled={!shopName.trim() || loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Feather name="check" size={18} color="#fff" />
                    <Text style={styles.btnText}>Create My Shop</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#0F172A', borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    paddingBottom: 32, paddingHorizontal: 24,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#1E293B',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  headerSub: { color: '#64748B', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
  headerTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '800' },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 24 },
  infoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#EFF6FF', borderRadius: 14, padding: 14, marginBottom: 20,
  },
  infoText: { flex: 1, color: '#3B82F6', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stepDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#E2E8F0' },
  stepDotActive: { backgroundColor: '#3B82F6', width: 28, borderRadius: 6 },
  stepDotDone: { backgroundColor: '#10B981' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#E2E8F0', marginHorizontal: 6 },
  stepLineDone: { backgroundColor: '#10B981' },
  stepLabel: { color: '#64748B', fontSize: 13, fontWeight: '600', marginBottom: 20 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, marginBottom: 16,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: '#EFF6FF',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 6 },
  cardSub: { fontSize: 14, color: '#64748B', fontWeight: '500', marginBottom: 24, lineHeight: 20 },
  dotsRow: { flexDirection: 'row', gap: 14, justifyContent: 'center', marginBottom: 16 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#3B82F6', backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: '#3B82F6' },
  dotError: { borderColor: '#EF4444' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },
  hint: { color: '#94A3B8', fontSize: 12, textAlign: 'center', fontWeight: '500' },
  hiddenInput: { position: 'absolute', width: 0, height: 0, opacity: 0 },
  shopInput: {
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14,
    paddingHorizontal: 18, paddingVertical: 16,
    backgroundColor: '#F8FAFC', color: '#0F172A',
    fontSize: 17, fontWeight: '600', marginBottom: 12,
  },
  btn: {
    backgroundColor: '#10B981', borderRadius: 16, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4, marginTop: 8,
  },
  btnDisabled: { backgroundColor: '#CBD5E1', shadowOpacity: 0 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});