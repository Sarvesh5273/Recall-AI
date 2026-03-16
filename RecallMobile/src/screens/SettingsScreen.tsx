import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { useAuth } from '../context/AuthContext';
import { useLanguage, LANGUAGES, Language } from '../context/LanguageContext';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { shopName, phone, logout } = useAuth() as any;
  const { language, setLanguage, t } = useLanguage();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(shopName ?? 'My Shop');
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const currentLang = LANGUAGES.find(l => l.code === language);

  const handleSaveName = () => {
    if (editedName.trim() === '') { Alert.alert(t('error'), t('settings_shop_name') + ' cannot be empty.'); return; }
    setIsEditingName(false);
  };

  const handleSelectLanguage = async (code: Language) => {
    await setLanguage(code);
    setShowLanguagePicker(false);
  };

  const handleLogout = () => setShowLogoutModal(true);

  return (
    <View style={styles.container}>
      <Modal visible={showLogoutModal} transparent animationType="fade">
        <View style={styles.logoutOverlay}>
          <View style={styles.logoutSheet}>
            <Text style={styles.logoutSheetTitle}>Logout</Text>
            <Text style={styles.logoutSheetMsg}>Are you sure you want to logout from Recall AI?</Text>
            <TouchableOpacity style={styles.logoutConfirmBtn} onPress={async () => { setShowLogoutModal(false); await logout(); }}>
              <Text style={styles.logoutConfirmText}>Yes, Logout</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutCancelBtn} onPress={() => setShowLogoutModal(false)}>
              <Text style={styles.logoutCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Language Picker Modal */}
      <Modal visible={showLanguagePicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowLanguagePicker(false)} activeOpacity={1}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('settings_language')}</Text>
            {LANGUAGES.map(lang => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langRow, language === lang.code && styles.langRowActive]}
                onPress={() => handleSelectLanguage(lang.code)}
              >
                <View style={styles.langTexts}>
                  <Text style={[styles.langNative, language === lang.code && styles.langActiveText]}>
                    {lang.nativeLabel}
                  </Text>
                  <Text style={styles.langEnglish}>{lang.label}</Text>
                </View>
                {language === lang.code && (
                  <Feather name="check" size={20} color="#3B82F6" />
                )}
              </TouchableOpacity>
            ))}
            <View style={{ height: 20 }} />
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={[styles.headerBackground, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.headerTitle}>{t('settings_title')}</Text>
        <Text style={styles.headerSub}>{t('settings_subtitle')}</Text>
      </View>

      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>

        {/* Profile Card */}
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{(shopName ?? 'S')[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>{t('settings_mobile')}</Text>
              <Text style={styles.profilePhone}>{phone ? phone.replace('+91', '+91 ') : '—'}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.editRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>{t('settings_shop_name')}</Text>
              {isEditingName ? (
                <TextInput style={styles.nameInput} value={editedName} onChangeText={setEditedName} autoFocus />
              ) : (
                <Text style={styles.infoValue}>{editedName}</Text>
              )}
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={isEditingName ? handleSaveName : () => setIsEditingName(true)}>
              <Text style={styles.editBtnText}>{isEditingName ? t('settings_save') : t('settings_edit')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Preferences */}
        <Text style={styles.sectionTitle}>{t('settings_preferences')}</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.actionRow} onPress={() => setShowLanguagePicker(true)}>
            <View style={styles.actionIcon}><Feather name="globe" size={18} color="#3B82F6" /></View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>{t('settings_language')}</Text>
              <Text style={styles.actionSub}>
                {t('settings_language_current')} {currentLang?.nativeLabel} ({currentLang?.label})
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color="#CBD5E1" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionRow} onPress={() => Alert.alert('Coming Soon', 'Khata report will be available in the next update.')}>
            <View style={styles.actionIcon}><Feather name="file-text" size={18} color="#3B82F6" /></View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>{t('settings_khata')}</Text>
              <Text style={styles.actionSub}>{t('settings_khata_sub')}</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#CBD5E1" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>{t('settings_logout')}</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>{t('settings_version')}</Text>
        <Text style={{ fontSize: 11, color: '#9A9A9A', textAlign: 'center', paddingVertical: 16 }}>
          Illustrations by Storyset (storyset.com)
        </Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F3F0' },
  headerBackground: { backgroundColor: '#0F172A', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingBottom: 30, paddingHorizontal: 24 },
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
  versionText: { textAlign: 'center', color: '#94A3B8', fontSize: 13, marginTop: 10, fontWeight: '600' },
  logoutOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  logoutSheet: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28, width: '100%' },
  logoutSheetTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 8, textAlign: 'center' },
  logoutSheetMsg: { fontSize: 15, color: '#64748B', fontWeight: '500', textAlign: 'center', marginBottom: 28, lineHeight: 22 },
  logoutConfirmBtn: { backgroundColor: '#EF4444', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  logoutConfirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  logoutCancelBtn: { backgroundColor: '#F1F5F9', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  logoutCancelText: { color: '#1E293B', fontSize: 16, fontWeight: '700' },
  // Language Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 12 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 20 },
  langRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, borderRadius: 16, marginBottom: 8 },
  langRowActive: { backgroundColor: '#EFF6FF' },
  langTexts: { flex: 1 },
  langNative: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  langActiveText: { color: '#3B82F6' },
  langEnglish: { fontSize: 13, color: '#94A3B8', fontWeight: '500', marginTop: 2 },
});
