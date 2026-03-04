import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';

// Mock data representing the output from our Azure AI pipeline
const initialItems = [
  { id: '1', rawText: '50kg Khaand', matched: true, productName: 'Sugar (50kg)', confidence: 0.98 },
  { id: '2', rawText: '10x Sabun', matched: true, productName: 'Lifebuoy Soap', confidence: 0.89 },
  { id: '3', rawText: 'khrnd 5', matched: false, productName: null, confidence: 0.32 }, // OCR failure
];

export default function TriageScreen() {
  const [items, setItems] = useState(initialItems);

  const renderItem = ({ item }) => {
    const isMatched = item.matched;
    
    return (
      <View style={[styles.itemCard, isMatched ? styles.cardSuccess : styles.cardWarning]}>
        <View style={styles.itemHeader}>
          <Text style={styles.rawText}>Scanned: "{item.rawText}"</Text>
          <Text style={styles.confidence}>
            {Math.round(item.confidence * 100)}% Match
          </Text>
        </View>

        {isMatched ? (
          <View style={styles.resolvedContainer}>
            <Text style={styles.resolvedText}>✅ Auto-Mapped to: {item.productName}</Text>
          </View>
        ) : (
          <View style={styles.actionContainer}>
            <Text style={styles.alertText}>⚠️ Unmatched Item</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.voiceButton}>
                <Text style={styles.buttonText}>🎤 Voice Correct</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.gridButton}>
                <Text style={styles.buttonText}>👆 Select from Grid</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Review Bill #INV-001</Text>
        <Text style={styles.headerSub}>Please resolve red items to update inventory.</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
      />

      <TouchableOpacity style={styles.confirmButton}>
        <Text style={styles.confirmButtonText}>Confirm & Update Stock</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908' },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#2a1f14' },
  headerTitle: { color: '#f0ece4', fontSize: 22, fontWeight: 'bold' },
  headerSub: { color: '#888', fontSize: 13, marginTop: 4 },
  listContainer: { padding: 16 },
  itemCard: { borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1 },
  cardSuccess: { backgroundColor: '#071a0d', borderColor: '#166534' },
  cardWarning: { backgroundColor: '#1f100d', borderColor: '#991b1b' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  rawText: { color: '#888', fontStyle: 'italic', fontSize: 14 },
  confidence: { color: '#666', fontSize: 12, fontWeight: 'bold' },
  resolvedContainer: { backgroundColor: '#042f14', padding: 10, borderRadius: 8 },
  resolvedText: { color: '#4ade80', fontWeight: 'bold', fontSize: 15 },
  actionContainer: { marginTop: 5 },
  alertText: { color: '#f87171', fontWeight: 'bold', marginBottom: 10, fontSize: 15 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  voiceButton: { flex: 1, backgroundColor: '#b5651d', padding: 12, borderRadius: 8, alignItems: 'center' },
  gridButton: { flex: 1, backgroundColor: '#2a1f14', padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#b5651d' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  confirmButton: { margin: 16, backgroundColor: '#22c55e', padding: 18, borderRadius: 12, alignItems: 'center' },
  confirmButtonText: { color: '#fff', fontSize: 16, fontWeight: '900' }
});