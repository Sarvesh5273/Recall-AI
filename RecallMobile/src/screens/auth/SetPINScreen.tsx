import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@env';
import { useAuth } from '../../context/AuthContext';
import { AUTH_COLORS, AUTH_SHADOW, AUTH_SIZE } from './authDesign';

const PIN_LENGTH = 4;
const AUTO_SHOP_NAME = 'My Shop';

type PinGroup = 'pin' | 'confirm';

export default function SetPINScreen({ route }: any) {
  const { phone, otp } = route.params ?? {};
  const mode: 'register' | 'local' = phone && otp ? 'register' : 'local';
  const { login, setLocalPinSet, setPinVerified } = useAuth();

  const pinRefs = useRef<(TextInput | null)[]>([]);
  const confirmRefs = useRef<(TextInput | null)[]>([]);
  const confirmRevealAnim = useRef(new Animated.Value(0)).current;
  const confirmShakeAnim = useRef(new Animated.Value(0)).current;
  const successAnim = useRef(new Animated.Value(0)).current;

  const [pinDigits, setPinDigits] = useState(Array.from({ length: PIN_LENGTH }, () => ''));
  const [confirmDigits, setConfirmDigits] = useState(Array.from({ length: PIN_LENGTH }, () => ''));
  const [focusedField, setFocusedField] = useState<{ group: PinGroup; index: number }>({
    group: 'pin',
    index: 0,
  });
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const focusField = (group: PinGroup, index: number) => {
    setFocusedField({ group, index });
    if (group === 'pin') {
      pinRefs.current[index]?.focus();
      return;
    }
    confirmRefs.current[index]?.focus();
  };

  const playConfirmReveal = () => {
    setShowConfirm(true);
    Animated.timing(confirmRevealAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setTimeout(() => focusField('confirm', 0), 60);
    });
  };

  const playMismatchShake = () => {
    Animated.sequence([
      Animated.timing(confirmShakeAnim, { toValue: 8, duration: 45, useNativeDriver: true }),
      Animated.timing(confirmShakeAnim, { toValue: -8, duration: 45, useNativeDriver: true }),
      Animated.timing(confirmShakeAnim, { toValue: 6, duration: 45, useNativeDriver: true }),
      Animated.timing(confirmShakeAnim, { toValue: -6, duration: 45, useNativeDriver: true }),
      Animated.timing(confirmShakeAnim, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  };

  const playSuccessAnimation = async () =>
    new Promise<void>(resolve => {
      setShowSuccess(true);
      successAnim.setValue(0);
      Animated.sequence([
        Animated.timing(successAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(260),
      ]).start(() => resolve());
    });

  const handleDigitChange = (rawValue: string, index: number, group: PinGroup) => {
    if (loading) {
      return;
    }
    const digit = rawValue.replace(/\D/g, '').slice(-1);
    const source = group === 'pin' ? [...pinDigits] : [...confirmDigits];
    source[index] = digit;
    setError('');
    setShowSuccess(false);

    if (group === 'pin') {
      setPinDigits(source);
    } else {
      setConfirmDigits(source);
    }

    if (digit && index < PIN_LENGTH - 1) {
      focusField(group, index + 1);
    }

    if (source.every(Boolean)) {
      if (group === 'pin' && !showConfirm) {
        setTimeout(playConfirmReveal, 80);
      }
      if (group === 'confirm') {
        setTimeout(() => submitIfConfirmed(source.join('')), 80);
      }
    }
  };

  const handleKeyPress = (e: any, index: number, group: PinGroup) => {
    if (e.nativeEvent.key !== 'Backspace' || loading) {
      return;
    }
    const source = group === 'pin' ? [...pinDigits] : [...confirmDigits];
    if (source[index]) {
      source[index] = '';
    } else if (index > 0) {
      source[index - 1] = '';
      focusField(group, index - 1);
    }
    if (group === 'pin') {
      setPinDigits(source);
    } else {
      setConfirmDigits(source);
    }
  };

  const submitIfConfirmed = async (confirmedPin: string) => {
    const pin = pinDigits.join('');
    if (loading || pin.length !== PIN_LENGTH || confirmedPin.length !== PIN_LENGTH) {
      return;
    }

    if (confirmedPin !== pin) {
      setError("PINs don't match — try again");
      setConfirmDigits(Array.from({ length: PIN_LENGTH }, () => ''));
      playMismatchShake();
      setTimeout(() => focusField('confirm', 0), 150);
      return;
    }

    setLoading(true);
    setError('');

    try {
      await AsyncStorage.setItem('recall_pin', pin);

      let registerResponse: any = null;
      if (mode === 'register') {
        const res = await fetch(`${API_BASE_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone,
            otp,
            shop_name: AUTO_SHOP_NAME,
          }),
        });
        const json = await res.json();

        if (res.status === 409 && json.detail === 'ALREADY_REGISTERED') {
          throw new Error('This number is already registered. Please login.');
        }
        if (!res.ok) {
          throw new Error(json.detail || 'Registration failed');
        }
        registerResponse = json;
      }

      await playSuccessAnimation();

      if (registerResponse) {
        await login(registerResponse.token, registerResponse.shop_id, registerResponse.shop_name);
      }
      setPinVerified();
      setLocalPinSet();
    } catch (e: any) {
      setShowSuccess(false);
      setError(e.message || 'Unable to set PIN right now. Please try again.');
      setConfirmDigits(Array.from({ length: PIN_LENGTH }, () => ''));
      setTimeout(() => focusField('confirm', 0), 120);
    } finally {
      setLoading(false);
    }
  };

  const renderPinBoxes = (group: PinGroup) => {
    const digits = group === 'pin' ? pinDigits : confirmDigits;
    const refs = group === 'pin' ? pinRefs : confirmRefs;
    return (
      <View style={styles.pinRow}>
        {digits.map((digit, index) => (
          <TextInput
            key={`${group}-${index}`}
            ref={ref => {
              refs.current[index] = ref;
            }}
            style={[
              styles.pinBox,
              focusedField.group === group && focusedField.index === index && styles.pinBoxActive,
            ]}
            value={digit}
            onChangeText={value => handleDigitChange(value, index, group)}
            onKeyPress={event => handleKeyPress(event, index, group)}
            onFocus={() => setFocusedField({ group, index })}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={1}
            autoFocus={group === 'pin' && index === 0}
            editable={!loading}
            textAlign="center"
          />
        ))}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" backgroundColor={AUTH_COLORS.background} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.heading}>Set your PIN</Text>
          <Text style={styles.subtitle}>
            This PIN protects your shop — stored only on this device
          </Text>

          <Text style={styles.fieldLabel}>Enter PIN</Text>
          {renderPinBoxes('pin')}

          {showConfirm ? (
            <Animated.View
              style={[
                styles.confirmWrap,
                {
                  opacity: confirmRevealAnim,
                  transform: [
                    { translateY: confirmRevealAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
                    { translateX: confirmShakeAnim },
                  ],
                },
              ]}
            >
              <Text style={styles.fieldLabel}>Confirm PIN</Text>
              {renderPinBoxes('confirm')}
            </Animated.View>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {showSuccess ? (
            <Animated.View
              style={[
                styles.successRow,
                {
                  opacity: successAnim,
                  transform: [
                    {
                      scale: successAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.7, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Feather name="check-circle" size={22} color={AUTH_COLORS.success} />
              <Text style={styles.successText}>PIN set successfully</Text>
            </Animated.View>
          ) : null}

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={AUTH_COLORS.primary} />
            </View>
          ) : null}
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
    paddingVertical: 24,
    justifyContent: 'center',
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
    lineHeight: 24,
    marginBottom: 20,
  },
  fieldLabel: {
    color: AUTH_COLORS.heading,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  pinRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 14,
  },
  pinBox: {
    width: 56,
    height: 64,
    minHeight: AUTH_SIZE.minTouchTarget,
    marginHorizontal: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AUTH_COLORS.inputBorder,
    backgroundColor: AUTH_COLORS.inputBackground,
    color: AUTH_COLORS.inputText,
    fontSize: 28,
    fontWeight: '800',
    padding: 0,
  },
  pinBoxActive: {
    borderColor: AUTH_COLORS.primary,
    borderWidth: 2,
  },
  confirmWrap: {
    marginTop: 6,
  },
  errorText: {
    color: AUTH_COLORS.error,
    fontSize: 14,
    marginTop: 2,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  successText: {
    color: AUTH_COLORS.success,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  loadingRow: {
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: AUTH_SIZE.minTouchTarget,
  },
});
