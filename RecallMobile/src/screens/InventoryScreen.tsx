import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl, Modal, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '@env';

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const { shopId } = useAuth();
  const [inventory, setInventory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [editQuantity, setEditQuantity] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchInventory = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/inventory?shop_id=${shopId}`);
      if (!response.ok) throw new Error("Failed to fetch");
      const json = await response.json();
      if (json.status === "success") setInventory(json.data);
    } catch (error) { console.error("Inventory Fetch Error:", error); } 
    finally { setIsLoading(false); setIsRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchInventory(); }, []));

  const onRefresh = () => { setIsRefreshing(true); fetchInventory(); };
  const openEditModal = (item: any) => { setSelectedItem(item); setEditQuantity(item.quantity.toString()); };
  const closeEditModal = () => { setSelectedItem(null); setEditQuantity(''); };

  const handleUpdateQuantity = async (targetQuantity: number) => {
    if (!selectedItem) return;
    setIsUpdating(true);
    try {
      const payload = { shop_id: shopId ?? "", uid: selectedItem.uid, new_quantity: targetQuantity };
      const response = await fetch(`${API_BASE_URL}/adjust-inventory`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Failed to update Azure.");
      closeEditModal();
      setIsLoading(true); 
      fetchInventory();
    } catch (error) { Alert.alert("Update Failed", "Could not save the new quantity to the cloud."); } 
    finally { setIsUpdating(false); }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isLowStock = item.quantity <= 5 && item.quantity > 0;
    const isOutOfStock = item.quantity <= 0;
    
    let stockColor = '#10B981'; 
    if (isLowStock) stockColor = '#F59E0B'; 
    if (isOutOfStock) stockColor = '#EF4444'; 

    return (
      <TouchableOpacity style={styles.card} onPress={() => openEditModal(item)}>
        <View style={styles.cardLeft}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>{item.standard_name.charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.itemName}>{item.standard_name}</Text>
            {item.uid.startsWith('custom_') && <Text style={styles.customTag}>Custom Item</Text>}
          </View>
        </View>
        
        <View style={styles.cardRight}>
          <Text style={[styles.quantityText, { color: stockColor }]}>
            {item.quantity} <Text style={styles.unitText}>{item.unit}</Text>
          </Text>
          {isLowStock && <Text style={styles.warningText}>Low Stock</Text>}
          {isOutOfStock && <Text style={styles.errorText}>Out of Stock</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.headerBackground, { paddingTop: insets.top + 20 }]}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Live Vault</Text>
          <Text style={styles.headerSub}>Total SKUs: {inventory.length}</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Syncing with Azure...</Text>
        </View>
      ) : (
        <FlatList
          data={inventory}
          keyExtractor={(item) => item.uid}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="package" size={60} color="#94A3B8" style={{ marginBottom: 16 }} />
              <Text style={styles.emptyText}>Vault is Empty</Text>
              <Text style={styles.emptySub}>Scan a wholesale invoice to build your inventory.</Text>
            </View>
          }
        />
      )}

      <Modal visible={!!selectedItem} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.bottomSheet, { paddingBottom: insets.bottom > 0 ? insets.bottom + 20 : 40 }]}>
            <View style={styles.handleBar} />
            {selectedItem && (
              <>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>{selectedItem.standard_name}</Text>
                  <Text style={styles.sheetDate}>
                    Last Updated: {new Date(selectedItem.last_updated).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </Text>
                </View>

                <Text style={styles.inputLabel}>Physical Count ({selectedItem.unit})</Text>
                <View style={styles.inputRow}>
                  <TextInput style={styles.numberInput} keyboardType="numeric" value={editQuantity} onChangeText={setEditQuantity} autoFocus={true} />
                  <Text style={styles.staticUnit}>{selectedItem.unit}</Text>
                </View>

                <View style={styles.actionRow}>
                  {/* THE GHOST BUTTON FIX */}
                  <TouchableOpacity style={[styles.btn, styles.zeroBtn]} onPress={() => handleUpdateQuantity(0)} disabled={isUpdating}>
                    <Text style={styles.zeroBtnText}>Zero Stock</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, styles.saveBtn]} onPress={() => handleUpdateQuantity(parseFloat(editQuantity))} disabled={isUpdating}>
                    {isUpdating ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Update</Text>}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.closeArea} onPress={closeEditModal} disabled={isUpdating}>
                  <Text style={styles.closeText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerBackground: { backgroundColor: '#0F172A', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingBottom: 30, marginBottom: 16 },
  headerContent: { paddingHorizontal: 24 },
  headerTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginBottom: 4 },
  headerSub: { color: '#94A3B8', fontSize: 14, fontWeight: '500' },
  loadingText: { marginTop: 12, color: '#64748B', fontSize: 14, fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 12, shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  cardLeft: { flexDirection: 'row', alignItems: 'center' },
  iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  iconText: { fontSize: 20, fontWeight: '800', color: '#3B82F6' },
  itemName: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  customTag: { fontSize: 10, color: '#64748B', alignSelf: 'flex-start', marginTop: 4, fontWeight: '700', textTransform: 'uppercase' },
  
  cardRight: { alignItems: 'flex-end' },
  quantityText: { fontSize: 24, fontWeight: '900' },
  unitText: { fontSize: 14, fontWeight: '600', color: '#94A3B8' },
  warningText: { color: '#F59E0B', fontSize: 11, fontWeight: '800', marginTop: 4, textTransform: 'uppercase' },
  errorText: { color: '#EF4444', fontSize: 11, fontWeight: '800', marginTop: 4, textTransform: 'uppercase' },
  
  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#64748B', textAlign: 'center', paddingHorizontal: 40, fontWeight: '500' },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  bottomSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 20 },
  handleBar: { width: 48, height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, alignSelf: 'center', marginBottom: 24 },
  sheetHeader: { marginBottom: 24, alignItems: 'center' },
  sheetTitle: { fontSize: 26, fontWeight: '900', color: '#0F172A' },
  sheetDate: { fontSize: 13, color: '#64748B', marginTop: 6, fontWeight: '500' },
  inputLabel: { fontSize: 12, fontWeight: '800', color: '#64748B', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 30 },
  numberInput: { flex: 1, backgroundColor: '#F8FAFC', height: 64, borderRadius: 16, fontSize: 28, fontWeight: '900', textAlign: 'center', color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0' },
  staticUnit: { fontSize: 20, fontWeight: '800', color: '#64748B', marginLeft: 16, width: 60 },
  
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  btn: { flex: 1, height: 60, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  zeroBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#EF4444', marginRight: 8 },
  zeroBtnText: { color: '#EF4444', fontWeight: '800', fontSize: 16 },
  saveBtn: { backgroundColor: '#3B82F6', marginLeft: 8 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  
  closeArea: { alignItems: 'center', marginTop: 8, paddingVertical: 12 },
  closeText: { fontSize: 16, fontWeight: '700', color: '#94A3B8' }
});