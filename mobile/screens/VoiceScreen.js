import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import axios from 'axios';
import MicButton from '../components/MicButton';
import ConfirmModal from '../components/ConfirmModal';
import { API_BASE_URL } from '../config';

const SESSION_ID = `session-${Date.now()}`;

export default function VoiceScreen() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState('Appuie sur le micro pour parler');
  const [confirmModal, setConfirmModal] = useState({ visible: false, message: '', actionData: null });
  const [confirmLoading, setConfirmLoading] = useState(false);

  const recordingRef = useRef(null);
  const soundRef = useRef(null);

  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setStatus('Permission micro refusée');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setIsRecording(true);
      setStatus('Écoute en cours...');
      setTranscript('');
      setResponse('');
    } catch (err) {
      console.error('startRecording error', err);
      setStatus('Erreur micro : ' + err.message);
    }
  };

  const stopRecordingAndProcess = async () => {
    if (!recordingRef.current) return;

    setIsRecording(false);
    setIsProcessing(true);
    setStatus('Traitement en cours...');

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      // Send audio to backend
      const formData = new FormData();
      formData.append('audio', {
        uri,
        type: 'audio/m4a',
        name: 'voice.m4a',
      });

      const res = await axios.post(`${API_BASE_URL}/voice/transcribe`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-session-id': SESSION_ID,
        },
        timeout: 30000,
      });

      const { transcript: t, response: r, audioUrl, isAction, actionData } = res.data;
      setTranscript(t);
      setResponse(r);

      await playAudio(`${API_BASE_URL}${audioUrl}`);

      if (isAction && actionData) {
        setConfirmModal({
          visible: true,
          message: actionData.confirmation_message || r,
          actionData,
        });
      }

      setStatus('Appuie sur le micro pour parler');
    } catch (err) {
      console.error('process error', err);
      setStatus('Erreur : ' + (err.response?.data?.error || err.message));
    } finally {
      setIsProcessing(false);
    }
  };

  const playAudio = async (url) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      setIsPlaying(true);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.didJustFinish) {
          setIsPlaying(false);
          sound.unloadAsync();
        }
      });
    } catch (err) {
      console.warn('playAudio error', err.message);
      setIsPlaying(false);
    }
  };

  const handleConfirm = async () => {
    setConfirmLoading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/voice/confirm`, {
        actionData: confirmModal.actionData,
        sessionId: SESSION_ID,
      });

      setConfirmModal({ visible: false, message: '', actionData: null });
      setResponse(res.data.response);
      if (res.data.audioUrl) {
        await playAudio(`${API_BASE_URL}${res.data.audioUrl}`);
      }
    } catch (err) {
      console.error('confirm error', err);
      setStatus('Erreur lors de la confirmation');
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleCancel = () => {
    setConfirmModal({ visible: false, message: '', actionData: null });
    setStatus('Action annulée. Appuie sur le micro pour parler.');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Assistant vocal</Text>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, isRecording && styles.dotRed, isPlaying && styles.dotGreen]} />
          <Text style={styles.statusText}>{status}</Text>
        </View>

        {transcript !== '' && (
          <View style={styles.bubble}>
            <Text style={styles.bubbleLabel}>Vous</Text>
            <Text style={styles.bubbleText}>{transcript}</Text>
          </View>
        )}

        {response !== '' && (
          <View style={[styles.bubble, styles.bubbleAssistant]}>
            <Text style={[styles.bubbleLabel, styles.bubbleLabelAssistant]}>Assistant</Text>
            <Text style={styles.bubbleTextAssistant}>{response}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.micArea}>
        <Text style={styles.hint}>
          {isRecording ? 'Relâche pour envoyer' : 'Maintiens pour parler'}
        </Text>
        <MicButton
          onPressIn={startRecording}
          onPressOut={stopRecordingAndProcess}
          isRecording={isRecording}
          disabled={isProcessing || isPlaying}
        />
      </View>

      <ConfirmModal
        visible={confirmModal.visible}
        message={confirmModal.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        loading={confirmLoading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 200,
  },
  title: {
    color: '#F1F5F9',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#334155',
    marginRight: 8,
  },
  dotRed: { backgroundColor: '#EF4444' },
  dotGreen: { backgroundColor: '#10B981' },
  statusText: {
    color: '#64748B',
    fontSize: 14,
  },
  bubble: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  bubbleAssistant: {
    borderColor: '#2563EB30',
    backgroundColor: '#172554',
  },
  bubbleLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  bubbleLabelAssistant: {
    color: '#3B82F6',
  },
  bubbleText: {
    color: '#CBD5E1',
    fontSize: 15,
    lineHeight: 22,
  },
  bubbleTextAssistant: {
    color: '#E2E8F0',
    fontSize: 15,
    lineHeight: 22,
  },
  micArea: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hint: {
    color: '#475569',
    fontSize: 13,
    marginBottom: 16,
  },
});
