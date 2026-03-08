import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import SyncBadge from '../components/SyncBadge';

const PLAN_LABELS: Record<string, string> = {
  free: 'Free Plan',
  basic: 'Basic Plan',
  pro: 'Pro Plan',
};

const PLAN_COLORS: Record<string, string> = {
  free: '#64748B',
  basic: '#3B82F6',
  pro: '#8B5CF6',
};

export default function HomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { shopId, shopName } = useAuth();
  const { t } = useLanguage();

  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ totalItems: 0, lowStock: 0, outOfStock: 0 });
  const [usage, setUsage] = useState<{
    plan: string; scans_used: number; scan_limit: number | null;
  }>({ plan: 'free', scans_used: 0, scan_limit: 60 });

  const openCamera = (type: string) => navigation.navigate('Camera', { type });

  const fetchDashboardData = async () => {
    try {
      const token = await AsyncStorage.getItem('recall_token');
      const headers: any = token ? { Authorization: `Bearer ${token}` } : {};

      const [inventoryRes, usageRes] = await Promise.all([
        fetch(`${API_BASE_URL}/inventory?shop_id=${shopId}`, { headers }),
        fetch(`${API_BASE_URL}/auth/usage`, { headers }),
      ]);

      if (inventoryRes.ok) {
        const json = await inventoryRes.json();
        if (json.status === 'success') {
          const items = json.data;
          setStats({
            totalItems: items.length,
            lowStock: items.filter((i: any) => i.quantity <= 5 && i.quantity > 0).length,
            outOfStock: items.filter((i: any) => i.quantity <= 0).length,
          });
        }
      }

      if (usageRes.ok) {
        const json = await usageRes.json();
        if (json.status === 'success') {
          setUsage({
            plan: json.plan,
            scans_used: json.scans_used,
            scan_limit: json.scan_limit,
          });
        }
      }
    } catch (error) {
      console.error('Dashboard Fetch Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setIsLoading(true); // reset so spinner shows on re-focus
    const timer = setTimeout(() => fetchDashboardData(), 2000);
    return () => clearTimeout(timer);
  }, [shopId]));

  // Scan usage bar logic
  const scanLimit = usage.scan_limit;
  const scansUsed = usage.scans_used;
  const isUnlimited = scanLimit === null;
  const usagePercent = isUnlimited ? 0 : Math.min((scansUsed / scanLimit!) * 100, 100);
  const isNearLimit = !isUnlimited && scansUsed >= (scanLimit! * 0.75);
  const isAtLimit = !isUnlimited && scansUsed >= scanLimit!;

  const barColor = isAtLimit ? '#EF4444' : isNearLimit ? '#F59E0B' : '#3B82F6';

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <View style={styles.headerContent}>
          <View style={{ flex: 1 }}>
            <Text style={styles.welcomeText}>{t('home_greeting')}</Text>
            <Text style={styles.ownerName}>{shopName ?? 'Shop Owner'}</Text>
            <View style={styles.planBadge}>
              <View style={[styles.planDot, { backgroundColor: PLAN_COLORS[usage.plan] ?? '#64748B' }]} />
              <Text style={styles.planLabel}>{PLAN_LABELS[usage.plan] ?? 'Free Plan'}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
            <SyncBadge />
          </View>
        </View>
      </View>

      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>

        {/* SCAN USAGE CARD */}
        <View style={styles.card}>
          <View style={styles.usageRow}>
            <View>
              <Text style={styles.usageTitle}>{t('home_scans_used')}</Text>
              <Text style={styles.usageCount}>
                {isLoading
                  ? '...'
                  : isUnlimited
                    ? `${scansUsed} used`
                    : `${scansUsed} / ${scanLimit} used`
                }
              </Text>
            </View>
            {isAtLimit && (
              <TouchableOpacity style={styles.upgradeBtn}>
                <Text style={styles.upgradeBtnText}>{t('home_upgrade')}</Text>
              </TouchableOpacity>
            )}
            {!isAtLimit && isNearLimit && (
              <View style={styles.warningBadge}>
                <Feather name="alert-triangle" size={12} color="#F59E0B" />
                <Text style={styles.warningText}>{t('home_low_stock')}</Text>
              </View>
            )}
            {isUnlimited && (
              <View style={styles.unlimitedBadge}>
                <Feather name="zap" size={12} color="#8B5CF6" />
                <Text style={styles.unlimitedText}>{t('home_unlimited')}</Text>
              </View>
            )}
          </View>

          {!isUnlimited && (
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${usagePercent}%`, backgroundColor: barColor }]} />
            </View>
          )}

          {isAtLimit && (
            <Text style={styles.limitMsg}>
              You've reached your {scanLimit} scan limit. Upgrade to Basic (₹199/month) for 300 scans.
            </Text>
          )}
          {isNearLimit && !isAtLimit && (
            <Text style={styles.nearLimitMsg}>
              {scanLimit! - scansUsed} scans remaining this month.
            </Text>
          )}
        </View>

        {/* SCAN ACTIONS */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionCard, { marginRight: 8 }, isAtLimit && styles.actionDisabled]}
            onPress={() => !isAtLimit && openCamera('IN')}
            activeOpacity={isAtLimit ? 1 : 0.8}
          >
            <View style={[styles.actionIconBg, { backgroundColor: isAtLimit ? '#F1F5F9' : '#F0FDF4' }]}>
              <Feather name="download" size={32} color={isAtLimit ? '#94A3B8' : '#10B981'} />
            </View>
            <Text style={[styles.actionTitle, isAtLimit && { color: '#94A3B8' }]}>{t('home_scan_restock').split(' ')[0]}</Text>
            <Text style={styles.actionSub}>{t('home_scan_restock')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { marginLeft: 8 }, isAtLimit && styles.actionDisabled]}
            onPress={() => !isAtLimit && openCamera('OUT')}
            activeOpacity={isAtLimit ? 1 : 0.8}
          >
            <View style={[styles.actionIconBg, { backgroundColor: isAtLimit ? '#F1F5F9' : '#EFF6FF' }]}>
              <Feather name="upload" size={32} color={isAtLimit ? '#94A3B8' : '#3B82F6'} />
            </View>
            <Text style={[styles.actionTitle, isAtLimit && { color: '#94A3B8' }]}>{t('home_scan_sale')}</Text>
            <Text style={styles.actionSub}>{t('home_scan_sale')}</Text>
          </TouchableOpacity>
        </View>

        {/* BUSINESS HEALTH */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('home_total_items').replace('Total ', '')}{' Health'}</Text>
            <Feather name="trending-up" size={18} color="#64748B" />
          </View>

          {isLoading ? (
            <ActivityIndicator size="small" color="#3B82F6" style={{ marginVertical: 20 }} />
          ) : (
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{stats.totalItems}</Text>
                <Text style={styles.statLabel}>{t('home_total_items')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={[styles.statNumber, { color: '#F59E0B' }]}>{stats.lowStock}</Text>
                <Text style={styles.statLabel}>{t('home_low_stock')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={[styles.statNumber, { color: '#EF4444' }]}>{stats.outOfStock}</Text>
                <Text style={styles.statLabel}>{t('home_out_of_stock')}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#0F172A', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingBottom: 45,
  },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, alignItems: 'center' },
  welcomeText: { color: '#94A3B8', fontSize: 13, marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '600' },
  ownerName: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  planBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planDot: { width: 8, height: 8, borderRadius: 4 },
  planLabel: { color: '#64748B', fontSize: 13, fontWeight: '600' },
  scrollArea: { flex: 1, marginTop: -25, paddingHorizontal: 16 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, marginBottom: 16,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  // Usage card
  usageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  usageTitle: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  usageCount: { fontSize: 22, fontWeight: '900', color: '#0F172A' },
  upgradeBtn: {
    backgroundColor: '#3B82F6', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
  },
  upgradeBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  warningBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFBEB', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  warningText: { color: '#F59E0B', fontSize: 12, fontWeight: '700' },
  unlimitedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F5F3FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  unlimitedText: { color: '#8B5CF6', fontSize: 12, fontWeight: '700' },
  progressBg: { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  limitMsg: { marginTop: 10, fontSize: 13, color: '#EF4444', fontWeight: '600', lineHeight: 18 },
  nearLimitMsg: { marginTop: 10, fontSize: 13, color: '#F59E0B', fontWeight: '600' },
  // Actions
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  actionCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 24, paddingVertical: 24, alignItems: 'center',
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  actionDisabled: { opacity: 0.5 },
  actionIconBg: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  actionTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  actionSub: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  // Stats
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statBox: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 32, fontWeight: '900', color: '#0F172A', marginBottom: 6 },
  statLabel: { fontSize: 11, color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: 1, height: 40, backgroundColor: '#E2E8F0' },
});