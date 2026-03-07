import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { API_BASE_URL } from '@env';

type Mode = 'login' | 'register';

export default function SendOTPScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('login');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isValid = phone.length === 10;

  const handleSendOTP = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Failed to send OTP');
      // Pass mode so VerifyOTPScreen knows what the user intended
      // Backend still auto-detects: login-otp returns 404 if not registered
      navigation.replace('VerifyOTP', { phone, mode });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setPhone('');
    setError('');
  };

  const config = {
    login: {
      title: 'Welcome Back',
      sub: 'Enter your registered number to receive an OTP',
      btnText: 'Send OTP to Login',
      icon: 'log-in',
    },
    register: {
      title: 'Create Account',
      sub: 'Enter your number to register your shop',
      btnText: 'Send OTP to Register',
      icon: 'user-plus',
    },
  };

  const { title, sub, btnText, icon } = config[mode];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.headerSub}>RECALL AI</Text>
        <Text style={styles.headerTitle}>{title}</Text>

        {/* LOGIN / REGISTER TABS */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, mode === 'login' && styles.tabActive]}
            onPress={() => switchMode('login')}
            activeOpacity={0.8}
          >
            <Feather
              name="log-in"
              size={14}
              color={mode === 'login' ? '#FFFFFF' : '#64748B'}
            />
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>
              Login
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, mode === 'register' && styles.tabActive]}
            onPress={() => switchMode('register')}
            activeOpacity={0.8}
          >
            <Feather
              name="user-plus"
              size={14}
              color={mode === 'register' ? '#FFFFFF' : '#64748B'}
            />
            <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>
              Register
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* STEP INDICATOR — only show for register */}
        {mode === 'register' && (
          <>
            <View style={styles.stepRow}>
              <View style={[styles.stepDot, styles.stepDotActive]} />
              <View style={styles.stepLine} />
              <View style={styles.stepDot} />
              <View style={styles.stepLine} />
              <View style={styles.stepDot} />
            </View>
            <Text style={styles.stepLabel}>Step 1 of 3 — Verify your number</Text>
          </>
        )}

        {/* CARD */}
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Feather name={icon as any} size={28} color="#3B82F6" />
          </View>
          <Text style={styles.cardTitle}>Mobile Number</Text>
          <Text style={styles.cardSub}>{sub}</Text>

          <View style={styles.inputRow}>
            <View style={styles.prefixBox}>
              <Text style={styles.prefixText}>🇮🇳  +91</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Enter 10 digit number"
              placeholderTextColor="#CBD5E1"
              keyboardType="phone-pad"
              maxLength={10}
              value={phone}
              onChangeText={t => {
                setPhone(t.replace(/\D/g, ''));
                setError('');
              }}
              autoFocus
            />
          </View>

          {error ? (
            <View style={styles.errorRow}>
              <Feather name="alert-circle" size={14} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.btn, !isValid && styles.btnDisabled]}
          onPress={handleSendOTP}
          disabled={!isValid || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <>
                <Text style={styles.btnText}>{btnText}</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </>
          }
        </TouchableOpacity>

        {/* Cross-mode hint */}
        <TouchableOpacity
          style={styles.switchRow}
          onPress={() => switchMode(mode === 'login' ? 'register' : 'login')}
        >
          <Text style={styles.switchText}>
            {mode === 'login' ? "Don't have an account? " : 'Already registered? '}
          </Text>
          <Text style={styles.switchBold}>
            {mode === 'login' ? 'Register here' : 'Login here'}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#0F172A',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingBottom: 28,
    paddingHorizontal: 24,
  },
  headerSub: { color: '#64748B', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
  headerTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', marginBottom: 20 },

  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 4,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
  },
  tabActive: { backgroundColor: '#3B82F6' },
  tabText: { color: '#64748B', fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: '#FFFFFF' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40 },

  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stepDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#E2E8F0' },
  stepDotActive: { backgroundColor: '#3B82F6', width: 28, borderRadius: 6 },
  stepLine: { flex: 1, height: 2, backgroundColor: '#E2E8F0', marginHorizontal: 6 },
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

  inputRow: {
    flexDirection: 'row', borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 14, overflow: 'hidden', backgroundColor: '#F8FAFC',
  },
  prefixBox: {
    paddingHorizontal: 16, paddingVertical: 16,
    borderRightWidth: 1, borderRightColor: '#E2E8F0',
    justifyContent: 'center', backgroundColor: '#F1F5F9',
  },
  prefixText: { color: '#475569', fontSize: 15, fontWeight: '700' },
  input: {
    flex: 1, paddingHorizontal: 16, paddingVertical: 16,
    color: '#0F172A', fontSize: 20, fontWeight: '700', letterSpacing: 1.5,
  },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  errorText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },

  btn: {
    backgroundColor: '#3B82F6', borderRadius: 16, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  btnDisabled: { backgroundColor: '#CBD5E1', shadowOpacity: 0 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  switchText: { color: '#64748B', fontSize: 14 },
  switchBold: { color: '#3B82F6', fontSize: 14, fontWeight: '700' },
});