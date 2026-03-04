import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { database } from '../database';
import Quarantine from '../database/Quarantine';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [isClearing, setIsClearing] = useState(false);
  const [shopName, setShopName] = useState('Pune Kirana Center');
  const [isEditingName, setIsEditingName] = useState(false);
  const [appLanguage, setAppLanguage] = useState('English');
  const phoneNumber = "+91 98765 43210";

  const handleSaveName = () => {
    if (shopName.trim() === '') { Alert.alert("Invalid Name", "Shop name cannot be empty."); return; }
    setIsEditingName(false);
  };

  const handleChangeLanguage = () => {
    Alert.alert("Select Language", "Choose your preferred app language:", [
      { text: "English", onPress: () => setAppLanguage('English') },
      { text: "हिंदी (Hindi)", onPress: () => setAppLanguage('हिंदी') },
      { text: "मराठी (Marathi)", onPress: () => setAppLanguage('मराठी') },
      { text: "Cancel", style: "cancel" }
    ]);
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to securely log out? Your offline data will remain saved on this device.", [
      { text: "Cancel", style: "cancel" }, { text: "Log Out", style: "destructive", onPress: () => console.log("User logged out.") }
    ]);
  };

  const handleClearInbox = () => {
    Alert.alert("Clear Local Inbox?", "This will permanently delete all unmapped ledger scans. This does NOT affect your Cloud Vault.", [
      { text: "Cancel", style: "cancel" },
      { text: "Wipe Inbox", style: "destructive", onPress: async () => {
          setIsClearing(true);
          try {
            await database.write(async () => {
              const allItems = await database.get<Quarantine>('quarantine').query().fetch();
              const deleted = allItems.map(item => item.prepareDestroyPermanently());
              await database.batch(...deleted);
            });
            Alert.alert("Cache Cleared", "Your local inbox is now empty.");
          } catch (error) { Alert.alert("Error", "Could not clear the local database."); } 
          finally { setIsClearing(false); }
        }
      }
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.headerBackground, { paddingTop: insets.top + 20 }]}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Store Profile</Text>
          <Text style={styles.headerSub}>Manage your account and app settings</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>S</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Registered Mobile</Text>
              <Text style={styles.profilePhone}>{phoneNumber}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.editRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Shop Name</Text>
              {isEditingName ? (
                <TextInput style={styles.nameInput} value={shopName} onChangeText={setShopName} autoFocus={true} />
              ) : (
                <Text style={styles.infoValue}>{shopName}</Text>
              )}
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={isEditingName ? handleSaveName : () => setIsEditingName(true)}>
              <Text style={styles.editBtnText}>{isEditingName ? 'Save' : 'Edit'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.actionRow} onPress={handleChangeLanguage}>
            <View style={styles.actionIcon}><Feather name="globe" size={18} color="#3B82F6" /></View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>App Language</Text>
              <Text style={styles.actionSub}>Currently: {appLanguage}</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#CBD5E1" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionRow} onPress={() => Alert.alert("Success", "Report generated.")}>
            <View style={styles.actionIcon}><Feather name="file-text" size={18} color="#3B82F6" /></View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>Download Khata (Excel)</Text>
              <Text style={styles.actionSub}>Send to your CA</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#CBD5E1" />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>System</Text>
        <View style={styles.card}>
          <View style={styles.actionRow}>
            <View style={styles.actionIcon}><Feather name="check-circle" size={18} color="#3B82F6" /></View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>Cloud Backup</Text>
              <Text style={styles.actionSub}>Inventory is actively syncing</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionRow} onPress={handleClearInbox} disabled={isClearing}>
            <View style={[styles.actionIcon, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#EF4444' }]}><Feather name="trash-2" size={18} color="#EF4444" /></View>
            <View style={styles.actionTextContainer}>
              <Text style={[styles.actionTitle, { color: '#EF4444' }]}>Clear Unmapped Items</Text>
              <Text style={styles.actionSub}>Reset the local inbox queue</Text>
            </View>
            {isClearing ? <ActivityIndicator size="small" color="#EF4444" /> : <Feather name="chevron-right" size={20} color="#CBD5E1" />}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>Recall AI Enterprise • v1.0.0</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  headerBackground: { backgroundColor: '#0F172A', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingBottom: 30 },
  headerContent: { paddingHorizontal: 24 },
  headerTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginBottom: 4 },
  headerSub: { color: '#94A3B8', fontSize: 14, fontWeight: '500' },
  scrollArea: { flex: 1, marginTop: -15, paddingHorizontal: 16, paddingTop: 10 },
  
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 24, shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: 12, marginLeft: 8, letterSpacing: 0.5 },
  
  profileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatarCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { fontSize: 22, fontWeight: '900', color: '#3B82F6' },
  profilePhone: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginTop: 4 },
  
  editRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 18, color: '#1E293B', fontWeight: '700', marginTop: 6 },
  nameInput: { fontSize: 18, color: '#0F172A', fontWeight: '700', borderBottomWidth: 2, borderBottomColor: '#3B82F6', paddingVertical: 4, marginTop: 2 },
  editBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  editBtnText: { color: '#3B82F6', fontWeight: '800', fontSize: 13 },
  
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  actionIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  actionTextContainer: { flex: 1 },
  actionTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  actionSub: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 16 },
  
  logoutButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#EF4444', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 20 },
  logoutText: { color: '#EF4444', fontSize: 16, fontWeight: '800' },
  versionText: { textAlign: 'center', color: '#94A3B8', fontSize: 13, marginTop: 10, fontWeight: '600' }
});