import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, Vibration, Alert } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import Feather from 'react-native-vector-icons/Feather';
import { Image as ImageCompressor } from 'react-native-compressor';
import uuid from 'react-native-uuid';
import NetInfo from '@react-native-community/netinfo'; // THE NETWORK CONTEXT ENGINE

// Local database engine 
import { database } from '../database';
import PendingScan from '../database/PendingScan';
import { processOutboxQueue } from '../utils/SyncWorker';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function CameraScreen({ route, navigation }: any) {
  const { type } = route.params || { type: 'OUT' };
  const { shopId } = useAuth();
  const { t } = useLanguage();
  
  const device = useCameraDevice('back');
  const camera = useRef<Camera>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    (async () => {
      const status = await Camera.requestCameraPermission();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const captureDocument = async () => {
    if (!camera.current || isProcessing) return;
    
    setIsProcessing(true);
    try {
      Vibration.vibrate(50); 
      
      const photo = await camera.current.takePhoto({ flash: isTorchOn ? 'on' : 'off' });
      
      const compressedUri = await ImageCompressor.compress(`file://${photo.path}`, {
        compressionMethod: 'auto', maxWidth: 1280, quality: 0.8,
      });

      // 1. GENERATE IDEMPOTENCY KEY ON THE EDGE
      const uniqueScanId = uuid.v4() as string;

      // 2. STRICT STATE INJECTION (Write to WatermelonDB Outbox)
      await database.write(async () => {
        const scansCollection = database.get<PendingScan>('pending_scans');
        await scansCollection.create(scan => {
          scan.scanId = uniqueScanId;
          scan.imageUri = compressedUri;
          scan.scanType = type; 
          scan.shopId = shopId ?? '';
          scan.status = 'pending'; 
          scan.retryCount = 0;     
          scan.createdAt = new Date();
          scan.nextRetryAt = Date.now(); 
        });
      });

      // 3. IMMEDIATELY KICK THE SYNC ENGINE (fire & forget — don't await)
      processOutboxQueue();

      // 4. CONTEXT-AWARE UX FEEDBACK
      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable !== false;

      if (isOnline) {
        Alert.alert(
          t('camera_processing_title'), 
          t('camera_processing_msg'),
          [{ text: t('great'), onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert(
          t('camera_offline_title'), 
          t('camera_offline_msg'),
          [{ text: t('ok'), onPress: () => navigation.goBack() }]
        );
      }
      
    } catch (error: any) {
      console.error("Capture Error:", error);
      Alert.alert("Camera Error", "Failed to save the image to your local device.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!hasPermission) return <View style={styles.center}><Text style={styles.text}>Camera Access Required</Text></View>;
  if (!device) return <View style={styles.center}><Text style={styles.text}>No Camera Found</Text></View>;

  const isRestock = type === 'IN';

  return (
    <View style={styles.container}>
      <Camera ref={camera} style={StyleSheet.absoluteFill} device={device} isActive={true} photo={true} />

      <SafeAreaView style={styles.overlay}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconButton} onPress={() => setIsTorchOn(!isTorchOn)}>
            <Feather name={isTorchOn ? "zap-off" : "zap"} size={20} color={isTorchOn ? "#FBBF24" : "#FFFFFF"} />
          </TouchableOpacity>
        </View>

        <View style={styles.reticleContainer}>
          <View style={styles.reticleTopLeft} /><View style={styles.reticleTopRight} />
          <View style={styles.reticleBottomLeft} /><View style={styles.reticleBottomRight} />
        </View>

        <View style={styles.bottomBar}>
          <TouchableOpacity 
            style={[styles.captureButton, { backgroundColor: isProcessing ? '#64748B' : (isRestock ? '#10B981' : '#EF4444') }]} 
            onPress={captureDocument}
            disabled={isProcessing}
          >
            <Feather name={isRestock ? "package" : "shopping-cart"} size={24} color="#FFFFFF" style={{ marginRight: 12 }} />
            <Text style={styles.buttonTitle}>{isProcessing ? t('camera_saving') : (isRestock ? t('camera_restock') : t('camera_sale'))}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },
  text: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 24, paddingTop: 20 },
  iconButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.75)', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  iconText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginLeft: 8 },
  reticleContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', margin: 40 },
  reticleTopLeft: { position: 'absolute', top: 0, left: 0, width: 40, height: 40, borderColor: '#3B82F6', borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  reticleTopRight: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, borderColor: '#3B82F6', borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  reticleBottomLeft: { position: 'absolute', bottom: 0, left: 0, width: 40, height: 40, borderColor: '#3B82F6', borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  reticleBottomRight: { position: 'absolute', bottom: 0, right: 0, width: 40, height: 40, borderColor: '#3B82F6', borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  bottomBar: { paddingBottom: 40, paddingHorizontal: 24, alignItems: 'center' },
  captureButton: { flexDirection: 'row', width: '100%', height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8, marginBottom: 32 },
  buttonTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: 0.5 }
});
