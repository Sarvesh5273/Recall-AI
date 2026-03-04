import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import withObservables from '@nozbe/with-observables';
import { database } from '../database';
import { Q } from '@nozbe/watermelondb';

// 1. The Raw Component
const SyncBadgeRaw = ({ pendingCount }: { pendingCount: number }) => {
  // If the queue is empty, the badge completely disappears
  if (pendingCount === 0) return null;

  return (
    <View style={styles.badgeContainer}>
      <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
      <Text style={styles.badgeText}>Syncing {pendingCount} scan{pendingCount > 1 ? 's' : ''}...</Text>
    </View>
  );
};

// 2. The Reactive Database Observer
// This automatically re-renders the component whenever the count changes
const enhance = withObservables([], () => ({
  pendingCount: database.collections.get('pending_scans').query(
    Q.where('status', Q.oneOf(['pending', 'syncing']))
  ).observeCount()
}));

export default enhance(SyncBadgeRaw);

// 3. Enterprise UI Styling
const styles = StyleSheet.create({
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6', // Azure Blue
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  }
});