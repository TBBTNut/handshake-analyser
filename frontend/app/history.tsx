import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Platform,
  StatusBar,
  RefreshControl,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useRouter } from 'expo-router';
import Share from 'react-native-share';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface ConnectionHistory {
  id: string;
  session_id: string;
  protocol: string;
  phone_number: string;
  isp_name?: string;
  mode: string;
  status: string;
  started_at: string;
  completed_at?: string;
  duration?: number;
  stages_completed: number;
  total_stages: number;
  twilio_call_sid?: string;
  recording_url?: string;
  handshake_data?: any;
}

export default function History() {
  const router = useRouter();
  const [history, setHistory] = useState<ConnectionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ConnectionHistory | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/history?limit=100`);
      setHistory(response.data.entries);
      setLoading(false);
      setRefreshing(false);
    } catch (error) {
      console.error('Error loading history:', error);
      Alert.alert('Error', 'Failed to load connection history');
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const exportHandshake = async (sessionId: string, format: 'json' | 'csv') => {
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/history/${sessionId}/export?format=${format}`,
        format === 'csv' ? { responseType: 'text' } : {}
      );

      const fileName = `handshake_${sessionId}.${format}`;
      const content = format === 'json' ? JSON.stringify(response.data, null, 2) : response.data;

      // Share the file
      await Share.open({
        title: `Export Handshake Data`,
        message: `Handshake data for session ${sessionId}`,
        url: `data:${format === 'json' ? 'application/json' : 'text/csv'};base64,${btoa(content)}`,
        filename: fileName,
      });
    } catch (error: any) {
      if (error.message !== 'User did not share') {
        console.error('Error exporting handshake:', error);
        Alert.alert('Error', 'Failed to export handshake data');
      }
    }
  };

  const deleteEntry = async (sessionId: string) => {
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this history entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${BACKEND_URL}/api/history/${sessionId}`);
              Alert.alert('Success', 'History entry deleted');
              loadHistory();
            } catch (error) {
              console.error('Error deleting entry:', error);
              Alert.alert('Error', 'Failed to delete history entry');
            }
          },
        },
      ]
    );
  };

  const clearAllHistory = () => {
    Alert.alert(
      'Clear All History',
      'Are you sure you want to delete all connection history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${BACKEND_URL}/api/history`);
              Alert.alert('Success', 'All history cleared');
              loadHistory();
            } catch (error) {
              console.error('Error clearing history:', error);
              Alert.alert('Error', 'Failed to clear history');
            }
          },
        },
      ]
    );
  };

  const viewDetails = (entry: ConnectionHistory) => {
    setSelectedEntry(entry);
    setShowDetailModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return '#00ff00';
      case 'failed':
        return '#ff0000';
      case 'in_progress':
        return '#ffff00';
      default:
        return '#888';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return 'checkmark-circle';
      case 'failed':
        return 'close-circle';
      case 'in_progress':
        return 'time';
      default:
        return 'help-circle';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00ff00" />
        <Text style={styles.loadingText}>Loading history...</Text>
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
          <Text style={styles.title}>CONNECTION HISTORY</Text>
          <TouchableOpacity onPress={clearAllHistory} style={styles.clearButton}>
            <Ionicons name="trash" size={24} color="#ff0000" />
          </TouchableOpacity>
        </View>

        {/* History List */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#00ff00"
              colors={['#00ff00']}
            />
          }
        >
          {history.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="file-tray-outline" size={64} color="#333" />
              <Text style={styles.emptyText}>No connection history yet</Text>
              <Text style={styles.emptySubtext}>Your dial attempts will appear here</Text>
            </View>
          ) : (
            history.map((entry) => (
              <View key={entry.session_id} style={styles.historyCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Ionicons
                      name={getStatusIcon(entry.status)}
                      size={24}
                      color={getStatusColor(entry.status)}
                    />
                    <View style={styles.cardHeaderText}>
                      <Text style={styles.cardProtocol}>{entry.protocol}</Text>
                      <Text style={styles.cardMode}>
                        {entry.mode === 'real_call' ? '📞 Real Call' : '🔊 Simulator'}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.cardStatus, { color: getStatusColor(entry.status) }]}>
                    {entry.status.toUpperCase()}
                  </Text>
                </View>

                <View style={styles.cardContent}>
                  <View style={styles.cardRow}>
                    <Ionicons name="call" size={16} color="#888" />
                    <Text style={styles.cardLabel}>Phone:</Text>
                    <Text style={styles.cardValue}>{entry.phone_number}</Text>
                  </View>

                  {entry.isp_name && (
                    <View style={styles.cardRow}>
                      <Ionicons name="business" size={16} color="#888" />
                      <Text style={styles.cardLabel}>ISP:</Text>
                      <Text style={styles.cardValue}>{entry.isp_name}</Text>
                    </View>
                  )}

                  <View style={styles.cardRow}>
                    <Ionicons name="time" size={16} color="#888" />
                    <Text style={styles.cardLabel}>Started:</Text>
                    <Text style={styles.cardValue}>{formatDate(entry.started_at)}</Text>
                  </View>

                  {entry.duration && (
                    <View style={styles.cardRow}>
                      <Ionicons name="hourglass" size={16} color="#888" />
                      <Text style={styles.cardLabel}>Duration:</Text>
                      <Text style={styles.cardValue}>{formatDuration(entry.duration)}</Text>
                    </View>
                  )}

                  <View style={styles.cardRow}>
                    <Ionicons name="layers" size={16} color="#888" />
                    <Text style={styles.cardLabel}>Stages:</Text>
                    <Text style={styles.cardValue}>
                      {entry.stages_completed}/{entry.total_stages}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => viewDetails(entry)}
                  >
                    <Ionicons name="eye" size={16} color="#00ff00" />
                    <Text style={styles.actionButtonText}>Details</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => exportHandshake(entry.session_id, 'json')}
                  >
                    <Ionicons name="document-text" size={16} color="#00ff00" />
                    <Text style={styles.actionButtonText}>JSON</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => exportHandshake(entry.session_id, 'csv')}
                  >
                    <Ionicons name="table" size={16} color="#00ff00" />
                    <Text style={styles.actionButtonText}>CSV</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => deleteEntry(entry.session_id)}
                  >
                    <Ionicons name="trash" size={16} color="#ff0000" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* Detail Modal */}
        <Modal
          visible={showDetailModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDetailModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Connection Details</Text>
                <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                  <Ionicons name="close" size={28} color="#00ff00" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll}>
                {selectedEntry && (
                  <>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>GENERAL INFO</Text>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Session ID:</Text>
                        <Text style={styles.detailValue}>{selectedEntry.session_id}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Protocol:</Text>
                        <Text style={styles.detailValue}>{selectedEntry.protocol}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Mode:</Text>
                        <Text style={styles.detailValue}>{selectedEntry.mode}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Status:</Text>
                        <Text
                          style={[
                            styles.detailValue,
                            { color: getStatusColor(selectedEntry.status) },
                          ]}
                        >
                          {selectedEntry.status}
                        </Text>
                      </View>
                    </View>

                    {selectedEntry.handshake_data?.stages && (
                      <View style={styles.detailSection}>
                        <Text style={styles.detailSectionTitle}>HANDSHAKE STAGES</Text>
                        {selectedEntry.handshake_data.stages.map((stage: any) => (
                          <View key={stage.stage} style={styles.stageDetail}>
                            <View style={styles.stageNumber}>
                              <Text style={styles.stageNumberText}>{stage.stage}</Text>
                            </View>
                            <View style={styles.stageInfo}>
                              <Text style={styles.stageName}>{stage.name}</Text>
                              <Text style={styles.stageDesc}>{stage.description}</Text>
                              <Text style={styles.stageFreq}>
                                {stage.frequency}Hz • {stage.duration}s
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
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
  clearButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    marginTop: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  historyCard: {
    backgroundColor: '#111',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00ff00',
    marginBottom: 16,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#001100',
    borderBottomWidth: 1,
    borderBottomColor: '#00ff00',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardHeaderText: {
    gap: 4,
  },
  cardProtocol: {
    color: '#00ff00',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  cardMode: {
    color: '#0f0',
    fontSize: 12,
  },
  cardStatus: {
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  cardContent: {
    padding: 12,
    gap: 8,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardLabel: {
    color: '#888',
    fontSize: 12,
    width: 70,
  },
  cardValue: {
    color: '#0f0',
    fontSize: 12,
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    gap: 6,
    borderRightWidth: 1,
    borderRightColor: '#222',
  },
  actionButtonText: {
    color: '#00ff00',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  deleteButton: {
    borderRightWidth: 0,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
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
    maxHeight: 600,
  },
  detailSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00ff00',
    marginBottom: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 8,
    gap: 8,
  },
  detailLabel: {
    color: '#888',
    fontSize: 13,
    width: 100,
  },
  detailValue: {
    color: '#0f0',
    fontSize: 13,
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  stageDetail: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
  },
  stageNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#00ff00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stageNumberText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
  },
  stageInfo: {
    flex: 1,
  },
  stageName: {
    color: '#00ff00',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  stageDesc: {
    color: '#0f0',
    fontSize: 11,
    marginBottom: 2,
  },
  stageFreq: {
    color: '#888',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
