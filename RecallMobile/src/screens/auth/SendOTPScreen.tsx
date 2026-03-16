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
  ScrollView,
  StatusBar,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
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
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" backgroundColor={AUTH_COLORS.background} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.replace('Login');
            }}
            activeOpacity={0.85}
          >
            <Feather name="arrow-left" size={20} color={AUTH_COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.appName}>Recall AI</Text>
          <View style={styles.topBarSpacer} />
        </View>

        <Image
          source={require('../../assets/kirana_illustration.gif')}
          style={{ width: 240, height: 240 }}
          resizeMode="contain"
        />

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
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 26,
  },
  backButton: {
    width: AUTH_SIZE.minTouchTarget,
    height: AUTH_SIZE.minTouchTarget,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AUTH_COLORS.card,
    borderWidth: 1,
    borderColor: AUTH_COLORS.inputBorder,
  },
  appName: {
    color: AUTH_COLORS.appName,
    fontSize: AUTH_SIZE.appNameSize,
    fontWeight: '700',
  },
  topBarSpacer: {
    width: AUTH_SIZE.minTouchTarget,
    height: AUTH_SIZE.minTouchTarget,
  },
  illustration: {
    width: '100%',
    height: 160,
    marginBottom: 28,
  },
  illustrationPlaceholder: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    backgroundColor: AUTH_COLORS.illustrationPlaceholder,
    marginBottom: 28,
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
    minHeight: AUTH_SIZE.minTouchTarget,
    marginTop: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
  },
  bottomLinkText: {
    color: AUTH_COLORS.link,
    fontSize: 15,
    fontWeight: '600',
  },
});
