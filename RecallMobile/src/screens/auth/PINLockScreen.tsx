import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { AUTH_COLORS, AUTH_SHADOW, AUTH_SIZE } from './authDesign';

const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

export default function PINLockScreen() {
  const { logout, setPinVerified, shopName } = useAuth();
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const [pinDigits, setPinDigits] = useState(Array.from({ length: PIN_LENGTH }, () => ''));
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (lockoutRemaining <= 0) {
      return;
    }
    const timer = setTimeout(() => {
      setLockoutRemaining(current => current - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [lockoutRemaining]);

  useEffect(() => {
    if (lockoutRemaining === 0 && attempts >= MAX_ATTEMPTS) {
      setAttempts(0);
      setError('');
      setPinDigits(Array.from({ length: PIN_LENGTH }, () => ''));
    }
  }, [lockoutRemaining, attempts]);

  const focusInput = (index: number) => {
    setFocusedIndex(index);
    inputRefs.current[index]?.focus();
  };

  const clearPin = () => {
    setPinDigits(Array.from({ length: PIN_LENGTH }, () => ''));
    setTimeout(() => focusInput(0), 80);
  };

  const playShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  };

  const checkPin = async (enteredPin: string) => {
    if (isChecking || lockoutRemaining > 0) {
      return;
    }
    setIsChecking(true);
    try {
      const storedPin = await AsyncStorage.getItem('recall_pin');
      if (enteredPin === storedPin) {
        setPinVerified();
        return;
      }

      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      playShake();

      if (nextAttempts >= MAX_ATTEMPTS) {
        setLockoutRemaining(LOCKOUT_SECONDS);
        setError(`Too many attempts — please wait ${LOCKOUT_SECONDS}s`);
      } else {
        setError('Incorrect PIN');
      }
      clearPin();
    } finally {
      setIsChecking(false);
    }
  };

  const handleDigitChange = (rawValue: string, index: number) => {
    if (lockoutRemaining > 0 || isChecking) {
      return;
    }
    const digit = rawValue.replace(/\D/g, '').slice(-1);
    const nextDigits = [...pinDigits];
    nextDigits[index] = digit;
    setPinDigits(nextDigits);
    setError('');

    if (digit && index < PIN_LENGTH - 1) {
      focusInput(index + 1);
    }

    if (nextDigits.every(Boolean)) {
      setTimeout(() => checkPin(nextDigits.join('')), 80);
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key !== 'Backspace' || lockoutRemaining > 0 || isChecking) {
      return;
    }
    const nextDigits = [...pinDigits];
    if (nextDigits[index]) {
      nextDigits[index] = '';
      setPinDigits(nextDigits);
      return;
    }
    if (index > 0) {
      nextDigits[index - 1] = '';
      setPinDigits(nextDigits);
      focusInput(index - 1);
    }
  };

  const handleForgotPin = async () => {
    await logout();
  };

  const subtitle = shopName?.trim() ? shopName : 'Enter your PIN to continue';
  const lockoutText =
    lockoutRemaining > 0 ? `Too many attempts — please wait ${lockoutRemaining}s` : error;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" backgroundColor={AUTH_COLORS.background} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.appName}>Recall AI</Text>

        <View style={styles.card}>
          <Text style={styles.heading}>Welcome back</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <Animated.View style={[styles.pinRow, { transform: [{ translateX: shakeAnim }] }]}>
            {pinDigits.map((digit, index) => (
              <TextInput
                key={`pin-lock-${index}`}
                ref={ref => {
                  inputRefs.current[index] = ref;
                }}
                style={[
                  styles.pinBox,
                  focusedIndex === index && styles.pinBoxActive,
                ]}
                value={digit}
                onChangeText={value => handleDigitChange(value, index)}
                onKeyPress={event => handleKeyPress(event, index)}
                onFocus={() => setFocusedIndex(index)}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={1}
                autoFocus={index === 0}
                editable={lockoutRemaining <= 0 && !isChecking}
                textAlign="center"
              />
            ))}
          </Animated.View>

          {lockoutText ? <Text style={styles.errorText}>{lockoutText}</Text> : null}
        </View>

        <TouchableOpacity
          style={styles.forgotLink}
          onPress={handleForgotPin}
          activeOpacity={0.85}
        >
          <Text style={styles.forgotLinkText}>Forgot PIN?</Text>
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
    paddingTop: 56,
    paddingBottom: 24,
  },
  appName: {
    alignSelf: 'center',
    color: AUTH_COLORS.appName,
    fontSize: AUTH_SIZE.appNameSize,
    fontWeight: '700',
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
    marginBottom: 20,
  },
  pinRow: {
    flexDirection: 'row',
    justifyContent: 'center',
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
  errorText: {
    color: AUTH_COLORS.error,
    fontSize: 14,
    marginTop: 12,
  },
  forgotLink: {
    minHeight: AUTH_SIZE.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  forgotLinkText: {
    color: AUTH_COLORS.link,
    fontSize: 13,
    fontWeight: '600',
  },
});
