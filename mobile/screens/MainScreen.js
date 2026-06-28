import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Animated,
  Dimensions,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import Orb from '../components/Orb';
import WaveVisualizer from '../components/WaveVisualizer';
import ContextCard from '../components/ContextCard';
import ConfirmModal from '../components/ConfirmModal';
import { API_BASE_URL } from '../config';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SESSION_ID = `session-${Date.now()}`;

const STATUS_LABELS = {
  idle: 'EN ÉCOUTE…',
  listening: 'EN ÉCOUTE…',
  processing: 'ANALYSE…',
  speaking: 'LEVCO PARLE',
};

export default function MainScreen() {
  const [voiceState, setVoiceState] = useState('idle');
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [showCard, setShowCard] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ visible: false, message: '', actionData: null });
  const [confirmLoading, setConfirmLoading] = useState(false);

  const recordingRef = useRef(null);
  const soundRef = useRef(null);
  const timerRef = useRef(null);
  const isRecordingRef = useRef(false);

  // Animated values
  const greetingOpacity = useRef(new Animated.Value(1)).current;
  const greetingTransY = useRef(new Animated.Value(0)).current;
  const tapBtnOpacity = useRef(new Animated.Value(1)).current;
  const endBtnOpacity = useRef(new Animated.Value(0)).current;
  const statusActive = voiceState !== 'idle';

  // Session timer
  useEffect(() => {
    if (sessionStarted) {
      timerRef.current = setInterval(() => setSessionSeconds(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [sessionStarted]);

  const formatTime = (secs) => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `Session · ${m}:${s}`;
  };

  const activateSession = useCallback(() => {
    setSessionStarted(true);
    Animated.parallel([
      Animated.timing(greetingOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.timing(greetingTransY, { toValue: -10, duration: 500, useNativeDriver: true }),
      Animated.timing(tapBtnOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
      Animated.timing(endBtnOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const startRecording = async () => {
    if (voiceState === 'speaking' || voiceState === 'processing') return;
    if (isRecordingRef.current) return;

    if (!sessionStarted) activateSession();

    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return;

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      isRecordingRef.current = true;
      setVoiceState('listening');
      setTranscript('');
      setAiResponse('');
      setShowCard(false);
    } catch (err) {
      console.error('startRecording:', err);
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current || !isRecordingRef.current) return;
    isRecordingRef.current = false;
    setVoiceState('processing');

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      const formData = new FormData();
      formData.append('audio', { uri, type: 'audio/m4a', name: 'voice.m4a' });

      const res = await axios.post(`${API_BASE_URL}/voice/transcribe`, formData, {
        headers: { 'Content-Type': 'multipart/form-data', 'x-session-id': SESSION_ID },
        timeout: 30000,
      });

      const { transcript: t, response: r, audioUrl, isAction, actionData } = res.data;
      setTranscript(t);
      setAiResponse(r);
      setVoiceState('speaking');

      if (isAction && actionData) {
        setShowCard(true);
        setConfirmModal({
          visible: true,
          message: actionData.confirmation_message || r,
          actionData,
        });
      }

      await playAudio(`${API_BASE_URL}${audioUrl}`);
      setVoiceState('idle');
    } catch (err) {
      console.error('stopRecording:', err);
      setVoiceState('idle');
    }
  };

  const playAudio = (url) =>
    new Promise(async (resolve) => {
      try {
        if (soundRef.current) await soundRef.current.unloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((s) => {
          if (s.didJustFinish) { sound.unloadAsync(); resolve(); }
        });
      } catch (err) {
        console.warn('playAudio:', err);
        resolve();
      }
    });

  const handleConfirm = async () => {
    setConfirmLoading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/voice/confirm`, {
        actionData: confirmModal.actionData,
        sessionId: SESSION_ID,
      });
      setConfirmModal({ visible: false, message: '', actionData: null });
      setAiResponse(res.data.response);
      if (res.data.audioUrl) await playAudio(`${API_BASE_URL}${res.data.audioUrl}`);
    } catch (err) {
      console.error('confirm:', err);
    } finally {
      setConfirmLoading(false);
    }
  };

  const endSession = () => {
    clearInterval(timerRef.current);
    if (soundRef.current) soundRef.current.unloadAsync();
    setSessionStarted(false);
    setSessionSeconds(0);
    setVoiceState('idle');
    setTranscript('');
    setAiResponse('');
    setShowCard(false);
    Animated.parallel([
      Animated.timing(greetingOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(greetingTransY, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.timing(tapBtnOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(endBtnOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const waveVisible = voiceState === 'listening' || voiceState === 'speaking';
  const waveIntensity = voiceState === 'speaking' ? 1.0 : 0.45;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#09080f" />

      {/* Ambient background glow */}
      <LinearGradient
        colors={['transparent', 'rgba(90,55,200,0.18)', 'rgba(124,92,252,0.08)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.bgGlow}
      />

      {/* Top bar */}
      <View style={styles.topbar}>
        <View style={styles.logo}>
          <View style={styles.logoDot} />
          <Text style={styles.logoName}>
            Levco <Text style={styles.logoOp}>OPERATOR</Text>
          </Text>
        </View>
        <Text style={styles.sessionInfo}>{formatTime(sessionSeconds)}</Text>
      </View>

      {/* Center stage: greeting above, orb centered, transcript below */}
      <View style={styles.stage}>
        {/* Greeting (fades out on first interaction, space kept) */}
        <Animated.View
          style={[
            styles.greetingWrapper,
            { opacity: greetingOpacity, transform: [{ translateY: greetingTransY }] },
          ]}
        >
          <Text style={styles.greetingTitle}>Bonjour,</Text>
          <Text style={styles.greetingSubtitle}>
            qu'est-ce que je peux faire pour toi aujourd'hui ?
          </Text>
        </Animated.View>

        {/* Orb — press & hold to speak */}
        <TouchableOpacity
          onPressIn={startRecording}
          onPressOut={stopRecording}
          activeOpacity={1}
          style={styles.orbTouch}
        >
          <Orb state={voiceState} />
        </TouchableOpacity>

        {/* Status label */}
        <Text style={[styles.statusLabel, statusActive && styles.statusActive]}>
          {STATUS_LABELS[voiceState]}
        </Text>

        {/* Transcript area */}
        <View style={styles.transcriptArea}>
          {transcript !== '' && (
            <Text style={styles.userText}>"{transcript}"</Text>
          )}
          {aiResponse !== '' && (
            <Text style={styles.aiText}>{aiResponse}</Text>
          )}
        </View>
      </View>

      {/* Bottom controls */}
      <View style={styles.bottom}>
        <Animated.View style={{ opacity: tapBtnOpacity }}>
          <TouchableOpacity
            style={styles.tapBtn}
            onPressIn={startRecording}
            onPressOut={stopRecording}
            activeOpacity={0.85}
          >
            <Text style={styles.tapBtnIcon}>🎙</Text>
            <Text style={styles.tapBtnText}>Appuyer pour parler</Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={{ opacity: endBtnOpacity }}>
          <TouchableOpacity onPress={endSession} style={styles.endBtn}>
            <Text style={styles.endBtnText}>TERMINER LA SESSION</Text>
          </TouchableOpacity>
        </Animated.View>

        <Text style={styles.hint}>Levco t'écoute · Parle naturellement</Text>
      </View>

      {/* Context card overlay */}
      <ContextCard visible={showCard} />

      {/* Wave visualizer */}
      <WaveVisualizer visible={waveVisible} intensity={waveIntensity} />

      {/* Action confirmation */}
      <ConfirmModal
        visible={confirmModal.visible}
        message={confirmModal.message}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmModal({ visible: false, message: '', actionData: null })}
        loading={confirmLoading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#09080f',
  },
  bgGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_HEIGHT * 0.65,
  },
  topbar: {
    paddingTop: 56,
    paddingHorizontal: 32,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  logoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2ecc71',
    shadowColor: '#2ecc71',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
  },
  logoName: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: '#f0ecff',
    marginLeft: 9,
  },
  logoOp: {
    fontSize: 10,
    fontWeight: '500',
    color: '#c4aaff',
    letterSpacing: 1.2,
    opacity: 0.6,
  },
  sessionInfo: {
    fontSize: 11,
    color: 'rgba(240,236,255,0.22)',
    letterSpacing: 0.5,
  },

  // Stage splits into 3 parts: greeting / orb / transcript
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  greetingWrapper: {
    alignItems: 'center',
    marginBottom: 52,
  },
  greetingTitle: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.5,
    color: '#f0ecff',
    marginBottom: 8,
    textAlign: 'center',
  },
  greetingSubtitle: {
    fontSize: 15,
    fontWeight: '300',
    color: 'rgba(240,236,255,0.45)',
    textAlign: 'center',
  },
  orbTouch: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: {
    marginTop: 36,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2.5,
    color: 'rgba(240,236,255,0.22)',
    textAlign: 'center',
  },
  statusActive: {
    color: '#c4aaff',
  },
  transcriptArea: {
    marginTop: 28,
    maxWidth: 400,
    width: '100%',
    minHeight: 52,
    alignItems: 'center',
  },
  userText: {
    fontSize: 15,
    fontWeight: '300',
    lineHeight: 24,
    color: 'rgba(196,170,255,0.7)',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  aiText: {
    fontSize: 15,
    fontWeight: '300',
    lineHeight: 24,
    color: 'rgba(240,236,255,0.9)',
    textAlign: 'center',
    marginTop: 10,
  },

  // Bottom
  bottom: {
    alignItems: 'center',
    paddingBottom: 52,
    paddingHorizontal: 32,
    gap: 20,
  },
  tapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(124,92,252,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124,92,252,0.28)',
    borderRadius: 100,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  tapBtnIcon: { fontSize: 16 },
  tapBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#c4aaff',
    letterSpacing: 0.4,
  },
  endBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  endBtnText: {
    fontSize: 11,
    color: 'rgba(240,236,255,0.22)',
    letterSpacing: 0.6,
  },
  hint: {
    fontSize: 11,
    color: 'rgba(240,236,255,0.22)',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
});
