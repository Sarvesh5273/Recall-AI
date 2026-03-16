import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { API_BASE_URL } from '@env';
import { useAuth } from '../../context/AuthContext';
import { AUTH_COLORS, AUTH_SHADOW, AUTH_SIZE } from './authDesign';

const OTP_LENGTH = 6;

export default function VerifyOTPScreen({ route, navigation }: any) {
  const { phone, mode } = route.params;
  const { login } = useAuth();
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const [otp, setOtp] = useState(Array.from({ length: OTP_LENGTH }, () => ''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(30);
  const [focusedIndex, setFocusedIndex] = useState(0);

  useEffect(() => {
    if (resendTimer <= 0) {
      return;
    }
    const timer = setTimeout(() => setResendTimer(current => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer]);

  const resetOtp = () => {
    setOtp(Array.from({ length: OTP_LENGTH }, () => ''));
    setFocusedIndex(0);
    inputRefs.current[0]?.focus();
  };

  const handleOtpChange = (value: string, index: number) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const nextOtp = [...otp];
    nextOtp[index] = digit;
    setOtp(nextOtp);
    setError('');

    if (digit && index < OTP_LENGTH - 1) {
      const nextIndex = index + 1;
      setFocusedIndex(nextIndex);
      inputRefs.current[nextIndex]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key !== 'Backspace') {
      return;
    }

    if (otp[index]) {
      const nextOtp = [...otp];
      nextOtp[index] = '';
      setOtp(nextOtp);
      return;
    }

    if (index > 0) {
      const previousIndex = index - 1;
      const nextOtp = [...otp];
      nextOtp[previousIndex] = '';
      setOtp(nextOtp);
      setFocusedIndex(previousIndex);
      inputRefs.current[previousIndex]?.focus();
    }
  };

  const handleVerify = async () => {
    const otpCode = otp.join('');
    if (otpCode.length !== OTP_LENGTH || loading) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp: otpCode }),
      });
      const json = await res.json();

      if (res.ok) {
        await login(json.token, json.shop_id, json.shop_name);
        return;
      }

      if (res.status === 404 && json.detail === 'NOT_REGISTERED') {
        if (mode === 'login') {
          setError('Number not registered. Please register first.');
          resetOtp();
        } else {
          navigation.replace('SetPIN', { phone, otp: otpCode });
        }
        return;
      }

      if (res.status === 409 && json.detail === 'ALREADY_REGISTERED') {
        setError('Number already registered. Switch to Login.');
        resetOtp();
        return;
      }

      setError(json.detail || 'Invalid OTP. Try again.');
      resetOtp();
    } catch {
      setError('Connection failed. Check your network.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) {
      return;
    }
    setResendTimer(30);
    setError('');
    resetOtp();
    try {
      await fetch(`${API_BASE_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
    } catch {
      setError('Unable to resend OTP right now. Please try again.');
    }
  };

  const maskedPhone = `+91 ••••${phone.slice(-4)}`;
  const activeIndex = focusedIndex;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" backgroundColor={AUTH_COLORS.background} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.85}
        >
          <Feather name="arrow-left" size={20} color={AUTH_COLORS.primary} />
        </TouchableOpacity>

        <Text style={styles.heading}>Verify Number</Text>
        <Text style={styles.subtitle}>6-digit OTP sent to {maskedPhone}</Text>

        <View style={styles.card}>
          <View style={styles.otpRow}>
            {otp.map((digit, index) => (
              <TextInput
                key={`otp-${index}`}
                ref={ref => {
                  inputRefs.current[index] = ref;
                }}
                style={[
                  styles.otpBox,
                  index === activeIndex && styles.otpBoxActive,
                  digit && styles.otpBoxFilled,
                ]}
                value={digit}
                onChangeText={value => handleOtpChange(value, index)}
                onKeyPress={event => handleKeyPress(event, index)}
                onFocus={() => setFocusedIndex(index)}
                keyboardType="number-pad"
                maxLength={1}
                autoFocus={index === 0}
                editable={!loading}
                textAlign="center"
              />
            ))}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryButton, (otp.join('').length !== OTP_LENGTH || loading) && styles.primaryButtonDisabled]}
            onPress={handleVerify}
            disabled={otp.join('').length !== OTP_LENGTH || loading}
            activeOpacity={0.9}
          >
            {loading ? (
              <ActivityIndicator color={AUTH_COLORS.primaryTextOnPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>Verify OTP</Text>
            )}
          </TouchableOpacity>

          <View style={styles.resendRow}>
            {resendTimer > 0 ? (
              <Text style={styles.countdownText}>Resend OTP in {resendTimer}s</Text>
            ) : (
              <TouchableOpacity
                onPress={handleResend}
                activeOpacity={0.85}
                style={styles.resendButton}
              >
                <Text style={styles.resendText}>Resend OTP</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AUTH_COLORS.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  backButton: {
    width: AUTH_SIZE.minTouchTarget,
    height: AUTH_SIZE.minTouchTarget,
    borderRadius: 24,
    backgroundColor: AUTH_COLORS.card,
    borderWidth: 1,
    borderColor: AUTH_COLORS.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heading: {
    color: AUTH_COLORS.heading,
    fontSize: AUTH_SIZE.headingSize,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: AUTH_COLORS.subtitle,
    fontSize: AUTH_SIZE.subtitleSize,
    fontWeight: '400',
    marginBottom: 24,
  },
  card: {
    backgroundColor: AUTH_COLORS.card,
    borderRadius: AUTH_SIZE.cardRadius,
    padding: AUTH_SIZE.cardPadding,
    ...AUTH_SHADOW,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  otpBox: {
    width: 44,
    height: 52,
    minHeight: AUTH_SIZE.minTouchTarget,
    marginHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: AUTH_COLORS.inputBorder,
    backgroundColor: AUTH_COLORS.inputBackground,
    color: AUTH_COLORS.inputText,
    fontSize: 24,
    fontWeight: '800',
    padding: 0,
  },
  otpBoxActive: {
    borderColor: AUTH_COLORS.primary,
    borderWidth: 2,
  },
  otpBoxFilled: {
    color: AUTH_COLORS.inputText,
  },
  errorText: {
    color: AUTH_COLORS.error,
    fontSize: 13,
    marginBottom: 8,
  },
  primaryButton: {
    width: '100%',
    height: AUTH_SIZE.buttonHeight,
    minHeight: AUTH_SIZE.minTouchTarget,
    borderRadius: AUTH_SIZE.buttonRadius,
    backgroundColor: AUTH_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: AUTH_COLORS.primaryTextOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  resendRow: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: AUTH_SIZE.minTouchTarget,
  },
  countdownText: {
    color: AUTH_COLORS.subtitle,
    fontSize: 14,
  },
  resendButton: {
    minHeight: AUTH_SIZE.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendText: {
    color: AUTH_COLORS.link,
    fontWeight: '600',
    fontSize: 15,
  },
});
