import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function DashboardCard({ icon, title, count, items, color, onPress }) {
  return (
    <TouchableOpacity style={[styles.card, { borderLeftColor: color }]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.header}>
        <View style={[styles.iconWrapper, { backgroundColor: `${color}20` }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <Text style={styles.title}>{title}</Text>
        {count !== undefined && (
          <View style={[styles.badge, { backgroundColor: color }]}>
            <Text style={styles.badgeText}>{count}</Text>
          </View>
        )}
      </View>
      {items && items.length > 0 && (
        <View style={styles.itemList}>
          {items.slice(0, 3).map((item, i) => (
            <Text key={i} style={styles.itemText} numberOfLines={1}>
              • {item}
            </Text>
          ))}
          {items.length > 3 && (
            <Text style={styles.moreText}>+{items.length - 3} autres</Text>
          )}
        </View>
      )}
      {(!items || items.length === 0) && (
        <Text style={styles.emptyText}>Aucun élément</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  title: {
    flex: 1,
    color: '#F1F5F9',
    fontSize: 15,
    fontWeight: '600',
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  itemText: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 3,
  },
  emptyText: {
    color: '#475569',
    fontSize: 13,
    fontStyle: 'italic',
  },
  moreText: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
});
