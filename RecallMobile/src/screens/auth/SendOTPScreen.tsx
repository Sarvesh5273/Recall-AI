import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL } from '@env';
import { AUTH_COLORS, AUTH_SHADOW, AUTH_SIZE } from './authDesign';

export default function SendOTPScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
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
      navigation.replace('VerifyOTP', { phone, mode: 'register' });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingBottom: insets.bottom + 24 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" backgroundColor={AUTH_COLORS.background} />
      <View style={[styles.topSection, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.appName}>Recall AI</Text>
        <Image
          source={require('../../assets/kirana_illustration.png')}
          style={styles.illustration}
          resizeMode="contain"
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.heading}>Register Your Shop</Text>
        <Text style={styles.subtitle}>Enter your mobile number</Text>

        <View style={styles.phoneRow}>
          <View style={styles.phonePrefix}>
            <Text style={styles.phonePrefixText}>🇮🇳 +91</Text>
          </View>
          <TextInput
            style={styles.phoneInput}
            placeholder="Enter 10 digit number"
            placeholderTextColor={AUTH_COLORS.inputPlaceholder}
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

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, (!isValid || loading) && styles.primaryButtonDisabled]}
          onPress={handleSendOTP}
          disabled={!isValid || loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color={AUTH_COLORS.primaryTextOnPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>Send OTP</Text>
          )}
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.bottomLink}
        onPress={() => navigation.replace('Login')}
        activeOpacity={0.85}
      >
        <Text style={styles.bottomLinkText}>Already registered? Login</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AUTH_COLORS.background,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'center',
  },
  appName: {
    color: AUTH_COLORS.appName,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 12,
  },
  illustration: {
    width: '100%',
    height: 180,
    marginBottom: 0,
  },
  card: {
    backgroundColor: AUTH_COLORS.card,
    borderRadius: AUTH_SIZE.cardRadius,
    padding: AUTH_SIZE.cardPadding,
    ...AUTH_SHADOW,
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
  phoneRow: {
    height: AUTH_SIZE.inputHeight,
    minHeight: AUTH_SIZE.minTouchTarget,
    backgroundColor: AUTH_COLORS.inputBackground,
    borderWidth: 1,
    borderColor: AUTH_COLORS.inputBorder,
    borderRadius: AUTH_SIZE.inputRadius,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  phonePrefix: {
    height: '100%',
    minWidth: 92,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: AUTH_COLORS.inputBorder,
    paddingHorizontal: 10,
  },
  phonePrefixText: {
    color: AUTH_COLORS.inputText,
    fontSize: 14,
    fontWeight: '600',
  },
  phoneInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 14,
    color: AUTH_COLORS.inputText,
    fontSize: 18,
    fontWeight: '600',
  },
  errorText: {
    color: AUTH_COLORS.error,
    fontSize: 13,
    marginTop: 10,
    marginBottom: 2,
  },
  primaryButton: {
    width: '100%',
    height: AUTH_SIZE.buttonHeight,
    minHeight: AUTH_SIZE.minTouchTarget,
    borderRadius: AUTH_SIZE.buttonRadius,
    backgroundColor: AUTH_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: AUTH_COLORS.primaryTextOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  bottomLink: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  bottomLinkText: {
    color: AUTH_COLORS.link,
    fontSize: 15,
    fontWeight: '600',
  },
});
