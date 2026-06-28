import React, { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

const DEFAULT_TASKS = [
  { icon: '✏️', name: 'Signer la facture fournisseur', sub: 'Fournitures Delta · 1 240 €', tag: 'Demain', tagStyle: 'red' },
  { icon: '📞', name: 'Rappeler Marc', sub: 'Attend ta réponse depuis 2 jours', tag: 'Avant midi', tagStyle: 'orange' },
  { icon: '📄', name: 'Valider le devis de Francine', sub: 'En attente de ton accord', tag: "Aujourd'hui", tagStyle: 'yellow' },
  { icon: '🔥', name: "Relancer l'Atelier Verso", sub: 'Prospect chaud, momentum à garder', tag: 'Cette semaine', tagStyle: 'green' },
];

const TAG = {
  red:    { bg: 'rgba(255,77,106,0.15)',  text: '#ff4d6a', border: 'rgba(255,77,106,0.25)' },
  orange: { bg: 'rgba(255,159,67,0.15)',  text: '#ff9f43', border: 'rgba(255,159,67,0.25)' },
  yellow: { bg: 'rgba(248,195,30,0.15)',  text: '#f8c31e', border: 'rgba(248,195,30,0.25)' },
  green:  { bg: 'rgba(46,204,113,0.15)',  text: '#2ecc71', border: 'rgba(46,204,113,0.25)' },
};

export default function ContextCard({ visible, tasks = DEFAULT_TASKS }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 400, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: visible ? 0 : 20, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.card, { opacity, transform: [{ translateY }] }]}
    >
      <Text style={styles.label}>TA TO-DO DU JOUR · CLASSÉE PAR URGENCE</Text>
      {tasks.map((task, i) => {
        const t = TAG[task.tagStyle];
        return (
          <View
            key={i}
            style={[styles.row, i === tasks.length - 1 && styles.rowLast]}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.icon}>{task.icon}</Text>
              <View style={styles.textBlock}>
                <Text style={styles.name}>{task.name}</Text>
                <Text style={styles.sub}>{task.sub}</Text>
              </View>
            </View>
            <View style={[styles.tag, { backgroundColor: t.bg, borderColor: t.border }]}>
              <Text style={[styles.tagText, { color: t.text }]}>{task.tag}</Text>
            </View>
          </View>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 130,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(22,18,40,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(138,110,230,0.16)',
    borderRadius: 18,
    padding: 18,
    zIndex: 20,
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: 'rgba(196,170,255,0.7)',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(138,110,230,0.16)',
    gap: 12,
  },
  rowLast: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  icon: { fontSize: 15 },
  textBlock: { flex: 1 },
  name: { fontSize: 13, fontWeight: '500', color: '#f0ecff' },
  sub: { fontSize: 11, color: 'rgba(240,236,255,0.45)', marginTop: 1 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  tagText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
});
