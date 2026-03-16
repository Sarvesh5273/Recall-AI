import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import withObservables from '@nozbe/with-observables';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { database } from '../database';
import { useLanguage } from '../context/LanguageContext';
import Quarantine from '../database/Quarantine';

function InboxScreen({ quarantinedItems, navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  useEffect(() => {
    if (route.params?.resolvedItemId) {
      const idToRemove = route.params.resolvedItemId;
      const deleteItem = async () => {
        try {
          const itemToDestroy = await database.get<Quarantine>('quarantine').find(idToRemove);
          await database.write(async () => { await itemToDestroy.destroyPermanently(); });
        } catch (error) { console.error("Failed to delete item from DB", error); }
      };
      deleteItem();
      navigation.setParams({ resolvedItemId: undefined });
    }
  }, [route.params?.resolvedItemId]);

  const handleResolve = async (item: Quarantine, action: string) => {
    if (action === 'MATCH') {
      navigation.navigate('MatchModal', { itemId: item.id, rawText: item.rawText, quantity: item.quantity, unit: item.unit });
    } else {
      try {
        const itemToDestroy = await database.get<Quarantine>('quarantine').find(item.id);
        await database.write(async () => { await itemToDestroy.destroyPermanently(); });
      } catch (error) { console.error("Error discarding item", error); }
    }
  };

  const renderItem = ({ item }: { item: Quarantine }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.badgeRow}>
          <Text style={styles.timeText}>
            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <View style={styles.typeBadge}>
            <Feather name={item.scanType === 'IN' ? "download" : "upload"} size={12} color="#64748B" style={{ marginRight: 4 }} />
            <Text style={styles.typeText}>{item.scanType === 'IN' ? 'Restock' : 'Sale'}</Text>
          </View>
        </View>
        <Text style={styles.warningTag}>{t('inbox_needs_review')}</Text>
      </View>
      
      <Text style={styles.rawTextTitle}>{t('inbox_ai_extracted')}</Text>
      <Text style={styles.rawText}>
        "{item.rawText}" <Text style={styles.quantityText}>({item.quantity} {item.unit})</Text>
      </Text>

      <View style={styles.buttonRow}>
        {/* THE GHOST BUTTON FIX */}
        <TouchableOpacity style={[styles.actionButton, styles.discardButton]} onPress={() => handleResolve(item, 'DISCARD')}>
          <Text style={styles.discardButtonText}>{t('inbox_delete')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionButton, styles.matchButton]} onPress={() => handleResolve(item, 'MATCH')}>
          <Text style={styles.matchButtonText}>{t('inbox_map')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.headerBackground, { paddingTop: insets.top + 20 }]}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{t('inbox_title')}</Text>
          <Text style={styles.headerSub}>{t('inbox_subtitle')}</Text>
        </View>
      </View>

      {quarantinedItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="check-circle" size={60} color="#3B82F6" style={{ marginBottom: 16 }} />
          <Text style={styles.emptyText}>{t('inbox_empty')}</Text>
          <Text style={styles.emptySub}>{t('inbox_empty_sub')}</Text>
        </View>
      ) : (
        <FlatList
          data={quarantinedItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F3F0' }, 
  headerBackground: { backgroundColor: '#0F172A', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingBottom: 30 },
  headerContent: { paddingHorizontal: 24 },
  headerTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginBottom: 4 },
  headerSub: { color: '#94A3B8', fontSize: 14, fontWeight: '500' },
  listContent: { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 16 },
  
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 16, shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4, borderLeftWidth: 4, borderLeftColor: '#F59E0B' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  badgeRow: { flexDirection: 'row', alignItems: 'center' },
  timeText: { color: '#64748B', fontSize: 12, marginRight: 12, fontWeight: '600' },
  typeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#F1F5F9' },
  typeText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', color: '#64748B' },
  warningTag: { color: '#F59E0B', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  
  rawTextTitle: { color: '#94A3B8', fontSize: 12, marginBottom: 4, fontWeight: '600', textTransform: 'uppercase' },
  rawText: { color: '#0F172A', fontSize: 22, fontWeight: '800', marginBottom: 24 },
  quantityText: { color: '#3B82F6', fontSize: 18, fontWeight: '600' },
  
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  discardButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#EF4444', marginRight: 8 },
  discardButtonText: { color: '#EF4444', fontWeight: '800', fontSize: 14 },
  matchButton: { backgroundColor: '#3B82F6', marginLeft: 8 },
  matchButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#0F172A', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  emptySub: { color: '#64748B', fontSize: 14, fontWeight: '500' }
});

const enhance = withObservables([], () => ({
  quarantinedItems: database.collections.get<Quarantine>('quarantine').query().observe(),
}));
export default enhance(InboxScreen);
