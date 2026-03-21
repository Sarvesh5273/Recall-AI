import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, ActivityIndicator, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import Fuse from 'fuse.js';

import { API_BASE_URL } from '@env';
import { useAuth } from '../context/AuthContext';
import { database } from '../database';

// master_seed.json removed — catalog now lives in WatermelonDB, synced from backend on login

export default function MatchModal({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { rawText, itemId, quantity, unit } = route.params || { rawText: 'Unknown', itemId: '', quantity: 1, unit: 'unit' };
  const { token, shopId } = useAuth();
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [editableQuantity, setEditableQuantity] = useState(quantity ? quantity.toString() : '1');
  const [catalogReady, setCatalogReady] = useState<boolean | null>(null); // null = not checked yet

  // THE HYBRID EDGE SEARCH
  // Sources: WatermelonDB catalog (synced from backend) + custom_skus (this shop)
  const handleSearch = async (text: string) => {
    setSearchQuery(text);

    if (text.length < 2) {
      setSearchResults([]);
      return;
    }

    // A. Pull catalog from WatermelonDB (synced from backend on login)
    const catalogItems = await database.get('catalog').query().fetch();
    const catalogData = catalogItems.map((c: any) => ({
      uid: c.uid,
      name: c.name,
      aliases: JSON.parse(c.aliases || '[]'),
    }));

    // If catalog is empty, sync hasn't completed yet — tell user and bail
    // They can still create a custom item below
    if (catalogData.length === 0) {
      setCatalogReady(false);
      setSearchResults([]);
      return;
    }
    setCatalogReady(true);

    // B. Pull custom items this shop has created
    const localCustoms = await database.get('custom_skus').query().fetch();
    const customData = localCustoms.map((c: any) => ({
      uid: c.uid,
      name: c.standard_name,
      aliases: [c.standard_name.toLowerCase()],
    }));

    // C. Combine — custom items first so they appear at top when matched
    const combinedData = [...customData, ...catalogData];

    // D. Fuzzy search — user is typing manually so Fuse is reliable here
    const fuse = new Fuse(combinedData, {
      keys: ['name', 'aliases'],
      threshold: 0.3,
      includeScore: true,
    });

    const results = fuse.search(text);
    setSearchResults(results.slice(0, 5).map(r => ({
      uid: r.item.uid,
      name: r.item.name,
      match_score: Math.round((1 - (r.score || 0)) * 100),
    })));
  };

  const handleSelectMatch = async (masterItem: any) => {
    if (isSyncing || !itemId) return;
    setIsSyncing(true);

    try {
      const quarantineRecord: any = await database.get('quarantine').find(itemId);
      const finalQuantity = parseFloat(editableQuantity) || 1; 

    const payload = {
        shop_id: shopId,
        uid: masterItem.uid,
        standard_name: masterItem.name,
        quantity: finalQuantity,
        unit: unit,
        scan_type: quarantineRecord.scanType || "IN",
        raw_text: rawText,
        quarantine_id: itemId   // ← add this
};

      const response = await fetch(`${API_BASE_URL}/sync-mapped-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Azure Sync Failed: ${response.status}`);

      await database.write(async () => {
        await quarantineRecord.destroyPermanently();
      });

      navigation.navigate('MainTabs', { screen: 'Inbox', merge: true });

    } catch (error: any) {
      console.error("Upstream Sync Error:", error);
      Alert.alert("Sync Failed", "Could not send the mapped item to the cloud.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateCustomItem = async () => {
    if (isSyncing || !itemId || searchQuery.trim().length < 2) return;
    setIsSyncing(true);

    try {
      const quarantineRecord: any = await database.get('quarantine').find(itemId);
      const finalQuantity = parseFloat(editableQuantity) || 1; 

      const payload = {
        shop_id: shopId,
        custom_name: searchQuery.trim(),
        quantity: finalQuantity,
        unit: unit,
        scan_type: quarantineRecord.scanType || "IN",
        raw_text: rawText   // OCR text → training signal
      };

      const response = await fetch(`${API_BASE_URL}/create-custom-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Azure Custom Creation Failed: ${response.status}`);
      
      const jsonResponse = await response.json();
      const newItemData = jsonResponse.data;

      await database.write(async () => {
        await quarantineRecord.destroyPermanently();
        
        // INSTANT CACHE UPGRADE: Add the newly created item directly to local WatermelonDB
        // so it appears in search immediately without waiting for an app restart.
        await database.get('custom_skus').create(record => {
           record._raw.id = newItemData.uid;
           (record as any).uid = newItemData.uid;
           (record as any).standard_name = newItemData.standard_name;
        });
      });

      navigation.navigate('MainTabs', { screen: 'Inbox', merge: true });

    } catch (error: any) {
      console.error("Custom Item Error:", error);
      Alert.alert("Creation Failed", "Could not create the new custom item in the cloud.");
    } finally {
      setIsSyncing(false);
    }
  };
  
  const renderMasterItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.matchCard}
      onPress={() => handleSelectMatch(item)}
      disabled={isSyncing}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.masterName}>{item.name}</Text>
      </View>
      <View style={styles.scoreBadge}>
        <Text style={styles.scoreText}>{item.match_score}% Match</Text>
      </View>
      {isSyncing ? (
        <ActivityIndicator size="small" color="#3B82F6" style={{ marginLeft: 10 }} />
      ) : (
        <Feather name="chevron-right" size={20} color="#CBD5E1" />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Map Unknown Item</Text>
        <Text style={styles.subText}>The AI read: <Text style={styles.highlight}>"{rawText}"</Text></Text>
        
        <View style={styles.correctionContainer}>
           <Text style={styles.correctionLabel}>Verify Quantity</Text>
           <View style={styles.correctionInputRow}>
             <TextInput
               style={styles.quantityInput}
               keyboardType="numeric"
               value={editableQuantity}
               onChangeText={setEditableQuantity}
               selectTextOnFocus={true} 
             />
             <Text style={styles.unitText}>{unit}</Text>
           </View>
        </View>

        <View style={styles.searchContainer}>
          <Feather name="search" size={20} color="#94A3B8" style={{ marginRight: 10 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={handleSearch}
            autoFocus={false}
            autoCapitalize="none"
          />
        </View>
      </View>

      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.uid}
        renderItem={renderMasterItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          searchQuery.trim().length >= 2 ? (
            <View style={styles.emptyContainer}>
              {/* Catalog not synced yet — shown only on very first login with slow network */}
              {catalogReady === false && (
                <View style={styles.syncWarning}>
                  <Feather name="clock" size={16} color="#F59E0B" style={{ marginRight: 6 }} />
                  <Text style={styles.syncWarningText}>
                    Catalog is loading in background.{'\n'}You can still add a custom item below.
                  </Text>
                </View>
              )}

              {catalogReady === true && searchResults.length === 0 && (
                <Text style={styles.emptyText}>No matching items found.</Text>
              )}

              <TouchableOpacity
                style={styles.createButton}
                onPress={handleCreateCustomItem}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.createButtonText}>+ Add "{searchQuery}" as New Item</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null
        }
      />

      <TouchableOpacity 
        style={[styles.cancelButton, { marginBottom: insets.bottom > 0 ? insets.bottom + 20 : 40 }]} 
        onPress={() => navigation.goBack()}
        disabled={isSyncing}
      >
        <Text style={styles.cancelText}>{isSyncing ? 'Processing...' : 'Cancel'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { padding: 24, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A', marginBottom: 4 },
  subText: { fontSize: 15, color: '#64748B', marginBottom: 20, fontWeight: '500' },
  highlight: { color: '#EF4444', fontWeight: '800' },
  correctionContainer: { backgroundColor: '#F1F5F9', padding: 16, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  correctionLabel: { fontSize: 12, fontWeight: '800', color: '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  correctionInputRow: { flexDirection: 'row', alignItems: 'center' },
  quantityInput: { backgroundColor: '#FFFFFF', width: 80, height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', fontSize: 20, fontWeight: '900', textAlign: 'center', color: '#0F172A' },
  unitText: { marginLeft: 12, fontSize: 18, fontWeight: '700', color: '#475569' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  searchInput: { flex: 1, height: 56, fontSize: 16, color: '#0F172A', fontWeight: '600' },
  list: { padding: 16 },
  matchCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 20, borderRadius: 20, marginBottom: 12, shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  masterName: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  nativeName: { fontSize: 14, color: '#64748B', marginTop: 4, fontWeight: '500' },
  scoreBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginRight: 12 },
  scoreText: { color: '#3B82F6', fontSize: 12, fontWeight: '800' },
  emptyContainer: { alignItems: 'center', marginTop: 20, paddingHorizontal: 10 },
  emptyText: { textAlign: 'center', color: '#64748B', fontSize: 14, marginBottom: 20, fontWeight: '500' },
  syncWarning: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#FDE68A', width: '100%' },
  syncWarningText: { fontSize: 13, color: '#92400E', fontWeight: '500', flex: 1, lineHeight: 18 },
  createButton: { backgroundColor: '#3B82F6', width: '100%', paddingVertical: 18, borderRadius: 16, alignItems: 'center', shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  createButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  cancelButton: { marginHorizontal: 24, marginTop: 10, paddingVertical: 18, backgroundColor: 'transparent', borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  cancelText: { fontSize: 16, fontWeight: '700', color: '#64748B' }
});