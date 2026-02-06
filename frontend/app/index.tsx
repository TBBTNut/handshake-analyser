import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  SafeAreaView,
  Platform,
  StatusBar,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useRouter } from 'expo-router';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Protocol {
  name: string;
  speed: string;
  description: string;
}

interface ISPNumber {
  id: string;
  name: string;
  phone_number: string;
  country: string;
  active: boolean;
}

interface HandshakeStage {
  stage: number;
  name: string;
  description: string;
  frequency: number;
  duration: number;
  audio_base64: string;
}

interface DialResponse {
  session_id: string;
  protocol: string;
  phone_number: string;
  stages: HandshakeStage[];
  dial_tone_base64: string;
  estimated_duration: number;
}

export default function ModemEmulator() {
  const router = useRouter();
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [ispNumbers, setIspNumbers] = useState<ISPNumber[]>([]);
  const [selectedProtocol, setSelectedProtocol] = useState<string>('');
  const [selectedISP, setSelectedISP] = useState<ISPNumber | null>(null);
  const [customNumber, setCustomNumber] = useState<string>('');
  const [isDialing, setIsDialing] = useState<boolean>(false);
  const [currentStage, setCurrentStage] = useState<number>(0);
  const [handshakeStages, setHandshakeStages] = useState<HandshakeStage[]>([]);
  const [showISPModal, setShowISPModal] = useState<boolean>(false);
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('Ready');
  const [useTwilio, setUseTwilio] = useState<boolean>(false);
  const [twilioEnabled, setTwilioEnabled] = useState<boolean>(false);

  useEffect(() => {
    loadInitialData();
    setupAudio();
    
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  const setupAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });
    } catch (error) {
      console.error('Error setting up audio:', error);
    }
  };

  const loadInitialData = async () => {
    try {
      const [protocolsRes, ispRes, twilioRes] = await Promise.all([
        axios.get(`${BACKEND_URL}/api/protocols`),
        axios.get(`${BACKEND_URL}/api/isp-numbers`),
        axios.get(`${BACKEND_URL}/api/twilio/settings`),
      ]);
      
      setProtocols(protocolsRes.data.protocols);
      setIspNumbers(ispRes.data);
      
      if (twilioRes.data.configured && twilioRes.data.enabled) {
        setTwilioEnabled(true);
      }
      
      if (protocolsRes.data.protocols.length > 0) {
        setSelectedProtocol(protocolsRes.data.protocols[0].name);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load modem data');
      setLoading(false);
    }
  };

  const playAudioFromBase64 = async (base64Data: string) => {
    try {
      // Unload previous sound if exists
      if (sound) {
        await sound.unloadAsync();
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: `data:audio/wav;base64,${base64Data}` },
        { shouldPlay: true }
      );
      
      setSound(newSound);
      
      // Wait for playback to finish
      await new Promise((resolve) => {
        newSound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            resolve(true);
          }
        });
      });
      
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  const startDialing = async () => {
    const phoneNumber = selectedISP?.phone_number || customNumber;
    
    if (!phoneNumber) {
      Alert.alert('Error', 'Please select an ISP or enter a phone number');
      return;
    }
    
    if (!selectedProtocol) {
      Alert.alert('Error', 'Please select a protocol');
      return;
    }

    setIsDialing(true);
    setCurrentStage(0);
    setConnectionStatus('Dialing...');

    try {
      const response = await axios.post<DialResponse>(`${BACKEND_URL}/api/dial`, {
        protocol: selectedProtocol,
        phone_number: phoneNumber,
        isp_name: selectedISP?.name,
        use_twilio: useTwilio && twilioEnabled,
      });

      setHandshakeStages(response.data.stages);

      // Play dial tone
      setConnectionStatus(`Dialing ${phoneNumber}...`);
      await playAudioFromBase64(response.data.dial_tone_base64);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Play handshake stages
      for (let i = 0; i < response.data.stages.length; i++) {
        const stage = response.data.stages[i];
        setCurrentStage(i);
        setConnectionStatus(`${stage.name}: ${stage.description}`);
        
        if (stage.audio_base64) {
          await playAudioFromBase64(stage.audio_base64);
        }
        
        // Small delay between stages
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      setConnectionStatus('Connected!');
      Alert.alert('Success', `Connected using ${selectedProtocol}!`);
      
    } catch (error) {
      console.error('Error dialing:', error);
      Alert.alert('Error', 'Failed to establish connection');
      setConnectionStatus('Connection failed');
    } finally {
      setIsDialing(false);
    }
  };

  const stopDialing = async () => {
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
      setSound(null);
    }
    setIsDialing(false);
    setCurrentStage(0);
    setHandshakeStages([]);
    setConnectionStatus('Disconnected');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00ff00" />
        <Text style={styles.loadingText}>Initializing Modem...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="hardware-chip" size={32} color="#00ff00" />
            <View>
              <Text style={styles.title}>MODEM EMULATOR</Text>
              <Text style={styles.subtitle}>Protocol Analyzer & Dialer</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => router.push('/settings')}
          >
            <Ionicons name="settings" size={28} color="#00ff00" />
          </TouchableOpacity>
        </View>

        {/* Connection Status */}
        <View style={styles.statusBar}>
          <View style={[styles.statusIndicator, { backgroundColor: isDialing ? '#00ff00' : '#666' }]} />
          <Text style={styles.statusText}>{connectionStatus}</Text>
        </View>

        {/* Protocol Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SELECT PROTOCOL</Text>
          <View style={styles.protocolGrid}>
            {protocols.map((protocol) => (
              <TouchableOpacity
                key={protocol.name}
                style={[
                  styles.protocolCard,
                  selectedProtocol === protocol.name && styles.protocolCardSelected,
                ]}
                onPress={() => setSelectedProtocol(protocol.name)}
                disabled={isDialing}
              >
                <Text style={styles.protocolName}>{protocol.name}</Text>
                <Text style={styles.protocolSpeed}>{protocol.speed}</Text>
                <Text style={styles.protocolDesc}>{protocol.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ISP Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PHONE NUMBER</Text>
          
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => setShowISPModal(true)}
            disabled={isDialing}
          >
            <Ionicons name="list" size={20} color="#00ff00" />
            <Text style={styles.selectButtonText}>
              {selectedISP ? `${selectedISP.name} (${selectedISP.phone_number})` : 'Select ISP'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => setShowCustomModal(true)}
            disabled={isDialing}
          >
            <Ionicons name="create" size={20} color="#00ff00" />
            <Text style={styles.selectButtonText}>
              {customNumber ? `Custom: ${customNumber}` : 'Enter Custom Number'}
            </Text>
          </TouchableOpacity>

          {twilioEnabled && (
            <View style={styles.toggleContainer}>
              <View style={styles.toggleInfo}>
                <Ionicons name="call" size={20} color="#00ff00" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.toggleLabel}>Real Phone Call Mode</Text>
                  <Text style={styles.toggleHint}>
                    {useTwilio ? 'Using Twilio (actual call)' : 'Using simulator (audio only)'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.toggleButton, useTwilio && styles.toggleButtonActive]}
                onPress={() => setUseTwilio(!useTwilio)}
                disabled={isDialing}
              >
                <Text style={[styles.toggleButtonText, useTwilio && styles.toggleButtonTextActive]}>
                  {useTwilio ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Handshake Analysis */}
        {handshakeStages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>HANDSHAKE ANALYSIS</Text>
            <View style={styles.stagesContainer}>
              {handshakeStages.map((stage, index) => (
                <View
                  key={stage.stage}
                  style={[
                    styles.stageRow,
                    index === currentStage && isDialing && styles.stageRowActive,
                    index < currentStage && styles.stageRowComplete,
                  ]}
                >
                  <View style={styles.stageNumber}>
                    <Text style={styles.stageNumberText}>{stage.stage}</Text>
                  </View>
                  <View style={styles.stageInfo}>
                    <Text style={styles.stageName}>{stage.name}</Text>
                    <Text style={styles.stageDesc}>{stage.description}</Text>
                    <View style={styles.stageDetails}>
                      <Text style={styles.stageDetailText}>
                        Freq: {stage.frequency}Hz | Duration: {stage.duration.toFixed(2)}s
                      </Text>
                    </View>
                  </View>
                  {index === currentStage && isDialing && (
                    <ActivityIndicator size="small" color="#00ff00" />
                  )}
                  {index < currentStage && (
                    <Ionicons name="checkmark-circle" size={24} color="#00ff00" />
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Dial Button */}
        <View style={styles.dialSection}>
          {!isDialing ? (
            <TouchableOpacity style={styles.dialButton} onPress={startDialing}>
              <Ionicons name="call" size={32} color="#000" />
              <Text style={styles.dialButtonText}>DIAL</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.stopButton} onPress={stopDialing}>
              <Ionicons name="stop" size={32} color="#fff" />
              <Text style={styles.stopButtonText}>STOP</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ISP Modal */}
        <Modal
          visible={showISPModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowISPModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select ISP</Text>
                <TouchableOpacity onPress={() => setShowISPModal(false)}>
                  <Ionicons name="close" size={28} color="#00ff00" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalScroll}>
                {ispNumbers.map((isp) => (
                  <TouchableOpacity
                    key={isp.id}
                    style={styles.ispItem}
                    onPress={() => {
                      setSelectedISP(isp);
                      setCustomNumber('');
                      setShowISPModal(false);
                    }}
                  >
                    <View>
                      <Text style={styles.ispName}>{isp.name}</Text>
                      <Text style={styles.ispNumber}>{isp.phone_number}</Text>
                      <Text style={styles.ispCountry}>{isp.country}</Text>
                    </View>
                    {selectedISP?.id === isp.id && (
                      <Ionicons name="checkmark-circle" size={24} color="#00ff00" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Custom Number Modal */}
        <Modal
          visible={showCustomModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowCustomModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Enter Phone Number</Text>
                <TouchableOpacity onPress={() => setShowCustomModal(false)}>
                  <Ionicons name="close" size={28} color="#00ff00" />
                </TouchableOpacity>
              </View>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={customNumber}
                  onChangeText={setCustomNumber}
                  placeholder="Enter phone number"
                  placeholderTextColor="#666"
                  keyboardType="phone-pad"
                />
                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={() => {
                    if (customNumber) {
                      setSelectedISP(null);
                      setShowCustomModal(false);
                    } else {
                      Alert.alert('Error', 'Please enter a phone number');
                    }
                  }}
                >
                  <Text style={styles.submitButtonText}>SET NUMBER</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  contentContainer: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#00ff00',
    fontSize: 16,
    marginTop: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#00ff00',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsButton: {
    padding: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00ff00',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  subtitle: {
    fontSize: 12,
    color: '#0f0',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#111',
    borderRadius: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#00ff00',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusText: {
    color: '#00ff00',
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00ff00',
    marginBottom: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  protocolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  protocolCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: '#111',
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#333',
  },
  protocolCardSelected: {
    borderColor: '#00ff00',
    backgroundColor: '#001100',
  },
  protocolName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00ff00',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  protocolSpeed: {
    fontSize: 16,
    color: '#0f0',
    marginBottom: 4,
  },
  protocolDesc: {
    fontSize: 12,
    color: '#888',
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00ff00',
    marginBottom: 12,
  },
  selectButtonText: {
    color: '#00ff00',
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  stagesContainer: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#00ff00',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#000',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333',
  },
  stageRowActive: {
    borderColor: '#00ff00',
    backgroundColor: '#001100',
  },
  stageRowComplete: {
    opacity: 0.6,
  },
  stageNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#00ff00',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stageNumberText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  stageInfo: {
    flex: 1,
  },
  stageName: {
    color: '#00ff00',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  stageDesc: {
    color: '#0f0',
    fontSize: 12,
    marginBottom: 4,
  },
  stageDetails: {
    marginTop: 4,
  },
  stageDetailText: {
    color: '#888',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  dialSection: {
    marginTop: 24,
    marginBottom: 32,
  },
  dialButton: {
    backgroundColor: '#00ff00',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    borderRadius: 12,
    gap: 12,
  },
  dialButtonText: {
    color: '#000',
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  stopButton: {
    backgroundColor: '#ff0000',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    borderRadius: 12,
    gap: 12,
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    borderWidth: 2,
    borderColor: '#00ff00',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#00ff00',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#00ff00',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  modalScroll: {
    maxHeight: 400,
  },
  ispItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  ispName: {
    color: '#00ff00',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  ispNumber: {
    color: '#0f0',
    fontSize: 14,
    marginBottom: 2,
  },
  ispCountry: {
    color: '#888',
    fontSize: 12,
  },
  inputContainer: {
    padding: 20,
  },
  input: {
    backgroundColor: '#000',
    color: '#00ff00',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00ff00',
    fontSize: 16,
    marginBottom: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  submitButton: {
    backgroundColor: '#00ff00',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  toggleContainer: {
    backgroundColor: '#111',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00ff00',
    marginTop: 12,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  toggleLabel: {
    color: '#00ff00',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  toggleHint: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  toggleButton: {
    backgroundColor: '#333',
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#666',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#00ff00',
    borderColor: '#00ff00',
  },
  toggleButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  toggleButtonTextActive: {
    color: '#000',
  },
});
