import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { API_BASE_URL } from '@env';

export default function VerifyOTPScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { phone } = route.params;
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(30);
  const inputRefs = useRef<TextInput[]>([]);

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(r => r - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  const handleChange = (val: string, idx: number) => {
    if (!/^\d*$/.test(val)) return;
    const newOtp = [...otp];
    newOtp[idx] = val;
    setOtp(newOtp);
    setError('');
    if (val && idx < 5) inputRefs.current[idx + 1]?.focus();
    if (newOtp.every(d => d) && val) handleVerify(newOtp.join(''));
  };

  const handleKeyPress = (e: any, idx: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handleVerify = (code?: string) => {
    const otpCode = code || otp.join('');
    if (otpCode.length !== 6) return;
    navigation.replace('SetPIN', { phone, otp: otpCode });
  };

  const handleResend = async () => {
    setResendTimer(30);
    setOtp(['', '', '', '', '', '']);
    setError('');
    try {
      await fetch(`${API_BASE_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
    } catch {}
    inputRefs.current[0]?.focus();
  };

  const maskedPhone = `+91 XXXXX X${phone.slice(-4)}`;

  return (
    <View style={[styles.container]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#94A3B8" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerSub}>RECALL AI</Text>
          <Text style={styles.headerTitle}>Verify OTP</Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* Step indicator */}
        <View style={styles.stepRow}>
          <View style={[styles.stepDot, styles.stepDotDone]} />
          <View style={[styles.stepLine, styles.stepLineDone]} />
          <View style={[styles.stepDot, styles.stepDotActive]} />
          <View style={styles.stepLine} />
          <View style={styles.stepDot} />
        </View>
        <Text style={styles.stepLabel}>Step 2 of 3 — Enter OTP</Text>

        {/* Card */}
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Feather name="shield" size={28} color="#3B82F6" />
          </View>
          <Text style={styles.cardTitle}>6-Digit OTP</Text>
          <Text style={styles.cardSub}>Sent to <Text style={styles.phoneHighlight}>{maskedPhone}</Text></Text>

          {/* OTP Boxes */}
          <View style={styles.otpRow}>
            {otp.map((digit, idx) => (
              <TextInput
                key={idx}
                ref={r => { if (r) inputRefs.current[idx] = r; }}
                style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                value={digit}
                onChangeText={v => handleChange(v, idx)}
                onKeyPress={e => handleKeyPress(e, idx)}
                keyboardType="number-pad"
                maxLength={1}
                autoFocus={idx === 0}
                selectTextOnFocus
              />
            ))}
          </View>

          {error ? (
            <View style={styles.errorRow}>
              <Feather name="alert-circle" size={14} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Resend */}
          <View style={styles.resendRow}>
            <Text style={styles.resendText}>Didn't receive it? </Text>
            {resendTimer > 0
              ? <Text style={styles.resendTimer}>Resend in {resendTimer}s</Text>
              : <TouchableOpacity onPress={handleResend}>
                  <Text style={styles.resendBtn}>Resend OTP</Text>
                </TouchableOpacity>
            }
          </View>
        </View>

        <TouchableOpacity
          style={[styles.btn, otp.join('').length < 6 && styles.btnDisabled]}
          onPress={() => handleVerify()}
          disabled={otp.join('').length < 6 || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <>
                <Text style={styles.btnText}>Verify OTP</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </>
          }
        </TouchableOpacity>

        <Text style={styles.devNote}>Dev mode: check server console for OTP</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    backgroundColor: '#0F172A',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#1E293B',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
  },
  headerSub: { color: '#64748B', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
  headerTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '800' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 24 },

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
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 6 },
  cardSub: { fontSize: 14, color: '#64748B', fontWeight: '500', marginBottom: 24 },
  phoneHighlight: { color: '#3B82F6', fontWeight: '700' },

  otpRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 20 },
  otpBox: {
    width: 46, height: 54, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    color: '#0F172A', fontSize: 22, fontWeight: '800', textAlign: 'center',
  },
  otpBoxFilled: { borderColor: '#3B82F6', backgroundColor: '#EFF6FF' },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  errorText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },

  resendRow: { flexDirection: 'row', justifyContent: 'center' },
  resendText: { color: '#64748B', fontSize: 14 },
  resendTimer: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  resendBtn: { color: '#3B82F6', fontSize: 14, fontWeight: '700' },

  btn: {
    backgroundColor: '#3B82F6', borderRadius: 16, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  btnDisabled: { backgroundColor: '#CBD5E1', shadowOpacity: 0 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  devNote: { color: '#CBD5E1', fontSize: 11, textAlign: 'center', marginTop: 16 },
});