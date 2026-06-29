import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import axios from 'axios';
import DashboardCard from '../components/DashboardCard';
import { API_BASE_URL } from '../config';

export default function HomeScreen({ navigation }) {
  const [dashboard, setDashboard] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/webhooks/dashboard`);
      setDashboard(res.data);
      setLastUpdate(new Date());
    } catch (err) {
      console.warn('Dashboard fetch failed', err.message);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboard();
    setRefreshing(false);
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <View style={styles.header}>
        <Text style={styles.greeting}>{greeting()} 👋</Text>
        <Text style={styles.date}>
          {new Date().toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Text>
        {lastUpdate && (
          <Text style={styles.updateTime}>
            Mis à jour à {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />
        }
      >
        <DashboardCard
          icon="mail-outline"
          title="Emails prioritaires"
          count={dashboard?.emails?.length || 0}
          items={dashboard?.emails?.map(e => e.subject || e) || []}
          color="#2563EB"
        />
        <DashboardCard
          icon="calendar-outline"
          title="Rendez-vous du jour"
          count={dashboard?.meetings?.length || 0}
          items={dashboard?.meetings?.map(m => `${m.time || ''} — ${m.title || m}`) || []}
          color="#10B981"
        />
        <DashboardCard
          icon="alert-circle-outline"
          title="Actions en retard"
          count={dashboard?.lateActions?.length || 0}
          items={dashboard?.lateActions?.map(a => a.title || a) || []}
          color="#EF4444"
        />

        {!dashboard && (
          <Text style={styles.emptyState}>
            Aucune donnée disponible.{'\n'}Configurez n8n pour alimenter le dashboard.
          </Text>
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Voice')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>🎙 Parler à l'assistant</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#0F172A',
  },
  greeting: {
    color: '#F1F5F9',
    fontSize: 26,
    fontWeight: '700',
  },
  date: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 4,
    textTransform: 'capitalize',
  },
  updateTime: {
    color: '#334155',
    fontSize: 11,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  emptyState: {
    color: '#475569',
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 24,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    left: 20,
    right: 20,
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  fabText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
