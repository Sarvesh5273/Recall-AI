import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'en' | 'hi' | 'mr' | 'gu';

export const LANGUAGES: { code: Language; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English',  nativeLabel: 'English' },
  { code: 'hi', label: 'Hindi',    nativeLabel: 'हिंदी' },
  { code: 'mr', label: 'Marathi',  nativeLabel: 'मराठी' },
  { code: 'gu', label: 'Gujarati', nativeLabel: 'ગુજરાતી' },
];

export const translations: Record<Language, Record<string, string>> = {
  en: {
    tab_home: 'Home', tab_inbox: 'Inbox', tab_inventory: 'Inventory', tab_settings: 'Settings',
    home_greeting: 'Good day,', home_subtitle: 'Your store is live',
    home_total_items: 'Total Items', home_low_stock: 'Low Stock', home_out_of_stock: 'Out of Stock',
    home_scan_restock: 'Scan Restock', home_scan_sale: 'Scan Sale',
    home_scans_used: 'scans used', home_unlimited: 'Unlimited',
    home_upgrade: 'Upgrade Plan',
    inbox_title: 'Quarantine', inbox_subtitle: 'Help the AI learn unknown items',
    inbox_empty: 'All Clear!', inbox_empty_sub: 'No items waiting for review',
    inbox_needs_review: 'NEEDS REVIEW', inbox_ai_extracted: 'AI EXTRACTED:',
    inbox_delete: 'Delete', inbox_map: 'Map Item',
    inventory_title: 'Live Vault', inventory_subtitle: 'Total SKUs:',
    inventory_empty: 'Vault is empty', inventory_empty_sub: 'Scan a ledger to add items',
    inventory_custom: 'CUSTOM ITEM', inventory_low: 'LOW',
    inventory_update: 'Update Quantity', inventory_save: 'Save',
    inventory_cancel: 'Cancel', inventory_delete: 'Delete Item',
    settings_title: 'Store Profile', settings_subtitle: 'Manage your account and app settings',
    settings_mobile: 'Registered Mobile', settings_shop_name: 'Shop Name',
    settings_edit: 'Edit', settings_save: 'Save',
    settings_preferences: 'Preferences', settings_language: 'App Language',
    settings_language_current: 'Currently:', settings_khata: 'Download Khata (Excel)',
    settings_khata_sub: 'Send to your CA',
    settings_system: 'System', settings_backup: 'Cloud Backup',
    settings_backup_sub: 'Inventory is actively syncing',
    settings_clear_inbox: 'Clear Unmapped Items', settings_clear_sub: 'Reset the local inbox queue',
    settings_logout: 'Log Out', settings_version: 'Recall AI Enterprise • v1.0.0',
    settings_logout_title: 'Log Out', settings_logout_msg: 'Are you sure you want to securely log out?',
    settings_clear_title: 'Clear Local Inbox?',
    settings_clear_msg: 'This will permanently delete all unmapped ledger scans.',
    settings_clear_confirm: 'Wipe Inbox', settings_cleared: 'Cache Cleared',
    settings_cleared_msg: 'Your local inbox is now empty.',
    camera_cancel: 'Cancel', camera_flash: 'Flash',
    camera_restock: 'Scan Restock (IN)', camera_sale: 'Scan Sale (OUT)', camera_saving: 'Saving...',
    camera_processing_title: 'Processing 🚀', camera_processing_msg: 'Ledger captured. Syncing to AI cloud.',
    camera_offline_title: 'Saved to Outbox 📦', camera_offline_msg: 'You are offline. Will sync when connected.',
    cancel: 'Cancel', ok: 'OK', great: 'Great', error: 'Error',
  },
  hi: {
    tab_home: 'होम', tab_inbox: 'इनबॉक्स', tab_inventory: 'स्टॉक', tab_settings: 'सेटिंग्स',
    home_greeting: 'नमस्ते,', home_subtitle: 'आपकी दुकान लाइव है',
    home_total_items: 'कुल आइटम', home_low_stock: 'कम स्टॉक', home_out_of_stock: 'स्टॉक खत्म',
    home_scan_restock: 'स्टॉक स्कैन', home_scan_sale: 'बिक्री स्कैन',
    home_scans_used: 'स्कैन उपयोग', home_unlimited: 'असीमित',
    home_upgrade: 'प्लान अपग्रेड करें',
    inbox_title: 'क्वारंटाइन', inbox_subtitle: 'AI को अज्ञात आइटम सीखने में मदद करें',
    inbox_empty: 'सब ठीक है!', inbox_empty_sub: 'समीक्षा के लिए कोई आइटम नहीं',
    inbox_needs_review: 'समीक्षा जरूरी', inbox_ai_extracted: 'AI ने पढ़ा:',
    inbox_delete: 'हटाएं', inbox_map: 'आइटम मैप करें',
    inventory_title: 'लाइव वॉल्ट', inventory_subtitle: 'कुल SKU:',
    inventory_empty: 'वॉल्ट खाली है', inventory_empty_sub: 'आइटम जोड़ने के लिए लेजर स्कैन करें',
    inventory_custom: 'कस्टम आइटम', inventory_low: 'कम',
    inventory_update: 'मात्रा बदलें', inventory_save: 'सेव',
    inventory_cancel: 'रद्द करें', inventory_delete: 'आइटम हटाएं',
    settings_title: 'दुकान प्रोफाइल', settings_subtitle: 'अपना खाता और सेटिंग्स प्रबंधित करें',
    settings_mobile: 'पंजीकृत मोबाइल', settings_shop_name: 'दुकान का नाम',
    settings_edit: 'संपादित करें', settings_save: 'सेव करें',
    settings_preferences: 'प्राथमिकताएं', settings_language: 'ऐप भाषा',
    settings_language_current: 'वर्तमान:', settings_khata: 'खाता डाउनलोड करें (Excel)',
    settings_khata_sub: 'अपने CA को भेजें',
    settings_system: 'सिस्टम', settings_backup: 'क्लाउड बैकअप',
    settings_backup_sub: 'स्टॉक सक्रिय रूप से सिंक हो रहा है',
    settings_clear_inbox: 'अनमैप्ड आइटम हटाएं', settings_clear_sub: 'लोकल इनबॉक्स रीसेट करें',
    settings_logout: 'लॉग आउट', settings_version: 'Recall AI Enterprise • v1.0.0',
    settings_logout_title: 'लॉग आउट', settings_logout_msg: 'क्या आप सुरक्षित रूप से लॉग आउट करना चाहते हैं?',
    settings_clear_title: 'लोकल इनबॉक्स साफ करें?',
    settings_clear_msg: 'यह सभी अनमैप्ड लेजर स्कैन स्थायी रूप से हटा देगा।',
    settings_clear_confirm: 'इनबॉक्स साफ करें', settings_cleared: 'कैश साफ हुआ',
    settings_cleared_msg: 'आपका लोकल इनबॉक्स अब खाली है।',
    camera_cancel: 'रद्द करें', camera_flash: 'फ्लैश',
    camera_restock: 'स्टॉक स्कैन (IN)', camera_sale: 'बिक्री स्कैन (OUT)', camera_saving: 'सेव हो रहा है...',
    camera_processing_title: 'प्रोसेसिंग 🚀', camera_processing_msg: 'लेजर कैप्चर हुआ। AI क्लाउड से सिंक हो रहा है।',
    camera_offline_title: 'आउटबॉक्स में सेव 📦', camera_offline_msg: 'आप ऑफलाइन हैं। कनेक्ट होने पर सिंक होगा।',
    cancel: 'रद्द करें', ok: 'ठीक है', great: 'बढ़िया', error: 'त्रुटि',
  },
  mr: {
    tab_home: 'होम', tab_inbox: 'इनबॉक्स', tab_inventory: 'साठा', tab_settings: 'सेटिंग्ज',
    home_greeting: 'नमस्कार,', home_subtitle: 'तुमचे दुकान लाइव आहे',
    home_total_items: 'एकूण वस्तू', home_low_stock: 'कमी साठा', home_out_of_stock: 'साठा संपला',
    home_scan_restock: 'साठा स्कॅन', home_scan_sale: 'विक्री स्कॅन',
    home_scans_used: 'स्कॅन वापरले', home_unlimited: 'असीमित',
    home_upgrade: 'प्लान अपग्रेड करा',
    inbox_title: 'क्वारंटाइन', inbox_subtitle: 'AI ला अज्ञात वस्तू शिकण्यास मदत करा',
    inbox_empty: 'सर्व ठीक!', inbox_empty_sub: 'पुनरावलोकनासाठी कोणतीही वस्तू नाही',
    inbox_needs_review: 'पुनरावलोकन आवश्यक', inbox_ai_extracted: 'AI ने वाचले:',
    inbox_delete: 'हटवा', inbox_map: 'वस्तू मॅप करा',
    inventory_title: 'लाइव व्हॉल्ट', inventory_subtitle: 'एकूण SKU:',
    inventory_empty: 'व्हॉल्ट रिकामे आहे', inventory_empty_sub: 'वस्तू जोडण्यासाठी लेजर स्कॅन करा',
    inventory_custom: 'कस्टम वस्तू', inventory_low: 'कमी',
    inventory_update: 'प्रमाण बदला', inventory_save: 'सेव्ह करा',
    inventory_cancel: 'रद्द करा', inventory_delete: 'वस्तू हटवा',
    settings_title: 'दुकान प्रोफाइल', settings_subtitle: 'तुमचे खाते आणि सेटिंग्ज व्यवस्थापित करा',
    settings_mobile: 'नोंदणीकृत मोबाइल', settings_shop_name: 'दुकानाचे नाव',
    settings_edit: 'संपादित करा', settings_save: 'सेव्ह करा',
    settings_preferences: 'प्राधान्ये', settings_language: 'ॲप भाषा',
    settings_language_current: 'सध्या:', settings_khata: 'खाते डाउनलोड करा (Excel)',
    settings_khata_sub: 'तुमच्या CA ला पाठवा',
    settings_system: 'सिस्टम', settings_backup: 'क्लाउड बॅकअप',
    settings_backup_sub: 'साठा सक्रियपणे सिंक होत आहे',
    settings_clear_inbox: 'अनमॅप्ड वस्तू हटवा', settings_clear_sub: 'लोकल इनबॉक्स रीसेट करा',
    settings_logout: 'लॉग आउट', settings_version: 'Recall AI Enterprise • v1.0.0',
    settings_logout_title: 'लॉग आउट', settings_logout_msg: 'तुम्हाला खरोखर लॉग आउट करायचे आहे का?',
    settings_clear_title: 'लोकल इनबॉक्स साफ करायचे?',
    settings_clear_msg: 'हे सर्व अनमॅप्ड लेजर स्कॅन कायमचे हटवेल।',
    settings_clear_confirm: 'इनबॉक्स साफ करा', settings_cleared: 'कॅश साफ झाला',
    settings_cleared_msg: 'तुमचा लोकल इनबॉक्स आता रिकामा आहे.',
    camera_cancel: 'रद्द करा', camera_flash: 'फ्लॅश',
    camera_restock: 'साठा स्कॅन (IN)', camera_sale: 'विक्री स्कॅन (OUT)', camera_saving: 'सेव्ह होत आहे...',
    camera_processing_title: 'प्रोसेसिंग 🚀', camera_processing_msg: 'लेजर कॅप्चर झाला. AI क्लाउडशी सिंक होत आहे.',
    camera_offline_title: 'आउटबॉक्समध्ये सेव्ह 📦', camera_offline_msg: 'तुम्ही ऑफलाइन आहात. कनेक्ट झाल्यावर सिंक होईल.',
    cancel: 'रद्द करा', ok: 'ठीक आहे', great: 'छान', error: 'त्रुटी',
  },
  gu: {
    tab_home: 'હોમ', tab_inbox: 'ઈનબૉક્સ', tab_inventory: 'સ્ટૉક', tab_settings: 'સેટિંગ્સ',
    home_greeting: 'નમસ્તે,', home_subtitle: 'તમારી દુકાન લાઈવ છે',
    home_total_items: 'કુલ વસ્તુઓ', home_low_stock: 'ઓછો સ્ટૉક', home_out_of_stock: 'સ્ટૉક ખતમ',
    home_scan_restock: 'સ્ટૉક સ્કૅન', home_scan_sale: 'વેચાણ સ્કૅન',
    home_scans_used: 'સ્કૅન વપરાયા', home_unlimited: 'અમર્યાદિત',
    home_upgrade: 'પ્લાન અપગ્રેડ કરો',
    inbox_title: 'ક્વૉરૅન્ટાઈન', inbox_subtitle: 'AI ને અજ્ઞાત વસ્તુઓ શીખવામાં મદદ કરો',
    inbox_empty: 'બધું બરાબર!', inbox_empty_sub: 'સમીક્ષા માટે કોઈ વસ્તુ નથી',
    inbox_needs_review: 'સમીક્ષા જરૂરી', inbox_ai_extracted: 'AI એ વાંચ્યું:',
    inbox_delete: 'કાઢો', inbox_map: 'વસ્તુ મૅપ કરો',
    inventory_title: 'લાઈવ વૉલ્ટ', inventory_subtitle: 'કુલ SKU:',
    inventory_empty: 'વૉલ્ટ ખાલી છે', inventory_empty_sub: 'વસ્તુ ઉમેરવા લૅજર સ્કૅન કરો',
    inventory_custom: 'કસ્ટમ વસ્તુ', inventory_low: 'ઓછું',
    inventory_update: 'જથ્થો બદલો', inventory_save: 'સેવ કરો',
    inventory_cancel: 'રદ કરો', inventory_delete: 'વસ્તુ કાઢો',
    settings_title: 'દુકાન પ્રોફાઈલ', settings_subtitle: 'તમારો એકાઉન્ટ અને સેટિંગ્સ મૅનેજ કરો',
    settings_mobile: 'નોંધાયેલ મોબાઈલ', settings_shop_name: 'દુકાનનું નામ',
    settings_edit: 'ફેરફાર કરો', settings_save: 'સેવ કરો',
    settings_preferences: 'પ્રાધાન્યતાઓ', settings_language: 'એપ ભાષા',
    settings_language_current: 'હાલ:', settings_khata: 'ખાતું ડાઉનલોડ કરો (Excel)',
    settings_khata_sub: 'તમારા CA ને મોકલો',
    settings_system: 'સિસ્ટમ', settings_backup: 'ક્લાઉડ બૅકઅપ',
    settings_backup_sub: 'સ્ટૉક સક્રિય રીતે સિંક થઈ રહ્યો છે',
    settings_clear_inbox: 'અનમૅપ્ડ વસ્તુઓ કાઢો', settings_clear_sub: 'લોકલ ઈનબૉક્સ રીસેટ કરો',
    settings_logout: 'લૉગ આઉટ', settings_version: 'Recall AI Enterprise • v1.0.0',
    settings_logout_title: 'લૉગ આઉટ', settings_logout_msg: 'શું તમે ખરેખર લૉગ આઉટ કરવા માંગો છો?',
    settings_clear_title: 'લોકલ ઈનબૉક્સ સાફ કરવું?',
    settings_clear_msg: 'આ બધા અનમૅપ્ડ લૅજર સ્કૅન કાયમ માટે ડિલીટ કરશે.',
    settings_clear_confirm: 'ઈનબૉક્સ સાફ કરો', settings_cleared: 'કૅશ સાફ થઈ ગઈ',
    settings_cleared_msg: 'તમારો લોકલ ઈનબૉક્સ હવે ખાલી છે.',
    camera_cancel: 'રદ કરો', camera_flash: 'ફ્લૅશ',
    camera_restock: 'સ્ટૉક સ્કૅન (IN)', camera_sale: 'વેચાણ સ્કૅન (OUT)', camera_saving: 'સેવ થઈ રહ્યું છે...',
    camera_processing_title: 'પ્રોસેસિંગ 🚀', camera_processing_msg: 'લૅજર કૅપ્ચર થઈ ગયો. AI ક્લાઉડ સાથે સિંક થઈ રહ્યો છે.',
    camera_offline_title: 'આઉટબૉક્સમાં સેવ 📦', camera_offline_msg: 'તમે ઑફલાઈન છો. કનેક્ટ થાય ત્યારે સિંક થશે.',
    cancel: 'રદ કરો', ok: 'ઠીક છે', great: 'સરસ', error: 'ભૂલ',
  },
};

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
});

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    AsyncStorage.getItem('recall_language').then(saved => {
      if (saved && ['en', 'hi', 'mr', 'gu'].includes(saved)) {
        setLanguageState(saved as Language);
      }
    });
  }, []);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    await AsyncStorage.setItem('recall_language', lang);
  };

  const t = (key: string): string => {
    return translations[language][key] ?? translations['en'][key] ?? key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);