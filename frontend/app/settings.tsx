import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  SafeAreaView,
  Platform,
  StatusBar,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useRouter } from 'expo-router';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface TwilioSettings {
  configured: boolean;
  enabled: boolean;
  id?: string;
  account_sid?: string;
  phone_number?: string;
  auth_token_masked?: string;
}

export default function Settings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [twilioSettings, setTwilioSettings] = useState<TwilioSettings>({
    configured: false,
    enabled: false,
  });
  
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/twilio/settings`);
      setTwilioSettings(response.data);
      
      if (response.data.configured) {
        setAccountSid(response.data.account_sid || '');
        setPhoneNumber(response.data.phone_number || '');
        setEnabled(response.data.enabled || false);
        // Don't set auth token - it's masked
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading settings:', error);
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!accountSid || !authToken || !phoneNumber) {
      Alert.alert('Error', 'Please fill in all Twilio credentials');
      return;
    }

    if (!accountSid.startsWith('AC')) {
      Alert.alert('Error', 'Account SID should start with "AC"');
      return;
    }

    if (!phoneNumber.startsWith('+')) {
      Alert.alert('Error', 'Phone number must be in E.164 format (e.g., +15551234567)');
      return;
    }

    setSaving(true);

    try {
      const response = await axios.post(`${BACKEND_URL}/api/twilio/settings`, {
        account_sid: accountSid,
        auth_token: authToken,
        phone_number: phoneNumber,
        enabled: enabled,
      });

      if (response.data.success) {
        Alert.alert('Success', 'Twilio settings saved successfully!');
        await loadSettings();
        // Clear auth token field for security
        setAuthToken('');
      }
    } catch (error: any) {
      console.error('Error saving settings:', error);
      const errorMsg = error.response?.data?.detail || 'Failed to save settings';
      Alert.alert('Error', errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const deleteSettings = async () => {
    Alert.alert(
      'Delete Twilio Settings',
      'Are you sure you want to delete your Twilio configuration?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${BACKEND_URL}/api/twilio/settings`);
              Alert.alert('Success', 'Twilio settings deleted');
              setAccountSid('');
              setAuthToken('');
              setPhoneNumber('');
              setEnabled(false);
              await loadSettings();
            } catch (error) {
              console.error('Error deleting settings:', error);
              Alert.alert('Error', 'Failed to delete settings');
            }
          },
        },
      ]
    );
  };

  const toggleEnabled = async (value: boolean) => {
    if (!twilioSettings.configured) {
      Alert.alert('Error', 'Please configure Twilio settings first');
      return;
    }

    try {
      await axios.patch(`${BACKEND_URL}/api/twilio/settings/toggle?enabled=${value}`);
      setEnabled(value);
      Alert.alert(
        'Success',
        `Twilio integration ${value ? 'enabled' : 'disabled'}`
      );
      await loadSettings();
    } catch (error: any) {
      console.error('Error toggling Twilio:', error);
      const errorMsg = error.response?.data?.detail || 'Failed to toggle Twilio';
      Alert.alert('Error', errorMsg);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00ff00" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#00ff00" />
          </TouchableOpacity>
          <Text style={styles.title}>SETTINGS</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          {/* Twilio Integration Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TWILIO INTEGRATION</Text>
            <Text style={styles.sectionSubtitle}>
              Connect your Twilio account to make real phone calls
            </Text>

            {twilioSettings.configured && (
              <View style={styles.statusCard}>
                <Ionicons
                  name={enabled ? 'checkmark-circle' : 'close-circle'}
                  size={24}
                  color={enabled ? '#00ff00' : '#ff0000'}
                />
                <Text style={[styles.statusText, { color: enabled ? '#00ff00' : '#ff0000' }]}>
                  {enabled ? 'ENABLED' : 'DISABLED'}
                </Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.label}>Account SID</Text>
              <TextInput
                style={styles.input}
                value={accountSid}
                onChangeText={setAccountSid}
                placeholder="AC..."
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.hint}>Found in your Twilio Console dashboard</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Auth Token</Text>
              <TextInput
                style={styles.input}
                value={authToken}
                onChangeText={setAuthToken}
                placeholder={twilioSettings.configured ? twilioSettings.auth_token_masked : 'Enter auth token'}
                placeholderTextColor="#666"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.hint}>
                {twilioSettings.configured
                  ? 'Leave blank to keep existing token'
                  : 'Found in your Twilio Console dashboard'}
              </Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Twilio Phone Number</Text>
              <TextInput
                style={styles.input}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="+15551234567"
                placeholderTextColor="#666"
                keyboardType="phone-pad"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.hint}>Your purchased Twilio number (E.164 format)</Text>
            </View>

            <View style={styles.formGroup}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Enable Real Calls</Text>
                  <Text style={styles.hint}>
                    When enabled, use Twilio for actual phone calls
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={toggleEnabled}
                  trackColor={{ false: '#333', true: '#00ff0044' }}
                  thumbColor={enabled ? '#00ff00' : '#666'}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={saveSettings}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <Ionicons name="save" size={20} color="#000" />
                  <Text style={styles.saveButtonText}>SAVE SETTINGS</Text>
                </>
              )}
            </TouchableOpacity>

            {twilioSettings.configured && (
              <TouchableOpacity style={styles.deleteButton} onPress={deleteSettings}>
                <Ionicons name="trash" size={20} color="#ff0000" />
                <Text style={styles.deleteButtonText}>DELETE SETTINGS</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* How to Get Credentials */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>HOW TO GET TWILIO CREDENTIALS</Text>
            
            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>1</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Create Twilio Account</Text>
                <Text style={styles.stepText}>
                  Visit twilio.com and create a free account. You'll get $10 credit to start.
                </Text>
              </View>
            </View>

            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>2</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Get Account SID & Auth Token</Text>
                <Text style={styles.stepText}>
                  Log in to console.twilio.com. Your Account SID and Auth Token are displayed on the dashboard.
                </Text>
              </View>
            </View>

            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>3</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Purchase Phone Number</Text>
                <Text style={styles.stepText}>
                  Go to Phone Numbers → Manage → Buy a Number. Select a number with Voice capability (~$1/month).
                </Text>
              </View>
            </View>

            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>4</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Enter Credentials Above</Text>
                <Text style={styles.stepText}>
                  Copy your credentials and phone number into the form above and save.
                </Text>
              </View>
            </View>
          </View>

          {/* Info Box */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={24} color="#00ff00" />
            <Text style={styles.infoText}>
              With Twilio disabled, the app works in simulator mode with authentic modem sounds. 
              Enable Twilio to make actual phone calls to ISPs.
            </Text>
          </View>
        </ScrollView>
      </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#00ff00',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00ff00',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00ff00',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00ff00',
    marginBottom: 16,
    gap: 12,
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00ff00',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  input: {
    backgroundColor: '#111',
    color: '#00ff00',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00ff00',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  saveButton: {
    backgroundColor: '#00ff00',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    gap: 12,
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  deleteButton: {
    backgroundColor: '#111',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff0000',
    gap: 12,
    marginTop: 12,
  },
  deleteButtonText: {
    color: '#ff0000',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  step: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#00ff00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    color: '#00ff00',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  stepText: {
    color: '#888',
    fontSize: 13,
    lineHeight: 18,
  },
  infoBox: {
    backgroundColor: '#111',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00ff00',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    color: '#0f0',
    fontSize: 13,
    lineHeight: 18,
  },
});
