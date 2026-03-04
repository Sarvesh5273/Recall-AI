import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL } from '@env';

// THE ENTERPRISE UX BADGE
import SyncBadge from '../components/SyncBadge';

export default function HomeScreen({ navigation }: any) {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ totalItems: 0, lowStock: 0, outOfStock: 0 });
  const insets = useSafeAreaInsets();
  
  const openCamera = (type: string) => {
    navigation.navigate('Camera', { type: type });
  };

  const fetchDashboardStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/inventory?shop_id=shop_10065`);
      if (!response.ok) throw new Error("Failed to fetch vault data");
      
      const json = await response.json();
      if (json.status === "success") {
        const items = json.data;
        const low = items.filter((i: any) => i.quantity <= 5 && i.quantity > 0).length;
        const out = items.filter((i: any) => i.quantity <= 0).length;

        setStats({ totalItems: items.length, lowStock: low, outOfStock: out });
      }
    } catch (error) {
      console.error("Dashboard Fetch Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchDashboardStats(); }, []));

  return (
    <View style={styles.container}>
      <View style={[styles.headerBackground, { paddingTop: insets.top + 20 }]}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.welcomeText}>Welcome Back</Text>
            <Text style={styles.ownerName}>Sarvesh (Admin)</Text>
            <Text style={styles.shopDetails}>Pune Kirana Center • ID: 10065</Text>
          </View>
          
          {/* THE SYNC BADGE MOUNTED SIDEWISE */}
          <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
            <SyncBadge />
          </View>
        </View>
      </View>

      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        <View style={styles.mainActionsContainer}>
          <TouchableOpacity style={[styles.actionCard, { marginRight: 8 }]} onPress={() => openCamera('IN')}>
            <View style={[styles.actionIconBg, { backgroundColor: '#F0FDF4' }]}>
              <Feather name="download" size={32} color="#10B981" />
            </View>
            <Text style={styles.actionCardTitle}>Restock</Text>
            <Text style={styles.actionCardSub}>Scan Invoice</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionCard, { marginLeft: 8 }]} onPress={() => openCamera('OUT')}>
            <View style={[styles.actionIconBg, { backgroundColor: '#EFF6FF' }]}>
              <Feather name="upload" size={32} color="#3B82F6" />
            </View>
            <Text style={styles.actionCardTitle}>Sale (Out)</Text>
            <Text style={styles.actionCardSub}>Scan Ledger</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.listContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Business Health</Text>
            <Feather name="trending-up" size={18} color="#64748B" />
          </View>
          
          {isLoading ? (
            <ActivityIndicator size="small" color="#3B82F6" style={{ marginVertical: 20 }} />
          ) : (
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{stats.totalItems.toString()}</Text>
                <Text style={styles.statLabel}>Total SKUs</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={[styles.statNumber, { color: '#F59E0B' }]}>{stats.lowStock.toString()}</Text>
                <Text style={styles.statLabel}>Low Stock</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={[styles.statNumber, { color: '#EF4444' }]}>{stats.outOfStock.toString()}</Text>
                <Text style={styles.statLabel}>Zero Stock</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.listContainer}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          
          <View style={styles.listItem}>
            <View style={styles.listIcon}>
              <Feather name="file-text" size={18} color="#475569" />
            </View>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>Ledger Upload</Text>
              <Text style={styles.listSub}>Processing via AI Engine</Text>
            </View>
            <Text style={styles.listDate}>Just Now</Text>
          </View>

          <View style={[styles.listItem, { borderBottomWidth: 0 }]}>
            <View style={styles.listIcon}>
              <Feather name="cloud" size={18} color="#475569" />
            </View>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>System Boot</Text>
              <Text style={styles.listSub}>Azure Cloud Connected</Text>
            </View>
            <Text style={styles.listDate}>Today</Text>
          </View>
        </View>
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  headerBackground: { backgroundColor: '#0F172A', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingBottom: 45 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, alignItems: 'center' },
  welcomeText: { color: '#94A3B8', fontSize: 13, marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '600' },
  ownerName: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginBottom: 2 },
  shopDetails: { color: '#64748B', fontSize: 13, fontWeight: '500' },
  scrollArea: { flex: 1, marginTop: -25, paddingHorizontal: 16 },
  mainActionsContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  actionCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 24, paddingVertical: 24, alignItems: 'center', shadowColor: '#64748B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  actionIconBg: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  actionCardTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  actionCardSub: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  listContainer: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, marginBottom: 16, shadowColor: '#64748B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  listItem: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingVertical: 16 },
  listIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  listBody: { flex: 1 },
  listTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  listSub: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  listDate: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statBox: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 32, fontWeight: '900', color: '#0F172A', marginBottom: 6 },
  statLabel: { fontSize: 11, color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: 1, height: 40, backgroundColor: '#E2E8F0' }
});